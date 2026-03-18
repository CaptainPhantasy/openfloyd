import { randomUUID } from 'node:crypto';
import { createLogger } from '../utils/logger.js';
import { VectorStore } from './vector-store.js';
import type { MemoryMetadata } from '../types/index.js';

const log = createLogger('consolidation');

export interface ConsolidationConfig {
  maxEntries?: number;
  minImportance?: number;
  consolidationInterval?: number;
}

const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MIN_IMPORTANCE = 0.2;

export class MemoryConsolidator {
  private store: VectorStore;
  private maxEntries: number;
  private minImportance: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private runCount = 0;

  constructor(store: VectorStore, config?: ConsolidationConfig) {
    this.store = store;
    this.maxEntries = config?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.minImportance = config?.minImportance ?? DEFAULT_MIN_IMPORTANCE;
  }

  startPeriodic(intervalMs: number): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      void this.run().catch((err) => {
        log.error({ err }, 'Consolidation run failed');
      });
    }, intervalMs);

    this.timer.unref();
    log.info({ intervalMs }, 'Periodic consolidation started');
  }

  stopPeriodic(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      log.info('Periodic consolidation stopped');
    }
  }

  async run(): Promise<{ pruned: number; consolidated: number }> {
    const startTime = Date.now();
    this.runCount++;

    const entryCount = this.store.getCount();
    let pruned = 0;
    let consolidated = 0;

    if (entryCount > this.maxEntries) {
      pruned = this.store.prune(this.maxEntries, this.minImportance);
    }

    const duration = Date.now() - startTime;
    log.info(
      { runCount: this.runCount, entryCount, pruned, consolidated, duration_ms: duration },
      'Consolidation complete',
    );

    return { pruned, consolidated };
  }

  addMemory(content: string, metadata: Omit<MemoryMetadata, 'timestamp'>): void {
    this.store.store({
      id: randomUUID(),
      content,
      metadata: { ...metadata, timestamp: new Date() },
    });
  }

  getRunCount(): number {
    return this.runCount;
  }
}
