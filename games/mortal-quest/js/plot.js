/* =========================================================
 * js/plot.js —— 洞府药圃：灵药年份（重构版）
 *
 * 一句话逻辑：灵药种子 -> 下种 -> 田垄里靠岁月长年份 -> 绿液只在垄内催熟，
 * 而非凭空变出百年灵药。这与原著里"没有瓶子的修士怎么活"的答案一致：
 *   ① 把【灵药种子】种进灵田，等它自己长年份；
 *   ② 承露瓶绿液（js/core.js / js/bottle.js 凝结）只在垄内催熟——快，但绿液稀缺。
 *
 * 灵田阶数（data/content.js 的 lingtian 设施 levels）决定：
 *   · 药垄总数（1 阶 4 垄 … 5 阶 12 垄）
 *   · 每月自然生长年份（4 / 6 / 10 / 15 / 20）
 *   · 阶数越高，自然长得越快、垄越多。
 *
 * ★ 年份的唯一出口：这里算，别处只读。与 bottle.js 的分工是
 *   「绿液 = 垄内立刻催熟（快、稀缺）」对「药圃 = 有地就慢慢长（慢、免费）」。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

// 灵田阶数 → 药垄数与每月药龄（灵峰 gardenMul 另乘）。index = 灵田阶数（0 = 未开辟）。
// 与 data/content.js 的 lingtian 设施 levels 一一对应：levels[i] 的 plots/ypm 取自此表。
GAME.DATA.PLOT = {
    tiers: [
        { plots:3,  ypm:3  },   // 0 阶：凡土药畦（未升阶，基垄 3、每月 3 年）
        { plots:4,  ypm:4  },   // 1 阶
        { plots:6,  ypm:6  },   // 2 阶
        { plots:8,  ypm:10 },   // 3 阶 地脉灵田
        { plots:10, ypm:15 },   // 4 阶 玉髓药园
        { plots:12, ypm:20 },   // 5 阶 洞天药圃
    ],
    startYearsSeed: 1,              // 种下灵种：幼苗 1 年
    startYearsTransplant: 100,      // 移栽百年药：100 年苗
    hundred: 100,                  // 百年门槛
    capYears: 1000,                // 药力上限
    harvestHundred:  { years:100,  id:"herb_bainian" },   // 满百年采收 → 百年灵药
    harvestThousand: { years:1000, id:"herb_qiannian" },   // 满千年采收 → 千年灵药
    seedItem: "seed_lingyao",       // 种下灵种消耗
    transplantItem: "herb_bainian", // 移栽百年药消耗
    stepAdd: 250,                  // 药液催熟 +250 年/滴
    liquidPerCatalyze: 1,
    riskPerCatalyze: 4,            // 每滴绿液催熟累积的药香泄露
    // —— 向后兼容别名（mortality.js / 旧引用仍读这些字段；seed 沿用旧义=移栽苗=百年灵药）——
    plots: 3,
    seed: "herb_bainian",
    harvest: { years:1000, id:"herb_qiannian" },
};

GAME.Plot = {

    cfg: function () { return GAME.DATA.PLOT; },

    // 当前灵田阶数（0 = 未开辟）
    level: function () {
        return (GAME.Home && GAME.Home.level) ? GAME.Home.level("lingtian") : 0;
    },
    // 当前阶对应的配置（越界则就近夹取）
    tier: function () {
        var L = this.cfg().tiers, lv = this.level();
        if (lv < 0) lv = 0;
        if (lv >= L.length) lv = L.length - 1;
        return L[lv];
    },
    plots: function () { return this.tier().plots; },
    ypm: function () { return this.tier().ypm; },

    // 药圃状态懒初始化（旧存档没有 p.plots 也不炸；只增不减，绝不误删在长灵药）
    _ensure: function (p) {
        var n = this.plots();
        if (!p.plots) p.plots = [];
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
        return this.ypm() * mul;
    },

    yearsOf: function (p, i) {
        this._ensure(p);
        return p.plots[i] ? (p.plots[i].y || 0) : 0;
    },

    // 还差几个月可收千年（已可收则 0）
    monthsLeft: function (p, i) {
        var y = this.yearsOf(p, i), rate = this.rate(p);
        if (rate <= 0) return 0;
        var need = this.cfg().capYears;
        if (y >= need) return 0;
        return Math.ceil((need - y) / rate);
    },

    // 一垄的完整状态（UI 与执行读同一份）
    slot: function (p, i) {
        this._ensure(p);
        var y = this.yearsOf(p, i), cfg = this.cfg();
        if (!p.plots[i]) return { i: i, empty: true, years: 0, mature: false, ready: false, left: 0, hundredLeft: 0, isTransplant: false, target: 0 };
        // 旧存档没有 pt/target：按栽种物 h 推断（移栽苗=h=百年灵药 → 千年培育；否则下种苗）
        var _h = p.plots[i].h;
        var _isTr = (p.plots[i].pt === "transplant") || (p.plots[i].pt == null && _h === cfg.transplantItem);
        var _target = p.plots[i].target || (_isTr ? cfg.capYears : cfg.hundred);
        return {
            i: i, empty: false, years: Math.floor(y),
            isTransplant: _isTr,
            target: _target,
            mature: (_target === cfg.hundred) && y >= cfg.hundred && y < cfg.capYears,   // 仅下种苗、转千年前可收百年药
            ready:  y >= cfg.capYears,         // 千年满 → 可收千年药（移栽苗达此亦收千年）
            left: this.monthsLeft(p, i),
            hundredLeft: y < cfg.hundred ? this.monthsLeft(p, i) : 0
        };
    },

    slots: function (p) {
        var out = [], n = this.plots();
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

    /* ================= 下种 ================= */
    plantSeed: function (i) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var cfg = this.cfg();
        this._ensure(p);
        var n = this.plots();
        if (i < 0 || i >= n) return false;
        if (p.plots[i]) {
            GAME.UI.log("第 " + (i + 1) + " 垄已有一株在长，先收了它。", "system");
            GAME.UI.updateUI(); return false;
        }
        if (GAME.State.countItem(cfg.seedItem) < 1) {
            GAME.UI.log("没有【" + GAME.DATA.ITEMS[cfg.seedItem].name + "】，无处下种。坊市常售，或外出历练、斗法夺妖皆可获之。", "system");
            GAME.UI.updateUI(); return false;
        }
        GAME.State.removeItem(cfg.seedItem, 1);
        p.plots[i] = { y: cfg.startYearsSeed, h: cfg.seedItem, pt: "seed", target: cfg.hundred };
        GAME.UI.log("你把一粒【" + GAME.DATA.ITEMS[cfg.seedItem].name + "】埋进第 " + (i + 1) + " 垄，浇了捧灵泉——只待岁月。每月长 " + (Math.round(this.rate(p) * 10) / 10) + " 年份。", "info");
        GAME.UI.autoSave(); GAME.UI.updateUI();
        return true;
    },

    plantTransplant: function (i) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var cfg = this.cfg();
        this._ensure(p);
        var n = this.plots();
        if (i < 0 || i >= n) return false;
        if (p.plots[i]) {
            GAME.UI.log("第 " + (i + 1) + " 垄已有一株在长，先收了它。", "system");
            GAME.UI.updateUI(); return false;
        }
        if (GAME.State.countItem(cfg.transplantItem) < 1) {
            GAME.UI.log("没有可移栽的【" + GAME.DATA.ITEMS[cfg.transplantItem].name + "】。", "system");
            GAME.UI.updateUI(); return false;
        }
        GAME.State.removeItem(cfg.transplantItem, 1);
        p.plots[i] = { y: cfg.startYearsTransplant, h: cfg.transplantItem, pt: "transplant", target: cfg.capYears };
        GAME.UI.log("你把一株【" + GAME.DATA.ITEMS[cfg.transplantItem].name + "】移栽进第 " + (i + 1) + " 垄（" + cfg.startYearsTransplant + " 年苗），每月长 " + (Math.round(this.rate(p) * 10) / 10) + " 年份。", "info");
        GAME.UI.autoSave(); GAME.UI.updateUI();
        return true;
    },

    // 向后兼容别名：旧调用 GAME.Plot.plant(i) 等同「移栽百年药」
    plant: function (i) { return this.plantTransplant(i); },

    /* ================= 药液催熟（消耗承露瓶绿液） ================= */
    _needLiquid: function (p, drops) {
        if ((p.liquid || 0) < drops) {
            GAME.UI.log("承露瓶中绿液不足 " + drops + " 滴，催不动。", "system");
            GAME.UI.updateUI();
            return false;
        }
        return true;
    },
    _leak: function (p, drops) {
        // 药香泄露：每滴催熟累积少许，触发布衣其罪（觊觎度）
        if (GAME.Bottle && GAME.Bottle.addRisk) GAME.Bottle.addRisk((this.cfg().riskPerCatalyze || 4) * drops);
    },

    // 阶段A：幼苗（<100 年）→ 一跃百年
    catalyzeToHundred: function (i) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var cfg = this.cfg();
        this._ensure(p);
        var s = this.slot(p, i);
        if (s.empty) { GAME.UI.log("第 " + (i + 1) + " 垄是空的，先下种。", "system"); GAME.UI.updateUI(); return false; }
        if (s.years >= cfg.hundred) { GAME.UI.log("第 " + (i + 1) + " 垄已过百年，无需再催此步。", "system"); GAME.UI.updateUI(); return false; }
        if (!this._needLiquid(p, cfg.liquidPerCatalyze)) return false;
        p.liquid -= cfg.liquidPerCatalyze;
        p.plots[i].y = cfg.hundred;
        this._leak(p, cfg.liquidPerCatalyze);
        GAME.UI.log("一滴绿液没入第 " + (i + 1) + " 垄，幼苗拔节——药龄直跃百年！", "success");
        GAME.UI.autoSave(); GAME.UI.updateUI();
        return true;
    },

    // 阶段B：百年 ~ 千年之间，+250 年/滴
    catalyzeAdd: function (i) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var cfg = this.cfg();
        this._ensure(p);
        var s = this.slot(p, i);
        if (s.empty) { GAME.UI.log("第 " + (i + 1) + " 垄是空的。", "system"); GAME.UI.updateUI(); return false; }
        if (s.years >= cfg.capYears) { GAME.UI.log("第 " + (i + 1) + " 垄已满千年。", "system"); GAME.UI.updateUI(); return false; }
        if (!this._needLiquid(p, cfg.liquidPerCatalyze)) return false;
        p.liquid -= cfg.liquidPerCatalyze;
        p.plots[i].y = Math.min(cfg.capYears, p.plots[i].y + cfg.stepAdd);
        // 下种苗在满百年后继续催熟 → 转入「千年培育」态（满千年前不再提示采收百年药）
        if (p.plots[i].pt === "seed" && (p.plots[i].target || cfg.hundred) === cfg.hundred && p.plots[i].y >= cfg.hundred) {
            p.plots[i].target = cfg.capYears;
        }
        this._leak(p, cfg.liquidPerCatalyze);
        GAME.UI.log("一滴绿液灌下，第 " + (i + 1) + " 垄灵药又长 " + cfg.stepAdd + " 年（现 " + p.plots[i].y + " 年）。", "success");
        GAME.UI.autoSave(); GAME.UI.updateUI();
        return true;
    },

    // 阶段B：直催千年——按缺口自动算绿液滴数，一次拉满
    catalyzeDirect: function (i) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var cfg = this.cfg();
        this._ensure(p);
        var s = this.slot(p, i);
        if (s.empty) { GAME.UI.log("第 " + (i + 1) + " 垄是空的。", "system"); GAME.UI.updateUI(); return false; }
        if (s.years >= cfg.capYears) { GAME.UI.log("第 " + (i + 1) + " 垄已满千年。", "system"); GAME.UI.updateUI(); return false; }
        var drops = Math.ceil((cfg.capYears - p.plots[i].y) / cfg.stepAdd);
        if (!this._needLiquid(p, drops)) return false;
        p.liquid -= drops;
        p.plots[i].y = cfg.capYears;
        if (p.plots[i].pt === "seed" && (p.plots[i].target || cfg.hundred) === cfg.hundred) {
            p.plots[i].target = cfg.capYears;
        }
        this._leak(p, drops);
        GAME.UI.log("连灌 " + drops + " 滴绿液，第 " + (i + 1) + " 垄灵药轰然满千年！", "success");
        GAME.UI.autoSave(); GAME.UI.updateUI();
        return true;
    },

    /* ================= 采收 ================= */
    harvest: function (i) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var cfg = this.cfg(), s = this.slot(p, i);
        if (s.empty) { GAME.UI.log("第 " + (i + 1) + " 垄是空的。", "system"); GAME.UI.updateUI(); return false; }
        if (!(s.mature || s.ready)) {
            var _hm = (s.target === cfg.capYears && !s.ready)
                ? ("差 " + this._fmtMonths(s.left) + "才满千年")
                : (s.years < cfg.hundred ? ("差 " + this._fmtMonths(s.hundredLeft) + "才满百年") : "还未到采收火候");
            GAME.UI.log("第 " + (i + 1) + " 垄的灵药" + s.years + " 年，" + _hm + "——此时起出，只是白糟蹋一株好药。", "system");
            GAME.UI.updateUI(); return false;
        }
        var isQian = s.ready;
        var item = isQian ? cfg.harvestThousand.id : cfg.harvestHundred.id;
        var bonus = (GAME.Home && GAME.Home.yieldBonus) ? GAME.Home.yieldBonus() : 0;
        var n = 1 + bonus;
        GAME.State.addItem(item, n);
        p.plots[i] = null;
        GAME.UI.log("你小心起出第 " + (i + 1) + " 垄的药，得【" + GAME.DATA.ITEMS[item].name + "】×" + n +
            (bonus ? "（灵田 +" + bonus + "）" : "") + "。", "loot");
        GAME.UI.autoSave(); GAME.UI.updateUI();
        return true;
    },

    /* ================= 起出移栽苗（退回百年灵药） ================= */
    pullOut: function (i) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var cfg = this.cfg();
        this._ensure(p);
        var s = this.slot(p, i);
        if (s.empty) { GAME.UI.log("第 " + (i + 1) + " 垄是空的。", "system"); GAME.UI.updateUI(); return false; }
        if (!s.isTransplant) {
            GAME.UI.log("第 " + (i + 1) + " 垄是自个儿下种的灵药，没有可退的百年苗。", "system");
            GAME.UI.updateUI(); return false;
        }
        // 已注入绿液（年份 > 100）：锁死起出，防止误触拔苗吞掉已投入的绿液（#1 防绿液血本无归）
        if (s.years > cfg.hundred) {
            GAME.UI.log("第 " + (i + 1) + " 垄已长到 " + s.years + " 年、注入了绿液，此刻起出只会损失所有年份——静待满千年采收千年灵药。", "system");
            GAME.UI.updateUI(); return false;
        }
        GAME.State.addItem(cfg.transplantItem, 1);   // 退回一株百年灵药
        p.plots[i] = null;
        GAME.UI.log("你起出第 " + (i + 1) + " 垄的移栽苗，退回一株【" + GAME.DATA.ITEMS[cfg.transplantItem].name + "】。", "info");
        GAME.UI.autoSave(); GAME.UI.updateUI();
        return true;
    },

    /* ================= 一键批处理 ================= */
    oneKeySeed: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var cfg = this.cfg();
        this._ensure(p);
        var seeds = GAME.State.countItem(cfg.seedItem), done = 0, i;
        for (i = 0; i < p.plots.length; i++) {
            if (seeds <= 0) break;
            if (p.plots[i]) continue;
            p.plots[i] = { y: cfg.startYearsSeed, h: cfg.seedItem };
            GAME.State.removeItem(cfg.seedItem, 1);
            seeds--; done++;
        }
        if (done === 0) {
            GAME.UI.log("没有空垄可下种，或【" + GAME.DATA.ITEMS[cfg.seedItem].name + "】不足。", "system");
            GAME.UI.updateUI(); return false;
        }
        GAME.UI.log("你一口气在 " + done + " 垄空地里播下灵药种子，静待生发。", "success");
        GAME.UI.autoSave(); GAME.UI.updateUI();
        return true;
    },
    oneKeyHarvest: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var done = 0, i;
        for (i = 0; i < p.plots.length; i++) {
            var s = this.slot(p, i);
            if (!s.empty && (s.mature || s.ready)) { if (this.harvest(i)) done++; }
        }
        if (done === 0) {
            GAME.UI.log("没有可采收的灵药（须满百年）。", "system");
            GAME.UI.updateUI(); return false;
        }
        return true;
    },

    /* ================= 面板摘要 ================= */
    status: function (p) {
        p = p || GAME.State.p();
        if (!p) return null;
        this._ensure(p);
        var list = this.slots(p), growing = 0, mature = 0, ready = 0, nextLeft = null, growingQian = 0, i;
        var cap = this.cfg().capYears;
        for (i = 0; i < list.length; i++) {
            if (list[i].empty) continue;
            growing++;
            if (list[i].mature) mature++;
            if (list[i].ready) ready++;
            else if (nextLeft === null || list[i].left < nextLeft) nextLeft = list[i].left;
            // 千年培育中（移栽苗 / 下种苗已转千年、未满千年）：计入「培育千年药中」
            if (list[i].target === cap && !list[i].ready) growingQian++;
        }
        return {
            plots: this.plots(), growing: growing, mature: mature, ready: ready,
            growingQian: growingQian,
            nextLeft: nextLeft, list: list,
            seed: GAME.State.countItem(this.cfg().seedItem)
        };
    },

    _fmtMonths: function (m) {
        if (!(m > 0)) return "";
        var y = Math.floor(m / 12), mo = m % 12;
        if (y <= 0) return mo + " 月";
        return y + " 年" + (mo ? " " + mo + " 月" : "");
    }
};
