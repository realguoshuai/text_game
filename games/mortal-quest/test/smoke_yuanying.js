'use strict';
/* =========================================================
 * test/smoke_yuanying.js —— 元婴篇（阶段一）回归测试
 *   ① 数据结构：元婴三阶、YUANING 数值表、铺路事件、元神出游地
 *   ② 1.1 境界扩展：plan.gate=yuanying；foundation 写入；顶境在元婴后期
 *   ③ 1.2 碎丹成婴：offerPrep 只问一次；事件按资源动态裁剪；三铺路结算
 *       （扣资源/写 prep/静养耗时）；plan 读 prep 出加成（含反向对照）
 *   ④ 1.3 元神出游：门禁（非元婴/有事/CD）；远巡掷池；冷却递减
 * 运行： node test/smoke_yuanying.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, showBreakthroughModal: function () {}
};

let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/content.js',
  'data/world.js', 'data/events.js', 'data/wild_dungeons.js', 'data/skills_foundation.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js',
  'js/chronicle.js', 'js/faction.js', 'js/path.js', 'js/seize.js',
  'js/breakthrough.js', 'js/yuanying.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

function mk(o) {
  o = o || {};
  const p = G.State.createNewPlayer('j');
  p.realmIndex = (o.realmIndex == null) ? 18 : o.realmIndex;
  if (o.yuanyingPrep !== undefined) p.yuanyingPrep = o.yuanyingPrep;
  if (o.spells) p.spells = o.spells;
  if (o.inventory) p.inventory = o.inventory;
  if (o.spiritStones != null) p.spiritStones = o.spiritStones;
  if (o.mind != null) p.mind = o.mind;
  if (o.roamCd != null) p.roamCd = o.roamCd;
  if (o.seclusion !== undefined) p.seclusion = o.seclusion;
  if (o.pendingEvent !== undefined) p.pendingEvent = o.pendingEvent;
  if (o.xinmoImmunity !== undefined) p.xinmoImmunity = o.xinmoImmunity;
  return p;
}
function P() { return G.State.p(); }
function atRealm(ri) { P().realmIndex = ri; }

/* ================= ① 数据结构 ================= */
section('① 数据结构：元婴三阶 / YUANING 表 / 铺路事件 / 出游地');
ok('REALMS 长度 22（19~21 为元婴三阶）', G.DATA.REALMS.length === 22);
ok('元婴三阶名称', G.DATA.REALMS[19].name === '元婴初期' && G.DATA.REALMS[20].name === '元婴中期' && G.DATA.REALMS[21].name === '元婴后期');
ok('元婴寿元 1000', G.DATA.REALMS[19].maxAge === 1000 && G.DATA.REALMS[20].maxAge === 1000 && G.DATA.REALMS[21].maxAge === 1000);
ok('元婴战力高于结丹（atk 380 起）', G.DATA.REALMS[19].atk === 380 && G.DATA.REALMS[19].atk > G.DATA.REALMS[18].atk);
ok('YUANING 表：裸冲 3% / 六成身陨 / 600 伤', G.DATA.YUANING.bare.chance === 0.03 && G.DATA.YUANING.bare.deathChance === 0.60 && G.DATA.YUANING.bare.dmg === 600);
ok('YUANING 三铺路参数', G.DATA.YUANING.herb.add === 0.15 && G.DATA.YUANING.guard.add === 0.05 && G.DATA.YUANING.guard.deathMul === 0 && G.DATA.YUANING.mind.add === 0.08 && G.DATA.YUANING.guardCost === 3000);
ok('铺路事件四选项（含无备硬凝）', (G.DATA.YUANING_EVENTS.yuanying_prep.choices || []).length === 4);
ok('出游地两块（云国 + 碎星海）', (G.DATA.ROAM_SITES || []).length === 2 && G.DATA.ROAM_SITES[1].chapter === 'star');
ok('出游池权重合计 ≈ 1', Math.abs(G.DATA.ROAM_SITES[0].pool.reduce(function (a, b) { return a + b.chance; }, 0) - 1) < 1e-9);

/* ================= ② 1.1 境界扩展 ================= */
section('② 1.1 境界扩展：gate / foundation / 顶境');
mk({ realmIndex: 18 });
ok('结丹后期 → gate=yuanying', G.Breakthrough.plan(P()).gate === 'yuanying');
ok('元婴三阶 foundation 写入（hp 18000 起 / defSuppress 0.95）', G.DATA.REALMS[19].hp === 18000 && G.DATA.REALMS[19].defSuppress === 0.95 && G.DATA.REALMS[21].hp === 45000);
ok('元婴神识上限（SP 320 起）', G.DATA.REALMS[19].sp === 320 && G.DATA.REALMS[21].sp === 550);
atRealm(21);
ok('元婴后期为顶境（plan.ok=false）', G.Breakthrough.plan(P()).ok === false && G.Breakthrough.plan(P()).reason === 'top');
atRealm(18);
ok('元婴内部走常规修为（初→中 22%）', G.DATA.REALMS[19].breakChance === 0.22);

