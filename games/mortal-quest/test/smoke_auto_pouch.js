'use strict';
/* =========================================================
 * test/smoke_auto_pouch.js —— 持续闭关 · 敌修储物袋 · 丹毒渐抗
 * 覆盖：
 *   A 持续闭关：开启/暂停 toggle；四类智能打断（修为满/绿液·灵药成熟/剧情节点/
 *     重伤阴毒寿元）；开局即有拦路条件时拒绝开启；换局静默撤钟
 *   B 储物袋：pouchDrop 阶级分档（人形才掉、留活口不取、妖兽不取）；
 *     openPouch 神识够直接开 / 不够水磨数月；盲池只出真实物品
 *   C 丹毒：pillPotency 三段式（前 3 颗十足、-15%/颗、地板 30%）；
 *     连服黄龙丹收益序列递减；疗伤丹不受计数影响
 * 运行： node test/smoke_auto_pouch.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

const logs = [];
const uiStub = {
  log: function (msg, type, fold) { logs.push({ msg: String(msg), type: type, fold: fold || null }); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, showBreakthroughModal: function () {}
};

let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub, BattleResult: { show: function () {} } };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
// 假定时器：vm 沙箱没有 node 的定时器全局；逻辑测试直接驱动 _autoTick，
// 这里只需让 autoCult 拿到一个真值句柄、clearInterval 能撤掉它。
sandbox.setInterval = function (fn, ms) { return { fn: fn, ms: ms }; };
sandbox.clearInterval = function (h) { return; };
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills.js',
  'data/events.js', 'data/world.js', 'data/worldmap.js', 'data/content.js',
  'data/qixuan_events.js', 'data/demon_war_events.js', 'data/skills_foundation.js',
  'data/items_foundation.js', 'data/dungeon_heisha.js', 'data/secret_relic.js',
  'data/wild_dungeons.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js',
  'js/plot.js', 'js/mortality.js', 'js/breakthrough.js', 'js/moEvent.js',
  'js/market.js', 'js/map.js', 'js/jiayuan.js', 'js/mansion.js', 'js/tainan.js',
  'js/sect.js', 'js/garden.js', 'js/home.js', 'js/codex.js', 'js/blackmarket.js',
  'js/trial.js', 'js/forbidden_zone.js', 'js/qixuan.js', 'js/puppet.js',
  'js/insect.js', 'js/cave2.js', 'js/cultivation.js', 'js/alchemy.js',
  'js/bottle.js', 'js/bonds.js', 'js/dungeon_heisha.js', 'js/secret_relic.js',
  'js/secret.js', 'js/hunt.js', 'js/teleport_portal.js', 'js/endings.js',
  'js/goals.js', 'js/review.js', 'js/moments.js', 'js/tips.js', 'js/auction.js',
  'js/chronicle.js', 'js/path.js', 'js/seize.js', 'js/yuanying.js', 'js/faction.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }
function hasLog(re) { return logs.some(function (l) { return re.test(l.msg); }); }
function clearLogs() { logs.length = 0; }
function setInv(id, n) { var p = G.State.p(); p.inventory = p.inventory || {}; p.inventory[id] = n; }

/* ================= A 持续闭关 ================= */
section('A 持续闭关（自动时间流 + 智能打断）');
var p = G.State.createNewPlayer('j');
p.realmIndex = 13;                 // 筑基初期：meditateMonths=8，needExp 有值
p.sectId = null; p.shichong = null; p.yindu = null; p.causal = null;
p.marketRiskValue = 0; p.wounded = null; p.pendingEvent = null; p.pendingMercy = null;
p.moEvent = null; p.tracking = null;
p.liquid = 0;
// 序章剧情锁：新局 Qixuan.active() 为真会锁死洞府操作（与 btn-meditate 置灰同一规矩），
// 本组只验自动时间流本身，按浏览器实测的同款做法临时摘除。
G.Qixuan.active = function () { return false; };
// Plot.status 打桩：成熟计数可操控（真实 tick 仍在跑，不干扰本组断言）
var _readyVal = 0;
G.Plot.status = function () { return { growing: 0, ready: _readyVal }; };

