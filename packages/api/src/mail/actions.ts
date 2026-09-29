import { withClient } from './connector.js';
import { resolveRoleFolder } from './folders.js';

export async function markSeen(accountId: string, mailbox: string, uids: number[], seen: boolean): Promise<void> {
  await withClient(accountId, async (client) => {
    await client.mailboxOpen(mailbox);
    if (seen) await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
    else await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
  });
}

export async function markFlagged(accountId: string, mailbox: string, uids: number[], flagged: boolean): Promise<void> {
  await withClient(accountId, async (client) => {
    await client.mailboxOpen(mailbox);
    if (flagged) await client.messageFlagsAdd(uids, ['\\Flagged'], { uid: true });
    else await client.messageFlagsRemove(uids, ['\\Flagged'], { uid: true });
  });
}

export async function moveToMailbox(accountId: string, mailbox: string, uids: number[], target: string): Promise<void> {
  await withClient(accountId, async (client) => {
    await client.mailboxOpen(mailbox);
    await client.messageMove(uids, target, { uid: true });
  });
}

export async function trashMessages(accountId: string, mailbox: string, uids: number[]): Promise<void> {
  const trashPath = await resolveRoleFolder(accountId, 'trash');
  await withClient(accountId, async (client) => {
    await client.mailboxOpen(mailbox);
    if (trashPath && trashPath !== mailbox) {
      await client.messageMove(uids, trashPath, { uid: true });
    } else {
      // 已在回收站或没有回收站：直接删除
      await client.messageDelete(uids, { uid: true });
    }
  });
}

export async function deletePermanently(accountId: string, mailbox: string, uids: number[]): Promise<void> {
  await withClient(accountId, async (client) => {
    await client.mailboxOpen(mailbox);
    await client.messageDelete(uids, { uid: true });
  });
}

export interface UnreadCount {
  accountId: string;
  messages: number;
  unseen: number;
}

export async function getInboxStatus(accountId: string): Promise<UnreadCount> {
  return withClient(accountId, async (client) => {
    const st = await client.status('INBOX', { messages: true, unseen: true });
    return { accountId, messages: st.messages ?? 0, unseen: st.unseen ?? 0 };
  });
}
