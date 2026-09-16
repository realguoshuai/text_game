/* =========================================================
 * data/wild_dungeons.js —— 野外历练数据层
 *
 * ① 野外新增怪物（按境界分带，随修为出现）
 * ② ENCOUNTERS  路遇事件池：外出赶路按修为随机遇敌（minRealm ≤ 修为 ≤ maxRealm）
 * ③ HUNTS       分档狩猎副本：连战数波，通关按档位掉装备/物资（打怪换装过渡线）
 * ④ 数据只进不出：逻辑见 js/hunt.js 与 js/map.js（路遇掷点）
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};
GAME.DATA.MONSTERS = GAME.DATA.MONSTERS || [];
GAME.DATA.ITEMS = GAME.DATA.ITEMS || {};

/* ——————— ① 野外新增怪物 ——————— */
GAME.DATA.MONSTERS.push(
    /* —— 练气期野外（下标 2~12） —— */
    {
        id: "wild_fenglang", name: "风行狼", isBeast: true, tier: 1,
        hp: 95, atk: 15, def: 6, speed: 13, spirit: 12, exp: 45,
        stones: [10, 30], killChance: 0, loseAge: [0, 0], loseStonePct: [0.1, 0.2],
        loot: [{ id: "beast_soul", chance: 0.15, qty: [1, 1] }],
        desc: "群居于岚州山道两侧，遁速极快，落单的旅人最合它们胃口。",
    },
    {
        id: "wild_sanxiu", name: "劫道散修", human: true,
        hp: 120, atk: 16, def: 8, speed: 10, spirit: 18, exp: 55,
        stones: [30, 80], killChance: 0, loseAge: [0, 0], loseStonePct: [0.3, 0.5],
        loot: [{ id: "artifact_qingwen", chance: 0.2, qty: [1, 1] }],
        desc: "修为浅薄却专挑同行下黑手的散修，身上多少有些不干净的家当。",
    },
    {
        id: "wild_dushe", name: "碧毒蟒", isBeast: true, tier: 1,
        hp: 140, atk: 14, def: 10, speed: 7, spirit: 10, exp: 60,
        stones: [10, 25], killChance: 0, loseAge: [0, 0], loseStonePct: [0.1, 0.2],
        poisonPlayer: { turns: 3, dmg: 10 },
        loot: [{ id: "beast_soul", chance: 0.2, qty: [1, 1] }],
        desc: "盘踞在湿润谷地的巨蟒，信子吐出的青雾沾身即麻。",
    },
    /* —— 筑基期野外（下标 13~21） —— */
    {
        id: "wild_qingbao", name: "苍岚豹", isBeast: true, tier: 2,
        hp: 620, atk: 46, def: 24, speed: 16, spirit: 40, exp: 160,
        stones: [60, 140], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.3],
        loot: [{ id: "beast_soul", chance: 0.4, qty: [1, 2] }],
        desc: "二阶妖兽，苍岚丽影，扑杀如电——皮毛亦是炼器好料。",
    },
    {
        id: "wild_wugong", name: "铁甲蜈蚣", isBeast: true, tier: 2,
        hp: 760, atk: 38, def: 48, speed: 6, spirit: 30, exp: 170,
        stones: [50, 120], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.3],
        loot: [{ id: "jinshi", chance: 0.5, qty: [1, 2] }, { id: "iron_ore", chance: 0.5, qty: [1, 2] }],
        desc: "背甲如铁浇铜铸，寻常法器难伤——噬金虫见了会疯狂。",
    },
    {
        id: "wild_moxiu", name: "落单魔修", human: true,
        hp: 640, atk: 52, def: 26, speed: 12, spirit: 45, exp: 190,
        stones: [100, 240], killChance: 0, loseAge: [0, 0], loseStonePct: [0.3, 0.5],
        loot: [{ id: "tianhuo_crystal", chance: 0.25, qty: [1, 1] }],
        desc: "魔道六宗散落在外的眼线爪牙，出手便是杀招，莫与其讲道理。",
    },
    {
        id: "wild_huolang", name: "火鬃狼王", isBeast: true, tier: 3,
        hp: 980, atk: 58, def: 34, speed: 15, spirit: 55, exp: 260,
        stones: [120, 280], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.4],
        loot: [{ id: "beast_soul", chance: 0.7, qty: [1, 2] }, { id: "tianhuo_crystal", chance: 0.3, qty: [1, 1] }],
        desc: "三阶妖兽，鬃毛间火星迸溅，一声长嚎百狼来投——筑基修士亦需结伴而猎。",
    }
);

