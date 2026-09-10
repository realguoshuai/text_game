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
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/market.js', 'js/map.js',
  'js/sect.js', 'js/puppet.js', 'js/insect.js', 'js/cave2.js',
  'js/cultivation.js', 'js/alchemy.js', 'js/bottle.js', 'js/bonds.js',
  'js/dungeon_heisha.js', 'js/hunt.js', 'js/goals.js',
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
P().realmIndex = 21;
g = G.Goals.current();
assert('筑基九层 → 结局收束', g && g.id === 'endgame');

// ---------- ⑤ 边界 ----------
section('⑤ 边界与清单');
P().isDead = true;
assert('死亡时无目标', G.Goals.current() === null);
P().isDead = false;
const all = G.Goals.list();
assert('list() 返回适用目标清单', Array.isArray(all) && all.length > 0);
assert('末项目标已完成标记正确', all[all.length - 1].done === false || all[all.length - 1].id === 'endgame');

console.log('\n==== 结果: ' + pass + ' passed, ' + fail + ' failed ====');
if (fail) { console.log('失败项：' + fails.join(' | ')); process.exit(1); }
