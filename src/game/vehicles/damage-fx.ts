import * as THREE from 'three';

export interface VehicleFxInput {
  id: string; x: number; y: number; z: number; yaw: number;
  kind: string; health: number; maxHealth: number; destroyed: boolean;
}

const SMOKE_CAPACITY = 320;
const FIRE_CAPACITY = 96;
const SPARK_CAPACITY = 96;
const DEBRIS_CAPACITY = 24;
const FLAME_CAPACITY = 192;
const FLAME_SMOKE_CAPACITY = 48;

const DESTROYED_SMOKE_SECONDS = 20;
const DESTROYED_FIRE_SECONDS = 6;
const DESTROYED_SPARK_SECONDS = 10;

const FLAME_RATE = 190;
const FLAME_CORE_RATE = 45;
const FLAME_SMOKE_RATE = 20;

/** Hull top height and engine-deck offset (local -Z) per vehicle kind. */
const VEHICLE_TOP: Record<string, [number, number]> = {
  motorcycle: [1.3, 0],
  jeep: [1.8, 0.5],
  apc: [2.15, 0.8],
  ifv: [2.15, 0.8],
  light_tank: [2.15, 0.85],
  mbt: [2.3, 0.95],
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function canvasTexture(size: number, paint: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, size, size);
  paint(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Soft cloudy puff; only the alpha channel is sampled. */
function makePuffTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (context) => {
    const center = 32;
    const base = context.createRadialGradient(center, center, 0, center, center, center);
    base.addColorStop(0, 'rgba(255,255,255,.55)');
    base.addColorStop(.5, 'rgba(255,255,255,.3)');
    base.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = base;
    context.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 11; i++) {
      const angle = (i / 11) * Math.PI * 2 + Math.random() * .8;
      const distance = 7 + Math.random() * 10;
      const x = center + Math.cos(angle) * distance;
      const y = center + Math.sin(angle) * distance;
      const radius = 7 + Math.random() * 8;
      const blob = context.createRadialGradient(x, y, 0, x, y, radius);
      blob.addColorStop(0, 'rgba(255,255,255,.62)');
      blob.addColorStop(.55, 'rgba(255,255,255,.3)');
      blob.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = blob;
      context.fillRect(0, 0, 64, 64);
    }
  });
}

/** Hot round glow used by fire, sparks and the blast flash. */
function makeGlowTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (context) => {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(.22, 'rgba(255,255,255,.94)');
    gradient.addColorStop(.5, 'rgba(255,255,255,.34)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  });
}

interface FxParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
  size0: number; size1: number;
  alpha: number;
  r0: number; g0: number; b0: number;
  r1: number; g1: number; b1: number;
  gravity: number; drag: number; spin: number; rot: number;
  alive: boolean;
}

/**
 * Fixed-size billboard particle pool: one InstancedMesh (one draw call), no
 * per-frame allocation. Quads are billboarded in view space by the vertex
 * shader, so no camera is needed by update().
 */
