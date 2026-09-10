/* =========================================================
 * data/demon_war_events.js —— 筑基期终局：魔道六宗入侵云国 · 古传送阵逃亡
 *
 * 四阶段推进（按筑基层数自动触发 checkPhase）：
 *   Ⅰ 筑基前期 1~3 层：建立独立洞府，研习大衍决，炼制二阶防御法器。
 *   Ⅱ 筑基中期 4~6 层：魔道六宗全面入侵，驻守前线灵石矿，击退鬼灵门刺杀队。
 *   Ⅲ 筑基后期 7~8 层：【燕家堡夺宝惊变】识破血祭大阵，流烟步+傀儡断后杀出重围。
 *   Ⅳ 筑基九层圆满：【破空而去】荒山枯井寻古修士洞府，集齐三物修复古传送阵，
 *      击退魔道精锐追兵，激活传送阵——通关结算，天道点数入道碑，二周目继承先天气运。
 * 纯数据+纯逻辑模块，供 smoke_foundation.js 无头验证。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.DATA = GAME.DATA || {};
GAME.DATA.ITEMS = GAME.DATA.ITEMS || {};

/* —— 终局任务道具 —— */
GAME.DATA.ITEMS.mid_stone      = { name: "中阶灵石",   type: "material", quality: "极品", price: 100, desc: "中阶灵石蕴含灵气远胜下品（1 枚兑 100 低阶灵石），传送阵阵眼供能所需。" };
GAME.DATA.ITEMS.xiufu_zhenpan  = { name: "修复阵盘",   type: "material", quality: "极品", price: 2000, desc: "古修士洞府中寻得的阵盘，铭刻传送阵全图。" };
GAME.DATA.ITEMS.dawei_zhuzhu   = { name: "紫纹宝竹", type: "material", quality: "极品", price: 3000, desc: "古传送阵阵基主材，千年一熟的天雷竹近亲。" };

/* —— 前线怪物（majorRealm:1 筑基级，词缀池供压制系统随机生成） —— */
GAME.DATA.MONSTERS = GAME.DATA.MONSTERS || [];
GAME.DATA.MONSTERS.push(
    { id: "guiling_assassin", name: "鬼灵门刺杀队高手", hp: 320, atk: 46, def: 30, speed: 16, spirit: 30,
      exp: 90, stones: [20, 40], killChance: 0.15, loseStonePct: [0.1, 0.2], loseAge: [1, 3],
      majorRealm: 1, affixPool: ["seizeSoul", "berserk"],
      loot: [{ id: "mid_stone", chance: 0.5, qty: [1, 2] }] },
    { id: "modao_elite", name: "魔道精锐追兵", hp: 480, atk: 60, def: 40, speed: 18, spirit: 36,
      exp: 140, stones: [30, 60], killChance: 0.2, loseStonePct: [0.15, 0.25], loseAge: [2, 4],
      majorRealm: 1, affixPool: ["thickShell", "berserk", "seizeSoul"],
      loot: [{ id: "mid_stone", chance: 0.7, qty: [1, 3] }, { id: "dawei_zhuzhu", chance: 0.3, qty: [1, 1] }] }
);

/* —— 四阶段主线定义 —— */
GAME.DATA.DEMON_WAR = {
    phases: [
        { id: 1, name: "魔道前夜", realmMin: 13, realmMax: 15, text: "魔道六宗陈兵云国边境，风声鹤唳。你独辟灵峰、研习《大衍决》，为大战积蓄底蕴。" },
        { id: 2, name: "前线御敌", realmMin: 16, realmMax: 18, text: "魔道六宗全面入侵！宗门调令如雪片——你驻守前线灵石矿，与鬼灵门刺杀队血战。" },
        { id: 3, name: "燕家堡惊变", realmMin: 19, realmMax: 20, text: "燕家堡夺宝大会暗藏鬼灵门血祭大阵！识破阴谋后，你借流烟步与傀儡断后杀出血路——七大派败局已定。" },
        { id: 4, name: "破空而去", realmMin: 21, realmMax: 21, text: "宗门弃你而去。荒山枯井深处，一座上古修士洞府静静沉眠——古传送阵，是你唯一的生路。" },
    ],
};

