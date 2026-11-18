import { expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { PlayerController } from '../src/game/player/controller';
import type { Arena } from '../src/game/world/arena';
import { canonicalKeyCodes, mappedKeyDown } from '../src/game/core/input';
import { ACTION_CODES, DEFAULT_BINDS, loadBinds, saveBinds, type BindAction } from '../src/game/core/keybinds';

const arena = {
  bounds: {minX:-100,maxX:100,minZ:-100,maxZ:100},
  heightAt: () => -5,
  supportAt: () => -5,
  waterAt: (_x:number,_z:number,y=-5) => y > .15 ? null : {surface:0,bottom:-5},
  blockedAt: () => false,
} as unknown as Arena;

function swimmer(y:number) {
  const camera = new PerspectiveCamera(), player = new PlayerController(camera);
  player.teleport(new Vector3(0,y,0));
  const step = (seconds:number, keys:string[]=[]) => {
    for(let i=0;i<seconds*60;i++)player.update(1/60,{
      down:key=>keys.includes(key),consumeLook:()=>({x:0,y:0}),
    },arena,true);
  };
  return {camera,player,step};
}

it('settles head-up while idle and gradually floats higher during a stroke', () => {
  const {camera,player,step} = swimmer(-.5);
  step(4);
  expect(player.position.y).toBeCloseTo(-1.53, 2);
  expect(camera.position.y).toBeGreaterThan(.06);
  expect(camera.position.y).toBeLessThan(.2);
  step(.25,['KeyW']);
  expect(player.position.y).toBeGreaterThan(-1.53);
  expect(player.position.y).toBeLessThan(-1.07);
  step(4,['KeyW']);
  expect(player.position.y).toBeCloseTo(-1.03, 2);
});

it('rises with Space, dives with held Ctrl, and floats again after release', () => {
  const {player,step} = swimmer(-1.53);
  step(4,['Space']);
  expect(player.position.y).toBeCloseTo(-.48,2);
  step(3,['AltLeft']);
  expect(player.position.y).toBeCloseTo(-5,2);
  expect(player.underwater).toBe(true);
  expect(player.crouched).toBe(false);
  step(5);
  expect(player.position.y).toBeCloseTo(-1.53,2);
  expect(player.underwater).toBe(false);
});

it('uses Shift to swim faster without activating the land sprint', () => {
  const slow=swimmer(-1.03),fast=swimmer(-1.03);
  slow.step(2,['KeyW']);
  fast.step(2,['KeyW','ShiftLeft']);
  expect(fast.player.sprinting).toBe(false);
  expect(-slow.player.velocity.z).toBeCloseTo(2.7,2);
  expect(-fast.player.velocity.z).toBeCloseTo(4.4,2);
});

it('maps C to crouch and either Ctrl key to the held walk/dive command', () => {
  const actions = Object.keys(ACTION_CODES) as BindAction[];
  const aliases = new Map(actions.map(action=>[ACTION_CODES[action],DEFAULT_BINDS[action]]));
  for(const ctrl of ['ControlLeft','ControlRight']){
    const keys=new Set([ctrl]);
    expect(canonicalKeyCodes(keys,aliases)).toEqual(['AltLeft']);
    expect(mappedKeyDown(keys,aliases,'ControlLeft')).toBe(false);
    expect(mappedKeyDown(keys,aliases,'AltLeft')).toBe(true);
  }
  expect(canonicalKeyCodes(new Set(['KeyC']),aliases)).toEqual(['ControlLeft']);
});

it('migrates the old default pair while keeping other saved controls and deliberate remaps', () => {
  let raw=JSON.stringify({...ACTION_CODES,forward:'KeyY'});
  vi.stubGlobal('localStorage',{getItem:()=>raw,setItem:(_key:string,next:string)=>{raw=next;}});
  try{
    expect(loadBinds()).toMatchObject({forward:'KeyY',crouch:'KeyC',walk:'ControlLeft'});
    saveBinds({...ACTION_CODES,forward:'KeyY'});
    expect(loadBinds()).toMatchObject({forward:'KeyY',crouch:'ControlLeft',walk:'AltLeft'});
  }finally{vi.unstubAllGlobals();}
});

it('can jump and climb a lip one block above a shallow pool', () => {
  const arena = {
    bounds: {minX:-10,maxX:10,minZ:-10,maxZ:10},
    heightAt: (x:number) => x<0 ? 1 : -1,
    supportAt: (x:number,_z:number,max:number) => x<0 && max>=1 ? 1 : -1,
    waterAt: (x:number,_z:number,y=-1) => x>=0 && y<=.15 ? {surface:0,bottom:-1} : null,
    blockedAt: (x:number,_z:number,r:number,y:number) => x-r<0 && y<1-.005,
  } as unknown as Arena;
  const player=new PlayerController(new PerspectiveCamera());
  player.teleport(new Vector3(.62,-1,0),Math.PI/2);
  let climbed=false;
  for(let i=0;i<140;i++){
    player.update(1/60,{down:key=>key==='KeyW'||key==='Space',consumeLook:()=>({x:0,y:0})},arena,true);
    climbed||=!!player.mantle;
  }
  expect(climbed).toBe(true);
  expect(player.position.x).toBeLessThan(-.4);
  expect(player.position.y).toBeCloseTo(1,2);
});

function approachBank(bankHeight:number, keys:string[], bottom=-4) {
  const arena = {
    bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},
    heightAt:(x:number)=>x<0?bankHeight:bottom,
    supportAt:(x:number,_z:number,max:number)=>x<0&&max>=bankHeight?bankHeight:bottom,
    waterAt:(x:number,_z:number,y=bottom)=>x>=0&&y<=.15?{surface:0,bottom}:null,
    blockedAt:(x:number,_z:number,r:number,y:number)=>x-r<0&&y<bankHeight-.005,
  } as unknown as Arena;
  const player=new PlayerController(new PerspectiveCamera());
  player.teleport(new Vector3(1.8,Math.max(-1.53,bottom),0),Math.PI/2);
  let climbed=false;
  for(let i=0;i<180;i++){
    player.update(1/60,{down:key=>keys.includes(key),consumeLook:()=>({x:0,y:0})},arena,true);
    climbed||=!!player.mantle;
  }
  return {player,climbed};
}

it.each([-.15,0,.22])('swims onto a bank at %s m without jumping or mantling', bankHeight => {
  const {player,climbed}=approachBank(bankHeight,['KeyW']);
  expect(player.position.x).toBeLessThan(-1);
  expect(player.position.y).toBeCloseTo(bankHeight,2);
  expect(player.grounded).toBe(true);
  expect(player.inWater).toBe(false);
  expect(climbed).toBe(false);
});

it('walks directly from a shallow shelf onto a slightly raised bank',()=>{
  const {player,climbed}=approachBank(.22,['KeyW'],-1);
  expect(player.position.x).toBeLessThan(-1);
  expect(player.position.y).toBeCloseTo(.22,2);
  expect(player.grounded).toBe(true);
  expect(climbed).toBe(false);
});

it('keeps swimmers at a high rim unless they climb it',()=>{
  const {player,climbed}=approachBank(1,['KeyW']);
  expect(player.position.x).toBeGreaterThan(0);
  expect(player.swimming).toBe(true);
  expect(climbed).toBe(false);
});

it('does not force a diving swimmer onto a nearby bank',()=>{
  const {player}=approachBank(0,['KeyW','AltLeft']);
  expect(player.position.x).toBeGreaterThan(0);
  expect(player.underwater).toBe(true);
});