/* ——————— ② 路遇事件池（travel 掷点 25%） ——————— */
GAME.DATA.MAP_ENCOUNTERS = {
    chance: 0.25,          // 每段路途遇敌概率
    skipText: "一路无事。",
    pool: [
        { minRealm: 2, maxRealm: 8,  monster: "wild_fenglang" },
        { minRealm: 3, maxRealm: 10, monster: "wild_sanxiu"  },
        { minRealm: 4, maxRealm: 12, monster: "wild_dushe"   },
        { minRealm: 13, maxRealm: 17, monster: "wild_qingbao" },
        { minRealm: 13, maxRealm: 17, monster: "wild_wugong"  },
        { minRealm: 14, maxRealm: 18, monster: "wild_moxiu"   },
        { minRealm: 18, maxRealm: 21, monster: "wild_huolang" },
    ],
};

/* ——————— ③ 分档狩猎副本（打怪换装过渡线） ——————— */
GAME.DATA.HUNTS = {
    list: [
        {
            id: "hunt_heishikuang", name: "黑石矿洞", reqRealm: 4,
            teaser: "景阳城以西的废弃矿洞，如今成了匪徒与狼群的巢穴——练气修士的磨刀石。",
            waves: ["bandit", "wild_fenglang", "robber"],
            reward: {
                equip: ["artifact_xuangui", "mirror_armor"],   // 通关必得其一（rand 决定）
                materials: [{ id: "iron_ore", qty: 2 }],
                stones: [80, 160],
                text: "矿洞深处匪徒的藏宝箱大开——几件被当作压山之资的器物落入了你手中。",
            },
        },
        {
            id: "hunt_wanyao", name: "万妖窟·外层", reqRealm: 6,
            teaser: "苍南山麓的裂谷妖巢。外层妖物不算强，胜在精魄与妖丹产出稳定。",
            waves: ["fz_beast_yu", "wild_dushe", "wolfking"],
            reward: {
                equip: ["artifact_qingyuan", "ancient_fragment"],
                materials: [{ id: "beast_soul", qty: 1 }, { id: "iron_ore", qty: 2 }],
                stones: [150, 300],
                text: "外层妖兽尽伏。你在兽巢深处翻出些妖兽衔来囤积的发亮物件。",
            },
        },
        {
            id: "hunt_shashen", name: "魔修弃营", reqRealm: 15,
            teaser: "魔道六宗入境后遗弃的一处联络营垒——守备虽撤，留下的凶徒与禁制仍在。",
            waves: ["wild_moxiu", "moyan_disciple", "wild_huolang"],
            reward: {
                equip: ["artifact_zimu_complete", "artifact_zhetian", "artifact_tayun"],
                materials: [{ id: "tianhuo_crystal", qty: 1 }, { id: "beast_soul", qty: 2 }],
                stones: [400, 800],
                text: "营垒地宫石门轰开——魔修们来不及带走的重宝，静静躺在祭坛之上。",
            },
        },
    ],
    byId: function (id) {
        for (var i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i];
        return null;
    },
};

/* 洞口标记物（副本入口信物，防误入） */
GAME.DATA.ITEMS.hunt_token = {
    id: "hunt_token", name: "兽皮舆图", type: "material", quality: "上品", price: 50,
    desc: "猎户手绘的兽皮图，标着几处「有怪物、有宝货」的去处。循图可至狩猎之地。",
};
