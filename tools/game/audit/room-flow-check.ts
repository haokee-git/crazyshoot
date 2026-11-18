/**
 * 临时验证：房间创建/加入/拖队/开始/赛后回房/换图再开 + 信令满员拒绝。
 * 运行：npx tsx tools/game/audit/_tmp-room-check.ts
 */
import { chromium } from 'playwright';
import WebSocket from 'ws';
import fs from 'node:fs';
import { browserExecutable } from './browser';

const BASE = process.env.GAME_BASE_URL || 'http://127.0.0.1:5174';
const SHOTS = 'docs/audit-2026-11-10/room-flow';
fs.mkdirSync(SHOTS, { recursive: true });
const errors: string[] = [];
const steps: string[] = [];
const step = (text: string) => { steps.push(text); console.log('[room-check]', text); };

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

async function wsRpc(ws: WebSocket, message: Record<string, unknown>, expectType: string): Promise<any> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ws timeout ${expectType}`)), 8000);
    const onMessage = (raw: any) => {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.type === 'hello') return;
      if (msg.type === expectType || msg.type === 'error') {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msg);
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify(message));
  });
}

async function signalCapacityCheck() {
  const connect = () => new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:18789/signal');
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
  const host = await connect();
  const created = await wsRpc(host, { type: 'create', name: 'CAP-HOST', version: 'test', maxPeers: 4 }, 'created');
  assert(created.code, 'room created');
  for (let index = 0; index < 3; index++) {
    const guest = await connect();
    const joined = await wsRpc(guest, { type: 'join', code: created.code, name: `CAP-${index}`, version: 'test' }, 'joined');
    assert(joined.code === created.code, 'guest joined');
  }
  const overflow = await connect();
  const rejected = await wsRpc(overflow, { type: 'join', code: created.code, name: 'CAP-OVER', version: 'test' }, 'joined');
  assert(rejected.type === 'error' && String(rejected.code) === 'room_full' && String(rejected.message).includes('房间已满'), `full room rejected: ${JSON.stringify(rejected)}`);
  step(`capacity: maxPeers=4 时第 5 人收到 ${rejected.code} / ${rejected.message}`);
  host.close(); overflow.close();
}

const browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
try {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  for (const page of [host, guest]) page.on('pageerror', (event) => errors.push(String(event)));

  // 正常入口：只有房间码 + 创建/加入，不出现 .lobby-solo。
  await host.goto(`${BASE}/game.html`);
  await host.waitForSelector('.lobby-primary');
  assert(await host.locator('.lobby-solo').count() === 0, 'normal entry must not show .lobby-solo');
  await host.screenshot({ path: `${SHOTS}/01-entry.png` });
  step('正常入口无单人/audit 入口，仅创建/加入');

  // audit=1 兼容深链仍可挂载 .lobby-solo（官方审计脚本用）。
  const audit = await hostContext.newPage();
  await audit.goto(`${BASE}/game.html?audit=1&map=docks&bots=0&prep=999`);
  await audit.waitForSelector('.lobby-solo');
  step('audit=1 深链挂载 .lobby-solo（兼容旧审计）');
  await audit.close();

  // 创建房间。
  await host.locator('.lobby-primary').click();
  await host.waitForSelector('.lobby-code');
  const code = (await host.locator('.lobby-code').innerText()).trim();
  assert(/^\d{4}$/.test(code), `room code ${code}`);
  await host.waitForFunction(() => document.querySelectorAll('.player-chip').length >= 1);
  await host.screenshot({ path: `${SHOTS}/02-room-host-empty.png` });
  step(`创建房间 ${code}，房主进入房间设置`);

  // 客机加入。
  await guest.goto(`${BASE}/game.html`);
  await guest.locator('.lobby-input.code').fill(code);
  await guest.locator('.lobby-secondary').click();
  await guest.waitForSelector('.lobby-code');
  assert((await guest.locator('.lobby-code').innerText()).trim() === code, 'guest sees same code');
  await host.waitForFunction(() => document.querySelectorAll('.player-chip').length >= 2);
  await guest.waitForFunction(() => document.querySelectorAll('.player-chip').length >= 2);
  await host.screenshot({ path: `${SHOTS}/03-room-two-players.png` });
  await guest.screenshot({ path: `${SHOTS}/04-guest-room.png` });
  step('客机加入，双方实时看到 2 人房间');

  // 房主拖动客机换队（先确认能跨队，再拖回橙队保持开赛断言）。
  const guestWasBlue = (await host.locator('.team-col.blue .player-chip:not(:has(em))').count()) >= 1;
  const fromTeam = guestWasBlue ? 'blue' : 'orange';
  const toTeam = guestWasBlue ? 'orange' : 'blue';
  await host.locator(`.team-col.${fromTeam} .player-chip:not(:has(em))`).first().dragTo(host.locator(`.team-col.${toTeam}`));
  await host.waitForFunction((team) => document.querySelectorAll(`.team-col.${team} .player-chip`).length >= 1, toTeam);
  await guest.waitForFunction((team) => document.querySelectorAll(`.team-col.${team} .player-chip`).length >= 1, toTeam);
  await host.screenshot({ path: `${SHOTS}/05-room-host-dragged.png` });
  await guest.screenshot({ path: `${SHOTS}/06-guest-dragged.png` });
  if (toTeam !== 'orange') {
    await host.locator('.team-col.blue .player-chip:not(:has(em))').first().dragTo(host.locator('.team-col.orange'));
    await guest.waitForFunction(() => document.querySelectorAll('.team-col.orange .player-chip').length >= 1);
  }
  step(`房主拖客机 ${fromTeam}→${toTeam} 成功，客机实时同步；最终客机在橙队`);

  // 开赛：默认每侧 8、AI 补位开；host 蓝 / guest 橙。
  await host.locator('.lobby-primary.start').click();
  await host.waitForFunction(() => (window as any).__game?.activated === true, null, { timeout: 180000 });
  await guest.waitForFunction(() => (window as any).__game?.activated === true, null, { timeout: 180000 });
  const first = await host.evaluate(() => {
    const game = (window as any).__game;
    return {
      team: game.myTeam, teamSize: game.teamSize, bots: game.botsEnabled, hosted: game.hosted.size,
      blue: [...game.hosted.values()].filter((h: any) => h.team === 'blue').length,
      orange: [...game.hosted.values()].filter((h: any) => h.team === 'orange').length,
      duration: game.matchDurationSeconds, matchRemaining: Math.round(game.matchRemaining),
    };
  });
  const guestTeam = await guest.evaluate(() => (window as any).__game.myTeam);
  assert(first.team === 'blue', `host team ${first.team}`);
  assert(guestTeam === 'orange', `guest team ${guestTeam}`);
  assert(first.teamSize === 8 && first.bots === true, `8/side ai fill: ${JSON.stringify(first)}`);
  assert(first.blue === 7 && first.orange === 8, `bots filled: ${JSON.stringify(first)}`);
  assert(first.duration === 600, `garden default duration 600: ${first.duration}`);
  await host.screenshot({ path: `${SHOTS}/07-game-host.png` });
  await guest.screenshot({ path: `${SHOTS}/08-game-guest.png` });
  step(`开赛：host 蓝 / guest 橙，每侧 8 + AI 补位（${first.blue}蓝 / ${first.orange}橙 hosted），时长 ${first.duration}s`);

  // 赛后：host 推 winner，双方出现赛后层；host 返回房间，客机跟房主广播回房。
  await host.evaluate(() => { (window as any).__game.winner = 'blue'; });
  await host.waitForSelector('.post-match', { timeout: 10000 });
  await guest.waitForSelector('.post-match', { timeout: 10000 });
  await host.screenshot({ path: `${SHOTS}/09-post-match-host.png` });
  await host.locator('.post-match-room').click();
  await host.waitForSelector('.room-main', { timeout: 10000 });
  await guest.waitForSelector('.room-main', { timeout: 15000 });
  await host.waitForFunction(() => document.querySelectorAll('.player-chip').length >= 2);
  await guest.waitForFunction(() => document.querySelectorAll('.player-chip').length >= 2);
  assert(await guest.locator('.team-col.orange .player-chip').count() >= 1, 'guest keeps orange team after return');
  await host.screenshot({ path: `${SHOTS}/10-room-after-match.png` });
  step('赛后返回房间：engine 销毁、房间名单/阵营保留，客机跟随回房');

  // 换图 + 改人数再开（花园），验证房主再次开始与设置保留。
  await host.locator('.room-mapgrid button').filter({ hasText: '花园' }).click();
  await host.locator('.room-players button').last().click();
  await host.locator('.room-players button').last().click();
  await host.waitForFunction(() => document.querySelector('.room-players b')?.textContent?.trim() === '10');
  await guest.waitForFunction(() => document.querySelector('.room-players b')?.textContent?.trim() === '10');
  await host.locator('.lobby-primary.start').click();
  await host.waitForFunction(() => (window as any).__game?.activated === true, null, { timeout: 180000 });
  await guest.waitForFunction(() => (window as any).__game?.activated === true, null, { timeout: 180000 });
  const second = await host.evaluate(() => {
    const game = (window as any).__game;
    return {
      map: game.arena.name, teamSize: game.teamSize, duration: game.matchDurationSeconds,
      blue: [...game.hosted.values()].filter((h: any) => h.team === 'blue').length,
      orange: [...game.hosted.values()].filter((h: any) => h.team === 'orange').length,
      team: game.myTeam,
    };
  });
  assert(second.map.includes('花园'), `rematch map ${second.map}`);
  assert(second.teamSize === 10 && second.duration === 600, `rematch settings ${JSON.stringify(second)}`);
  assert(second.blue === 9 && second.orange === 10, `rematch bots ${JSON.stringify(second)}`);
  await host.screenshot({ path: `${SHOTS}/11-rematch-host.png` });
  step(`换图/人数再开：${second.map}，每侧 10，蓝 ${second.blue} / 橙 ${second.orange}`);

  // 赛后 5s 自动回房（不点按钮），然后客机退出、房主解散。
  await host.evaluate(() => { (window as any).__game.winner = 'orange'; });
  await host.waitForSelector('.post-match', { timeout: 10000 });
  await guest.waitForSelector('.post-match', { timeout: 10000 });
  await host.waitForSelector('.room-main', { timeout: 12000 });
  await guest.waitForSelector('.room-main', { timeout: 15000 });
  await host.screenshot({ path: `${SHOTS}/12-room-after-auto-return.png` });
  step('赛后 5s 自动返回房间（host/guest 均回房）');

  await guest.locator('.lobby-leave').click();
  await guest.waitForSelector('.lobby-primary', { timeout: 10000 });
  await host.waitForFunction(() => document.querySelectorAll('.player-chip').length === 1, null, { timeout: 10000 });
  await host.locator('.lobby-leave.danger').click();
  await host.waitForSelector('.lobby-primary', { timeout: 10000 });
  await host.screenshot({ path: `${SHOTS}/13-back-to-lobby.png` });
  step('客机退出房间→房主名单减少；房主解散房间→双方回大厅清状态');

  await signalCapacityCheck();
  fs.writeFileSync(`${SHOTS}/check.json`, JSON.stringify({ steps, errors, first, second, guestTeam }, null, 2));
  console.log('[room-check] OK', JSON.stringify({ steps: steps.length, errors }));
} finally {
  await browser.close();
}
if (errors.length) { console.error('page errors', errors); process.exitCode = 1; }
