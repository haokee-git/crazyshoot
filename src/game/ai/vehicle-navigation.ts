import type { Arena } from '../world/arena';
import {vehicleDeck,maxVehicleGrade,HULL_SUPPORT_POINTS,type MotionHull,type MotionWorld} from '../vehicles/motion';

type Point={x:number;z:number};
export type Hull=MotionHull;
const directions=[[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]] as const;

export interface VehicleRouteOptions {
  /** Grid spacing in metres. 4 m fits the narrowest town alleys without a huge search. */
  step?:number;
  /** Hard cap on expanded cells; the default covers an empty 300 m map at 4 m. */
  maxExpansions?:number;
  /** Extra hull clearance on top of the authored body size. */
  margin?:number;
  /** Optional live occupancy from the existing vehicle physics world. */
  world?:MotionWorld;ignoreId?:string;knownTeam?:string;
}

export interface VehicleRoute {
  /** Waypoints from the start towards the goal (may be empty). */
  points:Point[];
  /** True when the goal radius was actually reached. */
  reached:boolean;
  /** Straight-line distance from the closest reachable cell to the goal. */
  closestDistance:number;
  expanded:number;
}

/** A planner view of the arena that uses the same drivable deck as the physics. */
export function vehicleWorld(arena:Arena):MotionWorld & {footprintBlocked?:(...args:any[])=>boolean} {
  return {
    bounds:arena.bounds,
    ground:(x,z)=>{
      if (arena.vehicleGroundAt) return arena.vehicleGroundAt(x,z);
      return arena.navigationHeight?.(x,z) ?? arena.heightAt?.(x,z) ?? 0;
    },
    footprintBlocked:arena.footprintBlocked
      ? (x,z,w,d,yaw,feet,height,terrain)=>arena.footprintBlocked!(x,z,w,d,yaw,feet,height,terrain)
      : undefined,
    supportAt:arena.supportAt ? (x,z,maxY)=>arena.supportAt!(x,z,maxY) : undefined,
    heightAt:arena.heightAt ? (x,z)=>arena.heightAt!(x,z) : undefined,
    waterAt:arena.waterAt ? (x,z,feet)=>arena.waterAt!(x,z,feet) : undefined,
  };
}

function minHeap(){
  const keys:number[]=[],values:number[]=[];
  const up=(i:number)=>{while(i>0){const p=(i-1)>>1;if(keys[p]<=keys[i])break;[keys[p],keys[i]]=[keys[i],keys[p]];[values[p],values[i]]=[values[i],values[p]];i=p;}};
  const down=(i:number)=>{for(;;){const l=i*2+1,r=l+1;let m=i;if(l<keys.length&&keys[l]<keys[m])m=l;if(r<keys.length&&keys[r]<keys[m])m=r;if(m===i)break;[keys[m],keys[i]]=[keys[i],keys[m]];[values[m],values[i]]=[values[i],values[m]];i=m;}};
  return {
    get size(){return keys.length;},
    push(key:number,value:number){keys.push(key);values.push(value);up(keys.length-1);},
    pop(){const value=values[0],lastKey=keys.pop()!,lastValue=values.pop()!;if(keys.length){keys[0]=lastKey;values[0]=lastValue;down(0);}return value;},
  };
}

/**
 * A* over a coarse grid for the WHOLE hull.
 *
 * Infantry edges can lead over stairs, ladders or crates: this search only accepts
 * a cell when the rotated hull footprint fits there *and* on the segment leading to
 * it, using the vehicle deck (`vehicleGroundAt`) rather than the infantry support
 * height. The expansion budget covers the entire 300 m battlefield, so a reachable
 * goal is never silently truncated — the old 750-cell cap made nearly every
 * cross-map route return a two-point path into a dead end (the river bank beside
 * the red house), which is exactly where the AI tanks then wedged themselves.
 */
