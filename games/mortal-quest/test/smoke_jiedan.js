'use strict';
/* =========================================================
 * test/smoke_jiedan.js —— 结丹期(Increment 1) 落地回归测试
 *   ① 境界映射 / 分层免伤：majorRealm(16)=2、realmDefSuppress(16)≈0.12、REALMS[16..18] foundation 已写入
 *   ② JIEDAN 数值表结构完整（bare/pill/zhengpin/fake）
 *   ③ 结丹丹药与拍卖拍品补齐（pill_jiedan 等、jinshi/chong_egg）
 *   ④ 结丹档怪物池存在且 majorRealm=2、路遇池含 22+ 档
 *   ⑤ breakthrough 结丹门槛识别：筑基后期(15) 持凝丹冲击 → 触发心魔劫前置(_btCtx.isJiedan)
 *   ⑥ _rollBreakthrough 成功/失败分支：成功→realmIndex 22 + 气血跳涨；失败→不掉境、连服 streak+1
 *   ⑦ 裸冲结丹失败：九成五身陨（经脉俱断）
 * 运行： node test/smoke_jiedan.js   （或经根 package.json 的 type=module 环境时复制为 .cjs 运行）
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

// 仅加载结丹链路所需模块（不加载 js/scene.js 等需要真实 canvas 的浏览器模块）
const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/content.js',
  'data/world.js', 'data/events.js', 'data/wild_dungeons.js', 'data/skills_foundation.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js', 'js/plot.js', 'js/mortality.js', 'js/breakthrough.js', 'js/cultivation.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

// 裸冲/伪丹死亡分支需确定性的「无救援」结果
G.Core.tryRescue = function () { return false; };

/* ================= ① 境界映射 / 分层免伤 ================= */
section('① 境界映射 / 分层免伤');
ok('majorRealm(15)=1（筑基后期）', G.DATA.majorRealm(15) === 1);
ok('majorRealm(16)=2（结丹初期）', G.DATA.majorRealm(16) === 2);
ok('majorRealm(18)=2（结丹后期）', G.DATA.majorRealm(18) === 2);
ok('结丹初期分层免伤 realmDefSuppress(16)=0.12', G.Combat.realmDefSuppress(16) === 0.12);
let foundOk = true;
for (let i = 16; i <= 18; i++) {
  const r = G.DATA.REALMS[i];
  if (!r || !(r.hp > 0) || !(r.mp > 0) || !(r.defSuppress > 0.85) || r.maxAge !== 500) foundOk = false;
}
ok('REALMS[16..18] foundation 已写入(hp/mp/defSuppress/maxAge=500)', foundOk);
// 元婴篇（2026-10-22）开启后：REALMS[19..21] = 元婴初/中/后期，结丹后期不再是终点
ok('元婴三阶已立（REALMS[19..21] 存在）', !!G.DATA.REALMS[19] && !!G.DATA.REALMS[20] && !!G.DATA.REALMS[21]);
ok('元婴寿元 1000（REALMS[19..21].maxAge）', G.DATA.REALMS[19].maxAge === 1000 && G.DATA.REALMS[21].maxAge === 1000);
var yyOk = true;
for (var ri = 19; ri <= 21; ri++) {
    var r2 = G.DATA.REALMS[ri];
    if (!r2 || !(r2.hp > 0) || !(r2.mp > 0) || !(r2.defSuppress > 0.94) || r2.maxAge !== 1000) yyOk = false;
}
ok('REALMS[19..21] foundation 已写入(hp/mp/defSuppress>0.94/maxAge=1000)', yyOk);
ok('元婴判定常量（YUANING_GATE_INDEX=19 / isYuanying）', G.DATA.YUANING_GATE_INDEX === 19 && G.DATA.isYuanying({ realmIndex: 19 }) === true && G.DATA.isYuanying({ realmIndex: 18 }) === false);
ok('大境界编号：元婴=3', G.DATA.majorRealm(19) === 3 && G.DATA.majorRealm(18) === 2);