var Core = G.Core;
ok('初始不在运行', Core.autoCultRunning() === false);
var exp0 = p.currentExp;
Core.autoCult();
ok('开启后进入运行态', Core.autoCultRunning() === true);
ok('开启有引导日志', hasLog(/持续闭关吐纳/));
Core._autoTick(); Core._autoTick();
ok('两次 tick 修为 +2', p.currentExp === exp0 + 2);
Core.autoCult();
ok('再点一次即暂停', Core.autoCultRunning() === false);
ok('暂停有收功日志', hasLog(/自行收功/));

// —— 打断①：修为满瓶颈 ——
clearLogs();
var realm = G.DATA.REALMS[p.realmIndex];
p.currentExp = realm.needExp - 1;
Core.autoCult();
Core._autoTick();          // 打完坐正好满
Core._autoTick();          // 这一次检定必须停机
ok('打断① 修为满即停', Core.autoCultRunning() === false);
ok('打断① 说明是瓶颈', hasLog(/瓶颈/));

// —— 打断②：绿液新凝 / 灵药成熟 ——
clearLogs();
p.currentExp = 0; p.liquid = 0;
Core.autoCult();
p.liquid = 3;               // 模拟闭关期间承露瓶凝结
Core._autoTick();
ok('打断②a 绿液新凝即停', Core.autoCultRunning() === false);
ok('打断②a 说明是绿液', hasLog(/绿液/));

clearLogs();
p.currentExp = 0;
Core.autoCult();
_readyVal = 1;              // 模拟药圃灵药成熟
Core._autoTick();
ok('打断②b 灵药成熟即停', Core.autoCultRunning() === false);
ok('打断②b 说明是成熟', hasLog(/灵药成熟/));
_readyVal = 0;

// —— 打断③：剧情节点（待决事件 / 觊觎满截杀 / 尾随） ——
clearLogs();
p.currentExp = 0; p.pendingEvent = { eventId: 'x' };
Core.autoCult();
ok('打断③a 有待决事件时根本开不了', Core.autoCultRunning() === false);
ok('打断③a 拒绝原因说人话', hasLog(/前路有变故/));
p.pendingEvent = null;

clearLogs();
p.currentExp = 0; p.marketRiskValue = 90;
Core.autoCult();
Core._autoTick();
ok('打断③b 觊觎满即停', Core.autoCultRunning() === false);
ok('打断③b 提示截杀之危', hasLog(/觊觎已满/));
p.marketRiskValue = 0;

// —— 打断④：重伤 / 阴毒将发 / 寿元不足一年 ——
clearLogs();
p.currentExp = 0; p.wounded = true;
Core.autoCult();
ok('打断④a 重伤开不了（先去疗伤）', Core.autoCultRunning() === false);
ok('打断④a 指向疗伤', hasLog(/静坐疗伤/));
p.wounded = null;

clearLogs();
p.currentExp = 0; p.yindu = { months: 1 };
Core.autoCult();
Core._autoTick();
ok('打断④b 阴毒余 1 月即停', Core.autoCultRunning() === false);
ok('打断④b 提示阴毒翻涌', hasLog(/阴毒翻涌/));
p.yindu = null;

clearLogs();
p.currentExp = 0;
var left = G.Time.remain(p).total;
p.ageYears = (G.State.maxAge() - 1); p.ageMonths = 11;   // 余 1 个月
Core.autoCult();
ok('打断④c 寿元不足一年开不了', Core.autoCultRunning() === false);
ok('打断④c 提示坐以待毙', hasLog(/坐以待毙/));
p.ageYears = 20; p.ageMonths = 0;

// —— 换局静默撤钟（读档/重开换了 player 对象） ——
clearLogs();
p.currentExp = 0;
Core.autoCult();
var oldP = G.State.p();
G.State.player = G.State.createNewPlayer('j');   // 模拟 loadFromSlot 的整体替换
Core._autoTick();
ok('换局后定时器静默撤除', Core.autoCultRunning() === false);
ok('换局不刷中止日志（无声撤）', !hasLog(/持续闭关中止/));
G.State.player = oldP;

