import type { FastifyInstance } from 'fastify';
import { getConfig } from '../config.js';
import { getAppSetting, setAppSetting } from '../db/store.js';
import { isOAuthConfigured } from '../oauth/oauth.js';

/** 掩码显示：仅保留首尾各 4 位，避免响应体、前端内存、日志泄露完整 Token */
function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 12) return '****';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function cleanClientField(v: unknown, maxLen = 512): string | undefined {
  if (typeof v !== 'string') return undefined;
  return v.trim().slice(0, maxLen);
}

export function registerSettingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => {
    const cfg = getConfig();
    return {
      publicBaseUrl: cfg.publicBaseUrl,
      apiTokenConfigured: !!cfg.apiToken,
      apiTokenFromEnv: !!process.env.ZMAIL_API_TOKEN,
      // 出于安全考虑不再回传完整 Token；需要时在部署环境（ZMAIL_API_TOKEN 或 data/api_token.secret）取
      apiTokenMasked: maskToken(cfg.apiToken),
      gmailOAuth: {
        configured: isOAuthConfigured('google'),
        clientId: getAppSetting('oauth:google:clientId') || cfg.gmailClientId || '',
      },
      outlookOAuth: {
        configured: isOAuthConfigured('microsoft'),
        clientId: getAppSetting('oauth:microsoft:clientId') || cfg.outlookClientId || '',
      },
    };
  });

  app.put('/api/settings', async (req, reply) => {
    const body = req.body as {
      gmailClientId?: string; gmailClientSecret?: string;
      outlookClientId?: string; outlookClientSecret?: string;
    };
    const gmailClientId = cleanClientField(body?.gmailClientId);
    const gmailClientSecret = cleanClientField(body?.gmailClientSecret);
    const outlookClientId = cleanClientField(body?.outlookClientId);
    const outlookClientSecret = cleanClientField(body?.outlookClientSecret);
    if (gmailClientId !== undefined) setAppSetting('oauth:google:clientId', gmailClientId);
    if (gmailClientSecret !== undefined) setAppSetting('oauth:google:clientSecret', gmailClientSecret);
    if (outlookClientId !== undefined) setAppSetting('oauth:microsoft:clientId', outlookClientId);
    if (outlookClientSecret !== undefined) setAppSetting('oauth:microsoft:clientSecret', outlookClientSecret);
    return reply.send({ ok: true });
  });

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));
}
