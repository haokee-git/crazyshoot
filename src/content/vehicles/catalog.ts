/**
 * 载具内容目录。
 *
 * 扩展方式：新增一台载具 = 在这个目录增加一条 VehicleDef + 增加模型/预览资源；
 * 地图的 VehiclePad 只引用 vehicleId，不需要改地图渲染器或车辆物理核心。
 * 新载具可以复用已有 VehicleClass 的物理/图标档案，也可以后续扩展新的 class。
 */
import type { VehicleClass } from '../../maps/types';

export interface VehicleDef {
  id: string;
  name: string;
  short: string;
  /** 物理与图标档案；新载具可复用 */
  class: VehicleClass;
  seats: number;
  hp: number;
  /** km/h */
  speed: number;
  weapons: string[];
  /** 被摧毁时给的团队分 */
  hvtScore: number;
  /** 资源包 ID，留空表示放主包 */
  assetBundle?: string;
  tags?: string[];
}

export const VEHICLES: VehicleDef[] = [
  {
    id: 'motorcycle',
    name: '战斗摩托',
    short: 'MOTO',
    class: 'motorcycle',
    seats: 1,
    hp: 80,
    speed: 80,
    weapons: [],
    hvtScore: 10,
    tags: ['light', 'recon'],
  },
  {
    id: 'jeep',
    name: '武装吉普',
    short: 'JEEP',
    class: 'jeep',
    seats: 2,
    hp: 180,
    speed: 110,
    weapons: ['vehicle_mg_light'],
    hvtScore: 20,
    tags: ['light', 'transport'],
  },
  {
    id: 'apc',
    name: '装甲运兵车',
    short: 'APC',
    class: 'apc',
    seats: 2,
    hp: 500,
    speed: 70,
    weapons: ['vehicle_mg_heavy'],
    hvtScore: 30,
    tags: ['transport', 'armored'],
  },
  {
    id: 'ifv',
    name: '步战车',
    short: 'IFV',
    class: 'ifv',
    seats: 2,
    hp: 350,
    speed: 60,
    weapons: ['vehicle_mg_heavy'],
    hvtScore: 40,
    tags: ['armored', 'fire_support'],
  },
  {
    id: 'light_tank',
    name: '轻型坦克',
    short: 'LT',
    class: 'light_tank',
    seats: 3,
    hp: 450,
    speed: 50,
    weapons: ['vehicle_autocannon_30', 'vehicle_mg_coax'],
    hvtScore: 60,
    tags: ['armored', 'fire_support'],
  },
  {
    id: 'mbt',
    name: '主战坦克',
    short: 'MBT',
    class: 'mbt',
    seats: 4,
    hp: 750,
    speed: 35,
    weapons: ['vehicle_cannon_120', 'vehicle_mg_coax', 'vehicle_mg_commander'],
    hvtScore: 80,
    tags: ['heavy', 'armored'],
  },
];

export const VEHICLE_BY_ID = new Map(VEHICLES.map((v) => [v.id, v]));

export function getVehicle(id: string): VehicleDef | undefined {
  return VEHICLE_BY_ID.get(id);
}

/** 未知载具的通用兜底：地图仍能渲染/运行，不会崩。 */
export function vehicleFallback(id: string): VehicleDef {
  return {
    id,
    name: id,
    short: id.slice(0, 4).toUpperCase(),
    class: 'jeep',
    seats: 2,
    hp: 200,
    speed: 80,
    weapons: [],
    hvtScore: 20,
    tags: ['fallback'],
  };
}

export const VEHICLE_WEAPON_NAMES:Record<string,string>={
  vehicle_mg_light:'轻机枪',
  vehicle_mg_heavy:'重机枪',
  vehicle_autocannon_30:'30 mm 机关炮',
  vehicle_cannon_120:'120 mm 主炮',
  vehicle_mg_coax:'辅助机枪',
  vehicle_mg_commander:'车长机枪',
};
