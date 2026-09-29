// 生成 Android 启动图标：自适应前景（白色信封+透明V，透明底）+ 传统全彩图标
// 用法: node gen-android-icons.mjs <androidResDir>
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
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x / size, y / size);
      const off = y * (size * 4 + 1) + 1 + x * 4;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function sdSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(wx - t * vx, wy - t * vy);
}
function sdRR(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r), qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

const BLUE = [22, 119, 255];

// 自适应前景：白信封 + 透明V（让背景色透出），居中安全区（~62%）
function foregroundPixel(nx, ny) {
  const cx = 0.5, cy = 0.5;
  const env = sdRR(nx, ny, cx, cy, 0.30, 0.20, 0.05);
  if (env > 0) return [0, 0, 0, 0];
  const sw = 0.06;
  const d1 = sdSeg(nx, ny, 0.2, 0.33, 0.5, 0.5);
  const d2 = sdSeg(nx, ny, 0.8, 0.33, 0.5, 0.5);
  if (Math.min(d1, d2) < sw) return [0, 0, 0, 0];
  return [255, 255, 255, 255];
}

// 传统图标：蓝底白信封+深蓝V（全幅）
function legacyPixel(nx, ny) {
  const bg = sdRR(nx, ny, 0.5, 0.5, 0.5, 0.5, 0.22);
  if (bg > 0) return [0, 0, 0, 0];
  const env = sdRR(nx, ny, 0.5, 0.5, 0.32, 0.22, 0.04);
  if (env > 0) return [...BLUE, 255];
  const sw = 0.055;
  const d1 = sdSeg(nx, ny, 0.18, 0.32, 0.5, 0.5);
  const d2 = sdSeg(nx, ny, 0.82, 0.32, 0.5, 0.5);
  if (Math.min(d1, d2) < sw) return [9, 88, 217, 255];
  return [255, 255, 255, 255];
}

const resDir = process.argv[2];
if (!resDir) { console.error('usage: node gen-android-icons.mjs <resDir>'); process.exit(1); }

// 前景：mdpi108 hdpi162 xhdpi216 xxhdpi324 xxxhdpi432
const fg = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [dpi, size] of Object.entries(fg)) {
  writeFileSync(path.join(resDir, `mipmap-${dpi}`, 'ic_launcher_foreground.png'), encodePng(size, foregroundPixel));
  console.log(`foreground ${dpi} ${size}`);
}
// 传统：mdpi48 hdpi72 xhdpi96 xxhdpi144 xxxhdpi192
const leg = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [dpi, size] of Object.entries(leg)) {
  const png = encodePng(size, legacyPixel);
  writeFileSync(path.join(resDir, `mipmap-${dpi}`, 'ic_launcher.png'), png);
  writeFileSync(path.join(resDir, `mipmap-${dpi}`, 'ic_launcher_round.png'), png);
  console.log(`legacy ${dpi} ${size}`);
}
