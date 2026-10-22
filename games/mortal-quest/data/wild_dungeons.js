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
    },
    /* —— 结丹期野外（下标 16~18）：majorRealm:2，与结丹玩家同境，方有真正较量 —— */
    {
        id: "wild_sanxiu_jie", name: "渡劫散修", human: true, tier: 4, majorRealm: 2,
        hp: 2200, atk: 105, def: 60, speed: 16, spirit: 100, exp: 650,
        stones: [300, 700], killChance: 0, loseAge: [0, 0], loseStonePct: [0.3, 0.5],
        loot: [{ id: "tianhuo_crystal", chance: 0.35, qty: [1, 2] }, { id: "pill_jiedan", chance: 0.15, qty: [1, 1] }],
        desc: "卡在筑基圆满多年、终得凝丹的散修，一身野路子神通，最难缠。",
    },
    {
        id: "wild_yaoxiu", name: "结丹妖修", human: true, tier: 4, majorRealm: 2,
        hp: 2600, atk: 95, def: 72, speed: 18, spirit: 92, exp: 720,
        stones: [350, 800], killChance: 0, loseAge: [0, 0], loseStonePct: [0.3, 0.5],
        loot: [{ id: "beast_soul", chance: 0.5, qty: [1, 2] }, { id: "jinshi", chance: 0.3, qty: [1, 2] }],
        desc: "由妖兽修成人形的结丹大妖，妖丹与灵智俱全，手段狠辣。",
    },
    {
        id: "wild_jiaolong", name: "赤鳞蛟", isBeast: true, tier: 4, majorRealm: 2,
        hp: 4200, atk: 120, def: 90, speed: 20, spirit: 110, exp: 980,
        stones: [400, 900], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.4],
        loot: [{ id: "beast_soul", chance: 0.7, qty: [2, 3] }, { id: "tianhuo_crystal", chance: 0.4, qty: [1, 2] }],
        desc: "四阶妖兽，赤鳞如火，盘踞深渊灵脉——结丹修士亦不敢轻易撄其锋。",
    },
    {
        id: "wild_moxiu_jie", name: "魔修巡察使", human: true, tier: 4, majorRealm: 2,
        hp: 3000, atk: 112, def: 78, speed: 14, spirit: 125, exp: 1050,
        stones: [450, 1000], killChance: 0, loseAge: [0, 0], loseStonePct: [0.3, 0.5],
        poisonPlayer: { turns: 3, dmg: 25 },
        loot: [{ id: "tianhuo_crystal", chance: 0.5, qty: [1, 2] }, { id: "pill_jiedan_zhengpin", chance: 0.12, qty: [1, 1] }],
        desc: "魔道六宗派驻外域的巡察，专司清剿异己，周身魔焰环绕。",
    },
    /* —— 两强争海 · 先锋将（元婴篇）：只由「正面冲阵」调用，不进路遇池 —— */
    {
        id: "luanxing_vanguard", name: "乱星盟·先锋将", tier: 5, majorRealm: 3,
        hp: 22000, atk: 620, def: 420, speed: 55, spirit: 300, exp: 3000,
        stones: [1200, 2600], killChance: 0, loseAge: [0, 0], loseStonePct: [0.15, 0.3],
        loot: [{ id: "tianhuo_crystal", chance: 0.5, qty: [1, 3] }],
        desc: "乱星盟先锋大将，一身煞气凝如实质，刀下亡魂无数。冲阵先过他一关。",
    },
    {
        id: "xingque_vanguard", name: "星阙·前锋督帅", tier: 5, majorRealm: 3,
        hp: 22000, atk: 620, def: 420, speed: 55, spirit: 300, exp: 3000,
        stones: [1200, 2600], killChance: 0, loseAge: [0, 0], loseStonePct: [0.15, 0.3],
        loot: [{ id: "tianhuo_crystal", chance: 0.5, qty: [1, 3] }],
        desc: "星阙前锋督帅，甲胄上凝着三百年不散的海霜。冲阵先过他一关。",
    },
    /* —— 心魔凝形（结丹篇）：只由反夺元神失败触发，不进路遇池 —— */
    {
        id: "seize_demon", name: "心魔·凝形", tier: 4, majorRealm: 2,
        hp: 1800, atk: 115, def: 55, speed: 22, spirit: 130, exp: 800,
        stones: [300, 700], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.4],
        loot: [{ id: "yinhun_zhong", chance: 0.2, qty: [1, 1] }, { id: "tianhuo_crystal", chance: 0.35, qty: [1, 2] }],
        desc: "你识海里那缕元神借破口凝出的形貌——眉眼与你一般无二，出手却招招指向你的旧伤。",
    },
    /* —— 阵营追杀者（结丹篇）：只由【追杀令】调用，不进路遇池 —— */
    {
        id: "xingque_hunter", name: "星阙·追缉使", tier: 4, majorRealm: 2,
        hp: 2400, atk: 98, def: 70, speed: 17, spirit: 110, exp: 600,
        stones: [400, 800], killChance: 0, loseAge: [0, 0], loseStonePct: [0.3, 0.5],
        loot: [{ id: "pill_qingxin", chance: 0.35, qty: [1, 1] }, { id: "jinshi", chance: 0.3, qty: [1, 2] }],
        desc: "星阙麾下专司缉拿的结丹修士，剑法方正，出手却绝不留情。",
    },
    {
        id: "luanxing_hunter", name: "乱星盟·暗煞", tier: 4, majorRealm: 2,
        hp: 2600, atk: 108, def: 62, speed: 20, spirit: 120, exp: 700,
        stones: [450, 900], killChance: 0, loseAge: [0, 0], loseStonePct: [0.3, 0.5],
        poisonPlayer: { turns: 3, dmg: 20 },
        loot: [{ id: "tianhuo_crystal", chance: 0.4, qty: [1, 2] }, { id: "pill_yanghun", chance: 0.3, qty: [1, 1] }],
        desc: "魔道联盟的暗煞，行踪不定，出手先下毒——杀人之前从不啰嗦。",
    },
    {
        id: "sanxiu_hunter", name: "散修·赏金客", tier: 4, majorRealm: 2,
        hp: 2100, atk: 92, def: 55, speed: 18, spirit: 90, exp: 520,
        stones: [350, 700], killChance: 0, loseAge: [0, 0], loseStonePct: [0.25, 0.45],
        loot: [{ id: "pill_qingxin", chance: 0.25, qty: [1, 1] }, { id: "beast_soul", chance: 0.4, qty: [1, 2] }],
        desc: "为赏金卖命的散修，谁出的价钱高就替谁杀人——包括你。",
    }
);

