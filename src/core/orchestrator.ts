import { resolve } from 'node:path';
import {
  AgentState,
  EventPriority,
  EventSourceType,
  type AgentEvent,
  type CronBlock,
  type EventSource,
  type OrchestratorConfig,
  type ParsedSoul,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { StateMachine, createDefaultTransitions } from './state-machine.js';
import { EventLoop } from './event-loop.js';
import { parseHeartbeat, parseSoul } from '../parser/markdown-parser.js';
import { CronScheduler } from '../parser/cron-parser.js';
import { WhatsAppEventSource } from '../messaging/whatsapp-client.js';
import { GLMGateway } from '../llm/glm-gateway.js';
import { ContextManager } from '../llm/context-manager.js';
import { PromptCache } from '../llm/prompt-cache.js';
import { parseStructuredResponse } from '../llm/structured-output.js';
import { ToolRegistry, createBuiltinTools } from '../execution/tool-registry.js';
import { MCPClient } from '../execution/mcp-client.js';
import { HttpServer } from './http-server.js';
import { VectorStore } from '../memory/vector-store.js';
import { RedisCache } from '../memory/redis-cache.js';
import { MemoryConsolidator } from '../memory/consolidation.js';

const log = createLogger('orchestrator');

const MAX_TOOL_ITERATIONS = 5;

const DEFAULT_CONFIG: OrchestratorConfig = {
  workspacePath: resolve(process.cwd(), 'workspace'),
  heartbeatPath: resolve(process.cwd(), 'workspace', 'HEARTBEAT.md'),
  soulPath: resolve(process.cwd(), 'workspace', 'SOUL.md'),
  configPath: resolve(process.cwd(), 'config', 'default.json'),
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
};

class CronEventSource implements EventSource {
  type = EventSourceType.CRON as const;
  name = 'cron-scheduler';
  private scheduler: CronScheduler;
  private eventHandler: ((event: AgentEvent) => void) | null = null;

  constructor(private cronBlocks: CronBlock[]) {
    this.scheduler = new CronScheduler();
  }

  async start(): Promise<void> {
    this.scheduler.setDefaultCallback((block) => {
      if (this.eventHandler) {
        this.eventHandler({
          id: crypto.randomUUID(),
          type: EventSourceType.CRON,
          priority: EventPriority.NORMAL,
          payload: { cronBlock: block, action: block.action },
          timestamp: new Date(),
          metadata: { title: block.title, schedule: block.schedule },
        });
      }
    });

    this.scheduler.registerBlocks(this.cronBlocks);
    this.scheduler.start();
    log.info({ blocks: this.cronBlocks.length }, 'CRON event source started');
  }

  async stop(): Promise<void> {
    this.scheduler.destroy();
    log.info('CRON event source stopped');
  }

  onEvent(handler: (event: AgentEvent) => void): void {
    this.eventHandler = handler;
  }

  getScheduler(): CronScheduler {
    return this.scheduler;
  }
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private stateMachine: StateMachine;
  private eventLoop: EventLoop;
  private cronSource: CronEventSource | null = null;
  private whatsappSource: WhatsAppEventSource | null = null;
  private shutdownHandlersRegistered = false;

  private gateway: GLMGateway | null = null;
  private contextManager: ContextManager;
  private promptCache: PromptCache;
  private toolRegistry: ToolRegistry;
  private mcpClient: MCPClient;
  private httpServer: HttpServer;
  private vectorStore: VectorStore | null = null;
  private redisCache: RedisCache | null = null;
  private consolidator: MemoryConsolidator | null = null;
  private soul: ParsedSoul | null = null;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.stateMachine = new StateMachine({
      initialState: AgentState.IDLE,
      transitions: createDefaultTransitions(),
    });

    this.eventLoop = new EventLoop();
    this.eventLoop.setHandler((event) => this.handleEvent(event));
    this.contextManager = new ContextManager();
    this.promptCache = new PromptCache();
    this.toolRegistry = new ToolRegistry();
    this.mcpClient = new MCPClient(this.toolRegistry);
    this.httpServer = new HttpServer();
    createBuiltinTools(this.toolRegistry);

    this.wireEvents();
  }

  async start(): Promise<void> {
    log.info({ config: this.config }, 'Starting OPEN-FLOYD orchestrator');

    const heartbeat = await parseHeartbeat(this.config.heartbeatPath).catch((err) => {
      log.warn({ err }, 'Failed to parse HEARTBEAT.md — continuing without CRON');
      return null;
    });

    this.soul = await parseSoul(this.config.soulPath).catch((err) => {
      log.warn({ err }, 'Failed to parse SOUL.md — continuing without directives');
      return null;
    });

    if (this.soul) {
      log.info(
        { directives: this.soul.directives.length },
        'Soul directives loaded',
      );
      const soulContent = this.soul.directives.map((d) => `[${d.category}] ${d.title}: ${d.content}`).join('\n\n');
      this.contextManager.setSystemPrompt(soulContent);
      this.promptCache.cacheSystemPrompt(soulContent);
    }

    const apiKey = process.env['ZAI_API_KEY'];
    if (apiKey) {
      this.gateway = new GLMGateway({
        apiKey,
        model: process.env['GLM_MODEL'] ?? 'glm-5-turbo',
      });
      log.info('GLM gateway connected');
    } else {
      log.warn('ZAI_API_KEY not set — running without LLM reasoning');
    }

    if (heartbeat && heartbeat.cronBlocks.length > 0) {
      this.cronSource = new CronEventSource(heartbeat.cronBlocks);
      this.eventLoop.registerSource(this.cronSource);
    }

    const whatsappEnabled = process.env['WHATSAPP_ALLOWED_NUMBERS'];
    if (whatsappEnabled) {
      const allowedNumbers = whatsappEnabled.split(',').map((n) => n.trim()).filter(Boolean);
      this.whatsappSource = new WhatsAppEventSource({
        authPath: resolve(this.config.workspacePath, '..', 'wa_auth'),
        allowedNumbers,
        printQR: true,
      });
      this.eventLoop.registerSource(this.whatsappSource);
      log.info({ allowedNumbers: allowedNumbers.length }, 'WhatsApp bridge registered');
    }

    const dbPath = process.env['SQLITE_DB_PATH'] ?? resolve(this.config.workspacePath, 'memory.db');
    try {
      this.vectorStore = new VectorStore({ dbPath });
      this.consolidator = new MemoryConsolidator(this.vectorStore);
      this.consolidator.startPeriodic(60 * 60 * 1000);
      log.info({ dbPath }, 'Vector store initialized');
    } catch (err) {
      log.warn({ err }, 'Failed to initialize vector store — continuing without memory');
    }

    const redisUrl = process.env['REDIS_URL'];
    if (redisUrl) {
      this.redisCache = new RedisCache({ url: redisUrl });
      await this.redisCache.connect().catch((err) => {
        log.warn({ err }, 'Failed to connect to Redis — continuing without cache');
        this.redisCache = null;
      });
    }

    this.httpServer.setStatsProvider(() => ({
      state: this.stateMachine.getState(),
      uptime: process.uptime(),
      eventLoop: this.eventLoop.stats,
      llm: this.gateway?.getUsageStats(),
      memory: this.vectorStore ? { entries: this.vectorStore.getCount() } : undefined,
    }));
    await this.httpServer.start();

    this.registerShutdownHandlers();
    await this.eventLoop.start();

    log.info('OPEN-FLOYD orchestrator is RUNNING');
  }

  async stop(): Promise<void> {
    log.info('Stopping OPEN-FLOYD orchestrator...');
    await this.eventLoop.stop();
    await this.httpServer.stop();
    this.consolidator?.stopPeriodic();
    this.vectorStore?.close();
    await this.redisCache?.disconnect();
    this.gateway?.destroy();
    this.stateMachine.destroy();
    log.info('OPEN-FLOYD orchestrator stopped');
  }

  getState(): AgentState {
    return this.stateMachine.getState();
  }

  getStats(): EventLoop['stats'] {
    return this.eventLoop.stats;
  }

  getStateMachine(): StateMachine {
    return this.stateMachine;
  }

  getEventLoop(): EventLoop {
    return this.eventLoop;
  }

  private async handleEvent(event: AgentEvent): Promise<void> {
    log.info(
      { eventId: event.id, type: event.type, priority: event.priority },
      'Processing event',
    );

    const typeColors: Record<string, string> = {
      cron: '#fab387', whatsapp: '#a6e3a1', webhook: '#89b4fa', api: '#cba6f7', system: '#6c7086',
    };
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const payloadStr = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
    this.httpServer.pushEvent({
      time: timeStr,
      type: event.type.toUpperCase(),
      color: typeColors[event.type] ?? '#6c7086',
      message: payloadStr.substring(0, 120),
    });

    try {
      await this.stateMachine.transition('event_received');

      if (this.gateway) {
        await this.processWithLLM(event);
      } else {
        log.info(
          { eventId: event.id, payload: event.payload },
          'Event processed (LLM gateway not connected)',
        );
      }

      await this.stateMachine.transition('task_complete');
    } catch (error) {
      log.error({ err: error, eventId: event.id }, 'Event handling failed');

      if (this.stateMachine.canTransition('processing_error')) {
        await this.stateMachine.transition('processing_error');
        await this.stateMachine.transition('error_recovered');
      } else if (this.stateMachine.canTransition('execution_error')) {
        await this.stateMachine.transition('execution_error');
        await this.stateMachine.transition('error_recovered');
      }
    }
  }

  private async processWithLLM(event: AgentEvent): Promise<void> {
    const payload = typeof event.payload === 'string'
      ? event.payload
      : JSON.stringify(event.payload);

    this.contextManager.addMessage({
      role: 'user',
      content: `[${event.type}] ${payload}`,
    });

    await this.stateMachine.transition('action_planned');

    const tools = this.toolRegistry.getDefinitions();
    let iteration = 0;

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      if (this.contextManager.needsCompression()) {
        await this.contextManager.compress();
      }

      const messages = this.contextManager.buildMessages();

      const response = await this.gateway!.chat({
        messages,
        tools: tools.length > 0 ? tools : undefined,
        thinking: iteration === 1,
      });

      const structured = parseStructuredResponse(response);

      this.contextManager.addMessage({
        role: 'assistant',
        content: response.choices[0]?.message.content ?? '',
        tool_calls: response.choices[0]?.message.tool_calls,
      });

      log.info(
        {
          eventId: event.id,
          iteration,
          action: structured.action.type,
          confidence: structured.confidence,
          reasoning: structured.reasoning.substring(0, 200),
        },
        'LLM reasoning step',
      );

      if (structured.action.type === 'tool_call' && structured.action.tool) {
        const toolResult = await this.mcpClient.callTool(
          structured.action.tool,
          structured.action.params ?? {},
        );

        this.contextManager.addMessage({
          role: 'tool',
          content: toolResult.content.map((c) => c.text ?? '').join('\n'),
          tool_call_id: response.choices[0]?.message.tool_calls?.[0]?.id,
        });

        await this.stateMachine.transition('tool_result_received');
        await this.stateMachine.transition('action_planned');
        continue;
      }

      if (structured.action.type === 'respond' && structured.action.response) {
        const eventPayload = event.payload as { sender?: string };
        if (event.type === EventSourceType.WHATSAPP && eventPayload.sender && this.whatsappSource) {
          await this.whatsappSource.sendMessage(eventPayload.sender, structured.action.response);
        }
      }

      break;
    }

    if (iteration >= MAX_TOOL_ITERATIONS) {
      log.warn({ eventId: event.id, iterations: iteration }, 'Max tool iterations reached');
    }

    log.info(
      { eventId: event.id, iterations: iteration, usage: this.gateway!.getUsageStats() },
      'LLM processing complete',
    );

    if (this.stateMachine.canTransition('tool_result_received')) {
      await this.stateMachine.transition('tool_result_received');
    }
  }

  private wireEvents(): void {
    this.stateMachine.on('state:transition', (from, to, trigger) => {
      log.debug({ from, to, trigger }, 'State transition');
    });

    this.stateMachine.on('state:error', (error, state) => {
      log.error({ err: error, state }, 'State machine error');
    });

    this.stateMachine.on('state:deadlock', (state, elapsed) => {
      log.error({ state, elapsed_ms: elapsed }, 'Deadlock detected — forcing IDLE');
      this.stateMachine.forceState(AgentState.IDLE, 'deadlock_recovery');
    });

    this.eventLoop.on('loop:error', (error) => {
      log.error({ err: error }, 'Event loop error');
    });
  }

  private registerShutdownHandlers(): void {
    if (this.shutdownHandlersRegistered) return;
    this.shutdownHandlersRegistered = true;

    const shutdown = async (signal: string): Promise<void> => {
      log.info({ signal }, 'Received shutdown signal');
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

    process.on('uncaughtException', (error) => {
      log.fatal({ err: error }, 'Uncaught exception');
      void this.stop().finally(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason) => {
      log.fatal({ reason }, 'Unhandled rejection');
    });
  }
}
