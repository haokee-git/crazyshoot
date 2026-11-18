import * as THREE from 'three';
import { resetRig, type BoneName, type CharacterRig } from './rig';

const D = Math.PI / 180;
const ARM_UPPER = 0.34;
const ARM_FORE = 0.30;

export type CharacterAction =
  | 'climb'
  | 'mantle'
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'crouch_idle'
  | 'crouch_walk'
  | 'prone_idle'
  | 'crawl'
  | 'aim'
  | 'fire'
  | 'reload'
  | 'jump'
  | 'land'
  | 'vault'
  | 'death'
  | 'vehicle_sit'
  | 'vehicle_drive'
  | 'swim'
  | 'swim_idle';

export interface AnimationClip {
  action: CharacterAction;
  duration: number;
  loop: boolean;
  apply(rig: CharacterRig, t: number): void;
}

type Rot = [number, number, number];

function setRot(rig: CharacterRig, name: BoneName, rot: Rot) {
  rig.bones[name].rotation.set(rot[0] * D, rot[1] * D, rot[2] * D);
}

function setPos(rig: CharacterRig, name: BoneName, pos: [number, number, number]) {
  rig.bones[name].position.set(pos[0], pos[1], pos[2]);
}

function legSwing(rig: CharacterRig, side: 'L' | 'R', amount: number, kneeAmount = 0, foot = 0) {
  setRot(rig, `hip${side}` as BoneName, [-amount, 0, 0]);
  setRot(rig, `knee${side}` as BoneName, [Math.max(0, kneeAmount), 0, 0]);
  setRot(rig, `ankle${side}` as BoneName, [foot, 0, 0]);
}

function armSwing(rig: CharacterRig, side: 'L' | 'R', amount: number, elbow = 0, out = 0) {
  setRot(rig, `shoulder${side}` as BoneName, [amount, 0, (side === 'L' ? -1 : 1) * out]);
  setRot(rig, `elbow${side}` as BoneName, [elbow, 0, 0]);
}


function weaponPoints(rig: CharacterRig) {
  // 必须叠加 weapon 自身的局部位置/旋转，否则 IK 手会落到握把下方。
  const mountQ = rig.weaponMount.quaternion;
  const weaponPos = rig.weapon.position
    .clone()
    .applyQuaternion(mountQ)
    .add(rig.weaponMount.position);
  const weaponQ = mountQ.clone().multiply(rig.weapon.quaternion);
  const grip = new THREE.Vector3(0, -0.13, 0.08).applyQuaternion(weaponQ).add(weaponPos);
  const handguard = new THREE.Vector3(0, 0.02, 0.18).applyQuaternion(weaponQ).add(weaponPos);
  return { grip, handguard };
}

/** 2-bone arm IK in torso-local space; target is the wrist position. */
function solveArm(
  rig: CharacterRig,
  side: 'L' | 'R',
  targetTorso: THREE.Vector3,
  poleTorso: THREE.Vector3,
) {
  const shoulder = rig.bones[`shoulder${side}`];
  const elbow = rig.bones[`elbow${side}`];
  const S = shoulder.position.clone();
  const T = targetTorso.clone();
  const raw = T.clone().sub(S);
  const dist = THREE.MathUtils.clamp(raw.length(), 0.08, ARM_UPPER + ARM_FORE - 0.004);
  const dir = raw.normalize();
  const Tadj = S.clone().add(dir.clone().multiplyScalar(dist));
  let pole = poleTorso.clone().sub(dir.clone().multiplyScalar(poleTorso.dot(dir)));
  if (pole.lengthSq() < 1e-7) pole.set(0, 0, 1);
  pole.normalize();
  const cosA = (ARM_UPPER * ARM_UPPER + dist * dist - ARM_FORE * ARM_FORE) / (2 * ARM_UPPER * dist);
  const a = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
  const upperDir = dir
    .clone()
    .multiplyScalar(Math.cos(a))
    .add(pole.clone().multiplyScalar(Math.sin(a)))
    .normalize();
  const E = S.clone().add(upperDir.clone().multiplyScalar(ARM_UPPER));
  const foreDir = Tadj.clone().sub(E).normalize();
  const qShoulder = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), upperDir);
  shoulder.quaternion.copy(qShoulder);
  const foreLocal = foreDir.clone().applyQuaternion(qShoulder.clone().invert()).normalize();
  const qElbow = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), foreLocal);
  elbow.quaternion.copy(qElbow);
  rig.bones[`wrist${side}`].rotation.set(0, 0, 0);
}

type HoldMode = 'low' | 'aim' | 'reload' | 'prone';

/**
 * 双手持枪：
 * - 武器挂在胸前 weaponMount，不再跟手腕转，避免“拿枪托”；
 * - 右手 IK 到握把，左手 IK 到护木（换弹时左手去弹匣）；
 * - 枪托在右手后方，枪管朝前。
 */
