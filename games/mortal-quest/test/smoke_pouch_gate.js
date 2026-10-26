'use strict';
/* =========================================================
 * test/smoke_pouch_gate.js —— 储物袋解禁门槛 · 残血冲关二次确认
 * 覆盖：
 *   A pouchInfo：门槛 / 当前神识 / 水磨月数 / 非袋物品 / 兵解斗法中 / 余寿不足
 *   B tryOpenPouch：神识不足必弹窗（文案含门槛、差额、月数），绝不死点
 *   C 弹窗确认后才水磨；神识够则直接开并摊结算明细账
 *   D lowHpWarn 判据 + Core.breakthrough 残血拦阻（hpAck 只跳一层）
 * 运行： node test/smoke_pouch_gate.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

const logs = [];
let sheet = null;          // 最近一次 UI.showSheet 的 cfg
let sheetCount = 0;
let pouchResult = null;
const uiStub = {
  log: function (msg, type) { logs.push({ msg: String(msg), type: type }); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, showBreakthroughModal: function () {},
  showSheet: function (cfg) { sheet = cfg; sheetCount++; return {}; },
  showPouchResult: function (res) { pouchResult = res; },
  closeSheet: function () { sheet = null; }
};

let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub, BattleResult: { show: function () {} } };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
sandbox.setInterval = function (fn, ms) { return { fn: fn, ms: ms }; };
sandbox.clearInterval = function () { return; };
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills.js',
  'data/events.js', 'data/world.js', 'data/worldmap.js', 'data/content.js',
  'data/items_foundation.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js',
  'js/plot.js', 'js/mortality.js', 'js/breakthrough.js', 'js/moEvent.js',
  'js/market.js', 'js/map.js', 'js/alchemy.js',
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
function reset() {
  sheet = null; pouchResult = null; sheetCount = 0; clearLogs();
  var p = G.State.createNewPlayer('j');
  p.yindu = null; p.wounded = null; p.pendingEvent = null; p.pendingMercy = null;
  p.combat = null; p.marketRiskValue = 0;
  return p;
}

/* ================= A pouchInfo：唯一判据 ================= */
section('A pouchInfo（门槛 / 神识 / 水磨月数 / 拦停原因）');
var p = reset();
p.realmIndex = 5; p.spiritBonus = 0;           // 练气六层：神识 10
setInv('pouch_zhuji', 1);
var info = G.Core.pouchInfo('pouch_zhuji');
ok('筑基袋门槛 = 25（sealSpirit）', info.need === 25 && info.months === 4);
ok('练气六层神识 10 → 不足', info.spirit === 10 && info.ok === false);
ok('行囊里有几个也一并给出（have=1）', info.have === 1);
ok('未处斗法中 → 拦停原因为空', info.block === '');

p.realmIndex = 14;                              // 筑基中期：神识 72
ok('筑基中期神识 72 ≥ 25 → 可强破', G.Core.pouchInfo('pouch_zhuji').ok === true);

ok('非储物袋 → 有拦停说明（不是静默）', G.Core.pouchInfo('pill_huichun').block.length > 0);

p.combat = { foe: 'x' };
ok('斗法中 → 拦停原因讲人话', /斗法未了/.test(G.Core.pouchInfo('pouch_zhuji').block));
p.combat = null;

p.pendingEvent = { eventId: 'x' };
ok('悬案未了 → 拦停原因讲人话', /还没了断/.test(G.Core.pouchInfo('pouch_zhuji').block));
p.pendingEvent = null;

// 余寿撑不到磨开：筑基袋水磨 4 月，余寿只剩 6 月 → 预警
p.realmIndex = 5;
p.ageYears = G.State.maxAge() - 1; p.ageMonths = 6;
ok('余寿只够 6 月、水磨 4 月 → 标 lifeShort 预警', G.Core.pouchInfo('pouch_zhuji').lifeShort === true);
p.ageYears = 20; p.ageMonths = 0;
ok('寿元充裕 → 不预警', G.Core.pouchInfo('pouch_zhuji').lifeShort === false);

/* ================= B 神识不足：必弹窗，绝不死点 ================= */
section('B 神识不足：弹窗讲清门槛与代价');
p = reset();
p.realmIndex = 5; p.spiritBonus = 0;
setInv('pouch_zhuji', 1);
var tm0 = p.totalMonths || 0;
clearLogs();
G.Core.tryOpenPouch('pouch_zhuji');
ok('弹出了确认弹层', !!sheet && sheetCount === 1);
ok('标题是「抹除禁制」', sheet && sheet.title === '抹除禁制');
ok('文案点名门槛（需神识达到 25）', /需神识达到 25/.test(sheet.body));
ok('文案点名差额（尚差 15）', /尚差 <b>15<\/b>/.test(sheet.body));
ok('文案给出水磨月数（4 个月）', /<b>4<\/b> 个月/.test(sheet.body));
ok('给了精进神识的路子（养魂丹 / 控物术）', /养魂丹/.test(sheet.body) && /控物术/.test(sheet.body));
ok('主按钮写明代价（化开需 4 个月）', /水磨工夫化开（4 个月）/.test(sheet.okText));
ok('危险样式（朱砂色调）', sheet.danger === true);
ok('留了退路按钮（暂且收着）', sheet.cancelText === '暂且收着');
ok('弹窗阶段时间一个月都没走', (p.totalMonths || 0) === tm0);
ok('弹窗阶段袋子还在行囊', G.State.countItem('pouch_zhuji') === 1);
ok('弹层阶段没有误发结算面板', pouchResult === null);

