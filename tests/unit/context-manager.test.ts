import { jest } from '@jest/globals';
import { ContextManager } from '../../src/llm/context-manager.js';
import { PromptCache } from '../../src/llm/prompt-cache.js';
import {
  parseStructuredResponse,
  StructuredOutputError,
} from '../../src/llm/structured-output.js';
import { estimateTokens, estimateConversationTokens } from '../../src/utils/token-counter.js';
import type { ChatResponse } from '../../src/types/index.js';

describe('ContextManager', () => {
  let cm: ContextManager;

  beforeEach(() => {
    cm = new ContextManager({ maxTokens: 1000 });
  });

  describe('message management', () => {
    it('adds messages and tracks count', () => {
      cm.addMessage({ role: 'user', content: 'Hello' });
      cm.addMessage({ role: 'assistant', content: 'Hi there' });
      expect(cm.getMessageCount()).toBe(2);
    });

    it('sets system prompt', () => {
      cm.setSystemPrompt('You are a helpful agent');
      const messages = cm.buildMessages();
      expect(messages[0]!.role).toBe('system');
      expect(messages[0]!.content).toBe('You are a helpful agent');
    });

    it('includes working memory in built messages', () => {
      cm.setSystemPrompt('System');
      cm.addWorkingMemory('User prefers bullet points', 'preferences');
      cm.addMessage({ role: 'user', content: 'Hello' });

      const messages = cm.buildMessages();
      expect(messages.some((m) => m.content.includes('[Memory/preferences]'))).toBe(true);
    });

    it('clears working memory', () => {
      cm.addWorkingMemory('test', 'source');
      cm.clearWorkingMemory();
      const messages = cm.buildMessages();
      expect(messages.every((m) => !m.content.includes('[Memory/'))).toBe(true);
    });
  });

  describe('token counting', () => {
    it('tracks token count', () => {
      cm.addMessage({ role: 'user', content: 'Hello world' });
      expect(cm.getTokenCount()).toBeGreaterThan(0);
    });

    it('detects when compression is needed', () => {
      const smallCm = new ContextManager({ maxTokens: 100, compressionThreshold: 0.5 });
      for (let i = 0; i < 20; i++) {
        smallCm.addMessage({ role: 'user', content: `This is a longer message number ${i} with some content` });
      }
      expect(smallCm.needsCompression()).toBe(true);
    });
  });

  describe('compression', () => {
    it('compresses history when threshold exceeded', async () => {
      const smallCm = new ContextManager({
        maxTokens: 200,
        compressionThreshold: 0.5,
      });

      for (let i = 0; i < 20; i++) {
        smallCm.addMessage({
          role: 'user',
          content: `Message ${i}: some moderately long content to fill up tokens`,
        });
      }

      const beforeCount = smallCm.getMessageCount();
      await smallCm.compress();
      const afterCount = smallCm.getMessageCount();

      expect(afterCount).toBeLessThan(beforeCount);
    });

    it('uses custom summarizer when provided', async () => {
      const mockSummarizer = jest.fn().mockResolvedValue('Custom summary');

      const smallCm = new ContextManager({
        maxTokens: 200,
        compressionThreshold: 0.5,
        summarizer: mockSummarizer as unknown as (msgs: import('../../src/types/index.js').ChatMessage[]) => Promise<string>,
      });

      for (let i = 0; i < 20; i++) {
        smallCm.addMessage({ role: 'user', content: `Message ${i} with enough content to trigger compression` });
      }

      await smallCm.compress();
      expect(mockSummarizer).toHaveBeenCalled();
    });

    it('tracks compression stats', async () => {
      const smallCm = new ContextManager({
        maxTokens: 200,
        compressionThreshold: 0.5,
      });

      for (let i = 0; i < 20; i++) {
        smallCm.addMessage({ role: 'user', content: `Message ${i} with content` });
      }

      await smallCm.compress();
      const stats = smallCm.getStats();
      expect(stats.compressionCount).toBe(1);
      expect(stats.lastCompressionAt).not.toBeNull();
    });
  });

  describe('buildMessages', () => {
    it('builds messages in correct order', () => {
      const largeCm = new ContextManager({ maxTokens: 200_000 });
      largeCm.setSystemPrompt('System prompt');
      largeCm.addWorkingMemory('Memory item', 'test');
      largeCm.addMessage({ role: 'user', content: 'User message' });
      largeCm.addMessage({ role: 'assistant', content: 'Assistant response' });

      const messages = largeCm.buildMessages();
      expect(messages[0]!.role).toBe('system');
      expect(messages[0]!.content).toBe('System prompt');
      expect(messages[messages.length - 1]!.role).toBe('assistant');
    });

    it('truncates when exceeding available budget', () => {
      const tinyCm = new ContextManager({ maxTokens: 100 });
      for (let i = 0; i < 50; i++) {
        tinyCm.addMessage({
          role: 'user',
          content: `A reasonably long message ${i} to test truncation behavior`,
        });
      }
      const messages = tinyCm.buildMessages();
      expect(messages.length).toBeLessThan(50);
    });
  });

  describe('clear', () => {
    it('resets all state', () => {
      cm.setSystemPrompt('System');
      cm.addMessage({ role: 'user', content: 'Hello' });
      cm.addWorkingMemory('test', 'src');
      cm.clear();

      expect(cm.getMessageCount()).toBe(0);
      expect(cm.getTokenCount()).toBe(6);
      expect(cm.buildMessages()).toHaveLength(0);
    });
  });
});

