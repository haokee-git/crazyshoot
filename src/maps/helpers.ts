import type {
  Building,
  CapturePoint,
  Cover,
  CoverKind,
  MapDef,
  MgNest,
  Prop,
  Route,
  SpecialCrate,
  SpawnZone,
  Team,
  TerrainKind,
  TerrainPatch,
  Vec2,
  VehiclePad,
  Polygon,
} from './types';

export const rectPoly = (x: number, y: number, w: number, h: number): Polygon => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

export const v = (x: number, y: number): Vec2 => [x, y];

export function building(
  id: string,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  height = 6,
  roof: Building['roof'] = 'flat',
  extra: Partial<Building> = {},
): Building {
  return {
    id,
    name,
    polygon: rectPoly(x, y, w, h),
    height,
    roof,
    label: true,
    // Every roofed building is enterable by default; open sheds/pavilions keep
    // their authored column-and-back-wall form and do not need a door.
    enterable: roof !== 'open',
    ...extra,
  };
}

export function cover(
  kind: CoverKind,
  x: number,
  y: number,
  w: number,
  d: number,
  rot = 0,
  extra: Partial<Cover> = {},
): Cover {
  return { kind, x, y, w, d, rot, ...extra };
}

export function containerRow(
  x: number,
  y: number,
  count: number,
  horizontal = true,
  rot = 0,
  step = 14,
  length = 12,
  width = 2.8,
): Cover[] {
  const out: Cover[] = [];
  for (let i = 0; i < count; i++) {
    out.push(
      cover(
        'container',
        x + (horizontal ? i * step : 0),
        y + (horizontal ? 0 : i * step),
        length,
        width,
        rot,
      ),
    );
  }
  return out;
}

export function treeRow(
  x: number,
  y: number,
  count: number,
  stepX: number,
  stepY: number,
  size = 4,
): Cover[] {
  const out: Cover[] = [];
  for (let i = 0; i < count; i++) {
    out.push(cover('tree', x + i * stepX, y + i * stepY, size, size));
  }
  return out;
}

export function hedgeLine(x1: number, y1: number, x2: number, y2: number, thickness = 1.8): Cover {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    kind: 'hedge',
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
    w: len,
    d: thickness,
    rot: angle,
  };
}

export function wallLine(x1: number, y1: number, x2: number, y2: number, thickness = 1.2): Cover {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    kind: 'wall',
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
    w: len,
    d: thickness,
    rot: angle,
  };
}

export function sandbagLine(x1: number, y1: number, x2: number, y2: number, thickness = 2.2): Cover {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    kind: 'sandbag',
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
    w: len,
    d: thickness,
    rot: angle,
  };
}

export function terrain(
  kind: TerrainKind,
  polygon: Polygon,
  elevation = 0,
  label?: string,
  opacity = 1,
): TerrainPatch {
  return { kind, polygon, elevation, label, opacity };
}

export function mg(x: number, y: number, angle: number, label: string): MgNest {
  return { id: `mg-${x}-${y}`, x, y, angle, label };
}

export function special(weaponId: string, x: number, y: number, label?: string): SpecialCrate {
  return { id: `${weaponId}-${x}-${y}`, weaponId, x, y, label };
}

export function pad(team: Team | 'neutral', vehicleId: string, x: number, y: number, angle = 0): VehiclePad {
  return { team, vehicleId, x, y, angle };
}

export function capture(
  id: string,
  name: string,
  x: number,
  y: number,
  radius: number,
  floorY?: number,
  verticalTolerance?: number,
): CapturePoint {
  return { id, name, x, y, radius, initialOwner: 'neutral', floorY, verticalTolerance };
}

export function spawn(team: Team, x: number, y: number, w: number, d: number, label: string): SpawnZone {
  return { team, x, y, w, d, label };
}

export function route(
  team: Team,
  label: string,
  points: Vec2[],
  kind: Route['kind'] = 'main',
): Route {
  return { team, label, points, kind };
}

export function prop(
  kind: Prop['kind'],
  x: number,
  y: number,
  extra: Partial<Prop> = {},
): Prop {
  return { id: `${kind}-${x}-${y}`, kind, x, y, ...extra };
}

export function assertMapValid(map: MapDef): string[] {
  const errors: string[] = [];
  const inBounds = (x: number, y: number) => x >= 0 && x <= map.size && y >= 0 && y <= map.size;
  for (const p of map.capturePoints) {
    if (!inBounds(p.x, p.y)) errors.push(`${map.id}: capture ${p.id} out of bounds`);
  }
  for (const s of map.spawns) {
    if (!inBounds(s.x, s.y)) errors.push(`${map.id}: spawn out of bounds`);
  }
  for (const p of map.vehiclePads) {
    if (!inBounds(p.x, p.y)) errors.push(`${map.id}: vehicle pad out of bounds`);
  }
  for (const p of map.mgNests) {
    if (!inBounds(p.x, p.y)) errors.push(`${map.id}: MG nest out of bounds`);
  }
  for (const p of map.specialCrates) {
    if (!inBounds(p.x, p.y)) errors.push(`${map.id}: special crate out of bounds`);
  }
  return errors;
}
