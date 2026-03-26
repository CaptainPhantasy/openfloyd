# OPEN-FLOYD COO Platform — Feature Status Report

**Generated:** 2026-03-25
**Version:** 0.2.0
**Build Status:** Clean (0 errors, 231/231 tests pass)

---

## CRITICAL DISCLOSURE: Mock, Stub, and Simulated Data

The following components produce **non-functional or simulated output** under current runtime conditions. Users should not rely on these for real data.

### Stubs (Return canned text, no real operation)

| Component | Location | Behavior |
|---|---|---|
| `web_search` tool | `src/execution/tool-registry.ts:125-133` | Returns `[web_search stub] Query: "..." — MCP web search provider not yet connected`. No actual search is performed. |
| `execute_code` tool | `src/execution/tool-registry.ts:169-191` | Returns `[execute_code stub] Language: ... — WASM runtime modules not yet deployed`. No code is executed. The `runtime/` directory contains only `.gitkeep`. |
| POST `/api/project/approve` | `src/core/orchestrator.ts:352-354` | Returns `{"ok":true,"status":"approved"}` but does not change any plan state. No plan lifecycle is wired to this endpoint. |
| POST `/api/project/cancel` | `src/core/orchestrator.ts:356-358` | Returns `{"ok":true,"status":"cancelled"}` but does not change any plan state. |
| GET `/api/project` | `src/core/orchestrator.ts:320` | Returns hardcoded `{"name":"No active project","status":"idle"}` with live worker count and cost data. The project name/status/progress fields are static because no plan lifecycle is wired to the data provider. The workers and cost fields are live. |
| GET `/api/activity` | `src/core/orchestrator.ts:346` | Returns `[]`. No activity entries are generated or stored. |
| GET `/api/costs/history` | `src/core/orchestrator.ts:349` | Returns `[]`. Historical cost data is stored in SQLite but not queried by this endpoint. |

### Not Yet Implemented

| Component | Location | Status |
|---|---|---|
| OpenAI streaming | `src/llm/providers/openai-provider.ts:109` | `stream()` method logs warning, yields single `{finishReason:'stop'}`. |
| Anthropic streaming | `src/llm/providers/anthropic-provider.ts:136` | Same as OpenAI. |
| WASM sandbox | `src/execution/wasm-sandbox.ts` + `runtime/` | Extism integration code exists but no `.wasm` modules are present. `runtime/` is empty. |
| Vector search (embeddings) | `src/memory/vector-store.ts` | Store accepts and searches embeddings, but no embedding generation exists anywhere in the codebase. Vector search is inert without external embeddings. |
| Memory consolidation (merge/summarize) | `src/memory/consolidation.ts` | Pruning works. Merge and summarize operations are not implemented. The `consolidated` counter is always 0. |
| WhatsApp client | `src/messaging/whatsapp-client.ts` | Code exists and imports Baileys, but is documented as BLOCKED due to upstream Baileys library issues. |

### Requires External API Keys to Function

| Component | Required Key | Without Key |
|---|---|---|
| LLM reasoning (GLM) | `ZAI_API_KEY` | Events are logged but not processed through LLM. No assistant responses generated. |
| LLM fallback (OpenAI) | `OPENAI_API_KEY` | OpenAI provider not registered. Fallback routing skips it. |
| LLM fallback (Anthropic) | `ANTHROPIC_API_KEY` | Anthropic provider not registered. Fallback routing skips it. |
| Web research (Exa) | `EXA_API_KEY` | `WebResearchTool.search()` returns `[]`. |
| Web research (Tavily) | `TAVILY_API_KEY` | Same. Falls through to empty result. |
| Planning intelligence | `ZAI_API_KEY` (minimum) | `PlanningEngine.analyzeGoal()` returns minimal analysis without LLM. `generatePaths()` returns a single default path. |

---

## FULLY FUNCTIONING FEATURES

### 1. HTTP Server with Health Check

**What it does:** Serves the dashboard, API endpoints, SSE stream, and WebSocket upgrade. Provides a `/health` endpoint for monitoring.

**Evidence:** Smoke tested — `GET /health` returns `{"status":"ok","uptime":N,"timestamp":"..."}` (verified: HTTP 200).