/* ——————— ①b 元婴期对手（realm 19~21）：majorRealm:3，与元婴玩家同境方称劲敌 ——————— */
GAME.DATA.MONSTERS.push(
    {
        id: "wild_sanxiu_yuan", name: "元婴散修", human: true, tier: 5, majorRealm: 3,
        hp: 9000, atk: 320, def: 220, speed: 40, spirit: 260, exp: 2200,
        stones: [500, 1100], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.4],
        affix: "seizeSoul",
        loot: [{ id: "tianhuo_crystal", chance: 0.4, qty: [1, 2] }, { id: "pill_jiedan_zhengpin", chance: 0.15, qty: [1, 1] }],
        desc: "苦修千载方凝婴的散修，一身神识凝如实质，出手狠绝且极善攻心。",
    },
    {
        id: "wild_yaowang_qinwei", name: "妖王亲卫", human: true, tier: 5, majorRealm: 3,
        hp: 11000, atk: 360, def: 260, speed: 44, spirit: 280, exp: 2600,
        stones: [600, 1300], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.4],
        loot: [{ id: "beast_soul", chance: 0.6, qty: [2, 3] }, { id: "tianhuo_crystal", chance: 0.3, qty: [1, 2] }],
        desc: "妖王座下精锐，甲胄染血，随妖王征战星海多年，煞气逼人。",
    },
    {
        id: "wild_guixu_shou", name: "归墟守兽", isBeast: true, tier: 6, majorRealm: 3,
        hp: 14000, atk: 420, def: 320, speed: 38, spirit: 300, exp: 3000,
        stones: [700, 1500], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.4],
        affix: "thickShell",
        loot: [{ id: "beast_soul", chance: 0.7, qty: [2, 3] }, { id: "tianhuo_crystal", chance: 0.4, qty: [1, 2] }],
        desc: "盘踞归墟古渊的远古异兽，鳞甲如玄铁，寻常法器难伤其分毫。",
    },
    /* —— 元婴副本 · 双阶段 Boss（只由 HUNTS 调用，不进路遇池） —— */
    {
        id: "yaowang_chixiao", name: "赤霄妖王", isBeast: true, tier: 6, majorRealm: 3,
        hp: 26000, atk: 640, def: 430, speed: 58, spirit: 320, exp: 5000,
        stones: [1500, 3000], killChance: 0, loseAge: [0, 0], loseStonePct: [0.15, 0.3],
        affix: "berserk",
        loot: [{ id: "artifact_zimu_complete", chance: 0.5, qty: [1, 1] }, { id: "tianhuo_crystal", chance: 0.6, qty: [2, 3] }, { id: "yinhun_zhong", chance: 0.2, qty: [1, 1] }],
        desc: "乱星海妖族共主，赤羽蔽日。气血过三成便妖化狂暴，攻伐陡翻倍——硬撼者多殒于这一瞬。",
    },
    {
        id: "guixu_zhiyan", name: "归墟之眼", isBeast: true, tier: 6, majorRealm: 3,
        hp: 40000, atk: 700, def: 520, speed: 50, spirit: 360, exp: 6000,
        stones: [2000, 4000], killChance: 0, loseAge: [0, 0], loseStonePct: [0.15, 0.3],
        affix: "thickShell", poisonPlayer: { turns: 3, dmg: 30 },
        loot: [{ id: "artifact_zhetian", chance: 0.5, qty: [1, 1] }, { id: "tianhuo_crystal", chance: 0.7, qty: [2, 3] }, { id: "yinhun_zhong", chance: 0.3, qty: [1, 2] }],
        desc: "归墟古渊深处的古老存在，眼瞳如渊。鳞甲卸去大半杀伤，吐息带剧毒，沉眠万载只待来犯者。",
    },
    {
        id: "guixu_guard", name: "归墟守仆", human: true, tier: 5, majorRealm: 3,
        hp: 16000, atk: 520, def: 380, speed: 46, spirit: 330, exp: 3500,
        stones: [800, 1600], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.4],
        loot: [{ id: "tianhuo_crystal", chance: 0.5, qty: [1, 2] }, { id: "beast_soul", chance: 0.4, qty: [1, 2] }],
        desc: "归墟之眼点化的傀儡侍从，无智无觉，唯余千载杀伐本能。",
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
        { minRealm: 13, maxRealm: 15, monster: "wild_qingbao" },
        { minRealm: 13, maxRealm: 15, monster: "wild_wugong"  },
        { minRealm: 14, maxRealm: 15, monster: "wild_moxiu"   },
        { minRealm: 13, maxRealm: 15, monster: "wild_huolang" },
        { minRealm: 16, maxRealm: 17, monster: "wild_sanxiu_jie" },
        { minRealm: 16, maxRealm: 18, monster: "wild_yaoxiu" },
        { minRealm: 17, maxRealm: 18, monster: "wild_jiaolong" },
        { minRealm: 18, maxRealm: 18, monster: "wild_moxiu_jie" },
        { minRealm: 19, maxRealm: 20, monster: "wild_sanxiu_yuan" },
        { minRealm: 20, maxRealm: 21, monster: "wild_yaowang_qinwei" },
        { minRealm: 21, maxRealm: 21, monster: "wild_guixu_shou" },
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
            id: "hunt_shashen", name: "魔修弃营", reqRealm: 14,
            teaser: "魔道六宗入境后遗弃的一处联络营垒——守备虽撤，留下的凶徒与禁制仍在。",
            waves: ["wild_moxiu", "moyan_disciple", "wild_huolang"],
            reward: {
                equip: ["artifact_zimu_complete", "artifact_zhetian", "artifact_tayun"],
                materials: [{ id: "tianhuo_crystal", qty: 1 }, { id: "beast_soul", qty: 2 }],
                stones: [400, 800],
                text: "营垒地宫石门轰开——魔修们来不及带走的重宝，静静躺在祭坛之上。",
            },
        },
        {
            id: "hunt_luanxing", name: "乱星海·妖修巢", reqRealm: 16,
            teaser: "碎星海深处妖修盘踞的浮岛群。此处妖物已开灵智、结丹有望，是结丹修士真正的磨刀石。",
            waves: ["wild_yaoxiu", "wild_sanxiu_jie", "wild_jiaolong"],
            reward: {
                equip: ["artifact_zimu_complete", "artifact_zhetian", "artifact_tayun"],
                materials: [{ id: "tianhuo_crystal", qty: 2 }, { id: "beast_soul", qty: 2 }],
                stones: [1200, 2400],
                text: "妖修巢穴尽数踏平。你在巢心密室翻出几件被妖修当作压岛之宝的器物。",
            },
        },
        {
            id: "hunt_yaowang_chao", name: "乱星海·妖王潮都", reqRealm: 19,
            teaser: "乱星海妖族共主的潮都深藏于漩涡之下。妖王座下亲卫如云，赤霄妖王沉睡于珊瑚王座——元婴修士真正的试炼场。",
            waves: ["luanxing_vanguard", "xingque_vanguard", "yaowang_chixiao"],
            reward: {
                equip: ["artifact_zimu_complete", "artifact_zhetian"],
                materials: [{ id: "tianhuo_crystal", qty: 2 }, { id: "yinhun_zhong", qty: 1 }],
                stones: [1500, 3000],
                text: "妖王潮都崩塌。你在王座残骸中翻出妖王珍藏的极品法器，与一函以妖血写就的功法残页。",
            },
        },
        {
            id: "hunt_guixu", name: "归墟古渊", reqRealm: 20,
            teaser: "大陆极东的归墟古渊，万水归处，亦是万法尽头。渊底沉眠着归墟之眼——传说见过它真容者，无一生还。",
            waves: ["wild_guixu_shou", "guixu_guard", "guixu_guard", "guixu_zhiyan"],
            reward: {
                equip: ["artifact_zimu_complete", "artifact_zhetian", "artifact_tayun"],
                materials: [{ id: "tianhuo_crystal", qty: 3 }, { id: "beast_soul", qty: 3 }, { id: "yinhun_zhong", qty: 2 }],
                stones: [2000, 4000],
                text: "归墟之眼阖目。渊底秘窟洞开，极品法器与稀世材料散落其中，尽归你手。",
            },
        },
    ],
    byId: function (id) {
        for (var i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i];
        return null;
    },
};

/* ——————— ④ 路途奇遇池（元婴专属，轻量直接给） ——————— */
GAME.DATA.MAP_WONDERS = {
    chance: 0.22,          // 元婴赶路时触发奇遇的概率
    pool: [
        { id: "relic",  chance: 0.22, label: "古修遗蜕" },
        { id: "art",    chance: 0.18, label: "前辈残魂授艺" },
        { id: "herb",   chance: 0.18, label: "万年灵药" },
        { id: "stones", chance: 0.16, label: "灵脉矿脉" },
        { id: "trap",   chance: 0.16, label: "陷落幻阵" },
        { id: "empty",  chance: 0.10, label: "空手而回" },
    ],
    relics: ["artifact_zimu_complete", "artifact_zhetian", "artifact_tayun"],
};

/* 洞口标记物（副本入口信物，防误入） */
GAME.DATA.ITEMS.hunt_token = {
    id: "hunt_token", name: "兽皮舆图", type: "material", quality: "上品", price: 50,
    desc: "猎户手绘的兽皮图，标着几处「有怪物、有宝货」的去处。循图可至狩猎之地。",
};
