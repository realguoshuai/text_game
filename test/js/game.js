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
  // 文件名带版本号：浏览器会缓存同名图片，换精灵时必须换名，否则玩家仍看到旧图
  // 主角外形可切换：全部取自「武侠修仙免费包」，规格一致（6 列 × 5 行 @64px）。
  // 1 号是该包官方 Godot 示例的默认角色；其余几个同时兼任 NPC，不重复打包素材。
  // 直接指定：?hero=14
  var HERO_OPTIONS = [
    { n: 1, file: 'char_hero.png', label: '1 号' },
    { n: 5, file: 'npc_5.png', label: '5 号' },
    { n: 10, file: 'npc_10.png', label: '10 号' },
    { n: 14, file: 'npc_14.png', label: '14 号' },
    { n: 18, file: 'npc_18.png', label: '18 号' },
    { n: 20, file: 'npc_20.png', label: '20 号' }
  ];
  var PLAYER_CHAR = HERO_OPTIONS[0].file;      // 主角当前用的动作表（chars_atlas 里的 key）
  var PLAYER_SRC = PLAYER_CHAR;                // 主角图集 key（setHero / buildHeroUI 会改写；先给默认值，避免严格模式下未声明报错）
  // maps.json 里 npc.char 写成 'npc_5'，对应动作表文件 npc_5.png
  var npcCharFile = function (c) { return c + '.png'; };

  /* ---------------- 图集（atlas）----------------
   * 原来每个图块、每个角色都是独立 PNG：43 + 6 + 12 = 61 个文件、61 次请求。
   * 浏览器的同域并发只有 6 个左右，排队本身就要好几秒 —— 首屏慢主要慢在这里，
   * 不是慢在字节数。现在打成 3 张图集，请求数 61 -> 3。
   * 代价是每次绘制都要多传一个源矩形（sx/sy/sw/sh），见 drawPiece/drawActor。
   */
  var ATLAS = {
    tiles: { img: null, rect: null },
    chars: { img: null, rect: null },
    foes: { img: null, rect: null }
  };
  function atlasReady(a) { return !!(a.img && a.rect); }

  var IMG = {};              // file -> Image（只留给非图集的小图，例如云）
  var MAPS = [], IDX = {}, CUR = null;
  var PAL = {}, WALK = '';
  var player = { mx: 12, my: 20, tx: 12, ty: 20, face: 'down', walk: 0, path: null,
    hp: 130, maxhp: 130, atk: 20, def: 8, exp: 0, stones: 0, realmName: '炼气期',
    attackCd: 0, targetFoe: null, dead: false, flash: 0 };

  // ---------------- 战斗数据（碑林石阵 = 妖兽猎场） ----------------
  // 严格模式下这些必须先用 var 声明，否则 switchTo 里 `foes=…` 会抛 ReferenceError 直接卡死启动。
  var foes = [], floaters = [], particles = [], clickMark = null;
  var MELEE = 1.45, AGGRO = 6.5;   // 近身出手半径 / 妖兽仇恨半径（格）
  var FOE_DEFS = {
    assassin: { key: 'assassin', name: '刀影飞镖',     hp: 42,  atk: 14, def: 4,  exp: 12, stones: [3, 7],   mv: 3.2,  scale: 1.00 },
    golem:    { key: 'golem',    name: '九州震击石魔', hp: 130, atk: 16, def: 12, exp: 32, stones: [8, 16],  mv: 1.55, scale: 1.18, elite: true },
    wraith:   { key: 'wraith',   name: '水墨幽魂',     hp: 74,  atk: 17, def: 7,  exp: 22, stones: [5, 11],  mv: 2.2,  scale: 1.02 }
  };
  // 12 只散布在 30×30 碑林；坐标由 snapWalkable 吸附到最近可走格，故可略放宽。
  var BEILIN_SPAWNS = [
    { x: 6,  y: 6,  t: 'assassin' }, { x: 10, y: 4,  t: 'assassin' }, { x: 22, y: 8,  t: 'assassin' },
    { x: 25, y: 18, t: 'assassin' }, { x: 8,  y: 20, t: 'assassin' },
    { x: 14, y: 10, t: 'golem' },    { x: 18, y: 16, t: 'golem' },    { x: 10, y: 22, t: 'golem' },
    { x: 20, y: 5,  t: 'wraith' },   { x: 24, y: 22, t: 'wraith' },   { x: 5,  y: 15, t: 'wraith' },
    { x: 16, y: 26, t: 'wraith' }
  ];
  var camX = 0, camY = 0, time = 0;
  // 上一帧的绘制计数（QA 用）：确认 NPC 真的走了 drawNPC 分支，
  // 而不是被 <0 的兜底分支当成玩家画出来
  var _draw = { actor: 0, npc: 0 };
  // 视口缩放：Zt=目标倍数、Z=平滑跟随值；zAx/zAy=缩放锚点（默认屏幕中心）
  // 幅度刻意收窄在 0.62~1.72（约 ±40%）：再小地图碎成蚂蚁、再大贴图糊成色块
  var Z = 1, Zt = 1, ZMIN = 0.62, ZMAX = 1.72, zAx = 0, zAy = 0, zAnchor = false;
  var ZSTEP = 1.10;   // 每次滚轮/按键的步进（约 10%，手感温和）
  var fadeA = 0, fadeDir = 0, pending = null, portalLock = 0;
  var HOLD = false, held = false;
  var cloudCv = null;
  var NPC_FILES = {};
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
  /* 首屏加载要解决两件事：
   *   ① 请求数：61 个零散 PNG -> 3 张图集（tools/build_atlas.py 产出）
   *   ② 可见进度：图集是大文件，只报「第几张好了」会长时间停在 0%。
   *      所以用 XHR 拿 blob，读 e.loaded/e.total 得到字节级进度，
   *      再按各文件的实际字节数加权合成总进度 —— 进度条才是匀速走的。
   * 注意 Image 标签没有下载进度事件，这是必须绕道 XHR/blob 的原因。
   */
  // weight 用「预估 KB」当权重：进度是按权重加权的，所以大文件占大头，
  // 进度条看起来才是匀速的。权重全程固定不变 —— 中途改用真实字节会让
  // 分母突然变大、进度条倒退。
  var LOAD_PLAN = [
    { url: 'assets/maps.json', json: true, weight: 4, label: '读取地图数据' },
    { url: 'assets/tiles_atlas.png', atlas: 'tiles', weight: 617, label: '载入地貌与建筑' },
    { url: 'assets/chars_atlas.png', atlas: 'chars', weight: 249, label: '载入人物动作' },
    { url: 'assets/foes_atlas.png', atlas: 'foes', weight: 155, label: '载入妖兽图鉴' },
    { url: 'assets/tiles_atlas.json', json: true, weight: 4, label: '读取地貌索引' },
    { url: 'assets/chars_atlas.json', json: true, weight: 4, label: '读取人物索引' },
    { url: 'assets/foes_atlas.json', json: true, weight: 4, label: '读取妖兽索引' }
  ];
  var loadUI = { bar: null, pct: null, tip: null, sub: null };

  function fmtBytes(n) {
    if (!n || n < 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function setProgress(frac, label, sub) {
    frac = Math.max(0, Math.min(1, frac));
    if (loadUI.bar) loadUI.bar.style.width = (frac * 100).toFixed(1) + '%';
    if (loadUI.pct) loadUI.pct.textContent = Math.round(frac * 100) + '%';
    if (loadUI.tip && label) loadUI.tip.textContent = label;
    if (loadUI.sub) loadUI.sub.textContent = sub || '';
  }

  /** XHR 取 blob：能拿到下载进度，且不依赖 fetch（file:// 下更宽容） */
  function xhrBlob(url, onProgress, weight) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.responseType = 'blob';
      if (onProgress) {
        x.onprogress = function (e) {
          if (e.lengthComputable) onProgress(weight, e.loaded, e.total);
        };
      }
      x.onload = function () {
        // file:// 协议下 status 为 0 也算成功
        if (x.status === 200 || x.status === 0) res(x.response);
        else rej(new Error(url + ' -> HTTP ' + x.status));
      };
      x.onerror = function () { rej(new Error(url + ' 网络错误')); };
      x.onabort = function () { rej(new Error(url + ' 已取消')); };
      x.send();
    });
  }

  function blobJson(b) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { try { res(JSON.parse(fr.result)); } catch (e) { rej(e); } };
      fr.onerror = function () { rej(new Error('读取失败')); };
      fr.readAsText(b);
    });
  }

  function blobImage(b) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(b);
      var im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); res(im); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('图片解码失败')); };
      im.src = url;
    });
  }

  function boot() {
    loadUI.bar = document.getElementById('loadBar');
    loadUI.pct = document.getElementById('loadPct');
    loadUI.tip = document.getElementById('loadTip');
    loadUI.sub = document.getElementById('loadSub');

    // 进度权重：JSON 给小权重、图集按实际字节数分配，这样进度条不会在
    // 「几个 JSON 秒过、图集卡住」的落差里骗人。
    var W_TOTAL = LOAD_PLAN.reduce(function (a, p) { return a + p.weight; }, 0);
    var got = {};
    function report(label, sub) {
      var acc = 0;
      LOAD_PLAN.forEach(function (p) {
        acc += Math.min(1, got[p.url] || 0) * p.weight;
      });
      setProgress(acc / W_TOTAL, label, sub);
    }

    var step = 0;
    function next() {
      if (step >= LOAD_PLAN.length) return Promise.resolve();
      var p = LOAD_PLAN[step++];
      report(p.label, '');
      return xhrBlob(p.url, function (w, loaded, tot) {
        if (p.json) return;
        got[p.url] = loaded / (tot || p.weight);
        report(p.label, fmtBytes(loaded) + ' / ' + fmtBytes(tot));
      }).then(function (blob) {
        got[p.url] = 1;
        return p.json ? blobJson(blob).then(function (v) { p.value = v; })
                      : blobImage(blob).then(function (im) { p.value = im; });
      }).then(function () {
        report(p.label, '');
        return next();
      });
    }

    report('读取地图数据', '');
    return next().then(function () {
      setProgress(1, '就绪', '');
      var data = LOAD_PLAN[0].value;
      ATLAS.tiles.img = LOAD_PLAN[1].value; ATLAS.tiles.rect = LOAD_PLAN[4].value;
      ATLAS.chars.img = LOAD_PLAN[2].value; ATLAS.chars.rect = LOAD_PLAN[5].value;
      ATLAS.foes.img = LOAD_PLAN[3].value; ATLAS.foes.rect = LOAD_PLAN[6].value;

      TILE_W = data.tileW; TILE_H = data.tileH; HW = TILE_W / 2; HH = TILE_H / 2;
      PAL = data.tilePalette; WALK = data.walkable;
      MAPS = data.maps;
      MAPS.forEach(function (m) { m.solid = solidFrom(m); m.home = nearWalkable(m); IDX[m.id] = m; });

      var q = new URLSearchParams(location.search);
      {
        buildCloudSprite();
        buildButtons();
        buildZoomUI();
        // 主角外形：?hero=14 指定 > 上次手选记忆 > 默认 1 号
        buildHeroUI(+q.get('hero') || 0);
        // ?z=1.25 可直接以指定缩放打开（同样受 0.62~1.72 限制）
        var zq = parseFloat(q.get('z'));
        if (zq > 0) {
          Z = Zt = Math.max(ZMIN, Math.min(ZMAX, zq));
          zAnchor = true; zAx = W / 2; zAy = H / 2;
          updateZoomUI();
        }
        var start = IDX[q.get('map')] ? q.get('map') : data.start.map;
        var m = IDX[start] || MAPS[0];
        // 没显式给坐标时：起点图用 maps.json 里写好的 start（山门广场），
        // 其它图落到离地图中心最近的可走格 —— 旧的写法把 start 里的坐标当摆设，一直没用上。
        var useCfg = (start === data.start.map);
        var sx = q.get('x') !== null ? +q.get('x') : (useCfg ? data.start.x : m.home.x);
        var sy = q.get('y') !== null ? +q.get('y') : (useCfg ? data.start.y : m.home.y);
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
        // 无头浏览器里 rAF 的 dt 常常接近 0（虚拟时钟只推进定时器、不推进帧），
        // 过渡动画就会卡在 fade≈0.08 永远走不完 —— 这是抓取环境的假象，不是引擎 bug。
        // 所以自测一律用 ISLES.tick(1/60) 手动推进固定步长，结果可复现。
        function sim(seconds) {
          var n = Math.round(seconds * 60);
          for (var i = 0; i < n; i++) window.ISLES.tick(1 / 60);
        }
        if (at && at.indexOf('portal') === 0) {
          setTimeout(function () { window.ISLES.stepOnPortal(0); sim(3); }, 60);
        }
        if (at === 'walk') {
          // 程序化按住「右」1.2 秒：读 #dbg 的 mx 有没有变大，即可确认键盘行走真的生效
          keys['d'] = 1;
          setTimeout(function () { sim(1.2); keys['d'] = 0; sim(0.1); }, 60);
        }
        if (at && at.indexOf('click') === 0) {
          // 点击移动朝向自测： ?autotest=click&cdx=3&cdy=0 （目标格 = 当前格 + 偏移）
          // 断言：点击走路后 player.face 必须变成行进方向，而不是一直停在初始的 down
          var cdx = +(q.get('cdx') || 0), cdy = +(q.get('cdy') || 0);
          var csecs = +(q.get('secs') || 1.6);
          setTimeout(function () {
            var fb = player.face;
            var ok = window.ISLES.clickCell(Math.round(player.mx) + cdx, Math.round(player.my) + cdy);
            sim(csecs);
            var pb = document.getElementById('probe');
            if (!pb) {
              pb = document.createElement('div'); pb.id = 'probe';
              pb.style.display = 'none'; document.body.appendChild(pb);
            }
            var rx = Math.round(player.mx), ry = Math.round(player.my);
            pb.textContent = JSON.stringify({
              faceBefore: fb, targetAccepted: ok, faceAfter: player.face,
              mx: +player.mx.toFixed(2), my: +player.my.toFixed(2),
              walk: +player.walk.toFixed(2),
              // 落点必须始终是合法可走格：点击寻路加了碰撞+绕路后，这条性质不能被破坏
              cellOk: walkable(rx, ry) && !isSolid(rx, ry),
              reached: Math.abs(player.mx - player.tx) < 0.02 && Math.abs(player.my - player.ty) < 0.02,
              pathLen: player.path ? player.path.length : 0
            });
          }, 60);
        }
        if (at === 'fight') {
          // ?map=beilin&autotest=fight —— 贴脸反复攻击，验证击杀掉落与修为增长
          setTimeout(function () {
            var f0 = foes[0];
            if (f0) { player.mx = f0.x; player.my = f0.y; player.tx = f0.x; player.ty = f0.y; }
            for (var i = 0; i < 120; i++) { window.ISLES.attackNearest(); window.ISLES.tick(0.5); }
            var alive = foes.filter(function (x) { return x.alive; }).length;
            var pb = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
            pb.textContent = JSON.stringify({ alive: alive, total: foes.length, exp: player.exp, stones: player.stones, hp: Math.round(player.hp) });
          }, 60);
        }
        requestAnimationFrame(loop);
      }
    }).catch(function (e) {
      // 加载失败时把原因写在进度条下面 —— 只留一句「加载中」会让用户莫名其妙
      if (loadUI.tip) loadUI.tip.textContent = '加载失败';
      if (loadUI.sub) loadUI.sub.textContent = e.message;
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
  /* 图集取件：把「图块名」翻译成 {img, sx, sy, w, h}
   * 打包成图集后，每个绘制点除了目标矩形，还必须给出源矩形（sx/sy/sw/sh）。
   * 抽成一个函数是为了只在这里处理「找不到」的情况 —— 少一个图块不该让整帧崩掉。
   */
  function piece(name) {
    var a = ATLAS.tiles, r = a.rect && a.rect[name];
    if (!a.img || !r) return null;
    return { img: a.img, sx: r[0], sy: r[1], w: r[2], h: r[3] };
  }
  function charPiece(file) {
    var a = ATLAS.chars, r = a.rect && a.rect[file];
    if (!a.img || !r) return null;
    return { img: a.img, sx: r[0], sy: r[1], w: r[2], h: r[3] };
  }
  function foePiece(name) {
    var a = ATLAS.foes, r = a.rect && a.rect[name];
    if (!a.img || !r) return null;
    return { img: a.img, sx: r[0], sy: r[1], w: r[2], h: r[3] };
  }

  function drawGround() {
    var tw = TILE_W * Z, th = TILE_H * Z;
    for (var y = 0; y < CUR.h; y++) {
      for (var x = 0; x < CUR.w; x++) {
        var file = PAL[CUR.ground[y][x]];
        if (!file) continue;
        var pz = piece(file);
        if (!pz) continue;
        var p = isoToScreen(x, y);
        if (p.x < -tw * 1.6 || p.x > W + tw * 1.6 || p.y < -th * 4 || p.y > H + th * 4) continue;
        // 统一按宽度归一到 TILE_W*Z，保证菱形水平对角线与网格严格对齐
        var s = tw / pz.w;
        ctx.drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h,
          p.x - tw / 2, p.y, tw, pz.h * s);
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

  /** 画一个角色（影子 + 按朝向/帧取图）。玩家与 NPC 共用同一套绘制，规格完全一致 */
  function drawActor(img, mx, my, face, frame, bob, ox, oy) {
    _draw.actor++;
    var p = isoToScreen(mx, my);
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
    if (!img) return null;
    var row = SHEET.dir[face] || 0;
    var sx = (ox || 0) + frame * SHEET.cellW, sy = (oy || 0) + row * SHEET.cellH;
    var sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx, sy, SHEET.cellW, SHEET.cellH,
      p.x - dw / 2, baseY - dh + 4 + (bob || 0) * Z, dw, dh);
    ctx.imageSmoothingEnabled = sm;
    return { x: p.x, top: baseY - dh + 4 };
  }

  function drawCharacter() {
    var pz = charPiece(PLAYER_SRC); if (!pz) return;
    var frame = (player.walk > 0 ? Math.floor(player.walk * 6) % SHEET.frames : 0);
    drawActor(pz.img, player.mx, player.my, player.face, frame, 0, pz.sx, pz.sy);
  }

  /** NPC：站立取第 0 帧（图集已把最中性那帧旋到 0），叠一点极轻的呼吸起伏，不再是死图 */
  function drawNPC(n) {
    _draw.npc++;
    var pz = charPiece(npcCharFile(n.char)); if (!pz) return;
    var bob = Math.sin(time * 1.7 + n.x * 1.3 + n.y * 0.7) * 1.2;
    var node = drawActor(pz.img, n.x, n.y, n.face, 0, bob, pz.sx, pz.sy);
    if (!node) return;
    var near = Math.abs(player.mx - n.x) < 2.2 && Math.abs(player.my - n.y) < 2.2;
    var ty = node.top - 6 * Z;
    ctx.textAlign = 'center';
    ctx.font = 'bold ' + (12 * Z).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 3.5 * Z; ctx.strokeStyle = 'rgba(6,12,24,.82)';
    ctx.strokeText(n.name, node.x, ty);
    ctx.fillStyle = near ? '#ffe9a6' : '#cfe6ff';
    ctx.fillText(n.name, node.x, ty);
    if (near && n.line) {                      // 走近了才说话
      ctx.font = (12.5 * Z).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
      var w = ctx.measureText(n.line).width, pad = 7 * Z, hh = 19 * Z, ly = ty - 17 * Z;
      ctx.fillStyle = 'rgba(10,18,34,.78)';
      ctx.beginPath(); ctx.rect(node.x - w / 2 - pad, ly - hh + 6 * Z, w + pad * 2, hh); ctx.fill();
      ctx.lineWidth = 1.5 * Z; ctx.strokeStyle = 'rgba(255,215,120,.55)'; ctx.stroke();
      ctx.fillStyle = '#f2f6ff';
      ctx.fillText(n.line, node.x, ly);
    }
  }

  function render() {
    _draw.actor = 0; _draw.npc = 0;
    // Z<=1 保持硬边像素观感；放大时开插值，避免就近邻放大出锯齿方块
    ctx.imageSmoothingEnabled = Z > 1.02;
    drawSky();
    if (!CUR) return;
    drawGround();
    drawClickMark();

    // 传送门画在地面上、物件下
    CUR.portals.forEach(drawPortal);

    // 物件按深度排序（x+y 大者更靠前）；NPC 与玩家一起参与排序
    var list = [];
    CUR.objects.forEach(function (o, i) {
      list.push({ k: (o.x + (o.fw || 1) - 1) + (o.y + (o.fh || 1) - 1) + 0.5, i: i, o: o });
    });
    (CUR.npcs || []).forEach(function (n) { list.push({ k: n.x + n.y + 0.01, i: -2, o: n }); });
    list.push({ k: player.mx + player.my, i: -1, o: null });
    list.sort(function (a, b) { return a.k - b.k; });

    list.forEach(function (it) {
      // 注意顺序：NPC 用 i=-2、玩家用 i=-1，两者都 <0。
      // 必须先判 -2 再判 <0，否则 NPC 会全部被当成玩家画出来（地图上到处是主角的复制品）。
      if (it.i === -2) { drawNPC(it.o); return; }
      if (it.i === -1) { drawCharacter(); return; }
      var o = it.o;
      var pz = piece(o.piece);
      if (!pz) return;
      var ax = o.x + ((o.fw || 1) - 1) / 2, ay = o.y + ((o.fh || 1) - 1) / 2;
      var p = isoToScreen(ax, ay);
      var bx = p.x, by = p.y + HH * Z + (o.dy || 0) * Z;
      var ow = pz.w * Z, oh = pz.h * Z;
      if (bx < -ow || bx > W + ow || by < -oh * 1.4 || by > H + oh * 1.6) return;
      ctx.drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h, Math.round(bx - ow / 2), Math.round(by - oh), Math.round(ow), Math.round(oh));
    });
    drawFloaters();   // 伤害飘字 + 击杀粒子（猎场用）

    // 洞外虚空柔化（地图边缘渐隐到天空）
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(180,220,240,.16)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    if (fadeA > 0) {
      ctx.fillStyle = 'rgba(7,12,26,' + fadeA.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    updateHUD();
  }

  // ---------------- 逻辑 ----------------
  function switchTo(id, x, y, silent) {
    CUR = IDX[id] || MAPS[0];
    // 落点若压在实体/虚空上（传送门落点、?x=&y= 手写坐标都可能），就近吸附到可走格，
    // 否则玩家一落地就卡死、连传送阵都触发不了。
    var sp = snapWalkable(CUR, x, y);
    x = sp.x; y = sp.y;
    player.mx = player.tx = x; player.my = player.ty = y;
    player.face = 'down'; player.walk = 0; player.path = null;
    portalLock = 0.5;
    camX = W / 2 - (x - y) * HW * Z;
    camY = H / 2 - (x + y) * HH * Z;
    document.getElementById('mapName').textContent = CUR.name;
    var btns = document.querySelectorAll('#mapBtns button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].dataset.id === CUR.id);
    document.getElementById('hint').textContent = silent ? '踩上青色光门即可切换地图'
      : '已传送至「' + CUR.name + '」 · ' + CUR.note;
    // 只有碑林石阵刷妖兽（猎场）；其它图清空战斗状态，避免切回去还残留怪物
    if (CUR.id === 'beilin') { foes = makeFoes(); }
    else { foes = []; floaters = []; particles = []; player.targetFoe = null; }
  }

  function couldStand(x, y) {
    // ⚠️ 这里必须只用「整数格」采样。
    // 旧版写成 walkable(Math.round(x) - 0.25, ...) 之类，落到 CUR.ground[y][11.75]
    // 取到 undefined，walkable 恒为 false —— 表现就是「WASD 只能转向、走不动」。
    // 现在：目标格可走即可（配合横纵分轴推进，天然获得贴墙滑行手感）。
    return walkable(Math.round(x), Math.round(y));
  }

  // 点击寻路的 BFS：返回从 (sx,sy) 到 (tx,ty) 的逐格路径（不含起点），不可达返回 null。
  // 地图最大 34×34＝1156 格，四邻搜索开销可忽略，不需要 A*。
  // 为什么需要它：点击移动原本是「朝目标直线推进」且不做碰撞，会穿墙；
  // 只加碰撞不加绕路，遇到建筑就会卡在半路，反而不如从前的「总能走到」。
  function findPath(sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return null;
    if (!walkable(tx, ty)) return null;
    var N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var seen = {}, prev = {};
    var sk = sx + ',' + sy;
    seen[sk] = 1;
    var queue = [[sx, sy]], head = 0;
    while (head < queue.length) {
      var cx = queue[head][0], cy = queue[head][1];
      head++;
      if (cx === tx && cy === ty) {
        var path = [], kx = tx, ky = ty;
        while (!(kx === sx && ky === sy)) {
          path.push([kx, ky]);
          var pk = prev[kx + ',' + ky];
          kx = pk[0]; ky = pk[1];
        }
        path.reverse();
        return path;
      }
      for (var n = 0; n < 4; n++) {
        var ax = cx + N4[n][0], ay = cy + N4[n][1], ak = ax + ',' + ay;
        if (seen[ak] || !walkable(ax, ay)) continue;
        seen[ak] = 1; prev[ak] = [cx, cy];
        queue.push([ax, ay]);
      }
    }
    return null;
  }
  /** 把一个可能落在实体/虚空上的坐标吸附到最近的合法可走格（BFS 同心圈） */
  function snapWalkable(mp, x, y) {
    if (walkable(x, y)) return { x: x, y: y };
    for (var r = 1; r <= 12; r++) {
      var best = null, bd = 1e9;
      for (var dx = -r; dx <= r; dx++) {
        for (var dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          var nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= mp.w || ny >= mp.h) continue;
          if (WALK.indexOf(mp.ground[ny][nx]) < 0 || mp.solid['' + nx + ',' + ny]) continue;
          var d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = { x: nx, y: ny }; }
        }
      }
      if (best) return best;
    }
    return { x: mp.home.x, y: mp.home.y };
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

  // 四向朝向：统一按「行进方向」判定，键盘与点击移动共用这一处。
  // 旧版把这段内联在键盘分支里，点击移动压根没更新朝向 ——
  // 表现就是点地面走路时角色永远保持初始的正面(down)。
  function setFaceFromDelta(dx, dy) {
    if (!dx && !dy) return;
    if (Math.abs(dx) > Math.abs(dy)) player.face = dx > 0 ? 'right' : 'left';
    else player.face = dy > 0 ? 'down' : 'up';
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
    var px0 = player.mx, py0 = player.my;

    if (d.dx || d.dy) {
      // 键盘直推：x/y 分轴推进，撞到实体时自动沿墙滑行
      var nx = player.mx + d.dx * speed * dt, ny = player.my + d.dy * speed * dt;
      if (couldStand(nx, player.my)) player.mx = nx;
      if (couldStand(player.mx, ny)) player.my = ny;
      // 键盘操作即取消点击寻路：tx/ty 直接对齐当前坐标而不是四舍五入 ——
      // 取整会留下 0.0~0.5 格的残差，松手后会被点击分支当成「还有目标」，
      // 于是角色一边往回挪一点点、一边把朝向翻成反方向（test: keyboard d 抓到的回归）
      player.path = null;
      player.tx = player.mx; player.ty = player.my;
      // 按下方向键立刻转身（哪怕前面被挡，也该先转过来）
      setFaceFromDelta(d.dx, d.dy);
    } else if (player.path && player.path.length) {
      // 点击寻路：沿 BFS 路径逐格跟随。路径点都是四邻相邻格，
      // 两点之间直线只经过这两格，所以不需要再做碰撞检测，也不会穿墙。
      var wp = player.path[0];
      var dx = wp[0] - player.mx, dy = wp[1] - player.my;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var stepLen = speed * dt;
      if (dist <= stepLen) {
        player.mx = wp[0]; player.my = wp[1];
        player.path.shift();
        if (!player.path.length) { player.path = null; player.tx = player.mx; player.ty = player.my; }
      } else {
        var ux = dx / dist, uy = dy / dist;
        player.mx += ux * stepLen;
        player.my += uy * stepLen;
      }
      // ★ 这里原来什么都没有 —— 点击移动全程不更新朝向，所以角色永远正对镜头
      setFaceFromDelta(dx, dy);
    } else if (player.targetFoe && player.targetFoe.alive && !player.dead) {
      // 锁定妖兽后自动追上去，贴脸自动出手（攻击受冷却约束）
      var tf = player.targetFoe;
      var tdx = tf.x - player.mx, tdy = tf.y - player.my, tdist = Math.hypot(tdx, tdy);
      if (tdist > MELEE - 0.1) {
        var tux = tdx / (tdist || 1), tuy = tdy / (tdist || 1), tsp = speed * dt;
        if (couldStand(player.mx + tux * tsp, player.my)) player.mx += tux * tsp;
        if (couldStand(player.mx, player.my + tuy * tsp)) player.my += tuy * tsp;
        setFaceFromDelta(tdx, tdy);
        player.walk = player.walk + dt;
      } else {
        tryAttack();
      }
    }

    // 行走帧只在**真的挪动了**时才推进：贴着墙按方向键就是「转身站住」，
    // 不会再出现原地踏空的假动作（旧版把「按了键」当「在走路」，所以只转向不移动）
    var moved = Math.abs(player.mx - px0) > 1e-5 || Math.abs(player.my - py0) > 1e-5;
    player.walk = moved ? player.walk + dt : 0;

    // —— 传送门检测 ——
    if (portalLock <= 0) {
      var pcx = Math.round(player.mx), pcy = Math.round(player.my);
      for (var i = 0; i < CUR.portals.length; i++) {
        var pt = CUR.portals[i];
        var onCell = (Math.abs(player.mx - pt.x) < 0.34 && Math.abs(player.my - pt.y) < 0.34);
        if (onCell) { pending = pt; fadeDir = 1; player.path = null; player.tx = player.mx; player.ty = player.my; break; }
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

  // 设置移动目标格：鼠标点击与自测钩子 ISLES.clickCell 共用同一个入口，
  // 保证自测跑的确实是点击移动这条真实路径，而不是另写一份逻辑
  function setTargetCell(cx, cy) {
    if (!walkable(cx, cy)) return false;
    // 用 BFS 找一条绕开建筑/水面的路；不可达就整个忽略这次点击，
    // 而不是让角色朝墙一路撞过去
    var path = findPath(Math.round(player.mx), Math.round(player.my), cx, cy);
    if (!path || !path.length) return false;
    player.path = path;
    player.tx = cx; player.ty = cy;
    return true;
  }

  // ---------------- 妖兽战斗逻辑 ----------------
  function makeFoes() {
    return BEILIN_SPAWNS.map(function (s) {
      var d = FOE_DEFS[s.t];
      var cell = snapWalkable(CUR, s.x, s.y);
      return {
        def_: d, key: d.key, name: d.name,
        x: cell.x, y: cell.y, home: cell,
        hp: d.hp, maxhp: d.hp, atk: d.atk, def: d.def, exp: d.exp, stones: d.stones,
        face: 'down', flash: 0, atkAnim: 0, deadT: 0, atkCd: 0, alive: true, respawn: 0
      };
    });
  }
  function addFloater(mx, my, text, color) {
    floaters.push({ mx: mx, my: my, off: 0, text: text, color: color, life: 0.95, max: 0.95 });
  }
  function spawnParticles(mx, my) {
    for (var i = 0; i < 10; i++) {
      var a = Math.random() * 6.2832, sp = 1.5 + Math.random() * 2.5;
      particles.push({ mx: mx, my: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 0.6, max: 0.6, color: '#ffe1a0' });
    }
  }
  // 玩家出手：范围 MELEE 内最近的妖兽受击；real=max(1,round(atk-def))
  function tryAttack() {
    if (player.dead) return;
    if (player.attackCd > 0) return;
    player.attackCd = 0.45;
    var best = null, bd = MELEE;
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i]; if (!f.alive) continue;
      var d = Math.hypot(f.x - player.mx, f.y - player.my);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) return;
    setFaceFromDelta(best.x - player.mx, best.y - player.my);
    var real = Math.max(1, Math.round(player.atk - best.def));
    best.hp -= real; best.flash = 0.22;
    addFloater(best.x, best.y - 0.3, '-' + real, '#ffd36b');
    if (best.hp <= 0) killFoe(best);
  }
  function killFoe(f) {
    f.alive = false; f.hp = 0;
    player.exp += f.exp;
    var st = f.stones[0] + Math.floor(Math.random() * (f.stones[1] - f.stones[0] + 1));
    player.stones += st;
    addFloater(f.x, f.y - 0.4, '+' + st + ' 灵石', '#8bf3ff');
    spawnParticles(f.x, f.y);
    if (player.targetFoe === f) player.targetFoe = null;
    f.respawn = 10 + Math.random() * 6;   // 一段时间后原地复活，打怪场常驻
  }
  function respawnFoe(f) {
    var s = snapWalkable(CUR, f.home.x, f.home.y);
    f.x = s.x; f.y = s.y; f.hp = f.maxhp; f.alive = true; f.flash = 0; f.atkCd = 0;
  }
  function playerDie() {
    var lost = Math.floor(player.stones * 0.3);
    player.stones -= lost;
    var s = (CUR && CUR.spawn) ? CUR.spawn : { x: CUR.home.x, y: CUR.home.y };
    player.mx = player.tx = s.x; player.my = player.ty = s.y;
    player.path = null; player.targetFoe = null;
    player.hp = player.maxhp; player.dead = false; player.flash = 0.3;
    addFloater(player.mx, player.my - 0.4, '被击退！', '#ff8080');
    var h = document.getElementById('hint');
    if (h) h.textContent = '力竭遁走，折损灵石 ' + lost + '（已回出生点）';
  }
  function updateFoes(dt) {
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i];
      if (!f.alive) { f.respawn -= dt; if (f.respawn <= 0) respawnFoe(f); continue; }
      if (f.flash > 0) f.flash = Math.max(0, f.flash - dt);
      if (f.atkAnim > 0) f.atkAnim = Math.max(0, f.atkAnim - dt);
      var dx = player.mx - f.x, dy = player.my - f.y, dist = Math.hypot(dx, dy);
      f.atkCd -= dt;
      if (dist < AGGRO && !player.dead) {
        var sp = f.def_.mv * dt, ux = dx / (dist || 1), uy = dy / (dist || 1);
        if (couldStand(f.x + ux * sp, f.y)) f.x += ux * sp;
        if (couldStand(f.x, f.y + uy * sp)) f.y += uy * sp;
        f.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        if (dist < MELEE + 0.15 && f.atkCd <= 0) {
          f.atkCd = 1.0; f.atkAnim = 0.32;
          var real = Math.max(1, Math.round(f.atk - player.def * 0.5));
          player.hp -= real; player.flash = 0.25;
          addFloater(player.mx, player.my - 0.35, '-' + real, '#ff6b6b');
          if (player.hp <= 0) playerDie();
        }
      }
    }
  }
  function updateFloaters(dt) {
    if (clickMark) { clickMark.life -= dt; if (clickMark.life <= 0) clickMark = null; }
    for (var i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i]; f.life -= dt; f.off += 34 * dt; if (f.life <= 0) floaters.splice(i, 1);
    }
    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j]; p.life -= dt; p.mx += p.vx * dt; p.my += p.vy * dt; p.vy += 6 * dt;
      if (p.life <= 0) particles.splice(j, 1);
    }
  }
  // 图集键是 `base_idle_xxx` / `base_attack_xxx` 这种带状态后缀的，
  // 而 foes 对象里只存了 base（f.key）。这里按「攻击帧优先、否则待机帧、再兜底取首帧」拼出真实键，
  // 这样即便盲切方向偶有错位，妖兽也至少能显示出来而不会整只消失。
  function foeFrameKey(f) {
    var base = f.key, rect = ATLAS.foes.rect || {};
    if (f.atkAnim > 0) {
      var ka = base + '_attack_' + f.face;
      if (rect[ka]) return ka;
    }
    var ki = base + '_idle_' + f.face;
    if (rect[ki]) return ki;
    var keys = Object.keys(rect);
    for (var i = 0; i < keys.length; i++) if (keys[i].indexOf(base + '_') === 0) return keys[i];
    return base;
  }
  function drawFoe(f) {
    if (!f.alive) return;
    var pz = foePiece(foeFrameKey(f));
    var p = isoToScreen(f.x, f.y);
    var baseY = p.y + HH * Z;
    ctx.save();
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(p.x, baseY - 2, TILE_W * 0.18 * Z, TILE_H * 0.18 * Z, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
    if (!pz) return;
    var sc = f.def_.scale || 1.15;
    var ow = pz.w * Z * sc, oh = pz.h * Z * sc;
    var dx = p.x - ow / 2, dy = baseY - oh;
    var sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h, Math.round(dx), Math.round(dy), Math.round(ow), Math.round(oh));
    if (f.flash > 0) {  // 受击闪白（lighter 只叠加在精灵像素上，透明处不显）
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.9, f.flash * 4);
      ctx.drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h, Math.round(dx), Math.round(dy), Math.round(ow), Math.round(oh));
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = sm;
    if (f.def_.boss || f.def_.elite) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = f.def_.boss ? 'rgba(255,90,90,.7)' : 'rgba(255,200,90,.6)';
      ctx.lineWidth = 2 * Z;
      ctx.beginPath(); ctx.ellipse(p.x, baseY - oh * 0.5, ow * 0.5, oh * 0.32, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
    var dist = Math.hypot(f.x - player.mx, f.y - player.my);
    if (player.targetFoe === f || dist < 3.0) {
      var ty = dy - 6 * Z;
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + (12 * Z).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
      ctx.lineWidth = 3.5 * Z; ctx.strokeStyle = 'rgba(6,12,24,.82)';
      ctx.strokeText(f.name, p.x, ty); ctx.fillStyle = '#ffd0c0'; ctx.fillText(f.name, p.x, ty);
      var bw = Math.max(40 * Z, ow * 0.7), bh = 5 * Z, bx = p.x - bw / 2, by = ty - 14 * Z;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = f.def_.boss ? '#ff5a5a' : (f.def_.elite ? '#ffb24d' : '#7be07b');
      ctx.fillRect(bx, by, bw * Math.max(0, f.hp / f.maxhp), bh);
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1 * Z; ctx.strokeRect(bx, by, bw, bh);
    }
  }
  // 点击行走的目标指示：落地菱形 + 扩散圈，淡出 0.7s，让玩家明确知道点到了哪格
  function drawClickMark() {
    if (!clickMark) return;
    var p = isoToScreen(clickMark.mx, clickMark.my);
    var cx = p.x, cy = p.y + HH * Z;
    var t = Math.max(0, clickMark.life / clickMark.max);
    var grow = 1 - t;
    ctx.save();
    var r = TILE_W * 0.5 * (0.4 + grow * 0.8) * Z;
    ctx.globalAlpha = t * 0.8; ctx.strokeStyle = '#8bf3ff'; ctx.lineWidth = 2.5 * Z;
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = t * 0.9; ctx.fillStyle = 'rgba(139,243,255,.30)'; ctx.strokeStyle = '#d6f6ff'; ctx.lineWidth = 1.5 * Z;
    var dw = HW * Z, dh = HH * Z;
    ctx.beginPath();
    ctx.moveTo(cx, cy - dh); ctx.lineTo(cx + dw, cy); ctx.lineTo(cx, cy + dh); ctx.lineTo(cx - dw, cy); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawFloaters() {
    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      var p = isoToScreen(f.mx, f.my);
      var y = p.y - 46 * Z - f.off;
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.max * 1.4));
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + (15 * Z).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
      ctx.lineWidth = 3.5 * Z; ctx.strokeStyle = 'rgba(6,12,24,.85)';
      ctx.strokeText(f.text, p.x, y); ctx.fillStyle = f.color; ctx.fillText(f.text, p.x, y);
    }
    ctx.globalAlpha = 1;
    for (var j = 0; j < particles.length; j++) {
      var pt = particles[j];
      var q = isoToScreen(pt.mx, pt.my);
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      var s = 4 * Z; ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  function updateHUD() {
    var hpv = document.getElementById('hpv'); if (hpv) hpv.textContent = Math.max(0, Math.round(player.hp)) + '/' + player.maxhp;
    var fill = document.getElementById('hpfill'); if (fill) fill.style.width = Math.max(0, player.hp / player.maxhp * 100) + '%';
    var expv = document.getElementById('expv'); if (expv) expv.textContent = player.realmName + ' · 修为 ' + Math.round(player.exp);
    var sv = document.getElementById('stonev'); if (sv) sv.textContent = player.stones;
    var ft = document.getElementById('foetarget');
    if (ft) {
      if (player.targetFoe && player.targetFoe.alive) {
        var f = player.targetFoe;
        ft.style.display = 'block';
        ft.querySelector('.ftname').textContent = f.name + '  ' + Math.max(0, Math.round(f.hp)) + '/' + f.maxhp;
        ft.querySelector('.ftfill').style.width = Math.max(0, f.hp / f.maxhp * 100) + '%';
      } else ft.style.display = 'none';
    }
  }

  // 点击移动
  function onClick(e) {
    var r = canvas.getBoundingClientRect();
    var iso = screenToIso(e.clientX - r.left, e.clientY - r.top);
    var cx = iso.mx, cy = iso.my;
    // 点到妖兽：锁定追击（清空普通寻路目标）；点空地：取消锁定
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i]; if (!f.alive) continue;
      if (Math.hypot(f.x - cx, f.y - cy) < 0.8) { player.targetFoe = f; player.path = null; return; }
    }
    player.targetFoe = null;
    var tx = Math.round(cx), ty = Math.round(cy);
    if (setTargetCell(tx, ty)) clickMark = { mx: tx, my: ty, life: 0.7, max: 0.7 };
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

  // ---------------- 主角外形切换 ----------------
  function setHero(h) {
    if (!h) return;
    PLAYER_SRC = h.file;
    try { localStorage.setItem('isles.hero', String(h.n)); } catch (e) { }
    var bs = document.querySelectorAll('#heroBtns button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', +bs[i].dataset.n === h.n);
    document.getElementById('hint').textContent = '主角已换为免费包第 ' + h.n + ' 号角色';
  }
  function buildHeroUI(preferN) {
    var box = document.getElementById('heroBtns');
    if (!box) return;
    box.innerHTML = '';
    HERO_OPTIONS.forEach(function (h) {
      var b = document.createElement('button');
      b.textContent = h.label; b.dataset.n = h.n;
      b.title = '把主角换成免费包第 ' + h.n + ' 号角色';
      b.onclick = function () { setHero(h); };
      box.appendChild(b);
    });
    var want = preferN || 0;
    if (!want) { try { want = +localStorage.getItem('isles.hero') || 0; } catch (e) { } }
    var pick = HERO_OPTIONS.filter(function (h) { return h.n === want; })[0] || HERO_OPTIONS[0];
    PLAYER_SRC = pick.file;
    var bs = document.querySelectorAll('#heroBtns button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', +bs[i].dataset.n === pick.n);
    var nowEl = document.getElementById('heroNow');
    if (nowEl) nowEl.textContent = pick.label;
    if (preferN) { try { localStorage.setItem('isles.hero', String(pick.n)); } catch (e) { } }
  }

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
    if (ready) updateHUD();
    render();
    if (window.__dbg && CUR) {
      window.__dbg.textContent = JSON.stringify({
        map: CUR.id, fade: +fadeA.toFixed(2), held: held,
        mx: +player.mx.toFixed(2), my: +player.my.toFixed(2),
        face: player.face, walk: +player.walk.toFixed(2),
        zoom: +Z.toFixed(3), zoomT: +Zt.toFixed(3),
        actors: _draw.actor, npcs: _draw.npc
      });
    }
    requestAnimationFrame(loop);
  }

  // ---------------- 调试接口（供 headless 验证） ----------------
  window.ISLES = {
    get ready() { return ready; },
    get map() { return CUR ? CUR.id : null; },
    list: function () { return MAPS.map(function (m) { return { id: m.id, name: m.name, w: m.w, h: m.h, objects: m.objects.length, portals: m.portals.map(function (p) { return { x: p.x, y: p.y, to: p.to }; }) }; }); },
    state: function () { return { map: CUR && CUR.id, mx: +player.mx.toFixed(2), my: +player.my.toFixed(2), face: player.face, fade: +fadeA.toFixed(2), zoom: +Z.toFixed(3) }; },
    /** 等价于鼠标点击第 (x,y) 格：走的是 onClick 同一条设置目标格的路径 */
    clickCell: function (x, y) { return setTargetCell(x, y); },
    setZoom: function (z) { setZoom(z, W / 2, H / 2); return Zt; },
    heroes: function () { return HERO_OPTIONS.map(function (h) { return { n: h.n, src: h.file }; }); },
    setHero: function (n) { setHero(HERO_OPTIONS.filter(function (h) { return h.n === n; })[0]); return PLAYER_SRC; },
    goto: function (id, x, y) { switchTo(id, x === undefined ? IDX[id].home.x : x, y === undefined ? IDX[id].home.y : y, false); },
    /** 把玩家放到当前地图第 i 个传送门上，下一次 update 即触发切换 */
    stepOnPortal: function (i) { var pt = CUR.portals[i || 0]; player.mx = pt.x; player.my = pt.y; player.tx = pt.x; player.ty = pt.y; player.path = null; portalLock = 0; },
    tick: function (dt) { update(dt || 0.016); render(); },
    attackNearest: function () { attackNearest(); },
    foeCount: function () { return (foes || []).filter(function (f) { return f.alive; }).length; },
    _p: player
  };

  boot();
})();
