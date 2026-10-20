'use strict';
/* =========================================================
 * test/smoke_mortality.js —— 坐化（寿元尽）与身后事回归测试
 *   ① 模块齐备：GAME.Mortality 的对外接口
 *   ② 余寿与弥留：leftYears / dying 的边界（≤3 年）
 *   ③ 账目 reckon：纯函数（不改 p）、字段与 p 对得上、药圃逐垄
 *   ④ 判词分档：练气 / 筑基 / 杀孽 / 种药 —— 四档必须给出不同的话
 *   ⑤ 坐化 die：设死因、挂 reckoning、写日志；非寿元死法不冒充坐化
 *   ⑥ 传承 writeLegacy：只封药圃（+10 年漂流）、封顶 1000、绝不含灵石
 *   ⑦ claim：只传给新局、领过即焚（第二次必须为空）、药圃落位对得上
 *   ⑧ 目标卡：弥留时改口（剩余年限写进 why），非弥留仍报寿元余
 *   ⑨ core.checkDeath：寿元尽走 Mortality；气血尽不走
 *   ⑩ 缺模块兜底：没有 GAME.Mortality 时旧的死法仍然成立
 * 运行： node test/smoke_mortality.js
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

// localStorage 桩（传承跨周目靠它）
const store = {};
const ls = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
  clear: function () { for (const k in store) delete store[k]; }
};

const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.localStorage = ls;
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return 0.5; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/content.js', 'data/world.js',
  'js/state.js', 'js/core.js', 'js/time.js', 'js/plot.js', 'js/mortality.js', 'js/breakthrough.js', 'js/goals.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

G.Market = { refreshGoods: function () {} };
G.BlackMarket = { refreshJunk: function () {}, tickRotation: function () {} };
G.DATA.LINGFENG = [
  { id: 'low', gardenMul: 1 }, { id: 'mid', gardenMul: 1.5 }, { id: 'high', gardenMul: 2 }
];
// 目标卡会问剧情与药圃，这里桩掉剧情锁
G.Qixuan = { active: function () { return false; } };

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }
function near(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }

const P = () => G.State.p();
function fresh() {
  G.State.createNewPlayer();
  const p = P();
  p.inventory = {};
  return p;
}

/* ================= ① 模块齐备 ================= */
section('① 模块齐备');
ok('GAME.Mortality 已挂载', !!G.Mortality);
ok('对外接口齐备',
  ['leftYears', 'dying', 'reckon', 'verdict', 'regret', 'die',
    'readLegacy', 'writeLegacy', 'clearLegacy', 'claim'].every(k => typeof G.Mortality[k] === 'function'));
ok('遗书三封', G.Mortality.LETTERS.length === 3);
ok('弥留阈值 3 年', G.Mortality.DYING_YEARS === 3);
ok('药圃漂流 10 年', G.Mortality.PLOT_DRIFT === 10);

/* ================= ② 余寿与弥留 ================= */
section('② 余寿与弥留');
let p = fresh();
const limit = G.State.maxAge();
ok('余寿 = 大限 − 现龄', G.Mortality.leftYears(p) === limit - p.ageYears);
ok('刚开局不算弥留', G.Mortality.dying(p).near === false);
p.ageYears = limit - 4;
ok('余 4 年仍不算弥留（边界外）', G.Mortality.dying(p).near === false);
p.ageYears = limit - 3;
ok('余 3 年进入弥留（边界内）', G.Mortality.dying(p).near === true);
ok('弥留时报的是剩余年数', G.Mortality.dying(p).left === 3);
p.ageYears = limit;
ok('寿元已尽：left = 0', G.Mortality.leftYears(p) === 0);

