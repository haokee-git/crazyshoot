import * as THREE from 'three';
import {advanceVehicleSpeed,hullYawRate,vehicleMaxSpeed,vehicleSize,trackedHull} from './controller';

/**
 * Vehicle hull motion against the voxel world.
 *
 * Everything a hull may drive over is expressed through `MotionWorld.ground`
 * (the drivable deck: `Arena.vehicleGroundAt` / voxel `primary`), and everything
 * that blocks it through `footprintBlocked` (the same box/voxel queries infantry
 * collision uses). Keeping both in one place means the route planner, the AI and
 * the physics step all agree on what "drivable" means — previously the planner
 * sampled `navigationHeight` (which can be the top of a crate) while the physics
 * sampled the terrain deck, so a planned route could run straight into a cover
 * the hull could not climb.
 */

export interface MotionHull {w:number;d:number;h:number;}
export interface MotionPose {x:number;z:number;yaw:number;}
export interface MotionContact {y:number;pitch:number;roll:number;front:number;back:number;left:number;right:number;}

export interface MotionWorld {
  /** Drivable deck at (x,z): terrain top / bridge deck / building floor. */
  ground(x:number,z:number):number;
  /** Solid boxes + voxels for the rotated hull footprint. */
  footprintBlocked?(x:number,z:number,w:number,d:number,yaw:number,feet:number,height:number,terrain?:{min:number;max:number}):boolean;
  supportAt?(x:number,z:number,maxY:number):number;
  heightAt?(x:number,z:number):number;
  waterAt?(x:number,z:number,feet?:number): {surface:number;bottom:number} | null;
  /** Other vehicles occupying the pose (dynamic, not part of the static map). */
  vehicleBlocks?(pose:MotionPose,hull:MotionHull,ground:number,ignoreId?:string,knownTeam?:string):boolean;
  bounds?: {minX:number;maxX:number;minZ:number;maxZ:number};
  /** 地图级载具性能覆盖（法老图提速）；缺省用 controller 表。 */
  vehiclePerformance?: (kind:string)=>{maxSpeed?:number;accelScale?:number} | undefined;
}

/** Nine hull support samples: centre, 4 edge midpoints, 4 corners. */
export const HULL_SUPPORT_POINTS = [
  [-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1],
] as const;

/** Voxel terrain is stepped; one 1 m lip is still a ramp, two are a wall. */
export const VEHICLE_STEP_LIMIT = 1.06;
/** Sampling step of the step/ledge scans (m): matches the travel-path probe. */
export const VEHICLE_STEP_SAMPLE = 0.45;
/** Hull underside standing clearance above the deck. */
export const VEHICLE_UNDERCARRIAGE = 0.56;
/** Water deeper than this over the deck is not fordable. */
export const VEHICLE_FORD_DEPTH = 1.05;
/**
 * Contact skin. A hull resting *exactly* against a wall (zero penetration) is
 * reported as overlapping by box tests, which used to lock a hull in place: it
 * could not rotate (the swing adds penetration) and could not reverse (the pose
 * was "blocked" for its whole length). Shrinking the probe by 4 cm makes contact
 * non-blocking while still stopping every real approach.
 */
export const VEHICLE_CONTACT_SKIN = 0.15;

/**
 * Coarse front-to-back deck difference that used to gate a pose (≈24–27°).
 *
 * Kept for the AI route budget and the spawn-scoring heuristic, which only need a
 * cheap "is this terrain lumpy" number. It is deliberately NOT used to decide
 * whether a hull may occupy a pose any more: `(w+d)·tanθ` on a diagonal sample
 * says a 25° hillside is unclimbable for a 5.3 m hull, which is what wedged
 * tanks on diagonal slopes.
 */
export const maxVehicleGrade = (hull:MotionHull) => 2.15 + hull.d * 0.12;

const DEG = Math.PI / 180;

/**
 * Slope envelope of one hull class, measured with the support-plane fit below.
 * `pitch` is the longitudinal climb/descend limit, `roll` the side-slope limit
 * (a hull tips sideways well before it loses traction) and `residual` the
 * largest allowed distance between a support sample and the fitted plane, which
 * is what rejects crests, basins and broken decks that are locally flat but not
 * drivable.
 */
export interface VehicleSlopeLimits {
  pitch: number;
  roll: number;
  residual: number;
  /**
   * Extra tilt a hull tolerates when the ground is voxel-stepped (radians). Integer
   * 1 m decks make the nine-sample fit read a few degrees high — a single riser
   * under a 2.1 m bike reads 25° of pitch — so this is the resolution the fit
   * cannot buy back. It disappears on continuous ground (`residual` 0), which is
   * why a uniform 40° hillside is still refused.
   */
  lattice: number;
}

/**
 * Tracked hulls: MBT/light tank 36°, IFV 34°. 36° keeps a legitimately graded
 * 35° ramp drivable and still refuses 40°+. Wheels: jeep 30°/27°, APC 28°/26°.
 * A motorcycle tips long before it runs out of traction, so 22°/18°.
 *
 * The residual caps sit above the 1/3-step integer-voxel signature of a smooth
 * ramp (a 2 m riser under a 3-row fit lands at ≈0.67 m, a 2 m crest/basin at
 * ≈1.78 m) and below it for the bad cases; 2 m risers themselves are caught by
 * the dense step scan, not by the residual.
 */
