import type { ImapFlow } from 'imapflow';
import { withClient } from './connector.js';
import type { MailboxInfo } from '../types.js';

/** 角色识别：优先服务器 special-use，其次特殊标志 */
function roleOf(specialUse: string | undefined, flags: Set<string>, path: string): MailboxInfo['role'] {
  if (specialUse) {
    const su = specialUse.toLowerCase();
    if (su === '\\inbox' || path.toUpperCase() === 'INBOX') return 'inbox';
    if (su === '\\sent') return 'sent';
    if (su === '\\drafts') return 'drafts';
    if (su === '\\trash') return 'trash';
    if (su === '\\junk') return 'spam';
    if (su === '\\all') return 'all';
    if (su === '\\archive') return 'archive';
    if (su === '\\important') return 'important';
  }
  const lower = path.toLowerCase();
  if (lower === 'inbox') return 'inbox';
  if (/sent|已发送|已發送/.test(lower)) return 'sent';
  if (/draft|草稿/.test(lower)) return 'drafts';
  if (/trash|deleted|bin|回收|已删除|已刪除/.test(lower)) return 'trash';
  if (/junk|spam|垃圾|广告邮件/.test(lower)) return 'spam';
  if (/all mail|allmail|所有邮件|全部邮件/.test(lower)) return 'all';
  if (/archive|归档/.test(lower)) return 'archive';
  if (/important|重要/.test(lower)) return 'important';
  return 'folder';
}

export async function listMailboxes(accountId: string): Promise<MailboxInfo[]> {
  return withClient(accountId, async (client) => {
    const listed = await client.list({ statusQuery: { messages: true, unseen: true } });
    const result: MailboxInfo[] = [];
    for (const mb of listed) {
      const role = roleOf(mb.specialUse, mb.flags, mb.path);
      result.push({
        path: mb.path,
        name: mb.name,
        role,
        delimiter: mb.delimiter,
        flags: [...mb.flags],
        specialUse: mb.specialUse,
        subscribed: mb.subscribed,
        listed: mb.listed,
        messages: mb.status?.messages,
        unseen: mb.status?.unseen,
      });
    }
    // 排序：INBOX 优先，然后角色顺序，最后自定义文件夹
    const roleOrder: Record<string, number> = { inbox: 0, sent: 1, drafts: 2, trash: 3, spam: 4, all: 5, archive: 6, important: 7, folder: 8 };
    result.sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.path.localeCompare(b.path));
    return result;
  });
}

/** 根据角色找到最佳文件夹路径；找不到返回 null */
export async function resolveRoleFolder(accountId: string, role: string): Promise<string | null> {
  const mailboxes = await listMailboxes(accountId);
  return mailboxes.find((m) => m.role === role)?.path ?? null;
}

/** 打开指定邮箱并返回基本状态 */
export async function openMailbox(client: ImapFlow, path: string) {
  return client.mailboxOpen(path);
}
