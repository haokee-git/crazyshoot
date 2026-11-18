import {it,expect} from 'vitest';
import * as THREE from 'three';
import {LocalNavigation} from '../src/game/ai/local-navigation';
import {WorldQueries} from '../src/game/world/queries';
import type {Arena} from '../src/game/world/arena';
import {PlayerController} from '../src/game/player/controller';
it('detours around a parked vehicle instead of walking indefinitely into its footprint',()=>{const q=new WorldQueries([{x:0,z:0,w:2,d:4,rot:0,bottom:0,top:2}],()=>0),arena={heightAt:()=>0,supportAt:()=>0,blocked:()=>false,blockedAt:()=>false,playerBlocked:(x:number,z:number,r:number,y:number,h?:number)=>q.blocked(x,z,r,y,h)}as unknown as Arena,nav=new LocalNavigation(arena),p=new PlayerController(new THREE.PerspectiveCamera());p.teleport(new THREE.Vector3(-1.6,0,0),0);for(let i=0;i<140;i++){const s=nav.steer('bot',p.position.x,p.position.z,p.position.y,{x:5,z:0},i*140);p.yaw=Math.atan2(-s.dx,-s.dz);for(let j=0;j<8;j++)p.update(.0175,{down:k=>k==='KeyW'&&Math.hypot(s.dx,s.dz)>.1,consumeLook:()=>({x:0,y:0})},arena,true);}expect(p.position.x).toBeGreaterThan(3);});
it('passes the actor identity to occupancy queries so a bot never blocks itself',()=>{let seen:string|undefined;const arena={heightAt:()=>0,supportAt:()=>0,blocked:()=>false,playerBlocked:(_x:number,_z:number,_r:number,_y:number,_h?:number,id?:string)=>{seen=id;return id!=='self';}}as unknown as Arena;const nav=new LocalNavigation(arena);const result=nav.steer('self',0,0,0,{x:3,z:0},0);expect(seen).toBe('self');expect(result.dx).toBeGreaterThan(.8);});
it('retains a validated jump destination through the airborne interval',()=>{const arena={heightAt:()=>0,supportAt:()=>0,blocked:()=>false,playerBlocked:()=>false}as unknown as Arena;const nav=new LocalNavigation(arena),move=nav.steer('jumper',0,0,0,{x:3,z:0,action:'jump'},100);expect(move.jump).toBe(true);expect(nav.jumpWaypoint('jumper',500)?.x).toBe(3);expect(nav.jumpWaypoint('jumper',1200)).toBeNull();});
import {Navigation} from '../src/game/world/navigation';
it('creates a jump edge across a short gap only when the flight corridor is clear',()=>{const ground=(x:number)=>x>.75&&x<2.25?-3:0,arena={bounds:{minX:0,maxX:6,minZ:0,maxZ:6},heightAt:(x:number)=>ground(x),navigationHeight:(x:number)=>ground(x),supportAt:(x:number)=>ground(x),blockedAt:(x:number,_z:number,_r:number,y:number)=>y<ground(x)-.01,blocked:()=>false}as unknown as Arena;const nav=new Navigation(arena);expect(nav.next(0,3,3,3,0)?.action).toBe('jump');arena.blockedAt=(x,_z,_r,y)=>y<ground(x)-.01||y+1.8>2;expect(new Navigation(arena).reachable(0,3,3,3)).toBe(false);});

it('leaves the shortest route to flank a watched choke point', () => {
  const arena = {
    bounds: { minX: 0, maxX: 24, minZ: 0, maxZ: 24 },
    heightAt: () => 0,
    blockedAt: (x: number, z: number) => x > 8 && x < 16 && z > 3 && z < 21 && Math.abs(z - 12) > 1,
  } as unknown as Arena;
  const nav = new Navigation(arena);
  expect(nav.next(6, 12, 21, 12, 0)).toMatchObject({ x: 9, z: 12 });
  const flank = nav.detour(6, 12, 21, 12, 0, p => p.x >= 9 && p.x <= 15 && Math.abs(p.z - 12) < 2 ? 20 : 0);
  expect(flank.length).toBeGreaterThan(5);
  expect(flank[0].x).toBe(6);
  expect(flank.some(p => p.x > 8 && p.x < 16 && Math.abs(p.z - 12) < 2)).toBe(false);
});
