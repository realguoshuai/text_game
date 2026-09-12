/* =========================================================
 * test/smoke_mid_game.js —— 练气中后期四大模块全链路无头测试
 *   主线链路：解阴毒 → 拜入青梧谷 → 百草园种药 → 血色禁地撤出 → 四丹必入筑基
 *   单元点：乌金盾护盾 / 子母刃死角暴击 / 玄傀护主软着陆 / 神识负载槽(双法器)
 *           毁尸灭迹与因果追查 / 天眼术斗法探查 / 御风诀行程折扣
 * 跑法：cd ImmortalGame && node test/smoke_mid_game.js
 * ========================================================= */

var fs = require("fs"), path = require("path"), vm = require("vm");
var BASE = path.resolve(".");

// ---- UI 桩：只吞不渲染（日志留存供断言） ----
var logs = [];
var uiStub = {
    started: true, tab: "map",
    log: function (m) { logs.push(String(m)); }, updateUI: function () {}, autoSave: function () {},
    setDead: function () {}, initLogs: function () {},
    renderSect: function () {}, renderBlack: function () {}, renderTrial: function () {},
    renderTrack: function () {}, renderCombat: function () {}, renderMap: function () {},
    renderJiayuan: function () {}, renderTainan: function () {}, renderFzone: function () {},
    toggleTalismans: function () {}, switchTab: function (n) { this.tab = n; },
    renderOrigin: function () {}, doLoad: function () {},
};
var _rand = 0.5;
function setRand(v) { _rand = v; }

var sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

// 加载顺序同 index.html（含 garden.js / forbidden_zone.js）
["data/realms.js", "data/items.js", "data/skills.js", "data/events.js", "data/world.js", "data/worldmap.js", "data/content.js",
 "js/state.js", "js/storage.js", "js/combat.js", "js/core.js", "js/moEvent.js", "js/market.js",
 "js/map.js", "js/jiayuan.js", "js/tainan.js", "js/sect.js", "js/garden.js", "js/blackmarket.js", "js/trial.js", "js/forbidden_zone.js"
].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
});

var G = sandbox.GAME;
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ FAIL: " + name); } }
function reset() { setRand(0.5); G.State.createNewPlayer("wanderer"); return G.State.p(); }
// 筑基关（realmIndex >= ZHUJI_GATE_INDEX）后加了「心魔劫」：突破会先弹待决事件，
// 须定心抉择后才由 core._resumeBreakthrough 正式冲击壁障。测试要走完这一步。
function breach() {
  G.Core.breakthrough();
  var pp = G.State.p();
  if (pp.pendingEvent && pp.pendingEvent.eventId === "heart_demon") G.Core.chooseEventOption(0);
}
function add(id, n) { G.State.addItem(id, n || 1); }

/* ============ ① 主线前段：解阴毒 → 拜入青梧谷 ============ */
console.log("\n【1】解阴毒 → 拜入青梧谷");
p = reset();
p.yindu = { months: 24 };
add("nuan_yang_bao_yu");
G.Core.takePill("nuan_yang_bao_yu");
ok("暖阳宝玉驱尽体内阴毒（24 月倒计时清除）", p.yindu === null);

ok("不在苍南谷无从拜山", G.Tainan.joinByToken() === false);
p.location = "tainan_gu";
ok("无升仙令不得保送", G.Tainan.joinByToken() === false);
add("shengxian_ling");
setRand(0.5);
ok("凭升仙令保送拜入青梧谷", G.Tainan.joinByToken() === true);
ok("山门已列青梧谷门墙", p.sectId === "huangfenggu");
ok("拜山耗去升仙令", G.State.countItem("shengxian_ling") === 0);

/* ============ ② 百草园：任职/明田/暗田/泄露值/恶臭草 ============ */
console.log("\n【2】百草园：借鸡生蛋");
ok("未谋职前并非管事", p.garden === null);
ok("贡献不足谋不了管事", (function () { p.sectContrib = 0; G.Sect.takeGarden("contrib"); return p.garden === null; })());
p.sectContrib = 60;
G.Sect.takeGarden("contrib");
ok("行贿执事长老（贡献 60）谋得管事之位", !!p.garden && p.sectContrib === 0);
ok("管事年例：半年内须上交 10 株", p.garden.due === 6);

p.liquid = 10;
setRand(0.5);   // 0.5 ≥ 灵泉双收概率 0.20 → 不触发双收
G.Garden.catalyze("herb_bainian", false);
ok("灵眼之泉暗田催熟：得药 1 株", G.State.countItem("herb_bainian") === 1);
ok("管事暗田催熟泄露值 0%（灵泉掩蔽）", p.leak === 0);

add("herb_bainian", 10);
G.Garden.submit();
ok("明田提前上缴 10 株，贡献 +10、管事顺延", p.sectContrib === 10 && p.garden.due === 6 && G.State.countItem("herb_bainian") === 1);

