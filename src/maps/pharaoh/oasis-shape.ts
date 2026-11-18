/**
 * 绿洲湖岸线唯一真相（0.20.3）
 *
 * 为什么单独成文件：`pharaoh-height.ts`（地形/水面）与 `pharaoh/oasis.ts`（作者数据/
 * 植被/栈桥）都必须读同一条折线，但 oasis.ts 不能反向 import height（会成环）。
 * 因此折线放在这个无依赖模块，双方 import；`oasis.ts` 继续 re-export
 * `OASIS_LAKE_POLYGON`，对外 API 不变。
 *
 * 800 图上的湖：约 140×111 m，湖心 (115,230)，水面 -2，湖底 -6。
 * 东北岸内收，D 点 (175,290) 距水线约 17.7 m（干岸台地）。
 */
import type { Polygon, Vec2 } from '../types';

export const OASIS_LAKE_CENTER: Vec2 = [115, 230];
export const OASIS_WATER_SURFACE = -2;
export const OASIS_LAKE_BED = -6;

/** 不规则岸线：西岸内湾、南岸沙洲、东岸外凸、东北角内收给 D 点。 */
export const OASIS_LAKE_POLYGON: Polygon = [
  [48, 230],
  [50, 214],
  [57, 200],
  [68, 190],
  [82, 184],
  [98, 179],
  [114, 176],
  [130, 175],
  [146, 177],
  [158, 183],
  [168, 192],
  [176, 204],
  [182, 218],
  [185, 232],
  [184, 244],
  [179, 254],
  [173, 262],
  [169, 270],
  [162, 278],
  [150, 283],
  [137, 286],
  [123, 286],
  [109, 283],
  [95, 278],
  [82, 271],
  [70, 262],
  [60, 251],
  [52, 241],
];

export function pointInPolygon(x: number, z: number, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function polygonEdgeDistance(x: number, z: number, poly: Polygon): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0];
    const az = poly[j][1];
    const bx = poly[i][0];
    const bz = poly[i][1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ddx = x - ax - t * dx;
    const ddz = z - az - t * dz;
    const d = ddx * ddx + ddz * ddz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** 距水线：湖内为正，湖外为负（单位 m）。 */
export function lakeShoreDistance(x: number, z: number): number {
  const d = polygonEdgeDistance(x, z, OASIS_LAKE_POLYGON);
  return pointInPolygon(x, z, OASIS_LAKE_POLYGON) ? d : -d;
}

export default OASIS_LAKE_POLYGON;


/**
 * 绿洲生态区外边界（约 260×270 m，不规则；含湖、湿岸、草甸、棕榈林、疏林、
 * 灌木/干草/裸土过渡，不含 G 采石场与蓝队基地主体）。
 */
export const OASIS_ECO_POLYGON: Polygon = [
  [30, 148], [78, 132], [130, 124], [188, 126], [238, 138],
  [278, 166], [294, 210], [292, 258], [280, 305], [258, 345],
  [224, 376], [184, 392], [144, 390], [104, 374], [68, 346],
  [40, 312], [24, 270], [20, 214], [22, 178],
];

function polygonArea(poly: Polygon): number {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(area) / 2;
}

export const OASIS_ECO_AREA = Math.round(polygonArea(OASIS_ECO_POLYGON));
export const OASIS_LAKE_AREA = Math.round(polygonArea(OASIS_LAKE_POLYGON));
