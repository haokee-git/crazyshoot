import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Team } from '../../maps/types';

export type BoneName =
  | 'body'
  | 'hips'
  | 'torso'
  | 'head'
  | 'shoulderL'
  | 'elbowL'
  | 'wristL'
  | 'shoulderR'
  | 'elbowR'
  | 'wristR'
  | 'hipL'
  | 'kneeL'
  | 'ankleL'
  | 'hipR'
  | 'kneeR'
  | 'ankleR';

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group;
  bones: Record<BoneName, THREE.Group>;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  weapon: THREE.Group;
  weaponMount: THREE.Group;
  magazine: THREE.Group;
  team: Team;
  setSpawnProtected(active: boolean): void;
  dispose(): void;
}

const SKIN = 0xb88963;
const DARK = 0x1b2022;
const BOOT = 0x242a2b;
const METAL = 0x3a4345;
const OLIVE = 0x5d654d;

function teamPalette(team: Team) {
  return team === 'blue'
    ? { accent: 0x3e8bd6, accent2: 0x1e4f7a, uniform: 0x53616b, vest: 0x2d4a63 }
    : { accent: 0xe0783b, accent2: 0x7b3f1f, uniform: 0x6a6252, vest: 0x5a3d2b };
}

export function createBlockyCharacter(team: Team, opts: { weapon?: boolean; debugHands?: boolean;batched?:boolean;weaponId?:string } = {}): CharacterRig {
  const pal = teamPalette(team);
  const materials: THREE.MeshLambertMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const mat = (color: number, flat = true) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: flat });
    materials.push(m);
    return m;
  };

  const materialsByColor = new Map<number, THREE.MeshLambertMaterial>();
  const matCached = (color: number) => {
    let m = materialsByColor.get(color);
    if (!m) {
      m = mat(color);
      materialsByColor.set(color, m);
    }
    return m;
  };

  const addBox = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    color: number,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, matCached(color));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  const root = new THREE.Group();
  root.name = 'character-root';
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.set(0, 0.92, 0);
  body.add(hips);

  // pelvis / belt
  addBox(hips, 0.38, 0.18, 0.24, pal.uniform, 0, 0, 0);
  addBox(hips, 0.4, 0.08, 0.26, DARK, 0, 0.08, 0);

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.set(0, 0.23, 0);
  hips.add(torso);

  addBox(torso, 0.52, 0.5, 0.29, pal.uniform, 0, 0.2, 0);
  // plate carrier / team vest
  addBox(torso, 0.4, 0.34, 0.31, pal.vest, 0, 0.27, 0.02);
  addBox(torso, 0.3, 0.1, 0.33, pal.accent2, 0, 0.2, 0.03);
  // shoulder straps
  addBox(torso, 0.07, 0.32, 0.32, DARK, -0.18, 0.27, 0.02);
  addBox(torso, 0.07, 0.32, 0.32, DARK, 0.18, 0.27, 0.02);
  // backpack
  addBox(torso, 0.34, 0.32, 0.16, 0x2a302e, 0, 0.24, -0.22);
  addBox(torso, 0.22, 0.1, 0.06, pal.accent, 0, 0.3, -0.31);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.5, 0);
  torso.add(head);
  // neck
  addBox(head, 0.12, 0.1, 0.12, SKIN, 0, -0.03, 0);
  // head / face
  addBox(head, 0.3, 0.3, 0.3, SKIN, 0, 0.13, 0);
  // helmet
  addBox(head, 0.36, 0.14, 0.36, OLIVE, 0, 0.3, 0);
  addBox(head, 0.34, 0.05, 0.34, pal.accent, 0, 0.23, 0);
  addBox(head, 0.1, 0.06, 0.02, 0xd9e4df, -0.075, 0.14, 0.16);
  addBox(head, 0.1, 0.06, 0.02, 0xd9e4df, 0.075, 0.14, 0.16);
  addBox(head, 0.18, 0.035, 0.02, 0x3a2b23, 0, 0.06, 0.16);
  // side rails / ear protection
  addBox(head, 0.04, 0.12, 0.18, DARK, -0.17, 0.12, 0);
  addBox(head, 0.04, 0.12, 0.18, DARK, 0.17, 0.12, 0);

  const makeArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? 'shoulderL' : 'shoulderR';
    shoulder.position.set(side * 0.3, 0.38, 0);
    torso.add(shoulder);
    addBox(shoulder, 0.13, 0.14, 0.16, pal.accent, 0, 0, 0);
    addBox(shoulder, 0.11, 0.3, 0.13, pal.uniform, 0, -0.18, 0);
    const elbow = new THREE.Group();
    elbow.name = side < 0 ? 'elbowL' : 'elbowR';
    elbow.position.set(0, -0.34, 0);
    shoulder.add(elbow);
    addBox(elbow, 0.1, 0.28, 0.12, pal.uniform, 0, -0.14, 0);
    addBox(elbow, 0.11, 0.08, 0.13, DARK, 0, -0.03, 0);
    const wrist = new THREE.Group();
    wrist.name = side < 0 ? 'wristL' : 'wristR';
    wrist.position.set(0, -0.3, 0);
    elbow.add(wrist);
    const handColor = opts.debugHands ? (side === 1 ? 0xff5a3d : 0x35e0d0) : DARK;
    // 手掌中心 = wrist 原点，IK 目标就是掌心。
    addBox(wrist, 0.13, 0.13, 0.14, handColor, 0, 0, 0);
    addBox(wrist, 0.14, 0.06, 0.15, DARK, 0, -0.08, 0);
    addBox(wrist, 0.04, 0.05, 0.1, handColor, side * 0.07, 0.03, 0.03);
    // 指节：从下方/侧面握住时向上包住护木。
    addBox(wrist, 0.1, 0.055, 0.065, handColor, 0, 0.075, 0.035);
    return { shoulder, elbow, wrist };
  };

  const armL = makeArm(-1);
  const armR = makeArm(1);

  const makeLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.name = side < 0 ? 'hipL' : 'hipR';
    hip.position.set(side * 0.12, -0.02, 0);
    hips.add(hip);
    addBox(hip, 0.16, 0.42, 0.18, pal.uniform, 0, -0.21, 0);
    addBox(hip, 0.17, 0.09, 0.2, DARK, 0, -0.06, 0);
    const knee = new THREE.Group();
    knee.name = side < 0 ? 'kneeL' : 'kneeR';
    knee.position.set(0, -0.42, 0);
    hip.add(knee);
    addBox(knee, 0.15, 0.38, 0.17, pal.uniform, 0, -0.19, 0);
    addBox(knee, 0.17, 0.09, 0.19, DARK, 0, -0.03, 0);
    const ankle = new THREE.Group();
    ankle.name = side < 0 ? 'ankleL' : 'ankleR';
    ankle.position.set(0, -0.39, 0);
    knee.add(ankle);
    addBox(ankle, 0.18, 0.12, 0.3, BOOT, 0, -0.06, 0.05);
    return { hip, knee, ankle };
  };

  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // 武器不再直接挂手腕，而是挂在胸前的 weaponMount；双手用 IK 对准握把/护木。
  const weaponMount = new THREE.Group();
  weaponMount.name = 'weapon-mount';
  // 初始挂点；动画会在 twoHanded() 里覆盖。
  weaponMount.position.set(-0.18, 0.30, 0.66);
  torso.add(weaponMount);

  // Simple low-poly rifle attached to the chest mount; replaced by real weapon model later.
  const weapon = new THREE.Group();
  weapon.name = 'weapon';
  // 右手掌心在 wrist 局部 (0,-0.06,0)；武器握把在 weapon 局部 (0,-0.12,0.02)。
  // 让握把与掌心重合，枪托在右手后方，而不是把枪托塞进手里。
  weapon.position.set(0, 0.05, 0);
  weapon.rotation.set(0, 0, 0);
  // 机匣：从枪托前沿到护木后方
  addBox(weapon, 0.085, 0.13, 0.36, 0x3a4445, 0, 0, -0.06);
  // 枪托：单独一组，向角色右侧（-X）外张，托底落在右肩，不穿过胸口。
  const stock = new THREE.Group();
  stock.position.set(0, 0, -0.1);
  stock.rotation.y = 0;
  weapon.add(stock);
  addBox(stock, 0.075, 0.12, 0.28, 0x4a3f34, 0, -0.005, -0.14);
  addBox(stock, 0.095, 0.055, 0.08, 0x2b2620, 0, 0.055, -0.32);
  // 后握把：右手掌心点 (0,-0.12,0.02)
  addBox(weapon, 0.07, 0.22, 0.09, 0x1d2324, 0, -0.13, 0.08);
  addBox(weapon, 0.065, 0.12, 0.08, 0x151a1b, 0, -0.26, 0.05);
  addBox(weapon, 0.11, 0.035, 0.12, 0x101415, 0, -0.025, 0.08);
  // 可拆卸弹匣：换弹时单独下坠，左手跟着弹匣走。
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.12, 0.19);
  weapon.add(magazine);
  addBox(magazine, 0.055, 0.17, 0.1, 0x202627, 0, 0, 0);
  addBox(magazine, 0.058, 0.035, 0.105, 0x3d484a, 0, -0.07, 0);
  // 护木：左手从侧下方包住，掌点在 (0.04,-0.04,0.18)
  addBox(weapon, 0.08, 0.08, 0.18, 0x2d3a38, 0, 0.005, 0.18);
  addBox(weapon, 0.088, 0.03, 0.17, 0x53605c, 0, 0.05, 0.18);
  // 枪管中段 / 枪口
  addBox(weapon, 0.04, 0.04, 0.18, 0x778486, 0, 0.015, 0.36);
  addBox(weapon, 0.055, 0.055, 0.05, 0x242c2d, 0, 0.015, 0.465);
  // 瞄具 / 导轨
  addBox(weapon, 0.07, 0.045, 0.2, 0x1b2021, 0, 0.085, -0.02);
  addBox(weapon, 0.045, 0.06, 0.05, 0x171b1c, 0, 0.12, -0.02);
  const compact=['uzi','vector','mp5','ump45'].includes(opts.weaponId??'');weapon.scale.z=compact?.78:opts.weaponId==='amr'?1.5:opts.weaponId==='awm'?1.35:opts.weaponId==='m249'?1.12:1;
  weapon.userData.restScale=weapon.scale.clone();
  if (opts.weapon !== false) weaponMount.add(weapon);

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });

  const bones: Record<BoneName, THREE.Group> = {
    body,
    hips,
    torso,
    head,
    shoulderL: armL.shoulder,
    elbowL: armL.elbow,
    wristL: armL.wrist,
    shoulderR: armR.shoulder,
    elbowR: armR.elbow,
    wristR: armR.wrist,
    hipL: legL.hip,
    kneeL: legL.knee,
    ankleL: legL.ankle,
    hipR: legR.hip,
    kneeR: legR.knee,
    ankleR: legR.ankle,
  };

  let skeleton:THREE.Skeleton|undefined;
  if(opts.batched){
    root.updateMatrixWorld(true);const nodes=[...Object.values(bones),weaponMount,weapon,magazine],parts:THREE.BufferGeometry[]=[],meshes:THREE.Mesh[]=[];
    root.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes.push(o as THREE.Mesh);});
    for(const mesh of meshes){const geo=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geo.applyMatrix4(mesh.matrixWorld);let parent:THREE.Object3D|null=mesh.parent;while(parent&&!nodes.includes(parent as THREE.Group))parent=parent.parent;const index=Math.max(0,nodes.indexOf(parent as THREE.Group)),count=geo.getAttribute('position').count,skin=new Uint16Array(count*4),weights=new Float32Array(count*4),colors=new Float32Array(count*3),color=(mesh.material as THREE.MeshLambertMaterial).color;
      for(let i=0;i<count;i++){skin[i*4]=index;weights[i*4]=1;colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;}
      geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skin,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.clearGroups();parts.push(geo);mesh.removeFromParent();
    }
    const geo=mergeGeometries(parts,false)!;for(const g of parts)g.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();geometries.length=0;materials.length=0;
    const material=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});materials.push(material);geometries.push(geo);const skin=new THREE.SkinnedMesh(geo,material);skin.name='character-batched';skeleton=new THREE.Skeleton(nodes as unknown as THREE.Bone[]);root.add(skin);skin.bind(skeleton);skin.computeBoundingSphere();skin.boundingSphere!.radius+=.8;
  }
  let spawnProtected = false;
  return {
    root,
    body,
    bones,
    materials,
    geometries,
    weapon,
    weaponMount,
    magazine,
    team,
    setSpawnProtected(active) {
      if (active === spawnProtected) return;
      spawnProtected = active;
      for (const material of materials) {
        material.emissive.setHex(active ? 0xffad29 : 0);
        material.emissiveIntensity = active ? .62 : 1;
      }
    },
    dispose() {
      skeleton?.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

export function resetRig(rig: CharacterRig) {
  rig.root.position.set(0, 0, 0);
  rig.root.rotation.set(0, 0, 0);
  rig.body.position.set(0, 0, 0);
  rig.weapon.rotation.set(0, 0, 0);if(rig.weapon.userData.restScale)rig.weapon.scale.copy(rig.weapon.userData.restScale);
  rig.weaponMount.position.set(0, 0, 0);
  rig.weaponMount.rotation.set(0, 0, 0);
  rig.weaponMount.visible = true;
  rig.weapon.visible = true;
  rig.magazine.position.set(0, -0.12, 0.19);
  rig.magazine.rotation.set(0, 0, 0);
  rig.body.rotation.set(0, 0, 0);
  rig.bones.hips.position.set(0, 0.92, 0);
  rig.bones.hips.rotation.set(0, 0, 0);
  rig.bones.torso.position.set(0, 0.23, 0);
  rig.bones.torso.rotation.set(0, 0, 0);
  rig.bones.head.position.set(0, 0.5, 0);
  rig.bones.head.rotation.set(0, 0, 0);
  rig.bones.shoulderL.position.set(-0.3, 0.38, 0);
  rig.bones.shoulderR.position.set(0.3, 0.38, 0);
  for (const name of ['shoulderL', 'shoulderR'] as const) {
    rig.bones[name].rotation.set(0, 0, 0);
  }
  for (const name of ['elbowL', 'elbowR'] as const) {
    rig.bones[name].rotation.set(0, 0, 0);
  }
  for (const name of ['wristL', 'wristR'] as const) {
    rig.bones[name].rotation.set(0, 0, 0);
  }
  for (const name of ['hipL', 'hipR'] as const) {
    rig.bones[name].rotation.set(0, 0, 0);
  }
  for (const name of ['kneeL', 'kneeR'] as const) {
    rig.bones[name].rotation.set(0, 0, 0);
  }
  for (const name of ['ankleL', 'ankleR'] as const) {
    rig.bones[name].rotation.set(0, 0, 0);
  }
}
