/* =========================================================
 * data/dungeon_heisha.js —— 阶段核心大副本：云京皇宫 · 夜战幽冥教
 *
 * 第一阶段【皇城夜探与分破血侍】：逐个击破四大血侍（铁罗/苍岚/叶泓/冰妖），
 *   每破一人削弱最终 Boss 的增益光环，并掉落煞丹碎片与高阶灵石。
 * 第二阶段【决战幽冥教主（越皇）】：双阶段战斗状态机
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
        hp: 900, atk: 45, def: 60, speed: 6, spirit: 40, exp: 120,
        stones: [80, 160], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.3],
        loot: [{ id: "shadan_suipian", chance: 1, qty: [1, 2] }, { id: "mid_stone", chance: 0.6, qty: [1, 1] }],
        desc: "一身横练硬功，刀剑难伤——须以穿透之术破其护体。",
    },
    {
        id: "heisha_qingwen", name: "血侍·苍岚", human: true, majorRealm: 1,
        hp: 700, atk: 40, def: 25, speed: 9, spirit: 45, exp: 110,
        stones: [70, 140], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.3],
        loot: [{ id: "shadan_suipian", chance: 1, qty: [1, 2] }, { id: "mid_stone", chance: 0.5, qty: [1, 1] }],
        poisonPlayer: { turns: 3, dmg: 18 },
        desc: "毒功缠身，中者经脉麻痒——速战速决为上。",
    },
    {
        id: "heisha_yehong", name: "血侍·叶泓", human: true, majorRealm: 1,
        hp: 800, atk: 55, def: 30, speed: 14, spirit: 42, exp: 130,
        stones: [90, 180], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.3],
        loot: [{ id: "shadan_suipian", chance: 1, qty: [1, 2] }, { id: "mid_stone", chance: 0.7, qty: [1, 1] }],
        desc: "身法诡谲，出手如电——最忌被其抢了先机。",
    },
    {
        id: "heisha_bingyao", name: "血侍·冰妖", human: true, majorRealm: 1,
        hp: 750, atk: 42, def: 35, speed: 10, spirit: 50, exp: 120,
        stones: [80, 150], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.3],
        loot: [{ id: "shadan_suipian", chance: 1, qty: [1, 2] }, { id: "mid_stone", chance: 0.6, qty: [1, 1] }],
        slowPlayer: { turns: 3, speed: 6 },
        desc: "玄冰之气裹身，中招者气血凝滞、身法迟滞。",
    },
    {
        id: "heisha_yuehuang", name: "幽冥教主·越皇", human: true, majorRealm: 1,
        hp: 3000, atk: 70, def: 40, speed: 12, spirit: 70, exp: 600,
        stones: [400, 800], killChance: 0, loseAge: [0, 0], loseStonePct: [0.3, 0.5],
        // 战役掉落由 HEISHA.reward 统一结算（防止 victory.grantLoot 与副本奖励双重发放）
        loot: [],
        desc: "云国皇帝，实为幽冥教主。真身血炼成性；濒死则血祭狂暴，化作半妖之躯。",
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