/* ================= B 敌修储物袋 ================= */
section('B 敌修储物袋（杀人夺袋 · 抹禁制 · 开盲盒）');
var p2 = G.State.createNewPlayer('j');
p2.realmIndex = 13; p2.sectId = null; p2.marketRiskValue = 0;
p2.yindu = null; p2.wounded = null;

// pouchDrop 阶级分档
clearLogs();
_rand = 0.5;   // < 0.70 → 掉袋
G.Combat.pouchDrop({ id: 'x', human: true, majorRealm: 0, tier: 1 }, 1);
ok('人形敌修掉袋（低阶）', G.State.countItem('pouch_low') === 1);
ok('掉袋日志提到神识烙印', hasLog(/神识烙印/));
G.Combat.pouchDrop({ id: 'x', human: true, majorRealm: 1 }, 1);
ok('筑基阶级 → 筑基邪修袋', G.State.countItem('pouch_zhuji') === 1);
G.Combat.pouchDrop({ id: 'x', human: true, majorRealm: 3 }, 1);
ok('元婴阶级 → 结丹袋', G.State.countItem('pouch_jiedan') === 1);
_rand = 0.9;   // ≥ 0.70 → 不掉
G.Combat.pouchDrop({ id: 'x', human: true, majorRealm: 0 }, 1);
ok('机率未中则不掉', G.State.countItem('pouch_low') === 1);
G.Combat.pouchDrop({ id: 'x', isBeast: true, tier: 2 }, 1);
ok('妖兽不掉袋', G.State.countItem('pouch_low') === 1);
G.Combat.pouchDrop({ id: 'x', human: true, majorRealm: 1 }, 0.6);
ok('留活口（ratio<1）不取袋', G.State.countItem('pouch_zhuji') === 1);

// openPouch：神识够 → 直接震碎
clearLogs();
_rand = 0.5;
var p3 = G.State.createNewPlayer('j');
p3.realmIndex = 13; p3.spiritBonus = 100;      // 神识碾压 seal=45
p3.yindu = null; p3.wounded = null;
setInv('pouch_jiedan', 1);
var tm0 = p3.totalMonths || 0, st0 = p3.spiritStones;
var resOk = G.Core.openPouch('pouch_jiedan');
ok('神识够：袋子消耗掉', G.State.countItem('pouch_jiedan') === 0);
ok('神识够：返回明细账（forced=true / 1 月）', !!resOk && resOk.forced === true && resOk.months === 1);
ok('神识够：只耗 1 个月', (p3.totalMonths || 0) === tm0 + 1);
ok('开袋日志是凡人风摸尸', hasLog(/尽数倒出/));
ok('开袋有实物入账（灵石或物品）', p3.spiritStones > st0 ||
    Object.keys(p3.inventory).some(function (k) { return k !== 'pouch_jiedan' && p3.inventory[k] > 0; }));

// openPouch：神识不够 → 没有玩家确认就绝不动手（时间不能被界面偷走）
clearLogs();
var p4 = G.State.createNewPlayer('j');
p4.realmIndex = 5; p4.spiritBonus = 0;         // 练气神识 < seal=45
p4.yindu = null; p4.wounded = null;
setInv('pouch_jiedan', 1);
var tm1 = p4.totalMonths || 0;
var info4 = G.Core.pouchInfo('pouch_jiedan');
ok('pouchInfo 报不足（神识 ' + info4.spirit + ' < 禁制 ' + info4.need + '）', info4.ok === false && info4.need === 45);
ok('pouchInfo 给出水磨月数', info4.months === 6);
ok('神识不足且未确认 → 拒绝动手（返回 null）', G.Core.openPouch('pouch_jiedan') === null);
ok('神识不足且未确认 → 一个月都不走', (p4.totalMonths || 0) === tm1);
ok('神识不足且未确认 → 袋子还在', G.State.countItem('pouch_jiedan') === 1);

