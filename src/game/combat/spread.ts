import * as THREE from 'three';

/**
 * 载具武器散布（半角，弧度）。
 *
 * 设计：首发取 `first`，每发叠加 `perShot` 直到 `max`；停火 `recoverDelay` 秒后
 * 按 `recoverRate`（弧度/秒）回落到首发值。扰动只加在发射方向 dir 上，准星不动。
 */
export const DEGREE = Math.PI / 180;

export interface SpreadProfile {
  /** 首发半角（弧度） */
  first: number;
  /** 每发增量（弧度/发） */
  perShot: number;
  /** 上限（弧度） */
  max: number;
  /** 停火多久开始回落（秒） */
  recoverDelay: number;
  /** 回落速度（弧度/秒） */
  recoverRate: number;
}

export const VEHICLE_SPREAD: Record<string, SpreadProfile> = {
  // 30 mm 机关炮：±0.05° 起，每发 +0.012°，上限 ±0.25°，停火 0.8s 后 0.4°/s 回落。
  ac30_ap: { first: .05 * DEGREE, perShot: .012 * DEGREE, max: .25 * DEGREE, recoverDelay: .8, recoverRate: .4 * DEGREE },
  ac30_he: { first: .05 * DEGREE, perShot: .012 * DEGREE, max: .25 * DEGREE, recoverDelay: .8, recoverRate: .4 * DEGREE },
  // 120 mm 主炮（AMMO.ap / AMMO.he）：固定 ±0.03°，单发不累积。
  ap: { first: .03 * DEGREE, perShot: 0, max: .03 * DEGREE, recoverDelay: 0, recoverRate: 0 },
  he: { first: .03 * DEGREE, perShot: 0, max: .03 * DEGREE, recoverDelay: 0, recoverRate: 0 },
  // 载具机枪：±0.15° 起，每发 +0.01°，上限 ±0.6°，停火 0.5s 后 0.5°/s 回落。
  vehicle_mg: { first: .15 * DEGREE, perShot: .01 * DEGREE, max: .6 * DEGREE, recoverDelay: .5, recoverRate: .5 * DEGREE },
};

export const spreadProfile = (defId: string): SpreadProfile | undefined => VEHICLE_SPREAD[defId];

/** 半角扰动：与 engine.ts 步兵弹道同一写法（x/y 各偏 ±spread，再归一化）。 */
export function jitterDirection(dir: THREE.Vector3, spread: number, random: () => number): THREE.Vector3 {
  dir.x += (random() - .5) * 2 * spread;
  dir.y += (random() - .5) * 2 * spread;
  return dir.normalize();
}

/** 当前这一发用的半角。 */
export const spreadForShot = (profile: SpreadProfile, current: number) => Math.min(profile.max, Math.max(current, profile.first));

/** 开火后的下一发散布。 */
export const spreadAfterShot = (profile: SpreadProfile, current: number) =>
  Math.min(profile.max, spreadForShot(profile, current) + profile.perShot);

/** 停火回落：先等 recoverDelay，再线性回落但不低于首发值。 */
export function recoverSpread(profile: SpreadProfile, current: number, sinceLastShot: number, dt: number): number {
  if (sinceLastShot < profile.recoverDelay) return Math.max(current, profile.first);
  return Math.max(profile.first, current - profile.recoverRate * Math.max(0, dt));
}

/** 验收换算：给定散布半角（弧度）与距离（米），落点半径的期望上限。 */
export const spreadRadius = (angle: number, distance: number) => Math.tan(angle) * distance;
