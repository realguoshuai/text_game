'use strict';
/* =========================================================
 * test/smoke_breakthrough.js —— 破境筹备（骰子可做重）回归测试
 *   ① 模块与配置：GAME.Breakthrough / GAME.DATA.BREAK_PREP 落位
 *   ② 关隘识别：normal / zhuji(12) / jiedan(21)
 *   ③ 常规境界底子：无加成时 = realm.breakChance
 *   ④ 灵脉：上品灵峰 +6% 且反噬 ×0.8（灵石租金的回报）
 *   ⑤ 护法：自选开关、气血门槛、突破抽血 40%、灵石温养补给
 *   ⑥ 心境：每 10 点 +2%、反噬 -3%（下限 0.7）
 *   ⑦ 结丹/筑基丹链：连服叠加、四丹拉满 100%（不被 98% 砍）
 *   ⑧ 反噬与身陨估算：裸冲 3% → 身陨 92.15%；服丹免死；降尘丹 ×0.2
 *   ⑨ 唯一出口：plan 的成功率就是 _rollBreakthrough 实际掷的骰子（边界双向验证）
 * 运行： node test/smoke_breakthrough.js
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
  showBreakthroughModal: function () {}
};

let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills_foundation.js',
  'data/world.js', 'data/content.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js', 'js/plot.js', 'js/mortality.js', 'js/breakthrough.js',
  'js/cave2.js', 'js/cultivation.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }
function near(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }

// 降尘丹走 GAME.Alchemy；此处只验倍率链路，桩掉炼丹模块避免整文件加载
G.Alchemy = {
  breakDmgMul: function () { return 0.2; },
  consumeJiangchen: function () { const p = G.State.p(); p.jiangchen = false; return true; },
};
G.Core.tryRescue = function () { return false; };

const P = () => G.State.p();
function atRealm(idx, exp) {
  G.State.createNewPlayer();
  const p = P();
  p.realmIndex = idx;
  p.currentExp = (exp == null) ? (G.DATA.REALMS[idx].needExp || 0) : exp;
  p.mind = 0; p.peak = 'low'; p.btGuard = false;
  p.companion = null; p.jiangchen = false; p.threeTurnCount = 0;
  p.zhujiStreak = 0; p.zhujiFails = 0; p.jiedanStreak = 0; p.jiedanFails = 0;
  p.bag = {}; p.spiritStones = 0;
  return p;
}

/* ================= ① 模块与配置 ================= */
section('① 模块与配置');
ok('GAME.Breakthrough 已挂载', !!G.Breakthrough);
ok('plan / guardOf / advice / healCompanion / setGuard 齐备',
  ['plan', 'guardOf', 'advice', 'healCompanion', 'setGuard', 'veinOf'].every(k => typeof G.Breakthrough[k] === 'function'));
const CFG = G.DATA.BREAK_PREP;
ok('灵脉三档：0 / 3% / 6%', CFG.vein.low.add === 0 && CFG.vein.mid.add === 0.03 && CFG.vein.high.add === 0.06);
ok('灵脉减伤：杂役 1.0 / 中品 0.9 / 上品 0.8',
  CFG.vein.low.dmgMul === 1 && CFG.vein.mid.dmgMul === 0.9 && CFG.vein.high.dmgMul === 0.8);
ok('护法：+4%、抽血 40%、气血门槛 50%、温养 30 灵石',
  CFG.guard.add === 0.04 && CFG.guard.hpCostPct === 0.4 && CFG.guard.minHpPct === 0.5 && CFG.guard.healCost === 30);

/* ================= ② 关隘识别 ================= */
section('② 关隘识别');
atRealm(0); ok('练气一层 → normal', G.Breakthrough.gate(P()) === 'normal');
atRealm(12); ok('练气十三层 → zhuji', G.Breakthrough.gate(P()) === 'zhuji');
atRealm(14); ok('筑基中期 → normal', G.Breakthrough.gate(P()) === 'normal');
atRealm(15); ok('筑基后期 → jiedan', G.Breakthrough.gate(P()) === 'jiedan');
atRealm(16); ok('结丹初期 → normal', G.Breakthrough.gate(P()) === 'normal');

