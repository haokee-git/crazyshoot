import * as THREE from 'three';
import type { InteriorDecorPlane } from './interior-types';
import { interiorUrl, type InteriorTextureName } from '../../content/materials/interiors';

const KIND_TEXTURE: Record<InteriorDecorPlane['kind'], InteriorTextureName> = {
  rug: 'rug',
  art: 'wall-art',
  map: 'wall-map',
  sign: 'industrial-sign',
};

interface Quad {
  position: number[];
  normal: number[];
  uv: number[];
  index: number[];
}

function quad(plane: InteriorDecorPlane, out: Quad) {
  const { kind, x, y, z, w, h, yaw } = plane;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const hx = w / 2;
  const hy = h / 2;
  const base = out.position.length / 3;
  if (kind === 'rug') {
    // Horizontal patch lying on the floor.
    const ax = cos;
    const az = -sin;
    const bx = sin;
    const bz = cos;
    out.position.push(
      x - ax * hx - bx * hy, y, z - az * hx - bz * hy,
      x + ax * hx - bx * hy, y, z + az * hx - bz * hy,
      x + ax * hx + bx * hy, y, z + az * hx + bz * hy,
      x - ax * hx + bx * hy, y, z - az * hx + bz * hy,
    );
    out.normal.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    out.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
  } else {
    // Vertical plane hung on a wall, facing into the room.
    const ax = cos;
    const az = -sin;
    out.position.push(
      x - ax * hx, y - hy, z - az * hx,
      x + ax * hx, y - hy, z + az * hx,
      x + ax * hx, y + hy, z + az * hx,
      x - ax * hx, y + hy, z - az * hx,
    );
    const nx = sin;
    const nz = cos;
    out.normal.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
    out.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
  }
  out.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * Thin, non-colliding interior decoration: rugs, painted wall art, wall maps
 * and industrial safety signs. One merged mesh per texture keeps the draw
 * calls bounded. These planes are deliberately absent from detailBoxes so
 * they never block movement, bullets or navigation.
 */
export function renderInteriorDecor(planes: InteriorDecorPlane[], manager?: THREE.LoadingManager): THREE.Group {
  const group = new THREE.Group();
  group.name = 'interior-decor';
  if (!planes.length) {
    group.userData.ready = Promise.resolve();
    return group;
  }
  const kinds = [...new Set(planes.map((p) => p.kind))];
  const loader = new THREE.TextureLoader(manager);
  const ready = Promise.all(
    kinds.map(async (kind) => {
      const texture = await loader.loadAsync(interiorUrl(KIND_TEXTURE[kind]));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestMipmapNearestFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 4;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      return [kind, texture] as const;
    }),
  ).then((loaded) => {
    const textures = new Map(loaded);
    for (const kind of kinds) {
      const draws = planes.filter((p) => p.kind === kind);
      if (!draws.length) continue;
      const data: Quad = { position: [], normal: [], uv: [], index: [] };
      for (const plane of draws) quad(plane, data);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
      geometry.setIndex(data.index);
      geometry.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({
        map: textures.get(kind) ?? null,
        roughness: 0.94,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `interior-decor-${kind}`;
      mesh.frustumCulled = true;
      group.add(mesh);
    }
    group.userData.ready = Promise.resolve();
  });
  group.userData.ready = ready;
  return group;
}
