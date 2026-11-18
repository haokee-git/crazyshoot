export interface ArmoredObjective {id:string;x:number;z:number;owner:string;r?:number;progress?:number;base?:boolean;}
export interface ArmoredAssignment {id:string;team:string;objective:string;active:boolean;}
export interface ObjectiveSituation {enemies:number;armor:number;support:number;danger:number;blocked:boolean;}
export type ArmoredAction='capture'|'support'|'defend'|'intercept'|'regroup'|'resupply';
export interface ArmoredDecision {action:ArmoredAction;objective:ArmoredObjective;score:number;until:number;reason:string;}
export interface ArmoredContext {
 kind?:string;health?:number;ammo?:number;now?:number;previous?:ArmoredDecision;
 ownBase?:{x:number;z:number};assignmentWeight?:number;situations?:ReadonlyMap<string,ObjectiveSituation>;
}
/** All objectives remain eligible. A threatened friendly point can outweigh an
 * offensive opportunity; a quiet home point cannot win on distance alone. */
export function decideArmoredObjective(team:string,vehicle:{x:number;z:number},objectives:readonly ArmoredObjective[],assignments:readonly ArmoredAssignment[],driverId:string,enemyBase?:{x:number;z:number},context:ArmoredContext={}):ArmoredDecision|undefined {
 const now=context.now??0,health=context.health??1,ammo=context.ammo??1,tank=context.kind==='light_tank'||context.kind==='mbt'||context.kind==='ifv';
 const recovering=context.previous?.action==='resupply'&&(health<.8||ammo<.3);
 const offensive=objectives.some(c=>c.owner!==team&&!c.base),candidates:ArmoredDecision[]=[];
 const baseDistance=context.ownBase&&enemyBase?Math.max(50,Math.hypot(context.ownBase.x-enemyBase.x,context.ownBase.z-enemyBase.z)):300;
 for(const c of objectives){
  const situation=context.situations?.get(c.id),enemies=situation?.enemies??0,armor=situation?.armor??0,support=situation?.support??0;
  let assigned=0;for(const ally of assignments)if(ally.id!==driverId&&ally.active&&ally.team===team&&ally.objective===c.id)assigned++;
  const distance=Math.hypot(c.x-vehicle.x,c.z-vehicle.z),friendly=c.owner===team;
  const midpoint=context.ownBase&&enemyBase?{x:(context.ownBase.x+enemyBase.x)*.5,z:(context.ownBase.z+enemyBase.z)*.5}:undefined;
  const central=midpoint?Math.max(0,1-Math.hypot(c.x-midpoint.x,c.z-midpoint.z)/(baseDistance*.55)):0;
  let action:ArmoredAction=friendly?'defend':'capture';
  let score=(friendly?(offensive?-10:50):82)-Math.min(70,distance*(offensive?.35:.1)*300/baseDistance)-assigned*(context.assignmentWeight??(friendly?17:26));
  score+=central*(tank?42:12)+(enemies>0?Math.min(12,support*2):-Math.min(18,support*3));
  if(!offensive&&friendly&&enemyBase)score-=Math.hypot(c.x-enemyBase.x,c.z-enemyBase.z)*.3*300/baseDistance;
  if(enemies>0){
   action=friendly?'defend':support>0?'support':armor>0&&tank?'intercept':'capture';
   score+=Math.min(45,enemies*12)+(friendly?80:0)+(tank?armor*24:armor*-20);
   score-=Math.max(0,enemies-support-2)*(tank?5:12);
  }
  score-=Math.min(30,situation?.danger??0)*(health<.5?1:.32);
  if(situation?.blocked)score-=70;
  if(c.base){action=health<.4||ammo<.08||recovering?'resupply':'regroup';score=(health<.4?140+(1-health)*25:ammo<.08?155:recovering?145:0)-distance*.16;}
  else{if(health<.3&&enemies>support)score-=75;if(ammo<.04)score-=110;}
  candidates.push({action,objective:c,score,until:now+4800,reason:c.base?'restore fighting strength':enemies>0?'respond to observed pressure':friendly?'cover the front':'gain control with team support'});
 }
 candidates.sort((a,b)=>b.score-a.score);
 let decision=candidates[0];if(!decision)return;
 const previous=context.previous,existing=previous&&candidates.find(c=>c.objective.id===previous.objective.id);
 const completed=previous?.action==='capture'&&existing?.objective.owner===team&&(context.situations?.get(existing.objective.id)?.enemies??0)===0;
 const emergency=health<.28||ammo<.04;
 if(existing&&!completed&&!emergency&&existing.objective.id!==decision.objective.id&&decision.score<existing.score+(now<(previous?.until??0)?20:12))decision={...existing,until:previous!.until};
 else if(existing?.objective.id===decision.objective.id)decision={...decision,until:previous!.until};
 return decision;
}
export function chooseArmoredObjective<T extends ArmoredObjective>(team:string,vehicle:{x:number;z:number},objectives:readonly T[],assignments:readonly ArmoredAssignment[],driverId:string,enemyBase?:{x:number;z:number}):T|undefined {
 const result=decideArmoredObjective(team,vehicle,objectives,assignments,driverId,enemyBase);
 return objectives.find(c=>c.id===result?.objective.id);
}
