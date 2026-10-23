/* =========================================================
 * js/market.js —— 坊市（跑商）
 * 赶路耗时、定期换货、买卖；
 * 善恶值影响物价：恶名昭彰者被坐地起价，乐善好施者有折扣
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Market = {

    // ---------- 各地至坊市的路程耗时（按距离差异化） ----------
    travelTime: function () {
        var p = GAME.State.p();
        var m = GAME.DATA.MARKET.travelMonthsByLoc || {};
        return m[p.location] || GAME.DATA.MARKET.travelMonths;
    },

    // ---------- 当前所在地的货源池（不同地方卖的东西不一样） ----------
    pool: function () {
        var p = GAME.State.p();
        var cfg = GAME.DATA.MARKET;
        return (cfg.pools && cfg.pools[p.location]) || cfg.pool;
    },

    // ---------- 前往/离开坊市 ----------
    toggle: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat || p.pendingEvent || p.pendingMercy) return;
        if (!p.atMarket) {
            p.atMarket = true;
            if (!p.marketGoods || !p.marketGoods.length) this.refreshGoods();
            GAME.UI.log("你动身前往坊市，山路迢迢，往返耗时 " + this.travelTime() + " 个月。", "system");
            GAME.Core.passTime(this.travelTime());
        } else {
            p.atMarket = false;
            GAME.UI.log("你离开坊市，返回住处。", "system");
            // 怀璧其罪：觊觎度 ≥80 时，离市即被结丹修士神识锁定
            if (GAME.Bottle) GAME.Bottle.onLeaveMarket();
        }
        // 动身抵达坊市：左栏自动切到「游历 → 市集」货架；离市则原地刷新
        // （无头测试桩可能不提供 switchTab，退回 updateUI）
        if (p.atMarket && !p.combat && GAME.UI.switchTab) GAME.UI.switchTab("market");
        else GAME.UI.updateUI();
    },

    // ---------- 换货：按所在地货源池权重抽取，价格 ±20% 浮动 ----------
    refreshGoods: function () {
        var cfg = GAME.DATA.MARKET;
        var src = this.pool();
        var goods = [];
        for (var i = 0; i < cfg.stockCount; i++) {
            var total = 0, j;
            for (j = 0; j < src.length; j++) total += src[j].weight;
            var roll = Math.random() * total, picked = src[0];
            for (j = 0; j < src.length; j++) {
                if (roll < src[j].weight) { picked = src[j]; break; }
                roll -= src[j].weight;
            }
            var price = Math.round(GAME.DATA.ITEMS[picked.id].price * (0.8 + Math.random() * 0.4));
            var exist = null;
            for (j = 0; j < goods.length; j++) if (goods[j].id === picked.id) exist = goods[j];
            if (exist) { exist.qty += 1; exist.price = Math.min(exist.price, price); }
            else goods.push({ id: picked.id, qty: 1, price: price, req: picked.req || 0, infinite: !!picked.infinite });
        }
        // 铁匠铺常驻货源：无限量条目每次换货必然在架（如玄铁矿石）
        for (var k = 0; k < src.length; k++) {
            if (!src[k].infinite) continue;
            var has = false;
            for (var n = 0; n < goods.length; n++) if (goods[n].id === src[k].id) { has = true; goods[n].infinite = true; }
            if (!has) {
                goods.push({
                    id: src[k].id, qty: 99, infinite: true, req: src[k].req || 0,
                    price: GAME.DATA.ITEMS[src[k].id].price,
                });
            }
        }
        GAME.State.p().marketGoods = goods;
        return goods;
    },

    // ---------- 善恶值对物价的影响系数 ----------
    // 善 +100：0.85 折；恶 -100：1.25 倍（坐地起价）
    priceFactor: function () {
        var karma = GAME.State.p().karma;
        return 1 - (karma / 100) * 0.15;
    },

    buyPrice: function (basePrice) {
        return Math.max(1, Math.round(basePrice * this.priceFactor()));
    },

    sellPrice: function (basePrice) {
        // 防御：未定价物品按 1 灵石兜底，杜绝 NaN 入账
        var base = (typeof basePrice === "number" && isFinite(basePrice)) ? basePrice : 0;
        return Math.max(1, Math.round(base * GAME.DATA.MARKET.sellRatio));
    },

    // ---------- 购买 ----------
    buy: function (index) {
        var p = GAME.State.p();
        if (!p.atMarket || p.isDead) return;
        var g = p.marketGoods[index];
        if (!g || g.qty <= 0) return;
        // 同物防重：600ms 内重复点同一商品，视作手抖连点，直接吞掉，杜绝重复扣款
        var _now = Date.now();
        if (this._lastBuyId === g.id && this._lastBuyTs && (_now - this._lastBuyTs) < 600) return;
        if (g.req && p.realmIndex < g.req) {
            GAME.UI.log("掌柜摆摆手：「这等好货，不卖给练气" + (g.req + 1) + "层以下的散修。」——修为不足，人家怕你兜不住。", "system");
            GAME.UI.updateUI();
            return;
        }
        var price = this.buyPrice(g.price);
        if (p.spiritStones < price) {
            GAME.UI.log("灵石不足，掌柜冷笑一声收回了货品。", "system");
            GAME.UI.updateUI();
            return;
        }
        p.spiritStones -= price;
        // 无限量货源（铁匠铺玄铁等）购买后不断货
        if (!g.infinite) {
            g.qty -= 1;
            if (g.qty <= 0) p.marketGoods.splice(index, 1);
        }
        GAME.State.addItem(g.id, 1);
        this._lastBuyId = g.id;
        this._lastBuyTs = Date.now();
        this._flash = { id: g.id, ts: Date.now() };   // 给市集行一个短暂"已购"脉冲，避免玩家以为点空而连点
        GAME.UI.log("你购入【" + GAME.DATA.ITEMS[g.id].name + "】，花费 " + price + " 灵石。", "info");
        GAME.Core.checkAchievements();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 货币兑换商：100 枚低阶灵石 → 1 枚中阶灵石（mid_stone） ----------
    exchangeStone: function () {
        var p = GAME.State.p();
        if (p.isDead) return;
        if (p.spiritStones < 100) {
            GAME.UI.log("低阶灵石不足 100 枚，无从向兑换商换取中阶灵石。", "system");
            GAME.UI.updateUI();
            return;
        }
        p.spiritStones -= 100;
        GAME.State.addItem("mid_stone", 1);
        GAME.UI.log("你以 100 枚低阶灵石向兑换商换来【中阶灵石】×1（价值等同百枚下品灵石）。", "loot");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 出售（货币与已装备法器不可售） ----------
    sell: function (id) {
        var p = GAME.State.p();
        if (!p.atMarket || p.isDead) return;
        var item = GAME.DATA.ITEMS[id];
        if (!item || !GAME.State.countItem(id)) return;
        if (item.type === "currency") return;
        var gain = this.sellPrice(item.price);
        GAME.State.removeItem(id);
        p.spiritStones += gain;
        GAME.UI.log("你将【" + item.name + "】卖给掌柜，得 " + gain + " 灵石。", "loot");
        // 高年份药草出手，惹人觊觎（≥300 年 +25 / ≥1000 年 +60）
        if (GAME.Bottle && item.type === "herb") GAME.Bottle.onSellHerb(id);
        GAME.Core.checkAchievements();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 批量出手凡物（矿石 · 废铁等纯废料，一键结算） ----------
    // 中后期储物袋积一堆一阶废料，单点出售是体力活（用户实测反馈）。
    // 只走 GAME.DATA.JUNK_IDS 白名单——主材（金石/精魄/灵木）绝不入列，防止误卖。
    sellJunkAll: function () {
        var p = GAME.State.p();
        if (!p.atMarket || p.isDead || p.combat) return false;
        var ids = GAME.DATA.JUNK_IDS || [];
        var gain = 0, names = [];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i], qty = p.inventory[id] || 0;
            if (qty <= 0) continue;
            var item = GAME.DATA.ITEMS[id];
            if (!item) continue;
            gain += this.sellPrice(item.price) * qty;
            names.push(item.name + "×" + qty);
            delete p.inventory[id];
        }
        if (!names.length) {
            GAME.UI.log("储物袋里没有凡物可出手（矿石、废铁之流才走这条门路）。", "system");
            GAME.UI.updateUI();
            return false;
        }
        p.spiritStones += gain;
        GAME.UI.log("你摊出" + names.join("、") + "，掌柜过眼一掂，付你 " + gain + " 灵石。", "loot");
        GAME.Core.checkAchievements();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 世俗城镇：雇凡人镖局打探消息（50 两 · 1 月） ----------
    // 筑基后世俗银两再无购买力，顶栏常驻即成死数据（用户实测反馈）。
    // 凡俗城池开这个消耗口：银子换成跑路月数与情报，聊胜于无，但不白挂。
    scoutNews: function () {
        var p = GAME.State.p();
        var node = (GAME.Map && GAME.Map.cur) ? (GAME.Map.cur() || {}) : {};
        if (p.isDead || p.combat) return false;
        if (node.kind !== "mortal") {
            GAME.UI.log("凡人镖局只在外城凡俗地界设桩，这等仙家福地无桩可雇。", "system");
            GAME.UI.updateUI();
            return false;
        }
        if ((p.silver || 0) < 50) {
            GAME.UI.log("囊中盘缠不足 50 两，镖局把头懒得抬眼。", "system");
            GAME.UI.updateUI();
            return false;
        }
        p.silver -= 50;
        var tips = [];
        if (p.marketNextRefresh != null) {
            var mk = Math.max(0, p.marketNextRefresh - (p.totalMonths || 0));
            tips.push("坊市每逢一旬换货，" + (mk > 0 ? "距今约 " + mk + " 个月" : "这几日正要上新") + "，紧俏材料要赶早");
        }
        if (p.junkNextRefresh != null) {
            var jk = Math.max(0, p.junkNextRefresh - (p.totalMonths || 0));
            tips.push("旧货摊" + (jk > 0 ? "约 " + jk + " 个月后换货" : "刚换过一批生面孔") + "，未鉴定的货水深");
        }
        tips.push("后山妖兽近来躁动，单身修士切莫贪晚进山");
        tips.push("修邪法的修士常在深夜出没，专挑独行客下手，结伴为妙");
        tips.push("山下来的行商说，升仙大会三年一期，擂台三连胜有造化");
        tips.push("老镖头喝多了透露：黑市门路三月一换，手快者有，手慢者无");
        var tip = tips[Math.floor(Math.random() * tips.length)];
        GAME.UI.log("你摸出 50 两盘缠雇了趟镖局耳报。老镖头压低嗓子：「" + tip + "。」（耗 1 月）", "info");
        GAME.Core.passTime(1);
        return true;
    },

    // ---------- 是否可出售 ----------
    canSell: function (id) {
        var item = GAME.DATA.ITEMS[id];
        return !!item && item.type !== "currency";
    },
};
