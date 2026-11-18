// 生成"特殊武器点位一览"拼图：4 张规划图的地图区域 + 叠加点位标签，2×2 输出 PNG。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const MAP_X = 80, MAP_Y = 150, MAP_SIZE = 1560, SVG_W = 2400;
const CARD = 820;                       // 每格显示尺寸
const scale = CARD / MAP_SIZE;          // 1560 → 820
const imgW = SVG_W * scale;
const left = -MAP_X * scale;
const top = -MAP_Y * scale;
const px = (x) => (MAP_X + (x / 300) * MAP_SIZE) * scale;
const py = (y) => (MAP_Y + (y / 300) * MAP_SIZE) * scale;

const crates = [
  { map: 'docks', points: [
    { w: 'amr', x: 224, y: 156, name: 'AMR', tone: '#ffcf5c' },
    { w: 'amr', x: 116, y: 190, name: 'AMR', tone: '#ffcf5c' },
    { w: 'rpg', x: 198, y: 136, name: '火箭筒', tone: '#8ee06a' },
    { w: 'rpg', x: 150, y: 214, name: '火箭筒', tone: '#8ee06a' },
    { w: 'flm', x: 66, y: 232, name: '喷火器', tone: '#ff9d5c' },
  ] },
  { map: 'broken_bridge', points: [
    { w: 'amr', x: 196, y: 112, name: 'AMR', tone: '#ffcf5c' },
    { w: 'amr', x: 172, y: 190, name: 'AMR', tone: '#ffcf5c' },
    { w: 'rpg', x: 92, y: 118, name: '火箭筒', tone: '#8ee06a' },
    { w: 'rpg', x: 236, y: 170, name: '火箭筒', tone: '#8ee06a' },
  ] },
  { map: 'garden', points: [
    { w: 'amr', x: 248, y: 190, name: 'AMR', tone: '#ffcf5c' },
    { w: 'amr', x: 66, y: 172, name: 'AMR', tone: '#ffcf5c' },
    { w: 'rpg', x: 138, y: 208, name: '火箭筒', tone: '#8ee06a' },
    { w: 'rpg', x: 82, y: 232, name: '火箭筒', tone: '#8ee06a' },
    { w: 'flm', x: 172, y: 136, name: '喷火器', tone: '#ff9d5c' },
  ] },
  { map: 'airfield', points: [
    { w: 'amr', x: 78, y: 112, name: 'AMR', tone: '#ffcf5c' },
    { w: 'amr', x: 254, y: 148, name: 'AMR', tone: '#ffcf5c' },
    { w: 'rpg', x: 56, y: 148, name: '火箭筒', tone: '#8ee06a' },
    { w: 'rpg', x: 238, y: 184, name: '火箭筒', tone: '#8ee06a' },
  ] },
];

const maps = [
  { id: 'docks', file: '01-docks.svg', name: '船坞 DRYDOCK', sub: '5 个点位 · AMR×2 / 火箭筒×2 / 喷火器×1' },
  { id: 'broken_bridge', file: '02-broken_bridge.svg', name: '断桥 BROKEN SPAN', sub: '4 个点位 · AMR×2 / 火箭筒×2' },
  { id: 'garden', file: '03-garden.svg', name: '花园 GARDEN', sub: '5 个点位 · AMR×2 / 火箭筒×2 / 喷火器×1' },
  { id: 'airfield', file: '04-airfield.svg', name: '机场 AIRFIELD', sub: '4 个点位 · AMR×2 / 火箭筒×2' },
];

const pin = (p) => {
  const label = `${p.name} ${p.x},${p.y}`;
  return `<div class="pin live" style="left:${px(p.x)}px;top:${py(p.y)}px;--tone:${p.tone}">
    <i></i><b>${label}</b>
  </div>`;
};

