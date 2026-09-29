import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';
import { decrypt, encrypt } from '../security.js';
import type { Account, AccountSettings } from '../types.js';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(getConfig().dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  initSchema(db);
  return db;
}

function initSchema(d: DatabaseSync) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      provider TEXT NOT NULL,
      auth_type TEXT NOT NULL,
      imap_host TEXT NOT NULL DEFAULT '',
      imap_port INTEGER NOT NULL DEFAULT 993,
      imap_secure INTEGER NOT NULL DEFAULT 1,
      smtp_host TEXT NOT NULL DEFAULT '',
      smtp_port INTEGER NOT NULL DEFAULT 465,
      smtp_secure INTEGER NOT NULL DEFAULT 1,
      username TEXT NOT NULL DEFAULT '',
      cred_enc TEXT,
      oauth_provider TEXT,
      oauth_refresh_enc TEXT,
      oauth_access_enc TEXT,
      oauth_expires_at INTEGER,
      settings TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      push_token TEXT,
      last_seen TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function rowToAccount(r: Record<string, any>): Account {
  const settings = parseJson<AccountSettings>(r.settings, {});
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    provider: r.provider,
    authType: r.auth_type,
    imapHost: r.imap_host,
    imapPort: r.imap_port,
    imapSecure: !!r.imap_secure,
    smtpHost: r.smtp_host,
    smtpPort: r.smtp_port,
    smtpSecure: !!r.smtp_secure,
    username: r.username,
    password: r.auth_type === 'password' ? (decrypt(r.cred_enc) ?? undefined) : undefined,
    oauthProvider: r.oauth_provider,
    oauthAuthorized: !!(r.oauth_refresh_enc || r.oauth_access_enc),
    settings,
    enabled: !!r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export interface AccountInput {
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
  password?: string;
  oauthProvider?: 'google' | 'microsoft';
  settings?: Partial<AccountSettings>;
  enabled?: boolean;
}

export function listAccounts(): Account[] {
  const d = getDb();
  const rows = d.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all() as any[];
  return rows.map(rowToAccount);
}

export function getAccount(id: string): Account | null {
  const d = getDb();
  const row = d.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any;
  return row ? rowToAccount(row) : null;
}

export function createAccount(input: AccountInput): Account {
  const d = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  d.prepare(
    `INSERT INTO accounts (id, name, email, provider, auth_type, imap_host, imap_port, imap_secure,
      smtp_host, smtp_port, smtp_secure, username, cred_enc, oauth_provider, settings, enabled, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, input.name, input.email, input.provider, input.authType,
    input.imapHost, input.imapPort, input.imapSecure ? 1 : 0,
    input.smtpHost, input.smtpPort, input.smtpSecure ? 1 : 0,
    input.username,
    input.password ? encrypt(input.password) : null,
    input.oauthProvider ?? null,
    JSON.stringify(input.settings ?? {}),
    input.enabled === false ? 0 : 1,
    now, now
  );
  return getAccount(id)!;
}

export function updateAccount(id: string, patch: Partial<AccountInput>): Account | null {
  const d = getDb();
  const existing = getAccount(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const merged = { ...existing, ...patch, updatedAt: now };
  d.prepare(
    `UPDATE accounts SET name=?, email=?, provider=?, auth_type=?, imap_host=?, imap_port=?, imap_secure=?,
      smtp_host=?, smtp_port=?, smtp_secure=?, username=?, cred_enc=?, oauth_provider=?, settings=?, enabled=?, updated_at=?
     WHERE id=?`
  ).run(
    merged.name, merged.email, merged.provider, merged.authType,
    merged.imapHost, merged.imapPort, merged.imapSecure ? 1 : 0,
    merged.smtpHost, merged.smtpPort, merged.smtpSecure ? 1 : 0,
    merged.username,
    patch.password !== undefined ? (patch.password ? encrypt(patch.password) : null) : (existing.password ? encrypt(existing.password) : null),
    merged.oauthProvider ?? null,
    JSON.stringify(merged.settings ?? {}),
    merged.enabled ? 1 : 0,
    now, id
  );
  return getAccount(id);
}

export function deleteAccount(id: string): void {
  const d = getDb();
  d.prepare('DELETE FROM accounts WHERE id = ?').run(id);
}

/** OAuth 令牌持久化（仅 oauth2 账户） */
export function setOAuthTokens(id: string, tokens: { refreshToken?: string; accessToken?: string; expiresAt?: number }): void {
  const d = getDb();
  d.prepare('UPDATE accounts SET oauth_refresh_enc=?, oauth_access_enc=?, oauth_expires_at=? WHERE id=?').run(
    tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    tokens.accessToken ? encrypt(tokens.accessToken) : null,
    tokens.expiresAt ?? null,
    id
  );
}

export function getOAuthTokens(id: string): { refreshToken: string | null; accessToken: string | null; expiresAt: number | null } {
  const d = getDb();
  const row = d.prepare('SELECT oauth_refresh_enc, oauth_access_enc, oauth_expires_at FROM accounts WHERE id=?').get(id) as any;
  if (!row) return { refreshToken: null, accessToken: null, expiresAt: null };
  return {
    refreshToken: decrypt(row.oauth_refresh_enc),
    accessToken: decrypt(row.oauth_access_enc),
    expiresAt: row.oauth_expires_at,
  };
}

export function getAppSetting(key: string): string | null {
  const d = getDb();
  const row = d.prepare('SELECT value FROM app_settings WHERE key=?').get(key) as any;
  return row ? row.value : null;
}

export function setAppSetting(key: string, value: string): void {
  const d = getDb();
  d.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

// ---------- App 设备注册 ----------
export interface DeviceRecord {
  deviceId: string;
  platform: string;
  pushToken: string | null;
  lastSeen: string;
  createdAt: string;
}

export function listDevices(): DeviceRecord[] {
  const d = getDb();
  const rows = d.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all() as any[];
  return rows.map((r) => ({
    deviceId: r.device_id,
    platform: r.platform,
    pushToken: r.push_token,
    lastSeen: r.last_seen,
    createdAt: r.created_at,
  }));
}

export function upsertDevice(input: { deviceId: string; platform: string; pushToken?: string | null }): DeviceRecord {
  const d = getDb();
  const now = new Date().toISOString();
  const existing = d.prepare('SELECT * FROM devices WHERE device_id=?').get(input.deviceId) as any;
  if (existing) {
    d.prepare('UPDATE devices SET platform=?, push_token=?, last_seen=? WHERE device_id=?').run(
      input.platform, input.pushToken ?? null, now, input.deviceId
    );
  } else {
    d.prepare('INSERT INTO devices (device_id, platform, push_token, last_seen, created_at) VALUES (?,?,?,?,?)').run(
      input.deviceId, input.platform, input.pushToken ?? null, now, now
    );
  }
  const row = d.prepare('SELECT * FROM devices WHERE device_id=?').get(input.deviceId) as any;
  return {
    deviceId: row.device_id,
    platform: row.platform,
    pushToken: row.push_token,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
  };
}

export function deleteDevice(deviceId: string): boolean {
  const d = getDb();
  const res = d.prepare('DELETE FROM devices WHERE device_id=?').run(deviceId);
  return res.changes > 0;
}
