import { resolve } from 'node:path';
import { Orchestrator } from './core/orchestrator.js';
import { logger } from './utils/logger.js';

const WORKSPACE = process.env['WORKSPACE_PATH'] ?? resolve(process.cwd(), 'workspace');

async function main(): Promise<void> {
  logger.info({ pid: process.pid, nodeVersion: process.version }, 'OPEN-FLOYD starting');

  const orchestrator = new Orchestrator({
    workspacePath: WORKSPACE,
    heartbeatPath: resolve(WORKSPACE, 'HEARTBEAT.md'),
    soulPath: resolve(WORKSPACE, 'SOUL.md'),
    configPath: resolve(process.cwd(), 'config', 'default.json'),
  });

  await orchestrator.start();

  logger.info({
    state: orchestrator.getState(),
    stats: orchestrator.getStats(),
  }, 'OPEN-FLOYD is live');
}

main().catch((error) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  logger.fatal({ err: error }, 'Failed to start OPEN-FLOYD');
  process.exit(1);
});