function twoHanded(rig: CharacterRig, mode: HoldMode, recoil = 0) {
  const m = rig.weaponMount;
  rig.weapon.visible = true;
  if (mode === 'aim') {
    m.position.set(-0.18, 0.32 - recoil * 0.012, 0.70 - recoil * 0.025);
    m.rotation.set(-1.5 * D, 0, 0);
  } else if (mode === 'reload') {
    m.position.set(-0.18, 0.30, 0.66);
    m.rotation.set(-55 * D, 8 * D, 0);
  } else if (mode === 'prone') {
    m.position.set(-0.18, 0.18, 0.62);
    m.rotation.set(-2 * D, 0, 0);
  } else {
    // 右肩挂点：与肩同高，整体前移，枪托不再穿胸口/背包。
    m.position.set(-0.18, 0.30, 0.66);
    m.rotation.set(-2.5 * D, 0, 0);
  }
  const { grip, handguard } = weaponPoints(rig);
  // 左手从护木左下侧包住，而不是从上面压住。
  const support = handguard.clone().add(new THREE.Vector3(-0.045, -0.05, 0.01));
  // 枪在 -X：握把手 L(-X)；托手 R(+X)。
  // 右肩前送/内收，主动去接前移后的枪托，避免把枪往回拉导致穿模。
  rig.bones.shoulderL.position.set(-0.22, 0.38, 0.14);
  rig.bones.shoulderR.position.set(0.18, 0.38, 0.2);
  solveArm(rig, 'L', grip, new THREE.Vector3(-0.95, -0.75, 0.15));
  if (mode === 'reload') {
    const weaponPos = rig.weapon.position.clone().applyQuaternion(m.quaternion).add(m.position);
    const weaponQ = m.quaternion.clone().multiply(rig.weapon.quaternion);
    const mag = rig.magazine.position.clone().applyQuaternion(weaponQ).add(weaponPos);
    // 另一只手去弹匣；握把手 L(-X)保持握把
    solveArm(rig, 'R', mag, new THREE.Vector3(0.85, -0.95, 0.1));
  } else {
    solveArm(rig, 'R', support, new THREE.Vector3(0.55, -1.0, 0.15));
  }
}

function baseStand(rig: CharacterRig) {
  setPos(rig, 'hips', [0, 0.92, 0]);
  setRot(rig, 'torso', [0, 0, 0]);
  setRot(rig, 'head', [0, 0, 0]);
  setRot(rig, 'hipL', [0, 0, 0]);
  setRot(rig, 'hipR', [0, 0, 0]);
  setRot(rig, 'kneeL', [0, 0, 0]);
  setRot(rig, 'kneeR', [0, 0, 0]);
  setRot(rig, 'ankleL', [0, 0, 0]);
  setRot(rig, 'ankleR', [0, 0, 0]);
  setRot(rig, 'shoulderL', [0, 0, 0]);
  setRot(rig, 'shoulderR', [0, 0, 0]);
  setRot(rig, 'elbowL', [0, 0, 0]);
  setRot(rig, 'elbowR', [0, 0, 0]);
  setRot(rig, 'wristL', [0, 0, 0]);
  setRot(rig, 'wristR', [0, 0, 0]);
}

function baseCrouch(rig: CharacterRig) {
  baseStand(rig);
  setPos(rig, 'hips', [0, 0.56, 0]);
  setRot(rig, 'torso', [20, 0, 0]);
  setRot(rig, 'head', [-8, 0, 0]);
  setRot(rig, 'hipL', [-70, 0, -4]);
  setRot(rig, 'hipR', [-70, 0, 4]);
  setRot(rig, 'kneeL', [112, 0, 0]);
  setRot(rig, 'kneeR', [112, 0, 0]);
  setRot(rig, 'ankleL', [-38, 0, 0]);
  setRot(rig, 'ankleR', [-38, 0, 0]);
  setRot(rig, 'shoulderL', [-18, 0, -5]);
  setRot(rig, 'shoulderR', [-18, 0, 5]);
  setRot(rig, 'elbowL', [-50, 0, 0]);
  setRot(rig, 'elbowR', [-50, 0, 0]);
}

function baseProne(rig: CharacterRig) {
  baseStand(rig);
  rig.body.rotation.x = 82 * D;
  rig.body.position.y = 0.07;
  setPos(rig, 'hips', [0, 0.92, 0]);
  setRot(rig, 'torso', [-6, 0, 0]);
  setRot(rig, 'head', [-62, 0, 0]);
  setRot(rig, 'hipL', [4, 0, -5]);
  setRot(rig, 'hipR', [4, 0, 5]);
  setRot(rig, 'kneeL', [6, 0, 0]);
  setRot(rig, 'kneeR', [6, 0, 0]);
  setRot(rig, 'shoulderL', [-72, 0, -28]);
  setRot(rig, 'shoulderR', [-72, 0, 28]);
  setRot(rig, 'elbowL', [-58, 0, 0]);
  setRot(rig, 'elbowR', [-58, 0, 0]);
}

function aimPose(rig: CharacterRig, recoil = 0) {
  setPos(rig, 'hips', [0, 0.92, 0]);
  setRot(rig, 'torso', [4 + recoil * 2, -4, 0]);
  setRot(rig, 'head', [-2, 6, 0]);
  setRot(rig, 'hipL', [-4, 0, -3]);
  setRot(rig, 'hipR', [-4, 0, 3]);
  setRot(rig, 'kneeL', [8, 0, 0]);
  setRot(rig, 'kneeR', [8, 0, 0]);
  twoHanded(rig, 'aim', recoil);
}
function idle(rig: CharacterRig, t: number) {
  baseStand(rig);
  const p = (t / 2.4) * Math.PI * 2;
  setRot(rig, 'torso', [1.2 + Math.sin(p) * 0.8, Math.sin(p * 0.5) * 1.4, Math.sin(p * 0.5) * 0.8]);
  setRot(rig, 'head', [Math.sin(p * 0.5) * 1.2, Math.sin(p * 0.3) * 2, 0]);
  twoHanded(rig, 'low');
  rig.bones.hips.position.y = 0.92 + Math.sin(p) * 0.005;
}

function walk(rig: CharacterRig, t: number, speedScale = 1) {
  baseStand(rig);
  const p = (t / (1.0 / speedScale)) * Math.PI * 2;
  const s = Math.sin(p);
  const c = Math.cos(p);
  const step = 32 * speedScale;
  legSwing(rig, 'L', step * s, Math.max(0, 42 * speedScale * Math.sin(p + Math.PI * 0.5)), 8);
  legSwing(rig, 'R', -step * s, Math.max(0, 42 * speedScale * Math.sin(p - Math.PI * 0.5)), 8);
  setRot(rig, 'torso', [3 + Math.abs(c) * 2, -s * 4, -s * 2]);
  setRot(rig, 'head', [-1, s * 3, 0]);
  twoHanded(rig, 'low');
  rig.bones.hips.position.y = 0.92 + Math.abs(s) * 0.025;
}

