import { createLogger } from '../../utils/logger.js';
import type { LLMProvider } from './base-provider.js';
import type {
  LLMModelSpec,
  RateLimitStatus,
  ProviderRequest,
  ProviderResponse,
  ProviderChunk,
} from '../../types/index.js';

const log = createLogger('glm-provider');

const DEFAULT_BASE_URL = 'https://api.z.ai/api/paas/v4';

const GLM_MODELS: LLMModelSpec[] = [
  {
    id: 'glm-5-turbo',
    name: 'GLM-5 Turbo',
    contextWindow: 128_000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.5,
    costPerOutputToken: 1.5,
    capabilities: ['reasoning', 'coding', 'tools'],
  },
  {
    id: 'glm-4',
    name: 'GLM-4',
    contextWindow: 128_000,
    maxOutputTokens: 4096,
    costPerInputToken: 0.1,
    costPerOutputToken: 0.3,
    capabilities: ['coding', 'tools'],
  },
];

export class GLMProvider implements LLMProvider {
  readonly id = 'zai';
  readonly name = 'Z.ai GLM';
  private apiKey: string;
  private baseUrl: string;
  private rateLimitRemaining = 100;
  private rateLimitResetsAt = new Date();

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
  }

  getModels(): LLMModelSpec[] {
    return GLM_MODELS;
  }

  supportsStreaming(): boolean {
    return true;
  }

  supportsTools(): boolean {
    return true;
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const body = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 1.0,
      stream: false,
      ...(request.tools && request.tools.length > 0 ? { tools: request.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) } : {}),
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GLM API error ${response.status}: ${text}`);
    }

    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');
    if (remaining) this.rateLimitRemaining = parseInt(remaining, 10);
    if (reset) this.rateLimitResetsAt = new Date(parseInt(reset, 10) * 1000);

    const data = await response.json() as {
      id: string;
      choices: Array<{ message: { content?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> }; finish_reason: string }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = data.choices[0];
    return {
      id: data.id,
      content: choice?.message.content ?? '',
      toolCalls: choice?.message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: tc.function,
      })),
      usage: data.usage,
      finishReason: choice?.finish_reason ?? 'stop',
    };
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderChunk> {
    const body = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 1.0,
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      throw new Error(`GLM streaming error ${response.status}`);
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
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data) as { choices: Array<{ delta: { content?: string }; finish_reason?: string }> };
          const delta = parsed.choices[0]?.delta;
          if (delta?.content) {
            yield { content: delta.content };
          }
          if (parsed.choices[0]?.finish_reason) {
            yield { finishReason: parsed.choices[0].finish_reason };
          }
        } catch {
          log.warn({ data }, 'Failed to parse SSE chunk');
        }
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
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
