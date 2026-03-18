import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  MCPTool,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('glm-gateway');

const DEFAULT_BASE_URL = 'https://api.z.ai/api/paas/v4';
const DEFAULT_MODEL = 'glm-5-turbo';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 1.0;

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 60_000;

export interface GLMGatewayConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
}

interface UsageStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalErrors: number;
  cacheHits: number;
}

export class GLMGateway {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private maxRetries: number;

  private consecutiveFailures = 0;
  private circuitOpen = false;
  private circuitResetTimer: ReturnType<typeof setTimeout> | null = null;

  private stats: UsageStats = {
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalErrors: 0,
    cacheHits: 0,
  };

  constructor(config: GLMGatewayConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.model = config.model ?? DEFAULT_MODEL;
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
    this.maxRetries = config.maxRetries ?? MAX_RETRIES;

    log.info(
      { model: this.model, baseUrl: this.baseUrl },
      'GLM gateway initialized',
    );
  }

  async chat(params: {
    messages: ChatMessage[];
    tools?: MCPTool[];
    thinking?: boolean;
    stream?: boolean;
    maxTokens?: number;
    temperature?: number;
  }): Promise<ChatResponse> {
    if (this.circuitOpen) {
      throw new Error('GLM gateway circuit breaker is OPEN — requests are blocked');
    }

    const request: ChatRequest = {
      model: this.model,
      messages: params.messages,
      tools: params.tools,
      thinking: params.thinking ? { type: 'enabled' } : undefined,
      max_tokens: params.maxTokens ?? this.maxTokens,
      temperature: params.temperature ?? this.temperature,
      stream: params.stream ?? false,
    };

    this.stats.totalRequests++;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
          const jitter = Math.random() * backoff * 0.1;
          log.warn({ attempt, backoff_ms: backoff }, 'Retrying GLM request');
          await this.sleep(backoff + jitter);
        }

        const response = await this.makeRequest(request);
        this.consecutiveFailures = 0;

        this.stats.totalInputTokens += response.usage.prompt_tokens;
        this.stats.totalOutputTokens += response.usage.completion_tokens;

        log.debug(
          {
            requestId: response.id,
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
            finishReason: response.choices[0]?.finish_reason,
          },
          'GLM request completed',
        );

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const isRetryable = this.isRetryableError(lastError);
        if (!isRetryable || attempt === this.maxRetries) {
          this.stats.totalErrors++;
          this.consecutiveFailures++;

          if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
            this.openCircuitBreaker();
          }

          log.error(
            { err: lastError, attempt, retryable: isRetryable },
            'GLM request failed',
          );
          break;
        }
      }
    }

    throw lastError ?? new Error('GLM request failed with unknown error');
  }

  getUsageStats(): Readonly<UsageStats> {
    return { ...this.stats };
  }

  getEstimatedCost(): { input: number; output: number; total: number } {
    const inputCost = (this.stats.totalInputTokens / 1_000_000) * 0.96;
    const outputCost = (this.stats.totalOutputTokens / 1_000_000) * 3.20;
    return { input: inputCost, output: outputCost, total: inputCost + outputCost };
  }

  isHealthy(): boolean {
    return !this.circuitOpen;
  }

  destroy(): void {
    if (this.circuitResetTimer) {
      clearTimeout(this.circuitResetTimer);
      this.circuitResetTimer = null;
    }
  }

  private async makeRequest(request: ChatRequest): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body = JSON.stringify({
      model: request.model,
      messages: request.messages,
      ...(request.tools && request.tools.length > 0 ? { tools: this.formatTools(request.tools) } : {}),
      ...(request.thinking ? { thinking: request.thinking } : {}),
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      stream: request.stream,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      throw new GLMApiError(
        `GLM API error ${response.status}: ${errorBody}`,
        response.status,
        errorBody,
      );
    }

    const data = (await response.json()) as GLMRawResponse;

    return this.parseResponse(data);
  }

  private formatTools(tools: MCPTool[]): object[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  private parseResponse(raw: GLMRawResponse): ChatResponse {
    const firstChoice = raw.choices?.[0];
    if (!firstChoice) {
      throw new Error('GLM API returned no choices');
    }

    return {
      id: raw.id,
      choices: raw.choices.map((choice) => ({
        message: {
          role: choice.message.role as ChatMessage['role'],
          content: choice.message.content ?? '',
          tool_calls: choice.message.tool_calls?.map((tc) => ({
            id: tc.id,
            type: tc.type as 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        },
        finish_reason: choice.finish_reason as ChatResponse['choices'][0]['finish_reason'],
        index: choice.index,
      })),
      usage: {
        prompt_tokens: raw.usage?.prompt_tokens ?? 0,
        completion_tokens: raw.usage?.completion_tokens ?? 0,
        total_tokens: raw.usage?.total_tokens ?? 0,
      },
    };
  }

  private isRetryableError(error: Error): boolean {
    if (error instanceof GLMApiError) {
      return error.statusCode === 429 || error.statusCode >= 500;
    }
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('fetch failed')
    );
  }

  private openCircuitBreaker(): void {
    this.circuitOpen = true;
    log.error(
      { consecutiveFailures: this.consecutiveFailures },
      'GLM gateway circuit breaker OPEN',
    );

    this.circuitResetTimer = setTimeout(() => {
      this.circuitOpen = false;
      this.consecutiveFailures = 0;
      log.info('GLM gateway circuit breaker CLOSED');
    }, CIRCUIT_BREAKER_RESET_MS);

    this.circuitResetTimer.unref();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class GLMApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = 'GLMApiError';
  }
}

interface GLMRawResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
