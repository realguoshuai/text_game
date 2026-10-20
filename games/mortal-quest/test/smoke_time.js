'use strict';
/* =========================================================
 * test/smoke_time.js —— 年月账簿（把闭关年月变成真资源）回归测试
 *   ① 模块与配置：GAME.Time / GAME.DATA.TIME 落位
 *   ② 寿元预算：remain / remainLabel / remainShort / 告急档位
 *   ③ 分档：周天→月数→修为/心境，高境月数按境界放大
 *   ④ 地雷：寿元撑不到 / 尸虫丸毒发 / 阴毒发作 一律拦下并给原因
 *   ⑤ 执行：seclude 加修为与心境、推进时间；被拦时不推进（不闭死）
 *   ⑥ 唯一出口：Core.meditate 走 Time.seclude，仍是"一周天 +1 修为"
 *   ⑦ 预告：preview 报坊市换货与倒计时余量
 *   ⑧ 破境筹备不再有天时（灵潮已删，成功率只由丹药/灵脉/护法/心境/丹道决定）
 * 运行： node test/smoke_time.js
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

// passTime 会碰坊市/黑市，桩掉即可（本套件只验时间账）
G.Market = { refreshGoods: function () {} };
G.BlackMarket = { refreshJunk: function () {}, tickRotation: function () {} };

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }
function near(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }

const P = () => G.State.p();
function at(realmIndex, months) {
  G.State.createNewPlayer();
  const p = P();
  p.realmIndex = realmIndex;
  p.currentExp = 0;
  p.mind = 0;
  p.totalMonths = months || 0;
  p.ageMonths = (months || 0) % 12;
  p.ageYears = (p.ageYears || 16) + Math.floor((months || 0) / 12);
  return p;
}

/* ================= ① 模块与配置 ================= */
section('① 模块与配置');
ok('GAME.Time 已挂载', !!G.Time);
ok('方法齐备', ['remain', 'remainLabel', 'remainShort', 'remainLevel',
  'tier', 'tiers', 'monthsOf', 'expOf', 'mindOf', 'guard', 'seclude', 'preview', 'priceLabel']
  .every(k => typeof G.Time[k] === 'function'));
const CFG = G.DATA.TIME;
ok('灵潮已删除：DATA.TIME 不再有 tide 配置', CFG.tide === undefined);
ok('心境折算：每 4 月 +1', CFG.mindPerMonths === 4);
ok('四档闭关：1/3/6/12 周天',
  CFG.tiers.map(t => t.cycles).join(',') === '1,3,6,12' &&
  CFG.tiers.map(t => t.id).join(',') === 'short,mid,long,epic');

/* ================= ② 寿元预算 ================= */
section('② 寿元预算');
let p = at(0, 0);
p.ageYears = 16; p.ageMonths = 0;
let r = G.Time.remain(p);
ok('16 岁 / 大限 100 → 余 1008 月', r.total === 1008);
ok('年/月拆分：84 年 0 月', r.years === 84 && r.months === 0);
ok('remainLabel → "84 年"', G.Time.remainLabel(p) === '84 年');
ok('remainShort → "84年"', G.Time.remainShort(p) === '84年');
p.ageYears = 99; p.ageMonths = 6;
r = G.Time.remain(p);
ok('99 岁 6 月 → 余 6 月', r.total === 6 && r.years === 0 && r.months === 6);
ok('不足一年时 remainLabel 用月', G.Time.remainLabel(p) === '6 月');
ok('余 6 月 → danger 档', G.Time.remainLevel(p) === 'danger');
p.ageYears = 95; p.ageMonths = 0;
ok('余 60 月 → danger', G.Time.remainLevel(p) === 'danger');
p.ageYears = 90; p.ageMonths = 0;
ok('余 120 月 → warn', G.Time.remainLevel(p) === 'warn');
p.ageYears = 80; p.ageMonths = 0;
ok('余 240 月 → 正常档', G.Time.remainLevel(p) === '');
// 延寿丹变大限 → 剩余跟着变
p = at(0, 0); p.ageYears = 80; p.ageBonus = 10;
ok('延寿丹 +10 年 → 余 360 月', G.Time.remain(p).total === 360);

/* ================= ④ 分档：周天 → 月数 → 产出 ================= */
section('④ 分档：周天 → 月数 → 产出');
p = at(0, 0);          // 练气一层，meditateMonths = 3
let tiers = G.Time.tiers(p);
ok('四档齐备', tiers.length === 4);
ok('静修：3 月 / 修为 +1 / 心境 +0', tiers[0].months === 3 && tiers[0].exp === 1 && tiers[0].mind === 0);
ok('闭关 3 周天：9 月 / +3 / 心境 +2', tiers[1].months === 9 && tiers[1].exp === 3 && tiers[1].mind === 2);
ok('苦修 6 周天：18 月 / +6 / 心境 +4', tiers[2].months === 18 && tiers[2].exp === 6 && tiers[2].mind === 4);
ok('长关 12 周天：36 月 / +12 / 心境 +9', tiers[3].months === 36 && tiers[3].exp === 12 && tiers[3].mind === 9);
ok('priceLabel 含月数与产出', /36 月/.test(G.Time.priceLabel(tiers[3])) && /心境 \+9/.test(G.Time.priceLabel(tiers[3])));

