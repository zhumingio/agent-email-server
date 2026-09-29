// 零依赖 PNG 图标生成器：绘制蓝底白色信封（邮件客户端图标）
// 用法: node scripts/gen-icons.mjs <outDir>
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x / size, y / size);
      const off = y * (size * 4 + 1) + 1 + x * 4;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sdSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  const dx = wx - t * vx, dy = wy - t * vy;
  return Math.hypot(dx, dy);
}

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function makePixelFn() {
  const BG = [22, 119, 255];
  const BLUE = [9, 88, 217];
  return (nx, ny) => {
    // 背景圆角方块
    const bg = sdRoundRect(nx, ny, 0.5, 0.5, 0.5, 0.5, 0.22);
    if (bg > 0) return [0, 0, 0, 0];
    // 信封白色主体
    const env = sdRoundRect(nx, ny, 0.5, 0.5, 0.32, 0.22, 0.04);
    if (env > 0) return [...BG, 255];
    // 信封 V 折线（蓝色）
    const sw = 0.055;
    const d1 = sdSegment(nx, ny, 0.18, 0.32, 0.5, 0.5);
    const d2 = sdSegment(nx, ny, 0.82, 0.32, 0.5, 0.5);
    if (Math.min(d1, d2) < sw) return [...BLUE, 255];
    return [255, 255, 255, 255];
  };
}

const outDir = process.argv[2] || 'public/icons';
mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(path.join(outDir, `icon-${size}.png`), encodePng(size, makePixelFn()));
  console.log(`generated icon-${size}.png`);
}
// 兼容 PWA maskable（安全区放大背景）
for (const size of [192, 512]) {
  writeFileSync(path.join(outDir, `maskable-${size}.png`), encodePng(size, (nx, ny) => {
    const [r, g, b, a] = makePixelFn()(nx, ny);
    return a === 255 ? [r, g, b, 255] : [22, 119, 255, 255];
  }));
  console.log(`generated maskable-${size}.png`);
}
