/* =========================================================
 * test/smoke5.js —— 【下山了凡尘】三模块无头回归测试
 *   ① 大地图节点流转（幽篁谷/青牛镇/景阳城/苍南山）
 *   ② 景阳城玄机世家主线四阶段（解毒 + 升仙令）
 *   ③ 苍南小会（散修坊市 + 升仙大会擂台 + 保送拜山）
 * 跑法：cd ImmortalGame && node test/smoke5.js
 * ========================================================= */

var fs = require("fs"), path = require("path"), vm = require("vm");
var BASE = path.resolve(".");

// ---- UI 桩：只吞不渲染，模拟 updateUI/log/switchTab ----
var uiStub = {
    started: true, tab: "map",
    log: function () {}, updateUI: function () {}, autoSave: function () {},
    setDead: function () {}, initLogs: function () {},
    renderSect: function () {}, renderBlack: function () {}, renderTrial: function () {},
    renderTrack: function () {}, renderCombat: function () {}, renderMap: function () {},
    renderJiayuan: function () {}, renderTainan: function () {},
    toggleTalismans: function () {}, switchTab: function (n) { this.tab = n; },
};
// 可切换的随机源：引擎内部一律走 sandbox.Math.random
var _rand = 0.5;
function setRand(v) { _rand = v; }

var sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

// 加载顺序同 index.html
["data/realms.js", "data/items.js", "data/skills.js", "data/events.js", "data/world.js", "data/worldmap.js", "data/content.js",
 "js/state.js", "js/storage.js", "js/combat.js", "js/core.js", "js/moEvent.js", "js/market.js",
 "js/map.js", "js/jiayuan.js", "js/mansion.js", "js/tainan.js", "js/sect.js", "js/blackmarket.js", "js/trial.js"
].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
});

var G = sandbox.GAME;
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ FAIL: " + name); } }
function reset() { setRand(0.5); G.State.createNewPlayer("wanderer"); return G.State.p(); }
function add(id, n) { G.State.addItem(id, n || 1); }

/* ================= ① 大地图 ================= */
console.log("\n【1】大地图与节点流转");
var p = reset();
ok("开局落点在幽篁谷", p.location === "shenshou_gu");
ok("起始有世俗银两盘缠", p.silver > 0);
ok("幽篁谷可走的道路非空", G.Map.routes().length >= 2);
ok("五个节点均已配置", ["shenshou_gu", "qingniu_zhen", "jiayuan_cheng", "tainan_gu", "huangfeng_gu"].every(function (id) { return !!G.Map.node(id); }));

var rQn = null;
G.Map.routes().forEach(function (r) { if (r.targetId === "qingniu_zhen") rQn = r; });

// 修为门槛：练气一层出不得山（校验先于盘缠）
ok("练气一层去不得青牛镇（需练气三层）", G.Map.canTravel(rQn.id).ok === false && G.Map.canTravel(rQn.id).msg.indexOf("练气三层") >= 0);
ok("未解锁道路在路线表中标为锁定", (function () {
    var r = null; G.Map.routes().forEach(function (x) { if (x.targetId === "qingniu_zhen") r = x; });
    return r.unlocked === false && r.lockMsg.indexOf("练气三层") >= 0;
})());

// 盘缠不足应被拦下（先给足修为，才能轮到盘缠检定）
p.realmIndex = 2;
p.silver = 0;
p.spiritStones = 0;
ok("盘缠不足时禁止上路", G.Map.canTravel(rQn.id).ok === false);
ok("盘缠不足给得出提示", G.Map.canTravel(rQn.id).msg.indexOf("盘缠") >= 0);

// 兑换市银后即可上路
p.spiritStones = 10;
G.Map.exchangeStone(5);
ok("兑 5 灵石得 500 两白银", p.silver === 500);
ok("兑换相应扣灵石", p.spiritStones === 5);

// 正常移动：扣盘缠 + 推进时间（练气三层方出得了山）
p = reset(); p.realmIndex = 2;
var beforeMonths = p.totalMonths;
var beforeSilver = p.silver;
ok("愿意承担则允许上路", G.Map.canTravel(rQn.id).ok === true);
G.Map.travel(rQn.id);
ok("已抵达青牛镇", p.location === "qingniu_zhen");
ok("移动耗时 2 个月", p.totalMonths - beforeMonths === 2);
ok("移动扣除盘缠 30 两", beforeSilver - p.silver === 30);

