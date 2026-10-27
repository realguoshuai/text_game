/* =========================================================
 * js/dungeon_heisha.js —— 云京皇宫 · 夜战幽冥教（阶段性推进副本）
 *
 * 阶段一：分破四大血侍（每破一人削弱 Boss 增益光环）
 * 阶段二：斩血玉蜘蛛，破地宫甬道的蛛网封印（不斩此蛛，寝殿无路可入）
 * 阶段三：决战幽冥教主（越皇）——双阶段状态机 + 颠倒五行阵引魔入阵
 * 战斗回调：Combat.victory 依据 ctx.type === "heisha" 路由至本模块 afterCombat
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Heisha = {

    cfg: function () { return GAME.DATA.HEISHA; },

    // ---------- 副本状态（懒初始化） ----------
    state: function () {
        var p = GAME.State.p();
        if (!p.heisha) {
            p.heisha = { stage: 1, guards: {}, spiderDone: false, bossDone: false, array: false, arrayUsed: false };
        }
        if (p.heisha.guards == null) p.heisha.guards = {};
        // 旧档补字段：血玉蜘蛛阶段是后加的，没有这个键就当"未破"（存档不写死版本号）
        if (p.heisha.spiderDone == null) p.heisha.spiderDone = false;
        return p.heisha;
    },

    // ---------- 准入：筑基以上 ----------
    canEnter: function () {
        var p = GAME.State.p();
        return !p.isDead && !p.combat && p.realmIndex >= 13;
    },

    start: function () {
        var p = GAME.State.p();
        // 已平定：地宫封了。旧版没有这道闸，通关后再点一次「夜探皇宫」
        // 就会把开场那两句「夜色如墨……四名血侍分守京城四处据点」原样重念一遍，
        // 于是见闻录末尾凭空多出一段"故事倒带"。
        if (p.heisha && p.heisha.bossDone) {
            GAME.UI.log("地宫石门已被镇封，皇城重归安宁——那一战，你已了结。", "system");
            GAME.UI.updateUI();
            return false;
        }
        if (!this.canEnter()) {
            GAME.UI.log("血气未足、境界尚浅——云京皇宫那一战，非筑基修士不可涉足。", "system");
            GAME.UI.updateUI();
            return false;
        }
        this.state();
        GAME.UI.log("【" + this.cfg().title + "】夜色如墨，皇城深处隐隐有血光冲天。", "danger");
        GAME.UI.log("四名血侍分守京城四处据点，须逐一破之，方可直入地宫面见那位「越皇」。", "info");
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 已破血侍数 ----------
    guardsDown: function () {
        var st = this.state(), n = 0, g = this.cfg().guards;
        for (var i = 0; i < g.length; i++) if (st.guards[g[i].id]) n += 1;
        return n;
    },
    allGuardsDown: function () {
        return this.guardsDown() >= this.cfg().guards.length;
    },

    // ---------- 阶段一：挑战血侍 ----------
    challenge: function (guardId) {
        var p = GAME.State.p();
        var st = this.state();
        if (!this.canEnter()) return false;
        var g = null, list = this.cfg().guards;
        for (var i = 0; i < list.length; i++) if (list[i].id === guardId) g = list[i];
        if (!g) return false;
        if (st.guards[guardId]) {
            GAME.UI.log("【" + g.name + "】已然伏诛，此地只余一地狼藉。", "system");
            GAME.UI.updateUI();
            return false;
        }
        GAME.UI.log("你循着血气摸到【" + g.name + "】的据点——" + g.hint, "warning");
        p.combatRoute = { type: "heisha", kind: "guard", guardId: guardId };
        GAME.Combat.start(guardId);
        return true;
    },

    // ---------- 阶段二：血玉蜘蛛（地宫甬道·蛛网封印） ----------
    spiderDown: function () { return !!this.state().spiderDone; },

    fightSpider: function () {
        var p = GAME.State.p();
        var st = this.state();
        if (!this.canEnter()) return false;
        if (!this.allGuardsDown()) {
            GAME.UI.log("四大血侍尚在宫中横行——甬道入口未现。（已破 " +
                this.guardsDown() + "/" + this.cfg().guards.length + "）", "danger");
            GAME.UI.updateUI();
            return false;
        }
        if (st.spiderDone) {
            GAME.UI.log("甬道里只剩一堆碎壳与枯丝，再无阻拦。", "system");
            GAME.UI.updateUI();
            return false;
        }
        GAME.UI.log("你转过寝殿外的石阶，甬道顶垂下一片赤色蛛网——" + this.cfg().spider.name +
            "自暗处落下来，八足碾碎石屑。", "warning");
        p.combatRoute = { type: "heisha", kind: "spider" };
        GAME.Combat.start(this.cfg().spider.id);
        return true;
    },

    // ---------- 战前布置：颠倒五行阵残阵 ----------
    setArray: function () {
        var p = GAME.State.p();
        var st = this.state();
        var itemId = this.cfg().array.item;
        if (st.array) {
            GAME.UI.log("残阵早已布下，只待引魔入阵。", "system");
            GAME.UI.updateUI();
            return false;
        }
        if (GAME.State.countItem(itemId) <= 0) {
            GAME.UI.log("你并未携带【颠倒五行阵残阵】——此阵须得事先备下。", "system");
            GAME.UI.updateUI();
            return false;
        }
        GAME.State.removeItem(itemId, 1);
        st.array = true;
        GAME.UI.log("你于地宫四角嵌下阵旗，【颠倒五行阵残阵】悄然成形——只待那魔头踏入，便可引其入阵。", "success");
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 阶段二：决战幽冥教主 ----------
    fightBoss: function () {
        var p = GAME.State.p();
        var st = this.state();
        if (!this.canEnter()) return false;
        if (!this.allGuardsDown()) {
            GAME.UI.log("四名血侍未除，越皇血祭光环正盛——此时闯宫，十死无生。（已破 " +
                this.guardsDown() + "/" + this.cfg().guards.length + "）", "danger");
            GAME.UI.updateUI();
            return false;
        }
        if (!st.spiderDone) {
            GAME.UI.log("寝殿甬道仍被血玉蜘蛛的赤丝封死——不斩此蛛，入不得地宫。", "danger");
            GAME.UI.updateUI();
            return false;
        }
        // 每破一血侍，Boss 增益光环 -10%
        var debuff = this.guardsDown() * this.cfg().guardDebuffPer;
        p.combatRoute = { type: "heisha", kind: "boss" };
        GAME.Combat.start(this.cfg().boss);
        if (!p.combat) return false;
        p.combat.heishaBoss = true;
        p.combat.bossPhase2 = false;
        p.combat.arraySealed = false;
        p.combat.atk = Math.round(p.combat.atk * (1 - debuff));
        p.combat.def_ = Math.round(p.combat.def_ * (1 - debuff));
        // 招式伤害下限也按同一比例削弱（_moveDamage 读这个系数）
        p.combat.threatMul = 1 - debuff;
        if (debuff > 0) {
            GAME.UI.log("四名血侍伏诛，越皇的血祭光环大减——其攻防皆削 " + Math.round(debuff * 100) + "%！", "success");
        }
        GAME.UI.log("地宫深处，越皇自王座上缓缓起身：「来得正好。朕的血炼之术，正缺一位筑基修士的精血。」", "danger");
        if (st.array) GAME.UI.log("（你布下的【颠倒五行阵残阵】就在此处——战斗中可【引魔入阵】。）", "info");
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 战斗中：引魔入阵 ----------
    lureIntoArray: function () {
        var p = GAME.State.p();
        var st = this.state();
        if (!p.combat || !p.combat.heishaBoss) {
            GAME.UI.log("此刻并无强敌可引。", "system");
            return false;
        }
        if (!st.array) {
            GAME.UI.log("你并未布下【颠倒五行阵残阵】，无从引魔。", "system");
            GAME.UI.updateUI();
            return false;
        }
        if (p.combat.arraySealed) {
            GAME.UI.log("对方已陷阵中，五行倒转之势正盛。", "system");
            return false;
        }
        var seal = this.cfg().array.sealPct;
        p.combat.arraySealed = true;
        p.combat.atk = Math.round(p.combat.atk * (1 - seal));
        p.combat.def_ = Math.round(p.combat.def_ * (1 - seal));
        p.combat.spirit = Math.round(p.combat.spirit * (1 - seal));
        // 引魔入阵：招式下限同样封去五成——这才是「阵」值一件残阵灵石的理由
        p.combat.threatMul = (p.combat.threatMul == null ? 1 : p.combat.threatMul) * (1 - seal);
        st.arrayUsed = true;
        GAME.UI.log("你踏动阵旗，五行倒转——【引魔入阵】！越皇身形一滞，被封去五成属性，混元血炼珠的吸血亦被阵势打断！", "success");
        GAME.UI.updateUI();
        return true;
    },

    // ---------- Boss 受伤回调：血祭狂暴变身 ----------
    onBossDamaged: function () {
        var p = GAME.State.p();
        if (!p.combat || !p.combat.heishaBoss || p.combat.bossPhase2) return;
        var ph = this.cfg().phase2;
        if (p.combat.hp > p.combat.maxHp * ph.hpPct) return;
        p.combat.bossPhase2 = true;
        p.combat.atk = Math.round(p.combat.atk * ph.atkMul);
        p.combat.magicResist = ph.magicResist;
        p.combat.name = "黑煞妖魔化·越皇";
        GAME.UI.log("越皇仰天长啸，周身血气炸裂——【血祭狂暴】！他已化作半妖之躯：攻击翻倍，并获得 " +
            Math.round(ph.magicResist * 100) + "% 全法术抗性！", "danger");
    },

    // ---------- 战斗回调（Combat.victory 路由） ----------
    afterCombat: function (win, ctx) {
        var p = GAME.State.p();
        var st = this.state();
        ctx = ctx || {};
        if (!win) return;
        if (ctx.kind === "guard" && ctx.guardId) {
            st.guards[ctx.guardId] = true;
            GAME.UI.log("血侍伏诛！越皇的血祭光环为之一弱。（已破 " +
                this.guardsDown() + "/" + this.cfg().guards.length + "）", "success");
            if (this.allGuardsDown()) {
                GAME.UI.log("四大血侍尽数伏诛——地宫石门轰然洞开，越皇已无处可退！", "danger");
            }
            GAME.UI.updateUI();
            return;
        }
        if (ctx.kind === "spider") {
            st.spiderDone = true;
            GAME.UI.log("血玉蜘蛛腹甲崩裂，赤色蛛网寸寸枯断——通往寝殿的甬道终于敞开。", "success");
            GAME.UI.log("地宫最深处，那股压了整座皇城的血气，第一次显出了裂缝。", "danger");
            GAME.UI.updateUI();
            return;
        }
        if (ctx.kind === "boss") {
            st.bossDone = true;
            var rw = this.cfg().reward;
            (rw.loot || []).forEach(function (l) { GAME.State.addItem(l.id, l.qty || 1); });
            p.sectContrib += rw.contrib || 0;
            GAME.UI.log(rw.text, "story");
            GAME.UI.log("【战役掉落】赤玉蛛卵 ×1、《凝厚宝典》残卷 ×1、中阶灵石 ×3（宗门贡献 +" + (rw.contrib || 0) + "）", "success");
            if (GAME.Codex) GAME.Codex.unlockLore("lore_heisha");
            GAME.UI.updateUI();
            return;
        }
    },
};