// 无管事之职：暗田催熟累积泄露值（达 leakWarn 80 后置位，下月 tick 神识掠园）
p.garden = null;
p.liquid = 30;
p.spiritStones = 200;
setRand(0.5);
p.leak = 0;
for (var i = 0; i < 5; i++) G.Garden.catalyze("herb_bainian", false);
ok("无职暗田催熟 5 次泄露值累计 50（10×5）", p.leak === 50);
var stonesBeforeCatch = p.spiritStones;
for (i = 0; i < 3; i++) G.Garden.catalyze("herb_bainian", false);   // 第 8 次达 80 → 触发掠园
ok("泄露值达预警线触发神识掠园：查获后回落至 40", p.leak === 40);
ok("查获罚没：灵石遭罚（低于原值）", p.spiritStones < stonesBeforeCatch);

// 恶臭草掩盖
p.leak = 0;
add("herb_ecao");
setRand(0.5);
G.Garden.catalyze("herb_bainian", true);
ok("恶臭草掩盖：泄露值不增", p.leak === 0 && G.State.countItem("herb_ecao") === 0);

/* ============ ③ 血色禁地：三处药田夺药 ============ */
console.log("\n【3】血色禁地：药田夺药与撤离");
p = reset();
p.realmIndex = 9;   // 练气十层
ok("练气十层方可入禁", G.FZone.canEnter() === true);
G.FZone.start();
var f = p.fzone;
ok("入禁后开启禁地状态（尚无灵药、2 次调息）", !!f && !f.herbs.herb_tianling && f.restLeft === 2);
ok("禁地内不可重复入禁", G.FZone.canEnter() === false);

// 天灵药田：挑战守护兽 → 夺药
setRand(0.5);
G.FZone.challenge("herb_tianling");
ok("挑战药田触发守护兽之战", !!p.combat && p.combat.def.id === "fz_beast_tian");
ok("战斗归属标记为 fzone/herb", p.combat.ctx && p.combat.ctx.type === "fzone" && p.combat.ctx.kind === "herb");
p.combat.hp = 1;
G.Combat.attack();
ok("守护兽伏诛，夺得天灵草", !p.combat && f.herbs.herb_tianling === 1);

// 传送符随时撤离：连人带货
var invTi = G.State.countItem("herb_tianling");
add("talisman_chuansong");
G.FZone.teleport();
ok("传送符撤离：禁地状态清空", p.fzone === null);
ok("撤离后私藏灵药入袋（背包 +1）", G.State.countItem("herb_tianling") === invTi + 1 && G.State.countItem("talisman_chuansong") === 0);

// 出口法阵结算：三药俱全 → 正品筑基丹 + 贡献
p = reset(); p.realmIndex = 9;
G.State.setCd("fzone", 0);
G.FZone.start();
f = p.fzone;
f.herbs = { herb_tianling: 1, herb_yumo: 1, herb_zihou: 1 };
var contribBefore = p.sectContrib;
G.FZone.finish("submit");
ok("三药俱全换得正品筑基丹", G.State.countItem("pill_zhengpin") === 1);
ok("全数上交得大量贡献（+100）", p.sectContrib === contribBefore + 100);
ok("结算后禁地状态清空", p.fzone === null);

// 寻隙撤离（无传送符保底）
G.State.setCd("fzone", 0);
G.FZone.start();
G.FZone.abandon();
ok("寻隙撤离放弃私藏", p.fzone === null);

/* ============ ④ 战斗增量：乌金盾/子母刃/软着陆/双法器 ============ */
console.log("\n【4】战斗增量：法器与随从");
p = reset();
add("artifact_wujin");
G.Core.equipArtifact("artifact_wujin");
G.Combat.start("wolf");
ok("乌金盾开战张起 30 点罡气护体", p.combat.shield === 30);
G.Combat.end();

// 子母刃：死角暴击 +0.20（基础暴击 5%，神识差 0 时）
p.darkWeapon = "zimu_ren";
setRand(0.10);
var r1 = G.Combat.calcDamage(50, 0, 10, 10);
var r2 = G.Combat.calcDamage(50, 0, 10, 10, 0.20);
ok("无子母刃加成时 0.10 不暴击（基础 5%）", r1.crit === false);
ok("子母刃 +20% 后同点数必暴击", r2.crit === true);

// 玄傀护主软着陆（气血归零方为致命伤，checkDeath 才会触发护主）
p.companion = { id: "quhun", name: "铁奴·玄傀", hp: 100, maxHp: 200, atk: 24 };
p.currentHp = 0;
G.Core.checkDeath();
ok("玄傀护主：致命伤不判死亡", p.isDead === false);
ok("玄傀魂体溃散（可再唤）", p.companion.hp === 0);
ok("玩家重伤保命（气血残一成）", p.currentHp === Math.ceil(p.maxHp * 0.1));

