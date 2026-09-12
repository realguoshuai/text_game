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
        GAME.UI.updateUI();
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

    // ---------- 是否可出售 ----------
    canSell: function (id) {
        var item = GAME.DATA.ITEMS[id];
        return !!item && item.type !== "currency";
    },
};