/* ================= ③ 常规境界底子 ================= */
section('③ 常规境界底子');
let p = atRealm(5);
let plan = G.Breakthrough.plan(p);
ok('练气六层 plan.ok', plan.ok === true);
ok('底子 = realm.breakChance(0.58)', near(plan.baseChance, 0.58));
ok('无任何加成时成功率 = 0.58', near(plan.successChance, 0.58));
ok('无加成时 parts 为空', plan.parts.length === 0);
ok('无加成时反噬倍率 1.0', plan.dmgMul === 1);
ok('无加成时反噬伤害 = failDamage(40)', plan.failDmg === 40);
atRealm(18);
plan = G.Breakthrough.plan(P());
ok('结丹后期（顶境）plan.ok=false', plan.ok === false && plan.reason === 'top');

/* ================= ④ 灵脉 ================= */
section('④ 灵脉（灵石租金的回报）');
p = atRealm(5); p.peak = 'mid';
plan = G.Breakthrough.plan(p);
ok('中品灵峰 +3%', near(plan.successChance, 0.61));
ok('中品灵峰反噬 ×0.9', plan.dmgMul === 0.9);
ok('中品灵峰的 parts 含 vein', plan.parts.some(x => x.id === 'vein' && near(x.add, 0.03)));
p = atRealm(5); p.peak = 'high';
plan = G.Breakthrough.plan(p);
ok('上品灵峰 +6%', near(plan.successChance, 0.64));
ok('上品灵峰反噬 ×0.8 → 40×0.8=32', plan.dmgMul === 0.8 && plan.failDmg === 32);
p = atRealm(5); p.peak = 'low';
plan = G.Breakthrough.plan(p);
ok('杂役旧洞无加成、无 vein 行', near(plan.successChance, 0.58) && !plan.parts.some(x => x.id === 'vein'));

/* ================= ⑤ 护法 ================= */
section('⑤ 护法（自选、有代价）');
p = atRealm(5);
ok('无玄傀 → guardOf.ok=false', G.Breakthrough.guardOf(p).ok === false);
p.companion = { id: 'quhun', name: '铁奴·玄傀', hp: 200, maxHp: 200, atk: 24 };
ok('玄傀满血 → guardReady=true', G.Breakthrough.guardOf(p).ok === true);
plan = G.Breakthrough.plan(p);
ok('默认不请护法：无 +4%', near(plan.successChance, 0.58) && plan.guardUsed === false);
G.Breakthrough.setGuard(true);
ok('请护法后 p.btGuard=true', P().btGuard === true);
plan = G.Breakthrough.plan(P());
ok('请护法后 +4% → 0.62', near(plan.successChance, 0.62));
ok('parts 含 guard', plan.parts.some(x => x.id === 'guard' && near(x.add, 0.04)));

p = atRealm(5);
p.companion = { id: 'quhun', name: '铁奴·玄傀', hp: 80, maxHp: 200, atk: 24 };
ok('气血 80<100（半血门槛）→ guardOf.ok=false', G.Breakthrough.guardOf(p).ok === false);
const guardRefused = G.Breakthrough.setGuard(true);
ok('气血不足时 setGuard(true) 被拒', guardRefused === false && !P().btGuard);
ok('气血不足时 plan 不给 +4%', near(G.Breakthrough.plan(P()).successChance, 0.58));

// 突破时抽血 40%（护法的代价端）
p = atRealm(5);
p.companion = { id: 'quhun', name: '铁奴·玄傀', hp: 200, maxHp: 200, atk: 24 };
G.Breakthrough.setGuard(true);
plan = G.Breakthrough.plan(P());
_rand = 0.1;
G.Core._rollBreakthrough(plan);
ok('护法突破后玄傀气血 -40%（200 → 120）', P().companion.hp === 120);
ok('护法突破仍正常破境（练气六层→七层）', P().realmIndex === 6);

// 温养：灵石不足报差价、够则回满
p = atRealm(5);
p.companion = { id: 'quhun', name: '铁奴·玄傀', hp: 40, maxHp: 200, atk: 24 };
p.spiritStones = 10;
logs.length = 0;
ok('灵石不足 → 温养失败', G.Breakthrough.healCompanion() === false);
ok('灵石不足 → 气血不变', P().companion.hp === 40);
ok('灵石不足 → 日志报差价 20', logs.some(t => t.indexOf('还差 20') >= 0));
p.spiritStones = 30;
ok('灵石充足 → 温养成功', G.Breakthrough.healCompanion() === true);
ok('温养后气血回满', P().companion.hp === 200);
ok('温养扣 30 灵石', P().spiritStones === 0);
ok('满血再温养不白扣灵石', G.Breakthrough.healCompanion() === false && P().spiritStones === 0);

