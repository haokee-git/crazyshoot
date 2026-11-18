/** Hard cap on catch-up steps per frame (0.5 s at 60 Hz). */
export const MAX_SIMULATION_STEPS = 30;

/**
 * Wall time this frame that will NOT be simulated (tab background, OS sleep,
 * long hitch). Match deadlines are wall-clock based, so they must be shifted by
 * this amount; otherwise a backgrounded host comes back to a match that already
 * ended. Deadlines that are already zero (not started) stay zero.
 */
export function unsimulatedGapMs(elapsedSeconds: number, step: number, maxSteps = MAX_SIMULATION_STEPS): number {
  return Math.max(0, elapsedSeconds - step * maxSteps) * 1000;
}

export class SimulationClock {
 readonly step=1/60;accumulator=0;overloadSeconds=0;
 advance(elapsed:number,simulate:(dt:number)=>void){this.accumulator+=Math.max(0,elapsed);let steps=0;while(this.accumulator+1e-9>=this.step&&steps<MAX_SIMULATION_STEPS){simulate(this.step);this.accumulator-=this.step;steps++;}if(this.accumulator>this.step*MAX_SIMULATION_STEPS){this.overloadSeconds+=this.accumulator;this.accumulator=0;}return steps;}
 reset(){this.accumulator=0;}
}
export class RenderScheduler {
 private next=0;
 due(now:number,limit:number){if(!Number.isFinite(limit)||limit<=0)return true;const interval=1000/limit;if(now<this.next-.5)return false;this.next=this.next&&now-this.next<interval?this.next+interval:now+interval;return true;}
}
