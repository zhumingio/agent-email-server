import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { mailEvents } from '../mail/connector.js';

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

    req.raw.on('close', () => {
      clients.delete(client);
    });
    // 心跳，避免代理断连
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        clients.delete(client);
      }
    }, 25_000);
    req.raw.on('close', () => clearInterval(heartbeat));

    return reply;
  });
}
