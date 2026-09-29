import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { getConfig } from '../config.js';
import { listDevices, upsertDevice, deleteDevice } from '../db/store.js';
import { isOAuthConfigured } from '../oauth/oauth.js';

const require = createRequire(import.meta.url);
let pkgVersion = '0.1.0';
try {
  pkgVersion = require('../../package.json').version;
} catch { /* ignore */ }

/** App 专用接口：供 Windows/Android 客户端直连后台时探测服务器信息、注册设备 */
export function registerAppRoutes(app: FastifyInstance) {
  // 服务器信息（公开，供 App 登录页探测连通性）
  app.get('/api/app/info', async () => ({
    app: 'zmail',
    version: pkgVersion,
    apiVersion: 1,
    serverTime: new Date().toISOString(),
    publicBaseUrl: getConfig().publicBaseUrl,
    features: {
      mcp: true,
      oauthGoogle: isOAuthConfigured('google'),
      oauthMicrosoft: isOAuthConfigured('microsoft'),
      realtimePush: true,
    },
  }));

  // 已注册设备列表
  app.get('/api/app/devices', async () => listDevices());

  // 注册/更新设备（App 启动时调用；pushToken 为将来推送预留）
  app.post('/api/app/devices', async (req, reply) => {
    const b = req.body as { deviceId?: string; platform?: string; pushToken?: string };
    if (!b?.deviceId || !b?.platform) {
      return reply.code(400).send({ error: '缺少 deviceId 或 platform' });
    }
    const dev = upsertDevice({ deviceId: b.deviceId, platform: b.platform, pushToken: b.pushToken });
    return reply.code(201).send(dev);
  });

  // 注销设备
  app.delete('/api/app/devices/:deviceId', async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const ok = deleteDevice(deviceId);
    return reply.send({ ok });
  });
}