export function planVehicleRouteDetailed(arena:Arena,start:Point,target:Point,hull:Hull,goalRadius:number,options:VehicleRouteOptions={}):VehicleRoute {
  const step=options.step??4, margin=options.margin??.7, world=options.world??vehicleWorld(arena);
  const {minX,maxX,minZ,maxZ}=arena.bounds;
  const width=Math.max(1,Math.floor((maxX-minX)/step)+1),depth=Math.max(1,Math.floor((maxZ-minZ)/step)+1);
  const cells=width*depth;
  const cell=(x:number,z:number)=>{
    const ix=Math.min(width-1,Math.max(0,Math.round((x-minX)/step)));
    const iz=Math.min(depth-1,Math.max(0,Math.round((z-minZ)/step)));
    return iz*width+ix;
  };
  const point=(key:number):Point=>({x:minX+(key%width)*step,z:minZ+Math.floor(key/width)*step});
  const distance=(x:number,z:number)=>Math.hypot(target.x-x,target.z-z);

  const cost=new Float64Array(cells).fill(Infinity),parent=new Int32Array(cells).fill(-1);
  const estimate=new Float64Array(cells).fill(Infinity),closed=new Uint8Array(cells);
  const heights=new Float64Array(cells).fill(NaN);
  const clearance=new Map<number,boolean>();
  const ground=(x:number,z:number)=>vehicleDeck(world,x,z);

  const height=(key:number,x:number,z:number)=>{
    if (Number.isNaN(heights[key])) heights[key]=ground(x,z);
    return heights[key];
  };
  const clear=(x:number,z:number,y:number,yaw:number)=>{
    if (!Number.isFinite(y)) return false;
    // The hull must fit inside the battlefield: the map edge is a wall of its own.
    const halfX=Math.abs(Math.cos(yaw))*hull.w*.5+Math.abs(Math.sin(yaw))*hull.d*.5;
    const halfZ=Math.abs(Math.sin(yaw))*hull.w*.5+Math.abs(Math.cos(yaw))*hull.d*.5;
    if(x-halfX<minX||x+halfX>maxX||z-halfZ<minZ||z+halfZ>maxZ) return false;
    const water=arena.waterAt?.(x,z,y);
    if (water&&water.surface-y>1) return false;
    // Only near water: a hull can touch a channel its centre clears. Full hull,
    // slightly conservative depth: the ford's shallow spine is one 2 m cell wide and
    // a 5.3 m hull cannot hold that line, so vehicle routes stay on their own bank.
    if (water&&arena.waterAt){
      const c=Math.cos(yaw),s=Math.sin(yaw);
      for (const [side,end] of HULL_SUPPORT_POINTS){
        if(!side&&!end)continue;
        const px=x+side*hull.w*.5*c+end*hull.d*.5*s,pz=z-side*hull.w*.5*s+end*hull.d*.5*c;
        const h=ground(px,pz),w=arena.waterAt(px,pz,h);
        if (w&&w.surface-h>.9) return false;
      }
    }
    const grade=maxVehicleGrade(hull);
    return !arena.footprintBlocked?.(x,z,hull.w+margin,hull.d,yaw,y,hull.h,{min:y-grade,max:y+grade})&&!world.vehicleBlocks?.({x,z,yaw},hull,y,options.ignoreId,options.knownTeam);
  };
  const clearCached=(x:number,z:number,yaw:number)=>{
    const key=cell(x,z)*8+(((Math.round(yaw/(Math.PI/4))%8)+8)%8);
    let value=clearance.get(key);
    if (value===undefined) {
      const p=point(cell(x,z));
      value=clear(p.x,p.z,ground(p.x,p.z),yaw);
      clearance.set(key,value);
    }
    return value;
  };

  const heuristic=(x:number,z:number)=>distance(x,z)*1.15;
  const open=minHeap();
  const source=cell(start.x,start.z);
  cost[source]=0;estimate[source]=heuristic(start.x,start.z);open.push(estimate[source],source);
  let closest=source,closestDistance=distance(start.x,start.z),expanded=0;
  const maxExpansions=options.maxExpansions??Math.max(960,Math.min(cells,14000));

  // Hull already embedded (spawn/collision shove): seed the nearest clear cell so
  // the search still produces a route instead of failing with an empty path.
  if (!clear(start.x,start.z,ground(start.x,start.z),Math.atan2(target.x-start.x,target.z-start.z))) {
    const sx=source%width,sz=Math.floor(source/width);
    let best=-1,bestScore=Infinity;const maxRing=4;
    for (let dz=-maxRing;dz<=maxRing;dz++)for (let dx=-maxRing;dx<=maxRing;dx++) {
      const ix=sx+dx,iz=sz+dz;
      if (ix<0||ix>=width||iz<0||iz>=depth) continue;
      const key=iz*width+ix,p=point(key);
      if (!clear(p.x,p.z,ground(p.x,p.z),Math.atan2(target.x-p.x,target.z-p.z))) continue;
      const score=Math.hypot(p.x-start.x,p.z-start.z);
      if (score<bestScore){bestScore=score;best=key;}
    }
    if (best>=0) {
      const p=point(best),seedCost=Math.hypot(p.x-start.x,p.z-start.z)+2;
      cost[best]=seedCost;parent[best]=-1;estimate[best]=seedCost+heuristic(p.x,p.z);
      open.push(estimate[best],best);
      if (distance(p.x,p.z)<closestDistance){closest=best;closestDistance=distance(p.x,p.z);}
    }
  }

  while (open.size&&expanded<maxExpansions) {
    const key=open.pop();
    if (closed[key]) continue;
    closed[key]=1;expanded++;
    const p=key===source?start:point(key),d=distance(p.x,p.z);
    if (d<closestDistance){closest=key;closestDistance=d;}
    if (d<goalRadius) break;
    const y=height(key,p.x,p.z);
    for (const [dx,dz] of directions) {
      const ix=key%width+dx,iz=Math.floor(key/width)+dz;
      if (ix<0||ix>=width||iz<0||iz>=depth) continue;
      const next=iz*width+ix;
      if (closed[next]) continue;
      const q=point(next),rise=height(next,q.x,q.z)-y;
      if (!Number.isFinite(rise)||rise>1||rise< -1.5) continue;
      const yaw=Math.atan2(q.x-p.x,q.z-p.z);
      const travel=Math.hypot(q.x-p.x,q.z-p.z),candidate=cost[key]+travel+Math.abs(rise)*4;
      if (candidate>=cost[next]) continue;
      const mx=(p.x+q.x)*.5,mz=(p.z+q.z)*.5,my=ground(mx,mz);
      if (my>Math.max(y,y+rise)+.5) continue;
      if (!clear(mx,mz,my,yaw)||!clearCached(q.x,q.z,yaw)) continue;
      cost[next]=candidate;parent[next]=key;estimate[next]=candidate+heuristic(q.x,q.z);
      open.push(estimate[next],next);
    }
  }

  const points:Point[]=[];
  for (let key=closest;key!==source&&key>=0;key=parent[key]) points.push(point(key));
  points.reverse();
  return {points,reached:closestDistance<goalRadius,closestDistance,expanded};
}

