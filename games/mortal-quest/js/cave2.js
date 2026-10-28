/* =========================================================
 * js/cave2.js —— 筑基篇：洞府 2.0（独辟灵峰 · 护山大阵 · 地火丹房）
 *
 * 突破筑基后脱离杂役，拜入内门主峰获封「师叔」：
 * 【月俸】每月自动发放中阶灵石（本作以灵石计），筑基后逐月入账。
 * 【灵脉选址】消耗灵石租赁中品/上品灵峰，提升挂机修为转化与药田产出。
 * 【颠倒五行阵残阵】被动御敌：魔修/散修潜入洞府时阵法自动反制并缴获储物袋。
 * 【地火丹房】解锁二阶丹方（展金丹/元灵丹/降尘丹），扩充 ALCHEMY 配方。
 * 本文件在数据层之后加载，扩充 GAME.DATA.ALCHEMY 不动原文件。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.DATA = GAME.DATA || {};
GAME.DATA.ITEMS = GAME.DATA.ITEMS || {};
GAME.DATA.ALCHEMY = GAME.DATA.ALCHEMY || {};

/* —— 二阶丹药（筑基期精进修为丹） —— */
/* 注：三丹的完整属性（含抗药性所需的境界带 realmBand 与降尘丹突破减伤）以
 * data/items_foundation.js 为准；此处沿用同一套字段，避免旧加载顺序覆盖。 */
GAME.DATA.ITEMS.pill_zhanjin = {
    id: "pill_zhanjin", name: "展金丹", type: "pill", quality: "上品", price: 320,
    use: { exp: 60 }, realmBand: [13, 15],
    desc: "二阶丹药，筑基前期（一至三层）精进修为（+60 修为）。久服生抗，六枚后药力减半，十枚后经脉麻木。",
};
GAME.DATA.ITEMS.pill_yuanling = {
    id: "pill_yuanling", name: "元灵丹", type: "pill", quality: "极品", price: 900,
    use: { exp: 150 }, realmBand: [16, 18],
    desc: "二阶上丹，须三百年以上灵药催熟方可成丹。筑基中期（四至六层）精进修为（+150 修为）。",
};
GAME.DATA.ITEMS.pill_jiangchen = {
    id: "pill_jiangchen", name: "降尘丹", type: "pill", quality: "上品", price: 800,
    use: { mind: 3 }, breakthrough: { failDmgMul: 0.2 },
    desc: "筑基后期冲关圣药。突破关口前服下，反噬伤害降低 80%，并可稳住灵台（心境 +3）。",
};

/* —— 地火丹房二阶丹方（需筑基 + 灵峰丹房才可见） —— */
GAME.DATA.ALCHEMY.recipes2 = [
    { id: "pill_zhanjin",   name: "展金丹", realmNeed: 13, herbs: { herb_bainian: 3, jinshi: 1 }, months: 2 },
    { id: "pill_yuanling",  name: "元灵丹", realmNeed: 16, herbs: { herb_xuanbing: 1, beast_soul: 1 }, months: 3 },
    { id: "pill_jiangchen", name: "降尘丹", realmNeed: 13, herbs: { herb_bainian: 2, tianhuo_crystal: 1 }, months: 2 },
];

/* —— 灵峰租赁档位：meditMul 修为转化倍率，gardenMul 药田生长倍率（乘每月药龄，不乘收获株数） —— */
GAME.DATA.LINGFENG = [
    { id: "low",  name: "杂役旧洞", rent: 0,    meditMul: 1.0, gardenMul: 1.0 },
    { id: "mid",  name: "中品灵峰", rent: 200,  meditMul: 1.5, gardenMul: 1.5 },
    { id: "high", name: "上品灵峰", rent: 600,  meditMul: 2.0, gardenMul: 2.0 },
];

/* —— 护山大阵（颠倒五行阵残阵）档位：repelChance 反制潜入者概率 —— */
GAME.DATA.FORMATIONS = [
    { id: "none",  name: "无阵",           cost: 0,   repelChance: 0 },
    { id: "wuxing",name: "颠倒五行阵残阵", cost: 300, repelChance: 0.5 },
    { id: "dawan", name: "大五行阵（补全）", cost: 900, repelChance: 0.8 },
    /* 周天星斗大阵：寰尘岛上的上古遗物（where 决定布阵地点）。
     * upkeep = 月耗灵石（阵法持续耗养，养不起则阵散）；
     * seclude = 可行「阵法长关」——心境增速翻快，且闭关期间外敌不得扰。 */
    { id: "zhouxing", name: "周天星斗大阵", cost: 3000, repelChance: 0.95, upkeep: 20, where: "huanchen", seclude: true },
];

