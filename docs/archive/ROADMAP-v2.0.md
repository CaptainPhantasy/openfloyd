# OPEN-FLOYD: Comprehensive Project Roadmap
## "Open the Floyd Gates!" - Autonomous Agent Framework

**Version:** 2.0.0  
**Last Updated:** March 17, 2025  
**Status:** Development Phase - Architecture Planning

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Vision & Goals](#project-vision--goals)
3. [Architecture Overview](#architecture-overview)
4. [Core Components](#core-components)
5. [Implementation Phases](#implementation-phases)
6. [Technical Specifications](#technical-specifications)
7. [Integration Guides](#integration-guides)
8. [Development Standards](#development-standards)
9. [Testing & Quality Assurance](#testing--quality-assurance)
10. [Deployment & Operations](#deployment--operations)
11. [Risk Management](#risk-management)
12. [Timeline & Milestones](#timeline--milestones)

---

## Executive Summary

### Project Identity

**OPEN-FLOYD** is an autonomous, persistent, LLM-driven orchestration framework designed for 24/7 autonomous operation. Built on the GLM-5-Turbo reasoning model, it enables sophisticated task automation through natural language directives, tool execution via Model Context Protocol (MCP), and real-time communication through WhatsApp.

### Core Capabilities

- **Autonomous Execution**: CRON-based task scheduling with self-directed planning
- **Multi-Modal Reasoning**: Leverages GLM-5-Turbo's 200K context window for complex reasoning chains
- **Tool Orchestration**: MCP-compliant tool execution with sandboxed security
- **WhatsApp Integration**: Real-time, asynchronous user communication
- **State Persistence**: Long-term memory and context retention across sessions

### Success Metrics

| Metric | Target | Timeline |
|--------|--------|----------|
| System Uptime | 99.5% | 3 months post-launch |
| Task Success Rate | >95% | 6 months |
| Response Latency (WhatsApp) | <2 seconds | Initial release |
| Memory Efficiency | <4GB RAM usage | Production ready |

---

## Project Vision & Goals

### Vision Statement

To create a production-grade autonomous agent framework that bridges the gap between LLM reasoning capabilities and real-world task execution, enabling users to delegate complex workflows through natural language while maintaining enterprise-grade security and reliability.

### Primary Goals

1. **Autonomy First**
   - Self-directed task planning and execution
   - Minimal human intervention for routine operations
   - Graceful degradation and self-healing capabilities

2. **Security by Design**
   - Sandboxed execution environment
   - Whitelist-based communication channels
   - Audit trail for all actions

3. **Developer Experience**
   - Markdown-based configuration
   - Modular architecture for extensibility
   - Comprehensive documentation and examples

4. **Production Readiness**
   - Docker containerization
   - Horizontal scaling support
   - Monitoring and observability

### Non-Goals

- General-purpose chatbot functionality
- Multi-tenant SaaS deployment (single-user focus initially)
- Real-time voice interaction
- Mobile app development

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OPEN-FLOYD SYSTEM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │   TRIGGERS   │──────│   CORE       │──────│  EXECUTION   │  │
│  │              │      │  ORCHESTRATOR │      │   ENGINE     │  │
│  │ • CRON       │      │              │      │              │  │
│  │ • WhatsApp   │      │ • State      │      │ • MCP Tools  │  │
│  │ • Webhooks   │      │   Machine    │      │ • Sandbox    │  │
│  │ • API        │      │ • Event Loop │      │ • Docker     │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
│         │                      │                      │         │
│         │                      │                      │         │
│         ▼                      ▼                      ▼         │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │   BRIDGE     │      │     LLM      │      │    MEMORY    │  │
│  │   LAYER      │      │   GATEWAY    │      │   LAYER      │  │
│  │              │      │              │      │              │  │
│  │ • WhatsApp   │      │ • GLM-5      │      │ • Vector DB  │  │
│  │ • REST API   │      │ • Context    │      │ • Redis      │  │
│  │ • WebSocket  │      │   Management │      │ • SQLite     │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | Node.js 20+ / TypeScript 5.0+ | Event loop & type safety |
| **LLM** | GLM-5-Turbo (Z.ai API) | Reasoning engine |
| **Messaging** | Baileys (WhatsApp Web API) | Headless WhatsApp client |
| **Scheduling** | node-cron / Bree | CRON daemon |
| **Execution** | Docker Engine API | Sandboxed tool execution |
| **Protocol** | MCP (Model Context Protocol) | Tool standardization |
| **Memory** | SQLite + sqlite-vss | Vector storage |
| **Cache** | Redis | Session & state cache |
| **Deployment** | Docker Compose | Container orchestration |

---

## Core Components

### 1. Event Loop & State Machine

**Responsibility:** Central orchestration hub that manages agent lifecycle and event routing.

#### State Machine Design

```typescript
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
```

#### Event Sources

1. **CRON Scheduler**
   - Time-based triggers
   - Recurring task execution
   - Timezone-aware scheduling

2. **WhatsApp Bridge**
   - Incoming message webhooks
   - Command parsing
   - Authorization validation

3. **System Webhooks**
   - External API triggers
   - Integration callbacks
   - Health checks

#### Implementation Requirements

- [ ] Implement event emitter pattern with typed events
- [ ] Build state machine with deadlock prevention
- [ ] Create event queue with priority handling
- [ ] Add circuit breaker for failure recovery
- [ ] Implement graceful shutdown handlers

**Estimated Effort:** 2 weeks  
**Dependencies:** None  
**Risk Level:** Medium

---

### 2. Configuration Parser

**Responsibility:** Transform user-defined markdown configurations into executable system directives.

#### Parseable Files

| File | Purpose | Format |
|------|---------|--------|
| `HEARTBEAT.md` | CRON schedules & automated actions | Markdown with CRON blocks |
| `SOUL.md` | Agent identity & behavioral directives | Natural language |
| `config.json` | System configuration | JSON schema |
| `docker-compose.yml` | Deployment configuration | YAML |

#### Markdown AST Structure

```typescript
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
```

#### Parser Implementation

**Phase 1: Basic Parsing**
- [ ] Markdown to AST conversion
- [ ] CRON string extraction and validation
- [ ] Natural language action extraction
- [ ] Error handling for malformed syntax

**Phase 2: Advanced Features**
- [ ] Variable substitution (`${var}`)
- [ ] Conditional logic blocks
- [ ] Template inheritance
- [ ] Hot-reload on file changes

**Phase 3: Validation**
- [ ] Schema validation for CRON expressions
- [ ] Semantic validation for actions
- [ ] Linting for best practices
- [ ] Auto-completion for IDE support

**Estimated Effort:** 3 weeks  
**Dependencies:** Event Loop  
**Risk Level:** Low

---

### 3. LLM Gateway & Context Manager

**Responsibility:** Interface with GLM-5-Turbo and manage conversation context efficiently.

#### GLM-5-Turbo Integration

**Model Specifications:**
- **Context Window:** 200,000 tokens
- **Max Output:** 128,000 tokens
- **Capabilities:** Tool calling, structured output, streaming
- **Cost:** $0.96/1M input tokens, $3.20/1M output tokens

#### API Wrapper Design

```typescript
class GLM5Gateway {
  private client: ZaiClient;
  private contextManager: ContextManager;
  
  async chat(params: {
    messages: Message[];
    tools?: MCPTool[];
    thinking?: boolean;
    stream?: boolean;
  }): Promise<ChatResponse> {
    // Implement with retry logic
    // Add circuit breaker
    // Log token usage
  }
}
```

#### Context Window Management

**Strategy: Sliding Window with Summarization**

1. **Token Budget Allocation**
   ```
   System Prompt:      10,000 tokens (5%)
   Tools Definition:    5,000 tokens (2.5%)
   Conversation:       100,000 tokens (50%)
   Working Memory:      20,000 tokens (10%)
   Buffer:              65,000 tokens (32.5%)
   ```

2. **Sliding Window Logic**
   ```typescript
   class ContextManager {
     private maxTokens = 200000;
     private threshold = 0.8; // 80%
     
     async addMessage(message: Message): Promise<void> {
       this.messages.push(message);
       
       if (this.getTokenCount() > this.maxTokens * this.threshold) {
         await this.compressHistory();
       }
     }
     
     private async compressHistory(): Promise<void> {
       // Summarize oldest 20% of messages
       // Inject summary as single message
       // Update vector store
     }
   }
   ```

3. **Prompt Caching Strategy**
   - Cache system prompts (24-hour TTL)
   - Cache tool definitions (session TTL)
   - Dynamic cache for repeated queries
   - Cost reduction: Up to 90% for cached content

#### Structured Output Enforcement

```typescript
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
```

**Estimated Effort:** 3 weeks  
**Dependencies:** Configuration Parser  
**Risk Level:** Medium-High

---

### 4. WhatsApp Messaging Bridge

**Responsibility:** Establish and maintain stable WhatsApp communication channel.

#### Architecture Overview

```
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
```

#### Implementation Details

**1. Authentication Persistence**

```typescript
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
```

**2. Rate Limiting & Queue Management**

```typescript
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
```

**3. Authorization System**

```typescript
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
```

**4. Message Formatting**

- Bullet points for readability
- Maximum 4096 characters per message
- Split long responses intelligently
- Include timestamps for actions

**Estimated Effort:** 4 weeks  
**Dependencies:** Event Loop  
**Risk Level:** High (WhatsApp stability issues)

---

### 5. Execution Sandbox & MCP Integration

**Responsibility:** Provide secure, isolated environment for tool execution.

#### Model Context Protocol (MCP) Architecture

```
┌─────────────────────────────────────┐
│        OPEN-FLOYD AGENT             │
└──────────────┬──────────────────────┘
               │ MCP Protocol
               ▼
┌─────────────────────────────────────┐
│         MCP CLIENT LAYER            │
├─────────────────────────────────────┤
│ • Tool Discovery                    │
│ • Capability Negotiation            │
│ • Request/Response Handling         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│        SANDBOX ORCHESTRATOR         │
├─────────────────────────────────────┤
│ • Docker Container Management       │
│ • Resource Limits                   │
│ • Timeout Enforcement               │
│ • Output Capture                    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│       EXECUTION CONTAINERS          │
├─────────────────────────────────────┤
│ • Python Runtime                    │
│ • Node.js Runtime                   │
│ • Bash Shell                        │
│ • Custom Tools                      │
└─────────────────────────────────────┘
```

#### MCP Tool Specification

**Built-in Tools:**

1. **web_search_mcp**
   ```typescript
   {
     name: "web_search",
     description: "Search the web for real-time information",
     input_schema: {
       type: "object",
       properties: {
         query: { type: "string" },
         limit: { type: "number", default: 5 }
       }
     }
   }
   ```

2. **web_reader_mcp**
   ```typescript
   {
     name: "web_reader",
     description: "Fetch and extract content from URLs",
     input_schema: {
       type: "object",
       properties: {
         url: { type: "string" },
         format: { enum: ["text", "markdown", "html"] }
       }
     }
   }
   ```

3. **sandbox_mcp_execute**
   ```typescript
   {
     name: "execute_code",
     description: "Execute code in sandboxed environment",
     input_schema: {
       type: "object",
       properties: {
         language: { enum: ["python", "javascript", "bash"] },
         code: { type: "string" },
         timeout: { type: "number", default: 5000 }
       }
     }
   }
   ```

#### Docker Sandbox Implementation

```typescript
class SandboxExecutor {
  private docker: Docker;
  
  async execute(params: {
    language: string;
    code: string;
    timeout: number;
  }): Promise<ExecutionResult> {
    const container = await this.docker.createContainer({
      Image: `floyd-sandbox-${params.language}`,
      Cmd: this.buildCommand(params),
      HostConfig: {
        Memory: 256 * 1024 * 1024, // 256MB
        CpuQuota: 50000,            // 50% CPU
        NetworkMode: 'none',        // No network by default
        ReadonlyRootfs: true
      }
    });
    
    try {
      await container.start();
      const result = await this.waitForCompletion(container, params.timeout);
      return result;
    } finally {
      await container.remove({ force: true });
    }
  }
}
```

#### Security Constraints

- **No Host Access:** Containers run in complete isolation
- **No Network:** Default network disabled, explicit opt-in for tools
- **Read-Only Filesystem:** Prevents persistent modifications
- **Resource Limits:** CPU, memory, and time constraints
- **User Namespace:** Non-root user inside containers

**Estimated Effort:** 5 weeks  
**Dependencies:** LLM Gateway  
**Risk Level:** Medium

---

### 6. Memory & State Persistence

**Responsibility:** Maintain agent memory across sessions and tasks.

#### Memory Architecture

```
┌────────────────────────────────────────┐
│         MEMORY HIERARCHY               │
├────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   SHORT-TERM MEMORY (Redis)      │  │
│  │   • Current conversation         │  │
│  │   • Active session state         │  │
│  │   • Rate limit counters          │  │
│  │   TTL: 24 hours                  │  │
│  └──────────────────────────────────┘  │
│              │                          │
│              ▼                          │
│  ┌──────────────────────────────────┐  │
│  │   WORKING MEMORY (RAM)           │  │
│  │   • Task context                 │  │
│  │   • Execution logs               │  │
│  │   • Temporary data               │  │
│  │   TTL: Session duration          │  │
│  └──────────────────────────────────┘  │
│              │                          │
│              ▼                          │
│  ┌──────────────────────────────────┐  │
│  │   LONG-TERM MEMORY (SQLite+VSS)  │  │
│  │   • User preferences             │  │
│  │   • Historical summaries         │  │
│  │   • Learned patterns             │  │
│  │   TTL: Indefinite                │  │
│  └──────────────────────────────────┘  │
│                                         │
└────────────────────────────────────────┘
```

#### Vector Store Implementation

```typescript
interface MemoryEntry {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    timestamp: Date;
    source: 'user' | 'agent' | 'system';
    category: 'preference' | 'fact' | 'summary' | 'error';
    importance: number; // 0-1
  };
}

class VectorStore {
  private db: Database;
  
  async store(entry: MemoryEntry): Promise<void> {
    // Generate embedding
    // Store with vector index
    // Update importance score
  }
  
  async search(query: string, limit: number): Promise<MemoryEntry[]> {
    // Semantic similarity search
    // Filter by metadata
    // Rank by importance
  }
  
  async prune(): Promise<void> {
    // Remove low-importance entries
    // Consolidate similar memories
    // Maintain storage limits
  }
}
```

#### Memory Operations

1. **Store:** Add new memory with automatic embedding
2. **Retrieve:** Semantic search for relevant context
3. **Update:** Modify existing memories
4. **Forget:** Prune low-value memories
5. **Consolidate:** Merge similar memories during downtime

**Estimated Effort:** 3 weeks  
**Dependencies:** Configuration Parser  
**Risk Level:** Low

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-4)

**Goal:** Establish core infrastructure and basic event loop.

#### Deliverables

- [ ] Project structure setup
- [ ] TypeScript configuration
- [ ] Docker development environment
- [ ] Basic event loop with state machine
- [ ] Configuration parser (HEARTBEAT.md, SOUL.md)
- [ ] Unit test framework

#### Milestones

| Week | Milestone | Acceptance Criteria |
|------|-----------|---------------------|
| 1 | Project Scaffold | TypeScript compiles, Docker builds |
| 2 | Event Loop | State transitions work, events emit |
| 3 | Config Parser | Parses sample HEARTBEAT.md |
| 4 | Integration Test | End-to-end event flow |

#### Risk Mitigation

- **Risk:** State machine complexity  
  **Mitigation:** Start with simple linear states, iterate

---

### Phase 2: Intelligence Layer (Weeks 5-8)

**Goal:** Integrate GLM-5-Turbo and context management.

#### Deliverables

- [ ] GLM-5 API client wrapper
- [ ] Context window manager
- [ ] Prompt caching implementation
- [ ] Structured output enforcement
- [ ] Token usage tracking

#### Milestones

| Week | Milestone | Acceptance Criteria |
|------|-----------|---------------------|
| 5 | API Integration | Can call GLM-5 successfully |
| 6 | Context Manager | Sliding window works |
| 7 | Prompt Caching | Cache hits logged |
| 8 | Structured Output | JSON schema validated |

#### Risk Mitigation

- **Risk:** API rate limits  
  **Mitigation:** Implement request queuing and backoff

---

### Phase 3: Communication (Weeks 9-12)

**Goal:** Establish stable WhatsApp integration.

#### Deliverables

- [ ] Baileys client integration
- [ ] Auth persistence system
- [ ] Message queue with rate limiting
- [ ] Authorization layer
- [ ] Response formatting

#### Milestones

| Week | Milestone | Acceptance Criteria |
|------|-----------|---------------------|
| 9 | WhatsApp Connection | QR scan works, session persists |
| 10 | Message Handling | Receive and send messages |
| 11 | Rate Limiting | Queue processes smoothly |
| 12 | Authorization | Whitelist enforcement |

#### Risk Mitigation

- **Risk:** WhatsApp disconnections  
  **Mitigation:** Auto-reconnect with exponential backoff
- **Risk:** Number ban  
  **Mitigation:** Strict rate limiting, human-like delays

---

### Phase 4: Execution Engine (Weeks 13-17)

**Goal:** Build secure sandbox and MCP integration.

#### Deliverables

- [ ] Docker sandbox containers
- [ ] MCP client implementation
- [ ] Tool registration system
- [ ] Resource limit enforcement
- [ ] Execution audit logging

#### Milestones

| Week | Milestone | Acceptance Criteria |
|------|-----------|---------------------|
| 13 | Sandbox Container | Can execute Python code |
| 14 | MCP Protocol | Tool discovery works |
| 15 | Security Limits | Network isolation verified |
| 16 | Tool Library | 5 built-in tools ready |
| 17 | Integration | End-to-end tool execution |

#### Risk Mitigation

- **Risk:** Container escape vulnerabilities  
  **Mitigation:** Use gVisor or Kata Containers for extra isolation

---

### Phase 5: Memory & Persistence (Weeks 18-20)

**Goal:** Implement complete memory system.

#### Deliverables

- [ ] SQLite database setup
- [ ] Vector store with sqlite-vss
- [ ] Redis integration
- [ ] Memory consolidation logic
- [ ] Backup/restore system

#### Milestones

| Week | Milestone | Acceptance Criteria |
|------|-----------|---------------------|
| 18 | Database Setup | SQLite stores entries |
| 19 | Vector Search | Semantic search works |
| 20 | Consolidation | Pruning and merging |

---

### Phase 6: Polish & Production (Weeks 21-24)

**Goal:** Production readiness and optimization.

#### Deliverables

- [ ] Error handling refinement
- [ ] Monitoring dashboard
- [ ] Performance optimization
- [ ] Documentation completion
- [ ] Deployment automation

#### Milestones

| Week | Milestone | Acceptance Criteria |
|------|-----------|---------------------|
| 21 | Error Recovery | Graceful degradation |
| 22 | Monitoring | Grafana dashboard live |
| 23 | Load Testing | Handles 100 concurrent tasks |
| 24 | Production Deploy | Running on VPS |

---

## Technical Specifications

### API Specifications

#### GLM-5-Turbo API

**Base URL:** `https://api.z.ai/api/paas/v4`

**Authentication:**
```http
Authorization: Bearer {API_KEY}
```

**Chat Completion Endpoint:**
```http
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
```

**Response Format:**
```json
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
```

#### MCP Protocol

**Transport:** Standard I/O (stdin/stdout)

**Message Format:**
```json
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
```

### Database Schemas

#### SQLite Schema

```sql
-- Memory entries
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding BLOB,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create vector index
CREATE VIRTUAL TABLE memories_vss USING vss0(
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
```

#### Redis Schema

```
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
```

### Docker Configuration

#### Production Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

RUN apk add --no-cache \
  python3 \
  py3-pip \
  docker-cli

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
```

#### docker-compose.yml (Enhanced)

```yaml
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
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - floyd_network
    depends_on:
      - redis
      - db
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
          memory: 2G

  redis:
    image: redis:7-alpine
    container_name: floyd_redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - floyd_network
    command: redis-server --appendonly yes

  db:
    image: sqlite:latest
    container_name: floyd_db
    restart: unless-stopped
    volumes:
      - db_data:/data
    networks:
      - floyd_network

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
  db_data:
```

---

## Integration Guides

### WhatsApp Integration

#### Step-by-Step Setup

1. **Install Dependencies**
   ```bash
   npm install @whiskeysockets/baileys pino
   ```

2. **Initialize Client**
   ```typescript
   import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
   
   const socket = makeWASocket({
     auth: await loadAuthState(),
     printQRInTerminal: true,
     logger: pino({ level: 'info' })
   });
   ```

3. **Handle Connection Events**
   ```typescript
   socket.ev.on('connection.update', async (update) => {
     const { connection, lastDisconnect } = update;
     
     if (connection === 'close') {
       const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
       if (shouldReconnect) {
         // Reconnect logic
       }
     }
   });
   ```

4. **Process Messages**
   ```typescript
   socket.ev.on('messages.upsert', async ({ messages }) => {
     for (const message of messages) {
       if (message.key.fromMe) continue;
       
       const sender = message.key.remoteJid;
       const text = message.message?.conversation;
       
       // Process message
     }
   });
   ```

### MCP Tool Development

#### Creating a Custom Tool

1. **Define Tool Schema**
   ```typescript
   const myTool: MCPTool = {
     name: "my_custom_tool",
     description: "Description of what the tool does",
     input_schema: {
       type: "object",
       properties: {
         param1: { type: "string", description: "First parameter" },
         param2: { type: "number", description: "Second parameter" }
       },
       required: ["param1"]
     }
   };
   ```

2. **Implement Handler**
   ```typescript
   async function handleMyTool(params: any): Promise<MCPToolResult> {
     try {
       // Validate params
       // Execute logic
       // Return result
       return {
         content: [{
           type: "text",
           text: "Tool executed successfully"
         }]
       };
     } catch (error) {
       return {
         isError: true,
         content: [{
           type: "text",
           text: `Error: ${error.message}`
         }]
       };
     }
   }
   ```

3. **Register Tool**
   ```typescript
   mcpClient.registerTool(myTool, handleMyTool);
   ```

---

## Development Standards

### Code Style

- **Language:** TypeScript 5.0+
- **Style Guide:** ESLint + Prettier
- **Naming Convention:** camelCase for variables, PascalCase for types
- **Comments:** JSDoc for public APIs

### Git Workflow

```
main (production)
  └── develop
       ├── feature/event-loop
       ├── feature/whatsapp-bridge
       └── feature/mcp-integration
```

### Commit Convention

```
feat: add WhatsApp message queue
fix: resolve auth persistence issue
docs: update API documentation
test: add integration tests for sandbox
refactor: improve context window logic
```

### Testing Requirements

- **Unit Tests:** 80% coverage minimum
- **Integration Tests:** All API endpoints
- **E2E Tests:** Critical user journeys
- **Load Tests:** Concurrent execution

---

## Testing & Quality Assurance

### Testing Strategy

#### Unit Tests

```typescript
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
```

#### Integration Tests

```typescript
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
```

#### E2E Tests

```typescript
describe('Full Workflow', () => {
  it('should execute CRON task end-to-end', async () => {
    // Setup: Create HEARTBEAT.md with test CRON
    // Trigger: Fire CRON event
    // Verify: Check WhatsApp message sent
    // Cleanup: Remove test data
  });
});
```

### Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Code Coverage | 80% | Jest coverage report |
| TypeScript Strictness | Strict | tsc --noEmit |
| Linting Errors | 0 | ESLint |
| Security Vulnerabilities | 0 | npm audit |
| Performance | <2s response | Load testing |

---

## Deployment & Operations

### Deployment Checklist

- [ ] Environment variables configured
- [ ] API keys stored securely
- [ ] Docker images built and tested
- [ ] Database migrations run
- [ ] WhatsApp auth state mounted
- [ ] Monitoring dashboards configured
- [ ] Backup procedures tested
- [ ] Rollback plan documented

### Monitoring

#### Key Metrics

1. **System Health**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network throughput

2. **Application Metrics**
   - Request latency (p50, p95, p99)
   - Error rate
   - Token usage
   - Task success rate

3. **WhatsApp Metrics**
   - Connection status
   - Message throughput
   - Rate limit hits

#### Alerting Rules

```yaml
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
```

### Backup Strategy

```bash
# Daily backup script
#!/bin/bash
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
```

---

## Risk Management

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| WhatsApp API changes | High | Medium | Abstraction layer, monitoring |
| GLM-5 API downtime | High | Low | Fallback models, retry logic |
| Container escape | Critical | Low | Security hardening, gVisor |
| Memory leak | Medium | Medium | Monitoring, auto-restart |
| Token limit exceeded | Medium | High | Context window management |

### Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Number ban by WhatsApp | Critical | Medium | Rate limiting, human-like behavior |
| API key exposure | High | Low | Environment variables, rotation |
| Data loss | High | Low | Regular backups, replication |
| Unauthorized access | High | Medium | Whitelist, audit logs |

### Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| User adoption low | Medium | Medium | Documentation, examples |
| Cost overruns | Medium | Medium | Budget monitoring, optimization |
| Competitor solutions | Low | High | Unique features, open source |

---

## Timeline & Milestones

### Gantt Chart

```
Week  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24
      ├─────────────┤─────────────┤─────────────┤─────────────┤─────────────┤
Phase │ Foundation  │Intelligence │Communication│  Execution  │   Memory    │
      └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
                                                                          └─Polish
```

### Milestone Summary

| Phase | Duration | Key Deliverable | Stakeholder Review |
|-------|----------|-----------------|-------------------|
| Foundation | Weeks 1-4 | Working event loop | Week 4 |
| Intelligence | Weeks 5-8 | GLM-5 integration | Week 8 |
| Communication | Weeks 9-12 | WhatsApp live | Week 12 |
| Execution | Weeks 13-17 | Tool execution | Week 17 |
| Memory | Weeks 18-20 | Persistent memory | Week 20 |
| Production | Weeks 21-24 | Deployed system | Week 24 |

### Success Criteria

**Phase 1 Complete When:**
- ✅ Agent can be triggered by CRON
- ✅ State transitions work correctly
- ✅ Configuration files are parsed

**Phase 2 Complete When:**
- ✅ GLM-5 responds correctly
- ✅ Context window managed
- ✅ Caching reduces costs

**Phase 3 Complete When:**
- ✅ WhatsApp messages sent/received
- ✅ Auth persists across restarts
- ✅ Rate limiting prevents bans

**Phase 4 Complete When:**
- ✅ Tools execute in sandbox
- ✅ MCP protocol implemented
- ✅ Security verified

**Phase 5 Complete When:**
- ✅ Long-term memory works
- ✅ Semantic search functional
- ✅ Consolidation runs

**Phase 6 Complete When:**
- ✅ System deployed to production
- ✅ Monitoring active
- ✅ Documentation complete

---

## Appendices

### A. Environment Variables

```bash
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

# Security
SANDBOX_TIMEOUT=5000
SANDBOX_MEMORY=256
SANDBOX_CPU=50

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Deployment
NODE_ENV=production
PORT=3000
```

### B. Dependencies

```json
{
  "dependencies": {
    "@whiskeysockets/baileys": "^6.6.0",
    "dockerode": "^4.0.0",
    "node-cron": "^3.0.3",
    "openai": "^4.0.0",
    "pino": "^8.17.0",
    "redis": "^4.6.0",
    "better-sqlite3": "^9.4.0",
    "marked": "^12.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "eslint": "^8.56.0",
    "prettier": "^3.2.0"
  }
}
```

### C. File Structure

```
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
│   │   ├── sandbox.ts
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
├── docs/
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── TOOLS.md
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | Mar 17, 2025 | Initial | Original specification |
| 2.0.0 | Mar 17, 2025 | Enhanced | Comprehensive roadmap with research |

---

**Document Status:** ✅ Complete  
**Next Review:** April 17, 2025  
**Maintainer:** OPEN-FLOYD Development Team

---

*This roadmap was generated by synthesizing the original OPEN-FLOYD specification with official documentation from GLM-5-Turbo, Model Context Protocol, WhatsApp Business Platform, and industry best practices for autonomous agent development.*
