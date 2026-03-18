import { jest } from '@jest/globals';
import { HttpServer } from '../../src/core/http-server.js';

describe('HttpServer', () => {
  let server: HttpServer;
  const TEST_PORT = 39182;

  beforeEach(() => {
    server = new HttpServer(TEST_PORT);
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('health endpoint', () => {
    it('returns 200 with status ok', async () => {
      await server.start();

      const response = await fetch(`http://localhost:${TEST_PORT}/health`);
      const body = await response.json() as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body['status']).toBe('ok');
      expect(body['uptime']).toBeDefined();
      expect(body['timestamp']).toBeDefined();
    });
  });

  describe('stats endpoint', () => {
    it('returns 503 when no stats provider set', async () => {
      await server.start();

      const response = await fetch(`http://localhost:${TEST_PORT}/stats`);
      expect(response.status).toBe(503);
    });

    it('returns stats when provider is set', async () => {
      server.setStatsProvider(() => ({
        state: 'idle',
        uptime: 100,
        eventLoop: { processed: 5, failed: 1, queued: 0, sources: 2 },
      }));
      await server.start();

      const response = await fetch(`http://localhost:${TEST_PORT}/stats`);
      const body = await response.json() as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body['state']).toBe('idle');
      expect(body['uptime']).toBe(100);
    });
  });

  describe('webhook endpoint', () => {
    it('accepts POST and returns received: true', async () => {
      await server.start();

      const response = await fetch(`http://localhost:${TEST_PORT}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test' }),
      });
      const body = await response.json() as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body['received']).toBe(true);
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      await server.start();

      const response = await fetch(`http://localhost:${TEST_PORT}/nonexistent`);
      expect(response.status).toBe(404);
    });
  });
});
