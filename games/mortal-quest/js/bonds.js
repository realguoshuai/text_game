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

/* —— 收徒立派 · 弟子养成配置（元婴 + 已立派后解锁） —— */
GAME.DATA.DISCIPLES = {
    gateRealm: 19,           // 元婴方可收徒
    needSect: true,          // 须已开宗立派（p.lingShan.founded）
    cap: 3,                  // 门下同时在册弟子上限
    recruitStones: 800,      // 收徒礼（安家 + 传功资）
    talents: [               // 根骨档位（收徒时加权掷定）
        { name: "寻常", rate: 1.0, weight: 50 },
        { name: "上佳", rate: 1.4, weight: 32 },
        { name: "天纵", rate: 2.0, weight: 15 },
        { name: "绝世", rate: 3.0, weight: 3 },
    ],
    growthPerMonth: 6,       // 基础月成长
    stages: [                // 弟子境界（按累计成长划分）
        { name: "炼气", need: 0 },
        { name: "筑基", need: 120 },
        { name: "结丹", need: 400 },
        { name: "元婴", need: 900 },
    ],
    trainExpCost: 30,        // 传功：每授一次耗自身修为
    trainStones: 200,        // 传功：耗灵石
    trainGrowth: 40,         // 传功：一次 +40 成长
    dispatchMonths: 6,       // 历练耗时（月）
    dispatchRisk: 0.25,      // 历练受伤概率
    tributeGrowth: 400,      // 成长达结丹 → 开始每月供奉反哺
    tributeStones: 150,      // 供奉弟子月奉灵石
    graduateNeed: 900,       // 成长达元婴 → 可出师
    graduateStones: 3000,    // 出师谢师礼
    graduateFame: 30,        // 出师为门派挣得名声
};

