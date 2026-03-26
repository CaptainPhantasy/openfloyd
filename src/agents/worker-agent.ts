import { createLogger } from '../utils/logger.js';
import {
  WorkerState,
  type WorkerType,
  type WorkerConfig,
  type WorkerTask,
  type TaskProgress,
  type Heartbeat,
  type TokenUsage,
  type VMInstance,
  type CommandResult,
} from '../types/index.js';
import type { VibeBoxBridge } from './vibebox-bridge.js';

const log = createLogger('worker-agent');

export class WorkerAgent {
  readonly id: string;
  readonly type: WorkerType;
  readonly config: WorkerConfig;
  private _state: WorkerState = WorkerState.SPAWNING;
  private _lastHeartbeat: Date = new Date();
  private _currentTask: WorkerTask | null = null;
  private _progress: TaskProgress | null = null;
  private _tokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  private _cost = 0;
  private _vm: VMInstance | null = null;
  private bridge: VibeBoxBridge;

  constructor(id: string, type: WorkerType, config: WorkerConfig, bridge: VibeBoxBridge) {
    this.id = id;
    this.type = type;
    this.config = config;
    this.bridge = bridge;
  }

  get state(): WorkerState {
    return this._state;
  }

  async spawn(): Promise<void> {
    this._state = WorkerState.SPAWNING;
    log.info({ workerId: this.id, type: this.type }, 'Spawning worker');
    this._vm = await this.bridge.spawnVM(this.id, this.config);
    this._state = WorkerState.INITIALIZING;
    log.info({ workerId: this.id, ip: this._vm.ip }, 'Worker VM started');
  }

  async initialize(): Promise<void> {
    this._state = WorkerState.INITIALIZING;
    if (this._vm) {
      await this.bridge.executeCommand(this.id, 'echo "Worker initialized"');
    }
    this._state = WorkerState.READY;
    this._lastHeartbeat = new Date();
    log.info({ workerId: this.id }, 'Worker ready');
  }

  async terminate(): Promise<void> {
    log.info({ workerId: this.id }, 'Terminating worker');
    try {
      await this.bridge.terminateVM(this.id);
    } catch (err) {
      log.error({ err, workerId: this.id }, 'Error terminating VM');
    }
    this._state = WorkerState.TERMINATED;
    this._vm = null;
  }

  async assignTask(task: WorkerTask): Promise<void> {
    this._currentTask = task;
    this._state = WorkerState.WORKING;
    this._progress = {
      taskId: task.id,
      state: 'running',
      percentComplete: 0,
      currentStep: 'Starting task',
    };
    log.info({ workerId: this.id, taskId: task.id }, 'Task assigned');

    try {
      await this.bridge.sendTask(this.id, task);
    } catch (err) {
      log.error({ err, workerId: this.id, taskId: task.id }, 'Failed to send task to VM');
      this._state = WorkerState.FAILED;
      if (this._progress) {
        this._progress.state = 'failed';
        this._progress.error = err instanceof Error ? err.message : String(err);
      }
    }
  }

  async executeCommand(command: string): Promise<CommandResult> {
    return this.bridge.executeCommand(this.id, command);
  }

  getProgress(): TaskProgress {
    return this._progress ?? {
      taskId: '',
      state: 'pending',
      percentComplete: 0,
      currentStep: 'No task assigned',
    };
  }

  recordHeartbeat(heartbeat: Heartbeat): void {
    this._lastHeartbeat = heartbeat.timestamp;
    this._state = heartbeat.state;
    if (heartbeat.taskProgress) {
      this._progress = heartbeat.taskProgress;
    }
    this._tokenUsage = heartbeat.tokenUsage;
  }

  getLastHeartbeat(): Date {
    return this._lastHeartbeat;
  }

  isHealthy(): boolean {
    const elapsed = Date.now() - this._lastHeartbeat.getTime();
    return elapsed < 15_000;
  }

  isStale(): boolean {
    const elapsed = Date.now() - this._lastHeartbeat.getTime();
    return elapsed >= 15_000 && elapsed < 30_000;
  }

  isDead(): boolean {
    const elapsed = Date.now() - this._lastHeartbeat.getTime();
    return elapsed >= 30_000;
  }

  getTokenUsage(): TokenUsage {
    return this._tokenUsage;
  }

  getCost(): number {
    return this._cost;
  }

  addCost(amount: number): void {
    this._cost += amount;
  }

  getVM(): VMInstance | null {
    return this._vm;
  }

  getCurrentTask(): WorkerTask | null {
    return this._currentTask;
  }

  markComplete(output?: string): void {
    this._state = WorkerState.COMPLETE;
    if (this._progress) {
      this._progress.state = 'complete';
      this._progress.percentComplete = 100;
      this._progress.output = output;
    }
  }

  markFailed(error: string): void {
    this._state = WorkerState.FAILED;
    if (this._progress) {
      this._progress.state = 'failed';
      this._progress.error = error;
    }
  }
}
