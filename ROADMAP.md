# OPEN-FLOYD — Roadmap to Finalization

**Version**: 0.1.0 → 1.0.0  
**Date**: 2026-03-23  
**Status**: Framework complete, production hardening required

---

## Current State Assessment

### What Exists (Verified by Code Audit)

```
┌────────────────────────────┬──────────┬──────────────────────────────────────────┐
│ Module                     │ Lines    │ Status                                   │
├────────────────────────────┼──────────┼──────────────────────────────────────────┤
│ Core Orchestrator          │    413   │ Complete — full lifecycle management     │
│ State Machine (FSM)        │    345   │ Complete — guards, deadlock, history     │
│ Event Loop (priority queue)│    335   │ Complete — circuit breaker, typed events │
│ HTTP Server + SSE          │    216   │ Complete — dashboard, stats, real-time    │
│ GLM Gateway                │    319   │ Complete — retry, circuit breaker, cost  │
│ Context Manager            │    218   │ Complete — budget, compression, truncation│
│ Prompt Cache               │    ~130  │ Complete — SHA-256 dedup, LRU eviction   │
│ Structured Output Parser   │    152   │ Complete — JSON extraction, validation   │
│ Tool Registry              │    195   │ Complete — register/call/stats, 3 stubs  │
│ MCP Client                 │     69   │ Complete — JSON-RPC 2.0 adapter          │
│ WASM Sandbox               │    119   │ Scaffold only — no runtime modules       │
│ Vector Store (SQLite+vec)  │    188   │ Complete — CRUD, search, prune, audit    │
│ Redis Cache                │    ~100  │ Complete — ephemeral cache, rate limiting │
│ Memory Consolidator        │     84   │ Partial — prune works, no merge/summarize│
│ WhatsApp Client            │    ~200  │ Complete — Baileys, auto-reconnect       │
│ Auth Manager               │    ~80   │ Complete — whitelist, normalize          │
│ Message Queue              │    ~150  │ Complete — rate limit, retry, split      │
│ CRON Parser                │    ~120  │ Complete — node-cron, validation         │
│ Markdown Parser            │    ~160  │ Complete — HEARTBEAT.md + SOUL.md        │
│ Schema Validator           │    121   │ Complete — hand-rolled JSON Schema       │
│ Types                      │    331   │ Complete — all interfaces, enums          │
│ Logger                     │     38   │ Complete — Pino wrapper                  │
│ Token Counter              │     48   │ Complete — ~4 chars/token heuristic      │
├────────────────────────────┼──────────┼──────────────────────────────────────────┤
│ TOTAL                      │   4211   │                                          │
└────────────────────────────┴──────────┴──────────────────────────────────────────┘
```

### Build & Test Status

```
┌──────────────────────┬──────────────────────────────────────────────────┐
│ Metric               │ Value                                            │
├──────────────────────┼──────────────────────────────────────────────────┤
│ Build (tsc)          │ Clean — zero errors                              │
│ Test Suites          │ 9/9 passed                                       │
│ Test Cases           │ 133/133 passed                                   │
│ Statement Coverage   │ 83.54%                                           │
│ Branch Coverage      │ 71.26% (below 80% threshold)                     │
│ Function Coverage    │ 83.94%                                           │
│ Line Coverage        │ 84.63%                                           │
│ E2E Tests            │ Empty (placeholder .gitkeep only)                │
│ Build Verification       │ N/A — private project, local builds only       │
│ Docker               │ Multi-stage Dockerfile + Compose (Redis)         │
└──────────────────────┴──────────────────────────────────────────────────┘
```

### Critical Gaps (Verified)

