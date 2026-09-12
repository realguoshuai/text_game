/* 凡人修仙录 · 实时版
 * 原生 Canvas 2D，零依赖、零构建。弱机友好：实体数量有上限、dt 钳制、无重特效。
 * 操控：WASD / 方向键 移动，J / 空格 发飞剑；手机：左半屏拖动=浮动摇杆，右半屏点按=出剑，飞剑钮可拖动摆放。
 */
(() => {
  'use strict';

  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ---------- 视口 / 大地图 ----------
  // 大地图 + 相机跟随：地图约为屏幕的 2×2 倍，妖兽散在地图各处、错开涌来，
  // 密度自然回落（不再像"斗法场＝屏幕"那样全挤在一屏里）。
  // 但武器射程仍按屏幕短边折算、出视野即散——不会出现"没看见怪就被打死"。
  let VW = 0, VH = 0;
  const WORLD = { w: 1600, h: 1100 };
  const cam = { x: 0, y: 0 };
  function viewMin() { return Math.min(VW, VH); }
  function viewMax() { return Math.max(VW, VH); }

  // ---------- 设置（持久化；画质档位决定特效开销） ----------
  const SET_KEY = 'im_set_v1';
  const Settings = (function () {
    const o = loadJSON(SET_KEY, null);
    const s = (o && typeof o === 'object') ? o : {};
    return {
      aim: s.aim !== false,                                              // 辅助瞄准：默认开（"打不到身后的怪"是手机上最大的痛点）
      q: (s.q === 'high' || s.q === 'mid' || s.q === 'low') ? s.q : 'auto',
      fps: !!s.fps,
      // 首次加载（还没有 im_set_v1）时继承旧版的静音开关，之后以设置面板为准
      sound: (s.sound !== undefined) ? !!s.sound : (function () { try { return localStorage.getItem('im_mute') !== '1'; } catch (_) { return true; } })()
    };
  })();
  function saveSettings() { saveJSON(SET_KEY, Settings); }

  // 实际生效的画质：0=低 1=中 2=高。auto 档从高起步，实测掉帧再自动降（只降不升，免得来回跳）
  let qLevel = 2, autoCap = 2, menuPaused = false, fpsShown = 60;
  function applyQuality() {
    if (Settings.q === 'high') qLevel = 2;
    else if (Settings.q === 'mid') qLevel = 1;
    else if (Settings.q === 'low') qLevel = 0;
    else qLevel = autoCap;
  }

  // ---------- 辅助瞄准：出招时转向"最近的威胁"（面朝方向仍有偏好，不是无脑转头） ----------
  function aimAngle() {
    const baseA = player.face > 0 ? 0 : Math.PI;
    if (!Settings.aim) return baseA;
    const px = player.x + player.w / 2, py = player.y + player.h / 2;
    const range = viewMax() * 1.05;
    let bestA = baseA, bestScore = 1e9, found = false;
    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i];
      if (!m) continue;
      const mx = m.x + m.w / 2, my = m.y + m.h / 2;
      if (mx < cam.x - 40 || mx > cam.x + VW + 40 || my < cam.y - 40 || my > cam.y + VH + 40) continue;
      const dx = mx - px, dy = my - py;
      const d = Math.hypot(dx, dy);
      if (d > range) continue;
      const a = Math.atan2(dy, dx);
      let diff = a - baseA;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const score = d - Math.cos(diff) * 110;    // 面朝方向的怪优先（最多可抵 110px 距离）
      if (score < bestScore) { bestScore = score; bestA = a; found = true; }
    }
    return found ? bestA : baseA;
  }

  // ---------- 冲遁（闪避）：短距位移 + 无敌，被围住时的活路，也是躲妖王冲击波的手段 ----------
  const DASH_SPEED = 660, DASH_TIME = 0.2, DASH_CD = 2.0;
  let dashT = 0, dashCd = 0, dashDX = 1, dashDY = 0;
  function tryDash() {
    if (dashT > 0 || dashCd > 0 || player.dead || paused || runOver || menuPaused) return false;
    let dx = 0, dy = 0;
    if (joy.active) { dx = joy.x; dy = joy.y; }
    else { dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0); dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0); }
    const l = Math.hypot(dx, dy);
    if (l > 0.15) { dx /= l; dy /= l; } else { dx = player.face > 0 ? 1 : -1; dy = 0; }
    dashDX = dx; dashDY = dy; dashT = DASH_TIME; dashCd = DASH_CD;
    Sfx.dash();
    buzz(14);
    return true;
  }

  // ---------- 世界背景：一次性预渲染到离屏画布 ----------
  // 地图是静态的。与其每帧重画几百笔格线，不如把灵脉、符阵、山石、云海一次性画进离屏 canvas，
  // 主循环里只 drawImage 一块"视口大小"的图 —— 画面厚了，开销反而更低（弱机也能开满）。
  let bgCv = null;
  // 妖兽/道具图集（freepixel.art）：就绪前为 null，drawMonster/buildWorldBg 自动退回程序化立绘 / 无地图道具。
  // 必须在此处（buildWorldBg 首次被 resize 调用之前）声明，否则顶层执行到 buildWorldBg 时 propImg 处于暂时性死区会抛 ReferenceError。
  let foeImg = null, propImg = null;
  // 视野内灵气光点用的确定性噪声（同一个格子永远落在同一处，不用存数组）
  function hash2(i, j) {
    const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function buildWorldBg() {
    bgCv = null;
    let c = null, g = null;
    try {
      c = document.createElement('canvas');
      if (!c || typeof c.getContext !== 'function') return;
      c.width = WORLD.w; c.height = WORLD.h;
      g = c.getContext('2d');
    } catch (_) { return; }
    if (!g) return;

    const W = WORLD.w, H = WORLD.h;
    const A = W * H;
    const rd = function (a, b) { return a + Math.random() * (b - a); };
    // 离屏上下文自己的绘制辅助（不能借用主 ctx 的 poly/limb）
    function blob(pts, col) {
      if (col) g.fillStyle = col;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath(); g.fill();
    }
    function oval(cx, cy, rx, ry, col) {
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 6.2832);
      if (col) { g.fillStyle = col; g.fill(); }
    }

    // 1) 底：深色灵壤
    const lg = g.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0, '#0d1126');
    lg.addColorStop(0.5, '#0a0d1c');
    lg.addColorStop(1, '#100e22');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);

    // 2) 灵土色斑（大块低对比，做出地面起伏）
    const SOIL = ['#131a33', '#0f1a2c', '#161430', '#0d1a26', '#151b2e'];
    g.globalAlpha = 0.55;
    for (let i = 0, n = Math.round(A / 9500); i < n; i++) {
      oval(rd(0, W), rd(0, H), rd(46, 170), rd(30, 110), SOIL[(Math.random() * SOIL.length) | 0]);
    }
    g.globalAlpha = 1;

    // 3) 苔痕 / 灵草（成簇细叶，让地面有活气）
    for (let i = 0, n = Math.round(A / 30000); i < n; i++) {
      const x = rd(20, W - 20), y = rd(20, H - 20);
      g.strokeStyle = 'rgba(96,190,150,' + rd(0.05, 0.13).toFixed(3) + ')';
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0, m = 4 + ((Math.random() * 6) | 0); k < m; k++) {
        const a = -1.5708 + rd(-0.9, 0.9), L = rd(5, 13);
        g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
      }
      g.stroke();
    }

    // 4) 灵脉：三条蜿蜒光河（多层描边 + 一次性光晕）
    g.save();
    for (let v = 0; v < 3; v++) {
      const pts = [];
      let x = rd(0, W), y = rd(0, H), ang = rd(0, 6.2832);
      pts.push([x, y]);
      for (let k = 0; k < 9; k++) {
        ang += rd(-0.75, 0.75);
        const L = rd(160, 340);
        x = Math.max(-60, Math.min(W + 60, x + Math.cos(ang) * L));
        y = Math.max(-60, Math.min(H + 60, y + Math.sin(ang) * L));
        pts.push([x, y]);
      }
      g.shadowColor = 'rgba(110,225,255,0.45)';
      g.shadowBlur = 16;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length - 1; k++) {
        const mx = (pts[k][0] + pts[k + 1][0]) / 2, my = (pts[k][1] + pts[k + 1][1]) / 2;
        g.quadraticCurveTo(pts[k][0], pts[k][1], mx, my);
      }
      g.strokeStyle = 'rgba(70,200,255,0.055)'; g.lineWidth = 15; g.stroke();
      g.strokeStyle = 'rgba(120,230,255,0.09)'; g.lineWidth = 6.5; g.stroke();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(205,248,255,0.20)'; g.lineWidth = 2.1; g.stroke();
    }
    g.restore();

    // 5) 上古符阵：同心圆 + 内接八边 + 环带刻符
    for (let i = 0, n = 4 + ((Math.random() * 3) | 0); i < n; i++) {
      const cx = rd(170, W - 170), cy = rd(170, H - 170);
      const R = rd(78, 165), rot = rd(0, 6.2832);
      const hue = Math.random() < 0.5 ? '140,205,255' : '190,150,255';
      g.strokeStyle = 'rgba(' + hue + ',0.14)'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.stroke();
      g.beginPath(); g.arc(cx, cy, R * 0.66, 0, 6.2832); g.stroke();
      g.strokeStyle = 'rgba(' + hue + ',0.10)';
      g.beginPath(); g.arc(cx, cy, R * 0.30, 0, 6.2832); g.stroke();
      g.strokeStyle = 'rgba(' + hue + ',0.12)';
      g.beginPath();
      for (let k = 0; k <= 8; k++) {
        const a = rot + k * 0.7854;
        const px = cx + Math.cos(a) * R * 0.82, py = cy + Math.sin(a) * R * 0.82;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
      g.strokeStyle = 'rgba(' + hue + ',0.16)'; g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = rot + k * 0.3927;
        g.moveTo(cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.66);
        g.lineTo(cx + Math.cos(a) * R * 0.74, cy + Math.sin(a) * R * 0.74);
      }
      g.stroke();
      g.fillStyle = 'rgba(' + hue + ',0.13)';
      g.beginPath(); g.arc(cx - R * 0.15, cy, R * 0.075, 0, 6.2832); g.fill();
      g.beginPath(); g.arc(cx + R * 0.15, cy, R * 0.075, 0, 6.2832); g.fill();
    }

    // 6) 山石：不规则多边形（影 + 体 + 顶面受光）
    for (let i = 0, n = Math.round(A / 34000); i < n; i++) {
      const x = rd(30, W - 30), y = rd(30, H - 30);
      const R = rd(11, 30), vert = 6 + ((Math.random() * 4) | 0);
      const pts = [];
      for (let k = 0; k < vert; k++) {
        const a = (k / vert) * 6.2832;
        const rr = R * rd(0.68, 1.18);
        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.72]);
      }
      g.globalAlpha = 0.5; oval(x, y + R * 0.34, R * 1.05, R * 0.34, '#05060d'); g.globalAlpha = 1;
      blob(pts, '#1b2138');
      blob(pts.map(function (p) { return [x + (p[0] - x) * 0.68, y + (p[1] - y) * 0.68 - R * 0.22]; }), '#3a466b');
    }

    // 7) 灵晶簇：成束尖晶（带自身微光）
    for (let i = 0, n = Math.round(A / 56000); i < n; i++) {
      const x = rd(24, W - 24), y = rd(24, H - 24);
      const purple = Math.random() < 0.5;
      const col = purple ? '#6a58c8' : '#3fa98e';
      const lit = purple ? '#b9aaff' : '#8ff0d4';
      g.globalAlpha = 0.28; oval(x, y + 3, 16, 7, col); g.globalAlpha = 1;
      for (let k = 0, m = 3 + ((Math.random() * 3) | 0); k < m; k++) {
        const bx = x + rd(-8, 8), by = y + rd(-2, 3);
        const hh = rd(10, 26), ww = rd(3, 6.5), lean = rd(-0.35, 0.35);
        blob([[bx - ww, by], [bx + ww, by], [bx + lean * hh, by - hh]], col);
        blob([[bx - ww * 0.35, by], [bx + ww * 0.35, by], [bx + lean * hh, by - hh]], lit);
      }
    }

    // 8) 云海：大块柔和雾团（预渲染成静态，便宜）
    for (let i = 0, n = Math.round(A / 160000); i < n; i++) {
      const x = rd(0, W), y = rd(0, H), R = rd(190, 430);
      const rg = g.createRadialGradient(x, y, 0, x, y, R);
      rg.addColorStop(0, 'rgba(150,190,235,' + rd(0.03, 0.062).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(150,190,235,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y, R, 0, 6.2832); g.fill();
    }

    // 9) 星点灵气
    for (let i = 0, n = Math.round(A / 13000); i < n; i++) {
      const x = rd(6, W - 6), y = rd(6, H - 6);
      const s = Math.random() < 0.85 ? 1 : 2;
      g.fillStyle = Math.random() < 0.7 ? 'rgba(180,220,255,0.30)' : 'rgba(255,226,160,0.26)';
      g.fillRect(Math.round(x), Math.round(y), s, s);
    }

    // 9.5) 地图道具：freepixel 图集装饰（树/塔/雕像/晶簇/灯笼/骨骸…，融入背景预渲染，各画质档位都显示）
    // 图集未加载时（初始化 / 桩环境）跳过本段；propImg 加载完成会重建背景把道具铺进来。
    if (propImg && propImg.width) {
      const DECOR = [
        ['tree_giant',1,120,160],['tree_maple',1,110,150],['tree_pine',1,100,140],['tree_willow',1,90,130],
        ['tree_dead',1,100,140],['tree_crystal',1,100,140],['tower_ruin',1,100,140],['tower_stone',1,90,130],
        ['tower_wizard',1,110,150],['mausoleum',1,90,120],['hut',1,90,130],['altar',1,70,100],['fountain',1,80,120],
        ['statue_dragon',2,70,100],['statue_lion',2,60,90],['statue_demon',1,80,110],['gate_stone',1,90,130],
        ['gate_bamboo',1,90,120],['arch_stone',1,80,120],['arch_dark',1,80,120],['well',2,60,90],
        ['crystal_stand',2,60,90],['geode',2,60,90],['obelisk',2,50,80],['bamboo',2,80,120],['vine',2,50,90],
        ['rock_moss',5,18,34],['rock_gray',5,16,30],['rock_pile',5,14,28],['rock_moss_lit',5,18,34],['cairn',4,20,36],
        ['grass_tuft',6,10,22],['mush_blue',5,16,30],['mush_red',5,16,30],['crystal_purple',4,30,50],
        ['crystal_blue',4,30,50],['crystal_green',4,24,42],['lantern_red',4,30,50],['lantern_yellow',4,20,36],
        ['brazier',3,28,46],['torch',3,20,40],['campfire',3,22,40],['bones',3,24,44],['skulls',3,24,44],
        ['web_sac',3,26,48],['wisp',3,24,44],['wisp_gold',3,30,52]
      ];
      let cw = 0; const cum = DECOR.map(function (d) { cw += d[1]; return cw; });
      const M = 90;                                   // 距地图边界留白，避免道具压在雾崖上
      const N = Math.max(40, Math.round(A / 30000));
      const placed = [];
      for (let i = 0; i < N; i++) {
        const r = Math.random() * cw;
        let di = 0; while (di < cum.length - 1 && r > cum[di]) di++;
        const d = DECOR[di];
        const th = rd(d[2], d[3]);
        const bx = PROP_BOXES[d[0]];
        if (!bx) continue;
        const wx = rd(M, W - M), wy = rd(M, H - M);
        placed.push([wy, d[0], wx, wy, th, bx, (d[2] <= 36 ? rd(-0.12, 0.12) : 0)]);
      }
      placed.sort(function (a, b) { return a[0] - b[0]; });   // 画家算法：下排后画，自然遮挡
      for (const p of placed) {
        const key = p[1], wx = p[2], wy = p[3], th = p[4], bx = p[5], rot = p[6];
        const sc = th / bx[3];
        const dw = bx[2] * sc, dh = bx[3] * sc;
        g.globalAlpha = 0.22; g.fillStyle = '#000';
        g.beginPath(); g.ellipse(wx, wy + 2, dw * 0.42, dh * 0.10, 0, 0, 6.2832); g.fill();
        g.globalAlpha = 1;
        g.save();
        g.translate(wx, wy);
        if (rot) g.rotate(rot);
        g.drawImage(propImg, bx[0], bx[1], bx[2], bx[3], -dw / 2, -dh, dw, dh);
        g.restore();
      }
    }

    // 10) 地图边界：雾崖 + 远山剪影（走到尽头能"看见"边界）
    g.fillStyle = 'rgba(7,9,20,0.85)';
    for (let i = 0; i < 34; i++) {
      const bw = W / 34, x = i * bw + rd(-bw * 0.3, bw * 0.3);
      blob([[x - bw * 0.9, 0], [x, rd(20, 56)], [x + bw * 0.9, 0]]);
      blob([[x - bw * 0.9, H], [x, H - rd(16, 46)], [x + bw * 0.9, H]]);
    }
    for (let i = 0; i < 22; i++) {
      const bw = H / 22, y = i * bw + rd(-bw * 0.3, bw * 0.3);
      blob([[0, y - bw * 0.9], [rd(18, 52), y], [0, y + bw * 0.9]]);
      blob([[W, y - bw * 0.9], [W - rd(18, 52), y], [W, y + bw * 0.9]]);
    }
    const EDGE = 78;
    const eg = [
      [0, 0, EDGE, 0], [W, 0, W - EDGE, 0],
      [0, 0, 0, EDGE], [0, H, 0, H - EDGE]
    ];
    for (const q of eg) {
      const gr = g.createLinearGradient(q[0], q[1], q[2], q[3]);
      gr.addColorStop(0, 'rgba(3,4,10,0.92)');
      gr.addColorStop(1, 'rgba(3,4,10,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }

    bgCv = c;
  }
  function rebuildDeco() { buildWorldBg(); }

  function resize() {
    VW = cv.clientWidth || window.innerWidth;
    VH = cv.clientHeight || window.innerHeight;
    cv.width = VW; cv.height = VH;
    const nw = Math.round(Math.max(1400, Math.min(2600, VW * 2.0)));
    const nh = Math.round(Math.max(900, Math.min(1900, VH * 2.0)));
    if (nw !== WORLD.w || nh !== WORLD.h || !bgCv) { WORLD.w = nw; WORLD.h = nh; rebuildDeco(); }
  }
  function centerCam() {
    cam.x = Math.max(0, (WORLD.w - VW) / 2);
    cam.y = Math.max(0, (WORLD.h - VH) / 2);
  }
  resize();
  centerCam();
  window.addEventListener('resize', function () { resize(); centerCam(); clampAll(); });

  // ---------- 输入 ----------
  const keys = { up: false, down: false, left: false, right: false, attack: false };
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'attack', KeyJ: 'attack', KeyK: 'attack'
  };
  addEventListener('keydown', e => { if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); } });
  addEventListener('keyup', e => { if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = false; e.preventDefault(); } });
  // Shift：冲遁（一次性触发，按住不连发）
  addEventListener('keydown', e => {
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) { tryDash(); e.preventDefault(); }
  });

  // ---------- 缩放坐标换算（页面被浏览器放大时，指针坐标要换回「未放大」坐标系） ----------
  // ZoomFix 由 index.html 的缩放防线提供；未放大时 ptX/ptY 是恒等函数。
  // 桩测试/异常情况下拿不到 ZoomFix，这里退化恒等，保证不崩。
  const ZF = window.ZoomFix || { on: false, s: 1, ox: 0, oy: 0, ptX: x => x, ptY: y => y };

  // ---------- 浮动摇杆（左半屏触点出现，不固定位置） ----------
  const joy = { active: false, x: 0, y: 0, id: null };
  const joyEl = document.getElementById('joystick');
  const joyKnob = document.getElementById('joy-knob');
  const JOY_R = 48;
  function joyStart(e) {
    if (ZF.ptX(e.clientX) > cv.clientWidth / 2) return; // 右半屏留给出剑
    joy.active = true; joy.id = e.pointerId;
    const size = joyEl.offsetWidth || 120;
    joyEl.style.left = (ZF.ptX(e.clientX) - size / 2) + 'px';
    joyEl.style.top = (ZF.ptY(e.clientY) - size / 2) + 'px';
    joyEl.style.right = 'auto'; joyEl.style.bottom = 'auto';
    joyEl.style.display = 'block';
    joyKnob.style.transform = 'translate(0px,0px)';
    joyMove(e); e.preventDefault();
  }
  function joyMove(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    const rect = joyEl.getBoundingClientRect();
    const cx = ZF.ptX(rect.left + rect.width / 2), cy = ZF.ptY(rect.top + rect.height / 2);
    let dx = ZF.ptX(e.clientX) - cx, dy = ZF.ptY(e.clientY) - cy;
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
    if (ZF.ptX(e.clientX) > cv.clientWidth / 2) { keys.attack = true; }
    else { joyStart(e); }
  });
  cv.addEventListener('pointerup', e => { if (ZF.ptX(e.clientX) > cv.clientWidth / 2) keys.attack = false; });
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

  // ---------- 冲遁钮（半透明，冷却时更淡） ----------
  const btnDash = document.getElementById('btn-dash');
  if (btnDash) {
    btnDash.addEventListener('pointerdown', e => { tryDash(); e.preventDefault(); e.stopPropagation(); });
  }

  btnAtk.addEventListener('pointerdown', e => {
    keys.attack = true; atkDrag = true; atkMoved = false;
    atkSX = ZF.ptX(e.clientX); atkSY = ZF.ptY(e.clientY);
    const r = btnAtk.getBoundingClientRect(); atkOX = ZF.ptX(r.left); atkOY = ZF.ptY(r.top);
    if (btnAtk.setPointerCapture) { try { btnAtk.setPointerCapture(e.pointerId); } catch (_) {} }
    e.preventDefault(); e.stopPropagation();
  });
  btnAtk.addEventListener('pointermove', e => {
    if (!atkDrag) return;
    const dx = ZF.ptX(e.clientX) - atkSX, dy = ZF.ptY(e.clientY) - atkSY;
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
    wolf:    { name: '青狼妖', hp: 26, speed: 60, dmg: 9,  w: 38, h: 30, color: '#5f6f63', dark: '#3d4a42', glow: '#ff5a3a' },
    spider:  { name: '玄纹蛛', hp: 20, speed: 52, dmg: 7,  w: 36, h: 30, color: '#6a4a92', dark: '#452e63', glow: '#ffd24a' },
    toad:    { name: '焚天蟾', hp: 48, speed: 40, dmg: 14, w: 44, h: 34, color: '#a8552f', dark: '#6e3418', glow: '#ffb03a' },
    ghost:   { name: '阴煞',   hp: 18, speed: 82, dmg: 8,  w: 32, h: 36, color: '#c3daf0', dark: '#8aa8c8', glow: '#7fe8ff' },
    serpent: { name: '玄蛟',   hp: 30, speed: 96, dmg: 11, w: 40, h: 26, color: '#2f9e6a', dark: '#1c6b47', glow: '#ff6a5a' }
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
  // 兽潮规模随境界递增：炼气 8 → 筑基 12 → 金丹 16 → 元婴 20 → 化神 25
  // 这是"全地图总量"。屏幕上同时能看到多少，另由"收拢距离"控制（见 AI 里的 chaseR）
  const FOE_BY_TIER = [8, 12, 16, 20, 25];
  function targetFoeCount() { return FOE_BY_TIER[tierIdx()]; }
  // 每波间隔（秒），境界越高来得越急
  const WAVE_GAP_BY_TIER = [6.6, 6.0, 5.4, 4.8, 4.2];

  let uid = 0;
  // 落点 A：从视野的某一边外侧涌进（成波用，方向可播报）
  // 落点 B：绕视野一圈的环带（零散补员用，散得开、不会全挤在一侧）
  function edgePos(edge) {
    const M = 52;
    if (edge === 0) return { x: cam.x + Math.random() * VW, y: cam.y - M };
    if (edge === 1) return { x: cam.x + Math.random() * VW, y: cam.y + VH + M };
    if (edge === 2) return { x: cam.x - M, y: cam.y + Math.random() * VH };
    return { x: cam.x + VW + M, y: cam.y + Math.random() * VH };
  }
  function ringPos() {
    const r0 = viewMax() * 0.78, r1 = viewMax() * 1.30;
    const a = Math.random() * 6.2832, r = r0 + Math.random() * (r1 - r0);
    return { x: cam.x + VW / 2 + Math.cos(a) * r, y: cam.y + VH / 2 + Math.sin(a) * r };
  }
  function clampSpot(p) {
    return {
      x: Math.max(20, Math.min(WORLD.w - 60, p.x)),
      y: Math.max(20, Math.min(WORLD.h - 60, p.y))
    };
  }
  function spawnMonster(edge, rush) {
    const pos = clampSpot(edge == null ? ringPos() : edgePos(edge));
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
      speed: d.speed * (elite ? 1.06 : 1) * (1 + t * 0.06),   // 地图变大，速度随境界微增，保证压得上来
      dmg: Math.round(d.dmg * dmgScaler() * (elite ? 1.3 : 1)),
      sway: Math.random() * 6.283,                    // 冲锋时的侧向摆动相位（免得整队排成一条线）
      rush: rush ? 1.15 : 0,                          // 涌进场的加速冲刺
      wander: 0, wanderA: 0,                          // 离得太远时先游荡（免得全图同时扑过来塞满屏幕）
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
    const n = Math.max(3, Math.round(target * 0.34));
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
    // 落在地图各处没意义（没人会翻遍整幅图），改成落在视野附近，保证"看得见、捡得到"
    const M = 110;
    items.push({
      x: Math.max(30, Math.min(WORLD.w - 30, cam.x - M + Math.random() * (VW + M * 2))),
      y: Math.max(30, Math.min(WORLD.h - 30, cam.y - M + Math.random() * (VH + M * 2))),
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
    if (qLevel <= 0) return;                                    // 低画质：碎屑与冲击环全免
    if (qLevel === 1) n = Math.max(1, Math.ceil(n * 0.5));      // 中画质：粒子减半
    const pCap = qLevel === 1 ? 90 : 210, rCap = qLevel === 1 ? 8 : 22;
    if (parts.length < pCap) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.2832, sp = 40 + Math.random() * (big ? 260 : 165);
        parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.3 + Math.random() * 0.32, max: 0.62, col, sz: 2 + Math.random() * 3.2
        });
      }
    }
    if (rings.length < rCap) rings.push({ x, y, r: big ? 10 : 7, grow: big ? 190 : 118, life: 0.26, max: 0.26, col });
  }
  function trimFx() {
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
    for (let i = rings.length - 1; i >= 0; i--) if (rings[i].life <= 0) rings.splice(i, 1);
  }
  // 场上越乱，单次击杀的抖动越小，避免持续晃眼
  function addShake(v) { shake = Math.min(9, shake + v * (qLevel >= 1 ? 1 : 0.5)); }

  // ---------- 可选修士（三种外形 / 武器 / 技能） ----------
  // hpBase：近战要贴脸挨打，血厚；雷修脆皮但清群快
  const CHARS = [
    { id: 'sword',   name: '御剑仙',   color: '#3a5a8c', accent: '#dff0ff', speed: 158, hpBase: 105, weapon: 'sword'   },
    { id: 'thunder', name: '雷法真君', color: '#5b3a8c', accent: '#ffe27a', speed: 150, hpBase: 95,  weapon: 'thunder' },
    { id: 'blade',   name: '赤焰刀客', color: '#8c3a3a', accent: '#ff8a5b', speed: 174, hpBase: 132, weapon: 'blade'   }
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
    dead: false, respawn: 0, anim: 0,
    dir: 'down', walkT: 0                // 四向朝向 + 行走动画计时（像素立绘用）
  };

  // ---------- 像素角色图集（国风武侠免费素材，见 assets/CREDITS.txt） ----------
  // 规格：6 列 × 5 行，单帧 64×64。行序：0 正面待机 / 1 正面行走 / 2 侧面行走 / 3 背面行走 / 4 背面待机
  // 站立时一律取该行第 0 帧（生成时已把最中性的一帧旋到首位），所以不会出现"站立却劈叉"的姿势。
  // 加载失败 / 桩测试环境会自动退回原来的程序化立绘，不影响可玩性。
  const SPRITE_ROWS = { down: [0, 1], up: [4, 3], side: [0, 2] };   // [待机行, 行走行]
  const sprites = { sword: null, thunder: null, blade: null };
  const spriteFlash = { sword: null, thunder: null, blade: null }; // 受击白闪用的同规格剪影
  (function loadSprites() {
    if (typeof Image === 'undefined') return;
    for (const id in sprites) {
      const im = new Image();
      im.onload = function () {
        if (!im.width || im.width < 64) { sprites[id] = null; return; }
        sprites[id] = im;
        try {
          const fc = document.createElement('canvas');
          fc.width = im.width; fc.height = im.height;
          const g = fc.getContext('2d');
          g.drawImage(im, 0, 0);
          g.globalCompositeOperation = 'source-in';   // 只保留人物像素，涂成纯白
          g.fillStyle = '#ffffff';
          g.fillRect(0, 0, fc.width, fc.height);
          spriteFlash[id] = fc;
        } catch (e) { spriteFlash[id] = null; }
      };
      im.onerror = function () { sprites[id] = null; };
      im.src = 'assets/char_' + id + '.png';
    }
  })();

  // ---------- 妖兽 / 地图道具图集（freepixel.art 免费商用素材，见 assets/CREDITS.txt） ----------
  // foes.png：6 列 × 2 行，每格 200px，内容底边居中。坐标来自 build_free_assets.py 产出的 foes.json。
  // props.png：6 列 × 8 行，每格 200px，内容底边居中。坐标来自 props.json。
  // 直接用 build 脚本裁掉透明边后的「绝对包围盒」：游戏端免坐标表、免网格换算，零同步风险。
  const FOE_BOXES = {
    wolf:        [16, 29, 167, 169],     wolf_elite:   [214, 39, 172, 159],
    spider:      [410, 10, 179, 188],    spider_elite: [624, 30, 152, 168],
    toad:        [826, 45, 148, 153],    toad_elite:   [1021, 81, 158, 117],
    ghost:       [29, 245, 142, 153],    ghost_elite:  [230, 235, 139, 163],
    serpent:     [411, 237, 178, 161],   serpent_elite: [614, 217, 171, 181],
    boss1:       [812, 210, 176, 188],   boss2:        [1019, 230, 161, 168]
  };
  const PROP_BOXES = {
    tree_giant:[0,13,200,185], tree_maple:[216,19,168,179], tree_pine:[445,33,109,165],
    tree_willow:[658,38,83,160], tree_dead:[841,31,118,167], tree_crystal:[1040,49,120,149],
    bamboo:[48,246,103,152], tower_ruin:[253,238,94,160], tower_stone:[426,269,148,129],
    tower_wizard:[626,219,148,179], mausoleum:[826,246,148,152], arch_dark:[1030,235,140,163],
    arch_stone:[20,432,160,166], gate_stone:[238,431,123,167], gate_bamboo:[422,433,156,165],
    statue_dragon:[634,421,132,177], statue_lion:[849,433,102,165], statue_demon:[1020,421,160,177],
    well:[46,643,108,155], hut:[205,616,190,182], altar:[461,657,78,141], fountain:[646,635,108,163],
    crystal_stand:[850,657,100,141], geode:[1043,648,114,150], rock_moss:[22,889,155,109],
    rock_gray:[270,934,60,64], rock_pile:[429,878,141,120], rock_moss_lit:[625,841,150,157],
    cairn:[827,872,145,126], grass_tuft:[1055,887,89,111], mush_blue:[21,1032,158,166],
    mush_red:[226,1030,148,168], crystal_purple:[432,1039,135,159], crystal_blue:[622,1028,155,170],
    crystal_green:[844,1074,112,124], lantern_red:[1015,1016,170,182], lantern_yellow:[70,1288,60,110],
    brazier:[261,1262,78,136], torch:[487,1230,26,168], campfire:[648,1275,103,123],
    bones:[813,1236,174,162], skulls:[1021,1249,158,149], web_sac:[52,1408,96,190],
    wisp:[254,1451,92,147], wisp_gold:[429,1444,142,154], obelisk:[673,1453,54,145], vine:[849,1495,101,103]
  };
  (function loadAtlases() {
    if (typeof Image === 'undefined') return;          // 桩环境：退回程序化妖兽 / 无地图道具
    const fl = new Image();
    fl.onload = function () { if (fl.width) foeImg = fl; };
    fl.onerror = function () { foeImg = null; };
    fl.src = 'assets/foes.png';
    const pl = new Image();
    pl.onload = function () {
      if (!pl.width) return;
      propImg = pl;
      try { rebuildDeco(); } catch (_) {}              // 图集就绪后重绘背景，把道具铺进去
    };
    pl.onerror = function () { propImg = null; };
    pl.src = 'assets/props.png';
  })();
  // 妖兽 → 图集格：妖王/妖皇按 boss 取，精英取 _elite，普通取本体
  function foeSpriteKey(m) {
    if (m.boss === 2 && FOE_BOXES.boss2) return 'boss2';
    if (m.boss === 1 && FOE_BOXES.boss1) return 'boss1';
    if (m.elite && FOE_BOXES[m.type + '_elite']) return m.type + '_elite';
    if (FOE_BOXES[m.type]) return m.type;
    return null;
  }
  window.GameAPI = {
    selectChar(id) { const c = CHARS.find(x => x.id === id); if (c) { player.char = c; player.speed = c.speed; } },
    // 供自动化/桩测试读取运行态（不改游戏行为）
    stats() {
      return {
        kills, wave: waveNo, foes: monsters.length, target: targetFoeCount(),
        hp: Math.round(player.hp), dead: player.dead, combo, comboBest,
        parts: parts.length, rings: rings.length, swords: swords.length, slashes: slashes.length,
        world: [WORLD.w, WORLD.h], cam: [Math.round(cam.x), Math.round(cam.y)], view: [VW, VH],
        // 屏幕内/外妖兽数（用来核对"密度"到底降没降）
        inView: monsters.filter(m => m.x + m.w > cam.x && m.x < cam.x + VW && m.y + m.h > cam.y && m.y < cam.y + VH).length,
        bosses: runBossKills, scrolls: scrollCount, cards: taken.length,
        paused: paused, runOver: runOver, tierTimes: tierTimes.slice(), waveTimer: +waveTimer.toFixed(2),
        // 手机手感 / 画质（桩测试核对用）
        dash: dashT > 0, dashCd: +dashCd.toFixed(2), aim: Settings.aim,
        q: Settings.q, qLevel: qLevel, fps: fpsShown,
        px: Math.round(player.x), py: Math.round(player.y), aimA: +aimAngle().toFixed(3),
        // 妖兽/道具图集：是否就绪（桩测试核对用）
        foeSprite: !!foeImg, propSprite: !!propImg,
        // 像素立绘：图集是否就绪 / 当前朝向（桩测试核对用）
        sprite: !!sprites[player.char.id], dir: player.dir, walkT: +player.walkT.toFixed(3)
      };
    }
  };
  // ---------- 碰撞 ----------
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- 武器 / 技能（按境界进化，三种修士各异） ----------
  // 射程一律按屏幕短边折算（frac × 短边），所以永远不会飞到屏幕外去打"看不见的怪"。
  function weaponCfg() {
    const w = player.char.id, t = tierIdx(), R = viewMin();
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

  // 击杀结算（碎屑 + 连斩 + 掉落 + 突破三选一 + 妖王/妖皇）。剑/刀/雷共用
  function onKill(j) {
    const m = monsters[j];
    if (!m) return;
    const mx = m.x + m.w / 2, my = m.y + m.h / 2;
    const isBoss = !!m.boss;
    monsters.splice(j, 1);
    kills++;
    if (isBoss) runBossKills++;
    // 割草反馈：不补位（减员是看得见的），补员交给兽潮波次
    burst(mx, my, m.glow || '#ffffff', isBoss ? 36 : (m.elite ? 18 : 9), !!m.elite || isBoss);
    addShake(isBoss ? 9 : (m.elite ? 5 : 2));
    if (isBoss) { Sfx.boss(); buzz(45); }
    else if (m.elite) Sfx.elite();
    else Sfx.kill();
    // 噬血：击杀回血（妖王回得多）
    if (mods.leech) player.hp = Math.min(player.maxhp, player.hp + mods.leech * (isBoss ? 6 : 1));
    // 雷罚：概率引发小范围连锁
    if (mods.shock && Math.random() < mods.shock) {
      const R = 92;
      rings.push({ x: mx, y: my, r: 8, grow: R * 2.6, life: 0.34, max: 0.34, col: '#9fd4ff' });
      for (let k = monsters.length - 1; k >= 0; k--) {
        const o = monsters[k];
        if (!o) continue;
        if (Math.hypot(o.x + o.w / 2 - mx, o.y + o.h / 2 - my) > R) continue;
        o.hp -= rollDmg(14); o.hit = 0.14;
        if (o.hp <= 0) onKill(k);
      }
    }
    combo++; comboT = COMBO_WIN; comboPop = 1;
    killTimes.push(clock);
    if (killTimes.length > 90) killTimes.shift();
    // 掉落：妖王必掉仙缘古卷，杂兵 2.5% 撞仙缘
    if (isBoss) items.push({ x: mx, y: my, kind: 'scroll', t: 0 });
    else if (Math.random() < 0.025) items.push({ x: mx, y: my, kind: 'scroll', t: 0 });
    else if (items.length < 16) items.push({ x: mx, y: my, kind: ['herb', 'herb', 'stone', 'pill'][Math.floor(Math.random() * 4)], t: 0 });
    while (lastTierIdx < TIER_KILLS.length && kills >= TIER_KILLS[lastTierIdx]) {
      lastTierIdx++;
      tierTimes[lastTierIdx] = Math.round(clock);
      waveTimer = Math.min(waveTimer, 1.2);   // 突破后立刻起一波，规模立刻见长
      offerCards(lastTierIdx);                // 三选一（会暂停游戏）
    }
    // 妖皇被斩 = 通关
    if (m.boss === 2) { settle(true); return; }
    // 化神之后斩满一定数量 → 妖皇降临
    if (!finalSpawned && tierIdx() >= 4 && kills >= 130) { finalSpawned = true; spawnBoss(true); }
  }

  // ---------- 更新 ----------
  let last = performance.now();
  function update(dt) {
    // 暂停（突破选卡 / 结算 / 设置菜单）时冻结整局：dt 不推进，避免"看完卡回来就已经被围死"
    if (paused || runOver || menuPaused) return;
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
    // 冲遁：期间接管方向与速度，并拖出灵气残影
    let spd = player.speed;
    if (dashT > 0) {
      dashT -= dt;
      mx = dashDX; my = dashDY; spd = DASH_SPEED;
      if (qLevel >= 1 && Math.random() < 0.7) burst(player.x + player.w / 2, player.y + player.h / 2, '#9fd4ff', 2, false);
    }
    if (dashCd > 0) dashCd -= dt;
    // 四向朝向 + 行走动画计时（放在冲遁改写 mx/my 之后，冲刺时朝向也跟着冲的方向）
    if (mx || my) {
      player.dir = Math.abs(mx) >= Math.abs(my) ? (mx > 0 ? 'right' : 'left') : (my > 0 ? 'down' : 'up');
      player.walkT += dt;
    } else { player.walkT = 0; }
    player.x = Math.max(0, Math.min(WORLD.w - player.w, player.x + mx * spd * dt));
    player.y = Math.max(0, Math.min(WORLD.h - player.h, player.y + my * spd * dt));

    // 攻击（按所选修士的武器 / 技能）
    player.atkCd -= dt;
    if (keys.attack && player.atkCd <= 0) {
      const cfg = applyMods(weaponCfg());
      player.atkCd = cfg.cd;
      const aimA = aimAngle();                                      // 辅助瞄准：出招瞬间转向最近的威胁
      if (!(mx || my)) {                                            // 站桩时人跟着转，视觉更顺
        const ac = Math.cos(aimA), as = Math.sin(aimA);
        player.face = ac >= 0 ? 1 : -1;
        // 像素立绘走四向，所以朝向也要跟着瞄准方向转（否则会出现"朝下站着往上面打"）
        player.dir = Math.abs(ac) >= Math.abs(as) ? (ac > 0 ? 'right' : 'left') : (as > 0 ? 'down' : 'up');
      }
      if (cfg.kind === 'blade') {
        // 近战刀芒：瞄准方向的扇形重创 + 击退（扇形内全中，人堆里越砍越爽）
        const px = player.x + player.w / 2, py = player.y + player.h / 2;
        const fwd = aimA;
        slashes.push({ x: px, y: py, ang: aimA, range: cfg.range, arc: cfg.arc, life: 0.2, max: 0.2 });
        let hits = 0;
        for (let j = monsters.length - 1; j >= 0; j--) {
          const m = monsters[j];
          if (!m) continue;
          const dx = m.x + m.w / 2 - px, dy = m.y + m.h / 2 - py;
          const d = Math.hypot(dx, dy);
          if (d > cfg.range + Math.max(m.w, m.h) * 0.5) continue;
          let diff = Math.atan2(dy, dx) - fwd;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          if (Math.abs(diff) > cfg.arc / 2) continue;
          m.hp -= rollDmg(cfg.dmg); m.hit = 0.14;
          Sfx.hit();
          hits++;
          const kl = Math.max(1, d);
          m.x = Math.max(0, Math.min(WORLD.w - m.w, m.x + dx / kl * cfg.knock * 0.14));
          m.y = Math.max(0, Math.min(WORLD.h - m.h, m.y + dy / kl * cfg.knock * 0.14));
          if (m.hp <= 0) { burst(m.x + m.w / 2, m.y + m.h / 2, m.glow || '#fff', 5, false); onKill(j); }
        }
        if (hits) addShake(1.6 + Math.min(4, hits * 0.7));
      } else {
        const base = aimA;
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
      // 出视野即散：射程按屏幕短边折算，越过视野就不再打"看不见的怪"
      if (s.life <= 0 || s.x < cam.x - 36 || s.x > cam.x + VW + 36 || s.y < cam.y - 36 || s.y > cam.y + VH + 36) { swords.splice(i, 1); continue; }
      for (let j = monsters.length - 1; j >= 0; j--) {
        const m = monsters[j];
        // 连锁击杀/妖王入场都会改数组长度，索引可能指空，必须兜一下
        if (!m) continue;
        if (s.hit.has(m.id)) continue;
        if (aabb({ x: s.x - 9, y: s.y - 9, w: 18, h: 18 }, m)) {
          m.hp -= rollDmg(s.dmg); m.hit = 0.14;
          Sfx.hit();
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

    // 妖兽 AI：视野附近的全力压上（这才是"兽潮"）；离得太远的先就地游荡，
    // 免得全图妖兽同时扑过来、屏幕又被塞满。都带轻微侧向摆动，免成一条线。
    const chaseR = viewMax() * 0.55 + 90;   // 只让视野这一圈的压上来，远的先在外围游荡
    for (const m of monsters) {
      m.anim += dt;
      const dx = player.x + player.w / 2 - (m.x + m.w / 2);
      const dy = player.y + player.h / 2 - (m.y + m.h / 2);
      const l = Math.max(1, Math.hypot(dx, dy));
      let ux = dx / l, uy = dy / l;
      if (l > chaseR) {
        m.wander -= dt;
        if (m.wander <= 0) { m.wander = 1.2 + Math.random() * 1.9; m.wanderA = Math.random() * 6.2832; }
        ux = Math.cos(m.wanderA) * 0.62 + ux * 0.38;
        uy = Math.sin(m.wanderA) * 0.62 + uy * 0.38;
        const ul2 = Math.hypot(ux, uy) || 1; ux /= ul2; uy /= ul2;
      }
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

    // 妖兽贴身伤害（冲遁期间无敌——这是被围住时的活路，也是躲妖王冲击波的手段）
    for (const m of monsters) {
      if (aabb(player, m) && player.inv <= 0 && dashT <= 0) {
        player.hp -= m.dmg; player.inv = 0.85;
        burst(player.x + player.w / 2, player.y + player.h / 2, '#ff5a5a', 7, false);
        addShake(6);
        Sfx.hurt(); buzz(20);
        if (player.hp <= 0) { player.hp = 0; settle(false); return; }
      }
    }

    // 兽潮波次：成波涌来，波与波之间留空档，让"割完一波"有实感
    waveTimer -= dt;
    if (waveTimer <= 0) { waveTimer = WAVE_GAP_BY_TIER[tierIdx()]; launchWave(false); }
    // 妖王：每 4 波来一只（妖皇已出就不再出）
    if (!finalSpawned && waveNo >= bossNextWave) {
      bossNextWave = waveNo + 4;
      if (!monsters.some(function (x) { return !!x.boss; })) spawnBoss(false);
    }
    updateBosses(dt);
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

    // 物品：磁吸（引灵词条会放大范围）+ 拾取治疗 / 仙缘觉醒
    for (let i = items.length - 1; i >= 0; i--) {
      const h = items[i];
      h.t += dt;
      const dx = player.x + player.w / 2 - h.x, dy = player.y + player.h / 2 - h.y;
      const d = Math.hypot(dx, dy);
      const magnetR = 96 * (1 + mods.magnet);
      if (d < magnetR && d > 1) { h.x += dx / d * 132 * dt; h.y += dy / d * 132 * dt; }
      if (aabb(player, { x: h.x - 12, y: h.y - 12, w: 24, h: 24 })) {
        items.splice(i, 1); herbs++;
        if (h.kind === 'scroll') { awaken(); }
        else {
          const heal = h.kind === 'pill' ? 24 : h.kind === 'stone' ? 9 : 3;
          player.hp = Math.min(player.maxhp, player.hp + heal);
        }
        if (items.length < 7) spawnItem();
      }
    }

    // 相机跟随（夹在整幅地图内），所以屏幕只显示地图的一角
    updateCam();

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
    const walking = (keys.up || keys.down || keys.left || keys.right || joy.active) || dashT > 0;
    const t = p.anim * 9;
    const bob = walking ? -Math.abs(Math.sin(t)) * 1.4 : Math.sin(p.anim * 2.4) * 0.6;
    const swing = walking ? Math.sin(t) : 0;
    const cx = Math.round(p.x) + p.w / 2;
    const feet = Math.round(p.y) + p.h;
    const flash = p.inv > 0 && (Math.floor(p.anim * 20) % 2);

    // 地面投影
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(cx, feet - 1, p.w * 0.50, 4.2, 0, 0, 6.2832); ctx.fill();

    // ① 像素图集（加载成功就用它；受击时换同类规格的白色剪影做闪烁）
    const sheet = sprites[c.id];
    if (sheet) {
      const face = p.dir === 'up' ? 'up' : (p.dir === 'down' ? 'down' : 'side');
      const rows = SPRITE_ROWS[face];
      const row = walking ? rows[1] : rows[0];                 // 站着取第 0 帧（中性姿势），走起来循环 6 帧
      const fr = walking ? (Math.floor(p.walkT * 9) % 6) : 0;
      const img = (flash && spriteFlash[c.id]) ? spriteFlash[c.id] : sheet;
      const S = 80;   // 1.25 倍绘制：人物实际约 46px 高（旧立绘约 47px），与 44 高的碰撞盒相当，
                      // 避免出现"碰撞盒比人还大、看着没碰到却被蹭到"的问题
      ctx.save();
      ctx.translate(cx, feet);
      if (face === 'side' && p.dir === 'right') ctx.scale(-1, 1);   // 素材只有朝左，朝右时镜像
      // 单帧 64×64，人物脚底在帧底部，所以整帧上移 S，让脚踩在碰撞盒底边
      ctx.drawImage(img, fr * 64, row * 64, 64, 64, -S / 2, -S, S, S);
      ctx.restore();
      return;
    }

    // ② 退回程序化立绘（图集未加载 / 加载失败 / 无浏览器桩环境）
    ctx.save();
    ctx.translate(cx, Math.round(feet + bob));
    const SC = p.h / 44;                       // 立绘按 44 单位身高设计，自动适配碰撞盒
    ctx.scale(p.face * SC, SC);                // 朝右设计，向左时整幅镜像
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

    // 妖气：周身一层随呼吸涨落的暗焰雾（用半透明椭圆代替 shadowBlur，弱机也扛得住）
    const pu = 0.5 + 0.5 * Math.sin(m.anim * 3.2);
    ctx.globalAlpha = 0.11 + 0.07 * pu;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx, y + H * 0.58, W * 0.62, H * 0.55, 0, 0, 6.2832);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 地面投影
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(cx, y + H - 1, W * 0.40, 3.8, 0, 0, 6.2832); ctx.fill();

    // 精英光环（双层，带符纹感）
    if (m.elite) {
      const eq = 0.5 + 0.5 * Math.sin(m.anim * 4);
      ctx.strokeStyle = 'rgba(255,190,90,' + (0.26 + 0.34 * eq).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, y + H - 2, W * 0.52, 6.5, 0, 0, 6.2832); ctx.stroke();
      if (qLevel >= 1) {
        ctx.strokeStyle = 'rgba(255,214,140,' + (0.10 + 0.20 * eq).toFixed(2) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(cx, y + H - 2, W * 0.66, 9.5, 0, 0, 6.2832); ctx.stroke();
      }
    }

    // 妖王蓄力预警：脚下扩散的红圈，看到就躲（否则会被冲击波掀飞）
    if (m.boss && m.atkT < 0.55) {
      const k = 1 - m.atkT / 0.55;
      const R = (m.boss === 2 ? 200 : 150) * (0.30 + 0.70 * k);
      ctx.globalAlpha = 0.25 + 0.55 * k;
      ctx.strokeStyle = '#ff7a3c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, y + H / 2, R, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(x, y + bob);
    if (m.face < 0) { ctx.translate(W, 0); ctx.scale(-1, 1); }   // 按移动方向转身
    ctx.lineJoin = 'round';

    // ① 图集精灵（加载成功就用 freepixel 的妖兽立绘；按碰撞盒高度等比贴、脚踩盒底、按移动方向镜像）
    const fkey = foeSpriteKey(m);
    if (foeImg && fkey) {
      const b = FOE_BOXES[fkey];
      const sc = H / b[3];                          // 内容高度对齐到碰撞盒高度
      const dw = b[2] * sc, dh = b[3] * sc;
      ctx.drawImage(foeImg, b[0], b[1], b[2], b[3], W / 2 - dw / 2, H - dh, dw, dh);
    }
    // ② 退回程序化立绘（图集未加载 / 加载失败 / 无浏览器桩环境）
    else if (m.type === 'wolf')         drawWolf(W, H, m, body, dark, glow, ink);
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

  // 青面狼妖：额生妖角 + 背脊骨刺 + 四爪 + 口中赤息
  function drawWolf(W, H, m, body, dark, glow, ink) {
    const lp = Math.sin(m.anim * 10) * 2.2;        // 步态
    const br = 1 + Math.sin(m.anim * 3.4) * 0.03;  // 呼吸

    // 四足（末端三枚利爪）
    ctx.strokeStyle = dark; ctx.lineWidth = 3.0; ctx.lineCap = 'round';
    const legs = [[0.30, -1], [0.42, 1], [0.70, 1], [0.82, -1]];
    for (const L of legs) {
      const lx = W * L[0], ly = H * 0.94 + lp * L[1] * 0.7;
      ctx.beginPath(); ctx.moveTo(lx, H * 0.58); ctx.lineTo(lx + lp * L[1], ly); ctx.stroke();
      for (let k = -1; k <= 1; k++) {
        poly([[lx + lp * L[1] - 1.8, ly - 1.2], [lx + lp * L[1] + k * 1.9, ly + 3.4], [lx + lp * L[1] + 1.8, ly - 1.2]], '#d9dbe6');
      }
    }

    // 妖尾（末端骨刺）
    ctx.strokeStyle = body; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W * 0.20, H * 0.52);
    ctx.quadraticCurveTo(W * 0.02, H * 0.34, W * 0.06, H * 0.12);
    ctx.stroke();
    poly([[W * 0.03, H * 0.16], [W * 0.13, H * 0.00], [W * 0.14, H * 0.18]], dark);

    // 躯干 + 腹暗面
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(W * 0.46, H * 0.50, W * 0.30 * br, H * 0.27 * br, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(W * 0.44, H * 0.62, W * 0.24, H * 0.12, 0, 0, 6.2832); ctx.fill();

    // 背脊骨刺（七枚，尖端泛白）
    for (let k = 0; k < 7; k++) {
      const bx = W * (0.26 + k * 0.075);
      const hh = H * (0.24 - Math.abs(k - 3) * 0.024);
      poly([[bx - W * 0.032, H * 0.36], [bx, H * 0.36 - hh], [bx + W * 0.032, H * 0.36]], dark);
      poly([[bx, H * 0.36 - hh], [bx - W * 0.013, H * 0.36 - hh * 0.58], [bx + W * 0.013, H * 0.36 - hh * 0.58]], '#ded8c6');
    }

    // 颈鬃（三片逆鳞）
    for (let k = 0; k < 3; k++) {
      const bx = W * (0.58 + k * 0.03), by = H * (0.30 + k * 0.05);
      poly([[bx, by], [bx - W * 0.11, by - H * 0.10], [bx + W * 0.02, by + H * 0.06]], dark);
    }

    // 头 + 楔形吻
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(W * 0.72, H * 0.34, W * 0.17 * br, H * 0.19 * br, 0, 0, 6.2832); ctx.fill();
    poly([[W * 0.80, H * 0.26], [W * 1.00, H * 0.38], [W * 0.80, H * 0.48]], dark);
    poly([[W * 0.94, H * 0.345], [W * 1.035, H * 0.385], [W * 0.94, H * 0.425]], glow);

    // 妖角（向后弯的独角）
    ctx.strokeStyle = '#e6e0cc'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W * 0.68, H * 0.20);
    ctx.quadraticCurveTo(W * 0.58, H * -0.08, W * 0.78, H * -0.12);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,50,40,0.50)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W * 0.665, H * 0.11); ctx.lineTo(W * 0.645, H * 0.04); ctx.stroke();

    // 耳
    poly([[W * 0.62, H * 0.20], [W * 0.58, H * 0.02], [W * 0.70, H * 0.15]], dark);

    // 獠牙
    poly([[W * 0.87, H * 0.43], [W * 0.90, H * 0.56], [W * 0.93, H * 0.42]], '#f4f2ea');
    poly([[W * 0.80, H * 0.44], [W * 0.83, H * 0.54], [W * 0.86, H * 0.43]], '#f4f2ea');

    // 赤瞳（竖瞳）
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(W * 0.76, H * 0.30, 2.4, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ink; ctx.fillRect(W * 0.752, H * 0.25, 1.3, 5.2);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(W * 0.90, H * 0.33, 1.9, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ink; ctx.fillRect(W * 0.895, H * 0.29, 1.0, 4.0);

    // 口中赤息
    const br2 = 0.5 + 0.5 * Math.sin(m.anim * 5);
    ctx.globalAlpha = 0.26 + 0.24 * br2;
    ctx.strokeStyle = glow; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(W * 1.01, H * 0.40);
    ctx.quadraticCurveTo(W * 1.12, H * (0.33 - 0.06 * br2), W * 1.24, H * (0.40 + 0.05 * br2));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 玄纹蛛：八节步足 + 背甲卦纹 + 噬魂螯肢
  function drawSpider(W, H, m, body, dark, glow, ink) {
    const cx = W * 0.48, cy = H * 0.54;

    // 八足：两段关节 + 足刺 + 足尖钩
    ctx.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 0; k < 4; k++) {
        const ph = Math.sin(m.anim * 8 + k * 1.35 + (s > 0 ? 0 : 1.6)) * H * 0.09;
        const sx = cx + s * W * 0.12;
        const sy = cy - H * 0.10 + k * H * 0.09;
        const mx = cx + s * W * 0.42;
        const my = cy - H * 0.34 + k * H * 0.22 + ph;
        const ex = cx + s * W * 0.58;
        const ey = cy - H * 0.10 + k * H * 0.28 + ph * 0.6;
        ctx.strokeStyle = dark; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, my); ctx.stroke();
        ctx.strokeStyle = body; ctx.lineWidth = 2.0;
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = dark; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + s * W * 0.045, my - H * 0.06); ctx.stroke();
        ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + s * W * 0.03, ey + H * 0.055); ctx.stroke();
      }
    }

    // 蛛腹 + 背甲
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(cx - W * 0.06, cy + H * 0.06, W * 0.25, H * 0.29, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(cx - W * 0.06, cy - H * 0.02, W * 0.20, H * 0.19, 0, 0, 6.2832); ctx.fill();

    // 背甲卦纹（圆 + 三爻刻线）
    ctx.strokeStyle = glow; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(cx - W * 0.06, cy + H * 0.01, W * 0.115, 0, 6.2832); ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.16, cy - H * 0.05); ctx.lineTo(cx + W * 0.04, cy - H * 0.05);
    ctx.moveTo(cx - W * 0.18, cy + H * 0.01); ctx.lineTo(cx - W * 0.10, cy + H * 0.01);
    ctx.moveTo(cx - W * 0.03, cy + H * 0.01); ctx.lineTo(cx + W * 0.06, cy + H * 0.01);
    ctx.moveTo(cx - W * 0.16, cy + H * 0.07); ctx.lineTo(cx + W * 0.04, cy + H * 0.07);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 头胸
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(cx + W * 0.14, cy - H * 0.26, W * 0.17, H * 0.17, 0, 0, 6.2832); ctx.fill();

    // 螯肢（一对毒钩）
    ctx.strokeStyle = ink; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(cx + W * 0.24, cy - H * 0.20); ctx.lineTo(cx + W * 0.34, cy - H * 0.04); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + W * 0.26, cy - H * 0.28); ctx.lineTo(cx + W * 0.36, cy - H * 0.14); ctx.stroke();

    // 八眼（两排）
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx + W * 0.15, cy - H * 0.33, 2.6, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + W * 0.24, cy - H * 0.30, 2.0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + W * 0.08, cy - H * 0.26, 1.5, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + W * 0.22, cy - H * 0.21, 1.3, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(cx + W * 0.155, cy - H * 0.33, 1.1, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + W * 0.245, cy - H * 0.30, 0.9, 0, 6.2832); ctx.fill();
  }

  // 焚天蟾：宽扁妖躯 + 背脊三道妖火 + 竖瞳鼓眼 + 口鼻火星
  function drawToad(W, H, m, body, dark, glow, ink) {
    const br = 1 + Math.sin(m.anim * 3) * 0.045;

    // 后肢 + 前足
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(W * 0.13, H * 0.80, W * 0.14, H * 0.13, -0.32, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.87, H * 0.80, W * 0.14, H * 0.13, 0.32, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.25, H * 0.95, W * 0.11, H * 0.05, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.75, H * 0.95, W * 0.11, H * 0.05, 0, 0, 6.2832); ctx.fill();
    // 蹼爪尖
    for (let k = 0; k < 3; k++) {
      poly([[W * (0.19 + k * 0.045), H * 0.96], [W * (0.21 + k * 0.045), H * 1.03], [W * (0.24 + k * 0.045), H * 0.96]], '#d8d2bd');
      poly([[W * (0.70 + k * 0.045), H * 0.96], [W * (0.72 + k * 0.045), H * 1.03], [W * (0.75 + k * 0.045), H * 0.96]], '#d8d2bd');
    }

    // 宽身 + 腹暗面
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(W * 0.50, H * 0.62, W * 0.44 * br, H * 0.35 * br, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(W * 0.50, H * 0.74, W * 0.36, H * 0.19, 0, 0, 6.2832); ctx.fill();

    // 疣粒
    const warts = [[0.28, 0.66, 0.055], [0.66, 0.72, 0.048], [0.78, 0.56, 0.040], [0.38, 0.50, 0.034], [0.60, 0.46, 0.030]];
    ctx.fillStyle = dark;
    for (const w of warts) { ctx.beginPath(); ctx.arc(W * w[0], H * w[1], W * w[2], 0, 6.2832); ctx.fill(); }

    // 背脊三道妖火（外焰 + 内焰）
    for (let k = 0; k < 3; k++) {
      const bx = W * (0.28 + k * 0.21);
      const hh = H * (0.30 + 0.07 * Math.sin(m.anim * 6 + k * 2.1));
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(bx - W * 0.085, H * 0.36);
      ctx.quadraticCurveTo(bx - W * 0.02, H * (0.36 - hh * 0.55), bx, H * (0.36 - hh));
      ctx.quadraticCurveTo(bx + W * 0.02, H * (0.36 - hh * 0.55), bx + W * 0.085, H * 0.36);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.moveTo(bx - W * 0.032, H * 0.37);
      ctx.quadraticCurveTo(bx, H * (0.37 - hh * 0.72), bx + W * 0.032, H * 0.37);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 大嘴 + 牙
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(W * 0.20, H * 0.56);
    ctx.quadraticCurveTo(W * 0.50, H * 0.42, W * 0.80, H * 0.56);
    ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const tx = W * (0.28 + k * 0.09);
      poly([[tx, H * 0.52], [tx + W * 0.022, H * 0.61], [tx + W * 0.044, H * 0.52]], '#f2ede0');
    }

    // 鼓眼 + 竖瞳
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(W * 0.31, H * 0.25, W * 0.145, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.69, H * 0.25, W * 0.145, 0, 6.2832); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(W * 0.31, H * 0.25, W * 0.125, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.69, H * 0.25, W * 0.125, 0, 6.2832); ctx.fill();
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(W * 0.31, H * 0.25, W * 0.095, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.69, H * 0.25, W * 0.095, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillRect(W * 0.295, H * 0.14, W * 0.030, H * 0.22);
    ctx.fillRect(W * 0.675, H * 0.14, W * 0.030, H * 0.22);

    // 口鼻火星
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = glow;
    for (let k = 0; k < 3; k++) {
      const a = m.anim * 1.6 + k * 2.1;
      ctx.fillRect(W * (0.50 + Math.sin(a) * 0.05), H * (0.50 + Math.cos(a) * 0.04), 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }

  // 阴煞：飘浮幽体 + 哭丧幡 + 朱砂符箓飘带 + 磷火
  function drawGhost(W, H, m, body, dark, glow, ink) {
    const float = Math.sin(m.anim * 3) * 2.6;
    ctx.save();
    ctx.translate(0, float);

    // 灵幡（画在幽体之后，像举在身侧）
    ctx.save();
    ctx.translate(W * 0.16, H * 0.90);
    ctx.rotate(-0.06 + Math.sin(m.anim * 2.4) * 0.07);
    ctx.strokeStyle = '#6b5a44'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -H * 0.92); ctx.stroke();
    ctx.fillStyle = 'rgba(230,228,216,0.88)';
    ctx.beginPath();
    ctx.moveTo(0, -H * 0.90);
    ctx.lineTo(W * 0.30, -H * 0.84);
    ctx.lineTo(W * 0.30, -H * 0.46);
    ctx.lineTo(0, -H * 0.54);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(190,50,50,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W * 0.14, -H * 0.80); ctx.lineTo(W * 0.14, -H * 0.54);
    ctx.moveTo(W * 0.07, -H * 0.73); ctx.lineTo(W * 0.21, -H * 0.73);
    ctx.moveTo(W * 0.08, -H * 0.62); ctx.lineTo(W * 0.20, -H * 0.60);
    ctx.stroke();
    ctx.restore();

    // 幽体（兜帽 + 破烂下摆）
    ctx.globalAlpha = 0.90;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(W * 0.10, H * 0.88);
    ctx.quadraticCurveTo(W * 0.06, H * 0.28, W * 0.50, H * 0.06);
    ctx.quadraticCurveTo(W * 0.94, H * 0.28, W * 0.90, H * 0.88);
    for (let k = 0; k < 3; k++) {
      const sx = W * 0.90 - k * W * 0.27;
      ctx.quadraticCurveTo(sx - W * 0.13, H * (1.10 + (k % 2) * 0.08), sx - W * 0.27, H * 0.88);
    }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // 兜帽内暗面
    ctx.fillStyle = 'rgba(24,16,48,0.62)';
    ctx.beginPath(); ctx.ellipse(W * 0.50, H * 0.42, W * 0.27, H * 0.27, 0, 0, 6.2832); ctx.fill();

    // 幽光眼窝
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(W * 0.38, H * 0.40, W * 0.085, H * 0.075, 0.2, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.62, H * 0.40, W * 0.085, H * 0.075, -0.2, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(W * 0.38, H * 0.40, W * 0.035, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.62, H * 0.40, W * 0.035, 0, 6.2832); ctx.fill();

    // 黑洞嘴（随吐息开合）
    const mo = 0.5 + 0.5 * Math.sin(m.anim * 4);
    ctx.fillStyle = 'rgba(8,4,18,0.80)';
    ctx.beginPath();
    ctx.moveTo(W * 0.42, H * 0.60);
    ctx.quadraticCurveTo(W * 0.50, H * (0.76 + 0.06 * mo), W * 0.58, H * 0.60);
    ctx.quadraticCurveTo(W * 0.50, H * 0.65, W * 0.42, H * 0.60);
    ctx.closePath(); ctx.fill();

    // 符箓飘带（三条，带朱砂短刻）
    for (let k = 0; k < 3; k++) {
      const p = m.anim * 2.2 + k * 1.7;
      const ox = W * (0.22 + k * 0.29);
      const oy = H * (0.76 + 0.05 * Math.sin(p));
      ctx.globalAlpha = 0.70;
      ctx.strokeStyle = '#e6e2d0'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.quadraticCurveTo(ox + Math.sin(p) * 5, oy + H * 0.15, ox + Math.sin(p + 1) * 7, oy + H * 0.28);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(190,50,50,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox + Math.sin(p) * 3, oy + H * 0.09);
      ctx.lineTo(ox + Math.sin(p + 1) * 4, oy + H * 0.11);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 磷火
    const pf = 0.6 + 0.4 * Math.sin(m.anim * 6);
    ctx.globalAlpha = 0.35 + 0.45 * pf;
    ctx.fillStyle = '#9ff0ff';
    ctx.beginPath(); ctx.arc(W * 0.11, H * 0.16, 3.0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.89, H * 0.14, 2.4, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // 玄蛟：盘绕蛟身 + 头生双角 + 颌下长须 + 缠身云雾
  function drawSerpent(W, H, m, body, dark, glow, ink) {
    // 盘绕身躯（六段，交替明暗 + 鳞纹）
    for (let k = 5; k >= 0; k--) {
      const bx = W * (0.30 - k * 0.105);
      const by = H * 0.66 + Math.sin(m.anim * 5 + k * 0.9) * H * 0.15;
      ctx.fillStyle = (k % 2) ? body : dark;
      ctx.beginPath(); ctx.ellipse(bx, by, W * 0.105, H * 0.23, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(8,38,28,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(bx, by, W * 0.072, H * 0.17, 0, 0.6, 2.5); ctx.stroke();
    }

    // 颈（立起）
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(W * 0.36, H * 0.76);
    ctx.quadraticCurveTo(W * 0.50, H * 0.30, W * 0.74, H * 0.40);
    ctx.quadraticCurveTo(W * 0.56, H * 0.50, W * 0.48, H * 0.86);
    ctx.closePath(); ctx.fill();

    // 缠身云雾
    const cl = 0.5 + 0.5 * Math.sin(m.anim * 2.2);
    ctx.globalAlpha = 0.13 + 0.10 * cl;
    ctx.fillStyle = '#bfe6ff';
    ctx.beginPath(); ctx.ellipse(W * 0.34, H * 0.80, W * 0.34, H * 0.20, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.58, H * 0.58, W * 0.24, H * 0.14, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;

    // 蛟首 + 头鳞
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(W * 0.74, H * 0.40, W * 0.20, H * 0.16, -0.22, 0, 6.2832); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(W * 0.68, H * 0.34, W * 0.10, H * 0.055, -0.22, 0, 6.2832); ctx.fill();

    // 双角（向后弯）
    ctx.strokeStyle = '#e8e2cc'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const dx of [-0.02, 0.07]) {
      ctx.beginPath();
      ctx.moveTo(W * (0.70 + dx), H * 0.30);
      ctx.quadraticCurveTo(W * (0.62 + dx), H * 0.10, W * (0.53 + dx), H * 0.05);
      ctx.stroke();
    }

    // 颌下长须
    const sg = Math.sin(m.anim * 7);
    ctx.strokeStyle = '#f0ecd8'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(W * 0.86, H * 0.46);
    ctx.quadraticCurveTo(W * 0.98, H * (0.52 + 0.05 * sg), W * 1.10, H * (0.42 + 0.08 * sg));
    ctx.moveTo(W * 0.84, H * 0.48);
    ctx.quadraticCurveTo(W * 0.94, H * (0.58 + 0.05 * sg), W * 1.05, H * (0.54 + 0.08 * sg));
    ctx.stroke();

    // 竖瞳
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(W * 0.78, H * 0.35, 2.4, 0, 6.2832); ctx.fill();
    ctx.fillStyle = ink; ctx.fillRect(W * 0.775, H * 0.28, 1.2, 5.0);

    // 信子
    const tg = Math.sin(m.anim * 9) * 2;
    ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(W * 0.91, H * 0.46);
    ctx.lineTo(W * 1.02, H * 0.48 + tg);
    ctx.moveTo(W * 0.99, H * 0.48 + tg); ctx.lineTo(W * 1.05, H * 0.42 + tg);
    ctx.moveTo(W * 0.99, H * 0.48 + tg); ctx.lineTo(W * 1.06, H * 0.54 + tg);
    ctx.stroke();
  }

  // ---------- 绘制：物品（各有形状） ----------
  function drawItem(h) {
    const pulse = 0.6 + 0.4 * Math.sin(h.t * 3 + performance.now() / 400);
    const x = Math.round(h.x), y = Math.round(h.y + Math.sin(h.t * 2 + performance.now() / 500) * 2);
    if (h.kind === 'scroll') {
      // 仙缘古卷：金轴卷面 + 飘出的灵气
      ctx.fillStyle = 'rgba(255,210,74,' + (0.26 * pulse).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, 17, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#f2e3b8';
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 10); ctx.lineTo(x + 9, y - 10);
      ctx.lineTo(x + 9, y + 10); ctx.lineTo(x - 9, y + 10);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c9a84a';
      ctx.beginPath(); ctx.ellipse(x - 9, y, 2.6, 10, 0, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 9, y, 2.6, 10, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#9a7a2a'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y - 5);
      ctx.moveTo(x - 5, y - 1); ctx.lineTo(x + 5, y - 1);
      ctx.moveTo(x - 5, y + 3); ctx.lineTo(x + 1, y + 3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,160,0.9)';
      ctx.beginPath(); ctx.arc(x + 4, y - 16 - pulse * 3, 1.6, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(x - 6, y - 20 - pulse * 2, 1.2, 0, 6.28); ctx.fill();
    } else if (h.kind === 'herb') {
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
    const fwd = (typeof s.ang === 'number') ? s.ang : (s.dir > 0 ? 0 : Math.PI);
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#06050d';
    ctx.fillRect(0, 0, VW, VH);

    // 相机 + 震屏（整像素对齐，抖起来也不糊字）
    let ox = -Math.round(cam.x), oy = -Math.round(cam.y);
    if (shake > 0.05) { ox += Math.round((Math.random() - 0.5) * shake); oy += Math.round((Math.random() - 0.5) * shake); }
    ctx.setTransform(1, 0, 0, 1, ox, oy);

    // 视野范围（世界坐标）：所有绘制都按它裁剪，地图再大也不多画一笔
    const vx0 = cam.x - 40, vx1 = cam.x + VW + 40, vy0 = cam.y - 40, vy1 = cam.y + VH + 40;

    // 世界背景：贴回预渲染图（只贴视野那一块，开销≈一次屏幕大小的拷贝）
    const bx0 = Math.max(0, Math.floor(vx0)), by0 = Math.max(0, Math.floor(vy0));
    const bx1 = Math.min(WORLD.w, Math.ceil(vx1)), by1 = Math.min(WORLD.h, Math.ceil(vy1));
    if (bgCv && bx1 > bx0 && by1 > by0) {
      ctx.drawImage(bgCv, bx0, by0, bx1 - bx0, by1 - by0, bx0, by0, bx1 - bx0, by1 - by0);
    } else {
      ctx.fillStyle = '#0d0b1a';
      ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    }

    // 灵气上浮光点：世界坐标按格采样（同一格永远同一处，不用存数组），视野内才画
    if (qLevel >= 1) {
      const TK = performance.now() / 1000;
      const CELL = 250;
      for (let i = Math.floor(vx0 / CELL); i <= Math.floor(vx1 / CELL); i++) {
        for (let j = Math.floor(vy0 / CELL); j <= Math.floor(vy1 / CELL); j++) {
          const h1 = hash2(i, j), h2b = hash2(i + 37, j - 11);
          const px = i * CELL + h1 * CELL;
          const py = j * CELL + h2b * CELL - ((TK * 11 + h1 * 200) % 56);
          const al = 0.14 + 0.28 * (0.5 + 0.5 * Math.sin(TK * 1.7 + h1 * 9.1));
          ctx.fillStyle = h1 > 0.72 ? 'rgba(255,226,160,' + al.toFixed(2) + ')' : 'rgba(150,225,255,' + al.toFixed(2) + ')';
          ctx.fillRect(Math.round(px), Math.round(py), h1 > 0.9 ? 2 : 1, h1 > 0.9 ? 2 : 1);
        }
      }
    }

    // 冲击环
    if (qLevel >= 1) {
      for (const g of rings) {
        if (g.x < vx0 || g.x > vx1 || g.y < vy0 || g.y > vy1) continue;
        ctx.globalAlpha = Math.max(0, g.life / g.max) * 0.7;
        ctx.strokeStyle = g.col; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 6.2832); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    for (const h of items) if (h.x > vx0 && h.x < vx1 && h.y > vy0 && h.y < vy1) drawItem(h);
    for (const m of monsters) if (m.x + m.w > vx0 && m.x < vx1 && m.y + m.h > vy0 && m.y < vy1) drawMonster(m);
    for (const s of slashes) drawSlash(s);
    for (const s of swords) if (s.x > vx0 && s.x < vx1 && s.y > vy0 && s.y < vy1) drawProj(s);
    if (!player.dead) drawPlayer();

    // 妖兽碎屑（画在最上层，割草才有飞溅感；低画质不画）
    if (qLevel >= 1) {
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.col;
        ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
      }
    }
    ctx.globalAlpha = 1;

    // 地图边界：走到灵脉尽头会撞见的岩壁
    ctx.strokeStyle = 'rgba(140,130,220,0.22)'; ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, WORLD.w - 3, WORLD.h - 3);

    // ---- 屏幕坐标层 ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 兽潮方向提示：贴在屏幕边缘指向来敌那一侧（顺带告诉你该朝哪边打）
    if (waveCall) drawWaveHint(waveCall);

    // 连斩
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

    if (typeof drawBossBar === 'function') drawBossBar();

    // 帧率（可选）：卡不卡一眼看得出来
    if (Settings.fps) {
      const qn = Settings.q === 'auto' ? ('自动·' + ['低', '中', '高'][qLevel]) : ({ high: '高', mid: '中', low: '低' })[Settings.q];
      ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillStyle = fpsShown >= 50 ? '#7de08a' : fpsShown >= 30 ? '#ffd24a' : '#ff8071';
      ctx.fillText(fpsShown + ' FPS　画质' + qn, VW - 10, 46);
    }

    const info = realmInfo();
    elHp.style.width = (player.hp / player.maxhp * 100) + '%';
    if (elHerb) elHerb.textContent = herbs;
    elKill.textContent = kills;
    elFoe.textContent = monsters.length + '/' + targetFoeCount();
    elRealm.textContent = info.name + ' · ' + info.skill;
    if (elStone) elStone.textContent = meta.stones;
    // 冲遁钮：冷却中渐亮，就绪时最亮（不用 classList，桩环境更省事）
    if (btnDash) btnDash.style.opacity = dashCd <= 0 ? '0.42' : (0.14 + 0.26 * (1 - dashCd / DASH_CD)).toFixed(2);
  }

  // 兽潮来袭提示：贴在屏幕对应边，箭头指向场内
  function drawWaveHint(w) {
    const PAD = 96;
    let px = VW / 2, py = VH / 2;
    if (w.edge === 0) py = 92;
    else if (w.edge === 1) py = VH - 92;
    else if (w.edge === 2) px = PAD;
    else px = VW - PAD;
    ctx.save();
    ctx.globalAlpha = Math.min(1, w.t / 0.6);
    ctx.translate(px, py);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 15px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,5,16,0.82)';
    const label = '兽潮 · 第' + w.no + '波';
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = '#ff8a5b'; ctx.fillText(label, 0, 0);
    ctx.beginPath();
    if (w.edge === 0) { ctx.moveTo(0, 16); ctx.lineTo(-7, 27); ctx.lineTo(7, 27); }
    else if (w.edge === 1) { ctx.moveTo(0, -16); ctx.lineTo(-7, -27); ctx.lineTo(7, -27); }
    else if (w.edge === 2) { ctx.moveTo(16, 0); ctx.lineTo(27, -7); ctx.lineTo(27, 7); }
    else { ctx.moveTo(-16, 0); ctx.lineTo(-27, -7); ctx.lineTo(-27, 7); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 相机跟随玩家，并夹在整幅地图内
  function updateCam() {
    cam.x = Math.max(0, Math.min(WORLD.w - VW, player.x + player.w / 2 - VW / 2));
    cam.y = Math.max(0, Math.min(WORLD.h - VH, player.y + player.h / 2 - VH / 2));
  }

  // 尺寸/方向变化后，把越界实体收回地图内
  function clampAll() {
    player.x = Math.max(0, Math.min(WORLD.w - player.w, player.x));
    player.y = Math.max(0, Math.min(WORLD.h - player.h, player.y));
    for (const m of monsters) {
      m.x = Math.max(0, Math.min(WORLD.w - m.w, m.x));
      m.y = Math.max(0, Math.min(WORLD.h - m.h, m.y));
    }
    updateCam();
  }

  // ==========================================================================================
  // 元层：突破三选一构筑 / 结算与最高纪录 / 音效震动 / 妖王与通关 / 洞府永久成长 / 任务成就
  // ==========================================================================================

  // ---------- 音效（WebAudio 合成，零素材文件；无声卡/不支持时全部静默降级） ----------
  const Sfx = (function () {
    let ac = null, enabled = true, lastHit = 0;
    try { enabled = localStorage.getItem('im_mute') !== '1'; } catch (_) {}
    function acInit() {
      if (ac) return ac;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch (_) { ac = null; }
      return ac;
    }
    function tone(f0, f1, dur, type, vol) {
      if (!enabled) return;
      const a = acInit(); if (!a) return;
      const t = a.currentTime;
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination);
      o.start(t); o.stop(t + dur + 0.03);
    }
    function noise(dur, vol) {
      if (!enabled) return;
      const a = acInit(); if (!a) return;
      const n = Math.max(1, Math.floor(a.sampleRate * dur));
      const buf = a.createBuffer(1, n, a.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = a.createBufferSource(), g = a.createGain();
      src.buffer = buf; g.gain.value = vol;
      src.connect(g); g.connect(a.destination);
      src.start();
    }
    return {
      unlock() { const a = acInit(); if (a && a.state === 'suspended') { try { a.resume(); } catch (_) {} } },
      isOn() { return enabled; },
      setOn(v) { enabled = !!v; try { localStorage.setItem('im_mute', enabled ? '0' : '1'); } catch (_) {} return enabled; },
      toggle() { enabled = !enabled; try { localStorage.setItem('im_mute', enabled ? '0' : '1'); } catch (_) {} return enabled; },
      hit() { const n = performance.now(); if (n - lastHit < 60) return; lastHit = n; tone(330, 150, 0.05, 'square', 0.045); },
      kill() { tone(190, 80, 0.09, 'triangle', 0.06); },
      elite() { tone(270, 95, 0.15, 'sawtooth', 0.07); },
      hurt() { noise(0.12, 0.14); tone(150, 70, 0.14, 'sawtooth', 0.06); },
      dash() { tone(760, 280, 0.13, 'triangle', 0.055); },
      tier() { tone(523, 784, 0.16, 'sine', 0.09); setTimeout(function () { tone(784, 1046, 0.22, 'sine', 0.08); }, 120); },
      pick() { tone(880, 1320, 0.10, 'sine', 0.07); },
      boss() { tone(95, 62, 0.7, 'sawtooth', 0.09); },
      die() { tone(300, 60, 0.6, 'sawtooth', 0.09); },
      win() { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone(f, f, 0.26, 'sine', 0.09); }, i * 140); }); }
    };
  })();
  function buzz(p) { if (!Settings.sound) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) {} }

  // ---------- 持久化：纪录 / 洞府资源（带版本号与字段校验，坏档 / 旧档不会崩） ----------
  const REC_KEY = 'im_records_v2', MET_KEY = 'im_meta_v2';
  const SAVE_VER = 2;
  function loadJSON(k, d) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch (_) { return d; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  // 数值兜底：非数字 / NaN / Infinity 一律回落默认值；计数类还要非负取整
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function int0(v, d) { return Math.max(0, Math.floor(num(v, d))); }

  let rec = loadJSON(REC_KEY, null);
  if (!rec || typeof rec !== 'object') rec = {};
  rec.ver       = SAVE_VER;
  rec.bestKills = int0(rec.bestKills, 0);
  rec.bestTier  = int0(rec.bestTier, 0);
  rec.bestCombo = int0(rec.bestCombo, 0);
  rec.bestWave  = int0(rec.bestWave, 0);
  rec.bestTime  = int0(rec.bestTime, 0);
  rec.bosses    = int0(rec.bosses, 0);
  rec.clears    = int0(rec.clears, 0);
  if (!Array.isArray(rec.fastest) || rec.fastest.length !== 5) rec.fastest = [null, null, null, null, null];
  rec.fastest = rec.fastest.map(function (v) { return (typeof v === 'number' && isFinite(v) && v > 0) ? v : null; });

  let meta = loadJSON(MET_KEY, null);
  if (!meta || typeof meta !== 'object') meta = {};
  meta.ver    = SAVE_VER;
  meta.stones = int0(meta.stones, 0);
  // 经脉等级：缺键补 0，超出上限压回上限（旧档 / 手改档都不会绕过限制）
  const UP_MAX = { atk: 5, spd: 5, hp: 5, mag: 3, crit: 5 };
  if (!meta.up || typeof meta.up !== 'object') meta.up = {};
  Object.keys(UP_MAX).forEach(function (id) { meta.up[id] = Math.min(UP_MAX[id], int0(meta.up[id], 0)); });
  if (!meta.ach || typeof meta.ach !== 'object') meta.ach = {};
  if (!Array.isArray(meta.quests)) meta.quests = null;

  // 洞府强化（灵石购买，永久生效）
  const UPS = [
    { id: 'atk',  name: '开脉', desc: '攻击力 +5%/级',   max: 5, cost: function (i) { return 30 + i * 30; } },
    { id: 'spd',  name: '轻身', desc: '出招速度 +4%/级', max: 5, cost: function (i) { return 30 + i * 30; } },
    { id: 'hp',   name: '壮体', desc: '气血上限 +15/级', max: 5, cost: function (i) { return 25 + i * 25; } },
    { id: 'mag',  name: '引灵', desc: '拾取范围 +30%/级', max: 3, cost: function (i) { return 40 + i * 40; } },
    { id: 'crit', name: '剑心', desc: '暴击率 +4%/级',   max: 5, cost: function (i) { return 45 + i * 45; } }
  ];
  const ACHS = [
    { id: 'k100',  name: '初露锋芒', desc: '单局斩妖 100',      reward: 30,  test: function (r) { return r.kills >= 100; } },
    { id: 'k300',  name: '万夫莫敌', desc: '单局斩妖 300',      reward: 80,  test: function (r) { return r.kills >= 300; } },
    { id: 't4',    name: '化神之上', desc: '突破至化神期',      reward: 40,  test: function (r) { return r.tier >= 4; } },
    { id: 'c20',   name: '割草大师', desc: '峰值连斩 ≥ 20',     reward: 50,  test: function (r) { return r.combo >= 20; } },
    { id: 'boss5', name: '妖王克星', desc: '累计击败 5 只妖王', reward: 60,  test: function (r) { return r.bosses >= 5; } },
    { id: 'clear', name: '平定灵脉', desc: '击败妖皇通关',      reward: 150, test: function (r) { return r.cleared; } }
  ];
  const QUEST_POOL = [
    { id: 'qk80',  name: '单局斩妖 80 只',   reward: 30, test: function (r) { return r.kills >= 80; } },
    { id: 'qk150', name: '单局斩妖 150 只',  reward: 55, test: function (r) { return r.kills >= 150; } },
    { id: 'qc15',  name: '单局峰值连斩 15',  reward: 35, test: function (r) { return r.combo >= 15; } },
    { id: 'qb',    name: '击败一只妖王',     reward: 40, test: function (r) { return r.bossKills >= 1; } },
    { id: 'qt3',   name: '突破至金丹期',     reward: 30, test: function (r) { return r.tier >= 2; } },
    { id: 'qs',    name: '单局存活 180 秒',  reward: 35, test: function (r) { return r.time >= 180; } }
  ];
  function todayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function ensureQuests() {
    const k = todayKey();
    // 结构校验：id 必须在任务库里、done 必须是布尔——旧档 / 手改档也不会让渲染崩
    const valid = {};
    QUEST_POOL.forEach(function (q) { valid[q.id] = true; });
    let ok = Array.isArray(meta.quests) && meta.quests.length > 0;
    if (ok) {
      for (let i = 0; i < meta.quests.length; i++) {
        const q = meta.quests[i];
        if (!q || typeof q.id !== 'string' || !valid[q.id]) { ok = false; break; }
        if (typeof q.done !== 'boolean') q.done = false;
      }
    }
    if (meta.qdate !== k || !ok) {
      meta.qdate = k;
      const pool = QUEST_POOL.slice(), picks = [];
      for (let i = 0; i < 3 && pool.length; i++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
      meta.quests = picks.map(function (id) { return { id: id, done: false }; });
      saveJSON(MET_KEY, meta);
    }
  }

  // ---------- 构筑词条（突破三选一） ----------
  let paused = true;              // 开场前先冻结，免得还没开始就被围死
  let runOver = false;
  let pendingCards = null;
  let taken = [];
  let scrollCount = 0;
  let runBossKills = 0, finalSpawned = false, bossNextWave = 3;
  let tierTimes = [null, null, null, null, null];
  const mods = { dmg: 1, cd: 1, count: 0, pierce: 0, range: 1, crit: 0, critMul: 2.0, leech: 0, shock: 0, magnet: 0, hpBonus: 0 };

  const CARDS = [
    { id: 'atk',    name: '锋锐',     w: 10, desc: '攻击力 +18%',            apply: function () { mods.dmg += 0.18; } },
    { id: 'spd',    name: '迅捷',     w: 10, desc: '出招速度 +15%',          apply: function () { mods.cd *= 0.85; } },
    { id: 'range',  name: '长驱',     w: 7,  desc: '攻击范围 +18%',          apply: function () { mods.range += 0.18; } },
    { id: 'crit',   name: '锐意',     w: 9,  desc: '暴击率 +12%（2 倍伤害）', apply: function () { mods.crit += 0.12; } },
    { id: 'critd',  name: '摧枯',     w: 6,  desc: '暴击伤害 +70%',          apply: function () { mods.critMul += 0.7; } },
    { id: 'multi',  name: '万剑归宗', w: 6,  desc: '弹道 +1（近战改为扩大刀围）', apply: function () { mods.count += 1; } },
    { id: 'pierce', name: '透骨',     w: 6,  desc: '攻击穿透，可贯穿多敌',   apply: function () { mods.pierce += 1; } },
    { id: 'leech',  name: '噬血',     w: 7,  desc: '每斩一妖回血 1.5',       apply: function () { mods.leech += 1.5; } },
    { id: 'hp',     name: '淬体',     w: 8,  desc: '气血上限 +25（并回满）', apply: function () { mods.hpBonus += 25; player.maxhp = (player.char.hpBase || 100) + mods.hpBonus; player.hp = player.maxhp; } },
    { id: 'shock',  name: '雷罚',     w: 5,  desc: '击杀时 30% 引发冲击波',  apply: function () { mods.shock += 0.30; } },
    { id: 'magnet', name: '引灵',     w: 5,  desc: '拾取范围 +70%',          apply: function () { mods.magnet += 0.7; } }
  ];
  function pickCard() {
    let total = 0;
    for (const c of CARDS) total += c.w;
    let r = Math.random() * total;
    for (const c of CARDS) { r -= c.w; if (r <= 0) return c; }
    return CARDS[CARDS.length - 1];
  }
  // 洞府强化作为本局基底
  function applyBaseMods() {
    mods.dmg = 1 + meta.up.atk * 0.05;
    mods.cd = Math.pow(0.96, meta.up.spd);
    mods.crit = meta.up.crit * 0.04;
    mods.critMul = 2.0;
    mods.magnet = meta.up.mag * 0.30;
    mods.count = 0; mods.pierce = 0; mods.range = 1; mods.leech = 0; mods.shock = 0;
    mods.hpBonus = meta.up.hp * 15;
    player.maxhp = (player.char.hpBase || 100) + mods.hpBonus;
    player.hp = player.maxhp;
  }
  function rollDmg(base) {
    let d = base * mods.dmg;
    if (mods.crit > 0 && Math.random() < mods.crit) d *= mods.critMul;
    return d;
  }
  // 词条作用到武器配置上（伤害倍率不在这里乘，统一由 rollDmg 结算，免得重复叠乘）
  function applyMods(c) {
    c.cd = c.cd * mods.cd;
    if (c.kind === 'blade') {
      c.range *= mods.range;
      c.arc = Math.min(2.8, c.arc + mods.count * 0.14);
    } else {
      c.count += mods.count;
      c.life *= mods.range;
      if (mods.pierce) c.pierce = true;
    }
    return c;
  }

  // ---------- DOM ----------
  const elStone = document.getElementById('stone-val');
  const elCard = document.getElementById('cardpick');
  const elCardList = document.getElementById('card-list');
  const elCardSub = document.getElementById('card-sub');
  const elResult = document.getElementById('result');
  const elResTitle = document.getElementById('res-title');
  const elResBody = document.getElementById('res-body');
  const elMetaPanel = document.getElementById('meta-panel');
  const elUpList = document.getElementById('up-list');
  const elQuestList = document.getElementById('quest-list');
  const elAchList = document.getElementById('ach-list');
  const elMetaStone = document.getElementById('meta-stone');
  const elMute = document.getElementById('btn-mute');

  function renderCards() {
    if (!elCardList) return;
    elCardList.innerHTML = '';
    for (let i = 0; i < pendingCards.picks.length; i++) {
      const c = pendingCards.picks[i];
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML = '<b>' + c.name + '</b><small>' + c.desc + '</small>';
      (function (idx) { b.addEventListener('click', function () { chooseCard(idx); }); })(i);
      elCardList.appendChild(b);
    }
    if (elCardSub) elCardSub.textContent = pendingCards.tier >= 0 ? '突破 ' + TIER_NAMES[pendingCards.tier] + ' · 择一而悟' : '仙缘觉醒 · 择一';
    if (elCard) elCard.style.display = 'flex';
  }
  function chooseCard(i) {
    if (!pendingCards) return;
    const c = pendingCards.picks[i];
    if (!c) return;
    c.apply();
    taken.push(c.name);
    Sfx.pick();
    updateCardHud();
    if (elCard) elCard.style.display = 'none';
    pendingCards = null;
    nextCard();                       // 一帧内连破两境时，接着弹下一张
  }
  let cardQueue = [];
  function offerCards(tier) {
    const pool = CARDS.slice(), picks = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const c = pickCard();
      const k = pool.indexOf(c);
      picks.push(pool.splice(k < 0 ? 0 : k, 1)[0]);
    }
    cardQueue.push({ tier: tier, picks: picks });
    if (!pendingCards) nextCard();
  }
  function nextCard() {
    pendingCards = cardQueue.shift() || null;
    if (pendingCards) {
      paused = true;
      Sfx.tier(); buzz(30);
      const info = realmInfo();
      elToast.textContent = '突破！' + info.name + ' · ' + info.skill;
      elToast.style.display = 'block'; toastT = 2.4;
      renderCards();
    } else {
      paused = false;
    }
  }

  // ---------- 妖王 / 妖皇 ----------
  function spawnBoss(isFinal) {
    const t = tierIdx();
    const hp = Math.round((isFinal ? 1100 : 200) * (1 + t * 0.6));
    const pos = clampSpot(edgePos(Math.floor(Math.random() * 4)));
    const m = {
      id: ++uid, type: 'wolf', boss: isFinal ? 2 : 1, elite: true,
      x: pos.x, y: pos.y, face: 1,
      w: isFinal ? 104 : 78, h: isFinal ? 82 : 62,
      color: isFinal ? '#6a2f8c' : '#7a3a2a', dark: isFinal ? '#3c1a52' : '#4a2018',
      glow: isFinal ? '#e0a0ff' : '#ffb04a',
      hp: hp, maxhp: hp,
      speed: isFinal ? 86 : 98,
      dmg: Math.round((isFinal ? 26 : 16) * dmgScaler()),
      sway: Math.random() * 6.283, rush: 0, wander: 0, wanderA: 0,
      dx: 0, dy: 0, hit: 0, anim: Math.random() * 6, atkT: 2.4
    };
    monsters.push(m);
    elToast.textContent = isFinal ? '妖皇降临 · 混沌魔君' : '妖王出世 · 撼地魔猿';
    elToast.style.display = 'block'; toastT = isFinal ? 3.4 : 2.4;
    Sfx.boss(); buzz(40);
    return m;
  }
  function updateBosses(dt) {
    for (let i = monsters.length - 1; i >= 0; i--) {
      const m = monsters[i];
      if (!m.boss) continue;
      m.atkT -= dt;
      if (m.atkT > 0) continue;
      m.atkT = m.boss === 2 ? 2.2 : 3.0;
      const bx = m.x + m.w / 2, by = m.y + m.h / 2;
      const R = m.boss === 2 ? 200 : 150;
      rings.push({ x: bx, y: by, r: 12, grow: R * 2.4, life: 0.5, max: 0.5, col: m.glow });
      addShake(4);
      const pxn = player.x + player.w / 2, pyn = player.y + player.h / 2;
      if (Math.hypot(pxn - bx, pyn - by) < R + 14 && player.inv <= 0) {
        player.hp -= Math.round(m.dmg * 0.55); player.inv = 0.9;
        Sfx.hurt(); buzz(20); addShake(7);
        if (player.hp <= 0) { player.hp = 0; settle(false); }
      }
    }
  }
  function drawBossBar() {
    let b = null;
    for (const m of monsters) if (m.boss) { b = m; break; }
    if (!b) return;
    const W = Math.min(420, VW - 150), x = (VW - W) / 2, y = VH - 52;
    ctx.save();
    ctx.fillStyle = 'rgba(8,5,16,0.72)';
    ctx.fillRect(x - 3, y - 3, W + 6, 18);
    const hp = Math.max(0, b.hp / b.maxhp);
    ctx.fillStyle = b.boss === 2 ? '#c86aff' : '#ff9a3a';
    ctx.fillRect(x, y, Math.round(W * hp), 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 3.5, y - 3.5, W + 7, 19);
    ctx.font = 'bold 12px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffe27a';
    ctx.fillText((b.boss === 2 ? '妖皇 · 混沌魔君' : '妖王 · 撼地魔猿') + '　' + Math.max(0, Math.ceil(b.hp)) + '/' + b.maxhp, VW / 2, y - 6);
    ctx.restore();
  }

  // ---------- 稀有掉落：仙缘觉醒 ----------
  function awaken() {
    const c = pickCard();
    c.apply();
    taken.push(c.name);
    scrollCount++;
    Sfx.pick();
    const px = player.x + player.w / 2, py = player.y + player.h / 2;
    for (let i = 0; i < 3; i++) burst(px + (Math.random() - 0.5) * 70, py + (Math.random() - 0.5) * 70, '#ffe27a', 14, true);
    addShake(5);
    elToast.textContent = '仙缘觉醒 · 【' + c.name + '】' + c.desc;
    elToast.style.display = 'block'; toastT = 2.4;
    updateCardHud();
  }

  // ---------- 结算 ----------
  function settle(cleared) {
    if (runOver) return;
    runOver = true; paused = true; player.dead = true;
    if (cleared) { Sfx.win(); buzz([40, 60, 120]); } else { Sfx.die(); buzz(80); }

    const r = {
      kills: kills, tier: tierIdx(), combo: comboBest, wave: waveNo,
      time: Math.round(clock), cleared: !!cleared, bossKills: runBossKills
    };
    const prev = { kills: rec.bestKills, tier: rec.bestTier, combo: rec.bestCombo, time: rec.bestTime };
    const nb = [];
    if (r.kills > rec.bestKills) { rec.bestKills = r.kills; nb.push('斩妖纪录 → ' + r.kills); }
    if (r.tier > rec.bestTier) { rec.bestTier = r.tier; nb.push('最高境界 → ' + TIER_NAMES[r.tier]); }
    if (r.combo > rec.bestCombo) { rec.bestCombo = r.combo; nb.push('峰值连斩 → ' + r.combo); }
    if (r.wave > rec.bestWave) rec.bestWave = r.wave;
    if (r.time > rec.bestTime) rec.bestTime = r.time;
    for (let i = 0; i < 5; i++) {
      if (tierTimes[i] == null) continue;
      if (rec.fastest[i] == null || tierTimes[i] < rec.fastest[i]) {
        rec.fastest[i] = tierTimes[i];
        if (i >= 1) nb.push('最快' + TIER_NAMES[i] + ' → ' + tierTimes[i] + 's');
      }
    }
    if (cleared) rec.clears++;
    const before = rec.bosses;
    rec.bosses += r.bossKills;

    let gain = Math.round(r.kills / 2) + r.tier * 4 + r.bossKills * 8 + (cleared ? 120 : 0);
    ensureQuests();
    const qdone = [];
    for (const q of meta.quests) {
      if (q.done) continue;
      const def = QUEST_POOL.find(function (x) { return x.id === q.id; });
      if (def && def.test(r)) { q.done = true; gain += def.reward; qdone.push(def.name + ' +' + def.reward); }
    }
    const adone = [];
    const ar = Object.assign({}, r, { bosses: before + r.bossKills });
    for (const a of ACHS) {
      if (meta.ach[a.id]) continue;
      if (a.test(ar)) { meta.ach[a.id] = 1; gain += a.reward; adone.push(a.name + ' +' + a.reward); }
    }
    meta.stones += gain;
    saveJSON(REC_KEY, rec); saveJSON(MET_KEY, meta);

    showResult(r, prev, nb, qdone, adone, gain);
  }

  function showResult(r, prev, nb, qdone, adone, gain) {
    if (!elResBody) return;
    elResTitle.textContent = r.cleared ? '平定灵脉 · 通关！' : '道心受创';
    elResTitle.style.color = r.cleared ? '#ffd24a' : '#e0464f';
    const diff = r.kills - prev.kills;
    const near = (!r.cleared && prev.kills > 0 && diff < 0 && diff > -15) ? '<p class="res-near">距最高纪录只差 ' + (-diff) + ' 只——再来一局？</p>' : '';
    elResBody.innerHTML =
      near +
      '<table class="res-tb">' +
      '<tr><td>斩妖</td><td><b>' + r.kills + '</b>　<i>纪录 ' + rec.bestKills + '</i></td></tr>' +
      '<tr><td>境界</td><td><b>' + TIER_NAMES[r.tier] + '</b>　<i>最高 ' + TIER_NAMES[rec.bestTier] + '</i></td></tr>' +
      '<tr><td>峰值连斩</td><td><b>' + r.combo + '</b>　<i>纪录 ' + rec.bestCombo + '</i></td></tr>' +
      '<tr><td>妖潮波次</td><td><b>' + r.wave + '</b></td></tr>' +
      '<tr><td>妖王</td><td><b>' + r.bossKills + '</b></td></tr>' +
      '<tr><td>用时</td><td><b>' + r.time + 's</b></td></tr>' +
      '<tr><td>构筑</td><td><b>' + (taken.length ? taken.join(' · ') : '—') + '</b></td></tr>' +
      '</table>' +
      (nb.length ? '<p class="res-new">新纪录：' + nb.join('　') + '</p>' : '') +
      (qdone.length ? '<p class="res-q">任务完成：' + qdone.join('　') + '</p>' : '') +
      (adone.length ? '<p class="res-q">达成成就：' + adone.join('　') + '</p>' : '') +
      '<p class="res-gain">获得灵石 <b>+' + gain + '</b>　（共 ' + meta.stones + '）</p>';
    elResult.style.display = 'flex';
  }

  function resetRun() {
    kills = 0; herbs = 0; lastTierIdx = 0; waveNo = 0; waveTimer = 2.6; dripTimer = 0;
    clock = 0; combo = 0; comboT = 0; comboBest = 0; comboPop = 0; shake = 0;
    killTimes.length = 0; parts.length = 0; rings.length = 0;
    swords.length = 0; slashes.length = 0; items.length = 0; monsters.length = 0;
    taken = []; scrollCount = 0; runOver = false; runBossKills = 0; finalSpawned = false; bossNextWave = 3;
    tierTimes = [null, null, null, null, null]; pendingCards = null; cardQueue = [];
    player.dead = false; player.respawn = 0; player.inv = 0; player.anim = 0;
    player.x = WORLD.w / 2; player.y = WORLD.h / 2;
    dashT = 0; dashCd = 0; menuPaused = false;             // 冲遁冷却与菜单暂停一并归零
    applyBaseMods();
    centerCam(); updateCam();
    for (let i = 0; i < 8; i++) spawnItem();
    const n0 = Math.ceil(targetFoeCount() * 0.6);
    for (let i = 0; i < n0; i++) monsters.push(spawnMonster(null, true));
    if (elResult) elResult.style.display = 'none';
    if (elCard) elCard.style.display = 'none';
    if (elToast) { elToast.style.display = 'none'; toastT = 0; }
    paused = false;
    updateCardHud();
  }

  // ---------- 洞府面板（永久成长 / 任务 / 成就） ----------
  function updateCardHud() {
    let el = document.getElementById('build-val');
    if (!el) return;
    el.textContent = taken.length ? taken.length + ' 重' : '未悟';
  }
  function renderMeta() {
    if (!elUpList) return;
    ensureQuests();
    if (elMetaStone) elMetaStone.textContent = meta.stones;
    let h = '';
    for (const u of UPS) {
      const lv = meta.up[u.id] | 0, cost = u.cost(lv), maxed = lv >= u.max, can = !maxed && meta.stones >= cost;
      h += '<div class="up-row' + (can ? ' can' : '') + '">'
        + '<span class="up-name">' + u.name + '<i>' + u.desc + '</i></span>'
        + '<span class="up-lv">' + lv + '/' + u.max + '</span>'
        + '<button class="up-buy" data-up="' + u.id + '"' + (can ? '' : ' disabled') + '>'
        + (maxed ? '圆满' : cost + ' 灵石') + '</button></div>';
    }
    elUpList.innerHTML = h;
    for (const b of elUpList.querySelectorAll('.up-buy')) {
      b.addEventListener('click', function () { buyUp(b.getAttribute('data-up')); });
    }
    if (elQuestList) {
      elQuestList.innerHTML = meta.quests.map(function (q) {
        const def = QUEST_POOL.find(function (x) { return x.id === q.id; });
        return '<div class="q-row' + (q.done ? ' done' : '') + '"><span>' + (def ? def.name : q.id) + '</span><b>' + (q.done ? '已完成' : '+' + (def ? def.reward : 0)) + '</b></div>';
      }).join('');
    }
    if (elAchList) {
      elAchList.innerHTML = ACHS.map(function (a) {
        const got = !!meta.ach[a.id];
        return '<div class="q-row' + (got ? ' done' : '') + '"><span>' + a.name + '<i>' + a.desc + '</i></span><b>' + (got ? '已达成' : '+' + a.reward) + '</b></div>';
      }).join('');
    }
  }
  function buyUp(id) {
    const u = UPS.find(function (x) { return x.id === id; });
    if (!u) return;
    const lv = meta.up[id] | 0;
    if (lv >= u.max) return;
    const cost = u.cost(lv);
    if (meta.stones < cost) return;
    meta.stones -= cost;
    meta.up[id] = lv + 1;
    saveJSON(MET_KEY, meta);
    Sfx.pick();
    renderMeta();
    renderMetaStone();
  }
  function renderMetaStone() { if (elMetaStone) elMetaStone.textContent = meta.stones; if (elStone) elStone.textContent = meta.stones; }

  // ---------- 对外接口（开场 / 结算按钮 / 测试用） ----------
  window.GameAPI.start = function () {
    Sfx.unlock();
    ensureQuests();
    applyBaseMods();
    resetRun();
  };
  window.GameAPI.unlockAudio = function () { Sfx.unlock(); };
  window.GameAPI.again = function () { resetRun(); };
  window.GameAPI.toggleMute = function () { const on = Sfx.toggle(); if (elMute) elMute.textContent = on ? '🔊' : '🔇'; return on; };
  let metaOpen = false;
  window.GameAPI.openMeta = function (force) {
    metaOpen = (force === undefined) ? !metaOpen : !!force;
    if (elMetaPanel) elMetaPanel.style.display = metaOpen ? 'block' : 'none';
    renderMeta();
    renderMetaStone();
  };
  window.GameAPI.records = function () { return { rec: rec, meta: meta, taken: taken.slice() }; };
  window.GameAPI.mods = function () { return Object.assign({}, mods); };
  window.GameAPI.paused = function () { return paused; };
  // 供自动化测试使用：直接选定第 i 张牌，避免桩环境里点不到 DOM
  window.GameAPI.autoPick = function (i) {
    if (!pendingCards) return false;
    chooseCard(typeof i === 'number' ? i : 0);
    return true;
  };
  window.GameAPI.cardQ = function () { return (pendingCards ? 1 : 0) + cardQueue.length; };
  window.GameAPI.stones = function () { return meta.stones; };
  window.GameAPI.resultShown = function () { return runOver; };
  // 回洞府：冻结当前局，回到开场界面看成长与任务
  window.GameAPI.toHome = function () { resetRun(); paused = true; renderMeta(); renderMetaStone(); };

  // ---------- 设置接口 ----------
  window.GameAPI.opts = function () {
    return { aim: Settings.aim, q: Settings.q, fps: Settings.fps, sound: Settings.sound };
  };
  window.GameAPI.setOpt = function (k, v) {
    if (k === 'aim') Settings.aim = (v === 'on' || v === true);
    else if (k === 'fps') Settings.fps = (v === 'on' || v === true);
    else if (k === 'sound') {
      Settings.sound = (v === 'on' || v === true);
      Sfx.setOn(Settings.sound);
      if (elMute) elMute.textContent = Settings.sound ? '🔊' : '🔇';
    } else if (k === 'q' && (v === 'auto' || v === 'high' || v === 'mid' || v === 'low')) {
      Settings.q = v; autoCap = 2;                     // 手动改档位时重置自动上限
    }
    applyQuality();
    saveSettings();
    return window.GameAPI.opts();
  };
  // 设置菜单打开时冻结整局（与"选卡暂停"分开：关掉菜单不会误放行选卡）
  window.GameAPI.menuPause = function (on) { menuPaused = !!on; if (!menuPaused) last = performance.now(); };
  window.GameAPI.tryDash = function () { return tryDash(); };
  window.GameAPI.quality = function () { return { q: Settings.q, level: qLevel, fps: fpsShown, dash: dashT > 0, dashCd: dashCd }; };

  if (elMute) {
    elMute.textContent = Sfx.isOn() ? '🔊' : '🔇';
    elMute.addEventListener('click', function (e) { e.stopPropagation(); window.GameAPI.toggleMute(); });
  }
  // 设置里的"音效"是权威（旧版只存 im_mute，首次加载已在 Settings 里继承过）
  Sfx.setOn(Settings.sound);

  // 帧率统计 + 自动降画质（auto 档：连续约 1.5 秒低于 45 帧就降一档，只降不升免得来回跳）
  let fpsAcc = 0, fpsFrames = 0, slowCnt = 0;
  function tickFps(raw) {
    fpsAcc += raw; fpsFrames++;
    if (fpsAcc < 0.5) return;
    fpsShown = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0; fpsFrames = 0;
    if (Settings.q !== 'auto') { slowCnt = 0; return; }
    if (fpsShown < 45 && autoCap > 0) {
      slowCnt++;
      if (slowCnt >= 3) {
        autoCap--; slowCnt = 0; applyQuality();
        elToast.textContent = '帧率偏低 · 已自动降到' + ['低', '中', '高'][qLevel] + '画质';
        elToast.style.display = 'block'; toastT = 2.2;
      }
    } else slowCnt = 0;
  }

  function loop(now) {
    const raw = Math.max(0.001, (now - last) / 1000);   // 未钳制的真实间隔，用来测帧率
    const dt = Math.min(0.05, raw);
    last = now;
    update(dt);
    render();
    tickFps(raw);
    requestAnimationFrame(loop);
  }

  applyQuality();
  requestAnimationFrame(loop);
})();
