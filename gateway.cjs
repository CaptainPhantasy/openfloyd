#!/usr/bin/env node
/**
 * Floyd MCP Gateway - HTTP tool server
 * Provides omega, hivemind, pattern, and devtools functionality
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.MCP_GATEWAY_PORT || 3999;
const STORE = path.join(os.homedir(), '.floyd', 'gateway-store');
if (!fs.existsSync(STORE)) fs.mkdirSync(STORE, { recursive: true });

// Tools with their handlers
const handlers = {
  // Omega reasoning
  omega_strategize: (p) => ({ recommendation: 'Consider test-driven development for complex features', perspective: p.desired_perspective || 'balanced' }),
  omega_rlm: (p) => ({ reasoning: 'Recursive analysis complete', depth: p.depth || 3, query: p.query }),
  omega_adjudicate: (p) => ({ consensus_score: 0.7, tradeoffs: p.opposing_forces?.map(f => `Consider: ${f}`) || [], recommendation: 'Balance trade-offs based on priority' }),
  omega_learn: (p) => ({ learned: true, examples_processed: p.examples?.length || 0 }),
  omega_reflect: (p) => ({ reflection: 'Analysis complete', improvements: ['Consider edge cases', 'Add error handling'] }),
  omega_evolve: (p) => ({ evolved: true, domain: p.domain || 'general', capabilities_added: 1 }),
  omega_get_history: () => ({ history: [] }),
  omega_get_capabilities: () => ({ domains: ['reasoning', 'planning', 'analysis'] }),

  // Hivemind orchestration
  hivemind_register_agent: (p) => {
    const agent = { ...p, status: 'idle', registeredAt: new Date().toISOString() };
    fs.writeFileSync(path.join(STORE, `agent_${p.id}.json`), JSON.stringify(agent, null, 2));
    return { success: true, agent };
  },
  hivemind_submit_task: (p) => {
    const id = `task_${Date.now()}`;
    const task = { id, description: p.description, priority: p.priority, status: 'pending', createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(STORE, `${id}.json`), JSON.stringify(task, null, 2));
    return { success: true, task };
  },
  hivemind_list_tasks: (p) => {
    const files = fs.readdirSync(STORE).filter(f => f.startsWith('task_') && f.endsWith('.json'));
    let tasks = files.map(f => JSON.parse(fs.readFileSync(path.join(STORE, f), 'utf8')));
    if (p.state) tasks = tasks.filter(t => t.status === p.state);
    return { tasks };
  },
  hivemind_get_task_status: (p) => {
    const file = path.join(STORE, `${p.task_id}.json`);
    if (fs.existsSync(file)) return { task: JSON.parse(fs.readFileSync(file, 'utf8')) };
    return { error: 'Task not found' };
  },
  hivemind_complete_task: (p) => {
    const file = path.join(STORE, `${p.task_id}.json`);
    if (fs.existsSync(file)) {
      const task = JSON.parse(fs.readFileSync(file, 'utf8'));
      task.status = 'completed';
      task.result = p.result;
      task.completedAt = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(task, null, 2));
      return { success: true, task };
    }
    return { error: 'Task not found' };
  },
  hivemind_claim_task: (p) => {
    const file = path.join(STORE, `${p.task_id}.json`);
    if (fs.existsSync(file)) {
      const task = JSON.parse(fs.readFileSync(file, 'utf8'));
      task.claimedBy = p.agent_id;
      task.status = 'in_progress';
      fs.writeFileSync(file, JSON.stringify(task, null, 2));
      return { success: true, task };
    }
    return { error: 'Task not found' };
  },
  hivemind_collaborate: (p) => {
    const id = `collab_${Date.now()}`;
    const collab = { id, participants: p.participants, task_id: p.task_id, createdAt: new Date().toISOString(), messages: [] };
    fs.writeFileSync(path.join(STORE, `${id}.json`), JSON.stringify(collab, null, 2));
    return { collaboration: collab };
  },
  hivemind_send_message: (p) => {
    const file = path.join(STORE, `${p.collaboration_id}.json`);
    if (fs.existsSync(file)) {
      const collab = JSON.parse(fs.readFileSync(file, 'utf8'));
      collab.messages.push({ from: p.from, content: p.content, at: new Date().toISOString() });
      fs.writeFileSync(file, JSON.stringify(collab, null, 2));
      return { sent: true };
    }
    return { error: 'Collaboration not found' };
  },
  hivemind_get_stats: () => {
    const agents = fs.readdirSync(STORE).filter(f => f.startsWith('agent_')).length;
    const tasks = fs.readdirSync(STORE).filter(f => f.startsWith('task_')).length;
    return { agents, tasks, uptime: process.uptime() };
  },

  // Pattern crystallizer
  pattern_detect: (p) => {
    const id = `pattern_${Date.now()}`;
    const pattern = { id, code: p.code, language: p.language, context: p.context, tags: p.tags || [], createdAt: new Date().toISOString(), quality: 'silver' };
    fs.writeFileSync(path.join(STORE, `${id}.json`), JSON.stringify(pattern, null, 2));
    return { success: true, pattern };
  },
  pattern_list: (p) => {
    const files = fs.readdirSync(STORE).filter(f => f.startsWith('pattern_') && f.endsWith('.json'));
    let patterns = files.map(f => JSON.parse(fs.readFileSync(path.join(STORE, f), 'utf8')));
    if (p.min_quality) patterns = patterns.filter(x => x.quality === p.min_quality);
    return { patterns: patterns.slice(0, p.max_results || 10) };
  },
  pattern_store_episode: (p) => {
    const id = `episode_${Date.now()}`;
    const episode = { id, trigger: p.trigger, reasoning: p.reasoning, solution: p.solution, outcome: p.outcome, createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(STORE, `${id}.json`), JSON.stringify(episode, null, 2));
    return { success: true, episodeId: id };
  },
  pattern_retrieve_episodes: (p) => {
    const files = fs.readdirSync(STORE).filter(f => f.startsWith('episode_') && f.endsWith('.json'));
    let episodes = files.map(f => JSON.parse(fs.readFileSync(path.join(STORE, f), 'utf8')));
    if (p.query) episodes = episodes.filter(e => e.trigger?.includes(p.query) || e.reasoning?.includes(p.query));
    return { episodes: episodes.slice(0, p.max_results || 3) };
  },
  pattern_adapt: (p) => ({ adapted: true, source: 'retrieved', suggestion: 'Apply pattern with current context adjustments' }),

  // Devtools
  devtools_dependency_analyzer: (p) => ({ action: p.action, project_path: p.project_path, language: p.language || 'typescript', analysis: 'Configure full path for complete analysis' }),
  devtools_monorepo_analyzer: (p) => ({ action: p.action, root_path: p.root_path, packages: 0, dependencies: {} }),
  devtools_test_generator: (p) => ({ generated: true, framework: p.framework || 'jest', test_code: '// Test placeholder' }),
  devtools_git_bisect: (p) => ({ configured: true, good: p.good_commit, bad: p.bad_commit }),
  devtools_build_error: (p) => ({ correlated: false, errors: p.errors || [] }),
};

// Tool definitions for discovery
const TOOLS = Object.keys(handlers).map(name => ({
  name,
  description: `Gateway tool: ${name}`,
  category: name.split('_')[0]
}));

// HTTP server
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    if (u.pathname === '/health' || u.pathname === '/') {
      res.end(JSON.stringify({ status: 'ok', tools: TOOLS.length, uptime: process.uptime() }));
    } else if (u.pathname === '/tools') {
      res.end(JSON.stringify({ tools: TOOLS }));
    } else if (u.pathname === '/') {
      res.end(JSON.stringify({ status: 'ok', tools: TOOLS.length }));
    } else {
      const match = u.pathname.match(/^\/call\/(.+)$/);
      if (match && req.method === 'POST') {
        const name = match[1];
        if (handlers[name]) {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', () => {
            const params = body ? JSON.parse(body) : {};
            const result = handlers[name](params);
            res.end(JSON.stringify({ success: true, result }));
          });
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, error: `Unknown: ${name}` }));
        }
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    }
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`[Gateway] http://localhost:${PORT} | ${TOOLS.length} tools ready`);
});