// 回乡探亲：心境 +10，且只能做一次
p = reset(); p.location = "qingniu_zhen"; p.mind = 0;
G.Map.doAction("visit_family");
ok("回乡探亲心境 +10", p.mind === 10);
ok("回乡探亲耗 1 个月", p.totalMonths === 1);
ok("回乡探亲只能一次", G.Map.canDoAction("visit_family").ok === false);

// 辞行厉长风：赠银 + 心境
p = reset(); p.mind = 0;
var silver0 = p.silver;
G.Map.doAction("farewell");
ok("辞行得盘缠 120 两", p.silver - silver0 === 120);
ok("辞行心境 +5", p.mind === 5);
ok("辞行只能一次", G.Map.canDoAction("farewell").ok === false);

// 苍南谷幻阵门槛（修为需练气六层，方能轮到幻阵检定）
p = reset(); p.location = "jiayuan_cheng"; p.silver = 9999; p.realmIndex = 5;
var rTn = null;
G.Map.routes().forEach(function (r) { if (r.targetId === "tainan_gu") rTn = r; });
p.changchunLevel = 1;
ok("青木功 1 层看不破幻阵", G.Map.canEnterTainan() === false);
ok("幻阵未破则不许进苍南谷", G.Map.canTravel(rTn.id).ok === false);
p.changchunLevel = 6;
ok("青木功 6 层可看破幻阵", G.Map.canEnterTainan() === true);
ok("幻阵已破则允许前往", G.Map.canTravel(rTn.id).ok === true);
// 持令也能破阵
p.changchunLevel = 1; add("shengxian_ling");
ok("持升仙令亦可看破幻阵", G.Map.canEnterTainan() === true);
p = reset(); p.location = "jiayuan_cheng"; p.silver = 9999; p.realmIndex = 5; p.changchunLevel = 6;
G.Map.travel(rTn.id);
ok("成功进入苍南山·苍南谷", p.location === "tainan_gu");

// 战斗中不许上路
p = reset(); G.Combat.start("wolf");
ok("斗法中禁止移动", G.Map.canTravel(rQn.id).ok === false);
G.Combat.end();

// —— 修为门槛梯度：一层不能全通，逐级放行 ——
p = reset(); p.location = "shenshou_gu"; p.silver = 9999;
var rJy1 = null;
G.Map.routes().forEach(function (r) { if (r.targetId === "jiayuan_cheng") rJy1 = r; });
p.realmIndex = 2;
ok("练气三层进不得景阳城（需练气四层）", G.Map.canTravel(rJy1.id).ok === false && G.Map.canTravel(rJy1.id).msg.indexOf("练气四层") >= 0);
p.realmIndex = 3;
ok("练气四层放行景阳城", G.Map.canTravel(rJy1.id).ok === true);
p.realmIndex = 4;
ok("练气五层照样放行（门槛是下限不是区间）", G.Map.canTravel(rJy1.id).ok === true);

// —— 青梧谷：练气圆满 / 本派门人 双通道 ——
p = reset(); p.location = "tainan_gu"; p.silver = 9999; p.realmIndex = 11;
var rHf = null;
G.Map.routes().forEach(function (r) { if (r.targetId === "huangfeng_gu") rHf = r; });
ok("苍南谷有直抵青梧谷的道路", !!rHf);
ok("练气十二层进不得青梧谷", G.Map.canTravel(rHf.id).ok === false && G.Map.canTravel(rHf.id).msg.indexOf("练气十三层") >= 0);
p.realmIndex = 12;
ok("练气圆满放行青梧谷", G.Map.canTravel(rHf.id).ok === true);
p = reset(); p.location = "tainan_gu"; p.realmIndex = 5; p.sectId = "huangfenggu";
ok("本派门人不受境界所限", G.Map.nodeUnlocked("huangfeng_gu").ok === true);

