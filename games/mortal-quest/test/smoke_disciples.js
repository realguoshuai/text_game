'use strict';
/* =========================================================
 * test/smoke_disciples.js —— 4.1 收徒立派（弟子养成）回归
 *   ① DISCIPLES 配置 + p.disciples 默认
 *   ② canRecruit 门禁（元婴 / 已立派 / 灵石 / 在册上限）
 *   ③ recruit 收徒（耗灵石、掷根骨、取名非空且去原著化）
 *   ④ stageOf 境界划分
 *   ⑤ discipleTick 成长累计 + 结丹后供奉反哺
 *   ⑥ train 传功（耗修为+灵石，+成长；不足拒）
 *   ⑦ dispatch 历练（调 passTime；无伤得灵石 / 受伤折成长）
 *   ⑧ graduate 出师（谢师礼+离门；未够格拒）
 *   ⑨ 姓名池去原著化
 * 运行： node test/smoke_disciples.js
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
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

const p = G.State.createNewPlayer('j');
p.realmIndex = 19;
p.disciples = [];

/* ================= ① 配置 + 默认 ================= */
section('① DISCIPLES 配置 + p.disciples');
var DC = G.DATA.DISCIPLES;
ok("DISCIPLES 配置存在", !!DC);
ok("收徒门禁元婴(19) / 须立派 / 上限3", DC && DC.gateRealm === 19 && DC.needSect === true && DC.cap === 3);
ok("弟子新方法齐全", G.Bonds.canRecruit && G.Bonds.recruit && G.Bonds.train && G.Bonds.dispatch && G.Bonds.graduate && G.Bonds.discipleTick);

/* ================= ② canRecruit 门禁 ================= */
section('② canRecruit 门禁');
p.lingShan = null; p.spiritStones = 9999; p.disciples = [];
ok("元婴未立派 → 不可", G.Bonds.canRecruit().ok === false);
p.lingShan = { founded: true, fame: 0 }; p.spiritStones = 100;
ok("已立派灵石不足 → 不可", G.Bonds.canRecruit().ok === false);
p.spiritStones = 800;
ok("元婴+立派+灵石足 → 可", G.Bonds.canRecruit().ok === true);
p.disciples = [{}, {}, {}];
ok("在册满 3 → 不可", G.Bonds.canRecruit().ok === false);
p.disciples = [];
p.realmIndex = 13;
ok("非元婴 → 不可", G.Bonds.canRecruit().ok === false);
p.realmIndex = 19;

/* ================= ③ recruit 收徒 ================= */
section('③ recruit 收徒');
p.spiritStones = 800; p.disciples = []; _rand = 0.5;
G.Bonds.recruit();
ok("收徒：入册一名", p.disciples.length === 1);
ok("收徒：耗灵石 800", p.spiritStones === 0);
ok("收徒：根骨档合法", p.disciples[0].talent >= 0 && p.disciples[0].talent < DC.talents.length);
ok("收徒：弟子名非空", !!p.disciples[0].name && p.disciples[0].name.length >= 2);
ok("收徒：成长从 0 起", p.disciples[0].growth === 0);

/* ================= ④ stageOf 境界划分 ================= */
section('④ stageOf 弟子境界');
ok("成长 0 → 炼气", G.Bonds.stageOf(0).name === "炼气");
ok("成长 120 → 筑基", G.Bonds.stageOf(120).name === "筑基");
ok("成长 400 → 结丹", G.Bonds.stageOf(400).name === "结丹");
ok("成长 900 → 元婴", G.Bonds.stageOf(900).name === "元婴");

