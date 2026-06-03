/* ASTRAL VANGUARD - local audio asset generator
 * Generates placeholder MP3 BGM/SFX with no third-party samples.
 * Replace the BGM MP3 files with Suno exports using the same filenames.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = path.join(ROOT, 'assets', 'audio');
const BGM = path.join(AUDIO, 'bgm');
const SFX = path.join(AUDIO, 'sfx');
const TMP = path.join(AUDIO, '_tmp');
const SR = 44100;
const TAU = Math.PI * 2;
const STAGE_SECONDS = 185;

for (const dir of [BGM, SFX, TMP]) fs.mkdirSync(dir, { recursive: true });

function clamp(v) { return Math.max(-1, Math.min(1, v)); }
function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function env(i, n, a = 0.01, r = 0.08) {
  const attack = Math.max(1, Math.floor(a * SR));
  const release = Math.max(1, Math.floor(r * SR));
  if (i < attack) return i / attack;
  if (i > n - release) return Math.max(0, (n - i) / release);
  return 1;
}
function wave(type, phase) {
  if (type === 'square') return Math.sin(phase) >= 0 ? 1 : -1;
  if (type === 'saw') return 2 * ((phase / TAU) - Math.floor(0.5 + phase / TAU));
  if (type === 'tri') return 2 * Math.abs(2 * ((phase / TAU) - Math.floor((phase / TAU) + 0.5))) - 1;
  return Math.sin(phase);
}
function addTone(buf, start, dur, freq, vol, type = 'sine', pan = 0, glide = 0) {
  const n0 = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  let phase = 0;
  for (let i = 0; i < n && n0 + i < buf.length; i++) {
    const k = i / Math.max(1, n - 1);
    const f = glide ? freq + (glide - freq) * k : freq;
    phase += TAU * f / SR;
    const v = wave(type, phase) * vol * env(i, n, 0.006, Math.min(0.12, dur * 0.35));
    buf[n0 + i] += v * (1 - Math.max(0, pan) * 0.25);
  }
}
function addNoise(buf, start, dur, vol, decay = 1, color = 1) {
  const n0 = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  let last = 0;
  for (let i = 0; i < n && n0 + i < buf.length; i++) {
    const k = i / Math.max(1, n - 1);
    const white = Math.random() * 2 - 1;
    last += (white - last) * color;
    buf[n0 + i] += last * vol * Math.pow(1 - k, decay);
  }
}
function addKick(buf, t) {
  addTone(buf, t, 0.16, 95, 0.75, 'sine', 0, 42);
  addNoise(buf, t, 0.045, 0.16, 2.5, 0.45);
}
function addSnare(buf, t) {
  addNoise(buf, t, 0.13, 0.34, 1.5, 0.9);
  addTone(buf, t, 0.09, 190, 0.16, 'tri');
}
function addHat(buf, t) { addNoise(buf, t, 0.035, 0.12, 2.4, 1); }
function addMetalHit(buf, t) {
  addNoise(buf, t, 0.08, 0.18, 2.2, 1);
  addTone(buf, t, 0.1, 1320, 0.09, 'square');
  addTone(buf, t, 0.12, 620, 0.08, 'saw');
}

function writeWav(file, buf) {
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) data.writeInt16LE(Math.round(clamp(buf[i]) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22); head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 2, 28);
  head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}
function toMp3(wav, mp3) {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '192k', mp3], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || `ffmpeg failed for ${mp3}`);
}

function makeBgm(name, cfg) {
  const len = cfg.seconds;
  const buf = new Float32Array(Math.floor(len * SR));
  const beat = 60 / cfg.bpm;
  const step = beat / 2;
  const steps = Math.floor(len / step);
  for (let s = 0; s < steps; s++) {
    const t = s * step;
    const root = cfg.root;
    const bassNote = cfg.bass[s % cfg.bass.length];
    const leadNote = cfg.lead[s % cfg.lead.length];
    addTone(buf, t, step * 0.92, midi(root + bassNote - 24), cfg.bassVol || 0.22, cfg.wave || 'saw');
    if (cfg.heavy) {
      addTone(buf, t, step * 0.96, midi(root + bassNote - 36), 0.18, 'sine');
      addTone(buf, t, step * 0.86, midi(root + bassNote - 12), 0.08, 'saw');
    }
    if (s % 2 === 0) addTone(buf, t + step * 0.08, step * 0.58, midi(root + leadNote), cfg.leadVol || 0.12, cfg.leadWave || 'square');
    if (cfg.pad && s % 8 === 0) {
      for (const interval of cfg.pad) addTone(buf, t, step * 7.8, midi(root + interval), 0.045, 'tri');
    }
    if (s % 4 === 0) addKick(buf, t);
    if (s % 4 === 2) addSnare(buf, t);
    if (s % 2 === 1) addHat(buf, t);
    if (cfg.heavy && s % 4 === 1) addKick(buf, t);
    if (cfg.heavy && s % 2 === 0) addHat(buf, t + step * 0.5);
    if (cfg.heavy && s % 16 === 12) addMetalHit(buf, t);
  }
  if (cfg.fadeOut) {
    const fade = Math.floor(cfg.fadeOut * SR);
    for (let i = 0; i < fade; i++) {
      const idx = buf.length - fade + i;
      buf[idx] *= 1 - i / fade;
    }
  }
  const wav = path.join(TMP, `${name}.wav`);
  const mp3 = path.join(BGM, `${name}.mp3`);
  writeWav(wav, buf);
  toMp3(wav, mp3);
  console.log(`bgm/${name}.mp3`);
}

function makeSfx(name, seconds, draw) {
  const buf = new Float32Array(Math.floor(seconds * SR));
  draw(buf);
  const wav = path.join(TMP, `${name}.wav`);
  const mp3 = path.join(SFX, `${name}.mp3`);
  writeWav(wav, buf);
  toMp3(wav, mp3);
  console.log(`sfx/${name}.mp3`);
}

const bgm = {
  title: { seconds: 42, loop: false, bpm: 92, root: 50, wave: 'tri', leadWave: 'tri', bass: [0, 0, 7, 7, 5, 5, 3, 3], lead: [12, 16, 19, 16, 12, 14, 15, 19], pad: [0, 7, 12], bassVol: 0.14, leadVol: 0.08, fadeOut: 5 },
  stage1: { seconds: STAGE_SECONDS, loop: true, bpm: 138, root: 51, wave: 'square', bass: [0, 0, 0, 7, 5, 5, 3, 2], lead: [12, 15, 19, 24, 22, 19, 15, 12], pad: [0, 7, 12] },
  stage2: { seconds: STAGE_SECONDS, loop: true, bpm: 150, root: 48, wave: 'square', bass: [0, 3, 5, 7, 8, 7, 5, 3], lead: [19, 22, 24, 27, 24, 22, 19, 15], pad: [0, 5, 12] },
  stage3: { seconds: STAGE_SECONDS, loop: true, bpm: 162, root: 45, wave: 'saw', bass: [0, 0, -2, -2, 3, 3, 5, 7], lead: [24, 22, 19, 24, 27, 24, 19, 22], pad: [0, 3, 10], bassVol: 0.25 },
  boss: { seconds: STAGE_SECONDS, loop: true, bpm: 188, root: 40, wave: 'saw', bass: [0, 0, -1, 0, 3, 0, -2, 0, 5, 3, 0, -1], lead: [24, 27, 28, 31, 28, 27, 24, 22, 24, 27, 31, 34], pad: [0, 6, 12], bassVol: 0.34, leadVol: 0.16, leadWave: 'saw', heavy: true },
};

const targetArgIndex = process.argv.indexOf('--targets');
const targetNames = targetArgIndex >= 0 && process.argv[targetArgIndex + 1]
  ? process.argv[targetArgIndex + 1].split(',').map((v) => v.trim()).filter(Boolean)
  : Object.keys(bgm);

for (const name of targetNames) {
  if (!bgm[name]) throw new Error(`Unknown BGM target: ${name}`);
}

for (const [name, cfg] of Object.entries(bgm)) {
  if (targetNames.includes(name)) makeBgm(name, cfg);
}

if (targetArgIndex < 0) {
  makeSfx('shoot', 0.16, (b) => { addTone(b, 0, 0.09, 980, 0.55, 'square', 0, 420); addNoise(b, 0, 0.045, 0.16, 2, 1); });
  makeSfx('laser', 0.28, (b) => { addTone(b, 0, 0.22, 1550, 0.38, 'saw', 0, 620); addTone(b, 0, 0.2, 760, 0.22, 'sine', 0, 360); });
  makeSfx('missile', 0.32, (b) => { addNoise(b, 0, 0.24, 0.32, 1.2, 0.3); addTone(b, 0, 0.2, 260, 0.22, 'square', 0, 110); });
  makeSfx('hit', 0.14, (b) => { addNoise(b, 0, 0.08, 0.5, 2.2, 1); addTone(b, 0, 0.05, 460, 0.2, 'square'); });
  makeSfx('bosshit', 0.18, (b) => { addTone(b, 0, 0.1, 180, 0.42, 'square'); addNoise(b, 0, 0.09, 0.26, 1.7, 0.7); });
  makeSfx('explode', 0.7, (b) => { addNoise(b, 0, 0.55, 0.72, 1.8, 0.28); addTone(b, 0, 0.42, 120, 0.36, 'saw', 0, 42); });
  makeSfx('bigexplode', 1.25, (b) => { addNoise(b, 0, 1.05, 0.86, 1.5, 0.2); addTone(b, 0, 0.85, 90, 0.5, 'saw', 0, 28); addTone(b, 0.06, 0.6, 160, 0.34, 'square', 0, 52); });
  makeSfx('powerup', 0.5, (b) => [523, 659, 784, 1046].forEach((f, i) => addTone(b, i * 0.055, 0.15, f, 0.3, 'square')));
  makeSfx('select', 0.13, (b) => addTone(b, 0, 0.08, 660, 0.36, 'square', 0, 880));
  makeSfx('levelup', 0.55, (b) => [392, 523, 659, 784, 1046, 1318].forEach((f, i) => addTone(b, i * 0.045, 0.16, f, 0.28, 'tri')));
  makeSfx('shield', 0.42, (b) => { addTone(b, 0, 0.34, 300, 0.32, 'sine', 0, 620); addNoise(b, 0, 0.22, 0.14, 1.6, 0.6); });
  makeSfx('alarm', 0.46, (b) => { addTone(b, 0, 0.13, 880, 0.42, 'square'); addTone(b, 0.22, 0.13, 880, 0.42, 'square'); });
  makeSfx('warn', 0.38, (b) => addTone(b, 0, 0.3, 140, 0.45, 'saw', 0, 80));
  makeSfx('death', 1.2, (b) => { addNoise(b, 0, 1.0, 0.62, 1.3, 0.26); addTone(b, 0, 0.95, 300, 0.36, 'saw', 0, 38); });
  makeSfx('coin', 0.22, (b) => { addTone(b, 0, 0.06, 988, 0.3, 'square'); addTone(b, 0.055, 0.1, 1318, 0.3, 'square'); });
  makeSfx('clear', 0.95, (b) => [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => addTone(b, i * 0.1, 0.28, f, 0.28, 'tri')));
}

const manifestPath = path.join(AUDIO, 'manifest.json');
const manifest = targetArgIndex >= 0 && fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : {
      bgm: Object.fromEntries(Object.entries(bgm).map(([name, cfg]) => [name, { file: `bgm/${name}.mp3`, loop: cfg.loop }])),
      sfx: Object.fromEntries(['shoot', 'laser', 'missile', 'hit', 'bosshit', 'explode', 'bigexplode', 'powerup', 'select', 'levelup', 'shield', 'alarm', 'warn', 'death', 'coin', 'clear'].map((name) => [name, `sfx/${name}.mp3`])),
    };
manifest.generatedAt = new Date().toISOString();
manifest.bgm ||= {};
manifest.bgmSources ||= Object.fromEntries(Object.keys(bgm).map((name) => [name, manifest.bgmSource || 'placeholder']));
for (const name of targetNames) {
  manifest.bgm[name] = { file: `bgm/${name}.mp3`, loop: bgm[name].loop };
  manifest.bgmSources[name] = 'placeholder';
}
manifest.bgmSource = Object.values(manifest.bgmSources).every((source) => source === 'placeholder') ? 'placeholder' : 'mixed';
manifest.note = 'Local placeholder MP3s generated with tools/gen_audio_assets.mjs. Stage and boss BGM placeholders are 185 seconds. Replace bgm/*.mp3 with Suno instrumental exports using the same filenames when available.';
fs.writeFileSync(path.join(AUDIO, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.rmSync(TMP, { recursive: true, force: true });
console.log('assets/audio/manifest.json');
