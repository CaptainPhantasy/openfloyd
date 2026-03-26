# OpenFloyd SKILLS Catalog

> Skills extend OpenFloyd's capabilities by teaching it HOW to combine tools for specific domains.
> Reference this file when the user mentions a skill or its domain.

## Tool Sources

OpenFloyd has THREE sources of tools:

| Source | Examples | How to Use |
|--------|----------|------------|
| **Built-in** | `web_search`, `web_reader`, `execute_code`, `exec`, `read_file`, `write_file`, `edit_file`, `browser_navigate`, `memory_store`, `memory_search`, `weather`, `tavily_search`, `cron_manage` | Direct tool call |
| **Rube MCP (Composio)** | Gmail, Slack, GitHub, Notion, Google Calendar, Drive, Sheets, WhatsApp, and 500+ more | Use `rube_mcp` tool or reference Rube tool slugs |
| **Gateway (Omega/Hivemind)** | `omega_strategize`, `hivemind_submit_task`, `pattern_detect`, `devtools_test_generator` | Direct tool call |

---

## TOP 20 SKILLS (Ranked by ClawHub Downloads)

### 1. GOG — Google Workspace Integration
**Downloads:** 14,313 | **Category:** Development

**What it does:** Gmail, Calendar, Drive, Docs, Sheets, Tasks.

**Tools used:**
- `GMAIL_SEND_EMAIL` / `GMAIL_FETCH_EMAILS` (Rube MCP)
- `GOOGLE_CALENDAR_*` (Rube MCP)
- `GOOGLE_DRIVE_*` (Rube MCP)
- `GOOGLESHEETS_*` (Rube MCP)

**When user says:** "check my email", "schedule a meeting", "upload to Drive", "create a doc"

**Workflow:**
1. Use Rube MCP to connect to Google Workspace
2. Call appropriate tool slug (e.g., `GMAIL_FETCH_EMAILS`)
3. Parse and present results

---

### 2. GITHUB — GitHub Integration
**Downloads:** 10,611 | **Category:** Development

**What it does:** Repos, PRs, Issues, Actions, code management.

**Tools used:**
- `GITHUB_CREATE_ISSUE` / `GITHUB_LIST_REPOS` (Rube MCP)
- `exec` (for `gh` CLI fallback)

**When user says:** "check PR", "create issue", "run Actions", "merge PR", "list repos"

**Workflow:**
1. Use Rube MCP GitHub tools for API operations
2. Fall back to `exec` with `gh` CLI if Rube unavailable
3. Parse and present results

---

### 3. AGENT BROWSER — Browser Automation
**Downloads:** 11,836 | **Category:** Web

**What it does:** Web scraping, form filling, screenshots, page navigation.

**Tools used:**
- `browser_navigate` (built-in) — navigate, click, fill forms, screenshot
- `web_reader` (built-in) — fetch page content (fallback)

**When user says:** "browse to", "fill out form", "take screenshot", "click button", "scrape this page"

**Workflow:**
1. Use `browser_navigate` with action parameter
2. Actions: `navigate`, `click`, `fill`, `screenshot`, `extract`, `scroll`
3. Return structured content or image

---

### 4. SUMMARIZE — Text Summarization
**Downloads:** 10,956 | **Category:** Productivity

**What it does:** Condense long documents, meeting notes, articles into key points.

**Tools used:**
- LLM native capability (no external tool needed)
- `web_reader` (to fetch content from URLs)

**When user says:** "summarize this", "tl;dr", "give me the key points", "condense"

**Workflow:**
1. Receive text or fetch via `web_reader`
2. Use LLM to extract key points
3. Return: { title, key_points: [], summary: string }

---

### 5. TAVILY WEB SEARCH — AI-Optimized Search
**Downloads:** 8,142 | **Category:** Development

**What it does:** AI-optimized web search with citations, better than generic search for agents.

**Tools used:**
- `tavily_search` (built-in) — Tavily API with AI-optimized results
- `web_search` (built-in fallback)

**When user says:** "search for", "find information about", "research", "look up"

**Workflow:**
1. Call `tavily_search` with query
2. Returns results with source URLs and content snippets
3. Fall back to `web_search` if Tavily unavailable

---

### 6. OBSIDIAN — Knowledge Base Integration
**Downloads:** 5,791 | **Category:** Productivity

**What it does:** Obsidian vault integration for knowledge management and note-taking.

