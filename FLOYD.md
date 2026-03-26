# PROJECT CONTRACT — OpenFloyd

> This file was initialized from the Floyd scaffold template.
> Global rules (tool protocol, mega-skills, table format, sandbox, ecosystem) are inherited from `~/.floyd/agent/FLOYD.md` and do NOT need to be duplicated here.

## PROJECT DETAILS
- **Name**: OpenFloyd
- **Description**: Autonomous, persistent, LLM-driven orchestration framework. Runs 24/7 via CRON triggers and WhatsApp messaging, powered by GLM-5-Turbo with WASM-sandboxed tool execution and vector memory.
- **Primary Language**: TypeScript
- **Framework**: Node.js 22+ with Extism WASM integration

## PROJECT STRUCTURE
- **Source**: `src/`
- **Tests**: `tests/`
- **Config**: `tsconfig.json`, `.eslintrc.json`, `.prettierrc`
- **Schema**: `workspace/memory.db` (SQLite)
- **Docker**: `docker/`, `docker-compose.yml`
- **Public**: `public/`

## PROJECT-SPECIFIC RULES
- WhatsApp Baileys: Session state persisted in `wa_auth/`
- SQLite: Use `better-sqlite3` with `sqlite-vec` for vector search
- WASM plugins: All plugin execution sandboxed via Extism
- Cron jobs: Schedule via `node-cron` in `src/scheduler/`
- Ngrok tunnels: `floyd-mobile` (8765) for mobile UI, `floyd-api` (3001) for API

## BUILD & VERIFY COMMANDS
- **Type Check**: `npm run typecheck`
- **Test**: `npm test` (133 tests)
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Start**: `REDIS_URL= PORT=8788 node dist/index.js` (Dashboard at http://localhost:8788)
- **Dev**: `npm run dev` (watch mode)

## KNOWN PATTERNS & LESSONS
- [build-restart]: After every `npm run build`, kill and restart the agent: `pkill -9 -f 'node dist/index.js' && REDIS_URL= PORT=8788 node dist/index.js &`
- [port-conflict]: OrbStack uses port 8787. Agent runs on **8788**. Redis is Docker-only — unset `REDIS_URL` for local dev.
- [ngrok-mobile]: Remote access uses `floyd-mobile.ngrok.dev` for mobile interface on port 8765

---
**Context Singularity: ACTIVE**
