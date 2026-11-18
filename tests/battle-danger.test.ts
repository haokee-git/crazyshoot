import {describe,it,expect} from 'vitest';
import {BattleDanger} from '../src/game/ai/battle-danger';
describe('team danger memory',()=>{
 it('remembers clustered casualties and offers two routes outside the exposed lane',()=>{
  const d=new BattleDanger();d.record('orange',130,192,1000);d.record('orange',132,190,2000);
  expect(d.penalty('orange',130,192,3000)).toBeGreaterThan(10);
  expect(d.penalty('blue',130,192,3000)).toBe(0);
  const bypass=d.bypasses('orange',{x:130,z:225},{x:130,z:150},3000);
  expect(bypass).toHaveLength(2);expect(bypass[0].x).toBeLessThan(120);expect(bypass[1].x).toBeGreaterThan(140);
  expect(d.bypasses('orange',{x:130,z:225},{x:130,z:150},3000,bypass[0].id)).toEqual([]);
  expect(d.penalty('orange',130,192,63000)).toBe(0);
 });
 it('does not divert for one casualty or an unrelated route',()=>{
  const d=new BattleDanger();d.record('blue',100,100,1000);expect(d.bypasses('blue',{x:100,z:130},{x:100,z:50},2000)).toEqual([]);
  d.record('blue',100,100,2000);expect(d.bypasses('blue',{x:160,z:130},{x:160,z:50},3000)).toEqual([]);
 });
});
