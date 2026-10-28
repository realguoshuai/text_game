'use strict';
/* =========================================================
 * test/smoke_plot.js —— 药圃（多阶灵田 + 灵药年份）回归测试
 *   ① 配置/模块：GAME.Plot、GAME.DATA.PLOT 落位，灵田阶数与月增表
 *   ② 空地：按灵田阶数懒初始化
 *   ③ 移栽：耗百年灵药、起点 100 年；缺苗不动、占垄不叠
 *   ④ 生长：每月按阶 ypm × 灵峰 gardenMul；上限 1000 年
 *   ⑤ 收成：mature(≥100)→百年灵药；ready(≥1000)→千年灵药；幼苗(<100)收不动且不消耗
 *   ⑥ 催熟：catalyzeToHundred 幼苗→百年；catalyzeAdd +250；catalyzeDirect 拉满千年（按缺口算滴数）
 *   ⑦ 唯一出口：core.passTime / Time.seclude 推药圃年月
 *   ⑧ 一键：oneKeySeed 批量下种；oneKeyHarvest 批量采收 mature
 *   ⑨ 灵田阶数：tier 越高垄越多、月增越快
 *   ⑩ 摘要：growing / mature / ready / nextLeft 与逐垄一致
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
  'js/state.js', 'js/core.js', 'js/time.js', 'js/plot.js', 'js/mortality.js', 'js/breakthrough.js',
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

// 灵田阶数桩（plot.level() 读 GAME.Home.level("lingtian")；yieldBonus 供收成加成）
let TIER = 0, YB = 0;
G.Home = {
  level: function () { return TIER; },
  yieldBonus: function () { return YB; }
};
function setTier(n, yb) { TIER = n; YB = (yb == null ? 0 : yb); }

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
  if (opts && opts.seed) p.inventory.seed_lingyao = opts.seed;
  if (opts && typeof opts.liquid === 'number') p.liquid = opts.liquid;
  return p;
}

/* ================= ① 配置/模块 ================= */
section('① 配置/模块');
ok('GAME.Plot 已挂载', !!G.Plot);
ok('方法齐备', ['cfg', 'rate', 'yearsOf', 'monthsLeft', 'slot', 'slots', 'tick', 'level', 'tier',
  'plots', 'ypm', 'plantSeed', 'plantTransplant', 'plant', 'catalyzeToHundred', 'catalyzeAdd',
  'catalyzeDirect', 'harvest', 'oneKeySeed', 'oneKeyHarvest', 'status']
  .every(k => typeof G.Plot[k] === 'function'));
const CFG = G.DATA.PLOT;
ok('向后兼容：三垄别名', CFG.plots === 3);
ok('向后兼容：千年收成药 id', CFG.harvest.id === 'herb_qiannian' && CFG.capYears === 1000);
ok('向后兼容：移栽苗别名', CFG.seed === 'herb_bainian');
ok('新：下种起点 1 年、移栽起点 100 年', CFG.startYearsSeed === 1 && CFG.startYearsTransplant === 100);
ok('新：百年门槛 100 / 步增 250', CFG.hundred === 100 && CFG.stepAdd === 250);
ok('新：种子=灵药种子、移栽=百年灵药', CFG.seedItem === 'seed_lingyao' && CFG.transplantItem === 'herb_bainian');
ok('新：灵田阶数表 6 档（0 凡土 ~ 5 洞天）', CFG.tiers.length === 6);
ok('阶表：0 阶 3 垄/月3、1 阶 4 垄/月4、3 阶 8 垄/月10、5 阶 12 垄/月20',
  CFG.tiers[0].plots === 3 && CFG.tiers[0].ypm === 3 &&
  CFG.tiers[1].plots === 4 && CFG.tiers[1].ypm === 4 &&
  CFG.tiers[3].plots === 8 && CFG.tiers[3].ypm === 10 &&
  CFG.tiers[5].plots === 12 && CFG.tiers[5].ypm === 20);

