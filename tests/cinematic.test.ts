import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {MotionHistory,nativeRenderSize} from '../src/game/rendering/cinematic-pipeline';
import {PCSS_SHADOW_GLSL,patchCsmLightsFragment,attachCsmToMaterial} from '../src/game/rendering/cinematic-shadows';

function camera(){
  const cam=new THREE.PerspectiveCamera(75,16/9,.15,700);
  cam.position.set(10,2,10);
  cam.updateMatrixWorld(true);
  return cam;
}

describe('native render size',()=>{
  it('matches the drawing buffer at DPR 1',()=>{
    expect(nativeRenderSize(1280,720,1)).toEqual({width:1280,height:720,dpr:1});
  });
  it('doubles the buffer at DPR 2 without supersampling controls',()=>{
    expect(nativeRenderSize(1280,720,2)).toEqual({width:2560,height:1440,dpr:2});
  });
  it('floors fractional DPR like WebGLRenderer.setSize and rejects bad DPR',()=>{
    expect(nativeRenderSize(801,451,1.5)).toEqual({width:1201,height:676,dpr:1.5});
    expect(nativeRenderSize(0,0,0).dpr).toBe(1);
    expect(nativeRenderSize(100,100,Number.NaN).dpr).toBe(1);
    expect(nativeRenderSize(100,100,-2).dpr).toBe(1);
  });
});

describe('motion reprojection history',()=>{
  it('resets on the first frame, then stays valid',()=>{
    const h=new MotionHistory(),cam=camera();
    expect(h.advance(cam,1000)).toBe(false);
    expect(h.advance(cam,1016)).toBe(true);
  });
  it('resets after a >150 ms gap (pause/resume)',()=>{
    const h=new MotionHistory(),cam=camera();
    h.advance(cam,0);h.advance(cam,16);
    expect(h.advance(cam,400)).toBe(false);
    expect(h.advance(cam,416)).toBe(true);
  });
  it('resets on explicit request (resize / tier switch)',()=>{
    const h=new MotionHistory(),cam=camera();
    h.advance(cam,0);h.requestReset();
    expect(h.advance(cam,16)).toBe(false);
  });
  it('resets on FOV changes',()=>{
    const h=new MotionHistory(),cam=camera();
    h.advance(cam,0);h.advance(cam,16);
    cam.fov=32;cam.updateProjectionMatrix();
    expect(h.advance(cam,32)).toBe(false);
  });
  it('resets on teleports over 8 m',()=>{
    const h=new MotionHistory(),cam=camera();
    h.advance(cam,0);h.advance(cam,16);
    cam.position.set(120,2,120);cam.updateMatrixWorld(true);
    expect(h.advance(cam,32)).toBe(false);
  });
  it('stays valid under normal motion',()=>{
    const h=new MotionHistory(),cam=camera();
    h.advance(cam,0);h.advance(cam,16);
    cam.position.x+=.2;cam.rotation.y+=.01;cam.updateMatrixWorld(true);
    expect(h.advance(cam,32)).toBe(true);
  });
});

describe('PCSS directional shadow filtering',()=>{
  it('searches blockers and drives penumbra from blocker/receiver depth separation',()=>{
    expect(PCSS_SHADOW_GLSL).toContain('getCsmShadow');
    expect(PCSS_SHADOW_GLSL).toMatch(/blocker/);
    expect(PCSS_SHADOW_GLSL).toMatch(/receiver\s*-\s*blocker/);
    expect(PCSS_SHADOW_GLSL).toContain('shadowRadius');
  });
  it('does not scale the penumbra by view distance',()=>{
    expect(PCSS_SHADOW_GLSL).not.toMatch(/vViewPosition|linearDepth|cameraNear/);
  });
  it('patches only directional CSM shadow calls',()=>{
    const src='a = getShadow( directionalShadowMap[ i ], x );\nb = getShadow( spotShadowMap[ i ], y );';
    const out=patchCsmLightsFragment(src);
    expect(out).toContain('getCsmShadow( directionalShadowMap[ i ]');
    expect(out).toContain('getShadow( spotShadowMap[ i ]');
    expect(out).not.toContain('getShadow( directionalShadowMap');
  });
});

