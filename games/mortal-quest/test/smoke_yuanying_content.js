'use strict';
/* =========================================================
 * test/smoke_yuanying_content.js —— 元婴内容包回归测试
 *   ① 元婴路遇对手：MAP_ENCOUNTERS 补 19-21，且指向合法元婴怪
 *   ② 新对手：6 个元婴级 MONSTERS（含双阶段 boss 词缀），loot 合法，词缀接入战斗
 *   ③ 元婴专属副本：2 个 HUNTS(reqRealm 19/20)，波次/奖励指向合法 id，门禁正确
 *   ④ 元神出游奇遇扩展：ROAM_SITES +3，roam() 处理 art/trap
 *   ⑤ 路途奇遇：MAP_WONDERS 存在，rollWonder 六结果直接给物正确
 * 运行： node test/smoke_yuanying_content.js
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

let _rand = 0.001;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub, BattleResult: { show: function () {} } };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

// 照 index.html 的顺序加载；剔除 DOM 重的（ui/art/battle_ui/battle_result/scene/storage）
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

function monsterOf(id) {
  let r = null;
  (G.DATA.MONSTERS || []).forEach(function (m) { if (m.id === id) r = m; });
  return r;
}
function itemExists(id) { return !!(G.DATA.ITEMS && G.DATA.ITEMS[id]); }
function lootValid(m) {
  return (m.loot || []).every(function (l) { return itemExists(l.id); });
}

const p = G.State.createNewPlayer('j');
p.realmIndex = 19;

/* ================= ① 元婴路遇对手 ================= */
section('① 元婴路遇对手：MAP_ENCOUNTERS 补 19-21');
const enc = G.DATA.MAP_ENCOUNTERS;
const yuanEnc = (enc.pool || []).filter(function (e) { return e.maxRealm >= 19; });
ok('路遇池含 ≥3 条元婴段(≥19)条目', yuanEnc.length >= 3);
ok('含 19-20 元婴散修', (enc.pool || []).some(function (e) { return e.minRealm === 19 && e.maxRealm === 20 && e.monster === 'wild_sanxiu_yuan'; }));
ok('含 21 归墟守兽', (enc.pool || []).some(function (e) { return e.minRealm === 21 && e.maxRealm === 21 && e.monster === 'wild_guixu_shou'; }));
ok('元婴路遇怪物均合法且 majorRealm=3', yuanEnc.every(function (e) {
  const m = monsterOf(e.monster); return m && m.majorRealm === 3;
}));

/* ================= ② 新对手（含双阶段 boss） ================= */
section('② 新对手：6 个元婴级 MONSTERS + 词缀接入战斗');
const newIds = ['wild_sanxiu_yuan', 'wild_yaowang_qinwei', 'wild_guixu_shou', 'yaowang_chixiao', 'guixu_zhiyan', 'guixu_guard'];
newIds.forEach(function (id) {
  const m = monsterOf(id);
  ok('怪物存在 ' + id, !!m);
  ok('  └ majorRealm=3 ' + id, m && m.majorRealm === 3);
  ok('  └ loot 合法 ' + id, m && lootValid(m));
  ok('  └ hp 达标 ' + id, m && m.hp >= 8000);
});
ok('赤霄妖王 berserk 词缀', monsterOf('yaowang_chixiao').affix === 'berserk' && monsterOf('yaowang_chixiao').hp >= 20000);
ok('归墟之眼 thickShell + 中毒', monsterOf('guixu_zhiyan').affix === 'thickShell' && !!monsterOf('guixu_zhiyan').poisonPlayer);
ok('归墟守兽 thickShell', monsterOf('wild_guixu_shou').affix === 'thickShell');
ok('元婴散修 seizeSoul', monsterOf('wild_sanxiu_yuan').affix === 'seizeSoul');
// 词缀真正接入战斗（Combat.start 读出 affix 并置位）
_rand = 0.001;
p.combat = null;
G.Combat.start('yaowang_chixiao');
ok('Combat.start 后 p.combat.affix=berserk', !!p.combat && p.combat.affix === 'berserk');
ok('Combat.start 置位 berserk 狂暴', !!p.combat && p.combat.berserk === true);
p.combat = null;

/* ================= ③ 元婴专属副本 ================= */
section('③ 元婴专属副本：2 个 HUNTS(reqRealm 19/20)');
const H = G.DATA.HUNTS;
ok('hunt_yaowang_chao 存在', !!H.byId('hunt_yaowang_chao'));
ok('hunt_guixu 存在', !!H.byId('hunt_guixu'));
const h1 = H.byId('hunt_yaowang_chao'), h2 = H.byId('hunt_guixu');
ok('妖王潮都 reqRealm=19', h1.reqRealm === 19);
ok('归墟古渊 reqRealm=20', h2.reqRealm === 20);
ok('妖王潮都 3 波且含 boss 赤霄妖王', h1.waves.length === 3 && h1.waves.indexOf('yaowang_chixiao') >= 0);
ok('归墟古渊 4 波且含 boss 归墟之眼', h2.waves.length === 4 && h2.waves.indexOf('guixu_zhiyan') >= 0);
ok('副本波次怪物均合法', [].concat(h1.waves, h2.waves).every(function (w) { return !!monsterOf(w); }));
ok('副本奖励装备 id 均合法', [].concat(h1.reward.equip, h2.reward.equip).every(itemExists));
// 门禁：结丹(18)不可入，元婴(19/20)可入
p.realmIndex = 18; ok('结丹(18) 不可入妖王潮都', G.Hunt.canEnter('hunt_yaowang_chao').ok === false);
p.realmIndex = 19; ok('元婴(19) 可入妖王潮都', G.Hunt.canEnter('hunt_yaowang_chao').ok === true);
p.realmIndex = 20; ok('元婴(20) 可入归墟古渊', G.Hunt.canEnter('hunt_guixu').ok === true);
p.realmIndex = 19;

