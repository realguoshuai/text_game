'use strict';
/* =========================================================
 * test/smoke_starwar.js —— 元婴篇 · 阶段二（碎星海争雄）回归测试
 *   ① 2.1 扩图：三处元婴节点 / 路由 / 元婴篇章节 / chapterOf / atStarSea 白名单
 *   ② 2.2 拉锯战：战局读写入口（夹紧）、占上风判定、月度漂移不越界、
 *      投效门禁、事件按阵营覆写、三选项结算（冲阵/暗杀/护送）、
 *      战后收尾、胜方货栈与购买
 *   ③ 2.3 立派：canFoundSect 门禁、foundSect 扣费落档、门派供奉、
 *      阵法月耗减半、护阵反制增幅封顶
 * 运行： node test/smoke_starwar.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, showBreakthroughModal: function () {}
};

let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/content.js',
  'data/world.js', 'data/events.js', 'data/wild_dungeons.js', 'data/skills_foundation.js',
  'data/worldmap.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js',
  'js/chronicle.js', 'js/faction.js', 'js/path.js', 'js/seize.js',
  'js/breakthrough.js', 'js/yuanying.js', 'js/cave2.js', 'js/map.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }
function P() { return G.State.p(); }

function mk(o) {
  o = o || {};
  const p = G.State.createNewPlayer('j');
  p.realmIndex = (o.realmIndex == null) ? 19 : o.realmIndex;
  if (o.location !== undefined) p.location = o.location;
  if (o.spiritStones != null) p.spiritStones = o.spiritStones;
  if (o.starWar !== undefined) p.starWar = o.starWar;
  if (o.warCd !== undefined) p.warCd = o.warCd;
  if (o.lingShan !== undefined) p.lingShan = o.lingShan;
  if (o.formation !== undefined) p.formation = o.formation;
  if (o.pendingEvent !== undefined) p.pendingEvent = o.pendingEvent;
  if (o.combat !== undefined) p.combat = o.combat;
  if (o.xinmoImmunity !== undefined) p.xinmoImmunity = o.xinmoImmunity;
  return p;
}

const W = G.DATA.STARWAR;

/* ============ ① 2.1 碎星海扩图 ============ */
section('【1】碎星海扩图：节点 / 路由 / 章节 / atStarSea');

const NODE_IDS = ['xingque_neihai', 'luanxing_zongtan', 'yaoshou_haiyan'];
NODE_IDS.forEach(function (id) {
  const n = G.Map.node(id);
  ok('节点存在：' + id, !!n && n.name && n.reqRealm === 19 && n.chapter === 'star');
});
const ROUTE_IDS = ['r_sea_xq', 'r_sea_lx', 'r_sea_ys'];
ROUTE_IDS.forEach(function (rid) {
  const hit = G.DATA.MAP.routes.filter(function (r) { return r.id === rid; })[0];
  ok('路由存在：' + rid, !!hit && hit.from === 'luanxing_hai');
});
const starCh = G.DATA.MAP.chapters.filter(function (c) { return c.id === 'star'; })[0];
ok('碎星海篇境界区间放宽至元婴（realmRange 含 21）',
  starCh.realmRange[0] === 16 && starCh.realmRange[1] === 21);
const yyCh = G.DATA.MAP.chapters.filter(function (c) { return c.id === 'yuanying'; })[0];
ok('元婴篇章节已立（minRealm 19）', !!yyCh && yyCh.minRealm === 19);
ok('chapterOf：元婴在云国 → 元婴篇', G.Map.chapterOf(19, 'shenshou_gu') === 'yuanying');
ok('chapterOf：元婴在碎星海 → 星海篇（location 优先）', G.Map.chapterOf(19, 'luanxing_hai') === 'star');
ok('chapterOf：结丹 → 结丹篇（不回归）', G.Map.chapterOf(17, 'shenshou_gu') === 'jiedan');

// atStarSea 白名单回归：元婴期 chapterOf 已归元婴篇，不能用 chapter 反推
let p = mk({ realmIndex: 19, location: 'luanxing_hai' });
ok('元婴在碎星海 → atStarSea=true（白名单回归，旧写法会误判 false）', G.Cave2.atStarSea() === true);
p = mk({ realmIndex: 19, location: 'xingque_neihai' });
ok('元婴在星阙内海 → atStarSea=true（寰尘/立派可达）', G.Cave2.atStarSea() === true);
p = mk({ realmIndex: 19, location: 'shenshou_gu' });
ok('元婴在云国 → atStarSea=false', G.Cave2.atStarSea() === false);

