import cron from 'node-cron';
import type { CronBlock } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('cron-parser');

export interface CronJob {
  block: CronBlock;
  task: cron.ScheduledTask;
  isRunning: boolean;
}

export type CronCallback = (block: CronBlock) => void | Promise<void>;

export function validateCronExpression(expression: string): boolean {
  return cron.validate(expression);
}

export class CronScheduler {
  private jobs: Map<string, CronJob> = new Map();
  private defaultCallback: CronCallback | null = null;

  setDefaultCallback(callback: CronCallback): void {
    this.defaultCallback = callback;
  }

  registerBlock(block: CronBlock, callback?: CronCallback): void {
    if (!validateCronExpression(block.schedule)) {
      throw new Error(`Invalid CRON expression "${block.schedule}" in block "${block.title}"`);
    }

    if (this.jobs.has(block.id)) {
      log.warn({ blockId: block.id }, 'Replacing existing CRON job');
      this.unregister(block.id);
    }

    const handler = callback ?? this.defaultCallback;
    if (!handler) {
      throw new Error('No callback provided and no default callback set');
    }

    const task = cron.schedule(
      block.schedule,
      () => {
        log.info({ blockId: block.id, title: block.title }, 'CRON job fired');
        void Promise.resolve(handler(block)).catch((error: unknown) => {
          log.error({ err: error, blockId: block.id }, 'CRON job handler failed');
        });
      },
      {
        scheduled: false,
        timezone: block.metadata?.timezone,
      },
    );

    this.jobs.set(block.id, { block, task, isRunning: false });
    log.info(
      { blockId: block.id, schedule: block.schedule, title: block.title },
      'CRON job registered',
    );
  }

  registerBlocks(blocks: CronBlock[], callback?: CronCallback): void {
    for (const block of blocks) {
      this.registerBlock(block, callback);
    }
  }

  start(blockId?: string): void {
    if (blockId) {
      const job = this.jobs.get(blockId);
      if (!job) throw new Error(`CRON job "${blockId}" not found`);
      if (!job.isRunning) {
        job.task.start();
        job.isRunning = true;
        log.info({ blockId, title: job.block.title }, 'CRON job started');
      }
      return;
    }

    for (const [id, job] of this.jobs) {
      if (!job.isRunning) {
        job.task.start();
        job.isRunning = true;
        log.info({ blockId: id, title: job.block.title }, 'CRON job started');
      }
    }
  }

  stop(blockId?: string): void {
    if (blockId) {
      const job = this.jobs.get(blockId);
      if (!job) throw new Error(`CRON job "${blockId}" not found`);
      job.task.stop();
      job.isRunning = false;
      log.info({ blockId }, 'CRON job stopped');
      return;
    }

    for (const [id, job] of this.jobs) {
      job.task.stop();
      job.isRunning = false;
      log.info({ blockId: id }, 'CRON job stopped');
    }
  }

  unregister(blockId: string): void {
    const job = this.jobs.get(blockId);
    if (!job) return;
    job.task.stop();
    this.jobs.delete(blockId);
    log.info({ blockId }, 'CRON job unregistered');
  }

  getJob(blockId: string): CronJob | undefined {
    return this.jobs.get(blockId);
  }

  getActiveJobs(): CronJob[] {
    return [...this.jobs.values()].filter((j) => j.isRunning);
  }

  getAllJobs(): CronJob[] {
    return [...this.jobs.values()];
  }

  destroy(): void {
    for (const [id, job] of this.jobs) {
      job.task.stop();
      log.debug({ blockId: id }, 'CRON job destroyed');
    }
    this.jobs.clear();
    log.info('CRON scheduler destroyed');
  }
}
