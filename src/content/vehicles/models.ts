import {captureVehicleParts} from '../../game/vehicles/collision';
import * as THREE from 'three';
import { batchRigid } from '../../game/world/batch-rigid';

export type VehicleModelId = 'motorcycle' | 'jeep' | 'apc' | 'ifv' | 'light_tank' | 'mbt';

const mat = (color: number, metalness = 0.22, roughness = 0.6) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true });

const M = {
  olive: mat(0x596044),
  olive2: mat(0x6d7353),
  oliveDark: mat(0x424a35),
  tan: mat(0x7f7558),
  metal: mat(0x77827f, 0.45, 0.42),
  metalDark: mat(0x3a4342, 0.45, 0.45),
  rubber: mat(0x1a1e1f, 0.05, 0.85),
  glass: mat(0x39595c, 0.45, 0.25),
  accent: mat(0xc06a3e, 0.2, 0.5),
  track: mat(0x242927, 0.35, 0.7),
  trackLight: mat(0x555b52, 0.4, 0.55),
};

function makeTrackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#222725'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    g.fillStyle = y % 16 === 0 ? '#4d544e' : '#363d38';
    g.fillRect(0, y, 64, 5);
    g.fillStyle = '#171b19'; g.fillRect(0, y + 5, 64, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const trackTex = makeTrackTexture();
(M.track as THREE.MeshStandardMaterial).map = trackTex;
(M.trackLight as THREE.MeshStandardMaterial).map = trackTex;

function box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function cyl(parent: THREE.Object3D, rTop: number, rBottom: number, len: number, m: THREE.Material, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'x', segments = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, len, segments), m);
  mesh.position.set(x, y, z);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

function wheel(parent: THREE.Object3D, x: number, z: number, r = 0.35, w = 0.26) {
  const g = new THREE.Group();
  g.position.set(x, r, z);
  parent.add(g);
  cyl(g, r, r, w, M.rubber, 0, 0, 0, 'x', 12);
  cyl(g, r * 0.46, r * 0.46, w + 0.02, M.metalDark, 0, 0, 0, 'x', 10);
  box(g, 0.025, r * 1.45, 0.07, M.trackLight, w / 2 + 0.015, 0, 0);
  box(g, 0.025, 0.07, r * 1.45, M.trackLight, w / 2 + 0.029, 0, 0);
  return g;
}

function mg(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  parent.add(g);
  box(g, 0.07, 0.09, 0.30, M.metalDark, 0, 0, 0.10);
  cyl(g, 0.025, 0.025, 0.45, M.metal, 0, 0.02, 0.36, 'z', 8);
  box(g, 0.05, 0.10, 0.08, M.metalDark, 0, -0.08, 0.0);
  box(g, 0.04, 0.06, 0.05, M.accent, 0, 0.07, -0.02);
  return g;
}

function buildMotorcycle(): THREE.Group {
  const g = new THREE.Group();
  const wheels: THREE.Group[] = [];
  wheels.push(wheel(g, 0, 0.78, 0.34, 0.18));
  wheels.push(wheel(g, 0, -0.78, 0.34, 0.18));
  g.userData.wheels = wheels;
  box(g, 0.22, 0.20, 1.35, M.oliveDark, 0, 0.58, 0);
  box(g, 0.30, 0.26, 0.52, M.olive, 0, 0.72, 0.18);
  box(g, 0.26, 0.10, 0.50, M.rubber, 0, 0.86, -0.22);
  box(g, 0.34, 0.04, 0.24, M.metalDark, 0, 0.92, 0.58);
  for (const x of [-0.2, 0.2]) {
    cyl(g, 0.022, 0.022, 0.55, M.metal, x, 0.68, 0.56, 'y', 6);
  }
  box(g, 0.09, 0.13, 0.15, M.metalDark, 0, 0.60, 0.68);
  box(g, 0.08, 0.06, 0.30, M.metal, 0, 0.72, -0.55);
  box(g, 0.10, 0.08, 0.16, M.accent, 0, 0.82, -0.42);
  return g;
}