/* ================= ② JIEDAN 数值表 ================= */
section('② JIEDAN 数值表结构');
const J = G.DATA.JIEDAN;
ok('JIEDAN_GATE_SOURCE=15', G.DATA.JIEDAN_GATE_SOURCE === 15);
ok('JIEDAN_GATE_INDEX=16 / isJiedan(15)=false / isJiedan(16)=true',
  G.DATA.JIEDAN_GATE_INDEX === 16 && G.DATA.isJiedan({ realmIndex: 15 }) === false && G.DATA.isJiedan({ realmIndex: 16 }) === true);
ok('bare.chance=0.03', J.bare.chance === 0.03);
ok('pill.chance=0.35 & cap=1.0 & perPill=0.20', J.pill.chance === 0.35 && J.pill.cap === 1.0 && J.pill.perPill === 0.20);
ok('zhengpin.chance=0.55', J.zhengpin.chance === 0.55);
ok('fake.chance=0.20 & deathChance=0.30', J.fake.chance === 0.20 && J.fake.deathChance === 0.30);
ok('《三转归元功》结丹补偿 jiedanBonus（0 转→0，3 转→0.75）',
  (function () { const p = G.State.createNewPlayer('j'); const before = G.Cultivation.jiedanBonus(); p.threeTurnCount = 3; const after = G.Cultivation.jiedanBonus(); return before === 0 && Math.abs(after - 0.75) < 1e-9; })());

/* ================= ③ 丹药 / 拍品补齐 ================= */
section('③ 结丹丹药与拍卖拍品补齐');
ok('pill_jiedan（凝丹）已定义', !!G.DATA.ITEMS.pill_jiedan);
ok('pill_jiedan_zhengpin（正品凝丹）已定义', !!G.DATA.ITEMS.pill_jiedan_zhengpin);
ok('fake_jiedan（伪凝丹）已定义', !!G.DATA.ITEMS.fake_jiedan);
ok('凝丹 realmBand 含筑基后期(15)', (G.DATA.ITEMS.pill_jiedan.realmBand || []).indexOf(15) >= 0);
ok('拍卖缺失拍品 jinshi（玄金石）已补齐', !!G.DATA.ITEMS.jinshi);
ok('拍卖缺失拍品 chong_egg（金噬虫卵）已补齐', !!G.DATA.ITEMS.chong_egg);

/* ================= ④ 结丹档怪物池 ================= */
section('④ 结丹档怪物池');
const ids = ['wild_sanxiu_jie', 'wild_yaoxiu', 'wild_jiaolong', 'wild_moxiu_jie'];
let monOk = true, majorOk = true;
ids.forEach(function (id) {
  const m = G.DATA.MONSTERS.filter(function (x) { return x.id === id; })[0];
  if (!m) monOk = false; else if (m.majorRealm !== 2) majorOk = false;
});
ok('结丹档怪物均已定义', monOk);
ok('结丹档怪物 majorRealm=2（与结丹玩家同境，不被×4压制）', majorOk);
const pool = (G.DATA.MAP_ENCOUNTERS && G.DATA.MAP_ENCOUNTERS.pool) || [];
ok('路遇池含 16+ 档结丹怪', pool.some(function (e) { return e.minRealm >= 16; }));
ok('狩猎副本含结丹档（reqRealm=16）', !!G.DATA.HUNTS.list.some(function (h) { return h.reqRealm === 16; }));

