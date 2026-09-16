/* =========================================================
 * js/puppet.js —— 筑基篇：大衍决（前四层）· 机关傀儡军团
 *
 * 【大衍决（前四层）】诡异秘术，神识暴涨：研习逐层永久提升神识上限 SP
 *   （筑基一层基础 SP=15，四层学满累计 +85 → 神识上限 100），并解锁傀儡操控。
 * 【机关傀儡工坊】消耗材料炼制弓箭/巨狼/巨猿傀儡；斗法前激活参战，
 *   每回合提供高频连环齐射（PUPPET_VOLLEY_PER/具）。
 * 【神识承载检定】每具傀儡占用固定 SP（10~20），激活时总占用不可超当前神识上限，
 *   超出则拦截（傀儡失控，无法列阵）。
 * 本文件在数据层之后加载，扩充 GAME.DATA.*，不动原数据文件。
 * （噬金虫群已拆至 js/insect.js）
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.DATA = GAME.DATA || {};
GAME.DATA.ITEMS = GAME.DATA.ITEMS || {};
GAME.DATA.SPELLS = GAME.DATA.SPELLS || {};

/* —— 傀儡材料已统一迁入 data/items.js 的正式 ID（beast_soul / spirit_wood / iron_ore / tianhuo_crystal）——
 * 下列三个旧 ID 仅为兼容早期存档中残留的物品，不再作为任何配方材料。 */
GAME.DATA.ITEMS.jingpo        = { id: "jingpo",  name: "精魄（旧）",   type: "material", quality: "灵品", price: 30, desc: "旧版遗留材料，可售出换取灵石。" };
GAME.DATA.ITEMS.tianhuo       = { id: "tianhuo", name: "天火矿（旧）", type: "material", quality: "灵品", price: 60, desc: "旧版遗留材料，可售出换取灵石。" };
GAME.DATA.ITEMS.lingmu        = { id: "lingmu",  name: "灵木（旧）",   type: "material", quality: "灵品", price: 20, desc: "旧版遗留材料，可售出换取灵石。" };
GAME.DATA.ITEMS.puppet_gongjian = { name: "弓箭傀儡", type: "puppet", quality: "上品", atk: 8,  price: 500, desc: "四级机关弓臂，连珠箭雨。" };
GAME.DATA.ITEMS.puppet_julang   = { name: "巨狼傀儡", type: "puppet", quality: "极品", atk: 14, price: 900, desc: "四级天火淬骨钢牙巨狼。" };
GAME.DATA.ITEMS.puppet_juyuan   = { name: "巨猿傀儡", type: "puppet", quality: "极品", atk: 18, price: 2400, desc: "五级巨猿傀儡，铁臂横扫如山压。" };

/* —— 大衍决：筑基神识暴涨功法（术法目录登记，供图志/技能页读取） —— */
GAME.DATA.SPELLS.dayan_jue = {
    name: "大衍决（前四层）",
    desc: "上古诡异秘术。习成前四层，神识层层暴涨（15 → 100），更可神识驭傀、以一控众。",
    cd: 0, dmg: 0, passive: true,
};

/* —— 傀儡配置：atk 齐射单发权重基数；spiritCost 操控神识占用（10~20） —— */
GAME.DATA.PUPPETS = {
    gongjian: {
        id: "puppet_gongjian", name: "弓箭傀儡", atk: 8, spiritCost: 10,
        materials: [
            { id: "beast_soul",  qty: 2, from: "狩猎二阶妖兽（神识≥25 必得）/ 宗门功勋 30 点兑换 / 黑市轮换" },
            { id: "spirit_wood", qty: 1, from: "玄傀后山伐木（2 月）/ 承露瓶催熟灵木 / 筑基月俸" },
        ],
    },
    julang: {
        id: "puppet_julang", name: "巨狼傀儡", atk: 14, spiritCost: 15,
        materials: [
            { id: "spirit_wood", qty: 5, from: "玄傀后山伐木（2 月）/ 承露瓶催熟灵木 / 宗门功勋 20 点兑换" },
            { id: "iron_ore",    qty: 3, from: "玄傀下矿开采（1 月产 2）/ 坊市铁匠铺无限量（15 灵石/块）" },
        ],
    },
    juyuan: {
        id: "puppet_juyuan", name: "巨猿傀儡", atk: 18, spiritCost: 20,
        materials: [
            { id: "spirit_wood",      qty: 12, from: "玄傀后山伐木 / 承露瓶催熟灵木（1 滴绿液 → 3 根）" },
            { id: "tianhuo_crystal",  qty: 2,  from: "斩魔焰门筑基修士 / 地下黑市每 3 月轮换上架" },
        ],
    },
};

