/* =========================================================
 * js/yuanying.js —— 元婴篇：碎丹成婴（铺路事件）+ 元神出游
 *
 * 设计动因（借原著"碎丹成婴""元婴元神可离体"两处情节结构，全部架空化）：
 *   ① 碎丹成婴不走丹链，而走「三铺路」抉择事件——结丹后期点破境时先问一句
 *      "借外物 / 寻护持 / 养心神 / 无备硬凝"，择一写入 p.yuanyingPrep，
 *      加成由 Breakthrough.plan 统一结算（面板与结算同源，仍是唯一出口）。
 *   ② 元神出游：元婴方有元神，可离体远巡。神识从"上限数字"变成可投放资源——
 *      每次出游耗神识三成、耗时 1 个月、3 个月才能再出；有所得（遗藏/灵药/灵石），
 *      也可能伤神（心境 -5）。碎丹成婴要用的【千年灵药】，出游是药圃之外最快的来路。
 *
 * 挂点：
 *   - core.breakthrough   挂起 yuanying_prep（resume: "breakthrough"，照心魔劫模式）
 *   - core.findEvent      增 GAME.DATA.YUANING_EVENTS 查找分支（动态裁剪同 SEIZE_EVENTS）
 *   - core.resolveEventOutcomes  增 case "yuanying" → Yuanying.setPrep
 *   - Breakthrough.plan   读 p.yuanyingPrep 结算 baseChance/dmgMul/deathMul
 *   - core.passTime       Yuanying.tick(months) 递减出游冷却
 *   - ui.renderMap        元婴期渲染「元神出游」区块（非元婴不显）
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

/* ---------- 碎丹成婴铺路事件（结丹后期 index18 → 元婴初期 index19 前挂起） ---------- */
GAME.DATA.YUANING_EVENTS = {
    yuanying_prep: {
        id: "yuanying_prep",
        text: "结丹后期大圆满的这一夜，丹田里那枚金丹忽然停了旋转。\n下一瞬，蛛网般的裂痕爬满丹面——裂痕之后，传出极轻极轻的、婴儿啼哭般的脉动。\n你霎时明白：金丹将碎，元婴欲凝。此乃修士一生第二道天堑——碎得彻底，则婴成而得长生；碎得半吊，则丹毁人亡。\n铺路就在此时：借外物、寻护持、养心神，或索性无备硬凝。择一而行。",
        choices: [
            { text: "借灵药碎丹", tip: "耗 1 株【千年灵药】：成功率 +15%，反噬 ×0.7（囊中无药则不列此项）",
              outcomes: [{ type: "yuanying", mode: "herb" }] },
            { text: "寻同道护法", tip: "耗 3000 灵石：成功率 +5%，反噬 ×0.5 且免身陨（灵石不足则不列此项）",
              outcomes: [{ type: "yuanying", mode: "guard" }] },
            { text: "静养安神", tip: "耗时 6 个月、心境 +10：成功率 +8%（心境每 10 点另有 +2%）",
              outcomes: [{ type: "yuanying", mode: "mind" }] },
            { text: "无备硬凝", tip: "不假外物：3% 功成，失败六成身陨——凶极",
              outcomes: [{ type: "yuanying", mode: "bare" }] },
        ],
    },
};