function run(rig: CharacterRig, t: number, sprint = false) {
  baseStand(rig);
  const speed = sprint ? 0.68 : 0.78;
  const p = (t / speed) * Math.PI * 2;
  const s = Math.sin(p);
  const c = Math.cos(p);
  const step = sprint ? 58 : 48;
  legSwing(rig, 'L', step * s, Math.max(0, 70 * Math.abs(Math.sin(p + Math.PI * 0.5))), 10);
  legSwing(rig, 'R', -step * s, Math.max(0, 70 * Math.abs(Math.sin(p - Math.PI * 0.5))), 10);
  setRot(rig, 'torso', [sprint ? 14 : 10, -s * 8, -s * 2]);
  setRot(rig, 'head', [-6, s * 5, 0]);
  twoHanded(rig, 'low');
  rig.bones.hips.position.y = 0.92 + Math.abs(c) * 0.042;
}

const clips: Record<CharacterAction, AnimationClip> = {
 mantle:{action:'mantle',duration:.72,loop:false,apply:(rig,t)=>{const p=t/.72,lift=Math.sin(Math.PI*p);rig.bones.torso.rotation.x=.25*lift;rig.bones.shoulderL.rotation.x=-2.5+1.5*p;rig.bones.shoulderR.rotation.x=-2.5+1.5*p;rig.bones.elbowL.rotation.x=-.7*lift;rig.bones.elbowR.rotation.x=-.7*lift;rig.bones.hipL.rotation.x=-1.2*lift;rig.bones.kneeL.rotation.x=1.5*lift;rig.bones.hipR.rotation.x=-.6*lift;rig.bones.kneeR.rotation.x=.9*lift;rig.weapon.visible=false;rig.weapon.scale.setScalar(.001);}},
 climb:{action:'climb',duration:Math.PI/3,loop:true,apply:(rig,t)=>{const cycle=Math.sin(t*6);rig.bones.torso.rotation.x=.08;rig.bones.shoulderL.rotation.x=-2.6+cycle*.32;rig.bones.shoulderR.rotation.x=-2.6-cycle*.32;rig.bones.elbowL.rotation.x=-.5;rig.bones.elbowR.rotation.x=-.5;rig.bones.hipL.rotation.x=cycle*.55;rig.bones.hipR.rotation.x=-cycle*.55;rig.bones.kneeL.rotation.x=Math.max(0,-cycle)*.8;rig.bones.kneeR.rotation.x=Math.max(0,cycle)*.8;rig.weapon.visible=false;rig.weapon.scale.setScalar(.001);}},
  idle: { action: 'idle', duration: 2.4, loop: true, apply: idle },
  walk: { action: 'walk', duration: 1.0, loop: true, apply: (r, t) => walk(r, t) },
  run: { action: 'run', duration: 0.78, loop: true, apply: (r, t) => run(r, t) },
  sprint: { action: 'sprint', duration: 0.68, loop: true, apply: (r, t) => run(r, t, true) },
  crouch_idle: {
    action: 'crouch_idle',
    duration: 2.4,
    loop: true,
    apply: (r, t) => {
      baseCrouch(r);
      const p = (t / 2.4) * Math.PI * 2;
      // 与 baseCrouch（20°/−8°）对齐，姿态过渡结束时不跳变。
      setRot(r, 'torso', [20 + Math.sin(p) * 1, 0, Math.sin(p * 0.5) * 0.8]);
      setRot(r, 'head', [-8 + Math.sin(p * 0.5) * 1, Math.sin(p * 0.3) * 2, 0]);
      twoHanded(r, 'low');
    },
  },
  crouch_walk: {
    action: 'crouch_walk',
    duration: 1.2,
    loop: true,
    apply: (r, t) => {
      baseCrouch(r);
      const p = (t / 1.2) * Math.PI * 2;
      const s = Math.sin(p);
      setRot(r, 'hipL', [-70 - 14 * s, 0, -4]);
      setRot(r, 'hipR', [-70 + 14 * s, 0, 4]);
      setRot(r, 'kneeL', [112 + 16 * s, 0, 0]);
      setRot(r, 'kneeR', [112 - 16 * s, 0, 0]);
      setRot(r, 'torso', [20, -s * 4, 0]);
      setRot(r, 'head', [-4, s * 3, 0]);
      twoHanded(r, 'low');
    },
  },
  prone_idle: {
    action: 'prone_idle',
    duration: 2.4,
    loop: true,
    apply: (r, t) => {
      baseProne(r);
      const p = (t / 2.4) * Math.PI * 2;
      r.bones.head.rotation.x += Math.sin(p * 0.5) * 1.2 * D;
      twoHanded(r, 'prone');
    },
  },
  crawl: {
    action: 'crawl',
    duration: 1.4,
    loop: true,
    apply: (r, t) => {
      baseProne(r);
      const p = (t / 1.4) * Math.PI * 2;
      const s = Math.sin(p);
      setRot(r, 'shoulderL', [-72 + s * 16, 0, -28]);
      setRot(r, 'shoulderR', [-72 - s * 16, 0, 28]);
      setRot(r, 'hipL', [4 + s * 4, 0, -5]);
      setRot(r, 'hipR', [4 - s * 4, 0, 5]);
      r.body.position.y = 0.07 + Math.abs(s) * 0.01;
      twoHanded(r, 'prone');
    },
  },
  aim: {
    action: 'aim',
    duration: 1.2,
    loop: true,
    apply: (r, t) => {
      aimPose(r);
      const p = (t / 1.2) * Math.PI * 2;
      setRot(r, 'torso', [4 + Math.sin(p) * 0.8, -4, 0]);
      r.bones.hips.position.y = 0.92 + Math.sin(p) * 0.004;
    },
  },
  fire: {
    action: 'fire',
    duration: 0.42,
    loop: true,
    apply: (r, t) => {
      const p = t / 0.42;
      const recoil = Math.max(0, 1 - p * 3.5);
      aimPose(r, recoil);
      setRot(r, 'torso', [4 + recoil * 3, -4, 0]);
      setRot(r, 'head', [-2 + recoil * 2, 6, 0]);
    },
  },
  reload: {
    action: 'reload',
    duration: 2.2,
    loop: true,
    apply: (r, t) => {
      aimPose(r);
      const p = t / 2.2;
      const mag = Math.sin(Math.min(1, p * 1.8) * Math.PI);
      setRot(r, 'torso', [4 + mag * 4, -4 - mag * 3, 0]);
      setRot(r, 'head', [-2, 6 - mag * 4, 0]);
      r.magazine.position.set(0, -0.12 - mag * 0.28, 0.19 + mag * 0.06);
      r.magazine.rotation.set(mag * 0.22, 0, 0);
      twoHanded(r, 'reload');
    },
  },
  jump: {
    action: 'jump',
    duration: 0.8,
    loop: true,
    apply: (r, t) => {
      baseStand(r);
      const p = Math.min(1, t / 0.8);
      const air = Math.sin(p * Math.PI);
      setRot(r, 'hipL', [-28 - air * 18, 0, -3]);
      setRot(r, 'hipR', [-28 - air * 18, 0, 3]);
      setRot(r, 'kneeL', [45 + air * 30, 0, 0]);
      setRot(r, 'kneeR', [45 + air * 30, 0, 0]);
      setRot(r, 'shoulderL', [-35 - air * 18, 0, -10]);
      setRot(r, 'shoulderR', [-35 - air * 18, 0, 10]);
      setRot(r, 'elbowL', [-40, 0, 0]);
      setRot(r, 'elbowR', [-40, 0, 0]);
      setRot(r, 'torso', [8, 0, 0]);
      r.body.position.y = air * 0.18;
      twoHanded(r, 'low');
    },
  },
  land: {
    action: 'land',
    duration: 0.5,
    loop: true,
    apply: (r, t) => {
      baseCrouch(r);
      const p = Math.min(1, t / 0.5);
      const k = Math.sin(p * Math.PI);
      r.bones.hips.position.y = 0.64 + k * 0.08;
      setRot(r, 'torso', [12 + k * 5, 0, 0]);
      setRot(r, 'head', [-6, 0, 0]);
      twoHanded(r, 'low');
    },
  },
  vault: {
    action: 'vault',
    duration: 0.9,
    loop: true,
    apply: (r, t) => {
      baseStand(r);
      const p = Math.min(1, t / 0.9);
      const k = Math.sin(p * Math.PI);
      setRot(r, 'torso', [22 * k, 0, 0]);
      setRot(r, 'head', [-8 * k, 0, 0]);
      setRot(r, 'shoulderL', [-70 * k, 0, -18]);
      setRot(r, 'shoulderR', [-70 * k, 0, 18]);
      setRot(r, 'elbowL', [-30, 0, 0]);
      setRot(r, 'elbowR', [-30, 0, 0]);
      setRot(r, 'hipL', [-55 * k, 0, -4]);
      setRot(r, 'hipR', [-55 * k, 0, 4]);
      setRot(r, 'kneeL', [80 * k, 0, 0]);
      setRot(r, 'kneeR', [80 * k, 0, 0]);
      r.body.position.y = k * 0.16;
      twoHanded(r, 'low');
    },
  },
  death: {
    action: 'death',
    duration: 1.2,
    loop: false,
    apply: (r, t) => {
      baseStand(r);
      const p = Math.min(1, t / 0.9);
      const e = p * p * (3 - 2 * p);
      const buckle = Math.sin(Math.PI * p);
      r.root.rotation.x = -88 * D * e;
      r.root.position.y = .22 * e;
      r.bones.hips.position.y -= .24 * buckle;
      setRot(r, 'torso', [-6 * e, 0, 7 * e]);
      setRot(r, 'head', [18 * e, 10 * e, 4 * e]);
      setRot(r, 'shoulderL', [10 * e, 0, -35 * e]);
      setRot(r, 'shoulderR', [15 * e, 0, 40 * e]);
      setRot(r, 'elbowL', [-5 * e, 0, 0]);
      setRot(r, 'elbowR', [-8 * e, 0, 0]);
      setRot(r, 'hipL', [-10 * e, 0, -7 * e]);
      setRot(r, 'hipR', [-6 * e, 0, 7 * e]);
      setRot(r, 'kneeL', [24 * e, 0, 0]);
      setRot(r, 'kneeR', [18 * e, 0, 0]);
      r.weapon.visible = false;
      r.weapon.scale.setScalar(.00001);
    },
  },
  vehicle_sit: {
    action: 'vehicle_sit',
    duration: 2.4,
    loop: true,
    apply: (r, t) => {
      baseStand(r);
      r.weapon.visible = false;
      r.weapon.scale.setScalar(.00001);
      setPos(r, 'hips', [0, 0.58, 0]);
      r.body.position.y = 0;
      setRot(r, 'torso', [-4, 0, 0]);
      setRot(r, 'head', [0, 0, 0]);
      setRot(r, 'hipL', [-92, 0, -6]);
      setRot(r, 'hipR', [-92, 0, 6]);
      setRot(r, 'kneeL', [88, 0, 0]);
      setRot(r, 'kneeR', [88, 0, 0]);
      setRot(r, 'ankleL', [-10, 0, 0]);
      setRot(r, 'ankleR', [-10, 0, 0]);
      setRot(r, 'shoulderL', [-52, 0, -10]);
      setRot(r, 'shoulderR', [-52, 0, 10]);
      setRot(r, 'elbowL', [-50, 0, 0]);
      setRot(r, 'elbowR', [-50, 0, 0]);
      const p = (t / 2.4) * Math.PI * 2;
      setRot(r, 'torso', [-4 + Math.sin(p) * 0.6, 0, 0]);
    },
  },
  vehicle_drive: {
    action: 'vehicle_drive',
    duration: 2.4,
    loop: true,
    apply: (r, t) => {
      baseStand(r);
      r.weapon.visible = false;
      r.weapon.scale.setScalar(.00001);
      const p = (t / 2.4) * Math.PI * 2;
      setPos(r, 'hips', [0, 0.58, 0]);
      setRot(r, 'torso', [-4, Math.sin(p) * 2, 0]);
      setRot(r, 'head', [-1, Math.sin(p * 0.7) * 6, 0]);
      setRot(r, 'hipL', [-92, 0, -6]);
      setRot(r, 'hipR', [-92, 0, 6]);
      setRot(r, 'kneeL', [88, 0, 0]);
      setRot(r, 'kneeR', [88, 0, 0]);
      setRot(r, 'ankleL', [-10, 0, 0]);
      setRot(r, 'ankleR', [-10, 0, 0]);
      setRot(r, 'shoulderL', [-66 + Math.sin(p) * 8, 0, -28]);
      setRot(r, 'shoulderR', [-66 + Math.sin(p + Math.PI) * 8, 0, 28]);
      setRot(r, 'elbowL', [-36, 0, 0]);
      setRot(r, 'elbowR', [-36, 0, 0]);
      setRot(r, 'wristL', [0, 0, 0]);
      setRot(r, 'wristR', [0, 0, 0]);
    },
  },
  swim_idle: {
    action: 'swim_idle',
    duration: 2.2,
    loop: true,
    apply: (r, t) => {
      baseStand(r);
      r.weapon.visible = false;
      r.weapon.scale.setScalar(.00001);
      const sway = Math.sin(t * Math.PI * 2 / 2.2);
      setPos(r, 'hips', [0, .82 + sway * .018, 0]);
      setRot(r, 'shoulderL', [-24, 0, -32 - sway * 8]);
      setRot(r, 'shoulderR', [-24, 0, 32 - sway * 8]);
      setRot(r, 'elbowL', [-28, 0, 0]);
      setRot(r, 'elbowR', [-28, 0, 0]);
      setRot(r, 'hipL', [-12 + sway * 9, 0, -5]);
      setRot(r, 'hipR', [-12 - sway * 9, 0, 5]);
      setRot(r, 'kneeL', [24 - sway * 8, 0, 0]);
      setRot(r, 'kneeR', [24 + sway * 8, 0, 0]);
    },
  },
  swim: {
    action: 'swim',
    duration: 1.8,
    loop: true,
    apply: (r, t) => {
      baseStand(r);
      r.weapon.visible = false;
      r.weapon.scale.setScalar(.00001);
      const p = (t / 1.8) * Math.PI * 2;
      setPos(r, 'hips', [0, 0.42, 0]);
      setRot(r, 'torso', [-18, 0, 0]);
      setRot(r, 'head', [2, 0, 0]);
      setRot(r, 'shoulderL', [-118 + Math.sin(p) * 10, 0, -28]);
      setRot(r, 'shoulderR', [-118 + Math.sin(p + Math.PI) * 10, 0, 28]);
      setRot(r, 'elbowL', [-34, 0, 0]);
      setRot(r, 'elbowR', [-34, 0, 0]);
      setRot(r, 'hipL', [-36 + Math.sin(p) * 18, 0, -5]);
      setRot(r, 'hipR', [-36 + Math.sin(p + Math.PI) * 18, 0, 5]);
      setRot(r, 'kneeL', [42 - Math.sin(p) * 15, 0, 0]);
      setRot(r, 'kneeR', [42 - Math.sin(p + Math.PI) * 15, 0, 0]);
      setRot(r, 'ankleL', [-12, 0, 0]);
      setRot(r, 'ankleR', [-12, 0, 0]);
    },
  },
};

