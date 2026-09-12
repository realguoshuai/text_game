/* =========================================================
 * 2d_game/js/game.js —— 主引擎（原生 Canvas 2D，零依赖、零构建）
 *
 * 承接文字版《凡人修仙录》的数值体系（境界/物品/任务），做成 2D 俯视角
 * 坊市行 RPG：坊市 NPC 对话/商店/任务，后山采集与讨伐，修为圆满可突破。
 *
 * 弱机友好：地图整图预渲染一次，每帧只 blit 可视区；实体数量有上限；
 * dt 钳制；无重特效；小地图低频重绘。存档走 localStorage。
 * ========================================================= */
(() => {
  'use strict';

  // ---------- 小工具 ----------
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const D = GAME.DATA;

  // ---------- 画布 ----------
  const cv = $('game'), ctx = cv.getContext('2d');
  let VW = 0, VH = 0;
  function resize() {
    VW = cv.width = window.innerWidth;
    VH = cv.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 世界地图（坊市 + 后山） ----------
  const MAP = { w: 2560, h: 1920 };
  const TOWN = { x: 60, y: 60, w: 1740, h: 1060 };      // 坊市区
  const GATE = { x: 1800, y: 520, w: 56, h: 240 };      // 东门（通后山猎场）
  const PARK_GAP = { x: 880, y: 1120, w: 140, h: 56 };  // 南墙豁口（通灵药园）

  // 建筑与地形（碰撞矩形）
  const buildings = [
    { x: 420, y: 380, w: 220, h: 150, name: '丹药铺', roof: '#8a3b2e' },
    { x: 900, y: 260, w: 220, h: 150, name: '器坊',   roof: '#4a5a6a' },
    { x: 520, y: 720, w: 220, h: 150, name: '聚宝阁', roof: '#7a6a2e' },
    { x: 1500, y: 660, w: 160, h: 100, name: '杂货摊', roof: '#5a6a3a' },
    { x: 300, y: 600, w: 140, h: 90,  name: '卜易摊', roof: '#5a3a6a' },
  ];
  const pond = { x: 1150, y: 850, w: 260, h: 160 };
  const walls = [
    // 地图边界
    { x: 0, y: 0, w: MAP.w, h: 56 }, { x: 0, y: MAP.h - 56, w: MAP.w, h: 56 },
    { x: 0, y: 0, w: 56, h: MAP.h }, { x: MAP.w - 56, y: 0, w: 56, h: MAP.h },
    // 坊市东墙（留 GATE 门洞 y 520~760）
    { x: 1800, y: 56, w: 56, h: 520 - 56 },
    { x: 1800, y: 760, w: 56, h: 1120 - 760 },
    // 坊市南墙（留 豁口 x 880~1020）
    { x: 56, y: 1120, w: 880 - 56, h: 56 },
    { x: 1020, y: 1120, w: 1800 - 1020, h: 56 },
    // 灵药园南侧封到地图边？不封，园内留空地
  ];
  const solids = walls.concat(buildings, [pond]);
  // 树（树干小碰撞）
  const treeSpots = [];
  (function seedTrees() {
    let s = 42; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; // 固定种子，地图稳定
    for (let i = 0; i < 90; i++) {
      const x = 100 + rnd() * (MAP.w - 200), y = 130 + rnd() * (MAP.h - 240);
      const inTown = x > TOWN.x + 40 && x < 1790 && y > TOWN.y + 40 && y < 1100;
      const inBuild = buildings.some(b => x > b.x - 40 && x < b.x + b.w + 40 && y > b.y - 40 && y < b.y + b.h + 40);
      const inPond = x > pond.x - 40 && x < pond.x + pond.w + 40 && y > pond.y - 40 && y < pond.y + pond.h + 40;
      const onGate = Math.abs(x - 1828) < 70 && y > 460 && y < 820;
      const onGap = Math.abs(x - 950) < 90 && Math.abs(y - 1148) < 70;
      if (inBuild || inPond || onGate || onGap) continue;
      treeSpots.push({ x, y, big: !inTown || rnd() > 0.5 });
    }
  })();
  treeSpots.forEach(t => solids.push({ x: t.x - 12, y: t.y - 10, w: 24, h: 20, tree: true }));

  // 灯笼（坊市装点，无碰撞）
  const lanterns = [
    { x: 760, y: 560 }, { x: 860, y: 640 }, { x: 1180, y: 560 }, { x: 1300, y: 720 },
    { x: 500, y: 940 }, { x: 900, y: 940 }, { x: 1420, y: 560 }, { x: 1680, y: 620 },
  ];

  // 血灵草采集点（灵药园）
  const herbSpots = [
    { x: 400, y: 1350 }, { x: 700, y: 1500 }, { x: 1000, y: 1300 },
    { x: 1300, y: 1550 }, { x: 600, y: 1680 }, { x: 1250, y: 1430 },
  ].map(p => ({ x: p.x, y: p.y, alive: true, t: 0 }));

  // ---------- 整图预渲染 ----------
  const mapCv = document.createElement('canvas');
  mapCv.width = MAP.w; mapCv.height = MAP.h;
  (function renderMap() {
    const g = mapCv.getContext('2d');
    // 底色：野地草绿
    g.fillStyle = '#3d5a35'; g.fillRect(0, 0, MAP.w, MAP.h);
    // 草地噪点
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = ['#41603a', '#385231', '#46693e'][i % 3];
      g.fillRect(Math.random() * MAP.w, Math.random() * MAP.h, 5, 3);
    }
    // 坊市地面：夯土 + 石板广场
    g.fillStyle = '#6a5a42'; g.fillRect(TOWN.x, TOWN.y, TOWN.w, TOWN.h);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = ['#6e5e46', '#655640', '#726248'][i % 3];
      g.fillRect(TOWN.x + Math.random() * TOWN.w, TOWN.y + Math.random() * TOWN.h, 6, 4);
    }
    // 中央石板广场
    g.fillStyle = '#8a8272';
    g.beginPath(); g.arc(1290, 640, 260, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#7a7263'; g.lineWidth = 3;
    for (let r = 60; r <= 260; r += 50) { g.beginPath(); g.arc(1290, 640, r, 0, Math.PI * 2); g.stroke(); }
    // 主路：坊市→东门 / 坊市→南豁口
    g.fillStyle = '#8a7a58';
    g.fillRect(1200, 600, 620, 90);      // 东西向到东门
    g.fillRect(890, 900, 120, 260);      // 南向到豁口
    // 建筑墙 + 屋顶
    buildings.forEach(b => {
      g.fillStyle = '#5a4a38'; g.fillRect(b.x, b.y, b.w, b.h);           // 墙体
      g.fillStyle = b.roof;
      g.beginPath();                                                      // 梯形屋顶
      g.moveTo(b.x - 14, b.y + 8); g.lineTo(b.x + b.w / 2, b.y - 34);
      g.lineTo(b.x + b.w + 14, b.y + 8); g.lineTo(b.x + b.w - 8, b.y + 26);
      g.lineTo(b.x + 8, b.y + 26); g.closePath(); g.fill();
      g.fillStyle = '#3a2f22';
      g.fillRect(b.x + b.w / 2 - 20, b.y + b.h - 34, 40, 34);             // 门
      g.fillStyle = 'rgba(255,220,140,.25)';
      g.fillRect(b.x + 16, b.y + 40, 30, 26); g.fillRect(b.x + b.w - 46, b.y + 40, 30, 26); // 窗
      g.fillStyle = '#ffe9b3'; g.font = 'bold 22px Microsoft YaHei'; g.textAlign = 'center';
      g.fillText(b.name, b.x + b.w / 2, b.y - 44);
    });
    // 水塘
    g.fillStyle = '#2e5a6e'; g.fillRect(pond.x, pond.y, pond.w, pond.h);
    g.strokeStyle = '#5a7a86'; g.lineWidth = 4; g.strokeRect(pond.x + 2, pond.y + 2, pond.w - 4, pond.h - 4);
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.beginPath(); g.ellipse(pond.x + 80, pond.y + 50, 34, 10, -0.4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(pond.x + 180, pond.y + 100, 40, 12, 0.3, 0, Math.PI * 2); g.fill();
    // 城墙墙体
    g.fillStyle = '#716355';
    walls.forEach(w => { if (!w.tree) g.fillRect(w.x, w.y, w.w, w.h); });
    g.strokeStyle = '#4a4038'; g.lineWidth = 2;
    walls.forEach(w => { if (!w.tree) g.strokeRect(w.x, w.y, w.w, w.h); });
    // 门楼标注
    g.fillStyle = '#ffd75e'; g.font = 'bold 26px Microsoft YaHei';
    g.fillText('青芸坊市', 1290, 120);
    g.font = 'bold 20px Microsoft YaHei'; g.fillStyle = '#e8dcc0';
    g.fillText('东门 · 后山猎场', 1828, 480);
    g.fillText('南口 · 灵药园', 950, 1210);
    g.fillText('后山', 2180, 200);
    // 树
    treeSpots.forEach(t => {
      const r = t.big ? 30 : 22;
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath(); g.ellipse(t.x, t.y + 12, r * 0.8, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4a3520'; g.fillRect(t.x - 5, t.y - 6, 10, 18);
      g.fillStyle = t.big ? '#2e4a26' : '#3a5a2e';
      g.beginPath(); g.arc(t.x, t.y - r * 0.5, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = t.big ? '#3c5e30' : '#4a6e3a';
      g.beginPath(); g.arc(t.x - r * 0.3, t.y - r * 0.7, r * 0.6, 0, Math.PI * 2); g.fill();
    });
    // 灯笼
    lanterns.forEach(l => {
      g.fillStyle = '#5a4a38'; g.fillRect(l.x - 3, l.y - 46, 6, 46);
      g.fillStyle = 'rgba(255,120,60,.25)';
      g.beginPath(); g.arc(l.x, l.y - 54, 20, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c0392b';
      g.beginPath(); g.ellipse(l.x, l.y - 54, 10, 13, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd75e'; g.fillRect(l.x - 4, l.y - 42, 8, 4);
    });
  })();

  // ---------- 游戏状态 ----------
  const SAVE_KEY = 'gd2_save_v1';
  const TOWN_SPAWN = { x: 1290, y: 700 };
  let player, monsters, projectiles, particles, dmgTexts;
  let quests, inv, equipped, unlocked, luckBuff, guardCharm, flags;
  let cam = { x: 0, y: 0 };
  let running = false, paused = false, dialogOpen = false, panelOpen = null;
  let keys = {}, mouse = { x: 0, y: 0, down: false };
  let clockTick = 0, saveTimer = 0, minimapCache = null, minimapTimer = 0;
  const KE_CH = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

  function freshState() {
    player = {
      x: TOWN_SPAWN.x, y: TOWN_SPAWN.y, w: 26, h: 34,
      hp: 120, hpMax: 120, mp: 60, mpMax: 60,
      realm: 0, exp: 0, angle: 0, moving: false, walkT: 0, face: 1,
      atkCd: 0, dashT: 0, dashCd: 0, dashDX: 0, dashDY: 0, guardT: 0,
      dead: false, hitFlash: 0,
    };
    monsters = []; projectiles = []; particles = []; dmgTexts = [];
    quests = {};   // id -> { state:'active'|'done', prog:[...] }
    inv = { pill_jinchuang: 1, pill_huiqi: 1 };   // 开局两瓶保命药
    equipped = null; unlocked = { attack: true, dash: true, flying: false, guard: false };
    luckBuff = false; guardCharm = false;
    flags = { time: 0 };
    // 开局任务
    startQuest('q_main1');
    // 初始几头妖狼
    for (let i = 0; i < 4; i++) spawnMonster();
  }

  function stat() { const r = D.REALMS[player.realm]; return r; }
  function pAtk() { return stat().atk + (equipped ? (D.ITEMS[equipped].equip?.atk || 0) : 0); }
  function pDef() { return stat().def; }

  // ---------- 存档 ----------
  function save() {
    if (!running || player.dead) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, p: { x: player.x, y: player.y, hp: player.hp, mp: player.mp, realm: player.realm, exp: player.exp },
        stones, inv, equipped, unlocked, quests, luckBuff, guardCharm,
      }));
    } catch (_) {}
  }
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!o || o.v !== 1) return false;
      freshState();
      Object.assign(player, o.p);
      stones = o.stones || 0; inv = o.inv || {}; equipped = o.equipped || null;
      unlocked = o.unlocked || unlocked; quests = o.quests || {};
      luckBuff = !!o.luckBuff; guardCharm = !!o.guardCharm;
      return true;
    } catch (_) { return false; }
  }

  let stones = 0;

  // ---------- UI：Toast / 面板 ----------
  function toast(msg) {
    const t = $('toast');
    const d = document.createElement('div');
    d.className = 'toast-msg'; d.textContent = msg;
    t.appendChild(d);
    setTimeout(() => d.remove(), 2700);
  }

  function anyPanelOpen() { return dialogOpen || panelOpen !== null; }
  function closeAll() {
    dialogOpen = false; panelOpen = null;
    $('dialog').classList.add('hidden'); $('panel').classList.add('hidden');
  }

  function showPanel(title, html) {
    panelOpen = title;
    $('panel').classList.remove('hidden');
    $('panel-title').textContent = title;
    $('panel-body').innerHTML = html;
    $('panel-body').querySelectorAll('[data-act]').forEach(el => {
      el.onclick = () => panelAction(el.dataset.act, el.dataset.arg);
    });
  }

  function panelAction(act, arg) {
    if (act === 'use') useItem(arg);
    else if (act === 'sell') sellItem(arg);
    else if (act === 'buy') buyItem(currentShopNpc, arg);
    else if (act === 'break') tryBreakthrough();
    else if (act === 'unequip') { equipped = null; toast('已卸下法器'); }
    else if (act === 'wipe') {
      if (confirm('确定删除存档、从头再来？')) { localStorage.removeItem(SAVE_KEY); location.reload(); }
    }
    showPanelRefresh();
    updateHUD();
  }
  function showPanelRefresh() {
    if (panelOpen === '角色') openCharPanel();
    else if (panelOpen === '背包') openBagPanel();
    else if (panelOpen === '商店') openShopPanel(currentShopNpc);
    else if (panelOpen === '设置') openHelpPanel();
  }

  function openCharPanel() {
    const r = stat(), next = D.REALMS[player.realm + 1];
    const canBreak = next && player.exp >= r.needExp;
    let equipTxt = equipped ? `${D.ITEMS[equipped].name}（攻击 +${D.ITEMS[equipped].equip.atk}） <span class="pbtn" data-act="unequip">卸下</span>` : '<span class="dim">无</span>';
    let breakHtml;
    if (!next) breakHtml = '<div class="gold">已至筑基九层圆满 —— 此界之内，再无对手。</div>';
    else if (canBreak) {
      const chance = Math.min(0.95, r.breakChance + (luckBuff ? 0.10 : 0));
      breakHtml = `<div class="green">修为已圆满！突破成功率：${Math.round(chance * 100)}%${luckBuff ? '（含摆法师卦运 +10%）' : ''}</div>
        <div class="pbtn" data-act="break">冲击 ${next.name}</div>
        <div class="dim">失败将受反噬（气血 -${r.failDamage}）并溃散 ${Math.round(r.failExpLoss * 100)}% 修为${r.deathChance > 0 ? `，另有 ${Math.round(r.deathChance * 100)}% 道消身陨之险` : ''}。</div>`;
    } else breakHtml = `<div class="dim">距离圆满尚需修为 ${r.needExp - player.exp} 点（后山斩妖可得）。</div>`;
    showPanel('角色', `<div class="row"><span>境界</span><span class="gold">${r.name}</span></div>
      <div class="row"><span>攻击 / 防御 / 神识</span><span>${pAtk()} / ${pDef()} / ${r.spirit}</span></div>
      <div class="row"><span>气血 / 灵力</span><span>${Math.ceil(player.hp)}/${player.hpMax} · ${Math.ceil(player.mp)}/${player.mpMax}</span></div>
      <div class="row"><span>修为</span><span class="gold">${player.exp} / ${r.needExp ?? '—'}</span></div>
      <div class="row"><span>法器</span><span>${equipTxt}</span></div>
      <div style="margin-top:10px">${breakHtml}</div>`);
  }

  function itemLine(id, n, btns) {
    const it = D.ITEMS[id];
    return `<div class="row"><span>${it.name}<span class="dim"> ×${n}</span> <span class="dim">${it.desc}</span></span><span>${btns}</span></div>`;
  }

  function openBagPanel() {
    const ids = Object.keys(inv).filter(id => inv[id] > 0);
    if (!ids.length) { showPanel('背包', '<div class="dim">空空如也。后山有妖狼与血灵草。</div>'); return; }
    let html = '';
    ids.forEach(id => {
      const it = D.ITEMS[id];
      let btns = '';
      if (it.type === 'pill') btns += `<span class="pbtn" data-act="use" data-arg="${id}">服用</span>`;
      if (it.type === 'book') btns += `<span class="pbtn" data-act="use" data-arg="${id}">参悟</span>`;
      if (it.type === 'talisman') btns += `<span class="pbtn" data-act="use" data-arg="${id}">激发</span>`;
      if (it.type === 'artifact') btns += `<span class="pbtn" data-act="use" data-arg="${id}">装备</span>`;
      html += itemLine(id, inv[id], btns);
    });
    showPanel('背包', html + '<div class="dim" style="margin-top:8px">材料与药材可在灵石商人 / 器坊处出售。</div>');
  }

  function openHelpPanel() {
    showPanel('设置', `<div class="row"><span>移动</span><span>WASD / 方向键</span></div>
      <div class="row"><span>挥剑</span><span>鼠标左键 / J</span></div>
      <div class="row"><span>剑力潮（需习得）</span><span>Q</span></div>
      <div class="row"><span>血遁</span><span>Shift</span></div>
      <div class="row"><span>护体罡气（需习得）</span><span>R</span></div>
      <div class="row"><span>交互 / 采集</span><span>E</span></div>
      <div class="row"><span>角色 / 背包</span><span>C / B</span></div>
      <div class="row"><span>存档</span><span>每 20 秒自动存档</span></div>
      <div style="margin-top:10px"><span class="pbtn" data-act="wipe">删除存档，重头再来</span></div>`);
  }

  // ---------- 物品使用 / 买卖 ----------
  function useItem(id) {
    const it = D.ITEMS[id];
    if (!it || !inv[id]) return;
    if (it.type === 'pill' && it.use) {
      if (it.use.exp) { gainExp(it.use.exp, false); toast(`${it.name}：修为 +${it.use.exp}`); }
      if (it.use.hp) { player.hp = clamp(player.hp + it.use.hp, 0, player.hpMax); toast(`${it.name}：气血 +${it.use.hp}`); }
      if (it.use.mp) { player.mp = clamp(player.mp + it.use.mp, 0, player.mpMax); toast(`${it.name}：灵力 +${it.use.mp}`); }
      inv[id]--; if (inv[id] <= 0) delete inv[id];
    } else if (it.type === 'book') {
      if (it.id === 'book_flying') { unlocked.flying = true; toast('习得「剑力潮」！按 Q 射出飞剑'); }
      if (it.id === 'book_guard') { unlocked.guard = true; toast('习得「护体罡气」！按 R 护体'); }
      inv[id]--; if (inv[id] <= 0) delete inv[id];
    } else if (it.type === 'talisman') {
      if (it.id === 'tal_fire') {
        fireProjectile(player.angle, 'fire', 60 + pAtk() * 2);
        toast('火弹符激射而出！');
        inv[id]--; if (inv[id] <= 0) delete inv[id];
      } else if (it.id === 'tal_guard') {
        guardCharm = true; toast('护身符已贴身——致命一击时将替你挡下。');
        inv[id]--; if (inv[id] <= 0) delete inv[id];
      }
    } else if (it.type === 'artifact') {
      equipped = id; toast(`已装备 ${it.name}（攻击 +${it.equip.atk}）`);
    }
  }

  function sellItem(id) {
    const it = D.ITEMS[id];
    if (!it || !inv[id] || it.type === 'currency') return;
    const half = Math.max(1, Math.floor(it.price / 2));
    inv[id]--; if (inv[id] <= 0) delete inv[id];
    stones += half;
    toast(`卖出 ${it.name} ×1，得灵石 ${half}`);
  }

  function buyItem(npcId, id) {
    const it = D.ITEMS[id];
    if (!it) return;
    if (it.id === 'sword_qingfeng' && equipped === 'sword_qingfeng') { toast('你已持有青锋剑'); return; }
    if (stones < it.price) { toast('灵石不够。'); return; }
    stones -= it.price;
    if (it.type === 'artifact') { equipped = id; toast(`购得 ${it.name}，已装备！`); }
    else { inv[id] = (inv[id] || 0) + 1; toast(`购得 ${it.name} ×1`); }
  }

  // ---------- 任务 ----------
  function startQuest(id) {
    if (quests[id]) return;
    const q = D.QUESTS.find(q => q.id === id);
    if (!q) return;
    quests[id] = { state: 'active', prog: q.objectives.map(() => 0) };
    toast(`【${q.main ? '主线' : '支线'}】${q.name}：${q.desc}`);
    refreshQuestUI();
  }
  function questEvent(type, target) {
    let changed = false;
    for (const id in quests) {
      const st = quests[id];
      if (st.state !== 'active') continue;
      const q = D.QUESTS.find(q => q.id === id);
      q.objectives.forEach((obj, i) => {
        if (obj.type === type && obj.target === target && st.prog[i] < obj.need) {
          st.prog[i]++; changed = true;
        }
      });
      checkQuestDone(id);
    }
    if (changed) refreshQuestUI();
  }
  function checkQuestDone(id) {
    const st = quests[id], q = D.QUESTS.find(q => q.id === id);
    if (st.state !== 'active') return;
    const all = q.objectives.every((obj, i) => st.prog[i] >= obj.need);
    if (!all) return;
    st.state = 'done';
    const rw = q.reward || {};
    if (rw.exp) gainExp(rw.exp, true);
    if (rw.stones) { stones += rw.stones; }
    if (rw.items) for (const k in rw.items) { inv[k] = (inv[k] || 0) + rw.items[k]; }
    toast(`任务完成【${q.name}】！${rw.exp ? `修为 +${rw.exp} ` : ''}${rw.stones ? `灵石 +${rw.stones}` : ''}`);
    if (q.next) q.next.forEach(startQuest);
    refreshQuestUI();
  }
  function refreshQuestUI() {
    const box = $('quest-list');
    let html = '';
    for (const id in quests) {
      const st = quests[id], q = D.QUESTS.find(q => q.id === id);
      if (st.state === 'done') continue;
      html += `<div class="q-item"><div class="q-name ${q.main ? 'main' : 'side'}">${q.main ? '◆' : '◇'} ${q.name}</div>`;
      q.objectives.forEach((obj, i) => {
        const cur = Math.min(st.prog[i], obj.need);
        const label = obj.type === 'talk' ? '与接引弟子对话'
          : obj.type === 'collect' ? `采集血灵草 ${cur}/${obj.need}`
          : obj.type === 'kill' ? `讨伐${obj.target === 'wolfking' ? '妖狼王' : '妖狼'} ${cur}/${obj.need}`
          : `突破至${D.REALMS[obj.target].name} ${cur}/${obj.need}`;
        html += `<div class="q-obj ${cur >= obj.need ? 'done' : ''}">${label}</div>`;
      });
      html += '</div>';
    }
    box.innerHTML = html || '<div class="q-obj">暂无进行中任务</div>';
  }

  // ---------- 修为 / 突破 ----------
  function gainExp(n, silent) {
    player.exp += n;
    if (!silent) toast(`修为 +${n}`);
    updateHUD();
  }
  function tryBreakthrough() {
    const r = stat(), next = D.REALMS[player.realm + 1];
    if (!next || player.exp < r.needExp) return;
    const chance = Math.min(0.95, r.breakChance + (luckBuff ? 0.10 : 0));
    if (Math.random() < chance) {
      player.realm++; player.exp = 0;
      luckBuff = false;
      player.hpMax = 120 + player.realm * 50;
      player.mpMax = 60 + r.spirit * 6;
      player.hp = player.hpMax; player.mp = player.mpMax;
      toast(`突破成功！晋入【${stat().name}】，气血灵力尽复！`);
      questEvent('realm', player.realm);
    } else {
      player.hp -= r.failDamage;
      player.exp = Math.floor(player.exp * (1 - r.failExpLoss));
      toast(`突破失败！气血逆行（-${r.failDamage}），修为溃散…`);
      if (player.hp <= 0) onPlayerDown();
    }
    updateHUD();
  }
  function onPlayerDown() {
    if (guardCharm) {
      guardCharm = false; player.hp = Math.ceil(player.hpMax * 0.5);
      toast('护身符碎裂——替你挡下了致命一击！');
      return;
    }
    player.dead = true; running = false;
    setTimeout(() => {
      player.dead = false;
      player.exp = Math.floor(player.exp * 0.9);
      player.hp = player.hpMax; player.mp = player.mpMax;
      player.x = TOWN_SPAWN.x; player.y = TOWN_SPAWN.y;
      monsters.forEach(m => m.aggro = false);
      running = true;
      toast('悠悠转醒，已在坊市 med丹铺外……修为折损一成。'.replace('med', ''));
    }, 1500);
  }

  // ---------- 妖兽 ----------
  function spawnMonster(forceType, forcePos) {
    if (monsters.length >= 10) return;
    let type = forceType;
    if (!type) {
      const roll = Math.random();
      type = roll < 0.55 ? 'wolf' : roll < 0.8 ? 'rat' : 'snake';
    }
    const f = D.FOES[type];
    let x, y, tries = 0;
    do {
      if (forcePos) { x = forcePos.x; y = forcePos.y; break; }
      // 猎场东带
      x = rand(1980, 2420); y = rand(180, 1780);
      tries++;
    } while (tries < 8 && dist(x, y, player.x, player.y) < 420);
    monsters.push({
      type, x, y, w: f.r * 2, h: f.r * 2, r: f.r,
      hp: f.hp, hpMax: f.hp, aggro: false, atkCd: 0, wanderT: 0,
      wx: x, wy: y, hitFlash: 0, boss: !!f.boss,
    });
  }
  function trySpawnWolfking() {
    if (monsters.some(m => m.type === 'wolfking')) return;
    spawnMonster('wolfking', { x: 2340, y: 900 });
    toast('后山深处传来狼嚎——妖狼王现世了！');
  }

  function damageMonster(m, dmg, fromExplosion) {
    const f = D.FOES[m.type];
    const real = Math.max(1, Math.round(dmg - f.def));
    m.hp -= real; m.hitFlash = 0.12; m.aggro = true;
    dmgTexts.push({ x: m.x, y: m.y - m.r - 8, v: real, t: 0.9, color: '#ffd75e' });
    burst(m.x, m.y, '#e07a6a', 5);
    if (m.hp <= 0) killMonster(m);
  }
  function killMonster(m) {
    const f = D.FOES[m.type];
    const i = monsters.indexOf(m);
    if (i >= 0) monsters.splice(i, 1);
    gainExp(f.exp, true);
    const st = Math.round(rand(f.stones[0], f.stones[1]));
    stones += st;
    let drops = `${f.exp} 修为 · ${st} 灵石`;
    for (const id in f.drop) {
      if (Math.random() < f.drop[id]) {
        inv[id] = (inv[id] || 0) + 1;
        drops += ` · ${D.ITEMS[id].name}`;
      }
    }
    toast(`斩杀${f.name}！${drops}`);
    dmgTexts.push({ x: m.x, y: m.y - m.r - 20, v: f.name + ' 毙', t: 1.2, color: '#9fd48a', text: true });
    questEvent('kill', m.type);
    if (m.type === 'wolfking') { toast('妖狼王授首！器坊掌柜会记你一功。'); }
    burst(m.x, m.y, '#8a6f3a', 12);
  }
  function damagePlayer(dmg) {
    if (player.dashT > 0 || player.dead) return;
    const real = Math.max(1, Math.round(dmg - pDef() * 0.5));
    const d = player.guardT > 0 ? Math.round(real * 0.4) : real;
    player.hp -= d;
    player.hitFlash = 0.15;
    dmgTexts.push({ x: player.x, y: player.y - 30, v: d, t: 0.8, color: '#e07a6a' });
    if (player.hp <= 0) { player.hp = 0; onPlayerDown(); }
    updateHUD();
  }

  // ---------- 特效 ----------
  function burst(x, y, color, n) {
    for (let i = 0; i < n && particles.length < 80; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(40, 160);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: rand(0.2, 0.45), color });
    }
  }

  // ---------- 战斗 ----------
  function fireProjectile(angle, kind, dmg) {
    projectiles.push({
      x: player.x, y: player.y, angle, kind, dmg,
      speed: kind === 'fire' ? 420 : 480, life: 1.1, hit: false,
    });
  }
  function playerAttack() {
    if (player.atkCd > 0 || player.dead || anyPanelOpen() || !running) return;
    player.atkCd = D.SKILLS2D.attack.cd;
    // 朝向：优先鼠标；纯键盘时取最近妖兽或面向
    let a = null;
    if (mouse.moved) a = Math.atan2(mouse.y + cam.y - player.y, mouse.x + cam.x - player.x);
    else {
      let best = 1e9, bd = 260;
      monsters.forEach(m => { const d = dist(player.x, player.y, m.x, m.y); if (d < bd) { bd = d; best = Math.atan2(m.y - player.y, m.x - player.x); } });
      a = best < 1e9 ? best : player.angle;
    }
    player.angle = a;
    player.slashT = 0.15;
    const dmg = (pAtk() * 2) * rand(0.85, 1.15);
    monsters.forEach(m => {
      const d = dist(player.x, player.y, m.x, m.y);
      if (d > 74 + m.r) return;
      let diff = Math.atan2(m.y - player.y, m.x - player.x) - a;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < Math.PI / 3) damageMonster(m, dmg);
    });
  }
  function castFlying() {
    const sk = D.SKILLS2D.flying;
    if (!unlocked.flying || player.mp < sk.mpCost || cdT.flying > 0 || player.dead || anyPanelOpen() || !running) return;
    player.mp -= sk.mpCost; cdT.flying = sk.cd;
    let a = player.angle;
    if (mouse.moved) a = Math.atan2(mouse.y + cam.y - player.y, mouse.x + cam.x - player.x);
    player.angle = a;
    fireProjectile(a, 'sword', pAtk() * 2.5);
    updateHUD();
  }
  function castDash() {
    const sk = D.SKILLS2D.dash;
    if (player.dashCd > 0 || player.dashT > 0 || player.dead || anyPanelOpen() || !running) return;
    let dx = 0, dy = 0;
    dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    dy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    const l = Math.hypot(dx, dy);
    if (l > 0.1) { dx /= l; dy /= l; } else { dx = Math.cos(player.angle); dy = Math.sin(player.angle); }
    player.dashT = 0.2; player.dashCd = sk.cd; player.dashDX = dx; player.dashDY = dy;
    player.hp = Math.max(1, player.hp - player.hpMax * sk.hpCost);
  }
  function castGuard() {
    const sk = D.SKILLS2D.guard;
    if (!unlocked.guard || player.mp < sk.mpCost || cdT.guard > 0 || player.dead || anyPanelOpen() || !running) return;
    player.mp -= sk.mpCost; cdT.guard = sk.cd; player.guardT = sk.dur;
    burst(player.x, player.y, '#8fd3ff', 14);
    toast('护体罡气！');
    updateHUD();
  }
  const cdT = { flying: 0, dash: 0, guard: 0 };

  // ---------- 碰撞 ----------
  function collide(e, nx, ny) {
    // 分轴移动 + AABB
    let x = e.x, y = e.y;
    const hw = e.w / 2, hh = e.h / 2;
    let ok = true;
    for (const s of solids) {
      if (nx + hw > s.x && nx - hw < s.x + s.w && y + hh > s.y && y - hh < s.y + s.h) { ok = false; break; }
    }
    if (ok) x = nx;
    ok = true;
    for (const s of solids) {
      if (x + hw > s.x && x - hw < s.x + s.w && ny + hh > s.y && ny - hh < s.y + s.h) { ok = false; break; }
    }
    if (ok) y = ny;
    e.x = clamp(x, 60, MAP.w - 60); e.y = clamp(y, 60, MAP.h - 60);
  }

  // ---------- 输入 ----------
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    keys[k === 'arrowup' ? 'w' : k === 'arrowdown' ? 's' : k === 'arrowleft' ? 'a' : k === 'arrowright' ? 'd' : k] = true;

    if (!running) return;
    if (k === 'escape') { closeAll(); return; }
    if (dialogOpen) {
      if (/^[1-9]$/.test(k)) dialogOption(parseInt(k) - 1);
      return;
    }
    if (panelOpen) return;
    if (k === 'j' || k === ' ') playerAttack();
    else if (k === 'q') castFlying();
    else if (k === 'shift') castDash();
    else if (k === 'r') castGuard();
    else if (k === 'e') interact();
    else if (k === 'c') panelOpen === '角色' ? closeAll() : openCharPanel();
    else if (k === 'b' || k === 'i') panelOpen === '背包' ? closeAll() : openBagPanel();
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    keys[k === 'arrowup' ? 'w' : k === 'arrowdown' ? 's' : k === 'arrowleft' ? 'a' : k === 'arrowright' ? 'd' : k] = false;
  });
  cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; });
  cv.addEventListener('mousedown', e => {
    if (e.button === 0 && running && !dialogOpen && !panelOpen) { mouse.down = true; playerAttack(); }
  });
  window.addEventListener('mouseup', () => mouse.down = false);

  // 连续按住左键挥剑
  setInterval(() => { if (mouse.down && running && !anyPanelOpen()) playerAttack(); }, 120);

  // ---------- 交互 ----------
  function nearestInteract() {
    let best = null, bd = 64;
    D.NPCS.forEach(n => {
      const d = dist(player.x, player.y, n.x, n.y);
      if (d < bd) { bd = d; best = { kind: 'npc', data: n }; }
    });
    herbSpots.forEach(h => {
      if (!h.alive) return;
      const d = dist(player.x, player.y, h.x, h.y);
      if (d < bd) { bd = d; best = { kind: 'herb', data: h }; }
    });
    return best;
  }
  let currentShopNpc = null;
  function interact() {
    if (anyPanelOpen() || !running) return;
    const it = nearestInteract();
    if (!it) return;
    if (it.kind === 'herb') {
      const h = it.data;
      h.alive = false; h.t = 60;
      inv.herb_xueling = (inv.herb_xueling || 0) + 1;
      toast('采得血灵草 ×1');
      questEvent('collect', 'herb_xueling');
      return;
    }
    openDialog(it.data);
  }

  // ---------- 对话 ----------
  let dialogNpc = null;
  function openDialog(npc) {
    dialogNpc = npc; dialogOpen = true;
    $('dialog').classList.remove('hidden');
    $('dialog-name').textContent = `${npc.name}（${npc.role}）`;
    let text = npc.talk;
    // 接引弟子：主线进度台词
    if (npc.id === 'jieyin') {
      const q = quests.q_main1;
      if (q && q.state === 'active') text = '师弟可想好了？宗门规矩：先立功、后授艺。往后山去，杀狼采药，皆是你我青芸派的脸面。';
      else if (quests.q_wolfking && quests.q_wolfking.state === 'active') text = '狼王现世，坊市夜夜不安。师弟若能斩之，便是宗门大功。';
      else if (quests.q_main1?.state === 'done') text = '干得漂亮。修行之路漫长，境界到了记得回来让我瞧瞧。';
    }
    $('dialog-text').textContent = text;
    const opts = [];
    if (npc.shop) opts.push({ label: npc.shop.length ? '瞧瞧货品' : '卖些东西给你', act: 'shop' });
    if (npc.fortune) opts.push({ label: '卜一卦（30 灵石）', act: 'fortune' });
    opts.push({ label: '告辞', act: 'bye' });
    $('dialog-options').innerHTML = opts.map((o, i) =>
      `<div class="opt" data-i="${i}">${i + 1}. ${o.label}</div>`).join('');
    $('dialog-options').querySelectorAll('.opt').forEach(el => {
      el.onclick = () => dialogOption(parseInt(el.dataset.i));
    });
    dialogOpts = opts;
  }
  let dialogOpts = [];
  function dialogOption(i) {
    const o = dialogOpts[i];
    if (!o) return;
    if (o.act === 'bye') { closeAll(); return; }
    if (o.act === 'shop') { currentShopNpc = dialogNpc.id; dialogOpen = false; $('dialog').classList.add('hidden'); openShopPanel(dialogNpc); return; }
    if (o.act === 'fortune') {
      if (stones < 30) { toast('灵石不够，卦金 30。'); return; }
      stones -= 30; luckBuff = true;
      $('dialog-text').textContent = '（掷筊）……上上签。「冲关之日，借你三分气运。」——下次突破成功率 +10%。';
      toast('得了上上签：下次突破 +10% 成功率');
      return;
    }
  }

  function openShopPanel(npc) {
    panelOpen = '商店';
    const it = npc;
    let html = `<div class="dim">灵石：<span class="gold">${stones}</span></div>`;
    if (npc.shop && npc.shop.length) {
      html += '<div style="margin:6px 0">—— 购买 ——</div>';
      npc.shop.forEach(id => {
        const g = D.ITEMS[id];
        const owned = g.id === 'sword_qingfeng' && equipped === 'sword_qingfeng';
        html += `<div class="row"><span>${g.name} <span class="gold">${g.price} 灵石</span><br><span class="dim">${g.desc}</span></span>
          <span class="pbtn ${owned ? 'disabled' : ''}" data-act="buy" data-arg="${id}">${owned ? '已持有' : '购买'}</span></div>`;
      });
    }
    if (npc.sellAll) {
      const sellable = Object.keys(inv).filter(id => inv[id] > 0 && D.ITEMS[id].type !== 'currency' && D.ITEMS[id].type !== 'book');
      html += '<div style="margin:6px 0">—— 出售（半价）——</div>';
      if (!sellable.length) html += '<div class="dim">背包里没有可卖的东西。</div>';
      sellable.forEach(id => {
        const g = D.ITEMS[id];
        html += `<div class="row"><span>${g.name} ×${inv[id]}</span>
          <span class="pbtn" data-act="sell" data-arg="${id}">卖 ${Math.max(1, Math.floor(g.price / 2))} 灵石</span></div>`;
      });
    }
    $('panel').classList.remove('hidden');
    $('panel-title').textContent = `${npc.name} · 交易`;
    $('panel-body').innerHTML = html;
    $('panel-body').querySelectorAll('[data-act]').forEach(el => {
      el.onclick = () => {
        const act = el.dataset.act, arg = el.dataset.arg;
        if (act === 'sell') sellItem(arg);
        else if (act === 'buy') buyItem(npc.id, arg);
        openShopPanel(npc);
        updateHUD();
      };
    });
  }

  // ---------- 更新 ----------
  let spawnTimer = 0;
  function update(dt) {
    flags.time += dt;
    clockTick += dt;
    if (clockTick > 45) { clockTick = 0; advanceClock(); }

    // 冷却
    player.atkCd = Math.max(0, player.atkCd - dt);
    player.dashCd = Math.max(0, player.dashCd - dt);
    player.dashT = Math.max(0, player.dashT - dt);
    player.guardT = Math.max(0, player.guardT - dt);
    player.hitFlash = Math.max(0, player.hitFlash - dt);
    player.slashT = Math.max(0, (player.slashT || 0) - dt);
    cdT.flying = Math.max(0, cdT.flying - dt);
    cdT.dash = Math.max(0, cdT.dash - dt);
    cdT.guard = Math.max(0, cdT.guard - dt);

    // 灵力自然回复
    if (!player.dead) {
      player.mp = clamp(player.mp + 2 * dt, 0, player.mpMax);
      player.hp = clamp(player.hp + 0.6 * dt, 0, player.hpMax);
    }

    // 移动
    let dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    let dy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    player.moving = !!(dx || dy);
    if (player.moving) {
      const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      player.walkT += dt * 10;
      if (dx) player.face = dx > 0 ? 1 : -1;
    }
    const spd = 60 + stat().speed * 9;
    if (player.dashT > 0) {
      collide(player, player.x + player.dashDX * 660 * dt, player.y + player.dashDY * 660 * dt);
      burst(player.x, player.y, '#8a3b3b', 1);
    } else if (player.moving && !player.dead) {
      collide(player, player.x + dx * spd * dt, player.y + dy * spd * dt);
    }
    if (!mouse.moved && player.moving) player.angle = Math.atan2(dy, dx);

    // 妖兽
    if (!player.dead) {
      monsters.forEach(m => {
        const f = D.FOES[m.type];
        m.hitFlash = Math.max(0, m.hitFlash - dt);
        m.atkCd = Math.max(0, m.atkCd - dt);
        const d = dist(m.x, m.y, player.x, player.y);
        if (d < 260) m.aggro = true;
        if (d > 460) m.aggro = false;
        if (m.aggro) {
          const a = Math.atan2(player.y - m.y, player.x - m.x);
          collide(m, m.x + Math.cos(a) * f.speed * dt, m.y + Math.sin(a) * f.speed * dt);
          if (d < 34 + m.r && m.atkCd <= 0) {
            m.atkCd = 0.9;
            damagePlayer(f.atk);
          }
        } else {
          m.wanderT -= dt;
          if (m.wanderT <= 0) { m.wanderT = rand(1.5, 3.5); m.wa = Math.random() * Math.PI * 2; m.wm = Math.random() > 0.4; }
          if (m.wm) collide(m, m.x + Math.cos(m.wa) * f.speed * 0.3 * dt, m.y + Math.sin(m.wa) * f.speed * 0.3 * dt);
        }
      });
      // 刷新
      spawnTimer -= dt;
      if (spawnTimer <= 0) { spawnTimer = 3.5; spawnMonster(); }
      // 狼王出场条件：q_wolfking 激活
      if (quests.q_wolfking && quests.q_wolfking.state === 'active') trySpawnWolfking();
    }

    // 飞剑 / 火弹
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;
      p.life -= dt;
      let gone = p.life <= 0 || p.x < 56 || p.y < 56 || p.x > MAP.w - 56 || p.y > MAP.h - 56;
      if (!gone) {
        for (const s of solids) {
          if (p.x > s.x && p.x < s.x + s.w && p.y > s.y && p.y < s.y + s.h) { gone = true; burst(p.x, p.y, '#8fd3ff', 4); break; }
        }
      }
      if (!gone) {
        for (const m of monsters) {
          if (dist(p.x, p.y, m.x, m.y) < m.r + 8) {
            damageMonster(m, p.dmg * rand(0.9, 1.1));
            burst(p.x, p.y, p.kind === 'fire' ? '#e07a3a' : '#8fd3ff', 8);
            gone = true; break;
          }
        }
      }
      if (gone) projectiles.splice(i, 1);
    }

    // 粒子 / 飘字
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt;
      if (p.t <= 0) particles.splice(i, 1);
    }
    for (let i = dmgTexts.length - 1; i >= 0; i--) {
      const t = dmgTexts[i];
      t.y -= 26 * dt; t.t -= dt;
      if (t.t <= 0) dmgTexts.splice(i, 1);
    }

    // 药草重生
    herbSpots.forEach(h => { if (!h.alive) { h.t -= dt; if (h.t <= 0) h.alive = true; } });

    // 相机
    cam.x = clamp(player.x - VW / 2, 0, MAP.w - VW);
    cam.y = clamp(player.y - VH / 2, 0, MAP.h - VH);
    if (MAP.w < VW) cam.x = (MAP.w - VW) / 2;
    if (MAP.h < VH) cam.y = (MAP.h - VH) / 2;

    // 自动存档
    saveTimer += dt;
    if (saveTimer > 20) { saveTimer = 0; save(); }
  }

  // ---------- 渲染 ----------
  function drawChar(x, y, opts) {
    // 简易小人：影 + 袍 + 头 + 发髻
    const { color = '#4a6a8a', bob = 0, face = 1, flash = 0 } = opts || {};
    ctx.save();
    ctx.translate(x, y + Math.sin(bob) * 1.5);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(0, 16, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (flash > 0) { ctx.globalAlpha = 0.6; }
    ctx.fillStyle = color;                                   // 袍
    ctx.beginPath();
    ctx.moveTo(-9, 16); ctx.lineTo(-7, -4); ctx.lineTo(7, -4); ctx.lineTo(9, 16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8c8a0';                               // 头
    ctx.beginPath(); ctx.arc(0, -10, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2018';                               // 发髻
    ctx.beginPath(); ctx.arc(0, -14, 5.5, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-2, -20, 4, 4);
    ctx.fillStyle = '#1a1410';                               // 眼
    ctx.fillRect(face * 2, -11, 2, 2);
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = '#14100b';
    ctx.fillRect(0, 0, VW, VH);
    const cx = Math.round(cam.x), cy = Math.round(cam.y);
    ctx.drawImage(mapCv, cx, cy, VW, VH, 0, 0, VW, VH);

    // 血灵草
    herbSpots.forEach(h => {
      if (!h.alive) return;
      const x = h.x - cx, y = h.y - cy;
      if (x < -20 || y < -20 || x > VW + 20 || y > VH + 20) return;
      ctx.strokeStyle = '#3a6a2e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y - 9); ctx.moveTo(x, y); ctx.lineTo(x + 1, y - 11); ctx.moveTo(x, y); ctx.lineTo(x + 5, y - 8); ctx.stroke();
      ctx.fillStyle = '#c04a3a';
      ctx.fillRect(x - 3, y - 13, 2, 2); ctx.fillRect(x + 1, y - 15, 2, 2);
      ctx.fillStyle = 'rgba(255,100,80,.2)';
      ctx.beginPath(); ctx.arc(x, y - 8, 9, 0, Math.PI * 2); ctx.fill();
    });

    // 实体按 y 排序绘制
    const draws = [];
    D.NPCS.forEach(n => draws.push({ y: n.y, fn: () => {
      const x = n.x - cx, y = n.y - cy;
      drawChar(x, y, { color: n.color, bob: flags.time * 2 + n.x });
      ctx.fillStyle = '#ffe9b3'; ctx.font = '12px Microsoft YaHei'; ctx.textAlign = 'center';
      ctx.fillText(n.name, x, y - 30);
      // 任务标记：接引弟子（主线未完）/ 有剧情 NPC
      const showMark = n.id === 'jieyin' && quests.q_main1?.state === 'active';
      if (showMark) {
        const b = Math.sin(flags.time * 4) * 3;
        ctx.fillStyle = '#ffd75e'; ctx.font = 'bold 18px Microsoft YaHei';
        ctx.fillText('!', x, y - 40 + b);
      }
      // E 提示
      const near = dist(player.x, player.y, n.x, n.y) < 64;
      if (near) { ctx.fillStyle = '#9fd48a'; ctx.font = 'bold 12px Microsoft YaHei'; ctx.fillText('[E]', x, y - 52); }
    }}));
    herbSpots.forEach(h => { if (h.alive) draws.push({ y: h.y, fn: () => {
      const near = dist(player.x, player.y, h.x, h.y) < 64;
      if (near) {
        ctx.fillStyle = '#9fd48a'; ctx.font = 'bold 12px Microsoft YaHei'; ctx.textAlign = 'center';
        ctx.fillText('[E] 采集', h.x - cx, h.y - cy - 22);
      }
    }})});
    monsters.forEach(m => draws.push({ y: m.y, fn: () => {
      const f = D.FOES[m.type];
      const x = m.x - cx, y = m.y - cy;
      if (x < -60 || y < -60 || x > VW + 60 || y > VH + 60) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(0, m.r * 0.7, m.r, m.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = m.hitFlash > 0 ? '#fff' : f.color;
      ctx.beginPath(); ctx.ellipse(0, 0, m.r, m.r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      // 耳/尾
      ctx.beginPath();
      ctx.moveTo(-m.r * 0.5, -m.r * 0.5); ctx.lineTo(-m.r * 0.8, -m.r * 1.1); ctx.lineTo(-m.r * 0.15, -m.r * 0.7);
      ctx.moveTo(m.r * 0.5, -m.r * 0.5); ctx.lineTo(m.r * 0.8, -m.r * 1.1); ctx.lineTo(m.r * 0.15, -m.r * 0.7);
      ctx.closePath(); ctx.fill();
      // 眼
      ctx.fillStyle = f.boss ? '#ff4a3a' : '#e0a03a';
      ctx.fillRect(-m.r * 0.4, -m.r * 0.2, 3, 3); ctx.fillRect(m.r * 0.2, -m.r * 0.2, 3, 3);
      if (f.boss) {
        ctx.strokeStyle = 'rgba(255,70,50,.4)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, m.r + 6 + Math.sin(flags.time * 5) * 3, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      // 名字 + 血条
      if (m.aggro || m.boss || m.hp < m.hpMax) {
        ctx.fillStyle = '#e8dcc0'; ctx.font = '11px Microsoft YaHei'; ctx.textAlign = 'center';
        ctx.fillText(f.name, x, y - m.r - 16);
        ctx.fillStyle = '#241c10'; ctx.fillRect(x - 18, y - m.r - 12, 36, 4);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 18, y - m.r - 12, 36 * clamp(m.hp / m.hpMax, 0, 1), 4);
      }
    }}));
    draws.push({ y: player.y, fn: () => {
      if (player.dead) return;
      const x = player.x - cx, y = player.y - cy;
      // 护体罡气
      if (player.guardT > 0) {
        ctx.strokeStyle = `rgba(140,210,255,${0.4 + Math.sin(flags.time * 6) * 0.2})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.stroke();
      }
      drawChar(x, y, { color: '#3a5a7a', bob: player.moving ? player.walkT : 0, face: player.face, flash: player.hitFlash });
      // 挥剑弧光
      if (player.slashT > 0) {
        ctx.strokeStyle = 'rgba(200,240,255,.85)'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 52, player.angle - Math.PI / 3, player.angle + Math.PI / 3);
        ctx.stroke();
      }
    }});
    draws.sort((a, b) => a.y - b.y).forEach(d => d.fn());

    // 飞剑 / 火弹
    projectiles.forEach(p => {
      const x = p.x - cx, y = p.y - cy;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(p.angle);
      if (p.kind === 'sword') {
        ctx.fillStyle = '#bfe8ff'; ctx.fillRect(-10, -2, 20, 4);
        ctx.fillStyle = '#8fd3ff'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = '#ff8a3a';
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,140,60,.35)';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });

    // 粒子
    particles.forEach(p => {
      ctx.globalAlpha = clamp(p.t * 3, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - cx - 2, p.y - cy - 2, 4, 4);
    });
    ctx.globalAlpha = 1;

    // 飘字
    ctx.textAlign = 'center';
    dmgTexts.forEach(t => {
      ctx.globalAlpha = clamp(t.t * 2, 0, 1);
      ctx.fillStyle = t.color;
      ctx.font = (t.text ? '14px' : 'bold 14px') + ' Microsoft YaHei';
      ctx.fillText(t.text ? t.v : (t.v > 0 ? '-' + t.v : ''), t.x - cx, t.y - cy);
    });
    ctx.globalAlpha = 1;

    // 死亡遮罩
    if (player.dead) {
      ctx.fillStyle = 'rgba(40,0,0,.5)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = '#e8dcc0'; ctx.font = '22px Microsoft YaHei'; ctx.textAlign = 'center';
      ctx.fillText('道消身陨……（即将转醒）', VW / 2, VH / 2);
    }

    renderMinimap();
    renderCdUI();
  }

  // ---------- 小地图 ----------
  function renderMinimap() {
    minimapTimer -= 1 / 60;
    const mm = $('minimap'), mc = mm.getContext('2d');
    if (!minimapCache || minimapTimer <= 0) {
      minimapTimer = 0.5;
      if (!minimapCache) { minimapCache = document.createElement('canvas'); minimapCache.width = 150; minimapCache.height = 112; }
      const g = minimapCache.getContext('2d');
      g.fillStyle = '#2a3a24'; g.fillRect(0, 0, 150, 112);
      g.drawImage(mapCv, 0, 0, MAP.w, MAP.h, 0, 0, 150, 112);
    }
    mc.drawImage(minimapCache, 0, 0);
    const sx = 150 / MAP.w, sy = 112 / MAP.h;
    monsters.forEach(m => { mc.fillStyle = m.boss ? '#ff4a3a' : '#e07a6a'; mc.fillRect(m.x * sx - 1, m.y * sy - 1, 3, 3); });
    herbSpots.forEach(h => { if (h.alive) { mc.fillStyle = '#8fd48a'; mc.fillRect(h.x * sx - 1, h.y * sy - 1, 2, 2); } });
    D.NPCS.forEach(n => { mc.fillStyle = '#ffd75e'; mc.fillRect(n.x * sx - 1.5, n.y * sy - 1.5, 3, 3); });
    mc.fillStyle = '#fff'; mc.fillRect(player.x * sx - 2, player.y * sy - 2, 4, 4);
  }

  // ---------- HUD ----------
  function renderCdUI() {
    const set = (sel, cd, max) => {
      const el = document.querySelector(sel + ' .skill-cd');
      if (el) el.style.transform = `scaleY(${max > 0 ? clamp(cd / max, 0, 1) : 0})`;
    };
    set('[data-skill="attack"]', player.atkCd, D.SKILLS2D.attack.cd);
    set('[data-skill="flying"]', cdT.flying, D.SKILLS2D.flying.cd);
    set('[data-skill="dash"]', player.dashCd, D.SKILLS2D.dash.cd);
    set('[data-skill="guard"]', cdT.guard, D.SKILLS2D.guard.cd);
    $('sk-flying').classList.toggle('locked', !unlocked.flying);
    $('sk-guard').classList.toggle('locked', !unlocked.guard);
  }

  function updateHUD() {
    const r = stat();
    $('p-realm').textContent = r.name;
    $('bar-hp').style.width = clamp(player.hp / player.hpMax * 100, 0, 100) + '%';
    $('bar-mp').style.width = clamp(player.mp / player.mpMax * 100, 0, 100) + '%';
    $('bar-exp').style.width = (r.needExp ? clamp(player.exp / r.needExp * 100, 0, 100) : 100) + '%';
    $('txt-hp').textContent = `${Math.ceil(player.hp)} / ${player.hpMax}`;
    $('txt-mp').textContent = `${Math.ceil(player.mp)} / ${player.mpMax}`;
    $('txt-exp').textContent = r.needExp ? `修为 ${player.exp}/${r.needExp}` : '圆满';
    $('p-stones').textContent = stones;
  }

  let clockIdx = 7, keCnt = 3; // 未时三刻
  function advanceClock() {
    keCnt++;
    if (keCnt > 8) { keCnt = 1; clockIdx = (clockIdx + 1) % 12; }
    $('clock').textContent = `${KE_CH[clockIdx]}时${['一', '二', '三', '四', '五', '六', '七', '八'][keCnt - 1]}刻 · 晴`;
  }

  // 菜单按钮
  document.querySelectorAll('.menu-btn').forEach(el => {
    el.onclick = () => {
      if (!running) return;
      const p = el.dataset.panel;
      if (p === 'char') openCharPanel();
      else if (p === 'bag') openBagPanel();
      else if (p === 'help') openHelpPanel();
    };
  });

  // ---------- 主循环 ----------
  let lastT = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    if (running) update(dt);
    if (player) render();
  }
  requestAnimationFrame(loop);

  // ---------- 开始 ----------
  function startGame(cont) {
    if (cont) {
      if (!load()) { toast('没有找到存档'); return; }
    } else {
      freshState(); stones = 0;
      localStorage.removeItem(SAVE_KEY);
    }
    closeAll();
    $('title').classList.add('hidden');
    updateHUD();
    refreshQuestUI();
    running = true;
    toast(cont ? '存档已载入，继续修行。' : '你立于青芸坊市中央。接引弟子的「!」在等你——按 E 对话。');
  }
  $('btn-new').onclick = () => startGame(false);
  $('btn-continue').onclick = () => startGame(true);
  $('btn-continue').disabled = !localStorage.getItem(SAVE_KEY);
  if ($('btn-continue').disabled) $('btn-continue').style.opacity = 0.5;

  window.addEventListener('beforeunload', save);
  // 初始化一个空状态用于渲染标题底图
  freshState(); stones = 0; running = false;
})();
