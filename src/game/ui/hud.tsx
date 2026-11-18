import { useEffect, useRef, useState } from 'preact/hooks';
import type { HudState } from '../engine';
import { FIRE_MODES } from '../../content/weapons/catalog';

function vehicleGlyph(kind: string) {
  if (kind === 'motorcycle') return 'M';
  if (kind === 'jeep') return 'J';
  if (kind === 'apc') return 'A';
  if (kind === 'ifv') return 'I';
  if (kind === 'light_tank') return 'LT';
  if (kind === 'mbt') return 'MBT';
  return '?';
}

function clock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `00:${String(s).padStart(2, '0')}`;
}

function matchClock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const planCache = new WeakMap<number[][], HTMLCanvasElement>();
type PlanPalette = [number, number, number][];
const DEFAULT_PALETTE: PlanPalette = [[28,67,74],[54,67,49],[82,95,61],[118,124,85],[146,139,108]];
function planImage(plan: number[][], worldSize: number, palette?: PlanPalette, colors?: Uint8Array): HTMLCanvasElement {
  const cached = planCache.get(plan);
  if (cached) return cached;
  const n = Math.max(2, plan.length || 64);
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const pal = palette?.length === 5 ? palette : DEFAULT_PALETTE;
  if (colors && colors.length === n * n * 4) {
    const img = ctx.createImageData(n, n); img.data.set(colors.subarray(0, n * n * 4)); ctx.putImageData(img, 0, 0); planCache.set(plan, cv); return cv;
  }
  // 用本地最大高度归一化，每张图都用自己的色调，不再全局橄榄绿。
  let maxH = 1;
  for (const row of plan) for (const v of row) if (Number.isFinite(v)) maxH = Math.max(maxH, v);
  const span = Math.max(6, maxH - 0.35);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const h = plan[iz]?.[ix] ?? 0;
      let r = 0, g = 0, b = 0, a = 0;
      if (h > 0.35) {
        const t = Math.max(0, Math.min(1, (h - 0.35) / span));
        const stop = t < .22 ? 1 : t < .52 ? 2 : t < .80 ? 3 : 4;
        [r, g, b] = pal[stop];
        // 只保留极轻的明暗，不再用大块深浅色阶。
        const shade = .96 + Math.min(1, t) * .08;
        r = Math.min(255, r * shade); g = Math.min(255, g * shade); b = Math.min(255, b * shade);
        a = 235;
      }
      const o = (iz * n + ix) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  planCache.set(plan, cv);
  return cv;
}

const contourCache = new WeakMap<number[][], HTMLCanvasElement>();
function contourImage(plan: number[][]): HTMLCanvasElement | null {
  const cached = contourCache.get(plan);
  if (cached) return cached;
  const n = plan.length;
  if (!n) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d')!;
  ctx.strokeStyle = 'rgba(62,50,34,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const h = plan[z]?.[x] ?? 0;
      if (h <= 0.35) continue;
      const band = Math.floor(h / 4);
      const right = x + 1 < n ? plan[z]?.[x + 1] ?? h : h;
      const down = z + 1 < n ? plan[z + 1]?.[x] ?? h : h;
      if (Math.floor(right / 4) !== band) { ctx.moveTo(x + 1, z); ctx.lineTo(x + 1, z + 1); }
      if (Math.floor(down / 4) !== band) { ctx.moveTo(x, z + 1); ctx.lineTo(x + 1, z + 1); }
    }
  }
  ctx.stroke();
  contourCache.set(plan, cv);
  return cv;
}

export function ScopeOverlay({ zoom,blend=1 }: { zoom: number;blend?:number }) {
  if (zoom <= 1) return null;
  return (
    <div class="scope-layer" style={{opacity:Math.max(0,Math.min(1,(blend-.45)/.5))}} aria-hidden="true">

      
      
      <div class="scope-zoom">{zoom.toFixed(0)}X</div>
    </div>
  );
}

const LOOT_COLORS: Record<string, string> = { amr: '#ffcf5c', rocket: '#8ee06a', flamethrower: '#ff9d5c' };
const LOOT_LABELS: Record<string, string> = { amr: 'AMR', rocket: 'RPG', flamethrower: 'FLM' };

