import { buildMapArena } from '../game/world/map-arena';
import manifest from '../game/core/asset-manifest.json';
import * as THREE from 'three';
import type { CoverKind, MapDef } from '../maps/types';

const C = {
  concrete: 0x747a75, asphalt: 0x414a49, gravel: 0x6c6c61, grass: 0x59684f, dirt: 0x665a49,
  rubble: 0x77736a, sand: 0x8f866e, water: 0x244956, stone: 0x777b75, wood: 0x6b5540,
  building: 0x8b8d84, buildingDark: 0x6d7069, roof: 0x4a504c, roofLight: 0x5c625b,
  container: [0x8a5d3f, 0x456c72, 0x5f6b4b, 0x7e4b43, 0x58625e],
  sandbag: 0x928a70, barrier: 0x8b8d85, tree: 0x4e6248, trunk: 0x5a4a38,
  blue: 0x4aa8ff, orange: 0xff7a3d, neutral: 0x9aa7a2, dark: 0x1b2223,
};

let texLoader = new THREE.TextureLoader();
let textureRes=32;
let gameplay=false;
const textureUrl=(name:string)=>{const path=`/textures/${textureRes}/${name}.png`;return manifest[textureRes===128?'64':String(textureRes) as '32'|'64'].includes(path)?path:`/textures/32/${name}.png`;};
let buildHeightAt: ((x: number, z: number) => number) | undefined;
const textures = new Map<string, THREE.Texture>();
function tex(name: string, repeat = 2) {
  const key = `${name}:${repeat}`;
  let t = textures.get(key);
  if (!t) {
    t = texLoader.load(textureUrl(name));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    textures.set(key, t);
  }
  return t;
}
function texForColor(color: number): string | null {
  if (color === C.building || color === C.buildingDark) return 'concrete_wall';
  if (color === C.roof || color === C.roofLight) return 'roof_tile';
  if (color === C.water) return null;
  if (color === C.asphalt) return 'asphalt_clean';
  if (color === C.concrete) return 'concrete_clean';
  if (color === C.grass) return 'grass_dirt';
  if (color === C.dirt || color === C.gravel) return 'dirt';
  if (color === C.rubble || color === C.sand) return 'concrete_wall';
  if (color === C.wood) return 'wood_planks';
  if (color === C.sandbag) return 'sandbags';
  if (color === C.barrier) return 'concrete_wall';
  if (color === C.tree) return 'foliage';
  if (color === C.trunk) return 'wood_planks';
  if (color === 0x526b4c) return 'foliage';
  if (color === C.stone) return 'rock';
  if (color === 0x5b4b3f) return 'steel_rust';
  if (C.container.includes(color)) return color === 0x456c72 ? 'container_blue' : color === 0x5f6b4b ? 'container_olive' : color === 0x7e4b43 ? 'container_rust' : 'container_red';
  if (color === C.blue || color === C.orange || color === C.neutral || color === C.dark) return null;
  return null;
}
const mat = (color: number, opacity = 1) => {
  const name = opacity < 1 ? null : texForColor(color);
  return new THREE.MeshLambertMaterial({ color: name ? 0xffffff : color, flatShading: true, transparent: opacity < 1, opacity, map: name ? tex(name, name.startsWith('container') ? 1 : 2) : null });
};
const tileMats = new Map<string, THREE.MeshLambertMaterial>();
function tiledMat(name: string, rx: number, ry: number) {
  const key = `${name}:${rx}:${ry}`;
  let m = tileMats.get(key);
  if (!m) {
    const t = texLoader.load(textureUrl(name));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 16;
    m = new THREE.MeshLambertMaterial({ map: t, color: name.startsWith('gen_') ? 0xdedfd8 : 0xffffff, flatShading: true });
    tileMats.set(key, m);
  }
  return m;
}
const box = (parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, rot = 0, flatTop = false, texOverride?: string) => {
  const name = texOverride ?? texForColor(color);
  const geo = new THREE.BoxGeometry(w, h, d);
  let mesh: THREE.Mesh;
  if (!name) {
    mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  } else {
    const tile = name.startsWith('gen_metal') ? 4.0
      : name.startsWith('gen_brick') ? 3.0
      : name.startsWith('gen_wall') ? 3.0
      : name.startsWith('gen_surf') ? 3.0
      : 2.6;
    const rep = (a: number, b: number): [number, number] => [
      Math.max(1, Math.min(32, Math.round(a / tile))),
      Math.max(1, Math.min(32, Math.round(b / tile))),
    ];
    const simple = !flatTop && ((w < 0.75 || h < 0.75 || d < 0.75) || (w < 2.2 && h < 2.2 && d < 2.2));
    if (simple) {
      const [r] = rep(Math.max(w, h, d), Math.max(w, h, d));
      mesh = new THREE.Mesh(geo, tiledMat(name, r, r));
    } else {
      const [rx, ry] = rep(d, h);
      const [sx, sy] = rep(w, d);
      const [fx, fy] = rep(w, h);
      const side = tiledMat(name, rx, ry);
      const top = flatTop ? new THREE.MeshLambertMaterial({ color, flatShading: true }) : tiledMat(name, sx, sy);
      const front = tiledMat(name, fx, fy);
      mesh = new THREE.Mesh(geo, [side, side, top, top, front, front]);
    }
  }
  mesh.position.set(x, y, z);
  mesh.rotation.y = rot;
  parent.add(mesh);
  return mesh;
};

const groundMats = new Map<string, THREE.MeshLambertMaterial>();
function groundMat(name: string) {
  let m = groundMats.get(name);
  if (!m) {
    const t = texLoader.load(textureUrl(name));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 1);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 16;
    m = new THREE.MeshLambertMaterial({ map: t, color: 0xffffff, side: THREE.DoubleSide });
    groundMats.set(name, m);
  }
  return m;
}
function terrainTexture(kind: string): string | null {
  if (kind === 'water') return null;
  if (kind === 'asphalt') return 'gen_surf_05';
  if (kind === 'grass') return 'gen_surf_10';
  if (kind === 'dirt' || kind === 'sand') return 'gen_surf_09';
  if (kind === 'gravel') return 'gen_surf_08';
  if (kind === 'rubble') return 'gen_surf_07';
  return 'gen_surf_07';
}
function glowBox(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, rot = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  m.rotation.y = rot;
  parent.add(m);
  return m;
}

function poly(parent: THREE.Object3D, pts: [number, number][], color: number, y: number, opacity = 1, texture: string | null = null) {
  const shape = new THREE.Shape();
  pts.forEach(([x, z], i) => i ? shape.lineTo(x, z) : shape.moveTo(x, z));
  const material = texture
    ? groundMat(texture)
    : new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, transparent: opacity < 1, opacity, flatShading: true });
  const geo = new THREE.ShapeGeometry(shape);
  if (texture) {
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getY(i) / 4);
    uv.needsUpdate = true;
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = y;
  parent.add(mesh);
  return mesh;
}