// —— 天下舆图：未解锁者隐去详情，只留所需境界 ——
p = reset();
ok("舆图五节点齐全", G.Map.atlas().length === 5);
ok("练气一层舆图中多处未解锁", G.Map.atlas().filter(function (n) { return !n.unlocked; }).length >= 3);
ok("未解锁条目均带所需境界", G.Map.atlas().filter(function (n) { return !n.unlocked; })
    .every(function (n) { return n.reqRealmName.indexOf("练气") === 0 && n.lockMsg.indexOf("需") >= 0; }));
ok("当前所在地在舆图中标出", G.Map.atlas().some(function (n) { return n.here && n.id === "shenshou_gu"; }));
p.realmIndex = 13;
ok("筑基后舆图全部解锁", G.Map.atlas().every(function (n) { return n.unlocked; }));

/* ================= ② 景阳城玄机世家主线 ================= */
console.log("\n【2】景阳城·玄机世家主线（解毒副本）");

// —— 前置：带阴毒抵达景阳城（银两给足，便于走"买路"路线） ——
function arriveJiayuan() {
    var q = reset();
    q.location = "jiayuan_cheng";
    q.yindu = { months: 24 };      // 体内阴毒 24 个月倒计时
    q.silver = 9999;
    return q;
}
// 由阶段一走到阶段二：统一走"塞银子买路"（index 1），不受信物有无影响
function gotoStage2(q) {
    G.Jiayuan.start();
    q.jiayuan = { stage: 2 };   // 直接推到阶段二（阶段一各分支已单独覆盖）
    return q;
}

p = arriveJiayuan();
ok("登门玄机世家前未开启事件链", p.jiayuan === null);
G.Jiayuan.start();
ok("登门后事件链开启于阶段一", p.jiayuan && p.jiayuan.stage === 1);
ok("阶段一配置可取（潜入/信物/买路/强闯/退去 共5项）", G.Jiayuan.stageCfg(1).choices.length === 5);

// 「出示信物」的前置：无物不可选、有物方可选
p = arriveJiayuan(); G.Jiayuan.start();
var st1 = G.Jiayuan.stageCfg(1);
ok("无信物则「出示信物」不可选", G.Jiayuan.canChoose(st1.choices[1]).ok === false);
add("mo_xinwu");
ok("有信物则「出示信物」可选", G.Jiayuan.canChoose(st1.choices[1]).ok === true);
G.Jiayuan.choose(1);
ok("凭信物面见颜氏 → 阶段二", p.jiayuan.stage === 2);

// 路线二：买通（需 30 两）
p = arriveJiayuan(); p.silver = 0; G.Jiayuan.start();
ok("没钱买路则不可选", G.Jiayuan.canChoose(st1.choices[2]).ok === false);
p.silver = 100;
G.Jiayuan.choose(2);
ok("塞银子买路 → 阶段二", p.jiayuan.stage === 2);
ok("买路扣 30 两白银", p.silver === 70);

// 路线三：强闯 → 战斗 → 胜则进二
p = arriveJiayuan(); G.Jiayuan.start();
setRand(0.5);
G.Jiayuan.choose(3);
ok("强闯触发战斗", !!p.combat && p.combat.def.id === "jingjiao_guard");
ok("战斗 ctx 标记为 jiayuan", p.combat.ctx && p.combat.ctx.type === "jiayuan");
p.combat.hp = 1;
G.Combat.attack();     // 一击必杀
ok("战胜后战斗结束", p.combat === null);
ok("强闯得手 → 阶段二", p.jiayuan.stage === 2);

// —— 阶段二：三条立威路线 ——
var st2 = G.Jiayuan.stageCfg(2);

// 路线甲：遣玄傀出手
p = arriveJiayuan(); gotoStage2(p);
ok("无玄傀时不可差遣", G.Jiayuan.canChoose(st2.choices[1]).ok === false);
add("yinhun_zhong"); G.Core.activateCompanion();
ok("已用摄魂钟激活玄傀", !!p.companion && G.State.countItem("yinhun_zhong") === 0);
ok("有玄傀则可差遣", G.Jiayuan.canChoose(st2.choices[1]).ok === true);
var compHp0 = p.companion.hp;
G.Jiayuan.choose(1);
ok("玄傀出手 → 阶段三", p.jiayuan.stage === 3);
ok("玄傀此役损耗气血 40", compHp0 - p.companion.hp === 40);
ok("遣玄傀血洗，恶名与煞气上升", p.karma < 0 && p.shaQi > 0);

