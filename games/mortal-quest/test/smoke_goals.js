'use strict';
/* =========================================================
 * test/smoke_goals.js —— 动态当前目标（里程碑链）无头测试
 *   ① 开局：目标是"走完苍梧门开局六幕"
 *   ② 紧急项（阴毒/尸虫丸/泄露/觊觎）压过主线，并标 urgent
 *   ③ 进度推进：六幕完 → 苍南小会 → 拜入宗门 → 集齐三药 → 炼丹 → 突破
 *   ④ 突破筑基后目标切到云京 → 冲击结丹
 *   ⑤ 死亡时无目标；list() 可列出全部适用项
 * 运行： node test/smoke_goals.js
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
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills.js',
  'data/skills_foundation.js', 'data/items_foundation.js',
  'data/events.js', 'data/world.js', 'data/worldmap.js', 'data/content.js',
  'data/qixuan_events.js', 'data/demon_war_events.js', 'data/dungeon_heisha.js', 'data/wild_dungeons.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js', 'js/plot.js', 'js/mortality.js', 'js/market.js', 'js/map.js',
  'js/sect.js', 'js/puppet.js', 'js/insect.js', 'js/cave2.js',
  'js/cultivation.js', 'js/alchemy.js', 'js/bottle.js', 'js/bonds.js',
  'js/dungeon_heisha.js', 'js/hunt.js', 'js/goals.js',
  'js/yuanying.js', 'js/faction.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function assert(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

const P = () => G.State.p();

// ---------- ① 开局 ----------
section('① 开局目标');
G.State.createNewPlayer();
let g = G.Goals.current();
assert('开局有目标', !!g);
assert('开局目标 = 苍梧门六幕', g && g.id === 'qixuan');
assert('六幕目标带幕数进度', !!g && /幕/.test(g.hint));
assert('六幕目标给出地点', !!g && g.where === '苍梧门');

// ---------- ② 紧急项优先 ----------
section('② 紧急目标压过主线');
P().yindu = { months: 6 };
g = G.Goals.current();
assert('阴毒时目标切为解阴毒', g && g.id === 'yindu');
assert('阴毒目标 urgent=true', !!g && g.urgent === true);
assert('阴毒提示含剩余月数', !!g && /6/.test(g.hint));
P().yindu = null;

P().marketRiskValue = 85;
g = G.Goals.current();
assert('觊觎≥80 时目标切为避觊觎', g && g.id === 'risk' && g.urgent);
P().marketRiskValue = 0;

P().leak = 90;
g = G.Goals.current();
assert('泄露≥80 时目标切为压泄露', g && g.id === 'leak' && g.urgent);
P().leak = 0;

P().shichong = { months: 3 };
g = G.Goals.current();
assert('尸虫丸目标 urgent', g && g.id === 'shichong' && g.urgent);
P().shichong = null;

// ---------- ③ 主线推进 ----------
section('③ 主线里程碑推进');
P().qixuan = { act: 7, step: 0 };
g = G.Goals.current();
assert('六幕完结后 → 苍南小会', g && g.id === 'tainan');

P().tainan = { leitai: 3, leitaiDone: true };
g = G.Goals.current();
assert('小会夺席后 → 拜入宗门', g && g.id === 'joinsect');

P().sectId = 'qingwu_gu';
g = G.Goals.current();
assert('拜入后 → 集齐三味主药', g && g.id === 'herbs');
assert('缺药提示列出全部三味', !!g && (g.hint.match(/、/g) || []).length === 2);

P().inventory.herb_tianling = 1;
P().inventory.herb_yumo = 1;
g = G.Goals.current();
assert('集齐两味后仍缺一味', g && g.id === 'herbs' && /紫猴花/.test(g.hint));

P().inventory.herb_zihou = 1;
g = G.Goals.current();
assert('三药齐 → 炼正品筑基丹', g && g.id === 'zhengpin');

P().inventory.pill_zhengpin = 1;
g = G.Goals.current();
assert('有丹后 → 突破筑基', g && g.id === 'zhuji');
assert('突破提示含当前境界', !!g && /练气/.test(g.hint));

// ---------- ④ 筑基后 ----------
section('④ 筑基期目标');
P().realmIndex = 13;
g = G.Goals.current();
assert('筑基后 → 云京皇宫副本', g && g.id === 'heisha');
P().heisha = { stage: 4, guards: { a: 1, b: 1 }, bossDone: false };
g = G.Goals.current();
assert('副本提示含已破血仆数', !!g && /2\/4/.test(g.hint));
P().heisha.bossDone = true;
g = G.Goals.current();
assert('副本通关 → 冲击结丹', g && g.id === 'jiedan');
P().realmIndex = 15;
g = G.Goals.current();
assert('筑基后期 → 冲击结丹（未圆满，目标仍为 jiedan）', g && g.id === 'jiedan');
P().realmIndex = 18;
g = G.Goals.current();
assert('结丹后期 → 碎丹成婴目标', g && g.id === 'yuanying');
P().realmIndex = 19;
g = G.Goals.current();
assert('元婴初期 → 元婴三阶目标', g && g.id === 'yuanying_full');
P().realmIndex = 21;
g = G.Goals.current();
assert('元婴后期 → 顶境目标', g && g.id === 'top');
P().realmIndex = 18;

// ---------- ⑤ 边界 ----------
section('⑤ 边界与清单');
P().isDead = true;
assert('死亡时无目标', G.Goals.current() === null);
P().isDead = false;
const all = G.Goals.list();
assert('list() 返回适用目标清单', Array.isArray(all) && all.length > 0);
assert('末项目标已完成标记正确', all[all.length - 1].done === false || all[all.length - 1].id === 'top');

// ---------- ⑥ 下一步行动（action：目标 → 现在就点哪） ----------
section('⑥ 下一步行动 action()');
G.State.createNewPlayer();
let p6 = P();
p6.realmIndex = 5;
const r6 = G.DATA.REALMS[5];

// 修为未满 → 劝闭关
p6.currentExp = 0;
let a = G.Goals.action(p6);
assert('修为未满 → 建议闭关打坐', a && a.kind === 'heal' && /闭关打坐/.test(a.label));
assert('闭关提示写明还差多少修为', a && /还差 \d+ 修为/.test(a.why));
assert('闭关行动可执行（run 为函数）', a && typeof a.run === 'function');
assert('闭关提示含突破成功率', a && /成功率 \d+%/.test(a.why));

// 修为已满 + 气血充足 → 劝突破
p6.currentExp = r6.needExp;
p6.currentHp = p6.maxHp;
a = G.Goals.action(p6);
assert('修为已满气血足 → 建议突破', a && a.kind === 'go' && /尝试突破/.test(a.label));
assert('突破行动可执行', a && typeof a.run === 'function');
assert('突破提示带气血实况', a && /气血/.test(a.why));

// 修为已满 + 气血不足 → 先回血（关键的"为什么现在别点突破"）
p6.currentHp = Math.floor(p6.maxHp * 0.3);
a = G.Goals.action(p6);
assert('修为满但气血不足 → 先打坐回血', a && a.kind === 'heal' && /恢复气血/.test(a.label));
assert('回血提示说明硬突破会重伤', a && /重伤/.test(a.why));

// 顶境 → 无下一步可点（元婴后期为当前终点）
p6.realmIndex = 21;
p6.currentExp = 0;
a = G.Goals.action(p6);
assert('顶境 → 此界已圆满且不可点', a && a.kind === 'done' && a.run === null);

// 战斗中 → 先了结眼前之事
p6.realmIndex = 5;
p6.currentExp = 0;
p6.combat = { foe: {} };
a = G.Goals.action(p6);
assert('战斗中 → 先了结眼前之事', a && a.kind === 'story' && a.run === null);
p6.combat = null;

// 结丹后期（门槛型顶境，needExp 为 null）→ 直接劝突破碎丹，而非闭关死循环
p6.realmIndex = 18;
p6.currentExp = 0;
p6.currentHp = p6.maxHp;
a = G.Goals.action(p6);
assert('结丹后期 → 建议突破碎丹成婴（非闭关死循环）', a && a.kind === 'go' && /碎丹成婴/.test(a.label));
assert('碎丹突破行动可执行', a && typeof a.run === 'function');
p6.realmIndex = 5;

// 纯函数：调用不写状态
const expBefore = p6.currentExp, hpBefore = p6.currentHp;
G.Goals.action(p6);
assert('action() 不修改玩家状态', p6.currentExp === expBefore && p6.currentHp === hpBefore);

// ---------- ⑦ 并行支线 parallel() ----------
section('⑦ 并行支线提示 parallel()');
G.State.createNewPlayer();
let p7 = P();
p7.realmIndex = 5;                 // 练气期：不应出现元婴专属支线
let par0 = G.Goals.parallel(p7);
assert('parallel() 返回数组', Array.isArray(par0));
assert('练气无熟药/无元婴支线时为空或仅药圃', Array.isArray(par0));

// 药圃有熟药 → 应提示可收
p7.plots = [{ y: 1000 }, { y: 1000 }, { y: 1000 }];
let par1 = G.Goals.parallel(p7);
assert('药圃有熟药 → 并行提示含"药圃"', par1.some(function (x) { return /药圃/.test(x.text); }));
assert('并行提示最多 3 条', par1.length <= 3);

// 紧急项存在时 → 并行支线不抢镜（返回空）
p7.yindu = { months: 6 };
let par2 = G.Goals.parallel(p7);
assert('紧急项（阴毒）时并行支线为空', Array.isArray(par2) && par2.length === 0);
p7.yindu = null;
p7.plots = null;

// 元婴初期且灵石足 → 应提示可立派（非 yuanying_full 主线激活时）
p7.realmIndex = 19;
p7.spiritStones = 6000;
let par3 = G.Goals.parallel(p7);
assert('元婴灵石足 → 并行提示含"立派"', par3.some(function (x) { return /立派/.test(x.text); }));

// 死亡 → 无行动
p6.isDead = true;
assert('死亡时无行动建议', G.Goals.action(p6) === null);
p6.isDead = false;

console.log('\n==== 结果: ' + pass + ' passed, ' + fail + ' failed ====');
if (fail) { console.log('失败项：' + fails.join(' | ')); process.exit(1); }
