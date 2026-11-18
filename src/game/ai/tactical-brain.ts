import type {BotRole} from './bot-loadout';
export type TacticalAction='advance'|'assault'|'flank'|'overwatch'|'withdraw'|'reposition';
export interface CombatPicture {
 role:BotRole;health:number;ammoRatio:number;reloading:boolean;visible:boolean;contactAge:number;
 distance:number;targetArmored:boolean;underFire:boolean;allies:number;enemies:number;
 objectiveUrgency:number;danger:number;moving:number;hasCover:boolean;blockedShot?:boolean;depleted?:boolean;resupplying?:boolean;
}
export interface TacticalDecision {action:TacticalAction;score:number;until:number;reason:string;}
export function preferredCombatRange(role:BotRole){return role==='shotgun'?12:role==='smg'?19:role==='sniper'?95:role==='marksman'?65:role==='lmg'?48:34;}
/** Utility arbitration with commitment: a changed battle can interrupt a plan,
 * small score noise cannot make the bot change its mind every think tick. */
export function decideInfantry(p:CombatPicture,now:number,seed:number,previous?:TacticalDecision):TacticalDecision {
 const range=preferredCombatRange(p.role),outnumbered=Math.max(0,p.enemies-p.allies-1),close=p.distance<range*.48;
 const danger=Math.min(1,p.danger/30),hurt=Math.max(0,(55-p.health)/55),pressure=p.underFire?1:0;
 const dry=p.reloading||p.ammoRatio<.08,advantage=Math.min(2,Math.max(-2,p.allies-p.enemies));
 const scores:Record<TacticalAction,number>={
  advance:!p.visible?55+p.objectiveUrgency*24-danger*15:15+p.objectiveUrgency*14,
  assault:p.visible?25+advantage*8+p.objectiveUrgency*14+(p.distance>range?16:0)+(p.role==='smg'||p.role==='shotgun'?14:0)-hurt*35-outnumbered*10-danger*12:5,
  flank:p.visible?30+(p.blockedShot?35:0)+(p.distance>range*1.3?18:0)+outnumbered*6+danger*12+(p.role==='smg'?9:0)-hurt*15:15,
  overwatch:p.visible?40-(p.blockedShot?45:0)+(p.distance>range*.65&&p.distance<range*1.8?14:0)+(p.role==='sniper'||p.role==='lmg'||p.role==='marksman'?12:0)+(p.hasCover?12:0)-(close?35:0)-pressure*10:9,
  withdraw:10+hurt*60+(!p.visible&&p.health<28?45:0)+(p.depleted?90:0)+(p.resupplying?85:0)+outnumbered*13+pressure*18+(dry?40:0)+(p.targetArmored?50:0)+(close&&(p.role==='sniper'||p.role==='marksman')?35:0)-(p.hasCover?12:0),
  reposition:!p.visible&&p.contactAge<2500?62+(p.distance<35?25:0)+pressure*12+(dry?15:0):20+pressure*16+(dry?20:0),
 };
 if(!p.visible&&p.contactAge>6000&&!p.underFire&&!dry&&p.health>40&&!p.resupplying){scores.withdraw-=30;scores.flank-=10;}
 if(dry){scores.assault-=50;scores.overwatch-=25;}
 const actions=Object.keys(scores) as TacticalAction[];
 let action:TacticalAction='advance',best=-Infinity;
 for(let i=0;i<actions.length;i++){const a=actions[i],value=scores[a]+((seed+i*7)%5-2)*.8;if(value>best){best=value;action=a;}}
 const emergency=!!p.depleted||(p.health<28&&p.underFire)||p.targetArmored||(dry&&p.visible&&p.distance<30);
 if(previous&&!emergency&&previous.action!==action&&((now<previous.until&&best<scores[previous.action]+20)||best<scores[previous.action]+8))action=previous.action;
 return {action,score:scores[action],until:previous?.action===action?previous.until:now+1100+seed%600,
  reason:action==='withdraw'?'preserve combat strength':action==='flank'?'change the firing angle':action==='overwatch'?'use range and a firing position':action==='reposition'?'recover contact from another position':action==='assault'?'local advantage or objective pressure':'advance with the team'};
}
export interface TacticalPosition {x:number;z:number;y:number;cover:number;distance:number;progress:number;travel:number;danger:number;}
/** Movement candidates are validated against the real arena by the caller. */
export function positionUtility(action:TacticalAction,p:TacticalPosition,desiredRange:number){
 const rangeError=Math.abs(p.distance-desiredRange);
 if(action==='withdraw')return p.cover*32+p.distance*.9-p.travel*.6-p.danger*1.5;
 if(action==='flank'||action==='reposition')return p.cover*12+p.progress*1.5-rangeError*.22-p.danger;
 if(action==='overwatch')return p.cover*20-rangeError*.4-p.travel*.7-p.danger;
 return p.progress*2+p.cover*7-rangeError*.2-p.danger;
}
