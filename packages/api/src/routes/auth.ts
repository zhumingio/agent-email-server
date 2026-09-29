import type { FastifyInstance } from 'fastify';
import { getConfig, rotateApiToken } from '../config.js';
import { isAuthed, signSession, sessionCookieName } from '../auth/bearer.js';

export function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = req.body as { token?: string };
    if (!body?.token) {
      return reply.code(400).send({ error: '缺少 token' });
    }
    if (body.token !== getConfig().apiToken) {
      return reply.code(401).send({ error: 'token 无效' });
    }
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
    reply.clearCookie(sessionCookieName, { path: '/' });
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
    return reply.send({ token });
  });
}
