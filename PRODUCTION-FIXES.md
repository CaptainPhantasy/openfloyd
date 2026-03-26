# OPEN-FLOYD — Production Readiness Fix Plan

**Generated:** 2026-03-25
**Purpose:** Item-by-item analysis of every non-functional, stub, mock, or incomplete component. For each: what it does now, what it must do in production, and what work is required.

---

## FIX 1: `web_search` Tool — Stub Returns Canned Text

### Current State
**File:** `src/execution/tool-registry.ts:125-133`
**Behavior:** Returns the string `[web_search stub] Query: "..." — MCP web search provider not yet connected` for every query. No HTTP request is made. No search results are returned.

```typescript
// Current code (line 125-133)
async (params) => {
  const query = params['query'] as string;
  return {
    content: [{
      type: 'text',
      text: `[web_search stub] Query: "${query}" — MCP web search provider not yet connected`,
    }],
  };
},
```

### Production Requirement
Must perform a real web search using an actual search provider and return structured results with titles, URLs, and snippets.

### Fix Required
**Option A — Wire to WebResearchTool (already exists):**
The `WebResearchTool` class at `src/tools/web-research.ts:14-27` already implements real search via Exa and Tavily APIs. The `web_search` tool in the registry just needs to call it instead of returning a stub.

Replace the stub handler with:
```typescript
async (params) => {
  const query = params['query'] as string;
  const limit = (params['limit'] as number) ?? 5;
  const results = await webResearchTool.search(query, { maxResults: limit });
  if (results.length === 0) {
    return { content: [{ type: 'text', text: 'No search results found.' }] };
  }
  const formatted = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n');
  return { content: [{ type: 'text', text: formatted }] };
},
```

**Dependencies:**
- `WebResearchTool` instance must be passed to `createBuiltinTools()` or made accessible
- `EXA_API_KEY` or `TAVILY_API_KEY` must be set in environment

**Effort:** Small — the search implementation exists, just needs wiring.

---

## FIX 2: `execute_code` Tool — Stub Returns Canned Text

### Current State
**File:** `src/execution/tool-registry.ts:169-191`
**Behavior:** Returns the string `[execute_code stub] Language: ... — WASM runtime modules not yet deployed`. No code is executed.

**File:** `src/execution/wasm-sandbox.ts:106-118`
**Behavior:** The `WasmSandbox` class has a complete Extism integration that loads `.wasm` files from `./runtime/javascript-env.wasm` and `./runtime/python-env.wasm`. The code is real — it creates Extism plugins, calls `eval`, captures output, handles timeouts.

**File:** `runtime/`
**Behavior:** Contains only `.gitkeep`. No WASM modules present.

```typescript
// wasm-sandbox.ts:107-110 — expects files that don't exist
const runtimePaths: Record<string, string> = {
  javascript: './runtime/javascript-env.wasm',
  python: './runtime/python-env.wasm',
};
```

### Production Requirement
Must execute user-provided JavaScript and Python code in an isolated WASM sandbox with resource limits (memory, CPU, timeout) and return stdout/stderr output.

### Fix Required

**Step 1 — Obtain WASM runtime modules:**
- JavaScript: Use Extism's QuickJS plugin from their registry (`extism/js-pdk` or build from `nicolo-ribaudo/pdk-quickjs`)
- Python: Use Extism's `extism/python-wasm` or RustPython compiled to WASM
- Download or build these and place in `runtime/javascript-env.wasm` and `runtime/python-env.wasm`

**Step 2 — Wire `execute_code` tool to `WasmSandbox`:**
Replace the stub handler in tool-registry.ts with:
```typescript
async (params) => {
  const sandbox = new WasmSandbox();
  const result = await sandbox.execute({
    language: params['language'] as 'python' | 'javascript',
    code: params['code'] as string,
    timeout: (params['timeout'] as number) ?? 5000,
    memoryBytes: 256 * 1024 * 1024,
  });
  return {
    content: [{ type: 'text', text: result.error ? `Error: ${result.error}` : (result.output ?? '') }],
    isError: !!result.error,
  };
},
```

**Step 3 — Validate sandbox isolation:**
- Verify filesystem access is blocked (`allowedPaths: {}`)
- Verify network access is blocked (no `allowedHosts`)
- Verify timeout enforcement works
- Verify memory limit enforcement works

