import {describe,it,expect} from 'vitest';
import {WeaponRecoil,RecoilSpring} from '../src/game/weapons/recoil';
const rng=()=>{let s=431;return()=>((s=Math.imul(s,1664525)+1013904223|0)>>>0)/4294967296;};
describe('weapon recoil response',()=>{
 it('changes velocity on a shot without teleporting the camera',()=>{const r=new WeaponRecoil();r.fire('m16',true,false,rng());expect(r.pitch.value).toBe(0);r.update(1/120);expect(r.pitch.value).toBeGreaterThan(0);expect(r.pitch.value).toBeLessThan(.01);});
 it('adds noticeable but bounded rise and mixed horizontal movement in sustained M16A4 fire', () => {
  const recoil = new WeaponRecoil(), random = rng();
  let peak = 0;
  const sides: number[] = [];
  for (let shot = 0; shot < 30; shot++) {
   sides.push(recoil.fire('m16', true, false, random).horizontal);
   for (let step = 0; step < 12; step++) {
    recoil.update(1 / 120);
    peak = Math.max(peak, recoil.pitch.value);
   }
  }
  expect(Math.min(...sides)).toBeLessThan(0);
  expect(Math.max(...sides)).toBeGreaterThan(0);
  expect(Math.max(...sides) - Math.min(...sides)).toBeGreaterThan(.003);
  expect(peak * 180 / Math.PI).toBeGreaterThan(.65);
  expect(peak * 180 / Math.PI).toBeLessThan(1);
  for (let step = 0; step < 240; step++) recoil.update(1 / 120);
  expect(Math.abs(recoil.pitch.value)).toBeLessThan(1e-7);
  expect(Math.abs(recoil.yaw.value)).toBeLessThan(1e-7);
 });
 it('adds a short camera roll to M249 shots and clears it when switching weapons', () => {
  const recoil = new WeaponRecoil(), random = rng();
  recoil.fire('m249', true, false, random);
  recoil.update(1 / 30);
  expect(Math.abs(recoil.cameraRoll)).toBeGreaterThan(.002);
  expect(Math.abs(recoil.cameraRoll)).toBeLessThan(.006);
  recoil.update(.3);
  expect(Math.abs(recoil.cameraRoll)).toBeLessThan(.00001);
  recoil.fire('m249', true, false, random);
  recoil.update(1 / 60);
  recoil.fire('m16', true, false, random);
  recoil.update(1 / 30);
  expect(recoil.cameraRoll).toBe(0);
 });
 it('spring recovery is independent of frame subdivision',()=>{const a=new RecoilSpring(42,.64),b=new RecoilSpring(42,.64);a.impulse(.025);b.impulse(.025);for(let i=0;i<9;i++)a.update(1/30);for(let i=0;i<36;i++)b.update(1/120);expect(a.value).toBeCloseTo(b.value,12);expect(a.velocity).toBeCloseTo(b.velocity,12);});
 it('reset clears velocity and offsets for respawn and loadout changes',()=>{const r=new WeaponRecoil();r.fire('m16',true,false,rng());r.update(.05);r.reset();r.update(.1);expect(r.pitch.value).toBe(0);expect(r.pitch.velocity).toBe(0);expect(r.yaw.value).toBe(0);});
});
