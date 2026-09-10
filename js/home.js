/* =========================================================
 * js/home.js —— 洞府建设（长线养成）
 * 四类设施：灵田（种植产量）/ 丹房（炼丹折扣 + 双丹）/ 藏经阁（打坐修为）/ 护山大阵（气血上限 + 尾随概率）。
 * 等级自 0 起（0 = 未开辟），每级耗灵石 + 月数，高阶另需材料。
 * 效果由各系统主动查询：Garden 收成、Core.alchemy、Core.meditate、BlackMarket 尾随判定。
 * 护山大阵的 hpBonus 在升级瞬间直接加进 p.maxHp / p.currentHp（一次性永久）。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Home = {

    cfg: function () { return GAME.DATA.CONTENT.HOME; },

    _fac: function (fid) {
        var fs = this.cfg().facilities, i;
        for (i = 0; i < fs.length; i++) if (fs[i].id === fid) return fs[i];
        return null;
    },

    // 当前等级（0 = 未开辟）
    level: function (fid) {
        var p = GAME.State.p();
        return (p.home && p.home[fid]) || 0;
    },

    // 当前等级的效果对象（未开辟返回 {}）
    bonus: function (fid) {
        var lv = this.level(fid);
        if (lv <= 0) return {};
        var f = this._fac(fid);
        return (f && f.levels[lv - 1]) || {};
    },

    // 下一级需求（已满级返回 null）
    next: function (fid) {
        var f = this._fac(fid);
        if (!f) return null;
        var lv = this.level(fid);
        return lv >= f.levels.length ? null : f.levels[lv];
    },

    // 可否升级：可升返回 null，否则返回缺失说明
    canUpgrade: function (fid) {
        var p = GAME.State.p();
        var n = this.next(fid);
        if (!n) return "已至顶阶";
        if (p.spiritStones < n.stones) return "灵石不足（需 " + n.stones + "，现 " + p.spiritStones + "）";
        var miss = [], id;
        for (id in (n.items || {})) {
            var have = GAME.State.countItem(id);
            if (have < n.items[id]) {
                miss.push(GAME.DATA.ITEMS[id].name + "×" + n.items[id] + "（缺 " + (n.items[id] - have) + "）");
            }
        }
        return miss.length ? miss.join("、") : null;
    },

    upgrade: function (fid) {
        var p = GAME.State.p();
        var f = this._fac(fid);
        var n = this.next(fid);
        if (!f || !n) return;
        var why = this.canUpgrade(fid);
        if (why) { GAME.UI.log("洞府营建不成：" + why + "。", "system"); GAME.UI.updateUI(); return; }

        p.spiritStones -= n.stones;
        var id;
        for (id in (n.items || {})) GAME.State.removeItem(id, n.items[id]);
        p.home = p.home || {};
        p.home[fid] = (p.home[fid] || 0) + 1;
        if (n.hpBonus) { p.maxHp += n.hpBonus; p.currentHp += n.hpBonus; }

        GAME.UI.log("【洞府】" + f.name + "营建至第 " + p.home[fid] + " 阶——" + n.effect +
            "。（耗灵石 " + n.stones + "，历时 " + n.months + " 月）", "success");
        if (GAME.Codex) GAME.Codex.unlockLore("lore_dongfu");   // 图鉴·秘闻
        GAME.Core.passTime(n.months);
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 供各系统查询的加成 ----------
    yieldBonus:       function () { return this.bonus("lingtian").yieldBonus || 0; },
    alchemyDiscount:  function () { return this.bonus("danfang").alchemyDiscount || 0; },
    doublePillChance: function () { return this.bonus("danfang").doublePill || 0; },
    meditateExp:      function () { return this.bonus("cangjing").meditateExp || 0; },
    tailReduce:       function () { return this.bonus("hufa").tailReduce || 0; },
};
