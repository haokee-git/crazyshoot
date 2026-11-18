import * as THREE from 'three';
import { BLOCK_TEXTURES, materialMean } from '../../content/materials/battlefield';

/** Surface class drives the dust colour and the impact sound. */
export type ImpactSurface = 'concrete' | 'metal' | 'wood' | 'dirt';

/** Decals fade out over this window and are gone exactly DECAL_LIFE seconds after the hit. */
export const DECAL_LIFE = 10;
const DECAL_FADE = 1.2;
const DECAL_SIZE = 0.3;

export function impactSurface(material: number): ImpactSurface {
  const name = BLOCK_TEXTURES[material] ?? '';
  if (/metal|steel|container|rust|galvan|hazard|grate|plate|window/.test(name)) return 'metal';
  if (/wood|timber|crate|bark|dock/.test(name)) return 'wood';
  if (/grass|earth|dirt|mud|gravel|sand|foliage|moss|limb|forest/.test(name)) return 'dirt';
  return 'concrete';
}

interface DustParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
  size: number; alpha: number;
  r: number; g: number; b: number;
  alive: boolean;
}

/**
 * Bullet impacts on static geometry: a dust puff (one instanced draw call) and a
 * multiply-blended hole decal (one instanced draw call). Both pools are fixed
 * size and recycle their oldest slot, so sustained fire cannot grow the frame cost.
 */
export class ImpactSystem {
  private readonly decals: THREE.InstancedMesh;
  private readonly decalGeometry: THREE.PlaneGeometry;
  private readonly decalMaterial: THREE.ShaderMaterial;
  private readonly decalFade: THREE.InstancedBufferAttribute;
  private readonly decalAge: Float32Array;
  private readonly decalAlive: Uint8Array;
  private readonly decalMatrix = new THREE.Matrix4();
  private readonly decalScale = new THREE.Vector3();
  private readonly decalQuaternion = new THREE.Quaternion();
  private readonly decalEuler = new THREE.Euler();
  private readonly normalAxis = new THREE.Vector3(0, 0, 1);
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempColor = new THREE.Color();
  private readonly dustTangent = new THREE.Vector3();
  private readonly dustBitangent = new THREE.Vector3();
  private readonly dustUp = new THREE.Vector3(0, 1, 0);
  private readonly dustSide = new THREE.Vector3(1, 0, 0);
  private decalCursor = 0;
  private liveDecalCount = 0;

  private readonly dustMesh: THREE.InstancedMesh;
  private readonly dustGeometry: THREE.PlaneGeometry;
  private readonly dustMaterial: THREE.ShaderMaterial;
  private readonly dustAlpha: THREE.InstancedBufferAttribute;
  private readonly dustColor: THREE.InstancedBufferAttribute;
  private readonly dustParticles: DustParticle[] = [];
  private readonly dustMatrix = new THREE.Matrix4();
  private readonly dustScale = new THREE.Vector3();
  private readonly dustPosition = new THREE.Vector3();
  private dustCursor = 0;
  private liveDustCount = 0;

