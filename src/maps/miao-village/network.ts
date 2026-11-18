/**
 * 千户苗寨 · 道路/巷路/土路单一数据源。
 *
 * 每个控制点带 y：地形整平、铺装、车辆可行驶性、Bot 路线与测试都读这份数据。
 * 所有道路 markings:false；没有沥青、没有白色交通虚线。
 */
import type { Road, RoadKind, TerrainKind } from '../types';
import { quayStreetY, riverAt } from './river';

export interface MiaoRoadPoint {
  x: number;
  z: number;
  y: number;
}

export interface MiaoRoad {
  id: string;
  label: string;
  points: MiaoRoadPoint[];
  width: number;
  kind: RoadKind;
  surface: TerrainKind;
  shoulder?: number;
}

const p = (x: number, z: number, y: number): MiaoRoadPoint => ({ x, z, y });

function riverside(id: string, label: string, side: 'west' | 'east', from: number, to: number, step: number, offset: number, yOffset = 0.05): MiaoRoad {
  const points: MiaoRoadPoint[] = [];
  for (let z = from; z <= to; z += step) {
    const r = riverAt(z);
    const x = side === 'west' ? r.wallWest - offset : r.wallEast + offset;
    points.push(p(x, z, quayStreetY(z, side) + yOffset));
  }
  return { id, label, points, width: 4.2, kind: 'path', surface: 'stone' };
}