**Dependencies:**
- WASM module files must be built/downloaded (the hard part)
- `@extism/extism` package is already installed

**Effort:** Medium — the sandbox code is written, but obtaining and testing WASM modules requires build toolchain work.

---

## FIX 3: `/api/project` — Hardcoded "No active project"

### Current State
**File:** `src/core/orchestrator.ts:320`
**Behavior:** Always returns:
```json
{"id":"","name":"No active project","description":"","status":"idle","progress":0,"workers":0,"cost":0}
```
The `workers` and `cost` fields are live (from PoolManager and CostTracker). The `name`, `description`, `status`, and `progress` fields are hardcoded.

### Production Requirement
Must return the currently active plan's name, description, status (planning/approved/building/testing/complete/failed), real progress percentage, and estimated completion.

### Fix Required

**Step 1 — Add active plan state to orchestrator:**
```typescript
// Add property
private activePlan: Plan | null = null;

// Add methods
setActivePlan(plan: Plan): void { this.activePlan = plan; }
getActivePlan(): Plan | null { return this.activePlan; }
```

**Step 2 — Wire dataProvider to active plan:**
```typescript
if (endpoint === 'project') {
  if (this.activePlan) {
    const plan = this.activePlan;
    const stats = this.taskQueue.getQueueStats();
    const progress = stats.total > 0 ? Math.round((stats.complete / stats.total) * 100) : 0;
    return {
      id: plan.id,
      name: plan.goal,
      description: plan.path.description,
      status: plan.status,
      progress,
      workers: this.poolManager?.getAllWorkers().length ?? 0,
      cost: this.costTracker?.getCostToday() ?? 0,
      startedAt: plan.createdAt,
      estimatedCompletion: plan.path.estimatedTime ? new Date(Date.now() + plan.path.estimatedTime.minutes * 60000) : undefined,
    };
  }
  return { id: '', name: 'No active project', ... };
}
```

**Step 3 — Wire plan creation from chat:**
When a user sends a goal via WebSocket and the LLM generates a plan, call `setActivePlan(plan)` and push the plan status to the dashboard via SSE.

**Dependencies:**
- PlanningEngine must be integrated into the main event handling flow
- Plan approval must update the active plan status from 'draft' to 'approved' to 'executing'

**Effort:** Medium — the PlanningEngine and TaskQueue exist, they need to be connected to the event handler and data provider.

---

## FIX 4: `POST /api/project/approve` and `/cancel` — No State Change

### Current State
**File:** `src/core/orchestrator.ts:352-358`
**Behavior:** Returns `{"ok":true,"status":"approved"}` or `{"ok":true,"status":"cancelled"}` but does not modify any state. No plan is approved, no workers spawn.

```typescript
// Current code — purely cosmetic
if (endpoint.startsWith('project/approve:')) {
  log.info('Plan approval requested');
  return { ok: true, status: 'approved' };
}
```

### Production Requirement
- Approve: Set active plan status to 'approved', decompose into tasks, enqueue to TaskQueue, begin spawning workers
- Cancel: Set plan status to 'failed', terminate all active workers, clear task queue

### Fix Required

**Approve:**
```typescript
if (endpoint.startsWith('project/approve:')) {
  if (!this.activePlan) return { ok: false, error: 'No active plan' };
  this.activePlan.status = 'approved';
  this.activePlan.approvedAt = new Date();
  const tasks = this.planningEngine!.decomposePlan(this.activePlan);
  for (const task of tasks) this.taskQueue.enqueue(task);
  this.activePlan.status = 'executing';
  // Begin task dispatch loop
  void this.dispatchTasks();
  return { ok: true, status: 'executing', tasks: tasks.length };
}
```

**Cancel:**
```typescript
if (endpoint.startsWith('project/cancel:')) {
  if (this.activePlan) this.activePlan.status = 'failed';
  this.taskQueue.clear();
  await this.poolManager?.shutdown();
  this.activePlan = null;
  return { ok: true, status: 'cancelled' };
}
```

**New method needed — `dispatchTasks()`:**
Loop that takes ready tasks from the queue, spawns appropriate worker types, assigns tasks, and monitors completion.

**Dependencies:**
- FIX 3 (active plan state) must be done first
- Worker spawning (FIX 8) must be functional

**Effort:** Medium — the queue and pool exist, need a dispatch loop.

---

## FIX 5: `/api/activity` — Always Empty