GAME.Puppet = {

    PUPPET_VOLLEY_PER: 8,   // 每具傀儡每回合齐射基础伤害

    // 当前神识上限（SP）：当前境界基础 sp + 大衍决永久加成（spiritBonus）
    maxSpirit: function () {
        return GAME.DATA.foundationMaxSpirit(GAME.State.p());
    },

    // ---------- 习得《大衍决》前四层（逐层永久提升神识上限 SP） ----------
    learnDayan: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        var steps = (GAME.DATA.FOUNDATION && GAME.DATA.FOUNDATION.DAYAN_SP_STEP) || [25, 22, 20, 18];
        var maxLayer = (GAME.DATA.FOUNDATION && GAME.DATA.FOUNDATION.DAYAN_MAX_LAYER) || 4;
        p.dayanLevel = p.dayanLevel || 0;
        if (p.dayanLevel >= maxLayer) {
            GAME.UI.log("《大衍决》前四层你早已烂熟于胸，神识之盛几近实质。", "system");
            return;
        }
        if (p.realmIndex <= GAME.DATA.ZHUJI_GATE_INDEX) {
            GAME.UI.log("此术玄奥远胜练气功法——待你筑基有成，方有神识根基修习。", "system");
            return;
        }
        var gain = steps[p.dayanLevel];
        p.spells = p.spells || {};
        p.spells.dayan_jue = true;
        p.spiritBonus = (p.spiritBonus || 0) + gain;
        p.dayanLevel += 1;
        GAME.UI.log("你依诀运转《大衍决》第 " + p.dayanLevel + " 层，泥丸宫轰然一震——神识暴涨 " + gain +
            "（现上限 " + this.maxSpirit() + "）！自此可一心多用、驭傀为军。", "success");
        if (GAME.Codex) GAME.Codex.unlockLore("lore_dayan");
    },

    // ---------- 机关傀儡工坊：制造 ----------
    build: function (type) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        var def = GAME.DATA.PUPPETS[type];
        if (!def) return;
        var mats = def.materials || [];
        var i, m, lack = [];
        for (i = 0; i < mats.length; i++) {
            m = mats[i];
            var have = GAME.State.countItem(m.id);
            if (have < m.qty) {
                lack.push("【" + GAME.DATA.ITEMS[m.id].name + "】缺 " + (m.qty - have) +
                    "（" + have + "/" + m.qty + "）← 来源：" + m.from);
            }
        }
        if (lack.length) {
            GAME.UI.log("炼制【" + def.name + "】材料不齐——" + lack.join("；") + "。", "system");
            GAME.UI.updateUI();
            return;
        }
        // 逐项精确扣除：只扣配方所需数量，余料一概不动
        for (i = 0; i < mats.length; i++) GAME.State.removeItem(mats[i].id, mats[i].qty);
        GAME.State.addItem(def.id, 1);
        GAME.UI.log("机关傀儡工坊火光四溅——一具【" + def.name + "】铮然立起，关节咔咔自检！（耗 " +
            this.costText(def) + "）", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 配方文本 & 库存文本（供 UI 动态展示"精魄: 1/2 | 灵木: 3/1"） ----------
    costText: function (def) {
        return (def.materials || []).map(function (m) {
            return GAME.DATA.ITEMS[m.id].name + "×" + m.qty;
        }).join(" + ");
    },

    stockText: function (def) {
        return (def.materials || []).map(function (m) {
            return GAME.DATA.ITEMS[m.id].name + ": " + GAME.State.countItem(m.id) + "/" + m.qty;
        }).join(" | ");
    },

    canBuild: function (def) {
        var mats = def.materials || [];
        for (var i = 0; i < mats.length; i++) {
            if (GAME.State.countItem(mats[i].id) < mats[i].qty) return false;
        }
        return true;
    },

    // ---------- 斗法前激活：神识操控 N 具傀儡参战（按类型） ----------
    // 神识承载检定：所选傀儡总 spiritCost 不得超当前神识上限；超出则拦截（傀儡失控）。
    activate: function (count, type) {
        var p = GAME.State.p();
        var def = GAME.DATA.PUPPETS[type] || GAME.DATA.PUPPETS.gongjian;
        var owned = GAME.State.countItem(def.id);
        if (owned < 1) { GAME.UI.log("工坊空空——你尚无一具" + def.name + "可供操控。", "system"); return; }
        var n = Math.min(count || 1, owned);
        var cost = n * def.spiritCost;
        var cap = this.maxSpirit();
        if (cost > cap) {
            // 神识承载不足：尽量放下便宜的（这里统一按单类，截断到可承载上限）
            var affordable = Math.floor(cap / def.spiritCost);
            if (affordable <= 0) {
                p.puppetsActive = 0;
                p.puppetsSp = 0;
                GAME.UI.log("神识上限仅 " + cap + "，操控一具" + def.name + "便需 " + def.spiritCost +
                    "——神识不足以驭傀，列阵被拦截！", "danger");
                GAME.UI.updateUI();
                return;
            }
            n = affordable;
            cost = n * def.spiritCost;
            GAME.UI.log("神识上限 " + cap + " 仅可驭 " + n + " 具" + def.name + "（" + cost + " SP），余者暂收。", "warning");
        }
        p.puppetsActive = n;
        p.puppetsSp = cost;
        GAME.UI.log("神识铺开如水银泻地——" + n + " 具【" + def.name + "】应念列阵（占用 " + cost + "/" + cap + " SP），随时听令齐射！", "info");
        GAME.UI.updateUI();
    },
};