/* ============ ② 2.2 两强争海 ============ */
section('【2】战局读写与判定');

p = mk({ starWar: 50 });
ok('战局默认/现值 50', G.Faction.warValue(p) === 50);
ok('均势 → 无占上风方', G.Faction.warSide(p) === null);
ok('均势 → 无货栈', G.Faction.warStall(p) === null);
G.Faction.warShift(p, 25);
ok('战局 +25 → 75 → 星阙占上风', G.Faction.warValue(p) === 75 && G.Faction.warSide(p) === 'xingque');
ok('占上风 → 货栈为星阙（三件）',
  G.Faction.warStall(p) && G.Faction.warStall(p).side === 'xingque' && G.Faction.warStall(p).goods.length === 3);
G.Faction.warShift(p, 100);
ok('上冲夹紧至 95（bounds[1]）', G.Faction.warValue(p) === W.bounds[1]);
G.Faction.warShift(p, -200);
ok('下冲夹紧至 5（bounds[0]）', G.Faction.warValue(p) === W.bounds[0]);
ok('战局 5 → 乱星盟占上风', G.Faction.warSide(p) === 'luanxing');
ok('warLabel 含战局数值', G.Faction.warLabel(p).indexOf(String(G.Faction.warValue(p))) >= 0);

section('【3】月度漂移不越界');
p = mk({ starWar: 90 });
G.Faction.warTick(12);
ok('强方漂移仍在 [5,95] 内', G.Faction.warValue(p) >= W.bounds[0] && G.Faction.warValue(p) <= W.bounds[1]);
p = mk({ starWar: 50 });
G.Faction.warTick(600);
ok('长年漂移仍在界内', G.Faction.warValue(p) >= W.bounds[0] && G.Faction.warValue(p) <= W.bounds[1]);

section('【4】投效门禁');
p = mk({ realmIndex: 18, location: 'xingque_neihai', warCd: 0 });
G.Faction.warJoin('xingque');
ok('结丹投效 → 拒绝且不挂事件', !P().pendingEvent && logs.some(function (m) { return m.indexOf('元婴修士的棋局') >= 0; }));
p = mk({ realmIndex: 19, location: 'shenshou_gu', warCd: 0 });
G.Faction.warJoin('xingque');
ok('身在云国投效 → 拒绝（须亲至总坛）', !P().pendingEvent);
p = mk({ realmIndex: 19, location: 'xingque_neihai', warCd: 3 });
G.Faction.warJoin('xingque');
ok('休整期内投效 → 拒绝', !P().pendingEvent && logs.some(function (m) { return m.indexOf('再歇 3 个月') >= 0; }));
p = mk({ realmIndex: 19, location: 'xingque_neihai', warCd: 0 });
G.Faction.warJoin('xingque');
ok('元婴 + 星阙内海 + 无休整 → 挂起参战事件',
  !!P().pendingEvent && P().pendingEvent.eventId === 'starwar_fight' && P().pendingEvent.side === 'xingque');

section('【5】事件按阵营覆写');
const evXq = G.Core.findEvent('starwar_fight');
ok('星阙方文案提及本方与敌方', evXq.text.indexOf('星阙') >= 0 && evXq.text.indexOf('乱星盟') >= 0);
ok('三项选择齐全', evXq.choices.length === 3);
ok('outcomes 已按阵营写入 side',
  evXq.choices.every(function (c) { return c.outcomes.every(function (o) { return o.side === 'xingque'; }); }));
p = mk({ realmIndex: 19, location: 'luanxing_zongtan', warCd: 0 });
G.Faction.warJoin('luanxing');
const evLx = G.Core.findEvent('starwar_fight');
ok('乱星盟方文案互换（本方乱星盟）',
  evLx.text.indexOf('你在乱星盟') >= 0 && evLx.choices.every(function (c) { return c.outcomes[0].side === 'luanxing'; }));