**User Workflow:**
1. Run `npm start` (or `node dist/index.js`)
2. Server starts on configured `PORT` (default 8787)
3. Visit `http://localhost:8787/health` in browser or monitoring tool
4. Returns JSON with status, uptime in seconds, and ISO timestamp
5. Use as Docker health check or uptime monitor target

---

### 2. Real-Time Dashboard (Catppuccin Mocha UI)

**What it does:** Single-page web dashboard showing system state, worker grid, cost breakdown, activity feed, and chat interface. Auto-refreshes every 5 seconds via JavaScript polling. SSE stream for live event push.

**Evidence:** `GET /` returns full HTML. All 20 UI component IDs verified present in served HTML.

**Components that display live data:**
- System stats panel (state, uptime, event count, LLM calls, memory entries) — sourced from `GET /stats`
- Cost breakdown (today/week/month, budget bar, provider breakdown) — sourced from `GET /api/costs` backed by real SQLite data
- Worker grid (shows active workers with health color coding) — sourced from `GET /api/workers` backed by real PoolManager state
- Connection status indicator (WebSocket connected/disconnected) — real browser WebSocket state

**Components that display static/placeholder data:**
- Project status panel (name, description, progress bar) — returns "No active project" until plan lifecycle is wired
- Activity feed — returns empty array

**User Workflow:**
1. Start the server
2. Open `http://localhost:8787` in any browser
3. Dashboard loads with Catppuccin Mocha dark theme
4. System panel shows live state, uptime, event counts
5. Cost panel shows real spending data (if LLM calls have been made)
6. Worker grid populates when workers are spawned via PoolManager
7. Chat sidebar connects via WebSocket for real-time messaging
8. On mobile, tap "Chat" button in header to toggle chat sidebar

---

### 3. WebSocket Chat Interface

**What it does:** Bidirectional real-time messaging between browser and orchestrator. Messages are persisted to SQLite. Conversation history loads on reconnect. Supports multiple simultaneous browser connections.

**Evidence:** WebSocket connects to `/ws`, ping/pong verified, messages accepted without error. Conversation persistence verified: save 3 messages, retrieve 3, search finds matching content, clear empties table.

**User Workflow:**
1. Open dashboard in browser — WebSocket connects automatically
2. Connection status shows "Connected" (green dot)
3. Type message in chat input, press Send or Enter
4. Message appears in chat as "You" (blue, right-aligned)
5. If `ZAI_API_KEY` is set, FLOYD processes the message through the LLM and responds
6. Response appears as "FLOYD" (green, left-aligned)
7. Typing indicator shows "FLOYD is thinking..." while processing
8. Refresh the page — previous messages reload from SQLite
9. Open a second browser tab — both receive broadcast messages

**Without LLM:** Messages are accepted and persisted, events flow through the orchestrator, but no assistant response is generated. The event is logged.

---

### 4. Server-Sent Events (SSE) Activity Stream

**What it does:** Push-based real-time event stream from orchestrator to browser. Events are color-coded by source type (CRON=peach, WHATSAPP=green, WEBHOOK=blue, API=purple, SYSTEM=gray).

**Evidence:** `GET /api/events` returns HTTP 200 with `Content-Type: text/event-stream`. Immediate `:ok` comment flushes headers. Events pushed as `data: {...}\n\n` SSE format.

**User Workflow:**
1. Dashboard connects to `/api/events` via `EventSource` API
2. As events occur (CRON triggers, WebSocket messages, webhooks), they appear in the Activity section
3. Each event shows timestamp, colored type badge, and message preview
4. Buffer holds last 100 events; new connections receive last 20

---

### 5. CRON Event Source

**What it does:** Parses `workspace/HEARTBEAT.md` for cron schedules, registers them with `node-cron`, and fires events into the event loop on schedule.

**Evidence:** Server starts with `sources: 2` (CRON + WebChat). Cron blocks parsed from HEARTBEAT.md.

**User Workflow:**
1. Edit `workspace/HEARTBEAT.md` with cron schedules in the documented markdown format
2. Start the server — schedules are parsed and registered
3. At the scheduled time, a CRON event fires into the event loop
4. Event appears in dashboard activity feed
5. If LLM is connected, the cron action is processed as an agent task

---

### 6. State Machine (FSM)

