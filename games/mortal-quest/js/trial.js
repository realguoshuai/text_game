/* =========================================================
 * js/trial.js —— 血月试炼（练气期 Roguelike 终极副本）
 * 进入条件：练气十层以上、寿元未尽。
 * 机制：固定 20 步探索倒计时，每步随机抽取——采集主药 / 精英截杀 / 古修破阵。
 * 结算：只有活着走完 20 步并从出口脱离，才能保住全部战利品；
 *       集齐三味主药，可于丹炉炼【正品筑基丹】（突破筑基 +50%、反噬 -80%）。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Trial = {

    cfg: function () { return GAME.DATA.CONTENT.TRIAL; },

    // ---------- 进入条件 ----------
    canEnter: function () {
        var p = GAME.State.p();
        return !p.isDead && !p.combat && !p.pendingEvent && !p.pendingMercy && !p.trial &&
               p.realmIndex >= this.cfg().enterRealm;
    },

    start: function () {
        var p = GAME.State.p();
        if (p.realmIndex < this.cfg().enterRealm) { GAME.UI.log("需练气十层以上方可入血月试炼。", "system"); GAME.UI.updateUI(); return; }
        if (!this.canEnter()) { GAME.UI.updateUI(); return; }
        var cdTrial = GAME.State.cdLeft("trial");
        if (cdTrial > 0) {
            GAME.UI.log("血月试炼方才有人出入，古修禁制尚未复原——须再候 " + cdTrial + " 个月方可再入。", "system");
            GAME.UI.updateUI();
            return;
        }
        p.trial = { stepsLeft: this.cfg().steps, active: true };
        GAME.State.setCd("trial", this.cfg().cooldownMonths || 6);
        p.stats.trialsEntered += 1;
        GAME.UI.log("你踏入血月试炼之境——二十步生死，唯有走完全程、自出口脱离，方能保住战利品。", "danger");
        GAME.UI.updateUI();
    },

    // ---------- 前进一步（每次只消耗 1 步） ----------
    step: function () {
        var p = GAME.State.p();
        if (!p.trial || p.isDead) return;
        if (p.trial.stepsLeft <= 0) { this.exit(); return; }
        var cfg = this.cfg();

        // 按权重抽取事件
        var evs = cfg.events, total = 0, i;
        for (i = 0; i < evs.length; i++) total += evs[i].weight;
        var roll = Math.random() * total, picked = evs[evs.length - 1];
        for (i = 0; i < evs.length; i++) { if (roll < evs[i].weight) { picked = evs[i]; break; } roll -= evs[i].weight; }

        var stepNo = cfg.steps - p.trial.stepsLeft + 1;
        p.trial.stepsLeft -= 1;

        if (picked.type === "gather") {
            var herb = cfg.herbs[GAME.Core.rand(0, cfg.herbs.length - 1)];
            GAME.State.addItem(herb, 1);
            GAME.UI.log("第 " + stepNo + " 步：你采得【" + GAME.DATA.ITEMS[herb].name + "】！（试炼战利品已入袋）", "success");
        } else if (picked.type === "combat") {
            var monster = picked.monsters[GAME.Core.rand(0, picked.monsters.length - 1)];
            GAME.UI.log("第 " + stepNo + " 步：杀机骤起——一名" + (monster === "trial_elite_zheng" ? "正道" : "魔道") + "精英弟子拦杀而来！", "danger");
            GAME.Combat.start(monster);   // trial 标记由 def.trial 带入战斗状态；步数已扣，胜负后由 afterCombat 续推
            return;
        } else { // array：古修遗迹破阵
            GAME.UI.log("第 " + stepNo + " 步：你触及一处古修遗迹残阵。", "system");
            this._doArray();
        }

        if (p.trial && p.trial.stepsLeft <= 0) this.exit();
        else GAME.UI.updateUI();
    },

    // 古修破阵结果（按 chance 抽取：灵物 / 反噬 / 灵石）
    _doArray: function () {
        var p = GAME.State.p();
        var arr = this.cfg().array, total = 0, i;
        for (i = 0; i < arr.length; i++) total += arr[i].chance;
        var roll = Math.random() * total, o = arr[arr.length - 1];
        for (i = 0; i < arr.length; i++) { if (roll < arr[i].chance) { o = arr[i]; break; } roll -= arr[i].chance; }

        GAME.UI.log(o.text, o.type === "damage" ? "danger" : "loot");
        if (o.type === "loot") {
            (o.table || []).forEach(function (g) {
                if (Math.random() < g.chance) {
                    var q = GAME.Core.rand(g.qty[0], g.qty[1]);
                    if (q > 0) { GAME.State.addItem(g.id, q); GAME.UI.log("获得【" + GAME.DATA.ITEMS[g.id].name + "】×" + q + "。", "loot"); }
                }
            });
        } else if (o.type === "stones") {
            var s = GAME.Core.rand(o.amount[0], o.amount[1]); p.spiritStones += s; GAME.UI.log("得灵石 ×" + s + "。", "loot");
        } else if (o.type === "damage") {
            var d = GAME.Core.rand(o.hp[0], o.hp[1]); p.currentHp -= d; GAME.UI.log("你受损 " + d + " 点气血！", "danger");
        }
        GAME.Core.checkDeath();
    },

    // 试炼战斗结算后回调（由 Combat.victory 调用）
    afterCombat: function (win) {
        var p = GAME.State.p();
        if (!p.trial) return;
        if (win) { p.shaQi += 3; GAME.UI.log("试炼死斗得胜，煞气 +3。", "warning"); }
        if (p.isDead) return;                       // 道消身陨，试炼随之终结
        if (p.trial.stepsLeft <= 0) this.exit();
        else GAME.UI.updateUI();
    },

    // ---------- 走完 20 步，脱离结算 ----------
    exit: function () {
        var p = GAME.State.p();
        p.trial = null;
        var herbs = this.cfg().herbs;
        var got = herbs.filter(function (h) { return GAME.State.countItem(h) > 0; });
        if (got.length >= 3) GAME.UI.log("你走完二十步，自试炼出口安然脱离！三味主药已齐，可于丹炉炼【正品筑基丹】（突破筑基 +50%、反噬 -80%）。", "success");
        else GAME.UI.log("你走完二十步，自试炼出口脱离，战利品尽数保住。（主药 " + got.length + "/3，尚不齐）", "info");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // 主动撤离（保住当前战利品，无额外奖励）
    abandon: function () { if (GAME.State.p().trial) this.exit(); },
};