/* ================= ③ 1.2 碎丹成婴 ================= */
section('③ 1.2 碎丹成婴：offerPrep / 动态裁剪 / 三铺路结算');
let p = mk({ realmIndex: 18 });
ok('offerPrep：结丹后期可问', G.Yuanying.offerPrep(p) === true);
ok('offerPrep 只问一次（防 resume 重复挂）', G.Yuanying.offerPrep(p) === false);
p.yuanyingPrep = 'herb';
ok('已铺路 → 不再问（失败重试沿用加成）', G.Yuanying.offerPrep(p) === false);

p = mk({ realmIndex: 17 });
ok('非结丹后期 → 不问', G.Yuanying.offerPrep(p) === false);

// 动态裁剪
p = mk({ realmIndex: 18, inventory: { herb_qiannian: 1 }, spiritStones: 5000 });
let ev = G.Core.findEvent('yuanying_prep');
ok('有药有钱 → 四选项全列', ev.choices.length === 4);
p = mk({ realmIndex: 18, inventory: {}, spiritStones: 100 });
ev = G.Core.findEvent('yuanying_prep');
ok('无药无钱 → 只剩静养与无备', ev.choices.length === 2 &&
  ev.choices.every(function (c) { return ['mind', 'bare'].indexOf(c.outcomes[0].mode) >= 0; }));
p = mk({ realmIndex: 18, inventory: { herb_qiannian: 2 }, spiritStones: 100 });
ev = G.Core.findEvent('yuanying_prep');
ok('有药无钱 → 列借药，不列护法', ev.choices.length === 3 &&
  ev.choices.some(function (c) { return c.outcomes[0].mode === 'herb'; }) &&
  !ev.choices.some(function (c) { return c.outcomes[0].mode === 'guard'; }));

// 铺路结算：借灵药
p = mk({ realmIndex: 18, inventory: { herb_qiannian: 1 } });
G.Yuanying.setPrep({ mode: 'herb' });
ok('借灵药：扣 1 株 + prep=herb', G.State.countItem('herb_qiannian') === 0 && P().yuanyingPrep === 'herb');
p = mk({ realmIndex: 18, inventory: {} });
G.Yuanying.setPrep({ mode: 'herb' });
ok('无药借药 → 拒绝且不写 prep', P().yuanyingPrep == null);

// 铺路结算：寻护法
p = mk({ realmIndex: 18, spiritStones: 3000 });
G.Yuanying.setPrep({ mode: 'guard' });
ok('寻护法：扣 3000 灵石 + prep=guard', P().spiritStones === 0 && P().yuanyingPrep === 'guard');
p = mk({ realmIndex: 18, spiritStones: 2999 });
G.Yuanying.setPrep({ mode: 'guard' });
ok('灵石不足 → 拒绝且不写 prep', P().yuanyingPrep == null && P().spiritStones === 2999);

// 铺路结算：静养（耗时 6 月 + 心境 +10）
p = mk({ realmIndex: 18, mind: 0 });
const months0 = P().totalMonths || 0;
G.Yuanying.setPrep({ mode: 'mind' });
ok('静养：prep=mind + 心境 +10', P().yuanyingPrep === 'mind' && P().mind === 10);
ok('静养：耗时 6 个月（passTime 被调用）', (P().totalMonths || 0) - months0 === 6);

// plan 读 prep 出加成
p = mk({ realmIndex: 18, yuanyingPrep: 'herb' });
ok('herb → 基础 18%（3+15）、反噬 ×0.7', Math.abs(G.Breakthrough.plan(P()).baseChance - 0.18) < 1e-9 && Math.abs(G.Breakthrough.plan(P()).dmgMul - 0.7) < 1e-9);
p = mk({ realmIndex: 18, yuanyingPrep: 'guard' });
ok('guard → 基础 8%（3+5）、反噬 ×0.5、免死', Math.abs(G.Breakthrough.plan(P()).baseChance - 0.08) < 1e-9 && Math.abs(G.Breakthrough.plan(P()).dmgMul - 0.5) < 1e-9 && G.Breakthrough.plan(P()).deathMul === 0);
p = mk({ realmIndex: 18, yuanyingPrep: 'mind', mind: 10 });
ok('mind → 基础 11%（3+8），心境另加 2%', Math.abs(G.Breakthrough.plan(P()).baseChance - 0.11) < 1e-9);
p = mk({ realmIndex: 18 });
ok('无铺路 → 裸凝 3%、bareYuanying', G.Breakthrough.plan(P()).baseChance === 0.03 && G.Breakthrough.plan(P()).bareYuanying === true);
ok('裸凝身陨率 ≈ 失败率×60%', Math.abs(G.Breakthrough.plan(P()).deathP - 0.97 * 0.60) < 1e-9);