const SLOPE_LIMITS: Record<string, VehicleSlopeLimits> = {
  mbt: {pitch: 36 * DEG, roll: 32 * DEG, residual: 1.2, lattice: 3 * DEG},
  light_tank: {pitch: 36 * DEG, roll: 32 * DEG, residual: 1.1, lattice: 3 * DEG},
  ifv: {pitch: 34 * DEG, roll: 31 * DEG, residual: 1.05, lattice: 3 * DEG},
  apc: {pitch: 28 * DEG, roll: 26 * DEG, residual: 0.95, lattice: 6 * DEG},
  jeep: {pitch: 30 * DEG, roll: 27 * DEG, residual: 0.9, lattice: 6 * DEG},
  motorcycle: {pitch: 22 * DEG, roll: 18 * DEG, residual: 0.75, lattice: 6 * DEG},
};
/** Unknown/custom hull: between wheels and tracks so nothing is silently unblocked. */
const DEFAULT_SLOPE_LIMITS: VehicleSlopeLimits = {pitch: 33 * DEG, roll: 29 * DEG, residual: 1, lattice: 4 * DEG};

/** Hulls whose collision box is unique enough to identify the class without its id. */
const SLOPE_KIND_BY_BOX: readonly string[] = ['mbt', 'light_tank', 'motorcycle', 'jeep'];

/**
 * Slope envelope for a hull. Driving code passes `kind`; probes that only carry
 * the collision box (spawn clearance, pad checks, unstacking) fall back on the
 * box, which is unique per class except APC/IFV — those share one box and get the
 * tighter wheeled envelope.
 */
export function vehicleSlopeLimits(hull: MotionHull, kind?: string): VehicleSlopeLimits {
  const named = kind ? SLOPE_LIMITS[kind] : undefined;
  if (named) return named;
  for (const candidate of SLOPE_KIND_BY_BOX) {
    const size = vehicleSize(candidate);
    if (Math.abs(size.w - hull.w) <= .02 && Math.abs(size.d - hull.d) <= .02) return SLOPE_LIMITS[candidate];
  }
  const apc = vehicleSize('apc');
  if (Math.abs(apc.w - hull.w) <= .02 && Math.abs(apc.d - hull.d) <= .02) return SLOPE_LIMITS.apc;
  return DEFAULT_SLOPE_LIMITS;
}

/** Below this width a hull cannot resolve a side slope on 1 m voxel decks (bikes). */
const SINGLE_TRACK_WIDTH = 1.2;
/** Residual above which the support samples are voxel-quantised rather than planar. */
const QUANTISATION_FLOOR = 0.15;
/** Slack a hull that is already driving a hillside gets over the strict envelope. */
export const VEHICLE_SLOPE_ALLOWANCE = 2 * DEG;
/** Support samples must disagree with the fitted plane by this much to scan for a riser. */
const STEP_SCAN_TRIGGER = 0.3;

/** Least-squares support plane through the nine hull samples. */
export interface SupportPlaneFit {
  /** Height of the fitted plane at the hull centre. */
  y: number;
  /** Gradient across the hull (positive = right side uphill). */
  lateral: number;
  /** Gradient along the hull (positive = nose uphill). */
  longitudinal: number;
  /** Largest |sample − plane| over the nine samples. */
  residual: number;
  highest: number;
  lowest: number;
}

/**
 * Fit `h = y + lateral·u + longitudinal·v` through the nine support samples
 * (`u` across the hull, `v` along it, both in metres, yaw applied by the caller).
 *
 * `HULL_SUPPORT_POINTS` is a symmetric 3×3 grid, so Σu = Σv = Σuv = 0 and the
 * normal equations decouple into three one-line estimates. This is the whole
 * point of the change: the old test compared only `highest − lowest`, which on a
 * uniform slope grows like `(w+d)·tanθ` and vetoed drivable hillsides.
 */
export function supportPlaneFit(hull: MotionHull, heights: ReadonlyArray<number>): SupportPlaneFit {
  const hw = hull.w * .5, hd = hull.d * .5;
  let sum = 0, sumU2 = 0, sumV2 = 0, sumUH = 0, sumVH = 0, highest = -Infinity, lowest = Infinity;
  for (let i = 0; i < HULL_SUPPORT_POINTS.length; i++) {
    const [side, end] = HULL_SUPPORT_POINTS[i], h = heights[i];
    if (!Number.isFinite(h)) return {y: NaN, lateral: NaN, longitudinal: NaN, residual: Infinity, highest: NaN, lowest: NaN};
    const u = side * hw, v = end * hd;
    sum += h; sumU2 += u * u; sumV2 += v * v; sumUH += u * h; sumVH += v * h;
    if (h > highest) highest = h;
    if (h < lowest) lowest = h;
  }
  const y = sum / HULL_SUPPORT_POINTS.length;
  const lateral = sumU2 ? sumUH / sumU2 : 0;
  const longitudinal = sumV2 ? sumVH / sumV2 : 0;
  let residual = 0;
  for (let i = 0; i < HULL_SUPPORT_POINTS.length; i++) {
    const [side, end] = HULL_SUPPORT_POINTS[i];
    const deviation = Math.abs(heights[i] - (y + lateral * side * hw + longitudinal * end * hd));
    if (deviation > residual) residual = deviation;
  }
  return {y, lateral, longitudinal, residual, highest, lowest};
}

/** Dense grid resolution used to re-judge a quantised deck (4×4 incl. corners). */
const QUANTISED_GRID = 4;
/** Denser grid the crawl fallback uses: averages enough risers to expose the real grade. */
const CREEP_GRID = 8;

