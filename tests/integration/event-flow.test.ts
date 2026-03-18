import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { AgentState, EventPriority, EventSourceType, type AgentEvent, type EventSource } from '../../src/types/index.js';
import { StateMachine, createDefaultTransitions } from '../../src/core/state-machine.js';
import { EventLoop } from '../../src/core/event-loop.js';

class MockEventSource implements EventSource {
  type = EventSourceType.SYSTEM;
  name: string;
  private handler: ((event: AgentEvent) => void) | null = null;
  private started = false;

  constructor(name: string) {
    this.name = name;
  }

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  onEvent(handler: (event: AgentEvent) => void): void {
    this.handler = handler;
  }

  emit(payload: unknown, priority = EventPriority.NORMAL): void {
    if (this.handler) {
      this.handler({
        id: randomUUID(),
        type: this.type,
        priority,
        payload,
        timestamp: new Date(),
      });
    }
  }

  get isStarted(): boolean {
    return this.started;
  }
}

describe('Event Flow Integration', () => {
  let eventLoop: EventLoop;
  let stateMachine: StateMachine;

  beforeEach(() => {
    stateMachine = new StateMachine({
      transitions: createDefaultTransitions(),
    });

    eventLoop = new EventLoop();
  });

  afterEach(async () => {
    await eventLoop.stop();
    stateMachine.destroy();
  });

  it('processes events through the state machine lifecycle', async () => {
    const transitions: string[] = [];

    stateMachine.on('state:transition', (from, to) => {
      transitions.push(`${from}->${to}`);
    });

    eventLoop.setHandler(async (_event) => {
      await stateMachine.transition('event_received');
      await stateMachine.transition('task_complete');
    });

    const source = new MockEventSource('test-source');
    eventLoop.registerSource(source);
    await eventLoop.start();

    source.emit({ message: 'test event' });

    await new Promise((r) => setTimeout(r, 50));

    expect(transitions).toContain('idle->processing');
    expect(transitions).toContain('processing->idle');
    expect(stateMachine.getState()).toBe(AgentState.IDLE);
  });

  it('processes events in priority order', async () => {
    const processed: string[] = [];

    eventLoop.setHandler(async (event) => {
      processed.push(event.payload as string);
    });

    const source = new MockEventSource('priority-source');
    eventLoop.registerSource(source);

    source.emit('low', EventPriority.LOW);
    source.emit('critical', EventPriority.CRITICAL);
    source.emit('normal', EventPriority.NORMAL);
    source.emit('high', EventPriority.HIGH);

    await eventLoop.start();

    await new Promise((r) => setTimeout(r, 100));

    expect(processed[0]).toBe('critical');
    expect(processed[1]).toBe('high');
    expect(processed[2]).toBe('normal');
    expect(processed[3]).toBe('low');
  });

  it('pushEvent injects events into the loop', async () => {
    const received: AgentEvent[] = [];

    eventLoop.setHandler(async (event) => {
      received.push(event);
    });

    await eventLoop.start();

    eventLoop.pushEvent({
      type: EventSourceType.API,
      priority: EventPriority.HIGH,
      payload: { action: 'test' },
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe(EventSourceType.API);
    expect(received[0]!.payload).toEqual({ action: 'test' });
  });

  it('tracks stats correctly', async () => {
    let callCount = 0;

    eventLoop.setHandler(async () => {
      callCount++;
      if (callCount === 2) throw new Error('intentional');
    });

    const source = new MockEventSource('stats-source');
    eventLoop.registerSource(source);
    await eventLoop.start();

    source.emit('event-1');

    await new Promise((r) => setTimeout(r, 30));

    source.emit('event-2');

    await new Promise((r) => setTimeout(r, 30));

    source.emit('event-3');

    await new Promise((r) => setTimeout(r, 30));

    const stats = eventLoop.stats;
    expect(stats.processed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.sources).toBe(1);
  });

  it('stops gracefully', async () => {
    eventLoop.setHandler(async () => {});

    const source = new MockEventSource('shutdown-source');
    eventLoop.registerSource(source);
    await eventLoop.start();

    expect(eventLoop.isRunning).toBe(true);

    await eventLoop.stop();

    expect(eventLoop.isRunning).toBe(false);
  });

  it('emits loop lifecycle events', async () => {
    const started = jest.fn();
    const stopped = jest.fn();

    eventLoop.on('loop:started', started);
    eventLoop.on('loop:stopped', stopped);

    eventLoop.setHandler(async () => {});
    await eventLoop.start();

    expect(started).toHaveBeenCalledTimes(1);

    await eventLoop.stop();

    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('registers and unregisters sources', () => {
    eventLoop.setHandler(async () => {});

    const source1 = new MockEventSource('source-1');
    const source2 = new MockEventSource('source-2');

    eventLoop.registerSource(source1);
    eventLoop.registerSource(source2);

    expect(eventLoop.stats.sources).toBe(2);

    eventLoop.unregisterSource('source-1');

    expect(eventLoop.stats.sources).toBe(1);
  });

  it('throws on duplicate source registration', () => {
    eventLoop.setHandler(async () => {});

    const source = new MockEventSource('dupe');
    eventLoop.registerSource(source);

    expect(() => eventLoop.registerSource(source)).toThrow(/already registered/);
  });

  it('throws when starting without handler', async () => {
    await expect(eventLoop.start()).rejects.toThrow(/No event handler set/);
  });
});
