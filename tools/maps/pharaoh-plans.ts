/**
 * CRAZYSHOOT · 法老坟墓（pharaoh）高清平面图生成器 · PLAN-01
 *
 * 三套图（每套 SVG + PNG，2400×2400）：
 *   1) pharaoh-surface     800×800 全图地表平面图：阴影地形 + 100 m 坐标网格 + 比例尺/北向 +
 *                          沙丘峰值高度（新沙丘 3–10 m）+ 水面 + 全部道路 + 七据点 A–G +
 *                          双方出生区 + 32 初始载具点 + 全部战略路线 + 手工掩体/建筑轮廓。
 *   2) pharaoh-underground 地下与室内分层图：金字塔 264 m 外层/内核 +5/+20/顶 + 内外阶梯 +
 *                          狮身内殿/环廊/后厅/头室/胸部楼梯 + A–B 墓道 L≈266 m（纵剖面、
 *                          两个中途出口、两端口）+ 竖向连接标高梯（世界 y −6…+58）。
 *   3) pharaoh-height      高度/坡度图：高程热力 + 2 m 等高线 + 坡度分级 +
 *                          高程直方图 + 主路纵剖面 + 1:1（800 m）地形剖面。
 *
 * 数据全部来自源码（不改 src/**）：
 *   src/maps/pharaoh.ts / pharaoh-height.ts / pharaoh/terrain.ts
 *   src/game/world/pharaoh-pyramid.ts / pharaoh-sphinx.ts / pharaoh-tunnel.ts
 *
 * 用法：
 *   npx tsx tools/maps/pharaoh-plans.ts            # 生成 SVG + PNG + README
 *   npx tsx tools/maps/pharaoh-plans.ts --svg-only # 只出 SVG（无需浏览器）
 */
import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';

import { MAP_BY_ID } from '../../src/maps';
import {
  pharaohHeight,
  PHARAOH_ROADS,
  PHARAOH_KEY_POINTS,
  PHARAOH_LAKE_POLYGON,
  PHARAOH_WATER_SURFACE,
} from '../../src/maps/pharaoh-height';
import { PHARAOH_LAYOUT, PHARAOH_MONUMENT_LINK, PHARAOH_SITE_LABELS } from '../../src/maps/pharaoh/layout';
import {
  PYRAMID_BASE,
  PYRAMID_OUTER_BASE,
  PYRAMID_OUTER_TOP,
  PYRAMID_CENTER,
  PYRAMID_PLATFORM,
  PYRAMID_APEX,
  PYRAMID_TOP,
  PYRAMID_SUMMIT_HATCH,
  TIER_HALF,
  PYRAMID_ROOMS,
  PYRAMID_STAIRS,
} from '../../src/game/world/pharaoh-pyramid';
import { SPHINX } from '../../src/game/world/pharaoh-sphinx';
import {
  TUNNEL_ROUTE,
  TUNNEL_MOUTHS,
  TUNNEL_LENGTH,
  TUNNEL_EXIT_PLAN,
  tunnelAt,
  tunnelFloor,
  tunnelExitGeom,
} from '../../src/game/world/pharaoh-tunnel';
import { VERSION, MAP_REVISION, MATERIAL_REVISION, BUILD_ID } from '../../src/version';

/** tsx 直跑没有 Vite define；优先用构建产物 dist/version.json 的 BUILD_ID 保持一致。 */
const PLAN_BUILD_ID = (() => {
  if (BUILD_ID !== 'test') return BUILD_ID;
  try {
    const info = JSON.parse(fs.readFileSync(path.resolve('dist/version.json'), 'utf8')) as { buildId?: string };
    return info.buildId ?? BUILD_ID;
  } catch {
    return BUILD_ID;
  }
})();

const MAP = (() => {
  const m = MAP_BY_ID.get('pharaoh');
  if (!m) throw new Error('pharaoh 未在 src/maps/index.ts 注册');
  return m;
})();

const W = 2400;
const H = 1800;
// 所有地图纸必须 1:1；保留原 1800 布局，上下各加 300 px 黑边，整体 2400×2400。
const PAD_TOP = 300;
const CANVAS_H = H + PAD_TOP * 2;
const SIZE = MAP.size;
const OUT_DIR = path.resolve('docs/map-pharaoh/plans');
const SVG_ONLY = process.argv.includes('--svg-only');

/* ------------------------------------------------------------------ *
 * 通用：颜色 / 文本 / 数字
 * ------------------------------------------------------------------ */

const C = {
  bg: '#080b0d',
  panel: '#0d1216',
  panel2: '#101720',
  line: 'rgba(214,231,227,0.14)',
  lineSoft: 'rgba(214,231,227,0.07)',
  text: '#e8f1ee',
  muted: '#8b9a9f',
  faint: '#5a696f',
  cyan: '#35e0d0',
  amber: '#ffb454',
  blue: '#4aa8ff',
  orange: '#ff7a3d',
  white: '#eef5f1',
  grid10: 'rgba(220,238,233,0.05)',
  grid50: 'rgba(220,238,233,0.11)',
  road: '#20262a',
  roadEdge: 'rgba(235,240,232,0.20)',
  sand: '#8f8164',
  water: '#123a44',
  stone: '#8e8878',
  rock: '#6d675c',
  built: '#cfc7ae',
  tunnel: '#cfa9ff',
  sphinx: '#ffd479',
  pyramid: '#e8dcc0',
} as const;

const FONT = `'Rajdhani','DIN Alternate','Helvetica Neue','PingFang SC','Microsoft YaHei',sans-serif`;
const MONO = `'SFMono-Regular','Cascadia Mono','Roboto Mono','monospace'`;

const n = (v: number): string => (Math.round(v * 10) / 10).toString();
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function textWidth(s: string, size: number): number {
  let units = 0;
  for (const ch of Array.from(s)) {
    if (/[\u3000-\u9fff]/.test(ch)) units += 1;
    else if (/\s/.test(ch)) units += 0.35;
    else units += 0.54;
  }
  return units * size;
}

function label(
  x: number,
  y: number,
  s: string,
  size: number,
  fill: string,
  anchor: 'start' | 'middle' | 'end' = 'start',
  weight = 600,
  bg = true,
): string {
  const w = textWidth(s, size) + 10;
  const bx = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x - 5;
  const rect = bg
    ? `<rect x="${n(bx)}" y="${n(y - size + 2)}" width="${n(w)}" height="${n(size + 6)}" rx="2" fill="rgba(6,10,12,0.72)"/>`
    : '';
  return `<g>${rect}<text x="${n(x)}" y="${n(y)}" fill="${fill}" font-family="${FONT}" font-size="${n(size)}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="0.3">${esc(s)}</text></g>`;
}

function mono(x: number, y: number, s: string, size: number, fill: string, anchor: 'start' | 'middle' | 'end' = 'start', weight = 500): string {
  return `<text x="${n(x)}" y="${n(y)}" fill="${fill}" font-family="${MONO}" font-size="${n(size)}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="0.4">${esc(s)}</text>`;
}

function paragraph(s: string, x: number, y: number, maxUnits: number, size: number, lh: number, fill: string): { svg: string; endY: number } {
  const lines: string[] = [];
  let line = '';
  let used = 0;
  for (const ch of Array.from(s)) {
    const u = /[\u3000-\u9fff]/.test(ch) ? 1 : /\s/.test(ch) ? 0.35 : 0.54;
    if (used + u > maxUnits && line.length) {
      lines.push(line.trimEnd());
      line = ch;
      used = u;
    } else {
      line += ch;
      used += u;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return {
    svg: lines
      .map(
        (l, i) =>
          `<text x="${n(x)}" y="${n(y + i * lh)}" fill="${fill}" font-family="${FONT}" font-size="${n(size)}" font-weight="400" letter-spacing="0.2">${esc(l)}</text>`,
      )
      .join(''),
    endY: y + lines.length * lh,
  };
}

/* ------------------------------------------------------------------ *
 * PNG 编码（无第三方依赖：zlib + CRC32）
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** RGBA 像素 → PNG data URI（SVG <image> 直接可用）。 */
function encodePNG(w: number, h: number, rgba: Uint8Array): string {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

/* ------------------------------------------------------------------ *
 * 高度场采样（按格心，1 m 世界坐标；缓存复用）
 * ------------------------------------------------------------------ */

interface Field {
  n: number;
  cell: number;
  /** h[j*n+i]，i→x 向东，j→z 向北（第 0 行是南边） */
  h: Float32Array;
  /** 梯度（m/m） */
  gx: Float32Array;
  gz: Float32Array;
  slope: Float32Array;
  min: number;
  max: number;
}

const FIELD_CACHE = new Map<number, Field>();

function sampleField(nCells: number): Field {
  const cached = FIELD_CACHE.get(nCells);
  if (cached) return cached;
  const cell = SIZE / nCells;
  const h = new Float32Array(nCells * nCells);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < nCells; j++) {
    const z = (j + 0.5) * cell;
    for (let i = 0; i < nCells; i++) {
      const x = (i + 0.5) * cell;
      const v = pharaohHeight(x, z);
      h[j * nCells + i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const gx = new Float32Array(nCells * nCells);
  const gz = new Float32Array(nCells * nCells);
  const slope = new Float32Array(nCells * nCells);
  for (let j = 0; j < nCells; j++) {
    for (let i = 0; i < nCells; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(nCells - 1, i + 1);
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(nCells - 1, j + 1);
      const dx = (h[j * nCells + i1] - h[j * nCells + i0]) / ((i1 - i0) * cell || 1);
      const dz = (h[j1 * nCells + i] - h[j0 * nCells + i]) / ((j1 - j0) * cell || 1);
      const k = j * nCells + i;
      gx[k] = dx;
      gz[k] = dz;
      slope[k] = Math.hypot(dx, dz);
    }
  }
  const f: Field = { n: nCells, cell, h, gx, gz, slope, min, max };
  FIELD_CACHE.set(nCells, f);
  return f;
}

/* ------------------------------------------------------------------ *
 * 栅格渲染：阴影地形 / 高程热力 / 坡度
 * ------------------------------------------------------------------ */

function ramp(stops: [number, [number, number, number]][], v: number): [number, number, number] {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i];
    const [v0, c0] = stops[i - 1];
    if (v <= v1) {
      const t = (v - v0) / (v1 - v0 || 1);
      return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    }
  }
  return stops[stops.length - 1][1];
}

const SAND_RAMP: [number, [number, number, number]][] = [
  [-2.2, [58, 62, 58]],
  [-1.2, [92, 98, 86]],
  [0.5, [124, 122, 100]],
  [2.5, [148, 138, 110]],
  [5.5, [166, 152, 118]],
  [9, [182, 164, 126]],
  [13, [196, 176, 134]],
  [17, [212, 190, 146]],
  [21, [228, 206, 162]],
  [23, [240, 220, 178]],
];

const HEAT_RAMP: [number, [number, number, number]][] = [
  [-6, [22, 36, 74]],
  [-4, [30, 78, 120]],
  [-2, [46, 140, 158]],
  [0, [92, 178, 150]],
  [2, [168, 200, 108]],
  [4.5, [226, 208, 88]],
  [7, [244, 176, 76]],
  [10, [238, 128, 66]],
  [14, [206, 84, 72]],
  [18, [166, 74, 108]],
  [22, [214, 160, 214]],
];

const SLOPE_RAMP: [number, [number, number, number]][] = [
  [0, [26, 40, 44]],
  [0.06, [40, 78, 78]],
  [0.14, [66, 128, 104]],
  [0.26, [160, 168, 86]],
  [0.42, [226, 176, 70]],
  [0.62, [236, 118, 60]],
  [0.8, [206, 66, 58]],
  [1.0, [150, 40, 70]],
];

/** 太阳方位：西北（-x, +z），方位角 315°、高度 45°。 */
function shadeOf(f: Field, k: number): number {
  const gx = f.gx[k];
  const gz = f.gz[k];
  // 低对比浮雕：只保留能读出坡向的轻微明暗，避免大面积亮/暗块。
  const s = 0.88 - gx * 0.22 + gz * 0.22;
  return clamp(s, 0.74, 1.10);
}

function reliefRaster(f: Field): string {
  const { n: N, h, slope } = f;
  const rgba = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const hv = h[k];
      let col: [number, number, number];
      if (hv < PHARAOH_WATER_SURFACE + 0.02) {
        const t = clamp((-hv - 2) / 4, 0, 1);
        col = [lerp(30, 20, t), lerp(88, 62, t), lerp(96, 78, t)];
      } else {
        col = ramp(SAND_RAMP, hv);
        // 陡坡露岩：坡度越大越偏灰褐
        const rock = clamp((slope[k] - 0.55) / 0.9, 0, 1);
        col = [lerp(col[0], 132, rock * 0.24), lerp(col[1], 122, rock * 0.24), lerp(col[2], 104, rock * 0.24)];
        const sh = shadeOf(f, k);
        col = [col[0] * sh, col[1] * sh, col[2] * sh];
      }
      const out = ((N - 1 - j) * N + i) * 4; // 第 0 行 = 北
      rgba[out] = clamp(col[0], 0, 255);
      rgba[out + 1] = clamp(col[1], 0, 255);
      rgba[out + 2] = clamp(col[2], 0, 255);
      rgba[out + 3] = 255;
    }
  }
  return encodePNG(N, N, rgba);
}

function heatRaster(f: Field): string {
  const { n: N, h, slope } = f;
  const rgba = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const col = ramp(HEAT_RAMP, h[k]);
      const sh = 0.82 + clamp(slope[k], 0, 1) * 0.2;
      const out = ((N - 1 - j) * N + i) * 4;
      rgba[out] = clamp(col[0] * sh, 0, 255);
      rgba[out + 1] = clamp(col[1] * sh, 0, 255);
      rgba[out + 2] = clamp(col[2] * sh, 0, 255);
      rgba[out + 3] = 255;
    }
  }
  return encodePNG(N, N, rgba);
}

function slopeRaster(f: Field): string {
  const { n: N, slope } = f;
  const rgba = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const col = ramp(SLOPE_RAMP, slope[k]);
      const out = ((N - 1 - j) * N + i) * 4;
      rgba[out] = col[0];
      rgba[out + 1] = col[1];
      rgba[out + 2] = col[2];
      rgba[out + 3] = 255;
    }
  }
  return encodePNG(N, N, rgba);
}

/* ------------------------------------------------------------------ *
 * 等高线（marching squares + 端点拼接成折线）
 * ------------------------------------------------------------------ */

interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

