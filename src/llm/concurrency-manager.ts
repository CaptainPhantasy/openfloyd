import { createLogger } from '../utils/logger.js';
import type { ConcurrencyStatus } from '../types/index.js';

const log = createLogger('concurrency-manager');

interface QueuedRequest {
  resolve: () => void;
  priority: number;
}

export class ConcurrencyManager {
  private limits = new Map<string, number>();
  private active = new Map<string, number>();
  private queues = new Map<string, QueuedRequest[]>();

  async acquire(providerId: string, priority = 0): Promise<void> {
    const limit = this.limits.get(providerId) ?? 10;
    const current = this.active.get(providerId) ?? 0;

    if (current < limit) {
      this.active.set(providerId, current + 1);
      return;
    }

    // Queue the request
    return new Promise<void>((resolve) => {
      if (!this.queues.has(providerId)) {
        this.queues.set(providerId, []);
      }
      this.queues.get(providerId)!.push({ resolve, priority });
      // Sort by priority (lower = higher priority)
      this.queues.get(providerId)!.sort((a, b) => a.priority - b.priority);
      log.debug({ providerId, queued: this.queues.get(providerId)!.length }, 'Request queued');
    });
  }

  release(providerId: string): void {
    const current = this.active.get(providerId) ?? 0;
    if (current <= 0) return;

    const queue = this.queues.get(providerId);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      next.resolve();
    } else {
      this.active.set(providerId, current - 1);
    }
  }

  setLimit(providerId: string, limit: number): void {
    this.limits.set(providerId, limit);
    log.info({ providerId, limit }, 'Concurrency limit set');
  }

  getLimit(providerId: string): number {
    return this.limits.get(providerId) ?? 10;
  }

  getStatus(providerId: string): ConcurrencyStatus {
    return {
      providerId,
      limit: this.limits.get(providerId) ?? 10,
      active: this.active.get(providerId) ?? 0,
      queued: this.queues.get(providerId)?.length ?? 0,
    };
  }

  getAllStatus(): Map<string, ConcurrencyStatus> {
    const result = new Map<string, ConcurrencyStatus>();
    const allProviders = new Set([...this.limits.keys(), ...this.active.keys()]);
    for (const providerId of allProviders) {
      result.set(providerId, this.getStatus(providerId));
    }
    return result;
  }
}
