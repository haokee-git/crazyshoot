import type { WeaponCatalogEntry } from './catalog';
import type { ProjectileDef } from '../../game/combat/projectiles';

/**
 * 可拾取特殊武器：火箭筒 / 喷火器。
 *
 * 只放数值定义，接入（拾取点、武器槽、UI）由调用方完成；
 * catalog.ts 的 WeaponId 联合是否包含新 id 由 Lead 统一维护。
 */

/** 火箭筒：3 发、无备弹；直击 420，对装甲不衰减（armorScale 1.15）。 */
export const RPG_WEAPON: WeaponCatalogEntry = {
  id: 'rpg',
  name: '火箭筒', short: 'RPG', className: 'launcher', classLabel: '特殊武器',
  role: '地图拾取 · 反装甲攻坚', damage: 420,
  rpm: 24, magazine: 3, reserve: 0, reload: 0, fireModes: ['semi'],
  stats: { damage: 100, rate: 6, accuracy: 70, control: 34, mobility: 30 }, tags: ['anti_vehicle', 'explosive'],
};

/** 喷火器：燃料 100、无备弹，持续喷射（燃料打空即停）。 */
export const FLAME_WEAPON: WeaponCatalogEntry = {
  id: 'flamethrower',
  name: '喷火器', short: 'FLM', className: 'launcher', classLabel: '特殊武器',
  role: '地图拾取 · 近距压制', damage: 16,
  rpm: 600, magazine: 100, reserve: 0, reload: 0, fireModes: ['auto'],
  stats: { damage: 22, rate: 74, accuracy: 18, control: 58, mobility: 46 }, tags: ['cqc', 'area_denial'],
};

/** 慢速火箭：105 m/s、弱重力，命中爆炸，对步兵与所有载具都重创。 */
export const ROCKET_AMMO: ProjectileDef = {
  id: 'rocket', muzzleVelocity: 105, gravityScale: .22, drag: 0, maxLife: 4, maxRange: 420,
  damage: 420, falloffStart: 300, minDamageScale: .85, armor: 'he', armorScale: 1.15,
  lethalHit: 'any', splash: 9, splashInner: 2.5, splashDamage: 260,
};

/**
 * 火焰喷射：range 米、dps 每秒伤害、fuelPerSecond 每秒燃料消耗。
 * 锥形范围判定用 coneCos（半角约 21.6°）+ nozzleRadius（喷口火团半径）；
 * 只有火焰锥压到「正面头部球」才触发视野致盲，盲 1.5 秒、持续被喷会续期。
 */
export const FLAME_TUNING = {
  range: 14, coneCos: 0.93, dps: 95, fuel: 100, fuelPerSecond: 22, minFuelToSpray: 1,
  nozzleRadius: .18, headRadius: .24, faceCos: .5, blindSeconds: 1.5,
};
