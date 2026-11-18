import * as THREE from 'three';
import { WEAPONS, getWeapon, type WeaponId } from '../content/weapons/catalog';
import { buildWeaponModel, type WeaponModelId } from '../content/weapons/models';

const SHOWCASE: WeaponModelId[] = ['m16', 'm4a1', 'akm', 'mp5', 'mk14', 'awm', 'amr', 'uzi', 'vector', 'ump45', 'm870', 'm249'];
const params = new URLSearchParams(location.search);
const initial = (params.get('weapon') as WeaponId) || 'm16';
const capture = params.get('capture') === '1';
const hideUi = params.get('ui') === '0';
const silhouette = params.get('silhouette') === '1';
if (hideUi) document.body.classList.add('capture');

const stage = document.getElementById('weapon-stage')!;
const nameEl = document.getElementById('weapon-name')!;
const classEl = document.getElementById('weapon-class')!;
const statsEl = document.getElementById('stats')!;
const roleEl = document.getElementById('role')!;
const rackEl = document.getElementById('rack')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(silhouette ? '#ffffff' : '#080c0e');
if (!silhouette) scene.fog = new THREE.FogExp2('#080c0e', 0.10);

const camera = new THREE.PerspectiveCamera(25, 1, 0.05, 30);
const view = new URLSearchParams(location.search).get('view') || 'hero';
if (view === 'side') { camera.position.set(3.0, silhouette ? 0.06 : 0.55, 0.0); camera.lookAt(0, 0.06, 0); }
else if (view === 'stock') { camera.position.set(2.1, 0.45, -0.42); camera.lookAt(0, 0.02, -0.36); }
else if (view === 'sight') { camera.position.set(2.0, 0.65, 0.10); camera.lookAt(0, 0.15, 0.02); }
else { camera.position.set(2.55, 1.02, 1.62); camera.lookAt(0, 0.40, 0); }

scene.add(new THREE.HemisphereLight(0xcfe1db, 0x1a2224, 2.2));
const key = new THREE.DirectionalLight(0xffe2bd, 3.8);
key.position.set(3.4, 5.2, 4.6);
scene.add(key);
const fill = new THREE.DirectionalLight(0x70d2e5, 2.1);
fill.position.set(-4.2, 2.0, 2.0);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffb06a, 1.9);
rim.position.set(-1.0, 3.2, -4.2);
scene.add(rim);

const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(1.22, 1.34, 0.08, 48),
  new THREE.MeshStandardMaterial({ color: 0x162024, roughness: 0.88, metalness: 0.08 }),
);
disc.position.y = -0.05;
scene.add(disc);
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(1.14, 0.006, 8, 80),
  new THREE.MeshBasicMaterial({ color: 0x35e0d0, transparent: true, opacity: 0.55 }),
);
ring.rotation.x = Math.PI / 2;
ring.position.y = -0.002;
scene.add(ring);
const grid = new THREE.GridHelper(2.5, 25, 0x2e484b, 0x1a2a2d);
grid.position.y = -0.003;
scene.add(grid);

const blob = new THREE.Mesh(
  new THREE.CircleGeometry(0.48, 32),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }),
);
blob.rotation.x = -Math.PI / 2;
blob.position.set(0, 0.002, 0.02);
scene.add(blob);
if (silhouette) { disc.visible = false; ring.visible = false; grid.visible = false; blob.visible = false; }

let current: WeaponModelId = SHOWCASE.includes(initial as WeaponModelId) ? (initial as WeaponModelId) : 'm16';
let model = new THREE.Group();
let angle = Number(params.get('angle') ?? -0.15);
let action: 'idle' | 'reload' | 'fire' = (params.get('action') as any) || 'idle';
scene.add(model);