describe('PromptCache', () => {
  let cache: PromptCache;

  beforeEach(() => {
    cache = new PromptCache();
  });

  it('caches and retrieves system prompts', () => {
    cache.cacheSystemPrompt('You are a helpful agent');
    const result = cache.get('system');
    expect(result).toBe('You are a helpful agent');
  });

  it('caches tool definitions', () => {
    const toolsJson = JSON.stringify([{ name: 'test' }]);
    cache.cacheToolDefinitions(toolsJson);
    expect(cache.get('tools')).toBe(toolsJson);
  });

  it('caches dynamic content', () => {
    cache.cacheDynamic('query-hash', 'some cached result');
    expect(cache.get('dynamic:query-hash')).toBe('some cached result');
  });

  it('returns null for expired entries', async () => {
    const shortCache = new PromptCache({ dynamicTTL: 50 });
    shortCache.cacheDynamic('expire-test', 'will expire');
    await new Promise((r) => setTimeout(r, 100));
    expect(shortCache.get('dynamic:expire-test')).toBeNull();
  });

  it('tracks hit/miss stats', () => {
    cache.cacheSystemPrompt('test');
    cache.get('system');
    cache.get('system');
    cache.get('nonexistent');

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
  });

  it('invalidates entries', () => {
    cache.cacheSystemPrompt('test');
    cache.invalidate('system');
    expect(cache.get('system')).toBeNull();
  });

  it('evicts oldest when max entries reached', () => {
    const smallCache = new PromptCache({ maxEntries: 3 });
    smallCache.cacheDynamic('a', 'first');
    smallCache.cacheDynamic('b', 'second');
    smallCache.cacheDynamic('c', 'third');
    smallCache.cacheDynamic('d', 'fourth');

    const stats = smallCache.getStats();
    expect(stats.entries).toBeLessThanOrEqual(3);
  });
});

describe('StructuredOutput', () => {
  function makeResponse(content: string, toolCalls?: unknown[]): ChatResponse {
    return {
      id: 'test',
      choices: [
        {
          message: {
            role: 'assistant',
            content,
            tool_calls: toolCalls as ChatResponse['choices'][0]['message']['tool_calls'],
          },
          finish_reason: 'stop',
          index: 0,
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  it('parses tool call responses', () => {
    const response = makeResponse('', [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'web_search', arguments: '{"query":"test"}' },
      },
    ]);

    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('tool_call');
    expect(result.action.tool).toBe('web_search');
    expect(result.action.params).toEqual({ query: 'test' });
  });

  it('parses JSON structured responses', () => {
    const json = JSON.stringify({
      reasoning: 'I need to search for info',
      action: { type: 'tool_call', tool: 'web_search', params: { query: 'test' } },
      confidence: 0.95,
    });
    const response = makeResponse(json);

    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('tool_call');
    expect(result.confidence).toBe(0.95);
  });

  it('falls back to natural response for plain text', () => {
    const response = makeResponse('I don\'t have enough information to answer.');

    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('respond');
    expect(result.action.response).toContain('enough information');
  });

  it('throws on empty choices', () => {
    const response: ChatResponse = {
      id: 'test',
      choices: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };

    expect(() => parseStructuredResponse(response)).toThrow(StructuredOutputError);
  });

  it('handles malformed JSON gracefully', () => {
    const response = makeResponse('Some text with {broken json');
    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('respond');
  });
});

describe('TokenCounter', () => {
  it('estimates tokens from text', () => {
    const tokens = estimateTokens('Hello world');
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });

  it('estimates conversation tokens', () => {
    const tokens = estimateConversationTokens([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there, how can I help you?' },
    ]);
    expect(tokens).toBeGreaterThan(0);
  });
});
