import Database from 'better-sqlite3';
import { createLogger } from '../utils/logger.js';
import type { ProjectRecord, ROIMetrics } from '../types/index.js';

const log = createLogger('roi-calculator');

export interface ProjectReport {
  project: ProjectRecord;
  roi: ROIMetrics;
  costBreakdown: Record<string, number>;
  revenueHistory: Array<{ date: string; amount: number; source: string }>;
}

export interface SummaryReport {
  totalProjects: number;
  totalCost: number;
  totalRevenue: number;
  netProfit: number;
  projects: Array<{ id: string; name: string; roi: number; status: string }>;
}

export class ROICalculator {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'planning',
        total_cost REAL NOT NULL DEFAULT 0,
        total_revenue REAL NOT NULL DEFAULT 0,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS revenue_entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        amount REAL NOT NULL,
        source TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_revenue_project ON revenue_entries(project_id);
    `);
    log.info('ROI calculator initialized');
  }

  createProject(project: ProjectRecord): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO projects (id, name, description, created_at, status, total_cost, total_revenue, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    stmt.run(
      project.id, project.name, project.description,
      project.createdAt.getTime(), project.status,
      project.totalCost, project.totalRevenue,
      project.metadata ? JSON.stringify(project.metadata) : null,
    );
    log.info({ projectId: project.id, name: project.name }, 'Project created');
  }

  updateProject(projectId: string, updates: Partial<ProjectRecord>): void {
    const project = this.getProject(projectId);
    if (!project) return;

    const merged = { ...project, ...updates };
    this.createProject(merged);
  }

  getProject(projectId: string): ProjectRecord | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as {
      id: string; name: string; description: string; created_at: number;
      status: string; total_cost: number; total_revenue: number; metadata: string | null;
    } | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: new Date(row.created_at),
      status: row.status as ProjectRecord['status'],
      totalCost: row.total_cost,
      totalRevenue: row.total_revenue,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    };
  }

  getAllProjects(): ProjectRecord[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Array<{
      id: string; name: string; description: string; created_at: number;
      status: string; total_cost: number; total_revenue: number; metadata: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: new Date(row.created_at),
      status: row.status as ProjectRecord['status'],
      totalCost: row.total_cost,
      totalRevenue: row.total_revenue,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    }));
  }

  attributeCost(projectId: string, cost: number): void {
    this.db.prepare('UPDATE projects SET total_cost = total_cost + ? WHERE id = ?').run(cost, projectId);
  }

  getProjectCost(projectId: string): number {
    const row = this.db.prepare('SELECT total_cost FROM projects WHERE id = ?').get(projectId) as { total_cost: number } | undefined;
    return row?.total_cost ?? 0;
  }

  recordRevenue(projectId: string, amount: number, source: string): void {
    const id = crypto.randomUUID();
    this.db.prepare(
      'INSERT INTO revenue_entries (id, project_id, amount, source, timestamp) VALUES (?, ?, ?, ?, ?)',
    ).run(id, projectId, amount, source, Date.now());

    this.db.prepare('UPDATE projects SET total_revenue = total_revenue + ? WHERE id = ?').run(amount, projectId);
    log.info({ projectId, amount, source }, 'Revenue recorded');
  }

  getProjectRevenue(projectId: string): number {
    const row = this.db.prepare('SELECT total_revenue FROM projects WHERE id = ?').get(projectId) as { total_revenue: number } | undefined;
    return row?.total_revenue ?? 0;
  }

  calculateROI(projectId: string): ROIMetrics {
    const project = this.getProject(projectId);
    if (!project) {
      return { totalCost: 0, totalRevenue: 0, netProfit: 0, roi: 0, breakeven: null, daysToBreakeven: null };
    }

    const netProfit = project.totalRevenue - project.totalCost;
    const roi = project.totalCost > 0 ? (netProfit / project.totalCost) * 100 : 0;

    return {
      totalCost: project.totalCost,
      totalRevenue: project.totalRevenue,
      netProfit,
      roi,
      breakeven: netProfit >= 0 ? project.createdAt : null,
      daysToBreakeven: null,
    };
  }

  estimateBreakeven(projectId: string, monthlyRevenue: number): Date {
    const project = this.getProject(projectId);
    if (!project || monthlyRevenue <= 0) {
      return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    }

    const remaining = project.totalCost - project.totalRevenue;
    if (remaining <= 0) return new Date();

    const monthsToBreakeven = remaining / monthlyRevenue;
    const breakevenDate = new Date();
    breakevenDate.setMonth(breakevenDate.getMonth() + Math.ceil(monthsToBreakeven));
    return breakevenDate;
  }

  generateReport(projectId: string): ProjectReport {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const revenueRows = this.db.prepare(
      'SELECT amount, source, timestamp FROM revenue_entries WHERE project_id = ? ORDER BY timestamp',
    ).all(projectId) as Array<{ amount: number; source: string; timestamp: number }>;

    return {
      project,
      roi: this.calculateROI(projectId),
      costBreakdown: {},
      revenueHistory: revenueRows.map((r) => ({
        date: new Date(r.timestamp).toISOString().split('T')[0]!,
        amount: r.amount,
        source: r.source,
      })),
    };
  }

  generateSummary(): SummaryReport {
    const projects = this.getAllProjects();
    const totalCost = projects.reduce((sum, p) => sum + p.totalCost, 0);
    const totalRevenue = projects.reduce((sum, p) => sum + p.totalRevenue, 0);

    return {
      totalProjects: projects.length,
      totalCost,
      totalRevenue,
      netProfit: totalRevenue - totalCost,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        roi: p.totalCost > 0 ? ((p.totalRevenue - p.totalCost) / p.totalCost) * 100 : 0,
        status: p.status,
      })),
    };
  }

  close(): void {
    this.db.close();
  }
}