/** Backwards-compatible wrapper: waypoints only. */
export function planVehicleRoute(arena:Arena,start:Point,target:Point,hull:Hull,goalRadius:number,options?:VehicleRouteOptions):Point[]{
  return planVehicleRouteDetailed(arena,start,target,hull,goalRadius,options).points;
}

/**
 * True when a straight hull move between two points stays clear at every sample.
 * `margin` fattens the hull: corner-cutting a wall by 5 cm is legal geometry but a
 * tank cannot hold that line, which is how hulls ended up scraping house corners.
 */
export function vehicleSegmentClear(arena:Arena,ax:number,az:number,bx:number,bz:number,hull:Hull,steps=2,margin=0,traffic?:{world:MotionWorld;ignoreId:string;knownTeam?:string}):boolean{
  const world=traffic?.world??vehicleWorld(arena),length=Math.hypot(bx-ax,bz-az),yaw=Math.atan2(bx-ax,bz-az);
  const count=Math.max(1,Math.ceil(length/steps));
  const grade=maxVehicleGrade(hull);
  const width=hull.w+margin, depth=hull.d+margin*.8;
  for (let i=1;i<=count;i++){
    const x=ax+(bx-ax)*i/count,z=az+(bz-az)*i/count,y=world.ground(x,z);
    if (!Number.isFinite(y)) return false;
    if(traffic&&world.vehicleBlocks?.({x,z,yaw},hull,y,traffic.ignoreId,traffic.knownTeam))return false;
    const water=arena.waterAt?.(x,z,y);
    if (water&&water.surface-y>1) return false;
    if (arena.footprintBlocked?.(x,z,width,depth,yaw,y+0.04,hull.h,{min:y-grade,max:y+grade})) return false;
  }
  return true;
}

/**
 * String-pull a grid path: keep only the corners that are actually needed.
 * A 4 m staircase of cells makes a tracked hull weave; long straight pulls let the
 * driver hold a gear instead of correcting every cell.
 */
export function smoothVehicleRoute(arena:Arena,start:Point,path:Point[],hull:Hull,traffic?:{world:MotionWorld;ignoreId:string;knownTeam?:string}):Point[]{
  if (path.length<2) return path;
  const out:Point[]=[];
  let anchor=start,index=-1;
  while (index<path.length-1) {
    let next=index+1;
    // Probe a bounded window: a tank only needs a long pull, not a global shortcut,
    // and unbounded string-pulling costs more footprint queries than the A* itself.
    const last=Math.min(path.length-1,index+7);
    for (let probe=last;probe>index+1;probe--) {
      if (Math.hypot(path[probe].x-anchor.x,path[probe].z-anchor.z)>26) continue;
      if (vehicleSegmentClear(arena,anchor.x,anchor.z,path[probe].x,path[probe].z,hull,2.6,traffic ? .4 : 1.2,traffic)) {next=probe;break;}
    }
    out.push(path[next]);
    anchor=path[next];
    index=next;
    if (out.length>64) break;
  }
  return out;
}
