/** Shared interior-building contracts: shell plans, furniture details, decor planes. */

export type InteriorCategory =
  | 'residence'
  | 'office'
  | 'industrial'
  | 'shop'
  | 'church'
  | 'terminal'
  | 'greenhouse'
  | 'manor'
  | 'control';

export type WallSide = 'south' | 'north' | 'west' | 'east';
export type StairDir = '+x' | '-x' | '+z' | '-z';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** One ordered voxel-box operation (coordinates are world metres, half-open). */
export interface BoxCall extends Rect {
  y0: number;
  y1: number;
  id: number;
}

/** A half-grid detail box, rasterised by buildVoxelMapData's detail() pass. */
export interface DetailCall {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  bottom: number;
  top: number;
  material: number;
  angle?: number;
}

/** Thin, non-colliding decorative plane (rug, art, map, sign). */
export interface InteriorDecorPlane {
  kind: 'rug' | 'art' | 'map' | 'sign';
  /** Centre position. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** Rotation around +Y in radians. Vertical kinds face into the room. */
  yaw: number;
}

export interface InteriorDoorPlan {
  side: WallSide;
  /** Absolute span along the wall axis (X for south/north, Z for west/east). */
  a0: number;
  a1: number;
  /** Wall centre: cx for north/south, cz for west/east. */
  cx: number;
  cz: number;
  /** Opening span along Y (from floor to header). */
  y0: number;
  y1: number;
}

export interface InteriorWindowPlan {
  side: WallSide;
  floor: 0 | 1;
  /** Absolute span along the wall axis (X for south/north, Z for west/east). */
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

export interface StairPlan {
  /** Full footprint including the 1 m entry landing. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  dir: StairDir;
  bottom: number;
  top: number;
  /** Floor-level landing rectangle (same height as the lower floor). */
  landing: Rect;
  /** Stairwell opening cut in the upper slab (steps only, not the landing). */
  opening: Rect;
  steps: number;
}

export interface PartitionPlan extends Rect {
  axis: 'x' | 'z';
  door: Rect;
}

export interface InteriorPropInfo {
  id: string;
  buildingId: string;
  floor: 0 | 1;
  kind: string;
  x: number;
  z: number;
  w: number;
  d: number;
  bottom: number;
  top: number;
  material: number;
}

export interface BuildingInteriorPlan {
  id: string;
  name: string;
  category: InteriorCategory;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  base: number;
  height: number;
  floors: 1 | 2;
  floorTop: number;
  upperFloorTop: number | null;
  /** Walkable interior bounds (inside the innermost wall layer). */
  interior: Rect;
  /** Parts of the interior overlapped by another authored building. */
  foreign: Rect[];
  /** Authored covers/props that physically occupy part of this interior. */
  obstacles: Rect[];
  doors: InteriorDoorPlan[];
  windows: InteriorWindowPlan[];
  /** XZ approach rectangles kept free of cover/prop details in front of every door. */
  doorClear: Rect[];
  stair: StairPlan | null;
  partitions: PartitionPlan[];
  propCounts: [number, number];
  decorCount: number;
}

export interface BuildingBuildResult {
  ops: BoxCall[];
  details: DetailCall[];
  decor: InteriorDecorPlane[];
  props: InteriorPropInfo[];
  plan: BuildingInteriorPlan;
}
