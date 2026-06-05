/* ASTRAL VANGUARD — Iron Requiem
 * core.js : namespace, math utils, input (keyboard/mouse/touch), Web Audio engine
 */
(function (global) {
  'use strict';

  const AV = global.AV = global.AV || {};

  /* ----------------------------------------------------------------- *
   * Math / util
   * ----------------------------------------------------------------- */
  const TAU = Math.PI * 2;
  const U = AV.U = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a)),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    choice: (arr) => arr[(Math.random() * arr.length) | 0],
    chance: (p) => Math.random() < p,
    dist2: (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    angle: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
    sign: (v) => (v < 0 ? -1 : v > 0 ? 1 : 0),
    approach: (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t)),
    aabb: (a, b) => (Math.abs(a.x - b.x) * 2 < a.w + b.w) && (Math.abs(a.y - b.y) * 2 < a.h + b.h),
  };

  /* ----------------------------------------------------------------- *
   * Input
   * ----------------------------------------------------------------- */
  const Input = AV.Input = {
    keys: Object.create(null),
    pressed: Object.create(null),     // edge-triggered this frame
    mouse: { x: 0, y: 0, down: false },
    // Floating virtual stick: active + analog vector (vx,vy ∈ [-1,1]);
    // ox/oy = base centre, kx/ky = knob centre (world px) for drawing.
    touch: { active: false, vx: 0, vy: 0, ox: 0, oy: 0, kx: 0, ky: 0 },
    fire: false,
    auto: false,            // auto-fire toggle (FIRE acts as a toggle switch)
    _startTouch: false,
    power: false,
    _firePulse: false,
    _powerPulse: false,
    _scale: { sx: 1, sy: 1, ox: 0, oy: 0 },

    init(canvas, W, H) {
      this._canvas = canvas; this._W = W; this._H = H;
      const keymap = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
        KeyZ: 'fire', Space: 'fire', KeyJ: 'fire',
        KeyX: 'power', KeyK: 'power', ShiftLeft: 'power', Enter: 'start', Escape: 'pause',
      };
      addEventListener('keydown', (e) => {
        const k = keymap[e.code];
        if (k) { e.preventDefault(); if (!this.keys[k]) this.pressed[k] = true; this.keys[k] = true; }
        if (k === 'fire') this.fire = true;
        if (k === 'power') { if (!this._powerHeld) this._powerPulse = true; this._powerHeld = true; }
        AV.Audio && AV.Audio.resume();
      });
      addEventListener('keyup', (e) => {
        const k = keymap[e.code];
        if (k) { this.keys[k] = false; if (k === 'fire') this.fire = false; if (k === 'power') this._powerHeld = false; }
      });
      const updMouse = (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse.x = (e.clientX - r.left) / r.width * W;
        this.mouse.y = (e.clientY - r.top) / r.height * H;
      };
      canvas.addEventListener('mousemove', updMouse);
      canvas.addEventListener('mousedown', (e) => { updMouse(e); this.mouse.down = true; this.fire = true; AV.Audio && AV.Audio.resume(); });
      addEventListener('mouseup', () => { this.mouse.down = false; this.fire = false; });
    },

    consumePressed(k) { const v = this.pressed[k]; this.pressed[k] = false; return v; },
    consumePower() { const v = this._powerPulse; this._powerPulse = false; return v; },
    endFrame() { this.pressed = Object.create(null); },
  };

  /* ----------------------------------------------------------------- *
   * Web Audio : MP3 assets + synthesized fallback
   * ----------------------------------------------------------------- */
  const Audio = AV.Audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    enabled: true, started: false,
    _bgm: null, _bgmTimer: 0, _bgmStep: 0, _track: null,
    _musicEl: null, _bgmFiles: Object.create(null), _sfxFiles: Object.create(null), _sfxBuffers: Object.create(null),

    init() {
      try {
        const AC = global.AudioContext || global.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.42; this.musicGain.connect(this.master);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.7; this.sfxGain.connect(this.master);
      } catch (e) { this.enabled = false; }
    },
    async loadAssets() {
      if (!this.ctx) return false;
      try {
        const res = await fetch('assets/audio/manifest.json', { cache: 'no-cache' });
        if (!res.ok) return false;
        const man = await res.json();
        this._bgmFiles = man.bgm || Object.create(null);
        this._sfxFiles = man.sfx || Object.create(null);
        const entries = Object.entries(this._sfxFiles);
        await Promise.all(entries.map(async ([name, file]) => {
          try {
            const r = await fetch('assets/audio/' + file, { cache: 'no-cache' });
            if (!r.ok) return;
            const data = await r.arrayBuffer();
            this._sfxBuffers[name] = await this.ctx.decodeAudioData(data);
          } catch (e) { /* keep synthesized fallback */ }
        }));
        console.log('[AV] Loaded audio assets: BGM ' + Object.keys(this._bgmFiles).length + ', SFX ' + Object.keys(this._sfxBuffers).length);
        return true;
      } catch (e) {
        return false;
      }
    },
    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      this.started = true;
      if (this._musicEl && this._musicEl.paused && !this._muted) this._musicEl.play().catch(() => {});
    },
    setMuted(m) {
      if (this.master) this.master.gain.value = m ? 0 : 0.7;
      if (this._musicEl) this._musicEl.muted = !!m;
      this._muted = m;
    },

    _env(node, t, a, d, peak, sus) {
      const g = node.gain; g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(peak, t + a);
      g.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
    },
    _tone(freq, type, t, dur, vol, dest, glideTo) {
      if (!this.enabled || !this.ctx) return;
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
    },
    _noise(t, dur, vol, dest, freq, q) {
      if (!this.enabled || !this.ctx) return;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = this.ctx.createBufferSource(); s.buffer = buf;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = s;
      if (freq) { const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1; s.connect(f); node = f; }
      node.connect(g); g.connect(dest || this.sfxGain); s.start(t); s.stop(t + dur);
    },

    sfx(name) {
      if (!this.enabled || !this.ctx || this._muted) return;
      const t = this.ctx.currentTime;
      const buf = this._sfxBuffers[name];
      if (buf) {
        const src = this.ctx.createBufferSource();
        const g = this.ctx.createGain();
        src.buffer = buf;
        g.gain.value = 0.9;
        src.connect(g); g.connect(this.sfxGain);
        src.start(t);
        return;
      }
      switch (name) {
        case 'shoot': this._tone(880, 'square', t, 0.09, 0.18, this.sfxGain, 420); this._noise(t, 0.05, 0.06, this.sfxGain, 2400, 2); break;
        case 'laser': this._tone(1400, 'sawtooth', t, 0.18, 0.16, this.sfxGain, 700); this._tone(700, 'sine', t, 0.18, 0.1, this.sfxGain, 350); break;
        case 'missile': this._noise(t, 0.18, 0.12, this.sfxGain, 800, 0.7); this._tone(220, 'square', t, 0.12, 0.1, this.sfxGain, 120); break;
        case 'hit': this._noise(t, 0.06, 0.12, this.sfxGain, 3200, 3); break;
        case 'bosshit': this._tone(180, 'square', t, 0.08, 0.16); this._noise(t, 0.06, 0.1, this.sfxGain, 1600, 2); break;
        case 'explode': this._noise(t, 0.45, 0.5, this.sfxGain, 420, 0.6); this._tone(120, 'sawtooth', t, 0.4, 0.22, this.sfxGain, 40); break;
        case 'bigexplode':
          this._noise(t, 0.9, 0.6, this.sfxGain, 300, 0.5); this._tone(90, 'sawtooth', t, 0.8, 0.3, this.sfxGain, 30);
          this._tone(160, 'square', t + 0.05, 0.5, 0.2, this.sfxGain, 50); break;
        case 'powerup': [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 'square', t + i * 0.05, 0.12, 0.16)); break;
        case 'select': this._tone(660, 'square', t, 0.06, 0.14, this.sfxGain, 880); break;
        case 'levelup': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(f, 'triangle', t + i * 0.04, 0.14, 0.16)); break;
        case 'shield': this._tone(300, 'sine', t, 0.3, 0.16, this.sfxGain, 600); this._noise(t, 0.2, 0.05, this.sfxGain, 1200, 4); break;
        case 'alarm': this._tone(880, 'square', t, 0.12, 0.18); this._tone(880, 'square', t + 0.2, 0.12, 0.18); break;
        case 'warn': this._tone(140, 'sawtooth', t, 0.3, 0.2, this.sfxGain, 90); break;
        case 'death': this._noise(t, 1.0, 0.5, this.sfxGain, 500, 0.5); this._tone(300, 'sawtooth', t, 0.9, 0.3, this.sfxGain, 40); break;
        case 'coin': this._tone(988, 'square', t, 0.05, 0.12); this._tone(1318, 'square', t + 0.05, 0.1, 0.12); break;
        case 'clear': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this._tone(f, 'triangle', t + i * 0.09, 0.25, 0.18)); break;
      }
    },

    // ---- BGM : step sequencer ----
    tracks: {
      title: { bpm: 96, bass: [0, 0, 7, 7, 5, 5, 3, 3], lead: [12, 16, 19, 16, 12, 14, 15, 19], root: 130.81, wave: 'triangle' },
      stage1: { bpm: 138, bass: [0, 0, 0, 7, 5, 5, 3, 2], lead: [12, 15, 19, 24, 22, 19, 15, 12], root: 146.83, wave: 'square' },
      stage2: { bpm: 150, bass: [0, 3, 5, 7, 8, 7, 5, 3], lead: [19, 22, 24, 27, 24, 22, 19, 15], root: 130.81, wave: 'square' },
      stage3: { bpm: 162, bass: [0, 0, -2, -2, 3, 3, 5, 7], lead: [24, 22, 19, 24, 27, 24, 19, 22], root: 110.0, wave: 'sawtooth' },
      boss: { bpm: 168, bass: [0, 0, 1, 1, 0, 0, -1, -1], lead: [24, 25, 27, 28, 27, 25, 24, 22], root: 98.0, wave: 'sawtooth' },
    },
    playBGM(name) {
      if (!this.enabled || !this.ctx) return;
      if (this._track === name) return;
      this.stopBGM();
      const fileCfg = this._bgmFiles[name];
      if (fileCfg && fileCfg.file) {
        const el = new global.Audio('assets/audio/' + fileCfg.file);
        el.loop = !!fileCfg.loop;
        el.preload = 'auto';
        el.volume = 0.42;
        el.muted = !!this._muted;
        this._musicEl = el;
        this._track = name;
        if (this.started && !this._muted) el.play().catch(() => {});
        return;
      }
      this._track = name; const tr = this.tracks[name]; if (!tr) return;
      const spb = 60 / tr.bpm / 2; // 8th notes
      this._bgmStep = 0;
      const tick = () => {
        if (this._track !== name) return;
        const t = this.ctx.currentTime + 0.02; const s = this._bgmStep % 8;
        const semi = (n) => tr.root * Math.pow(2, n / 12);
        if (!this._muted) {
          this._tone(semi(tr.bass[s]) / 2, tr.wave, t, spb * 0.95, 0.16, this.musicGain);
          this._tone(semi(tr.lead[s]), 'square', t, spb * 0.6, 0.09, this.musicGain);
          if (s % 2 === 0) this._noise(t, 0.04, 0.12, this.musicGain, 6000, 1); // hat
          if (s === 0 || s === 4) this._noise(t, 0.12, 0.22, this.musicGain, 120, 0.8); // kick-ish
          if (s === 2 || s === 6) this._noise(t, 0.1, 0.14, this.musicGain, 1800, 1.2); // snare
        }
        this._bgmStep++;
        this._bgm = setTimeout(tick, spb * 1000);
      };
      tick();
    },
    stopBGM() {
      if (this._musicEl) {
        this._musicEl.pause();
        this._musicEl.currentTime = 0;
        this._musicEl = null;
      }
      if (this._bgm) clearTimeout(this._bgm);
      this._bgm = null; this._track = null;
    },
  };

})(window);
