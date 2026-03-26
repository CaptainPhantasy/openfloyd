import { createLogger } from '../utils/logger.js';
import type { MCPTool, MCPToolResult } from '../types/index.js';
import fs from 'fs';
import { exec as execCmd } from 'child_process';
import { WebResearchTool } from '../tools/web-research.js';
import { PoolManager } from '../agents/pool-manager.js';
import { TaskQueue } from '../agents/task-queue.js';
import { DeliveryService } from '../agents/delivery-service.js';
import { VibeBoxBridge } from '../agents/vibebox-bridge.js';
import { WorkerType } from '../types/index.js';

const log = createLogger('tool-registry');

// Lazy-initialized singletons (only created when tools are actually called)
let _researchTool: WebResearchTool | null = null;
let _poolManager: PoolManager | null = null;
let _taskQueue: TaskQueue | null = null;
let _deliveryService: DeliveryService | null = null;

function getResearchTool(): WebResearchTool {
  if (!_researchTool) _researchTool = new WebResearchTool();
  return _researchTool;
}

function getPoolManager(): PoolManager {
  if (!_poolManager) {
    _poolManager = new PoolManager();
    void _poolManager.initialize();
  }
  return _poolManager;
}

function getTaskQueue(): TaskQueue {
  if (!_taskQueue) _taskQueue = new TaskQueue();
  return _taskQueue;
}

function getDeliveryService(): DeliveryService {
  if (!_deliveryService) {
    const bridge = new VibeBoxBridge();
    _deliveryService = new DeliveryService(bridge);
  }
  return _deliveryService;
}

export type ToolHandler = (params: Record<string, unknown>) => Promise<MCPToolResult>;

interface RegisteredTool {
  definition: MCPTool;
  handler: ToolHandler;
  enabled: boolean;
  callCount: number;
  lastCalledAt: Date | null;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(tool: MCPTool, handler: ToolHandler): void {
    if (this.tools.has(tool.name)) {
      log.warn({ tool: tool.name }, 'Replacing existing tool registration');
    }

    this.tools.set(tool.name, {
      definition: tool,
      handler,
      enabled: true,
      callCount: 0,
      lastCalledAt: null,
    });

    log.info({ tool: tool.name }, 'Tool registered');
  }

