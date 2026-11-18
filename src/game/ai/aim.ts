import type { BotRole } from './bot-loadout';

export interface AimVector { x: number; y: number; z: number }
export interface AmmoLike { muzzleVelocity: number; gravityScale: number }

const GRAVITY = 9.81;

/** 机器人侦察距离（米）：长枪 260，机枪 180，其余 130；实际还会与武器射程取小。 */
export function botSightRange(role: BotRole): number {
  if (role === 'sniper') return 360;
  if (role === 'marksman') return 300;
  if (role === 'lmg') return 180;
  return 120;
}

/** 看到人之后的反应延迟（毫秒）：狙击/精确射手 900-1400，其余 500-750。 */
export function botReactionMs(role: BotRole, rng: () => number): number {
  return role === 'sniper' || role === 'marksman' ? 900 + rng() * 500 : 500 + rng() * 250;
}

/** 两次“扫描”（转头观察威胁方向）之间的间隔：长枪 1.6-2.6s，其余 2.8-4.2s。 */
export function botScanIntervalMs(role: BotRole, rng: () => number): number {
  return role === 'sniper' || role === 'marksman' ? 1600 + rng() * 1000 : 2800 + rng() * 1400;
}

/** 扫描窗口长度（毫秒）：0.9-1.3s，窗口内转头看威胁且不影响移动。 */
export function botScanWindowMs(_role: BotRole, rng: () => number): number {
  return 900 + rng() * 400;
}

/** 由 yaw/pitch 生成引擎同款朝向（yaw = atan2(-dx,-dz)，pitch 向上为正）。 */
function directionFromAngles(yaw: number, pitch: number): AimVector {
  const flat = Math.cos(pitch);
  return { x: -Math.sin(yaw) * flat, y: Math.sin(pitch), z: -Math.cos(yaw) * flat };
}

/**
 * 机器人开火方向。
 * - 首发：零散布，方向精确指向“下坠补偿后”的目标点（除非目标在采样后移动）。
 * - 后续：同一个补偿目标上再加 ±spread 的随机角度抖动。
 */
export function botShotDirection(
  muzzle: AimVector,
  target: AimVector,
  ammo: AmmoLike,
  firstShot: boolean,
  spread: number,
  rng: () => number,
): AimVector {
  const dx = target.x - muzzle.x;
  const dy = target.y - muzzle.y;
  const dz = target.z - muzzle.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-6) return { x: 0, y: 0, z: -1 };
  const flight = distance / Math.max(1, ammo.muzzleVelocity);
  const drop = 0.5 * GRAVITY * ammo.gravityScale * flight * flight;
  const aimY = dy + drop;
  if (firstShot) {
    const length = Math.hypot(dx, aimY, dz);
    return { x: dx / length, y: aimY / length, z: dz / length };
  }
  const yaw = Math.atan2(-dx, -dz) + (rng() - rng()) * spread;
  const pitch = Math.atan2(aimY, Math.hypot(dx, dz)) + (rng() - rng()) * spread;
  return directionFromAngles(yaw, pitch);
}

export interface AimSituation {
 role:BotRole;distance:number;targetSpeed:number;moving:number;underFire:boolean;ammoRatio:number;
 rpm:number;visibleMs:number;targetArmored?:boolean;
}
/** Precision, fire cadence and burst length respond to the actual engagement. */
export function botAimPlan(p:AimSituation){
 const long=p.role==='sniper'||p.role==='marksman',close=p.distance<24;
 const burst=long||p.role==='shotgun'?1:p.ammoRatio<.15?2:p.role==='lmg'?(close?7:5):close?5:p.distance>75?2:3;
 const flightConfidence=Math.min(1,p.visibleMs/900);
 return {burst,interval:Math.max(60000/p.rpm,long?130:close?90:155),pause:long?0:close?220:p.distance>75?490:340,
  spread:(.002+Math.min(.01,p.distance/11000)+Math.min(.015,p.targetSpeed*.002))*(p.underFire?1.45:1)*(p.moving>2?1.35:1)*(1.2-flightConfidence*.35),
  lead:flightConfidence*.85,
  fire:!p.targetArmored,
 };
}
/** Rank only enemies that passed perception; retaining a good target has value. */
export function botTargetUtility(distance:number,preferredRange:number,underFire:boolean,attackingAlly:boolean,armored:boolean,canHurtArmor:boolean,current:boolean){
 return 100-distance*.42-Math.max(0,distance-preferredRange*1.7)*.3+(underFire?32:0)+(attackingAlly?18:0)+(current?12:0)-(armored&&!canHurtArmor?120:0);
}
