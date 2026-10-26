/* =========================================================
 * js/goals.js —— 动态当前目标（里程碑链）
 *   纯计算模块：依据玩家状态挑出"下一个该做的事"，不写状态、不碰 DOM。
 *   表现层由 GAME.UI.updateUI 调用 current() 后渲染到 #goal-banner。
 *   设计要点：
 *     ① 紧急目标（中毒/追杀/泄露/觊觎）优先级最高，压过主线
 *     ② 主线按"练气剧情 → 拜入宗门 → 筑基丹 → 突破 → 云京 → 结丹"单链推进
 *     ③ 每个目标给"还差什么"的具体缺口，而不是空泛的口号
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Goals = {

    // ---------- 小工具 ----------
    _has: function (p, itemId) {
        return !!(p.inventory && p.inventory[itemId] > 0);
    },
    _qty: function (p, itemId) {
        return (p.inventory && p.inventory[itemId]) || 0;
    },
    _name: function (itemId) {
        var it = GAME.DATA && GAME.DATA.ITEMS && GAME.DATA.ITEMS[itemId];
        return it ? it.name : itemId;
    },
    _realmName: function (idx) {
        var R = GAME.DATA && GAME.DATA.REALMS;
        return (R && R[idx]) ? R[idx].name : ("第" + idx + "境");
    },
    // 阴毒倒计时的人话剩余量：满一年报「X 年」，不足一年报「X 个月」
    _yinduLeft: function (y) {
        var m = Math.max(0, (y && y.months) || 0);
        if (m >= 12) return (Math.round((m / 12) * 10) / 10) + " 年";
        return m + " 个月";
    },

    // 筑基三味主药（血色禁地 / 血月试炼产出）
    HERBS: ["herb_tianling", "herb_yumo", "herb_zihou"],

    // ---------- 目标定义（顺序即优先级：越靠前越先做） ----------
    DEFS: [
        // ===== 紧急：活下去 =====
        // 阴毒是全游戏唯一"倒计时归零即道消"的 debuff，故置于全部目标之首（含其它紧急项）。
        // 文案按玩家所处环节动态收窄：服下解药 → 城内寻人 → 赴城途中 → 线索已断另寻他法。
        {
            id: "yindu", urgent: true, crisis: "poison",
            when: function (p) { return !!p.yindu; },
            done: function () { return false; },
            text: function (p) {
                var G = GAME.Goals, left = G._yinduLeft(p.yindu);
                if (G._has(p, "nuan_yang_bao_yu")) return "暖阳宝玉在手 · 即刻服下解去阴毒";
                if (p.location === "jiayuan_cheng" && !p.jiayuanDone) {
                    return "探访城中【墨府 / 玄机世家】，寻取克制阴毒之物";
                }
                if (p.jiayuanDone) return "阴毒噬骨（仅余 " + left + "）· 速寻解毒之法";
                return "阴毒噬心（剩 " + left + "）· 赴景阳城寻解药";
            },
            hint: function (p) {
                var G = GAME.Goals, left = G._yinduLeft(p.yindu);
                if (G._has(p, "nuan_yang_bao_yu")) return "丹药页服下，阴毒立解——别再拖";
                if (p.location === "jiayuan_cheng" && !p.jiayuanDone) {
                    return "颜氏与玄机世家都握有半条线索；此地亦有坊市可寻暖阳宝玉";
                }
                if (p.jiayuanDone) {
                    return "玄机世家线索已断（剩 " + left + "），改走坊市 / 黑市求暖阳宝玉或高阶解毒丹";
                }
                return "剩 " + left + "，暖阳宝玉或高阶丹药可镇压（坊市 / 黑市皆有流通）；阴毒未解时长关会被拒，硬闭只会坐死在蒲团上";
            },
            where: function (p) {
                if (GAME.Goals._has(p, "nuan_yang_bao_yu")) return "丹药";
                if (p.location === "jiayuan_cheng" && !p.jiayuanDone) return "";   // 已在此地：正文已说明找谁
                if (p.jiayuanDone) return "坊市 / 黑市";
                return "景阳城 / 坊市 · 黑市";
            },
            // 「前往」按钮的落点：有解药就翻背包，否则先奔景阳城／市集黑市
            whereTo: function (p) {
                if (GAME.Goals._has(p, "nuan_yang_bao_yu")) return { kind: "tab", tab: "bag" };
                if (p.location === "jiayuan_cheng" && !p.jiayuanDone) return null;
                if (p.jiayuanDone) return { kind: "tab", tab: "market", sub: "black" };
                return { kind: "map", node: "jiayuan_cheng" };
            }
        },
        {
            id: "shichong", urgent: true,
            when: function (p) { return !!p.shichong; },
            done: function () { return false; },
            text: "解去尸虫丸之毒",
            hint: function (p) {
                return "剩 " + (p.shichong.months || 0) + " 个月，期限一到必有一战";
            },
            where: "洞府",
            whereTo: { kind: "tab", tab: "home" }
        },
        {
            id: "causal", urgent: true,
            when: function (p) { return !!p.causal; },
            done: function () { return false; },
            text: "斩断因果追查",
            hint: function (p) {
                return "尚余 " + (p.causal.months || 0) + " 个月，高阶修士循迹而来";
            },
            where: "远遁 / 敛息"
        },
        {
            id: "leak", urgent: true,
            when: function (p) { return (p.leak || 0) >= 80; },
            done: function () { return false; },
            text: "压下百草园的药香泄露",
            hint: function (p) {
                return "泄露 " + Math.floor(p.leak) + "/100，下月长老神识将掠过药园";
            },
            where: "百草园",
            whereTo: { kind: "tab", tab: "home" }   // 百草园在洞府页
        },
        {
            id: "risk", urgent: true,
            when: function (p) { return (p.marketRiskValue || 0) >= 80; },
            done: function () { return false; },
            text: "避开结丹修士的觊觎",
            hint: function (p) {
                return "觊觎 " + Math.floor(p.marketRiskValue) + "/100，离开坊市恐被拦路";
            },
            where: "敛气 / 暂避"
        },

        // ===== 主线：练气期 =====
        {
            id: "qixuan",
            when: function (p) { return !p.isDead; },
            done: function (p) { return !!p.qixuan && p.qixuan.act >= 7; },
            text: "走完苍梧门开局六幕",
            hint: function (p) {
                var act = (p.qixuan && p.qixuan.act) || 1;
                // act>=6 = 前五幕已了、第六幕由「突破练气四层」唤起（qixuan.onBreakthroughFour）
                // 此时若还写「第 6 幕 / 共 6 幕」，玩家会以为有一步可点，实际无事可做 → 说清触发条件
                if (act >= 6) {
                    return "前五幕已了——待你突破练气四层，墨师翻脸那一幕自会找上门（当前 " +
                        GAME.Goals._realmName(p.realmIndex) + "）";
                }
                return "当前第 " + act + " 幕 / 共 6 幕";
            },
            where: "苍梧门",
            goto: function () {                       // 目标横幅「前往：苍梧门」可点击 → 直接跳转开幕
                if (!GAME.Qixuan) return;
                if (!GAME.State.p().qixuan) GAME.Qixuan.start();   // 尚未启幕：开演六幕第一幕（炼骨崖考核）
                else GAME.UI.updateUI();                          // 已进行中：重绘让紧急面板优先显示六幕剧情
            }
        },
        {
            id: "tainan",
            when: function (p) { return !p.sectId; },
            done: function (p) { return !!(p.tainan && p.tainan.leitaiDone); },
            // 已握升仙令的玩家不该再被赶去擂台：原著里锈牌本身就是通行证，
            // 「进前三方可得升仙令」是错的口径（擂台实际只发筑基丹），一并改掉。
            text: function (p) {
                return GAME.Goals._has(p, "shengxian_ling")
                    ? "持升仙令赴苍南谷，免试拜入山门"
                    : "赴苍南小会，夺一席之地";
            },
            hint: function (p) {
                var G = GAME.Goals;
                if (G._has(p, "shengxian_ling")) {
                    var at = (p.location === "tainan_gu")
                        ? "——人已到谷中，到【此地可为】点「持升仙令面见宗门长老」即可" : "";
                    return (p.shengxianLore
                        ? "锈牌即是通行令，不必再上擂台；你已参透「以令映纹」的口诀，验令长老另有厚赐"
                        : "锈牌即是通行令，不必再上擂台；持令者连苍南谷外的掩形幻阵都可径直看破") + at;
                }
                var t = p.tainan || { leitai: 0 };
                return "擂台已胜 " + (t.leitai || 0) + " 场，进前三方可得筑基丹";
            },
            where: "苍南山",
            whereTo: { kind: "map", node: "tainan_gu" }
        },
        {
            id: "joinsect",
            when: function () { return true; },
            done: function (p) { return !!p.sectId; },
            text: function (p) {
                return GAME.Goals._has(p, "shengxian_ling")
                    ? "至苍南谷出示升仙令，拜入青梧谷"
                    : "凭升仙令拜入宗门";
            },
            hint: function (p) {
                if (GAME.Goals._has(p, "shengxian_ling")) {
                    // 人已站在谷里：别再让他去翻折叠块。大地图「此地可为」已挂出拜山按钮，
                    // 这里直接指到那一行（两边文案同源，改一处不漏另一处）。
                    if (p.location === "tainan_gu") {
                        return "人已在谷中——到【岚州舆图 · 此地可为】点「持升仙令面见宗门长老」，验令长老当场引你入门";
                    }
                    return "入谷后于【此地可为】出示升仙令即可，验令长老当场引你入门";
                }
                if (p.tainan && p.tainan.leitaiDone) {
                    return "擂台三场只换得筑基丹；拜山另需一枚升仙令——玄机子遗箧里似压着一块铁牌";
                }
                return "拜入后方可领月俸、换宗门贡献";
            },
            where: function (p) { return GAME.Goals._has(p, "shengxian_ling") ? "苍南谷" : "宗门"; },
            whereTo: function (p) {
                // 宗门页在拜入前是锁着的，指过去只会挨一句「尚未拜入宗门」——有令时才给落点
                return GAME.Goals._has(p, "shengxian_ling") ? { kind: "map", node: "tainan_gu" } : null;
            }
        },
        {
            id: "herbs",
            when: function (p) { return p.realmIndex < 13; },
            done: function (p) {
                var self = GAME.Goals;
                return self.HERBS.every(function (h) { return self._has(p, h); });
            },
            text: "集齐筑基丹三味主药",
            hint: function (p) {
                var self = GAME.Goals, miss = [];
                self.HERBS.forEach(function (h) { if (!self._has(p, h)) miss.push(self._name(h)); });
                return miss.length ? ("还差：" + miss.join("、")) : "三药已齐，可开炉炼丹";
            },
            where: "血色禁地",
            whereTo: { kind: "tab", tab: "dungeon" }
        },
        {
            id: "zhengpin",
            when: function (p) {
                var self = GAME.Goals;
                return p.realmIndex < 13 &&
                       self.HERBS.every(function (h) { return self._has(p, h); });
            },
            done: function (p) { return GAME.Goals._has(p, "pill_zhengpin"); },
            text: "开炉炼制正品筑基丹",
            hint: function () { return "洞府丹房：三味主药 + 灵石 100；正品成功率 +50%"; },
            where: "洞府",
            whereTo: { kind: "tab", tab: "home" }
        },
        {
            id: "zhuji",
            when: function (p) { return p.realmIndex < 13; },
            done: function (p) { return p.realmIndex >= 13; },
            text: "突破至筑基期",
            hint: function (p) {
                var hasPill = GAME.Goals._has(p, "pill_zhengpin") || GAME.Goals._has(p, "pill_zhuji") || GAME.Goals._has(p, "fake_zhuji");
                return hasPill
                    ? ("当前 " + GAME.Goals._realmName(p.realmIndex) + "，修为 " + Math.floor(p.currentExp) + "，丹药已备")
                    : ("当前 " + GAME.Goals._realmName(p.realmIndex) + "，尚缺筑基丹一枚");
            },
            where: "洞府",
            whereTo: { kind: "tab", tab: "home" }
        },

        // ===== 主线：筑基期 =====
        {
            id: "heisha",
            when: function (p) { return p.realmIndex >= 13; },
            done: function (p) { return !!(p.heisha && p.heisha.bossDone); },
            text: "云京皇宫 · 夜战幽冥教",
            hint: function (p) {
                if (!p.heisha) return "尚未踏足云京皇宫";
                var g = 0, k;
                for (k in p.heisha.guards) if (p.heisha.guards[k]) g++;
                if (g < 4) return "已破血侍 " + g + "/4，血玉蜘蛛仍在甬道深处";
                if (!p.heisha.spiderDone) return "四大血侍已除，血玉蜘蛛封死寝殿甬道";
                return "蛛巢已破，可直入寝殿决战越皇";
            },
            where: "云京",
            whereTo: { kind: "map", node: "yuejing_cheng" }
        },
        {
            id: "jiedan",
            when: function (p) { return p.realmIndex >= 13; },
            done: function (p) { return p.realmIndex >= 18; },
            text: "凝丹功成，结丹后期圆满",
            hint: function (p) {
                return "当前 " + GAME.Goals._realmName(p.realmIndex) + "（结丹后期圆满 = 18/18）";
            },
            where: "洞府 / 历练",
            whereTo: { kind: "tab", tab: "home" }
        },
        {
            id: "yuanying",
            when: function (p) { return p.realmIndex === GAME.DATA.YUANING_GATE_SOURCE; },
            done: function (p) { return p.realmIndex >= GAME.DATA.YUANING_GATE_INDEX; },
            text: "碎丹成婴，凝结元婴",
            hint: function (p) {
                return "已至结丹后期圆满——下一步是元婴天堑。碎丹前可先备千年灵药（药圃/元神出游）或 3000 灵石请护法，铺路更稳";
            },
            where: "洞府",
            whereTo: { kind: "tab", tab: "home" }
        },
        {
            id: "yuanying_full",
            when: function (p) {
                return p.realmIndex >= GAME.DATA.YUANING_GATE_INDEX && p.realmIndex < 21;
            },
            done: function (p) { return p.realmIndex >= 21; },
            text: "元婴三阶圆满",
            hint: function (p) {
                return "当前 " + GAME.Goals._realmName(p.realmIndex) +
                    "——修炼之余可元神出游探秘境、赴碎星海参战或立派（皆元婴专属）";
            },
            where: "洞府 / 碎星海",
            whereTo: { kind: "tab", tab: "home" }
        },
        {
            id: "top",
            when: function (p) { return p.realmIndex >= 21; },
            done: function () { return false; },
            text: "元婴后期圆满 · 此界已至顶，余下自行择道",
            hint: function () { return "立派、星海争霸、收徒传承，或坐看轮回——此后的路没有标准答案"; },
            where: "碎星海",
            whereTo: { kind: "map", node: "luanxing_hai" }
        }
    ],

    // ---------- 下一步：把"目标"翻译成"现在就点这里" ----------
    // 参考《一念逍遥》《鬼谷八荒》：主界面常驻一个明确可点的下一步，
    // 玩家不该自己从一堆按钮里猜该干什么。目标条讲"要去哪"，action 讲"现在点哪"。
    _realm: function (p) {
        return (GAME.DATA && GAME.DATA.REALMS && GAME.DATA.REALMS[p.realmIndex]) || {};
    },
    // 修为是否已满（可尝试突破）
    _full: function (p) {
        var r = this._realm(p);
        if (r.needExp === null || r.needExp === undefined) return false;
        return p.currentExp >= r.needExp;
    },

    action: function (p) {
        if (!p || p.isDead) return null;
        var r = this._realm(p);
        var next = GAME.DATA.REALMS[p.realmIndex + 1];
        var maxHp = p.maxHp || 1;
        var hp = Math.max(0, Math.round(p.currentHp || 0));
        var hpPct = hp / maxHp;
        // 弥留：寿元只剩最后几年时，目标卡必须换一种说话方式——这时"再闭关"是有风险的
        var dy = (GAME.Mortality && GAME.Mortality.dying) ? GAME.Mortality.dying(p) : { near: false, left: 0 };
        var lastChance = dy.near ? "；寿元仅余 " + dy.left + " 年，这大概是最后一次冲关" : "";

        // ① 剧情 / 战斗 / 待决事件期间：先了结眼前的事（此时其它操作本就被锁）
        if (GAME.Qixuan && typeof GAME.Qixuan.active === "function" && GAME.Qixuan.active()) {
            return { kind: "story", label: "继续当前剧情", why: "剧情抉择期间其它操作锁死——先走完眼前这一幕", run: null };
        }
        if (p.combat || p.moEvent || p.pendingEvent || p.pendingMercy) {
            return { kind: "story", label: "先了结眼前之事", why: "有未决的战斗或事件，处理完才可闭关", run: null };
        }

        // ①b 阴毒在身：此刻一切都要让位于解毒——别再让"还差 N 修为"盖过生存危机
        if (p.yindu) {
            var yl = this._yinduLeft(p.yindu);
            if (this._has(p, "nuan_yang_bao_yu")) {
                return { kind: "go", label: "服下暖阳宝玉", why: "解药在手，服下即解——只剩 " + yl + "，没必要再耗", run: null };
            }
            if (p.location === "jiayuan_cheng" && !p.jiayuanDone) {
                return { kind: "go", label: "入墨府 / 玄机世家", why: "城内两处皆握有解药线索，先问人，再谈修为", run: null };
            }
            return {
                kind: "go",
                label: p.jiayuanDone ? "赴坊市 / 黑市寻解毒之物" : "前往景阳城寻解药",
                why: "阴毒尚余 " + yl + "，归零即道消——闭关与历练都得往后排" + lastChance,
                run: null
            };
        }

        // ② 已至当世顶境
        if (!next) {
            return { kind: "done", label: "此界已圆满", why: "已至顶境，往后只剩自行择道", run: null };
        }

        // ②b 门槛型顶境：needExp 为 null 但仍有下一境（如结丹后期→元婴的碎丹成婴）。
        // 这类境界不靠修为填满，而是靠突破时的专属事件（碎丹铺路）进阶，
        // 所以不应落入"闭关打坐"死循环，而该直接劝突破。
        if (next && (r.needExp === null || r.needExp === undefined)) {
            if (hpPct < 0.6) {
                return {
                    kind: "heal", label: "先打坐恢复气血",
                    why: "金丹将碎之境，气血仅 " + hp + "/" + maxHp + "——此时强行突破，失败会重伤",
                    run: function () { GAME.Core.meditate(); }
                };
            }
            return {
                kind: "go",
                label: "尝试突破（碎丹成婴）",
                why: "已至结丹后期圆满，下一步是元婴天堑——碎丹前可先备千年灵药或 3000 灵石护法更稳" + lastChance,
                run: function () { GAME.Core.breakthrough(); }
            };
        }

        // ③ 修为已满：先看气血，再劝突破
        if (this._full(p)) {
            var btPlan = null;
            try { btPlan = (GAME.Breakthrough && GAME.Breakthrough.plan) ? GAME.Breakthrough.plan(p) : null; } catch (e) { btPlan = null; }
            var ch = (btPlan && btPlan.ok) ? btPlan.successChance
                : ((typeof r.breakChance === "number") ? r.breakChance : null);
            var gate = (p.realmIndex === GAME.DATA.ZHUJI_GATE_INDEX);
            if (hpPct < 0.6) {
                return {
                    kind: "heal", label: "先打坐恢复气血",
                    why: "修为已满，但气血仅 " + hp + "/" + maxHp + "——此时强行突破，失败会重伤",
                    run: function () { GAME.Core.meditate(); }
                };
            }
            return {
                kind: "go",
                label: "尝试突破" + (ch !== null ? "（" + Math.round(ch * 100) + "%）" : ""),
                why: "修为已满，气血 " + hp + "/" + maxHp + (gate ? "，入手筑基丹更稳" : "") +
                     ((btPlan && btPlan.ok && btPlan.parts.length > 0)
                         ? "，筹备已加 +" + Math.round(btPlan.addSum * 100) + "%"
                         : "，灵脉/护法还能再凑") + "——可以一试" + lastChance,
                run: function () { GAME.Core.breakthrough(); }
            };
        }

        // ④ 修为未满：闭关打坐（时间是真预算——顺带报"还差多少、地里还有几株药"）
        var need = (r.needExp || 0) - Math.floor(p.currentExp || 0);
        var leftTxt = dy.near
            ? "；寿元仅余 " + dy.left + " 年——闭关前先算好，别把自己关死在蒲团上"
            : ((GAME.Time && GAME.Time.remainLabel) ? ("；寿元余 " + GAME.Time.remainLabel(p)) : "");
        var plotHint = "";
        if (GAME.Plot && GAME.Plot.status) {
            var ps = GAME.Plot.status(p);
            if (ps && ps.ready > 0) plotHint = "；药圃有 " + ps.ready + " 株满千年可收";
            else if (ps && ps.nextLeft != null) plotHint = "；药圃 " + ps.growing + " 株在长，最近 " + GAME.Plot._fmtMonths(ps.nextLeft) + "后可收";
        }
        // 与「尝试突破」按钮读同一份推演（Breakthrough.plan）：两处百分比必须同源。
        // 旧写法读 realm.breakChance 静态底子，按钮读 plan.successChance（已计入灵脉/护法/心境/丹道），
        // 于是同一时刻出现"58% 对 64%"打架（用户实测）。
        var chPlan = null;
        try { chPlan = (GAME.Breakthrough && GAME.Breakthrough.plan) ? GAME.Breakthrough.plan(p) : null; } catch (e) { chPlan = null; }
        // 「届时」＝修为填满那一刻，故读 chanceFull（修为进度驱动的境界当下这一把更低）
        var chNow = (chPlan && chPlan.ok) ? (chPlan.chanceFull || chPlan.successChance)
            : ((typeof r.breakChance === "number") ? r.breakChance : null);
        return {
            kind: "heal",
            label: "",   // 目标框底部不重复"闭关打坐（X月·+1修为）"——动作网格已有此按钮，此处只留差距信息
            why: "还差 " + need + " 修为可尝试突破" +
                 (chNow !== null ? "（届时成功率 " + Math.round(chNow * 100) + "%）" : "") +
                 plotHint + leftTxt,
            run: function () { GAME.Core.meditate(); }
        };
    },

    // ---------- 可并行支线（非主线、可随时顺手做的"小事"） ----------
    // 返回 [{text}]；目标横幅末尾一行小注，最多 3 条，不与主线/紧急项抢戏。
    // 设计原则：方法论型玩家也该知道"此刻还能做啥"——筑基/结丹后主线塌成空话时尤其有用。
    parallel: function (p) {
        if (!p || p.isDead) return [];
        // 有紧急项（阴毒/尸虫/因果/泄露/觊觎）时，当前目标就是它；并行支线不抢镜
        var cur = null;
        try { cur = this.current(); } catch (e) { cur = null; }
        if (cur && cur.urgent) return [];
        var self = this, out = [];
        var atYuan = p.realmIndex >= (GAME.DATA.YUANING_GATE_INDEX || 19);

        // ① 药圃待收（最通用的顺手事，任何境界都可能出现）
        if (GAME.Plot && GAME.Plot.status) {
            try {
                var ps = GAME.Plot.status(p);
                if (ps && ps.ready > 0) out.push({ text: "药圃 " + ps.ready + " 株灵药已熟，可回洞府收取" });
            } catch (e) {}
        }

        // ② 元婴专属支线：元神出游 / 星海战 / 立派
        // 这些在"元婴三阶圆满"主线 hint 里只是笼统提及，这里落成具体可做的勾选，不算重复
        if (atYuan) {
            if (GAME.Yuanying && GAME.Yuanying.canRoam) {
                try { var rc = GAME.Yuanying.canRoam(p); if (rc && rc.ok) out.push({ text: "元神可出游（云国 / 碎星海秘境）" }); } catch (e) {}
            }
            if (GAME.Cave2 && GAME.Cave2.atStarSea && GAME.Cave2.atStarSea()) {
                if ((p.warCd || 0) <= 0) out.push({ text: "碎星海战事正酣，可投效一方参战" });
            }
            var L = GAME.DATA && GAME.DATA.LINGSHAN;
            if (L && p.spiritStones >= L.cost) {
                out.push({ text: (GAME.Cave2 && GAME.Cave2.atStarSea && GAME.Cave2.atStarSea())
                    ? "灵石已足，可在碎星海开宗立派"
                    : "灵石已足，可赴碎星海开宗立派" });
            }
        }

        if (out.length > 3) out = out.slice(0, 3);
        return out;
    },

    // ---------- 取当前目标 ----------
    // 规则：先看紧急项，再按主线顺序取第一个"适用且未完成"的项。
    current: function () {
        var p = GAME.State.p();
        if (!p || p.isDead) return null;
        var i, d;
        for (i = 0; i < this.DEFS.length; i++) {
            d = this.DEFS[i];
            if (!d.urgent) continue;
            if (d.when(p) && !d.done(p)) return this._pack(d, p);
        }
        for (i = 0; i < this.DEFS.length; i++) {
            d = this.DEFS[i];
            if (d.urgent) continue;
            if (d.when(p) && !d.done(p)) return this._pack(d, p);
        }
        return null;
    },

    _pack: function (d, p) {
        return {
            id: d.id,
            urgent: !!d.urgent,
            crisis: d.crisis || "",
            text: typeof d.text === "function" ? d.text(p) : d.text,
            hint: d.hint ? (typeof d.hint === "function" ? d.hint(p) : d.hint) : "",
            where: typeof d.where === "function" ? (d.where(p) || "") : (d.where || ""),
            whereTo: d.whereTo || null,
            goto: d.goto
        };
    },

    // ---------- 「前往：XXX」这一行该落成什么动作（纯计算，执行交给 UI.goWhere） ----------
    // 返回 { kind, label, state, ... }：
    //   kind="tab"  切功能页签（市集 / 洞府 / 背包 / 副本…），sub="black" 时滚到地下黑市
    //   kind="map"  大地图地点：state=ok 一键动身 / blocked 指路并报出门槛 / here 已在当地
    //   kind="goto" 目标自带跳转函数（如苍梧门六幕开幕）
    //   kind="text" 没有可落点，原样当文本
    wherePlan: function (g, p) {
        if (!g || !g.where) return null;
        p = p || (GAME.State && GAME.State.p());
        if (!p) return null;
        var wt = g.whereTo;
        if (typeof wt === "function") wt = wt(p);
        if (!wt) {
            if (typeof g.goto === "function") return { kind: "goto", label: "前往：" + g.where + " ›", run: g.goto };
            return { kind: "text", label: "前往：" + g.where };
        }
        if (wt.kind === "tab") {
            return { kind: "tab", tab: wt.tab, sub: wt.sub || "", label: "前往：" + g.where + " ›" };
        }
        if (wt.kind !== "map") return { kind: "text", label: "前往：" + g.where };

        var M = GAME.Map;
        var node = (M && M.node) ? M.node(wt.node) : null;
        if (!node) return { kind: "text", label: "前往：" + g.where };
        var need = node.reqRealm || 0;
        var needName = (GAME.DATA.REALMS[need] || {}).name || "";
        // 人已经站在这儿：按钮没有意义，直接封掉（阴毒在城里时全靠这条）
        if (p.location === wt.node) {
            return { kind: "map", state: "here", disabled: true, node: wt.node, nodeName: node.name, label: "已在当地" };
        }
        var plan = { kind: "map", node: wt.node, nodeName: node.name, needName: needName, needRealm: need };
        var route = null, routes = (M && M.routes) ? M.routes() : [];
        routes.forEach(function (r) { if (r.targetId === wt.node) route = r; });
        var gate = (p.realmIndex < need) ? ("（需" + needName + "）") : "";
        if (!route) {
            // 不直接相邻：尝试多跳寻路（BFS 过全部道路），能到就一键动身并提示途经中转
            var path = (M && M.findPath) ? M.findPath(p.location, wt.node) : null;
            if (path && path.length) {
                var cities = [p.location], totM = 0, totS = 0;
                path.forEach(function (r) {
                    var nx = (r.from === cities[cities.length - 1]) ? r.to : r.from;
                    cities.push(nx); totM += r.months; totS += r.silver;
                });
                var transit = cities.slice(1, -1).map(function (id) { var n = M.node(id); return n ? n.name : id; });
                plan.state = "ok";
                plan.routePath = path.map(function (r) { return r.id; });
                plan.label = "前往：" + node.name + gate + " ›";
                plan.why = "途经" + (transit.length ? transit.join("、") + " " : "") + "中转，全程约 " +
                    totM + " 个月" + (totS > 0 ? "、盘缠 " + totS + " 两" : "") + "——点击即一路动身。";
                return plan;
            }
            plan.state = "blocked";
            plan.label = "前往：" + node.name + gate + " ›";
            plan.why = "此地尚在路途之外——先至与【" + node.name + "】相通的城镇，才好动身。";
            return plan;
        }
        plan.route = route.id;
        var chk = M.canTravel(route.id);
        if (chk.ok) {
            plan.state = "ok";
            plan.label = "前往：" + node.name + " ›";
        } else {
            plan.state = "blocked";
            plan.label = "前往：" + node.name + gate + " ›";
            plan.why = chk.msg;
        }
        return plan;
    },

    // ---------- 全部适用目标（供未来的"目标清单"面板使用） ----------
    list: function () {
        var p = GAME.State.p(), out = [];
        if (!p) return out;
        for (var i = 0; i < this.DEFS.length; i++) {
            var d = this.DEFS[i];
            if (!d.when(p)) continue;
            out.push({
                id: d.id,
                urgent: !!d.urgent,
                done: !!d.done(p),
                text: typeof d.text === "function" ? d.text(p) : d.text
            });
        }
        return out;
    }
};
