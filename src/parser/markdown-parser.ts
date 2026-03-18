import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { marked } from 'marked';
import type { CronBlock, DirectiveBlock, ParsedHeartbeat, ParsedSoul } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('markdown-parser');

const CRON_REGEX = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;
const SCHEDULE_PREFIX = /^\*\*Schedule:\*\*\s*/i;
const ACTION_PREFIX = /^\*\*Action:\*\*\s*/i;

interface RawSection {
  title: string;
  level: number;
  body: string;
}

function splitIntoSections(markdown: string): RawSection[] {
  const sections: RawSection[] = [];
  const lines = markdown.split('\n');
  let currentTitle = '';
  let currentLevel = 0;
  let bodyLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentTitle) {
        sections.push({
          title: currentTitle,
          level: currentLevel,
          body: bodyLines.join('\n').trim(),
        });
      }
      currentLevel = headingMatch[1]!.length;
      currentTitle = headingMatch[2]!.trim();
      bodyLines = [];
    } else {
      bodyLines.push(line);
    }
  }

  if (currentTitle) {
    sections.push({
      title: currentTitle,
      level: currentLevel,
      body: bodyLines.join('\n').trim(),
    });
  }

  return sections;
}

function extractCronFromSection(section: RawSection): CronBlock | null {
  const lines = section.body.split('\n');
  let schedule: string | null = null;
  const actionLines: string[] = [];
  let inAction = false;
  let timezone: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    if (SCHEDULE_PREFIX.test(trimmed)) {
      const raw = trimmed.replace(SCHEDULE_PREFIX, '').trim();
      const cronMatch = raw.match(/^([^(]+)/);
      if (cronMatch) {
        const candidate = cronMatch[1]!.trim();
        if (CRON_REGEX.test(candidate)) {
          schedule = candidate;
        }
      }
      const tzMatch = raw.match(/timezone:\s*(\S+)/i);
      if (tzMatch) {
        timezone = tzMatch[1];
      }
      continue;
    }

    if (ACTION_PREFIX.test(trimmed)) {
      inAction = true;
      const inline = trimmed.replace(ACTION_PREFIX, '').trim();
      if (inline) actionLines.push(inline);
      continue;
    }

    if (inAction && trimmed) {
      actionLines.push(trimmed);
    }
  }

  if (!schedule) return null;

  return {
    id: randomUUID(),
    schedule,
    title: section.title,
    action: actionLines.join('\n'),
    metadata: timezone ? { timezone } : undefined,
  };
}

function categorizeDirective(title: string): DirectiveBlock['category'] {
  const lower = title.toLowerCase();
  if (lower.includes('identity') || lower.includes('who')) return 'identity';
  if (lower.includes('constraint') || lower.includes('security') || lower.includes('rule'))
    return 'constraint';
  if (lower.includes('mandate') || lower.includes('core') || lower.includes('must'))
    return 'mandate';
  return 'preference';
}

export async function parseHeartbeat(filePath: string): Promise<ParsedHeartbeat> {
  const raw = await readFile(filePath, 'utf-8');
  const sections = splitIntoSections(raw);
  const cronBlocks: CronBlock[] = [];

  for (const section of sections) {
    const block = extractCronFromSection(section);
    if (block) {
      cronBlocks.push(block);
    }
  }

  log.info({ path: filePath, cronBlocks: cronBlocks.length }, 'Parsed HEARTBEAT.md');
  return { cronBlocks, raw };
}

export async function parseSoul(filePath: string): Promise<ParsedSoul> {
  const raw = await readFile(filePath, 'utf-8');
  const sections = splitIntoSections(raw);
  const directives: DirectiveBlock[] = [];

  for (const section of sections) {
    if (section.level === 0) continue;
    if (!section.body.trim()) continue;

    directives.push({
      id: randomUUID(),
      category: categorizeDirective(section.title),
      title: section.title,
      content: section.body,
    });
  }

  log.info({ path: filePath, directives: directives.length }, 'Parsed SOUL.md');
  return { directives, raw };
}

export async function parseMarkdownToHtml(filePath: string): Promise<string> {
  const raw = await readFile(filePath, 'utf-8');
  return await marked.parse(raw);
}
