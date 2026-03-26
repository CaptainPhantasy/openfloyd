import { createLogger } from '../utils/logger.js';
import type { LLMProvider } from './providers/base-provider.js';
import {
  TaskType,
  type LLMRequest,
  type LLMResponse,
  type RoutingRule,
  type LLMModelSpec,
} from '../types/index.js';

const log = createLogger('llm-router');

export const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  { taskType: TaskType.PLANNING, primaryProvider: 'zai', primaryModel: 'glm-5-turbo', fallbackProvider: 'anthropic', fallbackModel: 'claude-sonnet-4-6', maxConcurrent: 3 },
  { taskType: TaskType.CODING, primaryProvider: 'zai', primaryModel: 'glm-4', fallbackProvider: 'openai', fallbackModel: 'gpt-4o-mini', maxConcurrent: 5 },
  { taskType: TaskType.TESTING, primaryProvider: 'zai', primaryModel: 'glm-4', maxConcurrent: 5 },
  { taskType: TaskType.REVIEW, primaryProvider: 'zai', primaryModel: 'glm-5-turbo', maxConcurrent: 2 },
  { taskType: TaskType.RESEARCH, primaryProvider: 'zai', primaryModel: 'glm-5-turbo', fallbackProvider: 'perplexity', fallbackModel: 'sonar-pro', maxConcurrent: 3 },
  { taskType: TaskType.MARKETING, primaryProvider: 'zai', primaryModel: 'glm-5-turbo', fallbackProvider: 'anthropic', fallbackModel: 'claude-sonnet-4-6', maxConcurrent: 2 },
  { taskType: TaskType.FAST, primaryProvider: 'zai', primaryModel: 'glm-4', fallbackProvider: 'groq', fallbackModel: 'llama-3.3-70b-versatile', maxConcurrent: 10 },
];

export class LLMRouter {
  private providers = new Map<string, LLMProvider>();
  private rules: RoutingRule[] = [...DEFAULT_ROUTING_RULES];

  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
    log.info({ providerId: provider.id, name: provider.name }, 'Provider registered');
  }

  getProvider(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  setRoutingRules(rules: RoutingRule[]): void {
    this.rules = rules;
  }

  getRoutingRules(): RoutingRule[] {
    return this.rules;
  }

  async route(request: LLMRequest): Promise<LLMResponse> {
    const rule = this.rules.find((r) => r.taskType === request.taskType);
    if (!rule) {
      throw new Error(`No routing rule for task type: ${request.taskType}`);
    }

    // Try primary provider
    const primary = this.providers.get(rule.primaryProvider);
    if (primary) {
      try {
        const result = await primary.complete({
          model: rule.primaryModel,
          messages: request.messages,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          tools: request.tools,
        });

        const modelSpec = this.findModelSpec(primary, rule.primaryModel);
        const cost = this.calculateCost(result.usage.prompt_tokens, result.usage.completion_tokens, modelSpec);

        return {
          id: result.id,
          content: result.content,
          toolCalls: result.toolCalls,
          usage: result.usage,
          providerId: primary.id,
          model: rule.primaryModel,
          cost,
        };
      } catch (err) {
        log.warn({ err, provider: rule.primaryProvider, model: rule.primaryModel }, 'Primary provider failed');
      }
    }

    // Try fallback provider
    if (rule.fallbackProvider && rule.fallbackModel) {
      const fallback = this.providers.get(rule.fallbackProvider);
      if (fallback) {
        try {
          const result = await fallback.complete({
            model: rule.fallbackModel,
            messages: request.messages,
            maxTokens: request.maxTokens,
            temperature: request.temperature,
            tools: request.tools,
          });

          const modelSpec = this.findModelSpec(fallback, rule.fallbackModel);
          const cost = this.calculateCost(result.usage.prompt_tokens, result.usage.completion_tokens, modelSpec);

          log.info({ provider: rule.fallbackProvider, model: rule.fallbackModel }, 'Used fallback provider');
          return {
            id: result.id,
            content: result.content,
            toolCalls: result.toolCalls,
            usage: result.usage,
            providerId: fallback.id,
            model: rule.fallbackModel,
            cost,
          };
        } catch (err) {
          log.error({ err, provider: rule.fallbackProvider }, 'Fallback provider also failed');
        }
      }
    }

    throw new Error(`All providers failed for task type: ${request.taskType}`);
  }

  private findModelSpec(provider: LLMProvider, modelId: string): LLMModelSpec | undefined {
    return provider.getModels().find((m) => m.id === modelId);
  }

  private calculateCost(inputTokens: number, outputTokens: number, modelSpec?: LLMModelSpec): number {
    if (!modelSpec) return 0;
    return (inputTokens * modelSpec.costPerInputToken + outputTokens * modelSpec.costPerOutputToken) / 1_000_000;
  }
}
