/* =========================================================
 * js/map.js —— 岚州大地图控制器
 * 节点流转（耗时 + 世俗盘缠）、苍南谷幻阵门槛、
 * 地点专属行动（辞行 / 探亲 / 登门玄机世家）、灵石兑市银
 * 数据全在 GAME.DATA.MAP，本文件只做逻辑与校验
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Map = {

    cfg: function () { return GAME.DATA.MAP; },

    node: function (id) {
        var hit = null;
        this.cfg().nodes.forEach(function (n) { if (n.id === id) hit = n; });
        return hit;
    },

    cur: function () {
        var p = GAME.State.p();
        return this.node(p.location) || this.node(this.cfg().start);
    },

    // ---------- 当前地点可走的道路（双向，附带目标地的解锁状态） ----------
    routes: function () {
        var self = this, cur = GAME.State.p().location, out = [];
        this.cfg().routes.forEach(function (r) {
            var target = (r.from === cur) ? r.to : (r.to === cur ? r.from : null);
            if (!target) return;
            var n = self.node(target);
            var u = self.nodeUnlocked(target);
            out.push({
                id: r.id, targetId: target, targetName: n ? n.name : target,
                months: r.months, silver: r.silver,
                unlocked: u.ok, lockMsg: u.ok ? "" : u.msg,
            });
        });
        return out;
    },

    // ---------- 地点解锁：按当前境界放行，本派门人不拘 ----------
    nodeUnlocked: function (id) {
        var n = this.node(id);
        if (!n) return { ok: false, msg: "世间并无此地。" };
        var p = GAME.State.p();
        var need = n.reqRealm || 0;
        if (p.realmIndex >= need) return { ok: true };
        if (n.reqSect && p.sectId === n.reqSect) return { ok: true };   // 持身份玉简者直入
        return { ok: false, msg: this.lockMsg(n) };
    },

    // 未达标拒辞：节点自带 reqText 优先，补上「当前 X，需 Y 以上」方便对照
    lockMsg: function (n) {
        var need = n.reqRealm || 0;
        var realm = GAME.DATA.REALMS[need] || {};
        var curName = (GAME.DATA.REALMS[GAME.State.p().realmIndex] || {}).name || "无名之辈";
        var text = n.reqText || "你的修为尚浅，去不得【" + n.name + "】。";
        return text + "（当前 " + curName + "，需 " + (realm.name || "更高境界") + " 以上）";
    },

    // ---------- 天下舆图：全部节点及其解锁状态（UI 展示用） ----------
    atlas: function () {
        var self = this, p = GAME.State.p(), out = [];
        this.cfg().nodes.forEach(function (n) {
            var u = self.nodeUnlocked(n.id);
            out.push({
                id: n.id, name: n.name, kind: n.kind,
                unlocked: u.ok, lockMsg: u.ok ? "" : u.msg,
                reqRealmName: (GAME.DATA.REALMS[n.reqRealm || 0] || {}).name || "",
                teaser: n.teaser || "",
                here: p.location === n.id,
            });
        });
        return out;
    },

    // ---------- 忙碌判定：战斗 / 事件 / 试炼 / 玄机子 时不许上路 ----------
    busyMsg: function () {
        var p = GAME.State.p();
        if (p.isDead) return "你已道消身陨，再也踏不上路途。";
        if (p.combat) return "斗法未已，岂能抽身离去？";
        if (p.pendingEvent || p.pendingMercy) return "眼前之事未了，先做个了断。";
        if (p.trial) return "血月试炼尚在进行，脱身不得。";
        if (p.moEvent) return "玄机子的元神仍在纠缠，此刻走不开。";
        if (p.hunt) return "你正在狩猎场中，收势而退后方可上路。";
        if (p.mansion) return "你正潜伏在墨府之中，此时抽身，前功尽弃。";
        if (p.jiayuan && p.location === "jiayuan_cheng") return "玄机世家的事正到紧要处，此时抽身，恐失信于颜氏。";
        return null;
    },

    // ---------- 苍南谷幻阵门槛：青木功层数 / 升仙令 / 已入门派 ----------
    canEnterTainan: function () {
        var p = GAME.State.p(), a = this.cfg().array;
        if (p.sectId) return true;                                             // 已是某派门人
        if ((p.changchunLevel || 0) >= a.needChangchun) return true;           // 神识足够，自可勘破虚妄
        if (a.needToken && GAME.State.countItem(a.needToken) > 0) return true; // 持令者不拘此限
        return false;
    },

    // ---------- 上路前的校验：忙碌 → 路是否存在 → 修为门槛 → 苍南谷幻阵 → 盘缠 ----------
    canTravel: function (routeId) {
        var busy = this.busyMsg();
        if (busy) return { ok: false, msg: busy };
        var target = null;
        this.routes().forEach(function (r) { if (r.id === routeId) target = r; });
        if (!target) return { ok: false, msg: "此处并无这条路。" };
        var p = GAME.State.p();
        // 修为不到：出不了这道无形的坎（青梧谷等宗门另认门人身份）
        if (!target.unlocked) return { ok: false, msg: target.lockMsg };
        if (p.silver < target.silver) {
            return { ok: false, msg: "盘缠不足（需 " + target.silver + " 两）。可先在凡俗城池寻行商【兑换市银】。" };
        }
        if (target.targetId === "tainan_gu" && !(p.location === "tainan_gu") && !this.canEnterTainan()) {
            return { ok: false, msg: GAME.DATA.MAP.array.failText };
        }
        return { ok: true, target: target };
    },

    // ---------- 移动：扣盘缠 → 换地点 → 推进时间（阴毒倒计时同步递减） ----------
    travel: function (routeId) {
        var check = this.canTravel(routeId);
        if (!check.ok) { GAME.UI.log(check.msg, "system"); GAME.UI.updateUI(); return false; }
        var p = GAME.State.p();
        var target = check.target;
        var from = this.cur();

        p.silver -= target.silver;
        // 《御风诀》：驭风赶路，每程省 1 个月（最低 1 月）
        var months = target.months;
        if (p.spells && p.spells.yufeng_shu && GAME.DATA.SPELLS.yufeng_shu) {
            months = Math.max(1, months - GAME.DATA.SPELLS.yufeng_shu.travelDiscount);
            if (months < target.months) GAME.UI.log("你驭风而行，脚程快了许多（行程 " + target.months + " → " + months + " 个月）。", "info");
        }
        // 【踏云靴】：云气托足，大地图移动消耗减半（最低 1 月）
        if (GAME.State.countItem("artifact_tayun") > 0) {
            var m0 = months;
            months = Math.max(1, Math.round(months * 0.5));
            if (months < m0) GAME.UI.log("【踏云靴】云气托足，行程减半（" + m0 + " → " + months + " 个月）。", "info");
        }
        GAME.UI.log("你自【" + from.name + "】动身，一路风尘前往【" + target.targetName + "】，车马盘缠耗去 " + target.silver + " 两。", "system");
        p.location = target.targetId;

        var to = this.node(target.targetId);
        if (target.targetId === "tainan_gu" && to) {
            GAME.UI.log("山道尽头的雾里忽然现出一道缝——幻阵已破，谷中市声隐隐入耳。", "success");
        }

        GAME.Core.passTime(months);
        if (p.isDead) return false;

        if (to) GAME.UI.log("【抵达】" + to.name + "——" + to.desc, "info");

        // —— 路遇事件：按当前修为从野外怪带中随机遇敌（25% 概率） ——
        var enc = GAME.DATA.MAP_ENCOUNTERS;
        if (enc && !p.isDead && !p.combat && Math.random() < enc.chance) {
            var cands = [];
            enc.pool.forEach(function (bd) {
                if (p.realmIndex >= bd.minRealm && p.realmIndex <= bd.maxRealm) cands.push(bd);
            });
            if (cands.length) {
                var pick = cands[Math.floor(Math.random() * cands.length)];
                var mdef = null;
                GAME.DATA.MONSTERS.forEach(function (m) { if (m.id === pick.monster) mdef = m; });
                if (mdef) {
                    GAME.UI.log("【路遇】行至半途，" + mdef.name + "自道旁杀出——" + mdef.desc, "danger");
                    GAME.Combat.start(mdef.id);
                    GAME.UI.updateUI();
                    return true;
                }
            }
        }

        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 地点专属行动 ----------
    canDoAction: function (actionId) {
        if (this.busyMsg()) return { ok: false, msg: this.busyMsg() };
        var node = this.cur();
        var act = null;
        (node.actions || []).forEach(function (a) { if (a.id === actionId) act = a; });
        if (!act) return { ok: false, msg: "此地并无此事可做。" };
        // 一次性行动：做过之后不再重复
        var p = GAME.State.p();
        if (actionId === "farewell" && p.farewellDone) return { ok: false, msg: "故人已别，不必再来。" };
        if (actionId === "visit_family" && p.visitFamilyDone) return { ok: false, msg: "尘缘已断，再入家门徒惹伤怀。" };
        return { ok: true, act: act };
    },

    doAction: function (actionId) {
        var check = this.canDoAction(actionId);
        var p = GAME.State.p();
        var t = this.cfg().actionText;

        if (!check.ok) { GAME.UI.log(check.msg, "system"); GAME.UI.updateUI(); return false; }

        if (actionId === "farewell") {
            p.farewellDone = true;
            p.silver += t.farewell.silver;
            p.mind += t.farewell.mind;
            GAME.UI.log(t.farewell.first, "info");
            GAME.UI.log("得盘缠 " + t.farewell.silver + " 两，心境 +" + t.farewell.mind + "（现心境 " + p.mind + "）。", "loot");
        } else if (actionId === "visit_family") {
            p.visitFamilyDone = true;
            p.mind += t.visit_family.mind;
            GAME.UI.log(t.visit_family.first, "info");
            GAME.UI.log("尘缘断去，心境 +" + t.visit_family.mind + "（现心境 " + p.mind + "）。", "loot");
            GAME.Core.passTime(t.visit_family.months);
        } else if (actionId === "heisha_raid") {
            // 云京·夜探皇宫：交由幽冥教副本模块接管
            if (GAME.Heisha) { GAME.Heisha.start(); return true; }
            GAME.UI.log("皇城的方向夜云低垂，时机未至。", "system");
        } else if (actionId === "mo_house") {
            // 交由景阳城玄机世家主线模块接管
            GAME.Jiayuan.start();
            return true;
        }
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 世俗盘缠：1 枚灵石兑 100 两白银 ----------
    exchangeStone: function (stones) {
        var p = GAME.State.p();
        stones = stones || 1;
        if (p.isDead) return false;
        if (p.spiritStones < stones) {
            GAME.UI.log("你身上没有那么多灵石。", "system");
            GAME.UI.updateUI();
            return false;
        }
        var rate = this.cfg().silver.stoneToSilver;
        p.spiritStones -= stones;
        p.silver += stones * rate;
        GAME.UI.log("你向行商兑了 " + stones + " 枚灵石，换得 " + (stones * rate) + " 两白银。（现银 " + p.silver + " 两）", "loot");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },
};