/** 特殊武器箱图标：AMR 准星 / 火箭弹头 / 火苗，三种形状区分，颜色对应地图图例。 */
function drawLootIcon(ctx: CanvasRenderingContext2D, x: number, y: number, weaponId: string, size: number, alpha = 1) {
  const color = LOOT_COLORS[weaponId] ?? '#e9d38a';
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(5,12,13,.82)';
  ctx.beginPath(); ctx.arc(0, 0, size * 1.25, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1.1, size * .28); ctx.lineCap = 'round';
  if (weaponId === 'amr') {
    ctx.beginPath(); ctx.arc(0, 0, size * .58, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * .95, 0); ctx.lineTo(-size * .36, 0);
    ctx.moveTo(size * .36, 0); ctx.lineTo(size * .95, 0);
    ctx.moveTo(0, -size * .95); ctx.lineTo(0, -size * .36);
    ctx.moveTo(0, size * .36); ctx.lineTo(0, size * .95);
    ctx.stroke();
  } else if (weaponId === 'rocket') {
    ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * .62, size * .42); ctx.lineTo(0, size * .16); ctx.lineTo(-size * .62, size * .42); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(0, -size); ctx.quadraticCurveTo(size * .78, -size * .05, size * .34, size * .72); ctx.lineTo(0, size * .95); ctx.lineTo(-size * .34, size * .72); ctx.quadraticCurveTo(-size * .78, -size * .05, 0, -size); ctx.fill();
    ctx.fillStyle = 'rgba(255,246,214,.92)';
    ctx.beginPath(); ctx.moveTo(0, -size * .18); ctx.quadraticCurveTo(size * .3, size * .12, 0, size * .62); ctx.quadraticCurveTo(-size * .3, size * .12, 0, -size * .18); ctx.fill();
  }
  ctx.restore();
}

function MiniMap({ hud }: { hud: HudState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const S = 210, c = S / 2, R = 101;
    const worldSize = hud.minimap.worldSize ?? 64;
    const range = Math.min(worldSize, 100);
    const scale = (R - 8) / range;
    const yaw = hud.minimap.yaw;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(22,32,26,.94)'; ctx.fillRect(0, 0, S, S);

    // floor plan, rotated so the player's forward is always up
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(yaw);
    const plan = hud.minimap.plan;
    if (plan) {
      ctx.imageSmoothingEnabled = !!hud.minimap.ortho;
      const source = hud.minimap.ortho ?? planImage(plan, worldSize, hud.minimap.palette, hud.minimap.colors);
      ctx.drawImage(source, (hud.minimap.minX-hud.minimap.x)*scale,(hud.minimap.minZ-hud.minimap.z)*scale, worldSize * scale, worldSize * scale);
    }
    const drawAt = (x: number, z: number, clamp = false) => {
      let dx = (x - hud.minimap.x) * scale;
      let dz = (z - hud.minimap.z) * scale;
      const d = Math.hypot(dx, dz);
      const edge = d > R - 12;
      if (clamp && edge) { const k = (R - 12) / Math.max(1, d); dx *= k; dz *= k; }
      return { x: dx, y: dz, edge, d };
    };
    // capture points: same circular meter language as the top HUD
    for (const cap of hud.minimap.caps) {
      const p = drawAt(cap.x, cap.z, true);
      ctx.globalAlpha = p.edge ? 0.55 : 1;
      const lead = cap.owner;
      const rel = lead === 'neutral' ? 'neutral' : lead === hud.team ? 'friendly' : 'enemy';
      const col = rel === 'friendly' ? '#48dc8c' : rel === 'enemy' ? '#ff5c4c' : '#a6b1ad';
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(4,10,12,.65)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(160,175,168,.35)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.abs(cap.progress)));
      ctx.strokeStyle = col; ctx.stroke();
      ctx.fillStyle = col; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cap.id, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    // vehicle pads: ready (faint ring, car square sits on it), respawning (amber + seconds),
    // occupied (dashed grey). Noise is a problem on a 1 km map, so markers stay tiny.
    for (const pad of hud.vehiclePads ?? []) {
      if (!Number.isFinite(pad.x) || !Number.isFinite(pad.z)) continue;
      const p = drawAt(pad.x!, pad.z!, true);
      ctx.globalAlpha = p.edge ? .5 : 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      if (pad.state === 'ready') {
        ctx.fillStyle = 'rgba(4,10,12,.45)'; ctx.fill();
        ctx.strokeStyle = 'rgba(217,197,139,.45)'; ctx.lineWidth = 1; ctx.stroke();
      } else if (pad.state === 'respawning') {
        ctx.strokeStyle = '#ffc35c'; ctx.lineWidth = 1.6; ctx.stroke();
        if (pad.seconds !== undefined) {
          ctx.fillStyle = '#ffd98a'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(Math.max(1, Math.ceil(pad.seconds))), p.x, p.y);
        }
      } else {
        ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(152,168,162,.9)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }
    // all living teammates green; only spotted living enemies red
    for (const o of hud.minimap.others) {
      if (o.dead) continue;
      if (o.team !== hud.team && !o.spotted) continue;
      const p = drawAt(o.x, o.z);
      if (p.edge) continue;
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, o.team === hud.team ? 4.5 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = o.team === hud.team ? '#5ee6a0' : '#ff5c4c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const v of hud.minimap.vehicles) {
      const p = drawAt(v.x, v.z);
      if (p.edge) continue;
      ctx.globalAlpha = 1;
      const rel = v.team === 'neutral' ? 'neutral' : v.team === hud.team ? 'friendly' : 'enemy';
      const col = rel === 'friendly' ? '#69e9ad' : rel === 'enemy' ? '#ff6a58' : '#d9c58b';
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(5,12,13,.8)'; ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(-3.5, -3.5, 7, 7);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // special weapon crates: distinct icon per weapon, pinned to the rim when out of range
    for (const c of hud.minimap.crates) {
      const p = drawAt(c.x, c.z, true);
      drawLootIcon(ctx, p.x, p.y, c.weaponId, 5.1, p.edge ? .55 : 1);
    }
    ctx.restore();

    // player arrow always points up
    ctx.save(); ctx.translate(c, c);
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fillStyle = '#eafff8'; ctx.fill(); ctx.strokeStyle = '#071012'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    ctx.restore();

    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(120,190,180,.55)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, R - 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(20,50,50,.8)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(200,230,220,.6)'; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillText('N',c+Math.sin(yaw)*(R-14),c-Math.cos(yaw)*(R-14));
  }, [hud]);
  return <canvas ref={ref} class="game-minimap" width={210} height={210} />;
}


