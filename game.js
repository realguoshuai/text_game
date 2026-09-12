/* 凡人修仙录 · 实时版
 * 原生 Canvas 2D，零依赖、零构建。弱机友好：实体数量有上限、dt 钳制、无重特效。
 * 操控：WASD / 方向键 移动，J / 空格 发飞剑；手机：左半屏拖动=浮动摇杆，右半屏点按=出剑，飞剑钮可拖动摆放。
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

  // ---------- 浮动摇杆（左半屏触点出现，不固定位置） ----------
  const joy = { active: false, x: 0, y: 0, id: null };
  const joyEl = document.getElementById('joystick');
  const joyKnob = document.getElementById('joy-knob');
  const JOY_R = 48;
  function joyStart(e) {
    if (e.clientX > cv.clientWidth / 2) return; // 右半屏留给出剑
    joy.active = true; joy.id = e.pointerId;
    const size = joyEl.offsetWidth || 120;
    joyEl.style.left = (e.clientX - size / 2) + 'px';
    joyEl.style.top = (e.clientY - size / 2) + 'px';
    joyEl.style.right = 'auto'; joyEl.style.bottom = 'auto';
    joyEl.style.display = 'block';
    joyKnob.style.transform = 'translate(0px,0px)';
    joyMove(e); e.preventDefault();
  }
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
  function joyEnd(e) {
    if (e.pointerId !== joy.id) return;
    joy.active = false; joy.x = 0; joy.y = 0; joy.id = null;
    joyKnob.style.transform = 'translate(0px,0px)';
    joyEl.style.display = 'none';
  }
  cv.addEventListener('pointerdown', e => {
    if (e.clientX > cv.clientWidth / 2) { keys.attack = true; }
    else { joyStart(e); }
  });
  cv.addEventListener('pointerup', e => { if (e.clientX > cv.clientWidth / 2) keys.attack = false; });
  window.addEventListener('pointermove', joyMove);
  window.addEventListener('pointerup', joyEnd);
  window.addEventListener('pointercancel', joyEnd);

  // ---------- 飞剑钮（半透明、可拖动摆放） ----------
  const btnAtk = document.getElementById('btn-atk');
  let atkDrag = false, atkMoved = false, atkSX = 0, atkSY = 0, atkOX = 0, atkOY = 0;
  function restoreAtkPos() {
    try {
      const p = JSON.parse(localStorage.getItem('atkPos') || 'null');
      if (p && p.left && p.top) { btnAtk.style.left = p.left; btnAtk.style.top = p.top; btnAtk.style.right = 'auto'; btnAtk.style.bottom = 'auto'; }
    } catch (_) {}
  }
  restoreAtkPos();
  btnAtk.addEventListener('pointerdown', e => {
    keys.attack = true; atkDrag = true; atkMoved = false;
    atkSX = e.clientX; atkSY = e.clientY;
    const r = btnAtk.getBoundingClientRect(); atkOX = r.left; atkOY = r.top;
    if (btnAtk.setPointerCapture) { try { btnAtk.setPointerCapture(e.pointerId); } catch (_) {} }
    e.preventDefault(); e.stopPropagation();
  });
  btnAtk.addEventListener('pointermove', e => {
    if (!atkDrag) return;
    const dx = e.clientX - atkSX, dy = e.clientY - atkSY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) atkMoved = true;
    if (atkMoved) {
      keys.attack = false;
      btnAtk.style.left = (atkOX + dx) + 'px';
      btnAtk.style.top = (atkOY + dy) + 'px';
      btnAtk.style.right = 'auto'; btnAtk.style.bottom = 'auto';
    }
  });
  btnAtk.addEventListener('pointerup', e => {
    atkDrag = false; keys.attack = false;
    if (atkMoved) { try { localStorage.setItem('atkPos', JSON.stringify({ left: btnAtk.style.left, top: btnAtk.style.top })); } catch (_) {} }
    e.preventDefault();
  });

  // 触屏设备做自适应标记
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch');
  }

  // ---------- 妖兽种类（各有形状，非方块） ----------
  const MTYPE = {
    wolf:    { name: '妖狼', hp: 26, speed: 60, dmg: 9,  w: 32, h: 26, color: '#6b6f7a' },
    spider:  { name: '毒蛛', hp: 20, speed: 52, dmg: 7,  w: 30, h: 24, color: '#7a4f9e' },
    toad:    { name: '火蟾', hp: 48, speed: 40, dmg: 14, w: 36, h: 28, color: '#c8623a' },
    ghost:   { name: '鬼面', hp: 18, speed: 82, dmg: 8,  w: 26, h: 30, color: '#bfe3ff' },
    serpent: { name: '灵蛇', hp: 30, speed: 96, dmg: 11, w: 34, h: 20, color: '#3fae5a' }
  };
  let uid = 0;
  function spawnMonster() {
    const edge = Math.random() * 4 | 0;
    let x, y;
    if (edge === 0) { x = Math.random() * WORLD.w; y = 24; }
    else if (edge === 1) { x = Math.random() * WORLD.w; y = WORLD.h - 24; }
    else if (edge === 2) { x = 24; y = Math.random() * WORLD.h; }
    else { x = WORLD.w - 24; y = Math.random() * WORLD.h; }
    // 后期出现更强种类
    let type;
    const r = Math.random();
    if (kills < 5) type = r < 0.5 ? 'wolf' : 'spider';
    else if (kills < 12) type = r < 0.4 ? 'wolf' : r < 0.7 ? 'spider' : 'toad';
    else type = ['wolf', 'spider', 'toad', 'ghost', 'serpent'][Math.floor(Math.random() * 5)];
    const d = MTYPE[type];
    return {
      id: ++uid, type, x, y, w: d.w, h: d.h, color: d.color,
      hp: d.hp, maxhp: d.hp, speed: d.speed, dmg: d.dmg,
      wander: 0, dx: 0, dy: 0, hit: 0, anim: Math.random() * 6
    };
  }
  let monsters = [];
  let herbs = 0, kills = 0;
  for (let i = 0; i < 5; i++) monsters.push(spawnMonster());

  // ---------- 物品（灵草 / 灵石 / 丹药，各有形状） ----------
  let items = [];
  function spawnItem() {
    const r = Math.random();
    const kind = r < 0.6 ? 'herb' : r < 0.85 ? 'stone' : 'pill';
    items.push({
      x: 60 + Math.random() * (WORLD.w - 120),
      y: 60 + Math.random() * (WORLD.h - 120),
      kind, t: Math.random() * 6
    });
  }
  for (let i = 0; i < 8; i++) spawnItem();

  // ---------- 飞剑 ----------
  let swords = [];

  // ---------- 玩家 ----------
  const player = {
    x: WORLD.w / 2, y: WORLD.h / 2, w: 22, h: 30,
    speed: 158, hp: 100, maxhp: 100, face: 1, atkCd: 0, inv: 0,
    dead: false, respawn: 0, anim: 0
  };
  // ---------- 相机 ----------
  const cam = { x: 0, y: 0 };

  // ---------- 碰撞 ----------
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- 飞剑进化（按境界） ----------
  // 炼气:单锋 -> 筑基:双锋 -> 金丹:追魂三剑 -> 元婴:追魂巨剑 -> 化神:五雷追魂
  function swordCfg() {
    if (kills < 3)  return { count: 1, spread: 0,    homing: false, speed: 440, dmg: 13, life: 1.1, size: 1.0,  pierce: false, cd: 0.34 };
    if (kills < 7)  return { count: 2, spread: 0.20, homing: false, speed: 480, dmg: 14, life: 1.2, size: 1.1,  pierce: false, cd: 0.32 };
    if (kills < 12) return { count: 3, spread: 0.26, homing: true,  speed: 520, dmg: 15, life: 1.5, size: 1.1,  pierce: false, cd: 0.30 };
    if (kills < 20) return { count: 3, spread: 0.30, homing: true,  speed: 620, dmg: 18, life: 1.7, size: 1.3,  pierce: false, cd: 0.28 };
    return                { count: 5, spread: 0.36, homing: true,  speed: 700, dmg: 21, life: 1.9, size: 1.45, pierce: true,  cd: 0.26 };
  }
  function realmInfo() {
    if (kills < 3)  return { name: '炼气期', skill: '单锋剑' };
    if (kills < 7)  return { name: '筑基期', skill: '双锋剑' };
    if (kills < 12) return { name: '金丹期', skill: '追魂三剑' };
    if (kills < 20) return { name: '元婴期', skill: '追魂巨剑' };
    return                { name: '化神期', skill: '五雷追魂' };
  }
  const TIER_KILLS = [3, 7, 12, 20];
  let lastTierIdx = 0;

  // ---------- HUD 缓存 ----------
  const elHp = document.getElementById('hp-fill');
  const elHerb = document.getElementById('herb-val');
  const elKill = document.getElementById('kill-val');
  const elRealm = document.getElementById('realm-val');
  const elDeath = document.getElementById('death');
  const elToast = document.getElementById('toast');
  let toastT = 0;

  function nearestMonster(x, y) {
    let best = null, bd = 1e9;
    for (const m of monsters) {
      const d = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

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

    // 移动（键盘 + 浮动摇杆）
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

    // 攻击（飞剑进化）
    player.atkCd -= dt;
    if (keys.attack && player.atkCd <= 0) {
      const cfg = swordCfg();
      player.atkCd = cfg.cd;
      const base = player.face > 0 ? 0 : Math.PI;
      for (let i = 0; i < cfg.count; i++) {
        const off = (i - (cfg.count - 1) / 2) * cfg.spread;
        const a = base + off;
        const sp = cfg.speed;
        swords.push({
          x: player.x + player.w / 2, y: player.y + player.h / 2,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: cfg.life, dmg: cfg.dmg, homing: cfg.homing,
          size: cfg.size, pierce: cfg.pierce, hit: new Set()
        });
      }
    }
    if (player.inv > 0) player.inv -= dt;

    // 飞剑推进
    for (let i = swords.length - 1; i >= 0; i--) {
      const s = swords[i];
      if (s.homing) {
        const t = nearestMonster(s.x, s.y);
        if (t) {
          const want = Math.atan2(t.y - s.y, t.x - s.x);
          const cur = Math.atan2(s.vy, s.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          const turn = Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
          const na = cur + turn, sp = Math.hypot(s.vx, s.vy);
          s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
        }
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0 || s.x < -20 || s.x > WORLD.w + 20 || s.y < -20 || s.y > WORLD.h + 20) { swords.splice(i, 1); continue; }
      for (let j = monsters.length - 1; j >= 0; j--) {
        const m = monsters[j];
        if (s.hit.has(m.id)) continue;
        if (aabb({ x: s.x - 9, y: s.y - 9, w: 18, h: 18 }, m)) {
          m.hp -= s.dmg; m.hit = 0.12;
          if (!s.pierce) { swords.splice(i, 1); }
          else s.hit.add(m.id);
          if (m.hp <= 0) {
            monsters.splice(j, 1); kills++;
            items.push({ x: m.x, y: m.y, kind: ['herb', 'herb', 'stone', 'pill'][Math.floor(Math.random() * 4)], t: 0 });
            monsters.push(spawnMonster());
            // 突破提示
            while (lastTierIdx < TIER_KILLS.length && kills >= TIER_KILLS[lastTierIdx]) {
              const info = realmInfo();
              elToast.textContent = '突破！' + info.name + ' · ' + info.skill;
              elToast.style.display = 'block'; toastT = 2.2;
              lastTierIdx++;
            }
          }
          if (!s.pierce) break;
        }
      }
    }

    // 妖兽 AI
    for (const m of monsters) {
      m.anim += dt;
      const dx = player.x - m.x, dy = player.y - m.y, d = Math.hypot(dx, dy);
      const chase = m.type === 'ghost' ? 230 : 300;
      if (d < chase) {
        const l = Math.max(1, d); m.dx = dx / l; m.dy = dy / l;
      } else {
        m.wander -= dt;
        if (m.wander <= 0) {
          m.wander = (m.type === 'ghost' ? 0.3 : 0.6) + Math.random() * (m.type === 'ghost' ? 0.6 : 1.4);
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

    // 物品拾取
    for (let i = items.length - 1; i >= 0; i--) {
      const h = items[i];
      if (aabb(player, { x: h.x - 12, y: h.y - 12, w: 24, h: 24 })) {
        items.splice(i, 1); herbs++;
        const heal = h.kind === 'pill' ? 18 : h.kind === 'stone' ? 6 : 0;
        if (heal) player.hp = Math.min(player.maxhp, player.hp + heal);
        if (items.length < 7) spawnItem();
      }
    }

    // 相机
    cam.x = WORLD.w <= VW ? (WORLD.w - VW) / 2 : Math.max(0, Math.min(WORLD.w - VW, player.x + player.w / 2 - VW / 2));
    cam.y = WORLD.h <= VH ? (WORLD.h - VH) / 2 : Math.max(0, Math.min(WORLD.h - VH, player.y + player.h / 2 - VH / 2));

    if (toastT > 0) { toastT -= dt; if (toastT <= 0) elToast.style.display = 'none'; }
  }

  // ---------- 绘制：修士 ----------
  function drawPlayer() {
    const p = player;
    const bob = Math.sin(p.anim * 8) * (keys.up || keys.down || keys.left || keys.right || joy.active ? 1.5 : 0);
    const x = Math.round(p.x), y = Math.round(p.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 2, y + p.h - 2, p.w - 4, 4);
    ctx.fillStyle = p.inv > 0 && (Math.floor(p.anim * 20) % 2) ? '#b0b0d0' : '#4a3b8c';
    ctx.fillRect(x, y + 10, p.w, p.h - 10);
    ctx.fillStyle = '#caa84a';
    ctx.fillRect(x, y + 18, p.w, 3);
    ctx.fillStyle = '#e8c9a0';
    ctx.fillRect(x + 4, y, p.w - 8, 10);
    ctx.fillStyle = '#2a2238';
    ctx.fillRect(x + 5, y - 2, p.w - 10, 4);
    ctx.fillStyle = '#cfe8ff';
    if (p.face > 0) ctx.fillRect(x + p.w - 2, y + 8, 12, 3);
    else ctx.fillRect(x - 10, y + 8, 12, 3);
  }

  // ---------- 绘制：妖兽（各有形状） ----------
  function ellipse(cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.2832); ctx.fill();
  }
  function drawMonster(m) {
    const x = Math.round(m.x), y = Math.round(m.y);
    const cx = x + m.w / 2, cy = y + m.h / 2;
    const bob = Math.sin(m.anim * 6) * 1.5;
    const hit = m.hit > 0;
    const body = hit ? '#ffffff' : m.color;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 2, y + m.h - 2, m.w - 4, 4);
    switch (m.type) {
      case 'wolf': {
        const yy = y + bob;
        ellipse(cx, yy + m.h * 0.55, m.w * 0.42, m.h * 0.32, body);          // 躯干
        ellipse(x + m.w - 6, yy + m.h * 0.4, m.w * 0.22, m.h * 0.26, body);   // 头
        ctx.fillStyle = body;                                                 // 耳
        ctx.beginPath(); ctx.moveTo(x + m.w - 12, yy + m.h * 0.18); ctx.lineTo(x + m.w - 16, yy + m.h * 0.34); ctx.lineTo(x + m.w - 7, yy + m.h * 0.32); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + m.w - 2, yy + m.h * 0.18); ctx.lineTo(x + m.w - 6, yy + m.h * 0.34); ctx.lineTo(x + m.w + 3, yy + m.h * 0.32); ctx.fill();
        ctx.fillStyle = '#3a3d45';                                             // 腿
        ctx.fillRect(x + 4, yy + m.h - 6, 4, 6); ctx.fillRect(x + m.w - 10, yy + m.h - 6, 4, 6);
        ctx.fillStyle = hit ? '#fff' : '#ff4a3a';                            // 眼
        ctx.fillRect(x + m.w - 10, yy + m.h * 0.36, 3, 3); ctx.fillRect(x + m.w - 4, yy + m.h * 0.36, 3, 3);
        break;
      }
      case 'spider': {
        const yy = y + bob;
        ctx.strokeStyle = hit ? '#fff' : '#5e3a7e'; ctx.lineWidth = 2;        // 8 腿
        for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 4; k++) {
          ctx.beginPath(); ctx.moveTo(cx, yy + m.h * 0.5); ctx.lineTo(cx + s * (m.w * 0.5 + 6), yy + m.h * 0.18 + k * m.h * 0.2); ctx.stroke();
        }
        ellipse(cx, yy + m.h * 0.5, m.w * 0.34, m.h * 0.34, body);            // 腹
        ellipse(cx, yy + m.h * 0.34, m.w * 0.2, m.h * 0.2, body);            // 头胸
        ctx.fillStyle = hit ? '#fff' : '#ffd24a';
        ctx.fillRect(cx - 4, yy + m.h * 0.3, 2, 2); ctx.fillRect(cx + 2, yy + m.h * 0.3, 2, 2);
        break;
      }
      case 'toad': {
        const yy = y + bob;
        ellipse(cx, yy + m.h * 0.55, m.w * 0.46, m.h * 0.36, body);           // 宽身
        ctx.fillStyle = hit ? '#fff' : '#8f3f24';                            // 斑点
        ctx.beginPath(); ctx.arc(cx - m.w * 0.2, yy + m.h * 0.5, 3, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + m.w * 0.18, yy + m.h * 0.62, 3, 0, 6.28); ctx.fill();
        ellipse(cx - m.w * 0.18, yy + m.h * 0.18, 5, 5, body);               // 眼包
        ellipse(cx + m.w * 0.18, yy + m.h * 0.18, 5, 5, body);
        ctx.fillStyle = hit ? '#fff' : '#ffe27a';
        ctx.beginPath(); ctx.arc(cx - m.w * 0.18, yy + m.h * 0.18, 2.2, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + m.w * 0.18, yy + m.h * 0.18, 2.2, 0, 6.28); ctx.fill();
        break;
      }
      case 'ghost': {
        const yy = y + bob - 2 + Math.sin(m.anim * 3) * 3;                    // 飘浮
        ctx.fillStyle = hit ? 'rgba(255,255,255,0.95)' : 'rgba(191,227,255,0.78)';
        ctx.beginPath();
        ctx.arc(cx, yy + m.h * 0.4, m.w * 0.42, Math.PI, 0);                  // 头顶半圆
        ctx.lineTo(cx + m.w * 0.42, yy + m.h * 0.85);
        for (let k = 0; k < 3; k++) {                                         // 波浪下摆
          const sx = cx + m.w * 0.42 - (k + 0.5) * (m.w * 0.28);
          ctx.quadraticCurveTo(sx, yy + m.h * 1.05, sx - m.w * 0.14, yy + m.h * 0.85);
        }
        ctx.lineTo(cx - m.w * 0.42, yy + m.h * 0.85);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = hit ? '#222' : '#3a2b66';                           // 眼
        ctx.beginPath(); ctx.arc(cx - 4, yy + m.h * 0.4, 2.4, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 4, yy + m.h * 0.4, 2.4, 0, 6.28); ctx.fill();
        break;
      }
      case 'serpent': {
        const yy = y + bob;
        for (let k = 4; k >= 0; k--) {                                        // 分节身
          ellipse(cx - k * (m.w * 0.16) + Math.sin(m.anim * 5 + k) * 3, yy + m.h * 0.5, m.w * 0.13, m.h * 0.4, body);
        }
        ellipse(cx + m.w * 0.34, yy + m.h * 0.5, m.w * 0.16, m.h * 0.45, body);// 头
        ctx.fillStyle = hit ? '#fff' : '#ff4a3a';
        ctx.fillRect(cx + m.w * 0.4, yy + m.h * 0.4, 2, 2);
        ctx.strokeStyle = hit ? '#fff' : '#ff5a5a'; ctx.lineWidth = 1.5;      // 信子
        ctx.beginPath(); ctx.moveTo(cx + m.w * 0.5, yy + m.h * 0.5); ctx.lineTo(cx + m.w * 0.6, yy + m.h * 0.5); ctx.stroke();
        break;
      }
    }
    // 血条
    const w = m.w, hpr = m.hp / m.maxhp;
    ctx.fillStyle = '#300';
    ctx.fillRect(x, y - 9, w, 3);
    ctx.fillStyle = '#e0464f';
    ctx.fillRect(x, y - 9, Math.round(w * hpr), 3);
  }

  // ---------- 绘制：物品（各有形状） ----------
  function drawItem(h) {
    const pulse = 0.6 + 0.4 * Math.sin(h.t * 3 + performance.now() / 400);
    const x = Math.round(h.x), y = Math.round(h.y + Math.sin(h.t * 2 + performance.now() / 500) * 2);
    if (h.kind === 'herb') {
      ctx.fillStyle = `rgba(80,220,140,${0.22 * pulse})`;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#3fae5a'; ctx.lineWidth = 2;                        // 茎
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y - 6); ctx.stroke();
      ellipse(x - 5, y - 1, 5, 3, '#46d98a'); ellipse(x + 5, y - 1, 5, 3, '#46d98a'); // 叶
      ellipse(x, y - 8, 3.5, 4, '#bff7d6');                                  // 芽
    } else if (h.kind === 'stone') {
      ctx.fillStyle = `rgba(90,210,255,${0.22 * pulse})`;
      ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#5ad2ff';                                             // 晶簇（菱形）
      ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 11); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#bfefff';                                             // 高光面
      ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x + 4, y - 2); ctx.lineTo(x, y); ctx.lineTo(x - 4, y - 2); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = `rgba(255,140,90,${0.22 * pulse})`;
      ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.28); ctx.fill();
      const g = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, 11);        // 丹药（宝珠）
      g.addColorStop(0, '#ffe2a0'); g.addColorStop(0.5, '#ff7a3a'); g.addColorStop(1, '#c83a1f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 10, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(x - 3, y - 3, 2.2, 0, 6.28); ctx.fill();
    }
  }

  // ---------- 绘制：飞剑 ----------
  function drawSword(s) {
    const sz = s.size;
    const ang = Math.atan2(s.vy, s.vx);
    ctx.save();
    ctx.translate(Math.round(s.x), Math.round(s.y));
    ctx.rotate(ang);
    const glow = s.homing ? 'rgba(140,255,200,0.35)' : 'rgba(140,210,255,0.35)';
    ctx.fillStyle = glow;
    ctx.fillRect(-18 * sz, -6 * sz, 36 * sz, 12 * sz);
    ctx.fillStyle = s.homing ? '#bfffe0' : '#cfe8ff';
    ctx.fillRect(-13 * sz, -3 * sz, 26 * sz, 6 * sz);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8 * sz, -3 * sz, 5 * sz, 6 * sz);
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = '#0d0b1a';
    ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));

    ctx.strokeStyle = 'rgba(120,110,180,0.10)';
    ctx.lineWidth = 1;
    const step = 64;
    const sx = Math.floor(cam.x / step) * step, sy = Math.floor(cam.y / step) * step;
    ctx.beginPath();
    for (let gx = sx; gx < cam.x + VW + step; gx += step) { ctx.moveTo(gx, cam.y); ctx.lineTo(gx, cam.y + VH); }
    for (let gy = sy; gy < cam.y + VH + step; gy += step) { ctx.moveTo(cam.x, gy); ctx.lineTo(cam.x + VW, gy); }
    ctx.stroke();

    for (const d of deco) {
      if (d.x < cam.x - 20 || d.x > cam.x + VW + 20 || d.y < cam.y - 20 || d.y > cam.y + VH + 20) continue;
      if (d.glow) { ctx.fillStyle = d.c; ctx.globalAlpha = 0.18; ctx.fillRect(d.x - d.r - 4, d.y - d.r - 4, (d.r + 4) * 2, (d.r + 4) * 2); ctx.globalAlpha = 1; }
      ctx.fillStyle = d.c;
      ctx.fillRect(Math.round(d.x - d.r / 2), Math.round(d.y - d.r), d.r, d.r * 2);
    }

    for (const h of items) drawItem(h);
    for (const m of monsters) drawMonster(m);
    for (const s of swords) drawSword(s);
    if (!player.dead) drawPlayer();

    ctx.restore();

    const info = realmInfo();
    elHp.style.width = (player.hp / player.maxhp * 100) + '%';
    elHerb.textContent = herbs;
    elKill.textContent = kills;
    elRealm.textContent = info.name + ' · ' + info.skill;
    elDeath.style.display = player.dead ? 'flex' : 'none';
  }

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