const card = (m) => {
  const src = 'data:image/svg+xml;base64,' + fs.readFileSync(path.resolve('previews/maps', m.file)).toString('base64');
  const pts = crates.find((c) => c.map === m.id).points;
  return `<div class="cell">
    <div class="head"><b>${m.name}</b><span>${m.sub}</span></div>
    <div class="frame" style="width:${CARD}px;height:${CARD}px">
      <img src="${src}" style="width:${imgW}px;left:${left}px;top:${top}px">
      ${pts.map(pin).join('')}
      <div class="axes">↑ 北 · 300 × 300 m</div>
    </div>
  </div>`;
};

const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#0b1012;font-family:"PingFang SC","Helvetica Neue",sans-serif;color:#e7f1ee}
  .wrap{padding:26px 26px 20px}
  h1{margin:0 0 6px;font-size:27px;letter-spacing:1px}
  .note{color:#93a8a4;font-size:13.5px;margin-bottom:6px}
  .legend{display:flex;gap:20px;align-items:center;font-size:12.5px;color:#b9cac6;margin:0 0 16px}
  .legend i{display:inline-block;width:11px;height:11px;margin-right:6px;transform:rotate(45deg);vertical-align:-1px}
  .legend .live i{background:#ffcf5c;box-shadow:0 0 8px #ffcf5c}
  .legend .dead i{background:#ff6f61;opacity:.75}
  .grid{display:grid;grid-template-columns:repeat(2,${CARD}px);gap:18px 22px}
  .cell{background:#121a1d;border:1px solid #22302f;border-radius:6px;overflow:hidden}
  .head{display:flex;align-items:baseline;gap:10px;padding:10px 12px 8px;border-bottom:1px solid #22302f}
  .head b{font-size:15.5px;color:#ffcf7a;letter-spacing:.5px}
  .head span{font-size:12px;color:#7f9490}
  .frame{position:relative;overflow:hidden;background:#0e1517}
  .frame img{position:absolute;display:block;max-width:none}
  .axes{position:absolute;right:10px;bottom:8px;font-size:11.5px;color:#c8d8d3;background:rgba(8,14,16,.72);padding:3px 8px;border-radius:3px;letter-spacing:.5px}
  .pin{position:absolute;transform:translate(-50%,-50%);z-index:2}
  .pin i{display:block;width:17px;height:17px;background:var(--tone);transform:rotate(45deg);border:2px solid #0b1012;box-shadow:0 0 0 2px var(--tone),0 0 14px var(--tone);margin:0 auto}
  .pin.dead i{opacity:.8;box-shadow:0 0 0 2px rgba(255,111,97,.55)}
  .pin b{position:absolute;left:50%;top:16px;transform:translateX(-50%);white-space:nowrap;font-size:12.5px;font-weight:600;color:#111a1c;background:var(--tone);padding:2px 7px;border-radius:3px;letter-spacing:.2px}
  .pin span{position:absolute;left:50%;top:38px;transform:translateX(-50%);white-space:nowrap;font-size:10.5px;color:#ffb1a8;background:rgba(10,16,18,.82);padding:1px 5px;border-radius:2px}
</style>
<div class="wrap">
  <h1>CRAZYSHOOT · 地图特殊武器点位</h1>
  <div class="note">菱形 = 局内特殊武器箱 · 标签为 坐标 x,y（米，原点西南角，上北下南、左西右东）· 反坦克地雷点位已全部移除</div>
  <div class="legend"><span class="live"><i style="background:#ffcf5c"></i>AMR</span><span class="live"><i style="background:#8ee06a"></i>火箭筒</span><span class="live"><i style="background:#ff9d5c"></i>喷火器</span><span style="color:#8fa4a0">全部局内可拾取 · 每局重置 · 先到先得</span></div>
  <div class="grid">${maps.map(card).join('')}</div>
</div>`;

const localShell = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch(fs.existsSync(localShell) ? { executablePath: localShell } : {});
const page = await browser.newPage({ viewport: { width: CARD * 2 + 26 * 2 + 22, height: 900 }, deviceScaleFactor: 1.6 });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(500);
const outDir = path.resolve('previews');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'loot-points.png');
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('[loot] →', path.relative(process.cwd(), out));
