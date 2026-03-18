import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
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

export class HttpServer {
  private server: ReturnType<typeof createServer> | null = null;
  private port: number;
  private publicDir: string;
  private statsProvider: StatsProvider | null = null;
  private startedAt = Date.now();
  private sseClients = new Set<ServerResponse>();
  private eventBuffer: DashboardEvent[] = [];

  constructor(port?: number, publicDir?: string) {
    this.port = port ?? parseInt(process.env['PORT'] ?? '3000', 10);
    this.publicDir = publicDir ?? resolve(process.cwd(), 'public');
  }

  setStatsProvider(provider: StatsProvider): void {
    this.statsProvider = provider;
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

      if (method === 'POST' && url === '/webhook') {
        const body = await this.readBody(req);
        log.info({ bodyLength: body.length }, 'Webhook received');
        this.sendJson(res, 200, { received: true });
        return;
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
