/* ================= 道途：结丹分途（法修 / 体修） =================
 * 结丹突破功成那一刻，金丹有阴阳两面，玩家自此择一而终：
 *   法修（基准）：数值不作增减——神识驭物、施法御器，结丹斗法中的正途
 *   体修：攻击 / 防御 ×1.25、气血上限 ×1.15，换取神识上限 ×0.7
 *          （傀儡齐射、布阵耗神俱受掣；独有魔道炼体功法《赤明魔体诀》）
 * 设计锚点（一律挂既有唯一出口，不另开平行结构）：
 *   - getStats()（js/state.js）             消费 atkDefMul  —— 属性唯一派生出口
 *   - foundationMaxSpirit（realms_foundation.js）消费 spiritMul —— 神识上限唯一出口
 *   - _rollBreakthrough 的 maxHp 落位（js/core.js）  消费 hpMul
 *   - Breakthrough.plan（js/breakthrough.js）        消费 recoilMul —— 突破反噬修正
 *   - p.pendingEvent + chooseEventOption（js/core.js）承载 choose_path 抉择
 * 道途一经择定不可更改——是根本选择，不是可刷的 buff。
 */
(function () {
    var GAME = window.GAME = window.GAME || {};
    GAME.DATA = GAME.DATA || {};

    GAME.DATA.PATHS = {
        fa: { id: "fa", name: "法修", atkDefMul: 1, hpMul: 1, spiritMul: 1,
              desc: "以神为用。神识驭物、施法御器，结丹之后仍是斗法中的正途。" },
        ti: { id: "ti", name: "体修", atkDefMul: 1.25, hpMul: 1.15, spiritMul: 0.7,
              desc: "以体为炉。筋骨气血远胜同阶，神识却随之缩水，驭器布阵皆受掣。" },
    };

    /* 结丹道途抉择事件：金丹初凝时由 Path.offer 挂起，二选一，不可逆。
     * outcome type "pathmod" 由 core.resolveEventOutcomes 分派到 Path.set。 */
    GAME.DATA.PATH_EVENTS = {
        choose_path: {
            id: "choose_path",
            text: "金丹初凝，道途自分。你于静室内视丹田——那枚金丹竟有阴阳两面：一面温润中正，可养神识、驭万器；一面刚猛炽烈，可壮筋骨、横刀立马。你心知肚明：此后修行便如分水岭，再难两全。",
            choices: [
                {
                    text: "取阳刚一面，以体为炉——肉身即道基",
                    tip: "体修：攻击/防御 +25%，气血上限 +15%；神识上限 −30%（傀儡齐射与布阵俱受掣）",
                    outcomes: [{ type: "pathmod", path: "ti", chance: 1,
                        text: "你抉定体修之道。金丹阳面炽光暴涨，筋骨血肉如经重铸——此后一刀一剑，皆以肉身相抵。" }],
                },
                {
                    text: "取温润一面，以神为用——神识即道基",
                    tip: "法修：神识驭物、施法御器为正途（不作增减，体修之利的反面）",
                    outcomes: [{ type: "pathmod", path: "fa", chance: 1,
                        text: "你抉定法修之道。金丹阴面温光流转，灵台一片澄澈——此后神识所至，万器俯首。" }],
                },
            ],
        },
    };

    GAME.Path = {
        get: function (p) { return (p && p.cultivationPath) || "fa"; },
        isTi: function (p) { return this.get(p) === "ti"; },
        isFa: function (p) { return this.get(p) === "fa"; },
        name: function (p) { var d = GAME.DATA.PATHS[this.get(p)]; return d ? d.name : "法修"; },
        def: function (p) { return GAME.DATA.PATHS[this.get(p)] || GAME.DATA.PATHS.fa; },
        atkDefMul: function (p) { return this.def(p).atkDefMul; },
        hpMul: function (p) { return this.def(p).hpMul; },
        spiritMul: function (p) { return this.def(p).spiritMul; },

        /* 面板一行说明（修行录·道途行） */
        desc: function (p) {
            var d = this.def(p), bits = [];
            if (d.atkDefMul !== 1) bits.push("攻击/防御 +" + Math.round((d.atkDefMul - 1) * 100) + "%");
            if (d.hpMul !== 1) bits.push("气血上限 +" + Math.round((d.hpMul - 1) * 100) + "%");
            if (d.spiritMul !== 1) bits.push("神识上限 " + (d.spiritMul < 1 ? "−" : "+") + Math.abs(Math.round((d.spiritMul - 1) * 100)) + "%");
            if (!bits.length) bits.push("神识驭物、施法御器，结丹斗法正途");
            return bits.join("，");
        },

        /* 突破反噬修正唯一出口：《赤明魔体诀》反噬 ×0.85（魔道炼体功法，仅体修可习） */
        recoilMul: function (p) {
            if (!p || !p.spells || !p.spells.chiming_moti) return 1;
            var sp = (GAME.DATA.SPELLS && GAME.DATA.SPELLS.chiming_moti) || {};
            return sp.recoilMul || 1;
        },

        /* 挂起道途抉择（结丹功成那一息调用；已择定则不再挂） */
        offer: function (p) {
            if (!p || p.pathChosen) return false;
            p.pendingEvent = { eventId: "choose_path" };
            return true;
        },

        /* 择定：唯一写入口。一经择定不可更改；体修当场补足气血上限差。 */
        set: function (p, id) {
            if (!p) return false;
            var d = GAME.DATA.PATHS[id];
            if (!d) return false;
            if (p.pathChosen) {
                if (GAME.UI) GAME.UI.log("道途已定，再无反悔之余地。", "system");
                return false;
            }
            p.cultivationPath = id;
            p.pathChosen = true;
            if (d.hpMul !== 1) {
                var old = p.maxHp || 0;
                p.maxHp = Math.round(old * d.hpMul);
                p.currentHp = Math.min(p.maxHp, (p.currentHp || 0) + (p.maxHp - old));
            }
            if (GAME.UI) GAME.UI.log("【道途·" + d.name + "】" + d.desc + "（此后不可更易）", "moment");
            if (GAME.Chronicle) GAME.Chronicle.narrate(id === "ti" ? "ti_path_chosen" : "jiedan_reached", p);
            return true;
        },
    };
})();