1. **WASM Sandbox is non-functional** — `runtime/` contains only `.gitkeep`. The `execute_code` tool returns a stub message. The Extism integration code exists but has no WASM modules to load.
2. **`web_search` tool is a stub** — returns `[web_search stub]` with no actual search provider connected.
3. **Memory Consolidator is incomplete** — `consolidated` count is always 0. No merge/summarize logic exists. Only pruning works.
4. **No embedding generation** — VectorStore expects pre-computed `Float32Array` embeddings. No embedding model integration exists. Vector search is dead code without it.
5. **No conversation persistence** — ContextManager is in-memory only. Restarting the agent loses all conversation history.
6. **No local build verification** — No pre-commit hooks, no automated lint/test gate, no local deployment scripts.
7. **Branch coverage below threshold** — 71.26% vs 80% required. Key gaps in `http-server.ts` (66%), `auth-manager.ts` (50%), `token-counter.ts` (54%).
8. **No E2E tests** — The `tests/e2e/` directory is empty.
9. **No multi-model fallback** — GLM Gateway supports a single model. The `GLM_FALLBACK_MODEL` env var is defined in docs but not implemented in code.
10. **No streaming support** — `stream: false` is hardcoded in the gateway. No SSE streaming to dashboard.

---

## Assessment of Outside Party Recommendations

### Where I Agree

The outside party's 5-phase structure is directionally sound. The prioritization of robustness before features is correct. The identification of tool ecosystem as the "claw" differentiator is accurate. The emphasis on memory intelligence and multi-channel support aligns with the architecture.

### Where I Disagree or Would Reprioritize

1. **Phase 1 (Testing) is underspecified.** The recommendation says "comprehensive testing" but the real blocker is branch coverage (71% vs 80%) and the complete absence of E2E tests. The specific files needing coverage are identifiable right now — this is not exploratory work.

2. **Phase 2 (Tool Ecosystem) over-scopes.** "Tool Discovery Mechanism" and "Tool Composition" are v2 features. The immediate need is making the 3 existing stub tools (`web_search`, `web_reader`, `execute_code`) actually functional. Tool composition chains can wait.

3. **Phase 3 (Memory) misses the embedding gap.** The recommendation discusses "advanced retrieval" and "long-term strategies" but the fundamental blocker is that **no embeddings are being generated**. The vector store is inert without an embedding model. This must be Phase 3 Step 1, not an afterthought.

4. **Phase 4 (Multi-Channel) is premature.** WhatsApp works. Adding Telegram/Discord/Slack before the core agent loop is battle-tested is feature creep. The dashboard already provides a web interface. Multi-channel should be Phase 5, not Phase 4.

5. **Missing: local build verification and deployment automation.** The recommendation mentions "Scaling Strategy" but ignores the operational basics — pre-commit hooks, local build verification, health check automation, and environment-specific configuration.

6. **Missing entirely: conversation persistence.** The agent loses all context on restart. This is a fundamental gap for a "persistent" agent that should be addressed before adding new channels.

7. **"Advanced Reasoning Chains" and "Cost Optimization" are premature.** The current LLM integration handles single-turn tool calling with a 5-iteration loop. Multi-step reasoning chains and token budget optimization are optimizations, not foundations.

---

## Revised Roadmap

### Phase 0: Foundation Hardening (Immediate — 1-2 weeks)

Goal: Get the existing codebase to production-grade quality before adding features.

#### 0.1 Branch Coverage to 80%

Target files (ordered by impact):

```
┌──────────────────────────┬──────────┬──────────────────────────────────────┐
│ File                     │ Current  │ Missing Coverage                    │
├──────────────────────────┼──────────┼──────────────────────────────────────┤
│ src/core/http-server.ts  │   66.3%  │ SSE streaming, static file serving  │
│ src/messaging/auth-mgr   │   50.0%  │ File-based auth persistence         │
│ src/utils/token-counter  │   53.6%  │ Edge cases in estimation            │
│ src/parser/cron-parser   │   71.0%  │ Validation edge cases               │
│ src/parser/schema-val    │   72.9%  │ Nested schema validation            │
│ src/execution/tool-reg   │   79.6%  │ Error paths in tool execution       │
│ src/llm/structured-out   │   81.0%  │ JSON extraction fallback paths      │
└──────────────────────────┴──────────┴──────────────────────────────────────┘
```

#### 0.2 E2E Test Suite

