import { jest } from '@jest/globals';
import { ToolRegistry, createBuiltinTools } from '../../src/execution/tool-registry.js';
import { MCPClient } from '../../src/execution/mcp-client.js';
import type { MCPToolResult } from '../../src/types/index.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register/unregister', () => {
    it('registers a tool', () => {
      registry.register(
        { name: 'test_tool', description: 'Test', input_schema: { type: 'object', properties: {} } },
        async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      );
      expect(registry.hasTool('test_tool')).toBe(true);
      expect(registry.getToolNames()).toContain('test_tool');
    });

    it('unregisters a tool', () => {
      registry.register(
        { name: 'remove_me', description: 'X', input_schema: { type: 'object', properties: {} } },
        async () => ({ content: [{ type: 'text', text: '' }] }),
      );
      registry.unregister('remove_me');
      expect(registry.hasTool('remove_me')).toBe(false);
    });
  });

  describe('call', () => {
    it('calls a registered tool and returns result', async () => {
      registry.register(
        { name: 'adder', description: 'Add numbers', input_schema: { type: 'object', properties: {} } },
        async (params) => {
          const a = params['a'] as number;
          const b = params['b'] as number;
          return { content: [{ type: 'text', text: String(a + b) }] };
        },
      );

      const result = await registry.call('adder', { a: 3, b: 5 });
      expect(result.content[0]!.text).toBe('8');
      expect(result.isError).toBeUndefined();
    });

    it('returns error for unknown tool', async () => {
      const result = await registry.call('nonexistent', {});
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('Unknown tool');
    });

    it('returns error for disabled tool', async () => {
      registry.register(
        { name: 'disabled', description: 'X', input_schema: { type: 'object', properties: {} } },
        async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      );
      registry.setEnabled('disabled', false);

      const result = await registry.call('disabled', {});
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('disabled');
    });

    it('catches handler errors gracefully', async () => {
      registry.register(
        { name: 'broken', description: 'Breaks', input_schema: { type: 'object', properties: {} } },
        async () => { throw new Error('Handler exploded'); },
      );

      const result = await registry.call('broken', {});
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('Handler exploded');
    });

    it('tracks call statistics', async () => {
      registry.register(
        { name: 'counted', description: 'X', input_schema: { type: 'object', properties: {} } },
        async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      );

      await registry.call('counted', {});
      await registry.call('counted', {});

      const stats = registry.getStats();
      const toolStat = stats.find((s) => s.name === 'counted');
      expect(toolStat!.callCount).toBe(2);
      expect(toolStat!.lastCalledAt).not.toBeNull();
    });
  });

  describe('getDefinitions', () => {
    it('returns only enabled tool definitions', () => {
      registry.register(
        { name: 'a', description: 'A', input_schema: { type: 'object', properties: {} } },
        async () => ({ content: [] }),
      );
      registry.register(
        { name: 'b', description: 'B', input_schema: { type: 'object', properties: {} } },
        async () => ({ content: [] }),
      );
      registry.setEnabled('b', false);

      const defs = registry.getDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0]!.name).toBe('a');
    });
  });

  describe('createBuiltinTools', () => {
    it('registers web_search, web_reader, execute_code', () => {
      createBuiltinTools(registry);
      expect(registry.hasTool('web_search')).toBe(true);
      expect(registry.hasTool('web_reader')).toBe(true);
      expect(registry.hasTool('execute_code')).toBe(true);
      expect(registry.getDefinitions()).toHaveLength(36);
    });
  });
});

describe('MCPClient', () => {
  let registry: ToolRegistry;
  let client: MCPClient;

  beforeEach(() => {
    registry = new ToolRegistry();
    client = new MCPClient(registry);
  });

  describe('callTool', () => {
    it('delegates to registry and returns result', async () => {
      registry.register(
        { name: 'echo', description: 'Echo', input_schema: { type: 'object', properties: {} } },
        async (params) => ({ content: [{ type: 'text', text: String(params['msg']) }] }),
      );

      const result = await client.callTool('echo', { msg: 'hello' });
      expect(result.content[0]!.text).toBe('hello');
    });
  });

  describe('listTools', () => {
    it('returns tool definitions', () => {
      createBuiltinTools(registry);
      const tools = client.listTools();
      expect(tools.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('buildRequest', () => {
    it('creates valid MCP JSON-RPC request', () => {
      const request = client.buildRequest('web_search', { query: 'test' });
      expect(request.jsonrpc).toBe('2.0');
      expect(request.method).toBe('tools/call');
      expect(request.params.name).toBe('web_search');
      expect(request.params.arguments).toEqual({ query: 'test' });
      expect(typeof request.id).toBe('number');
    });
  });

  describe('buildResponse', () => {
    it('creates success response', () => {
      const result: MCPToolResult = { content: [{ type: 'text', text: 'ok' }] };
      const response = client.buildResponse(1, result);
      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      expect(response.error).toBeUndefined();
    });

    it('creates error response', () => {
      const result: MCPToolResult = { content: [{ type: 'text', text: 'failed' }], isError: true };
      const response = client.buildResponse(1, result);
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32000);
    });
  });
});