/**
 * Least-squares plane through a denser deck grid than the nine support samples.
 *
 * A 1 m voxel staircase can line up with the 3×3 support samples so exactly that
 * they read as a *perfectly planar* 39° slope while the ramp under them is 28°:
 * residual 0 means the lattice allowance below cannot see the quantisation, and
 * the driving path used to stop dead on that frame. Four samples a side average
 * the risers back into the slope the hull is really on. A genuine 40° hillside
 * still fits 40° — every sample lies on the same plane — so the steep-slope
 * contract is untouched. Only the driving path (a non-zero `slopeAllowance`) may
 * ask for this second opinion; route/spawn probes stay on the strict 3×3 fit.
 */
function quantisedSupportFit(world:MotionWorld,hull:MotionHull,x:number,z:number,yaw:number,grid=QUANTISED_GRID):SupportPlaneFit|null {
  const c=Math.cos(yaw), s=Math.sin(yaw), hw=hull.w*.5, hd=hull.d*.5;
  let sum=0,sumU2=0,sumV2=0,sumUH=0,sumVH=0,highest=-Infinity,lowest=Infinity;
  const heights:number[]=[];
  for (let i=0;i<grid;i++) for (let j=0;j<grid;j++) {
    const u=(-1+2*i/(grid-1))*hw, v=(-1+2*j/(grid-1))*hd;
    const h=world.ground(x+u*c+v*s,z-u*s+v*c);
    if (!Number.isFinite(h)) return null;
    sum+=h;sumU2+=u*u;sumV2+=v*v;sumUH+=u*h;sumVH+=v*h;
    if(h>highest)highest=h; if(h<lowest)lowest=h;
    heights.push(h);
  }
  const count=heights.length, y=sum/count;
  // The grid is symmetric about the hull centre, so the normal equations decouple.
  const lateral=sumU2?sumUH/sumU2:0, longitudinal=sumV2?sumVH/sumV2:0;
  let residual=0,k=0;
  for (let i=0;i<grid;i++) for (let j=0;j<grid;j++) {
    const u=(-1+2*i/(grid-1))*hw, v=(-1+2*j/(grid-1))*hd;
    const deviation=Math.abs(heights[k++]-(y+lateral*u+longitudinal*v));
    if(deviation>residual)residual=deviation;
  }
  return {y,lateral,longitudinal,residual,highest,lowest};
}

/**
 * Crawl gate: an 8×8 fit averages enough risers to expose the true grade, compared
 * with the STRICT class envelope (no hillside/lattice allowance). A stepped 30°
 * deck reads ≤35° and passes; a stepped 40° one reads ≥37° and is refused, so the
 * crawl can never turn a too-steep staircase into a drivable road. Normal driving
 * still uses the full allowances above; this gate only guards the fallback.
 */
function creepTerrainAllowed(world:MotionWorld,hull:MotionHull,kind:string,x:number,z:number,yaw:number):boolean {
  const fit=quantisedSupportFit(world,hull,x,z,yaw,CREEP_GRID);
  const limits=vehicleSlopeLimits(hull,kind);
  if (!fit||fit.residual>limits.residual) return false;
  const pitch=Math.atan(Math.abs(fit.longitudinal));
  const roll=Math.atan(Math.abs(fit.lateral));
  const singleTrack=hull.w<SINGLE_TRACK_WIDTH;
  const slope=singleTrack?pitch:Math.atan(Math.hypot(fit.lateral,fit.longitudinal));
  if (pitch>limits.pitch||slope>limits.pitch) return false;
  return singleTrack||roll<=limits.roll;
}

/** Deck height, with the infantry-support fallback for non-voxel training arenas. */
export function vehicleDeck(world:MotionWorld,x:number,z:number,reach=Infinity){
  const deck = world.ground(x,z);
  if (Number.isFinite(deck)) return deck;
  const support = world.supportAt?.(x,z,reach);
  if (support !== undefined && Number.isFinite(support)) return support;
  return world.heightAt?.(x,z) ?? 0;
}

export interface BlockOptions {
  /**
   * Hull attitude from the last rendered pose (radians). The support-plane gate is
   * attitude independent (it measures the terrain, not the hull), so these no
   * longer widen anything; kept because the engine already sends them.
   */
  pitch?:number;roll?:number;
  /** Hull whose current position defines the local terrain baseline. */
  from?:MotionPose;
  /** Hull class for the slope envelope; omitted callers fall back on the hull box. */
  kind?:string;
  /**
   * Extra pitch/roll allowance in radians (driving path only). Route and spawn
   * probes leave it at 0 so the strict envelope is what gets planned.
   */
  slopeAllowance?:number;
  /**
   * Answer only "is there an obstacle here?" (bounds, deep water, travel steps,
   * box/voxel and vehicle overlap), skipping the terrain-slope gates. The
   * under-hull riser scan is part of the slope gate and is skipped too; every
   * accepted contact response is re-checked with the full gate afterwards.
   * Contact-side probing uses it so a quantised hillside is not mistaken for a wall.
   */
  ignoreSlope?:boolean;
  ignoreId?:string;
}

/**
 * Sample the step/ledge grid under a hull. `vehiclePoseBlocked` only pays for
 * this when the nine samples disagree with their fitted plane, but a 2 m riser
 * under one end still fits a 16° plane: the plane alone cannot tell a riser from
 * a ramp, so the risers are measured directly at the same 0.45 m / 1.06 m
 * granularity the travel-path rule uses.
 */
