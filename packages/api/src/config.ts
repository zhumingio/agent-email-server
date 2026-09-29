import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

function envStr(key: string, fallback = ''): string {
  const v = process.env[key];
  return v !== undefined && v !== '' ? v : fallback;
}

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  publicBaseUrl: string;
  apiToken: string;
  masterKey: Buffer;
  gmailClientId: string;
  gmailClientSecret: string;
  outlookClientId: string;
  outlookClientSecret: string;
  webDist: string;
}

let cached: AppConfig | null = null;

/** 首次启动自动生成 API Token / 主密钥并持久化到数据目录（不在 env 时） */
function ensureSecret(name: string, dataDir: string): string {
  const file = path.join(dataDir, `${name}.secret`);
  if (fs.existsSync(file)) {
    return fs.readFileSync(file, 'utf8').trim();
  }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function getConfig(): AppConfig {
  if (cached) return cached;
  const dataDir = envStr('DATA_DIR', path.resolve(process.cwd(), 'data'));
  const apiToken = envStr('ZMAIL_API_TOKEN') || ensureSecret('api_token', dataDir);
  const masterKeyHex = envStr('ZMAIL_MASTER_KEY') || ensureSecret('master_key', dataDir);
  cached = {
    host: envStr('HOST', '0.0.0.0'),
    port: parseInt(envStr('PORT', '3000'), 10),
    dataDir,
    dbPath: path.join(dataDir, 'zmail.db'),
    publicBaseUrl: envStr('ZMAIL_PUBLIC_BASE_URL', 'http://localhost:3000').replace(/\/+$/, ''),
    apiToken,
    masterKey: crypto.createHash('sha256').update(masterKeyHex).digest(),
    gmailClientId: envStr('GMAIL_OAUTH_CLIENT_ID'),
    gmailClientSecret: envStr('GMAIL_OAUTH_CLIENT_SECRET'),
    outlookClientId: envStr('OUTLOOK_OAUTH_CLIENT_ID'),
    outlookClientSecret: envStr('OUTLOOK_OAUTH_CLIENT_SECRET'),
    webDist: envStr('WEB_DIST', path.resolve(process.cwd(), '../web/dist')),
  };
  fs.mkdirSync(dataDir, { recursive: true });
  return cached;
}

/** 重新生成 API Token（仅当未用环境变量指定时可用），返回新 token */
export function rotateApiToken(): string {
  const cfg = getConfig();
  const token = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(path.join(cfg.dataDir, 'api_token.secret'), token, { mode: 0o600 });
  cfg.apiToken = token;
  return token;
}
