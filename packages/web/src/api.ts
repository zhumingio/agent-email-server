import axios from 'axios';
import type {
  AccountView, ListResult, MailboxInfo, MessageDetail, MessageListItem, SendInput, SettingsInfo,
} from './types';

const LS_SERVER = 'zmail_server';
const LS_TOKEN = 'zmail_token';

export function getServerBase(): string {
  const s = localStorage.getItem(LS_SERVER);
  return s && s.trim() ? s.trim().replace(/\/+$/, '') : '';
}

export function setServerBase(url: string): void {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (clean) localStorage.setItem(LS_SERVER, clean);
  else localStorage.removeItem(LS_SERVER);
  api.defaults.baseURL = clean ? `${clean}/api` : '/api';
}

export function getStoredToken(): string {
  return localStorage.getItem(LS_TOKEN) || '';
}
export function setStoredToken(token: string): void {
  if (token) localStorage.setItem(LS_TOKEN, token);
  else localStorage.removeItem(LS_TOKEN);
}

export const api = axios.create({ baseURL: getServerBase() ? `${getServerBase()}/api` : '/api', timeout: 120_000 });

api.interceptors.request.use((cfg) => {
  const token = getStoredToken();
  if (token && !cfg.headers.Authorization) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !window.location.hash.startsWith('#/login')) {
      window.location.hash = '#/login';
    }
    return Promise.reject(err);
  }
);

/** SSE 推送地址：同源用 Cookie，跨源用 token 参数（App WebView 场景） */
export function streamUrl(): string {
  const base = getServerBase();
  const token = getStoredToken();
  if (base) {
    return `${base}/api/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }
  return '/api/stream';
}

function errMsg(e: any): string {
  return e?.response?.data?.error || e?.message || '请求失败';
}

export async function login(token: string): Promise<void> {
  const t = token.trim();
  // 1) 存本地，后续请求走 Bearer（App 跨域场景依赖此路径）
  setStoredToken(t);
  // 2) 同源 Web 额外种下 httpOnly Cookie 会话
  try {
    await api.post('/auth/login', { token: t });
  } catch {
    // 跨域下 Cookie 可能失败，但 Bearer 已就绪，仍视为登录成功
  }
}
export async function logout(): Promise<void> {
  try { await api.post('/auth/logout'); } catch { /* ignore */ }
  setStoredToken('');
}
export async function me(): Promise<{ authed: boolean }> {
  const { data } = await api.get('/auth/me');
  return data;
}
export async function rotateToken(): Promise<string> {
  const { data } = await api.post('/auth/rotate-token');
  return data.token;
}

export async function listAccounts(): Promise<AccountView[]> {
  const { data } = await api.get('/accounts');
  return data;
}
export async function createAccount(body: any): Promise<AccountView> {
  const { data } = await api.post('/accounts', body);
  return data;
}
export async function updateAccount(id: string, body: any): Promise<AccountView> {
  const { data } = await api.put(`/accounts/${id}`, body);
  return data;
}
export async function deleteAccount(id: string): Promise<void> {
  await api.delete(`/accounts/${id}`);
}
export async function testAccount(id: string): Promise<{ ok: boolean; errors?: string[]; message?: string }> {
  const { data } = await api.post(`/accounts/${id}/test`);
  return data;
}
export async function oauthStart(id: string): Promise<{ url: string }> {
  const { data } = await api.get(`/accounts/${id}/oauth-start`);
  return data;
}
export async function listProviders(): Promise<{ provider: string; label: string; authType: string }[]> {
  const { data } = await api.get('/providers');
  return data;
}

export async function listMailboxes(accountId: string): Promise<MailboxInfo[]> {
  const { data } = await api.get(`/accounts/${accountId}/mailboxes`);
  return data;
}
export async function listMessages(accountId: string, params: {
  mailbox: string; page?: number; pageSize?: number; query?: string; unread?: boolean; flagged?: boolean;
}): Promise<ListResult> {
  const { data } = await api.get(`/accounts/${accountId}/messages`, { params: { pageSize: 50, ...params } });
  return data;
}
export async function getMessage(accountId: string, mailbox: string, uid: number, loadRemoteImages = false): Promise<MessageDetail> {
  const { data } = await api.get(`/accounts/${accountId}/messages/${uid}`, { params: { mailbox, loadRemoteImages } });
  return data;
}
export function attachmentUrl(accountId: string, mailbox: string, uid: number, index: number): string {
  const base = getServerBase();
  const path = `/api/accounts/${accountId}/messages/${uid}/attachment/${index}?mailbox=${encodeURIComponent(mailbox)}`;
  return base ? `${base}${path}` : path;
}
export async function getUnread(accountId: string): Promise<{ accountId: string; messages: number; unseen: number }> {
  const { data } = await api.get(`/accounts/${accountId}/unread`);
  return data;
}

export async function markRead(accountId: string, mailbox: string, uids: number[], read: boolean): Promise<void> {
  await api.post(`/accounts/${accountId}/messages/mark`, { mailbox, uids, read });
}
export async function markFlagged(accountId: string, mailbox: string, uids: number[], flagged: boolean): Promise<void> {
  await api.post(`/accounts/${accountId}/messages/flag`, { mailbox, uids, flagged });
}
export async function moveMessages(accountId: string, mailbox: string, uids: number[], target: string): Promise<void> {
  await api.post(`/accounts/${accountId}/messages/move`, { mailbox, uids, target });
}
export async function trash(accountId: string, mailbox: string, uids: number[]): Promise<void> {
  await api.post(`/accounts/${accountId}/messages/trash`, { mailbox, uids });
}

export async function sendMail(accountId: string, input: SendInput): Promise<any> {
  const { data } = await api.post(`/accounts/${accountId}/send`, input);
  return data;
}
export async function replyMail(accountId: string, mailbox: string, uid: number, body: string, all: boolean): Promise<any> {
  const { data } = await api.post(`/accounts/${accountId}/reply`, { mailbox, uid, body, all });
  return data;
}
export async function forwardMail(accountId: string, mailbox: string, uid: number, to: string[], body: string): Promise<any> {
  const { data } = await api.post(`/accounts/${accountId}/forward`, { mailbox, uid, to, body });
  return data;
}
export async function saveDraftMail(accountId: string, input: SendInput): Promise<any> {
  const { data } = await api.post(`/accounts/${accountId}/draft`, input);
  return data;
}

export async function getSettings(): Promise<SettingsInfo> {
  const { data } = await api.get('/settings');
  return data;
}
export async function saveSettings(body: any): Promise<void> {
  await api.put('/settings', body);
}
export async function appInfo(): Promise<any> {
  const { data } = await api.get('/app/info');
  return data;
}
export async function registerDevice(body: { deviceId: string; platform: string; pushToken?: string }): Promise<any> {
  const { data } = await api.post('/app/devices', body);
  return data;
}

export { errMsg };
