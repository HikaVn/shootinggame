/* ASTRAL VANGUARD — bosses.js
 * Composite bosses. Armor parts deflect (spark, no damage); the CORE part is
 * always exposed and is the only vulnerable hitbox, guaranteeing damage lands.
 */
(function (global) {
  'use strict';
  const AV = global.AV, U = AV.U, FX = AV.FX, Art = AV.Art, Audio = AV.Audio, Bullets = AV.Bullets;
  const W = AV.W, H = AV.H;

  class Boss {
    constructor(cfg, game) {
      this.cfg = cfg; this.name = cfg.name;
      this.x = W + 200; this.y = H / 2; this.targetX = cfg.x || (W - 190);
      this.hp = cfg.hp; this.maxhp = cfg.hp; this.alive = true; this.entering = true;
      this.t = 0; this.atkT = 1.2; this.coreFlash = 0; this.bobT = 0; this.dyDir = 1;
      this.parts = cfg.parts.map((p) => Object.assign({ flash: 0 }, p));
      this.phaseIdx = -1; this.warned = game.warned; this.beam = null; this.subT = 0;
      this.game = game; this.dead = false; this.deathT = 0;
    }

    // world-space hitbox for a part
    _hb(p) { return { x: this.x + p.ox, y: this.y + p.oy, w: p.w, h: p.h }; }

    // returns {consumed, damaged} for a player bullet
    onBulletHit(b) {
      if (!this.alive || this.entering) return null;
      const bb = { x: b.x, y: b.y, w: (b.r || 3) * 2, h: (b.r || 3) * 2 };
      // priority: vulnerable core, then destructible turrets, then armor —
      // so a shot meant for the core/turret is never "stolen" by armor.
      const pr = (p) => (p.vuln ? 2 : (p.destructible && !p.destroyed ? 1 : 0));
      const ordered = this.parts.slice().sort((a, c) => pr(c) - pr(a));
      for (const p of ordered) {
        if (p.destroyed) continue;
        if (!U.aabb(bb, this._hb(p))) continue;
        if (p.vuln) {
          this.hp -= b.dmg; p.flash = 0.1; this.coreFlash = 0.12;
          Audio.sfx('bosshit'); FX.spark(b.x, b.y, 6, '#fff', 220);
          if (this.hp <= 0) this.startDeath();
          return { consumed: !b.pierce, damaged: true };
        }
        if (p.destructible) {            // independently destroyable gun turret
          p.hp -= b.dmg; p.flash = 0.08; Audio.sfx('hit'); FX.spark(b.x, b.y, 4, '#ffc070', 180);
          if (p.hp <= 0) {
            p.destroyed = true; FX.explosion(this.x + p.ox, this.y + p.oy, 1.0); Audio.sfx('explode');
            if (this.game.scoreKill) this.game.scoreKill(600, this.x + p.ox, this.y + p.oy); else this.game.addScore(600);
          }
          return { consumed: !b.pierce, damaged: false };
        }
        p.flash = 0.06; FX.spark(b.x, b.y, 3, '#9cf', 120);   // armor deflect
        return { consumed: !b.pierce, damaged: false };
      }
      return null;
    }

    // Surviving turrets keep the boss firing fast; destroying them slows it down.
    _turretPenalty() {
      const turrets = this.parts.filter((p) => p.destructible);
      if (!turrets.length) return 1;
      const dead = turrets.filter((p) => p.destroyed).length;
      return 1 + dead * 0.6;
    }

    // collide player against any solid part (armor or core)
    bodyHitbox() { // approximate overall body for player collision
      let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      for (const p of this.parts) { const h = this._hb(p); minx = Math.min(minx, h.x - h.w / 2); maxx = Math.max(maxx, h.x + h.w / 2); miny = Math.min(miny, h.y - h.h / 2); maxy = Math.max(maxy, h.y + h.h / 2); }
      return { x: (minx + maxx) / 2, y: (miny + maxy) / 2, w: (maxx - minx) * 0.8, h: (maxy - miny) * 0.8 };
    }

    startDeath() {
      this.alive = false; this.dead = true; this.deathT = 2.2; Audio.sfx('bigexplode');
      this.game.onBossDefeated();
    }

    update(dt, game) {
      this.t += dt;
      if (this.coreFlash > 0) this.coreFlash -= dt;
      for (const p of this.parts) if (p.flash > 0) p.flash -= dt;

      if (this.dead) {
        this.deathT -= dt;
        if (Math.random() < 0.5) FX.explosion(this.x + U.rand(-90, 90), this.y + U.rand(-90, 90), U.rand(0.8, 1.6));
        return;
      }
      if (this.entering) {
        this.x = U.approach(this.x, this.targetX, 220 * dt);
        if (Math.abs(this.x - this.targetX) < 2) { this.entering = false; Audio.sfx('alarm'); }
        return;
      }
      // vertical patrol
      this.bobT += dt;
      this.y += this.dyDir * (this.cfg.moveSpeed || 50) * dt;
      if (this.y > H - 150) this.dyDir = -1; if (this.y < 150) this.dyDir = 1;

      // phase by hp fraction
      const frac = this.hp / this.maxhp;
      const phases = this.cfg.phases;
      let idx = 0; for (let i = 0; i < phases.length; i++) if (frac <= phases[i].upTo) idx = i;
      this.phaseIdx = idx;

      // beam handling
      if (this.beam) {
        this.beam.t -= dt;
        if (this.beam.t <= 0) this.beam = null;
        else if (!this.beam.telegraph && game.player.alive) {
          // damage if player intersects beam line
          if (Math.abs(game.player.y - this.beam.y) < 16 && game.player.x < this.beam.x) game.player.hit(game);
        } else if (this.beam.telegraph && this.beam.t < this.beam.fireAt) {
          this.beam.telegraph = false; Audio.sfx('laser'); this.beam.y = this._beamLockY != null ? this._beamLockY : this.beam.y;
        }
      }

      this.atkT -= dt;
      if (this.atkT <= 0) {
        phases[idx].fire(this, game);
        // rank speeds the boss up; lost turrets slow it down.
        const r = game.rank ? game.rank() : 0;
        this.atkT = this.atkT / (1 + r * 0.45) * this._turretPenalty();
      }
    }

    /* ---- attack primitives ---- */
    corePart() { return this.parts.find((p) => p.vuln); }
    muzzle() { const c = this.corePart(); return { x: this.x + c.ox - c.w / 2, y: this.y + c.oy }; }

    fan(n, spread, spd, col) {
      const m = this.muzzle(); const base = Math.PI; // facing left
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * spread;
        Bullets.eAdd({ x: m.x, y: m.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, dmg: 1, col: col || '#ff7a5a' });
      }
      Audio.sfx('shoot');
    }
    aimed(spd, n, spread) {
      const m = this.muzzle(), p = this.game.player;
      const a0 = U.angle(m.x, m.y, p.x, p.y); n = n || 1; spread = spread || 0.12;
      for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * spread; Bullets.eAdd({ x: m.x, y: m.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, dmg: 1, col: '#ffba5a' }); }
      Audio.sfx('shoot');
    }
    ring(n, spd, col) {
      const m = this.muzzle();
      for (let i = 0; i < n; i++) { const a = i / n * U.TAU; Bullets.eAdd({ x: m.x, y: m.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 5, dmg: 1, col: col || '#ff5a8a' }); }
      Audio.sfx('shoot');
    }
    wall(gapY, gapH, spd) { // vertical curtain with a memorizable gap
      const m = this.muzzle();
      for (let y = 30; y < H - 20; y += 26) {
        if (y > gapY - gapH / 2 && y < gapY + gapH / 2) continue;
        Bullets.eAdd({ x: m.x, y, vx: -spd, vy: 0, r: 6, dmg: 1, col: '#ff6a6a' });
      }
      Audio.sfx('missile');
    }
    laserSweep(game) { // telegraph then horizontal beam at player's locked Y
      const m = this.muzzle();
      this._beamLockY = game.player.y;
      this.beam = { x: m.x, y: game.player.y, t: 1.5, fireAt: 0.9, telegraph: true };
      game.warnOnce('laser', 'WARNING : CHARGED BEAM');
      Audio.sfx('warn');
    }

    draw(ctx) {
      // body panels
      const panel = Art.get('bossPanel'), core = Art.get('bossCore'), tur = Art.get('bossTurret');
      ctx.save(); ctx.translate(this.x, this.y);
      for (const p of this.parts) {
        if (p.destroyed) { // burnt-out turret stub
          ctx.save(); ctx.translate(p.ox, p.oy); ctx.fillStyle = '#0a0d12';
          ctx.beginPath(); ctx.arc(0, 0, p.w * 0.3, 0, U.TAU); ctx.fill();
          ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); continue;
        }
        ctx.save(); ctx.translate(p.ox, p.oy);
        if (p.vuln) {
          // pulsing exposed core
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(this.t * 4);
          const g = ctx.createRadialGradient(0, 0, 2, 0, 0, p.w); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#3ef'); g.addColorStop(1, 'rgba(0,80,120,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.w, 0, U.TAU); ctx.fill(); ctx.restore();
          ctx.drawImage(core, -p.w / 2, -p.h / 2, p.w, p.h);
        } else if (p.kind === 'turret') {
          ctx.drawImage(tur, -p.w / 2, -p.h / 2, p.w, p.h);
        } else {
          ctx.drawImage(panel, -p.w / 2, -p.h / 2, p.w, p.h);
        }
        if (p.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = p.flash * 8; ctx.fillStyle = '#fff'; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        ctx.restore();
      }
      ctx.restore();

      // beam
      if (this.beam) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        if (this.beam.telegraph) {
          ctx.globalAlpha = 0.3 + 0.3 * Math.sin(this.t * 30); ctx.strokeStyle = '#f55'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(this.beam.x, this.beam.y); ctx.lineTo(0, this.beam.y); ctx.stroke();
        } else {
          const h = 26 + Math.sin(this.t * 40) * 6;
          const g = ctx.createLinearGradient(0, this.beam.y - h, 0, this.beam.y + h);
          g.addColorStop(0, 'rgba(255,80,80,0)'); g.addColorStop(0.5, '#fff'); g.addColorStop(1, 'rgba(255,80,80,0)');
          ctx.fillStyle = g; ctx.fillRect(0, this.beam.y - h, this.beam.x, h * 2);
        }
        ctx.restore();
      }
    }
  }
  AV.Boss = Boss;

  /* ----------------------------------------------------------------- *
   * Boss configs — note core hitbox sits in an exposed gap, armor above/below.
   * ----------------------------------------------------------------- */
  AV.BOSS_CFG = [
    { // Stage 1
      name: 'IRON SENTINEL', hp: 240, moveSpeed: 46,
      parts: [
        { ox: 40, oy: -120, w: 110, h: 130, kind: 'panel' },
        { ox: 40, oy: 120, w: 110, h: 130, kind: 'panel' },
        { ox: -40, oy: 0, w: 84, h: 84, vuln: true },   // exposed core (left/front, facing player)
      ],
      phases: [
        { upTo: 1.01, fire(b, g) { b.atkT = 1.1; b.aimed(280, 3, 0.18); if (U.chance(0.5)) b.fan(5, 0.2, 200); } },
        { upTo: 0.5, fire(b, g) { b.atkT = 0.9; b.aimed(320, 5, 0.14); if (U.chance(0.4)) b.wall(g.player.y, 120, 200); } },
      ],
    },
    { // Stage 2
      name: 'TEMPEST WARDEN', hp: 340, moveSpeed: 70,
      parts: [
        { ox: 60, oy: -110, w: 100, h: 110, kind: 'panel' },
        { ox: 60, oy: 110, w: 100, h: 110, kind: 'panel' },
        { ox: 80, oy: -150, w: 44, h: 44, kind: 'turret', destructible: true, hp: 24 },
        { ox: 80, oy: 150, w: 44, h: 44, kind: 'turret', destructible: true, hp: 24 },
        { ox: -30, oy: 0, w: 80, h: 80, vuln: true },
      ],
      phases: [
        { upTo: 1.01, fire(b, g) { b.atkT = 1.0; b.ring(12, 220); b.aimed(300, 3, 0.16); } },
        { upTo: 0.6, fire(b, g) { b.atkT = 1.3; if (U.chance(0.5)) b.laserSweep(g); else { b.ring(16, 240); b.fan(7, 0.18, 220); } } },
        { upTo: 0.3, fire(b, g) { b.atkT = 0.8; b.ring(20, 260); b.aimed(340, 5, 0.12); } },
      ],
    },
    { // Stage 3 (final)
      name: 'OBSIDIAN MONOLITH', hp: 460, moveSpeed: 90,
      parts: [
        { ox: 50, oy: -130, w: 110, h: 120, kind: 'panel' },
        { ox: 50, oy: 130, w: 110, h: 120, kind: 'panel' },
        { ox: 90, oy: -170, w: 44, h: 44, kind: 'turret', destructible: true, hp: 28 },
        { ox: 90, oy: 170, w: 44, h: 44, kind: 'turret', destructible: true, hp: 28 },
        { ox: -20, oy: 0, w: 88, h: 88, vuln: true },
      ],
      phases: [
        { upTo: 1.01, fire(b, g) { b.atkT = 0.95; b.wall(g.player.y, 110, 220); b.aimed(300, 3, 0.16); } },
        { upTo: 0.66, fire(b, g) { b.atkT = 1.2; if (U.chance(0.5)) b.laserSweep(g); else { b.ring(18, 250); } } },
        { upTo: 0.33, fire(b, g) { b.atkT = 0.7; b.ring(24, 280); b.aimed(360, 5, 0.12); if (U.chance(0.4)) b.wall(g.player.y, 90, 240); } },
      ],
    },
  ];

})(window);