class ParticlePool {
  private readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly colorAttr: THREE.InstancedBufferAttribute;
  private readonly alphaAttr: THREE.InstancedBufferAttribute;
  private readonly rotAttr: THREE.InstancedBufferAttribute;
  private readonly particles: FxParticle[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private cursor = 0;
  private live = 0;

  constructor(
    scene: THREE.Scene,
    capacity: number,
    texture: THREE.Texture,
    blending: THREE.Blending,
    renderOrder: number,
    name: string,
    private readonly alphaPower: number,
    private readonly sizeEase: number,
  ) {
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.rotAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.rotAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aColor', this.colorAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.geometry.setAttribute('aRot', this.rotAttr);
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aAlpha;
        attribute float aRot;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vUv = uv;
          vColor = aColor;
          vAlpha = aAlpha;
          mat4 im = instanceMatrix;
          vec3 center = (im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sx = length(im[0].xyz);
          float sy = length(im[1].xyz);
          float c = cos(aRot);
          float s = sin(aRot);
          vec2 p = vec2(position.x * sx, position.y * sy);
          vec4 mv = modelViewMatrix * vec4(center, 1.0);
          mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float alpha = texture2D(map, vUv).a * vAlpha;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(vColor, alpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = name;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.scale.setScalar(0);
    this.matrix.compose(this.position.set(0, 0, 0), this.quaternion.identity(), this.scale);
    for (let i = 0; i < capacity; i++) {
      this.particles.push({
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0,
        size0: 0, size1: 0, alpha: 0, r0: 0, g0: 0, b0: 0, r1: 0, g1: 0, b1: 0,
        gravity: 0, drag: 0, spin: 0, rot: 0, alive: false,
      });
      this.mesh.setMatrixAt(i, this.matrix);
    }
    scene.add(this.mesh);
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size0: number, size1: number, alpha: number,
    c0: THREE.Color, c1: THREE.Color,
    gravity = 0, drag = 0, spin = 0,
  ): void {
    const slot = this.cursor++ % this.particles.length;
    const p = this.particles[slot];
    if (!p.alive) this.live++;
    this.mesh.visible = true;
    p.alive = true;
    p.age = 0;
    p.life = Math.max(.02, life);
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.size0 = size0; p.size1 = size1; p.alpha = alpha;
    p.r0 = c0.r; p.g0 = c0.g; p.b0 = c0.b;
    p.r1 = c1.r; p.g1 = c1.g; p.b1 = c1.b;
    p.gravity = gravity; p.drag = drag; p.spin = spin;
    p.rot = Math.random() * Math.PI * 2;
  }

  update(dt: number): void {
    if (this.live <= 0) return;
    const colors = this.colorAttr.array as Float32Array;
    const alphas = this.alphaAttr.array as Float32Array;
    const rots = this.rotAttr.array as Float32Array;
    let live = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      const drawIndex=live++;
      const t = p.age / p.life;
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const grow = 1 - Math.pow(1 - t, this.sizeEase);
      const size = p.size0 + (p.size1 - p.size0) * grow;
      this.scale.set(size, size, 1);
      this.matrix.compose(this.position.set(p.x, p.y, p.z), this.quaternion.identity(), this.scale);
      this.mesh.setMatrixAt(drawIndex, this.matrix);
      alphas[drawIndex] = p.alpha * Math.pow(1 - t, this.alphaPower);
      colors[drawIndex * 3] = p.r0 + (p.r1 - p.r0) * t;
      colors[drawIndex * 3 + 1] = p.g0 + (p.g1 - p.g0) * t;
      colors[drawIndex * 3 + 2] = p.b0 + (p.b1 - p.b0) * t;
      rots[drawIndex] = p.rot;
    }
    this.live = live;
    this.mesh.count = live;
    this.mesh.visible = live > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.rotAttr.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

interface DebrisPiece {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  wx: number; wy: number; wz: number;
  size: number; age: number; life: number;
  alive: boolean;
}

/** Small dark chunks thrown by a blast; one instanced draw call. */
class DebrisPool {
  private readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.BoxGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly pieces: DebrisPiece[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private cursor = 0;
  private live = 0;

  constructor(scene: THREE.Scene, capacity: number, renderOrder: number) {
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'vehicle-debris';
    this.mesh.count = capacity;
    this.mesh.visible = false;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < capacity; i++) {
      this.pieces.push({
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0,
        size: 0, age: 0, life: 0, alive: false,
      });
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      const shade = rand(.05, .12);
      this.color.setRGB(shade * rand(.92, 1.12), shade * rand(.82, 1), shade * rand(.68, .92));
      this.mesh.setColorAt(i, this.color);
    }
    scene.add(this.mesh);
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    size: number, life: number,
  ): void {
    const slot = this.cursor++ % this.pieces.length;
    const p = this.pieces[slot];
    if (!p.alive) this.live++;
    this.mesh.visible = true;
    p.alive = true;
    p.age = 0;
    p.life = Math.max(.05, life);
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.rx = rand(0, Math.PI * 2);
    p.ry = rand(0, Math.PI * 2);
    p.rz = rand(0, Math.PI * 2);
    p.wx = rand(-9, 9);
    p.wy = rand(-9, 9);
    p.wz = rand(-9, 9);
    p.size = size;
  }

  update(dt: number): void {
    if (this.live <= 0) return;
    let live = 0;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      live++;
      p.vy -= 16 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.wx * dt;
      p.ry += p.wy * dt;
      p.rz += p.wz * dt;
      const t = p.age / p.life;
      const fade = t > .82 ? Math.max(0, (1 - t) / .18) : 1;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.rx, p.ry, p.rz);
      this.dummy.scale.setScalar(p.size * fade);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.live = live;
    this.mesh.visible = live > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

interface VehicleSmokeState {
  seen: number;
  smokeTimer: number;
  sparkTimer: number;
  fireTimer: number;
  destroyedAge: number;
  wasDestroyed: boolean;
}

/**
 * Vehicle damage visuals: health-driven smoke columns plus a one-shot blast.
 * Purely cosmetic and deterministic from health data, so every peer can run it
 * without events. All particles live in fixed pools with a hard cap.
 */
export class VehicleDamageFx {
  private readonly smoke: ParticlePool;
  private readonly fire: ParticlePool;
  private readonly spark: ParticlePool;
  private readonly debris: DebrisPool;
  private readonly smokeTexture: THREE.CanvasTexture;
  private readonly glowTexture: THREE.CanvasTexture;
  private readonly states = new Map<string, VehicleSmokeState>();
  private readonly c0 = new THREE.Color();
  private readonly c1 = new THREE.Color();
  private frame = 0;

  constructor(scene: THREE.Scene) {
    this.smokeTexture = makePuffTexture();
    this.glowTexture = makeGlowTexture();
    this.smoke = new ParticlePool(scene, SMOKE_CAPACITY, this.smokeTexture, THREE.NormalBlending, 3, 'vehicle-damage-smoke', 1.45, 2.1);
    this.fire = new ParticlePool(scene, FIRE_CAPACITY, this.glowTexture, THREE.AdditiveBlending, 5, 'vehicle-damage-fire', .95, 1.7);
    this.spark = new ParticlePool(scene, SPARK_CAPACITY, this.glowTexture, THREE.AdditiveBlending, 6, 'vehicle-damage-sparks', .7, 1.2);
    this.debris = new DebrisPool(scene, DEBRIS_CAPACITY, 7);
  }

  update(dt: number, vehicles: readonly VehicleFxInput[]): void {
    const step = THREE.MathUtils.clamp(dt, 0, .1);
    this.frame++;
    for (const v of vehicles) {
      let state = this.states.get(v.id);
      if (!state) {
        state = {
          seen: this.frame,
          smokeTimer: Math.random() * .14,
          sparkTimer: Math.random() * .4,
          fireTimer: Math.random() * .3,
          destroyedAge: -1,
          wasDestroyed: false,
        };
        this.states.set(v.id, state);
      }
      state.seen = this.frame;
      if (v.destroyed) {
        if (!state.wasDestroyed) {
          state.destroyedAge = 0;
          state.smokeTimer = 0;
          state.sparkTimer = 0;
          state.fireTimer = 0;
        } else {
          state.destroyedAge += step;
        }
        state.wasDestroyed = true;
      } else {
        state.destroyedAge = -1;
        state.wasDestroyed = false;
      }
      this.emitVehicle(v, state, step);
    }
    for (const [id, state] of this.states) {
      if (state.seen !== this.frame) this.states.delete(id);
    }
    this.smoke.update(step);
    this.fire.update(step);
    this.spark.update(step);
    this.debris.update(step);
  }

  explosion(point: THREE.Vector3, scale = 1): void {
    const s = THREE.MathUtils.clamp(scale, .25, 3);
    const x = point.x;
    const y = point.y + .35 * s;
    const z = point.z;

    // White-hot flash, then the expanding fireball.
    this.c0.setRGB(5, 3.6, 1.9);
    this.c1.setRGB(2.2, .7, .1);
    this.fire.spawn(x, y, z, 0, .4 * s, 0, .13, 1.7 * s, 2.9 * s, .9, this.c0, this.c1);
    this.c0.setRGB(2.6, 1.2, .25);
    this.c1.setRGB(1.2, .22, .02);
    this.fire.spawn(x, y, z, 0, .8 * s, 0, .24, 1 * s, 2 * s, .8, this.c0, this.c1, .6, .6);

    const fireCount = 10 + Math.floor(Math.random() * 5);
    for (let i = 0; i < fireCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const cosPhi = Math.random() * 2 - 1;
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
      const dx = Math.cos(theta) * sinPhi;
      const dy = Math.abs(cosPhi) * .75 + .2;
      const dz = Math.sin(theta) * sinPhi;
      const speed = rand(1.8, 5.2) * s;
      const size = rand(.7, 1.3) * s;
      this.c0.setRGB(3.4, 1.7, .4);
      this.c1.setRGB(1.3, .12, .005);
      this.fire.spawn(
        x + dx * rand(.2, .8) * s, y + dy * rand(.2, .8) * s, z + dz * rand(.2, .8) * s,
        dx * speed, dy * speed + 1.2 * s, dz * speed,
        rand(.45, .85), size, size * rand(2.1, 3.1), rand(.55, .78),
        this.c0, this.c1, 1.6, 2.2, rand(-3, 3),
      );
    }

    const smokeCount = 8 + Math.floor(Math.random() * 7);
    for (let i = 0; i < smokeCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const cosPhi = Math.random() * 2 - 1;
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
      const dx = Math.cos(theta) * sinPhi;
      const dy = Math.abs(cosPhi) * .6 + .25;
      const dz = Math.sin(theta) * sinPhi;
      const speed = rand(1.4, 3.6) * s;
      const size = rand(.55, 1.1) * s;
      this.c0.setRGB(.012, .011, .01);
      this.c1.setRGB(.028, .026, .024);
      this.smoke.spawn(
        x + dx * rand(.4, 1.2) * s, y + dy * rand(.3, 1.1) * s, z + dz * rand(.4, 1.2) * s,
        dx * speed, dy * speed + rand(1.2, 2.6) * s, dz * speed,
        rand(1.2, 1.9), size, size * rand(3.2, 4.8), rand(.5, .72),
        this.c0, this.c1, .8, 1.4, rand(-1.2, 1.2),
      );
    }

    const sparkCount = 22 + Math.floor(Math.random() * 12);
    for (let i = 0; i < sparkCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const cosPhi = Math.random() * 2 - 1;
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
      const dx = Math.cos(theta) * sinPhi;
      const dy = Math.abs(cosPhi) * .8 + .15;
      const dz = Math.sin(theta) * sinPhi;
      const speed = rand(4, 11) * s;
      this.c0.setRGB(5, 3, .8);
      this.c1.setRGB(1.6, .3, .03);
      this.spark.spawn(
        x + dx * .4 * s, y + dy * .4 * s, z + dz * .4 * s,
        dx * speed, dy * speed, dz * speed,
        rand(.35, .95), rand(.06, .14) * s, .02, 1,
        this.c0, this.c1, -11, .35,
      );
    }

    const debrisCount = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < debrisCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const speed = rand(2.5, 7) * s;
      this.debris.spawn(
        x + rand(-.5, .5) * s, y + rand(-.2, .6) * s, z + rand(-.5, .5) * s,
        Math.cos(theta) * speed, rand(2.5, 6.5) * s, Math.sin(theta) * speed,
        rand(.08, .18) * s, rand(1.1, 1.8),
      );
    }
  }

  dispose(): void {
    this.states.clear();
    this.smoke.dispose();
    this.fire.dispose();
    this.spark.dispose();
    this.debris.dispose();
    this.smokeTexture.dispose();
    this.glowTexture.dispose();
  }

  private emitVehicle(v: VehicleFxInput, state: VehicleSmokeState, dt: number): void {
    const ratio = v.maxHealth > 0 ? THREE.MathUtils.clamp(v.health / v.maxHealth, 0, 1) : 0;
    const destroyed = v.destroyed;
    if (!destroyed && ratio >= .35) return;

    const [top, rear] = VEHICLE_TOP[v.kind] ?? [2.1, .7];
    const x = v.x - Math.sin(v.yaw) * rear;
    const y = v.y + top;
    const z = v.z - Math.cos(v.yaw) * rear;
    const dense = destroyed || ratio < .15;
    const fade = destroyed ? THREE.MathUtils.clamp((DESTROYED_SMOKE_SECONDS - state.destroyedAge) / 4, 0, 1) : 1;

    if (!destroyed || state.destroyedAge < DESTROYED_SMOKE_SECONDS) {
      state.smokeTimer -= dt;
      if (state.smokeTimer <= 0) {
        const interval = destroyed ? .08 : dense ? .1 : .12;
        state.smokeTimer = interval * rand(.7, 1.3);
        const life = destroyed ? rand(4.2, 5.8) : dense ? rand(3.4, 4.6) : rand(3.2, 4.2);
        const size0 = destroyed ? rand(.6, .9) : dense ? rand(.45, .7) : rand(.45, .7);
        const size1 = destroyed ? rand(2.8, 4.2) : dense ? rand(2.2, 3.2) : rand(2.4, 3.4);
        const alpha = (destroyed ? rand(.48, .62) : dense ? rand(.4, .54) : rand(.42, .58)) * fade;
        if (destroyed) {
          this.c0.setRGB(.01, .009, .009);
          this.c1.copy(this.c0).multiplyScalar(1.6);
        } else if (dense) {
          this.c0.setRGB(.018, .017, .016);
          this.c1.copy(this.c0).multiplyScalar(1.6);
        } else {
          this.c0.setRGB(.62, .64, .62);
          this.c1.setRGB(.4, .42, .41);
        }
        this.smoke.spawn(
          x + rand(-.28, .28), y + rand(-.1, .18), z + rand(-.28, .28),
          rand(-.45, .45), destroyed ? rand(2.4, 3.8) : dense ? rand(2, 3.2) : rand(2.4, 3.2), rand(-.45, .45),
          life, size0, size1, alpha, this.c0, this.c1, dense ? .7 : .6, dense ? .45 : .5, rand(-.8, .8),
        );
      }
    }

    if (dense && (!destroyed || state.destroyedAge < DESTROYED_SPARK_SECONDS)) {
      state.sparkTimer -= dt;
      if (state.sparkTimer <= 0) {
        state.sparkTimer = rand(.28, .6) * (destroyed ? 1 + state.destroyedAge * .15 : 1);
        const count = Math.random() < .35 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          this.c0.setRGB(3.6, 1.8, .45);
          this.c1.setRGB(1.4, .22, .02);
          this.spark.spawn(
            x + rand(-.4, .4), y + rand(0, .3), z + rand(-.4, .4),
            rand(-1.4, 1.4), rand(1.2, 3.2), rand(-1.4, 1.4),
            rand(.45, .95), rand(.05, .11), .015, 1,
            this.c0, this.c1, -7, .4,
          );
        }
      }
    }

    if (destroyed && state.destroyedAge < DESTROYED_FIRE_SECONDS) {
      state.fireTimer -= dt;
      if (state.fireTimer <= 0) {
        state.fireTimer = rand(.18, .34);
        this.c0.setRGB(3.4, 1.5, .35);
        this.c1.setRGB(1.2, .16, .015);
        this.fire.spawn(
          x + rand(-.45, .45), y + rand(-.15, .2), z + rand(-.45, .45),
          rand(-.3, .3), rand(.9, 1.9), rand(-.3, .3),
          rand(.35, .7), rand(.3, .6), rand(.75, 1.35), rand(.5, .8),
          this.c0, this.c1, 1.6, 2, rand(-2.5, 2.5),
        );
      }
    }
  }
}

/**
 * Flame-thrower jet: a pooled cone of additive fire plus a short smoke tail.
 * emit() only spawns; update() must be called every frame to advance particles.
 */
export class FlameJet {
  private readonly flame: ParticlePool;
  private readonly smoke: ParticlePool;
  private readonly flameTexture: THREE.CanvasTexture;
  private readonly smokeTexture: THREE.CanvasTexture;
  private readonly c0 = new THREE.Color();
  private readonly c1 = new THREE.Color();
  private readonly dir = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly reference = new THREE.Vector3();
  private flameAccumulator = 0;
  private coreAccumulator = 0;
  private smokeAccumulator = 0;

  constructor(scene: THREE.Scene) {
    this.flameTexture = makeGlowTexture();
    this.smokeTexture = makePuffTexture();
    this.flame = new ParticlePool(scene, FLAME_CAPACITY, this.flameTexture, THREE.AdditiveBlending, 5, 'flame-jet-fire', .9, 1.4);
    this.smoke = new ParticlePool(scene, FLAME_SMOKE_CAPACITY, this.smokeTexture, THREE.NormalBlending, 4, 'flame-jet-smoke', 1.25, 1.9);
  }

  emit(origin: THREE.Vector3, direction: THREE.Vector3, dt: number): void {
    const step = THREE.MathUtils.clamp(dt, 0, .05);
    if (step <= 0) return;
    this.dir.copy(direction);
    if (this.dir.lengthSq() < 1e-8) this.dir.set(0, 0, -1);
    else this.dir.normalize();
    this.reference.set(0, 1, 0);
    if (Math.abs(this.dir.y) > .94) this.reference.set(1, 0, 0);
    this.side.crossVectors(this.dir, this.reference).normalize();
    this.up.crossVectors(this.side, this.dir).normalize();

    this.flameAccumulator += step * FLAME_RATE;
    let count = Math.min(12, Math.floor(this.flameAccumulator));
    this.flameAccumulator -= count;
    while (count-- > 0) this.spawnFlame(origin);

    this.coreAccumulator += step * FLAME_CORE_RATE;
    count = Math.min(4, Math.floor(this.coreAccumulator));
    this.coreAccumulator -= count;
    while (count-- > 0) this.spawnCore(origin);

    this.smokeAccumulator += step * FLAME_SMOKE_RATE;
    count = Math.min(3, Math.floor(this.smokeAccumulator));
    this.smokeAccumulator -= count;
    while (count-- > 0) this.spawnSmoke(origin);
  }

  update(dt: number): void {
    const step = THREE.MathUtils.clamp(dt, 0, .1);
    this.flame.update(step);
    this.smoke.update(step);
  }

  dispose(): void {
    this.flame.dispose();
    this.smoke.dispose();
    this.flameTexture.dispose();
    this.smokeTexture.dispose();
  }

  private spawnFlame(origin: THREE.Vector3): void {
    // 火焰要能喷到 12~14 m（与 FLAME_TUNING.range 对齐）：速度 × 寿命决定视觉射程。
    const speed = rand(12, 18);
    const spread = rand(.045, .105);
    const sx = rand(-spread, spread) * speed;
    const sy = rand(-spread, spread) * speed;
    const jitter = .07;
    this.c0.setRGB(.92, .35, .05);
    this.c1.setRGB(.28, .016, .002);
    this.flame.spawn(
      origin.x + this.side.x * rand(-jitter, jitter) + this.up.x * rand(-jitter, jitter) + this.dir.x * rand(0, .2),
      origin.y + this.side.y * rand(-jitter, jitter) + this.up.y * rand(-jitter, jitter) + this.dir.y * rand(0, .2),
      origin.z + this.side.z * rand(-jitter, jitter) + this.up.z * rand(-jitter, jitter) + this.dir.z * rand(0, .2),
      this.dir.x * speed + this.side.x * sx + this.up.x * sy,
      this.dir.y * speed + this.side.y * sx + this.up.y * sy,
      this.dir.z * speed + this.side.z * sx + this.up.z * sy,
      rand(.55, .82), rand(.26, .4), rand(.8, 1.25), rand(.55, .8),
      this.c0, this.c1, 1.2, 1.1, rand(-3, 3),
    );
  }

  private spawnCore(origin: THREE.Vector3): void {
    const speed = rand(17, 24);
    this.c0.setRGB(1.55, .86, .16);
    this.c1.setRGB(.8, .26, .03);
    this.flame.spawn(
      origin.x + this.dir.x * .06, origin.y + this.dir.y * .06, origin.z + this.dir.z * .06,
      this.dir.x * speed + this.side.x * rand(-.45, .45), this.dir.y * speed + this.up.y * rand(-.45, .45), this.dir.z * speed + this.side.z * rand(-.45, .45),
      rand(.05, .1), rand(.44, .6), rand(.12, .2), 1,
      this.c0, this.c1, .5, 2,
    );
  }

  private spawnSmoke(origin: THREE.Vector3): void {
    const travel = rand(2.2, 4.6);
    this.c0.setRGB(.045, .044, .042);
    this.c1.setRGB(.1, .098, .09);
    this.smoke.spawn(
      origin.x + this.dir.x * travel + this.side.x * rand(-.35, .35),
      origin.y + this.dir.y * travel + rand(0, .35),
      origin.z + this.dir.z * travel + this.side.z * rand(-.35, .35),
      this.dir.x * rand(.8, 2) + this.side.x * rand(-.4, .4),
      rand(1, 2) + this.dir.y * 1.2,
      this.dir.z * rand(.8, 2) + this.side.z * rand(-.4, .4),
      rand(1, 1.7), rand(.4, .6), rand(1.8, 2.8), rand(.28, .42),
      this.c0, this.c1, .9, 1.6, rand(-1.2, 1.2),
    );
  }
}
