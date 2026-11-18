import type { Arena } from '../world/arena';
import {planVehicleRouteDetailed,smoothVehicleRoute,vehicleSegmentClear} from './vehicle-navigation';
import {vehicleMaxSpeed as baseVehicleMaxSpeed} from '../vehicles/controller';
import {vehiclePoseBlocked,type MotionHull,type MotionWorld} from '../vehicles/motion';
import {advanceVehicleSpeed,angleDelta,hullYawRate,trackedHull,vehicleMaxSpeed,vehicleSize} from '../vehicles/controller';

export interface VehicleGoal {id:string;x:number;z:number;radius:number;}
export interface PilotTick {
  throttle:number;
  steer:number;
  /** The pilot needs a fresh route: call `plan()` (the host budgets these). */
  replan:boolean;
  /** Give the hull up: the goal cannot be reached from here. */
  giveUp:boolean;
  /** Within the goal radius. */
  reached:boolean;
}

const clamp=(value:number,a:number,b:number)=>Math.max(a,Math.min(b,value));

/**
 * Route-following AI for one hull.
 *
 * The old driver chased `path[0]` and scored headings only inside a ±30° cone, so
 * a route point behind the hull could not be reached: the tank drove a tight circle,
 * "stalled" every eight think ticks (0.09 m of displacement counted as no progress),
 * reversed, re-planned the same dead-end route and repeated until the match ended.
 *
 * This pilot follows a look-ahead point, steers only towards headings the hull can
 * actually take, and treats "stuck" as a *time* condition (blocked or powered but
 * motionless for >1.3 s). Recovery backs out, replans, and after repeated failures
 * gives the goal up so the crew fights on foot instead of ramming a wall forever.
 */
export class VehiclePilot {
  readonly hull:MotionHull;
  readonly tracked:boolean;
  performance:{plans:number;failures:number}={plans:0,failures:0};
  path:{x:number;z:number}[]=[];
  index=0;
  reachesGoal=false;
  needsPlan=true;
  giveUp=false;
  giveUpReason='';
  goalId='';
  /** Hull this pilot drives; excluded from its own occupancy probes. */
  vehicleId='';
  planningTeam?:string;

  private goalX=0;private goalZ=0;
  private plannedAt=-Infinity;
  private lastTick=-1;
  private stall=0;
  private blockedIntent=0;
  private window={x:0,z:0,at:0};
  private move={x:0,z:0,at:0,power:0};
  private brakeIntent=0;
  private embeddedUntil=0;
  private recoveryStuck=0;
  private failures=0;
  private failureWindowAt=-Infinity;
  private recovery:{mode:'reverse'|'pivot';until:number;steer:number}|null=null;
  private progressAt=0;
  private bestDistance=Infinity;
  private throttle=0;
  private trafficPlan=false;
  /** Last steering intent, exposed for traces and tests. */
  debugTurn=0;debugAim:{x:number;z:number}={x:0,z:0};debugMode='';


  constructor(readonly kind:string,readonly world:MotionWorld,readonly arena:Arena){
    this.hull=vehicleSize(kind);
    this.tracked=trackedHull(kind);
  }

  get stallSeconds(){return this.stall;}
  get failureCount(){return this.failures;}
  get recovering(){return this.recovery?.mode??'';}

  /** Forget the plan (new goal, boarded, after a long reverse). */
  invalidate(){this.needsPlan=true;this.path=[];this.index=0;this.reachesGoal=false;this.recovery=null;this.stall=0;}