  unregister(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      log.info({ tool: name }, 'Tool unregistered');
    }
    return existed;
  }

  async call(name: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    if (!tool.enabled) {
      return {
        content: [{ type: 'text', text: `Tool "${name}" is currently disabled` }],
        isError: true,
      };
    }

    log.info({ tool: name, params }, 'Executing tool');

    try {
      const result = await tool.handler(params);
      tool.callCount++;
      tool.lastCalledAt = new Date();

      log.info({ tool: name, isError: result.isError }, 'Tool execution complete');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ err: error, tool: name }, 'Tool execution failed');

      return {
        content: [{ type: 'text', text: `Tool error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  getDefinitions(): MCPTool[] {
    return [...this.tools.values()]
      .filter((t) => t.enabled)
      .map((t) => t.definition);
  }

  getToolNames(): string[] {
    return [...this.tools.keys()];
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  setEnabled(name: string, enabled: boolean): void {
    const tool = this.tools.get(name);
    if (tool) {
      tool.enabled = enabled;
      log.info({ tool: name, enabled }, 'Tool enabled state changed');
    }
  }

  getStats(): Array<{ name: string; callCount: number; enabled: boolean; lastCalledAt: Date | null }> {
    return [...this.tools.entries()].map(([name, tool]) => ({
      name,
      callCount: tool.callCount,
      enabled: tool.enabled,
      lastCalledAt: tool.lastCalledAt,
    }));
  }
}

export function createBuiltinTools(registry: ToolRegistry): void {
  registry.register(
    {
      name: 'web_search',
      description: 'Search the web for real-time information',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results', default: 5 },
        },
        required: ['query'],
      },
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async (params) => {
      const query = params['query'] as string;
      return {
        content: [{
          type: 'text',
          text: `[web_search stub] Query: "${query}" — MCP web search provider not yet connected`,
        }],
      };
    },
  );

  registry.register(
    {
      name: 'web_reader',
      description: 'Fetch and extract content from URLs',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
          format: { type: 'string', enum: ['text', 'markdown', 'html'], default: 'text' },
        },
        required: ['url'],
      },
    },
    async (params) => {
      const url = params['url'] as string;
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
          headers: { 'User-Agent': 'OpenFloyd/0.1.0' },
        });
        const text = await response.text();
        return {
          content: [{ type: 'text', text: text.substring(0, 10_000) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to fetch ${url}: ${String(error)}` }],
          isError: true,
        };
      }
    },
  );

  registry.register(
    {
      name: 'execute_code',
      description: 'Execute code in a WASM sandboxed environment',
      input_schema: {
        type: 'object',
        properties: {
          language: { type: 'string', enum: ['python', 'javascript'], description: 'Programming language' },
          code: { type: 'string', description: 'Code to execute' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 5000 },
        },
        required: ['language', 'code'],
      },
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async (params) => {
      return {
        content: [{
          type: 'text',
          text: `[execute_code stub] Language: ${String(params['language'])} — WASM runtime modules not yet deployed`,
        }],
      };
    },
  );


  // === Web Research Tools (backed by WebResearchTool) ===

  registry.register({
    name: 'web_research',
    description: 'Search the web using Exa or Tavily API. Returns titles, URLs, and snippets. Requires EXA_API_KEY or TAVILY_API_KEY in .env.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, max_results: { type: 'number', description: 'Max results (1-20)', default: 10 }, recency: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Filter by recency' }, domains: { type: 'array', items: { type: 'string' }, description: 'Restrict to specific domains' } }, required: ['query'] },
  }, async (params) => {
    try {
      const results = await getResearchTool().search(
        String(params['query']),
        { maxResults: Number(params['max_results']) || 10, recency: params['recency'] as 'day' | 'week' | 'month' | 'year' | undefined, domains: params['domains'] as string[] | undefined },
      );
      if (results.length === 0) return { content: [{ type: 'text', text: 'No results found. Check EXA_API_KEY or TAVILY_API_KEY in .env.' }] };
      const formatted = results.map((r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}${r.publishedDate ? ` (${r.publishedDate.toISOString().split('T')[0]})` : ''}`).join('\n\n');
      return { content: [{ type: 'text', text: formatted }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `web_research error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'web_extract',
    description: 'Fetch and extract readable content from a URL. Strips scripts, styles, nav, footer. Returns title + up to 10K chars of content.',
    input_schema: { type: 'object', properties: { url: { type: 'string', description: 'URL to extract content from' } }, required: ['url'] },
  }, async (params) => {
    try {
      const page = await getResearchTool().extract(String(params['url']));
      return { content: [{ type: 'text', text: `Title: ${page.title}\nURL: ${page.url}\nExtracted: ${page.extractedAt.toISOString()}\n\n${page.content}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `web_extract error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'web_verify',
    description: 'Fact-check a claim by searching for supporting sources and analyzing whether they confirm or contradict it.',
    input_schema: { type: 'object', properties: { claim: { type: 'string', description: 'Claim to verify' }, sources: { type: 'array', items: { type: 'string' }, description: 'Optional URLs to check against' } }, required: ['claim'] },
  }, async (params) => {
    try {
      const result = await getResearchTool().verify(
        String(params['claim']),
        params['sources'] as string[] | undefined,
      );
      const sourceDetails = result.sources.map((s) => `  ${s.supports ? '[SUPPORTS]' : '[CONTRADICTS]'} ${s.url}\n    Excerpt: ${s.excerpt}`).join('\n\n');
      return { content: [{ type: 'text', text: `Claim: ${result.claim}\nVerdict: ${result.verified ? 'VERIFIED' : 'UNVERIFIED'} (confidence: ${(result.confidence * 100).toFixed(0)}%)\n\nSources:\n${sourceDetails}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `web_verify error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });


  // === Agent Deployment Tools (backed by PoolManager + TaskQueue) ===

  registry.register({
    name: 'deploy_agent',
    description: 'Spawn a worker agent in an isolated sandbox (Docker container or SSH VM). Worker has no network access and no credentials.',
    input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['coder', 'tester', 'reviewer', 'deployer', 'researcher', 'marketer'], description: 'Worker type' }, task: { type: 'string', description: 'Initial task description' }, priority: { type: 'number', description: 'Task priority (1-10, lower = higher)', default: 5 } }, required: ['type'] },
  }, async (params) => {
    try {
      const workerType = String(params['type']) as WorkerType;
      const pool = getPoolManager();
      const worker = await pool.spawnWorker(workerType);

      // If a task was provided, enqueue it
      if (params['task']) {
        const queue = getTaskQueue();
        const taskId = `task_${Date.now()}`;
        queue.enqueue({
          id: taskId,
          description: String(params['task']),
          context: '',
          dependencies: [],
          priority: Number(params['priority']) || 5,
        });
        const queued = queue.dequeue();
        if (queued) {
          await worker.assignTask(queued);
        }
        return { content: [{ type: 'text', text: `Worker ${worker.id} (${workerType}) spawned and ready. Task ${taskId} assigned.` }] };
      }

      return { content: [{ type: 'text', text: `Worker ${worker.id} (${workerType}) spawned and ready. No task assigned — use worker_execute to send commands.` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `deploy_agent error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'list_workers',
    description: 'List all worker agents with their state, health, and resource usage.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async () => {
    try {
      const pool = getPoolManager();
      const stats = pool.getPoolStats();
      const health = pool.getHealthStatus();
      const workers = pool.getAllWorkers();

      if (workers.length === 0) {
        return { content: [{ type: 'text', text: 'No workers deployed. Use deploy_agent to spawn one.' }] };
      }

      const details = workers.map((w) => {
        const progress = w.getProgress();
        const usage = w.getTokenUsage();
        return `[${w.state}] ${w.id} (${w.type})\n  Task: ${w.getCurrentTask()?.description ?? 'idle'}\n  Progress: ${progress.percentComplete}% — ${progress.currentStep}\n  Tokens: ${usage.total_tokens.toLocaleString()} | Cost: $${w.getCost().toFixed(4)}`;
      }).join('\n\n');

      return { content: [{ type: 'text', text: `Pool: ${stats.totalWorkers} workers | Healthy: ${health.healthy} | Stale: ${health.stale} | Dead: ${health.dead}\nTotal tokens: ${stats.totalTokens.toLocaleString()} | Total cost: $${stats.totalCost.toFixed(4)}\n\n${details}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `list_workers error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'worker_execute',
    description: 'Execute a shell command inside a specific worker\'s sandbox.',
    input_schema: { type: 'object', properties: { worker_id: { type: 'string', description: 'Worker ID' }, command: { type: 'string', description: 'Shell command to execute inside the sandbox' } }, required: ['worker_id', 'command'] },
  }, async (params) => {
    try {
      const pool = getPoolManager();
      const worker = pool.getWorker(String(params['worker_id']));
      if (!worker) return { content: [{ type: 'text', text: `Worker not found: ${String(params['worker_id'])}. Use list_workers to see available workers.` }], isError: true };

      const result = await worker.executeCommand(String(params['command']));
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      return { content: [{ type: 'text', text: output ? `[exit ${result.exitCode}] (${result.durationMs}ms)\n${output}` : `(no output, exit ${result.exitCode})` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `worker_execute error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });


  // === GitHub Delivery Tools (backed by DeliveryService) ===

  registry.register({
    name: 'github_push',
    description: 'Push a worker\'s output to an existing GitHub repo as a new branch. Runs on the HOST with host-held credentials — worker never sees the PAT.',
    input_schema: { type: 'object', properties: { worker_id: { type: 'string', description: 'Worker ID whose workspace to push' }, repo_url: { type: 'string', description: 'GitHub repo URL (https://github.com/org/repo)' }, branch: { type: 'string', description: 'Branch name to create' }, message: { type: 'string', description: 'Commit message' } }, required: ['worker_id', 'repo_url', 'branch', 'message'] },
  }, async (params) => {
    try {
      const delivery = getDeliveryService();
      if (!delivery.hasCredentials()) return { content: [{ type: 'text', text: 'GITHUB_PAT not configured on host. Set it in .env to enable GitHub delivery.' }], isError: true };

      const result = await delivery.pushToExistingRepo(
        String(params['worker_id']),
        String(params['repo_url']),
        String(params['branch']),
        String(params['message']),
      );
      return { content: [{ type: 'text', text: `Pushed to ${result.branch} in ${String(params['repo_url'])}\nCommit: ${result.commitSha}\nTemp dir: ${result.tempDir}\n\nRun cleanup_delivery with the temp dir when confirmed.` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `github_push error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'create_repo',
    description: 'Create a new GitHub repo in the configured org and push a worker\'s output. Requires owner approval. HOST-side only.',
    input_schema: { type: 'object', properties: { worker_id: { type: 'string', description: 'Worker ID whose workspace to push' }, repo_name: { type: 'string', description: 'Repository name' }, description: { type: 'string', description: 'Repository description' }, private: { type: 'boolean', description: 'Make repo private', default: true } }, required: ['worker_id', 'repo_name'] },
  }, async (params) => {
    try {
      const delivery = getDeliveryService();
      if (!delivery.hasCredentials()) return { content: [{ type: 'text', text: 'GITHUB_PAT not configured on host. Set it in .env to enable GitHub delivery.' }], isError: true };

      const result = await delivery.createAndPushNewRepo(
        String(params['worker_id']),
        String(params['repo_name']),
        String(params['description'] || ''),
        params['private'] !== false,
      );
      return { content: [{ type: 'text', text: `Created ${result.repoUrl}\nCommit: ${result.commitSha}\nTemp dir: ${result.tempDir}\n\nRun cleanup_delivery with the temp dir when confirmed.` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `create_repo error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'cleanup_delivery',
    description: 'Clean up temporary extraction directory after confirming a successful push.',
    input_schema: { type: 'object', properties: { temp_dir: { type: 'string', description: 'Temp directory path from github_push or create_repo' } }, required: ['temp_dir'] },
  }, async (params) => {
    try {
      const delivery = getDeliveryService();
      await delivery.cleanup(String(params['temp_dir']));
      return { content: [{ type: 'text', text: `Cleaned up: ${String(params['temp_dir'])}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `cleanup_delivery error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });



  registry.register({
    name: 'exec',
    description: 'Execute shell commands on the host system via Python subprocess for reliable timeout handling',
    input_schema: { type: 'object', properties: { command: { type: 'string', description: 'Shell command to execute' }, timeout: { type: 'number', description: 'Timeout in ms', default: 30000 }, cwd: { type: 'string', description: 'Working directory' } }, required: ['command'] },
  }, async (params) => {
    const cmd = String(params['command']);
    const timeoutSec = Math.max(1, Math.floor((Number(params['timeout']) || 30000) / 1000));
    const cwd = params['cwd'] ? String(params['cwd']) : undefined;
    try {
      const scriptPath = `/tmp/floyd-exec-${process.pid}.py`;
      const pythonCode = [
        'import subprocess, sys, os, json',
        'cmd = sys.argv[1]',
        'timeout = int(sys.argv[2])',
        'cwd = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None',
        'try:',
        '    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout, cwd=cwd)',
        '    print(json.dumps({"stdout": r.stdout, "stderr": r.stderr, "exitCode": r.returncode}))',
        'except subprocess.TimeoutExpired:',
        '    print(json.dumps({"stdout": "", "stderr": "Timed out after " + str(timeout) + "s", "exitCode": -1}))',
        'except Exception as e:',
        '    print(json.dumps({"stdout": "", "stderr": str(e), "exitCode": -1}))',
      ].join('\n');
      fs.writeFileSync(scriptPath, pythonCode);
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
        const args = ['python3', scriptPath, cmd, String(timeoutSec)];
        if (cwd) args.push(cwd);
        execCmd(args.join(' '), { timeout: (timeoutSec + 5) * 1000 }, (error, stdout, _stderr) => {
          try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
          if (error) reject(error);
          else {
            try {
              resolve(JSON.parse(stdout || '{}') as { stdout: string; stderr: string; exitCode: number });
            } catch {
              resolve({ stdout: stdout || '', stderr: '', exitCode: -1 });
            }
          }
        });
      });
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      if (result.exitCode === -1 && result.stderr.includes('Timed out')) {
        return { content: [{ type: 'text', text: `Command timed out after ${timeoutSec}s` }], isError: true };
      }
      return { content: [{ type: 'text', text: output.substring(0, 50000) || '(no output)' }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `exec error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'read_file',
    description: 'Read a file from the local filesystem',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path to read' }, encoding: { type: 'string', description: 'File encoding', default: 'utf-8' }, offset: { type: 'number', description: 'Start line (1-indexed)' }, limit: { type: 'number', description: 'Max lines to read' } }, required: ['path'] },
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async (params) => {
    const filePath = String(params['path']);
    try {
      if (!fs.existsSync(filePath)) return { content: [{ type: 'text', text: `File not found: ${filePath}` }], isError: true };
      const content = fs.readFileSync(filePath, (params['encoding'] || 'utf-8') as BufferEncoding);
      let lines = content.split('\n');
      const offset = Number(params['offset']) || 0;
      const limit = Number(params['limit']) || 0;
      if (offset > 0 || limit > 0) lines = lines.slice(Math.max(0, offset - 1), limit > 0 ? offset - 1 + limit : undefined);
      return { content: [{ type: 'text', text: lines.join('\n').substring(0, 50000) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `read_file error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'write_file',
    description: 'Write content to a file, creating parent directories as needed',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path to write' }, content: { type: 'string', description: 'Content to write' } }, required: ['path', 'content'] },
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async (params) => {
    const filePath = String(params['path']);
    const content = String(params['content']);
    try {
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (dir) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return { content: [{ type: 'text', text: `Written ${content.length} chars to ${filePath}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `write_file error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'edit_file',
    description: 'Edit a file by replacing a text segment with new text',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path' }, old_text: { type: 'string', description: 'Text to find and replace' }, new_text: { type: 'string', description: 'Replacement text' } }, required: ['path', 'old_text', 'new_text'] },
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async (params) => {
    const filePath = String(params['path']);
    const oldText = String(params['old_text']);
    const newText = String(params['new_text']);
    try {
      if (!fs.existsSync(filePath)) return { content: [{ type: 'text', text: `File not found: ${filePath}` }], isError: true };
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes(oldText)) return { content: [{ type: 'text', text: `old_text not found in ${filePath}` }], isError: true };
      const newContent = content.replace(oldText, newText);
      fs.writeFileSync(filePath, newContent, 'utf-8');
      return { content: [{ type: 'text', text: `Edited ${filePath}: in-place replacement` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `edit_file error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'browser_navigate',
    description: 'Browser automation: navigate, click, fill forms, take screenshots, extract content',
    input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['navigate', 'screenshot', 'click', 'fill', 'extract', 'scroll'], description: 'Browser action' }, url: { type: 'string', description: 'URL to navigate to' }, selector: { type: 'string', description: 'CSS selector for click/fill/extract' }, value: { type: 'string', description: 'Value for fill actions' } }, required: ['action'] },
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async (params) => {
    const action = String(params['action']);
    return { content: [{ type: 'text', text: `[browser_navigate] Action: ${action} — Browser automation service not yet connected. Install Playwright or connect to Browserbase for full browser control.` }] };
  });

  registry.register({
    name: 'memory_store',
    description: 'Store a key-value pair in persistent memory for cross-session recall',
    input_schema: { type: 'object', properties: { key: { type: 'string', description: 'Memory key' }, value: { type: 'string', description: 'Value to store' }, category: { type: 'string', description: 'Category tag', default: 'general' } }, required: ['key', 'value'] },
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async (params) => {
    const key = String(params['key']);
    const value = String(params['value']);
    const category = String(params['category'] || 'general');
    try {
      const storePath = process.env['SQLITE_DB_PATH'] ? process.env['SQLITE_DB_PATH'].replace('memory.db', 'memory-store.json') : 'workspace/memory-store.json';
      let store: Record<string, { value: string; category: string; timestamp: string }> = {};
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      if (fs.existsSync(storePath)) store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
      store[key] = { value, category, timestamp: new Date().toISOString() };
      fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
      return { content: [{ type: 'text', text: `Stored memory: ${key} [${category}]` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `memory_store error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'memory_search',
    description: 'Search persistent memory by query string or category',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, category: { type: 'string', description: 'Filter by category' }, limit: { type: 'number', description: 'Max results', default: 5 } }, required: ['query'] },
  },
    // eslint-disable-next-line @typescript-eslint/require-await
    async (params) => {
    const query = String(params['query']).toLowerCase();
    const category = params['category'] ? String(params['category']) : null;
    const limit = Number(params['limit']) || 5;
    try {
      const storePath = process.env['SQLITE_DB_PATH'] ? process.env['SQLITE_DB_PATH'].replace('memory.db', 'memory-store.json') : 'workspace/memory-store.json';
      if (!fs.existsSync(storePath)) return { content: [{ type: 'text', text: 'No memory store found. Use memory_store to save data first.' }] };
      const store = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as Record<string, { value: string; category: string; timestamp: string }>;
      const results = Object.entries(store)
        .filter(([k, v]) => {
          const entry = v as { value: string; category: string; timestamp: string };
          if (category && entry.category !== category) return false;
          return k.toLowerCase().includes(query) || entry.value.toLowerCase().includes(query);
        })
        .slice(0, limit)
        .map(([k, v]) => {
          const entry = v as { value: string; category: string; timestamp: string };
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          return { key: k, value: entry.value.substring(0, 500), category: entry.category, timestamp: entry.timestamp };
        });
      return { content: [{ type: 'text', text: results.length > 0 ? JSON.stringify(results, null, 2) : `No results for query: ${query}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `memory_search error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'weather',
    description: 'Get current weather and forecast for a location',
    input_schema: { type: 'object', properties: { location: { type: 'string', description: 'City name or coordinates' }, units: { type: 'string', enum: ['metric', 'imperial'], default: 'metric' } }, required: ['location'] },
  },
    // eslint-disable-next-line @typescript-eslint/require-await
    async (params) => {
    const location = String(params['location']);
    const units = String(params['units'] || 'metric');
    const apiKey = process.env['OPENWEATHER_API_KEY'];
    if (!apiKey) return { content: [{ type: 'text', text: `[weather stub] Location: ${location} — Set OPENWEATHER_API_KEY in .env for live weather data` }] };
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=${units}&appid=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await res.json() as { cod?: number; message?: string; main?: { temp?: number; humidity?: number }; weather?: Array<{ description?: string }>; wind?: { speed?: number } };
      if (data.cod && Number(data.cod) !== 200) return { content: [{ type: 'text', text: `Weather API error: ${data.message}` }], isError: true };
      const main = data.main;
      const weather = data.weather?.[0];
      const wind = data.wind;
      return { content: [{ type: 'text', text: `Weather in ${location}: ${weather?.description}, ${main?.temp}°${units === 'metric' ? 'C' : 'F'}, humidity ${main?.humidity}%, wind ${wind?.speed} ${units === 'metric' ? 'm/s' : 'mph'}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `weather error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'tavily_search',
    description: 'AI-optimized web search with citations via Tavily API',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, max_results: { type: 'number', description: 'Max results', default: 5 }, search_depth: { type: 'string', enum: ['basic', 'advanced'], default: 'basic' } }, required: ['query'] },
  },
    // eslint-disable-next-line @typescript-eslint/require-await
    async (params) => {
    const query = String(params['query']);
    const apiKey = process.env['TAVILY_API_KEY'];
    if (!apiKey) return { content: [{ type: 'text', text: `[tavily_search stub] Query: ${query} — Set TAVILY_API_KEY in .env for AI-optimized search. Falling back to web_search.` }] };
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, query, max_results: Number(params['max_results']) || 5, search_depth: String(params['search_depth'] || 'basic') }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json() as { results?: Array<{ url: string; title: string; content: string; score: number }> };
      if (!data.results || data.results.length === 0) return { content: [{ type: 'text', text: `No results for: ${query}` }] };
      const formatted = data.results.map((r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.content.substring(0, 200)}`).join('\n\n');
      return { content: [{ type: 'text', text: formatted }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `tavily_search error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'cron_manage',
    description: 'Manage scheduled/recurring tasks',
    input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'create', 'delete'], description: 'CRUD action' }, id: { type: 'string', description: 'Task ID (for delete)' }, schedule: { type: 'string', description: 'Cron expression (for create)' }, task: { type: 'string', description: 'Task description (for create)' }, enabled: { type: 'boolean', description: 'Enable/disable task', default: true } }, required: ['action'] },
  },
    // eslint-disable-next-line @typescript-eslint/require-await
    async (params) => {
    const action = String(params['action']);
    const cronPath = 'workspace/cron-tasks.json';
    try {
      let tasks: Array<Record<string, unknown>> = [];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      if (fs.existsSync(cronPath)) tasks = JSON.parse(fs.readFileSync(cronPath, 'utf-8'));
      if (action === 'list') {
        return { content: [{ type: 'text', text: tasks.length > 0 ? JSON.stringify(tasks, null, 2) : 'No scheduled tasks' }] };
      }
      if (action === 'create') {
        const newTask = { id: `cron_${Date.now()}`, schedule: String(params['schedule'] || '0 * * * *'), task: String(params['task']), enabled: params['enabled'] !== false, created: new Date().toISOString() };
        tasks.push(newTask);
        fs.writeFileSync(cronPath, JSON.stringify(tasks, null, 2), 'utf-8');
        return { content: [{ type: 'text', text: `Created cron task: ${newTask.id} — ${newTask.schedule} — ${newTask.task}` }] };
      }
      if (action === 'delete') {
        const id = String(params['id']);
        const before = tasks.length;
        tasks = tasks.filter(t => t.id !== id);
        fs.writeFileSync(cronPath, JSON.stringify(tasks, null, 2), 'utf-8');
        return { content: [{ type: 'text', text: tasks.length < before ? `Deleted task ${id}` : `Task ${id} not found` }] };
      }
      return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true };
    } catch (error) {
      return { content: [{ type: 'text', text: `cron_manage error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'rube_mcp',
    description: 'Call Composio/Rube MCP tools for cross-app automation (Gmail, Slack, GitHub, etc.)',
    input_schema: { type: 'object', properties: { tool_slug: { type: 'string', description: 'Composio tool slug (e.g. GMAIL_SEND_EMAIL)' }, arguments: { type: 'object', description: 'Tool arguments matching the tool schema' } }, required: ['tool_slug'] },
  }, async (params) => {
    const slug = String(params['tool_slug']);
    const args = (params['arguments'] ?? {}) as Record<string, unknown>;
    const gatewayUrl = process.env['MCP_GATEWAY_URL'] ?? 'http://localhost:3999';
    try {
      const res = await fetch(`${gatewayUrl}/call/rube_mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_slug: slug, arguments: args }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json() as { success: boolean; result?: unknown; error?: string };
      if (data.success && data.result) return { content: [{ type: 'text', text: JSON.stringify(data.result, null, 2) }] };
      return { content: [{ type: 'text', text: data.error || `Rube MCP call failed for ${slug}` }], isError: true };
    } catch (error) {
      return { content: [{ type: 'text', text: `rube_mcp error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  registry.register({
    name: 'send_email',
    description: 'Send an email via SMTP or configured email provider',
    input_schema: { type: 'object', properties: { to: { type: 'string', description: 'Recipient email address' }, subject: { type: 'string', description: 'Email subject' }, body: { type: 'string', description: 'Email body (plain text or HTML)' }, cc: { type: 'string', description: 'CC recipients (comma-separated)' }, bcc: { type: 'string', description: 'BCC recipients (comma-separated)' } }, required: ['to', 'subject', 'body'] },
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async (params) => {
    const to = String(params['to']);
    const subject = String(params['subject']);
    const body = String(params['body']);
    const cc = params['cc'] ? String(params['cc']) : undefined;
    const bcc = params['bcc'] ? String(params['bcc']) : undefined;
    const smtpHost = process.env['SMTP_HOST'];
    const smtpPort = process.env['SMTP_PORT'];
    const smtpUser = process.env['SMTP_USER'];
    const smtpPass = process.env['SMTP_PASS'];
    if (!smtpHost || !smtpUser || !smtpPass) {
      return { content: [{ type: 'text', text: `[send_email stub] To: ${to}, Subject: ${subject} — Configure SMTP_HOST, SMTP_USER, SMTP_PASS in .env for email delivery. Alternatively, use rube_mcp with GMAIL_SEND_EMAIL.` }] };
    }
    try {
      // Dynamic import to avoid requiring nodemailer when not configured
      const nodemailer = await import('nodemailer') as unknown as { createTransport: (config: Record<string, unknown>) => { sendMail: (opts: Record<string, unknown>) => Promise<unknown> } };
      const transporter = nodemailer.createTransport({ host: smtpHost, port: Number(smtpPort) || 587, secure: Number(smtpPort) === 465, auth: { user: smtpUser, pass: smtpPass } });
      await transporter.sendMail({ from: smtpUser, to, subject, html: body, cc, bcc });
      return { content: [{ type: 'text', text: `Email sent to ${to}: ${subject}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `send_email error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });


  log.info({ tools: registry.getToolNames() }, 'Built-in tools registered');
  // Gateway tools (omega, hivemind, pattern, devtools)
  const gatewayUrl = process.env['MCP_GATEWAY_URL'] ?? 'http://localhost:3999';
  const gatewayTools: Array<{name:string; desc:string; params:Record<string, {type:string}>}> = [
    { name: 'omega_strategize', desc: 'Strategic guidance', params: { current_situation: {type:'string'}, dilemma: {type:'string'}, desired_perspective: {type:'string'} } },
    { name: 'omega_rlm', desc: 'Recursive reasoning', params: { query: {type:'string'}, depth: {type:'number'} } },
    { name: 'omega_adjudicate', desc: 'Conflict resolution', params: { conflict_description: {type:'string'}, opposing_forces: {type:'array'} } },
    { name: 'hivemind_submit_task', desc: 'Submit orchestration task', params: { description: {type:'string'}, priority: {type:'number'} } },
    { name: 'hivemind_list_tasks', desc: 'List all tasks', params: { state: {type:'string'} } },
    { name: 'hivemind_complete_task', desc: 'Mark task done', params: { task_id: {type:'string'}, result: {type:'object'} } },
    { name: 'hivemind_register_agent', desc: 'Register an agent', params: { id: {type:'string'}, name: {type:'string'}, type: {type:'string'} } },
    { name: 'hivemind_collaborate', desc: 'Create collaboration', params: { participants: {type:'array'}, task_id: {type:'string'} } },
    { name: 'pattern_detect', desc: 'Store code pattern', params: { code: {type:'string'}, language: {type:'string'} } },
    { name: 'pattern_store_episode', desc: 'Store experience', params: { trigger: {type:'string'}, reasoning: {type:'string'}, solution: {type:'string'}, outcome: {type:'string'} } },
    { name: 'pattern_retrieve_episodes', desc: 'Find similar episodes', params: { query: {type:'string'}, max_results: {type:'number'} } },
    { name: 'devtools_test_generator', desc: 'Generate tests', params: { source_code: {type:'string'}, framework: {type:'string'} } },
  ];
  for (const t of gatewayTools) {
    registry.register({ name: t.name, description: t.desc, input_schema: { type: 'object', properties: t.params } }, async (p) => {
      try {
        const r = await fetch(`${gatewayUrl}/call/${t.name}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(p), signal: AbortSignal.timeout(30000) });
        const d = await r.json() as { success: boolean; result?: unknown; error?: string };
        if (d.success && d.result) return { content: [{ type: 'text', text: JSON.stringify(d.result) }] };
        return { content: [{ type: 'text', text: d.error || 'Gateway error' }], isError: true };
      } catch (e) { return { content: [{ type: 'text', text: `Gateway offline: ${String(e)}` }], isError: true }; }
    });
  }
  log.info({ gatewayTools: gatewayTools.length }, 'Gateway tools registered');
}

