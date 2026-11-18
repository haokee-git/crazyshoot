export interface TacticalContact {id:string;x:number;y:number;z:number;at:number;armor:boolean;vx:number;vz:number;}
/** Radio reports contain observed positions only; hidden enemies are never read
 * back from the live entity table by strategic decisions. */
export class TacticalMemory {
 private readonly teams={blue:new Map<string,TacticalContact>(),orange:new Map<string,TacticalContact>()};
 clear(){this.teams.blue.clear();this.teams.orange.clear();}
 observe(team:'blue'|'orange',id:string,p:{x:number;y:number;z:number},armor:boolean,now:number){
  const contacts=this.teams[team],old=contacts.get(id),dt=old?Math.max(.001,(now-old.at)/1000):1;
  if(old){old.vx=dt<1?Math.max(-12,Math.min(12,(p.x-old.x)/dt)):0;old.vz=dt<1?Math.max(-12,Math.min(12,(p.z-old.z)/dt)):0;Object.assign(old,{x:p.x,y:p.y,z:p.z,armor,at:now});}
  else{if(contacts.size>=64)contacts.delete(contacts.keys().next().value!);contacts.set(id,{id,...p,armor,at:now,vx:0,vz:0});}
 }
 contacts(team:'blue'|'orange'){return this.teams[team].values();}
}
