import type { WeaponClass } from '../schema';
import { AMR_CAPACITY } from '../special-weapons/catalog';
import { FLAME_WEAPON, RPG_WEAPON } from './special';

/**
 * 主武器/瞄具/投掷物内容目录。
 * UI 从目录生成，新增武器不需要改装备页结构。
 */
export type WeaponId =
  | 'm16'
  | 'm4a1'
  | 'akm'
  | 'mk14'
  | 'awm'
  | 'amr'
  | 'uzi'
  | 'vector'
  | 'ump45'
  | 'mp5'
  | 'm870'
  | 'm249'
  | 'rpg'
  | 'flamethrower';

export const FIRE_MODES = {
  semi: { label: '单发', level: 1, shots: 1 },
  burst2: { label: '两连发', level: 2, shots: 2 },
  burst3: { label: '三连发', level: 2, shots: 3 },
  auto: { label: '全自动', level: 3, shots: 0 },
} as const;
export type FireMode = keyof typeof FIRE_MODES;

export interface WeaponCatalogEntry {
  id: WeaponId;
  name: string;
  short: string;
  className: WeaponClass;
  classLabel: string;
  role: string;
  damage: number;
  lethalHit?: 'torso' | 'any';
  rpm: number;
  magazine: number;
  reserve: number;
  reload: number;
  /** The first supported mode is the default when equipping the weapon. */
  fireModes: readonly [FireMode, ...FireMode[]];
  /** Equipped bipods provide extra recoil control when prone. */
  bipod?: boolean;
  /** UI 0–100 bars */
  stats: { damage: number; rate: number; accuracy: number; control: number; mobility: number };
  tags: string[];
}

export const WEAPONS: WeaponCatalogEntry[] = [
  { id: 'm16', name: 'M16A4', short: 'M16A4', className: 'assault_rifle', classLabel: '突击步枪', role: '中远点射 · 低后坐', damage: 27, rpm: 700, magazine: 30, reserve: 150, reload: 2.3, fireModes: ['burst3', 'semi'], stats: { damage: 48, rate: 52, accuracy: 82, control: 80, mobility: 64 }, tags: ['burst', 'range'] },
  { id: 'm4a1', name: 'M4A1', short: 'M4A1', className: 'assault_rifle', classLabel: '突击步枪', role: '全能卡宾 · 开镜快', damage: 24, rpm: 800, magazine: 30, reserve: 150, reload: 2.1, fireModes: ['auto', 'semi'], stats: { damage: 40, rate: 62, accuracy: 78, control: 74, mobility: 72 }, tags: ['auto', 'handling'] },
  { id: 'akm', name: 'AKM', short: 'AKM', className: 'assault_rifle', classLabel: '突击步枪', role: '高伤高后坐 · 近中压迫', damage: 32, rpm: 600, magazine: 30, reserve: 150, reload: 2.6, fireModes: ['auto', 'semi'], stats: { damage: 62, rate: 42, accuracy: 64, control: 50, mobility: 60 }, tags: ['auto', 'damage'] },
  { id: 'mk14', name: 'Mk14', short: 'MK14', className: 'dmr', classLabel: '精确射手', role: '远距点射 · 高伤', damage: 48, rpm: 400, magazine: 20, reserve: 100, reload: 3.0, bipod: true, fireModes: ['semi', 'auto'], stats: { damage: 78, rate: 34, accuracy: 90, control: 46, mobility: 44 }, tags: ['semi', 'range'] },
  { id: 'awm', name: 'AWM', short: 'AWM', className: 'sniper', classLabel: '狙击枪', role: '栓动 · 躯干一击致命', damage: 95, lethalHit: 'torso', rpm: 40, magazine: 5, reserve: 25, reload: 3.8, fireModes: ['semi'], stats: { damage: 96, rate: 8, accuracy: 96, control: 30, mobility: 38 }, tags: ['bolt', 'range'] },
  { id: 'uzi', name: 'Uzi', short: 'UZI', className: 'smg', classLabel: '冲锋枪', role: '极近泼水 · 高射速', damage: 16, rpm: 1250, magazine: 30, reserve: 170, reload: 1.8, fireModes: ['auto', 'semi'], stats: { damage: 24, rate: 96, accuracy: 42, control: 58, mobility: 90 }, tags: ['auto', 'cqc'] },
  { id: 'vector', name: 'Vector', short: 'VECTOR', className: 'smg', classLabel: '冲锋枪', role: '近距爆发 · 极高射速', damage: 19, rpm: 1100, magazine: 25, reserve: 175, reload: 2.0, fireModes: ['auto', 'burst2', 'semi'], stats: { damage: 30, rate: 92, accuracy: 48, control: 66, mobility: 88 }, tags: ['auto', 'cqc'] },
  { id: 'ump45', name: 'UMP45', short: 'UMP45', className: 'smg', classLabel: '冲锋枪', role: '中近全能 · 低后坐', damage: 24, rpm: 800, magazine: 30, reserve: 170, reload: 2.2, fireModes: ['auto', 'semi'], stats: { damage: 36, rate: 64, accuracy: 68, control: 86, mobility: 82 }, tags: ['auto', 'handling'] },
  { id: 'mp5', name: 'MP5', short: 'MP5', className: 'smg', classLabel: '冲锋枪', role: '精准低后坐 · 中近', damage: 22, rpm: 900, magazine: 30, reserve: 170, reload: 2.0, fireModes: ['auto', 'burst3', 'semi'], stats: { damage: 34, rate: 72, accuracy: 76, control: 90, mobility: 84 }, tags: ['auto', 'accuracy'] },
  { id: 'm870', name: 'M870', short: 'M870', className: 'shotgun', classLabel: '霰弹枪', role: '室内/近距 · 泵动', damage: 112, rpm: 75, magazine: 6, reserve: 24, reload: 3.4, fireModes: ['semi'], stats: { damage: 92, rate: 14, accuracy: 22, control: 54, mobility: 70 }, tags: ['pump', 'cqc'] },
  { id: 'm249', name: 'M249', short: 'M249', className: 'lmg', classLabel: '轻机枪', role: '压制 · 持续火力', damage: 27, rpm: 700, magazine: 100, reserve: 80, reload: 5.5, bipod: true, fireModes: ['auto'], stats: { damage: 48, rate: 54, accuracy: 58, control: 44, mobility: 34 }, tags: ['auto', 'suppression'] },
];

