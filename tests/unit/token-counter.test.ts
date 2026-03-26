import { describe, it, expect } from '@jest/globals';
import type { ChatMessage, MCPTool } from '../../src/types/index.js';
import {
  estimateTokens,
  estimateMessageTokens,
  estimateConversationTokens,
  estimateToolsTokens,
} from '../../src/utils/token-counter.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns ceil(length/4) for non-empty strings', () => {
    // 'hello' = 5 chars → ceil(5/4) = 2
    expect(estimateTokens('hello')).toBe(2);
  });

  it('handles exact multiples of 4', () => {
    // 'abcd' = 4 chars → ceil(4/4) = 1
    expect(estimateTokens('abcd')).toBe(1);
  });

  it('handles long strings', () => {
    const long = 'a'.repeat(100);
    expect(estimateTokens(long)).toBe(25); // ceil(100/4)
  });
});

describe('estimateMessageTokens', () => {
  it('calculates tokens for basic message with role and content', () => {
    const msg: ChatMessage = { role: 'user', content: 'hello' };
    // overhead(4) + role(ceil(4/4)=1) + content(ceil(5/4)=2) = 7
    expect(estimateMessageTokens(msg)).toBe(7);
  });

  it('includes tokens for message.name field', () => {
    const msg: ChatMessage = { role: 'assistant', content: 'hi', name: 'floyd' };
    // overhead(4) + role(ceil(9/4)=3) + content(ceil(2/4)=1) + name(ceil(5/4)=2) + 1 = 11
    expect(estimateMessageTokens(msg)).toBe(11);
  });

  it('includes tokens for tool_calls array', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
        },
      ],
    };
    // overhead(4) + role(ceil(9/4)=3) + content(0)
    // tool_call: name(ceil(10/4)=3) + args(ceil(14/4)=4) + 3 = 10
    // total = 4 + 3 + 0 + 10 = 17
    expect(estimateMessageTokens(msg)).toBe(17);
  });

  it('includes tokens for multiple tool_calls', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: { name: 'fn_a', arguments: '{}' },
        },
        {
          id: 'c2',
          type: 'function',
          function: { name: 'fn_b', arguments: '{}' },
        },
      ],
    };
    // overhead(4) + role(3) + content(0)
    // call1: name(ceil(4/4)=1) + args(ceil(2/4)=1) + 3 = 5
    // call2: name(ceil(4/4)=1) + args(ceil(2/4)=1) + 3 = 5
    // total = 4 + 3 + 0 + 5 + 5 = 17
    expect(estimateMessageTokens(msg)).toBe(17);
  });

  it('includes tokens for tool_call_id field', () => {
    const msg: ChatMessage = {
      role: 'tool',
      content: 'result data',
      tool_call_id: 'call_abc123',
    };
    // overhead(4) + role(ceil(4/4)=1) + content(ceil(11/4)=3) + tool_call_id(ceil(11/4)=3) = 11
    expect(estimateMessageTokens(msg)).toBe(11);
  });

  it('includes tokens for all optional fields together', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'ok',
      name: 'bot',
      tool_calls: [
        {
          id: 'tc1',
          type: 'function',
          function: { name: 'search', arguments: '{"q":"test"}' },
        },
      ],
      tool_call_id: 'ref_001',
    };
    // overhead(4) + role(ceil(9/4)=3) + content(ceil(2/4)=1)
    // name: ceil(3/4)=1 + 1 = 2
    // tool_calls[0]: name(ceil(6/4)=2) + args(ceil(13/4)=4) + 3 = 9
    // tool_call_id: ceil(7/4)=2
    // total = 4 + 3 + 1 + 2 + 9 + 2 = 20
    expect(estimateMessageTokens(msg)).toBe(20);
  });
});

describe('estimateConversationTokens', () => {
  it('returns OVERHEAD_BASE (3) for empty array', () => {
    expect(estimateConversationTokens([])).toBe(3);
  });

  it('sums overhead base plus all message tokens', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    // base(3) + msg1(4+1+1=6) + msg2(4+3+2=9) = 18
    expect(estimateConversationTokens(msgs)).toBe(18);
  });
});

describe('estimateToolsTokens', () => {
  it('returns 0 for empty array', () => {
    expect(estimateToolsTokens([])).toBe(0);
  });

  it('sums name + description + schema + 5 per tool', () => {
    const tools: MCPTool[] = [
      {
        name: 'search',
        description: 'Search the web',
        input_schema: { type: 'object', properties: { q: { type: 'string' } } },
      },
    ];
    // name: ceil(6/4)=2
    // desc: ceil(13/4)=4
    // schema: ceil(53/4)=14  (JSON.stringify length)
    // + 5
    // total = 2 + 4 + 14 + 5 = 25
    const result = estimateToolsTokens(tools);
    expect(result).toBeGreaterThan(0);
    // Verify it includes the +5 per tool bonus
    const schemaLen = JSON.stringify(tools[0]!.input_schema).length;
    const expected =
      Math.ceil(tools[0]!.name.length / 4) +
      Math.ceil(tools[0]!.description.length / 4) +
      Math.ceil(schemaLen / 4) +
      5;
    expect(result).toBe(expected);
  });

  it('handles multiple tools', () => {
    const tools: MCPTool[] = [
      { name: 'a', description: 'first', input_schema: {} },
      { name: 'b', description: 'second', input_schema: {} },
    ];
    const result = estimateToolsTokens(tools);
    // tool1: ceil(1/4)=1 + ceil(5/4)=2 + ceil(2/4)=1 + 5 = 9
    // tool2: ceil(1/4)=1 + ceil(6/4)=2 + ceil(2/4)=1 + 5 = 9
    // total = 18
    expect(result).toBe(18);
  });
});