function label(parent: THREE.Object3D, text: string, x: number, z: number, color = '#9df6c2', size = 12) {
  if(gameplay)return;
  // Floating sky label: thin vertical green leader line, text on transparent sky.
  const c = document.createElement('canvas');
  const fontPx = 54;
  const pad = 30;
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.font = `700 ${fontPx}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",monospace`;
  const measured = Math.ceil(g.measureText(text).width);
  const width = Math.min(1024, Math.max(256, measured + pad * 2));
  c.width = width;
  const g2 = c.getContext('2d')!;
  g2.clearRect(0, 0, width, c.height);
  g2.font = `700 ${fontPx}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",monospace`;
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.fillStyle = '#2f9a7a';
  g2.fillText(text, width / 2, c.height / 2 + 2);
  // short green accent underline under the name
  const tw = Math.max(34, measured * 0.55);
  g2.strokeStyle = 'rgba(47,154,122,.75)';
  g2.lineWidth = 3;
  g2.beginPath();
  g2.moveTo(width / 2 - tw / 2, c.height - 16);
  g2.lineTo(width / 2 + tw / 2, c.height - 16);
  g2.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
    fog: false,
    toneMapped: false,
  }));
  let hash = 7;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 997;
  const top = 15 + (hash % 13) + Math.min(2, size / 10);
  spr.position.set(x, top, z);
  const h = 0.044;
  spr.scale.set(h * (width / c.height), h, 1);
  spr.renderOrder = 20;
  parent.add(spr);

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.25, z),
      new THREE.Vector3(x, top - 1.0, z),
    ]),
    new THREE.LineBasicMaterial({ color: 0x2f9a7a, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  line.renderOrder = 19;
  parent.add(line);
  spr.userData.labelLine = line;
  line.userData.labelSprite = spr;
}

function road(parent: THREE.Object3D, a: [number, number], b: [number, number], width: number, texture: string) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const map = tex(texture, 1).clone();
  map.needsUpdate = true;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 1);
  if (buildHeightAt) {
    // follow the voxel surface with a subdivided ribbon instead of a flat plane
    const steps = Math.max(2, Math.ceil(len / 2));
    const px = -dz / Math.max(0.001, len), pz = dx / Math.max(0.001, len);
    const pos: number[] = [], uv: number[] = [], ind: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = a[0] + dx * t, cz = a[1] + dz * t;
      const lx = cx - px * width / 2, lz = cz - pz * width / 2;
      const rx = cx + px * width / 2, rz = cz + pz * width / 2;
      pos.push(lx, (buildHeightAt(lx, lz) ?? 0) + 0.08, lz);
      pos.push(rx, (buildHeightAt(rx, rz) ?? 0) + 0.08, rz);
      uv.push(0, t * len / 4, 1, t * len / 4);
      if (i < steps) {
        const k = i * 2;
        ind.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(ind);
    const flatNormals: number[] = [];
    for (let i = 0; i < pos.length; i += 3) flatNormals.push(0, 1, 0);
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(flatNormals, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map, color: 0xbfc3b8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }));
    parent.add(mesh);
    return;
  }
  map.repeat.set(Math.max(1, width / 4), Math.max(1, len / 4));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len), new THREE.MeshLambertMaterial({ map, color: 0xbfc3b8 }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(dx, dz);
  m.position.set((a[0] + b[0]) / 2, 0.035, (a[1] + b[1]) / 2);
  parent.add(m);
  if (width >= 8 && (texture === 'asphalt_clean' || texture === 'gen_surf_05')) {
    const ang = -Math.atan2(dx, dz);
    const n = Math.max(1, Math.floor(len / 9));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 2.8), new THREE.MeshBasicMaterial({ color: 0xcfc7a8, transparent: true, opacity: 0.22, depthWrite: false }));
      mark.rotation.x = -Math.PI / 2;
      mark.rotation.z = ang;
      mark.position.set(a[0] + dx * t, 0.052, a[1] + dz * t);
      parent.add(mark);
    }
    let seed = Math.round(Math.abs(a[0] * 19 + a[1] * 31 + b[0] * 7 + b[1]));
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 3; i++) {
      const t = 0.15 + rnd() * 0.7;
      const stain = new THREE.Mesh(new THREE.CircleGeometry(0.8 + rnd() * 1.5, 12), new THREE.MeshBasicMaterial({ color: 0x1a211f, transparent: true, opacity: 0.14, depthWrite: false }));
      stain.rotation.x = -Math.PI / 2;
      stain.scale.y = 0.55 + rnd() * 0.5;
      stain.position.set(a[0] + dx * t + (rnd() - 0.5) * width * 0.5, 0.048, a[1] + dz * t + (rnd() - 0.5) * width * 0.5);
      parent.add(stain);
    }
  }
}

function baseHeightAt(x: number, z: number) {
  return buildHeightAt?.(x, z) ?? 0;
}

function terrainColor(kind: string) {
  return (C as any)[kind] ?? C.concrete;
}

function hashString(s: string) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003;
  return h;
}

function pickTex(key: string, pool: string[]) {
  return pool[hashString(key) % pool.length];
}

const GEN_METAL = Array.from({ length: 16 }, (_, i) => `gen_metal_${String(i + 1).padStart(2, '0')}`);
const GEN_WALL = Array.from({ length: 16 }, (_, i) => `gen_wall_${String(i + 1).padStart(2, '0')}`);
const GEN_BRICK = Array.from({ length: 16 }, (_, i) => `gen_brick_${String(i + 1).padStart(2, '0')}`);
const GEN_SURF = Array.from({ length: 16 }, (_, i) => `gen_surf_${String(i + 1).padStart(2, '0')}`);
const GEN_ROOF = [...GEN_METAL.slice(14), 'gen_surf_12', 'gen_surf_13', 'gen_wall_16', 'gen_metal_03'];
const GEN_WOOD = GEN_SURF.slice(0, 4);

function wallTextureFor(b: MapDef['buildings'][number]) {
  const id = (b.id + ' ' + b.name).toLowerCase();
  if (/warehouse|dock|pier|hangar|depot/.test(id)) {
    return pickTex(b.id, [...GEN_METAL.slice(0, 6), 'gen_wall_01', 'gen_wall_06', 'gen_wall_11', 'gen_wall_16', 'gen_metal_11', 'gen_metal_12']);
  }
  if (/pavilion|orchard|flower|barn|house|gate/.test(id)) {
    return pickTex(b.id, [...GEN_BRICK, 'gen_wall_04', 'gen_wall_05', 'gen_wall_14', 'gen_wall_08', ...GEN_WOOD]);
  }
  if (/office|admin|control|terminal|tower/.test(id)) {
    return pickTex(b.id, ['gen_wall_04', 'gen_wall_05', 'gen_wall_07', 'gen_wall_08', 'gen_wall_14', 'gen_brick_03', 'gen_brick_04', 'gen_brick_13', 'gen_brick_14']);
  }
  if (/shed|workshop|garage|yard|utility/.test(id)) {
    return pickTex(b.id, ['gen_metal_03', 'gen_metal_04', 'gen_metal_05', 'gen_wall_15', ...GEN_WOOD]);
  }
  return pickTex(b.id, ['gen_wall_01', 'gen_wall_06', 'gen_wall_07', 'gen_wall_10', 'gen_metal_01', 'gen_metal_02', 'gen_metal_04', ...GEN_BRICK.slice(0, 4)]);
}

