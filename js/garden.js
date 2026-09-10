/* =========================================================
 * js/garden.js —— 百草园控制器（拜入青梧谷后的"借鸡生蛋"核心）
 * 明田：管事份内的官田——每半年上交 10 株常规草药（可提前上缴），逾期褫夺。
 * 暗田：私藏药田——绿液催熟私药；管事有【灵眼之泉】护持（0% 泄露 + 两成双收），
 *       无管事之职则每次催熟累积【泄露值】+10，达 80 红灯预警：长老神识将于下月掠过药园。
 * 规避（明牌二选一，100% 生效）：
 *   ① 催熟时消耗【恶臭草】掩盖（泄露值不增）；② 将私药【暂存于玄傀体内】——神识搜查不可及。
 * 神识掠过（下月结算）：有恶臭草自动焚草掩味 / 玄傀体内藏药则无所获 / 两手空空则查获罚没。
 * 年结逻辑由 core.passTime 委派 tick()；催熟入口 catalyze()，散修回落 core.catalyze。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Garden = {

    cfg: function () {
        return (GAME.DATA.CONTENT.SECT2 && GAME.DATA.CONTENT.SECT2.garden) || null;
    },

    // ---------- 是否在青梧谷（百草园玩法前提） ----------
    active: function () {
        var p = GAME.State.p();
        return !!(p.sectId && p.sectId === GAME.DATA.CONTENT.SECT2.sectId && this.cfg());
    },

    // ---------- 明田：提前上缴半年例（不等结算） ----------
    submit: function () {
        var p = GAME.State.p();
        var g = this.cfg();
        if (!this.active()) { GAME.UI.log("你尚未拜入青梧谷，何来官田差事。", "system"); GAME.UI.updateUI(); return; }
        if (!p.garden) { GAME.UI.log("你并未执掌百草园，无例可缴。（可先在杂役堂行贿执事长老谋差事）", "system"); GAME.UI.updateUI(); return; }
        if (GAME.State.countItem(g.quotaHerb) < g.quotaQty) {
            GAME.UI.log("存药不足 " + g.quotaQty + " 株【" + GAME.DATA.ITEMS[g.quotaHerb].name + "】，缴不齐反落口实——且去催熟或购置。", "system");
            GAME.UI.updateUI();
            return;
        }
        GAME.State.removeItem(g.quotaHerb, g.quotaQty);
        p.sectContrib += g.settleContrib;
        p.garden.due = g.dueMonths;   // 顺延至下半年结
        GAME.UI.log("【明田上缴】你把 " + g.quotaQty + " 株灵药亲手送到执事堂——账目清爽，管事之位再稳半年（贡献 +" + g.settleContrib + "）。", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 半年结（core.passTime 委派）：神识掠过结算 + 明田上缴 ----------
    tick: function (months) {
        var p = GAME.State.p();
        var g = this.cfg();
        if (!g || !this.active()) return;

        // 1) 神识掠过（泄露值达 80 后置位，下月结算；规避手段二选一均 100% 生效）
        if (p.leakSweep) {
            p.leakSweep = false;
            if (GAME.State.countItem("herb_ecao") >= 1) {
                GAME.State.removeItem("herb_ecao", 1);
                p.leak = Math.max(0, p.leak - 60);
                GAME.UI.log("【神识掠过】执法长老的神识自园墙上空扫过——恶臭草的臭气正浓，将灵机波动遮了个严实。有惊无险。（泄露值 -60，现 " + p.leak + "）", "success");
            } else if (this._stashCount() > 0) {
                p.leak = Math.max(0, p.leak - 40);
                GAME.UI.log("【神识掠过】神识在你的暗田里翻了个遍——私药都藏在玄傀体内，搜查一无所获。（泄露值 -40，现 " + p.leak + "）", "success");
            } else {
                var lost = Math.min(p.spiritStones, GAME.Core.rand(g.catchStones[0], g.catchStones[1]));
                p.spiritStones -= lost;
                var took = this._confiscateOne();
                p.leak = g.leakReset;
                GAME.UI.log("【神识掠过】执法长老神识循着药香直入暗田" + (took ? "——【" + GAME.DATA.ITEMS[took].name + "】被当场罚没" : "") +
                    "，另罚灵石 " + lost + "！早该用【恶臭草】掩味，或把私药暂存到玄傀体内。", "danger");
            }
        }

        // 2) 明田半年结
        if (!p.garden) return;
        p.garden.due -= months;
        if (p.garden.due > 0) return;
        if (GAME.State.countItem(g.quotaHerb) >= g.quotaQty) {
            GAME.State.removeItem(g.quotaHerb, g.quotaQty);
            p.sectContrib += g.settleContrib;
            p.garden.due = g.dueMonths;   // 顺延至下半年结
            GAME.UI.log("【百草园半年结】你如期上交灵药 " + g.quotaQty + " 株，执事长老颔首满意（贡献 +" + g.settleContrib + "，管事之位顺延半年）。", "success");
        } else {
            p.garden = null;
            p.sectContrib = Math.max(0, p.sectContrib - g.kickPenalty);
            GAME.UI.log("【百草园半年结】你交不出灵药 " + g.quotaQty + " 株——管事之位被褫夺，贡献罚去 " + g.kickPenalty + "！", "danger");
        }
    },

    // ---------- 明田：种植恶臭草（耗时 1 月，收 2 株——比坊市买划算） ----------
    plantEcao: function () {
        var p = GAME.State.p();
        if (!this.active()) { GAME.UI.log("你尚未拜入青梧谷，无园可种。", "system"); GAME.UI.updateUI(); return; }
        if (p.isDead || p.combat) return;
        var extra = (GAME.Home && GAME.Home.yieldBonus) ? GAME.Home.yieldBonus() : 0;   // 灵田：多收几株
        var n = 2 + extra;
        GAME.State.addItem("herb_ecao", n);
        GAME.UI.log("你在园角辟了半垄地，种下奇臭无比的恶臭草。一月之后，收获【恶臭草】×" + n +
            (extra ? "（灵田 +" + extra + "）" : "") + "——臭得连蜂蝶都绕道，正好掩药香。", "success");
        GAME.Core.passTime(1);
    },

    // ---------- 暗田：绿液催熟私药（青梧谷弟子专用入口） ----------
    // useEcao：催熟的同时焚一株恶臭草掩盖灵机波动（泄露值不增）
    catalyze: function (herbId, useEcao) {
        var p = GAME.State.p();
        var g = this.cfg();
        if (!this.active()) { GAME.Core.catalyze(1, herbId); return; }   // 散修回落旧路
        if (p.isDead || p.combat) return;
        if (p.liquid < 1) {
            GAME.UI.log("瓶中绿液不足 1 滴，强行催动毫无反应。", "system");
            GAME.UI.updateUI();
            return;
        }
        if (useEcao && GAME.State.countItem("herb_ecao") < 1) {
            GAME.UI.log("身边没有【恶臭草】——可在百草园亲手种（1 月收 2 株），或苍南坊市购置。", "system");
            GAME.UI.updateUI();
            return;
        }
        p.liquid -= 1;
        if (useEcao) GAME.State.removeItem("herb_ecao", 1);
        GAME.State.addItem(herbId, 1);
        GAME.UI.log("绿液化作雾气没入" + (p.garden ? "灵眼之泉畔" : "暗田角落") + "的药苗，须臾之间，一株【" + GAME.DATA.ITEMS[herbId].name + "】长成！" + (useEcao ? "（恶臭草的臭气盖住了灵机波动）" : ""), "success");
        this.afterCatalyze(herbId, useEcao);
        GAME.Core.passTime(1);
    },

    // ---------- 催熟后的泄露值结算（core.catalyze 亦委派至此） ----------
    afterCatalyze: function (herbId, useEcao) {
        var p = GAME.State.p();
        var g = this.cfg();
        if (!g) return;
        if (p.garden) {
            // 灵眼之泉：管事特权——灵泉浸润掩去一切波动，另有两成概率药力双收
            if (Math.random() < g.springBonusChance) {
                GAME.State.addItem(herbId, 1);
                GAME.UI.log("灵眼之泉灵机涌动，泉眼旁竟又洇出一株同种灵药——双收！", "success");
            }
            return;
        }
        // 无管事之职的弟子：暗田催熟累积泄露值（恶臭草掩盖则不增）
        var add = useEcao ? 0 : g.leakPerCatalyze;
        p.leak = (p.leak || 0) + add;
        if (p.leak >= g.leakWarn) {
            // 红灯预警：长老神识下月掠过药园——规避手段二选一，均 100% 生效
            p.leakSweep = true;
            GAME.UI.log("【泄露值 " + p.leak + "/" + g.leakCaught + "】红灯警示：执法长老的神识将于下月掠过药园！" +
                "速做打算——①催熟时焚【恶臭草】掩味；②把私药【暂存于玄傀体内】；两手空空硬抗，则必被查获罚没。", "danger");
        } else if (add > 0) {
            GAME.UI.log("【泄露值 +" + add + "（现 " + p.leak + "/" + g.leakWarn + "）】药香隐隐外泄，暂无人察觉。达 " + g.leakWarn + " 时神识便会掠园——早备恶臭草为上。", "info");
        }
    },

    // ---------- 玄傀暂存：私药藏入铁奴体内，神识搜查不可及 ----------
    stash: function () {
        var p = GAME.State.p();
        if (!this.active()) return;
        if (!p.companion || p.companion.hp <= 0) { GAME.UI.log("玄傀不在身旁，无处寄藏。", "system"); GAME.UI.updateUI(); return; }
        p.gardenStash = p.gardenStash || {};
        var ids = ["herb_tianling", "herb_yumo", "herb_zihou", "herb_bainian", "herb_qiannian"];
        var moved = 0, self = this;
        ids.forEach(function (id) {
            var n = GAME.State.countItem(id);
            if (n > 0) { GAME.State.removeItem(id, n); p.gardenStash[id] = (p.gardenStash[id] || 0) + n; moved += n; }
        });
        if (!moved) { GAME.UI.log("储物袋里没有可寄藏的灵药。", "system"); GAME.UI.updateUI(); return; }
        GAME.UI.log("你把 " + moved + " 株私药逐一送入玄傀腹中——铁奴周身煞气天然蔽障灵机，神识搜查万难察觉。（暂存 " + this._stashCount() + " 株）", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // 玄傀体内取回私药
    unstash: function () {
        var p = GAME.State.p();
        if (!p.gardenStash) return;
        var n = 0;
        Object.keys(p.gardenStash).forEach(function (id) {
            GAME.State.addItem(id, p.gardenStash[id]);
            n += p.gardenStash[id];
        });
        p.gardenStash = null;
        GAME.UI.log("玄傀张口吐出一个布包——" + n + " 株私药完璧归赵，药香如故。", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 面板状态摘要（UI 渲染用） ----------
    status: function () {
        var p = GAME.State.p();
        var g = this.cfg();
        if (!g) return null;
        return {
            inSect: this.active(),
            manager: !!p.garden,
            due: p.garden ? p.garden.due : 0,
            quota: g.quotaQty,
            quotaHerb: g.quotaHerb,
            leak: p.leak || 0,
            leakWarn: g.leakWarn,
            leakCaught: g.leakCaught,
            sweep: !!p.leakSweep,
            stash: this._stashCount(),
        };
    },

    // ---------- 工具 ----------
    _stashCount: function () {
        var p = GAME.State.p();
        if (!p.gardenStash) return 0;
        return Object.keys(p.gardenStash).reduce(function (s, id) { return s + p.gardenStash[id]; }, 0);
    },
    _confiscateOne: function () {
        var ids = ["herb_tianling", "herb_yumo", "herb_zihou", "herb_qiannian", "herb_bainian"];
        for (var i = 0; i < ids.length; i++) {
            if (GAME.State.countItem(ids[i]) > 0) { GAME.State.removeItem(ids[i], 1); return ids[i]; }
        }
        return null;
    },
};