### Current State
**File:** `src/core/orchestrator.ts:346`
**Behavior:** Returns `[]`. Events are pushed to SSE via `httpServer.pushEvent()` at line 427-432, and stored in `eventBuffer` (max 100), but the `/api/activity` endpoint doesn't read from that buffer.

### Production Requirement
Must return the recent activity feed (same data the SSE stream pushes).

### Fix Required
The `HttpServer` already has `private eventBuffer: DashboardEvent[]` with up to 100 events. Expose it:

**In http-server.ts:**
```typescript
getEventBuffer(): DashboardEvent[] {
  return [...this.eventBuffer];
}
```

**In orchestrator.ts dataProvider:**
```typescript
if (endpoint === 'activity') {
  return this.httpServer.getEventBuffer();
}
```

**Also:** Add `webchat` to the `typeColors` map at orchestrator.ts:422 (currently missing, WebChat events render gray instead of a distinctive color):
```typescript
const typeColors: Record<string, string> = {
  cron: '#fab387', whatsapp: '#a6e3a1', webhook: '#89b4fa',
  api: '#cba6f7', system: '#6c7086', webchat: '#74c7ec',
};
```

**Dependencies:** None — the data already exists.

**Effort:** Trivial — 5 lines of code.

---

## FIX 6: `/api/costs/history` — Always Empty

### Current State
**File:** `src/core/orchestrator.ts:349`
**Behavior:** Returns `[]`. Cost records exist in SQLite (CostTracker stores them), but this endpoint doesn't query them.

### Production Requirement
Must return time-series cost data for dashboard charts (daily totals over last 30 days, or configurable range).

### Fix Required

**In cost-tracker.ts — add new method:**
```typescript
getCostHistory(days = 30): Array<{ date: string; cost: number; tokens: number }> {
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = this.db.prepare(`
    SELECT
      date(timestamp / 1000, 'unixepoch', 'localtime') as date,
      SUM(cost) as cost,
      SUM(input_tokens + output_tokens) as tokens
    FROM usage_records
    WHERE timestamp >= ?
    GROUP BY date
    ORDER BY date
  `).all(start) as Array<{ date: string; cost: number; tokens: number }>;
  return rows;
}
```

**In orchestrator.ts dataProvider:**
```typescript
if (endpoint === 'costs/history') {
  return this.costTracker?.getCostHistory(30) ?? [];
}
```

**Dependencies:** None — SQLite data already exists.

**Effort:** Trivial — one SQL query and one wire-up line.

---

## FIX 7: Chat Does Not Reply Without LLM Key

### Current State
**File:** `src/core/orchestrator.ts:437-444`
**Behavior:** When `ZAI_API_KEY` is not set, `this.gateway` is null. The handler logs the event and skips all LLM processing. No response is ever sent back to the WebSocket client.

```typescript
if (this.gateway) {
  await this.processWithLLM(event);
} else {
  log.info({ eventId: event.id, payload: event.payload },
    'Event processed (LLM gateway not connected)');
}
```

### Production Requirement
The system must have at least one LLM provider configured. For production, `ZAI_API_KEY` is required.

### Fix Required

**For production deployment:**
- Set `ZAI_API_KEY` in `.env` — this is the minimum requirement
- Optionally set `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` for fallback

**For better developer experience without keys:**
Add a fallback that sends an informative message back to the WebSocket client:
```typescript
if (this.gateway) {
  await this.processWithLLM(event);
} else {
  log.info({ eventId: event.id }, 'Event processed (LLM gateway not connected)');
  // Notify WebSocket client
  if (event.type === EventSourceType.WEBCHAT && this.webChatSource) {
    const payload = event.payload as { connectionId?: string };
    const msg = {
      id: crypto.randomUUID(),
      role: 'system' as const,
      content: 'LLM not connected. Set ZAI_API_KEY to enable AI responses.',
      timestamp: new Date(),
      metadata: { type: 'error' as const },
    };
    if (payload.connectionId) {
      await this.webChatSource.sendMessage(payload.connectionId, msg);
    }
  }
}
```

**Also needed — wire processWithLLM to use LLMRouter instead of GLMGateway:**
Currently `processWithLLM()` at line 460 uses `this.gateway!.chat()` (the old GLMGateway). This should be migrated to `this.llmRouter!.route()` to get multi-provider fallback. This is a significant refactor because the request/response shapes differ:

- GLMGateway `chat()` takes `ChatRequest` and returns `ChatResponse`
- LLMRouter `route()` takes `LLMRequest` (with `taskType`) and returns `LLMResponse`

The `processWithLLM` method would need to:
1. Classify the event into a `TaskType`
2. Build an `LLMRequest` instead of a `ChatRequest`
3. Handle `LLMResponse` instead of `ChatResponse`
4. Record cost via `CostTracker.recordUsage()`

**Dependencies:** LLMRouter is built and working, just not wired to the main loop.

**Effort:** Medium — the GLMGateway→LLMRouter migration is the real work.

---

## FIX 8: Worker Pool Never Spawns Real VMs

### Current State
**File:** `src/agents/vibebox-bridge.ts:16-38`
**Behavior:** `spawnVM()` assigns an IP from `192.168.64.x` and attempts an SSH echo command. If SSH fails (no VM running), it logs a warning and continues. The VM is recorded in memory but no actual VM is created.

```typescript
// vibebox-bridge.ts:28-32 — "spawns" but doesn't create
try {
  await this.executeSSH(ip, 'echo "VM alive"');
  log.info({ workerId, ip }, 'VM is responsive');
} catch {
  log.warn({ workerId, ip }, 'VM not yet responsive — will retry on first command');
}
```

### Production Requirement
Must create actual isolated VM instances, either via the `floyd-lab` MCP server (which manages VibeBox VMs) or via direct `macOS Virtualization.framework` / `lima` / `colima` API calls.

### Fix Required

**Option A — Integrate with floyd-lab MCP server:**
The `floyd-lab` MCP tools (`mcp__floyd-lab__spawn_lab`, `mcp__floyd-lab__execute_in_lab`) manage VibeBox VMs. The bridge should call these instead of raw SSH.

**Option B — Direct VM management:**
Use macOS `Virtualization.framework` via a CLI wrapper, or `lima`/`colima` to create lightweight Linux VMs:
```typescript
async spawnVM(workerId: string, config: WorkerConfig): Promise<VMInstance> {
  // Create actual VM via lima
  await execFileAsync('limactl', ['start', '--name', workerId, '--cpus', '2',
    '--memory', `${config.memoryMB}m`, 'template://default']);
  const ip = await this.getVMIP(workerId);
  // Install worker agent inside VM
  await this.executeSSH(ip, 'curl -fsSL https://setup.openfloyd.dev | sh');
  ...
}
```

**Option C — Docker containers instead of VMs (simpler, less isolation):**
Use Docker containers as lightweight worker environments:
```typescript
async spawnVM(workerId: string, config: WorkerConfig): Promise<VMInstance> {
  await execFileAsync('docker', ['run', '-d', '--name', workerId,
    '--memory', `${config.memoryMB}m`, '--cpus', '1',
    'openfloyd-worker:latest']);
  const ip = await this.getContainerIP(workerId);
  ...
}
```

**Dependencies:**
- VM infrastructure must be running on the host
- SSH key at `/Volumes/SanDisk1gb/floyd-sandbox/.vibebox/ssh_key` must be valid
- Worker agent software must be installable inside VMs

**Effort:** Large — this is infrastructure work, not just code.

---

## FIX 9: Vector Search Dead — No Embedding Generation

### Current State
**File:** `src/memory/vector-store.ts:44-49`
**Behavior:** The `store()` method accepts an optional `embedding: Float32Array`. The `search()` method at line 55 queries sqlite-vec with a `Float32Array`. Both work correctly. But nothing in the codebase generates embeddings. Every call to `store()` passes `undefined` for embedding.

### Production Requirement
Must generate vector embeddings for stored memories and query embeddings for search, enabling semantic retrieval.

### Fix Required

**Step 1 — Create embedding service:**
New file `src/memory/embedding-service.ts`:
```typescript
export class EmbeddingService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.z.ai/api/paas/v4') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async embed(text: string): Promise<Float32Array> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: 'embedding-3', input: text }),
    });
    const data = await response.json();
    return new Float32Array(data.data[0].embedding);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Batch embedding for efficiency
    ...
  }
}
```

**Step 2 — Wire into VectorStore:**
Add `embedAndStore(content, metadata)` method that generates embedding then calls `store()`.

**Step 3 — Wire into orchestrator:**
After each LLM interaction, embed and store the conversation turn.

