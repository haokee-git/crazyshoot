import { BLOCK } from './voxel-blocks';
import type {
  BuildingInteriorPlan,
  DetailCall,
  InteriorCategory,
  InteriorDecorPlane,
  InteriorPropInfo,
  Rect,
  WallSide,
} from './interior-types';

/* ------------------------------------------------------------------ */
/* Materials and small deterministic helpers                           */
/* ------------------------------------------------------------------ */

const WOOD = BLOCK.INTERIOR_WOOD_FLOOR; // desaturated interior timber
const WOOD_DARK = 7; // timber_weathered
const CRATE = 62; // crate_military
const METAL = 55; // container_grey
const METAL_DARK = 10; // metal_galvanized
const CLOTH = 18; // plaster_stained, reads as worn off-white fabric
const STONE = 27; // limestone
const LEAF = 9; // foliage_olive
const FLOOR_WOOD = BLOCK.INTERIOR_WOOD_FLOOR;
const FLOOR_CONCRETE = BLOCK.INTERIOR_CONCRETE_FLOOR;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Stable integer hash for a building/floor salt. */
function mix(seed: number, salt: number): number {
  let h = Math.imul((seed | 0) ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
const rand = (seed: number, salt: number) => mix(seed, salt) / 4294967296;

const EPS = 1e-6;
const overlaps = (a: Rect, b: Rect) =>
  a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.z0 < b.z1 - EPS && a.z1 > b.z0 + EPS;
const inside = (r: Rect, box: Rect) =>
  r.x0 >= box.x0 - EPS && r.x1 <= box.x1 + EPS && r.z0 >= box.z0 - EPS && r.z1 <= box.z1 + EPS;
const expand = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m });
const areaOf = (r: Rect) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);

/* ------------------------------------------------------------------ */
/* Furniture vocabulary                                                */
/* ------------------------------------------------------------------ */

interface Part {
  ox: number;
  oz: number;
  w: number;
  d: number;
  y: number;
  h: number;
  material: number;
}

interface ItemSpec {
  kind: string;
  w: number;
  d: number;
  h: number;
  material: number;
  tall: boolean;
  parts: Part[];
}

const part = (w: number, d: number, y: number, h: number, material: number, ox = 0, oz = 0): Part => ({
  ox,
  oz,
  w,
  d,
  y,
  h,
  material,
});

function item(
  kind: string,
  w: number,
  d: number,
  h: number,
  material: number,
  parts?: Part[],
  tall = false,
): ItemSpec {
  return { kind, w, d, h, material, tall, parts: parts?.length ? parts : [part(w, d, 0, h, material)] };
}

