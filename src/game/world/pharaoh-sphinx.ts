/**
 * 法老坟墓 · B 点狮身人面像（体素 builder）—— 新布局重写
 *
 * 契约（Lead 的 MapDef / 平面图 / walk test 直接读这里，数值不要另写一份）：
 *   中心 (460,640)，面向 +x（东），平台 / 地面 +4。
 *   本体约 150×52 m（x 385..535 / z 614..666），清晰卧姿：
 *   后臀隆起 +20、背脊下凹 +18、胸口 / 肩 +26、头顶 +41；
 *   两条前腿从胸面 (x=516) 前伸到 x=535，双爪之间是 14 m 宽的前庭；
 *   nemes 头巾 / 头冠 / 面部（眉、眼、鼻、嘴、腮、耳）分层可读。
 *   头顶保留椭圆三级圆顶（38..39 / 39..40 / 40..41）。
 *
 * 室内：
 *   内殿 40×24（x 440..480 / z 628..652），地面 +4，空腔到 +14，
 *   0.5 m 压顶板把净高压到 9.5；四周 6–7 m 环廊、后厅 31×20，
 *   胸内前厅 + 两跑胸部楼梯（1 m/级，+4 → +36），头室 8×12 @ +36（净高 4）。
 *
 * 四个真实入口（全部 1.5–2 m 实宽 + 错位门厅 + 1 m 门槛）：
 *   west  x=385  z=635..645（与 A–B 墓道口对齐；内部 2 m 石门 x=400）
 *   north z=614  x=458..461（外接 2 m 高考古坡道；内部 2 m 净宽 + 2 级 1 m 台阶）
 *   south z=666  x=452..462（塌陷口；内部 2 m 石门 + 1 m 门槛 + 塌石）
 *   east  x=516  z=636..644（双前爪之间；2 m 石门偏南错位，前庭到 x=535）
 *
 * 碰撞/支撑：只写 voxels / 0.5 m detailBoxes / 静态灯，不写 heights、不调
 * setPrimary —— 载具第一层地面永远是平台 +4。载具进不了内殿靠真实几何：
 * 每个门都有一格 y=4 的门槛体素（车辆 footprint 从 primary+0.56 起扫必命中），
 * 加上 1.5–2 m 净宽与错位门厅（摩托在 2 m 深门厅里转不动 90°）。
 */

import type {PharaohOps} from './pharaoh-structures';

/* ------------------------------------------------------------------ *
 * 材质（契约 §5：狮身 80/81/83/85，另用 82/86 做层理与烟熏）
 * ------------------------------------------------------------------ */
const LIMESTONE = 80;   // limestone_shell   本体 / 脸部石灰岩
const SANDSTONE = 81;   // sandstone_block   砂岩石砌（头巾 / 室内 / 台阶）
const STRATA = 82;      // rock_strata       层理岩（基座 / 塌石 / 坡道）
const GRANITE = 83;     // granite_dark      花岗岩（门槛 / 祭台 / 五官 / 爪尖）
const RELIEF = 85;      // relief_fragment   浮雕残片（头巾褶 / 胸面日轮 / 祭台沿）
const SOOT = 86;        // stone_soot        烟熏石面（入口附近）
const WOOD = 7;         // timber_weathered  考古木撑
const METAL = 10;       // metal_galvanized  现代加固钢
const RUST = 14;        // steel_corroded    锈蚀钢

/* ------------------------------------------------------------------ *
 * 公开布局（probe / Lead 的 MapDef / 平面图 / walk test 直接引用）
 * ------------------------------------------------------------------ */
