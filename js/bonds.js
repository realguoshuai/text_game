/* =========================================================
 * js/bonds.js —— 师承因果与 NPC 羁绊链
 *
 * ① 拜师结丹老祖【李玄尘】
 *      · 前置：以承露瓶催熟一株【五百年年份灵草】（五百年玄冰花）作拜师礼
 *      · 特权：正式成为亲传弟子；每月洞府免除低阶魔修骚扰；
 *              宗门执事任务奖励 +50%；获赐《青冥剑诀》前三层
 * ② 红颜羁绊支线
 *      · 凌清沅·因果暗结：筑基中期偶遇其轮回功反噬跌落筑基期，
 *        【暗中护法】→ 战胜伏击魔修 → 得保命底牌【朱雀环残片】
 *      · 柳蔓儿·与虎谋皮：红拂仙子撮合双修考察
 *        分支一「虚与委蛇索要筑基丹药」：得资源，略增心境负担
 *        分支二「冷淡回绝坚守道心」：心境 +15，免除后续燕家堡连带羁绊
 *      · 温巧兮·情丝斩断：赠【定颜丹】斩断尘缘，心境 +20，彻底免除心魔劫
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

/* 凌清沅支线中伏击的魔修（数据就近定义，避免污染主怪物表加载顺序） */
(function () {
    if (!GAME.DATA.MONSTERS) GAME.DATA.MONSTERS = [];
    var exists = false;
    GAME.DATA.MONSTERS.forEach(function (m) { if (m.id === "mo_xiu_fuji") exists = true; });
    if (!exists) {
        GAME.DATA.MONSTERS.push({
            id: "mo_xiu_fuji", name: "伏击的魔修", human: true, majorRealm: 1,
            hp: 1100, atk: 58, def: 32, speed: 12, spirit: 48, exp: 200,
            stones: [120, 260], killChance: 0, loseAge: [0, 0], loseStonePct: [0.2, 0.4],
            loot: [{ id: "mid_stone", chance: 0.5, qty: [1, 2] }],
            desc: "循着凌清沅的轮回反噬之气追来的魔修，出手狠辣。",
        });
    }
})();