/* ================= ⑤ breakthrough 结丹门槛识别 ================= */
section('⑤ breakthrough 结丹门槛识别（筑基后期持凝丹）');
_rand = 0.5;
G.State.createNewPlayer('jie5');
const p5 = G.State.p();
p5.realmIndex = 15; p5.currentExp = 5000;
G.State.addItem('pill_jiedan', 1);
G.Core.breakthrough();
ok('筑基后期持凝丹冲击 → 进入心魔劫前置（_btCtx 存在）', !!p5._btCtx);
ok('前置上下文标记 isJiedan=true', p5._btCtx && p5._btCtx.isJiedan === true);
ok('前置上下文识别凝丹 jiedanPill=pill_jiedan', p5._btCtx && p5._btCtx.jiedanPill === 'pill_jiedan');
ok('前置上下文未误判为筑基(isZhuji=false)', p5._btCtx && p5._btCtx.isZhuji === false);

/* ================= ⑥ _rollBreakthrough 成功/失败 ================= */
section('⑥ _rollBreakthrough 成功 / 失败分支');
// 成功：successChance=1.0 强制成功
G.State.createNewPlayer('jie6');
const p6 = G.State.p();
p6.realmIndex = 15; p6.currentExp = 5000;
G.State.addItem('pill_jiedan', 1);
_rand = 0.0;
G.Core._rollBreakthrough({ isJiedan: true, jiedanPill: 'pill_jiedan', successChance: 1.0, dmgMul: 0.3, deathMul: 0, bareJiedan: false, fakeJiedan: false, pillName: '凝丹' });
ok('结丹成功 → realmIndex 跃至 16', p6.realmIndex === 16);
ok('结丹成功 → 气血上限按 foundation 落位(3200)', p6.maxHp === 3200);
ok('结丹成功 → 当前气血回满', p6.currentHp === p6.maxHp);
ok('结丹成功 → 寿元上限跃至 500（State.maxAge）', G.State.maxAge() === 500);
ok('结丹成功 → 凝丹被消耗', G.State.countItem('pill_jiedan') === 0);

// 失败：successChance=0.0，服丹免死（伤而不亡）
G.State.createNewPlayer('jie6b');
const p6b = G.State.p();
p6b.realmIndex = 15; p6b.currentExp = 5000; p6b.currentHp = 500;
G.State.addItem('pill_jiedan', 1);
_rand = 0.99;
G.Core._rollBreakthrough({ isJiedan: true, jiedanPill: 'pill_jiedan', successChance: 0.0, dmgMul: 0.3, deathMul: 0, bareJiedan: false, fakeJiedan: false, pillName: '凝丹' });
ok('结丹失败 → 不掉境(realmIndex 仍 15)', p6b.realmIndex === 15);
ok('结丹失败 → 受反噬伤(500-120=380)', p6b.currentHp === 380);
ok('结丹失败 → 连服 streak 累加(jiedanStreak=1)', (p6b.jiedanStreak || 0) === 1);
ok('结丹失败 → 本枚凝丹已消耗（每次连服消耗一枚，可凭余丹再冲）', G.State.countItem('pill_jiedan') === 0);

/* ================= ⑦ 裸冲结丹失败 ================= */
section('⑦ 裸冲结丹失败：九成五身陨');
G.State.createNewPlayer('jie7');
const p7 = G.State.p();
p7.realmIndex = 15; p7.currentExp = 5000; p7.currentHp = 500;
_rand = 0.5; // 0.5<=0.0 不成立→失败；0.5<0.95→触发身陨
G.Core._rollBreakthrough({ isJiedan: true, jiedanPill: null, successChance: 0.0, dmgMul: 1, deathMul: 0.95, bareJiedan: true, fakeJiedan: false, pillName: '' });
ok('裸冲结丹失败 → 身陨(isDead)', p7.isDead === true);
ok('裸冲结丹失败 → 死亡原因为经脉俱断', /经脉俱断/.test(p7.deathReason || ''));
ok('裸冲结丹失败 → 境界信息仍存(realmIndex 15)', p7.realmIndex === 15);

/* ================= 汇总 ================= */
console.log('\n' + '─'.repeat(46));
console.log(`  结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('  失败项：'); fails.forEach(f => console.log('   - ' + f)); }
process.exit(fail ? 1 : 0);
