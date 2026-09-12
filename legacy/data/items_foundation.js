/* =========================================================
 * data/items_foundation.js —— 筑基期顶阶器物与高阶丹药（数据层）
 *
 * ① 符宝（大杀器）：maxDurability 100，每次施展耗 25 点威能，归零自燃化灰
 *      · 绿煌剑符宝：纯毁灭打击（400%~600% 暴击伤害）
 *      · 落魂钟符宝：高伤 + 2 回合眩晕
 * ② 顶阶法器（多线操控 / 占神识 SP）：
 *      · 金蚨子母刃（完全体）：20 SP，1 母 8 子共 9 重独立穿透伤害
 *      · 遮天钟：15 SP，金钟庇护（免疫一切负面，自身无法出招）
 *      · 踏云靴：移动消耗 -50%，撤退成功率 90%
 * ③ 筑基三丹：展金丹（+60）/ 元灵丹（+150）/ 降尘丹（突破反噬 -80%）
 * ④ 千年灵珍：五百年玄冰花、千年龙鳞果
 * ⑤ 副本与羁绊产物：赤玉蛛卵、凝厚宝典残卷、朱雀环残片、定颜丹、颠倒五行阵残阵
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};
GAME.DATA.ITEMS = GAME.DATA.ITEMS || {};

(function () {
    var I = GAME.DATA.ITEMS;

    /* ——————— ① 符宝 ——————— */
    I.fubao_lvhuang = {
        id: "fubao_lvhuang", name: "绿煌剑符宝", type: "fubao", quality: "极品", price: 3000,
        maxDurability: 100,
        fubao: { dmgMul: [4.0, 6.0], stun: 0, drain: 25 },
        desc: "以符箓封存的一道绿煌剑气。祭起须蓄力一回合（此间闪避尽失），下一回合化作灭世一击（400%~600% 暴击伤害）。每施展一次耗 25 点威能，威能尽时符宝自燃化灰。",
    };
    I.fubao_luohun = {
        id: "fubao_luohun", name: "落魂钟符宝", type: "fubao", quality: "极品", price: 3600,
        maxDurability: 100,
        fubao: { dmgMul: [3.5, 5.5], stun: 2, drain: 25 },
        desc: "落魂钟影凝成的符宝。祭起须蓄力一回合，下一回合钟声荡魂——高倍伤害并令敌眩晕 2 回合。每施展一次耗 25 点威能，威能尽时自燃化灰。",
    };

    /* ——————— ② 顶阶法器 ——————— */
    I.artifact_zimu_complete = {
        id: "artifact_zimu_complete", name: "金蚨子母刃（完全体）", type: "artifact", quality: "极品", price: 2600,
        equip: { atk: 26, speed: 4, spirit: 0 },
        spCost: 20,             // 占用神识 20 点
        multiHit: 9,            // 1 母 8 子共 9 重独立伤害穿透（专克硬甲）
        multiHitRatio: 0.22,    // 每重伤害 = 攻击 ×22%
        desc: "金蚨子母刃十八口合炼而成的完全体，御使须占 20 点神识。出手一母八子共九重独立穿透伤害，硬甲妖兽亦难当其锋。",
    };
    I.artifact_zhetian = {
        id: "artifact_zhetian", name: "遮天钟", type: "artifact", quality: "极品", price: 2400,
        equip: { def: 22, spirit: 0 },
        spCost: 15,             // 占用神识 15 点
        bell: { immuneDebuff: true, cannotAttack: true },
        desc: "巨钟罩体，万法不侵。激活后进入【金钟庇护】：免疫一切负面状态与控制，但自身无法出招——宜与机关傀儡、噬金虫协同耗血。占用神识 15 点。",
    };
    I.artifact_tayun = {
        id: "artifact_tayun", name: "踏云靴", type: "artifact", quality: "上品", price: 1200,
        equip: { speed: 10, def: 3 },
        spCost: 0,
        travel: { moveCostMul: 0.5, fleeBonus: 0.9 },
        desc: "云气托足，行路如飞。大地图移动消耗减半，斗法遁走成功率提升至九成。",
    };

    /* ——————— ③ 筑基三丹（覆写 cave2 二阶丹，统一由 alchemy 抗药性结算） ——————— */
    I.pill_zhanjin = {
        id: "pill_zhanjin", name: "展金丹", type: "pill", quality: "上品", price: 320,
        use: { exp: 60 }, realmBand: [13, 15],
        desc: "二阶丹药，筑基前期（一至三层）精进修为（+60 修为）。久服生抗，六枚后药力减半，十枚后经脉麻木。",
    };
    I.pill_yuanling = {
        id: "pill_yuanling", name: "元灵丹", type: "pill", quality: "极品", price: 900,
        use: { exp: 150 }, realmBand: [16, 18],
        desc: "二阶上丹，须三百年以上灵药催熟方可成丹。筑基中期（四至六层）精进修为（+150 修为）。",
    };
    I.pill_jiangchen = {
        id: "pill_jiangchen", name: "降尘丹", type: "pill", quality: "上品", price: 800,
        use: { mind: 3 }, breakthrough: { failDmgMul: 0.2 },
        desc: "筑基后期冲关圣药。突破关口前服下，反噬伤害降低 80%，并可稳住灵台。",
    };

    /* ——————— ④ 承露瓶千年催熟产物 ——————— */
    I.herb_xuanbing = {
        id: "herb_xuanbing", name: "五百年玄冰花", type: "herb", quality: "极品", price: 1500,
        years: 500,
        desc: "承露瓶以 5 滴绿液催熟而得的五百年寒性灵珍，元灵丹主材，亦是可作拜师礼的重宝。",
    };
    I.herb_longlin = {
        id: "herb_longlin", name: "千年龙鳞果", type: "herb", quality: "极品", price: 5000,
        years: 1000,
        desc: "承露瓶以 10 滴绿液催熟而得的战略级天地灵珍。此物一出，结丹老怪亦会动心。",
    };

    /* ——————— ⑤ 副本 / 羁绊产物 ——————— */
    I.talisman_qianli = {
        id: "talisman_qianli", name: "千里符", type: "talisman", quality: "上品", price: 300,
        desc: "捏碎即化遁光远遁千里。危急关头的保命底牌——亦是觊觎者环伺时的逃生检定之资。",
    };
    I.talisman_danuoyi = {
        id: "talisman_danuoyi", name: "大挪移符", type: "talisman", quality: "极品", price: 1200,
        desc: "上古典籍中记载的挪移符箓，捏碎之瞬身形已易数百里。比千里符更为稳妥的遁走之资。",
    };

    I.xueyu_zhizhu_luan = {
        id: "xueyu_zhizhu_luan", name: "赤玉蛛卵", type: "material", quality: "极品", price: 0,
        desc: "云京皇宫地宫所得稀世异宝，赤玉蛛一族的后裔之卵——灵宠培育之核心。",
    };
    I.ninghou_canjuuan = {
        id: "ninghou_canjuuan", name: "《凝厚宝典》残卷", type: "skill", quality: "极品", price: 0,
        use: { maxHpBonus: 120 },
        desc: "幽冥教主身死所遗残卷。参悟可凝厚真元，气血上限 +120。",
    };
    I.array_wuxing = {
        id: "array_wuxing", name: "颠倒五行阵残阵", type: "material", quality: "极品", price: 900,
        desc: "可布于战地的一方残阵。战前布置，斗法中可【引魔入阵】，直接封印强敌半数属性并打断其吸血。",
    };
    I.zhunque_huan_pian = {
        id: "zhunque_huan_pian", name: "朱雀环残片", type: "material", quality: "极品", price: 0,
        desc: "凌清沅所赠保命底牌。生死关头激发，可代受一次致命之伤。",
    };
    I.dingyan_dan = {
        id: "dingyan_dan", name: "定颜丹", type: "pill", quality: "上品", price: 600,
        use: { mind: 20 },
        desc: "驻颜灵丹。赠予旧情之人可斩断尘缘，心境 +20，彻底免除心魔劫。",
    };
})();
