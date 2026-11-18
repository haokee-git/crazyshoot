import * as THREE from 'three';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {CinematicWater,type SunShadowEntry} from './cinematic-water';
import {GRADE,BATTLEFIELD_GRADE_GLSL} from './battlefield-grade';
import {ultraSurface} from './pixel-surfaces';
import type {WeaponViewmodel} from '../weapons/viewmodel';

export function nativeRenderSize(innerWidth:number,innerHeight:number,devicePixelRatio:number){
  const dpr=Number.isFinite(devicePixelRatio)&&devicePixelRatio>0?devicePixelRatio:1;
  return {width:Math.max(1,Math.floor(innerWidth*dpr)),height:Math.max(1,Math.floor(innerHeight*dpr)),dpr};
}

export function rayBlocked(hit:number|undefined,max:number){
  return hit!==undefined&&hit<max-.001;
}

export interface CinematicFrame {
  now:number;
  motionBlur:boolean;
  adsAmount:number;
  sunDirection:THREE.Vector3;
  sunOccluded:boolean;
  sunRadiance?:THREE.Color;
  sunShadows?:readonly SunShadowEntry[];
}

export class MotionHistory{
  private readonly frames=[new THREE.Matrix4(),new THREE.Matrix4()];
  private index=0;
  private prevPos=new THREE.Vector3();
  private prevFov=0;
  private lastNow?:number;
  private lastDt=Infinity;
  private reset=true;
  advance(camera:THREE.PerspectiveCamera,now:number):boolean{
    const raw=this.lastNow===undefined?Infinity:now-this.lastNow;
    const finite=Number.isFinite(raw)&&raw>=0;
    const dt=finite?raw:Infinity;
    const usable=!this.reset&&dt<=150&&Math.abs(camera.fov-this.prevFov)<.01&&camera.position.distanceToSquared(this.prevPos)<=64;
    this.lastDt=usable?dt:Infinity;
    this.index^=1;
    this.frames[this.index].multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.prevPos.copy(camera.position);this.prevFov=camera.fov;
    if(Number.isFinite(now)&&now>=0)this.lastNow=now;
    this.reset=false;
    return usable;
  }
  get previous(){return this.frames[this.index^1];}
  get dt(){return this.lastDt;}
  requestReset(){this.reset=true;}
}

export const MOTION_BLUR_SHADER=`
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform mat4 prevViewProj;
uniform mat4 invViewProj;
uniform vec2 resolution;
uniform float strength;
uniform float maxPixels;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 cameraPos;
varying vec2 vUv;
#include <packing>
void main(){
  vec3 color=texture2D(tDiffuse,vUv).rgb;
  float depth=texture2D(tDepth,vUv).r;
  if(strength<=0.0){gl_FragColor=vec4(color,1.0);return;}
  if(depth>=0.99999){
    vec4 far4=invViewProj*vec4(vUv*2.0-1.0,1.0,1.0);
    if(!(abs(far4.w)>1e-4)){gl_FragColor=vec4(color,1.0);return;}
    far4/=far4.w;
    vec3 wdir=normalize(far4.xyz-cameraPos);
    vec4 prev=prevViewProj*vec4(cameraPos+wdir*1e5,1.0);
    if(!(prev.w>1e-4)){gl_FragColor=vec4(color,1.0);return;}
    prev/=prev.w;
    vec2 velPx=(prev.xy*0.5+0.5-vUv)*resolution*strength*0.5;
    float len=length(velPx);
    if(len>maxPixels)velPx*=maxPixels/len;
    vec2 stepUV=velPx/resolution;
    vec3 acc=color;
    float total=1.0;
    for(int i=1;i<16;i++){
      vec2 suv=vUv+stepUV*float(i)/15.0;
      if(suv.x<0.0||suv.x>1.0||suv.y<0.0||suv.y>1.0)continue;
      if(texture2D(tDepth,suv).r<0.99999)continue;
      acc+=texture2D(tDiffuse,suv).rgb;
      total+=1.0;
    }
    gl_FragColor=vec4(acc/total,1.0);
    return;
  }
  float viewZ=-perspectiveDepthToViewZ(depth,cameraNear,cameraFar);
  vec4 world=invViewProj*vec4(vUv*2.0-1.0,depth*2.0-1.0,1.0);
  if(!(abs(world.w)>1e-4)){gl_FragColor=vec4(color,1.0);return;}
  world/=world.w;
  vec4 prev=prevViewProj*world;
  if(!(prev.w>1e-4)){gl_FragColor=vec4(color,1.0);return;}
  prev/=prev.w;
  vec2 velPx=(prev.xy*0.5+0.5-vUv)*resolution*strength;
  float len=length(velPx);
  if(len>maxPixels)velPx*=maxPixels/len;
  vec2 stepUV=velPx/resolution;
  vec3 acc=color;
  float total=1.0;
  for(int i=1;i<16;i++){
    vec2 suv=vUv+stepUV*float(i)/15.0;
    if(suv.x<0.0||suv.x>1.0||suv.y<0.0||suv.y>1.0)continue;
    float sd=texture2D(tDepth,suv).r;
    if(sd>=0.99999)continue;
    float sz=-perspectiveDepthToViewZ(sd,cameraNear,cameraFar);
    float w=clamp(1.0-abs(sz-viewZ)/(viewZ*0.08+0.25),0.0,1.0);
    acc+=texture2D(tDiffuse,suv).rgb*w;
    total+=w;
  }
  gl_FragColor=vec4(acc/total,1.0);
}`;

