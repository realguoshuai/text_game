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

    // ---------- 丹方药效：数字一律现算，绝不抄进文案 ----------
    // 效果的真值只有两处：ITEM.use（材料型加成）与 DATA.ZHUJI / DATA.JIEDAN（突破丹）。
    // 这里只做「翻译 + 叠上当前抗药性」，炼丹面板与背包共用同一句话。
    // 返回 { tag, gain }：tag 是分类（配在 data/items.js 的 RECIPES 里），gain 是带准数的一行。
    // ⛔ 别在 RECIPES.note 或 UI 里写死「+80 修为」「+25%」——调平衡时那会变成假话。
    effectOf: function (id) {
        var D = GAME.DATA, item = D.ITEMS[id], use = item && item.use;
        var out = { tag: "", gain: "" };
        if (!use) return out;

        // 分类优先取丹方配置，回落到按字段推定（背包里的丹也能拿到同一句话）
        var rs = D.RECIPES || [];
        for (var i = 0; i < rs.length; i++) {
            if (rs[i].pill === id && rs[i].tag) { out.tag = rs[i].tag; break; }
        }
        var pc = function (x) { return Math.round(x * 100) + "%"; };
        var Z = D.ZHUJI || {}, J = D.JIEDAN || {};

        // ① 突破丹：成功率、反噬、免死全从境界表读
        if (use.zhengpin && Z.zhengpin) {
            out.tag = out.tag || "突破重宝";
            out.gain = "突破筑基 " + pc(Z.zhengpin.chance) + " 起步（每多备一枚再 +" + pc(Z.zhengpin.perPill) +
                "，上限 " + pc(Z.zhengpin.cap) + "）" + this._harmTxt(Z.zhengpin);
        } else if (use.zhuji && Z.pill) {
            out.tag = out.tag || "突破重宝";
            out.gain = "突破筑基 " + pc(Z.pill.chance) + " 起步（每多备一枚再 +" + pc(Z.pill.perPill) +
                "，上限 " + pc(Z.pill.cap) + "）" + this._harmTxt(Z.pill);
        } else if (use.jiedan && J.pill) {
            out.tag = out.tag || "突破重宝";
            var jz = (id === "pill_jiedan_zhengpin" && J.zhengpin) ? J.zhengpin : J.pill;
            out.gain = "突破结丹 " + pc(jz.chance) + " 起步（每多备一枚再 +" + pc(jz.perPill) + "）" + this._harmTxt(jz);
        }
        // ② 精进修为：叠上丹毒渐抗后本颗实得——玩家开炉前就知道这炉还剩几成劲
        else if (use.exp) {
            out.tag = out.tag || "精进修为";
            var p = GAME.State.p();
            var pot = (GAME.Core && GAME.Core.pillPotency) ? GAME.Core.pillPotency(id) : { taken: 0, mult: 1 };
            var mul = pot.mult * (GAME.Reincarn ? GAME.Reincarn.pillMult(p) : 1);
            var cur = Math.max(1, Math.round(use.exp * mul));
            out.gain = "修为 +" + use.exp + (mul < 1
                ? "（已服 " + pot.taken + " 颗，本颗实得 +" + cur + "，丹毒渐抗 ×" + mul.toFixed(2) + "）"
                : "");
        }
        // ③ 其余按字段直译
        else if (use.maxHpBonus) { out.tag = out.tag || "易筋洗髓"; out.gain = "气血上限 +" + use.maxHpBonus + "（永久）"; }
        else if (use.heal) { out.tag = out.tag || "疗伤回元"; out.gain = "气血回复 " + use.heal + " 点"; }
        else if (use.ageBonus) { out.tag = out.tag || "延寿续命"; out.gain = "寿元大限 +" + use.ageBonus + " 年"; }
        else if (use.spiritBonus) { out.tag = out.tag || "温养神魂"; out.gain = "神识 +" + use.spiritBonus + "（永久）"; }
        else if (use.mind) { out.tag = out.tag || "凝神定心"; out.gain = "心境 +" + use.mind; }
        else if (use.shaQi) { out.tag = out.tag || "化煞清灵"; out.gain = "煞气 " + (use.shaQi > 0 ? "+" : "-") + Math.abs(use.shaQi); }
        else if (use.cureHiddenInjury) { out.tag = out.tag || "疗愈暗伤"; out.gain = "根除燃寿暗伤"; }
        return out;
    },

    // 突破丹的「反噬 / 免死」后缀：dmgMul / deathMul 由 data/realms.js 给，别在这儿写死
    _harmTxt: function (cf) {
        var t = [];
        if (cf && typeof cf.dmgMul === "number" && cf.dmgMul < 1) t.push("反噬 -" + Math.round((1 - cf.dmgMul) * 100) + "%");
        if (cf && cf.deathMul === 0) t.push("失败不身陨");
        return t.length ? "，且" + t.join("、") : "";
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
                var _lo = (GAME.DATA.REALMS[item.realmBand[0]] || {}).name || "特定境界";
                var _hi = (GAME.DATA.REALMS[item.realmBand[1]] || {}).name || "特定境界";
                GAME.UI.log("【" + item.name + "】于你当前境界无益——此丹专为「" + _lo + "～" + _hi + "」所设。", "system");
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