/* ================= ③ 账目 reckon ================= */
section('③ 账目 reckon');
p = fresh();
p.name = '沈牧'; p.alias = '二愣子';
p.ageYears = 70; p.realmIndex = 5; p.currentExp = 3;
p.karma = 5; p.mind = 12; p.spiritStones = 88;
p.stats = { kills: 41, mercies: 3, breakthroughs: 5, explores: 9, alchemy: 7, maxRealm: 5 };
p.plots = [{ h: 'herb_bainian', y: 300 }, null, { h: 'herb_bainian', y: 1000, ripe: true }];
p.bonds = { lihuayuan: { done: true }, nangongwan: { done: true, choice: 'guard' }, dongxuaner: { done: false } };
const before = JSON.stringify(p);
const r = G.Mortality.reckon(p);
ok('reckon 是纯函数（不改 p）', JSON.stringify(p) === before);
ok('姓名/别称带出', r.name === '沈牧' && r.alias === '二愣子');
ok('入道 16 岁、在世 = 现龄−16', r.bornAge === 16 && r.span === 54);
ok('境界名与下标一致', r.realmIndex === 5 && r.realmName === G.DATA.REALMS[5].name);
ok('斩妖/放生/破境/炼丹照抄 stats',
  r.kills === 41 && r.mercies === 3 && r.breakthroughs === 5 && r.alchemy === 7);
ok('灵石计入遗物字段', r.stones === 88);
ok('药圃：两垄在长、一株满千年', r.seeds === 2 && r.ripe === 1);
ok('药圃年份合计 1300', near(r.plotYears, 1300));
ok('故人只数已完成（2 位）', r.bonds.length === 2);
ok('未了之事指向下一境', r.regret.indexOf(G.DATA.REALMS[6].name) >= 0);

/* ================= ④ 判词分档 ================= */
section('④ 判词分档');
function verdictOf(mut) {
  const q = fresh();
  Object.assign(q, mut);
  return G.Mortality.reckon(q).verdict;
}
const vQi = verdictOf({ realmIndex: 3, karma: 0, mind: 0, kills: 0, seeds: 0 });
const vJi = verdictOf({ realmIndex: 14, karma: 0, mind: 0, kills: 0 });
const vJie = verdictOf({ realmIndex: 24, karma: 0, mind: 0, kills: 0 });
const vMo = verdictOf({ realmIndex: 3, karma: -60, mind: 0, kills: 2 });
const vSeed = verdictOf({ realmIndex: 3, karma: 0, mind: 0, kills: 2, plots: [{ y: 100 }, null, null] });
ok('练气坐化：判词说"凡"', vQi.indexOf('凡') >= 0);
ok('筑基坐化：判词提这道坎', vJi.indexOf('筑基') >= 0);
ok('结丹坐化：判词说金丹已成', vJie.indexOf('金丹') >= 0);
ok('杀孽重：判词换成草木那句', vMo.indexOf('草木') >= 0);
ok('种过药：判词提"地不管你在不在"', vSeed.indexOf('地不管你在不在') >= 0);
ok('四档判词互不相同', new Set([vQi, vJi, vJie, vMo, vSeed]).size === 5);

/* ================= ⑤ 坐化 die ================= */
section('⑤ 坐化 die');
p = fresh();
p.ageYears = G.State.maxAge();
logs.length = 0;
const dr = G.Mortality.die();
ok('die 设置 isDead', p.isDead === true);
ok('死因写明寿元', p.deathReason.indexOf('寿元') >= 0);
ok('reckoning 挂到当世', !!p.reckoning && p.reckoning.diedAge === p.ageYears);
ok('返回的就是 reckoning', dr === p.reckoning);
ok('打了一条【坐化】日志', logs.some(x => x.indexOf('【坐化】') >= 0));
ok('没冒充"气血耗尽"', p.deathReason.indexOf('气血') < 0);

/* ================= ⑥ 传承 writeLegacy ================= */
section('⑥ 传承 writeLegacy');
G.Mortality.clearLegacy();
ok('清空后读不到', G.Mortality.readLegacy() === null);
p = fresh();
p.ageYears = 60; p.realmIndex = 4; p.spiritStones = 9999;
p.plots = [{ h: 'herb_bainian', y: 500 }, null, { h: 'herb_bainian', y: 995 }];
const rr = G.Mortality.reckon(p);
const lg = G.Mortality.writeLegacy(rr, 'warn');
ok('写成功并返回对象', !!lg && lg._v === 1);
ok('留下的是药师的名字与境界', lg.from === rr.name && lg.realmName === rr.realmName);
ok('遗书按 id 取到正确那封', lg.letter === G.Mortality.letterById('warn').text);
ok('空地仍是空地', lg.plots[1] === null);
ok('地里 500 年的药 +10 年 = 510', lg.plots[0].y === 510);
ok('995 +10 被封顶在 1000', lg.plots[2].y === 1000);
ok('绝不传灵石（防"死亡刷资源"）', lg.spiritStones === undefined && JSON.stringify(lg).indexOf('9999') < 0);
ok('读回来的与写进去的一致', JSON.stringify(G.Mortality.readLegacy()) === JSON.stringify(lg));

