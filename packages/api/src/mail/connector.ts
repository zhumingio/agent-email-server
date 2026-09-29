import { EventEmitter } from 'node:events';
import { ImapFlow, type ImapFlowOptions } from 'imapflow';
import { getAccount } from '../db/store.js';
import { getAccessToken } from '../oauth/oauth.js';
import type { Account } from '../types.js';

/** 全局事件总线：new-mail / connection-state */
export const mailEvents = new EventEmitter();
mailEvents.setMaxListeners(100);

/** 构建 imapflow 连接选项；OAuth 账户会在 connect 前注入 access token */
export async function buildImapOptions(account: Account): Promise<ImapFlowOptions> {
  const opts: ImapFlowOptions = {
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: { user: account.username || account.email, pass: account.password || '' },
    logger: false,
    connectionTimeout: 30_000,
    greetingTimeout: 30_000,
    socketTimeout: 120_000,
    tls: { rejectUnauthorized: true },
  };
  if (account.authType === 'oauth2' && account.oauthProvider) {
    const accessToken = await getAccessToken(account);
    opts.auth = { user: account.username || account.email, accessToken };
  }
  return opts;
}

class ImapManager {
  private clients = new Map<string, { client: ImapFlow }>();
  private connecting = new Map<string, Promise<ImapFlow>>();
  private idleLocks = new Set<string>();

  /** 获取（或建立）账户的 IMAP 连接 */
  async getClient(accountId: string): Promise<ImapFlow> {
    const entry = this.clients.get(accountId);
    if (entry && entry.client.usable) return entry.client;

    if (this.connecting.has(accountId)) return this.connecting.get(accountId)!;

    const p = this.connect(accountId).finally(() => this.connecting.delete(accountId));
    this.connecting.set(accountId, p);
    return p;
  }

  private async connect(accountId: string): Promise<ImapFlow> {
    const account = getAccount(accountId);
    if (!account) throw new Error('账户不存在');
    const client = new ImapFlow(await buildImapOptions(account));
    client.on('error', (err) => {
      mailEvents.emit('connection-state', { accountId, state: 'error', error: String(err?.message || err) });
    });
    client.on('close', () => {
      mailEvents.emit('connection-state', { accountId, state: 'closed' });
      if (this.clients.get(accountId)?.client === client) {
        this.clients.delete(accountId);
      }
      if (this.idleLocks.has(accountId)) this.idleLocks.delete(accountId);
    });
    try {
      await client.connect();
      this.clients.set(accountId, { client });
      mailEvents.emit('connection-state', { accountId, state: 'connected' });
      return client;
    } catch (err) {
      mailEvents.emit('connection-state', { accountId, state: 'error', error: String((err as Error)?.message || err) });
      throw err;
    }
  }

  /** 强制关闭某个账户的连接（修改账户后调用） */
  async drop(accountId: string): Promise<void> {
    const entry = this.clients.get(accountId);
    this.clients.delete(accountId);
    if (entry) {
      try { await entry.client.logout(); } catch { /* ignore */ }
    }
  }

  isWatching(accountId: string): boolean {
    return this.idleLocks.has(accountId);
  }

  markWatching(accountId: string, v: boolean): void {
    if (v) this.idleLocks.add(accountId);
    else this.idleLocks.delete(accountId);
  }

  /** 关闭所有连接（用于优雅退出） */
  async closeAll(): Promise<void> {
    await Promise.allSettled([...this.clients.values()].map(async ({ client }) => {
      try { await client.logout(); } catch { /* ignore */ }
    }));
    this.clients.clear();
  }
}

export const imapManager = new ImapManager();

/** 连接级容错包装：socket/TLS 类错误自动重连一次 */
export async function withClient<T>(accountId: string, fn: (client: ImapFlow) => Promise<T>, opts: { retry?: boolean } = {}): Promise<T> {
  try {
    const client = await imapManager.getClient(accountId);
    return await fn(client);
  } catch (err: any) {
    const retriable = err?.source === 'socket' || err?.source === 'timeout' || err?.code === 'SOCKETCLOSED' || /socket|connection|tls/i.test(String(err?.message || err));
    if (retriable && opts.retry !== false) {
      await imapManager.drop(accountId);
      const client = await imapManager.getClient(accountId);
      return await fn(client);
    }
    throw err;
  }
}
