import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {findBridgeWaterCrossing} from '../src/game/ai/water-crossing';
import {PlayerController} from '../src/game/player/controller';
import {getMap} from '../src/maps';
import {buildVoxelMapData} from '../src/game/world/voxel-map-data';
import {VoxelWorldQueries} from '../src/game/world/voxel-world-queries';
import type {Arena} from '../src/game/world/arena';

const map=getMap('broken_bridge')!,q=new VoxelWorldQueries(buildVoxelMapData(map));
const arena={mapId:map.id,bounds:{minX:1,maxX:299,minZ:1,maxZ:299},
  navigationHeight:(x:number,z:number)=>q.navigationHeight(x,z),heightAt:(x:number,z:number)=>q.height(x,z),
  supportAt:(x:number,z:number,y:number)=>q.support(x,z,y),blockedAt:(x:number,z:number,r:number,y:number,h?:number)=>q.blocked(x,z,r,y,h),
  waterAt:(x:number,z:number,y?:number)=>q.water(x,z,y),waterExitAt:(x:number,z:number)=>q.waterExit(x,z)} as Arena;

describe('bridge water crossings',()=>{
  it.each([{from:{x:200,z:120},goal:{x:105,z:195}},{from:{x:90,z:180},goal:{x:195,z:105}}])('swims from $from to the opposite bank',({from,goal})=>{
    const crossing=findBridgeWaterCrossing(arena,from,goal,3);
    expect(crossing).not.toBeNull();
    const c=crossing!,p=new PlayerController(new THREE.PerspectiveCamera());
    p.teleport(new THREE.Vector3(c.x,q.navigationHeight(c.x,c.nearZ),c.nearZ));
    let entered=false,exited=false;
    for(let i=0;i<60*45;i++){
      const water=q.water(p.position.x,p.position.z,p.position.y);
      if(water&&p.position.y<water.surface-.015)entered=true;
      if(entered&&!water&&p.grounded&&c.direction*(p.position.z-150)>5){exited=true;break;}
      const pastMiddle=c.direction*(p.position.z-150)>5;
      const exit=entered&&pastMiddle?q.waterExit(p.position.x,p.position.z):null;
      const x=exit?.x??c.x,z=exit?.z??(entered?c.farZ:c.entryZ),dx=x-p.position.x,dz=z-p.position.z;
      p.yaw=Math.atan2(-dx,-dz);
      p.update(1/60,{worldMove:{x:dx,z:dz},down:k=>k==='KeyW'||k==='ShiftLeft'||(entered&&(i<360&&!pastMiddle?k==='AltLeft':k==='Space')),consumeLook:()=>({x:0,y:0})},arena,true);
    }
    expect({entered,exited,position:p.position.toArray(),crossing:c}).toMatchObject({entered:true,exited:true});
  });
});
