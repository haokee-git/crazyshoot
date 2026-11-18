import {beforeAll,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import {MAPS} from '../src/maps/index';
import {BLOCK,blockAt,buildVoxelMapData,isSolidBlock,type TerrainData} from '../src/game/world/voxel-map-data';
import type {Arena} from '../src/game/world/arena';
import type {BuildingInteriorPlan,InteriorDecorPlane,InteriorDoorPlan,Rect,StairPlan,WallSide} from '../src/game/world/interior-types';
import {VoxelWorldQueries} from '../src/game/world/voxel-world-queries';
import {PlayerController} from '../src/game/player/controller';
import type {Building,MapDef} from '../src/maps/types';
import {INTERIOR_TEXTURE_NAMES,interiorUrl,type InteriorTextureName} from '../src/content/materials/interiors';

vi.setConfig({testTimeout:120_000,hookTimeout:120_000});

const EPS=1e-6;
const DOOR_YAW:Record<WallSide,number>={south:Math.PI,north:0,west:-Math.PI/2,east:Math.PI/2};
const STAIR_YAW:Record<StairPlan['dir'],number>={'+x':-Math.PI/2,'-x':Math.PI/2,'+z':Math.PI,'-z':0};
const DECOR_TEXTURE:Record<InteriorDecorPlane['kind'],InteriorTextureName>={
 rug:'rug',art:'wall-art',map:'wall-map',sign:'industrial-sign',
};
const DECOR_HEIGHT:Record<'art'|'map'|'sign',number>={art:1.62,map:1.65,sign:2.02};

interface World{map:MapDef;data:TerrainData;queries:VoxelWorldQueries;plans:Map<string,BuildingInteriorPlan>;buildings:Map<string,Building>;openIds:Set<string>;}
interface PlanEntry{world:World;plan:BuildingInteriorPlan;}

let worlds:World[]=[];

beforeAll(()=>{
 // 千户苗寨使用 authored 吊脚楼内构（miaoHousePlan + miao-walk.test），
 // 不是通用 1 m 方块 interior 生成；旧四图/法老继续跑通用契约。
 worlds=MAPS.filter(map=>map.extensions?.interiorSystem!=='authored').map(map=>{
  const data=buildVoxelMapData(map);
  return {
   map,data,queries:new VoxelWorldQueries(data),
   plans:new Map((data.interiors??[]).map(plan=>[plan.id,plan])),
   buildings:new Map(map.buildings.map(building=>[building.id,building])),
   openIds:new Set(map.buildings.filter(building=>building.roof==='open').map(building=>building.id)),
  };
 });
},120_000);

const entries=():PlanEntry[]=>worlds.flatMap(world=>(world.data.interiors??[]).map(plan=>({world,plan})));
const isOpen=(entry:PlanEntry)=>entry.world.openIds.has(entry.plan.id);
const roofed=():PlanEntry[]=>entries().filter(entry=>!isOpen(entry));

const rectInside=(inner:Rect,outer:Rect)=>inner.x0>=outer.x0-EPS&&inner.x1<=outer.x1+EPS&&inner.z0>=outer.z0-EPS&&inner.z1<=outer.z1+EPS;
const overlaps=(a:Rect,b:Rect)=>a.x0<b.x1-EPS&&a.x1>b.x0+EPS&&a.z0<b.z1-EPS&&a.z1>b.z0+EPS;
const expand=(r:Rect,m:number):Rect=>({x0:r.x0-m,z0:r.z0-m,x1:r.x1+m,z1:r.z1+m});
const pointInside=(r:Rect,x:number,z:number)=>x>=r.x0-EPS&&x<=r.x1+EPS&&z>=r.z0-EPS&&z<=r.z1+EPS;
const propRect=(prop:{x:number;z:number;w:number;d:number}):Rect=>({x0:prop.x-prop.w/2,z0:prop.z-prop.d/2,x1:prop.x+prop.w/2,z1:prop.z+prop.d/2});
const centre=(r:Rect)=>({x:(r.x0+r.x1)/2,z:(r.z0+r.z1)/2});

/** A point 2.5 m outside the exterior wall, on the door's centre line. */
function outsidePoint(plan:BuildingInteriorPlan,door:InteriorDoorPlan,distance=2.5){
 if(door.side==='south')return{x:door.cx,z:plan.z0-distance};
 if(door.side==='north')return{x:door.cx,z:plan.z1+distance};
 if(door.side==='west')return{x:plan.x0-distance,z:door.cz};
 return{x:plan.x1+distance,z:door.cz};
}

/** A point `distance` inside the exterior wall, on the door's centre line. */
function insidePoint(plan:BuildingInteriorPlan,door:InteriorDoorPlan,distance=2.5){
 if(door.side==='south')return{x:door.cx,z:plan.z0+distance};
 if(door.side==='north')return{x:door.cx,z:plan.z1-distance};
 if(door.side==='west')return{x:plan.x0+distance,z:door.cz};
 return{x:plan.x1-distance,z:door.cz};
}

function flankingCells(door:InteriorDoorPlan){
 if(door.side==='south'||door.side==='north'){
  return [{x:Math.floor(door.a0)-1,z:Math.floor(door.cz)},{x:Math.floor(door.a1),z:Math.floor(door.cz)}];
 }
 return [{x:Math.floor(door.cx),z:Math.floor(door.a0)-1},{x:Math.floor(door.cx),z:Math.floor(door.a1)}];
}

/** Centre of the k-th 1 m step cell (k = 1..4). */
function stepCell(stair:StairPlan,k:number){
 if(stair.dir==='+x')return{x:stair.landing.x1+(k-1)+0.5,z:(stair.z0+stair.z1)/2};
 if(stair.dir==='-x')return{x:stair.landing.x0-k+0.5,z:(stair.z0+stair.z1)/2};
 if(stair.dir==='+z')return{x:(stair.x0+stair.x1)/2,z:stair.landing.z1+(k-1)+0.5};
 return{x:(stair.x0+stair.x1)/2,z:stair.landing.z0-k+0.5};
}

function arenaFor(world:World):Arena{
 return {
  bounds:{minX:1,maxX:world.map.size-1,minZ:1,maxZ:world.map.size-1},
  heightAt:(x:number,z:number)=>world.queries.height(x,z),
  supportAt:(x:number,z:number,max:number)=>world.queries.support(x,z,max),
  blockedAt:(x:number,z:number,r:number,feet:number,height?:number)=>world.queries.blocked(x,z,r,feet,height),
  blocked:()=>false,
  waterAt:(x:number,z:number,feet:number)=>world.queries.water(x,z,feet),
  ladders:world.data.ladders??[],
 } as unknown as Arena;
}

const walkInput={down:(code:string)=>code==='KeyW',consumeLook:()=>({x:0,y:0})};

describe('enterable buildings across all four maps',()=>{
 it('every roofed building has one or two real doorways cut clean through the walls',()=>{
  const problems:string[]=[];
  let doors=0;
  for(const {world,plan} of roofed()){
   const tag=`${world.map.id}/${plan.id}`;
   if(plan.doors.length<1||plan.doors.length>2)problems.push(`${tag}: ${plan.doors.length} doors (expected 1-2)`);
   for(const door of plan.doors){
    doors++;
    for(let y=door.y0;y<door.y1;y++){
     const block=blockAt(world.data,door.cx,y,door.cz);
     if(block!==BLOCK.AIR)problems.push(`${tag}: ${door.side} door opening (${door.cx},${y},${door.cz}) is block ${block}, not AIR`);
    }
    for(const [index,cell] of flankingCells(door).entries()){
     const block=blockAt(world.data,cell.x,door.y0,cell.z);
     if(!isSolidBlock(block))problems.push(`${tag}: ${door.side} door flank ${index} (${cell.x},${door.y0},${cell.z}) is not solid (block ${block})`);
    }
   }
  }
  expect(doors).toBeGreaterThan(0);
  expect(problems).toEqual([]);
 });

 it('every roofed interior has a real floor slab and reachable standing room',()=>{
  const problems:string[]=[];
  let rooms=0;
  for(const {world,plan} of roofed()){
   const tag=`${world.map.id}/${plan.id}`;
   const top=plan.floorTop;
   const {x:cx,z:cz}=centre(plan.interior);
   rooms++;
   if(!isSolidBlock(blockAt(world.data,cx,top-1,cz)))problems.push(`${tag}: interior centre (${cx},${top-1},${cz}) is not a solid floor slab`);
   // Authored interior covers (plan.obstacles) may own the exact centre, so the
   // contract is that a standable cell exists within 3 m of the centre.
   let standable:null|{x:number;z:number}=null;
   for(let dz=-3;dz<=3&&!standable;dz++)for(let dx=-3;dx<=3;dx++){
    const x=cx+dx,z=cz+dz;
    if(!pointInside(plan.interior,x,z))continue;
    if(!world.queries.blocked(x,z,.38,top,1.8)){standable={x,z};break;}
   }
   if(!standable)problems.push(`${tag}: no standable cell within centre +/-3 m of ${JSON.stringify(plan.interior)} at y=${top}`);
   // The door tunnel plus its first metre must be walkable. The 1.5 m point sits
   // inside the wall/door depth, so authored props further inside (e.g. the
   // ne-warehouse gantry leg) cannot make this a false negative.
   for(const door of plan.doors){
    const landing=insidePoint(plan,door,1.5);
    if(!pointInside(plan,landing.x,landing.z))problems.push(`${tag}: ${door.side} inner landing (${landing.x},${landing.z}) lies outside the building footprint`);
    else if(world.queries.blocked(landing.x,landing.z,.38,top,1.8))problems.push(`${tag}: ${door.side} inner landing (${landing.x},${landing.z}) is blocked at y=${top}`);
   }
  }
  expect(rooms).toBeGreaterThan(0);
  expect(problems).toEqual([]);
 });

 it('a real player controller can walk in from 2.5 m outside every door',()=>{
  const problems:string[]=[];
  let walks=0;
  for(const {world,plan} of roofed()){
   for(const door of plan.doors){
    walks++;
    const tag=`${world.map.id}/${plan.id} ${door.side}`;
    const start=outsidePoint(plan,door,2.5);
    const startY=world.queries.height(start.x,start.z);
    if(!Number.isFinite(startY)){problems.push(`${tag}: no terrain height at start (${start.x},${start.z})`);continue;}
    const player=new PlayerController(new THREE.PerspectiveCamera());
    player.teleport(new THREE.Vector3(start.x,startY+.02,start.z),DOOR_YAW[door.side]);
    const arena=arenaFor(world);
    let entered=false;
    for(let frame=0;frame<300;frame++){
     player.update(1/60,walkInput,arena,true);
     const inside=pointInside(plan.interior,player.position.x,player.position.z);
     if(inside&&Math.abs(player.position.y-plan.floorTop)<=.06){entered=true;break;}
    }
    if(!entered){
     const p=player.position;
     problems.push(`${tag}: walking 5 s from (${start.x},${startY},${start.z}) stopped at (${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}), interior=${JSON.stringify(plan.interior)} floorTop=${plan.floorTop}`);
    }
   }
  }
  expect(walks).toBeGreaterThan(0);
  expect(problems).toEqual([]);
 });

 it('every two-storey building has a 4-step, 1 m-rise staircase with a matching stairwell opening',()=>{
  const problems:string[]=[];
  let stairs=0;
  for(const {world,plan} of roofed()){
   if(plan.floors!==2)continue;
   const tag=`${world.map.id}/${plan.id}`;
   const upper=plan.upperFloorTop;
   if(upper===null){problems.push(`${tag}: two floors but upperFloorTop is null`);continue;}
   if(!plan.stair){problems.push(`${tag}: two floors but no staircase plan`);continue;}
   stairs++;
   const stair=plan.stair;
   const alongX=stair.dir==='+x'||stair.dir==='-x';
   if(stair.steps!==4)problems.push(`${tag}: staircase has ${stair.steps} steps (expected 4)`);
   if(Math.abs(stair.bottom-plan.floorTop)>EPS)problems.push(`${tag}: staircase bottom ${stair.bottom} != floorTop ${plan.floorTop}`);
   if(Math.abs(stair.top-upper)>EPS)problems.push(`${tag}: staircase top ${stair.top} != upperFloorTop ${upper}`);
   const openingAlong0=alongX?stair.opening.x0:stair.opening.z0;
   const openingAlong1=alongX?stair.opening.x1:stair.opening.z1;
   const crossLength=alongX?stair.opening.z1-stair.opening.z0:stair.opening.x1-stair.opening.x0;
   const expectedAlong0=stair.dir==='+x'?stair.landing.x1:stair.dir==='-x'?stair.landing.x0-4:stair.dir==='+z'?stair.landing.z1:stair.landing.z0-4;
   if(Math.abs(openingAlong1-openingAlong0-4)>EPS)problems.push(`${tag}: stairwell opening run ${openingAlong1-openingAlong0} m (expected 4)`);
   if(Math.abs(crossLength-2)>EPS)problems.push(`${tag}: stairwell opening width ${crossLength} m (expected 2)`);
   if(Math.abs(openingAlong0-expectedAlong0)>EPS||Math.abs(openingAlong1-(expectedAlong0+4))>EPS)problems.push(`${tag}: stairwell opening ${JSON.stringify(stair.opening)} is not aligned with the 4 m step run from ${expectedAlong0}`);
   if(alongX?(Math.abs(stair.opening.z0-stair.z0)>EPS||Math.abs(stair.opening.z1-stair.z1)>EPS):(Math.abs(stair.opening.x0-stair.x0)>EPS||Math.abs(stair.opening.x1-stair.x1)>EPS))problems.push(`${tag}: stairwell opening does not span the staircase width`);
   for(let k=1;k<=4;k++){
    const cell=stepCell(stair,k);
    const top=plan.floorTop+k;
    const below=blockAt(world.data,cell.x,top-1,cell.z);
    if(!isSolidBlock(below))problems.push(`${tag}: step ${k} has no solid 1 m riser at (${cell.x},${top-1},${cell.z}) (block ${below})`);
    const above=blockAt(world.data,cell.x,top,cell.z);
    if(above!==BLOCK.AIR)problems.push(`${tag}: step ${k} headroom (${cell.x},${top},${cell.z}) is block ${above}, not AIR`);
   }
   // The upper slab is cut away over the steps, and still solid away from them.
   const first=stepCell(stair,1);
   const slabY=plan.floorTop+3;
   const overSteps=blockAt(world.data,first.x,slabY,first.z);
   if(overSteps!==BLOCK.AIR)problems.push(`${tag}: upper slab is not opened over the staircase (block ${overSteps} at ${first.x},${slabY},${first.z})`);
   const roomCentre=centre(plan.interior);
   const slab=blockAt(world.data,roomCentre.x,upper-1,roomCentre.z);
   if(!isSolidBlock(slab))problems.push(`${tag}: upper floor slab missing at interior centre (${roomCentre.x},${upper-1},${roomCentre.z})`);
  }
  expect(stairs).toBeGreaterThan(0);
  expect(problems).toEqual([]);
 });

 it('a real player controller can climb every staircase onto the upper floor',()=>{
  const problems:string[]=[];
  let climbs=0;
  for(const {world,plan} of roofed()){
   if(plan.floors!==2||!plan.stair||plan.upperFloorTop===null)continue;
   climbs++;
   const tag=`${world.map.id}/${plan.id}`;
   const stair=plan.stair;
   const landing=centre(stair.landing);
   const player=new PlayerController(new THREE.PerspectiveCamera());
   player.teleport(new THREE.Vector3(landing.x,plan.floorTop+.02,landing.z),STAIR_YAW[stair.dir]);
   const arena=arenaFor(world);
   let reached=false;
   for(let frame=0;frame<300;frame++){
    player.update(1/60,walkInput,arena,true);
    if(Math.abs(player.position.y-plan.upperFloorTop)<=.06){reached=true;break;}
   }
   const near=pointInside(expand(plan.interior,1),player.position.x,player.position.z);
   if(!reached||!near){
    const p=player.position;
    problems.push(`${tag}: stair ${stair.dir} from landing (${landing.x},${landing.z}) climbed to (${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}), target upperFloorTop=${plan.upperFloorTop}, near=${near}`);
   }
  }
  expect(climbs).toBeGreaterThan(0);
  expect(problems).toEqual([]);
 });

 it('upper-floor props rest on the real upper slab and stay inside the room',()=>{
  const problems:string[]=[];
  let props=0;
  for(const world of worlds)for(const prop of world.data.interiorProps??[]){
   if(prop.floor!==1)continue;
   props++;
   const tag=`${world.map.id}/${prop.buildingId}/${prop.id}`;
   const plan=world.plans.get(prop.buildingId);
   if(!plan){problems.push(`${tag}: prop references an unknown building`);continue;}
   const upper=plan.upperFloorTop;
   if(upper===null){problems.push(`${tag}: upper-floor prop in a single-storey building`);continue;}
   if(Math.abs(prop.bottom-upper)>EPS)problems.push(`${tag}: bottom ${prop.bottom} != upperFloorTop ${upper}`);
   const support=world.queries.support(prop.x,prop.z,upper+.01);
   if(Math.abs(support-upper)>.01)problems.push(`${tag}: support under prop (${prop.x},${prop.z}) is ${support}, expected ${upper} (floating or off-slab)`);
   if(!rectInside(propRect(prop),plan.interior))problems.push(`${tag}: prop AABB ${JSON.stringify(propRect(prop))} is outside interior ${JSON.stringify(plan.interior)}`);
   if(plan.stair&&overlaps(propRect(prop),plan.stair.opening))problems.push(`${tag}: prop overlaps the stairwell opening`);
  }
  expect(props).toBeGreaterThan(0);
  expect(problems).toEqual([]);
 });

 it('ground-floor props sit on the slab, clear of door lanes and stair openings',()=>{
  const problems:string[]=[];
  let props=0;
  for(const world of worlds)for(const prop of world.data.interiorProps??[]){
   if(prop.floor!==0)continue;
   props++;
   const tag=`${world.map.id}/${prop.buildingId}/${prop.id}`;
   const plan=world.plans.get(prop.buildingId);
   if(!plan){problems.push(`${tag}: prop references an unknown building`);continue;}
   const rect=propRect(prop);
   if(Math.abs(prop.bottom-plan.floorTop)>EPS)problems.push(`${tag}: bottom ${prop.bottom} != floorTop ${plan.floorTop}`);
   const support=world.queries.support(prop.x,prop.z,plan.floorTop+.01);
   if(Math.abs(support-plan.floorTop)>.01)problems.push(`${tag}: support under prop (${prop.x},${prop.z}) is ${support}, expected ${plan.floorTop}`);
   if(!rectInside(rect,plan.interior))problems.push(`${tag}: prop AABB ${JSON.stringify(rect)} is outside interior ${JSON.stringify(plan.interior)}`);
   for(const [index,clear] of plan.doorClear.entries())if(overlaps(rect,clear))problems.push(`${tag}: prop blocks door lane ${index} ${JSON.stringify(clear)}`);
   if(plan.stair){
    const stair=plan.stair;
    if(overlaps(rect,expand({x0:stair.x0,z0:stair.z0,x1:stair.x1,z1:stair.z1},1)))problems.push(`${tag}: prop is within 1 m of the staircase footprint`);
    if(overlaps(rect,expand(stair.opening,1)))problems.push(`${tag}: prop is within 1 m of the stairwell opening`);
   }
  }
  expect(props).toBeGreaterThan(0);
  expect(problems).toEqual([]);
 });

 it('decor planes are non-colliding, correctly oriented and backed by shipped textures',()=>{
  const problems:string[]=[];
  const kinds=new Set<InteriorDecorPlane['kind']>();
  let planes=0;
  for(const world of worlds){
   const decor=world.data.interiorDecor??[];
   planes+=decor.length;
   const tagged=(world.data.detailBoxes??[]).filter(box=>/:decor:|:(rug|art|map|sign):/.test(box.id));
   if(tagged.length)problems.push(`${world.map.id}: ${tagged.length} decor planes leaked into detailBoxes (${tagged.map(box=>box.id).join(', ')})`);
   const summed=(world.data.interiors??[]).reduce((sum,plan)=>sum+plan.decorCount,0);
   if(summed!==decor.length)problems.push(`${world.map.id}: plan.decorCount sums to ${summed}, interiorDecor has ${decor.length}`);
   for(const plane of decor){
    kinds.add(plane.kind);
    const tag=`${world.map.id}/${plane.kind}@(${plane.x},${plane.y},${plane.z})`;
    const file=path.join(process.cwd(),'public',interiorUrl(DECOR_TEXTURE[plane.kind]));
    if(!fs.existsSync(file))problems.push(`${tag}: texture ${file} does not exist`);
    const owners=(world.data.interiors??[]).filter(plan=>pointInside(plan,plane.x,plane.z));
    if(!owners.length){problems.push(`${tag}: no building contains this decor plane`);continue;}
    if(plane.kind==='rug'){
     if(!owners.some(plan=>Math.abs(plane.y-(plan.floorTop+.02))<1e-6))problems.push(`${tag}: rug y must be floorTop+0.02 (owners floors ${owners.map(plan=>plan.floorTop).join(',')})`);
     if(Math.abs(plane.yaw)>1e-9)problems.push(`${tag}: rug must lie flat with yaw 0, got ${plane.yaw}`);
    }else{
     const offset=DECOR_HEIGHT[plane.kind];
     const matches=owners.some(plan=>Math.abs(plane.y-(plan.floorTop+offset))<1e-6||(plan.upperFloorTop!==null&&Math.abs(plane.y-(plan.upperFloorTop+offset))<1e-6));
     if(!matches)problems.push(`${tag}: vertical decor is not hung at floorTop+${offset} or upperFloorTop+${offset}`);
     if(!(plane.w>=.9&&plane.w<=2&&plane.h>=.5&&plane.h<=1.2))problems.push(`${tag}: implausible wall decor size ${plane.w}x${plane.h}`);
     if(Math.abs(Math.sin(2*plane.yaw))>1e-9)problems.push(`${tag}: vertical decor yaw ${plane.yaw} is not a wall-facing right angle`);
    }
   }
  }
  for(const name of INTERIOR_TEXTURE_NAMES){
   const file=path.join(process.cwd(),'public',interiorUrl(name));
   if(!fs.existsSync(file))problems.push(`interior texture ${name} is missing at ${file}`);
  }
  expect(planes).toBeGreaterThan(0);
  expect([...kinds].sort()).toEqual(['art','map','rug','sign']);
  expect(problems).toEqual([]);
 });

 it('prop counts match the spawned props and upper floors are never denser than the ground floor',()=>{
  const problems:string[]=[];
  let twoStorey=0;
  for(const {world,plan} of entries()){
   const tag=`${world.map.id}/${plan.id}`;
   const props=(world.data.interiorProps??[]).filter(prop=>prop.buildingId===plan.id);
   const ground=props.filter(prop=>prop.floor===0).length;
   const upper=props.filter(prop=>prop.floor===1).length;
   if(plan.propCounts[0]!==ground||plan.propCounts[1]!==upper)problems.push(`${tag}: plan.propCounts=${plan.propCounts.join('/')} but props are ${ground}/${upper}`);
   if(plan.floors===2){
    twoStorey++;
    if(plan.upperFloorTop===null)problems.push(`${tag}: two floors but upperFloorTop is null`);
    if(!plan.stair)problems.push(`${tag}: two floors but no staircase`);
    if(plan.propCounts[1]>plan.propCounts[0])problems.push(`${tag}: upper floor has more props (${plan.propCounts[1]}) than the ground floor (${plan.propCounts[0]})`);
   }else{
    if(plan.upperFloorTop!==null)problems.push(`${tag}: single-storey building has upperFloorTop ${plan.upperFloorTop}`);
    if(plan.stair)problems.push(`${tag}: single-storey building has a staircase`);
    if(plan.propCounts[1]!==0)problems.push(`${tag}: single-storey building has ${plan.propCounts[1]} upper-floor props`);
   }
  }
  expect(twoStorey).toBeGreaterThan(0);
  expect(problems).toEqual([]);
 });

 it('open sheds stay single-storey with no doors, windows or stairs',()=>{
  const problems:string[]=[];
  const open:PlanEntry[]=[];
  for(const world of worlds)for(const building of world.map.buildings){
   const plan=world.plans.get(building.id);
   if(!plan){problems.push(`${world.map.id}/${building.id}: map building has no interior plan`);continue;}
   if(building.roof==='open')open.push({world,plan});
  }
  for(const {world,plan} of entries())if(!world.buildings.has(plan.id))problems.push(`${world.map.id}/${plan.id}: interior plan has no matching map building`);
  for(const {world,plan} of open){
   const tag=`${world.map.id}/${plan.id}`;
   if(plan.floors!==1)problems.push(`${tag}: open shed has ${plan.floors} floors`);
   if(plan.upperFloorTop!==null)problems.push(`${tag}: open shed has an upper floor`);
   if(plan.stair)problems.push(`${tag}: open shed has a staircase`);
   if(plan.doors.length)problems.push(`${tag}: open shed has ${plan.doors.length} doors`);
   if(plan.windows.length)problems.push(`${tag}: open shed has ${plan.windows.length} windows`);
   if(plan.propCounts[1]!==0)problems.push(`${tag}: open shed has upper-floor props`);
   if((world.data.interiorProps??[]).some(prop=>prop.buildingId===plan.id&&prop.floor===1))problems.push(`${tag}: open shed spawned an upper-floor prop`);
  }
  expect(open.length).toBeGreaterThan(0);
  expect(problems).toEqual([]);
 });
});