GAME.DemonWar = {

    // ---------- 按境界推进阶段（突破后由 core 调用） ----------
    checkPhase: function () {
        var p = GAME.State.p();
        if (p.isDead || p.realmIndex <= GAME.DATA.ZHUJI_GATE_INDEX) return;
        var phases = GAME.DATA.DEMON_WAR.phases;
        for (var i = 0; i < phases.length; i++) {
            var ph = phases[i];
            if (p.realmIndex >= ph.realmMin && p.realmIndex <= ph.realmMax && (p.warPhase || 0) < ph.id) {
                p.warPhase = ph.id;
                GAME.UI.log("【" + ph.name + "】" + ph.text, "story");
                if (ph.id === 4) {
                    GAME.UI.log("通往碎星海的生路只剩一条：集齐【紫纹宝竹】【中阶灵石】【修复阵盘】，修复荒山枯井中的古传送阵！", "warning");
                }
                break;
            }
        }
    },

    // ---------- 终局三物收集判定（委托 teleport_portal.js，保持单一数据源） ----------
    missingItems: function () {
        return GAME.TeleportPortal.missingItems();
    },

    // ---------- 阵营主线战役：灵石矿前线战备（筑基中期驻守） ----------
    // 接受宗门调令驻守前线灵石矿，迎战鬼灵门/魔焰门修士突袭，结算宗门功勋与中阶灵石。
    frontlineDefend: function () {
        var p = GAME.State.p();
        if (p.isDead) return null;
        if (p.realmIndex < 16 || p.realmIndex > 18) {
            GAME.UI.log("前线战事唯有筑基中期（四~六层）方得调令，此时尚无征召。", "system");
            return null;
        }
        var contrib = 30 + GAME.Combat.rand(0, 20);   // 宗门功勋
        var stones = 2 + GAME.Combat.rand(0, 2);        // 中阶灵石（库存 2~4 枚）
        p.sectContrib = (p.sectContrib || 0) + contrib;
        for (var i = 0; i < stones; i++) GAME.State.addItem("mid_stone", 1);
        GAME.UI.log("你率内门弟子死守灵石矿脉，击退鬼灵门刺杀队——宗门记功 " + contrib + " 点，缴获中阶灵石 " + stones + " 枚！", "success");
        p.stats.kills = (p.stats.kills || 0) + 1;
        GAME.UI.updateUI();
        return { contrib: contrib, stones: stones };
    },

    // ---------- 燕家堡夺宝惊变：两分支检定（筑基后期触发） ----------
    // branch: "puppet" 自爆傀儡断后·流烟步突围（耗傀儡，稳脱身）；
    //         "break"  硬破血祭大阵·击杀鬼灵门修士（高风险，缴获大挪移令）
    yanjiaFortune: function (branch) {
        var p = GAME.State.p();
        if (p.isDead) return null;
        if (p.realmIndex < 19) {
            GAME.UI.log("燕家堡夺宝大会尚在筑基后期（七~八层）方现端倪。", "system");
            return null;
        }
        if (branch === "puppet") {
            // 自爆傀儡断后 + 流烟步：需至少 1 具傀儡作为诱饵
            var owned = GAME.State.countItem("puppet_gongjian") + GAME.State.countItem("puppet_julang") + GAME.State.countItem("puppet_juyuan");
            if (owned < 1) {
                GAME.UI.log("你欲以自爆傀儡断后，却无一架可用——断后无着，流烟步难施。", "system");
                return null;
            }
            // 消耗 1 具傀儡作为诱饵
            if (GAME.State.countItem("puppet_gongjian") >= 1) GAME.State.removeItem("puppet_gongjian", 1);
            else if (GAME.State.countItem("puppet_julang") >= 1) GAME.State.removeItem("puppet_julang", 1);
            else GAME.State.removeItem("puppet_juyuan", 1);
            p.yanjiaSurvived = true;
            GAME.UI.log("你弃一具傀儡作饵，轰然自爆阻滞追兵，身形化作青烟——流烟步展开，从容脱出重围！", "success");
            GAME.UI.updateUI();
            return { branch: "puppet", survived: true };
        }
        if (branch === "break") {
            // 硬破血祭大阵：掷骰判定（50%），成则斩鬼灵门修士、缴获大挪移令
            if (Math.random() < 0.5) {
                GAME.State.addItem("xiufu_zhenpan", 1);  // 大挪移令（终局道具之一，剧情缴获）
                p.yanjiaSurvived = true;
                p.stats.kills = (p.stats.kills || 0) + 1;
                GAME.UI.log("你逆冲血祭大阵，剑光过处鬼灵门修士授首——夺得【修复阵盘】与大挪移令！七大派败局已定，你独善其身。", "success");
                GAME.UI.updateUI();
                return { branch: "break", survived: true, loot: "xiufu_zhenpan" };
            }
            // 失败：重伤，扣血但脱险
            var dmg = 60 + GAME.Combat.rand(0, 40);
            p.currentHp = Math.max(1, p.currentHp - dmg);
            GAME.UI.log("血祭大阵反噬如潮，你硬撼受创（-" + dmg + " 气血），终究借遁光狼狈脱出。", "warning");
            GAME.UI.updateUI();
            return { branch: "break", survived: false, dmg: dmg };
        }
        GAME.UI.log("未知分支：" + branch, "system");
        return null;
    },

    // ---------- 终局逻辑委托给 teleport_portal.js（向后兼容旧引用） ----------
    repairTeleport: function () { return GAME.TeleportPortal.repairTeleport(); },
    escape: function () { return GAME.TeleportPortal.escape(); },
    win: function () { return GAME.TeleportPortal.win(); },
};
