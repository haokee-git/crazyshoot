import * as THREE from 'three';

export type WeaponModelId = 'm16' | 'm4a1' | 'akm' | 'mp5' | 'mk14' | 'awm' | 'amr' | 'uzi' | 'vector' | 'ump45' | 'm870' | 'm249' | 'rpg' | 'flamethrower';

const mat = (color: number, metalness = 0.25, roughness = 0.55) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true });

const M = {
  dark: mat(0x263033, 0.28, 0.46),
  body: mat(0x475557, 0.24, 0.5),
  body2: mat(0x5a6869, 0.22, 0.47),
  metal: mat(0x9aa7a7, 0.45, 0.36),
  metalDark: mat(0x4f5b5c, 0.42, 0.42),
  wood: mat(0x7c4b2b, 0.05, 0.72),
  woodDark: mat(0x5c351e, 0.05, 0.75),
  tan: mat(0x8b7956, 0.12, 0.7),
  olive: mat(0x48563e, 0.12, 0.66),
  accent: mat(0xc9703f, 0.35, 0.45),
  glass: mat(0x6fa8b0, 0.65, 0.24),
  brass: mat(0xb18a4b, 0.65, 0.35),
  rubber: mat(0x14191a, 0.05, 0.8),
};

function box(
  parent: THREE.Object3D,
  w: number, h: number, d: number, m: THREE.Material,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function cyl(
  parent: THREE.Object3D,
  rTop: number, rBottom: number, len: number, m: THREE.Material,
  x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'z', segments = 8,
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, len, segments), m);
  mesh.position.set(x, y, z);
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  else if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

function torus(parent: THREE.Object3D, r: number, tube: number, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 5, 10), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function rail(parent: THREE.Object3D, y: number, z0: number, z1: number, m: THREE.Material = M.dark) {
  const len = Math.abs(z1 - z0);
  box(parent, 0.055, 0.018, len, m, 0, y, (z0 + z1) / 2);
  for (let z = Math.min(z0, z1) + 0.02; z < Math.max(z0, z1); z += 0.06) {
    box(parent, 0.064, 0.022, 0.018, M.metalDark, 0, y, z);
  }
}

function ironSight(parent: THREE.Object3D, z: number, rear = false) {
  box(parent, 0.05, 0.035, 0.028, M.dark, 0, 0.125, z);
  box(parent, 0.012, 0.045, 0.016, M.metal, -0.018, 0.152, z);
  box(parent, 0.012, 0.045, 0.016, M.metal, 0.018, 0.152, z);
  if (rear) box(parent, 0.055, 0.01, 0.03, M.metalDark, 0, 0.165, z);
}

function redDot(parent: THREE.Object3D, z: number) {
  // Picatinny clamp + riser + optic housing, not a floating cylinder
  box(parent, 0.078, 0.020, 0.115, M.metalDark, 0, 0.121, z);
  box(parent, 0.036, 0.030, 0.10, M.metal, 0, 0.141, z);
  box(parent, 0.082, 0.070, 0.105, M.dark, 0, 0.182, z);
  cyl(parent, 0.042, 0.042, 0.108, M.metalDark, 0, 0.187, z, 'z', 12);
  cyl(parent, 0.034, 0.034, 0.006, M.glass, 0, 0.187, z + 0.057, 'z', 12);
  box(parent, 0.070, 0.012, 0.085, M.metal, 0, 0.222, z);
  cyl(parent, 0.018, 0.018, 0.024, M.metal, 0.046, 0.205, z, 'x', 8);
  box(parent, 0.016, 0.016, 0.016, M.accent, 0, 0.231, z - 0.025);
}

function pistolGrip(parent: THREE.Object3D, z: number, m: THREE.Material = M.dark) {
  box(parent, 0.06, 0.18, 0.09, m, 0, -0.16, z, 0.22);
  box(parent, 0.07, 0.035, 0.1, M.rubber, 0, -0.245, z - 0.02, 0.22);
}

function triggerGuard(parent: THREE.Object3D, z: number) {
  box(parent, 0.055, 0.02, 0.12, M.dark, 0, -0.105, z);
  box(parent, 0.012, 0.06, 0.012, M.dark, -0.025, -0.135, z - 0.04, 0, 0, 0.25);
  box(parent, 0.012, 0.06, 0.012, M.dark, 0.025, -0.135, z - 0.04, 0, 0, -0.25);
}

function muzzle(parent: THREE.Object3D, z: number, kind: 'birdcage' | 'slant' | 'plain' | 'brake') {
  if (kind === 'birdcage') {
    cyl(parent, 0.022, 0.026, 0.075, M.metalDark, 0, 0.02, z, 'z', 10);
    for (let i = 0; i < 3; i++) box(parent, 0.01, 0.01, 0.012, M.dark, 0, 0.035, z - 0.015 + i * 0.02);
  } else if (kind === 'slant') {
    cyl(parent, 0.023, 0.027, 0.06, M.metalDark, 0, 0.02, z, 'z', 10);
    box(parent, 0.03, 0.012, 0.035, M.dark, 0, 0.04, z + 0.035, 0.32);
  } else if (kind === 'brake') {
    cyl(parent, 0.025, 0.028, 0.07, M.metalDark, 0, 0.02, z, 'z', 10);
    box(parent, 0.055, 0.022, 0.05, M.dark, 0, 0.02, z + 0.025);
  } else {
    cyl(parent, 0.022, 0.024, 0.055, M.metalDark, 0, 0.02, z, 'z', 10);
  }
}

