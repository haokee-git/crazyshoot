import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {buildPixelSurface,ultraSurface} from '../src/game/rendering/pixel-surfaces';
import {bakeVoxelSky} from '../src/game/world/voxel-skylight';
import type {TerrainData,VoxelChunkData} from '../src/game/world/voxel-map-data';
import {splitWaterTriangles,waterLevelAreas,applyObliqueClip,fresnelSchlick,F0,CinematicWater} from '../src/game/rendering/cinematic-water';
import {GRADE,BATTLEFIELD_GRADE_GLSL} from '../src/game/rendering/battlefield-grade';
import {CinematicLighting} from '../src/game/rendering/cinematic-lighting';

const fill=(w:number,h:number,rgba:[number,number,number,number])=>{
  const a=new Uint8Array(w*h*4);
  for(let i=0;i<w*h;i++)a.set(rgba,i*4);
  return a;
};

describe('pixel surface packing',()=>{
  it('flat input yields neutral normals and finite output',()=>{
    const out=buildPixelSurface(fill(16,16,[120,120,120,255]),16,16,'concrete');
    for(let i=0;i<16*16;i++){
      expect(Math.abs(out[i*4]-128)).toBeLessThanOrEqual(2);
      expect(Math.abs(out[i*4+1]-128)).toBeLessThanOrEqual(2);
      expect(out[i*4+3]).toBe(255);
    }
  });
  it('rising relief tilts the normal consistently and caps at 0.5',()=>{
    const src=new Uint8Array(16*16*4);
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)src.set([x*16,x*16,x*16,255],(y*16+x)*4);
    const out=buildPixelSurface(src,16,16,'rock');
    const center=(8*16+8)*4;
    expect(out[center]).toBeLessThan(120);
    for(let i=0;i<16*16;i++){
      const nx=out[i*4]/255*2-1,ny=out[i*4+1]/255*2-1;
      expect(Math.hypot(nx,ny)).toBeLessThanOrEqual(.51);
    }
  });
  it('wraps gradients around the texture seam',()=>{
    const w=16,src=new Uint8Array(w*w*4);
    for(let y=0;y<w;y++)for(let x=0;x<w;x++)src.set([x<4?240:40,x<4?240:40,x<4?240:40,255],(y*w+x)*4);
    const out=buildPixelSurface(src,w,w,'rock');
    const left=out[4],right=out[(w-1)*4];
    expect(Math.abs(left-128)+Math.abs(right-128)).toBeGreaterThan(20);
  });
  it('masonry treats bright mortar as a recess below warm brick',()=>{
    const w=8,src=new Uint8Array(w*w*4);
    for(let y=0;y<w;y++)for(let x=0;x<w;x++)src.set(x<w/2?[235,228,220,255]:[172,84,52,255],(y*w+x)*4);
    const out=buildPixelSurface(src,w,w,'brick_wall');
    const seam=out[(w*w/2+w/2-1)*4];
    expect(seam).toBeLessThan(120);
  });
  it('water profiles stay flat',()=>{
    const out=buildPixelSurface(fill(8,8,[40,110,120,255]),8,8,'water_deep');
    for(let i=0;i<8*8;i++)expect(Math.abs(out[i*4]-128)).toBeLessThanOrEqual(2);
  });
  it('honours profile roughness floors',()=>{
    const stone=buildPixelSurface(fill(8,8,[140,140,140,255]),8,8,'concrete');
    const metal=buildPixelSurface(fill(8,8,[140,140,140,255]),8,8,'steel_plate');
    expect(stone[2]/255).toBeGreaterThan(metal[2]/255);
    expect(metal[2]/255).toBeGreaterThanOrEqual(.2);
  });
  it('keeps corroded steel rough instead of shiny',()=>{
    const rust=buildPixelSurface(fill(8,8,[140,120,110,255]),8,8,'steel_corroded');
    const plate=buildPixelSurface(fill(8,8,[140,120,110,255]),8,8,'steel_plate');
    expect(rust[2]/255).toBeGreaterThanOrEqual(.55);
    expect(rust[2]).toBeGreaterThan(plate[2]);
  });
  it('produces equivalent relief strength across texture resolutions',()=>{
    const ramp=(w:number)=>{
      const src=new Uint8Array(w*w*4);
      for(let y=0;y<w;y++)for(let x=0;x<w;x++){const v=Math.round(60+(x/(w-1))*140);src.set([v,v,v,255],(y*w+x)*4);}
      return src;
    };
    const dev=(w:number)=>{
      const out=buildPixelSurface(ramp(w),w,w,'rock');
      let sum=0;
      for(let i=0;i<w*w;i++)sum+=Math.abs(out[i*4]-128)+Math.abs(out[i*4+1]-128);
      return sum/(w*w);
    };
    const d32=dev(32),d64=dev(64),d128=dev(128);
    expect(d32).toBeGreaterThan(2);
    expect(d64/d32).toBeGreaterThan(.5);
    expect(d64/d32).toBeLessThan(2);
    expect(d128/d32).toBeGreaterThan(.5);
    expect(d128/d32).toBeLessThan(2);
  });
});

