/* =========================================================
 * js/iso.js —— 等距视角（Isometric 45°）国风修仙坊市
 *
 * 纯 HTML5 Canvas 2D + Vanilla JS，零依赖、零构建。无战斗、无怪物。
 * 功能：等距地图渲染 / 深度排序 / 摄像机平滑跟随 / 点击移动 / 点击 NPC 对话 / UI 覆盖层
 *
 * 【替换为真实美术素材的方法】（暂时用纯色占位）
 *  1) 素材推荐（均为 CC0 可商用）：
 *     - Kenney：https://kenney.nl/assets （等距地砖 / 城市建筑包）
 *     - OpenGameArt：https://opengameart.org （搜 "isometric town"）
 *     - Summer Engine：itch.io 上的免费像素等距包
 *  2) 加载 Sprite Sheet（见代码底部 loadSpriteSheet 注释处）：
 *       const sheet = new Image(); sheet.src = 'assets/iso_tiles.png';
 *     加载完成后：地面用 ctx.drawImage(sheet, sx, sy, TILE_W, TILE_H, dx, dy, TILE_W, TILE_H)
 *     替换 drawGroundTile() 中的菱形填充；
 *  3) 角色：把 drawCharacter() 里的占位圆形换成
 *       ctx.drawImage(charSheet, frame*fw, dir*fh, fw, fh, x-fw/2, y-fh, fw, fh)
 *     待机动画帧号：frame = Math.floor(time * 6) % 4（4 帧循环）
 * ========================================================= */
