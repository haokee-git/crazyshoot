import * as THREE from 'three';

export interface WorldBox { x:number; z:number; w:number; d:number; rot:number; bottom:number; top:number; standable?:boolean }
// Slab intersection in the box's local frame. Thin walls are tested analytically.
export function rayBoxDistance(origin:THREE.Vector3, dir:THREE.Vector3, b:WorldBox, max=Infinity):number {
  const c=Math.cos(b.rot),s=Math.sin(b.rot),dx=origin.x-b.x,dz=origin.z-b.z;
  const os=[dx*c-dz*s,origin.y,dx*s+dz*c], ds=[dir.x*c-dir.z*s,dir.y,dir.x*s+dir.z*c];
  const mins=[-b.w/2,b.bottom,-b.d/2],maxs=[b.w/2,b.top,b.d/2];let lo=0,hi=max;
  for(let i=0;i<3;i++){if(Math.abs(ds[i])<1e-10){if(os[i]<mins[i]||os[i]>maxs[i])return Infinity;continue;}
    let a=(mins[i]-os[i])/ds[i],e=(maxs[i]-os[i])/ds[i];if(a>e)[a,e]=[e,a];lo=Math.max(lo,a);hi=Math.min(hi,e);if(lo>hi)return Infinity;}
  return lo;
}
export function boxesOverlapXZ(a:WorldBox,b:WorldBox){const ax=Math.cos(a.rot),az=-Math.sin(a.rot),bx=Math.sin(a.rot),bz=Math.cos(a.rot),cx=Math.cos(b.rot),cz=-Math.sin(b.rot),dx=Math.sin(b.rot),dz=Math.cos(b.rot),tx=b.x-a.x,tz=b.z-a.z;for(const [nx,nz] of [[ax,az],[bx,bz],[cx,cz],[dx,dz]]){const ar=Math.abs(nx*ax+nz*az)*a.w/2+Math.abs(nx*bx+nz*bz)*a.d/2,br=Math.abs(nx*cx+nz*cz)*b.w/2+Math.abs(nx*dx+nz*dz)*b.d/2;if(Math.abs(tx*nx+tz*nz)>ar+br)return false;}return true;}
export class WorldQueries {
  private grid=new Map<string,WorldBox[]>();
  private candidates=new Set<WorldBox>();
  constructor(readonly boxes:WorldBox[],readonly ground:(x:number,z:number)=>number,readonly cell=16){
    for(const b of boxes){const r=Math.hypot(b.w,b.d)/2;for(let x=Math.floor((b.x-r)/cell);x<=Math.floor((b.x+r)/cell);x++)for(let z=Math.floor((b.z-r)/cell);z<=Math.floor((b.z+r)/cell);z++){const k=`${x},${z}`;const a=this.grid.get(k)??[];a.push(b);this.grid.set(k,a);}}
  }
  private near(x:number,z:number,r=0){this.candidates.clear();for(let ix=Math.floor((x-r)/this.cell);ix<=Math.floor((x+r)/this.cell);ix++)for(let iz=Math.floor((z-r)/this.cell);iz<=Math.floor((z+r)/this.cell);iz++)for(const b of this.grid.get(`${ix},${iz}`)??[])this.candidates.add(b);return this.candidates;}
  support(x:number,z:number,maxY=Infinity){let y=this.ground(x,z);for(const b of this.near(x,z)){if(b.standable===false||b.top>maxY+0.001)continue;const c=Math.cos(b.rot),s=Math.sin(b.rot),dx=x-b.x,dz=z-b.z;if(Math.abs(dx*c-dz*s)<=b.w/2&&Math.abs(dx*s+dz*c)<=b.d/2)y=Math.max(y,b.top);}return y;}
  blocked(x:number,z:number,r:number,feet:number,height=1.8){for(const b of this.near(x,z,r)){if(b.top<=feet+0.03||b.bottom>=feet+height)continue;const c=Math.cos(b.rot),s=Math.sin(b.rot),dx=x-b.x,dz=z-b.z;if(Math.abs(dx*c-dz*s)<b.w/2+r&&Math.abs(dx*s+dz*c)<b.d/2+r)return true;}return false;}
  footprintBlocked(x:number,z:number,w:number,d:number,yaw:number,bottom:number,height:number){
    const ax=Math.cos(yaw),az=-Math.sin(yaw),bx=Math.sin(yaw),bz=Math.cos(yaw);
    for(const b of this.near(x,z,Math.hypot(w,d)/2)){if(b.top<=bottom+.04||b.bottom>=bottom+height)continue;const cx=Math.cos(b.rot),cz=-Math.sin(b.rot),dx=Math.sin(b.rot),dz=Math.cos(b.rot),tx=b.x-x,tz=b.z-z;
      let separated=false;for(const [nx,nz] of [[ax,az],[bx,bz],[cx,cz],[dx,dz]]){const a=Math.abs(nx*ax+nz*az)*w/2+Math.abs(nx*bx+nz*bz)*d/2,c=Math.abs(nx*cx+nz*cz)*b.w/2+Math.abs(nx*dx+nz*dz)*b.d/2;if(Math.abs(tx*nx+tz*nz)>a+c){separated=true;break;}}if(!separated)return true;
    }return false;
  }
  ray(origin:THREE.Vector3,dir:THREE.Vector3,max:number){
    let nearest=max;const found=new Set<WorldBox>();
    // Grid DDA along the horizontal ray, including all crossed cells.
    let ix=Math.floor(origin.x/this.cell),iz=Math.floor(origin.z/this.cell),t=0;
    const sx=Math.sign(dir.x),sz=Math.sign(dir.z),tx=dir.x?this.cell/Math.abs(dir.x):Infinity,tz=dir.z?this.cell/Math.abs(dir.z):Infinity;
    let nx=dir.x?((sx>0?(ix+1)*this.cell:ix*this.cell)-origin.x)/dir.x:Infinity;
    let nz=dir.z?((sz>0?(iz+1)*this.cell:iz*this.cell)-origin.z)/dir.z:Infinity;
    while(t<=nearest){for(const b of this.grid.get(`${ix},${iz}`)??[]){if(found.has(b))continue;found.add(b);nearest=Math.min(nearest,rayBoxDistance(origin,dir,b,nearest));}if(nx===Infinity&&nz===Infinity)break;if(nx<nz){t=nx;ix+=sx;nx+=tx;}else{t=nz;iz+=sz;nz+=tz;}}
    // Exact intersections with each bilinear height cell. Along a ray the
    // height difference is quadratic, including a grazing hit between endpoints.
    const terrainStep=4,sxg=Math.sign(dir.x),szg=Math.sign(dir.z);
    let gx=Math.floor((origin.x-(sxg<0?1e-8:0))/terrainStep),gz=Math.floor((origin.z-(szg<0?1e-8:0))/terrainStep),entry=0;
    let crossX=dir.x?((sxg>0?gx+1:gx)*terrainStep-origin.x)/dir.x:Infinity,crossZ=dir.z?((szg>0?gz+1:gz)*terrainStep-origin.z)/dir.z:Infinity;
    const deltaX=dir.x?terrainStep/Math.abs(dir.x):Infinity,deltaZ=dir.z?terrainStep/Math.abs(dir.z):Infinity;
    const above=(t:number)=>origin.y+dir.y*t-this.ground(origin.x+dir.x*t,origin.z+dir.z*t);
    while(entry<=nearest){const end=Math.min(nearest,crossX,crossZ),length=end-entry,f0=above(entry);if(f0<=0)return entry;
      if(length>1e-9){const f1=above(end),fm=above((entry+end)/2),a=2*(f1+f0-2*fm),b=f1-f0-a;
        if(Math.abs(a)<1e-9){if(Math.abs(b)>1e-12){const root=-f0/b;if(root>=0&&root<=1)return entry+root*length;}}
        else{const discriminant=b*b-4*a*f0;if(discriminant>=-1e-9){const sqrt=Math.sqrt(Math.max(0,discriminant)),r1=(-b-sqrt)/(2*a),r2=(-b+sqrt)/(2*a);const root=Math.min(r1>=0&&r1<=1?r1:Infinity,r2>=0&&r2<=1?r2:Infinity);if(Number.isFinite(root))return entry+root*length;}}
      }
      if(end>=nearest||crossX===Infinity&&crossZ===Infinity)break;
      if(crossX<crossZ){entry=crossX;gx+=sxg;crossX+=deltaX;}else{entry=crossZ;gz+=szg;crossZ+=deltaZ;}
    }
    return nearest<max?nearest:Infinity;
  }
  lineBlocked(a:THREE.Vector3,b:THREE.Vector3){const delta=new THREE.Vector3().subVectors(b,a),len=delta.length();return len>0&&this.ray(a,delta.multiplyScalar(1/len),len)<len-0.02;}
}