const ITEMS = {
  // Every part is snapped to the half-metre detail grid: the renderer only
  // builds detail cells that contain a half-grid sample, so thinner parts
  // would collide but stay invisible.
  bed: item('bed', 2, 1, 0.5, CLOTH, [part(2, 1, 0, 0.5, CLOTH), part(0.5, 0.5, 0, 0.5, CLOTH, 0.75, 0)]),
  table: item('table', 1.5, 1, 1, WOOD, [
    part(0.5, 0.5, 0, 0.5, WOOD_DARK),
    part(1.5, 1, 0.5, 0.5, WOOD),
  ]),
  stool: item('stool', 0.5, 0.5, 0.5, WOOD_DARK),
  cabinet: item('cabinet', 1, 0.5, 1, WOOD),
  desk: item('desk', 2, 1, 1, WOOD, [
    part(0.5, 1, 0, 0.5, METAL_DARK, -0.75),
    part(0.5, 1, 0, 0.5, METAL_DARK, 0.75),
    part(2, 1, 0.5, 0.5, WOOD),
  ]),
  file: item('file-cabinet', 0.5, 0.5, 1, METAL),
  crate: item('crate', 1, 1, 1, CRATE),
  crateLarge: item('crate-large', 1.5, 1, 1.5, CRATE),
  crateSmall: item('crate-small', 0.5, 0.5, 0.5, CRATE),
  pallet: item('pallet', 1.5, 1, 0.5, WOOD_DARK),
  workbench: item('workbench', 2, 1, 1, WOOD, [
    part(0.5, 1, 0, 0.5, METAL_DARK, -0.75),
    part(0.5, 1, 0, 0.5, METAL_DARK, 0.75),
    part(2, 1, 0.5, 0.5, WOOD),
  ]),
  barrel: item('barrel', 0.5, 0.5, 1, WOOD_DARK),
  counter: item('counter', 2, 0.5, 1, WOOD),
  counterShort: item('counter-short', 1.5, 0.5, 1, WOOD),
  shelf: item('shelf', 1.5, 0.5, 2, WOOD, undefined, true),
  carton: item('carton', 0.5, 0.5, 0.5, CRATE),
  bench: item('bench', 2.5, 1, 1, WOOD, [
    part(2.5, 0.5, 0, 0.5, WOOD, 0, 0.25),
    part(2.5, 0.5, 0.5, 0.5, WOOD, 0, -0.25),
  ]),
  altar: item('altar', 2, 1, 1, STONE),
  seatRow: item('seat-row', 2.5, 1, 1, METAL, [
    part(2.5, 1, 0, 0.5, METAL_DARK),
    part(2.5, 0.5, 0.5, 0.5, METAL, 0, -0.25),
    part(0.5, 0.5, 0.5, 0.5, CLOTH, -1, 0.25),
    part(0.5, 0.5, 0.5, 0.5, CLOTH, 0, 0.25),
    part(0.5, 0.5, 0.5, 0.5, CLOTH, 1, 0.25),
  ]),
  luggage: item('luggage', 1, 0.5, 0.5, METAL_DARK),
  trough: item('planting-trough', 2, 0.5, 1, WOOD, [
    part(2, 0.5, 0, 0.5, WOOD),
    part(2, 0.5, 0.5, 0.5, LEAF),
  ]),
  pot: item('flower-pot', 0.5, 0.5, 0.5, STONE),
  seedTable: item('seedling-table', 1.5, 1, 1, WOOD),
  console: item('console', 2.5, 0.5, 1, METAL),
  consoleShort: item('console-short', 1.5, 0.5, 1, METAL),
} satisfies Record<string, ItemSpec>;

/* ------------------------------------------------------------------ */
/* Layout context                                                      */
/* ------------------------------------------------------------------ */

interface FloorLayout {
  plan: BuildingInteriorPlan;
  floor: 0 | 1;
  floorTop: number;
  rect: Rect;
  reserved: Rect[];
  windows: Record<WallSide, Array<{ a0: number; a1: number }>>;
  details: DetailCall[];
  decor: InteriorDecorPlane[];
  props: InteriorPropInfo[];
  placed: Rect[];
  seed: number;
}

const SIDES: WallSide[] = ['south', 'east', 'north', 'west'];
const HORIZONTAL: Record<WallSide, boolean> = { south: true, north: true, west: false, east: false };

function sideOrder(layout: FloorLayout, salt: number): WallSide[] {
  const shift = mix(layout.seed ^ (layout.floor * 7919), salt) % SIDES.length;
  return SIDES.slice(shift).concat(SIDES.slice(0, shift));
}

/** Wall-projected span used to keep tall furniture away from windows. */
function wallSpan(side: WallSide, r: Rect): [number, number] {
  return HORIZONTAL[side] ? [r.x0, r.x1] : [r.z0, r.z1];
}

function tallBlocksWindow(layout: FloorLayout, side: WallSide, r: Rect): boolean {
  const [a0, a1] = wallSpan(side, r);
  return layout.windows[side].some((w) => a0 < w.a1 + 0.25 && a1 > w.a0 - 0.25);
}

function fits(layout: FloorLayout, r: Rect, tall: boolean, side?: WallSide): boolean {
  if (!inside(r, layout.rect)) return false;
  if (layout.reserved.some((zone) => overlaps(r, zone))) return false;
  if (layout.placed.some((other) => overlaps(r, expand(other, 0.2)))) return false;
  if (tall && side && tallBlocksWindow(layout, side, r)) return false;
  return true;
}

