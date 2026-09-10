/* =========================================================
 * js/insect.js —— 筑基篇：异虫繁育 · 初阶噬金虫群
 *
 * 【绿液浸泡孵化】消耗承露瓶纯绿液稀释浸泡奇虫卵，得初阶噬金虫群。
 * 【吞噬进阶】喂食多余法器残片（金石矿料），提升虫壳硬度。
 * 【战斗协同】斗法时释放噬金虫云，无视目标护体灵光，每回合持续融毁
 *   敌方护盾与防御法器耐久（combat.corrode 由 combat.js 调用）。
 * 本文件在数据层之后加载，扩充 GAME.DATA.*，不动原数据文件。
 * （傀儡相关已移至 js/puppet.js）
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.DATA = GAME.DATA || {};
GAME.DATA.ITEMS = GAME.DATA.ITEMS || {};

/* —— 新增物品：虫卵 / 金石 / 噬金虫（幼虫→成虫） —— */
GAME.DATA.ITEMS.chong_egg     = { name: "奇虫卵",   type: "material", quality: "灵品", price: 600, desc: "苍南谷奇虫所遗之卵，需灵液方可催孵。" };
GAME.DATA.ITEMS.jinshi        = { name: "金石矿料", type: "material", quality: "灵品", price: 20,  desc: "金属矿料，噬金虫的最爱。" };
GAME.DATA.ITEMS.shijin_larva  = { name: "噬金虫幼虫", type: "insect", quality: "灵品", atk: 3,  price: 300, desc: "甲壳未坚，然啃噬金属如嚼豆。" };
GAME.DATA.ITEMS.shijin_adult  = { name: "噬金虫（成虫）", type: "insect", quality: "上品", atk: 10, price: 1500, desc: "成虫百炼成金，虫云蔽日可蚀法宝。" };

GAME.Insect = {

    // ---------- 绿液稀释浸泡孵化 ----------
    hatch: function () {
        var p = GAME.State.p();
        if (p.isDead) return;
        if (GAME.State.countItem("chong_egg") < 1) { GAME.UI.log("你手头没有奇虫卵。苍南谷虫巢或有遗卵。", "system"); return; }
        if (p.liquid < 2) { GAME.UI.log("承露瓶绿液不足——孵化一卵需 2 滴稀释浸泡。", "system"); return; }
        GAME.State.removeItem("chong_egg", 1);
        p.liquid -= 2;
        GAME.State.addItem("shijin_larva", 1);
        GAME.UI.log("绿液浸润虫卵，卵壳应声而裂——一尾噬金虫幼虫蠕动而出，逢金便啃！", "success");
    },

    // ---------- 吞金石进阶 ----------
    evolve: function () {
        var p = GAME.State.p();
        if (GAME.State.countItem("shijin_larva") < 1) { GAME.UI.log("你尚无噬金虫幼虫可喂。", "system"); return; }
        if (GAME.State.countItem("jinshi") < 3) { GAME.UI.log("进阶成虫需 3 份金石矿料喂养。", "system"); return; }
        GAME.State.removeItem("shijin_larva", 1);
        GAME.State.removeItem("jinshi", 3);
        GAME.State.addItem("shijin_adult", 1);
        GAME.UI.log("噬金虫吞尽金石，甲壳百炼成金、口器锋锐如剪——进化为成虫！", "success");
    },

    // ---------- 斗法释放噬金虫云（标记 combat.insectCloud） ----------
    release: function () {
        var p = GAME.State.p();
        if (p.isDead || !p.combat) { GAME.UI.log("非斗法之时，噬金虫群无从释放。", "system"); return; }
        if (GAME.State.countItem("shijin_adult") < 1) { GAME.UI.log("你尚无成虫虫群可放。", "system"); return; }
        p.combat.insectCloud = true;
        GAME.UI.log("你袖口一抖，噬金虫云嗡然涌出——无视护体灵光，直扑【" + p.combat.name + "】法宝而去！", "info");
    },

    // ---------- 战斗协同：每回合融毁敌方护盾与防御法器耐久（combat.js 调用） ----------
    corrode: function (combat) {
        if (!combat) return;
        // 融毁护盾：削敌方防御（无视护体灵光），每回合小幅持续
        combat.def_ = Math.max(1, combat.def_ - 3);
        // 融毁防御法器耐久：若目标携法器，耐久折损
        if (combat.durability != null) combat.durability = Math.max(0, combat.durability - 2);
        GAME.UI.log("噬金虫云噬咬不休，【" + combat.name + "】护盾灵光被蚀去一层，防御已损。", "info");
    },
};
