export type DangerTeam='blue'|'orange';
export interface DangerBypass {id:number; x:number; z:number;}
interface Hotspot {id:number;team:DangerTeam;x:number;z:number;count:number;at:number;}

/** Bounded team memory of recent losses; persists after corpses disappear. */
export class BattleDanger {
 private readonly spots:Hotspot[]=[];
 private nextId=1;
 clear(){this.spots.length=0;this.nextId=1;}
 record(team:DangerTeam,x:number,z:number,now:number){
  const candidates=this.spots.filter(s=>s.team===team&&now-s.at<60000&&Math.hypot(s.x-x,s.z-z)<12);
  const spot=candidates.sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];
  if(spot){spot.count=Math.min(8,spot.count+1);spot.at=now;return;}
  if(this.spots.length>=32){let oldest=0;for(let i=1;i<this.spots.length;i++)if(this.spots[i].at<this.spots[oldest].at)oldest=i;this.spots.splice(oldest,1);}
  this.spots.push({id:this.nextId++,team,x:Math.round(x/3)*3,z:Math.round(z/3)*3,count:1,at:now});
 }
 penalty(team:DangerTeam,x:number,z:number,now:number){
  let score=0;
  for(const spot of this.spots){const age=now-spot.at;if(spot.team!==team||spot.count<2||age<0||age>=60000)continue;
   const distance=Math.hypot(x-spot.x,z-spot.z);if(distance<20)score+=Math.min(36,spot.count*8)*(1-distance/20)*(1-age/60000);
  }
  return score;
 }
 /** Fixed bypasses shared by a squad: do not generate a new flow field each step. */
 bypasses(team:DangerTeam,from:{x:number;z:number},goal:{x:number;z:number},now:number,ignoreId?:number):DangerBypass[]{
  const dx=goal.x-from.x,dz=goal.z-from.z,length=Math.hypot(dx,dz);if(length<20)return [];
  let best:Hotspot|undefined,bestDistance=Infinity;
  for(const spot of this.spots){
   const age=now-spot.at;if(spot.team!==team||spot.count<2||age<0||age>=60000||spot.id===ignoreId)continue;
   const sx=spot.x-from.x,sz=spot.z-from.z,along=(sx*dx+sz*dz)/length;
   if(along< -8||along>Math.min(length+12,65))continue;
   const side=Math.abs(sx*dz-sz*dx)/length;if(side>21)continue;
   const distance=Math.hypot(sx,sz);if(distance<bestDistance){best=spot;bestDistance=distance;}
  }
  if(!best)return [];
  // The two alternatives depend only on hotspot and objective, so teammates
  // share the same cached navigation fields instead of rebuilding them per bot.
  let gx=goal.x-best.x,gz=goal.z-best.z;const gl=Math.hypot(gx,gz);
  if(gl<1){gx=dx/length;gz=dz/length;}else{gx/=gl;gz/=gl;}
  return [-1,1].map(sign=>({id:best!.id,x:Math.round((best!.x-gz*24*sign)/3)*3,z:Math.round((best!.z+gx*24*sign)/3)*3}));
 }
}