section('【6】护送结算（无风险路线）');
p = mk({ realmIndex: 19, location: 'luanxing_zongtan', warCd: 0, spiritStones: 0 });
P().pendingEvent = null;
_rand = 0.9;   // 高于任何成功率 → 只走护送
// 隔离月度漂移（warTick 已在【3】单独覆盖），只验护送本身的产出
const _warTick = G.Faction.warTick;
G.Faction.warTick = function () {};
const beforeM = P().totalMonths;
const beforeWar = G.Faction.warValue(P());
G.Faction.warResolve({ side: 'luanxing', action: 'escort' });
G.Faction.warTick = _warTick;
ok('护送 → 战局向乱星盟倾 6 分（-6）', G.Faction.warValue(P()) === beforeWar - W.escortShift);
ok('护送 → 灵石入袋（500~900）', P().spiritStones >= W.escortStones[0] && P().spiritStones <= W.escortStones[1]);
ok('护送 → 耗时 ' + W.escortMonths + ' 个月', P().totalMonths === beforeM + W.escortMonths);
ok('护送 → 进入休整期（先耗时再设冷却，未被 tick 扣掉）', P().warCd === W.cd);

section('【7】暗杀结算（成败两条路）');
p = mk({ realmIndex: 19, location: 'luanxing_zongtan', warCd: 0, spiritStones: 0 });
_rand = 0.0;   // 必成
G.Faction.warResolve({ side: 'luanxing', action: 'kill' });
ok('暗杀得手 → 战局向乱星盟倾 20 分', G.Faction.warValue(P()) === 50 - W.killShift);
ok('暗杀得手 → 灵石 800~1500', P().spiritStones >= 800 && P().spiritStones <= 1500);
p = mk({ realmIndex: 19, location: 'luanxing_zongtan', warCd: 0 });
_rand = 0.99;  // 必败
G.Faction.warResolve({ side: 'luanxing', action: 'kill' });
ok('暗杀失手 → 战局被推回 8 分', G.Faction.warValue(P()) === 50 + W.killLoss);
ok('暗杀失手 → 气血扣至 75%（保底 1 点）', P().currentHp === Math.max(1, Math.round(P().maxHp * 0.75)));

section('【8】冲阵：真战斗 + 战后收尾');
let startedWith = null;
G.Combat.start = function (id) { startedWith = id; };
p = mk({ realmIndex: 19, location: 'xingque_neihai', warCd: 0 });
G.Faction.warResolve({ side: 'xingque', action: 'charge' });
ok('星阙冲阵 → 打乱星盟先锋将', startedWith === 'luanxing_vanguard');
ok('冲阵 → combatRoute 已声明（战后路由）',
  !!P().combatRoute && P().combatRoute.type === 'war' && P().combatRoute.side === 'xingque');
p = mk({ realmIndex: 19, location: 'luanxing_zongtan', warCd: 0 });
G.Faction.warResolve({ side: 'luanxing', action: 'charge' });
ok('乱星盟冲阵 → 打星阙督帅', startedWith === 'xingque_vanguard');

p = mk({ realmIndex: 19, warCd: 0 });
G.Faction.warAfterCombat(true, { type: 'war', side: 'xingque' });
ok('冲阵得胜 → 战局向星阙倾 12 分', G.Faction.warValue(P()) === 50 + W.chargeShift);
ok('冲阵得胜 → 星阙声望 +6', G.Faction.standing(P(), 'xingque') === 6);
ok('冲阵得胜 → 进入休整期', P().warCd === W.cd);
p = mk({ realmIndex: 19, warCd: 0 });
G.Faction.warAfterCombat(false, { type: 'war', side: 'xingque' });
ok('冲阵败北 → 战局被推回 4 分', G.Faction.warValue(P()) === 50 - W.chargeLoss);
ok('冲阵败北 → 星阙声望 -3', G.Faction.standing(P(), 'xingque') === -3);

section('【9】胜方货栈购买');
p = mk({ realmIndex: 19, starWar: 80, spiritStones: 1000 });
const stall = G.Faction.warStall(p);
const g0 = stall.goods[0];
const stones0 = P().spiritStones;
G.Faction.warStallBuy(0);
ok('购买 → 扣 ' + g0.price + ' 灵石', P().spiritStones === stones0 - g0.price);
ok('购买 → 得 1 件货', G.State.countItem(g0.id) === 1);
ok('购买 → 该货已售 1 件', stall.goods[0].sold === 1);
P().spiritStones = 0;
G.Faction.warStallBuy(0);
ok('灵石不足 → 拒售且不扣不卖', P().spiritStones === 0 && stall.goods[0].sold === 1);
p = mk({ realmIndex: 19, starWar: 50, spiritStones: 9999 });
G.Faction.warStallBuy(0);
ok('僵持期无货栈 → 购买被拒', G.State.countItem('tianhuo_crystal') === 0);

