import * as THREE from 'three';
import { getMap } from '../maps';
import { buildVoxelMapData } from '../game/world/voxel-map-data';
import { buildMapArena } from '../game/world/map-arena';
import type { BuildingInteriorPlan } from '../game/world/interior-types';

const params = new URLSearchParams(location.search);
const map = getMap(params.get('map') || 'docks');
if (!map) throw new Error('map not found');
if (params.get('ui') === '0' || params.get('capture') === '1') document.body.classList.add('capture');

const data = buildVoxelMapData(map);
const plans = data.interiors ?? [];
const wanted = params.get('building');
const plan =
  plans.find((p) => p.id === wanted) ??
  plans.find((p) => p.floors === 2 && p.category === 'industrial') ??
  plans.find((p) => p.floors === 2) ??
  plans[0];

const stage = document.getElementById('stage')!;
const hud = document.getElementById('hud')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.24;
stage.appendChild(renderer.domElement);

const arena = buildMapArena(map, params.get('sky') || 'noon', 64, data);
const scene = new THREE.Scene();
scene.background = arena.scene.background;
scene.fog = arena.scene.fog;
scene.add(...arena.scene.children);
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 600);
scene.add(camera);

function interiorCentre(p: BuildingInteriorPlan) {
  return { x: (p.interior.x0 + p.interior.x1) / 2, z: (p.interior.z0 + p.interior.z1) / 2 };
}

function doorPoint(p: BuildingInteriorPlan) {
  const d = p.doors.find((x) => x.side === 'south' || x.side === 'north') ?? p.doors[0];
  if (!d) return { x: (p.x0 + p.x1) / 2, z: p.z0 - 6, side: 'south' as const, cx: (p.x0 + p.x1) / 2, cz: p.z0, a0: p.x0, a1: p.x1 };
  return d;
}

function applyView(view: string) {
  const p = plan!;
  const centre = interiorCentre(p);
  const d = doorPoint(p);
  const eye = 1.65;
  const set = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
    camera.position.set(x, y, z);
    camera.lookAt(tx, ty, tz);
  };
  if (view === 'exterior') {
    const span = Math.max(p.x1 - p.x0, p.z1 - p.z0);
    const dist = Math.max(16, span * 0.9);
    const eye = p.base + Math.max(4.5, Math.min(11, p.height * 0.7));
    const target = p.base + Math.min(5.5, p.height * 0.45);
    if (d.side === 'south') set(d.cx, eye, p.z0 - dist, d.cx, target, p.z0);
    else if (d.side === 'north') set(d.cx, eye, p.z1 + dist, d.cx, target, p.z1);
    else if (d.side === 'west') set(p.x0 - dist, eye, d.cz, p.x0, target, d.cz);
    else set(p.x1 + dist, eye, d.cz, p.x1, target, d.cz);
    return;
  }
  if (view === 'stairs' && p.stair) {
    const st = p.stair;
    const lx = (st.landing.x0 + st.landing.x1) / 2;
    const lz = (st.landing.z0 + st.landing.z1) / 2;
    const topX = (st.opening.x0 + st.opening.x1) / 2;
    const topZ = (st.opening.z0 + st.opening.z1) / 2;
    set(lx, p.floorTop + eye, lz, topX, p.floorTop + 3, topZ);
    return;
  }
  if (view === 'upper' && p.upperFloorTop != null) {
    const x = p.stair ? (p.stair.opening.x0 + p.stair.opening.x1) / 2 : centre.x;
    const z = p.stair ? (p.stair.opening.z0 + p.stair.opening.z1) / 2 : centre.z;
    const nx = p.interior.x0 + (p.interior.x1 - p.interior.x0) * 0.24;
    const nz = p.interior.z0 + (p.interior.z1 - p.interior.z0) * 0.24;
    set(x, p.upperFloorTop + eye, z, nx, p.upperFloorTop + 1.1, nz);
    return;
  }

  if (view === 'door') {
    const out = 5;
    const eye = p.base + 2;
    if (d.side === 'south') set(d.cx, eye, p.z0 - out, d.cx, p.base + 1.6, p.z0);
    else if (d.side === 'north') set(d.cx, eye, p.z1 + out, d.cx, p.base + 1.6, p.z1);
    else if (d.side === 'west') set(p.x0 - out, eye, d.cz, p.x0, p.base + 1.6, d.cz);
    else set(p.x1 + out, eye, d.cz, p.x1, p.base + 1.6, d.cz);
    return;
  }
  if (view === 'facade') {
    const span = Math.max(p.x1 - p.x0, p.z1 - p.z0);
    const dist = Math.max(15, span * 0.8);
    set(p.x0 - dist * 0.7, p.base + Math.max(5, p.height * 0.7), p.z0 - dist, (p.x0 + p.x1) / 2, p.base + 2.4, (p.z0 + p.z1) / 2);
    return;
  }
  if (view === 'detail') {
    const corners: Array<[number, number]> = [
      [p.interior.x0 + 1.6, p.interior.z0 + 1.6],
      [p.interior.x1 - 1.6, p.interior.z0 + 1.6],
      [p.interior.x0 + 1.6, p.interior.z1 - 1.6],
      [p.interior.x1 - 1.6, p.interior.z1 - 1.6],
    ];
    const clear = ([x, z]: [number, number]) => {
      const st = p.stair;
      if (!st) return true;
      return x < st.x0 - 1 || x > st.x1 + 1 || z < st.z0 - 1 || z > st.z1 + 1;
    };
    const [x, z] = corners.find(clear) ?? corners[0];
    set(x, p.floorTop + eye, z, centre.x, p.floorTop + 1.1, centre.z);
    return;
  }
  if (view === 'detail-upper' && p.upperFloorTop != null) {
    set(p.interior.x0 + 1.6, p.upperFloorTop + eye, p.interior.z0 + 1.6, p.interior.x1 - 1.6, p.upperFloorTop + 1.1, p.interior.z1 - 1.6);
    return;
  }
  // interior / room: just inside the main door, looking through the room.
  const inward = 4;
  if (d.side === 'south') set(d.cx, p.floorTop + eye, p.z0 + inward, centre.x, p.floorTop + 1.25, centre.z);
  else if (d.side === 'north') set(d.cx, p.floorTop + eye, p.z1 - inward, centre.x, p.floorTop + 1.25, centre.z);
  else if (d.side === 'west') set(p.x0 + inward, p.floorTop + eye, d.cz, centre.x, p.floorTop + 1.25, centre.z);
  else set(p.x1 - inward, p.floorTop + eye, d.cz, centre.x, p.floorTop + 1.25, centre.z);
}

applyView(params.get('view') || 'interior');
hud.innerHTML = `<b>${map.name} / ${plan?.name ?? '?'}</b><br>${plan?.category ?? ''} · ${plan?.floors ?? 1}F · ${plan?.propCounts.join(' / ') ?? ''} props · ${plan?.decorCount ?? 0} decor`;

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

function loop() {
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();

arena.ready?.then(() => {
  // Re-apply after assets settle so the first screenshot is deterministic.
  applyView(params.get('view') || 'interior');
  (window as unknown as { __previewReady: boolean; __previewInfo: unknown }).__previewReady = true;
  (window as unknown as { __previewInfo: unknown }).__previewInfo = {
    map: map.id,
    building: plan?.id,
    category: plan?.category,
    floors: plan?.floors,
    props: plan?.propCounts,
    decor: plan?.decorCount,
    door: plan?.doors.map((x) => `${x.side}:${x.a0}-${x.a1}`),
    stair: plan?.stair?.dir,
  };
});
