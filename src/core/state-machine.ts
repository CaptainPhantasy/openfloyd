/**
 * OPEN-FLOYD State Machine
 *
 * Finite state machine with:
 * - Typed event emission for state transitions
 * - Guard conditions on transitions
 * - Deadlock detection via configurable timeout
 * - Transition history for debugging
 * - Async action execution on transitions
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { AgentState, type StateTransition, type StateMachineEvents } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('state-machine');

/** Maximum number of transition history entries to retain. */
const MAX_HISTORY = 100;

/** Default deadlock timeout: 5 minutes in a single state. */
const DEFAULT_DEADLOCK_TIMEOUT_MS = 5 * 60 * 1000;

export interface StateMachineConfig {
  initialState?: AgentState;
  deadlockTimeout?: number;
  transitions: StateTransition[];
}

interface TransitionRecord {
  id: string;
  from: AgentState;
  to: AgentState;
  trigger: string;
  timestamp: Date;
  duration_ms: number;
}

class StateMachineEmitter {
  private emitter = new EventEmitter();

  on<K extends keyof StateMachineEvents>(
    event: K,
    listener: StateMachineEvents[K],
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof StateMachineEvents>(
    event: K,
    listener: StateMachineEvents[K],
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<K extends keyof StateMachineEvents>(
    event: K,
    listener: StateMachineEvents[K],
  ): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  protected emitEvent<K extends keyof StateMachineEvents>(
    event: K,
    ...args: Parameters<StateMachineEvents[K]>
  ): boolean {
    return this.emitter.emit(event, ...args);
  }

  removeAllListeners<K extends keyof StateMachineEvents>(event?: K): this {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }
}

export class StateMachine extends StateMachineEmitter {
  private currentState: AgentState;
  private transitions: StateTransition[];
  private history: TransitionRecord[] = [];
  private deadlockTimer: ReturnType<typeof setTimeout> | null = null;
  private deadlockTimeout: number;
  private stateEnteredAt: Date;
  private transitioning = false;

  constructor(config: StateMachineConfig) {
    super();
    this.currentState = config.initialState ?? AgentState.IDLE;
    this.transitions = config.transitions;
    this.deadlockTimeout = config.deadlockTimeout ?? DEFAULT_DEADLOCK_TIMEOUT_MS;
    this.stateEnteredAt = new Date();

    this.validateTransitions();
    this.resetDeadlockTimer();

    log.info(
      { state: this.currentState, transitions: this.transitions.length },
      'State machine initialized',
    );
  }

  /** Get the current state of the agent. */
  getState(): AgentState {
    return this.currentState;
  }

  /** Get transition history (most recent first). */
  getHistory(): readonly TransitionRecord[] {
    return [...this.history];
  }

  /** Get time spent in current state (milliseconds). */
  getStateAge(): number {
    return Date.now() - this.stateEnteredAt.getTime();
  }

  /** Check whether a specific transition is valid from the current state. */
  canTransition(trigger: string): boolean {
    return this.transitions.some((t) => t.from === this.currentState && t.trigger === trigger);
  }

  /** Get all valid triggers from the current state. */
  getValidTriggers(): string[] {
    return this.transitions
      .filter((t) => t.from === this.currentState)
      .map((t) => t.trigger);
  }

  /**
   * Attempt a state transition.
   *
   * @param trigger - The event/action that triggers this transition.
   * @throws If no valid transition exists for the current state + trigger.
   * @throws If a transition is already in progress (prevents reentrant transitions).
   */
  async transition(trigger: string): Promise<void> {
    if (this.transitioning) {
      throw new Error(
        `Reentrant transition blocked: already transitioning, received trigger "${trigger}"`,
      );
    }

    const match = this.transitions.find(
      (t) => t.from === this.currentState && t.trigger === trigger,
    );

    if (!match) {
      const valid = this.getValidTriggers();
      throw new Error(
        `No transition for trigger "${trigger}" from state "${this.currentState}". ` +
          `Valid triggers: [${valid.join(', ')}]`,
      );
    }

    // Evaluate guard condition
    if (match.guard) {
      const allowed = await match.guard();
      if (!allowed) {
        log.debug(
          { from: this.currentState, trigger },
          'Transition blocked by guard condition',
        );
        return;
      }
    }

    this.transitioning = true;
    const transitionStart = Date.now();
    const previousState = this.currentState;

    try {
      // Exit current state
      this.emitEvent('state:exit', previousState, trigger);

      // Execute transition action
      if (match.action) {
        await match.action();
      }

      // Enter new state
      this.currentState = match.to;
      this.stateEnteredAt = new Date();
      this.resetDeadlockTimer();

      // Record history
      const record: TransitionRecord = {
        id: randomUUID(),
        from: previousState,
        to: match.to,
        trigger,
        timestamp: new Date(),
        duration_ms: Date.now() - transitionStart,
      };
      this.history.push(record);
      if (this.history.length > MAX_HISTORY) {
        this.history.shift();
      }

      log.info(
        { from: previousState, to: match.to, trigger, duration_ms: record.duration_ms },
        'State transition completed',
      );

      this.emitEvent('state:enter', match.to, trigger);
      this.emitEvent('state:transition', previousState, match.to, trigger);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ err, from: previousState, trigger }, 'Transition action failed');

      // Attempt recovery: move to ERROR state if possible
      if (this.currentState !== AgentState.ERROR) {
        this.currentState = AgentState.ERROR;
        this.stateEnteredAt = new Date();
        this.resetDeadlockTimer();
        this.emitEvent('state:enter', AgentState.ERROR, 'error_recovery');
      }

      this.emitEvent('state:error', err, previousState);
      throw err;
    } finally {
      this.transitioning = false;
    }
  }

