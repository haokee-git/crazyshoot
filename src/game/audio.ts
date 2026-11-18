import { getSettings } from './core/settings';
/**
 * Small procedural WebAudio bus. No external assets; unlock on first key input.
 * M toggles mute; preference stored in localStorage.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers=new Map<string,AudioBuffer>();
  private voices=0;
  enabled = localStorage.getItem('crazyshoot.audio') !== '0';

  unlock() {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* audio is optional */ }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('crazyshoot.audio', this.enabled ? '1' : '0');
    if (this.enabled) this.unlock();
  }

  private ready() {if(this.master)this.master.gain.value=.32*getSettings().volume;return this.enabled && this.ctx && this.master && this.ctx.state === 'running'; }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.25, slide = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx!, master = this.master!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g); g.connect(master); osc.start(); osc.stop(ctx.currentTime + dur);
  }

  private noise(dur: number, gain = 0.5, lowpass = 1800) {
    if (!this.ready()) return;
    const ctx = this.ctx!, master = this.master!;
    if(this.voices>=24)return;this.voices++;
    const key=String(dur);let buffer=this.buffers.get(key);if(!buffer){buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*dur),ctx.sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);this.buffers.set(key,buffer);}
    const src = ctx.createBufferSource(); src.buffer = buffer;src.onended=()=>{this.voices--;src.disconnect();};
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = lowpass;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter); filter.connect(g); g.connect(master); src.start();
  }

  dispose(){void this.ctx?.close();this.ctx=null;this.master=null;this.buffers.clear();}
  cannon(){this.noise(.4,.9,700);this.tone(55,.35,'sawtooth',.4,-25);}
  shot() { this.noise(0.13, 0.7, 1600); this.tone(95, 0.09, 'square', 0.22, -40); }
  private nextImpactAt=0;
  /** Impact tick on world geometry. `gain` is a 0..1 distance falloff; rate limited for auto fire. */
  impact(surface:'concrete'|'metal'|'wood'|'dirt', gain=1) {
    if (!this.enabled || gain <= 0.02) return;
    const now = performance.now();
    if (now < this.nextImpactAt) return;
    this.nextImpactAt = now + 38;
    const level = Math.min(1, gain) * (0.62 + Math.random() * 0.38);
    const pitch = 0.86 + Math.random() * 0.3;
    if (surface === 'metal') { this.noise(0.045, 0.22 * level, 4400); this.tone(1750 * pitch, 0.075, 'triangle', 0.055 * level, -900); return; }
    if (surface === 'wood') { this.noise(0.05, 0.32 * level, 1300); this.tone(150 * pitch, 0.06, 'square', 0.06 * level, -40); return; }
    if (surface === 'dirt') { this.noise(0.055, 0.3 * level, 820); return; }
    this.noise(0.06, 0.42 * level, 2400);
    this.tone(210 * pitch, 0.05, 'square', 0.075 * level, -55);
  }
  reload() { this.tone(760, 0.035, 'square', 0.12); setTimeout(() => this.tone(520, 0.05, 'square', 0.10), 260); }
  hit() { this.tone(1450, 0.04, 'triangle', 0.20); }
  hurt() { this.tone(120, 0.22, 'sawtooth', 0.20, -50); }
  capture() { this.tone(520, 0.10, 'triangle', 0.18); setTimeout(() => this.tone(780, 0.14, 'triangle', 0.16), 110); }
  win() { [440, 554, 660].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.18), i * 130)); }
}
