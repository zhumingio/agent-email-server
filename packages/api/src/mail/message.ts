import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import { withClient } from './connector.js';
import type { Address, AttachmentInfo, MessageDetail } from '../types.js';
import { decodeSnippet } from './list.js';

export interface MessageOptions {
  /** 是否允许渲染远程图片（默认 false，安全考虑） */
  loadRemoteImages?: boolean;
}

const sanitizeConfig = (loadRemoteImages: boolean) => ({
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'del', 'ins', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'b', 'strong', 'i', 'em', 'u', 's', 'span', 'div', 'font']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'width', 'height', 'title'],
    a: ['href', 'title', 'target', 'rel'],
    td: ['colspan', 'rowspan', 'align', 'width'],
    th: ['colspan', 'rowspan', 'align', 'width'],
    table: ['border', 'cellpadding', 'cellspacing', 'width'],
    span: ['style'],
    div: ['style'],
    p: ['style'],
    font: ['color', 'face', 'size'],
  },
  allowedSchemes: ['data', 'cid', ...(loadRemoteImages ? ['http', 'https', 'mailto'] : [])],
  allowedSchemesByTag: { img: ['data', 'cid', ...(loadRemoteImages ? ['http', 'https'] : [])] },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    script: () => ({ tagName: 'span', attribs: {} }),
    style: () => ({ tagName: 'span', attribs: {} }),
  },
  exclusiveFilter: (frame: any) => {
    if (frame.tag === 'img' && !loadRemoteImages) {
      const src = frame.attribs?.src || '';
      if (/^https?:/i.test(src)) return true; // 屏蔽远程图片
    }
    return false;
  },
});

function mapAddresses(v: any): Address[] {
  if (!v) return [];
  const value = v.value || v;
  if (!Array.isArray(value)) return [];
  return value.map((a: any) => ({ name: a.name || undefined, address: a.address || '' })).filter((a) => a.address);
}

export async function fetchMessage(accountId: string, mailbox: string, uid: number, opts: MessageOptions = {}): Promise<MessageDetail | null> {
  return withClient(accountId, async (client) => {
    await client.mailboxOpen(mailbox);
    const msg = await client.fetchOne(uid, {
      uid: true, source: true, envelope: true, flags: true, internalDate: true, size: true, bodyStructure: true,
    }, { uid: true });
    if (!msg) return null;

    const parsed = await simpleParser(msg.source!);
    const flags = msg.flags ? [...msg.flags] : [];
    const attachments: AttachmentInfo[] = (parsed.attachments || []).map((att, i) => ({
      index: i,
      filename: att.filename || att.cid || `attachment-${i + 1}`,
      contentType: att.contentType,
      size: att.size,
      contentId: att.cid,
      related: !!att.related,
    }));

    let htmlSafe: string | undefined;
    if (parsed.html) {
      htmlSafe = sanitizeHtml(parsed.html, sanitizeConfig(!!opts.loadRemoteImages) as any);
    }

    return {
      uid,
      mailbox,
      subject: parsed.subject || '(无主题)',
      from: mapAddresses(parsed.from),
      replyTo: mapAddresses(parsed.replyTo),
      to: mapAddresses(parsed.to),
      cc: mapAddresses(parsed.cc),
      date: parsed.date?.toISOString() || (msg.internalDate instanceof Date ? msg.internalDate.toISOString() : undefined),
      flags,
      seen: flags.includes('\\Seen'),
      flagged: flags.includes('\\Flagged'),
      messageId: parsed.messageId,
      inReplyTo: parsed.inReplyTo,
      references: Array.isArray(parsed.references) ? parsed.references : (parsed.references ? [parsed.references] : []),
      text: parsed.text || undefined,
      html: parsed.html || undefined,
      htmlSafe,
      preview: decodeSnippet(Buffer.from(parsed.text || '')),
      attachments,
      size: msg.size,
    };
  });
}

export interface AttachmentDownload {
  index: number;
  filename?: string;
  contentType?: string;
  size?: number;
  contentId?: string;
  data: string;
}

export async function fetchAttachment(accountId: string, mailbox: string, uid: number, index: number): Promise<AttachmentDownload | null> {
  return withClient(accountId, async (client) => {
    await client.mailboxOpen(mailbox);
    const msg = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
    if (!msg) return null;
    const parsed = await simpleParser(msg.source!);
    const att = parsed.attachments?.[index];
    if (!att) return null;
    return {
      index,
      filename: att.filename || att.cid || `attachment-${index + 1}`,
      contentType: att.contentType,
      size: att.size,
      contentId: att.cid,
      data: att.content?.toString('base64') || '',
    };
  });
}
