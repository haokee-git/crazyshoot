import { expect, it } from 'vitest';
import { AMMO } from '../src/game/combat/projectiles';
import {
  DEGREE,
  recoverSpread,
  spreadAfterShot,
  spreadForShot,
  spreadProfile,
  spreadRadius,
} from '../src/game/combat/spread';
import { vehicleDirectDamage } from '../src/game/vehicles/damage';
import { vehicleHealth } from '../src/game/vehicles/controller';

const ac30ap = spreadProfile('ac30_ap')!;
const ac30he = spreadProfile('ac30_he')!;
const cannon = spreadProfile('ap')!;
const mg = spreadProfile('vehicle_mg')!;

it('uses the requested half-angles in degrees', () => {
  expect(ac30ap.first / DEGREE).toBeCloseTo(0.05, 6);
  expect(ac30ap.perShot / DEGREE).toBeCloseTo(0.012, 6);
  expect(ac30ap.max / DEGREE).toBeCloseTo(0.25, 6);
  expect(cannon.first / DEGREE).toBeCloseTo(0.03, 6);
  expect(mg.first / DEGREE).toBeCloseTo(0.15, 6);
  expect(mg.perShot / DEGREE).toBeCloseTo(0.01, 6);
  expect(mg.max / DEGREE).toBeCloseTo(0.6, 6);
});

it('30mm 首发 400m 落点 ≤0.4m，连射 20 发 ≈1.7m', () => {
  expect(spreadRadius(spreadForShot(ac30ap, 0), 400)).toBeLessThanOrEqual(0.4);
  let spread = 0;
  for (let i = 0; i < 20; i++) spread = spreadAfterShot(ac30ap, spread);
  expect(spreadRadius(Math.min(ac30ap.max, spread), 400)).toBeCloseTo(1.7, 1);
});

it('120mm 650m 落点 ≈0.35m 且单发不累积', () => {
  expect(spreadRadius(spreadForShot(cannon, 0), 650)).toBeCloseTo(0.35, 1);
  expect(spreadAfterShot(cannon, 0)).toBe(spreadForShot(cannon, 0));
});

it('recovers after the delay and never below first', () => {
  let spread = ac30ap.max;
  const beforeDelay = recoverSpread(ac30ap, spread, 0.79, 0.1);
  expect(beforeDelay).toBe(spread);
  const next = recoverSpread(ac30ap, spread, 0.85, 1);
  expect(next).toBeLessThan(spread);
  expect(next).toBeGreaterThanOrEqual(ac30ap.first);
  expect(recoverSpread(ac30ap, ac30ap.first, 5, 1)).toBe(ac30ap.first);
});

it('30mm AP kills an MBT front in 25-35s of sustained fire', () => {
  const damage = vehicleDirectDamage(AMMO.ac30_ap, AMMO.ac30_ap.damage, 'mbt', { front: 0, halfDepth: 6.6 });
  expect(damage).toBeCloseTo(4.16, 2);
  const shots = Math.ceil(vehicleHealth('mbt') / damage);
  const seconds = (shots - 1) * 0.105;
  expect(seconds).toBeGreaterThanOrEqual(25);
  expect(seconds).toBeLessThanOrEqual(35);
  // 弹量要够打完这只弹链
  expect(shots).toBeLessThanOrEqual(250);
});

it('30mm damage is not reduced again by front/rear facing', () => {
  const front = vehicleDirectDamage(AMMO.ac30_ap, AMMO.ac30_ap.damage, 'mbt', { front: 5, halfDepth: 6.6 });
  const rear = vehicleDirectDamage(AMMO.ac30_ap, AMMO.ac30_ap.damage, 'mbt', { front: -5, halfDepth: 6.6 });
  expect(front).toBeCloseTo(rear, 5);
  expect(front).toBeCloseTo(4.16, 2);
});

it('30mm AP is far stronger against light armour than heavy', () => {
  const light = vehicleDirectDamage(AMMO.ac30_ap, AMMO.ac30_ap.damage, 'apc', { front: 0, halfDepth: 5.4 });
  const medium = vehicleDirectDamage(AMMO.ac30_ap, AMMO.ac30_ap.damage, 'light_tank', { front: 0, halfDepth: 5.3 });
  const heavy = vehicleDirectDamage(AMMO.ac30_ap, AMMO.ac30_ap.damage, 'mbt', { front: 0, halfDepth: 6.6 });
  expect(light).toBeCloseTo(12.8, 1);
  expect(medium).toBeCloseTo(5.76, 2);
  expect(heavy).toBeCloseTo(4.16, 2);
});

it('30mm HE barely scratches an MBT', () => {
  const dmg = vehicleDirectDamage(AMMO.ac30_he, AMMO.ac30_he.damage, 'mbt', { front: 0, halfDepth: 6.6 });
  expect(dmg).toBeCloseTo(24 * 0.06, 2);
});

it('120mm keeps its old damage', () => {
  const dmg = vehicleDirectDamage(AMMO.ap, AMMO.ap.damage, 'mbt', { front: 0, halfDepth: 6.6 });
  expect(dmg).toBeCloseTo(360, 5);
});
