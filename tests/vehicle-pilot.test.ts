import {describe,it,expect} from 'vitest';
import {VehiclePilot,type VehicleGoal} from '../src/game/ai/vehicle-pilot';
import {advanceVehiclePose,vehiclePoseBlocked,type MotionWorld} from '../src/game/vehicles/motion';
import {vehicleSize} from '../src/game/vehicles/controller';
import {vehicleWorld} from '../src/game/ai/vehicle-navigation';
import {WorldQueries} from '../src/game/world/queries';
import type {Arena} from '../src/game/world/arena';
import {getMap} from '../src/maps';
import {buildVoxelMapData} from '../src/game/world/voxel-map-data';
import {VoxelWorldQueries} from '../src/game/world/voxel-world-queries';

interface SimResult {end:{x:number;z:number};displacement:number;worstStuck:number;distanceToGoal:number;giveUp:boolean;reason:string;embedded:boolean;}

/** Mirrors the engine: AI decisions at ~150 ms, physics at a fixed 1/60 step. */
function drive(arena:Arena,world:MotionWorld,kind:string,start:{x:number;z:number;yaw:number},goal:VehicleGoal,seconds:number):SimResult{
  const v={x:start.x,z:start.z,yaw:start.yaw,speed:0,steering:0};
  const pilot=new VehiclePilot(kind,world,arena);
  const dt=1/60;let think=0,planAt=0,command={throttle:0,steer:0},sample={x:v.x,z:v.z},sampleAt=0,stuck=0,worst=0;
  for(let i=0;i<seconds*60;i++){
    const now=i*dt*1000;
    if(now>=think){
      think=now+150;
      if(pilot.needsPlan){
        if(now>=planAt){planAt=now+180;pilot.plan(v,goal,now);}
      }else{
        const c=pilot.tick(v,goal,now);
        command={throttle:c.throttle,steer:c.steer};
        if(c.giveUp)break;
      }
    }
    advanceVehiclePose(world,v,kind,command.throttle,command.steer,dt,'test');
    if(now-sampleAt>=500){
      sampleAt=now;
      if(Math.hypot(v.x-sample.x,v.z-sample.z)<.3&&Math.abs(command.throttle)>.2)stuck++;else stuck=0;
      worst=Math.max(worst,stuck);sample={x:v.x,z:v.z};
    }
  }
  return {end:{x:v.x,z:v.z},displacement:Math.hypot(v.x-start.x,v.z-start.z),worstStuck:worst*.5,
    distanceToGoal:Math.hypot(goal.x-v.x,goal.z-v.z),giveUp:pilot.giveUp,reason:pilot.giveUpReason,
    embedded:vehiclePoseBlocked(world,vehicleSize(kind),{x:v.x,z:v.z,yaw:v.yaw},{from:v,ignoreId:'test'})};
}

function synthetic(size:number,boxes:{x:number;z:number;w:number;d:number}[]):Arena{
  const q=new WorldQueries(boxes.map(b=>({...b,rot:0,bottom:0,top:4})),()=>0);
  return {bounds:{minX:0,maxX:size,minZ:0,maxZ:size},navigationHeight:()=>0,heightAt:()=>0,supportAt:()=>0,
    footprintBlocked:(x:number,z:number,w:number,d:number,yaw:number,feet:number,height:number)=>q.footprintBlocked(x,z,w,d,yaw,feet,height),waterAt:()=>null} as unknown as Arena;
}

