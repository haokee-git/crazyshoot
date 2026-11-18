import * as THREE from 'three';
import { getMap } from '../maps';
import { buildMap3D } from './map3d';

const params = new URLSearchParams(location.search);
const map = getMap(params.get('map') || 'docks');
if (!map) throw new Error('map not found');
const capture = params.get('capture') === '1';
if (params.get('ui') === '0') document.body.classList.add('capture');

const stage = document.getElementById('map-stage')!;
const rack = document.getElementById('rack')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
stage.appendChild(renderer.domElement);

const { scene, camera, views, routeGroup } = buildMap3D(map);
camera.aspect = 1;
scene.add(camera);

let target = new THREE.Vector3(150, 0, 150);
let azimuth = 0.76;
let elevation = 0.72;
let radius = 620;
let current = 'overview';

function applyView(name: string) {
  const cap = (name === 'A' || name === 'B' || name === 'C') ? map!.capturePoints.find((c) => c.id === name) : undefined;
  const v = views[name] || views.overview;
  current = name;
  if (cap) {
    target.set(cap.x, 0, cap.y);
    camera.position.set(cap.x + 58, 72, cap.y + 76);
    camera.lookAt(target);
  } else {
    target.set(v.look[0], v.look[1], v.look[2]);
    camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
  }
  camera.lookAt(target);
  const dx = camera.position.x - target.x, dy = camera.position.y - target.y, dz = camera.position.z - target.z;
  radius = Math.hypot(dx, dy, dz);
  elevation = Math.asin(dy / radius);
  azimuth = Math.atan2(dx, dz);
  rack.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLButtonElement).dataset.view === name));
}
for (const [id, label] of [['overview', '总览'], ['top', '俯视'], ['A', 'A 点'], ['B', 'B 点'], ['C', 'C 点'], ['routes', '路线']]) {
  const b = document.createElement('button');
  b.textContent = label; b.dataset.view = id;
  b.onclick = () => {
    if (id === 'routes') {
      routeGroup.visible = !routeGroup.visible;
      b.classList.toggle('on', routeGroup.visible);
      if (capture) renderer.render(scene, camera);
      return;
    }
    applyView(id);
  };
  rack.appendChild(b);
}
applyView((params.get('view') as string) || 'overview');

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
resize(); window.addEventListener('resize', resize);

// simple orbit
let drag = false, px = 0, py = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = true; px = e.clientX; py = e.clientY; });
window.addEventListener('pointerup', () => { drag = false; });
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  azimuth -= (e.clientX - px) * 0.005;
  elevation = THREE.MathUtils.clamp(elevation + (e.clientY - py) * 0.004, 0.18, 1.35);
  px = e.clientX; py = e.clientY;
  updateOrbit();
});
renderer.domElement.addEventListener('wheel', (e) => {
  radius = THREE.MathUtils.clamp(radius * (1 + Math.sign(e.deltaY) * 0.08), 160, 1000);
  updateOrbit(); e.preventDefault();
}, { passive: false });
function updateOrbit() {
  camera.position.set(
    target.x + radius * Math.cos(elevation) * Math.sin(azimuth),
    target.y + radius * Math.sin(elevation),
    target.z + radius * Math.cos(elevation) * Math.cos(azimuth),
  );
  camera.lookAt(target);
}

window.addEventListener('resize', resize);
(window as any).__mapSetView = (name: string) => { applyView(name); renderer.render(scene, camera); };
(window as any).__mapToggleRoutes = (visible?: boolean) => {
  routeGroup.visible = typeof visible === 'boolean' ? visible : !routeGroup.visible;
  renderer.render(scene, camera);
  return routeGroup.visible;
};
(window as any).__mapSetOrbit = (t: number, r = 620, elev = 0.72) => {
  current = 'orbit';
  target.set(150, 0, 150);
  radius = r; elevation = elev; azimuth = t * Math.PI * 2;
  updateOrbit();
  renderer.render(scene, camera);
};
(window as any).__mapDebug = () => ({ map: map.id, view: current, camera: camera.position.toArray() });
(window as any).__mapReady = true;

function loop() {
  if (!capture) renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