function contourSegments(f: Field, level: number): Seg[] {
  const { n: N, cell, h } = f;
  const segs: Seg[] = [];
  const at = (i: number, j: number) => h[j * N + i];
  const lerpX = (i: number, j: number, x0: number, x1: number) => {
    const a = at(i, j);
    const b = at(i + 1, j);
    const t = (level - a) / (b - a || 1);
    return [x0 + (x1 - x0) * t, (j + 0.5) * cell] as [number, number];
  };
  const lerpZ = (i: number, j: number, z0: number, z1: number) => {
    const a = at(i, j);
    const b = at(i, j + 1);
    const t = (level - a) / (b - a || 1);
    return [(i + 0.5) * cell, z0 + (z1 - z0) * t] as [number, number];
  };
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = at(i, j); // 西南
      const b = at(i + 1, j); // 东南
      const c = at(i + 1, j + 1); // 东北
      const d = at(i, j + 1); // 西北
      let idx = 0;
      if (a > level) idx |= 1;
      if (b > level) idx |= 2;
      if (c > level) idx |= 4;
      if (d > level) idx |= 8;
      if (idx === 0 || idx === 15) continue;
      const x0 = i * cell;
      const x1 = (i + 1) * cell;
      const z0 = j * cell;
      const z1 = (j + 1) * cell;
      const S = () => lerpX(i, j, x0, x1);
      const E = () => lerpZ(i + 1, j, z0, z1);
      const Nn = () => lerpX(i, j + 1, x0, x1);
      const W = () => lerpX(i, j, x0, x1); // 与 S 同边，用下面的 WZ 区分
      const WZ = () => lerpZ(i, j, z0, z1);
      const push = (p: [number, number], q: [number, number]) => segs.push({ ax: p[0], az: p[1], bx: q[0], bz: q[1] });
      switch (idx) {
        case 1: push(S(), WZ()); break;
        case 2: push(S(), E()); break;
        case 3: push(WZ(), E()); break;
        case 4: push(E(), Nn()); break;
        case 5: push(S(), Nn()); push(WZ(), E()); break;
        case 6: push(S(), Nn()); break;
        case 7: push(WZ(), Nn()); break;
        case 8: push(WZ(), Nn()); break;
        case 9: push(S(), Nn()); break;
        case 10: push(S(), WZ()); push(E(), Nn()); break;
        case 11: push(E(), Nn()); break;
        case 12: push(WZ(), E()); break;
        case 13: push(S(), E()); break;
        case 14: push(S(), WZ()); break;
        default: break;
      }
      void W;
    }
  }
  return segs;
}

/** 段集合拼接成折线（按 0.2 m 端点吸附；只保留 ≥3 点的线）。 */
function stitch(segs: Seg[]): [number, number][][] {
  const key = (x: number, z: number) => `${Math.round(x * 5)}:${Math.round(z * 5)}`;
  const map = new Map<string, number[]>();
  for (let i = 0; i < segs.length; i++) {
    for (const k of [key(segs[i].ax, segs[i].az), key(segs[i].bx, segs[i].bz)]) {
      const arr = map.get(k);
      if (arr) arr.push(i);
      else map.set(k, [i]);
    }
  }
  const used = new Uint8Array(segs.length);
  const lines: [number, number][][] = [];
  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const line: [number, number][] = [
      [segs[start].ax, segs[start].az],
      [segs[start].bx, segs[start].bz],
    ];
    for (let dir = 0; dir < 2; dir++) {
      // 从一端继续
      for (;;) {
        const end = dir === 0 ? line[line.length - 1] : line[0];
        const cand = (map.get(key(end[0], end[1])) ?? []).find((i) => !used[i]);
        if (cand === undefined) break;
        used[cand] = 1;
        const s = segs[cand];
        const fromA = key(s.ax, s.az) === key(end[0], end[1]);
        const next: [number, number] = fromA ? [s.bx, s.bz] : [s.ax, s.az];
        if (dir === 0) line.push(next);
        else line.unshift(next);
      }
    }
    if (line.length >= 3) lines.push(line);
  }
  return lines;
}

function contourPath(f: Field, level: number, px: (x: number) => number, py: (z: number) => number): string {
  const lines = stitch(contourSegments(f, level));
  return lines
    .map((l) => `M${l.map(([x, z]) => `${n(px(x))},${n(py(z))}`).join('L')}`)
    .join('');
}

/* ------------------------------------------------------------------ *
 * 图层：网格 / 比例尺 / 北向 / 面板
 * ------------------------------------------------------------------ */

function mapGrid(px: (x: number) => number, py: (z: number) => number, box: { x: number; y: number; w: number; h: number }, step = 50): string {
  let out = '';
  for (let m = 0; m <= SIZE; m += step) {
    const major = m % 100 === 0;
    out += `<line x1="${n(px(m))}" y1="${box.y}" x2="${n(px(m))}" y2="${box.y + box.h}" stroke="${major ? C.grid50 : C.grid10}" stroke-width="${major ? 1 : 0.7}"/>`;
    out += `<line x1="${box.x}" y1="${n(py(m))}" x2="${box.x + box.w}" y2="${n(py(m))}" stroke="${major ? C.grid50 : C.grid10}" stroke-width="${major ? 1 : 0.7}"/>`;
  }
  return out;
}

function coordTicks(px: (x: number) => number, py: (z: number) => number, box: { x: number; y: number; w: number; h: number }): string {
  let out = '';
  for (let m = 0; m <= SIZE; m += 100) {
    out += mono(px(m), box.y - 10, String(m), 9, C.faint, 'middle');
    out += mono(box.x - 10, py(m) + 3, String(m), 9, C.faint, 'end');
  }
  out += mono(box.x + box.w + 8, py(0) - 6, 'X →', 9, C.faint, 'start');
  out += mono(box.x - 10, box.y - 10, 'Z ↑', 9, C.faint, 'end');
  return out;
}

function northArrow(x: number, y: number): string {
  return `<g opacity="0.9"><circle cx="${x}" cy="${y}" r="22" fill="rgba(6,10,12,0.6)" stroke="rgba(235,245,240,0.28)" stroke-width="1"/>
    <path d="M${x},${y - 14} L${x + 7},${y + 6} L${x},${y + 2} L${x - 7},${y + 6} Z" fill="${C.amber}"/>
    ${mono(x, y + 20, 'N', 8, C.muted, 'middle')}
    ${mono(x, y - 20, 'Z+', 7, C.faint, 'middle')}</g>`;
}

function scaleBar(x: number, y: number, pxPerM: number, meters = 200): string {
  const len = meters * pxPerM;
  return `<g><rect x="${x - 8}" y="${y - 14}" width="${len + 40}" height="30" rx="2" fill="rgba(6,10,12,0.66)" stroke="${C.lineSoft}"/>
    <line x1="${x}" y1="${y}" x2="${x + len}" y2="${y}" stroke="${C.white}" stroke-width="2"/>
    <line x1="${x}" y1="${y - 5}" x2="${x}" y2="${y + 5}" stroke="${C.white}" stroke-width="1.2"/>
    <line x1="${x + len / 2}" y1="${y - 5}" x2="${x + len / 2}" y2="${y + 5}" stroke="${C.white}" stroke-width="1.2"/>
    <line x1="${x + len}" y1="${y - 5}" x2="${x + len}" y2="${y + 5}" stroke="${C.white}" stroke-width="1.2"/>
    ${mono(x, y + 14, '0', 8, C.muted, 'start')}
    ${mono(x + len / 2, y + 14, `${meters / 2}m`, 8, C.muted, 'middle')}
    ${mono(x + len, y + 14, `${meters}m`, 8, C.muted, 'end')}</g>`;
}

function sheetHeader(code: string, title: string, subtitle: string): string {
  return `<rect x="0" y="0" width="${W}" height="${H}" fill="${C.bg}"/>
  <line x1="70" y1="104" x2="${W - 70}" y2="104" stroke="${C.line}"/>
  ${mono(70, 44, `CRAZYSHOOT // MAP SURVEY // ${code}`, 10, C.cyan, 'start', 600)}
  ${mono(W - 70, 44, `PHARAOH ${SIZE}×${SIZE}m · ${MAP_REVISION} · MAT ${MATERIAL_REVISION}`, 10, C.faint, 'end')}
  <text x="70" y="86" fill="${C.text}" font-family="${FONT}" font-size="40" font-weight="700" letter-spacing="1.5">${esc(title)}</text>
  ${mono(70 + textWidth(title, 40) + 24, 84, subtitle, 12, C.muted)}`;
}

function sheetFooter(note: string): string {
  return `<line x1="70" y1="${H - 56}" x2="${W - 70}" y2="${H - 56}" stroke="${C.line}"/>
  ${mono(70, H - 30, note, 9, C.faint)}
  ${mono(W - 70, H - 30, `v${VERSION} · build ${PLAN_BUILD_ID.slice(0, 12)} · 1 m voxel / 2400×2400`, 9, C.faint, 'end')}`;
}

function panelBox(x: number, y: number, w: number, h: number, title?: string, accent: string = C.cyan): string {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${C.panel}" stroke="${C.line}"/>
  <rect x="${x}" y="${y}" width="3" height="${h}" fill="${accent}" opacity="0.75"/>`;
  if (title) out += mono(x + 20, y + 26, title, 10, C.amber, 'start', 700);
  return out;
}

function legendSwatch(x: number, y: number, kind: 'line' | 'dash' | 'rect' | 'circle' | 'tri' | 'grid', color: string, labelText: string): string {
  let icon = '';
  if (kind === 'line') icon = `<line x1="${x}" y1="${y - 4}" x2="${x + 22}" y2="${y - 4}" stroke="${color}" stroke-width="2.4"/>`;
  else if (kind === 'dash') icon = `<line x1="${x}" y1="${y - 4}" x2="${x + 22}" y2="${y - 4}" stroke="${color}" stroke-width="2.2" stroke-dasharray="5 4"/>`;
  else if (kind === 'rect') icon = `<rect x="${x}" y="${y - 10}" width="22" height="12" fill="${color}" opacity="0.5" stroke="${color}" stroke-width="1"/>`;
  else if (kind === 'circle') icon = `<circle cx="${x + 11}" cy="${y - 4}" r="7" fill="none" stroke="${color}" stroke-width="1.6"/>`;
  else if (kind === 'tri') icon = `<path d="M${x + 11},${y - 12} L${x + 18},${y + 2} L${x + 4},${y + 2} Z" fill="${color}"/>`;
  else icon = `<rect x="${x}" y="${y - 10}" width="22" height="12" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="2 2"/>`;
  return `<g>${icon}${`<text x="${x + 30}" y="${y}" fill="${C.muted}" font-family="${FONT}" font-size="10.5" letter-spacing="0.2">${esc(labelText)}</text>`}</g>`;
}

/* ------------------------------------------------------------------ *
 * 地表平面图数据（MapDef + 高度场）
 * ------------------------------------------------------------------ */

interface Peak {
  x: number;
  z: number;
  h: number;
}