// 路线乙：眨眼剑法暗杀（需反光短剑）
p = arriveJiayuan(); gotoStage2(p);
ok("无反光短剑则暗杀不可选", G.Jiayuan.canChoose(st2.choices[2]).ok === false);
add("mirror_short_sword");
ok("有反光短剑则暗杀可选", G.Jiayuan.canChoose(st2.choices[2]).ok === true);
G.Jiayuan.choose(2);
ok("眨眼剑法暗杀 → 阶段三", p.jiayuan.stage === 3);
ok("暗杀消耗了反光短剑", G.State.countItem("mirror_short_sword") === 0);

// 路线丙：当面挑战叛乱堂主（生死斗）
p = arriveJiayuan(); gotoStage2(p);
G.Jiayuan.choose(3);
ok("当面挑战触发生死斗", !!p.combat && p.combat.def.id === "rebel_tangzhu");
p.combat.hp = 1; G.Combat.attack();
ok("斩杀堂主 → 阶段三", p.jiayuan.stage === 3);
ok("堂主身上搜得玄机令", G.State.countItem("mo_xinwu") > 0);

// 路线丁：婉拒 → 停在阶段二，日后仍可再来
p = arriveJiayuan(); gotoStage2(p);
G.Jiayuan.choose(4);
ok("婉拒则停在阶段二可再来", p.jiayuan.stage === 2);

// —— 阶段三：暖阳宝玉解除阴毒 ——
p = arriveJiayuan(); gotoStage2(p); add("yinhun_zhong");
G.Core.activateCompanion(); G.Jiayuan.choose(1);
ok("仍停留在阶段三", p.jiayuan.stage === 3);
ok("解毒前阴毒仍在", !!p.yindu);
G.Jiayuan.choose(1);
ok("服下暖阳宝玉，阴毒尽除", p.yindu === null);
ok("宝玉已消耗（不入背包）", G.State.countItem("nuan_yang_bao_yu") === 0);
ok("解毒后推进到阶段四", p.jiayuan.stage === 4);

// —— 阶段四：仙缘线索 ——
p.mind = 0;
G.Jiayuan.choose(0);
ok("搜检遗箧 → 推进到阶段五（升仙令）", !!p.jiayuan && p.jiayuan.stage === 5);
ok("获【玄龟功完整残卷】", G.State.countItem("xiangjia_gongjuan") === 1);
G.Jiayuan.choose(1);
ok("升仙令参悟毕，事件链终结", p.jiayuan === null && p.jiayuanDone === true);
ok("获【升仙令】", G.State.countItem("shengxian_ling") === 1);
G.Core.takePill("xiangjia_gongjuan");
ok("修习玄龟功，防御 +6", p.defBonus === 6);

// 文案完整性
console.log("\n【2b】事件链文本完整性");
var allHaveText = G.DATA.JIAYUAN_CHAIN.every(function (s) {
    return s.title && s.text && s.choices && s.choices.length &&
        s.choices.every(function (c) { return c.text && c.outcome; });
});
ok("四阶段均含标题/正文/选项/分支结局", allHaveText);

/* ================= ③ 苍南小会 ================= */
console.log("\n【3】苍南小会（散修坊市 + 升仙大会）");
function arriveTainan() {
    var q = reset();
    q.location = "tainan_gu";
    q.spiritStones = 5000;
    return q;
}

p = arriveTainan();
ok("苍南坊市目录含五行灵符", ["talisman_huoqiu", "talisman_dingshen", "talisman_jingang"].every(function (id) {
    return G.DATA.TAINAN.goods.some(function (g) { return g.id === id; });
}));
ok("苍南坊市目录含下品法器", ["artifact_qingyun", "artifact_wujin"].every(function (id) {
    return G.DATA.TAINAN.goods.some(function (g) { return g.id === id; });
}));
ok("苍南坊市目录含青木功法术书", ["skill_yufeng", "skill_kongwu", "skill_huoqiushu"].every(function (id) {
    return G.DATA.TAINAN.goods.some(function (g) { return g.id === id; });
}));

