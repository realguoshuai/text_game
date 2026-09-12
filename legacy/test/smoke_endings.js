'use strict';
/* =========================================================
 * test/smoke_endings.js —— 筑基期后多结局系统无头测试
 *   ① 终局前默认全锁定（除条件后解锁）
 *   ② 结丹之路：需李玄尘亲传 + 筑基七层以上
 *   ③ 红尘双修：需凌清沅·暗中护法完成
 *   ④ 孤峰悟道：回绝柳蔓儿 + 斩断温巧兮 + 未结凌清沅
 *   ⑤ 魔焰噬心：阴魂精魄 ≥ 3
 *   ⑥ 破空而去：需传送阵修复；choose 后 ending/tiandao 落定且不可重选
 * 运行： node test/smoke_endings.js
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
  'js/dungeon_heisha.js', 'js/hunt.js', 'js/teleport_portal.js', 'js/endings.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function assert(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function reset(realmIndex) {
  G.State.createNewPlayer('ender');
  const p = G.State.p();
  if (realmIndex != null) p.realmIndex = realmIndex;
  p.warPhase = 4;   // 终局阶段
  logs.length = 0;
  return p;
}
function idOf(name) {
  const ed = G.Endings.list().filter(function (e) { return e.name.indexOf(name) >= 0; })[0];
  return ed ? ed.id : null;
}

console.log('【1】结局定义与锁定基线');
{
  const p = reset(16);
  assert('结局清单共 5 条', G.Endings.list().length === 5);
  ['victory', 'jiedan', 'shuangxiu', 'duxiu', 'moxiu'].forEach(function (id) {
    assert('结局存在: ' + id, !!G.Endings.byId(id));
  });
  ['jiedan', 'shuangxiu', 'duxiu', 'moxiu'].forEach(function (id) {
    assert('未做选择时锁定: ' + id, G.Endings.canChoose(id).ok === false);
  });
  assert('破空而去未修阵锁定', G.Endings.canChoose('victory').ok === false);
}

console.log('【2】结丹之路：李玄尘亲传 + 筑基七层');
{
  const p = reset(16);   // 筑基三层，不足
  p.masterId = 'lihuayuan'; G.Bonds.bonds().lihuayuan = { done: true };
  assert('亲传但修为不足仍锁定', G.Endings.canChoose('jiedan').ok === false);
  p.realmIndex = 19;     // 筑基七层
  assert('亲传 + 筑基七层解锁', G.Endings.canChoose('jiedan').ok === true);
  assert('择结丹结局成功', G.Endings.choose('jiedan') === true);
  assert('ending 落定为 jiedan', p.ending === 'jiedan');
  assert('天道点数为正', (p.tiandao || 0) > 0);
  assert('已终局后不可再择', G.Endings.canChoose('victory').ok === false);
  assert('日志含结局名', logs.join('|').indexOf('结丹之路') >= 0);
}

console.log('【3】红尘双修：凌清沅·暗中护法');
{
  const p = reset(16);
  G.Bonds.bonds().nangongwan = { done: true, choice: 'leave' };
  assert('视而不见不解锁双修', G.Endings.canChoose('shuangxiu').ok === false);
  G.Bonds.bonds().nangongwan = { done: true, choice: 'guard' };
  assert('暗中护法解锁双修', G.Endings.canChoose('shuangxiu').ok === true);
  assert('择双修成功', G.Endings.choose('shuangxiu') === true && p.ending === 'shuangxiu');
}

console.log('【4】孤峰悟道：斩情丝 + 回绝 + 未结凌清沅');
{
  const p = reset(16);
  G.Bonds.bonds().dongxuaner = { done: true, choice: 'plot' };
  G.Bonds.bonds().chenqiaoqian = { done: true };
  assert('虚与委蛇不解锁孤修', G.Endings.canChoose('duxiu').ok === false);
  G.Bonds.bonds().dongxuaner = { done: true, choice: 'refuse' };
  assert('回绝 + 斩情 + 未结婉缘解锁', G.Endings.canChoose('duxiu').ok === true);
  // 反例：结了凌清沅缘则道心有痕
  G.Bonds.bonds().nangongwan = { done: true, choice: 'guard' };
  assert('已结凌清沅缘则孤修锁定', G.Endings.canChoose('duxiu').ok === false);
}

console.log('【5】魔焰噬心：阴魂精魄 ≥ 3');
{
  const p = reset(16);
  G.State.addItem('yin_hun_soul', 2);
  assert('两枚精魄不解锁', G.Endings.canChoose('moxiu').ok === false);
  G.State.addItem('yin_hun_soul', 1);
  assert('三枚精魄解锁', G.Endings.canChoose('moxiu').ok === true);
  assert('择魔道结局成功', G.Endings.choose('moxiu') === true && p.ending === 'moxiu');
}

console.log('【6】破空而去：修阵后经原通关链收束');
{
  const p = reset(16);
  p.teleportRepaired = true;
  assert('修阵后解锁破空而去', G.Endings.canChoose('victory').ok === true);
  assert('择破空而去成功', G.Endings.choose('victory') === true && p.ending === 'victory');
  assert('天道点数已结算', (p.tiandao || 0) >= 0);
  assert('已终局不可重选任意结局', G.Endings.canChoose('jiedan').ok === false);
}

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('失败项:\n - ' + fails.join('\n - ')); process.exit(1); }
