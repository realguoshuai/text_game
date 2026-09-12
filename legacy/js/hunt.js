/* =========================================================
 * js/hunt.js —— 分档狩猎副本引擎（打怪换装过渡线）
 *
 * enter(id)   准入：境界达标 + 非战斗/事件中 → 开启连战第一波
 * afterCombat 胜利：推进下一波 / 全清发通关奖励（装备必得其一 + 物资 + 灵石）
 *             败北：软着陆——重伤逃出，本轮收获清空（不删档、不判死）
 * 战斗回调：Combat.victory 依据 ctx.type === "hunt" 路由至本模块
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Hunt = {

    // ---------- 忙碌/准入 ----------
    busyMsg: function () {
        var p = GAME.State.p();
        if (p.isDead) return "你已道消身陨。";
        if (p.combat) return "斗法未已。";
        if (p.hunt) return "你正在狩猎场中。";
        return null;
    },

    canEnter: function (id) {
        var p = GAME.State.p();
        var d = GAME.DATA.HUNTS.byId(id);
        if (!d) return { ok: false, msg: "世间并无此狩猎之地。" };
        if (this.busyMsg()) return { ok: false, msg: this.busyMsg() };
        if (p.realmIndex < d.reqRealm) {
            var need = (GAME.DATA.REALMS[d.reqRealm] || {}).name || "更高境界";
            var cur = (GAME.DATA.REALMS[p.realmIndex] || {}).name || "无名之辈";
            return { ok: false, msg: "【" + d.name + "】非你此刻可去——内有凶物，修为不足便是送菜。（当前 " + cur + "，需 " + need + " 以上）" };
        }
        return { ok: true, d: d };
    },

    startWave: function (d, waveIdx) {
        var p = GAME.State.p();
        var mid = d.waves[waveIdx];
        GAME.UI.log("【" + d.name + "】第 " + (waveIdx + 1) + " / " + d.waves.length + " 波——前方凶物已察觉你的气息！", "warning");
        p.combatRoute = { type: "hunt", huntId: d.id, wave: waveIdx };
        GAME.Combat.start(mid);
        return !!p.combat;
    },

    enter: function (id) {
        var p = GAME.State.p();
        var chk = this.canEnter(id);
        if (!chk.ok) { GAME.UI.log(chk.msg, "system"); GAME.UI.updateUI(); return false; }
        var d = chk.d;
        p.hunt = { id: d.id, wave: 0 };
        GAME.UI.log("你循着兽皮舆图摸到【" + d.name + "】——" + d.teaser, "info");
        return this.startWave(d, 0);
    },

    // ---------- 战斗回调 ----------
    afterCombat: function (win, ctx) {
        var p = GAME.State.p();
        if (!p.hunt || !ctx || ctx.type !== "hunt") return;
        var d = GAME.DATA.HUNTS.byId(p.hunt.id);
        if (!d) { p.hunt = null; return; }

        if (!win) {
            // 软着陆：败北不清档、不判死，只丢本轮进度
            p.hunt = null;
            p.combatRoute = null;
            GAME.UI.log("你拼着重伤杀出重围，踉跄退出【" + d.name + "】——此番进山，终究是空手而回。", "danger");
            GAME.UI.updateUI();
            return;
        }

        var next = (ctx.wave || 0) + 1;
        if (next < d.waves.length) {
            p.hunt.wave = next;
            p.hunt.await = true;   // 波间暂停：可继续深入，也可见好就收
            GAME.UI.log("此兽方倒。前方还有 " + (d.waves.length - next) + " 波凶物——可继续深入，亦可就此收手。", "info");
            GAME.UI.updateUI();
            return;
        }

        // —— 全清结算 ——
        p.hunt = null;
        var rw = d.reward;
        var stones = rw.stones[0] + Math.floor(Math.random() * (rw.stones[1] - rw.stones[0] + 1));
        p.spiritStones += stones;
        (rw.materials || []).forEach(function (m) { GAME.State.addItem(m.id, m.qty); });
        var eq = rw.equip[Math.floor(Math.random() * rw.equip.length)];
        GAME.State.addItem(eq, 1);
        GAME.UI.log(rw.text, "story");
        GAME.UI.log("【狩猎完胜】得灵石 " + stones + " 枚、【" +
            (GAME.DATA.ITEMS[eq] ? GAME.DATA.ITEMS[eq].name : eq) + "】×1" +
            (rw.materials && rw.materials.length ? "、另有物资入袋" : "") + "。", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 波间继续下一波 ----------
    next: function () {
        var p = GAME.State.p();
        if (!p.hunt || !p.hunt.await || p.combat) return false;
        var d = GAME.DATA.HUNTS.byId(p.hunt.id);
        if (!d) { p.hunt = null; return false; }
        p.hunt.await = false;
        return this.startWave(d, p.hunt.wave);
    },

    // ---------- 中途退场（波间见好就收，收获保留） ----------
    canLeave: function () {
        var p = GAME.State.p();
        return !!p.hunt && !!p.hunt.await && !p.combat;
    },
    leave: function () {
        var p = GAME.State.p();
        if (!this.canLeave()) return false;
        var d = GAME.DATA.HUNTS.byId(p.hunt.id);
        p.hunt = null;
        GAME.UI.log("你在【" + (d ? d.name : "狩猎之地") + "】收势而退——所获俱在囊中，见好就收。", "system");
        GAME.UI.updateUI();
        return true;
    },
};