/* ============ ③ 2.3 地磁灵山 ============ */
section('【10】立派门禁');
const L = G.DATA.LINGSHAN;
p = mk({ realmIndex: 18, location: 'luanxing_hai', spiritStones: 99999 });
ok('结丹立派 → 拒（元婴初期起）', G.Cave2.canFoundSect().ok === false);
p = mk({ realmIndex: 19, location: 'shenshou_gu', spiritStones: 99999 });
ok('身在云国立派 → 拒（须碎星海）', G.Cave2.canFoundSect().ok === false);
p = mk({ realmIndex: 19, location: 'luanxing_hai', spiritStones: L.cost - 1 });
ok('灵石不足 → 拒', G.Cave2.canFoundSect().ok === false);
p = mk({ realmIndex: 19, location: 'luanxing_hai', spiritStones: L.cost });
ok('元婴 + 碎星海 + 灵石足 → 可立', G.Cave2.canFoundSect().ok === true);

section('【11】立派与供奉');
G.Cave2.foundSect();
ok('立派 → 扣 ' + L.cost + ' 灵石', P().spiritStones === 0);
ok('立派 → lingShan.founded=true', P().lingShan && P().lingShan.founded === true);
ok('立派 → 见闻录有记录', logs.some(function (m) { return m.indexOf('开宗立派') >= 0; }));
ok('立派后不可再立', G.Cave2.canFoundSect().ok === false);
p = mk({ realmIndex: 19, lingShan: { founded: true, fame: 0, months: 0 }, spiritStones: 0 });
const stonesBefore = P().spiritStones;
G.Cave2.sectTribute(3);
ok('供奉 3 个月 → 灵石 +' + (L.stipend * 3), P().spiritStones === stonesBefore + L.stipend * 3);
ok('供奉 → 百年灵药 ×' + (L.herbs * 3), G.State.countItem('herb_bainian') === L.herbs * 3);
ok('供奉 → 威望按月累加', P().lingShan.fame === 3);
p = mk({ realmIndex: 19, lingShan: null, spiritStones: 0 });
G.Cave2.sectTribute(6);
ok('未立派 → 无供奉', P().spiritStones === 0);

section('【12】地磁增幅：阵法月耗与护阵反制');
p = mk({ realmIndex: 19, lingShan: null });
ok('未立派 → 月耗系数 1', G.Cave2.upkeepMul() === 1);
p = mk({ realmIndex: 19, lingShan: { founded: true, fame: 0, months: 0 } });
ok('已立派 → 月耗系数 0.5（地磁稳阵）', G.Cave2.upkeepMul() === L.upkeepMul);
p = mk({ realmIndex: 19, lingShan: null, formation: 'zhouxing' });
ok('未立派 → 反制率 0.95（周天星斗本值）', Math.abs(G.Cave2.effectiveRepel() - 0.95) < 1e-9);
p = mk({ realmIndex: 19, lingShan: { founded: true, fame: 0, months: 0 }, formation: 'zhouxing' });
ok('已立派 → 反制率 = min(0.99, 0.95+' + L.repelBonus + ') = ' + Math.min(0.99, 0.95 + L.repelBonus),
  Math.abs(G.Cave2.effectiveRepel() - Math.min(0.99, 0.95 + L.repelBonus)) < 1e-9);
p = mk({ realmIndex: 19, lingShan: { founded: true, fame: 0, months: 0 }, formation: 'wuxing' });
ok('残阵 + 立派 → 反制率 0.55（0.5+0.05，未撞顶）', Math.abs(G.Cave2.effectiveRepel() - 0.55) < 1e-9);
p = mk({ realmIndex: 19, lingShan: { founded: true, fame: 0, months: 0 }, formation: 'none' });
ok('无阵 → 反制率 0', G.Cave2.effectiveRepel() === 0);

// tickUpkeep：立派后周天星斗大阵 3 个月只扣 30（20×0.5×3）
p = mk({ realmIndex: 19, lingShan: { founded: true, fame: 0, months: 0 }, formation: 'zhouxing', spiritStones: 100 });
G.Cave2.tickUpkeep(3);
ok('tickUpkeep：立派后 3 个月阵资 30（20×0.5×3）', P().spiritStones === 100 - 30);
p = mk({ realmIndex: 19, lingShan: null, formation: 'zhouxing', spiritStones: 100 });
G.Cave2.tickUpkeep(3);
ok('tickUpkeep：未立派 3 个月阵资 60（反向对照）', P().spiritStones === 100 - 60);

/* ============ 汇总 ============ */
console.log('\n========================================');
console.log('smoke_starwar: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { fails.forEach(function (f) { console.log('  FAILED: ' + f); }); process.exit(1); }