describe('CSM material wrapping',()=>{
  it('keeps prior compile hooks ahead of the CSM hook and restores on release',()=>{
    const material=new THREE.MeshStandardMaterial();
    const order:string[]=[];
    const prior=function(this:unknown){order.push('prior');};
    material.onBeforeCompile=prior;
    material.customProgramCacheKey=()=>'voxel-daylight-64-false';
    const fakeCsm={setupMaterial(m:THREE.Material){
      m.defines={...(m.defines??{}),USE_CSM:1};
      m.onBeforeCompile=function(){order.push('csm');};
    }};
    const patched=patchCsmLightsFragment('chunk getShadow( directionalShadowMap[ i ], args ); end');
    const release=attachCsmToMaterial(fakeCsm,material,patched);
    expect(order).toEqual([]);
    const shader={fragmentShader:'#include <lights_fragment_begin>',uniforms:{}};
    (material.onBeforeCompile as unknown as (s:typeof shader,r?:unknown)=>void)(shader);
    expect(order).toEqual(['prior','csm']);
    const frag=(shader as unknown as {fragmentShader:string}).fragmentShader;
    expect(frag).toContain('getCsmShadow( directionalShadowMap[ i ]');
    expect(frag).toContain('csmVogel');
    expect(material.customProgramCacheKey()).toContain('voxel-daylight-64-false');
    expect(material.customProgramCacheKey()).not.toBe('voxel-daylight-64-false');
    release();
    expect(material.onBeforeCompile).toBe(prior);
    expect(material.customProgramCacheKey()).toBe('voxel-daylight-64-false');
    expect(material.defines?.USE_CSM).toBeUndefined();
  });
});

import {MOTION_BLUR_SHADER,LIGHTING_SHADER,rayBlocked} from '../src/game/rendering/cinematic-pipeline';
import {CinematicShadows} from '../src/game/rendering/cinematic-shadows';
import {RenderPipeline} from '../src/game/render-pipeline';
import {isLightingQuality,LIGHTING_QUALITIES} from '../src/game/rendering/lighting-presets';

const fakeRenderer=()=>({
  extensions:{has:()=>true},
  shadowMap:{enabled:false,type:THREE.PCFShadowMap,autoUpdate:true,needsUpdate:false},
  getContext:()=>({getParameter:()=>8,getInternalformatParameter:()=>new Int32Array([8,4,2,1])}),
}) as unknown as THREE.WebGLRenderer;

describe('motion history timing',()=>{
  it('ignores negative and non-finite frame times',()=>{
    const h=new MotionHistory(),cam=camera();
    h.advance(cam,1000);h.advance(cam,1016);
    expect(h.advance(cam,900)).toBe(false);
    expect(h.advance(cam,Number.NaN)).toBe(false);
    expect(h.advance(cam,Number.POSITIVE_INFINITY)).toBe(false);
    expect(h.advance(cam,1032)).toBe(true);
  });
  it('reports the measured frame delta only while usable',()=>{
    const h=new MotionHistory(),cam=camera();
    h.advance(cam,0);
    expect(h.dt).toBe(Infinity);
    h.advance(cam,20);
    expect(h.dt).toBe(20);
    h.requestReset();h.advance(cam,36);
    expect(h.dt).toBe(Infinity);
  });
});

describe('voxel ray blocked helper',()=>{
  it('treats the max-range return as unblocked (ray returns max on miss)',()=>{
    expect(rayBlocked(500,500)).toBe(false);
    expect(rayBlocked(90,90)).toBe(false);
    expect(rayBlocked(Infinity,500)).toBe(false);
    expect(rayBlocked(undefined,500)).toBe(false);
    expect(rayBlocked(250,500)).toBe(true);
    expect(rayBlocked(45,90)).toBe(true);
    expect(rayBlocked(499.99,500)).toBe(true);
    expect(rayBlocked(0,500)).toBe(true);
  });
});

describe('motion blur shader',()=>{
  it('reprojects sky at half strength and blends only sky neighbours',()=>{
    expect(MOTION_BLUR_SHADER).toMatch(/depth\s*>=\s*0\.99999/);
    expect(MOTION_BLUR_SHADER).toMatch(/1e5/);
    expect(MOTION_BLUR_SHADER).toMatch(/cameraPos/);
    expect(MOTION_BLUR_SHADER).toMatch(/<0\.99999\)continue/);
    expect(MOTION_BLUR_SHADER).toMatch(/16/);
  });
  it('rejects samples by linear view depth, not a fixed nonlinear constant',()=>{
    expect(MOTION_BLUR_SHADER).toContain('perspectiveDepthToViewZ');
    expect(MOTION_BLUR_SHADER).not.toContain('*4000.');
  });
  it('guards the reprojection divide against behind-camera history',()=>{
    expect(MOTION_BLUR_SHADER).toMatch(/prev\.w\s*>\s*1e-4/);
    expect(MOTION_BLUR_SHADER).toMatch(/world\.w/);
  });
});