export const SPHINX = {
  /** 本体中心（B 点圈中心）。 */
  cx: 460,
  cz: 640,
  /** 契约平台顶；builder 仍以 ops.ground(cx,cz) 实测为准。 */
  base: 4,
  /** 本体素核心范围：长 150（x 385..535）/ 宽 52（z 614..666）。 */
  bounds: {x0: 385, x1: 535, z0: 614, z1: 666},
  /** 内殿 40×24，地面 +4，空腔到 +14（顶板 0.5 m → 净高 9.5）。 */
  hall: {x0: 440, x1: 480, z0: 628, z1: 652, floor: 4, ceiling: 14},
  /** 内殿四周环廊（6–7 m 宽，净高 5）。 */
  ring: {
    north: {x0: 433, x1: 487, z0: 621, z1: 628},
    south: {x0: 433, x1: 487, z0: 652, z1: 659},
    west: {x0: 433, x1: 439, z0: 628, z1: 652},
    east: {x0: 481, x1: 487, z0: 628, z1: 652},
  },
  /** 西后厅 31×20（接墓道门厅与西环廊）。 */
  rearHall: {x0: 401, x1: 432, z0: 630, z1: 650, floor: 4, ceiling: 11},
  /** 西入口门厅（墓道口与后厅之间，错位门厅）。 */
  vestibule: {x0: 386, x1: 400, z0: 634, z1: 646, floor: 4, ceiling: 9},
  /** 胸内前厅（楼梯间，东门进来后的第一间）。 */
  frontHall: {x0: 488, x1: 510, z0: 628, z1: 652, floor: 4, ceiling: 11},
  /** 胸部两跑楼梯（x496..512 头芯正下方）：西跑 +5→+20，回跑 +21→+36，每级 1 m。 */
  stairs: {
    flight1: {x0: 496, x1: 512, z0: 630, z1: 632, from: 5, to: 20},
    landing1: {x0: 492, x1: 496, z0: 630, z1: 634, y: 20},
    flight2: {x0: 496, x1: 512, z0: 632, z1: 634, from: 21, to: 36},
    landing2: {x0: 512, x1: 516, z0: 632, z1: 637, y: 36},
    topLanding: 36,
  },
  /** 头室：地面 +36，净高 4（天花板 +40），头顶 +41。 */
  headRoom: {x0: 512, x1: 520, z0: 634, z1: 646, floor: 36, ceiling: 40, top: 41},
  /** 双前爪之间的前庭（东入口的庭院，地面 / 平台 +4）。 */
  forecourt: {x0: 516, x1: 535, z0: 633, z1: 647},
  /** 四个入口：外边中点 + 实际门洞净宽 + 外层洞口矩形。 */
  entrances: [
    {id: 'west', name: '西后侧墓道口', x: 385, z: 640, clear: 2.0,
      mouth: {x0: 385, x1: 387, z0: 635, z1: 645}},
    {id: 'north', name: '北侧考古坡道', x: 459, z: 614, clear: 2.0,
      mouth: {x0: 458, x1: 461, z0: 614, z1: 617}},
    {id: 'south', name: '南侧塌陷口', x: 457, z: 666, clear: 2.0,
      mouth: {x0: 452, x1: 462, z0: 663, z1: 666}},
    {id: 'east', name: '东侧双前爪之间', x: 516, z: 640, clear: 2.0,
      mouth: {x0: 514, x1: 516, z0: 636, z1: 644}},
  ],
  /** B 点圈（Lead 的 MapDef 用 r=11 / floorY=4 / tolerance=3）。 */
  capture: {x: 460, z: 640, r: 11, floorY: 4},
  /** 关键高度（世界 y）/ 主体尺寸，供 QA 与探针引用。 */
  headTop: 41, chestTop: 26, hipTop: 20, altarTop: 5,
  length: 150, width: 52,
} as const;

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */
const CZ = SPHINX.cz;
const SCAN_TOP = 42;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
function smoothstep(a: number, b: number, v: number) {
  if (a === b) return v < a ? 0 : 1;
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
/** 分段线性剖面：pts 按 x 升序。 */
function profile(pts: readonly (readonly [number, number])[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + (y1 - y0) * ((x - x0) / (x1 - x0 || 1));
    }
  }
  return pts[pts.length - 1][1];
}
function inEllipse(cx: number, cz: number, x: number, z: number, rx: number, rz: number) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return dx * dx + dz * dz <= 1;
}

/** builder 上下文：base 实测，dy = base - 4，所有设计高度统一偏移。 */
interface BuildCtx {
  ops: PharaohOps;
  base: number;
  dy: number;
}
const Y = (c: BuildCtx, h: number) => h + c.dy;
const fill = (c: BuildCtx, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, mat: number) =>
  c.ops.box(x0, z0, x1, z1, Y(c, y0), Y(c, y1), mat);
const cut = (c: BuildCtx, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) =>
  c.ops.carve(x0, z0, x1, z1, Y(c, y0), Y(c, y1));
/** 0.5 m 栅格的 detail 盒（x0..x1 / z0..z1 给矩形，自动取中心）。 */
function detailBox(
  c: BuildCtx, id: string, material: number,
  x0: number, z0: number, x1: number, z1: number, y: number, h: number, angle = 0,
) {
  c.ops.detail(id, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, Y(c, y), h, material, angle);
}

/* ------------------------------------------------------------------ *
 * 1) 体量剖面（全部以 +4 平台为基准写死）
 * ------------------------------------------------------------------ */
/** 背脊顶（世界 y）：平背 +18，髋丘 +20，肩 / 胸 +26。 */
const SPINE: readonly (readonly [number, number])[] = [
  [385, 12.5], [390, 15.5], [396, 17.8], [402, 19.4], [408, 20.0], [420, 20.0],
  [430, 19.6], [442, 18.7], [455, 18.0], [466, 18.4], [476, 20.4], [484, 23.0],
  [490, 24.5], [496, 26.0], [516, 26.0],
];
/** 半宽（z）：臀 / 肩由椭球补到 25.5（合 51–52 m），腰 23.5。 */
const HALFWIDTH: readonly (readonly [number, number])[] = [
  [385, 12], [390, 16], [396, 20], [402, 22], [410, 23], [424, 23],
  [436, 23.5], [450, 24], [465, 23.5], [478, 23.5], [488, 24.5], [496, 25],
  [504, 25.5], [516, 25.5],
];

/** 横卧躯干：侧壁竖直、顶缘 3.2 m 圆角（侧影起伏交给背线）。 */
function trunkTop(cx: number, cz: number): number {
  if (cx < SPHINX.bounds.x0 || cx >= 516) return 0;
  const hw = profile(HALFWIDTH, cx);
  const dz = Math.abs(cz - CZ);
  if (dz > hw) return 0;
  return profile(SPINE, cx) - 3.2 * smoothstep(0.8, 1, dz / hw);
}