function findPeaks(f: Field, minHeight = 3, minGap = 60, limit = 9): Peak[] {
  const cand: Peak[] = [];
  const win = Math.max(2, Math.round(24 / f.cell));
  for (let j = win; j < f.n - win; j++) {
    for (let i = win; i < f.n - win; i++) {
      const k = j * f.n + i;
      const hv = f.h[k];
      if (hv < minHeight) continue;
      let isMax = true;
      for (let dj = -win; dj <= win && isMax; dj++) {
        for (let di = -win; di <= win; di++) {
          if (di === 0 && dj === 0) continue;
          if (f.h[(j + dj) * f.n + i + di] > hv) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) cand.push({ x: (i + 0.5) * f.cell, z: (j + 0.5) * f.cell, h: hv });
    }
  }
  cand.sort((a, b) => b.h - a.h);
  const out: Peak[] = [];
  for (const p of cand) {
    if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < minGap)) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

function deepest(f: Field): Peak {
  let best = { x: 0, z: 0, h: Infinity };
  for (let j = 0; j < f.n; j++) {
    for (let i = 0; i < f.n; i++) {
      const k = j * f.n + i;
      if (f.h[k] < best.h) best = { x: (i + 0.5) * f.cell, z: (j + 0.5) * f.cell, h: f.h[k] };
    }
  }
  return best;
}

/* ------------------------------ 图 1 ------------------------------ */

const MAP1 = { x: 70, y: 136, w: 1560, h: 1560 };
const S1 = MAP1.w / SIZE;

function renderSurfacePlan(f: Field): string {
  const px = (x: number) => MAP1.x + x * S1;
  const py = (z: number) => MAP1.y + MAP1.h - z * S1;
  const peaks = findPeaks(f, 3, 60, 8);

  let out = sheetHeader('PLAN 01 / 03', '法老坟墓 · 全图地表平面图', 'SURFACE PLAN — 800 m · 7 objectives A–G · 32 vehicle pads · terrain · roads · routes');
  out += `<rect x="${MAP1.x - 12}" y="${MAP1.y - 12}" width="${MAP1.w + 24}" height="${MAP1.h + 24}" fill="#0a0e11" stroke="${C.line}"/>`;
  out += `<image x="${MAP1.x}" y="${MAP1.y}" width="${MAP1.w}" height="${MAP1.h}" href="${reliefRaster(f)}" preserveAspectRatio="none" style="image-rendering:auto"/>`;

  // 地表材质补丁（来自 MapDef.terrain：沙砾/干裂土/石材/湿泥/湖面）
  const patchTint: Record<string, string> = {
    gravel: 'rgba(150,146,128,0.34)',
    dirt: 'rgba(126,102,72,0.34)',
    rubble: 'rgba(146,142,132,0.32)',
    stone: 'rgba(168,164,150,0.34)',
    mud: 'rgba(78,84,62,0.40)',
    flowers: 'rgba(104,132,70,0.32)',
    grass: 'rgba(88,124,70,0.30)',
    asphalt: 'rgba(40,46,50,0.55)',
    concrete: 'rgba(120,124,120,0.35)',
    sand: 'rgba(190,170,130,0.16)',
  };
  for (const t of MAP.terrain) {
    if (t.kind === 'water') continue;
    const pts = t.polygon.map(([x, z]) => `${n(px(x))},${n(py(z))}`).join(' ');
    out += `<polygon points="${pts}" fill="${patchTint[t.kind] ?? 'rgba(180,170,150,0.2)'}" stroke="none"/>`;
  }

  // 道路：先 shoulder 后 main（MapDef 顺序即铺装顺序），支路单层
  for (const r of MAP.roads) {
    const d = r.points.map((p, i) => `${i ? 'L' : 'M'}${n(px(p[0]))},${n(py(p[1]))}`).join(' ');
    const w = r.width * S1;
    const shoulder = (r.shoulder ?? 0) * S1;
    if (shoulder > 0) {
      out += `<path d="${d}" fill="none" stroke="rgba(126,120,104,0.85)" stroke-width="${n(w + shoulder * 2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      out += `<path d="${d}" fill="none" stroke="rgba(196,188,166,0.18)" stroke-width="${n(Math.max(1, w + shoulder * 2 - 2))}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    const isMain = r.kind === 'main';
    const isPath = r.kind === 'path';
    out += `<path d="${d}" fill="none" stroke="${C.road}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round" opacity="${isMain ? 1 : 0.95}"/>`;
    if (r.markings) {
      out += `<path d="${d}" fill="none" stroke="rgba(240,236,220,0.34)" stroke-width="1.1" stroke-dasharray="12 16"/>`;
    } else {
      out += `<path d="${d}" fill="none" stroke="${C.roadEdge}" stroke-width="0.8" stroke-dasharray="${isPath ? '3 6' : '8 10'}" opacity="0.5"/>`;
    }
  }

  // 掩体：岩石/植被/墙（低对比，重点看布局）
  for (const cv of MAP.covers) {
    const x = px(cv.x);
    const y = py(cv.y);
    const w = Math.max(2, cv.w * S1);
    const d = Math.max(2, cv.d * S1);
    const rot = -(cv.rot ?? 0);
    if (cv.kind === 'rock') {
      out += `<rect x="${n(x - w / 2)}" y="${n(y - d / 2)}" width="${n(w)}" height="${n(d)}" fill="#7d7566" stroke="rgba(20,20,16,0.5)" stroke-width="0.6" transform="rotate(${n(rot)} ${n(x)} ${n(y)})"/>`;
    } else if (cv.kind === 'palm' || cv.kind === 'tree') {
      out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(Math.max(2.2, w / 2))}" fill="#33502f" opacity="0.85"/>`;
      out += `<circle cx="${n(x)}" cy="${n(y)}" r="1" fill="#1d2a1b"/>`;
    } else if (cv.kind === 'bush' || cv.kind === 'reeds') {
      out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(Math.max(1.6, w / 2))}" fill="#5c6b3c" opacity="0.7"/>`;
    } else {
      out += `<rect x="${n(x - w / 2)}" y="${n(y - d / 2)}" width="${n(w)}" height="${n(d)}" fill="rgba(150,146,132,0.55)" stroke="rgba(20,20,18,0.35)" stroke-width="0.4" transform="rotate(${n(rot)} ${n(x)} ${n(y)})"/>`;
    }
  }

  // 建筑（来自 MapDef.buildings；只画屋顶 + 少量标签）
  for (const b of MAP.buildings) {
    const pts = b.polygon.map(([x, z]) => `${n(px(x))},${n(py(z))}`).join(' ');
    const xs = b.polygon.map((p) => p[0]);
    const zs = b.polygon.map((p) => p[1]);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
    out += `<polygon points="${pts}" fill="#5d5f56" stroke="rgba(238,244,236,0.5)" stroke-width="1"/>`;
    out += `<polygon points="${pts}" fill="rgba(255,255,255,0.05)"/>`;
    if (area > 900 && b.label !== false) {
      const cx = xs.reduce((a, c) => a + c, 0) / xs.length;
      const cz = zs.reduce((a, c) => a + c, 0) / zs.length;
      out += label(px(cx), py(cz) + 3.5, b.name, 9, 'rgba(240,244,238,0.82)', 'middle', 600, false);
    }
  }

  // 金字塔体量（builder 叠加，非地形）：24 级台坎轮廓 + 基座 + 顶
  for (let i = TIER_HALF.length - 1; i >= 0; i--) {
    const half = TIER_HALF[i];
    const x = px(PYRAMID_CENTER[0] - half);
    const y = py(PYRAMID_CENTER[1] + half);
    const w = half * 2 * S1;
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(w)}" fill="rgba(232,220,192,${i % 6 === 0 ? 0.10 : 0.03})" stroke="rgba(232,220,192,${i % 6 === 0 ? 0.55 : 0.22})" stroke-width="${i % 6 === 0 ? 1.1 : 0.55}"/>`;
  }
  // 0.20 外层大金字塔 264×264（顶 +58）；原 132 m 内核用虚线表示。
  out += `<rect x="${n(px(PYRAMID_OUTER_BASE.x0))}" y="${n(py(PYRAMID_OUTER_BASE.z1))}" width="${n((PYRAMID_OUTER_BASE.x1 - PYRAMID_OUTER_BASE.x0) * S1)}" height="${n((PYRAMID_OUTER_BASE.z1 - PYRAMID_OUTER_BASE.z0) * S1)}" fill="rgba(232,220,192,0.05)" stroke="rgba(255,226,170,0.95)" stroke-width="2.2" stroke-dasharray="10 5"/>`;
  out += `<rect x="${n(px(PYRAMID_BASE.x0))}" y="${n(py(PYRAMID_BASE.z1))}" width="${n((PYRAMID_BASE.x1 - PYRAMID_BASE.x0) * S1)}" height="${n((PYRAMID_BASE.z1 - PYRAMID_BASE.z0) * S1)}" fill="none" stroke="rgba(232,220,192,0.55)" stroke-width="1.0" stroke-dasharray="4 5"/>`;
  out += `<rect x="${n(px(PYRAMID_TOP.x0))}" y="${n(py(PYRAMID_TOP.z1))}" width="${n((PYRAMID_TOP.x1 - PYRAMID_TOP.x0) * S1)}" height="${n((PYRAMID_TOP.z1 - PYRAMID_TOP.z0) * S1)}" fill="rgba(255,180,84,0.85)" stroke="${C.amber}" stroke-width="1"/>`;
  out += mono(px(PYRAMID_OUTER_BASE.x1) + 7, py(PYRAMID_OUTER_BASE.z1) + 2, `外金字塔 264×264 · 顶 +${PYRAMID_OUTER_TOP}`, 9.0, C.amber);
  out += mono(px(PYRAMID_TOP.x1) + 7, py(PYRAMID_TOP.z1) + 14, `内核 132×132 · 顶 +${PYRAMID_APEX}`, 7.6, 'rgba(232,220,192,0.7)');
  // 狮身人面像体量
  out += `<rect x="${n(px(SPHINX.bounds.x0))}" y="${n(py(SPHINX.bounds.z1))}" width="${n((SPHINX.bounds.x1 - SPHINX.bounds.x0) * S1)}" height="${n((SPHINX.bounds.z1 - SPHINX.bounds.z0) * S1)}" fill="rgba(255,212,121,0.12)" stroke="rgba(255,212,121,0.9)" stroke-width="1.5"/>`;
  out += `<rect x="${n(px(SPHINX.hall.x0))}" y="${n(py(SPHINX.hall.z1))}" width="${n((SPHINX.hall.x1 - SPHINX.hall.x0) * S1)}" height="${n((SPHINX.hall.z1 - SPHINX.hall.z0) * S1)}" fill="rgba(255,180,84,0.28)" stroke="rgba(255,236,200,0.8)" stroke-width="0.9"/>`;
  out += mono(px(SPHINX.headRoom.x1) + 6, py(SPHINX.headRoom.z1) + 4, `头顶 +${SPHINX.headTop}`, 8.4, 'rgba(255,212,121,0.95)');

  // 区域标注（手工，地图读法；坐标全部由 layout.ts 的 800 m 锚点派生）
  const siteNote = (id: keyof typeof PHARAOH_LAYOUT, dx: number, dz: number, text: string): [number, number, string] => [
    PHARAOH_LAYOUT[id].x + dx,
    PHARAOH_LAYOUT[id].z + dz,
    text,
  ];
  const notes: [number, number, string][] = [
    siteNote('A', 0, 150, 'A 阶梯金字塔（外层 264 m）'),
    siteNote('B', 0, 72, 'B 狮身人面像'),
    siteNote('C', 0, 195, 'C 沙漠集市'),
    [115, 155, 'D 绿洲（湖 140×110）'],
    siteNote('E', 0, 95, 'E 公路驿站'),
    siteNote('F', 0, 120, 'F 卡纳克列柱神庙'),
    siteNote('G', 0, 115, 'G 帝王谷采石场'),
    siteNote('blue', 0, -73, '蓝队远征基地'),
    siteNote('orange', 0, 70, '橙队沙丘营地'),
  ];
  for (const [x, z, s] of notes) {
    out += label(px(x), py(z), s, 13, 'rgba(255,246,226,0.92)', 'middle', 700);
  }

  // 路线
  for (const r of MAP.routes) {
    const d = r.points.map((p, i) => `${i ? 'L' : 'M'}${n(px(p[0]))},${n(py(p[1]))}`).join(' ');
    const col = r.team === 'blue' ? C.blue : C.orange;
    out += `<path d="${d}" fill="none" stroke="rgba(6,10,12,0.55)" stroke-width="6.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${r.kind === 'vehicle' ? 2.2 : 3}" stroke-dasharray="${r.kind === 'vehicle' ? '4 9' : '10 9'}" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>`;
  }

  // 出生区
  for (const s of MAP.spawns) {
    const col = s.team === 'blue' ? C.blue : C.orange;
    const x = px(s.x);
    const y = py(s.y + s.d);
    const w = s.w * S1;
    const h = s.d * S1;
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="3" fill="${col}" opacity="0.10" stroke="${col}" stroke-width="1.6" stroke-dasharray="7 5"/>`;
    out += label(x + 8, py(s.y + s.d) - 6, `${s.team === 'blue' ? '蓝队' : '橙队'}出生区 ${s.w}×${s.d}`, 10.5, col, 'start', 700);
  }

  // 载具点：32 个（图标 + 编号）
  const padClass: Record<string, string> = {
    motorcycle: 'MOTO', jeep: 'JEEP', apc: 'APC', ifv: 'IFV', light_tank: 'LT', mbt: 'MBT',
  };
  MAP.vehiclePads.forEach((p, i) => {
    const x = px(p.x);
    const y = py(p.y);
    const col = p.team === 'neutral' ? '#c8b98d' : p.team === 'blue' ? C.blue : C.orange;
    const s = 15;
    out += `<g><rect x="${n(x - s / 2)}" y="${n(y - s / 2)}" width="${s}" height="${s}" rx="2" fill="rgba(7,11,13,0.82)" stroke="${col}" stroke-width="1.1" transform="rotate(${n(-(p.angle ?? 0))} ${n(x)} ${n(y)})"/>`;
    out += mono(x, y + 3, padClass[p.vehicleId] ?? p.vehicleId.slice(0, 4).toUpperCase(), 6.4, col, 'middle', 700);
    out += mono(x, y + s / 2 + 8, String(i + 1).padStart(2, '0'), 6, 'rgba(200,190,160,0.6)', 'middle');
    out += `</g>`;
  });

  // 据点
  for (const cp of MAP.capturePoints) {
    const x = px(cp.x);
    const y = py(cp.y);
    const r = cp.radius * S1;
    out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${C.white}" opacity="0.05"/>`;
    out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="none" stroke="${C.white}" stroke-width="2.2" stroke-dasharray="8 5"/>`;
    out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.42)}" fill="rgba(7,11,13,0.9)" stroke="${C.white}" stroke-width="1.6"/>`;
    out += `<text x="${n(x)}" y="${n(y + 10)}" fill="${C.white}" font-family="${FONT}" font-size="30" font-weight="700" text-anchor="middle">${cp.id}</text>`;
    // 体量内部据点（A/B）标签放到建筑轮廓下方，避免压在建体内
    const labelY =
      cp.id === 'A' ? py(PYRAMID_OUTER_BASE.z0) + 22 : cp.id === 'B' ? py(SPHINX.bounds.z0) + 22 : y + r + 20;
    out += label(x, labelY, `${cp.name} · +${cp.floorY ?? Math.round(pharaohHeight(cp.x, cp.y) * 10) / 10}m`, 11, C.white, 'middle', 700);
  }
  // A–B 墓道两个地表口（地下构筑物的地面标记）
  for (const [key, mouth, labelText] of [
    ['A', TUNNEL_MOUTHS.a, '墓道 A 口'],
    ['B', TUNNEL_MOUTHS.b, '墓道 B 口'],
  ] as const) {
    const cx = px((mouth.x0 + mouth.x1) / 2);
    const cy = py((mouth.z0 + mouth.z1) / 2);
    out += `<rect x="${n(px(mouth.x0))}" y="${n(py(mouth.z1))}" width="${n((mouth.x1 - mouth.x0) * S1)}" height="${n((mouth.z1 - mouth.z0) * S1)}" fill="rgba(207,169,255,0.55)" stroke="rgba(230,210,255,0.9)" stroke-width="1"/>`;
    out += mono(cx + 10, cy + 3, `${labelText} +${mouth.floor}`, 8.4, 'rgba(230,210,255,0.95)');
    void key;
  }

  // 沙丘峰值
  peaks.forEach((p, i) => {
    const x = px(p.x);
    const y = py(p.z);
    out += `<g><path d="M${n(x)},${n(y - 7)} L${n(x + 6)},${n(y + 3)} L${n(x - 6)},${n(y + 3)} Z" fill="${C.amber}" opacity="0.9"/>`;
    out += label(x, y + 18, `${i === 0 ? '最高沙丘 ' : ''}${p.h.toFixed(1)}m`, 9.5, C.amber, 'middle', 700, false);
    out += `</g>`;
  });

  // 水面描边
  const lake = PHARAOH_LAKE_POLYGON.map(([x, z]) => `${n(px(x))},${n(py(z))}`).join(' ');
  out += `<polygon points="${lake}" fill="none" stroke="rgba(120,215,225,0.75)" stroke-width="1.6"/>`;

  out += mapGrid(px, py, MAP1);
  out += coordTicks(px, py, MAP1);
  out += northArrow(MAP1.x + MAP1.w - 50, MAP1.y + 52);
  out += scaleBar(MAP1.x + 26, MAP1.y + MAP1.h - 30, S1, 200);
  out += panelRight(f, peaks);
  out += sheetFooter(`pharaoh-surface — 800 m 七据点；坐标 x∈[0,${SIZE}] 向东、z∈[0,${SIZE}] 向北；比例 1 px ≈ ${(SIZE / MAP1.w).toFixed(3)} m`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CANVAS_H}" viewBox="0 -${PAD_TOP} ${W} ${CANVAS_H}"><rect x="0" y="-${PAD_TOP}" width="${W}" height="${CANVAS_H}" fill="${C.bg}"/>${out}</svg>`;
}

