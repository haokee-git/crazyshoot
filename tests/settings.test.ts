import {describe,it,expect,vi,afterEach} from 'vitest';

// settings.ts reads localStorage/location at import time, so each case re-imports a fresh module.
function load(saved?:unknown,search=''){
  const store=new Map<string,string>();
  if(saved!==undefined)store.set('crazyshoot.settings',JSON.stringify(saved));
  vi.stubGlobal('localStorage',{
    getItem:(key:string)=>store.get(key)??null,
    setItem:(key:string,value:string)=>{store.set(key,value);},
    removeItem:(key:string)=>{store.delete(key);},
  });
  vi.stubGlobal('location',{search});
  vi.resetModules();
  return import('../src/game/core/settings');
}

afterEach(()=>vi.unstubAllGlobals());

describe('frame rate default',()=>{
  it('starts uncapped',async()=>{
    const {getSettings}=await load();
    expect(getSettings().frameLimit).toBe(0);
  });

  it('migrates the former 30fps default out of pre-revision saves',async()=>{
    const {getSettings}=await load({sensitivity:1.4,frameLimit:30});
    expect(getSettings().frameLimit).toBe(0);
    expect(getSettings().sensitivity).toBe(1.4);
  });

  it('keeps an explicit 60fps choice in pre-revision saves',async()=>{
    const {getSettings}=await load({frameLimit:60});
    expect(getSettings().frameLimit).toBe(60);
  });

  it('kicks the migration only once, so a later 30fps choice survives',async()=>{
    const {saveSettings,getSettings}=await load({frameLimit:30});
    saveSettings({...getSettings(),frameLimit:30});
    expect(JSON.parse(globalThis.localStorage.getItem('crazyshoot.settings')!).rev).toBe(3);
    vi.resetModules();
    const reloaded=await import('../src/game/core/settings');
    expect(reloaded.getSettings().frameLimit).toBe(30);
  });
});

describe('lighting quality',()=>{
  it('defaults to medium with motion blur available',async()=>{
    const {getSettings}=await load();
    expect(getSettings().lightingQuality).toBe('medium');
    expect(getSettings().motionBlur).toBe(true);
  });

  it('maps the old fine sun-shadow tier to high',async()=>{
    const {getSettings}=await load({sunShadows:'fine'});
    expect(getSettings().lightingQuality).toBe('high');
  });

  it('maps fast/soft sun-shadow tiers to low/medium',async()=>{
    expect((await load({sunShadows:'fast'})).getSettings().lightingQuality).toBe('low');
    expect((await load({sunShadows:'soft'})).getSettings().lightingQuality).toBe('medium');
  });

  it('keeps an explicit valid tier over the old fields',async()=>{
    const {getSettings}=await load({sunShadows:'off',lightingQuality:'ultra'});
    expect(getSettings().lightingQuality).toBe('ultra');
  });

  it('falls back to the default on corrupted tiers',async()=>{
    expect((await load({lightingQuality:'extreme-plus'})).getSettings().lightingQuality).toBe('medium');
    expect((await load({lightingQuality:42})).getSettings().lightingQuality).toBe('medium');
    for(const key of ['toString','constructor','__proto__','hasOwnProperty'])
      expect((await load({lightingQuality:key})).getSettings().lightingQuality).toBe('medium');
  });

  it('validates the motion blur flag instead of trusting the type',async()=>{
    expect((await load({motionBlur:'yes'})).getSettings().motionBlur).toBe(true);
    expect((await load({motionBlur:0})).getSettings().motionBlur).toBe(true);
    expect((await load({motionBlur:false})).getSettings().motionBlur).toBe(false);
  });

  it('survives unparseable saved JSON',async()=>{
    const store=new Map([['crazyshoot.settings','{not json']]);
    vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:()=>{},removeItem:()=>{}});
    vi.stubGlobal('location',{search:''});
    vi.resetModules();
    const {getSettings}=await import('../src/game/core/settings');
    expect(getSettings().lightingQuality).toBe('medium');
  });

  it('keeps the in-memory choice when storage is denied',async()=>{
    const {getSettings,saveSettings}=await load();
    vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('denied');},removeItem:()=>{}});
    saveSettings({...getSettings(),lightingQuality:'ultra'});
    expect(getSettings().lightingQuality).toBe('ultra');
  });

  it('shadows-off stays off unless other effects were enabled',async()=>{
    expect((await load({sunShadows:'off'})).getSettings().lightingQuality).toBe('off');
    expect((await load({sunShadows:'off',ambientOcclusion:true})).getSettings().lightingQuality).toBe('low');
    expect((await load({sunShadows:'off',glow:'soft'})).getSettings().lightingQuality).toBe('low');
  });

  it('seeds from the legacy quality selector when no tier was saved',async()=>{
    expect((await load(undefined,'?quality=high')).getSettings().lightingQuality).toBe('high');
    expect((await load(undefined,'?quality=low')).getSettings().lightingQuality).toBe('low');
  });

  it('drops renderScale/outputScale and never persists them again',async()=>{
    const {getSettings,saveSettings}=await load({renderScale:.5,outputScale:1,fogScale:.82,sunShadows:'soft'});
    const live=getSettings() as unknown as Record<string,unknown>;
    expect('renderScale' in live).toBe(false);
    expect('outputScale' in live).toBe(false);
    expect('fogScale' in live).toBe(false);
    saveSettings({...getSettings(),lightingQuality:'high',motionBlur:false});
    const persisted=JSON.parse(globalThis.localStorage.getItem('crazyshoot.settings')!);
    expect(persisted.rev).toBe(3);
    expect(persisted.lightingQuality).toBe('high');
    expect(persisted.motionBlur).toBe(false);
    for(const stale of ['renderScale','outputScale','fogScale','sunShadows','contactShadows','ambientOcclusion','glow'])
      expect(stale in persisted).toBe(false);
  });

  it('keeps the chosen tier across save and reload',async()=>{
    const {getSettings,saveSettings}=await load();
    saveSettings({...getSettings(),lightingQuality:'ultra'});
    vi.resetModules();
    const reloaded=await import('../src/game/core/settings');
    expect(reloaded.getSettings().lightingQuality).toBe('ultra');
  });
});
