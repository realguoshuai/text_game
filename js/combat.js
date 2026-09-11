/* =========================================================
 * js/combat.js —— 斗法引擎（回合制文本状态机）
 * 对比双方 攻/防/速/神识；玩家行动：斗法 / 使用符箓 / 遁走
 * 战胜搜刮战利品；战败折寿、被抢灵石、或概率道消身陨
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Combat = {

    // ---------- 开战：把妖兽配置深拷进战斗状态，避免污染数据表 ----------
    start: function (monsterId) {
        var def = null;
        GAME.DATA.MONSTERS.forEach(function (m) { if (m.id === monsterId) def = m; });
        if (!def) return;

        var p = GAME.State.p();
        if (GAME.Codex) GAME.Codex.unlockMonster(monsterId);   // 图鉴·妖兽：首次遭遇即录
        p.pendingEvent = null; // 战斗期间清空事件面板
        // 外部模块（景阳城玄机世家 / 升仙大会擂台）可通过 p.combatRoute 声明战斗归属，
        // 战后由 Combat 把结果交还给对应模块的 afterCombat(ctx)
        var ctx = p.combatRoute || null;
        p.combatRoute = null;
        p.combat = {
            def: def,
            name: def.name,
            hp: def.hp, maxHp: def.hp,
            atk: def.atk, def_: def.def, speed: def.speed, spirit: def.spirit,
            round: 1, shield: 0, fleeBonus: 0, talismanOpen: false, spellOpen: false, day: true,
            poison: null,          // 毒囊涂抹：{ turns, dmg } 敌方每回合流失气血
            bleed: null,           // 淬毒筒首回合喷毒：{ turns, dmg } 敌方持续流血
            blind: null,           // 眨眼剑法：敌方【目眩】{ turns }（命中率大减）
            stun: null,            // 定身符：敌方【定身】{ turns }（整个回合无法出手）
            evade: false,          // 流烟步：本回合敌方攻击尽数落空
            exhausted: false,      // 流烟步反噬：下回合脱力难动
            blockNext: false,      // 玄傀肉身抵挡：本回合替玩家扛伤害
            spellReady: {},        // 术法冷却：{ 术法id: 可再次施放的回合号 }
            ctx: ctx,              // 战斗归属 { type:"jiayuan"|"leitai", ... }
            trial: !!def.trial,    // 是否血月试炼中的战斗（决定胜负后路由）
            moEvent: !!def.moEvent,// 是否玄机子之战（决定胜负后路由）
        };
        // 大境界绝对压制：记录双方大境阶层，供伤害/命中修正
        p.combat.playerMajor = GAME.DATA.majorRealm(p.realmIndex);
        p.combat.monsterMajor = (def.majorRealm != null) ? def.majorRealm : 0;
        p.combat.crossPenalty = (p.combat.playerMajor < p.combat.monsterMajor) ? 0.5 : 1; // 玩家越级：命中/暴击 -50%
        // 怪物动态词缀（仅高危区域/指定模板生成）：夺舍残魂 / 厚甲妖壳 / 魔化狂暴
        var affix = def.affix || (def.affixPool && def.affixPool.length
            ? def.affixPool[Math.floor(Math.random() * def.affixPool.length)] : null);
        p.combat.affix = affix;
        if (affix === "seizeSoul") {        // 夺舍残魂：神识 +40%，免疫目眩/致盲
            p.combat.spirit = Math.round(p.combat.spirit * 1.4);
            p.combat.immuneBlind = true;
        } else if (affix === "thickShell") { // 厚甲妖壳：物理/法器免伤 50%，弱烈火
            p.combat.thickShell = true;
        } else         if (affix === "berserk") {    // 魔化狂暴：HP<30% 时攻击 +100%
            p.combat.berserk = true;
        }
        // 机关傀儡齐射：开战捕获已激活的傀儡数（大衍决·控物之术操控 4~8 具）
        p.combat.puppets = p.puppetsActive || 0;
        var s = GAME.State.getStats();
        GAME.UI.log("杀机骤现！你与【" + def.name + "】斗法起来！", "danger");
        GAME.UI.log("（你：攻" + s.atk + " 防" + s.def + " 速" + s.speed + " 识" + s.spirit +
            "｜对手：攻" + def.atk + " 防" + def.def + " 速" + def.speed + " 识" + def.spirit + "）", "system");
        // 《天眼术》：主动探查——开战即看破敌方气血底细与随身宝物成色
        if (p.spells && p.spells.tianyan_shu) {
            var topLoot = "", best = 0;
            var QORD = { "凡品":1, "灵品":2, "上品":3, "极品":4 };
            (def.loot || []).forEach(function (l) {
                var it = GAME.DATA.ITEMS[l.id];
                var q = QORD[it.quality] || 0;
                if (q > best && l.chance >= 0.3) { best = q; topLoot = it.name + "（" + it.quality + "）"; }
            });
            GAME.UI.log("【天眼术】神识扫过——其气血约 " + def.hp + "、攻 " + def.atk + " 防 " + def.def +
                "；随身之物：" + (topLoot || "并无可观") + "。战避之心，你可定了。", "info");
        }
        if (s.speed >= def.speed) GAME.UI.log("你身法略快，抢得先机！", "info");
        else GAME.UI.log("对方出手极快，你只能见招拆招！", "warning");

        // 战前暗器：玉带软剑首回合瞬发 / 淬毒筒首回合喷毒
        if (p.darkWeapon && GAME.DATA.ITEMS[p.darkWeapon]) {
            var dw = GAME.DATA.ITEMS[p.darkWeapon];
            if (dw.firstStrike) {
                p.combat.hp -= dw.firstStrike;
                GAME.UI.log("你腕底【" + dw.name + "】无声刺出，先伤敌 " + dw.firstStrike + " 分！", "info");
                if (p.combat.hp <= 0) return this.victory();
            }
            if (dw.bleed) {
                p.combat.bleed = { turns: dw.bleed.turns, dmg: dw.bleed.dmg };
                GAME.UI.log("【" + dw.name + "】喷毒，敌身中见血封喉之毒，每回合流失气血！", "warning");
            }
        }
        // 乌金盾（主持或控物术副持皆可）：开战自动张起乌金罡气，先行吸收伤害
        var hasWujin = (p.artifact === "artifact_wujin") || (p.artifact2 === "artifact_wujin");
        if (hasWujin && GAME.DATA.SKILLS.wujin_shield_note) {
            p.combat.shield += GAME.DATA.SKILLS.wujin_shield_note.startShield;
            GAME.UI.log("乌金盾嗡鸣张起，一层乌金罡气护住周身（罡气 +30，先行吸收伤害）。", "info");
        }
        // 《青冥剑诀》护体剑盾：开局耗 20 法力，凝聚持续 3 回合的护体剑盾
        if (GAME.Cultivation) GAME.Cultivation.onCombatStart();
        GAME.UI.updateUI();
    },
    // ---------- 伤害结算：攻方打守方，随机浮动 + 神识压制暴击 ----------
    // ---------- 伤害结算：攻方打守方，随机浮动 + 神识压制暴击 ----------
    // bonusCrit：额外暴击率（子母刃专走死角 +0.20），封顶 0.6
    calcDamage: function (atk, def_, atkSpirit, defSpirit, bonusCrit) {
        var dmg = Math.max(1, Math.round(atk * (0.85 + Math.random() * 0.3) - def_));
        var critChance = Math.min(0.6, Math.max(0, 0.05 + (atkSpirit - defSpirit) * 0.03 + (bonusCrit || 0)));
        if (Math.random() < critChance) return { dmg: Math.round(dmg * 1.5), crit: true };
        return { dmg: dmg, crit: false };
    },

    // ---------- 大境界绝对压制（境界压制算法核心） ----------
    // 攻方大境高于守方：每差一个大境最终伤害 ×(1 + gap*1.5)
    // 攻方大境低于守方（越级挑战）：守方免伤 60%，攻方输出 ×0.4（刮痧）
    // 同境：无修正（×1）
    realmDamageMul: function (atkMajor, defMajor) {
        var gap = atkMajor - defMajor;
        if (gap > 0) return 1 + gap * 1.5;   // 高打低：每差一大境最终伤害 ×(1+gap*1.5)
        return 1;                            // 同境/低打高：增伤只看攻方高境，免伤另由 realmDefSuppress 处理
    },
    // 高境界守方受低境界攻击时的强制免伤系数：dmg *= realmDefSuppress(defenderRealmIdx)
    // 筑基一层 defSuppress=0.60（受练气攻击 ×0.4）；九层圆满 0.85（×0.15）；练气无压制=1
    realmDefSuppress: function (defenderRealmIdx) {
        var r = GAME.DATA.REALMS[defenderRealmIdx];
        if (!r || r.defSuppress == null) return 1;
        return Math.round((1 - r.defSuppress) * 100) / 100;   // 两位小数，避免浮点比较误差
    },
    // 越级（攻方大境低于守方）：命中率与暴击率阶梯削减 50%
    realmCrossPenalty: function (atkMajor, defMajor) {
        return atkMajor < defMajor ? 0.5 : 1;
    },

    // ---------- 玩家行动 1：斗法 ----------
    // 自动斗法：一键打到分出胜负（气血跌破三成自动停下，把决断权交回玩家）
    auto: function (limit) {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return 0;
        limit = limit || 80;
        var n = 0;
        while (p.combat && !p.isDead && n < limit) {
            if (p.pendingEvent || p.pendingMercy) break;
            if (p.currentHp < p.maxHp * 0.3) {
                GAME.UI.log("自动斗法中止：气血已不足三成，剩下的交由你自己决断。", "warning");
                break;
            }
            this.attack();
            n += 1;
        }
        if (n > 0) GAME.UI.log("自动斗法结束，共交手 " + n + " 回合。", "system");
        GAME.UI.updateUI();
        return n;
    },

    attack: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        if (p.combat.exhausted) return this._consumeExhausted();   // 流烟步反噬：脱力跳过本回合
        // 遮天钟【金钟庇护】：万法不侵，但自身无法出招
        if (p.combat.zhetian) {
            GAME.UI.log("你罩在遮天钟内，钟身嗡鸣——此状态下万法不侵，却也无法出招。", "system");
            return this.enemyTurn();
        }
        var s = GAME.State.getStats();
        // 符宝：上一回合已祭起蓄力，本回合化作毁灭打击
        if (p.combat.fubaoCharged) return this._releaseFuBao(s);
        // 越级挑战：命中率阶梯削减 50%（大境界威慑）
        var crossPen = this.realmCrossPenalty(p.combat.playerMajor, p.combat.monsterMajor);
        // 《青木功》命中判定：层数越高越准
        var hitRate = (0.85 + s.hit) * crossPen;
        if (Math.random() > hitRate) {
            GAME.UI.log("你斗法一击竟落了空，未能命中【" + p.combat.name + "】！", "system");
            return this.enemyTurn();
        }
        // 《子母刃》：暗器死角暴击——两成攻势绕开守御直击要害
        var zimuCrit = (p.darkWeapon === "zimu_ren") ? 0.20 : 0;
        // 《青冥剑诀》青元剑芒：法器攻击附带金木混合锐芒，无视敌方 30% 护甲/护盾
        var effDef = GAME.Cultivation ? GAME.Cultivation.effectiveDef(p.combat.def_) : p.combat.def_;
        var r = this.calcDamage(s.atk, effDef, s.spirit, p.combat.spirit, zimuCrit);
        var dmg = r.dmg;
        // 大境界绝对压制：高打低增伤；低打高（越级）刮痧
        dmg = Math.round(dmg * this.realmDamageMul(p.combat.playerMajor, p.combat.monsterMajor));
        // 厚甲妖壳：物理/法器攻击免伤 50%
        if (p.combat.thickShell) dmg = Math.round(dmg * 0.5);
        // 机关傀儡齐射（大衍决神识驭器，高频连环集火）
        if (p.combat.puppets > 0 && GAME.Puppet) {
            var pv = p.combat.puppets * GAME.Puppet.PUPPET_VOLLEY_PER;
            dmg += pv;
            GAME.UI.log("机关傀儡列阵齐射！" + p.combat.puppets + " 具傀儡连珠箭雨，再添 " + pv + " 点伤害！", "info");
        }
        if (r.crit && zimuCrit && zimuCrit >= 0.2 && !p.combat.def.bladeImmune) {
            GAME.UI.log("母刃明晃晃格开守势，子刃却自死角无声递出——", "warning");
        }
        if (p.combat.def.bladeImmune) {   // 玄机子《魔银手》：利刃砍刺被弹开，仅余震荡
            dmg = Math.round(dmg * 0.15);
            GAME.UI.log("魔银手乌光暴涨，你的利刃砍刺被尽数弹开，仅余些许震荡！", "warning");
        }
        // 《控物术》：法器离手飞斩——神识驭器附加攻击，取法器攻击加成五成
        if (p.spells && p.spells.kongwu_shu && p.artifact) {
            var slash = Math.round((GAME.DATA.ITEMS[p.artifact].equip.atk || 0) * GAME.DATA.SPELLS.kongwu_shu.slashRatio);
            if (slash > 0) {
                dmg += slash;
                GAME.UI.log("神识一引，【" + GAME.DATA.ITEMS[p.artifact].name + "】离手飞斩，又添 " + slash + " 点伤害！", "info");
            }
        }
        // 金蚨子母刃（完全体）：一母八子共九重独立穿透伤害，专克硬甲
        if (this._hasMultiHit()) {
            var mh = GAME.DATA.ITEMS[this._multiHitId()];
            var per = Math.max(1, Math.round(s.atk * mh.multiHitRatio));
            var volley = per * (mh.multiHit - 1);
            dmg += volley;
            GAME.UI.log("金蚨子母刃齐出！母刃破甲，八口子刃自死角连绵穿透——又添 " + volley + " 点伤害！", "info");
        }
        p.combat.hp -= dmg;
        GAME.UI.log(r.crit
            ? "你法诀一引，灵光如虹正中要害！对【" + p.combat.name + "】造成 " + dmg + " 点重创！"
            : "你斗法一击，对【" + p.combat.name + "】造成 " + dmg + " 点伤害。",
            r.crit ? "success" : "info");

        // 云京皇宫：幽冥教主双阶段状态机（血量跌破 30% 触发血祭狂暴）
        if (GAME.Heisha && p.combat.heishaBoss) GAME.Heisha.onBossDamaged();
        if (p.combat.hp <= 0) return this.victory();
        this.enemyTurn();
    },

    // ---------- 顶阶法器：多线操控判定 ----------
    _multiHitId: function () {
        var p = GAME.State.p();
        var cand = [p.equipment && p.equipment.mainWeapon, p.equipment && p.equipment.artifact, p.artifact, p.artifact2];
        for (var i = 0; i < cand.length; i++) {
            var id = cand[i];
            if (id && GAME.DATA.ITEMS[id] && GAME.DATA.ITEMS[id].multiHit) return id;
        }
        return null;
    },
    _hasMultiHit: function () { return !!this._multiHitId(); },

    // ---------- 遮天钟：激活 / 收起【金钟庇护】 ----------
    toggleBell: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        var id = this._bellId();
        if (!id) { GAME.UI.log("你并未携带【遮天钟】。", "system"); return; }
        p.combat.zhetian = !p.combat.zhetian;
        if (p.combat.zhetian) {
            GAME.UI.log("你祭起【遮天钟】，钟影罩身——【金钟庇护】！此后免疫一切负面与控制，但你也无从出招，只可倚仗傀儡与噬金虫耗敌。", "success");
        } else {
            GAME.UI.log("你收了遮天钟，重执攻势。", "info");
        }
        GAME.UI.updateUI();
    },
    _bellId: function () {
        var p = GAME.State.p();
        var cand = [p.equipment && p.equipment.mainWeapon, p.equipment && p.equipment.artifact, p.artifact, p.artifact2];
        for (var i = 0; i < cand.length; i++) {
            var id = cand[i];
            if (id && GAME.DATA.ITEMS[id] && GAME.DATA.ITEMS[id].bell) return id;
        }
        return null;
    },

    // ---------- 符宝：祭起（蓄力 1 回合，此间闪避率降为 0） ----------
    useFuBao: function (id) {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        if (p.combat.fubaoCharged) { GAME.UI.log("符宝已然祭起，只待下一回合倾泻威能。", "system"); return; }
        var item = GAME.DATA.ITEMS[id];
        if (!item || item.type !== "fubao") return;
        if (GAME.State.countItem(id) <= 0) { GAME.UI.log("你身上没有【" + item.name + "】。", "system"); return; }
        // 首次祭起：按 maxDurability 初始化威能值
        p.fubao = p.fubao || {};
        if (p.fubao[id] == null) p.fubao[id] = item.maxDurability || 100;
        p.combat.fubaoCharged = id;
        p.combat.evadeLock = true;   // 蓄力期间自身闪避率降为 0
        GAME.UI.log("你双手结印祭起【" + item.name + "】——符光冲天，威能蓄势待发！（本回合全力催动，闪避尽失，下一回合倾泻毁灭一击）", "danger");
        GAME.UI.updateUI();
        this.enemyTurn();
    },

    // ---------- 符宝：释放毁灭打击（400%~600% 暴击伤害，扣 25 点威能） ----------
    _releaseFuBao: function (s) {
        var p = GAME.State.p();
        var id = p.combat.fubaoCharged;
        var item = GAME.DATA.ITEMS[id];
        p.combat.fubaoCharged = null;
        p.combat.evadeLock = false;
        if (!item) return this.enemyTurn();

        var fb = item.fubao || { dmgMul: [4, 6], drain: 25 };
        s = s || GAME.State.getStats();
        var base = this.calcDamage(s.atk, GAME.Cultivation ? GAME.Cultivation.effectiveDef(p.combat.def_) : p.combat.def_,
            s.spirit, p.combat.spirit, 1);   // 必暴击（bonusCrit 拉满）
        var mul = fb.dmgMul[0] + Math.random() * (fb.dmgMul[1] - fb.dmgMul[0]);
        var dmg = Math.round(base.dmg * mul);
        dmg = Math.round(dmg * this.realmDamageMul(p.combat.playerMajor, p.combat.monsterMajor));
        p.combat.hp -= dmg;

        // 威能损耗：每次施展 -25，归零则符宝自燃化灰，从背包彻底移除
        p.fubao = p.fubao || {};
        var left = (p.fubao[id] != null ? p.fubao[id] : (item.maxDurability || 100)) - (fb.drain || 25);
        if (left <= 0) {
            p.fubao[id] = 0;
            GAME.State.removeItem(id, 1);
            delete p.fubao[id];
            GAME.UI.log("【" + item.name + "】符光暴涨，一击轰出 " + dmg + " 点毁灭伤害——威能耗尽，符宝自燃化灰，就此消散！", "danger");
        } else {
            p.fubao[id] = left;
            GAME.UI.log("【" + item.name + "】符光暴涨，一击轰出 " + dmg + " 点毁灭伤害！（威能余 " + left + "/" + (item.maxDurability || 100) + "）", "success");
        }
        // 落魂钟：附带眩晕
        if (fb.stun) {
            p.combat.stun = { turns: fb.stun };
            GAME.UI.log("钟声荡魂——【" + p.combat.name + "】神魂震荡，陷入【眩晕】" + fb.stun + " 回合！", "success");
        }
        if (GAME.Heisha && p.combat.heishaBoss) GAME.Heisha.onBossDamaged();
        if (p.combat.hp <= 0) return this.victory();
        this.enemyTurn();
    },

    // ---------- 玩家行动 2：使用符箓（展开背包符箓列表） ----------
    toggleTalismans: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        p.combat.talismanOpen = !p.combat.talismanOpen;
        GAME.UI.updateUI();
    },

    useTalisman: function (id) {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        var item = GAME.DATA.ITEMS[id];
        if (!item || !GAME.State.removeItem(id)) return;
        var c = item.combat || {};
        p.combat.talismanOpen = false;

        if (c.dmg) {
            p.combat.hp -= c.dmg;
            GAME.UI.log("你捏碎【" + item.name + "】，一道火光呼啸而出，对【" + p.combat.name + "】造成 " + c.dmg + " 点伤害！", "success");
            if (p.combat.hp <= 0) return this.victory();
        }
        if (c.shield) {
            p.combat.shield += c.shield;
            GAME.UI.log("你祭起【" + item.name + "】，一层金光罡气护住周身（罡气 +" + c.shield + "）。", "success");
        }
        if (c.stun) {
            p.combat.stun = { turns: c.stun };
            GAME.UI.log("【" + item.name + "】符光落地，【" + p.combat.name + "】身形被生生钉住（定身 " + c.stun + " 回合）！", "success");
        }
        this.enemyTurn();
    },

    // ---------- 玩家行动 2c：施放术法（苍南小会习得，可反复施放、有冷却） ----------
    toggleSpells: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        p.combat.spellOpen = !p.combat.spellOpen;
        GAME.UI.updateUI();
    },

    castSpell: function (id) {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        if (p.combat.exhausted) return this._consumeExhausted();   // 脱力时连法诀都掐不成
        var spell = GAME.DATA.SPELLS && GAME.DATA.SPELLS[id];
        if (!spell || !(p.spells && p.spells[id])) {
            GAME.UI.log("你并未习得此术。", "system");
            GAME.UI.updateUI();
            return;
        }
        p.combat.spellReady = p.combat.spellReady || {};
        var ready = p.combat.spellReady[id] || 0;
        if (p.combat.round < ready) {
            GAME.UI.log("【" + spell.name + "】法力未复，还需 " + (ready - p.combat.round) + " 回合（冷却 " + spell.cd + " 回合）。", "system");
            GAME.UI.updateUI();
            return;
        }
        p.combat.spellReady[id] = p.combat.round + spell.cd;
        p.combat.spellOpen = false;
        var sd = spell.dmg;
        if (p.combat.thickShell) sd = Math.round(sd * 1.5); // 厚甲妖壳弱点为烈火法术
        p.combat.hp -= sd;
        GAME.UI.log("你掐诀一声「疾」，一团赤红火球呼啸而出！对【" + p.combat.name + "】造成 " + sd + " 点伤害。", "success");
        if (p.combat.hp <= 0) return this.victory();
        this.enemyTurn();
    },

    // ---------- 玩家行动 2b：涂抹毒囊（战斗首回合，使敌持续中毒） ----------
    coatPoison: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        if (p.combat.round > 1) { GAME.UI.log("毒囊须趁首回合涂抹，此时已失先机。", "system"); return; }
        // 找到背包里第一枚可用毒囊
        var id = null;
        for (var k in p.inventory) {
            var it = GAME.DATA.ITEMS[k];
            if (it.type === "poison" && it.combat && it.combat.poison) { id = k; break; }
        }
        if (!id) { GAME.UI.log("你身上没有可作暗器的毒囊。", "system"); return; }
        if (!GAME.State.removeItem(id)) return;
        var pc = GAME.DATA.ITEMS[id].combat.poison;
        p.combat.poison = { turns: pc.turns, dmg: pc.dmg };
        GAME.UI.log("你捏碎【" + GAME.DATA.ITEMS[id].name + "】抹于剑刃，寒芒染毒——对手每回合将流失 " + pc.dmg + " 气血，持续 " + pc.turns + " 回合。", "success");
        this.enemyTurn();
    },

    // ---------- 玩家行动 4：濒死自爆法器（绝境反杀） ----------
    // 条件：气血 ≤ 25% 且身负法器。摧毁法器，对敌造成 300% 攻击的不可减免伤害。
    detonate: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        if (!p.artifact) { GAME.UI.log("你手中无法器可爆。", "system"); return; }
        if (p.currentHp > p.maxHp * 0.25) { GAME.UI.log("尚未到绝境，自爆法器徒留笑柄。", "system"); return; }
        var bonus = (GAME.DATA.ITEMS[p.artifact].equip.atk || 0) * 3;
        var name = GAME.DATA.ITEMS[p.artifact].name;
        // 摧毁法器：移出背包与装备，耐久清零
        GAME.State.removeItem(p.artifact);
        p.artifact = null;
        p.artifactDurability = 0;
        p.combat.hp -= bonus;
        GAME.UI.log("你咬牙催动禁法，【" + name + "】轰然自爆！恐怖冲击波直贯【" + p.combat.name + "】，造成 " + bonus + " 点不可减免重创！", "danger");
        if (p.combat.hp <= 0) return this.victory();
        this.enemyTurn();
    },

    // ---------- 流烟步反噬：脱力跳过本回合 ----------
    _consumeExhausted: function () {
        var p = GAME.State.p();
        p.combat.exhausted = false;
        GAME.UI.log("流烟步反噬发作，你脱力难动，只能勉力招架！", "warning");
        return this.enemyTurn();
    },

    // ---------- 玩家行动：流烟步（耗 30% 气血本回合规避，下回合脱力） ----------
    luoyan: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        if (p.combat.exhausted) return this._consumeExhausted();
        if (p.combat.usedLuoyan) { GAME.UI.log("流烟步反噬未消，强行再施展只会自伤。", "system"); return; }
        var cost = Math.max(1, Math.ceil(p.currentHp * 0.30));
        p.currentHp -= cost;
        if (p.currentHp <= 0) p.currentHp = 1;   // 流烟步不致自伤致死
        p.combat.evade = true;        // 本回合敌方攻击落空
        p.combat.exhausted = true;    // 下回合脱力
        p.combat.usedLuoyan = true;
        GAME.UI.log("你身形一晃使出《流烟步》，气血翻涌耗去三成（" + cost + "），换得本回合全身而退！然身法反噬，下回合脱力难动。", "info");
        this.enemyTurn();
    },

    // ---------- 玩家行动：眨眼剑法（耗反光短剑，白日使敌目眩 2 回合） ----------
    useBlinkSword: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        if (p.combat.exhausted) return this._consumeExhausted();
        if (p.combat.immuneBlind) { GAME.UI.log("对方残魂不灭，目眩之术对其形同虚设！", "system"); return; }
        var sk = GAME.DATA.SKILLS && GAME.DATA.SKILLS.blink_sword;
        if (!sk) return;
        if (!p.combat.day) { GAME.UI.log("夜色沉沉，反光短剑无从折射日光，眨眼剑法无从施展。", "system"); return; }
        if (GAME.State.countItem(sk.item) <= 0) { GAME.UI.log("你身上没有【" + GAME.DATA.ITEMS[sk.item].name + "】可供施展。", "system"); return; }
        GAME.State.removeItem(sk.item);
        p.combat.blind = { turns: sk.blindTurns };
        GAME.UI.log("你挥出【反光短剑】，日光一折，【" + p.combat.name + "】双目刺痛陷入【目眩】，两回合内命中大减！", "success");
        this.enemyTurn();
    },

    // ---------- 随从指令：玄傀肉身抵挡（本回合替玩家扛物理单体伤害） ----------
    companionBlock: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        if (p.combat.exhausted) return this._consumeExhausted();
        if (!p.companion || p.companion.hp <= 0) { GAME.UI.log("玄傀不在身旁，无从护持。", "system"); return; }
        if (p.combat.blockNext) { GAME.UI.log("玄傀已横挡在前，静待敌袭。", "system"); return; }
        p.combat.blockNext = true;
        GAME.UI.log("你低喝一声，玄傀铁躯不退反进，挡在你身前！", "info");
        this.enemyTurn();
    },

    // ---------- 随从指令：玄傀象甲重击（按生命上限钝击） ----------
    companionSmash: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        if (p.combat.exhausted) return this._consumeExhausted();
        if (!p.companion || p.companion.hp <= 0) { GAME.UI.log("玄傀不在身旁，无从出招。", "system"); return; }
        var dmg = Math.round(p.companion.maxHp * 0.30);   // 基于生命上限的钝击
        p.combat.hp -= dmg;
        GAME.UI.log("玄傀玄龟功催动，铁拳如锤轰在【" + p.combat.name + "】身上，造成 " + dmg + " 点钝击！", "success");
        if (p.combat.hp <= 0) return this.victory();
        this.enemyTurn();
    },

    // ---------- 玩家行动 3：遁走（受双方速度差影响） ----------
    flee: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        if (p.combat.moEvent) { GAME.UI.log("玄机子魔银手封死退路，你无从遁走！唯有死战或撞入识海。", "danger"); return; }
        var s = GAME.State.getStats();
        var chance = Math.min(0.9, Math.max(0.1, 0.4 + (s.speed - p.combat.speed) * 0.05));
        // 踏云靴：撤退成功率提升至 90%
        var boots = [p.equipment && p.equipment.armor, p.equipment && p.equipment.mainWeapon, p.equipment && p.equipment.artifact, p.artifact, p.artifact2];
        for (var bi = 0; bi < boots.length; bi++) {
            var bit = boots[bi] && GAME.DATA.ITEMS[boots[bi]];
            if (bit && bit.travel && bit.travel.fleeBonus) chance = Math.max(chance, bit.travel.fleeBonus);
        }
        if (Math.random() < chance) {
            GAME.UI.log("你御风而逃，成功甩脱【" + p.combat.name + "】！狼狈，但性命保住了。", "system");
            return this.end();
        }
        GAME.UI.log("遁走失败！对方一记法术轰在你退路上，不得不回身再战！", "danger");
        this.enemyTurn();
    },

    // ---------- 敌方回合（毒发/流血 → 流烟步规避 → 罡气抵伤 → 法器耐久 → 玄傀抵挡 → 敌方出手） ----------
    enemyTurn: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;
        // 《青冥剑诀》护体剑盾：每过一个玩家回合，持续回合 -1
        if (GAME.Cultivation) GAME.Cultivation.tickShield();

        // 1) 毒囊 / 淬毒筒 持续伤害（每回合结算，先于敌方行动）
        if (p.combat.poison && p.combat.poison.turns > 0) {
            p.combat.hp -= p.combat.poison.dmg;
            p.combat.poison.turns -= 1;
            GAME.UI.log("毒发！【" + p.combat.name + "】脸色青黑，又流失 " + p.combat.poison.dmg + " 点气血。", "warning");
            if (p.combat.hp <= 0) return this.victory();
        }
        if (p.combat.bleed && p.combat.bleed.turns > 0) {
            p.combat.hp -= p.combat.bleed.dmg;
            p.combat.bleed.turns -= 1;
            GAME.UI.log("【" + p.combat.name + "】毒创迸裂，又流失 " + p.combat.bleed.dmg + " 点气血。", "warning");
            if (p.combat.hp <= 0) return this.victory();
        }

        // 2) 定身符：敌方整个回合无法出手（先于流烟步与命中判定）
        if (p.combat.stun && p.combat.stun.turns > 0) {
            p.combat.stun.turns -= 1;
            GAME.UI.log("【" + p.combat.name + "】被符光钉在原地，挣扎不得，这一回合就此错过！", "info");
            p.combat.round += 1;
            GAME.UI.autoSave();
            GAME.UI.updateUI();
            return;
        }

        // 3) 流烟步：本回合敌方攻击尽数落空（脱力标记已在 luoyan() 设好）
        if (p.combat.evade) {
            p.combat.evade = false;
            GAME.UI.log("你身形飘忽，【" + p.combat.name + "】的攻势尽数落空！", "info");
            p.combat.round += 1;
            GAME.UI.autoSave();
            GAME.UI.updateUI();
            return;
        }

        var s = GAME.State.getStats();
        // 越级（怪大境高于玩家）：命中率阶梯削减 50%
        var mCross = this.realmCrossPenalty(p.combat.monsterMajor, p.combat.playerMajor);
        // 4) 敌方命中：受【目眩】影响（眨眼剑法 -70% 命中）
        var enemyHit = 0.88 * mCross;
        if (p.combat.blind && p.combat.blind.turns > 0) {
            var pen = (GAME.DATA.SKILLS && GAME.DATA.SKILLS.blink_sword) ? GAME.DATA.SKILLS.blink_sword.blindHitPenalty : 0.70;
            enemyHit *= (1 - pen);
            p.combat.blind.turns -= 1;
        }
        if (Math.random() > enemyHit) {
            GAME.UI.log("【" + p.combat.name + "】一击落空，被你闪过！", "info");
            p.combat.round += 1;
            GAME.UI.autoSave();
            GAME.UI.updateUI();
            return;
        }
        // 《御风诀》：驭风轻身，三成攻势被飘身避过
        if (p.spells && p.spells.yufeng_shu && GAME.DATA.SPELLS.yufeng_shu &&
            Math.random() < GAME.DATA.SPELLS.yufeng_shu.dodge) {
            GAME.UI.log("你驭风身形一晃，【" + p.combat.name + "】的攻势从袖边掠空而过！（御风诀闪避）", "info");
            p.combat.round += 1;
            GAME.UI.autoSave();
            GAME.UI.updateUI();
            return;
        }

        // 魔化狂暴：HP<30% 时攻击暴涨一倍（仅触发一次播报）
        var atkCalc = p.combat.atk;
        if (p.combat.berserk && p.combat.hp <= p.combat.maxHp * 0.3 && !p.combat.berserkMsg) {
            p.combat.berserkMsg = true;
            GAME.UI.log("【" + p.combat.name + "】血色翻涌，魔化狂暴！攻击暴涨一倍！", "danger");
        }
        if (p.combat.berserk && p.combat.hp <= p.combat.maxHp * 0.3) atkCalc = Math.round(atkCalc * 2);
        var r = this.calcDamage(atkCalc, s.def, p.combat.spirit, s.spirit);
        // 境界绝对压制（守方视角）：玩家为高境界时，受练气等低境攻击触发 defSuppress 分层免伤
        var finalDmg = Math.round(r.dmg * this.realmDefSuppress(p.realmIndex));
        // 噬金虫云：无视目标护体灵光，每回合融毁敌方护盾与防御法器耐久（战斗协同）
        if (p.combat.insectCloud && GAME.Insect) {
            GAME.Insect.corrode(p.combat);
        }

        // 5) 玄傀肉身抵挡：伤害转移至玄傀（玄龟功高免伤，仅实损三成）
        if (p.combat.blockNext && p.companion && p.companion.hp > 0) {
            p.combat.blockNext = false;
            var real = Math.round(finalDmg * 0.3);
            p.companion.hp -= real;
            GAME.UI.log("玄傀铁躯横挡，替你扛下 " + finalDmg + " 点伤害（玄龟功卸去七成，实损 " + real + "）！", "info");
            if (p.companion.hp <= 0) { p.companion.hp = 0; GAME.UI.log("玄傀重伤不支，暂退一旁。", "warning"); }
            p.combat.round += 1;
            GAME.UI.autoSave();
            GAME.UI.updateUI();
            return;
        }

        if (p.combat.shield > 0) {
            var absorbed = Math.min(p.combat.shield, finalDmg);
            p.combat.shield -= absorbed;
            finalDmg -= absorbed;
            if (absorbed > 0) GAME.UI.log("护身罡气挡下 " + absorbed + " 点伤害。", "info");
        }
        // 《青冥剑诀》护体剑盾：吸收 25% 物理穿刺伤害
        if (GAME.Cultivation && p.combat.swordShield && finalDmg > 0) {
            var sAbs = GAME.Cultivation.shieldAbsorb(finalDmg);
            if (sAbs > 0) {
                finalDmg -= sAbs;
                GAME.UI.log("三面青色剑盾一旋，卸去 " + sAbs + " 点穿刺伤害。", "info");
            }
        }
        if (finalDmg > 0) {
            p.currentHp -= finalDmg;
            // 幽冥教主【混元血炼珠】：所受伤害 100% 转化为自身生命恢复（被引魔入阵封印后失效）
            if (GAME.Heisha && p.combat.heishaBoss && !p.combat.arraySealed && finalDmg > 0) {
                var drain = Math.min(finalDmg, p.combat.maxHp - p.combat.hp);
                if (drain > 0) {
                    p.combat.hp += drain;
                    GAME.UI.log("【混元血炼珠】血光倒卷——你所失 " + drain + " 点气血，尽数化作对方生机！（可【引魔入阵】封印其吸血）", "danger");
                }
            }
            // 6) 法器耐久（含控物术第二法器）：承受到较重一击（>10）时损耗 1 点，归零则法器崩碎
            var slots = [["artifact", "artifactDurability"], ["artifact2", "artifact2Durability"]];
            for (var si = 0; si < slots.length; si++) {
                var slotId = slots[si][0], slotDur = slots[si][1];
                if (p[slotId] && p[slotDur] > 0 && finalDmg > 10) {
                    p[slotDur] -= 1;
                    if (p[slotDur] <= 0) {
                        GAME.UI.log("【" + GAME.DATA.ITEMS[p[slotId]].name + "】灵光骤黯，竟在重击中断裂损毁！", "danger");
                        GAME.State.removeItem(p[slotId]);
                        p[slotId] = null;
                    } else {
                        GAME.UI.log("【" + GAME.DATA.ITEMS[p[slotId]].name + "】格挡重击，灵纹微损（耐久 " + p[slotDur] + "）。", "info");
                    }
                }
            }
            GAME.UI.log(r.crit
                ? "【" + p.combat.name + "】暴起发难，一击撕裂你的护体灵光！你损失 " + finalDmg + " 点气血！"
                : "【" + p.combat.name + "】出手攻击，你损失 " + finalDmg + " 点气血。",
                "danger");
        } else {
            GAME.UI.log("【" + p.combat.name + "】的攻势被尽数挡下，未伤你分毫。", "info");
        }

        if (p.currentHp <= 0) return this.defeat();
        p.combat.round += 1;
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 发放战利品：ratio 为获取比例（留活口时只拿六成） ----------
    grantLoot: function (loot, ratio, def) {
        ratio = ratio || 1;
        for (var i = 0; i < loot.length; i++) {
            var l = loot[i];
            if (Math.random() < l.chance * ratio) {
                var qty = this.rand(l.qty[0], l.qty[1]);
                if (qty > 0) {
                    GAME.State.addItem(l.id, qty);
                    GAME.UI.log("意外之喜！获得【" + GAME.DATA.ITEMS[l.id].name + "】×" + qty + "。", "loot");
                }
            }
        }
        // 筑基期材料闭环：妖兽精魄 / 魔修材料（def 缺省则不结算，保持旧行为）
        if (def) this.materialDrops(def, ratio);
    },

    /* ---------- 筑基期材料掉落：妖兽精魄 / 魔修材料 ----------
     * 1) 二阶及以上妖兽（isBeast && tier>=2）：40% 掉【妖兽精魄】×1；
     *    若神识上限 ≥ 25（筑基神识大成），以「搜神拘魂」之法 100% 拘得，不再看运气。
     * 2) 魔焰门 / 鬼灵门筑基修士：分别有几率掉【天火晶】/【阴魂精魄】。
     * ratio：留活口时只有六成机率（不取魂）。
     */
    materialDrops: function (def, ratio) {
        if (!def) return;
        ratio = (ratio == null) ? 1 : ratio;
        var p = GAME.State.p();

        if (def.isBeast && (def.tier || 1) >= 2) {
            var spLimit = GAME.State.spLimit ? GAME.State.spLimit() : 0;
            if (spLimit >= 25) {
                GAME.State.addItem("beast_soul", 1);
                GAME.UI.log("你神识如网铺开，趁妖魂未散一举拘入掌中——【搜神拘魂】得【妖兽精魄】×1。", "loot");
            } else if (Math.random() < 0.40 * ratio) {
                GAME.State.addItem("beast_soul", 1);
                GAME.UI.log("妖兽眉心一点魂光未散，被你以灵力裹住收起——获得【妖兽精魄】×1。", "loot");
            } else {
                GAME.UI.log("妖魂逸散于风中，你神识不足，未能拘住分毫。", "system");
            }
        }

        if (def.foundation && def.moSect === "moyan" && Math.random() < 0.35 * ratio) {
            GAME.State.addItem("tianhuo_crystal", 1);
            GAME.UI.log("你剖开魔焰门修士丹田，取出一枚灼热结晶——获得【天火晶】×1。", "loot");
        }
        if (def.foundation && def.moSect === "guiling" && Math.random() < 0.30 * ratio) {
            GAME.State.addItem("yin_hun_soul", 1);
            GAME.UI.log("鬼灵门修士丹田阴魂凝而不散，被你以符封住——获得【阴魂精魄】×1。", "loot");
        }
    },

    // ---------- 战胜：搜刮战利品（杀人夺宝） ----------
    victory: function () {
        var p = GAME.State.p();
        var def = p.combat.def;
        var ctx = p.combat.ctx;
        GAME.UI.log("【" + p.combat.name + "】轰然倒地！", "success");
        if (GAME.Moments) GAME.Moments.fire("first_kill", p.combat.name);
        p.currentExp += def.exp;
        GAME.UI.log("斗法之余灵台清明，修为增加 " + def.exp + " 点。", "success");
        var stones = this.rand(def.stones[0], def.stones[1]);

        // 景阳城玄机世家主线 / 升仙大会擂台 / 血色禁地：直接入袋，交还对应模块继续剧情
        // （不走"杀/放"抉择——此三者由剧情验收，不是随机遭遇）
        if (ctx && (ctx.type === "jiayuan" || ctx.type === "leitai" || ctx.type === "fzone" || ctx.type === "mansion" || ctx.type === "heisha" || ctx.type === "bonds" || ctx.type === "hunt" || ctx.type === "relic")) {
            p.spiritStones += stones;
            p.stats.kills += 1;
            this.grantLoot(def.loot, 1, def);
            this.end();
            if (ctx.type === "jiayuan") GAME.Jiayuan.afterCombat(true, ctx);
            else if (ctx.type === "leitai") GAME.Tainan.afterCombat(true, ctx);
            else if (ctx.type === "mansion") GAME.Mansion.afterCombat(true, ctx);
            else if (ctx.type === "heisha") GAME.Heisha.afterCombat(true, ctx);
            else if (ctx.type === "relic") GAME.Relic.afterCombat(true, ctx);
            else if (ctx.type === "bonds") GAME.Bonds.nangongwanWin();
            else if (ctx.type === "hunt") GAME.Hunt.afterCombat(true, ctx);
            else GAME.FZone.afterCombat(true, ctx);
            return;
        }

        // 试炼中的死斗：直接夺宝（不弹杀/放抉择），结算后交还试炼模块
        if (p.combat.trial) {
            p.spiritStones += stones;
            GAME.UI.log("你从尸身上搜出 " + stones + " 枚灵石。", "loot");
            this.grantLoot(def.loot, 1, def);
            p.stats.kills += 1;
            this.end();
            GAME.Trial.afterCombat(true);
            return;
        }

        // 玄机子之战：制服魔银手后交还关卡模块，不再走常规搜刮
        if (p.combat.moEvent) {
            p.stats.kills += 1;
            this.end();
            GAME.MoEvent.afterStage2Win();
            return;
        }

        // 若是"人"，战利品延后到玩家处置之后再发
        if (def.human) {
            p.pendingMercy = { monsterId: def.id, stones: stones };
            GAME.UI.log("对方跪地求饶：「道友饶命……财物尽可取去，只求留条活路。」", "system");
            this.end();
            return;
        }
        p.spiritStones += stones;
        GAME.UI.log("你从尸身上搜出 " + stones + " 枚灵石。", "loot");
        this.grantLoot(def.loot, 1, def);
        p.stats.kills += 1;
        this.end();
    },

    // ---------- 战败：折寿 / 被抢 / 概率身陨 ----------
    defeat: function () {
        var p = GAME.State.p();
        var def = p.combat.def;
        var ctx = p.combat.ctx;
        if (p.combat.trial) p.trial = null;   // 试炼中身陨，试炼随之终结

        // 玄机子之战：玩家气血耗尽不判定死亡，撞入识海元神大逃杀
        if (p.combat.moEvent && p.moEvent && p.moEvent.stage === 2) {
            this.end();
            GAME.MoEvent.enterSoul();
            return;
        }

        // 玄机世家主线 / 升仙擂台 / 血色禁地：败北不判当场身陨（剧情尚有转圜），按常规折寿失财处理
        var routed = !!ctx && (ctx.type === "jiayuan" || ctx.type === "leitai" || ctx.type === "fzone" || ctx.type === "mansion" || ctx.type === "heisha" || ctx.type === "bonds" || ctx.type === "hunt" || ctx.type === "relic");

        // 血色禁地：败北由禁地模块全权结算软着陆（玄傀护主背出 / 弃药保命），不走通用折寿失财
        if (routed && ctx.type === "fzone") {
            this.end();
            GAME.FZone.afterCombat(false, ctx);
            return;
        }

        // 狩猎场：败北软着陆——重伤退出，本轮进度清空，不判死
        if (routed && ctx.type === "hunt") {
            this.end();
            GAME.Hunt.afterCombat(false, ctx);
            return;
        }

        // 墨府探查：败北由探查模块结算（被巡卫逐出府外），不判当场身陨
        if (routed && ctx.type === "mansion") {
            this.end();
            GAME.Mansion.afterCombat(false, ctx);
            return;
        }

        // 古修遗迹：败北由遗迹模块结算（重伤退出、战利品散失，不判当场身陨）
        if (routed && ctx.type === "relic") {
            this.end();
            GAME.Relic.afterCombat(false, ctx);
            return;
        }

        if (!routed && Math.random() < def.killChance) {
            // 玄傀护主软着陆：斩杀先由铁奴挡下，玩家重伤保命
            if (GAME.Core.tryRescue()) {
                GAME.UI.log("【" + def.name + "】眼中凶光一闪落井下石——却被玄傀以命相抵！你拖着残躯逃出生天。", "danger");
                this.end();
                return;
            }
            p.currentHp = 0;   // 落井下石，当场身陨
            p.isDead = true;
            p.deathReason = "斗法败于【" + def.name + "】之手";
            GAME.UI.log("【" + def.name + "】眼中凶光一闪，落井下石——你重伤难支，道消身陨！修仙界便是如此残酷。", "danger");
            this.end();
            return;
        }
        var pct = def.loseStonePct[0] + Math.random() * (def.loseStonePct[1] - def.loseStonePct[0]);
        var lostStones = Math.floor(p.spiritStones * pct);
        p.spiritStones -= lostStones;
        var lostAge = this.rand(def.loseAge[0], def.loseAge[1]);
        p.ageYears += lostAge;   // 伤及根基，直接折寿
        p.currentHp = Math.max(1, Math.ceil(p.maxHp * 0.1)); // 重伤垂死，勉强爬回
        GAME.UI.log("你力竭倒地！【" + def.name + "】搜刮了你 " + lostStones + " 枚灵石，冷笑而去。", "danger");
        GAME.UI.log("此战伤了根基，折损寿元 " + lostAge + " 年！你拖着残躯爬回住处。", "danger");
        this.end();
        GAME.Core.checkDeath();

        if (!p.isDead && routed) {
            if (ctx.type === "jiayuan") GAME.Jiayuan.afterCombat(false, ctx);
            else GAME.Tainan.afterCombat(false, ctx);
        }
    },

    end: function () {
        var p = GAME.State.p();
        p.combat = null;
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 工具 ----------
    rand: function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
};
