/* =========================================================
 * js/moEvent.js —— 玄机子与夺舍对决（苍梧门篇大关卡状态机）
 *
 * 触发：突破至练气四层（realmIndex === MODAIFU.triggerRealm）。
 * 三阶段事件流：
 *   阶段一【试探与反噬】  点穴检定护心镜；未装备则扣 50% 气血
 *   阶段二【正面交锋】    玄机子《魔银手》免疫利刃，须暗器/符箓破防（Combat.start）
 *   阶段三【识海大逃杀】  气血耗尽不死亡，撞入识海，按青木功层数概率吞噬元神
 * 战后结算：青木功续篇、摄魂钟、玄傀随从、体内阴毒（两年倒计时）
 *
 * 战斗路由：Combat.victory/defeat 在 moEvent 战斗中调用本模块
 *   afterStage2Win()（胜）/ enterSoul()（气血耗尽）均进入阶段三。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.MoEvent = {

    cfg: function () { return GAME.DATA.CONTENT.MODAIFU; },

    // ——— 触发：突破练气四层后由 Core.breakthrough 调用 ———
    start: function () {
        var p = GAME.State.p();
        var cfg = this.cfg();
        p.moEvent = { stage: 1 };
        GAME.UI.log("【玄机子与夺舍对决】" + cfg.stage1.text, "danger");
        GAME.UI.log("（是否佩有【护心镜】将决定你能否卸去这一记点穴。）", "system");
        GAME.UI.updateUI();
    },

    // ——— 阶段一应对：玩家点「运功相抗」后检定护心镜，转入阶段二 ———
    actStage1: function () {
        var p = GAME.State.p();
        if (!p.moEvent || p.moEvent.stage !== 1 || p.isDead) return;
        var cfg = this.cfg();
        if (p.armor === "mirror_armor") {
            GAME.UI.log(cfg.stage1.mirrorText, "info");
        } else {
            var loss = Math.ceil(p.maxHp * cfg.stage1.failHpRatio);
            p.currentHp = Math.max(1, p.currentHp - loss);
            GAME.UI.log(cfg.stage1.noMirrorText, "danger");
        }
        p.moEvent.stage = 2;
        GAME.UI.log(cfg.stage2.text, "system");
        GAME.Combat.start(cfg.stage2.monster);   // 开战：玄机子（魔银手免疫利刃）
    },

    // ——— 阶段二胜利（Combat.victory 路由至此） ———
    afterStage2Win: function () {
        var p = GAME.State.p();
        p.moEvent.stage = 3;
        var cfg = this.cfg();
        GAME.UI.log("玄机子肉身被你制住！你神识一沉，主动撞入识海——" + cfg.stage3.text, "danger");
        GAME.UI.updateUI();
    },

    // ——— 阶段三：气血耗尽撞入识海（Combat.defeat 路由至此） ———
    enterSoul: function () {
        var p = GAME.State.p();
        p.moEvent.stage = 3;
        var cfg = this.cfg();
        GAME.UI.log(cfg.stage3.text, "danger");
        GAME.UI.updateUI();
    },

    // ——— 阶段三吞噬判定（玩家选项：0 硬撼 / 1 摄魂钟镇魂） ———
    swallow: function (option) {
        var p = GAME.State.p();
        if (!p.moEvent || p.moEvent.stage !== 3 || p.isDead) return;
        var cfg = this.cfg();
        var layers = Math.max(0, p.changchunLevel);  // 青木功层数直接决定吞噬胜算（破境练气四层时约 4 层）
        var chance = cfg.stage3.baseChance + layers * cfg.stage3.perLayer;
        if (option === 1) {
            if (GAME.State.countItem("yinhun_zhong") <= 0) {
                GAME.UI.log("你手中并无【摄魂钟】，无从镇魂。", "system");
                return;
            }
            chance += cfg.stage3.bellBonus;
        }
        chance = Math.max(0.1, Math.min(0.95, chance));
        if (Math.random() < chance) {
            GAME.UI.log(cfg.stage3.winText, "success");
            this.finish();
        } else {
            GAME.UI.log(cfg.stage3.loseText, "danger");
            GAME.UI.log("你神识受挫却未溃散——可重整旗鼓，再试一次吞噬。", "warning");
            GAME.UI.updateUI();
        }
    },

    // ——— 通关结算：青木功续篇 / 摄魂钟 / 玄傀 / 体内阴毒 ———
    finish: function () {
        var p = GAME.State.p();
        var cfg = this.cfg();
        if (cfg.reward.changchunUp) {
            p.changchunLevel += cfg.reward.changchunUp;
            GAME.UI.log("你修习《青木功续篇》，青木功层数跃升至 " + p.changchunLevel + "！命中与异常抗性更固。", "success");
        }
        (cfg.reward.items || []).forEach(function (id) { GAME.State.addItem(id, 1); });
        // 摄魂钟已入手：玩家须在「随从」处催动摄魂钟，以精血唤起铁奴玄傀（activateCompanion 消耗摄魂钟）
        GAME.UI.log("玄机子遗下【摄魂钟】入手——可于「随从」处以精血催动，唤起铁奴玄傀为你效死。", "info");
        // 体内阴毒：两年倒计时（按月计），到期未取暖阳宝玉则道消身陨
        p.yindu = { months: cfg.reward.yinduYears * 12 };
        GAME.UI.log("然玄机子阴毒已侵入体内——【体内阴毒】倒计时 " + cfg.reward.yinduYears +
            " 年！" + cfg.warmYang.text, "danger");
        p.moEvent = null;
        p.moEventDone = true;
        if (GAME.Codex) GAME.Codex.unlockLore("lore_shichong");   // 图鉴·秘闻
        p.shichong = null;   // 夺舍对决了结，尸虫丸之毒随玄机子身死而解
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },
};
