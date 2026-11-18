import {describe,it,expect} from 'vitest';
import {planVehicleRoute,planVehicleRouteDetailed,smoothVehicleRoute,vehicleSegmentClear} from '../src/game/ai/vehicle-navigation';
import {maxVehicleGrade} from '../src/game/vehicles/motion';
import {WorldQueries} from '../src/game/world/queries';
import type {Arena} from '../src/game/world/arena';
import {getMap} from '../src/maps';
import {buildVoxelMapData} from '../src/game/world/voxel-map-data';
import {VoxelWorldQueries} from '../src/game/world/voxel-world-queries';

const hull={w:2.8,d:5.3,h:2.3};

function syntheticArena(size:number,boxes:{x:number;z:number;w:number;d:number}[]):Arena{
  const q=new WorldQueries(boxes.map(b=>({...b,rot:0,bottom:0,top:4})),()=>0);
  return {bounds:{minX:0,maxX:size,minZ:0,maxZ:size},navigationHeight:()=>0,heightAt:()=>0,
    footprintBlocked:(x:number,z:number,w:number,d:number,yaw:number,feet:number,height:number)=>q.footprintBlocked(x,z,w,d,yaw,feet,height),
    waterAt:()=>null} as unknown as Arena;
}

describe('vehicle route planning',()=>{
  it('keeps the old behaviour: an armoured hull routes around a wall too narrow to pass',()=>{
    const arena=syntheticArena(40,[{x:20,z:20,w:22,d:1}]);
    const path=planVehicleRoute(arena,{x:20,z:8},{x:20,z:32},hull,3);
    expect(path.at(-1)).toEqual({x:20,z:32});
    expect(path.some(p=>p.x<=8||p.x>=32)).toBe(true);
  });

  it('reaches a goal that needs a long detour instead of returning a dead end',()=>{
    // A 240 m map: the old 750-cell cap truncated this before the detour.
    const arena=syntheticArena(240,[{x:120,z:40,w:2,d:80},{x:120,z:160,w:2,d:80}]);
    const route=planVehicleRouteDetailed(arena,{x:60,z:120},{x:180,z:120},hull,4);
    expect(route.reached).toBe(true);
    expect(route.points.length).toBeGreaterThan(10);
  });

  it('reports truncation and unreachable goals instead of pretending a dead end is a route',()=>{
    const capped=planVehicleRouteDetailed(syntheticArena(240,[]),{x:20,z:20},{x:220,z:220},hull,4,{maxExpansions:8});
    expect(capped.reached).toBe(false);
    const walled=syntheticArena(60,[{x:30,z:30,w:2,d:60}]);
    const route=planVehicleRouteDetailed(walled,{x:10,z:30},{x:50,z:30},hull,3);
    expect(route.reached).toBe(false);
    expect(route.closestDistance).toBeGreaterThan(10);
  });

  it('string-pulls a staircase route into a straight pull while staying clear',()=>{
    const arena=syntheticArena(80,[]);
    const grid: {x:number;z:number}[]=[];
    for(let i=1;i<=12;i++)grid.push({x:10+i*4,z:10+Math.round(i/3)*4});
    const smooth=smoothVehicleRoute(arena,{x:10,z:10},grid,hull);
    expect(smooth.length).toBeLessThan(grid.length);
    expect(smooth.at(-1)).toEqual(grid.at(-1));
    expect(vehicleSegmentClear(arena,10,10,smooth[0].x,smooth[0].z,hull,2)).toBe(true);
  });
});

describe('vehicle routes on the broken bridge map',()=>{
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

  it('plans the orange tank from its pad to the town capture point',()=>{
    const route=planVehicleRouteDetailed(arena,{x:202.8,z:252.9},{x:105,z:195},hull,7.8);
    expect(route.reached).toBe(true);
    // It must not cut through the red-brick house by the river.
    const house={x0:186,x1:204,z0:182,z1:196};
    expect(route.points.some(p=>p.x>house.x0&&p.x<house.x1&&p.z>house.z0&&p.z<house.z1)).toBe(false);
  });

  it('routes both teams from their tank pads onto and across the bridge',()=>{
    for(const start of [{x:202,z:60},{x:202,z:250}]){
      for(const target of [{x:130,z:150},{x:195,z:105},{x:105,z:195}]){
        const route=planVehicleRouteDetailed(arena,start,target,hull,target.z===150?3.25:7.8);
        expect(route.reached,`${JSON.stringify(start)} -> ${JSON.stringify(target)}`).toBe(true);
      }
    }
  });

  it('keeps every route sample on drivable grade for the hull',()=>{
    const route=planVehicleRoute(arena,{x:181,z:197},{x:105,z:195},hull,7.8);
    expect(route.length).toBeGreaterThan(3);
    for(const p of route){
      const y=q.primary(p.x,p.z);
      expect(Number.isFinite(y)).toBe(true);
      expect(Math.abs(y-(q.primary(p.x+3,p.z)??y))).toBeLessThan(maxVehicleGrade(hull)+1e-6);
    }
  });
});