function panelRight(f: Field, peaks: Peak[]): string {
  const X = 1690;
  const Y = 136;
  const PW = 640;
  const PH = 1560;
  let out = panelBox(X, Y, PW, PH, 'SITE DATA');
  let y = Y + 52;
  out += `<text x="${X + 26}" y="${y}" fill="${C.text}" font-family="${FONT}" font-size="42" font-weight="700">法老坟墓</text>`;
  out += mono(X + 28, y + 22, `PHARAOH’S TOMB · ${SIZE}×${SIZE} m · 7 OBJECTIVES A–G`, 11, C.muted);
  y += 52;

  const stats: [string, string][] = [
    ['地图尺寸', `${SIZE} × ${SIZE} m（800 m 可玩）`],
    ['据点', `${MAP.capturePoints.length} 个（A–G）`],
    ['出生区', `${MAP.spawns.length} × 110×110 m`],
    ['初始载具', `${MAP.vehiclePads.length} 辆（蓝 8 / 橙 8 / 中立 16）`],
    ['建筑', `${MAP.buildings.length} 栋`],
    ['掩体/植被', `${MAP.covers.length} 件`],
    ['道路', `${MAP.roads.length} 段（主路 10 m + 路肩）`],
    ['特殊武器', `${MAP.specialCrates.length} 箱`],
    ['重机枪', `${MAP.mgNests.length} 座`],
  ];
  out += mono(X + 26, y, 'STATS', 9, C.amber, 'start', 700);
  y += 18;
  for (const [k, v] of stats) {
    out += `<text x="${X + 26}" y="${y}" fill="${C.muted}" font-family="${FONT}" font-size="11">${esc(k)}</text>`;
    out += mono(X + PW - 26, y, v, 11, C.text, 'end');
    out += `<line x1="${X + 26}" y1="${y + 7}" x2="${X + PW - 26}" y2="${y + 7}" stroke="${C.lineSoft}"/>`;
    y += 23;
  }
  y += 14;

  // 高程摘要
  out += mono(X + 26, y, 'TERRAIN', 9, C.amber, 'start', 700);
  y += 20;
  const terrainRows: [string, string][] = [
    ['地表高程范围', `${f.min.toFixed(1)} … ${f.max.toFixed(1)} m（沙丘 3–10）`],
    ['水面 / 湖底', `${PHARAOH_WATER_SURFACE.toFixed(0)} m / ${deepest(f).h.toFixed(1)} m`],
    ['A 金字塔平台 / 外顶', `+${PHARAOH_LAYOUT.A.ground} m / +${PYRAMID_OUTER_TOP} m`],
    ['B 狮身平台 / 头顶', `+${PHARAOH_LAYOUT.B.ground} m / +${SPHINX.headTop} m`],
    ['双方基地高程', `蓝 +${PHARAOH_LAYOUT.blue.ground} / 橙 +${PHARAOH_LAYOUT.orange.ground} m`],
    ['最高沙丘', `${peaks[0] ? peaks[0].h.toFixed(1) : '—'} m @ (${peaks[0] ? Math.round(peaks[0].x) : 0}, ${peaks[0] ? Math.round(peaks[0].z) : 0})`],
  ];
  for (const [k, v] of terrainRows) {
    out += `<text x="${X + 26}" y="${y}" fill="${C.muted}" font-family="${FONT}" font-size="11">${esc(k)}</text>`;
    out += mono(X + PW - 26, y, v, 11, C.text, 'end');
    y += 19;
  }
  y += 12;

  // 沙丘峰值表
  out += mono(X + 26, y, 'DUNE PEAKS (sampled)', 9, C.amber, 'start', 700);
  y += 18;
  for (const p of peaks.slice(0, 6)) {
    out += mono(X + 26, y, `(${String(Math.round(p.x)).padStart(4)}, ${String(Math.round(p.z)).padStart(4)})`, 10, C.muted);
    out += mono(X + 190, y, `${p.h.toFixed(1)} m`, 10, C.amber, 'end');
    const rel = clamp((p.h - 3) / 7, 0, 1);
    out += `<rect x="${X + 210}" y="${y - 7}" width="${n(rel * 220)}" height="6" fill="${C.amber}" opacity="0.55"/>`;
    y += 17;
  }
  y += 12;

  // 载具位构成
  out += mono(X + 26, y, 'VEHICLE PADS', 9, C.amber, 'start', 700);
  y += 18;
  const byTeam: Record<string, Record<string, number>> = {};
  for (const p of MAP.vehiclePads) {
    byTeam[p.team] = byTeam[p.team] ?? {};
    byTeam[p.team][p.vehicleId] = (byTeam[p.team][p.vehicleId] ?? 0) + 1;
  }
  for (const team of ['blue', 'orange', 'neutral'] as const) {
    const rows = Object.entries(byTeam[team] ?? {});
    const col = team === 'blue' ? C.blue : team === 'orange' ? C.orange : '#c8b98d';
    out += `<text x="${X + 26}" y="${y}" fill="${col}" font-family="${FONT}" font-size="11" font-weight="700">${team === 'blue' ? '蓝队' : team === 'orange' ? '橙队' : '中立'}</text>`;
    out += mono(X + 90, y, rows.map(([k, v]) => `${k.replace('light_tank', 'LT').replace('motorcycle', 'MOTO')}×${v}`).join('  '), 9.5, C.muted);
    y += 18;
  }

  // 图例
  y += 10;
  out += mono(X + 26, y, 'LEGEND', 9, C.amber, 'start', 700);
  y += 22;
  const legend: [string, string, 'line' | 'dash' | 'rect' | 'circle' | 'tri' | 'grid'][] = [
    ['line', '主路 10 m 沥青 + 每侧 2 m 窄肩（总宽 14 m）', 'line'],
    ['dash', '支路 6–9 m（集市石铺/场地混凝土）', 'dash'],
    ['circle', '据点圈（A–G，7 个）', 'circle'],
    ['rect', '出生区 110×110', 'rect'],
    ['tri', '沙丘峰值高度（3–10 m）', 'tri'],
    ['rect', '建筑屋顶', 'rect'],
    ['circle', '棕榈/树冠', 'circle'],
    ['dash', '战略路线（蓝/橙）', 'dash'],
    ['grid', '100 m 坐标网格', 'grid'],
  ];
  for (const [kind, text] of legend) {
    const col = kind === 'tri' ? C.amber : kind === 'dash' ? C.cyan : kind === 'rect' ? C.stone : C.white;
    out += legendSwatch(X + 26, y, kind as 'line' | 'dash' | 'rect' | 'circle' | 'tri' | 'grid', col, text);
    y += 22;
  }

  // 出生区 → 据点
  y += 10;
  out += mono(X + 26, y, 'SPAWN → OBJECTIVE', 9, C.amber, 'start', 700);
  y += 20;
  const bSpawn = MAP.spawns.find((sp) => sp.team === 'blue');
  const oSpawn = MAP.spawns.find((sp) => sp.team === 'orange');
  const bc = bSpawn ? [bSpawn.x + bSpawn.w / 2, bSpawn.y + bSpawn.d / 2] : [0, 0];
  const oc = oSpawn ? [oSpawn.x + oSpawn.w / 2, oSpawn.y + oSpawn.d / 2] : [0, 0];
  for (const cp of MAP.capturePoints) {
    const db = Math.round(Math.hypot(cp.x - bc[0], cp.y - bc[1]));
    const dot = Math.round(Math.hypot(cp.x - oc[0], cp.y - oc[1]));
    out += `<text x="${X + 26}" y="${y}" fill="${C.white}" font-family="${FONT}" font-size="10" font-weight="600">${cp.id} ${esc(cp.name)}</text>`;
    out += mono(X + 330, y, `蓝 ${db}m`, 9.4, C.blue, 'end');
    out += mono(X + 420, y, `橙 ${dot}m`, 9.4, C.orange, 'end');
    out += mono(X + 560, y, `r${cp.radius}`, 9, C.faint, 'end');
    out += `<line x1="${X + 26}" y1="${y + 6}" x2="${X + PW - 26}" y2="${y + 6}" stroke="${C.lineSoft}"/>`;
    y += 19;
  }
  y += 10;

  // 路线
  out += mono(X + 26, y, 'ROUTES', 9, C.amber, 'start', 700);
  y += 18;
  for (const r of MAP.routes) {
    const col = r.team === 'blue' ? C.blue : C.orange;
    out += `<line x1="${X + 26}" y1="${y - 3.5}" x2="${X + 56}" y2="${y - 3.5}" stroke="${col}" stroke-width="2.2" stroke-dasharray="${r.kind === 'vehicle' ? '3 4' : '7 4'}"/>`;
    out += `<text x="${X + 66}" y="${y}" fill="${C.muted}" font-family="${FONT}" font-size="9.8">${r.team === 'blue' ? '蓝' : '橙'} · ${esc(r.label)}</text>`;
    out += mono(X + PW - 26, y, r.kind ?? 'main', 8.6, C.faint, 'end');
    y += 17;
  }
  y += 12;

  // 说明
  const p1 = paragraph(
    '海拔与坡度来自 src/maps/pharaoh-height.ts 的 pharaohHeight()（1 m 体素地形的连续面）；锚点/道路/据点/载具位/掩体直接读 layout.ts 与 MapDef。' +
      '主路逐段纵坡 ≤1.8%，次路 ≤5.0%（契约 ≤5%）。水面 −2 m，新沙丘 3–10 m。金字塔 264×264 外层与狮身人面像体量由 builder 叠加，本图只画其占地。',
    X + 26,
    y,
    52,
    10.5,
    15.5,
    '#9daaa6',
  );
  out += p1.svg;
  return out;
}

/* ------------------------------ 图 2 ------------------------------ */

interface Proj {
  px: (x: number) => number;
  py: (z: number) => number;
  s: number;
}

function windowProj(win: { x0: number; z0: number; w: number; d: number }, rect: { x: number; y: number; w: number; h: number }): Proj {
  const s = Math.min(rect.w / win.w, rect.h / win.d);
  const ox = rect.x + (rect.w - win.w * s) / 2;
  const oy = rect.y + (rect.h - win.d * s) / 2;
  return {
    s,
    px: (x: number) => ox + (x - win.x0) * s,
    py: (z: number) => oy + (win.z0 + win.d - z) * s,
  };
}

function rectPath(x0: number, z0: number, x1: number, z1: number, p: Proj, fill: string, stroke: string, sw = 1, extra = ''): string {
  const x = p.px(x0);
  const y = p.py(z1);
  return `<rect x="${n(x)}" y="${n(y)}" width="${n((x1 - x0) * p.s)}" height="${n((z1 - z0) * p.s)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}" ${extra}/>`;
}