/** 椭球顶面（用于臀丘 / 肩丘）。 */
function ellipsoidTop(cx: number, cz: number, x0: number, z0: number, y0: number, rx: number, ry: number, rz: number) {
  const dx = (cx - x0) / rx;
  const dz = (cz - z0) / rz;
  const q = 1 - dx * dx - dz * dz;
  return q <= 0 ? 0 : y0 + ry * Math.sqrt(q);
}

/** 贴地体量：躯干 + 臀丘 / 肩丘 + 前腿 + 尾巴 + 后脚。 */
function baseTop(cx: number, cz: number): number {
  let top = trunkTop(cx, cz);
  // 后腿根部两颗大圆丘（顶 +20，向外鼓到 z614/666）
  for (const side of [-1, 1] as const) {
    top = Math.max(top, ellipsoidTop(cx, cz, 413, CZ + side * 17, 11, 22, 9, 9.5));
    // 肩丘（顶 +26）
    top = Math.max(top, ellipsoidTop(cx, cz, 502, CZ + side * 15, 14, 16, 12, 11));
  }
  const dz = Math.abs(cz - CZ);
  // 两条前腿：腕 +16 → 掌 +8.5 → 趾 +7.9，横向收圆（中心 |dz|=13）
  if (cx >= 516 && cx < 535 && dz >= 7 && dz <= 19) {
    let t: number;
    if (cx < 520) t = 16 - (cx - 516) * 0.5;
    else if (cx < 530) t = 14 - (cx - 520) * 0.55;
    else t = 8.5 - (cx - 530) * 0.12;
    t -= 1.3 * ((dz - 13) / 6) ** 2;
    top = Math.max(top, t);
  }
  // 南侧贴地卷尾（尾座顶 +9..+15.5）
  if (cx >= 385 && cx < 400 && cz >= 658 && cz < 666) {
    top = Math.max(top, 9 + 6.5 * smoothstep(385, 396, cx));
  }
  // 后脚掌（低平台）
  if (cx >= 388 && cx < 402 && cz >= 656 && cz < 666) {
    top = Math.max(top, 7.5);
  }
  return top;
}

/**
 * 头部（含头巾 / 冠 / 脸 / 鼻 / 下颌 / 耳 / 垂带 / 三级椭圆圆顶）的实体段。
 * 返回 [y0,y1] 列表（世界 +4 设计高度）。头部悬在胸面之前（x>516），
 * 所以前庭列的上方只有 26..41 的悬挑体量。
 */
function headRuns(cx: number, cz: number): number[][] {
  const runs: number[][] = [];
  const dz = Math.abs(cz - CZ);
  // 头芯（26..38）+ 头巾侧翼（顶 31.7→38 向后下收）
  if (cx >= 496 && cx < 529) {
    if (dz <= 12) runs.push([26, 38]);
    else if (dz <= 16 && cx >= 498 && cx < 527) runs.push([26, 38 - Math.max(0, 512 - cx) * 0.45]);
  }
  // 脸面板（向东凸 2 m）
  if (cx >= 529 && cx < 531 && dz <= 10) runs.push([28, 38]);
  // 鼻（鼻尖到 x=535）
  if (cx >= 531 && cx < 535 && dz <= 3) runs.push([31, 36]);
  // 下颌 / 下巴
  if (cx >= 529 && cx < 533 && dz <= 7) runs.push([28, 30]);
  // 耳朵（凸出头巾 2 m）
  if (cx >= 503 && cx < 508 && dz > 16 && dz <= 18) runs.push([31, 35]);
  // 头巾垂带（挂在胸 / 前庭上方，底 +22）
  if (cx >= 517 && cx < 528 && dz >= 15 && dz <= 18) runs.push([22, 26]);
  // 三级椭圆圆顶（38..39 / 39..40 / 40..41，头顶 +41）
  if (inEllipse(511.5, CZ, cx, cz, 16.5, 16)) runs.push([38, 39]);
  if (inEllipse(514, CZ, cx, cz, 11, 11)) runs.push([39, 40]);
  if (inEllipse(516, CZ, cx, cz, 7, 8)) runs.push([40, 41]);
  return runs;
}

/** 材质分层：基座 1 m 层理；头部砂岩；脸 / 鼻保持浅石灰岩；其余本体石灰岩。 */
function massMaterial(cx: number, y: number, cz: number): number {
  const h = y + 0.5;
  if (h < 5) return STRATA;
  const dz = Math.abs(cz - CZ);
  if (h >= 26) {
    if (cx >= 528.5 && dz <= 10) return LIMESTONE;      // 脸面板
    if (cx >= 531 && cz >= 637 && cz < 643 && h >= 31 && h < 36) return LIMESTONE; // 鼻
    if (cx >= 529 && cz >= 633 && cz < 647 && h < 30) return LIMESTONE;           // 下巴
    return SANDSTONE;                                   // 头巾 / 冠
  }
  return LIMESTONE;
}

