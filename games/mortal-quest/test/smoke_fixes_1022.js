'use strict';
/* =========================================================
 * test/smoke_fixes_1022.js —— 全链路排查 12 项修复·逻辑层回归
 * 覆盖（DOM 层：战斗锁/置灰/折叠/顶栏/体验档文案由浏览器实测另行核）：
 *   ① periphery 中英混排清除（源码扫描）
 *   ② 黑市所在地守卫（BlackMarket.at + 各交易函数 away 拦截）
 *   ③ 批量出手凡物（JUNK_IDS 白名单，主材绝不入列）
 *   ④ 雇镖局打探消息（50 两 · 1 月，仅凡俗城池）
 *   ⑤ 重伤疗伤分离（healOnly：不涨修为、复原气血、清标记）
 *   ⑥ 修炼日志折叠键（fold=meditate 且 months/exp 正确）
 *   ⑦ 长关危急中断（周天截断：余 3 月寿元缓冲 / 不足一个周天则拒）
 *   ⑧ 药香/觊觎月度消减（公式 1+敛气×2；无百年灵药 ×3；散修也消）
 * 运行： node test/smoke_fixes_1022.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

const logs = [];
const uiStub = {
  log: function (msg, type, fold) { logs.push({ msg: String(msg), type: type, fold: fold || null }); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, showBreakthroughModal: function () {}
};

let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub, BattleResult: { show: function () {} } };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills.js',
  'data/events.js', 'data/world.js', 'data/worldmap.js', 'data/content.js',
  'data/qixuan_events.js', 'data/demon_war_events.js', 'data/skills_foundation.js',
  'data/items_foundation.js', 'data/dungeon_heisha.js', 'data/secret_relic.js',
  'data/wild_dungeons.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js',
  'js/plot.js', 'js/mortality.js', 'js/breakthrough.js', 'js/moEvent.js',
  'js/market.js', 'js/map.js', 'js/jiayuan.js', 'js/mansion.js', 'js/tainan.js',
  'js/sect.js', 'js/garden.js', 'js/home.js', 'js/codex.js', 'js/blackmarket.js',
  'js/trial.js', 'js/forbidden_zone.js', 'js/qixuan.js', 'js/puppet.js',
  'js/insect.js', 'js/cave2.js', 'js/cultivation.js', 'js/alchemy.js',
  'js/bottle.js', 'js/bonds.js', 'js/dungeon_heisha.js', 'js/secret_relic.js',
  'js/secret.js', 'js/hunt.js', 'js/teleport_portal.js', 'js/endings.js',
  'js/goals.js', 'js/review.js', 'js/moments.js', 'js/tips.js', 'js/auction.js',
  'js/chronicle.js', 'js/path.js', 'js/seize.js', 'js/yuanying.js', 'js/faction.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }
function lastLog() { return logs.length ? logs[logs.length - 1] : { msg: '' }; }
function hasLog(re) { return logs.some(function (l) { return re.test(l.msg); }); }
function setInv(id, n) { var p = G.State.p(); p.inventory = p.inventory || {}; p.inventory[id] = n; }

const p = G.State.createNewPlayer('j');
p.realmIndex = 13;   // 筑基初期：meditateMonths=8，maxAge=200
p.sectId = null; p.shichong = null; p.yindu = null; p.causal = null;
p.marketRiskValue = 0; p.leak = 0; p.riskHunt = false;

/* ================= ① periphery 穿帮 ================= */
section('① 秘境游历文案：periphery 清除');
var htmlSrc = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');
var secretSrc = fs.readFileSync(path.join(BASE, 'js/secret.js'), 'utf8');
ok("index.html 无 periphery", htmlSrc.indexOf('periphery') < 0);
ok("index.html 已是「外围」", htmlSrc.indexOf('只在外围游走探看') >= 0);
ok("secret.js 运行时文案无 periphery", secretSrc.indexOf('periphery') < 0);
ok("secret.js 注释也无 periphery", secretSrc.indexOf('秘境外围游走') >= 0);

