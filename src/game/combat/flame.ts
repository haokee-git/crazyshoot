import * as THREE from 'three';
import { FLAME_TUNING } from '../../content/weapons/special';

/**
 * 喷火器是锥形范围伤害，不是一条射线：火焰从喷口出发，向前扩散成圆锥。
 * 这些纯几何函数把「锥体覆盖球体」和「是否正面朝向火焰」从引擎里拆出来，
 * 便于单测和联机两端复用。
 */
export interface FlameCone {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
}

/** 锥体在某一前向距离处的火焰半径（喷口有基础火团，之后按半角线性扩散）。 */
export function flameSpreadAt(along: number): number {
  const spreadTan = Math.tan(Math.acos(FLAME_TUNING.coneCos));
  return FLAME_TUNING.nozzleRadius + Math.max(0, along) * spreadTan;
}

/**
 * 球体是否被火焰锥覆盖。`radius` 是目标部位（躯干/头）的容差半径，
 * 判定用「锥心到球心距离 <= 锥面半径 + 球半径」，所以贴边擦过也算命中。
 */
export function flameCoversSphere(cone: FlameCone, center: THREE.Vector3, radius: number, range = FLAME_TUNING.range): boolean {
  const dx = center.x - cone.origin.x;
  const dy = center.y - cone.origin.y;
  const dz = center.z - cone.origin.z;
  const along = dx * cone.dir.x + dy * cone.dir.y + dz * cone.dir.z;
  if (along < -radius) return false;
  if (along > range + radius) return false;
  const lateralSq = Math.max(0, dx * dx + dy * dy + dz * dz - along * along);
  const reach = flameSpreadAt(along) + radius;
  return lateralSq <= reach * reach;
}

/**
 * 火焰是否烧在脸上：目标必须正面朝向火焰源（水平夹角在 faceCos 内），
 * 背后被喷到只算躯干伤害，不触发视野致盲。
 */
export function flameFacesShooter(yaw: number, position: THREE.Vector3, origin: THREE.Vector3, faceCos = FLAME_TUNING.faceCos): boolean {
  let dx = origin.x - position.x, dz = origin.z - position.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-3) return true; // 贴着喷脸，没有可靠朝向可用，按正面算。
  dx /= length; dz /= length;
  const forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
  return forwardX * dx + forwardZ * dz >= faceCos;
}

/** 头部球心相对脚底的高度（站/蹲/趴由 bodyHeight 提供）。 */
export function flameHeadHeight(bodyHeight: number): number {
  return bodyHeight * .9;
}