export const AMR_WEAPON: WeaponCatalogEntry = {
  id: 'amr', name: '反器材狙击枪', short: 'AMR', className: 'sniper', classLabel: '特殊武器',
  role: '地图拾取 · 任意部位一击致命', damage: 100, lethalHit: 'any',
  rpm: 30, magazine: AMR_CAPACITY, reserve: 0, reload: 4.5, fireModes: ['semi'],
  stats: { damage: 100, rate: 6, accuracy: 95, control: 22, mobility: 28 }, tags: ['anti_vehicle', 'range'],
};

export const WEAPON_BY_ID = new Map([...WEAPONS, AMR_WEAPON, RPG_WEAPON, FLAME_WEAPON].map((w) => [w.id, w]));

export function getWeapon(id: string): WeaponCatalogEntry | undefined {
  return WEAPON_BY_ID.get(id as WeaponId);
}

export type OpticId = 'iron' | 'red_dot' | 'holo' | '2x' | '3x' | '4x' | '6x' | '8x';
export interface OpticDef { id: OpticId; name: string; short: string; minZoom: number; maxZoom: number; adjustable: boolean; tag: string; }
export const OPTICS: OpticDef[] = [
  { id: 'iron', name: '机械瞄具', short: 'IRON', minZoom: 1, maxZoom: 1, adjustable: false, tag: 'BASE' },
  { id: 'red_dot', name: '红点', short: '1X', minZoom: 1, maxZoom: 1, adjustable: false, tag: 'CQC' },
  { id: 'holo', name: '全息', short: '1X', minZoom: 1, maxZoom: 1, adjustable: false, tag: 'CQC' },
  { id: '2x', name: '2 倍镜', short: '2X', minZoom: 2, maxZoom: 2, adjustable: false, tag: 'MID' },
  { id: '3x', name: '3 倍镜', short: '3X', minZoom: 3, maxZoom: 3, adjustable: false, tag: 'MID' },
  { id: '4x', name: '4 倍镜', short: '4X', minZoom: 4, maxZoom: 4, adjustable: false, tag: 'MID' },
  { id: '6x', name: '6 倍镜', short: '3–6X', minZoom: 3, maxZoom: 6, adjustable: true, tag: 'LONG' },
  { id: '8x', name: '8 倍镜', short: '4–8X', minZoom: 4, maxZoom: 8, adjustable: true, tag: 'LONG' },
];

export type ThrowableId = 'frag' | 'incendiary' | 'smoke';
export interface ThrowableDef { id: ThrowableId; name: string; short: string; role: string; }
export const THROWABLES: ThrowableDef[] = [
  { id: 'frag', name: '手雷', short: 'FRAG', role: '破片 / 清点' },
  { id: 'incendiary', name: '燃烧弹', short: 'FIRE', role: '封锁 / 持续伤害' },
  { id: 'smoke', name: '烟雾弹', short: 'SMOKE', role: '遮断 / 过点' },
];

export interface LoadoutSelection {
  weaponId: WeaponId;
  opticId: OpticId;
  throwables: [ThrowableId, ThrowableId];
}

export const DEFAULT_LOADOUT: LoadoutSelection = {
  weaponId: 'm16',
  opticId: 'red_dot',
  throwables: ['frag', 'smoke'],
};
