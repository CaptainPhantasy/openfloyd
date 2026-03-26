import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, extname, relative, basename } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { createLogger } from '../utils/logger.js';

const log = createLogger('http-server');

export interface ServerStats {
  state: string;
  uptime: number;
  eventLoop: { processed: number; failed: number; queued: number; sources: number };
  llm?: { totalRequests: number; totalInputTokens: number; totalOutputTokens: number; totalErrors: number };
  memory?: { entries: number };
}

export type StatsProvider = () => ServerStats;
export type DataProvider = (endpoint: string) => unknown;

export interface DashboardEvent {
  time: string;
  type: string;
  color: string;
  message: string;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export type WebChatHandler = (ws: WebSocket, connectionId: string, clientInfo?: { userAgent: string; ip: string }) => void;

export class HttpServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private port: number;
  private publicDir: string;
  private statsProvider: StatsProvider | null = null;
  private dataProvider: DataProvider | null = null;
  private webChatHandler: WebChatHandler | null = null;
  private fileEditorRoot: string | null = null;
  private onFileUpdated: ((filePath: string, content: string) => void) | null = null;
  private resetHandler: (() => Promise<void>) | null = null;
  private startedAt = Date.now();
  private sseClients = new Set<ServerResponse>();
  private eventBuffer: DashboardEvent[] = [];

  constructor(port?: number, publicDir?: string) {
    this.port = port ?? parseInt(process.env['PORT'] ?? '8787', 10);
    this.publicDir = publicDir ?? resolve(process.cwd(), 'public');
  }

  setStatsProvider(provider: StatsProvider): void {
    this.statsProvider = provider;
  }

  setDataProvider(provider: DataProvider): void {
    this.dataProvider = provider;
  }

  setWebChatHandler(handler: WebChatHandler): void {
    this.webChatHandler = handler;
  }

  setResetHandler(handler: () => Promise<void>): void {
    this.resetHandler = handler;
  }

  /**
   * Configure the file editor. All file operations are handled directly by
   * the HTTP server — NOT through the dataProvider — so the agent has zero
   * access to read or modify configuration files through its tools.
   */
  setFileEditor(rootPath: string, onUpdate: (filePath: string, content: string) => void): void {
    this.fileEditorRoot = rootPath;
    this.onFileUpdated = onUpdate;
  }

  getEventBuffer(): DashboardEvent[] {
    return [...this.eventBuffer];
  }

