import { jest } from '@jest/globals';
import { AgentState } from '../../src/types/index.js';
import {
  StateMachine,
  createDefaultTransitions,
  type StateMachineConfig,
} from '../../src/core/state-machine.js';

function createTestMachine(overrides?: Partial<StateMachineConfig>): StateMachine {
  return new StateMachine({
    transitions: createDefaultTransitions(),
    ...overrides,
  });
}

describe('StateMachine', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = createTestMachine();
  });

  afterEach(() => {
    sm.destroy();
  });

  describe('initialization', () => {
    it('starts in IDLE state by default', () => {
      expect(sm.getState()).toBe(AgentState.IDLE);
    });

    it('accepts a custom initial state', () => {
      const custom = createTestMachine({ initialState: AgentState.MAINTENANCE });
      expect(custom.getState()).toBe(AgentState.MAINTENANCE);
      custom.destroy();
    });

    it('has empty history on creation', () => {
      expect(sm.getHistory()).toHaveLength(0);
    });
  });

  describe('transitions', () => {
    it('transitions IDLE -> PROCESSING on event_received', async () => {
      await sm.transition('event_received');
      expect(sm.getState()).toBe(AgentState.PROCESSING);
    });

    it('transitions PROCESSING -> EXECUTING on action_planned', async () => {
      await sm.transition('event_received');
      await sm.transition('action_planned');
      expect(sm.getState()).toBe(AgentState.EXECUTING);
    });

    it('transitions back to IDLE on task_complete', async () => {
      await sm.transition('event_received');
      await sm.transition('task_complete');
      expect(sm.getState()).toBe(AgentState.IDLE);
    });

    it('records transition history', async () => {
      await sm.transition('event_received');
      await sm.transition('task_complete');

      const history = sm.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]!.from).toBe(AgentState.IDLE);
      expect(history[0]!.to).toBe(AgentState.PROCESSING);
      expect(history[1]!.from).toBe(AgentState.PROCESSING);
      expect(history[1]!.to).toBe(AgentState.IDLE);
    });

    it('throws on invalid trigger from current state', async () => {
      await expect(sm.transition('task_complete')).rejects.toThrow(
        /No transition for trigger "task_complete" from state "idle"/,
      );
    });

    it('throws on reentrant transitions', async () => {
      let reentrantMachine: StateMachine;
      reentrantMachine = new StateMachine({
        transitions: [
          {
            from: AgentState.IDLE,
            to: AgentState.PROCESSING,
            trigger: 'start',
            action: async () => {
              await reentrantMachine.transition('start');
            },
          },
        ],
      });

      await expect(reentrantMachine.transition('start')).rejects.toThrow(/Reentrant transition blocked/);
      reentrantMachine.destroy();
    });
  });

  describe('guard conditions', () => {
    it('blocks transition when guard returns false', async () => {
      const guarded = new StateMachine({
        transitions: [
          {
            from: AgentState.IDLE,
            to: AgentState.PROCESSING,
            trigger: 'start',
            guard: () => false,
          },
        ],
      });

      await guarded.transition('start');
      expect(guarded.getState()).toBe(AgentState.IDLE);
      guarded.destroy();
    });

    it('allows transition when guard returns true', async () => {
      const guarded = new StateMachine({
        transitions: [
          {
            from: AgentState.IDLE,
            to: AgentState.PROCESSING,
            trigger: 'start',
            guard: () => true,
          },
        ],
      });

      await guarded.transition('start');
      expect(guarded.getState()).toBe(AgentState.PROCESSING);
      guarded.destroy();
    });

    it('supports async guards', async () => {
      const guarded = new StateMachine({
        transitions: [
          {
            from: AgentState.IDLE,
            to: AgentState.PROCESSING,
            trigger: 'start',
            guard: async () => {
              await new Promise((r) => setTimeout(r, 10));
              return true;
            },
          },
        ],
      });

      await guarded.transition('start');
      expect(guarded.getState()).toBe(AgentState.PROCESSING);
      guarded.destroy();
    });
  });

  describe('event emission', () => {
    it('emits state:enter on entering new state', async () => {
      const handler = jest.fn();
      sm.on('state:enter', handler);

      await sm.transition('event_received');

      expect(handler).toHaveBeenCalledWith(AgentState.PROCESSING, 'event_received');
    });

    it('emits state:exit on leaving state', async () => {
      const handler = jest.fn();
      sm.on('state:exit', handler);

      await sm.transition('event_received');

      expect(handler).toHaveBeenCalledWith(AgentState.IDLE, 'event_received');
    });

    it('emits state:transition with from, to, trigger', async () => {
      const handler = jest.fn();
      sm.on('state:transition', handler);

      await sm.transition('event_received');

      expect(handler).toHaveBeenCalledWith(AgentState.IDLE, AgentState.PROCESSING, 'event_received');
    });
  });

  describe('error recovery', () => {
    it('transitions to ERROR state when action throws', async () => {
      const errorMachine = new StateMachine({
        transitions: [
          {
            from: AgentState.IDLE,
            to: AgentState.PROCESSING,
            trigger: 'start',
            action: async () => {
              throw new Error('Action failed');
            },
          },
          {
            from: AgentState.ERROR,
            to: AgentState.IDLE,
            trigger: 'error_recovered',
          },
        ],
      });

      await expect(errorMachine.transition('start')).rejects.toThrow('Action failed');
      expect(errorMachine.getState()).toBe(AgentState.ERROR);

      await errorMachine.transition('error_recovered');
      expect(errorMachine.getState()).toBe(AgentState.IDLE);

      errorMachine.destroy();
    });

    it('emits state:error on action failure', async () => {
      const handler = jest.fn();
      const errorMachine = new StateMachine({
        transitions: [
          {
            from: AgentState.IDLE,
            to: AgentState.PROCESSING,
            trigger: 'start',
            action: () => {
              throw new Error('boom');
            },
          },
        ],
      });
      errorMachine.on('state:error', handler);

      await expect(errorMachine.transition('start')).rejects.toThrow('boom');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0]).toBeInstanceOf(Error);

      errorMachine.destroy();
    });
  });

  describe('forceState', () => {
    it('sets state without transition rules', () => {
      sm.forceState(AgentState.MAINTENANCE, 'test');
      expect(sm.getState()).toBe(AgentState.MAINTENANCE);
    });

    it('emits state:transition on force', () => {
      const handler = jest.fn();
      sm.on('state:transition', handler);

      sm.forceState(AgentState.ERROR, 'emergency');

      expect(handler).toHaveBeenCalledWith(AgentState.IDLE, AgentState.ERROR, 'force:emergency');
    });
  });

  describe('canTransition', () => {
    it('returns true for valid triggers', () => {
      expect(sm.canTransition('event_received')).toBe(true);
    });

    it('returns false for invalid triggers', () => {
      expect(sm.canTransition('nonexistent_trigger')).toBe(false);
    });
  });

  describe('getValidTriggers', () => {
    it('returns triggers valid from current state', () => {
      const triggers = sm.getValidTriggers();
      expect(triggers).toContain('event_received');
      expect(triggers).toContain('maintenance_requested');
      expect(triggers).not.toContain('action_planned');
    });
  });

  describe('deadlock detection', () => {
    it('emits state:deadlock after timeout in active state', async () => {
      const handler = jest.fn();
      const fastTimeout = new StateMachine({
        transitions: createDefaultTransitions(),
        deadlockTimeout: 50,
      });
      fastTimeout.on('state:deadlock', handler);

      await fastTimeout.transition('event_received');

      await new Promise((r) => setTimeout(r, 100));

      expect(handler).toHaveBeenCalledWith(AgentState.PROCESSING, expect.any(Number));

      fastTimeout.destroy();
    });

    it('does not trigger deadlock in IDLE state', async () => {
      const handler = jest.fn();
      const fastTimeout = new StateMachine({
        transitions: createDefaultTransitions(),
        deadlockTimeout: 50,
      });
      fastTimeout.on('state:deadlock', handler);

      await new Promise((r) => setTimeout(r, 100));

      expect(handler).not.toHaveBeenCalled();

      fastTimeout.destroy();
    });
  });

  describe('validation', () => {
    it('throws on duplicate from+trigger combinations', () => {
      expect(
        () =>
          new StateMachine({
            transitions: [
              { from: AgentState.IDLE, to: AgentState.PROCESSING, trigger: 'start' },
              { from: AgentState.IDLE, to: AgentState.ERROR, trigger: 'start' },
            ],
          }),
      ).toThrow(/Duplicate transition/);
    });
  });
});
