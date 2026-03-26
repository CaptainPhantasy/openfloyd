import type {
  LLMModelSpec,
  RateLimitStatus,
  ProviderRequest,
  ProviderResponse,
  ProviderChunk,
} from '../../types/index.js';

export interface LLMProvider {
  id: string;
  name: string;

  getModels(): LLMModelSpec[];
  supportsStreaming(): boolean;
  supportsTools(): boolean;

  complete(request: ProviderRequest): Promise<ProviderResponse>;
  stream(request: ProviderRequest): AsyncIterable<ProviderChunk>;

  isAvailable(): Promise<boolean>;
  getRateLimitStatus(): RateLimitStatus;
}
