import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {Navigation} from '../src/game/world/navigation';
import {BLOCK,blockAt,buildVoxelMapData,fillVoxelWater,meshVoxelChunks,type TerrainData} from '../src/game/world/voxel-map-data';
import {brokenBridge} from '../src/maps/broken-bridge';
import {isWaterMaterial} from '../src/content/materials/battlefield';
import {PlayerController} from '../src/game/player/controller';
import type {Arena} from '../src/game/world/arena';
import {VoxelWorldQueries} from '../src/game/world/voxel-world-queries';
function world(width=8,depth=8,height=10,minY=-2):TerrainData{return {id:'test',size:width,step:1,minX:0,minZ:0,minY,width,depth,height,voxels:new Uint8Array(width*depth*height),heights:new Float32Array(width*depth),primary:new Float32Array(width*depth),water:new Float32Array(width*depth).fill(-32768),chunks:[]};}
function put(d:TerrainData,x:number,y:number,z:number,id:number){d.voxels[(z*d.width+x)*d.height+y-d.minY]=id;}
describe('Minecraft block world',()=>{
 it('uses solid cube tops for one-block steps',()=>{const d=world();put(d,2,0,2,BLOCK.STONE);const q=new VoxelWorldQueries(d);expect(q.blocked(2.5,2.5,.3,0)).toBe(true);expect(q.support(2.5,2.5,1.05)).toBe(1);expect(q.blocked(2.5,2.5,.3,1)).toBe(false);});
 it('steps onto one block at the leading foot without burying the body',()=>{const d=world();for(let x=0;x<8;x++)for(let z=0;z<8;z++)put(d,x,-1,z,BLOCK.GRASS);for(let x=2;x<5;x++)for(let z=0;z<8;z++)put(d,x,0,z,BLOCK.STONE);const q=new VoxelWorldQueries(d),camera=new THREE.PerspectiveCamera(),p=new PlayerController(camera);p.teleport(new THREE.Vector3(1.2,0,2.5),-Math.PI/2);const arena={heightAt:(x:number,z:number)=>q.height(x,z),supportAt:(x:number,z:number,h:number)=>q.support(x,z,h),blockedAt:(x:number,z:number,r:number,y:number)=>q.blocked(x,z,r,y),blocked:()=>false} as unknown as Arena;let stepped=false;for(let i=0;i<60;i++){p.update(1/60,{down:k=>k==='KeyW',consumeLook:()=>({x:0,y:0})},arena,true);if(p.position.y===1&&!stepped){stepped=true;expect(camera.position.y).toBeLessThan(2.5);}}expect(stepped).toBe(true);expect(p.position.x).toBeGreaterThan(4);});
 it('keeps a bridge deck and the surface below it separate',()=>{const d=world();put(d,2,-1,2,BLOCK.STONE);put(d,2,3,2,BLOCK.CONCRETE);d.primary[2*d.width+2]=4;d.water[2*d.width+2]=2;put(d,2,0,2,BLOCK.WATER);put(d,2,1,2,BLOCK.WATER);const q=new VoxelWorldQueries(d);expect(q.support(2.5,2.5,1.05)).toBe(0);expect(q.support(2.5,2.5,4.1)).toBe(4);expect(q.blocked(2.5,2.5,.3,0)).toBe(false);expect(q.water(2.5,2.5)).toBeNull();expect(q.water(2.5,2.5,0)?.surface).toBe(2);});
 it('continuously sweeps the nearest solid cube and ignores water as a wall',()=>{const d=world();put(d,2,1,2,BLOCK.WATER);put(d,4,1,2,BLOCK.STONE);const q=new VoxelWorldQueries(d);expect(q.ray(new THREE.Vector3(.5,1.5,2.5),new THREE.Vector3(1,0,0),20)).toBe(3.5);expect(q.ray(new THREE.Vector3(.5,7,2.5),new THREE.Vector3(1,0,0),20)).toBe(Infinity);});
 it('does not render internal faces across a chunk boundary',()=>{const d=world(128,1,1,0);put(d,63,0,0,BLOCK.STONE);put(d,64,0,0,BLOCK.STONE);const parts=meshVoxelChunks(d);let area=0;for(const c of parts){for(let i=0;i<c.index.length;i+=3){const a=new THREE.Vector3().fromArray(c.position,c.index[i]*3),b=new THREE.Vector3().fromArray(c.position,c.index[i+1]*3),v=new THREE.Vector3().fromArray(c.position,c.index[i+2]*3);area+=b.sub(a).cross(v.sub(a)).length()/2;}for(const value of c.position)expect(Number.isInteger(value)).toBe(true);for(let i=0;i<c.normal.length;i+=3)expect(Math.abs(c.normal[i])+Math.abs(c.normal[i+1])+Math.abs(c.normal[i+2])).toBe(1);}expect(area).toBe(10);});
 it('does not plan through a wall between coarse navigation nodes',()=>{const d=world(16,16,10,-2);for(let x=0;x<16;x++)for(let z=0;z<16;z++)put(d,x,-1,z,BLOCK.GRASS);for(let z=0;z<16;z++)for(let y=0;y<3;y++)put(d,5,y,z,BLOCK.STONE);const q=new VoxelWorldQueries(d),arena={bounds:{minX:1,maxX:15,minZ:1,maxZ:15},heightAt:(x:number,z:number)=>q.height(x,z),supportAt:(x:number,z:number,h:number)=>q.support(x,z,h),navigationHeight:(x:number,z:number)=>q.navigationHeight(x,z),blockedAt:(x:number,z:number,r:number,y:number)=>q.blocked(x,z,r,y),blocked:()=>false}as unknown as Arena;expect(new Navigation(arena).reachable(1,4,10,4)).toBe(false);for(let z=8;z<12;z++)for(let y=0;y<3;y++)put(d,5,y,z,0);expect(new Navigation(arena).reachable(1,4,10,4)).toBe(true);});
 it('warns and recovers beyond the battle area instead of using an air wall',()=>{const camera=new THREE.PerspectiveCamera(),p=new PlayerController(camera),arena={bounds:{minX:0,maxX:10,minZ:0,maxZ:10},heightAt:()=>0,blocked:()=>false,blockedAt:()=>false}as unknown as Arena;p.teleport(new THREE.Vector3(5,0,5),0);p.position.x=14;for(let i=0;i<120;i++)p.update(1/60,{down:()=>false,consumeLook:()=>({x:0,y:0})},arena,true);expect(p.position.x).toBe(14);expect(p.outOfBoundsSeconds).toBeGreaterThan(1);for(let i=0;i<300;i++)p.update(1/60,{down:()=>false,consumeLook:()=>({x:0,y:0})},arena,true);expect(p.position.x).toBe(5);expect(p.recoveryNotice).toBeGreaterThan(0);});

});

