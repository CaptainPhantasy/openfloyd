import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  type AgentEvent,
  type EventSource,
  type EventLoopEvents,
  EventPriority,
  EventSourceType,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('event-loop');

interface QueueEntry {
  event: AgentEvent;
  insertionOrder: number;
}

class PriorityEventQueue {
  private heap: QueueEntry[] = [];
  private insertionCounter = 0;

  get size(): number {
    return this.heap.length;
  }

  enqueue(event: AgentEvent): void {
    const entry: QueueEntry = { event, insertionOrder: this.insertionCounter++ };
    this.heap.push(entry);
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): AgentEvent | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0 && last) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top?.event;
  }

  peek(): AgentEvent | undefined {
    return this.heap[0]?.event;
  }

  clear(): void {
    this.heap = [];
    this.insertionCounter = 0;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex];
      const current = this.heap[index];
      if (!parent || !current || !this.hasHigherPriority(current, parent)) break;
      this.heap[parentIndex] = current;
      this.heap[index] = parent;
      index = parentIndex;
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      const smallestEntry = this.heap[smallest];
      const leftEntry = this.heap[left];
      const rightEntry = this.heap[right];

      if (left < length && leftEntry && smallestEntry && this.hasHigherPriority(leftEntry, smallestEntry)) {
        smallest = left;
      }

      const updatedSmallestEntry = this.heap[smallest];
      if (right < length && rightEntry && updatedSmallestEntry && this.hasHigherPriority(rightEntry, updatedSmallestEntry)) {
        smallest = right;
      }

      if (smallest === index) break;

      const swapEntry = this.heap[smallest];
      const currentEntry = this.heap[index];
      if (swapEntry && currentEntry) {
        this.heap[smallest] = currentEntry;
        this.heap[index] = swapEntry;
      }
      index = smallest;
    }
  }

  private hasHigherPriority(a: QueueEntry, b: QueueEntry): boolean {
    if (a.event.priority !== b.event.priority) {
      return a.event.priority < b.event.priority;
    }
    return a.insertionOrder < b.insertionOrder;
  }
}

export type EventHandler = (event: AgentEvent) => Promise<void>;

class TypedLoopEmitter {
  private emitter = new EventEmitter();

  on<K extends keyof EventLoopEvents>(event: K, listener: EventLoopEvents[K]): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof EventLoopEvents>(event: K, listener: EventLoopEvents[K]): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit<K extends keyof EventLoopEvents>(event: K, ...args: Parameters<EventLoopEvents[K]>): boolean {
    return this.emitter.emit(event, ...args);
  }

  removeAllListeners(): this {
    this.emitter.removeAllListeners();
    return this;
  }
}

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 30_000;

export class EventLoop extends TypedLoopEmitter {
  private queue = new PriorityEventQueue();
  private sources: Map<string, EventSource> = new Map();
  private handler: EventHandler | null = null;
  private running = false;
  private processing = false;
  private shutdownRequested = false;

  private consecutiveFailures = 0;
  private circuitOpen = false;
  private circuitResetTimer: ReturnType<typeof setTimeout> | null = null;

  private processedCount = 0;
  private failedCount = 0;

  get isRunning(): boolean {
    return this.running;
  }

  get stats(): { processed: number; failed: number; queued: number; sources: number } {
    return {
      processed: this.processedCount,
      failed: this.failedCount,
      queued: this.queue.size,
      sources: this.sources.size,
    };
  }

  setHandler(handler: EventHandler): void {
    this.handler = handler;
  }

  registerSource(source: EventSource): void {
    if (this.sources.has(source.name)) {
      throw new Error(`Event source "${source.name}" already registered`);
    }

    source.onEvent((event) => {
      this.queue.enqueue(event);
      this.emit('event:received', event);
      log.debug({ eventId: event.id, type: event.type, priority: event.priority }, 'Event queued');

      if (this.running && !this.processing) {
        void this.processNext();
      }
    });

    this.sources.set(source.name, source);
    log.info({ source: source.name, type: source.type }, 'Event source registered');
  }

  unregisterSource(name: string): void {
    this.sources.delete(name);
    log.info({ source: name }, 'Event source unregistered');
  }

  async start(): Promise<void> {
    if (this.running) {
      log.warn('Event loop already running');
      return;
    }

    if (!this.handler) {
      throw new Error('No event handler set. Call setHandler() before start().');
    }

    this.running = true;
    this.shutdownRequested = false;

    for (const [name, source] of this.sources) {
      try {
        await source.start();
        log.info({ source: name }, 'Event source started');
      } catch (error) {
        log.error({ err: error, source: name }, 'Failed to start event source');
      }
    }

    this.emit('loop:started');
    log.info({ sources: this.sources.size }, 'Event loop started');

    void this.processNext();
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    log.info('Shutting down event loop...');
    this.shutdownRequested = true;
    this.running = false;

    for (const [name, source] of this.sources) {
      try {
        await source.stop();
        log.info({ source: name }, 'Event source stopped');
      } catch (error) {
        log.error({ err: error, source: name }, 'Failed to stop event source');
      }
    }

    if (this.circuitResetTimer) {
      clearTimeout(this.circuitResetTimer);
      this.circuitResetTimer = null;
    }

    this.emit('loop:stopped');
    log.info(
      { processed: this.processedCount, failed: this.failedCount },
      'Event loop stopped',
    );
  }

  pushEvent(event: Omit<AgentEvent, 'id' | 'timestamp'>): string {
    const fullEvent: AgentEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date(),
    };
    this.queue.enqueue(fullEvent);
    this.emit('event:received', fullEvent);

    if (this.running && !this.processing) {
      void this.processNext();
    }

    return fullEvent.id;
  }

  createEvent(
    type: EventSourceType,
    payload: unknown,
    priority: EventPriority = EventPriority.NORMAL,
  ): AgentEvent {
    return {
      id: randomUUID(),
      type,
      priority,
      payload,
      timestamp: new Date(),
    };
  }

  private async processNext(): Promise<void> {
    if (!this.running || this.processing || this.shutdownRequested) return;

    if (this.circuitOpen) {
      log.warn('Circuit breaker open — skipping event processing');
      return;
    }

    const event = this.queue.dequeue();
    if (!event) return;

    this.processing = true;
    this.emit('event:processing', event);

    try {
      await this.handler!(event);
      this.processedCount++;
      this.consecutiveFailures = 0;
      this.emit('event:completed', event, null);
      log.debug({ eventId: event.id }, 'Event processed successfully');
    } catch (error) {
      this.failedCount++;
      this.consecutiveFailures++;
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('event:failed', event, err);
      log.error({ err, eventId: event.id }, 'Event processing failed');

      if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        this.openCircuitBreaker();
      }
    } finally {
      this.processing = false;
    }

    if (this.running && !this.shutdownRequested && this.queue.size > 0) {
      setImmediate(() => void this.processNext());
    }
  }

  private openCircuitBreaker(): void {
    this.circuitOpen = true;
    log.warn(
      { consecutiveFailures: this.consecutiveFailures },
      'Circuit breaker OPEN — halting event processing',
    );
    this.emit('loop:error', new Error('Circuit breaker opened after consecutive failures'));

    this.circuitResetTimer = setTimeout(() => {
      this.circuitOpen = false;
      this.consecutiveFailures = 0;
      log.info('Circuit breaker CLOSED — resuming event processing');

      if (this.running && this.queue.size > 0) {
        void this.processNext();
      }
    }, CIRCUIT_BREAKER_RESET_MS);

    this.circuitResetTimer.unref();
  }
}
