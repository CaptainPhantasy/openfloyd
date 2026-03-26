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

import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
jest.mock('@whiskeysockets/baileys', () => ({
  useMultiFileAuthState: jest.fn().mockResolvedValue({
    state: { creds: {} },
    saveCreds: jest.fn(),
  }),
}));

import { WhatsAppAuthManager } from '../../src/messaging/auth-manager.js';

describe('WhatsAppAuthManager', () => {
  let tempDirs: string[];

  beforeEach(() => {
    tempDirs = [];
  });

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'wa-auth-test-'));
    tempDirs.push(dir);
    return dir;
  }

  describe('constructor', () => {
    it('resolves relative path to absolute', () => {
      const manager = new WhatsAppAuthManager({ authPath: './some-relative-path' });
      const result = manager.getAuthPath();
      expect(result).toBe(resolve('./some-relative-path'));
    });
  });

  describe('getAuthPath', () => {
    it('returns absolute path', async () => {
      const dir = await makeTempDir();
      const manager = new WhatsAppAuthManager({ authPath: dir });
      expect(manager.getAuthPath()).toBe(dir);
      expect(manager.getAuthPath()).toMatch(/^\//);
    });
  });

  describe('ensureAuthDirectory', () => {
    it('creates directory if it does not exist', async () => {
      const base = await makeTempDir();
      const authDir = join(base, 'new-auth-dir');
      const manager = new WhatsAppAuthManager({ authPath: authDir });

      await manager.ensureAuthDirectory();

      // Verify directory was created by trying to access it
      const { access, constants } = await import('node:fs/promises');
      await expect(access(authDir, constants.F_OK)).resolves.toBeUndefined();
    });

    it('does not throw if directory already exists', async () => {
      const dir = await makeTempDir();
      const manager = new WhatsAppAuthManager({ authPath: dir });

      await expect(manager.ensureAuthDirectory()).resolves.toBeUndefined();
    });
  });

  describe('loadAuthState', () => {
    it('calls useMultiFileAuthState with resolved path', async () => {
      const dir = await makeTempDir();
      const manager = new WhatsAppAuthManager({ authPath: dir });

      const result = await manager.loadAuthState();

      // Mocked baileys returns { state: { creds: {} }, saveCreds: jest.fn() }
      expect(result).toBeDefined();
      expect(result.state).toBeDefined();
      expect(result.saveCreds).toBeDefined();
    });
  });
});

// ── Additional branch coverage tests ──────────────────────────────────────

describe('MessageQueue additional coverage', () => {
  it('start processes queued messages after stop', async () => {
    const mq = new MessageQueue();
    let sent = 0;
    mq.setSendFunction(async () => { sent++; });
    mq.stop();
    mq.enqueue('123', 'hello');
    expect(mq.size).toBe(1);
    mq.start();
    // Give it time to process
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toBe(1);
    expect(mq.size).toBe(0);
  });

  it('requeues message on send failure', async () => {
    jest.useFakeTimers();
    const mq = new MessageQueue({ rateLimit: 100 });
    let attempts = 0;
    mq.setSendFunction(async () => {
      attempts++;
      if (attempts <= 2) throw new Error('transient');
    });
    mq.enqueue('123', 'retry me', 3);
    await jest.advanceTimersByTimeAsync(6000);
    expect(attempts).toBeGreaterThanOrEqual(2);
    jest.useRealTimers();
  });

  it('drops message after max retries', async () => {
    jest.useFakeTimers();
    const mq = new MessageQueue({ rateLimit: 100 });
    mq.setSendFunction(async () => {
      throw new Error('permanent');
    });
    mq.enqueue('123', 'will fail', 2);
    await jest.advanceTimersByTimeAsync(20000);
    expect(mq.stats.failed).toBeGreaterThan(0);
    expect(mq.stats.dropped).toBeGreaterThan(0);
    jest.useRealTimers();
  });

  it('splitMessage handles very long lines', () => {
    const mq = new MessageQueue();
    const longLine = 'x'.repeat(5000);
    const chunks = mq.splitMessage(longLine);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.length).toBe(4096);
    expect(chunks[1]!.length).toBe(5000 - 4096);
  });

  it('splitMessage handles multiline content near boundary', () => {
    const mq = new MessageQueue();
    const lines = [];
    for (let i = 0; i < 100; i++) lines.push(`line ${i} content here`);
    const content = lines.join('\n');
    const chunks = mq.splitMessage(content);
    // Should split into at least 1 chunk
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Reassembled content should match (minus trailing whitespace)
    expect(chunks.join('').trim()).toBe(content.trim());
  });

  it('clear removes all queued messages', () => {
    const mq = new MessageQueue();
    mq.stop();
    mq.enqueue('123', 'a');
    mq.enqueue('123', 'b');
    expect(mq.size).toBe(2);
    mq.clear();
    expect(mq.size).toBe(0);
  });
});
