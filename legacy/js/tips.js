/* =========================================================
 * js/tips.js —— 把"数字"翻译成"人话"
 *   ① 选项提示：从事件的 outcomes 自动推导风险/收益，让玩家敢选
 *      （不改任何事件数据，新增事件自动生效）
 *   ② 装备体感：换装时不只报攻防差，而是说"你因此少挨几下"
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Tips = {

    // ---------- ① 事件选项提示 ----------
    // 入参：choice = { text, outcomes:[ {chance, type, ...} ] }
    // 出参：如"六成有得 · 三成凶险，最坏 -50 气血"
    choiceTip: function (choice) {
        if (!choice || !choice.outcomes || !choice.outcomes.length) return "";
        var gain = 0, risk = 0, worstHp = 0, worstAge = 0, monster = "", hasLoot = false, stonesTxt = "";

        choice.outcomes.forEach(function (o) {
            var c = (o.chance == null ? 1 : o.chance);
            switch (o.type) {
                case "combat":
                    risk += c;
                    monster = monster || this._monsterName(o.monster);
                    break;
                case "damage":
                    risk += c;
                    if (o.hp) worstHp = Math.max(worstHp, o.hp[1] || o.hp[0] || 0);
                    if (o.age) worstAge = Math.max(worstAge, o.age[1] || o.age[0] || 0);
                    break;
                case "loot": gain += c; hasLoot = true; break;
                case "stones":
                    if ((o.value != null && o.value > 0) || (o.min != null && o.min > 0)) {
                        gain += c;
                        stonesTxt = this._stonesRange(o);
                    } else { risk += c; stonesTxt = this._stonesRange(o); }
                    break;
                case "exp": gain += c; break;
                default: break;
            }
        }, this);

        var parts = [];
        var g = Math.round(gain * 10), r = Math.round(risk * 10);
        if (r > 0 && g > 0) parts.push(g + " 成有得 · " + r + " 成凶险");
        else if (r > 0) parts.push(r + " 成凶险");
        else if (g > 0) parts.push(g + " 成有得");
        else parts.push("无惊无险");

        if (monster) parts.push("对手：" + monster);
        if (worstHp > 0) parts.push("最坏 -" + worstHp + " 气血");
        if (worstAge > 0) parts.push("或折寿 " + worstAge + " 年");
        if (hasLoot) parts.push("或有收获");
        if (stonesTxt) parts.push("灵石 " + stonesTxt);

        return parts.length ? "（" + parts.join("；") + "）" : "";
    },

    _monsterName: function (id) {
        if (!id) return "";
        var list = (GAME.DATA && GAME.DATA.MONSTERS) || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
        return id;
    },

    _stonesRange: function (o) {
        if (o.value != null) return (o.value > 0 ? "+" : "") + o.value;
        if (o.min != null && o.max != null) return "+" + o.min + "~" + o.max;
        if (o.min != null) return "±" + o.min;
        return "";
    },

    // ---------- ② 装备体感 ----------
    // before/after: { atk, def, speed, spirit }（GAME.State.getStats() 的口径）
    gearFeel: function (before, after) {
        if (!before || !after) return "";
        var d = {
            atk: (after.atk || 0) - (before.atk || 0),
            def: (after.def || 0) - (before.def || 0),
            speed: (after.speed || 0) - (before.speed || 0),
            spirit: (after.spirit || 0) - (before.spirit || 0)
        };
        var out = [];
        if (d.atk) out.push("出手多伤约 " + Math.abs(d.atk) + " 点" + (d.atk < 0 ? "（变弱）" : ""));
        if (d.def) out.push("挨打少受约 " + Math.abs(d.def) + " 点" + (d.def < 0 ? "（变脆）" : ""));
        if (d.speed) out.push(d.speed > 0 ? "更可能抢先出手" : "出手变慢");
        if (d.spirit) out.push("神识 " + (d.spirit > 0 ? "+" : "") + d.spirit);
        if (!out.length) return "（属性无变化）";
        // 一句人话收尾
        var better = (d.atk + d.def + d.speed) > 0;
        return "（" + out.join("、") + "——" + (better ? "这一换，值" : "似乎并不划算") + "）";
    },

    // 数值差的极简描述（用于面板上的 +2/-1 之类）
    diff: function (a, b) {
        var d = b - a;
        return d > 0 ? ("+" + d) : (d < 0 ? String(d) : "±0");
    }
};
