/* ASTRAL VANGUARD - audio asset verifier */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = path.join(ROOT, 'assets', 'audio');
const MANIFEST = path.join(AUDIO, 'manifest.json');
const REQUIRE_SUNO = process.argv.includes('--require-suno');
const BGM = ['title', 'stage1', 'stage2', 'stage3', 'boss'];
const SFX = ['shoot', 'laser', 'missile', 'hit', 'bosshit', 'explode', 'bigexplode', 'powerup', 'select', 'levelup', 'shield', 'alarm', 'warn', 'death', 'coin', 'clear'];
const STAGE_MIN_SECONDS = 180;

function fail(msg) {
  console.error('✗ ' + msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log('✓ ' + msg);
}

function duration(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || `ffprobe failed: ${file}`).trim());
  return Number(r.stdout.trim());
}

if (!fs.existsSync(MANIFEST)) {
  fail('assets/audio/manifest.json is missing');
  process.exit();
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const bgm = manifest.bgm || {};
const sfx = manifest.sfx || {};

for (const name of BGM) {
  const cfg = bgm[name];
  if (!cfg || !cfg.file) { fail(`BGM "${name}" is missing from manifest`); continue; }
  const file = path.join(AUDIO, cfg.file);
  if (!fs.existsSync(file)) { fail(`BGM file missing: ${cfg.file}`); continue; }
  const len = duration(file);
  if (!Number.isFinite(len) || len <= 1) fail(`BGM "${name}" duration is too short: ${len}`);
  else if (['stage1', 'stage2', 'stage3'].includes(name) && len < STAGE_MIN_SECONDS) fail(`BGM "${name}" must be at least ${STAGE_MIN_SECONDS}s: ${len.toFixed(2)}s`);
  else ok(`BGM "${name}" exists (${len.toFixed(2)}s, loop=${!!cfg.loop})`);
}

if (bgm.title && bgm.title.loop !== false) fail('title BGM must not loop');
for (const name of ['stage1', 'stage2', 'stage3', 'boss']) {
  if (bgm[name] && bgm[name].loop !== true) fail(`${name} BGM must loop`);
}

for (const name of SFX) {
  const rel = sfx[name];
  if (!rel) { fail(`SFX "${name}" is missing from manifest`); continue; }
  const file = path.join(AUDIO, rel);
  if (!fs.existsSync(file)) { fail(`SFX file missing: ${rel}`); continue; }
  const len = duration(file);
  if (!Number.isFinite(len) || len <= 0.02) fail(`SFX "${name}" duration is too short: ${len}`);
  else ok(`SFX "${name}" exists (${len.toFixed(2)}s)`);
}

const source = manifest.bgmSource || 'placeholder';
const bgmSources = manifest.bgmSources || {};
const missingSuno = BGM.filter((name) => (bgmSources[name] || source) !== 'suno');
if (REQUIRE_SUNO && missingSuno.length) {
  fail(`Suno BGM has not been imported for: ${missingSuno.join(', ')}. Run npm run import-suno-bgm -- --src <folder>`);
} else {
  ok(`BGM source: ${source}`);
}

if (process.exitCode) process.exit(process.exitCode);