function addDetail(layout: FloorLayout, kind: string, x: number, z: number, w: number, d: number, bottom: number, top: number, material: number) {
  layout.details.push({
    id: `${layout.plan.id}:f${layout.floor}:${kind}:${layout.details.length}`,
    x,
    z,
    w,
    d,
    bottom,
    top,
    material,
  });
}

function addProp(layout: FloorLayout, spec: ItemSpec, r: Rect) {
  layout.props.push({
    id: `${layout.plan.id}:f${layout.floor}:${spec.kind}:${layout.props.length}`,
    buildingId: layout.plan.id,
    floor: layout.floor,
    kind: spec.kind,
    x: (r.x0 + r.x1) / 2,
    z: (r.z0 + r.z1) / 2,
    w: r.x1 - r.x0,
    d: r.z1 - r.z0,
    bottom: layout.floorTop,
    top: layout.floorTop + spec.h,
    material: spec.material,
  });
}

function emitParts(
  layout: FloorLayout,
  spec: ItemSpec,
  cx: number,
  cz: number,
  side: WallSide | null,
) {
  for (const p of spec.parts) {
    let x = cx;
    let z = cz;
    let w = p.w;
    let d = p.d;
    if (side) {
      if (HORIZONTAL[side]) {
        x = cx + p.ox;
        z = cz + p.oz * (side === 'south' ? 1 : -1);
      } else {
        x = cx + p.oz * (side === 'west' ? 1 : -1);
        z = cz + p.ox;
        w = p.d;
        d = p.w;
      }
    } else {
      x = cx + p.ox;
      z = cz + p.oz;
    }
    addDetail(layout, spec.kind, x, z, w, d, layout.floorTop + p.y, layout.floorTop + p.y + p.h, p.material);
  }
}

/** Place an item flush against one of the four interior walls. */
function placeWallItem(layout: FloorLayout, spec: ItemSpec, order?: WallSide[]): boolean {
  const attemptSides = order ?? sideOrder(layout, layout.placed.length + layout.props.length);
  for (const side of attemptSides) {
    const rect = layout.rect;
    const wallLen = HORIZONTAL[side] ? rect.x1 - rect.x0 : rect.z1 - rect.z0;
    const along = HORIZONTAL[side] ? spec.w : spec.d;
    const depth = HORIZONTAL[side] ? spec.d : spec.w;
    if (along > wallLen - 0.5 || depth > (HORIZONTAL[side] ? rect.z1 - rect.z0 : rect.x1 - rect.x0) - 0.5) continue;
    const base = HORIZONTAL[side] ? rect.x0 : rect.z0;
    const first = base + 0.5;
    const last = base + wallLen - 0.5 - along;
    if (last < first - EPS) continue;
    const positions: number[] = [];
    for (let a = first; a <= last + EPS; a += 0.5) positions.push(a);
    if (positions.length > 1) {
      const shift = mix(layout.seed, layout.floor * 131 + SIDES.indexOf(side) * 17 + layout.placed.length) % positions.length;
      positions.push(...positions.splice(0, shift));
    }
    for (const a of positions) {
      const r: Rect =
        side === 'south'
          ? { x0: a, z0: rect.z0, x1: a + along, z1: rect.z0 + depth }
          : side === 'north'
            ? { x0: a, z0: rect.z1 - depth, x1: a + along, z1: rect.z1 }
            : side === 'west'
              ? { x0: rect.x0, z0: a, x1: rect.x0 + depth, z1: a + along }
              : { x0: rect.x1 - depth, z0: a, x1: rect.x1, z1: a + along };
      if (!fits(layout, r, spec.tall, side)) continue;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      layout.placed.push(r);
      addProp(layout, spec, r);
      emitParts(layout, spec, cx, cz, side);
      return true;
    }
  }
  return false;
}

/** Place an item at a free-standing position (axis aligned). */
function placeAt(layout: FloorLayout, spec: ItemSpec, cx: number, cz: number): boolean {
  cx = Math.round(cx * 2) / 2;
  cz = Math.round(cz * 2) / 2;
  const r: Rect = { x0: cx - spec.w / 2, z0: cz - spec.d / 2, x1: cx + spec.w / 2, z1: cz + spec.d / 2 };
  if (!fits(layout, r, spec.tall)) return false;
  layout.placed.push(r);
  addProp(layout, spec, r);
  emitParts(layout, spec, cx, cz, null);
  return true;
}

