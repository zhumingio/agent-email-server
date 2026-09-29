import nodemailer, { type Transporter } from 'nodemailer';
import { getAccount } from '../db/store.js';
import { getAccessToken } from '../oauth/oauth.js';
import { withClient } from './connector.js';
import { resolveRoleFolder } from './folders.js';
import type { Account, MessageDetail, SendInput } from '../types.js';

async function buildTransporter(account: Account): Promise<Transporter> {
  if (account.authType === 'oauth2' && account.oauthProvider) {
    const accessToken = await getAccessToken(account);
    return nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      auth: { type: 'OAuth2', user: account.username || account.email, accessToken },
    });
  }
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    auth: { user: account.username || account.email, pass: account.password || '' },
  });
}

function mailOptions(account: Account, input: SendInput): Record<string, unknown> {
  const from = account.name ? `"${account.name.replace(/"/g, '')}" <${account.email}>` : account.email;
  const opts: Record<string, unknown> = {
    from,
    to: input.to,
    cc: input.cc?.length ? input.cc : undefined,
    bcc: input.bcc?.length ? input.bcc : undefined,
    subject: input.subject,
    text: input.text || undefined,
    html: input.html || undefined,
    inReplyTo: input.inReplyTo || undefined,
    references: input.references?.length ? input.references : undefined,
  };
  if (input.attachments?.length) {
    opts.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      content: Buffer.from(a.content, 'base64'),
    }));
  }
  return opts;
}

/** 用 jsonTransport 生成 RFC822 原文（用于保存到已发送等） */
async function buildRaw(account: Account, input: SendInput): Promise<string> {
  const jsonTrans = nodemailer.createTransport({ jsonTransport: true });
  const info = await jsonTrans.sendMail(mailOptions(account, input));
  return (info as any).message;
}

export interface SendResult {
  accepted: string[];
  rejected: string[];
  messageId?: string;
}

export async function sendMessage(accountId: string, input: SendInput): Promise<SendResult> {
  const account = getAccount(accountId);
  if (!account) throw new Error('账户不存在');
  const transporter = await buildTransporter(account);
  const info = await transporter.sendMail(mailOptions(account, input));

  // 保存到已发送（可选；主流服务商(Gmail/163/QQ/Outlook)发送后会自动归档到已发送，
  // 默认不重复追加以避免重复。自建/特殊服务器可在账户 settings.saveSentCopy 开启）
  const settings = account.settings || {};
  const saveSent = settings.saveSentCopy === true;
  if (saveSent) {
    try {
      const raw = await buildRaw(account, input);
      const sentPath = await resolveRoleFolder(accountId, 'sent');
      if (sentPath) {
        await withClient(accountId, (client) => client.append(sentPath, raw, ['\\Seen'], new Date()));
      }
    } catch { /* 保存失败不影响发送结果 */ }
  }

  return {
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    messageId: (info as any).messageId,
  };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 构造回复内容 */
export function buildReplyInput(original: MessageDetail, body: string, opts: { all?: boolean; cc?: string[] } = {}): SendInput {
  const recipients = original.replyTo?.length ? original.replyTo : original.from;
  const to = recipients.map((a) => a.address);
  const cc: string[] = [];
  if (opts.all) {
    const fromAddrs = original.from.map((a) => a.address);
    for (const a of [...original.to, ...(original.cc || [])]) {
      if (a.address && !to.includes(a.address) && !fromAddrs.includes(a.address)) cc.push(a.address);
    }
    if (opts.cc) cc.push(...opts.cc);
  } else if (opts.cc) {
    cc.push(...opts.cc);
  }
  const quoted = `\n\n${original.from?.[0]?.name || original.from?.[0]?.address || ''} 写道：\n> ${stripTags(original.text || original.htmlSafe || original.preview || '').split('\n').join('\n> ')}`;
  return {
    to,
    cc: cc.length ? cc : undefined,
    subject: /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`,
    text: body + quoted,
    html: `<p>${escapeHtml(body).replace(/\n/g, '<br/>')}</p><br/><blockquote>${original.htmlSafe || ''}</blockquote>`,
    inReplyTo: original.messageId,
    references: [...(original.references || []), original.messageId].filter(Boolean) as string[],
  };
}

export function buildForwardInput(original: MessageDetail, to: string[], body: string): SendInput {
  const quoted = `\n\n---------- 转发邮件 ----------\n发件人: ${original.from?.[0]?.address || ''}\n日期: ${original.date || ''}\n主题: ${original.subject}\n\n${stripTags(original.text || original.preview || '')}`;
  return {
    to,
    subject: /^fwd:/i.test(original.subject) ? original.subject : `Fwd: ${original.subject}`,
    text: body + quoted,
    html: `<p>${escapeHtml(body).replace(/\n/g, '<br/>')}</p><br/><blockquote>${original.htmlSafe || ''}</blockquote>`,
  };
}

export async function saveDraft(accountId: string, input: SendInput): Promise<{ saved: boolean; mailbox?: string }> {
  const account = getAccount(accountId);
  if (!account) throw new Error('账户不存在');
  const raw = await buildRaw(account, input);
  const draftsPath = await resolveRoleFolder(accountId, 'drafts');
  if (!draftsPath) return { saved: false };
  await withClient(accountId, (client) => client.append(draftsPath, raw, ['\\Seen', '\\Draft'], new Date()));
  return { saved: true, mailbox: draftsPath };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