function rebuild(id: WeaponModelId) {
  current = id;
  action = 'idle';
  scene.remove(model);
  model = buildWeaponModel(id);
  model.position.y = 0.42;
  model.rotation.y = angle;
  scene.add(model);
  const w = getWeapon(id) ?? WEAPONS[0];
  nameEl.textContent = w.name;
  classEl.textContent = `${w.classLabel.toUpperCase()} / ${w.role}`;
  roleEl.textContent = w.role;
  statsEl.innerHTML = [
    ['伤害', w.stats.damage], ['射速', w.stats.rate], ['精度', w.stats.accuracy], ['控制', w.stats.control], ['机动', w.stats.mobility],
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${value}%"></i></div></div>`).join('');
  document.title = `CRAZYSHOOT // ${w.name} // WEAPON LAB`;
  rackEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.weapon === id));
}

for (const id of SHOWCASE) {
  const w = getWeapon(id)!;
  const b = document.createElement('button');
  b.textContent = w.name;
  b.dataset.weapon = id;
  b.onclick = () => rebuild(id);
  rackEl.appendChild(b);
}

rebuild(current);

function resetModelPose() {
  const mag = model.getObjectByName('magazine') as THREE.Group | undefined;
  if (mag) {
    const rest = mag.userData.rest;
    mag.position.set(0, rest.y, rest.z);
    mag.rotation.x = rest.rx;
  }
  const flash = model.getObjectByName('muzzleFlash') as THREE.Mesh | undefined;
  if (flash) flash.visible = false;
  model.position.z = 0;
  model.rotation.x = 0;
}

function setAction(name: 'idle' | 'reload' | 'fire', t: number) {
  auto = false;
  action = name;
  resetModelPose();
  const mag = model.getObjectByName('magazine') as THREE.Group | undefined;
  const flash = model.getObjectByName('muzzleFlash') as THREE.Mesh | undefined;
  if (name === 'reload') {
    const p = Math.min(1, Math.max(0, t));
    const drop = p < 0.35 ? p / 0.35 : p > 0.72 ? (1 - p) / 0.28 : 1;
    model.rotation.x = Math.sin(p * Math.PI) * 0.22;
    if (mag) {
      mag.position.y = mag.userData.rest.y - 0.24 * drop;
      mag.position.z = mag.userData.rest.z + 0.10 * drop;
      mag.rotation.x = mag.userData.rest.rx - 0.75 * drop;
    }
  } else if (name === 'fire') {
    model.position.z = Math.sin(Math.min(1, t / 0.22) * Math.PI) * 0.045;
    model.rotation.x = Math.sin(Math.min(1, t / 0.22) * Math.PI) * 0.025;
    if (flash) flash.visible = t < 0.18;
  }
  renderer.render(scene, camera);
}

(window as unknown as { __weaponSetAction?: (v: { action: 'idle' | 'reload' | 'fire'; t: number }) => void }).__weaponSetAction = (v) => setAction(v.action, v.t);
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

let auto = !capture;
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  if (auto) {
    angle += dt * 0.32;
    model.rotation.y = angle;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

(window as unknown as { __weaponSetFrame?: (v: { frame?: number; t?: number; angle?: number }) => void }).__weaponSetFrame = (v) => {
  auto = false;
  if (typeof v.angle === 'number') angle = v.angle;
  else if (typeof v.t === 'number') angle = -0.15 + v.t * Math.PI * 2 * 0.32;
  else if (typeof v.frame === 'number') angle = -0.15 + (v.frame / 48) * Math.PI * 2;
  model.rotation.y = angle;
  renderer.render(scene, camera);
};
(window as unknown as { __weaponSetWeapon?: (id: WeaponModelId) => void }).__weaponSetWeapon = (id) => rebuild(id);
(window as unknown as { __weaponDebug?: () => unknown }).__weaponDebug = () => ({
  weapon: current,
  angle,
  visible: model.visible,
  parts: model.children.length,
  box: new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray(),
  render: [renderer.domElement.width, renderer.domElement.height],
});
(window as unknown as { __weaponReady?: boolean }).__weaponReady = true;
