'use strict';
/* =========================================================
 * test/smoke_plot.js —— 药圃（灵药年份）回归测试
 *   ① 模块与配置：GAME.Plot / GAME.DATA.PLOT 落位
 *   ② 空地：三垄默认空，status 摘要为 0
 *   ③ 移栽：耗 1 株百年灵药、起点 100 年；缺苗不动、占垄不叠
 *   ④ 生长：每月 3 年份，灵峰 gardenMul 加倍；上限 1000 年
 *   ⑤ 收成：不足千年收不动（且不消耗）；满千年得千年灵药，收完变空垄
 *   ⑥ 唯一出口：core.passTime / Time.seclude 都会推药圃年月
 *   ⑦ 摘要：growing / ready / nextLeft 与逐垄一致
 * 运行： node test/smoke_plot.js
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

const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return 0.5; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/content.js',
  'data/world.js',
  'js/state.js', 'js/core.js', 'js/time.js', 'js/plot.js', 'js/breakthrough.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

// passTime 会碰坊市/黑市，桩掉即可（本套件只验药圃）
G.Market = { refreshGoods: function () {} };
G.BlackMarket = { refreshJunk: function () {}, tickRotation: function () {} };
// 灵峰档位（正式数据在 js/cave2.js，这里只取 gardenMul 那三个数）
G.DATA.LINGFENG = [
  { id: 'low', gardenMul: 1 }, { id: 'mid', gardenMul: 1.5 }, { id: 'high', gardenMul: 2 }
];

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }
function near(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }

const P = () => G.State.p();
function fresh(opts) {
  G.State.createNewPlayer();
  const p = P();
  p.peak = (opts && opts.peak) || 'low';
  p.inventory = {};
  p.plots = null;
  if (opts && opts.bainian) p.inventory.herb_bainian = opts.bainian;
  return p;
}

/* ================= ① 模块与配置 ================= */
section('① 模块与配置');
ok('GAME.Plot 已挂载', !!G.Plot);
ok('方法齐备', ['cfg', 'rate', 'yearsOf', 'monthsLeft', 'slot', 'slots', 'tick',
  'plant', 'harvest', 'status'].every(k => typeof G.Plot[k] === 'function'));
const CFG = G.DATA.PLOT;
ok('三垄地', CFG.plots === 3);
ok('下地即百年', CFG.startYears === 100);
ok('每月长 3 年份', CFG.yearsPerMonth === 3);
ok('药力上限 1000 年', CFG.capYears === 1000 && CFG.harvest.years === 1000);
ok('收成是千年灵药', CFG.harvest.id === 'herb_qiannian');
ok('种苗是百年灵药', CFG.seed === 'herb_bainian');

/* ================= ② 空地 ================= */
section('② 空地');
let p = fresh({ bainian: 0 });
let st = G.Plot.status(p);
ok('懒初始化出 3 垄', Array.isArray(p.plots) && p.plots.length === 3);
ok('三垄全空', p.plots.every(x => x === null));
ok('摘要：0 垄在长', st.growing === 0 && st.ready === 0);
ok('摘要：无最近可收（nextLeft 为 null）', st.nextLeft === null);
ok('摘要带种苗数', st.seed === 0);

/* ================= ③ 移栽 ================= */
section('③ 移栽');
p = fresh({ bainian: 1 });
ok('移栽成功', G.Plot.plant(0) === true);
ok('耗掉 1 株百年灵药', G.State.countItem('herb_bainian') === 0);
ok('起点 100 年', G.Plot.yearsOf(p, 0) === 100);
ok('日志写明移栽与每月生长', logs.some(x => /移栽进第 1 垄/.test(x) && /每月长 3 年份/.test(x)));

// 缺苗：不动任何状态
p = fresh({ bainian: 0 });
ok('无苗时移栽失败', G.Plot.plant(1) === false);
ok('失败后仍是空地', p.plots[1] === null);
ok('失败有原因日志', logs.some(x => /没有可移栽的药苗/.test(x)));

// 已占：不叠加
p = fresh({ bainian: 2 });
G.Plot.plant(0);
ok('同一垄不能种第二株', G.Plot.plant(0) === false);
ok('苗没被白扣（还剩 1 株）', G.State.countItem('herb_bainian') === 1);
ok('年份没被重置', G.Plot.yearsOf(p, 0) === 100);

/* ================= ④ 生长 ================= */
section('④ 生长');
p = fresh({ bainian: 1 });
G.Plot.plant(0);
ok('杂役旧洞：每月 3 年份', G.Plot.rate(p) === 3);
G.Plot.tick(12);
ok('12 月后 100 → 136 年', G.Plot.yearsOf(p, 0) === 136);
ok('还差 (1000-136)/3 = 288 月', G.Plot.monthsLeft(p, 0) === 288);

