/* 仙岛寻踪 —— 等距多地图引擎
 * 地图由 assets/maps.json 描述：ground 字符网格（地砖）+ objects（图块）+ portals（传送门）
 * 所有图块来自 tools/slice_sheet.py 从 AI 素材总图切分所得（assets/sliced/*.png）
 */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0;
  var TILE_W = 120, TILE_H = 60, HW = 60, HH = 30, THICK = 15;

  // 角色 sprite sheet（6列×5行，64×64/格）：行0=正面 行1=右 行2=左 行3=背
  var SHEET = { cols: 6, rows: 5, cellW: 64, cellH: 64, frames: 6, dir: { down: 0, right: 1, left: 2, up: 3 }, pxScale: 2 };
  var PLAYER_SRC = 'assets/char_player.png';

  var IMG = {};              // file -> Image
  var MAPS = [], IDX = {}, CUR = null;
  var PAL = {}, WALK = '';
  var player = { mx: 12, my: 20, tx: 12, ty: 20, face: 'down', walk: 0 };
  var camX = 0, camY = 0, time = 0;
  // 视口缩放：Zt=目标倍数、Z=平滑跟随值；zAx/zAy=缩放锚点（默认屏幕中心）
  // 幅度刻意收窄在 0.62~1.72（约 ±40%）：再小地图碎成蚂蚁、再大贴图糊成色块
  var Z = 1, Zt = 1, ZMIN = 0.62, ZMAX = 1.72, zAx = 0, zAy = 0, zAnchor = false;
  var ZSTEP = 1.10;   // 每次滚轮/按键的步进（约 10%，手感温和）
  var fadeA = 0, fadeDir = 0, pending = null, portalLock = 0;
  var HOLD = false, held = false;
  var cloudCv = null;
  var ready = false;

  var SKY_TOP = '#a9d6ee', SKY_MID = '#d7ecf9', SKY_BOT = '#f4fbfe';

  // ---------------- 基础数学 ----------------
  function isoToScreen(mx, my) {
    return { x: (mx - my) * HW * Z + camX, y: (mx + my) * HH * Z + camY };
  }
  function screenToIso(sx, sy) {
    var a = (sx - camX) / (HW * Z), b = (sy - camY) / (HH * Z);
    return { mx: (a + b) / 2, my: (b - a) / 2 };
  }
  function cellChar(x, y) {
    if (!CUR || x < 0 || y < 0 || x >= CUR.w || y >= CUR.h) return ' ';
    return CUR.ground[y][x];
  }
  function isSolid(x, y) { return !!CUR && CUR.solid['' + x + ',' + y]; }
  function walkable(x, y) {
    var c = cellChar(x, y);
    return WALK.indexOf(c) >= 0 && !isSolid(x, y);
  }

  // ---------------- 视口缩放 ----------------
  function setZoom(nz, ax, ay) {
    nz = Math.max(ZMIN, Math.min(ZMAX, nz));
    if (ax !== undefined) { zAx = ax; zAy = ay; zAnchor = true; }
    if (!zAnchor) { zAx = W / 2; zAy = H / 2; zAnchor = true; }
    Zt = nz;
    updateZoomUI();
  }
  function zoomBy(f, ax, ay) { setZoom(Zt * f, ax, ay); }
  function updateZoomUI() {
    var el = document.getElementById('zoomVal');
    if (el) el.textContent = Math.round(Zt * 100) + '%';
    var rg = document.getElementById('zRange');
    if (rg) rg.value = Math.round(Zt * 100);
    var zi = document.getElementById('zIn'), zo = document.getElementById('zOut');
    if (zi) zi.disabled = Zt >= ZMAX - 1e-6;
    if (zo) zo.disabled = Zt <= ZMIN + 1e-6;
  }
  function buildZoomUI() {
    var zin = document.getElementById('zIn'), zout = document.getElementById('zOut'),
      zr = document.getElementById('zReset'), rg = document.getElementById('zRange');
    if (zin) zin.onclick = function () { zoomBy(ZSTEP, W / 2, H / 2); };
    if (zout) zout.onclick = function () { zoomBy(1 / ZSTEP, W / 2, H / 2); };
    if (zr) zr.onclick = function () { setZoom(1, W / 2, H / 2); };
    if (rg) {
      rg.min = Math.round(ZMIN * 100); rg.max = Math.round(ZMAX * 100);
      rg.value = Math.round(Zt * 100);
      rg.oninput = function () { setZoom(this.value / 100, W / 2, H / 2); };
    }
    updateZoomUI();
  }
  // 每帧平滑逼近目标缩放；按锚点做比例换算，使锚点下的画面不位移
  function stepZoom(dt) {
    if (Z === Zt) return;
    var nz = Z + (Zt - Z) * (1 - Math.pow(0.0009, dt));
    if (Math.abs(Zt - nz) < 0.002) nz = Zt;
    var r = nz / Z;
    if (zAnchor) {
      camX = zAx - (zAx - camX) * r;
      camY = zAy - (zAy - camY) * r;
    }
    Z = nz;
  }
  function solidFrom(mp) {
    var s = {};
    mp.objects.forEach(function (o) {
      if (o.solid === false) return;   // 贴花类（草丛/云/浅纹）不挡路
      for (var dy = 0; dy < (o.fh || 1); dy++)
        for (var dx = 0; dx < (o.fw || 1); dx++) s['' + (o.x + dx) + ',' + (o.y + dy)] = 1;
    });
    return s;
  }
  function nearWalkable(mp) {
    var cx = mp.w / 2, cy = mp.h / 2, solid = solidFrom(mp);
    var best = null, bd = 1e9;
    for (var y = 0; y < mp.h; y++) for (var x = 0; x < mp.w; x++) {
      if (WALK.indexOf(mp.ground[y][x]) < 0 || solid['' + x + ',' + y]) continue;
      var d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bd) { bd = d; best = { x: x, y: y }; }
    }
    return best || { x: 0, y: 0 };
  }

  // ---------------- 加载 ----------------
  function loadImg(src) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { IMG[src] = im; res(im); };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  }

  function boot() {
    Promise.all([
      fetch('assets/maps.json').then(function (r) { return r.json(); }),
      fetch('assets/sliced/manifest.json').then(function (r) { return r.json(); })
    ]).then(function (res) {
      var data = res[0];
      TILE_W = data.tileW; TILE_H = data.tileH; HW = TILE_W / 2; HH = TILE_H / 2;
      PAL = data.tilePalette; WALK = data.walkable;
      MAPS = data.maps;
      MAPS.forEach(function (m) { m.solid = solidFrom(m); m.home = nearWalkable(m); IDX[m.id] = m; });

      var files = {};
      Object.keys(PAL).forEach(function (k) { files[PAL[k]] = 1; });
      MAPS.forEach(function (m) { m.objects.forEach(function (o) { files[o.piece] = 1; }); });
      var list = Object.keys(files).map(function (f) { return 'assets/sliced/' + f; });
      list.push(PLAYER_SRC);

      return Promise.all(list.map(loadImg)).then(function () {
        buildCloudSprite();
        buildButtons();
        buildZoomUI();
        var q = new URLSearchParams(location.search);
        // ?z=1.25 可直接以指定缩放打开（同样受 0.62~1.72 限制）
        var zq = parseFloat(q.get('z'));
        if (zq > 0) {
          Z = Zt = Math.max(ZMIN, Math.min(ZMAX, zq));
          zAnchor = true; zAx = W / 2; zAy = H / 2;
          updateZoomUI();
        }
        var mid = q.get('map');
        var start = IDX[q.get('map')] ? q.get('map') : data.start.map;
        var m = IDX[start] || MAPS[0];
        var sx = q.get('x') !== null ? +q.get('x') : (IDX[start] ? m.home.x : data.start.x);
        var sy = q.get('y') !== null ? +q.get('y') : (IDX[start] ? m.home.y : data.start.y);
        switchTo(m.id, sx, sy, true);
        document.getElementById('loader').style.display = 'none';
        ready = true;
        window.__ready = true;
        var dbg = document.createElement('div');
        dbg.id = 'dbg'; dbg.style.display = 'none';
        document.body.appendChild(dbg);
        window.__dbg = dbg;
        var at = q.get('autotest');
        HOLD = q.get('hold') === '1';
        if (at && at.indexOf('portal') === 0) {
          setTimeout(function () { window.ISLES.stepOnPortal(0); }, 150);
        }
        requestAnimationFrame(loop);
      });
    }).catch(function (e) {
      document.getElementById('loader').textContent = '加载失败：' + e.message;
      console.error(e);
    });
  }

  // 预渲染一朵云，避免每帧多次渐变
  function buildCloudSprite() {
    var c = document.createElement('canvas');
    c.width = 340; c.height = 150;
    var g = c.getContext('2d');
    var blobs = [[70, 95, 62], [140, 78, 78], [215, 92, 64], [275, 100, 46], [105, 105, 50], [180, 108, 56]];
    blobs.forEach(function (b) {
      var rg = g.createRadialGradient(b[0], b[1], 4, b[0], b[1], b[2]);
      rg.addColorStop(0, 'rgba(255,255,255,.95)');
      rg.addColorStop(0.55, 'rgba(255,255,255,.62)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(b[0], b[1], b[2], 0, 6.2832); g.fill();
    });
    cloudCv = c;
  }

  var CLOUDS = [
    { x: 120, y: 90, s: 1.5, p: 0.30 }, { x: 700, y: 60, s: 1.15, p: 0.22 },
    { x: 1150, y: 150, s: 1.75, p: 0.34 }, { x: 380, y: 240, s: 0.95, p: 0.16 },
    { x: 980, y: 330, s: 1.3, p: 0.26 }, { x: -40, y: 380, s: 1.05, p: 0.19 },
    { x: 1450, y: 60, s: 1.4, p: 0.28 }, { x: 600, y: 470, s: 1.2, p: 0.24 }
  ];

  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, SKY_TOP); g.addColorStop(0.5, SKY_MID); g.addColorStop(1, SKY_BOT);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!cloudCv) return;
    var span = W + 700;
    for (var i = 0; i < CLOUDS.length; i++) {
      var c = CLOUDS[i];
      var sx = c.x - camX * c.p;
      sx = ((sx % span) + span) % span - 350;
      var sy = c.y - camY * c.p * 0.35;
      sy = ((sy % (H + 300)) + (H + 300)) % (H + 300) - 150;
      ctx.globalAlpha = 0.72;
      ctx.drawImage(cloudCv, sx, sy, 340 * c.s, 150 * c.s);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- 绘制 ----------------
  function drawGround() {
    var tw = TILE_W * Z, th = TILE_H * Z;
    for (var y = 0; y < CUR.h; y++) {
      for (var x = 0; x < CUR.w; x++) {
        var file = PAL[CUR.ground[y][x]];
        if (!file) continue;
        var img = IMG['assets/sliced/' + file];
        if (!img) continue;
        var p = isoToScreen(x, y);
        if (p.x < -tw * 1.6 || p.x > W + tw * 1.6 || p.y < -th * 4 || p.y > H + th * 4) continue;
        // 统一按宽度归一到 TILE_W*Z，保证菱形水平对角线与网格严格对齐
        var s = tw / img.width;
        ctx.drawImage(img, p.x - tw / 2, p.y, tw, img.height * s);
      }
    }
  }

  function drawPortal(pt) {
    var p = isoToScreen(pt.x, pt.y);
    var cx = p.x, cy = p.y + HH * Z;
    var k = 1 + 0.14 * Math.sin(time * 3.4);
    var R = 66 * k * Z;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, R);
    rg.addColorStop(0, 'rgba(120,240,255,.55)');
    rg.addColorStop(0.5, 'rgba(70,200,255,.22)');
    rg.addColorStop(1, 'rgba(60,180,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(150,250,255,' + (0.72 + 0.26 * Math.sin(time * 3.4)) + ')';
    ctx.lineWidth = 2.5 * Z;
    ctx.beginPath();
    ctx.moveTo(cx, cy - HH * Z - 3 * Z); ctx.lineTo(cx + HW * Z - 4 * Z, cy);
    ctx.lineTo(cx, cy + HH * Z + 3 * Z); ctx.lineTo(cx - HW * Z + 4 * Z, cy);
    ctx.closePath(); ctx.stroke();
    ctx.restore();

    ctx.font = 'bold ' + (15 * Z).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    var label = '⇄ ' + pt.label;
    ctx.lineWidth = 3.5 * Z; ctx.strokeStyle = 'rgba(6,12,24,.8)';
    ctx.strokeText(label, cx, cy - 46 * Z);
    ctx.fillStyle = '#9df6ff';
    ctx.fillText(label, cx, cy - 46 * Z);
  }

  function drawCharacter() {
    var img = IMG[PLAYER_SRC];
    var p = isoToScreen(player.mx, player.my);
    // 角色是 64px 帧的像素画：按整数倍 2× 绘制（128px），每个源像素＝2×2 方块，
    // 缩放时也不会被插值糊掉 —— 所以角色单独走最近邻，不跟随背景的平滑开关
    var dh = SHEET.cellH * SHEET.pxScale * Z, dw = dh * (SHEET.cellW / SHEET.cellH);
    var baseY = p.y + HH * Z;
    // 影子
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(p.x, baseY - 2, TILE_W * 0.20 * Z, TILE_H * 0.20 * Z, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
    if (!img) return;
    var row = SHEET.dir[player.face] || 0;
    var frame = (player.walk > 0 ? Math.floor(player.walk * 6) % SHEET.frames : 0);
    var sx = frame * SHEET.cellW, sy = row * SHEET.cellH;
    var sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx, sy, SHEET.cellW, SHEET.cellH,
      p.x - dw / 2, baseY - dh + 4, dw, dh);
    ctx.imageSmoothingEnabled = sm;
  }

  function render() {
    // Z<=1 保持硬边像素观感；放大时开插值，避免就近邻放大出锯齿方块
    ctx.imageSmoothingEnabled = Z > 1.02;
    drawSky();
    if (!CUR) return;
    drawGround();

    // 传送门画在地面上、物件下
    CUR.portals.forEach(drawPortal);

    // 物件按深度排序（x+y 大者更靠前）
    var list = [];
    CUR.objects.forEach(function (o, i) {
      list.push({ k: (o.x + (o.fw || 1) - 1) + (o.y + (o.fh || 1) - 1) + 0.5, i: i, o: o });
    });
    list.push({ k: player.mx + player.my, i: -1, o: null });
    list.sort(function (a, b) { return a.k - b.k; });

    list.forEach(function (it) {
      if (it.i < 0) { drawCharacter(); return; }
      var o = it.o;
      var img = IMG['assets/sliced/' + o.piece];
      if (!img) return;
      var ax = o.x + ((o.fw || 1) - 1) / 2, ay = o.y + ((o.fh || 1) - 1) / 2;
      var p = isoToScreen(ax, ay);
      var bx = p.x, by = p.y + HH * Z + (o.dy || 0) * Z;
      var ow = img.width * Z, oh = img.height * Z;
      if (bx < -ow || bx > W + ow || by < -oh * 1.4 || by > H + oh * 1.6) return;
      ctx.drawImage(img, Math.round(bx - ow / 2), Math.round(by - oh), Math.round(ow), Math.round(oh));
    });

    // 洞外虚空柔化（地图边缘渐隐到天空）
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(180,220,240,.16)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    if (fadeA > 0) {
      ctx.fillStyle = 'rgba(7,12,26,' + fadeA.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------- 逻辑 ----------------
  function switchTo(id, x, y, silent) {
    CUR = IDX[id] || MAPS[0];
    player.mx = player.tx = x; player.my = player.ty = y;
    player.face = 'down'; player.walk = 0;
    portalLock = 0.5;
    camX = W / 2 - (x - y) * HW * Z;
    camY = H / 2 - (x + y) * HH * Z;
    document.getElementById('mapName').textContent = CUR.name;
    var btns = document.querySelectorAll('#mapBtns button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].dataset.id === CUR.id);
    document.getElementById('hint').textContent = silent ? '踩上青色光门即可切换地图'
      : '已传送至「' + CUR.name + '」 · ' + CUR.note;
  }

  function couldStand(x, y) {
    var o = [[0, 0], [-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]];
    for (var i = 0; i < o.length; i++) if (!walkable(Math.round(x) + o[i][0], Math.round(y) + o[i][1])) return false;
    return true;
  }

  var keys = {};
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    keys[k.toLowerCase()] = 1;
    if (k.indexOf('Arrow') === 0) e.preventDefault();
    // 键盘缩放：+ / - 步进，0 复位
    if (k === '+' || k === '=') zoomBy(ZSTEP, W / 2, H / 2);
    else if (k === '-' || k === '_') zoomBy(1 / ZSTEP, W / 2, H / 2);
    else if (k === '0') setZoom(1, W / 2, H / 2);
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = 0; });

  function inputDir() {
    var dx = 0, dy = 0;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    return { dx: dx, dy: dy };
  }

  function update(dt) {
    time += dt;
    stepZoom(dt);
    if (portalLock > 0) portalLock -= dt;

    // —— 过渡状态机 ——
    if (fadeDir === 1) {
      fadeA += dt / 0.42;
      if (HOLD && fadeA >= 0.55) { fadeA = 0.55; held = true; }
      if (fadeA >= 1) { fadeA = 1; var pt = pending; pending = null; switchTo(pt.to, pt.spawnX, pt.spawnY, false); fadeDir = -1; }
    } else if (fadeDir === -1) {
      fadeA -= dt / 0.42;
      if (fadeA <= 0) { fadeA = 0; fadeDir = 0; }
    }
    if (fadeDir !== 0) { updateCam(dt); return; }

    var d = inputDir();
    var speed = 5.2;
    var moving = false;
    if (d.dx || d.dy) {
      var nx = player.mx + d.dx * speed * dt, ny = player.my + d.dy * speed * dt;
      if (couldStand(nx, player.my)) player.mx = nx;
      if (couldStand(player.mx, ny)) player.my = ny;
      player.tx = Math.round(player.mx); player.ty = Math.round(player.my);
      moving = true;
    } else if (Math.abs(player.tx - player.mx) > 0.001 || Math.abs(player.ty - player.my) > 0.001) {
      var dx = player.tx - player.mx, dy = player.ty - player.my;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var stepLen = speed * dt;
      if (dist <= stepLen) { player.mx = player.tx; player.my = player.ty; }
      else { player.mx += dx / dist * stepLen; player.my += dy / dist * stepLen; }
      moving = true;
    }
    player.walk = moving ? player.walk + dt : 0;
    if (moving) {
      var fdx = player.tx - player.mx, fdy = player.ty - player.my;
      if (d.dx || d.dy) { fdx = d.dx; fdy = d.dy; }
      if (Math.abs(fdx) > Math.abs(fdy)) player.face = fdx > 0 ? 'right' : 'left';
      else player.face = fdy > 0 ? 'down' : 'up';
    }

    // —— 传送门检测 ——
    if (portalLock <= 0) {
      var pcx = Math.round(player.mx), pcy = Math.round(player.my);
      for (var i = 0; i < CUR.portals.length; i++) {
        var pt = CUR.portals[i];
        var onCell = (Math.abs(player.mx - pt.x) < 0.34 && Math.abs(player.my - pt.y) < 0.34);
        if (onCell) { pending = pt; fadeDir = 1; player.tx = player.mx; player.ty = player.my; break; }
      }
    }
    updateCam(dt);
    var posEl = document.getElementById('pos');
    if (posEl) posEl.textContent = Math.round(player.mx) + ', ' + Math.round(player.my);
  }

  function updateCam(dt) {
    var k = 1 - Math.pow(0.0016, dt);
    var px = (player.mx - player.my) * HW * Z, py = (player.mx + player.my) * HH * Z;
    camX += (W / 2 - px - camX) * k;
    camY += (H / 2 - py - camY) * k;
  }

  // 点击移动
  function onClick(e) {
    var r = canvas.getBoundingClientRect();
    var iso = screenToIso(e.clientX - r.left, e.clientY - r.top);
    var cx = Math.round(iso.mx), cy = Math.round(iso.my);
    if (walkable(cx, cy) && !isSolid(cx, cy)) { player.tx = cx; player.ty = cy; }
  }
  canvas.addEventListener('mousedown', function (e) { if (e.button === 0) onClick(e); });

  // 鼠标滚轮缩放（以指针为锚点）
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = canvas.getBoundingClientRect();
    // 单次事件限幅，避免一格滚轮就跳到底；触控板小增量则保持顺滑
    var f = Math.pow(1.0022, -e.deltaY);
    f = Math.max(0.90, Math.min(1.11, f));
    zoomBy(f, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // 触屏双指捏合缩放
  function touchDist(e) {
    var a = e.touches[0], b = e.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function touchMid(e) {
    var r = canvas.getBoundingClientRect(), a = e.touches[0], b = e.touches[1];
    return { x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top };
  }
  var pinchD = 0;
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length >= 2) { pinchD = touchDist(e); e.preventDefault(); return; }
    if (e.touches[0]) onClick(e.touches[0]);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length >= 2) {
      var d = touchDist(e);
      if (pinchD > 0 && d > 0) { var m = touchMid(e); zoomBy(d / pinchD, m.x, m.y); }
      pinchD = d;
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinchD = 0; });

  function buildButtons() {
    var box = document.getElementById('mapBtns');
    box.innerHTML = '';
    MAPS.forEach(function (m) {
      var b = document.createElement('button');
      b.textContent = m.name; b.dataset.id = m.id;
      b.onclick = function () { if (CUR.id !== m.id) switchTo(m.id, m.home.x, m.home.y, false); };
      box.appendChild(b);
    });
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  var last = 0;
  function loop(ts) {
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (!held) update(dt);
    render();
    if (window.__dbg && CUR) {
      window.__dbg.textContent = JSON.stringify({
        map: CUR.id, fade: +fadeA.toFixed(2), held: held,
        mx: +player.mx.toFixed(2), my: +player.my.toFixed(2),
        zoom: +Z.toFixed(3), zoomT: +Zt.toFixed(3)
      });
    }
    requestAnimationFrame(loop);
  }

  // ---------------- 调试接口（供 headless 验证） ----------------
  window.ISLES = {
    get ready() { return ready; },
    get map() { return CUR ? CUR.id : null; },
    list: function () { return MAPS.map(function (m) { return { id: m.id, name: m.name, w: m.w, h: m.h, objects: m.objects.length, portals: m.portals.map(function (p) { return { x: p.x, y: p.y, to: p.to }; }) }; }); },
    state: function () { return { map: CUR && CUR.id, mx: +player.mx.toFixed(2), my: +player.my.toFixed(2), fade: +fadeA.toFixed(2), zoom: +Z.toFixed(3) }; },
    setZoom: function (z) { setZoom(z, W / 2, H / 2); return Zt; },
    goto: function (id, x, y) { switchTo(id, x === undefined ? IDX[id].home.x : x, y === undefined ? IDX[id].home.y : y, false); },
    /** 把玩家放到当前地图第 i 个传送门上，下一次 update 即触发切换 */
    stepOnPortal: function (i) { var pt = CUR.portals[i || 0]; player.mx = pt.x; player.my = pt.y; player.tx = pt.x; player.ty = pt.y; portalLock = 0; },
    tick: function (dt) { update(dt || 0.016); render(); },
    _p: player
  };

  boot();
})();
