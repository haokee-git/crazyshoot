export type Team = 'blue' | 'orange';
export type Vec2 = [number, number];
export type Polygon = Vec2[];

export type TerrainKind =
  | 'grass'
  | 'concrete'
  | 'asphalt'
  | 'gravel'
  | 'dirt'
  | 'sand'
  | 'mud'
  | 'water'
  | 'rubble'
  | 'stone'
  | 'wood'
  | 'flowers';

export interface TerrainPatch {
  id?: string;
  polygon: Polygon;
  kind: TerrainKind;
  elevation?: number;
  opacity?: number;
  label?: string;
  /**
   * Authored artificial surface (concrete yard, stone plaza, oil-stained apron...):
   * a road crossing it must keep the patch material instead of painting asphalt
   * over it. Runway/taxiway semantics still win (see voxel-map-data).
   */
  preserveUnderRoads?: boolean;
  /** Patch layering among overlapping patches; higher wins, ties let the later patch win. */
  surfacePriority?: number;
}

export type RoadKind = 'main' | 'secondary' | 'path' | 'shoulder' | 'runway' | 'taxiway' | 'rail';
/** How the authored verge beside a road is surfaced. */
export type RoadVerge = 'local' | 'compacted';
export interface Road {
  points: Vec2[];
  width: number;
  kind: RoadKind;
  label?: string;
  /** Authored shoulder width per side in metres (0/undefined = no authored shoulder). */
  shoulder?: number;
  /** Authored road surface (default asphalt/concrete by kind); town/plaza roads use stone/gravel. */
  surface?: TerrainKind;
  /** White centre-line dashes; default true for vehicular roads, false for town/plaza paths. */
  markings?: boolean;
  /**
   * `local` keeps the underlying natural surface untouched (no desert band), while
   * `compacted` applies the map's low-contrast compacted variant only where the
   * underlying material is loose natural ground.
   */
  verge?: RoadVerge;
}

export type RoofKind = 'flat' | 'gable' | 'sawtooth' | 'glass' | 'open';
export interface Building {
  id: string;
  name: string;
  polygon: Polygon;
  height: number;
  roof?: RoofKind;
  enterable?:boolean;
  wallColor?: string;
  roofColor?: string;
  label?: boolean;
  labelAt?: Vec2;
  labelSize?: number;
}

export type CoverKind =
  | 'container'
  | 'sandbag'
  | 'crate'
  | 'wall'
  | 'hedge'
  | 'tree'
  | 'palm'
  | 'bush'
  | 'reeds'
  | 'rock'
  | 'barrier'
  | 'wreck'
  | 'planter'
  | 'statue'
  | 'fuel_tank'
  | 'silo'
  | 'trench'
  | 'pump'
  | 'dumpster'
  | 'stall'
  | 'canopy'
  | 'dome'
  | 'well'
  | 'pots'
  | 'table'
  | 'sack'
  | 'tires'
  | 'column'
  | 'obelisk'
  | 'colossus'
  | 'architrave'
  | 'bench'
  | 'basket'
  | 'pottery'
  | 'drum';

export interface Cover {
  id?: string;
  kind: CoverKind;
  x: number;
  y: number;
  w: number;
  d: number;
  rot?: number;
  height?: number;
  color?: string;
  /** 手工变体键：stall 功能、dome 尺寸、palm 高度等，由世界生成器解释。 */
  variant?: string;
  label?: string;
}

export type PropKind =
  | 'crane'
  | 'fountain'
  | 'radar'
  | 'tower'
  | 'flag'
  | 'lamp'
  | 'sign'
  | 'bridge_gap'
  | 'gate'
  | 'aircraft'
  | 'silo'
  | 'fuel_tank'
  | 'gas_station'
  | 'barrels'
  | 'pipes'
  | 'pallets';

export interface Prop {
  id: string;
  kind: PropKind;
  x: number;
  y: number;
  w?: number;
  d?: number;
  rot?: number;
  label?: string;
  team?: Team;
}

export interface CaptureFootprint { x0:number;z0:number;x1:number;z1:number; }
/** 统一水域体积：河流/稻田/水塘共用一个数据结构，surfaceY 每块独立。 */
export interface WaterVolume {
  id: string;
  kind: 'river' | 'paddy' | 'pond' | 'canal';
  /** 水面高度（米）。 */
  surfaceY: number;
  /** 河床/泥面高度；稻田浅水必填，河流可由地形推导。 */
  bedY?: number;
  /** 体素材质 id；缺省用地图 terrainMaterials.water。 */
  material?: number;
  polygon?: Polygon;
  rect?: { x0:number;z0:number;x1:number;z1:number };
  /** 是否按深水（可游泳）处理；浅水 false 只涉水。 */
  swim?: boolean;
}