/* ================= ⑥ 心境 ================= */
section('⑥ 心境');
p = atRealm(5); p.mind = 30;
plan = G.Breakthrough.plan(p);
ok('心境 30 → +6%', near(plan.successChance, 0.64));
ok('心境 30 → 反噬 ×0.91', near(plan.dmgMul, 0.91));
ok('parts 含 mind', plan.parts.some(x => x.id === 'mind'));
p = atRealm(0); p.mind = 100;
plan = G.Breakthrough.plan(p);
ok('心境 100（+20%）撞 98% 上限 → 0.98（练气一层底子 0.90）', near(plan.successChance, 0.98));
p = atRealm(5); p.mind = 100;
ok('心境 100 常规叠加（0.58+0.20=0.78）', near(G.Breakthrough.plan(P()).successChance, 0.78));

/* ================= ⑦ 丹药链 ================= */
section('⑦ 丹药链（连服叠加）');
p = atRealm(15);
G.State.addItem('pill_jiedan', 1);
plan = G.Breakthrough.plan(p);
ok('凝丹 → 35%', near(plan.baseChance, 0.35) && plan.isJiedan === true);
ok('凝丹免死：deathMul=0', plan.deathMul === 0 && near(plan.deathP, 0));
p = atRealm(15); G.State.addItem('pill_jiedan', 1); p.jiedanStreak = 1;
ok('凝丹连服 1 次 → 55%', near(G.Breakthrough.plan(P()).baseChance, 0.55));
p = atRealm(15); G.State.addItem('pill_jiedan_zhengpin', 1);
ok('正品凝丹 → 55%', near(G.Breakthrough.plan(P()).baseChance, 0.55));
p = atRealm(15);
plan = G.Breakthrough.plan(p);
ok('无丹裸冲 → 3%', near(plan.baseChance, 0.03) && plan.bareJiedan === true);

p = atRealm(12); G.State.addItem('pill_zhuji', 1); p.zhujiStreak = 3;
plan = G.Breakthrough.plan(p);
ok('四丹拉满 → 100%（不被 98% 砍）', near(plan.baseChance, 1.0) && near(plan.successChance, 1.0));
p = atRealm(12); G.State.addItem('fake_zhuji', 1);
plan = G.Breakthrough.plan(p);
ok('伪筑基丹 → 15%', near(plan.baseChance, 0.15));

/* ================= ⑧ 丹道 / 反噬估算 ================= */
section('⑧ 丹道补偿与反噬估算');
p = atRealm(15); G.State.addItem('pill_jiedan_zhengpin', 1); p.threeTurnCount = 1;
plan = G.Breakthrough.plan(p);
ok('三转归元功 1 转 → 55%+25%=80%', near(plan.successChance, 0.8));
ok('parts 含 sanzhuan', plan.parts.some(x => x.id === 'sanzhuan'));
p = atRealm(15); p.threeTurnCount = 2;
plan = G.Breakthrough.plan(p);
ok('裸冲不享丹道补偿（仍 3%）', near(plan.successChance, 0.03) && !plan.parts.some(x => x.id === 'sanzhuan'));

p = atRealm(15);
plan = G.Breakthrough.plan(p);
ok('裸冲身陨率 = 97%×95% ≈ 92.15%', near(plan.deathP, 0.97 * 0.95, 1e-9));
ok('裸冲反噬 = JIEDAN.bare.dmg(220)', plan.failDmg === 220);
p = atRealm(15); G.State.addItem('pill_jiedan', 1); p.jiangchen = true;
plan = G.Breakthrough.plan(p);
ok('降尘丹 → 反噬倍率 ×0.2（0.3×0.2=0.06）', near(plan.dmgMul, 0.06));
ok('降尘丹 → 反噬伤害 400×0.06=24（筑基后期 failDamage 400）', plan.failDmg === 24);

p = atRealm(5);
plan = G.Breakthrough.plan(p);
ok('常规境界可被玄傀代死 → rescue=true 仅在有玄傀时', plan.rescue === false);
p.companion = { id: 'quhun', name: '铁奴·玄傀', hp: 200, maxHp: 200, atk: 24 };
ok('有玄傀 → rescue=true', G.Breakthrough.plan(P()).rescue === true);

