/* =========================================================
 * js/sect.js —— 宗门杂役与经营（资源置换 + 风险）
 * 承接杂役任务（耗时 / 收益 / 煞气）、监守自盗（绿液催熟私藏 + 被察惩罚）、
 * 宗门贡献累积与兑换。全部配置读取自 GAME.DATA.CONTENT。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Sect = {

    findMission: function (id) {
        var list = GAME.DATA.CONTENT.MISSIONS;
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    },
    findExchange: function (id) {
        var list = GAME.DATA.CONTENT.SECT_EXCHANGE;
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    },

    // ---------- 承接杂役任务 ----------
    doMission: function (missionId) {
        var p = GAME.State.p();
        if (p.isDead || p.combat || p.pendingEvent || p.pendingMercy || p.trial) return;
        var m = this.findMission(missionId);
        if (!m) return;

        GAME.UI.log("你接下宗门杂役【" + m.name + "】，兢兢业业，耗时 " + m.months + " 个月……", "system");
        GAME.Core.passTime(m.months);
        if (p.isDead) return;

        // 酬劳：灵石 + 随机物品
        var stones = GAME.Core.rand(m.reward.stones[0], m.reward.stones[1]);
        p.spiritStones += stones;
        GAME.UI.log("杂役酬劳到手：灵石 +" + stones + "。", "loot");
        (m.reward.items || []).forEach(function (it) {
            if (Math.random() < it.chance) {
                var q = GAME.Core.rand(it.qty[0], it.qty[1]);
                if (q > 0) {
                    GAME.State.addItem(it.id, q);
                    GAME.UI.log("顺手得【" + GAME.DATA.ITEMS[it.id].name + "】×" + q + "。", "loot");
                }
            }
        });

        // 宗门贡献
        p.sectContrib += m.contrib;
        GAME.UI.log("宗门贡献 +" + m.contrib + "（现 " + p.sectContrib + "）。", "info");

        // 任务附带效果（地脉煞气 / 气血上限受损）
        if (m.onDone) {
            if (m.onDone.shaQi) {
                p.shaQi += m.onDone.shaQi;
                GAME.UI.log("地脉煞气缠身，煞气值 +" + m.onDone.shaQi + "。", "warning");
            }
            if (m.onDone.maxHpLoss) {
                p.maxHp = Math.max(10, p.maxHp - m.onDone.maxHpLoss);
                p.currentHp = Math.min(p.currentHp, p.maxHp);
                GAME.UI.log("煞气侵体，气血上限 -" + m.onDone.maxHpLoss + "！", "danger");
            }
        }

        p.stats.oddjobs += 1;
        GAME.Core.checkAchievements();
        GAME.Core.checkDeath();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 监守自盗（仅百草园执事有此暗手） ----------
    // 耗 1 滴绿液催熟私藏药草；15% 概率被药园长老神识察觉，触发罚没/折寿
    steal: function (missionId) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        var m = this.findMission(missionId);
        if (!m || !m.steal) return;
        if (p.liquid < m.steal.liquid) {
            GAME.UI.log("瓶中绿液不足 " + m.steal.liquid + " 滴，无从催熟私藏药草。", "system");
            GAME.UI.updateUI();
            return;
        }
        p.liquid -= m.steal.liquid;
        GAME.State.addItem(m.steal.gain.id, m.steal.gain.qty);
        GAME.UI.log("你借承露瓶绿液催熟私藏药草，得【" + GAME.DATA.ITEMS[m.steal.gain.id].name + "】×" + m.steal.gain.qty + "。", "success");

        if (Math.random() < m.steal.catchChance) {
            // 抽取惩罚
            var pen = this._pick(m.steal.penalty);
            GAME.UI.log("忽有一道神识扫过百草园——药园长老察觉了你的手脚！", "danger");
            if (pen.type === "loseStones") {
                var lost = Math.min(p.spiritStones, GAME.Core.rand(pen.amount[0], pen.amount[1]));
                p.spiritStones -= lost;
                GAME.UI.log(pen.text + "（罚没 " + lost + " 灵石）", "danger");
            } else { // age
                var a = GAME.Core.rand(pen.amount[0], pen.amount[1]);
                p.ageYears += a;
                GAME.UI.log(pen.text + "（折寿 " + a + " 年）", "danger");
            }
        } else {
            GAME.UI.log("四下无人，你悄然将私药收入袖中。", "info");
        }
        GAME.Core.checkDeath();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 宗门贡献兑换 ----------
    exchange: function (itemId) {
        var p = GAME.State.p();
        if (p.isDead) return;
        var e = this.findExchange(itemId);
        if (!e) return;
        if (p.sectContrib < e.cost) {
            GAME.UI.log("宗门贡献不足（需 " + e.cost + "，现 " + p.sectContrib + "）。", "system");
            GAME.UI.updateUI();
            return;
        }
        p.sectContrib -= e.cost;
        GAME.State.addItem(itemId, 1);
        GAME.UI.log("以 " + e.cost + " 点贡献兑换【" + e.name + "】。", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 工具：按 chance 抽取一条结果 ----------
    _pick: function (list) {
        var total = 0, i;
        for (i = 0; i < list.length; i++) total += list[i].chance;
        var roll = Math.random() * total, picked = list[list.length - 1];
        for (i = 0; i < list.length; i++) { if (roll < list[i].chance) { picked = list[i]; break; } roll -= list[i].chance; }
        return picked;
    },

    // ================= 宗门生态（拜入青梧谷后解锁，配置在 CONTENT.SECT2） =================

    _cfg2: function () { return GAME.DATA.CONTENT.SECT2; },

    isDisciple: function () {
        var p = GAME.State.p();
        return !!p.sectId && p.sectId === this._cfg2().sectId;
    },

    // 此刻能否应差：返回不可行的缘由文案（null = 可行）。
    // 一律以显式日志回执，避免旧版「点了没反应、也没提示」的静默失败。
    _blockReason: function () {
        var p = GAME.State.p();
        if (p.isDead) return "你已身死道消，无从应差。";
        if (p.combat) return "斗法正酣，脱身不得。";
        if (p.pendingEvent) return "眼前之事尚未决断，容后再应差事。";
        if (p.pendingMercy) return "战后处置未定，稍后再论。";
        if (p.trial) return "血月试炼未出，脱身不得。";
        if (p.fzone) return "身陷血色禁地，脱身不得。";
        return null;
    },

    // 统一门槛：可应差则 true；否则回执原因并 false
    _canAct: function () {
        var reason = this._blockReason();
        if (reason) { GAME.UI.log(reason, "system"); GAME.UI.updateUI(); return false; }
        if (!this.isDisciple()) {
            GAME.UI.log("你并非" + GAME.DATA.TAINAN.token.sectName + "门人，无从应这份差事。", "system");
            GAME.UI.updateUI();
            return false;
        }
        return true;
    },

    // 灵矿挖矿：地脉煞气蚀骨（气血上限受损），换灵石与贡献
    sectMine: function () {
        var p = GAME.State.p();
        if (!this._canAct()) return;
        var m = this._cfg2().mine;
        GAME.UI.log("你领了灵矿挖矿的差事——" + m.text, "system");
        GAME.Core.passTime(m.months);
        if (p.isDead) return;
        var stones = GAME.Core.rand(m.stones[0], m.stones[1]);
        p.spiritStones += stones;
        p.sectContrib += m.contrib;
        p.maxHp = Math.max(10, p.maxHp - m.maxHpLoss);
        p.currentHp = Math.min(p.currentHp, p.maxHp);
        p.stats.oddjobs += 1;
        GAME.UI.log("矿砂入账：灵石 +" + stones + "，贡献 +" + m.contrib + "。然地脉煞气侵体，气血上限 -" + m.maxHpLoss + "！", "loot");
        GAME.Core.checkDeath();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // 传功阁抄书：清贵安稳，贡献优厚
    sectCopy: function () {
        var p = GAME.State.p();
        if (!this._canAct()) return;
        var m = this._cfg2().copy;
        GAME.UI.log("你入传功阁抄书——" + m.text, "system");
        GAME.Core.passTime(m.months);
        if (p.isDead) return;
        var stones = GAME.Core.rand(m.stones[0], m.stones[1]);
        p.spiritStones += stones;
        p.sectContrib += m.contrib;
        p.stats.oddjobs += 1;
        GAME.UI.log("抄书酬劳：灵石 +" + stones + "，贡献 +" + m.contrib + "（现 " + p.sectContrib + "）。", "loot");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // 百草园管事：行贿执事长老（贡献 60 或灵石 200）方可任职
    takeGarden: function (payBy) {
        var p = GAME.State.p();
        if (!this._canAct()) return;
        var g = this._cfg2().garden;
        if (p.garden) { GAME.UI.log("你已是百草园管事，明年年底前记得上交灵药 " + g.quotaQty + " 株。", "system"); GAME.UI.updateUI(); return; }
        if (payBy === "contrib") {
            if (p.sectContrib < g.bribeContrib) {
                GAME.UI.log("宗门贡献不足（需 " + g.bribeContrib + "，现 " + p.sectContrib + "）。", "system");
                GAME.UI.updateUI();
                return;
            }
            p.sectContrib -= g.bribeContrib;
            GAME.UI.log("你以 " + g.bribeContrib + " 点贡献活动了执事长老。", "system");
        } else {
            if (p.spiritStones < g.bribeStones) {
                GAME.UI.log("灵石不足（需 " + g.bribeStones + "，现 " + p.spiritStones + "）。", "system");
                GAME.UI.updateUI();
                return;
            }
            p.spiritStones -= g.bribeStones;
            GAME.UI.log("你趁夜塞给执事长老一只沉甸甸的储物袋（" + g.bribeStones + " 灵石）。", "system");
        }
        p.garden = { due: g.dueMonths };
        GAME.UI.log("【百草园管事】差事到手！园中【灵眼之泉】任你取用——以绿液催熟私药再无神识查获之虞（两成概率灵泉双收）。唯每年年底须上交" + GAME.DATA.ITEMS[g.quotaHerb].name + "×" + g.quotaQty + "，逾期褫夺管事、罚贡献 " + g.kickPenalty + "。", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },
};
