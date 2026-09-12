/* =========================================================
 * js/alchemy.js —— 筑基期丹药与抗药性衰减
 *
 * 筑基三丹：
 *   【展金丹】筑基前期（1~3 层）精进修为，单枚 +60 修为
 *   【元灵丹】筑基中期（4~6 层）精进修为，须三百年以上灵药催熟，单枚 +150 修为
 *   【降尘丹】筑基后期冲关圣药，突破瓶颈时反噬伤害降低 80%
 *
 * 抗药性衰减（严格限制无脑嗑药，p.pillHistory）：
 *   第 1~5 枚：100% 修为效果
 *   第 6~10 枚：50% 修为效果
 *   超过 10 枚：0 点修为，仅提示"体内经脉对该丹药已然麻木，毫无寸进"
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Alchemy = {

    cfg: function () {
        return {
            fullUpTo: 5,        // 第 1~5 枚：100%
            halfUpTo: 10,       // 第 6~10 枚：50%
            // 超过 10 枚：0
        };
    },

    // ---------- 已服枚数 ----------
    taken: function (id) {
        var p = GAME.State.p();
        p.pillHistory = p.pillHistory || {};
        return p.pillHistory[id] || 0;
    },

    // ---------- 下一枚的收益倍率（1 / 0.5 / 0） ----------
    effMul: function (id) {
        var n = this.taken(id) + 1;   // 本次为第 n 枚
        var c = this.cfg();
        if (n <= c.fullUpTo) return 1;
        if (n <= c.halfUpTo) return 0.5;
        return 0;
    },

    // ---------- 服丹：走抗药性衰减 ----------
    takePill: function (id) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return 0;
        var item = GAME.DATA.ITEMS[id];
        if (!item || item.type !== "pill") return 0;
        if (GAME.State.countItem(id) <= 0) return 0;

        // 境界门槛（展金丹 1~3 层 / 元灵丹 4~6 层）
        if (item.realmBand) {
            if (p.realmIndex < item.realmBand[0] || p.realmIndex > item.realmBand[1]) {
                GAME.UI.log("【" + item.name + "】于你当前境界无益——此丹专为筑基第 " +
                    (item.realmBand[0] - 12) + "~" + (item.realmBand[1] - 12) + " 层所设。", "system");
                GAME.UI.updateUI();
                return 0;
            }
        }

        var mul = this.effMul(id);
        var n = this.taken(id) + 1;
        p.pillHistory = p.pillHistory || {};
        p.pillHistory[id] = n;
        GAME.State.removeItem(id, 1);
        p.stats.pillsTaken = (p.stats.pillsTaken || 0) + 1;

        var base = (item.use && item.use.exp) || 0;
        var gain = Math.round(base * mul);

        if (base > 0) {
            if (gain > 0) {
                p.currentExp += gain;
                GAME.UI.log("你服下【" + item.name + "】（第 " + n + " 枚），药力化开——修为 +" + gain +
                    (mul < 1 ? "（抗药性：药效仅余 " + Math.round(mul * 100) + "%）" : "") + "。", "success");
            } else {
                GAME.UI.log("你服下【" + item.name + "】（第 " + n + " 枚）——体内经脉对该丹药已然麻木，毫无寸进。", "system");
            }
        }
        // 降尘丹：静心稳灵台 + 下次突破反噬 -80%
        if (item.use && item.use.mind) {
            p.mind = (p.mind || 0) + item.use.mind;
            GAME.UI.log("一股清凉之意自灵台升起，心境 +" + item.use.mind + "（现 " + p.mind + "）。", "info");
        }
        if (item.breakthrough && item.breakthrough.failDmgMul != null) {
            p.jiangchen = true;
            GAME.UI.log("【降尘丹】药力沉入丹田护住心脉——下一次突破的反噬伤害将降低 " +
                Math.round((1 - item.breakthrough.failDmgMul) * 100) + "%。", "success");
        }
        GAME.Core.passTime(1);
        return gain;
    },

    // ---------- 突破反噬倍率（降尘丹：×0.2，一次性消耗） ----------
    breakDmgMul: function () {
        var p = GAME.State.p();
        if (!p.jiangchen) return 1;
        var item = GAME.DATA.ITEMS.pill_jiangchen;
        return (item && item.breakthrough && item.breakthrough.failDmgMul != null)
            ? item.breakthrough.failDmgMul : 0.2;
    },
    consumeJiangchen: function () {
        var p = GAME.State.p();
        if (!p.jiangchen) return false;
        p.jiangchen = false;
        GAME.UI.log("降尘丹的药力在反噬中耗尽——心脉总算保住了。", "warning");
        return true;
    },
};
