import type { Provider } from '../types.js';

export interface ProviderPreset {
  provider: Provider;
  label: string;
  authType: 'password' | 'oauth2';
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  oauthProvider?: 'google' | 'microsoft';
  /** 角色文件夹的默认映射（仅作为兜底，实际以服务器 special-use 为准） */
  folders: Record<string, string>;
  hint?: string;
}

export const PROVIDER_PRESETS: Record<Provider, ProviderPreset> = {
  '163': {
    provider: '163', label: '网易 163 邮箱', authType: 'password',
    imapHost: 'imap.163.com', imapPort: 993, imapSecure: true,
    smtpHost: 'smtp.163.com', smtpPort: 465, smtpSecure: true,
    folders: { inbox: 'INBOX', sent: '已发送', drafts: '草稿箱', trash: '已删除', spam: '垃圾邮件' },
    hint: '需在 163 邮箱网页端开启 IMAP/SMTP 并获取「授权码」',
  },
  'qq': {
    provider: 'qq', label: 'QQ 邮箱', authType: 'password',
    imapHost: 'imap.qq.com', imapPort: 993, imapSecure: true,
    smtpHost: 'smtp.qq.com', smtpPort: 465, smtpSecure: true,
    folders: { inbox: 'INBOX', sent: 'Sent Messages', drafts: 'Drafts', trash: 'Deleted Messages', spam: 'Spam' },
    hint: '需在 QQ 邮箱设置中开启 IMAP/SMTP 并生成「授权码」',
  },
  '126': {
    provider: '126', label: '网易 126 邮箱', authType: 'password',
    imapHost: 'imap.126.com', imapPort: 993, imapSecure: true,
    smtpHost: 'smtp.126.com', smtpPort: 465, smtpSecure: true,
    folders: { inbox: 'INBOX', sent: '已发送', drafts: '草稿箱', trash: '已删除', spam: '垃圾邮件' },
    hint: '需在 126 邮箱网页端开启 IMAP/SMTP 并获取「授权码」',
  },
  'sina': {
    provider: 'sina', label: '新浪邮箱', authType: 'password',
    imapHost: 'imap.sina.com.cn', imapPort: 993, imapSecure: true,
    smtpHost: 'smtp.sina.com.cn', smtpPort: 465, smtpSecure: true,
    folders: { inbox: 'INBOX', sent: '已发送', drafts: '草稿箱', trash: '已删除', spam: '垃圾邮件' },
    hint: '需在新浪邮箱设置中开启 IMAP/SMTP',
  },
  'gmail': {
    provider: 'gmail', label: 'Gmail（Google）', authType: 'oauth2',
    imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true,
    smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecure: true,
    oauthProvider: 'google',
    folders: { inbox: 'INBOX', sent: '[Gmail]/Sent Mail', drafts: '[Gmail]/Drafts', trash: '[Gmail]/Trash', spam: '[Gmail]/Spam', all: '[Gmail]/All Mail' },
    hint: '需在 Google Cloud 创建 OAuth 客户端，并在设置中配置后授权',
  },
  'outlook': {
    provider: 'outlook', label: 'Outlook（Microsoft）', authType: 'oauth2',
    imapHost: 'outlook.office365.com', imapPort: 993, imapSecure: true,
    smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false,
    oauthProvider: 'microsoft',
    folders: { inbox: 'INBOX', sent: 'Sent', drafts: 'Drafts', trash: 'Deleted Items', spam: 'Junk Email', archive: 'Archive' },
    hint: '需在 Microsoft Entra 注册应用，并在设置中配置后授权',
  },
  'custom': {
    provider: 'custom', label: '自定义邮箱', authType: 'password',
    imapHost: '', imapPort: 993, imapSecure: true,
    smtpHost: '', smtpPort: 465, smtpSecure: true,
    folders: { inbox: 'INBOX' },
    hint: '自填 IMAP/SMTP 服务器与端口',
  },
};

export function getPreset(provider: Provider): ProviderPreset {
  return PROVIDER_PRESETS[provider] ?? PROVIDER_PRESETS.custom;
}

export function providerLabels(): { provider: Provider; label: string; authType: 'password' | 'oauth2' }[] {
  return Object.values(PROVIDER_PRESETS).map((p) => ({ provider: p.provider, label: p.label, authType: p.authType }));
}