function hullStepBlocked(world:MotionWorld,hull:MotionHull,x:number,z:number,yaw:number):boolean {
  const c=Math.cos(yaw), s=Math.sin(yaw), hw=hull.w*.5, hd=hull.d*.5;
  // Three longitudinal lines (left edge, centre, right edge).
  for (const u of [-hw,0,hw]) {
    const ox=x+u*c, oz=z-u*s;
    let floor=world.ground(ox-hd*s,oz-hd*c);
    if (!Number.isFinite(floor)) return true;
    const steps=Math.max(1,Math.ceil(hull.d/VEHICLE_STEP_SAMPLE));
    for (let i=1;i<=steps;i++) {
      const v=-hd+hull.d*i/steps;
      const h=world.ground(ox+v*s,oz+v*c);
      if (!Number.isFinite(h)||Math.abs(h-floor)>VEHICLE_STEP_LIMIT) return true;
      floor=h;
    }
  }
  // Three transverse lines (tail, centre, nose).
  for (const v of [-hd,0,hd]) {
    const ox=x+v*s, oz=z+v*c;
    let floor=world.ground(ox-hw*c,oz+hw*s);
    if (!Number.isFinite(floor)) return true;
    const steps=Math.max(1,Math.ceil(hull.w/VEHICLE_STEP_SAMPLE));
    for (let i=1;i<=steps;i++) {
      const u=-hw+hull.w*i/steps;
      const h=world.ground(ox+u*c,oz-u*s);
      if (!Number.isFinite(h)||Math.abs(h-floor)>VEHICLE_STEP_LIMIT) return true;
      floor=h;
    }
  }
  return false;
}

/**
 * Can the hull occupy `pose`? Exactly the test the physics step and AI probes use.
 *
 * Drivability comes from a least-squares support plane, not from the diagonal
 * spread of the nine samples:
 *  - pitch = atan|b|, roll = atan|a| and the steepest-direction atan(hypot(a,b))
 *    are compared with the class envelope (`vehicleSlopeLimits`), so a uniform
 *    hillside passes at any heading while a genuinely too-steep one does not;
 *  - the plane residual rejects crests/basins/broken decks (a locally flat but
 *    undrivable surface);
 *  - risers are measured by `hullStepBlocked` (1.06 m remains a ramp, 2 m is a
 *    wall) and the travel path keeps its own step rule, so descending is judged
 *    exactly like climbing — no support-spread veto either way.
 */
export function vehiclePoseBlocked(world:MotionWorld,hull:MotionHull,pose:MotionPose,options:BlockOptions={}):boolean {
  const {x:nx,z:nz,yaw}=pose, {bounds}=world;
  if (bounds && (nx<bounds.minX||nx>bounds.maxX||nz<bounds.minZ||nz>bounds.maxZ)) return true;
  const terrain = world.ground;
  const from = options.from ?? pose;
  const ground = terrain(from.x,from.z);
  const nextGround = terrain(nx,nz);
  if (!Number.isFinite(nextGround)) return true;
  // A single datum change between two neighbouring columns is measured along the
  // whole travel path, not just at the endpoint: a 1 m lip every 0.4 m is a wall.
  if (Math.abs(nextGround-ground)>VEHICLE_STEP_LIMIT) {
    const steps=Math.ceil(Math.hypot(nx-from.x,nz-from.z)/VEHICLE_STEP_SAMPLE);
    let floor=ground;
    for (let i=1;i<=steps;i++) {
      const y=terrain(from.x+(nx-from.x)*i/steps,from.z+(nz-from.z)*i/steps);
      if (!Number.isFinite(y)||Math.abs(y-floor)>VEHICLE_STEP_LIMIT) return true;
      floor=y;
    }
  }
  const c=Math.cos(yaw), s=Math.sin(yaw), hw=hull.w*.5, hd=hull.d*.5;
  const heights:number[]=[];
  for (const [side,end] of HULL_SUPPORT_POINTS) {
    const px=nx+side*hw*c+end*hd*s, pz=nz-side*hw*s+end*hd*c;
    const h=terrain(px,pz);
    const water=world.waterAt?.(px,pz,h);
    if (!Number.isFinite(h)||(water&&water.surface-h>VEHICLE_FORD_DEPTH)) return true;
    heights.push(h);
  }
  let plane=supportPlaneFit(hull,heights);
  const limits=vehicleSlopeLimits(hull,options.kind);
  const allow=options.slopeAllowance??0;
  const singleTrack=hull.w<SINGLE_TRACK_WIDTH;
  const angleBlocked=(fit:SupportPlaneFit)=>{
    const pitch=Math.atan(Math.abs(fit.longitudinal));
    const roll=Math.atan(Math.abs(fit.lateral));
    const slope=singleTrack?pitch:Math.atan(Math.hypot(fit.lateral,fit.longitudinal));
    // Voxel decks quantise the fit; the allowance only exists once the samples prove
    // the ground is stepped (a continuous plane has residual 0 and stays strict).
    const stepped=fit.residual>QUANTISATION_FLOOR?limits.lattice:0;
    const tolerance=allow+stepped;
    // Steepest-direction gate: a 45° hillside stays unclimbable even when a diagonal
    // heading splits it into 35.3° of pitch and 35.3° of roll, each under its own cap.
    // A single-track hull is not roll-gated: its 0.8 m of width cannot resolve a side
    // slope on 1 m voxel decks (three columns 0.8 m apart read 20–50° of fake roll), and
    // a bike leans rather than tips. Pitch and the riser scan still bound it.
    if (pitch>limits.pitch+tolerance||slope>limits.pitch+tolerance) return true;
    return !singleTrack&&roll>limits.roll+tolerance;
  };
  // Contact probing only asks "is there an obstacle?": a quantised hillside must not
  // look like a wall. The band/feet below are still the real deck band.
  if (!options.ignoreSlope) {
    if (plane.residual>limits.residual) return true;
    if (plane.residual>STEP_SCAN_TRIGGER&&hullStepBlocked(world,hull,nx,nz,yaw)) return true;
    if (angleBlocked(plane)) {
      // A perfectly planar-but-steep nine-point fit is the lattice aliasing described
      // at `quantisedSupportFit`: only the driving path may ask for the denser second
      // opinion, and it must clear the very same residual/riser gates.
      if (allow<=0) return true;
      const dense=quantisedSupportFit(world,hull,nx,nz,yaw);
      if (!dense||dense.residual>limits.residual||angleBlocked(dense)) return true;
      if (dense.residual>STEP_SCAN_TRIGGER&&hullStepBlocked(world,hull,nx,nz,yaw)) return true;
      plane=dense;
    }
  }
  // Deck band for the box/voxel query: the plane's own corner range plus one step
  // limit of lattice slop, clamped to the real contact samples so a hull straddling
  // a riser (skewed plane) is not vetoed by its own fit. A 2 m ledge under the flank
  // still lands outside; a 1 m lip is the same allowance the travel rule gives.
  const span=Math.abs(plane.lateral)*hw+Math.abs(plane.longitudinal)*hd;
  const deckMin=Math.min(plane.y-span,plane.lowest)-VEHICLE_STEP_LIMIT;
  const deckMax=Math.max(plane.y+span,plane.highest)+VEHICLE_STEP_LIMIT;
  const feet=Math.max(ground+VEHICLE_UNDERCARRIAGE,plane.highest+.04);
  if (world.footprintBlocked?.(nx,nz,hull.w-VEHICLE_CONTACT_SKIN,hull.d-VEHICLE_CONTACT_SKIN,yaw,feet,hull.h,{min:deckMin,max:deckMax})) return true;
  if (world.vehicleBlocks?.(pose,hull,nextGround,options.ignoreId)) return true;
  return false;
}

