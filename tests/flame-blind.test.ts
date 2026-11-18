import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { flameCoversSphere, flameFacesShooter, flameHeadHeight, flameSpreadAt } from '../src/game/combat/flame';
import { FLAME_TUNING } from '../src/content/weapons/special';

const origin = new THREE.Vector3(0, 1.6, 0);
const dir = new THREE.Vector3(0, 0, -1); // 朝 -Z 喷
const cone = { origin, dir };
const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('flame cone coverage', () => {
  it('从喷口向前扩张，越远火焰半径越大', () => {
    expect(flameSpreadAt(0)).toBeCloseTo(FLAME_TUNING.nozzleRadius, 5);
    expect(flameSpreadAt(5)).toBeGreaterThan(flameSpreadAt(2));
    expect(flameSpreadAt(12)).toBeGreaterThan(FLAME_TUNING.nozzleRadius);
  });

  it('锥轴上的躯干/头部球被覆盖', () => {
    expect(flameCoversSphere(cone, at(0, 1.6, -2), .3)).toBe(true);
    expect(flameCoversSphere(cone, at(0, 1.6, -8), FLAME_TUNING.headRadius)).toBe(true);
  });

  it('锥面外的人不覆盖，贴边擦过的人覆盖（半径容差）', () => {
    const edge = flameSpreadAt(6) + FLAME_TUNING.headRadius + .05;
    expect(flameCoversSphere(cone, at(edge, 1.6, -6), FLAME_TUNING.headRadius)).toBe(false);
    expect(flameCoversSphere(cone, at(edge - .2, 1.6, -6), FLAME_TUNING.headRadius)).toBe(true);
  });

  it('射程外与火焰背后不覆盖', () => {
    expect(flameCoversSphere(cone, at(0, 1.6, -(FLAME_TUNING.range + 2)), .3)).toBe(false);
    expect(flameCoversSphere(cone, at(0, 1.6, 2), .3)).toBe(false);
  });
});

describe('flame face exposure', () => {
  const shooter = at(0, 1.6, -3); // 敌人位于目标 -Z 方向

  it('正面朝向火焰才视为烧到脸', () => {
    // 面向 -Z（朝向敌人）：forward = (-sin0, -cos0) = (0, -1)
    expect(flameFacesShooter(0, at(0, 0, 0), shooter)).toBe(true);
  });

  it('背对火焰只算躯干伤害，不失明', () => {
    // 面向 +Z（背对敌人）
    expect(flameFacesShooter(Math.PI, at(0, 0, 0), shooter)).toBe(false);
    // 侧对火焰（±90°）同样不算正面
    expect(flameFacesShooter(Math.PI / 2, at(0, 0, 0), shooter)).toBe(false);
  });

  it('约 ±60° 内算正面，之外不算', () => {
    const yaw = (deg: number) => THREE.MathUtils.degToRad(deg);
    // 敌人在 (-3,-3)，正对它需要 yaw=45°；偏差 55° 仍算正面，偏差 65° 不算。
    expect(flameFacesShooter(yaw(45 + 55), at(0, 0, 0), at(-3, 1.6, -3))).toBe(true);
    expect(flameFacesShooter(yaw(45 + 65), at(0, 0, 0), at(-3, 1.6, -3))).toBe(false);
  });
});

describe('flame head height', () => {
  it('站/蹲/趴的头部球跟着身高走', () => {
    expect(flameHeadHeight(1.8)).toBeCloseTo(1.62, 5);
    expect(flameHeadHeight(1.25)).toBeCloseTo(1.125, 5);
    expect(flameHeadHeight(.74)).toBeCloseTo(.666, 5);
  });
});