export const CHARACTER_ACTIONS = Object.keys(clips) as CharacterAction[];

export function getAnimationClip(action: CharacterAction): AnimationClip {
  return clips[action] ?? clips.idle;
}

export function applyCharacterAction(rig: CharacterRig, action: CharacterAction, t: number) { 


  const clip = getAnimationClip(action);
  resetRig(rig);
  clip.apply(rig, clip.loop ? t % clip.duration : Math.min(t, clip.duration));
}

/** Align the rendered barrel to the same world-space aim as the shot, then solve wrists again. */
export function alignCharacterAim(rig:CharacterRig,yaw:number,pitch:number){
 rig.root.updateMatrixWorld(true);
 const parent=rig.weaponMount.parent!;const parentQ=parent.getWorldQuaternion(new THREE.Quaternion());
 const desired=new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch,yaw+Math.PI,0,'YXZ'));
 rig.weaponMount.quaternion.copy(parentQ.invert().multiply(desired).multiply(rig.weapon.quaternion.clone().invert()));
 const {grip,handguard}=weaponPoints(rig);
 solveArm(rig,'L',grip,new THREE.Vector3(-.95,-.75,.15));solveArm(rig,'R',handguard.add(new THREE.Vector3(-.045,-.05,.01)),new THREE.Vector3(.55,-1,.15));
 rig.root.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// 蹲 / 趴 姿态过渡（stance transition）