/** Deck contact under the four hull quadrants: draw height plus settled pitch/roll. */
export function vehicleContact(world:MotionWorld,hull:MotionHull,x:number,z:number,yaw:number):MotionContact {
  const ground=world.ground(x,z);
  const fallback=Number.isFinite(ground)?ground:world.heightAt?.(x,z)??0;
  const reach=(Number.isFinite(ground)?ground:fallback)+2.4;
  const support=(px:number,pz:number)=>{
    const deck=world.ground(px,pz);
    if (Number.isFinite(deck)) return deck;
    const y=world.supportAt?.(px,pz,reach)??world.heightAt?.(px,pz)??fallback;
    return Number.isFinite(y)?Math.min(y,reach):fallback;
  };
  const fx=Math.sin(yaw), fz=Math.cos(yaw), rx=Math.cos(yaw), rz=-Math.sin(yaw);
  const front=support(x+fx*hull.d*.38,z+fz*hull.d*.38), back=support(x-fx*hull.d*.38,z-fz*hull.d*.38);
  const right=support(x+rx*hull.w*.4,z+rz*hull.w*.4), left=support(x-rx*hull.w*.4,z-rz*hull.w*.4);
  const y=(front+back+left+right)/4;
  return {
    y,front,back,left,right,
    pitch:THREE.MathUtils.clamp(-Math.atan2(front-back,hull.d*.76),-.7,.7),
    roll:THREE.MathUtils.clamp(Math.atan2(right-left,hull.w*.8),-.7,.7),
  };
}

export interface StepResult {
  /** No candidate pose was clear: the hull was stopped by geometry this step. */
  blocked:boolean;
  /** Speed at the moment of the block (metres per second, signed). */
  impactSpeed:number;
  /** True while the hull is being pushed out of an embedded pose. */
  depenetrated:boolean;
  contact:MotionContact;
}

/**
 * Contact response tuned for boolean-only world queries (`footprintBlocked` has no
 * normal): ray probes infer which side of the hull touches, the tangential part of
 * the motion is kept, and the normal part is paid as friction/propulsion loss.
 */
/** How far (m) a contact probe looks beside/ahead of the hull. */
const CONTACT_PROBE_REACH = 1.2;
/** Samples per probe ray (coarse: each sample is a full hull pose test). */
const CONTACT_PROBE_STEPS = 4;
/** Speed loss rates (1/s) applied to the normal component while scraping. */
const CONTACT_FRICTION = 1.6;
const CONTACT_MOTOR_LOSS = 1;
/** A scraping hull only turns this fast towards the wall tangent (rad/s). */
const CONTACT_ALIGN_RATE = 28 * DEG;
/** Inferred approach angles above this are a head-on hit: stop, do not slide. */
const CONTACT_HEAD_ON = 0.88;
/**
 * Heading deviations tried by the slide fan (degrees), smallest first. The first
 * clear one is the maximum feasible forward progress; `sin(angle)` is the normal
 * ratio. The list stops below `asin(CONTACT_HEAD_ON)`, so a perpendicular wall has
 * no slide candidate and falls through to the old stop path.
 */
