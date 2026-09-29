import { withClient } from './connector.js';
import type { MessageListItem } from '../types.js';

export interface ListParams {
  mailbox: string;
  page?: number;
  pageSize?: number;
  query?: string;
  unread?: boolean;
  flagged?: boolean;
}

/** 轻量解码：用于列表页摘要（quoted-printable / base64 / HTML 剥离） */
export function decodeSnippet(buf: Buffer | undefined, maxLen = 300): string | undefined {
  if (!buf || buf.length === 0) return undefined;
  let s = buf.toString('utf8');
  if (/=\r?\n|=[0-9A-F]{2}/i.test(s) && /[^=]=[0-9A-F]{2}/i.test(s)) {
    s = s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  } else if (/^[A-Za-z0-9+/=\r\n]+$/.test(s) && s.includes('=') && s.replace(/[\s=]/g, '').length > 40) {
    try {
      s = Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch { /* ignore */ }
  }
  s = s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

export interface ListResult {
  items: MessageListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listMessages(accountId: string, params: ListParams): Promise<ListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));

  return withClient(accountId, async (client) => {
    await client.mailboxOpen(params.mailbox);

    let uids: number[];
    if (params.query || params.unread || params.flagged) {
      const search: Record<string, unknown> = {};
      if (params.unread) search.seen = false;
      if (params.flagged) search.flagged = true;
      if (params.query) {
        const q = params.query.trim();
        search.or = [{ from: q }, { subject: q }, { body: q }, { to: q }];
      }
      if (!params.query && !params.unread && !params.flagged) search.all = true;
      const res = await client.search(search as any, { uid: true });
      uids = (res || []).sort((a, b) => b - a);
    } else {
      const res = await client.search({ all: true }, { uid: true });
      uids = (res || []).sort((a, b) => b - a);
    }

    const total = uids.length;
    const offset = (page - 1) * pageSize;
    const pageUids = uids.slice(offset, offset + pageSize);
    const items: MessageListItem[] = [];

    if (pageUids.length > 0) {
      const it = client.fetch(pageUids, {
        uid: true, envelope: true, flags: true, internalDate: true, size: true, bodyStructure: true,
        bodyParts: [{ key: 'TEXT', maxLength: 400 }],
      }, { uid: true });
      for await (const msg of it) {
        const flags = msg.flags ? [...msg.flags] : [];
        const hasAttachments = hasAttachmentFlag(msg);
        const preview = decodeSnippet(msg.bodyParts?.get('TEXT'));
        items.push({
          uid: msg.uid,
          mailbox: params.mailbox,
          subject: msg.envelope?.subject || '(无主题)',
          from: msg.envelope?.from?.map((a) => ({ name: a.name, address: a.address ?? '' })) ?? [],
          to: msg.envelope?.to?.map((a) => ({ name: a.name, address: a.address ?? '' })) ?? [],
          date: msg.internalDate instanceof Date ? msg.internalDate.toISOString() : String(msg.internalDate),
          flags,
          seen: flags.includes('\\Seen'),
          flagged: flags.includes('\\Flagged'),
          answered: flags.includes('\\Answered'),
          size: msg.size,
          hasAttachments,
          preview,
          messageId: msg.envelope?.messageId,
        });
      }
      items.sort((a, b) => b.uid - a.uid);
    }

    return { items, total, page, pageSize };
  });
}

/** 通过 bodyStructure 判断是否有附件（存在非 text/html 的多部分或带 filename 的部分） */
export function hasAttachmentFlag(msg: { bodyStructure?: any }): boolean {
  const bs = msg.bodyStructure;
  if (!bs) return false;
  const stack: any[] = [bs];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.disposition === 'attachment') return true;
    if (node.parameters?.filename || node.dispositionParameters?.filename) return true;
    if (Array.isArray(node.childNodes)) stack.push(...node.childNodes);
    if (Array.isArray(node.parts)) stack.push(...node.parts);
    if (node.type && node.subtype && !['text', 'multipart'].includes(node.type)) {
      // 非 text 叶子部分视为附件（如 application/pdf、image/png 内联除外）
      if (node.disposition !== 'inline') return true;
    }
  }
  return false;
}
