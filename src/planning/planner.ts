import { createLogger } from '../utils/logger.js';
import {
  WorkerType,
  TaskType,
  type GoalAnalysis,
  type ExecutionPath,
  type Plan,
  type WorkerTask,
  type PlanStep,
  type WorkerRequirement,
  type CostEstimate,
  type TimeEstimate,
  type LLMRequest,
  type LLMResponse,
} from '../types/index.js';
import type { WebResearchTool } from '../tools/web-research.js';

const log = createLogger('planner');

export type LLMRouterFn = (request: LLMRequest) => Promise<LLMResponse>;

export class PlanningEngine {
  private routerFn: LLMRouterFn | null = null;
  private researchTool: WebResearchTool | null = null;

  setRouter(fn: LLMRouterFn): void {
    this.routerFn = fn;
  }

  setResearchTool(tool: WebResearchTool): void {
    this.researchTool = tool;
  }

  async analyzeGoal(goal: string): Promise<GoalAnalysis> {
    log.info({ goal: goal.substring(0, 100) }, 'Analyzing goal');

    // Research current facts
    const findings = [];
    if (this.researchTool) {
      try {
        const results = await this.researchTool.search(goal, { maxResults: 5, recency: 'week' });
        for (const result of results.slice(0, 3)) {
          findings.push({
            query: goal,
            summary: result.snippet,
            sources: [result.url],
            confidence: result.score,
          });
        }
      } catch (err) {
        log.warn({ err }, 'Research failed during goal analysis');
      }
    }

    // Use LLM to analyze
    if (this.routerFn) {
      try {
        const response = await this.routerFn({
          taskType: TaskType.PLANNING,
          messages: [
            { role: 'system', content: 'You are a project planning assistant. Analyze the goal and return a JSON object with: clarifiedGoal, requirements (array of strings), constraints (array), assumptions (array), risks (array of {description, severity, mitigation}).' },
            { role: 'user', content: `Analyze this goal: ${goal}\n\nResearch findings:\n${findings.map((f) => `- ${f.summary} (${f.sources.join(', ')})`).join('\n')}` },
          ],
          maxTokens: 2048,
        });

        try {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as Partial<GoalAnalysis>;
            return {
              originalGoal: goal,
              clarifiedGoal: parsed.clarifiedGoal ?? goal,
              requirements: parsed.requirements ?? [],
              constraints: parsed.constraints ?? [],
              assumptions: parsed.assumptions ?? [],
              risks: (parsed.risks ?? []),
              researchFindings: findings,
            };
          }
        } catch {
          log.warn('Failed to parse LLM goal analysis response');
        }
      } catch (err) {
        log.warn({ err }, 'LLM analysis failed');
      }
    }