- Bootstrap test: agent starts, processes a CRON event, reaches IDLE
- LLM integration test: mock GLM responses, verify tool call loop
- WhatsApp test: mock Baileys, verify message round-trip
- Dashboard test: HTTP server serves stats, SSE pushes events
- Memory test: vector store persists across restart

#### 0.3 Local Build Verification

- Pre-commit hooks: lint → typecheck → test → coverage check
- Local `scripts/verify.sh` for full build verification before deploy
- Health check script for post-deployment validation

#### 0.4 Bug Fixes & Hardening

- `auth-manager.ts`: File persistence paths (lines 15-38 uncovered)
- `http-server.ts`: SSE client cleanup on disconnect (lines 148-168)
- Structured output: Handle malformed tool_calls gracefully
- Graceful shutdown: Ensure all timers and connections close cleanly

**Exit Criteria**: Branch coverage >= 80%, E2E tests pass, local build verification green.

---

### Phase 1: Make the Claws Work (2-3 weeks)

Goal: All 3 registered tools produce real output instead of stubs.

#### 1.1 Web Search Tool

Replace the stub in `src/execution/tool-registry.ts:125-134` with a real implementation:
- Provider: SearXNG self-hosted or Brave Search API
- Rate limiting via Redis cache
- Result deduplication and relevance scoring
- Configurable via `config/default.json`

#### 1.2 Web Reader Tool

The `web_reader` tool at `src/execution/tool-registry.ts:149-167` already has a basic `fetch()` implementation. Enhance:
- HTML → markdown conversion (already depends on `marked`)
- Content extraction (readability-style, not raw HTML)
- Timeout handling (already has 10s timeout)
- robots.txt compliance
- Content length limits with smart truncation

#### 1.3 Code Execution (WASM Sandbox)

This is the highest-effort item. The Extism integration exists (`src/execution/wasm-sandbox.ts`) but `runtime/` is empty.

Options (recommended: Option A):
- **Option A**: Pre-built WASM runtimes from Extism registry (JavaScript, Python). Ship as binary assets.
- **Option B**: Replace Extism with Deno-style isolated eval (simpler, less secure).
- **Option C**: Use QuickJS WASM for JavaScript only (smallest attack surface).

Deliverables:
- Working `execute_code` tool for JavaScript
- Optional Python support (Phase 2)
- Resource limits enforced (memory, CPU, network)
- Output capture and error reporting

#### 1.4 Tool Permission System

- Per-tool enable/disable (already exists in ToolRegistry)
- User-facing permission prompts for dangerous tools
- Audit logging of all tool executions (schema exists in vector-store.ts:164-175)

**Exit Criteria**: `web_search` returns real results, `web_reader` extracts clean content, `execute_code` runs JavaScript in sandbox.

---

### Phase 2: Memory Intelligence (2-3 weeks)

Goal: The agent remembers, retrieves, and consolidates information across sessions.

#### 2.1 Embedding Generation

The vector store (`src/memory/vector-store.ts`) is fully implemented but receives no embeddings. This is the single highest-impact gap.

Implementation:
- Embedding model: GLM embedding API or local `sentence-transformers` via ONNX Runtime
- Async embedding pipeline: queue → embed → store
- Batch embedding for consolidation runs
- Fallback: keyword search when embeddings unavailable

Files to modify:
- `src/memory/vector-store.ts` — add `embedAndStore()` method
- `src/memory/embedding-service.ts` — new file, embedding model client
- `src/core/orchestrator.ts` — wire embedding service into event processing

#### 2.2 Conversation Persistence

ContextManager (`src/llm/context-manager.ts`) is in-memory only.

Implementation:
- Serialize conversation to SQLite on each message
- Restore on startup
- Per-conversation isolation (by event source + sender)
- TTL-based cleanup for stale conversations

Files to modify:
- `src/llm/context-manager.ts` — add persistence methods
- `src/memory/vector-store.ts` — add conversations table

#### 2.3 Memory Consolidation (Complete)