function buildM16(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.10, 0.14, 0.40, M.body, 0, 0, -0.03);
  box(g, 0.09, 0.07, 0.32, M.body2, 0, 0.095, -0.04);
  box(g, 0.105, 0.045, 0.32, M.body, 0, -0.075, 0.04);
  // triangular handguard
  cyl(g, 0.072, 0.072, 0.30, M.olive, 0, 0.0, 0.30, 'z', 3);
  box(g, 0.10, 0.022, 0.31, M.olive, 0, 0.065, 0.30);
  // barrel
  cyl(g, 0.018, 0.018, 0.40, M.metal, 0, 0.02, 0.48, 'z', 10);
  box(g, 0.060, 0.055, 0.045, M.dark, 0, 0.058, 0.53);
  box(g, 0.048, 0.070, 0.032, M.dark, 0, 0.095, 0.53);
  box(g, 0.012, 0.05, 0.015, M.metal, -0.018, 0.145, 0.53);
  box(g, 0.012, 0.05, 0.015, M.metal, 0.018, 0.145, 0.53);
  muzzle(g, 0.70, 'birdcage');
  // carry handle: two supports + bridge, so the gap reads from the side
  box(g, 0.065, 0.14, 0.045, M.dark, 0, 0.125, -0.22);
  box(g, 0.018, 0.14, 0.06, M.dark, -0.035, 0.125, -0.22);
  box(g, 0.018, 0.14, 0.06, M.dark, 0.035, 0.125, -0.22);
  box(g, 0.065, 0.14, 0.045, M.dark, 0, 0.125, 0.07);
  box(g, 0.060, 0.028, 0.34, M.dark, 0, 0.180, -0.075);
  box(g, 0.045, 0.020, 0.25, M.metalDark, 0, 0.198, -0.075);
  box(g, 0.060, 0.040, 0.05, M.dark, 0, 0.150, 0.10);
  // rear aperture + ears + elevation drum
  torus(g, 0.024, 0.006, M.metal, 0, 0.205, -0.185, 0, 0, 0);
  box(g, 0.012, 0.045, 0.035, M.metal, -0.038, 0.205, -0.185);
  box(g, 0.012, 0.045, 0.035, M.metal, 0.038, 0.205, -0.185);
  cyl(g, 0.022, 0.022, 0.030, M.metal, -0.045, 0.205, -0.11, 'x', 8);
  // ejection port / bolt / forward assist
  box(g, 0.008, 0.045, 0.12, M.dark, 0.052, 0.015, -0.04);
  box(g, 0.012, 0.022, 0.055, M.metal, 0.055, 0.030, 0.02);
  box(g, 0.020, 0.020, 0.045, M.metalDark, 0.055, 0.055, -0.08);
  // handguard ribs / side panel
  for (let i = 0; i < 4; i++) {
    box(g, 0.012, 0.050, 0.025, M.metalDark, 0.052, 0.005, 0.20 + i * 0.055);
  }
  box(g, 0.075, 0.045, 0.12, M.body2, 0, 0.015, 0.43);
  box(g, 0.055, 0.026, 0.24, M.body, 0, 0.078, -0.23);
  // fixed stock: neck into receiver, wide butt at rear
  cyl(g, 0.032, 0.032, 0.20, M.metalDark, 0, 0.01, -0.24, 'z', 10);
  box(g, 0.078, 0.090, 0.13, M.dark, 0, 0.0, -0.215);
  box(g, 0.092, 0.120, 0.20, M.dark, 0, 0.0, -0.36);
  box(g, 0.100, 0.150, 0.075, M.dark, 0, 0.0, -0.465);
  box(g, 0.105, 0.160, 0.050, M.rubber, 0, 0.0, -0.515);
  box(g, 0.055, 0.026, 0.22, M.metalDark, 0, 0.085, -0.27);
  box(g, 0.075, 0.030, 0.18, M.metalDark, 0, 0.085, -0.39);
  box(g, 0.012, 0.065, 0.012, M.metal, 0.050, -0.055, 0.15);
  // grip + mag
  pistolGrip(g, -0.12);
  triggerGuard(g, -0.03);
  const mag = new THREE.Group();
  mag.name = 'magazine';
  mag.position.set(0, -0.17, 0.017);
  mag.rotation.x = -0.10;
  mag.userData.rest = { y: -0.17, z: 0.017, rx: -0.10 };
  g.add(mag);
  box(mag, 0.065, 0.20, 0.095, M.body2, 0, 0, 0);
  box(mag, 0.07, 0.03, 0.10, M.dark, 0, -0.105, 0.015);
  // preview-only muzzle flash
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.16, 5),
    new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  );
  flash.name = 'muzzleFlash';
  flash.position.set(0, 0.02, 0.77);
  flash.rotation.x = -Math.PI / 2;
  flash.visible = false;
  g.add(flash);
  // sling
  box(g, 0.012, 0.07, 0.012, M.metalDark, -0.075, -0.06, -0.45);
  box(g, 0.012, 0.07, 0.012, M.metalDark, -0.075, -0.05, 0.46);
  g.scale.y = 0.6;
  return g;
}

function buildM4(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.10, 0.13, 0.34, M.body, 0, 0, -0.02);
  box(g, 0.09, 0.065, 0.28, M.body2, 0, 0.09, -0.02);
  box(g, 0.105, 0.045, 0.30, M.body, 0, -0.07, 0.06);
  // slim handguard + rails
  box(g, 0.09, 0.095, 0.28, M.body, 0, 0.005, 0.30);
  rail(g, 0.06, 0.18, 0.44);
  rail(g, -0.06, 0.18, 0.44);
  box(g, 0.065, 0.022, 0.26, M.body2, 0, 0.065, 0.30);
  cyl(g, 0.017, 0.017, 0.31, M.metal, 0, 0.02, 0.52, 'z', 10);
  muzzle(g, 0.71, 'birdcage');
  // flat top + red dot
  rail(g, 0.135, -0.18, 0.12);
  // collapsible stock: narrow neck, wider butt
  cyl(g, 0.030, 0.030, 0.22, M.metalDark, 0, -0.005, -0.25, 'z', 10);
  box(g, 0.072, 0.080, 0.14, M.body, 0, 0.0, -0.20);
  box(g, 0.082, 0.115, 0.18, M.body, 0, 0.0, -0.34);
  box(g, 0.088, 0.150, 0.055, M.body, 0, 0.0, -0.445);
  box(g, 0.092, 0.160, 0.040, M.dark, 0, -0.005, -0.475);
  // grip/mag
  pistolGrip(g, -0.12);
  triggerGuard(g, -0.03);
  box(g, 0.065, 0.21, 0.095, M.body2, 0, -0.18, 0.06, -0.16);
  box(g, 0.07, 0.03, 0.10, M.dark, 0, -0.29, 0.08, -0.16);
  // front sight / sling
  box(g, 0.055, 0.050, 0.04, M.dark, 0, 0.050, 0.47);
  box(g, 0.05, 0.075, 0.03, M.dark, 0, 0.085, 0.47);
  box(g, 0.012, 0.045, 0.015, M.metal, -0.018, 0.130, 0.47);
  box(g, 0.012, 0.045, 0.015, M.metal, 0.018, 0.130, 0.47);
  g.scale.y = 0.77;
  return g;
}