/* ------------------------------------------------------------------ */
/* Reserved areas: doors, main route, stairs, partitions               */
/* ------------------------------------------------------------------ */

function reservedCommon(plan: BuildingInteriorPlan, floor: 0 | 1): Rect[] {
  const rect = plan.interior;
  const out: Rect[] = [];
  const door = plan.doors.find((d) => d.side === 'south' || d.side === 'north') ?? plan.doors[0];
  const interiorArea = (rect.x1 - rect.x0) * (rect.z1 - rect.z0);
  const narrow = interiorArea < 45;
  if (floor === 0 && door) {
    const width =
      plan.category === 'church'
        ? 2.6
        : Math.min(5.5, Math.max(2, (rect.x1 - rect.x0) * (narrow ? 0.4 : 0.46)));
    if (door.side === 'south' || door.side === 'north') {
      out.push({ x0: door.cx - width / 2, z0: rect.z0, x1: door.cx + width / 2, z1: rect.z1 });
    } else {
      const height = Math.min(5.5, Math.max(2, (rect.z1 - rect.z0) * 0.46));
      out.push({ x0: rect.x0, z0: door.cz - height / 2, x1: rect.x1, z1: door.cz + height / 2 });
    }
    const vestibule = narrow ? 1.5 : 3;
    for (const d of plan.doors) {
      if (d.side === 'south' || d.side === 'north') {
        out.push({
          x0: d.a0 - 1,
          z0: d.side === 'south' ? rect.z0 : rect.z1 - vestibule,
          x1: d.a1 + 1,
          z1: d.side === 'south' ? rect.z0 + vestibule : rect.z1,
        });
      } else {
        out.push({
          x0: d.side === 'west' ? rect.x0 : rect.x1 - vestibule,
          z0: d.a0 - 1,
          x1: d.side === 'west' ? rect.x0 + vestibule : rect.x1,
          z1: d.a1 + 1,
        });
      }
    }
  }
  const stair = plan.stair;
  if (stair) {
    if (floor === 0) {
      out.push(expand({ x0: stair.x0, z0: stair.z0, x1: stair.x1, z1: stair.z1 }, 1));
      out.push(expand(stair.landing, 1));
      const openSouth = stair.z0 <= rect.z0 + 0.01;
      const openNorth = stair.z1 >= rect.z1 - 0.01;
      const openWest = stair.x0 <= rect.x0 + 0.01;
      const openEast = stair.x1 >= rect.x1 - 0.01;
      if (openSouth) out.push({ x0: stair.x0 - 1, z0: stair.z1, x1: stair.x1 + 1, z1: Math.min(rect.z1, stair.z1 + 3) });
      else if (openNorth) out.push({ x0: stair.x0 - 1, z0: Math.max(rect.z0, stair.z0 - 3), x1: stair.x1 + 1, z1: stair.z0 });
      else if (openWest) out.push({ x0: stair.x1, z0: stair.z0 - 1, x1: Math.min(rect.x1, stair.x1 + 3), z1: stair.z1 + 1 });
      else if (openEast) out.push({ x0: Math.max(rect.x0, stair.x0 - 3), z0: stair.z0 - 1, x1: stair.x0, z1: stair.z1 + 1 });
    } else {
      out.push(expand(stair.opening, 1));
      // Keep the exit strip off the top step clear.
      const strip = 3;
      if (stair.dir === '+x') out.push({ x0: stair.opening.x1, z0: stair.opening.z0 - 1, x1: Math.min(rect.x1, stair.opening.x1 + strip), z1: stair.opening.z1 + 1 });
      else if (stair.dir === '-x') out.push({ x0: Math.max(rect.x0, stair.opening.x0 - strip), z0: stair.opening.z0 - 1, x1: stair.opening.x0, z1: stair.opening.z1 + 1 });
      else if (stair.dir === '+z') out.push({ x0: stair.opening.x0 - 1, z0: stair.opening.z1, x1: stair.opening.x1 + 1, z1: Math.min(rect.z1, stair.opening.z1 + strip) });
      else out.push({ x0: stair.opening.x0 - 1, z0: Math.max(rect.z0, stair.opening.z0 - strip), x1: stair.opening.x1 + 1, z1: stair.opening.z0 });
    }
  }
  if (floor === 0) {
    for (const r of plan.foreign) out.push(expand(r, 1));
    for (const r of plan.obstacles) out.push(expand(r, 0.5));
    for (const p of plan.partitions) {
      out.push(expand(p, 1));
      out.push(expand(p.door, 1));
    }
  }
  return out;
}

