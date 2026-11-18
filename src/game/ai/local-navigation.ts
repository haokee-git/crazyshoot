import type {Arena} from '../world/arena';
import type {Waypoint} from '../world/navigation';
interface AgentMemory {x:number;z:number;stalled:number;time:number;path:Waypoint[];replan:number;jumpGoal?:Waypoint;jumpStarted?:number;}
/** Bounded local A*: dynamic occupancy is sampled only for a stuck agent, never the whole map. */
export class LocalNavigation {
 private agents=new Map<string,AgentMemory>();private nextPlanAt=0;private actorId='';
 constructor(private arena:Arena){}
 jumpWaypoint(id:string,now:number){const m=this.agents.get(id);return m?.jumpGoal&&now-(m.jumpStarted??0)<900?m.jumpGoal:null;}
 private ground(x:number,z:number,y:number){return this.arena.supportAt?.(x,z,y+1.8)??this.arena.heightAt?.(x,z)??0;}
 private pass(x:number,z:number,y:number){
  const next=this.ground(x,z,y);
  if(!Number.isFinite(next)||Math.abs(next-y)>1.8)return false;
  const water=this.arena.waterAt?.(x,z,next);
  if(water&&next<water.surface-.015)return false;
  // A player steps off the edge at its current height and then falls.
  const feet=Math.max(y,next);
  return !(this.arena.playerBlocked?.(x,z,.41,feet,1.8,this.actorId)??this.arena.blockedAt?.(x,z,.41,feet));
 }
 private plan(x:number,z:number,y:number,gx:number,gz:number){
  const N=29,R=14,count=N*N,start=R*N+R,dist=new Float32Array(count).fill(Infinity),parent=new Int32Array(count).fill(-1),height=new Float32Array(count),closed=new Uint8Array(count),open=[start];dist[start]=0;height[start]=y;let best=start,bestH=Infinity;
  const world=(k:number)=>({x:x+k%N-R,z:z+Math.floor(k/N)-R});
  for(let budget=0;open.length&&budget<650;budget++){let slot=0,score=Infinity;for(let i=0;i<open.length;i++){const p=world(open[i]),s=dist[open[i]]+Math.hypot(p.x-gx,p.z-gz);if(s<score){score=s;slot=i;}}const k=open.splice(slot,1)[0];if(closed[k])continue;closed[k]=1;const p=world(k),heuristic=Math.hypot(p.x-gx,p.z-gz);if(heuristic<bestH){bestH=heuristic;best=k;}if(heuristic<1.2)break;
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=k%N+dx,zz=Math.floor(k/N)+dz;if(xx<0||xx>=N||zz<0||zz>=N)continue;const next=zz*N+xx;if(closed[next])continue;const q=world(next),midX=(p.x+q.x)/2,midZ=(p.z+q.z)/2;if(!this.pass(q.x,q.z,height[k])||!this.pass(midX,midZ,height[k]))continue;const h=this.ground(q.x,q.z,height[k]),cost=dist[k]+1+(h-height[k]>1.05?2:0);if(cost<dist[next]){dist[next]=cost;height[next]=h;parent[next]=k;open.push(next);}}
  }
  const path:Waypoint[]=[];for(let k=best;k!==start&&k>=0;k=parent[k]){const q=world(k),prev=parent[k];path.push({...q,y:height[k],action:prev>=0&&height[k]-height[prev]>1.05?'mantle':'walk'});}return path.reverse();
 }
 steer(id:string,x:number,z:number,y:number,target:Waypoint,now:number,canMantle?:(dx:number,dz:number)=>boolean){
  this.actorId=id;let m=this.agents.get(id);if(!m){m={x,z,stalled:0,time:now,path:[],replan:0};this.agents.set(id,m);}
  if(target.action==='jump'&&!m.jumpGoal){m.jumpGoal={...target};m.jumpStarted=now;}
  if(m.jumpGoal){const age=now-(m.jumpStarted??0),dx=m.jumpGoal.x-x,dz=m.jumpGoal.z-z,length=Math.hypot(dx,dz);if(age<900)return{dx:length>.35?dx/length:0,dz:length>.35?dz/length:0,mantle:false,jump:age<180,stalled:0};m.jumpGoal=undefined;}
  const progressGoal=m.path[0]??target;
  const distance=Math.hypot(progressGoal.x-x,progressGoal.z-z);
  const progress=Math.hypot(progressGoal.x-m.x,progressGoal.z-m.z)-distance;
  const elapsed=Math.min(.4,Math.max(.01,(now-m.time)/1000));
  m.stalled=distance>.65?Math.max(0,m.stalled+elapsed-progress/2.4):0;
  m.time=now;m.x=x;m.z=z;
  if(m.stalled>1.4&&now>m.replan&&now>=this.nextPlanAt){this.nextPlanAt=now+40;m.path=this.plan(x,z,y,target.x,target.z);m.replan=now+1800;m.stalled=.7;}
  while(m.path.length&&Math.hypot(m.path[0].x-x,m.path[0].z-z)<.45)m.path.shift();
  const goal=m.path[0]??target,dx=goal.x-x,dz=goal.z-z,len=Math.hypot(dx,dz);if(len<.35)return{dx:0,dz:0,mantle:false,jump:false,stalled:m.stalled};
  const vx=dx/len,vz=dz/len,probe=Math.min(len,.9);
  if(canMantle&&(goal.action==='mantle'||!this.pass(x+vx*probe,z+vz*probe,y))&&canMantle(vx,vz)){
   return{dx:vx,dz:vz,mantle:true,jump:false,stalled:m.stalled};
  }
  let bestScore=-Infinity,bx=0,bz=0,mantle=false;const heading=Math.atan2(dz,dx);
  for(const offset of [0,.45,-.45,.9,-.9,1.4,-1.4,2.1,-2.1,Math.PI]){const a=heading+offset,vx=Math.cos(a),vz=Math.sin(a);let clear=true,highest=y;for(const d of [.35,.7,1.15]){if(!this.pass(x+vx*d,z+vz*d,highest)){clear=false;break;}highest=this.ground(x+vx*d,z+vz*d,highest);}if(!clear)continue;const score=Math.cos(offset)*2-Math.abs(offset)*.1;if(score>bestScore){bestScore=score;bx=vx;bz=vz;mantle=highest-y>1.05;}}
  return{dx:bx,dz:bz,mantle,jump:false,stalled:m.stalled};
 }
 forget(id:string){this.agents.delete(id);}
}
