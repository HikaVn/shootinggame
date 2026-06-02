/* ASTRAL VANGUARD — tools/gen_assets.mjs
 * OPTIONAL real-image pipeline. Run on a machine with an OpenAI API key:
 *
 *     export OPENAI_API_KEY=sk-...
 *     npm run gen-assets
 *
 * For each sprite it asks OpenAI's image model for a "real mech-SF" render on a
 * pure CHROMA-GREEN background (the v2 image model has no transparency), then
 * keys the green out to produce a transparent PNG in assets/, and rewrites
 * assets/manifest.json. The game auto-detects and uses these PNGs — no code
 * changes needed. Backgrounds are generated as opaque landscapes (no figures).
 *
 * Chroma-keying is done inside the same headless Chromium we already use for
 * tests, so this needs no native image libraries.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const RAW = path.join(ASSETS, '_raw');
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'; // a.k.a. "Images 2.0 / gpt-image-2"

if (!KEY) { console.error('Set OPENAI_API_KEY first.'); process.exit(1); }
fs.mkdirSync(RAW, { recursive: true });

const STYLE = 'photorealistic hard-surface mechanical sci-fi, intricate panel lines, brushed titanium and carbon, glowing energy accents, dramatic rim lighting, 3/4 side view, single object centered, no text, no background scenery';
const GREEN = 'on a perfectly uniform solid chroma-key green (#00ff00) background, the green fully surrounds the subject';

// name -> { prompt, transparent }
const SPRITES = {
  player: { p: `a sleek agile player starfighter facing right, blue and steel hull, cyan cockpit, twin engine nozzles, ${STYLE}, ${GREEN}` },
  option: { p: `a small glowing spherical drone orb with cyan energy core, ${STYLE}, ${GREEN}` },
  scout: { p: `a small fast enemy interceptor drone facing left, green-teal armor, red sensor eye, ${STYLE}, ${GREEN}` },
  fighter: { p: `a medium enemy fighter craft facing left, blue-grey armor, twin cannons, ${STYLE}, ${GREEN}` },
  hunter: { p: `an aggressive enemy hunter craft facing left, orange-red armor, sharp wings, ${STYLE}, ${GREEN}` },
  turret: { p: `a heavy armored ground turret with cannon, grey steel, red core, ${STYLE}, ${GREEN}` },
  dropper: { p: `a bulky bomber dropship with a bottom bomb hatch, grey hull, ${STYLE}, ${GREEN}` },
  mine: { p: `a spiked spherical space mine, red glowing core, metal spikes, ${STYLE}, ${GREEN}` },
  debris: { p: `a jagged chunk of scorched rocky asteroid debris, ${STYLE}, ${GREEN}` },
  capsule: { p: `a glossy red power-up capsule pill with a white letter P and chrome rim, ${STYLE}, ${GREEN}` },
  bossCore: { p: `a glowing exposed reactor core sphere, brilliant cyan plasma, segmented containment ring, ${STYLE}, ${GREEN}` },
  bossPanel: { p: `a massive curved armored battleship hull panel section, riveted dark steel, orange hazard stripe, ${STYLE}, ${GREEN}` },
  bossTurret: { p: `a large spherical boss turret with cannon, polished steel, red lens, ${STYLE}, ${GREEN}` },
};
// Opaque landscape backgrounds (no mechs, no people) — optional extras.
const BACKDROPS = {
  bg_stage1: { p: 'epic sci-fi matte painting, planetary orbital dawn, distant glowing planet and warm sunrise over a far futuristic city skyline silhouette, atmospheric clouds, NO vehicles, NO people, NO machines, pure landscape, cinematic', transparent: false },
  bg_stage2: { p: 'sci-fi matte painting, deep space asteroid belt with purple and blue nebula clouds and drifting rocks, starfield, NO vehicles, NO people, NO machines, pure space landscape, cinematic', transparent: false },
  bg_stage3: { p: 'sci-fi matte painting, dark volcanic enemy fortress surface, towering black ramparts, glowing lava rivers, red sky, NO vehicles, NO people, NO machines, pure landscape, cinematic', transparent: false },
};

async function genImage(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({ model: MODEL, prompt, size: '1024x1024', n: 1 }),
  });
  if (!res.ok) throw new Error('OpenAI ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const j = await res.json();
  const d = j.data[0];
  if (d.b64_json) return Buffer.from(d.b64_json, 'base64');
  const img = await fetch(d.url); return Buffer.from(await img.arrayBuffer()); // some responses give a url
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');

  const manifest = { generatedAt: new Date().toISOString(), model: MODEL, sprites: {} };
  const all = { ...SPRITES, ...BACKDROPS };

  for (const [name, cfg] of Object.entries(all)) {
    process.stdout.write(`• ${name} ... `);
    try {
      const raw = await genImage(cfg.p);
      fs.writeFileSync(path.join(RAW, name + '.png'), raw);
      const transparent = cfg.transparent !== false;
      const outName = name + '.png';
      if (transparent) {
        const dataUrl = 'data:image/png;base64,' + raw.toString('base64');
        const keyed = await page.evaluate(async (src) => {
          const img = new Image(); img.src = src; await img.decode();
          const c = document.getElementById('c'); c.width = img.width; c.height = img.height;
          const x = c.getContext('2d'); x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
          for (let i = 0; i < p.length; i += 4) {
            const r = p[i], g = p[i + 1], b = p[i + 2];
            if (g > 90 && g > r * 1.35 && g > b * 1.35) { p[i + 3] = 0; }       // key out green
            else if (g > r && g > b) { p[i + 1] = Math.round((r + b) / 2); }      // despill edges
          }
          x.putImageData(d, 0, 0); return c.toDataURL('image/png');
        }, dataUrl);
        fs.writeFileSync(path.join(ASSETS, outName), Buffer.from(keyed.split(',')[1], 'base64'));
      } else {
        fs.writeFileSync(path.join(ASSETS, outName), raw);
      }
      if (SPRITES[name]) manifest.sprites[name] = outName;
      console.log('ok');
    } catch (e) { console.log('FAILED — ' + e.message); }
  }

  fs.writeFileSync(path.join(ASSETS, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log('\nDone. Wrote assets/manifest.json with', Object.keys(manifest.sprites).length, 'sprites.');
  console.log('Reload the game — it will use the new images automatically.');
}
main().catch((e) => { console.error(e); process.exit(1); });