function buildAKM(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.11, 0.13, 0.36, M.metalDark, 0, 0, -0.02);
  box(g, 0.09, 0.055, 0.26, M.metal, 0, 0.085, -0.02);
  // wood stock: neck into receiver, thick butt at rear
  box(g, 0.082, 0.090, 0.12, M.woodDark, 0, 0.0, -0.16);
  box(g, 0.090, 0.105, 0.16, M.wood, 0, 0.0, -0.245);
  box(g, 0.098, 0.130, 0.18, M.wood, 0, 0.0, -0.39);
  box(g, 0.105, 0.165, 0.065, M.wood, 0, 0.0, -0.465);
  box(g, 0.110, 0.175, 0.045, M.woodDark, 0, 0.0, -0.505);
  box(g, 0.075, 0.030, 0.22, M.wood, 0, 0.082, -0.28);
  // wood handguard
  box(g, 0.10, 0.10, 0.22, M.wood, 0, 0.0, 0.25);
  box(g, 0.08, 0.05, 0.20, M.wood, 0, 0.075, 0.25);
  box(g, 0.10, 0.09, 0.10, M.woodDark, 0, -0.02, 0.38);
  // gas tube + barrel
  cyl(g, 0.021, 0.021, 0.30, M.metal, 0, 0.095, 0.36, 'z', 10);
  cyl(g, 0.018, 0.018, 0.36, M.metal, 0, 0.02, 0.48, 'z', 10);
  box(g, 0.045, 0.055, 0.03, M.dark, 0, 0.11, 0.44);
  box(g, 0.060, 0.055, 0.045, M.dark, 0, 0.050, 0.62);
  box(g, 0.05, 0.075, 0.03, M.dark, 0, 0.095, 0.62);
  box(g, 0.012, 0.05, 0.015, M.metal, -0.018, 0.15, 0.62);
  box(g, 0.012, 0.05, 0.015, M.metal, 0.018, 0.15, 0.62);
  muzzle(g, 0.70, 'slant');
  // rear sight: leaf + protective ears + notch
  box(g, 0.07, 0.025, 0.05, M.metalDark, 0, 0.115, 0.10);
  box(g, 0.060, 0.012, 0.045, M.metal, 0, 0.138, 0.095);
  box(g, 0.012, 0.040, 0.045, M.metal, -0.030, 0.145, 0.10);
  box(g, 0.012, 0.040, 0.045, M.metal, 0.030, 0.145, 0.10);
  box(g, 0.012, 0.014, 0.046, M.dark, 0, 0.147, 0.095);
  // wood grip
  box(g, 0.065, 0.17, 0.09, M.woodDark, 0, -0.16, -0.12, 0.25);
  triggerGuard(g, -0.03);
  // curved magazine: three segments
  box(g, 0.06, 0.12, 0.10, M.dark, 0, -0.15, 0.075, -0.22);
  box(g, 0.06, 0.11, 0.095, M.dark, 0, -0.25, 0.105, -0.38);
  box(g, 0.06, 0.10, 0.09, M.dark, 0, -0.34, 0.155, -0.58);
  box(g, 0.065, 0.025, 0.095, M.metalDark, 0, -0.39, 0.26, -0.58);
  // sling
  box(g, 0.012, 0.07, 0.012, M.tan, -0.08, -0.07, -0.44);
  box(g, 0.012, 0.06, 0.012, M.tan, -0.08, -0.04, 0.42);
  g.scale.y = 0.6;
  return g;
}

function buildMP5(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.09, 0.12, 0.36, M.dark, 0, 0, -0.02);
  box(g, 0.08, 0.045, 0.30, M.body, 0, 0.08, -0.02);
  // slim handguard
  box(g, 0.075, 0.08, 0.24, M.body, 0, 0.0, 0.24);
  box(g, 0.08, 0.025, 0.22, M.body2, 0, 0.055, 0.24);
  cyl(g, 0.016, 0.016, 0.25, M.metal, 0, 0.02, 0.43, 'z', 10);
  muzzle(g, 0.56, 'plain');
  // cocking tube
  cyl(g, 0.018, 0.018, 0.27, M.metalDark, 0, 0.07, 0.365, 'z', 10);
  // front sight ring
  torus(g, 0.024, 0.004, M.dark, 0, 0.092, 0.515, 0, 0, 0);
  box(g, 0.05, 0.055, 0.045, M.dark, 0, 0.060, 0.515);
  // retractable stock
  stockCollar(g, -0.175, M.metal, 0.115, 0.14, 0.07);
  cyl(g, 0.012, 0.012, 0.26, M.metal, -0.045, 0.01, -0.29, 'z', 8);
  cyl(g, 0.012, 0.012, 0.26, M.metal, 0.045, 0.01, -0.29, 'z', 8);
  box(g, 0.12, 0.14, 0.04, M.dark, 0, 0.01, -0.44);
  box(g, 0.13, 0.04, 0.06, M.body, 0, 0.09, -0.44);
  // grip + curved mag
  pistolGrip(g, -0.13);
  triggerGuard(g, -0.04);
  box(g, 0.055, 0.11, 0.09, M.dark, 0, -0.12, 0.15, -0.18);
  box(g, 0.055, 0.10, 0.08, M.dark, 0, -0.21, 0.185, -0.38);
  box(g, 0.055, 0.09, 0.075, M.dark, 0, -0.29, 0.225, -0.55);
  // rear sight drum
  cyl(g, 0.028, 0.028, 0.055, M.dark, 0, 0.090, -0.015, 'x', 10);
  // sling
  box(g, 0.012, 0.05, 0.012, M.metalDark, -0.07, -0.05, -0.43);
  box(g, 0.012, 0.05, 0.012, M.metalDark, -0.07, -0.04, 0.43);
  g.scale.y = 0.85;
  return g;
}


