/* ASTRAL VANGUARD - Suno BGM importer
 *
 * Usage:
 *   node tools/import_suno_bgm.mjs --src ~/Downloads/suno
 *
 * By default, the source folder must contain MP3/WAV/M4A files whose filenames include:
 *   title, stage1, stage2, stage3, boss
 *
 * To import a subset, pass:
 *   --targets title,stage1,stage2,stage3
 *
 * Imported files are normalized and written to assets/audio/bgm/*.mp3.
 * Existing BGM files are backed up under assets/audio/bgm/_previous/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'audio', 'bgm');
const MANIFEST = path.join(ROOT, 'assets', 'audio', 'manifest.json');
const BACKUP = path.join(OUT, '_previous');
const ALL_TARGETS = ['title', 'stage1', 'stage2', 'stage3', 'boss'];
const EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg']);
const STAGE_TARGETS = new Set(['stage1', 'stage2', 'stage3']);
const STAGE_MIN_SECONDS = 180;
const STAGE_EXTEND_SECONDS = 185;

function usage() {
  console.error('Usage: node tools/import_suno_bgm.mjs --src <folder> [--targets title,stage1,stage2,stage3,boss]');
  process.exit(2);
}

function expandHome(p) {
  if (!p || p === '~') return process.env.HOME || p;
  if (p.startsWith('~/')) return path.join(process.env.HOME || '', p.slice(2));
  return p;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `${cmd} failed`).trim());
  return r.stdout;
}

function duration(file) {
  const out = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(out.trim());
}

function findSource(srcDir, target) {
  const files = fs.readdirSync(srcDir)
    .filter((f) => EXT.has(path.extname(f).toLowerCase()))
    .map((f) => ({ name: f, lower: f.toLowerCase(), full: path.join(srcDir, f) }));
  const normalizedTarget = target.replace(/\d/g, (n) => ` ${n}`);
  const matches = files.filter((f) => {
    const name = f.lower.replace(/[_-]+/g, ' ');
    return name.includes(target) || name.includes(normalizedTarget);
  });
  if (matches.length !== 1) {
    const hint = matches.length ? matches.map((m) => m.name).join(', ') : 'none';
    throw new Error(`Expected exactly one source file for "${target}", found: ${hint}`);
  }
  return matches[0].full;
}

const srcArgIndex = process.argv.indexOf('--src');
if (srcArgIndex < 0 || !process.argv[srcArgIndex + 1]) usage();

const targetsArgIndex = process.argv.indexOf('--targets');
const targets = targetsArgIndex >= 0 && process.argv[targetsArgIndex + 1]
  ? process.argv[targetsArgIndex + 1].split(',').map((v) => v.trim()).filter(Boolean)
  : ALL_TARGETS;
for (const target of targets) {
  if (!ALL_TARGETS.includes(target)) throw new Error(`Unknown target: ${target}`);
}

const srcDir = path.resolve(expandHome(process.argv[srcArgIndex + 1]));
if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
  throw new Error(`Source folder not found: ${srcDir}`);
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(BACKUP, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const imported = [];

for (const target of targets) {
  const src = findSource(srcDir, target);
  const out = path.join(OUT, `${target}.mp3`);
  if (fs.existsSync(out)) {
    fs.copyFileSync(out, path.join(BACKUP, `${target}-${stamp}.mp3`));
  }
  const inputDuration = duration(src);
  const needsStageExtend = STAGE_TARGETS.has(target) && inputDuration < STAGE_MIN_SECONDS;
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
  ];
  if (needsStageExtend) args.push('-stream_loop', '-1', '-t', String(STAGE_EXTEND_SECONDS));
  args.push(
    '-i', src,
    '-vn',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-codec:a', 'libmp3lame',
    '-b:a', '192k',
    out,
  );
  run('ffmpeg', args);
  imported.push({ target, source: src, sourceDuration: inputDuration, duration: duration(out), extended: needsStageExtend });
}

if (fs.existsSync(MANIFEST)) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const bgmSources = manifest.bgmSources || Object.fromEntries(ALL_TARGETS.map((target) => [target, manifest.bgmSource || 'placeholder']));
  for (const { target } of imported) bgmSources[target] = 'suno';
  manifest.bgmSources = bgmSources;
  manifest.bgmSource = ALL_TARGETS.every((target) => bgmSources[target] === 'suno') ? 'suno' : 'mixed';
  manifest.sunoImportedAt = new Date().toISOString();
  // Intentionally do NOT record the absolute import path — it would leak a local
  // username/directory into this public repo's manifest.
  manifest.note = 'BGM files imported from Suno downloads with tools/import_suno_bgm.mjs. Stage BGM shorter than 3 minutes is loop-extended to 185 seconds during import. SFX files are locally synthesized unless replaced separately.';
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

console.log(JSON.stringify({ imported }, null, 2));
