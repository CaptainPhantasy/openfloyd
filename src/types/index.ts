/**
 * OPEN-FLOYD Core Type Definitions
 * Shared interfaces, enums, and types for the entire framework.
 */

// ============================================================
// Agent State Machine
// ============================================================

export enum AgentState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  EXECUTING = 'executing',
  AWAITING_INPUT = 'awaiting_input',
  ERROR = 'error',
  MAINTENANCE = 'maintenance',
}

export interface StateTransition {
  from: AgentState;
  to: AgentState;
  trigger: string;
  guard?: () => boolean | Promise<boolean>;
  action?: () => void | Promise<void>;
}

export interface StateMachineEvents {
  'state:enter': (state: AgentState, trigger: string) => void;
  'state:exit': (state: AgentState, trigger: string) => void;
  'state:transition': (from: AgentState, to: AgentState, trigger: string) => void;
  'state:error': (error: Error, state: AgentState) => void;
  'state:deadlock': (state: AgentState, elapsed: number) => void;
}

// ============================================================
// Event System
// ============================================================

export enum EventPriority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
  BACKGROUND = 4,
}

export enum EventSourceType {
  CRON = 'cron',
  WHATSAPP = 'whatsapp',
  WEBHOOK = 'webhook',
  API = 'api',
  SYSTEM = 'system',
}

export interface AgentEvent {
  id: string;
  type: EventSourceType;
  priority: EventPriority;
  payload: unknown;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface EventSource {
  type: EventSourceType;
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (event: AgentEvent) => void): void;
}

export interface EventLoopEvents {
  'event:received': (event: AgentEvent) => void;
  'event:processing': (event: AgentEvent) => void;
  'event:completed': (event: AgentEvent, result: unknown) => void;
  'event:failed': (event: AgentEvent, error: Error) => void;
  'loop:started': () => void;
  'loop:stopped': () => void;
  'loop:error': (error: Error) => void;
}

// ============================================================
// Configuration Parser
// ============================================================

export interface CronBlock {
  id: string;
  schedule: string;
  action: string;
  title: string;
  metadata?: {
    timezone?: string;
    retries?: number;
    timeout?: number;
  };
}

export interface DirectiveBlock {
  id: string;
  category: 'identity' | 'constraint' | 'preference' | 'mandate';
  title: string;
  content: string;
}

export interface ParsedHeartbeat {
  cronBlocks: CronBlock[];
  raw: string;
}

export interface ParsedSoul {
  directives: DirectiveBlock[];
  raw: string;
}

// ============================================================
// System Configuration
// ============================================================

export interface SystemConfig {
  system: {
    version: string;
    logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  };
  models: {
    providers: Record<string, ProviderConfig>;
  };
  agents: {
    defaults: AgentDefaults;
  };
  integrations: {
    whatsapp: WhatsAppConfig;
  };
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  models: ModelSpec[];
}

export interface ModelSpec {
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
  cost: {
    input: number;
    output: number;
  };
}

export interface AgentDefaults {
  model: {
    primary: string;
    fallbacks: string[];
  };
  memory: {
    strategy: string;
    retentionLimit: number;
  };
}

export interface WhatsAppConfig {
  enabled: boolean;
  allowedNumbers: string[];
  autoReply: boolean;
}

// ============================================================
// MCP (Model Context Protocol) Types
// ============================================================

export interface MCPTool {
  name: string;
  description: string;
  input_schema: MCPSchema;
}

export interface MCPSchema {
  type: 'object';
  properties: Record<string, MCPSchemaProperty>;
  required?: string[];
}

export interface MCPSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

export interface MCPToolResult {
  content: MCPContent[];
  isError?: boolean;
}

export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  method: string;
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
  id: number | string;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  result?: MCPToolResult;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: number | string;
}

// ============================================================
// LLM Gateway Types
// ============================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: MCPTool[];
  thinking?: { type: 'enabled' | 'disabled' };
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  choices: ChatChoice[];
  usage: TokenUsage;
}

export interface ChatChoice {
  message: ChatMessage;
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  index: number;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// ============================================================
// Memory Types (Phase 5)
// ============================================================

export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: Float32Array;
  metadata: MemoryMetadata;
}

export interface MemoryMetadata {
  timestamp: Date;
  source: 'user' | 'agent' | 'system';
  category: 'preference' | 'fact' | 'summary' | 'error';
  importance: number;
}

// ============================================================
// Execution Types
// ============================================================

export interface ExecutionResult {
  output: string | null;
  error: string | null;
  duration_ms: number;
  exit_code?: number;
}

export interface SandboxConfig {
  language: 'python' | 'javascript';
  timeout: number;
  memoryBytes: number;
  allowedHosts?: string[];
}

// ============================================================
// Orchestrator Types
// ============================================================

export interface OrchestratorConfig {
  workspacePath: string;
  heartbeatPath: string;
  soulPath: string;
  configPath: string;
  logLevel: string;
}

export interface OrchestratorEvents {
  'orchestrator:started': () => void;
  'orchestrator:stopped': () => void;
  'orchestrator:error': (error: Error) => void;
  'task:started': (taskId: string) => void;
  'task:completed': (taskId: string, result: unknown) => void;
  'task:failed': (taskId: string, error: Error) => void;
}