export const LIGHTING_SHADER=`
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tAO;
uniform vec2 aoTexel;
uniform float cameraNear;
uniform float cameraFar;
uniform float aoStrength;
uniform float aoDistance;
varying vec2 vUv;
#include <packing>
void main(){
  vec3 color=texture2D(tColor,vUv).rgb;
  float depth=texture2D(tDepth,vUv).r;
  if(depth<0.99995){
    float cz=-perspectiveDepthToViewZ(depth,cameraNear,cameraFar);
    vec2 pos=vUv/aoTexel-0.5;
    vec2 fl=floor(pos);
    vec2 f=pos-fl;
    float sum=0.0,ws=0.0;
    for(int i=0;i<4;i++){
      vec2 o=vec2(float(i%2),float(i/2));
      vec2 suv=(fl+o+0.5)*aoTexel;
      float sd=texture2D(tDepth,suv).r;
      float dw=0.0;
      if(sd<0.99995){
        float sz=-perspectiveDepthToViewZ(sd,cameraNear,cameraFar);
        dw=clamp(1.0-abs(sz-cz)/max(0.5,cz*0.15),0.0,1.0);
      }
      float bw=(o.x<0.5?1.0-f.x:f.x)*(o.y<0.5?1.0-f.y:f.y);
      sum+=texture2D(tAO,suv).r*bw*dw;
      ws+=bw*dw;
    }
    float ao=ws>1e-4?sum/ws:1.0;
    float fade=1.0-smoothstep(aoDistance*0.55,aoDistance,cz);
    color*=mix(1.0,ao,aoStrength*fade);
  }
  gl_FragColor=vec4(color,1.0);
}`;

const COMPOSITE_SHADER=`
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tHands;
uniform vec2 resolution;
uniform bool useHands;
uniform vec2 sunUv;
uniform float sunNdc;
uniform float sunVis;
uniform vec3 sunColor;
varying vec2 vUv;
${BATTLEFIELD_GRADE_GLSL}
float sunBlockers(){
  float blocked=0.0;
  for(int i=0;i<7;i++){
    float a=float(i)*0.8976;
    float r=0.012*sqrt(float(i)/7.0)+0.004;
    float d=texture2D(tDepth,sunUv+vec2(cos(a),sin(a))*r).r;
    if(d<sunNdc-0.0008)blocked+=1.0;
  }
  return blocked/7.0;
}
float sunShafts(){
  vec2 dir=sunUv-vUv;
  float dist=length(dir*vec2(resolution.x/resolution.y,1.0));
  vec2 stepUv=dir/12.0;
  float acc=0.0;
  float decay=1.0;
  for(int i=1;i<=12;i++){
    vec2 suv=vUv+stepUv*float(i);
    float sd=texture2D(tDepth,suv).r;
    bool inside=suv.x>=0.0&&suv.x<=1.0&&suv.y>=0.0&&suv.y<=1.0;
    acc+=(inside?step(sunNdc-0.0008,sd):0.0)*decay;
    decay*=0.88;
  }
  return acc/12.0*exp(-dist*2.5);
}
void main(){
  vec3 color=texture2D(tColor,vUv).rgb;
  if(sunVis>0.002){
    float vis=sunVis*(1.0-sunBlockers());
    if(vis>0.002){
      vec2 d=vUv-sunUv;
      vec2 da=vec2(d.x*resolution.x/resolution.y,d.y);
      float r=length(da);
      float halo=exp(-r*r*210.0)*0.5+exp(-r*r*26.0)*0.14;
      float ghosts=exp(-length(da-normalize(da+1e-4)*0.55)*18.0)*0.05;
      color+=sunColor*vis*(halo+ghosts+sunShafts()*0.3);
    }
  }
  if(useHands){
    vec4 h=texture2D(tHands,vUv);
    color=h.rgb+color*(1.0-h.a);
  }
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  gl_FragColor=vec4(battlefieldGrade(gl_FragColor.rgb,gl_FragColor.rgb),1.0);
  #include <colorspace_fragment>
}`;

