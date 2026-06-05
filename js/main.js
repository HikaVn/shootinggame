/* ASTRAL VANGUARD — Iron Requiem : main.js
 * Game state machine, fixed-step loop, collisions, HUD, lives/continue, UI.
 */
(function (global) {
  'use strict';
  const AV = global.AV, U = AV.U, FX = AV.FX, Art = AV.Art, Audio = AV.Audio, Bullets = AV.Bullets;
  const W = AV.W, H = AV.H;

  const Game = AV.Game = {
    state: 'title',          // title | play | stageclear | gameover | continue | win | paused
    canvas: null, ctx: null,
    player: null, enemies: [], capsules: [], pressers: [], boss: null, terrain: null,
    stages: null, stageIdx: 0, clock: 0, evIdx: 0, _sid: 0,
    score: 0, best: 0, lives: 3, continues: 0,
    combo: 0, mult: 1, comboT: 0,
    banners: [], flashes: [], knownHazards: new Set(),
    respawnT: 0, clearT: 0, shake: 0, god: false, paused: false,
    lastHazard: null, started: false, bossActive: false,

    async init() {
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = true;
      Audio.init();
      await Audio.loadAssets();
      Art.buildProcedural();
      await Art.loadAssets();
      AV.Input.init(this.canvas, W, H);
      this.stages = AV.buildStages();
      try { this.best = +localStorage.getItem('av_best') || 0; } catch (e) {}
      try { (JSON.parse(localStorage.getItem('av_known') || '[]')).forEach((k) => this.knownHazards.add(k)); } catch (e) {}
      AV.UI.init(this);
      this.toTitle();
      this._last = performance.now(); this._acc = 0;
      requestAnimationFrame((t) => this.loop(t));
      global.addEventListener('blur', () => { if (this.state === 'play') this.paused = true; });
    },

    /* ---------------- state transitions ---------------- */
    toTitle() { this.state = 'title'; this.bossActive = false; Audio.playBGM('title'); },
    newGame() {
      this.score = 0; this.lives = 3; this.continues = 0; this.stageIdx = 0;
      this.loop = 0; this._applyDiff();
      this.player = new AV.Player(); this.startStage(0);
    },
    // Each completed loop ramps enemy/bullet speed and spawn counts by 1.2×.
    _applyDiff() { const m = Math.pow(1.2, this.loop || 0); AV.diff = { speed: m, count: m }; },
    startStage(idx) {
      this.stageIdx = idx; const st = this.stages[idx]; this._sid++;
      this.clock = 0; this.evIdx = 0; this.bossActive = false; this.boss = null;
      this.enemies.length = 0; this.capsules.length = 0; this.pressers.length = 0;
      Bullets.clear(); FX.clear(); FX.resetTimers();
      this.banners.length = 0; this.flashes.length = 0; this.resetCombo();
      this.bg = new AV.Background(st.id);
      this.terrain = new AV.Terrain(st.id);
      if (!this.player) this.player = new AV.Player();
      this.player.reset(false); this.player.alive = true; this.player.inv = 2;
      this.state = 'play'; this.banner(st.name, '#7ef', 2.2);
      Audio.playBGM('stage' + st.id);
    },
    startBoss() {
      if (this.bossActive) return;
      this.bossActive = true; this.boss = new AV.Boss(AV.BOSS_CFG[this.stages[this.stageIdx].boss], this);
      if (this.terrain) this.terrain.active = false;   // clear terrain for a fair boss arena
      this.banner('!! WARNING !!\n' + this.boss.name, '#f55', 2.6); Audio.sfx('warn'); Audio.playBGM('boss');
    },
    onBossDefeated() {
      this.addScore(5000); this.shake = 1.2; this.clearT = 4.2; this.state = 'stageclear';
      this.banner('STAGE CLEAR', '#7ef', 3.5); Audio.sfx('clear'); Audio.stopBGM();
    },
    onPlayerDeath() {
      this.shake = 1.0; this.resetCombo();
      if (this.lastHazard) { this.knownHazards.add(this.lastHazard); this._saveKnown(); }
      this.lives--; this.respawnT = 1.6;
    },

    /* ---------------- spawning / scoring ---------------- */
    addEnemy(e) { this.enemies.push(e); },
    addPresser(p) { this.pressers.push(p); },
    spawnCapsule(x, y, fake) { this.capsules.push(new AV.Capsule(x, y, fake)); },
    addScore(n) { this.score += n; if (this.score > this.best) { this.best = this.score; try { localStorage.setItem('av_best', this.best); } catch (e) {} } },
    // A kill bumps the chain; consecutive kills raise the multiplier (≤ x8).
    scoreKill(base, x, y) {
      this.combo++; this.comboT = 2.6;
      this.mult = Math.min(8, 1 + Math.floor(this.combo / 4));
      this.addScore(Math.round(base * this.mult));
      if (this.mult >= 2 && this.combo % 4 === 0 && x != null) FX.ring(x, y, '#ffd24a', 26, 2);
    },
    resetCombo() { this.combo = 0; this.mult = 1; this.comboT = 0; },
    // Difficulty "rank": rises with stage progress and how powered-up the ship
    // is, so a fully-equipped run still faces pressure. Capped & gentle.
    rank() {
      const p = this.player; if (!p) return this.stageIdx * 0.18;
      const pw = p.speedLvl + p.options.length + (p.weapon !== 'normal' ? 1 : 0) + p.missileLvl;
      return Math.min(1.2, this.stageIdx * 0.18 + pw * 0.06);
    },
    banner(text, color, life) { this.banners.push({ text, color: color || '#fff', life: life || 2, max: life || 2 }); },
    flash(text, color) { this.flashes.push({ text, color: color || '#7ef', life: 1.4, max: 1.4 }); },
    warnIfKnown(key, msg) { if (this.knownHazards.has(key)) { this.banner('⚠ ' + msg, '#fd5', 2.0); Audio.sfx('alarm'); } },
    warnOnce(key, msg) { this.banner('⚠ ' + msg, '#fd5', 1.4); },
    _saveKnown() { try { localStorage.setItem('av_known', JSON.stringify([...this.knownHazards])); } catch (e) {} },

    /* ---------------- main loop ---------------- */
    loop(t) {
      const dt = Math.min(0.05, (t - this._last) / 1000); this._last = t;
      this._acc += dt; const step = 1 / 120; let guard = 0;
      while (this._acc >= step && guard++ < 8) { this.update(step); this._acc -= step; }
      this.draw();
      AV.Input.endFrame();
      requestAnimationFrame((tt) => this.loop(tt));
    },

    update(dt) {
      AV.UI.update();
      this.banners.forEach((b) => b.life -= dt); this.banners = this.banners.filter((b) => b.life > 0);
      this.flashes.forEach((f) => f.life -= dt); this.flashes = this.flashes.filter((f) => f.life > 0);
      if (this.shake > 0) this.shake -= dt * 2;
      if (this.bg) this.bg.update(dt);
      if (this.terrain && this.state === 'play') this.terrain.update(dt);

      if (this.state === 'title') {
        if (AV.Input.fire || AV.Input.consumePressed('start') || AV.Input._startTouch) { AV.Input._startTouch = false; Audio.resume(); this.newGame(); }
        return;
      }
      if (this.state === 'paused') { if (AV.Input.consumePressed('pause')) { this.paused = false; this.state = 'play'; } return; }
      if (this.state === 'stageclear') {
        FX.update(dt);
        this.clearT -= dt;
        if (this.clearT <= 0) {
          if (this.stageIdx >= this.stages.length - 1) {
            // Cleared every stage → loop back into a harder run (1.2× speed & numbers).
            this.loop = (this.loop || 0) + 1; this._applyDiff();
            this.startStage(0);
            this.banner('HARD MODE  ×' + AV.diff.speed.toFixed(2) + '\nLOOP ' + (this.loop + 1), '#f55', 3.2);
            Audio.sfx('warn');
          } else this.startStage(this.stageIdx + 1);
        }
        return;
      }
      if (this.state === 'gameover') {
        if (AV.Input.consumePressed('start') || AV.Input.fire || AV.Input._startTouch) { AV.Input._startTouch = false; this.state = 'continue'; }
        return;
      }
      if (this.state === 'continue') {
        if (AV.Input.consumePressed('start') || AV.Input.fire || AV.Input._startTouch) { AV.Input._startTouch = false; this.continues++; this.lives = 3; this.score = 0; this.startStage(this.stageIdx); }
        return;
      }
      if (this.state === 'win') {
        if (AV.Input.consumePressed('start')) this.toTitle();
        FX.update(dt); return;
      }

      // ---- PLAY ----
      if (AV.Input.consumePressed('pause')) { this.paused = true; this.state = 'paused'; return; }

      // respawn handling
      if (!this.player.alive) {
        this.respawnT -= dt;
        FX.update(dt); Bullets.update(dt, this.terrain); this._updateActors(dt);
        if (this.respawnT <= 0) {
          if (this.lives < 0) { this.state = 'gameover'; this.banners.length = 0; Audio.stopBGM(); Audio.sfx('death'); }
          else { this.player.reset(false); this.player.alive = true; this.player.inv = 2.2; this.lastHazard = null; }
        }
        return;
      }

      // power activation
      if (AV.Input.consumePower()) this.player.applyPower(this);

      // advance timeline (until boss active)
      if (!this.bossActive) {
        this.clock += dt; const evs = this.stages[this.stageIdx].events;
        while (this.evIdx < evs.length && evs[this.evIdx].t <= this.clock) { evs[this.evIdx].fn(this); this.evIdx++; }
      }

      if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.resetCombo(); }
      this.player.update(dt, this);
      this._updateActors(dt);
      Bullets.update(dt, this.terrain);
      FX.update(dt);
      this._collisions(dt);
    },

    _updateActors(dt) {
      for (const e of this.enemies) e.update(dt, this);
      for (const c of this.capsules) c.update(dt);
      for (const p of this.pressers) p.update(dt, this);
      if (this.boss) this.boss.update(dt, this);
      this.enemies = this.enemies.filter((e) => e.alive);
      this.capsules = this.capsules.filter((c) => c.alive);
      this.pressers = this.pressers.filter((p) => p.alive);
      if (this.boss && !this.boss.alive && this.boss.deathT <= 0) this.boss = null;
    },

    _collisions() {
      const p = this.player;
      // player bullets -> enemies / boss
      for (let i = Bullets.player.length - 1; i >= 0; i--) {
        const b = Bullets.player[i]; let consumed = false;
        const bb = { x: b.x, y: b.y, w: (b.r || 3) * 2, h: (b.r || 3) * 2 };
        for (const e of this.enemies) {
          if (e.alive && U.aabb(bb, e.hitbox)) { e.damage(b.dmg, this); if (!b.pierce) { consumed = true; } break; }
        }
        if (!consumed && this.boss) { const r = this.boss.onBulletHit(b); if (r && r.consumed) consumed = true; }
        if (consumed) Bullets.player.splice(i, 1);
      }
      if (!p.alive) return;
      // enemy bullets -> player
      const ph = p.hitbox;
      for (let i = Bullets.enemy.length - 1; i >= 0; i--) {
        const b = Bullets.enemy[i];
        if (U.aabb({ x: b.x, y: b.y, w: (b.r || 4), h: (b.r || 4) }, ph)) { Bullets.enemy.splice(i, 1); if (!this.god) p.hit(this); }
      }
      // enemy bodies -> player
      for (const e of this.enemies) {
        if (e.alive && U.aabb(ph, e.hitbox)) {
          this.lastHazard = e.hazardKey || null;
          if (!this.god) p.hit(this);
          if (e.type !== 'debris') e.die(this); else e.damage(2, this);
          break;
        }
      }
      // capsules -> collect
      for (const c of this.capsules) {
        if (c.alive && U.aabb(ph, c.hitbox)) {
          if (c.fake) { c.alive = false; FX.explosion(c.x, c.y, 1.1); this.lastHazard = 'fake'; if (!this.god) p.hit(this); }
          else { c.alive = false; p.collectCapsule(); FX.ring(c.x, c.y, '#f88', 36, 3); }
        }
      }
      // pressers -> player
      for (const pr of this.pressers) { if (pr.hits(p)) { this.lastHazard = pr.hazardKey; if (!this.god) p.hit(this); } }
      // lethal terrain -> player
      if (this.terrain && this.terrain.hits(p)) { this.lastHazard = 'terrain'; if (!this.god) p.hit(this); }
      // boss body -> player
      if (this.boss && this.boss.alive && !this.boss.entering) { if (U.aabb(ph, this.boss.bodyHitbox())) { this.lastHazard = 'boss'; if (!this.god) p.hit(this); } }
    },

    /* ---------------- rendering ---------------- */
    draw() {
      const ctx = this.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      if (this.bg) this.bg.draw(ctx); else { ctx.fillStyle = '#04060f'; ctx.fillRect(0, 0, W, H); }
      if (this.terrain) this.terrain.draw(ctx);

      if (this.shake > 0) { ctx.save(); const s = this.shake * 8; ctx.translate(U.rand(-s, s), U.rand(-s, s)); }

      // world
      for (const pr of this.pressers) pr.draw(ctx);
      for (const e of this.enemies) e.draw(ctx);
      for (const c of this.capsules) c.draw(ctx);
      if (this.boss) this.boss.draw(ctx);
      Bullets.draw(ctx);
      if (this.player && (this.state === 'play' || this.state === 'stageclear')) this.player.draw(ctx);
      FX.draw(ctx);

      if (this.shake > 0) ctx.restore();

      AV.UI.drawHUD(ctx);
      this._drawOverlays(ctx);
    },

    _drawOverlays(ctx) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (this.state === 'title') return AV.UI.drawTitle(ctx);
      if (this.state === 'paused') { this._dim(ctx, 0.5); this._big(ctx, 'PAUSED', W / 2, H / 2, 48, '#fff'); this._sub(ctx, 'press ESC to resume', W / 2, H / 2 + 44); }
      if (this.state === 'gameover') { this._dim(ctx, 0.6); this._big(ctx, 'GAME OVER', W / 2, H / 2 - 20, 56, '#f55'); this._sub(ctx, 'press FIRE / ENTER', W / 2, H / 2 + 40); }
      if (this.state === 'continue') { this._dim(ctx, 0.6); this._big(ctx, 'CONTINUE?', W / 2, H / 2 - 30, 50, '#fd5'); this._sub(ctx, 'FIRE = restart stage  (infinite continues)', W / 2, H / 2 + 30); this._sub(ctx, 'Continues used: ' + this.continues, W / 2, H / 2 + 58); }
      if (this.state === 'win') { this._dim(ctx, 0.55); this._big(ctx, 'MISSION COMPLETE', W / 2, H / 2 - 30, 46, '#7ef'); this._sub(ctx, 'You silenced the Iron Requiem.', W / 2, H / 2 + 16); this._sub(ctx, 'SCORE ' + this.score + '   ·   ENTER for title', W / 2, H / 2 + 48); }

      // banners (center)
      let by = 150;
      for (const b of this.banners) {
        const a = Math.min(1, b.life * 2); ctx.globalAlpha = a;
        b.text.split('\n').forEach((ln, i) => this._big(ctx, ln, W / 2, by + i * 40, 34, b.color));
        ctx.globalAlpha = 1; by += 20;
      }
      // flashes (powerup feedback near player)
      for (const f of this.flashes) { ctx.globalAlpha = Math.min(1, f.life * 2); this._sub(ctx, f.text, W / 2, H - 120, f.color, 20); ctx.globalAlpha = 1; }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    },
    _dim(ctx, a) { ctx.fillStyle = 'rgba(2,4,12,' + a + ')'; ctx.fillRect(0, 0, W, H); },
    _big(ctx, t, x, y, size, col) { ctx.font = '900 ' + size + 'px Orbitron, Arial Black, sans-serif'; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 18; ctx.fillText(t, x, y); ctx.shadowBlur = 0; },
    _sub(ctx, t, x, y, col, size) { ctx.font = (size || 16) + 'px Orbitron, monospace'; ctx.fillStyle = col || '#cdeaff'; ctx.fillText(t, x, y); },

    /* ---------------- debug / test API ---------------- */
    gotoStage(n) { this.player = this.player || new AV.Player(); this.startStage(U.clamp(n, 0, this.stages.length - 1)); },
    warpToBoss() { if (this.state !== 'play') return; this.enemies.length = 0; this.pressers.length = 0; this.clock = 9999; this.evIdx = 1e9; this.startBoss(); },
    toggleGod() { this.god = !this.god; this.banner('GOD ' + (this.god ? 'ON' : 'OFF'), '#7ef', 1.2); return this.god; },
    maxPower() { const p = this.player; p.speedLvl = 3; p.missileLvl = 3; p.weapon = 'laser'; p.options = [{}, {}]; p.shield = 16; p.shieldMax = 16; },
  };

  global.addEventListener('DOMContentLoaded', () => Game.init());

})(window);
