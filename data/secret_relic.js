/* =========================================================
 * data/secret_relic.js —— 古修遗迹·探宝（筑基期专属 roguelike 副本）
 *
 * 沉眠千载的古修洞府：多步探索，每步随机——
 *   采灵物 / 撬宝箱 / 触机关 / 战残魂。
 * 筑基一层可入，休整 4 月方可再探。走完 12 步自出口脱离，保住战利品。
 * 逻辑见 js/secret_relic.js（仿 trial.js 的 step 机制，经 combat.js 路由战斗）。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};
GAME.DATA.MONSTERS = GAME.DATA.MONSTERS || [];
GAME.DATA.ITEMS = GAME.DATA.ITEMS || {};

/* 古修残魂（遗迹战斗用，筑基强度） */
GAME.DATA.MONSTERS.push({
    id: "relic_wraith", name: "古修残魂", human: false, majorRealm: 1,
    hp: 700, atk: 50, def: 30, speed: 11, spirit: 55, exp: 200,
    stones: [100, 220], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.3],
    loot: [
        { id: "mid_stone", chance: 0.7, qty: [1, 3] },
        { id: "shadan_suipian", chance: 0.4, qty: [1, 1] }
    ],
    desc: "千年古修坐化前的一缕执念，凝而不散，见活物便扑噬而上——胜之可得其遗泽。"
});

/* 副本配置 */
GAME.DATA.RELIC = {
    id: "relic",
    name: "古修遗迹·探宝",
    steps: 12,                 // 探索步数
    cooldownMonths: 4,         // 休整月数
    enterRealm: 13,            // 筑基一层准入
    monsters: ["relic_wraith"],
    // 每步事件权重
    events: [
        { type: "gather", weight: 3 },
        { type: "chest",  weight: 2 },
        { type: "trap",   weight: 2 },
        { type: "wraith", weight: 3 }
    ],
    // 灵物表（gather）
    gatherTable: [
        { id: "herb_tianling",  w: 3 },
        { id: "herb_yumo",      w: 3 },
        { id: "herb_zihou",     w: 3 },
        { id: "mid_stone",      w: 2, qty: [2, 4] },
        { id: "shadan_suipian", w: 2 }
    ],
    // 宝箱表（chest）
    chestTable: [
        { id: "mid_stone",     w: 3, qty: [5, 10] },
        { id: "pill_jinsui",   w: 2, qty: [1, 2] },
        { id: "skill_yufeng",  w: 2 },
        { id: "artifact_qingyun", w: 1 }
    ],
    // 机关（trap）：掉血 + 扣灵石
    trap: { hp: [20, 60], stonePct: [0.05, 0.15] },
    // 走完 12 步的收尾赠礼
    clearReward: { id: "shadan_suipian", qty: 1, text: "遗迹尽头，一截煞丹碎片嵌在残阵核心——此物可弱越皇血祭光环，留作云京皇宫之备。" }
};
