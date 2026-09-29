import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listAccounts } from '../db/store.js';
import type { Account } from '../types.js';
import { listMailboxes } from '../mail/folders.js';
import { listMessages } from '../mail/list.js';
import { fetchMessage, fetchAttachment } from '../mail/message.js';
import { sendMessage, buildReplyInput, buildForwardInput, saveDraft } from '../mail/send.js';
import { markSeen, markFlagged, moveToMailbox, trashMessages, getInboxStatus } from '../mail/actions.js';

function resolveAccount(ref: string): Account {
  const accounts = listAccounts();
  const acc = accounts.find((a) => a.id === ref || a.email === ref || a.name === ref);
  if (!acc) throw new Error(`找不到邮箱账户：${ref}（可用 list_accounts 查看）`);
  return acc;
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { content: [{ type: 'text' as const, text: `错误：${message}` }], isError: true };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'zmail',
    version: '0.1.0',
  });

  server.tool(
    'list_accounts',
    '列出所有已配置的邮箱账户',
    {},
    async () => {
      try {
        const accounts = listAccounts().map((a) => ({
          id: a.id,
          name: a.name,
          email: a.email,
          provider: a.provider,
          authType: a.authType,
          oauthAuthorized: a.oauthAuthorized,
          enabled: a.enabled,
        }));
        return ok(accounts);
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'list_mailboxes',
    '列出某个邮箱账户的全部文件夹（收件箱/已发送/草稿/回收站/垃圾邮件/自定义等）',
    { account: z.string().describe('账户 id 或邮箱地址') },
    async ({ account }) => {
      try {
        const acc = resolveAccount(account);
        return ok(await listMailboxes(acc.id));
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'list_emails',
    '列出某个文件夹的邮件（分页，可按关键词/未读筛选），返回邮件摘要列表',
    {
      account: z.string().describe('账户 id 或邮箱地址'),
      mailbox: z.string().default('INBOX').describe('文件夹路径，如 INBOX、已发送；用 list_mailboxes 查看'),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(30),
      query: z.string().optional().describe('关键词（匹配发件人/主题/正文）'),
      unread: z.boolean().optional().describe('只看未读'),
    },
    async ({ account, mailbox, page, pageSize, query, unread }) => {
      try {
        const acc = resolveAccount(account);
        const res = await listMessages(acc.id, { mailbox, page, pageSize, query, unread });
        return ok(res);
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'search_emails',
    '搜索邮件（跨关键词），返回匹配的邮件摘要',
    {
      account: z.string().describe('账户 id 或邮箱地址'),
      query: z.string().describe('搜索关键词'),
      mailbox: z.string().default('INBOX'),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ account, query, mailbox, limit }) => {
      try {
        const acc = resolveAccount(account);
        const res = await listMessages(acc.id, { mailbox, page: 1, pageSize: limit, query });
        return ok(res);
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'get_email',
    '读取一封邮件的完整内容（正文、附件清单、收发件人等）',
    {
      account: z.string().describe('账户 id 或邮箱地址'),
      mailbox: z.string().describe('邮件所在文件夹路径'),
      uid: z.number().int().positive().describe('邮件 UID（来自 list_emails/search_emails）'),
    },
    async ({ account, mailbox, uid }) => {
      try {
        const acc = resolveAccount(account);
        const msg = await fetchMessage(acc.id, mailbox, uid);
        if (!msg) return err('未找到该邮件');
        return ok(msg);
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'get_attachment',
    '下载某封邮件的附件（返回 base64 内容）',
    {
      account: z.string().describe('账户 id 或邮箱地址'),
      mailbox: z.string(),
      uid: z.number().int().positive(),
      index: z.number().int().min(0).describe('附件序号（来自 get_email 的 attachments）'),
    },
    async ({ account, mailbox, uid, index }) => {
      try {
        const acc = resolveAccount(account);
        const att = await fetchAttachment(acc.id, mailbox, uid, index);
        if (!att) return err('附件不存在');
        return ok(att);
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'get_unread_counts',
    '获取账户收件箱的未读邮件数',
    { account: z.string().optional().describe('不传则返回所有账户') },
    async ({ account }) => {
      try {
        if (account) {
          const acc = resolveAccount(account);
          return ok(await getInboxStatus(acc.id));
        }
        const results = await Promise.all(
          listAccounts().filter((a) => a.enabled).map((a) => getInboxStatus(a.id).catch(() => ({ accountId: a.id, messages: 0, unseen: 0 })))
        );
        return ok(results);
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'send_email',
    '发送一封新邮件',
    {
      account: z.string().describe('账户 id 或邮箱地址'),
      to: z.array(z.string().email()).min(1).describe('收件人邮箱列表'),
      cc: z.array(z.string().email()).optional(),
      bcc: z.array(z.string().email()).optional(),
      subject: z.string(),
      text: z.string().optional().describe('纯文本正文'),
      html: z.string().optional().describe('HTML 正文'),
      attachments: z.array(z.object({
        filename: z.string().optional(),
        contentType: z.string().optional(),
        content: z.string().describe('base64 编码的文件内容'),
      })).optional(),
    },
    async ({ account, to, cc, bcc, subject, text, html, attachments }) => {
      try {
        const acc = resolveAccount(account);
        const res = await sendMessage(acc.id, { to, cc, bcc, subject, text, html, attachments });
        return ok({ sent: true, ...res });
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'reply_email',
    '回复某封邮件（自动携带原主题/引用/收件人）',
    {
      account: z.string().describe('账户 id 或邮箱地址'),
      mailbox: z.string(),
      uid: z.number().int().positive(),
      body: z.string().describe('回复正文'),
      all: z.boolean().default(false).describe('是否回复全部（含抄送）'),
    },
    async ({ account, mailbox, uid, body, all }) => {
      try {
        const acc = resolveAccount(account);
        const original = await fetchMessage(acc.id, mailbox, uid);
        if (!original) return err('未找到原邮件');
        const input = buildReplyInput(original, body, { all });
        const res = await sendMessage(acc.id, input);
        return ok({ sent: true, inReplyTo: original.messageId, ...res });
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'forward_email',
    '转发某封邮件给其他收件人',
    {
      account: z.string().describe('账户 id 或邮箱地址'),
      mailbox: z.string(),
      uid: z.number().int().positive(),
      to: z.array(z.string().email()).min(1),
      body: z.string().optional().describe('附加说明'),
    },
    async ({ account, mailbox, uid, to, body }) => {
      try {
        const acc = resolveAccount(account);
        const original = await fetchMessage(acc.id, mailbox, uid);
        if (!original) return err('未找到原邮件');
        const input = buildForwardInput(original, to, body || '');
        const res = await sendMessage(acc.id, input);
        return ok({ sent: true, ...res });
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'save_draft',
    '保存邮件草稿到草稿箱',
    {
      account: z.string().describe('账户 id 或邮箱地址'),
      to: z.array(z.string().email()).optional(),
      cc: z.array(z.string().email()).optional(),
      bcc: z.array(z.string().email()).optional(),
      subject: z.string(),
      text: z.string().optional(),
      html: z.string().optional(),
    },
    async ({ account, to, cc, bcc, subject, text, html }) => {
      try {
        const acc = resolveAccount(account);
        const res = await saveDraft(acc.id, { to: to || [], cc, bcc, subject, text, html });
        return ok(res);
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'mark_read',
    '将邮件标记为已读',
    { account: z.string(), mailbox: z.string(), uids: z.array(z.number().int().positive()) },
    async ({ account, mailbox, uids }) => {
      try {
        const acc = resolveAccount(account);
        await markSeen(acc.id, mailbox, uids, true);
        return ok({ marked: 'read', uids });
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'mark_unread',
    '将邮件标记为未读',
    { account: z.string(), mailbox: z.string(), uids: z.array(z.number().int().positive()) },
    async ({ account, mailbox, uids }) => {
      try {
        const acc = resolveAccount(account);
        await markSeen(acc.id, mailbox, uids, false);
        return ok({ marked: 'unread', uids });
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'mark_flagged',
    '设置/取消邮件星标',
    { account: z.string(), mailbox: z.string(), uids: z.array(z.number().int().positive()), flagged: z.boolean() },
    async ({ account, mailbox, uids, flagged }) => {
      try {
        const acc = resolveAccount(account);
        await markFlagged(acc.id, mailbox, uids, flagged);
        return ok({ flagged, uids });
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'move_email',
    '将邮件移动到其他文件夹',
    {
      account: z.string(),
      mailbox: z.string().describe('当前所在文件夹'),
      uids: z.array(z.number().int().positive()),
      target: z.string().describe('目标文件夹路径（用 list_mailboxes 查看）'),
    },
    async ({ account, mailbox, uids, target }) => {
      try {
        const acc = resolveAccount(account);
        await moveToMailbox(acc.id, mailbox, uids, target);
        return ok({ moved: true, uids, from: mailbox, to: target });
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  server.tool(
    'trash_email',
    '将邮件移入回收站（若已在回收站则彻底删除）',
    { account: z.string(), mailbox: z.string(), uids: z.array(z.number().int().positive()) },
    async ({ account, mailbox, uids }) => {
      try {
        const acc = resolveAccount(account);
        await trashMessages(acc.id, mailbox, uids);
        return ok({ trashed: true, uids });
      } catch (e) {
        return err(String((e as Error).message));
      }
    }
  );

  return server;
}