const CONTACT_SLIDE_ANGLES = [6,12,18,24,30,36,42,50,58].map(angle=>angle*DEG);
/** Terrain crawl: small per-frame catch-up, never a teleport (see lead guard). */
const CONTACT_CRAWL_STEP = 0.04;
const CONTACT_CRAWL_FLOOR = 0.02;
const CONTACT_CRAWL_CAP = 0.2;
const CONTACT_CRAWL_SIDE = 0.16;
const CONTACT_CRAWL_YAW = 4 * DEG;
/** Speed kept by a terrain crawl step: the throttle, not the map, does the work. */
const CONTACT_CRAWL_SPEED = 0.75;

type ClearPose=(x:number,z:number,yaw:number)=>boolean;

/** Obstacle-only pose test: the slope gates do not count as a wall. */
function obstacleBlocked(world:MotionWorld,hull:MotionHull,x:number,z:number,yaw:number,from:MotionPose,ignoreId?:string):boolean {
  return vehiclePoseBlocked(world,hull,{x,z,yaw},{from,ignoreId,ignoreSlope:true});
}

/**
 * Distance the hull can translate along `(dirX,dirZ)` before an obstacle, capped at
 * `reach`. Contacts come from the same boolean footprint query the physics uses, so
 * "distance" is the last clear sample, not a true ray hit; 0 means pressing already.
 */
function contactFreeDistance(world:MotionWorld,hull:MotionHull,from:MotionPose,dirX:number,dirZ:number,reach:number,ignoreId?:string):number {
  let free=0;
  for (let i=1;i<=CONTACT_PROBE_STEPS;i++) {
    const d=reach*i/CONTACT_PROBE_STEPS;
    if (obstacleBlocked(world,hull,from.x+dirX*d,from.z+dirZ*d,from.yaw,from,ignoreId)) break;
    free=d;
  }
  return free;
}

/**
 * Slide along the wall instead of zeroing the throttle.
 *
 * Rays on both flanks first decide whether a flank is in contact (a pure head-on
 * hit has both flanks free and keeps the old stop). A boolean fan then finds the
 * smallest heading deviation whose probe pose is clear: that is the maximum
 * feasible forward progress. Its sign is the contact side, its magnitude `θ` gives
 * `normalRatio = sinθ ≈ |v·n|/|v|`, and the hull's nose turns towards it by at most
 * `CONTACT_ALIGN_RATE·dt` per step, so holding W gradually steers along the wall.
 * Lost speed is the normal component: friction always, plus motor loss under
 * throttle.
 */
function contactSlide(world:MotionWorld,hull:MotionHull,state:MotionPose&{speed:number},yaw:number,moveSign:number,travel:number,clear:ClearPose,from:MotionPose,ignoreId:string|undefined,dt:number,throttle:number):{x:number;z:number;yaw:number;speed:number}|null {
  const rmx=Math.cos(yaw)*moveSign, rmz=-Math.sin(yaw)*moveSign;
  const reach=Math.min(CONTACT_PROBE_REACH,Math.max(.55,Math.abs(travel)*4));
  const right=contactFreeDistance(world,hull,from,rmx,rmz,reach,ignoreId);
  const left=contactFreeDistance(world,hull,from,-rmx,-rmz,reach,ignoreId);
  // Both flanks free inside the probe reach: nothing to slide along (head-on wall
  // or a corner dead ahead). The old stop path handles it, as contract 2 requires.
  if (Math.min(right,left)>=reach-1e-6) return null;
  const sideSign=right<=left?1:-1; // +1: obstacle on the hull's right
  // The probe must be long enough to escape the 15 cm contact skin but short
  // enough that the hull does not tunnel over a thin obstacle.
  const probe=Math.min(.5,Math.max(.12,Math.abs(travel)));
  let chosen=0;
  for (const magnitude of CONTACT_SLIDE_ANGLES) {
    const away=-sideSign*magnitude, into=sideSign*magnitude;
    for (const angle of [away,into]) {
      const px=state.x+Math.sin(yaw+angle)*moveSign*probe, pz=state.z+Math.cos(yaw+angle)*moveSign*probe;
      const candidateYaw=yaw+THREE.MathUtils.clamp(angle,-CONTACT_ALIGN_RATE*dt,CONTACT_ALIGN_RATE*dt);
      if (clear(px,pz,candidateYaw)) { chosen=angle; break; }
    }
    if (chosen) break;
  }
  if (!chosen) return null;
  const theta=Math.abs(chosen), normalRatio=Math.min(1,Math.sin(theta));
  if (normalRatio>CONTACT_HEAD_ON) return null;
  const dirX=Math.sin(yaw+chosen)*moveSign, dirZ=Math.cos(yaw+chosen)*moveSign;
  const align=THREE.MathUtils.clamp(chosen,-CONTACT_ALIGN_RATE*dt,CONTACT_ALIGN_RATE*dt);
  const candidateYaw=yaw+align;
  const d=Math.abs(travel);
  const px=state.x+dirX*d, pz=state.z+dirZ*d;
  if (!clear(px,pz,candidateYaw)) return null;
  const lossRate=normalRatio*(CONTACT_FRICTION+(Math.abs(throttle)>1e-3?CONTACT_MOTOR_LOSS*Math.min(1,Math.abs(throttle)):0));
  return {x:px,z:pz,yaw:candidateYaw,speed:state.speed*Math.max(0,1-lossRate*dt)};
}