// 全流程 A：breakthrough 挂事件 → 选铺路 → 续破（无心魔免疫，续破途中会再过心魔劫）
p = mk({ realmIndex: 18, inventory: { herb_qiannian: 1 } });
p.currentExp = 999999;
G.Core.breakthrough();
ok('点破境 → 挂起碎丹成婴事件', !!P().pendingEvent && P().pendingEvent.eventId === 'yuanying_prep' && P().pendingEvent.resume === 'breakthrough');
G.Core.chooseEventOption(0);   // 借灵药（第一项）
ok('选铺路 → prep 写入', P().yuanyingPrep === 'herb');
ok('铺路后续破，元婴亦要过心魔劫（两层事件串联）', !!P().pendingEvent && P().pendingEvent.eventId === 'heart_demon');
_rand = 0;                     // 必成（心魔劫选项内部即完成续破与掷骰，无需再点突破）
G.Core.chooseEventOption(0);   // 心魔劫第一项
ok('元婴功成：realmIndex=19', P().realmIndex === 19);
ok('元婴功成：prep 清空（防重复消耗）', P().yuanyingPrep == null);
ok('元婴功成：气血上限按 foundation 落位（18000）', P().maxHp === 18000);

// 全流程 B：尘缘已斩（xinmoImmunity）→ 铺路后直接续破，无心魔劫（_rand=0 必成）
p = mk({ realmIndex: 18, inventory: { herb_qiannian: 1 }, xinmoImmunity: true });
p.currentExp = 999999;
G.Core.breakthrough();
G.Core.chooseEventOption(0);
ok('尘缘已斩 → 铺路后不挂心魔劫，直接破境', P().realmIndex === 19);
ok('B 线破境后 prep 清空', P().yuanyingPrep == null);
ok('B 线破境后古灵药已耗（不白拿加成）', G.State.countItem('herb_qiannian') === 0);

/* ================= ④ 1.3 元神出游 ================= */
section('④ 1.3 元神出游：门禁 / 掷池 / 冷却');
p = mk({ realmIndex: 17 });
ok('非元婴 → 不可出游', G.Yuanying.canRoam(P()).ok === false);
p = mk({ realmIndex: 19 });
ok('元婴 → 可出游', G.Yuanying.canRoam(P()).ok === true);
ok('元婴出游地含云国山河', G.Yuanying.roamSites(P()).some(function (s) { return s.id === 'yunguo'; }));
P().pendingEvent = { eventId: 'x' };
ok('有挂起事件 → 不可出游', G.Yuanying.canRoam(P()).ok === false);
P().pendingEvent = null;
P().seclusion = { id: 'epic' };
ok('闭关中 → 不可出游', G.Yuanying.canRoam(P()).ok === false);
P().seclusion = null;
P().roamCd = 2;
ok('冷却中 → 不可出游', G.Yuanying.canRoam(P()).ok === false);
ok('冷却文案', G.Yuanying.label(P()).indexOf('2 个月') >= 0);
P().roamCd = 0;

// 掷池：遗藏（0.30 命中）
_rand = 0.1;
p = mk({ realmIndex: 19, inventory: {} });
G.Yuanying.roam('yunguo');
ok('远巡遗藏：得修为（+50）', P().currentExp === 50);
ok('远巡后冷却 3 个月', P().roamCd === 3);
ok('远巡耗时 1 个月', (P().totalMonths || 0) > 0);
// 掷池：神识受损（0.90 之后命中 hurt 0.10）
_rand = 0.95;
p = mk({ realmIndex: 19, mind: 20 });
G.Yuanying.roam('yunguo');
ok('神识受损 → 心境 -5', P().mind === 15);
// 掷池：灵药（0.20~0.50 命中 herb）
_rand = 0.4;
p = mk({ realmIndex: 19, inventory: {} });
G.Yuanying.roam('yunguo');
ok('云国远巡得 1 株千年灵药（碎丹成婴的来路）', G.State.countItem('herb_qiannian') === 1);
// 碎星海远巡：须身在碎星海才列入 roamSites（此处验证门禁过滤，不依赖地图模块加载）
p = mk({ realmIndex: 19, location: 'shenshou_gu', inventory: {} });
ok('身在云国 → 出游地不含碎星海', !G.Yuanying.roamSites(P()).some(function (s) { return s.id === 'suixing'; }));
const _suixing = G.DATA.ROAM_SITES.filter(function (s) { return s.id === 'suixing'; })[0];
ok('碎星海出游池更肥（灵药 25% > 云国 20%）', _suixing.pool[1].chance === 0.25);
_rand = 0.5;

// 冷却递减（passTime → tick）
p = mk({ realmIndex: 19, roamCd: 3 });
G.Core.passTime(1);
ok('passTime 递减出游冷却（3→2）', P().roamCd === 2);
G.Core.passTime(5);
ok('冷却归零不穿负', P().roamCd === 0);

console.log('\n──────────────────────────────────────────────');
console.log('  结果：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('  失败项：' + fails.join(' | ')); process.exit(1); }
