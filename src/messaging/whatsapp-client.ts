import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  EventPriority,
  EventSourceType,
  type AgentEvent,
  type EventSource,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { MessageQueue } from './message-queue.js';
import { WhatsAppAuthManager, AuthorizationManager } from './auth-manager.js';

const log = createLogger('whatsapp');

const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY_MS = 2_000;

export interface WhatsAppClientConfig {
  authPath: string;
  allowedNumbers: string[];
  printQR?: boolean;
  autoReply?: boolean;
}

interface WASocket {
  ev: {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
  };
  sendMessage: (jid: string, content: { text: string }) => Promise<unknown>;
  end: (reason?: Error) => void;
}

export class WhatsAppEventSource implements EventSource {
  type = EventSourceType.WHATSAPP;
  name = 'whatsapp-bridge';

  private config: WhatsAppClientConfig;
  private authManager: WhatsAppAuthManager;
  private authorizationManager: AuthorizationManager;
  private messageQueue: MessageQueue;
  private socket: WASocket | null = null;
  private eventHandler: ((event: AgentEvent) => void) | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private shutdownRequested = false;

  constructor(config: WhatsAppClientConfig) {
    this.config = config;
    this.authManager = new WhatsAppAuthManager({
      authPath: resolve(config.authPath),
    });
    this.authorizationManager = new AuthorizationManager(config.allowedNumbers);
    this.messageQueue = new MessageQueue();
  }

  async start(): Promise<void> {
    this.shutdownRequested = false;
    await this.connect();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async stop(): Promise<void> {
    this.shutdownRequested = true;
    this.messageQueue.stop();
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this.connected = false;
    log.info('WhatsApp client stopped');
  }

  onEvent(handler: (event: AgentEvent) => void): void {
    this.eventHandler = handler;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async sendMessage(recipient: string, content: string): Promise<string[]> {
    return this.messageQueue.enqueue(recipient, content);
  }

  isConnected(): boolean {
    return this.connected;
  }

  getMessageQueue(): MessageQueue {
    return this.messageQueue;
  }

  getAuthorizationManager(): AuthorizationManager {
    return this.authorizationManager;
  }

  private async connect(): Promise<void> {
    try {
      const { state, saveCreds } = await this.authManager.loadAuthState();

      const { default: makeWASocket, DisconnectReason } = await import('@whiskeysockets/baileys');
      const pinoModule = await import('pino');
      const pinoFn = pinoModule.pino ?? pinoModule.default;

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: this.config.printQR ?? true,
        logger: (pinoFn as (opts: { level: string }) => Record<string, unknown>)({ level: 'silent' }) as unknown as import('pino').Logger,
      }) as unknown as WASocket;

      this.messageQueue.setSendFunction(async (jid, text) => {
        if (!this.socket) throw new Error('WhatsApp not connected');
        await this.socket.sendMessage(jid, { text });
      });

      this.socket.ev.on('creds.update', () => {
        void saveCreds();
      });

      this.socket.ev.on('connection.update', (update: unknown) => {
        const { connection, lastDisconnect, qr } = update as {
          connection?: string;
          lastDisconnect?: { error?: { output?: { statusCode?: number } } };
          qr?: string;
        };

        if (qr) {
          log.info('========================================');
          log.info('SCAN THIS QR CODE WITH WHATSAPP:');
          log.info('========================================');
          const qrLines = qr.match(/.{1,50}/g) ?? [qr];
          for (const line of qrLines) {
            log.info(line);
          }
          log.info('========================================');
        }

        if (connection === 'close') {
          this.connected = false;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          log.warn({ statusCode, shouldReconnect }, 'WhatsApp disconnected');

          if (shouldReconnect && !this.shutdownRequested) {
            void this.reconnect();
          }
        } else if (connection === 'open') {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.messageQueue.start();
          log.info('WhatsApp connected');
        }
      });

      this.socket.ev.on('messages.upsert', (upsert: unknown) => {
        const { messages } = upsert as {
          messages: Array<{
            key: { fromMe?: boolean; remoteJid?: string };
            message?: { conversation?: string; extendedTextMessage?: { text?: string } };
          }>;
        };

        for (const msg of messages) {
          if (msg.key.fromMe) continue;

          const sender = msg.key.remoteJid;
          if (!sender) continue;

          if (!this.authorizationManager.isAuthorized(sender)) {
            log.warn({ sender }, 'Unauthorized message dropped');
            continue;
          }

          const text =
            msg.message?.conversation ??
            msg.message?.extendedTextMessage?.text;

          if (!text) continue;

          log.info({ sender, length: text.length }, 'Authorized message received');

          if (this.eventHandler) {
            this.eventHandler({
              id: randomUUID(),
              type: EventSourceType.WHATSAPP,
              priority: EventPriority.HIGH,
              payload: { sender, text, raw: msg },
              timestamp: new Date(),
              metadata: { sender },
            });
          }
        }
      });

      log.info('WhatsApp client initializing (scan QR if needed)');
    } catch (error) {
      log.error({ err: error }, 'Failed to connect WhatsApp');
      if (!this.shutdownRequested) {
        void this.reconnect();
      }
    }
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      log.error({ attempts: this.reconnectAttempts }, 'Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
    log.info({ attempt: this.reconnectAttempts, delay_ms: delay }, 'Reconnecting...');

    await new Promise((r) => setTimeout(r, delay));
    if (!this.shutdownRequested) {
      await this.connect();
    }
  }
}