function windowMap(plan: BuildingInteriorPlan, floor: 0 | 1): Record<WallSide, Array<{ a0: number; a1: number }>> {
  const map: Record<WallSide, Array<{ a0: number; a1: number }>> = { south: [], north: [], west: [], east: [] };
  for (const w of plan.windows) if (w.floor === floor) map[w.side].push({ a0: w.a0, a1: w.a1 });
  return map;
}

function makeLayout(plan: BuildingInteriorPlan, floor: 0 | 1): FloorLayout {
  return {
    plan,
    floor,
    floorTop: floor === 0 ? plan.floorTop : (plan.upperFloorTop ?? plan.floorTop),
    rect: plan.interior,
    reserved: reservedCommon(plan, floor),
    windows: windowMap(plan, floor),
    details: [],
    decor: [],
    props: [],
    placed: [],
    seed: mix(plan.id.length * 2654435761 + plan.x0 * 73856093 + plan.z0 * 19349663 + floor * 83492791, 17),
  };
}

/* ------------------------------------------------------------------ */
/* Decorative planes (never collide)                                   */
/* ------------------------------------------------------------------ */

function freeGaps(length: number, blocked: Array<{ a0: number; a1: number }>, start: number): Array<[number, number]> {
  const spans = blocked
    .map((b) => [b.a0 - start, b.a1 - start] as [number, number])
    .map(([a, b]) => [Math.max(0, a), Math.min(length, b)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const gaps: Array<[number, number]> = [];
  let at = 0.5;
  for (const [a, b] of spans) {
    if (a > at + 0.5) gaps.push([at, a]);
    at = Math.max(at, b);
  }
  if (length - 0.5 > at + 0.5) gaps.push([at, length - 0.5]);
  return gaps;
}

function addWallArt(layout: FloorLayout, kind: 'art' | 'map' | 'sign'): boolean {
  const dims =
    kind === 'art' ? { w: 1.35, h: 0.85, y: 1.62 } : kind === 'map' ? { w: 1.7, h: 1.05, y: 1.65 } : { w: 1.25, h: 0.85, y: 2.02 };
  const rect = layout.rect;
  const order = sideOrder(layout, 97 + (kind === 'art' ? 0 : kind === 'map' ? 1 : 2) + layout.decor.length * 7);
  for (const side of order) {
    const length = HORIZONTAL[side] ? rect.x1 - rect.x0 : rect.z1 - rect.z0;
    if (length < dims.w + 1.2) continue;
    const blocked = [...layout.windows[side]];
    if (layout.floor === 0) {
      for (const d of layout.plan.doors) if (d.side === side) blocked.push({ a0: d.a0, a1: d.a1 });
    }
    const gaps = freeGaps(length, blocked, HORIZONTAL[side] ? rect.x0 : rect.z0).filter(([a, b]) => b - a >= dims.w + 0.6);
    if (!gaps.length) continue;
    const gap = gaps[mix(layout.seed, layout.floor * 7 + SIDES.indexOf(side) + (kind === 'art' ? 3 : kind === 'map' ? 5 : 7) + layout.decor.length * 31) % gaps.length];
    const along = gap[0] + (gap[1] - gap[0]) / 2;
    const y = layout.floorTop + dims.y;
    const offset = 0.03;
    const plane =
      side === 'south'
        ? { kind, x: rect.x0 + along, y, z: rect.z0 + offset, w: dims.w, h: dims.h, yaw: 0 }
        : side === 'north'
          ? { kind, x: rect.x0 + along, y, z: rect.z1 - offset, w: dims.w, h: dims.h, yaw: Math.PI }
          : side === 'west'
            ? { kind, x: rect.x0 + offset, y, z: rect.z0 + along, w: dims.w, h: dims.h, yaw: Math.PI / 2 }
            : { kind, x: rect.x1 - offset, y, z: rect.z0 + along, w: dims.w, h: dims.h, yaw: -Math.PI / 2 };
    if (layout.decor.some((d) => d.kind === kind && Math.hypot(d.x - plane.x, d.z - plane.z) < 1.6)) continue;
    layout.decor.push(plane);
    return true;
  }
  return false;
}

function addRug(layout: FloorLayout, w = 2.4, d = 1.6): boolean {
  const rect = layout.rect;
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  const candidates = [
    [cx, cz],
    [cx - 1, cz],
    [cx + 1, cz],
    [cx, cz - 1],
    [cx, cz + 1],
  ];
  for (const [x, z] of candidates) {
    const r: Rect = { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 };
    if (!inside(r, rect)) continue;
    if (layout.plan.stair && overlaps(r, expand(layout.plan.stair.landing, 0.5))) continue;
    layout.decor.push({ kind: 'rug', x, y: layout.floorTop + 0.02, z, w, h: d, yaw: 0 });
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Category layouts                                                    */
/* ------------------------------------------------------------------ */

function furnishResidence(layout: FloorLayout) {
  const area = areaOf(layout.rect);
  if (layout.floor === 0) {
    const groups = clamp(Math.round(area / 55), 1, 3);
    for (let g = 0; g < groups; g++) {
      placeWallItem(layout, ITEMS.bed, sideOrder(layout, 11 + g));
      placeWallItem(layout, ITEMS.cabinet, sideOrder(layout, 23 + g));
      placeWallItem(layout, ITEMS.table, sideOrder(layout, 31 + g));
      placeWallItem(layout, ITEMS.stool, sideOrder(layout, 41 + g));
      placeWallItem(layout, ITEMS.stool, sideOrder(layout, 43 + g));
    }
    addRug(layout);
    addWallArt(layout, 'art');
  } else {
    // Upper floor stays sparse: one bed+cabinet, or one table with two stools.
    if (mix(layout.seed, 5) % 2) {
      placeWallItem(layout, ITEMS.bed);
      placeWallItem(layout, ITEMS.cabinet);
    } else {
      placeWallItem(layout, ITEMS.table);
      placeWallItem(layout, ITEMS.stool);
      placeWallItem(layout, ITEMS.stool);
      placeWallItem(layout, ITEMS.cabinet);
    }
  }
}

function furnishManor(layout: FloorLayout) {
  if (layout.floor === 0) {
    for (let g = 0; g < 2; g++) {
      placeWallItem(layout, ITEMS.table, sideOrder(layout, 13 + g));
      placeWallItem(layout, ITEMS.stool, sideOrder(layout, 33 + g));
      placeWallItem(layout, ITEMS.stool, sideOrder(layout, 35 + g));
      placeWallItem(layout, ITEMS.cabinet, sideOrder(layout, 53 + g));
    }
    addRug(layout);
    addWallArt(layout, 'art');
    addWallArt(layout, 'art');
  } else {
    placeWallItem(layout, ITEMS.table);
    placeWallItem(layout, ITEMS.stool);
    placeWallItem(layout, ITEMS.stool);
    placeWallItem(layout, ITEMS.cabinet);
  }
}

function furnishOffice(layout: FloorLayout, control = false) {
  if (layout.floor === 0) {
    const groups = clamp(Math.round(areaOf(layout.rect) / 65), 1, 3);
    for (let g = 0; g < groups; g++) {
      placeWallItem(layout, ITEMS.desk, sideOrder(layout, 17 + g));
      placeWallItem(layout, ITEMS.stool, sideOrder(layout, 37 + g));
      placeWallItem(layout, ITEMS.file, sideOrder(layout, 59 + g));
    }
    addWallArt(layout, 'map');
  } else if (control) {
    // L-shaped console hugging two adjacent walls; 1 m high so windows stay open.
    const order = sideOrder(layout, 71);
    const a = order[0];
    const b = order[1];
    placeWallItem(layout, ITEMS.console, [a]);
    placeWallItem(layout, ITEMS.consoleShort, [b]);
    placeWallItem(layout, ITEMS.stool, [order[2], order[3]]);
    placeWallItem(layout, ITEMS.file, [order[3], order[2]]);
    addWallArt(layout, 'map');
  } else {
    placeWallItem(layout, ITEMS.desk);
    placeWallItem(layout, ITEMS.stool);
    placeWallItem(layout, ITEMS.file);
    addWallArt(layout, 'map');
  }
}

function furnishIndustrial(layout: FloorLayout) {
  if (layout.floor === 0) {
    const large = areaOf(layout.rect) > 140;
    const crates = large ? 4 : 3;
    for (let i = 0; i < crates; i++) {
      const kind = i % 3 === 0 ? ITEMS.crateLarge : i % 3 === 1 ? ITEMS.crate : ITEMS.crateSmall;
      placeWallItem(layout, kind, sideOrder(layout, 101 + i));
    }
    placeWallItem(layout, ITEMS.pallet, sideOrder(layout, 131));
    if (large) placeWallItem(layout, ITEMS.pallet, sideOrder(layout, 133));
    placeWallItem(layout, ITEMS.workbench, sideOrder(layout, 137));
    placeWallItem(layout, ITEMS.barrel, sideOrder(layout, 139));
    if (large) placeWallItem(layout, ITEMS.barrel, sideOrder(layout, 141));
    addWallArt(layout, 'sign');
  } else {
    placeWallItem(layout, ITEMS.crate);
    placeWallItem(layout, ITEMS.crateSmall);
    placeWallItem(layout, ITEMS.pallet);
    placeWallItem(layout, ITEMS.workbench);
  }
}

function furnishShop(layout: FloorLayout) {
  if (layout.floor === 0) {
    // Two counters on adjacent walls read as an L without custom rotation.
    placeWallItem(layout, ITEMS.counter, ['south', 'north', 'west', 'east']);
    placeWallItem(layout, ITEMS.counterShort, ['west', 'east', 'south', 'north']);
    placeWallItem(layout, ITEMS.shelf);
    placeWallItem(layout, ITEMS.shelf);
    for (let i = 0; i < 3; i++) placeWallItem(layout, ITEMS.carton);
    addWallArt(layout, 'art');
  } else {
    placeWallItem(layout, ITEMS.shelf);
    placeWallItem(layout, ITEMS.carton);
  }
}

function furnishChurch(layout: FloorLayout) {
  if (layout.floor !== 0) return;
  const rect = layout.rect;
  const cx = (rect.x0 + rect.x1) / 2;
  const aisle = 2.5;
  const rows = 3;
  for (let row = 0; row < rows; row++) {
    const z = rect.z0 + 5 + row * 2.6;
    if (z > rect.z1 - 3) break;
    placeAt(layout, ITEMS.bench, cx - 3, z);
    placeAt(layout, ITEMS.bench, cx + 3, z);
  }
  // A simple stone table at the far end, offset off the north door lane.
  placeAt(layout, ITEMS.altar, cx - 4.5, rect.z1 - 2.2);
  layout.decor.push({
    kind: 'rug',
    x: cx,
    y: layout.floorTop + 0.02,
    z: (rect.z0 + rect.z1) / 2,
    w: 1.8,
    h: Math.min(7, rect.z1 - rect.z0 - 6),
    yaw: 0,
  });
  addWallArt(layout, 'art');
  addWallArt(layout, 'art');
}

function furnishTerminal(layout: FloorLayout) {
  const rect = layout.rect;
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  if (layout.floor === 0) {
    // Two facing rows of linked seats, split around the central door route.
    for (const sign of [-1, 1]) {
      for (const dx of [-9.6, -7, -4.4, 4.4, 7, 9.6]) {
        placeAt(layout, ITEMS.seatRow, cx + dx, cz + sign * 3);
      }
    }
    placeWallItem(layout, ITEMS.counter, sideOrder(layout, 151));
    for (let i = 0; i < 3; i++) placeAt(layout, ITEMS.luggage, cx + 5 + i * 1.2, cz - 1.5 + (i % 2));
    addWallArt(layout, 'map');
  } else {
    placeAt(layout, ITEMS.seatRow, cx - 2, cz + 2);
    placeAt(layout, ITEMS.seatRow, cx + 1.5, cz + 2);
    placeAt(layout, ITEMS.luggage, cx + 4, cz + 2);
    placeWallItem(layout, ITEMS.counter);
  }
}

function furnishGreenhouse(layout: FloorLayout) {
  const rect = layout.rect;
  const longX = rect.x1 - rect.x0 >= rect.z1 - rect.z0;
  if (longX) {
    // Planters and seedling tables along the two long edges; centre aisle clear.
    for (const z of [rect.z0 + 0.25, rect.z1 - 0.25]) {
      const count = Math.max(1, Math.floor((rect.x1 - rect.x0 - 2) / 3));
      for (let i = 0; i < count; i++) {
        const x = rect.x0 + 1.25 + i * 3;
        const spec = i % 3 === 0 ? ITEMS.seedTable : ITEMS.trough;
        placeAt(layout, spec, x, z);
      }
    }
    placeAt(layout, ITEMS.pot, rect.x0 + 0.5, (rect.z0 + rect.z1) / 2);
    placeAt(layout, ITEMS.pot, rect.x1 - 0.5, (rect.z0 + rect.z1) / 2);
  } else {
    for (const x of [rect.x0 + 0.25, rect.x1 - 0.25]) {
      const count = Math.max(1, Math.floor((rect.z1 - rect.z0 - 2) / 3));
      for (let i = 0; i < count; i++) {
        const z = rect.z0 + 1.25 + i * 3;
        const spec = i % 3 === 0 ? ITEMS.seedTable : ITEMS.trough;
        placeAt(layout, spec, x, z);
      }
    }
    placeAt(layout, ITEMS.pot, (rect.x0 + rect.x1) / 2, rect.z0 + 0.5);
    placeAt(layout, ITEMS.pot, (rect.x0 + rect.x1) / 2, rect.z1 - 0.5);
  }
  if (layout.floor === 0 && layout.plan.category === 'greenhouse' && layout.plan.height > 6) {
    placeAt(layout, ITEMS.seedTable, (rect.x0 + rect.x1) / 2, rect.z0 + 2.2);
  }
}

/* ------------------------------------------------------------------ */
/* Public entry                                                        */
/* ------------------------------------------------------------------ */

export interface FurnishResult {
  details: DetailCall[];
  decor: InteriorDecorPlane[];
  props: InteriorPropInfo[];
}

export function furnishBuilding(plan: BuildingInteriorPlan): FurnishResult {
  const details: DetailCall[] = [];
  const decor: InteriorDecorPlane[] = [];
  const props: InteriorPropInfo[] = [];
  const floors: Array<0 | 1> = plan.floors === 2 ? [0, 1] : [0];
  for (const floor of floors) {
    // The upper stair opening is not a support surface for furniture.
    const layout = makeLayout(plan, floor);
    if (plan.category !== 'greenhouse') {
      switch (plan.category) {
        case 'residence':
          furnishResidence(layout);
          break;
        case 'manor':
          furnishManor(layout);
          break;
        case 'office':
          furnishOffice(layout);
          break;
        case 'control':
          furnishOffice(layout, true);
          break;
        case 'industrial':
          furnishIndustrial(layout);
          break;
        case 'shop':
          furnishShop(layout);
          break;
        case 'church':
          furnishChurch(layout);
          break;
        case 'terminal':
          furnishTerminal(layout);
          break;
      }
    } else {
      furnishGreenhouse(layout);
    }
    details.push(...layout.details);
    decor.push(...layout.decor);
    props.push(...layout.props);
  }
  return { details, decor, props };
}