export class CinematicPipeline{
  readonly world:THREE.WebGLRenderTarget;
  private readonly lighting:THREE.WebGLRenderTarget;
  private readonly work:THREE.WebGLRenderTarget;
  private readonly hands:THREE.WebGLRenderTarget;
  private readonly gtao:GTAOPass;
  private readonly bloom:UnrealBloomPass;
  private readonly history=new MotionHistory();
  private readonly screenScene=new THREE.Scene();
  private readonly screenCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  private readonly quadGeo=new THREE.PlaneGeometry(2,2);
  private readonly screenQuad:THREE.Mesh;
  private readonly lightingMaterial=new THREE.ShaderMaterial({
    depthTest:false,depthWrite:false,
    uniforms:{
      tColor:{value:null},tDepth:{value:null},tAO:{value:null},
      aoTexel:{value:new THREE.Vector2(1,1)},cameraNear:{value:.15},cameraFar:{value:700},
      aoStrength:{value:.65},aoDistance:{value:90},
    },
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:LIGHTING_SHADER,
  });
  private readonly blurMaterial=new THREE.ShaderMaterial({
    depthTest:false,depthWrite:false,
    uniforms:{
      tDiffuse:{value:null},tDepth:{value:null},prevViewProj:{value:new THREE.Matrix4()},
      invViewProj:{value:new THREE.Matrix4()},resolution:{value:new THREE.Vector2(1,1)},
      strength:{value:0},maxPixels:{value:8},cameraNear:{value:.15},cameraFar:{value:700},
      cameraPos:{value:new THREE.Vector3()},
    },
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:MOTION_BLUR_SHADER,
  });
  private readonly compositeMaterial=new THREE.ShaderMaterial({
    depthTest:false,depthWrite:false,
    uniforms:{
      tColor:{value:null},tDepth:{value:null},tHands:{value:null},
      resolution:{value:new THREE.Vector2(1,1)},useHands:{value:true},
      sunUv:{value:new THREE.Vector2()},sunNdc:{value:0},sunVis:{value:0},sunColor:{value:new THREE.Color(1,.85,.6)},
      gradeStrength:{value:1},gradeContrast:{value:GRADE.contrast},gradePivot:{value:GRADE.pivot},
      gradeSaturation:{value:GRADE.saturation},gradeShadowLift:{value:GRADE.shadowLift},
      gradeKnee:{value:GRADE.shoulderKnee},gradeKneeSoft:{value:GRADE.shoulderSoftness},
      gradeWarm:{value:new THREE.Vector3(...GRADE.warmHighlight)},gradeCool:{value:new THREE.Vector3(...GRADE.coolShadow)},
      gradeSplitPivot:{value:GRADE.splitPivot},gradeGreen:{value:GRADE.greenDesat},
    },
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:COMPOSITE_SHADER,
  });
  private water?:CinematicWater;
  private waterInit=false;
  private readonly screenSize=new THREE.Vector2();
  private readonly clearColor=new THREE.Color();
  private readonly invViewProj=new THREE.Matrix4();
  private readonly sunWorld=new THREE.Vector3();
  private readonly sunNdcVec=new THREE.Vector3();
  private readonly camForward=new THREE.Vector3();
  private sunVisibility=0;
  private requestedSamples=0;
  private lastFrameNow?:number;
  private width=1;
  private height=1;

