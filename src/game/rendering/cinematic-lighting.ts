import * as THREE from 'three';
import {daylightReflection} from '../world/daylight';
import {ultraSurface} from './pixel-surfaces';
import type {Arena} from '../world/arena';

const PROBE_DIRECTIONS=(()=>{
  const dirs:THREE.Vector3[]=[new THREE.Vector3(0,1,0)];
  for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;dirs.push(new THREE.Vector3(Math.cos(a)*.7071,.7071,Math.sin(a)*.7071).normalize());}
  for(let i=0;i<4;i++){const a=i*Math.PI/2;dirs.push(new THREE.Vector3(Math.cos(a)*.94,.342,Math.sin(a)*.94).normalize());}
  return Object.freeze(dirs.map(d=>Object.freeze(d)));
})();
const PROBE_RANGE=60;

type LightEntry={light:THREE.Light;intensity:number;out:number;in:number};

const scaleFor=(light:THREE.Light,out:number,inN:number):LightEntry=>({light,intensity:light.intensity,out,in:inN});

export class CinematicLighting{
  private pmrem?:THREE.PMREMGenerator;
  private envTarget?:THREE.WebGLRenderTarget;
  private env?:THREE.Texture;
  private worldLights:LightEntry[]=[];
  private viewLights:LightEntry[]=[];
  private baselineExposure=1;
  private savedEnvironment:(THREE.Texture|null)[]=[];
  private savedEnvIntensity=1;
  private savedVmEnvironment:(THREE.Texture|null)[]=[];
  private savedVmEnvIntensity=1;
  private skyVisible=1;
  private skySmooth=1;
  private exposure=1;
  private nextProbe=0;
  private lastUpdate=0;
  private enabled=false;

  state(){return {enabled:this.enabled,sky:this.skySmooth,exposure:this.exposure,env:!!this.env};}
  get active(){return this.enabled;}

  constructor(
    private readonly renderer:THREE.WebGLRenderer,
    private readonly scene:THREE.Scene,
    private readonly viewmodelScene:THREE.Scene,
  ){}

  enable(){
    if(this.enabled)return;
    this.enabled=true;
    this.baselineExposure=this.renderer.toneMappingExposure;
    this.skyVisible=this.skySmooth=1;this.exposure=1;this.lastUpdate=0;this.nextProbe=0;
    this.worldLights.length=0;this.viewLights.length=0;
    this.scene.traverse(o=>{
      if(o instanceof THREE.HemisphereLight)this.worldLights.push(scaleFor(o,.55,.12));
      else if(o instanceof THREE.AmbientLight)this.worldLights.push(scaleFor(o,.35,.08));
    });
    this.viewmodelScene.traverse(o=>{
      if(o instanceof THREE.HemisphereLight)this.viewLights.push(scaleFor(o,.55,.12));
      else if(o instanceof THREE.AmbientLight)this.viewLights.push(scaleFor(o,.35,.08));
    });
    this.savedEnvironment=[this.scene.environment];
    this.savedEnvIntensity=this.scene.environmentIntensity;
    this.savedVmEnvironment=[this.viewmodelScene.environment];
    this.savedVmEnvIntensity=this.viewmodelScene.environmentIntensity;
    daylightReflection.value=0;
    ultraSurface.value=1;
    for(const entry of this.worldLights)entry.light.intensity=entry.intensity*entry.out;
    this.scene.environmentIntensity=.7;
    this.buildEnvironment();
  }

  private buildEnvironment(){
    const bg=this.scene.background;
    if(this.env||!(bg instanceof THREE.Texture)||!bg.image)return;
    this.pmrem=new THREE.PMREMGenerator(this.renderer);
    this.envTarget=this.pmrem.fromEquirectangular(bg);
    this.env=this.envTarget.texture;
    this.scene.environment=this.env;
    this.viewmodelScene.environment=this.env;
  }

  private probeSky(position:THREE.Vector3,rayDistance?:Arena['rayDistance']):number{
    if(!rayDistance)return 1;
    let sum=0,weight=0;
    for(let i=0;i<PROBE_DIRECTIONS.length;i++){
      const w=i===0?2:1;
      const hit=rayDistance(position,PROBE_DIRECTIONS[i],PROBE_RANGE);
      sum+=w*(!Number.isFinite(hit)?1:Math.min(1,hit/PROBE_RANGE));
      weight+=w;
    }
    return sum/weight;
  }

  update(now:number,camera:THREE.PerspectiveCamera,arena:Arena){
    if(!this.enabled)return;
    if(!this.env)this.buildEnvironment();
    const dt=Math.min(Math.max(0,(now-(this.lastUpdate||now-16))/1000),.1);
    this.lastUpdate=now;
    if(now>=this.nextProbe){this.nextProbe=now+250;this.skyVisible=this.probeSky(camera.position,arena.rayDistance);}
    const lambda=this.skyVisible<this.skySmooth?7:1.4;
    this.skySmooth=THREE.MathUtils.damp(this.skySmooth,this.skyVisible,lambda,dt);
    const indoor=1-this.skySmooth;
    for(const entry of this.viewLights)entry.light.intensity=entry.intensity*THREE.MathUtils.lerp(entry.out,entry.in,indoor);
    this.viewmodelScene.environmentIntensity=THREE.MathUtils.lerp(.7,.12,indoor);
    const target=THREE.MathUtils.lerp(.9,1.25,indoor);
    const rate=target<this.exposure?6:1.1;
    this.exposure=THREE.MathUtils.clamp(THREE.MathUtils.damp(this.exposure,target,rate,dt),.85,1.5);
    this.renderer.toneMappingExposure=this.baselineExposure*this.exposure;
  }

  disable(){
    if(!this.enabled)return;
    this.enabled=false;
    for(const entry of this.worldLights)entry.light.intensity=entry.intensity;
    for(const entry of this.viewLights)entry.light.intensity=entry.intensity;
    this.worldLights.length=0;this.viewLights.length=0;
    this.scene.environment=this.savedEnvironment[0]??null;
    this.scene.environmentIntensity=this.savedEnvIntensity;
    this.viewmodelScene.environment=this.savedVmEnvironment[0]??null;
    this.viewmodelScene.environmentIntensity=this.savedVmEnvIntensity;
    this.renderer.toneMappingExposure=this.baselineExposure;
    daylightReflection.value=1;
    ultraSurface.value=0;
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    this.envTarget=undefined;this.env=undefined;this.pmrem=undefined;
  }
}
