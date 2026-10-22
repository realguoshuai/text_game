'use strict';
/* =========================================================
 * test/smoke_spirit_insect.js —— 3.5 本命灵虫契约回归
 *   ① 灵虫卵物品 + SPIRIT_INSECT 配置
 *   ② canContract 门禁（元婴 / 有卵 / 未重复契约）
 *   ③ contract 精血立契（绑 tier1、耗卵）
 *   ④ advance 进阶链（1→2 金石；2→3 天火+灵石；不足拒；极巅拒）
 *   ⑤ spiritBite 战斗协同（幼虫削血 / 虫王削血+撕甲，期望 probe 现算）
 *   ⑥ combat.attack 钩子接入（源码 + 有虫/无虫掉血对照）
 * 运行： node test/smoke_spirit_insect.js
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

const p = G.State.createNewPlayer('j');

/* ================= ① 灵虫卵 + 配置 ================= */
section('① 本命灵虫卵物品 + SPIRIT_INSECT 配置');
var egg = G.DATA.ITEMS.lingchong_egg;
ok("灵虫卵物品已定义", !!egg);
ok("灵虫卵 type=insect", egg && egg.type === "insect");
ok("灵虫卵 quality=极品", egg && egg.quality === "极品");
var SI = G.DATA.SPIRIT_INSECT;
ok("SPIRIT_INSECT 配置存在", !!SI);
ok("契约门禁 = 元婴(19)", SI && SI.gate === 19);
ok("三阶 tiers（幼虫/成虫/虫王）", SI && SI.tiers.length === 3 && SI.tiers[2].name === "虫王");
ok("进阶配方：幼→成 金石×5", SI && SI.advance[1] && SI.advance[1].jinshi === 5);
ok("进阶配方：成→王 天火×2+灵石2000", SI && SI.advance[2] && SI.advance[2].tianhuo_crystal === 2 && SI.advance[2].stones === 2000);
ok("Insect 新方法齐全（contract/advance/spiritBite）", G.Insect.contract && G.Insect.advance && G.Insect.spiritBite);

/* ================= ② canContract 门禁 ================= */
section('② canContract 门禁');
p.spiritInsect = null; p.realmIndex = 13; setInv("lingchong_egg", 1);
ok("非元婴(13) 不可契约", G.Insect.canContract().ok === false);
p.realmIndex = 19; setInv("lingchong_egg", 0);
ok("元婴无卵 不可契约", G.Insect.canContract().ok === false);
setInv("lingchong_egg", 1);
ok("元婴有卵 可契约", G.Insect.canContract().ok === true);
p.spiritInsect = { tier: 1 };
ok("已有灵虫 不可重复契约", G.Insect.canContract().ok === false);
p.spiritInsect = null;

/* ================= ③ contract 精血立契 ================= */
section('③ contract 精血立契');
p.realmIndex = 19; setInv("lingchong_egg", 1); p.spiritInsect = null;
G.Insect.contract();
ok("契约后绑定 tier=1", p.spiritInsect && p.spiritInsect.tier === 1);
ok("契约消耗一枚灵虫卵", cnt("lingchong_egg") === 0);

/* ================= ④ advance 进阶链 ================= */
section('④ advance 进阶链（幼→成→王）');
p.spiritInsect = { tier: 1 }; setInv("jinshi", 5);
G.Insect.advance();
ok("幼→成 进阶成功", p.spiritInsect.tier === 2);
ok("进阶耗金石×5", cnt("jinshi") === 0);
p.spiritInsect = { tier: 1 }; setInv("jinshi", 4);
G.Insect.advance();
ok("金石不足 拒绝进阶（tier 不变）", p.spiritInsect.tier === 1);
p.spiritInsect = { tier: 2 }; setInv("tianhuo_crystal", 2); p.spiritStones = 2000;
G.Insect.advance();
ok("成→王 王化成功", p.spiritInsect.tier === 3);
ok("王化耗天火×2", cnt("tianhuo_crystal") === 0);
ok("王化耗灵石 2000", p.spiritStones === 0);
p.spiritInsect = { tier: 2 }; setInv("tianhuo_crystal", 1); p.spiritStones = 99999;
G.Insect.advance();
ok("天火不足 拒绝王化", p.spiritInsect.tier === 2);
p.spiritInsect = { tier: 3 };
G.Insect.advance();
ok("虫王极巅 不再进阶", p.spiritInsect.tier === 3);