function buildJeep(): THREE.Group {
  const g = new THREE.Group();
  // Short UAZ-style body, upright split windscreen and open rear.
  box(g,1.64,.26,3.54,M.oliveDark,0,.47,0);
  box(g,1.57,.41,1.32,M.olive,0,.76,1.04);
  box(g,1.46,.10,.95,M.olive2,0,1.009,1.09);
  box(g,1.59,.24,.12,M.oliveDark,0,.62,-1.75);
  box(g,1.62,.16,.13,M.metalDark,0,.54,1.82);
  box(g,.72,.31,.06,M.metalDark,0,.81,1.73);
  for(let x=-.28;x<=.29;x+=.112)box(g,.045,.23,.025,M.metal,x,.81,1.765);
  for(const x of [-.59,.59]){
    cyl(g,.125,.135,.065,M.metalDark,x,.85,1.735,'z',12);
    cyl(g,.099,.099,.022,M.tan,x,.85,1.778,'z',12);
  }
  for(const x of [-.75,.75]){
    box(g,.12,.36,1.55,M.olive, x,.755,-.59);
    box(g,.22,.12,.96,M.olive2,x,.805,1.13);
    box(g,.09,.69,.09,M.metalDark,x,1.31,.28,-.17);
    box(g,.09,.68,.09,M.metalDark,x,1.32,-1.14,.24);
    box(g,.43,.12,.43,M.rubber,x*.55,.689,-.12);
    box(g,.43,.40,.10,M.rubber,x*.55,.88,-.34);
    box(g,.09,.09,1.43,M.metalDark,x,1.643,-.43);
  }
  box(g,1.45,.085,.075,M.metalDark,0,1.65,.22);
  box(g,1.45,.085,.075,M.metalDark,0,1.65,-1.06);
  box(g,.065,.60,.065,M.metalDark,0,1.33,.28,-.17);
  for(const x of [-.356,.356])box(g,.64,.54,.018,M.glass,x,1.345,.28,-.17);
  box(g,1.35,.055,.062,M.metalDark,0,1.04,.328);
  box(g,.18,.82,.18,M.metalDark,0,1.18,-.87);
  g.userData.machineGuns=[mg(g,0,1.67,-.87,1.2)];
  cyl(g,.29,.29,.15,M.rubber,.42,.94,-1.84,'z',12);
  cyl(g,.13,.13,.035,M.metalDark,.42,.94,-1.929,'z',10);
  g.userData.wheels=[[-.82,1.12],[.82,1.12],[-.82,-1.12],[.82,-1.12]].map(([x,z])=>wheel(g,x,z,.405,.27));
  return g;
}

function buildAPC(): THREE.Group {
  const g = new THREE.Group();
  box(g, 2.1, 1.25, 4.9, M.olive, 0, 0.95, 0);
  // sloped bow
  box(g, 2.0, 0.95, 1.1, M.olive2, 0, 0.85, 2.35, -0.45);
  box(g, 2.04, 0.20, 4.6, M.oliveDark, 0, 1.625, -0.05);
  box(g, 1.1, 0.12, 1.0, M.metalDark, 0, 1.78, -0.3);
  box(g, 0.85, 0.07, 0.85, M.olive2, 0, 1.83, -0.3);
  cyl(g,.08,.11,.44,M.metalDark,.55,1.92,-.05,'y',8);
  g.userData.machineGuns=[mg(g,.55,2.27,-.05,1.25)];
  const wheels: THREE.Group[] = [];
  for (const x of [-0.9, 0.9]) {
    for (const z of [-1.6, 0, 1.6]) wheels.push(wheel(g, x, z, 0.48, 0.34));
  }
  g.userData.wheels = wheels;
  box(g, 0.10, 0.45, 4.4, M.oliveDark, -1.12, 0.75, 0);
  box(g, 0.10, 0.45, 4.4, M.oliveDark, 1.12, 0.75, 0);
  box(g, 1.3, 0.7, 0.06, M.metalDark, 0, 0.9, -2.47);
  box(g, 0.35, 0.10, 0.06, M.accent, 0, 1.2, -2.51);
  return g;
}

function buildIFV(): THREE.Group {
  const g = new THREE.Group();
  box(g, 2.2, 1.15, 5.4, M.olive, 0, 0.92, 0);
  box(g, 2.0, 0.55, 4.6, M.oliveDark, 0, 1.52, 0);
  box(g, 1.9, 0.55, 1.2, M.olive2, 0, 1.05, 2.35, -0.38);
  // turret
  const turret = new THREE.Group();
  turret.position.set(0, 1.78, 0.1);
  g.add(turret);
  box(turret, 1.25, 0.55, 1.4, M.olive2, 0, 0, 0);
  cyl(turret, 0.62, 0.70, 0.55, M.olive2, 0, 0.27, 0, 'y', 8);
  g.userData.machineGuns=[mg(g,0,2.49,.18,1.35)];
  const wheels: THREE.Group[] = [];
  for (const x of [-0.92, 0.92]) {
    for (const z of [-1.8, -0.6, 0.6, 1.8]) wheels.push(wheel(g, x, z, 0.46, 0.32));
  }
  g.userData.wheels = wheels;
  box(g, 0.12, 0.5, 5.0, M.oliveDark, -1.17, 0.75, 0);
  box(g, 0.12, 0.5, 5.0, M.oliveDark, 1.17, 0.75, 0);
  return g;
}

