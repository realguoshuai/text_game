'use strict';
/* =========================================================
 * test/smoke_fenghun.js —— 4.2 封魂玉（夺舍线反向契封）回归
 *   ① 封魂玉物品 + SEIZE.seal 配置
 *   ② canSeal 门禁（元婴 + 持玉）
 *   ③ seize_attempt 事件含「契封」选项，eventFor 按门禁裁剪
 *   ④ resolve 契封成功（入元神 / 神识+2 / 心境+5 / 侵染-1 / 耗玉）
 *   ⑤ resolve 契封失败（玉碎耗掉 / 不入元神 / 心境兜底不为负）
 *   ⑥ soulAssist 协战（soulPer×数；无则 0）
 *   ⑦ combat.attack 协战钩子（源码 + 有/无元神掉血对照）
 *   ⑧ 产出→消耗（封魂玉来源）
 * 运行： node test/smoke_fenghun.js
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
function setInv(id, n) { var p = G.State.p(); p.inventory = p.inventory || {}; p.inventory[id] = n; }
function cnt(id) { return G.State.countItem(id); }
function monsterOf(id) { var r = null; (G.DATA.MONSTERS || []).forEach(function (m) { if (m.id === id) r = m; }); return r; }

const p = G.State.createNewPlayer('j');

/* ================= ① 封魂玉物品 + 配置 ================= */
section('① 封魂玉物品 + SEIZE.seal 配置');
var jade = G.DATA.ITEMS.feng_hun_yu;
ok("封魂玉物品已定义", !!jade);
ok("封魂玉 quality=极品", jade && jade.quality === "极品");
var seal = G.DATA.SEIZE.seal;
ok("SEIZE.seal 配置存在", !!seal);
ok("契封门禁 = 元婴(19)", seal && seal.minRealm === 19);
ok("契封成功率 0.6 / 神识+2 / 协战12", seal && seal.successP === 0.6 && seal.spiritPer === 2 && seal.soulPer === 12);
ok("Seize 新方法（canSeal/soulCount/soulAssist）", G.Seize.canSeal && G.Seize.soulCount && G.Seize.soulAssist);

/* ================= ② canSeal 门禁 ================= */
section('② canSeal 门禁');
p.realmIndex = 19; setInv("feng_hun_yu", 1);
ok("元婴 + 持玉 → 可契封", G.Seize.canSeal(p) === true);
p.realmIndex = 19; setInv("feng_hun_yu", 0);
ok("元婴 + 无玉 → 不可", G.Seize.canSeal(p) === false);
p.realmIndex = 13; setInv("feng_hun_yu", 1);
ok("非元婴 → 不可", G.Seize.canSeal(p) === false);

/* ================= ③ 事件含契封选项 + 动态裁剪 ================= */
section('③ seize_attempt 事件「契封」选项 + eventFor 裁剪');
p.realmIndex = 19; setInv("feng_hun_yu", 1);
var evHas = G.Core.findEvent("seize_attempt");
ok("元婴+持玉：事件含契封选项", (evHas.choices || []).some(function (c) { return c.outcomes && c.outcomes[0] && c.outcomes[0].mode === "seal"; }));
p.realmIndex = 13;
var evNo = G.Core.findEvent("seize_attempt");
ok("非元婴：事件不含契封选项", !(evNo.choices || []).some(function (c) { return c.outcomes && c.outcomes[0] && c.outcomes[0].mode === "seal"; }));

/* ================= ④ 契封成功 ================= */
section('④ resolve 契封成功');
p.realmIndex = 19; setInv("feng_hun_yu", 1); p.sealedSouls = []; p.spiritBonus = 0; p.mind = 20; p.xinmoLevel = 2;
_rand = 0.5;
var r = G.Seize.resolve({ mode: "seal" });
ok("契封成功：入一道元神", (p.sealedSouls || []).length === 1);
ok("契封成功：神识上限 +2", p.spiritBonus === 2);
ok("契封成功：心境 +5", p.mind === 25);
ok("契封成功：侵染退一重(2→1)", p.xinmoLevel === 1);
ok("契封成功：消耗封魂玉", cnt("feng_hun_yu") === 0);
ok("契封返回 done（不接管战斗）", r === "done");

/* ================= ⑤ 契封失败 ================= */
section('⑤ resolve 契封失败（玉碎）');
p.realmIndex = 19; setInv("feng_hun_yu", 1); p.sealedSouls = []; p.mind = 2;
_rand = 0.9;
G.Seize.resolve({ mode: "seal" });
ok("契封失败：不入元神", (p.sealedSouls || []).length === 0);
ok("契封失败：封魂玉仍碎（耗掉）", cnt("feng_hun_yu") === 0);
ok("契封失败：心境兜底不为负(2-3→0)", p.mind === 0);

/* ================= ⑥ soulAssist 协战 ================= */
section('⑥ soulAssist 协战（soulPer×数）');
p.sealedSouls = [{ tier: 1 }, { tier: 1 }];
var c = { hp: 10000, def_: 100, name: "木桩" };
var b = c.hp;
var dmg = G.Seize.soulAssist(c);
var want = G.DATA.SEIZE.seal.soulPer * 2;
ok("协战伤害 = soulPer×2（probe）", dmg === want && (b - c.hp) === want);
p.sealedSouls = [];
ok("无元神时协战返回 0", G.Seize.soulAssist({ hp: 100, def_: 10, name: "x" }) === 0);

/* ================= ⑦ combat.attack 协战钩子 ================= */
section('⑦ combat.attack 协战钩子（源码 + 有/无元神掉血对照）');
var src = fs.readFileSync(path.join(BASE, 'js/combat.js'), 'utf8');
ok("combat.js 已接入 soulAssist", /Seize\.soulAssist/.test(src));
p.realmIndex = 19;
p.spiritInsect = null; p.sealedSouls = [];
G.Combat.start("wolf"); p.combat.hp = 1e9; p.combat.maxHp = 1e9; p.currentHp = 1e9; p.maxHp = 1e9;
_rand = 0.5;
var hA = p.combat.hp; G.Combat.attack(); var dropNo = p.combat ? (hA - p.combat.hp) : hA;
p.sealedSouls = [{ tier: 1 }, { tier: 1 }, { tier: 1 }];
G.Combat.start("wolf"); p.combat.hp = 1e9; p.combat.maxHp = 1e9; p.currentHp = 1e9; p.maxHp = 1e9;
var hB = p.combat.hp; G.Combat.attack(); var dropYes = p.combat ? (hB - p.combat.hp) : hB;
ok("有契封元神时敌掉血 > 无（协战真实生效）", dropYes > dropNo && dropNo > 0);
ok("战报出现契封协战文案", logs.some(function (m) { return /契封元神齐出/.test(m); }));

/* ================= ⑧ 产出→消耗闭环 ================= */
section('⑧ 产出→消耗闭环（封魂玉来源）');
var gx = G.DATA.HUNTS.list.find(function (h) { return h.id === "hunt_guixu"; });
ok("归墟古渊通关产出封魂玉", gx && (gx.reward.materials || []).some(function (m) { return m.id === "feng_hun_yu"; }));
var cx = monsterOf("yaowang_chixiao");
ok("赤霄妖王掉落封魂玉", cx && (cx.loot || []).some(function (l) { return l.id === "feng_hun_yu"; }));

console.log('\n==========================================');
console.log('  封魂玉契封断言：通过 ' + pass + ' / 失败 ' + fail);
console.log('==========================================');
if (fail > 0) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
