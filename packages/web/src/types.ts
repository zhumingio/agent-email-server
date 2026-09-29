export interface Address {
  name?: string;
  address: string;
}

export interface AccountView {
  id: string;
  name: string;
  email: string;
  provider: string;
  authType: 'password' | 'oauth2';
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  hasPassword: boolean;
  oauthProvider?: 'google' | 'microsoft';
  oauthAuthorized: boolean;
  settings: Record<string, any>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MailboxInfo {
  path: string;
  name: string;
  role: string;
  delimiter: string;
  flags: string[];
  subscribed: boolean;
  listed: boolean;
  messages?: number;
  unseen?: number;
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
  htmlSafe?: string;
  preview?: string;
  attachments: AttachmentInfo[];
  size?: number;
}

export interface ListResult {
  items: MessageListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SendInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: { filename?: string; contentType?: string; content: string }[];
}

export interface SettingsInfo {
  publicBaseUrl: string;
  apiTokenConfigured: boolean;
  apiTokenFromEnv: boolean;
  apiToken: string;
  gmailOAuth: { configured: boolean; clientId: string };
  outlookOAuth: { configured: boolean; clientId: string };
}