function buildLightTank(): THREE.Group {
  const g = new THREE.Group();
  // tracks
  for (const x of [-1.18, 1.18]) {
    box(g, 0.55, 0.55, 4.9, M.track, x, 0.48, 0);
    box(g, 0.62, 0.18, 4.2, M.trackLight, x, 0.78, 0);
    for (let z = -2.1; z <= 2.1; z += 0.7) box(g, 0.64, 0.06, 0.28, M.trackLight, x, 0.24, z);
  }
  box(g, 1.95, 0.75, 4.6, M.olive, 0, 0.92, 0);
  box(g, 1.9, 0.22, 4.3, M.olive2, 0, 1.40, 0);
  box(g, 1.8, 0.55, 1.1, M.olive2, 0, 0.95, 1.95, -0.30);
  // turret
  const turret = new THREE.Group();
  turret.position.set(0, 0, 0);
  g.add(turret);
  cyl(turret, 0.82, 0.92, 0.5, M.olive2, 0, 1.62, -0.05, 'y', 8);
  box(turret, 1.1, 0.42, 1.3, M.olive2, 0, 1.60, 0.0);
  box(turret, 0.22, 0.20, 2.4, M.metalDark, 0, 1.66, 1.45);
  cyl(turret, 0.062, 0.062, 2.2, M.metal, 0, 1.66, 2.0, 'z', 8);
  box(turret, 0.10, 0.12, 0.30, M.metalDark, 0, 1.66, 3.15);
  g.userData.machineGuns=[mg(g,.46,2.02,.52,.95)];
  g.userData.turret = turret;
  g.userData.trackMaterials = [M.track, M.trackLight];
  return g;
}

function buildMBT(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.35, 1.35]) {
    box(g, 0.65, 0.65, 6.2, M.track, x, 0.52, 0);
    box(g, 0.72, 0.22, 5.5, M.trackLight, x, 0.86, 0);
    for (let z = -2.8; z <= 2.8; z += 0.7) box(g, 0.74, 0.07, 0.30, M.trackLight, x, 0.22, z);
  }
  box(g, 2.3, 0.85, 5.9, M.olive, 0, 0.98, 0);
  box(g, 2.2, 0.28, 5.5, M.olive2, 0, 1.52, 0);
  box(g, 2.1, 0.65, 1.2, M.olive2, 0, 0.98, 2.55, -0.32);
  // side skirts
  box(g, 0.10, 0.55, 4.8, M.oliveDark, -1.52, 0.65, 0);
  box(g, 0.10, 0.55, 4.8, M.oliveDark, 1.52, 0.65, 0);
  // turret as a separate yaw group
  const turret = new THREE.Group();
  turret.position.set(0, 1.75, -0.15);
  g.add(turret);
  cyl(turret, 1.05, 1.15, 0.55, M.olive2, 0, 0, 0, 'y', 8);
  box(turret, 1.4, 0.55, 1.7, M.olive2, 0, 0.03, 0.05);
  box(turret, 0.28, 0.25, 3.0, M.metalDark, 0, 0.05, 1.9);
  cyl(turret, 0.075, 0.075, 2.8, M.metal, 0, 0.05, 2.6, 'z', 8);
  box(turret, 0.16, 0.16, 0.38, M.metalDark, 0, 0.05, 4.0);
  g.userData.machineGuns=[mg(g,.57,2.11,.67,.95),mg(g,-.59,2.29,-.73,1.1)];
  box(turret, 0.10, 0.30, 0.10, M.metalDark, 0.9, 0.30, -0.95);
  g.userData.turret = turret;
  g.userData.trackMaterials = [M.track, M.trackLight];
  return g;
}

export function buildVehicleModel(id: VehicleModelId,batched=false): THREE.Group {
 const g=id==='motorcycle'?buildMotorcycle():id==='jeep'?buildJeep():id==='apc'?buildAPC():id==='ifv'?buildIFV():id==='light_tank'?buildLightTank():id==='mbt'?buildMBT():buildJeep();
 const turret=g.userData.turret as THREE.Group|undefined;
 if(turret){const pivot=new THREE.Group();pivot.position.set(0,id==='light_tank'?1.66:id==='ifv'?.34:.05,id==='mbt'?.8:.4);turret.add(pivot);
  for(const child of [...turret.children]){if(child===pivot||child.position.z<.85)continue;const m=child as THREE.Mesh;if(!m.geometry)continue;m.geometry.computeBoundingBox();const size=m.geometry.boundingBox!.getSize(new THREE.Vector3());if(size.x>.6||size.y>.5)continue;pivot.add(child);child.position.sub(pivot.position);}
  const muzzle=new THREE.Object3D();muzzle.name='muzzle';muzzle.position.set(0,0,(id==='mbt'?4.23:id==='light_tank'?3.34:id==='ifv'?2.6:2.6)-pivot.position.z);pivot.add(muzzle);g.userData.barrel=pivot;g.userData.barrelRestZ=pivot.position.z;g.userData.muzzle=muzzle;
 }
 const originals=g.userData.trackMaterials as THREE.MeshStandardMaterial[]|undefined;
 if(originals){const replacements=new Map<THREE.Material,THREE.Material>();const textures=new Map<THREE.Texture,THREE.Texture>();for(const m of originals){const c=m.clone();if(m.map){let t=textures.get(m.map);if(!t){t=m.map.clone();textures.set(m.map,t);}c.map=t;}replacements.set(m,c);}g.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh&&replacements.has(m.material as THREE.Material))m.material=replacements.get(m.material as THREE.Material)!;});g.userData.trackMaterials=[...replacements.values()];}
 g.userData.collisionParts=captureVehicleParts(g);
 if(batched)batchRigid(g,[...(g.userData.wheels??[]),...(g.userData.turret?[g.userData.turret,g.userData.barrel]:[]),...(g.userData.machineGuns??[])]);
 return g;
}
