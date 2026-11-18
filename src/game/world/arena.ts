import * as THREE from 'three';
import type {NavigationData} from './navigation';
import type {LadderDef} from '../../maps/battlefield-design';

export interface ArenaTarget {
  mesh: THREE.Mesh;
  hit: boolean;
  respawnAt: number;
}

export interface Arena {
  scene: THREE.Scene;
  ladders?:LadderDef[];
  navigationData?:NavigationData;
  /** 显式导航连接（窄门/石墩/楼梯），不改变碰撞。 */
  navLinks?:import('../../maps/types').NavLink[];
  colliders: THREE.Box3[];
  targets: ArenaTarget[];
  spawn: THREE.Vector3;
  spawnYaw: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  blocked(x: number, z: number, radius: number): boolean;
  heightAt?(x: number, z: number): number;
  navigationHeight?(x:number,z:number):number;
  supportAt?(x:number,z:number,maxY:number):number;
  rayDistance?(origin:THREE.Vector3,dir:THREE.Vector3,max:number):number;
  /** Same sweep as rayDistance, with the hit face normal and block material for impact FX. */
  raySurface?(origin:THREE.Vector3,dir:THREE.Vector3,max:number):{distance:number;normal:THREE.Vector3;material:number}|null;
  waterAt?(x: number, z: number,feet?:number): { surface: number; bottom: number } | null;
  waterExitAt?(x:number,z:number):{x:number;z:number}|null;
  minimapPlan?: number[][];
  /** 256×256 RGBA 战术底图（按材料/水面/道路上色），优先于 height palette。 */
  minimapColors?: Uint8Array;
  /** 真实世界的正交俯视渲染缩略图（M/小地图用），不经过高度色块。 */
  minimapOrtho?: HTMLCanvasElement;
  /** 战术图 5 段配色：水/低/中/高/岩脊，每项 [r,g,b]；按地图本身色调给。 */
  minimapPalette?: [number, number, number][];
  worldSize?: number;
  name?: string;
  mapId?: string;
  capturePoints?: { id: string; x: number; z: number; r: number; floorY?:number; verticalTolerance?:number; footprint?:{x0:number;z0:number;x1:number;z1:number} }[];
  /** 本图占点得分倍率；缺省 1。 */
  scoreRate?:number;
  /** 导航支撑层数；缺省 3。 */
  navigationLayers?:number;
  /** 导航栅格步长（米）；缺省 3。 */
  navigationStep?:number;
  /** 支撑扫描的最高 y；缺省 64。 */
  maxSupportY?:number;
  /** 相机远裁剪；缺省 700。 */
  viewDistance?:number;
  /** 本图色调曝光覆盖；缺省 1.24。 */
  exposure?:number;
  /** 载具模型可见距离；缺省 360，0/非有限=不裁。 */
  vehicleCullDistance?:number;
  /** 每帧环境动画（猪群等，纯表现）。 */
  updateAmbient?: (dt:number, now:number) => void;
  /** 是否启用 pharaoh 的动态载具刷新（旧图保持原行为）。 */
  dynamicVehicleRespawn?:boolean;
  /** 本局比赛时长（秒）；缺省 420。 */
  matchSeconds?:number;
  /** 缆索渡船定义（authoritative system is in engine; arena only carries data）。 */
  ferries?: {id:string;z:number;westX:number;eastX:number;deckY:number;deckLength:number;deckWidth:number;speed:number;dwellSeconds:number;countdownSeconds:number;initialSide:'west'|'east'}[];
  /** 每类载具毁损刷新间隔（毫秒）；缺省统一 45 s。 */
  vehicleRespawnDelays?: Record<string, number>;
  /** 地图级载具性能覆盖（法老图提速）；返回 undefined 用默认表。 */
  vehiclePerformance?: (kind:string)=>{maxSpeed?:number;accelScale?:number} | undefined;
  teamSpawns?: { blue: { x: number; z: number; yaw: number }; orange: { x: number; z: number; yaw: number } };
  vehicles?: { id: string; kind: string; team: 'blue' | 'orange' | 'neutral'; x: number; z: number; angle: number }[];
  /** 车位原始定义（含 neutral），刷新管理器按此绑定。 */
  vehiclePads?: { id:string; kind:string; team:'blue'|'orange'|'neutral'; x:number; z:number; angle:number }[];
  platformAt?(x:number,z:number,maxY:number): {id:string;y:number;x:number;z:number;yaw:number;carry?:boolean;manualCarry?:boolean}|null;
  playerBlocked?(x:number,z:number,r:number,feet:number,height?:number,ignoreId?:string):boolean;
  vehicleGroundAt?(x:number,z:number):number;
  footprintBlocked?(x:number,z:number,w:number,d:number,yaw:number,bottom:number,height:number,terrain?:{min:number;max:number}):boolean;
  blockedAt?(x: number, z: number, radius: number, fromHeight: number,height?:number): boolean;
  lineBlocked?(a: THREE.Vector3, b: THREE.Vector3): boolean;
  ready?: Promise<void>;
  setTextureResolution?(res:32|64|128):Promise<void>;
  raycastTargets(raycaster: THREE.Raycaster): ArenaTarget | null;
  reset(): void;
}

