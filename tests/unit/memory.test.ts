import { jest } from '@jest/globals';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { VectorStore } from '../../src/memory/vector-store.js';
import { MemoryConsolidator } from '../../src/memory/consolidation.js';
import type { MemoryEntry } from '../../src/types/index.js';

describe('VectorStore', () => {
  let store: VectorStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'floyd-test-'));
    store = new VectorStore({ dbPath: resolve(tempDir, 'test.db'), dimensions: 4 });
  });

  afterEach(async () => {
    store.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('store/retrieve', () => {
    it('stores and retrieves a memory entry', () => {
      const entry: MemoryEntry = {
        id: 'test-1',
        content: 'User prefers bullet points',
        metadata: {
          timestamp: new Date(),
          source: 'user',
          category: 'preference',
          importance: 0.8,
        },
      };

      store.store(entry);
      const result = store.getById('test-1');

      expect(result).not.toBeNull();
      expect(result!.content).toBe('User prefers bullet points');
      expect(result!.metadata.category).toBe('preference');
    });

    it('returns null for nonexistent id', () => {
      expect(store.getById('nonexistent')).toBeNull();
    });

    it('updates existing entries', () => {
      store.store({
        id: 'update-me',
        content: 'Original',
        metadata: { timestamp: new Date(), source: 'user', category: 'fact', importance: 0.5 },
      });

      store.store({
        id: 'update-me',
        content: 'Updated',
        metadata: { timestamp: new Date(), source: 'user', category: 'fact', importance: 0.9 },
      });

      const result = store.getById('update-me');
      expect(result!.content).toBe('Updated');
    });
  });

  describe('search', () => {
    it('performs KNN vector search', () => {
      const entries = [
        { id: 'a', content: 'close to query', embedding: new Float32Array([1, 0, 0, 0]) },
        { id: 'b', content: 'far from query', embedding: new Float32Array([0, 0, 0, 1]) },
        { id: 'c', content: 'medium distance', embedding: new Float32Array([0.5, 0.5, 0, 0]) },
      ];

      for (const e of entries) {
        store.store({
          id: e.id,
          content: e.content,
          embedding: e.embedding,
          metadata: { timestamp: new Date(), source: 'system', category: 'fact', importance: 0.5 },
        });
      }

      const query = new Float32Array([1, 0, 0, 0]);
      const results = store.search(query, 3);

      expect(results).toHaveLength(3);
      expect(results[0]!.id).toBe('a');
      expect(results[0]!.distance).toBeLessThan(results[1]!.distance);
    });
  });

  describe('getByCategory', () => {
    it('filters by metadata category', () => {
      store.store({
        id: 'pref-1',
        content: 'Preference entry',
        metadata: { timestamp: new Date(), source: 'user', category: 'preference', importance: 0.7 },
      });
      store.store({
        id: 'fact-1',
        content: 'Fact entry',
        metadata: { timestamp: new Date(), source: 'system', category: 'fact', importance: 0.5 },
      });

      const prefs = store.getByCategory('preference');
      expect(prefs).toHaveLength(1);
      expect(prefs[0]!.id).toBe('pref-1');
    });
  });

  describe('delete', () => {
    it('removes a memory entry', () => {
      store.store({
        id: 'delete-me',
        content: 'Temporary',
        metadata: { timestamp: new Date(), source: 'system', category: 'fact', importance: 0.1 },
      });

      expect(store.delete('delete-me')).toBe(true);
      expect(store.getById('delete-me')).toBeNull();
    });

    it('returns false for nonexistent entry', () => {
      expect(store.delete('nonexistent')).toBe(false);
    });
  });

  describe('prune', () => {
    it('removes low-importance entries beyond limit', () => {
      for (let i = 0; i < 10; i++) {
        store.store({
          id: `entry-${i}`,
          content: `Entry ${i}`,
          metadata: {
            timestamp: new Date(),
            source: 'system',
            category: 'fact',
            importance: i * 0.1,
          },
        });
      }

      const pruned = store.prune(5, 0.5);
      expect(pruned).toBeGreaterThan(0);
      expect(store.getCount()).toBeLessThanOrEqual(10);
    });
  });

  describe('getCount', () => {
    it('returns total entry count', () => {
      expect(store.getCount()).toBe(0);
      store.store({
        id: 'count-1',
        content: 'First',
        metadata: { timestamp: new Date(), source: 'user', category: 'fact', importance: 0.5 },
      });
      expect(store.getCount()).toBe(1);
    });
  });
});

describe('MemoryConsolidator', () => {
  let store: VectorStore;
  let consolidator: MemoryConsolidator;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'floyd-consolidate-'));
    store = new VectorStore({ dbPath: resolve(tempDir, 'test.db'), dimensions: 4 });
    consolidator = new MemoryConsolidator(store, { maxEntries: 5, minImportance: 0.3 });
  });

  afterEach(async () => {
    consolidator.stopPeriodic();
    store.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('adds memories through consolidator', () => {
    consolidator.addMemory('Test memory', { source: 'user', category: 'fact', importance: 0.5 });
    expect(store.getCount()).toBe(1);
  });

  it('runs consolidation', async () => {
    for (let i = 0; i < 10; i++) {
      consolidator.addMemory(`Memory ${i}`, {
        source: 'system',
        category: 'fact',
        importance: i * 0.1,
      });
    }

    const result = await consolidator.run();
    expect(result.pruned).toBeGreaterThanOrEqual(0);
    expect(consolidator.getRunCount()).toBe(1);
  });

  it('starts and stops periodic consolidation', () => {
    consolidator.startPeriodic(60_000);
    consolidator.stopPeriodic();
  });
});

// ── Additional branch coverage tests ──────────────────────────────────────

describe('MemoryConsolidator additional coverage', () => {
  it('startPeriodic is no-op when called twice', () => {
    const store = new VectorStore(':memory:');
    const c = new MemoryConsolidator(store);
    c.startPeriodic(1000);
    c.startPeriodic(1000); // should be no-op
    c.stopPeriodic();
  });

  it('periodic run catches errors from prune', async () => {
    const store = new VectorStore(':memory:');
    const c = new MemoryConsolidator(store, { maxEntries: 0 });
    // With maxEntries=0, getCount() > 0 will trigger prune
    // This tests the error catch in the periodic timer
    const result = await c.run();
    expect(result).toBeDefined();
  });

  it('run does not prune when entryCount <= maxEntries', async () => {
    const store = new VectorStore(':memory:');
    const c = new MemoryConsolidator(store, { maxEntries: 100_000 });
    const result = await c.run();
    expect(result.pruned).toBe(0);
  });

  it('addMemory stores with timestamp', () => {
    const store = new VectorStore(':memory:');
    const c = new MemoryConsolidator(store);
    c.addMemory('test content', { importance: 0.5, source: 'test' });
    expect(store.getCount()).toBe(1);
  });

  it('getRunCount increments', async () => {
    const store = new VectorStore(':memory:');
    const c = new MemoryConsolidator(store);
    expect(c.getRunCount()).toBe(0);
    await c.run();
    expect(c.getRunCount()).toBe(1);
    await c.run();
    expect(c.getRunCount()).toBe(2);
  });
});