/* ---------- 元神出游地点（元婴期；按当下所在地 chapter 解锁） ---------- */
GAME.DATA.ROAM_SITES = [
    {
        id: "yunguo", name: "云国山河", chapter: null,   // 非碎星海即可
        desc: "元神离体，须臾百里。岚州的山川城郭在脚下掠过，凡俗灯火如地上星河。",
        pool: [
            { id: "relic",  chance: 0.30, label: "古修遗藏" },
            { id: "herb",   chance: 0.20, label: "灵药踪迹" },
            { id: "stones", chance: 0.15, label: "灵石矿脉" },
            { id: "empty",  chance: 0.25, label: "一无所获" },
            { id: "hurt",   chance: 0.10, label: "神识受损" },
        ],
        loot: [
            { id: "pill_huichun",    chance: 0.50, qty: [1, 2] },
            { id: "tianhuo_crystal", chance: 0.30, qty: [1, 1] },
            { id: "iron_ore",        chance: 0.40, qty: [1, 2] },
        ],
        stones: [200, 400], exp: 50,
    },
    {
        id: "suixing", name: "碎星海", chapter: "star",  // 身在碎星海方可远巡此处
        desc: "元神化作一道青虹投向东面大海。群岛如星子碎落海面，妖修洞府的灵光时明时灭。",
        pool: [
            { id: "relic",  chance: 0.30, label: "古修遗藏" },
            { id: "herb",   chance: 0.25, label: "万年灵药" },
            { id: "stones", chance: 0.20, label: "海外灵矿" },
            { id: "empty",  chance: 0.15, label: "空茫海雾" },
            { id: "hurt",   chance: 0.10, label: "神识受损" },
        ],
        loot: [
            { id: "pill_huichun",    chance: 0.60, qty: [2, 3] },
            { id: "tianhuo_crystal", chance: 0.45, qty: [1, 2] },
            { id: "yinhun_zhong",    chance: 0.06, qty: [1, 1] },
        ],
        stones: [600, 1000], exp: 120,
    },
    {
        id: "guzhanchang", name: "古战场", chapter: null,
        desc: "元神掠过一片被岁月磨平的荒原。断戟残旗半埋沙中，地底仍渗着千百年前大战未散的煞气。",
        pool: [
            { id: "relic",  chance: 0.25, label: "古修遗蜕" },
            { id: "art",    chance: 0.15, label: "残魂授艺" },
            { id: "herb",   chance: 0.15, label: "战场灵药" },
            { id: "stones", chance: 0.15, label: "兵冢矿脉" },
            { id: "trap",   chance: 0.20, label: "杀机未消" },
            { id: "empty",  chance: 0.10, label: "空茫荒原" },
        ],
        loot: [
            { id: "pill_huichun",    chance: 0.5, qty: [1, 2] },
            { id: "tianhuo_crystal", chance: 0.4, qty: [1, 2] },
            { id: "beast_soul",      chance: 0.4, qty: [1, 2] },
        ],
        stones: [300, 600], exp: 80,
    },
    {
        id: "lingmai", name: "灵脉秘境", chapter: null,
        desc: "地肺深处一条灵脉裸露，灵气凝成液滴挂在石壁上。此处是炼器炼丹取材的洞天，也藏着地火凶险。",
        pool: [
            { id: "stones", chance: 0.30, label: "灵脉矿" },
            { id: "herb",   chance: 0.25, label: "灵药" },
            { id: "relic",  chance: 0.20, label: "古修遗宝" },
            { id: "trap",   chance: 0.15, label: "地火喷涌" },
            { id: "empty",  chance: 0.10, label: "空寂矿洞" },
        ],
        loot: [
            { id: "tianhuo_crystal", chance: 0.6, qty: [1, 2] },
            { id: "jinshi",         chance: 0.5, qty: [1, 2] },
            { id: "iron_ore",       chance: 0.5, qty: [1, 2] },
        ],
        stones: [500, 900], exp: 60,
    },
    {
        id: "xinghai_mijing", name: "星海秘境", chapter: "star",
        desc: "碎星海最深处的空间裂隙，星砂与碎光在虚空中凝成岛屿。这里是元婴修士才敢涉足的终极秘境，机缘与杀机同生。",
        pool: [
            { id: "relic",  chance: 0.28, label: "星海古宝" },
            { id: "art",    chance: 0.18, label: "妖王遗蜕传法" },
            { id: "herb",   chance: 0.20, label: "星海灵药" },
            { id: "stones", chance: 0.14, label: "星砂矿" },
            { id: "trap",   chance: 0.15, label: "空间乱流" },
            { id: "empty",  chance: 0.05, label: "虚空寂灭" },
        ],
        loot: [
            { id: "yinhun_zhong",    chance: 0.3, qty: [1, 1] },
            { id: "tianhuo_crystal", chance: 0.6, qty: [2, 3] },
            { id: "pill_huichun",    chance: 0.5, qty: [2, 3] },
            { id: "beast_soul",      chance: 0.4, qty: [1, 2] },
        ],
        stones: [800, 1400], exp: 160,
    },
];

