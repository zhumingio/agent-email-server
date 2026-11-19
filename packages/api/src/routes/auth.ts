import type { FastifyInstance } from 'fastify';
import { getConfig, rotateApiToken } from '../config.js';
import { isAuthed, signSession, sessionCookieName, timingSafeEqualString } from '../auth/bearer.js';
import { checkLimit, recordHit, resetLimit } from '../auth/ratelimit.js';

/** 登录失败限流：同一 IP 5 分钟内最多 10 次失败 */
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 5 * 60_000;

function clientIp(req: { ip?: string; headers: Record<string, any> }): string {
  return req.ip || 'unknown';
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const ip = clientIp(req as any);
    const limit = checkLimit(`login:${ip}`, LOGIN_MAX_FAILS, LOGIN_WINDOW_MS);
    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSec));
      return reply.code(429).send({ error: `尝试次数过多，请在 ${limit.retryAfterSec} 秒后重试` });
    }
    const body = req.body as { token?: string };
    if (!body?.token || typeof body.token !== 'string') {
      return reply.code(400).send({ error: '缺少 token' });
    }
    if (!timingSafeEqualString(body.token.trim(), getConfig().apiToken)) {
      recordHit(`login:${ip}`);
      // 失败响应固定延迟，进一步降低在线猜测速率
      await new Promise((r) => setTimeout(r, 150));
      return reply.code(401).send({ error: 'token 无效' });
    }
    resetLimit(`login:${ip}`);
    const session = signSession();
    reply.setCookie(sessionCookieName, session, {
      httpOnly: true,
      sameSite: 'lax',
      secure: getConfig().publicBaseUrl.startsWith('https'),
      path: '/',
      maxAge: 30 * 24 * 3600,
    });
    return reply.send({ ok: true });
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(sessionCookieName, { path: '/', sameSite: 'lax' });
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', async (req, reply) => {
    if (!isAuthed(req.headers, req.cookies)) {
      return reply.code(401).send({ authed: false });
    }
    return reply.send({ authed: true, hasApiToken: !!getConfig().apiToken });
  });

  app.post('/api/auth/rotate-token', async (req, reply) => {
    if (!isAuthed(req.headers, req.cookies)) {
      return reply.code(401).send({ error: '未授权' });
    }
    if (process.env.ZMAIL_API_TOKEN) {
      return reply.code(400).send({ error: 'API Token 由环境变量 ZMAIL_API_TOKEN 指定，请在部署环境修改' });
    }
    const token = rotateApiToken();
    // 轮换后旧会话仍然有效（签名密钥未变），这里顺带刷新一个新会话
    reply.setCookie(sessionCookieName, signSession(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: getConfig().publicBaseUrl.startsWith('https'),
      path: '/',
      maxAge: 30 * 24 * 3600,
    });
    return reply.send({ token });
  });
}