  /**
   * Force state without following transition rules (emergency use only).
   * Logs a warning. Use `transition()` for normal state changes.
   */
  forceState(state: AgentState, reason: string): void {
    log.warn(
      { from: this.currentState, to: state, reason },
      'Forced state change (bypassing transitions)',
    );
    const previous = this.currentState;
    this.currentState = state;
    this.stateEnteredAt = new Date();
    this.resetDeadlockTimer();
    this.emitEvent('state:transition', previous, state, `force:${reason}`);
  }

  /** Clean up timers. Call when shutting down. */
  destroy(): void {
    if (this.deadlockTimer) {
      clearTimeout(this.deadlockTimer);
      this.deadlockTimer = null;
    }
    this.removeAllListeners();
    log.info('State machine destroyed');
  }

  // ────────────────────────────────────────────────────────────
  // Private
  // ────────────────────────────────────────────────────────────

  private resetDeadlockTimer(): void {
    if (this.deadlockTimer) {
      clearTimeout(this.deadlockTimer);
    }

    // Don't set deadlock timer for terminal/resting states
    if (this.currentState === AgentState.IDLE || this.currentState === AgentState.MAINTENANCE) {
      this.deadlockTimer = null;
      return;
    }

    this.deadlockTimer = setTimeout(() => {
      const elapsed = this.getStateAge();
      log.warn(
        { state: this.currentState, elapsed_ms: elapsed },
        'Potential deadlock detected',
      );
      this.emitEvent('state:deadlock', this.currentState, elapsed);
    }, this.deadlockTimeout);

    // Don't prevent Node.js from exiting
    this.deadlockTimer.unref();
  }

  private validateTransitions(): void {
    // Ensure every state (except ERROR) has at least one outgoing transition
    const statesWithOutgoing = new Set(this.transitions.map((t) => t.from));
    const allStates = Object.values(AgentState);

    for (const state of allStates) {
      if (state === AgentState.ERROR && !statesWithOutgoing.has(state)) {
        // ERROR state is allowed to have no outgoing transitions — it's a sink
        continue;
      }
      if (!statesWithOutgoing.has(state)) {
        log.warn({ state }, 'State has no outgoing transitions (potential dead-end)');
      }
    }

    // Check for duplicate from+trigger combinations
    const seen = new Set<string>();
    for (const t of this.transitions) {
      const key = `${t.from}:${t.trigger}`;
      if (seen.has(key)) {
        throw new Error(
          `Duplicate transition: state "${t.from}" + trigger "${t.trigger}" is defined more than once`,
        );
      }
      seen.add(key);
    }
  }
}

/**
 * Default transition table for the OPEN-FLOYD agent.
 * Covers the standard lifecycle: IDLE → PROCESSING → EXECUTING → IDLE
 * with error recovery and maintenance paths.
 */
export function createDefaultTransitions(): StateTransition[] {
  return [
    // Normal flow
    { from: AgentState.IDLE, to: AgentState.PROCESSING, trigger: 'event_received' },
    { from: AgentState.PROCESSING, to: AgentState.EXECUTING, trigger: 'action_planned' },
    { from: AgentState.EXECUTING, to: AgentState.PROCESSING, trigger: 'tool_result_received' },
    { from: AgentState.PROCESSING, to: AgentState.IDLE, trigger: 'task_complete' },
    { from: AgentState.EXECUTING, to: AgentState.IDLE, trigger: 'execution_complete' },

    // Awaiting input
    { from: AgentState.PROCESSING, to: AgentState.AWAITING_INPUT, trigger: 'input_required' },
    { from: AgentState.AWAITING_INPUT, to: AgentState.PROCESSING, trigger: 'input_received' },
    { from: AgentState.AWAITING_INPUT, to: AgentState.IDLE, trigger: 'input_timeout' },

    // Error handling
    { from: AgentState.PROCESSING, to: AgentState.ERROR, trigger: 'processing_error' },
    { from: AgentState.EXECUTING, to: AgentState.ERROR, trigger: 'execution_error' },
    { from: AgentState.ERROR, to: AgentState.IDLE, trigger: 'error_recovered' },
    { from: AgentState.ERROR, to: AgentState.MAINTENANCE, trigger: 'critical_failure' },

    // Maintenance
    { from: AgentState.IDLE, to: AgentState.MAINTENANCE, trigger: 'maintenance_requested' },
    { from: AgentState.MAINTENANCE, to: AgentState.IDLE, trigger: 'maintenance_complete' },
  ];
}
