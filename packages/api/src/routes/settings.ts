import type { FastifyInstance } from 'fastify';
import { getConfig } from '../config.js';
import { getAppSetting, setAppSetting } from '../db/store.js';
import { isOAuthConfigured } from '../oauth/oauth.js';

export function registerSettingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => {
    return {
      publicBaseUrl: getConfig().publicBaseUrl,
      apiTokenConfigured: !!getConfig().apiToken,
      apiTokenFromEnv: !!process.env.ZMAIL_API_TOKEN,
      // 已登录会话可见完整 token（单管理员工具），便于复制给 App/MCP
      apiToken: getConfig().apiToken,
      gmailOAuth: {
        configured: isOAuthConfigured('google'),
        clientId: getAppSetting('oauth:google:clientId') || getConfig().gmailClientId || '',
      },
      outlookOAuth: {
        configured: isOAuthConfigured('microsoft'),
        clientId: getAppSetting('oauth:microsoft:clientId') || getConfig().outlookClientId || '',
      },
    };
  });

  app.put('/api/settings', async (req, reply) => {
    const body = req.body as {
      gmailClientId?: string; gmailClientSecret?: string;
      outlookClientId?: string; outlookClientSecret?: string;
    };
    if (body.gmailClientId !== undefined) setAppSetting('oauth:google:clientId', body.gmailClientId.trim());
    if (body.gmailClientSecret !== undefined) setAppSetting('oauth:google:clientSecret', body.gmailClientSecret.trim());
    if (body.outlookClientId !== undefined) setAppSetting('oauth:microsoft:clientId', body.outlookClientId.trim());
    if (body.outlookClientSecret !== undefined) setAppSetting('oauth:microsoft:clientSecret', body.outlookClientSecret.trim());
    return reply.send({ ok: true });
  });

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));
}