/* ================= ② 空地（按阶懒初始化） ================= */
section('② 空地');
setTier(0);
let p = fresh({ bainian: 0 });
let st = G.Plot.status(p);
ok('0 阶默认出 3 垄', Array.isArray(p.plots) && p.plots.length === 3);
ok('三垄全空', p.plots.every(x => x === null));
ok('摘要：0 垄在长 / 0 mature / 0 ready', st.growing === 0 && st.mature === 0 && st.ready === 0);
ok('摘要：无最近可收（nextLeft 为 null）', st.nextLeft === null);
ok('摘要带种子数', st.seed === 0);

setTier(3);
p = fresh({ bainian: 0 });
st = G.Plot.status(p);   // 触发 _ensure → 按 3 阶建 8 垄
ok('3 阶按 8 垄懒初始化', st.plots === 8 && p.plots.length === 8);
setTier(0);

/* ================= ③ 移栽 ================= */
section('③ 移栽（plant = plantTransplant 别名）');
p = fresh({ bainian: 1 });
ok('移栽成功', G.Plot.plant(0) === true);
ok('耗掉 1 株百年灵药', G.State.countItem('herb_bainian') === 0);
ok('起点 100 年', G.Plot.yearsOf(p, 0) === 100);
ok('日志写明移栽与每月生长', logs.some(x => /移栽进第 1 垄/.test(x) && /每月长 3 年份/.test(x)));

p = fresh({ bainian: 0 });
ok('无苗时移栽失败', G.Plot.plant(1) === false);
ok('失败后仍是空地', p.plots[1] === null);
ok('失败有原因日志', logs.some(x => /没有可移栽的/.test(x)));

p = fresh({ bainian: 2 });
G.Plot.plant(0);
ok('同一垄不能种第二株', G.Plot.plant(0) === false);
ok('苗没被白扣（还剩 1 株）', G.State.countItem('herb_bainian') === 1);
ok('年份没被重置', G.Plot.yearsOf(p, 0) === 100);

/* ================= ④ 生长 ================= */
section('④ 生长');
setTier(0);
p = fresh({ bainian: 1 });
G.Plot.plant(0);
ok('0 阶：每月 3 年份', G.Plot.rate(p) === 3);
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

p = fresh({ bainian: 1 });
G.Plot.plant(0);
G.Plot.tick(1000);
ok('年份封顶 1000（再长也不成药王）', G.Plot.yearsOf(p, 0) === 1000);

p = fresh({ bainian: 1 });
G.Plot.plant(2);
G.Plot.tick(12);
ok('只长有种的那一垄', G.Plot.yearsOf(p, 2) === 136 && G.Plot.yearsOf(p, 0) === 0);

/* ================= ⑤ 收成（mature→百年 / ready→千年） ================= */
section('⑤ 收成');
// 幼苗（<100 年）收不动且不消耗
p = fresh({ seed: 1 });
G.Plot.plantSeed(0);
ok('幼苗 1 年收不动', G.Plot.harvest(0) === false);
ok('失败不消耗那株药（仍为 1 年）', G.Plot.yearsOf(p, 0) === 1);
ok('失败有原因日志', logs.some(x => /白糟蹋一株好药/.test(x)));

// 移栽 100 年百年药 = 千年培育起点（target 1000）→ 不算「百年可收」，破除死循环（#1）
p = fresh({ bainian: 1 });
G.Plot.plant(0);
const sl = G.Plot.slot(p, 0);
ok('移栽苗标记为 transplant、target=1000', sl.isTransplant === true && sl.target === 1000);
ok('移栽苗满 100 年仍不算「百年可收」（mature=false）', sl.mature === false && sl.ready === false);
ok('移栽苗此刻收不动（不触发误收死循环）', G.Plot.harvest(0) === false);
ok('收不动不消耗那株苗（仍为 100 年）', G.Plot.yearsOf(p, 0) === 100);
ok('一键采收不会拔出未满千年的移栽苗', G.Plot.oneKeyHarvest() === false && G.State.countItem('herb_bainian') === 0);
// 移栽苗长到千年 → 收千年灵药（非百年）
G.Plot.tick(300);   // 100 + 900 = 1000
ok('移栽苗刚好满千年', G.Plot.yearsOf(p, 0) === 1000);
ok('千年满 slot.ready', G.Plot.slot(p, 0).ready === true);
ok('千年满收成成功', G.Plot.harvest(0) === true);
ok('得千年灵药 ×1（非百年）', G.State.countItem('herb_qiannian') === 1 && G.State.countItem('herb_bainian') === 0);
ok('收完变空垄', p.plots[0] === null);

