import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { mailEvents } from '../mail/connector.js';

/** 单实例 SSE 连接上限，防止异常客户端占满内存/句柄 */
const MAX_SSE_CLIENTS = 64;

interface SseClient {
  res: ServerResponse;
  send(event: string, data: unknown): void;
}

const clients = new Set<SseClient>();

function broadcast(event: string, data: unknown) {
  for (const c of clients) {
    try {
      c.send(event, data);
    } catch {
      clients.delete(c);
    }
  }
}

export function startSseListeners() {
  mailEvents.on('new-mail', (d) => broadcast('new-mail', d));
  mailEvents.on('mailbox-changed', (d) => broadcast('mailbox-changed', d));
  mailEvents.on('connection-state', (d) => broadcast('connection-state', d));
}

export function registerStreamRoutes(app: FastifyInstance) {
  app.get('/api/stream', async (req, reply) => {
    if (clients.size >= MAX_SSE_CLIENTS) {
      return reply.code(503).send({ error: '实时推送连接数已达上限，请稍后重试' });
    }
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const client: SseClient = {
      res: reply.raw,
      send(event: string, data: unknown) {
        this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      },
    };
    clients.add(client);

    // 心跳，避免代理断连
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        clients.delete(client);
      }
    }, 25_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      clients.delete(client);
    };
    req.raw.on('close', cleanup);
    req.raw.on('error', cleanup);
    reply.raw.on('close', cleanup);

    return reply;
  });
}
