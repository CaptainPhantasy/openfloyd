import { WorkerType, type WorkerConfig } from '../types/index.js';

export const WORKER_CONFIGS: Record<WorkerType, WorkerConfig> = {
  [WorkerType.CODER]: {
    type: WorkerType.CODER,
    llm: { provider: 'zai', model: 'glm-4', maxTokens: 8192 },
    tools: ['edit', 'bash', 'read', 'grep', 'write'],
    timeout: 300_000,
    memoryMB: 512,
  },
  [WorkerType.TESTER]: {
    type: WorkerType.TESTER,
    llm: { provider: 'zai', model: 'glm-4', maxTokens: 4096 },
    tools: ['bash', 'read', 'grep'],
    timeout: 180_000,
    memoryMB: 256,
  },
  [WorkerType.REVIEWER]: {
    type: WorkerType.REVIEWER,
    llm: { provider: 'zai', model: 'glm-5-turbo', maxTokens: 8192 },
    tools: ['read', 'grep', 'lsp'],
    timeout: 120_000,
    memoryMB: 256,
  },
  [WorkerType.DEPLOYER]: {
    type: WorkerType.DEPLOYER,
    llm: { provider: 'zai', model: 'glm-4', maxTokens: 4096 },
    tools: ['bash', 'read'],
    timeout: 600_000,
    memoryMB: 512,
  },
  [WorkerType.RESEARCHER]: {
    type: WorkerType.RESEARCHER,
    llm: { provider: 'zai', model: 'glm-5-turbo', maxTokens: 8192 },
    tools: ['read', 'write'],
    timeout: 180_000,
    memoryMB: 256,
  },
  [WorkerType.MARKETER]: {
    type: WorkerType.MARKETER,
    llm: { provider: 'zai', model: 'glm-5-turbo', maxTokens: 8192 },
    tools: ['read', 'write'],
    timeout: 300_000,
    memoryMB: 256,
  },
};
