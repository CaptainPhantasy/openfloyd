import { createHash } from 'node:crypto';
import { createLogger } from '../utils/logger.js';
import { estimateTokens } from '../utils/token-counter.js';

const log = createLogger('prompt-cache');

interface CacheEntry<T> {
  key: string;
  value: T;
  hash: string;
  tokensSaved: number;
  createdAt: Date;
  expiresAt: Date;
  hits: number;
}

export interface PromptCacheConfig {
  systemPromptTTL?: number;
  toolsTTL?: number;
  dynamicTTL?: number;
  maxEntries?: number;
}

const DEFAULT_SYSTEM_TTL = 24 * 60 * 60 * 1000;
const DEFAULT_TOOLS_TTL = 60 * 60 * 1000;
const DEFAULT_DYNAMIC_TTL = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 100;

export class PromptCache {
  private cache = new Map<string, CacheEntry<string>>();
  private systemPromptTTL: number;
  private toolsTTL: number;
  private dynamicTTL: number;
  private maxEntries: number;
  private totalHits = 0;
  private totalMisses = 0;

  constructor(config: PromptCacheConfig = {}) {
    this.systemPromptTTL = config.systemPromptTTL ?? DEFAULT_SYSTEM_TTL;
    this.toolsTTL = config.toolsTTL ?? DEFAULT_TOOLS_TTL;
    this.dynamicTTL = config.dynamicTTL ?? DEFAULT_DYNAMIC_TTL;
    this.maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  cacheSystemPrompt(prompt: string): string {
    return this.set('system', prompt, this.systemPromptTTL);
  }

  cacheToolDefinitions(toolsJson: string): string {
    return this.set('tools', toolsJson, this.toolsTTL);
  }

  cacheDynamic(key: string, content: string): string {
    return this.set(`dynamic:${key}`, content, this.dynamicTTL);
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.totalMisses++;
      return null;
    }

    if (new Date() > entry.expiresAt) {
      this.cache.delete(key);
      this.totalMisses++;
      log.debug({ key }, 'Cache entry expired');
      return null;
    }

    entry.hits++;
    this.totalHits++;
    log.debug(
      { key, hits: entry.hits, tokensSaved: entry.tokensSaved },
      'Cache hit',
    );
    return entry.value;
  }

  getHash(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry || new Date() > entry.expiresAt) return null;
    return entry.hash;
  }

  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    log.info('Cache cleared');
  }

  getStats(): {
    entries: number;
    hits: number;
    misses: number;
    hitRate: number;
    totalTokensSaved: number;
  } {
    let totalTokensSaved = 0;
    for (const entry of this.cache.values()) {
      totalTokensSaved += entry.tokensSaved * entry.hits;
    }

    const total = this.totalHits + this.totalMisses;
    return {
      entries: this.cache.size,
      hits: this.totalHits,
      misses: this.totalMisses,
      hitRate: total > 0 ? this.totalHits / total : 0,
      totalTokensSaved,
    };
  }

  private set(key: string, value: string, ttl: number): string {
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    const hash = createHash('sha256').update(value).digest('hex').substring(0, 16);
    const existing = this.cache.get(key);
    if (existing && existing.hash === hash) {
      existing.expiresAt = new Date(Date.now() + ttl);
      return hash;
    }

    const entry: CacheEntry<string> = {
      key,
      value,
      hash,
      tokensSaved: estimateTokens(value),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + ttl),
      hits: 0,
    };

    this.cache.set(key, entry);
    log.debug(
      { key, hash, tokens: entry.tokensSaved, ttl_ms: ttl },
      'Cached prompt content',
    );
    return hash;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      const score = entry.createdAt.getTime() - entry.hits * 60_000;
      if (score < oldestTime) {
        oldestTime = score;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      log.debug({ key: oldestKey }, 'Evicted cache entry');
    }
  }
}