// 神识负载槽：控物术 + 神识达标方可双持
p2 = reset();
add("artifact_qingyun");
G.Core.equipArtifact("artifact_qingyun");
add("artifact_wujin");
G.Core.equipArtifact2("artifact_wujin");
ok("未习控物术不能分驭第二法器", p2.artifact2 === null);
p2.changchunLevel = 6;
p2.spiritBonus = 10;   // 神识推过 12 门槛
add("skill_kongwu");
G.Core.takePill("skill_kongwu");
G.Core.equipArtifact2("artifact_wujin");
ok("习控物术且神识达标 → 乌金盾悬空副持", p2.artifact2 === "artifact_wujin" && p2.artifact2Durability === 16);

// 毁尸灭迹：修士因果
p3 = reset();
G.Combat.start("robber");
p3.combat.hp = 1;
setRand(0.5);
G.Combat.attack();
ok("劫匪跪地求饶，弹出杀放抉择", !!p3.pendingMercy);
G.Core.chooseMercy(0);
ok("斩杀修士未毁尸 → 因果追查缠身 12 月", !!p3.causal && p3.causal.months === 12);

p4 = reset();
add("talisman_huoqiu");
G.Combat.start("robber");
p4.combat.hp = 1;
setRand(0.5);
G.Combat.attack();
G.Core.chooseMercy(2);
ok("火球符毁尸灭迹 → 无因果缠身", p4.causal === null && G.State.countItem("talisman_huoqiu") === 0);

/* ============ ⑤ 四丹连服入筑基（25% → 50% → 75% → 100%） ============ */
console.log("\n【5】练气大圆满：连服筑基丹破境");
p = reset();
p.realmIndex = 12;   // 练气十三层大圆满
add("pill_zhuji", 4);
setRand(0.86);   // 0.86 高于前三枚的成功率；第四枚拉满 100% 必成
// 每次冲击前补满修为：突破失败扣 35% 修为，不补则后续冲击会被门槛（修为尚不圆满）直接挡下。
// 另：筑基关会先弹「心魔劫」，须定心抉择后才正式冲击——见 breach()。
function chong() { G.State.p().currentExp = G.DATA.REALMS[12].needExp; breach(); }
chong();
ok("首枚 25% 失败不致死（丹药护心免死）", p.isDead === false && p.zhujiStreak === 1);
chong();
ok("第二枚累积至 50%", p.zhujiStreak === 2 && p.realmIndex === 12);
chong();
ok("第三枚累积至 75%", p.zhujiStreak === 3 && p.realmIndex === 12);
chong();
ok("第四枚拉满 100%：破境成功踏入筑基", p.realmIndex === 13 && p.isDead === false);
ok("成功后连服计数清零", p.zhujiStreak === 0);

// 裸冲：伪灵根 2%，失败八成经脉俱断——玄傀护主可软着陆一次
p5 = reset();
p5.realmIndex = 12;
p5.currentExp = G.DATA.REALMS[12].needExp;
setRand(0.5);   // 0.5>2% 失败；0.5<80% 经脉俱断
breach();
ok("无丹裸冲失败且无玄傀 → 当场道消身陨", p5.isDead === true);
p6 = reset();
p6.realmIndex = 12;
p6.currentExp = G.DATA.REALMS[12].needExp;
p6.companion = { id: "quhun", name: "铁奴·玄傀", hp: 100, maxHp: 200, atk: 24 };
setRand(0.5);
breach();
ok("裸冲失败有玄傀护主 → 软着陆保命", p6.isDead === false && p6.companion.hp === 0);

/* ============ ⑥ 天眼术探雾 + 御风诀行程折扣 ============ */
console.log("\n【6】仙法实用面");
p = reset();
p.realmIndex = 9;
p.changchunLevel = 7;
add("skill_tianyan");
G.Core.takePill("skill_tianyan");
ok("习得天眼术（术法在册）", !!(p.spells && p.spells.tianyan_shu));
// 天眼术现为斗法「主动探查」：开战即看破敌方气血底细与随身宝物成色。
// 血色禁地已改「三处药田」模型，旧「探雾 scry / seen / stepsLeft」机制整体移除，
// 故此处改验斗法探查日志。
logs.length = 0;
G.Combat.start("wolf");
ok("天眼术开战看破敌方底细", logs.join("\n").indexOf("【天眼术】") >= 0);
ok("看破内容含气血与攻防数值", /气血约 \d+、攻 \d+ 防 \d+/.test(logs.join("\n")));
G.Combat.end();

p = reset();
p.location = "shenshou_gu";
p.realmIndex = 2;   // 出山门槛：练气三层
p.silver = 500;
var rQn = null;
G.Map.routes().forEach(function (r) { if (r.targetId === "qingniu_zhen") rQn = r; });
p.changchunLevel = 5;
add("skill_yufeng");
G.Core.takePill("skill_yufeng");
ok("习得御风诀（术法在册）", !!(p.spells && p.spells.yufeng_shu));
var m0 = p.totalMonths;   // 服药耗时 1 月已计，此后再谈行程
G.Map.travel(rQn.id);
ok("御风诀赶路省 1 月（2 月行程 1 月抵达）", p.totalMonths - m0 === 1 && p.location === "qingniu_zhen");

console.log("\n结果: " + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
