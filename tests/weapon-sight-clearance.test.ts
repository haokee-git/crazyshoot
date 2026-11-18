import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildWeaponModel } from '../src/content/weapons/models';
import { WEAPON_PRESENTATION } from '../src/content/weapons/presentation';
import { buildOptic } from '../src/game/weapons/optics';
import type { OpticId } from '../src/content/weapons/catalog';

/**
 * Vector's iron sights must sit below every optic's sight line. The old tall
 * posts were fine in hip fire but stood through the middle of a red dot or 4x
 * lens, making ADS unusable.
 */
describe('Vector iron-sight clearance under optics', () => {
  const gun = buildWeaponModel('vector');
  gun.updateMatrixWorld(true);
  const maxSightY = (() => {
    let top = -Infinity;
    gun.traverse((object) => {
      if (!object.userData?.ironSight) return;
      const box = new THREE.Box3().setFromObject(object);
      if (Number.isFinite(box.max.y)) top = Math.max(top, box.max.y);
    });
    return top;
  })();

  it('tags the sights and keeps them low profile', () => {
    expect(Number.isFinite(maxSightY)).toBe(true);
    expect(maxSightY).toBeLessThan(.17);
  });

  it('leaves visible clearance under iron, red dot, holo and every scope', () => {
    const def = WEAPON_PRESENTATION.vector;
    const optics: OpticId[] = ['iron', 'red_dot', 'holo', '2x', '3x', '4x', '6x', '8x'];
    for (const id of optics) {
      const eye = buildOptic(id).eye.y + def.rail[1];
      expect(maxSightY, `${id} sight line`).toBeLessThan(eye - .02);
    }
  });
});
