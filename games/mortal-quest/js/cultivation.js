/* =========================================================
 * js/cultivation.js —— 筑基期主修功法与散功逆转（逻辑层）
 *
 * ① 《青冥剑诀》：learn(way) / practice() / pierceRatio() / onCombatStart()
 *      · 青元剑芒 pierceRatio()：无视敌方 30% 护甲（combat.attack 调用）
 *      · 护体剑盾 onCombatStart()：耗 20 法力凝 3 回合剑盾，吸收 25% 物理穿刺
 * ② 《三转归元功》：learn() / canSanGong() / sanGong() / statMul() / jiedanBonus()
 *      · 散功即境界跌回筑基一层、当前阶位修为清空、threeTurnCount++、
 *        气血/法力/神识上限永久 +20%（statMul 参与所有上限计算）
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Cultivation = {

    cfg: function () { return GAME.DATA.QINGYUAN; },
    cfgSZ: function () { return GAME.DATA.SANZHUAN; },

    // ---------- 《青冥剑诀》是否已习得 / 当前层数 ----------
    has: function () {
        var p = GAME.State.p();
        return (p.qingyuanLevel || 0) > 0;
    },
    level: function () { return GAME.State.p().qingyuanLevel || 0; },

    // 功法攻击加成（各层 atk 累加）
    atkBonus: function () {
        var lv = this.level(), c = this.cfg(), sum = 0;
        for (var i = 0; i < lv && i < c.layers.length; i++) sum += c.layers[i].atk;
        return sum;
    },

    // ---------- 习得：拜师获赐 / 200 战功兑换 ----------
    // way: "master"（李玄尘赐前三层）/ "contrib"（藏经阁战功兑换）
    learn: function (way) {
        var p = GAME.State.p();
        var c = this.cfg();
        if (p.isDead || p.combat) return false;
        if (way === "master") {
            if (this.level() >= c.masterGiftLayer) {
                GAME.UI.log("《青冥剑诀》前三层你早已烂熟于心。", "system");
                GAME.UI.updateUI();
                return false;
            }
            p.qingyuanLevel = c.masterGiftLayer;
            p.skills = p.skills || {};
            p.skills[c.id] = true;
            GAME.UI.log("李玄尘将一册青皮古籍递来：「此乃本门《青冥剑诀》前三层的传承，你且拿去。」", "story");
            GAME.UI.log("【习得《青冥剑诀》·前三層】青元剑芒已附法器，斗法开战自凝护体剑盾。", "success");
            GAME.UI.updateUI();
            return true;
        }
        // 战功兑换
        if (this.has()) {
            GAME.UI.log("《青冥剑诀》你已入手，不必再费战功。", "system");
            GAME.UI.updateUI();
            return false;
        }
        if ((p.sectContrib || 0) < c.contribCost) {
            GAME.UI.log("藏经阁执事摇头：《青冥剑诀》需战功 " + c.contribCost + "（现有 " + (p.sectContrib || 0) + "）。", "system");
            GAME.UI.updateUI();
            return false;
        }
        p.sectContrib -= c.contribCost;
        p.qingyuanLevel = 1;
        p.skills = p.skills || {};
        p.skills[c.id] = true;
        GAME.UI.log("你以战功 " + c.contribCost + " 换得【《青冥剑诀》】——剑芒自生，护体剑盾亦可凝。", "success");
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 精修下一层：耗修为与 1 月 ----------
    practice: function () {
        var p = GAME.State.p();
        var c = this.cfg();
        if (!this.has()) {
            GAME.UI.log("你尚未习得《青冥剑诀》，无从精修。", "system");
            GAME.UI.updateUI();
            return false;
        }
        var lv = this.level();
        if (lv >= c.maxLayer) {
            GAME.UI.log("《青冥剑诀》前六层已至圆满，再修须待结丹之后。", "system");
            GAME.UI.updateUI();
            return false;
        }
        var need = c.layers[lv].exp;
        if ((p.currentExp || 0) < need) {
            GAME.UI.log("修为不足（需 " + need + "），青元剑意难有寸进。", "system");
            GAME.UI.updateUI();
            return false;
        }
        p.currentExp -= need;
        p.qingyuanLevel = lv + 1;
        GAME.UI.log("你闭关参悟【《青冥剑诀》·第" + p.qingyuanLevel + "层】——" + c.layers[lv].desc, "success");
        GAME.Core.passTime(1);
        return true;
    },

    // ---------- 被动一：青元剑芒（无视 30% 护甲） ----------
    pierceRatio: function () {
        return this.has() ? this.cfg().pierce : 0;
    },
    // 敌方有效防御（供 combat.attack 调用）
    effectiveDef: function (rawDef) {
        return rawDef * (1 - this.pierceRatio());
    },

    // ---------- 被动二：护体剑盾（开局自动凝聚） ----------
    onCombatStart: function () {
        var p = GAME.State.p();
        if (!p.combat || !this.has()) return;
        var sh = this.cfg().shield;
        if ((p.mp || 0) < sh.mp) return;
        p.mp -= sh.mp;
        p.combat.swordShield = { turns: sh.turns, absorb: sh.absorb };
        GAME.UI.log("【护体剑盾】法力灌注，三面青色剑盾绕身而立（耗法力 " + sh.mp +
            "，持续 " + sh.turns + " 回合，吸收 " + Math.round(sh.absorb * 100) + "% 物理穿刺伤害）。", "success");
    },
    // 玩家受创时剑盾吸收（返回应吸收的伤害）
    shieldAbsorb: function (dmg) {
        var p = GAME.State.p();
        if (!p.combat || !p.combat.swordShield) return 0;
        return Math.round(dmg * p.combat.swordShield.absorb);
    },
    // 回合结束：剑盾持续回合 -1
    tickShield: function () {
        var p = GAME.State.p();
        if (!p.combat || !p.combat.swordShield) return;
        p.combat.swordShield.turns -= 1;
        if (p.combat.swordShield.turns <= 0) {
            p.combat.swordShield = null;
            GAME.UI.log("护体剑盾青光散去——三回合已尽。", "system");
        }
    },

    // ================= 《三转归元功》 =================
    hasSZ: function () {
        var p = GAME.State.p();
        return !!(p.skills && p.skills[this.cfgSZ().id]);
    },
    learnSZ: function () {
        var p = GAME.State.p();
        p.skills = p.skills || {};
        if (p.skills[this.cfgSZ().id]) {
            GAME.UI.log("《三转归元功》你早已记得。", "system");
            return false;
        }
        p.skills[this.cfgSZ().id] = true;
        GAME.UI.log("你记下【《三转归元功》】——散功逆转、重元再铸，逆天而行的法门。", "success");
        return true;
    },

    // 散功条件：筑基后期（7~9 层）＋ 心境 ≥ 80 ＋ 未满三转
    canSanGong: function () {
        var p = GAME.State.p();
        var c = this.cfgSZ();
        if (!this.hasSZ()) return { ok: false, msg: "未习《三转归元功》，散功无门。" };
        if ((p.threeTurnCount || 0) >= c.maxTurns) return { ok: false, msg: "三转已满，再散便是自毁道基。" };
        if (p.realmIndex < c.reqLayerMin || p.realmIndex > c.reqLayerMax) {
            return { ok: false, msg: "须筑基后期（七至九层）方可行散功逆转之事。" };
        }
        if ((p.mind || 0) < c.reqMind) {
            return { ok: false, msg: "心境不足（需 " + c.reqMind + "，现 " + (p.mind || 0) + "），强行散功必致心魔。" };
        }
        return { ok: true };
    },

    // 全属性上限倍率：每转 +20%
    statMul: function () {
        var p = GAME.State.p();
        return 1 + (p.threeTurnCount || 0) * this.cfgSZ().statGain;
    },
    // 结丹突破补偿：每转 +25%（上限三转 +75%）
    jiedanBonus: function () {
        var p = GAME.State.p();
        var n = Math.min(p.threeTurnCount || 0, this.cfgSZ().maxTurns);
        return n * this.cfgSZ().jiedanBonusPerTurn;
    },

    // ---------- 执行散功逆转 ----------
    sanGong: function () {
        var p = GAME.State.p();
        var chk = this.canSanGong();
        if (!chk.ok) {
            GAME.UI.log(chk.msg, "system");
            GAME.UI.updateUI();
            return false;
        }
        var before = this.statMul();
        p.threeTurnCount = (p.threeTurnCount || 0) + 1;
        p.realmIndex = this.cfgSZ().rollbackIndex;   // 跌回筑基一层
        p.currentExp = 0;                            // 清空当前阶位修为
        var after = this.statMul();
        // 气血 / 法力上限按新倍率重算（神识上限由 foundationMaxSpirit 动态读取 threeTurnCount）
        var realm = GAME.DATA.REALMS[p.realmIndex];
        if (realm) {
            var baseHp = realm.hp != null ? realm.hp : p.maxHp;
            var baseMp = realm.mp != null ? realm.mp : p.maxMp;
            p.maxHp = Math.round(baseHp * after);
            p.maxMp = Math.round(baseMp * after);
            p.currentHp = p.maxHp;
            p.mp = p.maxMp;
        } else {
            p.maxHp = Math.round(p.maxHp / before * after);
            p.maxMp = Math.round(p.maxMp / before * after);
        }
        GAME.UI.log("【散功逆转·第" + p.threeTurnCount + "转】真元自丹田倒卷而回——周身修为层层剥落，跌回筑基一层！", "danger");
        GAME.UI.log("然而真元更为凝练：气血、法力、神识上限永久 +" +
            Math.round(this.cfgSZ().statGain * 100) + "%（现累计 +" + Math.round((after - 1) * 100) + "%）。" +
            "日后结丹，每转另得 +" + Math.round(this.cfgSZ().jiedanBonusPerTurn * 100) + "% 破境之机。", "success");
        GAME.UI.updateUI();
        return true;
    },
};
