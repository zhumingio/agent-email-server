import { ImapFlow } from 'imapflow';
import { getAccount, listAccounts } from '../db/store.js';
import { buildImapOptions, imapManager, mailEvents } from './connector.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 为单个账户启动 INBOX 实时监听（独立连接，避免与业务操作抢占邮箱） */
async function watchAccount(accountId: string): Promise<void> {
  if (imapManager.isWatching(accountId)) return;
  imapManager.markWatching(accountId, true);

  let client: ImapFlow | null = null;
  while (imapManager.isWatching(accountId)) {
    try {
      if (!client || !client.usable) {
        const account = getAccount(accountId);
        if (!account) break;
        client = new ImapFlow(await buildImapOptions(account));
        client.on('error', () => { /* 由下方循环重连 */ });
        await client.connect();
        await client.mailboxOpen('INBOX');
        console.log(`[watcher] ${account.email} 已连接并监听 INBOX`);
      }
      const onMail = () => mailEvents.emit('new-mail', { accountId });
      const onExpunge = () => mailEvents.emit('mailbox-changed', { accountId, mailbox: 'INBOX' });
      client.on('exists', onMail);
      client.on('expunge', onExpunge);
      // auto-idle 机制自动保持 IDLE；这里仅周期性检查连接活性
      await sleep(60_000);
      client.off('exists', onMail);
      client.off('expunge', onExpunge);
    } catch (err) {
      client = null;
      console.warn(`[watcher] ${accountId} 监听中断，15s 后重连: ${(err as Error)?.message || err}`);
      await sleep(15_000);
    }
  }
  if (client) {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

const started = new Set<string>();

/** 启动所有已启用账户的监听（幂等） */
export function startWatchers(): void {
  const accounts = listAccounts();
  for (const a of accounts) {
    if (!a.enabled) continue;
    if (started.has(a.id)) continue;
    started.add(a.id);
    watchAccount(a.id).catch(() => started.delete(a.id));
  }
}

/** 停止某账户监听（账户删除/禁用时调用） */
export function stopWatcher(accountId: string): void {
  imapManager.markWatching(accountId, false);
  started.delete(accountId);
}