function scope(parent: THREE.Object3D, z: number, len = 0.18, color: THREE.Material = M.dark) {
  // rail mounts, rings, tube, objective/ocular bells, turrets
  box(parent, 0.070, 0.018, len + 0.02, M.metalDark, 0, 0.132, z);
  for (const dz of [-len * 0.28, len * 0.28]) {
    box(parent, 0.082, 0.026, 0.032, M.metal, 0, 0.148, z + dz);
    box(parent, 0.05, 0.060, 0.038, M.dark, 0, 0.178, z + dz);
  }
  box(parent, 0.075, 0.070, len + 0.04, color, 0, 0.185, z);
  cyl(parent, 0.036, 0.036, len, M.metalDark, 0, 0.198, z, 'z', 12);
  // objective bell
  cyl(parent, 0.048, 0.036, 0.07, M.metalDark, 0, 0.198, z + len / 2 + 0.02, 'z', 12);
  cyl(parent, 0.041, 0.041, 0.006, M.glass, 0, 0.198, z + len / 2 + 0.056, 'z', 12);
  // ocular
  cyl(parent, 0.041, 0.034, 0.06, M.metalDark, 0, 0.198, z - len / 2 - 0.02, 'z', 12);
  cyl(parent, 0.033, 0.033, 0.006, M.glass, 0, 0.198, z - len / 2 - 0.052, 'z', 12);
  // turrets
  cyl(parent, 0.020, 0.020, 0.032, M.metal, 0, 0.238, z, 'y', 8);
  cyl(parent, 0.017, 0.017, 0.030, M.metal, 0.050, 0.198, z - 0.01, 'x', 8);
}

function stockCollar(parent: THREE.Object3D, z: number, m: THREE.Material, w = 0.105, h = 0.145, d = 0.07) {
  box(parent, w, h, d, m, 0, 0, z);
}

function buildMk14(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.11, 0.13, 0.44, M.tan, 0, 0, -0.02);
  box(g, 0.09, 0.06, 0.28, M.metalDark, 0, 0.09, -0.04);
  box(g, 0.10, 0.06, 0.26, M.tan, 0, 0.01, 0.25);
  rail(g, 0.065, 0.12, 0.38);
  box(g, 0.05, 0.055, 0.04, M.dark, 0, 0.095, 0.61);
  box(g, 0.012, 0.055, 0.012, M.metal, 0, 0.135, 0.61);
  box(g, 0.05, 0.045, 0.04, M.dark, 0, 0.095, -0.15);
  cyl(g, 0.019, 0.019, 0.42, M.metal, 0, 0.02, 0.48, 'z', 10);
  muzzle(g, 0.71, 'brake');
  stockCollar(g, -0.195, M.tan, 0.10, 0.145, 0.075);
  box(g, 0.095, 0.14, 0.34, M.tan, 0, -0.01, -0.35);
  box(g, 0.11, 0.16, 0.055, M.rubber, 0, -0.01, -0.53);
  pistolGrip(g, -0.12);
  triggerGuard(g, -0.03);
  box(g, 0.07, 0.20, 0.10, M.metalDark, 0, -0.17, 0.15, -0.12);
  box(g, 0.075, 0.03, 0.105, M.dark, 0, -0.28, 0.165, -0.12);
  for (const x of [-0.055, 0.055]) {
    box(g, 0.012, 0.30, 0.012, M.metalDark, x, -0.10, 0.55, 0.28);
  }
  g.scale.y = 0.85;
  return g;
}

function buildAWM(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.10, 0.12, 0.50, M.body, 0, 0, -0.02);
  box(g, 0.09, 0.06, 0.30, M.metalDark, 0, 0.08, -0.02);
  stockCollar(g, -0.215, M.olive, 0.095, 0.13, 0.075);
  box(g, 0.085, 0.11, 0.34, M.olive, 0, -0.01, -0.38);
  box(g, 0.10, 0.15, 0.06, M.rubber, 0, -0.01, -0.56);
  box(g, 0.09, 0.035, 0.22, M.olive, 0, 0.07, -0.37);
  box(g, 0.085, 0.045, 0.18, M.olive, 0, -0.025, 0.31);
  cyl(g, 0.035, 0.030, 0.07, M.metal, 0, 0.02, 0.26, 'z', 10);
  cyl(g, 0.017, 0.017, 0.58, M.metal, 0, 0.02, 0.57, 'z', 10);
  muzzle(g, 0.87, 'brake');
  // bolt handle
  cyl(g, 0.012, 0.012, 0.10, M.metal, 0.075, 0.02, -0.06, 'x', 8);
  box(g, 0.035, 0.025, 0.04, M.dark, 0.13, 0.02, -0.06);
  pistolGrip(g, -0.14);
  triggerGuard(g, -0.04);
  box(g, 0.07, 0.16, 0.10, M.metalDark, 0, -0.15, 0.12, -0.15);
  ironSight(g, 0.10);
  g.scale.y = 0.85;
  return g;
}

/**
 * 反器材狙击枪 AMR：与 AWM 明确区分的重装轮廓。
 * 更长的枪管（+Z 到 1.03）、粗枪管配三道加强环、大型方形枪口制退器、
 * 加厚机匣与顶盖、加固护木 + 两脚架、大容量盒式弹匣、粗壮贴腮枪托（沙色涂装）。
 */