**Step 4 — Wire into ContextManager:**
Before each LLM call, search for relevant memories and inject into working memory.

**Dependencies:**
- Z.ai embedding API (or alternative like OpenAI `text-embedding-3-small`)
- API key with embedding access

**Effort:** Medium — API call is simple, but wiring into the full conversation loop requires careful context management.

---

## FIX 10: Memory Consolidation — No Merge/Summarize

### Current State
**File:** `src/memory/consolidation.ts:51-69`
**Behavior:** `run()` counts entries, prunes if over limit, returns `{ pruned: N, consolidated: 0 }`. The `consolidated` variable is declared but never incremented. No merge or summarize logic exists.

```typescript
// consolidation.ts:57 — always 0
let consolidated = 0;
// Line 59-61 — only pruning
if (entryCount > this.maxEntries) {
  pruned = this.store.prune(this.maxEntries, this.minImportance);
}
// consolidated is never assigned
```

### Production Requirement
Must identify semantically similar memories, merge duplicates, and use the LLM to summarize clusters of related memories into consolidated entries.

### Fix Required

**Step 1 — Semantic deduplication:**
```typescript
// After pruning, find near-duplicates via vector search
const entries = this.store.getAll();
for (const entry of entries) {
  if (!entry.embedding) continue;
  const similar = this.store.search(entry.embedding, 5);
  for (const match of similar) {
    if (match.id !== entry.id && match.distance < 0.1) {
      // Merge: keep higher importance, combine content
      this.store.delete(match.id);
      consolidated++;
    }
  }
}
```

**Step 2 — LLM summarization:**
Pass the consolidation engine an LLMRouter reference. When clusters of 5+ related memories exist, call the LLM to summarize them into one entry.

**Dependencies:**
- FIX 9 (embeddings) must be done first — can't find similar memories without vectors
- LLM access for summarization

**Effort:** Medium — requires embeddings working first.

---

## FIX 11: WhatsApp Client — Blocked Upstream

### Current State
**File:** `src/messaging/whatsapp-client.ts:96`
**Behavior:** Imports `@whiskeysockets/baileys` and attempts to create a socket connection. Documented as blocked due to upstream Baileys library issues.

### Production Requirement
Must connect to WhatsApp, receive messages from whitelisted numbers, and send responses.

### Fix Required

**Option A — Wait for Baileys fix:**
Monitor `@whiskeysockets/baileys` releases. The library has known instability with WhatsApp protocol changes.

**Option B — Alternative WhatsApp library:**
- `whatsapp-web.js` (Puppeteer-based, heavier)
- Official WhatsApp Business API (requires Meta approval, costs money, but stable)
- `green-api.com` or similar WhatsApp gateway service

**Option C — Replace with Telegram (more reliable for bots):**
Telegram Bot API is stable, well-documented, free. Add `TelegramEventSource` using the `node-telegram-bot-api` package.

**Dependencies:** External — depends on upstream library stability or platform choice.

**Effort:** Medium for alternative library, Large for WhatsApp Business API.

---

## FIX 12: OpenAI and Anthropic Streaming

### Current State
**File:** `src/llm/providers/openai-provider.ts:107-111`
**File:** `src/llm/providers/anthropic-provider.ts:134-138`
**Behavior:** Both `stream()` methods log a warning and yield a single `{finishReason:'stop'}`. No actual streaming occurs.

The GLM provider at `src/llm/providers/glm-provider.ts:117-154` has a working SSE stream implementation.

### Production Requirement
Must stream LLM responses token-by-token for real-time display on the dashboard.

### Fix Required

**OpenAI streaming (follow GLM pattern):**
```typescript
async *stream(request: ProviderRequest): AsyncIterable<ProviderChunk> {
  const body = { ...requestBody, stream: true };
  const response = await fetch(`${this.baseUrl}/chat/completions`, { ... });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    buffer += decoder.decode(result.value as Uint8Array, { stream: true });
    // Parse SSE lines, yield content deltas (same pattern as glm-provider.ts:136-154)
  }
}
```

**Anthropic streaming:**
Anthropic uses a different SSE format (`event: content_block_delta`, `data: {"type":"content_block_delta","delta":{"text":"..."}}`). Must parse Anthropic's event types.

**Dependencies:** API keys for testing.

**Effort:** Small — the SSE parsing pattern exists in the GLM provider, adapt for each provider's format.