/**
 * Crawl/bypass candidates for a blocked pose that is *not* obstacle-blocked: the
 * slope gate stopped it. Voxel decks are not monotone (a 1 cm step can read steeper
 * than a 12 cm one), so the scan tries a few small forward distances and accepts
 * only poses that pass the full slope gate. Side/yaw offsets walk around a single
 * lattice spike instead of freezing on it. Two guards keep this a crawl, not a
 * winch: the per-frame displacement is capped (`CONTACT_CRAWL_CAP`), and both the
 * current and the landing pose must pass `creepTerrainAllowed` (strict 8×8 grade),
 * so this can never creep a hull up a 40° staircase.
 */
function terrainCreepPose(world:MotionWorld,hull:MotionHull,kind:string,state:MotionPose,yaw:number,moveSign:number,travel:number,clear:ClearPose,from:MotionPose,ignoreId?:string):MotionPose|null {
  // The hull must already sit on a genuinely drivable grade (strict 8×8 fit), so
  // the crawl cannot be used to creep up a too-steep staircase.
  if (!creepTerrainAllowed(world,hull,kind,state.x,state.z,yaw)) return null;
  const fx=Math.sin(yaw)*moveSign, fz=Math.cos(yaw)*moveSign;
  const rx=Math.cos(yaw), rz=-Math.sin(yaw);
  const cap=Math.min(CONTACT_CRAWL_CAP,Math.max(CONTACT_CRAWL_FLOOR,Math.abs(travel)*1.5));
  const start=Math.min(cap,Math.max(CONTACT_CRAWL_FLOOR,Math.abs(travel)*.5));
  const candidates:{d:number;side:number;dy:number}[]=[];
  const forwardSteps=Math.max(1,Math.ceil((cap-start)/CONTACT_CRAWL_STEP));
  for (let i=0;i<=forwardSteps;i++) candidates.push({d:Math.min(cap,start+i*CONTACT_CRAWL_STEP),side:0,dy:0});
  for (const dy of [CONTACT_CRAWL_YAW,0,-CONTACT_CRAWL_YAW]) for (const side of [CONTACT_CRAWL_SIDE,-CONTACT_CRAWL_SIDE,0]) {
    if (Math.abs(dy)<1e-9&&!side) continue;
    // Keep the vector length inside the per-frame crawl cap as well: a side
    // candidate must not turn the 0.2 m cap into a 0.26 m jump.
    candidates.push({d:Math.max(CONTACT_CRAWL_FLOOR,cap-Math.abs(side)),side,dy});
  }
  for (const {d,side,dy} of candidates) {
    // One midpoint footprint check keeps a crawl from crossing thin geometry; the
    // final pose is then judged by the full `clear` (risers, water, box footprint),
    // so the slope-only probe can never be used to walk through a 2 m step.
    if (obstacleBlocked(world,hull,state.x+fx*d*.5,state.z+fz*d*.5,yaw,from,ignoreId)) continue;
    const px=state.x+fx*d+rx*side, pz=state.z+fz*d+rz*side, candidateYaw=yaw+dy;
    if (!obstacleBlocked(world,hull,px,pz,candidateYaw,from,ignoreId)&&clear(px,pz,candidateYaw)) {
      // Same strict grade check at the landing pose. If the first clear landing is
      // too steep, this is not a quantisation rescue: stop like the old path.
      if (!creepTerrainAllowed(world,hull,kind,px,pz,candidateYaw)) return null;
      return {x:px,z:pz,yaw:candidateYaw};
    }
  }
  return null;
}

/**
 * Integrate throttle/steer into a new hull pose with collision fallbacks:
 * full turn → low-speed pivot → wall slide (tangent, friction, gradual yaw) →
 * terrain crawl → straight at the old yaw → half step → stop. Contact response
 * uses boolean probes only; the public signature and `StepResult` meaning are
 * unchanged.
 */
