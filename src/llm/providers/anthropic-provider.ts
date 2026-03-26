import { createLogger } from '../../utils/logger.js';
import type { LLMProvider } from './base-provider.js';
import type {
  LLMModelSpec,
  RateLimitStatus,
  ProviderRequest,
  ProviderResponse,
  ProviderChunk,
} from '../../types/index.js';

const log = createLogger('anthropic-provider');

const ANTHROPIC_MODELS: LLMModelSpec[] = [
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    contextWindow: 200_000,
    maxOutputTokens: 8192,
    costPerInputToken: 3.0,
    costPerOutputToken: 15.0,
    capabilities: ['reasoning', 'coding', 'vision', 'tools'],
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    contextWindow: 200_000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.8,
    costPerOutputToken: 4.0,
    capabilities: ['coding', 'tools'],
  },
];

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  private apiKey: string;
  private baseUrl: string;
  private rateLimitRemaining = 100;
  private rateLimitResetsAt = new Date();

  constructor(apiKey: string, baseUrl = 'https://api.anthropic.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  getModels(): LLMModelSpec[] {
    return ANTHROPIC_MODELS;
  }

  supportsStreaming(): boolean {
    return true;
  }

  supportsTools(): boolean {
    return true;
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const systemMsg = request.messages.find((m) => m.role === 'system');
    const nonSystemMsgs = request.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: nonSystemMsgs.map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
      })),
    };

    if (systemMsg) {
      body['system'] = systemMsg.content;
    }

    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    const remaining = response.headers.get('anthropic-ratelimit-requests-remaining');
    const reset = response.headers.get('anthropic-ratelimit-requests-reset');
    if (remaining) this.rateLimitRemaining = parseInt(remaining, 10);
    if (reset) this.rateLimitResetsAt = new Date(reset);

    const data = await response.json() as {
      id: string;
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      usage: { input_tokens: number; output_tokens: number };
      stop_reason: string;
    };

    const textBlocks = data.content.filter((b) => b.type === 'text');
    const toolBlocks = data.content.filter((b) => b.type === 'tool_use');

    return {
      id: data.id,
      content: textBlocks.map((b) => b.text ?? '').join(''),
      toolCalls: toolBlocks.length > 0 ? toolBlocks.map((b) => ({
        id: b.id ?? crypto.randomUUID(),
        type: 'function' as const,
        function: {
          name: b.name ?? '',
          arguments: JSON.stringify(b.input ?? {}),
        },
      })) : undefined,
      usage: {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      finishReason: data.stop_reason,
    };
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderChunk> {
    const systemMsg = request.messages.find((m) => m.role === 'system');
    const nonSystemMsgs = request.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
      messages: nonSystemMsgs.map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
      })),
    };
    if (systemMsg) body['system'] = systemMsg.content;

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Anthropic streaming error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const result = await reader.read();
      if (result.done) break;

      buffer += decoder.decode(result.value as Uint8Array, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();

        try {
          const parsed = JSON.parse(data) as {
            type: string;
            delta?: { type: string; text?: string; stop_reason?: string };
          };

          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield { content: parsed.delta.text };
          }
          if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
            yield { finishReason: parsed.delta.stop_reason };
          }
          if (parsed.type === 'message_stop') {
            return;
          }
        } catch {
          log.warn({ data }, 'Failed to parse Anthropic SSE chunk');
        }
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getRateLimitStatus(): RateLimitStatus {
    return {
      remaining: this.rateLimitRemaining,
      limit: 100,
      resetsAt: this.rateLimitResetsAt,
    };
  }
}
