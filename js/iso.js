/* =========================================================
 * js/iso.js —— 等距视角（Isometric 45°）国风修仙坊市
 * 纯 HTML5 Canvas 2D + 原生 JS，零依赖、零构建。无怪物、无战斗。
 *
 * 功能：等距地图渲染 / 深度排序 / 摄像机平滑跟随 / 点击（含触摸）移动 / 点击 NPC 对话 / UI 覆盖层
 *
 * ---------------------------------------------------------
 * 【素材约定】图片统一放 assets/，用相对路径加载；缺失或加载失败会自动回退到纯色占位符。
 *   assets/tiles/ground.png        等距地面：横向 2 帧（64×32/帧）—— 0=土地 1=青石板
 *   assets/tiles/buildings.png     等距建筑（按占地比例缩放绘制，透明底）
 *   assets/tiles/decorations.png   国风装饰：横排 12 帧（96×96/帧）垂柳/青松/竹/灯笼×2/石狮/水井/火盆/练功桩/石牌坊/玉龙像/武雕像
 *   assets/characters/player.png           玩家立绘（底边居中对齐脚点）
 *   assets/characters/npc_merchant.png     商人 NPC
 *   assets/characters/npc_villager.png     村民/弟子 NPC
 *   assets/ui/panel.png            UI 底板（自动铺到状态栏/任务栏/对话框）
 *   assets/ui/icons.png            技能图标：横向 4 格（64×64/格）
 *
 * 当前素材由 tools/make_assets.py 程序化生成（古风修仙风）。
 * 想换更好的素材：用同名 PNG 覆盖 assets/ 下文件即可，无需改代码；
 * 若用整张 tileset，改 drawGroundTile() 里 drawImage 的源坐标即可（见注释）。
 * 可选来源（CC0）：OpenGameArt「Isometric Floor Tiles / Isometric Town Tiles」、
 *   Summer Engine「Chinese Cultivation Village House / NPC Villager Chibi Sprite」、
 *   2DPIXX Free 2D Isometric Fantasy Pack、爱给网「水墨Q版仙侠UI」。
 * ========================================================= */
