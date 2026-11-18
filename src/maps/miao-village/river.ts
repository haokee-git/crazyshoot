/**
 * 白水河 · 单一河流数据源。
 *
 * 出处：设计任务给定的 (z, x中心, 半宽) 控制点。任何地形雕刻、水体、桥位、
 * 堤岸、梯子、渡船、导航与测试都必须读这一个文件，不允许在别处复制近似坐标。
 *
 * 插值使用 Fritsch–Carlson 单调三次 Hermite：曲线经过全部控制点、C1 连续、
 * 且在控制点之间不会 overshoot（不会把河道甩进岸边建筑）。
 */

export interface RiverControl {
  z: number;
  x: number;
  halfWidth: number;
}

/** 唯一控制点表。 */
export const RIVER_CONTROL: readonly RiverControl[] = [
  { z: -32, x: 225, halfWidth: 10 },
  { z: 60, x: 225, halfWidth: 11 },
  { z: 112, x: 228, halfWidth: 11 },
  { z: 170, x: 238, halfWidth: 12 },
  { z: 205, x: 232, halfWidth: 12 },
  { z: 250, x: 244, halfWidth: 13 },
  { z: 335, x: 266, halfWidth: 12 },
  { z: 392, x: 264, halfWidth: 11 },
  { z: 455, x: 276, halfWidth: 10 },
  { z: 532, x: 278, halfWidth: 10 },
];

export const RIVER_SURFACE_Y = -2;
export const RIVER_TOWPATH_Y = -1.2;
export const RIVER_DEFAULT_TOW_WIDTH = 5.5;
/** 渡口处加宽到 8 m，让给定的 40 m 缆索航线两端落在真实可站的驳岸上。 */
export const RIVER_FERRY_TOW_WIDTH = 8;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Fritsch–Carlson monotone cubic. Values at sample z; clamps outside the range. */
function monotone(zs: readonly number[], ys: readonly number[]): (z: number) => number {
  const n = zs.length;
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) delta.push((ys[i + 1] - ys[i]) / (zs[i + 1] - zs[i]));
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) m[i] = 0;
    else m[i] = (delta[i - 1] + delta[i]) / 2;
  }
  // Fritsch–Carlson limiter: keep the interpolant monotone (no overshoot).
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * delta[i];
      m[i + 1] = t * b * delta[i];
    }
  }
  return (z: number) => {
    if (z <= zs[0]) return ys[0];
    if (z >= zs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && z > zs[i + 1]) i++;
    const h = zs[i + 1] - zs[i];
    const t = (z - zs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
  };
}

const centerAt = monotone(
  RIVER_CONTROL.map((p) => p.z),
  RIVER_CONTROL.map((p) => p.x),
);
const halfAt = monotone(
  RIVER_CONTROL.map((p) => p.z),
  RIVER_CONTROL.map((p) => p.halfWidth),
);

export interface RiverSample {
  z: number;
  x: number;
  halfWidth: number;
  /** 水面两岸（河槽边缘）。 */
  waterWest: number;
  waterEast: number;
  /** 河床高度（河心最深）。 */
  bedY: number;
  /** 两侧 walkable towpath 外沿（即挡土墙内face）。 */
  towWest: number;
  towEast: number;
  towWidth: number;
  /** 挡土墙厚度 1 m 的街道侧位置。 */
  wallWest: number;
  wallEast: number;
  surfaceY: number;
  towY: number;
}

/** 渡口附近加宽 towpath（定义见下：南 z=205、北 z=335）。 */
export function towWidthAt(z: number): number {
  const south = 1 - smooth(10, 24, Math.abs(z - 205));
  const north = 1 - smooth(10, 24, Math.abs(z - 335));
  return RIVER_DEFAULT_TOW_WIDTH + (RIVER_FERRY_TOW_WIDTH - RIVER_DEFAULT_TOW_WIDTH) * Math.max(south, north);
}