**Tools used:**
- `read_file` (built-in) — read markdown notes
- `write_file` (built-in) — create/update notes
- `edit_file` (built-in) — modify existing notes

**When user says:** "save this note", "search my notes", "create daily note", "link ideas"

**Workflow:**
1. Use `read_file` / `write_file` to access vault at configured path
2. Search notes via `exec` with grep
3. Create daily notes at `daily/YYYY-MM-DD.md`

---

### 7. NOTION — Workspace Integration
**Downloads:** 23k (MCP) | **Category:** Productivity

**What it does:** Notion workspace: pages, databases, tasks, team wiki.

**Tools used:**
- Notion tools via Rube MCP (Composio)

**When user says:** "update Notion", "create page in Notion", "query database", "sync task"

**Workflow:**
1. Use Rube MCP to connect to Notion
2. Call appropriate Notion tool slug
3. Parse and present results

---

### 8. SLACK — Team Messaging
**Downloads:** 17.7k (MCP) | **Category:** Communication

**What it does:** Send messages, manage channels, search history.

**Tools used:**
- `SLACK_SEND_MESSAGE` (Rube MCP)
- `SLACK_SEARCH_MESSAGES` (Rube MCP)

**When user says:** "message #channel", "notify team", "check Slack", "post update"

**Workflow:**
1. Use Rube MCP Slack tools
2. Post messages, search history, manage channels

---

### 9. CAPABILITY EVOLVER — AI Self-Evolution
**Downloads:** 35,581 | **Category:** AI/ML

**What it does:** Continuously enhances agent capabilities through feedback and learning.

**Tools used:**
- `memory_store` (built-in) — store learnings
- `memory_search` (built-in) — retrieve past learnings
- `omega_evolve` (gateway) — evolve capabilities

**When user says:** "improve yourself", "learn from this", "get better at X"

**Workflow:**
1. Store interaction outcome via `memory_store`
2. Analyze patterns via `memory_search`
3. Update strategies via `omega_evolve`

---

### 10. SELF-IMPROVING-AGENT — Performance Auto-Enhancement
**Downloads:** 15,962 | **Category:** AI/ML

**What it does:** Auto-enhances performance over time by tracking metrics.

**Tools used:**
- `memory_store` / `memory_search` (built-in)
- `hivemind_submit_task` / `hivemind_complete_task` (gateway)

**When user says:** "optimize this workflow", "how can you improve", "track your performance"

**Workflow:**
1. Log task metrics via `memory_store`
2. Analyze patterns via `memory_search`
3. Generate optimization suggestions

---

### 11. WACLI — WhatsApp Integration
**Downloads:** 16,415 | **Category:** Utility

**What it does:** WhatsApp messaging and notifications.

**Tools used:**
- WhatsApp tools via Rube MCP (Composio)

**When user says:** "send WhatsApp", "message on WhatsApp", "WhatsApp notification"

**Workflow:**
1. Use Rube MCP WhatsApp tools
2. Send messages, manage conversations

---

### 12. BYTEROVER — Multi-Purpose Task Handler
**Downloads:** 16,004 | **Category:** Utility

**What it does:** General automation and diverse task processing.

**Tools used:**
- `exec` (built-in) — run commands
- `web_reader` (built-in) — fetch data
- `write_file` (built-in) — save results
- Any Rube MCP tool as needed

**When user says:** "handle this", "process these", "automate that"

**Workflow:**
1. Analyze task type
2. Select appropriate tool chain
3. Execute with error handling

---

### 13. HUMANIZE AI TEXT — Natural Text Generation
**Downloads:** 8,771 | **Category:** Productivity

**What it does:** Transform AI-generated text to sound more natural and human-like.

**Tools used:**
- LLM native capability (no external tool needed)

**When user says:** "make this sound human", "humanize this", "rewrite naturally"

**Workflow:**
1. Receive AI-generated text
2. Apply humanization via LLM prompting
3. Return natural-sounding text

---

### 14. WEATHER — Weather Information
**Downloads:** 9,002 | **Category:** Location

**What it does:** Real-time weather data and forecasting.

**Tools used:**
- `weather` (built-in) — OpenWeatherMap API

**When user says:** "what's the weather", "will it rain", "forecast for tomorrow"

**Workflow:**
1. Call `weather` with location
2. Returns conditions, temperature, forecast
3. Present formatted weather data

---