it('emits one surface for overlapping detail blocks and clips the adjoining voxel face',()=>{
 const d=world();
 put(d,0,0,0,BLOCK.DIRT);
 d.detailBoxes=[
  {id:'buried',x:.75,z:.25,w:.5,d:.5,bottom:0,top:.5,material:BLOCK.STONE},
  {id:'outside',x:1.25,z:.25,w:.5,d:.5,bottom:0,top:.5,material:BLOCK.STONE},
  {id:'paint',x:1.25,z:.25,w:.5,d:.5,bottom:0,top:.5,material:BLOCK.CONCRETE},
 ];
 let area=0,joiningFaceArea=0;
 for(const chunk of meshVoxelChunks(d)){
  expect(Array.from(chunk.block)).not.toContain(BLOCK.STONE);
  for(let i=0;i<chunk.index.length;i+=3){
   const [a,b,c]=[0,1,2].map(offset=>new THREE.Vector3().fromArray(chunk.position,chunk.index[i+offset]*3));
   const onJoin=a.x===1&&b.x===1&&c.x===1;
   const triangle=b.sub(a).cross(c.sub(a)).length()/2;
   area+=triangle;
   if(onJoin)joiningFaceArea+=triangle;
  }
 }
 expect(area).toBe(7);
 expect(joiningFaceArea).toBe(.75);
});

it('tests a rotated vehicle footprint against an actual wall instead of a padded rectangle',()=>{
 const d=world();
 d.detailBoxes=[{id:'wall',x:4,z:4,w:.5,d:5,bottom:0,top:2,material:BLOCK.STONE}];
 const q=new VoxelWorldQueries(d);
 expect(q.footprint(2.5,4,1.8,3,0,.55,2)).toBe(false);
 expect(q.footprint(2.5,4,1.8,3,Math.PI/2,.55,2)).toBe(true);
});

