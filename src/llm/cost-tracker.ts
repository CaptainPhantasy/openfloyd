import Database from 'better-sqlite3';
import { createLogger } from '../utils/logger.js';
import type { UsageRecord, Budget, BudgetStatus, BudgetAlert } from '../types/index.js';

const log = createLogger('cost-tracker');

export class CostTracker {
  private db: Database.Database;
  private budget: Budget | null = null;
  private alertCallbacks: ((alert: BudgetAlert) => void)[] = [];

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cost REAL NOT NULL,
        project_id TEXT,
        worker_id TEXT,
        task_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_records(provider_id);
      CREATE INDEX IF NOT EXISTS idx_usage_project ON usage_records(project_id);
    `);
    log.info('Cost tracker initialized');
  }

  recordUsage(usage: UsageRecord): void {
    const stmt = this.db.prepare(
      'INSERT INTO usage_records (id, timestamp, provider_id, model, input_tokens, output_tokens, cost, project_id, worker_id, task_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    stmt.run(
      usage.id, usage.timestamp.getTime(), usage.providerId, usage.model,
      usage.inputTokens, usage.outputTokens, usage.cost,
      usage.projectId ?? null, usage.workerId ?? null, usage.taskId ?? null,
    );

    this.checkBudgetAlerts();
  }

  getTotalCost(): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM usage_records').get() as { total: number };
    return row.total;
  }

  getCostByProvider(providerId: string): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM usage_records WHERE provider_id = ?').get(providerId) as { total: number };
    return row.total;
  }

  getCostByProject(projectId: string): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM usage_records WHERE project_id = ?').get(projectId) as { total: number };
    return row.total;
  }

  getCostByWorker(workerId: string): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM usage_records WHERE worker_id = ?').get(workerId) as { total: number };
    return row.total;
  }

  getCostByTimeRange(start: Date, end: Date): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM usage_records WHERE timestamp >= ? AND timestamp <= ?').get(start.getTime(), end.getTime()) as { total: number };
    return row.total;
  }

  getCostToday(): number {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.getCostByTimeRange(startOfDay, new Date());
  }

  getCostThisWeek(): number {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return this.getCostByTimeRange(startOfWeek, now);
  }

  getCostThisMonth(): number {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.getCostByTimeRange(startOfMonth, now);
  }

  getCostByProviderBreakdown(): Record<string, number> {
    const rows = this.db.prepare('SELECT provider_id, SUM(cost) as total FROM usage_records GROUP BY provider_id').all() as Array<{ provider_id: string; total: number }>;
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.provider_id] = row.total;
    }
    return result;
  }

  getCostByProjectBreakdown(): Record<string, number> {
    const rows = this.db.prepare('SELECT project_id, SUM(cost) as total FROM usage_records WHERE project_id IS NOT NULL GROUP BY project_id').all() as Array<{ project_id: string; total: number }>;
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.project_id] = row.total;
    }
    return result;
  }

  getCostHistory(days = 30): Array<{ date: string; cost: number; tokens: number }> {
    const start = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = this.db.prepare(
      `SELECT date(timestamp / 1000, 'unixepoch', 'localtime') as date, SUM(cost) as cost, SUM(input_tokens + output_tokens) as tokens FROM usage_records WHERE timestamp >= ? GROUP BY date ORDER BY date`,
    ).all(start) as Array<{ date: string; cost: number; tokens: number }>;
    return rows;
  }

  setBudget(budget: Budget): void {
    this.budget = budget;
    log.info({ budget }, 'Budget set');
  }

  getBudgetStatus(): BudgetStatus {
    const daily = this.budget?.daily ?? 0;
    const weekly = this.budget?.weekly;
    const monthly = this.budget?.monthly;

    const status: BudgetStatus = {
      daily: {
        used: this.getCostToday(),
        limit: daily,
        percentage: daily > 0 ? (this.getCostToday() / daily) * 100 : 0,
      },
    };

    if (weekly) {
      status.weekly = {
        used: this.getCostThisWeek(),
        limit: weekly,
        percentage: (this.getCostThisWeek() / weekly) * 100,
      };
    }

    if (monthly) {
      status.monthly = {
        used: this.getCostThisMonth(),
        limit: monthly,
        percentage: (this.getCostThisMonth() / monthly) * 100,
      };
    }

    return status;
  }

  onBudgetAlert(callback: (alert: BudgetAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  private checkBudgetAlerts(): void {
    if (!this.budget) return;

    const thresholds = this.budget.alertThresholds;
    const dailyUsed = this.getCostToday();
    const dailyPct = this.budget.daily > 0 ? dailyUsed / this.budget.daily : 0;

    for (const threshold of thresholds) {
      if (dailyPct >= threshold) {
        const alert: BudgetAlert = {
          type: 'daily',
          threshold,
          used: dailyUsed,
          limit: this.budget.daily,
        };
        for (const cb of this.alertCallbacks) cb(alert);
      }
    }
  }

  close(): void {
    this.db.close();
  }
}