describe('vehicle AI pilot',()=>{
  it('drives round a wall that blocks the direct line instead of grinding into it',()=>{
    const arena=synthetic(60,[{x:30,z:15,w:2,d:24}]); // wall with a gap at its north end
    const r=drive(arena,vehicleWorld(arena),'light_tank',{x:30,z:5,yaw:0},{id:'g',x:30,z:40,radius:4},30);
    expect(r.distanceToGoal).toBeLessThan(12);
    expect(r.worstStuck).toBeLessThan(4);
    expect(r.embedded).toBe(false);
  });

  it('routes around a stationary friendly hull using the same live occupancy as physics',()=>{
    const arena=synthetic(70,[]),world=vehicleWorld(arena);
    const obstacle=new WorldQueries([{x:30,z:28,w:2.8,d:5.4,rot:0,bottom:0,top:2.4}],()=>0);
    world.vehicleBlocks=(p,h)=>obstacle.footprintBlocked(p.x,p.z,h.w,h.d,p.yaw,0,h.h);
    const pilot=new VehiclePilot('light_tank',world,arena),v={x:30,z:12,yaw:0,speed:0,steering:0},goal={id:'front',x:30,z:55,radius:4};
    pilot.vehicleId='follower';
    for(let i=0;i<60*35;i++){
      const now=i*1000/60;if(pilot.needsPlan)pilot.plan(v,goal,now,true);
      const command=pilot.tick(v,goal,now);advanceVehiclePose(world,v,'light_tank',command.throttle,command.steer,1/60,'follower');
      expect(vehiclePoseBlocked(world,vehicleSize('light_tank'),v,{from:v,ignoreId:'follower'})).toBe(false);
    }
    expect(Math.hypot(v.x-goal.x,v.z-goal.z)).toBeLessThan(6);
  });

  it('backs out and turns round instead of stalling on a hull that starts nose-first in a wall',()=>{
    const arena=synthetic(60,[{x:20,z:20,w:6,d:2}]);
    const r=drive(arena,vehicleWorld(arena),'light_tank',{x:20,z:17.5,yaw:Math.PI},{id:'g',x:20,z:5,radius:3},20);
    expect(r.displacement).toBeGreaterThan(6);
    expect(r.embedded).toBe(false);
  });

  it('turns a wheeled hull round when the goal is directly behind it',()=>{
    const arena=synthetic(60,[]);
    const r=drive(arena,vehicleWorld(arena),'jeep',{x:30,z:30,yaw:Math.PI},{id:'g',x:30,z:10,radius:3},15);
    expect(r.displacement).toBeGreaterThan(8);
    expect(r.embedded).toBe(false);
  });
});

describe('vehicle AI on the broken bridge map',()=>{
  const map=getMap('broken_bridge')!;
  const data=buildVoxelMapData(map);
  const q=new VoxelWorldQueries(data);
  const arena={bounds:{minX:1,maxX:map.size-1,minZ:1,maxZ:map.size-1},
    navigationHeight:(x:number,z:number)=>q.navigationHeight(x,z),
    heightAt:(x:number,z:number)=>q.height(x,z),
    supportAt:(x:number,z:number,max:number)=>q.support(x,z,max),
    vehicleGroundAt:(x:number,z:number)=>q.primary(x,z),
    footprintBlocked:(x:number,z:number,w:number,d:number,yaw:number,feet:number,h:number,terrain?:{min:number;max:number})=>q.footprint(x,z,w,d,yaw,feet,h,terrain),
    waterAt:(x:number,z:number,feet?:number)=>q.water(x,z,feet)} as unknown as Arena;
  const world=vehicleWorld(arena);

  it('drives the AI tank out of the red-house slope without wedging in the wall',()=>{
    // The reported spot: on the slope west of house-e, nose pointing north at it.
    const r=drive(arena,world,'light_tank',{x:181,z:197,yaw:Math.PI},{id:'A',x:105,z:195,radius:12},30);
    expect(r.displacement).toBeGreaterThan(25);
    expect(r.worstStuck).toBeLessThan(5);
    expect(r.embedded).toBe(false);
  });

  it.each(['motorcycle','jeep'])('drives an orange %s out of its base toward the town',kind=>{
    const start=kind==='motorcycle'?{x:98,z:250,yaw:Math.PI}:{x:118,z:250,yaw:Math.PI};
    const result=drive(arena,world,kind,start,{id:'A',x:105,z:195,radius:12},45);
    expect(result.distanceToGoal).toBeLessThan(24);
    expect(result.embedded).toBe(false);
  });

  it('takes the blue tank from the reported C-slope queue through the bridge entrance',()=>{
    const r=drive(arena,world,'light_tank',{x:193,z:84,yaw:0},{id:'A',x:105,z:195,radius:12},60);
    expect(r.end.z).toBeGreaterThan(170);
    expect(r.embedded).toBe(false);
  });

  it('brings an orange tank from its pad onto the bridge',()=>{
    const result=drive(arena,world,'light_tank',{x:202,z:250,yaw:Math.PI},{id:'B',x:130,z:150,radius:5},90);
    expect(result.end.z).toBeLessThan(170);
    expect(result.embedded).toBe(false);
  });

  it('brings the orange crewed tank from its pad towards the town objective',()=>{
    const r=drive(arena,world,'light_tank',{x:202.8,z:252.9,yaw:4.712},{id:'A',x:105,z:195,radius:12},45);
    expect(r.displacement).toBeGreaterThan(40);
    expect(r.embedded).toBe(false);
  });
});
