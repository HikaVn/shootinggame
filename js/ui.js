/* ASTRAL VANGUARD — ui.js
 * HUD (score / lives / power meter / boss HP), title screen, touch controls.
 */
(function (global) {
  'use strict';
  const AV = global.AV, U = AV.U;
  const W = AV.W, H = AV.H;

  const UI = AV.UI = {
    game: null, isTouch: false, t: 0, STICK_R: 70,

    init(game) {
      this.game = game;
      this.isTouch = ('ontouchstart' in global) || navigator.maxTouchPoints > 0;
      this._bindTouch(game.canvas);
      if (this.isTouch) document.body.classList.add('touch');
    },

    _toWorld(canvas, cx, cy) {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left) / r.width * W, y: (cy - r.top) / r.height * H };
    },

    _bindTouch(canvas) {
      const I = AV.Input; let moveId = null;
      const fireBtn = document.getElementById('btnFire'); const powBtn = document.getElementById('btnPower');
      if (fireBtn) {
        // FIRE is an auto-fire TOGGLE: tap to switch continuous fire on/off. The
        // outline blinks while auto-fire is on. Debounced so the touchstart +
        // synthesized mousedown of one tap doesn't toggle twice.
        let lastTg = 0;
        const toggle = (e) => {
          e.preventDefault(); const now = Date.now(); if (now - lastTg < 300) return; lastTg = now;
          I.auto = !I.auto; fireBtn.classList.toggle('pressed', I.auto);
          I._startTouch = true;                 // also advances title / continue screens
          AV.Audio.resume();
        };
        fireBtn.addEventListener('touchstart', toggle); fireBtn.addEventListener('mousedown', toggle);
      }
      if (powBtn) {
        // a tap: pulse the outline briefly so the press is acknowledged
        const pu = () => powBtn.classList.remove('pressed');
        const pd = (e) => { e.preventDefault(); I._powerPulse = true; powBtn.classList.add('pressed'); clearTimeout(powBtn._pt); powBtn._pt = setTimeout(pu, 220); AV.Audio.resume(); };
        powBtn.addEventListener('touchstart', pd); powBtn.addEventListener('mousedown', pd);
        powBtn.addEventListener('touchend', pu); powBtn.addEventListener('touchcancel', pu); powBtn.addEventListener('mouseup', pu);
      }
      const fullBtn = document.getElementById('btnFull');
      if (fullBtn) {
        // A tap fires BOTH touchstart and a synthesized click — toggling twice
        // (enter then exit) so nothing happened. Debounce so one tap = one toggle.
        let lastTg = 0;
        const tg = (e) => { e.preventDefault(); e.stopPropagation(); const now = Date.now(); if (now - lastTg < 600) return; lastTg = now; this.toggleFullscreen(); };
        fullBtn.addEventListener('touchend', tg, { passive: false }); fullBtn.addEventListener('click', tg);
      }
      // Floating virtual stick: the first touch anywhere on the canvas drops a
      // semi-transparent stick at that point; dragging from it steers the ship.
      const setStick = (cx, cy) => {
        const w = this._toWorld(canvas, cx, cy);
        let dx = w.x - I.touch.ox, dy = w.y - I.touch.oy;
        const len = Math.hypot(dx, dy);
        if (len > UI.STICK_R) { const s = UI.STICK_R / len; dx *= s; dy *= s; }
        I.touch.kx = I.touch.ox + dx; I.touch.ky = I.touch.oy + dy;
        const dead = 6;
        I.touch.vx = len < dead ? 0 : dx / UI.STICK_R;
        I.touch.vy = len < dead ? 0 : dy / UI.STICK_R;
      };
      const onStart = (e) => {
        AV.Audio.resume(); I._startTouch = true;
        // Entering play from a menu? use this gesture to go fullscreen so the
        // bottom power meter isn't clipped by the mobile browser chrome.
        const st = this.game && this.game.state;
        if (this.isTouch && (st === 'title' || st === 'gameover' || st === 'continue')) this.goFullscreen();
        for (const t of e.changedTouches) {
          if (moveId === null) {
            moveId = t.identifier; const w = this._toWorld(canvas, t.clientX, t.clientY);
            I.touch.active = true; I.touch.ox = w.x; I.touch.oy = w.y; I.touch.kx = w.x; I.touch.ky = w.y; I.touch.vx = 0; I.touch.vy = 0;
          }
        }
      };
      const onMove = (e) => {
        e.preventDefault();
        for (const t of e.touches) if (t.identifier === moveId) setStick(t.clientX, t.clientY);
      };
      const onEnd = (e) => {
        for (const t of e.changedTouches) if (t.identifier === moveId) { moveId = null; I.touch.active = false; I.touch.vx = 0; I.touch.vy = 0; }
      };
      canvas.addEventListener('touchstart', onStart, { passive: false });
      canvas.addEventListener('touchmove', onMove, { passive: false });
      canvas.addEventListener('touchend', onEnd); canvas.addEventListener('touchcancel', onEnd);
    },

    update() { this.t += 1 / 120; },

    goFullscreen() {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
      if (req && !(document.fullscreenElement || document.webkitFullscreenElement)) {
        try { const p = req.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) {}
      }
      try { if (screen.orientation && screen.orientation.lock) { const q = screen.orientation.lock('landscape'); if (q && q.catch) q.catch(() => {}); } } catch (e) {}
    },
    toggleFullscreen() {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs) { const ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) try { ex.call(document); } catch (e) {} }
      else this.goFullscreen();
    },

    drawHUD(ctx) {
      const g = this.game;
      if (g.state === 'title') return;
      ctx.save(); ctx.textBaseline = 'alphabetic';
      // top bar
      ctx.fillStyle = 'rgba(2,8,18,0.55)'; ctx.fillRect(0, 0, W, 34);
      ctx.fillStyle = '#7ef'; ctx.font = '16px Orbitron, monospace'; ctx.textAlign = 'left';
      ctx.fillText('SCORE ' + String(g.score).padStart(7, '0'), 12, 23);
      ctx.fillStyle = '#fd5'; ctx.fillText('HI ' + String(g.best).padStart(7, '0'), 230, 23);
      // lives
      ctx.fillStyle = '#cdeaff'; ctx.textAlign = 'right';
      ctx.fillText('STAGE ' + (g.stageIdx + 1) + '/3', W - 12, 23);
      ctx.textAlign = 'center';
      let lx = W / 2 - 60;
      ctx.fillStyle = '#9fe'; ctx.fillText('SHIPS', lx - 6, 23);
      for (let i = 0; i < Math.max(0, g.lives); i++) { this._miniShip(ctx, lx + 34 + i * 22, 16); }

      // combo / score multiplier
      if (g.mult > 1) {
        const cols = ['#7ef', '#9f9', '#fd5', '#fb6', '#f88', '#f6f', '#f6f'];
        const col = cols[Math.min(cols.length - 1, g.mult - 2)] || '#fd5';
        const fade = g.comboT < 0.6 ? g.comboT / 0.6 : 1;        // dim just before it lapses
        ctx.globalAlpha = fade; ctx.textAlign = 'left';
        ctx.font = '900 22px Orbitron, Arial Black, sans-serif';
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
        ctx.fillText('x' + g.mult, 12, 56);
        ctx.shadowBlur = 0; ctx.font = '12px Orbitron, monospace'; ctx.fillStyle = '#cdeaff';
        ctx.fillText(g.combo + ' CHAIN', 54, 56);
        ctx.globalAlpha = 1;
      }

      // power meter (Gradius style) bottom
      this._powerMeter(ctx);

      // boss HP
      if (g.boss && g.boss.alive && !g.boss.entering) this._bossBar(ctx, g.boss);
      // floating virtual stick
      if (AV.Input.touch.active) this._stick(ctx);
      ctx.restore();
    },

    _stick(ctx) {
      const t = AV.Input.touch, R = this.STICK_R;
      ctx.save();
      // base ring
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.arc(t.ox, t.oy, R, 0, U.TAU);
      ctx.fillStyle = 'rgba(120,180,255,0.10)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(150,200,255,0.35)'; ctx.stroke();
      // direction guide
      ctx.beginPath(); ctx.arc(t.ox, t.oy, R * 0.5, 0, U.TAU);
      ctx.strokeStyle = 'rgba(150,200,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
      // knob
      const g = ctx.createRadialGradient(t.kx, t.ky, 2, t.kx, t.ky, 30);
      g.addColorStop(0, 'rgba(200,230,255,0.55)'); g.addColorStop(0.7, 'rgba(90,160,255,0.40)'); g.addColorStop(1, 'rgba(40,90,200,0.10)');
      ctx.beginPath(); ctx.arc(t.kx, t.ky, 30, 0, U.TAU); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(190,225,255,0.6)'; ctx.stroke();
      ctx.restore();
    },

    _miniShip(ctx, x, y) {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#cfe0f2';
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -4); ctx.lineTo(-3, 0); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3df'; ctx.fillRect(-6, -1, 2, 2); ctx.restore();
    },

    _powerMeter(ctx) {
      const g = this.game; const p = g.player; if (!p) return;
      const slots = AV.SLOTS;
      // On touch the action buttons live in the bottom-right corner, so render a
      // compact, left-anchored meter that stays fully clear of them.
      const touch = this.isTouch;
      const SHORT = { SPEED: 'SPD', MISSILE: 'MSL', DOUBLE: 'DBL', SPREAD: 'SPR', LASER: 'LSR', OPTION: 'OPT', SHIELD: 'SHD' };
      const bh = touch ? 20 : 26, gap = touch ? 4 : 6;
      // On touch, span 80% of the width and centre it; on desktop, natural width.
      const total = touch ? W * 0.8 : slots.length * (96 + gap) - gap;
      const bw = (total - gap * (slots.length - 1)) / slots.length;
      const x0 = (W - total) / 2;
      const y0 = H - bh - 10;
      ctx.font = 'bold ' + (touch ? 11 : 12) + 'px Orbitron, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < slots.length; i++) {
        const x = x0 + i * (bw + gap); const active = i === p.cursor;
        const owned = this._owned(p, slots[i]);
        ctx.fillStyle = active ? 'rgba(255,80,80,0.9)' : owned ? 'rgba(40,120,160,0.55)' : 'rgba(20,30,46,0.6)';
        ctx.fillRect(x, y0, bw, bh);
        ctx.strokeStyle = active ? '#fff' : '#3a5a72'; ctx.lineWidth = active ? 2.5 : 1;
        if (active) { ctx.shadowColor = '#f55'; ctx.shadowBlur = 12; } ctx.strokeRect(x, y0, bw, bh); ctx.shadowBlur = 0;
        ctx.fillStyle = active ? '#fff' : owned ? '#bff' : '#7da';
        let suffix = '';
        if (slots[i] === 'SPEED' && p.speedLvl) suffix = ' ' + p.speedLvl;
        else if (slots[i] === 'MISSILE' && p.missileLvl) suffix = ' ' + p.missileLvl;
        else if (slots[i] === 'OPTION' && p.orbit) suffix = '○';
        const label = (touch ? SHORT[slots[i]] : slots[i]) + suffix;
        ctx.fillText(label, x + bw / 2, y0 + bh / 2 + 1);
      }
    },
    _owned(p, slot) {
      switch (slot) {
        case 'SPEED': return p.speedLvl > 0; case 'MISSILE': return p.missileLvl > 0;
        case 'DOUBLE': return p.weapon === 'double'; case 'SPREAD': return p.weapon === 'spread';
        case 'LASER': return p.weapon === 'laser'; case 'OPTION': return p.options.length > 0;
        case 'SHIELD': return p.shield > 0;
      } return false;
    },

    _bossBar(ctx, boss) {
      const x = 120, y = 40, w = W - 240, h = 14;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      const frac = Math.max(0, boss.hp / boss.maxhp);
      const grd = ctx.createLinearGradient(x, 0, x + w, 0);
      grd.addColorStop(0, '#ff3a3a'); grd.addColorStop(0.5, '#ff8a3a'); grd.addColorStop(1, '#ffd23a');
      ctx.fillStyle = grd; ctx.fillRect(x, y, w * frac, h);
      if (boss.coreFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (boss.coreFlash * 6) + ')'; ctx.fillRect(x, y, w * frac, h); }
      ctx.strokeStyle = '#fbb'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#fbb'; ctx.font = 'bold 14px Orbitron, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(boss.name, W / 2, y - 6);
    },

    drawTitle(ctx) {
      const g = this.game;
      // animated starfield bg already drawn? title uses its own
      ctx.save();
      const grd = ctx.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#070b1c'); grd.addColorStop(0.6, '#0e1838'); grd.addColorStop(1, '#1a0f2e');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
      // glow
      ctx.globalCompositeOperation = 'lighter';
      const r = ctx.createRadialGradient(W / 2, 200, 20, W / 2, 200, 360); r.addColorStop(0, 'rgba(80,160,255,0.35)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = r; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
      // scanline shimmer
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 2);
      ctx.font = '900 78px Orbitron, Arial Black, sans-serif';
      ctx.fillStyle = '#dff'; ctx.shadowColor = '#4af'; ctx.shadowBlur = 30 + pulse * 20;
      ctx.fillText('ASTRAL VANGUARD', W / 2, 180);
      ctx.shadowBlur = 0;
      ctx.font = '600 26px Orbitron, sans-serif'; ctx.fillStyle = '#ff8a4a';
      ctx.fillText('— IRON REQUIEM —', W / 2, 236);

      ctx.globalAlpha = pulse; ctx.font = '22px Orbitron, monospace'; ctx.fillStyle = '#fff';
      ctx.fillText(this.isTouch ? 'TAP TO LAUNCH' : 'PRESS  FIRE / ENTER  TO LAUNCH', W / 2, 330);
      ctx.globalAlpha = 1;

      ctx.font = '14px Orbitron, monospace'; ctx.fillStyle = '#9fd';
      const ctrls = this.isTouch
        ? ['TOUCH & DRAG anywhere — virtual stick', 'FIRE  toggle auto-fire', 'POWER  activate capsule upgrade']
        : ['ARROWS / WASD  move', 'Z / SPACE  fire (hold)', 'X / SHIFT  activate power-up', 'ESC  pause'];
      ctrls.forEach((c, i) => ctx.fillText(c, W / 2, 388 + i * 22));

      ctx.fillStyle = '#567'; ctx.font = '12px monospace';
      ctx.fillText('Collect red capsules → move the meter → press POWER. Gradius-style.', W / 2, H - 40);
      ctx.fillText('HI ' + String(g.best).padStart(7, '0'), W / 2, H - 20);
      ctx.restore();
    },
  };

})(window);