function buildAMR(): THREE.Group {
  const g = new THREE.Group();
  // ---- 机匣：加厚加长，顶盖 + 抛壳盖板 ----
  box(g, 0.135, 0.130, 0.62, M.body, 0, 0.005, -0.06);
  box(g, 0.145, 0.045, 0.30, M.dark, 0, -0.048, -0.02);
  box(g, 0.115, 0.055, 0.55, M.metalDark, 0, 0.085, -0.06);
  box(g, 0.075, 0.022, 0.30, M.metal, 0, 0.116, -0.10);
  rail(g, 0.128, -0.30, 0.14);
  // ---- 加固护木：方形护木 + 上下散热槽 + 与机匣的加强结合块 ----
  box(g, 0.105, 0.105, 0.34, M.tan, 0, 0.005, 0.365);
  for (const z of [0.275, 0.345, 0.415]) {
    box(g, 0.115, 0.016, 0.022, M.dark, 0, 0.030, z);
    box(g, 0.115, 0.016, 0.022, M.dark, 0, -0.032, z);
  }
  box(g, 0.115, 0.030, 0.10, M.metalDark, 0, -0.055, 0.20);
  // ---- 粗枪管 + 三道加强环 + 枪口收口段 ----
  cyl(g, 0.032, 0.034, 0.56, M.metal, 0, 0.025, 0.53, 'z', 12);
  cyl(g, 0.020, 0.026, 0.16, M.metal, 0, 0.022, 0.885, 'z', 12);
  for (const z of [0.40, 0.56, 0.72]) cyl(g, 0.037, 0.037, 0.022, M.metalDark, 0, 0.025, z, 'z', 12);
  // ---- 大型方形枪口制退器：宽体扁方造型 + 三道横向排气窗 + 前端面 ----
  // 刻意压低高度、拉宽横向尺寸：既有反器材制退器的体量，又不把枪口焰整个盖住。
  const bz = 0.955;
  box(g, 0.110, 0.062, 0.150, M.dark, 0, 0.022, bz);
  box(g, 0.136, 0.030, 0.128, M.metalDark, 0, 0.022, bz);
  for (const z of [0.900, 0.950, 1.000]) box(g, 0.140, 0.014, 0.024, M.metal, 0, 0.022, z);
  box(g, 0.096, 0.048, 0.022, M.metalDark, 0, 0.022, 1.030);
  // ---- 两脚架：座块 + 外撇支腿 + 橡胶脚垫 ----
  box(g, 0.075, 0.045, 0.070, M.metalDark, 0, -0.063, 0.47);
  for (const side of [-1, 1]) {
    box(g, 0.022, 0.30, 0.024, M.metalDark, side * 0.105, -0.20, 0.50, 0, 0, -side * 0.30);
    box(g, 0.016, 0.14, 0.018, M.metal, side * 0.070, -0.155, 0.50, 0, 0, -side * 0.34);
    box(g, 0.055, 0.018, 0.040, M.rubber, side * 0.145, -0.328, 0.50);
  }
  // ---- 大容量盒式弹匣（含底板与进弹口）----
  box(g, 0.100, 0.280, 0.145, M.metalDark, 0, -0.205, 0.085);
  box(g, 0.108, 0.032, 0.152, M.rubber, 0, -0.348, 0.085);
  box(g, 0.088, 0.035, 0.130, M.dark, 0, -0.075, 0.085);
  // ---- 握把 / 扳机组（含扳机座，避免扳机护圈悬空）----
  pistolGrip(g, -0.175);
  box(g, 0.070, 0.055, 0.10, M.dark, 0, -0.082, -0.06);
  triggerGuard(g, -0.06);
  // ---- 枪托：粗壮托身 + 贴腮板 + 橡胶托底 + 下导轨 ----
  stockCollar(g, -0.395, M.tan, 0.125, 0.165, 0.085);
  box(g, 0.115, 0.155, 0.40, M.tan, 0, -0.015, -0.60);
  box(g, 0.100, 0.050, 0.24, M.tan, 0, 0.090, -0.56);
  box(g, 0.085, 0.022, 0.20, M.metalDark, 0, 0.118, -0.56);
  box(g, 0.135, 0.205, 0.075, M.rubber, 0, -0.018, -0.835);
  box(g, 0.060, 0.028, 0.24, M.metalDark, 0, -0.100, -0.65);
  // ---- 拉栓、侧导轨与识别色小件 ----
  cyl(g, 0.014, 0.014, 0.12, M.metal, 0.100, 0.030, -0.20, 'x', 8);
  box(g, 0.040, 0.032, 0.045, M.dark, 0.166, 0.030, -0.20);
  box(g, 0.026, 0.022, 0.10, M.metalDark, -0.076, 0.045, 0.06);
  box(g, 0.014, 0.014, 0.014, M.accent, -0.076, 0.045, 0.02);
  // ---- 机瞄：前瞄坐在护木顶部的瞄具塔座上，后瞄立在抛壳盖板尾部 ----
  box(g, 0.062, 0.075, 0.055, M.dark, 0, 0.093, 0.175);
  ironSight(g, 0.175);
  ironSight(g, -0.33, true);
  return g;
}