const makeChunk=(verts:{p:[number,number,number];n:[number,number,number]}[]):VoxelChunkData=>{
  const n=verts.length,position=new Float32Array(n*3),normal=new Float32Array(n*3);
  verts.forEach((v,i)=>{position.set(v.p,i*3);normal.set(v.n,i*3);});
  return {position,normal,uv:new Float32Array(n*2),color:new Float32Array(n*3),block:new Float32Array(n).fill(1),index:new Uint32Array(n),transparent:false};
};

const skylightData=():TerrainData=>{
  const data:TerrainData={
    id:'t',size:8,step:1,minX:0,minZ:0,minY:0,width:8,depth:8,height:8,
    voxels:new Uint8Array(8*8*8),
    heights:new Float32Array(64),primary:new Float32Array(64),water:new Float32Array(64),
    chunks:[makeChunk([{p:[3.5,1.5,3.5],n:[0,1,0]},{p:[7.5,1.5,7.5],n:[0,1,0]}])],
  };
  for(let x=1;x<7;x++)for(let z=1;z<7;z++)for(let y=4;y<6;y++)data.voxels[(z*8+x)*8+y]=1;
  return data;
};

describe('voxel skylight bake',()=>{
  it('shades a roofed cell but not open ground',()=>{
    const data=skylightData();
    bakeVoxelSky(data);
    const sky=data.chunks[0].skyLight!;
    expect(sky.length).toBe(2);
    expect(sky[1]).toBeGreaterThan(200);
    expect(sky[0]).toBeLessThan(sky[1]/2);
  });
  it('does not mutate voxels or vertex data and is idempotent',()=>{
    const data=skylightData();
    const voxels=data.voxels.slice(),pos=data.chunks[0].position.slice();
    bakeVoxelSky(data);
    const first=data.chunks[0].skyLight!.slice();
    bakeVoxelSky(data);
    expect(data.voxels).toEqual(voxels);
    expect(data.chunks[0].position).toEqual(pos);
    expect(data.chunks[0].skyLight).toEqual(first);
  });
  it('marks transparent chunks fully open',()=>{
    const data=skylightData();
    const glass=makeChunk([{p:[.5,1.5,.5],n:[0,1,0]}]);
    glass.transparent=true;
    data.chunks.push(glass);
    bakeVoxelSky(data);
    expect(glass.skyLight![0]).toBe(255);
  });
  it('does not collide cells 1024 apart in the sky cache',()=>{
    const w=1100,d=8,h=8;
    const data:TerrainData={
      id:'t',size:w,step:1,minX:0,minZ:0,minY:0,width:w,depth:d,height:h,
      voxels:new Uint8Array(w*d*h),
      heights:new Float32Array(w*d),primary:new Float32Array(w*d),water:new Float32Array(w*d),
      chunks:[makeChunk([{p:[3.5,1.5,3.5],n:[0,1,0]},{p:[1027.5,1.5,3.5],n:[0,1,0]}])],
    };
    for(let x=1025;x<1030;x++)for(let z=1;z<6;z++)for(let y=4;y<6;y++)data.voxels[(z*w+x)*h+y]=1;
    bakeVoxelSky(data);
    const sky=data.chunks[0].skyLight!;
    expect(sky[0]).toBeGreaterThan(200);
    expect(sky[1]).toBeLessThan(sky[0]/2);
  });
});

