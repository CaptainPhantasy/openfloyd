import { createLogger } from '../utils/logger.js';
import type {
  MCPTool,
  MCPToolResult,
  MCPRequest,
  MCPResponse,
} from '../types/index.js';
import { ToolRegistry } from './tool-registry.js';

const log = createLogger('mcp-client');

let requestCounter = 0;

export class MCPClient {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const request = this.buildRequest(name, args);
    log.debug({ request: { method: request.method, id: request.id, tool: name } }, 'MCP request');

    const result = await this.registry.call(name, args);

    const response = this.buildResponse(request.id, result);
    log.debug({ response: { id: response.id, isError: !!response.error } }, 'MCP response');

    return result;
  }

  listTools(): MCPTool[] {
    return this.registry.getDefinitions();
  }

  hasTool(name: string): boolean {
    return this.registry.hasTool(name);
  }

  buildRequest(name: string, args: Record<string, unknown>): MCPRequest {
    return {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name, arguments: args },
      id: ++requestCounter,
    };
  }

  buildResponse(id: number | string, result: MCPToolResult): MCPResponse {
    if (result.isError) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: result.content[0]?.text ?? 'Unknown error',
        },
        id,
      };
    }

    return {
      jsonrpc: '2.0',
      result,
      id,
    };
  }
}