// 灵田加成：单垄基础产出固定为 1 株；高阶灵田仅小幅「双生暴击」（额外 +1）概率，不再按阶数乘法膨胀
var _rnd = sandbox.Math.random, _yb = G.Home.yieldBonus;
G.Home.yieldBonus = function () { return 2; };   // 锁死 tier2（yieldBonus 2）以确定性验证
p = fresh({ bainian: 1 });
setTier(0, 2);
G.Plot.plant(0);
G.Plot.tick(300);
sandbox.Math.random = function () { return 0.99; };   // 不触发双生暴击
G.Plot.harvest(0);
ok('灵田加成不再乘法膨胀（yieldBonus 2 仍只收 1 株）', G.State.countItem('herb_qiannian') === 1);
ok('日志不再标灵田加成', !logs.some(x => /灵田 \+/.test(x)));
// 双生暴击：强制触发时额外 +1 株（上限 +1，绝不回退到阶数乘法）
sandbox.Math.random = function () { return 0.0; };
p = fresh({ bainian: 1 });
setTier(0, 2);
G.Plot.plant(0);
G.Plot.tick(300);
G.Plot.harvest(0);
sandbox.Math.random = _rnd; G.Home.yieldBonus = _yb;
ok('双生暴击至多 +1 株（共 2 株上限）', G.State.countItem('herb_qiannian') === 2);
ok('日志标出双生暴击', logs.some(x => /双生暴击 \+1/.test(x)));
setTier(0, 0);

/* ================= ⑥ 催熟（绿液） ================= */
section('⑥ 催熟（绿液）');
p = fresh({ seed: 1, liquid: 10 });
G.Plot.plantSeed(0);
ok('幼苗 1 年', G.Plot.yearsOf(p, 0) === 1);
ok('催熟→百年（耗 1 滴绿液）', G.Plot.catalyzeToHundred(0) === true);
ok('跳到 100 年且 mature', G.Plot.yearsOf(p, 0) === 100 && G.Plot.slot(p, 0).mature === true);
ok('绿液被扣 1 滴', p.liquid === 9);
ok('日志：幼苗拔节', logs.some(x => /拔节/.test(x)));

p = fresh({ seed: 1, liquid: 10 });
G.Plot.plantSeed(0);
G.Plot.catalyzeToHundred(0);
ok('catalyzeAdd 前 100 年、绿液 9', G.Plot.yearsOf(p, 0) === 100 && p.liquid === 9);
ok('catalyzeAdd +250 年', G.Plot.catalyzeAdd(0) === true && G.Plot.yearsOf(p, 0) === 350);
ok('绿液再扣 1 滴 → 8', p.liquid === 8);

p = fresh({ seed: 1, liquid: 50 });
G.Plot.plantSeed(0);
G.Plot.catalyzeToHundred(0);          // 100，绿液 49
G.Plot.catalyzeAdd(0);                // 350，绿液 48
const before = G.Plot.yearsOf(p, 0);
ok('catalyzeDirect 拉满千年', G.Plot.catalyzeDirect(0) === true && G.Plot.yearsOf(p, 0) === 1000);
ok('直催按缺口算滴数（(1000-350)/250=3 滴，余 45）', p.liquid === 45);
ok('千年后 slot.ready', G.Plot.slot(p, 0).ready === true);

// 绿液不足
p = fresh({ seed: 1, liquid: 0 });
G.Plot.plantSeed(0);
ok('无绿液催熟失败', G.Plot.catalyzeToHundred(0) === false && G.Plot.yearsOf(p, 0) === 1);
ok('失败有原因日志', logs.some(x => /绿液不足/.test(x)));

