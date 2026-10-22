'use strict';
/* =========================================================
 * test/smoke_formation.js —— 长闭关洞府大阵回归测试
 *   ① 周天星斗大阵数据完整（where/upkeep/seclude），基础阵不带月耗
 *   ② 布阵门控：未寻寰尘岛不得布周天星斗大阵
 *   ③ 寰尘岛门槛：结丹后期 + 碎星海 + 灵石，三缺一不可
 *   ④ tier() 读大阵：有阵长关 shielded=true、心境增速翻快；灵石不足则不允闭关
 *   ⑤ 阵法月耗：撑得住照扣，撑不住阵散
 *   ⑥ seclude() 执行阵法长关：参悟星轨只给一次，闭关期间挂屏蔽标记
 *   ⑦ passTime 持续扣月耗
 * 运行： node test/smoke_formation.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderCave2: function () {}, showBreakthroughModal: function () {}
};

const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return 0.5; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/content.js',
  'data/world.js', 'data/events.js', 'data/wild_dungeons.js', 'data/skills_foundation.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js', 'js/plot.js',
  'js/mortality.js', 'js/breakthrough.js', 'js/cultivation.js',
  'js/cave2.js', 'js/chronicle.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

// 地图桩：只需 chapterOf（碎星海定位）
G.Map = {
  chapterOf: function (realmIndex, location) {
    if (location === 'luanxing_hai') return 'star';
    if (realmIndex >= 16) return 'jiedan';
    if (realmIndex >= 13) return 'zhuji';
    return 'qi';
  }
};

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

// 造一个结丹后期的测试号
function mk(o) {
  const p = G.State.createNewPlayer('j');
  p.realmIndex = 18;
  p.spiritStones = 100000;
  p.currentHp = 99999; p.maxHp = 99999;
  p.ageYears = 100; p.ageMonths = 0;
  p.totalMonths = 0;
  p.marketNextRefresh = 999999; p.junkNextRefresh = 999999;
  if (o) Object.keys(o).forEach(function (k) { p[k] = o[k]; });
  return p;
}
const ZX = G.DATA.FORMATIONS.filter(function (f) { return f.id === 'zhouxing'; })[0];

section('【1】周天星斗大阵数据');
ok('FORMATIONS 含 zhouxing', !!ZX);
ok('zhouxing：where=huanchen', !!ZX && ZX.where === 'huanchen');
ok('zhouxing：upkeep>0 且 seclude=true', !!ZX && ZX.upkeep > 0 && ZX.seclude === true);
ok('zhouxing：repelChance 0.95', !!ZX && Math.abs(ZX.repelChance - 0.95) < 1e-9);
ok('基础阵不带月耗（老玩家不受影响）', G.DATA.FORMATIONS.every(function (f) {
  return f.id === 'zhouxing' || !f.upkeep;
}));

section('【2】布阵门控');
let p = mk({});
let can = G.Cave2.canSetFormation(ZX);
ok('未寻寰尘岛 → 不可布周天星斗大阵', !can.ok && can.why.indexOf('寰尘岛') >= 0);
p.formation = 'dawan';
G.Cave2.setFormation('zhouxing');
ok('setFormation 被拒后原阵不动', p.formation === 'dawan');

section('【3】寰尘岛门槛');
p = mk({ realmIndex: 17 });
can = G.Cave2.canUnlockHuanchen();
ok('结丹中期 → 不得寻岛', !can.ok && can.why.indexOf('结丹后期') >= 0);

p = mk({ location: 'cloud_city' });
can = G.Cave2.canUnlockHuanchen();
ok('不在碎星海 → 不得寻岛', !can.ok && can.why.indexOf('碎星海') >= 0);

p = mk({ location: 'luanxing_hai', spiritStones: 100 });
can = G.Cave2.canUnlockHuanchen();
ok('灵石不足 → 不得寻岛', !can.ok && can.why.indexOf('2000') >= 0);

p = mk({ location: 'luanxing_hai', spiritStones: 5000 });
const before = p.spiritStones;
ok('结丹后期+碎星海+灵石 → 可寻岛', G.Cave2.canUnlockHuanchen().ok === true);
ok('寻岛成功 p.huanchen=true', G.Cave2.unlockHuanchen() === true && p.huanchen === true);
ok('寻岛扣灵石 2000', p.spiritStones === before - 2000);

section('【4】布成周天星斗大阵');
p = mk({ location: 'luanxing_hai', spiritStones: 20000, huanchen: true });
const stoneBefore = p.spiritStones;
G.Cave2.setFormation('zhouxing');
ok('布阵成功 p.formation=zhouxing', p.formation === 'zhouxing');
ok('布阵扣灵石 3000', p.spiritStones === stoneBefore - ZX.cost);
ok('activeFormation() 返回该阵', G.Cave2.activeFormation().id === 'zhouxing');

section('【5】tier() 读大阵');
p = mk({ realmIndex: 18, spiritStones: 100000 });
let t = G.Time.tier(p, 'epic');
const monthsEpic = t.months;
ok('无阵 → shielded=false', t.shielded === false);
ok('无阵 → 心境按每 4 月 +1', t.mind === Math.floor(monthsEpic / 4));

p.formation = 'zhouxing';
p.spiritStones = 100000;
t = G.Time.tier(p, 'epic');
ok('有阵 → shielded=true', t.shielded === true);
ok('有阵 → 心境按每 3 月 +1（增速翻快）', t.mind === Math.floor(monthsEpic / 3));
ok('有阵 → upkeep = 20 × 月数', t.upkeep === ZX.upkeep * monthsEpic);

p.spiritStones = 10;
t = G.Time.tier(p, 'epic');
ok('灵石不足 → 长关不予闭关', t.ok === false && t.why.indexOf('月耗') >= 0);
ok('灵石不足 → shielded 回落 false', t.shielded === false);

section('【6】阵法月耗 tickUpkeep');
p = mk({ formation: 'zhouxing', spiritStones: 1000 });
G.Cave2.tickUpkeep(10);
ok('月耗按 20×月数扣除', p.spiritStones === 1000 - 200);
ok('撑得住 → 阵不散', p.formation === 'zhouxing');

p = mk({ formation: 'zhouxing', spiritStones: 50 });
G.Cave2.tickUpkeep(10);
ok('养不起 → 阵散（formation=none）', p.formation === 'none');
ok('养不起 → 余资归零', p.spiritStones === 0);

section('【7】seclude 执行阵法长关');
p = mk({ formation: 'zhouxing', spiritStones: 100000, location: 'luanxing_hai', huanchen: true });
const mindBefore = p.mind;
const sbBefore = p.spiritBonus || 0;
ok('seclude(epic) 成功', G.Time.seclude('epic') === true);
ok('心境按每 3 月 +1 增长', p.mind === mindBefore + Math.floor(monthsEpic / 3));
ok('首次参悟星轨 → 神识上限 +25', (p.spiritBonus || 0) === sbBefore + 25);
ok('闭关标记已清除（不残留）', !p.seclusion);
ok('月耗已由 passTime 扣除', p.spiritStones < 100000);

const sbAfter = p.spiritBonus;
p.spiritStones = 100000;
G.Time.seclude('epic');
ok('再次阵法长关不再重复给神识（防刷）', (p.spiritBonus || 0) === sbAfter);

section('【8】passTime 持续扣月耗');
p = mk({ formation: 'zhouxing', spiritStones: 1000 });
const s0 = p.spiritStones;
G.Core.passTime(1);
ok('passTime(1) 扣 20 灵石月耗', p.spiritStones === s0 - 20);

console.log('\n=== 结果: ' + pass + ' passed, ' + fail + ' failed ===');
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
