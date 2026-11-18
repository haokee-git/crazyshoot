import { VERSION } from '../version';
const MAPS = [
  { code: '01', name: '船坞', en: 'DRYDOCK', status:'PLAYTEST' },
  { code: '02', name: '断桥', en: 'BROKEN SPAN', status:'PLAYTEST' },
  { code: '03', name: '花园', en: 'GARDEN', status:'PLAYTEST' },
  { code: '04', name: '机场', en: 'AIRFIELD', status:'PLAYTEST' },
  { code: '05', name: '法老坟墓', en: "PHARAOH'S TOMB", status:'PLAYTEST' },
  { code: '06', name: '千户苗寨', en: 'QIANHU MIAO VILLAGE', status:'NEW' },
];

export function App() {
  return (
    <main class="boot">
      <div class="boot-grid" aria-hidden="true" />
      <header class="brand">
        <div class="brand-mark">
          <span class="brand-cross" />
        </div>
        <div>
          <div class="brand-name">CRAZYSHOOT</div>
          <div class="brand-sub">BATTLEFIELD SYSTEM // LAN DIRECT</div>
        </div>
        <div class="brand-build">M1 <span>BUILD {VERSION}</span></div>
      </header>

      <section class="boot-hero">
        <div class="kicker"><span /> MAP SURVEY / 300–800 M</div>
        <h1>步兵与装甲<br /><em>协同推进。</em></h1>
        <p>
          六张 300–800 米战术地图，支持步兵、独立炮塔驾驶与弹道交战。
          单人 AI 作战或与好友联机；千户苗寨 500 米河谷图已加入轮换。
        </p>
        <a class="boot-enter" href="/game.html">
          <span>开始游戏</span>
          <small>CONQUEST // PRE-ALPHA</small>
          <b>→</b>
        </a>

        <div class="progress">
          <div class="progress-head">
            <span>TACTICAL MAPS</span>
            <span class="progress-pct">06 / 06</span>
          </div>
          <div class="progress-track"><i /></div>
          <div class="progress-foot">
            <span>GRID 10M</span><span>CAPTURE 03–07</span><span>AI FILL 8V8</span>
          </div>
        </div>
      </section>

      <section class="map-list" aria-label="Map list">
        {MAPS.map((m) => (
          <article class="map-row" key={m.code}>
            <span class="map-code">{m.code}</span>
            <div class="map-title">
              <strong>{m.name}</strong>
              <small>{m.en}</small>
            </div>
            <span class="map-status">{m.status}</span>
            <span class="map-line" />
          </article>
        ))}
      </section>

      <footer class="boot-foot">
        <span>CRAZYSHOOT.HAOKEE.ORG</span>
        <span>PIXEL WORLD / LOW-POLY ARSENAL</span>
        <span>蓝队 · 橙队</span>
      </footer>
    </main>
  );
}