function renderUndergroundPlan(): string {
  const ground = (x: number, z: number) => Math.round(pharaohHeight(x, z));
  const exits = tunnelExitGeom(ground);

  let out = sheetHeader('PLAN 02 / 03', '法老坟墓 · 地下与室内分层图', 'UNDERGROUND & INTERIOR — pyramid tiers / sphinx hall / A–B tomb corridor / vertical links');
  out += `<rect x="58" y="124" width="2284" height="1600" fill="none" stroke="${C.lineSoft}"/>`;

  /* ---- A 金字塔分层（编号标记 + 图例）---- */
  const A = { x: 70, y: 136, w: 1110, h: 820 };
  out += panelBox(A.x, A.y, A.w, A.h, 'A · 阶梯金字塔（PYRAMID / 264 m 外层 · 24 级内核台坎 · +5 墓室层 · +20 上层 · 外顶 +58）', C.pyramid);
  // 窗口覆盖 264 m 外层 + 10 m 余量：世界坐标随 PYRAMID_CENTER/PYRAMID_OUTER_BASE 走。
  const pA = windowProj(
    { x0: PYRAMID_OUTER_BASE.x0 - 10, z0: PYRAMID_OUTER_BASE.z0 - 10, w: PYRAMID_OUTER_BASE.x1 - PYRAMID_OUTER_BASE.x0 + 20, d: PYRAMID_OUTER_BASE.z1 - PYRAMID_OUTER_BASE.z0 + 20 },
    { x: A.x + 18, y: A.y + 44, w: 740, h: 740 },
  );
  // 0.20 外层 264×264（顶 +58）：先铺底，再叠内核台坎。
  out += rectPath(PYRAMID_OUTER_BASE.x0, PYRAMID_OUTER_BASE.z0, PYRAMID_OUTER_BASE.x1, PYRAMID_OUTER_BASE.z1, pA, 'rgba(232,220,192,0.035)', 'rgba(255,226,170,0.75)', 1.6, 'stroke-dasharray="10 5"');
  // 台坎
  for (let i = TIER_HALF.length - 1; i >= 0; i--) {
    const half = TIER_HALF[i];
    const major = i % 6 === 0;
    out += rectPath(PYRAMID_CENTER[0] - half, PYRAMID_CENTER[1] - half, PYRAMID_CENTER[0] + half, PYRAMID_CENTER[1] + half, pA,
      i % 2 ? 'rgba(232,220,192,0.035)' : 'rgba(232,220,192,0.075)',
      major ? 'rgba(232,220,192,0.42)' : 'rgba(232,220,192,0.14)', major ? 1.1 : 0.6);
    if (i % 6 === 0) out += mono(pA.px(PYRAMID_CENTER[0]) + 2, pA.py(PYRAMID_CENTER[1] + half) - 2, `+${6 + i * 2}`, 7.4, 'rgba(232,220,192,0.7)');
  }
  out += rectPath(PYRAMID_BASE.x0, PYRAMID_BASE.z0, PYRAMID_BASE.x1, PYRAMID_BASE.z1, pA, 'none', C.pyramid, 1.8);
  // 墓室层 / 上层
  const floor5 = PYRAMID_ROOMS.filter((q) => q.floor <= 5);
  const floor20 = PYRAMID_ROOMS.filter((q) => q.floor === 20);
  for (const r of floor5) {
    const hero = r.id === 'burial-chamber';
    out += rectPath(r.x0, r.z0, r.x1, r.z1, pA, hero ? 'rgba(255,180,84,0.36)' : 'rgba(232,220,192,0.20)', hero ? 'rgba(255,214,150,0.95)' : 'rgba(255,240,210,0.55)', hero ? 1.3 : 0.8);
  }
  for (const r of floor20) out += rectPath(r.x0, r.z0, r.x1, r.z1, pA, 'rgba(112,208,255,0.28)', 'rgba(112,208,255,0.9)', 0.9, 'stroke-dasharray="4 2"');
  // 楼梯
  for (const [idx, st] of PYRAMID_STAIRS.entries()) {
    const col = st.exterior ? C.cyan : C.amber;
    const d = `M${n(pA.px(st.from[0]))},${n(pA.py(st.from[1]))} L${n(pA.px(st.to[0]))},${n(pA.py(st.to[1]))}`;
    out += `<path d="${d}" fill="none" stroke="rgba(6,10,12,0.65)" stroke-width="8" stroke-linecap="round"/>`;
    out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${st.exterior ? 2.6 : 3.4}" stroke-dasharray="${st.exterior ? '8 5' : '0'}" stroke-linecap="round"/>`;
    const mx = (st.from[0] + st.to[0]) / 2;
    const mz = (st.from[1] + st.to[1]) / 2;
    out += `<circle cx="${n(pA.px(mx))}" cy="${n(pA.py(mz))}" r="9" fill="rgba(6,10,12,0.92)" stroke="${col}" stroke-width="1.3"/>`;
    out += mono(pA.px(mx), pA.py(mz) + 3.6, String.fromCharCode(65 + idx), 10, col, 'middle', 700);
  }
  // 房间编号
  const roomMarks: { id: string; num: number; label: string; floor: string }[] = [
    { id: 's-pylon-passage', num: 1, label: '南门楼通道（主门 6×4）', floor: '+5' },
    { id: 's-corridor', num: 2, label: '南入口走廊', floor: '+5' },
    { id: 's-antechamber', num: 3, label: '南前厅', floor: '+5' },
    { id: 'burial-chamber', num: 4, label: '墓室 32×26（净高 9）', floor: '+5' },
    { id: 'n-gallery', num: 5, label: '北雕像廊（净高 7）', floor: '+5' },
    { id: 'w-store', num: 6, label: '西陶罐储藏室', floor: '+5' },
    { id: 'e-collapse', num: 7, label: '东塌陷间', floor: '+5' },
    { id: 'e-entry', num: 8, label: '东入口走廊（接 A–B 墓道）', floor: '+5' },
    { id: 'w-entry', num: 9, label: '西入口走廊（4×3.5）', floor: '+5' },
    { id: 'upper-west', num: 10, label: '上层西廊 / 楼梯口', floor: '+20' },
    { id: 'upper-spine', num: 11, label: '上层南北廊', floor: '+20' },
    { id: 'north-gate-tunnel', num: 12, label: '北门楼通道（接施工栈道）', floor: '+20' },
  ];
  for (const m of roomMarks) {
    const r = PYRAMID_ROOMS.find((q) => q.id === m.id);
    if (!r) continue;
    const cx = pA.px((r.x0 + r.x1) / 2);
    const cy = pA.py((r.z0 + r.z1) / 2);
    const col = r.floor === 20 ? '#9fe2ff' : '#ffe6b8';
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="9.5" fill="rgba(6,10,12,0.92)" stroke="${col}" stroke-width="1.2"/>`;
    out += mono(cx, cy + 3.4, String(m.num), 9, col, 'middle', 700);
  }
  // 顶 / 平台
  out += rectPath(PYRAMID_TOP.x0, PYRAMID_TOP.z0, PYRAMID_TOP.x1, PYRAMID_TOP.z1, pA, 'rgba(255,180,84,0.45)', C.amber, 1.1);
  out += rectPath(PYRAMID_SUMMIT_HATCH.x0, PYRAMID_SUMMIT_HATCH.z0, PYRAMID_SUMMIT_HATCH.x1, PYRAMID_SUMMIT_HATCH.z1, pA, 'rgba(255,255,255,0.9)', C.white, 0.7);
  out += mono(A.x + 18, A.y + A.h - 26, `外顶 +${PYRAMID_OUTER_TOP} m · 外层 ${PHARAOH_MONUMENT_LINK.pyramidOuterHalf * 2}×${PHARAOH_MONUMENT_LINK.pyramidOuterHalf * 2} / 内核基座 132×132 · 平台 +${PYRAMID_PLATFORM} m · 内顶 +${PYRAMID_APEX} m · 24 级台坎（每级 2 m）`, 9.2, C.pyramid, 'start', 600);
  // 入口（图外引线；坐标从 PYRAMID_ROOMS 的 800 m 世界坐标派生）
  const roomRect = (id: string) => PYRAMID_ROOMS.find((q) => q.id === id);
  const southRoom = roomRect('s-pylon-passage');
  const westRoom = roomRect('west-pylon-passage') ?? roomRect('w-entry');
  const eastRoom = roomRect('east-pylon-passage') ?? roomRect('e-entry');
  const entranceNotes: [number, number, string, 'start' | 'end' | 'middle'][] = [
    [southRoom ? (southRoom.x0 + southRoom.x1) / 2 : PYRAMID_CENTER[0], southRoom?.z0 ?? PYRAMID_CENTER[1] - 75, '▲ 南主门 6×4（外层南廊）', 'middle'],
    [westRoom?.x0 ?? PYRAMID_OUTER_BASE.x0, westRoom ? (westRoom.z0 + westRoom.z1) / 2 : PYRAMID_CENTER[1], '◀ 西入口 4×3.5', 'end'],
    [eastRoom?.x1 ?? PYRAMID_OUTER_BASE.x1, eastRoom ? (eastRoom.z0 + eastRoom.z1) / 2 : PYRAMID_CENTER[1], '东入口 3.5×6 ▶', 'start'],
  ];
  for (const [x, z, text, anchor] of entranceNotes) {
    const tx = pA.px(x) + (anchor === 'end' ? -26 : anchor === 'start' ? 26 : 0);
    const ty = pA.py(z) + (anchor === 'middle' ? 40 : -16);
    out += `<line x1="${n(pA.px(x))}" y1="${n(pA.py(z))}" x2="${n(tx)}" y2="${n(ty + 4)}" stroke="rgba(232,220,192,0.45)" stroke-width="0.9"/>`;
    out += mono(tx, ty, text, 8.8, C.pyramid, anchor);
  }
  // 图例（右侧）
  const LX = A.x + 780;
  let ly = A.y + 62;
  out += mono(LX, ly, 'ROOM SCHEDULE', 9, C.amber, 'start', 700);
  ly += 20;
  for (const m of roomMarks) {
    const col = m.floor === '+20' ? '#9fe2ff' : '#ffe6b8';
    out += `<circle cx="${LX + 8}" cy="${ly - 3.5}" r="8" fill="rgba(6,10,12,0.92)" stroke="${col}" stroke-width="1.1"/>`;
    out += mono(LX + 8, ly - 0.2, String(m.num), 8, col, 'middle', 700);
    out += `<text x="${LX + 24}" y="${ly}" fill="${C.text}" font-family="${FONT}" font-size="9.8">${esc(m.label)}</text>`;
    out += mono(LX + 300, ly, m.floor, 9.4, C.amber, 'end');
    ly += 21;
  }
  ly += 10;
  out += mono(LX, ly, 'STAIRS', 9, C.amber, 'start', 700);
  ly += 18;
  for (const [idx, st] of PYRAMID_STAIRS.entries()) {
    const col = st.exterior ? C.cyan : C.amber;
    out += `<circle cx="${LX + 8}" cy="${ly - 3.5}" r="8" fill="rgba(6,10,12,0.92)" stroke="${col}" stroke-width="1.1"/>`;
    out += mono(LX + 8, ly - 0.2, String.fromCharCode(65 + idx), 8, col, 'middle', 700);
    out += `<text x="${LX + 24}" y="${ly}" fill="${C.muted}" font-family="${FONT}" font-size="9.2">${esc(st.label)}</text>`;
    out += mono(LX + 300, ly, `${st.steps}×${st.riser}m`, 8.8, col, 'end');
    ly += 18;
  }
  ly += 12;
  out += paragraph(
    `800 m 世界坐标：A 锚点 (${PYRAMID_CENTER[0]}, ${PYRAMID_CENTER[1]})。编号 1–9 = 墓室层 +5（含 3 个入口）；10–12 = 上层 +20。楼梯 A/B 为内部梯，C/D/E 为外部考古阶梯与施工栈道（0.5 m 级高）。地面整平 +4 m，金字塔体量从平台顶堆起，不依赖 buildings。`,
    LX,
    ly,
    27,
    9,
    13.5,
    '#9daaa6',
  ).svg;

  /* ---- B 狮身人面像（编号 + 图例）---- */
  const B = { x: 1210, y: 136, w: 1120, h: 560 };
  out += panelBox(B.x, B.y, B.w, B.h, 'B · 狮身人面像内殿（SPHINX / 内殿 40×24 · 环廊 · 后厅 · 头室 +36 · 头顶 +41）', C.sphinx);
  const pB = windowProj(
    { x0: SPHINX.bounds.x0 - 10, z0: SPHINX.bounds.z0 - 10, w: SPHINX.bounds.x1 - SPHINX.bounds.x0 + 20, d: SPHINX.bounds.z1 - SPHINX.bounds.z0 + 20 },
    { x: B.x + 18, y: B.y + 44, w: 690, h: 420 },
  );
  out += rectPath(SPHINX.bounds.x0, SPHINX.bounds.z0, SPHINX.bounds.x1, SPHINX.bounds.z1, pB, 'rgba(255,212,121,0.10)', C.sphinx, 1.6);
  out += rectPath(SPHINX.hall.x0, SPHINX.hall.z0, SPHINX.hall.x1, SPHINX.hall.z1, pB, 'rgba(255,180,84,0.34)', 'rgba(255,236,200,0.9)', 1.1);
  for (const side of Object.values(SPHINX.ring)) out += rectPath(side.x0, side.z0, side.x1, side.z1, pB, 'rgba(232,220,192,0.16)', 'rgba(232,220,192,0.55)', 0.8);
  out += rectPath(SPHINX.rearHall.x0, SPHINX.rearHall.z0, SPHINX.rearHall.x1, SPHINX.rearHall.z1, pB, 'rgba(255,180,84,0.18)', 'rgba(255,236,200,0.65)', 0.8);
  out += rectPath(SPHINX.stairs.flight1.x0, SPHINX.stairs.flight1.z0, SPHINX.stairs.flight1.x1, SPHINX.stairs.flight1.z1, pB, 'rgba(112,208,255,0.36)', 'rgba(112,208,255,0.9)', 0.9);
  out += rectPath(SPHINX.stairs.landing1.x0, SPHINX.stairs.landing1.z0, SPHINX.stairs.landing1.x1, SPHINX.stairs.landing1.z1, pB, 'rgba(112,208,255,0.22)', 'rgba(112,208,255,0.7)', 0.8);
  out += rectPath(SPHINX.stairs.flight2.x0, SPHINX.stairs.flight2.z0, SPHINX.stairs.flight2.x1, SPHINX.stairs.flight2.z1, pB, 'rgba(112,208,255,0.36)', 'rgba(112,208,255,0.9)', 0.9);
  out += rectPath(SPHINX.headRoom.x0, SPHINX.headRoom.z0, SPHINX.headRoom.x1, SPHINX.headRoom.z1, pB, 'rgba(160,130,255,0.32)', 'rgba(200,180,255,0.95)', 1.1);
  // 编号标记（全部由 SPHINX 的 800 m 世界坐标派生）
  const rectCenter = (r: { x0: number; x1: number; z0: number; z1: number }) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
  const hallC = rectCenter(SPHINX.hall);
  const rearC = rectCenter(SPHINX.rearHall);
  const ringNC = rectCenter(SPHINX.ring.north);
  const stairsC = rectCenter(SPHINX.stairs.flight1);
  const headC = rectCenter(SPHINX.headRoom);
  const foreC = rectCenter(SPHINX.forecourt);
  const sphinxMarks: { x: number; z: number; num: number; label: string }[] = [
    { ...hallC, num: 1, label: '内殿 40×24 · +4（净高 9.5）' },
    { ...rearC, num: 2, label: '西后厅 31×20 · +4' },
    { ...ringNC, num: 3, label: '环廊（6–7 m 宽 · 净高 5）' },
    { ...stairsC, num: 4, label: '胸部楼梯 +5→+36（2×16 级）' },
    { ...headC, num: 5, label: '头室 +36（净高 4）· 头顶 +41' },
    { ...foreC, num: 6, label: '前庭/双爪之间 · +4' },
  ];
  for (const m of sphinxMarks) {
    const cx = pB.px(m.x);
    const cy = pB.py(m.z);
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="9" fill="rgba(6,10,12,0.9)" stroke="#ffe0a8" stroke-width="1.1"/>`;
    out += mono(cx, cy + 3.2, String(m.num), 8.6, '#ffe0a8', 'middle', 700);
  }
  // 四个入口（外置）
  for (const e of SPHINX.entrances) {
    const x = pB.px(e.x);
    const y = pB.py(e.z);
    const left = e.x < SPHINX.cx;
    out += `<circle cx="${n(x)}" cy="${n(y)}" r="4.5" fill="rgba(6,10,12,0.95)" stroke="${C.amber}" stroke-width="1.5"/>`;
    out += `<path d="M${n(x - 7)},${n(y - 7)} L${n(x + 7)},${n(y + 7)} M${n(x + 7)},${n(y - 7)} L${n(x - 7)},${n(y + 7)}" stroke="rgba(255,180,84,0.35)" stroke-width="0.9"/>`;
    const above = e.z > SPHINX.cz + 10;
    out += mono(left ? x - 18 : x + 18, above ? y - 14 : y + 18, `${e.name} · ${e.clear}m`, 8.2, C.sphinx, left ? 'end' : 'start');
  }
  // 图例（地图下方，三列）
  let bx = B.x + 22;
  let by = B.y + 486;
  out += mono(bx, by, 'INTERIOR SCHEDULE', 9, C.amber, 'start', 700);
  by += 22;
  for (const [i, m] of sphinxMarks.entries()) {
    const col = m.num >= 4 ? '#9fe2ff' : '#ffe0a8';
    const colX = B.x + 22 + (i % 2) * 540;
    const rowY = by + Math.floor(i / 2) * 20;
    out += `<circle cx="${colX + 8}" cy="${rowY - 3.5}" r="7.5" fill="rgba(6,10,12,0.9)" stroke="${col}" stroke-width="1"/>`;
    out += mono(colX + 8, rowY - 0.4, String(m.num), 7.6, col, 'middle', 700);
    out += `<text x="${colX + 22}" y="${rowY}" fill="${C.text}" font-family="${FONT}" font-size="9.4">${esc(m.label)}</text>`;
  }
  out += mono(B.x + 18, B.y + B.h - 12, `比例 ${pB.s.toFixed(2)} px/m · 坐标取自 pharaoh-sphinx.ts 的 SPHINX（内殿/环廊/后厅/头室/楼梯/入口）`, 8.4, C.faint);

  /* ---- C A–B 墓道 ---- */
  const Ct = { x: 70, y: 972, w: 1110, h: 400 };
  out += panelBox(Ct.x, Ct.y, Ct.w, Ct.h, 'C · A–B 地下墓道（TUNNEL / 主宽 5 m · 净高 3.5 m · 两个中途地表出口）', C.tunnel);
  const tunnelBounds = (() => {
    const xs = [...TUNNEL_ROUTE.map((p) => p[0]), TUNNEL_MOUTHS.a.x0, TUNNEL_MOUTHS.a.x1, TUNNEL_MOUTHS.b.x0, TUNNEL_MOUTHS.b.x1];
    const zs = [...TUNNEL_ROUTE.map((p) => p[1]), TUNNEL_MOUTHS.a.z0, TUNNEL_MOUTHS.a.z1, TUNNEL_MOUTHS.b.z0, TUNNEL_MOUTHS.b.z1];
    const pad = 10;
    return { x0: Math.min(...xs) - pad, z0: Math.min(...zs) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, d: Math.max(...zs) - Math.min(...zs) + pad * 2 };
  })();
  const pC = windowProj(tunnelBounds, { x: Ct.x + 18, y: Ct.y + 40, w: 780, h: 320 });
  const routePath = TUNNEL_ROUTE.map(([x, z], i) => `${i ? 'L' : 'M'}${n(pC.px(x))},${n(pC.py(z))}`).join(' ');
  out += `<path d="${routePath}" fill="none" stroke="rgba(207,169,255,0.16)" stroke-width="${n(6 * pC.s)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  out += `<path d="${routePath}" fill="none" stroke="rgba(207,169,255,0.9)" stroke-width="2.2" stroke-linejoin="round"/>`;
  // 洞口
  out += rectPath(TUNNEL_MOUTHS.a.x0, TUNNEL_MOUTHS.a.z0, TUNNEL_MOUTHS.a.x1, TUNNEL_MOUTHS.a.z1, pC, 'rgba(255,180,84,0.55)', C.amber, 1.3);
  out += rectPath(TUNNEL_MOUTHS.b.x0, TUNNEL_MOUTHS.b.z0, TUNNEL_MOUTHS.b.x1, TUNNEL_MOUTHS.b.z1, pC, 'rgba(255,180,84,0.55)', C.amber, 1.3);
  out += mono(pC.px(TUNNEL_MOUTHS.a.x0) + 6, pC.py(TUNNEL_MOUTHS.a.z1) - 8, `A 口 · 地面 +${TUNNEL_MOUTHS.a.floor}`, 8.6, C.amber);
  out += mono(pC.px(TUNNEL_MOUTHS.b.x1) + 6, pC.py(TUNNEL_MOUTHS.b.z1) - 8, `B 口 · 地面 +${TUNNEL_MOUTHS.b.floor}`, 8.6, C.amber);
  // 折点里程
  let acc = 0;
  for (let i = 0; i < TUNNEL_ROUTE.length; i++) {
    const [x, z] = TUNNEL_ROUTE[i];
    if (i > 0) acc += Math.hypot(x - TUNNEL_ROUTE[i - 1][0], z - TUNNEL_ROUTE[i - 1][1]);
    out += `<circle cx="${n(pC.px(x))}" cy="${n(pC.py(z))}" r="3.4" fill="rgba(6,10,12,0.95)" stroke="rgba(207,169,255,0.9)" stroke-width="1.2"/>`;
    if (i === 0) out += mono(pC.px(x) + 6, pC.py(z) + 14, `A 口 (${x},${z})`, 8, 'rgba(207,169,255,0.9)');
    else if (i === TUNNEL_ROUTE.length - 1) out += mono(pC.px(x) - 6, pC.py(z) + 14, `B 侧 ${Math.round(acc)} m`, 8, 'rgba(207,169,255,0.9)', 'end');
  }
  // 中途出口
  for (const ex of exits) {
    const x0 = pC.px(ex.entry[0]);
    const y0 = pC.py(ex.entry[1]);
    const x1 = pC.px(ex.mouth[0]);
    const y1 = pC.py(ex.mouth[1]);
    out += `<line x1="${n(x0)}" y1="${n(y0)}" x2="${n(x1)}" y2="${n(y1)}" stroke="rgba(255,180,84,0.95)" stroke-width="2.2" stroke-dasharray="5 3"/>`;
    out += `<circle cx="${n(x0)}" cy="${n(y0)}" r="3.2" fill="${C.tunnel}" stroke="#1a1206" stroke-width="0.8"/>`;
    out += `<circle cx="${n(x1)}" cy="${n(y1)}" r="5" fill="rgba(6,10,12,0.95)" stroke="${C.amber}" stroke-width="1.6"/>`;
    out += mono(x1 + 9, y1 + 3, `↑ ${ex.name}`, 8.4, C.amber, 'start', 700);
  }
  // 石墩
  for (let ss = 24; ss < TUNNEL_LENGTH - 24; ss += 33) {
    const hit = tunnelAt(ss);
    const x = pC.px(hit.x);
    const y = pC.py(hit.z);
    out += `<line x1="${n(x - hit.nx * 1.8 * pC.s)}" y1="${n(y + hit.nz * 1.8 * pC.s)}" x2="${n(x + hit.nx * 1.8 * pC.s)}" y2="${n(y - hit.nz * 1.8 * pC.s)}" stroke="rgba(255,236,200,0.8)" stroke-width="2.4"/>`;
  }
  out += mono(Ct.x + 18, Ct.y + Ct.h - 12, `比例 ${pC.s.toFixed(2)} px/m · 路线/洞口/出口取自 pharaoh-tunnel.ts（TUNNEL_ROUTE / TUNNEL_MOUTHS / tunnelExitGeom）；短横线 = 石墩（净宽 1.6 m）`, 8.4, C.faint);
  // 出口小表（面板右侧留白）
  let ty = Ct.y + 58;
  out += mono(Ct.x + 812, ty, 'MID EXITS（两个中途地表出口）', 9, C.amber, 'start', 700);
  ty += 18;
  for (const ex of exits) {
    out += mono(Ct.x + 812, ty, `${ex.name} · s=${ex.entryS} m`, 9, C.tunnel, 'start', 700);
    out += mono(Ct.x + 812, ty + 13, `井底 +${ex.entryFloor} → 井口 +${ex.top} · ${ex.steps} 级 × 0.5 m`, 8.2, C.muted);
    out += mono(Ct.x + 812, ty + 26, `井口 (${Math.round(ex.mouth[0])}, ${Math.round(ex.mouth[1])}) · 距隧道壁 ${ex.run.toFixed(1)} m`, 8.2, C.muted);
    ty += 44;
  }
  out += mono(Ct.x + 812, ty + 4, '石墩：每 30–40 m 一道，净宽 1.6 m', 8, C.faint);
  out += mono(Ct.x + 812, ty + 17, '（摩托 0.8 m 可过，吉普/坦克不可）', 8, C.faint);
  out += mono(Ct.x + 812, ty + 30, '主通道净宽 5 m · 净高 3.5 m', 8, C.faint);
  out += mono(Ct.x + 812, ty + 43, 'A 口 +5 / B 口 +4，纵剖面见面板 E', 8, C.faint);

  /* ---- D 竖向连接 ---- */
  const D = { x: 1210, y: 712, w: 1120, h: 660 };
  out += panelBox(D.x, D.y, D.w, D.h, 'D · 竖向连接（VERTICAL LINKS / 世界 y −6 … +58）', C.white);
  const top = D.y + 56;
  const bottom = D.y + D.h - 92;
  const yOf = (v: number) => bottom - ((v + 6) / 64) * (bottom - top);
  // 网格（每 4 m，标注每 4 m；-6/-2 单独）
  for (let v = 0; v <= 56; v += 4) {
    const y = yOf(v);
    out += `<line x1="${D.x + 96}" y1="${n(y)}" x2="${D.x + D.w - 24}" y2="${n(y)}" stroke="${v === 0 ? 'rgba(235,245,240,0.2)' : C.lineSoft}" stroke-width="${v === 0 ? 1.1 : 0.7}"/>`;
    out += mono(D.x + 88, y + 3, `${v > 0 ? '+' : ''}${v}`, 8.6, v >= 20 ? C.amber : C.muted, 'end');
  }
  for (const v of [-6, -2]) {
    const y = yOf(v);
    out += `<line x1="${D.x + 96}" y1="${n(y)}" x2="${D.x + D.w - 24}" y2="${n(y)}" stroke="${C.lineSoft}" stroke-width="0.7" stroke-dasharray="3 5"/>`;
    out += mono(D.x + 88, y + 3, `${v}`, 8.4, '#7fd4e0', 'end');
  }
  // 三条竖向系统
  const systems: { x: number; col: string; name: string; sub: string; links: [number, number, string][] }[] = [
    {
      x: D.x + 330,
      col: C.pyramid,
      name: '金字塔',
      sub: `平台 +${PYRAMID_PLATFORM} · 外层 264×264 · 外顶 +${PYRAMID_OUTER_TOP}`,
      links: [
        [5, 20, '大楼梯 15×1 m'],
        [20, 52, '登顶梯 32×1 m'],
        [4, 52, '西南考古梯 48×1 m'],
        [4, 58, '西/北大阶梯 108×0.5 m'],
      ],
    },
    {
      x: D.x + 760,
      col: C.sphinx,
      name: '狮身人面像',
      sub: `内殿 +${SPHINX.hall.floor} · 头顶 +${SPHINX.headTop}`,
      links: [
        [5, 36, '胸部梯 2×16 级'],
        [36, 41, '头室 → 头顶 +5'],
      ],
    },
  ];
  for (const sys of systems) {
    out += `<line x1="${sys.x}" y1="${n(yOf(-6))}" x2="${sys.x}" y2="${n(yOf(58))}" stroke="rgba(235,245,240,0.10)" stroke-width="1"/>`;
    out += mono(sys.x, D.y + D.h - 52, sys.name, 11, sys.col, 'middle', 700);
    out += mono(sys.x, D.y + D.h - 36, sys.sub, 8.4, C.faint, 'middle');
    sys.links.forEach(([a, b, text], k) => {
      const x = sys.x + (k - (sys.links.length - 1) / 2) * 12;
      const ya = yOf(a);
      const yb = yOf(b);
      out += `<line x1="${n(x)}" y1="${n(ya)}" x2="${n(x)}" y2="${n(yb)}" stroke="${sys.col}" stroke-width="3.2" opacity="0.95"/>`;
      for (const yy of [ya, yb]) out += `<circle cx="${n(x)}" cy="${n(yy)}" r="4.2" fill="${C.panel}" stroke="${sys.col}" stroke-width="1.8"/>`;
      out += mono(x + 7, (ya + yb) / 2 + 3, text, 7.6, 'rgba(235,245,240,0.7)');
    });
  }
  // 墓道单独说明（放大见 E）
  out += `<rect x="${D.x + 930}" y="${D.y + 70}" width="170" height="190" rx="3" fill="rgba(207,169,255,0.06)" stroke="rgba(207,169,255,0.35)"/>`;
  out += mono(D.x + 946, D.y + 94, 'A–B 墓道', 10, C.tunnel, 'start', 700);
  out += mono(D.x + 946, D.y + 116, `全长 ${TUNNEL_LENGTH.toFixed(0)} m`, 8.4, C.muted);
  out += mono(D.x + 946, D.y + 134, 'A 口 +5', 8.4, C.muted);
  out += mono(D.x + 946, D.y + 152, '最低 +1', 8.4, C.muted);
  out += mono(D.x + 946, D.y + 170, 'B 口 +4', 8.4, C.muted);
  out += mono(D.x + 946, D.y + 192, '2 个中途出口', 8.4, C.muted);
  out += mono(D.x + 946, D.y + 206, '→ 面板 E 纵剖面', 8, C.faint);
  out += mono(D.x + 20, D.y + D.h - 14, '实线 = 楼梯/梯井（可走）· 标高为世界 y（体素 1 m）· A–B 墓道纵剖面见面板 E', 8.2, C.faint);

  /* ---- E 墓道纵剖面 ---- */
  const E = { x: 70, y: 1388, w: 2260, h: 330 };
  out += panelBox(E.x, E.y, E.w, E.h, `E · 墓道纵剖面（LONG SECTION / 地面 +5 → +1 → +4 · 全长 ${TUNNEL_LENGTH.toFixed(1)} m）`, C.tunnel);
  const profX = (ss: number) => E.x + 110 + (ss / TUNNEL_LENGTH) * (E.w - 180);
  const profY = (v: number) => E.y + E.h - 56 - (v / 8) * (E.h - 116);
  out += `<rect x="${E.x + 110}" y="${n(profY(8))}" width="${E.w - 180}" height="${n(profY(0) - profY(8))}" fill="rgba(150,140,120,0.10)"/>`;
  const groundLine: string[] = [];
  const floorLine: string[] = [];
  for (let ss = 0; ss <= TUNNEL_LENGTH; ss += 2) {
    const hit = tunnelAt(ss);
    groundLine.push(`${n(profX(ss))},${n(profY(clamp(pharaohHeight(hit.x, hit.z), 0, 8)))}`);
    floorLine.push(`${n(profX(ss))},${n(profY(tunnelFloor(ss)))}`);
  }
  out += `<polyline points="${groundLine.join(' ')}" fill="none" stroke="rgba(200,220,210,0.5)" stroke-width="1.5"/>`;
  out += `<polygon points="${floorLine.join(' ')} ${n(profX(TUNNEL_LENGTH))},${n(profY(0))} ${n(profX(0))},${n(profY(0))}" fill="rgba(207,169,255,0.16)"/>`;
  out += `<polyline points="${floorLine.join(' ')}" fill="none" stroke="${C.tunnel}" stroke-width="2.4"/>`;
  for (let ss = 0; ss <= TUNNEL_LENGTH; ss += 20) {
    out += `<line x1="${n(profX(ss))}" y1="${E.y + E.h - 56}" x2="${n(profX(ss))}" y2="${E.y + E.h - 50}" stroke="${C.lineSoft}"/>`;
    out += mono(profX(ss), E.y + E.h - 36, `${ss}`, 7.4, C.faint, 'middle');
  }
  for (let v = 0; v <= 8; v++) out += mono(E.x + 102, profY(v) + 3, `+${v}`, 8, C.faint, 'end');
  // 洞口与出口
  const marks: [number, string, string, 'start' | 'end'][] = [
    [0, 'A 口 +5', C.amber, 'start'],
    [TUNNEL_LENGTH, 'B 口 +4', C.amber, 'end'],
  ];
  for (const ex of exits) {
    marks.push([ex.entryS, `${ex.name} · 井口 (${Math.round(ex.mouth[0])},${Math.round(ex.mouth[1])}) · ${ex.steps} 级@0.5m`, C.amber, ex.entryS > TUNNEL_LENGTH / 2 ? 'end' : 'start']);
    out += `<line x1="${n(profX(ex.entryS))}" y1="${n(profY(tunnelFloor(ex.entryS)))}" x2="${n(profX(ex.entryS))}" y2="${n(profY(ex.top))}" stroke="rgba(255,180,84,0.55)" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  }
  for (const [ss, text, col, anchor] of marks) {
    out += `<line x1="${n(profX(ss))}" y1="${n(profY(0))}" x2="${n(profX(ss))}" y2="${n(profY(7.6))}" stroke="rgba(235,245,240,0.2)" stroke-width="1" stroke-dasharray="3 4"/>`;
    out += mono(profX(ss) + (anchor === 'end' ? -8 : 8), profY(6.6), text, 8.4, col, anchor, 600);
  }
  out += mono(E.x + 110, E.y + 44, '主宽 5 m · 净高 3.5 m · 地面 0.5 m 取整 · 石墩每 30–40 m 留 1.6 m 净宽（摩托可过，吉普/坦克不可）', 8.6, C.faint);
  out += mono(E.x + E.w - 300, E.y + 44, '—— 地表（pharaohHeight）；━━ 墓道地面（tunnelFloor）', 8.4, C.faint);
  // 最低点
  let lowS = 0;
  let lowV = Infinity;
  for (let ss = 0; ss <= TUNNEL_LENGTH; ss += 1) {
    const v = tunnelFloor(ss);
    if (v < lowV) {
      lowV = v;
      lowS = ss;
    }
  }
  const lx = profX(lowS);
  out += `<line x1="${n(lx)}" y1="${n(profY(lowV))}" x2="${n(lx)}" y2="${n(profY(lowV) - 26)}" stroke="rgba(207,169,255,0.8)" stroke-width="1.2"/>`;
  out += mono(lx, profY(lowV) - 32, `最低 +${lowV.toFixed(1)} m @ s=${lowS} m`, 8.4, C.tunnel, 'middle', 700);

  out += sheetFooter('pharaoh-underground — 全部房间/楼梯/洞口坐标取自 src/game/world/pharaoh-pyramid.ts / pharaoh-sphinx.ts / pharaoh-tunnel.ts 的公开常量');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CANVAS_H}" viewBox="0 -${PAD_TOP} ${W} ${CANVAS_H}"><rect x="0" y="-${PAD_TOP}" width="${W}" height="${CANVAS_H}" fill="${C.bg}"/>${out}</svg>`;
}

