import type { ChatMessage } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import {
  estimateConversationTokens,
  estimateMessageTokens,
  estimateTokens,
} from '../utils/token-counter.js';

const log = createLogger('context-manager');

export interface ContextBudget {
  systemPrompt: number;
  toolsDefinition: number;
  conversation: number;
  workingMemory: number;
  buffer: number;
}

const DEFAULT_BUDGET: ContextBudget = {
  systemPrompt: 10_000,
  toolsDefinition: 5_000,
  conversation: 100_000,
  workingMemory: 20_000,
  buffer: 65_000,
};

export interface ContextManagerConfig {
  maxTokens?: number;
  compressionThreshold?: number;
  budget?: Partial<ContextBudget>;
  summarizer?: (messages: ChatMessage[]) => Promise<string>;
}

interface ContextStats {
  totalTokens: number;
  messageCount: number;
  compressionCount: number;
  lastCompressionAt: Date | null;
}

export class ContextManager {
  private maxTokens: number;
  private threshold: number;
  private budget: ContextBudget;
  private summarizer: ((messages: ChatMessage[]) => Promise<string>) | null;

  private systemPrompt: ChatMessage | null = null;
  private messages: ChatMessage[] = [];
  private workingMemory: ChatMessage[] = [];

  private compressionCount = 0;
  private lastCompressionAt: Date | null = null;

  constructor(config: ContextManagerConfig = {}) {
    this.maxTokens = config.maxTokens ?? 200_000;
    this.threshold = config.compressionThreshold ?? 0.8;
    this.budget = { ...DEFAULT_BUDGET, ...config.budget };
    this.summarizer = config.summarizer ?? null;

    log.info(
      { maxTokens: this.maxTokens, threshold: this.threshold },
      'Context manager initialized',
    );
  }

  setSystemPrompt(content: string): void {
    this.systemPrompt = { role: 'system', content };
    const tokens = estimateTokens(content);
    if (tokens > this.budget.systemPrompt) {
      log.warn(
        { tokens, budget: this.budget.systemPrompt },
        'System prompt exceeds budget allocation',
      );
    }
  }

  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    log.debug(
      { role: message.role, tokens: estimateMessageTokens(message), totalMessages: this.messages.length },
      'Message added to context',
    );
  }

  addWorkingMemory(content: string, source: string): void {
    this.workingMemory.push({
      role: 'system',
      content: `[Memory/${source}] ${content}`,
    });
  }

  clearWorkingMemory(): void {
    this.workingMemory = [];
  }

  getTokenCount(): number {
    let total = 0;
    if (this.systemPrompt) {
      total += estimateMessageTokens(this.systemPrompt);
    }
    total += estimateConversationTokens(this.messages);
    total += estimateConversationTokens(this.workingMemory);
    return total;
  }

  needsCompression(): boolean {
    return this.getTokenCount() > this.maxTokens * this.threshold;
  }

  async compress(): Promise<void> {
    if (!this.needsCompression()) return;

    const currentTokens = this.getTokenCount();
    log.info(
      { currentTokens, threshold: this.maxTokens * this.threshold },
      'Starting context compression',
    );

    const messagesToCompress = Math.ceil(this.messages.length * 0.3);

    if (messagesToCompress < 2) {
      log.warn('Not enough messages to compress');
      return;
    }

    const oldMessages = this.messages.splice(0, messagesToCompress);

    let summary: string;
    if (this.summarizer) {
      summary = await this.summarizer(oldMessages);
    } else {
      summary = this.naiveSummarize(oldMessages);
    }

    const summaryMessage: ChatMessage = {
      role: 'system',
      content: `[Context Summary] Previous conversation (${oldMessages.length} messages):\n${summary}`,
    };
    this.messages.unshift(summaryMessage);

    this.compressionCount++;
    this.lastCompressionAt = new Date();

    const newTokens = this.getTokenCount();
    log.info(
      {
        before: currentTokens,
        after: newTokens,
        reduction: currentTokens - newTokens,
        messagesCompressed: oldMessages.length,
        compressionCount: this.compressionCount,
      },
      'Context compressed',
    );
  }

  buildMessages(toolsTokenEstimate = 0): ChatMessage[] {
    const available = this.maxTokens - toolsTokenEstimate - this.budget.buffer;

    const result: ChatMessage[] = [];

    if (this.systemPrompt) {
      result.push(this.systemPrompt);
    }

    for (const mem of this.workingMemory) {
      result.push(mem);
    }

    let currentTokens = estimateConversationTokens(result);

    for (const msg of this.messages) {
      const msgTokens = estimateMessageTokens(msg);
      if (currentTokens + msgTokens > available) {
        log.warn(
          { currentTokens, available, droppedFrom: this.messages.indexOf(msg) },
          'Truncating messages to fit context window',
        );
        break;
      }
      result.push(msg);
      currentTokens += msgTokens;
    }

    return result;
  }

  getStats(): ContextStats {
    return {
      totalTokens: this.getTokenCount(),
      messageCount: this.messages.length,
      compressionCount: this.compressionCount,
      lastCompressionAt: this.lastCompressionAt,
    };
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  clear(): void {
    this.messages = [];
    this.workingMemory = [];
    this.systemPrompt = null;
    log.info('Context cleared');
  }

  private naiveSummarize(messages: ChatMessage[]): string {
    const parts: string[] = [];
    for (const msg of messages) {
      const preview = msg.content.substring(0, 200);
      const truncated = msg.content.length > 200 ? '...' : '';
      parts.push(`- [${msg.role}]: ${preview}${truncated}`);
    }
    return parts.join('\n');
  }
}