function buildUzi(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.10, 0.14, 0.26, M.body, 0, 0, 0);
  box(g, 0.09, 0.035, 0.24, M.body2, 0, 0.085, 0);
  box(g, 0.092, 0.075, 0.13, M.body, 0, 0.015, 0.19);
  cyl(g, 0.015, 0.015, 0.18, M.metal, 0, 0.02, 0.24, 'z', 10);
  muzzle(g, 0.33, 'plain');
  // Uzi: magazine inserts through the pistol grip (single housing)
  box(g, 0.075, 0.125, 0.13, M.dark, 0, -0.075, 0.06);
  box(g, 0.063, 0.22, 0.075, M.metalDark, 0, -0.195, 0.06, -0.02);
  box(g, 0.068, 0.030, 0.085, M.rubber, 0, -0.315, 0.065, -0.02);
  box(g, 0.062, 0.020, 0.15, M.dark, 0, -0.095, 0.135);
  box(g, 0.012, 0.055, 0.012, M.dark, -0.03, -0.12, 0.20);
  box(g, 0.012, 0.055, 0.012, M.dark, 0.03, -0.12, 0.20);
  // wire stock
  stockCollar(g, -0.11, M.body2, 0.11, 0.13, 0.065);
  box(g, 0.012, 0.012, 0.28, M.metalDark, -0.045, -0.02, -0.22);
  box(g, 0.012, 0.012, 0.28, M.metalDark, 0.045, -0.02, -0.22);
  box(g, 0.10, 0.07, 0.035, M.rubber, 0, -0.02, -0.37);
  box(g, 0.05, 0.03, 0.10, M.dark, 0, 0.085, 0.06);
  g.scale.y = 0.57;
  return g;
}

function buildVector(): THREE.Group {
  const g = new THREE.Group();

  // ---- upper receiver: continuous from handguard to stock hinge ----
  box(g, 0.115, 0.070, 0.36, M.body, 0, 0.100, -0.01);
  box(g, 0.105, 0.095, 0.145, M.body, 0, 0.020, 0.235);
  box(g, 0.090, 0.095, 0.220, M.body, 0, 0.010, 0.335); // front handguard to z=0.445
  box(g, 0.090, 0.040, 0.030, M.body2, 0, 0.070, 0.420);
  cyl(g, 0.018, 0.018, 0.135, M.metal, 0, 0.030, 0.405, 'z', 10);
  muzzle(g, 0.49, 'brake');

  // ---- front vertical foregrip, attached to handguard, clear of the frame ----
  box(g, 0.072, 0.030, 0.105, M.body2, 0, -0.045, 0.350);
  box(g, 0.050, 0.155, 0.060, M.dark, 0, -0.125, 0.350);
  box(g, 0.056, 0.028, 0.075, M.rubber, 0, -0.208, 0.350);

  // ---- hollow parallelogram: TOP/BOTTOM horizontal, SIDES slant down-right ----
  box(g, 0.120, 0.050, 0.335, M.body, 0, 0.045, 0.000);        // top edge (horizontal)
  box(g, 0.120, 0.050, 0.320, M.body, 0, -0.140, -0.060);       // bottom edge (horizontal)
  box(g, 0.120, 0.185, 0.055, M.body, 0, -0.048, 0.130, 0.36);  // front side, slants down-right
  box(g, 0.120, 0.175, 0.055, M.body, 0, -0.048, -0.185, 0.36); // rear side, slants down-right
  // trigger inside the open frame
  box(g, 0.050, 0.030, 0.060, M.metalDark, 0, -0.080, -0.045);
  box(g, 0.014, 0.060, 0.016, M.metal, 0, -0.098, -0.045);

  // ---- rear grip and stock: connected to the frame ----
  box(g, 0.070, 0.030, 0.100, M.body, 0, -0.150, -0.095);       // grip connector under frame
  box(g, 0.065, 0.150, 0.090, M.dark, 0, -0.165, -0.100, 0.22);
  box(g, 0.070, 0.035, 0.095, M.rubber, 0, -0.230, -0.120, 0.22);
  box(g, 0.130, 0.120, 0.070, M.metalDark, 0, 0.040, -0.225);   // hinge, overlaps rear side
  cyl(g, 0.065, 0.065, 0.11, M.metal, 0, 0.040, -0.230, 'x', 10);
  box(g, 0.100, 0.040, 0.270, M.metalDark, 0, 0.120, -0.345, -0.10); // top tube
  box(g, 0.090, 0.040, 0.265, M.metalDark, 0, -0.010, -0.345, 0.20); // lower brace
  box(g, 0.032, 0.035, 0.225, M.metal, 0.032, 0.060, -0.345, -0.18);
  box(g, 0.100, 0.220, 0.045, M.rubber, 0, 0.045, -0.475);      // butt plate
  box(g, 0.072, 0.050, 0.030, M.metal, 0, 0.160, -0.455);

  // ---- top rail and low-profile flip-up sights ----
  // Vector's real sights sit just above the rail. The old posts were ~6-7 cm
  // tall and, once an optic was mounted, stood through the middle of the lens.
  // Keep them low enough that any optic only catches their tips at the bottom.
  rail(g, 0.112, -0.17, 0.44);
  const rearBase = box(g, 0.040, 0.022, 0.045, M.dark, 0, 0.140, -0.130);
  const rearLeft = box(g, 0.012, 0.034, 0.016, M.metal, -0.014, 0.157, -0.130);
  const rearRight = box(g, 0.012, 0.034, 0.016, M.metal, 0.014, 0.157, -0.130);
  const frontBase = box(g, 0.040, 0.022, 0.040, M.dark, 0, 0.140, 0.240);
  const frontPost = box(g, 0.012, 0.040, 0.012, M.metal, 0, 0.160, 0.240);
  for (const sight of [rearBase, rearLeft, rearRight, frontBase, frontPost]) sight.userData.ironSight = true;

  // side ejection / charging handle
  box(g, 0.020, 0.028, 0.115, M.metal, 0.067, 0.045, 0.035);
  box(g, 0.008, 0.060, 0.150, M.dark, 0.061, 0.010, -0.040);

  // ---- magazine: down-right, parallel to the slanted sides ----
  box(g, 0.078, 0.065, 0.125, M.body2, 0, -0.150, 0.165, 0.36); // magwell
  box(g, 0.058, 0.225, 0.088, M.metalDark, 0, -0.255, 0.140, 0.36);
  for (let i = 0; i < 4; i++) box(g, 0.062, 0.010, 0.086, M.body2, 0, -0.190 - i * 0.042, 0.158 - i * 0.015, 0.36);
  box(g, 0.062, 0.028, 0.095, M.dark, 0, -0.355, 0.090, 0.36);

  g.scale.y = 0.89;
  return g;
}

