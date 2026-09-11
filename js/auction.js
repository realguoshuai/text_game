/* =========================================================
 * js/auction.js —— 拍卖会（结丹期解锁）
 *
 * 结丹修士方能入内：每场拍品由 GAME.DATA.CONTENT.AUCTION.lots 生成，
 * 以「应价 / 一口价」两种方式竞得。
 *   · 应价：落槌价 = 起拍价；半数概率招来匿名修士抬价（加价约起拍一成），营造拍卖氛围。
 *   · 一口价：直接以 buyout 落槌截胡。
 * 解锁判定统一走 GAME.DATA.isJiedan(p)（realmIndex >= JIEDAN_GATE_INDEX=22）。
 * 注：当前 REALMS 仅到筑基九层，结丹尚未实现；本模块逻辑完备，待结丹境界接入即自动可玩。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Auction = {

    cfg: function () { return (GAME.DATA.CONTENT && GAME.DATA.CONTENT.AUCTION) || null; },

    /* 生成一场新拍：复制配置，附 current 当前价（起拍价） */
    refresh: function () {
        var cfg = this.cfg();
        var p = GAME.State.p();
        var lots = [];
        if (cfg && cfg.lots) {
            cfg.lots.forEach(function (l) {
                lots.push({ id: l.id, qty: l.qty, startBid: l.startBid, buyout: l.buyout, current: l.startBid });
            });
        }
        p.auctionGoods = lots;
        p.auctionNextRefresh = p.totalMonths + (cfg ? cfg.refreshMonths : 4);
        return lots;
    },

    /* 进入拍卖会时确保有拍品：首开或跨过刷新周期则换新场 */
    ensureAuction: function () {
        var p = GAME.State.p();
        var cfg = this.cfg();
        if (!cfg) return;
        if (p.auctionGoods == null || p.totalMonths >= (p.auctionNextRefresh || 0)) {
            this.refresh();
        }
    },

    /* 解锁/死亡校验：返回 "dead" / "realm" 表示被锁，null 表示可竞拍 */
    _locked: function () {
        var p = GAME.State.p();
        if (p.isDead) return "dead";
        if (!GAME.DATA.isJiedan(p)) return "realm";
        return null;
    },

    /* 应价：落槌价 = 起拍价，半数概率遭匿名修士抬价（加价约起拍一成） */
    bid: function (index) {
        var p = GAME.State.p();
        if (this._locked()) return;
        var lot = (p.auctionGoods || [])[index];
        if (!lot) return;
        var price = lot.startBid;
        if (Math.random() < 0.5) price += Math.max(1, Math.round(lot.startBid * 0.1));
        if (p.spiritStones < price) {
            GAME.UI.log("灵石不足，拍卖师摇头：「这位道友，请先备足灵石。」", "system");
            GAME.UI.updateUI();
            return;
        }
        p.spiritStones -= price;
        GAME.State.addItem(lot.id, lot.qty);
        p.auctionGoods.splice(index, 1);
        GAME.UI.log("落槌！你以 " + price + " 灵石拍得【" + GAME.DATA.ITEMS[lot.id].name + "】×" + lot.qty + "。", "loot");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    /* 一口价：直接以 buyout 落槌截胡 */
    buyout: function (index) {
        var p = GAME.State.p();
        if (this._locked()) return;
        var lot = (p.auctionGoods || [])[index];
        if (!lot) return;
        if (p.spiritStones < lot.buyout) {
            GAME.UI.log("灵石不足，一口价也接不住。", "system");
            GAME.UI.updateUI();
            return;
        }
        p.spiritStones -= lot.buyout;
        GAME.State.addItem(lot.id, lot.qty);
        p.auctionGoods.splice(index, 1);
        GAME.UI.log("你甩出 " + lot.buyout + " 灵石一口价截胡【" + GAME.DATA.ITEMS[lot.id].name + "】×" + lot.qty + "！", "loot");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },
};