  plan(v:{x:number;z:number;yaw:number},goal:VehicleGoal,now:number,avoidTraffic=false):void{
    this.trafficPlan=avoidTraffic;this.giveUp=false;this.giveUpReason='';
    const traffic=avoidTraffic?{world:this.world,ignoreId:this.vehicleId,knownTeam:this.planningTeam}:undefined;
    const route=planVehicleRouteDetailed(this.arena,{x:v.x,z:v.z},{x:goal.x,z:goal.z},this.hull,Math.max(4,goal.radius*.65),avoidTraffic?{step:2,margin:.4,maxExpansions:6000,world:this.world,ignoreId:this.vehicleId,knownTeam:this.planningTeam}:undefined);
    const end=route.points.at(-1)??v;
    if(route.reached&&Math.hypot(end.x-goal.x,end.z-goal.z)>goal.radius*.8&&vehicleSegmentClear(this.arena,end.x,end.z,goal.x,goal.z,this.hull,.6,.2,{world:this.world,ignoreId:this.vehicleId,knownTeam:this.planningTeam}))route.points.push({x:goal.x,z:goal.z});
    this.path=this.tracked?smoothVehicleRoute(this.arena,{x:v.x,z:v.z},route.points,this.hull,traffic):route.points;
    this.reachesGoal=route.reached;
    this.goalId=goal.id;this.goalX=goal.x;this.goalZ=goal.z;
    this.plannedAt=now;this.index=0;this.needsPlan=false;this.recovery=null;this.stall=0;
    this.performance.plans++;
    this.bestDistance=Math.hypot(goal.x-v.x,goal.z-v.z);
    this.progressAt=now;this.window={x:v.x,z:v.z,at:now};this.blockedIntent=0;this.brakeIntent=0;this.move={x:v.x,z:v.z,at:now,power:0};
    // Nothing at all is reachable from here: the crew walks.
    if(!route.reached&&!this.path.length){this.giveUp=true;this.giveUpReason='unreachable';}
  }

  /**
   * Predict the arc the hull would actually trace for `horizon` seconds under a
   * throttle/steer pair. Pure-pursuit look-ahead cuts corners: this is what stops a
   * tank from flooring it at 80° of heading error straight into the house wall.
   */
  arcClear(v:{x:number;z:number;yaw:number;speed:number;steering?:number},throttle:number,steer:number,horizon=1.3):boolean{
    let x=v.x,z=v.z,yaw=v.yaw,speed=v.speed,steering=v.steering??steer;
    const dt=.15,steps=Math.ceil(horizon/dt),max=this.arena.vehiclePerformance?.(this.kind)?.maxSpeed??vehicleMaxSpeed(this.kind);
    for(let i=0;i<steps;i++){
      speed=advanceVehicleSpeed(speed,throttle,max,dt,this.tracked);
      steering+=clamp(steer-steering,-4.8*dt,4.8*dt);
      yaw+=hullYawRate(speed,steering,max,this.tracked)*dt;
      x+=Math.sin(yaw)*speed*dt;z+=Math.cos(yaw)*speed*dt;
      if(vehiclePoseBlocked(this.world,this.hull,{x,z,yaw},{from:{x:v.x,z:v.z,yaw:v.yaw},ignoreId:this.vehicleId}))return false;
    }
    return true;
  }

  private blockedPose(v:{x:number;z:number;yaw:number},distance:number):boolean{
    return vehiclePoseBlocked(this.world,this.hull,{x:v.x-Math.sin(v.yaw)*distance,z:v.z-Math.cos(v.yaw)*distance,yaw:v.yaw},{from:v,ignoreId:this.vehicleId});
  }

  private startRecovery(now:number,v:{x:number;z:number;yaw:number},turn:number):void{
    this.failures++;
    if(now-this.failureWindowAt>30000){this.failureWindowAt=now;this.failures=1;}
    this.performance.failures++;
    if(this.failures>8){this.giveUp=true;this.giveUpReason='recoveries';return;}
    // Alternate the escape side: the same reverse arc that failed once will fail again.
    // A short probe: a hull grazing a hedge reports "blocked" for its whole length,
    // and refusing to reverse is what froze it against the wall.
    const away=this.blockedPose(v,1.2), steer=(-Math.sign(turn||1))*(this.failures%2?1:-1);
    if(!away)this.recovery={mode:'reverse',until:now+1400,steer:steer*.6};
    else if(this.tracked)this.recovery={mode:'pivot',until:now+900,steer:Math.sign(turn||1)};
    else this.recovery={mode:'reverse',until:now+1100,steer:steer*.6};
    this.stall=0;
  }

