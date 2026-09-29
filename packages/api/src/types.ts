export type Provider = '163' | 'qq' | '126' | 'sina' | 'outlook' | 'gmail' | 'custom';
export type AuthType = 'password' | 'oauth2';
export type OAuthProvider = 'google' | 'microsoft';

/** 账户内部表示（含解密后的凭据，仅内存/服务端使用，不直接返回给前端） */
export interface Account {
  id: string;
  name: string;
  email: string;
  provider: Provider;
  authType: AuthType;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  /** 授权码 / 应用专用密码（authType=password，内存中解密） */
  password?: string;
  oauthProvider?: OAuthProvider;
  /** 是否已通过 OAuth 授权（有 refresh token） */
  oauthAuthorized: boolean;
  settings: AccountSettings;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 返回给前端的账户视图（不含任何凭据明文） */
export type AccountView = Omit<Account, 'password' | 'oauthProvider' | 'oauthAuthorized'> & {
  hasPassword: boolean;
  oauthProvider?: OAuthProvider;
  oauthAuthorized: boolean;
};

export interface AccountSettings {
  /** 角色 -> 文件夹路径覆盖（例如 inbox/sent/drafts/trash/spam/all/archive） */
  folders?: Record<string, string>;
  /** 签名（HTML） */
  signature?: string;
  /** 每页条数 */
  pageSize?: number;
  /** 发送后是否同时在服务器保存到已发送 */
  saveSentCopy?: boolean;
}

export interface MailboxInfo {
  path: string;
  name: string;
  role: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'all' | 'archive' | 'important' | 'folder';
  delimiter: string;
  flags: string[];
  specialUse?: string;
  subscribed: boolean;
  listed: boolean;
  messages?: number;
  unseen?: number;
}

export interface Address {
  name?: string;
  address: string;
}

export interface MessageListItem {
  uid: number;
  mailbox: string;
  subject: string;
  from: Address[];
  to: Address[];
  date?: string;
  flags: string[];
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  size?: number;
  hasAttachments: boolean;
  preview?: string;
  messageId?: string;
}

export interface AttachmentInfo {
  index: number;
  filename?: string;
  contentType?: string;
  size?: number;
  contentId?: string;
  /** base64 内容（仅下载时返回） */
  data?: string;
  /** 是否为内联图片 */
  related?: boolean;
}

export interface MessageDetail {
  uid: number;
  mailbox: string;
  subject: string;
  from: Address[];
  replyTo?: Address[];
  to: Address[];
  cc: Address[];
  date?: string;
  flags: string[];
  seen: boolean;
  flagged: boolean;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  text?: string;
  html?: string;
  /** 净化后的 HTML，用于 Web 渲染 */
  htmlSafe?: string;
  preview?: string;
  attachments: AttachmentInfo[];
  size?: number;
}

export interface SendInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  messageId?: string;
  attachments?: { filename?: string; contentType?: string; content: string }[];
}
