/* =========================================================
 * js/map.js —— 岚州大地图控制器
 * 节点流转（耗时 + 世俗盘缠）、苍南谷幻阵门槛、
 * 地点专属行动（辞行 / 探亲 / 登门玄机世家）、灵石兑市银
 * 数据全在 GAME.DATA.MAP，本文件只做逻辑与校验
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Map = {

    cfg: function () { return GAME.DATA.MAP; },

    node: function (id) {
        var hit = null;
        this.cfg().nodes.forEach(function (n) { if (n.id === id) hit = n; });
        return hit;
    },

    cur: function () {
        var p = GAME.State.p();
        return this.node(p.location) || this.node(this.cfg().start);
    },

    // ---------- 当前地点可走的道路（双向，附带目标地的解锁状态） ----------
    routes: function () {
        var self = this, cur = GAME.State.p().location, out = [];
        this.cfg().routes.forEach(function (r) {
            var target = (r.from === cur) ? r.to : (r.to === cur ? r.from : null);
            if (!target) return;
            var n = self.node(target);
            var u = self.nodeUnlocked(target);
            out.push({
                id: r.id, targetId: target, targetName: n ? n.name : target,
                months: r.months, silver: r.silver,
                unlocked: u.ok, lockMsg: u.ok ? "" : u.msg,
            });
        });
        return out;
    },

    // ---------- 地点解锁：按当前境界放行，本派门人不拘 ----------
    nodeUnlocked: function (id) {
        var n = this.node(id);
        if (!n) return { ok: false, msg: "世间并无此地。" };
        var p = GAME.State.p();
        var need = n.reqRealm || 0;
        if (p.realmIndex >= need) return { ok: true };
        if (n.reqSect && p.sectId === n.reqSect) return { ok: true };   // 持身份玉简者直入
        return { ok: false, msg: this.lockMsg(n) };
    },

    // 未达标拒辞：节点自带 reqText 优先，补上「当前 X，需 Y 以上」方便对照
    lockMsg: function (n) {
        var need = n.reqRealm || 0;
        var realm = GAME.DATA.REALMS[need] || {};
        var curName = (GAME.DATA.REALMS[GAME.State.p().realmIndex] || {}).name || "无名之辈";
        var text = n.reqText || "你的修为尚浅，去不得【" + n.name + "】。";
        return text + "（当前 " + curName + "，需 " + (realm.name || "更高境界") + " 以上）";
    },

    // ---------- 天下舆图：全部节点及其解锁状态（UI 展示用） ----------
    atlas: function () {
        var self = this, p = GAME.State.p(), out = [];
        this.cfg().nodes.forEach(function (n) {
            var u = self.nodeUnlocked(n.id);
            out.push({
                id: n.id, name: n.name, kind: n.kind,
                unlocked: u.ok, lockMsg: u.ok ? "" : u.msg,
                reqRealmName: (GAME.DATA.REALMS[n.reqRealm || 0] || {}).name || "",
                teaser: n.teaser || "",
                here: p.location === n.id,
            });
        });
        return out;
    },

    // ---------- 忙碌判定：战斗 / 事件 / 试炼 / 玄机子 时不许上路 ----------
    busyMsg: function () {
        var p = GAME.State.p();
        if (p.isDead) return "你已道消身陨，再也踏不上路途。";
        if (p.combat) return "斗法未已，岂能抽身离去？";
        if (p.pendingEvent || p.pendingMercy) return "眼前之事未了，先做个了断。";
        if (p.trial) return "血月试炼尚在进行，脱身不得。";
        if (p.moEvent) return "玄机子的元神仍在纠缠，此刻走不开。";
        if (p.hunt) return "你正在狩猎场中，收势而退后方可上路。";
        if (p.fzone) return "身陷血色禁地，脱身不得。";
        if (p.relic) return "正在古修遗迹中探秘，此时抽身，前功尽弃。";
        if (p.mansion) return "你正潜伏在墨府之中，此时抽身，前功尽弃。";
        if (p.jiayuan && p.location === "jiayuan_cheng") return "玄机世家的事正到紧要处，此时抽身，恐失信于颜氏。";
        return null;
    },

    // ---------- 苍南谷幻阵门槛：青木功层数 / 升仙令 / 已入门派 ----------
    canEnterTainan: function () {
        var p = GAME.State.p(), a = this.cfg().array;
        if (p.sectId) return true;                                             // 已是某派门人
        if ((p.changchunLevel || 0) >= a.needChangchun) return true;           // 神识足够，自可勘破虚妄
        if (a.needToken && GAME.State.countItem(a.needToken) > 0) return true; // 持令者不拘此限
        return false;
    },

    // ---------- 上路前的校验：忙碌 → 路是否存在 → 修为门槛 → 苍南谷幻阵 → 盘缠 ----------
    canTravel: function (routeId) {
        var busy = this.busyMsg();
        if (busy) return { ok: false, msg: busy };
        var target = null;
        this.routes().forEach(function (r) { if (r.id === routeId) target = r; });
        if (!target) return { ok: false, msg: "此处并无这条路。" };
        var p = GAME.State.p();
        // 修为不到：出不了这道无形的坎（青梧谷等宗门另认门人身份）
        if (!target.unlocked) return { ok: false, msg: target.lockMsg };
        // 盘缠：银两不足可用灵石折抵（见 payPlan），不再因为"灵石满身、银两为零"被困死在城里
        var pay = this.payPlan(p, target.silver);
        if (!pay.ok) {
            return { ok: false, msg: "盘缠不足（需 " + target.silver + " 两），身上连一枚灵石也无——先在凡俗城池接点营生，或卖掉些杂物换灵石。" };
        }
        if (target.targetId === "tainan_gu" && !(p.location === "tainan_gu") && !this.canEnterTainan()) {
            return { ok: false, msg: GAME.DATA.MAP.array.failText };
        }
        return { ok: true, target: target };
    },

    // ---------- 移动：扣盘缠 → 换地点 → 推进时间（阴毒倒计时同步递减） ----------
    // 路途奇遇（元婴专属，轻量直接给，不致死）：古宝/授艺/灵药/灵矿/凶险
    rollWonder: function () {
        var p = GAME.State.p();
        var wd = GAME.DATA.MAP_WONDERS;
        if (!wd) return false;
        var roll = Math.random(), acc = 0, res = wd.pool[wd.pool.length - 1];
        for (var i = 0; i < wd.pool.length; i++) { acc += wd.pool[i].chance; if (roll < acc) { res = wd.pool[i]; break; } }
        if (res.id === "relic") {
            var eq = wd.relics[Math.floor(Math.random() * wd.relics.length)];
            GAME.State.addItem(eq, 1);
            var _r1 = GAME.Core.addExp(300);
            GAME.UI.log("路旁岩隙嵌着一具古修遗蜕，指间法器犹自生辉。你取其随身之宝，并参悟其上残纹。（得【" + GAME.DATA.ITEMS[eq].name + "】" +
                (_r1 > 0 ? "，修为 +" + _r1 : "，修为已满") + "）", "success");
        } else if (res.id === "art") {
            var _r2 = GAME.Core.addExp(500); p.mind = (p.mind || 0) + 5;
            GAME.UI.log("半途遇一缕前辈残魂，隔空授你一段心法真意。（" +
                (_r2 > 0 ? "修为 +" + _r2 : "修为已满") + "，心境 +5）", "success");
        } else if (res.id === "herb") {
            GAME.State.addItem("herb_qiannian", 2);
            GAME.UI.log("崖壁石缝里，两株万年灵药正吞吐月华。你以玉匣小心收了。（【千年灵药】×2）", "loot");
        } else if (res.id === "stones") {
            var st = 800 + Math.floor(Math.random() * 701);
            p.spiritStones += st;
            GAME.UI.log("路经一处废弃灵脉，矿脉尚余 " + st + " 枚灵石——归你了。", "loot");
        } else if (res.id === "trap") {
            p.currentHp = Math.max(1, (p.currentHp || 0) - 200);
            p.mind = Math.max(0, (p.mind || 0) - 5);
            GAME.UI.log("一阵莫名眩晕攫住元神——你踏入一处早已无主的幻阵残痕，狼狈脱身，气血与神识皆损。（气血 -200，心境 -5）", "danger");
        } else {
            GAME.UI.log("一路山明水秀，却也无甚机缘。", "system");
        }
        return true;
    },

    // ---------- 盘缠支付方案（唯一出口） ----------
    // 世俗规矩收银两，可修士身上常只有灵石。原来按 1 灵石 = 100 两折算"需要几枚"，
    // 于是身家颇丰的人因为囊中 0 两被困死在城中（用户在景阳城实测卡死）。
    // 现在：银两够就只扣银两；不够则把身上银两抵作盘缠，再拿「一枚低阶灵石」补足整程
    // ——驿站兑碎银是按程算的，没人会为一趟车马数你几块灵石。
    // ★ 盘缠判定的唯一出口：canTravel / travel / renderMap 的置灰都读它的 ok。
    STONE_TO_SILVER: 100,          // 仅作"一枚灵石值多少两"的换算参考（行商兑换同价）
    payPlan: function (p, cost) {
        cost = Math.max(0, Math.round(cost || 0));
        var silver = (typeof p.silver === "number" && isFinite(p.silver)) ? p.silver : 0;
        var stones = (typeof p.spiritStones === "number" && isFinite(p.spiritStones)) ? p.spiritStones : 0;
        if (silver >= cost) return { ok: true, silver: cost, stones: 0, short: 0, fallback: false };
        var short = cost - silver;
        if (stones < 1) return { ok: false, silver: silver, stones: 1, short: short, fallback: true };
        return { ok: true, silver: silver, stones: 1, short: short, fallback: true };
    },

    travel: function (routeId) {
        var check = this.canTravel(routeId);
        if (!check.ok) { GAME.UI.log(check.msg, "system"); GAME.UI.updateUI(); return false; }
        var p = GAME.State.p();
        var target = check.target;
        var from = this.cur();

        var pay = this.payPlan(p, target.silver);
        if (!pay.ok) { GAME.UI.log("盘缠不足，走不得了。", "system"); GAME.UI.updateUI(); return false; }
        p.silver = Math.max(0, (p.silver || 0) - pay.silver);
        if (pay.stones > 0) p.spiritStones = Math.max(0, (p.spiritStones || 0) - pay.stones);
        // 《御风诀》：驭风赶路，每程省 1 个月（最低 1 月）
        var months = target.months;
        if (p.spells && p.spells.yufeng_shu && GAME.DATA.SPELLS.yufeng_shu) {
            months = Math.max(1, months - GAME.DATA.SPELLS.yufeng_shu.travelDiscount);
            if (months < target.months) GAME.UI.log("你驭风而行，脚程快了许多（行程 " + target.months + " → " + months + " 个月）。", "info");
        }
        // 【踏云靴】：云气托足，大地图移动消耗减半（最低 1 月）
        if (GAME.State.countItem("artifact_tayun") > 0) {
            var m0 = months;
            months = Math.max(1, Math.round(months * 0.5));
            if (months < m0) GAME.UI.log("【踏云靴】云气托足，行程减半（" + m0 + " → " + months + " 个月）。", "info");
        }
        GAME.UI.log("你自【" + from.name + "】动身，一路风尘前往【" + target.targetName + "】，车马盘缠耗去 " + target.silver + " 两。" +
            (pay.stones > 0 ? "（随身银两不足，在驿站拿 " + pay.stones + " 枚灵石兑了碎银补足）" : ""), "system");
        p.location = target.targetId;
        // 离开原址时若仍在「坊市停留」态，需复位——否则人已到别处、按钮却还挂着「已在坊市中」
        if (p.atMarket) {
            p.atMarket = false;
            if (GAME.Bottle) GAME.Bottle.onLeaveMarket();
        }

        var to = this.node(target.targetId);
        if (target.targetId === "tainan_gu" && to) {
            GAME.UI.log("山道尽头的雾里忽然现出一道缝——幻阵已破，谷中市声隐隐入耳。", "success");
        }

        GAME.Core.passTime(months);
        if (p.isDead) return false;

        if (to) GAME.UI.log("【抵达】" + to.name + "——" + to.desc, "info");

        // —— 路遇事件：按当前修为从野外怪带中随机遇敌（25% 概率） ——
        var enc = GAME.DATA.MAP_ENCOUNTERS;
        if (enc && !p.isDead && !p.combat && Math.random() < enc.chance) {
            var cands = [];
            enc.pool.forEach(function (bd) {
                if (p.realmIndex >= bd.minRealm && p.realmIndex <= bd.maxRealm) cands.push(bd);
            });
            if (cands.length) {
                var pick = cands[Math.floor(Math.random() * cands.length)];
                var mdef = null;
                GAME.DATA.MONSTERS.forEach(function (m) { if (m.id === pick.monster) mdef = m; });
                if (mdef) {
                    GAME.UI.log("【路遇】行至半途，" + mdef.name + "自道旁杀出——" + mdef.desc, "danger");
                    GAME.Combat.start(mdef.id);
                    GAME.UI.updateUI();
                    return true;
                }
            }
        }

        // 路途奇遇（元婴专属，轻量直接给，不致死）
        if (!p.combat && !p.isDead && p.realmIndex >= (GAME.DATA.YUANING_GATE_INDEX || 19)) {
            var wd = GAME.DATA.MAP_WONDERS;
            if (wd && Math.random() < wd.chance) { this.rollWonder(); GAME.UI.updateUI(); return true; }
        }

        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 多跳寻路：BFS 过全部双向道路，返回路由序列（供跨城一键动身） ----------
    // 只算拓扑连通，不先验境界门槛——调用方（travelMulti / travel）逐跳再校验，
    // 卡在哪一城会在该跳的 canTravel 报错，不会把人传送到去不了的地方
    findPath: function (fromId, toId) {
        var routes = this.cfg().routes, adj = {};
        routes.forEach(function (r) {
            (adj[r.from] = adj[r.from] || []).push(r);
            (adj[r.to] = adj[r.to] || []).push(r);
        });
        var q = [[fromId, []]], seen = {}; seen[fromId] = true;
        while (q.length) {
            var cur = q.shift(), id = cur[0], path = cur[1];
            if (id === toId) return path;
            (adj[id] || []).forEach(function (r) {
                var nx = (r.from === id) ? r.to : r.from;
                if (!seen[nx]) { seen[nx] = true; q.push([nx, path.concat(r)]); }
            });
        }
        return null;
    },

    // ---------- 多跳动身：逐跳 travel，遇斗法/身死即止（见闻录自然记录途经中转） ----------
    travelMulti: function (routeIds) {
        var p = GAME.State.p();
        routeIds = routeIds || [];
        for (var i = 0; i < routeIds.length; i++) {
            if (p.isDead || p.combat) break;
            this.travel(routeIds[i]);
            if (p.isDead || p.combat) break;
        }
        return true;
    },

    // ---------- 地点描述（唯一出口） ----------
    // 有些地点在主线了结后该换一种说法。数据里写 descPacified，这里按状态挑；
    // 渲染不再就地拼字符串，免得"地图一句话、见闻录另一句话"。
    nodeDesc: function (node, p) {
        node = node || this.cur();
        p = p || GAME.State.p();
        if (!node) return "";
        if (node.id === "yuejing_cheng" && node.descPacified &&
            p.heisha && p.heisha.bossDone) return node.descPacified;
        return node.desc || "";
    },

    // ---------- 地点专属行动 ----------
    // 节点自带的 actions 只写"这地方永久有啥"，写不了"你手上有某物时才有的门"。
    // 苍南谷原先 actions 为空 —— 持升仙令的人站在谷里，读到的却是「此地无事可做」，
    // 拜山入口只藏在折叠的【苍南小会】里，等于没有。这里按剧情补出动态行动，
    // 渲染（renderMap）与执行（canDoAction/doAction）都读同一份，不各写一套。
    nodeActions: function (p) {
        var node = this.cur();
        var out = (node.actions || []).slice();
        p = p || GAME.State.p();
        // 云京·皇城：筑基期主线副本「幽冥地宫」——探索中在「此地可为」同步铺出四大血侍与越皇的讨伐入口，
        // 不让玩家到了皇城还找不到人（探索进度存于 p.heisha，未起则走静态 heisha_raid 夜探皇宫）
        if (node.id === "yuejing_cheng" && GAME.Heisha) {
            if (p.heisha && !p.heisha.bossDone) {
                out = out.filter(function (a) { return a.id !== "heisha_raid"; });
                out.push({ id: "heisha_resume", label: "返回云京皇宫·继续讨伐", hint: "四大血侍与越皇仍在宫中，讨伐进度未失。", main: true });
                GAME.Heisha.cfg().guards.forEach(function (g) {
                    out.push({ id: "heisha_guard_" + g.id, label: "讨伐·" + g.name, hint: g.hint, guardId: g.id });
                });
                out.push({
                    id: "heisha_spider", label: "深入甬道·迎战血玉蜘蛛",
                    hint: "赤色蛛网封死寝殿甬道——不斩此蛛，入不得地宫。", guardId: null
                });
                out.push({ id: "heisha_boss", label: "决战·幽冥教主越皇", hint: "血侍与血玉蜘蛛尽除后，方可直入寝殿。", guardId: null });
            } else if (p.heisha && p.heisha.bossDone) {
                // 已平定：把「夜探皇宫」这条入口换掉。留着一个能点的按钮，就是留给玩家重念开场白的口子。
                out = out.filter(function (a) { return a.id !== "heisha_raid"; });
                out.push({
                    id: "heisha_pacified",
                    label: "【已平定】幽冥教覆灭，皇城地宫已封",
                    hint: "地宫石门由镇魔司以铁汁浇死，余党或散或伏——云京的夜，总算又有了灯火气。"
                });
            }
        }
        if (node.id === "tainan_gu" && !p.sectId && GAME.State.countItem("shengxian_ling") > 0) {
            out.push({
                id: "join_sect",
                label: "持升仙令面见宗门长老",
                hint: "锈牌一亮，验令长老当场引你入门；青梧谷的山门自此为你敞开。",
                main: true          // 主线级入口：渲染时行首加一道旧金边，不与寻常「行事」混作一片
            });
        }
        return out;
    },

    canDoAction: function (actionId) {
        var node = this.cur();
        var p = GAME.State.p();
        var act = null;
        this.nodeActions(p).forEach(function (a) { if (a.id === actionId) act = a; });
        if (!act) return { ok: false, msg: "此地并无此事可做。" };
        // 云京皇宫讨伐：resume / 分破血侍 / 决战越皇 的入口校验
        if (actionId === "heisha_resume") {
            return { ok: !!(p.heisha && !p.heisha.bossDone), msg: "当前并无进行中的皇宫讨伐。" };
        }
        // 已平定：只报"封了"，不给可点入口
        if (actionId === "heisha_pacified") {
            return { ok: false, msg: "地宫已封——此处再无事可做。" };
        }
        if (actionId.indexOf("heisha_guard_") === 0) {
            var gid = actionId.slice("heisha_guard_".length);
            if (!GAME.Heisha || !GAME.Heisha.canEnter()) return { ok: false, msg: "非筑基修士，涉足不得。" };
            var hs = GAME.Heisha.state();
            if (hs.guards[gid]) {
                var gn = (GAME.Heisha.cfg().guards.filter(function (g) { return g.id === gid; })[0] || {}).name || "该血侍";
                return { ok: false, msg: "【" + gn + "】已然伏诛。" };
            }
            return { ok: true, act: act };
        }
        if (actionId === "heisha_spider") {
            if (!GAME.Heisha || !GAME.Heisha.canEnter()) return { ok: false, msg: "非筑基修士，涉足不得。" };
            if (!GAME.Heisha.allGuardsDown()) return { ok: false, msg: "四名血侍未除，甬道入口未现。" };
            if (GAME.Heisha.spiderDown()) return { ok: false, msg: "甬道里只剩一堆碎壳与枯丝。" };
            return { ok: true, act: act };
        }
        if (actionId === "heisha_boss") {
            if (!GAME.Heisha || !GAME.Heisha.canEnter()) return { ok: false, msg: "非筑基修士，涉足不得。" };
            if (!GAME.Heisha.allGuardsDown()) return { ok: false, msg: "四名血侍未除，越皇血祭光环正盛——十死无生。" };
            if (!GAME.Heisha.spiderDown()) return { ok: false, msg: "寝殿甬道仍被血玉蜘蛛的赤丝封死。" };
            return { ok: true, act: act };
        }
        // 苍南谷拜山：令牌是唯一凭证（擂台三场只换筑基丹，不换门籍）
        if (actionId === "join_sect") {
            if (p.sectId) return { ok: false, msg: "你已有山门可归。" };
            if (GAME.State.countItem("shengxian_ling") <= 0) {
                return { ok: false, msg: "你身上并无【升仙令】。若无此物，只有上擂台一条路。" };
            }
        }
        // 玄机世家是一次性主线：了结之后入口必须封存，否则每点一次就往见闻录刷一遍收尾话
        if (actionId === "mo_house" && p.jiayuanDone) {
            return { ok: false, msg: "玄机世家之事已了，颜氏仍在城中操持旧业。" };
        }
        // 玄机世家：身在城中再点一次＝继续追问颜氏，本就不是"抽身离开"，
        // 不能被 busyMsg 里那条"此时抽身恐失信于颜氏"反拦住（玩家会以为入口坏了）。
        var resumeMansion = (actionId === "mo_house" && p.jiayuan && p.location === "jiayuan_cheng");
        if (!resumeMansion && this.busyMsg()) return { ok: false, msg: this.busyMsg() };
        // 一次性行动：做过之后不再重复
        if (actionId === "farewell" && p.farewellDone) return { ok: false, msg: "故人已别，不必再来。" };
        if (actionId === "visit_family" && p.visitFamilyDone) return { ok: false, msg: "尘缘已断，再入家门徒惹伤怀。" };
        return { ok: true, act: act };
    },

    doAction: function (actionId) {
        var check = this.canDoAction(actionId);
        var p = GAME.State.p();
        var t = this.cfg().actionText;

        if (!check.ok) { GAME.UI.log(check.msg, "system"); GAME.UI.updateUI(); return false; }

        if (actionId === "farewell") {
            p.farewellDone = true;
            p.silver += t.farewell.silver;
            p.mind += t.farewell.mind;
            GAME.UI.log(t.farewell.first, "info");
            GAME.UI.log("得盘缠 " + t.farewell.silver + " 两，心境 +" + t.farewell.mind + "（现心境 " + p.mind + "）。", "loot");
        } else if (actionId === "visit_family") {
            p.visitFamilyDone = true;
            p.mind += t.visit_family.mind;
            GAME.UI.log(t.visit_family.first, "info");
            GAME.UI.log("尘缘断去，心境 +" + t.visit_family.mind + "（现心境 " + p.mind + "）。", "loot");
            GAME.Core.passTime(t.visit_family.months);
        } else if (actionId === "war_join_xingque" || actionId === "war_join_luanxing") {
            // 两强争海：投效参战（元婴门禁 + 身在对应总坛，校验在 Faction.warJoin 内）
            if (GAME.Faction && GAME.Faction.warJoin) {
                GAME.Faction.warJoin(actionId === "war_join_xingque" ? "xingque" : "luanxing");
                return true;
            }
            GAME.UI.log("海面上风平浪静，暂无战事可投。", "system");
        } else if (actionId === "heisha_raid") {
            // 云京·夜探皇宫：交由幽冥教副本模块接管
            if (GAME.Heisha) { GAME.Heisha.start(); return true; }
            GAME.UI.log("皇城的方向夜云低垂，时机未至。", "system");
        } else if (actionId.indexOf("heisha_guard_") === 0) {
            if (GAME.Heisha) GAME.Heisha.challenge(actionId.slice("heisha_guard_".length));
            return true;
        } else if (actionId === "heisha_spider") {
            if (GAME.Heisha) GAME.Heisha.fightSpider();
            return true;
        } else if (actionId === "heisha_boss") {
            if (GAME.Heisha) GAME.Heisha.fightBoss();
            return true;
        } else if (actionId === "heisha_resume") {
            if (p.heisha) p.heisha.left = false;
            GAME.UI.updateUI();
            return true;
        } else if (actionId === "mo_house") {
            // 交由景阳城玄机世家主线模块接管
            GAME.Jiayuan.start();
            return true;
        } else if (actionId === "join_sect") {
            // 拜山唯一出口：走 Tainan.joinByToken（扣令牌、发门籍、发赐物、记图鉴秘闻都在里面）
            if (!GAME.Tainan || !GAME.Tainan.joinByToken) { GAME.UI.log("山门今日无人当值。", "system"); return false; }
            var joined = GAME.Tainan.joinByToken();
            // 拜入之后「门派」页签才解锁——顺势点亮并切过去，免得玩家还在地图上找下一步
            if (joined && GAME.UI && GAME.UI.switchTab) GAME.UI.switchTab("sect");
            return joined;
        }
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 世俗盘缠：1 枚灵石兑 100 两白银 ----------
    exchangeStone: function (stones) {
        var p = GAME.State.p();
        stones = stones || 1;
        if (p.isDead) return false;
        if (p.spiritStones < stones) {
            GAME.UI.log("你身上没有那么多灵石。", "system");
            GAME.UI.updateUI();
            return false;
        }
        var rate = this.cfg().silver.stoneToSilver;
        p.spiritStones -= stones;
        p.silver += stones * rate;
        GAME.UI.log("你向行商兑了 " + stones + " 枚灵石，换得 " + (stones * rate) + " 两白银。（现银 " + p.silver + " 两）", "loot");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 章节地图（Increment 2：章节为皮） ----------
    // 当前篇章：身在天星海即星海篇；其余按境界阈值回落
    chapterOf: function (realmIndex, location) {
        if (location === "luanxing_hai") return "star";
        if (realmIndex >= GAME.DATA.YUANING_GATE_INDEX) return "yuanying";
        if (realmIndex >= 16) return "jiedan";
        if (realmIndex >= 13) return "zhuji";
        return "qi";
    },

    currentChapter: function () {
        var p = GAME.State.p();
        return this.chapterOf(p.realmIndex, p.location);
    },

    // 章节列表 + 当前章标记 + 是否已触及（达到该境界段即算"到过"）
    chapters: function () {
        var self = this, p = GAME.State.p(), cur = this.currentChapter();
        return (this.cfg().chapters || []).map(function (c) {
            return {
                id: c.id, name: c.name, desc: c.desc, minRealm: c.minRealm,
                art: c.art, realmRange: c.realmRange, signature: c.signature,
                current: c.id === cur,
                reached: p.realmIndex >= (c.minRealm || 0),
            };
        });
    },

    // 节点动态归属章节：碎星海恒属星海篇；筑基陆地节点在结丹后升入结丹篇
    nodeChapter: function (n, ri) {
        if (n.id === "luanxing_hai") return "star";
        // 青梧谷/云京等宗门地：结丹后「升篇」归结丹章（阈值取 JIEDAN_GATE_INDEX，勿写死下标）
        if (n.chapter === "zhuji" && ri >= GAME.DATA.JIEDAN_GATE_INDEX) return "jiedan";
        return n.chapter || "qi";
    },

    // 按章节分组节点（动态归属；含解锁态 / 当前所在地 / 退役标记）
    atlasByChapter: function () {
        var self = this, p = GAME.State.p(), ri = p.realmIndex, cur = this.currentChapter(), out = {};
        (this.cfg().chapters || []).forEach(function (c) { out[c.id] = { chapter: c, nodes: [] }; });
        this.cfg().nodes.forEach(function (n) {
            var dch = self.nodeChapter(n, ri);
            if (!out[dch]) {
                var meta = (self.cfg().chapters || []).filter(function (c) { return c.id === dch; })[0];
                out[dch] = { chapter: meta || { id: dch, name: dch }, nodes: [] };
            }
            var u = self.nodeUnlocked(n.id);
            out[dch].nodes.push({
                id: n.id, name: n.name, kind: n.kind,
                unlocked: u.ok, lockMsg: u.ok ? "" : u.msg,
                reqRealmName: (GAME.DATA.REALMS[n.reqRealm || 0] || {}).name || "",
                teaser: n.teaser || "", here: p.location === n.id,
                inCurrent: (dch === cur),
                retired: (n.id === "tainan_gu" && self.marketRetired()),
            });
        });
        return out;
    },

    // 低阶坊市退役：玩家已离开练气篇（进入筑基及以上），苍南谷散修坊市再不活跃
    marketRetired: function () {
        return this.currentChapter() !== "qi";
    },

    // ---------- 章节独立地图页（Increment 3） ----------
    _activeChapter: null,   // 当前选中的篇章标签（null = 跟随 currentChapter）

    // 当前展示的篇章：未手动选时跟随当前篇
    activeChapter: function () {
        if (this._activeChapter) return this._activeChapter;
        return this.currentChapter();
    },

    // 切换篇章标签（由 UI 标签点击调用）
    setActiveChapter: function (id) {
        this._activeChapter = id;
    },

    // 章节境界区间（用于筛选本篇妖物 / 机缘）
    chapterRealmRange: function (id) {
        var c = (this.cfg().chapters || []).filter(function (x) { return x.id === id; })[0];
        return (c && c.realmRange) ? c.realmRange : [0, 99];
    },

    // 本篇妖物：从路遇池按章节境界区间取并集（去重），并解析 MONSTERS 名字/描述
    monstersOf: function (id) {
        var range = this.chapterRealmRange(id);
        var pool = (GAME.DATA.MAP_ENCOUNTERS && GAME.DATA.MAP_ENCOUNTERS.pool) || [];
        var seen = {}, out = [];
        pool.forEach(function (e) {
            if (e.maxRealm < range[0] || e.minRealm > range[1]) return;   // 与本章区间无交集
            if (seen[e.monster]) return;
            seen[e.monster] = true;
            var def = null;
            (GAME.DATA.MONSTERS || []).forEach(function (m) { if (m.id === e.monster) def = m; });
            out.push({ id: e.monster, name: def ? def.name : e.monster, desc: def ? (def.desc || "") : "" });
        });
        return out;
    },

    // 本篇机缘：章节专属风物/事件描述
    signaturesOf: function (id) {
        var c = (this.cfg().chapters || []).filter(function (x) { return x.id === id; })[0];
        return (c && c.signature) ? c.signature : [];
    },
};
