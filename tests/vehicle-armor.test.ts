import { expect, it } from 'vitest';
import { getWeapon } from '../src/content/weapons/catalog';
import { AMMO } from '../src/game/combat/projectiles';
import { enclosedVehicle, vehicleHealth } from '../src/game/vehicles/controller';

/** Mirrors the vehicle branch of applyCombatHit: only enclosed hulls take armorScale. */
function damagePerHit(kind: string, distance = 0) {
  const def = { ...AMMO.amr, damage: getWeapon('amr')!.damage };
  const falloff = 1 - (1 - def.minDamageScale) * Math.min(1, Math.max(0, (distance - def.falloffStart) / Math.max(1, def.maxRange - def.falloffStart)));
  const scale = enclosedVehicle(kind) ? def.armorScale ?? (def.armor === 'bullet' ? .025 : def.armor === 'he' ? .22 : 1) : 1;
  return def.damage * falloff * scale;
}

const shotsToKill = (kind: string, distance = 0) => Math.ceil(vehicleHealth(kind) / damagePerHit(kind, distance));

it('kills armoured vehicles in the tuned AMR hit counts', () => {
  expect(shotsToKill('apc')).toBe(3);
  expect(shotsToKill('ifv')).toBe(3);
  expect(shotsToKill('light_tank')).toBe(5);
  expect(shotsToKill('mbt')).toBe(7);
});

it('keeps those counts from point blank to max range', () => {
  for (const kind of ['apc', 'ifv', 'light_tank', 'mbt']) expect(shotsToKill(kind, AMMO.amr.maxRange)).toBe(shotsToKill(kind));
});

it('still one-shots a motorcycle and two-shots a jeep', () => {
  expect(shotsToKill('motorcycle')).toBe(1);
  expect(shotsToKill('jeep')).toBe(2);
});
