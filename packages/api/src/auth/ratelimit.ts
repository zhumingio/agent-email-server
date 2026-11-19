/**
 * 极简内存滑动窗口限流器（单实例部署足够）。
 * 目前用于 /api/auth/login 防暴力猜测与滥用；进程重启即清零。
 */
interface Window {
  hits: number[];
}

const buckets = new Map<string, Window>();
const SWEEP_INTERVAL_MS = 10 * 60_000;
let sweeper: NodeJS.Timeout | null = null;

function sweep(windowMs: number) {
  const now = Date.now();
  for (const [key, w] of buckets) {
    w.hits = w.hits.filter((t) => now - t < windowMs);
    if (w.hits.length === 0) buckets.delete(key);
  }
}

function ensureSweeper(windowMs: number) {
  if (sweeper) return;
  sweeper = setInterval(() => sweep(windowMs), SWEEP_INTERVAL_MS);
  // 不要阻止进程退出
  sweeper.unref?.();
}

export interface LimitResult {
  allowed: boolean;
  /** 剩余可尝试次数 */
  remaining: number;
  /** 建议的 Retry-After 秒数（不允许时） */
  retryAfterSec: number;
}

export function checkLimit(key: string, max: number, windowMs: number): LimitResult {
  ensureSweeper(windowMs);
  const now = Date.now();
  const w = buckets.get(key) ?? { hits: [] };
  w.hits = w.hits.filter((t) => now - t < windowMs);
  buckets.set(key, w);
  if (w.hits.length >= max) {
    const oldest = w.hits[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  return { allowed: true, remaining: max - w.hits.length, retryAfterSec: 0 };
}

export function recordHit(key: string): void {
  const w = buckets.get(key) ?? { hits: [] };
  w.hits.push(Date.now());
  buckets.set(key, w);
}

export function resetLimit(key: string): void {
  buckets.delete(key);
}