function RespawnMap({ hud, onPick, fullscreen = false }: { hud: HudState; onPick?: (id: string) => void; fullscreen?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, tickResize] = useState(0);
  const view = useRef({ zoom: 1, panX: 0, panY: 0 });
  const drawRef = useRef<() => void>(() => {});
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!fullscreen) return;
    const onResize = () => tickResize((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fullscreen]);
  // 战术地图强制 1:1：全屏时取窗口短边做正方形，两侧留黑边，绝不把 1000×1000 世界拉成 16:9。
  const viewport = () => fullscreen
    ? { W: Math.max(320, Math.min(window.innerWidth, window.innerHeight)), H: Math.max(320, Math.min(window.innerWidth, window.innerHeight)) }
    : { W: 600, H: 600 };
  const clampView = (W: number, H: number) => {
    const v = view.current;
    v.zoom = Math.min(4, Math.max(1, v.zoom));
    v.panX = Math.min(0, Math.max(W - W * v.zoom, v.panX));
    v.panY = Math.min(0, Math.max(H - H * v.zoom, v.panY));
  };
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const { W, H } = viewport();
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const v = view.current;
      if (!fullscreen) { v.zoom = 1; v.panX = 0; v.panY = 0; }
      clampView(W, H);
      const size = hud.minimap.worldSize || 64;
      // 画布本身是正方形；zoom/pan 只缩放/平移，不拉伸位图。
      const pad = fullscreen ? Math.round(Math.min(W, H) * .012) : 22;
      const u = fullscreen ? Math.min(W / 1280, H / 720) : Math.min(W, H) / 600;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#060c0e'; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(v.panX, v.panY);
      ctx.scale(v.zoom, v.zoom);
      const sx = (W - pad * 2) / size, sy = (H - pad * 2) / size;
      const px = (x: number) => pad + (x - hud.minimap.minX) * sx;
      const pz = (z: number) => pad + (z - hud.minimap.minZ) * sy;
      const plan = hud.minimap.plan;
      if (plan) {
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        const source = hud.minimap.ortho ?? planImage(plan, size, hud.minimap.palette, hud.minimap.colors);
        ctx.drawImage(source, pad, pad, W - pad * 2, H - pad * 2);
        if (!hud.minimap.ortho) {
          const contours = contourImage(plan);
          if (contours) ctx.drawImage(contours, pad, pad, W - pad * 2, H - pad * 2);
        }
      }
      const inv = 1 / v.zoom;
      ctx.strokeStyle = 'rgba(120,175,165,.16)'; ctx.lineWidth = inv;
      for (let i = 1; i < 8; i++) {
        const x = pad + (i / 8) * (W - pad * 2), y = pad + (i / 8) * (H - pad * 2);
        ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
      }
      if (!fullscreen) { ctx.strokeStyle = 'rgba(140,205,190,.5)'; ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2); }
      const capR = Math.round(22 * u) * inv;
      for (const c of hud.minimap.caps) {
        const rel = c.owner === 'neutral' ? 'neutral' : c.owner === hud.team ? 'friendly' : 'enemy';
        const col = rel === 'friendly' ? '#48dc8c' : rel === 'enemy' ? '#ff5c4c' : '#a6b1ad';
        const x = px(c.x), y = pz(c.z);
        ctx.beginPath(); ctx.arc(x, y, capR, 0, Math.PI * 2); ctx.fillStyle = 'rgba(5,12,13,.82)'; ctx.fill();
        ctx.lineWidth = Math.max(2, 3 * u) * inv; ctx.strokeStyle = 'rgba(140,170,160,.35)'; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, capR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.abs(c.progress)));
        ctx.strokeStyle = col; ctx.stroke();
        ctx.fillStyle = col; ctx.font = `bold ${Math.round(18 * u * inv)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.id, x, y);
      }
      for (const o of hud.minimap.others) {
        if (o.dead) continue;
        if (o.team !== hud.team && !o.spotted) continue;
        const x = px(o.x), y = pz(o.z);
        ctx.beginPath(); ctx.arc(x, y, (o.team === hud.team ? 5 : 5.5) * u * inv, 0, Math.PI * 2);
        ctx.fillStyle = o.team === hud.team ? '#5ee6a0' : '#ff5c4c'; ctx.fill();
        ctx.strokeStyle = '#071012'; ctx.lineWidth = Math.max(1, 1.5 * u) * inv; ctx.stroke();
      }
      if (hud.dead) {
        ctx.strokeStyle = 'rgba(255,220,210,.8)'; ctx.lineWidth = 2 * inv;
        const x = px(hud.minimap.x), z = pz(hud.minimap.z);
        const m = 5 * u * inv;
        ctx.beginPath(); ctx.moveTo(x - m, z - m); ctx.lineTo(x + m, z + m); ctx.moveTo(x + m, z - m); ctx.lineTo(x - m, z + m); ctx.stroke();
        for (const p of hud.respawnOptions) {
          const x2 = px(p.x), y2 = pz(p.z), selected = p.id === hud.respawnChoice;
          const r = (selected ? 16 : 12) * u * inv;
          ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2);
          ctx.fillStyle = selected ? 'rgba(72,220,140,.22)' : 'rgba(5,12,13,.7)'; ctx.fill();
          ctx.lineWidth = Math.max(1.5, (selected ? 3 : 1.5) * u) * inv; ctx.strokeStyle = selected ? '#8cffc0' : '#7f9c94'; ctx.stroke();
          ctx.fillStyle = selected ? '#baffd3' : '#b1c1ba'; ctx.font = `bold ${Math.round(10 * u * inv)}px monospace`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.id === 'base' ? '⌂' : p.id, x2, y2);
        }
      } else {
        ctx.save(); ctx.translate(px(hud.minimap.x), pz(hud.minimap.z)); ctx.rotate(-hud.minimap.yaw); ctx.scale(u * inv, u * inv);
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 4); ctx.lineTo(-7, 7); ctx.closePath();
        ctx.fillStyle = '#ebfff8'; ctx.fill(); ctx.strokeStyle = '#172622'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      }
      const vSize = 8 * u * inv;
      for (const vh of hud.minimap.vehicles) {
        const x = px(vh.x), y = pz(vh.z);
        const rel = vh.team === 'neutral' ? 'neutral' : vh.team === hud.team ? 'friendly' : 'enemy';
        const col = rel === 'friendly' ? '#69e9ad' : rel === 'enemy' ? '#ff6a58' : '#d9c58b';
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = 'rgba(5,12,13,.88)'; ctx.fillRect(-vSize, -vSize, vSize * 2, vSize * 2);
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 1.5 * u) * inv; ctx.strokeRect(-vSize, -vSize, vSize * 2, vSize * 2);
        ctx.restore();
        ctx.fillStyle = col; ctx.font = `bold ${Math.round(8 * u * inv)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(vehicleGlyph(vh.kind), x, y);
      }
      for (const c of hud.minimap.crates) {
        const x = px(c.x), y = pz(c.z);
        drawLootIcon(ctx, x, y, c.weaponId, 9 * u * inv);
        ctx.fillStyle = LOOT_COLORS[c.weaponId] ?? '#e9d38a';
        ctx.font = `bold ${Math.round(8 * u * inv)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(LOOT_LABELS[c.weaponId] ?? '', x, y + 21 * u * inv);
      }
      ctx.restore();
      // 图例固定在屏幕上，不随地图缩放/拖动
      const lx = pad + 4, ly = fullscreen ? H - pad - 18 * u : 4;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = `${Math.round(10 * u)}px monospace`;
      ctx.fillStyle = '#77e6aa'; ctx.fillText('● 队友', lx, ly);
      ctx.fillStyle = '#ff7a68'; ctx.fillText('● 已发现敌人', lx + 74 * u, ly);
      ctx.fillStyle = '#d9c58b'; ctx.fillText('◆ 载具', lx + 200 * u, ly);
      drawLootIcon(ctx, lx + 268 * u, ly + 6 * u, 'amr', 5 * u);
      ctx.fillStyle = '#ffcf5c'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('AMR', lx + 277 * u, ly);
      drawLootIcon(ctx, lx + 320 * u, ly + 8 * u, 'rocket', 5 * u);
      ctx.fillStyle = '#8ee06a'; ctx.fillText('RPG', lx + 329 * u, ly);
      drawLootIcon(ctx, lx + 372 * u, ly + 8 * u, 'flamethrower', 5 * u);
      ctx.fillStyle = '#ff9d5c'; ctx.fillText('FLM', lx + 381 * u, ly);
      if (fullscreen) {
        ctx.fillStyle = 'rgba(190,210,203,.62)'; ctx.font = `${Math.round(10 * u)}px monospace`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText('拖动平移 · 滚轮缩放', W - pad - 6, H - pad - 18 * u);
      }
    };
    drawRef.current = draw;
    draw();
  }, [hud, fullscreen]);
  const toLocal = (e: MouseEvent) => {
    const cv = e.currentTarget as HTMLCanvasElement, r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height };
  };
  const onDown = (e: MouseEvent) => {
    if (!fullscreen) return;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLCanvasElement).style.cursor = 'grabbing';
  };
  const onMove = (e: MouseEvent) => {
    if (!fullscreen || !drag.current) return;
    const cv = e.currentTarget as HTMLCanvasElement, r = cv.getBoundingClientRect();
    const scaleX = cv.width / r.width, scaleY = cv.height / r.height;
    view.current.panX += (e.clientX - drag.current.x) * scaleX;
    view.current.panY += (e.clientY - drag.current.y) * scaleY;
    drag.current = { x: e.clientX, y: e.clientY };
    clampView(cv.width, cv.height);
    drawRef.current();
  };
  const endDrag = (e: MouseEvent) => {
    if (!drag.current) return;
    drag.current = null;
    if (fullscreen) (e.currentTarget as HTMLCanvasElement).style.cursor = 'grab';
  };
  const onWheel = (e: WheelEvent) => {
    if (!fullscreen) return;
    e.preventDefault();
    const cv = e.currentTarget as HTMLCanvasElement;
    const p = toLocal(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const old = view.current.zoom;
    const next = Math.min(4, Math.max(1, old * factor));
    if (next === old) return;
    view.current.panX = p.x - (p.x - view.current.panX) * (next / old);
    view.current.panY = p.y - (p.y - view.current.panY) * (next / old);
    view.current.zoom = next;
    clampView(cv.width, cv.height);
    drawRef.current();
  };
  const pick = (e: MouseEvent) => {
    if (!onPick) return;
    const cv = e.currentTarget as HTMLCanvasElement;
    const W = cv.width, H = cv.height;
    const size = hud.minimap.worldSize || 64;
    const pad = fullscreen ? Math.round(Math.min(W, H) * .012) : 22;
    const local = toLocal(e);
    const x = local.x, y = local.y;
    const sx = (W - pad * 2) / size, sy = (H - pad * 2) / size;
    let best: string | null = null; let bd = Math.max(42, Math.min(W, H) * .07);
    for (const p of hud.respawnOptions) {
      const px = pad + (p.x - hud.minimap.minX) * sx, py = pad + (p.z - hud.minimap.minZ) * sy;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = p.id; }
    }
    if (best) onPick(best);
  };
  return <canvas ref={ref} class="respawn-map" width={fullscreen ? 1280 : 600} height={fullscreen ? 1280 : 600}
    style={fullscreen ? { cursor: 'grab' } : hud.dead && onPick ? { cursor: 'pointer' } : undefined}
    onClick={pick} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag} onWheel={onWheel} />;
}

export function GameHud({ hud, onRespawnPoint, onOpenLoadout, onRespawnNow, onExit, onSettings }: { hud: HudState;onRespawnPoint?: (id: string) => void; onOpenLoadout?: () => void; onRespawnNow?: () => void; onExit?: () => void;onSettings?:()=>void }) {
  const friendlyScore = Math.floor(hud.team === 'blue' ? hud.blueScore : hud.orangeScore);
  const enemyScore = Math.floor(hud.team === 'blue' ? hud.orangeScore : hud.blueScore);
  const scoreSum = Math.max(1, friendlyScore + enemyScore);
  const low = Math.max(0, 1 - hud.health / 100);
  const lowColor = hud.health > 60 ? '255,255,255' : hud.health > 35 ? '255,196,96' : '255,78,66';
  const lowAlpha = hud.health > 60 ? 0.02 + low * 0.04 : 0.035 + low * 0.18;
  // 动态据点：3 图只有 A/B/C，法老 5 图是 A–E；不写死三点，也不会渲染空 D/E。
  const caps = hud.captures ?? [];
  return (
    <div class="game-hud">
      <ScopeOverlay zoom={hud.scope} blend={hud.adsBlend} />
      <div class="game-topbar">
        <div class="game-mapname">{hud.mapName}</div>
        <div class={`game-team ${hud.team}`}>{hud.team === 'blue' ? '蓝队 BLUE' : '橙队 ORANGE'}</div>
        <div class="game-matchtimer">{matchClock(hud.matchSeconds)}</div>
        <div class="game-phase">
          {hud.phase === 'prep' ? <>整备中 <b>{clock(hud.prepSeconds)}</b></> : <><i /> 战斗</>}
        </div>
      </div>

      <div class="game-center-top">
        <div class="game-scorebar">
          <span class="score-side friendly">{friendlyScore}</span>
          <div class="score-track">
            <i class="score-fill friendly" style={{ width: `${(friendlyScore / scoreSum) * 100}%` }} />
            <i class="score-fill enemy" style={{ width: `${(enemyScore / scoreSum) * 100}%` }} />
          </div>
          <span class="score-side enemy">{enemyScore}</span>
        </div>
        <div class={`game-cap-rings${caps.length > 3 ? ' many' : ''}`}>
          {caps.map((cap) => {
            const pct = Math.min(1, Math.abs(cap.progress));
            const leadTeam = cap.progress > 0.001 ? 'blue' : cap.progress < -0.001 ? 'orange' : cap.owner;
            const rel = leadTeam === 'neutral' ? 'neutral' : leadTeam === hud.team ? 'friendly' : 'enemy';
            const active = pct > 0.02 && pct < 0.995;
            return (
              <div key={cap.id} class={`cap-ring ${rel}${active ? ' active' : ''}`} title={`${cap.id} ${Math.round(pct * 100)}%`}>
                <svg viewBox="0 0 48 48"><circle class="ring-bg" cx="24" cy="24" r="19" /><circle class="ring-fill" cx="24" cy="24" r="19" stroke-dasharray={`${pct * 119.4} 119.4`} /></svg>
                <b>{cap.id}</b>
              </div>
            );
          })}
        </div>
      </div>

      {hud.message.includes('后台')&&<div class="room-suspended">{hud.message}</div>}
      {hud.underwater && <div class="game-underwater" />}
      {hud.phase === 'live' && hud.health<100 && <div class="game-lowhealth" style={{ opacity:low,background: `rgba(${lowColor},${lowAlpha})` }} />}
      <div class="game-hurt" style={{ opacity: Math.min(0.55, hud.hurtFlash * 0.55) }} />
      {hud.burnBlind > 0.01 && (
        <div class="game-burn" style={{ opacity: hud.burnBlind }} aria-hidden="true">
          <i /><i /><i />
        </div>
      )}

      {hud.phase === 'live' && (
        <>
          {!hud.mapOpen && <MiniMap hud={hud} />}
          {!hud.mapOpen && (hud.vehiclePads?.length ?? 0) > 0 && (() => {
            const pads = hud.vehiclePads!;
            const ready = pads.filter(p => p.state === 'ready').length;
            const respawning = pads.filter(p => p.state === 'respawning').length;
            const occupied = pads.filter(p => p.state === 'occupied').length;
            return (
              <div class="game-vehicle-pads" aria-label="车位状态">
                <b>车位</b>
                <span class="ready">{ready} 可用</span>
                <span class="respawning">{respawning} 刷新</span>
                <span class="occupied">{occupied} 占用</span>
              </div>
            );
          })()}
          {hud.vehiclePrompt && <div class="game-vehicle-prompt">{hud.vehiclePrompt}</div>}
          {(!hud.ads&&!hud.driving||hud.vehicle?.cannon)&&<div class={`game-crosshair${hud.hitmarker?' hit':''}`}><i/><i/><i/><i/></div>}
          {hud.ads&&hud.hitmarker&&<div class="ads-hitmarker">×</div>}
          {hud.aimedAmmo&&<div class={`game-loot-status ${hud.aimedAmmo}`}>{hud.aimedAmmo==='available'?'有弹药':'已取走'}</div>}
          {!!hud.ammoPickup&&<div class="game-loot-confirmation" role="status">已领取弹药 +{hud.ammoPickup}</div>}
          {!hud.winner && hud.protectionSeconds > 0 && (
            <div class="game-spawn-protection" role="timer" aria-label="复活无敌倒计时">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M12 3 4 6v5c0 4.7 3 7.7 8 10 5-2.3 8-5.3 8-10V6zM9 12l2 2 4-4"/>
              </svg>
              <span>复活无敌</span><b>{hud.protectionSeconds} 秒</b>
            </div>
          )}
          {hud.vehicle&&<>
            {hud.vehicle.cannon&&hud.vehicle.actual.visible&&<div class="tank-axis" style={{left:`${hud.vehicle.actual.x}%`,top:`${hud.vehicle.actual.y}%`}}><i/>实炮方向</div>}
            {!hud.vehicle.cannon&&hud.vehicle.weapon&&hud.vehicle.actual.visible&&<div class="vehicle-mg-reticle" style={{left:`${hud.vehicle.actual.x}%`,top:`${hud.vehicle.actual.y}%`}}>·</div>}
            <div class="vehicle-status">
              <b>{hud.vehicle.name} · {hud.vehicle.health}/{hud.vehicle.maxHealth}</b>
              <span>{Math.abs(hud.vehicle.speed).toFixed(0)} km/h · {hud.vehicle.speed<-.5?'倒车':hud.vehicle.speed>.5?'前进':'停止'}</span>
              {hud.vehicle.seats.map((seat,index)=><span class={`vehicle-seat ${hud.vehicle!.seat===index?'selected':seat.occupied?'occupied':''}`}>
                <kbd>{index+1}</kbd> {seat.label} <small>{hud.vehicle!.seat===index?'当前':seat.occupied?'有人':'空位'}</small>
              </span>)}
              {hud.vehicle.cannon&&<span>{hud.vehicle.shell} · B 切换弹种</span>}
              {hud.vehicle.blocked&&<em>枪炮口附近有障碍</em>}
            </div>
          </>}
          <div class="game-health">
            <span>{hud.driving?'乘员生命':'生命'}</span>
            <b>{Math.ceil(hud.health)}</b>
            <div class="health-bar"><i style={{ width: `${hud.health}%` }} /></div>
          </div>
          <div class={`game-ammo${hud.ammo <= 5 ? ' low' : ''}`}>
            <div class="game-ammo-title">
              <span>{hud.vehicle?`${hud.vehicle.weapon||"驾驶位"}${hud.vehicle.shell?` / ${hud.vehicle.shell}`:""}`:`${hud.weaponName} / ${hud.caliber}`}</span>
              {hud.fireMode&&<div class="fire-mode-indicator" role="img" aria-label={FIRE_MODES[hud.fireMode].label}>
                {[1,2,3].map(level=><svg class={level<=FIRE_MODES[hud.fireMode!].level?'lit':undefined} viewBox="0 0 8 16" aria-hidden="true">
                  <path d="M1.5 15V5L4 1l2.5 4v10z" fill="currentColor"/>
                </svg>)}
              </div>}
            </div>
            <b>{hud.vehicle?hud.vehicle.weapon?String(hud.vehicle.ammo):'–':hud.reloading?'RELOAD':String(hud.ammo).padStart(2,'0')}</b>
            <small>{hud.vehicle?(hud.vehicle.reload>0?`装填 ${hud.vehicle.reload.toFixed(1)}s`:hud.vehicle.weapon?'就绪':''):hud.reloading?'换弹中':`/ ${hud.reserve}`}</small>
          </div>
          {hud.fireModeNotice&&<div class="fire-mode-toast" role="status">{FIRE_MODES[hud.fireModeNotice].label}</div>}
        </>
      )}

      {hud.phase === 'prep' && !hud.overlayOpen && (
        <div class="game-prep-bar">
          <span class="prep-chip">UNARMED</span>
          <span class="prep-clock">整备 <b>{clock(hud.prepSeconds)}</b></span>
          <span class="prep-hint"><kbd>TAB</kbd> 装备 · <kbd>WASD</kbd> 自由移动 · 点击画面锁定鼠标</span>
        </div>
      )}


      {hud.phase === 'live' && !hud.pointerLocked && !hud.paused && !hud.dead && !hud.overlayOpen && (
        <div class="game-lock-hint">点击画面开始操作</div>
      )}

      {hud.killFeed.length>0&&<div class="kill-feed">{hud.killFeed.map(k=><div>{k.text}</div>)}</div>}
      {hud.events.length > 0 && (
        <div class="game-events">
          {hud.events.map((e) => (
            <div class={`game-event ${e.kind}`} key={e.id}>
              <span class="ge-icon">{e.kind === 'kill' ? '✦' : e.kind === 'assist' ? '◇' : e.kind === 'capture' ? '⚑' : e.kind === 'vehicle' ? '▣' : '†'}</span>
              <span class="ge-text">{e.text}</span>
              <b class={e.points >= 0 ? 'plus' : 'minus'}>{e.points >= 0 ? '+' : ''}{e.points}</b>
            </div>
          ))}
        </div>
      )}

      {hud.mapOpen&&<div class="tactical-map" aria-label="战术地图"><strong>战术地图 · M / ESC 关闭 · 死亡时点击部署点可选择复活点</strong><RespawnMap hud={hud} fullscreen onPick={hud.dead?onRespawnPoint:undefined}/></div>}

      {hud.dead && !hud.overlayOpen && !hud.winner && (
        <div class="game-respawn">
          <div class="respawn-head">
            <div><small>K.I.A. / DEPLOYMENT</small><b>{hud.respawnSeconds > 0 ? hud.respawnSeconds : 'READY'}</b></div>
            <span>至少 5 秒等待后手动点击“部署” · 右侧/地图可选择部署点 · 圆形为据点占领进度</span>
          </div>
          <div class="respawn-body">
            <RespawnMap hud={hud} onPick={onRespawnPoint} />
            <aside class="respawn-side">
              <div class="respawn-side-head">部署点</div>
              <div class="respawn-points">
                {hud.respawnOptions.map((p) => (
                  <button class={hud.respawnChoice === p.id ? 'on' : ''} onClick={() => onRespawnPoint?.(p.id)}>
                    <b>{p.id === 'base' ? '⌂' : p.id}</b><span>{p.label}</span>
                  </button>
                ))}
              </div>
              <div class="respawn-actions">
                <button class="respawn-gear" onClick={() => onOpenLoadout?.()}><kbd>Tab</kbd> 更换装备</button>
                <button onClick={onSettings}>设置</button>
                <button class="respawn-go" disabled={hud.respawnSeconds > 0} onClick={() => onRespawnNow?.()}>部署</button>
              </div>
              <em>进入装备页不会自动复活；关闭后回到部署界面，倒计时结束点击“部署”才复活。点位失效自动回退最近可用点。</em>
            </aside>
          </div>
        </div>
      )}

      {hud.dead && hud.overlayOpen && !hud.winner && (
        <div class="game-respawn-wait">等待装备选择 / 关闭装备页后返回部署</div>
      )}

      {hud.winner && (
        <div class="game-winner">
          <small>MATCH OVER</small>
          <b>{hud.winner==='draw'?'平局':hud.winner==='blue'?'蓝队胜利':'橙队胜利'}</b>
          <span>BLUE {Math.floor(hud.blueScore)} / ORANGE {Math.floor(hud.orangeScore)}</span>
          <button onClick={onSettings}>设置</button>
          <button class="game-return" onClick={() => onExit?.()}>返回大厅</button>
        </div>
      )}

      {hud.banner && (
        <div class="game-banner">
          <small>DEPLOYMENT COMPLETE</small>
          <b>战斗开始</b>
          <span>已传送回出生点 · {hud.weaponName} 已装备</span>
        </div>
      )}
    </div>
  );
}