// 高境：月数随 meditateMonths 放大（结丹 12 月/周天）
p = at(22, 0);
tiers = G.Time.tiers(p);
ok('结丹：静修 12 月', tiers[0].months === 12);
ok('结丹：长关 144 月（12 年）', tiers[3].months === 144);

/* ================= ⑤ 地雷守卫 ================= */
section('⑤ 地雷守卫');
p = at(0, 0); p.ageYears = 99; p.ageMonths = 6;   // 余 6 月
let g = G.Time.guard(p, 36);
ok('寿元撑不到 → 拦下', g.ok === false && /寿元只余/.test(g.why));
ok('静修 3 月放行（3 月 < 余 6 月）', G.Time.guard(p, 3).ok === true);
g = G.Time.guard(p, 6);
ok('刚好等于余量也拦（闭满即寿终）', g.ok === false);

p = at(0, 0); p.shichong = { months: 6 };
g = G.Time.guard(p, 9);
ok('尸虫丸 6 月毒发 → 闭 9 月被拦', g.ok === false && /尸虫丸/.test(g.why));
ok('闭 3 月放行（赶得及）', G.Time.guard(p, 3).ok === true);

p = at(0, 0); p.yindu = { months: 4 };
g = G.Time.guard(p, 9);
ok('阴毒 4 月发作 → 闭 9 月被拦', g.ok === false && /阴毒/.test(g.why));

p = at(0, 0);
ok('常态长关放行', G.Time.guard(p, 36).ok === true);
ok('零月无效', G.Time.guard(p, 0).ok === false);

/* ================= ⑥ 执行 ================= */
section('⑥ 执行 seclude');
p = at(0, 0);
const m0 = p.totalMonths;
let done = G.Time.seclude('mid');
ok('闭关闭成功', done === true);
ok('修为 +3', p.currentExp === 3);
ok('心境 +2', p.mind === 2);
ok('时间推进 9 月', p.totalMonths === m0 + 9);
ok('年龄跟着走（9 月）', p.ageMonths === 9);
ok('有闭关日志', logs.some(x => /闭关苦修 9 个月/.test(x)));

// 被拦时不推进时间、不加修为（不闭死）
p = at(0, 0); p.ageYears = 99; p.ageMonths = 6;
const before = { m: p.totalMonths, e: p.currentExp, y: p.ageYears };
done = G.Time.seclude('epic');
ok('寿元不足时长关被拒', done === false);
ok('被拒后时间未推进', p.totalMonths === before.m && p.ageYears === before.y);
ok('被拒后修为未变', p.currentExp === before.e);
ok('被拒有原因日志', logs.some(x => /无法闭关——寿元只余/.test(x)));

// 待决事件中不能闭关
p = at(0, 0); p.pendingEvent = { id: 'x' };
ok('有待决事件 → 不动', G.Time.seclude('short') === false && p.currentExp === 0);

/* ================= ⑦ 唯一出口：Core.meditate ================= */
section('⑦ 唯一出口：Core.meditate');
p = at(5, 0);       // 练气六层，4 月/周天
G.Core.meditate();
ok('打坐仍是一周天：修为 +1', p.currentExp === 1);
ok('耗时 = 本境 meditateMonths(4)', p.totalMonths === 4);
ok('心境按 4 月折算 +1', p.mind === 1);
// meditateTimes 复用同一条路径
p = at(0, 0);
const n = G.Core.meditateTimes(5);
ok('连修 5 次执行 5 轮', n === 5);
ok('修为 +5（一周天一点不变）', p.currentExp === 5);
ok('时间推进 15 月', p.totalMonths === 15);

/* ================= ⑧ 预告 ================= */
section('⑧ 闭关预告');
p = at(0, 0);
const pv = G.Time.preview(p, 36);
ok('预告含坊市换货次数', pv.some(x => /坊市换货 3 次/.test(x)));
ok('预告含出关时寿元', pv.some(x => /出关时寿元余/.test(x)));
p = at(0, 0); p.shichong = { months: 12 };
ok('有尸虫丸时预告其余量', G.Time.preview(p, 6).some(x => /尸虫丸余 6 月/.test(x)));

/* ================= ⑧ 破境筹备不再有天时 ================= */
section('⑧ 破境筹备不再有天时');
function atBreak(months) {
  G.State.createNewPlayer();
  const q = P();
  q.realmIndex = 5;
  q.currentExp = G.DATA.REALMS[5].needExp;
  q.mind = 0; q.peak = 'low'; q.btGuard = false; q.companion = null;
  q.bag = {}; q.spiritStones = 0;
  q.totalMonths = months;
  return q;
}
let plan = G.Breakthrough.plan(atBreak(0));
ok('plan.parts 里没有 tide 股', !plan.parts.some(x => x.id === 'tide'));
ok('底子 0.58（灵脉/护法/心境全 0 时就是底子）', near(plan.successChance, 0.58));
ok('换个年份也不改变成功率（不再看天时）', near(G.Breakthrough.plan(atBreak(6)).successChance, 0.58));
const adv = G.Breakthrough.advice(atBreak(0));
ok('建议里不再劝"等灵潮"', !adv.some(x => x.id === 'tide'));
ok('GAME.Time 上已无 tide/tideLabel', typeof G.Time.tide === 'undefined' && typeof G.Time.tideLabel === 'undefined');

console.log('\n==== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ====');
if (fail) { console.log('失败项：' + fails.join(' | ')); process.exit(1); }