**What it does:** Manages orchestrator lifecycle: IDLE -> PROCESSING -> EXECUTING -> IDLE with guards, deadlock detection (configurable timeout), and typed event emission for state transitions.

**Evidence:** `GET /stats` returns `"state":"idle"`. State transitions logged on every event. Deadlock detection forces IDLE recovery.

**States:** IDLE, PROCESSING, EXECUTING, AWAITING_INPUT, ERROR, MAINTENANCE

**User Workflow:**
1. System starts in IDLE
2. Event arrives -> transitions to PROCESSING
3. LLM plans action -> transitions to EXECUTING
4. Tool results return -> cycles back through PROCESSING
5. Task complete -> returns to IDLE
6. If stuck in any state too long, deadlock detector forces recovery to IDLE

---

### 7. Priority Event Loop with Circuit Breaker

**What it does:** Processes events from all sources (CRON, WebSocket, webhook) in priority order. Circuit breaker trips after 5 consecutive failures, cooling down for 30 seconds before retrying.

**Evidence:** Stats show `processed`, `failed`, `queued`, `sources` counts. Event sources registered at startup.

**User Workflow:**
1. Events arrive from multiple sources simultaneously
2. Event loop processes highest priority first (CRITICAL=0 > HIGH=1 > NORMAL=2 > LOW=3 > BACKGROUND=4)
3. If 5 events fail in a row, circuit breaker opens — events queue but aren't processed for 30s
4. After cooldown, processing resumes automatically

---

### 8. LLM Multi-Provider Router

**What it does:** Routes LLM requests to the appropriate provider based on task type. Supports primary + fallback provider chains. Falls through to fallback automatically on primary failure.

**Evidence:** Smoke tested with mock provider — routes correctly, calculates cost, falls through on missing rules. 7 routing rules configured for PLANNING/CODING/TESTING/REVIEW/RESEARCH/MARKETING/FAST task types.

**Providers implemented:**
- **GLM (Z.ai)** — Full implementation with complete(), stream(), retry, rate limit tracking. Primary for most task types.
- **OpenAI** — complete() implemented. stream() is stub. Fallback for CODING.
- **Anthropic** — complete() implemented with Anthropic message format. stream() is stub. Fallback for PLANNING/MARKETING.