function buildUMP(): THREE.Group {
  const g = new THREE.Group();
  // frame shifted +0.11 z: 690 mm UMP, exposed barrel only ~0.055
  box(g, 0.11, 0.13, 0.36, M.body, 0, 0, 0.09);
  box(g, 0.09, 0.05, 0.30, M.body2, 0, 0.055, 0.12);
  rail(g, 0.086, 0.02, 0.43);
  box(g, 0.09, 0.09, 0.22, M.body, 0, 0.0, 0.37);
  cyl(g, 0.0105, 0.0105, 0.20, M.metal, 0, 0.02, 0.46, 'z', 10);
  muzzle(g, 0.51, 'plain');
  // retractable skeleton stock, tall triangular butt
  stockCollar(g, -0.07, M.metal, 0.105, 0.12, 0.07);
  box(g, 0.012, 0.030, 0.35, M.metalDark, -0.05, 0.060, -0.245);
  box(g, 0.012, 0.030, 0.34, M.metalDark, 0.05, 0.060, -0.245);
  box(g, 0.012, 0.030, 0.34, M.metalDark, 0, -0.025, -0.245, 0.20);
  box(g, 0.10, 0.15, 0.045, M.rubber, 0, -0.028, -0.40);
  // simple iron sights (red dot is an accessory; omitted from bare audit)
  box(g, 0.05, 0.025, 0.045, M.dark, 0, 0.080, 0.455);
  box(g, 0.012, 0.045, 0.012, M.metal, 0, 0.105, 0.455);
  box(g, 0.045, 0.025, 0.045, M.dark, 0, 0.080, -0.005);
  pistolGrip(g, -0.02);
  triggerGuard(g, 0.07);
  box(g, 0.07, 0.24, 0.095, M.metalDark, 0, -0.18, 0.265, -0.235);
  box(g, 0.075, 0.03, 0.10, M.dark, 0, -0.305, 0.29, -0.235);
  g.scale.y = 0.95;
  return g;
}

function buildM870(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.11, 0.13, 0.34, M.body, 0, 0, 0);
  box(g, 0.09, 0.06, 0.24, M.metalDark, 0, 0.08, 0.02);
  // long barrel + tube
  cyl(g, 0.020, 0.020, 0.62, M.metal, 0, 0.04, 0.48, 'z', 10);
  cyl(g, 0.025, 0.025, 0.44, M.metalDark, 0, -0.02, 0.40, 'z', 10);
  muzzle(g, 0.82, 'plain');
  // wooden pump and stock
  box(g, 0.10, 0.10, 0.22, M.wood, 0, -0.02, 0.32);
  stockCollar(g, -0.185, M.woodDark, 0.10, 0.13, 0.065);
  box(g, 0.095, 0.12, 0.30, M.wood, 0, -0.01, -0.32);
  box(g, 0.11, 0.15, 0.055, M.woodDark, 0, -0.01, -0.49);
  box(g, 0.08, 0.03, 0.20, M.wood, 0, 0.06, -0.32);
  // 870 has no pistol grip; the stock wrist carries forward
  triggerGuard(g, -0.03);
  box(g, 0.02, 0.025, 0.02, M.brass, 0, 0.07, 0.74);
  g.scale.y = 0.82;
  return g;
}

function buildM249(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.15, 0.15, 0.50, M.body, 0, 0, -0.02);
  box(g, 0.12, 0.06, 0.34, M.body2, 0, 0.10, -0.02);
  box(g, 0.13, 0.15, 0.39, M.body, 0, 0.0, 0.365);
  box(g, 0.075, 0.11, 0.10, M.metalDark, 0, 0.0, 0.59);
  box(g, 0.03, 0.10, 0.03, M.dark, 0, 0.11, 0.60);
  cyl(g, 0.022, 0.022, 0.56, M.metal, 0, 0.02, 0.60, 'z', 10);
  muzzle(g, 0.89, 'brake');
  stockCollar(g, -0.225, M.olive, 0.12, 0.15, 0.07);
  box(g, 0.11, 0.14, 0.30, M.olive, 0, -0.01, -0.38);
  box(g, 0.12, 0.15, 0.06, M.rubber, 0, -0.01, -0.56);
  // Fold the barrel carrying handle to the right; the receiver rail stays clear.
  box(g, 0.05, 0.04, 0.28, M.dark, 0.12, 0.105, 0.36);
  box(g, 0.03, 0.03, 0.06, M.dark, 0.07, 0.09, 0.45);
  cyl(g, 0.02, 0.02, 0.04, M.metal, 0.082, 0.105, 0.45, 'x', 8);
  // box magazine
  box(g, 0.15, 0.13, 0.27, M.olive, 0, -0.085, 0.285);
  box(g, 0.17, 0.03, 0.28, M.metalDark, 0, -0.16, 0.285);
  // bipod
  for (const x of [-0.08, 0.08]) {
    box(g, 0.014, 0.44, 0.014, M.metalDark, x, -0.27, 0.55, 0.06);
  }
  rail(g, 0.12, -0.14, 0.12);
  pistolGrip(g, -0.14);
  triggerGuard(g, -0.05);
  g.scale.y = 0.9;
  return g;
}

/**
 * RPG-7 风格发射器：粗发射管 + 前端锥形战斗部，全长约 1.28（枪口 +Z）。
 * 管轴 y=.02，管顶 y=.072 —— 机械瞄具/导轨座落在管顶，枪口在战斗部前端。
 */
