/* ASTRAL VANGUARD — stages.js
 * Parallax landscape backgrounds (no mechs/figures drawn), per-stage spawn
 * timelines (~2 min), and "first-run killer" gimmicks with a warning system.
 */
(function (global) {
  'use strict';
  const AV = global.AV, U = AV.U, FX = AV.FX, Art = AV.Art, Audio = AV.Audio;
  const W = AV.W, H = AV.H;

  /* ----------------------------------------------------------------- *
   * Backgrounds : layered parallax, pure landscape
   * ----------------------------------------------------------------- */
  class Background {
    constructor(stage) { this.stage = stage; this.t = 0; this.stars = []; this._initStars(); }
    _initStars() { for (let i = 0; i < 90; i++) this.stars.push({ x: U.rand(0, W), y: U.rand(0, H), z: U.rand(0.3, 1.5), s: U.rand(0.6, 2) }); }
    update(dt) { this.t += dt; }
    draw(ctx) { (this['_s' + this.stage] || this._s1).call(this, ctx); }

    _sky(ctx, c1, c2, c3) {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, c1); g.addColorStop(0.6, c2); g.addColorStop(1, c3);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    _stars(ctx, spd, col) {
      for (const s of this.stars) {
        let x = (s.x - this.t * spd * s.z) % W; if (x < 0) x += W;
        ctx.globalAlpha = 0.3 + 0.6 * s.z / 1.5; ctx.fillStyle = col || '#dff';
        ctx.fillRect(x, s.y, s.s, s.s);
      } ctx.globalAlpha = 1;
    }
    // repeating silhouette ridge
    _ridge(ctx, baseY, amp, step, speed, color, seed) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
      const off = (this.t * speed) % step;
      for (let x = -step; x <= W + step; x += step) {
        const px = x - off; const hy = baseY - (Math.sin((x + seed) * 0.01) * 0.5 + 0.5) * amp - ((x * 1.3 + seed) % (amp)) ;
        ctx.lineTo(px, hy);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }

    _s1(ctx) { // Orbital Dawn — sky, distant planet, cloud bands, far city
      this._sky(ctx, '#0a1a3a', '#26508f', '#e88a4a');
      // sun glow
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const sg = ctx.createRadialGradient(W * 0.75, H * 0.72, 10, W * 0.75, H * 0.72, 260);
      sg.addColorStop(0, 'rgba(255,200,120,0.6)'); sg.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H); ctx.restore();
      // distant planet
      const pg = ctx.createRadialGradient(180, 120, 10, 200, 130, 80); pg.addColorStop(0, '#9fb6d8'); pg.addColorStop(1, '#1a2c52');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(200, 120, 70, 0, U.TAU); ctx.fill();
      // cloud bands (parallax)
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.12 + i * 0.05; ctx.fillStyle = '#fff';
        const y = 200 + i * 60, off = (this.t * (20 + i * 30)) % (W + 300);
        for (let x = -300; x < W; x += 320) ctx.fillRect(x + off - 300, y, 260, 18); }
      ctx.globalAlpha = 1;
      // far city silhouette
      this._cityline(ctx, H - 60, 24, '#0c1830', 18);
      this._cityline(ctx, H - 30, 40, '#060c1c', 36);
    }
    _cityline(ctx, baseY, hmax, color, speed) {
      ctx.fillStyle = color; const off = (this.t * speed) % 40;
      for (let x = -40; x < W + 40; x += 20) { const h = ((x * 7) % hmax) + 8; ctx.fillRect(x - off, baseY - h, 14, h + 60); }
    }

    _s2(ctx) { // Asteroid Belt — deep space, nebula, drifting rocks
      this._sky(ctx, '#05030f', '#0d0822', '#1a0f33');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const ng = ctx.createRadialGradient(W * 0.35, H * 0.4, 20, W * 0.35, H * 0.4, 360);
      ng.addColorStop(0, 'rgba(120,60,200,0.35)'); ng.addColorStop(0.5, 'rgba(60,30,120,0.18)'); ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
      const ng2 = ctx.createRadialGradient(W * 0.7, H * 0.65, 10, W * 0.7, H * 0.65, 300);
      ng2.addColorStop(0, 'rgba(40,120,200,0.3)'); ng2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng2; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      this._stars(ctx, 30, '#dff');
      // parallax asteroids
      const rock = Art.get('debris');
      for (let i = 0; i < 10; i++) { const z = 0.4 + (i % 3) * 0.4; let x = (W + 80 - (this.t * 40 * z + i * 220) % (W + 160)); const y = (i * 113 % H);
        ctx.globalAlpha = 0.4 + z * 0.3; ctx.save(); ctx.translate(x, y); ctx.rotate(this.t * 0.2 + i); const sc = 0.6 + z; ctx.drawImage(rock, -24 * sc, -24 * sc, 48 * sc, 48 * sc); ctx.restore(); }
      ctx.globalAlpha = 1;
    }

    _s3(ctx) { // Enemy Fortress — dark surface, lava glow, towers
      this._sky(ctx, '#1a0608', '#2a0a0e', '#050204');
      this._stars(ctx, 15, '#fbb');
      // lava glow at bottom
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createLinearGradient(0, H - 120, 0, H); lg.addColorStop(0, 'rgba(255,80,20,0)'); lg.addColorStop(1, 'rgba(255,120,30,0.5)');
      ctx.fillStyle = lg; ctx.fillRect(0, H - 120, W, 120);
      ctx.restore();
      // fortress towers parallax
      for (let layer = 0; layer < 2; layer++) {
        const speed = 30 + layer * 50, baseY = H - 20, off = (this.t * speed) % 180, col = layer ? '#0a0405' : '#150709';
        ctx.fillStyle = col;
        for (let x = -180; x < W + 180; x += 180) { const tw = 60 - layer * 14, th = 120 + ((x * 5) % 120) + layer * 60;
          ctx.fillRect(x - off + 20, baseY - th, tw, th + 20);
          ctx.fillStyle = '#ff5a1e'; ctx.globalAlpha = 0.5; for (let wy = baseY - th + 16; wy < baseY; wy += 28) ctx.fillRect(x - off + 30, wy, 8, 6); ctx.globalAlpha = 1; ctx.fillStyle = col; }
      }
    }
  }
  AV.Background = Background;

  /* ----------------------------------------------------------------- *
   * Presser hazard (initial-death gimmick)
   * ----------------------------------------------------------------- */
  class Presser {
    constructor(x) { this.x = x; this.vx = -110; this.alive = true; this.t = U.rand(0, 1); this.bw = 70; this.hazardKey = 'press'; }
    // gap geometry: cycles open <-> closed
    _state() {
      const cy = (this.t % 2.6);
      let close; // 0 open .. 1 closed
      if (cy < 1.2) close = 0;                       // open
      else if (cy < 1.6) close = (cy - 1.2) / 0.4;   // closing (telegraph)
      else if (cy < 2.2) close = 1;                  // slammed shut
      else close = 1 - (cy - 2.2) / 0.4;             // opening
      return close;
    }
    update(dt, game) {
      this.t += dt; this.x += this.vx * dt;
      if (this.x < -80) this.alive = false;
      const c = this._state();
      if (c > 0.99 && !this._slammed) { this._slammed = true; Audio.sfx('alarm'); FX.spark(this.x, H / 2, 10, '#fc6', 200); }
      if (c < 0.5) this._slammed = false;
    }
    closedRect() { const c = this._state(); const reach = c * (H / 2 - 50); return { topH: 70 + reach, botH: 70 + reach }; }
    hits(p) {
      if (Math.abs(p.x - this.x) > this.bw / 2 + p.w / 2) return false;
      const { topH, botH } = this.closedRect();
      return p.y - p.h / 2 < topH || p.y + p.h / 2 > H - botH;
    }
    draw(ctx) {
      const spr = Art.get('presser'); const { topH, botH } = this.closedRect();
      // top piston
      ctx.save(); ctx.translate(this.x, 0); ctx.drawImage(spr, -this.bw / 2, topH - spr.height, this.bw, spr.height); ctx.restore();
      // bottom piston (flipped)
      ctx.save(); ctx.translate(this.x, H - botH); ctx.scale(1, -1); ctx.drawImage(spr, -this.bw / 2, -spr.height, this.bw, spr.height); ctx.restore();
      // hydraulic glow when slamming
      if (this._state() > 0.6) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4; ctx.fillStyle = '#f73';
        ctx.fillRect(this.x - 3, topH - 8, 6, H - topH - botH + 16); ctx.restore(); }
    }
  }
  AV.Presser = Presser;

  /* ----------------------------------------------------------------- *
   * Spawn helpers
   * ----------------------------------------------------------------- */
  function row(game, type, n, y, sx, gap, opt) { for (let i = 0; i < n; i++) game.addEnemy(new AV.Enemy(type, (sx || W + 30) + i * (gap || 70), y, opt)); }
  function wave(game, type, n, yFrom, yTo, opt) { for (let i = 0; i < n; i++) game.addEnemy(new AV.Enemy(type, W + 30 + i * 70, U.lerp(yFrom, yTo, n > 1 ? i / (n - 1) : 0), opt)); }

  /* ----------------------------------------------------------------- *
   * Stage timelines
   * ----------------------------------------------------------------- */
  function buildStages() {
    return [
      {
        id: 1, name: 'STAGE 1 — ORBITAL DAWN', boss: 0, duration: 116,
        events: [
          { t: 2, fn: (g) => wave(g, 'scout', 4, 120, 360) },
          { t: 5, fn: (g) => g.spawnCapsule(W, 180) },
          { t: 7, fn: (g) => wave(g, 'scout', 5, 380, 120) },
          { t: 11, fn: (g) => row(g, 'fighter', 3, 200, W, 100) },
          { t: 16, fn: (g) => { g.warnIfKnown('debris', 'WARNING : FALLING DEBRIS'); g.addEnemy(new AV.Enemy('debris', 360, -30, { vx: 0, vy: 220, hazardKey: 'debris', sprite: 'debris', hp: 4, w: 40, h: 40, dropChance: 0 })); } },
          { t: 17, fn: (g) => g.addEnemy(new AV.Enemy('debris', 540, -30, { vx: 0, vy: 240, hazardKey: 'debris', sprite: 'debris', hp: 4, w: 40, h: 40, dropChance: 0 })) },
          { t: 20, fn: (g) => row(g, 'turret', 2, AV.H - 40, W, 220) },
          { t: 24, fn: (g) => wave(g, 'scout', 6, 100, 420) },
          { t: 30, fn: (g) => { g.warnIfKnown('fake', 'WARNING : DECOY CAPSULE'); g.spawnCapsule(W, 300, true); g.spawnCapsule(W, 150); } },
          { t: 36, fn: (g) => row(g, 'fighter', 4, 160, W, 90) },
          { t: 42, fn: (g) => { g.warnIfKnown('ambush', 'WARNING : REAR ASSAULT'); for (let i = 0; i < 3; i++) g.addEnemy(new AV.Enemy('scout', -40 - i * 60, g.player.y + U.rand(-60, 60), { vx: 180, hazardKey: 'ambush' })); } },
          { t: 50, fn: (g) => wave(g, 'hunter', 3, 150, 380) },
          { t: 58, fn: (g) => { g.addPresser(new AV.Presser(W + 60)); } },
          { t: 64, fn: (g) => row(g, 'turret', 3, AV.H - 40, W, 180) },
          { t: 70, fn: (g) => wave(g, 'scout', 8, 80, 440) },
          { t: 78, fn: (g) => g.spawnCapsule(W, 260) },
          { t: 80, fn: (g) => row(g, 'dropper', 2, 90, W, 200) },
          { t: 88, fn: (g) => wave(g, 'fighter', 5, 140, 380) },
          { t: 96, fn: (g) => wave(g, 'hunter', 4, 120, 400) },
          { t: 104, fn: (g) => { g.warnIfKnown('debris', 'WARNING : FALLING DEBRIS'); [280, 460, 640].forEach((xx, i) => g.addEnemy(new AV.Enemy('debris', xx, -30 - i * 40, { vx: 0, vy: 240, hazardKey: 'debris', sprite: 'debris', hp: 4, w: 40, h: 40, dropChance: 0 }))); } },
          { t: 112, fn: (g) => g.startBoss() },
        ],
      },
      {
        id: 2, name: 'STAGE 2 — ASTEROID BELT', boss: 1, duration: 118,
        events: [
          { t: 2, fn: (g) => wave(g, 'fighter', 5, 100, 420) },
          { t: 6, fn: (g) => g.spawnCapsule(W, 200) },
          { t: 9, fn: (g) => { for (let i = 0; i < 4; i++) g.addEnemy(new AV.Enemy('mine', W + i * 50, U.rand(80, 440), {})); } },
          { t: 14, fn: (g) => wave(g, 'hunter', 4, 140, 380) },
          { t: 18, fn: (g) => { g.warnIfKnown('press', 'WARNING : CRUSHER GATE'); g.addPresser(new AV.Presser(W + 60)); } },
          { t: 24, fn: (g) => row(g, 'fighter', 4, 160, W, 90) },
          { t: 30, fn: (g) => { g.warnIfKnown('fake', 'WARNING : DECOY CAPSULE'); g.spawnCapsule(W, 120, true); g.spawnCapsule(W, 400); } },
          { t: 36, fn: (g) => { for (let i = 0; i < 6; i++) g.addEnemy(new AV.Enemy('mine', W + i * 40, 60 + i * 70, {})); } },
          { t: 44, fn: (g) => { g.warnIfKnown('ambush', 'WARNING : REAR ASSAULT'); for (let i = 0; i < 4; i++) g.addEnemy(new AV.Enemy('fighter', -40 - i * 60, g.player.y + U.rand(-80, 80), { vx: 200, hazardKey: 'ambush', shoots: true })); } },
          { t: 52, fn: (g) => wave(g, 'hunter', 5, 100, 420) },
          { t: 58, fn: (g) => g.addPresser(new AV.Presser(W + 60)) },
          { t: 62, fn: (g) => g.spawnCapsule(W, 280) },
          { t: 66, fn: (g) => row(g, 'dropper', 3, 90, W, 160) },
          { t: 74, fn: (g) => { for (let i = 0; i < 8; i++) g.addEnemy(new AV.Enemy('mine', W + i * 36, U.rand(70, 450), {})); } },
          { t: 82, fn: (g) => wave(g, 'fighter', 6, 120, 400) },
          { t: 90, fn: (g) => wave(g, 'hunter', 5, 140, 380) },
          { t: 98, fn: (g) => { g.addPresser(new AV.Presser(W + 60)); g.addPresser(new AV.Presser(W + 260)); } },
          { t: 108, fn: (g) => wave(g, 'hunter', 6, 100, 440) },
          { t: 114, fn: (g) => g.startBoss() },
        ],
      },
      {
        id: 3, name: 'STAGE 3 — IRON FORTRESS', boss: 2, duration: 120,
        events: [
          { t: 2, fn: (g) => wave(g, 'hunter', 5, 100, 420) },
          { t: 6, fn: (g) => g.spawnCapsule(W, 220) },
          { t: 9, fn: (g) => row(g, 'turret', 4, AV.H - 40, W, 140) },
          { t: 14, fn: (g) => { g.addPresser(new AV.Presser(W + 60)); g.addPresser(new AV.Presser(W + 240)); } },
          { t: 20, fn: (g) => wave(g, 'fighter', 6, 120, 400) },
          { t: 26, fn: (g) => { g.warnIfKnown('debris', 'WARNING : FALLING DEBRIS'); [240, 400, 560, 720].forEach((xx, i) => g.addEnemy(new AV.Enemy('debris', xx, -30 - i * 30, { vx: 0, vy: 260, hazardKey: 'debris', sprite: 'debris', hp: 5, w: 40, h: 40, dropChance: 0 }))); } },
          { t: 32, fn: (g) => { g.warnIfKnown('fake', 'WARNING : DECOY CAPSULE'); g.spawnCapsule(W, 150, true); g.spawnCapsule(W, 420, true); g.spawnCapsule(W, 280); } },
          { t: 38, fn: (g) => { for (let i = 0; i < 8; i++) g.addEnemy(new AV.Enemy('mine', W + i * 36, 60 + i * 60, {})); } },
          { t: 46, fn: (g) => { g.warnIfKnown('ambush', 'WARNING : REAR ASSAULT'); for (let i = 0; i < 5; i++) g.addEnemy(new AV.Enemy('hunter', -40 - i * 50, g.player.y + U.rand(-90, 90), { vx: 210, hazardKey: 'ambush', shoots: true, homing: true })); } },
          { t: 54, fn: (g) => wave(g, 'hunter', 6, 100, 440) },
          { t: 60, fn: (g) => { g.addPresser(new AV.Presser(W + 60)); } },
          { t: 64, fn: (g) => row(g, 'dropper', 4, 90, W, 130) },
          { t: 70, fn: (g) => g.spawnCapsule(W, 260) },
          { t: 74, fn: (g) => { [300, 500, 700].forEach((xx) => g.addEnemy(new AV.Enemy('debris', xx, -30, { vx: 0, vy: 280, hazardKey: 'debris', sprite: 'debris', hp: 5, w: 40, h: 40, dropChance: 0 }))); g.addPresser(new AV.Presser(W + 60)); } },
          { t: 82, fn: (g) => wave(g, 'fighter', 7, 110, 420) },
          { t: 90, fn: (g) => wave(g, 'hunter', 7, 100, 440) },
          { t: 98, fn: (g) => { g.addPresser(new AV.Presser(W + 60)); g.addPresser(new AV.Presser(W + 200)); g.addPresser(new AV.Presser(W + 400)); } },
          { t: 108, fn: (g) => wave(g, 'hunter', 8, 90, 450) },
          { t: 116, fn: (g) => g.startBoss() },
        ],
      },
    ];
  }
  AV.buildStages = buildStages;

})(window);