export interface CapturePoint {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  initialOwner: 'neutral' | Team;
  /** 室内据点地面高度；设置后占点按该高度 + 垂直容差判定，而不是脚下地形。 */
  floorY?: number;
  /** floorY 的垂直容差（米），默认 2.5。 */
  verticalTolerance?: number;
  /** 可选水平 footprint（世界坐标 AABB）：与圆形半径取交集后才可占点。 */
  footprint?: CaptureFootprint;
}

export interface SpawnZone {
  team: Team;
  x: number;
  y: number;
  w: number;
  d: number;
  label: string;
}

export type VehicleClass = 'motorcycle' | 'jeep' | 'apc' | 'ifv' | 'light_tank' | 'mbt';
export interface VehiclePad {
  /** neutral 车位由双方共用，不得用假队伍冒充。 */
  team: Team | 'neutral';
  /** 引用内容目录里的 vehicleId；新载具不需要改这个类型 */
  vehicleId: string;
  x: number;
  y: number;
  angle: number;
}

export interface SpecialCrate {
  id: string;
  /** 引用内容目录里的特殊武器 id */
  weaponId: string;
  x: number;
  y: number;
  /** 可选的展示名；留空时从目录读取 */
  label?: string;
}

export interface MgNest {
  id: string;
  x: number;
  y: number;
  angle: number;
  label: string;
}

export type RouteKind = 'main' | 'flank' | 'vehicle';

/** 导航显式连接：跨过 1.5–2 m 窄门/石墩/楼梯缺口的双向边。世界几何仍真实碰撞。 */
export interface NavLink {ax:number;az:number;ay?:number;bx:number;bz:number;by?:number;label?:string;}

/** 薄装饰面：图集子矩形贴在墙面/摊位上方；不参与碰撞，不改变世界体素。 */
export interface DecorPlane {
  atlas: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  rot?: number;
  /** [u,v,uw,uh] 图集归一化子矩形；省略时使用整张。 */
  uv?: [number, number, number, number];
}
export interface Route {
  team: Team;
  label: string;
  points: Vec2[];
  kind?: RouteKind;
}

export interface MapDef {
  /** 内容 ID；新地图不需要改联合类型 */
  id: string;
  order: number;
  schemaVersion: number;
  name: string;
  nameEn: string;
  size: number;
  baseTerrain: TerrainKind;
  theme: string;
  summary: string;
  asymmetry: string;
  balance: string;
  terrain: TerrainPatch[];
  roads: Road[];
  buildings: Building[];
  covers: Cover[];
  props: Prop[];
  capturePoints: CapturePoint[];
  spawns: SpawnZone[];
  vehiclePads: VehiclePad[];
  mgNests: MgNest[];
  specialCrates: SpecialCrate[];
  routes: Route[];
  notes: string[];
  /** 任意 TerrainKind 的材质覆盖；只影响本图，不破坏其他地图。 */
  terrainMaterials?: Partial<Record<TerrainKind, number>>;
  /** 本图占点得分倍率；缺省 1。 */
  scoreRate?: number;
  /** 薄装饰面（图集），渲染时不参与碰撞。 */
  decor?: DecorPlane[];
  /** 导航显式连接（窄门/石墩/楼梯），只影响 Bot 图，不改变碰撞。 */
  navLinks?: NavLink[];
  /** 场景整平垫（神庙/采石场等非建筑大场地），只影响本图地形。 */
  scenePads?: {id?:string;x:number;z:number;w:number;d:number}[];
  /** 多高度水域（河流/梯田/水塘）：渲染、碰撞、涉水判定共用。 */
  waterVolumes?: WaterVolume[];
  /** 资源包 ID；用于未来按地图懒加载 */
  assetBundle?: string;
  tags?: string[];
  gamemodes?: string[];
  /** 未来扩展字段（新玩法/新模式/新资源），不需要改核心类型 */
  extensions?: Record<string, unknown>;
}

export const TEAM_COLORS: Record<Team, string> = {
  blue: '#4aa8ff',
  orange: '#ff7a3d',
};

export const TEAM_NAMES: Record<Team, string> = {
  blue: '蓝队',
  orange: '橙队',
};