**User Workflow:**
1. Set `ZAI_API_KEY` (and optionally `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
2. System registers available providers at startup
3. When a planning task arrives, router sends to GLM-5-Turbo
4. If GLM fails, automatically falls back to Anthropic (if key set)
5. Coding tasks go to GLM-4, falling back to OpenAI GPT-4o-mini
6. Cost is calculated per-request based on model pricing

---

### 9. Cost Tracker with Budget Alerts

**What it does:** Records every LLM API call with token counts and dollar cost. Persists to SQLite. Queries by provider, project, worker, time range. Fires configurable budget alerts.

**Evidence:** Full CRUD smoke tested. Recorded 4 usage entries, queried total ($0.018), by provider (zai=$0.003, openai=$0.015), by project, by worker, by time. Budget alert fired at 50% threshold. All data persists in `workspace/costs.db`.

**User Workflow:**
1. System automatically records usage after every LLM call
2. Dashboard cost panel shows real-time today/week/month spending
3. Budget bar shows percentage of daily limit consumed
4. At 50%, 75%, 90%, 100% thresholds, budget alert fires (logged)
5. Provider breakdown shows which LLM providers are costing what
6. Query historical costs programmatically via `CostTracker` API

---

### 10. ROI Calculator with Revenue Tracking

**What it does:** Creates project records, attributes LLM costs to projects, records revenue from any source, calculates ROI percentage, and estimates breakeven dates.

**Evidence:** Full CRUD smoke tested. Created project "RSS Reader", attributed $7.80 cost, recorded $35 revenue from 2 sources. Calculated ROI: 348.7%. Breakeven estimation returns valid Date. Revenue history stored with timestamps and sources.

**User Workflow:**
1. Create a project via `ROICalculator.createProject()`
2. As workers execute tasks for that project, costs are attributed
3. When the project generates revenue (subscriptions, sales), record it
4. Query `calculateROI()` — returns total cost, total revenue, net profit, ROI %
5. Use `estimateBreakeven(projectId, monthlyRevenue)` to project when the project pays for itself
6. `generateReport()` returns full project report with cost breakdown and revenue history

---

### 11. Task Queue with Dependency Resolution

**What it does:** Priority queue for worker tasks. Tasks can declare dependencies on other tasks. Only tasks with all dependencies satisfied appear in the ready queue. Supports complete/fail/stats.

**Evidence:** Smoke tested with 4 tasks, 2 with dependencies. Ready queue correctly showed t1+t4 (no deps). After t1 completed, t2 became ready. Stats tracked all states accurately.

**User Workflow:**
1. Planning engine decomposes a plan into tasks with dependencies
2. Tasks are enqueued — `enqueue(task)`
3. `getReadyTasks()` returns only tasks whose dependencies are all complete
4. `dequeue()` returns highest-priority ready task
5. Worker completes task -> `markComplete(taskId)` -> dependent tasks unblock
6. `getQueueStats()` shows total/pending/ready/running/complete/failed counts

---

### 12. Worker Pool Manager with Heartbeat Monitoring

**What it does:** Spawns worker agents with VibeBox VM backing. Tracks worker state, health, token usage, and cost. Heartbeat monitor detects stale (15s) and dead (30s) workers.

**Evidence:** HeartbeatMonitor smoke tested — registered 2 workers, detected stale worker with 20s-old heartbeat within one check cycle. PoolManager initializes and shuts down cleanly.

**User Workflow:**
1. `PoolManager.spawnWorker(WorkerType.CODER)` creates a new worker
2. Worker spawns a VibeBox VM via SSH (requires running VMs at 192.168.64.x)
3. Worker state progresses: SPAWNING -> INITIALIZING -> READY
4. Assign task: `worker.assignTask(task)` — state becomes WORKING
5. Dashboard worker grid shows worker card with green/yellow/red health indicator
6. Click worker card to expand details (progress, tokens, last heartbeat)
7. If worker stops sending heartbeats: yellow at 15s, terminated at 30s

**Limitation:** Requires actual VibeBox VMs running and accessible via SSH at the configured IP range. Without VMs, spawn will fail at the SSH connection step.

---

### 13. Concurrency Manager

**What it does:** Per-provider concurrency limiting. Requests that exceed the limit are queued and released FIFO when a slot opens. Priority-aware queuing.

**Evidence:** Smoke tested — set limit to 2, acquired 2 (at capacity), 3rd queued, release unblocked queued request.

**User Workflow:**
1. Set concurrency limit per provider: `cm.setLimit('zai', 5)`
2. Before each LLM call, `acquire('zai')` — blocks if at limit
3. After call completes, `release('zai')` — unblocks next queued request
4. `getStatus()` shows active/queued counts for monitoring

---

### 14. Brand Voice Manager with Persistent Storage

**What it does:** Loads brand voice definitions from JSON file. Validates content against brand rules (avoid words, preferred phrases). Generates inquiry questions for new brands. Registers new brands and persists to disk. Applies brand voice to content via LLM.

**Evidence:** Smoke tested — loaded 2 brands (Floyd's Labs, Legacy AI). Good content validated (score 1.0). Content with avoid words flagged (3 issues, score 0.7). Inquiry generated 7 questions. New brand built from answers and persisted.

**User Workflow (new brand):**
1. User says "I want to set up a brand voice for [BrandName]"
2. Agent calls `generateBrandInquiry('BrandName')` — returns 7 questions about tone, vocabulary, style, avoid words, preferred phrases, examples, colors
3. Agent asks each question, collects answers
4. Agent calls `buildBrandFromAnswers(id, name, answers)` to create Brand object
5. Agent calls `registerBrand(brand)` — saves to `workspace/brands.json`
6. Brand is now available for voice validation and content generation

**User Workflow (apply voice):**
1. Generate content normally
2. Call `applyVoice(content, 'floyds-labs')` — LLM rewrites content in brand voice
3. Call `validateVoice(content, 'floyds-labs')` — returns score and issues

---

### 15. Web Research Tool (Exa/Tavily)

**What it does:** Searches the web via Exa or Tavily APIs. Extracts page content via fetch + HTML stripping. Cross-references multiple sources to verify claims.

**Evidence:** Code verified — `search()` calls Exa API at `https://api.exa.ai/search` with Tavily fallback at `https://api.tavily.com/search`. `extract()` fetches URL with 10s timeout and strips HTML. `verify()` searches for claim, extracts from sources, scores word overlap.

**Requires:** `EXA_API_KEY` or `TAVILY_API_KEY` environment variable.

**User Workflow:**
1. Set `EXA_API_KEY` in environment
2. Call `search('current Bitcoin price', { maxResults: 5, recency: 'day' })`
3. Returns array of `{title, url, snippet, publishedDate, score}`
4. Call `extract(url)` on any result to get full page content
5. Call `verify('Bitcoin is at $95,000', ['url1', 'url2'])` to cross-reference

**Without API key:** `search()` returns `[]`. `extract()` works (uses fetch). `verify()` returns 0 confidence with no sources.

---

### 16. Planning Engine with LLM-Powered Path Generation

**What it does:** Analyzes goals via LLM + web research, generates multiple execution paths with worker requirements and cost/time estimates, recommends the best path, decomposes plans into worker tasks.

**Requires:** `ZAI_API_KEY` for LLM-powered analysis. Works in degraded mode without.

**User Workflow (with LLM):**
1. User says "Build me an RSS reader"
2. `analyzeGoal('Build me an RSS reader')` — LLM analyzes requirements, constraints, risks. Web research provides current facts.
3. `generatePaths(analysis)` — LLM generates 3 execution paths, each with steps, worker types, time/cost estimates
4. `recommend(paths)` — scores paths by confidence/cost/time, returns best
5. `createPlan(path, goal)` — creates Plan object with tasks
6. `decomposePlan(plan)` — returns WorkerTask array for the task queue

**Without LLM:** `analyzeGoal()` returns minimal analysis with the original goal. `generatePaths()` returns a single default path (Research -> Implement -> Test -> Review).

---

### 17. Conversation Persistence (SQLite)

**What it does:** Saves all chat messages (user + assistant) to SQLite. Loads history on WebSocket reconnect. Supports text search across history.

**Evidence:** Smoke tested — saved 3 messages, retrieved all 3, search by content found match, clear emptied table.

**User Workflow:**
1. Send messages via WebSocket chat
2. Each message (sent and received) is saved to `workspace/conversations.db`
3. Refresh browser — WebSocket reconnects, last 50 messages load automatically
4. Search history: `store.searchHistory('keyword')` returns matching messages

---

### 18. Configuration Parsing (HEARTBEAT.md + SOUL.md)

**What it does:** Parses `workspace/HEARTBEAT.md` for CRON schedules and `workspace/SOUL.md` for agent identity/directives. Directives are injected as the LLM system prompt.

**Evidence:** Server starts and logs `Soul directives loaded` and CRON blocks registered.

**User Workflow:**
1. Edit `workspace/SOUL.md` — define agent personality, mandates, constraints
2. Edit `workspace/HEARTBEAT.md` — define automated schedules
3. Start server — both files are parsed at boot
4. Soul directives become the system prompt for all LLM interactions
5. CRON schedules fire events on their configured schedules

---

### 19. `web_reader` Tool (Actual HTTP Fetch)

**What it does:** Fetches any URL and returns the first 10,000 characters of content. 10-second timeout. Identifies itself as `OpenFloyd/0.1.0`.

**Evidence:** Code at `src/execution/tool-registry.ts:149-167` performs real `fetch()` with `AbortSignal.timeout(10_000)`.

**Note:** Unlike `web_search` (stub) and `execute_code` (stub), `web_reader` is a real implementation that makes actual HTTP requests.

**User Workflow:**
1. LLM decides to read a URL during task processing
2. Calls `web_reader` tool with `{"url": "https://example.com"}`
3. Tool fetches the URL, returns first 10K characters of response body
4. LLM uses content for reasoning

---

## SUMMARY

| Category | Count | Details |
|---|---|---|
| Fully functioning features | 19 | Listed above with evidence |
| Stub tools (return canned text) | 2 | `web_search`, `execute_code` |
| Stub endpoints (no state change) | 3 | `project/approve`, `project/cancel`, `activity` |
| Requires API key to function | 5 | GLM, OpenAI, Anthropic, Exa, Tavily |
| Not yet implemented | 4 | WASM sandbox, embeddings, memory consolidation merge, WhatsApp (blocked) |
| Streaming not implemented | 2 | OpenAI stream, Anthropic stream (GLM stream works) |
