/* =========================================================
 * js/bottle.js —— 承露瓶千年催熟与「匹夫无罪，怀璧其罪」老怪觊觎系统
 *
 * ① 千年灵药深层催熟：
 *      · 5 滴纯绿液 → 【五百年玄冰花】（元灵丹主材 / 拜师礼）
 *      · 10 滴纯绿液 → 【千年龙鳞果】（战略级天地灵珍）
 * ② 老怪觊觎度 marketRiskValue（0~100）：
 *      · 坊市/黑市出售 300 年以上药草 +25；千年药草 +60
 *      · ≥80 时离开坊市强制触发【结丹期修士神识锁定】
 * ③ 避险逃生检定：
 *      · 检定 A：已修习高阶【敛气术】且神识达标 → 隐匿气息混入人群脱险
 *      · 检定 B：消耗【千里符】或【大挪移符】强行遁走
 *      · 均不满足：被老怪截杀，玄傀替死断后，损失所有所携灵石与药草逃生
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Bottle = {

    // 灵药年份表（缺省 0 = 年份不明，不触发觊觎）
    YEARS: {
        herb_bainian: 100, herb_qiannian: 1000,
        herb_tianling: 300, herb_yumo: 300, herb_zihou: 300,
        herb_xuanbing: 500, herb_longlin: 1000,
        herb_zihou_guo: 400,
    },

    yearsOf: function (id) {
        if (GAME.DATA.ITEMS[id] && GAME.DATA.ITEMS[id].years != null) return GAME.DATA.ITEMS[id].years;
        return this.YEARS[id] || 0;
    },

    /* ================= ① 千年灵药深层催熟 ================= */
    // kind: "xuanbing"（5 滴 → 五百年玄冰花）/ "longlin"（10 滴 → 千年龙鳞果）
    catalyze: function (kind) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var plan = kind === "longlin"
            ? { drops: 10, item: "herb_longlin" }
            : { drops: 5, item: "herb_xuanbing" };
        if ((p.liquid || 0) < plan.drops) {
            GAME.UI.log("瓶中绿液不足 " + plan.drops + " 滴，催不动这等年份的灵药。", "system");
            GAME.UI.updateUI();
            return false;
        }
        p.liquid -= plan.drops;
        GAME.State.addItem(plan.item, 1);
        var it = GAME.DATA.ITEMS[plan.item];
        GAME.UI.log("你将 " + plan.drops + " 滴绿液尽数倾入药苗——雾气散去，一株【" + it.name + "】赫然成形！（年份 " +
            (it.years || this.yearsOf(plan.item)) + "）", "success");
        if (plan.item === "herb_longlin") {
            GAME.UI.log("此物一出，天地灵机都为之一颤——匹夫无罪，怀璧其罪，切莫轻易示人。", "danger");
        }
        GAME.Core.passTime(1);
        return true;
    },
    canCatalyze: function (kind) {
        var p = GAME.State.p();
        return (p.liquid || 0) >= (kind === "longlin" ? 10 : 5);
    },

    /* ================= ② 老怪觊觎度 ================= */
    risk: function () { return GAME.State.p().marketRiskValue || 0; },

    addRisk: function (n) {
        var p = GAME.State.p();
        p.marketRiskValue = Math.min(100, (p.marketRiskValue || 0) + n);
        if (p.marketRiskValue >= 80 && !p.riskWarned) {
            p.riskWarned = true;
            GAME.UI.log("（坊市一角，一道若有若无的神识自你身上扫过——有人盯上你了。觊觎度 " +
                p.marketRiskValue + "/100）", "danger");
        }
        return p.marketRiskValue;
    },

    // 出售药草时调用：≥300 年 +25；≥1000 年 +60
    onSellHerb: function (id) {
        var years = this.yearsOf(id);
        if (years >= 1000) return this.addRisk(60);
        if (years >= 300) return this.addRisk(25);
        return this.risk();
    },

    /* ================= ③ 危机触发与逃生检定 ================= */
    // 离开坊市时调用：返回 true 表示触发了【结丹期修士神识锁定】
    onLeaveMarket: function () {
        if (this.risk() < 80) return false;
        var p = GAME.State.p();
        GAME.UI.log("【结丹期修士神识锁定】你刚出坊市，一股浩荡神识便自云端压下——" +
            "「小辈，方才那株灵药，从何处得来？」", "danger");
        GAME.UI.log("（可选择：A 以高阶敛气术隐匿气息混入人群｜B 焚【千里符】或【大挪移符】强行遁走）", "warning");
        p.riskHunt = true;
        GAME.UI.updateUI();
        return true;
    },

    // 检定 A 是否可行
    canConceal: function () {
        var p = GAME.State.p();
        var spLimit = GAME.State.spLimit ? GAME.State.spLimit() : 0;
        return (p.concealLevel || 0) >= 2 && spLimit >= 45;
    },
    // 检定 B 是否可行（持有千里符或大挪移符）
    canTalisman: function () {
        return GAME.State.countItem("talisman_qianli") > 0 || GAME.State.countItem("talisman_danuoyi") > 0;
    },

    // 逃生检定：way = "conceal" | "talisman" | null（束手就擒）
    escape: function (way) {
        var p = GAME.State.p();
        if (!p.riskHunt) return true;

        if (way === "conceal" && this.canConceal()) {
            GAME.UI.log("你屏息敛气，《敛气术》运转到极致——周身灵息尽数内敛，混入了熙攘人群之中。" +
                "那道神识扫了三遍，终究一无所获。", "success");
            this._clearHunt(20);
            return true;
        }
        if (way === "talisman" && this.canTalisman()) {
            var used = GAME.State.countItem("talisman_danuoyi") > 0 ? "talisman_danuoyi" : "talisman_qianli";
            GAME.State.removeItem(used, 1);
            GAME.UI.log("你暗中将【" + GAME.DATA.ITEMS[used].name + "】捏碎——符光炸开，身形已在数十里之外！" +
                "那结丹老怪只追得一缕残影。", "success");
            this._clearHunt(30);
            return true;
        }
        // 均不满足：被截杀，玄傀替死断后
        var lostStones = p.spiritStones || 0;
        var herbNames = [];
        for (var id in (p.inventory || {})) {
            if (p.inventory[id] > 0 && GAME.DATA.ITEMS[id] && GAME.DATA.ITEMS[id].type === "herb") {
                herbNames.push(GAME.DATA.ITEMS[id].name + "×" + p.inventory[id]);
                delete p.inventory[id];
            }
        }
        p.spiritStones = 0;
        GAME.UI.log("你终究没能走脱。黑影自天而降，一掌拍碎你的护身灵光——", "danger");
        if (p.companion && p.companion.hp > 0) {
            p.companion.hp = 0;
            GAME.UI.log("【玄傀替死】铁奴玄傀横身挡下那必杀一击，铁躯寸寸崩裂——它替你断了后，你才逃得一命。", "danger");
        } else {
            p.currentHp = Math.max(1, Math.round(p.maxHp * 0.2));
            GAME.UI.log("你拼着断了几根肋骨，在血雾中滚下山坡——命是保住了，家底却空了。", "danger");
        }
        GAME.UI.log("损失：灵石 " + lostStones + " 枚" + (herbNames.length ? "、药草（" + herbNames.join("、") + "）" : "") + "。", "danger");
        this._clearHunt(0);
        return false;
    },

    _clearHunt: function (drop) {
        var p = GAME.State.p();
        p.riskHunt = false;
        p.riskWarned = false;
        p.marketRiskValue = Math.max(0, (p.marketRiskValue || 0) - (drop || 0));
    },
};