// 玩家在弹窗里选了「水磨」之后（opts.grind）才真推时间
var resGrind = G.Core.openPouch('pouch_jiedan', { grind: true });
ok('确认水磨：耗 6 个月（pouch_jiedan.sealMonths）', (p4.totalMonths || 0) === tm1 + 6);
ok('水磨有提示日志', hasLog(/水磨/));
ok('磨开封口后袋子照样消耗', G.State.countItem('pouch_jiedan') === 0);
ok('水磨返回明细账（forced=false / 6 月）', !!resGrind && resGrind.forced === false && resGrind.months === 6);

// 盲池只出真实物品（扫全部池子，防手滑打错 id）
var poolBad = [];
Object.keys(G.DATA.POUCH_LOOT).forEach(function (tier) {
  G.DATA.POUCH_LOOT[tier].forEach(function (l) {
    if (l.id !== 'stones' && !G.DATA.ITEMS[l.id]) poolBad.push(tier + ':' + l.id);
  });
});
ok('盲池无悬空物品 id', poolBad.length === 0);
var tier3 = G.DATA.POUCH_LOOT['3'].map(function (l) { return l.id; });
ok('结丹袋才掉金髓丸/养魂丹方（高阶物不贱卖）', tier3.indexOf('pill_jinsui') >= 0 && tier3.indexOf('recipe_yanghun') >= 0);
ok('低阶袋不掉金髓丸', G.DATA.POUCH_LOOT['1'].every(function (l) { return l.id !== 'pill_jinsui'; }));

/* ================= C 丹毒渐抗 ================= */
section('C 丹药丹毒（耐药性递减）');
var p5 = G.State.createNewPlayer('j');
p5.realmIndex = 13; p5.yindu = null; p5.wounded = null;
var pot0 = G.Core.pillPotency('pill_huanglong');
ok('未服过：药效十足', pot0.mult === 1 && pot0.taken === 0 && pot0.free === 3);
p5.pillExpCount = { pill_huanglong: 3 };
ok('第 4 颗起 ×0.85', G.Core.pillPotency('pill_huanglong').mult === 0.85);
p5.pillExpCount = { pill_huanglong: 5 };
ok('第 6 颗 ×0.55', G.Core.pillPotency('pill_huanglong').mult === 0.55);
p5.pillExpCount = { pill_huanglong: 99 };
ok('地板 30%', G.Core.pillPotency('pill_huanglong').mult === 0.3);

// 连服 8 颗黄龙丹：25,25,25,21,18,14,10,8
var p6 = G.State.createNewPlayer('j');
p6.realmIndex = 13; p6.yindu = null; p6.wounded = null;
setInv('pill_huanglong', 20);
var gains = [];
for (var i = 0; i < 8; i++) {
  var e0 = p6.currentExp;
  G.Core.takePill('pill_huanglong');
  gains.push(p6.currentExp - e0);
}
ok('连服收益序列 25/25/25/21/18/14/10/8', JSON.stringify(gains) === '[25,25,25,21,18,14,10,8]');
ok('服用计数落存档字段', p6.pillExpCount.pill_huanglong === 8);
ok('渐抗提示进日志', hasLog(/连服渐抗/));

// 疗伤丹不吃丹毒计数（ heal 不受 exp 渐抗影响）
var p7 = G.State.createNewPlayer('j');
p7.realmIndex = 13; p7.yindu = null; p7.wounded = null;
p7.currentHp = 10;
setInv('pill_huichun', 3);
G.Core.takePill('pill_huichun'); G.Core.takePill('pill_huichun');
ok('疗伤丹反复服照样回血（不吃丹毒）', p7.currentHp === Math.min(p7.maxHp, 10 + 120));
ok('疗伤丹不记入丹毒计数', !p7.pillExpCount || !p7.pillExpCount.pill_huichun);

// 老存档无 pillExpCount 字段不崩
var p8 = G.State.createNewPlayer('j');
delete p8.pillExpCount;
ok('老存档缺字段安全兜底', G.Core.pillPotency('pill_huanglong').taken === 0);

console.log('\n================ 结果：' + pass + ' 通过 / ' + fail + ' 失败 ================');
if (fail) { console.log('失败项：' + fails.join(' | ')); process.exit(1); }
