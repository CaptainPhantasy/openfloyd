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
  WEBCHAT = 'webchat',
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
  items?: MCPSchemaProperty | MCPSchemaProperty[];
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

// ============================================================
// WebChat Types
// ============================================================

export interface WebChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    type?: 'text' | 'code' | 'status' | 'error';
    language?: string;
    projectId?: string;
    workerId?: string;
  };
}

export interface WebSocketConnection {
  id: string;
  connectedAt: Date;
  lastActivity: Date;
  clientInfo?: {
    userAgent: string;
    ip: string;
  };
}

// ============================================================
// Worker Agent Types
// ============================================================

export enum WorkerType {
  CODER = 'coder',
  TESTER = 'tester',
  REVIEWER = 'reviewer',
  DEPLOYER = 'deployer',
  RESEARCHER = 'researcher',
  MARKETER = 'marketer',
}

export enum WorkerState {
  SPAWNING = 'spawning',
  INITIALIZING = 'initializing',
  READY = 'ready',
  WORKING = 'working',
  BLOCKED = 'blocked',
  COMPLETE = 'complete',
  FAILED = 'failed',
  TERMINATED = 'terminated',
}

export interface WorkerConfig {
  type: WorkerType;
  llm: {
    provider: string;
    model: string;
    maxTokens: number;
  };
  tools: string[];
  timeout: number;
  memoryMB: number;
}

export interface WorkerTask {
  id: string;
  description: string;
  context: string;
  dependencies: string[];
  priority: number;
  deadline?: Date;
  budget?: number;
}

export interface TaskProgress {
  taskId: string;
  state: 'pending' | 'running' | 'complete' | 'failed';
  percentComplete: number;
  currentStep: string;
  output?: string;
  error?: string;
}

export interface Heartbeat {
  workerId: string;
  timestamp: Date;
  state: WorkerState;
  taskProgress?: TaskProgress;
  tokenUsage: TokenUsage;
  memoryUsageMB: number;
}

export interface VMInstance {
  id: string;
  ip: string;
  state: 'running' | 'stopped' | 'error';
  createdAt: Date;
  config: WorkerConfig;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface PoolStats {
  totalWorkers: number;
  byType: Record<string, number>;
  byState: Record<string, number>;
  totalTokens: number;
  totalCost: number;
}

export enum TaskState {
  PENDING = 'pending',
  READY = 'ready',
  RUNNING = 'running',
  COMPLETE = 'complete',
  FAILED = 'failed',
}

export interface QueueStats {
  total: number;
  pending: number;
  ready: number;
  running: number;
  complete: number;
  failed: number;
}

// ============================================================
// LLM Router Types
// ============================================================

export enum TaskType {
  PLANNING = 'planning',
  CODING = 'coding',
  TESTING = 'testing',
  REVIEW = 'review',
  RESEARCH = 'research',
  MARKETING = 'marketing',
  FAST = 'fast',
}

export interface LLMRequest {
  taskType: TaskType;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: MCPTool[];
  priority?: number;
  budget?: number;
}

export interface LLMResponse {
  id: string;
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  providerId: string;
  model: string;
  cost: number;
}

export interface RoutingRule {
  taskType: TaskType;
  primaryProvider: string;
  primaryModel: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  maxConcurrent: number;
}

export interface LLMModelSpec {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  costPerInputToken: number;
  costPerOutputToken: number;
  capabilities: ('reasoning' | 'coding' | 'vision' | 'tools')[];
}

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetsAt: Date;
}

export interface ProviderRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: MCPTool[];
}

export interface ProviderResponse {
  id: string;
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: string;
}

export interface ProviderChunk {
  content?: string;
  toolCalls?: ToolCall[];
  finishReason?: string;
}

export interface ConcurrencyStatus {
  providerId: string;
  limit: number;
  active: number;
  queued: number;
}

// ============================================================
// Cost Tracking Types
// ============================================================

export interface UsageRecord {
  id: string;
  timestamp: Date;
  providerId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  projectId?: string;
  workerId?: string;
  taskId?: string;
}

export interface Budget {
  daily: number;
  weekly?: number;
  monthly?: number;
  perProject?: number;
  alertThresholds: number[];
}

export interface BudgetStatus {
  daily: { used: number; limit: number; percentage: number };
  weekly?: { used: number; limit: number; percentage: number };
  monthly?: { used: number; limit: number; percentage: number };
}