  tick(v:{x:number;z:number;yaw:number;speed:number},goal:VehicleGoal,now:number):PilotTick{
    if(goal.id!==this.goalId){
      this.goalId=goal.id;this.needsPlan=true;this.path=[];this.index=0;this.reachesGoal=false;
      this.giveUp=false;this.failures=0;this.failureWindowAt=-Infinity;this.recovery=null;this.stall=0;
      this.bestDistance=Infinity;this.progressAt=now;this.lastTick=-1;
    }
    const idle={throttle:0,steer:0,replan:false,giveUp:this.giveUp,reached:false};
    if(this.giveUp){this.debugMode='giveup';return idle;}
    if(this.needsPlan){this.debugMode='plan';return {...idle,replan:true};}

    // Recovery: back out of the wedge, then pivot the nose towards the route.
    if(this.recovery){
      if(now<this.recovery.until){
        // Neither backing up nor pivoting is moving: alternate the maneuver; a
        // hull pinched nose-in against a wall needs a three-point turn, not faith.
        const elapsedRecovery=this.lastTick<0?0:clamp((now-this.lastTick)/1000,0,.6);
        if(Math.abs(v.speed)<.3)this.recoveryStuck+=elapsedRecovery;else this.recoveryStuck=0;
        if(this.recoveryStuck>.7){
          this.recoveryStuck=0;
          this.recovery=this.recovery.mode==='reverse'
            ?{mode:'pivot',until:now+1000,steer:-(this.recovery.steer||1)}
            :{mode:'reverse',until:now+1200,steer:0};
          return {throttle:this.recovery.mode==='reverse'?-.7:0,steer:this.recovery.mode==='reverse'?0:this.recovery.steer,replan:false,giveUp:false,reached:false};
        }
        if(this.recovery.mode==='reverse'){
          this.debugMode='recover-reverse';
          // Keep it straight while the hull is still inside geometry: steering now
          // only grinds the nose back along the wall.
          const jammed=vehiclePoseBlocked(this.world,this.hull,{x:v.x,z:v.z,yaw:v.yaw},{from:v,ignoreId:this.vehicleId});
          return {throttle:-.7,steer:jammed?0:this.recovery.steer*(Math.abs(v.speed)>1.4?1:0),replan:false,giveUp:false,reached:false};
        }
        if(this.arcClear(v,0,this.recovery.steer,.9)){
          this.debugMode='recover-pivot';return {throttle:0,steer:this.recovery.steer,replan:false,giveUp:false,reached:false};
        }
        // Pivot is impossible (hull grazing a wall): back straight up instead.
        this.recovery={mode:'reverse',until:now+1300,steer:0};
        this.debugMode='recover-reverse';
        return {throttle:-.7,steer:0,replan:false,giveUp:false,reached:false};
      }
      if(this.recovery.mode==='reverse'&&this.tracked){
        // Reverse then pivot: backing out leaves the nose pointing at the obstacle,
        // so turn it round before asking for throttle again.
        this.recovery={mode:'pivot',until:now+1100,steer:this.recovery.steer||1};
        return {throttle:0,steer:this.recovery.steer,replan:false,giveUp:false,reached:false};
      }
      this.recovery=null;this.needsPlan=true;this.debugMode='recover-done';
      return {...idle,replan:true};
    }

    // Hull already overlapping geometry (shoved by a blast, bad spawn, scraped a
    // corner): back straight out first, then plan. Steering while embedded makes the
    // arc probe fail on its very first sample and the hull would sit there forever.
    if(this.embeddedUntil>now){
      return {throttle:-.65,steer:0,replan:false,giveUp:false,reached:false};
    }
    if(this.embeddedUntil){
      this.embeddedUntil=0;this.needsPlan=true;
      return {...idle,replan:true};
    }
    if(vehiclePoseBlocked(this.world,this.hull,{x:v.x,z:v.z,yaw:v.yaw},{from:v,ignoreId:this.vehicleId})){
      this.embeddedUntil=now+1400;
      return {throttle:-.65,steer:0,replan:false,giveUp:false,reached:false};
    }

    const distanceToGoal=Math.hypot(goal.x-v.x,goal.z-v.z);
    if(distanceToGoal<goal.radius){this.debugMode='arrived';return {throttle:Math.abs(v.speed)>.4?-Math.sign(v.speed)*.4:0,steer:0,replan:false,giveUp:false,reached:true};}

    // A truncated route is a dead end: drive the reachable part, then stand down.
    if(!this.reachesGoal&&this.index>=this.path.length-1){
      const end=this.path.at(-1);
      if(!end||Math.hypot(end.x-v.x,end.z-v.z)<4){this.giveUp=true;this.giveUpReason='dead-end';this.debugMode='dead-end';return idle;}
    }
    if(this.index>=this.path.length){this.needsPlan=true;this.debugMode='path-end';return {...idle,replan:true};}

    // Wheeled hulls cannot pivot; keep the next corner close instead of
    // cutting a 14 m chord through the inside of a town wall.
    const lookAhead=this.tracked?Math.max(4,Math.min(14,Math.abs(v.speed)*1.1+4)):Math.max(2,Math.min(5,Math.abs(v.speed)*.55+2));
    let cursor=this.index;
    while(cursor<this.path.length-1&&Math.hypot(v.x-this.path[cursor].x,v.z-this.path[cursor].z)<lookAhead){
      const next=this.path[cursor+1];
      // Tracked string-pulling can skip the corner beside C's farmhouse. Keep
      // the last reachable waypoint until the hull can actually take the next.
      if((this.tracked||this.trafficPlan)&&Math.hypot(v.x-this.path[cursor].x,v.z-this.path[cursor].z)>1.8&&!vehicleSegmentClear(this.arena,v.x,v.z,next.x,next.z,this.hull,1.2,.6,this.trafficPlan?{world:this.world,ignoreId:this.vehicleId,knownTeam:this.planningTeam}:undefined))break;
      cursor++;
    }
    this.index=cursor;
    // The smoothed route assumes the hull is already on it; from an off-route pose
    // a long pull can cross the corner. Fall back to the nearest waypoint then.
    let aim=this.path[cursor]??{x:goal.x,z:goal.z};
    if(cursor>this.index||aim!==this.path[cursor])aim=this.path[cursor]??aim;
    if(!vehicleSegmentClear(this.arena,v.x,v.z,aim.x,aim.z,this.hull,2.5,.6))aim=this.path[this.index]??aim;
    let desired=Math.atan2(aim.x-v.x,aim.z-v.z);
    let turn=angleDelta(desired,v.yaw);
    // Keep the actual waypoint bearing when it is behind the hull. Replacing it
    // with the old route tangent can send a jeep indefinitely away from its goal
    // after it overshoots a corner; the tight-turn recovery below handles reversal.
    const absTurn=Math.abs(turn);

    // Stopped against something while the throttle is down: recover on a timer,
    // not on a per-think displacement threshold.
    const elapsed=this.lastTick<0?0:clamp((now-this.lastTick)/1000,0,.6);
    this.lastTick=now;
    if(elapsed>0){
      if(Math.abs(v.speed)<.6&&Math.abs(this.throttle)>.25)this.stall+=elapsed;
      else this.stall=Math.max(0,this.stall-elapsed*.9);
    }
    if(this.stall>1.3){this.startRecovery(now,v,turn);return {throttle:0,steer:0,replan:false,giveUp:this.giveUp,reached:false};}

    // Long-horizon watchdog: a hull that has *moved* nowhere for 30 s is not on its
    // way, even if the straight-line distance to the goal grows on a legitimate
    // detour (the ford route to C goes east first).
    if(now-this.window.at>30000){
      if(Math.hypot(v.x-this.window.x,v.z-this.window.z)<15){this.giveUp=true;this.giveUpReason='no-progress';return idle;}
      this.window={x:v.x,z:v.z,at:now};
    }

    const maxSpeed=this.arena.vehiclePerformance?.(this.kind)?.maxSpeed??vehicleMaxSpeed(this.kind);
    const tight=absTurn>1.45,wide=absTurn>.9,corner=absTurn>.45;
    this.debugTurn=turn;this.debugAim={x:aim.x,z:aim.z};this.debugMode=tight?'tight':wide?'wide':corner?'corner':'cruise';
    let target=tight?0:wide?2.3:corner?3.9:this.tracked?6.4:7.4;
    if(distanceToGoal<goal.radius+9)target=Math.min(target,2+distanceToGoal*.14);

    let throttle=clamp((target-v.speed)*.5,-.5,.85);
    let steer=clamp(turn*2.1,-1,1);
    if(tight&&Math.abs(v.speed)<2){
      if(this.tracked){
        throttle=Math.abs(v.speed)>.6?-Math.sign(v.speed)*.5:0;
        steer=Math.sign(turn)||1;
      }else{
        // Wheeled hulls cannot pivot: reverse while turning the nose round. This
        // must not depend on the current throttle sign — at standstill the computed
        // throttle is 0 and the hull would sit still with full lock forever.
        throttle=-.6;steer=-Math.sign(turn)||1;
      }
    }else if(tight&&Math.abs(v.speed)>=2){
      // Bleed speed before the corner instead of ploughing straight on.
      throttle=Math.min(throttle,-.25);
    }
    // Pure pursuit cuts corners; refuse any command whose real arc would hit something.
    if(!this.arcClear(v,throttle,steer,1.3)){
      const pivot=this.tracked&&Math.abs(turn)>.2&&this.arcClear(v,0,steer,1.1);
      if(pivot){
        this.debugMode='arc-pivot';throttle=0; // pivot/steer on the spot until the arc opens up
      }else if(Math.abs(v.speed)>.6){
        this.debugMode='arc-brake';
        throttle=Math.sign(v.speed)>0?-.55:-.2; // brake first, decide after stopping
      }else{
        this.debugMode='arc-blocked';throttle=0;
        // Stopped and neither driving nor pivoting opens: this is a genuine wedge.
        this.blockedIntent+=elapsed;
        if(this.blockedIntent>1.0){this.blockedIntent=0;this.startRecovery(now,v,turn);return {throttle:0,steer:0,replan:false,giveUp:this.giveUp,reached:false};}
      }
    }else {this.blockedIntent=0;this.brakeIntent=0;this.debugMode=tight?'drive-tight':wide?'drive-wide':corner?'drive-corner':'drive';}

    // Net-motion watchdog: a hull "driving" for 1.2 s without covering a metre is
    // wedged, whatever the instantaneous speed samples say (sawtooth accel/stop).
    this.move.power+=throttle>.2?elapsed:0;
    if(now-this.move.at>=2500){
      const moved=Math.hypot(v.x-this.move.x,v.z-this.move.z);
      if(moved<.6&&this.move.power>1.4){
        this.move={x:v.x,z:v.z,at:now,power:0};
        this.startRecovery(now,v,turn);
        return {throttle:0,steer:0,replan:false,giveUp:this.giveUp,reached:false};
      }
      this.move={x:v.x,z:v.z,at:now,power:0};
    }
    this.throttle=throttle;
    return {throttle,steer,replan:false,giveUp:false,reached:false};
  }
}

/** Exposed for tests: the speed a hull should hold for a given route turn. */
export function pilotCornerSpeed(turn:number,tracked:boolean){
  const absTurn=Math.abs(turn);
  return absTurn>1.45?0:absTurn>.9?2.3:absTurn>.45?3.9:tracked?6.4:7.4;
}

/** Exposed for tests: the yaw rate a hull gets while reversing with `steer`. */
export function reverseSteerRate(speed:number,steer:number,kind:string){
  return hullYawRate(-Math.abs(speed),steer,baseVehicleMaxSpeed(kind),trackedHull(kind));
}