/* ------------------------------ 图 3 ------------------------------ */

function renderHeightPlan(f: Field, fContour: Field): string {
  const M = { x: 70, y: 136, w: 1560, h: 1560 };
  const s = M.w / SIZE;
  const px = (x: number) => M.x + x * s;
  const py = (z: number) => M.y + M.h - z * s;
  const deep = deepest(f);
  const peaks = findPeaks(f, 3, 55, 10);

  let out = sheetHeader('PLAN 03 / 03', '法老坟墓 · 高度 / 坡度图', `ELEVATION & SLOPE — pharaohHeight() heatmap + 2 m contours · min ${f.min.toFixed(1)} m · max ${f.max.toFixed(1)} m`);
  out += `<rect x="${M.x - 12}" y="${M.y - 12}" width="${M.w + 24}" height="${M.h + 24}" fill="#0a0e11" stroke="${C.line}"/>`;
  out += `<image x="${M.x}" y="${M.y}" width="${M.w}" height="${M.h}" href="${heatRaster(f)}" preserveAspectRatio="none"/>`;

  // 等高线：每 2 m
  for (let level = -6; level <= 22; level += 2) {
    const major = level % 10 === 0 || level === 0;
    const d = contourPath(fContour, level, px, py);
    if (!d) continue;
    out += `<path d="${d}" fill="none" stroke="${level === 0 ? 'rgba(255,255,255,0.9)' : major ? 'rgba(255,248,232,0.55)' : 'rgba(255,248,232,0.30)'}" stroke-width="${level === 0 ? 1.8 : major ? 1.2 : 0.8}"/>`;
  }

  // 水面 + 道路
  const lakePts = PHARAOH_LAKE_POLYGON.map(([x, z]) => `${n(px(x))},${n(py(z))}`).join(' ');
  out += `<polygon points="${lakePts}" fill="rgba(70,190,200,0.10)" stroke="rgba(120,215,225,0.85)" stroke-width="1.6"/>`;
  for (const r of MAP.roads) {
    if (r.kind === 'shoulder') continue;
    const d = r.points.map((p, i) => `${i ? 'L' : 'M'}${n(px(p[0]))},${n(py(p[1]))}`).join(' ');
    out += `<path d="${d}" fill="none" stroke="rgba(10,14,16,0.55)" stroke-width="${n(Math.max(2, r.width * s))}"/>`;
    out += `<path d="${d}" fill="none" stroke="rgba(238,244,232,0.28)" stroke-width="0.8" stroke-dasharray="6 6"/>`;
  }

  // 主路纵坡标注（800 m 图主路 id = main-south）
  const main = PHARAOH_ROADS.find((r) => r.id === 'main-south');
  if (main?.elevations) {
    for (let i = 1; i < main.points.length; i++) {
      const [ax, az] = main.points[i - 1];
      const [bx, bz] = main.points[i];
      const len = Math.hypot(bx - ax, bz - az);
      const g = (Math.abs(main.elevations[i] - main.elevations[i - 1]) / len) * 100;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      out += mono(px(mx), py(mz) - 7, `${g.toFixed(2)}%`, 7.4, 'rgba(255,236,200,0.85)', 'middle');
    }
  }

  // 据点 / 出生区
  for (const cp of MAP.capturePoints) {
    out += `<circle cx="${n(px(cp.x))}" cy="${n(py(cp.y))}" r="${n(cp.radius * s)}" fill="none" stroke="${C.white}" stroke-width="1.6" stroke-dasharray="6 4"/>`;
    const h = cp.floorY ?? pharaohHeight(cp.x, cp.y);
    out += label(px(cp.x), py(cp.y) - cp.radius * s - 8, `${cp.id} +${h}`, 12, C.white, 'middle', 700);
  }
  for (const sp of MAP.spawns) {
    const x = px(sp.x);
    const y = py(sp.y + sp.d);
    const col = sp.team === 'blue' ? C.blue : C.orange;
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(sp.w * s)}" height="${n(sp.d * s)}" fill="none" stroke="${col}" stroke-width="1.4" stroke-dasharray="6 4"/>`;
    out += label(x + 6, py(sp.y + sp.d) + 18, `${sp.team === 'blue' ? '蓝队' : '橙队'} +${pharaohHeight(sp.x + sp.w / 2, sp.y + sp.d / 2).toFixed(1)}m`, 9.6, col, 'start', 700);
  }

  // 极值点
  out += `<g><path d="M${n(px(PYRAMID_CENTER[0]))},${n(py(PYRAMID_CENTER[1]) - 10)} l7,12 l-14,0 Z" fill="${C.amber}" stroke="#1a1206" stroke-width="1"/>`;
  out += label(px(PYRAMID_CENTER[0]), py(PYRAMID_CENTER[1]) - 22, `金字塔顶 +${PYRAMID_APEX} m（builder）· 地形 +4`, 10, C.amber, 'middle', 700);
  out += `<g><circle cx="${n(px(deep.x))}" cy="${n(py(deep.z))}" r="7" fill="none" stroke="#7fd4e0" stroke-width="2"/>`;
  out += label(px(deep.x), py(deep.z) + 24, `湖底 ${deep.h.toFixed(1)} m @ (${Math.round(deep.x)}, ${Math.round(deep.z)})`, 10, '#9fe6ef', 'middle', 700);
  peaks.slice(0, 6).forEach((p) => {
    out += `<circle cx="${n(px(p.x))}" cy="${n(py(p.z))}" r="3.4" fill="${C.amber}"/>`;
    out += mono(px(p.x) + 6, py(p.z) + 3, `${p.h.toFixed(1)}`, 8, 'rgba(255,236,200,0.95)');
  });

  out += mapGrid(px, py, M);
  out += coordTicks(px, py, M);
  out += northArrow(M.x + M.w - 50, M.y + 52);
  out += scaleBar(M.x + 26, M.y + M.h - 30, s, 200);

  out += panelHeight(f, peaks, deep, exitsOfGround());
  out += sheetFooter('pharaoh-height — 高程面来自 pharaohHeight()（1 m 体素地形的连续面），等高线 2 m（0 m 加粗为水线）；坡度 = 3×3 中心差分');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CANVAS_H}" viewBox="0 -${PAD_TOP} ${W} ${CANVAS_H}"><rect x="0" y="-${PAD_TOP}" width="${W}" height="${CANVAS_H}" fill="${C.bg}"/>${out}</svg>`;
}

