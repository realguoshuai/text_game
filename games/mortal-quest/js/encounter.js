/* =========================================================
 * js/encounter.js —— 野外遭遇裁决器（区域池 / 数值随动 / 掉落阶级）
 *
 * 只做三件事，其余一概不碰：
 *   ① pick(p)        按「当前所在地 + 当前境界」从 DATA.POOLS 抽一只敌手
 *   ② scaleCombat(p) 开战瞬间把敌方气血/攻防锚到玩家身上（Level Scaling）
 *   ③ lootFilter()   按 lootClass 掐掉不该出现的战利品（千年灵药绝禁野外）
 *
 * 数值设计（为什么是这些数）：
 *   玩家气血不随境界猛涨（每次破境 +20，练气十二层约 320），而旧怪是死的
 *   （铁齿狼永远 55 血）。于是这里反过来锚：先算出「这一战该打几回合、
 *   该吃掉玩家多少血」，再倒推敌方气血与攻击。
 *     · 普通野兽 D = 气血上限/26 → 约 9 回合收场，只掉三成血
 *     · 小怪毛贼 D = 气血上限/24
 *     · 精英邪修 D = 气血上限/21 → 掉一半血，得备伤药
 *     · 首领大妖 D = 气血上限/19 → 掉七成血，是"要不要打"的决断
 *   敌方攻击 = 玩家防御 + D：伤害公式是 max(1, 攻×(0.85~1.15) - 防)，
 *   所以只有把 D 加在玩家防御之上，才能保证每回合真的掉这些血。
 *
 *   ★ 低境界不吃缩放：练气前三层 w=0（原表数值本就合适），
 *     练气十二层 w=1，中间线性过渡——不然练气一层会被缩成 22 回合的拉锯战。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Encounter = {

    /* 各阶级的缩放剖面：hpMul 气血倍率（对标玩家上限）、rounds 预期回合、defRatio 防御取玩家几成 */
    PROFILES: {
        beast:  { hpMul: [0.78, 0.92], rounds: 26, defRatio: 0.25 },
        minion: { hpMul: [0.85, 1.00], rounds: 24, defRatio: 0.30 },
        elite:  { hpMul: [1.00, 1.12], rounds: 21, defRatio: 0.38 },
        boss:   { hpMul: [1.15, 1.35], rounds: 19, defRatio: 0.45 },
    },

    /* 野外绝禁清单：千年灵药与筑基重宝只在顶级副本 / 黑市 / 药圃出现，野外一只都不给 */
    FORBIDDEN: {
        herb_qiannian: 1, herb_tianling: 1, herb_yumo: 1, herb_zihou: 1,
        herb_xuanbing: 1, herb_longlin: 1,
        pill_zhuji: 1, pill_zhengpin: 1, fake_zhuji: 1,
        pill_jiedan: 1, pill_jiedan_zhengpin: 1, fake_jiedan: 1,
        artifact_zhetian: 1, artifact_zimu_complete: 1, artifact_tayun: 1,
        ancient_fragment: 1, shengxian_ling: 1,
        pouch_zhuji: 1, pouch_jiedan: 1,
    },

    _def: function (id) {
        var list = GAME.DATA.MONSTERS || [], i;
        for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    },

    /* ---------- 当前所在地属于哪一档 ---------- */
    zoneOf: function (p) {
        p = p || GAME.State.p();
        // 副本/秘境里不掷野外遭遇（进得去是因为另有入口，见 State.dungeonName）
        if (GAME.State && GAME.State.dungeonName && GAME.State.dungeonName(p)) return "dungeon";
        var Z = GAME.DATA.ZONES || {};
        if (Z[p.location] && Z[p.location].zone) return Z[p.location].zone;
        // 未登记节点按地图 kind 兜底，别让新地图落进空池
        var node = (GAME.Map && GAME.Map.node) ? GAME.Map.node(p.location) : null;
        if (node) {
            if (node.kind === "cave") return "wild";
            if (node.kind === "mortal") return "city";
            if (node.kind === "immortal") return "sect";
        }
        return "wild";
    },

    zoneName: function (p) {
        var z = this.zoneOf(p);
        var cfg = (GAME.DATA.POOLS || {})[z];
        return (cfg && cfg.name) || "野外";
    },

    /* ---------- 候选池：区域 + 修为带双重过滤 ---------- */
    poolOf: function (p) {
        p = p || GAME.State.p();
        var z = this.zoneOf(p);
        var cfg = (GAME.DATA.POOLS || {})[z] || (GAME.DATA.POOLS || {}).wild;
        if (!cfg) return [];
        var realm = p.realmIndex || 0, out = [];
        (cfg.list || []).forEach(function (e) {
            if (!GAME.Encounter._def(e.id)) return;                  // 数据缺项直接跳过，别抽出一只空气
            if (e.band && (realm < e.band[0] || realm > e.band[1])) return;
            out.push(e);
        });
        // 修为超出全带（例如元婴在苍南谷闲逛）→ 退回该区最宽的一档，绝不空手
        if (!out.length) {
            (cfg.list || []).forEach(function (e) {
                if (GAME.Encounter._def(e.id)) out.push(e);
            });
        }
        return out;
    },

    /* ---------- 抽一只 ---------- */
    pick: function (p) {
        p = p || GAME.State.p();
        var pool = this.poolOf(p);
        if (!pool.length) return null;
        var total = 0, i;
        for (i = 0; i < pool.length; i++) total += (pool[i].weight || 1);
        var roll = Math.random() * total;
        var hit = pool[pool.length - 1];
        for (i = 0; i < pool.length; i++) {
            if (roll < (pool[i].weight || 1)) { hit = pool[i]; break; }
            roll -= (pool[i].weight || 1);
        }
        // 只返回数据表里的 def 本体，不在共享数据上写运行期字段
        // （def 是被全仓共用的常量，挂 _isElite 之类迟早会被别处读到）
        return this._def(hit.id);
    },

    /* ---------- 遭遇文案：随区域/敌手/级别给一句话 ---------- */
    meetText: function (def, p) {
        p = p || GAME.State.p();
        if (!def) return "前路杀机骤起！";
        var t = "【" + this.zoneName(p) + "】" + (def.desc || def.name + "拦在前路。");
        var realm = p.realmIndex || 0;
        if (def.lootClass === "boss") t += "（气机沉凝，绝非易与之辈）";
        else if (realm >= 12 && def.lootClass !== "elite") t += "（这点道行，当是送上门来的磨刀石）";
        return t;
    },

    /* ---------- 数值随动缩放：开战时把敌方锚到玩家身上 ---------- */
    scaleCombat: function (p) {
        p = p || GAME.State.p();
        var c = p && p.combat;
        if (!c || !c.def || !c.def.scalable) return;
        var def = c.def;
        var realm = p.realmIndex || 0;
        // 练气前三层不吃缩放；练气三→十二层线性过渡到满额
        var w = Math.min(1, Math.max(0, (realm - 2) / 9));
        if (w <= 0) return;

        var cls = def.lootClass || "minion";
        var prof = this.PROFILES[cls] || this.PROFILES.minion;
        var stats = GAME.State.getStats();
        var maxHp = p.maxHp || 100;

        var tHp  = Math.round(maxHp * this._rnd(prof.hpMul[0], prof.hpMul[1]));
        var tDef = Math.round(stats.def * prof.defRatio);
        // 每回合该咬掉的伤害 D：加在玩家防御之上，才能在 max(1, 攻-防) 里真正落地
        var perRound = Math.max(2, Math.round(maxHp / prof.rounds));
        var tAtk = stats.def + perRound;
        var tSpd = Math.round(def.speed + (stats.speed - def.speed) * 0.7 * w);
        var tSpi = Math.round(def.spirit + (stats.spirit * 0.75 - def.spirit) * w);

        var blend = function (base, target) { return Math.max(1, Math.round(base + (target - base) * w)); };
        c.maxHp  = blend(def.hp, tHp);
        c.hp     = c.maxHp;
        c.atk    = blend(def.atk, tAtk);
        c.def_   = blend(def.def, tDef);
        c.speed  = Math.max(3, tSpd);
        c.spirit = Math.max(1, tSpi);
        c.scaled = true;
        c.hpRatio = c.maxHp / Math.max(1, def.hp);

        // 同境遭遇：大境界压制留给剧情战，野外不许出现「练气打筑基」的假越级
        if (def.region) c.monsterMajor = GAME.DATA.majorRealm(realm);
        c.crossPenalty = (c.playerMajor < c.monsterMajor) ? 0.5 : 1;

        // 修为/灵石随强度走，但不照搬气血倍数（否则历练收益盖过打坐与丹药）
        c.expGain = Math.round((def.exp || 0) * (1 + (c.hpRatio - 1) * 0.9));
        var sm = Math.max(1, Math.pow(c.hpRatio, 0.7));
        c.stonesGain = [Math.round(def.stones[0] * sm), Math.round(def.stones[1] * sm)];
    },

    /* ---------- 掉落阶级闸门 ---------- */
    /* 返回"合法"的掉落表。判据只有两条：阶级白名单 + 定价上限。
     * 这里是唯一出口——战斗里所有 grantLoot 都先过这道闸，所以哪怕日后有人
     * 往 monsters 里写了千年灵药，也进不了玩家的袋子。 */
    lootFilter: function (def, loot) {
        var cls = def && def.lootClass;
        if (!cls || !loot || !loot.length) return loot;
        var capMap = { beast: Infinity, minion: 120, elite: 320, boss: Infinity };
        var cap = (capMap[cls] == null) ? Infinity : capMap[cls];
        var out = [];
        for (var i = 0; i < loot.length; i++) {
            var l = loot[i], it = GAME.DATA.ITEMS[l.id];
            if (!it) continue;
            if (this.FORBIDDEN[l.id]) continue;                       // 千年灵药/筑基重宝：野外绝禁
            var t = it.type;
            if (cls === "beast" && (t === "pill" || t === "talisman" || t === "artifact" ||
                                    t === "herb" || t === "skill" || t === "treasure")) continue;
            if ((cls === "minion" || cls === "elite") && t === "herb") continue;   // 灵药只认首领
            if ((it.price || 0) > cap) continue;
            out.push(l);
        }
        return out;
    },

    _rnd: function (a, b) { return a + Math.random() * (b - a); },
};
