/**
 * 法老坟墓 · 800×800 布局锚点（0.20.3 重构）
 *
 * 这是**唯一的场景锚点表**：MapDef 总装、高度场、路网、场景作者数据、覆盖统计、
 * 平面图与验收工具都从这里取中心/尺度。它不是旧 1000 m 坐标乘 0.8 的结果，而是
 * 按“南部横向战斗带 / 西部生态—荒地—古迹过渡 / 中北部主战斗群 / 东北营地”的
 * 新构图逐个重新落位；每个场景保留自己的体量，只做平移、加建与不对称外延。
 *
 * 坐标约定：x 向东，z 向北，可玩范围 0..800。体素数组外缘仍有 32 m margin，
 * 由 voxel-map-data 自己处理，和这里的可玩边界是两个概念。
 */

export const PHARAOH_SIZE = 800;

export interface SiteAnchor {
  /** 场景中心（据点/纪念碑锚点）。 */
  x: number;
  z: number;
  /** 场景整平台地高度（米）。 */
  ground: number;
  /** 初始场地包络（只用于空间预算/校验，不是规则矩形平台）。 */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  label: string;
}

export const PHARAOH_SITE_IDS = ['blue', 'orange', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type PharaohSiteId = (typeof PHARAOH_SITE_IDS)[number];

/** 重排后的场景锚点（最终值；相对推荐值只有 ≤40 m 的避让调整）。 */
export const PHARAOH_LAYOUT: Record<PharaohSiteId, SiteAnchor> = {
  // 南部：蓝队基地 → E 驿站 → F 神庙的横向战斗带
  blue: {x: 80, z: 85, ground: 2.4, x0: 25, x1: 135, z0: 30, z1: 140, label: '蓝队西南远征基地'},
  // 东北：橙队沙丘营地（比蓝队高 5.6 m，保留居高临下的出发感）
  orange: {x: 710, z: 710, ground: 8.0, x0: 655, x1: 765, z0: 655, z1: 765, label: '橙队东北沙丘营地'},
  // 西部：A 金字塔（本体 264×264，场地 300×310）
  A: {x: 190, z: 610, ground: 4.0, x0: 40, x1: 340, z0: 455, z1: 765, label: 'A 阶梯金字塔'},
  // 中北：B 狮身人面像（本体 150×52，场地 230×170）
  B: {x: 460, z: 640, ground: 4.0, x0: 345, x1: 575, z0: 550, z1: 720, label: 'B 狮身人面像'},
  // 中北：C 沙漠集市（330×300 不规则城镇，核心 ≥96,900 m²）
  C: {x: 475, z: 395, ground: 6.5, x0: 310, x1: 640, z0: 245, z1: 545, label: 'C 沙漠集市'},
  // 西部：D 绿洲（湖心约 (115,230)，生态区约 270×250）
  D: {x: 175, z: 290, ground: 0.6, x0: 30, x1: 300, z0: 150, z1: 410, label: 'D 绿洲'},
  // 南部：E 公路驿站（165×120 场区）
  E: {x: 350, z: 105, ground: 3.2, x0: 267, x1: 433, z0: 45, z1: 165, label: 'E 公路驿站'},
  // 南部：F 卡纳克列柱神庙（185×165）
  F: {x: 650, z: 130, ground: 4.0, x0: 557, x1: 743, z0: 47, z1: 213, label: 'F 卡纳克列柱神庙'},
  // 西部：G 帝王谷采石场（200×175）
  G: {x: 210, z: 420, ground: 3.0, x0: 110, x1: 310, z0: 332, z1: 507, label: 'G 帝王谷采石场'},
};

/** 绿洲湖心/湖面尺度（岸线折线在 oasis.ts，这里只给预算）。 */
export const OASIS_LAYOUT = {
  lakeCenter: [115, 230] as [number, number],
  lakeWidth: 140,
  lakeDepth: 110,
  point: [175, 290] as [number, number],
  pointGround: 0.6,
  ecoSize: [270, 250] as [number, number],
} as const;

/** 金字塔/狮身/墓道在 800 图上的最终锚点关系（builder 与验收共用）。 */
export const PHARAOH_MONUMENT_LINK = {
  /** 金字塔外层基座。 */
  pyramidOuterHalf: 132,
  /** 狮身本体长/宽。 */
  sphinxLength: 150,
  sphinxWidth: 52,
  /** A 东门 → B 西后墓道的地表距离（直线）。 */
  abGap: 63,
} as const;

export function siteBounds(id: PharaohSiteId) {
  const s = PHARAOH_LAYOUT[id];
  return {x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1};
}

export function inSite(id: PharaohSiteId, x: number, z: number, margin = 0): boolean {
  const b = PHARAOH_LAYOUT[id];
  return x >= b.x0 - margin && x <= b.x1 + margin && z >= b.z0 - margin && z <= b.z1 + margin;
}

/** 距离场景包络的最近距离（在包络内为 0）。 */
export function siteDistance(id: PharaohSiteId, x: number, z: number): number {
  const b = PHARAOH_LAYOUT[id];
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dz = Math.max(b.z0 - z, 0, z - b.z1);
  return Math.hypot(dx, dz);
}

export function clampToPlayable(x: number, z: number, inset = 0): [number, number] {
  return [Math.min(PHARAOH_SIZE - inset, Math.max(inset, x)), Math.min(PHARAOH_SIZE - inset, Math.max(inset, z))];
}

/** 场景标签（平面图/截图/HUD）。 */
export const PHARAOH_SITE_LABELS: Record<PharaohSiteId, string> = {
  blue: '蓝队基地',
  orange: '橙队营地',
  A: 'A 金字塔',
  B: 'B 狮身人面像',
  C: 'C 沙漠集市',
  D: 'D 绿洲',
  E: 'E 公路驿站',
  F: 'F 卡纳克神庙',
  G: 'G 帝王谷采石场',
};

export default PHARAOH_LAYOUT;
