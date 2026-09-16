'use strict';
/* =========================================================
 * test/smoke_materials.js —— 筑基期基础材料闭环 无头验收测试
 * 强制验收四项：
 *   ① 二阶妖兽战斗结算：高神识角色（SP≥25）击杀必出【妖兽精魄】
 *   ② 洞府时间步进：玄傀后山伐木 2 个月后【百年灵木】+1
 *   ③ 承露瓶催熟：消耗 1 滴绿液 → 【百年灵木】+3
 *   ④ 傀儡制作全流程：精魄×2 + 灵木×1 精确扣料，多余材料不被误删
 * 覆盖项：宗门月俸发料 / 坊市铁匠铺无限量玄铁 / 黑市 3 月轮换 / 功勋兑换
 * 运行： node test/smoke_materials.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.resolve(__dirname, '..');

const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, renderBlack: function () {}, renderTrial: function () {},
  renderTrack: function () {}, renderCombat: function () {}, toggleTalismans: function () {},
};

let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills.js',
  'data/events.js', 'data/world.js', 'data/content.js', 'data/demon_war_events.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/market.js', 'js/garden.js',
  'js/sect.js', 'js/blackmarket.js', 'js/trial.js',
  'js/puppet.js', 'js/insect.js', 'js/cave2.js', 'js/teleport_portal.js',
];
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
}
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function assert(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function reset(realmIndex) {
  G.State.createNewPlayer('hunter');
  if (realmIndex != null) G.State.p().realmIndex = realmIndex;
  logs.length = 0;
  return G.State.p();
}
function setRand(v) { _rand = v; }
function cnt(id) { return G.State.countItem(id); }

// ============ 前置：材料字典齐备 ============
console.log('==== 零、材料数据字典（前置） ====');
{
  const ids = ['beast_soul', 'spirit_wood', 'iron_ore', 'tianhuo_crystal', 'yin_hun_soul'];
  ids.forEach(function (id) {
    const it = G.DATA.ITEMS[id];
    assert('材料已登记：' + id, !!it && !!it.name && it.type === 'material');
  });
  assert('妖兽精魄单价 35', G.DATA.ITEMS.beast_soul.price === 35);
  assert('百年灵木单价 25', G.DATA.ITEMS.spirit_wood.price === 25);
  assert('玄铁矿石单价 15', G.DATA.ITEMS.iron_ore.price === 15);
  assert('天火晶单价 80', G.DATA.ITEMS.tianhuo_crystal.price === 80);
  assert('中阶灵石复用既有 mid_stone（不另立 ID）', !!G.DATA.ITEMS.mid_stone && !G.DATA.ITEMS.mid_spirit_stone);
}

// ============ 强制验收 ①：二阶妖兽 + 高神识 → 必出精魄 ============
console.log('==== 一、二阶妖兽战斗结算：搜神拘魂必出精魄（强制验收①） ====');
{
  const p = reset(13);
  assert('筑基一层初始神识上限 15（< 25）', G.State.spLimit() === 15);
  G.Puppet.learnDayan();                      // +25 → 40
  assert('习大衍决一层后神识上限 ≥ 25', G.State.spLimit() >= 25);

  const beast = G.DATA.MONSTERS.filter(function (m) { return m.isBeast && (m.tier || 1) >= 2; });
  assert('已配置二阶妖兽（isBeast && tier>=2）', beast.length >= 1);

  setRand(0.99);                              // 常规 loot 概率全部落空，只留强制拘魂
  const before = cnt('beast_soul');
  G.Combat.start(beast[0].id);
  G.Combat.victory();
  assert('高神识击杀二阶妖兽必得【妖兽精魄】×1', cnt('beast_soul') === before + 1);
  assert('战报含「搜神拘魂」', logs.some(function (l) { return l.indexOf('搜神拘魂') >= 0; }));
  p.combat = null;

  // 反例：神识不足且运气不佳 → 拘不住
  const q = reset(13);
  setRand(0.99);
  G.Combat.start(beast[0].id);
  G.Combat.victory();
  assert('神识不足（15）且运气不佳则拘不到精魄', cnt('beast_soul') === 0);
  assert('战报提示神识不足未能拘魂', logs.some(function (l) { return l.indexOf('未能拘住') >= 0; }));
  q.combat = null;

  // 一阶妖兽不掉精魄（tier=1）
  const r = reset(13);
  G.Puppet.learnDayan();
  setRand(0.99);
  G.Combat.start('wolf');
  G.Combat.victory();
  assert('一阶妖兽不产出精魄（tier<2）', cnt('beast_soul') === 0);
  r.combat = null;
}

// ============ 强制验收 ②：玄傀伐木 2 月 → 灵木 +1 ============
console.log('==== 二、洞府生产：玄傀后山伐木 / 下矿开采（强制验收②） ====');
{
  const p = reset(13);
  p.companion = { id: 'quhun', name: '铁奴·玄傀', hp: 200, maxHp: 200, atk: 24 };
  const w0 = cnt('spirit_wood'), m0 = p.totalMonths;
  setRand(0.5);
  G.Core.dispatchCompanion('chop');
  assert('伐木后【百年灵木】+1', cnt('spirit_wood') === w0 + 1);
  assert('伐木耗时恰为 2 个月', p.totalMonths === m0 + 2);

  const o0 = cnt('iron_ore'), m1 = p.totalMonths;
  G.Core.dispatchCompanion('mineore');
  assert('下矿后【玄铁矿石】+2', cnt('iron_ore') === o0 + 2);
  assert('下矿耗时恰为 1 个月', p.totalMonths === m1 + 1);

  // 无玄傀不可派遣
  const q = reset(13);
  const w1 = cnt('spirit_wood');
  G.Core.dispatchCompanion('chop');
  assert('无玄傀时派遣被拒（灵木不增）', cnt('spirit_wood') === w1);
}

// ============ 强制验收 ③：承露瓶催熟灵木幼苗 → 灵木 +3 ============
console.log('==== 三、承露瓶催熟灵木幼苗（强制验收③） ====');
{
  const p = reset(13);
  p.liquid = 1;
  const w0 = cnt('spirit_wood');
  const got = G.Cave2.catalyzeWood();
  assert('催熟返回产出 3 根', got === 3);
  assert('【百年灵木】+3', cnt('spirit_wood') === w0 + 3);
  assert('绿液恰好消耗 1 滴', p.liquid === 0);
  // 绿液不足时拒绝
  const got2 = G.Cave2.catalyzeWood();
  assert('绿液不足时催熟被拒（产出 0）', got2 === 0 && cnt('spirit_wood') === w0 + 3);
}

// ============ 强制验收 ④：弓箭傀儡制作扣料精确、余料不误删 ============
console.log('==== 四、傀儡工坊：精确扣料 · 余料不误删（强制验收④） ====');
{
  const p = reset(13);
  const def = G.DATA.PUPPETS.gongjian;
  assert('弓箭傀儡配方 = 精魄×2 + 灵木×1',
    def.materials.length === 2 &&
    def.materials[0].id === 'beast_soul' && def.materials[0].qty === 2 &&
    def.materials[1].id === 'spirit_wood' && def.materials[1].qty === 1);

  // 材料不足：禁止制作并提示缺口来源
  G.State.addItem('beast_soul', 1);
  G.Puppet.build('gongjian');
  assert('材料不足时不产出傀儡', cnt('puppet_gongjian') === 0);
  assert('材料不足时不误扣已有材料', cnt('beast_soul') === 1);
  assert('缺料提示带获取渠道', logs.some(function (l) { return l.indexOf('来源') >= 0; }));
  assert('canBuild 判定为 false', G.Puppet.canBuild(def) === false);

  // 备足并多备余料：精魄 5 / 灵木 4 / 玄铁 3（玄铁与本配方无关，绝不可动）
  G.State.addItem('beast_soul', 4);   // → 5
  G.State.addItem('spirit_wood', 4);
  G.State.addItem('iron_ore', 3);
  assert('canBuild 判定为 true', G.Puppet.canBuild(def) === true);
  assert('库存文本形如「妖兽精魄: 5/2 | 百年灵木: 4/1」',
    G.Puppet.stockText(def) === '妖兽精魄: 5/2 | 百年灵木: 4/1');

  G.Puppet.build('gongjian');
  assert('成功产出弓箭傀儡 ×1', cnt('puppet_gongjian') === 1);
  assert('精魄精确扣 2（5 → 3）', cnt('beast_soul') === 3);
  assert('灵木精确扣 1（4 → 3）', cnt('spirit_wood') === 3);
  assert('无关材料玄铁分毫未动（3）', cnt('iron_ore') === 3);

  // 巨狼 / 巨猿新配方
  const dw = G.DATA.PUPPETS.julang, dy = G.DATA.PUPPETS.juyuan;
  assert('巨狼傀儡 = 灵木×5 + 玄铁×3',
    dw.materials[0].id === 'spirit_wood' && dw.materials[0].qty === 5 &&
    dw.materials[1].id === 'iron_ore' && dw.materials[1].qty === 3);
  assert('巨猿傀儡 = 灵木×12 + 天火晶×2',
    dy.materials[0].id === 'spirit_wood' && dy.materials[0].qty === 12 &&
    dy.materials[1].id === 'tianhuo_crystal' && dy.materials[1].qty === 2);

  const q = reset(13);
  G.State.addItem('spirit_wood', 12); G.State.addItem('iron_ore', 4);
  G.Puppet.build('julang');
  assert('巨狼制作扣料准确（灵木 12→7、玄铁 4→1）',
    cnt('puppet_julang') === 1 && cnt('spirit_wood') === 7 && cnt('iron_ore') === 1);
}

// ============ 覆盖：宗门月俸 / 功勋兑换 / 坊市铁匠铺 / 黑市轮换 ============
console.log('==== 五、宗门与坊市黑市渠道（覆盖） ====');
{
  // 筑基月俸：每月灵木×1 + 玄铁×1
  const p = reset(13);
  G.Cave2.joinInnerSect();
  const s0 = p.spiritStones;
  G.Core.passTime(3);
  assert('月俸 3 月发【百年灵木】×3', cnt('spirit_wood') === 3);
  assert('月俸 3 月发【玄铁矿石】×3', cnt('iron_ore') === 3);
  assert('月俸灵石照旧（3 月 ×10）', p.spiritStones === s0 + 30);

  // 功勋商铺：精魄 30 战功 / 灵木 20 战功
  const ex = G.DATA.CONTENT.SECT_EXCHANGE;
  const soul = ex.filter(function (e) { return e.id === 'beast_soul'; })[0];
  const wood = ex.filter(function (e) { return e.id === 'spirit_wood'; })[0];
  assert('功勋商铺上架精魄（30 战功）', !!soul && soul.cost === 30);
  assert('功勋商铺上架灵木（20 战功）', !!wood && wood.cost === 20);

  // 坊市铁匠铺：玄铁无限量货源
  const q = reset(13);
  q.location = 'shenshou_gu';
  const goods = G.Market.refreshGoods();
  const ore = goods.filter(function (g) { return g.id === 'iron_ore'; })[0];
  assert('坊市必然在架玄铁矿石', !!ore);
  assert('玄铁为无限量货源（infinite）', !!ore && ore.infinite === true);
  q.atMarket = true;
  q.spiritStones = 500;
  const idx = goods.indexOf(ore);
  G.Market.buy(idx);
  G.Market.buy(idx);
  assert('连买 2 块玄铁不断货', cnt('iron_ore') === 2 &&
    q.marketGoods.filter(function (g) { return g.id === 'iron_ore'; }).length === 1);

  // 货币兑换商：100 低阶灵石 → 1 中阶灵石
  const r = reset(13);
  r.spiritStones = 100;
  G.Market.exchangeStone();
  assert('100 低阶灵石兑 1 中阶灵石', cnt('mid_stone') === 1 && r.spiritStones === 0);
  G.Market.exchangeStone();
  assert('灵石不足时兑换被拒', cnt('mid_stone') === 1);

  // 黑市每 3 月轮换
  const cfg = G.DATA.CONTENT.BLACK_ROTATION;
  assert('黑市轮换周期为 3 月', !!cfg && cfg.months === 3);
  const t = reset(13);
  setRand(0.2);                       // 各货源命中上架
  G.BlackMarket.tickRotation();
  assert('黑市首期铺货成功', Array.isArray(t.blackGoods) && t.blackGoods.length >= 1);
  assert('黑市货架含精魄或天火晶', t.blackGoods.some(function (g) {
    return g.id === 'beast_soul' || g.id === 'tianhuo_crystal';
  }));
  const nextAt = t.blackNextRefresh;
  assert('下次轮换定在 3 月之后', nextAt === t.totalMonths + 3);
  t.spiritStones = 500;
  const g0 = t.blackGoods[0], id0 = g0.id, qty0 = g0.qty, have0 = cnt(id0);
  G.BlackMarket.buyRotation(0);
  assert('黑市购货入库且库存递减',
    cnt(id0) === have0 + 1 &&
    ((t.blackGoods[0] && t.blackGoods[0].qty === qty0 - 1) || qty0 === 1));
}

console.log('\n=== 结果: ' + pass + ' passed, ' + fail + ' failed ===');
if (fail) { console.log('失败项：'); fails.forEach(function (f) { console.log('  - ' + f); }); process.exit(1); }
