import {classicMaterialUrl} from '../../content/materials/battlefield';
import { addSkybox } from './voxel-map-render';
import {setSunShadowMesh} from './sun-shadows';
import {setDaylightMaterial,surfaceResponse} from './daylight';
import {pixelSurfaceTexture,setPixelSurfaceMaterial} from '../rendering/pixel-surfaces';
import { loadingManager } from '../core/loading';
import * as THREE from 'three';
import type { Arena, ArenaTarget } from './arena';

const N = 64;
const HALF = 32;
const GROUND = -1;

type Block = { x: number; y: number; z: number; tex: string; tint: number; rot: number };

const TEXTURES = [
  'asphalt_clean', 'asphalt_worn', 'asphalt_stained', 'asphalt_pixel',
  'concrete_clean', 'concrete_stained', 'concrete_pixel', 'concrete_wall',
  'dirt', 'grass_dirt', 'rock',
  'brick_red', 'plaster', 'roof_tile', 'wood_planks',
  'container_blue', 'container_rust', 'container_olive', 'container_red', 'container_green',
  'steel_corrugated', 'steel_rust', 'window_dark', 'metal_door', 'sandbags', 'tarp',
] as const;


function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeGroundTexture(x: number, z: number): string {
  const ax = Math.abs(x);
  if (ax < 6) {
    // 主路只用接近的深色沥青，避免黑白格。
    return 'asphalt_clean';
  }
  if (z > 8 && z < 22 && ax < 14) return pick(['concrete_stained', 'concrete_stained', 'asphalt_clean']);
  if (x < -10 && z < 8) return pick(['dirt', 'grass_dirt', 'grass_dirt', 'dirt']);
  if (x > 10 && z < 2) return pick(['concrete_stained', 'dirt', 'dirt']);
  return pick(['dirt', 'dirt', 'grass_dirt', 'rock']);
}

function makeTargetTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b2b27';
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#d9d2b8';
  g.fillRect(3, 3, 26, 26);
  g.fillStyle = '#9b3a2a';
  for (let r = 7; r <= 14; r += 7) {
    g.beginPath();
    g.arc(16, 16, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#1b1b18';
  g.fillRect(15, 2, 2, 28);
  g.fillRect(2, 15, 28, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function loadTex(name:string,res:number,manager:THREE.LoadingManager){
  let material:THREE.MeshStandardMaterial;
  const map = new THREE.TextureLoader(manager).load(classicMaterialUrl(name,res===128?128:res===64?64:32),loaded=>{
    const surf=pixelSurfaceTexture(loaded.image,name);
    if(surf){material.userData.pixelSurface=surf;material.needsUpdate=true;}
  });
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestMipmapLinearFilter;
  map.generateMipmaps = true;map.anisotropy=8;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  const [roughness,metalness]=surfaceResponse(name);
  material=new THREE.MeshStandardMaterial({map,color:0xffffff,roughness,metalness,vertexColors:true});
  setDaylightMaterial(material);
  setPixelSurfaceMaterial(material,name);
  return material;
}

export interface VoxelArena extends Arena {
  heightAt(x: number, z: number): number;
  blockedAt(x: number, z: number, radius: number, fromHeight: number): boolean;
  skyName: string;
  ready: Promise<void>;
}

export function buildVoxelArena(res: number, skyOverride?: string, renderer?: THREE.WebGLRenderer): VoxelArena {
  const scene = new THREE.Scene();
  const assets=loadingManager();
  const manager=assets.manager;
  const heights = new Uint8Array(N * N);
  const blocks: Block[] = [];
  const targets: ArenaTarget[] = [];

  const idx = (x: number, z: number) => (z + HALF) * N + (x + HALF);
  const inside = (x: number, z: number) => x >= -HALF && x < HALF && z >= -HALF && z < HALF;
  const heightAt = (x: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (!inside(ix, iz)) return -Infinity;
    return heights[idx(ix, iz)];
  };
  const addBlock = (x: number, ly: number, z: number, tex: string, tint = 1, rot = 0) => {
    blocks.push({ x: x + 0.5, y: ly + 0.5, z: z + 0.5, tex, tint, rot });
  };
  const raise = (x: number, z: number, h: number) => {
    if (!inside(x, z)) return;
    const i = idx(x, z);
    if (heights[i] < h) heights[i] = h;
  };
  const fill = (
    x0: number, z0: number, x1: number, z1: number, h: number,
    side: string, top = side, opts: { windows?: boolean; door?: [number, number]; tint?: number } = {},
  ) => {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (!inside(x, z)) continue;
        raise(x, z, h);
        for (let ly = 0; ly < h; ly++) {
          let tex = side;
          if (ly === h - 1) tex = top;
          if (side === 'concrete_wall' && Math.random() < 0.06) tex = 'concrete_stained';
          if (side === 'brick_red' && Math.random() < 0.05) tex = 'concrete_stained';
          if (side === 'steel_corrugated' && Math.random() < 0.08) tex = 'steel_rust';
          if (opts.windows && ly >= 2 && ly <= h - 2 && ((x + z + ly) % 4 === 0)) tex = 'window_dark';
          if (opts.door && ly === 0 && x === opts.door[0] && z === opts.door[1]) tex = 'metal_door';
          addBlock(x, ly, z, tex, opts.tint ?? (0.9 + Math.random() * 0.18));
        }
      }
    }
  };
  const stairs = (x0: number, z0: number, steps: number, dir: 'x' | 'z', side: string, top: string) => {
    for (let i = 0; i < steps; i++) {
      const a = x0 + (dir === 'x' ? i : 0);
      const b = z0 + (dir === 'z' ? i : 0);
      fill(a, b, a + (dir === 'x' ? 0 : 2), b + (dir === 'z' ? 0 : 2), i + 1, side, top);
    }
  };

  // --- base ground ---
  for (let x = -HALF; x < HALF; x++) {
    for (let z = -HALF; z < HALF; z++) {
      addBlock(x, GROUND, z, makeGroundTexture(x, z), 0.9 + Math.random() * 0.16, Math.floor(Math.random() * 4) * Math.PI / 2);
      heights[idx(x, z)] = 0;
    }
  }

  // raised dirt plateaus (1–2 blocks), walkable
  for (let x = -28; x < -12; x++) {
    for (let z = 6; z < 20; z++) {
      if ((x + z) % 7 < 4) {
        raise(x, z, 1);
        addBlock(x, 0, z, pick(['dirt', 'grass_dirt', 'rock']), 0.9 + Math.random() * 0.14);
      }
    }
  }
  for (let x = 20; x < 30; x++) {
    for (let z = -6; z < 8; z++) {
      if ((x * 3 + z) % 5 < 3) {
        raise(x, z, 1);
        addBlock(x, 0, z, pick(['rock', 'grass_dirt']), 0.9 + Math.random() * 0.14);
      }
    }
  }

  // --- border walls ---
  fill(-HALF, -HALF, HALF - 1, -HALF + 1, 5, 'concrete_wall', 'concrete_clean');
  fill(-HALF, HALF - 2, HALF - 1, HALF - 1, 5, 'concrete_wall', 'concrete_clean');
  fill(-HALF, -HALF, -HALF + 1, HALF - 1, 5, 'concrete_wall', 'concrete_clean');
  fill(HALF - 2, -HALF, HALF - 1, HALF - 1, 5, 'concrete_wall', 'concrete_clean');

  // --- left warehouse / office block ---
  fill(-28, -28, -14, -12, 6, 'concrete_wall', 'roof_tile', { windows: true, door: [-21, -12] });
  fill(-30, -20, -22, -13, 3, 'brick_red', 'roof_tile', { windows: true });
  // annex + roof machinery
  fill(-25, -16, -20, -12, 2, 'plaster', 'concrete_stained');
  for (const [x, z] of [[-26, -26], [-24, -26], [-17, -26], [-15, -24]] as const) {
    fill(x, z, x, z, 7, 'steel_corrugated', 'steel_corrugated');
  }

  // roof machinery / antennas
  for (const [x, z, tex] of [[-26, -24, 'steel_corrugated'], [-23, -24, 'container_olive'], [-18, -24, 'steel_rust'], [-15, -20, 'steel_corrugated']] as const) {
    addBlock(x, 6, z, tex, 0.95, Math.floor(Math.random() * 4) * Math.PI / 2);
    raise(x, z, 7);
  }
  for (let ly = 7; ly < 12; ly++) {
    addBlock(-24, ly, -25, 'steel_rust', 0.95);
  }
  raise(-24, -25, 12);

  // --- right container yard ---
  const containerTex = ['container_blue', 'container_rust', 'container_olive', 'container_red', 'container_green'] as const;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const x = 8 + col * 4;
      const z = -28 + row * 3;
      const tex = containerTex[(row + col) % containerTex.length];
      const h = 2 + ((row + col) % 2);
      fill(x, z, x + 3, z, h, tex, tex, { tint: 0.9 + Math.random() * 0.15 });
    }
  }
  // open-side steel shed
  fill(20, -22, 28, -14, 5, 'steel_corrugated', 'steel_corrugated', { windows: true });

  // --- central tower with exterior stairs ---
  fill(10, -2, 14, 2, 7, 'concrete_wall', 'concrete_clean', { windows: true });
  stairs(15, -2, 7, 'z', 'concrete_wall', 'concrete_clean');

  // --- brick ruin garden ---
  fill(-16, 6, -8, 14, 3, 'brick_red', 'roof_tile', { windows: true, door: [-12, 6] });
  for (let x = -15; x <= -9; x++) {
    for (let z = 7; z <= 13; z++) {
      if ((x + z) % 5 === 0) {
        // collapsed columns: visually lower by removing top blocks is not supported by heightmap,
        // so leave as an open ruin silhouette via gaps in the outer wall
        if (x === -15 || z === 7) continue;
      }
    }
  }
  // sandbag emplacement
  fill(-4, 4, 4, 4, 1, 'sandbags', 'sandbags');
  fill(-4, 4, -4, 8, 1, 'sandbags', 'sandbags');
  // crates / tarp / foliage details
  fill(2, 8, 3, 9, 2, 'wood_planks', 'wood_planks');
  fill(-2, -8, 0, -6, 1, 'tarp', 'tarp');
  for (const [x, z] of [[-20, 2], [-18, 2], [22, 4], [24, 4], [26, -2], [-26, 14]] as const) {
    raise(x, z, 1);
    addBlock(x, 0, z, pick(['grass_dirt', 'grass_dirt', 'rock']), 0.85 + Math.random() * 0.2);
  }

  // --- foreground cover / detail props ---
  fill(-9, 16, -6, 16, 1, 'sandbags', 'sandbags');
  fill(6, 18, 9, 18, 1, 'sandbags', 'sandbags');
  fill(-12, 20, -10, 22, 1, 'wood_planks', 'wood_planks');
  fill(11, 14, 12, 15, 1, 'steel_corrugated', 'steel_corrugated');
  fill(13, 14, 14, 15, 1, 'container_blue', 'container_blue');
  fill(-4, -4, -2, -2, 1, 'concrete_stained', 'concrete_stained');
  fill(2, -4, 4, -2, 1, 'container_olive', 'container_olive');
  // low concrete barriers along the center lane
  fill(-10, 6, -7, 6, 1, 'concrete_stained', 'concrete_stained');
  fill(7, 2, 10, 2, 1, 'concrete_stained', 'concrete_stained');

  // central broken wall and low platform
  fill(-7, 12, -3, 12, 2, 'brick_red', 'brick_red', { tint: 0.95 });
  fill(-7, 12, -7, 12, 1, 'brick_red', 'brick_red');
  fill(4, 12, 8, 12, 1, 'concrete_stained', 'concrete_stained');
  fill(4, 12, 4, 16, 1, 'concrete_stained', 'concrete_stained');
  // barrels / rubble around mid
  for (const [x, z, tex] of [[-10, 9, 'container_rust'], [-9, 9, 'container_blue'], [10, 8, 'container_olive'], [11, 8, 'steel_rust'], [-3, 17, 'rock'], [3, 17, 'rock']] as const) {
    addBlock(x, 0, z, tex, 0.92, Math.floor(Math.random() * 4) * Math.PI / 2);
    raise(x, z, 1);
  }

  // central hollow warehouse: tall shell behind the target line
  fill(-5, -14, 3, -14, 5, 'steel_corrugated', 'steel_corrugated', { windows: true });
  fill(-5, -4, -2, -4, 5, 'steel_corrugated', 'steel_corrugated', { windows: true });
  fill(2, -4, 3, -4, 5, 'steel_corrugated', 'steel_corrugated', { windows: true });
  fill(-5, -14, -5, -4, 5, 'steel_corrugated', 'steel_corrugated', { windows: true });
  fill(3, -14, 3, -4, 5, 'steel_corrugated', 'steel_corrugated', { windows: true });
  fill(-4, -12, -2, -10, 1, 'container_rust', 'container_rust');
  fill(0, -11, 2, -9, 1, 'wood_planks', 'wood_planks');
  fill(-3, -6, 1, -6, 1, 'sandbags', 'sandbags');

  // hollow roofless shed: walls only, walk inside through the south gap
  fill(-16, -10, -12, -10, 3, 'concrete_wall', 'roof_tile', { windows: true });
  fill(-9, -10, -6, -10, 3, 'concrete_wall', 'roof_tile', { windows: true });
  fill(-16, -2, -6, -2, 3, 'concrete_wall', 'roof_tile', { windows: true });
  fill(-16, -10, -16, -2, 3, 'concrete_wall', 'roof_tile', { windows: true });
  fill(-6, -10, -6, -2, 3, 'concrete_wall', 'roof_tile', { windows: true });
  fill(-14, -7, -12, -6, 1, 'wood_planks', 'wood_planks');
  fill(-10, -8, -8, -7, 1, 'sandbags', 'sandbags');

  // container maze west of the shed
  const mazeTex = ['container_rust', 'container_blue', 'container_olive', 'container_green'] as const;
  for (let i = 0; i < 4; i++) {
    const x = -30 + (i % 2) * 5;
    const z = -10 + Math.floor(i / 2) * 4;
    fill(x, z, x + 3, z + 1, 2 + (i % 2), mazeTex[i % mazeTex.length], mazeTex[i % mazeTex.length]);
  }
  fill(-30, -6, -27, -6, 1, 'steel_rust', 'steel_rust');

  // raised platform with one-block step access
  fill(14, 16, 22, 24, 2, 'concrete_wall', 'concrete_stained', { windows: false, tint: 0.96 });
  fill(13, 16, 13, 24, 1, 'concrete_stained', 'concrete_stained');
  addBlock(16, 2, 18, 'container_blue', 0.95, Math.PI / 2);
  addBlock(18, 2, 18, 'container_rust', 0.95, Math.PI / 2);
  addBlock(20, 2, 21, 'steel_corrugated', 0.95);
  fill(17, 22, 20, 22, 3, 'sandbags', 'sandbags');
  // lamp posts
  for (const [x, z] of [[-13, 14], [9, 18], [8, 11]] as const) {
    for (let ly = 0; ly < 4; ly++) addBlock(x, ly, z, 'steel_rust', 0.9);
    raise(x, z, 4);
  }

  // --- targets ---
  const targetTex = makeTargetTexture();
  for (let i = 0; i < 7; i++) {
    const x = -18 + i * 6;
    const z = 8;
    const gy = heightAt(x, z);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.7, 0.16), new THREE.MeshLambertMaterial({ map: targetTex }));
    board.position.set(x + 0.5, gy + 1.15, z + 0.5);
    board.userData.target = i;
    setSunShadowMesh(board,false);
    scene.add(board);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.9), new THREE.MeshLambertMaterial({ color: 0x3b3a32 }));
    stand.position.set(x + 0.5, gy + 0.04, z + 0.65);
    setSunShadowMesh(stand);
    scene.add(stand);
    targets.push({ mesh: board, hit: false, respawnAt: 0 });
  }

  // --- sky (random morning / noon / dusk) ---
  const skyName = (skyOverride === 'morning' || skyOverride === 'noon' || skyOverride === 'dusk')
    ? skyOverride
    : 'noon';
  addSkybox(scene,skyName,64,manager);

  // Only exposed voxel faces are emitted; hidden interior cubes have no GPU cost.
  const blockKey=(b:typeof blocks[number])=>`${Math.round(b.x*2)},${Math.round(b.y*2)},${Math.round(b.z*2)}`;
  const unique=new Map(blocks.map(b=>[blockKey(b),b]));
  const occupied=new Set(unique.keys());
  const sets=new Map<string,{tex:string;pos:number[];normal:number[];uv:number[];col:number[]}>();
  const cube=new THREE.BoxGeometry(1,1,1).toNonIndexed(),pos=cube.getAttribute('position'),normal=cube.getAttribute('normal'),uv=cube.getAttribute('uv');
  for(const b of unique.values()){const c=Math.round(Math.cos(b.rot)),s=Math.round(Math.sin(b.rot));const key=`${b.tex}:${Math.floor(b.x/16)},${Math.floor(b.z/16)}`;let dst=sets.get(key);if(!dst){dst={tex:b.tex,pos:[],normal:[],uv:[],col:[]};sets.set(key,dst);}
    for(let face=0;face<6;face++){const start=face*6,nx=normal.getX(start)*c+normal.getZ(start)*s,ny=normal.getY(start),nz=-normal.getX(start)*s+normal.getZ(start)*c;
      if(occupied.has(`${Math.round((b.x+nx)*2)},${Math.round((b.y+ny)*2)},${Math.round((b.z+nz)*2)}`))continue;
      for(let i=start;i<start+6;i++){dst.pos.push(b.x+pos.getX(i)*c+pos.getZ(i)*s,b.y+pos.getY(i),b.z-pos.getX(i)*s+pos.getZ(i)*c);dst.normal.push(nx,ny,nz);dst.uv.push(uv.getX(i),uv.getY(i));dst.col.push(b.tint,b.tint,b.tint);}
    }
  }cube.dispose();const voxelRoot=new THREE.Group();scene.add(voxelRoot);
  let materials=new Map<string,THREE.MeshStandardMaterial>();
  for(const [key,dst] of sets){if(!dst.pos.length)continue;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(dst.pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(dst.normal,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(dst.uv,2));geo.setAttribute('color',new THREE.Float32BufferAttribute(dst.col,3));let material=materials.get(dst.tex);
    if(!material){material=loadTex(dst.tex,res,manager);materials.set(dst.tex,material);}
    const mesh=new THREE.Mesh(geo,material);mesh.userData.textureName=dst.tex;mesh.name=`voxels:${key}`;setSunShadowMesh(mesh);voxelRoot.add(mesh);}
  const ready=assets.ready;
  let textureRevision=0;
  const setTextureResolution=async(next:32|64|128)=>{
    const revision=++textureRevision;if(next===res)return;
    const batch=loadingManager();
    const nextMaterials=new Map([...materials.keys()].map(name=>[name,loadTex(name,next,batch.manager)]));
    const dispose=(materials:Map<string,THREE.MeshStandardMaterial>)=>{
      for(const material of materials.values()){material.map?.dispose();(material.userData.pixelSurface as THREE.Texture|undefined)?.dispose();material.dispose();}
    };
    try{await batch.ready;}catch(error){dispose(nextMaterials);throw error;}
    if(revision!==textureRevision||!voxelRoot.parent){dispose(nextMaterials);return;}
    for(const child of voxelRoot.children){
      const mesh=child as THREE.Mesh;
      mesh.material=nextMaterials.get(mesh.userData.textureName)!;
      setSunShadowMesh(mesh);
    }
    dispose(materials);materials=nextMaterials;
    res=next;
  };
  const MM=128;
  const minimapPlan = Array.from({ length: MM }, (_, iz) => Array.from({ length: MM }, (_, ix) => heightAt(ix - 32 + 0.5, iz - 32 + 0.5)));
  const spawn = new THREE.Vector3(0, heightAt(0, 24), 24);
  const bounds = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };
  return {
    scene,
    colliders: [],
    targets,
    spawn,
    spawnYaw: 0,
    bounds,
    skyName,
    ready,
    setTextureResolution,
    heightAt,
    lineBlocked(a, b) {
      const steps = 12;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const z = a.z + (b.z - a.z) * t;
        if (heightAt(Math.round(x), Math.round(z)) > y + 0.2) return true;
      }
      return false;
    },
    mapId:'training',minimapPlan,minimapPalette:[[34,66,68],[74,88,63],[110,113,84],[148,142,110],[172,160,128]],
    worldSize: HALF * 2,
    blockedAt(x, z, radius, fromHeight) {
      // check a small footprint; allow step-up of one voxel
      const samples = [[x - radius, z - radius], [x + radius, z - radius], [x - radius, z + radius], [x + radius, z + radius], [x, z]];
      for (const [sx, sz] of samples) {
        const h = heightAt(sx, sz);
        if (h > fromHeight + 1.05) return true;
      }
      return false;
    },
    blocked(x, z, radius) {
      return this.blockedAt(x, z, radius, 0);
    },
    raycastTargets(raycaster) {
      const meshes = targets.filter((t) => !t.hit).map((t) => t.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (!hits.length) return null;
      return targets.find((t) => t.mesh === hits[0].object) ?? null;
    },
    reset() {
      for (const t of targets) {
        t.hit = false;
        (t.mesh.material as THREE.MeshLambertMaterial).color.setHex(0xffffff);
      }
    },
  };
}
