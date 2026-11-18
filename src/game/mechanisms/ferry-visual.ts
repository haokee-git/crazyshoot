/**
 * Ferry deck visual: one small Group per ferry, built from boxes (no external
 * assets). The deck top sits at local y=0 and the group is placed at deckY, so
 * the platform contract (deckY) and the visible deck are the same surface.
 */
import * as THREE from 'three';
import type { FerryConfig } from './river-ferry';

const WOOD = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
const WOOD_DARK = new THREE.MeshLambertMaterial({ color: 0x3b2819 });
const HULL = new THREE.MeshLambertMaterial({ color: 0x4a3624 });
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
  box(L + 0.2, 0.5, 0.22, 0, -0.42, W / 2 - 0.11, HULL);
  box(L + 0.2, 0.5, 0.22, 0, -0.42, -W / 2 + 0.11, HULL);
  box(0.22, 0.5, W, L / 2 - 0.11, -0.42, 0, HULL);
  box(0.22, 0.5, W, -L / 2 + 0.11, -0.42, 0, HULL);
  box(L, 0.18, W, 0, -0.68, 0, HULL);
  // side rails with 1.6 m boarding openings at both z ends
  for (const side of [-1, 1] as const) {
    const z = side * (W / 2 - 0.08);
    const seg = (L - 2.0) / 2;
    box(seg, 1.0, 0.12, -(L - 2.0) / 4 - 0.75, 0.5, z, WOOD_DARK);
    box(seg, 1.0, 0.12, (L - 2.0) / 4 + 0.75, 0.5, z, WOOD_DARK);
    // short posts
    for (const x of [-L / 2 + 0.4, -0.9, 0.9, L / 2 - 0.4]) box(0.12, 1.1, 0.12, x, 0.55, z, WOOD_DARK);
    // bench along the rail
    box(L - 1.6, 0.1, 0.42, 0, 0.44, side * (W / 2 - 0.45), WOOD);
    box(L - 1.6, 0.5, 0.1, 0, 0.72, side * (W / 2 - 0.25), WOOD_DARK);
  }
  // bow/stern posts + cable pulley
  for (const x of [-L / 2 + 0.12, L / 2 - 0.12]) {
    box(0.2, 1.8, 0.2, x, 0.9, 0, WOOD_DARK);
    box(0.3, 0.22, 0.3, x, 1.82, 0, METAL);
  }
  // cable line (local x, slightly above the posts) — visual anchor, no collision
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L + 0.4, 6), ROPE);
  cable.rotation.z = Math.PI / 2;
  cable.position.set(0, 1.9, 0);
  group.add(cable);
  // two fenders
  for (const side of [-1, 1] as const) {
    const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 6), ROPE);
    fender.rotation.z = Math.PI / 2;
    fender.position.set(L / 2 - 0.2, -0.4, side * (W / 2 - 0.02));
    group.add(fender);
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
