import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { createLogger } from '../utils/logger.js';
import type { MemoryEntry, MemoryMetadata } from '../types/index.js';

const log = createLogger('vector-store');

export interface VectorStoreConfig {
  dbPath: string;
  dimensions?: number;
}

const DEFAULT_DIMENSIONS = 1536;

export class VectorStore {
  private db: Database.Database;
  private dimensions: number;

  constructor(config: VectorStoreConfig) {
    this.dimensions = config.dimensions ?? DEFAULT_DIMENSIONS;
    this.db = new Database(config.dbPath);

    sqliteVec.load(this.db);
    this.initSchema();

    log.info({ dbPath: config.dbPath, dimensions: this.dimensions }, 'Vector store initialized');
  }

  store(entry: MemoryEntry): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories (id, content, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    stmt.run(
      entry.id,
      entry.content,
      JSON.stringify(entry.metadata),
      now,
      now,
    );

    if (entry.embedding) {
      const vecStmt = this.db.prepare(`
        INSERT OR REPLACE INTO memories_vec (rowid, embedding)
        VALUES ((SELECT rowid FROM memories WHERE id = ?), ?)
      `);
      vecStmt.run(entry.id, Buffer.from(entry.embedding.buffer));
    }

    log.debug({ id: entry.id, hasEmbedding: !!entry.embedding }, 'Memory stored');
  }

  search(queryEmbedding: Float32Array, limit = 10): Array<MemoryEntry & { distance: number }> {
    const stmt = this.db.prepare(`
      SELECT
        m.id,
        m.content,
        m.metadata,
        v.distance
      FROM memories_vec v
      INNER JOIN memories m ON m.rowid = v.rowid
      WHERE v.embedding MATCH ?
        AND k = ?
      ORDER BY v.distance
    `);

    const rows = stmt.all(Buffer.from(queryEmbedding.buffer), limit) as Array<{
      id: string;
      content: string;
      metadata: string;
      distance: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      metadata: JSON.parse(row.metadata) as MemoryMetadata,
      distance: row.distance,
    }));
  }

  getById(id: string): MemoryEntry | null {
    const stmt = this.db.prepare('SELECT id, content, metadata FROM memories WHERE id = ?');
    const row = stmt.get(id) as { id: string; content: string; metadata: string } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      content: row.content,
      metadata: JSON.parse(row.metadata) as MemoryMetadata,
    };
  }

  getByCategory(category: MemoryMetadata['category'], limit = 50): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT id, content, metadata FROM memories
      WHERE json_extract(metadata, '$.category') = ?
      ORDER BY json_extract(metadata, '$.importance') DESC
      LIMIT ?
    `);

    const rows = stmt.all(category, limit) as Array<{ id: string; content: string; metadata: string }>;

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      metadata: JSON.parse(row.metadata) as MemoryMetadata,
    }));
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  prune(maxEntries: number, minImportance = 0.3): number {
    const stmt = this.db.prepare(`
      DELETE FROM memories WHERE id IN (
        SELECT id FROM memories
        WHERE json_extract(metadata, '$.importance') < ?
        ORDER BY updated_at ASC
        LIMIT MAX(0, (SELECT COUNT(*) FROM memories) - ?)
      )
    `);

    const result = stmt.run(minImportance, maxEntries);
    if (result.changes > 0) {
      log.info({ pruned: result.changes }, 'Memories pruned');
    }
    return result.changes;
  }

  getCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };
    return row.count;
  }

  close(): void {
    this.db.close();
    log.info('Vector store closed');
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
        embedding float[${this.dimensions}]
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS execution_logs (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        tool_name TEXT,
        input JSON,
        output JSON,
        duration_ms INTEGER,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        action TEXT,
        actor TEXT,
        resource TEXT,
        result TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
}