The consolidator (`src/memory/consolidation.ts`) prunes but never merges or summarizes.

Implementation:
- Semantic deduplication: find near-duplicate memories, merge
- Importance scoring: combine recency, access frequency, source priority
- Summarization: use LLM to compress clusters of related memories
- The `consolidated` counter should reflect actual merge operations

#### 2.4 Working Memory Integration

ContextManager already has `addWorkingMemory()` and `clearWorkingMemory()`. Wire these:
- Auto-inject relevant memories from vector search into working memory
- Relevance threshold tuning
- Memory citation in LLM responses

**Exit Criteria**: Agent remembers facts across restarts, retrieves relevant context, consolidates redundant memories.

---

### Phase 3: LLM Robustness (1-2 weeks)

Goal: Reliable, cost-efficient LLM integration with fallbacks.

#### 3.1 Multi-Model Fallback

`GLM_FALLBACK_MODEL` env var is documented but not implemented.

Implementation:
- Primary model fails → fallback model
- Per-request model selection based on task complexity
- Model capability registry (which models support tools, thinking, etc.)

#### 3.2 Streaming Support

Currently `stream: false` is hardcoded in `glm-gateway.ts:92`.

Implementation:
- Streaming response parsing
- SSE push to dashboard in real-time
- Token-by-token cost tracking
- Cancellation support via AbortController

#### 3.3 Token Budget Optimization

Implementation:
- Per-task token budgets (not just global)
- Prompt compression for tool definitions
- Caching tool definitions across requests (PromptCache already exists)
- Cost alerts and daily spend limits

#### 3.4 Structured Output Hardening

The parser (`src/llm/structured-output.ts`) uses regex JSON extraction. Improve:
- Request JSON mode from GLM API when available
- Schema validation with detailed error messages
- Retry with re-prompting on parse failure

**Exit Criteria**: Agent degrades gracefully when primary model fails, streams responses to dashboard, stays within configurable token budgets.

---

### Phase 4: Observability & Operations (1-2 weeks)

Goal: Production-ready monitoring and deployment.

#### 4.1 Metrics & Tracing

- OpenTelemetry integration (or Pino-compatible)
- Per-event latency tracking
- LLM token usage dashboards
- Tool execution success/failure rates
- Memory store growth monitoring

#### 4.2 Configuration Management

- Environment-specific config files (`config/development.json`, `config/production.json`)
- Config validation on startup (schema-validator exists)
- Hot-reload of SOUL.md and HEARTBEAT.md without restart
- Secret management (move API keys out of env vars)

#### 4.3 Local Deployment Automation

- Local `scripts/deploy.sh` for Docker Compose rebuild and restart
- Database migration support (SQLite schema versioning)
- Backup/restore for memory.db
- Environment-specific config loading (dev/staging/prod)

#### 4.4 Security Hardening

- WASM sandbox network isolation
- Tool execution audit trail (schema exists, not wired)
- Rate limiting per user/channel
- Input sanitization for all external inputs
- Local dependency audit (no external scanning services)

**Exit Criteria**: Agent deploys with a single command, metrics are visible, configuration changes don't require restart.

---

### Phase 5: Multi-Channel & Extensions (2-3 weeks)

Goal: Broader reach through additional interfaces.

#### 5.1 Telegram Bridge

- EventSource adapter (same pattern as WhatsApp)
- Message formatting for Telegram markdown
- Inline keyboard support for tool confirmations

#### 5.2 Web Chat Interface

- Upgrade `public/index.html` from dashboard to interactive chat
- WebSocket connection for real-time messaging
- Session management
- File upload support

#### 5.3 Tool Marketplace

- Dynamic tool loading from `workspace/tools/` directory
- Tool manifest format (JSON Schema)
- Hot-reload on file change
- Community tool sharing format

#### 5.4 Plugin System

- Lifecycle hooks: `onEvent`, `onToolCall`, `onResponse`
- Per-plugin configuration
- Isolation via separate WASM instances

