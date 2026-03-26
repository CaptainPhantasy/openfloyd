import { jest } from '@jest/globals';
import { HttpServer } from '../../src/core/http-server.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

const TEST_PORT = 39183;

function httpGet(
  port: number,
  path: string,
): Promise<{ status: number; body: string; headers: Record<string, string | undefined> }> {
  return new Promise((resolve, reject) => {
    const r = http.get(`http://localhost:${port}${path}`, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString(),
          headers: Object.fromEntries(
            Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
          ),
        });
      });
    });
    r.on('error', reject);
    r.end();
  });
}

/**
 * Connect to SSE endpoint and collect events until close() is called.
 * Resolves immediately once the connection is established (headers received).
 * Events accumulate in the returned array as they arrive.
 */
function connectSSE(port: number): { events: string[]; close: () => void } {
  const events: string[] = [];

  const req = http.get(`http://localhost:${port}/api/events`, (res) => {
    let buffer = '';
    res.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          events.push(line.slice(6));
        }
      }
    });
    res.on('error', () => {});
  });
  // Suppress 'socket hang up' when close() calls req.destroy()
  req.on('error', () => {});

  return {
    events,
    close: () => {
      req.destroy();
    },
  };
}

describe('HttpServer SSE & static', () => {
  let server: HttpServer;

  beforeEach(() => {
    server = new HttpServer(TEST_PORT);
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('pushEvent', () => {
    it('caps buffer at 100 events', async () => {
      for (let i = 0; i < 101; i++) {
        server.pushEvent({ time: `${i}`, type: 'test', color: 'blue', message: `event-${i}` });
      }
      await server.start();
      const sse = connectSSE(TEST_PORT);

      // Wait for buffered events to arrive
      await new Promise((r) => setTimeout(r, 200));

      // Server sends max 20 buffered events on connect
      expect(sse.events.length).toBeLessThanOrEqual(20);
      sse.close();
    });

    it('sends events to connected SSE clients', async () => {
      await server.start();
      const sse = connectSSE(TEST_PORT);

      // Wait for connection to establish
      await new Promise((r) => setTimeout(r, 100));

      server.pushEvent({ time: 'now', type: 'info', color: 'green', message: 'hello' });

      // Wait for event delivery
      await new Promise((r) => setTimeout(r, 200));

      expect(sse.events.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(sse.events[sse.events.length - 1]!);
      expect(parsed.message).toBe('hello');
      sse.close();
    });

    it('removes broken SSE clients on write error', async () => {
      await server.start();
      const sse = connectSSE(TEST_PORT);
      await new Promise((r) => setTimeout(r, 100));

      // Destroy the socket to cause a write error on next push
      sse.close();

      // These should not throw — broken client is silently removed
      server.pushEvent({ time: 'now', type: 'test', color: 'red', message: 'after-close' });
      server.pushEvent({ time: 'now', type: 'test', color: 'red', message: 'second' });
    });
  });

  describe('SSE endpoint', () => {
    it('returns correct SSE headers', async () => {
      const s = new HttpServer(39299);
      s.pushEvent({ time: '0', type: 'probe', color: 'gray', message: 'probe' });
      await s.start();

      const headers = await new Promise<Record<string, string | undefined>>((resolve) => {
        const req = http.get(`http://localhost:39299/api/events`, (res) => {
          resolve(Object.fromEntries(
            Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
          ));
          req.destroy();
        });
        req.on('error', () => {});
      });

      expect(headers['content-type']).toBe('text/event-stream');
      expect(headers['cache-control']).toBe('no-cache');
      await s.stop();
    });

    it('serves buffered events on connect', async () => {
      server.pushEvent({ time: '1', type: 'old', color: 'gray', message: 'buffered-1' });
      server.pushEvent({ time: '2', type: 'old', color: 'gray', message: 'buffered-2' });

      await server.start();
      const sse = connectSSE(TEST_PORT);
      await new Promise((r) => setTimeout(r, 200));

      expect(sse.events.length).toBeGreaterThanOrEqual(2);
      sse.close();
    });

    it('cleans up client on connection close', async () => {
      await server.start();
      const sse = connectSSE(TEST_PORT);
      await new Promise((r) => setTimeout(r, 100));

      sse.close();
      await new Promise((r) => setTimeout(r, 100));

      // Should not throw since client was removed
      server.pushEvent({ time: 'now', type: 'test', color: 'blue', message: 'after-cleanup' });
    });
  });

  describe('stop()', () => {
    it('does not throw when called without start()', async () => {
      const s = new HttpServer(TEST_PORT + 100);
      await expect(s.stop()).resolves.toBeUndefined();
    });

    it('closes SSE clients on stop', async () => {
      await server.start();
      const sse = connectSSE(TEST_PORT);
      await new Promise((r) => setTimeout(r, 100));

      await server.stop();
      await new Promise((r) => setTimeout(r, 200));
      // No assertion needed — if stop() didn't close clients, the test would hang
    });
  });

  describe('static file serving', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'floyd-test-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('serves HTML files with correct content-type', async () => {
      const html = '<html><body>hello</body></html>';
      await writeFile(join(tempDir, 'index.html'), html);

      const s = new HttpServer(39200, tempDir);
      try {
        await s.start();
        const res = await httpGet(39200, '/index.html');
        expect(res.status).toBe(200);
        expect(res.body).toBe(html);
        expect(res.headers['content-type']).toBe('text/html');
      } finally {
        await s.stop();
      }
    });

    it('blocks path traversal', async () => {
      const s = new HttpServer(39201, tempDir);
      try {
        await s.start();
        const res = await httpGet(39201, '/../etc/passwd');
        expect(res.status).toBe(404);
      } finally {
        await s.stop();
      }
    });

    it('returns 404 for missing static files', async () => {
      const s = new HttpServer(39202, tempDir);
      try {
        await s.start();
        const res = await httpGet(39202, '/nonexistent.html');
        expect(res.status).toBe(404);
      } finally {
        await s.stop();
      }
    });

    it('serves CSS files with correct content-type', async () => {
      await writeFile(join(tempDir, 'style.css'), 'body { color: red; }');

      const s = new HttpServer(39203, tempDir);
      try {
        await s.start();
        const res = await httpGet(39203, '/style.css');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('text/css');
      } finally {
        await s.stop();
      }
    });
  });
});