function roofTextureFor(b: MapDef['buildings'][number]) {
  const id = (b.id + ' ' + b.name).toLowerCase();
  if (/warehouse|dock|pier|hangar|depot|shed/.test(id)) return pickTex(b.id, GEN_ROOF);
  return pickTex(b.id, ['gen_surf_13', 'gen_surf_12', 'gen_metal_15', 'gen_metal_16', 'gen_wall_16']);
}

function roofPanel(parent: THREE.Object3D, w: number, len: number, tex: string, x: number, y: number, z: number, rx: number) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.16, len),
    tiledMat(tex, Math.max(1, Math.min(32, Math.round(w / 3))), Math.max(1, Math.min(32, Math.round(len / 3)))),
  );
  m.position.set(x, y, z);
  m.rotation.x = rx;
  parent.add(m);
  return m;
}

function facadeDetails(parent: THREE.Object3D, b: MapDef['buildings'][number], w: number, d: number, h: number, cx: number, cz: number, glassTex: string) {
  const longX = w >= d;
  const span = longX ? w : d;
  const count = Math.max(2, Math.min(5, Math.floor(span / 7)));
  const isWarehouse = /warehouse|dock|pier|hangar|depot/i.test(b.id);
  const isOffice = /office|admin|control|terminal/i.test(b.id);
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : (i + 0.5) / count;
      const along = (t - 0.5) * (span - 3.5);
      const y = isWarehouse ? h - 1.25 : Math.min(h - 1.2, 2.05);
      const x = longX ? cx + along : cx + side * (w / 2 + 0.025);
      const z = longX ? cz + side * (d / 2 + 0.025) : cz + along;
      const ww = longX ? 1.6 : 0.06;
      const dd = longX ? 0.06 : 1.6;
      box(parent, ww, isWarehouse ? 0.65 : 1.05, dd, 0x182526, x, y, z, 0, false, glassTex);
      // pale frame
      box(parent, longX ? 1.75 : 0.10, isWarehouse ? 0.78 : 1.18, longX ? 0.10 : 1.75, 0x5d6863, x, y, z);
    }
  }
  // doors / loading bays on the south facade
  if (isWarehouse) {
    const bays = w > 24 ? 2 : 1;
    for (let i = 0; i < bays; i++) {
      const x = cx + (bays === 1 ? 0 : (i === 0 ? -w * 0.23 : w * 0.23));
      box(parent, 3.6, 3.5, 0.12, 0x5b625c, x, 1.75, cz - d / 2 - 0.05, 0, false, 'gen_surf_14');
      box(parent, 3.9, 0.22, 0.2, 0x2c3431, x, 3.55, cz - d / 2 - 0.08);
    }
  } else if (isOffice) {
    box(parent, 1.5, 2.35, 0.12, 0x2b3330, cx - w * 0.22, 1.18, cz - d / 2 - 0.04, 0, false, 'gen_surf_15');
    box(parent, 1.8, 0.16, 0.5, 0x4c5650, cx - w * 0.22, 2.4, cz - d / 2 - 0.12);
  }
  // roof equipment
  if (h > 3) {
    const n = w > 20 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = cx + (n === 1 ? 0 : (i === 0 ? -w * 0.22 : w * 0.22));
      box(parent, 1.4, 0.7, 1.1, 0x8e948a, x, h + 0.4, cz + d * 0.16);
      box(parent, 0.9, 0.18, 0.7, 0x2d3532, x, h + 0.82, cz + d * 0.16);
    }
    box(parent, 0.3, 1.1, 0.3, 0x6f776f, cx + w * 0.36, h + 0.55, cz - d * 0.25);
  }
}

