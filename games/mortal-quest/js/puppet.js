/* =========================================================
 * js/puppet.js —— 筑基篇：大衍决（前四层）· 机关傀儡军团
 *
 * 【大衍决（前四层）】诡异秘术，神识暴涨：研习逐层永久提升神识上限 SP
 *   （筑基初期基础 SP=15，四层学满累计 +85 → 神识上限 100），并解锁傀儡操控。
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
GAME.DATA.ITEMS.puppet_zhenji   = { name: "战阵傀儡", type: "puppet", quality: "极品", atk: 22, price: 3600, desc: "结丹档战阵傀儡，甲胄齐整，一列便是十支箭。" };
GAME.DATA.ITEMS.puppet_heji     = { name: "合击傀儡", type: "puppet", quality: "仙品", atk: 30, price: 6800, desc: "结丹档合击傀儡，两具成阵时可互为表里，神识耗得凶，威力也最猛。" };

/* —— 大衍决：筑基神识暴涨功法（术法目录登记，供图志/技能页读取） —— */
GAME.DATA.SPELLS.dayan_jue = {
    name: "大衍决（前四层）",
    desc: "上古诡异秘术。习成前四层，神识层层暴涨（15 → 100），更可神识驭傀、以一控众。",
    cd: 0, dmg: 0, passive: true,
};

/* —— 傀儡配置：atk 齐射单发权重基数；spiritCost 操控神识占用（10~20） —— */
GAME.DATA.PUPPETS = {
    gongjian: {
        id: "puppet_gongjian", name: "弓箭傀儡", atk: 8, spiritCost: 10, volley: 8,
        materials: [
            { id: "beast_soul",  qty: 2, from: "狩猎二阶妖兽（神识≥25 必得）/ 宗门功勋 30 点兑换 / 黑市轮换" },
            { id: "spirit_wood", qty: 1, from: "玄傀后山伐木（2 月）/ 承露瓶催熟灵木 / 筑基月俸" },
        ],
    },
    julang: {
        id: "puppet_julang", name: "巨狼傀儡", atk: 14, spiritCost: 15, volley: 8,
        materials: [
            { id: "spirit_wood", qty: 5, from: "玄傀后山伐木（2 月）/ 承露瓶催熟灵木 / 宗门功勋 20 点兑换" },
            { id: "iron_ore",    qty: 3, from: "玄傀下矿开采（1 月产 2）/ 坊市铁匠铺无限量（15 灵石/块）" },
        ],
    },
    juyuan: {
        id: "puppet_juyuan", name: "巨猿傀儡", atk: 18, spiritCost: 20, volley: 8,
        materials: [
            { id: "spirit_wood",      qty: 12, from: "玄傀后山伐木 / 承露瓶催熟灵木（1 滴绿液 → 3 根）" },
            { id: "tianhuo_crystal",  qty: 2,  from: "斩魔焰门筑基修士 / 地下黑市每 3 月轮换上架" },
        ],
    },
    /* —— 结丹档：傀儡大军（混编时单具输出更高、占用神识也更重） —— */
    zhenji: {
        id: "puppet_zhenji", name: "战阵傀儡", atk: 22, spiritCost: 25, volley: 16,
        materials: [
            { id: "spirit_wood",      qty: 8,  from: "玄傀后山伐木 / 承露瓶催熟灵木" },
            { id: "tianhuo_crystal",  qty: 3,  from: "斩魔焰门修士 / 地下黑市每 3 月轮换上架" },
            { id: "jinshi",           qty: 2,  from: "结丹档妖兽掉落 / 坊市限量" },
        ],
    },
    heji: {
        id: "puppet_heji", name: "合击傀儡", atk: 30, spiritCost: 35, volley: 22,
        materials: [
            { id: "tianhuo_crystal",  qty: 5,  from: "斩魔焰门修士 / 地下黑市每 3 月轮换上架" },
            { id: "jinshi",           qty: 4,  from: "结丹档妖兽掉落 / 坊市限量" },
            { id: "beast_soul",       qty: 6,  from: "狩猎二阶妖兽（神识≥25 必得）" },
        ],
    },
};