describe('water triangle split',()=>{
  it('routes water ids to water and keeps glass out',()=>{
    const block=new THREE.BufferAttribute(new Float32Array([16,16,16,11,11,11,64,64,64]),1);
    const index=new THREE.BufferAttribute(new Uint32Array([0,1,2,3,4,5,6,7,8]),1);
    const {water,glass}=splitWaterTriangles(index,block);
    expect(water).toEqual([0,1,2,6,7,8]);
    expect(glass).toEqual([3,4,5]);
  });
  it('decodes normalized byte attributes on derived meshes',()=>{
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,-2,0, 1,-2,0, 0,-2,1, 0,-2,2, 1,-2,2, 0,-2,3]),3));
    geo.setAttribute('normal',new THREE.BufferAttribute(new Float32Array([0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0]),3));
    geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(12),2));
    geo.setAttribute('voxelBlock',new THREE.BufferAttribute(new Float32Array([64,64,64,11,11,11]),1));
    geo.setAttribute('voxelSky',new THREE.BufferAttribute(new Uint8Array([128,128,128,64,64,64]),1,true));
    geo.setIndex([0,1,2,3,4,5]);
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial());
    mesh.name='voxel-water-glass';
    const root=new THREE.Group();root.add(mesh);
    const scene=new THREE.Scene();
    const water=new CinematicWater();
    water.initialize(scene,root);
    const glass=scene.getObjectByName('derived-glass')as THREE.Mesh;
    const sky=glass.geometry.getAttribute('voxelSky')as THREE.BufferAttribute;
    expect(sky.normalized).toBe(false);
    expect(sky.getX(0)).toBeCloseTo(64/255,2);
    water.dispose();
    expect(mesh.visible).toBe(true);
  });
  it('does nothing on a glass-only map',()=>{
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,-2,0, 1,-2,0, 0,-2,1]),3));
    geo.setAttribute('normal',new THREE.BufferAttribute(new Float32Array([0,1,0, 0,1,0, 0,1,0]),3));
    geo.setAttribute('voxelBlock',new THREE.BufferAttribute(new Float32Array([11,11,11]),1));
    geo.setIndex([0,1,2]);
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial());
    mesh.name='voxel-water-glass';
    const root=new THREE.Group();root.add(mesh);
    const scene=new THREE.Scene();
    const water=new CinematicWater();
    water.initialize(scene,root);
    const st=water.state();
    expect(st.active).toBe(false);
    expect(st.meshes).toBe(0);
    expect(st.mirror).toBe(false);
    expect(mesh.visible).toBe(true);
    expect(scene.getObjectByName('derived-glass')).toBeUndefined();
    water.dispose();
  });
  it('picks the largest top-facing level',()=>{
    const pos=new THREE.BufferAttribute(new Float32Array([
      0,0,0, 1,0,0, 0,0,1,
      0,0,1, 1,0,0, 1,0,1,
      0,5,0, .1,5,0, 0,5,.1,
    ]),3);
    const nrm=new THREE.BufferAttribute(new Float32Array([
      0,1,0, 0,1,0, 0,1,0,
      0,1,0, 0,1,0, 0,1,0,
      0,1,0, 0,1,0, 0,1,0,
    ]),3);
    const areas=waterLevelAreas(pos,nrm,[0,1,2,3,4,5,6,7,8]);
    expect(areas.get(0)).toBeCloseTo(1,3);
    expect(areas.get(5)).toBeLessThan(.01);
  });
  it('tracks distinct levels 1m apart and picks the largest',()=>{
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array([
      0,-2,0, 2,-2,0, 0,-2,2,
      0,-2,2, 2,-2,0, 2,-2,2,
      0,-1,0, .3,-1,0, 0,-1,.3,
    ]),3));
    geo.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(new Array(9).fill([0,1,0]).flat()),3));
    geo.setAttribute('voxelBlock',new THREE.BufferAttribute(new Float32Array(new Array(9).fill(64)),1));
    geo.setIndex([0,1,2,3,4,5,6,7,8]);
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial());
    mesh.name='voxel-water-glass';
    const root=new THREE.Group();root.add(mesh);
    const water=new CinematicWater();
    water.initialize(new THREE.Scene(),root);
    const st=water.state();
    expect(st.active).toBe(true);
    expect(st.level).toBe(-2);
    expect(Math.abs(-1-st.level)).toBeGreaterThanOrEqual(.05);
    water.dispose();
  });
});

