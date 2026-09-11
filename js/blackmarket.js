/* =========================================================
 * js/blackmarket.js —— 坊市旧货摊 + 地下黑市销赃 + 神识尾随
 * 旧货摊：神识鉴定 / 盲买被坑；黑市：高阶灵药变现，隐匿判定失败触发尾随。
 * 全部配置读取自 GAME.DATA.CONTENT / GAME.DATA.ITEMS。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.BlackMarket = {

    // ---------- 旧货摊进货（未鉴定货架） ----------
    refreshJunk: function () {
        var cfg = GAME.DATA.CONTENT.BLACKMARKET_JUNK;
        var goods = [];
        cfg.forEach(function (j) {
            goods.push({ id: j.id, price: j.price, needSpirit: j.needSpirit, realId: j.realId, treasure: j.treasure, appraised: false });
        });
        GAME.State.p().junkGoods = goods;
        return goods;
    },

    ensureJunk: function () {
        var p = GAME.State.p();
        // 仅首次进入时铺货；买空后留空，等 passTime 到 junkNextRefresh 才换货（与坊市同节奏）
        // ⚠️ 不能用 `!p.junkGoods` 判断：模板初值是 []，空数组为 truthy，
        //    会导致首次进入旧货摊永不铺货（玩家须干等到第 12 个月才见货）。
        if (!p.junkStocked) {
            p.junkStocked = true;
            this.refreshJunk();
        }
    },

    /* ================= 地下黑市·筑基材料轮换（每 3 月刷新） =================
     * 配置：GAME.DATA.CONTENT.BLACK_ROTATION { months, goods:[{id, qtyRange, price}] }
     * 每期随机上架其中若干种，数量限定（1~3 份），售罄即无，须等下期。
     */
    rotationCfg: function () {
        return (GAME.DATA.CONTENT && GAME.DATA.CONTENT.BLACK_ROTATION) || null;
    },

    refreshRotation: function () {
        var cfg = this.rotationCfg();
        if (!cfg) return [];
        var p = GAME.State.p();
        var list = [];
        cfg.goods.forEach(function (g) {
            if (Math.random() < 0.5) return;   // 每期各货源半数机率现身（黑市货源不稳）
            var lo = g.qtyRange[0], hi = g.qtyRange[1];
            var qty = lo + Math.floor(Math.random() * (hi - lo + 1));
            list.push({ id: g.id, qty: qty, price: g.price });
        });
        if (!list.length && cfg.goods.length) {
            // 保底：至少上架一种，免得连续数期空手
            var f = cfg.goods[0];
            list.push({ id: f.id, qty: f.qtyRange[0], price: f.price });
        }
        p.blackGoods = list;
        return list;
    },

    tickRotation: function () {
        var cfg = this.rotationCfg();
        if (!cfg) return;
        var p = GAME.State.p();
        if (p.blackNextRefresh == null) p.blackNextRefresh = p.totalMonths;
        if (p.totalMonths >= p.blackNextRefresh) {
            this.refreshRotation();
            p.blackNextRefresh = p.totalMonths + cfg.months;
            GAME.UI.log("地下黑市换了一批门路——筑基散修所需的紧俏材料悄然上架。", "system");
        }
    },

    ensureRotation: function () {
        var p = GAME.State.p();
        if (!p.blackGoods) this.tickRotation();
    },

    buyRotation: function (index) {
        var p = GAME.State.p();
        if (p.isDead) return;
        var g = (p.blackGoods || [])[index];
        if (!g || g.qty <= 0) return;
        if (p.spiritStones < g.price) {
            GAME.UI.log("灵石不足，黑市掌事收回布包：「没钱就别挡道。」", "system");
            GAME.UI.updateUI();
            return;
        }
        p.spiritStones -= g.price;
        g.qty -= 1;
        GAME.State.addItem(g.id, 1);
        if (g.qty <= 0) p.blackGoods.splice(index, 1);
        GAME.UI.log("你以 " + g.price + " 灵石从黑市购得【" + GAME.DATA.ITEMS[g.id].name + "】×1。", "loot");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 神识鉴定 ----------
    appraise: function (index) {
        var p = GAME.State.p();
        if (p.isDead) return;
        var g = p.junkGoods[index];
        if (!g) return;
        if (g.appraised) { GAME.UI.log("此物已鉴定过了。", "system"); GAME.UI.updateUI(); return; }
        var spirit = GAME.State.getStats().spirit;
        if (spirit < g.needSpirit) {
            GAME.UI.log("你神识仅 " + spirit + "，不足以看穿此物门道，只能盲买赌运气。", "warning");
            GAME.UI.updateUI();
            return;
        }
        g.appraised = true;
        var real = GAME.DATA.ITEMS[g.realId];
        GAME.UI.log("神识扫过，真伪立判：这【" + GAME.DATA.ITEMS[g.id].name + "】内里竟是【" + real.name + "】！（" + (g.treasure ? "确是宝贝" : "可惜只是废铁") + "）", "success");
        GAME.UI.updateUI();
    },

    // ---------- 购买（鉴定过如实得；盲买 50% 被坑得废铁） ----------
    buyJunk: function (index) {
        var p = GAME.State.p();
        if (p.isDead) return;
        var g = p.junkGoods[index];
        if (!g) return;
        if (p.spiritStones < g.price) { GAME.UI.log("灵石不足，摊主嗤之以鼻。", "system"); GAME.UI.updateUI(); return; }
        p.spiritStones -= g.price;
        var gotId = g.appraised ? g.realId : (Math.random() < 0.5 ? g.realId : "junk_scrap");
        GAME.State.addItem(gotId, 1);
        p.junkGoods.splice(index, 1);
        if (gotId === "junk_scrap") GAME.UI.log("你花 " + g.price + " 灵石盲买，摊主阴笑——到手竟是【废铁】！", "danger");
        else GAME.UI.log("你以 " + g.price + " 灵石淘得【" + GAME.DATA.ITEMS[gotId].name + "】！", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 地下黑市销赃：100+ 高阶灵药变现（价远高于坊市） ----------
    sellBlack: function (herbId) {
        var p = GAME.State.p();
        if (p.isDead) return;
        var cfg = GAME.DATA.CONTENT.TRIAL.blackPrice;
        if (!cfg[herbId]) { GAME.UI.log("此物黑市不收。", "system"); GAME.UI.updateUI(); return; }
        if (GAME.State.countItem(herbId) < 1) return;
        GAME.State.removeItem(herbId);
        var price = cfg[herbId];
        p.spiritStones += price;
        GAME.UI.log("你于地下黑市脱手【" + GAME.DATA.ITEMS[herbId].name + "】，得 " + price + " 灵石（远高于坊市）。", "loot");

        // 隐匿判定：煞气升概率，敛气等级降概率
        var failChance = 0.15 + p.shaQi * 0.02 - p.concealLevel * 0.12 -
            (GAME.Home ? GAME.Home.tailReduce() : 0);   // 护山大阵：行迹难寻
        failChance = Math.max(0.05, Math.min(0.6, failChance));
        if (Math.random() < failChance) {
            p.tracking = { stones: price };
            GAME.UI.log("交易既毕，你忽觉背后一缕神识如影随形——有人尾随而来！", "danger");
        } else {
            GAME.UI.log("你敛息潜行，安然脱身。", "info");
        }
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 黑市秘籍货架：魔道功法（灵石购入，修习沾染煞气） ----------
    buySkill: function (index) {
        var p = GAME.State.p();
        if (p.isDead) return;
        var cfg = GAME.DATA.CONTENT.BLACK_SKILLS;
        if (!cfg || !cfg[index]) return;
        var g = cfg[index];
        var item = GAME.DATA.ITEMS[g.id];
        if (p.spiritStones < g.price) { GAME.UI.log("灵石不足，黑市贩子冷笑。", "system"); GAME.UI.updateUI(); return; }
        if (GAME.State.countItem(g.id) > 0) { GAME.UI.log("你已持有【" + item.name + "】秘籍，不必再买。", "system"); GAME.UI.updateUI(); return; }
        p.spiritStones -= g.price;
        GAME.State.addItem(g.id, 1);
        GAME.UI.log("你以 " + g.price + " 灵石自黑市购得【" + item.name + "】秘籍。（研习请往「技能」页签）", "loot");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 神识尾随三选项 ----------
    chooseTrack: function (option) {
        var p = GAME.State.p();
        if (!p.tracking || p.isDead) return;
        var stones = p.tracking.stones;
        p.tracking = null;

        if (option === "escape") {
            // A：神行符 / 御风诀 强行逃离（速度检定）
            if (GAME.State.countItem("talisman_shenxing") > 0) {
                GAME.State.removeItem("talisman_shenxing");
                GAME.UI.log("你焚去【神行符】，御风而去，尾随者被甩得无影无踪。（保住 " + stones + " 灵石）", "success");
            } else {
                var s = GAME.State.getStats();
                var chance = Math.min(0.9, Math.max(0.1, 0.4 + (s.speed - 9) * 0.05));
                if (Math.random() < chance) GAME.UI.log("你施展御风诀狂奔，险险甩脱尾随！（保住 " + stones + " 灵石）", "success");
                else { GAME.UI.log("你速度不及，被尾随者追上！只得仓促应战。", "danger"); GAME.Combat.start("robber"); return; }
            }
        } else if (option === "fight") {
            // B：引至荒野反杀（生死战，胜则夺其全部身家，败则身陨）
            GAME.UI.log("你将尾随者诱入荒野，反身斗法——不是你死，便是他亡！", "danger");
            GAME.Combat.start("robber");
            return;
        } else {
            // C：弃置一半灵石破财消灾
            var lost = Math.floor(stones / 2);
            p.spiritStones -= lost;
            GAME.UI.log("你丢下一半灵石（" + lost + " 枚）作买路钱，尾随者拾财而去。", "warning");
        }
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },
};
