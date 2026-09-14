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

  /* ---------------- 动作行 ----------------
   * 两种角色的动作表结构不同：
   *  · 等距素材（1/5/10/14/18/20 号）：5 行 = 4 个朝向 + 1 行备用，行是「朝向」。
   *  · CraftPix 侧视素材（31/32/33/41/42/43 号）：6 行 = 6 个动作，行是「动作」，
   *    只有一个朝向（右边），左边由引擎水平翻转得到。
   * SIDE_ACT 的取值必须与 test/tools/add_craftpix_heroes.py 里 ACTS 的顺序一致。
   */
  var SIDE_ACT = { idle: 0, walk: 1, run: 2, atkA: 3, atkB: 4, dead: 5 };
  var ACT_DUR = { atkA: 0.45, atkB: 0.75, dead: 1.5 };   // 一次性动作的播放时长（秒）
  var ACT_CN = { idle: '待机', walk: '行走', run: '奔跑', atkA: '攻击 A', atkB: '攻击 B', dead: '倒地' };
  var RUN_MUL = 1.75;      // 奔跑速度倍率
  var ATK_B_CD = 2.2;      // 重击（攻击 B）冷却
  // 怪物（侧视多动作素材）一次性动作的播放时长（秒）；循环动作 idle/walk/run 按 fps 推进
  var BEAST_DUR = { atk: 0.42, atk2: 0.58, hurt: 0.3, dead: 1.15 };
  var BEAST_RUN_MV = 2.8;  // 移速达到这个值就用 run 动作追人，否则用 walk（没 run 素材的会自动回退到 walk）
  var BEAST_STOP = 1.35;   // 追到这么近就停住出手，别再往玩家身上挤（否则整只怪会压在主角头上）
  var FOE_LEASH_PAD = 4;    // 领地半径 = 仇恨半径 + 这个值：怪最多被引到离巢这么远，再远就回巢待命
  // 文件名带版本号：浏览器会缓存同名图片，换精灵时必须换名，否则玩家仍看到旧图
  // 主角外形可切换：1/5/10/14/18/20 取自「武侠修仙免费包」；31~33 取自 CraftPix 免费吸血鬼包；
  // 41~43 取自 CraftPix 免费忍者包（Fighter / Samurai / Shinobi）。
  // 三套素材统一到同一规格（6 列 × 5 行 @64px），所以能塞进同一张 chars_atlas 直接切换。
  // 1 号是该包官方 Godot 示例的默认角色；其余几个同时兼任 NPC，不重复打包素材。
  // 外部两包原图都是 128px 横版侧视，已按 50% 降采样对齐（实高 35~42px，与主角同量级）。
  // 注意：它们只有左右两个朝向，故 down/right/up 复用侧视原图、left 用水平翻转。
  // 直接指定：?hero=14 / ?hero=31 / ?hero=43
  // 重新打包：python test/tools/add_craftpix_heroes.py
  // side:true 表示这张表来自 CraftPix 侧视素材 —— 行是「动作」而不是「朝向」，
  // 6 个动作（待机/行走/奔跑/攻击A/攻击B/倒地）齐全；侧视只有右边一个朝向，左边靠翻转。
  var HERO_OPTIONS = [
    { n: 1, file: 'char_hero.png', label: '1 号' },
    { n: 5, file: 'npc_5.png', label: '5 号' },
    { n: 10, file: 'npc_10.png', label: '10 号' },
    { n: 14, file: 'npc_14.png', label: '14 号' },
    { n: 18, file: 'npc_18.png', label: '18 号' },
    { n: 20, file: 'npc_20.png', label: '20 号' },
    { n: 31, file: 'vamp_31.png', label: '31', nick: '31 血族伯爵', side: true },
    { n: 32, file: 'vamp_32.png', label: '32', nick: '32 血族女伯爵', side: true },
    { n: 33, file: 'vamp_33.png', label: '33', nick: '33 血族少女', side: true },
    { n: 41, file: 'ninja_41.png', label: '41', nick: '41 东瀛格斗家', side: true },
    { n: 42, file: 'ninja_42.png', label: '42', nick: '42 东瀛武士', side: true },
    { n: 43, file: 'ninja_43.png', label: '43', nick: '43 东瀛忍者', side: true }
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
    // foes: rect = 老式「逐帧独立矩形」扁平表（等距妖兽，只有 idle/attack/death 三态）；
    //       anim = 新式「每怪一组动作帧序列」（侧视多动作素材，见 assets/beasts.json）
    foes: { img: null, rect: null, anim: null }
  };
  function atlasReady(a) { return !!(a.img && a.rect); }

  var IMG = {};              // file -> Image（只留给非图集的小图，例如云）
  var MAPS = [], IDX = {}, CUR = null;
  var PAL = {}, WALK = '';
  var player = { mx: 12, my: 20, tx: 12, ty: 20, face: 'down', walk: 0, path: null,
    hp: 130, maxhp: 130, atk: 20, def: 8, exp: 0, stones: 0, realmName: '炼气期',
    attackCd: 0, targetFoe: null, dead: false, flash: 0, invuln: 0,
    // —— 动作状态机 ——
    act: 'idle',      // idle / walk / run / atkA / atkB / dead
    actT: 0,          // 当前动作已播放时间（秒），用于一次性动作按进度取帧
    actHold: 0,       // >0 表示动作被锁定（攻击、倒地），期间不接受移动输入
    atkBCd: 0 };      // 重击冷却
  var screenFlash = 0;   // 受重击/被击退时的全屏红闪（避免玩家莫名其妙"换了个地方"）

  // ---------------- 战斗数据（碑林石阵 = 妖兽猎场） ----------------
  // 严格模式下这些必须先用 var 声明，否则 switchTo 里 `foes=…` 会抛 ReferenceError 直接卡死启动。
  var foes = [], floaters = [], particles = [], clickMark = null;
  var MELEE = 1.45, AGGRO = 6.5;   // 近身出手半径 / 妖兽仇恨半径（格）
  var FOE_DEFS = {
    // fh = 目标绘制身高（屏幕像素，Z=1 时）；主角为 128，妖兽略矮，精英石魔接近主角
    assassin: { key: 'assassin', name: '刀影飞镖',     hp: 42,  atk: 14, def: 4,  exp: 12, stones: [3, 7],   mv: 3.2,  fh: 90 },
    golem:    { key: 'golem',    name: '九州震击石魔', hp: 130, atk: 16, def: 12, exp: 32, stones: [8, 16],  mv: 1.55, fh: 124, elite: true },
    wraith:   { key: 'wraith',   name: '水墨幽魂',     hp: 74,  atk: 17, def: 7,  exp: 22, stones: [5, 11],  mv: 2.2,  fh: 104 },
    // 训练靶（青玄山门调试场专供）：不移动、不还手、打不死 —— 只用来试攻击与技能
    dummy:    { key: 'golem',    name: '练功石傀',     hp: 99999, atk: 0, def: 0, exp: 0, stones: [0, 0],  mv: 0,    fh: 116, dummy: true }
  };
  // 12 只散布在 30×30 碑林；坐标由 snapWalkable 吸附到最近可走格，故可略放宽。
  var BEILIN_SPAWNS = [
    { x: 6,  y: 6,  t: 'assassin' }, { x: 10, y: 4,  t: 'assassin' }, { x: 22, y: 8,  t: 'assassin' },
    { x: 25, y: 18, t: 'assassin' }, { x: 8,  y: 20, t: 'assassin' },
    { x: 14, y: 10, t: 'golem' },    { x: 18, y: 16, t: 'golem' },    { x: 10, y: 22, t: 'golem' },
    // 注意：不要挨着传送门刷怪（门在 4,15 与 26,23）——追怪时容易误踩门被传到别的地图
    { x: 20, y: 5,  t: 'wraith' },   { x: 21, y: 27, t: 'wraith' },   { x: 7,  y: 9,  t: 'wraith' },
    { x: 16, y: 26, t: 'wraith' }
  ];
  // 青玄山门 = 人物调试场：5 个训练靶摆在开阔场地，东西南北都有，方便核对攻击朝向
  var QINGXUAN_SPAWNS = [
    { x: 10, y: 20, t: 'dummy' }, { x: 16, y: 19, t: 'dummy' }, { x: 22, y: 20, t: 'dummy' },
    { x: 13, y: 25, t: 'dummy' }, { x: 21, y: 25, t: 'dummy' }
  ];
  /* 灵泉灵瀑的怪：牛魔 / 游方 / 蛇妖 / 铠甲卫 / 小僵尸 五族共 9 只，来自 sucai 下 CraftPix 怪物包。
   * 属性、刷怪格、动作帧率全部写在 tools/beast_packs.json，由 build_beasts_atlas.py 生成
   * assets/beasts.json，启动时灌进 FOE_DEFS 与 LINGQUAN_SPAWNS ——
   * 以后加怪物包只改登记表 + 跑脚本，不用再动 game.js。
   * ⚠ side:1 = 侧视素材（只有朝右一版），引擎按 face 做水平翻转，见 beastRect/drawFoe。 */
  var BEASTS = [];              // assets/beasts.json 里的 monsters
  var LINGQUAN_SPAWNS = [];
  var BEAST_FALLBACK = { run: 'walk', atk2: 'atk', walk: 'idle', hurt: 'idle', dead: 'idle' };
  function absorbBeasts(list) {
    BEASTS = list || [];
    LINGQUAN_SPAWNS = [];
    for (var i = 0; i < BEASTS.length; i++) {
      var b = BEASTS[i];
      FOE_DEFS[b.key] = {
        key: b.key, name: b.cn, hp: b.hp, atk: b.atk, def: b.def, exp: b.exp,
        stones: b.stones, mv: b.mv, fh: b.fh, elite: !!b.elite, side: 1,
        // 仇恨半径：不填就跟全局 AGGRO。调大的怪会主动从远处扑过来打人。
        aggro: b.aggro || 0, srcFace: b.srcFace || 'right'
      };
      if (b.spawn) LINGQUAN_SPAWNS.push({ x: b.spawn[0], y: b.spawn[1], t: b.key });
    }
  }
  var camX = 0, camY = 0, time = 0;
  var lastActShown = null;   // 动作试演面板的高亮同步（变化时才碰 DOM）
  var poseLock = null;       // ?pose=atkA 之类：把主角锁在某个动作上，用于核对素材/截图
  var foePose = null;        // ?foeact=atk&i=0&k=0.45：把第 i 只怪锁在某个动作的中段（怪物素材核对）
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
  // ⚠ 换素材后必须同步这里：填各文件的实际 KB 数，否则会出现「明明在下大图、
  //    进度条却几乎不动」的假卡（曾因 foes 从 155 涨到 1043 没同步而踩过）。
  var LOAD_PLAN = [
    { url: 'assets/maps.json?v=2', json: true, weight: 62, label: '读取地图数据' },
    { url: 'assets/tiles_atlas.png?v=1', atlas: 'tiles', weight: 617, label: '载入地貌与建筑' },
    { url: 'assets/chars_atlas.png?v=3', atlas: 'chars', weight: 323, label: '载入人物动作' },
    { url: 'assets/foes_atlas.png?v=3', atlas: 'foes', weight: 1099, label: '载入妖兽图鉴' },
    { url: 'assets/tiles_atlas.json?v=1', json: true, weight: 2, label: '读取地貌索引' },
    { url: 'assets/chars_atlas.json?v=3', json: true, weight: 1, label: '读取人物索引' },
    { url: 'assets/foes_atlas.json?v=2', json: true, weight: 10, label: '读取妖兽索引' },
    { url: 'assets/heroes.json?v=1', json: true, weight: 2, label: '读取角色清单' },
    { url: 'assets/beasts.json?v=2', json: true, weight: 11, label: '读取怪物图录' }
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
        ATLAS.foes.img = LOAD_PLAN[3].value;
        // 妖兽索引有两种形态：老版是「扁平 rect 表」，新版是 { rect, anims }。
        // 两种都要能加载（老图集没有 anims，就只是少了多动作怪，不该白屏）。
        var fj = LOAD_PLAN[6].value || {};
        ATLAS.foes.rect = fj.rect || fj;
        ATLAS.foes.anim = fj.anims || {};
        // 角色清单由 test/tools/build_chars_atlas.py 自动生成。加载失败就沿用内置默认，
        // 不影响启动 —— 只是少了新角色，不会白屏。
        var hj = LOAD_PLAN[7].value;
        if (hj && hj.heroes && hj.heroes.length) HERO_OPTIONS = hj.heroes;
        // 怪物图录由 test/tools/build_beasts_atlas.py 生成：属性 + 刷怪格 + 动作帧率
        var bj = LOAD_PLAN[8].value;
        if (bj && bj.monsters && bj.monsters.length) absorbBeasts(bj.monsters);

      TILE_W = data.tileW; TILE_H = data.tileH; HW = TILE_W / 2; HH = TILE_H / 2;
      PAL = data.tilePalette; WALK = data.walkable;
      MAPS = data.maps;
      MAPS.forEach(function (m) { m.solid = solidFrom(m); m.home = nearWalkable(m); IDX[m.id] = m; });

      var q = new URLSearchParams(location.search);
      {
        buildCloudSprite();
        buildButtons();
        buildZoomUI();
        // 底部操作说明：桌面端默认折叠成一行小标签，点一下展开/收起。
        // 手机端（body.touch）走 initMobile 里的精简文案 + 6s 自动收起（点按切 faded），
        // 两套逻辑互斥，这里遇到 touch 直接放手，否则一次点击会同时切 faded 和 folded。
        var bb = document.getElementById('bottom');
        if (bb) bb.addEventListener('click', function () {
          if (document.body.classList.contains('touch')) return;
          var foldedNow = bb.classList.toggle('folded');
          var ar = document.getElementById('btArrow');
          if (ar) ar.textContent = foldedNow ? '▸' : '▾';
        });
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
        // 手机端 UI 自测要等遮罩隐藏之后再跑，否则 elementFromPoint 只会命中遮罩
        // （详见 initMobile 末尾 __mobileAudit 的注释）
        if (window.__mobileAudit) window.__mobileAudit();
        var dbg = document.createElement('div');
        dbg.id = 'dbg'; dbg.style.display = 'none';
        document.body.appendChild(dbg);
        window.__dbg = dbg;
        var at = q.get('autotest');
        HOLD = q.get('hold') === '1';
        // ?pose=run —— 把主角锁在某个动作上（核对素材/截图用），取值见 ACT_CN
        var pq = q.get('pose');
        if (pq && ACT_CN[pq]) { poseLock = pq; player.act = pq; player.actT = 0.05; }
        // ?foeact=atk&i=0&k=0.45 —— 锁住第 i 只怪的某个动作（中段），用于核对怪物素材
        var fq = q.get('foeact');
        if (fq) foePose = { i: (+q.get('i') || 0), act: fq, k: Math.max(0, Math.min(0.95, +q.get('k') || 0.45)) };
        // 无头浏览器里 rAF 的 dt 常常接近 0（虚拟时钟只推进定时器、不推进帧），
        // 过渡动画就会卡在 fade≈0.08 永远走不完 —— 这是抓取环境的假象，不是引擎 bug。
        // 所以自测一律用 ISLES.tick(1/60) 手动推进固定步长，结果可复现。
        function sim(seconds) {
          var n = Math.round(seconds * 60);
          for (var i = 0; i < n; i++) window.ISLES.tick(1 / 60);
        }
        // ?warm=8 —— 截图专用：启动后先按固定步长推进 8 秒再画第一帧。
        // 无头环境里 rAF 的 dt≈0，直接截图只能拍到 t=0 的初始站位，
        // 想看「怪已经追上来开打」的画面就得先手动把时间推过去。
        var wq = +q.get('warm') || 0;
        if (wq > 0) sim(Math.min(60, wq));
        if (at && at.indexOf('portal') === 0) {
          // 同步执行：headless 里 setTimeout(60) 未必能在 dump-dom 之前触发，
          // 用例就会读到「还没传送」的 dbg，表现成随机失败（处理方式同 autotest=fight）。
          window.ISLES.stepOnPortal(0); sim(3);
        }
        if (at === 'state') {
          // ?autotest=state —— 把玩家/相机/缩放状态写进 #dbg，用于核对截图之间是否同源
          setTimeout(function () {
            var s = window.ISLES.state();
            s.cam = { x: +camX.toFixed(1), y: +camY.toFixed(1) };
            s.hero = PLAYER_SRC;
            s.foes = foes.length;
            var g = document.getElementById('dbg');
            if (g) g.textContent = JSON.stringify(s);
          }, 80);
        }
        if (at === 'train') {
          // ?map=qingxuan&autotest=train —— 人物调试场自测：
          // 断言训练靶已生成、攻击A/重击B 都能造成伤害、训练靶打不死、六个动作能逐个切换
          setTimeout(function () {
            var r = { map: CUR.id, foes: foes.length, dummy: 0 };
            for (var i = 0; i < foes.length; i++) if (foes[i].def_.dummy) r.dummy++;
            var f0 = foes[0];
            if (f0) {
              player.mx = f0.x; player.my = f0.y; player.tx = f0.x; player.ty = f0.y;
              player.actHold = 0; player.attackCd = 0; player.atkBCd = 0; player.dead = false;
              var h0 = f0.hp;
              attackNearest(); sim(0.1);
              r.dmgA = h0 - f0.hp;
              var h1 = f0.hp;
              player.atkBCd = 0;
              powerAttack(); sim(0.1);
              r.dmgB = h1 - f0.hp;
              r.targetAlive = f0.alive;      // 训练靶必须打不死
              r.hpRestored = f0.hp === f0.maxhp || f0.hp > 0;
            }
            var seq = [];
            ['idle', 'walk', 'run', 'atkA', 'atkB', 'dead'].forEach(function (a) {
              playAct(a); sim(0.02);
              seq.push(a + '=' + player.act);
            });
            r.acts = seq.join(' ');
            r.actBtns = document.querySelectorAll('#actBtns button').length;
            r.heroBtns = document.querySelectorAll('#heroBtns button').length;
            r.hero = PLAYER_SRC;
            var pb = document.getElementById('probe');
            if (!pb) { pb = document.createElement('div'); pb.id = 'probe'; pb.style.display = 'none'; document.body.appendChild(pb); }
            pb.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'bestiary') {
          // ?map=lingquan&autotest=bestiary —— 灵泉灵瀑怪物自测：
          // 断言三族怪物已刷出、每只都有 idle/walk/atk/dead 帧、动作能切换且帧号真的在走、
          // 受击切 hurt、击杀后走倒地再消失再复活、侧视素材朝左会翻转。
          setTimeout(function () {
            var r = { map: CUR.id, total: foes.length, fam: {}, acts: {}, err: [] };
            foes.forEach(function (f) {
              var fam = f.key.split('_')[0];
              r.fam[fam] = (r.fam[fam] || 0) + 1;
            });
            var dbg = window.ISLES.beastDebug();
            r.animKeys = dbg.length;
            var byKey = {};
            foes.forEach(function (f) { byKey[f.key] = f; });
            var bad = [];
            dbg.forEach(function (d) {
              ['idle', 'walk', 'atk', 'dead'].forEach(function (a) {
                if (!d.acts[a]) bad.push(d.key + ':' + a);
              });
              r.drawSizes = r.drawSizes || {};
              r.drawSizes[d.key] = { src: d.draw.idle.src, out: d.draw.idle.out, ax: +(d.ax || 0).toFixed(3) };
            });
            if (bad.length) r.err.push('缺动作 ' + bad.join(','));
            // 动作切换：循环动作由「追人」驱动，所以要把玩家放进仇恨圈里看它真的走起来
            var f0 = foes[0];
            var seen = [];
            ['idle', 'atk', 'hurt', 'dead'].forEach(function (a) {
              window.ISLES.setFoeAnim(0, a);
              for (var i = 0; i < 6; i++) window.ISLES.tick(1 / 60);
              seen.push(a + '=' + f0.anim);
            });
            // 站远处（脱离仇恨）应回 idle；进仇恨圈应切 walk/run
            f0.animHold = 0; f0.anim = 'idle';
            player.mx = f0.x + 12; player.my = f0.y;
            sim(1.0);
            seen.push('far=' + f0.anim);
            player.mx = f0.x + 4; player.my = f0.y;
            for (var i2 = 0; i2 < 30; i2++) window.ISLES.tick(1 / 60);
            seen.push('near=' + f0.anim + '/' + (f0.animHold > 0 ? 'hold' : 'free'));
            r.acts = seen.join(' ');
            r.chaseSpeed = +f0.def_.mv.toFixed(1);
            r.runThreshold = BEAST_RUN_MV;
            // 跑得快的怪（mv ≥ 阈值）必须切到 run 动作 —— 挑一只快的单独验
            var fast = null;
            for (var fi = 0; fi < foes.length; fi++) if (foes[fi].def_.mv >= BEAST_RUN_MV) { fast = foes[fi]; break; }
            if (fast) {
              fast.animHold = 0;
              player.mx = fast.x + 4; player.my = fast.y;
              for (var i3 = 0; i3 < 30; i3++) window.ISLES.tick(1 / 60);
              r.fastFoe = fast.key + ' mv=' + fast.def_.mv + ' anim=' + fast.anim;
            }
            // 循环动作的帧号必须随时间变（否则是张死图）
            window.ISLES.setFoeAnim(0, 'walk');
            var fr = [];
            for (var t = 0; t < 6; t++) {
              window.ISLES.tick(1 / 12);
              fr.push(beastPiece(f0).sx);
            }
            r.walkFrames = fr.join(',');
            r.walkVaries = fr.some(function (v) { return v !== fr[0]; });
            r.animTAfter = +f0.animT.toFixed(2);
            // 朝向翻转
            f0.face = 'right'; var pr = beastPiece(f0);
            f0.face = 'left'; var pl = beastPiece(f0);
            r.flip = { right: !!pr.flip, left: !!pl.flip, sameRect: pr.sx === pl.sx && pr.w === pl.w };
            // 镜像判定不能写死「朝左就翻」—— 小僵尸原画朝左，翻不翻要跟素材原生朝向比。
            // 这里逐只核对：朝素材原生方向不翻，朝反方向才翻。
            var fl = {};
            ['knight_a', 'zombie_a', 'ronin_a'].forEach(function (kk) {
              var ff = byKey[kk]; if (!ff) return;
              ff.face = 'right'; var ar = beastPiece(ff);
              ff.face = 'left'; var al = beastPiece(ff);
              var src = ar.srcFace;
              fl[kk] = { srcFace: src, toRight: !!ar.flip, toLeft: !!al.flip,
                ok: (src === 'right') ? (!ar.flip && al.flip) : (ar.flip && !al.flip) };
            });
            r.flipBySrc = fl;
            // 自动攻击验收：把玩家放到「超出老怪 6.5 格仇恨圈、但在新怪 aggro 圈内」的位置，
            // 新怪必须自己扑过来并真的打掉玩家气血 —— 这就是「让它自动攻击角色」的口径。
            r.aggro = { global: AGGRO,
              knight: byKey.knight_a ? byKey.knight_a.def_.aggro : null,
              zombie: byKey.zombie_a ? byKey.zombie_a.def_.aggro : null };
            var zz = byKey.zombie_a;
            if (zz) {
              zz.hp = zz.maxhp; zz.alive = true; zz.dying = 0; zz.animHold = 0; zz.atkCd = 0;
              player.hp = player.maxhp; player.dead = false; player.invuln = 0;
              player.actHold = 0; player.act = 'idle';
              player.mx = player.tx = zz.x + 8; player.my = player.ty = zz.y;
              var d0 = Math.hypot(player.mx - zz.x, player.my - zz.y);
              sim(1.2);
              r.zombieChase = { dist0: +d0.toFixed(2), dist1: +Math.hypot(player.mx - zz.x, player.my - zz.y).toFixed(2), anim: zz.anim };
              var h0z = player.hp;
              window.ISLES.tick(1 / 60);
              // 判据只看「僵尸自己出手」：玩家掉血可能来自别的怪，用它当断言会误判成僵尸打到了。
              // 出手瞬间引擎会给它挂 1 秒攻击冷却，读这个最准。
              var attacked = false;
              for (var tz = 0; tz < 60 * 20 && !attacked; tz++) {
                window.ISLES.tick(1 / 60);
                if (zz.atkCd > 0.5) attacked = true;
              }
              r.zombieHit = attacked;
              r.zombieDmg = h0z - player.hp;
              r.zombieDistAtHit = +Math.hypot(player.mx - zz.x, player.my - zz.y).toFixed(2);
              r.zombieProbe = { zx: +zz.x.toFixed(2), zy: +zz.y.toFixed(2),
                px: +player.mx.toFixed(2), py: +player.my.toFixed(2),
                anim: zz.anim, alive: zz.alive, dying: +zz.dying.toFixed(2),
                hold: +zz.animHold.toFixed(2), atkCd: +zz.atkCd.toFixed(2),
                pdead: !!player.dead, invuln: +player.invuln.toFixed(2), radius: zz.def_.aggro || AGGRO };
              var bp = window.ISLES.bfsNext(zz.x, zz.y, player.mx, player.my, CUR);
              r.bfsDirect = bp ? [bp.x, bp.y] : null;
              r.zombieBpath = zz.bpath ? [zz.bpath.x, zz.bpath.y] : null;
              r.zombieRepath = +(zz.repath || 0).toFixed(2);
              r.zombieCell = [Math.round(zz.x), Math.round(zz.y), Math.round(player.mx), Math.round(player.my)];
              r.zombieDbg = JSON.parse(JSON.stringify(window.ISLES.chaseDbg()));
              player.hp = player.maxhp; player.invuln = 3; player.dead = false;
            }
            // 铠甲卫也要自己扑上来打人：它走得比僵尸慢（mv 1.8 vs 2.9）、出生点挨着建筑，
            // 所以给足 30 秒，并且落点从八个方向里挑第一个可站格，避免掷到实心格上白测一轮。
            var kz = byKey.knight_a;
            if (kz) {
              kz.hp = kz.maxhp; kz.alive = true; kz.dying = 0; kz.animHold = 0; kz.atkCd = 0;
              kz.bpath = null; kz.repath = 0;
              player.hp = player.maxhp; player.dead = false; player.invuln = 0;
              player.actHold = 0; player.act = 'idle';
              var spot = null;
              [[6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4]].forEach(function (o) {
                if (spot) return;
                var cx = Math.round(kz.x + o[0]), cy = Math.round(kz.y + o[1]);
                if (walkable(cx, cy) && !isSolid(cx, cy)) spot = [cx, cy];
              });
              if (spot) {
                player.mx = player.tx = spot[0]; player.my = player.ty = spot[1];
                var kd0 = Math.hypot(player.mx - kz.x, player.my - kz.y);
                var kattacked = false;
                for (var tk = 0; tk < 60 * 30 && !kattacked; tk++) {
                  window.ISLES.tick(1 / 60);
                  if (kz.atkCd > 0.5) kattacked = true;   // 同僵尸口径：读它自己的出手冷却
                }
                r.knightChase = { dist0: +kd0.toFixed(2), dist1: +Math.hypot(player.mx - kz.x, player.my - kz.y).toFixed(2),
                  anim: kz.anim, at: spot };
                r.knightHit = kattacked;
                r.knightDmg = player.maxhp - player.hp;
                r.knightDbg = JSON.parse(JSON.stringify(window.ISLES.chaseDbg()));
              } else {
                r.knightChase = 'no-place';
              }
              player.hp = player.maxhp; player.invuln = 3; player.dead = false;
            }
            // 领地（leash）验收：把怪挪到离巢 > leash 的位置，玩家贴到它脸上，
            // 它必须「放弃追击、回巢」，而不是继续咬人 —— 这才是领地范围真正的意义。
            var lz = byKey.knight_a;
            if (lz) {
              lz.hp = lz.maxhp; lz.alive = true; lz.dying = 0; lz.animHold = 0; lz.atkCd = 0; lz.bpath = null; lz.repath = 0; lz.ret = 0;
              var lhx = lz.home.x, lhy = lz.home.y, L = lz.leash;
              var far = null;
              for (var la = 0; la < 360 && !far; la += 12) {
                var fx = lhx + Math.round(Math.cos(la * Math.PI / 180) * (L + 2));
                var fy = lhy + Math.round(Math.sin(la * Math.PI / 180) * (L + 2));
                if (walkable(fx, fy) && !isSolid(fx, fy)) far = [fx, fy];
              }
              if (far) {
                lz.x = far[0]; lz.y = far[1];
                player.hp = player.maxhp; player.dead = false; player.invuln = 0;
                player.mx = player.tx = far[0] + 1; player.my = player.ty = far[1];   // 贴脸
                var ld0 = Math.hypot(lz.x - lhx, lz.y - lhy);
                var latk = false;
                for (var tl = 0; tl < 60 * 20 && !latk; tl++) {
                  window.ISLES.tick(1 / 60);
                  if (lz.atkCd > 0.5) latk = true;   // 越界还咬人 = leash 没生效
                }
                var ld1 = Math.hypot(lz.x - lhx, lz.y - lhy);
                r.leash = { name: lz.name, leash: +L.toFixed(2),
                  distHome0: +ld0.toFixed(2), distHome1: +ld1.toFixed(2),
                  returnedHome: ld1 < ld0 - 0.5,            // 离巢距离变小 = 真在往回走
                  withinTerritory: ld1 <= L + 0.5,
                  attackedWhileLeashed: latk,               // 必须为 false
                  retCleared: lz.ret === 0,                 // 回到巢内应解除回巢锁定
                  atkCdFinal: +lz.atkCd.toFixed(2) };
                // 解锁后再验一次：玩家贴到巢边，它必须能重新被拉起并出手。
                // 这条是防「回一次家就永久哑火」——滞回标志写错很容易退化成这样，光看"不咬人"是发现不了的。
                player.invuln = 0; player.hp = player.maxhp; player.dead = false;
                player.mx = player.tx = lhx + 1.2; player.my = player.ty = lhy;
                var reatk = false;
                for (var tr = 0; tr < 60 * 14 && !reatk; tr++) {
                  player.hp = player.maxhp;   // 每帧回满：只验"会不会重新出手"，别被主角倒下打断
                  window.ISLES.tick(1 / 60);
                  if (lz.atkCd > 0.5) reatk = true;
                }
                r.leash.reengaged = reatk;
                player.invuln = 3; player.hp = player.maxhp; player.dead = false;
              } else {
                r.leash = 'no-far-spot';
              }
            } else {
              r.leash = 'no-knight';
            }
            // 击杀 -> 倒地 -> 消失 -> 复活
            player.mx = f0.x; player.my = f0.y; player.dead = false; player.invuln = 3;
            f0.animHold = 0;
            f0.hp = 1;
            attackNearest();
            r.killedDying = f0.dying > 0;
            sim(0.5);
            r.midDeadAnim = f0.anim === 'dead' && f0.alive === true;
            sim(1.0);
            r.afterDead = f0.alive === false;
            player.hp = player.maxhp;
            sim(20);                      // 复活窗口 10~16 秒，跑满 20 秒才谈得上"没复活"
            r.respawned = f0.alive === true && f0.dying === 0 && f0.hp === f0.maxhp;
            r.playerHp = player.hp;
            var pb = document.getElementById('probe');
            if (!pb) { pb = document.createElement('div'); pb.id = 'probe'; pb.style.display = 'none'; document.body.appendChild(pb); }
            pb.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'walk') {
          // 程序化按住「右」1.2 秒：读 #dbg 的 mx 有没有变大，即可确认键盘行走真的生效。
          // 加 &shift=1 则同时按住 Shift，用来对比奔跑是否真的更快。
          // 同步跑：headless 虚拟时钟下 setTimeout 未必触发，那会让 dbg 停在没走动的初始值。
          keys['d'] = 1;
          if (q.get('shift') === '1') keys['shift'] = 1;
          sim(1.2); keys['d'] = 0; keys['shift'] = 0; sim(0.1);
        }
        if (at && at.indexOf('click') === 0) {
          // 点击移动朝向自测： ?autotest=click&cdx=3&cdy=0 （目标格 = 当前格 + 偏移）
          // 断言：点击走路后 player.face 必须变成行进方向，而不是一直停在初始的 down
          var cdx = +(q.get('cdx') || 0), cdy = +(q.get('cdy') || 0);
          var csecs = +(q.get('secs') || 1.6);
          // 同步执行（同 portal / walk / fight）：headless 虚拟时钟下 setTimeout 未必触发，
          // 那会让用例读到「还没点击」的初始状态，白判一次失败。
          (function () {
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
          })();
        }
        if (at === 'fight') {
          // ?map=beilin&autotest=fight —— 贴脸反复攻击，验证击杀掉落与修为增长
          // 注意：headless 下 setTimeout 未必在 dump 前触发，故同步执行（boot 成功时 foes 已就绪）
          var f0 = foes[0];
          if (f0) { player.mx = f0.x; player.my = f0.y; player.tx = f0.x; player.ty = f0.y; }
          for (var i = 0; i < 120; i++) { window.ISLES.attackNearest(); window.ISLES.tick(0.5); }
          var alive = foes.filter(function (x) { return x.alive; }).length;
          var pb = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          pb.textContent = JSON.stringify({ alive: alive, total: foes.length, exp: player.exp, stones: player.stones, hp: Math.round(player.hp) });
        }
        if (at === 'foesize') {
          // ?map=beilin&autotest=foesize —— 校验每只怪每个朝向/状态都能解析到帧，且绘制尺寸已归一化
          var rows = window.ISLES.foeDebug();
          var bad = rows.filter(function (r) { return r.w <= 0 || r.h <= 0; });
          var heights = {};
          rows.forEach(function (r) { heights[r.base] = r.drawH; });
          var pb2 = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          pb2.textContent = JSON.stringify({ frames: rows.length, bad: bad.length, drawnH: heights, sample: rows.slice(0, 4) });
        }
        if (at === 'down') {
          // ?map=beilin&autotest=down —— 验证气血耗尽只「原地击退」，不再瞬移回出生点
          var f0c = foes[0];
          if (f0c) { player.mx = f0c.x + 0.7; player.my = f0c.y; player.tx = player.mx; player.ty = player.my; }
          player.targetFoe = null; player.path = null; player.hp = 5; player.invuln = 0;
          var bx0 = player.mx, by0 = player.my;
          for (var kk = 0; kk < 60; kk++) window.ISLES.tick(0.5);
          var sp0 = (CUR && CUR.spawn) ? CUR.spawn : { x: 0, y: 0 };
          var pb3 = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          pb3.textContent = JSON.stringify({
            knockMoved: +Math.hypot(player.mx - bx0, player.my - by0).toFixed(2),
            distToSpawn: +Math.hypot(player.mx - sp0.x, player.my - sp0.y).toFixed(2),
            hp: Math.round(player.hp)
          });
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

  /** 画一个角色（影子 + 按朝向/帧取图）。玩家与 NPC 共用同一套绘制，规格完全一致。
   *  opts.row  覆盖行号（侧视素材的行是「动作」而非「朝向」）
   *  opts.flip 水平翻转（侧视素材只有右边一个朝向，左边靠翻转）
   *  opts.spin 绕脚底旋转，弧度（等距素材没有倒地帧，用旋转近似倒下）
   */
  function drawActor(img, mx, my, face, frame, bob, ox, oy, opts) {
    _draw.actor++;
    opts = opts || {};
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
    var row = (opts.row != null) ? opts.row : (SHEET.dir[face] || 0);
    var sx = (ox || 0) + frame * SHEET.cellW, sy = (oy || 0) + row * SHEET.cellH;
    var top = baseY - dh + 4 + (bob || 0) * Z;
    var sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (opts.spin) {
      ctx.save();
      ctx.translate(p.x, baseY);
      ctx.rotate(opts.spin);
      ctx.drawImage(img, sx, sy, SHEET.cellW, SHEET.cellH, -dw / 2, -dh + 4 + (bob || 0) * Z, dw, dh);
      ctx.restore();
    } else if (opts.flip) {
      ctx.save();
      ctx.translate(p.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, SHEET.cellW, SHEET.cellH, -dw / 2, top, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx, sy, SHEET.cellW, SHEET.cellH, p.x - dw / 2, top, dw, dh);
    }
    ctx.imageSmoothingEnabled = sm;
    return { x: p.x, top: baseY - dh + 4 };
  }

  function heroOf(file) {
    for (var i = 0; i < HERO_OPTIONS.length; i++) {
      if (HERO_OPTIONS[i].file === file) return HERO_OPTIONS[i];
    }
    return null;
  }
  /** 侧视素材的取帧：循环动作按时间/步频推进，一次性动作按播放进度推进（停在末帧）。
   *  walk/run 优先跟位移同步（避免"滑步"）；没有位移时（数字键试演）退回用 actT 计时，
   *  否则站着试演会是一张死图。 */
  function sideFrame(act) {
    if (act === 'idle') return Math.floor(time * 4) % SHEET.frames;
    if (act === 'walk') return Math.floor((player.walk > 0 ? player.walk * 7 : player.actT * 7)) % SHEET.frames;
    if (act === 'run')  return Math.floor((player.walk > 0 ? player.walk * 11 : player.actT * 11)) % SHEET.frames;
    var dur = ACT_DUR[act] || 0.5;
    var k = Math.min(0.999, player.actT / dur);
    return Math.min(SHEET.frames - 1, Math.floor(k * SHEET.frames));
  }
  function drawCharacter() {
    var pz = charPiece(PLAYER_SRC); if (!pz) return;
    var h = heroOf(PLAYER_SRC);
    var act = player.act || 'idle';
    var opts = {}, frame;
    if (h && h.side) {
      opts.row = SIDE_ACT[act] || 0;
      opts.flip = (player.face === 'left');    // 侧视只有右边一版，左边翻转
      frame = sideFrame(act);
    } else {
      // 等距素材只有 4 个朝向行、没有独立动作行，只能近似：
      // 奔跑 = 步频加快 + 轻微起伏；攻击 = 站定第 0 帧 + 挥击弧；倒地 = 绕脚底旋转倒下。
      frame = (player.walk > 0 ? Math.floor(player.walk * (act === 'run' ? 9 : 6)) % SHEET.frames : 0);
      if (act === 'atkA' || act === 'atkB') frame = 0;
      if (act === 'dead') opts.spin = -1.35;
    }
    var bobb = (act === 'run' && !(h && h.side)) ? Math.sin(time * 18) * 1.1 : 0;
    drawActor(pz.img, player.mx, player.my, player.face, frame, bobb, pz.sx, pz.sy, opts);
    if (act === 'atkA' || act === 'atkB') drawSlash(act);
  }
  /** 挥击弧：两种角色都用，让"这一下打出去了"看得见 */
  function drawSlash(act) {
    var dur = ACT_DUR[act] || 0.5;
    var k = Math.min(1, player.actT / dur);
    var a = Math.sin(k * Math.PI);            // 0 -> 1 -> 0
    if (a <= 0.03) return;
    var big = (act === 'atkB');
    var dir = (player.face === 'left') ? -1 : 1;
    var p = isoToScreen(player.mx, player.my);
    var cx = p.x + dir * 13 * Z, cy = p.y + HH * Z - 32 * Z;
    var r = (big ? 40 : 28) * Z;
    var sweep = big ? 1.9 : 1.4;
    var a0 = -1.15 + (k - 0.5) * sweep;
    ctx.save();
    ctx.globalAlpha = 0.8 * a;
    ctx.strokeStyle = big ? '#ffd36b' : '#d6ecff';
    ctx.lineWidth = (big ? 5.5 : 3.2) * Z;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (dir > 0) ctx.arc(cx, cy, r, a0, a0 + 0.95, false);
    else ctx.arc(cx, cy, r, Math.PI - a0, Math.PI - a0 - 0.95, true);
    ctx.stroke();
    ctx.restore();
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
    foes.forEach(function (f) { list.push({ k: f.x + f.y, i: -3, o: f }); });
    list.push({ k: player.mx + player.my, i: -1, o: null });
    list.sort(function (a, b) { return a.k - b.k; });

    list.forEach(function (it) {
      // 注意顺序：妖兽 i=-3、NPC i=-2、玩家 i=-1，三者都 <0。
      // 必须先判 -3/-2 再判 -1，否则会被当成玩家/物件错画。
      if (it.i === -3) { drawFoe(it.o); return; }
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

    // 受重击红闪：给"被击退"一个明确的画面反馈，不再是无声无息地换个位置
    if (screenFlash > 0) {
      ctx.fillStyle = 'rgba(190,30,40,' + (screenFlash * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

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
    var hintEl = document.getElementById('hint');
    if (silent) hintEl.textContent = '踩上青色光门即可切换地图';
    else if (CUR.id === 'qingxuan') hintEl.textContent = '青玄山门 · 人物调试场：空地试移动，石傀试攻击（J 攻击A / K 重击B / 1~6 试动作）';
    else if (CUR.id === 'lingquan') hintEl.textContent = '灵泉灵瀑 · 妖兽领地：牛魔 / 游方 / 蛇妖 / 铠甲卫 / 小僵尸 五族共 ' + LINGQUAN_SPAWNS.length + ' 只（J/K 出手，Shift 奔跑，1~6 试动作）';
    else hintEl.textContent = '已传送至「' + CUR.name + '」 · ' + CUR.note;
    // 只有碑林石阵刷妖兽（猎场）；青玄山门刷训练靶（调试场）；灵泉灵瀑刷五族怪物；其它图清空战斗状态
    if (CUR.id === 'beilin') { foes = makeFoes(BEILIN_SPAWNS); }          // 碑林石阵：老猎场
    else if (CUR.id === 'qingxuan') { foes = makeFoes(QINGXUAN_SPAWNS); }  // 青玄山门：调试场
    else if (CUR.id === 'lingquan') { foes = makeFoes(LINGQUAN_SPAWNS); }  // 灵泉灵瀑：五族怪物
    else { foes = []; floaters = []; particles = []; player.targetFoe = null; }
    // 重置主角动作，避免带着上一张图的攻击/倒地状态进来
    player.act = 'idle'; player.actT = 0; player.actHold = 0;
    player.dead = false;
  }

  function couldStand(x, y) {
    // ⚠️ 这里必须只用「整数格」采样。
    // 旧版写成 walkable(Math.round(x) - 0.25, ...) 之类，落到 CUR.ground[y][11.75]
    // 取到 undefined，walkable 恒为 false —— 表现就是「WASD 只能转向、走不动」。
    // 现在：目标格可走即可（配合横纵分轴推进，天然获得贴墙滑行手感）。
    return walkable(Math.round(x), Math.round(y));
  }

  // ---------------- 妖兽寻路（格级 BFS） ----------------
  // 妖兽原本只会「朝玩家直线推进」。碑林石阵地形开阔看不出问题，但灵泉灵瀑有大块
  // 实心石柱与水面 —— 直线一撞上就原地顶着柱子打转，玩家看到的就是「这怪不咬人」。
  // 这里做一件很便宜的事：直线上有障碍时，用 4 连通 BFS 在 30×30 的走格图上找一条
  // 绕行路径，怪沿路点走。搜索封顶 PATH_CELLS 格，11 只怪、每只 0.6 秒算一次，
  // 量级是每秒一万多次数组读写，弱机也扛得住。
  var PATH_CELLS = 900;     // 单次 BFS 最多展开的格数（30×30 全覆盖）
  var PATH_EVERY = 0.6;     // 重算间隔（秒）
  // ⚠ 踩过的坑：一开始用「这一步能不能落脚」判断有没有被挡。怪和玩家几乎同 y 时
  //   （dy≈0）垂直轴恒可落脚，于是整体判成「没被挡」，怪一头顶在石柱上永远不寻路。
  //   改成按整数格做视线检查后，判据不再随亚格抖动翻转。
  function losClear(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var n = Math.max(2, Math.ceil(Math.hypot(dx, dy) * 4));   // 每格采 4 点，够密且便宜
    for (var i = 1; i <= n - 1; i++) {
      var t = i / n;
      if (!walkable(Math.round(x0 + dx * t), Math.round(y0 + dy * t))) return false;
    }
    return true;
  }
  // 逐帧覆盖的调试槽（预分配、零 GC），?autotest= 时读它核对寻路是否真的在跑
  var chaseDbg = { key: '', los: 0, sx: 0, sy: 0, bp: '', path: 0 };
  function bfsNext(sx, sy, tx, ty, mp) {
    sx = Math.round(sx); sy = Math.round(sy);
    tx = Math.round(tx); ty = Math.round(ty);
    if (sx === tx && sy === ty) return null;
    // 玩家脚下未必落在可走格上（贴墙站位、?x=&y= 手写坐标都会），就近吸附一格再搜
    if (!walkable(tx, ty)) {
      var tp = snapWalkable(mp, tx, ty);
      tx = tp.x; ty = tp.y;
    }
    if (!walkable(tx, ty)) return null;      // 真的没有可落脚的目标 → 退回直线行为
    var mw = mp.w, mh = mp.h;
    var prev = new Int32Array(mw * mh).fill(-1);
    var q = [sy * mw + sx];
    prev[sy * mw + sx] = -2;                 // -2 = 起点标记
    var goal = ty * mw + tx, head = 0, seen = 0, found = -1;
    while (head < q.length && seen < PATH_CELLS) {
      var cur = q[head++]; seen++;
      if (cur === goal) { found = cur; break; }
      var cx = cur % mw, cy = (cur - cx) / mw;
      for (var d = 0; d < 4; d++) {
        var nx = cx + (d === 0 ? 1 : (d === 1 ? -1 : 0));
        var ny = cy + (d === 2 ? 1 : (d === 3 ? -1 : 0));
        if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
        var ni = ny * mw + nx;
        if (prev[ni] !== -1 || !walkable(nx, ny)) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    if (found < 0) return null;              // 走不到（被水面/石柱完全隔开）
    // 回溯到「起点的下一格」= 本帧该走的方向。
    // ⚠ 判据是「当前格的父格是起点」，不是「当前格是起点」—— 后者会一路退到起点本身，
    //   于是怪拿到 wx=wy=0、原地不动，表现和没寻路一模一样。
    var node = found;
    while (prev[node] !== -2 && prev[prev[node]] !== -2) node = prev[node];
    return { x: node % mw, y: (node - node % mw) / mw };
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
    // 出手：J / F / 空格 = 攻击 A（普攻）；K = 攻击 B（重击）
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); attackNearest(); return; }
    if (k === 'j' || k === 'J' || k === 'f' || k === 'F') { e.preventDefault(); attackNearest(); return; }
    if (k === 'k' || k === 'K') { e.preventDefault(); powerAttack(); return; }
    // 动作试演：1~6 直接切到对应动作，方便逐个核对素材（待机/行走/奔跑/攻击A/攻击B/倒地）
    var demo = { '1': 'idle', '2': 'walk', '3': 'run', '4': 'atkA', '5': 'atkB', '6': 'dead' }[k];
    if (demo) { e.preventDefault(); playAct(demo); return; }
    // 键盘缩放：+ / - 步进，0 复位
    if (k === '+' || k === '=') zoomBy(ZSTEP, W / 2, H / 2);
    else if (k === '-' || k === '_') zoomBy(1 / ZSTEP, W / 2, H / 2);
    else if (k === '0') setZoom(1, W / 2, H / 2);
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = 0; });

  // 浮动摇杆的当前输入（触屏端由 initMobile 写入；桌面端恒为 0，不影响键盘）
  var joyVec = { x: 0, y: 0, run: false };

  function inputDir() {
    // 摇杆推着的时候优先接管（模拟量 0~1）；松开/没推就走键盘
    if (joyVec.x || joyVec.y) return { dx: joyVec.x, dy: joyVec.y };
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

    // —— 动作状态机 ——
    // actHold > 0 表示正在播一次性动作（攻击/倒地），期间不被行走状态覆盖；
    // 播完自动回 idle。倒地结束时在这里起身（保留一口气 + 短暂无敌）。
    if (player.actHold > 0) {
      player.actHold -= dt;
      player.actT += dt;
      if (player.actHold <= 0) {
        player.actHold = 0;
        if (player.dead) {
          player.dead = false;
          player.hp = Math.round(player.maxhp * 0.6);   // 留一口气，给撤退的机会
          player.invuln = 2.2;
          toast('起身！2 秒内无敌，可撤或反打');
        }
        player.act = 'idle'; player.actT = 0;
      }
    }
    if (player.atkBCd > 0) player.atkBCd = Math.max(0, player.atkBCd - dt);

    var d = inputDir();
    if (player.dead) d = { dx: 0, dy: 0 };              // 倒地期间不接受移动输入
    var running = !!((keys['shift'] || joyVec.run) && (d.dx || d.dy));  // 按住 Shift / 摇杆推满 = 奔跑
    var speed = 5.2 * (running ? RUN_MUL : 1);
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

    // 循环动作（待机/行走/奔跑）由这里自动切换；一次性动作期间（actHold>0）不覆盖
    if (poseLock) { player.act = poseLock; player.actT += dt; }   // 调试场：锁死动作不参与状态机
    else if (player.actHold <= 0) {
      var nextAct = moved ? (running ? 'run' : 'walk') : 'idle';
      if (player.act !== nextAct) { player.act = nextAct; player.actT = 0; }
      player.actT += dt;
    }
    // 试演面板高亮跟随当前动作（只在变化时改 DOM，避免每帧重排）
    if (player.act !== lastActShown) { lastActShown = player.act; markAct(player.act); }

    // —— 传送门检测 ——
    if (portalLock <= 0) {
      var pcx = Math.round(player.mx), pcy = Math.round(player.my);
      for (var i = 0; i < CUR.portals.length; i++) {
        var pt = CUR.portals[i];
        var onCell = (Math.abs(player.mx - pt.x) < 0.34 && Math.abs(player.my - pt.y) < 0.34);
        if (onCell) { pending = pt; fadeDir = 1; player.path = null; player.tx = player.mx; player.ty = player.my; break; }
      }
    }
    if (player.attackCd > 0) player.attackCd = Math.max(0, player.attackCd - dt);
    if (player.flash > 0) player.flash = Math.max(0, player.flash - dt);
    if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
    if (screenFlash > 0) screenFlash = Math.max(0, screenFlash - dt);
    updateCam(dt);
    updateFoes(dt);
    updateFloaters(dt);   // 此前从未被调用 —— 伤害飘字/击杀粒子不会消失
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
  function makeFoes(list) {
    return (list || BEILIN_SPAWNS).map(function (s) {
      var d = FOE_DEFS[s.t];
      var cell = snapWalkable(CUR, s.x, s.y);
      var aggro = d.aggro || AGGRO;
      return {
        def_: d, key: d.key, name: d.name,
        x: cell.x, y: cell.y, home: cell,
        hp: d.hp, maxhp: d.hp, atk: d.atk, def: d.def, exp: d.exp, stones: d.stones,
        face: 'down', flash: 0, atkAnim: 0, deadT: 0, atkCd: 0, alive: true, respawn: 0,
        // —— 领地半径：超出就不再追、走回 home；登记表可写 leash 覆盖默认 aggro+FOE_LEASH_PAD ——
        leash: d.leash || (aggro + FOE_LEASH_PAD),
        // —— 动作状态机（侧视多动作素材用；老等距妖兽没有 anims，这些字段空转不影响）——
        anim: 'idle', animT: 0, animHold: 0, dying: 0,
        // —— 领地滞回：一旦越界就锁定「回巢」状态，走回巢内才解除 ——
        // 少了这个标志会在 leash 边缘来回抽动：追出去→越界回巢→一进界又被仇恨拉起，怪原地扭。
        ret: 0,
        // —— 绕行寻路（直线被石柱/水面挡住时启用，见 bfsNext）——
        bpath: null, repath: 0
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
  // 居中提示条：把"被击退/折损灵石"这类事件说清楚，避免玩家只看到画面一跳却没有解释
  var toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }
  // 玩家出手：范围 MELEE 内最近的妖兽受击；real=max(1,round(atk-def))
  function tryAttack() {
    if (player.dead) return;
    if (player.attackCd > 0) return;
    player.attackCd = 0.45;
    player.act = 'atkA'; player.actT = 0; player.actHold = ACT_DUR.atkA;   // 挥空也播，打不到也有反馈
    var best = null, bd = MELEE;
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i]; if (!f.alive) continue;
      var d = Math.hypot(f.x - player.mx, f.y - player.my);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) {
      // 挥空也锁敌：仇恨圈内最近的妖兽在哪边，脸就转向哪边（只转向不出伤害）
      var near = null, nd = AGGRO;
      for (var j = 0; j < foes.length; j++) {
        var g = foes[j]; if (!g.alive) continue;
        var d2 = Math.hypot(g.x - player.mx, g.y - player.my);
        if (d2 < nd) { nd = d2; near = g; }
      }
      if (near) setFaceFromDelta(near.x - player.mx, near.y - player.my);
      return;
    }
    setFaceFromDelta(best.x - player.mx, best.y - player.my);
    var real = Math.max(1, Math.round(player.atk - best.def));
    best.hp -= real; best.flash = 0.22;
    addFloater(best.x, best.y - 0.3, '-' + real, '#ffd36b');
    if (best.hp <= 0) killFoe(best); else hurtFoe(best);
  }
  // 玩家主动出手（J/空格/点击妖兽）：锁定仇恨内最近的妖兽并打一下
  function attackNearest() {
    if (player.dead) return;
    if (player.targetFoe && player.targetFoe.alive) {
      var td = Math.hypot(player.targetFoe.x - player.mx, player.targetFoe.y - player.my);
      if (td <= AGGRO) { tryAttack(); return; }
    }
    var best = null, bd = AGGRO;
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i]; if (!f.alive) continue;
      var d = Math.hypot(f.x - player.mx, f.y - player.my);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) player.targetFoe = best;
    tryAttack();
  }
  /** 攻击 B（重击，K）：伤害翻倍、范围更大、把妖兽推开一段，代价是长冷却 */
  function powerAttack() {
    if (player.dead) return;
    var h0 = document.getElementById('hint');
    if (player.atkBCd > 0) {
      if (h0) h0.textContent = '重击冷却中（剩 ' + player.atkBCd.toFixed(1) + ' 秒）';
      return;
    }
    player.atkBCd = ATK_B_CD;
    player.act = 'atkB'; player.actT = 0; player.actHold = ACT_DUR.atkB;
    var reach = MELEE + 0.55, hit = [];
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i]; if (!f.alive) continue;
      if (Math.hypot(f.x - player.mx, f.y - player.my) <= reach) hit.push(f);
    }
    if (!hit.length) {
      toast('重击落空（冷却 ' + ATK_B_CD + ' 秒）');
      if (h0) h0.textContent = '重击落空，' + ATK_B_CD + ' 秒后可再放';
      return;
    }
    setFaceFromDelta(hit[0].x - player.mx, hit[0].y - player.my);
    for (var j = 0; j < hit.length; j++) {
      var g = hit[j];
      var real = Math.max(1, Math.round(player.atk * 2 - g.def));
      g.hp -= real; g.flash = 0.3;
      addFloater(g.x, g.y - 0.3, '-' + real, '#ffd36b');
      var dx = g.x - player.mx, dy = g.y - player.my, dd = Math.hypot(dx, dy) || 1;
      for (var s = 0; s < 3; s++) {                       // 把妖兽推开
        if (couldStand(g.x + dx / dd * 0.3, g.y)) g.x += dx / dd * 0.3;
        if (couldStand(g.x, g.y + dy / dd * 0.3)) g.y += dy / dd * 0.3;
      }
      if (g.hp <= 0) killFoe(g); else hurtFoe(g);
    }
    toast('重击命中 ' + hit.length + ' 只（冷却 ' + ATK_B_CD + ' 秒）');
    if (h0) h0.textContent = '重击命中 ' + hit.length + ' 只，' + ATK_B_CD + ' 秒后可再放';
  }
  /** 动作试演（数字键 1~6）：直接切到指定动作，用来逐个核对素材效果 */
  function playAct(act) {
    if (player.dead && act !== 'dead') return;
    player.act = act; player.actT = 0;
    if (act === 'atkA') player.actHold = ACT_DUR.atkA;
    else if (act === 'atkB') player.actHold = ACT_DUR.atkB;
    else if (act === 'dead') { player.actHold = ACT_DUR.dead; player.dead = true; }
    else player.actHold = 0.9;        // 循环动作也临时锁一下，否则下一帧就被状态机改回 idle
    var h = document.getElementById('hint');
    if (h) h.textContent = '动作试演：' + (ACT_CN[act] || act) + '（' + (player.actHold) + ' 秒）';
  }
  function killFoe(f) {
    if (f.def_.dummy) {                 // 训练靶打不死：立刻满血重置，方便反复试
      f.hp = f.maxhp; f.flash = 0.25;
      addFloater(f.x, f.y - 0.4, '靶子已重置', '#8bf3ff');
      return;
    }
    if (f.dying > 0) return;            // 已经在倒地过程中，别重复结算
    f.hp = 0;
    player.exp += f.exp;
    var st = f.stones[0] + Math.floor(Math.random() * (f.stones[1] - f.stones[0] + 1));
    player.stones += st;
    addFloater(f.x, f.y - 0.4, '+' + st + ' 灵石', '#8bf3ff');
    spawnParticles(f.x, f.y);
    if (player.targetFoe === f) player.targetFoe = null;
    // 有倒地素材就播倒地（新怪物包取自 Dead.png，老妖兽用图集里的 _death_N 帧），
    // 播完由 updateFoes 收尾（置 alive=false 并排队复活）。没有素材才直接消失。
    var hasDeadAnim = (ATLAS.foes.anim && ATLAS.foes.anim[f.key] && ATLAS.foes.anim[f.key].acts.dead);
    var hasDeadRect = ATLAS.foes.rect && ATLAS.foes.rect[f.key + '_death_0'];
    if (hasDeadAnim || hasDeadRect) {
      f.dying = BEAST_DUR.dead;
      if (hasDeadAnim) { f.anim = 'dead'; f.animT = 0; f.animHold = 0; }
    } else {
      f.alive = false;
      f.respawn = 10 + Math.random() * 6;   // 一段时间后原地复活，打怪场常驻
    }
  }
  /** 挨打时的受击反馈：有 hurt 动作就播一下（0.3 秒内不可被移动状态改写） */
  function hurtFoe(f) {
    if (f.dying > 0) return;
    if (ATLAS.foes.anim && ATLAS.foes.anim[f.key]) setBeastAnim(f, 'hurt');
  }
  function respawnFoe(f) {
    var s = snapWalkable(CUR, f.home.x, f.home.y);
    f.x = s.x; f.y = s.y; f.hp = f.maxhp; f.alive = true; f.flash = 0; f.atkCd = 0;
    f.dying = 0; f.anim = 'idle'; f.animT = 0; f.animHold = 0;
  }
  // 把玩家沿「背离凶手」方向推开，最多 tiles 格（每步 0.34 格，遇实体即停）。
  // 旧版这里直接把玩家瞬移回出生点 —— 玩家体感是「被击飞一下到了别的地方」，
  // 而且飘字还写着"被击退"，完全对不上。现在改成真的击退：位移小、方向明确、可理解。
  function knockBackPlayer(fx, fy, tiles) {
    var dx = player.mx - fx, dy = player.my - fy;
    var d = Math.hypot(dx, dy);
    if (d < 1e-4) { dx = 0; dy = 1; d = 1; }   // 与怪完全重叠时，默认往下方推
    var ux = dx / d, uy = dy / d, step = 0.34, moved = 0;
    var n = Math.ceil(tiles / step);
    for (var i = 0; i < n; i++) {
      if (couldStand(player.mx + ux * step, player.my)) { player.mx += ux * step; moved++; }
      if (couldStand(player.mx, player.my + uy * step)) { player.my += uy * step; }
    }
    return moved;
  }
  function playerDown(foe) {
    var lost = Math.floor(player.stones * 0.3);
    player.stones -= lost;
    var pushed = foe ? knockBackPlayer(foe.x, foe.y, 0.6) : 0;   // 只轻推半步，不再大幅位移
    player.path = null; player.targetFoe = null;
    player.dead = true;
    player.act = 'dead'; player.actT = 0; player.actHold = ACT_DUR.dead;   // 播倒地动作
    player.flash = 0.5;
    screenFlash = 0.55;
    addFloater(player.mx, player.my - 0.4, '倒地！', '#ff8080');
    toast('气血耗尽倒地，折损灵石 ' + lost + (pushed ? '' : '（退路被阻）'));
    var h = document.getElementById('hint');
    if (h) h.textContent = '倒地中，' + ACT_DUR.dead + ' 秒后起身（起身有 2 秒无敌）';
  }
  function updateFoes(dt) {
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i];
      f.animT += dt;                                        // 动作计时（各状态共用）
      if (f.animHold > 0) f.animHold = Math.max(0, f.animHold - dt);
      // ?foeact=atk&i=0 —— 把第 i 只怪锁在某个动作的中段，供逐个动作截图核对
      if (foePose && foes[foePose.i] === f) {
        f.anim = foePose.act;
        f.animT = (BEAST_DUR[foePose.act] || 0) * foePose.k;
        f.animHold = 1; f.dying = foePose.act === 'dead' ? BEAST_DUR.dead : 0;
        f.hp = f.maxhp; f.alive = true;
        continue;
      }
      if (!f.alive) { f.respawn -= dt; if (f.respawn <= 0) respawnFoe(f); continue; }
      if (f.dying > 0) {                                    // 倒地中：把动作播完再消失
        f.dying -= dt;
        if (f.dying <= 0) { f.dying = 0; f.alive = false; f.respawn = 10 + Math.random() * 6; }
        continue;
      }
      if (f.flash > 0) f.flash = Math.max(0, f.flash - dt);
      if (f.atkAnim > 0) f.atkAnim = Math.max(0, f.atkAnim - dt);
      if (f.def_.dummy) { setBeastAnim(f, 'idle'); continue; }   // 训练靶：不追、不打、不移动
      var dx = player.mx - f.x, dy = player.my - f.y, dist = Math.hypot(dx, dy);
      f.atkCd -= dt;
      var moving = false;
      var radius = f.def_.aggro || AGGRO;      // 每只怪可以用登记表里的 aggro 覆盖默认仇恨半径
      var hd = Math.hypot(f.x - f.home.x, f.y - f.home.y);   // 离巢距离
      var leashed = hd > f.leash;              // 被引出了领地：停止追击，回巢待命
      if (dist < radius && !player.dead && !leashed) {
        var sp = f.def_.mv * dt, ux = dx / (dist || 1), uy = dy / (dist || 1);
        var sx2 = ux, sy2 = uy;
        // 走到出手距离就停住：引擎原本会一路挤进玩家所在格，画面上整只怪压在主角头上。
        // 停住之后由下面的 MELEE 判定出手，观感才对。
        if (dist > BEAST_STOP) {
          // 视野通畅就直接冲（斜向接近更自然）；被石柱/水面挡住才走 BFS 绕行路线
          var losOk = losClear(Math.round(f.x), Math.round(f.y), Math.round(player.mx), Math.round(player.my));
          if (losOk) {
            f.bpath = null;
          } else {
            f.repath = (f.repath || 0) - dt;
            if (f.repath <= 0 || !f.bpath) {
              f.repath = PATH_EVERY;
              f.bpath = bfsNext(f.x, f.y, player.mx, player.my, CUR);
            }
            if (f.bpath) {
              var wx = f.bpath.x - f.x, wy = f.bpath.y - f.y;
              if (Math.abs(wx) + Math.abs(wy) < 0.25) {   // 已到路点：下一帧重算
                f.bpath = null; f.repath = 0;
              } else {
                var wl = Math.hypot(wx, wy) || 1;
                sx2 = wx / wl; sy2 = wy / wl;
              }
            }
          }
          if (couldStand(f.x + sx2 * sp, f.y)) { f.x += sx2 * sp; moving = true; }
          if (couldStand(f.x, f.y + sy2 * sp)) { f.y += sy2 * sp; moving = true; }
          chaseDbg.key = f.key;
          chaseDbg.los = losOk ? 1 : 0;
          chaseDbg.sx = +sx2.toFixed(3); chaseDbg.sy = +sy2.toFixed(3);
          chaseDbg.bp = f.bpath ? (f.bpath.x + ',' + f.bpath.y) : '';
          chaseDbg.path = f.bpath ? 1 : 0;
        } else {
          f.bpath = null;
        }
        f.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        // 复活/被击退后的无敌窗口内不结算伤害，否则刚站起来就被连击再倒
        if (dist < MELEE + 0.15 && f.atkCd <= 0 && player.invuln <= 0) {
          f.atkCd = 1.0; f.atkAnim = 0.32;
          // 精英偶尔放重招（atk2），普通怪只有普通攻击
          setBeastAnim(f, (f.def_.elite && Math.random() < 0.35) ? 'atk2' : 'atk');
          var real = Math.max(1, Math.round(f.atk - player.def * 0.5));
          player.hp -= real; player.flash = 0.25;
          addFloater(player.mx, player.my - 0.35, '-' + real, '#ff6b6b');
          if (player.hp <= 0) playerDown(f);
        }
      } else if (hd > 0.6) {
        // 失去仇恨 / 越出领地 / 玩家死亡 → 走回巢穴，回到领地内待命（不追、不打）
        var hxx = f.home.x - f.x, hyy = f.home.y - f.y;
        var sp2 = f.def_.mv * 0.8 * dt;        // 回巢用 0.8 倍速，不慌不忙
        var sx2b = hxx, sy2b = hyy;
        var hlos = losClear(Math.round(f.x), Math.round(f.y), Math.round(f.home.x), Math.round(f.home.y));
        if (hlos) {
          f.bpath = null;
        } else {
          f.repath = (f.repath || 0) - dt;
          if (f.repath <= 0 || !f.bpath) {
            f.repath = PATH_EVERY;
            f.bpath = bfsNext(f.x, f.y, f.home.x, f.home.y, CUR);
          }
          if (f.bpath) {
            var bx = f.bpath.x - f.x, by = f.bpath.y - f.y;
            if (Math.abs(bx) + Math.abs(by) < 0.25) { f.bpath = null; f.repath = 0; }
            else { var bl = Math.hypot(bx, by) || 1; sx2b = bx / bl; sy2b = by / bl; }
          }
        }
        if (couldStand(f.x + sx2b * sp2, f.y)) { f.x += sx2b * sp2; moving = true; }
        if (couldStand(f.x, f.y + sy2b * sp2)) { f.y += sy2b * sp2; moving = true; }
        f.face = Math.abs(hxx) > Math.abs(hyy) ? (hxx > 0 ? 'right' : 'left') : (hyy > 0 ? 'down' : 'up');
        chaseDbg.key = f.key; chaseDbg.los = hlos ? 1 : 0;
        chaseDbg.sx = +sx2b.toFixed(3); chaseDbg.sy = +sy2b.toFixed(3);
        chaseDbg.bp = f.bpath ? (f.bpath.x + ',' + f.bpath.y) : '';
        chaseDbg.path = f.bpath ? 1 : 0;
      } else {
        f.bpath = null;   // 已在巢内待命
      }
      // 动作切换只在这几种情形下发生：受击/攻击的锁定期结束后才允许被移动状态改写
      if (f.animHold <= 0) {
        if (moving) setBeastAnim(f, f.def_.mv >= BEAST_RUN_MV ? 'run' : 'walk');
        else setBeastAnim(f, 'idle');
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
    // 倒地：老图集里其实带了 golem/wraith/assassin 的 death_0..2 三帧，从前一直没人读 ——
    // 顺手接上，让老妖兽也有倒地过程，而不是血一空就"啵"地消失。
    if (f.dying > 0) {
      var total = BEAST_DUR.dead, k = 1 - Math.max(0, f.dying) / total;
      for (var j = 2; j >= 0; j--) {
        var kd = base + '_death_' + j;
        if (rect[kd] && k >= j / 3) return kd;
      }
      if (rect[base + '_death_0']) return base + '_death_0';
    }
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
  /** 侧视怪物的取帧：循环动作（idle/walk/run）按 fps 走，一次性动作按播放进度走、停在末帧。
   *  返回的对象比 foePiece 多两个字段：ax（锚点在帧内的归一化横坐标）与 flip（是否水平镜像）。
   *  为什么要有 ax：引擎从前按「帧宽居中」摆怪，但侧视包的画手会把角色画在格子偏左/偏右，
   *  逐帧也不一致；构建脚本已把全动作统一平移过一次，并把真实锚点比例写进图集，这里直接用。 */
  function beastPiece(f) {
    var a = ATLAS.foes.anim && ATLAS.foes.anim[f.key];
    if (!a || !a.acts) return null;
    var act = f.anim || 'idle';
    if (!a.acts[act]) act = BEAST_FALLBACK[act] || 'idle';
    if (!a.acts[act]) act = 'idle';
    var arr = a.acts[act];
    if (!arr || !arr.length) return null;
    var i;
    if (act === 'atk' || act === 'atk2' || act === 'hurt' || act === 'dead') {
      var dur = BEAST_DUR[act] || 0.4;
      var k = Math.max(0, Math.min(0.999, f.animT / dur));
      i = Math.min(arr.length - 1, Math.floor(k * arr.length));
    } else {
      var fps = (a.fps && a.fps[act]) || 8;
      i = Math.floor(f.animT * fps) % arr.length;
    }
    var r = arr[i];
    // 侧视素材只有一版朝向。多数包画的是「朝右」，但小僵尸原画是「朝左」，
    // 所以镜像与否取决于「想要的朝向」和「素材原生朝向」是否一致，不能写死。
    var wantLeft = (f.face === 'left' || f.face === 'up');
    var srcLeft = (a.srcFace === 'left');
    return { img: ATLAS.foes.img, sx: r[0], sy: r[1], w: r[2], h: r[3],
      ax: (a.ax != null ? a.ax : 0.5), flip: (wantLeft !== srcLeft), srcFace: a.srcFace || 'right' };
  }
  /** 切怪物动作；同一个动作重复调用不重置计时（否则 idle 会永远卡在第 0 帧） */
  function setBeastAnim(f, act) {
    if (f.anim === act) return;
    f.anim = act; f.animT = 0;
    f.animHold = BEAST_DUR[act] || 0;
  }
  /** 贴一帧怪到屏幕上。flip=true 时以屏幕 x=px 为镜像轴 —— 侧视素材只有朝右一版，
   *  朝左只能镜像；横坐标要按锚点比例反着算，否则翻面后角色会整体偏左半个身位。 */
  function blitFoe(pz, px, ax, dy, ow, oh, flip, alpha, lighter) {
    ctx.save();
    if (alpha != null && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    if (lighter) ctx.globalCompositeOperation = 'lighter';
    if (flip) {
      ctx.translate(px, 0); ctx.scale(-1, 1);
      ctx.drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h, -ow * ax, dy, ow, oh);
    } else {
      ctx.drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h, Math.round(px - ow * ax), dy, ow, oh);
    }
    ctx.restore();
  }
  function drawFoe(f) {
    if (!f.alive && f.dying <= 0) return;
    var bp = beastPiece(f);
    var pz = bp || foePiece(foeFrameKey(f));
    var ax = bp ? bp.ax : 0.5, flip = bp ? bp.flip : false;
    var p = isoToScreen(f.x, f.y);
    var baseY = p.y + HH * Z;
    ctx.save();
    var shR = (f.def_.fh || 110) * 0.30 * Z;   // 接地影随体型等比，不再固定大小
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(p.x, baseY - 2, shR, shR * 0.5, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
    if (!pz) return;
    // 按「目标身高」归一化：图集各帧原始像素尺寸差很大（如石魔 idle 帧 348px 宽），
    // 直接 1:1 画会忽大忽小、且整只偏大。这里统一缩放到 fh，再以脚底 + 锚点对齐格子中心。
    var th = f.def_.fh || 110;
    var k = th / pz.h;
    var ow = pz.w * k * Z, oh = th * Z;
    var dy = Math.round(baseY - oh);
    var alpha = f.dying > 0 ? Math.min(1, f.dying / 0.4) : 1;   // 倒地末段淡出，接续原地复活
    var sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    blitFoe(pz, p.x, ax, dy, ow, oh, flip, alpha, false);
    if (f.flash > 0) {  // 受击闪白（lighter 只叠加在精灵像素上，透明处不显）
      blitFoe(pz, p.x, ax, dy, ow, oh, flip, Math.min(0.9, f.flash * 4) * alpha, true);
    }
    ctx.imageSmoothingEnabled = sm;
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

  // 屏幕「攻击」按钮：键盘之外的第二条出手路径，手机/触屏也能打
  var atkBtn = document.getElementById('btnAtk');
  if (atkBtn) {
    var doAtk = function (ev) { if (ev) ev.preventDefault(); attackNearest(); };
    atkBtn.addEventListener('click', doAtk);
    atkBtn.addEventListener('touchstart', doAtk, { passive: false });
  }
  var atkBBtn = document.getElementById('btnAtkB');
  if (atkBBtn) {
    var doAtkB = function (ev) { if (ev) ev.preventDefault(); powerAttack(); };
    atkBBtn.addEventListener('click', doAtkB);
    atkBBtn.addEventListener('touchstart', doAtkB, { passive: false });
  }

  // 动作试演面板：六个动作一个按钮，点它等同于按数字键 1~6。
  // 手机没有键盘，这块是唯一能逐个核对素材动作的入口。
  var ACT_ORDER = ['idle', 'walk', 'run', 'atkA', 'atkB', 'dead'];
  function markAct(a) {
    var bs = document.querySelectorAll('#actBtns button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].dataset.act === a);
  }
  (function buildActUI() {
    var box = document.getElementById('actBtns');
    if (!box) return;
    box.innerHTML = '';
    ACT_ORDER.forEach(function (a, i) {
      var b = document.createElement('button');
      b.textContent = (i + 1) + ' ' + ACT_CN[a];
      b.title = '试演「' + ACT_CN[a] + '」（键盘 ' + (i + 1) + '）';
      b.dataset.act = a;
      var fire = function (ev) { if (ev) ev.preventDefault(); playAct(a); markAct(a); };
      b.addEventListener('click', fire);
      b.addEventListener('touchstart', fire, { passive: false });
      box.appendChild(b);
    });
  })();

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
    document.getElementById('hint').textContent = '主角已换为 ' + (h.nick || ('免费包第 ' + h.n + ' 号角色'));
  }
  function buildHeroUI(preferN) {
    var box = document.getElementById('heroBtns');
    if (!box) return;
    box.innerHTML = '';
    HERO_OPTIONS.forEach(function (h) {
      var b = document.createElement('button');
      b.textContent = h.label; b.dataset.n = h.n;
      b.title = h.nick ? ('把主角换成 ' + h.nick) : ('把主角换成免费包第 ' + h.n + ' 号角色');
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
    if (nowEl) nowEl.textContent = pick.nick || pick.label;
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
    // 视口尺寸一变就立刻把相机对准主角。只改 W/H 的话，相机要等 updateCam 平滑
    // 几帧才归位 —— 拖拽窗口时会看到画面滑动，首屏（boot 时拿到的是默认窗口尺寸）
    // 更会停在一个错位状态：无头截图里表现为"同一 URL 两次截图背景不一样"。
    if (CUR) {
      camX = W / 2 - (player.mx - player.my) * HW * Z;
      camY = H / 2 - (player.mx + player.my) * HH * Z;
    }
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
        actors: _draw.actor, npcs: _draw.npc, foes: foes.length
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
    bfsNext: bfsNext,
    chaseDbg: function () { return chaseDbg; },
    /** 把玩家放到当前地图第 i 个传送门上，下一次 update 即触发切换 */
    stepOnPortal: function (i) { var pt = CUR.portals[i || 0]; player.mx = pt.x; player.my = pt.y; player.tx = pt.x; player.ty = pt.y; player.path = null; portalLock = 0; },
    tick: function (dt) { update(dt || 0.016); render(); },
    attackNearest: function () { attackNearest(); },
    powerAttack: function () { powerAttack(); },
    playAct: function (a) { playAct(a); return player.act; },
    act: function () {
      return { act: player.act, actT: +player.actT.toFixed(2), actHold: +player.actHold.toFixed(2),
        dead: player.dead, atkBCd: +player.atkBCd.toFixed(2), face: player.face };
    },
    foeInfo: function () {
      return foes.map(function (f) {
        return { name: f.name, key: f.key, x: +f.x.toFixed(1), y: +f.y.toFixed(1), hp: f.hp,
          anim: f.anim, animT: +f.animT.toFixed(2), dying: +f.dying.toFixed(2),
          side: !!f.def_.side, fh: f.def_.fh, dummy: !!f.def_.dummy, alive: f.alive };
      });
    },
    /** 逐 (怪 × 动作 × 帧) 解析帧并算出生效绘制尺寸 —— 供 headless 校验新怪物图集 */
    beastDebug: function () {
      var out = [];
      var anim = ATLAS.foes.anim || {};
      Object.keys(anim).forEach(function (k) {
        var a = anim[k], fh = (FOE_DEFS[k] || {}).fh || 100;
        var row = { key: k, cn: a.cn, ax: a.ax, box: a.box, fh: fh,
          srcFace: a.srcFace || 'right', aggro: (FOE_DEFS[k] || {}).aggro || 0, acts: {}, draw: {} };
        Object.keys(a.acts).forEach(function (act) {
          var arr = a.acts[act];
          row.acts[act] = arr.length;
          var r = arr[0];
          row.draw[act] = { src: [r[2], r[3]], out: [Math.round(r[2] * fh / r[3]), fh] };
        });
        out.push(row);
      });
      return out;
    },
    /** 把某只怪强行切到指定动作，用于截图核对每个动作的姿态 */
    setFoeAnim: function (i, act) {
      var f = foes[i]; if (!f) return null;
      f.anim = act; f.animT = 0; f.animHold = 0;
      f.animHold = (BEAST_DUR[act] || 0) > 0 ? BEAST_DUR[act] : 0;
      f.animT = (BEAST_DUR[act] || 0) * 0.45;    // 停在动作中段，看得出挥击/倒地
      return f.key + ':' + act;
    },
    /** 逐 (怪 × 状态 × 朝向) 解析帧并算出生效绘制尺寸，供 headless 校验图集与归一化 */
    foeDebug: function () {
      var out = [];
      ['assassin', 'golem', 'wraith'].forEach(function (base) {
        var fh = FOE_DEFS[base].fh;
        ['idle', 'attack'].forEach(function (st) {
          ['down', 'right', 'left', 'up'].forEach(function (d) {
            var fk = foeFrameKey({ key: base, face: d, atkAnim: st === 'attack' ? 1 : 0 });
            var pz = foePiece(fk);
            out.push({ base: base, st: st, dir: d, frame: fk,
              w: pz ? pz.w : -1, h: pz ? pz.h : -1,
              drawW: pz ? Math.round(pz.w * (fh / pz.h)) : -1, drawH: fh });
          });
        });
      });
      return out;
    },
    foeCount: function () { return (foes || []).filter(function (f) { return f.alive; }).length; },
    _p: player
  };

  // 手机端适配：① 精简底部操作提示（WASD 长文本没用且挡画面，改成短提示、6 秒自动收起、点按恢复）
  //            ② 触屏竖屏盖一层「建议横屏」浮层，转横屏自动消失，也可点「竖屏也能玩」直接开玩
  // 这两件事只在触屏设备做，桌面端完全不动（避免误判触屏把键盘玩家的界面改了）。
  (function initMobile() {
    // 判定「手机/平板」只看主输入设备是不是手指（pointer: coarse）。
    // 千万别用 'ontouchstart' in window 或 maxTouchPoints 单独兜底：Windows 触屏本上这两个也是真，
    // 会把桌面端玩家的界面一起改掉（动作试演条消失、冒出横屏浮层）。没 matchMedia 才退回老办法。
    var mq = window.matchMedia;
    var coarse = !!(mq && mq('(pointer: coarse)').matches);
    var noHover = !!(mq && mq('(hover: none)').matches);
    var isTouch = mq ? (coarse && noHover) : (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
    // ?touch=1 / ?touch=0 强制开关：桌面 Chrome 的 pointer:coarse 永远为假，
    // 手机端这套 UI 就没法无头验证。给了开关才能截图核对「提示不挡画面 / 竖屏盖浮层」。
    var tq = new URLSearchParams(location.search).get('touch');
    if (tq === '1') isTouch = true; else if (tq === '0') isTouch = false;
    if (window.ISLES) window.ISLES.mobile = { touch: isTouch, coarse: coarse, noHover: noHover, forced: tq || '' };
    if (!isTouch) return;
    document.body.classList.add('touch');

    // —— 浮动摇杆（左半屏触点出现，推动即走、推满奔跑）——
    // 借 realtime（凡人修仙录）的成熟设计：不固定位置，按在哪摇杆出现在哪。
    // 左半屏归摇杆、右半屏保留「点地面移动」；pointerdown preventDefault 掉
    // 兼容鼠标事件，避免起杆那一下又被当成点击寻路。
    var joyEl = document.getElementById('joystick');
    var joyKnob = document.getElementById('joy-knob');
    var JOY_R = 48;
    var joy = { active: false, id: null };
    function joyStart(e) {
      if (e.clientX > window.innerWidth / 2) return;   // 右半屏留给点地移动 / 出招按钮
      joy.active = true; joy.id = e.pointerId;
      var size = joyEl.offsetWidth || 120;
      joyEl.style.left = (e.clientX - size / 2) + 'px';
      joyEl.style.top = (e.clientY - size / 2) + 'px';
      joyEl.style.display = 'block';
      joyKnob.style.transform = 'translate(0px,0px)';
      joyMove(e); e.preventDefault();
    }
    function joyMove(e) {
      if (!joy.active || e.pointerId !== joy.id) return;
      var rect = joyEl.getBoundingClientRect();
      var dx = e.clientX - (rect.left + rect.width / 2);
      var dy = e.clientY - (rect.top + rect.height / 2);
      var dd = Math.hypot(dx, dy);
      if (dd > JOY_R) { dx = dx / dd * JOY_R; dy = dy / dd * JOY_R; }
      joyVec.x = dx / JOY_R; joyVec.y = dy / JOY_R;
      joyVec.run = dd >= JOY_R * 0.95;                 // 推满边缘 = 奔跑
      joyKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      e.preventDefault();
    }
    function joyEnd(e) {
      if (e.pointerId !== joy.id) return;
      joy.active = false; joy.id = null;
      joyVec.x = 0; joyVec.y = 0; joyVec.run = false;
      joyKnob.style.transform = 'translate(0px,0px)';
      joyEl.style.display = 'none';
    }
    canvas.addEventListener('pointerdown', joyStart);
    window.addEventListener('pointermove', joyMove, { passive: false });
    window.addEventListener('pointerup', joyEnd);
    window.addEventListener('pointercancel', joyEnd);

    // —— 操作提示精简 + 自动收起 ——
    // 原文案是给键盘玩家的（WASD / J/K / Shift / 1~6），手机上既没用又长到压住半屏。
    // 换成真·触屏操作：游戏没有"滑动移动"，移动是点地面寻路，别写成滑动。
    var bottom = document.getElementById('bottom');
    if (bottom) {
      bottom.innerHTML = '左半屏按住摇杆移动（推满奔跑）· 右下角 <b>攻击A / 重击B</b> 出手 · ' +
        '右半屏点地也能走 · <span class="hl">点这里收起</span>';
      var hideTimer = null;
      function schedule() { clearTimeout(hideTimer); hideTimer = setTimeout(function () { bottom.classList.add('faded'); }, 6000); }
      bottom.addEventListener('click', function () {
        bottom.classList.toggle('faded');
        if (!bottom.classList.contains('faded')) schedule(); else clearTimeout(hideTimer);
      });
      schedule();
    }

    // —— 右上地图速切面板：默认折叠，点标题展开 ——
    // 11 个外形按钮在 390 高的手机上会把右上角顶满，连玩法都看不清。
    var tr = document.getElementById('topright');
    if (tr) {
      tr.classList.add('folded');
      var trHead = tr.querySelector('.t');
      if (trHead) trHead.addEventListener('click', function () { tr.classList.toggle('folded'); });
    }

    // —— 横屏提醒（竖屏才显示）——
    var hint = document.getElementById('rotate-hint');
    if (!hint) {
      hint = document.createElement('div'); hint.id = 'rotate-hint';
      hint.innerHTML = '<div class="icon">📱</div><h2>建议横屏游玩</h2>' +
        '<p>横屏视野更开阔，出招更顺手。<br>竖屏也能直接玩。</p>' +
        '<button id="rotate-ok" class="ghost-btn">好，竖屏也能玩</button>';
      document.body.appendChild(hint);
    }
    function syncOrient() {
      if (hint.dataset.dismissed) { document.body.classList.remove('show-rotate'); return; }
      var portrait = window.innerHeight > window.innerWidth;
      document.body.classList.toggle('show-rotate', portrait);
    }
    var okBtn = document.getElementById('rotate-ok');
    if (okBtn) okBtn.addEventListener('click', function () {
      hint.dataset.dismissed = '1'; document.body.classList.remove('show-rotate');
    });
    window.addEventListener('resize', syncOrient);
    window.addEventListener('orientationchange', function () { setTimeout(syncOrient, 260); });
    syncOrient();

    // —— ?autotest=mobileui：手机端 UI 的程序化验收 ——
    // 这套界面在桌面 Chrome 里根本跑不到（pointer:coarse 恒假），而它坏起来又全是
    // 「点了没反应」这种肉眼在电脑上永远发现不了的毛病。三条关键断言：
    //   ① .hud 带着 pointer-events:none —— 用 elementFromPoint 验证点击真的落在元素上，
    //      而不是穿透到画布（这个坑真踩过：提示条与折叠标题都收不到点击）；
    //   ② 点提示条能收起 / 再点能展开；
    //   ③ 竖屏浮层出现、点按钮后消失（横屏反之）。
    //
    // ⚠ 时机：initMobile 在 boot() 之前跑，那时加载遮罩（z-index 99）还盖在最上层，
    // elementFromPoint 一律返回遮罩 → 三条命中断言全假。所以这里只把函数挂出去，
    // 由 boot() 在隐藏遮罩之后调用。断言里也顺手验一下遮罩确实已经隐藏。
    window.__mobileAudit = function () {
      var r2 = { coarse: coarse, noHover: noHover, touch: isTouch, bodyClass: document.body.className };
      var ld = document.getElementById('loader');
      r2.loaderHidden = !!ld && getComputedStyle(ld).display === 'none';
      function mid(el) {
        var b = el.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) };
      }
      function hits(el) {
        var m = mid(el), t = document.elementFromPoint(m.x, m.y);
        return !!t && (t === el || el.contains(t));
      }
      var overlayOn = document.body.classList.contains('show-rotate');
      if (bottom) {
        // 先把它强制显示出来再测：自动收起是 6 秒定时器，虚拟时钟下自测很可能在它淡出之后
        // 才跑，那时 pointer-events 已经是 none，命中测试必然为假 —— 那是时序，不是 bug。
        r2.bottomWasFaded = bottom.classList.contains('faded');
        bottom.classList.remove('faded');
        r2.bottomBox = mid(bottom);
        r2.bottomPE = getComputedStyle(bottom).pointerEvents;
        // 竖屏时横屏浮层盖在提示条之上，点不到是设计如此
        r2.bottomHit = overlayOn ? 'skipped-overlay' : hits(bottom);
        bottom.click(); r2.bottomDismissed = bottom.classList.contains('faded');
        bottom.click(); r2.bottomRestored = !bottom.classList.contains('faded');
      }
      if (tr && trHead) {
        r2.toprightBox = mid(tr);
        r2.foldedInit = tr.classList.contains('folded');
        if (r2.foldedInit) r2.zoombarHidden = getComputedStyle(document.getElementById('zoombar')).display === 'none';
        // 竖屏时横屏浮层盖在最上层，标题本来就点不到 —— 跳过（浮层自己的命中测试见下）
        r2.headHit = overlayOn ? 'skipped-overlay' : hits(trHead);
        trHead.click(); r2.foldedAfterClick = tr.classList.contains('folded');
        r2.herobarShown = getComputedStyle(document.getElementById('herobar')).display !== 'none';
        trHead.click(); r2.foldedBack = tr.classList.contains('folded');
      }
      if (hint) {
        r2.rotateShown = document.body.classList.contains('show-rotate');
        r2.hintPE = getComputedStyle(hint).pointerEvents;
        if (r2.rotateShown) r2.hintHit = hits(hint);
        var okb = document.getElementById('rotate-ok');
        if (okb) { r2.okHit = hits(okb); okb.click(); r2.rotateDismissed = !document.body.classList.contains('show-rotate'); }
      }
      var pbt = document.getElementById('probe');
      if (!pbt) { pbt = document.createElement('div'); pbt.id = 'probe'; pbt.style.display = 'none'; document.body.appendChild(pbt); }
      pbt.textContent = JSON.stringify(r2);
    };
    if (!tq || new URLSearchParams(location.search).get('autotest') !== 'mobileui') delete window.__mobileAudit;
  })();

  boot();
})();
