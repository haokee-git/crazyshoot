import * as THREE from 'three';
import { createBlockyCharacter } from '../game/characters/rig';
import {
  CHARACTER_ACTIONS,
  applyCharacterAction,
  getAnimationClip,
  type CharacterAction,
} from '../game/characters/animations';

const params = new URLSearchParams(location.search);
const action = (params.get('action') as CharacterAction) in Object.fromEntries(CHARACTER_ACTIONS.map((a) => [a, true]))
  ? (params.get('action') as CharacterAction)
  : 'walk';
const team = params.get('team') === 'orange' ? 'orange' : 'blue';
const capture = params.get('capture') === '1';
const view = params.get('view') || 'threequarter';
const orbitFrames = Number(params.get('orbitFrames') || 72);
const orbitT = Number(params.get('orbitT') || 0.22);
const orbitZoom = params.get('orbitZoom') || 'full';
const orbitArc = Number(params.get('orbitArc') || 360) * (Math.PI / 180);
const orbitStart = Number(params.get('orbitStart') || -45) * (Math.PI / 180);

const stage = document.getElementById('stage')!;
const actionLabel = document.getElementById('action-label')!;
const actionSub = document.getElementById('action-sub')!;
const teamLabel = document.getElementById('team-label')!;
const fpsLabel = document.getElementById('fps-label')!;
const frameLabel = document.getElementById('frame-label')!;

const clip = getAnimationClip(action);
const actionNames: Record<string, string> = {
  idle: 'IDLE',
  walk: 'WALK',
  run: 'RUN',
  sprint: 'SPRINT',
  crouch_idle: 'CROUCH IDLE',
  crouch_walk: 'CROUCH WALK',
  prone_idle: 'PRONE IDLE',
  crawl: 'CRAWL',
  aim: 'AIM',
  fire: 'FIRE',
  reload: 'RELOAD',
  jump: 'JUMP',
  land: 'LAND',
  vault: 'VAULT',
  death: 'DEATH',
  vehicle_sit: 'VEHICLE SIT',
  vehicle_drive: 'VEHICLE DRIVE',
};
actionLabel.textContent = actionNames[action] ?? action.toUpperCase();
actionSub.textContent = `${clip.loop ? 'LOOP' : 'ONE-SHOT'} / ${clip.duration.toFixed(2)}S`;
teamLabel.textContent = team.toUpperCase();
fpsLabel.textContent = '30 FPS / LOOP';

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.setSize(640, 640);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.insertBefore(renderer.domElement, stage.firstChild);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0e11');
scene.fog = new THREE.FogExp2('#0a0e11', 0.075);

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
camera.position.set(2.45, 1.95, 3.85);
camera.lookAt(0, 0.98, 0);

// lighting: cheap 3-point toon-ish studio
scene.add(new THREE.HemisphereLight(0xa9c8c4, 0x141a1c, 1.25));
scene.add(new THREE.AmbientLight(0x9aa8a4, 0.32));
const key = new THREE.DirectionalLight(0xffe6c4, 2.4);
key.position.set(3.2, 5.2, 4.2);
scene.add(key);
const fill = new THREE.DirectionalLight(0x55c7e6, 1.1);
fill.position.set(-4, 2.2, 1.5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xff9d57, 1.3);
rim.position.set(-1, 3.2, -4.5);
scene.add(rim);

// floor disc + grid
const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(1.28, 1.38, 0.08, 48),
  new THREE.MeshLambertMaterial({ color: 0x1a2226 }),
);
disc.position.y = -0.06;
scene.add(disc);

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(1.18, 0.007, 8, 80),
  new THREE.MeshBasicMaterial({ color: 0x35e0d0, transparent: true, opacity: 0.6 }),
);
ring.rotation.x = Math.PI / 2;
ring.position.y = -0.012;
scene.add(ring);

const grid = new THREE.GridHelper(2.6, 13, 0x2e4648, 0x1a2a2d);
grid.position.y = -0.011;
scene.add(grid);

// outer accent marks
const markMat = new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.65 });
for (const [x, z, w, d] of [
  [-1.32, 0, 0.12, 0.02],
  [1.32, 0, 0.12, 0.02],
  [0, -1.32, 0.02, 0.12],
  [0, 1.32, 0.02, 0.12],
]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.005, d), markMat);
  m.position.set(x, 0.002, z);
  scene.add(m);
}

// blob shadow
const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.55, 28),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }),
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.001;
scene.add(shadow);

const debugHands = params.get('debug') === '1';
const rig = createBlockyCharacter(team, { debugHands });
rig.root.rotation.y = -18 * (Math.PI / 180);
scene.add(rig.root);

// Simple cockpit context for vehicle actions (preview only; replaced by real vehicle in game).
const cockpit = new THREE.Group();
const cockpitMat = new THREE.MeshLambertMaterial({ color: 0x242d2f, flatShading: true });
const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.62), cockpitMat);
seatBase.position.set(0, 0.44, -0.02);
cockpit.add(seatBase);
const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.6, 0.1), cockpitMat);
seatBack.position.set(0, 0.73, -0.3);
cockpit.add(seatBack);
const dash = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 0.1), cockpitMat);
dash.position.set(0, 0.72, 0.48);
cockpit.add(dash);
const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 20), new THREE.MeshLambertMaterial({ color: 0x111617 }));
wheel.position.set(0, 0.78, 0.4);
wheel.rotation.x = -0.55;
cockpit.add(wheel);
const frameMat = new THREE.MeshLambertMaterial({ color: 0x394346, flatShading: true });
for (const [x, z] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.45], [0.55, 0.45]] as const) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.06), frameMat);
  post.position.set(x, 0.65, z);
  cockpit.add(post);
}
cockpit.visible = false;
scene.add(cockpit);

