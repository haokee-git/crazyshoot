import {describe,it,expect} from 'vitest';
import {chooseArmoredObjective} from '../src/game/ai/vehicle-objective';
const caps=[{id:'A',x:105,z:195,owner:'orange'},{id:'B',x:130,z:150,owner:'orange'},{id:'C',x:195,z:105,owner:'blue'}];
describe('armored frontline orders',()=>{
 it('leaves a captured home platform immediately instead of preferring its zero distance',()=>{
  expect(chooseArmoredObjective('blue',{x:193,z:94},caps,[],'driver')?.id).toBe('B');
 });
 it('does not park on a friendly point while any attackable point remains',()=>{
  for(let x=0;x<=300;x+=10)for(let z=0;z<=300;z+=10){
   expect(chooseArmoredObjective('blue',{x,z},caps,[],'driver')?.owner).not.toBe('blue');
  }
 });
 it('sends the second armored hull to the bridge rather than queuing behind the home-point capturer',()=>{
  const neutral=caps.map(c=>({...c,owner:'neutral'}));
  const first=chooseArmoredObjective('blue',{x:182,z:48},neutral,[],'apc');expect(first?.id).toBe('C');
  expect(chooseArmoredObjective('blue',{x:202,z:60},neutral,[{id:'apc',team:'blue',objective:'C',active:true}],'tank')?.id).toBe('B');
 });
 it('does not reserve targets for destroyed or enemy crews',()=>{
  const first=caps.map(c=>({...c,owner:'neutral'}));
  expect(chooseArmoredObjective('blue',{x:182,z:48},first,[{id:'dead',team:'blue',objective:'C',active:false},{id:'enemy',team:'orange',objective:'C',active:true}],'apc')?.id).toBe('C');
 });
 it('defends the forward point when the whole map is friendly',()=>{
  expect(chooseArmoredObjective('blue',{x:195,z:105},caps.map(c=>({...c,owner:'blue'})),[],'apc',{x:150,z:270})?.id).toBe('A');
 });
});
