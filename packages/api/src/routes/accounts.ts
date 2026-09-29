import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { getConfig } from '../config.js';
import {
  createAccount, deleteAccount, getAccount, listAccounts, setOAuthTokens, updateAccount,
} from '../db/store.js';
import { getPreset, providerLabels } from '../mail/presets.js';
import { buildImapOptions, imapManager } from '../mail/connector.js';
import { stopWatcher } from '../mail/watcher.js';
import { exchangeCode, authorizeUrl } from '../oauth/oauth.js';
import type { Account, AccountView, OAuthProvider } from '../types.js';

function toView(a: Account): AccountView {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    provider: a.provider,
    authType: a.authType,
    imapHost: a.imapHost,
    imapPort: a.imapPort,
    imapSecure: a.imapSecure,
    smtpHost: a.smtpHost,
    smtpPort: a.smtpPort,
    smtpSecure: a.smtpSecure,
    username: a.username,
    hasPassword: !!a.password,
    oauthProvider: a.oauthProvider,
    oauthAuthorized: a.oauthAuthorized,
    settings: a.settings,
    enabled: a.enabled,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export function registerAccountRoutes(app: FastifyInstance) {
  app.get('/api/providers', async () => providerLabels());

  app.get('/api/accounts', async () => listAccounts().map(toView));

  app.post('/api/accounts', async (req, reply) => {
    const body = req.body as Record<string, any>;
    const provider = body.provider || 'custom';
    const preset = getPreset(provider);
    const authType = body.authType || preset.authType || 'password';
    const account = createAccount({
      name: body.name || body.email || '',
      email: body.email,
      provider,
      authType,
      imapHost: body.imapHost || preset.imapHost,
      imapPort: body.imapPort || preset.imapPort,
      imapSecure: body.imapSecure !== undefined ? !!body.imapSecure : preset.imapSecure,
      smtpHost: body.smtpHost || preset.smtpHost,
      smtpPort: body.smtpPort || preset.smtpPort,
      smtpSecure: body.smtpSecure !== undefined ? !!body.smtpSecure : preset.smtpSecure,
      username: body.username || body.email,
      password: authType === 'password' ? body.password : undefined,
      oauthProvider: authType === 'oauth2' ? (body.oauthProvider || preset.oauthProvider) : undefined,
      settings: body.settings || {},
      enabled: body.enabled !== false,
    });
    return reply.code(201).send(toView(account));
  });

  app.put('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, any>;
    const updated = updateAccount(id, {
      name: body.name,
      email: body.email,
      imapHost: body.imapHost,
      imapPort: body.imapPort,
      imapSecure: body.imapSecure,
      smtpHost: body.smtpHost,
      smtpPort: body.smtpPort,
      smtpSecure: body.smtpSecure,
      username: body.username,
      password: body.password !== undefined ? body.password : undefined,
      settings: body.settings,
      enabled: body.enabled,
    });
    if (!updated) return reply.code(404).send({ error: '账户不存在' });
    // 账户信息变化后重置连接
    await imapManager.drop(id);
    if (!updated.enabled) stopWatcher(id);
    return reply.send(toView(updated));
  });

  app.delete('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    stopWatcher(id);
    await imapManager.drop(id);
    deleteAccount(id);
    return reply.send({ ok: true });
  });

  // ---- 连接测试 ----
  app.post('/api/accounts/:id/test', async (req, reply) => {
    const { id } = req.params as { id: string };
    const account = getAccount(id);
    if (!account) return reply.code(404).send({ error: '账户不存在' });
    const errors: string[] = [];
    // 测试 IMAP
    try {
      const opts = await buildImapOptions(account);
      const client = new ImapFlow(opts);
      client.on('error', () => {});
      await client.connect();
      await client.logout();
    } catch (e) {
      errors.push(`IMAP: ${(e as Error).message}`);
    }
    // 测试 SMTP
    try {
      const { getAccessToken } = await import('../oauth/oauth.js');
      const smtpOpts = account.authType === 'oauth2' && account.oauthProvider
        ? {
            host: account.smtpHost, port: account.smtpPort, secure: account.smtpSecure,
            auth: { type: 'OAuth2' as const, user: account.username || account.email, accessToken: await getAccessToken(account) },
          }
        : {
            host: account.smtpHost, port: account.smtpPort, secure: account.smtpSecure,
            auth: { user: account.username || account.email, pass: account.password || '' },
          };
      const transport = nodemailer.createTransport(smtpOpts);
      await transport.verify();
    } catch (e) {
      errors.push(`SMTP: ${(e as Error).message}`);
    }
    if (errors.length) {
      return reply.code(400).send({ ok: false, errors });
    }
    return reply.send({ ok: true, message: 'IMAP 与 SMTP 连接均正常' });
  });

  // ---- OAuth 授权 ----
  app.get('/api/accounts/:id/oauth-start', async (req, reply) => {
    const { id } = req.params as { id: string };
    const account = getAccount(id);
    if (!account) return reply.code(404).send({ error: '账户不存在' });
    const provider = account.oauthProvider as OAuthProvider;
    if (!provider) return reply.code(400).send({ error: '该账户未配置 OAuth 提供商' });
    const state = `${id}`;
    const base = getConfig().publicBaseUrl;
    const redirectUri = `${base}/api/oauth/${provider}/callback`;
    const url = authorizeUrl(provider, state, redirectUri);
    if (!url) return reply.code(400).send({ error: `未配置 ${provider === 'google' ? 'Google' : 'Microsoft'} OAuth 客户端（请在设置中填写 Client ID/Secret）` });
    return reply.send({ url });
  });

  // OAuth 回调（redirect_uri 由 provider 固定指向）
  app.get('/api/oauth/:provider/callback', async (req, reply) => {
    const { provider } = req.params as { provider: OAuthProvider };
    const q = req.query as Record<string, string>;
    const { code, state, error } = q;
    const base = getConfig().publicBaseUrl;
    const redirectUri = `${base}/api/oauth/${provider}/callback`;
    const failUrl = `${base}/#/settings?oauth=error&account=${state || ''}`;
    if (error || !code) {
      return reply.redirect(failUrl);
    }
    try {
      const tokens = await exchangeCode(provider, code, redirectUri);
      if (state) {
        setOAuthTokens(state, {
          refreshToken: tokens.refreshToken,
          accessToken: tokens.accessToken,
          expiresAt: Date.now() + tokens.expiresIn * 1000,
        });
        const acc = getAccount(state);
        if (acc && !acc.enabled) updateAccount(state, { enabled: true });
        await imapManager.drop(state);
      }
      return reply.redirect(`${base}/#/settings?oauth=success&account=${state || ''}`);
    } catch (e) {
      return reply.redirect(`${base}/#/settings?oauth=error&account=${state || ''}&reason=${encodeURIComponent((e as Error).message)}`);
    }
  });

  // 手动补登 refresh token 的调试接口（便于开发期填充令牌）
  app.post('/api/accounts/:id/oauth-tokens', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { refreshToken?: string; accessToken?: string; expiresIn?: number };
    if (!body.refreshToken && !body.accessToken) return reply.code(400).send({ error: '缺少令牌' });
    setOAuthTokens(id, {
      refreshToken: body.refreshToken,
      accessToken: body.accessToken,
      expiresAt: body.expiresIn ? Date.now() + body.expiresIn * 1000 : undefined,
    });
    await imapManager.drop(id);
    return reply.send({ ok: true });
  });

  // 临时 OAuth state 无账户场景：为前端方便随机生成
  app.get('/api/oauth/state', async () => ({ state: randomUUID() }));
}
