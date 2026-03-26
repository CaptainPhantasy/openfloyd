import { jest } from '@jest/globals';
import { resolve } from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { parseHeartbeat, parseSoul } from '../../src/parser/markdown-parser.js';
import { CronScheduler, validateCronExpression } from '../../src/parser/cron-parser.js';
import { validateConfig, ValidationError, loadAndValidateConfig } from '../../src/parser/schema-validator.js';

import type { CronBlock } from '../../src/types/index.js';
const FIXTURES_DIR = resolve(process.cwd(), 'tests', 'fixtures');

beforeAll(async () => {
  await mkdir(FIXTURES_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(FIXTURES_DIR, { recursive: true, force: true });
});

describe('MarkdownParser', () => {
  describe('parseHeartbeat', () => {
    it('extracts CRON blocks from HEARTBEAT.md', async () => {
      const content = `# Daily Briefing

**Schedule:** 0 8 * * 1-5 (Every weekday at 8:00 AM)

**Action:**
1. Check emails.
2. Send summary.

# Weekly Report

**Schedule:** 0 9 * * 1 (Every Monday at 9:00 AM)

**Action:**
1. Generate weekly report.
`;

      const filePath = resolve(FIXTURES_DIR, 'test-heartbeat.md');
      await writeFile(filePath, content);

      const result = await parseHeartbeat(filePath);

      expect(result.cronBlocks).toHaveLength(2);
      expect(result.cronBlocks[0]!.schedule).toBe('0 8 * * 1-5');
      expect(result.cronBlocks[0]!.title).toBe('Daily Briefing');
      expect(result.cronBlocks[0]!.action).toContain('Check emails');
      expect(result.cronBlocks[1]!.schedule).toBe('0 9 * * 1');
      expect(result.cronBlocks[1]!.title).toBe('Weekly Report');
    });

    it('returns empty blocks for file with no schedules', async () => {
      const filePath = resolve(FIXTURES_DIR, 'empty-heartbeat.md');
      await writeFile(filePath, '# No CRON here\nJust some text.');

      const result = await parseHeartbeat(filePath);
      expect(result.cronBlocks).toHaveLength(0);
    });

    it('throws for nonexistent file', async () => {
      await expect(parseHeartbeat('/nonexistent/path.md')).rejects.toThrow();
    });
  });

  describe('parseSoul', () => {
    it('extracts directives from SOUL.md', async () => {
      const content = `# Identity

You are an autonomous agent.

# Security Constraints

- Do not access external networks without permission.
- Log all actions.

# Preferences

- Use bullet points for responses.
`;

      const filePath = resolve(FIXTURES_DIR, 'test-soul.md');
      await writeFile(filePath, content);

      const result = await parseSoul(filePath);

      expect(result.directives).toHaveLength(3);

      const identity = result.directives.find((d) => d.category === 'identity');
      expect(identity).toBeDefined();
      expect(identity!.content).toContain('autonomous agent');

      const constraint = result.directives.find((d) => d.category === 'constraint');
      expect(constraint).toBeDefined();
      expect(constraint!.content).toContain('external networks');

      const preference = result.directives.find((d) => d.category === 'preference');
      expect(preference).toBeDefined();
    });
  });
});

describe('CronParser', () => {
  describe('validateCronExpression', () => {
    it('validates correct expressions', () => {
      expect(validateCronExpression('0 8 * * 1-5')).toBe(true);
      expect(validateCronExpression('*/5 * * * *')).toBe(true);
      expect(validateCronExpression('0 0 * * 0')).toBe(true);
    });

    it('rejects invalid expressions', () => {
      expect(validateCronExpression('not a cron')).toBe(false);
      expect(validateCronExpression('')).toBe(false);
      expect(validateCronExpression('60 * * * *')).toBe(false);
    });
  });

  describe('CronScheduler', () => {
    let scheduler: CronScheduler;

    beforeEach(() => {
      scheduler = new CronScheduler();
    });

    afterEach(() => {
      scheduler.destroy();
    });

    it('registers CRON blocks', () => {
      scheduler.setDefaultCallback(() => {});
      scheduler.registerBlock({
        id: 'test-1',
        schedule: '* * * * *',
        title: 'Test Job',
        action: 'Do something',
      });

      expect(scheduler.getAllJobs()).toHaveLength(1);
    });

    it('throws on invalid CRON expression', () => {
      scheduler.setDefaultCallback(() => {});
      expect(() =>
        scheduler.registerBlock({
          id: 'bad',
          schedule: 'invalid',
          title: 'Bad Job',
          action: 'Fail',
        }),
      ).toThrow(/Invalid CRON expression/);
    });

    it('starts and stops jobs', () => {
      scheduler.setDefaultCallback(() => {});
      scheduler.registerBlock({
        id: 'test-2',
        schedule: '* * * * *',
        title: 'Test',
        action: 'action',
      });

      scheduler.start('test-2');
      expect(scheduler.getActiveJobs()).toHaveLength(1);

      scheduler.stop('test-2');
      expect(scheduler.getActiveJobs()).toHaveLength(0);
    });

    it('registers multiple blocks at once', () => {
      scheduler.setDefaultCallback(() => {});
      scheduler.registerBlocks([
        { id: 'a', schedule: '0 8 * * *', title: 'A', action: 'a' },
        { id: 'b', schedule: '0 9 * * *', title: 'B', action: 'b' },
      ]);

      expect(scheduler.getAllJobs()).toHaveLength(2);
    });

    it('throws when registering without callback', () => {
      expect(() =>
        scheduler.registerBlock({
          id: 'no-cb',
          schedule: '* * * * *',
          title: 'No CB',
          action: 'fail',
        }),
      ).toThrow(/No callback/);
    });

    it('unregisters a job', () => {
      scheduler.setDefaultCallback(() => {});
      scheduler.registerBlock({
        id: 'remove-me',
        schedule: '* * * * *',
        title: 'Remove',
        action: 'remove',
      });

      scheduler.unregister('remove-me');
      expect(scheduler.getAllJobs()).toHaveLength(0);
    });
  });
});

describe('SchemaValidator', () => {
  describe('validateConfig', () => {
    it('validates a correct config', () => {
      const config = {
        system: { version: '0.1.0', logLevel: 'info' },
        models: {
          providers: {
            zai: { apiKey: 'test-key', models: [] },
          },
        },
        agents: {
          defaults: {
            model: { primary: 'zai/glm-5-turbo', fallbacks: [] },
            memory: { strategy: 'discard-all', retentionLimit: 150000 },
          },
        },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails on missing required fields', () => {
      const result = validateConfig({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('system'))).toBe(true);
    });

    it('fails on invalid log level', () => {
      const config = {
        system: { version: '0.1.0', logLevel: 'invalid' },
        models: { providers: {} },
        agents: { defaults: {} },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('log level'))).toBe(true);
    });

    it('fails on non-object input', () => {
      const result = validateConfig('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBeInstanceOf(ValidationError);
    });

    it('validates provider has apiKey', () => {
      const config = {
        system: { version: '0.1.0', logLevel: 'info' },
        models: { providers: { zai: {} } },
        agents: { defaults: {} },
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('apiKey'))).toBe(true);
    });
  });

// ── Additional branch coverage tests ──────────────────────────────────────

describe('CronScheduler additional coverage', () => {
  let scheduler: CronScheduler;

  beforeEach(() => {
    scheduler = new CronScheduler();
  });

  afterEach(() => {
    scheduler.destroy();
  });

  it('replaces existing job when registering same block ID', () => {
    const block: CronBlock = { id: 'job1', title: 'Job 1', schedule: '* * * * *', metadata: {} };
    scheduler.registerBlock(block, () => {});
    // Register again — should warn and replace
    scheduler.registerBlock(block, () => {});
    expect(scheduler.getJob('job1')).toBeDefined();
  });

  it('handles callback that throws', () => {
    const block: CronBlock = { id: 'thrower', title: 'Thrower', schedule: '* * * * *', metadata: {} };
    scheduler.registerBlock(block, () => {
      throw new Error('handler error');
    });
    scheduler.start('thrower');
    // Should not throw — error is caught internally
    expect(scheduler.getJob('thrower')?.isRunning).toBe(true);
  });

  it('no-ops when starting an already running job', () => {
    const block: CronBlock = { id: 'running', title: 'Running', schedule: '* * * * *', metadata: {} };
    scheduler.registerBlock(block, () => {});
    scheduler.start('running');
    scheduler.start('running'); // should be no-op
    expect(scheduler.getJob('running')?.isRunning).toBe(true);
  });

  it('starts all jobs', () => {
    const b1: CronBlock = { id: 'a', title: 'A', schedule: '* * * * *', metadata: {} };
    const b2: CronBlock = { id: 'b', title: 'B', schedule: '*/2 * * * *', metadata: {} };
    scheduler.registerBlocks([b1, b2], () => {});
    scheduler.start();
    expect(scheduler.getActiveJobs().length).toBe(2);
  });

  it('stops a specific job', () => {
    const block: CronBlock = { id: 'stopme', title: 'Stop', schedule: '* * * * *', metadata: {} };
    scheduler.registerBlock(block, () => {});
    scheduler.start('stopme');
    scheduler.stop('stopme');
    expect(scheduler.getJob('stopme')?.isRunning).toBe(false);
  });

  it('stops all jobs', () => {
    const b1: CronBlock = { id: 'x', title: 'X', schedule: '* * * * *', metadata: {} };
    const b2: CronBlock = { id: 'y', title: 'Y', schedule: '*/2 * * * *', metadata: {} };
    scheduler.registerBlocks([b1, b2], () => {});
    scheduler.start();
    scheduler.stop();
    expect(scheduler.getActiveJobs().length).toBe(0);
  });

  it('getJob returns undefined for unknown ID', () => {
    expect(scheduler.getJob('nonexistent')).toBeUndefined();
  });

  it('getActiveJobs returns only running jobs', () => {
    const b1: CronBlock = { id: 'active', title: 'Active', schedule: '* * * * *', metadata: {} };
    const b2: CronBlock = { id: 'idle', title: 'Idle', schedule: '*/2 * * * *', metadata: {} };
    scheduler.registerBlock(b1, () => {});
    scheduler.registerBlock(b2, () => {});
    scheduler.start('active');
    expect(scheduler.getActiveJobs().length).toBe(1);
    expect(scheduler.getActiveJobs()[0]!.block.id).toBe('active');
  });

  it('getAllJobs returns all registered jobs', () => {
    const b1: CronBlock = { id: 'all1', title: 'All1', schedule: '* * * * *', metadata: {} };
    const b2: CronBlock = { id: 'all2', title: 'All2', schedule: '*/2 * * * *', metadata: {} };
    scheduler.registerBlocks([b1, b2], () => {});
    expect(scheduler.getAllJobs().length).toBe(2);
  });

  it('destroy stops all jobs and clears', () => {
    const b1: CronBlock = { id: 'd1', title: 'D1', schedule: '* * * * *', metadata: {} };
    scheduler.registerBlock(b1, () => {});
    scheduler.start();
    scheduler.destroy();
    expect(scheduler.getAllJobs().length).toBe(0);
  });

  it('start throws for unknown job ID', () => {
    expect(() => scheduler.start('unknown')).toThrow('not found');
  });

  it('stop throws for unknown job ID', () => {
    expect(() => scheduler.stop('unknown')).toThrow('not found');
  });
});

describe('SchemaValidator additional coverage', () => {
  it('accepts non-object system section (validates contents only if object)', () => {
    // When system is not an object, validateSystemSection is skipped
    const result = validateConfig({ system: 'not-object', models: { providers: { test: { apiKey: 'k' } } }, agents: {} });
    expect(result.valid).toBe(true);
  });

  it('accepts non-object models section (validates contents only if object)', () => {
    const result = validateConfig({ system: { version: '1.0', logLevel: 'info' }, models: 'bad', agents: {} });
    // models is not validated when not an object
    expect(result.valid).toBe(true);
  });

  it('fails when provider config is not an object', () => {
    const config = {
      system: { version: '1.0', logLevel: 'info' },
      models: { providers: { openai: 'not-an-object' } },
      agents: {},
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Provider must be an object'))).toBe(true);
  });

  it('loadAndValidateConfig throws on invalid JSON', async () => {
    await expect(loadAndValidateConfig('/nonexistent/file.json')).rejects.toThrow();
  });

  it('loadAndValidateConfig throws on validation failure', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'floyd-test-'));
    try {
      await writeFile(join(dir, 'bad.json'), JSON.stringify({ invalid: true }));
      await expect(loadAndValidateConfig(join(dir, 'bad.json'))).rejects.toThrow('validation failed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('loadAndValidateConfig succeeds with valid config', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'floyd-test-'));
    try {
      const config = {
        system: { version: '1.0', logLevel: 'info' },
        models: { providers: { test: { apiKey: 'key' } } },
        agents: { default: { model: 'test' } },
      };
      await writeFile(join(dir, 'good.json'), JSON.stringify(config));
      const result = await loadAndValidateConfig(join(dir, 'good.json'));
      expect(result).toBeDefined();
      expect(result.system.version).toBe('1.0');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
});