/* ================= ④ 元神出游奇遇扩展 ================= */
section('④ 元神出游奇遇扩展：ROAM_SITES +3 + roam 处理 art/trap');
ok('ROAM_SITES 现 5 处（原2 + 新3）', (G.DATA.ROAM_SITES || []).length === 5);
const newSites = ['guzhanchang', 'lingmai', 'xinghai_mijing'];
ok('三处新出游地存在', newSites.every(function (id) {
  return (G.DATA.ROAM_SITES || []).some(function (s) { return s.id === id; });
}));
const validPool = { relic: 1, art: 1, herb: 1, stones: 1, trap: 1, empty: 1, hurt: 1 };
(G.DATA.ROAM_SITES || []).forEach(function (s) {
  ok('  └ ' + s.id + ' pool 合法', (s.pool || []).every(function (x) { return validPool[x.id]; }));
  ok('  └ ' + s.id + ' loot 合法', (s.loot || []).every(function (x) { return itemExists(x.id); }));
});
// roam() 处理 art：授艺 → 修为 +exp*2、心境 +5
const gc = G.DATA.ROAM_SITES.filter(function (s) { return s.id === 'guzhanchang'; })[0];
p.combat = null; p.pendingEvent = null; p.seclusion = null; p.roamCd = 0;
const expBefore = p.currentExp, mindBefore = p.mind || 0;
_rand = 0.30; // 落在 art 区间
G.Yuanying.roam('guzhanchang');
ok('出游 art：修为增加 ' + (gc.exp * 2), p.currentExp >= expBefore + gc.exp * 2 - 1);
ok('出游 art：心境 +5', (p.mind || 0) >= mindBefore + 5 - 1);
// roam() 处理 trap：凶险 → 心境 -6
p.combat = null; p.pendingEvent = null; p.seclusion = null; p.roamCd = 0;
const mindBefore2 = p.mind || 0;
_rand = 0.80; // 落在 trap 区间
G.Yuanying.roam('guzhanchang');
ok('出游 trap：心境 -6', (p.mind || 0) <= mindBefore2 - 6 + 1);
p.roamCd = 0;

/* ================= ⑤ 路途奇遇 ================= */
section('⑤ 路途奇遇：MAP_WONDERS + rollWonder 六结果');
const wd = G.DATA.MAP_WONDERS;
ok('MAP_WONDERS 存在', !!wd);
ok('pool 6 项', wd.pool.length === 6);
ok('relics 3 件且均合法', wd.relics.length === 3 && wd.relics.every(itemExists));
ok('rollWonder 是可调用函数', typeof G.Map.rollWonder === 'function');
function freshWonderState() {
  const pp = G.State.createNewPlayer('j'); pp.realmIndex = 19;
  pp.currentExp = 0; pp.mind = 0; pp.spiritStones = 0; pp.currentHp = 5000;
  pp.inventory = {};
  return pp;
}
// relic
_rand = 0.10; let wp = freshWonderState(); G.State.p = function () { return wp; };
G.Map.rollWonder();
ok('wonder relic：得一件 relics 古宝', wd.relics.some(function (r) { return (wp.inventory[r] || 0) >= 1; }));
ok('wonder relic：修为 +300', wp.currentExp >= 300);
// art
_rand = 0.30; wp = freshWonderState(); G.State.p = function () { return wp; };
G.Map.rollWonder();
ok('wonder art：修为 +500', wp.currentExp >= 500);
ok('wonder art：心境 +5', wp.mind >= 5);
// herb
_rand = 0.50; wp = freshWonderState(); G.State.p = function () { return wp; };
G.Map.rollWonder();
ok('wonder herb：千年灵药 +2', (wp.inventory['herb_qiannian'] || 0) >= 2);
// stones
_rand = 0.70; wp = freshWonderState(); G.State.p = function () { return wp; };
G.Map.rollWonder();
ok('wonder stones：灵石增加', wp.spiritStones > 0);
// trap（不致死；心境不为负，故从正值起验证递减）
_rand = 0.85; wp = freshWonderState(); wp.mind = 10; G.State.p = function () { return wp; };
G.Map.rollWonder();
ok('wonder trap：气血有损但不死(≥1)', wp.currentHp >= 1 && wp.currentHp < 5000);
ok('wonder trap：心境 -5（兜底不为负）', wp.mind <= 5 && wp.mind >= 0);
// empty
_rand = 0.95; wp = freshWonderState(); G.State.p = function () { return wp; };
G.Map.rollWonder();
ok('wonder empty：无产出', wp.currentExp === 0 && wp.spiritStones === 0 && !wp.inventory['herb_qiannian']);

/* ================= 结果 ================= */
console.log('\n========================================');
console.log('  元婴内容包断言：通过 ' + pass + ' / 失败 ' + fail);
if (fail) { console.log('  失败项：'); fails.forEach(function (x) { console.log('   - ' + x); }); }
console.log('========================================');
process.exit(fail ? 1 : 0);
