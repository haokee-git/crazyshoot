/**
 * 千户苗寨环境装饰：低模猪群（4 个 InstancedMesh = 4 draw calls）。
 *
 * 猪只在自己的栏位里做非战斗的缓慢转身/低头动作，不寻敌、不占点、不阻挡、
 * 不产生血腥；不进入玩家碰撞/子弹世界（纯表现，由地图 extensions 驱动）。
 */
import * as THREE from 'three';

export interface PigAmbientEntry {
  x: number;
  z: number;
  yaw: number;
  color: number;
  phase: number;
}

export interface PigAmbient {
  group: THREE.Group;
  update(dt: number, now: number): void;
  dispose(): void;
}

export function buildPigAmbient(entries: readonly PigAmbientEntry[], ground: (x: number, z: number) => number): PigAmbient {
  const group = new THREE.Group();
  group.name = 'miao-pig-ambient';
  const bodyGeo = new THREE.BoxGeometry(0.9, 0.55, 1.45);
  const headGeo = new THREE.BoxGeometry(0.52, 0.45, 0.55);
  const snoutGeo = new THREE.BoxGeometry(0.28, 0.22, 0.25);
  const legGeo = new THREE.BoxGeometry(0.17, 0.42, 0.17);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xd9b8a0 });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xc99c84 });
  const snoutMat = new THREE.MeshLambertMaterial({ color: 0x8d6f60 });
  const legMat = new THREE.MeshLambertMaterial({ color: 0x8d6f60 });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, entries.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, entries.length);
  const snouts = new THREE.InstancedMesh(snoutGeo, snoutMat, entries.length);
  const legs = new THREE.InstancedMesh(legGeo, legMat, entries.length * 4);
  for (const mesh of [bodies, heads, snouts, legs]) {
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
  }
  const bases = entries.map((p) => ({ ...p, y: ground(p.x, p.z) }));
  const dummy = new THREE.Object3D();
  const headObj = new THREE.Object3D();
  const update = (dt: number, now: number) => {
    void dt;
    for (let i = 0; i < bases.length; i++) {
      const b = bases[i];
      const t = now / 1000 + b.phase;
      const turn = Math.sin(t * 0.13) * 0.22;
      const bob = Math.max(0, Math.sin(t * 0.9)) * 0.035;
      const yaw = b.yaw + turn;
      dummy.position.set(b.x, b.y + 0.55 + bob, b.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      headObj.position.set(b.x + Math.sin(yaw) * 0.82, b.y + 0.56 + bob - Math.max(0, Math.sin(t * 0.55)) * 0.12, b.z + Math.cos(yaw) * 0.82);
      headObj.rotation.set(0.0, yaw, Math.sin(t * 0.55) * 0.08);
      headObj.updateMatrix();
      heads.setMatrixAt(i, headObj.matrix);
      dummy.position.set(b.x + Math.sin(yaw) * 1.12, b.y + 0.5 + bob - Math.max(0, Math.sin(t * 0.55)) * 0.12, b.z + Math.cos(yaw) * 1.12);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      snouts.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 4; k++) {
        const lx = (k % 2 ? 0.28 : -0.28), lz = (k < 2 ? 0.5 : -0.5);
        const cos = Math.cos(yaw), sin = Math.sin(yaw);
        dummy.position.set(b.x + lx * cos - lz * sin, b.y + 0.21, b.z + lx * sin + lz * cos);
        dummy.rotation.set(0, yaw, 0);
        dummy.updateMatrix();
        legs.setMatrixAt(i * 4 + k, dummy.matrix);
      }
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    snouts.instanceMatrix.needsUpdate = true;
    legs.instanceMatrix.needsUpdate = true;
  };
  update(0, 0);
  return {
    group,
    update,
    dispose() {
      group.removeFromParent();
      bodyGeo.dispose(); headGeo.dispose(); snoutGeo.dispose(); legGeo.dispose();
      bodyMat.dispose(); headMat.dispose(); snoutMat.dispose(); legMat.dispose();
      bodies.dispose(); heads.dispose(); snouts.dispose(); legs.dispose();
    },
  };
}
