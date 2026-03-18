import { createLogger } from '../utils/logger.js';

const log = createLogger('message-queue');

const MAX_WHATSAPP_LENGTH = 4096;
const DEFAULT_RATE_LIMIT = 5;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5_000;

export interface QueuedMessage {
  id: string;
  recipient: string;
  content: string;
  timestamp: Date;
  retries: number;
  maxRetries: number;
}

export type SendFunction = (recipient: string, content: string) => Promise<void>;

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private processing = false;
  private sendFn: SendFunction | null = null;
  private rateLimit: number;
  private rateWindowMs: number;
  private sentTimestamps: number[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  private sent = 0;
  private failed = 0;
  private dropped = 0;

  constructor(config?: {
    rateLimit?: number;
    rateWindowMs?: number;
  }) {
    this.rateLimit = config?.rateLimit ?? DEFAULT_RATE_LIMIT;
    this.rateWindowMs = config?.rateWindowMs ?? DEFAULT_RATE_WINDOW_MS;
  }

  setSendFunction(fn: SendFunction): void {
    this.sendFn = fn;
  }

  enqueue(recipient: string, content: string, maxRetries = DEFAULT_MAX_RETRIES): string[] {
    const chunks = this.splitMessage(content);
    const ids: string[] = [];

    for (const chunk of chunks) {
      const id = crypto.randomUUID();
      this.queue.push({
        id,
        recipient,
        content: chunk,
        timestamp: new Date(),
        retries: 0,
        maxRetries,
      });
      ids.push(id);
    }

    log.info({ recipient, chunks: chunks.length, queueSize: this.queue.length }, 'Messages enqueued');

    if (!this.processing && !this.stopped) {
      void this.processQueue();
    }

    return ids;
  }

  get stats(): { queued: number; sent: number; failed: number; dropped: number } {
    return { queued: this.queue.length, sent: this.sent, failed: this.failed, dropped: this.dropped };
  }

  get size(): number {
    return this.queue.length;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    log.info({ remaining: this.queue.length }, 'Message queue stopped');
  }

  start(): void {
    this.stopped = false;
    if (this.queue.length > 0 && !this.processing) {
      void this.processQueue();
    }
  }

  clear(): void {
    const count = this.queue.length;
    this.queue = [];
    log.info({ cleared: count }, 'Message queue cleared');
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.stopped || !this.sendFn) return;
    this.processing = true;

    while (this.queue.length > 0 && !this.stopped) {
      if (!this.canSendNow()) {
        const waitMs = this.getWaitTime();
        log.debug({ waitMs, queueSize: this.queue.length }, 'Rate limit reached, waiting');
        await this.sleep(waitMs);
        continue;
      }

      const message = this.queue.shift();
      if (!message) break;

      try {
        await this.sendFn(message.recipient, message.content);
        this.recordSend();
        this.sent++;
        log.debug({ id: message.id, recipient: message.recipient }, 'Message sent');
      } catch (error) {
        message.retries++;
        if (message.retries < message.maxRetries) {
          this.queue.unshift(message);
          log.warn(
            { id: message.id, retries: message.retries, err: error },
            'Send failed, will retry',
          );
          await this.sleep(DEFAULT_RETRY_DELAY_MS * message.retries);
        } else {
          this.failed++;
          this.dropped++;
          log.error(
            { id: message.id, retries: message.retries, err: error },
            'Message dropped after max retries',
          );
        }
      }
    }

    this.processing = false;
  }

  private canSendNow(): boolean {
    this.pruneTimestamps();
    return this.sentTimestamps.length < this.rateLimit;
  }

  private getWaitTime(): number {
    this.pruneTimestamps();
    if (this.sentTimestamps.length === 0) return 0;
    const oldest = this.sentTimestamps[0]!;
    return Math.max(0, oldest + this.rateWindowMs - Date.now() + 100);
  }

  private recordSend(): void {
    this.sentTimestamps.push(Date.now());
  }

  private pruneTimestamps(): void {
    const cutoff = Date.now() - this.rateWindowMs;
    this.sentTimestamps = this.sentTimestamps.filter((t) => t > cutoff);
  }

  splitMessage(content: string): string[] {
    if (content.length <= MAX_WHATSAPP_LENGTH) return [content];

    const chunks: string[] = [];
    const lines = content.split('\n');
    let current = '';

    for (const line of lines) {
      if (current.length + line.length + 1 > MAX_WHATSAPP_LENGTH) {
        if (current) chunks.push(current.trim());
        if (line.length > MAX_WHATSAPP_LENGTH) {
          for (let i = 0; i < line.length; i += MAX_WHATSAPP_LENGTH) {
            chunks.push(line.substring(i, i + MAX_WHATSAPP_LENGTH));
          }
          current = '';
        } else {
          current = line;
        }
      } else {
        current += (current ? '\n' : '') + line;
      }
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timer = setTimeout(resolve, ms);
    });
  }
}
