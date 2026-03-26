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

// ── Additional branch coverage tests ──────────────────────────────────────

import { parseStructuredResponse, StructuredOutputError } from '../../src/llm/structured-output.js';
import type { ChatResponse } from '../../src/types/index.js';

describe('parseStructuredResponse', () => {
  it('parses response with tool_calls and valid JSON arguments', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: 'I will search',
          tool_calls: [{ function: { name: 'web_search', arguments: '{"query":"test"}' } }],
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('tool_call');
    expect(result.action.tool).toBe('web_search');
    expect(result.action.params).toEqual({ query: 'test' });
    expect(result.confidence).toBe(0.9);
  });

  it('handles tool_calls with invalid JSON arguments', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          tool_calls: [{ function: { name: 'web_search', arguments: 'not-json' } }],
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('tool_call');
    expect(result.action.params).toEqual({});
  });

  it('throws on empty choices array', () => {
    const response: ChatResponse = { choices: [] };
    expect(() => parseStructuredResponse(response)).toThrow(StructuredOutputError);
  });

  it('uses fallback reasoning when tool_calls have empty content', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'web_search', arguments: '{}' } }],
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.reasoning).toBe('Tool call requested');
  });

  it('throws on empty content without tool_calls', () => {
    const response: ChatResponse = {
      choices: [{ message: { role: 'assistant', content: '' } }],
    };
    expect(() => parseStructuredResponse(response)).toThrow(StructuredOutputError);
  });

  it('parses JSON in code block', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: '```json\n{"reasoning":"because","action":{"type":"respond","response":"hello"},"confidence":0.85}\n```',
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('respond');
    expect(result.action.response).toBe('hello');
    expect(result.confidence).toBe(0.85);
  });

  it('falls through on invalid JSON in code block', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: '```json\n{invalid json}\n```',
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('respond');
    expect(result.confidence).toBe(0.7);
  });

  it('parses bare JSON object', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: '{"reasoning":"yes","action":{"type":"wait"},"confidence":0.6}',
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('wait');
    expect(result.confidence).toBe(0.6);
  });

  it('returns plain respond for non-JSON content', () => {
    const response: ChatResponse = {
      choices: [{ message: { role: 'assistant', content: 'Just a plain response' } }],
    };
    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('respond');
    expect(result.action.response).toBe('Just a plain response');
    expect(result.confidence).toBe(0.7);
  });

  it('falls back when reasoning field is missing', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: '{"action":{"type":"respond","response":"hi"}}',
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('respond');
    expect(result.confidence).toBe(0.5);
  });

  it('falls back when action field is missing', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: '{"reasoning":"thinking"}',
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('respond');
    expect(result.confidence).toBe(0.5);
  });

  it('falls back when action type is invalid', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: '{"reasoning":"hmm","action":{"type":"invalid_type"}}',
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.action.type).toBe('respond');
    expect(result.confidence).toBe(0.5);
  });

  it('defaults confidence to 0.8 when not a number', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: '{"reasoning":"ok","action":{"type":"respond","response":"hi"},"confidence":"high"}',
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.confidence).toBe(0.8);
  });

  it('clamps confidence above 1 to 1', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: '{"reasoning":"ok","action":{"type":"respond","response":"hi"},"confidence":2.5}',
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.confidence).toBe(1);
  });

  it('clamps confidence below 0 to 0', () => {
    const response: ChatResponse = {
      choices: [{
        message: {
          role: 'assistant',
          content: '{"reasoning":"ok","action":{"type":"respond","response":"hi"},"confidence":-0.5}',
        },
      }],
    };
    const result = parseStructuredResponse(response);
    expect(result.confidence).toBe(0);
  });
});

describe('ContextManager additional coverage', () => {
  it('logs warning when system prompt exceeds budget', () => {
    const cm = new ContextManager({
      maxTokens: 1000,
      budget: { systemPrompt: 5 },
    });
    // 100 chars / 4 = 25 tokens >> budget of 5
    cm.setSystemPrompt('a'.repeat(100));
    // Should not throw, just warn
    expect(cm.getTokenCount()).toBeGreaterThan(0);
  });

  it('getTokenCount works without system prompt', () => {
    const cm = new ContextManager({ maxTokens: 100_000 });
    cm.addMessage({ role: 'user', content: 'Hello' });
    expect(cm.getTokenCount()).toBeGreaterThan(0);
  });

  it('compress does nothing with fewer than 2 messages', async () => {
    const cm = new ContextManager({ maxTokens: 50, compressionThreshold: 0.5 });
    cm.addMessage({ role: 'user', content: 'Hello' });
    await cm.compress();
    expect(cm.getMessageCount()).toBe(1);
  });

  it('compress uses custom summarizer', async () => {
    let summarizerCalled = false;
    const cm = new ContextManager({
      maxTokens: 20,
      compressionThreshold: 0.5,
      summarizer: async () => {
        summarizerCalled = true;
        return 'summary';
      },
    });
    // Need >= 4 messages so Math.ceil(n*0.3) >= 2
    cm.addMessage({ role: 'user', content: 'a'.repeat(100) });
    cm.addMessage({ role: 'assistant', content: 'b'.repeat(100) });
    cm.addMessage({ role: 'user', content: 'c'.repeat(100) });
    cm.addMessage({ role: 'assistant', content: 'd'.repeat(100) });
    await cm.compress();
    expect(summarizerCalled).toBe(true);
    // 4 messages - 2 compressed + 1 summary = 3
    expect(cm.getMessageCount()).toBe(3);
  });

  it('buildMessages truncates when exceeding budget', () => {
    const cm = new ContextManager({ maxTokens: 100 });
    cm.setSystemPrompt('System prompt here');
    for (let i = 0; i < 50; i++) {
      cm.addMessage({ role: 'user', content: `Message ${i} with some content` });
    }
    const msgs = cm.buildMessages();
    // Should have fewer than 51 messages (system + 50 user)
    expect(msgs.length).toBeLessThan(51);
  });

  it('buildMessages accounts for toolsTokenEstimate', () => {
    const cm = new ContextManager({ maxTokens: 200 });
    cm.addMessage({ role: 'user', content: 'Hello' });
    const withTools = cm.buildMessages(100);
    const withoutTools = cm.buildMessages(0);
    // With tools estimate, less space for messages
    expect(withTools.length).toBeLessThanOrEqual(withoutTools.length);
  });

  it('clear resets everything', () => {
    const cm = new ContextManager({ maxTokens: 100_000 });
    cm.setSystemPrompt('System');
    cm.addMessage({ role: 'user', content: 'Hello' });
    cm.addWorkingMemory('fact', 'test');
    cm.clear();
    expect(cm.getMessageCount()).toBe(0);
    // After clear, only overhead tokens remain from empty arrays
    expect(cm.getTokenCount()).toBeLessThanOrEqual(10);
  });

  it('getStats returns correct values', () => {
    const cm = new ContextManager({ maxTokens: 100_000 });
    cm.addMessage({ role: 'user', content: 'Hello' });
    const stats = cm.getStats();
    expect(stats.messageCount).toBe(1);
    expect(stats.compressionCount).toBe(0);
    expect(stats.lastCompressionAt).toBeNull();
  });

  it('needsCompression returns false when under threshold', () => {
    const cm = new ContextManager({ maxTokens: 1_000_000, compressionThreshold: 0.8 });
    cm.addMessage({ role: 'user', content: 'Hi' });
    expect(cm.needsCompression()).toBe(false);
  });
});