function building(parent: THREE.Object3D, b: MapDef['buildings'][number]) {
  const xs = b.polygon.map((p) => p[0]), zs = b.polygon.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const w = maxX - minX, d = maxZ - minZ, h = b.height;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const wallTex = wallTextureFor(b);
  const roofTex = roofTextureFor(b);
  const glassTex = 'glass_strip';
  if(gameplay&&b.enterable){
    box(parent,w,.18,d,C.concrete,cx,.09,cz);const gap=4,part=(w-gap)/2;
    for(const z of [minZ,maxZ]){box(parent,part,h,.4,C.building,minX+part/2,h/2,z);box(parent,part,h,.4,C.building,maxX-part/2,h/2,z);box(parent,gap,h-2.7,.4,C.building,cx,2.7+(h-2.7)/2,z);}
    for(const x of [minX,maxX])box(parent,.4,h,d,C.building,x,h/2,cz);
    box(parent,w+.6,.25,d+.6,C.roof,cx,h,cz);return;
  }
  // concrete plinth / apron + buried foundation that becomes a retaining wall on slopes
  box(parent, w + 1.1, 8, d + 1.1, 0x6c7068, cx, -3.9, cz, 0, false, 'concrete_panel');
  box(parent, w + 0.6, 0.28, d + 0.6, 0x777d74, cx, 0.14, cz, 0, false, 'concrete_panel');
  if (b.roof === 'open') {
    // open loading shed: real columns, trusses, back wall, fascia and lights
    box(parent, w, 0.22, d, 0x858a80, cx, 0.22, cz, 0, false, 'concrete_panel');
    const colsX = Math.max(2, Math.round(w / 6));
    const colsZ = Math.max(2, Math.round(d / 6));
    for (let ix = 0; ix <= colsX; ix++) {
      for (let iz = 0; iz <= colsZ; iz++) {
        const x = minX + 0.6 + (w - 1.2) * (ix / colsX);
        const z = minZ + 0.6 + (d - 1.2) * (iz / colsZ);
        // only perimeter columns; keep the middle open
        if (ix > 0 && ix < colsX && iz > 0 && iz < colsZ) continue;
        box(parent, 0.48, h, 0.48, 0x4b5552, x, h / 2, z, 0, false, 'metal_siding_rust');
      }
    }
    // back wall (south) + short side walls
    box(parent, w, h * 0.82, 0.38, 0x8b8f85, cx, h * 0.41, minZ + 0.25, 0, false, wallTex);
    for (const side of [minX + 0.25, maxX - 0.25]) {
      box(parent, 0.38, 1.15, d * 0.8, 0x8b8f85, side, 0.575, cz, 0, false, wallTex);
    }
    // roof + trusses + fascia
    box(parent, w + 0.8, 0.24, d + 0.8, 0x8d938a, cx, h + 0.12, cz, 0, false, roofTex);
    glowBox(parent, w - 0.6, 0.05, d - 0.6, 0x777f74, cx, h - 0.10, cz);
    for (let iz = 1; iz < colsZ; iz++) {
      const z = minZ + (d) * (iz / colsZ);
      box(parent, w - 1.0, 0.22, 0.3, 0x3f4946, cx, h - 0.18, z, 0, false, 'metal_siding_rust');
    }
    box(parent, w + 1.0, 0.42, 0.5, 0x6d756d, cx, h + 0.05, minZ - 0.15);
    box(parent, w + 1.0, 0.42, 0.5, 0x6d756d, cx, h + 0.05, maxZ + 0.15);
    for (let ix = 1; ix < colsX; ix++) {
      const x = minX + w * (ix / colsX);
      box(parent, 0.5, 0.42, d + 1.0, 0x6d756d, x, h + 0.05, cz);
    }
    // warm hanging work lights
    for (let ix = 1; ix < colsX; ix++) {
      const x = minX + w * (ix / colsX);
      glowBox(parent, 1.1, 0.08, 0.32, 0xffefc8, x, h - 0.24, cz);
    }
    // open shed still gets signage label
  } else {
    box(parent, w, h, d, 0xffffff, cx, h / 2, cz, 0, false, wallTex);
    const rise = b.roof === 'gable' ? Math.min(3.2, d * 0.22) : 0;
    if (b.roof === 'gable') {
      const half = d / 2, len = Math.hypot(half, rise) + 0.45;
      const ang = Math.atan2(rise, half);
      roofPanel(parent, w + 0.7, len, roofTex, cx, h + rise / 2 + 0.04, cz + d / 4, ang);
      roofPanel(parent, w + 0.7, len, roofTex, cx, h + rise / 2 + 0.04, cz - d / 4, -ang);
      box(parent, w + 0.9, 0.18, 0.28, 0x3b423d, cx, h + rise + 0.06, cz);
    } else if (b.roof === 'sawtooth') {
      // industrial monitor roof: flat deck + raised skylight monitors (reads better than open teeth)
      box(parent, w + 0.55, 0.24, d + 0.55, 0x8a9086, cx, h + 0.12, cz, 0, false, roofTex);
      const monitors = d > 24 ? 2 : 1;
      for (let i = 0; i < monitors; i++) {
        const mz = cz + (monitors === 1 ? 0 : (i === 0 ? -d * 0.2 : d * 0.2));
        box(parent, w * 0.66, 0.75, d * 0.11, 0x7f867d, cx, h + 0.55, mz, 0, false, roofTex);
        box(parent, w * 0.64, 0.42, 0.06, 0x182526, cx, h + 0.55, mz - d * 0.055, 0, false, glassTex);
        box(parent, w * 0.64, 0.42, 0.06, 0x182526, cx, h + 0.55, mz + d * 0.055, 0, false, glassTex);
        box(parent, w * 0.70, 0.12, d * 0.13, 0x6e766d, cx, h + 0.96, mz);
      }
      box(parent, w + 0.7, 0.55, 0.3, 0x7d847b, cx, h + 0.35, cz - d / 2 - 0.15);
      box(parent, w + 0.7, 0.55, 0.3, 0x7d847b, cx, h + 0.35, cz + d / 2 + 0.15);
    } else {
      box(parent, w + 0.55, 0.24, d + 0.55, 0x8a9086, cx, h + 0.12, cz, 0, false, roofTex);
      // parapet
      box(parent, w + 0.7, 0.55, 0.3, 0x7d847b, cx, h + 0.35, cz - d / 2 - 0.15);
      box(parent, w + 0.7, 0.55, 0.3, 0x7d847b, cx, h + 0.35, cz + d / 2 + 0.15);
      box(parent, 0.3, 0.55, d + 0.7, 0x7d847b, cx - w / 2 - 0.15, h + 0.35, cz);
      box(parent, 0.3, 0.55, d + 0.7, 0x7d847b, cx + w / 2 + 0.15, h + 0.35, cz);
    }
    const isWarehouse = /warehouse|dock|pier|hangar|depot/i.test(b.id);
    if (isWarehouse && w > 20 && h >= 5) {
      const cw = Math.min(12, w * 0.42);
      const cd = 4.2;
      const frontZ = cz - d / 2 - cd / 2;
      box(parent, cw + 1.2, 0.24, cd + 0.6, 0x7d857c, cx, 4.35, frontZ, 0, false, 'roof_corrugated');
      for (const sx of [-cw / 2, cw / 2]) {
        box(parent, 0.28, 4.3, 0.28, 0x4f5854, cx + sx, 2.15, frontZ - cd / 2 + 0.25, 0, false, 'metal_siding_rust');
        box(parent, 0.28, 4.3, 0.28, 0x4f5854, cx + sx, 2.15, frontZ + cd / 2 - 0.25, 0, false, 'metal_siding_rust');
      }
      glowBox(parent, cw * 0.55, 0.06, 0.22, 0xffe9b8, cx, 4.24, frontZ);
      // dock bumpers
      for (const sx of [-w * 0.28, 0, w * 0.28]) {
        box(parent, 0.5, 0.45, 0.25, 0x222a27, cx + sx, 0.55, cz - d / 2 - 0.12);
      }
    }
    // corner trim
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      box(parent, 0.28, h, 0.28, 0x565f58, cx + sx * (w / 2 - 0.12), h / 2, cz + sz * (d / 2 - 0.12), 0, false, 'concrete_panel');
    }
    facadeDetails(parent, b, w, d, h, cx, cz, glassTex);
  }
  if (b.label !== false && b.labelAt && b.height >= 5) label(parent, b.name, b.labelAt[0], b.labelAt[1], '#2f9a7a', 8);
}

