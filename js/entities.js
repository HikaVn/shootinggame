/* ASTRAL VANGUARD — entities.js
 * Bullets, Player (Gradius-style power meter & weapons), PowerCapsule, Enemies.
 */
(function (global) {
  'use strict';
  const AV = global.AV, U = AV.U, FX = AV.FX, Art = AV.Art, Audio = AV.Audio;

  const W = AV.W = 960, H = AV.H = 540;
  const GROUND = H - 8;
  // Missile durability, measured in flat-travel pixels: on flat/descending ground
  // it covers ~2/3 of the screen. Climbing multiplies the spend rate via a
  // quadratic fit through 0°→1×, 30°→1.5×, 60°→3×  (m = 1 + deg²/1800).
  const MISSILE_RANGE = W * 2 / 3;

  // Difficulty scaling for hard-mode loops: enemy/bullet speed, spawn counts,
  // and spawn frequency (how often waves arrive).
  AV.diff = AV.diff || { speed: 1, count: 1, freq: 1 };

  /* ----------------------------------------------------------------- *
   * Bullet manager
   * ----------------------------------------------------------------- */
  const Bullets = AV.Bullets = {
    player: [], enemy: [],
    clear() { this.player.length = 0; this.enemy.length = 0; },

    pAdd(o) { o.trail = []; o.life = o.life || 3; this.player.push(o); return o; },
    eAdd(o) { o.trail = []; o.life = o.life || 6; const m = AV.diff.speed; o.vx = (o.vx || 0) * m; o.vy = (o.vy || 0) * m; this.enemy.push(o); return o; },

    // aimed enemy shot
    aim(x, y, tx, ty, spd, opt) {
      const a = U.angle(x, y, tx, ty);
      return this.eAdd(Object.assign({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 5, dmg: 1, col: '#ff5a5a', kind: 'eball' }, opt || {}));
    },

    update(dt, terrain) {
      for (const arr of [this.player, this.enemy]) {
        for (let i = arr.length - 1; i >= 0; i--) {
          const b = arr[i]; b.life -= dt;
          if (b.trail) { b.trail.push(b.x, b.y); if (b.trail.length > 8) b.trail.splice(0, 2); }
          if (b.homing && b.target && b.target.alive) {
            const a = U.angle(b.x, b.y, b.target.x, b.target.y);
            const ca = Math.atan2(b.vy, b.vx), spd = Math.hypot(b.vx, b.vy);
            let da = a - ca; while (da > Math.PI) da -= U.TAU; while (da < -Math.PI) da += U.TAU;
            const na = ca + U.clamp(da, -3 * dt, 3 * dt);
            b.vx = Math.cos(na) * spd; b.vy = Math.sin(na) * spd;
          }
          if (b.missile) this._missile(b, dt, terrain);
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40 || b.life <= 0) arr.splice(i, 1);
        }
      }
    },

    // Missiles drop to (or rise toward) the terrain surface, then hug it as it
    // scrolls. Climbing a slope drains the missile's durability in proportion to
    // the vertical distance it has to climb (steeper = faster drain, no hard
    // cutoff); descending/flat costs nothing. When durability runs out it
    // detonates. DUR_BASE is tuned so a 60° climb lasts ~1/4 of the screen.
    _missile(b, dt, terrain) {
      const ceiling = b.ceiling;
      const surfAt = (x) => {
        if (terrain && terrain.active) return terrain.surfaceY(x, ceiling);
        return ceiling ? 4 : GROUND - 4;
      };
      if (b.phase === 0) {                       // launch arc toward the surface
        b.vy += (ceiling ? -700 : 700) * dt;
        const surf = surfAt(b.x);
        if (ceiling ? b.y <= surf + 4 : b.y >= surf - 4) {
          b.phase = 1; b.vy = 0; b.vx = 520; b.y = surf + (ceiling ? 4 : -4);
          FX.fire(b.x, b.y, 1, ceiling ? 1 : -1); FX.smoke(b.x, b.y, 1);
        }
        return;
      }
      // phase 1 — ride the surface, spending durability as it advances. Flat or
      // descending ground spends at 1×; climbing spends faster by m(slope).
      const dx = Math.abs(b.vx) * dt;
      const cur = surfAt(b.x), ahead = surfAt(b.x + Math.sign(b.vx) * dx);
      const climb = ceiling ? (ahead - cur) : (cur - ahead);   // >0 = surface rising into the path
      let mult = 1;
      if (climb > 0 && dx > 0) {
        const deg = Math.atan2(climb, dx) * 180 / Math.PI;      // climb angle in degrees
        mult = 1 + deg * deg / 1800;                            // 0°→1, 30°→1.5, 60°→3
        if (mult > 2) FX.fire(b.x, b.y, 1, ceiling ? 1 : -1);   // sparks on steep climbs
      }
      b.dur -= mult * dx;
      b.y = cur + (ceiling ? 4 : -4); b.vy = 0;
      if (b.dur <= 0) { FX.explosion(b.x, b.y, 0.7); Audio.sfx('hit'); b.life = 0; }
    },

    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // player bullets
      for (const b of this.player) {
        if (b.kind === 'laser') {
          const len = b.len || 46;
          const grd = ctx.createLinearGradient(b.x - len, b.y, b.x, b.y);
          grd.addColorStop(0, 'rgba(120,255,255,0)'); grd.addColorStop(1, '#dffeff');
          ctx.fillStyle = grd; ctx.fillRect(b.x - len, b.y - 5, len, 10);
          ctx.fillStyle = '#bff'; ctx.fillRect(b.x - len, b.y - 2, len, 4);
          ctx.fillStyle = '#fff'; ctx.fillRect(b.x - len, b.y - 1, len, 2);
          ctx.globalAlpha = 0.5 + Math.random() * 0.5; ctx.fillStyle = '#7ff';
          ctx.fillRect(b.x - 6, b.y - 6, 12, 12); ctx.globalAlpha = 1;
        } else if (b.missile) {
          // body + trail handled by particles; draw glowing head
          this._glow(ctx, b.x, b.y, 6, '#ffd24a');
          ctx.fillStyle = '#cfd6e0'; ctx.fillRect(b.x - 5, b.y - 2, 10, 4);
        } else {
          this._trail(ctx, b, b.col || '#ffe27a');
          this._glow(ctx, b.x, b.y, b.r + 3, b.col || '#ffe27a');
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, U.TAU); ctx.fill();
        }
      }
      // enemy bullets
      for (const b of this.enemy) {
        this._trail(ctx, b, b.col || '#ff6a6a');
        this._glow(ctx, b.x, b.y, b.r + 3, b.col || '#ff6a6a');
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, U.TAU); ctx.fill();
      }
      ctx.restore();
    },
    _glow(ctx, x, y, r, col) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
      g.addColorStop(0, '#fff'); g.addColorStop(0.4, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, U.TAU); ctx.fill();
    },
    _trail(ctx, b, col) {
      const t = b.trail; if (!t || t.length < 4) return;
      ctx.strokeStyle = col; ctx.lineCap = 'round';
      for (let i = 0; i < t.length - 2; i += 2) {
        ctx.globalAlpha = (i / t.length) * 0.5; ctx.lineWidth = b.r || 3;
        ctx.beginPath(); ctx.moveTo(t[i], t[i + 1]); ctx.lineTo(t[i + 2], t[i + 3]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  };

  /* ----------------------------------------------------------------- *
   * Player
   * ----------------------------------------------------------------- */
  const SLOTS = ['SPEED', 'MISSILE', 'DOUBLE', 'SPREAD', 'LASER', 'OPTION', 'SHIELD'];

  class Player {
    constructor() { this.reset(true); }
    reset(full) {
      this.x = 140; this.y = H / 2; this.w = 44; this.h = 22;
      this.vx = 0; this.vy = 0; this.alive = true; this.bank = 0;
      this.fireT = 0; this.missileT = 0; this.inv = 2.0; // spawn invuln
      this.trail = [[this.x, this.y]];   // path breadcrumbs for trailing options
      if (full) {
        this.cursor = -1; this.speedLvl = 0; this.missileLvl = 0;
        this.weapon = 'normal'; this.options = []; this.orbit = false; this.orbitA = 0;
        this.shield = 0; this.shieldMax = 0;
      }
      this.flamePulse = 0;
    }
    get speed() { return 200 + this.speedLvl * 70; }

    collectCapsule() { this.cursor = (this.cursor + 1) % SLOTS.length; Audio.sfx('coin'); }

    applyPower(game) {
      if (this.cursor < 0) return;
      const slot = SLOTS[this.cursor];
      // If the highlighted upgrade is already at its limit / already owned,
      // do nothing AND keep the selection (don't consume the power).
      const available = (
        slot === 'SPEED' ? this.speedLvl < 4 :
        slot === 'MISSILE' ? this.missileLvl < 3 :
        slot === 'DOUBLE' ? this.weapon !== 'double' :
        slot === 'SPREAD' ? this.weapon !== 'spread' :
        slot === 'LASER' ? this.weapon !== 'laser' :
        slot === 'OPTION' ? (this.options.length < 3 || !this.orbit) :
        slot === 'SHIELD' ? true :          // gain a shield, or (if already up) trigger the bullet-clear
        true
      );
      if (!available) { Audio.sfx('select'); if (game) game.flash(slot + ' MAX', '#fd5'); return; }

      switch (slot) {
        case 'SPEED': this.speedLvl++; break;
        case 'MISSILE': this.missileLvl++; break;
        case 'DOUBLE': this.weapon = 'double'; break;
        case 'SPREAD': this.weapon = 'spread'; break;
        case 'LASER': this.weapon = 'laser'; break;
        // up to 3 trailing options; a 4th OPTION pickup makes them orbit the ship
        case 'OPTION': if (this.options.length < 3) this.options.push({ x: this.x, y: this.y }); else this.orbit = true; break;
        case 'SHIELD':
          if (this.shield > 0) {                       // already shielded → panic clear: wipe every enemy bullet
            Bullets.enemy.length = 0;
            FX.ring(this.x, this.y, '#7ef', 220, 8); FX.spark(this.x, this.y, 24, '#bff', 320);
            if (game) game.flash('ALL CLEAR', '#7ef');
          }
          this.shield = 16; this.shieldMax = 16; break;
      }
      Audio.sfx('levelup'); FX.ring(this.x, this.y, '#7ef', 60, 4);
      this.cursor = -1;
      if (game) game.flash(slot + ' ONLINE', '#7ef');
    }

    hit(game) {
      if (this.inv > 0 || !this.alive) return false;
      if (this.shield > 0) { this.shield -= 4; Audio.sfx('shield'); FX.ring(this.x, this.y, '#7ef', 50, 5); this.inv = 0.4; return false; }
      this.alive = false; this.inv = 0; Audio.sfx('death');
      FX.bigExplosion(this.x, this.y); game.onPlayerDeath();
      return true;
    }

    update(dt, game) {
      if (!this.alive) return;
      if (this.inv > 0) this.inv -= dt;
      const I = AV.Input;
      let dx = 0, dy = 0;
      if (I.keys.left) dx -= 1; if (I.keys.right) dx += 1;
      if (I.keys.up) dy -= 1; if (I.keys.down) dy += 1;
      const ox = this.x, oy = this.y;
      if (dx || dy) {
        const m = Math.hypot(dx, dy) || 1;
        this.x = U.clamp(this.x + dx / m * this.speed * dt, 24, W - 40);
        this.y = U.clamp(this.y + dy / m * this.speed * dt, 22, GROUND - 14);
      } else if (I.touch.active && (I.touch.vx || I.touch.vy)) { // floating virtual stick (analog)
        this.x = U.clamp(this.x + I.touch.vx * this.speed * dt, 24, W - 40);
        this.y = U.clamp(this.y + I.touch.vy * this.speed * dt, 22, GROUND - 14);
      }
      this.vx = (this.x - ox) / dt; this.vy = (this.y - oy) / dt;
      this.bank = U.approach(this.bank, U.clamp(this.vy / 200, -1, 1), dt * 6);

      this._updateOptions(dt);

      this.flamePulse += dt * 18;
      // fire — hold the button, or leave auto-fire toggled on
      this.fireT -= dt; this.missileT -= dt;
      const firing = AV.Input.fire || AV.Input.auto;
      if (firing && this.fireT <= 0) this.fire(game);
      // two-stage missiles: lvl 1 = a floor-hugging missile, lvl 2 also adds a
      // ceiling-hugging one.
      if (this.missileLvl > 0 && firing && this.missileT <= 0) {
        this.missileT = 0.6;
        const dur = MISSILE_RANGE * (this.missileLvl >= 3 ? 2 : 1);   // lvl 3 doubles durability
        Bullets.pAdd({ x: this.x, y: this.y + 6, vx: 120, vy: 60, r: 4, dmg: 2, missile: true, phase: 0, ceiling: false, dur });
        if (this.missileLvl >= 2) Bullets.pAdd({ x: this.x, y: this.y - 6, vx: 120, vy: -60, r: 4, dmg: 2, missile: true, phase: 0, ceiling: true, dur });
        Audio.sfx('missile');
      }
    }

    // Options either trail the ship with a soft lag (they arrive late and never
    // snap onto the ship), or — once orbit mode is unlocked — circle it at a
    // fixed radius.
    _updateOptions(dt) {
      if (!this.options.length) return;
      // Spacing widens with speed: from ~30px up to ~3 ship-widths at max speed.
      const spread = U.lerp(30, this.w * 3, U.clamp(this.speedLvl / 4, 0, 1));
      if (this.orbit) {
        this.orbitA += dt * 2.4;
        const R = spread, n = this.options.length;
        this.options.forEach((o, i) => {
          const a = this.orbitA + i * U.TAU / n;
          o.x = this.x + Math.cos(a) * R; o.y = this.y + Math.sin(a) * R;
        });
        return;
      }
      // Distance-based path trail: options sit at fixed distances back along the
      // ship's recent path. They follow the exact route with a lag and — because
      // spacing is measured in path distance, not time — they hold their place
      // when the ship is idle instead of sliding back onto it.
      const GAP = spread, tr = this.trail;
      const head = tr[tr.length - 1];
      if (Math.hypot(this.x - head[0], this.y - head[1]) > 3) tr.push([this.x, this.y]);
      const need = GAP * this.options.length + 40;
      let total = 0;                                 // trim breadcrumbs older than needed
      for (let i = tr.length - 1; i > 0; i--) {
        total += Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]);
        if (total > need) { tr.splice(0, i - 1); break; }
      }
      this.options.forEach((o, idx) => {
        let want = GAP * (idx + 1), acc = 0, px = this.x, py = this.y;
        for (let i = tr.length - 1; i >= 0; i--) {
          const seg = Math.hypot(tr[i][0] - px, tr[i][1] - py);
          if (acc + seg >= want) { const t = (want - acc) / (seg || 1); o.x = px + (tr[i][0] - px) * t; o.y = py + (tr[i][1] - py) * t; return; }
          acc += seg; px = tr[i][0]; py = tr[i][1];
        }
        o.x = px; o.y = py;                          // not enough trail yet → tail end
      });
    }

    fire(game) {
      const mx = this.x + 26, my = this.y;
      const shoot = (ox, oy) => {
        const W2 = this.weapon;
        if (W2 === 'laser') {
          this.fireT = 0.12;
          Bullets.pAdd({ x: ox + 24, y: oy, vx: 1500, vy: 0, r: 4, dmg: 1.4, kind: 'laser', len: 60, pierce: true, life: 1.2 });
        } else if (W2 === 'spread') {
          this.fireT = 0.13;
          for (const ang of [-0.32, 0, 0.32]) Bullets.pAdd({ x: ox, y: oy, vx: Math.cos(ang) * 760, vy: Math.sin(ang) * 760, r: 3.5, dmg: 1, col: '#7dff9b' });
        } else if (W2 === 'double') {
          this.fireT = 0.12;
          Bullets.pAdd({ x: ox, y: oy, vx: 880, vy: 0, r: 3.5, dmg: 1, col: '#ffe27a' });
          Bullets.pAdd({ x: ox, y: oy, vx: 620, vy: -620, r: 3.5, dmg: 1, col: '#ffe27a' });
        } else {
          this.fireT = 0.1;
          Bullets.pAdd({ x: ox, y: oy - 3, vx: 900, vy: 0, r: 3.5, dmg: 1, col: '#ffe27a' });
          Bullets.pAdd({ x: ox, y: oy + 3, vx: 900, vy: 0, r: 3.5, dmg: 1, col: '#ffe27a' });
        }
      };
      shoot(mx, my);
      this.options.forEach((o) => shoot(o.x + 14, o.y));
      FX.muzzle(mx + 6, my, this.weapon === 'laser' ? '#bff' : '#ffeaa0');
      Audio.sfx(this.weapon === 'laser' ? 'laser' : 'shoot');
    }

    draw(ctx) {
      if (!this.alive) return;
      const blink = this.inv > 0 && (Math.floor(this.inv * 18) % 2 === 0);
      // engine flame
      const fl = 1 + Math.sin(this.flamePulse) * 0.25 + (Math.hypot(this.vx, this.vy) > 10 ? 0.5 : 0);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createLinearGradient(this.x - 26 - 18 * fl, this.y, this.x - 18, this.y);
      fg.addColorStop(0, 'rgba(60,180,255,0)'); fg.addColorStop(0.5, '#6cf'); fg.addColorStop(1, '#fff');
      ctx.fillStyle = fg; ctx.beginPath();
      ctx.moveTo(this.x - 18, this.y - 5); ctx.lineTo(this.x - 26 - 20 * fl, this.y); ctx.lineTo(this.x - 18, this.y + 5); ctx.closePath(); ctx.fill();
      ctx.restore();

      // afterimage when moving fast
      const spr = Art.get('player');
      if (Math.hypot(this.vx, this.vy) > 120) {
        ctx.globalAlpha = 0.25; ctx.drawImage(spr, this.x - 36 - this.vx * 0.02, this.y - 24 - this.vy * 0.02, 72, 48); ctx.globalAlpha = 1;
      }
      if (!blink) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.bank * 0.18);
        ctx.drawImage(spr, -36, -24, 72, 48); ctx.restore();
      }
      // options
      const opt = Art.get('option');
      this.options.forEach((o) => { if (o.x != null) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9; ctx.drawImage(opt, o.x - 11, o.y - 11, 22, 22); ctx.restore(); } });
      // shield
      if (this.shield > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.4 + 0.2 * Math.sin(this.flamePulse);
        const g = ctx.createRadialGradient(this.x, this.y, 10, this.x, this.y, 38);
        g.addColorStop(0, 'rgba(80,200,255,0)'); g.addColorStop(0.7, 'rgba(80,200,255,0.3)'); g.addColorStop(1, '#7ef');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y, 38, 0, U.TAU); ctx.fill();
        ctx.restore();
      }
    }
    get hitbox() { return { x: this.x, y: this.y, w: 14, h: 10 }; }
  }
  AV.Player = Player; AV.SLOTS = SLOTS;

  /* ----------------------------------------------------------------- *
   * Power capsule
   * ----------------------------------------------------------------- */
  class Capsule {
    constructor(x, y, fake) { this.x = x; this.y = y; this.vx = -90; this.vy = 0; this.w = 24; this.h = 24; this.alive = true; this.fake = !!fake; this.t = 0; }
    update(dt) { this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt + Math.sin(this.t * 3) * 0.4; if (this.x < -30) this.alive = false; }
    draw(ctx) {
      const spr = Art.get(this.fake ? 'capsuleFake' : 'capsule');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 6);
      const g = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, 20); g.addColorStop(0, this.fake ? '#c6f' : '#f88'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y, 20, 0, U.TAU); ctx.fill(); ctx.restore();
      ctx.drawImage(spr, this.x - 14, this.y - 14, 28, 28);
    }
    get hitbox() { return { x: this.x, y: this.y, w: 22, h: 22 }; }
  }
  AV.Capsule = Capsule;

  /* ----------------------------------------------------------------- *
   * Enemies
   * ----------------------------------------------------------------- */
  class Enemy {
    constructor(type, x, y, opt) {
      this.type = type; this.x = x; this.y = y; this.t = 0; this.alive = true;
      this.fireT = U.rand(0.5, 1.5); this.idle = U.rand(0, U.TAU); this.hitFlash = 0;
      Object.assign(this, this._defaults(type), opt || {});
      // Hard-mode loops speed up enemy movement (and below, their shots & approach).
      this.spdMul = AV.diff.speed;
      this.vx *= this.spdMul; if (this.vy) this.vy *= this.spdMul;
      // Terrain crawlers lock onto the floor (or ceiling if opt.ceiling) regardless of passed y.
      if (this.crawl) { this.y = this.ceiling ? (this.h / 2 + 6) : (GROUND - this.h / 2); }
      this.maxhp = this.hp; this.y0 = this.y;
    }
    _defaults(type) {
      switch (type) {
        case 'scout': return { hp: 2, w: 40, h: 32, sprite: 'scout', vx: -160, score: 100, dropChance: 0.18 };
        case 'fighter': return { hp: 3, w: 50, h: 40, sprite: 'fighter', vx: -120, score: 150, dropChance: 0.16, shoots: true };
        case 'hunter': return { hp: 4, w: 46, h: 36, sprite: 'hunter', vx: -90, score: 250, dropChance: 0.2, shoots: true, homing: true };
        case 'turret': return { hp: 6, w: 40, h: 40, sprite: 'turret', vx: 0, score: 200, dropChance: 0.25, shoots: true, ground: true };
        case 'dropper': return { hp: 5, w: 40, h: 44, sprite: 'dropper', vx: -70, score: 220, dropChance: 0.3, drops: true };
        case 'mine': return { hp: 1, w: 24, h: 24, sprite: 'mine', vx: -60, score: 50, dropChance: 0 };
        case 'crawler': return { hp: 4, w: 44, h: 26, sprite: 'crawler', vx: -130, score: 200, dropChance: 0.24, shoots: true, crawl: true };
        default: return { hp: 2, w: 40, h: 32, sprite: 'scout', vx: -150, score: 100, dropChance: 0.15 };
      }
    }

    damage(d, game) {
      if (!this.alive) return;
      this.hp -= d; this.hitFlash = 0.08; Audio.sfx('hit');
      FX.spark(this.x + U.rand(-6, 6), this.y + U.rand(-6, 6), 4, '#fff', 160);
      if (this.hp <= 0) this.die(game);
    }
    die(game) {
      this.alive = false; FX.explosion(this.x, this.y, this.w > 44 ? 1.4 : 1); Audio.sfx('explode');
      if (game.scoreKill) game.scoreKill(this.score, this.x, this.y); else game.addScore(this.score);
      if (this.dropChance > 0 && U.chance(this.dropChance)) game.spawnCapsule(this.x, this.y);
      if (this.onDeath) this.onDeath(game);
    }

    update(dt, game) {
      this.t += dt; this.idle += dt;
      if (this.hitFlash > 0) this.hitFlash -= dt;
      const p = game.player;

      switch (this.type) {
        case 'scout': this.x += this.vx * dt; this.y = this.y0 + Math.sin(this.t * 3 + this.idle) * 26; break;
        case 'fighter': this.x += this.vx * dt; this.y += Math.sin(this.t * 2) * 30 * dt; break;
        case 'hunter':
          this.x += this.vx * dt;
          if (this.x < W - 100 && p.alive) this.y = U.approach(this.y, p.y, 90 * this.spdMul * dt);
          this.y += Math.sin(this.t * 5) * 0.6; break;
        case 'turret': this.y = this.y0 + Math.sin(this.idle) * 1.5; break;
        case 'dropper': this.x += this.vx * dt; this.y = this.y0 + Math.sin(this.t * 1.5) * 10; break;
        case 'mine': this.x += this.vx * dt; this.y += Math.sin(this.t * 4) * 20 * dt; break;
        case 'crawler': { // tread along the terrain surface, tilting with the slope
          this.x += this.vx * dt;
          const terr = game.terrain;
          if (terr && terr.active) {
            const sy = terr.surfaceY(this.x, this.ceiling);
            this.y = (this.ceiling ? sy + this.h / 2 : sy - this.h / 2) + Math.sin(this.t * 10) * 1.2;
            const d = 14;
            this.tilt = U.clamp(Math.atan2(terr.surfaceY(this.x + d, this.ceiling) - terr.surfaceY(this.x - d, this.ceiling), 2 * d), -0.9, 0.9);
          } else {
            this.y = (this.ceiling ? this.h / 2 + 6 : GROUND - this.h / 2) + Math.sin(this.t * 10) * 1.2;
            this.tilt = 0;
          }
          break;
        }
      }

      // Floating enemies steer to stay inside the lethal-terrain corridor
      // (crawlers ride it, turrets are ground-mounted, debris falls through).
      if (!this.crawl && !this.ground && this.type !== 'debris' && game.terrain && game.terrain.active) {
        const m = this.h / 2 + 12, lead = Math.max(0, -this.vx) * 0.25 + 14;  // look a touch ahead of travel
        const top = game.terrain.surfaceY(this.x - lead, true) + m;
        const bot = game.terrain.surfaceY(this.x - lead, false) - m;
        const ty = bot < top ? (top + bot) / 2 : U.clamp(this.y, top, bot);
        if (ty !== this.y) this.y = U.approach(this.y, ty, 700 * dt);
        // hard safety: the body can never overlap the lethal surface here & now
        const cs = game.terrain.surfaceY(this.x, true) + this.h / 2;
        const fs = game.terrain.surfaceY(this.x, false) - this.h / 2;
        this.y = fs < cs ? (cs + fs) / 2 : U.clamp(this.y, cs, fs);
      }

      // shooting
      if (this.shoots && p.alive) {
        this.fireT -= dt;
        if (this.fireT <= 0 && this.x < W && this.x > 60) {
          const r = game.rank ? game.rank() : 0;                 // difficulty scaling
          this.fireT = U.rand(1.0, 2.0) / (1 + r * 0.6);
          const spd = (this.type === 'turret' ? 280 : 230) * (1 + r * 0.35);
          Bullets.aim(this.x, this.y, p.x, p.y, spd, this.homing ? { homing: true, target: p, col: '#ffba5a' } : {});
        }
      }
      if (this.drops && p.alive) {
        this.fireT -= dt;
        if (this.fireT <= 0 && Math.abs(this.x - p.x) < 30 && this.x > 80) {
          this.fireT = 1.2;
          Bullets.eAdd({ x: this.x, y: this.y + 14, vx: 0, vy: 360, r: 6, dmg: 1, col: '#ff8a3a', kind: 'bomb' });
        }
      }

      if (this.x < -60 || this.y > H + 60 || this.y < -60) this.alive = false;
    }

    draw(ctx) {
      const spr = Art.get(this.sprite); if (!spr) return;
      const bob = (this.type === 'turret' || this.type === 'crawler') ? 0 : Math.sin(this.idle * 2) * 1.5;
      ctx.save(); ctx.translate(this.x, this.y + bob);
      if (this.tilt) ctx.rotate(this.tilt); // follow the terrain slope
      if (this.ceiling) ctx.scale(1, -1); // ceiling crawler hangs inverted
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
      if (this.hitFlash > 0) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.hitFlash / 0.08;
        ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
        // white tint
        ctx.globalAlpha = 0.7 * this.hitFlash / 0.08; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 0, this.w / 2, 0, U.TAU); ctx.fill();
      }
      ctx.restore();
    }
    get hitbox() { return { x: this.x, y: this.y, w: this.w * 0.7, h: this.h * 0.7 }; }
  }
  AV.Enemy = Enemy;

})(window);