GAME.Yuanying = {

    /* ================= 碎丹成婴·铺路 ================= */

    // 是否该在破境前挂起铺路事件（只问一次：p._yuanyingPrepOffered 防 resume 后重复挂）
    offerPrep: function (p) {
        p = p || GAME.State.p();
        if (p.realmIndex !== GAME.DATA.YUANING_GATE_SOURCE) return false;
        if (p.yuanyingPrep) return false;          // 已铺路（失败重试沿用加成，不重复问）
        if (p._yuanyingPrepOffered) return false;
        p._yuanyingPrepOffered = true;
        return true;
    },

    // 事件选项动态裁剪（没灵药不列"借灵药"、灵石不够不列"寻护法"；无备硬凝永远可选）
    eventFor: function (ev) {
        if (!ev || ev.id !== "yuanying_prep") return ev;
        var p = GAME.State.p();
        var yc = GAME.DATA.YUANING;
        var hasHerb = GAME.State.countItem("herb_qiannian") >= 1;
        var hasStone = (p.spiritStones || 0) >= (yc.guardCost || 3000);
        var choices = (ev.choices || []).filter(function (c) {
            var mode = (c.outcomes && c.outcomes[0]) ? c.outcomes[0].mode : null;
            if (mode === "herb")  return hasHerb;
            if (mode === "guard") return hasStone;
            return true;
        });
        var copy = {};
        for (var k in ev) copy[k] = ev[k];
        copy.choices = choices;
        return copy;
    },

    // 铺路结算（outcome type "yuanying"）：扣资源、写 p.yuanyingPrep、耗时的静养立即推进
    setPrep: function (o) {
        var p = GAME.State.p();
        var yc = GAME.DATA.YUANING;
        var mode = o && o.mode;
        if (mode === "herb") {
            if (GAME.State.countItem("herb_qiannian") < 1) {
                GAME.UI.log("你翻遍行囊，竟无一根千年灵药——无从借力，只得另想他法。", "system");
                return;
            }
            GAME.State.removeItem("herb_qiannian", 1);
            p.yuanyingPrep = "herb";
            GAME.UI.log("你将那株千年灵药就着灵酒服下，药力如一条暖河汇入丹田——金丹表面的裂痕，悄然深了一分。（成功率 +15%，反噬 ×0.7）", "moment");
        } else if (mode === "guard") {
            var cost = yc.guardCost || 3000;
            if ((p.spiritStones || 0) < cost) {
                GAME.UI.log("你摸出灵石数了又数，凑不齐请同道护法的价钱——只得另想他法。", "system");
                return;
            }
            p.spiritStones -= cost;
            p.yuanyingPrep = "guard";
            GAME.UI.log("你以 " + cost + " 灵石请来一位同阶道友坐镇洞府之外。应门那一刻，心里先踏实了三分。（成功率 +5%，反噬 ×0.5 且免身陨）", "moment");
        } else if (mode === "mind") {
            var months = (yc.mind && yc.mind.months) || 6;
            p.yuanyingPrep = "mind";
            GAME.Core.passTime(months);
            p.mind = (p.mind || 0) + (yc.mind.mind || 10);
            GAME.UI.log("你封了洞府，不饮不食，日只静坐观想。六个月后开门，灵台一片澄澈——神识凝厚如实质。（心境 +" + (yc.mind.mind || 10) + "，成功率 +8%）", "moment");
        } else {
            p.yuanyingPrep = "bare";
            GAME.UI.log("你挥退一切外物，只余一颗裂痕遍布的金丹与一具肉身——不假外物，硬凝元婴！（3% 功成，失败六成身陨）", "danger");
        }
        GAME.UI.updateUI();
    },

    /* ================= 元神出游 ================= */

    isYuanying: function (p) {
        p = p || GAME.State.p();
        return GAME.DATA.isYuanying ? GAME.DATA.isYuanying(p) : (p.realmIndex >= (GAME.DATA.YUANING_GATE_INDEX || 19));
    },

    // 冷却递减（由 core.passTime 调用）
    tick: function (months) {
        var p = GAME.State.p();
        if (p.roamCd > 0) p.roamCd = Math.max(0, p.roamCd - months);
    },

    // 可用出游地（按当下所在地 chapter）
    roamSites: function (p) {
        p = p || GAME.State.p();
        if (!this.isYuanying(p)) return [];
        var ch = (GAME.Map && GAME.Map.chapterOf) ? GAME.Map.chapterOf(p.realmIndex, p.location) : null;
        return (GAME.DATA.ROAM_SITES || []).filter(function (s) {
            if (!s.chapter) return true;                 // 云国山河：随处可巡
            return ch === s.chapter;                     // 碎星海：须身在碎星海
        });
    },

    // 出游门禁（返回 {ok, msg}）
    canRoam: function (p) {
        p = p || GAME.State.p();
        if (!this.isYuanying(p)) return { ok: false, msg: "元神出游乃元婴修士的手段——结丹之辈元神未固，离体即散。" };
        if (p.isDead) return { ok: false, msg: "尘虑枯骸，出游无从。" };
        if (p.pendingEvent) return { ok: false, msg: "机缘当前，先了断眼前事。" };
        if (p.combat) return { ok: false, msg: "斗法之中，元神不可离体。" };
        if (p.seclusion) return { ok: false, msg: "闭关之中，元神紧守祖窍。" };
        if ((p.roamCd || 0) > 0) return { ok: false, msg: "元神远巡耗神甚巨，还需 " + p.roamCd + " 个月温养。" };
        return { ok: true, msg: "" };
    },

    // 执行出游：耗神识三成、耗时 1 个月、冷却 3 个月
    roam: function (siteId) {
        var p = GAME.State.p();
        var chk = this.canRoam(p);
        if (!chk.ok) { GAME.UI.log(chk.msg, "system"); GAME.UI.updateUI(); return; }
        var site = null, list = GAME.DATA.ROAM_SITES || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === siteId) site = list[i];
        if (!site) { GAME.UI.log("去处不明。", "system"); return; }

        var sp = (GAME.State.getStats && GAME.State.getStats().spirit) || 0;
        var cost = Math.max(1, Math.ceil(sp * 0.3));
        GAME.UI.log("你阖目凝神，一缕元神自顶窍脱出，化作无形青虹投向" + site.name + "（耗神识 " + cost + " 点，历时 1 个月）……", "story");

        var roll = Math.random(), acc = 0, res = site.pool[site.pool.length - 1];
        for (var j = 0; j < site.pool.length; j++) {
            acc += site.pool[j].chance;
            if (roll < acc) { res = site.pool[j]; break; }
        }

        var self = this;
        if (res.id === "relic") {
            GAME.UI.log("元神掠过一处被古阵遮掩的山巅——阵纹已朽，遗藏半露。你穿阵而入，卷了能拿的一切。", "success");
            site.loot.forEach(function (g) {
                if (Math.random() < g.chance) {
                    var qty = self.rand(g.qty[0], g.qty[1]);
                    if (qty > 0) {
                        GAME.State.addItem(g.id, qty);
                        GAME.UI.log("自遗藏中取得【" + GAME.DATA.ITEMS[g.id].name + "】×" + qty + "。", "loot");
                    }
                }
            });
            p.currentExp += site.exp;
            GAME.UI.log("览古修遗泽，修为 +" + site.exp + "。", "success");
        } else if (res.id === "herb") {
            var qty = (site.id === "suixing") ? 2 : 1;
            GAME.State.addItem("herb_qiannian", qty);
            GAME.UI.log("幽谷深处，一株" + (qty > 1 ? "数万" : "数千") + "年灵药正吮吸地脉灵气。你以元神卷回根须土块，好生栽下。（【千年灵药】×" + qty + "）", "loot");
        } else if (res.id === "stones") {
            var st = this.rand(site.stones[0], site.stones[1]);
            p.spiritStones += st;
            GAME.UI.log("海外（山中）一条废弃矿脉，灵石尚余 " + st + " 枚——归你了。", "loot");
        } else if (res.id === "hurt") {
            p.mind = Math.max(0, (p.mind || 0) - 5);
            GAME.UI.log("归途撞上一缕游离煞气，元神被撕去一小角。你闷哼一声收回肉身，识海刺痛许久。（心境 -5）", "danger");
        } else if (res.id === "art") {
            p.currentExp += site.exp * 2;
            p.mind = (p.mind || 0) + 5;
            GAME.UI.log("你撞见一缕坐化前辈的残魂，他瞥你一眼，隔空点化三句真言——识海豁然开朗。（修为 +" + (site.exp * 2) + "，心境 +5）", "success");
        } else if (res.id === "trap") {
            p.mind = Math.max(0, (p.mind || 0) - 6);
            GAME.UI.log("元神误入一方杀机未消的古阵，被无形锋芒削去一缕神识。你急急抽身，识海刺痛。（心境 -6）", "danger");
        } else {
            GAME.UI.log("元神游遍四野，只撞见些寻常风景。一月方归，一无所获。", "system");
        }

        // 远巡归来：先推进这 1 个月行程，再计入温养冷却 3 个月（元神需时日起复）
        GAME.Core.passTime(1);
        p.roamCd = 3;
        if (GAME.Chronicle) GAME.Chronicle.narrate("yuanying_roam", p);
        GAME.Core.checkDeath();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // 面板文案（修行录/地图区块共用）
    label: function (p) {
        p = p || GAME.State.p();
        if (!this.isYuanying(p)) return "";
        var cd = p.roamCd || 0;
        return cd > 0 ? ("元神远巡后气弱，还需 " + cd + " 个月温养") : "元神凝厚，可离体远巡";
    },

    rand: function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },
};
