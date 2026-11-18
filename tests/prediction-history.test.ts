import {describe,it,expect} from 'vitest';
import {predictionOffsetDecay,rebasePredictionHistory,smoothRemotePosition} from '../src/game/core/prediction-history';

describe('guest prediction correction',()=>{
  it('rebases future samples so the next ack does not apply the same error twice',()=>{
    const samples=[{seq:10,x:0,y:0,z:1},{seq:11,x:0,y:0,z:2},{seq:12,x:0,y:0,z:3}];
    const firstAuthority=1.4,delta=firstAuthority-samples[0].z;
    rebasePredictionHistory(samples,10,0,0,delta);
    expect(samples[0].z).toBe(1);
    expect(samples[1].z).toBeCloseTo(2.4);
    expect(samples[2].z).toBeCloseTo(3.4);
    const nextAuthority=2.4;
    expect(nextAuthority-samples[1].z).toBeCloseTo(0);
  });
  it('limits a backward visual correction to less than forward movement',()=>{
    const offset={x:0,z:1},velocity={x:0,z:5},dt=1/60;
    const decay=predictionOffsetDecay(offset,velocity,dt);
    expect(decay*offset.z).toBeLessThan(velocity.z*dt);
    expect(predictionOffsetDecay(offset,{x:0,z:0},dt)).toBeGreaterThan(decay);
  });
});

it('never reverses or overshoots a forward runner when authoritative packets bunch and stop',()=>{
  const position={x:0,y:0,z:10},target={x:0,y:0,z:10};
  for(let frame=0;frame<300;frame++){
    // Alternating bursts, quiet periods and a final stop, always forward.
    if(frame<180&&frame%17===0)target.z-=.7;
    const previous=position.z;
    smoothRemotePosition(position,target,frame<180?5.3:0,1/60);
    expect(position.z).toBeLessThanOrEqual(previous);
    expect(position.z).toBeGreaterThanOrEqual(target.z);
    expect(previous-position.z).toBeLessThanOrEqual(9.3/60+1e-9);
  }
  expect(position.z).toBeCloseTo(target.z,4);
});