export function riverAt(z: number): RiverSample {
  const x = centerAt(z);
  const halfWidth = halfAt(z);
  const surfaceY = RIVER_SURFACE_Y;
  // 河心比岸边深：宽度越大，河床越深（-3.6 .. -4.8）。
  const bedY = -3.6 - clamp((halfWidth - 10) / 3, 0, 1) * 1.2;
  const towWidth = towWidthAt(z);
  const waterWest = x - halfWidth;
  const waterEast = x + halfWidth;
  const towWest = waterWest - towWidth;
  const towEast = waterEast + towWidth;
  return {
    z, x, halfWidth, waterWest, waterEast,
    bedY, towWest, towEast, towWidth,
    wallWest: towWest - 1, wallEast: towEast + 1,
    surfaceY, towY: RIVER_TOWPATH_Y,
  };
}

/** 河岸街道标高：地形把挡土墙外侧 6 m 整平到该高度；梯子顶/滨河路读同值。 */
/** 河岸街道标高取整数（体素地面），梯子顶/道路/挡土墙共用。 */
export function quayStreetY(z: number, side: 'west' | 'east'): number {
  const base = side === 'west' ? 2.8 : 3.1;
  const rise = side === 'west' ? 1.2 : 1.3;
  return Math.round(base + rise * smooth(0, 500, z));
}

/**
 * 河面多边形：沿中心线左右岸采样。
 * 采样步长 4 m，端点外扩到地图边缘之外，确保水体连续。
 */
export function riverPolygon(): [number, number][] {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let z = -32; z <= 532; z += 4) {
    const r = riverAt(z);
    left.push([r.waterWest, z]);
    right.push([r.waterEast, z]);
  }
  return [...left, ...right.reverse()];
}

export interface MiaoBridgeDef {
  id: string;
  name: string;
  z: number;
  x0: number;
  x1: number;
  width: number;
  deckY: number;
  kind: 'open-wood' | 'covered' | 'stone-arch';
  /** 大型车辆是否可通行（中央廊桥 false，用真实石墩限制）。 */
  vehicles: boolean;
}

/** 三座静态桥（唯一桥位数据源）。 */
export const MIAO_BRIDGES: readonly MiaoBridgeDef[] = [
  { id: 'south', name: '南桥', z: 112, x0: 202, x1: 254, width: 9, deckY: 3.2, kind: 'open-wood', vehicles: true },
  { id: 'central', name: '白水河风雨廊桥', z: 250, x0: 210, x1: 278, width: 8, deckY: 3.0, kind: 'covered', vehicles: false },
  { id: 'north', name: '北桥', z: 392, x0: 236, x1: 292, width: 9, deckY: 4.0, kind: 'stone-arch', vehicles: true },
];

export const BRIDGE_BY_ID = new Map(MIAO_BRIDGES.map((b) => [b.id, b]));

export interface MiaoFerryDef {
  id: string;
  name: string;
  z: number;
  westX: number;
  eastX: number;
  deckY: number;
  /** 甲板长（沿航线）与宽（沿 z）。 */
  deckLength: number;
  deckWidth: number;
  speed: number;
  countdownSeconds: number;
  initialSide: 'west' | 'east';
}

/** 两座权威缆索渡船：南渡口初始停西岸，北渡口初始停东岸。 */
export const MIAO_FERRIES: readonly MiaoFerryDef[] = [
  { id: 'south', name: '南渡口', z: 205, westX: 212, eastX: 252, deckY: -1, deckLength: 5, deckWidth: 6, speed: 2.5, countdownSeconds: 2, initialSide: 'west' },
  { id: 'north', name: '北渡口', z: 335, westX: 246, eastX: 286, deckY: -1, deckLength: 5, deckWidth: 6, speed: 2.5, countdownSeconds: 2, initialSide: 'east' },
];

