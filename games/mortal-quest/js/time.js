/* =========================================================
 * js/time.js —— 年月账簿（把"闭关年月"从背景数字变成真资源）
 *
 * 设计动因：原来时间只是背景——打坐只花月数，玩家既看不到自己还剩多少寿元，
 * 也不知道点一下要花多少，更没有"怎么花"的选择。于是"闭关"退化成反复点同一个按钮。
 * 这个模块把时间变成一笔能看见、能分配、会疼的预算：
 *
 *   ① 预算：寿元余 N 年 M 月（随境界/延寿丹/折寿实时变）
 *   ② 价格：每档闭关明码标价（几个月），修为与心境按"周天/月数"折算
 *   ③ 分配：静修 / 闭关 / 苦修 / 长关 四档——同一个寿元池，不同的领取方式
 *   ④ 择时：灵潮每 24 月一涨（涨 6 月）——涨潮时闭关心境 ×2、破境 +5%
 *   ⑤ 地雷：会把自己闭死的事（寿元不够、毒发在关内）一律先拦下并说明原因
 *
 * ★ 时间相关推演的唯一出口：不要在别处再算"还剩几年"或"潮期到没到"。
 *   修为口径保持"一个周天 +1"，与旧 meditate 完全一致——这里只把"花几个月"
 *   交给玩家定，不偷偷改数值平衡。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

GAME.DATA.TIME = {
    // 心境按"月"折算：静坐养的是心，不是修为。每 4 月 +1 心境（长生路上的慢功夫）
    mindPerMonths: 4,

    // 灵潮：每 24 月一轮，第 6~12 月为涨潮期
    //   mindMul —— 涨潮时闭关所得心境翻倍（天地灵气充盈，入定更深）
    //   breakAdd —— 涨潮时破境 +5%（天时之利，算进破境筹备的一股力）
    tide: { cycle: 24, from: 6, len: 6, mindMul: 2, breakAdd: 0.05 },

    // 闭关分档：cycles = 周天数（一个周天 = 本境 meditateMonths 月）
    tiers: [
        { id: "short", name: "静修", cycles: 1,  note: "一坐周天，随时可出关" },
        { id: "mid",   name: "闭关", cycles: 3,  note: "三周天" },
        { id: "long",  name: "苦修", cycles: 6,  note: "六周天" },
        { id: "epic",  name: "长关", cycles: 12, note: "十二周天，一坐一年起" }
    ]
};

GAME.Time = {

    cfg: function () { return GAME.DATA.TIME; },

    /* ================= ① 预算：寿元还剩多少 ================= */

    // 剩余寿元（月）——大限（境界 + 延寿丹）减已用年月
    remain: function (p) {
        p = p || GAME.State.p();
        var total = (GAME.State.maxAge() - (p.ageYears || 0)) * 12 - (p.ageMonths || 0);
        if (total < 0) total = 0;
        return { total: total, years: Math.floor(total / 12), months: total % 12 };
    },

    _fmt: function (total) {
        if (total <= 0) return "0 月";
        var y = Math.floor(total / 12), m = total % 12;
        if (y <= 0) return m + " 月";
        return y + " 年" + (m ? " " + m + " 月" : "");
    },

    remainLabel: function (p) { return this._fmt(this.remain(p).total); },

    // HUD 短标：76年4月
    remainShort: function (p) {
        var r = this.remain(p);
        if (r.years <= 0) return r.months + "月";
        return r.years + "年" + (r.months ? r.months + "月" : "");
    },

    // 寿元告急档位：warn（≤10 年）/ danger（≤5 年）——只作展示用色，不做逻辑判断
    remainLevel: function (p) {
        var t = this.remain(p).total;
        return t <= 60 ? "danger" : (t <= 120 ? "warn" : "");
    },

    /* ================= ④ 择时：灵潮 ================= */

    tide: function (p) {
        p = p || GAME.State.p();
        var c = this.cfg().tide;
        var phase = (((p.totalMonths || 0) % c.cycle) + c.cycle) % c.cycle;
        var on = phase >= c.from && phase < c.from + c.len;
        var left = on
            ? (c.from + c.len - phase)                                   // 还有几月退潮
            : (phase < c.from ? (c.from - phase) : (c.cycle - phase + c.from));  // 还有几月涨潮
        return {
            on: on, phase: phase, left: left,
            mindMul: on ? c.mindMul : 1,
            breakAdd: on ? c.breakAdd : 0
        };
    },

    tideLabel: function (p) {
        var t = this.tide(p);
        if (!t.on) return "灵潮退 · " + t.left + " 月后涨";
        return "灵潮涨 · 余 " + t.left + " 月（心境 ×" + t.mindMul +
            "、破境 +" + Math.round(t.breakAdd * 100) + "%）";
    },

    /* ================= ② 价格：一档闭关到底花什么、换什么 ================= */

    monthsOf: function (p, cycles) {
        var r = GAME.DATA.REALMS[p.realmIndex] || {};
        return (r.meditateMonths || 3) * cycles;
    },

    // 修为：一周天 +1（与旧 meditate 完全一致，藏经阁加成照旧）
    expOf: function (p, cycles) {
        var extra = (GAME.Home && GAME.Home.meditateExp) ? GAME.Home.meditateExp() : 0;
        return cycles * (1 + extra);
    },

    // 心境：每 mindPerMonths 月 +1；涨潮期翻倍
    mindOf: function (months, tideMul) {
        var per = this.cfg().mindPerMonths || 4;
        return Math.floor(months / per) * (tideMul || 1);
    },

    /* ================= ⑤ 地雷：会把自己闭死的事，先拦下来 ================= */
    // 不弹窗（WebView 会吞掉返回 false）、不灰按钮不说原因——直接给一句能读懂的话
    guard: function (p, months) {
        p = p || GAME.State.p();
        if (!(months > 0)) return { ok: false, why: "闭关时长无效" };
        var left = this.remain(p).total;
        if (months >= left) {
            return { ok: false, why: "寿元只余 " + this._fmt(left) + "，撑不到出关（需 " + months + " 月）" };
        }
        if (p.shichong && typeof p.shichong.months === "number" && months >= p.shichong.months) {
            return { ok: false, why: "尸虫丸 " + p.shichong.months + " 月后毒发，闭 " + months + " 月会死在关里" };
        }
        if (p.yindu && typeof p.yindu.months === "number" && months >= p.yindu.months) {
            return { ok: false, why: "体内阴毒 " + p.yindu.months + " 月后发作，闭 " + months + " 月来不及" };
        }
        return { ok: true, why: "" };
    },

    // 一档闭关的完整账（UI 与执行读同一份）
    tier: function (p, id) {
        p = p || GAME.State.p();
        var list = this.cfg().tiers, def = null, i;
        for (i = 0; i < list.length; i++) if (list[i].id === id) def = list[i];
        if (!def) return null;
        var months = this.monthsOf(p, def.cycles);
        var t = this.tide(p);
        var g = this.guard(p, months);
        return {
            id: def.id, name: def.name, note: def.note, cycles: def.cycles,
            months: months,
            exp: this.expOf(p, def.cycles),
            mind: this.mindOf(months, t.mindMul),
            tide: t.on, tideMul: t.mindMul,
            ok: g.ok, why: g.why
        };
    },

    tiers: function (p) {
        var out = [], list = this.cfg().tiers, i;
        for (i = 0; i < list.length; i++) out.push(this.tier(p, list[i].id));
        return out;
    },

    // 一行价钱：3月 · 修为+1 · 心境+0
    priceLabel: function (t) {
        if (!t) return "";
        return t.months + " 月 · 修为 +" + t.exp + (t.mind > 0 ? " · 心境 +" + t.mind : "");
    },

    /* ================= ③ 分配：执行 ================= */

    // 闭关的唯一执行出口（Core.meditate 也走这里，保证只有一条路径）
    seclude: function (id) {
        var p = GAME.State.p();
        if (!p || p.isDead || p.combat) return false;
        if (p.pendingEvent || p.pendingMercy) {
            GAME.UI.log("尚有未了之事悬在心头，无法入定。", "system");
            GAME.UI.updateUI();
            return false;
        }
        var t = this.tier(p, id || "short");
        if (!t) return false;
        if (!t.ok) {
            GAME.UI.log("无法闭关——" + t.why + "。", "danger");
            GAME.UI.updateUI();
            return false;
        }

        var extra = (GAME.Home && GAME.Home.meditateExp) ? GAME.Home.meditateExp() : 0;
        p.currentExp += t.exp;
        if (t.mind > 0) p.mind = (p.mind || 0) + t.mind;

        if (t.cycles <= 1) {
            GAME.UI.log("你闭门吐纳 " + t.months + " 个月，杂灵根吸纳的灵气微乎其微，修为 +" + t.exp +
                (extra ? "（藏经阁 +" + extra + "）" : "") + "。", "info");
        } else {
            GAME.UI.log("你闭关苦修 " + t.months + " 个月，出关时蒲团上落了一层灰——修为 +" + t.exp +
                (t.mind > 0 ? "，心境 +" + t.mind + (t.tide ? "（灵潮 ×" + t.tideMul + "）" : "") : "") + "。", "info");
        }
        GAME.Core.passTime(t.months);
        return true;
    },

    /* ================= 预告：这 N 个月里世界会发生什么 ================= */
    // 让"时间花出去"的代价可见——坊市换货、倒计时余量、寿元余量
    preview: function (p, months) {
        p = p || GAME.State.p();
        var out = [];
        var end = (p.totalMonths || 0) + months;
        if (p.marketNextRefresh != null) {
            var step = (GAME.DATA.MARKET && GAME.DATA.MARKET.refreshMonths) || 12;
            if (end >= p.marketNextRefresh) {
                out.push("坊市换货 " + (Math.floor((end - p.marketNextRefresh) / step) + 1) + " 次");
            }
        }
        if (p.shichong && typeof p.shichong.months === "number") {
            out.push("尸虫丸余 " + Math.max(0, p.shichong.months - months) + " 月");
        }
        if (p.yindu && typeof p.yindu.months === "number") {
            out.push("阴毒余 " + Math.max(0, p.yindu.months - months) + " 月");
        }
        if (p.causal && typeof p.causal.months === "number") {
            out.push("因果余 " + Math.max(0, p.causal.months - months) + " 月");
        }
        var left = this.remain(p).total - months;
        out.push("出关时寿元余 " + this._fmt(left));
        return out;
    }
};
