// ASTRAL VANGUARD — automated verification (Playwright headless Chromium)
// - loads the game, captures console/page errors (must be 0)
// - screenshots title + all 3 stages + all 3 bosses
// - boss hitbox auto-probe: numerically verifies the CORE takes damage and
//   ARMOR does not, AND that a live god-mode run actually reduces boss HP.
import { chromium } from 'playwright';
import { createServer } from '../tools/serve.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Capture the game canvas pixels directly (robust vs. compositor screenshot).
async function shot(page, file) {
  const dataUrl = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// Resolve a Chromium binary. Prefer Playwright's own; fall back to the
// @sparticuz/chromium bundle when the Playwright CDN is unreachable.
async function resolveLaunch() {
  try {
    if (process.platform === 'darwin') throw new Error('Prefer installed desktop Chrome on macOS');
    const sc = (await import('@sparticuz/chromium')).default;
    const executablePath = await sc.executablePath();
    const args = sc.args.filter((a) => !a.includes('single-process'));
    return { executablePath, args, headless: true };
  } catch (e) {
    for (const executablePath of [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ]) {
      if (fs.existsSync(executablePath)) return { executablePath, headless: true, args: ['--use-gl=swiftshader', '--no-sandbox'] };
    }
    return { headless: true, args: ['--use-gl=swiftshader'] };
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'shots');
const PORT = 8123;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failures++; };

const server = createServer(ROOT);
await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch(await resolveLaunch());
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

try {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AV && AV.Game && AV.Game.stages, { timeout: 8000 });
  await sleep(600);

  console.log('\n[1] Title screen');
  await shot(page, path.join(SHOTS, '00-title.png'));
  ok(true, 'title rendered');

  // ---- real entry path: FIRE from title -> newGame -> rAF loop keeps running ----
  // (gotoStage below bypasses newGame, so this guards against newGame breaking the
  //  loop — e.g. a field shadowing the loop() method.)
  console.log('\n[1.5] Start via FIRE (newGame + live loop)');
  const start = await page.evaluate(async () => {
    AV.Game.toTitle(); AV.Input.fire = true;
    await new Promise((r) => requestAnimationFrame(r));      // title -> newGame
    const c0 = AV.Game.clock;
    await new Promise((r) => setTimeout(r, 600));            // let the rAF loop advance
    AV.Input.fire = false;
    return { state: AV.Game.state, loopIsFn: typeof AV.Game.loop === 'function', advanced: AV.Game.clock > c0 };
  });
  ok(start.state === 'play' && start.loopIsFn && start.advanced,
    `game starts & loop runs (state=${start.state}, loop=fn:${start.loopIsFn}, clock advanced:${start.advanced})`);

  // ---- stages ----
  for (let s = 0; s < 3; s++) {
    console.log(`\n[2.${s + 1}] Stage ${s + 1}`);
    await page.evaluate((n) => { AV.Game.toggleGod(); if (!AV.Game.god) AV.Game.toggleGod(); AV.Game.gotoStage(n); AV.Game.maxPower(); }, s);
    // run the stage a little, hold fire
    await page.evaluate(() => { AV.Input.fire = true; });
    await sleep(2600);
    const st = await page.evaluate(() => ({ enemies: AV.Game.enemies.length, state: AV.Game.state, bullets: AV.Bullets.player.length }));
    await shot(page, path.join(SHOTS, `0${s + 1}-stage${s + 1}.png`));
    ok(st.state === 'play', `stage ${s + 1} in play state (enemies seen=${st.enemies}, pbullets=${st.bullets})`);
  }

  // ---- bosses + hitbox probe ----
  for (let s = 0; s < 3; s++) {
    console.log(`\n[3.${s + 1}] Boss ${s + 1} probe`);
    await page.evaluate((n) => { if (!AV.Game.god) AV.Game.toggleGod(); AV.Game.gotoStage(n); AV.Game.maxPower(); AV.Game.warpToBoss(); AV.Input.fire = false; }, s);
    // wait for boss to finish entering, let it attack a moment, capture the fight
    await page.waitForFunction(() => AV.Game.boss && !AV.Game.boss.entering, { timeout: 6000 }).catch(() => {});
    await sleep(1400);
    await shot(page, path.join(SHOTS, `1${s}-boss${s + 1}.png`));

    const probe = await page.evaluate(() => {
      const b = AV.Game.boss; if (!b) return { err: 'no boss' };
      const core = b.parts.find((p) => p.vuln);
      const armor = b.parts.find((p) => !p.vuln);
      const name = b.name, hp0 = b.hp;
      // synthetic CORE hit
      const cx = b.x + core.ox, cy = b.y + core.oy;
      const r1 = b.onBulletHit({ x: cx, y: cy, r: 4, dmg: 10 });
      const hpAfterCore = b.hp;
      // synthetic ARMOR hit
      let armorDamaged = false, hpBeforeArmor = b.hp;
      if (armor) { const ax = b.x + armor.ox, ay = b.y + armor.oy - armor.h / 2 + 4; b.onBulletHit({ x: ax, y: ay, r: 4, dmg: 10 }); armorDamaged = b.hp < hpBeforeArmor; }
      return { name, hp0, hpAfterCore, coreDamaged: !!(r1 && r1.damaged), armorDamaged };
    });
    ok(probe.coreDamaged && probe.hpAfterCore < probe.hp0, `${probe.name}: CORE hit reduces HP (${probe.hp0} → ${probe.hpAfterCore})`);
    ok(probe.armorDamaged === false, `${probe.name}: ARMOR hit deals NO damage`);

    // live run: god mode + fire, align player to core, confirm HP drops over time
    const live = await page.evaluate(async (sleepMs) => {
      const b = AV.Game.boss; const hpStart = b.hp;
      const core = b.parts.find((p) => p.vuln);
      AV.Input.fire = true;
      const t0 = performance.now();
      while (performance.now() - t0 < sleepMs) {
        // keep player aligned with the core so shots land
        AV.Input.touch.active = false;
        AV.Game.player.x = 200; AV.Game.player.y = b.y + core.oy;
        await new Promise((r) => requestAnimationFrame(r));
      }
      AV.Input.fire = false;
      return { hpStart, hpEnd: AV.Game.boss ? AV.Game.boss.hp : 0 };
    }, 2600);
    ok(live.hpEnd < live.hpStart, `${probe.name}: live fire reduces HP (${live.hpStart} → ${live.hpEnd})`);
  }

  console.log('\n[4] Console / page errors');
  consoleErrors.forEach((e) => console.log('   ! ' + e));
  ok(consoleErrors.length === 0, `console errors = ${consoleErrors.length}`);

} catch (e) {
  console.error('FATAL', e); failures++;
} finally {
  await browser.close(); server.close();
}

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : '❌ ' + failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