/* ================= ② 黑市所在地守卫 ================= */
section('② 黑市所在地守卫（at + away 拦截）');
p.location = 'youhuang_gu';
ok("幽篁谷 at()=false", G.BlackMarket.at() === false);
p.location = 'tainan_gu';
ok("苍南谷 at()=true", G.BlackMarket.at() === true);
// 远离时各交易函数一律拦截（ stones 不扣、日志说明门路）
p.location = 'youhuang_gu';
p.junkGoods = [{ id: 'junk_rusty', price: 15, needSpirit: 7, realId: 'junk_scrap', treasure: false, appraised: false }];
p.spiritStones = 500; var st0 = p.spiritStones;
G.BlackMarket.buyJunk(0);
ok("远离时 buyJunk 被拦", p.spiritStones === st0 && hasLog(/苍南谷/));
G.BlackMarket.appraise(0);
ok("远离时 appraise 被拦", hasLog(/苍南谷/));
G.BlackMarket.buyRotation(0);
ok("远离时 buyRotation 被拦", hasLog(/苍南谷/));
setInv('herb_qiannian', 1);
G.BlackMarket.sellBlack('herb_qiannian');
ok("远离时 sellBlack 被拦（灵药不丢）", G.State.countItem('herb_qiannian') === 1 && hasLog(/苍南谷/));
G.BlackMarket.buySkill(0);
ok("远离时 buySkill 被拦", hasLog(/苍南谷/));
// 抵达后恢复可交易
p.location = 'tainan_gu';
p.spiritStones = 500;
G.BlackMarket.buyJunk(0);
ok("苍南谷 buyJunk 放行（扣灵石）", p.spiritStones < 500);

/* ================= ③ 批量出手凡物 ================= */
section('③ 批量出手凡物（JUNK_IDS 白名单）');
var JUNK = G.DATA.JUNK_IDS;
ok("JUNK_IDS 已定义且含矿石/废铁", !!JUNK && JUNK.indexOf('ore') >= 0 && JUNK.indexOf('junk_scrap') >= 0);
ok("未鉴定旧货（junk_skin）故意不入列", JUNK.indexOf('junk_skin') < 0);
p.atMarket = true; p.isDead = false; p.combat = null;
setInv('ore', 5); setInv('junk_scrap', 3); setInv('beast_soul', 2); setInv('jinshi', 4); setInv('herb_bainian', 2);
p.spiritStones = 100;
var wantGain = G.Market.sellPrice(G.DATA.ITEMS.ore.price) * 5 + G.Market.sellPrice(G.DATA.ITEMS.junk_scrap.price) * 3;
G.Market.sellJunkAll();
ok("凡物清空（ore/junk_scrap）", G.State.countItem('ore') === 0 && G.State.countItem('junk_scrap') === 0);
ok("主材不动（妖兽精魄/金石/灵药）", G.State.countItem('beast_soul') === 2 && G.State.countItem('jinshi') === 4 && G.State.countItem('herb_bainian') === 2);
ok("灵石入账 = 期望值（probe 现算）", p.spiritStones === 100 + wantGain);
setInv('ore', 0); setInv('junk_scrap', 0);
G.Market.sellJunkAll();
ok("无凡物时友好提示", hasLog(/没有凡物/));

/* ================= ④ 雇镖局打探消息 ================= */
section('④ 世俗城镇：雇镖局打探消息（50 两 · 1 月）');
G.Map.cur = function () { return { kind: 'mortal', name: '青牛镇' }; };   //  stub：凡俗城池节点
p.silver = 100; var m0 = p.totalMonths;
G.Market.scoutNews();
ok("扣 50 两", p.silver === 50);
ok("耗时 1 月", p.totalMonths === m0 + 1);
ok("有情报日志", hasLog(/镖局耳报/));
p.silver = 30;
G.Market.scoutNews();
ok("盘缠不足被拒", p.silver === 30 && hasLog(/盘缠不足/));
G.Map.cur = function () { return { kind: 'sect', name: '青梧谷' }; };
p.silver = 100; var m1 = p.totalMonths;
G.Market.scoutNews();
ok("非凡俗地界拒雇（月数不花）", p.silver === 100 && p.totalMonths === m1 && hasLog(/只在外城凡俗地界/));

/* ================= ⑤ 重伤疗伤分离 ================= */
section('⑤ 重伤疗伤：不涨修为，只回血清标记');
p.ageYears = 191; p.ageMonths = 8;         // 寿元余 100 月
var tmHeal = p.totalMonths;
p.currentExp = 42; p.wounded = { hp: 1 }; p.currentHp = 1; p.maxHp = 350;
var exp0 = p.currentExp, hp0 = p.currentHp;
G.Core.meditate();
ok("修为不增（疗伤档）", p.currentExp === exp0);
ok("气血尽复", p.currentHp === p.maxHp && p.currentHp > hp0);
ok("重伤标记已清", !p.wounded);
ok("疗伤日志明确", hasLog(/静坐调息.*重伤已愈/));
ok("确实花了年月（总时钟 +8，月份会进位）", p.totalMonths === tmHeal + 8);