/* 弟子姓名池（架空，去原著化——不用任何原作人名） */
GAME.DATA.DISCIPLE_NAMES = [
    "林砚", "沈辞", "苏舫", "顾遥", "叶知秋", "程羽",
    "白砚", "谢无衣", "江临", "温折之", "阮青", "段云舟",
    "闻人戟", "卫照", "祝小满", "宋雨眠",
];

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
        if (p.realmIndex < 14) return { ok: false, msg: "须筑基中期以上方会遇上此事。" };
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
        if (p.realmIndex < 14) return { ok: false, msg: "须筑基中期方有此事。" };
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

    /* ================= ⑤ 收徒立派 · 弟子养成（元婴 + 已立派） ================= */
    _dcfg: function () { return GAME.DATA.DISCIPLES; },
    disciples: function () {
        var p = GAME.State.p();
        if (!p.disciples) p.disciples = [];
        return p.disciples;
    },
    // 能否收徒
    canRecruit: function () {
        var p = GAME.State.p(), c = this._dcfg();
        if ((p.realmIndex || 0) < c.gateRealm) return { ok: false, msg: "非元婴修为，尚无开山收徒的底气。" };
        if (c.needSect && !(p.lingShan && p.lingShan.founded)) return { ok: false, msg: "尚未开宗立派（须先在碎星海立地磁灵山），无处安顿弟子。" };
        if (this.disciples().length >= c.cap) return { ok: false, msg: "门下在册弟子已满（" + c.cap + " 席），先安排老弟子出师罢。" };
        if ((p.spiritStones || 0) < c.recruitStones) return { ok: false, msg: "收徒需备安家礼 " + c.recruitStones + " 灵石（现 " + (p.spiritStones || 0) + "）。" };
        return { ok: true };
    },
    // 按 weight 掷根骨
    _rollTalent: function () {
        var c = this._dcfg(), total = 0, i;
        for (i = 0; i < c.talents.length; i++) total += c.talents[i].weight;
        var roll = Math.random() * total;
        for (i = 0; i < c.talents.length; i++) { if (roll < c.talents[i].weight) return i; roll -= c.talents[i].weight; }
        return 0;
    },
    _pickName: function (taken) {
        var pool = GAME.DATA.DISCIPLE_NAMES.filter(function (n) { return taken.indexOf(n) < 0; });
        if (!pool.length) pool = GAME.DATA.DISCIPLE_NAMES;
        return pool[Math.floor(Math.random() * pool.length)];
    },
    // 收徒：耗灵石，掷根骨，收一名弟子
    recruit: function () {
        var p = GAME.State.p(), c = this._dcfg();
        if (p.isDead || p.combat) return false;
        var chk = this.canRecruit();
        if (!chk.ok) { GAME.UI.log(chk.msg, "system"); GAME.UI.updateUI(); return false; }
        p.spiritStones -= c.recruitStones;
        var d = this.disciples();
        var t = this._rollTalent();
        var talent = c.talents[t];
        var name = this._pickName(d.map(function (x) { return x.name; }));
        d.push({ name: name, talent: t, growth: 0, months: 0, tributing: false });
        GAME.UI.log("你花 " + c.recruitStones + " 灵石设下简易收徒礼，山门外跪着个眼神清亮的少年——你收他为开山首徒，赐名随你姓。根骨：【" + talent.name + "】。", "success");
        GAME.UI.log("【收徒】弟子" + name + "入门。弟子按月成长（受你境界加成），可传功点拨、派下山历练；成长至结丹便开始供奉反哺，至元婴则可出师。", "info");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },
    // 弟子当前境界名
    stageOf: function (growth) {
        var c = this._dcfg(), idx = 0, i;
        for (i = 0; i < c.stages.length; i++) if (growth >= c.stages[i].need) idx = i;
        return { idx: idx, name: c.stages[idx].name };
    },
    // 传功：耗自身修为 + 灵石，为指定弟子 +成长
    train: function (idx) {
        var p = GAME.State.p(), c = this._dcfg();
        var d = this.disciples()[idx];
        if (!d) { GAME.UI.log("并无此弟子。", "system"); return false; }
        if ((p.currentExp || 0) < c.trainExpCost) { GAME.UI.log("自身修为不足 " + c.trainExpCost + "，无从传功。", "system"); return false; }
        if ((p.spiritStones || 0) < c.trainStones) { GAME.UI.log("传功需耗灵石 " + c.trainStones + "（现 " + (p.spiritStones || 0) + "）。", "system"); return false; }
        p.currentExp -= c.trainExpCost;
        p.spiritStones -= c.trainStones;
        d.growth += c.trainGrowth;
        GAME.UI.log("你将" + d.name + "唤至前，耗时旬月为其梳理气机、讲解道途——弟子茅塞顿开（成长 +" + c.trainGrowth + "）。", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },
    // 历练：派弟子下山（耗时 dispatchMonths），得资源，小概率受伤
    dispatch: function (idx) {
        var p = GAME.State.p(), c = this._dcfg();
        var d = this.disciples()[idx];
        if (!d) { GAME.UI.log("并无此弟子。", "system"); return false; }
        if (p.isDead || p.combat || p.pendingEvent) return false;
        GAME.UI.log("你遣" + d.name + "下山历练，临行嘱咐再三……往返约 " + c.dispatchMonths + " 个月。", "system");
        GAME.Core.passTime(c.dispatchMonths);   // 时间唯一出口（弟子亦随之成长）
        if (p.isDead) return false;
        if (Math.random() < c.dispatchRisk) {
            var loss = Math.round(d.growth * 0.15);
            d.growth = Math.max(0, d.growth - loss);
            GAME.UI.log(d.name + "在外遇袭，负伤而归（成长 -" + loss + "）——所幸人无事，你赐药为其调理。", "warning");
        } else {
            var stones = GAME.Core.rand(300, 900);
            p.spiritStones += stones;
            if (p.lingShan) p.lingShan.fame += 2;
            GAME.UI.log(d.name + "历练归来，风尘仆仆却眼神更坚，献上沿途所得的灵石 +" + stones + "（门派名声 +2）。", "success");
        }
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },
    // 出师：成长达标的弟子辞师，得谢师礼与门派名声
    graduate: function (idx) {
        var p = GAME.State.p(), c = this._dcfg();
        var d = this.disciples()[idx];
        if (!d) { GAME.UI.log("并无此弟子。", "system"); return false; }
        if (d.growth < c.graduateNeed) { GAME.UI.log(d.name + " 尚需打磨（成长 " + Math.floor(d.growth) + "/" + c.graduateNeed + "），未够出师之格。", "system"); GAME.UI.updateUI(); return false; }
        p.spiritStones += c.graduateStones;
        if (p.lingShan) p.lingShan.fame += c.graduateFame;
        this.disciples().splice(idx, 1);
        GAME.UI.log("【出师】" + d.name + " 修至元婴，向你三叩首后仗剑远去——临别奉上谢师礼 " + c.graduateStones + " 灵石，为师门挣得名声 " + c.graduateFame + "。", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },
    // 时间推进出口：弟子按月成长；结丹后开始供奉反哺
    discipleTick: function (months) {
        var p = GAME.State.p(), c = this._dcfg();
        if (!months || p.isDead) return;
        var d = this.disciples();
        if (!d.length) return;
        var masterBonus = 1 + Math.max(0, (p.realmIndex || 0) - 18) * 0.1;   // 师者境界越高，弟子长得越快
        var tribute = 0;
        for (var i = 0; i < d.length; i++) {
            var t = c.talents[d[i].talent] || c.talents[0];
            d[i].growth += c.growthPerMonth * t.rate * masterBonus * months;
            d[i].months += months;
            if (d[i].growth >= c.tributeGrowth) {
                tribute += c.tributeStones * months;
                if (!d[i].tributing) {
                    d[i].tributing = true;
                    GAME.UI.log("弟子" + d[i].name + "修至" + this.stageOf(d[i].growth).name + "，开始每月向山门供奉反哺。", "info");
                }
            }
        }
        if (tribute > 0) p.spiritStones += tribute;   // 供奉静默入账，避免逐 tick 刷屏
        return tribute;
    },
};