//
// 玩家反馈：AI 反复蹲下/趴下躲子弹，代价太小。这段整段过渡把“姿态切换”显式演出来（推荐 1.1s）：
//   站 -> 跪撑（双手撑地）-> 蹲 / 趴，反向同理。
// 关键设计：
//   * 只有一条路径：from -> BRACE（撑地关键帧）-> to，direction 只影响时间分配与撑地时机
//     （起身时更早到撑地点：手先撑地、身体再起来；蹲/趴下时略晚，让撑地“接住”下沉的身体）；
//   * 撑地阶段两只手用 IK 钉在身体前方地面上（髋部前方 0.35m、地面 +0.07m），
//     肩 / 肘自然弯曲，躯干前折；撑地权重 0/1 两端严格为 0，p=0 与 p=1 精确等于 base 姿态；
//   * 过渡期间武器收在胸前（weaponMount），双手离开枪身；撑地段枪会插进地面，所以随手撑地权重
//     往怀里收并缩掉，落定后原样长回来；
//   * 纯姿态函数：只写 rig 骨骼 / weaponMount，不读全局状态；临时向量 / 四元数全部模块级复用
//     （solveArm 内部本身有少量临时对象，沿用既有实现）。
// ---------------------------------------------------------------------------

export type StancePose = 'stand' | 'crouch' | 'prone';