describe('oblique near-plane clip',()=>{
  it('rejects fragments below the water plane',()=>{
    const cam=new THREE.PerspectiveCamera(60,1,.1,100);
    const proj=cam.projectionMatrix.clone();
    const clip=new THREE.Vector4(0,1,0,1);
    applyObliqueClip(proj,clip,new THREE.Vector4(),.0012);
    const below=new THREE.Vector4(0,-5,-10,1).applyMatrix4(proj);
    const onPlane=new THREE.Vector4(0,-1,-10,1).applyMatrix4(proj);
    const above=new THREE.Vector4(0,1,-10,1).applyMatrix4(proj);
    expect(below.z/below.w).toBeLessThan(-1);
    expect(onPlane.z/onPlane.w).toBeCloseTo(-1,1);
    expect(above.z/above.w).toBeGreaterThan(-1);
  });
});

describe('water fresnel',()=>{
  it('uses water IOR and grows toward grazing angles',()=>{
    expect(F0).toBeCloseTo(.02037,4);
    expect(fresnelSchlick(1)).toBeCloseTo(F0,4);
    expect(fresnelSchlick(0)).toBeCloseTo(1,4);
    expect(fresnelSchlick(.2)).toBeGreaterThan(fresnelSchlick(.9));
  });
});

describe('battlefield grade',()=>{
  it('ships frozen artist constants without filmic gimmicks',()=>{
    expect(Object.isFrozen(GRADE)).toBe(true);
    expect(BATTLEFIELD_GRADE_GLSL).not.toMatch(/grain|vignette|fract\(|letterbox/i);
    expect(GRADE.saturation).toBeLessThan(1);
    expect(GRADE.contrast).toBeGreaterThan(1);
    expect(GRADE.shadowLift).toBeGreaterThan(0);
  });
});

describe('cinematic lighting split',()=>{
  const makeRig=()=>{
    const renderer={toneMappingExposure:1}as unknown as THREE.WebGLRenderer;
    const scene=new THREE.Scene();
    const hemi=new THREE.HemisphereLight(0xffffff,0x444444,2);
    const amb=new THREE.AmbientLight(0xffffff,1);
    scene.add(hemi,amb);
    const vm=new THREE.Scene();
    const vmHemi=new THREE.HemisphereLight(0xffffff,0x444444,2);
    vm.add(vmHemi);
    return {renderer,scene,vm,hemi,amb,vmHemi};
  };
  it('keeps world lights fixed while the viewmodel follows the probe',()=>{
    const {renderer,scene,vm,hemi,amb,vmHemi}=makeRig();
    const lighting=new CinematicLighting(renderer,scene,vm);
    lighting.enable();
    expect(ultraSurface.value).toBe(1);
    expect(hemi.intensity).toBeCloseTo(1.1,3);
    expect(amb.intensity).toBeCloseTo(.35,3);
    const camera=new THREE.PerspectiveCamera();
    const arena={rayDistance:()=>0}as unknown as import('../src/game/world/arena').Arena;
    for(let i=0;i<240;i++)lighting.update(i*16,camera,arena);
    expect(hemi.intensity).toBeCloseTo(1.1,3);
    expect(amb.intensity).toBeCloseTo(.35,3);
    expect(scene.environmentIntensity).toBeCloseTo(.7,3);
    expect(vmHemi.intensity).toBeLessThan(.5);
    expect(vm.environmentIntensity).toBeLessThan(.2);
    expect(renderer.toneMappingExposure).toBeGreaterThan(1);
    lighting.disable();
    expect(hemi.intensity).toBe(2);
    expect(amb.intensity).toBe(1);
    expect(ultraSurface.value).toBe(0);
    expect(renderer.toneMappingExposure).toBe(1);
  });
});