/* ================= ⑤ spiritBite 战斗协同 ================= */
section('⑤ spiritBite（幼虫削血 / 虫王削血+撕甲，期望 probe 现算）');
p.realmIndex = 19;
var atk = G.State.getStats().atk;
// 幼虫：只削血，不撕甲
p.spiritInsect = { tier: 1 };
var c1 = { hp: 100000, def_: 200, name: "木桩" };
var b1 = c1.hp;
G.Insect.spiritBite(c1);
ok("幼虫削血 = probe(攻×0.15)", (b1 - c1.hp) === Math.max(1, Math.round(atk * G.Insect.biteOf(1))));
ok("幼虫不撕甲（def 不变）", c1.def_ === 200);
// 虫王：削血 + 撕甲
p.spiritInsect = { tier: 3 };
var c3 = { hp: 100000, def_: 200, name: "木桩" };
var b3 = c3.hp, d3 = c3.def_;
G.Insect.spiritBite(c3);
ok("虫王削血 = probe(攻×0.50)", (b3 - c3.hp) === Math.max(1, Math.round(atk * G.Insect.biteOf(3))));
var wantCut = Math.min(8, Math.max(1, Math.round(d3 * 0.08)));
ok("虫王撕甲 = probe(def×8% 封顶8)", c3.def_ === d3 - wantCut);
// 无虫返回 0
p.spiritInsect = null;
ok("无灵虫时 spiritBite 返回 0", G.Insect.spiritBite({ hp: 500, def_: 100, name: "x" }) === 0);

/* ================= ⑥ combat.attack 钩子接入 ================= */
section('⑥ combat.attack 钩子（源码 + 有虫/无虫掉血对照）');
var combatSrc = fs.readFileSync(path.join(BASE, 'js/combat.js'), 'utf8');
ok("combat.js 已接入 spiritBite 调用", /Insect\.spiritBite/.test(combatSrc));
_rand = 0.5;
p.realmIndex = 19;
// 无虫基线
p.spiritInsect = null;
G.Combat.start("wolf"); p.combat.hp = 1e9; p.combat.maxHp = 1e9; p.currentHp = 1e9; p.maxHp = 1e9;
var hA = p.combat.hp; G.Combat.attack(); var dropNo = p.combat ? (hA - p.combat.hp) : hA;
// 有虫（虫王）
p.spiritInsect = { tier: 3 };
G.Combat.start("wolf"); p.combat.hp = 1e9; p.combat.maxHp = 1e9; p.currentHp = 1e9; p.maxHp = 1e9;
var hB = p.combat.hp; G.Combat.attack(); var dropYes = p.combat ? (hB - p.combat.hp) : hB;
ok("有虫回合敌掉血 > 无虫回合（噬咬真实生效）", dropYes > dropNo && dropNo > 0);
ok("战报出现灵虫噬咬文案", logs.some(function (m) { return /本命灵虫|虫王当先/.test(m); }));

/* ================= ⑦ 产出→消耗闭环 ================= */
section('⑦ 产出→消耗闭环（灵虫卵来源 + 进阶耗材来源）');
// 灵虫卵来自两个元婴 HUNTS 的 materials
var hunts = G.DATA.HUNTS.list.filter(function (h) { return h.id === "hunt_yaowang_chao" || h.id === "hunt_guixu"; });
ok("两个元婴副本均产出灵虫卵", hunts.length === 2 && hunts.every(function (h) {
  return (h.reward.materials || []).some(function (m) { return m.id === "lingchong_egg"; });
}));
// 进阶耗材（金石/天火晶）均有既有产出
ok("金石矿料为既有物品", !!G.DATA.ITEMS.jinshi);
ok("天火晶为既有物品", !!G.DATA.ITEMS.tianhuo_crystal);

console.log('\n==========================================');
console.log('  本命灵虫契约断言：通过 ' + pass + ' / 失败 ' + fail);
console.log('==========================================');
if (fail > 0) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