const actionName = action;
const actionMeta = clip;

function setFrame(t: number, frameIndex?: number) {
  const poseT = view === 'orbit' ? orbitT : t;
  applyCharacterAction(rig, actionName, poseT);
  const previewYaw = Number(params.get('yaw') || 0) * (Math.PI / 180);
  rig.root.rotation.y = previewYaw;
  // camera framing per action
  cockpit.visible = action === 'vehicle_sit' || action === 'vehicle_drive';
  if (view === 'orbit') {
    const idx = frameIndex ?? 0;
    const phase = idx / Math.max(1, orbitFrames - 1);
    const angle = orbitArc >= Math.PI * 2 - 0.001
      ? orbitStart + phase * Math.PI * 2
      : orbitStart + orbitArc * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
    const hands = orbitZoom === 'hands';
    const target = hands ? new THREE.Vector3(0.08, 1.1, 0.24) : new THREE.Vector3(0, 1.02, 0.05);
    const dist = hands ? 2.2 : 4.4;
    camera.position.set(
      target.x + Math.sin(angle) * dist,
      hands ? 2.45 : 2.15,
      target.z + Math.cos(angle) * dist,
    );
    camera.lookAt(target);
  } else if (view === 'hands') {
    camera.position.set(1.55, 1.55, 1.25);
    camera.lookAt(0.02, 1.14, 0.22);
  } else if (view === 'side') {
    camera.position.set(4.0, 2.0, 0.9);
    camera.lookAt(0, 0.95, 0.1);
  } else if (view === 'right') {
    // 从角色右侧看：后握把上的右手在近侧，不被枪身挡住。
    camera.position.set(-4.0, 2.0, 0.9);
    camera.lookAt(0, 0.95, 0.1);
  } else if (view === 'backright') {
    camera.position.set(-3.2, 2.25, -3.8);
    camera.lookAt(0, 1.15, 0.15);
  } else if (view === 'overright') {
    camera.position.set(-1.15, 2.05, -3.35);
    camera.lookAt(0, 1.2, 0.35);
  } else if (view === 'frontupper') {
    camera.position.set(0.05, 1.65, 2.65);
    camera.lookAt(0, 1.18, 0.2);
  } else if (view === 'behind') {
    camera.position.set(0, 2.05, -4.6);
    camera.lookAt(0, 1.15, 0.2);
  } else if (view === 'lowleft') {
    camera.position.set(2.2, 1.15, 2.9);
    camera.lookAt(0.02, 1.2, 0.28);
  } else if (view === 'topback') {
    camera.position.set(-1.5, 3.2, -3.0);
    camera.lookAt(0, 1.1, 0.2);
  } else if (view === 'topdownclose') {
    camera.up.set(0, 0, 1);
    camera.position.set(0, 3.7, 0.02);
    camera.lookAt(0, 1.12, 0.18);
  } else if (view === 'topdown') {
    camera.up.set(0, 0, 1);
    camera.position.set(0, 6.2, 0.02);
    camera.lookAt(0, 0.9, 0.18);
  } else if (view === 'top') {
    camera.position.set(0, 4.6, 1.6);
    camera.lookAt(0, 1.0, 0.15);
  } else if (view === 'front') {
    camera.position.set(0.08, 1.7, 4.05);
    camera.lookAt(0, 0.95, 0);
  } else if (action === 'death') {
    camera.position.set(3.9, 1.65, 1.05);
    camera.lookAt(0, 0.6, -0.35);
  } else if (action === 'prone_idle' || action === 'crawl') {
    camera.position.set(3.7, 1.9, 1.55);
    camera.lookAt(0, 0.32, 0.35);
  } else if (action === 'vehicle_sit' || action === 'vehicle_drive') {
    camera.position.set(2.9, 1.85, 4.1);
    camera.lookAt(0, 0.72, 0.2);
  } else {
    // 左前方机位：右手/后握把在近侧，避免被枪身挡住。
    camera.position.set(-2.45, 1.95, 3.85);
    camera.lookAt(0, 0.98, 0);
  }
  if (typeof frameIndex === 'number') frameLabel.textContent = `FRAME ${String(frameIndex).padStart(3, '0')}`;
  renderer.render(scene, camera);
}

// @ts-expect-error preview bridge
window.__previewSetFrame = ({ frame, t }: { frame: number; t: number }) => {
  setFrame(t, frame);
};
// @ts-expect-error preview bridge
window.__previewDebug = () => ({
  action,
  rootRot: rig.root.rotation.toArray(),
  rootPos: rig.root.position.toArray(),
  bodyRot: rig.body.rotation.toArray(),
  bodyPos: rig.body.position.toArray(),
});
// @ts-expect-error preview bridge
window.__previewReady = true;

setFrame(0, 0);

if (!capture) {
  const start = performance.now();
  let raf = 0;
  const loop = () => {
    const t = ((performance.now() - start) / 1000) % actionMeta.duration;
    setFrame(t);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  stage.addEventListener('click', () => cancelAnimationFrame(raf));
}
