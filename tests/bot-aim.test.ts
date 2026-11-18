import { expect, it } from 'vitest';
import { botReactionMs, botScanIntervalMs, botSightRange, botShotDirection } from '../src/game/ai/aim';

const AMMO_850 = { muzzleVelocity: 850, gravityScale: 1 };
/** 可复现的 rng 序列。 */
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const length = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
const angleBetween = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  const dot = (a.x * b.x + a.y * b.y + a.z * b.z) / (length(a) * length(b));
  return Math.acos(Math.min(1, Math.max(-1, dot)));
};

it('首发方向精确指向下坠补偿后的目标，且与 rng 无关', () => {
  const muzzle = { x: 0, y: 1.6, z: 0 };
  const target = { x: 100, y: 1.2, z: 0 };
  const flight = 100 / AMMO_850.muzzleVelocity;
  const drop = 0.5 * 9.81 * AMMO_850.gravityScale * flight * flight;
  const aim = { x: target.x, y: target.y + drop, z: target.z };
  const expected = {
    x: aim.x - muzzle.x,
    y: aim.y - muzzle.y,
    z: aim.z - muzzle.z,
  };
  const unit = length(expected);
  const shotA = botShotDirection(muzzle, target, AMMO_850, true, 0.02, seq([0.9, 0.1]));
  const shotB = botShotDirection(muzzle, target, AMMO_850, true, 0.02, seq([0.1, 0.9]));
  expect(Math.abs(shotA.x - expected.x / unit)).toBeLessThan(1e-6);
  expect(Math.abs(shotA.y - expected.y / unit)).toBeLessThan(1e-6);
  expect(Math.abs(shotA.z - expected.z / unit)).toBeLessThan(1e-6);
  expect(shotA).toEqual(shotB);
});

it('后续射击带分散：不同 rng 方向不同，抖动在 spread 量级内', () => {
  const muzzle = { x: 0, y: 1.6, z: 0 };
  const target = { x: 120, y: 1.1, z: 12 };
  const spread = 0.02;
  const base = botShotDirection(muzzle, target, AMMO_850, true, 0, () => 0.5);
  const shotA = botShotDirection(muzzle, target, AMMO_850, false, spread, seq([0.9, 0.1]));
  const shotB = botShotDirection(muzzle, target, AMMO_850, false, spread, seq([0.1, 0.9]));
  expect(shotA).not.toEqual(shotB);
  expect(angleBetween(base, shotA)).toBeGreaterThan(0);
  expect(angleBetween(base, shotA)).toBeLessThan(spread * 2);
  expect(angleBetween(base, shotB)).toBeLessThan(spread * 2);
});

it('200m 首发比直瞄抬高约 atan(drop/distance)', () => {
  const muzzle = { x: 0, y: 0, z: 0 };
  const target = { x: 200, y: 0, z: 0 };
  const flight = 200 / AMMO_850.muzzleVelocity;
  const drop = 0.5 * 9.81 * AMMO_850.gravityScale * flight * flight;
  const shot = botShotDirection(muzzle, target, AMMO_850, true, 0.02, () => 0.5);
  const pitch = Math.asin(shot.y);
  expect(pitch).toBeGreaterThan(0);
  expect(Math.abs(pitch - Math.atan2(drop, 200))).toBeLessThan(1e-9);
});

it('侦察距离按角色分档：狙击/精确射手 > 机枪 > 步枪/冲锋枪/霰弹枪', () => {
  expect(botSightRange('sniper')).toBe(360);
  expect(botSightRange('marksman')).toBe(300);
  expect(botSightRange('lmg')).toBe(180);
  for (const role of ['rifle', 'smg', 'shotgun'] as const) expect(botSightRange(role)).toBe(120);
  expect(botSightRange('sniper')).toBeGreaterThan(botSightRange('lmg'));
  expect(botSightRange('lmg')).toBeGreaterThan(botSightRange('rifle'));
});

it('反应时间与扫描间隔：长枪反应更慢、扫描更频繁', () => {
  const reaction = (role: 'sniper' | 'marksman' | 'rifle', r: number) => botReactionMs(role, () => r);
  expect(reaction('sniper', 0)).toBe(900);
  expect(reaction('sniper', 1)).toBe(1400);
  expect(reaction('marksman', 0.5)).toBeGreaterThanOrEqual(900);
  expect(reaction('marksman', 0.5)).toBeLessThanOrEqual(1400);
  expect(reaction('rifle', 0)).toBe(500);
  expect(reaction('rifle', 1)).toBe(750);
  expect(reaction('rifle', 1)).toBeLessThan(reaction('sniper', 0));

  const scan = (role: 'sniper' | 'marksman' | 'rifle', r: number) => botScanIntervalMs(role, () => r);
  expect(scan('sniper', 0)).toBe(1600);
  expect(scan('sniper', 1)).toBe(2600);
  expect(scan('rifle', 0)).toBe(2800);
  expect(scan('rifle', 1)).toBe(4200);
  expect(scan('sniper', 1)).toBeLessThan(scan('rifle', 0));
  expect(scan('marksman', 0.5)).toBeLessThan(scan('rifle', 0.5));
});
