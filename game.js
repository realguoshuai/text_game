/* 凡人修仙录 · 实时版
 * 原生 Canvas 2D，零依赖、零构建。弱机友好：实体数量有上限、dt 钳制、无重特效。
 * 操控：WASD / 方向键 移动，J / 空格 发飞剑；手机：左半屏拖动=浮动摇杆，右半屏点按=出剑，飞剑钮可拖动摆放。
 */
(() => {
  'use strict';

  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ---------- 视口 / 斗法场 ----------
  // 斗法场＝屏幕：所有实体恒在可视范围内。武器打不到屏幕外，也不会出现"没看见怪就死了"。
  let VW = 0, VH = 0, zoom = 1;
  const WORLD = { w: 900, h: 560 };
  const ARENA_MIN = { w: 640, h: 400 };   // 太小则保底，免得手机竖屏挤成一团
  const ARENA_MAX = { w: 1180, h: 780 };  // 太大则封顶，免得大屏上妖兽走半天才到

  // 洞窟装饰（晶簇）：随斗法场尺寸重建
  const deco = [];
  function rebuildDeco() {
    deco.length = 0;
    const n = Math.max(16, Math.round(WORLD.w * WORLD.h / 26000));
    for (let i = 0; i < n; i++) {
      deco.push({
        x: 24 + Math.random() * (WORLD.w - 48),
        y: 24 + Math.random() * (WORLD.h - 48),
        c: Math.random() < 0.5 ? '#3a2f6b' : '#236b5d',
        r: 5 + Math.random() * 12,
        glow: Math.random() < 0.4
      });
    }
  }

  function resize() {
    VW = cv.clientWidth || window.innerWidth;
    VH = cv.clientHeight || window.innerHeight;
    cv.width = VW; cv.height = VH;
    const nw = Math.round(Math.max(ARENA_MIN.w, Math.min(ARENA_MAX.w, VW)));
    const nh = Math.round(Math.max(ARENA_MIN.h, Math.min(ARENA_MAX.h, VH)));
    if (nw !== WORLD.w || nh !== WORLD.h) { WORLD.w = nw; WORLD.h = nh; rebuildDeco(); }
    zoom = Math.min(VW / WORLD.w, VH / WORLD.h);   // 整块斗法场铺进屏幕
  }
  resize();
  window.addEventListener('resize', function () { resize(); if (typeof fitWorld === 'function') fitWorld(); });

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
  // 境界阈值（斩妖数）。同屏妖兽变多后杀怪速度大涨，阈值随之上调，突破才有分量。
  const TIER_KILLS = [8, 20, 40, 70];
  function tierIdx() {
    const k = kills;
    if (k < TIER_KILLS[0]) return 0;
    if (k < TIER_KILLS[1]) return 1;
    if (k < TIER_KILLS[2]) return 2;
    if (k < TIER_KILLS[3]) return 3;
    return 4;
  }
  // 妖兽血量随境界递增（身形也随之长大）
  function diffScaler() { return 1 + tierIdx() * 0.32; }
  // 伤害单独走更缓的曲线：同屏兽潮是原来的两倍，按原倍率会被围死，爽感变挫败感
  function dmgScaler() { return 1 + tierIdx() * 0.17; }
  // 兽潮规模随境界递增：炼气 10 → 筑基 16 → 金丹 22 → 元婴 28 → 化神 34
  const FOE_BY_TIER = [10, 16, 22, 28, 34];
  function targetFoeCount() { return FOE_BY_TIER[tierIdx()]; }
  // 每波间隔（秒），境界越高来得越急
  const WAVE_GAP_BY_TIER = [6.6, 6.0, 5.4, 4.8, 4.2];

  let uid = 0;
  // 贴边落点：妖兽从斗法场四边涌入
  function edgePos(edge) {
    const M = 26;
    if (edge === 0) return { x: 40 + Math.random() * (WORLD.w - 80), y: M * 0.6 };
    if (edge === 1) return { x: 40 + Math.random() * (WORLD.w - 80), y: WORLD.h - M * 0.6 };
    if (edge === 2) return { x: M * 0.6, y: 40 + Math.random() * (WORLD.h - 80) };
    return { x: WORLD.w - M * 0.6, y: 40 + Math.random() * (WORLD.h - 80) };
  }
  function spawnMonster(edge, rush) {
    const e = (edge == null) ? (Math.random() * 4 | 0) : edge;
    const pos = edgePos(e);
    // 后期出现更强种类
    const t = tierIdx();
    const r = Math.random();
    let type;
    // 同屏妖兽多，种类提前铺开，免得开局一片全是妖狼
    if (t === 0) type = r < 0.72 ? 'wolf' : 'spider';
    else if (t === 1) type = r < 0.46 ? 'wolf' : r < 0.78 ? 'spider' : 'toad';
    else if (t === 2) type = r < 0.30 ? 'wolf' : r < 0.55 ? 'spider' : r < 0.80 ? 'toad' : 'ghost';
    else type = ['wolf', 'spider', 'toad', 'ghost', 'serpent'][Math.floor(Math.random() * 5)];
    const d = MTYPE[type];
    const mul = diffScaler();
    const grow = 1 + t * 0.05;                        // 境界越高，妖兽身形越大
    const elite = t >= 2 && Math.random() < 0.14;     // 金丹之后出现精英（血厚、带光环）
    const hpMul = mul * (elite ? 1.9 : 1);
    return {
      id: ++uid, type, x: pos.x, y: pos.y, face: 1, elite,
      w: Math.round(d.w * grow), h: Math.round(d.h * grow),
      color: d.color, dark: d.dark, glow: d.glow,
      hp: Math.round(d.hp * hpMul), maxhp: Math.round(d.hp * hpMul),
      speed: d.speed * (elite ? 1.06 : 1) * (1 + t * 0.06),   // 场地小，速度随境界微增，保证压上来
      dmg: Math.round(d.dmg * dmgScaler() * (elite ? 1.3 : 1)),
      sway: Math.random() * 6.283,                    // 冲锋时的侧向摆动相位（免得整队排成一条线）
      rush: rush ? 1.15 : 0,                          // 涌进场的加速冲刺
      dx: 0, dy: 0, hit: 0, anim: Math.random() * 6
    };
  }
  let monsters = [];
  let herbs = 0, kills = 0;

  // ---------- 兽潮：成波涌来，波与波之间留出喘息与拾取的空档 ----------
  let waveTimer = 2.6, waveNo = 0, waveEdge = 2, dripTimer = 0, waveCall = null;
  function launchWave(silent) {
    const target = targetFoeCount();
    if (monsters.length >= target) return 0;
    waveNo++;
    waveEdge = Math.floor(Math.random() * 4);
    const n = Math.max(3, Math.round(target * 0.42));
    let spawned = 0;
    for (let i = 0; i < n && monsters.length < target; i++) { monsters.push(spawnMonster(waveEdge, true)); spawned++; }
    // 不用 toast（每几秒弹一次太吵）：在场边画方向提示，顺带告诉你该朝哪边打
    if (spawned && !silent) waveCall = { edge: waveEdge, no: waveNo, t: 1.5 };
    return spawned;
  }
  for (let i = 0; i < Math.ceil(targetFoeCount() * 0.6); i++) monsters.push(spawnMonster(null, true));

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

  // ---------- 割草反馈：碎屑 / 冲击环 / 震屏 / 连斩 ----------
  const parts = [];
  const rings = [];
  let shake = 0, combo = 0, comboT = 0, comboPop = 0, comboBest = 0, clock = 0;
  // 连斩＝最近 1.2 秒内的击杀数（衡量"割草速度"），不是累计击杀数，否则会涨到几百毫无意义
  const COMBO_WIN = 1.2;
  const killTimes = [];
  function burst(x, y, col, n, big) {
    if (parts.length < 210) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.2832, sp = 40 + Math.random() * (big ? 260 : 165);
        parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.3 + Math.random() * 0.32, max: 0.62, col, sz: 2 + Math.random() * 3.2
        });
      }
    }
    if (rings.length < 22) rings.push({ x, y, r: big ? 10 : 7, grow: big ? 190 : 118, life: 0.26, max: 0.26, col });
  }
  function trimFx() {
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
    for (let i = rings.length - 1; i >= 0; i--) if (rings[i].life <= 0) rings.splice(i, 1);
  }
  // 场上越乱，单次击杀的抖动越小，避免持续晃眼
  function addShake(v) { shake = Math.min(9, shake + v); }

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
  function realmInfo() { const t = tierIdx(); return { name: TIER_NAMES[t], skill: SKILL_NAMES[player.char.id][t] }; }

  // ---------- 玩家 ----------
  const player = {
    x: WORLD.w / 2, y: WORLD.h / 2, w: 28, h: 44,
    char: CHARS[0], speed: CHARS[0].speed, hp: 100, maxhp: 100, face: 1, atkCd: 0, inv: 0,
    dead: false, respawn: 0, anim: 0
  };
  window.GameAPI = {
    selectChar(id) { const c = CHARS.find(x => x.id === id); if (c) { player.char = c; player.speed = c.speed; } },
    // 供自动化/桩测试读取运行态（不改游戏行为）
    stats() {
      return {
        kills, wave: waveNo, foes: monsters.length, target: targetFoeCount(),
        hp: Math.round(player.hp), dead: player.dead, combo, comboBest,
        parts: parts.length, rings: rings.length, swords: swords.length, slashes: slashes.length,
        world: [WORLD.w, WORLD.h], zoom, waveTimer: +waveTimer.toFixed(2)
      };
    }
  };
  // ---------- 碰撞 ----------
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- 武器 / 技能（按境界进化，三种修士各异） ----------
  // 射程一律按屏幕短边折算（frac × 短边），所以永远不会飞到屏幕外去打"看不见的怪"。
  function arenaMin() { return Math.min(WORLD.w, WORLD.h); }
  function weaponCfg() {
    const w = player.char.id, t = tierIdx(), R = arenaMin();
    if (w === 'thunder') {
      const B = [
        { count: 1, spread: 0,    speed: 560, dmg: 11, frac: 0.70, pierce: true, cd: 0.26 },
        { count: 2, spread: 0.18, speed: 600, dmg: 12, frac: 0.80, pierce: true, cd: 0.24 },
        { count: 3, spread: 0.24, speed: 640, dmg: 13, frac: 0.90, pierce: true, cd: 0.22 },
        { count: 4, spread: 0.30, speed: 700, dmg: 15, frac: 1.00, pierce: true, cd: 0.20 },
        { count: 5, spread: 0.36, speed: 760, dmg: 18, frac: 1.15, pierce: true, cd: 0.18 }
      ][t];
      return Object.assign({ kind: 'thunder' }, B, { life: R * B.frac / B.speed });
    }
    if (w === 'blade') {
      const B = [
        { range: 46, arc: 1.3, dmg: 24, knock: 150, cd: 0.40 },
        { range: 50, arc: 1.5, dmg: 28, knock: 170, cd: 0.38 },
        { range: 56, arc: 1.7, dmg: 33, knock: 195, cd: 0.36 },
        { range: 62, arc: 1.9, dmg: 39, knock: 225, cd: 0.34 },
        { range: 70, arc: 2.1, dmg: 48, knock: 260, cd: 0.32 }
      ][t];
      // 刀芒是近身技，按屏幕短边等比放大一点点（大屏上不至于够不着）
      const k = Math.max(1, Math.min(1.35, R / 420));
      return Object.assign({ kind: 'blade' }, B, { range: B.range * k, knock: B.knock * k });
    }
    // 御剑仙：飞剑追踪（金丹起带穿透，割草才够爽）
    const B = [
      { count: 1, spread: 0,    homing: false, speed: 520, dmg: 14, frac: 0.75, size: 1.0,  pierce: false, cd: 0.30 },
      { count: 2, spread: 0.20, homing: false, speed: 560, dmg: 15, frac: 0.85, size: 1.1,  pierce: false, cd: 0.28 },
      { count: 3, spread: 0.26, homing: true,  speed: 600, dmg: 16, frac: 0.95, size: 1.1,  pierce: true,  cd: 0.26 },
      { count: 3, spread: 0.32, homing: true,  speed: 660, dmg: 19, frac: 1.05, size: 1.3,  pierce: true,  cd: 0.24 },
      { count: 5, spread: 0.40, homing: true,  speed: 720, dmg: 22, frac: 1.20, size: 1.45, pierce: true,  cd: 0.22 }
    ][t];
    return Object.assign({ kind: 'sword' }, B, { life: R * B.frac / B.speed });
  }
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

  // 击杀结算（碎屑 + 连斩 + 掉落 + 突破提示）。剑/刀共用
  function onKill(j) {
    const m = monsters[j];
    const mx = m.x + m.w / 2, my = m.y + m.h / 2;
    monsters.splice(j, 1);
    kills++;
    // 割草反馈：不补位（减员是看得见的），补员交给兽潮波次
    burst(mx, my, m.glow || '#ffffff', m.elite ? 18 : 9, !!m.elite);
    addShake(m.elite ? 5 : 2);
    combo++; comboT = COMBO_WIN; comboPop = 1;
    killTimes.push(clock);
    if (killTimes.length > 90) killTimes.shift();
    if (items.length < 16) items.push({ x: mx, y: my, kind: ['herb', 'herb', 'stone', 'pill'][Math.floor(Math.random() * 4)], t: 0 });
    while (lastTierIdx < TIER_KILLS.length && kills >= TIER_KILLS[lastTierIdx]) {
      const info = realmInfo();
      elToast.textContent = '突破！' + info.name + ' · ' + info.skill + '　兽潮将至 ' + targetFoeCount() + ' 只';
      elToast.style.display = 'block'; toastT = 2.4;
      lastTierIdx++;
      waveTimer = Math.min(waveTimer, 1.2);   // 突破后立刻起一波，规模立刻见长
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
        // 近战刀芒：面朝方向扇形重创 + 击退（扇形内全中，人堆里越砍越爽）
        const px = player.x + player.w / 2, py = player.y + player.h / 2;
        const fwd = player.face > 0 ? 0 : Math.PI;
        slashes.push({ x: px, y: py, dir: player.face, range: cfg.range, arc: cfg.arc, life: 0.2, max: 0.2 });
        let hits = 0;
        for (let j = monsters.length - 1; j >= 0; j--) {
          const m = monsters[j];
          const dx = m.x + m.w / 2 - px, dy = m.y + m.h / 2 - py;
          const d = Math.hypot(dx, dy);
          if (d > cfg.range + Math.max(m.w, m.h) * 0.5) continue;
          let diff = Math.atan2(dy, dx) - fwd;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          if (Math.abs(diff) > cfg.arc / 2) continue;
          m.hp -= cfg.dmg; m.hit = 0.14;
          hits++;
          const kl = Math.max(1, d);
          m.x = Math.max(0, Math.min(WORLD.w - m.w, m.x + dx / kl * cfg.knock * 0.14));
          m.y = Math.max(0, Math.min(WORLD.h - m.h, m.y + dy / kl * cfg.knock * 0.14));
          if (m.hp <= 0) { burst(m.x + m.w / 2, m.y + m.h / 2, m.glow || '#fff', 5, false); onKill(j); }
        }
        if (hits) addShake(1.6 + Math.min(4, hits * 0.7));
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
      // 射程到边即止：撞在斗法场边界上就散掉，不会飞到屏幕外去打看不见的怪
      if (s.life <= 0 || s.x < 4 || s.x > WORLD.w - 4 || s.y < 4 || s.y > WORLD.h - 4) { swords.splice(i, 1); continue; }
      for (let j = monsters.length - 1; j >= 0; j--) {
        const m = monsters[j];
        if (s.hit.has(m.id)) continue;
        if (aabb({ x: s.x - 9, y: s.y - 9, w: 18, h: 18 }, m)) {
          m.hp -= s.dmg; m.hit = 0.14;
          burst(m.x + m.w / 2, m.y + m.h / 2, m.glow || '#fff', 3, false);
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

    // 妖兽 AI：不再远处乱逛，全部朝玩家压上来（这才是"兽潮"），带轻微侧向摆动免成一条线
    for (const m of monsters) {
      m.anim += dt;
      const dx = player.x + player.w / 2 - (m.x + m.w / 2);
      const dy = player.y + player.h / 2 - (m.y + m.h / 2);
      const l = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / l, uy = dy / l;
      const wob = Math.sin(m.anim * 2.1 + m.sway) * 0.26;
      m.dx = ux - uy * wob; m.dy = uy + ux * wob;
      const ul = Math.hypot(m.dx, m.dy) || 1; m.dx /= ul; m.dy /= ul;
      const spd = m.speed * (m.rush > 0 ? 1.65 : 1);   // 涌进场的一瞬冲得更快
      if (m.rush > 0) m.rush -= dt;
      if (m.dx > 0.15) m.face = 1; else if (m.dx < -0.15) m.face = -1;
      m.x += m.dx * spd * dt;
      m.y += m.dy * spd * dt;
      if (m.hit > 0) m.hit -= dt;
    }

    // 兽群互斥：挤成一坨"兽潮"，而不是全部叠在同一像素上（n≤34，开销可忽略）
    for (let i = 0; i < monsters.length; i++) {
      const a = monsters[i];
      for (let j = i + 1; j < monsters.length; j++) {
        const b = monsters[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const minD = (a.w + b.w) * 0.46;
        if (dx > minD || dx < -minD || dy > minD || dy < -minD) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (minD - d) * 0.5;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
      }
      a.x = Math.max(0, Math.min(WORLD.w - a.w, a.x));
      a.y = Math.max(0, Math.min(WORLD.h - a.h, a.y));
    }

    // 妖兽贴身伤害
    for (const m of monsters) {
      if (aabb(player, m) && player.inv <= 0) {
        player.hp -= m.dmg; player.inv = 0.85;
        burst(player.x + player.w / 2, player.y + player.h / 2, '#ff5a5a', 7, false);
        addShake(6);
        if (player.hp <= 0) { player.hp = 0; player.dead = true; player.respawn = 1.6; }
      }
    }

    // 兽潮波次：成波涌来，波与波之间留空档，让"割完一波"有实感
    waveTimer -= dt;
    if (waveTimer <= 0) { waveTimer = WAVE_GAP_BY_TIER[tierIdx()]; launchWave(false); }
    // 细水补员：只补到目标的一半，剩下的靠下一波涌进来
    dripTimer -= dt;
    if (dripTimer <= 0) {
      dripTimer = 0.9;
      if (monsters.length < Math.ceil(targetFoeCount() * 0.5)) monsters.push(spawnMonster(null, false));
    }

    // 割草反馈推进
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= (1 - 3.2 * dt); p.vy *= (1 - 3.2 * dt);
      p.life -= dt;
    }
    for (let i = rings.length - 1; i >= 0; i--) { const g = rings[i]; g.r += g.grow * dt; g.life -= dt; }
    trimFx();
    if (shake > 0) shake = Math.max(0, shake - dt * 26);
    clock += dt;
    while (killTimes.length && clock - killTimes[0] > COMBO_WIN) killTimes.shift();
    combo = killTimes.length;
    if (combo > comboBest) comboBest = combo;
    if (comboT > 0) comboT -= dt;
    if (comboPop > 0) comboPop = Math.max(0, comboPop - dt * 3.4);
    if (waveCall) { waveCall.t -= dt; if (waveCall.t <= 0) waveCall = null; }

    // 物品：轻微磁吸（割完一波自动往身上收）+ 拾取治疗
    for (let i = items.length - 1; i >= 0; i--) {
      const h = items[i];
      h.t += dt;
      const dx = player.x + player.w / 2 - h.x, dy = player.y + player.h / 2 - h.y;
      const d = Math.hypot(dx, dy);
      if (d < 96 && d > 1) { h.x += dx / d * 132 * dt; h.y += dy / d * 132 * dt; }
      if (aabb(player, { x: h.x - 12, y: h.y - 12, w: 24, h: 24 })) {
        items.splice(i, 1); herbs++;
        const heal = h.kind === 'pill' ? 24 : h.kind === 'stone' ? 9 : 3;
        player.hp = Math.min(player.maxhp, player.hp + heal);
        if (items.length < 7) spawnItem();
      }
    }

    // 斗法场即屏幕，无相机滚动：所有实体恒在可视范围内

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
    // 屏幕底 + 斗法场（整块居中铺满，实测铺不下时只在两侧留极少边带）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#06050d';
    ctx.fillRect(0, 0, VW, VH);

    let ox = (VW - WORLD.w * zoom) / 2, oy = (VH - WORLD.h * zoom) / 2;
    if (shake > 0.05) { ox += (Math.random() - 0.5) * shake; oy += (Math.random() - 0.5) * shake; }
    ctx.setTransform(zoom, 0, 0, zoom, ox, oy);

    // 场地地面
    ctx.fillStyle = '#0d0b1a';
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);

    // 灵脉纹路
    ctx.strokeStyle = 'rgba(120,110,180,0.07)';
    ctx.lineWidth = 1;
    const step = 64;
    ctx.beginPath();
    for (let gx = 0; gx <= WORLD.w; gx += step) { ctx.moveTo(gx, 0); ctx.lineTo(gx, WORLD.h); }
    for (let gy = 0; gy <= WORLD.h; gy += step) { ctx.moveTo(0, gy); ctx.lineTo(WORLD.w, gy); }
    ctx.stroke();

    // 洞窟晶簇
    for (const d of deco) {
      if (d.glow) { ctx.globalAlpha = 0.16; ctx.fillStyle = d.c; ctx.fillRect(d.x - d.r - 4, d.y - d.r - 4, (d.r + 4) * 2, (d.r + 4) * 2); ctx.globalAlpha = 1; }
      ctx.fillStyle = d.c;
      ctx.fillRect(Math.round(d.x - d.r / 2), Math.round(d.y - d.r), d.r, d.r * 2);
    }

    // 冲击环
    for (const g of rings) {
      ctx.globalAlpha = Math.max(0, g.life / g.max) * 0.7;
      ctx.strokeStyle = g.col; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 6.2832); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const h of items) drawItem(h);
    for (const m of monsters) drawMonster(m);
    for (const s of slashes) drawSlash(s);
    for (const s of swords) drawProj(s);
    if (!player.dead) drawPlayer();

    // 兽潮方向提示（在来敌那一侧，箭头指向场内）
    if (waveCall) {
      const e = waveCall.edge;
      const px = e === 2 ? 104 : e === 3 ? WORLD.w - 104 : WORLD.w / 2;
      const py = e === 0 ? 48 : e === 1 ? WORLD.h - 48 : WORLD.h / 2;
      ctx.save();
      ctx.globalAlpha = Math.min(1, waveCall.t / 0.6);
      ctx.translate(px, py);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 15px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,5,16,0.82)';
      const label = '兽潮 · 第' + waveCall.no + ' 波';
      ctx.strokeText(label, 0, 0);
      ctx.fillStyle = '#ff8a5b'; ctx.fillText(label, 0, 0);
      ctx.beginPath();
      if (e === 0) { ctx.moveTo(0, 16); ctx.lineTo(-7, 27); ctx.lineTo(7, 27); }
      else if (e === 1) { ctx.moveTo(0, -16); ctx.lineTo(-7, -27); ctx.lineTo(7, -27); }
      else if (e === 2) { ctx.moveTo(16, 0); ctx.lineTo(27, -7); ctx.lineTo(27, 7); }
      else { ctx.moveTo(-16, 0); ctx.lineTo(-27, -7); ctx.lineTo(-27, 7); }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // 妖兽碎屑（画在最上层，割草才有飞溅感）
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
    }
    ctx.globalAlpha = 1;

    // 场地边框：明确"斗法场＝屏幕"，越界即出界
    ctx.strokeStyle = 'rgba(140,130,220,0.30)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, WORLD.w - 2, WORLD.h - 2);

    // ---- 屏幕坐标层 ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (combo >= 3) {
      const a = Math.min(1, comboT / 0.45);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(VW / 2, Math.max(96, VH * 0.26));
      ctx.scale(1 + comboPop * 0.3, 1 + comboPop * 0.3);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 30px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(8,5,16,0.85)';
      ctx.strokeText('连斩 ×' + combo, 0, 0);
      ctx.fillStyle = combo >= 25 ? '#ffd24a' : combo >= 12 ? '#ff9a4a' : '#ffe27a';
      ctx.fillText('连斩 ×' + combo, 0, 0);
      ctx.font = 'bold 13px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText(combo >= 12 ? '割草中' : '收割中', 0, 27);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(combo >= 12 ? '割草中' : '收割中', 0, 27);
      ctx.restore();
    }

    const info = realmInfo();
    elHp.style.width = (player.hp / player.maxhp * 100) + '%';
    elHerb.textContent = herbs;
    elKill.textContent = kills;
    elFoe.textContent = monsters.length + '/' + targetFoeCount();
    elRealm.textContent = info.name + ' · ' + info.skill;
    elDeath.style.display = player.dead ? 'flex' : 'none';
  }

  // 屏幕尺寸/方向变化后，把越界实体收回斗法场内（斗法场即屏幕，不能有实体留在场外）
  function fitWorld() {
    player.x = Math.max(0, Math.min(WORLD.w - player.w, player.x));
    player.y = Math.max(0, Math.min(WORLD.h - player.h, player.y));
    for (const m of monsters) {
      m.x = Math.max(0, Math.min(WORLD.w - m.w, m.x));
      m.y = Math.max(0, Math.min(WORLD.h - m.h, m.y));
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
