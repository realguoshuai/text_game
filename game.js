/* 凡人修仙录 · 实时版（竖切 demo）
 * 原生 Canvas 2D，零依赖、零构建。弱机友好：实体数量有上限、固定时间步、无重特效。
 * 操控：WASD / 方向键 移动，J / 空格 发飞剑；手机用屏幕按钮。
 */
(() => {
  'use strict';

  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ---------- 视口 ----------
  let VW = 0, VH = 0;
  function resize() {
    VW = cv.clientWidth || window.innerWidth;
    VH = cv.clientHeight || window.innerHeight;
    cv.width = VW; cv.height = VH;
  }
  window.addEventListener('resize', resize);

  // ---------- 世界 ----------
  const WORLD = { w: 1760, h: 1280 };

  // 预生成洞窟装饰（晶簇），一次性，绘制时只读取
  const deco = [];
  for (let i = 0; i < 46; i++) {
    deco.push({
      x: Math.random() * WORLD.w,
      y: Math.random() * WORLD.h,
      c: Math.random() < 0.5 ? '#3a2f6b' : '#236b5d',
      r: 5 + Math.random() * 12,
      glow: Math.random() < 0.4
    });
  }

  // ---------- 输入 ----------
  const keys = { up: false, down: false, left: false, right: false, attack: false };
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'attack', KeyJ: 'attack', KeyK: 'attack'
  };
  addEventListener('keydown', e => { if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); } });
  addEventListener('keyup', e => { if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = false; e.preventDefault(); } });

  function bindBtn(id, act) {
    const el = document.getElementById(id);
    if (!el) return;
    const on = e => { keys[act] = true; e.preventDefault(); };
    const off = e => { keys[act] = false; e.preventDefault(); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('pointercancel', off);
  }
  bindBtn('btn-atk', 'attack');

  // 触屏设备显示屏幕按钮
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch');
  }

  // ---------- 虚拟摇杆（圆盘拖动） ----------
  const joy = { active: false, x: 0, y: 0, id: null };
  const joyEl = document.getElementById('joystick');
  const joyKnob = document.getElementById('joy-knob');
  const JOY_R = 46;
  function joyMove(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    const rect = joyEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
    joy.x = dx / JOY_R; joy.y = dy / JOY_R;
    joyKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  function joyStart(e) {
    joy.active = true; joy.id = e.pointerId;
    if (joyEl.setPointerCapture) { try { joyEl.setPointerCapture(e.pointerId); } catch (_) {} }
    joyMove(e); e.preventDefault();
  }
  function joyEnd(e) {
    if (e.pointerId !== joy.id) return;
    joy.active = false; joy.x = 0; joy.y = 0; joy.id = null;
    joyKnob.style.transform = 'translate(0px,0px)';
  }
  if (joyEl) {
    joyEl.addEventListener('pointerdown', joyStart);
    joyEl.addEventListener('pointermove', joyMove);
    joyEl.addEventListener('pointerup', joyEnd);
    joyEl.addEventListener('pointercancel', joyEnd);
    joyEl.addEventListener('pointerleave', joyEnd);
  }

  // 屏幕右半边点按 = 出剑（手机更直觉，桌面也可）
  cv.addEventListener('pointerdown', e => { if (e.clientX > cv.clientWidth / 2) keys.attack = true; });
  cv.addEventListener('pointerup', e => { if (e.clientX > cv.clientWidth / 2) keys.attack = false; });

  // ---------- 玩家 ----------
  const player = {
    x: WORLD.w / 2, y: WORLD.h / 2, w: 22, h: 30,
    speed: 158, hp: 100, maxhp: 100, face: 1, atkCd: 0, inv: 0,
    dead: false, respawn: 0, anim: 0
  };
  let herbs = 0, kills = 0;

  // ---------- 妖兽 ----------
  function spawnMonster() {
    const edge = Math.random() * 4 | 0;
    let x, y;
    if (edge === 0) { x = Math.random() * WORLD.w; y = 24; }
    else if (edge === 1) { x = Math.random() * WORLD.w; y = WORLD.h - 24; }
    else if (edge === 2) { x = 24; y = Math.random() * WORLD.h; }
    else { x = WORLD.w - 24; y = Math.random() * WORLD.h; }
    const tier = Math.random() < 0.3 ? 1 : 0;
    return {
      x, y, w: 26, h: 26,
      hp: tier ? 44 : 26, maxhp: tier ? 44 : 26,
      speed: tier ? 74 : 56, dmg: tier ? 15 : 9,
      wander: 0, dx: 0, dy: 0, tier, hit: 0, anim: Math.random() * 6
    };
  }
  let monsters = [];
  for (let i = 0; i < 4; i++) monsters.push(spawnMonster());

  // ---------- 灵草 ----------
  let herbsList = [];
  function spawnHerb() {
    herbsList.push({ x: 60 + Math.random() * (WORLD.w - 120), y: 60 + Math.random() * (WORLD.h - 120), t: Math.random() * 6 });
  }
  for (let i = 0; i < 8; i++) spawnHerb();

  // ---------- 飞剑 ----------
  let swords = [];

  // ---------- 相机 ----------
  const cam = { x: 0, y: 0 };

  // ---------- 碰撞 ----------
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- HUD 缓存 ----------
  const elHp = document.getElementById('hp-fill');
  const elHerb = document.getElementById('herb-val');
  const elKill = document.getElementById('kill-val');
  const elRealm = document.getElementById('realm-val');
  const elDeath = document.getElementById('death');
  function realm(k) { return k < 3 ? '炼气期' : k < 7 ? '筑基期' : k < 12 ? '金丹期' : '元婴期'; }

  // ---------- 更新 ----------
  let last = performance.now();
  function update(dt) {
    if (player.dead) {
      player.respawn -= dt;
      if (player.respawn <= 0) {
        player.dead = false; player.hp = player.maxhp;
        player.x = WORLD.w / 2; player.y = WORLD.h / 2;
      }
      return;
    }
    player.anim += dt;

    // 移动（键盘 + 摇杆）
    let mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (joy.active) { mx = joy.x; my = joy.y; }
    if (mx || my) {
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      if (mx) player.face = mx > 0 ? 1 : -1;
    }
    player.x = Math.max(0, Math.min(WORLD.w - player.w, player.x + mx * player.speed * dt));
    player.y = Math.max(0, Math.min(WORLD.h - player.h, player.y + my * player.speed * dt));

    // 攻击
    player.atkCd -= dt;
    if (keys.attack && player.atkCd <= 0) {
      player.atkCd = 0.33;
      swords.push({ x: player.x + player.w / 2, y: player.y + player.h / 2, vx: player.face * 440, vy: 0, life: 1.1 });
    }
    if (player.inv > 0) player.inv -= dt;

    // 飞剑
    for (let i = swords.length - 1; i >= 0; i--) {
      const s = swords[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0 || s.x < 0 || s.x > WORLD.w || s.y < 0 || s.y > WORLD.h) { swords.splice(i, 1); continue; }
      for (let j = monsters.length - 1; j >= 0; j--) {
        const m = monsters[j];
        if (aabb({ x: s.x - 7, y: s.y - 7, w: 14, h: 14 }, m)) {
          m.hp -= 13; m.hit = 0.12; swords.splice(i, 1);
          if (m.hp <= 0) {
            monsters.splice(j, 1); kills++;
            herbsList.push({ x: m.x, y: m.y, t: 0 });
            monsters.push(spawnMonster());
          }
          break;
        }
      }
    }

    // 妖兽 AI
    for (const m of monsters) {
      m.anim += dt;
      const dx = player.x - m.x, dy = player.y - m.y, d = Math.hypot(dx, dy);
      if (d < 280) {
        const l = Math.max(1, d); m.dx = dx / l; m.dy = dy / l;
      } else {
        m.wander -= dt;
        if (m.wander <= 0) {
          m.wander = 0.6 + Math.random() * 1.6;
          const a = Math.random() * 6.283; m.dx = Math.cos(a); m.dy = Math.sin(a);
        }
      }
      m.x = Math.max(0, Math.min(WORLD.w - m.w, m.x + m.dx * m.speed * dt));
      m.y = Math.max(0, Math.min(WORLD.h - m.h, m.y + m.dy * m.speed * dt));
      if (m.hit > 0) m.hit -= dt;
      if (aabb(player, m) && player.inv <= 0) {
        player.hp -= m.dmg; player.inv = 0.8;
        if (player.hp <= 0) { player.hp = 0; player.dead = true; player.respawn = 1.6; }
      }
    }

    // 灵草拾取
    for (let i = herbsList.length - 1; i >= 0; i--) {
      const h = herbsList[i];
      if (aabb(player, { x: h.x - 12, y: h.y - 12, w: 24, h: 24 })) {
        herbsList.splice(i, 1); herbs++;
        if (herbsList.length < 6) spawnHerb();
      }
    }

    // 相机
    cam.x = WORLD.w <= VW ? (WORLD.w - VW) / 2 : Math.max(0, Math.min(WORLD.w - VW, player.x + player.w / 2 - VW / 2));
    cam.y = WORLD.h <= VH ? (WORLD.h - VH) / 2 : Math.max(0, Math.min(WORLD.h - VH, player.y + player.h / 2 - VH / 2));
  }

  // ---------- 绘制 ----------
  function drawPlayer() {
    const p = player;
    const bob = Math.sin(p.anim * 8) * (keys.up || keys.down || keys.left || keys.right ? 1.5 : 0);
    const x = Math.round(p.x), y = Math.round(p.y + bob);
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 2, y + p.h - 2, p.w - 4, 4);
    // 法袍
    ctx.fillStyle = p.inv > 0 && (Math.floor(p.anim * 20) % 2) ? '#b0b0d0' : '#4a3b8c';
    ctx.fillRect(x, y + 10, p.w, p.h - 10);
    // 腰带
    ctx.fillStyle = '#caa84a';
    ctx.fillRect(x, y + 18, p.w, 3);
    // 头
    ctx.fillStyle = '#e8c9a0';
    ctx.fillRect(x + 4, y, p.w - 8, 10);
    // 发髻
    ctx.fillStyle = '#2a2238';
    ctx.fillRect(x + 5, y - 2, p.w - 10, 4);
    // 飞剑（背/手）
    ctx.fillStyle = '#cfe8ff';
    if (p.face > 0) ctx.fillRect(x + p.w - 2, y + 8, 12, 3);
    else ctx.fillRect(x - 10, y + 8, 12, 3);
  }

  function drawMonster(m) {
    const x = Math.round(m.x), y = Math.round(m.y + Math.sin(m.anim * 6) * 1.5);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 2, y + m.h - 2, m.w - 4, 4);
    ctx.fillStyle = m.hit > 0 ? '#ffffff' : (m.tier ? '#7a2b3a' : '#5a3a7a');
    ctx.fillRect(x, y, m.w, m.h);
    // 角
    ctx.fillStyle = '#2a1830';
    ctx.fillRect(x + 3, y - 4, 3, 4);
    ctx.fillRect(x + m.w - 6, y - 4, 3, 4);
    // 眼
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(x + 6, y + 9, 4, 4);
    ctx.fillRect(x + m.w - 10, y + 9, 4, 4);
    // 血条
    const w = m.w, hpr = m.hp / m.maxhp;
    ctx.fillStyle = '#300';
    ctx.fillRect(x, y - 8, w, 3);
    ctx.fillStyle = '#e0464f';
    ctx.fillRect(x, y - 8, Math.round(w * hpr), 3);
  }

  function drawHerb(h) {
    const pulse = 0.6 + 0.4 * Math.sin(h.t * 3 + performance.now() / 400);
    ctx.fillStyle = `rgba(80,220,140,${0.25 * pulse})`;
    ctx.fillRect(Math.round(h.x - 12), Math.round(h.y - 12), 24, 24);
    ctx.fillStyle = '#46d98a';
    ctx.fillRect(Math.round(h.x - 3), Math.round(h.y - 6), 6, 12);
    ctx.fillStyle = '#bff7d6';
    ctx.fillRect(Math.round(h.x - 1), Math.round(h.y - 4), 2, 6);
  }

  function render() {
    // 背景
    ctx.fillStyle = '#0d0b1a';
    ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));

    // 地面网格
    ctx.strokeStyle = 'rgba(120,110,180,0.10)';
    ctx.lineWidth = 1;
    const step = 64;
    const sx = Math.floor(cam.x / step) * step, sy = Math.floor(cam.y / step) * step;
    ctx.beginPath();
    for (let gx = sx; gx < cam.x + VW + step; gx += step) { ctx.moveTo(gx, cam.y); ctx.lineTo(gx, cam.y + VH); }
    for (let gy = sy; gy < cam.y + VH + step; gy += step) { ctx.moveTo(cam.x, gy); ctx.lineTo(cam.x + VW, gy); }
    ctx.stroke();

    // 晶簇
    for (const d of deco) {
      if (d.x < cam.x - 20 || d.x > cam.x + VW + 20 || d.y < cam.y - 20 || d.y > cam.y + VH + 20) continue;
      if (d.glow) { ctx.fillStyle = d.c; ctx.globalAlpha = 0.18; ctx.fillRect(d.x - d.r - 4, d.y - d.r - 4, (d.r + 4) * 2, (d.r + 4) * 2); ctx.globalAlpha = 1; }
      ctx.fillStyle = d.c;
      ctx.fillRect(Math.round(d.x - d.r / 2), Math.round(d.y - d.r), d.r, d.r * 2);
    }

    for (const h of herbsList) drawHerb(h);
    for (const m of monsters) drawMonster(m);
    for (const s of swords) {
      ctx.fillStyle = 'rgba(140,210,255,0.35)';
      ctx.fillRect(Math.round(s.x - 16), Math.round(s.y - 5), 32, 10);
      ctx.fillStyle = '#cfe8ff';
      ctx.fillRect(Math.round(s.x - 11), Math.round(s.y - 2), 22, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(s.x + (s.vx > 0 ? 8 : -12)), Math.round(s.y - 2), 4, 4);
    }
    if (!player.dead) drawPlayer();

    ctx.restore();

    // HUD
    elHp.style.width = (player.hp / player.maxhp * 100) + '%';
    elHerb.textContent = herbs;
    elKill.textContent = kills;
    elRealm.textContent = realm(kills);
    elDeath.style.display = player.dead ? 'flex' : 'none';
  }

  // ---------- 主循环 ----------
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  resize();
  requestAnimationFrame(loop);
})();
