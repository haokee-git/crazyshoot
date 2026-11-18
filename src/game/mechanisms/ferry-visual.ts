/**
 * Ferry deck visual: one small Group per ferry, built from boxes (no external
 * assets). The deck top sits at local y=0 and the group is placed at deckY, so
 * the platform contract (deckY) and the visible deck are the same surface.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FerryConfig } from './river-ferry';

const WOOD = new THREE.MeshLambertMaterial({ color: 0xbe8a52 });
const WOOD_DARK = new THREE.MeshLambertMaterial({ color: 0x674630 });
const HULL = new THREE.MeshLambertMaterial({ color: 0x54422e });
const ROPE = new THREE.MeshLambertMaterial({ color: 0xb39a6a });
const METAL = new THREE.MeshLambertMaterial({ color: 0x4b4d49 });

export interface FerryVisual {
  group: THREE.Group;
  dispose(): void;
}

export function buildFerryVisual(cfg: FerryConfig): FerryVisual {
  const group = new THREE.Group();
  group.name = `ferry:${cfg.id}`;
  const L = cfg.deckLength, W = cfg.deckWidth;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  // deck (top at y=0)
  box(L, 0.18, W, 0, -0.09, 0, WOOD);
  // hull sides and bottom
  box(L, 0.5, 0.22, 0, -0.42, W / 2 - 0.11, HULL);
  box(L, 0.5, 0.22, 0, -0.42, -W / 2 + 0.11, HULL);
  box(0.22, 0.5, W, L / 2 - 0.11, -0.42, 0, HULL);
  box(0.22, 0.5, W, -L / 2 + 0.11, -0.42, 0, HULL);
  box(L, 0.18, W, 0, -0.68, 0, HULL);
  // Continuous railings match collision. Both X ends are open for boarding.
  for (const side of [-1, 1] as const) {
    const z = side * (W / 2 - 0.08);
    box(L, 0.12, 0.12, 0, 0.98, z, WOOD_DARK);
    box(L, 0.10, 0.12, 0, 0.49, z, WOOD);
    for (const x of [-L / 2 + 0.12, 0, L / 2 - 0.12]) box(0.12, 1.04, 0.12, x, 0.52, z, WOOD_DARK);
    box(0.24, 1.18, 0.18, 0, 0.59, z, WOOD_DARK);
    box(0.28, 0.16, 0.24, 0, 1.26, z, METAL);
  }
  // Side fenders
  for (const side of [-1, 1] as const) {
    const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 6), ROPE);
    fender.rotation.z = Math.PI / 2;
    fender.position.set(L / 2 - 0.2, -0.4, side * (W / 2 - 0.02));
    group.add(fender);
  }
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of group.children) {
    const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    mesh.updateMatrix();
    mesh.geometry.applyMatrix4(mesh.matrix);
    const geometry = batches.get(mesh.material) ?? [];
    geometry.push(mesh.geometry);
    batches.set(mesh.material, geometry);
  }
  group.clear();
  for (const [material, geometry] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(geometry), material);
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const part of geometry) part.dispose();
  }
  group.position.set(cfg.initialSide === 'west' ? cfg.westX : cfg.eastX, cfg.deckY, cfg.z);
  return {
    group,
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      group.removeFromParent();
    },
  };
}
