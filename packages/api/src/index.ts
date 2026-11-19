import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getConfig } from './config.js';
import { getDb } from './db/store.js';
import { isAuthed, timingSafeEqualString } from './auth/bearer.js';
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
  // 关闭逐请求访问日志：默认日志会打印完整 URL，而 SSE 的 ?token= 会因此落盘。
  // （Fastify 5.12 起顶层 disableRequestLogging 已废弃，改用 LogController 实例）
  logController: new LogController({ disableRequestLogging: true }),
  // 仅在容器内部由 nginx 反代访问，信任 X-Forwarded-* 才能拿到真实客户端 IP（限流/日志用）
  trustProxy: true,
});

await app.register(fastifyCookie);

// CORS：允许 App（Tauri WebView / Capacitor WebView / PWA）跨域直连后台。
// 鉴权基于 Bearer Token（非 Cookie），因此只放行明确白名单的来源，避免任意站点读取响应。
await app.register(fastifyCors, {
  origin(origin, cb) {
    // 无 Origin（同源页面、curl、服务端调用）：不设置 ACAO，直接放行
    if (!origin) return cb(null, true);
    if (cfg.allowedOrigins.includes('*')) return cb(null, true);
    if (cfg.publicOrigin && origin === cfg.publicOrigin) return cb(null, true);
    if (cfg.allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id', 'Accept'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// ---------- 基础安全响应头（应用层兜底，nginx 侧也有更强的一套） ----------
app.addHook('onSend', async (req, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  if (req.url.startsWith('/api') || req.url.startsWith('/mcp')) {
    // 邮件内容与 Token 相关响应绝不能被缓存
    reply.header('Cache-Control', 'no-store');
  }
  return payload;
});

// ---------- 鉴权（所有 /api 与 /mcp） ----------
function isPublicPath(url: string): boolean {
  if (url.startsWith('/api/health') || url.startsWith('/api/app/info')) return true;
  if (url.startsWith('/api/auth/login')) return true;
  // OAuth 回调由外部提供商重定向而来，无法携带 Bearer；state 参数本身带签名校验
  if (/^\/api\/oauth\/[a-z]+\/callback(\?|$)/.test(url)) return true;
  return false;
}

app.addHook('onRequest', async (req, reply) => {
  const url = req.url;
  if (url.startsWith('/api') || url.startsWith('/mcp')) {
    if (!isPublicPath(url)) {
      const authed = isAuthed(req.headers, req.cookies)
        // SSE：跨源 App 用 ?token= 携带凭据（EventSource 无法设置请求头）
        || (url.startsWith('/api/stream') && timingSafeEqualString((req.query as any)?.token, cfg.apiToken));
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
const MCP_SESSION_IDLE_MS = 30 * 60_000;
const MCP_MAX_SESSIONS = 64;
interface McpSessionEntry {
  transport: StreamableHTTPServerTransport;
  close: () => Promise<void>;
  lastUsed: number;
}
const mcpSessions = new Map<string, McpSessionEntry>();

function evictIdleMcpSessions() {
  const now = Date.now();
  for (const [sid, s] of mcpSessions) {
    if (now - s.lastUsed <= MCP_SESSION_IDLE_MS) continue;
    mcpSessions.delete(sid);
    s.close().catch(() => { /* ignore */ });
  }
}
const mcpSweeper = setInterval(evictIdleMcpSessions, 5 * 60_000);
mcpSweeper.unref?.();

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
    if (session) session.lastUsed = Date.now();
    if (!session) {
      if (sessionId && !isInitialize) {
        return finish(400, { jsonrpc: '2.0', error: { code: -32000, message: 'session 不存在或已过期，请重新连接' }, id: null });
      }
      // 会话数上限：防止恶意客户端无限建连耗尽内存（需要有效 Token，仍做兜底）
      if (mcpSessions.size >= MCP_MAX_SESSIONS) {
        evictIdleMcpSessions();
        if (mcpSessions.size >= MCP_MAX_SESSIONS) {
          return finish(503, { jsonrpc: '2.0', error: { code: -32001, message: 'MCP 会话数已达上限，请稍后重试' }, id: null });
        }
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (sid) => {
          mcpSessions.set(sid, { transport, close: () => transport.close(), lastUsed: Date.now() });
        },
        onsessionclosed: (sid) => { mcpSessions.delete(sid); },
      });
      const server = createMcpServer();
      await server.connect(transport);
      session = { transport, close: () => transport.close(), lastUsed: Date.now() };
    }
    await session.transport.handleRequest(req.raw, reply.raw, req.body);
  } catch (err) {
    app.log.error({ err }, 'MCP 请求处理失败');
    try { finish(500, { jsonrpc: '2.0', error: { code: -32603, message: (err as Error).message }, id: null }); } catch { /* ignore */ }
  }
});

// ---------- 静态资源（前端构建产物） ----------
const webDist = cfg.webDist;
const webIndexPath = path.join(webDist, 'index.html');
const hasWebUi = fs.existsSync(webIndexPath);
let cachedIndex: Buffer | null = null;
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: true });
  app.log.info(`静态资源已挂载: ${webDist}`);
} else {
  app.log.warn(`前端构建产物不存在（${webDist}），仅提供 API。请先构建 web 包。`);
}

app.setNotFoundHandler((req, reply) => {
  const urlPath = req.url.split('?')[0];
  const isApiLike = urlPath.startsWith('/api') || urlPath.startsWith('/mcp');
  if (req.method === 'GET' && !isApiLike) {
    // 前端为 hash 路由的单页应用：非静态文件请求回落到 index.html
    const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(urlPath);
    if (hasWebUi && !looksLikeFile) {
      try {
        cachedIndex ??= fs.readFileSync(webIndexPath);
        return reply.code(200).type('text/html; charset=utf-8').send(cachedIndex);
      } catch { /* 读取失败时走下面的兜底 */ }
    }
    if (!hasWebUi) {
      return reply.code(200).type('text/plain; charset=utf-8').send('zmail api is running. Web UI not built yet.');
    }
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
  app.log.info(`API Token 已配置（长度 ${cfg.apiToken.length}，可用设置页“重新生成”轮换）`);
  if (cfg.publicBaseUrl.startsWith('http://')) {
    app.log.warn('当前 publicBaseUrl 为 http://，会话 Cookie 将不带 Secure；生产环境请配置 HTTPS。');
  }
  startWatchers();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
