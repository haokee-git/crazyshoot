import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DECAL_LIFE, ImpactSystem, impactSurface } from '../src/game/combat/impacts';
import { SolidIndex } from '../src/game/world/solid-index';

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);

function makeSystem(decals = 4, dust = 8) {
  return new ImpactSystem(
    new THREE.Scene(),
    { decal: new THREE.Texture(), smoke: new THREE.Texture() },
    { decals, dust },
  );
}

describe('bullet impact surfaces', () => {
  it('maps block materials to dust and sound classes', () => {
    expect(impactSurface(6)).toBe('concrete');   // brick_red
    expect(impactSurface(5)).toBe('concrete');   // concrete_poured
    expect(impactSurface(10)).toBe('metal');     // metal_galvanized
    expect(impactSurface(14)).toBe('metal');     // steel_corroded
    expect(impactSurface(7)).toBe('wood');       // timber_weathered
    expect(impactSurface(2)).toBe('dirt');       // earth_dry
    expect(impactSurface(0)).toBe('concrete');   // unknown falls back
  });
});

describe('impact system pools', () => {
  it('keeps a wall decal for ten seconds, fading out at the end', () => {
    const impacts = makeSystem();
    impacts.spawn(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), 5);
    expect(impacts.liveDecals).toBe(1);
    impacts.update(DECAL_LIFE - 0.6, camera);
    expect(impacts.liveDecals).toBe(1);
    impacts.update(1.2, camera);
    expect(impacts.liveDecals).toBe(0);
  });

  it('recycles the pool instead of growing under sustained fire', () => {
    const impacts = makeSystem(4, 8);
    for (let i = 0; i < 20; i++) impacts.spawn(new THREE.Vector3(i, 1, 0), new THREE.Vector3(0, 0, 1), 5);
    expect(impacts.liveDecals).toBe(4);
    expect(impacts.liveDust).toBe(8);
  });

  it('skips the decal on moving vehicles but still puffs dust', () => {
    const impacts = makeSystem();
    impacts.spawn(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), 10, false);
    expect(impacts.liveDecals).toBe(0);
    expect(impacts.liveDust).toBeGreaterThan(0);
    impacts.update(2, camera);
    expect(impacts.liveDust).toBe(0);
  });
});

describe('hit normals', () => {
  it('reports the box face that stopped the ray', () => {
    const index = new SolidIndex([
      { id: 'wall', x: 0, z: 5, w: 2, d: 2, bottom: 0, top: 2, material: 5 },
    ]);
    const front = index.rayHit(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), 20)!;
    expect(front.distance).toBeCloseTo(4, 5);
    expect(front.normal.toArray()).toEqual([0, 0, -1]);
    expect(front.material).toBe(5);

    const side = index.rayHit(new THREE.Vector3(-5, 1, 5), new THREE.Vector3(1, 0, 0), 20)!;
    expect(side.normal.toArray()).toEqual([-1, 0, 0]);

    const top = index.rayHit(new THREE.Vector3(0, 10, 5), new THREE.Vector3(0, -1, 0), 20)!;
    expect(top.normal.toArray()).toEqual([0, 1, 0]);
    expect(top.distance).toBeCloseTo(8, 5);
  });

  it('misses cleanly outside the box', () => {
    const index = new SolidIndex([
      { id: 'wall', x: 0, z: 5, w: 2, d: 2, bottom: 0, top: 2, material: 5 },
    ]);
    expect(index.rayHit(new THREE.Vector3(20, 1, 0), new THREE.Vector3(0, 0, 1), 20)).toBeNull();
  });
});

describe('smoke occlusion', () => {
  it('draws smoke after the decal and dust pools so bullet holes cannot show through it', async () => {
    const { Tactical } = await import('../src/game/combat/tactical');
    const scene = new THREE.Scene();
    const impacts = makeSystem();
    const tactical = new Tactical(scene);
    const decals = (impacts as unknown as { decals: THREE.Mesh }).decals;
    const dust = (impacts as unknown as { dustMesh: THREE.Mesh }).dustMesh;
    const clouds = scene.children.filter((child) => child.name === 'smoke-cloud') as THREE.Mesh[];
    expect(clouds.length).toBe(4);
    for (const cloud of clouds) {
      expect(cloud.visible).toBe(false);
      expect(cloud.material).toMatchObject({ transparent: true, depthWrite: false });
      expect(cloud.renderOrder).toBeGreaterThan(decals.renderOrder);
      expect(cloud.renderOrder).toBeGreaterThan(dust.renderOrder);
    }
    // Sight blocking already uses the smoke spheres; the render order is the only
    // thing that must keep holes from painting over an active cloud.
    expect(tactical.smokes.length).toBe(4);
  });
});
