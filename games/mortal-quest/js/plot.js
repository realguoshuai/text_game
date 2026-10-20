/* =========================================================
 * js/plot.js —— 洞府药圃：灵药年份
 *
 * 为什么不是"灵气涨潮"：这类周期天象是别的游戏的做法，本作的世界里没有。
 * 一个伪灵根散修要往上爬，靠的是两件事——
 *   ① 把灵药种在灵气足的地方，等它自己长年份；
 *   ② 承露瓶的绿液催熟（js/bottle.js），快但绿液稀缺。
 * 所以"时间"在这游戏里的产出，不该是等某个加成窗口，而是地里那株药还差多少年。
 *
 * 规则：
 *   ① 三垄地。移栽一株【百年灵药】下地（消耗 1 株，不花年月——埋药不费时）
 *   ② 每月长 yearsPerMonth 年份，灵峰 gardenMul 加成（中品 ×1.5 / 上品 ×2）
 *   ③ 满 1000 年可收【千年灵药】；灵田设施（yieldBonus）收成时多给几株
 *   ④ 年份上限 1000——再长也只是药，成不了仙
 *
 * ★ 年份的唯一出口：这里算，别处只读。与 bottle.js 的分工是
 *   「绿液 = 立刻催熟（快、稀缺）」对「药圃 = 有地就慢慢长（慢、免费）」，
 *   两条路通向同一批药——这正是原著里"没有瓶子的修士怎么活"的答案。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

GAME.DATA.PLOT = {
    plots: 3,            // 洞府药圃垄数
    startYears: 100,     // 下地的是百年灵药，起点即百年
    yearsPerMonth: 3,    // 自然生长：每月 3 年份（灵峰 gardenMul 另乘）
    capYears: 1000,      // 药力上限
    harvest: { years: 1000, id: "herb_qiannian" },
    seed: "herb_bainian" // 移栽所需种苗
};

GAME.Plot = {

    cfg: function () { return GAME.DATA.PLOT; },

    // 药圃状态懒初始化（旧存档没有 p.plots 也不炸）
    _ensure: function (p) {
        var n = this.cfg().plots;
        if (!p.plots || !p.plots.length) {
            p.plots = [];
            for (var i = 0; i < n; i++) p.plots.push(null);
        }
        while (p.plots.length < n) p.plots.push(null);
        return p.plots;
    },

    // 生长速度：每月几许年份（灵峰的 gardenMul 终于落到实处）
    rate: function (p) {
        p = p || GAME.State.p();
        var mul = 1, list = GAME.DATA.LINGFENG || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === (p.peak || "low")) mul = list[i].gardenMul || 1;
        }
        return this.cfg().yearsPerMonth * mul;
    },

    yearsOf: function (p, i) {
        this._ensure(p);
        return p.plots[i] ? (p.plots[i].y || 0) : 0;
    },

    // 还差几个月可收（已可收则 0）
    monthsLeft: function (p, i) {
        var y = this.yearsOf(p, i), need = this.cfg().harvest.years;
        if (y >= need) return 0;
        return Math.ceil((need - y) / this.rate(p));
    },

    // 一垄的完整状态（UI 与执行读同一份）
    slot: function (p, i) {
        this._ensure(p);
        var y = this.yearsOf(p, i), cfg = this.cfg();
        if (!p.plots[i]) return { i: i, empty: true, years: 0, ready: false, left: 0 };
        return {
            i: i, empty: false, years: Math.floor(y),
            ready: y >= cfg.harvest.years,
            left: this.monthsLeft(p, i)
        };
    },

    slots: function (p) {
        var out = [], n = this.cfg().plots;
        p = p || GAME.State.p();
        for (var i = 0; i < n; i++) out.push(this.slot(p, i));
        return out;
    },

    /* ================= 生长：由 core.passTime 按月委派 ================= */
    tick: function (months) {
        var p = GAME.State.p();
        var cfg = this.cfg();
        if (!p.plots || !p.plots.length || !(months > 0)) return 0;
        var rate = this.rate(p), grown = 0;
        for (var i = 0; i < p.plots.length; i++) {
            var plot = p.plots[i];
            if (!plot) continue;
            if (plot.y >= cfg.capYears) continue;
            plot.y = Math.min(cfg.capYears, plot.y + months * rate);
            grown++;
            // 满千年只报一次——让"时间有回声"，但别每个月刷一条
            if (plot.y >= cfg.harvest.years && !plot.ripe) {
                plot.ripe = true;
                GAME.UI.log("【药圃】第 " + (i + 1) + " 垄的灵药已满千年——药香隔着园墙都压不住，该收了。", "loot");
            }
        }
        return grown;
    },

    /* ================= 移栽：把百年灵药种回地里 ================= */
    plant: function (i) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var cfg = this.cfg();
        this._ensure(p);
        if (i < 0 || i >= cfg.plots) return false;
        if (p.plots[i]) {
            GAME.UI.log("第 " + (i + 1) + " 垄已有一株在长，先收了它。", "system");
            GAME.UI.updateUI();
            return false;
        }
        if (GAME.State.countItem(cfg.seed) < 1) {
            GAME.UI.log("没有可移栽的药苗——须先有【" + GAME.DATA.ITEMS[cfg.seed].name + "】（坊市可购，灵峰灵脉每月也会吐纳）。", "system");
            GAME.UI.updateUI();
            return false;
        }
        GAME.State.removeItem(cfg.seed, 1);
        p.plots[i] = { y: cfg.startYears };
        GAME.UI.log("你把一株【" + GAME.DATA.ITEMS[cfg.seed].name + "】移栽进第 " + (i + 1) + " 垄，浇了一瓢灵泉水——" +
            "剩下的交给年月（每月长 " + Math.round(this.rate(p) * 10) / 10 + " 年份，满 1000 年可收）。", "info");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    /* ================= 收成：拔出即空垄 ================= */
    harvest: function (i) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var cfg = this.cfg(), s = this.slot(p, i);
        if (s.empty) { GAME.UI.log("第 " + (i + 1) + " 垄是空的。", "system"); GAME.UI.updateUI(); return false; }
        if (!s.ready) {
            GAME.UI.log("第 " + (i + 1) + " 垄的灵药才 " + s.years + " 年，还差 " + this._fmtMonths(s.left) + "才够千年——此时起出，只是白糟蹋一株好药。", "system");
            GAME.UI.updateUI();
            return false;
        }
        var bonus = (GAME.Home && GAME.Home.yieldBonus) ? GAME.Home.yieldBonus() : 0;
        var n = 1 + bonus;
        GAME.State.addItem(cfg.harvest.id, n);
        p.plots[i] = null;
        GAME.UI.log("你小心起出第 " + (i + 1) + " 垄的药，泥土簌簌落下——得【" + GAME.DATA.ITEMS[cfg.harvest.id].name + "】×" + n +
            (bonus ? "（灵田 +" + bonus + "）" : "") + "。千年药力，指尖都发烫。", "loot");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    /* ================= 面板摘要 ================= */
    status: function (p) {
        p = p || GAME.State.p();
        if (!p) return null;
        this._ensure(p);
        var list = this.slots(p), growing = 0, ready = 0, nextLeft = null, i;
        for (i = 0; i < list.length; i++) {
            if (list[i].empty) continue;
            growing++;
            if (list[i].ready) ready++;
            else if (nextLeft === null || list[i].left < nextLeft) nextLeft = list[i].left;
        }
        return {
            plots: this.cfg().plots, growing: growing, ready: ready,
            nextLeft: nextLeft, list: list,
            seed: GAME.State.countItem(this.cfg().seed)
        };
    },

    _fmtMonths: function (m) {
        if (!(m > 0)) return "";
        var y = Math.floor(m / 12), mo = m % 12;
        if (y <= 0) return mo + " 月";
        return y + " 年" + (mo ? " " + mo + " 月" : "");
    }
};
