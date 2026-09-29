import { getConfig } from '../config.js';
import { getAppSetting, setOAuthTokens, getOAuthTokens } from '../db/store.js';
import type { Account, OAuthProvider } from '../types.js';

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

/** OAuth 客户端配置：优先设置页写入的 app_settings，其次环境变量 */
export function getOAuthConfig(provider: OAuthProvider): OAuthClientConfig | null {
  if (provider === 'google') {
    const clientId = getAppSetting('oauth:google:clientId') || getConfig().gmailClientId;
    const clientSecret = getAppSetting('oauth:google:clientSecret') || getConfig().gmailClientSecret;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }
  const clientId = getAppSetting('oauth:microsoft:clientId') || getConfig().outlookClientId;
  const clientSecret = getAppSetting('oauth:microsoft:clientSecret') || getConfig().outlookClientSecret;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function isOAuthConfigured(provider: OAuthProvider): boolean {
  return getOAuthConfig(provider) !== null;
}

const GMAIL_SCOPE = 'https://mail.google.com/';
const MS_SCOPE = 'offline_access IMAP.AccessAsUser.All SMTP.Send User.Read';

export function authorizeUrl(provider: OAuthProvider, state: string, redirectUri: string): string | null {
  const cfg = getOAuthConfig(provider);
  if (!cfg) return null;
  const params = new URLSearchParams();
  if (provider === 'google') {
    params.set('client_id', cfg.clientId);
    params.set('redirect_uri', redirectUri);
    params.set('response_type', 'code');
    params.set('scope', GMAIL_SCOPE);
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
    params.set('state', state);
    params.set('approval_prompt', 'force');
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  params.set('client_id', cfg.clientId);
  params.set('redirect_uri', redirectUri);
  params.set('response_type', 'code');
  params.set('scope', MS_SCOPE);
  params.set('state', state);
  params.set('prompt', 'select_account');
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

async function tokenRequest(provider: OAuthProvider, body: URLSearchParams): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const cfg = getOAuthConfig(provider);
  if (!cfg) throw new Error('OAuth 客户端未配置');
  body.set('client_id', cfg.clientId);
  body.set('client_secret', cfg.clientSecret);
  const url = provider === 'google'
    ? 'https://oauth2.googleapis.com/token'
    : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await res.json() as any;
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth 令牌交换失败: ${data.error_description || data.error || res.status}`);
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in || 3600 };
}

export async function exchangeCode(provider: OAuthProvider, code: string, redirectUri: string) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  return tokenRequest(provider, body);
}

export async function refreshAccessToken(provider: OAuthProvider, refreshToken: string) {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return tokenRequest(provider, body);
}

/** 获取账户当前有效的 access token，过期则自动刷新并持久化 */
export async function getAccessToken(account: Account): Promise<string> {
  const tokens = getOAuthTokens(account.id);
  if (tokens.accessToken && tokens.expiresAt && tokens.expiresAt - 120_000 > Date.now()) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) throw new Error('该账户缺少 OAuth refresh token，请重新授权');
  const refreshed = await refreshAccessToken(account.oauthProvider!, tokens.refreshToken);
  setOAuthTokens(account.id, {
    refreshToken: tokens.refreshToken ?? undefined,
    accessToken: refreshed.accessToken,
    expiresAt: Date.now() + refreshed.expiresIn * 1000,
  });
  return refreshed.accessToken;
}