function exitsOfGround() {
  return tunnelExitGeom((x, z) => Math.round(pharaohHeight(x, z)));
}

function panelHeight(f: Field, peaks: Peak[], deep: Peak, exits: ReturnType<typeof exitsOfGround>): string {
  // 800 m 图地形高程 −6…8 m；色标/直方图用 −6…12 留出沙丘峰值余量。
  const H_MIN = -6;
  const H_MAX = 12;
  const H_SPAN = H_MAX - H_MIN;
  const X = 1690;
  const Y = 136;
  const PW = 640;
  const PH = 1560;
  let out = panelBox(X, Y, PW, PH, 'ELEVATION DATA');
  let y = Y + 24;

  // 高程色标（横条）
  const cb = { x: X + 26, y: y + 26, w: PW - 52, h: 16 };
  let cbSvg = `<defs><linearGradient id="ht" x1="0" y1="0" x2="1" y2="0">`;
  for (let i = 0; i <= 20; i++) {
    const v = H_MIN + (i / 20) * H_SPAN;
    const [r, g, b] = ramp(HEAT_RAMP, v);
    cbSvg += `<stop offset="${((i / 20) * 100).toFixed(1)}%" stop-color="rgb(${r | 0},${g | 0},${b | 0})"/>`;
  }
  cbSvg += `</linearGradient></defs>`;
  cbSvg += `<rect x="${cb.x}" y="${cb.y}" width="${cb.w}" height="${cb.h}" fill="url(#ht)" stroke="${C.line}"/>`;
  for (let v = H_MIN; v <= H_MAX; v += 3) {
    const xx = cb.x + ((v - H_MIN) / H_SPAN) * cb.w;
    cbSvg += mono(xx, cb.y + 28, `${v}`, 7.8, C.muted, 'middle');
  }
  cbSvg += mono(cb.x + cb.w, cb.y + 40, 'm', 7.8, C.faint, 'end');
  out += cbSvg;
  y += 54;

  // 坡度缩略
  out += mono(X + 26, y + 16, 'SLOPE MAP（坡度分级）', 9, C.amber, 'start', 700);
  out += `<image x="${X + 26}" y="${y + 26}" width="300" height="300" href="${slopeRaster(sampleField(500))}" preserveAspectRatio="none" style="image-rendering:auto"/>`;
  out += `<rect x="${X + 26}" y="${y + 26}" width="300" height="300" fill="none" stroke="${C.line}"/>`;
  // 坡度图例
  const sx = X + 344;
  let sy = y + 44;
  const slopeBands: [number, number, string][] = [
    [0, 0.06, '<3.4° 平地'],
    [0.06, 0.14, '3.4–8° 缓坡'],
    [0.14, 0.26, '8–15° 沙丘坡'],
    [0.26, 0.42, '15–23° 陡沙坡'],
    [0.42, 0.62, '23–32° 沙脊/路堑'],
    [0.62, 0.8, '32–39° 崖边'],
    [0.8, 1.2, '>39° 平台/湖岸硬边'],
  ];
  for (const [a, b, text] of slopeBands) {
    const [r, g, bl] = ramp(SLOPE_RAMP, (a + b) / 2);
    out += `<rect x="${sx}" y="${sy - 9}" width="16" height="10" fill="rgb(${r | 0},${g | 0},${bl | 0})" stroke="rgba(0,0,0,0.4)"/>`;
    out += mono(sx + 22, sy, `${(Math.atan(a) * 180 / Math.PI).toFixed(0)}–${(Math.atan(b) * 180 / Math.PI).toFixed(0)}°`, 7.6, C.muted);
    out += `<text x="${sx + 76}" y="${sy}" fill="${C.text}" font-family="${FONT}" font-size="8.6">${esc(text)}</text>`;
    sy += 19;
  }
  // 坡度统计
  const slopeAll = sampleField(400);
  const vals: number[] = [];
  for (let k = 0; k < slopeAll.slope.length; k++) if (slopeAll.h[k] > 4) vals.push(slopeAll.slope[k]);
  vals.sort((a, b) => a - b);
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
  sy += 6;
  out += mono(sx, sy, '沙丘带（h>4m）坡度', 8.6, C.amber, 'start', 700);
  sy += 16;
  for (const [k, v] of [
    ['p50', q(0.5)],
    ['p90', q(0.9)],
    ['p99', q(0.99)],
  ] as [string, number][]) {
    out += mono(sx, sy, k, 8.8, C.muted);
    out += mono(sx + 34, sy, `${v.toFixed(3)} (${(Math.atan(v) * 180 / Math.PI).toFixed(1)}°)`, 8.4, C.text);
    sy += 14;
  }
  y += 390;

  // 高程直方图
  out += mono(X + 26, y + 20, 'HEIGHT HISTOGRAM（全图 2 m 采样）', 9, C.amber, 'start', 700);
  const bins = 27;
  const hist = new Array(bins).fill(0);
  for (let k = 0; k < slopeAll.h.length; k++) {
    const b = clamp(Math.floor(((slopeAll.h[k] - H_MIN) / H_SPAN) * bins), 0, bins - 1);
    hist[b]++;
  }
  const maxBin = Math.max(...hist);
  const hx = X + 26;
  const hy = y + 44;
  const hw = PW - 52;
  const hh = 130;
  for (let i = 0; i < bins; i++) {
    const bw = hw / bins;
    const bh = (hist[i] / maxBin) * hh;
    const v = H_MIN + ((i + 0.5) / bins) * H_SPAN;
    const [r, g, b] = ramp(HEAT_RAMP, v);
    out += `<rect x="${n(hx + i * bw)}" y="${n(hy + hh - bh)}" width="${n(bw - 1)}" height="${n(bh)}" fill="rgb(${r | 0},${g | 0},${b | 0})" opacity="0.85"/>`;
  }
  out += `<line x1="${hx}" y1="${hy + hh}" x2="${hx + hw}" y2="${hy + hh}" stroke="${C.line}"/>`;
  for (let v = H_MIN; v <= H_MAX; v += 3) {
    const xx = hx + ((v - H_MIN) / H_SPAN) * hw;
    out += mono(xx, hy + hh + 14, `${v}`, 7.8, C.faint, 'middle');
  }
  out += mono(hx + hw / 2, hy + hh + 28, 'm', 8, C.faint, 'middle');
  y += 210;

  // 主路纵剖面
  out += mono(X + 26, y + 18, 'MAIN ROAD PROFILE（主路纵坡，逐段）', 9, C.amber, 'start', 700);
  const main = PHARAOH_ROADS.find((r) => r.id === 'main-south');
  if (main?.elevations) {
    let acc = 0;
    const pts: [number, number][] = [[0, main.elevations[0]]];
    for (let i = 1; i < main.points.length; i++) {
      acc += Math.hypot(main.points[i][0] - main.points[i - 1][0], main.points[i][1] - main.points[i - 1][1]);
      pts.push([acc, main.elevations[i]]);
    }
    const total = acc;
    const gx = (s: number) => X + 60 + (s / total) * (PW - 100);
    const gy = (v: number) => y + 140 - (v / 10) * 110;
    out += `<rect x="${X + 44}" y="${y + 26}" width="${PW - 64}" height="120" fill="rgba(255,255,255,0.02)" stroke="${C.lineSoft}"/>`;
    for (const v of [0, 2, 4, 6, 8, 10]) {
      out += `<line x1="${X + 50}" y1="${n(gy(v))}" x2="${X + PW - 20}" y2="${n(gy(v))}" stroke="${C.lineSoft}"/>`;
      out += mono(X + 44, gy(v) + 3, `${v}`, 7.6, C.faint, 'end');
    }
    out += `<polyline points="${pts.map(([s, v]) => `${n(gx(s))},${n(gy(v))}`).join(' ')}" fill="none" stroke="${C.cyan}" stroke-width="2.2"/>`;
    for (let i = 1; i < main.points.length; i++) {
      const s0 = pts[i - 1][0];
      const s1 = pts[i][0];
      const g = (Math.abs(main.elevations[i] - main.elevations[i - 1]) / (s1 - s0)) * 100;
      out += mono(gx((s0 + s1) / 2), y + 162, `${g.toFixed(2)}%`, 6.8, g > 4 ? '#ff9e7a' : C.muted, 'middle');
    }
    out += mono(X + 50, y + 182, `全长 ${total.toFixed(0)} m · 最大纵坡 ${Math.max(...main.points.map((_, i) => (i ? Math.abs(main.elevations![i] - main.elevations![i - 1]) / Math.hypot(main.points[i][0] - main.points[i - 1][0], main.points[i][1] - main.points[i - 1][1]) * 100 : 0))).toFixed(2)}% · 逐段值见图`, 8, C.muted);
    y += 194;
  }

  // 关键高度表
  out += mono(X + 26, y + 18, 'KEY ELEVATIONS', 9, C.amber, 'start', 700);
  y += 34;
  const rows: [string, string][] = [
    ['外金字塔顶（builder）', `+${PYRAMID_OUTER_TOP} m`],
    ['金字塔外层 / 内核基座', `${PHARAOH_MONUMENT_LINK.pyramidOuterHalf * 2}×${PHARAOH_MONUMENT_LINK.pyramidOuterHalf * 2} / 132×132`],
    ['金字塔平台', `+${PYRAMID_PLATFORM} m`],
    ['墓室地面 / 上层廊道', '+5 / +20 m'],
    ['狮身内殿 / 头室 / 头顶', `+${SPHINX.hall.floor} / +${SPHINX.headRoom.floor} / +${SPHINX.headTop} m`],
    ['蓝队基地 / 橙队营地', `+${PHARAOH_LAYOUT.blue.ground} / +${PHARAOH_LAYOUT.orange.ground} m`],
    ['集市 C / 驿站 E', `+${PHARAOH_LAYOUT.C.ground} / +${PHARAOH_LAYOUT.E.ground} m`],
    ['神庙 F / 采石场 G', `+${PHARAOH_LAYOUT.F.ground} / +${PHARAOH_LAYOUT.G.ground} m`],
    ['绿洲 D', `+${PHARAOH_LAYOUT.D.ground} m`],
    ['水面', `${PHARAOH_WATER_SURFACE} m`],
    ['湖底最低', `${deep.h.toFixed(2)} m @ (${Math.round(deep.x)},${Math.round(deep.z)})`],
    ['最高沙丘', `${peaks[0].h.toFixed(1)} m @ (${Math.round(peaks[0].x)},${Math.round(peaks[0].z)})`],
    ['A–B 墓道', `L ${TUNNEL_LENGTH.toFixed(1)} m · 地面 +5→+1→+4`],
    ['地表范围', `${f.min.toFixed(1)} … ${f.max.toFixed(1)} m`],
  ];
  for (const [k, v] of rows) {
    out += `<text x="${X + 26}" y="${y}" fill="${C.muted}" font-family="${FONT}" font-size="10.2">${esc(k)}</text>`;
    out += mono(X + PW - 26, y, v, 10.2, C.text, 'end');
    out += `<line x1="${X + 26}" y1="${y + 6}" x2="${X + PW - 26}" y2="${y + 6}" stroke="${C.lineSoft}"/>`;
    y += 20;
  }

  // 隧道出口高度
  y += 6;
  out += mono(X + 26, y, 'TUNNEL EXITS', 9, C.amber, 'start', 700);
  y += 17;
  for (const ex of exits) {
    out += mono(X + 26, y, `${ex.name}`, 9, C.tunnel);
    out += mono(X + 96, y, `井底 +${ex.entryFloor} → 井口 +${ex.top} · ${ex.steps} 级 · (${Math.round(ex.mouth[0])},${Math.round(ex.mouth[1])})`, 8.2, C.muted);
    y += 15;
  }

  // 剖面：A–A′（z=230 东西向，穿绿洲湖）与 B–B′（x=190 南北向，穿采石场/金字塔平台）
  y += 12;
  out += mono(X + 26, y, 'CROSS SECTIONS（地形剖面，1:1 / 800 m）', 9, C.amber, 'start', 700);
  y += 12;
  const sections: { key: string; title: string; samples: [number, number][] }[] = [
    { key: 'AA', title: 'A–A′  z = 230（东西向，穿绿洲湖）', samples: Array.from({ length: 161 }, (_, i) => [i * 5, 230] as [number, number]) },
    { key: 'BB', title: 'B–B′  x = 190（南北向，穿采石场/金字塔平台）', samples: Array.from({ length: 161 }, (_, i) => [190, i * 5] as [number, number]) },
  ];
  for (const sec of sections) {
    const vals = sec.samples.map(([sx, sz]) => pharaohHeight(sx, sz));
    const sx = X + 52;
    const sw = PW - 82;
    const sy = y + 10;
    const sh = 92;
    const vMin = -6.5;
    const vMax = 22;
    out += mono(X + 26, y + 4, sec.title, 8.2, C.muted);
    out += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="rgba(255,255,255,0.02)" stroke="${C.lineSoft}"/>`;
    // 0 m 基线
    const yAt = (v: number) => sy + sh - ((clamp(v, vMin, vMax) - vMin) / (vMax - vMin)) * sh;
    out += `<line x1="${sx}" y1="${n(yAt(0))}" x2="${sx + sw}" y2="${n(yAt(0))}" stroke="rgba(255,255,255,0.22)" stroke-width="0.8" stroke-dasharray="3 4"/>`;
    out += mono(sx - 6, yAt(0) + 3, '0', 7.2, C.faint, 'end');
    out += mono(sx - 6, yAt(20) + 3, '+20', 7.2, C.faint, 'end');
    out += mono(sx - 6, yAt(-6) + 3, '−6', 7.2, '#7fd4e0', 'end');
    const pts = vals.map((v, i) => `${n(sx + (i / (vals.length - 1)) * sw)},${n(yAt(v))}`).join(' ');
    out += `<polyline points="${pts}" fill="none" stroke="${sec.key === 'AA' ? C.cyan : C.amber}" stroke-width="1.6"/>`;
    out += mono(sx, sy + sh + 12, '0', 7, C.faint, 'start');
    out += mono(sx + sw / 2, sy + sh + 12, '400 m', 7, C.faint, 'middle');
    out += mono(sx + sw, sy + sh + 12, '800 m', 7, C.faint, 'end');
    y += sh + 30;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * README
 * ------------------------------------------------------------------ */

function writeReadme(f: Field, fContour: Field): void {
  const deep = deepest(f);
  const peaks = findPeaks(f, 3, 55, 8);
  const exits = exitsOfGround();
  const main = PHARAOH_ROADS.find((r) => r.id === 'main-south');
  const grades: string[] = [];
  if (main?.elevations) {
    for (let i = 1; i < main.points.length; i++) {
      const len = Math.hypot(main.points[i][0] - main.points[i - 1][0], main.points[i][1] - main.points[i - 1][1]);
      grades.push(((Math.abs(main.elevations[i] - main.elevations[i - 1]) / len) * 100).toFixed(2));
    }
  }
  const mainLength = (() => {
    let t = 0;
    for (let i = 1; i < (main?.points.length ?? 1); i++) t += Math.hypot(main!.points[i][0] - main!.points[i - 1][0], main!.points[i][1] - main!.points[i - 1][1]);
    return t;
  })();
  const siteRows = (['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const)
    .map((id) => `| ${id} | ${PHARAOH_SITE_LABELS[id]} | (${PHARAOH_LAYOUT[id].x}, ${PHARAOH_LAYOUT[id].z}) | +${PHARAOH_LAYOUT[id].ground} m |`)
    .join('\n');
  const md = `# 法老坟墓 · 平面图（docs/map-pharaoh/plans）

> 生成器：[\`tools/maps/pharaoh-plans.ts\`](../../../tools/maps/pharaoh-plans.ts) · 任务 PLAN-01（0.20.3 / 800 m 七据点）
> 三套图均为 **2400 × 2400** SVG + PNG，坐标与源码同源，不含手绘臆测；SVG 可直接进浏览器/矢量工具，PNG 由 Playwright 截取。

## 数据版本

| 项 | 值 |
|---|---|
| 游戏版本 | \`${VERSION}\` |
| BUILD_ID | \`${PLAN_BUILD_ID}\`（dist/version.json 同步；无构建产物时回退 test） |
| MAP_REVISION | \`${MAP_REVISION}\` |
| MATERIAL_REVISION | \`${MATERIAL_REVISION}\` |
| 地图尺寸 | ${SIZE} × ${SIZE} m（x 向东、z 向北，1 m 体素，体素面 = floor(高度)） |
| 高程来源 | \`src/maps/pharaoh-height.ts\` → \`pharaohHeight(x,z)\` |
| 生成时间 | ${new Date().toISOString()} |

## 场景锚点（\`src/maps/pharaoh/layout.ts\`）

| 点 | 场景 | 中心 (x,z) | 地面 |
|---|---|---|---|
${siteRows}
| blue | ${PHARAOH_SITE_LABELS.blue} | (${PHARAOH_LAYOUT.blue.x}, ${PHARAOH_LAYOUT.blue.z}) | +${PHARAOH_LAYOUT.blue.ground} m |
| orange | ${PHARAOH_SITE_LABELS.orange} | (${PHARAOH_LAYOUT.orange.x}, ${PHARAOH_LAYOUT.orange.z}) | +${PHARAOH_LAYOUT.orange.ground} m |

## 文件与内容

### 1) \`pharaoh-surface.svg / .png\` — 800 m 全图地表平面图
- **底图**：\`pharaohHeight()\` 1 m/px 采样 → 西北向光照阴影地形（沙丘脊线、背风坡）。
- **网格**：100 m 主线 + 50 m 次线，四边坐标刻度 0–${SIZE}（x 向东、z 向北）。
- **地形标注**：自动搜索的沙丘峰值（24 m 窗口局部极大 + 60 m 非极大抑制，新沙丘 3–10 m，标注真实高程 m）；绿洲水面描边。
- **地表材质**：MapDef.terrain 的沙砾/干裂土/石材/湿泥/草地图层。
- **道路**：单一真相 \`src/maps/pharaoh/network.ts\`；主路 10 m 沥青 + 每侧 2 m 窄肩（总宽 14 m），次路 6–9 m（集市石铺/驿站混凝土），步道 3–6 m。
- **构筑物**：${MAP.buildings.length} 栋建筑屋顶、${MAP.covers.length} 件掩体；金字塔 264 m 外层 + 24 级内核台坎 + 基座 + 顶；狮身人面像体量与内殿；A–B 墓道两个地表口。
- **玩法层**：7 个据点圈（A–G；A/B 带 floorY）、双方 110×110 出生区、32 个初始载具点（编号 01–32，按兵种缩写）、${MAP.routes.length} 条战略路线、${MAP.mgNests.length} 座重机枪、${MAP.specialCrates.length} 箱特殊武器（右栏统计）。
- **右栏**：站点统计、地形统计、沙丘峰值表、载具位构成、图例、出生区→据点距离（蓝/橙）、路线清单、说明。

### 2) \`pharaoh-underground.svg / .png\` — 地下与室内分层图
- **面板 A 金字塔**：264×264 外层（顶 +${PYRAMID_OUTER_TOP}）+ 132×132 内核 24 级台坎（每级 2 m，标注 +6…+52）、+5 墓室层 9 个空间、+20 上层 3 个空间、内顶 +${PYRAMID_APEX} 与登顶口；5 组楼梯 A–E（内部 1 m 级高 / 外部 0.5 m 级高）；南主门/西入口/东入口；编号图例（ROOM SCHEDULE）。
- **面板 B 狮身人面像**：内殿 40×24、环廊四段、西后厅 31×20、胸部楼梯（两跑 16 级）、头室 +${SPHINX.headRoom.floor}/头顶 +${SPHINX.headTop}、4 个入口（净宽 2 m）；编号图例。
- **面板 C A–B 墓道平面**：路线折线（折点里程）、A/B 洞口、两个中途出口（井底→井口级数、坐标）、石墩位置；右侧 MID EXITS 表；全长 ${TUNNEL_LENGTH.toFixed(1)} m。
- **面板 D 竖向连接**：世界 y −6…+58 标高梯，金字塔（+5→+20→+52、西南考古梯 48×1 m、西/北大阶梯 108×0.5 m）、狮身（+5→+36→+41）两条竖向系统。
- **面板 E 墓道纵剖面**：0–${TUNNEL_LENGTH.toFixed(0)} m 弧长 vs 高程（地表线 + 墓道地面线），洞口/出口/最低点标注。

### 3) \`pharaoh-height.svg / .png\` — 高度 / 坡度图（1:1）
- **主图**：高程热力（−6…+12 m 色标）+ **2 m 等高线**（0 m 水线加粗）+ 水面、道路、据点、出生区。
- **极值标注**：外金字塔顶 +${PYRAMID_OUTER_TOP}（builder 体量）、湖底 ${deep.h.toFixed(1)} m、最高沙丘、各据点高程。
- **主路逐段纵坡**：沿 main-south 中心线直接标注每段百分比（${grades.join(' / ')} %）。
- **右栏**：高程色标、坡度分级缩略图 + 分级图例、沙丘带坡度分位（p50/p90/p99）、高程直方图、主路纵剖面图、关键标高表、隧道出口高度、**A–A′/B–B′ 地形剖面**（z=230 穿湖 / x=190 穿采石场—金字塔）。

## 命令

\`\`\`bash
npx tsx tools/maps/pharaoh-plans.ts              # SVG + PNG + 本 README
npx tsx tools/maps/pharaoh-plans.ts --svg-only   # 只出 SVG（无浏览器依赖）
\`\`\`

PNG 由 Playwright（headless Chromium）以 2400×2400 视口、deviceScaleFactor=1 截取；可用 \`PLAYWRIGHT_CHROMIUM_EXECUTABLE\` 指定浏览器。

## 关键采样（与 \`docs/map-pharaoh/terrain-probe.json\` 同源）

- 地表高程范围 **${f.min.toFixed(2)} … ${f.max.toFixed(2)} m**（普通沙地 0–6、新沙丘 3–10；峰值 ${peaks[0]?.h.toFixed(1)} m）。
- 水面 **${PHARAOH_WATER_SURFACE} m**，湖底最低 **${deep.h.toFixed(2)} m @ (${Math.round(deep.x)}, ${Math.round(deep.z)})**。
- 主路 main-south 全长 ${mainLength.toFixed(1)} m，逐段纵坡 ${grades.join(' / ')} %（最大 **${main ? Math.max(...grades.map(Number)).toFixed(2) : '—'}%**，契约 ≤5%）。
- 沙丘峰值（自动搜索，前 8）：${peaks.map((p) => `${p.h.toFixed(1)}m@(${Math.round(p.x)},${Math.round(p.z)})`).join('、')}。
- 金字塔外层 264×264 / 外顶 +${PYRAMID_OUTER_TOP} m / 平台 +${PYRAMID_PLATFORM} m / 内顶 +${PYRAMID_APEX} m（builder 体量，非地形面）。
- 狮身内殿 +${SPHINX.hall.floor} m / 头室 +${SPHINX.headRoom.floor} m / 头顶 +${SPHINX.headTop} m。
- A–B 墓道全长 ${TUNNEL_LENGTH.toFixed(1)} m，地面 +5 → +1 → +4；中途出口：
${exits.map((ex) => `  - ${ex.name}：井底 +${ex.entryFloor} → 井口 +${ex.top}（${ex.steps} 级 × 0.5 m），井口 (${Math.round(ex.mouth[0])}, ${Math.round(ex.mouth[1])})`).join('\n')}

## 坐标与画法约定

- 世界坐标：\`x\` 向东、\`z\` 向北；图上 **上 = 北**、右 = 东；网格 100 m 主线 + 50 m 次线，范围 0–${SIZE}。
- 比例：地表图 1 px ≈ ${(SIZE / MAP1.w).toFixed(3)} m；高度图 1 px ≈ ${(SIZE / MAP1.w).toFixed(3)} m；分层图各面板角注单独给出 px/m。
- 高程色标：−6 深蓝 → −2 青 → 0 绿 → +6 黄 → +12 橙，单位 m；地形上界按沙丘 3–10 m 收敛。
- 等高线每 2 m 一条；0 m 线加粗（水线）；水面按 \`pharaohWaterSurface()\`（height < −2）判定。
- 沙丘峰值 = 24 m 窗口局部极大值 + 60 m 非极大抑制，直接对 \`pharaohHeight\` 采样（minHeight 3 m）。
- 道路：主路 10 m + 每侧 2 m 肩带（network 的 shoulder），次路 6–9 m；纵坡按 \`PHARAOH_ROADS.elevations\` 逐段计算。
- 地下图坐标全部来自 builder 的 \`export const\`（\`PYRAMID_ROOMS / PYRAMID_STAIRS / TIER_HALF / SPHINX / TUNNEL_ROUTE / TUNNEL_MOUTHS / tunnelExitGeom\`），builder 改动后重跑即可跟随，无需改本工具。

## 重新生成 / 校核

1. 改完地形/建筑/结构后重跑命令；SVG 是纯文本，可直接 diff 坐标变化。
2. 高程/等高线/峰值应与 \`docs/map-pharaoh/terrain-probe.json\` 一致（同一个 \`pharaohHeight\`）。
3. PNG 尺寸校验：\`file docs/map-pharaoh/plans/*.png\` 应全部为 2400×2400。
4. 本 README 由生成器自动重写，不要手改（改模板请改 \`writeReadme()\`）。
`;

  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), md, 'utf8');
}

