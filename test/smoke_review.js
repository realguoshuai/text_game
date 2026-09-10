'use strict';
/* =========================================================
 * test/smoke_review.js —— 十年回顾无头测试
 *   ① 未满 10 年不触发
 *   ② 满 10 年触发一次，输出含"十年回顾"与变化量
 *   ③ 触发后滚动快照，不会连续重复触发
 *   ④ 回顾含"错过的事"提示，且最多 3 条
 *   ⑤ 老存档无 review 字段时惰性补齐、不报错
 * 运行： node test/smoke_review.js
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
  'js/dungeon_heisha.js', 'js/hunt.js', 'js/goals.js', 'js/review.js',
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

// ---------- ① 未到期不触发 ----------
section('① 未到期不触发');
G.State.createNewPlayer();
let p = P();
p.ageYears = 16;
logs.length = 0;
G.Review.tick();
assert('开局即 tick 不触发', !logs.join('').includes('十年回顾'));
assert('review 已惰性初始化', !!p.review && p.review.lastYear === 16);

p.ageYears = 25;
logs.length = 0;
G.Review.tick();
assert('第 9 年不触发', !logs.join('').includes('十年回顾'));

// ---------- ② 满十年触发 ----------
section('② 满十年触发');
p.realmIndex = 3;
p.spiritStones = 200;
p.stats.kills = 4;
p.stats.explores = 2;
p.ageYears = 26;
logs.length = 0;
G.Review.tick();
const text = logs.join('\n');
assert('第 10 年触发回顾', text.includes('十年回顾'));
assert('回顾含起止年龄', /16 岁 → 26 岁/.test(text));
assert('回顾含境界变化', /练气一层.*练气四层/.test(text) || /跨越 3 个小境界/.test(text));
assert('回顾含灵石变化', /灵石 \d+ → 200/.test(text));
assert('回顾含行迹', /斩敌 4 人/.test(text) && /外出历练 2 次/.test(text));
assert('回顾含错过提示', text.includes('错过：'));

// ---------- ③ 不重复触发 ----------
section('③ 滚动快照');
assert('times 记为 1', p.review.times === 1);
assert('lastYear 更新为 26', p.review.lastYear === 26);
logs.length = 0;
G.Review.tick();
assert('同年再次 tick 不重复', !logs.join('').includes('十年回顾'));
p.ageYears = 35;
logs.length = 0;
G.Review.tick();
assert('第 9 年仍不触发', !logs.join('').includes('十年回顾'));
p.ageYears = 36;
logs.length = 0;
G.Review.tick();
assert('再满十年触发第二次', logs.join('').includes('十年回顾'));
assert('times 记为 2', p.review.times === 2);

// ---------- ④ 错过条目上限 ----------
section('④ 错过条目');
const miss = G.Review.missed(P(), G.Review.snap(P()));
assert('错过多于 1 条时截断到 3 条', Array.isArray(miss) && miss.length <= 3);
assert('已辞行后不再提示辞行', (function () {
  P().farewellDone = true;
  return !G.Review.missed(P(), G.Review.snap(P())).join().includes('辞行');
})());

// ---------- ⑤ 老存档兼容 ----------
section('⑤ 老存档兼容');
p.review = null;
logs.length = 0;
p.ageYears = 60;
G.Review.tick();
assert('无 review 字段时自动补齐（以当前年为基线）', !!p.review && p.review.lastYear === 60);
assert('补齐当年不补发回顾', !logs.join('').includes('十年回顾'));
p.ageYears = 70;
logs.length = 0;
G.Review.tick();
assert('补齐后再满十年正常触发', logs.join('').includes('十年回顾'));

console.log('\n==== 结果: ' + pass + ' passed, ' + fail + ' failed ====');
if (fail) { console.log('失败项：' + fails.join(' | ')); process.exit(1); }
