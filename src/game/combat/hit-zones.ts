import type { Vector3 } from 'three';
import { rayBoxDistance } from '../world/queries';
import type { ProjectileDef } from './projectiles';

export type HitZone = 'head' | 'torso' | 'limb';

/**
 * Torso volume: hips up to the neck. Anything below the hip line — thighs,
 * knees, shins, boots — counts as a limb, same as the arms and shoulders
 * outside the narrow torso box. The hip sits at ~50% of standing height in the
 * block character rig (hips bone at 0.92 m on a 1.8 m body).
 */
const TORSO_BOTTOM_RATIO = .5;

export function infantryHitZone(origin: Vector3, direction: Vector3, distance: number, feet: Vector3, height: number, yaw: number): HitZone {
  const head = feet.y + height - .3;
  if (origin.y + direction.y * distance > head) return 'head';
  const bottom = feet.y + height * TORSO_BOTTOM_RATIO;
  const torso = rayBoxDistance(origin, direction, {
    x: feet.x, z: feet.z, w: .45, d: .48, rot: yaw, bottom, top: head,
  }, distance + .48);
  return Number.isFinite(torso) ? 'torso' : 'limb';
}

export function infantryDamage(amount: number, projectile: ProjectileDef, zone?: HitZone) {
  const multiplier = zone === 'head' ? 2.2 : zone === 'limb' ? (projectile.limbScale ?? 1) : 1;
  const damage = amount * multiplier;
  const lethal = projectile.lethalHit === 'any' || projectile.lethalHit === 'torso' && (zone === 'torso' || zone === 'head');
  return Math.round(lethal ? Math.max(100, damage) : damage);
}
