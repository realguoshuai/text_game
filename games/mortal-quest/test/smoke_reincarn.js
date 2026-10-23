/* smoke_reincarn.js —— Task4 轮回道韵（局外继承）单测
 * 覆盖：结算公式 / 防重 / localStorage 持久化 / 遗泽领取与消耗 /
 *       洗髓易筋打坐 ×1.5（time.expOf）与丹药 ×1.5（Reincarn.pillMult）
 * 运行：NODE_PATH=... node test/smoke_reincarn.js（test/package.json 已垫 commonjs）
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");
var BASE = path.join(__dirname, "..");
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("✓ " + name); } else { fail++; console.log("✗ FAIL: " + name); } }

var _rand = 0.5;
var LS = {};
var sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(LS, k) ? LS[k] : null; },
    setItem: function (k, v) { LS[k] = String(v); },
    removeItem: function (k) { delete LS[k]; }
};
sandbox.GAME = { DATA: {}, UI: { log: function () {}, updateUI: function () {} }, Home: { meditateExp: function () { return 0; } } };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

["data/realms.js", "data/world.js", "data/items.js", "js/state.js", "js/time.js", "js/reincarn.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
});
var G = sandbox.GAME;

/* ===== ① 结算公式：境界×3 + (岁−16)/10 + 杀/5 + 图鉴/10 ===== */
var p1 = G.State.createNewPlayer("hunter");
p1.realmIndex = 13;             // 筑基初期 → 13×3=39
p1.ageYears = 100;              // (100−16)/10 → 8
p1.stats.kills = 12;            // 12/5 → 2
p1.codex = { items: { a: 1, b: 1, c: 1, d: 1, e: 1 }, monsters: { f: 1 }, spells: {}, lore: { g: 1, h: 1, i: 1, j: 1, k: 1, l: 1, m: 1, n: 1, o: 1 } };  // 15 条 → 1
var want1 = 13 * 3 + Math.floor((100 - 16) / 10) + Math.floor(12 / 5) + Math.floor(15 / 10);
var r1 = G.Reincarn.settle(p1, "坐化");
ok("结算公式（probe 现算 = " + want1 + "）", r1 && r1.gained === want1);
ok("余额入局外账本", G.Reincarn.load().daoyun === want1);
ok("lastResult 记录事由", G.Reincarn.lastResult.why === "坐化" && G.Reincarn.lastResult.total === want1);

/* ===== ② 一世只结一次 ===== */
ok("重复结算被拒（防重）", G.Reincarn.settle(p1, "坐化") === null && G.Reincarn.load().daoyun === want1);

/* ===== ③ 持久化：换一局（新 player 对象）仍结得上 ===== */
var p2 = G.State.createNewPlayer("hunter");
p2.realmIndex = 14;
var r2 = G.Reincarn.settle(p2, "兵解重入轮回");
var want2 = want1 + 14 * 3;
ok("第二世兵解再结算并累加", r2.gained === 14 * 3 && G.Reincarn.load().daoyun === want2);

/* ===== ④ 遗泽领取：扣道韵 + 效果落身 ===== */
G.Reincarn.save({ daoyun: 100 });
var p3 = G.State.createNewPlayer("hunter");
var before3 = { stones: p3.spiritStones, liquid: p3.liquid, spirit: p3.spiritBonus, mind: p3.mind };
_rand = 0.10;   // baocang 随机法器 → talisman_hushen（0.10 < 1/3）
var lines = G.Reincarn.applySelected(p3, { baocang: 1, canyun: 1, suhui: 1, xisui: 1 });
var cost = 20 + 15 + 25 + 40;
ok("四条遗泽全领扣 100 道韵", G.Reincarn.load().daoyun === 0 && lines.length >= 4);
ok("前世藏宝：灵石 +80", p3.spiritStones === before3.stones + 80);
ok("前世藏宝：袋中多得一件法器", G.State.countItem("talisman_hushen") === 1);
ok("掌天残韵：绿液 +2", p3.liquid === before3.liquid + 2);
ok("神识宿慧：神识 +15 且敛气一层", p3.spiritBonus === before3.spirit + 15 && p3.concealLevel === 1);
ok("洗髓易筋：trueRoot 落身 + 心境 +3", p3.trueRoot === true && p3.mind === before3.mind + 3);
ok("boonActive 查询", G.Reincarn.boonActive(p3, "xisui") === true && G.Reincarn.boonActive(p3, "canyun") === true);

/* ===== ⑤ 余额不足：拒绝领取且不落身 ===== */
var p4 = G.State.createNewPlayer("hunter");
var before4 = p4.spiritStones;
var l4 = G.Reincarn.applySelected(p4, { xisui: 1 });
ok("道韵为 0：领取被拒、无效果、无日志", G.Reincarn.load().daoyun === 0 && l4.length === 0 && p4.spiritStones === before4 && !p4.trueRoot);

/* ===== ⑥ 洗髓易筋：打坐修为 ×1.5（向上取整），预览与结算同源 ===== */
var p5 = G.State.createNewPlayer("hunter");
ok("无遗泽：一周天仍 +1（不变量）", G.Time.expOf(p5, 1) === 1);
p5.trueRoot = true;
ok("洗髓：一周天 +1 → ×1.5 = 2", G.Time.expOf(p5, 1) === 2);
ok("洗髓：3 周天 → ceil(4.5) = 5", G.Time.expOf(p5, 3) === 5);
p5.trueRoot = false;
ok("false 时回落 +1（无残留）", G.Time.expOf(p5, 1) === 1);

/* ===== ⑦ 洗髓：丹药吸收 ×1.5 ===== */
var p6 = G.State.createNewPlayer("hunter");
ok("无遗泽 pillMult=1", G.Reincarn.pillMult(p6) === 1);
p6.boons = { xisui: true };   // 游戏真实路径：applySelected 同时落 boons 与 trueRoot
p6.trueRoot = true;
ok("洗髓 pillMult=1.5", G.Reincarn.pillMult(p6) === 1.5);

/* ===== ⑧ 老局无 boons 字段：boonActive 安全兜底 ===== */
ok("老存档无 boons 字段不炸", G.Reincarn.boonActive({ _legacy: true }, "xisui") === false);

console.log("结果 PASS " + pass + " / FAIL " + fail);
process.exit(fail ? 1 : 0);
