# OPEN-FLOYD

Autonomous, persistent, LLM-driven orchestration framework. Runs 24/7 via CRON triggers and WhatsApp messaging, powered by GLM-5-Turbo with WASM-sandboxed tool execution and vector memory.

## Quick Start

```bash
# Prerequisites: Node.js 22+, npm
npm install
cp .env.example .env        # Fill in your API keys
npm run build
npm start                    # Dashboard at http://localhost:3000
```

## Development

```bash
npm run dev          # Watch mode with auto-rebuild
npm test             # Run all 133 tests
npm run typecheck    # Type check without emitting
npm run lint         # ESLint
npm run format       # Prettier
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|---|---|---|
| `ZAI_API_KEY` | Yes | GLM-5-Turbo API key from Z.ai |
| `GLM_MODEL` | No | Model name (default: `glm-5-turbo`) |
| `WHATSAPP_ALLOWED_NUMBERS` | No | Comma-separated phone numbers with country code |
| `SQLITE_DB_PATH` | No | Path to memory database (default: `workspace/memory.db`) |
| `REDIS_URL` | No | Redis connection URL (default: none) |
| `LOG_LEVEL` | No | `trace` / `debug` / `info` / `warn` / `error` (default: `info`) |
| `PORT` | No | HTTP server port (default: `3000`) |

## Architecture

```
src/
  core/           State machine, event loop, orchestrator, HTTP server
  llm/            GLM-5-Turbo gateway, context manager, prompt cache
  messaging/      WhatsApp client (Baileys), auth, rate-limited message queue
  execution/      WASM sandbox (Extism), MCP client, tool registry
  memory/         SQLite + sqlite-vec vector store, Redis cache, consolidation
  parser/         Markdown config parser (HEARTBEAT.md, SOUL.md), CRON scheduler
  types/          Shared TypeScript interfaces
  utils/          Logger (pino), token counter
```

Event flow: **Trigger** (CRON / WhatsApp / Webhook) &rarr; **Event Loop** (priority queue) &rarr; **State Machine** &rarr; **LLM Gateway** (multi-turn reasoning) &rarr; **Tool Execution** (MCP/WASM) &rarr; **Response** (WhatsApp / log)

## Dashboard

The web dashboard at `http://localhost:3000` provides:

- Real-time agent state and event log (SSE-powered)
- LLM token usage and cost tracking
- Full configuration page (14 LLM providers, 12 container providers)
- Visual theme customization (backgrounds, card styling, agent avatars)

## Docker

```bash
docker compose up -d    # Starts agent + Redis
```

## Configuration

User-facing config lives in `workspace/`:
- `HEARTBEAT.md` &mdash; CRON schedules and automated actions
- `SOUL.md` &mdash; Agent identity, directives, security constraints

System config: `config/default.json`

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 LTS, TypeScript 5.4+ |
| LLM | GLM-5-Turbo (Z.ai API) |
| Messaging | Baileys (WhatsApp Web) |
| Execution | Extism (WebAssembly), MCP protocol |
| Memory | SQLite + sqlite-vec, Redis |
| Scheduling | node-cron |
| Logging | pino |

## Docs

- [Project Roadmap](docs/ROADMAP.md)
- [Original Specification](docs/ORIGINAL-SPEC.md)

## License

MIT
