'use strict';
/* =========================================================
 * test/smoke_chapters.js —— 章节为皮(Increment 2) 回归测试
 *   ① MAP.chapters 配置：4 章（练气/筑基/结丹/碎星海），star.minRealm=22
 *   ② chapterOf：按境界/地点分章（碎星海恒属星海篇）
 *   ③ nodeChapter：筑基陆地节点在结丹后升入结丹篇
 *   ④ currentChapter / chapters()：当前章与 reached 阈值
 *   ⑤ atlasByChapter：动态分章 + 低阶坊市退役标记（retired）
 *   ⑥ marketRetired：离开练气篇（筑基及以上）后苍南谷坊市退役
 * 运行： node test/smoke_chapters.js
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

let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

// 加载章节链路所需模块（不含 js/scene.js 等需要真实 canvas 的浏览器模块）
const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/content.js',
  'data/world.js', 'data/events.js', 'data/wild_dungeons.js', 'data/skills_foundation.js',
  'data/worldmap.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/cultivation.js', 'js/map.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

/* ================= ① MAP.chapters 配置 ================= */
section('① MAP.chapters 配置');
const CH = G.DATA.MAP.chapters || [];
ok('共 4 章', CH.length === 4);
const byId = {};
CH.forEach(function (c) { byId[c.id] = c; });
ok('含 qi/zhuji/jiedan/star 四章', !!byId.qi && !!byId.zhuji && !!byId.jiedan && !!byId.star);
ok('章节名称正确', byId.qi.name === '练气篇' && byId.zhuji.name === '筑基篇' && byId.jiedan.name === '结丹篇' && byId.star.name === '碎星海篇');
ok('碎星海章 minRealm=22（结丹后才触及）', byId.star.minRealm === 22);
// 节点 chapter 字段已落位
const nta = G.DATA.MAP.nodes.filter(function (n) { return n.id === 'tainan_gu'; })[0];
const nhf = G.DATA.MAP.nodes.filter(function (n) { return n.id === 'huangfeng_gu'; })[0];
const nlu = G.DATA.MAP.nodes.filter(function (n) { return n.id === 'luanxing_hai'; })[0];
ok('苍南谷 chapter=qi', nta && nta.chapter === 'qi');
ok('青梧谷 chapter=zhuji', nhf && nhf.chapter === 'zhuji');
ok('碎星海 chapter=star', nlu && nlu.chapter === 'star');

/* ================= ② chapterOf ================= */
section('② chapterOf 分章');
ok('练气期 → qi', G.Map.chapterOf(5, 'tainan_gu') === 'qi');
ok('筑基期陆地 → zhuji', G.Map.chapterOf(15, 'huangfeng_gu') === 'zhuji');
ok('结丹期陆地 → jiedan', G.Map.chapterOf(22, 'huangfeng_gu') === 'jiedan');
ok('碎星海恒属 star（无论境界）', G.Map.chapterOf(25, 'luanxing_hai') === 'star' && G.Map.chapterOf(21, 'luanxing_hai') === 'star');

/* ================= ③ nodeChapter 动态归属 ================= */
section('③ nodeChapter 动态归属（结丹后筑基陆地升入结丹篇）');
const zhujiNode = { id: 'huangfeng_gu', chapter: 'zhuji' };
ok('筑基期青梧谷 → zhuji', G.Map.nodeChapter(zhujiNode, 15) === 'zhuji');
ok('结丹期青梧谷 → jiedan（动态升篇）', G.Map.nodeChapter(zhujiNode, 22) === 'jiedan');
ok('碎星海 → star', G.Map.nodeChapter({ id: 'luanxing_hai', chapter: 'star' }, 22) === 'star');

/* ================= ④ currentChapter / chapters() ================= */
section('④ currentChapter / chapters()');
function setP(ri, loc) { G.State.createNewPlayer('ch'); const p = G.State.p(); p.realmIndex = ri; p.location = loc; return p; }
setP(5, 'tainan_gu');
ok('练气期在苍南谷 → currentChapter=qi', G.Map.currentChapter() === 'qi');
setP(15, 'huangfeng_gu');
ok('筑基期在青梧谷 → currentChapter=zhuji', G.Map.currentChapter() === 'zhuji');
setP(22, 'huangfeng_gu');
ok('结丹期在青梧谷 → currentChapter=jiedan', G.Map.currentChapter() === 'jiedan');
setP(25, 'luanxing_hai');
ok('结丹后于碎星海 → currentChapter=star', G.Map.currentChapter() === 'star');

const chapList = G.Map.chapters();
ok('chapters() 返回 4 项且含 current 标记', chapList.length === 4 && chapList.some(function (c) { return c.current; }));
setP(10, 'qingniu_zhen');
const cl2 = G.Map.chapters();
ok('练气期 star 章 reached=false', cl2.filter(function (c) { return c.id === 'star'; })[0].reached === false);
ok('练气期 qi 章 reached=true / zhuji reached=false', cl2.filter(function (c) { return c.id === 'qi'; })[0].reached === true && cl2.filter(function (c) { return c.id === 'zhuji'; })[0].reached === false);
setP(23, 'huangfeng_gu');
const cl3 = G.Map.chapters();
ok('结丹期 star 章 reached=true', cl3.filter(function (c) { return c.id === 'star'; })[0].reached === true);

/* ================= ⑤ atlasByChapter + retired 标记 ================= */
section('⑤ atlasByChapter 动态分章 + 低阶坊市退役标记');
setP(5, 'tainan_gu');
let at = G.Map.atlasByChapter();
ok('练气期：qi 章含 4 节点（幽篁谷/青牛/景阳/苍南）', at.qi.nodes.length === 4);
ok('练气期：zhuji 章含青梧谷/云京', at.zhuji && at.zhuji.nodes.length === 2);
ok('练气期：star 章含碎星海', at.star && at.star.nodes.length === 1);
ok('练气期：市集未退役（tainan retired=false）', at.qi.nodes.filter(function (n) { return n.id === 'tainan_gu'; })[0].retired === false);

setP(22, 'huangfeng_gu');
at = G.Map.atlasByChapter();
ok('结丹期：jiedan 章含青梧谷/云京（动态升篇）', at.jiedan && at.jiedan.nodes.length === 2);
ok('结丹期：qi 章仍含练气 4 地（旧地）', at.qi && at.qi.nodes.length === 4);
const tainanInQi = at.qi.nodes.filter(function (n) { return n.id === 'tainan_gu'; })[0];
ok('结丹期：苍南谷标记 retired=true（低阶坊市退役）', !!tainanInQi && tainanInQi.retired === true);
ok('结丹期：currentChapter=jiedan 与 atlas 当前章一致', G.Map.currentChapter() === 'jiedan');

/* ================= ⑥ marketRetired ================= */
section('⑥ marketRetired 低阶坊市退役');
setP(10, 'tainan_gu');
ok('练气期 marketRetired=false（坊市仍活跃）', G.Map.marketRetired() === false);
setP(13, 'tainan_gu');
ok('筑基期 marketRetired=true（即便身处苍南谷，坊市已散）', G.Map.marketRetired() === true);
setP(25, 'luanxing_hai');
ok('结丹期 marketRetired=true', G.Map.marketRetired() === true);

/* ================= 汇总 ================= */
console.log('\n' + '─'.repeat(46));
console.log(`  结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('  失败项：'); fails.forEach(f => console.log('   - ' + f)); }
process.exit(fail ? 1 : 0);
