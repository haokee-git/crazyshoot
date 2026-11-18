import * as THREE from 'three';
import { VEHICLES, getVehicle } from '../content/vehicles/catalog';
import { buildVehicleModel, type VehicleModelId } from '../content/vehicles/models';

const SHOWCASE: VehicleModelId[] = ['motorcycle', 'jeep', 'apc', 'ifv', 'light_tank', 'mbt'];
const params = new URLSearchParams(location.search);
const initial = (params.get('vehicle') as VehicleModelId) || 'jeep';
const capture = params.get('capture') === '1';
const hideUi = params.get('ui') === '0';
if (hideUi) document.body.classList.add('capture');

const stage = document.getElementById('vehicle-stage')!;
const nameEl = document.getElementById('vehicle-name')!;
const classEl = document.getElementById('vehicle-class')!;
const statsEl = document.getElementById('stats')!;
const weaponsEl = document.getElementById('weapons')!;
const rackEl = document.getElementById('rack')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#080c0e');
scene.fog = new THREE.FogExp2('#080c0e', 0.055);
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
scene.add(new THREE.HemisphereLight(0xcfe1db, 0x1a2224, 2.1));
const key = new THREE.DirectionalLight(0xffe2bd, 3.6);
key.position.set(8, 12, 10);
scene.add(key);
const fill = new THREE.DirectionalLight(0x70d2e5, 1.7);
fill.position.set(-9, 5, 5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffb06a, 1.7);
rim.position.set(-4, 7, -10);
scene.add(rim);

const grid = new THREE.GridHelper(36, 36, 0x2e484b, 0x1a2a2d);
grid.position.y = 0.002;
scene.add(grid);
const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(11, 11.5, 0.06, 64),
  new THREE.MeshStandardMaterial({ color: 0x182225, roughness: 0.9, metalness: 0.05 }),
);
disc.position.y = -0.03;
scene.add(disc);
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(9.5, 0.02, 6, 96),
  new THREE.MeshBasicMaterial({ color: 0x35e0d0, transparent: true, opacity: 0.4 }),
);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.005;
scene.add(ring);

let current: VehicleModelId = SHOWCASE.includes(initial) ? initial : 'jeep';
let model = new THREE.Group();
let angle = 0.3;
let action: 'idle' | 'drive' | 'turret' = 'idle';
let actionTime = 0;
scene.add(model);

function frameModel() {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  const dist = span * 1.45;
  camera.position.set(dist * 1.25, span * 0.55 + center.y * 0.2, dist * 0.72);
  camera.lookAt(center.x, span * 0.25, center.z);
  camera.far = Math.max(120, span * 10);
  camera.updateProjectionMatrix();
}

function rebuild(id: VehicleModelId) {
  current = id;
  scene.remove(model);
  model = buildVehicleModel(id);
  model.rotation.y = angle;
  model.userData.wheels = model.userData.wheels || [];
  scene.add(model);
  const v = getVehicle(id) ?? VEHICLES[0];
  nameEl.textContent = v.short;
  classEl.textContent = `${v.name.toUpperCase()} / ${v.seats} SEATS`;
  document.title = `CRAZYSHOOT // ${v.name} // VEHICLE LAB`;
  statsEl.innerHTML = [
    ['座位', String(v.seats)], ['耐久', String(v.hp)], ['极速', `${v.speed} km/h`],
  ].map(([k, val]) => `<div class="stat"><span>${k}</span><b>${val}</b></div>`).join('');
  weaponsEl.innerHTML = `<b>武器</b><br />${v.weapons.length ? v.weapons.map((w) => w.replace('vehicle_', '').replaceAll('_', ' ')).join('<br />') : '无武装 / UNARMED'}`;
  rackEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.vehicle === id));
  frameModel();
}

for (const id of SHOWCASE) {
  const v = getVehicle(id)!;
  const b = document.createElement('button');
  b.textContent = v.short;
  b.dataset.vehicle = id;
  b.onclick = () => { angle = 0.3; rebuild(id); };
  rackEl.appendChild(b);
}

rebuild(current);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

let auto = !capture;
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  if (auto) {
    angle += dt * 0.26;
    model.rotation.y = angle;
  }
  if (action === 'drive') {
    actionTime += dt;
    for (const w of (model.userData.wheels as THREE.Group[])) w.rotation.x = actionTime * 10;
    model.position.y = Math.abs(Math.sin(actionTime * 9)) * 0.025;
  } else {
    model.position.y = 0;
  }
  if (action === 'turret') {
    actionTime += dt;
    const turret = model.userData.turret as THREE.Group | undefined;
    if (turret) turret.rotation.y = Math.sin(actionTime * 1.5) * 1.1;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

(window as any).__vehicleSetFrame = (v: { frame?: number; t?: number; angle?: number }) => {
  auto = false;
  if (typeof v.angle === 'number') angle = v.angle;
  else if (typeof v.t === 'number') angle = 0.3 + v.t * Math.PI * 2 * 0.26;
  else if (typeof v.frame === 'number') angle = 0.3 + (v.frame / 48) * Math.PI * 2;
  model.rotation.y = angle;
  renderer.render(scene, camera);
};

(window as any).__vehicleSetAction = (a: 'idle' | 'drive' | 'turret', t = 0) => {
  auto = false;
  action = a;
  actionTime = t;
  if (a !== 'drive') model.position.y = 0;
  for (const w of (model.userData.wheels as THREE.Group[])) w.rotation.x = a === 'drive' ? t * 10 : 0;
  if (a === 'drive') model.position.y = Math.abs(Math.sin(t * 9)) * 0.025;
  const turret = model.userData.turret as THREE.Group | undefined;
  if (turret) turret.rotation.y = a === 'turret' ? Math.sin(t * 1.5) * 1.1 : 0;
  renderer.render(scene, camera);
};
(window as any).__vehicleSetVehicle = (id: VehicleModelId) => rebuild(id);
(window as any).__vehicleDebug = () => ({
  vehicle: current,
  angle,
  parts: model.children.length,
  box: new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray(),
  render: [renderer.domElement.width, renderer.domElement.height],
});
(window as any).__vehicleReady = true;
