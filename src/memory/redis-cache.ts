import { createClient, type RedisClientType } from 'redis';
import { createLogger } from '../utils/logger.js';

const log = createLogger('redis-cache');

const DEFAULT_TTL = 86_400;

export interface RedisCacheConfig {
  url: string;
  prefix?: string;
  defaultTTL?: number;
}

export class RedisCache {
  private client: RedisClientType;
  private prefix: string;
  private defaultTTL: number;
  private connected = false;

  constructor(config: RedisCacheConfig) {
    this.client = createClient({ url: config.url }) as RedisClientType;
    this.prefix = config.prefix ?? 'floyd:';
    this.defaultTTL = config.defaultTTL ?? DEFAULT_TTL;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.client.on('error', (err: unknown) => {
      log.error({ err }, 'Redis connection error');
    });

    this.client.on('connect', () => {
      this.connected = true;
      log.info('Redis connected');
    });

    this.client.on('end', () => {
      this.connected = false;
      log.info('Redis disconnected');
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client.disconnect();
  }

  async get(key: string): Promise<string | null> {
    if (!this.connected) return null;
    return this.client.get(this.prefix + key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.connected) return;
    await this.client.set(this.prefix + key, value, {
      EX: ttl ?? this.defaultTTL,
    });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttl);
  }

  async delete(key: string): Promise<boolean> {
    if (!this.connected) return false;
    const result = await this.client.del(this.prefix + key);
    return result > 0;
  }

  async increment(key: string): Promise<number> {
    if (!this.connected) return 0;
    return this.client.incr(this.prefix + key);
  }

  async setRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!this.connected) return true;
    const current = await this.increment(`rate:${key}`);
    if (current === 1) {
      await this.client.expire(this.prefix + `rate:${key}`, windowSeconds);
    }
    return current <= limit;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