/* ------------------------------------------------------------------ *
 * 主流程：生成 SVG → Playwright 截 PNG
 * ------------------------------------------------------------------ */

function browserExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const candidates = [
    '/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('[plans] sampling heightfield…');
  const t0 = Date.now();
  const fSurface = sampleField(SIZE); // 1 m / cell（800×800）
  const fContour = sampleField(SIZE / 2); // 2 m / cell
  console.log(`[plans] heightfield ${(Date.now() - t0) / 1000}s — min ${fSurface.min.toFixed(2)} max ${fSurface.max.toFixed(2)}`);

  const sheets: { file: string; svg: string }[] = [
    { file: 'pharaoh-surface', svg: renderSurfacePlan(fSurface) },
    { file: 'pharaoh-underground', svg: renderUndergroundPlan() },
    { file: 'pharaoh-height', svg: renderHeightPlan(fSurface, fContour) },
  ];

  for (const s of sheets) {
    const p = path.join(OUT_DIR, `${s.file}.svg`);
    fs.writeFileSync(p, s.svg, 'utf8');
    console.log(`[plans] ${path.relative(process.cwd(), p)}  ${(s.svg.length / 1024).toFixed(0)} KB`);
  }
  writeReadme(fSurface, fContour);

  if (SVG_ONLY) {
    console.log('[plans] --svg-only：跳过 PNG');
    return;
  }

  const exe = browserExecutable();
  if (!exe) {
    console.warn('[plans] 未找到 Chromium，跳过 PNG（可用 PLAYWRIGHT_CHROMIUM_EXECUTABLE 指定）');
    return;
  }
  const browser = await chromium.launch({ headless: true, executablePath: exe });
  const page = await browser.newPage({ viewport: { width: W, height: CANVAS_H }, deviceScaleFactor: 1 });
  for (const s of sheets) {
    const svg = fs.readFileSync(path.join(OUT_DIR, `${s.file}.svg`), 'utf8');
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:${C.bg};overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`,
      { waitUntil: 'load' },
    );
    await page.evaluate(async () => {
      await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
    });
    const png = path.join(OUT_DIR, `${s.file}.png`);
    await page.screenshot({ path: png, clip: { x: 0, y: 0, width: W, height: CANVAS_H } });
    console.log(`[plans] ${path.relative(process.cwd(), png)}  ${W}×${CANVAS_H}`);
  }
  await browser.close();
}

await main();