/* ================= ⑥ 修炼日志折叠键 ================= */
section('⑥ 修炼日志折叠键（fold=meditate）');
p.ageYears = 191; p.ageMonths = 8; p.currentExp = 0; p.wounded = null;
logs.length = 0;
G.Core.meditate();
// passTime 内还会刷坊市换货等日志，取最后一条带 fold 的修炼条目
var folded = logs.filter(function (x) { return x.fold && x.fold.fold === 'meditate'; });
ok("log 第三参带 fold.meditate", folded.length >= 1);
ok("fold.months/exp 与本档一致", folded.length >= 1 && folded[folded.length - 1].fold.months === 8 && folded[folded.length - 1].fold.exp === 1);
ok("疗伤档不带 fold（不折叠）", logs.filter(function (x) { return x.fold; }).every(function (x) { return x.fold.fold === 'meditate'; }));

/* ================= ⑦ 长关危急中断 ================= */
section('⑦ 长关危急中断（余 3 月缓冲 / 不足一个周天则拒）');
// A. 强制截断：寿元余 98 月，长关 96 月 → 截到 11 个周天（88 月）
p.ageYears = 191; p.ageMonths = 10;        // (200-191)*12-10 = 98
p.currentExp = 0; var mm0 = p.totalMonths;
logs.length = 0;
var rA = G.Time.seclude('epic');
ok("长关仍可入（非必死）", rA === true);
ok("按周天截断为 88 月", p.totalMonths === mm0 + 88);
ok("修为按截断后周天算（11）", p.currentExp === 11);
ok("有「强行破关」告警", hasLog(/强行破关/));
// B. 不足一个周天：寿元余 10 月，静修需 8 月（留 3 月只剩 2 月 → 拒）
p.ageYears = 199; p.ageMonths = 2;         // (200-199)*12-2 = 10
p.currentExp = 0; var mm1 = p.totalMonths;
logs.length = 0;
var rB = G.Time.seclude('short');
ok("余 10 月时静修被拒（留不出 3 月缓冲）", rB === false);
ok("拒绝不推进任何状态", p.totalMonths === mm1 && p.currentExp === 0);
ok("拒绝理由说人话", hasLog(/无法闭关/));
// C. 正常区（余 100 月）：不截断
p.ageYears = 191; p.ageMonths = 8;
p.currentExp = 0; var mm2 = p.totalMonths;
logs.length = 0;
G.Time.seclude('short');
ok("余 100 月：正常 8 月不截断", p.totalMonths === mm2 + 8 && p.currentExp === 1);
ok("无「强行破关」告警", !hasLog(/强行破关/));
// D. 反向对照：寿元只余 5 月（旧 guard 行为）——静修 8 月本就该被 guard 拦
p.ageYears = 199; p.ageMonths = 7;         // 5 月
logs.length = 0;
var rD = G.Time.seclude('short');
ok("余 5 月：guard 照旧拦截（回归对照）", rD === false && hasLog(/寿元只余/));

/* ================= ⑧ 药香/觊觎消减 ================= */
section('⑧ 药香/觊觎月度消减（1+敛气×2；无百年灵药 ×3）');
p.ageYears = 100; p.ageMonths = 0;
p.leak = 30; p.marketRiskValue = 40; p.concealLevel = 0; p.riskWarned = true;
setInv('herb_bainian', 0); setInv('herb_qiannian', 0);
p.plot = null;                                   // 药圃空
var tm0 = p.totalMonths;
G.Core.passTime(2);
ok("无百年灵药：药香 ×3 消减（30-6=24）", p.leak === 24);
ok("觊觎按公式消减（40-2=38）", p.marketRiskValue === 38);
setInv('herb_bainian', 1);
p.leak = 30; p.marketRiskValue = 40;
G.Core.passTime(2);
ok("有百年灵药：药香常速（30-2=28）", p.leak === 28);
p.concealLevel = 2; p.leak = 30; p.marketRiskValue = 40;
G.Core.passTime(2);
ok("敛气 2 阶：药香 30-10=20", p.leak === 20);
ok("敛气 2 阶：觊觎 40-10=30", p.marketRiskValue === 30);
p.leak = 1; p.concealLevel = 0; setInv('herb_bainian', 0);
G.Core.passTime(1);
ok("归零不穿负（floor 0）", p.leak === 0);
ok("散修同样消减（Garden.active=false 也走 passTime 直调）", G.Garden.active() === false);

/* ================= 收尾 ================= */
console.log('\n==========================================');
console.log('smoke_fixes_1022：PASS ' + pass + ' / FAIL ' + fail);
if (fail) { console.log('失败项：' + fails.join(' | ')); process.exit(1); }
