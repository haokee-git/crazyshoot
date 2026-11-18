import * as THREE from 'three';
import type {WeaponViewmodel} from './weapons/viewmodel';
import {CinematicPipeline,nativeRenderSize,rayBlocked,type CinematicFrame} from './rendering/cinematic-pipeline';

export {nativeRenderSize,rayBlocked};

/** Scene resolution can fall independently of the first-person rig and DOM HUD. */
export class RenderPipeline {
  private cinematic?:CinematicPipeline;
  readonly target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
  private readonly hands=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
  private readonly glowTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
  private readonly glowScene=new THREE.Scene();
  private requestedSamples=0;
  private glow=0;
  private readonly glowMaterial=new THREE.ShaderMaterial({
    depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{world:{value:this.target.texture},stepUV:{value:new THREE.Vector2()},threshold:{value:.85}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`
      uniform sampler2D world;
      uniform vec2 stepUV;
      uniform float threshold;
      varying vec2 vUv;
      vec3 highlight(vec2 offset){
        vec3 color=texture2D(world,vUv+offset*stepUV).rgb;
        float value=max(max(color.r,color.g),color.b);
        return min(color,vec3(3.0))*smoothstep(threshold,threshold+.32,value);
      }
      void main(){
        vec3 glow=highlight(vec2(0.0))*.20;
        glow+=(highlight(vec2(1.,0.))+highlight(vec2(-1.,0.))+highlight(vec2(0.,1.))+highlight(vec2(0.,-1.)))*.12;
        glow+=(highlight(vec2(1.,1.))+highlight(vec2(-1.,1.))+highlight(vec2(1.,-1.))+highlight(vec2(-1.,-1.)))*.08;
        gl_FragColor=vec4(glow,1.0);
      }`,
  });
  private readonly scene=new THREE.Scene();
  private readonly camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  private readonly screenSize=new THREE.Vector2();
  private readonly clearColor=new THREE.Color();
  private readonly material=new THREE.ShaderMaterial({
    depthTest:false,
    depthWrite:false,
    uniforms:{world:{value:this.target.texture},hands:{value:this.hands.texture},compositeHands:{value:false},glowMap:{value:this.glowTarget.texture},glowStrength:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`uniform sampler2D world;
      uniform sampler2D hands;
      uniform bool compositeHands;
      uniform sampler2D glowMap;
      uniform float glowStrength;
      varying vec2 vUv;
      void main(){
        vec3 color=texture2D(world,vUv).rgb;
        if(glowStrength>0.0){
          vec3 glow=texture2D(glowMap,vUv).rgb;
          color+=glow*glowStrength*(1.0-0.55*clamp(max(max(color.r,color.g),color.b),0.0,1.0));
        }
        if(compositeHands){
          vec4 foreground=texture2D(hands,vUv);
          color=foreground.rgb+color*(1.0-foreground.a);
        }
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(1.0),.005);
        #include <colorspace_fragment>
      }`,
  });
  private readonly quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);

  constructor(){
    this.scene.add(this.quad);
    this.glowScene.add(new THREE.Mesh(this.quad.geometry,this.glowMaterial));
  }

  setSamples(renderer:THREE.WebGLRenderer,requested:number){
    this.requestedSamples=requested===2||requested===4?requested:0;
    this.configureTargets(renderer);
    this.cinematic?.setSamples(renderer,requested);
  }

  setCinematic(renderer:THREE.WebGLRenderer,enabled:boolean):boolean{
    if(!enabled){this.exitCinematic();return false;}
    if(!renderer.extensions.has('EXT_color_buffer_float')){this.exitCinematic();return false;}
    if(!this.cinematic){
      this.cinematic=new CinematicPipeline();
      this.cinematic.setSamples(renderer,this.requestedSamples);
      this.cinematic.resize(this.target.width,this.target.height);
    }
    return true;
  }

  private exitCinematic(){this.cinematic?.dispose();this.cinematic=undefined;}

  get cinematicActive(){return !!this.cinematic;}

  requestMotionReset(){this.cinematic?.requestMotionReset();}

  lightingDebugState(){
    return {cinematic:!!this.cinematic,world:this.cinematic?{width:this.cinematic.world.width,height:this.cinematic.world.height,samples:this.cinematic.world.samples}:null};
  }

  get cinematicPipeline(){return this.cinematic;}

  setGlow(renderer:THREE.WebGLRenderer,level:'off'|'soft'|'strong'){
    const strength=level==='strong'?.43:level==='soft'?.25:0;
    if(this.glow&&!strength)this.glowTarget.dispose();
    this.glow=strength;
    this.material.uniforms.glowStrength.value=strength;
    this.configureTargets(renderer);
  }

  private configureTargets(renderer:THREE.WebGLRenderer){
    const gl=renderer.getContext() as WebGL2RenderingContext;
    const samples=Math.min(this.requestedSamples,gl.getParameter(gl.MAX_SAMPLES));
    const hdr=this.glow>0&&renderer.extensions.has('EXT_color_buffer_float')&&
      (!samples||Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES) as Int32Array).some(n=>n>=samples));
    this.glowMaterial.uniforms.threshold.value=hdr?.91:.72;
    for(const target of [this.target,this.hands]){
      const type=target===this.target&&hdr?THREE.HalfFloatType:THREE.UnsignedByteType;
      if(target.samples!==samples||target.texture.type!==type){
        target.dispose();target.samples=samples;target.texture.type=type;
      }
    }
  }

  resize(width:number,height:number,ratio:number){
    this.target.setSize(Math.max(1,Math.round(width*ratio)),Math.max(1,Math.round(height*ratio)));
    this.cinematic?.resize(this.target.width,this.target.height);
  }

  render(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,viewmodel:WeaponViewmodel,frame?:CinematicFrame){
    if(this.cinematic&&frame){this.cinematic.render(renderer,scene,camera,viewmodel,frame);return;}
    renderer.info.autoReset=false;
    renderer.info.reset();
    renderer.autoClear=true;
    renderer.setRenderTarget(this.target);
    renderer.render(scene,camera);
    if(this.glow){
      this.glowTarget.setSize(Math.max(1,Math.ceil(this.target.width/4)),Math.max(1,Math.ceil(this.target.height/4)));
      this.glowMaterial.uniforms.stepUV.value.set(5/this.target.width,5/this.target.height);
      renderer.setRenderTarget(this.glowTarget);
      renderer.render(this.glowScene,this.camera);
    }
    renderer.getDrawingBufferSize(this.screenSize);
    viewmodel.setWorldTexture(this.target.texture,this.screenSize);
    const compositeHands=this.target.samples>0;
    this.material.uniforms.compositeHands.value=compositeHands;
    if(compositeHands){
      const {x,y}=this.screenSize;
      if(this.hands.width!==x||this.hands.height!==y)this.hands.setSize(x,y);
      const alpha=renderer.getClearAlpha();
      renderer.getClearColor(this.clearColor);
      renderer.setClearColor(0,0);
      renderer.setRenderTarget(this.hands);
      viewmodel.render(renderer);
      renderer.setClearColor(this.clearColor,alpha);
    }
    renderer.setRenderTarget(null);
    renderer.render(this.scene,this.camera);
    if(!compositeHands){
      renderer.autoClear=false;
      viewmodel.render(renderer);
      renderer.autoClear=true;
    }
  }

  dispose(){
    this.cinematic?.dispose();
    this.target.dispose();
    this.hands.dispose();
    this.glowTarget.dispose();
    this.glowMaterial.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
