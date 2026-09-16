/* =========================================================
 * js/qixuan.js —— 苍梧门风云·开局六幕剧情状态机
 * 六幕脉络（配置在 data/qixuan_events.js）：
 *   一 炼骨崖考核（分步抉择，放弃亦可活，奖励减档）
 *   二 幽篁谷日常（大周天/替张岩护法；解锁每月寄银）
 *   三 古瓶与绿液（承露瓶来历三选一）
 *   四 溪畔救厉长风（得流烟步口诀 + 眨眼剑谱）
 *   五 夜撞野狼帮奸细（密报 / 截杀 / 无视）
 *   六 墨师翻脸·尸虫丸（由突破练气四层钩子触发，衔接玄机子夺舍对决）
 * 面板为紧急剧情面板（qixuan-panel），active() 为真时独占界面。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Qixuan = {

    cfg: function () { return GAME.DATA.QIXUAN; },

    // ---------- 剧情进行中（第一至五幕自由推进；第六幕由突破钩子唤起） ----------
    active: function () {
        var p = GAME.State.p();
        return !!(p.qixuan && p.qixuan.act >= 1 && p.qixuan.act <= 5);
    },

    // ---------- 开局：从第一幕炼骨崖开始（ui.startGame 调用） ----------
    start: function () {
        var p = GAME.State.p();
        if (p.qixuan) return;   // 老档已有进度则不重播
        p.qixuan = { act: 1, step: 0 };
        GAME.UI.log("青牛镇往西百里，苍梧门每年一度的收徒大考开始了——你挤在人群里，望着那座直插云端的炼骨崖。", "story");
        GAME.UI.updateUI();
    },

    // ---------- 突破练气四层钩子（core.breakthrough 调用） ----------
    // 剧情推进至第六幕：先播「墨师翻脸·尸虫丸逼命」，再接玄机子夺舍对决。
    onBreakthroughFour: function () {
        var p = GAME.State.p();
        if (p.qixuan && p.qixuan.act === 6) {
            var cfg = this.cfg().act6;
            GAME.UI.log("【" + cfg.title + "】", "danger");
            GAME.UI.log(cfg.text.replace(/<[^>]+>/g, ""), "danger");
            p.shichong = { months: 12 };   // 尸虫丸之毒：12 个月倒计时（夺舍对决了结即解）
            p.qixuan.act = 7;              // 六幕终章（7 = 已完结）
            GAME.MoEvent.start();
        } else {
            GAME.MoEvent.start();          // 未推剧情（老档/跳过者）：直接开战，行为不变
        }
    },

    // ---------- 当前幕的视图（UI 渲染用） ----------
    view: function () {
        var p = GAME.State.p();
        if (!this.active()) return null;
        var acts = this.cfg();
        if (p.qixuan.act === 1) {
            var st = acts.act1.steps[p.qixuan.step];
            return { title: acts.act1.title, text: st.text, choices: st.choices };
        }
        var map = { 2: acts.act2, 3: acts.act3, 4: acts.act4, 5: acts.act5 };
        var a = map[p.qixuan.act];
        return { title: a.title, text: a.text, choices: a.choices };
    },

    // ---------- 抉择入口（面板按钮回调） ----------
    choose: function (idx) {
        var p = GAME.State.p();
        if (!this.active() || p.combat || p.isDead) return;
        var acts = this.cfg();
        if (p.qixuan.act === 1) return this._act1(idx);
        if (p.qixuan.act === 2) return this._act2(idx);
        if (p.qixuan.act === 3) return this._act3(idx);
        if (p.qixuan.act === 4) return this._act4(idx);
        if (p.qixuan.act === 5) return this._act5(idx);
    },

    // ---------- 第一幕：炼骨崖（分步推进） ----------
    _act1: function (idx) {
        var p = GAME.State.p();
        var a1 = this.cfg().act1;
        if (idx === 1) {
            // 放弃：仍被收留为杂役，但奖励减档（不开除、不删档——软失败）
            p.qixuan.act = 2;
            p.qixuan.step = 0;
            p.spiritStones += (a1.failReward || {}).stones || 5;
            GAME.UI.log(a1.failText, "warning");
            GAME.UI.log("（获安身之所与 " + ((a1.failReward || {}).stones || 5) + " 灵石。苍梧门故事继续——只是起点低了些。）", "system");
        } else {
            // 咬牙前行：损耗气血但不致死（开局保命：保底 1 点）
            p.currentHp = Math.max(1, p.currentHp - (8 + Math.floor(Math.random() * 8)));
            p.qixuan.step += 1;
            if (p.qixuan.step >= a1.steps.length) {
                p.qixuan.act = 2;
                p.qixuan.step = 0;
                p.spiritStones += (a1.passReward || {}).stones || 20;
                GAME.UI.log(a1.passText, "story");
                GAME.UI.log("（记名弟子！获 " + ((a1.passReward || {}).stones || 20) + " 灵石安身。你的仙途，自此始于这一口硬撑下来的气。）", "success");
                // 彩蛋：拖着重伤（≤30% 气血）最后一个登顶——「硬骨头赏」
                if (p.currentHp <= p.maxHp * 0.3 && a1.hardBonusText) {
                    p.spiritStones += a1.hardBonusStones || 10;
                    GAME.UI.log(a1.hardBonusText, "loot");
                    GAME.UI.log("（硬骨头赏：灵石 +" + (a1.hardBonusStones || 10) + "）", "loot");
                }
            } else {
                GAME.UI.log("你咬牙撑过了这一程。", "info");
            }
        }
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 第二幕：幽篁谷日常（解锁每月寄银） ----------
    _act2: function (idx) {
        var p = GAME.State.p();
        var a2 = this.cfg().act2;
        if (idx === 0) {
            p.currentExp += 30;
            GAME.UI.log("你日夜运转大周天，春去夏来——《青木功》第一层愈发热络，修为 +30。", "success");
        } else if (idx === 2) {
            // 下山探亲：不涨修为不涨防，但心境与善念入账（趣味性选项）
            p.mind = (p.mind || 0) + 5;
            GAME.State.addKarma(2);
            GAME.UI.log(a2.visitText, "story");
            GAME.UI.log("（心境 +5，善恶 +2）", "success");
        } else {
            p.defBonus += 2;
            GAME.UI.log("你陪张岩一遍遍打磨《玄龟功》桩功，别人练一遍你陪十遍——不知不觉间，你自己的皮膜也坚韧了（防御永久 +2）。", "success");
        }
        p.homeSupport = true;   // 解锁每月寄银（core.passTime 每 12 月结算）
        p.qixuan.act = 3;
        GAME.UI.log(a2.afterText, "story");
        GAME.Core.passTime(1);
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 第三幕：古瓶与绿液（承露瓶来历） ----------
    _act3: function (idx) {
        var p = GAME.State.p();
        var a3 = this.cfg().act3;
        p.liquid += (a3.anyReward || {}).liquid || 3;
        var bonus = (a3.bonus || {})[idx] || {};
        Object.keys(bonus).forEach(function (k) { GAME.State.addItem(k, bonus[k]); });
        var lines = [
            "你抡起铁锤狠狠砸下——锤头弹开，小瓶纹丝不动。你愣了半晌，把它擦干净贴身藏好：宝贝，绝对是宝贝。",
            "你把一滴稀释的绿液喂给院里那只兔子。次日清晨，兔子胀成了皮球，『啪』地炸开一地绒毛——绿液能催长活物！你的手抖了半天。",
            "你把残夜洒进自家小药田。一夜之间，黄龙草的年份暴涨、苦莲花大如碗口——你连夜把它们掘走，逢人只说自家风水好。",
            "当铺朝奉把小瓶翻来覆去看了半晌，掂了掂，扔回柜上：「粗陶老瓶，顶多值三文钱。」你脸上一热，赔了一文茶钱落荒而逃。可当夜你再看这瓶子——瓶底那四道磨痕，怎么越看越像在冲你笑？",
        ];
        GAME.UI.log(lines[idx] || lines[0], "story");
        if (bonus.herb_bainian) GAME.UI.log("（得【" + GAME.DATA.ITEMS.herb_bainian.name + "】×" + bonus.herb_bainian + "）", "loot");
        GAME.UI.log(a3.afterText, "system");
        GAME.UI.log("（承露瓶认主：绿液 +" + ((a3.anyReward || {}).liquid || 3) + " 滴）", "success");
        p.qixuan.act = 4;
        GAME.Core.passTime(1);
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 第四幕：溪畔救厉长风 ----------
    _act4: function (idx) {
        var p = GAME.State.p();
        var a4 = this.cfg().act4;
        if (idx === 0) {
            var r = a4.helpReward || {};
            (r.items || []).forEach(function (id) { GAME.State.addItem(id, 1); });
            p.silver += r.silver || 0;
            GAME.UI.log(a4.helpText, "story");
            GAME.UI.log("（得【反光短剑】×1——战斗中可施展【眨眼剑法】；获盘缠 " + (r.silver || 0) + " 两。厉长风：生死之交 +1）", "success");
            GAME.Core.passTime(r.months || 1);
        } else if (idx === 1) {
            // 高声呼救：省事省时，但只换来点头之交（趣味性选项）
            GAME.State.addKarma(2);
            GAME.UI.log(a4.shoutText, "story");
            GAME.UI.log("（善恶 +2。有些交情，省下的功夫都得还回来。）", "system");
        } else {
            GAME.State.addKarma(a4.ignoreKarma || -5);
            GAME.UI.log("你收回目光，继续赶路。夜风里那声闷咳追了你很远——你没回头。", "warning");
            GAME.UI.log("（善恶 " + (a4.ignoreKarma || -5) + "。有些债，天道记着。）", "system");
        }
        p.qixuan.act = 5;
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 第五幕：夜撞野狼帮奸细 ----------
    _act5: function (idx) {
        var p = GAME.State.p();
        var a5 = this.cfg().act5;
        p.qixuan.act = 6;   // 五幕自由推进到此为止；第六幕由突破练气四层唤起
        if (idx === 0) {
            p.spiritStones += a5.report.stones;
            GAME.State.addKarma(a5.report.karma);
            GAME.UI.log(a5.report.text, "story");
            GAME.UI.log("（善恶 +" + a5.report.karma + "，灵石 +" + a5.report.stones + "）", "success");
        } else if (idx === 1) {
            if (Math.random() < 0.5) {
                p.spiritStones += a5.ambush.stones;
                GAME.State.addKarma(a5.ambush.karma);
                GAME.UI.log(a5.ambush.winText, "story");
                GAME.UI.log("（灵石 +" + a5.ambush.stones + "，善恶 " + a5.ambush.karma + "）", "loot");
            } else {
                p.currentHp = Math.max(1, p.currentHp - a5.ambush.loseHp);
                GAME.State.addKarma(a5.ambush.karma);
                GAME.UI.log(a5.ambush.loseText, "danger");
                GAME.UI.log("（损失 " + a5.ambush.loseHp + " 气血，善恶 " + a5.ambush.karma + "）", "system");
            }
        } else {
            GAME.State.addKarma(a5.ignore.karma);
            GAME.UI.log(a5.ignore.text, "warning");
            GAME.UI.log("（善恶 " + a5.ignore.karma + "）", "system");
            GAME.Core.passTime(1);
        }
        GAME.UI.log("——苍梧门的故事暂告一段落。你与玄机子之间的账，终究要到突破练气四层的那一天才算。（届时第六幕自动上演）", "system");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },
};
