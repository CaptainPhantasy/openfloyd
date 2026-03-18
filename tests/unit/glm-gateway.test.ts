import { jest } from '@jest/globals';
import { GLMGateway, GLMApiError } from '../../src/llm/glm-gateway.js';

const MOCK_RESPONSE = {
  id: 'chatcmpl-test',
  choices: [
    {
      message: {
        role: 'assistant',
        content: 'Hello from GLM-5',
        tool_calls: undefined,
      },
      finish_reason: 'stop',
      index: 0,
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
  },
};

const MOCK_TOOL_RESPONSE = {
  id: 'chatcmpl-tool',
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'web_search',
              arguments: '{"query":"test"}',
            },
          },
        ],
      },
      finish_reason: 'tool_calls',
      index: 0,
    },
  ],
  usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
};

describe('GLMGateway', () => {
  let gateway: GLMGateway;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    gateway = new GLMGateway({ apiKey: 'test-key' });

    mockFetch = jest.fn() as jest.Mock;
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    gateway.destroy();
    jest.restoreAllMocks();
  });

  describe('chat', () => {
    it('sends request and parses response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => MOCK_RESPONSE,
      });

      const result = await gateway.chat({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.id).toBe('chatcmpl-test');
      expect(result.choices[0]!.message.content).toBe('Hello from GLM-5');
      expect(result.usage.total_tokens).toBe(15);
    });

    it('handles tool call responses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => MOCK_TOOL_RESPONSE,
      });

      const result = await gateway.chat({
        messages: [{ role: 'user', content: 'Search for test' }],
        tools: [
          {
            name: 'web_search',
            description: 'Search the web',
            input_schema: {
              type: 'object',
              properties: { query: { type: 'string' } },
            },
          },
        ],
      });

      expect(result.choices[0]!.finish_reason).toBe('tool_calls');
      expect(result.choices[0]!.message.tool_calls).toHaveLength(1);
      expect(result.choices[0]!.message.tool_calls![0]!.function.name).toBe('web_search');
    });

    it('tracks usage stats', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => MOCK_RESPONSE,
      });

      await gateway.chat({ messages: [{ role: 'user', content: 'Hi' }] });

      const stats = gateway.getUsageStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalInputTokens).toBe(10);
      expect(stats.totalOutputTokens).toBe(5);
      expect(stats.totalErrors).toBe(0);
    });

    it('calculates estimated cost', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => MOCK_RESPONSE,
      });

      await gateway.chat({ messages: [{ role: 'user', content: 'Hi' }] });

      const cost = gateway.getEstimatedCost();
      expect(cost.input).toBeGreaterThan(0);
      expect(cost.output).toBeGreaterThan(0);
      expect(cost.total).toBe(cost.input + cost.output);
    });
  });

  describe('retry logic', () => {
    it('retries on 429 rate limit errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Rate limited',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => MOCK_RESPONSE,
        });

      const result = await gateway.chat({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.id).toBe('chatcmpl-test');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 server errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => MOCK_RESPONSE,
        });

      const result = await gateway.chat({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.id).toBe('chatcmpl-test');
    });

    it('does not retry on 400 client errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      await expect(
        gateway.chat({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(GLMApiError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('circuit breaker', () => {
    it('opens after consecutive failures', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      });

      const quickGateway = new GLMGateway({ apiKey: 'test', maxRetries: 0 });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      for (let i = 0; i < 5; i++) {
        await quickGateway.chat({ messages: [{ role: 'user', content: 'Hi' }] }).catch(() => {});
      }

      expect(quickGateway.isHealthy()).toBe(false);

      await expect(
        quickGateway.chat({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(/circuit breaker is OPEN/);

      quickGateway.destroy();
    });
  });

  describe('isHealthy', () => {
    it('returns true initially', () => {
      expect(gateway.isHealthy()).toBe(true);
    });
  });
});
