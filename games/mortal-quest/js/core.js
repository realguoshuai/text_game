/* =========================================================
 * js/core.js —— 核心循环层
 * 时间推进（月历）、寿元大限、突破反噬判定、
 * 打坐/催熟/炼丹/服药、历练事件调度与结算
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Core = {

    rand: function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },

    // ================= 时间推进 =================
    passTime: function (months) {
        var p = GAME.State.p();
        if (p.isDead) return;

        p.totalMonths += months;
        p.ageMonths += months;
        while (p.ageMonths >= 12) { p.ageMonths -= 12; p.ageYears += 1; }

        // 承露瓶被动充能：每满 12 个月凝一滴绿液
        p.liquidCharge += months;
        while (p.liquidCharge >= 12) {
            p.liquidCharge -= 12;
            p.liquid += 1;
            GAME.UI.log("月华流转，承露瓶悄然凝聚出一滴绿液。", "success");
            if (GAME.Moments) GAME.Moments.fire("first_liquid");
        }

        // 内门师叔月俸：筑基后按月发放（中阶灵石折算）
        if (GAME.Cave2 && p.innerSect) {
            for (var mi = 0; mi < months; mi++) GAME.Cave2.grantStipend();
        }

        // 灵脉产出：筑基后独辟灵峰，灵脉自行吐纳灵石与灵草（挂机收益）
        if (GAME.Cave2 && p.peak) GAME.Cave2.grantVeinOutput(months);

        // 坊市定期换货
        if (p.totalMonths >= p.marketNextRefresh) {
            GAME.Market.refreshGoods();
            p.marketNextRefresh += GAME.DATA.MARKET.refreshMonths;
            GAME.UI.log("坊市又换了一批新货。", "system");
        }

        // 旧货摊定期换货（与坊市同节奏；买空后不再即时补货，须等下个换货期）
        if (p.totalMonths >= p.junkNextRefresh) {
            GAME.BlackMarket.refreshJunk();
            p.junkNextRefresh += GAME.DATA.MARKET.refreshMonths;
            GAME.UI.log("坊市旧货摊又上了一批新货。", "system");
        }

        // 地下黑市：每 3 月轮换一批筑基材料（妖兽精魄 / 天火晶，限量）
        if (GAME.BlackMarket && GAME.BlackMarket.tickRotation) GAME.BlackMarket.tickRotation();

        // 气血恢复：打坐行功疗伤——每过一月回复 10 点（练气期一次打坐 3~6 月，回 30~60）
        if (p.currentHp < p.maxHp) {
            p.currentHp = Math.min(p.maxHp, p.currentHp + months * 10);
        }

        // 体内阴毒倒计时（玄机子战后 debuff）：按月递减，归零道消身陨
        if (p.yindu) {
            p.yindu.months -= months;
            if (p.yindu.months <= 0) {
                p.isDead = true;
                p.deathReason = "体内阴毒发作，道消身陨";
                GAME.UI.log("两年之期已到，暖阳宝玉未得，体内阴毒爆发——你道消身陨！", "danger");
                GAME.UI.setDead();
                return;
            }
        }

        // 尸虫丸之毒（六幕剧情·墨师逼命）：12 个月倒计时——归零前须破四层触发夺舍对决，
        // 否则玄机子亲自上门收人（强制开战，不无预警删档；战而胜之毒自解）
        if (p.shichong && !p.moEvent) {
            p.shichong.months -= months;
            if (p.shichong.months <= 3 && p.shichong.months > 0) {
                GAME.UI.log("【警告】尸虫丸毒发将近（余 " + p.shichong.months + " 个月）！玄机子的眼神一天比一天冷——速速冲击练气第四层！", "danger");
            }
            if (p.shichong.months <= 0) {
                p.shichong = null;
                GAME.UI.log("【尸虫丸毒发】玄机子阴笑着推门而入：「小子，到期了。」——夺舍之战，避无可避！", "danger");
                GAME.MoEvent.start();
                GAME.UI.updateUI();
                return;
            }
        }

        // 每月寄银回家（六幕剧情·幽篁谷日常解锁）：尽凡俗孝道，养修道心境
        if (p.homeSupport) {
            p.homeDue = (p.homeDue || 0) + months;
            while (p.homeDue >= 12) {
                p.homeDue -= 12;
                if (p.silver >= 10) {
                    p.silver -= 10;
                    p.mind = (p.mind || 0) + 2;
                    GAME.UI.log("你托商队捎回 10 两白银，家中回信说一切都好——心头一定，心境 +2。", "info");
                } else {
                    GAME.UI.log("这个年头的盘缠也凑不齐，寄银落空——家中来信只说勿念。", "warning");
                }
            }
        }

        // 因果追查：斩杀修士未毁尸灭迹，因果缠身——每月有概率被高阶修士循因果寻上家门
        if (p.causal) {
            p.causal.months -= months;
            if (p.causal.months <= 0) {
                p.causal = null;
                GAME.UI.log("缠绕周身的因果之气终于散去，再无人能循迹寻仇。", "info");
            } else if (!p.combat && Math.random() < 0.10 * months) {
                GAME.UI.log("【因果寻仇】一道遁光落在门外——循着因果找上门来了！", "danger");
                GAME.Combat.start("causal_avenger");
                return;   // 战斗接管界面
            }
        }

        // 百草园结算（逻辑在 js/garden.js）：①管事明田半年结；②无职弟子暗田泄露值
        // 达 80 后的「神识掠园」查获。两者都在 Garden.tick 里，故须按「是否青梧谷门人」
        // 调用，而不能只看 p.garden——否则无职弟子的掠园预警永不兑现（死代码）。
        if (GAME.Garden && GAME.Garden.active && GAME.Garden.active()) GAME.Garden.tick(months);

        // 十年回顾：每满 10 年结算一次小结（js/review.js，纯展示）
        if (GAME.Review && GAME.Review.tick) GAME.Review.tick();

        this.checkLifeSpanWarning();
        this.checkDeath();
        this.checkAchievements();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // 大限预警：剩余寿元跌破 10/5/1 年各提醒一次（同一档只提醒一次）
    checkLifeSpanWarning: function () {
        var p = GAME.State.p();
        var left = GAME.State.maxAge() - p.ageYears;
        if (!p._warnFlags) p._warnFlags = {};
        var marks = [10, 5, 1];
        for (var i = 0; i < marks.length; i++) {
            var m = marks[i];
            if (left <= m && left > 0 && !p._warnFlags[m]) {
                p._warnFlags[m] = true;
                GAME.UI.log("【大限将近】你掐指一算，寿元仅余 " + left + " 年！若再无丹药延寿或破境筑基，此生休矣。", "danger");
            }
        }
    },

    // 成就道碑：遍历检查，新解锁则铭记于道碑
    checkAchievements: function () {
        var p = GAME.State.p();
        var list = GAME.DATA.ACHIEVEMENTS;
        for (var i = 0; i < list.length; i++) {
            var a = list[i];
            if (GAME.State.hasAchievement(a.id)) continue;
            var ok = false;
            switch (a.type) {
                case "realm":   ok = p.realmIndex >= a.value; break;
                case "zhuji":   ok = p.realmIndex >= 13; break;
                case "kill":    ok = p.stats.kills >= a.value; break;
                case "mercy":   ok = p.stats.mercies >= a.value; break;
                case "stone":   ok = p.spiritStones >= a.value; break;
                case "age":     ok = p.ageYears >= a.value; break;
                case "explore": ok = p.stats.explores >= a.value; break;
                case "karma":   ok = a.value < 0 ? (p.karma <= a.value) : (p.karma >= a.value); break;
            }
            if (ok && GAME.State.unlockAchievement(a.id)) {
                GAME.UI.log("【道碑铭记】" + a.name + "——" + a.desc, "loot");
            }
        }
    },

    // ================= 死亡判定（唯一出口） =================
    // 玄傀护主：致命伤时铁奴舍身挡劫（软着陆——不判死亡，玄傀魂体溃散待重唤）
    // 返回 true 表示已被玄傀救下。气血重创至一成，玩家重伤但保命。
    tryRescue: function (scene) {
        var p = GAME.State.p();
        if (p.companion && p.companion.hp > 0) {
            p.companion.hp = 0;   // 玄龟功护主，魂体溃散（可再以摄魂钟唤醒）
            p.currentHp = Math.max(1, Math.ceil(p.maxHp * 0.1));
            GAME.UI.log("千钧一发之际，铁奴【玄傀】浑身乌光暴涨，硬生生替你受了这" + (scene || "夺命") + "一击！玄傀魂体溃散暂离人间（可再以摄魂钟唤回），你重伤垂死却保住一命。", "success");
            return true;
        }
        return false;
    },

    checkDeath: function () {
        var p = GAME.State.p();
        if (p.isDead) return;
        var limit = GAME.State.maxAge();
        if (p.ageYears >= limit) {
            p.isDead = true;
            p.deathReason = "寿元 " + limit + " 岁大限已至";
            GAME.UI.log("大限已至！你终究未能打破天地桎梏，寿元耗尽，坐化于洞府之中……", "danger");
        } else if (p.currentHp <= 0) {
            // 玄傀护主软着陆：致命气血耗损先由铁奴挡下
            if (this.tryRescue()) {
                GAME.UI.log("你伏在玄傀溃散前的最后一道乌光里，喘息良久——修道路上，又欠下一条命。", "warning");
            } else {
                p.isDead = true;
                p.deathReason = "气血耗尽，道消身陨";
                GAME.UI.log("经脉寸断，气血耗尽——道消身陨，修仙路断于此。", "danger");
            }
        }
        if (p.isDead) GAME.UI.setDead();
    },

    // ================= 洞府动作 =================

    // 打坐：伪灵根每次只得 1 修为——凡人流核心压迫。
    // 耗时随境界递增（练气低层 3 月、高层 6 月、筑基 8 月），低境不空耗寿元。
    meditate: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        var months = GAME.DATA.REALMS[p.realmIndex].meditateMonths || 3;
        var extra = (GAME.Home && GAME.Home.meditateExp) ? GAME.Home.meditateExp() : 0;
        var gain = 1 + extra;
        p.currentExp += gain;
        GAME.UI.log("你闭门吐纳 " + months + " 个月，杂灵根吸纳的灵气微乎其微，修为 +" + gain +
            (extra ? "（藏经阁 +" + extra + "）" : "") + "。", "info");
        this.passTime(months);
    },

    // 批量打坐：连修 n 次（n<=0 或 "full" 表示一直修到本境圆满）
    // 玩家视角：一下一下点"闭关打坐"不是玩法，是体力活。
    meditateTimes: function (n) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return 0;
        var done = 0;
        var toFull = (n === "full");
        var limit = toFull ? 300 : Math.max(1, n | 0);
        while (done < limit) {
            if (p.isDead || p.combat || p.pendingEvent || p.pendingMercy) break;
            if (!toFull) { /* 固定次数 */ }
            else {
                var realm = GAME.DATA.REALMS[p.realmIndex];
                if (realm.needExp == null || p.currentExp >= realm.needExp) break;
            }
            this.meditate();
            done += 1;
        }
        if (done > 1) GAME.UI.log("你一连闭关苦修 " + done + " 轮，出关时蒲团上落了一层灰。", "system");
        GAME.UI.updateUI();
        return done;
    },

    // 绿液催熟：1 滴 -> 百年灵药；5 滴 -> 千年灵药
    // 宗门弟子催熟私药有被神识查获之险；百草园管事借【灵眼之泉】催熟——0% 查获，且两成概率灵泉双收。
    catalyze: function (drops, herbId) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        if (p.liquid < drops) {
            GAME.UI.log("瓶中绿液不足 " + drops + " 滴，强行催动毫无反应。", "system");
            GAME.UI.updateUI();
            return;
        }
        p.liquid -= drops;
        GAME.State.addItem(herbId, 1);
        GAME.UI.log("绿液化作雾气没入药苗，须臾之间，一株【" + GAME.DATA.ITEMS[herbId].name + "】长成！", "success");
        if (GAME.Moments) GAME.Moments.fire("first_catalyze", GAME.DATA.ITEMS[herbId].name);

        var g2 = GAME.DATA.CONTENT.SECT2 ? GAME.DATA.CONTENT.SECT2.garden : null;
        if (GAME.Garden) {
            // 百草园泄露值结算：明田管事 0% 泄露，暗田看泄露值（js/garden.js）
            GAME.Garden.afterCatalyze(herbId);
        } else if (p.garden && g2 && Math.random() < g2.springBonusChance) {
            GAME.State.addItem(herbId, 1);
            GAME.UI.log("灵眼之泉灵机涌动，泉眼旁竟又洇出一株同种灵药——双收！", "success");
        }
        this.passTime(1);
    },

    // 配方是否可炼：返回缺失说明（可炼则返回 null）
    craftCheck: function (recipe) {
        var p = GAME.State.p();
        var missing = [];
        for (var h in recipe.herbs) {
            var need = recipe.herbs[h];
            var have = GAME.State.countItem(h);
            if (have < need) missing.push(GAME.DATA.ITEMS[h].name + "×" + need + "(缺" + (need - have) + ")");
        }
        if (p.spiritStones < recipe.stones) missing.push("灵石不足(需" + recipe.stones + ")");
        return missing.length ? missing.join("、") : null;
    },

    // 炼丹门槛：练气三层后玄机子才传《炼丹初步》（前期锁死，用户校准）
    canAlchemy: function () {
        var p = GAME.State.p();
        return p.realmIndex >= (GAME.DATA.ALCHEMY.unlockRealm || 2);
    },

    // 炼丹：由玩家点选配方（不再自动贪心匹配，避免高阶丹药材被低阶丹抢走）
    alchemy: function (index) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        if (!this.canAlchemy()) {
            GAME.UI.log("你连火候都看不懂——玄机子的炼丹手艺不外传，待你练气三层再说不迟。", "system");
            GAME.UI.updateUI();
            return;
        }
        var r = GAME.DATA.RECIPES[index];
        if (!r) return;
        // 丹方激活：须先习得对应丹方方可开炉
        if (r.recipe && !(p.recipes && p.recipes[r.recipe])) {
            var rd = GAME.DATA.ITEMS[r.recipe];
            var pn = (rd && rd.learns && GAME.DATA.ITEMS[rd.learns]) ? GAME.DATA.ITEMS[rd.learns].name : "该";
            GAME.UI.log("你尚未习得「" + pn + "」丹方，无从开炉——丹方可在黑市、秘境奇遇或副本中寻得。", "system");
            GAME.UI.updateUI();
            return;
        }
        var missing = this.craftCheck(r);
        if (missing) {
            GAME.UI.log("药材不齐，炉火空燃：" + missing + "。", "system");
            GAME.UI.updateUI();
            return;
        }
        for (var h in r.herbs) GAME.State.removeItem(h, r.herbs[h]);
        var cost = Math.max(0, Math.round(r.stones * (1 - (GAME.Home ? GAME.Home.alchemyDiscount() : 0))));
        var made = 1;
        if (GAME.Home && Math.random() < GAME.Home.doublePillChance()) made = 2;
        p.spiritStones -= cost;
        GAME.State.addItem(r.pill, made);
        p.stats.alchemy += 1;
        GAME.UI.log("炉火青烟腾起——炼成【" + GAME.DATA.ITEMS[r.pill].name + "】×" + made + "！" +
            (made > 1 ? "（丹房火候到家，双丹同炉）" : "") + "（耗灵石 " + cost + "）", "success");
        if (GAME.Moments) GAME.Moments.fire("first_alchemy", GAME.DATA.ITEMS[r.pill].name);
        this.passTime(2);
    },

    // 服用丹药（zhuji 丹不能直接吃，只能突破时消耗）
    takePill: function (id) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        var item = GAME.DATA.ITEMS[id];
        var use = item && item.use;
        if (!use || !GAME.State.countItem(id)) return;
        if (use.zhuji) {
            GAME.UI.log("【筑基丹】药力霸道，须待突破筑基关口时服下，不可轻用。", "system");
            GAME.UI.updateUI();
            return;
        }
        // 四阶仙法门槛前置：层数不足时法术书原样退回（须在消耗物品之前拦下）
        var spellPre = (use.learnSpell && GAME.DATA.SPELLS) ? GAME.DATA.SPELLS[use.learnSpell] : null;
        if (spellPre && spellPre.req && (p.changchunLevel || 0) < spellPre.req) {
            GAME.UI.log("你翻开【" + item.name + "】，只觉字句晦涩如天书——此术需《青木功》第 " + spellPre.req + " 层方可参悟（现 " + p.changchunLevel + " 层）。姑且收回囊中。", "system");
            GAME.UI.updateUI();
            return;
        }
        GAME.State.removeItem(id);
        p.stats.pillsTaken += 1;
        if (use.exp) {
            p.currentExp += use.exp;
            GAME.UI.log("你服下【" + item.name + "】，滚滚药力在丹田化开，修为 +" + use.exp + "！", "success");
        }
        if (use.ageBonus) {
            p.ageBonus += use.ageBonus;
            GAME.UI.log("你服下【" + item.name + "】，一股暖意游走周身，寿元大限延长 " + use.ageBonus + " 年！（现大限 " + GAME.State.maxAge() + " 岁）", "success");
        }
        // 修习功法类（中品敛气术）：提升敛气等级，黑市更易隐匿脱身
        if (use.conceal) {
            p.concealLevel += use.conceal;
            GAME.UI.log("你参悟【" + item.name + "】，周身灵息渐敛，敛气等级升至 " + p.concealLevel + "。", "success");
        }
        // 《青木功续篇》：层数跃升（命中与异常抗性更固）
        if (use.changchunUp) {
            p.changchunLevel += use.changchunUp;
            GAME.UI.log("你修习【" + item.name + "】，青木功层数跃升至 " + p.changchunLevel + "！命中与异常抗性更固。", "success");
        }
        // 玄龟功 / 御风诀 / 控物术：永久面板加成
        if (use.defBonus) {
            p.defBonus += use.defBonus;
            GAME.UI.log("你依法修习【" + item.name + "】，皮膜筋骨渐如象甲，防御 +" + use.defBonus + "（现防御 " + GAME.State.getStats().def + "）。", "success");
        }
        if (use.speedBonus) {
            p.speedBonus += use.speedBonus;
            GAME.UI.log("你参悟【" + item.name + "】，身法轻灵许多，速度 +" + use.speedBonus + "（现速度 " + GAME.State.getStats().speed + "）。", "success");
        }
        if (use.spiritBonus) {
            p.spiritBonus += use.spiritBonus;
            GAME.UI.log("你习得【" + item.name + "】，御物由心，神识 +" + use.spiritBonus + "（现神识 " + GAME.State.getStats().spirit + "）。", "success");
        }
        if (use.atkBonus) {
            p.atkBonus += use.atkBonus;
            GAME.UI.log("你依法修习【" + item.name + "】，筋骨粗壮，攻击 +" + use.atkBonus + "（现攻击 " + GAME.State.getStats().atk + "）。", "success");
        }
        if (use.maxHpBonus) {
            p.maxHp += use.maxHpBonus;
            p.currentHp = Math.min(p.maxHp, p.currentHp + use.maxHpBonus);
            GAME.UI.log("你依法修习【" + item.name + "】，皮膜坚厚，气血上限 +" + use.maxHpBonus + "（现上限 " + p.maxHp + "）。", "success");
        }
        // 丹药专属：疗伤 / 心境 / 化煞（type:"pill" 方生效；修正回春散等 heal 失效旧疾）
        if (item.type === "pill") {
            if (use.heal) {
                var before = p.currentHp;
                p.currentHp = Math.min(p.maxHp, p.currentHp + use.heal);
                GAME.UI.log("你服下【" + item.name + "】，药力温养四肢百骸，气血回复 " + (p.currentHp - before) + " 点（现 " + p.currentHp + "/" + p.maxHp + "）。", "success");
            }
            if (use.mind) {
                p.mind = (p.mind || 0) + use.mind;
                GAME.UI.log("你服下【" + item.name + "】，灵台一片空明，心境 +" + use.mind + "（现 " + p.mind + "）。", "info");
            }
            if (use.shaQi) {
                var d = use.shaQi;
                p.shaQi = Math.max(0, p.shaQi + d);
                GAME.UI.log("你服下【" + item.name + "】，地脉煞气随药力涤荡——煞气 " + (d < 0 ? ("-" + (-d)) : ("+" + d)) + "（现 " + p.shaQi + "）。", "info");
            }
        }
        // 魔道功法：修习沾染煞气（正道修士侧目，黑市销赃更易被尾随）；丹药净化煞气改由下方 pill 分支处理
        if (use.shaQi && item.type !== "pill") {
            p.shaQi += use.shaQi;
            GAME.UI.log("一股阴煞之气缠绕周身——煞气 +" + use.shaQi + "。此术虽利，却也惹人觊觎。", "danger");
        }
        // 法术：习得可在斗法中反复施放的术法（门槛校验已在消耗物品前完成）
        if (use.learnSpell) {
            var spell = GAME.DATA.SPELLS && GAME.DATA.SPELLS[use.learnSpell];
            if (spell) {
                p.spells = p.spells || {};
                if (p.spells[use.learnSpell]) {
                    GAME.UI.log("【" + spell.name + "】你早已烂熟于心，此书只是再印证一遍。", "system");
                } else {
                    p.spells[use.learnSpell] = true;
                    if (GAME.Codex) GAME.Codex.unlockSpell(use.learnSpell);   // 图鉴·术法
                    GAME.UI.log("你研读【" + item.name + "】，习得【" + spell.name + "】！" + spell.desc, "success");
                }
            }
        }
        // 武学/被动秘籍：标记已习（技能中枢据此判定"已习"），避免重复研习刷加成
        if (item.type === "skill") {
            p.skills = p.skills || {};
            p.skills[item.id] = true;
        }
        // 暖阳宝玉：驱体内阴毒（玄机子战后 debuff）
        if (use.cureYindu) {
            if (p.yindu) {
                p.yindu = null;
                GAME.UI.log("暖阳之气游走周身，体内阴毒尽除！你逃过一劫。", "success");
            } else {
                GAME.UI.log("你体内并无阴毒，服之无益。", "system");
            }
        }
        // 疗伤丹散：直接回复气血（禁地之外的主要回血手段，坊市有售）
        if (use.heal) {
            var hpBefore = p.currentHp;
            p.currentHp = Math.min(p.maxHp, p.currentHp + use.heal);
            GAME.UI.log("你服下【" + item.name + "】，一股暖流护住脏腑——气血回复 " + (p.currentHp - hpBefore) + " 点（现 " + p.currentHp + "/" + p.maxHp + "）。", "success");
        }
        this.passTime(1);
    },

    // 生服灵药：草木清气直灌丹田，小幅增修为（沈牧也生嚼药材进补——凡人流本色）。
    // 效率远低于丹药（百年灵药+5 / 千年+15，黄龙丹+25 / 金髓丸+80），且【连服渐抗】：
    // 每多生服一次收益 -5%，最低 30%——对应原著"连服同药功效大减"，也避免无限嗑药。
    // 筑基主药（天灵果等）不开放生服，引导留着炼筑基丹。
    eatHerb: function (id) {
        var p = GAME.State.p();
        if (p.isDead || p.combat || p.pendingEvent || p.pendingMercy) return;
        var item = GAME.DATA.ITEMS[id];
        if (!item || item.type !== "herb" || !item.use || !item.use.eatExp) return;
        if (GAME.State.countItem(id) < 1) return;
        p.herbEatCount = p.herbEatCount || 0;                       // 老存档无此字段，安全兜底
        var mult = Math.max(0.3, 1 - p.herbEatCount * 0.05);
        var gain = Math.max(1, Math.round(item.use.eatExp * mult));
        GAME.State.removeItem(id, 1);
        p.currentExp += gain;
        p.herbEatCount += 1;
        var note = mult < 1 ? "（连服生药，药力渐抗，效用 ×" + mult.toFixed(2) + "）" : "";
        GAME.UI.log("你生嚼下一株【" + item.name + "】，草木清气直灌丹田——修为 +" + gain + note + "。", "success");
        this.passTime(item.use.eatMonths || 1);
    },

    // 装备/更换法器（旧法器自动退回储物袋）
    equipArtifact: function (id) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        var item = GAME.DATA.ITEMS[id];
        if (!item || item.type !== "artifact" || !GAME.State.countItem(id)) return;
        var before = GAME.State.getStats();
        if (p.artifact) GAME.State.addItem(p.artifact);
        GAME.State.removeItem(id);
        p.artifact = id;
        p.artifactDurability = item.maxDur || 10;   // 装备即满耐久
        var after = GAME.State.getStats();
        var feel = (GAME.Tips && GAME.Tips.gearFeel) ? GAME.Tips.gearFeel(before, after) : "";
        GAME.UI.log("你祭起【" + item.name + "】，法力与器物隐隐相连。（耐久 " + p.artifactDurability + "）" + feel, "success");
        if (GAME.Moments) GAME.Moments.fire("first_artifact", item.name);
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // 第二法器（需《控物术》）：神识驭器，同时驾驭两件法器；神识低于法器需求则无从装备
    equipArtifact2: function (id) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        if (!(p.spells && p.spells.kongwu_shu)) {
            GAME.UI.log("你未习得《控物术》，神识无从分驭第二件法器。", "system");
            GAME.UI.updateUI();
            return;
        }
        var item = GAME.DATA.ITEMS[id];
        if (!item || item.type !== "artifact" || !GAME.State.countItem(id)) return;
        if (id === p.artifact) { GAME.UI.log("此器已在你手中飞斩，另一件须是别物。", "system"); GAME.UI.updateUI(); return; }
        var need = item.spiritNeed || GAME.DATA.SPELLS.kongwu_shu.spiritNeed;
        if (GAME.State.getStats().spirit < need) {
            GAME.UI.log("【" + item.name + "】器灵桀骜，需神识 " + need + " 方能驾驭（现 " + GAME.State.getStats().spirit + "）。", "system");
            GAME.UI.updateUI();
            return;
        }
        if (p.artifact2) GAME.State.addItem(p.artifact2);
        GAME.State.removeItem(id);
        p.artifact2 = id;
        p.artifact2Durability = item.maxDur || 10;
        GAME.UI.log("你神识一分为二，【" + item.name + "】悬空而起，绕身飞旋——双器驭于一时！（耐久 " + p.artifact2Durability + "）", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ================= 暗器 / 防具装备（独立于法器槽） =================
    // 玉带软剑 / 淬毒筒：战前装备，开战首回合自动触发（瞬发暗器 / 喷毒流血）
    equipDarkWeapon: function (id) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        var it = GAME.DATA.ITEMS[id];
        if (!it || it.type !== "dark_weapon" || !GAME.State.countItem(id)) return;
        if (p.darkWeapon) GAME.State.addItem(p.darkWeapon);   // 旧暗器退回储物袋
        GAME.State.removeItem(id);
        p.darkWeapon = id;
        GAME.UI.log("你将【" + it.name + "】缠于腕底，战前暗藏。", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // 护心镜：装备后，玄机子点穴暗算时可卸去大半劲力
    equipArmor: function (id) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        var it = GAME.DATA.ITEMS[id];
        if (!it || it.type !== "armor" || !GAME.State.countItem(id)) return;
        var before = GAME.State.getStats();
        if (p.armor) GAME.State.addItem(p.armor);
        GAME.State.removeItem(id);
        p.armor = id;
        var feel = (GAME.Tips && GAME.Tips.gearFeel) ? GAME.Tips.gearFeel(before, GAME.State.getStats()) : "";
        GAME.UI.log("你戴上了【" + it.name + "】，护住心脉。" + feel, "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // ================= 随从：铁奴玄傀 =================
    // 激活：以摄魂钟 + 自身精血唤起玄傀神魂
    activateCompanion: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        if (p.companion) { GAME.UI.log("玄傀已在你麾下效死。", "system"); return; }
        if (GAME.State.countItem("yinhun_zhong") <= 0) { GAME.UI.log("你手中没有【摄魂钟】，无从激活玄傀。", "system"); return; }
        GAME.State.removeItem("yinhun_zhong");
        p.companion = { id: "quhun", name: "铁奴·玄傀", hp: 200, maxHp: 200, atk: 24 };
        GAME.UI.log("你以精血催动摄魂钟，铁奴【玄傀】神魂归位，拜伏于前！", "success");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    // 日常派遣：药田除草 / 后山采矿，增灵石与基础材料
    dispatchCompanion: function (task) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        if (!p.companion || p.companion.hp <= 0) { GAME.UI.log("玄傀不在身旁，无从派遣。", "system"); return; }
        if (task === "weed") {
            var stones = this.rand(20, 40);
            var herb = (Math.random() < 0.5) ? "herb_bainian" : "herb_qiannian";
            p.spiritStones += stones;
            GAME.State.addItem(herb, 1);
            GAME.UI.log("玄傀替你打理药田，月余得灵石 " + stones + "，并采得【" + GAME.DATA.ITEMS[herb].name + "】×1。", "loot");
        } else if (task === "mine") {
            var s2 = this.rand(40, 80);
            p.spiritStones += s2;
            GAME.State.addItem("ore", this.rand(1, 2));
            GAME.UI.log("玄傀往后山采矿，得灵石 " + s2 + " 与低阶矿石若干。", "loot");
        } else if (task === "chop") {
            // 后山伐木：每 2 个月产【百年灵木】×1
            GAME.State.addItem("spirit_wood", 1);
            GAME.UI.log("玄傀持巨斧入后山，两月伐得一株老木——【百年灵木】×1 入库。", "loot");
            this.passTime(2);
            return;
        } else if (task === "mineore") {
            // 下矿开采：每 1 个月产【玄铁矿石】×2
            GAME.State.addItem("iron_ore", 2);
            GAME.UI.log("玄傀钻入矿洞，一月凿得【玄铁矿石】×2。", "loot");
            this.passTime(1);
            return;
        }
        this.passTime(6);
    },

    // ================= 突破境界 =================
    breakthrough: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        // 心魔劫续破：上轮已定心，直接用缓存的破境参数正式冲击壁障
        if (p._btCtx) {
            var cached = p._btCtx; p._btCtx = null;
            if (p._hdMods) {
                cached.successChance = Math.max(0.01, Math.min(1.0, cached.successChance + (p._hdMods.successAdd || 0)));
                cached.dmgMul *= (p._hdMods.dmgMul || 1);
                p._hdMods = null;
            }
            this._rollBreakthrough(cached);
            return;
        }
        var realm = GAME.DATA.REALMS[p.realmIndex];
        var target = GAME.DATA.REALMS[p.realmIndex + 1];

        if (!target) { GAME.UI.log("此方天地的尽头了，再往上是传说之境。", "system"); return; }
        if (p.currentExp < realm.needExp) {
            GAME.UI.log("修为尚不圆满（需 " + realm.needExp + "），经脉壁障坚固，无法强冲！", "system");
            GAME.UI.updateUI();
            return;
        }

        // 筑基关：练气十三层大圆满 → 筑基一层。数值全在 GAME.DATA.ZHUJI：
        // 裸冲 2%（失败 80% 经脉俱断身陨）；筑基丹 25% 起步、连服每多一枚累积 +20%、服丹免死；
        // 正品筑基丹 45% 起步同链；伪丹 15% 且失败仍有四成身陨之危。
        // 拆层后改用 ZHUJI_GATE_INDEX（练气十三层 index12）判定，不再依赖 realm 名。
        var isZhuji = p.realmIndex === GAME.DATA.ZHUJI_GATE_INDEX;
        var zhujiPill = null;
        if (GAME.State.countItem("pill_zhengpin") >= 1) zhujiPill = "pill_zhengpin";
        else if (GAME.State.countItem("pill_zhuji") >= 1) zhujiPill = "pill_zhuji";
        else if (GAME.State.countItem("fake_zhuji") >= 1) zhujiPill = "fake_zhuji";

        var successChance = realm.breakChance, dmgMul = 1, deathMul = 1, bareZhuji = false;
        if (isZhuji) {
            var zc = GAME.DATA.ZHUJI;
            // 连服公式：基础 + 每多服一枚(perPill) + 历史失败保底(perExtra×zhujiFails，永久累加)
            // 四枚筑基丹连服：25% → 50% → 75% → 100%（四丹拉满，必定筑基）
            if (zhujiPill === "pill_zhengpin") {
                successChance = Math.min(zc.zhengpin.cap, zc.zhengpin.chance + zc.zhengpin.perPill * (p.zhujiStreak || 0) + zc.zhengpin.perExtra * (p.zhujiFails || 0));
                dmgMul = 0.2; deathMul = 0;
            } else if (zhujiPill === "pill_zhuji") {
                successChance = Math.min(zc.pill.cap, zc.pill.chance + zc.pill.perPill * (p.zhujiStreak || 0) + zc.pill.perExtra * (p.zhujiFails || 0));
                dmgMul = 0.8; deathMul = 0;   // 丹药护心：服丹免死
            } else if (zhujiPill === "fake_zhuji") {
                successChance = zc.fake.chance; dmgMul = zc.fake.dmgMul; deathMul = zc.fake.deathChance;
            } else {
                bareZhuji = true;             // 伪灵根裸冲：资质壁障，十死无生之局
                successChance = zc.bare.chance; dmgMul = 1; deathMul = zc.bare.deathChance;
            }
            if (bareZhuji) GAME.UI.log("筑基天堑！你身负伪灵根，竟欲以肉身硬撼壁障——此乃十死无生之局（成功 " + Math.round(successChance * 100) + "%，失败八成经脉俱断）！", "danger");
        }
        // 【降尘丹】：筑基后期冲关圣药，突破反噬伤害 -80%（一次性消耗）
        if (GAME.Alchemy && p.jiangchen) dmgMul *= GAME.Alchemy.breakDmgMul();
        // 心境加成：每 10 点心境 +2% 成功率、反噬伤害 -3%（只增不减，不触及四丹拉满的 100%）
        var mindSteps = Math.floor((p.mind || 0) / 10);
        if (mindSteps > 0) {
            if (successChance < 0.98) successChance = Math.min(0.98, successChance + mindSteps * 0.02);
            dmgMul *= Math.max(0.7, 1 - mindSteps * 0.03);
        }
        var pillName = zhujiPill ? GAME.DATA.ITEMS[zhujiPill].name : "";

        // 心魔劫：筑基及以上突破，壁障将破时心魔乘虚而入，先定心再破境
        if (p.realmIndex >= GAME.DATA.ZHUJI_GATE_INDEX) {
            p._btCtx = {
                successChance: successChance, dmgMul: dmgMul, deathMul: deathMul,
                isZhuji: isZhuji, zhujiPill: zhujiPill, pillName: pillName, bareZhuji: bareZhuji
            };
            GAME.UI.log("壁障将破未破——识海深处黑潮翻涌，旧日心魔乘虚而入，欲扰你道心！", "danger");
            p.pendingEvent = { eventId: "heart_demon", resume: "breakthrough" };
            GAME.UI.updateUI();
            return;
        }

        this._rollBreakthrough({
            successChance: successChance, dmgMul: dmgMul, deathMul: deathMul,
            isZhuji: isZhuji, zhujiPill: zhujiPill, pillName: pillName, bareZhuji: bareZhuji
        });
    },

    // 心魔劫后由 chooseEventOption 调用：缓存已在 _btCtx，入口即走续破分支
    _resumeBreakthrough: function () {
        this.breakthrough();
    },

    // 真正的破境结算（练气小突破、心魔劫续破共用）
    _rollBreakthrough: function (ctx) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return;
        var realm = GAME.DATA.REALMS[p.realmIndex];
        var target = GAME.DATA.REALMS[p.realmIndex + 1];
        if (!target) { GAME.UI.updateUI(); return; }
        var isZhuji = ctx.isZhuji, zhujiPill = ctx.zhujiPill, successChance = ctx.successChance, dmgMul = ctx.dmgMul, deathMul = ctx.deathMul, bareZhuji = ctx.bareZhuji, pillName = ctx.pillName;

        GAME.UI.log("你盘膝而坐，周身灵气开始向壁障冲击……" + (isZhuji ? (bareZhuji ? "" : "【" + pillName + "】化作磅礴药力护住心脉！") : ""), "system");
        this.passTime(3);
        if (p.isDead) return;

        if (zhujiPill) GAME.State.removeItem(zhujiPill);

        var oldMaxHp = p.maxHp;
        if (Math.random() <= successChance) {
            p.currentExp -= realm.needExp;
            p.realmIndex += 1;
            p.stats.breakthroughs += 1;
            p.zhujiStreak = 0;   // 连服丹链终止于成功
            p.zhujiFails = 0;    // 历史失败保底池一并清空（已筑基，新周期）
            if (p.realmIndex > p.stats.maxRealm) p.stats.maxRealm = p.realmIndex;
            // 魔道入侵四阶段主线：按筑基层数推进（前置数据缺失时静默跳过）
            if (GAME.DemonWar) GAME.DemonWar.checkPhase();
            var newRealm = GAME.DATA.REALMS[p.realmIndex];
            // 筑基层次按 realms_foundation 的 hp 落位气血上限（凡人流：肉身随境暴涨）；
            // 练气期维持逐境 +20 的轻量增长，行为与旧档一致。
            // 《三转归元功》：每转气血/法力上限永久 +20%（statMul 参与落位）
            var szMul = (GAME.Cultivation && GAME.Cultivation.statMul) ? GAME.Cultivation.statMul() : 1;
            if (newRealm.hp != null) { p.maxHp = Math.round(newRealm.hp * szMul); }
            else { p.maxHp += 20; }
            p.maxMp = newRealm.mp != null ? Math.round(newRealm.mp * szMul) : p.maxMp;
            p.currentHp = p.maxHp;
            p.changchunLevel += 1;   // 《青木功》随破境而深，每层 +5% 命中 / +10% 异常抗性
            GAME.UI.log("【突破成功】破境功成！你已踏入 " + newRealm.name + "！", "success");
            if (GAME.Moments) {
                GAME.Moments.fire("first_breakthrough", newRealm.name);
                if (isZhuji) GAME.Moments.fire("first_zhuji");
            }
            if (GAME.Codex) {
                GAME.Codex.unlockLore("lore_changchun");
                if (isZhuji) GAME.Codex.unlockLore("lore_zhuji");
            }
            // 练气三层：玄机子见你根基渐稳，终于肯传炼丹手艺——丹炉开启
            if (p.realmIndex === (GAME.DATA.ALCHEMY.unlockRealm || 2)) {
                GAME.UI.log("玄机子见你《青木功》已有小成，难得地多说了几句：「火候、药材、心性，缺一不可。」——他传了你《炼丹初步》，丹炉自此可用！", "story");
            }
            GAME.UI.log("气血上限 " + oldMaxHp + " → " + p.maxHp + "，法力上限 " + p.maxMp + "——肉身与神识俱有长进。", "success");
            if (isZhuji) GAME.UI.log("寿元大限延至 " + newRealm.maxAge + " 岁——你终于在这一界站稳了脚跟！", "success");
            // 突破练气四层：苍梧门篇大关卡——六幕剧情推进至此幕的，先播「墨师翻脸·尸虫丸」
            // 逼命叙事（12 个月倒计时），再接玄机子夺舍对决；未推剧情（老档/测试桩）直接开战，行为不变。
            if (p.realmIndex === GAME.DATA.CONTENT.MODAIFU.triggerRealm && !p.moEventDone) {
                p.moEventDone = true;
                if (GAME.Qixuan && GAME.Qixuan.onBreakthroughFour) GAME.Qixuan.onBreakthroughFour();
                else GAME.MoEvent.start();
                GAME.UI.updateUI();
                return;
            }
        } else {
            if (GAME.Alchemy) GAME.Alchemy.consumeJiangchen();
            var dmg = bareZhuji ? GAME.DATA.ZHUJI.bare.dmg : Math.round(realm.failDamage * dmgMul);
            p.currentHp -= dmg;
            // 丹药护心：筑基丹/正品筑基丹护持下的失败，药力吊住心脉——气血不至磨穿（保底 1 点），
            // 否则连服丹链会被反噬逐次放血致死，"资源堆叠抹平资质"便成了空话。伪丹与裸冲不在此列。
            if (isZhuji && (zhujiPill === "pill_zhuji" || zhujiPill === "pill_zhengpin") && p.currentHp <= 0) {
                p.currentHp = 1;
                GAME.UI.log("危急关头，丹药余力护住心脉——你吊住一线生机，未致气绝。", "warning");
            }
            var lostExp = Math.floor(p.currentExp * realm.failExpLoss);
            p.currentExp -= lostExp;
            GAME.UI.log("【突破失败】灵气逆流，走火入魔！受损 " + dmg + " 气血，修为溃散 " + lostExp + " 点！", "danger");
            // 连服进度：本次连服 +1（下一枚 +25%）；成功时连服计数并入历史失败（永久 +20% 保底）
            if (isZhuji && (zhujiPill === "pill_zhuji" || zhujiPill === "pill_zhengpin")) {
                p.zhujiStreak = (p.zhujiStreak || 0) + 1;
            }
            if (bareZhuji) {
                // 裸冲失败：八成概率【经脉俱断】——玄傀护主可软着陆一次
                if (Math.random() < GAME.DATA.ZHUJI.bare.deathChance) {
                    if (this.tryRescue("逆冲反震")) {
                        GAME.UI.log("你从行将崩断的经脉边缘被生生拽回——裸冲之路，凶险至此！", "danger");
                    } else {
                        p.currentHp = 0;
                        p.isDead = true;
                        p.deathReason = "筑基裸冲失败，经脉俱断而亡";
                        GAME.UI.log("壁障轰然反震，你全身经脉寸寸崩断——【经脉俱断】，道消身陨！", "danger");
                    }
                }
            } else if (Math.random() < realm.deathChance * deathMul) {
                if (this.tryRescue("反噬")) {
                    GAME.UI.log("反噬如潮，玄傀再度替你挡下一劫。", "danger");
                } else {
                    p.currentHp = 0;
                    p.isDead = true;
                    p.deathReason = "突破" + target.name + "失败，走火入魔身亡";
                    GAME.UI.log("反噬如潮，你终究没能挺过去——道消身陨！", "danger");
                }
            } else if (isZhuji && zhujiPill === "pill_zhuji" && GAME.State.countItem("pill_zhuji") > 0) {
                var next1 = Math.min(GAME.DATA.ZHUJI.pill.cap, GAME.DATA.ZHUJI.pill.chance + GAME.DATA.ZHUJI.pill.perPill * p.zhujiStreak + GAME.DATA.ZHUJI.pill.perExtra * (p.zhujiFails || 0));
                GAME.UI.log("首冲不利，药力尚护住心脉。储物袋中还有 " + GAME.State.countItem("pill_zhuji") + " 枚【筑基丹】——连服再冲，成功率累积至 " + Math.round(next1 * 100) + "%。", "warning");
            } else if (isZhuji && zhujiPill === "pill_zhengpin" && GAME.State.countItem("pill_zhengpin") > 0) {
                var next2 = Math.min(GAME.DATA.ZHUJI.zhengpin.cap, GAME.DATA.ZHUJI.zhengpin.chance + GAME.DATA.ZHUJI.zhengpin.perPill * p.zhujiStreak + GAME.DATA.ZHUJI.zhengpin.perExtra * (p.zhujiFails || 0));
                GAME.UI.log("首冲不利，药力尚护住心脉。储物袋中还有 " + GAME.State.countItem("pill_zhengpin") + " 枚【正品筑基丹】——连服再冲，成功率累积至 " + Math.round(next2 * 100) + "%。", "warning");
            }
        }
        this.checkDeath();
        GAME.UI.updateUI();
    },

    // ================= 外出历练 =================
    explore: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat || p.pendingEvent) return;
        var months = this.rand(1, 3);
        p.stats.explores += 1;
        GAME.UI.log("你背起储物袋外出历练，往返耗时 " + months + " 个月……", "system");
        this.passTime(months);
        if (p.isDead) return;

        // 按权重抽取事件：恶名越盛越易招来劫道散修；《敛气术》伪装境界让劫匪摸不清深浅
        var events = GAME.DATA.EVENTS;
        var weightOf = function (ev) {
            var w = ev.weight;
            if (ev.id === "meet_bandit") {
                w *= 1 + Math.max(0, -p.karma) / 50;            // 恶值 -100 时劫道权重 ×3
                if (p.spells && p.spells.lianqi_shu) w *= 0.4;  // 敛气伪装：劫匪看不出深浅，多半绕道
            }
            return w;
        };
        var total = 0, i;
        for (i = 0; i < events.length; i++) total += weightOf(events[i]);
        var roll = Math.random() * total, picked = events[events.length - 1];
        for (i = 0; i < events.length; i++) {
            if (roll < weightOf(events[i])) { picked = events[i]; break; }
            roll -= weightOf(events[i]);
        }

        GAME.UI.log("【历练】" + picked.text, "info");
        if (picked.choices && picked.choices.length) {
            // 分支选项型：挂起等玩家点选
            p.pendingEvent = { eventId: picked.id };
            GAME.UI.updateUI();
        } else {
            // 自动结算型
            this.resolveEventOutcomes(picked.outcomes);
        }
    },

    // 玩家点选分支后结算
    chooseEventOption: function (optionIndex) {
        var p = GAME.State.p();
        if (!p.pendingEvent || p.isDead) return;
        var pe = p.pendingEvent;                        // 先捕获 resume 标记，再清 pending
        var ev = this.findEvent(pe.eventId);
        p.pendingEvent = null;
        if (!ev || !ev.choices[optionIndex]) return;
        var opt = ev.choices[optionIndex];
        GAME.UI.log("你心念一定：" + opt.text + "。", "info");
        this.resolveEventOutcomes(opt.outcomes);
        // 心魔劫等需要续破的流程：定心抉择生效后再正式冲击壁障
        if (!p.isDead && pe.resume === "breakthrough") this._resumeBreakthrough();
    },

    // 战后处置：0=灭口（全额财物+恶名，修士则落因果） 1=留活口（六成财物+善名）
    //           2=火球术毁尸灭迹（需火球符或《火球术》：焚尸灭迹，无因果缠身，煞气更重）
    chooseMercy: function (option) {
        var p = GAME.State.p();
        if (!p.pendingMercy || p.isDead) return;
        var def = null;
        for (var i = 0; i < GAME.DATA.MONSTERS.length; i++) {
            if (GAME.DATA.MONSTERS[i].id === p.pendingMercy.monsterId) def = GAME.DATA.MONSTERS[i];
        }
        var stones = p.pendingMercy.stones;
        p.pendingMercy = null;
        if (!def) return;

        if (option === 2) {
            // 毁尸灭迹：以火球符（或已习《火球术》）焚尸，因果无从追查
            var hasSpell = p.spells && p.spells.huoqiu_shu;
            if (!hasSpell && GAME.State.countItem("talisman_huoqiu") <= 0) {
                GAME.UI.log("你既无火球符，也未习得《火球术》，无从焚尸灭迹。", "system");
                p.pendingMercy = { monsterId: def.id, stones: stones };   // 原样挂回，另作抉择
                GAME.UI.updateUI();
                return;
            }
            if (!hasSpell) GAME.State.removeItem("talisman_huoqiu");
            p.spiritStones += stones;
            p.stats.kills += 1;
            p.shaQi += 8;   // 焚尸灭迹，煞气更重
            GAME.State.addKarma(-12);
            GAME.UI.log("你掐动法诀，一团烈火将尸身与血迹焚为齑粉——死无对证，因果无从追查。（恶名 +12，煞气 +8，得 " + stones + " 灵石）", "danger");
            GAME.Combat.grantLoot(def.loot, 1, def);
        } else if (option === 0) {
            p.spiritStones += stones;
            p.stats.kills += 1;
            p.shaQi += 5;   // 杀伐之气缠身，黑市销赃更易被尾随
            GAME.State.addKarma(-8);
            GAME.UI.log("你心一横，剑光闪过——斩草除根，免留后患。（恶名 +8，煞气 +5，得 " + stones + " 灵石）", "danger");
            GAME.Combat.grantLoot(def.loot, 1, def);
            // 斩杀修士而尸身留在原地：因果追查缠身，高阶修士或循因果寻仇
            if (def.cultivator) {
                p.causal = { months: 12 };
                GAME.UI.log("【因果追查】尸身留在原地，一缕血色因果悄然缠上你的神魂——十二个月内，恐有修士循因果寻仇！下次可备【火球符】或习《火球术》毁尸灭迹。", "danger");
            }
        } else {
            var got = Math.floor(stones * 0.6);
            p.spiritStones += got;
            p.stats.mercies += 1;
            GAME.State.addKarma(6);
            GAME.UI.log("你收剑入鞘：「滚吧。」对方千恩万谢，留下六成财物仓皇离去。（善名 +6，得 " + got + " 灵石）", "success");
            GAME.Combat.grantLoot(def.loot, 0.6, def);
        }
        this.checkAchievements();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },

    findEvent: function (id) {
        for (var i = 0; i < GAME.DATA.EVENTS.length; i++) {
            if (GAME.DATA.EVENTS[i].id === id) return GAME.DATA.EVENTS[i];
        }
        if (GAME.DATA.HEART_DEMON && GAME.DATA.HEART_DEMON.id === id) return GAME.DATA.HEART_DEMON;
        return null;
    },

    // ================= 事件结算引擎 =================
    resolveEventOutcomes: function (outcomes) {
        var p = GAME.State.p();
        var i, j, o, total = 0, roll;
        for (i = 0; i < outcomes.length; i++) total += outcomes[i].chance;
        roll = Math.random() * total;
        o = outcomes[outcomes.length - 1];
        for (i = 0; i < outcomes.length; i++) {
            if (roll < outcomes[i].chance) { o = outcomes[i]; break; }
            roll -= outcomes[i].chance;
        }

        if (o.text) GAME.UI.log(o.text, o.type === "damage" || o.type === "combat" ? "danger" : "loot");

        switch (o.type) {
            case "loot":
                for (j = 0; j < o.table.length; j++) {
                    var g = o.table[j];
                    if (Math.random() < g.chance) {
                        var qty = this.rand(g.qty[0], g.qty[1]);
                        if (qty > 0) {
                            GAME.State.addItem(g.id, qty);
                            GAME.UI.log("获得【" + GAME.DATA.ITEMS[g.id].name + "】×" + qty + "。", "loot");
                        }
                    }
                }
                break;
            case "stones":
                var stones = this.rand(o.amount[0], o.amount[1]);
                p.spiritStones += stones;
                GAME.UI.log("获得灵石 ×" + stones + "。", "loot");
                break;
            case "exp":
                var exp = this.rand(o.amount[0], o.amount[1]);
                p.currentExp += exp;
                GAME.UI.log("修为 +" + exp + "。", "success");
                break;
            case "damage":
                var dmg = this.rand(o.hp[0], o.hp[1]);
                p.currentHp -= dmg;
                GAME.UI.log("你受损 " + dmg + " 点气血！", "danger");
                if (o.age && o.age[1] > 0) {
                    var lostAge = this.rand(o.age[0], o.age[1]);
                    if (lostAge > 0) {
                        p.ageYears += lostAge;
                        GAME.UI.log("伤及根基，折寿 " + lostAge + " 年！", "danger");
                    }
                }
                break;
            case "combat":
                GAME.Combat.start(o.monster); // 战斗自行接管 UI 刷新
                return;
            case "hdmod":
                p._hdMods = { successAdd: o.successAdd || 0, dmgMul: o.dmgMul || 1 };
                break;
            case "nothing":
            default:
                break;
        }
        this.checkDeath();
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    },
};
