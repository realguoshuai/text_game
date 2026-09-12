/* =========================================================
 * data/realms_foundation.js —— 筑基期（一层~九层）数值扩展表
 *
 * 作为 data/realms.js 的「筑基专属补表」加载（须在 realms.js 之后），
 * 在 REALMS[13..21] 上挂接以下字段，不重复定义 atk/def/speed/spirit：
 *   hp          气血上限（350 → 2600，随层暴涨）
 *   mp          法力上限（120 → 900）
 *   sp          神识上限 SP（15 → 100）—— puppet.js 神识承载检定以此为准
 *   defSuppress 境界免伤压制系数（0.60 → 0.85）：
 *               高境界受低境界攻击时，强制削减 (defSuppress) 比例伤害。
 *               筑基一层受练气攻击 → 削减 60%（×0.4）；九层圆满 → 削减 85%（×0.15）。
 *
 * 另导出 GAME.DATA.FOUNDATION（纯数据，供测试与图志读取）与
 * GAME.DATA.DAYAN_SP_STEP（大衍决前四层每层永久提升的神识上限 SP 增量）。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

/* —— 筑基一层~九层梯度（与 realms.js 中 REALMS[13..21] 一一对应） —— */
GAME.DATA.FOUNDATION = {
    layers: [
        { hp: 350,  mp: 120, sp: 15,  defSuppress: 0.60 },  // 筑基一层
        { hp: 500,  mp: 200, sp: 30,  defSuppress: 0.63 },  // 二层
        { hp: 700,  mp: 300, sp: 45,  defSuppress: 0.66 },  // 三层
        { hp: 950,  mp: 420, sp: 60,  defSuppress: 0.70 },  // 四层（中期）
        { hp: 1300, mp: 540, sp: 72,  defSuppress: 0.74 },  // 五层
        { hp: 1650, mp: 660, sp: 82,  defSuppress: 0.78 },  // 六层
        { hp: 2050, mp: 780, sp: 90,  defSuppress: 0.81 },  // 七层（后期）
        { hp: 2350, mp: 860, sp: 95,  defSuppress: 0.83 },  // 八层
        { hp: 2600, mp: 900, sp: 100, defSuppress: 0.85 },  // 九层大圆满
    ],
    /* 大衍决前四层：每层永久提升神识上限 SP。
     * 筑基一层基础 SP=15，四层学满累计 +85 → 神识上限 100（呼应原著神识暴涨）。
     * 索引即层数（第 1~4 层），learnDayan 按已习层数逐层累加。 */
    DAYAN_SP_STEP: [25, 22, 20, 18],
    DAYAN_MAX_LAYER: 4,
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

/* 神识上限 SP：当前境界基础 + 大衍决永久加成（spiritBonus 由 puppet.learnDayan 写入） */
GAME.DATA.foundationMaxSpirit = function (p) {
    var realm = GAME.DATA.REALMS[p.realmIndex];
    var baseSp = (realm && realm.sp != null) ? realm.sp : (realm ? realm.spirit : 15);
    // 《三转归元功》散功逆转：每转神识上限永久 +20%
    var mul = 1 + (p.threeTurnCount || 0) * ((GAME.DATA.SANZHUAN && GAME.DATA.SANZHUAN.statGain) || 0.20);
    return Math.round((baseSp + (p.spiritBonus || 0)) * mul);
};