// The berth runs past the hull on each bank, and the two basins meet under
// the cable. The entire swept hull shares one uninterrupted clearance envelope.
export const MIAO_FERRY_BASINS = MIAO_FERRIES.flatMap((ferry) => {
  const middle = (ferry.westX + ferry.eastX) / 2;
  const outer = ferry.deckLength / 2 + 1;
  const halfWidth = ferry.deckWidth / 2 + 1;
  return (['west', 'east'] as const).map((side) => ({
    id: `ferry-basin-${ferry.id}-${side}`,
    x0: side === 'west' ? ferry.westX - outer : middle,
    x1: side === 'east' ? ferry.eastX + outer : middle,
    z0: ferry.z - halfWidth, z1: ferry.z + halfWidth,
    surfaceY: RIVER_SURFACE_Y, bedY: -4,
  }));
});

export const MIAO_FERRY_DOCKS = MIAO_FERRIES.flatMap((ferry) =>
  (['west', 'east'] as const).map((side) => {
    const direction = side === 'west' ? -1 : 1;
    const x = (side === 'west' ? ferry.westX : ferry.eastX) + direction * ferry.deckLength / 2;
    const landingLength = 2;
    const steps = (quayStreetY(ferry.z, side) - ferry.deckY) * 2;
    const stairRun = 1;
    return {
      id: `dock-${ferry.id}-${side}`, ferry, x, direction,
      landingLength, stairRun, steps, halfWidth: 1.5, apronLength: 5,
      streetX: x + direction * (landingLength + steps * stairRun),
    };
  }),
);

export interface RiverLadderPlan {
  id: string;
  z: number;
  side: 'west' | 'east';
  x: number;
  normalX: number;
  normalZ: number;
  bottom: number;
  top: number;
  exitX: number;
  exitZ: number;
  variant: number;
}

/**
 * 8 架河岸梯 + 1 架桥侧梯。
 * 北桥 z 387.5–396.5 覆盖 z=390，直接放 390 会被桥面封住；因此北岸梯移到
 * 桥南侧 z=372（仍属北段，和设计意图一致，报告中说明）。
 */
export const MIAO_RIVER_LADDERS: readonly RiverLadderPlan[] = (() => {
  const out: RiverLadderPlan[] = [];
  const spots: { z: number; label: string }[] = [
    { z: 150, label: 'a' },
    { z: 230, label: 'b' },
    { z: 315, label: 'c' },
    { z: 372, label: 'd' },
  ];
  for (const [index, spot] of spots.entries()) {
    for (const side of ['west', 'east'] as const) {
      const r = riverAt(spot.z);
      const x = side === 'west' ? r.wallWest : r.wallEast;
      const nx = side === 'west' ? 1 : -1;
      out.push({
        id: `river-ladder-${spot.label}-${side}`,
        z: spot.z,
        side,
        x,
        normalX: nx,
        normalZ: 0,
        bottom: -1.4,
        top: quayStreetY(spot.z, side),
        // 0.8 m behind the ladder face is the street (wall is 1 m thick).
        exitX: x - nx * 0.8,
        exitZ: spot.z,
        variant: index % 4,
      });
    }
  }
  // 中央廊桥南侧下水梯：从 towpath 上到桥面（顶 3 m），出口在桥面内 0.8 m。
  const bridge = BRIDGE_BY_ID.get('central')!;
  out.push({
    id: 'central-bridge-side-ladder',
    z: bridge.z + bridge.width / 2,
    side: 'west',
    x: 228,
    normalX: 0,
    normalZ: 1,
    bottom: -1.4,
    top: bridge.deckY,
    exitX: 228,
    exitZ: bridge.z + bridge.width / 2 - 0.8,
    variant: 2,
  });
  return out;
})();

export function inRiverChannel(x: number, z: number): boolean {
  const r = riverAt(z);
  return x >= r.waterWest && x <= r.waterEast;
}

/** 供 coverage/测试使用：河面近似面积（中心线半宽积分）。 */
export function riverArea(): number {
  let area = 0;
  for (let z = 0; z < 500; z += 1) area += riverAt(z + 0.5).halfWidth * 2;
  return area;
}
