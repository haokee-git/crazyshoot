import { useMemo } from 'preact/hooks';
import {
  DEFAULT_LOADOUT,
  OPTICS,
  THROWABLES,
  WEAPONS,
  getWeapon,
  type LoadoutSelection,
  type OpticId,
  type ThrowableId,
  type WeaponCatalogEntry,
} from '../../content/weapons/catalog';
import { WeaponSilhouette } from './WeaponSilhouette';

export interface PrematchOverlayProps {
  open: boolean;
  seconds: number;
  mode?: 'prep' | 'respawn';
  selection: LoadoutSelection;
  onChange: (next: LoadoutSelection) => void;
  onClose: () => void;
  onSettings?:()=>void;
  mapName?: string;
  mapNameEn?: string;
  team?: 'blue' | 'orange';
}

const STAT_LABELS: Array<[keyof WeaponCatalogEntry['stats'], string]> = [
  ['damage', '伤害'],
  ['rate', '射速'],
  ['accuracy', '精度'],
  ['control', '控制'],
  ['mobility', '机动'],
];

export function PrematchOverlay({ open, seconds, mode = 'prep', selection, onChange, onClose, onSettings, mapName = '训练场', mapNameEn = 'BLOCKOUT', team = 'blue' }: PrematchOverlayProps) {
  const respawn = mode === 'respawn';
  const weapon = useMemo(() => getWeapon(selection.weaponId) ?? WEAPONS[0], [selection.weaponId]);
  const optic = OPTICS.find((o) => o.id === selection.opticId) ?? OPTICS[0];
  const throwLabels = selection.throwables
    .map((id) => THROWABLES.find((t) => t.id === id)?.name ?? id)
    .join(' + ');

  if (!open) return null;

  const pickOptic = (opticId: OpticId) => onChange({ ...selection, opticId });
  const pickWeapon = (weaponId: LoadoutSelection['weaponId']) => onChange({ ...selection, weaponId });

  const toggleThrowable = (id: ThrowableId) => {
    if (selection.throwables.includes(id)) return;
    const next: [ThrowableId, ThrowableId] = [selection.throwables[1], id];
    onChange({ ...selection, throwables: next });
  };

  return (
    <div class="prep-overlay" role="dialog" aria-label={respawn ? '阵亡换装' : '赛前整备'}>
      <div class="prep-scanline" aria-hidden="true" />
      <header class="prep-header">
        <div class="prep-brand">
          <div class="prep-kicker">{respawn ? 'CRAZYSHOOT // RESPAWN LOADOUT' : 'CRAZYSHOOT // PRE-MATCH'}</div>
          <div class="prep-map">{mapName} <span>{mapNameEn}</span></div>
        </div>
        <div class={`prep-team ${team}`}>
          <span class="team-dot" /> {team === 'blue' ? '蓝队' : '橙队'} <small>{team === 'blue' ? 'BLUE TEAM' : 'ORANGE TEAM'}</small>
        </div>
        <div class="prep-clock">
          <div class="clock-value">00:{String(seconds).padStart(2, '0')}</div>
          <div class="clock-label">{respawn ? '关闭装备页后返回部署' : '整备结束倒计时'}</div>
        </div>
        {onSettings&&<button class="prep-settings" onClick={onSettings}>设置</button>}
        <button class="prep-close" onClick={onClose} aria-label={respawn ? '确认装备并返回部署' : '关闭整备'}>
          <span>×</span><small>ESC</small>
        </button>
      </header>

      <main class="prep-main">
        <section class="prep-panel weapon-panel">
          <div class="panel-head">
            <div>
              <div class="panel-kicker">PRIMARY WEAPON</div>
              <h2>主武器</h2>
            </div>
            <div class="panel-note">11 / 11 解锁</div>
          </div>
          <div class="weapon-grid">
            {WEAPONS.map((w) => (
              <button
                class={`weapon-card${w.id === selection.weaponId ? ' selected' : ''}`}
                key={w.id}
                onClick={() => pickWeapon(w.id)}
              >
                <div class="weapon-card-art"><WeaponSilhouette weaponId={w.id} /></div>
                <div class="weapon-card-body">
                  <div class="weapon-card-top">
                    <strong>{w.name}</strong>
                    <span>{w.classLabel}</span>
                  </div>
                  <small>{w.role}</small>
                  <div class="mini-bars">
                    <i style={{ width: `${w.stats.damage}%` }} />
                    <i style={{ width: `${w.stats.rate}%` }} />
                    <i style={{ width: `${w.stats.control}%` }} />
                  </div>
                </div>
                <div class="weapon-card-mark">{w.id === selection.weaponId ? 'SELECTED' : ''}</div>
              </button>
            ))}
          </div>
          <div class="panel-foot">
            <span>点击武器卡片切换</span>
            <span>配件槽：枪口 / 弹匣 / 握把 / 枪托 <b>暂未开放</b></span>
          </div>
        </section>

        <section class="prep-panel preview-panel">
          <div class="panel-head">
            <div>
              <div class="panel-kicker">LOADOUT PREVIEW</div>
              <h2>{weapon.name}</h2>
            </div>
            <div class="panel-note">{weapon.classLabel} // {weapon.role}</div>
          </div>
          <div class="weapon-large-art">
            <WeaponSilhouette weaponId={weapon.id} large />
            <div class="weapon-large-label">武器轮廓预览 // REAL SIDE PROFILE</div>
          </div>
          <div class="weapon-specs">
            <div class="spec-row">
              <span>口径/类型</span><b>{weapon.classLabel}</b>
            </div>
            <div class="spec-row">
              <span>伤害 / 射速</span><b>{weapon.damage} / {weapon.rpm} RPM</b>
            </div>
            <div class="spec-row">
              <span>弹匣 / 备弹</span><b>{weapon.magazine} / {weapon.reserve}</b>
            </div>
            <div class="spec-row">
              <span>换弹</span><b>{weapon.reload.toFixed(1)} s</b>
            </div>
          </div>
          <div class="stat-block">
            {STAT_LABELS.map(([key, label]) => (
              <div class="stat-line" key={key}>
                <span>{label}</span>
                <div><i style={{ width: `${weapon.stats[key]}%` }} /></div>
                <b>{weapon.stats[key]}</b>
              </div>
            ))}
          </div>
          <div class="loadout-summary">
            <div><span>瞄具</span><b>{optic.name}</b></div>
            <div><span>投掷物</span><b>{throwLabels}</b></div>
            <div><span>特殊武器</span><b class="dim">地图拾取暂未开放</b></div>
          </div>
          <div class="panel-foot">
            <span>整备阶段不持武器，不能开火</span>
            <span>20s 后传送回出生点并装备</span>
          </div>
        </section>

        <section class="prep-panel side-panel">
          <div class="panel-head">
            <div>
              <div class="panel-kicker">OPTIC / THROWABLES</div>
              <h2>配件</h2>
            </div>
          </div>
          <div class="section-title">瞄具 <small>OPTIC</small></div>
          <div class="optic-grid">
            {OPTICS.map((o) => (
              <button
                class={`optic-chip${o.id === selection.opticId ? ' selected' : ''}`}
                key={o.id}
                onClick={() => pickOptic(o.id)}
              >
                <b>{o.name}</b>
                <span>{o.short} / {o.tag}</span>
              </button>
            ))}
          </div>
          <div class="section-title throw-title">投掷物 <small>选 2 种</small></div>
          <div class="throwable-list">
            {THROWABLES.map((t) => {
              const picked = selection.throwables.includes(t.id);
              return (
                <button
                  class={`throwable-card${picked ? ' selected' : ''}`}
                  key={t.id}
                  disabled={t.id==='incendiary'}
                  onClick={() => toggleThrowable(t.id)}
                >
                  <span class="throw-icon">{t.id==='incendiary'?'—':selection.throwables.indexOf(t.id)===0?'G':'H'}</span>
                  <span><b>{t.name}</b><small>{t.id==='incendiary'?'尚未开放':t.role}</small></span>
                  <i>{picked ? 'EQUIPPED' : ''}</i>
                </button>
              );
            })}
          </div>
          <div class="loadout-lock">
            <div class="lock-icon">▣</div>
            <div>
              <b>配件槽位预留</b>
              <span>枪口 / 弹匣 / 握把 / 枪托后续开放</span>
            </div>
          </div>
          <div class="side-quote">
            “整备阶段全图自由移动；正式开始会统一拉回出生点。”
          </div>
        </section>
      </main>

      <footer class="prep-footer">
        <div class="footer-hint">
          <span>{respawn ? <><b>X</b> 或 <b>ESC</b> 关闭装备页，返回部署界面</> : <><b>X</b> 或 <b>ESC</b> 关闭整备，进入场景</>}</span>
          <span>{respawn ? '关闭后选择部署点，倒计时结束点击“部署”' : <><b>TAB</b> 重新打开装备页</>}</span>
          <span class="footer-warn">{respawn ? '部署等待期间装备页不会自动关闭' : '关闭后不持武器，不能开火/ADS/投掷/上车'}</span>
        </div>
        <button class="prep-confirm" onClick={onClose}>
          <span>{respawn ? '确认装备' : '关闭整备'}</span>
          <small>{respawn ? '关闭后返回部署界面' : '进入场景自由移动'}</small>
        </button>
      </footer>
    </div>
  );
}

export const PREMATCH_DEFAULT = DEFAULT_LOADOUT;
