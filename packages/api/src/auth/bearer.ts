import { createHmac, timingSafeEqual } from 'node:crypto';
import { getConfig } from '../config.js';

const SESSION_COOKIE = 'zmail_session';
const TTL_MS = 30 * 24 * 3600 * 1000;

export const sessionCookieName = SESSION_COOKIE;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function signSession(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TTL_MS })).toString('base64url');
  const sig = createHmac('sha256', getConfig().masterKey).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(s: string | undefined): boolean {
  if (!s) return false;
  try {
    const [payload, sig] = s.split('.');
    const expected = createHmac('sha256', getConfig().masterKey).update(payload).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function bearerToken(headers: Record<string, any>): string | null {
  const auth = headers?.authorization || headers?.Authorization;
  if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

/** 鉴权：Authorization: Bearer <API Token> 或已签名的会话 Cookie */
export function isAuthed(headers: Record<string, any>, cookies?: Record<string, any>): boolean {
  const token = bearerToken(headers);
  if (token) {
    return safeEqual(token, getConfig().apiToken);
  }
  return verifySession(cookies?.[SESSION_COOKIE]);
}