    // Fallback: minimal analysis
    return {
      originalGoal: goal,
      clarifiedGoal: goal,
      requirements: [goal],
      constraints: [],
      assumptions: [],
      risks: [],
      researchFindings: findings,
    };
  }

  async generatePaths(analysis: GoalAnalysis): Promise<ExecutionPath[]> {
    log.info({ goal: analysis.clarifiedGoal.substring(0, 80) }, 'Generating execution paths');

    if (this.routerFn) {
      try {
        const response = await this.routerFn({
          taskType: TaskType.PLANNING,
          messages: [
            { role: 'system', content: `You are a project planning assistant. Generate 3 execution paths for the goal. Return a JSON array of objects with: name, description, steps (array of {id, description, workerType (coder|tester|reviewer|deployer|researcher|marketer), estimatedMinutes, dependencies (array of step ids)}), confidence (0-1). Worker types: coder, tester, reviewer, deployer, researcher, marketer.` },
            { role: 'user', content: `Goal: ${analysis.clarifiedGoal}\nRequirements: ${analysis.requirements.join(', ')}\nConstraints: ${analysis.constraints.join(', ')}` },
          ],
          maxTokens: 4096,
        });

        try {
          const jsonMatch = response.content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const paths = JSON.parse(jsonMatch[0]) as Array<{
              name: string; description: string; confidence: number;
              steps: Array<{ id: string; description: string; workerType: string; estimatedMinutes: number; dependencies: string[] }>;
            }>;

            return paths.map((p, i) => {
              const steps: PlanStep[] = (p.steps ?? []).map((s, si) => ({
                id: s.id ?? `step-${si}`,
                description: s.description,
                workerType: (Object.values(WorkerType).includes(s.workerType as WorkerType) ? s.workerType : WorkerType.CODER) as WorkerType,
                estimatedMinutes: s.estimatedMinutes ?? 10,
                dependencies: s.dependencies ?? [],
              }));

              const costEstimate = this.estimateCostSync(steps);
              const timeEstimate = this.estimateTimeSync(steps);
              const workerReqs = this.calculateWorkerRequirements(steps);

              return {
                id: `path-${i + 1}`,
                name: p.name ?? `Path ${i + 1}`,
                description: p.description ?? '',
                steps,
                workerRequirements: workerReqs,
                estimatedCost: costEstimate,
                estimatedTime: timeEstimate,
                risks: analysis.risks,
                confidence: p.confidence ?? 0.7,
              };
            });
          }
        } catch {
          log.warn('Failed to parse LLM paths response');
        }
      } catch (err) {
        log.warn({ err }, 'LLM path generation failed');
      }
    }

    // Fallback: single basic path
    return [this.createDefaultPath(analysis)];
  }

  recommend(paths: ExecutionPath[]): ExecutionPath {
    // Score by confidence * (1 / cost) * (1 / time)
    let best = paths[0]!;
    let bestScore = -1;

    for (const path of paths) {
      const costFactor = path.estimatedCost.dollars > 0 ? 1 / path.estimatedCost.dollars : 1;
      const timeFactor = path.estimatedTime.minutes > 0 ? 1 / path.estimatedTime.minutes : 1;
      const score = path.confidence * costFactor * timeFactor * 1000;
      if (score > bestScore) {
        bestScore = score;
        best = path;
      }
    }

    return best;
  }

  async createPlan(path: ExecutionPath, goal: string): Promise<Plan> {
    await Promise.resolve();
    const tasks: WorkerTask[] = path.steps.map((step) => ({
      id: crypto.randomUUID(),
      description: step.description,
      context: `Part of: ${goal}`,
      dependencies: step.dependencies,
      priority: path.steps.indexOf(step),
    }));

    return {
      id: crypto.randomUUID(),
      goal,
      path,
      tasks,
      status: 'draft',
      createdAt: new Date(),
    };
  }

  decomposePlan(plan: Plan): WorkerTask[] {
    return plan.tasks;
  }

  private estimateCostSync(steps: PlanStep[]): CostEstimate {
    // Rough estimates: ~1000 tokens per minute of work, ~$0.001 per 1K tokens avg
    const breakdown: Record<string, number> = {};
    let totalTokens = 0;

    for (const step of steps) {
      const tokens = step.estimatedMinutes * 1000;
      totalTokens += tokens;
      breakdown[step.workerType] = (breakdown[step.workerType] ?? 0) + tokens * 0.001;
    }

    return {
      tokens: totalTokens,
      dollars: totalTokens * 0.001,
      breakdown,
    };
  }

  private estimateTimeSync(steps: PlanStep[]): TimeEstimate {
    // Simple: sum sequential, parallel paths reduce
    const breakdown: Record<string, number> = {};
    let totalMinutes = 0;

    for (const step of steps) {
      const hasDeps = step.dependencies.length > 0;
      if (!hasDeps) {
        // Can run in parallel — take max
        totalMinutes = Math.max(totalMinutes, step.estimatedMinutes);
      } else {
        totalMinutes += step.estimatedMinutes;
      }
      breakdown[step.workerType] = (breakdown[step.workerType] ?? 0) + step.estimatedMinutes;
    }

    return { minutes: totalMinutes, breakdown };
  }

  private calculateWorkerRequirements(steps: PlanStep[]): WorkerRequirement[] {
    const counts = new Map<WorkerType, number>();
    for (const step of steps) {
      counts.set(step.workerType, (counts.get(step.workerType) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([type, count]) => ({
      type,
      count: Math.min(count, 3), // Max 3 of any type
      reason: `${count} tasks require ${type} workers`,
    }));
  }

  private createDefaultPath(analysis: GoalAnalysis): ExecutionPath {
    const steps: PlanStep[] = [
      { id: 'research', description: 'Research requirements and current best practices', workerType: WorkerType.RESEARCHER, estimatedMinutes: 10, dependencies: [] },
      { id: 'implement', description: 'Implement solution with full source code', workerType: WorkerType.CODER, estimatedMinutes: 30, dependencies: ['research'] },
      { id: 'test', description: 'Run test suite and verify all passing', workerType: WorkerType.TESTER, estimatedMinutes: 15, dependencies: ['implement'] },
      { id: 'review', description: 'Code review for quality and security', workerType: WorkerType.REVIEWER, estimatedMinutes: 10, dependencies: ['implement'] },
      { id: 'deliver', description: 'Signal task complete. The orchestrator will extract the workspace, commit, and push from the host. Workers do not have git or network access.', workerType: WorkerType.CODER, estimatedMinutes: 2, dependencies: ['test', 'review'] },
    ];

    return {
      id: 'path-default',
      name: 'Standard Path',
      description: 'Research → Build → Test → Review → Deliver to GitHub',
      steps,
      workerRequirements: this.calculateWorkerRequirements(steps),
      estimatedCost: this.estimateCostSync(steps),
      estimatedTime: this.estimateTimeSync(steps),
      risks: analysis.risks,
      confidence: 0.6,
    };
  }
}