function cover(scene: THREE.Object3D, c: MapDef['covers'][number]) {
  const parent = new THREE.Group();
  parent.position.y = buildHeightAt?.(c.x, c.y) ?? 0;
  scene.add(parent);
  const x = c.x, z = c.y, w = c.w, d = c.d, h = c.height ?? (c.kind === 'container' ? 2.8 : c.kind === 'wall' ? 1.4 : c.kind === 'crate' ? 1.2 : 1.1);
  const rot = ((c.rot ?? 0) * Math.PI) / 180;
  const kind: CoverKind = c.kind;
  let color = c.color ? new THREE.Color(c.color).getHex() : C.container[0];
  if (kind === 'sandbag') color = C.sandbag;
  else if (kind === 'wall' || kind === 'barrier') color = C.barrier;
  else if (kind === 'tree') color = C.tree;
  else if (kind === 'rock') color = C.stone;
  else if (kind === 'hedge') color = 0x526b4c;
  else if (kind === 'wreck') color = 0x5b4b3f;
  else if (kind === 'pump') color = 0xb63d30;
  else if (kind === 'dumpster') color = 0x355a48;
  else if (kind === 'container') color = c.color ? color : C.container[Math.abs(Math.floor(x + z)) % C.container.length];
  if (kind === 'tree') {
    box(parent, 0.6, 3.2, 0.6, C.trunk, x, 1.6, z);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(w * 0.55, 0), mat(C.tree));
    crown.position.set(x, 3.6, z); parent.add(crown);
    return;
  }
  if (kind === 'rock') {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(w * 0.5, 0), mat(color));
    m.position.set(x, w * 0.35, z); m.scale.y = 0.7; parent.add(m); return;
  }
  if (kind === 'silo' || kind === 'fuel_tank') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.5, h, 12), mat(kind === 'fuel_tank' ? 0x6f756c : 0x8a8b80));
    c.position.set(x, h / 2, z); parent.add(c);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.47, w * 0.47, 0.25, 12), mat(0x4e5652));
    top.position.set(x, h + 0.12, z); parent.add(top);
    return;
  }
  if (kind === 'planter') {
    box(parent, w, 0.7, d, 0x777768, x, 0.35, z, rot);
    box(parent, w * 0.86, 0.6, d * 0.86, C.tree, x, 2.6, z, rot);
    return;
  }
  if (kind === 'statue') {
    box(parent, w, 1.0, d, 0x8b8b80, x, 0.5, z, rot);
    box(parent, w * 0.35, 2.4, d * 0.35, 0x6f766f, x, 2.2, z, rot);
    return;
  }
  if (kind === 'trench') {
    box(parent, w, 0.45, d, 0x3c3a31, x, 0.22, z, rot);
    return;
  }
  if (kind === 'wreck') {
    // rusted-out car: low body, cabin, wheels
    box(parent, w * 0.92, h * 0.48, d * 0.9, 0x7b4a38, x, h * 0.42, z, rot, false, 'metal_siding_rust');
    box(parent, w * 0.52, h * 0.62, d * 0.78, 0x6f4032, x - w * 0.05, h * 0.72, z, rot, false, 'metal_siding_rust');
    box(parent, w * 0.46, h * 0.26, d * 0.70, 0x18211f, x - w * 0.05, h * 0.84, z, rot, false, 'glass_strip');
    for (const sx of [-w * 0.31, w * 0.31]) {
      for (const sz of [-d * 0.34, d * 0.34]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.28, h * 0.28, 0.22, 10), new THREE.MeshLambertMaterial({ color: 0x1c2222 }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x + sx, h * 0.27, z + sz);
        parent.add(wheel);
      }
    }
    return;
  }
  if (kind === 'dumpster') {
    box(parent, w, h * 0.82, d, 0x355a48, x, h * 0.41, z, rot, false, 'gen_metal_09');
    box(parent, w * 1.04, 0.12, d * 1.04, 0x243b30, x, h * 0.84, z, rot);
    box(parent, w * 0.32, 0.10, d * 0.84, 0x22302b, x, h * 0.90, z, rot);
    for (const sx of [-w * 0.32, w * 0.32]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.10, 8), new THREE.MeshLambertMaterial({ color: 0x171d1b }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x + sx, 0.12, z + d * 0.44);
      parent.add(wheel);
    }
    return;
  }
  if (kind === 'pump') {
    box(parent, w, 0.22, d, 0x6e746b, x, 0.11, z, rot);
    box(parent, w * 0.62, 1.25, d * 0.62, 0xb63d30, x, 0.78, z, rot, false, 'gen_metal_03');
    box(parent, w * 0.56, 0.38, 0.08, 0x16211f, x, 1.03, z - d * 0.32, rot, false, 'glass_strip');
    box(parent, 0.10, 0.85, 0.10, 0x252b29, x + w * 0.38, 0.62, z, rot);
    box(parent, 0.05, 0.05, 0.34, 0x252b29, x + w * 0.38, 0.30, z + d * 0.16, rot);
    box(parent, w * 0.7, 0.12, d * 0.7, 0xe2d9c2, x, 1.44, z, rot);
    return;
  }
  if (kind === 'sandbag') {
    const seg = 2.3;
    const n = Math.max(1, Math.ceil(w / seg));
    const step = w / n;
    for (let i = 0; i < n; i++) {
      const off = (i + 0.5) * step - w / 2;
      const px = x + Math.cos(rot) * off;
      const pz = z - Math.sin(rot) * off;
      box(parent, step * 0.97, 0.35, d, color, px, 0.18, pz, rot, true);
      for (let j = 0; j < 3; j++) {
        box(parent, step * 0.90, 0.31, d * 0.8, 0x7d765f, px, 0.54 + j * 0.3, pz, rot, true);
      }
    }
    return;
  }
  const coverTex = kind === 'crate' ? 'wood_planks_old'
    : kind === 'wall' ? pickTex(c.id ?? `${x},${z}`, [...GEN_BRICK, 'gen_wall_01', 'gen_wall_06'])
    : kind === 'barrier' ? 'gen_wall_13'
    : undefined;
  box(parent, w, h, d, color, x, h / 2, z, rot, false, coverTex);
  if (kind === 'barrier') {
    box(parent, w * 0.98, 0.22, d * 1.02, 0xd6a51c, x, h * 0.72, z, rot, false, 'warning_stripe');
  }
  if (kind === 'container') {
    for (let i = 0; i < 4; i++) box(parent, w * 0.98, 0.06, 0.10, 0x2f3531, x, 0.45 + i * 0.55, z, rot);
  }
}

