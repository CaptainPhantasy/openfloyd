import { createLogger } from '../utils/logger.js';
import {
  WorkerState,
  type WorkerType,
  type PoolStats,
  type Heartbeat,
} from '../types/index.js';
import { WORKER_CONFIGS } from './worker-types.js';
import { WorkerAgent } from './worker-agent.js';
import { VibeBoxBridge } from './vibebox-bridge.js';
import { HeartbeatMonitor } from './heartbeat-monitor.js';

const log = createLogger('pool-manager');

export class PoolManager {
  private workers = new Map<string, WorkerAgent>();
  private bridge: VibeBoxBridge;
  private monitor: HeartbeatMonitor;
  private workerCounter = 0;

  constructor() {
    this.bridge = new VibeBoxBridge();
    this.monitor = new HeartbeatMonitor();

    this.monitor.onStale((workerId) => {
      log.warn({ workerId }, 'Worker stale — monitoring');
    });

    this.monitor.onDead((workerId) => {
      log.error({ workerId }, 'Worker dead — terminating');
      void this.terminateWorker(workerId);
    });
  }

  async initialize(): Promise<void> {
    await Promise.resolve();
    this.monitor.start();
    log.info('Pool manager initialized');
  }

  async shutdown(): Promise<void> {
    this.monitor.stop();
    const workerIds = Array.from(this.workers.keys());
    for (const id of workerIds) {
      await this.terminateWorker(id);
    }
    log.info('Pool manager shut down');
  }

  async spawnWorker(type: WorkerType): Promise<WorkerAgent> {
    this.workerCounter++;
    const id = `${type}-${this.workerCounter}`;
    const config = WORKER_CONFIGS[type];

    const worker = new WorkerAgent(id, type, config, this.bridge);
    this.workers.set(id, worker);
    this.monitor.registerWorker(id);

    try {
      await worker.spawn();
      await worker.initialize();
      log.info({ workerId: id, type }, 'Worker spawned and ready');
    } catch (err) {
      log.error({ err, workerId: id }, 'Failed to spawn worker');
      this.workers.delete(id);
      this.monitor.unregisterWorker(id);
      throw err;
    }

    return worker;
  }

  async terminateWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      log.warn({ workerId }, 'Worker not found for termination');
      return;
    }

    await worker.terminate();
    this.workers.delete(workerId);
    this.monitor.unregisterWorker(workerId);
    log.info({ workerId }, 'Worker terminated');
  }

  getWorker(workerId: string): WorkerAgent | undefined {
    return this.workers.get(workerId);
  }

  getWorkersByType(type: WorkerType): WorkerAgent[] {
    return Array.from(this.workers.values()).filter((w) => w.type === type);
  }

  getAllWorkers(): WorkerAgent[] {
    return Array.from(this.workers.values());
  }

  recordHeartbeat(heartbeat: Heartbeat): void {
    this.monitor.recordHeartbeat(heartbeat);
    const worker = this.workers.get(heartbeat.workerId);
    if (worker) {
      worker.recordHeartbeat(heartbeat);
    }
  }

  getStaleWorkers(): WorkerAgent[] {
    return Array.from(this.workers.values()).filter((w) => w.isStale());
  }

  getPoolStats(): PoolStats {
    const byType: Record<string, number> = {};
    const byState: Record<string, number> = {};
    let totalTokens = 0;
    let totalCost = 0;

    for (const worker of this.workers.values()) {
      byType[worker.type] = (byType[worker.type] ?? 0) + 1;
      byState[worker.state] = (byState[worker.state] ?? 0) + 1;
      totalTokens += worker.getTokenUsage().total_tokens;
      totalCost += worker.getCost();
    }

    return {
      totalWorkers: this.workers.size,
      byType,
      byState,
      totalTokens,
      totalCost,
    };
  }

  getHealthStatus(): { healthy: number; stale: number; dead: number } {
    let healthy = 0, stale = 0, dead = 0;
    for (const worker of this.workers.values()) {
      if (worker.isDead()) dead++;
      else if (worker.isStale()) stale++;
      else if (worker.state !== WorkerState.TERMINATED) healthy++;
    }
    return { healthy, stale, dead };
  }

  getMonitor(): HeartbeatMonitor {
    return this.monitor;
  }

  getBridge(): VibeBoxBridge {
    return this.bridge;
  }
}
