/* =========================================================
 * js/forbidden_zone.js —— 血色禁地·三药田守护兽连战（练气中后期核心副本）
 * 进入条件：练气十层以上（CONFIG.FZONE.enterRealm）。
 * 玩法（纯对战，无迷雾网格、无步数）：禁地内三处药田，各由一头守护兽看守。
 *       玩家自选顺序【闯药田】→ 直接开战 → 胜则夺药，败则软着陆退出。
 *       战间可【调息疗伤】有限次（替代原灵泉眼），亦可随时撤离。
 * 结算：上交三主药 → 正品筑基丹 + 大量贡献；未集齐按阶梯给赏；或私藏带回洞府以绿液续栽。
 * 战败软着陆：有玄傀则被背出禁地休养三月（只折灵石，主药法宝不丢）；无玄傀弃一半药草保命。
 * 战斗经 p.combatRoute={type:"fzone", kind:"herb", herbId} 由 Combat 胜负回调 afterCombat。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.FZone = {

    cfg: function () { return GAME.DATA.CONTENT.FZONE; },

    // ---------- 进入条件 ----------
    canEnter: function () {
        var p = GAME.State.p();
        return !p.isDead && !p.combat && !p.pendingEvent && !p.pendingMercy &&
               !p.trial && !p.fzone && p.realmIndex >= this.cfg().enterRealm;
    },

    // ---------- 入禁地：三处药田待闯 ----------
    start: function () {
        var p = GAME.State.p();
        if (p.realmIndex < this.cfg().enterRealm) {
            GAME.UI.log("需练气十层以上方有本钱踏入血色禁地。", "system");
            GAME.UI.updateUI();
            return;
        }
        if (!this.canEnter()) { GAME.UI.updateUI(); return; }
        var cdFz = GAME.State.cdLeft("fzone");
        if (cdFz > 0) {
            GAME.UI.log("禁地四周赤雾方散又聚，妖兽惊魂未定——须再候 " + cdFz + " 个月方能再探。", "system");
            GAME.UI.updateUI();
            return;
        }

        p.fzone = {
            herbs: {},                      // 已夺主药 { herbId: qty }
            restLeft: this.cfg().restCount, // 剩余调息次数
        };
        GAME.State.setCd("fzone", this.cfg().cooldownMonths || 12);
        p.stats.fzones += 1;
        GAME.UI.log("【血色禁地】赤雾吞没众人。三处药田散落谷中，各有守护妖兽盘踞——闯过去，战而夺之。", "danger");
        GAME.UI.log("（提示：随身带【传送符】可随时连人带货撤离；两战之间可【调息疗伤】 "
            + this.cfg().restCount + " 次。）", "system");
        GAME.UI.updateUI();
    },

    // ---------- 闯药田：与守护兽正面一战 ----------
    challenge: function (herbId) {
        var p = GAME.State.p();
        var f = p.fzone;
        if (!f || p.combat || p.isDead) return;
        var cfg = this.cfg();
        var field = cfg.fields[herbId];
        if (!field) return;
        if (f.herbs[herbId]) {
            GAME.UI.log("此处灵药已被你采走，只剩一畦断茎。", "system");
            GAME.UI.updateUI();
            return;
        }
        GAME.UI.log("【" + field.label + "】" + field.text, "warning");
        GAME.UI.log("守护兽低吼着扑来——", "danger");
        p.combatRoute = { type: "fzone", kind: "herb", herbId: herbId };
        GAME.Combat.start(field.beast);
    },

    // ---------- 调息疗伤：有限次数，耗月数 ----------
    rest: function () {
        var p = GAME.State.p();
        var f = p.fzone;
        if (!f || p.combat || p.isDead) return;
        if (f.restLeft <= 0) {
            GAME.UI.log("你已无处调息——禁地中灵气驳杂，再拖下去徒耗时机。", "system");
            GAME.UI.updateUI();
            return;
        }
        f.restLeft -= 1;
        var heal = Math.ceil(p.maxHp * this.cfg().restHealPct);
        p.currentHp = Math.min(p.maxHp, p.currentHp + heal);
        GAME.UI.log("你寻一处背风石隙盘膝调息，运转青木功——气血回复 " + heal + " 点。（余 " + f.restLeft + " 次）", "success");
        GAME.Core.passTime(this.cfg().restMonths);
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 战斗回调（Combat victory/defeat 路由至此） ----------
    afterCombat: function (win, ctx) {
        var p = GAME.State.p();
        var f = p.fzone;
        if (!f) return;

        if (!win) {
            // 玄傀护主突围：铁奴拼死背主人杀出——休养数月，只折普通身家，主药与法宝分毫不动
            if (p.companion && p.companion.hp > 0) {
                var lostStones = Math.floor(p.spiritStones * 0.3);
                p.spiritStones -= lostStones;
                p.currentHp = Math.max(1, Math.ceil(p.maxHp * 0.2));
                var herbsAll = this._herbCount();
                this._bankHerbs();
                p.fzone = null;
                GAME.UI.log("【玄傀护主】千钧一发之际，铁奴玄傀横身挡在你面前，硬撼一击后背起你突围而出！", "success");
                GAME.UI.log("你被背回洞府，昏睡三月方醒——灵石折去 " + lostStones + " 枚，但已夺的 " + herbsAll + " 株灵药与随书法宝分毫未失。", "warning");
                GAME.Core.passTime(3);
                GAME.UI.updateUI();
                return;
            }
            // 无玄傀：弃药保命——私藏药草折半，人被空间乱流推出禁地（软着陆，不走通用折寿）
            var lost = 0;
            Object.keys(f.herbs).forEach(function (id) {
                var keep = Math.floor(f.herbs[id] / 2);
                lost += f.herbs[id] - keep;
                if (keep > 0) f.herbs[id] = keep; else delete f.herbs[id];
            });
            var lostStones2 = Math.floor(p.spiritStones * 0.3);
            p.spiritStones -= lostStones2;
            p.currentHp = Math.max(1, Math.ceil(p.maxHp * 0.1));
            GAME.UI.log("你败退出禁地——乱流中" + (lost ? "丢了 " + lost + " 株已夺灵药，" : "") + "另折去 " + lostStones2 + " 枚灵石，侥幸全须全尾。", "danger");
            p.fzone = null;
            GAME.UI.updateUI();
            return;
        }

        if (ctx && ctx.kind === "herb") {
            f.herbs[ctx.herbId] = (f.herbs[ctx.herbId] || 0) + 1;
            GAME.UI.log("守护兽伏诛！你摘下【" + GAME.DATA.ITEMS[ctx.herbId].name + "】收入囊中。", "loot");
            var all = this.cfg().herbs.every(function (id) { return f.herbs[id] > 0; });
            if (all) {
                GAME.UI.log("三味主药已齐——往出口法阵走一趟，交与坐镇长老，便是正品筑基丹的份例。", "success");
                if (GAME.Codex) GAME.Codex.unlockLore("lore_xuese");   // 图鉴·秘闻
            }
        }
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 传送符随时撤离：连人带货全身而退 ----------
    teleport: function () {
        var p = GAME.State.p();
        var f = p.fzone;
        if (!f || p.combat || p.isDead) return;
        if (GAME.State.countItem("talisman_chuansong") < 1) {
            GAME.UI.log("你没有【传送符】——苍南小坊市有售，禁地保命第一要物。", "system");
            GAME.UI.updateUI();
            return;
        }
        GAME.State.removeItem("talisman_chuansong", 1);
        var herbs = this._herbCount();
        GAME.UI.log("你血祭【传送符】，白光裹身——瞬移百里，落回苍南谷外。连人带货，全身而退！（私藏灵药 " + herbs + " 株俱在）", "success");
        this._bankHerbs();
        p.fzone = null;
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 寻隙撤离：弃药保命 ----------
    abandon: function () {
        var p = GAME.State.p();
        if (!p.fzone || p.combat || p.isDead) return;
        GAME.UI.log("你借着雾气寻隙退出禁地——夺到的灵药尽数弃于乱石之间，好歹人是全的。", "warning");
        p.fzone = null;
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 结算 ----------
    // mode "submit"：尽数上交（三药俱全 → 正品筑基丹 + 大量贡献）
    // mode "keep"：私藏带回（灵药入储物袋，可回洞府以绿液续栽）
    finish: function (mode) {
        var p = GAME.State.p();
        var f = p.fzone;
        if (!f) return;
        var r = this.cfg().reward;
        var n = this._herbCount();
        if (n > 0 && mode === "submit") {
            var full = this.cfg().herbs.every(function (id) { return f.herbs[id] > 0; });
            this.cfg().herbs.forEach(function (id) { delete f.herbs[id]; });
            if (full) {
                GAME.State.addItem(r.fullSetPill, 1);
                p.sectContrib += r.fullSetContrib;
                GAME.UI.log("【出口法阵】你将三大主药尽数呈交坐镇长老——长老抚须惊叹：「三药俱全！此乃正品筑基丹的份例！」（正品筑基丹 ×1，贡献 +" + r.fullSetContrib + "）", "success");
            } else {
                var pr = r.partialReward[n];   // n 为 1 或 2：阶梯赏赐，不集齐三药也有回报
                if (pr) {
                    p.sectContrib += pr.contrib;
                    p.spiritStones += pr.stones;
                    GAME.UI.log("【出口法阵】你上交 " + n + " 株灵药，长老颔首：「虽非三药俱全，亦算有功。」（贡献 +" + pr.contrib + "，灵石 +" + pr.stones + "）", "success");
                } else {
                    p.sectContrib += r.contribPerHerb * n;
                    GAME.UI.log("【出口法阵】你上交 " + n + " 株灵药，换得宗门赏赐（贡献 +" + (r.contribPerHerb * n) + "）。", "success");
                }
            }
        } else if (n > 0) {
            this._bankHerbs();
            GAME.UI.log("你携 " + n + " 株灵药悄然脱离禁地——私藏之药带回洞府，绿液有的是用武之地。", "info");
        } else {
            GAME.UI.log("你两手空空踏出禁地——好歹命是全的。", "info");
        }
        p.fzone = null;
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ---------- 工具 ----------
    rand: function (min, max) {
        if (GAME.Core && GAME.Core.rand) return GAME.Core.rand(min, max);
        return min + Math.floor(Math.random() * (max - min + 1));
    },
    _herbCount: function () {
        var f = GAME.State.p().fzone;
        if (!f) return 0;
        return Object.keys(f.herbs).reduce(function (s, id) { return s + f.herbs[id]; }, 0);
    },
    _bankHerbs: function () {
        var f = GAME.State.p().fzone;
        if (!f) return;
        Object.keys(f.herbs).forEach(function (id) { GAME.State.addItem(id, f.herbs[id]); });
        f.herbs = {};
    },
};
