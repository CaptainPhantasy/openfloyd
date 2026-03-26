import Database from 'better-sqlite3';
import { createLogger } from '../utils/logger.js';
import type { WebChatMessage } from '../types/index.js';

const log = createLogger('conversation-store');

export class ConversationStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp DESC);
    `);
    log.info('Conversation store initialized');
  }

  saveMessage(message: WebChatMessage): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO conversations (id, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?)',
    );
    stmt.run(
      message.id,
      message.role,
      message.content,
      message.timestamp.getTime(),
      message.metadata ? JSON.stringify(message.metadata) : null,
    );
  }

  getHistory(limit = 50, before?: Date): WebChatMessage[] {
    const ts = before ? before.getTime() : Date.now() + 1;
    const stmt = this.db.prepare(
      'SELECT id, role, content, timestamp, metadata FROM conversations WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT ?',
    );
    const rows = stmt.all(ts, limit) as Array<{
      id: string;
      role: string;
      content: string;
      timestamp: number;
      metadata: string | null;
    }>;
    return rows.reverse().map((row) => ({
      id: row.id,
      role: row.role as WebChatMessage['role'],
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? (JSON.parse(row.metadata) as WebChatMessage['metadata']) : undefined,
    }));
  }

  searchHistory(query: string): WebChatMessage[] {
    const stmt = this.db.prepare(
      'SELECT id, role, content, timestamp, metadata FROM conversations WHERE content LIKE ? ORDER BY timestamp DESC LIMIT 50',
    );
    const rows = stmt.all(`%${query}%`) as Array<{
      id: string;
      role: string;
      content: string;
      timestamp: number;
      metadata: string | null;
    }>;
    return rows.reverse().map((row) => ({
      id: row.id,
      role: row.role as WebChatMessage['role'],
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? (JSON.parse(row.metadata) as WebChatMessage['metadata']) : undefined,
    }));
  }

  clearHistory(): void {
    this.db.exec('DELETE FROM conversations');
    log.info('Conversation history cleared');
  }

  close(): void {
    this.db.close();
  }
}