function prop(scene: THREE.Object3D, p: MapDef['props'][number]) {
  const parent = new THREE.Group();
  parent.position.y = buildHeightAt?.(p.x, p.y) ?? 0;
  scene.add(parent);
  if (p.kind === 'crane') {
    const x = p.x, z = p.y, w = p.w ?? 40, d = p.d ?? 12, rot = ((p.rot ?? 0) * Math.PI) / 180, h = 18;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
    const beam = (a: THREE.Vector3, b: THREE.Vector3, thick: number, color: number, tex?: string) => {
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 0.01) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, len), tex ? tiledMat(tex, 1, Math.max(1, Math.round(len / 2))) : new THREE.MeshLambertMaterial({ color, flatShading: true }));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      g.add(m);
    };
    for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) {
      box(g, 1.1, h, 1.1, 0x5c6662, sx, h / 2, sz, 0, false, 'metal_siding_rust');
    }
    // gantry bracing: horizontal rings, high enough not to block the quay
    for (const y of [6, 12]) {
      for (const sz of [-d / 2, d / 2]) box(g, w, 0.22, 0.22, 0x6f7872, 0, y, sz, 0, false, 'metal_siding_rust');
      for (const sx of [-w / 2, w / 2]) box(g, 0.22, 0.22, d, 0x6f7872, sx, y, 0);
    }
    // short diagonal braces between adjacent legs (never across the whole span)
    for (let i = 0; i < 4; i++) {
      const x0 = -w / 2 + (i / 4) * w;
      const x1 = -w / 2 + ((i + 1) / 4) * w;
      for (const sz of [-d / 2, d / 2]) {
        beam(new THREE.Vector3(x0, 6, sz), new THREE.Vector3(x1, 12, sz), 0.16, 0x7b847d);
      }
    }
    // top girder
    for (const sz of [-d / 2, d / 2]) box(g, w + 4, 1.1, 0.9, 0x78817a, 0, h, sz, 0, false, 'metal_siding_blue');
    box(g, 1.0, 0.9, d + 2, 0x78817a, -w / 2 - 1, h, 0);
    box(g, 1.0, 0.9, d + 2, 0x78817a, w / 2 + 1, h, 0);
    for (let i = 0; i < 7; i++) {
      const x0 = -w / 2 + (i / 6) * w;
      beam(new THREE.Vector3(x0, h, -d / 2), new THREE.Vector3(x0 + w / 12, h, d / 2), 0.22, 0x9aa39b);
      beam(new THREE.Vector3(x0, h, d / 2), new THREE.Vector3(x0 + w / 12, h, -d / 2), 0.22, 0x9aa39b);
    }
    // trolley + cab + hanging hook
    box(g, 3.2, 2.2, 4.2, 0x4c5854, 0, h - 1.4, 0);
    box(g, 2.2, 1.5, 2.6, 0x9a7d45, 0, h - 2.8, 0);
    box(g, 0.16, 7, 0.16, 0x2b3230, 0, h / 2 + 2, 0);
    box(g, 1.2, 1.0, 1.2, 0x3f4744, 0, 2.2, 0);
    label(parent, p.label ?? 'CRANE', x, z, '#2f9a7a', 7);
    } else if (p.kind === 'bridge_gap') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w ?? 28, 1.2, p.d ?? 8), mat(C.water));
    m.position.set(p.x, 0.25, p.y); m.rotation.y = ((p.rot ?? 0) * Math.PI) / 180; parent.add(m);
    box(parent, p.w ?? 28, 0.6, 0.8, 0x555b53, p.x, 0.45, p.y - (p.d ?? 8) / 2);
    box(parent, p.w ?? 28, 0.6, 0.8, 0x555b53, p.x, 0.45, p.y + (p.d ?? 8) / 2);
    label(parent, p.label ?? 'BROKEN BRIDGE', p.x, p.y, '#ffb454', 6);
  } else if (p.kind === 'tower') {
    const w = p.w ?? 10, d = p.d ?? 10, h = 22;
    for (const [sx, sz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
      box(parent, 0.8, h, 0.8, 0x6d746d, p.x + sx, h / 2, p.y + sz);
    }
    box(parent, w + 2, 1.2, d + 2, 0x7b8279, p.x, h, p.y);
    box(parent, 3, 2.5, 3, 0x4d5651, p.x, h + 1.8, p.y);
    label(parent, p.label ?? 'TOWER', p.x, p.y, '#dce8e3', 6);
  } else if (p.kind === 'sign') {
    box(parent, 0.3, 4.5, 0.3, 0x5b6259, p.x, 2.25, p.y);
    box(parent, 5, 1.6, 0.2, 0xd2b56e, p.x, 4.0, p.y);
  } else if (p.kind === 'fountain') {
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.0, 24), mat(0x878b80));
    basin.position.set(p.x, 0.5, p.y); parent.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.2, 0.08, 24), mat(C.water));
    water.position.set(p.x, 1.03, p.y); parent.add(water);
    box(parent, 2, 2.4, 2, 0x6d746b, p.x, 2.2, p.y);
    label(parent, p.label ?? 'FOUNTAIN', p.x, p.y - 10, '#9fe0ed', 6);
  } else if (p.kind === 'gate') {
    const gx = p.w ?? 18;
    box(parent, 1.2, 7, 1.2, 0x59615a, p.x - gx / 2, 3.5, p.y);
    box(parent, 1.2, 7, 1.2, 0x59615a, p.x + gx / 2, 3.5, p.y);
    box(parent, gx + 2, 0.8, 1.2, 0x6c746b, p.x, 7, p.y);
  } else if (p.kind === 'aircraft') {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.y); g.rotation.y = ((p.rot ?? 0) * Math.PI) / 180; parent.add(g);
    box(g, 4, 3, 30, 0x8a8d84, 0, 2.0, 0);
    box(g, 42, 0.8, 6, 0x9a9c91, 0, 3.0, -1);
    box(g, 14, 0.6, 4, 0x9a9c91, 0, 2.4, -12);
    box(g, 2, 6, 3, 0x7d8178, 0, 5, 13);
    box(g, 10, 2.5, 2, 0x7d8178, 0, 5.8, 15.5);
    label(parent, p.label ?? 'AIRCRAFT', p.x, p.y - 18, '#dce8e3', 6);
  } else if (p.kind === 'radar') {
    box(parent, 1.4, 14, 1.4, 0x6e766e, p.x, 7, p.y);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xb8beb2, 0.8));
    dish.position.set(p.x, 14, p.y); dish.rotation.x = 0.9; parent.add(dish);
    label(parent, p.label ?? 'RADAR', p.x, p.y - 8, '#ffb454', 6);
  } else if (p.kind === 'gas_station') {
    const w = p.w ?? 20, d = p.d ?? 13;
    const x = p.x, z = p.y;
    // canopy
    for (const sx of [-w * 0.42, w * 0.42]) {
      for (const sz of [-d * 0.32, d * 0.32]) {
        box(parent, 0.48, 4.5, 0.48, 0x59625c, x + sx, 2.25, z + sz, 0, false, 'metal_siding_blue');
      }
    }
    box(parent, w + 1.0, 0.34, d + 1.0, 0x9a9f95, x, 4.62, z, 0, false, 'roof_corrugated');
    box(parent, w + 1.4, 0.55, 0.34, 0x1f5d4e, x, 4.45, z - d / 2 - 0.18);
    box(parent, w + 1.4, 0.55, 0.34, 0x1f5d4e, x, 4.45, z + d / 2 + 0.18);
    box(parent, 0.34, 0.55, d + 1.4, 0x1f5d4e, x - w / 2 - 0.18, 4.45, z);
    box(parent, 0.34, 0.55, d + 1.4, 0x1f5d4e, x + w / 2 + 0.18, 4.45, z);
    // lit canopy underside
    glowBox(parent, w - 0.4, 0.06, d - 0.4, 0xaeb5a9, x, 4.38, z);
    for (const sx of [-w * 0.25, w * 0.25]) glowBox(parent, 2.4, 0.06, 0.32, 0xfff1cc, x + sx, 4.34, z);
    // fuel tanks behind the kiosk
    for (let i = 0; i < 2; i++) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 4.2, 14), tiledMat('metal_siding_rust', 3, 1));
      tank.rotation.z = Math.PI / 2;
      tank.position.set(x - w * 0.32 + i * 2.2, 0.9, z + d * 0.72);
      parent.add(tank);
      for (const sx of [-1.5, 1.5]) box(parent, 0.35, 0.9, 1.3, 0x545d56, tank.position.x + sx, 0.45, tank.position.z);
    }
    // price sign
    box(parent, 0.32, 4.2, 0.32, 0x3d4742, x + w * 0.62, 2.1, z - d * 0.55);
    box(parent, 3.4, 1.5, 0.25, 0x143c33, x + w * 0.62, 4.35, z - d * 0.55);
    box(parent, 2.7, 0.16, 0.28, 0x7df0c0, x + w * 0.62, 4.7, z - d * 0.55);
    box(parent, 2.7, 0.12, 0.28, 0xd8c37a, x + w * 0.62, 4.15, z - d * 0.55);
    // bollards
    for (const sx of [-w * 0.3, -w * 0.12, w * 0.12, w * 0.3]) {
      box(parent, 0.18, 1.0, 0.18, 0xd6a51c, x + sx, 0.5, z - d * 0.5);
    }
    label(parent, p.label ?? '加油站', x, z, '#2f9a7a', 7);
  } else if (p.kind === 'barrels') {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const bx = p.x + ((i % 3) - 1) * 0.9;
      const bz = p.y + (Math.floor(i / 3) - 0.5) * 0.95;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 12), tiledMat(i % 2 ? 'gen_metal_10' : 'gen_metal_04', 1, 2));
      barrel.position.set(bx, 0.48, bz);
      parent.add(barrel);
      box(parent, 0.72, 0.06, 0.72, 0x2a302c, bx, 0.96, bz);
    }
  } else if (p.kind === 'pipes') {
    const len = p.w ?? 8;
    for (let i = 0; i < 3; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, len, 12), tiledMat('gen_metal_12', 1, Math.max(1, Math.round(len / 2))));
      pipe.rotation.z = Math.PI / 2;
      pipe.rotation.y = ((p.rot ?? 0) * Math.PI) / 180;
      pipe.position.set(p.x, 0.3 + i * 0.5, p.y + (i - 1) * 0.55);
      parent.add(pipe);
    }
  } else if (p.kind === 'pallets') {
    for (let i = 0; i < 4; i++) {
      box(parent, 2.2, 0.14, 1.25, 0x8a6b45, p.x, 0.15 + i * 0.18, p.y, ((p.rot ?? 0) * Math.PI) / 180, false, 'wood_planks_old');
      box(parent, 2.24, 0.10, 0.12, 0x5e4a33, p.x, 0.10 + i * 0.18, p.y - 0.5);
      box(parent, 2.24, 0.10, 0.12, 0x5e4a33, p.x, 0.10 + i * 0.18, p.y + 0.5);
    }
  } else if (p.kind === 'flag') {
    box(parent, 0.25, 8, 0.25, 0x8a938c, p.x, 4, p.y);
    const flag = box(parent, 4, 2.4, 0.06, p.team === 'blue' ? C.blue : C.orange, p.x + 2.1, 6.8, p.y);
    flag.rotation.y = 0.1;
  } else if (p.kind === 'lamp') {
    box(parent, 0.2, 7, 0.2, 0x39423f, p.x, 3.5, p.y);
    box(parent, 1.2, 0.25, 0.35, 0xd2b56e, p.x, 7, p.y);
  }
}

