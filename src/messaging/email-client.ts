import { createLogger } from '../utils/logger.js';
import {
  EventPriority,
  EventSourceType,
  type AgentEvent,
  type EventSource,
} from '../types/index.js';

const log = createLogger('email-client');

export interface EmailEventSourceConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  pollIntervalMs?: number;
  allowedFrom?: string[];
}

interface ParsedEmail {
  from: string;
  subject: string;
  text: string;
}

interface MailboxClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  mailboxOpen(path: string): Promise<void>;
  search(query: unknown): Promise<number[]>;
  fetchOne(seq: number, query: unknown): Promise<unknown>;
  messageFlagsAdd(seq: number, flags: string[]): Promise<void>;
}

function parseAddressList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function decodeMimeWords(input: string): string {
  return input.replace(/=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g, (_, charset: string, encoding: string, text: string) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString(charset.toLowerCase() === 'utf-8' ? 'utf8' : 'utf8');
      }
      const qp = text.replace(/_/g, ' ').replace(/=([A-Fa-f0-9]{2})/g, (_m: string, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
      return Buffer.from(qp, 'binary').toString(charset.toLowerCase() === 'utf-8' ? 'utf8' : 'utf8');
    } catch {
      return text;
    }
  });
}

function extractHeaderValue(raw: string, headerName: string): string {
  const regex = new RegExp(`^${headerName}:\\s*(.*)$`, 'im');
  const match = raw.match(regex);
  if (!match) return '';
  return decodeMimeWords(match[1]!.trim());
}

function extractEmailAddress(fromHeader: string): string {
  const angle = fromHeader.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  return fromHeader.trim().toLowerCase();
}

function extractTextBody(raw: string): string {
  const parts = raw.split(/\r?\n\r?\n/);
  if (parts.length < 2) return '';

  const body = parts.slice(1).join('\n\n');
  const contentType = extractHeaderValue(raw, 'Content-Type').toLowerCase();

  if (contentType.includes('multipart/')) {
    const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
    if (!boundaryMatch?.[1]) return body.trim();
    const boundary = boundaryMatch[1];
    const chunks = body.split(`--${boundary}`);
    for (const chunk of chunks) {
      const lower = chunk.toLowerCase();
      if (!lower.includes('content-type: text/plain')) continue;
      const subParts = chunk.split(/\r?\n\r?\n/);
      if (subParts.length < 2) continue;
      return subParts.slice(1).join('\n\n').replace(/\r/g, '').trim();
    }
  }

  return body.replace(/\r/g, '').trim();
}

function parseRawEmail(raw: string): ParsedEmail {
  const fromHeader = extractHeaderValue(raw, 'From');
  const subject = extractHeaderValue(raw, 'Subject');
  const from = extractEmailAddress(fromHeader);
  const text = extractTextBody(raw);
  return { from, subject, text };
}

export class EmailEventSource implements EventSource {
  type = EventSourceType.API as const;
  name = 'email-imap';

  private eventHandler: ((event: AgentEvent) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private imap: MailboxClient | null = null;
  private config: EmailEventSourceConfig;
  private allowedFrom: Set<string>;

  constructor(config: EmailEventSourceConfig) {
    this.config = config;
    const defaults = parseAddressList(process.env['EMAIL_ALLOWED_SENDERS'] ?? 'douglas@floydlabs.com,douglas.talley@legacyai.space');
    const configured = (config.allowedFrom ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean);
    this.allowedFrom = new Set(configured.length > 0 ? configured : defaults);
  }

  onEvent(handler: (event: AgentEvent) => void): void {
    this.eventHandler = handler;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: {
        user: this.config.user,
        pass: this.config.pass,
      },
      logger: false,
      tls: { rejectUnauthorized: true },
    }) as unknown as MailboxClient;

    this.imap = client;
    await this.imap.connect();
    await this.imap.mailboxOpen('INBOX');
    await this.poll();

    const interval = this.config.pollIntervalMs ?? 15_000;
    this.timer = setInterval(() => {
      void this.poll();
    }, interval);
    this.timer.unref();

    log.info({ pollIntervalMs: interval, allowedFrom: this.allowedFrom.size }, 'Email IMAP source started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.imap) {
      await this.imap.logout().catch(() => undefined);
      this.imap = null;
    }
    log.info('Email IMAP source stopped');
  }

  private async poll(): Promise<void> {
    if (!this.imap || !this.eventHandler || !this.running) return;

    try {
      const unseen = await this.imap.search({ seen: false });
      if (unseen.length === 0) return;

      for (const seq of unseen) {
        try {
          const fetched = await this.imap.fetchOne(seq, { source: true });
          const source = fetched as { source?: string | Buffer };
          const raw = typeof source.source === 'string'
            ? source.source
            : Buffer.isBuffer(source.source)
              ? source.source.toString('utf8')
              : '';

          if (!raw) {
            await this.imap.messageFlagsAdd(seq, ['\\Seen']);
            continue;
          }

          const parsed = parseRawEmail(raw);
          if (!parsed.from || !this.allowedFrom.has(parsed.from)) {
            log.warn({ from: parsed.from || '(unknown)' }, 'Unauthorized email sender ignored');
            await this.imap.messageFlagsAdd(seq, ['\\Seen']);
            continue;
          }

          const content = `Email from ${parsed.from}\nSubject: ${parsed.subject || '(no subject)'}\n\n${parsed.text}`;

          this.eventHandler({
            id: crypto.randomUUID(),
            type: EventSourceType.API,
            priority: EventPriority.NORMAL,
            payload: {
              source: 'email',
              sender: parsed.from,
              text: parsed.text,
            },
            timestamp: new Date(),
            metadata: {
              source: 'email',
              from: parsed.from,
              subject: parsed.subject,
              preview: content.substring(0, 120),
            },
          });

          await this.imap.messageFlagsAdd(seq, ['\\Seen']);
        } catch (err) {
          log.error({ err, seq }, 'Failed to process email message');
        }
      }
    } catch (err) {
      log.error({ err }, 'Email polling failed');
    }
  }
}

export const __emailParserInternals = {
  parseRawEmail,
  extractHeaderValue,
  extractEmailAddress,
  extractTextBody,
};
