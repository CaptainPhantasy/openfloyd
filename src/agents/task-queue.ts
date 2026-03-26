import { createLogger } from '../utils/logger.js';
import { TaskState, type WorkerTask, type QueueStats } from '../types/index.js';

const log = createLogger('task-queue');

interface QueuedTask {
  task: WorkerTask;
  state: TaskState;
  assignedWorker?: string;
  error?: string;
  completedAt?: Date;
}

export class TaskQueue {
  private tasks = new Map<string, QueuedTask>();
  private completed = new Set<string>();

  enqueue(task: WorkerTask): void {
    this.tasks.set(task.id, { task, state: TaskState.PENDING });
    log.info({ taskId: task.id, priority: task.priority }, 'Task enqueued');
  }

  dequeue(): WorkerTask | undefined {
    const ready = this.getReadyTasks();
    if (ready.length === 0) return undefined;

    // Sort by priority (lower = higher priority)
    ready.sort((a, b) => a.priority - b.priority);
    const task = ready[0]!;
    const queued = this.tasks.get(task.id);
    if (queued) {
      queued.state = TaskState.RUNNING;
    }
    return task;
  }

  peek(): WorkerTask | undefined {
    const ready = this.getReadyTasks();
    if (ready.length === 0) return undefined;
    ready.sort((a, b) => a.priority - b.priority);
    return ready[0];
  }

  markComplete(taskId: string): void {
    const queued = this.tasks.get(taskId);
    if (queued) {
      queued.state = TaskState.COMPLETE;
      queued.completedAt = new Date();
      this.completed.add(taskId);
      log.info({ taskId }, 'Task completed');
    }
  }

  markFailed(taskId: string, error: string): void {
    const queued = this.tasks.get(taskId);
    if (queued) {
      queued.state = TaskState.FAILED;
      queued.error = error;
      log.warn({ taskId, error }, 'Task failed');
    }
  }

  markRunning(taskId: string, workerId: string): void {
    const queued = this.tasks.get(taskId);
    if (queued) {
      queued.state = TaskState.RUNNING;
      queued.assignedWorker = workerId;
    }
  }

  getReadyTasks(): WorkerTask[] {
    const ready: WorkerTask[] = [];
    for (const [, queued] of this.tasks) {
      if (queued.state !== TaskState.PENDING) continue;
      const depsComplete = queued.task.dependencies.every((depId) => this.completed.has(depId));
      if (depsComplete) {
        ready.push(queued.task);
      }
    }
    return ready;
  }

  getBlockedTasks(): WorkerTask[] {
    const blocked: WorkerTask[] = [];
    for (const [, queued] of this.tasks) {
      if (queued.state !== TaskState.PENDING) continue;
      const hasUnresolved = queued.task.dependencies.some((depId) => !this.completed.has(depId));
      if (hasUnresolved) {
        blocked.push(queued.task);
      }
    }
    return blocked;
  }

  getTask(taskId: string): WorkerTask | undefined {
    return this.tasks.get(taskId)?.task;
  }

  getAllTasks(): WorkerTask[] {
    return Array.from(this.tasks.values()).map((q) => q.task);
  }

  getTasksByState(state: TaskState): WorkerTask[] {
    return Array.from(this.tasks.values())
      .filter((q) => q.state === state)
      .map((q) => q.task);
  }

  getTaskState(taskId: string): TaskState | undefined {
    return this.tasks.get(taskId)?.state;
  }

  getQueueStats(): QueueStats {
    let pending = 0, ready = 0, running = 0, complete = 0, failed = 0;
    const readyIds = new Set(this.getReadyTasks().map((t) => t.id));

    for (const [, queued] of this.tasks) {
      switch (queued.state) {
        case TaskState.PENDING:
          if (readyIds.has(queued.task.id)) ready++;
          else pending++;
          break;
        case TaskState.RUNNING: running++; break;
        case TaskState.COMPLETE: complete++; break;
        case TaskState.FAILED: failed++; break;
      }
    }

    return {
      total: this.tasks.size,
      pending,
      ready,
      running,
      complete,
      failed,
    };
  }

  clear(): void {
    this.tasks.clear();
    this.completed.clear();
  }
}