**Exit Criteria**: Agent accessible via WhatsApp, Telegram, and web chat. Custom tools loadable without code changes.

---

## Effort Estimate

```
┌──────────────────────────────────┬───────────┬────────────┬──────────────┐
│ Phase                            │ Duration  │ Effort     │ Dependencies │
├──────────────────────────────────┼───────────┼────────────┼──────────────┤
│ Phase 0: Foundation Hardening    │ 1-2 weeks │ Medium     │ None         │
│ Phase 1: Make the Claws Work     │ 2-3 weeks │ High       │ Phase 0      │
│ Phase 2: Memory Intelligence     │ 2-3 weeks │ High       │ Phase 0      │
│ Phase 3: LLM Robustness          │ 1-2 weeks │ Medium     │ Phase 0      │
│ Phase 4: Observability & Ops     │ 1-2 weeks │ Medium     │ Phase 0-1    │
│ Phase 5: Multi-Channel           │ 2-3 weeks │ Medium     │ Phase 1-4    │
├──────────────────────────────────┼───────────┼────────────┼──────────────┤
│ Total (sequential)               │ 9-15 weeks│            │              │
│ Total (Phase 1-3 parallel)       │ 6-10 weeks│            │              │
└──────────────────────────────────┴───────────┴────────────┴──────────────┘
```

Phases 1, 2, and 3 can run in parallel after Phase 0 completes. Phase 4 can begin alongside Phase 1. Phase 5 depends on all prior phases.

---

## Risk Register

```
┌──────────────────────────────────┬──────────┬──────────────────────────────┐
│ Risk                             │ Severity │ Mitigation                   │
├──────────────────────────────────┼──────────┼──────────────────────────────┤
│ WASM runtime compatibility       │ High     │ Start with JS-only, add Py   │
│ Embedding model availability     │ High     │ Support multiple providers   │
│ GLM API rate limits              │ Medium   │ Circuit breaker + fallback   │
│ SQLite concurrent access         │ Medium   │ WAL mode + connection pool   │
│ Memory bloat (vector store)      │ Medium   │ Aggressive pruning + TTL     │
│ WhatsApp auth breakage           │ Medium   │ Auth persistence + recovery  │
│ Token cost overruns              │ Medium   │ Per-task budgets + alerts    │
│ Scope creep (Phase 5)            │ Low      | Strict phase gate criteria    │
└──────────────────────────────────┴──────────┴──────────────────────────────┘
```

---

## Success Metrics

```
┌──────────────────────────────────┬──────────────┬──────────────────────────┐
│ Metric                           │ Current      │ Target (v1.0)            │
├──────────────────────────────────┼──────────────┼──────────────────────────┤
│ Branch Coverage                  │ 71.26%       │ >= 80%                   │
│ E2E Test Suites                  │ 0            │ >= 3                     │
│ Functional Tools                 │ 0/3          │ 3/3                      │
│ Memory Persistence               │ None         │ Cross-restart            │
│ Embedding Search                 │ Non-functional│ Operational             │
│ Build Verification                │ Manual       │ Automated (pre-commit)    │
│ Streaming Responses              │ No           │ Yes                      │
│ Multi-Model Fallback             │ No           │ Yes                      │
│ Channels                         │ 1 (WhatsApp) │ 3+ (WA, Telegram, Web)   │
│ Mean Time to Recovery            │ Unknown      │ < 30s (auto)             │
│ LLM Cost per Day                 │ Untracked    │ Tracked + budgeted       │
└──────────────────────────────────┴──────────────┴──────────────────────────┘
```

---

## Immediate Next Steps

1. **Today**: Fix branch coverage gaps in `http-server.ts`, `auth-manager.ts`, `token-counter.ts`
2. **This week**: Write 3 E2E test scenarios (bootstrap, LLM mock, WhatsApp mock)
3. **This week**: Set up pre-commit hooks and local build verification script
4. **Next week**: Begin Phase 1 — wire `web_search` to a real provider
5. **Next week**: Begin Phase 2 — implement embedding service for vector store