const COLORS = {
  ground: 0x353d3b,
  ground2: 0x222827,
  wall: 0x46504d,
  crate: 0x6b5e46,
  container: 0x536c6b,
  container2: 0x745545,
  building: 0x53605d,
  target: 0xff6a4d,
  targetHit: 0x35e0d0,
};

export function buildArena(): Arena {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#080c0f');
  scene.fog = new THREE.FogExp2('#080c0f', 0.012);
  const colliders: THREE.Box3[] = [];
  const targets: ArenaTarget[] = [];

  const hemi = new THREE.HemisphereLight(0xb4cec8, 0x1b2425, 2.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdfb8, 2.8);
  sun.position.set(18, 28, 14);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x59a6c9, 1.5);
  rim.position.set(-20, 10, -18);
  scene.add(rim);

  const mat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const addBox = (
    w: number, h: number, d: number, color: number,
    x: number, y: number, z: number,
    collide = true,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.set(x, y, z);
    scene.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, y, z), new THREE.Vector3(w, h, d)));
    }
    return mesh;
  };

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), mat(COLORS.ground));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new THREE.GridHelper(150, 75, 0x43524f, 0x2c3836);
  grid.position.y = 0.012;
  scene.add(grid);

  // training lane markings
  for (let i = -2; i <= 2; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 42), new THREE.MeshBasicMaterial({ color: 0x3d4a46 }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(i * 4, 0.015, -4);
    scene.add(line);
  }

  // perimeter
  addBox(1, 5, 120, COLORS.wall, -55, 2.5, 0);
  addBox(1, 5, 120, COLORS.wall, 55, 2.5, 0);
  addBox(110, 5, 1, COLORS.wall, 0, 2.5, -55);
  addBox(110, 5, 1, COLORS.wall, 0, 2.5, 55);

  // warehouse / cover blocks
  addBox(18, 8, 14, COLORS.building, -24, 4, -26);
  addBox(14, 5, 9, COLORS.building, 22, 2.5, -32);
  addBox(3, 3, 3, COLORS.container, -8, 1.5, -14);
  addBox(3, 3, 3, COLORS.container2, -4, 1.5, -14);
  addBox(3, 3, 3, COLORS.container, 14, 1.5, -10);
  addBox(3, 3, 3, COLORS.container2, 18, 1.5, -10);
  addBox(3, 3, 3, COLORS.container, -20, 1.5, 8);
  addBox(3, 3, 3, COLORS.container2, -16, 1.5, 8);
  addBox(3, 3, 3, COLORS.container, 24, 1.5, 12);
  addBox(3, 3, 3, COLORS.container2, 20, 1.5, 12);
  addBox(3, 3, 3, COLORS.crate, 0, 1.5, 2);
  addBox(2, 2, 2, COLORS.crate, 10, 1, 20);
  addBox(2, 2, 2, COLORS.crate, -14, 1, 24);

  // target boards at several ranges
  const targetGroup = new THREE.Group();
  scene.add(targetGroup);
  for (let i = 0; i < 7; i++) {
    const x = -18 + i * 6;
    const z = -40 + (i % 2) * 4;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.1, 0.18), mat(COLORS.target));
    board.position.set(x, 2.0, z);
    board.userData.target = i;
    scene.add(board);
    targets.push({ mesh: board, hit: false, respawnAt: 0 });
    // stand
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 1.2), mat(0x2b3231));
    stand.position.set(x, 0.05, z + 0.2);
    scene.add(stand);
  }

  const bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  return {
    scene,
    colliders,
    targets,
    spawn: new THREE.Vector3(0, 0, 32),
    spawnYaw: 0,
    bounds,
    blocked(x, z, radius) {
      for (const b of colliders) {
        if (x + radius > b.min.x && x - radius < b.max.x && z + radius > b.min.z && z - radius < b.max.z) {
          // ignore colliders that don't reach the player's body height (none here)
          return true;
        }
      }
      return x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ;
    },
    raycastTargets(raycaster) {
      const meshes = targets.filter((t) => !t.hit).map((t) => t.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (!hits.length) return null;
      return targets.find((t) => t.mesh === hits[0].object) ?? null;
    },
    reset() {
      for (const t of targets) {
        t.hit = false;
        t.respawnAt = 0;
        (t.mesh.material as THREE.MeshLambertMaterial).color.setHex(COLORS.target);
      }
    },
  };
}
