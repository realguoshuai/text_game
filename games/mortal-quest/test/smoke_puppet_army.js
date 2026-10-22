'use strict';
/* =========================================================
 * test/smoke_puppet_army.js —— 傀儡大军（混编编制）回归测试
 *   ① 傀儡数据：结丹档战阵/合击就位，每型都有 volley
 *   ② armyVolleyOf 是纯函数：Σ 每型「数量 × 单具 volley」
 *   ③ activate 混编：编制写入 p.puppetArmy，具数/神识占用分别汇总
 *   ④ 神识承载：超出上限先舍最便宜的一档，且占用恒 ≤ 上限
 *   ⑤ 无傀儡 → 清空并提示；旧接口 activate(数字, 类型) 仍可用
 *   ⑥ 一键列阵：按每点神识的伤害产出排序，把神识用满
 *   ⑦ 老存档兼容：无 puppetArmy 时按旧的 puppetsActive 折算
 *   ⑧ 开战捕获编制（combat.puppetArmy）
 * 运行： node test/smoke_puppet_army.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderPuppet: function () {}, showBreakthroughModal: function () {}
};

const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return 0.5; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/content.js',
  'data/world.js', 'data/events.js', 'data/wild_dungeons.js', 'data/skills_foundation.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js',
  'js/puppet.js', 'js/chronicle.js', 'js/faction.js',
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
  const p = G.State.createNewPlayer('j');
  p.realmIndex = 18;
  p.spiritStones = 100000;
  p.currentHp = 99999; p.maxHp = 99999;
  p.ageYears = 100; p.ageMonths = 0; p.totalMonths = 0;
  p.marketNextRefresh = 999999; p.junkNextRefresh = 999999;
  if (o) Object.keys(o).forEach(function (k) { p[k] = o[k]; });
  return p;
}
function give(p, id, n) { G.State.addItem(id, n); }

section('【1】傀儡数据');
ok('结丹档战阵傀儡就位', !!G.DATA.PUPPETS.zhenji && G.DATA.PUPPETS.zhenji.volley > 8);
ok('结丹档合击傀儡就位', !!G.DATA.PUPPETS.heji && G.DATA.PUPPETS.heji.volley > G.DATA.PUPPETS.zhenji.volley);
ok('每型傀儡都有 volley（旧型取默认值）', Object.keys(G.DATA.PUPPETS).every(function (k) {
  return G.Puppet.volleyOf(G.DATA.PUPPETS[k]) > 0;
}));
ok('旧三型 volley 均为 8（不改变老玩家输出）',
  G.Puppet.volleyOf(G.DATA.PUPPETS.gongjian) === 8 &&
  G.Puppet.volleyOf(G.DATA.PUPPETS.julang) === 8 &&
  G.Puppet.volleyOf(G.DATA.PUPPETS.juyuan) === 8);
ok('MAX_CONTROL 已定义（此前 ui.js 调用 undefined → 只放出 1 具）', G.Puppet.MAX_CONTROL > 0);

section('【2】armyVolleyOf 是纯函数');
const v = G.Puppet.armyVolleyOf([
  { type: 'gongjian', count: 3 },
  { type: 'zhenji', count: 2 },
]);
ok('齐射伤害 = Σ 数量 × 单具 volley', v.damage === 3 * 8 + 2 * 16);
ok('齐射具数正确', v.count === 5);
ok('未知类型被忽略', G.Puppet.armyVolleyOf([{ type: 'nope', count: 5 }]).damage === 0);

section('【3】activate 混编');
let p = mk({});
give(p, 'puppet_gongjian', 3);
give(p, 'puppet_juyuan', 2);
give(p, 'puppet_zhenji', 2);
G.Puppet.activate([{ type: 'gongjian', count: 3 }, { type: 'juyuan', count: 2 }, { type: 'zhenji', count: 2 }]);
ok('编制写入 p.puppetArmy', Array.isArray(p.puppetArmy) && p.puppetArmy.length === 3);
ok('puppetsActive 汇总具数', p.puppetsActive === 7);
ok('puppetsSp 汇总神识占用', p.puppetsSp === 3 * 10 + 2 * 20 + 2 * 25);
ok('编制齐射 = 汇总值', G.Puppet.armyVolley().damage === 3 * 8 + 2 * 8 + 2 * 16);

section('【4】神识承载截断');
p = mk({});
give(p, 'puppet_heji', 10);           // 10 × 35 = 350 SP
const cap = G.Puppet.maxSpirit();      // 结丹后期 240 SP
ok('神识上限为结丹档（240）', cap === 240);
G.Puppet.activate([{ type: 'heji', count: 10 }]);
ok('超出上限后占用 ≤ 上限', p.puppetsSp <= cap);
ok('先舍最便宜的一档（保强力型号）→ 仍留合击傀儡', p.puppetArmy.length === 1 && p.puppetArmy[0].type === 'heji');
ok('截断后具数正确（240/35 = 6）', p.puppetArmy[0].count === 6);

p = mk({});
give(p, 'puppet_zhenji', 5);           // 125 SP
give(p, 'puppet_heji', 5);             // 175 SP → 合计 300 > 240
G.Puppet.activate([{ type: 'zhenji', count: 5 }, { type: 'heji', count: 5 }]);
ok('混编超限后占用 ≤ 上限', p.puppetsSp <= cap);
ok('混编截断后仍保留两型', p.puppetArmy.length === 2);
const byType = {};
p.puppetArmy.forEach(function (x) { byType[x.type] = x.count; });
ok('合击（强）优先保留满 5 具', byType.heji === 5);
ok('便宜的战阵被舍弃到只剩 2 具', byType.zhenji === 2);

section('【5】边界');
p = mk({});
G.Puppet.activate([]);
ok('无傀儡 → 清空编制', p.puppetArmy.length === 0 && p.puppetsActive === 0 && p.puppetsSp === 0);

p = mk({});
give(p, 'puppet_gongjian', 5);
G.Puppet.activate(3, 'gongjian');
ok('旧接口 activate(数字, 类型) 仍可用', p.puppetsActive === 3 && p.puppetArmy[0].type === 'gongjian');
ok('旧接口占用正确', p.puppetsSp === 30);

p = mk({});
give(p, 'puppet_gongjian', 99);
G.Puppet.activate(50, 'gongjian');
ok('请求数超上限时按神识承载截断（240/10 = 24 具）', p.puppetsActive === 24,
  'got ' + p.puppetsActive);

section('【6】一键列阵');
p = mk({});
give(p, 'puppet_gongjian', 30);
give(p, 'puppet_heji', 2);
G.Puppet.activateAll();
ok('一键列阵把神识用满（≤ 上限）', p.puppetsSp <= cap);
ok('一键列阵至少放出若干具', p.puppetsActive > 0);
ok('性价比最高的弓箭傀儡优先铺满（24 具 = 240 SP）',
  p.puppetArmy[0].type === 'gongjian' && p.puppetArmy[0].count === 24,
  'got ' + JSON.stringify(p.puppetArmy));
ok('一键列阵把神识用满', p.puppetsSp === 240);

section('【7】老存档兼容');
p = mk({});
p.puppetsActive = 4;            // 旧档只有 puppetsActive，没有 puppetArmy
ok('无 puppetArmy 时按旧字段折算', G.Puppet.army().length === 1 && G.Puppet.army()[0].count === 4);

section('【8】开战捕获编制');
p = mk({});
give(p, 'puppet_gongjian', 2);
give(p, 'puppet_zhenji', 1);
G.Puppet.activate([{ type: 'gongjian', count: 2 }, { type: 'zhenji', count: 1 }]);
const mon = G.DATA.MONSTERS.filter(function (x) { return x.id === 'wild_yaoxiu'; })[0];
G.Combat.start(mon.id);
ok('开战捕获编制到 p.combat.puppetArmy',
  Array.isArray(p.combat.puppetArmy) && p.combat.puppetArmy.length === 2);
ok('开战捕获的编制与实际一致', p.combat.puppetArmy[0].count === 2 && p.combat.puppetArmy[1].count === 1);

console.log('\n=== 结果: ' + pass + ' passed, ' + fail + ' failed ===');
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
