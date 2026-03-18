# OPEN-FLOYD: Comprehensive Project Roadmap
## "Open the Floyd Gates!" - Autonomous Agent Framework
**Version:** 2.1.0 (Bleeding-Edge Edition)
**Last Updated:** March 18, 2026
**Status:** Development Phase - Architecture Planning
## Table of Contents
1. ~[Executive Summary](https://www.google.com/search?q=%23executive-summary)~
2. ~[Project Vision & Goals](https://www.google.com/search?q=%23project-vision--goals)~
3. ~[Architecture Overview](https://www.google.com/search?q=%23architecture-overview)~
4. ~[Core Components](https://www.google.com/search?q=%23core-components)~
5. ~[Implementation Phases](https://www.google.com/search?q=%23implementation-phases)~
6. ~[Technical Specifications](https://www.google.com/search?q=%23technical-specifications)~
7. ~[Integration Guides](https://www.google.com/search?q=%23integration-guides)~
8. ~[Development Standards](https://www.google.com/search?q=%23development-standards)~
9. ~[Testing & Quality Assurance](https://www.google.com/search?q=%23testing--quality-assurance)~
10. ~[Deployment & Operations](https://www.google.com/search?q=%23deployment--operations)~
11. ~[Risk Management](https://www.google.com/search?q=%23risk-management)~
12. ~[Timeline & Milestones](https://www.google.com/search?q=%23timeline--milestones)~

⠀Executive Summary
### Project Identity
**OPEN-FLOYD** is an autonomous, persistent, LLM-driven orchestration framework designed for 24/7 autonomous operation. Built on the GLM-5-Turbo reasoning model, it enables sophisticated task automation through natural language directives, tool execution via Model Context Protocol (MCP), and real-time communication through WhatsApp.
### Core Capabilities
* **Autonomous Execution**: CRON-based task scheduling with self-directed planning
* **Multi-Modal Reasoning**: Leverages GLM-5-Turbo's 200K context window for complex reasoning chains
* **Tool Orchestration**: MCP-compliant tool execution with zero-trust WebAssembly (WASM) sandboxing
* **WhatsApp Integration**: Real-time, asynchronous user communication
* **State Persistence**: Long-term memory and context retention across sessions using localized vector compute

⠀Success Metrics
| **Metric** | **Target** | **Timeline** |
|:-:|:-:|:-:|
| System Uptime | 99.5% | 3 months post-launch |
| Task Success Rate | >95% | 6 months |
| Response Latency (WhatsApp) | <2 seconds | Initial release |
| Sandbox Cold Start | <5 milliseconds | Initial release |
| Memory Efficiency | <2GB RAM usage | Production ready |
## Project Vision & Goals
### Vision Statement
To create a production-grade autonomous agent framework that bridges the gap between LLM reasoning capabilities and real-world task execution, enabling users to delegate complex workflows through natural language while maintaining enterprise-grade security and reliability.
### Primary Goals
1. **Autonomy First**
   * Self-directed task planning and execution
   * Minimal human intervention for routine operations
   * Graceful degradation and self-healing capabilities
2. **Security by Design**
   * WASM-isolated execution environment (zero host OS access)
   * Whitelist-based communication channels
   * Audit trail for all actions
3. **Developer Experience**
   * Markdown-based configuration
   * Modular architecture for extensibility
   * Comprehensive documentation and examples
4. **Production Readiness**
   * Docker containerization for the host daemon
   * Horizontal scaling support
   * Monitoring and observability

⠀Non-Goals
* General-purpose chatbot functionality
* Multi-tenant SaaS deployment (single-user focus initially)
* Real-time voice interaction
* Mobile app development

⠀Architecture Overview
### High-Level Architecture
┌─────────────────────────────────────────────────────────────────┐
│                        OPEN-FLOYD SYSTEM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │   TRIGGERS   │──────│    CORE      │──────│  EXECUTION   │   │
│  │              │      │  ORCHESTRATOR│      │    ENGINE    │   │
│  │ • CRON       │      │              │      │              │   │
│  │ • WhatsApp   │      │ • State      │      │ • MCP Tools  │   │
│  │ • Webhooks   │      │   Machine    │      │ • WASM Isolate │ │
│  │ • API        │      │ • Event Loop │      │ • Extism     │   │
│  └──────────────┘      └──────────────┘      └──────────────┘   │
│         │                     │                     │           │
│         │                     │                     │           │
│         ▼                     ▼                     ▼           │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │   BRIDGE     │      │     LLM      │      │    MEMORY    │   │
│  │   LAYER      │      │   GATEWAY    │      │    LAYER     │   │
│  │              │      │              │      │              │   │
│  │ • WhatsApp   │      │ • GLM-5      │      │ • sqlite-vec │   │
│  │ • REST API   │      │ • Context    │      │ • Redis      │   │
│  │ • WebSocket  │      │   Management │      │ • SQLite 3   │   │
│  └──────────────┘      └──────────────┘      └──────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
### Technology Stack
| **Layer** | **Technology** | **Purpose** |
|:-:|:-:|:-:|
| **Runtime** | Node.js 22 LTS / TypeScript 5.4+ | Event loop, native SQLite & type safety |
| **LLM** | GLM-5-Turbo (Z.ai API) | Reasoning engine |
| **Messaging** | Baileys (WhatsApp Web API) | Headless WhatsApp client |
| **Scheduling** | node-cron / Bree | CRON daemon |
| **Execution** | WebAssembly (WASM) / Extism | Ultra-fast, secure sandboxed execution |
| **Protocol** | MCP (Model Context Protocol) | Tool standardization |
| **Memory** | SQLite + sqlite-vec | Native edge vector storage |
| **Cache** | Redis | Session & state cache |
| **Deployment** | Docker Compose | Container orchestration |
## Core Components
### 1\. Event Loop & State Machine
**Responsibility:** Central orchestration hub that manages agent lifecycle and event routing.
**State Machine Design**
enum AgentState {
  IDLE = 'idle',                    // Waiting for triggers
  PROCESSING = 'processing',        // Analyzing task
  EXECUTING = 'executing',          // Running tools
  AWAITING_INPUT = 'awaiting_input', // Waiting for user
  ERROR = 'error',                  // Error state
  MAINTENANCE = 'maintenance'       // System maintenance
}

interface StateTransition {
  from: AgentState;
  to: AgentState;
  trigger: string;
  action: () => Promise<void>;
}
**Event Sources**
1. **CRON Scheduler**
   * Time-based triggers
   * Recurring task execution
   * Timezone-aware scheduling
2. **WhatsApp Bridge**
   * Incoming message webhooks
   * Command parsing
   * Authorization validation
3. **System Webhooks**
   * External API triggers
   * Integration callbacks
   * Health checks

⠀**Implementation Requirements**
* [ ] Implement event emitter pattern with typed events
* [ ] Build state machine with deadlock prevention
* [ ] Create event queue with priority handling
* [ ] Add circuit breaker for failure recovery
* [ ] Implement graceful shutdown handlers

⠀**Estimated Effort:** 2 weeks
**Dependencies:** None
**Risk Level:** Medium
### 2\. Configuration Parser
**Responsibility:** Transform user-defined markdown configurations into executable system directives.
**Parseable Files**
| **File** | **Purpose** | **Format** |
|:-:|:-:|:-:|
| HEARTBEAT.md | CRON schedules & automated actions | Markdown with CRON blocks |
| SOUL.md | Agent identity & behavioral directives | Natural language |
| config.json | System configuration | JSON schema |
| docker-compose.yml | Deployment configuration | YAML |
**Markdown AST Structure**
interface MarkdownAST {
  type: 'document';
  children: MarkdownNode[];
}

interface CronBlock {
  type: 'cron';
  schedule: string;        // "0 8 * * 1-5"
  action: string;          // Natural language action
  metadata?: {
    timezone?: string;
    retries?: number;
    timeout?: number;
  };
}

interface DirectiveBlock {
  type: 'directive';
  category: 'identity' | 'constraint' | 'preference';
  content: string;
}
**Parser Implementation
Phase 1: Basic Parsing**
* [ ] Markdown to AST conversion
* [ ] CRON string extraction and validation
* [ ] Natural language action extraction
* [ ] Error handling for malformed syntax

⠀**Phase 2: Advanced Features**
* [ ] Variable substitution (${var})
* [ ] Conditional logic blocks
* [ ] Template inheritance
* [ ] Hot-reload on file changes

⠀**Phase 3: Validation**
* [ ] Schema validation for CRON expressions
* [ ] Semantic validation for actions
* [ ] Linting for best practices
* [ ] Auto-completion for IDE support

⠀**Estimated Effort:** 3 weeks
**Dependencies:** Event Loop
**Risk Level:** Low
### 3\. LLM Gateway & Context Manager
**Responsibility:** Interface with GLM-5-Turbo and manage conversation context efficiently.
**GLM-5-Turbo Integration
Model Specifications:**
* **Context Window:** 200,000 tokens
* **Max Output:** 128,000 tokens
* **Capabilities:** Tool calling, structured output, streaming
* **Cost:** $0.96/1M input tokens, $3.20/1M output tokens

⠀**API Wrapper Design**
class GLM5Gateway {
  private client: ZaiClient;
  private contextManager: ContextManager;
  
  async chat(params: {
    messages: Message[];
    tools?: MCPTool[];
    thinking?: boolean;
    stream?: boolean;
  }): Promise<ChatResponse> {
    // Implement with retry logic using native fetch
    // Add circuit breaker
    // Log token usage
  }
}
**Context Window Management
Strategy: Sliding Window with Summarization**
1. **Token Budget Allocation** System Prompt:      10,000 tokens (5%)
2. Tools Definition:    5,000 tokens (2.5%)
3. Conversation:       100,000 tokens (50%)
4. Working Memory:      20,000 tokens (10%)
5. Buffer:              65,000 tokens (32.5%)
6. 
7. **Sliding Window Logic** class ContextManager {
8. private maxTokens = 200000;
9. private threshold = 0.8; // 80%
10. 
11. async addMessage(message: Message): Promise<void> {
12. this.messages.push(message);
13. 
14. if (this.getTokenCount() > this.maxTokens * this.threshold) {
15. await this.compressHistory();
16. }
17. }
18. 
19. private async compressHistory(): Promise<void> {
20. // Summarize oldest 20% of messages
21. // Inject summary as single message
22. // Update vector store
23. }
24. }
25. 
26. **Prompt Caching Strategy**
    * Cache system prompts (24-hour TTL)
    * Cache tool definitions (session TTL)
    * Dynamic cache for repeated queries
    * Cost reduction: Up to 90% for cached content

⠀**Structured Output Enforcement**
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reasoning: { type: "string" },
    action: { 
      type: "object",
      properties: {
        type: { enum: ["tool_call", "respond", "wait"] },
        tool: { type: "string" },
        params: { type: "object" }
      }
    },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["reasoning", "action"]
};
**Estimated Effort:** 3 weeks
**Dependencies:** Configuration Parser
**Risk Level:** Medium-High
### 4\. WhatsApp Messaging Bridge
**Responsibility:** Establish and maintain stable WhatsApp communication channel.
**Architecture Overview**
┌─────────────┐
│  WhatsApp   │
│   Network   │
└──────┬──────┘
       │ WebSocket
       ▼
┌─────────────────────────────────┐
│     BAILEYS CLIENT LAYER        │
├─────────────────────────────────┤
│ • Auth State Management         │
│ • Message Encryption/Decryption │
│ • Presence Management           │
│ • Rate Limiting                 │
└─────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│      MESSAGE PROCESSOR          │
├─────────────────────────────────┤
│ • Authorization Check           │
│ • Command Parsing               │
│ • Response Formatting           │
│ • Outbound Queue                │
└─────────────────────────────────┘
**Implementation Details
1\. Authentication Persistence**
interface AuthState {
  creds: AuthenticationCreds;
  keys: SignalKeyStore;
  lastUpdated: Date;
}

class WhatsAppAuth {
  private authPath = '/app/workspace/wa_auth';
  
  async saveAuth(state: AuthState): Promise<void> {
    // Encrypt before saving
    // Atomic write operations
    // Backup rotation
  }
  
  async loadAuth(): Promise<AuthState | null> {
    // Verify integrity
    // Check expiration
    // Handle corruption
  }
}
**2\. Rate Limiting & Queue Management**
class MessageQueue {
  private queue: Queue<Message>;
  private rateLimiter = new RateLimiter({
    points: 5,        // 5 messages
    duration: 60,     // per 60 seconds
    blockDuration: 300 // block for 5 minutes if exceeded
  });
  
  async enqueue(message: Message): Promise<void> {
    await this.queue.add(message);
  }
  
  async processQueue(): Promise<void> {
    // Background worker
    // Respect rate limits
    // Retry failed messages
  }
}
**3\. Authorization System**
class AuthorizationManager {
  private allowedNumbers: string[];
  
  async isAuthorized(sender: string): Promise<boolean> {
    // Check whitelist
    // Log unauthorized attempts
    // Optional: dynamic authorization
  }
  
  async handleUnauthorized(sender: string): Promise<void> {
    // Drop message
    // Do not send auto-reply
    // Audit log
  }
}
**4\. Message Formatting**
* Bullet points for readability
* Maximum 4096 characters per message
* Split long responses intelligently
* Include timestamps for actions

⠀**Estimated Effort:** 4 weeks
**Dependencies:** Event Loop
**Risk Level:** High (WhatsApp stability issues)
### 5\. Execution Sandbox & MCP Integration
**Responsibility:** Provide instantaneous, secure, isolated environment for tool execution using WebAssembly.
**Model Context Protocol (MCP) Architecture**
┌─────────────────────────────────────┐
│        OPEN-FLOYD AGENT             │
└──────────────┬──────────────────────┘
               │ MCP Protocol
               ▼
┌─────────────────────────────────────┐
│          MCP CLIENT LAYER           │
├─────────────────────────────────────┤
│ • Tool Discovery                    │
│ • Capability Negotiation            │
│ • Request/Response Handling         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│        WASM ORCHESTRATOR            │
├─────────────────────────────────────┤
│ • Extism Plugin Management          │
│ • Memory Bounds Verification        │
│ • Sub-millisecond Execution         │
│ • Output Capture                    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│       WASM EXECUTION ISOLATES       │
├─────────────────────────────────────┤
│ • Pyodide (Python in WASM)          │
│ • QuickJS (JS in WASM)              │
│ • Compiled Rust/Go Modules          │
└─────────────────────────────────────┘
**MCP Tool Specification
Built-in Tools:**
1. **web_search_mcp** {
2. name: "web_search",
3. description: "Search the web for real-time information",
4. input_schema: {
5. type: "object",
6. properties: {
7. query: { type: "string" },
8. limit: { type: "number", default: 5 }
9. }
10. }
11. }
12. 
13. **web_reader_mcp** {
14. name: "web_reader",
15. description: "Fetch and extract content from URLs",
16. input_schema: {
17. type: "object",
18. properties: {
19. url: { type: "string" },
20. format: { enum: ["text", "markdown", "html"] }
21. }
22. }
23. }
24. 
25. **sandbox_mcp_execute** {
26. name: "execute_code",
27. description: "Execute code in WASM sandboxed environment",
28. input_schema: {
29. type: "object",
30. properties: {
31. language: { enum: ["python", "javascript"] },
32. code: { type: "string" },
33. timeout: { type: "number", default: 5000 }
34. }
35. }
36. }
37. 

⠀**WebAssembly Sandbox Implementation**
import createPlugin from '@extism/extism';

class WasmSandboxExecutor {
  async execute(params: {
    language: string;
    code: string;
    timeout: number;
  }): Promise<ExecutionResult> {
    
    // Select pre-compiled WASM module based on language (e.g., QuickJS for JS)
    const wasmPath = `./runtime/${params.language}-env.wasm`;

    // Initialize the Extism Plugin with strict bounds
    const plugin = await createPlugin(wasmPath, {
      useWasi: true,
      config: {
        MAX_MEMORY_BYTES: "268435456", // 256MB cap
      },
      allowedPaths: {}, // Absolutely zero host disk access
      allowedHosts: []  // Block all outbound network unless explicitly passed
    });

    try {
      // Execute with timeout wrapper
      const result = await Promise.race([
        plugin.call('eval', params.code),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), params.timeout))
      ]);
      
      return { output: result.text(), error: null };
    } catch (err) {
      return { output: null, error: err.message };
    } finally {
      await plugin.close();
    }
  }
}
**Security Constraints**
* **No Host Access:** WASM enforces strict memory isolation. The sandbox cannot see the Node.js host or OS.
* **Sub-millisecond Cold Starts:** Unlike DinD, WASM functions initialize in microseconds.
* **Read-Only Filesystem:** Prevents persistent modifications.
* **Resource Limits:** Hardcoded memory limits per plugin execution.

⠀**Estimated Effort:** 4 weeks
**Dependencies:** LLM Gateway
**Risk Level:** Medium
### 6\. Memory & State Persistence
**Responsibility:** Maintain agent memory across sessions utilizing edge-native vector extensions.
**Memory Architecture**
┌────────────────────────────────────────┐
│          MEMORY HIERARCHY              │
├────────────────────────────────────────┤
│                                        │
│  ┌──────────────────────────────────┐  │
│  │   SHORT-TERM MEMORY (Redis)      │  │
│  │   • Current conversation         │  │
│  │   • Active session state         │  │
│  │   • Rate limit counters          │  │
│  │   TTL: 24 hours                  │  │
│  └──────────────────────────────────┘  │
│              │                         │
│              ▼                         │
│  ┌──────────────────────────────────┐  │
│  │   WORKING MEMORY (RAM)           │  │
│  │   • Task context                 │  │
│  │   • Execution logs               │  │
│  │   • Temporary data               │  │
│  │   TTL: Session duration          │  │
│  └──────────────────────────────────┘  │
│              │                         │
│              ▼                         │
│  ┌──────────────────────────────────┐  │
│  │ LONG-TERM MEMORY (SQLite+vec)    │  │
│  │   • User preferences             │  │
│  │   • Historical summaries         │  │
│  │   • Learned patterns             │  │
│  │   TTL: Indefinite                │  │
│  └──────────────────────────────────┘  │
│                                        │
└────────────────────────────────────────┘
**Vector Store Implementation (sqlite-vec)**
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

interface MemoryEntry {
  id: string;
  content: string;
  embedding: Float32Array; // sqlite-vec native array format
  metadata: {
    timestamp: Date;
    source: 'user' | 'agent' | 'system';
    category: 'preference' | 'fact' | 'summary' | 'error';
    importance: number; // 0-1
  };
}

class VectorStore {
  private db: Database.Database;
  
  constructor() {
    this.db = new Database('/app/workspace/memory.db');
    sqliteVec.load(this.db); // Load native C-extension
  }

  async store(entry: MemoryEntry): Promise<void> {
    // Generate embedding via Z.ai/OpenAI embedding endpoint
    // Store with vector index utilizing sqlite-vec native floats
    const stmt = this.db.prepare(
      `INSERT INTO memories (id, content, embedding) VALUES (?, ?, ?)`
    );
    stmt.run(entry.id, entry.content, Buffer.from(entry.embedding.buffer));
  }
  
  async search(queryVector: Float32Array, limit: number): Promise<MemoryEntry[]> {
    // Ultra-fast KNN semantic search locally
    const stmt = this.db.prepare(`
      SELECT rowid, content, distance 
      FROM memories
      WHERE embedding MATCH ? 
      ORDER BY distance 
      LIMIT ?
    `);
    return stmt.all(Buffer.from(queryVector.buffer), limit);
  }
  
  async prune(): Promise<void> {
    // Remove low-importance entries
    // Consolidate similar memories
    // Maintain storage limits
  }
}
**Memory Operations**
1. **Store:** Add new memory with automatic embedding
2. **Retrieve:** Semantic search for relevant context using KNN distance
3. **Update:** Modify existing memories
4. **Forget:** Prune low-value memories
5. **Consolidate:** Merge similar memories during downtime

⠀**Estimated Effort:** 3 weeks
**Dependencies:** Configuration Parser
**Risk Level:** Low
## Implementation Phases
### Phase 1: Foundation (Weeks 1-4)
**Goal:** Establish core infrastructure and basic event loop.
**Deliverables**
* [ ] Project structure setup
* [ ] TypeScript configuration targeting Node 22
* [ ] Docker development environment (Daemon wrapper)
* [ ] Basic event loop with state machine
* [ ] Configuration parser (HEARTBEAT.md, SOUL.md)
* [ ] Unit test framework

⠀**Milestones**
| **Week** | **Milestone** | **Acceptance Criteria** |
|:-:|:-:|:-:|
| 1 | Project Scaffold | TypeScript compiles, Docker builds |
| 2 | Event Loop | State transitions work, events emit |
| 3 | Config Parser | Parses sample HEARTBEAT.md |
| 4 | Integration Test | End-to-end event flow |
**Risk Mitigation**
* **Risk:** State machine complexity **Mitigation:** Start with simple linear states, iterate

⠀Phase 2: Intelligence Layer (Weeks 5-8)
**Goal:** Integrate GLM-5-Turbo and context management.
**Deliverables**
* [ ] GLM-5 API client wrapper
* [ ] Context window manager
* [ ] Prompt caching implementation
* [ ] Structured output enforcement
* [ ] Token usage tracking

⠀**Milestones**
| **Week** | **Milestone** | **Acceptance Criteria** |
|:-:|:-:|:-:|
| 5 | API Integration | Can call GLM-5 successfully |
| 6 | Context Manager | Sliding window works |
| 7 | Prompt Caching | Cache hits logged |
| 8 | Structured Output | JSON schema validated |
**Risk Mitigation**
* **Risk:** API rate limits **Mitigation:** Implement request queuing and backoff

⠀Phase 3: Communication (Weeks 9-12)
**Goal:** Establish stable WhatsApp integration.
**Deliverables**
* [ ] Baileys client integration
* [ ] Auth persistence system
* [ ] Message queue with rate limiting
* [ ] Authorization layer
* [ ] Response formatting

⠀**Milestones**
| **Week** | **Milestone** | **Acceptance Criteria** |
|:-:|:-:|:-:|
| 9 | WhatsApp Connection | QR scan works, session persists |
| 10 | Message Handling | Receive and send messages |
| 11 | Rate Limiting | Queue processes smoothly |
| 12 | Authorization | Whitelist enforcement |
**Risk Mitigation**
* **Risk:** WhatsApp disconnections **Mitigation:** Auto-reconnect with exponential backoff
* **Risk:** Number ban **Mitigation:** Strict rate limiting, human-like delays

⠀Phase 4: Execution Engine (Weeks 13-17)
**Goal:** Build instantaneous WASM sandbox and MCP integration.
**Deliverables**
* [ ] WebAssembly isolates configured
* [ ] Extism plugin manager built
* [ ] MCP client implementation
* [ ] Tool registration system
* [ ] Execution audit logging

⠀**Milestones**
| **Week** | **Milestone** | **Acceptance Criteria** |
|:-:|:-:|:-:|
| 13 | WASM Isolate | Can execute JS/Python via WASM |
| 14 | MCP Protocol | Tool discovery works |
| 15 | Security Limits | Memory isolation verified |
| 16 | Tool Library | 5 built-in tools ready |
| 17 | Integration | End-to-end tool execution < 50ms |
**Risk Mitigation**
* **Risk:** Missing native modules in WASM (e.g., Pandas in Pyodide) **Mitigation:** Ensure LLM knows to write standard-library only code or pre-bundle necessary WASM dependencies.

⠀Phase 5: Memory & Persistence (Weeks 18-20)
**Goal:** Implement complete native vector memory system.
**Deliverables**
* [ ] SQLite database setup
* [ ] Native vector indexing with sqlite-vec
* [ ] Redis integration
* [ ] Memory consolidation logic
* [ ] Backup/restore system

⠀**Milestones**
| **Week** | **Milestone** | **Acceptance Criteria** |
|:-:|:-:|:-:|
| 18 | Database Setup | SQLite stores entries |
| 19 | Vector Search | Native KNN search works |
| 20 | Consolidation | Pruning and merging |
### Phase 6: Polish & Production (Weeks 21-24)
**Goal:** Production readiness and optimization.
**Deliverables**
* [ ] Error handling refinement
* [ ] Monitoring dashboard
* [ ] Performance optimization
* [ ] Documentation completion
* [ ] Deployment automation

⠀**Milestones**
| **Week** | **Milestone** | **Acceptance Criteria** |
|:-:|:-:|:-:|
| 21 | Error Recovery | Graceful degradation |
| 22 | Monitoring | Grafana dashboard live |
| 23 | Load Testing | Handles 100 concurrent tasks |
| 24 | Production Deploy | Running on VPS |
## Technical Specifications
### API Specifications
**GLM-5-Turbo API
Base URL:** https://api.z.ai/api/paas/v4
**Authentication:**
Authorization: Bearer {API_KEY}
**Chat Completion Endpoint:**
POST /chat/completions
Content-Type: application/json

{
  "model": "glm-5-turbo",
  "messages": [...],
  "thinking": {"type": "enabled"},
  "tools": [...],
  "max_tokens": 4096,
  "temperature": 1.0,
  "stream": false
}
**Response Format:**
{
  "id": "chatcmpl-xxx",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "...",
      "tool_calls": [...]
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 1000,
    "completion_tokens": 500,
    "total_tokens": 1500
  }
}
**MCP Protocol
Transport:** Standard I/O (stdin/stdout)
**Message Format:**
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "web_search",
    "arguments": {
      "query": "latest news"
    }
  },
  "id": 1
}
### Database Schemas
**SQLite Schema**
-- Memory entries
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding BLOB, -- To be queried with sqlite-vec
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Native vector index creation
CREATE VIRTUAL TABLE memories_vec USING vec0(
  embedding(1536)
);

-- Execution logs
CREATE TABLE execution_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  tool_name TEXT,
  input JSON,
  output JSON,
  duration_ms INTEGER,
  status TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  action TEXT,
  actor TEXT,
  resource TEXT,
  result TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
**Redis Schema**
# Session state
session:{session_id}:state -> JSON
session:{session_id}:messages -> LIST
session:{session_id}:expires -> TTL

# Rate limiting
rate_limit:whatsapp:{phone_number} -> COUNTER
rate_limit:api:global -> COUNTER

# Cache
cache:prompt:{hash} -> JSON
cache:context:{session_id} -> JSON
### Docker Configuration
**Production Dockerfile**
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

# Need basic build tools for native sqlite-vec bindings
RUN apk add --no-cache \
  build-base \
  python3

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Security: Run as non-root user
RUN addgroup -g 1001 -S floyd && \
  adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G floyd -g floyd floyd
USER floyd

EXPOSE 3000
CMD ["node", "dist/index.js"]
**docker-compose.yml (Enhanced)**
version: '3.8'

services:
  openfloyd:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: openfloyd_agent
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    ports:
      - "3000:3000"
    volumes:
      - ./workspace:/app/workspace
      - ./wa_auth:/app/wa_auth
    networks:
      - floyd_network
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 1G

  redis:
    image: redis:7-alpine
    container_name: floyd_redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - floyd_network
    command: redis-server --appendonly yes

  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 300 openfloyd_agent

networks:
  floyd_network:
    driver: bridge

volumes:
  redis_data:
## Integration Guides
### WhatsApp Integration
**Step-by-Step Setup**
1. **Install Dependencies** npm install @whiskeysockets/baileys pino
2. 
3. **Initialize Client** import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
4. 
5. const socket = makeWASocket({
6. auth: await loadAuthState(),
7. printQRInTerminal: true,
8. logger: pino({ level: 'info' })
9. });
10. 
11. **Handle Connection Events** socket.ev.on('connection.update', async (update) => {
12. const { connection, lastDisconnect } = update;
13. 
14. if (connection === 'close') {
15. const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
16. if (shouldReconnect) {
17. // Reconnect logic
18. }
19. }
20. });
21. 
22. **Process Messages** socket.ev.on('messages.upsert', async ({ messages }) => {
23. for (const message of messages) {
24. if (message.key.fromMe) continue;
25. 
26. const sender = message.key.remoteJid;
27. const text = message.message?.conversation;
28. 
29. // Process message
30. }
31. });
32. 

⠀MCP Tool Development
**Creating a Custom Tool**
1. **Define Tool Schema** const myTool: MCPTool = {
2. name: "my_custom_tool",
3. description: "Description of what the tool does",
4. input_schema: {
5. type: "object",
6. properties: {
7. param1: { type: "string", description: "First parameter" },
8. param2: { type: "number", description: "Second parameter" }
9. },
10. required: ["param1"]
11. }
12. };
13. 
14. **Implement Handler** async function handleMyTool(params: any): Promise<MCPToolResult> {
15. try {
16. // Validate params
17. // Execute logic
18. // Return result
19. return {
20. content: [{
21. type: "text",
22. text: "Tool executed successfully"
23. }]
24. };
25. } catch (error) {
26. return {
27. isError: true,
28. content: [{
29. type: "text",
30. text: `Error: ${error.message}`
31. }]
32. };
33. }
34. }
35. 
36. **Register Tool** mcpClient.registerTool(myTool, handleMyTool);
37. 

⠀Development Standards
### Code Style
* **Language:** TypeScript 5.4+ (Node 22 LTS Target)
* **Style Guide:** ESLint + Prettier
* **Naming Convention:** camelCase for variables, PascalCase for types
* **Comments:** JSDoc for public APIs

⠀Git Workflow
main (production)
  └── develop
       ├── feature/event-loop
       ├── feature/whatsapp-bridge
       └── feature/mcp-integration
### Commit Convention
feat: add WhatsApp message queue
fix: resolve auth persistence issue
docs: update API documentation
test: add integration tests for sandbox
refactor: improve context window logic
### Testing Requirements
* **Unit Tests:** 80% coverage minimum
* **Integration Tests:** All API endpoints
* **E2E Tests:** Critical user journeys
* **Load Tests:** Concurrent execution

⠀Testing & Quality Assurance
### Testing Strategy
**Unit Tests**
describe('ContextManager', () => {
  it('should compress history when threshold reached', async () => {
    const manager = new ContextManager(1000);
    
    // Add messages up to threshold
    for (let i = 0; i < 100; i++) {
      await manager.addMessage({
        role: 'user',
        content: `Message ${i}`
      });
    }
    
    expect(manager.getTokenCount()).toBeLessThan(1000 * 0.9);
  });
});
**Integration Tests**
describe('WhatsApp Integration', () => {
  it('should persist auth across restarts', async () => {
    const client1 = new WhatsAppClient();
    await client1.connect();
    const authState = await client1.getAuthState();
    await client1.disconnect();
    
    const client2 = new WhatsAppClient();
    await client2.loadAuthState(authState);
    expect(client2.isAuthenticated()).toBe(true);
  });
});
**E2E Tests**
describe('Full Workflow', () => {
  it('should execute CRON task end-to-end', async () => {
    // Setup: Create HEARTBEAT.md with test CRON
    // Trigger: Fire CRON event
    // Verify: Check WhatsApp message sent
    // Cleanup: Remove test data
  });
});
### Quality Metrics
| **Metric** | **Target** | **Measurement** |
|:-:|:-:|:-:|
| Code Coverage | 80% | Jest coverage report |
| TypeScript Strictness | Strict | tsc --noEmit |
| Linting Errors | 0 | ESLint |
| Security Vulnerabilities | 0 | npm audit |
| Performance | <2s response | Load testing |
## Deployment & Operations
### Deployment Checklist
* [ ] Environment variables configured
* [ ] API keys stored securely
* [ ] Docker images built and tested
* [ ] Database migrations run (sqlite-vec initialized)
* [ ] WhatsApp auth state mounted
* [ ] Monitoring dashboards configured
* [ ] Backup procedures tested
* [ ] Rollback plan documented

⠀Monitoring
**Key Metrics**
1. **System Health**
   * CPU usage
   * Memory usage
   * Disk I/O
   * Network throughput
2. **Application Metrics**
   * Request latency (p50, p95, p99)
   * Error rate
   * Token usage
   * Task success rate
3. **WhatsApp Metrics**
   * Connection status
   * Message throughput
   * Rate limit hits

⠀**Alerting Rules**
alerts:
- name: high_error_rate
  condition: error_rate > 5%
  severity: critical
  action: notify_team
    
- name: whatsapp_disconnected
  condition: connection_status == 'disconnected'
  severity: high
  action: auto_reconnect
    
- name: memory_leak
  condition: memory_usage > 3.5GB
  severity: high
  action: restart_container
### Backup Strategy
# Daily backup script

BACKUP_DIR="/backups/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# Backup SQLite database
sqlite3 /app/workspace/memory.db ".backup $BACKUP_DIR/memory.db"

# Backup WhatsApp auth
cp -r /app/wa_auth $BACKUP_DIR/

# Compress and encrypt
tar -czf - $BACKUP_DIR | gpg -e > $BACKUP_DIR.tar.gz.gpg

# Upload to cloud storage
aws s3 cp $BACKUP_DIR.tar.gz.gpg s3://openfloyd-backups/

# Cleanup old backups (keep 30 days)
find /backups -type d -mtime +30 -exec rm -rf {} \;
## Risk Management
### Technical Risks
| **Risk** | **Impact** | **Probability** | **Mitigation** |
|:-:|:-:|:-:|:-:|
| WhatsApp API changes | High | Medium | Abstraction layer, monitoring |
| GLM-5 API downtime | High | Low | Fallback models, retry logic |
| WASM Memory Escape | Critical | Low | Extism sandboxing, strict memory bounds |
| Memory leak | Medium | Medium | Monitoring, auto-restart |
| Token limit exceeded | Medium | High | Context window management |
### Operational Risks
| **Risk** | **Impact** | **Probability** | **Mitigation** |
|:-:|:-:|:-:|:-:|
| Number ban by WhatsApp | Critical | Medium | Rate limiting, human-like behavior |
| API key exposure | High | Low | Environment variables, rotation |
| Data loss | High | Low | Regular backups, replication |
| Unauthorized access | High | Medium | Whitelist, audit logs |
### Business Risks
| **Risk** | **Impact** | **Probability** | **Mitigation** |
|:-:|:-:|:-:|:-:|
| User adoption low | Medium | Medium | Documentation, examples |
| Cost overruns | Medium | Medium | Budget monitoring, optimization |
| Competitor solutions | Low | High | Unique features, open source |
## Timeline & Milestones
### Gantt Chart
Minute 1 2 3 4       5 6 7 8       9 10 11 12    13 14 15 16 17   18 19 20     21 22 23 24
       ├─────────────┤─────────────┤─────────────┤─────────────┤─────────────┤─────────────┤
Phase  │ Foundation  │Intelligence │Communication│  Execution  │   Memory    │ Production
       └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘─────────────┘
                                                                                           └─Polish
### Milestone Summary
| **Phase**     | **Duration** | **Key Deliverable**      | **Stakeholder Review** |
|:-------------:|:------------:|:------------------------:|:----------------------:|
| Foundation    | Minute 1-4   | Working event loop       | NEVER                  |
| Intelligence  | Minute 5-8   | GLM-5 integration        | NEVER                  |
| Communication | Minute 9-12  | WhatsApp live            | NEVER                  |
| Execution     | Minute 13-17 | Tool execution (WASM)    | NEVER                  |
| Memory        | Minute 18-20 | Persistent vector memory | NEVER                  |
| Production    | Minute 21-24 | Deployed system          | NEVER                  |
### Success Criteria
**Phase 1 Complete When:**
* ✅ Agent can be triggered by CRON
* ✅ State transitions work correctly
* ✅ Configuration files are parsed

⠀**Phase 2 Complete When:**
* ✅ GLM-5 responds correctly
* ✅ Context window managed
* ✅ Caching reduces costs

⠀**Phase 3 Complete When:**
* ✅ WhatsApp messages sent/received
* ✅ Auth persists across restarts
* ✅ Rate limiting prevents bans

⠀**Phase 4 Complete When:**
* ✅ Tools execute in WASM isolate
* ✅ MCP protocol implemented
* ✅ Security bounds verified

⠀**Phase 5 Complete When:**
* ✅ Long-term memory works
* ✅ Native vector search functional
* ✅ Consolidation runs

⠀**Phase 6 Complete When:**
* ✅ System deployed to production
* ✅ Monitoring active
* ✅ Documentation complete

⠀Appendices
### A. Environment Variables
# GLM-5 API
ZAI_API_KEY=your_api_key_here
GLM_MODEL=glm-5-turbo
GLM_FALLBACK_MODEL=glm-4.7

# WhatsApp
WHATSAPP_SESSION_NAME=openfloyd
WHATSAPP_ALLOWED_NUMBERS=+1234567890,+0987654321

# Memory
SQLITE_DB_PATH=/app/workspace/memory.db
REDIS_URL=redis://redis:6379

# Security (WASM Extism Config)
SANDBOX_TIMEOUT=5000
SANDBOX_MEMORY_BYTES=268435456

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Deployment
NODE_ENV=production
PORT=3000
### B. Dependencies
{
  "dependencies": {
    "@extism/extism": "^1.3.0",
    "@whiskeysockets/baileys": "^6.6.0",
    "better-sqlite3": "^9.4.0",
    "sqlite-vec": "^0.1.0",
    "node-cron": "^3.0.3",
    "pino": "^8.17.0",
    "redis": "^4.6.0",
    "marked": "^12.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.4.0",
    "jest": "^29.7.0",
    "eslint": "^8.56.0",
    "prettier": "^3.2.0"
  }
}
### C. File Structure
/Volumes/Storage/Floyd_OpenFloyd/
├── src/
│   ├── core/
│   │   ├── orchestrator.ts
│   │   ├── state-machine.ts
│   │   └── event-loop.ts
│   ├── llm/
│   │   ├── glm-gateway.ts
│   │   ├── context-manager.ts
│   │   └── prompt-cache.ts
│   ├── messaging/
│   │   ├── whatsapp-client.ts
│   │   ├── auth-manager.ts
│   │   └── message-queue.ts
│   ├── execution/
│   │   ├── wasm-sandbox.ts
│   │   ├── mcp-client.ts
│   │   └── tool-registry.ts
│   ├── memory/
│   │   ├── vector-store.ts
│   │   ├── redis-cache.ts
│   │   └── consolidation.ts
│   ├── parser/
│   │   ├── markdown-parser.ts
│   │   ├── cron-parser.ts
│   │   └── schema-validator.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── config/
│   ├── default.json
│   └── schema.json
├── workspace/
│   ├── HEARTBEAT.md
│   ├── SOUL.md
│   └── memory.db
├── runtime/
│   ├── python-env.wasm
│   └── javascript-env.wasm
├── docs/
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── TOOLS.md
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
## Document Revision History
| **Version** | **Date**     | **Author** | **Changes**                         |
|:-----------:|:------------:|:----------:|:-----------------------------------:|
| 1.0.0       | Mar 18, 2026 | Initial    | Bleeding-edge 2026 WASM/SQLite-vec  |
**Document Status:** ✅ Complete
**Next Review:** April 18, 2026
**Maintainer:** OPEN-FLOYD Development Team
*This roadmap was generated by synthesizing the original OPEN-FLOYD specification with official documentation from GLM-5-Turbo, Model Context Protocol, WhatsApp Business Platform, and bleeding-edge 2026 Node.js/WebAssembly best practices.*
