/* =========================================================
 * js/endings.js —— 筑基期后·多结局系统（周目终局）
 * 设计原则：
 *   ① 结局由玩家在此前剧情中的**选择与作为**分化，而非单线通关；
 *   ② 终局阶段（warPhase 4）展示全部结局，未解锁灰显并写明条件，
 *      玩家自行择一收束周目；
 *   ③ 各结局独立天道点结算与结局文，兼容旧档 p.ending==="victory"。
 * 结局清单（原著底色）：
 *   victory      破空而去 · 碎星海（修复传送阵，逃离云国）
 *   jiedan       结丹之路 · 黄枫真传（李玄尘亲传 + 筑基七层以上）
 *   shuangxiu    红尘之约 · 双修证道（凌清沅因果：暗中护法）
 *   duxiu        孤峰悟道 · 道心通明（回绝柳蔓儿 + 斩断温巧兮 + 未见凌清沅）
 *   moxiu        魔焰噬心 · 堕入魔道（身怀三枚以上阴魂精魄）
 * ========================================================= */
GAME.Endings = {
    byId: function (id) {
        var list = this.list();
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    },

    // ---------- 全结局定义 + 解锁检定 ----------
    list: function () {
        var p = GAME.State.p();
        var B = GAME.Bonds ? GAME.Bonds.bonds() : (p.bonds || {});
        var master = p.masterId === "lihuayuan" || !!(B && B.lihuayuan && B.lihuayuan.done);
        var nanGuard = !!(B && B.nangongwan && B.nangongwan.done && B.nangongwan.choice === "guard");
        var dongRefuse = !!(B && B.dongxuaner && B.dongxuaner.done && B.dongxuaner.choice === "refuse");
        var chenCut = !!(B && B.chenqiaoqian && B.chenqiaoqian.done);
        var moSoul = GAME.State.countItem("yin_hun_soul") >= 3;

        return [
            {
                id: "victory", name: "破空而去 · 碎星海",
                cond: "修复古传送阵（紫纹宝竹＋中阶灵石＋修复阵盘），一步踏入万里重洋。",
                text: "光门合拢，云国的恩怨情仇尽数留在身后。咸腥海风扑面——碎星海的万岛仙城，才是真正的舞台。",
                bonus: 0, needPortal: true,
                unlocked: function () { return !!p.teleportRepaired; },
                msg: p.teleportRepaired ? "" : "传送阵尚未修复。",
            },
            {
                id: "jiedan", name: "结丹之路 · 黄枫真传",
                cond: "拜入李玄尘门下且修为至筑基七层以上——得师护道，闭关冲击结丹。",
                text: "李玄尘亲手封了你的洞府：「三年之内，灵药我给你备齐。」丹房地火日夜不熄——结丹，就在此一搏。",
                bonus: 20, needPortal: false,
                unlocked: function () { return master && p.realmIndex >= 19; },
                msg: (!master) ? "须先拜入李玄尘门下。" : (p.realmIndex < 19 ? "须修为至筑基七层以上。" : ""),
            },
            {
                id: "shuangxiu", name: "红尘之约 · 双修证道",
                cond: "凌清沅轮回功反噬跌境时选择暗中护法并胜之——因果既结，结伴同行。",
                text: "凌清沅将一缕系着红绳的玉符放入你掌心：「大道漫漫，你我同行。」碎星海的传闻里，从此多了一对璧人。",
                bonus: 10, needPortal: false,
                unlocked: function () { return nanGuard; },
                msg: nanGuard ? "" : "须完成凌清沅·暗中护法。",
            },
            {
                id: "duxiu", name: "孤峰悟道 · 道心通明",
                cond: "冷淡回绝柳蔓儿、以定颜丹斩断温巧兮情丝、且未结凌清沅之缘——万丈红尘，不染寸心。",
                text: "情丝尽斩，再无挂碍。你于坐忘峰顶一坐百年，承露瓶青芒明灭——世人只见青梧谷多了一位铁面金丹真人（预兆）。",
                bonus: 15, needPortal: false,
                unlocked: function () { return dongRefuse && chenCut && !nanGuard; },
                msg: (dongRefuse ? "" : "须冷淡回绝柳蔓儿。") + (chenCut ? "" : "须以定颜丹斩断温巧兮。") + (nanGuard ? "已结凌清沅之缘，道心有痕。" : ""),
            },
            {
                id: "moxiu", name: "魔焰噬心 · 堕入魔道",
                cond: "身怀三枚以上阴魂精魄——魔功入体，再难回头。",
                text: "阴魂精魄在丹田内日夜嘶鸣，你的眼底早已映不出月色。幽冥教余孽奉你为尊——云国江湖，从此多了一位令人闻风丧胆的魔头。",
                bonus: -10, needPortal: false,
                unlocked: function () { return moSoul; },
                msg: moSoul ? "" : "须身怀三枚以上阴魂精魄（斩杀魔道修士可得）。",
            },
        ];
    },

    // ---------- 天道点：通用公式 + 结局加成 ----------
    calcTiandao: function (ed) {
        var p = GAME.State.p();
        var base = (p.realmIndex - GAME.DATA.ZHUJI_GATE_INDEX) * 5
            + (p.stats.breakthroughs || 0) * 2
            + (p.achievements || []).length
            + (p.stats.kills || 0);
        return base + (ed.bonus || 0);
    },

    canChoose: function (id) {
        var p = GAME.State.p();
        var ed = this.byId(id);
        if (!ed) return { ok: false, msg: "无此结局。" };
        if (p.ending) return { ok: false, msg: "本周目已了结。" };
        var u = ed.unlocked();
        if (!u) return { ok: false, msg: ed.msg };
        if (ed.needPortal && !p.teleportRepaired) return { ok: false, msg: "传送阵尚未修复。" };
        return { ok: true };
    },

    // ---------- 收束周目 ----------
    choose: function (id) {
        var p = GAME.State.p();
        var chk = this.canChoose(id);
        if (!chk.ok) { GAME.UI.log(chk.msg, "system"); GAME.UI.updateUI(); return false; }
        var ed = this.byId(id);
        if (id === "victory") {
            // 走原通关链（含碎星海成就与文风日志）
            GAME.TeleportPortal.win();
            p.ending = "victory";
        } else {
            p.ending = id;
            p.endingRealm = p.realmIndex;
            GAME.UI.log("【" + ed.name + "】" + ed.text, "success");
            GAME.UI.log("【周目终了】结局「" + ed.name + "」——结算天道点数。", "success");
        }
        p.tiandao = this.calcTiandao(ed);
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },
};
