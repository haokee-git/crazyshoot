/** Fixed-step guest input stays at 60 Hz; large authoritative world snapshots
 * are sent less often so AI-heavy rooms do not saturate the host's uplink. */
export function liveNetworkInterval(isHost:boolean,active:boolean,guestCount:number,playerCount:number){
 let interval=active&&guestCount<8?1000/60:active&&guestCount<12?1000/30:50;
 if(isHost&&active&&playerCount>=32)interval=Math.max(interval,playerCount>=64?50:1000/30);
 return interval;
}
