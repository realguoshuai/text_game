/* =========================================================
 * js/mansion.js —— 夜探墨府（景阳城·玄机世家主线子玩法）
 * 无网格、无迷雾：府中四处可搜之所（书房/账房/药庐/玄机子密室）列成清单，点哪个搜哪个。
 * 每次【搜检】或【盘问下人】耗 1 次时机（今夜共 acts 次）；搜检会惊动府中（警惕值上升），
 * 撞上惊蛟会巡卫须【隐匿绕行 / 行贿打点 / 硬闯斗法】三选其一。
 * 集齐 clueTarget 条线索再入内堂见颜氏 → 最优结局；被惊动（警惕值满）则仓皇收场。
 * 线索链同时铺陈【升仙令】来历：书房（异人授令）→ 密藏手札（苍南山形图 + 破阵口诀）。
 * 战斗归属 p.combatRoute={type:"mansion"}，胜负回 afterCombat。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Mansion = {

    cfg: function () { return GAME.DATA.MANSION; },

    // ---------- 开局：翻墙入府 ----------
    start: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat || p.mansion) return;
        var c = this.cfg();

        p.mansion = {
            acts: c.acts,           // 剩余时机
            clues: 0,
            alert: 0,
            searched: {},           // 已搜检之所 { roomId: true }
            questioned: false,      // 下人已盘问过
            pendingPatrol: false,   // 巡卫当面，须先打发
            lore: {},               // 已得线索 { shufang:true, ... }
            vaultOpened: false,
            busted: false,
        };
        GAME.UI.log("【夜探墨府】" + c.enter, "danger");
        GAME.UI.log("（今夜只有 " + c.acts + " 次动手的时机——搜检一处或盘问下人，各耗其一。动静越大，惊蛟会越发警觉。）", "system");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 搜检某处 ----------
    searchRoom: function (rid) {
        var p = GAME.State.p();
        var m = p.mansion;
        var c = this.cfg();
        if (!m || p.combat || p.isDead || m.pendingPatrol) return;
        if (m.busted) return;
        if (m.searched[rid]) { GAME.UI.log("此处已搜检过了。", "system"); GAME.UI.updateUI(); return; }
        if (m.acts <= 0) {
            GAME.UI.log("东方已现鱼肚白——再不走便走不脱了。", "warning");
            this.finish();
            return;
        }

        m.acts -= 1;
        m.searched[rid] = true;
        m.alert += c.alertPerSearch;
        if (rid === "yaolu" && GAME.Codex) GAME.Codex.unlockLore("lore_moyinshou");   // 图鉴·秘闻：药庐瓦瓮

        if (rid === "vault") {
            if (m.vaultOpened) {
                GAME.UI.log("暗格已空，只余一层薄灰。", "info");
            } else if (m.clues >= c.vault.needClues) {
                m.vaultOpened = true;
                m.lore.vault = true;
                GAME.UI.log(c.vault.text, "success");
                GAME.UI.log(c.vault.lore, "success");
                (c.vault.loot || []).forEach(function (id) {
                    GAME.State.addItem(id, 1);
                    GAME.UI.log("获得【" + GAME.DATA.ITEMS[id].name + "】×1。", "loot");
                });
                var st = this.rand(c.vault.stones[0], c.vault.stones[1]);
                p.spiritStones += st;
                GAME.UI.log("匣中另有灵石 " + st + " 枚。", "loot");
            } else {
                GAME.UI.log(c.vault.hint, "system");
            }
        } else {
            var room = null, i;
            for (i = 0; i < c.rooms.length; i++) if (c.rooms[i].id === rid) room = c.rooms[i];
            var spot = room && (typeof room.clue === "number") ? c.clueSpots[room.clue] : null;
            if (spot && !m.lore[spot.id]) {
                m.lore[spot.id] = true;
                m.clues += 1;
                GAME.UI.log(spot.text, "info");
                GAME.UI.log("【线索 +1】" + spot.lore, "success");
            } else {
                GAME.UI.log("除了积尘与蛛网，一无所获。", "info");
            }
        }

        // 巡卫检定：警惕越高，撞见巡卫的可能越大
        if (!m.busted && !m.pendingPatrol) {
            var chance = c.patrolBase + m.alert * c.patrolPerAlert;
            if (Math.random() < chance) {
                m.pendingPatrol = true;
                GAME.UI.log(c.patrol.text, "danger");
            }
        }
        this._checkBust();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 盘问下人（花银子：暂缓警惕 + 点明暗格所在） ----------
    question: function () {
        var p = GAME.State.p();
        var m = p.mansion;
        var c = this.cfg();
        if (!m || p.combat || p.isDead || m.pendingPatrol) return;
        if (m.questioned) { GAME.UI.log("此人已问过了，再逼也问不出新东西。", "system"); GAME.UI.updateUI(); return; }
        if (p.silver < c.questionSilver) { GAME.UI.log(c.servant.poor, "system"); GAME.UI.updateUI(); return; }
        if (m.acts <= 0) {
            GAME.UI.log("东方已现鱼肚白——再不走便走不脱了。", "warning");
            this.finish();
            return;
        }

        p.silver -= c.questionSilver;
        m.acts -= 1;
        m.questioned = true;
        m.alert = Math.max(0, m.alert - c.alertRelief);
        GAME.UI.log(c.servant.text, "info");
        GAME.UI.log(c.servant.question, "info");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 应对巡卫：sneak 隐匿 / bribe 行贿 / fight 硬闯 ----------
    resolvePatrol: function (how) {
        var p = GAME.State.p();
        var m = p.mansion;
        var c = this.cfg();
        if (!m || !m.pendingPatrol || p.combat || p.isDead) return;

        if (how === "bribe") {
            if (p.silver < c.bribeSilver) { GAME.UI.log(c.patrol.bribePoor, "system"); GAME.UI.updateUI(); return; }
            p.silver -= c.bribeSilver;
            GAME.UI.log(c.patrol.bribe, "system");
            this._clearPatrol();
            GAME.UI.autoSave(); GAME.UI.updateUI(); return;
        }
        if (how === "sneak") {
            var s = GAME.State.getStats();
            var conceal = !!(p.concealLevel > 0 || (p.spells && (p.spells.yufeng_shu || p.spells.lianqi_shu)));
            var ok = conceal;
            if (!ok) {
                var chance = Math.min(0.8, Math.max(0.1, 0.35 + (s.speed - 9) * 0.05));
                ok = Math.random() < chance;
            }
            if (ok) {
                GAME.UI.log(c.patrol.sneakOk, "success");
                m.alert += 5;
                this._clearPatrol();
                GAME.UI.autoSave(); GAME.UI.updateUI(); return;
            }
            GAME.UI.log(c.patrol.sneakFail, "danger");
            m.alert += c.alertPerSneak;
        }
        // 硬闯（或隐匿失手）：进入战斗
        p.combatRoute = { type: "mansion" };
        GAME.Combat.start(c.patrolMonster);
    },

    // ---------- 战斗回执 ----------
    afterCombat: function (win, ctx) {
        var p = GAME.State.p();
        var m = p.mansion;
        var c = this.cfg();
        if (!m) return;
        if (!win) {
            GAME.UI.log("你力有不逮，被巡卫一路逼出府外——今夜算是白来了。", "danger");
            m.busted = true;
            this.finish();
            return;
        }
        m.alert += c.alertPerFight;
        GAME.UI.log(c.patrol.fightWin, "warning");
        this._clearPatrol();
        this._checkBust();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 主动撤离（放弃本次探查） ----------
    abandon: function () {
        var p = GAME.State.p();
        if (!p.mansion || p.combat || p.isDead) return;
        GAME.UI.log("你趁夜色翻墙退出墨府——线索虽未集齐，好歹人是全的。", "warning");
        this.finish();
    },

    // ---------- 结算：入内堂见颜氏 / 时机耗尽 / 被惊动 ----------
    finish: function () {
        var p = GAME.State.p();
        var m = p.mansion;
        var c = this.cfg();
        if (!m) return;
        var tier;
        if (m.busted) tier = "bust";
        else if (m.clues >= c.clueTarget) tier = "best";
        else if (m.clues >= 1) tier = "mid";
        else tier = "bad";
        GAME.UI.log(c.endings[tier], (tier === "best") ? "success" : ((tier === "bust" || tier === "bad") ? "danger" : "info"));

        // 存档至玄机世家主线：线索数 / 是否得秘辛（手札）/ 是否被惊动
        if (!p.jiayuan) p.jiayuan = { stage: 2 };
        p.jiayuan.clues = m.clues;
        p.jiayuan.lore = !!m.lore.vault;
        p.jiayuan.busted = !!m.busted;
        p.jiayuan.stage = 2;
        p.mansion = null;
        // 玄机世家主线面板由 applyPanels 紧急逻辑自动显示（已并入大地图）
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 打发巡卫 ----------
    _clearPatrol: function () {
        var m = GAME.State.p().mansion;
        if (!m) return;
        m.pendingPatrol = false;
    },

    _checkBust: function () {
        var m = GAME.State.p().mansion;
        var c = this.cfg();
        if (!m || m.busted) return;
        if (m.alert >= c.alertBust) {
            m.busted = true;
            GAME.UI.log("府中锣声大作，火把四面合围——惊蛟会的人被惊动了！", "danger");
            this.finish();
        }
    },

    // ---------- UI 可用性判定 ----------
    canSearch: function (rid) {
        var p = GAME.State.p(); var m = p.mansion;
        if (!m || m.pendingPatrol || m.busted) return false;
        if (m.acts <= 0) return false;
        return !m.searched[rid];
    },
    canQuestion: function () {
        var p = GAME.State.p(); var m = p.mansion;
        if (!m || m.pendingPatrol || m.busted) return false;
        if (m.questioned || m.acts <= 0) return false;
        return p.silver >= this.cfg().questionSilver;
    },

    rand: function (min, max) {
        if (GAME.Core && GAME.Core.rand) return GAME.Core.rand(min, max);
        return min + Math.floor(Math.random() * (max - min + 1));
    },
};
