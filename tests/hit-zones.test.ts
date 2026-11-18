import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { getWeapon } from '../src/content/weapons/catalog';
import { infantryDamage, infantryHitZone } from '../src/game/combat/hit-zones';
import { AMMO } from '../src/game/combat/projectiles';

it('counts only hips-and-above as torso; thighs, shins and arms are limbs', () => {
  const feet = new Vector3(), forward = new Vector3(0, 0, 1);
  expect(infantryHitZone(new Vector3(0, 1.1, -10), forward, 9.675, feet, 1.8, 0)).toBe('torso');
  expect(infantryHitZone(new Vector3(0, 1.7, -10), forward, 9.675, feet, 1.8, 0)).toBe('head');
  // Standing hip line is 0.9 m: 1.0 is torso, .55 is thigh and .4 is shin (limb).
  expect(infantryHitZone(new Vector3(0, 1.0, -10), forward, 9.675, feet, 1.8, 0)).toBe('torso');
  expect(infantryHitZone(new Vector3(0, .55, -10), forward, 9.675, feet, 1.8, 0)).toBe('limb');
  expect(infantryHitZone(new Vector3(0, .4, -10), forward, 9.675, feet, 1.8, 0)).toBe('limb');
  expect(infantryHitZone(new Vector3(0, .12, -10), forward, 9.675, feet, 1.8, 0)).toBe('limb');
  // Arms stay outside the torso box even at chest height.
  expect(infantryHitZone(new Vector3(.29, 1.1, -10), forward, 9.675, feet, 1.8, 0)).toBe('limb');
  expect(infantryHitZone(new Vector3(-10, 1.1, 0), new Vector3(1, 0, 0), 9.675, feet, 1.8, 0)).toBe('torso');
  // Crouched hip line is 0.625 m: .7 is torso, .4 is thigh (limb), .3 is shin.
  expect(infantryHitZone(new Vector3(0, .7, -10), forward, 9.675, feet, 1.25, 0)).toBe('torso');
  expect(infantryHitZone(new Vector3(0, .4, -10), forward, 9.675, feet, 1.25, 0)).toBe('limb');
  expect(infantryHitZone(new Vector3(0, .3, -10), forward, 9.675, feet, 1.25, 0)).toBe('limb');
  // Prone (height .74) hip line is 0.37 m; below it is limb.
  expect(infantryHitZone(new Vector3(0, .4, -10), forward, 9.675, feet, .74, 0)).toBe('torso');
  expect(infantryHitZone(new Vector3(0, .3, -10), forward, 9.675, feet, .74, 0)).toBe('limb');
  expect(infantryHitZone(new Vector3(0, .12, -10), forward, 9.675, feet, .74, 0)).toBe('limb');
});

it('applies the sniper lethal zones after range falloff without changing other rifles', () => {
  const awm = { ...AMMO.sniper, lethalHit: getWeapon('awm')?.lethalHit };
  const amr = { ...AMMO.amr, lethalHit: getWeapon('amr')?.lethalHit };
  expect(infantryDamage(76, awm, 'torso')).toBe(100);
  expect(infantryDamage(76, awm, 'head')).toBeGreaterThan(100);
  expect(infantryDamage(95, awm, 'limb')).toBe(67);
  for (const zone of ['head', 'torso', 'limb'] as const) expect(infantryDamage(80, amr, zone)).toBeGreaterThanOrEqual(100);
  // Torso stays 100% of base; non-SMG limbs are 70%; head stays 220%.
  expect(infantryDamage(26, AMMO.rifle, 'torso')).toBe(26);
  expect(infantryDamage(26, AMMO.rifle, 'head')).toBe(57);
  expect(infantryDamage(26, AMMO.rifle, 'limb')).toBe(18);
  for (const def of [AMMO.rifle, AMMO.sniper, AMMO.pellet]) {
    expect(infantryDamage(100, def, 'limb')).toBeLessThan(infantryDamage(100, def, 'torso'));
  }
  expect(infantryDamage(100, AMMO.smg, 'limb')).toBe(infantryDamage(100, AMMO.smg, 'torso'));
});

it.each(['uzi', 'vector', 'ump45', 'mp5'])('%s limb damage now equals torso at every range', (id) => {
  const { damage } = getWeapon(id)!;
  const torsoNear = infantryDamage(damage, AMMO.smg, 'torso');
  expect(infantryDamage(damage, AMMO.smg, 'limb')).toBe(torsoNear);
  expect(infantryDamage(damage, AMMO.smg, 'head')).toBe(Math.round(damage * 2.2));
  const torsoFar = infantryDamage(damage * AMMO.smg.minDamageScale, AMMO.smg, 'torso');
  expect(infantryDamage(damage * AMMO.smg.minDamageScale, AMMO.smg, 'limb')).toBe(torsoFar);
});
