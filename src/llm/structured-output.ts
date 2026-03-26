import type { ChatResponse } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('structured-output');

export interface AgentAction {
  type: 'tool_call' | 'respond' | 'wait';
  tool?: string;
  params?: Record<string, unknown>;
  response?: string;
}

export interface StructuredResponse {
  reasoning: string;
  action: AgentAction;
  confidence: number;
}

export class StructuredOutputError extends Error {
  constructor(
    message: string,
    public readonly rawContent: string,
    public readonly parseErrors: string[],
  ) {
    super(message);
    this.name = 'StructuredOutputError';
  }
}

export function parseStructuredResponse(response: ChatResponse): StructuredResponse {
  const firstChoice = response.choices[0];
  if (!firstChoice) {
    throw new StructuredOutputError('No choices in response', '', ['Empty choices array']);
  }

  const { message } = firstChoice;

  if (message.tool_calls && message.tool_calls.length > 0) {
    const toolCall = message.tool_calls[0]!;
    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      parsedArgs = {};
    }

    return {
      reasoning: message.content || 'Tool call requested',
      action: {
        type: 'tool_call',
        tool: toolCall.function.name,
        params: parsedArgs,
      },
      confidence: 0.9,
    };
  }

  const content = message.content;
  if (!content) {
    throw new StructuredOutputError('Empty response content', '', ['No content in message']);
  }

  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const jsonStr = jsonMatch[1] ?? jsonMatch[0];
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      return validateStructuredOutput(parsed, content);
    } catch {
      log.debug({ content: content.substring(0, 200) }, 'Failed to parse JSON from response');
    }
  }

  return {
    reasoning: content,
    action: {
      type: 'respond',
      response: content,
    },
    confidence: 0.7,
  };
}

function validateStructuredOutput(
  parsed: Record<string, unknown>,
  rawContent: string,
): StructuredResponse {
  const errors: string[] = [];

  if (typeof parsed['reasoning'] !== 'string') {
    errors.push('Missing or invalid "reasoning" field (expected string)');
  }

  if (!parsed['action'] || typeof parsed['action'] !== 'object') {
    errors.push('Missing or invalid "action" field (expected object)');
  }

  const action = parsed['action'] as Record<string, unknown> | undefined;
  if (action) {
    const validTypes = ['tool_call', 'respond', 'wait'];
    if (!validTypes.includes(action['type'] as string)) {
      errors.push(`Invalid action type "${String(action['type'])}" (expected: ${validTypes.join(', ')})`);
    }
  }

  if (errors.length > 0) {
    log.warn({ errors, parsed }, 'Structured output validation failed, falling back to natural response');
    return {
      reasoning: (parsed['reasoning'] as string) ?? rawContent,
      action: {
        type: 'respond',
        response: rawContent,
      },
      confidence: 0.5,
    };
  }

  const confidence = typeof parsed['confidence'] === 'number'
    ? Math.max(0, Math.min(1, parsed['confidence']))
    : 0.8;

  return {
    reasoning: parsed['reasoning'] as string,
    action: {
      type: (action!['type'] as AgentAction['type']),
      tool: action!['tool'] as string | undefined,
      params: action!['params'] as Record<string, unknown> | undefined,
      response: action!['response'] as string | undefined,
    },
    confidence,
  };
}

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reasoning: { type: 'string', description: 'Step-by-step reasoning about the task' },
    action: {
      type: 'object',
      properties: {
        type: { enum: ['tool_call', 'respond', 'wait'], description: 'The type of action to take' },
        tool: { type: 'string', description: 'Tool name (required if type is tool_call)' },
        params: { type: 'object', description: 'Tool parameters (required if type is tool_call)' },
        response: { type: 'string', description: 'Response text (required if type is respond)' },
      },
      required: ['type'],
    },
    confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Confidence level 0-1' },
  },
  required: ['reasoning', 'action'],
} as const;
