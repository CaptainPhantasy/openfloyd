import { createLogger } from '../utils/logger.js';
import type { Heartbeat } from '../types/index.js';

const log = createLogger('heartbeat-monitor');

const CHECK_INTERVAL = 5_000;
const STALE_THRESHOLD = 15_000;
const DEAD_THRESHOLD = 30_000;

export class HeartbeatMonitor {
  private heartbeats = new Map<string, Heartbeat>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private staleCallbacks: ((workerId: string) => void)[] = [];
  private deadCallbacks: ((workerId: string) => void)[] = [];
  private notifiedStale = new Set<string>();
  private notifiedDead = new Set<string>();

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.check(), CHECK_INTERVAL);
    this.interval.unref();
    log.info('Heartbeat monitor started');
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    log.info('Heartbeat monitor stopped');
  }

  registerWorker(workerId: string): void {
    this.heartbeats.set(workerId, {
      workerId,
      timestamp: new Date(),
      state: 'ready' as never,
      tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      memoryUsageMB: 0,
    });
    this.notifiedStale.delete(workerId);
    this.notifiedDead.delete(workerId);
  }

  unregisterWorker(workerId: string): void {
    this.heartbeats.delete(workerId);
    this.notifiedStale.delete(workerId);
    this.notifiedDead.delete(workerId);
  }

  recordHeartbeat(heartbeat: Heartbeat): void {
    this.heartbeats.set(heartbeat.workerId, heartbeat);
    this.notifiedStale.delete(heartbeat.workerId);
    this.notifiedDead.delete(heartbeat.workerId);
  }

  getLastHeartbeat(workerId: string): Heartbeat | undefined {
    return this.heartbeats.get(workerId);
  }

  onStale(callback: (workerId: string) => void): void {
    this.staleCallbacks.push(callback);
  }

  onDead(callback: (workerId: string) => void): void {
    this.deadCallbacks.push(callback);
  }

  private check(): void {
    const now = Date.now();
    for (const [workerId, heartbeat] of this.heartbeats) {
      const elapsed = now - heartbeat.timestamp.getTime();

      if (elapsed >= DEAD_THRESHOLD && !this.notifiedDead.has(workerId)) {
        this.notifiedDead.add(workerId);
        log.warn({ workerId, elapsed }, 'Worker declared dead');
        for (const cb of this.deadCallbacks) cb(workerId);
      } else if (elapsed >= STALE_THRESHOLD && !this.notifiedStale.has(workerId)) {
        this.notifiedStale.add(workerId);
        log.warn({ workerId, elapsed }, 'Worker marked stale');
        for (const cb of this.staleCallbacks) cb(workerId);
      }
    }
  }
}