/* 地磁灵山（阶段二 · 开宗立派）：碎星海深处一条自生地磁的古灵脉。
 * 元婴之辈于此立下山门，地磁自此为你所承：
 *   upkeepMul  阵法月耗减半（地磁稳阵，阵旗不虚耗）
 *   stipend    每月门派供奉灵石（山门聚气，门下与过路客的香火）
 *   herbs      每月附赠百年灵药（灵山自产）
 *   repelBonus 护山大阵反制率 +5%（地磁增幅，上限 0.99）
 * 对应原著「元磁神山·立派之基」，已去名著化。 */
GAME.DATA.LINGSHAN = {
    reqRealm: 19,           // 元婴初期
    cost: 5000,
    upkeepMul: 0.5,
    stipend: 30,
    herbs: 1,
    repelBonus: 0.05,
};

GAME.Cave2 = {

    // ---------- 拜入内门：获封师叔，开启月俸 ----------
    joinInnerSect: function () {
        var p = GAME.State.p();
        if (p.isDead) return;
        if (p.realmIndex <= GAME.DATA.ZHUJI_GATE_INDEX) { GAME.UI.log("练气弟子无缘内门——先筑基，再谈师叔之位。", "system"); return; }
        if (p.innerSect) { GAME.UI.log("你已是内门师叔。", "system"); return; }
        p.innerSect = true;
        p.sectId = p.sectId || "huangfenggu";
        GAME.UI.log("掌门亲授玉牌——你自此脱离杂役，拜入内门主峰，获封【师叔】！每月月俸照例发放。", "success");
        GAME.UI.updateUI();
    },

    // ---------- 月俸结算（由 passTime 每月调用一次） ----------
    grantStipend: function () {
        var p = GAME.State.p();
        if (!p.innerSect || p.isDead) return 0;
        var amount = 10;   // 每月 10 枚灵石月俸（师叔例银）
        p.spiritStones += amount;
        p.stipendMonths = (p.stipendMonths || 0) + 1;
        // 筑基月俸附带基础材料：百年灵木 ×1 + 玄铁矿石 ×1（宗门器堂例给，练气内门无此例）
        if (p.realmIndex >= 13) {
            GAME.State.addItem("spirit_wood", 1);
            GAME.State.addItem("iron_ore", 1);
        }
        return amount;
    },

    /* ---------- 灵脉产出：灵峰自行吐纳，按月结算灵石与灵草（挂机收益） ----------
     * 中品灵峰：每月 15 灵石 + 百年灵药 ×1；上品灵峰：每月 30 灵石 + 百年灵药 ×2。
     * 杂役旧洞（low）无灵脉产出；仅在已租赁灵峰（p.peak 为 mid/high）时生效。
     */
    grantVeinOutput: function (months) {
        var p = GAME.State.p();
        var peak = null;
        GAME.DATA.LINGFENG.forEach(function (f) { if (f.id === p.peak) peak = f; });
        if (!peak || peak.id === "low") return;
        var stonePer = peak.id === "mid" ? 15 : 30;
        var herbPer = peak.id === "mid" ? 1 : 2;
        var totalStone = 0, totalHerb = 0;
        for (var i = 0; i < months; i++) {
            p.spiritStones += stonePer;
            totalStone += stonePer;
            GAME.State.addItem("herb_bainian", herbPer);
            totalHerb += herbPer;
        }
        GAME.UI.log("灵峰灵脉自行吐纳——本批得灵石 " + totalStone + "、百年灵药 ×" + totalHerb +
            "（每月 " + stonePer + " 灵石 / 百年灵药 ×" + herbPer + "）。", "success");
    },

    /* ---------- 承露瓶催熟灵木幼苗：耗 1 滴绿液 → 百年灵木 ×3 ----------
     * 与催熟灵药同源，但灵木非药材，走独立入口（不计入药田年结）。
     */
    catalyzeWood: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return 0;
        if ((p.liquid || 0) < 1) {
            GAME.UI.log("承露瓶中绿液不足一滴，灵木幼苗催之不动。", "system");
            GAME.UI.updateUI();
            return 0;
        }
        p.liquid -= 1;
        GAME.State.addItem("spirit_wood", 3);
        GAME.UI.log("你滴一滴绿液于灵木幼苗根部——枝干拔节暴长，转瞬百年之材，得【百年灵木】×3。", "loot");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return 3;
    },

    // ---------- 灵脉选址：租赁灵峰 ----------
    rentPeak: function (peakId) {
        var p = GAME.State.p();
        var peak = null;
        GAME.DATA.LINGFENG.forEach(function (f) { if (f.id === peakId) peak = f; });
        if (!peak) return;
        if (p.realmIndex <= GAME.DATA.ZHUJI_GATE_INDEX) { GAME.UI.log("筑基之前，无资格租赁灵峰。", "system"); return; }
        if (p.peak === peakId) { GAME.UI.log("你已身处" + peak.name + "。", "system"); return; }
        if (p.spiritStones < peak.rent) {
            GAME.UI.log("租赁" + peak.name + "需 " + peak.rent + " 枚灵石，囊中羞涩。", "system");
            return;
        }
        // 杂役旧洞（low）是起始默认态，迁往它不算「开辟」事件，不刷日志（避免与高阶灵峰日志连刷）
        if (peakId === "low") {
            p.peak = peakId;
            GAME.UI.updateUI();
            return;
        }
        p.spiritStones -= peak.rent;
        p.peak = peakId;
        // 口径：gardenMul 只乘「每月药龄」（长得快），不乘单垄收获株数——单垄恒定 ×1，故写「药田生长」
        GAME.UI.log("你掷下灵石，独辟" + peak.name + "——灵气如雾，打坐修为转化 ×" + peak.meditMul + "，药田生长 ×" + peak.gardenMul + "。", "success");
        GAME.UI.updateUI();
    },

    // ---------- 护山大阵：布置/升级 ----------
    // 布阵门控唯一出口：canSetFormation 供 UI 与执行读同一份判定
    canSetFormation: function (form) {
        var p = GAME.State.p();
        if (!form) return { ok: false, why: "无此阵。" };
        if (form.where === "huanchen" && !p.huanchen) {
            return { ok: false, why: "周天星斗大阵是寰尘岛上的上古遗物——先寻到那座岛。" };
        }
        if (p.formation === form.id) return { ok: false, why: "此阵已布。" };
        if (p.spiritStones < form.cost) {
            return { ok: false, why: "布置" + form.name + "需 " + form.cost + " 枚灵石。" };
        }
        return { ok: true, why: "" };
    },

    setFormation: function (formId) {
        var p = GAME.State.p();
        var form = null;
        GAME.DATA.FORMATIONS.forEach(function (f) { if (f.id === formId) form = f; });
        if (!form) return;
        if (p.realmIndex <= GAME.DATA.ZHUJI_GATE_INDEX) { GAME.UI.log("筑基之前，护山大阵无从谈起。", "system"); return; }
        var chk = this.canSetFormation(form);
        if (!chk.ok) { GAME.UI.log(chk.why, "system"); return; }
        p.spiritStones -= form.cost;
        p.formation = formId;
        GAME.UI.log("阵旗插遍灵峰八方——【" + form.name + "】轰然启动，被动御敌（反制率 " + Math.round(form.repelChance * 100) + "%）！", "success");
        GAME.UI.updateUI();
    },

    // ---------- 大阵查询 ----------
    formationDef: function (formId) {
        var list = GAME.DATA.FORMATIONS || [], f = null;
        for (var i = 0; i < list.length; i++) if (list[i].id === formId) f = list[i];
        return f;
    },
    activeFormation: function () {
        var p = GAME.State.p();
        return this.formationDef(p.formation || "none");
    },

    // ---------- 寰尘岛：碎星海深处的隐秘灵岛（周天星斗大阵的所在） ----------
    atStarSea: function () {
        var p = GAME.State.p();
        // 碎星海节点白名单（元婴期 chapterOf 已归元婴篇，不能再用 chapter 反推）
        return ["luanxing_hai", "xingque_neihai", "luanxing_zongtan", "yaoshou_haiyan"].indexOf(p.location) >= 0;
    },
    canUnlockHuanchen: function () {
        var p = GAME.State.p();
        if (p.huanchen) return { ok: false, why: "你已在寰尘岛上。" };
        if (p.realmIndex < 18) return { ok: false, why: "结丹后期方有横渡万里、寻访荒岛的手段。" };
        if (!this.atStarSea()) return { ok: false, why: "寰尘岛在碎星海深处——先抵达碎星海。" };
        if (p.spiritStones < 2000) return { ok: false, why: "寻岛与落脚需灵石 2000 枚，囊中羞涩。" };
        return { ok: true, why: "" };
    },
    unlockHuanchen: function () {
        var p = GAME.State.p();
        var chk = this.canUnlockHuanchen();
        if (!chk.ok) { GAME.UI.log("寰尘岛不可得——" + chk.why, "system"); return false; }
        p.spiritStones -= 2000;
        p.huanchen = true;
        GAME.UI.log("你在碎星海面遍寻无果，直到某夜神识扫过一片浮沙——沙下有石，石下有岛。你踏上寰尘岛的一刻，脚下尘土自行排开。", "success");
        if (GAME.Chronicle) GAME.Chronicle.narrate("huanchen_island", p);
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 阵法月耗：阵法持续耗养灵石，养不起则阵散（地磁灵山立派后减半） ----------
    tickUpkeep: function (months) {
        var p = GAME.State.p();
        var form = this.activeFormation();
        if (!form || !form.upkeep) return true;
        var cost = Math.ceil(form.upkeep * this.upkeepMul() * months);
        if (p.spiritStones >= cost) {
            p.spiritStones -= cost;
            return true;
        }
        // 养不起：扣光余资，阵法崩散
        p.spiritStones = 0;
        p.formation = "none";
        GAME.UI.log("阵旗上的灵石耗尽——【" + form.name + "】失了依托，阵光涣散，悄然崩散！", "danger");
        return false;
    },

    // ---------- 魔修/散修潜入：阵法自动反制 ----------
    repelIntruder: function () {
        var p = GAME.State.p();
        var form = this.activeFormation();
        var chance = this.effectiveRepel();
        if (!chance) return false;
        if (Math.random() < chance) {
            var loot = 20 + GAME.Combat.rand(10, 40);   // 缴获储物袋里的灵石
            p.spiritStones += loot;
            GAME.UI.log("夜半阵光暴涨——【" + form.name + "】自动反制，一名魔修被颠乱五行困于阵中！其储物袋被你缴获，得灵石 " + loot + " 枚。", "success");
            return true;
        }
        return false;
    },

    // ---------- 地火丹房：筑基二阶丹方可炼判定 ----------
    canRecipe2: function (recipe) {
        var p = GAME.State.p();
        return p.realmIndex >= (recipe.realmNeed || 13);
    },

    /* ---------- 地磁灵山 · 开宗立派（元婴篇） ---------- */
    // 立派校验：元婴 + 身在碎星海 + 灵石 5000（与寰尘岛平行，不占传送阵线）
    canFoundSect: function () {
        var p = GAME.State.p();
        var L = GAME.DATA.LINGSHAN;
        if (p.lingShan && p.lingShan.founded) return { ok: false, why: "你已在此立派，山门即根，无须再择地。" };
        if (p.realmIndex < L.reqRealm) return { ok: false, why: "元婴初期方有开宗立派的底气——结丹之辈，无人肯来投。" };
        if (!this.atStarSea()) return { ok: false, why: "地磁灵山在碎星海深处——先抵达那片海域。" };
        if (p.spiritStones < L.cost) return { ok: false, why: "开山立派、铸山门、安置门下，需灵石 " + L.cost + " 枚。" };
        return { ok: true, why: "" };
    },
    foundSect: function () {
        var p = GAME.State.p();
        var chk = this.canFoundSect();
        if (!chk.ok) { GAME.UI.log("立派不可行——" + chk.why, "system"); return false; }
        var L = GAME.DATA.LINGSHAN;
        p.spiritStones -= L.cost;
        p.lingShan = { founded: true, fame: 0, months: 0 };
        GAME.UI.log("你在碎星海深处那条古灵脉上落下第一块山门石。地磁自你脚下升起，百里内的灵气都开始向你倾斜——【开宗立派】，自此你是一方之祖。", "success");
        if (GAME.Chronicle) GAME.Chronicle.narrate("lingshan_founded", p);
        GAME.UI.updateUI();
        return true;
    },

    // 门派供奉（挂 passTime，按月）：灵石 + 百年灵药
    sectTribute: function (months) {
        var p = GAME.State.p();
        if (!p.lingShan || !p.lingShan.founded || !months) return 0;
        var L = GAME.DATA.LINGSHAN;
        var stones = L.stipend * months;
        p.spiritStones += stones;
        p.lingShan.fame += months;
        p.lingShan.months = (p.lingShan.months || 0) + months;
        for (var i = 0; i < L.herbs * months; i++) GAME.State.addItem("herb_bainian", 1);
        return stones;
    },

    // 阵法月耗系数（地磁稳阵：已立派则减半；阵散与否仍看灵石够不够）
    upkeepMul: function () {
        var p = GAME.State.p();
        return (p.lingShan && p.lingShan.founded) ? GAME.DATA.LINGSHAN.upkeepMul : 1;
    },

    // 护山大阵反制率（地磁增幅 +5%，上限 0.99）—— repelIntruder 与面板同读此口
    repelBonus: function () {
        var p = GAME.State.p();
        if (!(p.lingShan && p.lingShan.founded)) return 0;
        return GAME.DATA.LINGSHAN.repelBonus;
    },
    effectiveRepel: function () {
        var form = this.activeFormation();
        var base = (form && form.repelChance) || 0;
        if (!base) return 0;                    // 无阵不反制（地磁增幅不凭空生阵）
        return Math.min(0.99, base + this.repelBonus());
    },
};