/* ================= ⑨ 唯一出口：plan 即实际骰子 ================= */
section('⑨ 唯一出口（面板数值 = 掷骰数值）');
p = atRealm(5); p.peak = 'high';
plan = G.Breakthrough.plan(p);
ok('上品灵峰 plan 0.64', near(plan.successChance, 0.64));
_rand = 0.639;
G.Core.breakthrough();
ok('随机数 0.639 < 0.64 → 突破成功（加成真进了骰子）', P().realmIndex === 6);
p = atRealm(5); p.peak = 'high';
_rand = 0.641;
G.Core.breakthrough();
ok('随机数 0.641 > 0.64 → 突破失败', P().realmIndex === 5);

// 门槛续破：_btCtx 与 plan 必须同值
p = atRealm(15); G.State.addItem('pill_jiedan_zhengpin', 1); p.peak = 'high';
p.companion = { id: 'quhun', name: '铁奴·玄傀', hp: 200, maxHp: 200, atk: 24 };
p.btGuard = true;
plan = G.Breakthrough.plan(p);
G.Core.breakthrough();
ok('结丹门槛先触发心魔劫（pendingEvent=heart_demon）',
  !!P().pendingEvent && P().pendingEvent.eventId === 'heart_demon');
ok('_btCtx.successChance 与 plan 完全一致',
  !!P()._btCtx && near(P()._btCtx.successChance, plan.successChance));
ok('_btCtx 带上护法标记（续破仍抽玄傀气血）', P()._btCtx.guardUsed === true);

// 模块缺失时不崩、不误破境
p = atRealm(5);
const saved = G.Breakthrough;
G.Breakthrough = undefined;
logs.length = 0;
let threw = false;
try { G.Core.breakthrough(); } catch (e) { threw = true; }
ok('缺模块时 breakthrough 不抛异常', threw === false);
ok('缺模块时不改变境界', P().realmIndex === 5);
ok('缺模块时给出明确报错日志', logs.some(t => t.indexOf('破境推演模块未载入') >= 0));
G.Breakthrough = saved;

/* ================= ⑩ 筹备建议（可点行动） ================= */
section('⑩ 筹备建议');
p = atRealm(5); p.spiritStones = 999;
let adv = G.Breakthrough.advice(p);
ok('练气期不提示迁灵峰（筑基前租不了）', !adv.some(a => a.id === 'vein'));
p = atRealm(13); p.peak = 'low'; p.spiritStones = 999;
adv = G.Breakthrough.advice(p);
ok('筑基·杂役旧洞 → 提示迁往上品灵峰', adv.some(a => a.id === 'vein' && a.cost === 600));
ok('灵石够时不报差价', adv.filter(a => a.id === 'vein').every(a => a.short === ''));
p = atRealm(13); p.peak = 'low'; p.spiritStones = 10;
ok('灵石不足时报差价', G.Breakthrough.advice(p).filter(a => a.id === 'vein')[0].short.indexOf('还差 590') >= 0);
p = atRealm(13); p.peak = 'high';
ok('已在上品灵峰 → 不再提示迁峰', !G.Breakthrough.advice(p).some(a => a.id === 'vein'));
p = atRealm(13);
p.companion = { id: 'quhun', name: '铁奴·玄傀', hp: 200, maxHp: 200, atk: 24 };
ok('玄傀可用但未请 → 提示「请玄傀护法」', G.Breakthrough.advice(p).some(a => a.id === 'guard-on'));
p.btGuard = true;
ok('已请护法 → 不再提示开启', !G.Breakthrough.advice(p).some(a => a.id === 'guard-on'));
p = atRealm(15);
ok('结丹无丹 → 点名「裸冲九成五身陨」',
  G.Breakthrough.advice(p).some(a => a.id === 'pill' && a.short.indexOf('九成五') >= 0));
p = atRealm(15); G.State.addItem('pill_jiedan', 1);
ok('结丹持凝丹 → 不再催备丹', !G.Breakthrough.advice(p).some(a => a.id === 'pill'));

/* ================= 汇总 ================= */
console.log('\n' + '─'.repeat(46));
if (fail) { console.log('  结果：' + pass + ' 通过 / ' + fail + ' 失败'); fails.forEach(f => console.log('   - ' + f)); }
else console.log('  结果：' + pass + ' 通过 / 0 失败');
process.exit(fail ? 1 : 0);