/** 建议的整段过渡时长（秒）：engine 用 progress = elapsed / STANCE_TRANSITION_SECONDS。 */
export const STANCE_TRANSITION_SECONDS = 1.1;

/** 撑地点：腕点离地高度（方块手掌约 0.11m 厚，留一点余量不插进地面）。 */
const PLANT_Y = 0.07;
/** 撑地点：髋部正前方距离（m）。 */
const PLANT_FORWARD = 0.35;
/** 撑地点：左右手横向间距（m）。 */
const PLANT_SPREAD = 0.22;

interface StancePosture {
  /** body 整体前翻（度），趴姿用 82°。 */
  bodyRot: number;
  bodyY: number;
  /** 骨盆在 root 空间的高度；趴姿下由 body 旋转 + hips 偏移换算。 */
  rootHipsY: number;
  torso: number;
  head: number;
  hipLX: number;
  hipLZ: number;
  kneeL: number;
  ankleL: number;
  hipRX: number;
  hipRZ: number;
  kneeR: number;
  ankleR: number;
}

const _poseA: StancePosture = {
  bodyRot: 0, bodyY: 0, rootHipsY: 0.92, torso: 0, head: 0,
  hipLX: 0, hipLZ: 0, kneeL: 0, ankleL: 0,
  hipRX: 0, hipRZ: 0, kneeR: 0, ankleR: 0,
};
const _poseB: StancePosture = { ..._poseA };
const _poseOut: StancePosture = { ..._poseA };

/**
 * 撑地关键帧（跪撑）：大腿竖直、膝盖落地、小腿后折，躯干折到 96°（接近水平），
 * 肩关节降到 ~0.65m —— 刚好够双手撑地且肘部还有弯曲余量。
 * 选跪撑而不是深蹲：跪姿到趴姿的脚踝轨迹不会穿地（深蹲方案中段脚会插进地面 0.35m）。
 *   hipL/R 0°、knee 110°、ankle -35°（脚尖点地），骨盆 0.46m。
 */
const BRACE_POSTURE: StancePosture = {
  bodyRot: 0,
  bodyY: 0,
  rootHipsY: 0.46,
  torso: 96,
  head: -46,
  hipLX: 0, hipLZ: -5, kneeL: 110, ankleL: -35,
  hipRX: 0, hipRZ: 5, kneeR: 110, ankleR: -35,
};

// 腿部尺寸（与 rig.ts createBlockyCharacter 一致），只用于“脚不穿地”的解析 FK。
const HIP_JOINT_OFFSET_Y = -0.02;
const THIGH_LEN = 0.42;
const SHIN_LEN = 0.39;
/** 中间帧允许的最低踝关节高度（站姿踝约 0.09，鞋底再向下 0.12）。 */
const MIN_ANKLE_Y = 0.06;

// module-level scratch（每帧 no-alloc）
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _holdSL = new THREE.Quaternion();
const _holdEL = new THREE.Quaternion();
const _holdSR = new THREE.Quaternion();
const _holdER = new THREE.Quaternion();
const _plantSL = new THREE.Quaternion();
const _plantEL = new THREE.Quaternion();
const _plantSR = new THREE.Quaternion();
const _plantER = new THREE.Quaternion();
const _poleHoldL = new THREE.Vector3(-0.95, -0.75, 0.15);
const _poleHoldR = new THREE.Vector3(0.55, -1.0, 0.15);
const _polePlantL = new THREE.Vector3(-1.0, -0.35, -0.55);
const _polePlantR = new THREE.Vector3(1.0, -0.35, -0.55);
const _weaponPos = new THREE.Vector3();
const _weaponQ = new THREE.Quaternion();
const _gripLocal = new THREE.Vector3(0, -0.13, 0.08);
const _handguardLocal = new THREE.Vector3(0, 0.02, 0.18);
const _supportOffset = new THREE.Vector3(-0.045, -0.05, 0.01);
const _gripP = new THREE.Vector3();
const _handP = new THREE.Vector3();
const _plantL = new THREE.Vector3();
const _plantR = new THREE.Vector3();
const _hipsRoot = new THREE.Vector3();

function smooth01(t: number) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

function stanceBase(rig: CharacterRig, pose: StancePose) {
  if (pose === 'prone') baseProne(rig);
  else if (pose === 'crouch') baseCrouch(rig);
  else baseStand(rig);
}

function capturePosture(rig: CharacterRig, out: StancePosture) {
  out.bodyRot = rig.body.rotation.x / D;
  out.bodyY = rig.body.position.y;
  out.rootHipsY = rig.body.position.y + Math.cos(rig.body.rotation.x) * rig.bones.hips.position.y;
  out.torso = rig.bones.torso.rotation.x / D;
  out.head = rig.bones.head.rotation.x / D;
  out.hipLX = rig.bones.hipL.rotation.x / D;
  out.hipLZ = rig.bones.hipL.rotation.z / D;
  out.kneeL = rig.bones.kneeL.rotation.x / D;
  out.ankleL = rig.bones.ankleL.rotation.x / D;
  out.hipRX = rig.bones.hipR.rotation.x / D;
  out.hipRZ = rig.bones.hipR.rotation.z / D;
  out.kneeR = rig.bones.kneeR.rotation.x / D;
  out.ankleR = rig.bones.ankleR.rotation.x / D;
}