(() => {
  'use strict';

  // =====================================================
  // 一、画布与常量
  // =====================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;   // 像素素材时保持锐利
  }
  window.addEventListener('resize', resize);
  resize();

  // 等距瓦片尺寸：宽高比 2:1 是标准 45° 等距
  const TILE_W = 64, TILE_H = 32;
  const HW = TILE_W / 2, HH = TILE_H / 2;
  const MAP_W = 22, MAP_H = 22;

  // =====================================================
  // 二、地图数据（二维数组）
  //  0 = 土地（可走）  1 = 建筑/障碍（不可走）  2 = 石板路（可走）  3 = 景物占位（不可走，图上放树/灯笼）
  // =====================================================
  const map = [];
  for (let y = 0; y < MAP_H; y++) map.push(new Array(MAP_W).fill(0));

  /** 把矩形区域填成指定地块类型 */
  function fill(x0, y0, w, h, v) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) map[y][x] = v;
      }
    }
  }

  // —— 中央广场 + 十字主街 ——
  fill(8, 8, 6, 6, 2);        // 广场
  fill(1, 10, 20, 2, 2);      // 横向主街
  fill(10, 1, 2, 20, 2);      // 纵向主街

  // —— 建筑：占地图为 1（不可走），并登记到 buildings 用于绘制 3D 盒子 ——
  //  {x, y, w, h} 为占地块的左上角与尺寸；h3d 为立体高度（像素）；name 为匾额
  const buildings = [
    { x: 3,  y: 3,  w: 5, h: 4, h3d: 46, name: '接引台',  roof: '#4a5a7a' },
    { x: 14, y: 3,  w: 5, h: 4, h3d: 46, name: '聚宝阁',  roof: '#7a6a2e' },
    { x: 3,  y: 14, w: 5, h: 4, h3d: 46, name: '丹  房',  roof: '#8a3b2e' },
    { x: 14, y: 14, w: 5, h: 4, h3d: 46, name: '器  坊',  roof: '#4a6a4a' },
  ];
  buildings.forEach(b => fill(b.x, b.y, b.w, b.h, 1));

  // —— 景物（树 / 灯笼）：地块标 3（不可走），仅作装饰与遮挡 ——
  const props = [
    { x: 5,  y: 8,  kind: 'tree' }, { x: 5,  y: 13, kind: 'tree' },
    { x: 16, y: 8,  kind: 'tree' }, { x: 16, y: 13, kind: 'tree' },
    { x: 7,  y: 18, kind: 'tree' }, { x: 14, y: 18, kind: 'tree' },
    { x: 6,  y: 5,  kind: 'tree' }, { x: 15, y: 5,  kind: 'tree' },
    { x: 9,  y: 7,  kind: 'lantern' }, { x: 12, y: 7, kind: 'lantern' },
    { x: 9,  y: 15, kind: 'lantern' }, { x: 12, y: 15, kind: 'lantern' },
    { x: 7,  y: 9,  kind: 'lantern' }, { x: 14, y: 9, kind: 'lantern' },
  ];
  props.forEach(p => { if (map[p.y][p.x] === 0) map[p.y][p.x] = 3; });

  // =====================================================
  // 三、NPC 与玩家
  // =====================================================
  //   mx/my 为浮点地图坐标；hasQuest 决定头顶是否显示黄色感叹号
  const npcs = [
    { id: 'jieyin', name: '接引弟子', mx: 10.5, my: 6.5, color: '#7fc4ff', hasQuest: true,
      talk: '可是来拜师的？青玄宗收徒有规矩：先寻引路之人，再过问心阶。\n（任务：往广场中央寻杂役弟子问话，或先在坊市走动熟悉地形。）' },
    { id: 'shangren', name: '灵石商人', mx: 13.5, my: 8.5, color: '#8fd3ff', hasQuest: false,
      talk: '灵石通万物，道友可要换些丹药符箓？\n（此处为商店占位，日后接背包与交易面板。）' },
    { id: 'zayi', name: '杂役弟子', mx: 6.5, my: 12.5, color: '#9fd48a', hasQuest: false,
      talk: '（擦汗）丹房今日要三株灵药，我采了两株，还差一株……\n（任务：采集灵药 2/3）' },
    { id: 'hedaozhang', name: '何道长', mx: 16.5, my: 11.5, color: '#c9a0dc', hasQuest: true,
      talk: '贫道观你印堂微暗，近日不宜远行。\n（任务：求得一道护身符，可去找灵石商人。）' },
    { id: 'baifashi', name: '摆法师', mx: 7.5, my: 8.5, color: '#e0c068', hasQuest: false,
      talk: '占一卦三枚灵石——今日宜静不宜动，宜东南，忌西北。' },
  ];

  const player = {
    mx: 10.5, my: 12.5,          // 当前地图坐标（浮点）
    target: null,                // 目标地图坐标 {mx,my}，null = 停止
    speed: 3.2,                  // 移动速度：格/秒
    face: 1,                     // 朝向：1 右 / -1 左
    walking: false, walkT: 0,
  };

  // =====================================================
  // 四、坐标转换（等距核心）
  // =====================================================
  // 摄像机：屏幕空间偏移量（cam.x/cam.y），平滑跟随玩家
  const cam = { x: 0, y: 0 };

  /** 地图坐标 → 未加摄像机偏移的屏幕坐标（即用户给出的标准公式） */
  function isoBase(mx, my) {
    return {
      x: (mx - my) * (TILE_W / 2) + canvas.width / 2,
      y: (mx + my) * (TILE_H / 2) + canvas.height / 4,
    };
  }

  /** 地图坐标 → 屏幕坐标（扣除摄像机偏移） */
  function isoToScreen(mx, my) {
    const b = isoBase(mx, my);
    return { x: b.x - cam.x, y: b.y - cam.y };
  }

  /** 屏幕坐标 → 地图坐标（等距逆向转换）
   *  推导：base.x - W/2 = (mx-my)*HW  →  A = mx - my
   *        base.y - H/4 = (mx+my)*HH  →  B = mx + my
   *        则 mx = (A + B)/2,  my = (B - A)/2
   */
  function screenToIso(sx, sy) {
    const bx = sx + cam.x, by = sy + cam.y;   // 先还原成未偏移的坐标
    const A = (bx - canvas.width / 2) / HW;
    const B = (by - canvas.height / 4) / HH;
    return { mx: (A + B) / 2, my: (B - A) / 2 };
  }

  /** 摄像机平滑跟随：目标 = 玩家所在屏幕位置拉回画面中心，指数插值（帧率无关） */
  function updateCamera(dt) {
    const p = isoBase(player.mx, player.my);
    const tx = p.x - canvas.width / 2;
    const ty = p.y - canvas.height / 2;
    const k = 1 - Math.exp(-6 * dt);          // 平滑系数，越大跟得越紧
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }

  // =====================================================
  // 五、可行走判定与移动
  // =====================================================
  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 1;
    return map[Math.floor(y)][Math.floor(x)];
  }
  /** 该点能否站立：所在格与四周 0.25 格采样点都必须是可走地块（0/2） */
  function canStand(mx, my) {
    const pts = [[mx, my], [mx - .25, my], [mx + .25, my], [mx, my - .25], [mx, my + .25]];
    return pts.every(([x, y]) => { const t = tileAt(x, y); return t === 0 || t === 2; });
  }

  // =====================================================
  // 六、绘制
  // =====================================================
  /** 绘制单块菱形瓦片（占位：纯色；替换为素材时改用 drawImage） */
  function drawGroundTile(tx, ty) {
    const v = map[ty][tx];
    const p = isoToScreen(tx, ty);                     // p 为菱形上顶点
    if (p.x < -TILE_W || p.x > W + TILE_W || p.y < -TILE_H * 3 || p.y > H + TILE_H * 3) return; // 视口裁剪

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);                              // 上
    ctx.lineTo(p.x + HW, p.y + HH);                    // 右
    ctx.lineTo(p.x, p.y + TILE_H);                     // 下
    ctx.lineTo(p.x - HW, p.y + HH);                    // 左
    ctx.closePath();

    if (v === 2) ctx.fillStyle = ((tx + ty) % 2 === 0) ? '#8a8272' : '#7f7868';   // 石板路
    else if (v === 1) ctx.fillStyle = '#5a4a38';                                   // 建筑地基
    else ctx.fillStyle = ((tx + ty) % 2 === 0) ? '#6a5a42' : '#63543d';            // 土地
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** 绘制等距立体盒子（建筑）：顶面菱形 + 左右两个侧面，形成 3D 体积感 */
  function drawIsoBox(b) {
    const A = isoToScreen(b.x, b.y);                    // 远角（最上）
    const B = isoToScreen(b.x + b.w, b.y);              // 右角
    const C = isoToScreen(b.x + b.w, b.y + b.h);        // 近角（最下）
    const D = isoToScreen(b.x, b.y + b.h);              // 左角
    const hgt = b.h3d;

    // 左侧面（D→C）
    ctx.fillStyle = '#4a3c2c';
    ctx.beginPath();
    ctx.moveTo(D.x, D.y); ctx.lineTo(C.x, C.y);
    ctx.lineTo(C.x, C.y - hgt); ctx.lineTo(D.x, D.y - hgt);
    ctx.closePath(); ctx.fill();

    // 右侧面（C→B）
    ctx.fillStyle = '#5c4a36';
    ctx.beginPath();
    ctx.moveTo(C.x, C.y); ctx.lineTo(B.x, B.y);
    ctx.lineTo(B.x, B.y - hgt); ctx.lineTo(C.x, C.y - hgt);
    ctx.closePath(); ctx.fill();

    // 顶面（抬高 hgt）
    ctx.fillStyle = b.roof;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y - hgt); ctx.lineTo(B.x, B.y - hgt);
    ctx.lineTo(C.x, C.y - hgt); ctx.lineTo(D.x, D.y - hgt);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; ctx.stroke();

    // 屋面中脊 + 匾额
    const topC = { x: (A.x + C.x) / 2, y: (A.y + C.y) / 2 - hgt };
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.moveTo(topC.x - HW * b.w / 2, topC.y); ctx.lineTo(topC.x + HW * b.w / 2, topC.y); ctx.stroke();
    ctx.fillStyle = '#ffd75e';
    ctx.font = 'bold 15px Microsoft YaHei';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, (A.x + C.x) / 2, (A.y + C.y) / 2 - hgt - 6);

    // 门口（近角处的小暗块）
    ctx.fillStyle = 'rgba(20,14,8,.8)';
    ctx.beginPath();
    ctx.moveTo(C.x - 10, C.y - 4); ctx.lineTo(C.x, C.y - 8);
    ctx.lineTo(C.x + 10, C.y - 4); ctx.lineTo(C.x, C.y + 2);
    ctx.closePath(); ctx.fill();
  }

  /** 绘制景物（树 / 灯笼）占位图形 */
  function drawProp(p) {
    const s = isoToScreen(p.x + 0.5, p.y + 0.5);
    if (s.x < -60 || s.x > W + 60 || s.y < -120 || s.y > H + 60) return;
    if (p.kind === 'tree') {
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

  /** 绘制角色（玩家/NPC 通用占位：影子 + 袍身 + 头 + 发髻 + 头顶名字/感叹号） */
  function drawCharacter(o, isPlayer, time) {
    const s = isoToScreen(o.mx, o.my);
    if (s.x < -80 || s.x > W + 80 || s.y < -140 || s.y > H + 80) return;

    // 走路时的上下起伏（占位动画；接真素材时改为帧动画）
    const bob = (isPlayer && o.walking) ? Math.abs(Math.sin(o.walkT * 10)) * 3 : Math.sin(time * 2 + o.mx) * 1.2;
    const baseY = s.y - bob;

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 12, 5, 0, 0, Math.PI * 2); ctx.fill();

    // 袍身（梯形）
    ctx.fillStyle = isPlayer ? '#3a5a7a' : o.color;
    ctx.beginPath();
    ctx.moveTo(s.x - 9, baseY); ctx.lineTo(s.x - 7, baseY - 20);
    ctx.lineTo(s.x + 7, baseY - 20); ctx.lineTo(s.x + 9, baseY);
    ctx.closePath(); ctx.fill();

    // 头 + 发髻 + 眼
    ctx.fillStyle = '#e8c8a0';
    ctx.beginPath(); ctx.arc(s.x, baseY - 26, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2018';
    ctx.beginPath(); ctx.arc(s.x, baseY - 30, 5.5, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(s.x - 2, baseY - 36, 4, 4);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(s.x + (isPlayer ? o.face * 2 : -2), baseY - 27, 2, 2);
    ctx.fillRect(s.x + (isPlayer ? o.face * 2 + 4 : 2), baseY - 27, 2, 2);

    // 头顶名字
    ctx.textAlign = 'center';
    ctx.font = '12px Microsoft YaHei';
    ctx.fillStyle = isPlayer ? '#ffe9b3' : '#e8dcc0';
    ctx.fillText(isPlayer ? '逍遥长生' : o.name, s.x, baseY - 44);

    // 任务感叹号：黄色、上下浮动
    if (!isPlayer && o.hasQuest) {
      const b = Math.sin(time * 4) * 3;
      ctx.font = 'bold 20px Microsoft YaHei';
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('!', s.x, baseY - 52 + b);
    }
    // 鼠标靠近 NPC 时的提示
    if (!isPlayer && hoverNpc === o) {
      ctx.font = '11px Microsoft YaHei';
      ctx.fillStyle = '#9fd48a';
      ctx.fillText('点击交谈', s.x, baseY - 66);
    }
  }

  // =====================================================
  // 七、渲染主流程（含深度排序）
  // =====================================================
  let time = 0, hoverNpc = null;

  function render() {
    ctx.fillStyle = '#14100b';
    ctx.fillRect(0, 0, W, H);

    // 1) 地面：按 y、x 双重循环铺菱形（地砖互不重叠，无需严格排序）
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) drawGroundTile(x, y);
    }

    // 2) 深度排序：把建筑 / 景物 / NPC / 玩家放进同一数组，按 (mapX + mapY) 升序绘制
    //    值越小越"远"，先画；值越大越"近"，后画 —— 于是近处的实体自然遮住远处的建筑。
    //    建筑是立体盒子，用它的"最前角"(x+w-1)+(y+h-1) 作为排序键更符合观感。
    const draws = [];
    buildings.forEach(b => draws.push({
      key: (b.x + b.w - 1) + (b.y + b.h - 1) + 0.5,
      fn: () => drawIsoBox(b)
    }));
    props.forEach(p => draws.push({ key: p.x + p.y + 0.4, fn: () => drawProp(p) }));
    npcs.forEach(n => draws.push({ key: n.mx + n.my, fn: () => drawCharacter(n, false, time) }));
    draws.push({ key: player.mx + player.my, fn: () => drawCharacter(player, true, time) });

    draws.sort((a, b) => a.key - b.key).forEach(d => d.fn());

    drawMinimap();
  }

  // =====================================================
  // 八、小地图（占位：俯视方格，日后可换成真实小地图贴图）
  // =====================================================
  const mm = document.getElementById('minimap');
  const mctx = mm.getContext('2d');
  const CELL = 6;
  function drawMinimap() {
    mctx.fillStyle = '#2a3a24';
    mctx.fillRect(0, 0, mm.width, mm.height);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const v = map[y][x];
        mctx.fillStyle = v === 1 ? '#6a5a42' : v === 2 ? '#8a8272' : v === 3 ? '#3c5e30' : '#4a4230';
        mctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    npcs.forEach(n => { mctx.fillStyle = '#ffd75e'; mctx.fillRect(n.mx * CELL - 2, n.my * CELL - 2, 4, 4); });
    mctx.fillStyle = '#ffffff';
    mctx.fillRect(player.mx * CELL - 2.5, player.my * CELL - 2.5, 5, 5);
  }

  // =====================================================
  // 九、交互：点击移动 / 点击 NPC
  // =====================================================
  /** 命中的 NPC：用屏幕坐标做距离检测（简单可靠，等距下同样适用） */
  function hitNpc(sx, sy) {
    let best = null, bestY = -Infinity;
    npcs.forEach(n => {
      const p = isoToScreen(n.mx, n.my);
      const dx = sx - p.x;
      const dy = sy - (p.y - 26);         // NPC 身体中心大约在脚点上方的 26px
      if (dx * dx + dy * dy < 30 * 30 && p.y > bestY) { best = n; bestY = p.y; }  // 重叠时取靠前（屏幕更下方）的
    });
    return best;
  }

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;

    // —— 优先级 1：点到 NPC → 停止移动 + 开对话（不再触发寻路） ——
    const n = hitNpc(sx, sy);
    if (n) {
      player.target = null;
      player.walking = false;
      openDialog(n);
      return;
    }

    // —— 优先级 2：点到地面 → 逆向换算成地图坐标并寻路 ——
    const t = screenToIso(sx, sy);
    const tx = Math.floor(t.mx), ty = Math.floor(t.my);
    const tile = tileAt(tx + 0.5, ty + 0.5);
    if (tile === 0 || tile === 2) {
      player.target = { mx: tx + 0.5, my: ty + 0.5 };   // 走到格子中心
    } else {
      toast('那里过不去。');
    }
  });

  // 鼠标悬停高亮 NPC（仅提示，不改变移动逻辑）
  canvas.addEventListener('mousemove', e => {
    hoverNpc = hitNpc(e.clientX, e.clientY);
    canvas.style.cursor = hoverNpc ? 'pointer' : 'default';
  });

  // =====================================================
  // 十、对话面板
  // =====================================================
  const dlg = document.getElementById('dialog');
  const dlgName = document.getElementById('dlgName');
  const dlgText = document.getElementById('dlgText');
  document.getElementById('dlgClose').addEventListener('click', () => {
    dlg.classList.add('hidden');
  });

  function openDialog(n) {
    dlgName.textContent = n.name;
    dlgText.textContent = n.talk;
    dlg.classList.remove('hidden');

    // 任务：与接引弟子对话 → 进度 0/1 变 1/1，感叹号消失
    if (n.id === 'jieyin' && !quest.talkDone) {
      quest.talkDone = true;
      n.hasQuest = false;
      syncQuestUI();
    }
  }

  // =====================================================
  // 十一、任务 / 时辰 / Toast
  // =====================================================
  const quest = { talkDone: false, herb: 2, herbNeed: 3 };
  const qTalk = document.getElementById('qTalk');
  const qHerb = document.getElementById('qHerb');
  function syncQuestUI() {
    qTalk.textContent = (quest.talkDone ? 1 : 0) + '/1';
    qTalk.parentElement.classList.toggle('done', quest.talkDone);
    qHerb.textContent = quest.herb + '/' + quest.herbNeed;
  }
  syncQuestUI();

  // 时辰：每 20 秒推进一刻（纯氛围，无玩法影响）
  const SHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const KE = ['一', '二', '三', '四', '五', '六', '七', '八'];
  let shiIdx = 7, keIdx = 1, clockT = 0;      // 起始：未时二刻
  const clockEl = document.getElementById('clock');
  function tickClock(dt) {
    clockT += dt;
    if (clockT < 20) return;
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

  // 技能格 / 功能按钮（占位交互：仅提示，不实现系统）
  document.querySelectorAll('.skill').forEach((el, i) => {
    el.addEventListener('click', () => toast('【' + el.querySelector('.skName').textContent + '】功能开发中（按键 ' + (i + 1) + '）'));
  });
  document.querySelectorAll('.func').forEach(el => {
    el.addEventListener('click', () => toast('【' + el.textContent + '】面板开发中'));
  });

  // =====================================================
  // 十二、主循环（requestAnimationFrame + deltaTime）
  // =====================================================
  let last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);  // dt 钳制，防止切后台回来瞬移
    last = ts;
    time += dt;

    // —— 玩家平滑移动到目标点 ——
    if (player.target) {
      const dx = player.target.mx - player.mx;
      const dy = player.target.my - player.my;
      const d = Math.hypot(dx, dy);
      if (d < 0.03) {
        player.mx = player.target.mx; player.my = player.target.my;
        player.target = null; player.walking = false;
      } else {
        const step = Math.min(d, player.speed * dt);
        let nx = player.mx + dx / d * step;
        let ny = player.my + dy / d * step;
        // 分轴碰撞：撞墙则该轴不移动，连续两轴都卡住就放弃寻路
        if (canStand(nx, player.my)) player.mx = nx;
        if (canStand(player.mx, ny)) player.my = ny;
        if (!canStand(player.mx + dx / d * step, player.my) && !canStand(player.mx, player.my + dy / d * step)) {
          player.target = null; player.walking = false;
        }
        player.walking = true; player.walkT += dt;
        player.face = (dx - dy) > 0 ? 1 : -1;      // 等距下屏幕横向位移 = (dmX - dmY)
      }
    } else {
      player.walking = false;
    }

    updateCamera(dt);
    tickClock(dt);
    render();
  }
  requestAnimationFrame(loop);

  /* =====================================================
   * 【Sprite Sheet 接入示例】（把素材准备好后，取消注释并替换上面的绘制调用）
   *
   * const sheet = new Image();
   * sheet.src = 'assets/iso_tiles.png';        // Kenney / OpenGameArt 的 CC0 等距地砖
   * const charSheet = new Image();
   * charSheet.src = 'assets/iso_chars.png';    // 角色待机/行走 4 帧
   * let assetsReady = false;
   * Promise.all([sheet.decode?.(), charSheet.decode?.()]).then(() => assetsReady = true);
   *
   * // 地面：用图片替换菱形填充（drawGroundTile 内）
   * //   ctx.drawImage(sheet, tileSrcX, tileSrcY, TILE_W, TILE_H, p.x - HW, p.y, TILE_W, TILE_H);
   * // 角色：用帧动画替换占位圆形（drawCharacter 内）
   * //   const frame = Math.floor(time * 6) % 4;
   * //   ctx.drawImage(charSheet, frame * 32, dir * 48, 32, 48, s.x - 16, baseY - 48, 32, 48);
   * ===================================================== */
})();
