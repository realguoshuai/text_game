/* =========================================================
 * js/herbalarm.js —— 灵药出手：百年可售的代价 与 千年露白的劫杀
 *
 * 一、百年灵药（放开的销路）
 *     · 坊市/散修坊市/地下黑市都可出手，专属收货价 120（黑市 150，价高但招尾随）
 *     · 每售出一株：全局【药香泄露】+30（封顶 leakCaught），并被记下脸 →【黑市神识锁定】觊觎 +25
 * 二、千年灵药（卖不出去的重宝）
 *     · 柜台上挂得住价，可常规兑换一律被本模块拦下——
 *       露白即是杀局：剧情警告弹窗 → 强行遭遇战（筑基邪修·血手屠三）→ 胜负分支
 *     · 战胜：灵药保住，反向摸尸暴富（额外灵石 + 中阶灵石），觊觎一扫而空
 *     · 战败：灵药被夺，重伤折寿（沿用 Combat.defeat 的通用结算，不另设死法）
 *
 * 铁律：只做拦截与结算，不动 Combat 的伤害/命中；唯一出口是 Combat.start。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.HerbAlarm = {

    CENTURY: "herb_bainian",     // 百年灵药：可卖，卖完留味
    HOT: "herb_qiannian",        // 千年灵药：一出手就有人来抢
    AMBUSH: "herb_ambusher",     // 筑基邪修·血手屠三（data/events.js）

    isCentury: function (id) { return id === this.CENTURY; },
    isHot: function (id) { return id === this.HOT; },

    pending: function () {
        var p = GAME.State.p();
        return (p && p.herbPending) || null;
    },

    // 泄露值上限取药园配置（无配置时 100），免得 HUD 出现 130/80 这种读不懂的数
    leakCap: function () {
        var g = (GAME.DATA.CONTENT && GAME.DATA.CONTENT.SECT2 && GAME.DATA.CONTENT.SECT2.garden) || null;
        return (g && g.leakCaught) || 100;
    },

    /* ============ ① 百年灵药：药香压不住 ============ */
    // 每售出一株都要走这里（坊市、散修坊市、黑市同一口径）
    afterSellCentury: function (id) {
        var p = GAME.State.p();
        if (!p) return;
        var before = p.leak || 0;
        p.leak = Math.min(this.leakCap(), before + 30);
        var risk = (GAME.Bottle && GAME.Bottle.addRisk) ? GAME.Bottle.addRisk(25) : (p.marketRiskValue || 0);
        GAME.UI.log("【药香泄露 +" + (p.leak - before) + "（现 " + p.leak + "）】" +
            (id && GAME.DATA.ITEMS[id] ? "【" + GAME.DATA.ITEMS[id].name + "】" : "灵药") +
            "的清气顺着门缝飘出半条街——药园与暗巷都闻得见。", "warning");
        GAME.UI.log("【黑市神识锁定】你出门时，柜台后那双眼睛已把你的脸记进了账本（觊觎 " + risk + "/100）。", "danger");
    },

    /* ============ ② 千年灵药：拦截 → 警告 → 劫杀 ============ */
    // source: "market"（坊市）/ "tainan"（散修坊市）/ "black"（地下黑市）——只影响一句旁白
    trigger: function (id, source) {
        var p = GAME.State.p();
        if (!p || p.isDead) return false;
        if (p.combat) return true;                 // 交战中：战斗面板优先，绝不再叠一局
        if (!p.herbPending) {
            p.herbPending = { id: id, source: source || "market" };
            // 药香：整间阁楼都闻得到（与百年灵药同一口径，同样封顶）
            p.leak = Math.min(this.leakCap(), (p.leak || 0) + 30);
            // 觊觎：药还没离手，盯着你的人已经动了杀心
            if (GAME.Bottle && GAME.Bottle.addRisk) GAME.Bottle.addRisk(60);
            GAME.UI.log("你刚取出【" + GAME.DATA.ITEMS[id].name + "】，浓郁药香瞬间弥漫整个掌柜阁楼。", "danger");
            GAME.UI.log("掌柜眼中闪过一丝贪婪，皮笑肉不笑地稳住你，暗中却早已捏碎了传音符……", "danger");
            GAME.UI.log("阁楼四角的灯笼忽然齐齐暗了一暗——楼上有人翻身下来了。", "warning");
        }
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // 弹窗显隐 ＋ 旁白（由 UI.updateUI 每帧调用，读档后也能弹回来）
    sync: function () {
        var U = GAME.UI;
        var box = U.$ ? U.$("herb-alarm-modal") : null;
        if (!box) return;
        var pd = this.pending();
        box.style.display = pd ? "" : "none";
        if (!pd) return;
        var note = U.$("herb-alarm-note");
        if (note) {
            var where = pd.source === "black" ? "黑市掌事笑得愈发和气，手指却在柜台下敲了三长两短"
                : pd.source === "tainan" ? "摆摊的老修士连价都不还了，只一个劲往街口瞟"
                    : "掌柜沏茶的手稳得出奇，眼睛却一直没离开你那只药囊";
            note.innerHTML = where + "。<br>" +
                "这一株【" + GAME.DATA.ITEMS[pd.id].name + "】已经把话说明白了：<span class=\"danger\">" +
                "要么打出去，要么把药留下</span>。";
        }
        var bF = U.$("btn-herb-fight");
        if (bF) bF.onclick = function () { GAME.HerbAlarm.fight(); };
        var bL = U.$("btn-herb-flee");
        if (bL) bL.onclick = function () { GAME.HerbAlarm.flee(); };
    },

    // 拔剑：闯入遭遇战。灵药此刻仍在怀里（未扣），胜负由 Combat 结算
    fight: function () {
        var p = GAME.State.p();
        var pd = this.pending();
        if (!pd || p.isDead) return false;
        p.herbPending = null;
        this.sync();
        GAME.UI.log("你反手扣住药囊，另一只手已按上刀柄：「掌柜的，你这茶，浓得过分了。」", "danger");
        GAME.UI.log("楼板轰然碎裂，一道血影自梁上扑下：「灵药留下——人也不必走了。」", "danger");
        p.combatRoute = { type: "herbalarm", herbId: pd.id, source: pd.source };
        GAME.Combat.start(this.AMBUSH);
        return true;
    },

    // 弃药：灵药被夺，人重伤逃出（不判身陨，留一口气）
    flee: function () {
        var p = GAME.State.p();
        var pd = this.pending();
        if (!pd || p.isDead) return false;
        p.herbPending = null;
        this.sync();
        GAME.State.removeItem(pd.id, 1);
        p.currentHp = Math.max(1, Math.round((p.maxHp || 1) * 0.3));
        p.wounded = { hp: p.currentHp };
        GAME.UI.log("你当机立断，将药囊朝窗外一抛——血影回身去接，你趁隙撞破窗棂滚入人潮。", "warning");
        GAME.UI.log("【" + GAME.DATA.ITEMS[pd.id].name + "】被人夺走，你后背挨了一记隔空掌，血气翻涌。（重伤）", "danger");
        GAME.Core.checkDeath();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // 战后结算（由 Combat 的 routed 分支回调，与 Jiayuan/Tainan 同一套路由）
    // why: "lose"（被打倒）/ "flee"（遁走成功）——都失去灵药，只是说法不同
    afterCombat: function (win, ctx, why) {
        var p = GAME.State.p();
        if (p.isDead) return;
        var id = (ctx && ctx.herbId) || this.HOT;
        var nm = GAME.DATA.ITEMS[id] ? GAME.DATA.ITEMS[id].name : "千年灵药";
        if (win) {
            // 反向摸尸：血手身上不止有买你命的定金，还有他自己的家当
            var bonus = GAME.Core.rand(150, 300);
            p.spiritStones += bonus;
            GAME.State.addItem("mid_stone", 1);
            p.marketRiskValue = 0;
            p.riskWarned = false;
            p.riskHunt = false;
            GAME.UI.log("你从他怀里摸出 " + bonus + " 枚灵石、一枚中阶灵石，另有一封写着你行程的密笺。", "loot");
            GAME.UI.log("【" + nm + "】还在你怀里——这株药，终究没落到旁人手上。", "success");
            GAME.UI.log("你把血手的尸首吊在坊市外的老槐树上：三日内，再没人敢跟你的货。（觊觎归零）", "success");
        } else {
            GAME.State.removeItem(id, 1);
            if (why === "flee") {
                GAME.UI.log("你连滚带爬出了城，直到喘匀了气才发觉——药囊早在巷口缠斗时脱手了。", "danger");
                GAME.UI.log("【" + nm + "】终究没能保住。命在，本钱没了。", "warning");
            } else {
                GAME.UI.log("你从血泊里爬起来时，怀里只剩一只空药囊——【" + nm + "】终究被人夺了去。", "danger");
                GAME.UI.log("这条命是捡回来的。下回露宝之前，先看清暗处还有几双眼睛。", "warning");
            }
        }
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },
};