function blendPosture(a: StancePosture, b: StancePosture, t: number, out: StancePosture) {
  out.bodyRot = a.bodyRot + (b.bodyRot - a.bodyRot) * t;
  out.bodyY = a.bodyY + (b.bodyY - a.bodyY) * t;
  out.rootHipsY = a.rootHipsY + (b.rootHipsY - a.rootHipsY) * t;
  out.torso = a.torso + (b.torso - a.torso) * t;
  out.head = a.head + (b.head - a.head) * t;
  out.hipLX = a.hipLX + (b.hipLX - a.hipLX) * t;
  out.hipLZ = a.hipLZ + (b.hipLZ - a.hipLZ) * t;
  out.kneeL = a.kneeL + (b.kneeL - a.kneeL) * t;
  out.ankleL = a.ankleL + (b.ankleL - a.ankleL) * t;
  out.hipRX = a.hipRX + (b.hipRX - a.hipRX) * t;
  out.hipRZ = a.hipRZ + (b.hipRZ - a.hipRZ) * t;
  out.kneeR = a.kneeR + (b.kneeR - a.kneeR) * t;
  out.ankleR = a.ankleR + (b.ankleR - a.ankleR) * t;
}

/**
 * 单条腿的解析 FK：踝关节在 root 空间的高度（只关心绕 X 的屈伸）。
 * 用于中间帧“脚不穿地”：摇杆角度线性插值时脚会短暂插进地面，这里把骨盆抬回去补偿。
 */
function ankleRootY(bodyRotRad: number, bodyY: number, hipsY: number, hipXRad: number, kneeXRad: number) {
  const hipY = hipsY + HIP_JOINT_OFFSET_Y;
  const kneeY = hipY - THIGH_LEN * Math.cos(hipXRad);
  const kneeZ = -THIGH_LEN * Math.sin(hipXRad);
  const shin = hipXRad + kneeXRad;
  const ankleY = kneeY - SHIN_LEN * Math.cos(shin);
  const ankleZ = kneeZ - SHIN_LEN * Math.sin(shin);
  return bodyY + ankleY * Math.cos(bodyRotRad) - ankleZ * Math.sin(bodyRotRad);
}

/** 骨盆在 root 空间的真实高度（body 旋转后 hips.position.y 会缩水，趴姿尤其明显）。 */
function applyPosture(rig: CharacterRig, p: StancePosture) {
  rig.body.rotation.x = p.bodyRot * D;
  rig.body.position.y = p.bodyY;
  const rot = rig.body.rotation.x;
  const cos = Math.cos(rot);
  const k = cos > 0.08 ? cos : 1;
  let hipsY = cos > 0.08 ? (p.rootHipsY - p.bodyY) / cos : p.rootHipsY - p.bodyY;
  // 脚底别穿地：取两条腿里更低的踝，不足则整体抬骨盆（端点姿态本身满足，不会改变 0/1 帧）。
  const ankleL = ankleRootY(rot, p.bodyY, hipsY, p.hipLX * D, p.kneeL * D);
  const ankleR = ankleRootY(rot, p.bodyY, hipsY, p.hipRX * D, p.kneeR * D);
  const low = Math.min(ankleL, ankleR);
  if (low < MIN_ANKLE_Y) hipsY += (MIN_ANKLE_Y - low) / k;
  setPos(rig, 'hips', [0, Math.max(0, hipsY), 0]);
  setRot(rig, 'torso', [p.torso, 0, 0]);
  setRot(rig, 'head', [p.head, 0, 0]);
  setRot(rig, 'hipL', [p.hipLX, 0, p.hipLZ]);
  setRot(rig, 'kneeL', [p.kneeL, 0, 0]);
  setRot(rig, 'ankleL', [p.ankleL, 0, 0]);
  setRot(rig, 'hipR', [p.hipRX, 0, p.hipRZ]);
  setRot(rig, 'kneeR', [p.kneeR, 0, 0]);
  setRot(rig, 'ankleR', [p.ankleR, 0, 0]);
}

/** root 空间点 -> torso 空间（solveArm 的坐标系）。in-place 安全。 */
function rootToTorso(rig: CharacterRig, pRoot: THREE.Vector3, out: THREE.Vector3) {
  out.copy(pRoot).sub(rig.body.position);
  out.applyQuaternion(_q1.copy(rig.body.quaternion).invert());
  out.sub(rig.bones.hips.position);
  out.applyQuaternion(_q2.copy(rig.bones.hips.quaternion).invert());
  out.sub(rig.bones.torso.position);
  out.applyQuaternion(_q3.copy(rig.bones.torso.quaternion).invert());
  return out;
}

/** 枪收在胸前的持枪姿态：等同于 twoHanded('low') 与 twoHanded('prone') 之间按 proneW 插值。 */
function stanceHold(rig: CharacterRig, proneW: number) {
  const m = rig.weaponMount;
  rig.weapon.visible = true;
  m.visible = true;
  m.position.set(-0.18, 0.30 - 0.12 * proneW, 0.66 - 0.04 * proneW);
  m.rotation.set((-2.5 + 0.5 * proneW) * D, 0, 0);
  _weaponPos.copy(rig.weapon.position).applyQuaternion(m.quaternion).add(m.position);
  _weaponQ.copy(m.quaternion).multiply(rig.weapon.quaternion);
  _gripP.copy(_gripLocal).applyQuaternion(_weaponQ).add(_weaponPos);
  _handP.copy(_handguardLocal).applyQuaternion(_weaponQ).add(_weaponPos).add(_supportOffset);
  rig.bones.shoulderL.position.set(-0.22, 0.38, 0.14);
  rig.bones.shoulderR.position.set(0.18, 0.38, 0.2);
  solveArm(rig, 'L', _gripP, _poleHoldL);
  solveArm(rig, 'R', _handP, _poleHoldR);
}

