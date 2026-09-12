/* =========================================================
 * js/teleport_portal.js —— 筑基期终局：修复古传送阵 · 破空而去
 *
 * 宗门战败溃散后，玩家成为弃徒，前往荒山枯井深处的古修士洞府遗迹：
 *   - 修复材料检定：必须集齐【紫纹宝竹】×1、【中阶灵石】×5、【大挪移令】×1。
 *   - 终极结算：集齐后修复古传送阵，击退魔道精锐追兵、激活传送，
 *     触发【破空而去·传送碎星海】通关结局，结算天道点数并解锁二周目道碑气运继承。
 *
 * 原 demon_war_events.js 仅保留四阶段主线推进与阵营战役；
 * 此处承接终局任务与通关结算（单一职责，便于无头测试）。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

/* 终局三物（已在 data/demon_war_events.js 登记为 ITEMS） */
GAME.TeleportPortal = {

    NEED: ["dawei_zhuzhu", "mid_stone", "xiufu_zhenpan"],

    // ---------- 终局三物收集判定 ----------
    missingItems: function () {
        var need = this.NEED;
        var missing = [];
        for (var i = 0; i < need.length; i++) {
            if (GAME.State.countItem(need[i]) < 1) missing.push(GAME.DATA.ITEMS[need[i]].name);
        }
        return missing;
    },

    // ---------- 修复古传送阵（集齐三物即成） ----------
    repairTeleport: function () {
        var p = GAME.State.p();
        if (p.isDead) return false;
        if (p.teleportRepaired) { GAME.UI.log("古传送阵早已修复，阵纹流转生辉。", "system"); return true; }
        var missing = this.missingItems();
        if (missing.length) {
            GAME.UI.log("阵盘缺件难成——尚缺：" + missing.join("、") + "。", "system");
            return false;
        }
        p.teleportRepaired = true;
        GAME.UI.log("紫纹宝竹嵌入阵基，中阶灵石点亮阵眼，修复阵盘灵光复核全图——古传送阵轰然复苏，尘封万年的光门再度泛起涟漪！", "success");
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 终极决战：击退追兵并激活传送（修复后调用） ----------
    escape: function () {
        var p = GAME.State.p();
        if (!p.teleportRepaired) { GAME.UI.log("传送阵尚未修复，无从激活。", "system"); return false; }
        this.win();
        return true;
    },

    // ---------- 通关结算：碎星海 + 天道点数 + 二周目继承 ----------
    win: function () {
        var p = GAME.State.p();
        if (p.ending) return p.tiandao || 0;
        p.ending = "victory";
        p.endingRealm = p.realmIndex;
        if (GAME.State.unlockAchievement) GAME.State.unlockAchievement("ending_luanxinghai");
        // 天道点数 = 筑基层数×5 + 突破次数×2 + 成就数（含通关成就） + 战功（击杀×1）
        p.tiandao = (p.realmIndex - GAME.DATA.ZHUJI_GATE_INDEX) * 5
            + (p.stats.breakthroughs || 0) * 2
            + (p.achievements || []).length
            + (p.stats.kills || 0);
        GAME.UI.log("你一步踏入光门——天旋地转，灵光散尽时，咸腥海风扑面而来。碎星海，到了。", "success");
        GAME.UI.log("【通关大捷】一周目终！结算天道点数 " + p.tiandao + " 点——二周目轮回转世，道碑先天气运（真灵根开局 / 神识天生翻倍）静候继承。", "success");
        GAME.UI.updateUI();
        return p.tiandao;
    },
};
