/* =========================================================
 * js/review.js —— 十年回顾（里程碑小结）
 *   每满 10 年（以寿元计）自动结算一次，向日志输出：
 *     ① 这十年：境界 / 修为 / 灵石 / 战绩 的变化量
 *     ② 错过的事：仍未了结的尘缘与未走的路（只提示，不惩罚）
 *   纯展示 + 轻量记账：只往 p.review 写一个快照，不改动任何玩法数值。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Review = {

    INTERVAL: 10,

    // ---------- 快照：用于算"这十年变了多少" ----------
    snap: function (p) {
        var st = p.stats || {};
        return {
            year: p.ageYears || 0,
            realmIndex: p.realmIndex || 0,
            exp: p.currentExp || 0,
            stones: p.spiritStones || 0,
            silver: p.silver || 0,
            liquid: p.liquid || 0,
            kills: st.kills || 0,
            mercies: st.mercies || 0,
            breakthroughs: st.breakthroughs || 0,
            explores: st.explores || 0,
            alchemy: st.alchemy || 0,
            pills: st.pillsTaken || 0,
            achievements: (p.achievements || []).length
        };
    },

    // ---------- 初始化 / 惰性补齐（老存档无此字段也不报错） ----------
    ensure: function (p) {
        if (!p.review || !p.review.snap) {
            p.review = { lastYear: (p.ageYears || 0), snap: this.snap(p), times: 0 };
        }
        return p.review;
    },

    // ---------- 时间推进钩子：由 Core.passTime 调用 ----------
    tick: function () {
        var p = GAME.State.p();
        if (!p || p.isDead) return;
        var r = this.ensure(p);
        if ((p.ageYears || 0) - r.lastYear >= this.INTERVAL) {
            this.run(p);
        }
    },

    // ---------- 生成一次回顾 ----------
    run: function (p) {
        var r = this.ensure(p);
        var a = r.snap, b = this.snap(p);
        var R = GAME.DATA.REALMS;
        var gainedRealm = b.realmIndex - a.realmIndex;
        var lines = [];

        lines.push("──── 十年回顾 · " + a.year + " 岁 → " + b.year + " 岁 ────");

        // ① 修为
        if (gainedRealm > 0) {
            lines.push("修为：自" + R[a.realmIndex].name + "一路修至" + R[b.realmIndex].name + "，跨越 " + gainedRealm + " 个小境界。");
        } else {
            lines.push("修为：仍停在" + R[b.realmIndex].name + "，这十年未有寸进。");
        }

        // ② 家底
        var dStone = b.stones - a.stones;
        lines.push("家底：灵石 " + a.stones + " → " + b.stones + "（" + (dStone >= 0 ? "+" : "") + dStone + "）" +
                   "，绿液余 " + b.liquid + " 滴。");

        // ③ 行迹
        var acts = [];
        if (b.kills - a.kills > 0) acts.push("斩敌 " + (b.kills - a.kills) + " 人");
        if (b.mercies - a.mercies > 0) acts.push("留情 " + (b.mercies - a.mercies) + " 次");
        if (b.explores - a.explores > 0) acts.push("外出历练 " + (b.explores - a.explores) + " 次");
        if (b.breakthroughs - a.breakthroughs > 0) acts.push("尝试突破 " + (b.breakthroughs - a.breakthroughs) + " 次");
        if (b.alchemy - a.alchemy > 0) acts.push("开炉 " + (b.alchemy - a.alchemy) + " 次");
        lines.push("行迹：" + (acts.length ? acts.join("、") : "这十年你只是打坐，什么也没做。"));

        // ④ 错过的事
        var miss = this.missed(p, b);
        if (miss.length) {
            lines.push("错过：" + miss.join("；") + "。");
        }

        // 输出
        var UI = GAME.UI;
        if (UI && UI.log) {
            UI.log("", "system");
            for (var i = 0; i < lines.length; i++) {
                UI.log(lines[i], i === 0 ? "success" : "system");
            }
            UI.log("", "system");
        }

        // 记账：滚动快照，进入下一个十年
        r.lastYear = b.year;
        r.snap = b;
        r.times = (r.times || 0) + 1;
        return lines;
    },

    // ---------- 错过的事（只列"本可做而未做"的，不重复提示已了结的） ----------
    missed: function (p, b) {
        var out = [];
        if (!p.farewellDone) out.push("尚未向厉长风辞行");
        if (!p.visitFamilyDone) out.push("多年未回乡探亲");
        if (!p.sectId && (p.realmIndex || 0) >= 12) out.push("仍未拜入任何宗门");
        if (!p.companion) out.push("身边无一随从");
        if ((b.alchemy || 0) === 0) out.push("至今未曾开炉炼丹");
        if ((b.explores || 0) === 0) out.push("从未踏出洞府历练");
        if (p.bonds) {
            var undone = [];
            ["lihuayuan", "nangongwan", "dongxuaner", "chenqiaoqian"].forEach(function (k) {
                if (!p.bonds[k] || !p.bonds[k].done) undone.push(k);
            });
            if (undone.length === 4) out.push("师承红颜的情分都还没了结");
        }
        return out.slice(0, 3);   // 最多三条，避免刷屏
    }
};
