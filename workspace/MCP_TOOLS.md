# MCP Tools Reference

This document catalogs available advanced tools. **Reference this when you need capabilities beyond core built-ins.**

---

## Omega Reasoning (Advanced Cognition)

Use these when facing complex decisions, deep analysis, or multi-perspective evaluation.

| Tool | When to Use | Parameters |
|------|-------------|------------|
| `omega_strategize` | Complex architectural decisions, trade-off analysis | `{current_situation, dilemma, desired_perspective}` |
| `omega_rlm` | Deep recursive reasoning on complex problems | `{query, depth}` (1-5) |
| `omega_adjudicate` | Competing options with trade-offs | `{conflict_description, opposing_forces}` |
| `omega_learn` | Learn from examples to improve decisions | `{query, examples}` |
| `omega_reflect` | Self-reflection on your reasoning chains | `{chain_id}` |
| `omega_evolve` | Trigger capability growth from feedback | `{domain, feedback}` |

**Example invocation:**
```
tool_call: omega_strategize
params: {
  current_situation: "Need to choose between REST and GraphQL",
  dilemma: "REST is simpler but GraphQL is more flexible for complex queries",
  desired_perspective: "performance"
}
```

---

## Hivemind Orchestration (Multi-Agent Coordination)

Use these when coordinating multiple agents, tracking distributed tasks, or managing complex workflows.

| Tool | When to Use | Parameters |
|------|-------------|------------|
| `hivemind_submit_task` | Delegate a task for agent distribution | `{description, priority}` |
| `hivemind_list_tasks` | See all tasks in the system | `{state}` (pending/in_progress/completed) |
| `hivemind_get_task_status` | Check specific task progress | `{task_id}` |
| `hivemind_complete_task` | Mark a task done | `{task_id, result}` |
| `hivemind_register_agent` | Register a new agent capability | `{id, name, type}` |
| `hivemind_collaborate` | Create multi-agent collaboration | `{participants, task_id}` |
| `hivemind_send_message` | Send message in collaboration | `{collaboration_id, from, content}` |
| `hivemind_get_stats` | Get hive statistics | `{}` |

**Example invocation:**
```
tool_call: hivemind_submit_task
params: {
  description: "Analyze codebase for security vulnerabilities",
  priority: 8
}
```

---

## Pattern Memory (Experience Store)

Use these when you want to learn from past experiences, store reusable patterns, or find solutions to similar problems.

| Tool | When to Use | Parameters |
|------|-------------|------------|
| `pattern_detect` | Store a reusable code pattern | `{code, language, context}` |
| `pattern_store_episode` | Save a problem-solving experience | `{trigger, reasoning, solution, outcome}` |
| `pattern_retrieve_episodes` | Find similar past problems | `{query, max_results}` |
| `pattern_list` | List stored patterns | `{min_quality}` |
| `pattern_adapt` | Adapt stored pattern to current context | `{query, current_context}` |

**Example invocation:**
```
tool_call: pattern_store_episode
params: {
  trigger: "TypeScript build failing after git pull",
  reasoning: "Found that package-lock.json was out of sync with package.json",
  solution: "Deleted node_modules and package-lock.json, ran npm install",
  outcome: "success"
}
```

---

## Devtools (Code Analysis)

Use these when analyzing code quality, dependencies, or generating tests.

| Tool | When to Use | Parameters |
|------|-------------|------------|
| `devtools_test_generator` | Generate tests from source code | `{source_code, framework}` |
| `devtools_dependency_analyzer` | Analyze code dependencies | `{project_path, language}` |
| `devtools_git_bisect` | Find breaking commits | `{good_commit, bad_commit}` |
| `devtools_build_error` | Correlate build errors | `{errors}` |

---

## Decision Guide

**Ask yourself:**
- Is this a complex decision with trade-offs? → `omega_strategize` / `omega_adjudicate`
- Do I need deeper reasoning? → `omega_rlm`
- Am I delegating or tracking tasks? → `hivemind_*`
- Have I solved something like this before? → `pattern_retrieve_episodes`
- Is this worth remembering for future? → `pattern_store_episode`
- Do I need test coverage? → `devtools_test_generator`

**When in doubt:** Reference this document. It's your catalog of advanced capabilities.