describe('AO upsample pass',()=>{
  it('uses a 4-tap depth-aware upsample weighted by view depth',()=>{
    expect(LIGHTING_SHADER).toContain('aoTexel');
    expect(LIGHTING_SHADER).toMatch(/for\s*\(\s*int\s+i\s*=\s*0\s*;\s*i\s*<\s*4/);
    expect(LIGHTING_SHADER).toContain('perspectiveDepthToViewZ');
  });
  it('skips the sky and falls back to unoccluded on disocclusion',()=>{
    expect(LIGHTING_SHADER).toMatch(/depth\s*<\s*0\.99995/);
    expect(LIGHTING_SHADER).toMatch(/ws\s*>\s*1e-4\s*\?\s*sum\s*\/\s*ws\s*:\s*1\.0/);
  });
});

describe('lighting quality guard',()=>{
  it('rejects inherited object keys',()=>{
    for(const bad of ['toString','constructor','__proto__','hasOwnProperty','valueOf'])expect(isLightingQuality(bad)).toBe(false);
    expect(LIGHTING_QUALITIES).toContain('ultra');
    expect(Object.isFrozen(LIGHTING_QUALITIES)).toBe(true);
  });
});

describe('cinematic shadows direction',()=>{
  it('keeps the sun direction stable even though the tracker displaced sun.position',()=>{
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(75,16/9,.15,700);
    const sun=new THREE.DirectionalLight(0xffffff,2);
    sun.position.set(84,37,20);
    const direction=new THREE.Vector3(.3,.8,.5).normalize();
    const renderer=fakeRenderer();
    const csm=new CinematicShadows(renderer,scene,camera,sun,direction);
    expect(csm.lightDirection.x).toBeCloseTo(-direction.x,4);
    expect(csm.lightDirection.y).toBeCloseTo(-direction.y,4);
    expect(csm.lightDirection.z).toBeCloseTo(-direction.z,4);
    csm.dispose();
    const csm2=new CinematicShadows(renderer,scene,camera,sun,direction);
    expect(csm2.lightDirection.x).toBeCloseTo(-direction.x,4);
    csm2.dispose();
  });
  it('limits shadow-map redraws while retaining the same light matrices between them',()=>{
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(75,16/9,.15,700),renderer=fakeRenderer();
    const csm=new CinematicShadows(renderer,scene,camera,new THREE.DirectionalLight(),new THREE.Vector3(0,1,0));
    csm.update(0);expect(renderer.shadowMap.needsUpdate).toBe(true);
    renderer.shadowMap.needsUpdate=false;csm.update(16);expect(renderer.shadowMap.needsUpdate).toBe(false);
    csm.update(51);expect(renderer.shadowMap.needsUpdate).toBe(true);csm.dispose();
  });
  it('restores material hooks and mesh flags when materials die or models leave',()=>{
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(75,16/9,.15,700);
    const sun=new THREE.DirectionalLight();
    const csm=new CinematicShadows(fakeRenderer(),scene,camera,sun,new THREE.Vector3(0,1,0));
    const material=new THREE.MeshStandardMaterial();
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);
    mesh.castShadow=false;mesh.receiveShadow=false;
    const root=new THREE.Group();root.add(mesh);
    csm.registerModel(root);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    csm.unregisterModel(root);
    expect(mesh.castShadow).toBe(false);
    csm.registerModel(root);
    material.dispatchEvent({type:'dispose'} as never);
    expect((csm as unknown as {releases:Map<THREE.Material,unknown>}).releases.size).toBe(0);
    csm.dispose();
    expect(mesh.castShadow).toBe(false);
  });
  it('keeps a shared material attached while another mesh still uses it',()=>{
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(75,16/9,.15,700);
    const csm=new CinematicShadows(fakeRenderer(),scene,camera,new THREE.DirectionalLight(),new THREE.Vector3(0,1,0));
    const material=new THREE.MeshStandardMaterial();
    const meshA=new THREE.Mesh(new THREE.BoxGeometry(),material);
    const meshB=new THREE.Mesh(new THREE.BoxGeometry(),material);
    const root=new THREE.Group();root.add(meshA,meshB);
    csm.registerModel(root);
    expect(csm.counts).toEqual({meshes:2,materials:1});
    const rootA=new THREE.Group();rootA.add(meshA);
    csm.unregisterModel(rootA);
    expect(csm.counts).toEqual({meshes:1,materials:1});
    const rootB=new THREE.Group();rootB.add(meshB);
    csm.unregisterModel(rootB);
    expect(csm.counts).toEqual({meshes:0,materials:0});
    csm.dispose();
  });
  it('leaves pinned materials attached after their last mesh unregisters',()=>{
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(75,16/9,.15,700);
    const csm=new CinematicShadows(fakeRenderer(),scene,camera,new THREE.DirectionalLight(),new THREE.Vector3(0,1,0));
    const pinned=new THREE.MeshStandardMaterial();
    csm.registerMaterial(pinned);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),pinned);
    const root=new THREE.Group();root.add(mesh);
    csm.registerModel(root);
    csm.unregisterModel(root);
    expect(csm.counts).toEqual({meshes:0,materials:1});
    csm.dispose();
  });
  it('returns tracking to baseline after repeated register/unregister cycles',()=>{
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(75,16/9,.15,700);
    const csm=new CinematicShadows(fakeRenderer(),scene,camera,new THREE.DirectionalLight(),new THREE.Vector3(0,1,0));
    const baseline=csm.counts;
    for(let i=0;i<100;i++){
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
      const root=new THREE.Group();root.add(mesh);
      csm.registerModel(root);
      csm.unregisterModel(root);
    }
    expect(csm.counts).toEqual(baseline);
    csm.dispose();
  });
  it('does not accumulate material registrations across repeated registers or texture swaps',()=>{
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(75,16/9,.15,700);
    const csm=new CinematicShadows(fakeRenderer(),scene,camera,new THREE.DirectionalLight(),new THREE.Vector3(0,1,0));
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
    const root=new THREE.Group();root.add(mesh);
    csm.registerModel(root);
    csm.registerModel(root);
    csm.registerModel(root);
    expect(csm.counts).toEqual({meshes:1,materials:1});
    const swapped=new THREE.MeshStandardMaterial();
    mesh.material=swapped;
    csm.registerModel(root);
    expect(csm.counts).toEqual({meshes:1,materials:1});
    csm.dispose();
  });
});