GAME.Puppet = {

    PUPPET_VOLLEY_PER: 8,   // 每具傀儡每回合齐射基础伤害（旧式傀儡未指定 volley 时取此值）
    MAX_CONTROL: 24,        // 一次最多列阵的傀儡「总数」（安全上限；真正瓶颈仍是神识承载）

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

    // ---------- 当前编制（混编军团） ----------
    // 老存档无 puppetArmy 时，用旧的 puppetsActive 折算成单一类型，行为不回退。
    army: function () {
        var p = GAME.State.p();
        if (p.puppetArmy && p.puppetArmy.length) return p.puppetArmy;
        if (p.puppetsActive > 0) return [{ type: "gongjian", count: p.puppetsActive }];
        return [];
    },

    // 单具每回合齐射伤害（未指定 volley 的旧式傀儡取 PUPPET_VOLLEY_PER）
    volleyOf: function (def) {
        if (!def) return 0;
        return (def.volley != null) ? def.volley : this.PUPPET_VOLLEY_PER;
    },

    // 编制总占用神识
    armyCost: function (list) {
        list = list || this.army();
        var total = 0;
        for (var i = 0; i < list.length; i++) {
            var def = GAME.DATA.PUPPETS[list[i].type];
            if (def) total += (list[i].count || 0) * def.spiritCost;
        }
        return total;
    },

    /* 编制齐射总伤害：Σ 每型「数量 × 单具 volley」。纯函数，便于结算与测试共读一份。 */
    armyVolleyOf: function (list) {
        var total = 0, count = 0;
        for (var i = 0; i < (list || []).length; i++) {
            var def = GAME.DATA.PUPPETS[list[i].type];
            if (!def) continue;
            var n = list[i].count || 0;
            if (n <= 0) continue;
            count += n;
            total += n * this.volleyOf(def);
        }
        return { damage: total, count: count };
    },

    armyVolley: function () { return this.armyVolleyOf(this.army()); },

    /* ---------- 斗法前激活：神识操控傀儡列阵 ----------
     * list 可以是：
     *   · 数组 [{type,count}, ...] —— 混编编制（傀儡大军）
     *   · 数字 count —— 旧接口，等价于单一类型 type 的 count 具
     * 神识承载检定：总 spiritCost 不得超当前神识上限；超出则从最贵的一档开始舍弃。 */
    activate: function (list, type) {
        var p = GAME.State.p();
        var comp = [];
        if (typeof list === "number") {
            comp = [{ type: type || "gongjian", count: list }];
        } else if (list && list.length) {
            comp = list.slice();
        }

        // 逐型裁剪：拥有的数量为上限
        var i, kept = [], total = 0;
        for (i = 0; i < comp.length; i++) {
            var def = GAME.DATA.PUPPETS[comp[i].type];
            if (!def) continue;
            var own = GAME.State.countItem(def.id);
            var n = Math.min(comp[i].count || 0, own);
            if (n <= 0) continue;
            kept.push({ type: comp[i].type, count: n, idx: i });
            total += n * def.spiritCost;
        }
        if (!kept.length) {
            p.puppetsActive = 0; p.puppetsSp = 0; p.puppetArmy = [];
            GAME.UI.log("工坊空空——你尚无一具傀儡可供列阵。", "system");
            GAME.UI.updateUI();
            return;
        }

        // 双重约束：神识承载（SP） + 列阵总数上限。超了就从最便宜的一档开始舍弃
        // （保住强力型号，输出不掉太多）。总数上限只是安全网，真正瓶颈仍是神识。
        var cap = this.maxSpirit();
        var maxTotal = this.MAX_CONTROL;
        var totalCount = 0;
        for (i = 0; i < kept.length; i++) totalCount += kept[i].count;
        if (total > cap || totalCount > maxTotal) {
            kept.sort(function (a, b) {
                return (GAME.DATA.PUPPETS[b.type].spiritCost) - (GAME.DATA.PUPPETS[a.type].spiritCost);
            });
            while (kept.length && (total > cap || totalCount > maxTotal)) {
                var last = kept[kept.length - 1];
                var ldef = GAME.DATA.PUPPETS[last.type];
                if (last.count > 1) { last.count--; total -= ldef.spiritCost; totalCount--; }
                else { total -= ldef.spiritCost; totalCount--; kept.pop(); }
            }
            if (total > cap || !kept.length) {
                p.puppetsActive = 0; p.puppetsSp = 0; p.puppetArmy = [];
                GAME.UI.log("神识上限仅 " + cap + "——连一具傀儡都驭不动，列阵被拦截！", "danger");
                GAME.UI.updateUI();
                return;
            }
            GAME.UI.log("神识上限 " + cap + "（" + maxTotal + " 具封顶），仅可列 " + total + " SP / " +
                totalCount + " 具，余者暂收。", "warning");
        }

        // 恢复原顺序（玩家自定的编制次序即优先级）
        kept.sort(function (a, b) { return a.idx - b.idx; });
        var out = [], count = 0;
        for (i = 0; i < kept.length; i++) {
            out.push({ type: kept[i].type, count: kept[i].count });
            count += kept[i].count;
        }
        p.puppetArmy = out;
        p.puppetsActive = count;
        p.puppetsSp = total;

        var parts = [];
        for (i = 0; i < out.length; i++) {
            parts.push(out[i].count + " 具" + GAME.DATA.PUPPETS[out[i].type].name);
        }
        GAME.UI.log("神识铺开如水银泻地——" + parts.join("、") + "应念列阵（占用 " + total + "/" + cap +
            " SP），随时听令齐射！", "info");
        GAME.UI.updateUI();
    },

    /* 一键列阵：把神识用到最满。
     * 排序按「每点神识的齐射产出」从高到低——同额神识下伤害最高。 */
    activateAll: function () {
        var p = GAME.State.p();
        var cap = this.maxSpirit();
        var types = Object.keys(GAME.DATA.PUPPETS);
        var self = this;
        types.sort(function (a, b) {
            var da = GAME.DATA.PUPPETS[a], db = GAME.DATA.PUPPETS[b];
            var va = self.volleyOf(da) / da.spiritCost;
            var vb = self.volleyOf(db) / db.spiritCost;
            if (vb !== va) return vb - va;
            return da.spiritCost - db.spiritCost;
        });
        var comp = [], used = 0, total = 0, i, j;
        for (i = 0; i < types.length; i++) {
            var def = GAME.DATA.PUPPETS[types[i]];
            var own = GAME.State.countItem(def.id);
            for (j = 0; j < own; j++) {
                if (used + def.spiritCost > cap) break;
                if (total >= this.MAX_CONTROL) break;
                used += def.spiritCost; total++;
            }
            if (j > 0) comp.push({ type: types[i], count: j });
        }
        if (!comp.length) { this.activate([]); return; }
        this.activate(comp);
    },
};