  constructor(){
    const depthTexture=new THREE.DepthTexture(1,1);
    depthTexture.type=THREE.UnsignedIntType;
    this.world=new THREE.WebGLRenderTarget(1,1,{
      depthBuffer:true,depthTexture,type:THREE.HalfFloatType,
      minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
    });
    this.world.resolveDepthBuffer=true;
    this.world.resolveStencilBuffer=false;
    this.lighting=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
    this.work=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
    this.hands=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
    this.screenQuad=new THREE.Mesh(this.quadGeo,this.compositeMaterial);
    this.screenScene.add(this.screenQuad);
    this.gtao=new GTAOPass(new THREE.Scene(),new THREE.PerspectiveCamera(),1,1,{depthTexture:this.world.depthTexture??undefined});
    this.gtao.output=GTAOPass.OUTPUT.Off;
    this.gtao.updateGtaoMaterial({radius:1.4,thickness:1,samples:24,distanceFallOff:1,scale:1.});
    this.gtao.updatePdMaterial({radius:4,samples:12,lumaPhi:10,depthPhi:2,normalPhi:3});
    this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.3,.62,1.10);
  }

  get depthTexture(){return this.world.depthTexture;}
  get samples(){return this.world.samples;}

  setSamples(renderer:THREE.WebGLRenderer,requested:number){
    this.requestedSamples=requested===2||requested===4?requested:0;
    const gl=renderer.getContext() as WebGL2RenderingContext;
    const want=Math.min(this.requestedSamples,gl.getParameter(gl.MAX_SAMPLES) as number);
    const list=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES) as Int32Array);
    const use=want>0?(list.filter(n=>n>0&&n<=want).sort((a,b)=>b-a)[0]??0):0;
    for(const target of [this.world,this.hands]){
      if(target.samples!==use){target.dispose();target.samples=use;}
    }
    this.history.requestReset();
  }

  resize(width:number,height:number){
    this.width=Math.max(1,Math.floor(width));
    this.height=Math.max(1,Math.floor(height));
    this.world.setSize(this.width,this.height);
    this.lighting.setSize(this.width,this.height);
    this.work.setSize(this.width,this.height);
    this.hands.setSize(this.width,this.height);
    const aw=Math.max(1,this.width>>1),ah=Math.max(1,this.height>>1);
    this.gtao.setSize(aw,ah);
    this.lightingMaterial.uniforms.aoTexel.value.set(1/aw,1/ah);
    this.bloom.setSize(this.width,this.height);
    this.water?.resize(this.width,this.height);
    this.blurMaterial.uniforms.resolution.value.set(this.width,this.height);
    this.compositeMaterial.uniforms.resolution.value.set(this.width,this.height);
    this.history.requestReset();
  }

  requestMotionReset(){this.history.requestReset();}

  render(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,viewmodel:WeaponViewmodel,frame:CinematicFrame){
    if(!this.waterInit){
      this.waterInit=true;
      const voxelRoot=scene.getObjectByName('minecraft-voxel-world');
      if(voxelRoot){this.water=new CinematicWater();this.water.initialize(scene,voxelRoot);this.water.resize(this.width,this.height);}
    }
    renderer.info.autoReset=false;
    renderer.info.reset();
    renderer.autoClear=true;
    this.water?.render(renderer,scene,camera,frame);
    renderer.setRenderTarget(this.world);
    renderer.render(scene,camera);
    this.water?.copyRefraction(renderer,this.world);
    this.water?.renderWater(renderer,scene,camera,this.world);

    this.gtao.camera=camera;
    this.gtao.render(renderer,this.world,this.world,0,false);

    const lm=this.lightingMaterial.uniforms;
    lm.tColor.value=this.world.texture;
    lm.tDepth.value=this.world.depthTexture;
    lm.tAO.value=this.gtao.gtaoMap;
    lm.cameraNear.value=camera.near;
    lm.cameraFar.value=camera.far;
    this.screenQuad.material=this.lightingMaterial;
    renderer.setRenderTarget(this.lighting);
    renderer.render(this.screenScene,this.screenCamera);

    this.bloom.render(renderer,this.lighting,this.lighting,0,false);

    renderer.getDrawingBufferSize(this.screenSize);
    viewmodel.setWorldTexture(this.lighting.texture,this.screenSize);

    const usable=this.history.advance(camera,frame.now);
    const dt=this.lastFrameNow===undefined?1/60:THREE.MathUtils.clamp((frame.now-this.lastFrameNow)/1000,0,.1);
    this.lastFrameNow=frame.now;
    let colorSource:THREE.Texture=this.lighting.texture;
    if(!(frame.motionBlur&&usable))this.blurMaterial.uniforms.strength.value=0;
    if(frame.motionBlur&&usable){
      const blur=this.blurMaterial.uniforms;
      const dtNorm=Number.isFinite(this.history.dt)?THREE.MathUtils.clamp(16.667/Math.max(1,this.history.dt),.25,2):1;
      blur.tDiffuse.value=this.lighting.texture;
      blur.tDepth.value=this.world.depthTexture;
      blur.prevViewProj.value.copy(this.history.previous);
      this.invViewProj.multiplyMatrices(camera.matrixWorld,camera.projectionMatrixInverse);
      blur.invViewProj.value.copy(this.invViewProj);
      blur.strength.value=.46*dtNorm*(1-.65*Math.min(1,frame.adsAmount));
      blur.maxPixels.value=18*this.height/720;
      blur.cameraNear.value=camera.near;
      blur.cameraFar.value=camera.far;
      (blur.cameraPos.value as THREE.Vector3).copy(camera.position);
      this.screenQuad.material=this.blurMaterial;
      renderer.setRenderTarget(this.work);
      renderer.render(this.screenScene,this.screenCamera);
      colorSource=this.work.texture;
    }

    const alpha=renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    renderer.setClearColor(0,0);
    renderer.setRenderTarget(this.hands);
    viewmodel.render(renderer);
    renderer.setClearColor(this.clearColor,alpha);

    const u=this.compositeMaterial.uniforms;
    u.tColor.value=colorSource;
    u.tDepth.value=this.world.depthTexture;
    u.tHands.value=this.hands.texture;
    this.sunWorld.copy(frame.sunDirection).multiplyScalar(535).add(camera.position);
    this.sunNdcVec.copy(this.sunWorld).project(camera);
    this.camForward.set(0,0,-1).applyQuaternion(camera.quaternion);
    const onScreen=this.camForward.dot(frame.sunDirection)>0&&this.sunNdcVec.z<1&&Math.abs(this.sunNdcVec.x)<1.15&&Math.abs(this.sunNdcVec.y)<1.15;
    u.sunUv.value.set(this.sunNdcVec.x*.5+.5,this.sunNdcVec.y*.5+.5);
    u.sunNdc.value=this.sunNdcVec.z*.5+.5;
    const target=onScreen&&!frame.sunOccluded?1:0;
    this.sunVisibility+=(target-this.sunVisibility)*Math.min(1,dt*5);
    u.sunVis.value=this.sunVisibility;
    this.screenQuad.material=this.compositeMaterial;
    renderer.setRenderTarget(null);
    renderer.render(this.screenScene,this.screenCamera);
  }

  refreshWaterTextures(scene:THREE.Scene){
    const voxelRoot=scene.getObjectByName('minecraft-voxel-world');
    if(voxelRoot)this.water?.refreshTextures(voxelRoot);
  }

  get gradeDebug(){return this.compositeMaterial.uniforms;}
  get waterState(){return this.water?.state()??null;}
  get surfaceDebug(){return ultraSurface;}
  debugWaterDepth(renderer:THREE.WebGLRenderer){return this.water?.debugDepthStats(renderer)??null;}

  dispose(){
    this.water?.dispose();
    this.water=undefined;
    this.waterInit=false;
    this.world.dispose();
    this.lighting.dispose();
    this.work.dispose();
    this.hands.dispose();
    this.bloom.dispose();
    (this.bloom as unknown as {materialHighPassFilter?:THREE.Material}).materialHighPassFilter?.dispose();
    this.gtao.dispose();
    this.gtao.gtaoMaterial.dispose();
    this.gtao.blendMaterial.dispose();
    this.lightingMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quadGeo.dispose();
  }
}