/** 道路网络：外环主车道 + 据点连接 + 两岸滨河步道 + 寨边土路。 */
export const MIAO_ROADS: readonly MiaoRoad[] = [
  {
    id: 'blue-north', label: '蓝队基地 → A 市集', width: 8, kind: 'main', surface: 'stone',
    points: [p(80, 104, 6), p(74, 126, 6.4), p(80, 148, 5.8), p(92, 164, 5.4), p(112, 170, 5.2), p(134, 170, 5.1), p(150, 168, 5)],
  },
  {
    id: 'blue-east', label: '蓝队基地 → 南桥西', width: 8, kind: 'main', surface: 'stone',
    points: [p(112, 80, 6), p(140, 86, 6.1), p(166, 96, 5.8), p(180, 106, 5.0), p(188, 112, 4.2), p(194, 112, 3.8), p(200, 112, 3.4)],
  },
  {
    id: 'a-street', label: 'A 市集主街', width: 8, kind: 'main', surface: 'stone',
    points: [p(110, 168, 5), p(150, 168, 5), p(190, 170, 5.2), p(212, 168, 5.3), p(220, 152, 5.1), p(214, 132, 4.4), p(204, 116, 3.5), p(200, 112, 3.4)],
  },
  {
    id: 'south-east', label: '南桥东 → B 田园', width: 8, kind: 'main', surface: 'stone',
    points: [p(256, 112, 3.4), p(268, 120, 3.6), p(282, 132, 3.8), p(300, 142, 4), p(322, 146, 4)],
  },
  {
    id: 'b-e', label: 'B → E 剧场外侧', width: 8, kind: 'main', surface: 'stone',
    points: [p(322, 146, 4), p(338, 152, 4.2), p(350, 170, 4.6), p(356, 195, 5), p(356, 220, 5.6), p(352, 244, 6), p(358, 270, 6.8), p(363, 295, 8), p(365, 318, 8.9), p(368, 338, 9), p(374, 358, 9.4)],
  },
  {
    id: 'e-north', label: 'E → 北桥东', width: 8, kind: 'main', surface: 'stone',
    points: [p(356, 368, 9.3), p(356, 386, 7.4), p(348, 402, 6.2), p(330, 410, 5.2), p(310, 404, 4.6), p(294, 392, 4)],
  },
  {
    id: 'north-west', label: '北桥西 → D 之字形坡道', width: 7, kind: 'main', surface: 'stone',
    points: [p(236, 392, 4), p(228, 404, 4.8), p(222, 418, 5.8), p(214, 432, 7), p(200, 442, 8.4), p(184, 442, 9.8), p(170, 434, 11.2), p(160, 420, 12.8), p(156, 402, 14.4), p(166, 388, 15.4), p(166, 376, 16), p(160, 368, 16), p(155, 365, 16)],
  },
  {
    id: 'd-a', label: 'D 坡地 → A 市集', width: 7, kind: 'main', surface: 'stone',
    points: [p(155, 365, 16), p(152, 342, 14.9), p(146, 322, 13.6), p(136, 304, 12.2), p(122, 288, 11), p(108, 272, 9.9), p(98, 256, 9), p(88, 238, 8.2), p(86, 220, 7.2), p(88, 200, 6.2), p(96, 186, 5.6), p(110, 178, 5.3), p(126, 172, 5.1), p(140, 169, 5.05), p(150, 168, 5)],
  },
  {
    id: 'b-field-loop', label: 'B 田间环道', width: 5, kind: 'secondary', surface: 'dirt',
    points: [p(322, 146, 4), p(330, 128, 4.2), p(342, 112, 4.4), p(356, 100, 4.6), p(374, 100, 4.8), p(398, 108, 5), p(398, 140, 5.2), p(400, 160, 5.4), p(402, 186, 5.4), p(376, 194, 5.2), p(350, 182, 5), p(338, 168, 4.6)],
  },
  {
    id: 'orange-west', label: '橙队 → B/E 西侧', width: 7, kind: 'main', surface: 'stone',
    points: [p(400, 416, 11.8), p(390, 404, 11.2), p(380, 392, 10.4), p(370, 378, 9.6), p(356, 368, 9.3), p(350, 340, 9), p(352, 316, 8.4), p(350, 292, 7.2), p(348, 268, 6.4), p(350, 252, 6.2)],
  },
  {
    id: 'orange-north', label: '橙队 → E 北侧', width: 8, kind: 'main', surface: 'stone',
    points: [p(416, 424, 12), p(410, 408, 11.6), p(402, 392, 10.8), p(390, 376, 10), p(380, 360, 9.4)],
  },
  {
    id: 'c-plaza', label: 'A → 芦笙场 → 中央廊桥', width: 5, kind: 'secondary', surface: 'stone',
    points: [p(212, 168, 5.3), p(218, 184, 5), p(220, 204, 4.6), p(216, 224, 4.2), p(214, 238, 3.8), p(210, 244, 3.5), p(210, 247, 3.25), p(210, 250, 3)],
  },
  {
    id: 'c-east', label: '廊桥东 → 东岸街', width: 4.5, kind: 'path', surface: 'stone',
    points: [p(278, 250, 3), p(286, 250, 3.3), p(294, 252, 3.5), p(302, 258, 3.7)],
  },
  {
    id: 'west-edge-trail', label: '西寨边土路', width: 3, kind: 'path', surface: 'dirt',
    points: [p(80, 120, 6.4), p(66, 146, 7.2), p(56, 176, 8.2), p(50, 208, 9.2), p(50, 240, 10.2), p(58, 270, 11), p(70, 298, 12), p(80, 320, 13), p(84, 342, 13.8), p(82, 364, 14.4), p(82, 386, 15.2), p(84, 408, 16), p(88, 424, 16.2), p(102, 446, 16.6), p(120, 448, 16.9), p(134, 442, 17), p(146, 434, 16.8), p(152, 416, 16.5), p(142, 402, 16.2), p(128, 396, 16.1), p(124, 384, 16), p(130, 376, 16), p(142, 370, 16), p(155, 365, 16)],
  },
  {
    id: 'east-trail', label: '东寨边土路', width: 3, kind: 'path', surface: 'dirt',
    points: [p(426, 214, 6.4), p(442, 240, 7.6), p(446, 268, 8.6), p(440, 296, 9.6), p(434, 322, 10.4), p(430, 350, 10.8), p(432, 380, 11.4), p(426, 402, 11.8)],
  },
  {
    id: 'south-field-path', label: '南岸田间路', width: 3.2, kind: 'path', surface: 'dirt',
    points: [p(200, 112, 3.4), p(212, 96, 3.8), p(228, 84, 4.2), p(246, 74, 4.6), p(264, 68, 5), p(282, 72, 5.2), p(300, 82, 5), p(312, 96, 4.8), p(318, 114, 4.6), p(322, 132, 4.2), p(322, 146, 4)],
  },
  riverside('west-riverside', '西岸滨河步道', 'west', 120, 388, 16, 4.4),
  riverside('east-riverside', '东岸滨河步道', 'east', 120, 388, 16, 4.4),
  {
    id: 'blue-south-alley', label: '蓝队南门步行巷', width: 3.5, kind: 'path', surface: 'dirt',
    points: [p(60, 44, 6), p(54, 62, 6.1), p(56, 84, 6.1), p(68, 102, 6), p(80, 112, 6), p(80, 120, 6.2)],
  },
  {
    id: 'orange-east-alley', label: '橙队东门步行巷', width: 3.2, kind: 'path', surface: 'dirt',
    points: [p(452, 430, 12), p(446, 416, 11.9), p(438, 404, 11.8), p(426, 402, 11.8)],
  },
  {
    id: 'c-plaza-link', label: '廊桥西 → 芦笙场', width: 4.5, kind: 'path', surface: 'stone',
    points: [p(210, 250, 3), p(206, 250, 3.2), p(202, 250, 3.4), p(196, 250, 3.5), p(188, 250, 3.5), p(176, 250, 3.5)],
  },
];

export const ROAD_BY_ID = new Map(MIAO_ROADS.map((r) => [r.id, r]));

/** MapDef 兼容层：同一份数据转成渲染/铺装用的 Road[]。 */
export const MIAO_MAP_ROADS: Road[] = MIAO_ROADS.map((r) => ({
  points: r.points.map((q) => [q.x, q.z] as [number, number]),
  width: r.width,
  kind: r.kind,
  surface: r.surface,
  shoulder: r.shoulder ?? 0,
  markings: false,
  verge: 'local',
  label: r.label,
}));

/** 沿折线插值出 (x,z) 处最近点的路面标高；用于测试/车辆坡度检查。 */
export function roadElevationAt(road: MiaoRoad, x: number, z: number): { y: number; distance: number; t: number } {
  let best = { y: road.points[0].y, distance: Infinity, t: 0 };
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.distance) best = { y: a.y + (b.y - a.y) * t, distance: d, t };
  }
  return best;
}

/** 车辆可行驶主路的最大纵坡（%）。 */
export function maxRoadGrade(road: MiaoRoad): number {
  let grade = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    grade = Math.max(grade, Math.abs(b.y - a.y) / len);
  }
  return grade * 100;
}
