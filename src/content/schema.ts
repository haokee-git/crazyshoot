/**
 * 内容扩展的通用 schema（type-only）。
 *
 * 这些类型是“未来内容”的契约：新增武器/配件/投掷物/模式时按这里填数据，
 * 不要把新内容塞进 UI 或引擎的硬编码数组。
 */

export type WeaponClass =
  | 'assault_rifle'
  | 'smg'
  | 'shotgun'
  | 'dmr'
  | 'sniper'
  | 'lmg'
  | 'pistol'
  | 'launcher'
  | 'melee';

export type FireMode = 'single' | 'burst' | 'auto' | 'bolt' | 'pump';

export type AttachmentSlot = 'optic' | 'muzzle' | 'magazine' | 'grip' | 'stock' | 'underbarrel';

export interface DamageCurvePoint {
  /** 距离（米） */
  distance: number;
  /** 单发伤害倍率 */
  multiplier: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  short: string;
  class: WeaponClass;
  schemaVersion: number;
  caliber?: string;
  damage: number;
  headshotMultiplier: number;
  limbMultiplier: number;
  rpm: number;
  fireModes: FireMode[];
  magazine: number;
  reserve: number;
  reloadSeconds: number;
  emptyReloadSeconds: number;
  spreadHip: number;
  spreadAds: number;
  recoil: number;
  adsSeconds: number;
  rangeMeters: number;
  damageCurve?: DamageCurvePoint[];
  attachmentSlots: AttachmentSlot[];
  modelId: string;
  animationSet: string;
  audioId: string;
  assetBundle?: string;
  tags?: string[];
  extensions?: Record<string, unknown>;
}

export interface AttachmentDef {
  id: string;
  name: string;
  short: string;
  slot: AttachmentSlot;
  schemaVersion: number;
  compatibleTags: string[];
  /** 乘算/加算修正，具体键由武器系统解释 */
  statModifiers: Record<string, number>;
  modelId?: string;
  icon?: string;
  assetBundle?: string;
  extensions?: Record<string, unknown>;
}

export interface ThrowableDef {
  id: string;
  name: string;
  short: string;
  schemaVersion: number;
  kind: 'frag' | 'incendiary' | 'smoke' | 'flash' | 'other';
  charges: number;
  fuseSeconds: number;
  radius: number;
  modelId: string;
  audioId?: string;
  assetBundle?: string;
  extensions?: Record<string, unknown>;
}

export type GameModeId = 'capture' | 'ticket' | 'rush' | 'escort' | 'deathmatch';

export interface GameModeDef {
  id: GameModeId;
  name: string;
  schemaVersion: number;
  minPlayers: number;
  maxPlayers: number;
  timeLimitSeconds: number;
  scoreTarget: number;
  respawnSeconds: number;
  capturePoints: number;
  scoring: Record<string, number>;
  extensions?: Record<string, unknown>;
}

/** 未来地图若需要更复杂目标（护送/爆破/多阶段），用这个扩展，不破坏 capturePoints。 */
export interface ObjectiveDef {
  id: string;
  kind: 'capture' | 'destroy' | 'escort' | 'hold' | 'spawn';
  name: string;
  x: number;
  y: number;
  radius?: number;
  owner?: 'neutral' | 'blue' | 'orange';
  extensions?: Record<string, unknown>;
}