/* ================= ⑤ discipleTick 成长 + 供奉 ================= */
section('⑤ discipleTick 成长 + 供奉反哺');
p.disciples = [{ name: "甲", talent: 0, growth: 0, months: 0, tributing: false }];
p.realmIndex = 19;
var g0 = p.disciples[0].growth;
G.Bonds.discipleTick(1);
var expectGrow = DC.growthPerMonth * DC.talents[0].rate * (1 + Math.max(0, 19 - 18) * 0.1) * 1;
ok("弟子按月成长（probe）", Math.abs((p.disciples[0].growth - g0) - expectGrow) < 1e-6);
// 供奉：成长直接置到结丹阶
p.disciples = [{ name: "乙", talent: 0, growth: 400, months: 0, tributing: false }];
p.spiritStones = 0;
G.Bonds.discipleTick(1);
ok("结丹弟子开始供奉（月奉 150×1）", p.spiritStones === DC.tributeStones * 1);
ok("供奉标记置位", p.disciples[0].tributing === true);
// 空门徒不报错
p.disciples = [];
ok("无弟子时 tick 安全", G.Bonds.discipleTick(6) === undefined);

/* ================= ⑥ train 传功 ================= */
section('⑥ train 传功');
p.disciples = [{ name: "丙", talent: 0, growth: 0, months: 0, tributing: false }];
p.currentExp = 100; p.spiritStones = 1000;
G.Bonds.train(0);
ok("传功：成长 +40", p.disciples[0].growth === DC.trainGrowth);
ok("传功：耗修为 30", p.currentExp === 70);
ok("传功：耗灵石 200", p.spiritStones === 800);
p.currentExp = 5;
G.Bonds.train(0);
ok("修为不足：拒绝传功（成长不变）", p.disciples[0].growth === DC.trainGrowth);

/* ================= ⑦ dispatch 历练 ================= */
section('⑦ dispatch 历练');
var realPassTime = G.Core.passTime;
var ptMonths = 0;
G.Core.passTime = function (m) { ptMonths += (m || 0); };   // 隔离：只记时不触发其它 tick
p.disciples = [{ name: "丁", talent: 0, growth: 0, months: 0, tributing: false }];
p.spiritStones = 0; p.lingShan = { founded: true, fame: 0 }; _rand = 0.9;   // ≥0.25 无伤
G.Bonds.dispatch(0);
ok("历练：调 passTime(6)", ptMonths === DC.dispatchMonths);
ok("历练无伤：得灵石", p.spiritStones > 0);
p.disciples = [{ name: "戊", talent: 0, growth: 200, months: 0, tributing: false }];
p.spiritStones = 0; _rand = 0.1;   // <0.25 受伤
G.Bonds.dispatch(0);
ok("历练受伤：成长折损(<200)", p.disciples[0].growth < 200);
G.Core.passTime = realPassTime;

/* ================= ⑧ graduate 出师 ================= */
section('⑧ graduate 出师');
p.disciples = [{ name: "己", talent: 0, growth: 900, months: 0, tributing: true }];
p.spiritStones = 0; p.lingShan = { founded: true, fame: 0 };
G.Bonds.graduate(0);
ok("出师：弟子离门", p.disciples.length === 0);
ok("出师：谢师礼 3000", p.spiritStones === DC.graduateStones);
p.disciples = [{ name: "庚", talent: 0, growth: 100, months: 0, tributing: false }];
G.Bonds.graduate(0);
ok("未够格：出师拒绝（仍在门）", p.disciples.length === 1);

/* ================= ⑨ 姓名池去原著化 ================= */
section('⑨ 姓名池去原著化');
var banned = ["韩立", "厉飞雨", "南宫婉", "墨大夫", "墨居仁", "银月", "紫灵", "元瑶", "宝花", "啼魂"];
var bad = (G.DATA.DISCIPLE_NAMES || []).filter(function (n) {
  return banned.some(function (b) { return n.indexOf(b) >= 0; });
});
ok("姓名池不含任何原著人名", bad.length === 0 && (G.DATA.DISCIPLE_NAMES || []).length >= 8);

console.log('\n==========================================');
console.log('  收徒立派断言：通过 ' + pass + ' / 失败 ' + fail);
console.log('==========================================');
if (fail > 0) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