it('splits long voxel edges at corners from other chunks and half-grid details',()=>{
 const d=world(66,5,2,0);
 for(let z=0;z<4;z++)put(d,63,0,z,BLOCK.DIRT);
 put(d,64,0,0,BLOCK.STONE);
 d.detailBoxes=[{id:'half',x:64.25,z:2.25,w:.5,d:.5,bottom:.5,top:1,material:BLOCK.CONCRETE}];
 const segments=new Set<string>();
 for(const chunk of meshVoxelChunks(d)){
  for(let i=0;i<chunk.index.length;i+=3)for(let corner=0;corner<3;corner++){
   const a=chunk.index[i+corner]*3,b=chunk.index[i+(corner+1)%3]*3,p=chunk.position;
   if(p[a]!==64||p[b]!==64||p[a+1]!==1||p[b+1]!==1)continue;
   segments.add(`${Math.min(p[a+2],p[b+2])}:${Math.max(p[a+2],p[b+2])}`);
  }
 }
 expect(segments).toEqual(new Set(['0:1','1:2','2:2.5','2.5:3','3:4']));
});

it('bakes ambient contact occlusion beside a wall while leaving open ground unoccluded',()=>{
 const d=world(6,6,4,0);
 for(let z=0;z<5;z++)for(let x=0;x<5;x++)put(d,x,0,z,BLOCK.CONCRETE);
 put(d,2,1,2,BLOCK.STONE);
 const shaded:number[]=[],open:number[]=[];
 for(const chunk of meshVoxelChunks(d))for(let i=0;i<chunk.position.length/3;i++){
  if(chunk.normal[3*i+1]!==1||chunk.position[3*i+1]!==1)continue;
  const x=chunk.position[3*i],z=chunk.position[3*i+2];
  if(x===2&&z===2)shaded.push(chunk.occlusion![i]);
  if(x===0||z===0)open.push(chunk.occlusion![i]);
 }
 expect(Math.max(...shaded)).toBeGreaterThan(0);
 expect(Math.max(...open)).toBe(0);
});


it('fills the connected riverbed past the painted outline and under the bridge',()=>{
 const data=buildVoxelMapData(brokenBridge);
 const queries=new VoxelWorldQueries(data);
 for(const [x,z] of [[150,137],[150,164],[129,150],[243,150],[0,150],[300,150]]){
  expect(queries.water(x+.5,z+.5,-3)?.surface).toBe(-2);
  expect(isWaterMaterial(blockAt(data,x,-3,z))).toBe(true);
 }
 expect(queries.support(129.5,150.5,2.01)).toBe(2);
 expect(queries.water(129.5,150.5,2)).toBeNull();
 expect(queries.water(150.5,120.5,-3)).toBeNull();
 expect(blockAt(data,141,-5,145)).toBe(24);
 expect(blockAt(data,243,-4,150)).toBe(BLOCK.SAND);
});

it('fills through a submerged opening without spilling over a dry retaining wall',()=>{
 const data=world(6,3,8,-4);
 for(let z=0;z<3;z++)for(let x=0;x<6;x++)for(let y=-4;y<-2;y++)put(data,x,y,z,BLOCK.STONE);
 for(let z=0;z<3;z++){
  put(data,2,-1,z,BLOCK.STONE);
  for(let y=-2;y<=0;y++)put(data,4,y,z,BLOCK.STONE);
 }
 fillVoxelWater(data,0,BLOCK.WATER,[[1,1]]);
 expect(blockAt(data,2,-2,1)).toBe(BLOCK.WATER);
 expect(blockAt(data,3,-1,1)).toBe(BLOCK.WATER);
 expect(blockAt(data,3,0,1)).toBe(BLOCK.AIR);
 expect(blockAt(data,5,-2,1)).toBe(BLOCK.AIR);
 expect(new VoxelWorldQueries(data).water(3.5,1.5,-1)).toEqual({surface:0,bottom:-2});
});

it('keeps downhill obstacles solid while allowing a hull across a terrain step', () => {
  const data = world();
  for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
    put(data, x, -1, z, BLOCK.STONE);
    if (z >= 4) {
      put(data, x, 0, z, BLOCK.STONE);
      data.primary[z * data.width + x] = 1;
    }
  }
  const footprint = (q: VoxelWorldQueries) => q.footprint(4, 4, 2, 4, 0, 1.56, 2, { min: -1, max: 2 });
  expect(footprint(new VoxelWorldQueries(data))).toBe(false);
  data.detailBoxes = [{ id: 'downhill-barrier', x: 4, z: 2.8, w: 1, d: 1, bottom: 0, top: 1.5, material: BLOCK.STONE }];
  expect(footprint(new VoxelWorldQueries(data))).toBe(true);
  data.detailBoxes = [];
  put(data, 4, 0, 3, BLOCK.STONE);
  expect(footprint(new VoxelWorldQueries(data))).toBe(true);
});