/** 逐列填充体量：base 起逐 1 m 扫描，按材质合并成竖直段。 */
function buildMass(c: BuildCtx) {
  const {ops} = c;
  for (let z = SPHINX.bounds.z0 - 1; z < SPHINX.bounds.z1; z++) {
    for (let x = SPHINX.bounds.x0 - 1; x <= SPHINX.bounds.x1 - 1; x++) {
      const cx = x + 0.5;
      const cz = z + 0.5;
      const bt = baseTop(cx, cz);
      const head = headRuns(cx, cz);
      if (bt <= 4 && head.length === 0) continue;
      // 合并实体段（体素行号：世界 y 从 floor 到 ceil-1）
      const segs: [number, number][] = [];
      if (bt > 4.01) segs.push([4, Math.min(SCAN_TOP, Math.ceil(bt))]);
      for (const [a, b] of head) segs.push([a, Math.min(SCAN_TOP, Math.ceil(b))]);
      segs.sort((p, q) => p[0] - q[0]);
      const merged: [number, number][] = [];
      for (const seg of segs) {
        const last = merged[merged.length - 1];
        if (last && seg[0] <= last[1]) last[1] = Math.max(last[1], seg[1]);
        else merged.push([seg[0], seg[1]]);
      }
      for (const [s, e] of merged) {
        let y = s;
        while (y < e) {
          const mat = massMaterial(cx, y, cz);
          let end = y + 1;
          while (end < e && massMaterial(cx, end, cz) === mat) end++;
          ops.column(x, z, Y(c, y), Y(c, end), mat);
          y = end;
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * 2) 掏空内腔（内殿 / 环廊 / 后厅 / 门厅 / 前厅 / 楼梯井 / 头室 / 观察口）
 * ------------------------------------------------------------------ */
function carveInterior(c: BuildCtx) {
  /* 内殿 40×24：空腔到 +14，0.5 m 顶板另加（净高 9.5）。 */
  cut(c, 440, 628, 480, 652, 4, 14);
  /* 环廊：北 / 南 7 m、西 / 东 6 m，净高 5。 */
  cut(c, 433, 621, 487, 628, 4, 9);
  cut(c, 433, 652, 487, 659, 4, 9);
  cut(c, 433, 628, 439, 652, 4, 9);
  cut(c, 481, 628, 487, 652, 4, 9);
  /* 后厅 31×20（接西环廊 + 西入口门厅）。 */
  cut(c, 401, 630, 432, 650, 4, 11);
  /* 西入口门厅：从墓道口 (x=385) 进 14 m，再经 2 m 内门进后厅。 */
  cut(c, 386, 634, 400, 646, 4, 9);
  cut(c, 385, 635, 387, 645, 4, 9);
  /* 胸内前厅（楼梯间）。 */
  cut(c, 488, 628, 510, 652, 4, 11);
  /* 胸部楼梯井：两跑都落在 x496..512（头芯正下方），井挖到 +38（38..41 是三级冠）。
     北侧 2 m 宽的入口口袋（地面 +4）从前厅一直开到下跑起点 x=511。 */
  cut(c, 492, 630, 496, 634, 4, 23);
  cut(c, 496, 630, 516, 634, 4, 38);
  cut(c, 510, 628, 516, 632, 4, 9);
  /* 头室 8×12：地面 +36，净高 4（+40 天花板即三级冠底）。 */
  cut(c, 512, 634, 520, 646, 36, 40);
  /* 头室观察口：东面双眼窗（2×2）+ 西侧背窗（2×2），不做环形全开。 */
  cut(c, 520, 636, 532, 638, 36, 38);
  cut(c, 520, 642, 532, 644, 36, 38);
  cut(c, 496, 636, 512, 638, 36, 38);
}

/* ------------------------------------------------------------------ *
 * 3) 门洞 / 门槛（真实几何阻挡载具）
 * ------------------------------------------------------------------ */
function carveDoors(c: BuildCtx) {
  /* 内殿四门（6 m 宽，净高 5）。 */
  cut(c, 456, 627, 464, 628, 4, 9);   // 北
  cut(c, 456, 652, 464, 653, 4, 9);   // 南
  cut(c, 439, 637, 440, 643, 4, 9);   // 西
  cut(c, 480, 637, 481, 643, 4, 9);   // 东
  /* 后厅 ↔ 西环廊 / 前厅 ↔ 东环廊。 */
  cut(c, 432, 637, 433, 643, 4, 9);
  cut(c, 487, 637, 488, 643, 4, 9);

  /* 西入口内门：2 m 净宽 + 1 m 花岗岩门槛（玩家 1.05 m 上台阶可过）。 */
  cut(c, 400, 639, 401, 641, 4, 8);
  fill(c, 400, 639, 401, 641, 4, 5, GRANITE);
  /* 西侧门厅里的错位石屏：进门后必须侧移（2 m 深门厅，摩托转不动 90°）。 */
  fill(c, 396, 636, 397, 639, 4, 8, SANDSTONE);
  fill(c, 398, 641, 399, 645, 4, 8, SANDSTONE);

  /* 东入口（双前爪之间）：外层 8 m 洞口 → 2 m 深错位门厅 → 2 m 内门偏南。 */
  cut(c, 514, 636, 516, 644, 4, 9);
  cut(c, 512, 636, 514, 644, 4, 9);
  cut(c, 510, 641, 512, 643, 4, 8);
  fill(c, 510, 641, 512, 643, 4, 5, GRANITE);

  /* 北坡道门洞：外洞 3 m → 2 m 净宽（花岗岩门垛）→ 2 级 1 m 台阶下到 +4。 */
  cut(c, 458, 614, 461, 617, 6, 10);
  cut(c, 458, 617, 461, 621, 4, 10);
  // 洞口外侧（z 614..616.4 在体量外）补 +6 石砌月台，与北坡道坡顶齐平
  fill(c, 458, 613, 461, 617, 4, 6, SANDSTONE);
  fill(c, 458, 617, 461, 619, 4, 5, SANDSTONE);
  detailBox(c, 'sphinx-north-jamb-w', GRANITE, 458, 614, 458.5, 621, 4, 5);
  detailBox(c, 'sphinx-north-jamb-e', GRANITE, 460.5, 614, 461, 621, 4, 5);
  detailBox(c, 'sphinx-north-sill', GRANITE, 458.5, 617, 460.5, 618, 5, 0.3);
  detailBox(c, 'sphinx-north-lintel', GRANITE, 458, 613.5, 461, 614.5, 8.5, 0.5);

  /* 南塌陷口：10 m 破口 → 4 m 通道（门垛收到 2 m）→ 1 m 门槛。 */
  cut(c, 452, 663, 462, 666, 4, 9);
  cut(c, 455, 659, 459, 663, 4, 8);
  fill(c, 455, 661, 459, 663, 4, 5, GRANITE);
  detailBox(c, 'sphinx-south-jamb-w', GRANITE, 455, 659, 456, 663, 4, 4);
  detailBox(c, 'sphinx-south-jamb-e', GRANITE, 458, 659, 459, 663, 4, 4);
  detailBox(c, 'sphinx-south-lintel', GRANITE, 455, 658.5, 459, 659.5, 7.5, 0.5);
}

/* ------------------------------------------------------------------ *
 * 4) 胸部楼梯（16 + 16 级 × 1 m），+4 → +36 头室
 * ------------------------------------------------------------------ */
function buildStairs(c: BuildCtx) {
  const f1 = SPHINX.stairs.flight1;
  const f2 = SPHINX.stairs.flight2;
  const land = SPHINX.stairs.landing1;
  const top = SPHINX.stairs.landing2;

  /* 下跑：从东 (x=511, +5) 向西爬到 x496 = +20（16 级 × 1 m）。 */
  for (let x = f1.x0; x < f1.x1; x++) {
    fill(c, x, f1.z0, x + 1, f1.z1, 4, f1.to - (x - f1.x0), SANDSTONE);
  }
  /* 西端平台 +20（回跑起点，2 m 宽转角）。 */
  fill(c, land.x0, land.z0, land.x1, land.z1, 4, land.y, SANDSTONE);
  detailBox(c, 'sphinx-stair-landing-a', LIMESTONE, land.x0, land.z0, land.x1, land.z1, land.y, 0.1);

  /* 回跑：从西 (x=496, +21) 向东爬到 x511 = +36（16 级 × 1 m）。 */
  for (let x = f2.x0; x < f2.x1; x++) {
    fill(c, x, f2.z0, x + 1, f2.z1, 4, f2.from + (x - f2.x0), SANDSTONE);
  }
  /* 顶部平台 +36：3 m 厚悬挑石板（+33..36），下面留出楼梯入口口袋。 */
  fill(c, top.x0, 632, top.x1, 637, 33, top.y, SANDSTONE);
  // 石板西缘压边（读得出"头室地坪"）
  fill(c, 511, 632, 512, 637, 34, 36, SANDSTONE);
  detailBox(c, 'sphinx-stair-landing-b', LIMESTONE, top.x0, 632, top.x1, 637, top.y, 0.1);
  /* 井壁一道石檐，读到"胸内楼梯塔"。 */
  detailBox(c, 'sphinx-stair-cornice', RELIEF, 496, 630, 516, 630.5, 37.5, 0.5);
}

/* ------------------------------------------------------------------ *
 * 5) 室内陈设 / 灯（B 点圈 r11 内只留 1 m 低祭台）
 * ------------------------------------------------------------------ */
function buildFurniture(c: BuildCtx) {
  /* 中央低祭台：8×4 m、1 m 高，可直接踩上去；r11 点圈内除它之外无实体，
     且 r=4.8 的环带采样不被它挡住（B 点圈 40×24 内殿全程可走）。 */
  fill(c, 456, 638, 464, 642, 4, 5, GRANITE);
  detailBox(c, 'sphinx-altar-rim', RELIEF, 455.5, 637.5, 464.5, 642.5, 5, 0.12);
  detailBox(c, 'sphinx-altar-bowl-a', RELIEF, 458, 639, 459, 640, 5, 0.5);
  detailBox(c, 'sphinx-altar-bowl-b', RELIEF, 461, 640.5, 462, 641.5, 5, 0.5);

  /* 内殿四角残柱（距中心 19 m，在 r11 点圈之外）。 */
  for (const [x, z, h] of [[442, 630, 5], [476, 630, 4], [442, 648, 4], [476, 648, 5]] as const) {
    fill(c, x, z, x + 2, z + 2, 4, 4 + h, SANDSTONE);
    detailBox(c, `sphinx-col-${x}-${z}`, RELIEF, x, z, x + 2, z + 2, 4 + h, 0.5);
  }
  /* 环廊壁柱（贴外壁，留 5 m 通道）。 */
  for (const [x, z] of [[434, 622], [434, 655], [484, 622], [484, 655]] as const) {
    fill(c, x, z, x + 2, z + 2, 4, 7, SANDSTONE);
  }
  /* 后厅两排石墩 + 西壁假门。 */
  for (const [x, z] of [[406, 633], [406, 645], [424, 633], [424, 645]] as const) {
    fill(c, x, z, x + 2, z + 2, 4, 8, SANDSTONE);
    detailBox(c, `sphinx-rear-pier-${x}-${z}`, RELIEF, x, z, x + 2, z + 2, 8, 0.5);
  }
  detailBox(c, 'sphinx-rear-false-door', GRANITE, 401, 630, 401.5, 636, 4, 6);
  detailBox(c, 'sphinx-rear-false-cap', RELIEF, 401, 629.5, 402, 636.5, 10, 0.5);
  /* 西入口门厅石凳。 */
  fill(c, 389, 635, 392, 637, 4, 5, GRANITE);
  fill(c, 389, 643, 392, 645, 4, 5, GRANITE);
  /* 前厅壁龛（楼梯下）。 */
  detailBox(c, 'sphinx-front-niche', RELIEF, 488, 645, 488.5, 652, 4, 4);

  /* 内殿檐口（围绕 40×24 内殿一圈，读得出"殿"）。 */
  detailBox(c, 'sphinx-hall-cornice-n', RELIEF, 439, 628, 481, 628.5, 13, 0.5);
  detailBox(c, 'sphinx-hall-cornice-s', RELIEF, 439, 651.5, 481, 652, 13, 0.5);
  detailBox(c, 'sphinx-hall-cornice-w', RELIEF, 440, 628, 440.5, 652, 13, 0.5);
  detailBox(c, 'sphinx-hall-cornice-e', RELIEF, 479.5, 628, 480, 652, 13, 0.5);
  /* 0.5 m 压顶板：把 10 m 空腔压到净高 9.5。 */
  detailBox(c, 'sphinx-hall-ceiling', SANDSTONE, 439, 627, 481, 653, 13.5, 0.5);

  /* 静态暖光：内殿 4 + 环廊 2 + 后厅 2 + 前厅 1 + 头室 1。 */
  c.ops.addLamp(445, 8, 634);
  c.ops.addLamp(475, 8, 634);
  c.ops.addLamp(445, 8, 646);
  c.ops.addLamp(475, 8, 646);
  c.ops.addLamp(436, 7, 624);
  c.ops.addLamp(484, 7, 656);
  c.ops.addLamp(410, 8, 636);
  c.ops.addLamp(422, 8, 644);
  c.ops.addLamp(490, 9, 649);
  c.ops.addLamp(516, 38, 640);
}

/* ------------------------------------------------------------------ *
 * 6) 外边：北坡道 / 南塌石 / 东前庭 / 爪尖 / 考古撑
 * ------------------------------------------------------------------ */
function buildEntrances(c: BuildCtx) {
  const {ops} = c;

  /* ---- 西：墓道口两侧石壁收边（考古围栏在 x<385 之外，不挡 Lead 的墓道） ---- */
  detailBox(c, 'sphinx-west-jamb-n', GRANITE, 385, 634.5, 387, 635, 4, 5);
  detailBox(c, 'sphinx-west-jamb-s', GRANITE, 385, 645, 387, 645.5, 4, 5);
  detailBox(c, 'sphinx-west-lintel', GRANITE, 385, 634.5, 387, 645.5, 8.5, 0.5);

  /* ---- 北：外接考古坡道（+4 → +6），2 m 高，两侧挡墙 ---- */
  fill(c, 453, 608, 465, 611, 4, 5, STRATA);
  fill(c, 453, 611, 465, 614, 4, 6, STRATA);
  detailBox(c, 'sphinx-north-ramp-half-a', SANDSTONE, 453, 607.5, 465, 608, 4, 0.5);
  detailBox(c, 'sphinx-north-ramp-half-b', SANDSTONE, 453, 610.5, 465, 611, 5, 0.5);
  fill(c, 451, 608, 453, 614, 4, 7, SANDSTONE);
  fill(c, 465, 608, 467, 614, 4, 7, SANDSTONE);
  detailBox(c, 'sphinx-ramp-cheek-n-cap', RELIEF, 451, 608, 453, 614, 7, 0.5);
  detailBox(c, 'sphinx-ramp-cheek-s-cap', RELIEF, 465, 608, 467, 614, 7, 0.5);
  for (const [z, tag] of [[609, 'a'], [612, 'b']] as const) {
    detailBox(c, `sphinx-ramp-post-${tag}-w`, WOOD, 453.5, z, 454.5, z + 1, 4, 4.5);
    detailBox(c, `sphinx-ramp-post-${tag}-e`, WOOD, 463.5, z, 464.5, z + 1, 4, 4.5);
    detailBox(c, `sphinx-ramp-beam-${tag}`, WOOD, 453, z, 465, z + 0.5, 8.2, 0.5);
  }

  /* ---- 南：塌落石块堆 + 木撑（全部在洞外 z>=666，不挡通道） ---- */
  detailBox(c, 'sphinx-south-rubble-a', STRATA, 449, 666, 453, 669, 4, 1.4);
  detailBox(c, 'sphinx-south-rubble-b', STRATA, 454, 666.5, 458, 669, 4, 0.9);
  detailBox(c, 'sphinx-south-rubble-c', STRATA, 459, 666, 463, 669, 4, 1.6);
  detailBox(c, 'sphinx-south-prop-w', WOOD, 450.5, 667.5, 451.5, 668.5, 4, 6);
  detailBox(c, 'sphinx-south-prop-e', WOOD, 459.5, 667.5, 460.5, 668.5, 4, 6);
  // 破口锯齿：只削洞外上缘
  cut(c, 452, 664, 454, 666, 7, 9);
  cut(c, 459, 664, 462, 666, 7.5, 9);

  /* ---- 东：双爪之间的前庭（地面 +4）；石鼓 / 残碑当掩体 ---- */
  detailBox(c, 'sphinx-court-drum-a', RELIEF, 523, 633.5, 525, 635.5, 4, 1.4, Math.PI / 6);
  detailBox(c, 'sphinx-court-drum-b', RELIEF, 523, 644.5, 525, 646.5, 4, 1.2, -Math.PI / 7);
  detailBox(c, 'sphinx-east-gate-lintel', GRANITE, 509.5, 640.5, 512.5, 643.5, 8, 0.5);
  detailBox(c, 'sphinx-east-frame-w', GRANITE, 512, 640, 512.5, 641, 4, 4);
  detailBox(c, 'sphinx-east-frame-e', GRANITE, 512, 643, 512.5, 644, 4, 4);
  // 胸面日轮 + 神鹰翼浮雕（门上方）
  detailBox(c, 'sphinx-chest-sun', RELIEF, 516, 635, 516.5, 645, 20, 1.6);
  detailBox(c, 'sphinx-chest-wing-w', RELIEF, 516, 628, 516.5, 634.5, 20.5, 0.8);
  detailBox(c, 'sphinx-chest-wing-e', RELIEF, 516, 645.5, 516.5, 652, 20.5, 0.8);
  // 前腿：爪尖 3 根 / 爪，趾缝另 carve
  for (const zc of [621, 647] as const) {
    for (let i = 0; i < 3; i++) {
      const z0 = zc + 1 + i * 3.5;
      detailBox(c, `sphinx-claw-${zc}-${i}`, GRANITE, 533, z0, 535, z0 + 2.5, 7.5, 1.2);
    }
  }
  // 前腿腕部一道浅槽 + 外侧壁浮雕（贴 z=621 / 659 外表面）
  for (const dzc of [-13, 13] as const) {
    cut(c, 527, CZ + dzc - 5, 529, CZ + dzc + 5, 9, 11);
    const zFace = dzc < 0 ? CZ - 19.4 : CZ + 19;
    detailBox(c, `sphinx-leg-relief-${dzc}`, RELIEF, 520, zFace, 530, zFace + 0.4, 5, 3);
  }

  /* ---- 头部：头巾褶 / 额带 / 圣蛇 / 眉 / 嘴 / 耳 ---- */
  // 头巾侧面竖向褶（北 / 南各 2 条，贴在外表面 z=624 / 656 之外 0.3 m，避开耳朵）
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 2; i++) {
      const cx = 511 + i * 8;
      const z = side < 0 ? CZ - 16.3 : CZ + 16;
      detailBox(c, `sphinx-nemes-pleat-${side}-${i}`, RELIEF, cx, z, cx + 4, z + 0.3, 28, 6);
    }
  }
  // 额带 + 圣蛇（冠前）
  detailBox(c, 'sphinx-headband', LIMESTONE, 530.5, 631, 531, 649, 38, 1);
  detailBox(c, 'sphinx-uraeus', GRANITE, 530.5, 639, 531, 640.5, 39, 1.4);
  // 眉（1 m 出挑，压出眼窗阴影）
  detailBox(c, 'sphinx-brow', GRANITE, 531, 631, 532, 649, 38, 0.5);
  // 眼窗上下沿（花岗岩）
  for (const z0 of [636, 642] as const) {
    detailBox(c, `sphinx-eye-sill-${z0}`, GRANITE, 530, z0, 531.5, z0 + 2, 36, 0.4);
    detailBox(c, `sphinx-eye-brow-${z0}`, GRANITE, 530, z0, 531.5, z0 + 2, 37.6, 0.4);
  }
  // 嘴缝上 / 下唇 + 下颌
  detailBox(c, 'sphinx-mouth-lip', GRANITE, 531, 634, 533, 646, 30, 0.4);
  detailBox(c, 'sphinx-chin', GRANITE, 533, 633, 533.3, 647, 28.4, 0.5);
  // 鼻孔（鼻头底面浅凹）
  cut(c, 531, 638, 533, 639, 31, 32);
  cut(c, 531, 642, 533, 643, 31, 32);
  // 耳廓浮雕
  detailBox(c, 'sphinx-ear-n', GRANITE, 504, CZ - 18.4, 507, CZ - 18, 31.5, 2.5);
  detailBox(c, 'sphinx-ear-s', GRANITE, 504, CZ + 18, 507, CZ + 18.4, 31.5, 2.5);
  // 头巾垂带底缘流苏
  for (const side of [-1, 1] as const) {
    detailBox(c, `sphinx-lappet-fringe-${side}`, RELIEF, 518, CZ + side * 15.5, 527, CZ + side * 18, 21.5, 0.5);
  }
  // 西外壁假门（考古对象，避开墓道口）
  detailBox(c, 'sphinx-west-false-door', GRANITE, 384.5, 647, 385, 652, 4, 5);
  detailBox(c, 'sphinx-west-false-cap', RELIEF, 384, 646.5, 385.5, 652.5, 9, 0.5);
  // 入口烟熏
  detailBox(c, 'sphinx-soot-north', SOOT, 458.5, 614, 460.5, 620, 9.5, 0.5);
  detailBox(c, 'sphinx-soot-south', SOOT, 452, 663, 452.5, 666, 4, 4);
  detailBox(c, 'sphinx-soot-east', SOOT, 514, 636, 516, 636.5, 4, 3);
  detailBox(c, 'sphinx-soot-west', SOOT, 386, 634, 398, 634.5, 4, 4);

  /* ---- 考古加固：北肩一道钢撑 + 南尾锈撑 ---- */
  detailBox(c, 'sphinx-brace-north', METAL, 493, 613.5, 495, 615, 4, 12);
  detailBox(c, 'sphinx-brace-south', RUST, 391, 665.5, 393, 667, 4, 10);
}

/* ------------------------------------------------------------------ *
 * 7) 风化：背脊缺口 / 基座凹槽 / 臀腿分离槽 / 尾座断口
 * ------------------------------------------------------------------ */
function weatherSurface(c: BuildCtx) {
  /* 背脊缺口（内殿顶板 +14 之上，安全）。 */
  cut(c, 470, 648, 476, 653, 17, 19.5);
  cut(c, 471, 649, 475, 652, 16, 17);
  cut(c, 462, 650, 466, 653, 18, 19);
  /* 北肩顶风化缺口。 */
  cut(c, 490, 616, 496, 620, 24, 26);
  cut(c, 491, 617, 495, 619, 23, 24);
  /* 胸面南侧崩缺（避开东门 z636..644）。 */
  cut(c, 514, 646, 516, 656, 15, 20);
  cut(c, 515, 648, 516, 654, 12, 15);
  /* 基座风化凹槽（1 m 高，避开四个入口）。 */
  cut(c, 402, 663, 430, 665, 4, 5);
  cut(c, 470, 616, 500, 617, 4, 5);
  cut(c, 386, 660, 398, 666, 4, 5);
  /* 臀腿分离槽（躯干外缘下方掏 1 m）。 */
  cut(c, 400, 662, 438, 664, 9, 13);
  cut(c, 400, 616, 438, 618, 9, 13);
  /* 尾座与臀部之间分离槽。 */
  cut(c, 399, 658, 401, 662, 4, 13);
  cut(c, 399, 618, 401, 622, 4, 13);
  /* 尾座断口 + 后趾缝。 */
  cut(c, 385, 660, 390, 661, 4, 7);
  cut(c, 385, 663, 390, 664, 4, 7);
  cut(c, 399, 658, 402, 666, 4, 6);
  /* 前腿趾缝（3 爪 4 趾）。 */
  for (const zc of [621, 647] as const) {
    cut(c, 531, zc + 4, 535, zc + 5, 4, 7.5);
    cut(c, 531, zc + 8, 535, zc + 9, 4, 7.5);
  }
  /* 头部背面风化痕 + 头顶石缝。 */
  cut(c, 496, 645, 500, 650, 30, 34);
  cut(c, 520, 628, 524, 631, 37, 38);
  detailBox(c, 'sphinx-soot-head', SOOT, 530.9, 631, 531.1, 649, 30, 4);
}

/* ------------------------------------------------------------------ *
 * 出口
 * ------------------------------------------------------------------ */
export function buildSphinx(ops: PharaohOps): void {
  const base = ops.ground(SPHINX.cx, SPHINX.cz);
  const c: BuildCtx = {ops, base, dy: base - SPHINX.base};
  buildMass(c);
  carveInterior(c);
  carveDoors(c);
  buildStairs(c);
  buildFurniture(c);
  buildEntrances(c);
  weatherSurface(c);
  // 不写 heights、不调 setPrimary：载具第一层地面保持平台 +4；
  // 四个门各有 1 m 门槛体素 + 1.5–2 m 净宽 + 错位门厅，载具进不了内殿。
}
