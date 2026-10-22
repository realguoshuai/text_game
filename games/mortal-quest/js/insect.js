/* =========================================================
 * js/insect.js —— 筑基篇：异虫繁育 · 噬金虫群（三阶培育线）
 *
 * 【获取线】奇虫卵：黑市轮换 / 秘境游历·苍南谷虫巢 / 古修遗迹宝箱；
 *   金石矿料：野副本、黑市；天火晶（王化用）：黑市、魔修、野副本。
 * 【绿液浸泡孵化】承露瓶绿液 ×2 稀释浸泡奇虫卵 → 噬金虫幼虫。
 * 【吞金石进阶】喂食金石矿料 ×3 → 噬金虫成虫。
 * 【天火王化】成虫 ＋ 天火晶 ×1 ＋ 灵石 500 → 噬金虫王（腐蚀大幅增强）。
 * 【战斗协同】斗法时释放噬金虫云，无视目标护体灵光，每回合持续融毁
 *   敌方护盾与防御法器耐久（combat.corrode 由 combat.js 调用；虫王效果翻倍）。
 * 本文件在数据层之后加载，扩充 GAME.DATA.*，不动原数据文件。
 * （傀儡相关已移至 js/puppet.js）
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.DATA = GAME.DATA || {};
GAME.DATA.ITEMS = GAME.DATA.ITEMS || {};

/* —— 新增物品：虫卵 / 金石 / 噬金虫（幼虫→成虫→虫王） —— */
GAME.DATA.ITEMS.chong_egg     = { name: "奇虫卵",   type: "material", quality: "灵品", price: 800, desc: "苍南谷奇虫所遗之卵，色作青玉、内里温热，需承露瓶绿液稀释浸泡方可催孵。奇虫卵可在黑市、秘境游历与古修遗迹中寻得。" };
GAME.DATA.ITEMS.jinshi        = { name: "金石矿料", type: "material", quality: "灵品", price: 20,  desc: "含灵金属矿料，噬金虫的最爱，亦是多味丹药辅材。野副本、黑市可得。" };
GAME.DATA.ITEMS.shijin_larva  = { name: "噬金虫幼虫", type: "insect", quality: "灵品", atk: 3,  price: 300, desc: "甲壳未坚，然啃噬金属如嚼豆。喂食金石矿料可促其蜕壳进阶。" };
GAME.DATA.ITEMS.shijin_adult  = { name: "噬金虫（成虫）", type: "insect", quality: "上品", atk: 10, price: 1500, desc: "成虫百炼成金，虫云蔽日可蚀法宝。斗法时放出可无视护体灵光、持续融毁敌盾。" };
GAME.DATA.ITEMS.shijin_king   = { name: "噬金虫王", type: "insect", quality: "极品", atk: 25, price: 4000, desc: "虫群之王，甲壳泛金、口器如剪。虫云所过，法宝护罩寸寸崩解，是魔道终局之倚仗。" };

GAME.DATA.ITEMS.lingchong_egg = { name: "本命灵虫卵", type: "insect", quality: "极品", price: 3000, desc: "元婴妖王巢穴深处的灵虫之卵，通体泛金、内蕴一缕灵识。元婴修士可以精血为契将其孵育为本命伴生灵虫——同生共死，斗法时每回合自动噬咬助你，并可循幼虫→成虫→虫王三阶成长。卵自元婴副本【妖王潮都】【归墟古渊】通关拾得。" };

/* —— 培育线配方（供 UI 展示与逻辑校验共用，改数值只改一处） —— */
GAME.DATA.INSECT = {
    HATCH:  { liquid: 2 },                        // 卵 → 幼虫：绿液 2 滴
    EVOLVE: { jinshi: 3 },                        // 幼虫 → 成虫：金石矿料 ×3
    ASCEND: { tianhuo_crystal: 1, stones: 500 },  // 成虫 → 虫王：天火晶 ×1 ＋ 灵石 500
};

/* —— 本命灵虫契约配置（元婴伴生兽，3.5）：契约门禁 + 三阶噬咬加成 + 进阶消耗 —— */
GAME.DATA.SPIRIT_INSECT = {
    gate: 19,                                       // 元婴（index 19）方可精血立契
    tiers: [
        { name: "幼虫", bite: 0.15 },               // tier 1：每回合按自身攻势 ×0.15 噬咬
        { name: "成虫", bite: 0.30 },               // tier 2
        { name: "虫王", bite: 0.50 },               // tier 3：附带撕甲（削敌防御）
    ],
    advance: {
        1: { jinshi: 5 },                           // 幼 → 成：金石矿料 ×5
        2: { tianhuo_crystal: 2, stones: 2000 },    // 成 → 王：天火晶 ×2 ＋ 灵石 2000
    },
};

