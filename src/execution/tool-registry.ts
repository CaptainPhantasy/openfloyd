import { createLogger } from '../utils/logger.js';
import type { MCPTool, MCPToolResult } from '../types/index.js';

const log = createLogger('tool-registry');

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
    async (params) => {
      return {
        content: [{
          type: 'text',
          text: `[execute_code stub] Language: ${String(params['language'])} — WASM runtime modules not yet deployed`,
        }],
      };
    },
  );

  log.info({ tools: registry.getToolNames() }, 'Built-in tools registered');
}