---

## FIX 13: Dashboard Pie/Bar Charts — Text Only

### Current State
**File:** `public/index.html`
**Behavior:** Cost breakdown by provider and project is displayed as text rows. No visual charts.

### Production Requirement
Pie chart for cost by provider. Bar chart for cost by project. Visual, not text.

### Fix Required

**Add Chart.js CDN:**
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
```

**Add canvas elements:**
```html
<canvas id="providerChart" height="150"></canvas>
<canvas id="projectChart" height="150"></canvas>
```

**In fetchCosts(), render charts:**
```javascript
new Chart(document.getElementById('providerChart'), {
  type: 'doughnut',
  data: { labels: Object.keys(data.byProvider), datasets: [{ data: Object.values(data.byProvider) }] },
  options: { plugins: { legend: { labels: { color: '#cdd6f4' } } } }
});
```

**Dependencies:** Chart.js CDN (or bundle locally).

**Effort:** Small — straightforward Chart.js integration.

---

## FIX 14: `processWithLLM` Uses Old GLMGateway Instead of LLMRouter

### Current State
**File:** `src/core/orchestrator.ts:460-550`
**Behavior:** The main event processing loop calls `this.gateway!.chat()` using the old `GLMGateway` class. The new `LLMRouter` with multi-provider support is initialized but only used by the `PlanningEngine` and `BrandVoiceManager`.

### Production Requirement
All LLM calls should go through the LLMRouter for fallback support, cost tracking, and concurrency management.

### Fix Required

**Rewrite `processWithLLM` to use LLMRouter:**
1. Classify event into TaskType (WebChat → PLANNING, CRON → FAST, etc.)
2. Build `LLMRequest` instead of calling `this.gateway.chat()`
3. Handle `LLMResponse` (which includes cost)
4. Record usage via `this.costTracker.recordUsage()`
5. Remove `this.gateway` property and `GLMGateway` import

**This is the single most impactful fix** because it enables:
- Multi-model fallback (GLM fails → Anthropic takes over)
- Automatic cost tracking for all LLM calls
- Per-task-type model selection
- Concurrency management

**Dependencies:** LLMRouter is built and tested. Just needs to replace the gateway in the hot path.

**Effort:** Medium — the request/response shape change requires careful rewrite of the 90-line processWithLLM method.

---

## PRIORITY ORDER FOR PRODUCTION

```
┌─────┬─────────────────────────────────────┬────────┬──────────────────────────────────┐
│ Fix │ Item                                │ Effort │ Why This Order                   │
├─────┼─────────────────────────────────────┼────────┼──────────────────────────────────┤
│  5  │ /api/activity — expose eventBuffer  │ Trivial│ 5 lines, instant dashboard value │
│  6  │ /api/costs/history — add SQL query  │ Trivial│ 1 query, enables cost charts     │
│  7  │ Chat no-LLM feedback message       │ Trivial│ Better DX without API keys       │
│ 14  │ processWithLLM → LLMRouter         │ Medium │ Unlocks multi-model + cost track │
│  1  │ web_search → WebResearchTool       │ Small  │ Wire existing code, +API key     │
│ 12  │ OpenAI/Anthropic streaming          │ Small  │ Pattern exists in GLM provider   │
│ 13  │ Dashboard charts (Chart.js)         │ Small  │ Visual improvement               │
│  3  │ /api/project — live plan state     │ Medium │ Dashboard shows real progress     │
│  4  │ approve/cancel — state changes     │ Medium │ User can approve plans            │
│  9  │ Embedding service                   │ Medium │ Enables semantic memory           │
│ 10  │ Memory consolidation merge          │ Medium │ Requires embeddings (Fix 9)      │
│  2  │ execute_code → WASM sandbox        │ Medium │ Requires WASM module binaries    │
│  8  │ Worker VM spawning                  │ Large  │ Infrastructure dependency        │
│ 11  │ WhatsApp                            │ Large  │ Blocked upstream                  │
└─────┴─────────────────────────────────────┴────────┴──────────────────────────────────┘
```

Fixes 5, 6, and 7 can each be done in under 10 minutes. Fix 14 is the highest-impact medium-effort item. Fixes 1 and 12 are small because the patterns already exist in the codebase. Fixes 8 and 11 are infrastructure-dependent and cannot be completed with code alone.