GAME.Insect = {

    // ---------- 绿液稀释浸泡孵化（卵 → 幼虫） ----------
    hatch: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        if (GAME.State.countItem("chong_egg") < 1) { GAME.UI.log("你手头没有奇虫卵。可往黑市求购，或于秘境游历、古修遗迹中寻「苍南谷虫巢」遗卵。", "system"); return; }
        var need = GAME.DATA.INSECT.HATCH.liquid;
        if ((p.liquid || 0) < need) { GAME.UI.log("承露瓶绿液不足——孵化一卵需 " + need + " 滴稀释浸泡（现有 " + (p.liquid || 0) + " 滴，静置每满一年凝一滴）。", "system"); return; }
        GAME.State.removeItem("chong_egg", 1);
        p.liquid -= need;
        GAME.State.addItem("shijin_larva", 1);
        GAME.UI.log("绿液浸润虫卵，卵壳应声而裂——一尾噬金虫幼虫蠕动而出，逢金便啃！", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 吞金石进阶（幼虫 → 成虫） ----------
    evolve: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        if (GAME.State.countItem("shijin_larva") < 1) { GAME.UI.log("你尚无噬金虫幼虫可喂。", "system"); return; }
        var need = GAME.DATA.INSECT.EVOLVE.jinshi;
        if (GAME.State.countItem("jinshi") < need) { GAME.UI.log("进阶成虫需 " + need + " 份金石矿料喂养（现有 " + GAME.State.countItem("jinshi") + "）。野副本、黑市可得。", "system"); return; }
        GAME.State.removeItem("shijin_larva", 1);
        GAME.State.removeItem("jinshi", need);
        GAME.State.addItem("shijin_adult", 1);
        GAME.UI.log("噬金虫吞尽金石，甲壳百炼成金、口器锋锐如剪——进化为成虫！自此斗法可放虫云蚀敌法宝。", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 王化（成虫 → 噬金虫王） ----------
    ascend: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        if (GAME.State.countItem("shijin_adult") < 1) { GAME.UI.log("尚无噬金虫成虫，虫王无从谈起。", "system"); return; }
        var c = GAME.DATA.INSECT.ASCEND;
        if (GAME.State.countItem("tianhuo_crystal") < c.tianhuo_crystal) {
            GAME.UI.log("王化需天火晶 ×" + c.tianhuo_crystal + " 淬炼虫身（现有 " + GAME.State.countItem("tianhuo_crystal") + "）。天火晶可自黑市、魔修尸身或野副本拾得。", "system"); return;
        }
        if ((p.spiritStones || 0) < c.stones) { GAME.UI.log("王化需灵石 " + c.stones + " 供其吞食（现有 " + (p.spiritStones || 0) + "）。", "system"); return; }
        GAME.State.removeItem("shijin_adult", 1);
        GAME.State.removeItem("tianhuo_crystal", c.tianhuo_crystal);
        p.spiritStones -= c.stones;
        GAME.State.addItem("shijin_king", 1);
        GAME.UI.log("天火晶入巢，虫群争食、层层叠叠结成一团金色甲壳——【噬金虫王】破壳而出！虫云所至，法宝护罩寸寸崩解。", "success");
        if (GAME.Codex) GAME.Codex.unlockItem("shijin_king");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 斗法释放噬金虫云（标记 combat.insectCloud，虫王更强） ----------
    release: function () {
        var p = GAME.State.p();
        if (p.isDead || !p.combat) { GAME.UI.log("非斗法之时，噬金虫群无从释放。", "system"); return; }
        var hasKing = GAME.State.countItem("shijin_king") > 0;
        if (!hasKing && GAME.State.countItem("shijin_adult") < 1) {
            GAME.UI.log("你尚无成虫或虫王可放。先在灵宠/傀儡页孵化培育噬金虫。", "system");
            return;
        }
        p.combat.insectCloud = hasKing ? "king" : true;
        if (hasKing) {
            GAME.UI.log("噬金虫王振翅当先，金色虫云轰然罩下——无视护体灵光，直扑【" + p.combat.name + "】法宝，甲壳应声崩裂！", "danger");
        } else {
            GAME.UI.log("你袖口一抖，噬金虫云嗡然涌出——无视护体灵光，直扑【" + p.combat.name + "】法宝而去！", "info");
        }
        GAME.UI.updateUI();
    },

    // ---------- 战斗协同：每回合融毁敌方护盾与防御法器耐久（combat.js 调用） ----------
    corrode: function (combat) {
        if (!combat) return;
        var king = (combat.insectCloud === "king");
        var defCut = king ? 6 : 3;          // 虫王腐蚀更狠
        var durCut = king ? 4 : 2;
        combat.def_ = Math.max(1, combat.def_ - defCut);
        if (combat.durability != null) combat.durability = Math.max(0, combat.durability - durCut);
        GAME.UI.log(king
            ? "噬金虫王领群啃噬，【" + combat.name + "】护体灵光成片剥落，防御崩去一大截！"
            : "噬金虫云噬咬不休，【" + combat.name + "】护盾灵光被蚀去一层，防御已损。", "info");
    },

    /* ================= 本命灵虫契约（元婴伴生兽，3.5） ================= */

    // 当前是否已契有本命灵虫
    spiritInsect: function () {
        var p = GAME.State.p();
        return p.spiritInsect || null;
    },
    // 阶名（tier 1/2/3 → 幼虫/成虫/虫王）
    tierName: function (t) {
        var cfg = GAME.DATA.SPIRIT_INSECT || {};
        var tier = (cfg.tiers || [])[t - 1];
        return tier ? tier.name : "";
    },
    // 每回合噬咬加成系数
    biteOf: function (t) {
        var cfg = GAME.DATA.SPIRIT_INSECT || {};
        var tier = (cfg.tiers || [])[t - 1];
        return tier ? tier.bite : 0;
    },
    // 进阶到下一阶的消耗（null = 已极巅）
    advanceCost: function (t) {
        return (GAME.DATA.SPIRIT_INSECT.advance || {})[t] || null;
    },
    // 能否契约
    canContract: function () {
        var p = GAME.State.p();
        if (p.spiritInsect) return { ok: false, msg: "你已有一头本命灵虫伴生，一心难容二主。" };
        if ((p.realmIndex || 0) < GAME.DATA.SPIRIT_INSECT.gate) return { ok: false, msg: "非元婴修为，灵虫不肯认主——元婴后方可以精血立契。" };
        if (GAME.State.countItem("lingchong_egg") < 1) return { ok: false, msg: "你手头没有本命灵虫卵（可自元婴副本【妖王潮都】【归墟古渊】通关拾得）。" };
        return { ok: true };
    },
    // 精血立契：耗一枚灵虫卵，绑定本命伴生灵虫（tier 1 幼虫）
    contract: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        var chk = this.canContract();
        if (!chk.ok) { GAME.UI.log(chk.msg, "system"); GAME.UI.updateUI(); return; }
        GAME.State.removeItem("lingchong_egg", 1);
        p.spiritInsect = { tier: 1, name: "本命灵虫" };
        GAME.UI.log("你割破指尖，一滴精血落在灵虫卵上——卵壳应声而裂，一尾通体泛金的幼虫吮血而出，与你识海隐隐相连。从此它便是你的【本命灵虫】，同生共死、斗法协同！", "success");
        GAME.UI.log("【契约】喂食金石矿料可促其蜕壳（幼虫→成虫），天火晶可助其王化（成虫→虫王）。斗法时它每回合自动噬咬助你。", "info");
        if (GAME.Codex) GAME.Codex.unlockItem("lingchong_egg");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },
    // 进阶：幼虫→成虫→虫王，逐阶消耗
    advance: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        if (!p.spiritInsect) { GAME.UI.log("你尚无本命灵虫可供进阶。", "system"); return; }
        var t = p.spiritInsect.tier || 1;
        var cost = this.advanceCost(t);
        if (!cost) { GAME.UI.log("你的本命灵虫已至虫王极巅，无需再进。", "system"); return; }
        if (cost.jinshi && GAME.State.countItem("jinshi") < cost.jinshi) { GAME.UI.log("进阶需金石矿料 ×" + cost.jinshi + " 喂养（现有 " + GAME.State.countItem("jinshi") + "）。", "system"); return; }
        if (cost.tianhuo_crystal && GAME.State.countItem("tianhuo_crystal") < cost.tianhuo_crystal) { GAME.UI.log("王化需天火晶 ×" + cost.tianhuo_crystal + " 淬炼虫身（现有 " + GAME.State.countItem("tianhuo_crystal") + "）。", "system"); return; }
        if (cost.stones && (p.spiritStones || 0) < cost.stones) { GAME.UI.log("王化需灵石 " + cost.stones + " 供其吞食（现有 " + (p.spiritStones || 0) + "）。", "system"); return; }
        if (cost.jinshi) GAME.State.removeItem("jinshi", cost.jinshi);
        if (cost.tianhuo_crystal) GAME.State.removeItem("tianhuo_crystal", cost.tianhuo_crystal);
        if (cost.stones) p.spiritStones -= cost.stones;
        p.spiritInsect.tier = t + 1;
        GAME.UI.log("本命灵虫吞尽资粮，甲壳层层蜕变、灵识大涨——进阶为【" + this.tierName(p.spiritInsect.tier) + "】！斗法协同更凶狠。", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },
    // 战斗协同：每回合自动噬咬（combat.attack 调用），按 tier 加成；虫王附带撕甲
    spiritBite: function (combat) {
        if (!combat) return 0;
        var p = GAME.State.p();
        if (!p.spiritInsect) return 0;
        var t = p.spiritInsect.tier || 1;
        var s = (GAME.State.getStats) ? GAME.State.getStats() : {};
        var base = Math.max(1, Math.round((s.atk || 0) * this.biteOf(t)));
        combat.hp -= base;
        if (t >= 3) {
            var cut = Math.min(8, Math.max(1, Math.round(combat.def_ * 0.08)));
            combat.def_ = Math.max(1, combat.def_ - cut);
            GAME.UI.log("虫王当先，金色虫影一口噬下——【" + combat.name + "】甲壳被撕去一角（防御 -" + cut + "），创伤 " + base + " 点！", "info");
        } else {
            GAME.UI.log("本命灵虫自袖中疾扑而出，张口咬住【" + combat.name + "】，再添 " + base + " 点创伤！", "info");
        }
        return base;
    },
};
