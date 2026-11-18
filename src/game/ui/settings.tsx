import { useState } from 'preact/hooks';
import { getSettings,saveSettings,type Settings,type LightingQuality } from '../core/settings';
import { LIGHTING_PRESETS,LIGHTING_QUALITIES } from '../rendering/lighting-presets';
import { BIND_LABELS,loadBinds,saveBinds,type BindAction } from '../core/keybinds';
import { textureResolution,type TextureResolution } from '../../content/materials/battlefield';

interface Props {
  lightingStatus?:()=>string;
  onClose:()=>void;
  onGraphics:()=>void;
  onTexture:(res:TextureResolution)=>Promise<void>;
  onFullscreen:()=>void;
  onBindings:()=>void;
}

export function GameSettings({onClose,lightingStatus,onGraphics,onTexture,onFullscreen,onBindings}:Props){
  const [value,setValue]=useState(getSettings);
  const [texture,setTexture]=useState(()=>textureResolution(new URLSearchParams(location.search).get('res')??localStorage.getItem('crazyshoot.textureRes')));
  const [textureBusy,setTextureBusy]=useState(false);
  const [textureError,setTextureError]=useState('');
  const [binds,setBinds]=useState(loadBinds);
  const [listening,setListening]=useState<BindAction|null>(null);

  function set<K extends keyof Settings>(key:K,v:Settings[K]){
    const next={...value,[key]:v};setValue(next);saveSettings(next);
    if(['msaa','lightingQuality','motionBlur'].includes(key))onGraphics();
  }

  async function changeTexture(next:TextureResolution){
    setTextureBusy(true);setTextureError('');
    try{
      await onTexture(next);
      localStorage.setItem('crazyshoot.textureRes',String(next));
      const url=new URL(location.href);url.searchParams.delete('res');history.replaceState(null,'',url);
      setTexture(next);
    }catch{
      setTextureError('贴图加载失败，可以再次选择。');
    }finally{
      setTextureBusy(false);
    }
  }

  function bind(e:KeyboardEvent){
    if(!listening)return;
    e.preventDefault();e.stopPropagation();
    if(!['Escape','Tab','KeyR','KeyE','KeyB','KeyM','KeyN','KeyP','KeyG','KeyH','KeyX','BracketLeft','BracketRight'].includes(e.code)&&
      !/^Digit[1-9]$/.test(e.code)&&!Object.entries(binds).some(([action,code])=>action!==listening&&code===e.code)){
      const next={...binds,[listening]:e.code};
      setBinds(next);saveBinds(next);onBindings();
    }
    setListening(null);
  }

  const sliders=[
    ['sensitivity','鼠标灵敏度',.2,3,.1],
    ['adsSensitivity','开镜灵敏度倍率',.15,2,.05],
    ['fov','视野',60,100,1],
    ['shake','镜头侧摆',0,1,.1],
    ['volume','音量',0,1,.1],
  ] as const;
  return <section class="settings-panel" role="dialog" aria-modal="true" aria-label="游戏设置" onKeyDown={bind}>
    <h2>游戏设置</h2>
    <p>本机画质 · 原生分辨率渲染</p>
    <label>光影质量<select value={value.lightingQuality} onChange={e=>set('lightingQuality',e.currentTarget.value as LightingQuality)}>
      {LIGHTING_QUALITIES.map(q=><option value={q}>{LIGHTING_PRESETS[q].label}{q==='ultra'?' · 开销最大':''}</option>)}
    </select></label>
    <p>{LIGHTING_PRESETS[value.lightingQuality].description}</p>
    {value.lightingQuality==='ultra'&&lightingStatus?.()&&<p role="alert">{lightingStatus()}</p>}
    {value.lightingQuality==='ultra'&&<label>动态模糊<input type="checkbox" checked={value.motionBlur} onChange={e=>set('motionBlur',e.currentTarget.checked)}/></label>}
    <label>粒子数量<select value={value.particles} onChange={e=>set('particles',Number(e.currentTarget.value))}>
      <option value="24">少</option><option value="32">中</option><option value="64">多</option>
    </select></label>
    <label>贴图分辨率<select disabled={textureBusy} value={texture} onChange={e=>void changeTexture(textureResolution(e.currentTarget.value))}>
      {[32,64,128].map(res=><option value={res}>{res}×{res}</option>)}
    </select></label>
    {textureBusy&&<p role="status">正在替换贴图…</p>}
    {textureError&&<p role="alert">{textureError}</p>}
    <label>抗锯齿<select value={value.msaa} onChange={e=>set('msaa',Number(e.currentTarget.value))}>
      <option value="0">关闭</option><option value="2">MSAA 2×</option><option value="4">MSAA 4×</option>
    </select></label>
    <label>帧率上限<select value={value.frameLimit} onChange={e=>set('frameLimit',Number(e.currentTarget.value))}>
      <option value="30">30</option><option value="60">60</option><option value="0">不限</option>
    </select></label>
    <label>显示模式<button onClick={onFullscreen}>切换全屏 / 窗口</button></label>
    {sliders.map(([key,label,min,max,step])=><label>{label}<input type="range" min={min} max={max} step={step} value={value[key]} onInput={e=>set(key,Number(e.currentTarget.value))}/><b>{value[key].toFixed(key==='adsSensitivity'?2:1)}</b></label>)}
    <label>瞄准方式<select value={value.adsHold?'hold':'toggle'} onChange={e=>set('adsHold',e.currentTarget.value==='hold')}>
      <option value="hold">按住右键</option><option value="toggle">单击切换</option>
    </select></label>
    {([['crouchHold','下蹲方式'],['proneHold','趴下方式']] as const).map(([key,label])=><label key={key}>{label}
      <select value={value[key]?'hold':'toggle'} onChange={e=>set(key,e.currentTarget.value==='hold')}>
        <option value="toggle">按一下切换</option><option value="hold">按住保持</option>
      </select>
    </label>)}
    <label>反转鼠标纵轴<input type="checkbox" checked={value.invertY} onChange={e=>set('invertY',e.currentTarget.checked)}/></label>
    <div class="keybind-grid">
      {(Object.keys(BIND_LABELS) as BindAction[]).map(action=><button class={listening===action?'listening':''} onClick={()=>setListening(action)}>
        <span>{BIND_LABELS[action]}</span><b>{listening===action?'按任意键':binds[action].replace('Key','')}</b>
      </button>)}
    </div>
    <p>B 切换射击模式 / 炮弹 · E 上下车 · 数字键换座<br/>G / H 投掷 · [ / ] 调倍率 · M 大地图 · N 静音<br/>Esc / P 打开菜单 · Safari 全屏中用 P</p>
    <button onClick={onClose}>关闭设置</button>
  </section>;
}
