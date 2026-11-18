import type { Building } from '../../maps/types';
import { BLOCK } from './voxel-blocks';
import { furnishBuilding } from './interior-furnish';
import type {
  BoxCall,
  BuildingBuildResult,
  BuildingInteriorPlan,
  InteriorCategory,
  InteriorDecorPlane,
  InteriorWindowPlan,
  PartitionPlan,
  Rect,
  StairDir,
  StairPlan,
  WallSide,
} from './interior-types';

export type {
  BoxCall,
  BuildingBuildResult,
  BuildingInteriorPlan,
  InteriorCategory,
  InteriorDecorPlane,
  InteriorPropInfo,
  InteriorWindowPlan,
  PartitionPlan,
  Rect,
  StairDir,
  StairPlan,
  WallSide,
} from './interior-types';

const DOOR_WIDTH = 4;
const DOOR_HEIGHT = 3;
const WINDOW_WIDTH = 2;
const WINDOW_HEIGHT = 2;
const STAIR_RUN = 4;
const STAIR_WIDTH = 2;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const EPS = 1e-6;
const overlaps = (a: Rect, b: Rect) =>
  a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.z0 < b.z1 - EPS && a.z1 > b.z0 + EPS;

function mix(seed: number, salt: number): number {
  let h = Math.imul((seed | 0) ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Classify by stable id/name. The maps were authored with descriptive ids and
 * Chinese names, so this stays deterministic without adding a new map field.
 */
export function classifyInterior(b: Building): InteriorCategory {
  const text = `${b.id} ${b.name}`.toLowerCase();
  if (b.roof === 'open') return 'greenhouse';
  if (/manor|庄园/.test(text)) return 'manor';
  if (/church|chapel|cathedral|教堂/.test(text)) return 'church';
  if (/terminal|航站/.test(text)) return 'terminal';
  if (/control|塔台/.test(text)) return 'control';
  if (/greenhouse|温室|花房|育苗|flower-house/.test(text)) return 'greenhouse';
  if (/warehouse|仓库|hangar|机库|workshop|车间|garage|车库|depot|补给库|工具|机修|维修|农具|storehouse|barn|谷仓|stable|马厩|carriage|马车|pump|泵房|bunker|碉堡|油料|消防|草料|附楼|货运|cargo|货棚/.test(text)) return 'industrial';
  if (/office|办公|admin|行政|调度|安检|security|门房|门卫|gate|guard|toll|收费|看闸|雷达/.test(text)) return 'office';
  if (/shop|store|便利店|kiosk|加油站|fuel/.test(text)) return 'shop';
  if (/house|民居|农舍|farmhouse|cottage|barracks|兵营|守林|residence|hut|小屋|主屋|磨坊/.test(text)) return 'residence';
  return 'residence';
}

interface BuildingShellSpec {
  building: Building;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  base: number;
  height: number;
  wallMaterial: number;
  seed: number;
  /** Other building footprints, used to keep doors/windows off shared walls. */
  neighbors?: Rect[];
  /** Terrain height roughly 2 m outside each wall, for exterior entrance steps. */
  doorGround?: Partial<Record<WallSide, number>>;
  /** Authored cover footprints that may sit inside the room. */
  obstacles?: Rect[];
}

const wallSideHorizontal = (side: WallSide) => side === 'south' || side === 'north';

function windowSpans(
  length: number,
  floor: 0 | 1,
  blocked: Array<[number, number]>,
): Array<[number, number]> {
  const count = clamp(Math.floor((length - 4) / 7), 1, floor === 0 ? 4 : 3);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const c = (length * (i + 0.5)) / count;
    const a0 = c - WINDOW_WIDTH / 2;
    const a1 = c + WINDOW_WIDTH / 2;
    if (a0 < 1.5 || a1 > length - 1.5) continue;
    if (blocked.some(([b0, b1]) => a0 < b1 + 1 && a1 > b0 - 1)) continue;
    out.push([a0, a1]);
  }
  return out;
}

/** Choose a staircase that fits, respects the doors and uses the longer side. */
function planStair(
  rect: Rect,
  base: number,
  upperTop: number,
  doorSpan: [number, number] | null,
  seed: number,
): StairPlan | null {
  const W = rect.x1 - rect.x0;
  const D = rect.z1 - rect.z0;
  if (W < STAIR_RUN + 2 || D < STAIR_WIDTH + 2) return null;

  type Candidate = {
    dir: StairDir;
    stair: Rect;
    landing: Rect;
    opening: Rect;
  };
  const xCandidates: Candidate[] = [];
  const zCandidates: Candidate[] = [];
  const xRun = () => {
    for (const south of [true, false]) {
      for (const west of [true, false]) {
        const zs = south ? rect.z0 : rect.z1 - STAIR_WIDTH;
        const landX0 = west ? rect.x0 : rect.x1 - 1;
        const landX1 = landX0 + 1;
        const sx0 = west ? rect.x0 : rect.x1 - 1 - STAIR_RUN;
        const sx1 = west ? rect.x0 + 1 + STAIR_RUN : rect.x1;
        const ox0 = west ? rect.x0 + 1 : rect.x1 - 1 - STAIR_RUN;
        const ox1 = west ? rect.x0 + 1 + STAIR_RUN : rect.x1 - 1;
        xCandidates.push({
          dir: west ? '+x' : '-x',
          stair: { x0: sx0, z0: zs, x1: sx1, z1: zs + STAIR_WIDTH },
          landing: { x0: landX0, z0: zs, x1: landX1, z1: zs + STAIR_WIDTH },
          opening: { x0: ox0, z0: zs, x1: ox1, z1: zs + STAIR_WIDTH },
        });
      }
    }
  };
  const zRun = () => {
    for (const east of [true, false]) {
      for (const southEnd of [true, false]) {
        const xs = east ? rect.x1 - STAIR_WIDTH : rect.x0;
        const landZ0 = southEnd ? rect.z0 : rect.z1 - 1;
        const landZ1 = landZ0 + 1;
        const sz0 = southEnd ? rect.z0 : rect.z1 - 1 - STAIR_RUN;
        const sz1 = southEnd ? rect.z0 + 1 + STAIR_RUN : rect.z1;
        const oz0 = southEnd ? rect.z0 + 1 : rect.z1 - 1 - STAIR_RUN;
        const oz1 = southEnd ? rect.z0 + 1 + STAIR_RUN : rect.z1 - 1;
        zCandidates.push({
          dir: southEnd ? '+z' : '-z',
          stair: { x0: xs, z0: sz0, x1: xs + STAIR_WIDTH, z1: sz1 },
          landing: { x0: xs, z0: landZ0, x1: xs + STAIR_WIDTH, z1: landZ1 },
          opening: { x0: xs, z0: oz0, x1: xs + STAIR_WIDTH, z1: oz1 },
        });
      }
    }
  };
  xRun();
  zRun();
  const preferZ = D > W + 2;
  const order: Array<'x' | 'z'> = preferZ ? ['z', 'x'] : W >= 20 ? ['x', 'z'] : D >= 11 ? ['z', 'x'] : ['x', 'z'];
  for (const axis of order) {
    const group = axis === 'x' ? xCandidates : zCandidates;
    const rotation = mix(seed, axis === 'x' ? 41 : 43) % Math.max(1, group.length);
    const ordered = group.slice(rotation).concat(group.slice(0, rotation));
    for (const c of ordered) {
      if (
        c.stair.x0 < rect.x0 - EPS ||
        c.stair.z0 < rect.z0 - EPS ||
        c.stair.x1 > rect.x1 + EPS ||
        c.stair.z1 > rect.z1 + EPS
      )
        continue;
      // 1 m clearance from either centre door on the north/south walls.
      const xClear = !doorSpan || c.stair.x1 <= doorSpan[0] - 1 + EPS || c.stair.x0 >= doorSpan[1] + 1 - EPS;
      if (!xClear) continue;
      return {
        ...c.stair,
        dir: c.dir,
        bottom: base + 1,
        top: upperTop,
        landing: c.landing,
        opening: c.opening,
        steps: STAIR_RUN,
      };
    }
  }
  return null;
}

function planPartition(
  rect: Rect,
  base: number,
  stair: StairPlan | null,
  seed: number,
): PartitionPlan | null {
  const W = rect.x1 - rect.x0;
  const D = rect.z1 - rect.z0;
  if (W * D < 120 || Math.min(W, D) < 8) return null;
  const alongX = W >= D;
  const attempts = [0.6, 0.38, 0.72];
  for (const t of attempts) {
    if (alongX) {
      let px = Math.round(rect.x0 + W * t);
      px = clamp(px, rect.x0 + 1, rect.x1 - 2);
      if (stair && px + 1 > stair.x0 - 1.02 && px < stair.x1 + 1.02) continue;
      let dz = Math.round(rect.z0 + D * 0.5) - 1;
      dz = clamp(dz, rect.z0 + 1, rect.z1 - 3);
      if (stair && dz + 2 > stair.z0 - 1.02 && dz < stair.z1 + 1.02) dz = clamp(stair.z1 + 1, rect.z0 + 1, rect.z1 - 3);
      const door: Rect = { x0: px, z0: dz, x1: px + 1, z1: dz + 2 };
      return { x0: px, z0: rect.z0, x1: px + 1, z1: rect.z1, axis: 'x', door };
    }
    let pz = Math.round(rect.z0 + D * t);
    pz = clamp(pz, rect.z0 + 1, rect.z1 - 2);
    if (stair && pz + 1 > stair.z0 - 1.02 && pz < stair.z1 + 1.02) continue;
    let dx = Math.round(rect.x0 + W * 0.5) - 1;
    dx = clamp(dx, rect.x0 + 1, rect.x1 - 3);
    if (stair && dx + 2 > stair.x0 - 1.02 && dx < stair.x1 + 1.02) dx = clamp(stair.x1 + 1, rect.x0 + 1, rect.x1 - 3);
    const door: Rect = { x0: dx, z0: pz, x1: dx + 2, z1: pz + 1 };
    return { x0: rect.x0, z0: pz, x1: rect.x1, z1: pz + 1, axis: 'z', door };
  }
  return null;
}

/** Build the enterable shell/floors/stairs, then furnish it. */
export function buildBuildingInterior(spec: BuildingShellSpec): BuildingBuildResult {
  const { building: b, x0, z0, x1, z1, base, height: h, wallMaterial, seed } = spec;
  const category = classifyInterior(b);
  const ops: BoxCall[] = [];
  const op = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, id: number) =>
    ops.push({ x0, z0, x1, z1, y0, y1, id });
  const open = b.roof === 'open';
  const lined = !open && category !== 'greenhouse' && (x1 - x0 - 4) * (z1 - z0 - 4) >= 36;
  const inset = lined ? 2 : 1;
  const interior: Rect = { x0: x0 + inset, z0: z0 + inset, x1: x1 - inset, z1: z1 - inset };
  const foreign: Rect[] = [];
  const obstacles: Rect[] = [];
  for (const n of spec.neighbors ?? []) {
    const r = { x0: Math.max(interior.x0, n.x0), z0: Math.max(interior.z0, n.z0), x1: Math.min(interior.x1, n.x1), z1: Math.min(interior.z1, n.z1) };
    if (r.x1 > r.x0 + 0.01 && r.z1 > r.z0 + 0.01) foreign.push(r);
  }
  for (const o of spec.obstacles ?? []) {
    const r = { x0: Math.max(interior.x0, o.x0), z0: Math.max(interior.z0, o.z0), x1: Math.min(interior.x1, o.x1), z1: Math.min(interior.z1, o.z1) };
    if (r.x1 > r.x0 + 0.01 && r.z1 > r.z0 + 0.01) obstacles.push(r);
  }
  const floors: 1 | 2 = !open && h >= 8 ? 2 : 1;
  const floorTop = base + 1;
  const upperFloorTop = floors === 2 ? base + 5 : null;
  const floorMaterial =
    category === 'residence' || category === 'manor' || category === 'church' ? BLOCK.INTERIOR_WOOD_FLOOR : BLOCK.INTERIOR_CONCRETE_FLOOR;

  const doors: BuildingInteriorPlan['doors'] = [];
  const windows: InteriorWindowPlan[] = [];
  let stair: StairPlan | null = null;
  const partitions: PartitionPlan[] = [];

  if (open) {
    // Open sheds keep the voxel generator's existing columns/back wall. Their
    // interior is one floor with a concrete slab and edge planters.
  } else {
    const depth = lined ? 2 : 1;
    const doorY0 = base + 1;
    const doorY1 = base + 1 + DOOR_HEIGHT;
    const neighbors = spec.neighbors ?? [];
    const doorGround = spec.doorGround ?? {};
    const horizontal = (side: WallSide) => side === 'south' || side === 'north';
    // Exterior band outside a wall; any other footprint there means a shared wall.
    const bandRect = (side: WallSide, a0: number, a1: number, reach = 2.5): Rect =>
      side === 'south'
        ? { x0: a0, x1: a1, z0: z0 - reach, z1: z0 }
        : side === 'north'
          ? { x0: a0, x1: a1, z0: z1, z1: z1 + reach }
          : side === 'west'
            ? { x0: x0 - reach, x1: x0, z0: a0, z1: a1 }
            : { x0: x1, x1: x1 + reach, z0: a0, z1: a1 };
    const hasNeighbour = (side: WallSide, a0: number, a1: number, reach = 2.5) => {
      const band = bandRect(side, a0, a1, reach);
      return neighbors.some((n) => n.x0 < band.x1 - EPS && n.x1 > band.x0 + EPS && n.z0 < band.z1 - EPS && n.z1 > band.z0 + EPS);
    };

    // 1. Plinth-top finish inside the walls (the slab itself is laid by the caller).
    op(interior.x0, interior.z0, interior.x1, interior.z1, base, base + 1, floorMaterial);

    // 2. Exterior wall shell (1 m) plus interior plaster lining (1 m).
    op(x0, z0, x1, z0 + 1, base + 1, base + h, wallMaterial);
    op(x0, z1 - 1, x1, z1, base + 1, base + h, wallMaterial);
    op(x0, z0 + 1, x0 + 1, z1 - 1, base + 1, base + h, wallMaterial);
    op(x1 - 1, z0 + 1, x1, z1 - 1, base + 1, base + h, wallMaterial);
    if (lined) {
      op(x0 + 1, z0 + 1, x1 - 1, z0 + 2, base + 1, base + h, BLOCK.INTERIOR_PLASTER);
      op(x0 + 1, z1 - 2, x1 - 1, z1 - 1, base + 1, base + h, BLOCK.INTERIOR_PLASTER);
      op(x0 + 1, z0 + 2, x0 + 2, z1 - 2, base + 1, base + h, BLOCK.INTERIOR_PLASTER);
      op(x1 - 2, z0 + 2, x1 - 1, z1 - 2, base + 1, base + h, BLOCK.INTERIOR_PLASTER);
    }

    // 3. Centred north/south doorways; where both centre walls are attached to
    // another footprint, an exterior side entrance keeps the building usable.
    let dx0 = Math.round((x0 + x1) / 2 - DOOR_WIDTH / 2);
    dx0 = clamp(dx0, x0 + 2, x1 - 2 - DOOR_WIDTH);
    const dx1 = dx0 + DOOR_WIDTH;
    const mainSides: Array<'south' | 'north'> = [];
    if (!hasNeighbour('south', dx0, dx1)) mainSides.push('south');
    if (!hasNeighbour('north', dx0, dx1)) mainSides.push('north');
    const seedSalt = seed & 0xffff;
    const stairDoorSpan: [number, number] | null = mainSides.length ? [dx0 - x0, dx1 - x0] : null;

    // 4. Second floor slab before the stairwell is cut out.
    if (floors === 2) op(interior.x0, interior.z0, interior.x1, interior.z1, base + 4, base + 5, floorMaterial);
    stair = floors === 2 ? planStair(interior, base, base + 5, stairDoorSpan, seedSalt) : null;

    for (const side of mainSides) {
      doors.push({
        side,
        a0: dx0,
        a1: dx1,
        cx: (dx0 + dx1) / 2,
        cz: side === 'south' ? z0 + 0.5 : z1 - 0.5,
        y0: doorY0,
        y1: doorY1,
      });
    }
    if (!doors.length) {
      const sides: WallSide[] = (seed >>> 3) & 1 ? ['west', 'east'] : ['east', 'west'];
      for (const side of sides) {
        const length = interior.z1 - interior.z0;
        const width = Math.min(3, length - 2);
        if (width < 2) continue;
        let a0 = Math.round((interior.z0 + interior.z1) / 2 - width / 2);
        a0 = clamp(a0, interior.z0 + 1, interior.z1 - 1 - width);
        const a1 = a0 + width;
        if (hasNeighbour(side, a0, a1)) continue;
        if (stair && (stair.dir === '+z' || stair.dir === '-z')) {
          const stairSide = stair.x0 <= interior.x0 + 0.01 ? 'west' : 'east';
          if (side === stairSide) continue;
        }
        doors.push({
          side,
          a0,
          a1,
          cx: side === 'west' ? x0 + 0.5 : x1 - 0.5,
          cz: (a0 + a1) / 2,
          y0: doorY0,
          y1: doorY1,
        });
        break;
      }
    }
    const carveDoor = (d: BuildingInteriorPlan['doors'][number]) => {
      if (d.side === 'south') op(d.a0, z0, d.a1, z0 + depth, d.y0, d.y1, BLOCK.AIR);
      else if (d.side === 'north') op(d.a0, z1 - depth, d.a1, z1, d.y0, d.y1, BLOCK.AIR);
      else if (d.side === 'west') op(x0, d.a0, x0 + depth, d.a1, d.y0, d.y1, BLOCK.AIR);
      else op(x1 - depth, d.a0, x1, d.a1, d.y0, d.y1, BLOCK.AIR);
    };
    for (const d of doors) carveDoor(d);

    // 5. Exterior entrance steps (1 m risers, 1 m treads) so a door remains
    // walkable when the terrain just outside the plinth is lower. The approach
    // volume is carved first, which also removes terrain lips and tree trunks.
    const stepMaterial =
      category === 'residence' || category === 'manor' || category === 'church' ? BLOCK.STONE : BLOCK.CONCRETE;
    for (const d of doors) {
      const ground = doorGround[d.side] ?? base - 1;
      const steps = clamp(base - Math.round(ground), 0, 6);
      const approachDepth = Math.max(1, steps);
      const w0 = d.a0 - 0.75;
      const w1 = d.a1 + 0.75;
      // Always clear the approach above the entrance level: this removes terrain
      // lips (and tree trunks) that would otherwise catch the player capsule.
      if (d.side === 'south') op(w0, z0 - approachDepth, w1, z0, base - steps, base + 4, BLOCK.AIR);
      else if (d.side === 'north') op(w0, z1, w1, z1 + approachDepth, base - steps, base + 4, BLOCK.AIR);
      else if (d.side === 'west') op(x0 - approachDepth, w0, x0, w1, base - steps, base + 4, BLOCK.AIR);
      else op(x1, w0, x1 + approachDepth, w1, base - steps, base + 4, BLOCK.AIR);
      for (let k = 1; k <= steps; k++) {
        const top = base + 1 - k;
        if (d.side === 'south') op(w0, z0 - k, w1, z0 - (k - 1), top - 1, top, stepMaterial);
        else if (d.side === 'north') op(w0, z1 + (k - 1), w1, z1 + k, top - 1, top, stepMaterial);
        else if (d.side === 'west') op(x0 - k, w0, x0 - (k - 1), w1, top - 1, top, stepMaterial);
        else op(x1 + (k - 1), w0, x1 + k, w1, top - 1, top, stepMaterial);
      }
    }

    // 6. Windows on all four walls, ground and (if present) upper storey.
    const doorSpans: Record<WallSide, Array<[number, number]>> = { south: [], north: [], west: [], east: [] };
    for (const d of doors) doorSpans[d.side].push([d.a0, d.a1]);
    const wallSpecs: Array<{ side: WallSide; length: number; axisStart: number }> = [
      { side: 'south', length: x1 - x0, axisStart: x0 },
      { side: 'north', length: x1 - x0, axisStart: x0 },
      { side: 'west', length: z1 - z0, axisStart: z0 },
      { side: 'east', length: z1 - z0, axisStart: z0 },
    ];
    for (const wall of wallSpecs) {
      const stairSpan: Array<[number, number]> = [];
      if (stair) {
        if (wallSideHorizontal(wall.side)) stairSpan.push([stair.x0 - x0, stair.x1 - x0]);
        else stairSpan.push([stair.z0 - z0, stair.z1 - z0]);
      }
      const blockedGround = [...doorSpans[wall.side].map(([a, b]) => [a - wall.axisStart, b - wall.axisStart] as [number, number]), ...stairSpan];
      for (const floor of floors === 2 ? ([0, 1] as const) : ([0] as const)) {
        const spans = windowSpans(wall.length, floor, floor === 0 ? blockedGround : stairSpan);
        const y0 = floor === 0 ? base + 2 : base + 6;
        const y1 = floor === 0 ? base + 4 : base + 8;
        for (const [a0, a1] of spans) {
          const absA0 = wall.axisStart + a0;
          const absA1 = wall.axisStart + a1;
          // Do not punch a window straight into an attached building.
          if (hasNeighbour(wall.side, absA0, absA1, 1.5)) continue;
          windows.push({ side: wall.side, floor, a0: absA0, a1: absA1, y0, y1 });
          if (wall.side === 'south') op(absA0, z0, absA1, z0 + depth, y0, y1, BLOCK.AIR);
          else if (wall.side === 'north') op(absA0, z1 - depth, absA1, z1, y0, y1, BLOCK.AIR);
          else if (wall.side === 'west') op(x0, absA0, x0 + depth, absA1, y0, y1, BLOCK.AIR);
          else op(x1 - depth, absA0, x1, absA1, y0, y1, BLOCK.AIR);
        }
      }
    }

    // 7. Cut the upper slab over the steps, then build the 1 m-rise staircase.
    if (stair) {
      const o = stair.opening;
      op(o.x0, o.z0, o.x1, o.z1, base + 4, base + 5, BLOCK.AIR);
      const stairMaterial =
        category === 'residence' || category === 'manor' || category === 'church' ? BLOCK.INTERIOR_WOOD_FLOOR : BLOCK.INTERIOR_CONCRETE_FLOOR;
      for (let k = 1; k <= STAIR_RUN; k++) {
        const top = base + 1 + k;
        if (stair.dir === '+x') {
          const sx = stair.landing.x1 + (k - 1);
          op(sx, stair.z0, sx + 1, stair.z1, base + 1, top, stairMaterial);
        } else if (stair.dir === '-x') {
          const sx = stair.landing.x0 - k;
          op(sx, stair.z0, sx + 1, stair.z1, base + 1, top, stairMaterial);
        } else if (stair.dir === '+z') {
          const sz = stair.landing.z1 + (k - 1);
          op(stair.x0, sz, stair.x1, sz + 1, base + 1, top, stairMaterial);
        } else {
          const sz = stair.landing.z0 - k;
          op(stair.x0, sz, stair.x1, sz + 1, base + 1, top, stairMaterial);
        }
      }
    }

    // 8. Ground-floor partition with a 2 m doorway when the room is large.
    const partition = planPartition(interior, base, stair, seedSalt);
    if (partition) {
      op(partition.x0, partition.z0, partition.x1, partition.z1, base + 1, base + 4, BLOCK.INTERIOR_PLASTER);
      op(partition.door.x0, partition.door.z0, partition.door.x1, partition.door.z1, base + 1, base + 4, BLOCK.AIR);
      partitions.push(partition);
    }

    // 9. A plaster ceiling caps very tall shells, keeping 3 m/4 m clear heights.
    if (floors === 2 && h >= 10) op(interior.x0, interior.z0, interior.x1, interior.z1, base + 9, base + 10, BLOCK.INTERIOR_PLASTER);
  }

  const doorClear: Rect[] = doors.map((d) => {
    if (d.side === 'south') return { x0: d.a0 - 0.3, z0: z0 - 3.5, x1: d.a1 + 0.3, z1: z0 + 4 };
    if (d.side === 'north') return { x0: d.a0 - 0.3, z0: z1 - 4, x1: d.a1 + 0.3, z1: z1 + 3.5 };
    if (d.side === 'west') return { x0: x0 - 3.5, z0: d.a0 - 0.3, x1: x0 + 4, z1: d.a1 + 0.3 };
    return { x0: x1 - 4, z0: d.a0 - 0.3, x1: x1 + 3.5, z1: d.a1 + 0.3 };
  });

  const plan: BuildingInteriorPlan = {
    id: b.id,
    name: b.name,
    category,
    x0,
    z0,
    x1,
    z1,
    base,
    height: h,
    floors,
    floorTop,
    upperFloorTop,
    interior,
    foreign,
    obstacles,
    doors,
    windows,
    doorClear,
    stair,
    partitions,
    propCounts: [0, 0],
    decorCount: 0,
  };
  const furnished = furnishBuilding(plan);

  // Plaster ceiling lining keeps the rooms readable instead of exposing the
  // dark roof underside. It is a non-walkable half-metre detail layer; above
  // the stairwell it is cut away so the 1 m steps keep their headroom.
  const ceilingDetails: BuildingBuildResult['details'] = [];
  if (!open && category !== 'greenhouse') {
    const grow = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m });
    const piecesAround = (outer: Rect, hole: Rect | null): Rect[] => {
      if (!hole) return [outer];
      const h = {
        x0: Math.max(outer.x0, hole.x0),
        z0: Math.max(outer.z0, hole.z0),
        x1: Math.min(outer.x1, hole.x1),
        z1: Math.min(outer.z1, hole.z1),
      };
      if (h.x1 <= h.x0 + EPS || h.z1 <= h.z0 + EPS) return [outer];
      const pieces: Rect[] = [];
      if (h.x0 > outer.x0 + EPS) pieces.push({ x0: outer.x0, z0: outer.z0, x1: h.x0, z1: outer.z1 });
      if (h.x1 < outer.x1 - EPS) pieces.push({ x0: h.x1, z0: outer.z0, x1: outer.x1, z1: outer.z1 });
      if (h.z0 > outer.z0 + EPS) pieces.push({ x0: h.x0, z0: outer.z0, x1: h.x1, z1: h.z0 });
      if (h.z1 < outer.z1 - EPS) pieces.push({ x0: h.x0, z0: h.z1, x1: h.x1, z1: outer.z1 });
      return pieces;
    };
    const addCeiling = (floor: 0 | 1, topY: number) => {
      const hole = floor === 0 && stair ? grow(stair.opening, 1.5) : null;
      for (const [index, r] of piecesAround(interior, hole).entries()) {
        ceilingDetails.push({
          id: `${b.id}:f${floor}:ceiling:${index}`,
          x: (r.x0 + r.x1) / 2,
          z: (r.z0 + r.z1) / 2,
          w: r.x1 - r.x0,
          d: r.z1 - r.z0,
          bottom: topY - 0.5,
          top: topY,
          material: BLOCK.INTERIOR_PLASTER,
        });
      }
    };
    if (floors === 2) {
      addCeiling(0, base + 4);
      addCeiling(1, h >= 10 ? base + 9 : base + h);
    } else {
      addCeiling(0, base + h);
    }
  }

  plan.propCounts = [
    furnished.props.filter((p) => p.floor === 0).length,
    furnished.props.filter((p) => p.floor === 1).length,
  ];
  plan.decorCount = furnished.decor.length;
  return { ops, details: [...furnished.details, ...ceilingDetails], decor: furnished.decor, props: furnished.props, plan };
}