p = fresh({ bainian: 1, peak: 'high' });
G.Plot.plant(0);
ok('上品灵峰：每月 6 年份', G.Plot.rate(p) === 6);
G.Plot.tick(12);
ok('12 月后 100 → 172 年', G.Plot.yearsOf(p, 0) === 172);

p = fresh({ bainian: 1, peak: 'mid' });
G.Plot.plant(0);
G.Plot.tick(10);
ok('中品灵峰：10 月 ×4.5 = +45', near(G.Plot.yearsOf(p, 0), 145));

// 上限
p = fresh({ bainian: 1 });
G.Plot.plant(0);
G.Plot.tick(1000);
ok('年份封顶 1000（再长也不成药王）', G.Plot.yearsOf(p, 0) === 1000);

// 空垄不参与
p = fresh({ bainian: 1 });
G.Plot.plant(2);
G.Plot.tick(12);
ok('只长有种的那一垄', G.Plot.yearsOf(p, 2) === 136 && G.Plot.yearsOf(p, 0) === 0);

/* ================= ⑤ 收成 ================= */
section('⑤ 收成');
p = fresh({ bainian: 1 });
G.Plot.plant(0);
ok('空垄收不动', G.Plot.harvest(1) === false);
ok('年份不足收不动', G.Plot.harvest(0) === false);
ok('失败的收成不消耗那株药', G.Plot.yearsOf(p, 0) === 100);
ok('失败有原因日志', logs.some(x => /才 100 年/.test(x)));

G.Plot.tick(300);   // 100 + 900 = 1000
ok('刚好满千年', G.Plot.yearsOf(p, 0) === 1000);
const st2 = G.Plot.slot(p, 0);
ok('slot 报 ready', st2.ready === true && st2.left === 0);
ok('满千年收成成功', G.Plot.harvest(0) === true);
ok('得千年灵药 ×1', G.State.countItem('herb_qiannian') === 1);
ok('收完变空垄', p.plots[0] === null);

// 灵田加成
p = fresh({ bainian: 1 });
G.Home = { yieldBonus: function () { return 2; } };
G.Plot.plant(0);
G.Plot.tick(300);
G.Plot.harvest(0);
ok('灵田 yieldBonus 2 → 收 3 株', G.State.countItem('herb_qiannian') === 3);
ok('日志标出灵田加成', logs.some(x => /灵田 \+2/.test(x)));
G.Home = undefined;

/* ================= ⑥ 唯一出口：时间推进 ================= */
section('⑥ 唯一出口：时间推进');
p = fresh({ bainian: 1 });
G.Plot.plant(0);
const y0 = G.Plot.yearsOf(p, 0);
G.Core.meditate();                 // 练气一层：3 月
ok('打坐 3 月 → 药长 9 年份', G.Plot.yearsOf(p, 0) === y0 + 9);
ok('seclude 的分档同样推药（长关 36 月 → +108）', (function () {
  G.Time.seclude('epic');
  return G.Plot.yearsOf(p, 0) === y0 + 9 + 108;
})());
ok('passTime 之外的入口不改年份（plant 不耗时）', (function () {
  const before = G.Plot.yearsOf(p, 0), m = p.totalMonths;
  G.Plot.plant(1);                 // 无苗 → 失败，也不可能推进时间
  return G.Plot.yearsOf(p, 0) === before && p.totalMonths === m;
})());

/* ================= ⑦ 摘要 ================= */
section('⑦ 摘要');
p = fresh({ bainian: 3 });
G.Plot.plant(0);
G.Plot.tick(320);                 // 第 1 垄满千年
st = G.Plot.status(p);
ok('growing 只数有药的垄', st.growing === 1);
ok('ready 数满千年的垄', st.ready === 1);
ok('nextLeft 为 null（没有在长但未成的）', st.nextLeft === null);

G.Plot.plant(1);
G.Plot.tick(12);
st = G.Plot.status(p);
ok('两垄在长、一垄可收', st.growing === 2 && st.ready === 1);
ok('nextLeft 报未成那垄的余月', st.nextLeft === G.Plot.monthsLeft(p, 1));
ok('list 长度 = 垄数', st.list.length === 3);
ok('第 3 垄仍是空地', st.list[2].empty === true);

console.log('\n==== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ====');
if (fail) { console.log('失败项：' + fails.join(' | ')); process.exit(1); }
