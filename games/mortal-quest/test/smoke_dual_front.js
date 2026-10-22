'use strict';
/* =========================================================
 * test/smoke_dual_front.js —— 4.3 双重战线事件回归
 *   ① 4 条元婴双重战线事件（land/sea front + minRealm19）已入 EVENTS
 *   ② explore() 境界门禁：非元婴绝不触发双线事件
 *   ③ 战线偏好：元婴陆地只收 land、海面只收 sea
 *   ④ repute 新 outcome 类型：提升阵营声望（Faction.standing 落值）
 *   ⑤ 双线事件引用合法（combat 怪物 / loot 物品）
 * 运行： node test/smoke_dual_front.js
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
function itemExists(id) { return !!(G.DATA.ITEMS && G.DATA.ITEMS[id]); }
function monsterExists(id) { return (G.DATA.MONSTERS || []).some(function (m) { return m.id === id; }); }

const p = G.State.createNewPlayer('j');

/* ================= ① 双线事件入池 ================= */
section('① 4 条元婴双重战线事件（front + minRealm19）');
var DUAL_IDS = ["df_bianhai", "df_zongmen_song", "df_xingque_zhao", "df_luanxing_xi"];
DUAL_IDS.forEach(function (id) {
  var ev = (G.DATA.EVENTS || []).find(function (e) { return e.id === id; });
  ok("事件存在 " + id, !!ev);
  if (ev) { ok("  " + id + " minRealm=19", ev.minRealm === 19); ok("  " + id + " 有 front 标签", ev.front === "land" || ev.front === "sea"); }
});
var lands = DUAL_IDS.filter(function (id) { var e = (G.DATA.EVENTS || []).find(function (x) { return x.id === id; }); return e && e.front === "land"; });
var seas = DUAL_IDS.filter(function (id) { var e = (G.DATA.EVENTS || []).find(function (x) { return x.id === id; }); return e && e.front === "sea"; });
ok("陆线 2 条（云国）", lands.length === 2);
ok("海线 2 条（碎星海）", seas.length === 2);

/* ================= 隔离：stub passTime + 可控 atStarSea + 收窄事件池 ================= */
var realEvents = G.DATA.EVENTS;
G.Core.passTime = function () {};                 // 只测事件筛选/抽取，不推进时间
var _atSea = false;
G.Cave2.atStarSea = function () { return _atSea; };
G.DATA.EVENTS = [
  { id: "dummy_fill", weight: 5, text: "占位事件", choices: null, outcomes: [{ chance: 1, type: "nothing", text: "占位" }] },
  { id: "df_t_land", front: "land", minRealm: 19, weight: 5, text: "陆线TEST", choices: [{ text: "x", outcomes: [{ chance: 1, type: "nothing", text: "x" }] }] },
  { id: "df_t_sea", front: "sea", minRealm: 19, weight: 5, text: "海线TEST", choices: [{ text: "x", outcomes: [{ chance: 1, type: "nothing", text: "x" }] }] },
];
function doExplore() { p.pendingEvent = null; logs.length = 0; G.Core.explore(); return p.pendingEvent ? p.pendingEvent.eventId : null; }

/* ================= ② 境界门禁 ================= */
section('② explore() 境界门禁');
p.realmIndex = 13; _atSea = false; _rand = 0.9;
var e13 = doExplore();
ok("非元婴(13) 绝不触发双线事件", e13 !== "df_t_land" && e13 !== "df_t_sea");

/* ================= ③ 战线偏好 ================= */
section('③ 战线偏好（元婴）');
p.realmIndex = 19; _atSea = false; _rand = 0.9;   // filtered=[dummy, df_t_land]，roll 落到第 2 个
var eLand = doExplore();
ok("元婴·陆地 收陆线事件", eLand === "df_t_land");
ok("元婴·陆地 不收海线事件", eLand !== "df_t_sea");
p.realmIndex = 19; _atSea = true; _rand = 0.9;    // filtered=[dummy, df_t_sea]
var eSea = doExplore();
ok("元婴·海面 收海线事件", eSea === "df_t_sea");
ok("元婴·海面 不收陆线事件", eSea !== "df_t_land");

/* ================= ④ repute 新类型 ================= */
section('④ repute outcome 类型（提升阵营声望）');
G.DATA.EVENTS = realEvents;                        // 还原真实池
p.realmIndex = 19;
p.factionStanding = { xingque: 0 };
G.Core.resolveEventOutcomes([{ chance: 1, type: "repute", fid: "xingque", amount: 5, text: "（测试）星阙声望 +5" }]);
ok("repute 令星阙声望 0 → 5", G.Faction.standing(p, "xingque") === 5);

/* ================= ⑤ 引用合法 ================= */
section('⑤ 双线事件引用合法（怪物/物品）');
DUAL_IDS.forEach(function (id) {
  var ev = (G.DATA.EVENTS || []).find(function (e) { return e.id === id; });
  if (!ev) return;
  (ev.choices || []).forEach(function (c) {
    (c.outcomes || []).forEach(function (o) {
      if (o.type === "combat") ok(id + " combat 怪物合法 " + o.monster, monsterExists(o.monster));
      if (o.type === "loot") (o.table || []).forEach(function (t) { ok(id + " loot 物品合法 " + t.id, itemExists(t.id)); });
    });
  });
});

console.log('\n==========================================');
console.log('  双重战线事件断言：通过 ' + pass + ' / 失败 ' + fail);
console.log('==========================================');
if (fail > 0) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
