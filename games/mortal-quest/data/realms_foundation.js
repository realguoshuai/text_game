/* =========================================================
 * data/realms_foundation.js —— 筑基期（初期/中期/后期）数值扩展表
 *
 * 作为 data/realms.js 的「筑基专属补表」加载（须在 realms.js 之后），
 * 在 REALMS[13..15] 上挂接以下字段，不重复定义 atk/def/speed/spirit：
 *   hp          气血上限（350 → 2600，随层暴涨）
 *   mp          法力上限（120 → 900）
 *   sp          神识上限 SP（15 → 100）—— puppet.js 神识承载检定以此为准
 *   defSuppress 境界免伤压制系数（0.60 → 0.85）：
 *               高境界受低境界攻击时，强制削减 (defSuppress) 比例伤害。
 *               筑基初期受练气攻击 → 削减 60%（×0.4）；后期圆满 → 削减 85%（×0.15）。
 *
 * 另导出 GAME.DATA.FOUNDATION（纯数据，供测试与图志读取）与
 * GAME.DATA.DAYAN_SP_STEP（大衍决前四层每层永久提升的神识上限 SP 增量）。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

/* —— 筑基初期/中期/后期梯度（与 realms.js 中 REALMS[13..15] 一一对应） —— */
GAME.DATA.FOUNDATION = {
    layers: [
        { hp: 350,  mp: 120, sp: 15,  defSuppress: 0.60 },  // 筑基初期
        { hp: 1300, mp: 540, sp: 72,  defSuppress: 0.74 },  // 筑基中期
        { hp: 2600, mp: 900, sp: 100, defSuppress: 0.85 },  // 筑基后期
    ],
    /* 大衍决前四层：每层永久提升神识上限 SP。
     * 筑基一层基础 SP=15，四层学满累计 +85 → 神识上限 100（呼应原著神识暴涨）。
     * 索引即层数（第 1~4 层），learnDayan 按已习层数逐层累加。 */
    DAYAN_SP_STEP: [25, 22, 20, 18],
    DAYAN_MAX_LAYER: 4,
};

/* —— 结丹初期/中期/后期梯度（与 realms.js 中 REALMS[16..18] 一一对应） ——
 * hp/mp 自筑基后期(2600/900)续涨；sp 神识上限续涨（供傀儡/御物）；
 * defSuppress 境界免伤压制系数升至 0.88~0.93（结丹受低境攻击削减 88%~93%）。 */
GAME.DATA.JIEDAN_FOUNDATION = {
    layers: [
        { hp: 3200, mp: 1100, sp: 120, defSuppress: 0.88 },  // 结丹初期
        { hp: 5100, mp: 1750, sp: 165, defSuppress: 0.905 }, // 结丹中期
        { hp:10500, mp: 3200, sp: 240, defSuppress: 0.93 },  // 结丹后期
    ],
};

/* —— 元婴初期/中期/后期梯度（与 realms.js 中 REALMS[19..21] 一一对应） ——
 * hp/mp 自结丹后期(10500/3200)续涨；sp 神识上限续涨（元神出游、御物、傀儡皆以此为资）；
 * defSuppress 境界免伤压制系数升至 0.95~0.97（元婴受低境攻击削减 95% 以上）。 */
GAME.DATA.YUANING_FOUNDATION = {
    layers: [
        { hp: 18000, mp: 5000,  sp: 320, defSuppress: 0.95 },  // 元婴初期
        { hp: 28000, mp: 8000,  sp: 420, defSuppress: 0.96 },  // 元婴中期
        { hp: 45000, mp: 12000, sp: 550, defSuppress: 0.97 },  // 元婴后期
    ],
};

/* 将梯度写入 REALMS[13..21]（幂等：重复加载不叠加） */
(function applyFoundation() {
    var R = GAME.DATA.REALMS;
    var F = GAME.DATA.FOUNDATION.layers;
    var base = GAME.DATA.ZHUJI_GATE_INDEX + 1; // 13
    for (var i = 0; i < F.length; i++) {
        var r = R[base + i];
        if (!r) continue;
        r.hp = F[i].hp;
        r.mp = F[i].mp;
        r.sp = F[i].sp;
        r.defSuppress = F[i].defSuppress;
    }
})();

/* 将结丹梯度写入 REALMS[16..18]（幂等：重复加载不叠加） */
(function applyJiedan() {
    var R = GAME.DATA.REALMS;
    var F = GAME.DATA.JIEDAN_FOUNDATION.layers;
    var base = GAME.DATA.JIEDAN_GATE_SOURCE + 1; // 16
    for (var i = 0; i < F.length; i++) {
        var r = R[base + i];
        if (!r) continue;
        r.hp = F[i].hp;
        r.mp = F[i].mp;
        r.sp = F[i].sp;
        r.defSuppress = F[i].defSuppress;
    }
})();

/* 将元婴梯度写入 REALMS[19..21]（幂等：重复加载不叠加） */
(function applyYuanying() {
    var R = GAME.DATA.REALMS;
    var F = GAME.DATA.YUANING_FOUNDATION.layers;
    var base = GAME.DATA.YUANING_GATE_SOURCE + 1; // 19
    for (var i = 0; i < F.length; i++) {
        var r = R[base + i];
        if (!r) continue;
        r.hp = F[i].hp;
        r.mp = F[i].mp;
        r.sp = F[i].sp;
        r.defSuppress = F[i].defSuppress;
    }
})();

/* 神识上限 SP：当前境界基础 + 大衍决永久加成（spiritBonus 由 puppet.learnDayan 写入） */
GAME.DATA.foundationMaxSpirit = function (p) {
    var realm = GAME.DATA.REALMS[p.realmIndex];
    var baseSp = (realm && realm.sp != null) ? realm.sp : (realm ? realm.spirit : 15);
    // 《三转归元功》散功逆转：每转神识上限永久 +20%
    var mul = 1 + (p.threeTurnCount || 0) * ((GAME.DATA.SANZHUAN && GAME.DATA.SANZHUAN.statGain) || 0.20);
    // 结丹道途：体修以神识换筋骨——上限 ×0.7；法修为基准不作增减（道途系数唯一出口 GAME.Path.spiritMul）
    var pathMul = (GAME.Path && GAME.Path.spiritMul) ? GAME.Path.spiritMul(p) : 1;
    return Math.round((baseSp + (p.spiritBonus || 0)) * mul * pathMul);
};
