/* =========================================================
 * js/tainan.js —— 苍南小会（散修坊市 + 升仙大会）
 * 自此处起，世俗银两彻底作废，一律以灵石结算。
 * 买东西只是其一；真正紧要的是谷中的升仙大会——
 * 擂台三连胜可夺前三换筑基丹，或出示【升仙令】径直拜入青梧谷。
 * 数据全在 GAME.DATA.TAINAN
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Tainan = {

    cfg: function () { return GAME.DATA.TAINAN; },

    at: function () { return GAME.State.p().location === "tainan_gu"; },

    // 抵达苍南谷时初始化进度
    ensure: function () {
        var p = GAME.State.p();
        if (!p.tainan) p.tainan = { leitai: 0, leitaiDone: false };
        return p.tainan;
    },

    // ---------- 散修坊市：灵石结算，常年供应 ----------
    buyPrice: function (price) { return Math.round(price); },   // 明码实价，不讲人情

    buy: function (index) {
        var p = GAME.State.p();
        if (!this.at() || p.isDead) return false;
        var g = this.cfg().goods[index];
        if (!g) return false;
        var item = GAME.DATA.ITEMS[g.id];
        var price = this.buyPrice(g.price);
        if (p.spiritStones < price) {
            GAME.UI.log("灵石不足。摊主瞥你一眼，懒得搭话。", "system");
            GAME.UI.updateUI();
            return false;
        }
        p.spiritStones -= price;
        GAME.State.addItem(g.id, 1);
        GAME.UI.log("你以 " + price + " 枚灵石购入【" + item.name + "】。", "info");
        GAME.Core.checkAchievements();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    sellPrice: function (id) {
        var item = GAME.DATA.ITEMS[id];
        if (!item) return 0;
        return Math.max(1, Math.round(item.price * this.cfg().sellRatio));
    },

    canSell: function (id) {
        var item = GAME.DATA.ITEMS[id];
        return !!item && item.type !== "currency" && item.type !== "treasure";
    },

    sell: function (id) {
        var p = GAME.State.p();
        if (!this.at() || p.isDead) return false;
        if (!GAME.State.countItem(id) || !this.canSell(id)) return false;
        var gain = this.sellPrice(id);
        GAME.State.removeItem(id);
        p.spiritStones += gain;
        GAME.UI.log("你将【" + GAME.DATA.ITEMS[id].name + "】脱手，得 " + gain + " 枚灵石。", "loot");
        GAME.Core.checkAchievements();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 升仙大会擂台 ----------
    nextRound: function () {
        var p = GAME.State.p();
        if (!this.at() || p.isDead || p.combat) return false;
        if (p.sectId) { GAME.UI.log("你已是【" + GAME.DATA.TAINAN.token.sectName + "】门人，不必再抢这个名额。", "system"); return false; }
        this.ensure();
        if (p.tainan.leitaiDone) { GAME.UI.log("前三已定，再打便是无谓之争。", "system"); GAME.UI.updateUI(); return false; }
        var r = this.cfg().leitai[p.tainan.leitai];   // 已胜场次即为下一场下标
        if (!r) { GAME.UI.log("擂台之上此刻无人。", "system"); return false; }
        GAME.UI.log("擂鼓声起——" + r.name + "开擂，对手已是擂台边上候着了。", "warning");
        p.combatRoute = { type: "leitai", round: r.round };
        GAME.Combat.start(r.monster);
        return true;
    },

    // ---------- 擂台战后结算 ----------
    afterCombat: function (win, ctx) {
        var p = GAME.State.p();
        if (p.isDead) return;
        this.ensure();
        if (!win) {
            GAME.UI.log("你被人打下擂台。观者一阵哄笑——此番升仙大会，与你无缘了。（可休整后再从头打起）", "warning");
            GAME.Core.passTime(1);
            GAME.UI.autoSave();
            GAME.UI.updateUI();
            return;
        }
        p.tainan.leitai = ctx.round;   // 记录已胜轮数
        GAME.Core.passTime(1);
        if (p.isDead) return;
        if (ctx.round >= this.cfg().leitai.length) {
            p.tainan.leitaiDone = true;
            var rw = this.cfg().reward;
            GAME.UI.log(rw.text, "success");
            (rw.items || []).forEach(function (id) {
                GAME.State.addItem(id, 1);
                GAME.UI.log("获得【" + GAME.DATA.ITEMS[id].name + "】×1。", "loot");
            });
            GAME.Core.checkAchievements();
        } else {
            GAME.UI.log("这一场胜了。下一场的对手更强——此刻收手，前面便白打了。", "info");
        }
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 出示【升仙令】：保送拜入青梧谷 ----------
    joinByToken: function () {
        var p = GAME.State.p();
        if (!this.at() || p.isDead || p.combat) return false;
        if (p.sectId) { GAME.UI.log("你已有山门可归。", "system"); GAME.UI.updateUI(); return false; }
        if (GAME.State.countItem("shengxian_ling") <= 0) {
            GAME.UI.log("你身上并无【升仙令】。若无此物，只有上擂台一条路。", "system");
            GAME.UI.updateUI();
            return false;
        }
        this.ensure();
        GAME.State.removeItem("shengxian_ling");
        var t = this.cfg().token;
        p.sectId = t.sect;
        GAME.UI.log(t.text, "success");
        if (GAME.Codex) GAME.Codex.unlockLore("lore_tainan");   // 图鉴·秘闻
        // 曾在墨府参悟过令牌用法 → 破阵更从容，长老另赐
        if (p.shengxianLore) {
            p.spiritStones += 150;
            GAME.UI.log("你依手札「以令映纹，云开见径」八字催动令牌——山麓雾气应声裂开一道缝隙。验令长老骇然：「你……怎知此令的用法？」另赐灵石 150 枚。", "success");
        }
        (t.items || []).forEach(function (id) {
            GAME.State.addItem(id, 1);
            GAME.UI.log("获得【" + GAME.DATA.ITEMS[id].name + "】×1。", "loot");
        });
        GAME.UI.log("自此你名列【" + t.sectName + "】门墙之内。前路比山中更长，此地不该久留。", "success");
        GAME.Core.passTime(t.months);
        if (p.isDead) return false;
        GAME.Core.checkAchievements();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },
};