(() => {
  'use strict';

  // =====================================================
  // 一、画布与瓦片尺寸（手机端自动缩小瓦片）
  // =====================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  let TILE_W = 64, TILE_H = 32;      // 标准 45° 等距：宽高比 2:1
  let HW = TILE_W / 2, HH = TILE_H / 2;

  function applyScale() {
    const small = window.innerWidth < 760;
    TILE_W = small ? 48 : 64;
    TILE_H = small ? 24 : 32;
    HW = TILE_W / 2; HH = TILE_H / 2;
  }
  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
    applyScale();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  resize();

  // =====================================================
  // 二、地图数据（二维数组）
  //   0 = 地面（可走）   1 = 建筑/障碍（不可走）   2 = 装饰（石板/景物，可走）
  // =====================================================
  const MAP_W = 22, MAP_H = 22;
  const map = [];
  for (let y = 0; y < MAP_H; y++) map.push(new Array(MAP_W).fill(0));

  function fill(x0, y0, w, h, v) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) map[y][x] = v;
  }

  fill(8, 8, 6, 6, 2);      // 中央广场（石板）
  fill(1, 10, 20, 2, 2);    // 横向主街
  fill(10, 1, 2, 20, 2);    // 纵向主街

  // —— 建筑：占地图标 1（不可走），登记用于绘制与深度排序 ——
  const buildings = [
    { x: 3,  y: 3,  w: 5, h: 4, h3d: 46, name: '接引台', roof: '#4a5a7a' },
    { x: 14, y: 3,  w: 5, h: 4, h3d: 46, name: '聚宝阁', roof: '#7a6a2e' },
    { x: 3,  y: 14, w: 5, h: 4, h3d: 46, name: '丹  房', roof: '#8a3b2e' },
    { x: 14, y: 14, w: 5, h: 4, h3d: 46, name: '器  坊', roof: '#4a6a4a' },
  ];
  buildings.forEach(b => fill(b.x, b.y, b.w, b.h, 1));

  // —— 装饰物：FreePixel 国风道具（帧表见 DECOR_FRAME）
  //   实体道具（树/石狮/水井/火盆/木桩/像）所在格标 1 不可穿行；灯笼挂空中、牌坊可穿行
  const props = [
    { x: 5,  y: 8,  kind: 'willow' }, { x: 16, y: 13, kind: 'willow' },
    { x: 5,  y: 13, kind: 'pine' },   { x: 16, y: 8,  kind: 'pine' },
    { x: 7,  y: 18, kind: 'pine' },   { x: 14, y: 18, kind: 'willow' },
    { x: 6,  y: 5,  kind: 'bamboo' }, { x: 15, y: 5,  kind: 'bamboo' },
    { x: 9,  y: 7,  kind: 'lantern' },  { x: 12, y: 7,  kind: 'lantern' },
    { x: 9,  y: 15, kind: 'lantern' },  { x: 12, y: 15, kind: 'lantern' },
    { x: 7,  y: 9,  kind: 'lanternY' }, { x: 14, y: 9,  kind: 'lanternY' },
    { x: 9,  y: 6,  kind: 'lion' },   { x: 12, y: 6,  kind: 'lion' },   // 接引台前石狮
    { x: 8,  y: 14, kind: 'well' },                                     // 丹房旁水井
    { x: 9,  y: 9,  kind: 'brazier' },  { x: 12, y: 12, kind: 'brazier' },  // 广场火盆
    { x: 13, y: 14, kind: 'dummy' },    { x: 14, y: 13, kind: 'dummy' },    // 器坊前练功桩
    { x: 17, y: 11, kind: 'gate' },                                     // 东街石牌坊（可穿行）
    { x: 8,  y: 12, kind: 'dragon' },                                   // 广场玉龙像
    { x: 13, y: 12, kind: 'statue' },                                   // 广场武雕像
  ];
  const SOLID_PROPS = new Set(['willow', 'pine', 'bamboo', 'lion', 'well', 'brazier', 'dummy', 'dragon', 'statue']);
  props.forEach(p => { map[p.y][p.x] = SOLID_PROPS.has(p.kind) ? 1 : 2; });

  // =====================================================
  // 三、NPC 与玩家
  // =====================================================
  //  sprite 对应 ASSETS 键名；素材缺失时自动用彩色占位小人
  const npcs = [
    { id: 'jieyin', name: '接引弟子', mx: 10.5, my: 6.5, color: '#7fc4ff',
      sprite: 'npcVillager', hasQuest: true,
      talk: '可是来拜师的？青玄宗收徒有规矩：先寻引路之人，再过问心阶。\n（任务：与接引弟子对话 0/1 —— 你已完成对话，可去丹房、器坊一带转转。）' },
    { id: 'shangren', name: '灵石商人', mx: 13.5, my: 8.5, color: '#8fd3ff',
      sprite: 'npcMerchant', hasQuest: false,
      talk: '灵石通万物，道友可要换些丹药符箓？\n（此处为商店占位，日后接背包与交易面板。）' },
    { id: 'zayi', name: '杂役弟子', mx: 6.5, my: 12.5, color: '#9fd48a',
      sprite: 'npcVillager', hasQuest: false,
      talk: '（擦汗）丹房今日要三株灵药，我采了两株，还差一株……\n（任务：采集灵药 2/3）' },
    { id: 'hedaozhang', name: '何道长', mx: 16.5, my: 11.5, color: '#c9a0dc',
      sprite: 'npcVillager', hasQuest: true,
      talk: '贫道观你印堂微暗，近日不宜远行。\n（任务：求得一道护身符，可去找灵石商人。）' },
    { id: 'baifashi', name: '摆法师', mx: 7.5, my: 8.5, color: '#e0c068',
      sprite: 'npcMerchant', hasQuest: false,
      talk: '占一卦三枚灵石——今日宜静不宜动，宜东南，忌西北。' },
  ];

  const player = {
    mx: 10.5, my: 12.5,
    target: null,           // {mx,my} 目标点；null = 停止
    speed: 3.0,             // 格/秒
    face: 1, walking: false, walkT: 0,
  };

  // =====================================================
  // 四、素材加载（失败自动回退占位符）
  // =====================================================
  const ASSETS = {
    ground:       'assets/tiles/ground.png',
    buildings:    'assets/tiles/buildings.png',
    decorations:  'assets/tiles/decorations.png',
    player:       'assets/characters/player.png',
    npcMerchant:  'assets/characters/npc_merchant.png',
    npcVillager:  'assets/characters/npc_villager.png',
    uiPanel:      'assets/ui/panel.png',
    uiIcons:      'assets/ui/icons.png',
  };
  const SPR = {};                       // 只放「加载成功」的图片
  const missing = [];
  Object.keys(ASSETS).forEach(key => {
    const img = new Image();
    img.onload = () => { SPR[key] = img; applyUiSkins(); };
    img.onerror = () => { missing.push(ASSETS[key]); };   // 静默失败 → 占位绘制
    img.src = ASSETS[key];
  });

  /** UI 底板 / 技能图标存在时铺到对应元素（icons 是 4 格横排，按格取位） */
  function applyUiSkins() {
    if (SPR.uiPanel) {
      document.querySelectorAll('.uiPanel').forEach(el => {
        el.style.backgroundImage = 'url(' + ASSETS.uiPanel + ')';
      });
    }
    if (SPR.uiIcons) {
      document.querySelectorAll('.skill').forEach((el, i) => {
        el.style.backgroundImage = 'url(' + ASSETS.uiIcons + ')';
        el.style.backgroundSize = '400% 100%';                // 4 格横排
        el.style.backgroundPosition = (i * 100 / 3) + '% 0%'; // 0% 33.3% 66.7% 100%
      });
    }
  }

  // =====================================================
  // 五、坐标转换（等距核心）
  // =====================================================
  // 摄像机原点（屏幕像素）。渲染与反算都围绕它，公式与需求一致。
  let cameraX = 0, cameraY = 0;

  /** 地图坐标 → 屏幕坐标
   *  screenX = (mapX - mapY) * (TILE_W/2) + cameraX
   *  screenY = (mapX + mapY) * (TILE_H/2) + cameraY
   */
  function isoToScreen(mx, my) {
    return {
      x: (mx - my) * (TILE_W / 2) + cameraX,
      y: (mx + my) * (TILE_H / 2) + cameraY,
    };
  }

  /** 屏幕坐标 → 地图坐标（上面的逆向解）
   *  需求公式默认摄像机在原点；实际有偏移，先减掉 cameraX/cameraY：
   *    mapX = ((sx-cameraX)/(TILE_W/2) + (sy-cameraY)/(TILE_H/2)) / 2
   *    mapY = ((sy-cameraY)/(TILE_H/2) - (sx-cameraX)/(TILE_W/2)) / 2
   */
  function screenToIso(sx, sy) {
    const a = (sx - cameraX) / (TILE_W / 2);
    const b = (sy - cameraY) / (TILE_H / 2);
    return { mx: (a + b) / 2, my: (b - a) / 2 };
  }

  /** 摄像机平滑跟随：目标 = 玩家保持在画面中心，指数插值（帧率无关） */
  function updateCamera(dt) {
    const px = (player.mx - player.my) * (TILE_W / 2);
    const py = (player.mx + player.my) * (TILE_H / 2);
    const k = 1 - Math.exp(-6 * dt);
    cameraX += (W / 2 - px - cameraX) * k;
    cameraY += (H / 2 - py - cameraY) * k;
  }

  // =====================================================
  // 六、可行走判定
  // =====================================================
  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 1;
    return map[Math.floor(y)][Math.floor(x)];
  }
  /** 只有 1（建筑/障碍）不可走；0 地面与 2 装饰均可走 */
  function canStand(mx, my) {
    return [[0, 0], [-.25, 0], [.25, 0], [0, -.25], [0, .25]]
      .every(([ox, oy]) => tileAt(mx + ox, my + oy) !== 1);
  }

  // =====================================================
  // 七、绘制
  // =====================================================
  /** 地面：ground.png 横向 2 帧（0=土地 1=石板）；无素材则画纯色菱形 */
  function drawGroundTile(tx, ty) {
    const v = map[ty][tx];
    const p = isoToScreen(tx, ty);                 // 菱形上顶点
    if (p.x < -TILE_W || p.x > W + TILE_W || p.y < -TILE_H * 4 || p.y > H + TILE_H * 4) return; // 视口裁剪

    if (SPR.ground) {
      // 素材源帧固定 64×32；若是整张 tileset，把 sx/sy 换成目标瓦片源坐标即可
      const sx = (v === 2) ? 64 : 0;               // 石板/装饰格用第 2 帧
      ctx.drawImage(SPR.ground, sx, 0, 64, 32, p.x - HW, p.y, TILE_W, TILE_H);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + HW, p.y + HH);
    ctx.lineTo(p.x, p.y + TILE_H);
    ctx.lineTo(p.x - HW, p.y + HH);
    ctx.closePath();
    ctx.fillStyle = v === 2 ? ((tx + ty) % 2 ? '#7f7868' : '#8a8272')
                            : v === 1 ? '#5a4a38'
                            : ((tx + ty) % 2 ? '#63543d' : '#6a5a42');
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** 建筑：有素材按比例贴图，否则画「顶面+左右侧面」等距立体盒子 */
  function drawBuilding(b) {
    const A = isoToScreen(b.x, b.y);
    const C = isoToScreen(b.x + b.w, b.y + b.h);
    const cx = (A.x + C.x) / 2, bottomY = C.y;
    const dw = (b.w + b.h) * HW * 0.92;
    const dh = (b.w + b.h) * HH * 0.92 + b.h3d;

    if (SPR.buildings) {
      ctx.drawImage(SPR.buildings, cx - dw / 2, bottomY - dh, dw, dh);
    } else {
      const B = isoToScreen(b.x + b.w, b.y);
      const D = isoToScreen(b.x, b.y + b.h);
      const hgt = b.h3d;
      ctx.fillStyle = '#4a3c2c';
      ctx.beginPath();
      ctx.moveTo(D.x, D.y); ctx.lineTo(C.x, C.y);
      ctx.lineTo(C.x, C.y - hgt); ctx.lineTo(D.x, D.y - hgt);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5c4a36';
      ctx.beginPath();
      ctx.moveTo(C.x, C.y); ctx.lineTo(B.x, B.y);
      ctx.lineTo(B.x, B.y - hgt); ctx.lineTo(C.x, C.y - hgt);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = b.roof;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y - hgt); ctx.lineTo(B.x, B.y - hgt);
      ctx.lineTo(C.x, C.y - hgt); ctx.lineTo(D.x, D.y - hgt);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // 匾额（有无素材都画，保证可读性）
    ctx.fillStyle = '#ffd75e';
    ctx.font = 'bold 15px Microsoft YaHei';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, cx, bottomY - dh - 6);
  }

  /** 装饰：decorations.png 横向 12 帧（FreePixel 国风道具，每帧 96×96）；无素材画占位
   *  帧表：0垂柳 1青松 2竹 3红灯笼 4黄灯笼 5石狮 6水井 7火盆 8练功桩 9石牌坊 10玉龙像 11武雕像 */
  const DECOR_FRAME = { willow: 0, pine: 1, bamboo: 2, lantern: 3, lanternY: 4, lion: 5, well: 6, brazier: 7, dummy: 8, gate: 9, dragon: 10, statue: 11 };
  const DECOR_SCALE = { willow: 1.4, pine: 1.3, bamboo: 1.1, lantern: 0.9, lanternY: 0.9, lion: 1.0, well: 1.05, brazier: 0.85, dummy: 0.95, gate: 1.6, dragon: 1.2, statue: 1.05 };
  function drawProp(p) {
    const s = isoToScreen(p.x + 0.5, p.y + 0.5);
    if (s.x < -80 || s.x > W + 80 || s.y < -160 || s.y > H + 80) return;
    if (SPR.decorations) {
      const f = (DECOR_FRAME[p.kind] || 0) * 96;      // 源帧固定 96×96
      const dw = TILE_W * (DECOR_SCALE[p.kind] || 1), dh = dw;
      ctx.drawImage(SPR.decorations, f, 0, 96, 96, s.x - dw / 2, s.y - dh + 6, dw, dh);
      return;
    }
    if (p.kind === 'willow' || p.kind === 'pine') {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a3520'; ctx.fillRect(s.x - 3, s.y - 26, 6, 14);
      ctx.fillStyle = '#2e4a26';
      ctx.beginPath(); ctx.arc(s.x, s.y - 32, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3c5e30';
      ctx.beginPath(); ctx.arc(s.x - 5, s.y - 36, 10, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#5a4a38'; ctx.fillRect(s.x - 2, s.y - 34, 4, 24);
      ctx.fillStyle = 'rgba(255,120,60,.22)';
      ctx.beginPath(); ctx.arc(s.x, s.y - 40, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.ellipse(s.x, s.y - 40, 8, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd75e'; ctx.fillRect(s.x - 3, s.y - 30, 6, 3);
    }
  }

  /** 角色：有素材用立绘（底边居中对齐脚点），否则画占位小人 */
  function drawCharacter(o, isPlayer, time) {
    const s = isoToScreen(o.mx, o.my);
    if (s.x < -90 || s.x > W + 90 || s.y < -160 || s.y > H + 90) return;
    const bob = (isPlayer && o.walking) ? Math.abs(Math.sin(o.walkT * 10)) * 3
                                        : Math.sin(time * 2 + o.mx) * 1.2;
    const baseY = s.y - bob;
    const img = isPlayer ? SPR.player : SPR[o.sprite];

    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 12, 5, 0, 0, Math.PI * 2); ctx.fill();

    if (img) {
      const dh = TILE_H * 2.4, dw = dh * (img.width / img.height);
      ctx.drawImage(img, s.x - dw / 2, baseY - dh + 4, dw, dh);
    } else {
      ctx.fillStyle = isPlayer ? '#3a5a7a' : o.color;
      ctx.beginPath();
      ctx.moveTo(s.x - 9, baseY); ctx.lineTo(s.x - 7, baseY - 20);
      ctx.lineTo(s.x + 7, baseY - 20); ctx.lineTo(s.x + 9, baseY);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8c8a0';
      ctx.beginPath(); ctx.arc(s.x, baseY - 26, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2018';
      ctx.beginPath(); ctx.arc(s.x, baseY - 30, 5.5, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillRect(s.x - 2, baseY - 36, 4, 4);
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(s.x + (isPlayer ? o.face * 2 : -2), baseY - 27, 2, 2);
      ctx.fillRect(s.x + (isPlayer ? o.face * 2 + 4 : 2), baseY - 27, 2, 2);
    }

    const headTop = baseY - (img ? TILE_H * 2.4 + 2 : 40);
    ctx.textAlign = 'center';
    ctx.font = '12px Microsoft YaHei';
    ctx.fillStyle = isPlayer ? '#ffe9b3' : '#e8dcc0';
    ctx.fillText(isPlayer ? '逍遥长生' : o.name, s.x, headTop - 6);

    if (!isPlayer && o.hasQuest) {                    // 黄色感叹号（浮动）
      const b = Math.sin(time * 4) * 3;
      ctx.font = 'bold 20px Microsoft YaHei';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('!', s.x, headTop - 16 + b);
    }
    if (!isPlayer && hoverNpc === o) {
      ctx.font = '11px Microsoft YaHei';
      ctx.fillStyle = '#9fd48a';
      ctx.fillText('点击交谈', s.x, headTop - 30);
    }
  }

  // =====================================================
  // 八、渲染主流程（深度排序：mapX+mapY 小的先画）
  // =====================================================
  let time = 0, hoverNpc = null;
  function render() {
    ctx.fillStyle = '#14100b';
    ctx.fillRect(0, 0, W, H);

    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) drawGroundTile(x, y);

    const draws = [];
    buildings.forEach(b => draws.push({
      key: (b.x + b.w - 1) + (b.y + b.h - 1) + 0.5,   // 立体建筑取最前角做键
      fn: () => drawBuilding(b)
    }));
    props.forEach(p => draws.push({ key: p.x + p.y + 0.4, fn: () => drawProp(p) }));
    npcs.forEach(n => draws.push({ key: n.mx + n.my, fn: () => drawCharacter(n, false, time) }));
    draws.push({ key: player.mx + player.my, fn: () => drawCharacter(player, true, time) });

    draws.sort((a, b) => a.key - b.key).forEach(d => d.fn());
    drawMinimap();
  }

  // =====================================================
  // 九、小地图（俯视占位；有真实小地图贴图时可换 drawImage）
  // =====================================================
  const mm = document.getElementById('minimap');
  const mctx = mm.getContext('2d');
  function drawMinimap() {
    const CELL = mm.width / MAP_W;
    mctx.fillStyle = '#2a3a24';
    mctx.fillRect(0, 0, mm.width, mm.height);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const v = map[y][x];
        mctx.fillStyle = v === 1 ? '#6a5a42' : v === 2 ? '#8a8272' : '#4a4230';
        mctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    npcs.forEach(n => { mctx.fillStyle = '#ffd75e'; mctx.fillRect(n.mx * CELL - 2, n.my * CELL - 2, 4, 4); });
    mctx.fillStyle = '#fff';
    mctx.fillRect(player.mx * CELL - 2.5, player.my * CELL - 2.5, 5, 5);
  }

  // =====================================================
  // 十、交互：点击/触摸移动 + 点击 NPC 对话
  // =====================================================
  function hitNpc(sx, sy) {
    const r = (window.innerWidth < 760 ? 42 : 30);   // 手指更粗，放宽判定
    let best = null, bestY = -Infinity;
    npcs.forEach(n => {
      const p = isoToScreen(n.mx, n.my);
      const dx = sx - p.x;
      const dy = sy - (p.y - TILE_H);                // 身体中心约在脚点上方一个瓦片高
      if (dx * dx + dy * dy < r * r && p.y > bestY) { best = n; bestY = p.y; }
    });
    return best;
  }

  /** 统一点按处理：鼠标与触摸共用 */
  function handleTap(sx, sy) {
    const n = hitNpc(sx, sy);
    if (n) {                                         // 1) NPC → 停止移动 + 弹对话
      player.target = null;
      player.walking = false;
      openDialog(n);
      return;
    }
    const t = screenToIso(sx, sy);                   // 2) 地面 → 逆向换算寻路
    const tx = Math.floor(t.mx), ty = Math.floor(t.my);
    if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && tileAt(tx + 0.5, ty + 0.5) !== 1) {
      player.target = { mx: tx + 0.5, my: ty + 0.5 };
    } else {
      toast('那里过不去。');
    }
  }

  canvas.addEventListener('mousedown', e => { if (e.button === 0) handleTap(e.clientX, e.clientY); });
  canvas.addEventListener('mousemove', e => {
    hoverNpc = hitNpc(e.clientX, e.clientY);
    canvas.style.cursor = hoverNpc ? 'pointer' : 'default';
  });
  // —— 手机端触摸：短按（位移 <16px、时长 <700ms）视为点按 ——
  let touchStart = null;
  canvas.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, { passive: true });
  canvas.addEventListener('touchend', e => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const moved = Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y);
    if (moved < 16 && Date.now() - touchStart.t < 700) handleTap(t.clientX, t.clientY);
    touchStart = null;
  });
  canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  // =====================================================
  // 十一、对话面板
  // =====================================================
  const dlg = document.getElementById('dialog');
  const dlgName = document.getElementById('dlgName');
  const dlgText = document.getElementById('dlgText');
  document.getElementById('dlgClose').addEventListener('click', () => dlg.classList.add('hidden'));

  function openDialog(n) {
    dlgName.textContent = n.name;
    dlgText.textContent = n.talk;
    dlg.classList.remove('hidden');
    if (n.id === 'jieyin' && !quest.talkDone) {      // 对话任务 0/1 → 完成
      quest.talkDone = true;
      n.hasQuest = false;
      syncQuestUI();
    }
  }

  // =====================================================
  // 十二、任务 / 时辰 / Toast
  // =====================================================
  const quest = { talkDone: false, herb: 2, herbNeed: 3 };
  const itemTalk = document.getElementById('itemTalk');
  function syncQuestUI() {
    document.getElementById('qTalk').textContent = (quest.talkDone ? 1 : 0) + '/1';
    itemTalk.classList.toggle('done', quest.talkDone);
    document.getElementById('qHerb').textContent = quest.herb + '/' + quest.herbNeed;
  }
  syncQuestUI();

  const SHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const KE = ['一', '二', '三', '四', '五', '六', '七', '八'];
  let shiIdx = 7, keIdx = 1, clockT = 0;             // 起始：未时二刻
  const clockEl = document.getElementById('clock');
  function tickClock(dt) {
    clockT += dt;
    if (clockT < 20) return;                         // 每 20 秒推进一刻（纯氛围）
    clockT = 0; keIdx++;
    if (keIdx > 8) { keIdx = 1; shiIdx = (shiIdx + 1) % 12; }
    clockEl.textContent = SHI[shiIdx] + '时' + KE[keIdx - 1] + '刻';
  }

  const toastBox = document.getElementById('toast');
  function toast(msg) {
    const d = document.createElement('div');
    d.className = 'toastMsg'; d.textContent = msg;
    toastBox.appendChild(d);
    setTimeout(() => d.remove(), 2300);
  }

  // 技能格 / 功能按钮（占位交互）
  document.querySelectorAll('.skill').forEach((el, i) => {
    el.addEventListener('click', () =>
      toast('【' + el.querySelector('.skName').textContent + '】功能开发中（按键 ' + (i + 1) + '）'));
  });
  document.querySelectorAll('.func').forEach(el => {
    el.addEventListener('click', () => toast('【' + el.textContent + '】面板开发中'));
  });

  // =====================================================
  // 十三、主循环（requestAnimationFrame + deltaTime）
  // =====================================================
  function update(dt) {
    if (player.target) {
      const dx = player.target.mx - player.mx;
      const dy = player.target.my - player.my;
      const d = Math.hypot(dx, dy);
      if (d < 0.03) {                                  // 到达 → 停止
        player.mx = player.target.mx; player.my = player.target.my;
        player.target = null; player.walking = false;
      } else {
        const step = Math.min(d, player.speed * dt);
        const nx = player.mx + dx / d * step, ny = player.my + dy / d * step;
        const okX = canStand(nx, player.my), okY = canStand(player.mx, ny);   // 分轴碰撞
        if (okX) player.mx = nx;
        if (okY) player.my = ny;
        if (!okX && !okY) { player.target = null; player.walking = false; }
        else { player.walking = true; player.walkT += dt; player.face = (dx - dy) > 0 ? 1 : -1; }
      }
    } else player.walking = false;

    updateCamera(dt);
    tickClock(dt);
  }

  let frames = 0, last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);   // 钳制 dt，切后台不瞬移
    last = ts;
    time += dt;
    frames++;
    update(dt);
    render();
  }
  requestAnimationFrame(loop);

  /** 摄像机立即对准玩家（测试 / 调试用） */
  function snapCamera() {
    cameraX = W / 2 - (player.mx - player.my) * (TILE_W / 2);
    cameraY = H / 2 - (player.mx + player.my) * (TILE_H / 2);
  }

  // 素材缺失提示（不影响运行）
  setTimeout(() => {
    if (missing.length) console.info('[iso] 素材缺失，已回退占位绘制：', missing.join(', '));
  }, 1200);

  // 调试 / 自动化测试钩子（只读状态 + 确定性驱动，不依赖 rAF）
  window.__ISO__ = {
    get player() { return { mx: player.mx, my: player.my, target: player.target }; },
    get camera() { return { x: cameraX, y: cameraY }; },
    get frames() { return frames; },
    TILE_W, TILE_H,
    tap: handleTap,          // 模拟一次点按（屏幕坐标）
    step: update,            // 手动推进一帧逻辑
    snap: snapCamera,        // 摄像机立即对准玩家
  };
})();