function buildRPG(): THREE.Group {
  const g = new THREE.Group();
  // 尾部喷管（文丘里锥）
  cyl(g, 0.050, 0.082, 0.17, M.metalDark, 0, 0.02, -0.545, 'z', 10);
  cyl(g, 0.086, 0.086, 0.022, M.dark, 0, 0.02, -0.632, 'z', 10);
  // 发射管
  cyl(g, 0.052, 0.052, 0.80, M.olive, 0, 0.02, -0.05, 'z', 12);
  for (const z of [-0.34, -0.22]) cyl(g, 0.058, 0.058, 0.02, M.dark, 0, 0.02, z, 'z', 10);
  // 中段木质隔热护套
  cyl(g, 0.060, 0.060, 0.16, M.wood, 0, 0.02, 0.14, 'z', 10);
  // 战斗部：略粗的弹体 + 前端锥形装药
  cyl(g, 0.082, 0.082, 0.10, M.olive, 0, 0.02, 0.40, 'z', 12);
  cyl(g, 0.086, 0.086, 0.014, M.metalDark, 0, 0.02, 0.35, 'z', 12);
  cyl(g, 0.020, 0.082, 0.17, M.olive, 0, 0.02, 0.535, 'z', 12);
  cyl(g, 0.010, 0.020, 0.022, M.metalDark, 0, 0.02, 0.631, 'z', 8);
  // 顶部机械瞄具：后照门（带护耳）+ 前准星
  box(g, 0.055, 0.020, 0.070, M.metalDark, 0, 0.086, -0.02);
  box(g, 0.012, 0.045, 0.016, M.metal, -0.020, 0.115, -0.02);
  box(g, 0.012, 0.045, 0.016, M.metal, 0.020, 0.115, -0.02);
  box(g, 0.030, 0.008, 0.014, M.dark, 0, 0.122, -0.005);
  box(g, 0.055, 0.018, 0.050, M.metalDark, 0, 0.082, 0.22);
  box(g, 0.010, 0.038, 0.012, M.metal, 0, 0.108, 0.22);
  // 握把 + 扳机 + 前握木
  box(g, 0.055, 0.060, 0.100, M.dark, 0, -0.060, -0.02);
  box(g, 0.055, 0.135, 0.075, M.dark, 0, -0.115, -0.08, 0.22);
  box(g, 0.060, 0.028, 0.080, M.rubber, 0, -0.185, -0.10, 0.22);
  triggerGuard(g, -0.02);
  box(g, 0.052, 0.100, 0.060, M.wood, 0, -0.082, 0.20);
  // 侧背带环
  box(g, 0.012, 0.055, 0.012, M.metalDark, -0.070, -0.035, -0.30);
  return g;
}

/**
 * 喷火器：背负式燃料罐 + 短粗喷嘴 + 软管，全长约 1.00（喷嘴 +Z）。
 * 罐体在枪身下方，软管沿左侧绕到枪身前上方。
 */
function buildFlamethrower(): THREE.Group {
  const g = new THREE.Group();
  // 短粗喷嘴 + 喇叭口
  cyl(g, 0.042, 0.034, 0.24, M.metalDark, 0, 0.02, 0.40, 'z', 10);
  cyl(g, 0.050, 0.050, 0.030, M.metal, 0, 0.02, 0.295, 'z', 10);
  cyl(g, 0.055, 0.040, 0.060, M.dark, 0, 0.02, 0.55, 'z', 10);
  // 枪身 + 顶盖
  box(g, 0.100, 0.115, 0.30, M.body, 0, -0.005, 0.10);
  box(g, 0.088, 0.030, 0.26, M.body2, 0, 0.065, 0.09);
  box(g, 0.080, 0.090, 0.060, M.metalDark, 0, -0.010, -0.06);
  // 燃料罐（罐体 + 两端封头 + 压力表）
  cyl(g, 0.085, 0.085, 0.36, M.olive, 0, -0.115, -0.24, 'z', 12);
  cyl(g, 0.088, 0.088, 0.020, M.metalDark, 0, -0.115, -0.07, 'z', 12);
  cyl(g, 0.088, 0.088, 0.020, M.metalDark, 0, -0.115, -0.41, 'z', 12);
  cyl(g, 0.026, 0.026, 0.018, M.metal, 0.062, -0.115, -0.30, 'x', 8);
  cyl(g, 0.019, 0.019, 0.006, M.glass, 0.073, -0.115, -0.30, 'x', 8);
  // 软管：左侧长段 → 立管 → 枪身前上方，喷嘴根部再绕一圈
  cyl(g, 0.013, 0.013, 0.34, M.rubber, -0.092, -0.080, 0.10, 'z', 6);
  cyl(g, 0.013, 0.013, 0.12, M.rubber, -0.092, -0.020, 0.27, 'y', 6);
  cyl(g, 0.013, 0.013, 0.10, M.rubber, -0.050, 0.040, 0.27, 'x', 6);
  torus(g, 0.050, 0.011, M.rubber, 0, 0.02, 0.315, 0, 0, 0);
  // 握把 + 扳机 + 前握把
  box(g, 0.060, 0.030, 0.120, M.dark, 0, -0.075, 0.03);
  box(g, 0.052, 0.135, 0.075, M.dark, 0, -0.135, 0, 0.22);
  box(g, 0.058, 0.026, 0.080, M.rubber, 0, -0.205, -0.02, 0.22);
  triggerGuard(g, 0.06);
  box(g, 0.050, 0.130, 0.060, M.dark, 0, -0.085, 0.30);
  return g;
}

export function buildWeaponModel(id: WeaponModelId): THREE.Group {
  switch (id) {
    case 'm16': return buildM16();
    case 'm4a1': return buildM4();
    case 'akm': return buildAKM();
    case 'mp5': return buildMP5();
    case 'mk14': return buildMk14();
    case 'awm': return buildAWM();
    case 'amr': return buildAMR();
    case 'uzi': return buildUzi();
    case 'vector': return buildVector();
    case 'ump45': return buildUMP();
    case 'm870': return buildM870();
    case 'm249': return buildM249();
    case 'rpg': return buildRPG();
    case 'flamethrower': return buildFlamethrower();
    default: return buildM16();
  }
}
