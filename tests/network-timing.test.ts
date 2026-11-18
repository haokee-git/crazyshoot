import {describe,it,expect} from 'vitest';
import {liveNetworkInterval} from '../src/game/core/network-timing';
describe('AI-heavy room network rate',()=>{
 it('keeps guest inputs at 60 Hz but reduces large host snapshots',()=>{
  expect(liveNetworkInterval(false,true,0,40)).toBeCloseTo(1000/60);
  expect(liveNetworkInterval(true,true,1,40)).toBeCloseTo(1000/30);
  expect(liveNetworkInterval(true,true,1,80)).toBe(50);
  expect(liveNetworkInterval(true,true,1,12)).toBeCloseTo(1000/60);
 });
});
