import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getConfig } from './config.js';
import { getDb } from './db/store.js';
import { isAuthed } from './auth/bearer.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAccountRoutes } from './routes/accounts.js';
import { registerMailRoutes } from './routes/mail.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerAppRoutes } from './routes/app.js';
import { registerStreamRoutes, startSseListeners } from './routes/stream.js';
import { createMcpServer } from './mcp/server.js';
import { startWatchers } from './mail/watcher.js';
import { imapManager } from './mail/connector.js';

const cfg = getConfig();

// 初始化数据库
getDb();

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  bodyLimit: 50 * 1024 * 1024,
  disableRequestLogging: true,
});

await app.register(fastifyCookie);

// CORS：允许 App（Tauri WebView / Capacitor WebView / PWA）跨域直连后台。
// 鉴权基于 Bearer Token（非 Cookie），放开来源不会引入 CSRF 风险。
await app.register(fastifyCors, {
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id', 'Accept'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// ---------- 鉴权（所有 /api 与 /mcp） ----------
app.addHook('onRequest', async (req, reply) => {
  const url = req.url;
  const publicPaths = ['/api/auth/login', '/api/oauth/', '/api/health', '/api/app/info'];
  if (url.startsWith('/api') || url.startsWith('/mcp')) {
    if (!publicPaths.some((p) => url.startsWith(p))) {
      const authed = isAuthed(req.headers, req.cookies)
        // SSE：跨源 App 用 ?token= 携带凭据（EventSource 无法设置请求头）
        || (url.startsWith('/api/stream') && (req.query as any)?.token === cfg.apiToken);
      if (!authed) {
        return reply.code(401).send({ error: '未授权：请提供 Bearer API Token 或先登录' });
      }
    }
  }
});

// ---------- REST 路由 ----------
registerAuthRoutes(app);
registerAccountRoutes(app);
registerMailRoutes(app);
registerSettingsRoutes(app);
registerAppRoutes(app);
registerStreamRoutes(app);
startSseListeners();

// ---------- MCP Server（Streamable HTTP） ----------
// 每个会话一个独立的 McpServer + transport（SDK 的 Protocol 只支持单 transport 连接）
const mcpSessions = new Map<string, { transport: StreamableHTTPServerTransport; close: () => Promise<void> }>();

app.all('/mcp', async (req, reply) => {
  reply.hijack();
  const sessionId = (req.headers['mcp-session-id'] as string) || undefined;
  const body = req.body as any;
  const isInitialize = body && body.method === 'initialize';
  const finish = (code: number, payload?: unknown) => {
    if (!reply.raw.headersSent) {
      reply.raw.writeHead(code, { 'Content-Type': 'application/json' });
    }
    if (payload !== undefined) reply.raw.end(JSON.stringify(payload));
    else reply.raw.end();
  };

  try {
    let session = sessionId ? mcpSessions.get(sessionId) : undefined;
    if (!session) {
      if (sessionId && !isInitialize) {
        return finish(400, { jsonrpc: '2.0', error: { code: -32000, message: 'session 不存在或已过期，请重新连接' }, id: null });
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (sid) => {
          mcpSessions.set(sid, { transport, close: () => transport.close() });
        },
        onsessionclosed: (sid) => { mcpSessions.delete(sid); },
      });
      const server = createMcpServer();
      await server.connect(transport);
      session = { transport, close: () => transport.close() };
    }
    await session.transport.handleRequest(req.raw, reply.raw, req.body);
  } catch (err) {
    app.log.error({ err }, 'MCP 请求处理失败');
    try { finish(500, { jsonrpc: '2.0', error: { code: -32603, message: (err as Error).message }, id: null }); } catch { /* ignore */ }
  }
});

// ---------- 静态资源（前端构建产物） ----------
const webDist = cfg.webDist;
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: true });
  app.log.info(`静态资源已挂载: ${webDist}`);
} else {
  app.log.warn(`前端构建产物不存在（${webDist}），仅提供 API。请先构建 web 包。`);
}

app.setNotFoundHandler((req, reply) => {
  if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/mcp')) {
    return reply.code(200).send('zmail api is running. Web UI not built yet.');
  }
  return reply.code(404).send({ error: 'Not Found' });
});

// ---------- 优雅退出 ----------
const shutdown = async () => {
  app.log.info('正在关闭…');
  await imapManager.closeAll();
  for (const s of mcpSessions.values()) {
    try { await s.close(); } catch { /* ignore */ }
  }
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ---------- 启动 ----------
try {
  await app.listen({ host: cfg.host, port: cfg.port });
  app.log.info(`zmail 已启动: ${cfg.publicBaseUrl}`);
  app.log.info(`API Token: ${cfg.apiToken.slice(0, 6)}…${cfg.apiToken.slice(-4)}（设置页可查看完整值）`);
  startWatchers();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
