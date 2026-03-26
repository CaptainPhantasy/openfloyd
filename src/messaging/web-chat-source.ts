import type { WebSocket } from 'ws';
import { createLogger } from '../utils/logger.js';
import {
  EventSourceType,
  EventPriority,
  type AgentEvent,
  type EventSource,
  type WebChatMessage,
  type WebSocketConnection,
} from '../types/index.js';

const log = createLogger('web-chat');

interface InternalConnection extends WebSocketConnection {
  socket: WebSocket;
}

export class WebChatEventSource implements EventSource {
  type = EventSourceType.WEBCHAT as const;
  name = 'web-chat';

  private connections = new Map<string, InternalConnection>();
  private eventHandler: ((event: AgentEvent) => void) | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    await Promise.resolve();
    this.pingInterval = setInterval(() => {
      for (const [id, conn] of this.connections) {
        try {
          conn.socket.ping();
        } catch {
          this.removeConnection(id);
        }
      }
    }, 30_000);
    this.pingInterval.unref();
    log.info('WebChat event source started');
  }

  async stop(): Promise<void> {
    await Promise.resolve();
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    for (const [id, conn] of this.connections) {
      try {
        conn.socket.close(1001, 'Server shutting down');
      } catch {
        // ignore
      }
      this.connections.delete(id);
    }
    log.info('WebChat event source stopped');
  }

  onEvent(handler: (event: AgentEvent) => void): void {
    this.eventHandler = handler;
  }

  handleConnection(ws: WebSocket, connectionId: string, clientInfo?: { userAgent: string; ip: string }): void {
    const conn: InternalConnection = {
      id: connectionId,
      socket: ws,
      connectedAt: new Date(),
      lastActivity: new Date(),
      clientInfo,
    };
    this.connections.set(connectionId, conn);
    log.info({ connectionId }, 'WebSocket client connected');

    ws.on('message', (data: Buffer | string) => {
      conn.lastActivity = new Date();
      this.handleMessage(connectionId, data.toString());
    });

    ws.on('close', () => {
      this.removeConnection(connectionId);
    });

    ws.on('error', (err) => {
      log.error({ err, connectionId }, 'WebSocket error');
      this.removeConnection(connectionId);
    });
  }

  async sendMessage(connectionId: string, message: WebChatMessage): Promise<void> {
    await Promise.resolve();
    const conn = this.connections.get(connectionId);
    if (!conn) {
      log.warn({ connectionId }, 'Cannot send — connection not found');
      return;
    }
    try {
      conn.socket.send(JSON.stringify({
        type: 'message',
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp.toISOString(),
        metadata: message.metadata,
      }));
    } catch (err) {
      log.error({ err, connectionId }, 'Failed to send message');
    }
  }

  async broadcast(message: WebChatMessage): Promise<void> {
    await Promise.resolve();
    const payload = JSON.stringify({
      type: 'message',
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp.toISOString(),
      metadata: message.metadata,
    });
    for (const [id, conn] of this.connections) {
      try {
        conn.socket.send(payload);
      } catch {
        this.removeConnection(id);
      }
    }
  }

  broadcastStatus(state: string, workerId?: string): void {
    const payload = JSON.stringify({ type: 'status', state, workerId });
    for (const [id, conn] of this.connections) {
      try {
        conn.socket.send(payload);
      } catch {
        this.removeConnection(id);
      }
    }
  }

  getConnections(): Map<string, WebSocketConnection> {
    const result = new Map<string, WebSocketConnection>();
    for (const [id, conn] of this.connections) {
      result.set(id, {
        id: conn.id,
        connectedAt: conn.connectedAt,
        lastActivity: conn.lastActivity,
        clientInfo: conn.clientInfo,
      });
    }
    return result;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  private handleMessage(connectionId: string, raw: string): void {
    try {
      const parsed = JSON.parse(raw) as { type?: string; content?: string };

      if (parsed.type === 'ping') {
        const conn = this.connections.get(connectionId);
        if (conn) {
          conn.socket.send(JSON.stringify({ type: 'pong' }));
        }
        return;
      }

      if (parsed.type === 'message' && parsed.content) {
        const chatMessage: WebChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: parsed.content,
          timestamp: new Date(),
          metadata: { type: 'text' },
        };

        if (this.eventHandler) {
          this.eventHandler({
            id: chatMessage.id,
            type: EventSourceType.WEBCHAT,
            priority: EventPriority.NORMAL,
            payload: {
              message: chatMessage,
              connectionId,
              sender: connectionId,
            },
            timestamp: chatMessage.timestamp,
            metadata: { connectionId, source: 'webchat' },
          });
        }
      }
    } catch (err) {
      log.warn({ err, connectionId }, 'Invalid WebSocket message');
      const conn = this.connections.get(connectionId);
      if (conn) {
        conn.socket.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    }
  }

  private removeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      this.connections.delete(connectionId);
      log.info({ connectionId }, 'WebSocket client disconnected');
    }
  }
}
