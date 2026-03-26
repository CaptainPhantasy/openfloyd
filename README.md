# OPEN-FLOYD

Autonomous, persistent, LLM-driven orchestration framework. Runs 24/7 via CRON triggers and WhatsApp messaging, powered by GLM-5-Turbo with WASM-sandboxed tool execution and vector memory.

## Quick Start

```bash
# Prerequisites: Node.js 22+, npm
npm install
cp .env.example .env        # Fill in your API keys
npm run build
npm start                    # Dashboard at http://localhost:8787
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
| `RUBE_MCP_URL` | No | Remote MCP endpoint for Rube (default: `https://rube.app/mcp`) |
| `RUBE_MCP_TOKEN` | No | Bearer token for Rube MCP authorization |
| `SMTP_HOST` | No | SMTP host for outbound email |
| `SMTP_PORT` | No | SMTP port (typically `587` or `465`) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password/app password |
| `SMTP_FROM` | No | Sender email address (e.g. `floyd@legacyai.space`) |
| `EMAIL_ALLOWED_RECIPIENTS` | No | Comma-separated hard allowlist for outbound recipients |
| `IMAP_HOST` | No | IMAP host for inbound mailbox polling |
| `IMAP_PORT` | No | IMAP port (typically `993`) |
| `IMAP_USER` | No | IMAP username |
| `IMAP_PASS` | No | IMAP password/app password |
| `EMAIL_ALLOWED_SENDERS` | No | Comma-separated allowlist for accepted inbound sender addresses |
| `WHATSAPP_ALLOWED_NUMBERS` | No | Comma-separated phone numbers with country code |
| `SQLITE_DB_PATH` | No | Path to memory database (default: `workspace/memory.db`) |
| `REDIS_URL` | No | Redis connection URL (default: none) |
| `LOG_LEVEL` | No | `trace` / `debug` / `info` / `warn` / `error` (default: `info`) |
| `PORT` | No | HTTP server port (default: `8787`) |

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

Event flow: **Trigger** (CRON / WhatsApp / Webhook) &rarr; **Event Loop** (priority queue) &rarr; **State Machine** &rarr; **LLM Gateway** (multi-turn reasoning) &rarr; **Tool Execution** (MCP/WASM, including optional remote Rube MCP) &rarr; **Response** (messaging / log)

## Dashboard

The web dashboard at `http://localhost:8787` provides:

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

### Rube MCP (optional)

Set:
- `RUBE_MCP_URL=https://rube.app/mcp`
- `RUBE_MCP_TOKEN=<secret bearer token>`

Then use tool `rube_mcp` with:
- `action: "list_tools"` to enumerate remote capabilities first
- `action: "call_tool"` with `tool_name` and `arguments`

Security:
- Never commit tokens.
- Keep `RUBE_MCP_TOKEN` in secret env storage only.

### Email sending with strict allowlist

Built-in tool: `send_email`

Required env:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `EMAIL_ALLOWED_RECIPIENTS` (default intended: `douglas@floydlabs.com,douglas.talley@legacyai.space`)

Behavior:
- `send_email` rejects any recipient not in `EMAIL_ALLOWED_RECIPIENTS`.
- Supports `to`, optional `cc`/`bcc`, `subject`, `body`, optional `html`.
- If SMTP credentials are missing, tool reports unavailable without sending.

### Email receiving (optional IMAP)

Built-in event source: `email-imap` (enabled when IMAP env is set)

Required env:
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASS`
- `EMAIL_ALLOWED_SENDERS` (default intended: `douglas@floydlabs.com,douglas.talley@legacyai.space`)

Behavior:
- Polls INBOX for unseen messages.
- Ignores and marks seen any sender not in `EMAIL_ALLOWED_SENDERS`.
- Creates agent events from allowed inbound emails.
- Agent replies through `send_email`, so outbound allowlist still applies.

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