### 15. FIND SKILLS — Skill Discovery
**Downloads:** 7,077 | **Category:** Utility

**What it does:** Find and discover new skills from the catalog.

**Tools used:**
- `web_search` (built-in) — search ClawHub
- `web_reader` (built-in) — fetch skill details

**When user says:** "find a skill for X", "what skills do you have", "search skills"

**Workflow:**
1. Search this SKILLS.md for matching capabilities
2. Optionally search ClawHub for new skills
3. Return matching skills with descriptions

---

### 16. PROACTIVE AGENT — Autonomous Task Execution
**Downloads:** 7,010 | **Category:** AI/ML

**What it does:** Anticipates needs and acts autonomously on schedule.

**Tools used:**
- `cron_manage` (built-in) — schedule tasks
- `memory_store` / `memory_search` (built-in) — context

**When user says:** "stay ahead of this", "anticipate my needs", "proactively do X"

**Workflow:**
1. Analyze patterns from memory
2. Schedule proactive checks via `cron_manage`
3. Execute and report completed actions

---

### 17. AUTO-UPDATER SKILL — Skill Maintenance
**Downloads:** 6,601 | **Category:** AI/ML

**What it does:** Keeps skills and system current and secure.

**Tools used:**
- `exec` (built-in) — run git pull, npm update
- `read_file` / `write_file` (built-in) — update skill files

**When user says:** "update skills", "check for updates", "refresh capabilities"

**Workflow:**
1. Check for updates via `exec`
2. Pull latest changes
3. Log updates to memory

---

### 18. SONOSCLI — Smart Audio Control
**Downloads:** 10,304 | **Category:** Media

**What it does:** Sonos audio system control for smart home.

**Tools used:**
- `exec` (built-in) — run sonoscli commands

**When user says:** "play music", "turn up volume", "Sonos control", "pause audio"

**Workflow:**
1. Execute sonoscli via `exec`
2. Control playback, volume, queue

---

### 19. NANO BANANA PRO — Advanced Text Processing
**Downloads:** 5,704 | **Category:** Productivity

**What it does:** Document analysis, entity extraction, content manipulation.

**Tools used:**
- `execute_code` (built-in) — run NLP scripts
- LLM native capability

**When user says:** "analyze this document", "extract entities", "process text"

**Workflow:**
1. Receive text input
2. Process via LLM or execute_code
3. Return structured analysis

---

### 20. FREE RIDE — Unlimited AI Access
**Downloads:** 7,927 | **Category:** AI/ML

**What it does:** Extended AI capabilities via multiple model access.

**Tools used:**
- LLM native capability (multiple providers configured)
- `web_search` (built-in) — supplementary research

**When user says:** "use another AI", "get another opinion", "try different model"

**Workflow:**
1. Route request to alternative model
2. Compare or aggregate results
3. Return enhanced response

---

## SKILL-TOOL COVERAGE MATRIX

| Skill | Built-in Tools | Rube MCP | Gateway | LLM Native |
|-------|---------------|----------|---------|------------|
| 1. Gog | web_reader | Gmail, Calendar, Drive, Sheets | | |
| 2. Github | exec (gh CLI) | GitHub API | | |
| 3. Agent Browser | browser_navigate, web_reader | | | |
| 4. Summarize | web_reader | | | ✅ |
| 5. Tavily Search | tavily_search, web_search | | | |
| 6. Obsidian | read_file, write_file, edit_file | | | |
| 7. Notion | | Notion | | |
| 8. Slack | | Slack | | |
| 9. Capability Evolver | memory_store, memory_search | | omega_evolve | |
| 10. Self-Improving | memory_store, memory_search | | hivemind | |
| 11. Wacli | | WhatsApp | | |
| 12. ByteRover | exec, web_reader, write_file | (any) | | |
| 13. Humanize AI | | | | ✅ |
| 14. Weather | weather | | | |
| 15. Find Skills | web_search, web_reader | | | |
| 16. Proactive Agent | cron_manage, memory_store | | | |
| 17. Auto-Updater | exec, read_file, write_file | | | |
| 18. Sonoscli | exec | | | |
| 19. Nano Banana | execute_code | | | ✅ |
| 20. Free Ride | web_search | | | ✅ |

## ADDING NEW SKILLS

1. Add entry to this file with: name, tools used, workflow
2. Ensure all referenced tools exist (built-in, Rube MCP, or gateway)
3. Update the coverage matrix above