export function advanceVehiclePose(world:MotionWorld,state:MotionPose&{speed:number;steering?:number},kind:string,throttle:number,steer:number,dt:number,ignoreId?:string):StepResult {
  const hull=vehicleSize(kind), tracked=trackedHull(kind);
  const perf=world.vehiclePerformance?.(kind);
  const max=perf?.maxSpeed??vehicleMaxSpeed(kind);
  state.speed=advanceVehicleSpeed(state.speed,throttle,max,dt,tracked,perf?.accelScale??1);
  state.steering=THREE.MathUtils.damp(state.steering??0,steer,4.8,dt);
  const yaw=state.yaw+hullYawRate(state.speed,state.steering,max,tracked)*dt;
  const travel=state.speed*dt;
  // Driving a hillside is judged with the hull's own class envelope plus a small
  // hillside allowance, at both ends of the travel (forward and reverse alike):
  // a 1-frame fit on a stepped ramp must not read as a wall. Route/spawn probes
  // stay strict because they do not pass `slopeAllowance`.
  const here:BlockOptions={from:{x:state.x,z:state.z,yaw:state.yaw},ignoreId,kind,slopeAllowance:VEHICLE_SLOPE_ALLOWANCE};
  const clear=(x:number,z:number,yawValue:number)=>!vehiclePoseBlocked(world,hull,{x,z,yaw:yawValue},here);

  // Already inside geometry (bad spawn, pushed by an explosion): climb out along
  // the shortest clear vector instead of freezing with speed 0 forever.
  if (!clear(state.x,state.z,state.yaw)) {
    const free=findFreeVehiclePose(world,hull,state.x,state.z,state.yaw,3,ignoreId);
    if (free) {
      const d=Math.hypot(free.x-state.x,free.z-state.z), step=Math.min(.18,d);
      state.x+=(free.x-state.x)/(d||1)*step;
      state.z+=(free.z-state.z)/(d||1)*step;
      state.yaw=free.yaw;
      state.speed=Math.min(state.speed,1.2);
    } else state.speed=0;
    return {blocked:false,impactSpeed:0,depenetrated:true,contact:vehicleContact(world,hull,state.x,state.z,state.yaw)};
  }

  const nx=state.x+Math.sin(yaw)*travel, nz=state.z+Math.cos(yaw)*travel;
  if (!travel) {
    // Pivot in place: only if the swung hull still fits (a nose against a wall
    // must not rotate through it). Reversing is the AI's way out of that pose.
    if (clear(state.x,state.z,yaw)) state.yaw=yaw;
    return {blocked:false,impactSpeed:0,depenetrated:false,contact:vehicleContact(world,hull,state.x,state.z,state.yaw)};
  }
  if (clear(nx,nz,yaw)) {
    state.x=nx;state.z=nz;state.yaw=yaw;
    return {blocked:false,impactSpeed:0,depenetrated:false,contact:vehicleContact(world,hull,state.x,state.z,state.yaw)};
  }
  const impact=state.speed;
  if (Math.abs(state.speed)<2.2&&yaw!==state.yaw&&clear(state.x,state.z,yaw)) {
    // Tracks pivot in place; keep the rotation, bleed speed, do not consume travel.
    state.yaw=yaw;state.speed*=0.35;
    return {blocked:true,impactSpeed:impact,depenetrated:false,contact:vehicleContact(world,hull,state.x,state.z,state.yaw)};
  }
  const moveSign=state.speed<0?-1:1;
  const from:MotionPose={x:state.x,z:state.z,yaw:state.yaw};
  // Obstacle or terrain? The boolean target test is cheap and decides the response:
  // a wall is slid along, a quantisation block is crawled through instead of
  // zeroing the throttle (which used to be an infinite-friction stop).
  if (obstacleBlocked(world,hull,nx,nz,yaw,from,ignoreId)) {
    const slide=contactSlide(world,hull,state,yaw,moveSign,travel,clear,from,ignoreId,dt,throttle);
    if (slide) {
      state.x=slide.x;state.z=slide.z;state.yaw=slide.yaw;state.speed=slide.speed;
      // A clear candidate was found, so this step is not a stop: `blocked` stays
      // false and the engine runs its normal moving-hull impact path.
      return {blocked:false,impactSpeed:impact,depenetrated:false,contact:vehicleContact(world,hull,state.x,state.z,state.yaw)};
    }
  } else {
    const creep=terrainCreepPose(world,hull,kind,state,yaw,moveSign,travel,clear,from,ignoreId);
    if (creep) {
      state.x=creep.x;state.z=creep.z;state.yaw=creep.yaw;
      // A crawl is a corrective small step, not free forward motion: keep the
      // throttle in charge of the speed so a pinned hull never rides the map.
      state.speed*=CONTACT_CRAWL_SPEED;
      return {blocked:false,impactSpeed:impact,depenetrated:false,contact:vehicleContact(world,hull,state.x,state.z,state.yaw)};
    }
  }
  if (yaw!==state.yaw&&clear(nx,nz,state.yaw)) {
    state.x=nx;state.z=nz;state.yaw=state.yaw;
    state.speed*=.72;
    return {blocked:false,impactSpeed:impact,depenetrated:false,contact:vehicleContact(world,hull,state.x,state.z,state.yaw)};
  }
  const hx=state.x+Math.sin(yaw)*travel*.45, hz=state.z+Math.cos(yaw)*travel*.45;
  if (clear(hx,hz,yaw)) {
    state.x=hx;state.z=hz;state.yaw=yaw;state.speed*=.45;
    return {blocked:true,impactSpeed:impact,depenetrated:false,contact:vehicleContact(world,hull,state.x,state.z,state.yaw)};
  }
  state.speed=0;
  return {blocked:true,impactSpeed:impact,depenetrated:false,contact:vehicleContact(world,hull,state.x,state.z,yaw)};
}

/** Nearest clear hull pose around an embedded one (spiral, shortest radius first). */
export function findFreeVehiclePose(world:MotionWorld,hull:MotionHull,x:number,z:number,yaw:number,maxRadius=3,ignoreId?:string):MotionPose|null {
  for (let r=.35;r<=maxRadius+1e-6;r+=.35) {
    const steps=Math.max(8,Math.round(r*10));
    for (let i=0;i<steps;i++) {
      const angle=(i/steps)*Math.PI*2+r*1.7;
      const px=x+Math.cos(angle)*r, pz=z+Math.sin(angle)*r;
      if (!vehiclePoseBlocked(world,hull,{x:px,z:pz,yaw},{from:{x,z,yaw},ignoreId})) return {x:px,z:pz,yaw};
      // Also try the two 45° yaw offsets: a hull wedged nose-first often only
      // needs to swing its tail out.
      for (const dy of [.5,-.5]) {
        if (!vehiclePoseBlocked(world,hull,{x:px,z:pz,yaw:yaw+dy},{from:{x,z,yaw},ignoreId})) return {x:px,z:pz,yaw:yaw+dy};
      }
    }
  }
  return null;
}