// 点「暂且收着」不该有任何副作用
if (sheet && sheet.onCancel) sheet.onCancel();
ok('取消后袋子仍在、时间不动', G.State.countItem('pouch_zhuji') === 1 && (p.totalMonths || 0) === tm0);

// 再点一次，这次选「水磨」
clearLogs();
G.Core.tryOpenPouch('pouch_zhuji');
var pick = sheet;
if (pick && pick.onOk) pick.onOk();
ok('确认水磨后才推 4 个月', (p.totalMonths || 0) === tm0 + 4);
ok('水磨有过程日志', hasLog(/水磨/));
ok('磨开后袋子消耗', G.State.countItem('pouch_zhuji') === 0);
ok('磨开后弹出结算面板（不可静默入袋）', !!pouchResult);
ok('结算账目：forced=false / months=4 / 灵石有值', pouchResult && pouchResult.forced === false &&
  pouchResult.months === 4 && typeof pouchResult.stones === 'number');
ok('结算账目带物品数组', pouchResult && Array.isArray(pouchResult.items));

/* ================= C 神识够：直接开 + 摊明细 ================= */
section('C 神识够：一击而破，结算面板摊明细');
p = reset();
p.realmIndex = 14; p.spiritBonus = 50;          // 神识 122，碾压 25
setInv('pouch_zhuji', 1);
var tm1 = p.totalMonths || 0, st1 = p.spiritStones;
clearLogs();
G.Core.tryOpenPouch('pouch_zhuji');
ok('神识够：不弹确认弹层', sheetCount === 0);
ok('神识够：直接走结算面板', !!pouchResult);
ok('结算账目：forced=true / months=1', pouchResult && pouchResult.forced === true && pouchResult.months === 1);
ok('强破只耗 1 个月', (p.totalMonths || 0) === tm1 + 1);
ok('账上的灵石与身上涨的一致', pouchResult && (p.spiritStones - st1) === pouchResult.stones);
ok('要么给灵石要么给物（blank 袋子不存在）', pouchResult && (pouchResult.stones > 0 || pouchResult.items.length > 0));
ok('见闻录有破除成功的日志', hasLog(/应声而开/));
ok('见闻录有入袋明细', hasLog(/尽数倒出/));

/* ================= D 残血冲关：二次确认 ================= */
section('D lowHpWarn + breakthrough 残血拦阻');
p = reset();
p.maxHp = 329; p.currentHp = 40;
var why = G.Core.lowHpWarn(p);
ok('气血 40/329 → 有预警', why.length > 0);
ok('预警带具体数值（40/329）', /40\/329/.test(why));
ok('预警点名回春散', /回春散/.test(why));
p.currentHp = 100;
ok('气血 100/329（30.4%）→ 不预警', G.Core.lowHpWarn(p) === '');
p.currentHp = 98;
ok('气血 98/329（29.8%）→ 预警', G.Core.lowHpWarn(p).length > 0);
p.currentHp = 0; p.maxHp = 0;
ok('上限为 0 → 不预警（不除以零）', G.Core.lowHpWarn(p) === '');

// 真跑一次突破：残血必须停在弹窗，修为/境界一点不动
p = reset();
p.realmIndex = 3;                                // 练气四层
p.maxHp = 329; p.currentHp = 40;
p.currentExp = G.DATA.REALMS[3].needExp;         // 修为已满，本可冲关
sheetCount = 0; sheet = null;
var realm0 = p.realmIndex, exp0 = p.currentExp;
G.Core.breakthrough();
ok('残血点突破 → 弹二次确认', !!sheet && /气血大损/.test(sheet.title));
ok('弹窗文案是那条预警', sheet && sheet.body.indexOf('40/329') >= 0);
ok('给了「仍要强行冲关」与「先调息疗伤」两出口',
  sheet && /强行冲关/.test(sheet.okText) && /调息疗伤/.test(sheet.cancelText));
ok('拦阻阶段境界不变', p.realmIndex === realm0);
ok('拦阻阶段修为不变', p.currentExp === exp0);

// 点「先调息疗伤」不该掷骰、不该掉血
if (sheet && sheet.onCancel) sheet.onCancel();
ok('取消后境界/修为仍不动', p.realmIndex === realm0 && p.currentExp === exp0);

// 带 hpAck 再冲：不许再弹气血弹窗（只跳一层，不记忆）
sheetCount = 0; sheet = null;
G.Core.breakthrough({ hpAck: true });
ok('hpAck 续跳不再弹气血弹窗', !(sheet && /气血大损/.test(sheet.title || '')));

console.log('\n================ 结果：' + pass + ' 通过 / ' + fail + ' 失败 ================');
if (fail) { console.log('失败清单：\n - ' + fails.join('\n - ')); process.exit(1); }
