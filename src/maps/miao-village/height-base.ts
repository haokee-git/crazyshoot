/**
 * 千户苗寨 · 解析基础高度场。
 *
 * 这里只做“大形”：河谷、两岸缓坡、外围群山、几个盆地/台地。建筑平台、道路、
 * 梯田、河道精确雕刻在 height.ts 的预计算场里叠加。layout.ts 只 import 本文件
 * （不 import height.ts），避免模块循环。
 */
import { riverAt, quayStreetY } from './river';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};
const dist = (x: number, z: number, cx: number, cz: number) => Math.hypot(x - cx, z - cz);
/** Smooth local basin: 1 inside, 0 outside. */
const basin = (x: number, z: number, cx: number, cz: number, inner: number, outer: number) =>
  1 - smooth(inner, outer, dist(x, z, cx, cz));
/** Elliptical ridge bump. */
const ridge = (x: number, z: number, cx: number, cz: number, rx: number, rz: number) => {
  const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
  return 1 - smooth(0.35, 1, d);
};

/** Deterministic low-frequency ridge noise (no random state). */
function ridgeNoise(x: number, z: number): number {
  const n =
    Math.sin(x * 0.061 + z * 0.017) * 0.5 +
    Math.sin(x * 0.027 - z * 0.043 + 1.7) * 0.3 +
    Math.sin(x * 0.109 + z * 0.091 + 4.1) * 0.2;
  return n * 0.5 + 0.5;
}

/** Mountain rim: steep ring that closes the valley; base 60-88 m. */
function mountainHeight(x: number, z: number): number {
  const edge = Math.min(x, z, 500 - x, 500 - z);
  // 0 at the map edge, 1 at 58 m inward. The 12-58 m band is the steep part.
  const rim = 1 - smooth(8,48, edge);
  if (rim <= 0) return 0;
  const peak = 62 + 26 * ridgeNoise(x, z);
  // Slight terrace in the rock face so it reads as strata, not a smooth cone.
  const strata = Math.sin((62 + 26 * ridgeNoise(x * 0.7, z * 0.7)) * 0.9) * 0.6;
  return (peak + strata) * rim;
}

/**
 * 设计基准：
 * - 蓝队基地 6、A 5、B 4、C 桥 3、D 16、E 9、橙队 12。
 * - 外围山体 60–88；可活动面积靠真实坡度 + 林带限制，不设空气墙。
 */
export function miaoBaseHeight(x: number, z: number): number {
  const r = riverAt(z);
  const dx = x - r.x;
  const side = dx < 0 ? 'west' : 'east';
  const d = Math.abs(dx);

  // 河谷两侧从堤岸街面缓慢抬升；0.045/m 让 100–150 m 外的坡地自然高出 5–8 m。
  const away = Math.max(0, d - r.halfWidth - 10);
  let h = quayStreetY(z, side) + away * 0.045;

  // 西坡 D 的宽台地：不是一座尖山，而是给坡地村寨预留的几层大台阶。
  h += 7.2 * basin(x, z, 150, 368, 62, 116);
  // 更靠西的上坡（寨边独栋/梯田）。
  h += 3.6 * basin(x, z, 96, 330, 44, 110);

  // 东岸 B 田园低地：打谷场/梯田在 4 m 附近，向东再抬升。
  h -= 4.2 * basin(x, z, 352, 140, 58, 120);
  // 蓝队基地所在的小盆地。
  h -= 5.8 * basin(x, z, 80, 76, 54, 128);
  // 橙队基地台地。
  h += 0.6 * basin(x, z, 416, 424, 46, 104);

  // 芦笙场/廊桥西岸的缓台。
  h -= 1.6 * basin(x, z, 184, 250, 34, 78);

  // 三个内圈山包：形成可读的“寨外高山”，但都远离出生区与据点。
  h += 24 * ridge(x, z, 58, 452, 58, 64);
  h += 20 * ridge(x, z, 452, 70, 52, 58);
  h += 18 * ridge(x, z, 454, 458, 48, 54);
  h += 14 * ridge(x, z, 52, 250, 42, 58);

  // 外围高山。
  h += mountainHeight(x, z);

  // 山体/台地硬上限：地图 vertical 高 108 / minY -12，最高可站 88。
  return clamp(h, -6, 88);
}

/** 用于“山坡太陡”判定的基础坡度。 */
export function miaoBaseSlope(x: number, z: number): number {
  const e = 0.75;
  const dx = miaoBaseHeight(x + e, z) - miaoBaseHeight(x - e, z);
  const dz = miaoBaseHeight(x, z + e) - miaoBaseHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}
