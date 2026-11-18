import type { ArmorClass, ProjectileDef } from '../combat/projectiles';

/**
 * 载具伤害纯函数（无副作用，便于单元测试）。
 *
 * 分档：motorcycle / jeep 为非装甲（soft），其余为装甲。
 * 非装甲吃普通子弹的"软目标系数"，按 PUBG 手感校准：
 *   步枪 26 × 0.115 ≈ 3 → 180 HP 吉普约 60 枪；60 HP 摩托约 20 枪。
 * 装甲仍沿用 projectile 自带的 armorScale（步枪 2.5%、HE 22%、AP 100%）。
 */
export const SOFT_VEHICLE_BULLET_SCALE: Record<string, number> = {
  rifle: 0.115,
  smg: 0.12,
  sniper: 0.11,
  pellet: 0.085,
  vehicle_mg: 0.16,
  amr: 1,
  rocket: 1,
};

export const isArmoredVehicle = (kind: string) => kind !== 'motorcycle' && kind !== 'jeep';

/** 装甲分档：APC/IFV 轻甲、轻坦中甲、主战重甲，摩托/吉普为软目标。 */
export const armorClassOf = (kind: string): ArmorClass =>
  kind === 'apc' || kind === 'ifv' ? 'light' : kind === 'light_tank' ? 'medium' : kind === 'mbt' ? 'heavy' : 'soft';

/** 子弹/炮弹直击载具的伤害系数（不含 AP 的正面/背面修正）。 */
export function vehicleHitScale(def: ProjectileDef, kind: string): number {
  if (!isArmoredVehicle(kind)) {
    return def.armor === 'bullet' ? (SOFT_VEHICLE_BULLET_SCALE[def.id] ?? 0.115) : 1;
  }
  const armorClass = armorClassOf(kind) as Exclude<ArmorClass, 'soft'>;
  if (def.armorClassScale) {
    const scaled = def.armorClassScale[armorClass];
    if (scaled !== undefined) return scaled;
  }
  return def.armorScale ?? (def.armor === 'bullet' ? 0.025 : def.armor === 'he' ? 0.22 : 1);
}

/** AP 命中车体前/后部：正面 0.7、背面 1.4。front 为命中点相对车头（沿车头方向）的投影。 */
export function apFacingScale(front: number, halfDepth: number): number {
  if (front > halfDepth * 0.35) return 0.7;
  if (front < -halfDepth * 0.35) return 1.4;
  return 1;
}

/** 直击载具的最终伤害。 */
export function vehicleDirectDamage(
  def: ProjectileDef,
  amount: number,
  kind: string,
  opts: { front: number; halfDepth: number },
): number {
  const armored = isArmoredVehicle(kind);
  let dmg = amount * vehicleHitScale(def, kind);
  // 分档系数（30mm 一类）本身就是最终装甲系数，不再叠加正面 0.7 / 背面 1.4；
  // 120mm AP 仍按命中前/后部修正。
  if (armored && def.armor === 'ap' && !def.armorClassScale) dmg *= apFacingScale(opts.front, opts.halfDepth);
  return dmg;
}

/** 爆炸对载具的伤害（距离平方衰减）。装甲载具按 def.armorScale 或 0.35 折减。 */
export function blastVehicleDamage(
  def: ProjectileDef | undefined,
  peak: number,
  kind: string,
  distance: number,
  radius: number,
): number {
  if (radius <= 0) return 0;
  const t = Math.min(1, Math.max(0, distance / radius));
  const armored = isArmoredVehicle(kind);
  let scale = 1;
  if (armored && def) {
    const armorClass = armorClassOf(kind) as Exclude<ArmorClass, 'soft'>;
    scale = def.armorClassScale?.[armorClass] ?? def.armorScale ?? (def.armor === 'ap' ? 0.55 : def.armor === 'he' ? 0.35 : 0.3);
  }
  return peak * scale * Math.pow(1 - t, 1.45);
}

/** 中途下车摔落伤害：车速 m/s，5 m/s 以下无伤，上限 85。 */
export function fallDamageFromExit(speed: number): number {
  const s = Math.abs(speed);
  if (s <= 5) return 0;
  return Math.min(85, Math.round(Math.pow(s - 5, 1.35) * 1.2));
}

/** 车毁爆炸对周围玩家的伤害（与爆炸半径联动）。 */
export function vehicleExplosionDamage(distance: number, radius: number, peak = 130): number {
  if (radius <= 0) return 0;
  const t = Math.min(1, Math.max(0, distance / radius));
  return peak * Math.pow(1 - t, 1.3);
}
