/** -1 = lean left, 0 = upright, 1 = lean right. Both keys cancel out. */
export function leanTarget(left: boolean, right: boolean, allowed: boolean): number {
  if (!allowed) return 0;
  if (left === right) return 0;
  return left ? -1 : 1;
}

/** Full lean angle (degrees) of the upper body around the waist pivot. */
export const LEAN_MAX_DEGREES = 20;
/**
 * Metres from the waist pivot to the eye. The upper body (head, hands, gun)
 * rides this arc: sideways 0.6*sin(20°) ≈ 0.205 m, down 0.6*(1-cos(20°)) ≈ 0.036 m.
 */
export const LEAN_RADIUS = 0.6;

/**
 * Offset of the eye/gun when leaning: the torso stays put and the upper body
 * arcs around the waist. `side` is +right, `drop` is +down (metres).
 * Pure math — no three.js — so it is trivially testable.
 */
export function leanArc(lean: number): { side: number; drop: number } {
  const clamped = Math.max(-1, Math.min(1, lean));
  const angle = clamped * LEAN_MAX_DEGREES * (Math.PI / 180);
  return { side: Math.sin(angle) * LEAN_RADIUS, drop: (1 - Math.cos(angle)) * LEAN_RADIUS };
}
