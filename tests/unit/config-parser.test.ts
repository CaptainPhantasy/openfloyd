import { jest } from '@jest/globals';
import { resolve } from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { parseHeartbeat, parseSoul } from '../../src/parser/markdown-parser.js';
import { CronScheduler, validateCronExpression } from '../../src/parser/cron-parser.js';
import { validateConfig, ValidationError } from '../../src/parser/schema-validator.js';

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
});