export interface BudgetAlert {
  type: 'daily' | 'weekly' | 'monthly' | 'project';
  threshold: number;
  used: number;
  limit: number;
}

// ============================================================
// ROI Types
// ============================================================

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  status: 'planning' | 'building' | 'testing' | 'deployed' | 'archived';
  totalCost: number;
  totalRevenue: number;
  metadata?: Record<string, unknown>;
}

export interface ROIMetrics {
  totalCost: number;
  totalRevenue: number;
  netProfit: number;
  roi: number;
  breakeven: Date | null;
  daysToBreakeven: number | null;
}

// ============================================================
// Planning Types
// ============================================================

export interface GoalAnalysis {
  originalGoal: string;
  clarifiedGoal: string;
  requirements: string[];
  constraints: string[];
  assumptions: string[];
  risks: Risk[];
  researchFindings: ResearchFinding[];
}

export interface Risk {
  description: string;
  severity: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface ResearchFinding {
  query: string;
  summary: string;
  sources: string[];
  confidence: number;
}

export interface PlanStep {
  id: string;
  description: string;
  workerType: WorkerType;
  estimatedMinutes: number;
  dependencies: string[];
}

export interface WorkerRequirement {
  type: WorkerType;
  count: number;
  reason: string;
}

export interface CostEstimate {
  tokens: number;
  dollars: number;
  breakdown: Record<string, number>;
}

export interface TimeEstimate {
  minutes: number;
  breakdown: Record<string, number>;
}

export interface ExecutionPath {
  id: string;
  name: string;
  description: string;
  steps: PlanStep[];
  workerRequirements: WorkerRequirement[];
  estimatedCost: CostEstimate;
  estimatedTime: TimeEstimate;
  risks: Risk[];
  confidence: number;
}

export interface Plan {
  id: string;
  goal: string;
  path: ExecutionPath;
  tasks: WorkerTask[];
  status: 'draft' | 'approved' | 'executing' | 'complete' | 'failed';
  createdAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  /** Existing repo URL — worker pushes branches here. Undefined = new project, needs owner approval to create. */
  repoUrl?: string;
  /** If true, owner has approved creation of a new repo for this plan. */
  newRepoApproved?: boolean;
}

// ============================================================
// Brand Voice Types
// ============================================================

export interface Brand {
  id: string;
  name: string;
  voice: {
    tone: string;
    vocabulary: string;
    style: string;
    examples?: string[];
    avoidWords?: string[];
    preferredPhrases?: string[];
  };
  colors?: {
    primary: string;
    secondary: string;
    accent: string;
  };
  logo?: string;
}

export interface VoiceValidation {
  isValid: boolean;
  score: number;
  issues: { type: string; description: string; suggestion: string }[];
}

// ============================================================
// Web Research Types
// ============================================================

export interface SearchOptions {
  maxResults?: number;
  recency?: 'day' | 'week' | 'month' | 'year';
  domains?: string[];
  excludeDomains?: string[];
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: Date;
  score: number;
}

export interface PageContent {
  url: string;
  title: string;
  content: string;
  author?: string;
  publishedDate?: Date;
  extractedAt: Date;
}

export interface VerificationResult {
  claim: string;
  verified: boolean;
  confidence: number;
  sources: { url: string; supports: boolean; excerpt: string }[];
}

// ============================================================
// Dashboard API Types
// ============================================================

export interface ProjectStatus {
  id: string;
  name: string;
  description: string;
  status: 'planning' | 'approved' | 'building' | 'testing' | 'complete' | 'failed';
  progress: number;
  workers: number;
  cost: number;
  startedAt: Date;
  estimatedCompletion?: Date;
}

export interface WorkerStatus {
  id: string;
  type: WorkerType;
  state: WorkerState;
  currentTask?: string;
  progress: number;
  lastHeartbeat: Date;
  health: 'healthy' | 'stale' | 'dead';
  tokenUsage: number;
  cost: number;
}

export interface CostBreakdown {
  total: number;
  byProvider: Record<string, number>;
  byProject: Record<string, number>;
  byWorker: Record<string, number>;
  today: number;
  thisWeek: number;
  thisMonth: number;
  budget: { daily: number; remaining: number };
}