/** 过渡中段：两手 IK 到身前地面的两个支撑点，再与持枪姿态按 w 混合。 */
function plantHands(rig: CharacterRig, w: number) {
  _holdSL.copy(rig.bones.shoulderL.quaternion);
  _holdEL.copy(rig.bones.elbowL.quaternion);
  _holdSR.copy(rig.bones.shoulderR.quaternion);
  _holdER.copy(rig.bones.elbowR.quaternion);

  // 肩点回到自然位置（持枪时是内收前送的），撑地时肩更开、更靠后。
  rig.bones.shoulderL.position.set(-0.22 - 0.08 * w, 0.38, 0.14 - 0.14 * w);
  rig.bones.shoulderR.position.set(0.18 + 0.12 * w, 0.38, 0.2 - 0.2 * w);

  _hipsRoot.copy(rig.bones.hips.position).applyQuaternion(rig.body.quaternion).add(rig.body.position);
  const z = _hipsRoot.z + PLANT_FORWARD;
  _plantL.set(-PLANT_SPREAD, PLANT_Y, z);
  rootToTorso(rig, _plantL, _plantL);
  _plantR.set(PLANT_SPREAD, PLANT_Y, z);
  rootToTorso(rig, _plantR, _plantR);

  solveArm(rig, 'L', _plantL, _polePlantL);
  solveArm(rig, 'R', _plantR, _polePlantR);
  _plantSL.copy(rig.bones.shoulderL.quaternion);
  _plantEL.copy(rig.bones.elbowL.quaternion);
  _plantSR.copy(rig.bones.shoulderR.quaternion);
  _plantER.copy(rig.bones.elbowR.quaternion);

  rig.bones.shoulderL.quaternion.copy(_holdSL).slerp(_plantSL, w);
  rig.bones.elbowL.quaternion.copy(_holdEL).slerp(_plantEL, w);
  rig.bones.shoulderR.quaternion.copy(_holdSR).slerp(_plantSR, w);
  rig.bones.elbowR.quaternion.copy(_holdER).slerp(_plantER, w);
}

/** 撑地权重：0 -> 1 -> 0，两端严格为 0；direction 只改变窗口与峰值位置。 */
function plantWeight(p: number, direction: 'down' | 'up') {
  const a = direction === 'up' ? 0.02 : 0.1;
  const peak = direction === 'up' ? 0.38 : 0.55;
  const b = direction === 'up' ? 0.74 : 0.88;
  if (p <= a || p >= b) return 0;
  if (p < peak) return Math.pow(Math.sin((Math.PI * 0.5 * (p - a)) / (peak - a)), 0.6);
  return Math.pow(Math.sin((Math.PI * 0.5 * (b - p)) / (b - peak)), 1.1);
}

/**
 * 蹲/趴姿态切换的整段过渡动画（由 engine 在过渡期间每帧调用，覆盖普通动作）。
 * progress: 0..1（0=起始姿态，1=目标姿态）；direction: 'down' | 'up'。
 * 要求：中段（progress≈0.2-0.7）双手去到身前地面撑住，再收回到目标姿态；
 *       下蹲/趴下和起身共用同一套函数（direction 决定手撑地的时机）。
 *
 * engine 侧调用（与 applyCharacterAction 相同：先摆姿态，再自行设置 root 位置/朝向）：
 *   const t = (now - stanceStart) / (STANCE_TRANSITION_SECONDS * 1000);
 *   applyStanceTransition(rig, t, stanceFrom, stance, level(stance) > level(stanceFrom) ? 'down' : 'up');
 *   // level: stand 0 / crouch 1 / prone 2；过渡期间不要再叠加 alignCharacterAim 或普通动作。
 */
export function applyStanceTransition(
  rig: CharacterRig,
  progress: number,
  from: StancePose,
  to: StancePose,
  direction: 'down' | 'up',
): void {
  const p = THREE.MathUtils.clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  resetRig(rig);

  if (from === to) {
    stanceBase(rig, from);
    stanceHold(rig, from === 'prone' ? 1 : 0);
    return;
  }

  // 1) 两个端点姿态先各自采样一次（base 姿态是唯一的真源）。
  stanceBase(rig, from);
  capturePosture(rig, _poseA);
  resetRig(rig);
  stanceBase(rig, to);
  capturePosture(rig, _poseB);

  // 2) from -> BRACE -> to 的路径参数。起身时更早到达撑地点（先撑地再起身），
  //    下蹲/趴下时则稍微晚一点，让撑地动作“接住”下沉的身体。
  resetRig(rig);
  const braceAt = direction === 'up' ? 0.42 : 0.52;
  const s = p <= braceAt
    ? 0.5 * smooth01(p / braceAt)
    : 0.5 + 0.5 * smooth01((p - braceAt) / (1 - braceAt));
  if (s < 0.5) blendPosture(_poseA, BRACE_POSTURE, s * 2, _poseOut);
  else blendPosture(BRACE_POSTURE, _poseB, (s - 0.5) * 2, _poseOut);
  applyPosture(rig, _poseOut);

  // 3) 武器收在胸前（趴姿挂点随 s 平滑过渡），双手先握枪。
  const proneW = from === 'prone' ? Math.max(0, 1 - s * 2) : to === 'prone' ? Math.max(0, s * 2 - 1) : 0;
  stanceHold(rig, proneW);

  // 4) 撑地阶段：双手 IK 到地面并正向/反向混出。
  const w = plantWeight(p, direction);
  if (w > 0.002) plantHands(rig, w);

  // 5) 撑地时躯干几乎水平，胸前挂点的枪会插进地面：随手撑地权重把枪往怀里收并缩掉
  //    （起身 / 落定后 w 回 0，枪原样长回来，resetRig 会在下一帧还原缩放）。
  const stow = smooth01((w - 0.2) / 0.5);
  if (stow > 0) {
    rig.weaponMount.position.z -= 0.34 * stow;
    rig.weaponMount.position.y -= 0.02 * stow;
    rig.weapon.scale.multiplyScalar(Math.max(0.001, 1 - stow * 1.15));
    if (stow > 0.9) rig.weapon.visible = false;
  }
}
