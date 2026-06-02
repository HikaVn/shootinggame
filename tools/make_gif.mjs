// Capture a gameplay GIF from the live game (headless Chromium → gifenc).
import { chromium } from 'playwright';
import { createServer } from './serve.mjs';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shots', 'gameplay.gif');
const W = 480, H = 270, FRAMES = 64, EVERY = 4, DELAY = 60; // ~ capture cadence

async function launch() {
  try { const sc = (await import('@sparticuz/chromium')).default; return { executablePath: await sc.executablePath(), args: sc.args.filter((a) => !a.includes('single-process')), headless: true }; }
  catch { return { headless: true }; }
}

const server = createServer(ROOT); await new Promise((r) => server.listen(8131, r));
const browser = await chromium.launch(await launch());
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto('http://localhost:8131/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.AV && AV.Game.stages);

await page.evaluate(({ W, H }) => {
  if (!AV.Game.god) AV.Game.toggleGod();
  AV.Game.gotoStage(0); AV.Game.maxPower(); AV.Input.fire = true;
  const off = document.createElement('canvas'); off.width = W; off.height = H; window.__off = off; window.__octx = off.getContext('2d');
  window.__cap = () => { const c = document.getElementById('game'); window.__octx.drawImage(c, 0, 0, W, H); const d = window.__octx.getImageData(0, 0, W, H).data; let s = ''; for (let i = 0; i < d.length; i += 1024) s += String.fromCharCode.apply(null, d.subarray(i, i + 1024)); return btoa(s); };
  window.__t = 0;
}, { W, H });

console.log('Capturing frames...');
const frames = [];
for (let f = 0; f < FRAMES; f++) {
  // scripted motion + warp to boss midway for variety
  await page.evaluate(({ f, FRAMES }) => {
    AV.Game.banners.length = 0; // hide debug/stage banners for a clean demo
    const p = AV.Game.player; if (p) { p.y = 270 + Math.sin(f * 0.35) * 150; p.x = 150 + Math.sin(f * 0.12) * 40; }
    if (f === Math.floor(FRAMES * 0.45)) AV.Game.warpToBoss();
  }, { f, FRAMES });
  for (let k = 0; k < EVERY; k++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  const b64 = await page.evaluate(() => window.__cap());
  frames.push(Buffer.from(b64, 'base64'));
}
await browser.close(); server.close();

console.log('Encoding GIF...');
const gif = GIFEncoder();
for (const rgba of frames) {
  const data = new Uint8Array(rgba);
  const palette = quantize(data, 256);
  const index = applyPalette(data, palette);
  gif.writeFrame(index, W, H, { palette, delay: DELAY });
}
gif.finish();
fs.writeFileSync(OUT, Buffer.from(gif.bytes()));
console.log('Wrote', OUT, (fs.statSync(OUT).size / 1024 | 0) + 'KB');