/* ================= ⑦ claim ================= */
section('⑦ claim');
// 新局：应当领到
p = fresh();
logs.length = 0;
const got = G.Mortality.claim(p);
ok('新局领到 3 条消息（前尘/遗书/药圃）', got.length === 3);
ok('日志提到前世的药师', got[0].indexOf(lg.from) >= 0);
ok('遗书写进日志', got.some(x => x.indexOf('伪灵根') >= 0));
ok('药圃两垄落位', !!p.plots[0] && p.plots[0].y === 510 && p.plots[2] && p.plots[2].y === 1000);
ok('空的那垄仍是空的', p.plots[1] === null);
ok('药种是百年灵药（下世可继续种）', p.plots[0].h === G.DATA.PLOT.seed);
ok('legacyFrom 记下前世', p.legacyFrom === lg.from);
ok('领过即焚：再领为空', G.Mortality.claim(p).length === 0);
ok('localStorage 里已清', G.Mortality.readLegacy() === null);

// 老局：绝不领
G.Mortality.writeLegacy(rr, 'self');
p = fresh();
p.totalMonths = 12;
ok('已在修行的人领不到前世洞府', G.Mortality.claim(p).length === 0);

/* ================= ⑧ 目标卡弥留改口 ================= */
section('⑧ 目标卡弥留改口');
p = fresh();
p.realmIndex = 5;
p.currentExp = 0;
p.ageYears = G.State.maxAge() - 40;
let act = G.Goals.action(p);
ok('寿元充裕时报剩余寿元', act.why.indexOf('寿元余') >= 0 && act.why.indexOf('仅余') < 0);
p.ageYears = G.State.maxAge() - 2;
act = G.Goals.action(p);
ok('弥留时改口（仅余 2 年）', act.why.indexOf('仅余 2 年') >= 0);
ok('弥留时提醒别关死自己', act.why.indexOf('蒲团') >= 0);

// 修为已满 + 弥留 → 最后一次冲关
p.currentExp = G.DATA.REALMS[5].needExp;
p.currentHp = p.maxHp;
act = G.Goals.action(p);
ok('修为满且弥留：劝冲关并点明最后一次', act.kind === 'go' && act.why.indexOf('最后一次') >= 0);

/* ================= ⑨ core.checkDeath ================= */
section('⑨ core.checkDeath');
p = fresh();
p.ageYears = G.State.maxAge();
G.Core.checkDeath();
ok('寿元尽 → 走坐化（有 reckoning）', p.isDead === true && !!p.reckoning);
ok('死因是寿元而非气血', p.deathReason.indexOf('寿元') >= 0);

p = fresh();
p.currentHp = 0;
p.companion = null;
G.Core.tryRescue = function () { return false; };
G.Core.checkDeath();
ok('气血尽 → 不走坐化（无 reckoning）', p.isDead === true && !p.reckoning);
ok('气血尽的死因原样保留', p.deathReason.indexOf('气血') >= 0);

/* ================= ⑩ 缺模块兜底 ================= */
section('⑩ 缺模块兜底');
const kept = G.Mortality;
delete G.Mortality;
p = fresh();
p.ageYears = G.State.maxAge();
G.Core.checkDeath();
ok('无 Mortality 时照样会死', p.isDead === true);
ok('死因仍是寿元大限', p.deathReason.indexOf('寿元') >= 0);
G.Mortality = kept;

/* ================= 汇总 ================= */
console.log('\n==== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ====');
if (fail) { console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