/* ================= ⑦ 时间唯一出口 ================= */
section('⑦ 唯一出口：时间推进');
setTier(0);
p = fresh({ bainian: 1 });
G.Plot.plant(0);
const y0 = G.Plot.yearsOf(p, 0);
G.Core.meditate();
ok('打坐 3 月 → 药长 9 年份', G.Plot.yearsOf(p, 0) === y0 + 9);
ok('seclude 的分档同样推药（长关 36 月 → +108）', (function () {
  G.Time.seclude('epic');
  return G.Plot.yearsOf(p, 0) === y0 + 9 + 108;
})());
ok('plant 不耗时', (function () {
  const beforeY = G.Plot.yearsOf(p, 0), m = p.totalMonths;
  G.Plot.plant(1);
  return G.Plot.yearsOf(p, 0) === beforeY && p.totalMonths === m;
})());

/* ================= ⑧ 一键批量 ================= */
section('⑧ 一键批量');
p = fresh({ seed: 3, liquid: 0 });
ok('一键下种：3 粒种子填满 3 垄', G.Plot.oneKeySeed() === true && p.plots.filter(x => x).length === 3);
ok('种子被扣光', G.State.countItem('seed_lingyao') === 0);
ok('每垄起点 1 年', p.plots.every(x => x && x.y === 1));
ok('一键采收（无 mature）失败', G.Plot.oneKeyHarvest() === false);

p = fresh({ seed: 3, liquid: 20 });
G.Plot.oneKeySeed();
G.Plot.catalyzeToHundred(0); G.Plot.catalyzeToHundred(1); G.Plot.catalyzeToHundred(2);
ok('三垄皆 mature', p.plots.every((x, i) => x && G.Plot.slot(p, i).mature));
ok('一键采收得百年灵药 ×3', G.Plot.oneKeyHarvest() === true && G.State.countItem('herb_bainian') === 3);
ok('采收后全空', p.plots.every(x => x === null));

/* ================= ⑨ 灵田阶数 ================= */
section('⑨ 灵田阶数');
setTier(3);
p = fresh({ bainian: 1 });
ok('3 阶：8 垄', G.Plot.plots() === 8);
G.Plot.plant(0);
ok('3 阶：每月 10 年份', G.Plot.rate(p) === 10);
setTier(5);
p = fresh({ bainian: 1 });
ok('5 阶：12 垄', G.Plot.plots() === 12);
G.Plot.plant(0);
ok('5 阶：每月 20 年份', G.Plot.rate(p) === 20);
setTier(0);

/* ================= ⑩ 摘要 ================= */
section('⑩ 摘要');
setTier(0);
p = fresh({ bainian: 2, seed: 1, liquid: 50 });
G.Plot.plant(0);                 // 移栽苗：100 年起点，target 1000
G.Plot.plantSeed(1);             // 下种苗：1 年起点
G.Plot.catalyzeToHundred(1);     // 下种苗 → 100 年（mature）
G.Plot.tick(320);                // 第0垄(transplant) 100+960→封顶1000 ready；第1垄(seed) 100+960→封顶1000 ready
st = G.Plot.status(p);
ok('growing 只数有药的垄', st.growing === 2);
ok('移栽苗不计入 mature（千年培育）；两垄皆千年可收', st.mature === 0 && st.ready === 2);
ok('nextLeft 为 null（都满了）', st.nextLeft === null);

p = fresh({ bainian: 1, seed: 1, liquid: 50 });
G.Plot.plant(0);                 // 移栽苗 100
G.Plot.plantSeed(1);             // 下种苗 1
G.Plot.catalyzeToHundred(1);     // 下种苗 100（mature）
G.Plot.tick(12);                 // 第0垄 transplant 100+36=136（千年培育中）；第1垄 seed 100+36=136（mature）
st = G.Plot.status(p);
ok('移栽苗千年培育中不计入百年可收、下种苗计入', st.growing === 2 && st.ready === 0 && st.mature === 1);
ok('list 第三项为空地', st.list.length === 3 && st.list[2].empty === true);
ok('移栽苗 slot.isTransplant 为真、target=1000', st.list[0].isTransplant === true && st.list[0].target === 1000);
ok('下种苗 slot.target=100（可收百年）', st.list[1].target === 100 && st.list[1].mature === true);

console.log('\n==== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ====');
if (fail) { console.log('失败项：' + fails.join(' | ')); process.exit(1); }
