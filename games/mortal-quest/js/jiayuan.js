/* =========================================================
 * js/jiayuan.js —— 景阳城·玄机世家主线（四阶段连环事件）
 * 玩家带着【体内阴毒】至此，为求【暖阳宝玉】替玄机世家平定内乱，
 * 终得解毒与一块来路不明的锈铁牌——那是通往仙途的引子。
 * 事件文本四阶段全在 GAME.DATA.JIAYUAN_CHAIN
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Jiayuan = {

    cfg: function () { return GAME.DATA.JIAYUAN_CHAIN; },

    stageCfg: function (stage) {
        var hit = null;
        this.cfg().forEach(function (s) { if (s.stage === stage) hit = s; });
        return hit;
    },

    at: function () { return GAME.State.p().location === "jiayuan_cheng"; },

    // ---------- 进入 / 续接事件链 ----------
    start: function () {
        var p = GAME.State.p();
        if (p.isDead) return false;
        if (!this.at()) {
            GAME.UI.log("此地并非景阳城。玄机世家远在岚州腹地，须得动身前往。", "system");
            GAME.UI.updateUI();
            return false;
        }
        if (p.jiayuanDone) {
            GAME.UI.log("玄机世家之事已了。颜氏仍在城中操持旧业，只是再无需你出手。", "system");
            GAME.UI.updateUI();
            return false;
        }
        if (p.combat || p.pendingEvent || p.pendingMercy) {
            GAME.UI.log("手头尚有未了之事。", "system");
            GAME.UI.updateUI();
            return false;
        }
        if (!p.jiayuan) {
            p.jiayuan = { stage: 1 };
            GAME.UI.log(GAME.DATA.MAP.actionText.mo_house.knock, "info");
        }
        // 玄机世家主线面板由 applyPanels 的 urgent 逻辑自动显示（已并入大地图，身在景阳城即显）
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 选项前置校验（不满足则按钮禁用 / 点击提示） ----------
    canChoose: function (ch) {
        var p = GAME.State.p();
        var req = ch.require;
        if (req) {
            if (req.item && GAME.State.countItem(req.item) <= 0) {
                return { ok: false, msg: "缺少所需之物【" + GAME.DATA.ITEMS[req.item].name + "】，此计难行。" };
            }
            if (req.companion && !(p.companion && p.companion.hp > 0)) {
                return { ok: false, msg: "玄傀不在身侧（或已重伤不支），无从差遣。" };
            }
            if (req.clues) {
                var have = (p.jiayuan && p.jiayuan.clues) || 0;
                if (have < req.clues) {
                    return { ok: false, msg: "胸中线索不足（需 " + req.clues + " 条，现有 " + have + " 条）——未潜入墨府查探，便无从分化人心。" };
                }
            }
        }
        if (ch.cost && ch.cost.silver && p.silver < ch.cost.silver) {
            return { ok: false, msg: "白银不足（需 " + ch.cost.silver + " 两）。" };
        }
        return { ok: true };
    },

    // ---------- 玩家点选某个分支 ----------
    choose: function (index) {
        var p = GAME.State.p();
        if (!p.jiayuan || p.isDead || p.combat) return false;
        var st = this.stageCfg(p.jiayuan.stage);
        if (!st) return false;
        var ch = st.choices[index];
        if (!ch) return false;

        var chk = this.canChoose(ch);
        if (!chk.ok) { GAME.UI.log(chk.msg, "system"); GAME.UI.updateUI(); return false; }

        // —— 代价：白银 / 物品 / 玄傀气血 ——
        if (ch.cost) {
            if (ch.cost.silver) {
                if (p.silver < ch.cost.silver) { GAME.UI.log("白银不足。", "system"); GAME.UI.updateUI(); return false; }
                p.silver -= ch.cost.silver;
            }
            if (ch.cost.item) GAME.State.removeItem(ch.cost.item, 1);
            if (ch.cost.companionHp) {
                p.companion.hp = Math.max(0, p.companion.hp - ch.cost.companionHp);
                GAME.UI.log("玄傀此番出力不小（气血 -" + ch.cost.companionHp + "，余 " + p.companion.hp + "）。", "warning");
            }
        }

        GAME.UI.log("你定了定神——" + ch.text + "。", "info");

        var o = ch.outcome || {};
        if (o.log) GAME.UI.log(o.log, "info");
        if (o.karma) GAME.State.addKarma(o.karma);
        if (o.shaQi) p.shaQi += o.shaQi;
        if (o.mind) p.mind += o.mind;

        // 潜入墨府：交由墨府探查模块接管（p.mansion），探毕回写线索并推进至阶段二
        if (o.mansion) {
            GAME.Mansion.start();
            return true;
        }
        // 发放物品（事件链未终结时用 give；终结用 loot）
        if (o.give) {
            (o.give).forEach(function (id) {
                GAME.State.addItem(id, 1);
                GAME.UI.log("获得【" + GAME.DATA.ITEMS[id].name + "】×1。", "loot");
            });
        }
        // 耗时（如替颜氏稳固玄机世家耗 1 月）
        if (o.months) { GAME.Core.passTime(o.months); if (p.isDead) return false; }
        // 参悟升仙令：记下看懂了令牌的用法
        if (o.shengxianLore) {
            p.shengxianLore = true;
            if (GAME.Codex) GAME.Codex.unlockLore("lore_shengxian");   // 图鉴·秘闻
        }

        // 进入战斗：由 Combat.ctx 记录归属，胜负回 afterCombat
        if (o.combat) {
            p.combatRoute = { type: "jiayuan", stage: st.stage, choiceId: ch.id, winNext: o.combat.winNext };
            GAME.Combat.start(o.combat.monster);
            return true;
        }
        // 换得暖阳宝玉 → 当场驱除体内阴毒
        if (o.cure) {
            GAME.State.addItem("nuan_yang_bao_yu", 1);
            GAME.Core.takePill("nuan_yang_bao_yu");
            if (p.isDead) return false;
        }
        // 收尾：发放遗物，事件链终结
        if (o.finish) {
            (o.loot || []).forEach(function (id) {
                GAME.State.addItem(id, 1);
                GAME.UI.log("获得【" + GAME.DATA.ITEMS[id].name + "】×1。", "loot");
            });
            if (p.isDead) return false;
            p.jiayuanDone = true;
            p.jiayuan = null;
            GAME.UI.log("玄机世家之事至此终了。你揣着那块锈铁牌出得城门，忽觉天地比昨日宽了些——那是留给你的路。", "success");
            GAME.Core.checkAchievements();
            GAME.UI.autoSave();
            GAME.UI.updateUI();
            return true;
        }
        if (o.next) p.jiayuan.stage = o.next;

        GAME.Core.checkAchievements();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 战斗回执（Combat.victory / defeat 调用） ----------
    afterCombat: function (win, ctx) {
        var p = GAME.State.p();
        if (p.isDead || !p.jiayuan) return;
        if (win) {
            GAME.UI.log("变乱就此平息，厅上再无人敢出一声。颜氏自屏风后走出，眼里有了一丝活气。", "system");
            if (ctx && ctx.winNext) p.jiayuan.stage = ctx.winNext;
        } else {
            GAME.UI.log("你重伤退走，此事功败垂成。颜氏并未怪罪——只需将养几日，仍可再来。", "warning");
        }
        // 玄机世家主线面板由 applyPanels 紧急逻辑自动显示（已并入大地图）
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },
};
