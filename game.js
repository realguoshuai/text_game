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
    wolf:    { name: '妖狼', hp: 26, speed: 60, dmg: 9,  w: 38, h: 30, color: '#6b6f7a', dark: '#4a4e59', glow: '#ff5a3a' },
    spider:  { name: '毒蛛', hp: 20, speed: 52, dmg: 7,  w: 36, h: 30, color: '#7a4f9e', dark: '#553471', glow: '#ffd24a' },
    toad:    { name: '火蟾', hp: 48, speed: 40, dmg: 14, w: 44, h: 34, color: '#c8623a', dark: '#8c3d22', glow: '#ffb03a' },
    ghost:   { name: '鬼面', hp: 18, speed: 82, dmg: 8,  w: 32, h: 36, color: '#bfe3ff', dark: '#8fb6df', glow: '#7fe8ff' },
    serpent: { name: '灵蛇', hp: 30, speed: 96, dmg: 11, w: 40, h: 26, color: '#3fae5a', dark: '#27803e', glow: '#ff6a5a' }
  };
  // 妖兽强度随玩家境界递增（血量/伤害提升，身形也随之长大）
  function diffScaler() {
    let t = 0;
    if (kills >= 20) t = 4; else if (kills >= 12) t = 3; else if (kills >= 7) t = 2; else if (kills >= 3) t = 1;
    return 1 + t * 0.32;
  }
  // 妖兽数量随境界递增：炼气 5 → 筑基 8 → 金丹 11 → 元婴 14 → 化神 17
  const FOE_BY_TIER = [5, 8, 11, 14, 17];
  function targetFoeCount() { return FOE_BY_TIER[tierIdx()]; }

  let uid = 0;
  function spawnMonster() {
    const edge = Math.random() * 4 | 0;
    let x, y;
    if (edge === 0) { x = Math.random() * WORLD.w; y = 24; }
    else if (edge === 1) { x = Math.random() * WORLD.w; y = WORLD.h - 24; }
    else if (edge === 2) { x = 24; y = Math.random() * WORLD.h; }
    else { x = WORLD.w - 24; y = Math.random() * WORLD.h; }
    // 后期出现更强种类
    const t = tierIdx();
    const r = Math.random();
    let type;
    if (t === 0) type = 'wolf';
    else if (t === 1) type = r < 0.5 ? 'wolf' : 'spider';
    else if (t === 2) type = r < 0.4 ? 'wolf' : r < 0.7 ? 'spider' : 'toad';
    else type = ['wolf', 'spider', 'toad', 'ghost', 'serpent'][Math.floor(Math.random() * 5)];
    const d = MTYPE[type];
    const mul = diffScaler();
    const grow = 1 + t * 0.05;                        // 境界越高，妖兽身形越大
    const elite = t >= 2 && Math.random() < 0.14;     // 金丹之后出现精英（血厚、带光环）
    const hpMul = mul * (elite ? 1.9 : 1);
    return {
      id: ++uid, type, x, y, face: 1, elite,
      w: Math.round(d.w * grow), h: Math.round(d.h * grow),
      color: d.color, dark: d.dark, glow: d.glow,
      hp: Math.round(d.hp * hpMul), maxhp: Math.round(d.hp * hpMul),
      speed: d.speed * (elite ? 1.06 : 1), dmg: Math.round(d.dmg * mul * (elite ? 1.3 : 1)),
      wander: 0, dx: 0, dy: 0, hit: 0, anim: Math.random() * 6
    };
  }
  let monsters = [];
  let herbs = 0, kills = 0;
  let spawnTimer = 0;                                 // 妖兽补员计时（缓慢补足，不瞬间涌入）
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

  // ---------- 飞剑 / 刀芒 ----------
  let swords = [];
  let slashes = [];

  // ---------- 可选修士（三种外形 / 武器 / 技能） ----------
  const CHARS = [
    { id: 'sword',   name: '御剑仙',   color: '#3a5a8c', accent: '#dff0ff', speed: 158, weapon: 'sword'   },
    { id: 'thunder', name: '雷法真君', color: '#5b3a8c', accent: '#ffe27a', speed: 150, weapon: 'thunder' },
    { id: 'blade',   name: '赤焰刀客', color: '#8c3a3a', accent: '#ff8a5b', speed: 174, weapon: 'blade'   }
  ];
  const TIER_NAMES  = ['炼气期', '筑基期', '金丹期', '元婴期', '化神期'];
  const SKILL_NAMES = {
    sword:   ['单锋剑', '双锋剑', '追魂三剑', '追魂巨剑', '五雷追魂'],
    thunder: ['雷符', '双雷符', '雷网', '奔雷诀', '紫霄神雷'],
    blade:   ['斩', '烈斩', '回风斩', '裂地斩', '炎武斩']
  };
  function tierIdx() { if (kills < 3) return 0; if (kills < 7) return 1; if (kills < 12) return 2; if (kills < 20) return 3; return 4; }
  function realmInfo() { const t = tierIdx(); return { name: TIER_NAMES[t], skill: SKILL_NAMES[player.char.id][t] }; }

  // ---------- 玩家 ----------
  const player = {
    x: WORLD.w / 2, y: WORLD.h / 2, w: 28, h: 44,
    char: CHARS[0], speed: CHARS[0].speed, hp: 100, maxhp: 100, face: 1, atkCd: 0, inv: 0,
    dead: false, respawn: 0, anim: 0
  };
  window.GameAPI = {
    selectChar(id) { const c = CHARS.find(x => x.id === id); if (c) { player.char = c; player.speed = c.speed; } }
  };
  // ---------- 相机 ----------
  const cam = { x: 0, y: 0 };

  // ---------- 碰撞 ----------
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- 武器 / 技能（按境界进化，三种修士各异） ----------
  function weaponCfg() {
    const w = player.char.id, t = tierIdx();
    if (w === 'thunder') {
      const T = [
        { count: 1, spread: 0,    speed: 560, dmg: 11, life: 1.0, pierce: true, cd: 0.26 },
        { count: 2, spread: 0.18, speed: 600, dmg: 12, life: 1.1, pierce: true, cd: 0.24 },
        { count: 3, spread: 0.24, speed: 640, dmg: 13, life: 1.3, pierce: true, cd: 0.22 },
        { count: 4, spread: 0.30, speed: 700, dmg: 15, life: 1.5, pierce: true, cd: 0.20 },
        { count: 5, spread: 0.36, speed: 760, dmg: 18, life: 1.7, pierce: true, cd: 0.18 }
      ][t];
      return Object.assign({ kind: 'thunder' }, T);
    }
    if (w === 'blade') {
      const T = [
        { range: 46, arc: 1.1, dmg: 22, knock: 130, cd: 0.42 },
        { range: 50, arc: 1.2, dmg: 26, knock: 150, cd: 0.40 },
        { range: 56, arc: 1.3, dmg: 30, knock: 170, cd: 0.38 },
        { range: 62, arc: 1.4, dmg: 36, knock: 200, cd: 0.36 },
        { range: 70, arc: 1.5, dmg: 44, knock: 230, cd: 0.34 }
      ][t];
      return Object.assign({ kind: 'blade' }, T);
    }
    // 御剑仙：飞剑追踪
    const T = [
      { count: 1, spread: 0,    homing: false, speed: 440, dmg: 13, life: 1.1, size: 1.0,  pierce: false, cd: 0.34 },
      { count: 2, spread: 0.20, homing: false, speed: 480, dmg: 14, life: 1.2, size: 1.1,  pierce: false, cd: 0.32 },
      { count: 3, spread: 0.26, homing: true,  speed: 520, dmg: 15, life: 1.5, size: 1.1,  pierce: false, cd: 0.30 },
      { count: 3, spread: 0.30, homing: true,  speed: 620, dmg: 18, life: 1.7, size: 1.3,  pierce: false, cd: 0.28 },
      { count: 5, spread: 0.36, homing: true,  speed: 700, dmg: 21, life: 1.9, size: 1.45, pierce: true,  cd: 0.26 }
    ][t];
    return Object.assign({ kind: 'sword' }, T);
  }
  const TIER_KILLS = [3, 7, 12, 20];
  let lastTierIdx = 0;

  // ---------- HUD 缓存 ----------
  const elHp = document.getElementById('hp-fill');
  const elHerb = document.getElementById('herb-val');
  const elKill = document.getElementById('kill-val');
  const elRealm = document.getElementById('realm-val');
  const elFoe = document.getElementById('foe-val');
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

  // 击杀结算（掉落灵物 + 补一只 + 突破提示）。剑/刀共用
  function onKill(j) {
    const m = monsters[j];
    monsters.splice(j, 1);
    kills++;
    items.push({ x: m.x, y: m.y, kind: ['herb', 'herb', 'stone', 'pill'][Math.floor(Math.random() * 4)], t: 0 });
    monsters.push(spawnMonster());
    while (lastTierIdx < TIER_KILLS.length && kills >= TIER_KILLS[lastTierIdx]) {
      const info = realmInfo();
      elToast.textContent = '突破！' + info.name + ' · ' + info.skill + '　妖潮增至 ' + targetFoeCount() + ' 只';
      elToast.style.display = 'block'; toastT = 2.4;
      lastTierIdx++;
    }
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

    // 攻击（按所选修士的武器 / 技能）
    player.atkCd -= dt;
    if (keys.attack && player.atkCd <= 0) {
      const cfg = weaponCfg();
      player.atkCd = cfg.cd;
      if (cfg.kind === 'blade') {
        // 近战刀芒：面朝方向扇形重创 + 击退
        const px = player.x + player.w / 2, py = player.y + player.h / 2;
        const fwd = player.face > 0 ? 0 : Math.PI;
        slashes.push({ x: px, y: py, dir: player.face, range: cfg.range, arc: cfg.arc, life: 0.18, max: 0.18 });
        for (let j = monsters.length - 1; j >= 0; j--) {
          const m = monsters[j];
          const dx = m.x + m.w / 2 - px, dy = m.y + m.h / 2 - py;
          const d = Math.hypot(dx, dy);
          if (d > cfg.range + Math.max(m.w, m.h) * 0.5) continue;
          let diff = Math.atan2(dy, dx) - fwd;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          if (Math.abs(diff) > cfg.arc / 2) continue;
          m.hp -= cfg.dmg; m.hit = 0.12;
          const kl = Math.max(1, d);
          m.x = Math.max(0, Math.min(WORLD.w - m.w, m.x + dx / kl * cfg.knock * 0.14));
          m.y = Math.max(0, Math.min(WORLD.h - m.h, m.y + dy / kl * cfg.knock * 0.14));
          if (m.hp <= 0) onKill(j);
        }
      } else {
        const base = player.face > 0 ? 0 : Math.PI;
        for (let i = 0; i < cfg.count; i++) {
          const off = (i - (cfg.count - 1) / 2) * cfg.spread;
          const a = base + off;
          swords.push({
            kind: cfg.kind, x: player.x + player.w / 2, y: player.y + player.h / 2,
            vx: Math.cos(a) * cfg.speed, vy: Math.sin(a) * cfg.speed,
            life: cfg.life, dmg: cfg.dmg, homing: cfg.homing,
            size: cfg.size || 1, pierce: cfg.pierce, hit: new Set()
          });
        }
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
          if (m.hp <= 0) { onKill(j); }
          if (!s.pierce) break;
        }
      }
    }

    // 刀芒寿命
    for (let i = slashes.length - 1; i >= 0; i--) {
      slashes[i].life -= dt;
      if (slashes[i].life <= 0) slashes.splice(i, 1);
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
      if (m.dx > 0.15) m.face = 1; else if (m.dx < -0.15) m.face = -1;
      m.x = Math.max(0, Math.min(WORLD.w - m.w, m.x + m.dx * m.speed * dt));
      m.y = Math.max(0, Math.min(WORLD.h - m.h, m.y + m.dy * m.speed * dt));
      if (m.hit > 0) m.hit -= dt;
      if (aabb(player, m) && player.inv <= 0) {
        player.hp -= m.dmg; player.inv = 0.8;
        if (player.hp <= 0) { player.hp = 0; player.dead = true; player.respawn = 1.6; }
      }
    }

    // 妖兽补员：数量随境界提升（每 1.1s 补一只，避免瞬间涌入卡顿）
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = 1.1;
      if (monsters.length < targetFoeCount()) monsters.push(spawnMonster());
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

  // ---------- 绘制：修士（三种外形 / 武器） ----------
  function limb(x1, y1, x2, y2, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function poly(pts, col) {
    if (col) ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
  }

  function drawPlayer() {
    const p = player, c = p.char;
    const walking = (keys.up || keys.down || keys.left || keys.right || joy.active);
    const t = p.anim * 9;
    const bob = walking ? -Math.abs(Math.sin(t)) * 1.4 : Math.sin(p.anim * 2.4) * 0.6;
    const swing = walking ? Math.sin(t) : 0;
    const cx = Math.round(p.x) + p.w / 2;
    const feet = Math.round(p.y) + p.h;
    const flash = p.inv > 0 && (Math.floor(p.anim * 20) % 2);

    // 地面投影
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(cx, feet - 1, p.w * 0.50, 4.2, 0, 0, 6.2832); ctx.fill();

    ctx.save();
    ctx.translate(cx, Math.round(feet + bob));
    const S = p.h / 44;                       // 立绘按 44 单位身高设计，自动适配碰撞盒
    ctx.scale(p.face * S, S);                 // 朝右设计，向左时整幅镜像
    ctx.lineJoin = 'round';
    if (c.id === 'blade') drawBladeMaster(swing, flash, p.anim);
    else if (c.id === 'thunder') drawThunderLord(swing, flash, p.anim);
    else drawSwordImmortal(swing, flash, p.anim);
    ctx.restore();
  }

  // ===== 御剑仙：青蓝道袍 · 披发玉簪 · 手持飞剑 =====
  function drawSwordImmortal(swing, flash, anim) {
    const robe  = flash ? '#ffffff' : '#4a7ac0';
    const dark  = flash ? '#e8eef8' : '#2c4a7c';
    const light = flash ? '#ffffff' : '#82b2ec';
    const inner = flash ? '#ffffff' : '#eaf4ff';
    const skin  = flash ? '#ffffff' : '#f7d8b4';
    const hair  = flash ? '#eaeaf4' : '#2b2140';
    const gold  = flash ? '#ffffff' : '#e0be5e';
    const ink   = '#241c33';

    // 身后飘带
    const fl = Math.sin(anim * 4.5) * 3;
    ctx.fillStyle = flash ? 'rgba(255,255,255,.5)' : 'rgba(150,196,255,.5)';
    ctx.beginPath();
    ctx.moveTo(-4.4, -31);
    ctx.quadraticCurveTo(-17 - fl, -26, -14 - fl, -8);
    ctx.quadraticCurveTo(-10, -19, -3.4, -24);
    ctx.closePath(); ctx.fill();

    // 腿 + 云靴
    limb(-3.2, -21, -3.2 - swing * 3.4, -6, 4, dark);
    limb(3.2, -21, 3.2 + swing * 3.4, -6, 4, dark);
    ctx.fillStyle = flash ? '#ffffff' : '#332a49';
    ctx.beginPath(); ctx.ellipse(-3.2 - swing * 3.4, -3.6, 3.8, 2.2, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3.2 + swing * 3.4, -3.6, 3.8, 2.2, 0, 0, 6.2832); ctx.fill();

    // 道袍下摆（深底 + 亮面，出立体感）
    poly([[-6.0, -25], [6.0, -25], [8.4, -11.5], [-8.4, -11.5]], dark);
    poly([[-6.0, -25], [1.6, -25], [3.4, -11.5], [-8.4, -11.5]], robe);
    ctx.fillStyle = light; ctx.fillRect(-8.4, -13.2, 16.8, 1.7);

    // 上身
    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(-6.6, -34);
    ctx.quadraticCurveTo(-8.4, -28.5, -6.0, -24.5);
    ctx.lineTo(6.0, -24.5);
    ctx.quadraticCurveTo(8.4, -28.5, 6.6, -34);
    ctx.closePath(); ctx.fill();

    // 交领
    poly([[-4.2, -34.6], [0, -27.4], [4.2, -34.6], [2.0, -34.6], [0, -30.0], [-2.0, -34.6]], inner);
    ctx.fillStyle = light;
    poly([[-5.6, -34.4], [-4.2, -34.4], [0.4, -29.4], [-0.5, -27.8]]);
    poly([[5.6, -34.4], [4.2, -34.4], [-0.4, -29.4], [0.5, -27.8]]);

    // 腰带 + 玉佩
    ctx.fillStyle = gold; ctx.fillRect(-6.2, -26.4, 12.4, 2.6);
    ctx.fillRect(-0.5, -24.6, 1.0, 5.4);
    ctx.fillStyle = flash ? '#ffffff' : '#8fe3c0';
    ctx.beginPath(); ctx.arc(3.4, -22.4, 2.0, 0, 6.2832); ctx.fill();

    // 后手臂
    limb(-5.0, -32.4, -7.4, -24.0, 4.8, robe);
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(-7.4, -23.2, 2.1, 0, 6.2832); ctx.fill();

    // 颈
    ctx.fillStyle = skin; ctx.fillRect(-1.7, -34.4, 3.4, 3.2);

    // 披发（后）
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-6.4, -34);
    ctx.quadraticCurveTo(-9.2, -27, -7.0, -20);
    ctx.lineTo(-3.2, -23);
    ctx.quadraticCurveTo(-5.6, -28.5, -4.2, -33.6);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-1.0, -38.2, 6.0, 6.4, 0, 0, 6.2832); ctx.fill();

    // 脸
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(1.4, -38.2, 5.2, 5.7, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-1.6, -37.6, 1.1, 1.7, 0, 0, 6.2832); ctx.fill();

    // 额发
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-3.9, -41.6);
    ctx.quadraticCurveTo(1.4, -45.0, 6.4, -40.6);
    ctx.quadraticCurveTo(3.6, -42.4, 1.2, -41.2);
    ctx.quadraticCurveTo(-1.2, -42.2, -3.9, -41.6);
    ctx.closePath(); ctx.fill();

    // 发髻 + 玉簪
    ctx.beginPath(); ctx.arc(-0.2, -44.4, 2.9, 0, 6.2832); ctx.fill();
    ctx.fillStyle = gold;
    ctx.fillRect(-0.8, -47.0, 1.1, 5.0);
    ctx.beginPath(); ctx.arc(-0.25, -47.2, 1.2, 0, 6.2832); ctx.fill();

    // 眉眼
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(3.0, -38.4, 1.05, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(-0.7, -38.4, 0.90, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.arc(3.35, -38.75, 0.34, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 0.85; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(1.7, -40.5); ctx.lineTo(4.4, -40.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2.0, -40.5); ctx.lineTo(-0.2, -40.2); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,70,80,.7)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(2.3, -35.6); ctx.lineTo(4.1, -35.7); ctx.stroke();

    // 前手臂 + 飞剑
    limb(4.8, -32.4, 8.4, -25.2, 4.8, robe);
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(8.8, -24.4, 2.2, 0, 6.2832); ctx.fill();

    ctx.save();
    ctx.translate(9.2, -24.0);
    ctx.rotate(0.55);
    poly([[0, -1.4], [20, -0.5], [25, 0], [20, 0.9], [0, 1.4]], flash ? '#ffffff' : '#e6f4ff');
    poly([[0, -0.5], [20.5, -0.30], [22, 0], [20.5, 0.30], [0, 0.5]], flash ? '#ffffff' : '#9fd4ff');
    ctx.fillStyle = gold; ctx.fillRect(-2.8, -3.4, 2.6, 6.8);
    ctx.fillStyle = '#5a3b2a'; ctx.fillRect(-8.6, -1.5, 6, 3);
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.arc(-9.2, 0, 1.8, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  // ===== 雷法真君：紫霄法袍 · 束发金冠 · 银须 · 雷珠法杖 =====
  function drawThunderLord(swing, flash, anim) {
    const robe  = flash ? '#ffffff' : '#6b46a8';
    const dark  = flash ? '#e6dcf6' : '#472c78';
    const light = flash ? '#ffffff' : '#9c7ade';
    const trim  = flash ? '#ffffff' : '#ffd85e';
    const skin  = flash ? '#ffffff' : '#f2d0ab';
    const hair  = flash ? '#eaeaf4' : '#d8d5e6';
    const ink   = '#241c33';

    // 披风（身后 + 雷纹）
    ctx.fillStyle = flash ? 'rgba(255,255,255,.5)' : 'rgba(70,44,120,.85)';
    ctx.beginPath();
    ctx.moveTo(-6.0, -33);
    ctx.quadraticCurveTo(-15 - Math.sin(anim * 3) * 2, -22, -11, -8);
    ctx.lineTo(-2, -11);
    ctx.quadraticCurveTo(-7, -22, -3.4, -32);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = flash ? '#ffffff' : 'rgba(255,216,94,.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-9, -26); ctx.lineTo(-11, -21); ctx.lineTo(-8.5, -21); ctx.lineTo(-10.5, -15);
    ctx.stroke();

    // 腿 + 靴
    limb(-3.0, -21, -3.0 - swing * 3, -7, 4.2, dark);
    limb(3.0, -21, 3.0 + swing * 3, -7, 4.2, dark);
    ctx.fillStyle = flash ? '#ffffff' : '#2e2148';
    ctx.beginPath(); ctx.ellipse(-3.0 - swing * 3, -4.2, 3.7, 2.2, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3.0 + swing * 3, -4.2, 3.7, 2.2, 0, 0, 6.2832); ctx.fill();

    // 法袍下摆（下摆雷纹）
    poly([[-6.4, -25.5], [6.4, -25.5], [8.6, -12], [-8.6, -12]], dark);
    poly([[-6.4, -25.5], [1.4, -25.5], [3.0, -12], [-8.6, -12]], robe);
    ctx.strokeStyle = trim; ctx.lineWidth = 1.1; ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(-7.4, -14.5); ctx.lineTo(-4.4, -16.8); ctx.lineTo(-1.6, -14.6);
    ctx.lineTo(1.4, -16.9); ctx.lineTo(4.4, -14.7);
    ctx.stroke();
    ctx.lineJoin = 'round';

    // 上身
    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(-7.0, -34);
    ctx.quadraticCurveTo(-8.8, -28.5, -6.4, -24.6);
    ctx.lineTo(6.4, -24.6);
    ctx.quadraticCurveTo(8.8, -28.5, 7.0, -34);
    ctx.closePath(); ctx.fill();

    // 交领 + 胸前雷印
    poly([[-4.4, -34.6], [0, -27.0], [4.4, -34.6], [2.2, -34.6], [0, -29.8], [-2.2, -34.6]], trim);
    ctx.fillStyle = flash ? '#ffffff' : '#2a1c4a';
    ctx.beginPath(); ctx.arc(0, -29.0, 2.6, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = trim; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.arc(0, -29.0, 2.6, 0, 6.2832); ctx.stroke();

    // 腰带
    ctx.fillStyle = trim; ctx.fillRect(-6.6, -26.6, 13.2, 2.6);

    // 后手臂
    limb(-5.2, -32.6, -7.8, -24.6, 5, robe);
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(-7.8, -23.8, 2.2, 0, 6.2832); ctx.fill();

    // 颈
    ctx.fillStyle = skin; ctx.fillRect(-1.8, -34.6, 3.6, 3.4);

    // 后发（银）
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.ellipse(-1.2, -38.4, 6.1, 6.4, 0, 0, 6.2832); ctx.fill();

    // 脸
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(1.3, -38.5, 5.2, 5.7, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-1.7, -37.9, 1.1, 1.7, 0, 0, 6.2832); ctx.fill();

    // 银须 + 长眉
    ctx.fillStyle = flash ? '#ffffff' : '#e8e6f2';
    ctx.beginPath();
    ctx.moveTo(-1.6, -34.6);
    ctx.quadraticCurveTo(1.0, -29.5, 2.6, -31.5);
    ctx.quadraticCurveTo(3.4, -34.0, 3.0, -35.4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = flash ? '#ffffff' : '#e8e6f2'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(1.4, -40.9); ctx.lineTo(4.6, -40.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2.2, -40.9); ctx.lineTo(-0.3, -40.4); ctx.stroke();

    // 束发金冠
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.arc(-0.4, -43.6, 3.0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(-3.6, -44.6, 7.2, 1.9);
    ctx.beginPath(); ctx.arc(0, -46.2, 2.0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : '#fff7c0';
    ctx.beginPath(); ctx.arc(0, -46.2, 1.0, 0, 6.2832); ctx.fill();

    // 眼（含电光）
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(3.0, -38.7, 1.05, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(-0.7, -38.7, 0.90, 0, 6.2832); ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : '#ffe27a';
    ctx.beginPath(); ctx.arc(3.0, -38.7, 0.45, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(-0.7, -38.7, 0.38, 0, 6.2832); ctx.fill();

    // 前手臂 + 雷珠法杖
    limb(5.0, -32.6, 8.8, -25.4, 5, robe);
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(9.2, -24.6, 2.2, 0, 6.2832); ctx.fill();

    ctx.save();
    ctx.translate(9.6, -24.0);
    ctx.rotate(0.06);
    ctx.fillStyle = flash ? '#ffffff' : '#5c3f92';
    ctx.fillRect(-1.7, -20, 3.4, 24);
    ctx.fillStyle = trim;
    ctx.fillRect(-2.4, -9, 4.8, 1.8);
    ctx.fillRect(-2.4, 0, 4.8, 1.8);
    const pu = 0.78 + 0.22 * Math.sin(anim * 6);
    const g = ctx.createRadialGradient(0, -22, 1, 0, -22, 10 * pu);
    g.addColorStop(0, '#fffbe0'); g.addColorStop(0.45, '#ffe27a'); g.addColorStop(1, 'rgba(180,120,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -22, 10 * pu, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#fffbe0';
    ctx.beginPath(); ctx.arc(0, -22, 3.0, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(230,210,255,.85)'; ctx.lineWidth = 1.1; ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(4.6, -25); ctx.lineTo(1.4, -28); ctx.lineTo(6, -30.5);
    ctx.moveTo(0, -22); ctx.lineTo(-4.6, -19); ctx.lineTo(-1.4, -16); ctx.lineTo(-6, -13.5);
    ctx.stroke();
    ctx.lineJoin = 'round';
    ctx.restore();
  }

  // ===== 赤焰刀客：赤甲重铠 · 束额红巾 · 巨阙弯刀 =====
  function drawBladeMaster(swing, flash, anim) {
    const armor = flash ? '#ffffff' : '#a8362a';
    const dark  = flash ? '#efd9d5' : '#6d2018';
    const light = flash ? '#ffffff' : '#d1593f';
    const steel = flash ? '#ffffff' : '#c9b877';
    const skin  = flash ? '#ffffff' : '#e8b98d';
    const hair  = flash ? '#e8e8f0' : '#2a1c1a';
    const ink   = '#241c33';

    // 腿 + 重靴
    limb(-4.4, -21, -4.4 - swing * 3.2, -6.5, 5.4, dark);
    limb(4.4, -21, 4.4 + swing * 3.2, -6.5, 5.4, dark);
    ctx.fillStyle = flash ? '#ffffff' : '#3a2420';
    ctx.beginPath(); ctx.ellipse(-4.4 - swing * 3.2, -3.8, 4.4, 2.4, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4.4 + swing * 3.2, -3.8, 4.4, 2.4, 0, 0, 6.2832); ctx.fill();

    // 战裙
    poly([[-7.0, -24], [7.0, -24], [9.2, -12], [-9.2, -12]], dark);
    poly([[-7.0, -24], [1.8, -24], [3.6, -12], [-9.2, -12]], armor);
    ctx.fillStyle = steel; ctx.fillRect(-9.2, -13.6, 18.4, 1.8);

    // 上身（宽厚）
    ctx.fillStyle = armor;
    ctx.beginPath();
    ctx.moveTo(-8.6, -34.5);
    ctx.quadraticCurveTo(-10.4, -28.5, -7.4, -24.2);
    ctx.lineTo(7.4, -24.2);
    ctx.quadraticCurveTo(10.4, -28.5, 8.6, -34.5);
    ctx.closePath(); ctx.fill();

    // 胸甲分片
    poly([[-7.0, -33.5], [7.0, -33.5], [5.4, -29.5], [-5.4, -29.5]], dark);
    poly([[-6.4, -33.2], [6.4, -33.2], [5.0, -30.0], [-5.0, -30.0]], light);

    // 护心镜
    ctx.fillStyle = steel;
    ctx.beginPath(); ctx.arc(0, -27.4, 3.2, 0, 6.2832); ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : '#8a2a1e';
    ctx.beginPath(); ctx.arc(0, -27.4, 1.6, 0, 6.2832); ctx.fill();

    // 腰带
    ctx.fillStyle = dark; ctx.fillRect(-7.4, -25.6, 14.8, 3.0);
    ctx.fillStyle = steel; ctx.fillRect(-2.0, -25.6, 4.0, 3.0);

    // 金属护肩
    ctx.fillStyle = steel;
    ctx.beginPath(); ctx.ellipse(-7.8, -34.6, 4.6, 3.4, -0.25, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7.8, -34.6, 4.6, 3.4, 0.25, 0, 6.2832); ctx.fill();

    // 后手臂（裸臂 + 臂环）
    limb(-6.4, -33.4, -9.0, -25.4, 4.6, skin);
    ctx.fillStyle = flash ? '#ffffff' : '#c8a46a';
    ctx.beginPath(); ctx.arc(-8.4, -27.6, 2.6, 0, 3.1416); ctx.fill();

    // 颈 + 红巾
    ctx.fillStyle = skin; ctx.fillRect(-2.0, -35.2, 4.0, 3.6);
    ctx.fillStyle = flash ? '#ffffff' : '#c0392b';
    ctx.beginPath(); ctx.ellipse(0, -34.2, 4.2, 2.0, 0, 0, 6.2832); ctx.fill();

    // 头发（短）
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.ellipse(0, -39.0, 6.2, 6.0, 0, 0, 6.2832); ctx.fill();

    // 方脸
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(1.2, -38.6, 5.4, 5.6, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-1.8, -38.0, 1.2, 1.8, 0, 0, 6.2832); ctx.fill();

    // 红头巾 + 飘带
    ctx.fillStyle = flash ? '#ffffff' : '#c0392b';
    ctx.fillRect(-4.4, -42.6, 10.0, 2.6);
    const tl = Math.sin(anim * 5) * 3;
    ctx.beginPath();
    ctx.moveTo(-4.0, -42.4);
    ctx.quadraticCurveTo(-11 - tl, -41, -13 - tl, -35);
    ctx.lineTo(-10.6 - tl, -34.6);
    ctx.quadraticCurveTo(-9.4, -39.4, -4.0, -40.4);
    ctx.closePath(); ctx.fill();

    // 怒眉 + 眼
    ctx.strokeStyle = hair; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(1.2, -41.4); ctx.lineTo(4.8, -40.0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2.4, -41.4); ctx.lineTo(-0.4, -40.6); ctx.stroke();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(3.0, -38.8, 1.00, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(-0.8, -38.8, 0.88, 0, 6.2832); ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : '#ffd24a';
    ctx.beginPath(); ctx.arc(3.0, -38.8, 0.42, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(-0.8, -38.8, 0.36, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(120,50,45,.8)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(1.8, -35.6); ctx.lineTo(4.4, -35.9); ctx.stroke();

    // 前手臂（持刀）
    limb(6.6, -33.4, 10.4, -27.0, 4.8, skin);

    // 弯刀
    ctx.save();
    ctx.translate(10.8, -26.4);
    ctx.rotate(-0.35);
    ctx.fillStyle = flash ? '#ffffff' : '#5a3a24';
    ctx.fillRect(-11, -1.8, 11, 3.6);
    ctx.fillStyle = steel;
    ctx.beginPath(); ctx.ellipse(0.5, 0, 2.4, 3.2, 0, 0, 6.2832); ctx.fill();
    if (flash) { ctx.fillStyle = '#ffffff'; }
    else {
      const bg = ctx.createLinearGradient(0, -6, 0, 6);
      bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#d5dde8'); bg.addColorStop(1, '#8f9db0');
      ctx.fillStyle = bg;
    }
    ctx.beginPath();
    ctx.moveTo(1.5, -2.6);
    ctx.quadraticCurveTo(16, -10, 29, -22);
    ctx.quadraticCurveTo(20, -20, 10, -13);
    ctx.quadraticCurveTo(5, -9, 1.5, 2.6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = flash ? '#ffffff' : '#8f9db0'; ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(2.6, -2.0); ctx.quadraticCurveTo(14, -8.6, 25, -18.4); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,138,91,.85)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(3.4, -1.2); ctx.quadraticCurveTo(14, -7.4, 24, -16.4); ctx.stroke();
    ctx.restore();

    // 余焰
    ctx.globalAlpha = 0.14 + 0.07 * Math.sin(anim * 8);
    ctx.fillStyle = flash ? '#ffffff' : '#ff8a5b';
    ctx.beginPath(); ctx.arc(12, -26, 15, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---------- 绘制：妖兽（五种形态，各有辨识度；精英带光环） ----------
  function ellipse(cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.2832); ctx.fill();
  }

  function drawMonster(m) {
    const W = m.w, H = m.h;
    const x = Math.round(m.x), y = Math.round(m.y);
    const cx = x + W / 2;
    const bob = Math.sin(m.anim * 6) * 1.6;
    const hit = m.hit > 0;
    const body = hit ? '#ffffff' : m.color;
    const dark = hit ? '#e8e8f0' : m.dark;
    const glow = hit ? '#ffffff' : m.glow;
    const ink = '#15111f';

    // 地面投影
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx, y + H - 1, W * 0.40, 3.8, 0, 0, 6.2832); ctx.fill();

    // 精英光环
    if (m.elite) {
      const pu = 0.5 + 0.5 * Math.sin(m.anim * 4);
      ctx.strokeStyle = 'rgba(255,190,90,' + (0.28 + 0.34 * pu).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, y + H - 2, W * 0.52, 6.5, 0, 0, 6.2832); ctx.stroke();
    }

    ctx.save();
    ctx.translate(x, y + bob);
    if (m.face < 0) { ctx.translate(W, 0); ctx.scale(-1, 1); }   // 按移动方向转身
    ctx.lineJoin = 'round';

    if (m.type === 'wolf')         drawWolf(W, H, m, body, dark, glow, ink);
    else if (m.type === 'spider')  drawSpider(W, H, m, body, dark, glow, ink);
    else if (m.type === 'toad')    drawToad(W, H, m, body, dark, glow, ink);
    else if (m.type === 'ghost')   drawGhost(W, H, m, body, dark, glow, ink);
    else                           drawSerpent(W, H, m, body, dark, glow, ink);

    ctx.restore();

    // 血条（受伤或精英才显示，避免满屏绿条）
    if (m.hp < m.maxhp || m.elite) {
      const hpr = Math.max(0, m.hp / m.maxhp);
      const by = y - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 1, by - 1, W + 2, 4.4);
      ctx.fillStyle = m.elite ? '#ffb64a' : '#e0464f';
      ctx.fillRect(x, by, Math.round(W * hpr), 2.6);
    }
  }

  // 妖狼：侧身四足 + 背脊鬃刺 + 血口獠牙
  function drawWolf(W, H, m, body, dark, glow, ink) {
    const lp = Math.sin(m.anim * 10) * 2.2;
    ctx.strokeStyle = dark; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(W * 0.30, H * 0.62); ctx.lineTo(W * 0.28 - lp, H * 0.96); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.42, H * 0.62); ctx.lineTo(W * 0.44 + lp, H * 0.96); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.70, H * 0.62); ctx.lineTo(W * 0.72 + lp, H * 0.96); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.82, H * 0.62); ctx.lineTo(W * 0.80 - lp, H * 0.96); ctx.stroke();

    // 尾
    ctx.strokeStyle = body; ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(W * 0.18, H * 0.50);
    ctx.quadraticCurveTo(W * 0.02, H * 0.36, W * 0.06, H * 0.14);
    ctx.stroke();

    // 躯干
    ellipse(W * 0.46, H * 0.50, W * 0.30, H * 0.28, body);

    // 背脊鬃刺
    ctx.fillStyle = dark;
    for (let k = 0; k < 4; k++) {
      const bx = W * (0.30 + k * 0.10);
      poly([[bx - W * 0.05, H * 0.30], [bx, H * 0.09], [bx + W * 0.05, H * 0.30]]);
    }

    // 头 + 吻
    ellipse(W * 0.72, H * 0.34, W * 0.18, H * 0.21, body);
    poly([[W * 0.78, H * 0.28], [W * 1.02, H * 0.40], [W * 0.78, H * 0.50]], dark);
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(W * 0.99, H * 0.40, 1.5, 0, 6.2832); ctx.fill();

    // 耳
    ctx.fillStyle = dark;
    poly([[W * 0.62, H * 0.20], [W * 0.60, H * 0.01], [W * 0.72, H * 0.16]]);
    poly([[W * 0.78, H * 0.18], [W * 0.82, H * 0.00], [W * 0.88, H * 0.20]]);

    // 獠牙
    ctx.fillStyle = '#ffffff';
    poly([[W * 0.86, H * 0.45], [W * 0.90, H * 0.57], [W * 0.92, H * 0.44]]);
    poly([[W * 0.79, H * 0.45], [W * 0.82, H * 0.55], [W * 0.85, H * 0.44]]);

    // 发光的眼
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(W * 0.76, H * 0.30, 2.2, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.90, H * 0.33, 1.8, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillRect(W * 0.745, H * 0.27, 1.4, 2.6);
  }

  // 毒蛛：八条分节步足 + 腹部斑纹 + 八眼
  function drawSpider(W, H, m, body, dark, glow, ink) {
    const cx = W * 0.50, cy = H * 0.52;
    ctx.strokeStyle = dark; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 0; k < 4; k++) {
        const ph = Math.sin(m.anim * 8 + k * 1.3 + (s > 0 ? 0 : 1.6)) * 2;
        const kx = cx + s * (W * 0.16 + k * 0.05 * W);
        const ky = cy - H * 0.12 + k * H * 0.10;
        const ex = cx + s * W * 0.50;
        const ey = cy - H * 0.34 + k * H * 0.24 + ph;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(kx, ky - H * 0.16);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    // 蛛腹 + 斑纹
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(cx - W * 0.05, cy + H * 0.06, W * 0.24, H * 0.28, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = glow;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.ellipse(cx - W * 0.05, cy - H * 0.06 + k * H * 0.12, W * 0.05, H * 0.035, 0, 0, 6.2832);
      ctx.fill();
    }

    // 头胸
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(cx + W * 0.10, cy - H * 0.24, W * 0.17, H * 0.17, 0, 0, 6.2832); ctx.fill();

    // 螯肢
    ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + W * 0.20, cy - H * 0.16); ctx.lineTo(cx + W * 0.31, cy - H * 0.06); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + W * 0.22, cy - H * 0.22); ctx.lineTo(cx + W * 0.33, cy - H * 0.14); ctx.stroke();

    // 八眼
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx + W * 0.12, cy - H * 0.30, 2.4, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + W * 0.21, cy - H * 0.28, 1.8, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(cx + W * 0.13, cy - H * 0.30, 1.0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + W * 0.21, cy - H * 0.28, 0.8, 0, 6.2832); ctx.fill();
  }

  // 火蟾：宽扁身躯 + 背焰脊 + 竖瞳鼓眼
  function drawToad(W, H, m, body, dark, glow, ink) {
    const breathe = 1 + Math.sin(m.anim * 3) * 0.04;

    // 后腿 + 前足
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(W * 0.14, H * 0.82, W * 0.13, H * 0.12, -0.3, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.86, H * 0.82, W * 0.13, H * 0.12, 0.3, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.26, H * 0.94, W * 0.10, H * 0.05, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.74, H * 0.94, W * 0.10, H * 0.05, 0, 0, 6.2832); ctx.fill();

    // 宽身
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(W * 0.50, H * 0.62, W * 0.44 * breathe, H * 0.36 * breathe, 0, 0, 6.2832);
    ctx.fill();

    // 背部火焰脊
    ctx.fillStyle = glow;
    for (let k = 0; k < 3; k++) {
      const bx = W * (0.30 + k * 0.20);
      ctx.beginPath();
      ctx.moveTo(bx - W * 0.07, H * 0.34);
      ctx.quadraticCurveTo(bx, H * 0.13, bx + W * 0.07, H * 0.34);
      ctx.closePath(); ctx.fill();
    }

    // 疣斑
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(W * 0.34, H * 0.66, W * 0.060, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.62, H * 0.74, W * 0.050, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.72, H * 0.56, W * 0.040, 0, 6.2832); ctx.fill();

    // 大嘴线
    ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(W * 0.22, H * 0.56);
    ctx.quadraticCurveTo(W * 0.50, H * 0.44, W * 0.78, H * 0.56);
    ctx.stroke();

    // 鼓眼 + 竖瞳
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(W * 0.32, H * 0.26, W * 0.14, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.68, H * 0.26, W * 0.14, 0, 6.2832); ctx.fill();
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(W * 0.32, H * 0.26, W * 0.09, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.68, H * 0.26, W * 0.09, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillRect(W * 0.305, H * 0.16, W * 0.032, H * 0.20);
    ctx.fillRect(W * 0.665, H * 0.16, W * 0.032, H * 0.20);
  }

  // 鬼面：飘浮幽体 + 破烂下摆 + 空洞眼窝
  function drawGhost(W, H, m, body, dark, glow, ink) {
    const float = Math.sin(m.anim * 3) * 2.6;
    ctx.save();
    ctx.translate(0, float);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(W * 0.10, H * 0.86);
    ctx.quadraticCurveTo(W * 0.06, H * 0.30, W * 0.50, H * 0.08);
    ctx.quadraticCurveTo(W * 0.94, H * 0.30, W * 0.90, H * 0.86);
    for (let k = 0; k < 3; k++) {
      const sx = W * 0.90 - k * W * 0.27;
      ctx.quadraticCurveTo(sx - W * 0.13, H * (1.06 + (k % 2) * 0.06), sx - W * 0.27, H * 0.86);
    }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // 兜帽内暗面
    ctx.fillStyle = 'rgba(30,20,60,0.55)';
    ctx.beginPath(); ctx.ellipse(W * 0.50, H * 0.42, W * 0.26, H * 0.26, 0, 0, 6.2832); ctx.fill();

    // 幽光眼窝
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(W * 0.38, H * 0.40, W * 0.08, H * 0.07, 0.2, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.62, H * 0.40, W * 0.08, H * 0.07, -0.2, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(W * 0.38, H * 0.40, W * 0.035, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.62, H * 0.40, W * 0.035, 0, 6.2832); ctx.fill();

    // 黑洞嘴
    ctx.fillStyle = 'rgba(10,6,20,0.75)';
    ctx.beginPath();
    ctx.moveTo(W * 0.42, H * 0.60);
    ctx.quadraticCurveTo(W * 0.50, H * 0.75, W * 0.58, H * 0.60);
    ctx.quadraticCurveTo(W * 0.50, H * 0.64, W * 0.42, H * 0.60);
    ctx.closePath(); ctx.fill();

    // 头侧幽火
    ctx.fillStyle = 'rgba(127,232,255,0.55)';
    ctx.beginPath(); ctx.arc(W * 0.14, H * 0.20, 2.6, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.86, H * 0.20, 2.2, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  // 灵蛇：盘绕蛇身 + 兜帽颈 + 分叉信子
  function drawSerpent(W, H, m, body, dark, glow, ink) {
    for (let k = 5; k >= 0; k--) {
      const bx = W * (0.30 - k * 0.11);
      const by = H * 0.62 + Math.sin(m.anim * 5 + k * 0.9) * H * 0.16;
      ellipse(bx, by, W * 0.10, H * 0.22, k % 2 ? body : dark);
    }

    // 颈 + 兜帽
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(W * 0.34, H * 0.72);
    ctx.quadraticCurveTo(W * 0.52, H * 0.34, W * 0.72, H * 0.44);
    ctx.quadraticCurveTo(W * 0.56, H * 0.52, W * 0.46, H * 0.84);
    ctx.closePath(); ctx.fill();

    // 蛇头 + 头鳞
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(W * 0.72, H * 0.42, W * 0.20, H * 0.17, -0.25, 0, 6.2832); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(W * 0.66, H * 0.36, W * 0.10, H * 0.06, -0.25, 0, 6.2832); ctx.fill();

    // 竖瞳
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(W * 0.76, H * 0.36, 2.2, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillRect(W * 0.752, H * 0.30, 1.2, 4.2);

    // 信子
    const tg = Math.sin(m.anim * 9) * 2;
    ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(W * 0.90, H * 0.48);
    ctx.lineTo(W * 1.02, H * 0.50 + tg);
    ctx.moveTo(W * 0.99, H * 0.50 + tg); ctx.lineTo(W * 1.05, H * 0.44 + tg);
    ctx.moveTo(W * 0.99, H * 0.50 + tg); ctx.lineTo(W * 1.06, H * 0.56 + tg);
    ctx.stroke();
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

  // ---------- 绘制：刀芒（近战扇形） ----------
  function drawSlash(s) {
    const a = Math.max(0, s.life / s.max);
    const fwd = s.dir > 0 ? 0 : Math.PI;
    ctx.save();
    ctx.translate(Math.round(s.x), Math.round(s.y));
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, s.range, fwd - s.arc / 2, fwd + s.arc / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,138,91,0.28)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,120,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, s.range, fwd - s.arc / 2, fwd + s.arc / 2); ctx.stroke();
    ctx.restore();
  }

  // ---------- 绘制：飞弹（飞剑 / 雷符） ----------
  function drawProj(s) {
    const sz = s.size || 1;
    if (s.kind === 'thunder') {
      // 雷符：发光雷珠 + 锯齿电光
      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 11 * sz);
      g.addColorStop(0, '#fff7c0'); g.addColorStop(0.4, '#c9a8ff'); g.addColorStop(1, 'rgba(120,90,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 11 * sz, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#e6d2ff'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(4 * sz, -3 * sz); ctx.lineTo(1 * sz, -6 * sz); ctx.lineTo(6 * sz, -9 * sz);
      ctx.moveTo(0, 0); ctx.lineTo(-4 * sz, 3 * sz); ctx.lineTo(-1 * sz, 6 * sz); ctx.lineTo(-6 * sz, 9 * sz);
      ctx.stroke();
      ctx.fillStyle = '#fff7c0'; ctx.beginPath(); ctx.arc(0, 0, 3 * sz, 0, 6.28); ctx.fill();
      ctx.restore();
      return;
    }
    // 飞剑：真实剑形（追魂=翠青，其余=冰蓝）
    const ang = Math.atan2(s.vy, s.vx);
    ctx.save();
    ctx.translate(Math.round(s.x), Math.round(s.y));
    ctx.rotate(ang);
    const bladeCol = s.homing ? '#c9ffe6' : '#dff0ff';
    const edgeCol  = s.homing ? '#7dffc0' : '#9fd4ff';
    const guardCol = s.homing ? '#e8c95a' : '#c9a84a';
    const glowCol  = s.homing ? 'rgba(120,255,190,0.30)' : 'rgba(120,200,255,0.30)';
    // 拖影光晕
    ctx.fillStyle = glowCol;
    ctx.beginPath();
    ctx.moveTo(20 * sz, 0); ctx.lineTo(-11 * sz, -7 * sz); ctx.lineTo(-11 * sz, 7 * sz);
    ctx.closePath(); ctx.fill();
    // 剑身（尖头菱形双刃）
    ctx.fillStyle = bladeCol;
    ctx.beginPath();
    ctx.moveTo(17 * sz, 0);          // 剑尖
    ctx.lineTo(-5 * sz, -2.6 * sz);  // 上刃根
    ctx.lineTo(-9 * sz, -2.6 * sz);  // 护手处上
    ctx.lineTo(-9 * sz, 2.6 * sz);   // 护手处下
    ctx.lineTo(-5 * sz, 2.6 * sz);   // 下刃根
    ctx.closePath(); ctx.fill();
    // 剑脊高光
    ctx.strokeStyle = edgeCol; ctx.lineWidth = Math.max(1, 1 * sz);
    ctx.beginPath(); ctx.moveTo(15 * sz, 0); ctx.lineTo(-6 * sz, 0); ctx.stroke();
    // 护手（横）
    ctx.fillStyle = guardCol;
    ctx.fillRect(-11 * sz, -5 * sz, 3 * sz, 10 * sz);
    // 剑柄
    ctx.fillStyle = '#5a3b2a';
    ctx.fillRect(-18 * sz, -2 * sz, 7 * sz, 4 * sz);
    // 剑首
    ctx.fillStyle = guardCol;
    ctx.beginPath(); ctx.arc(-18 * sz, 0, 2.6 * sz, 0, 6.2832); ctx.fill();
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
    for (const s of slashes) drawSlash(s);
    for (const s of swords) drawProj(s);
    if (!player.dead) drawPlayer();

    ctx.restore();

    const info = realmInfo();
    elHp.style.width = (player.hp / player.maxhp * 100) + '%';
    elHerb.textContent = herbs;
    elKill.textContent = kills;
    elFoe.textContent = monsters.length + '/' + targetFoeCount();
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
