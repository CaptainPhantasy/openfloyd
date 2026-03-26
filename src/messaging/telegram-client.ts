import { createLogger } from '../utils/logger.js';
import {
  EventSourceType,
  EventPriority,
  type AgentEvent,
  type EventSource,
} from '../types/index.js';

const log = createLogger('telegram-client');

const TELEGRAM_API = 'https://api.telegram.org/bot';

export interface TelegramConfig {
  botToken: string;
  allowedChatIds: string[];
  pollingInterval?: number;
}

export class TelegramEventSource implements EventSource {
  type = EventSourceType.API as const;
  name = 'telegram';

  private botToken: string;
  private allowedChatIds: Set<string>;
  private pollingInterval: number;
  private eventHandler: ((event: AgentEvent) => void) | null = null;
  private offset = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: TelegramConfig) {
    this.botToken = config.botToken;
    this.allowedChatIds = new Set(config.allowedChatIds);
    this.pollingInterval = config.pollingInterval ?? 2000;
  }

  async start(): Promise<void> {
    // Verify bot token
    const me = await this.apiCall('getMe');
    if (!me.ok) {
      throw new Error(`Telegram bot verification failed: ${JSON.stringify(me)}`);
    }
    log.info({ botName: me.result.username }, 'Telegram bot connected');

    this.running = true;
    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollingInterval);
    this.timer.unref();

    log.info({ allowedChats: this.allowedChatIds.size }, 'Telegram event source started');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info('Telegram event source stopped');
  }

  onEvent(handler: (event: AgentEvent) => void): void {
    this.eventHandler = handler;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.apiCall('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    });
  }

  async sendTyping(chatId: string): Promise<void> {
    await this.apiCall('sendChatAction', {
      chat_id: chatId,
      action: 'typing',
    });
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const data = await this.apiCall('getUpdates', {
        offset: this.offset,
        timeout: 1,
        allowed_updates: ['message'],
      });

      if (!data.ok || !Array.isArray(data.result)) return;

      for (const update of data.result as Array<{
        update_id: number;
        message?: {
          message_id: number;
          from: { id: number; username?: string; first_name: string };
          chat: { id: number; type: string };
          text?: string;
          date: number;
        };
      }>) {
        this.offset = update.update_id + 1;

        if (!update.message?.text) continue;

        const chatId = String(update.message.chat.id);

        // Check allowlist
        if (this.allowedChatIds.size > 0 && !this.allowedChatIds.has(chatId)) {
          log.warn({ chatId, from: update.message.from.username }, 'Message from unauthorized chat');
          continue;
        }

        if (this.eventHandler) {
          this.eventHandler({
            id: crypto.randomUUID(),
            type: EventSourceType.API,
            priority: EventPriority.NORMAL,
            payload: {
              message: update.message.text,
              sender: chatId,
              senderName: update.message.from.username ?? update.message.from.first_name,
              platform: 'telegram',
            },
            timestamp: new Date(update.message.date * 1000),
            metadata: {
              chatId,
              messageId: update.message.message_id,
              source: 'telegram',
            },
          });
        }
      }
    } catch (err) {
      log.error({ err }, 'Telegram polling error');
    }
  }

  private async apiCall(method: string, params?: Record<string, unknown>): Promise<{ ok: boolean; result: Record<string, unknown> }> {
    const url = `${TELEGRAM_API}${this.botToken}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    return await response.json() as { ok: boolean; result: Record<string, unknown> };
  }
}