// 购买：火球符 idx 0
var s0 = p.spiritStones;
G.Tainan.buy(0);
ok("以灵石购入火球符（弃用银两）", G.State.countItem("talisman_huoqiu") === 1 && p.spiritStones === s0 - 50);
// 灵石不足
p.spiritStones = 1;
ok("灵石不足则买不成", G.Tainan.buy(1) === false);

// 术法：买 manipulate 三个技能书并习得
p = arriveTainan();
G.Tainan.buy(6); G.Core.takePill("skill_kongwu");
ok("习得控物术，神识 +4", p.spiritBonus === 4);
var idxYu = null;
G.DATA.TAINAN.goods.forEach(function (g, i) { if (g.id === "skill_yufeng") idxYu = i; });
G.Tainan.buy(idxYu); G.Core.takePill("skill_yufeng");
ok("习得御风诀，速度 +4", p.speedBonus === 4);
ok("getStats 已并入永久加成", G.State.getStats().spirit > G.DATA.REALMS[0].spirit);
var idxHuo = null;
G.DATA.TAINAN.goods.forEach(function (g, i) { if (g.id === "skill_huoqiushu") idxHuo = i; });
G.Tainan.buy(idxHuo); G.Core.takePill("skill_huoqiushu");
ok("习得火球术，记入 spells", p.spells && p.spells.huoqiu_shu === true);

// 施放术法 + 冷却
G.Combat.start("wolf");
var hp0 = p.combat.hp;
G.Combat.castSpell("huoqiu_shu");
ok("火球术造成 45 点伤害", hp0 - p.combat.hp === 45);
ok("施放后进入冷却（第3回合方可再用）", p.combat.spellReady.huoqiu_shu === 3);
G.Combat.end();

// 出售
p = arriveTainan(); add("ore", 3);
var stones0 = p.spiritStones;
G.Tainan.sell("ore");
ok("以苍南价脱手矿石，得灵石", G.State.countItem("ore") === 2 && p.spiritStones === stones0 + G.Tainan.sellPrice("ore"));
ok("升仙令不可出售", G.Tainan.canSell("shengxian_ling") === false);

// 定身符：符光落地钉住敌身形，本回合敌方不得出手
p = arriveTainan();
G.Tainan.buy(1);   // talisman_dingshen
G.Combat.start("wolf");
var chp = p.currentHp;
G.Combat.useTalisman("talisman_dingshen");
ok("定身符生效，敌被钉住（本回合已消耗 1）", !!p.combat.stun && p.combat.stun.turns === 1);
ok("定身当回合敌方不得出手（玩家未掉血）", p.currentHp === chp);
G.Combat.end();
G.Tainan.buy(2);   // talisman_jingang
G.Combat.start("wolf");
G.Combat.useTalisman("talisman_jingang");
// 祭符即获 60 点罡气，随后敌方那一击由罡气先扛，故剩值 = 60 - 被吸收量
ok("金刚符提供 60 点罡气", G.DATA.ITEMS.talisman_jingang.combat.shield === 60);
ok("罡气扛下敌方一击后仍有余", p.combat.shield > 0 && p.combat.shield < 60);
G.Combat.end();

// 擂台：三轮连胜
p = arriveTainan();
G.Tainan.ensure();
G.Tainan.nextRound();
ok("第一轮上擂", !!p.combat && p.combat.def.id === "shengxian_p1");
ok("擂台战斗 ctx 标记为 leitai", p.combat.ctx.type === "leitai");
p.combat.hp = 1; G.Combat.attack();
ok("第一轮胜，记录连胜 1", p.tainan.leitai === 1);
G.Tainan.nextRound(); p.combat.hp = 1; G.Combat.attack();
ok("第二轮胜，记录连胜 2", p.tainan.leitai === 2);
G.Tainan.nextRound(); p.combat.hp = 1; G.Combat.attack();
ok("第三轮胜，连胜 3", p.tainan.leitai === 3);
ok("三轮皆胜，夺下前三", p.tainan.leitaiDone === true);
ok("前三获【筑基丹】", G.State.countItem("pill_zhuji") === 1);
ok("夺魁后不可再被打擂", G.Tainan.nextRound() === false);

