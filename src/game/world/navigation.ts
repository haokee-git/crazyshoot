import type {Arena} from './arena';
export interface NavigationData {n:number;step:number;minX:number;minZ:number;walk:Uint8Array;ys:Float32Array;connections:Uint8Array;edges?:Int32Array;actions?:Uint8Array;layers?:number;}
export interface Waypoint {x:number;z:number;y?:number;action?:'walk'|'mantle'|'ladder'|'jump';}
/** Up to `layers` support layers per cell preserve bridge/ground/roof/tunnel identities. Shared fields. */
export class Navigation {
 private n:number;private walk:Uint8Array;private ys:Float32Array;private connections:Uint8Array;private edges:Int32Array;private actions:Uint8Array;private fields=new Map<string,Int32Array>();private incomingOffsets?:Uint32Array;private incomingTargets?:Uint32Array;private bfsQueue?:Int32Array;readonly step:number;private plane:number;private layers:number;
 constructor(private arena:Arena,step=3){
  const b=arena.bounds,saved=arena.navigationData;
  this.step=saved?.step??step;
  this.layers=saved?.layers??arena.navigationLayers??3;
  this.n=saved?.n??Math.ceil((b.maxX-b.minX)/this.step)+1;
  this.plane=this.n*this.n;
  if(saved?.edges){this.walk=saved.walk;this.ys=saved.ys;this.connections=saved.connections;this.edges=saved.edges;this.actions=saved.actions??new Uint8Array(saved.edges.length);return;}
  const count=this.plane*this.layers;
  this.walk=new Uint8Array(count);this.ys=new Float32Array(count);this.connections=new Uint8Array(count);this.edges=new Int32Array(count*6).fill(-1);this.actions=new Uint8Array(count*6);
  const maxSupport=arena.maxSupportY??64;
  for(let z=0;z<this.n;z++)for(let x=0;x<this.n;x++){
   const px=b.minX+x*this.step,pz=b.minZ+z*this.step,base=arena.navigationHeight?.(px,pz)??arena.heightAt?.(px,pz)??0;
   const found:number[]=[];let top=this.surface(px,pz,base+1.05);
   if(Number.isFinite(top))found.push(top);
   top=this.surface(px,pz,maxSupport);
   // A tunnel uses `primary` as its floor, so the first sample is below the
   // surface; keep the surface/upper galleries as extra layers. Without this
   // loop the navigation graph only knows the top of the terrain above a tomb.
   for(let j=0;j<12&&Number.isFinite(top);j++){
    if(!found.some(y=>Math.abs(y-top)<.1))found.push(top);
    const below=this.surface(px,pz,top-.05);
    if(below>=top-.01)break;
    top=below;
   }
   const valid=found.filter(y=>Number.isFinite(y)&&!arena.blockedAt?.(px,pz,.4,y)&&!this.isWet(px,pz,y));
   for(let layer=0;layer<Math.min(this.layers,valid.length);layer++){const k=layer*this.plane+z*this.n+x;this.walk[k]=1;this.ys[k]=valid[layer];}
  }
  for(let k=0;k<count;k++){
   if(!this.walk[k])continue;
   const cell=k%this.plane,x=cell%this.n,z=Math.floor(cell/this.n);
   const cells=[x>0?cell-1:-1,x<this.n-1?cell+1:-1,z>0?cell-this.n:-1,z<this.n-1?cell+this.n:-1];
   for(let dir=0;dir<4;dir++){
    if(cells[dir]<0)continue;
    let best=-1,diff=Infinity,action=0;
    for(let layer=0;layer<this.layers;layer++){
     const next=layer*this.plane+cells[dir];if(!this.walk[next])continue;
     const dy=Math.abs(this.ys[next]-this.ys[k]);if(dy>1.8||dy>=diff)continue;
     let pass=this.edge(k,next);if(pass<0&&this.jumpEdge(k,next))pass=3;if(pass<0)continue;
     best=next;diff=dy;action=pass;
    }
    if(best>=0){this.edges[k*6+dir]=best;this.actions[k*6+dir]=action;this.connections[k]|=1<<dir;}
   }
  }
  for(const l of arena.ladders??[]){const a=this.index(l.x+l.normalX*.7,l.z+l.normalZ*.7,l.bottom),c=this.index(l.exitX,l.exitZ,l.top);if(this.walk[a]&&this.walk[c]&&a!==c){this.edges[a*6+4]=c;this.edges[c*6+5]=a;this.actions[a*6+4]=this.actions[c*6+5]=2;}}
  // Authored portals across 1.5–2 m doors / stone bollards / stair lips that a
  // 3 m grid cannot resolve. The world still has real collision; this only tells
  // the shared flow field that the two cells are physically reachable.
  for(const link of arena.navLinks??[]){
   const a=this.index(link.ax,link.az,link.ay),b=this.index(link.bx,link.bz,link.by);
   if(a===b||!this.walk[a]||!this.walk[b])continue;
   let slot=-1;
   for(let j=0;j<6;j++)if(this.edges[a*6+j]<0&&this.edges[b*6+((j+3)%6)]<0){slot=j;break;}
   if(slot<0)continue;
   this.edges[a*6+slot]=b;this.edges[b*6+((slot+3)%6)]=a;
   this.actions[a*6+slot]=0;this.actions[b*6+((slot+3)%6)]=0;
   this.connections[a]|=1<<slot;this.connections[b]|=1<<((slot+3)%6);
  }
 }
 private point(k:number){const c=k%this.plane;return{x:this.arena.bounds.minX+c%this.n*this.step,z:this.arena.bounds.minZ+Math.floor(c/this.n)*this.step,y:this.ys[k]};}
 private surface(x:number,z:number,max:number){const at=(sx:number,sz:number)=>this.arena.supportAt?.(sx,sz,max)??this.arena.heightAt?.(sx,sz)??0;return Math.max(at(x,z),at(x-.385,z),at(x+.385,z),at(x,z-.385),at(x,z+.385),at(x-.272,z-.272),at(x+.272,z-.272),at(x-.272,z+.272),at(x+.272,z+.272));}
 private isWet(x:number,z:number,y:number){const water=this.arena.waterAt?.(x,z,y);return !!water&&y<water.surface-.015;}
 private edge(from:number,to:number){const a=this.point(from),b=this.point(to),count=Math.ceil(this.step/.3);let y=a.y,action=0;for(let i=1;i<=count;i++){const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,next=this.surface(x,z,y+1.8);if(!Number.isFinite(next)||Math.abs(next-y)>1.8||this.arena.blockedAt?.(x,z,.38,Math.max(y,next))||this.isWet(x,z,next))return -1;if(next-y>1.05)action=1;y=next;}return Math.abs(y-b.y)<.1?action:-1;}
 private jumpEdge(from:number,to:number){const a=this.point(from),b=this.point(to),distance=Math.hypot(b.x-a.x,b.z-a.z);if(distance>3.1||Math.abs(b.y-a.y)>.6)return false;for(let t=0;t<=.78;t+=1/60){const moved=Math.min(distance,t*5.3),x=a.x+(b.x-a.x)*moved/distance,z=a.z+(b.z-a.z)*moved/distance,y=a.y+6.6*t-9*t*t;if(t>.15&&y<=b.y&&moved>=distance-.02)return !this.arena.blockedAt?.(b.x,b.z,.4,b.y);if(this.arena.blockedAt?.(x,z,.4,y))return false;}return false;}
 data():NavigationData{return{n:this.n,step:this.step,minX:this.arena.bounds.minX,minZ:this.arena.bounds.minZ,walk:this.walk,ys:this.ys,connections:this.connections,edges:this.edges,actions:this.actions,layers:this.layers};}
 private index(x:number,z:number,y?:number){const cell=Math.max(0,Math.min(this.n-1,Math.round((z-this.arena.bounds.minZ)/this.step)))*this.n+Math.max(0,Math.min(this.n-1,Math.round((x-this.arena.bounds.minX)/this.step)));let best=cell,diff=Infinity;const height=y??this.arena.navigationHeight?.(x,z)??0;for(let layer=0;layer<this.layers;layer++){const k=cell+layer*this.plane;if(this.walk[k]&&Math.abs(this.ys[k]-height)<diff){best=k;diff=Math.abs(this.ys[k]-height);}}return best;}
 /** Flat reverse adjacency (CSR): one typed array instead of 1.3M tiny JS arrays. */
 private buildIncoming(){
  if(this.incomingOffsets)return;
  const offsets=new Uint32Array(this.walk.length+1);
  for(let k=0;k<this.walk.length;k++)for(let j=0;j<6;j++){const next=this.edges[k*6+j];if(next>=0)offsets[next+1]++;}
  for(let i=1;i<offsets.length;i++)offsets[i]+=offsets[i-1];
  const targets=new Uint32Array(offsets[offsets.length-1]),cursor=offsets.slice(0,offsets.length-1);
  for(let k=0;k<this.walk.length;k++)for(let j=0;j<6;j++){const next=this.edges[k*6+j];if(next>=0)targets[cursor[next]++]=k;}
  this.incomingOffsets=offsets;this.incomingTargets=targets;
 }
 private field(x:number,z:number,desiredY=this.arena.navigationHeight?.(x,z)??0){
  const goal=this.index(x,z,desiredY),key=goal+':'+Math.round(desiredY*2);
  const cached=this.fields.get(key);
  if(cached){this.fields.delete(key);this.fields.set(key,cached);return cached;}
  // Each field is a full Int32Array of the nav grid. 1000 m maps have >1M
  // layer cells, so the cache must shrink with the map instead of promising 48.
  const FIELD_CACHE_LIMIT=this.walk.length>500_000?24:Math.max(8,Math.min(48,Math.floor(4_000_000/this.walk.length)));
  this.buildIncoming();
  const offsets=this.incomingOffsets!,targets=this.incomingTargets!;
  let seed=goal;
  if(!this.walk[seed]){
   let best=Infinity;
   for(let k=0;k<this.walk.length;k++)if(this.walk[k]){
    const p=this.point(k),distance=(p.x-x)**2+(p.z-z)**2+(p.y-desiredY)**2*9;
    if(distance<best){seed=k;best=distance;}
   }
  }
  const d=new Int32Array(this.walk.length).fill(-1);
  const queue=this.bfsQueue&&this.bfsQueue.length>=d.length?this.bfsQueue:new Int32Array(d.length);this.bfsQueue=queue;
  let head=0,tail=0;queue[tail++]=seed;d[seed]=0;
  while(head<tail){const k=queue[head++];for(let i=offsets[k];i<offsets[k+1];i++){const next=targets[i];if(d[next]<0){d[next]=d[k]+1;queue[tail++]=next;}}}
  this.fields.set(key,d);
  while(this.fields.size>FIELD_CACHE_LIMIT){const oldest=this.fields.keys().next().value;if(oldest===undefined)break;this.fields.delete(oldest);}
  return d;
 }
 next(x:number,z:number,gx:number,gz:number,y?:number,goalY?:number,penalty?:(point:Waypoint)=>number):Waypoint|null{
  const distances=this.field(gx,gz,goalY),k=this.index(x,z,y),remaining=distances[k];
  if(remaining<0)return null;
  let best=k,score=Infinity,action=0;
  for(let j=0;j<6;j++){
   const next=this.edges[k*6+j];
   if(next<0||distances[next]<0||distances[next]>=remaining)continue;
   const candidate=distances[next]+(penalty?.(this.point(next))??0);
   if(candidate<score){best=next;score=candidate;action=this.actions[k*6+j];}
  }
  return this.waypoint(best,action);
 }
 private waypoint(key:number,action:number):Waypoint{
  return{...this.point(key),action:action===3?'jump':action===2?'ladder':action===1?'mantle':'walk'};
 }
 /** In a crowded or exposed approach, allow a short detour that starts sideways or backwards. */
 detour(x:number,z:number,gx:number,gz:number,y:number,penalty:(point:Waypoint)=>number):Waypoint[]{
  const distances=this.field(gx,gz),start=this.index(x,z,y),remaining=distances[start];
  if(remaining<=1)return [];
  const horizon=Math.max(0,remaining-5),open=[{key:start,cost:0,priority:remaining-horizon}];
  const visited=new Map<number,{cost:number;parent:number;action:number}>([[start,{cost:0,parent:-1,action:0}]]);
  const penalties=new Map<number,number>();
  for(let i=0;i<88&&open.length;i++){
   let best=0;
   for(let j=1;j<open.length;j++)if(open[j].priority<open[best].priority)best=j;
   const node=open[best];open[best]=open[open.length-1];open.pop();
   if(node.cost!==visited.get(node.key)?.cost)continue;
   if(distances[node.key]<=horizon){
    const path:Waypoint[]=[];
    for(let key=node.key;key!==start;){
     const entry=visited.get(key)!;
     path.push(this.waypoint(key,entry.action));key=entry.parent;
    }
    return path.reverse();
   }
   for(let j=0;j<6;j++){
    const edge=node.key*6+j,key=this.edges[edge],steps=distances[key];
    if(key<0||steps<0||steps>remaining+3)continue;
    let extra=penalties.get(key);
    if(extra===undefined){extra=penalty(this.point(key));penalties.set(key,extra);}
    const cost=node.cost+1+extra;
    if(cost>=(visited.get(key)?.cost??Infinity))continue;
    visited.set(key,{cost,parent:node.key,action:this.actions[edge]});
    open.push({key,cost,priority:cost+Math.max(0,steps-horizon)});
   }
  }
  return [];
 }
 routeSteps(x:number,z:number,gx:number,gz:number,y:number,goalY:number){
  const steps=this.field(gx,gz,goalY)[this.index(x,z,y)];
  return steps<0?Infinity:steps;
 }
 reachable(x:number,z:number,gx:number,gz:number){return this.field(gx,gz)[this.index(x,z)]>=0;}
}
