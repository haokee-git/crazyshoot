import {describe,it,expect} from 'vitest';
import {decideInfantry,positionUtility,type CombatPicture} from '../src/game/ai/tactical-brain';
import {TacticalMemory} from '../src/game/ai/tactical-memory';
import {botAimPlan,botTargetUtility} from '../src/game/ai/aim';
import {decideArmoredObjective,type ObjectiveSituation} from '../src/game/ai/vehicle-objective';
const picture:CombatPicture={role:'rifle',health:100,ammoRatio:1,reloading:false,visible:false,contactAge:Infinity,distance:80,targetArmored:false,underFire:false,allies:1,enemies:0,objectiveUrgency:1,danger:0,moving:0,hasCover:false};
const decision=(p:Partial<CombatPicture>)=>decideInfantry({...picture,...p},10000,7);
describe('contextual infantry decisions',()=>{
 it('advances without contact, but withdraws while critically wounded and reloading under fire',()=>{
  expect(decision({}).action).toBe('advance');
  expect(decision({health:18,reloading:true,ammoRatio:0,visible:true,distance:15,underFire:true,enemies:3}).action).toBe('withdraw');
 });
 it('seeks safety during an unseen attack instead of blindly advancing while empty',()=>{
  expect(decision({health:18,ammoRatio:0,reloading:true,underFire:true}).action).toBe('withdraw');
 });
 it('resupplies an empty weapon and finishes recovering at a safe base',()=>{
  expect(decision({ammoRatio:0,depleted:true}).action).toBe('withdraw');
  expect(decision({health:18}).action).toBe('withdraw');
  expect(decision({health:60,resupplying:true}).action).toBe('withdraw');
 });
 it('uses a sniper firing position at range and abandons it against a close assault',()=>{
  expect(decision({role:'sniper',visible:true,distance:110,hasCover:true}).action).toBe('overwatch');
  expect(decision({role:'sniper',visible:true,distance:8,underFire:true}).action).toBe('withdraw');
 });
 it('pushes with local superiority and changes angle when a friendly blocks the gun',()=>{
  expect(decision({role:'smg',visible:true,distance:30,allies:5,enemies:1}).action).toBe('assault');
  expect(decision({visible:true,distance:55,blockedShot:true}).action).toBe('flank');
 });
 it('does not charge armor with ordinary infantry weapons',()=>{
  expect(decision({visible:true,distance:30,targetArmored:true}).action).toBe('withdraw');
 });
 it('resists small tactical noise but switches after commitment when local superiority becomes decisive',()=>{
  const previous={action:'overwatch' as const,score:54,until:11000,reason:'firing position'};
  const p={...picture,visible:true,distance:38,allies:5,enemies:1};
  expect(decideInfantry(p,10000,7,previous).action).toBe('overwatch');
  expect(decideInfantry(p,12000,7,previous).action).toBe('assault');
 });
 it('can interrupt a committed firing position in an emergency',()=>{
  const prior={action:'overwatch' as const,score:80,until:15000,reason:'cover'};
  expect(decideInfantry({...picture,health:12,visible:true,underFire:true,distance:12,reloading:true},10000,7,prior).action).toBe('withdraw');
 });
 it('prefers cover when disengaging and lateral angles when flanking',()=>{
  const exposed={x:0,y:0,z:0,cover:0,distance:25,progress:5,travel:5,danger:0};
  expect(positionUtility('withdraw',{...exposed,cover:2,distance:32},34)).toBeGreaterThan(positionUtility('withdraw',exposed,34));
  expect(positionUtility('flank',{...exposed,progress:8},34)).toBeGreaterThan(positionUtility('flank',exposed,34));
 });
});
describe('contextual armor decisions',()=>{
 const caps=[{id:'A',x:105,z:195,owner:'orange'},{id:'B',x:130,z:150,owner:'orange'},{id:'C',x:195,z:105,owner:'blue'}];
 const choose=(situations?:Map<string,ObjectiveSituation>,health=1,ammo=1)=>decideArmoredObjective('blue',{x:193,z:94},[...caps,{id:'base-blue',x:150,z:28,owner:'blue',base:true}],[],'tank',{x:150,z:270},{kind:'light_tank',health,ammo,ownBase:{x:150,z:28},situations,now:1000})!;
 it('attacks a quiet front, but defends the same friendly point when observed armor threatens it',()=>{
  expect(choose().objective.id).toBe('B');
  const d=choose(new Map([['C',{enemies:3,armor:2,support:0,danger:5,blocked:false}]]));
  expect(d.objective.id).toBe('C');expect(d.action).toBe('defend');
 });
 it('resupplies when shells are empty or the hull is critically damaged',()=>{
  expect(choose(undefined,.15).action).toBe('resupply');
  expect(choose(undefined,1,0).action).toBe('resupply');
  expect(choose(new Map([['C',{enemies:3,armor:1,support:0,danger:0,blocked:false}]]),1,0).action).toBe('resupply');
 });
 it('does not rush an unsupported APC into an observed armor concentration',()=>{
  const situations=new Map([['B',{enemies:4,armor:3,support:0,danger:20,blocked:false}]]);
  const d=decideArmoredObjective('blue',{x:130,z:95},caps,[],'apc',undefined,{kind:'apc',situations})!;
  expect(d.objective.id).not.toBe('B');
 });
 it('retains a similar order through small utility changes, then abandons a completed capture',()=>{
  const first=choose(),current={...first,until:5000};
  const next=decideArmoredObjective('blue',{x:194,z:94},caps,[],'tank',{x:150,z:270},{kind:'light_tank',now:1200,previous:current,ownBase:{x:150,z:28}})!;
  expect(next.objective.id).toBe(first.objective.id);
  const done=caps.map(c=>({...c,owner:c.id==='B'?'blue':c.owner}));
  expect(decideArmoredObjective('blue',{x:130,z:150},done,[],'tank',undefined,{now:1300,previous:current})?.objective.id).toBe('A');
 });
});
describe('perception and fire control',()=>{
 it('keeps a stale report at its observed location until another observation arrives',()=>{
  const m=new TacticalMemory();const live={x:1,y:2,z:3};m.observe('blue','foe',live,true,1000);live.x=900;
  expect([...m.contacts('blue')][0].x).toBe(1);expect([...m.contacts('orange')]).toHaveLength(0);
 });
 it('uses short economical bursts at range, longer bursts close, and withholds ineffective anti-armor fire',()=>{
  const p={role:'rifle' as const,distance:100,targetSpeed:3,moving:0,underFire:false,ammoRatio:1,rpm:700,visibleMs:1500};
  const far=botAimPlan(p),close=botAimPlan({...p,distance:10});expect(far.burst).toBeLessThan(close.burst);expect(far.pause).toBeGreaterThan(close.pause);
  expect(botAimPlan({...p,targetArmored:true}).fire).toBe(false);
  expect(botAimPlan({...p,underFire:true,moving:4}).spread).toBeGreaterThan(far.spread);
 });
 it('prioritizes an observed active shooter and keeps a viable target over a slight distance gain',()=>{
  expect(botTargetUtility(40,34,true,true,false,false,false)).toBeGreaterThan(botTargetUtility(20,34,false,false,false,false,false));
  expect(botTargetUtility(30,34,false,false,false,false,true)).toBeGreaterThan(botTargetUtility(25,34,false,false,false,false,false));
 });
});