// 擂台败北：按 routed 规则不当场身陨，且可从第一轮重来
p = arriveTainan(); G.Tainan.ensure();
G.Tainan.nextRound();
setRand(0.5);      // 敌方必命中（0.5 < 0.88）
p.currentHp = 1;
G.Combat.enemyTurn();
ok("擂台败北后战斗已结束", p.combat === null);
ok("擂台败北不判当场身陨", p.isDead === false);
ok("败北后连胜记录归零，可从头再打", p.tainan.leitai === 0);

// 保送：出示升仙令
p = arriveTainan();
ok("无升仙令则保送不成", G.Tainan.joinByToken() === false);
add("shengxian_ling");
ok("有升仙令则可保送", G.Tainan.joinByToken() === true);
ok("就此拜入青梧谷", p.sectId === "huangfenggu");
ok("保送耗去升仙令", G.State.countItem("shengxian_ling") === 0);
ok("入门后不可再上擂", G.Tainan.nextRound() === false);

/* ================= ④ 心境与突破 ================= */
console.log("\n【4】心境对突破的加成");
var base = G.DATA.REALMS[0].breakChance;   // 练气一层 0.90
var roll = base + 0.03;                    // 卡在"无心境界必败、有心境则可成"之间

p = reset(); p.mind = 0; p.currentExp = G.DATA.REALMS[0].needExp;
setRand(roll); G.Core.breakthrough();
ok("心境 0 时此roll 突破失败", p.realmIndex === 0);

p = reset(); p.mind = 30; p.currentExp = G.DATA.REALMS[0].needExp;   // 3 阶跃 → +6%
setRand(roll); G.Core.breakthrough();
ok("心境 30（+6%）同一 roll 反而成功", p.realmIndex === 1);
ok("心境加成封顶不超 98%", G.DATA.REALMS[0].breakChance + 0.06 <= 0.98);

setRand(0.5);
ok("心境来源之一：辞行 +5", G.DATA.MAP.actionText.farewell.mind === 5);
ok("心境来源之二：断尘缘 +10", G.DATA.MAP.actionText.visit_family.mind === 10);

