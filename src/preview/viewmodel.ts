import * as THREE from 'three';
import { WeaponViewmodel } from '../game/weapons/viewmodel';

const stage = document.getElementById('vm-stage')!;
const params = new URLSearchParams(location.search);
if (params.get('capture') === '1') document.body.classList.add('capture');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a1012');
scene.fog = new THREE.FogExp2('#0a1012', 0.12);
const camera = new THREE.PerspectiveCamera(72, 1, 0.01, 12);
scene.add(camera);

const vm = new WeaponViewmodel(camera);
const rig = new THREE.Group();
rig.position.set(0.2, 0.08, -0.25);
rig.scale.setScalar(0.8);
rig.rotation.y = -0.08;
camera.add(rig);
rig.add(vm.group);
vm.setEquipped(true);
vm.setAds(true);

scene.add(new THREE.HemisphereLight(0xd8e8e2, 0x161d1f, 2.4));
const key = new THREE.DirectionalLight(0xffe0b8, 3.4);
key.position.set(2, 3, 2);
scene.add(key);
const fill = new THREE.DirectionalLight(0x66c6df, 1.8);
fill.position.set(-3, 1.5, 1);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xff9a55, 1.4);
rim.position.set(-1, 2, -3);
scene.add(rim);

const grid = new THREE.GridHelper(10, 20, 0x2d484b, 0x1a2a2d);
grid.position.y = -0.55;
scene.add(grid);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

let currentAction = '';
let lastT = 0;
let lastShot = -1;
let fireClock = 0;

function reset(action: string) {
  currentAction = action;
  lastT = 0;
  lastShot = -1;
  fireClock = 0;
  vm.setEquipped(true);
  vm.setAds(action === 'ads');
  if (action === 'reload') vm.reload(2.2);
}

(window as any).__vmSetFrame = (action: 'hip' | 'ads' | 'fire' | 'reload', t: number) => {
  if (action !== currentAction) reset(action);
  const total = action === 'reload' ? 2.35 : action === 'fire' ? 1.6 : 1.0;
  const time = t * total;
  let dt = Math.max(0, time - lastT);
  if (dt === 0) dt = 1 / 30;
  lastT = time;
  if (action === 'fire') {
    fireClock += dt;
    if (fireClock >= 0.11) {
      fireClock = 0;
      vm.fire();
      lastShot++;
    }
  }
  const bob = action === 'hip' ? Math.sin(time * 4) * 0.012 : 0;
  vm.update(dt, bob, false);
  renderer.render(scene, camera);
  return { action, time, lastShot };
};
(window as any).__vmDebug = () => ({ action: currentAction, position: vm.group.position.toArray(), visible: vm.group.visible });
(window as any).__vmReady = true;
renderer.render(scene, camera);
