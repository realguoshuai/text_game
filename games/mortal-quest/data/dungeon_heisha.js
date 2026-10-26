/* =========================================================
 * data/dungeon_heisha.js —— 阶段核心大副本：云京皇宫 · 夜战幽冥教
 *
 * 第一阶段【皇城夜探与分破血侍】：逐个击破四大血侍（铁罗/苍岚/叶泓/冰妖），
 *   每破一人削弱最终 Boss 的增益光环，并掉落煞丹碎片与高阶灵石。
 * 第二阶段【地宫甬道·血玉蜘蛛】：赤色蛛网封死寝殿甬道，不斩此蛛入不得地宫。
 * 第三阶段【决战幽冥教主（越皇）】：双阶段战斗状态机
 *   · Phase 1 越皇真身：周期性【混元血炼珠】，造成伤害 100% 转化为自身生命恢复
 *   · Phase 2 黑煞妖魔化：生命降至 30% 触发血祭狂暴，攻击翻倍，获得 80% 全法术抗性
 *   · 战术克制：战前布置【颠倒五行阵残阵】，斗法中可【引魔入阵】，
 *     直接封印 Boss 50% 属性并打断血炼吸血
 * 战役掉落：赤玉蛛卵（必掉，《凝厚宝典》残卷、中阶灵石 ×3）
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};
GAME.DATA.MONSTERS = GAME.DATA.MONSTERS || [];
GAME.DATA.ITEMS = GAME.DATA.ITEMS || {};

/* ——————— 四大血侍与幽冥教主 ——————— */
GAME.DATA.MONSTERS.push(
    {
        id: "heisha_tieluo", name: "血侍·铁罗", human: true, majorRealm: 1,
        hp: 400, atk: 52, def: 34, speed: 6, spirit: 40, exp: 120,
        threatPct: 0.028,
        stones: [80, 160], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.3],
        loot: [{ id: "shadan_suipian", chance: 1, qty: [1, 2] }, { id: "mid_stone", chance: 0.6, qty: [1, 1] }],
        /* 招式：横练硬功 → 硬扛（brace）与重斩交替。硬扛回合别硬拼，等守势散了再上。 */
        moves: [
            { id: "tieluo_quan", name: "崩山拳", weight: 4, mul: 1.0 },
            { id: "tieluo_lie", name: "裂石重斩", weight: 3, mul: 1.8, floorPct: 0.048, cd: 2,
              text: "双臂筋肉暴起，一刀劈落，碎石迸飞——" },
            { id: "tieluo_bi", name: "铁壁横练", weight: 2, kind: "brace", cut: 0.55, cd: 3,
              text: "周身皮肉绷如铁壁，守势大涨" },
        ],
        desc: "一身横练硬功，刀剑难伤——硬扛之后那一记裂石重斩，才是要命的。",
    },
    {
        id: "heisha_qingwen", name: "血侍·苍岚", human: true, majorRealm: 1,
        hp: 380, atk: 50, def: 25, speed: 9, spirit: 45, exp: 110,
        threatPct: 0.030,
        stones: [70, 140], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.3],
        loot: [{ id: "shadan_suipian", chance: 1, qty: [1, 2] }, { id: "mid_stone", chance: 0.5, qty: [1, 1] }],
        /* 招式：毒是主菜——拖得越久越亏，须抢在他第二次放雾前打完。
         * （旧的 poisonPlayer 字段从未被战斗内核读取，等于假的；现在统一走 moves 的 dot） */
        moves: [
            { id: "qingwen_zhang", name: "阴毒掌", weight: 4, mul: 1.0 },
            { id: "qingwen_wu", name: "蚀骨毒雾", weight: 3, kind: "dot", cd: 3,
              dot: { turns: 3, pct: 0.032, tag: "蚀骨毒雾" },
              text: "袖中青烟漫开，蚀骨毒雾笼罩你周身——" },
            { id: "qingwen_zhen", name: "催命毒针", weight: 2, mul: 1.5, floorPct: 0.040, cd: 2,
              text: "三枚乌针自指缝弹出，专寻经脉要穴——" },
        ],
        desc: "毒功缠身，中者经脉麻痒——拖得越久失血越多，速战速决为上。",
    },
    {
        id: "heisha_yehong", name: "血侍·叶泓", human: true, majorRealm: 1,
        hp: 360, atk: 56, def: 26, speed: 15, spirit: 42, exp: 130,
        threatPct: 0.032,
        stones: [90, 180], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.3],
        loot: [{ id: "shadan_suipian", chance: 1, qty: [1, 2] }, { id: "mid_stone", chance: 0.7, qty: [1, 1] }],
        /* 招式：快剑多段（连环三击吃防御、吃不掉下限）+ 残影躲刀。 */
        moves: [
            { id: "yehong_ci", name: "疾风刺", weight: 4, mul: 1.0 },
            { id: "yehong_lian", name: "连环三击", weight: 3, mul: 0.62, times: 3, floorPct: 0.042, cd: 2,
              text: "身化三道残影，剑光交错而至——" },
            { id: "yehong_ying", name: "残影遁形", weight: 2, kind: "dodge", turns: 2, cd: 3,
              text: "身形一晃，残影犹立原地" },
        ],
        desc: "身法诡谲，出手如电——连环三击防不胜防，残影之中最难取准。",
    },
    {
        id: "heisha_bingyao", name: "血侍·冰妖", human: true, majorRealm: 1,
        hp: 400, atk: 50, def: 28, speed: 10, spirit: 50, exp: 120,
        threatPct: 0.027,
        stones: [80, 150], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.3],
        loot: [{ id: "shadan_suipian", chance: 1, qty: [1, 2] }, { id: "mid_stone", chance: 0.6, qty: [1, 1] }],
        /* 招式：玄冰封脉＝强制停手一回合（复用 exhausted），寒霜吐息＝持续失血。
         * （旧的 slowPlayer 字段同样从未被读取，已改为 moves） */
        moves: [
            { id: "bingyao_ning", name: "玄冰刺", weight: 4, mul: 1.0 },
            { id: "bingyao_feng", name: "玄冰封脉", weight: 2, kind: "freeze", floorPct: 0.022, cd: 5,
              text: "寒气自你足底直窜经脉——" },
            { id: "bingyao_xi", name: "寒霜吐息", weight: 3, kind: "dot", cd: 3,
              dot: { turns: 3, pct: 0.026, tag: "寒霜入体" },
              text: "一口霜白寒气扑面，凝在骨缝里——" },
        ],
        desc: "玄冰之气裹身，中招者气血凝滞——被封住经脉的那一回合，只能挨打。",
    },
    {
        id: "heisha_zhizhu", name: "血玉蜘蛛", human: false, majorRealm: 1,
        hp: 580, atk: 62, def: 22, speed: 11, spirit: 30, exp: 260,
        threatPct: 0.034,
        stones: [120, 240], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.35],
        loot: [{ id: "shadan_suipian", chance: 1, qty: [1, 2] }, { id: "mid_stone", chance: 0.7, qty: [1, 2] }],
        /* 招式：蛛丝持续失血 + 八足冲撞。蛛丝缠身时跑不掉也拖不得。 */
        moves: [
            { id: "zhizhu_ya", name: "毒牙撕咬", weight: 4, mul: 1.0 },
            { id: "zhizhu_si", name: "蛛丝缠身", weight: 3, kind: "dot", cd: 3,
              dot: { turns: 2, pct: 0.030, tag: "蛛丝缠身" },
              text: "一口赤丝兜头罩下，越挣越紧——" },
            { id: "zhizhu_zhuang", name: "八足冲撞", weight: 2, mul: 1.7, floorPct: 0.055, cd: 2,
              text: "八足齐踏石面，整具身躯如攻城锤撞来——" },
        ],
        desc: "盘踞地宫甬道的赤玉巨蛛，蛛丝缠骨、愈挣愈紧——不斩此蛛，越皇寝殿无路可入。",
    },
    {
        id: "heisha_yuehuang", name: "幽冥教主·越皇", human: true, majorRealm: 1,
        hp: 560, atk: 60, def: 34, speed: 12, spirit: 70, exp: 600,
        threatPct: 0.030,
        stones: [400, 800], killChance: 0, loseAge: [0, 0], loseStonePct: [0.3, 0.5],
        // 战役掉落由 HEISHA.reward 统一结算（防止 victory.grantLoot 与副本奖励双重发放）
        loot: [],
        /* 招式：血煞掌（配合混元血炼珠 100% 吸血）+ 幽冥鬼火（持续失血）+ 血炼摄魂（残血重击）。
         * 破解之道不是硬拼，是战前布【颠倒五行阵残阵】→ 斗中【引魔入阵】封去五成属性、断其吸血。 */
        moves: [
            { id: "yuehuang_zhang", name: "血煞掌", weight: 4, mul: 1.0 },
            { id: "yuehuang_huo", name: "幽冥鬼火", weight: 3, kind: "dot", cd: 3,
              dot: { turns: 3, pct: 0.035, tag: "幽冥鬼火" },
              text: "袖袍一拂，几点幽绿鬼火黏上你身——" },
            { id: "yuehuang_lian", name: "血炼摄魂", weight: 3, mul: 1.6, floorPct: 0.060, cd: 2,
              text: "五指虚握，你周身气血竟被生生扯出——" },
        ],
        desc: "云国皇帝，实为幽冥教主。真身血炼成性（所伤尽化为己用）；濒死则血祭狂暴，化作半妖之躯。",
    }
);