/* ================= ⑤ 数据完整性互指 ================= */
console.log("\n【5】数据表交叉引用完整性");
(function checkIntegrity() {
    var bad = [];
    function needItem(id, where) { if (!G.DATA.ITEMS[id]) bad.push(where + " → 未知物品 " + id); }
    function needMonster(id, where) { var f = false; G.DATA.MONSTERS.forEach(function (m) { if (m.id === id) f = true; }); if (!f) bad.push(where + " → 未知怪物 " + id); }

    G.DATA.RECIPES.forEach(function (r) {
        needItem(r.pill, "RECIPES");
        Object.keys(r.herbs).forEach(function (h) { needItem(h, "RECIPES"); });
    });
    G.DATA.MARKET.pool.forEach(function (g) { needItem(g.id, "MARKET.pool"); });
    G.DATA.TAINAN.goods.forEach(function (g) { needItem(g.id, "TAINAN.goods"); });
    G.DATA.TAINAN.reward.items.forEach(function (id) { needItem(id, "TAINAN.reward"); });
    G.DATA.TAINAN.token.items.forEach(function (id) { needItem(id, "TAINAN.token"); });
    G.DATA.MONSTERS.forEach(function (m) { (m.loot || []).forEach(function (l) { needItem(l.id, "MONSTERS." + m.id); }); });
    G.DATA.EVENTS.forEach(function (ev) {
        (ev.outcomes || []).forEach(function (o) {
            if (o.monster) needMonster(o.monster, "EVENTS." + ev.id);
            (o.table || []).forEach(function (l) { needItem(l.id, "EVENTS." + ev.id); });
        });
        (ev.choices || []).forEach(function (c) {
            (c.outcomes || []).forEach(function (o) {
                if (o.monster) needMonster(o.monster, "EVENTS." + ev.id);
                (o.table || []).forEach(function (l) { needItem(l.id, "EVENTS." + ev.id); });
            });
        });
    });
    G.DATA.CONTENT.TRIAL.herbs.forEach(function (h) { needItem(h, "TRIAL.herbs"); });
    G.DATA.CONTENT.TRIAL.events.forEach(function (e) { (e.monsters || []).forEach(function (m) { needMonster(m, "TRIAL.events"); }); });
    G.DATA.CONTENT.TRIAL.array.forEach(function (a) { (a.table || []).forEach(function (l) { needItem(l.id, "TRIAL.array"); }); });
    needMonster(G.DATA.CONTENT.MODAIFU.stage2.monster, "MODAIFU.stage2");
    G.DATA.CONTENT.MODAIFU.reward.items.forEach(function (id) { needItem(id, "MODAIFU.reward"); });
    needItem(G.DATA.CONTENT.MODAIFU.warmYang.item, "MODAIFU.warmYang");
    G.DATA.CONTENT.SECT_EXCHANGE.forEach(function (e) { needItem(e.id, "SECT_EXCHANGE"); });
    G.DATA.CONTENT.BLACKMARKET_JUNK.forEach(function (j) { needItem(j.id, "BLACKMARKET_JUNK"); needItem(j.realId, "BLACKMARKET_JUNK.realId"); });

    // 地图：路线两端必须是真实节点，且不重名
    G.DATA.MAP.routes.forEach(function (r) {
        if (!G.Map.node(r.from)) bad.push("MAP.routes → 未知起点 " + r.from);
        if (!G.Map.node(r.to)) bad.push("MAP.routes → 未知终点 " + r.to);
    });
    G.DATA.MAP.nodes.forEach(function (n) {
        (n.actions || []).forEach(function (a) {
            if (!G.DATA.MAP.actionText[a.id]) bad.push("MAP.node." + n.id + " → 缺 actionText." + a.id);
        });
    });
    if (!G.Map.node(G.DATA.MAP.start)) bad.push("MAP.start 指向不存在的节点");

    // 景阳城事件链：需求/代价/结局引用的物品与怪物必须存在
    G.DATA.JIAYUAN_CHAIN.forEach(function (s) {
        s.choices.forEach(function (c) {
            if (c.require && c.require.item) needItem(c.require.item, "JIAYUAN.stage" + s.stage);
            if (c.cost && c.cost.item) needItem(c.cost.item, "JIAYUAN.stage" + s.stage);
            if (c.outcome.combat) needMonster(c.outcome.combat.monster, "JIAYUAN.stage" + s.stage);
            (c.outcome.loot || []).forEach(function (id) { needItem(id, "JIAYUAN.stage" + s.stage); });
        });
    });

    // 甩手的法术：use.learnSpell 必须落在 SPELLS 上
    Object.keys(G.DATA.ITEMS).forEach(function (k) {
        var u = G.DATA.ITEMS[k].use;
        if (u && u.learnSpell && !(G.DATA.SPELLS || {})[u.learnSpell]) bad.push("ITEMS." + k + " → 未知术法 " + u.learnSpell);
    });
    G.DATA.TAINAN.leitai.forEach(function (r) { needMonster(r.monster, "TAINAN.leitai"); });
    needItem(G.DATA.MAP.array.needToken, "MAP.array.needToken");

    ok("数据表交叉引用无悬空 id" + (bad.length ? "：" + bad.join("；") : ""), bad.length === 0);
})();

