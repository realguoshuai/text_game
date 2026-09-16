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
 *   assets/tiles/decorations.png   国风装饰：横排 19 帧（96×96/帧）灯笼×2/石狮/水井/火盆/练功桩/石牌坊/武雕像/货摊/茶摊/灯笼串/幌子/货箱/荷塘/灵晶；0/1/2/10 帧已清空
 *   assets/char_blade.png          玩家四向行走帧表（6列×5行，64×64/格）
 *   assets/char_sword.png          商人 NPC 四向行走帧表
 *   assets/char_thunder.png        村民/弟子 NPC 四向行走帧表
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
    // 视角略抬高（整体缩小瓦片 ≈ 同屏可见更多地图面积），缓解建筑拥挤感
    TILE_W = small ? 44 : 56;
    TILE_H = small ? 22 : 28;
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
  const MAP_W = 36, MAP_H = 36;     // 扩大地图，给建筑留出开阔间距
  const map = [];
  for (let y = 0; y < MAP_H; y++) map.push(new Array(MAP_W).fill(0));

  function fill(x0, y0, w, h, v) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) map[y][x] = v;
  }

  fill(13, 13, 12, 12, 2);   // 中央广场（石板）
  fill(0, 17, 36, 2, 2);     // 横向主街（贯穿东西）
  fill(17, 0, 2, 36, 2);     // 纵向主街（贯穿南北）

  // —— 建筑：四角主楼 + 沿街小铺，拉开间距降低密度
  //   frame 对应 buildings.png 横排 6 帧（256×224/帧）：0接引台 1聚宝阁 2丹房 3器坊 4沿街铺 5临街铺
  const buildings = [
    { x: 3,  y: 3,  w: 5, h: 4, h3d: 46, frame: 0, name: '接引台', roof: '#4a5a7a' },
    { x: 28, y: 3,  w: 5, h: 4, h3d: 46, frame: 1, name: '聚宝阁', roof: '#7a6a2e' },
    { x: 3,  y: 28, w: 5, h: 4, h3d: 46, frame: 2, name: '丹  房', roof: '#8a3b2e' },
    { x: 28, y: 28, w: 5, h: 4, h3d: 46, frame: 3, name: '器  坊', roof: '#4a6a4a' },
    { x: 9,  y: 15, w: 3, h: 2, h3d: 40, frame: 4, name: '沿街铺', roof: '#5a4a38' },
    { x: 20, y: 9,  w: 3, h: 2, h3d: 40, frame: 5, name: '临街铺', roof: '#5a4a38' },
  ];
  buildings.forEach(b => fill(b.x, b.y, b.w, b.h, 1));

  // —— 装饰物：国风道具（帧表见 DECOR_FRAME）
  //   实体道具（石狮/水井/火盆/木桩/像/货摊等）所在格标 1 不可穿行；灯笼挂空中、牌坊可穿行
  const props = [
    // 灯笼（悬挂，可穿行）
    { x: 15, y: 11, kind: 'lantern' }, { x: 21, y: 11, kind: 'lantern' },
    { x: 15, y: 25, kind: 'lantern' }, { x: 21, y: 25, kind: 'lantern' },
    { x: 11, y: 18, kind: 'lantern' }, { x: 25, y: 18, kind: 'lantern' },
    { x: 14, y: 16, kind: 'lanternY' },{ x: 22, y: 16, kind: 'lanternY' },
    // 石狮（建筑前，实心）
    { x: 5,  y: 8,  kind: 'lion' }, { x: 6,  y: 8,  kind: 'lion' },
    { x: 29, y: 8,  kind: 'lion' }, { x: 30, y: 8,  kind: 'lion' },
    // 广场火盆 / 武雕像（实心）
    { x: 17, y: 18, kind: 'brazier' }, { x: 19, y: 18, kind: 'brazier' }, { x: 18, y: 22, kind: 'brazier' },
    { x: 18, y: 19, kind: 'statue' },
    // 器坊前练功桩（实心）
    { x: 27, y: 29, kind: 'dummy' }, { x: 27, y: 31, kind: 'dummy' },
    // 丹房旁水井 / 荷塘（实心）
    { x: 8,  y: 30, kind: 'well' },
    { x: 5,  y: 22, kind: 'pond' },
    // 布棚货摊 / 茶摊（实心）
    { x: 26, y: 9,  kind: 'stall' },
    { x: 9,  y: 29, kind: 'tea' },
    // 灯笼串（沿街，实心）
    { x: 10, y: 17, kind: 'string' }, { x: 26, y: 17, kind: 'string' },
    { x: 18, y: 10, kind: 'string' }, { x: 18, y: 26, kind: 'string' },
    // 货箱 / 灵晶（实心）
    { x: 16, y: 22, kind: 'crates' }, { x: 20, y: 22, kind: 'crates' },
    { x: 12, y: 18, kind: 'crystal' },{ x: 24, y: 18, kind: 'crystal' },
    // 东街石牌坊（可穿行）
    { x: 34, y: 18, kind: 'gate' },
  ];
  const SOLID_PROPS = new Set(['lion', 'well', 'brazier', 'dummy', 'statue', 'stall', 'tea', 'string', 'crates', 'pond', 'crystal']);
  props.forEach(p => { map[p.y][p.x] = SOLID_PROPS.has(p.kind) ? 1 : 2; });

  // =====================================================
  // 三、NPC 与玩家
  // =====================================================
  //  sprite 对应 ASSETS 键名；素材缺失时自动用彩色占位小人
  const npcs = [
    { id: 'jieyin', name: '接引弟子', mx: 10.5, my: 9.5, color: '#7fc4ff',
      sprite: 'npcVillager', face: 'down', hasQuest: true,
      talk: '可是来拜师的？青玄宗收徒有规矩：先寻引路之人，再过问心阶。\n（任务：与接引弟子对话 0/1 —— 你已完成对话，可去丹房、器坊一带转转。）' },
    { id: 'shangren', name: '灵石商人', mx: 24.5, my: 9.5, color: '#8fd3ff',
      sprite: 'npcMerchant', face: 'left', hasQuest: false,
      talk: '灵石通万物，道友可要换些丹药符箓？\n（此处为商店占位，日后接背包与交易面板。）' },
    { id: 'zayi', name: '杂役弟子', mx: 10.5, my: 30.5, color: '#9fd48a',
      sprite: 'npcVillager', face: 'down', hasQuest: false,
      talk: '（擦汗）丹房今日要三株灵药，我采了两株，还差一株……\n（任务：采集灵药 2/3）' },
    { id: 'hedaozhang', name: '何道长', mx: 31.5, my: 25.5, color: '#c9a0dc',
      sprite: 'npcVillager', face: 'right', hasQuest: true,
      talk: '贫道观你印堂微暗，近日不宜远行。\n（任务：求得一道护身符，可去找灵石商人。）' },
    { id: 'baifashi', name: '摆法师', mx: 18.5, my: 15.5, color: '#e0c068',
      sprite: 'npcMerchant', face: 'down', hasQuest: false,
      talk: '占一卦三枚灵石——今日宜静不宜动，宜东南，忌西北。' },
  ];

  const player = {
    mx: 18.5, my: 21.5,
    target: null,           // {mx,my} 目标点；null = 停止
    speed: 3.0,             // 格/秒
    face: 'up', walking: false, walkT: 0,
  };

  // =====================================================
  // 四、素材加载（失败自动回退占位符）
  // =====================================================
  const ASSETS = {
    ground:       'assets/tiles/ground.png',
    buildings:    'assets/tiles/buildings.png',
    decorations:  'assets/tiles/decorations.png',
    player:       'assets/char_blade.png',
    npcMerchant:  'assets/char_sword.png',
    npcVillager:  'assets/char_thunder.png',
    uiIcons:      'assets/ui/icons.png',
    uiAvatar:     'assets/ui/avatar.png',
    backdrop:      'assets/backdrop.png',
  };
  const SPR = {};                       // 只放「加载成功」的图片
  const SHEETS = {                        // 角色 sprite sheet 布局（6列×5行，64×64/格）
    player:      { cols: 6, rows: 5, cellW: 64, cellH: 64, frames: 6, dir: { down: 0, right: 1, left: 2, up: 3 } },
    npcMerchant: { cols: 6, rows: 5, cellW: 64, cellH: 64, frames: 6, dir: { down: 0, right: 1, left: 2, up: 3 } },
    npcVillager: { cols: 6, rows: 5, cellW: 64, cellH: 64, frames: 6, dir: { down: 0, right: 1, left: 2, up: 3 } },
  };
  const missing = [];
  Object.keys(ASSETS).forEach(key => {
    const img = new Image();
    img.onload = () => { SPR[key] = img; applyUiSkins(); };
    img.onerror = () => { missing.push(ASSETS[key]); };   // 静默失败 → 占位绘制
    img.src = ASSETS[key];
  });

  /** UI 底板 / 技能图标 / 头像存在时铺到对应元素（icons 是 4 格横排，按格取位） */
  function applyUiSkins() {
    // 面板背景交由 CSS 控制（高清暗金半透明 + 发光描边），不再铺贴图
    if (SPR.uiIcons) {
      document.querySelectorAll('.skill').forEach((el, i) => {
        el.style.backgroundImage = 'url(' + ASSETS.uiIcons + ')';
        el.style.backgroundSize = '400% 100%';                // 4 格横排
        el.style.backgroundPosition = (i * 100 / 3) + '% 0%'; // 0% 33.3% 66.7% 100%
      });
    }
    if (SPR.uiAvatar) {
      document.getElementById('avatar').style.backgroundImage = 'url(' + ASSETS.uiAvatar + ')';
      document.getElementById('avatar').style.backgroundSize = 'cover';
      document.getElementById('avatar').style.backgroundPosition = 'center top';
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
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 1;   // 地图外视作障碍，防止走出地图
    return map[Math.floor(y)][Math.floor(x)];
  }
  /** 仅用于渲染：地图外按野外土地显示，保证地面铺满整屏不留黑边 */
  function tileVisual(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 0;
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
  // 地面变体：ground.png 横向 12 帧（每帧 64×64 源 tile，绘制时压成 64×32 菱形）
  const GROUND_FRAMES = 12, GTILE_W = 64, GTILE_H = 64;
  /** 地面：ground.png 横向 12 帧（随机选帧消除规律重复）；无素材则画纯色菱形 */
  function drawGroundTile(tx, ty) {
    const v = tileVisual(tx, ty);
    const p = isoToScreen(tx, ty);                 // 菱形上顶点
    if (p.x < -TILE_W || p.x > W + TILE_W || p.y < -TILE_H * 4 || p.y > H + TILE_H * 4) return; // 视口裁剪

    if (SPR.ground) {
      // 伪随机选帧，消除平铺规律感；石板格（v===2）取后 4 帧更整齐
      const h = (tx * 73 + ty * 31) >>> 0;
      const fi = (v === 2) ? 8 + (h % 4) : h % 8;
      const sx = (fi % GROUND_FRAMES) * GTILE_W;
      ctx.drawImage(SPR.ground, sx, 0, GTILE_W, GTILE_H, p.x - HW, p.y, TILE_W, TILE_H);
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

  /** 建筑：buildings.png 横排 4 帧（256×224/帧，AI 夜景商铺）；无素材画等距立体盒子 */
  const BLD_FW = 256, BLD_FH = 224;
  function drawBuilding(b) {
    const A = isoToScreen(b.x, b.y);
    const C = isoToScreen(b.x + b.w, b.y + b.h);
    const cx = (A.x + C.x) / 2, bottomY = C.y;
    let dw = (b.w + b.h) * HW * 0.86;
    let dh = dw * (BLD_FH / BLD_FW);            // 保持素材宽高比

    // 落地投影：覆盖建筑占地范围的半透明菱形阴影
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    const sw = (b.w + b.h) * HW * 0.96, sh = (b.w + b.h) * HH * 0.92;
    ctx.beginPath();
    ctx.moveTo(cx, bottomY - sh);
    ctx.lineTo(cx + sw, bottomY);
    ctx.lineTo(cx, bottomY + sh);
    ctx.lineTo(cx - sw, bottomY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (SPR.buildings) {
      ctx.drawImage(SPR.buildings, (b.frame || 0) * BLD_FW, 0, BLD_FW, BLD_FH,
        cx - dw / 2, bottomY - dh, dw, dh);
    } else {
      const B = isoToScreen(b.x + b.w, b.y);
      const D = isoToScreen(b.x, b.y + b.h);
      const hgt = b.h3d;
      dw = (b.w + b.h) * HW * 0.86;             // 占位盒仍按占地比例
      dh = (b.w + b.h) * HH * 0.92 + hgt;
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

  /** 装饰：decorations.png 横排 19 帧（96×96/帧）；0/1/2/10/15 帧已清空，无素材画占位
   *  帧表：3红灯笼 4黄灯笼 5石狮 6水井 7火盆 8练功桩 9石牌坊 11武雕像 12货摊 13茶摊 14灯笼串 16货箱 17荷塘 18灵晶 */
  const DECOR_FRAME = { lantern: 3, lanternY: 4, lion: 5, well: 6, brazier: 7, dummy: 8, gate: 9, statue: 11, stall: 12, tea: 13, string: 14, crates: 16, pond: 17, crystal: 18 };
  const DECOR_SCALE = { lantern: 0.9, lanternY: 0.9, lion: 1.0, well: 1.05, brazier: 0.85, dummy: 0.95, gate: 1.6, statue: 1.05, stall: 1.7, tea: 1.55, string: 1.5, crates: 1.0, pond: 2.4, crystal: 0.9 };
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

  /** 角色：sprite sheet 四向行走动画（64×64/格），缺失则回退占位小人 */
  function drawCharacter(o, isPlayer, time) {
    const s = isoToScreen(o.mx, o.my);
    if (s.x < -90 || s.x > W + 90 || s.y < -160 || s.y > H + 90) return;
    const moving = isPlayer && o.walking;          // 仅玩家移动时播放行走动画
    const bob = moving ? Math.abs(Math.sin(o.walkT * 10)) * 3 : 0;   // NPC / 静止玩家：不原地晃动
    const baseY = s.y - bob;
    const key = isPlayer ? 'player' : o.sprite;
    const img = SPR[key];
    const cfg = SHEETS[key];

    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 12, 5, 0, 0, Math.PI * 2); ctx.fill();

    if (img && cfg) {
      const dh = TILE_H * 2.4;
      const dw = dh * (cfg.cellW / cfg.cellH);
      const dirRow = cfg.dir[o.face] ?? 0;
      // 静止时固定用第 0 帧（站立姿势），避免 NPC/玩家原地踏步
      const frame = moving ? Math.floor(o.walkT * 6) % cfg.frames : 0;
      const sx = frame * cfg.cellW;
      const sy = dirRow * cfg.cellH;
      ctx.drawImage(img, sx, sy, cfg.cellW, cfg.cellH, s.x - dw / 2, baseY - dh + 4, dw, dh);
    } else if (img) {
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
      const faceSign = (o.face === 'left') ? -1 : 1;
      ctx.fillRect(s.x + (isPlayer ? faceSign * 2 : -2), baseY - 27, 2, 2);
      ctx.fillRect(s.x + (isPlayer ? faceSign * 2 + 4 : 2), baseY - 27, 2, 2);
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

    // 1) 地面：按视口四角反算瓦片范围（含地图外沿），铺满整屏不留黑边
    const cA = screenToIso(-TILE_W, -TILE_H * 2), cB = screenToIso(W + TILE_W, -TILE_H * 2);
    const cC = screenToIso(-TILE_W, H + TILE_H * 2), cD = screenToIso(W + TILE_W, H + TILE_H * 2);
    const gx0 = Math.floor(Math.min(cA.mx, cB.mx, cC.mx, cD.mx)) - 1;
    const gx1 = Math.ceil(Math.max(cA.mx, cB.mx, cC.mx, cD.mx)) + 1;
    const gy0 = Math.floor(Math.min(cA.my, cB.my, cC.my, cD.my)) - 1;
    const gy1 = Math.ceil(Math.max(cA.my, cB.my, cC.my, cD.my)) + 1;
    for (let y = gy0; y <= gy1; y++)
      for (let x = gx0; x <= gx1; x++) drawGroundTile(x, y);

    // 1.5) 地图底图（地面之上、建筑/角色之下）：AI 场景铺作地形
    //      世界坐标锁定：以地图中心为锚点 cover 铺满地图屏占范围，随镜头一起滚动；
    //      素材缺失时不绘制，自动回退到原石砖地面。
    if (SPR.backdrop) {
      const bw = SPR.backdrop.width, bh = SPR.backdrop.height;
      const mapW = (MAP_W + MAP_H) * HW, mapH = (MAP_W + MAP_H) * HH;
      const bscale = Math.max(mapW / bw, mapH / bh);
      const bdw = bw * bscale, bdh = bh * bscale;
      const ctr = isoToScreen(MAP_W / 2, MAP_H / 2);
      ctx.drawImage(SPR.backdrop, ctr.x - bdw / 2, ctr.y - bdh / 2, bdw, bdh);
    }

    const draws = [];
    buildings.forEach(b => draws.push({
      key: (b.x + b.w - 1) + (b.y + b.h - 1) + 0.5,   // 立体建筑取最前角做键
      fn: () => drawBuilding(b)
    }));
    props.forEach(p => draws.push({ key: p.x + p.y + 0.4, fn: () => drawProp(p) }));
    npcs.forEach(n => draws.push({ key: n.mx + n.my, fn: () => drawCharacter(n, false, time) }));
    draws.push({ key: player.mx + player.my, fn: () => drawCharacter(player, true, time) });

    draws.sort((a, b) => a.key - b.key).forEach(d => d.fn());

    // —— 夜景氛围：先整体压暗（蓝夜幕），再在光源处叠加暖光晕（加色混合，预渲染光斑，弱机友好） ——
    ctx.fillStyle = 'rgba(14,20,48,0.34)';
    ctx.fillRect(0, 0, W, H);
    if (glowCv) {
      ctx.globalCompositeOperation = 'lighter';
      for (const L of lights) {
        const s = isoToScreen(L.mx, L.my);
        if (s.x < -160 || s.x > W + 160 || s.y < -160 || s.y > H + 160) continue;
        const R = 80 * L.r;
        ctx.globalAlpha = 0.62 + 0.14 * Math.sin(time * 6 + L.mx * 3.1);   // 烛光轻微闪烁
        ctx.drawImage(glowCv, s.x - R, s.y - R - 10, R * 2, R * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    drawMinimap();
  }

  // 光源表：灯笼/火盆 + 各建筑窗光（一次性构建）
  const lights = [];
  props.forEach(p => {
    if (p.kind === 'lantern' || p.kind === 'lanternY' || p.kind === 'string') lights.push({ mx: p.x + 0.5, my: p.y + 0.3, r: 0.85 });
    if (p.kind === 'brazier') lights.push({ mx: p.x + 0.5, my: p.y + 0.5, r: 1.0 });
  });
  buildings.forEach(b => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    lights.push({ mx: cx, my: cy + 0.4, r: 1.7 });
    lights.push({ mx: cx - b.w * 0.22, my: cy + b.h * 0.42, r: 1.1 });
  });
  // 预渲染暖光斑（径向渐变，一次生成）
  const glowCv = document.createElement('canvas');
  glowCv.width = glowCv.height = 160;
  (() => {
    const g = glowCv.getContext('2d');
    const grad = g.createRadialGradient(80, 80, 4, 80, 80, 78);
    grad.addColorStop(0, 'rgba(255,190,110,0.50)');
    grad.addColorStop(0.4, 'rgba(255,160,70,0.20)');
    grad.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 160, 160);
  })();

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
        else {
          player.walking = true; player.walkT += dt;
          // 屏幕坐标投影：sx = dx - dy, sy = dx + dy，取主方向
          const sx = dx - dy, sy = dx + dy;
          if (Math.abs(sy) > Math.abs(sx)) {
            player.face = sy > 0 ? 'down' : 'up';
          } else {
            player.face = sx > 0 ? 'right' : 'left';
          }
        }
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
    render: render,          // 手动渲染一帧（测试采样画布像素用）
  };
})();