  constructor(
    private readonly scene: THREE.Scene,
    assets: { decal: THREE.Texture; smoke: THREE.Texture },
    capacity: { decals?: number; dust?: number } = {},
  ) {
    const decalCapacity = capacity.decals ?? 96;
    const dustCapacity = capacity.dust ?? 96;

    this.decalGeometry = new THREE.PlaneGeometry(1, 1);
    this.decalFade = new THREE.InstancedBufferAttribute(new Float32Array(decalCapacity), 1);
    this.decalFade.setUsage(THREE.DynamicDrawUsage);
    this.decalGeometry.setAttribute('aFade', this.decalFade);
    this.decalMaterial = new THREE.ShaderMaterial({
      uniforms: { map: { value: assets.decal } },
      vertexShader: `
        attribute float aFade;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vUv = uv;
          vFade = aFade;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vec4 hit = texture2D(map, vUv);
          float amount = hit.a * vFade;
          // Multiply-only decal: dst * mix(1, hit.rgb, amount) keeps the wall's
          // colour and grain, and fades back to the untouched wall as it expires.
          gl_FragColor = vec4(mix(vec3(1.0), hit.rgb, amount), 1.0);
        }`,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.ZeroFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
    });
    this.decals = new THREE.InstancedMesh(this.decalGeometry, this.decalMaterial, decalCapacity);
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 1;
    this.decals.name = 'bullet-hole-decals';
    this.decalAge = new Float32Array(decalCapacity);
    this.decalAlive = new Uint8Array(decalCapacity);
    this.decalScale.setScalar(0);
    this.decalMatrix.compose(new THREE.Vector3(), new THREE.Quaternion(), this.decalScale);
    for (let i = 0; i < decalCapacity; i++) this.decals.setMatrixAt(i, this.decalMatrix);
    this.decals.count = decalCapacity;
    scene.add(this.decals);

    this.dustGeometry = new THREE.PlaneGeometry(1, 1);
    this.dustColor = new THREE.InstancedBufferAttribute(new Float32Array(dustCapacity * 3), 3);
    this.dustAlpha = new THREE.InstancedBufferAttribute(new Float32Array(dustCapacity), 1);
    this.dustColor.setUsage(THREE.DynamicDrawUsage);
    this.dustAlpha.setUsage(THREE.DynamicDrawUsage);
    this.dustGeometry.setAttribute('aColor', this.dustColor);
    this.dustGeometry.setAttribute('aAlpha', this.dustAlpha);
    this.dustMaterial = new THREE.ShaderMaterial({
      uniforms: { map: { value: assets.smoke } },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aAlpha;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vUv = uv;
          vColor = aColor;
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float alpha = texture2D(map, vUv).a * vAlpha;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(vColor, alpha);
        }`,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.dustMesh = new THREE.InstancedMesh(this.dustGeometry, this.dustMaterial, dustCapacity);
    this.dustMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dustMesh.frustumCulled = false;
    this.dustMesh.renderOrder = 2;
    this.dustMesh.name = 'bullet-impact-dust';
    this.dustScale.setScalar(0);
    this.dustMatrix.compose(new THREE.Vector3(), new THREE.Quaternion(), this.dustScale);
    for (let i = 0; i < dustCapacity; i++) {
      this.dustParticles.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0, size: 0, alpha: 0, r: 0, g: 0, b: 0, alive: false });
      this.dustMesh.setMatrixAt(i, this.dustMatrix);
    }
    this.dustMesh.count = dustCapacity;
    scene.add(this.dustMesh);
  }

  get liveDecals() { return this.liveDecalCount; }
  get liveDust() { return this.liveDustCount; }

  /** Spawn dust (always) and, when `decal` is true, a bullet hole on static geometry. */
  spawn(point: THREE.Vector3, normal: THREE.Vector3, material: number, decal = true) {
    const surface = impactSurface(material);
    if (decal && material > 0) this.stamp(point, normal);
    this.puff(point, normal, material, surface);
  }

  private stamp(point: THREE.Vector3, normal: THREE.Vector3) {
    const capacity = this.decalAge.length;
    const slot = this.decalCursor++ % capacity;
    if (!this.decalAlive[slot]) this.liveDecalCount++;
    this.decalAlive[slot] = 1;
    this.decalAge[slot] = 0;
    this.decalFade.array[slot] = 1;
    this.decalFade.needsUpdate = true;
    const size = DECAL_SIZE * (0.86 + Math.random() * 0.3);
    this.decalQuaternion.setFromUnitVectors(this.normalAxis, normal);
    this.decalEuler.set(0, 0, Math.random() * Math.PI * 2);
    this.decalQuaternion.multiply(this.tempQuaternion.setFromEuler(this.decalEuler));
    this.decalScale.set(size, size, 1);
    this.tempPosition.copy(point).addScaledVector(normal, 0.016 + Math.random() * 0.01);
    this.decalMatrix.compose(this.tempPosition, this.decalQuaternion, this.decalScale);
    this.decals.setMatrixAt(slot, this.decalMatrix);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  private puff(point: THREE.Vector3, normal: THREE.Vector3, material: number, surface: ImpactSurface) {
    const capacity = this.dustParticles.length;
    const mean = materialMean(material);
    // Dust takes the wall's brightness but a neutral warm hue: copying the block's
    // mean colour directly turns stone dust green or brick dust pink.
    const luma = (mean[0] * 0.3 + mean[1] * 0.59 + mean[2] * 0.11) / 255;
    // Freshly pulverised stone scatters light: keep the dust clearly brighter than
    // the wall so it reads on sunlit plaster instead of blending into it.
    const brightness = 0.62 + 0.45 * luma;
    const neutral = surface === 'dirt' ? [214, 190, 150] : [232, 226, 212];
    const tint = surface === 'metal'
      ? [mean[0] * 0.7 + 128, mean[1] * 0.62 + 112, mean[2] * 0.46 + 70]
      : [
          neutral[0] * brightness + mean[0] * 0.1,
          neutral[1] * brightness + mean[1] * 0.1,
          neutral[2] * brightness + mean[2] * 0.1,
        ];
    const color = this.tempColor.setRGB(
      Math.min(255, tint[0]) / 255,
      Math.min(255, tint[1]) / 255,
      Math.min(255, tint[2]) / 255,
      THREE.SRGBColorSpace,
    );
    // Orthonormal spray frame on the hit face: normal out, tangent/bitangent sideways.
    const up = Math.abs(normal.y) > 0.9 ? this.dustSide : this.dustUp;
    this.dustTangent.crossVectors(up, normal).normalize();
    if (this.dustTangent.lengthSq() < 1e-6) this.dustTangent.set(1, 0, 0);
    this.dustBitangent.crossVectors(normal, this.dustTangent).normalize();
    const count = surface === 'metal' ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const slot = this.dustCursor++ % capacity;
      const particle = this.dustParticles[slot];
      if (!particle.alive) this.liveDustCount++;
      const outward = 1.1 + Math.random() * 1.5;
      const spreadA = (Math.random() - 0.5) * 2.4;
      const spreadB = (Math.random() - 0.5) * 2.4;
      particle.alive = true;
      particle.age = 0;
      particle.life = 0.4 + Math.random() * 0.28;
      particle.x = point.x + normal.x * 0.03 + (Math.random() - 0.5) * 0.05;
      particle.y = point.y + normal.y * 0.03 + (Math.random() - 0.5) * 0.05;
      particle.z = point.z + normal.z * 0.03 + (Math.random() - 0.5) * 0.05;
      particle.vx = normal.x * outward + this.dustTangent.x * spreadA + this.dustBitangent.x * spreadB;
      particle.vy = normal.y * outward + this.dustTangent.y * spreadA + this.dustBitangent.y * spreadB + Math.random() * 0.22;
      particle.vz = normal.z * outward + this.dustTangent.z * spreadA + this.dustBitangent.z * spreadB;
      particle.size = (surface === 'metal' ? 0.07 : 0.14) * (0.7 + Math.random() * 0.6);
      particle.alpha = surface === 'metal' ? 0.85 : 0.74;
      particle.r = color.r; particle.g = color.g; particle.b = color.b;
      const colorArray = this.dustColor.array as Float32Array;
      colorArray[slot * 3] = color.r;
      colorArray[slot * 3 + 1] = color.g;
      colorArray[slot * 3 + 2] = color.b;
    }
    this.dustColor.needsUpdate = true;
  }

  update(dt: number, camera: THREE.Camera) {
    this.updateDecals(dt);
    this.updateDust(dt, camera);
  }

  private updateDecals(dt: number) {
    let fading = false;
    for (let i = 0; i < this.decalAge.length; i++) {
      if (!this.decalAlive[i]) continue;
      this.decalAge[i] += dt;
      if (this.decalAge[i] >= DECAL_LIFE) {
        this.decalAlive[i] = 0;
        this.liveDecalCount--;
        this.decalFade.array[i] = 0;
        this.decalScale.setScalar(0);
        this.decalMatrix.compose(this.tempPosition.set(0, 0, 0), this.tempQuaternion.identity(), this.decalScale);
        this.decals.setMatrixAt(i, this.decalMatrix);
        this.decals.instanceMatrix.needsUpdate = true;
        fading = true;
        continue;
      }
      const fade = Math.min(1, (DECAL_LIFE - this.decalAge[i]) / DECAL_FADE);
      if (fade < 1) { this.decalFade.array[i] = fade; fading = true; }
    }
    if (fading) this.decalFade.needsUpdate = true;
  }

  private updateDust(dt: number, camera: THREE.Camera) {
    const colorArray = this.dustColor.array as Float32Array;
    const alphaArray = this.dustAlpha.array as Float32Array;
    for (let i = 0; i < this.dustParticles.length; i++) {
      const particle = this.dustParticles[i];
      if (!particle.alive) continue;
      particle.age += dt;
      if (particle.age >= particle.life) {
        particle.alive = false;
        this.liveDustCount--;
        alphaArray[i] = 0;
        this.dustScale.setScalar(0);
        this.dustMatrix.compose(this.dustPosition.set(0, 0, 0), this.tempQuaternion.identity(), this.dustScale);
        this.dustMesh.setMatrixAt(i, this.dustMatrix);
        continue;
      }
      const t = particle.age / particle.life;
      const drag = Math.exp(-dt * 4.5);
      particle.vx *= drag;
      particle.vy = particle.vy * drag + 0.5 * dt;
      particle.vz *= drag;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      const size = particle.size * (1 + t * 2.1);
      this.dustScale.set(size, size, 1);
      this.dustMatrix.compose(this.dustPosition.set(particle.x, particle.y, particle.z), camera.quaternion, this.dustScale);
      this.dustMesh.setMatrixAt(i, this.dustMatrix);
      alphaArray[i] = particle.alpha * (1 - t) ** 1.5;
      colorArray[i * 3] = particle.r;
      colorArray[i * 3 + 1] = particle.g;
      colorArray[i * 3 + 2] = particle.b;
    }
    this.dustMesh.instanceMatrix.needsUpdate = true;
    this.dustAlpha.needsUpdate = true;
  }

  clear() {
    this.liveDecalCount = 0;
    this.decalAlive.fill(0);
    this.decalFade.array.fill(0);
    this.decalFade.needsUpdate = true;
    this.decalScale.setScalar(0);
    const empty = this.decalMatrix.compose(this.tempPosition.set(0, 0, 0), this.tempQuaternion.identity(), this.decalScale);
    for (let i = 0; i < this.decalAge.length; i++) this.decals.setMatrixAt(i, empty);
    this.decals.instanceMatrix.needsUpdate = true;
    this.liveDustCount = 0;
    for (const particle of this.dustParticles) particle.alive = false;
    (this.dustAlpha.array as Float32Array).fill(0);
    this.dustAlpha.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.decals, this.dustMesh);
    this.decalGeometry.dispose();
    this.dustGeometry.dispose();
    this.decalMaterial.dispose();
    this.dustMaterial.dispose();
    (this.decalMaterial.uniforms.map.value as THREE.Texture | null)?.dispose();
  }
}

/**
 * Bullet-hole decal texture: a procedural placeholder is available immediately,
 * then the generated PNG is painted over it once decoded.
 */
export function loadBulletHoleTexture(url = '/textures/fx/bullet_hole.png'): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  const hole = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.11);
  hole.addColorStop(0, 'rgba(12,11,10,1)');
  hole.addColorStop(0.45, 'rgba(30,28,26,1)');
  hole.addColorStop(0.7, 'rgba(150,146,138,0.55)');
  hole.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = hole;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = 'rgba(60,58,54,0.5)';
  context.lineWidth = 1.4;
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
    const reach = size * (0.16 + Math.random() * 0.16);
    context.beginPath();
    context.moveTo(size / 2 + Math.cos(angle) * size * 0.06, size / 2 + Math.sin(angle) * size * 0.06);
    context.lineTo(size / 2 + Math.cos(angle) * reach, size / 2 + Math.sin(angle) * reach);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  new THREE.TextureLoader().load(url, (loaded) => {
    const image = loaded.image;
    context.clearRect(0, 0, size, size);
    if (image) context.drawImage(image as CanvasImageSource, 0, 0, size, size);
    loaded.dispose();
    texture.needsUpdate = true;
  }, undefined, () => { /* keep the procedural decal */ });
  return texture;
}