/* ================= ⑥ 端到端主线串联 ================= */
console.log("\n【6】端到端串联：玄机子 → 景阳城 → 苍南谷 → 青梧谷");
(function e2e() {
    var q = reset();
    setRand(0.5);

    // 1) 一路破境到练气四层 → 触发玄机子关卡 → 强撸到通关
    q.realmIndex = 2; q.currentExp = G.DATA.REALMS[2].needExp;
    q.changchunLevel = 3;                       // 模拟正常连破三层后的青木功进度
    G.Core.breakthrough();
    ok("突破练气四层触发玄机子关卡", q.moEventDone === true && !!q.moEvent && q.moEvent.stage === 1);
    G.MoEvent.actStage1();
    ok("阶段一过后转入阶段二（正面交锋）", q.moEvent.stage === 2 && !!q.combat && q.combat.def.id === "mo_daifu");
    // 魔银手免疫利刃：先用普通斗法验证砍刺被弹开，再用符箓破防
    var hp0 = q.combat.hp;
    G.Combat.attack();
    ok("《魔银手》真的弹开了利刃砍刺（伤害被压至一成多）", hp0 - q.combat.hp <= 2);
    add("talisman_huoqiu", 1);
    q.combat.hp = 1;
    G.Combat.useTalisman("talisman_huoqiu");    // 符箓不在利刃之列，可破其根本
    ok("符箓破防，玄机子肉身被制", q.combat === null);
    ok("玄机子之战后进入阶段三（识海）", !!q.moEvent && q.moEvent.stage === 3);
    G.MoEvent.swallow(0);                       // 青木功 4 层 → 0.3+0.4=0.7，rand 0.5 必成
    ok("吞噬成功，玄机子一役了结", q.moEvent === null && q.moEventDone === true);
    ok("战后身负【体内阴毒】24 个月", !!q.yindu && q.yindu.months === 24);
    ok("战后得【玄机令】（景阳城的敲门砖）", G.State.countItem("mo_xinwu") === 1);
    ok("《青木功续篇》层数跃升 4 → 10", q.changchunLevel === 10);

    // 2) 筹措盘缠 → 动身景阳城
    var rJy = null;
    G.Map.routes().forEach(function (r) { if (r.targetId === "jiayuan_cheng") rJy = r; });
    ok("幽篁谷有直抵景阳城的道路", !!rJy);
    var monthsBefore = q.totalMonths, yinduBefore = q.yindu.months;
    q.silver = 500;
    G.Map.travel(rJy.id);
    ok("抵达景阳城", q.location === "jiayuan_cheng");
    ok("行程耗时记账正确", q.totalMonths - monthsBefore === rJy.months);
    ok("赶路同时阴毒倒计时递减（强驱动）", q.yindu.months === yinduBefore - rJy.months);

    // 3) 走完玄机世家四阶段：解毒 + 拿到升仙令
    G.Map.doAction("mo_house");
    ok("登门玄机世家，事件链开启", !!q.jiayuan && q.jiayuan.stage === 1);
    G.Jiayuan.choose(0);                        // 凭信物面见颜氏
    add("yinhun_zhong"); G.Core.activateCompanion();
    ok("于随从处以精血唤起玄傀", !!q.companion);
    G.Jiayuan.choose(0);                        // 遣玄傀立威
    G.Jiayuan.choose(0);                        // 受暖阳宝玉
    ok("暖阳宝玉驱尽阴毒，解除死亡倒计时", q.yindu === null);
    G.Jiayuan.choose(0);                        // 搜检遗箧
    ok("玄机世家主线终结", q.jiayuanDone === true && q.jiayuan === null);
    ok("获得【升仙令】", G.State.countItem("shengxian_ling") === 1);

    // 其间闭关苦修，晋至练气六层（散修之地不纳弱者）
    q.realmIndex = 5;

    // 4) 凭升仙令看破幻阵，直入苍南谷
    var rTn2 = null;
    G.Map.routes().forEach(function (r) { if (r.targetId === "tainan_gu") rTn2 = r; });
    ok("持令可看破苍南谷幻阵", G.Map.canEnterTainan() === true);
    q.silver = 500;
    G.Map.travel(rTn2.id);
    ok("进入苍南山·苍南谷", q.location === "tainan_gu");

    // 5) 苍南小会买法术书 → 出示升仙令保送拜入青梧谷
    q.spiritStones = 3000;
    G.Tainan.buy(idxHuo); G.Core.takePill("skill_huoqiushu");
    ok("小会上习得《火球术》（仙途第一步）", !!(q.spells && q.spells.huoqiu_shu));
    G.Tainan.joinByToken();
    ok("凭升仙令保送拜入青梧谷", q.sectId === "huangfenggu");
    ok("拜山耗去升仙令", G.State.countItem("shengxian_ling") === 0);
    ok("全过程的终点：人还活着，主线走通", q.isDead === false);
})();

console.log("\n结果: " + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
