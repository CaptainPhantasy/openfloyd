import { randomUUID } from 'node:crypto';
import { createLogger } from '../utils/logger.js';
import { VectorStore } from './vector-store.js';
import type { EmbeddingService } from './embedding-service.js';
import type { MemoryMetadata } from '../types/index.js';

const log = createLogger('consolidation');

export interface ConsolidationConfig {
  maxEntries?: number;
  minImportance?: number;
  consolidationInterval?: number;
  similarityThreshold?: number;
}

const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MIN_IMPORTANCE = 0.2;
const DEFAULT_SIMILARITY_THRESHOLD = 0.15;

export class MemoryConsolidator {
  private store: VectorStore;
  private maxEntries: number;
  private minImportance: number;
  private similarityThreshold: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private runCount = 0;
  private embeddingService: EmbeddingService | null = null;

  constructor(store: VectorStore, config?: ConsolidationConfig) {
    this.store = store;
    this.maxEntries = config?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.minImportance = config?.minImportance ?? DEFAULT_MIN_IMPORTANCE;
    this.similarityThreshold = config?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  }

  setEmbeddingService(service: EmbeddingService): void {
    this.embeddingService = service;
  }

  startPeriodic(intervalMs: number): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      void this.run().catch((err: unknown) => {
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

    // Phase 1: Prune low-importance entries if over limit
    if (entryCount > this.maxEntries) {
      pruned = this.store.prune(this.maxEntries, this.minImportance);
    }

    // Phase 2: Merge near-duplicate entries via vector similarity
    if (this.embeddingService) {
      consolidated = await this.mergeNearDuplicates();
    }

    const duration = Date.now() - startTime;
    log.info(
      { runCount: this.runCount, entryCount, pruned, consolidated, duration_ms: duration },
      'Consolidation complete',
    );

    return { pruned, consolidated };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async mergeNearDuplicates(): Promise<number> {
    let merged = 0;
    const processed = new Set<string>();

    // Get all entries with embeddings by searching with a zero vector
    // Instead, iterate through recent entries and find similar ones
    const count = this.store.getCount();
    if (count < 2) return 0;

    // Sample recent entries for dedup (check last 100)
    // VectorStore doesn't have getAll, so we use getById with known IDs
    // We need to search against each entry's embedding
    // This is O(n) searches which is acceptable for periodic consolidation

    // Get entries by searching with their own embeddings
    // We'll use a sampling approach: pick random entries and look for near-duplicates
    const sampleSize = Math.min(50, count);
    const allIds = this.store.getRecentIds(sampleSize);

    for (const id of allIds) {
      if (processed.has(id)) continue;

      const entry = this.store.getById(id);
      if (!entry?.embedding) continue;

      // Find similar entries
      const similar = this.store.search(entry.embedding, 5);

      for (const match of similar) {
        if (match.id === id || processed.has(match.id)) continue;
        if (match.distance > this.similarityThreshold) continue;

        // Near-duplicate found — merge by keeping the higher-importance one
        const keepEntry = entry.metadata.importance >= match.metadata.importance ? entry : match;
        const removeEntry = keepEntry.id === entry.id ? match : entry;

        // Combine content if they have different info
        if (keepEntry.id === entry.id && match.content !== entry.content) {
          const combinedContent = `${entry.content}\n---\n${match.content}`.substring(0, 2000);
          this.store.store({
            ...entry,
            content: combinedContent,
            metadata: {
              ...entry.metadata,
              importance: Math.max(entry.metadata.importance, match.metadata.importance),
            },
          });
        }

        this.store.delete(removeEntry.id);
        processed.add(removeEntry.id);
        merged++;

        log.debug(
          { keptId: keepEntry.id, removedId: removeEntry.id, distance: match.distance },
          'Merged near-duplicate memory',
        );
      }

      processed.add(id);
    }

    return merged;
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