  pushEvent(event: DashboardEvent): void {
    this.eventBuffer.unshift(event);
    if (this.eventBuffer.length > 100) this.eventBuffer.pop();

    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(data);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        log.error({ err }, 'HTTP server error');
        reject(err);
      });

      this.wss = new WebSocketServer({ noServer: true });

      this.server.on('upgrade', (request, socket, head) => {
        if (request.url === '/ws') {
          this.wss!.handleUpgrade(request, socket, head, (ws) => {
            const connectionId = crypto.randomUUID();
            const clientInfo = {
              userAgent: request.headers['user-agent'] ?? 'unknown',
              ip: request.socket.remoteAddress ?? 'unknown',
            };
            if (this.webChatHandler) {
              this.webChatHandler(ws, connectionId, clientInfo);
            }
          });
        } else {
          socket.destroy();
        }
      });

      this.server.listen(this.port, () => {
        log.info({ port: this.port }, 'HTTP server listening');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        log.info('HTTP server stopped');
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    try {
      // API routes
      if (method === 'GET' && url === '/health') {
        this.sendJson(res, 200, {
          status: 'ok',
          uptime: Math.floor((Date.now() - this.startedAt) / 1000),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (method === 'GET' && url === '/stats') {
        if (this.statsProvider) {
          this.sendJson(res, 200, this.statsProvider());
        } else {
          this.sendJson(res, 503, { error: 'Stats not available' });
        }
        return;
      }

      if (method === 'GET' && url === '/api/events') {
        this.handleSSE(res);
        return;
      }

      // File explorer/editor — direct HTTP handler, NOT through dataProvider
      // The agent cannot access these endpoints through the tool registry
      if (method === 'GET' && url.startsWith('/api/files') && this.fileEditorRoot) {
        try {
          const urlObj = new URL(url, 'http://localhost');
          const reqPath = urlObj.searchParams.get('path') ?? '';
          const fullPath = resolve(this.fileEditorRoot, reqPath);

          // Security: prevent traversal above root
          if (!fullPath.startsWith(this.fileEditorRoot)) {
            this.sendJson(res, 403, { error: 'Path outside workspace' });
            return;
          }

          const st = await stat(fullPath);
          if (st.isDirectory()) {
            const entries = await readdir(fullPath, { withFileTypes: true });
            const items = entries
              .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist')
              .map((e) => ({
                name: e.name,
                type: e.isDirectory() ? 'dir' : 'file',
                path: relative(this.fileEditorRoot!, resolve(fullPath, e.name)),
              }))
              .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                return a.name.localeCompare(b.name);
              });
            this.sendJson(res, 200, { type: 'directory', path: reqPath, items });
          } else {
            const content = await readFile(fullPath, 'utf-8');
            this.sendJson(res, 200, { type: 'file', path: reqPath, name: basename(fullPath), content });
          }
        } catch (err) {
          this.sendJson(res, 500, { error: 'Failed to read path' });
        }
        return;
      }

      if (method === 'POST' && url === '/api/files' && this.fileEditorRoot) {
        try {
          const body = await this.readBody(req);
          const parsed = JSON.parse(body) as { path?: string; content?: string };
          if (!parsed.path || parsed.content === undefined) {
            this.sendJson(res, 400, { error: 'Missing path or content' });
            return;
          }
          const fullPath = resolve(this.fileEditorRoot, parsed.path);

          // Security: prevent traversal above root
          if (!fullPath.startsWith(this.fileEditorRoot)) {
            this.sendJson(res, 403, { error: 'Path outside workspace' });
            return;
          }

          // Block writing to database files
          if (fullPath.endsWith('.db') || fullPath.endsWith('.db-journal') || fullPath.endsWith('.db-wal')) {
            this.sendJson(res, 403, { error: 'Cannot edit database files' });
            return;
          }

          await writeFile(fullPath, parsed.content, 'utf-8');
          if (this.onFileUpdated) {
            this.onFileUpdated(parsed.path, parsed.content);
          }
          log.info({ path: parsed.path, bytes: parsed.content.length }, 'File updated via dashboard');
          this.sendJson(res, 200, { ok: true, path: parsed.path, bytes: parsed.content.length });
        } catch (err) {
          log.error({ err }, 'Failed to save file');
          this.sendJson(res, 500, { error: 'Failed to save file' });
        }
        return;
      }

      if (method === 'POST' && url === '/webhook') {
        const body = await this.readBody(req);
        log.info({ bodyLength: body.length }, 'Webhook received');
        this.sendJson(res, 200, { received: true });
        return;
      }

      if (method === 'POST' && url === '/api/reset') {
        if (this.resetHandler) {
          await this.resetHandler();
          log.info('Chat session reset via dashboard');
          this.sendJson(res, 200, { ok: true, message: 'Session reset. New messages will use fresh context.' });
        } else {
          this.sendJson(res, 503, { error: 'Reset handler not configured' });
        }
        return;
      }

      // Dashboard data API
      if (method === 'GET' && url.startsWith('/api/') && this.dataProvider) {
        const endpoint = url.replace('/api/', '');
        try {
          const data = this.dataProvider(endpoint);
          if (data !== undefined) {
            this.sendJson(res, 200, data);
            return;
          }
        } catch (err) {
          log.error({ err, url }, 'Data provider error');
          this.sendJson(res, 500, { error: 'Internal error' });
          return;
        }
      }

      // POST actions
      if (method === 'POST' && url.startsWith('/api/') && this.dataProvider) {
        const endpoint = url.replace('/api/', '');
        const body = await this.readBody(req);
        try {
          const data = this.dataProvider(`${endpoint}:${body}`);
          this.sendJson(res, 200, data ?? { ok: true });
          return;
        } catch (err) {
          log.error({ err, url }, 'Action handler error');
          this.sendJson(res, 500, { error: 'Internal error' });
          return;
        }
      }

      // Static file serving
      if (method === 'GET') {
        const served = await this.serveStatic(url, res);
        if (served) return;
      }

      this.sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      log.error({ err: error, url }, 'Request handler error');
      this.sendJson(res, 500, { error: 'Internal server error' });
    }
  }

  private handleSSE(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(':ok\n\n');

    for (const event of this.eventBuffer.slice(0, 20).reverse()) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    this.sseClients.add(res);

    res.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  private async serveStatic(url: string, res: ServerResponse): Promise<boolean> {
    const filePath = url === '/' ? '/index.html' : url;

    // Prevent path traversal
    if (filePath.includes('..')) return false;

    const fullPath = resolve(this.publicDir, '.' + filePath);

    // Ensure within public dir
    if (!fullPath.startsWith(this.publicDir)) return false;

    try {
      const content = await readFile(fullPath);
      const ext = extname(fullPath);
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(content);
      return true;
    } catch {
      return false;
    }
  }

  private sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }
}
