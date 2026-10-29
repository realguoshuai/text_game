/* =========================================================
 * js/secret_relic.js —— 古修遗迹·探宝（筑基期专属 roguelike 副本）
 *
 * 进入：筑基以上、非战斗、无待决事件。休整 4 月。
 * 机制：固定 12 步探索，每步加权随机——采灵物 / 撬宝箱 / 触机关 / 战残魂。
 * 结算：走完 12 步自出口脱离保住战利品；残魂战由 combat.js 路由至 afterCombat。
 * 设计仿 js/trial.js 的 step 机制，但专属筑基、可反复刷（不标记永久通关）。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Relic = {

    cfg: function () { return GAME.DATA.RELIC; },

    // ---------- 进入条件 ----------
    canEnter: function () {
        var p = GAME.State.p();
        return !p.isDead && !p.combat && !p.pendingEvent && !p.pendingMercy && !p.relic &&
               p.realmIndex >= this.cfg().enterRealm;
    },

    start: function () {
        var p = GAME.State.p();
        var cfg = this.cfg();
        if (p.realmIndex < cfg.enterRealm) {
            GAME.UI.log("需筑基以上方可探古修遗迹。", "system");
            GAME.UI.updateUI();
            return;
        }
        if (!this.canEnter()) { GAME.UI.updateUI(); return; }
        var cd = GAME.State.cdLeft("relic");
        if (cd > 0) {
            GAME.UI.log("遗迹禁制尚未复原，须再候 " + cd + " 月方可再探。", "system");
            GAME.UI.updateUI();
            return;
        }
        if (GAME.Core && GAME.Core.autoCultRunning && GAME.Core.autoCultRunning())
            GAME.Core.stopAutoCult("已入古修遗迹，石门落锁——洞府里的功课只能先搁下。");
        p.relic = {
            stepsLeft: cfg.steps, active: true,
            encounter: "石门初启，尘封千载的灵机扑面而来——十二步探秘，生死未卜。前路幽深，唯见石壁古刻指引去踪。"
        };
        // ⚠ 冷却「不在进入时」挂，而只在「脱离/走完」时挂（见 exit / flee）。
        // 旧版在此 setCd，会导致「探索中（p.relic 为真→全场锁定）」与「休整中（cdLeft>0→节点显示【休整中】）」
        // 两个状态同时为真——玩家既被判定身处秘境深处（修行/身家/宗门/历练全锁死），
        // 节点又显示【休整中 · 尚需 4 月】，进退失据、像被永久困住。现在冷却只在真正离场后起算，
        // 探索期间 cdLeft 恒为 0：状态互斥，互不打架（见 state.js 的 dungeonName 单一判据）。
        GAME.UI.log("你推开古修洞府的石门，尘封千载的灵机扑面而来——十二步探秘，生死未卜。", "danger");
        GAME.UI.updateUI();
    },

    // ---------- 前进一探（每次消耗 1 步） ----------
    step: function () {
        var p = GAME.State.p();
        if (!p.relic || p.isDead) return;
        if (p.relic.stepsLeft <= 0) { this.exit(); return; }
        var cfg = this.cfg();

        // 加权抽取事件
        var evs = cfg.events, total = 0, i;
        for (i = 0; i < evs.length; i++) total += evs[i].weight;
        var roll = Math.random() * total, picked = evs[evs.length - 1];
        for (i = 0; i < evs.length; i++) { if (roll < evs[i].weight) { picked = evs[i]; break; } roll -= evs[i].weight; }

        var stepNo = cfg.steps - p.relic.stepsLeft + 1;
        p.relic.stepsLeft -= 1;

        if (picked.type === "gather") {
            var g = this._pick(cfg.gatherTable);
            var q = g.qty ? GAME.Core.rand(g.qty[0], g.qty[1]) : 1;
            GAME.State.addItem(g.id, q);
            GAME.UI.log("第 " + stepNo + " 步：你采得【" + GAME.DATA.ITEMS[g.id].name + "】×" + q + "！（已入囊）", "success");
            p.relic.encounter = "第 " + stepNo + " 步：你于断壁残垣间采得【" + GAME.DATA.ITEMS[g.id].name + "】×" + q + "。灵物莹润生辉，已悄然纳入囊中。";
        } else if (picked.type === "chest") {
            var c = this._pick(cfg.chestTable);
            var q2 = c.qty ? GAME.Core.rand(c.qty[0], c.qty[1]) : 1;
            GAME.State.addItem(c.id, q2);
            GAME.UI.log("第 " + stepNo + " 步：你撬开一只古修宝箱，得【" + GAME.DATA.ITEMS[c.id].name + "】×" + q2 + "！", "loot");
            p.relic.encounter = "第 " + stepNo + " 步：你撬开一只古修遗下的石匣，得【" + GAME.DATA.ITEMS[c.id].name + "】×" + q2 + "。宝光乍现，似有前人遗泽封存其中。";
        } else if (picked.type === "trap") {
            var t = cfg.trap;
            var d = GAME.Core.rand(t.hp[0], t.hp[1]);
            p.currentHp -= d;
            var sp = GAME.Core.rand(Math.round(t.stonePct[0] * 100), Math.round(t.stonePct[1] * 100)) / 100;
            var lost = Math.floor(p.spiritStones * sp);
            p.spiritStones -= lost;
            GAME.UI.log("第 " + stepNo + " 步：机关骤发！你受损 " + d + " 气血、被夺 " + lost + " 灵石。", "danger");
            GAME.Core.checkDeath();
            if (p.isDead) return;
            p.relic.encounter = "第 " + stepNo + " 步：机关骤发！你损 " + d + " 气血、被夺 " + lost + " 灵石。石室轰鸣，尘烟未散，须稳住心神。";
        } else { // wraith：残魂战斗
            GAME.UI.log("第 " + stepNo + " 步：一缕古修残魂扑噬而来！", "danger");
            p.relic.encounter = "第 " + stepNo + " 步：一缕古修残魂自骨堆中扑噬而来！杀机凛冽，须全力应对。";
            p.combatRoute = { type: "relic" };
            GAME.Combat.start(cfg.monsters[0]);
            return;   // 胜负后由 afterCombat 续推
        }

        if (p.relic && p.relic.stepsLeft <= 0) this.exit();
        else GAME.UI.updateUI();
    },

    // 加权抽取表项
    _pick: function (table) {
        var total = 0, i;
        for (i = 0; i < table.length; i++) total += table[i].w;
        var roll = Math.random() * total, o = table[table.length - 1];
        for (i = 0; i < table.length; i++) { if (roll < table[i].w) { o = table[i]; break; } roll -= table[i].w; }
        return o;
    },

    // ---------- 战斗结算回调（combat.js 路由） ----------
    afterCombat: function (win, ctx) {
        var p = GAME.State.p();
        if (!p.relic) return;
        if (win) {
            GAME.UI.log("残魂散尽，遗迹深处似有宝光流转。", "success");
            p.relic.encounter = "残魂散尽，遗迹深处似有宝光流转——前路仍幽，杀机未绝，不可掉以轻心。";
        } else {
            // 败北软着陆：重伤退出、战利品散失，不判当场身陨（由 combat.js defeat 调至此）
            GAME.UI.log("你重伤退出古修遗迹，此行所得多半散失于风沙。", "danger");
            p.relic = null;
            GAME.UI.updateUI();
            return;
        }
        if (p.isDead) return;
        if (p.relic.stepsLeft <= 0) this.exit();
        else GAME.UI.updateUI();
    },

    // ---------- 探索进度（UI 卡与日志同读此口，避免各算一套） ----------
    progress: function (p) {
        p = p || GAME.State.p();
        if (!p || !p.relic) return null;
        var total = this.cfg().steps;
        var done = Math.max(0, Math.min(total, total - (p.relic.stepsLeft || 0)));
        return { total: total, done: done, left: total - done };
    },

    // ---------- 见好就收：强行脱离（不给通关奖励，已入囊的战利品保留；脱离即起算休整） ----------
    flee: function () {
        var p = GAME.State.p();
        if (!p || !p.relic) return false;
        var pr = this.progress(p);
        p.relic = null;   // 唯一状态位清空 → State.inDungeon 现算为假，页签与 8 宫格随之解锁
        GAME.State.setCd("relic", this.cfg().cooldownMonths);   // 真正离场才起算休整（与 exit 同一把尺子）
        GAME.UI.log("你按住心中贪念，循原路退出古修遗迹——此番深入 " + pr.done + " 步，所得已入囊；余下造化，留待后缘。", "system");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 保底脱身：无论探索中还是异常卡死，都强行清掉遗迹状态 ----------
    // 与 flee 的分工：flee 是「正常探索中」的优雅离场（保留战利品 + 起算休整）；
    // forceReset 是兜底保险——即使出现状态异常（p.relic 残留但卡片未渲染、或残魂战路由悬空），
    // 也能把遗迹相关标志位一并清掉，解除全场锁定，杜绝任何「进退失据」的二次卡死。
    // 斗法之中不强行清（免得清了 p.relic 却仍在打架，由战斗里的遁走/胜负收口），先提示玩家了结战局。
    forceReset: function () {
        var p = GAME.State.p();
        if (!p) return false;
        if (p.combat) {
            GAME.UI.log("古修残魂未散，斗法未了——须先分出胜负或施展遁术，方能脱离遗迹。", "danger");
            return false;
        }
        if (p.relic) return this.flee();   // 正常探索中 → 走既有脱离（保留战利品 + 起算休整）
        // 非探索态：清掉任何可能悬空的残魂战路由，确认状态清爽
        if (p.combatRoute && p.combatRoute.type === "relic") p.combatRoute = null;
        GAME.UI.log("你当前并未身处古修遗迹，状态已确认清爽。", "system");
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 走完 12 步，脱离结算 ----------
    exit: function () {
        var p = GAME.State.p();
        p.relic = null;
        GAME.State.setCd("relic", this.cfg().cooldownMonths);   // 真正离场才起算休整（与 flee 同一把尺子）
        var rw = this.cfg().clearReward;
        if (rw) {
            GAME.State.addItem(rw.id, rw.qty || 1);
            GAME.UI.log(rw.text, "loot");
            GAME.UI.log("【遗迹收尾】" + GAME.DATA.ITEMS[rw.id].name + " ×" + (rw.qty || 1) + " 已入囊。", "success");
        }
        GAME.UI.log("你走完十二步，自遗迹出口安然脱离！古修遗泽已尽数入囊。", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    }
};
