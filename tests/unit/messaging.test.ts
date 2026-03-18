import { jest } from '@jest/globals';
import { MessageQueue } from '../../src/messaging/message-queue.js';
import { AuthorizationManager } from '../../src/messaging/auth-manager.js';

describe('MessageQueue', () => {
  let queue: MessageQueue;
  let sendFn: jest.Mock;

  beforeEach(() => {
    queue = new MessageQueue({ rateLimit: 5, rateWindowMs: 60_000 });
    sendFn = jest.fn().mockResolvedValue(undefined) as jest.Mock;
    queue.setSendFunction(sendFn as unknown as (r: string, c: string) => Promise<void>);
  });

  afterEach(() => {
    queue.stop();
  });

  describe('enqueue', () => {
    it('enqueues and processes a message', async () => {
      queue.enqueue('123@s.whatsapp.net', 'Hello');
      await new Promise((r) => setTimeout(r, 100));
      expect(sendFn).toHaveBeenCalledWith('123@s.whatsapp.net', 'Hello');
      expect(queue.stats.sent).toBe(1);
    });

    it('returns message IDs', () => {
      const ids = queue.enqueue('123@s.whatsapp.net', 'Hello');
      expect(ids).toHaveLength(1);
      expect(typeof ids[0]).toBe('string');
    });

    it('splits long messages', () => {
      const longContent = 'A'.repeat(5000);
      const ids = queue.enqueue('123@s.whatsapp.net', longContent);
      expect(ids.length).toBeGreaterThan(1);
    });
  });

  describe('splitMessage', () => {
    it('returns single chunk for short messages', () => {
      const chunks = queue.splitMessage('Short message');
      expect(chunks).toHaveLength(1);
    });

    it('splits at newline boundaries', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}: ${'x'.repeat(80)}`);
      const content = lines.join('\n');
      const chunks = queue.splitMessage(content);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(4096);
      }
    });

    it('handles single very long line', () => {
      const longLine = 'X'.repeat(10000);
      const chunks = queue.splitMessage(longLine);
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('rate limiting', () => {
    it('respects rate limit', async () => {
      const fastQueue = new MessageQueue({ rateLimit: 2, rateWindowMs: 200 });
      fastQueue.setSendFunction(sendFn as unknown as (r: string, c: string) => Promise<void>);

      for (let i = 0; i < 4; i++) {
        fastQueue.enqueue('123@s.whatsapp.net', `Message ${i}`);
      }

      await new Promise((r) => setTimeout(r, 50));
      expect(sendFn.mock.calls.length).toBeLessThanOrEqual(2);

      fastQueue.stop();
    });
  });

  describe('retry', () => {
    it('retries failed sends', async () => {
      const failThenSucceed = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue(undefined) as jest.Mock;

      queue.setSendFunction(failThenSucceed as unknown as (r: string, c: string) => Promise<void>);
      queue.enqueue('123@s.whatsapp.net', 'Retry me');

      await new Promise((r) => setTimeout(r, 10_000));
      expect(failThenSucceed.mock.calls.length).toBeGreaterThanOrEqual(2);

      queue.stop();
    }, 15_000);
  });

  describe('stop/start', () => {
    it('stops processing', () => {
      queue.stop();
      queue.enqueue('123@s.whatsapp.net', 'Should not send');
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('clears queue', () => {
      queue.stop();
      queue.enqueue('123@s.whatsapp.net', 'msg1');
      queue.enqueue('123@s.whatsapp.net', 'msg2');
      queue.clear();
      expect(queue.size).toBe(0);
    });
  });
});

describe('AuthorizationManager', () => {
  let auth: AuthorizationManager;

  beforeEach(() => {
    auth = new AuthorizationManager(['+18123405761', '+11234567890']);
  });

  describe('isAuthorized', () => {
    it('authorizes whitelisted numbers', () => {
      expect(auth.isAuthorized('18123405761@s.whatsapp.net')).toBe(true);
    });

    it('rejects non-whitelisted numbers', () => {
      expect(auth.isAuthorized('19999999999@s.whatsapp.net')).toBe(false);
    });

    it('normalizes numbers with special characters', () => {
      expect(auth.isAuthorized('11234567890@s.whatsapp.net')).toBe(true);
    });
  });

  describe('addNumber', () => {
    it('adds new authorized numbers', () => {
      auth.addNumber('+15555555555');
      expect(auth.isAuthorized('15555555555@s.whatsapp.net')).toBe(true);
    });
  });

  describe('removeNumber', () => {
    it('removes authorized numbers', () => {
      auth.removeNumber('+18123405761');
      expect(auth.isAuthorized('18123405761@s.whatsapp.net')).toBe(false);
    });
  });

  describe('getAllowedNumbers', () => {
    it('returns all whitelisted numbers', () => {
      const numbers = auth.getAllowedNumbers();
      expect(numbers).toHaveLength(2);
      expect(numbers).toContain('18123405761');
      expect(numbers).toContain('11234567890');
    });
  });
});
