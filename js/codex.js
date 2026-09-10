/* =========================================================
 * js/codex.js —— 图鉴·见闻录（收集反馈）
 * 四类：器物（首次入袋即录）/ 妖兽（首次遭遇即录）/ 术法（首次研习即录）/ 秘闻（剧情节点解锁）。
 * 录入点：State.addItem → unlockItem；Combat.start → unlockMonster；Core.takePill 研习 → unlockSpell。
 * 秘闻首次解锁另给小额灵石，作为"见闻"的即时回报。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Codex = {

    KINDS: [
        { id: "items",    name: "器物" },
        { id: "monsters", name: "妖兽" },
        { id: "spells",   name: "术法" },
        { id: "lore",     name: "秘闻" },
    ],

    // 确保存档有 codex 结构（兼容旧档）
    ensure: function () {
        var p = GAME.State.p();
        if (!p.codex) p.codex = { items: {}, monsters: {}, spells: {}, lore: {} };
        var c = p.codex;
        if (!c.items) c.items = {};
        if (!c.monsters) c.monsters = {};
        if (!c.spells) c.spells = {};
        if (!c.lore) c.lore = {};
        return c;
    },

    unlockItem: function (id) {
        if (!id) return;
        var it = GAME.DATA.ITEMS[id];
        if (!it || it.type === "currency") return;   // 灵石不录入
        var c = this.ensure();
        if (c.items[id]) return;
        c.items[id] = true;
        GAME.UI.log("【图鉴·器物】录入：" + it.name + "。", "info");
    },

    unlockMonster: function (id) {
        if (!id) return;
        var name = this._monName(id);
        if (!name) return;
        var c = this.ensure();
        if (c.monsters[id]) return;
        c.monsters[id] = true;
        GAME.UI.log("【图鉴·妖兽】录入：" + name + "。", "info");
    },

    unlockSpell: function (id) {
        if (!id) return;
        var sp = GAME.DATA.SPELLS[id];
        if (!sp) return;
        var c = this.ensure();
        if (c.spells[id]) return;
        c.spells[id] = true;
        GAME.UI.log("【图鉴·术法】录入：" + sp.name + "。", "info");
    },

    // 秘闻：剧情节点调用，首次解锁给小额灵石
    unlockLore: function (id) {
        if (!id) return;
        var l = null, ls = GAME.DATA.CONTENT.LORE || [];
        for (var i = 0; i < ls.length; i++) if (ls[i].id === id) l = ls[i];
        if (!l) return;
        var c = this.ensure();
        if (c.lore[id]) return;
        c.lore[id] = true;
        var p = GAME.State.p();
        p.spiritStones += 30;
        GAME.UI.log("【图鉴·秘闻】录入：" + l.name + "——" + l.text, "success");
        GAME.UI.log("（见闻有得，灵石 +30）", "loot");
    },

    // 某分类总数 / 已录数
    total: function (kind) {
        if (kind === "items") {
            var n = 0, id;
            for (id in GAME.DATA.ITEMS) if (GAME.DATA.ITEMS[id].type !== "currency") n++;
            return n;
        }
        if (kind === "monsters") return (GAME.DATA.MONSTERS || []).length;
        if (kind === "spells") return Object.keys(GAME.DATA.SPELLS || {}).length;
        if (kind === "lore") return (GAME.DATA.CONTENT.LORE || []).length;
        return 0;
    },
    got: function (kind) {
        var c = this.ensure();
        return Object.keys(c[kind] || {}).length;
    },

    // ---------- 列表数据：已录显示详情，未录返回 {unknown:true} ----------
    list: function (kind) {
        var c = this.ensure();
        var out = [], i;
        if (kind === "items") {
            for (var id in GAME.DATA.ITEMS) {
                var it = GAME.DATA.ITEMS[id];
                if (it.type === "currency") continue;
                out.push(c.items[id]
                    ? { name: it.name, desc: it.desc, tag: it.quality }
                    : { unknown: true });
            }
        } else if (kind === "monsters") {
            var ms = GAME.DATA.MONSTERS || [];
            for (i = 0; i < ms.length; i++) {
                out.push(c.monsters[ms[i].id]
                    ? { name: ms[i].name, desc: ms[i].desc || ("气血 " + ms[i].hp + "　攻 " + ms[i].atk), tag: "妖兽" }
                    : { unknown: true });
            }
        } else if (kind === "spells") {
            var sp = GAME.DATA.SPELLS || {};
            for (var sid in sp) {
                out.push(c.spells[sid]
                    ? { name: sp[sid].name, desc: sp[sid].desc, tag: sp[sid].school }
                    : { unknown: true });
            }
        } else if (kind === "lore") {
            var ls = GAME.DATA.CONTENT.LORE || [];
            for (i = 0; i < ls.length; i++) {
                out.push(c.lore[ls[i].id]
                    ? { name: ls[i].name, desc: ls[i].text, tag: "秘闻" }
                    : { unknown: true });
            }
        }
        return out;
    },

    _monName: function (id) {
        var ms = GAME.DATA.MONSTERS || [], i;
        for (i = 0; i < ms.length; i++) if (ms[i].id === id) return ms[i].name;
        return null;
    },
};