GAME.Bonds = {

    bonds: function () {
        var p = GAME.State.p();
        if (!p.bonds) p.bonds = {};
        return p.bonds;
    },

    /* ================= ① 拜师李玄尘 ================= */
    // 前置：承露瓶催熟的五百年年份灵草（herb_xuanbing / herb_longlin 亦可）
    canApprentice: function () {
        var p = GAME.State.p();
        if (this.bonds().lihuayuan) return { ok: false, msg: "你已是李玄尘门下亲传，不必再拜。" };
        if (p.realmIndex < 13) return { ok: false, msg: "未入筑基，无缘得见结丹老祖。" };
        var gift = this._giftHerbId();
        if (!gift) {
            return { ok: false, msg: "拜师需一株五百年年份的灵草为礼（可以承露瓶 5 滴绿液催熟【五百年玄冰花】）。" };
        }
        return { ok: true, gift: gift };
    },
    _giftHerbId: function () {
        var cand = ["herb_xuanbing", "herb_longlin"];
        for (var i = 0; i < cand.length; i++) {
            if (GAME.State.countItem(cand[i]) > 0) return cand[i];
        }
        // 兜底：任何年份 ≥500 的灵草
        var inv = GAME.State.p().inventory || {};
        for (var id in inv) {
            if (inv[id] > 0 && GAME.DATA.ITEMS[id] && (GAME.DATA.ITEMS[id].years || 0) >= 500) return id;
        }
        return null;
    },

    apprentice: function () {
        var p = GAME.State.p();
        var chk = this.canApprentice();
        if (!chk.ok) {
            GAME.UI.log(chk.msg, "system");
            GAME.UI.updateUI();
            return false;
        }
        var gift = chk.gift;
        GAME.State.removeItem(gift, 1);
        var b = this.bonds();
        b.lihuayuan = { done: true, title: "亲传弟子" };
        p.masterId = "lihuayuan";
        p.sectRewardMul = 1.5;          // 宗门执事任务奖励 +50%
        p.noHarass = true;              // 每月免除低阶魔修骚扰
        GAME.UI.log("你捧着那株【" + GAME.DATA.ITEMS[gift].name + "】登门。李玄尘瞥了一眼，眼中首次有了几分颜色：" +
            "「承露瓶……你这小子，倒是有些门道。」", "story");
        GAME.UI.log("【拜师】你正式成为结丹老祖李玄尘的亲传弟子——洞府免去低阶魔修骚扰，宗门执事任务奖励 +50%。", "success");
        // 获赐《青冥剑诀》前三层
        if (GAME.Cultivation) GAME.Cultivation.learn("master");
        GAME.UI.updateUI();
        return true;
    },

    /* ================= ② 凌清沅·因果暗结 ================= */
    canNangongwan: function () {
        var p = GAME.State.p();
        if (this.bonds().nangongwan) return { ok: false, msg: "凌清沅这一段因果，已然了结。" };
        if (p.realmIndex < 16) return { ok: false, msg: "须筑基中期（四层以上）方会遇上此事。" };
        return { ok: true };
    },
    // choice: "guard"（暗中护法 → 战伏击魔修）/ "leave"（视而不见）
    nangongwan: function (choice) {
        var p = GAME.State.p();
        var chk = this.canNangongwan();
        if (!chk.ok) { GAME.UI.log(chk.msg, "system"); GAME.UI.updateUI(); return false; }
        if (choice === "leave") {
            this.bonds().nangongwan = { done: true, choice: "leave" };
            p.mind = Math.max(0, (p.mind || 0) - 5);
            GAME.UI.log("你终究没有上前。那道跌落筑基的身影隐入林间，只余一缕幽香。心境 -5。", "system");
            GAME.UI.updateUI();
            return true;
        }
        GAME.UI.log("密林深处，一名女子盘坐于青石之上，周身灵气忽高忽低——正是凌清沅，轮回功反噬，跌回了筑基期。", "story");
        GAME.UI.log("你隐在树后，替她挡下暗处窥伺的目光。（暗中护法）", "info");
        p.combatRoute = { type: "bonds", kind: "nangongwan" };
        GAME.Combat.start("mo_xiu_fuji");
        return true;
    },
    // 战胜伏击魔修后的结算（由 Combat 胜利率或直接调用）
    nangongwanWin: function () {
        var p = GAME.State.p();
        var b = this.bonds();
        b.nangongwan = { done: true, choice: "guard" };
        GAME.State.addItem("zhunque_huan_pian", 1);
        p.mind = (p.mind || 0) + 10;
        GAME.UI.log("魔修伏诛。凌清沅睁开眼，隔着薄雾看了你许久，只将一枚残片递来：「此物……留着保命。」", "story");
        GAME.UI.log("【获得】朱雀环残片 ×1（保命底牌）、心境 +10。", "success");
        GAME.UI.updateUI();
        return true;
    },

    /* ================= ③ 柳蔓儿·与虎谋皮 ================= */
    canDongxuaner: function () {
        var p = GAME.State.p();
        if (this.bonds().dongxuaner) return { ok: false, msg: "柳蔓儿这一段，已然有了了断。" };
        if (p.realmIndex < 16) return { ok: false, msg: "须筑基中期方有此事。" };
        return { ok: true };
    },
    // choice: "plot"（虚与委蛇索要筑基丹药）/ "refuse"（冷淡回绝坚守道心）
    dongxuaner: function (choice) {
        var p = GAME.State.p();
        var chk = this.canDongxuaner();
        if (!chk.ok) { GAME.UI.log(chk.msg, "system"); GAME.UI.updateUI(); return false; }
        var b = this.bonds();
        if (choice === "refuse") {
            b.dongxuaner = { done: true, choice: "refuse" };
            p.mind = (p.mind || 0) + 15;
            p.yanjiaImmunity = true;   // 免除后续燕家堡被连带羁绊
            GAME.UI.log("你淡淡回绝：「道心未固，不敢妄谈双修。」柳蔓儿怔了一怔，旋即掩唇轻笑，眼中却冷了几分。", "story");
            GAME.UI.log("心境 +15（现 " + p.mind + "）；日後燕家堡之事，你不会被牵扯进去。", "success");
        } else {
            b.dongxuaner = { done: true, choice: "plot" };
            GAME.State.addItem("pill_zhuji", 1);
            p.mind = Math.max(0, (p.mind || 0) - 8);
            GAME.UI.log("你含笑应下，顺势讨得一物——柳蔓儿取出一枚【筑基丹】递来，眉眼间尽是算计。", "story");
            GAME.UI.log("【获得】筑基丹 ×1；心境 -8（现 " + p.mind + "）——与虎谋皮，终究要付些代价。", "warning");
        }
        GAME.UI.updateUI();
        return true;
    },

    /* ================= ④ 温巧兮·情丝斩断 ================= */
    canChenqiaoqian: function () {
        var p = GAME.State.p();
        if (this.bonds().chenqiaoqian) return { ok: false, msg: "尘缘已斩，旧事不必再提。" };
        return { ok: true };
    },
    chenqiaoqian: function () {
        var p = GAME.State.p();
        var chk = this.canChenqiaoqian();
        if (!chk.ok) { GAME.UI.log(chk.msg, "system"); GAME.UI.updateUI(); return false; }
        if (GAME.State.countItem("dingyan_dan") <= 0) {
            GAME.UI.log("你本想赠她一物以作诀别，却想起囊中并无【定颜丹】。", "system");
            GAME.UI.updateUI();
            return false;
        }
        GAME.State.removeItem("dingyan_dan", 1);
        this.bonds().chenqiaoqian = { done: true };
        p.mind = (p.mind || 0) + 20;
        p.xinmoImmunity = true;    // 彻底免除心魔劫
        GAME.UI.log("你将【定颜丹】放在她掌心：「此后山高水长，各自珍重。」她怔怔看了半晌，终是收下，转身没入人海。", "story");
        GAME.UI.log("心境 +20（现 " + p.mind + "）；尘缘斩断，日后心魔劫与你无缘。", "success");
        GAME.UI.updateUI();
        return true;
    },
};