function makeGroundTexture(map: MapDef): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  // Muted, close-valued palettes: readable pixel grain without a tiled grid.
  const defs: Record<string, { base: string; tints: string[] }> = {
    docks: { base: '#565c55', tints: ['#616761', '#4d544d', '#66675c', '#50564f', '#5b574b'] },
    broken_bridge: { base: '#505c48', tints: ['#59654f', '#47523f', '#615e50', '#574d3e'] },
    garden: { base: '#8b8678', tints: ['#969082', '#7d796c', '#8c7362', '#6f6453', '#79806d'] },
    airfield: { base: '#5b605a', tints: ['#646963', '#535853', '#4b514d', '#5d5b50'] },
  };
  const def = defs[map.id] ?? defs.docks;
  let seed = [...map.id].reduce((a, ch) => a + ch.charCodeAt(0), 37);
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  g.fillStyle = def.base;
  g.fillRect(0, 0, size, size);
  const cells = 64;
  const cell = size / cells;
  // Fine per-cell tint jitter
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      if (rnd() < 0.62) continue;
      g.fillStyle = def.tints[Math.floor(rnd() * def.tints.length)];
      g.globalAlpha = 0.10 + rnd() * 0.16;
      g.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
    }
  }
  g.globalAlpha = 1;
  // Soft, large-scale damp patches (radial, no hard block edges)
  for (let i = 0; i < 14; i++) {
    const x = rnd() * size, y = rnd() * size, r = 30 + rnd() * 90;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.55;
    grad.addColorStop(0, dark ? 'rgba(28,32,28,.10)' : 'rgba(226,226,208,.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Grain specks and short cracks
  for (let i = 0; i < 3800; i++) {
    const x = Math.floor(rnd() * size), y = Math.floor(rnd() * size);
    const v = rnd();
    g.fillStyle = v < 0.5 ? 'rgba(20,22,20,.16)' : 'rgba(232,232,216,.10)';
    g.fillRect(x, y, rnd() < 0.15 ? 2 : 1, 1);
  }
  for (let i = 0; i < 22; i++) {
    let x = rnd() * size, y = rnd() * size;
    g.strokeStyle = 'rgba(24,27,24,.12)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 3 + Math.floor(rnd() * 5);
    for (let j = 0; j < steps; j++) {
      x += (rnd() - 0.5) * 20;
      y += (rnd() - 0.5) * 20;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 16;
  return tex;
}

export function buildMap3D(map: MapDef, opts: { heightfield?: boolean; heightAt?: (x: number, z: number) => number; gameplay?:boolean;res?:32|64|128;manager?:THREE.LoadingManager;legacy?:boolean } = {}) {
  if(!opts.legacy){const arena=buildMapArena(map,'noon',opts.res??32),camera=new THREE.PerspectiveCamera(34,1,.5,2200),routeGroup=new THREE.Group();routeGroup.visible=false;arena.scene.add(routeGroup);const views:Record<string,{pos:[number,number,number];look:[number,number,number]}>={overview:{pos:[430,330,440],look:[150,0,150]},top:{pos:[150,520,151],look:[150,0,150]},A:{pos:[300,120,260],look:[225,0,120]},B:{pos:[230,130,270],look:[150,0,152]},C:{pos:[140,120,280],look:[80,0,180]}};return {scene:arena.scene,camera,views,routeGroup};}
  buildHeightAt = opts.heightAt;
  gameplay=!!opts.gameplay;textureRes=opts.res??32;texLoader=new THREE.TextureLoader(opts.manager);textures.clear();tileMats.clear();groundMats.clear();
  const scene = new THREE.Scene();
  const mapSky = texLoader.load('/skies/noon.jpg');
  mapSky.colorSpace = THREE.SRGBColorSpace;
  mapSky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = mapSky;
  scene.backgroundIntensity = 0.92;
  scene.fog = new THREE.FogExp2('#a9c0c8', 0.0008);
  const root = new THREE.Group();
  scene.add(root);
  const routeGroup = new THREE.Group();
  routeGroup.visible = false;
  root.add(routeGroup);

  scene.add(new THREE.HemisphereLight(0xdfeee7, 0x263027, .8));
  const key = new THREE.DirectionalLight(0xffdfb8, 1.95);
  key.position.set(240, 360, 180); scene.add(key);
  const fill = new THREE.DirectionalLight(0x79cfe0, 0.75);
  fill.position.set(-180, 160, 260); if(!gameplay)scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff9860, 0.65);
  rim.position.set(-200, 120, -260); if(!gameplay)scene.add(rim);

  // base slab: heightfield maps render their own terrain shell, avoid z-fighting
  if (!opts.heightfield) box(root, map.size, 1.2, map.size, C.concrete, map.size / 2, -0.6, map.size / 2);
  const baseColor = map.baseTerrain === 'grass' ? 0x68705a : map.baseTerrain === 'dirt' ? 0x6b5c47 : map.baseTerrain === 'gravel' ? 0x6d6b5e : map.id === 'docks' ? 0x4b524e : 0x70746e;
  if (!opts.heightfield) {
    const groundTex = makeGroundTexture(map);
    const groundRepeat = Math.max(6, Math.round(map.size / 20));
    groundTex.repeat.set(groundRepeat, groundRepeat);
    groundTex.anisotropy = 16;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.size, map.size), new THREE.MeshLambertMaterial({ map: groundTex, color: 0xd2d6ce }));
    ground.name = 'map-ground';
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(map.size / 2, 0.006, map.size / 2);
    root.add(ground);
  }

  // sealed perimeter for flat maps; heightfield maps use a low stone parapet on the terrain
  if (!opts.heightfield) {
    const edge = 3.0;
    const wallH = 8.5;
    box(root, map.size + edge * 2, wallH, edge, 0x353b36, map.size / 2, wallH / 2, edge / 2);
    box(root, map.size + edge * 2, wallH, edge, 0x353b36, map.size / 2, wallH / 2, map.size - edge / 2);
    box(root, edge, wallH, map.size, 0x353b36, edge / 2, wallH / 2, map.size / 2);
    box(root, edge, wallH, map.size, 0x353b36, map.size - edge / 2, wallH / 2, map.size / 2);
    for (const [x, z] of [[edge / 2, edge / 2], [map.size - edge / 2, edge / 2], [edge / 2, map.size - edge / 2], [map.size - edge / 2, map.size - edge / 2]]) {
      box(root, edge * 2, wallH + 1.2, edge * 2, 0x3e443d, x, (wallH + 1.2) / 2, z);
    }
  }

  if (!opts.heightfield) {
    for (const patch of map.terrain) {
      const y = patch.kind === 'water' ? 0.12 : (patch.elevation ?? 0.02);
      poly(root, patch.polygon, terrainColor(patch.kind), y, 1, terrainTexture(patch.kind));
    }
  }
  if (!opts.heightfield) for (const r of map.roads) for (let i = 0; i < r.points.length - 1; i++) road(root, r.points[i], r.points[i + 1], r.width, r.kind === 'main' ? 'asphalt_clean' : 'concrete_clean');
  if (map.id === 'broken_bridge') {
    // intact west half of the bridge: x110–150, full 40m deck width
    box(root, 12, 0.55, 40, 0x6e7268, 130, 1.725, 150);
    box(root, 12.5, 0.12, 40.5, 0x8b8e83, 130, 1.96, 150);
    for(const x of [124.4,135.6]){
      box(root,.25,.16,38,0x4d5651,x,2.7,150);
      for(let z=132;z<=168;z+=4)box(root,.18,.9,.18,0x4d5651,x,2.6,z);
    }
  }

  for (const b of map.buildings) {
    const xs = b.polygon.map((p) => p[0]), zs = b.polygon.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const g = new THREE.Group();
    g.position.y = opts.heightAt ? opts.heightAt(cx, cz) : 0;
    building(g, b);
    root.add(g);
  }
  for (const c of map.covers) cover(root, c);
  for (const p of map.props) prop(root, p);

  // capture points
  if(!gameplay)for (const p of map.capturePoints) {
    const color = p.initialOwner === 'blue' ? C.blue : p.initialOwner === 'orange' ? C.orange : C.neutral;
    const capY = (opts.heightAt ? opts.heightAt(p.x, p.y) : 0) + (map.id === 'broken_bridge' && p.id === 'B' ? 0.62 : 0.15);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(p.radius, 0.35, 8, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(p.x, capY, p.y); root.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 6, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
    beam.position.set(p.x, 3 + capY, p.y); root.add(beam);
    label(root, `${p.id} · ${p.name}`, p.x, p.y, color === C.blue ? '#8ecbff' : color === C.orange ? '#ffb08c' : '#dce8e3', 8);
  }
  // spawns
  for (const s of map.spawns) {
    const color = s.team === 'blue' ? C.blue : C.orange;
    // thin painted boundary only — no huge translucent slab over the ground
    const sy = baseHeightAt(s.x + s.w / 2, s.y + s.d / 2) + 0.06;
    const pts = [
      new THREE.Vector3(s.x, sy, s.y),
      new THREE.Vector3(s.x + s.w, sy, s.y),
      new THREE.Vector3(s.x + s.w, sy, s.y + s.d),
      new THREE.Vector3(s.x, sy, s.y + s.d),
      new THREE.Vector3(s.x, sy, s.y),
    ];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
    root.add(line);
    for (const [sx, sz] of [[s.x, s.y], [s.x + s.w, s.y], [s.x, s.y + s.d], [s.x + s.w, s.y + s.d]]) {
      box(root, 0.4, 1.2, 0.4, color, sx, baseHeightAt(sx, sz) + 0.6, sz);
    }
  }
  // vehicle pads
  if(!gameplay)for (const p of map.vehiclePads) {
    const py = baseHeightAt(p.x, p.y);
    box(root, 5.5, 0.1, 8, p.team === 'blue' ? 0x28465c : 0x5c3829, p.x, py + 0.08, p.y, (p.angle * Math.PI) / 180);
    box(root, 2.2, 1.2, 4.2, 0x8b8e85, p.x, py + 0.65, p.y, (p.angle * Math.PI) / 180);
  }
  // MG nests
  if(!gameplay)for (const m of map.mgNests) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.7, 8), mat(C.sandbag));
    const my = baseHeightAt(m.x, m.y);
    ring.position.set(m.x, my + 0.35, m.y); root.add(ring);
    box(root, 0.4, 1.1, 2.4, C.dark, m.x, my + 1.3, m.y, (m.angle * Math.PI) / 180);
  }
  // special crates
  if(!gameplay)for (const c of map.specialCrates) {
    const cy = baseHeightAt(c.x, c.y);
    box(root, 1.6, 1.1, 1.6, 0x7b5b3b, c.x, cy + 0.55, c.y);
    box(root, 1.75, 0.12, 1.75, 0xffb454, c.x, cy + 1.16, c.y);
  }
  // map boundary
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(map.size, 0.2, 0),
      new THREE.Vector3(map.size, 0.2, map.size), new THREE.Vector3(0, 0.2, map.size),
      new THREE.Vector3(0, 0.2, 0),
    ]),
    new THREE.LineBasicMaterial({ color: 0x35e0d0, transparent: true, opacity: 0.35 }),
  );
  root.add(line);

  // routes (hidden by default; review toggle)
  for (const r of map.routes ?? []) {
    if (r.points.length < 2) continue;
    const pts = r.points.map(([x, z]) => new THREE.Vector3(x, 0.22, z));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
      color: r.team === 'blue' ? C.blue : C.orange, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.95,
    }));
    line.computeLineDistances(); routeGroup.add(line);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = a.distanceTo(b);
      const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(1.5, len), new THREE.MeshBasicMaterial({
        color: r.team === 'blue' ? C.blue : C.orange, transparent: true, opacity: 0.38, side: THREE.DoubleSide,
      }));
      ribbon.rotation.x = -Math.PI / 2;
      ribbon.rotation.z = -Math.atan2(b.x - a.x, b.z - a.z);
      ribbon.position.set((a.x + b.x) / 2, 0.24, (a.z + b.z) / 2);
      routeGroup.add(ribbon);
    }
    const end = pts[pts.length - 1];
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.2, 4), new THREE.MeshBasicMaterial({ color: r.team === 'blue' ? C.blue : C.orange }));
    cone.position.copy(end).setY(1.2); cone.rotation.x = Math.PI / 2; routeGroup.add(cone);
    const mid = pts[Math.floor(pts.length / 2)];
    label(routeGroup, r.label, mid.x, mid.z, r.team === 'blue' ? '#8ecbff' : '#ffb08c', 6);
  }

  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 2200);
  const views: Record<string, { pos: [number, number, number]; look: [number, number, number] }> = {
    overview: { pos: [430, 330, 440], look: [150, 0, 150] },
    top: { pos: [150, 520, 151], look: [150, 0, 150] },
    A: { pos: [300, 120, 260], look: [225, 0, 120] },
    B: { pos: [230, 130, 270], look: [150, 0, 152] },
    C: { pos: [140, 120, 280], look: [80, 0, 180] },
  };
  return { scene, camera, views, routeGroup };
}