describe('cinematic pipeline routing',()=>{
  it('exits the HDR path when disabled, releasing ultra state',()=>{
    const renderer=fakeRenderer();
    const pipeline=new RenderPipeline();
    expect(pipeline.setCinematic(renderer,false)).toBe(false);
    expect(pipeline.cinematicActive).toBe(false);
    expect(pipeline.setCinematic(renderer,true)).toBe(true);
    expect(pipeline.cinematicActive).toBe(true);
    expect(pipeline.lightingDebugState().cinematic).toBe(true);
    expect(pipeline.setCinematic(renderer,false)).toBe(false);
    expect(pipeline.cinematicActive).toBe(false);
    expect(pipeline.lightingDebugState().world).toBeNull();
    pipeline.dispose();
  });
  it('refuses the HDR path without float render targets',()=>{
    const renderer=fakeRenderer();
    (renderer.extensions as {has(n:string):boolean}).has=()=>false;
    const pipeline=new RenderPipeline();
    expect(pipeline.setCinematic(renderer,true)).toBe(false);
    expect(pipeline.cinematicActive).toBe(false);
    pipeline.dispose();
  });
  it('resolves MSAA to the largest supported count not exceeding the request',()=>{
    const renderer=fakeRenderer();
    const pipeline=new RenderPipeline();
    pipeline.setCinematic(renderer,true);
    pipeline.setSamples(renderer,4);
    const cine=(pipeline as unknown as {cinematic:{world:THREE.WebGLRenderTarget;hands:THREE.WebGLRenderTarget}}).cinematic;
    expect(cine.world.samples).toBe(4);
    pipeline.setSamples(renderer,2);
    expect(cine.world.samples).toBe(2);
    pipeline.setSamples(renderer,0);
    expect(cine.world.samples).toBe(0);
    pipeline.setCinematic(renderer,false);
    pipeline.dispose();
  });
});
