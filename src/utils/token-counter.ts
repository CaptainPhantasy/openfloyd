import type { ChatMessage, MCPTool } from '../types/index.js';

const AVG_CHARS_PER_TOKEN = 4;
const OVERHEAD_PER_MESSAGE = 4;
const OVERHEAD_BASE = 3;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
}

export function estimateMessageTokens(message: ChatMessage): number {
  let tokens = OVERHEAD_PER_MESSAGE;
  tokens += estimateTokens(message.role);
  tokens += estimateTokens(message.content);
  if (message.name) {
    tokens += estimateTokens(message.name) + 1;
  }
  if (message.tool_calls) {
    for (const call of message.tool_calls) {
      tokens += estimateTokens(call.function.name);
      tokens += estimateTokens(call.function.arguments);
      tokens += 3;
    }
  }
  if (message.tool_call_id) {
    tokens += estimateTokens(message.tool_call_id);
  }
  return tokens;
}

export function estimateConversationTokens(messages: ChatMessage[]): number {
  let tokens = OVERHEAD_BASE;
  for (const msg of messages) {
    tokens += estimateMessageTokens(msg);
  }
  return tokens;
}

export function estimateToolsTokens(tools: MCPTool[]): number {
  let tokens = 0;
  for (const tool of tools) {
    tokens += estimateTokens(tool.name);
    tokens += estimateTokens(tool.description);
    tokens += estimateTokens(JSON.stringify(tool.input_schema));
    tokens += 5;
  }
  return tokens;
}