/* 煞丹碎片（血侍掉落，幽冥教主增益光环的削弱凭证） */
GAME.DATA.ITEMS.shadan_suipian = {
    id: "shadan_suipian", name: "煞丹碎片", type: "material", quality: "上品", price: 120,
    desc: "血侍体内凝成的血煞之精。每集一枚，越皇的血祭光环便弱一分。",
};

/* ——————— 副本配置 ——————— */
GAME.DATA.HEISHA = {
    id: "heisha",
    title: "云京皇宫 · 夜战幽冥教",
    // 阶段一：四大血侍（id 与 MONSTERS 对应）
    guards: [
        { id: "heisha_tieluo",  name: "血侍·铁罗", hint: "高物防，须以穿透之术破之。" },
        { id: "heisha_qingwen", name: "血侍·苍岚", hint: "毒功缠身，中者每回合失血。" },
        { id: "heisha_yehong",  name: "血侍·叶泓", hint: "身法极快，出手如电。" },
        { id: "heisha_bingyao", name: "血侍·冰妖", hint: "玄冰凝滞，中招者身法大减。" },
    ],
    // 阶段二：地宫甬道·血玉蜘蛛（蛛网封印，须斩之方能入寝殿）
    spider: { id: "heisha_zhizhu", name: "血玉蜘蛛", hint: "甬道狭窄、蛛丝缠身——速杀为上。" },
    boss: "heisha_yuehuang",
    // Boss 双阶段
    phase2: { hpPct: 0.30, atkMul: 2, magicResist: 0.80 },
    // 颠倒五行阵残阵：封印比例与打断吸血
    array: { item: "array_wuxing", sealPct: 0.50 },
    // 每破一血侍，Boss 增益光环削弱比例（攻击/防御各减）
    guardDebuffPer: 0.10,
    reward: {
        loot: [
            { id: "xueyu_zhizhu_luan", qty: 1, must: true },
            { id: "ninghou_canjuuan", qty: 1 },
            { id: "mid_stone", qty: 3 },
            { id: "recipe_xugu", qty: 1 },   // 黑煞战役掉落一张丹方（研习后化入识海）
        ],
        contrib: 200,
        text: "地宫深处血气翻涌。越皇的尸身倒在王座之下，一枚血玉般晶莹的虫卵自其袖中滚落——此乃稀世异宝，灵宠培育之核心。",
    },
};
