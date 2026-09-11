/* =========================================================
 * js/secret.js —— 秘境游历（筑基期随机奇遇事件链）
 *
 * 入口：秘境舆图面板的「秘境游历」按钮。每次点探耗 1 月，在秘境 periphery 游走，
 * 加权随机触发一类奇遇：老怪指路 / 残阵机缘 / 妖兽结缘 / 古修遗泽 / 陷阱 / 空手而返。
 * 全部用既有物品（mid_stone / shadan_suipian / beast_soul / pill_jinsui），不引入新依赖。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Secret = {

    // 奇遇类型与权重
    EVENTS: [
        { type: "elder", w: 3 },   // 老怪指路：心境 or 修为
        { type: "array", w: 3 },   // 残阵机缘：材料
        { type: "beast", w: 2 },   // 妖兽结缘：兽魂
        { type: "jade",  w: 2 },   // 古修遗泽：金髓丸（修为 +80）
        { type: "trap",  w: 2 },   // 陷阱：掉血失财
        { type: "recipe", w: 2 },  // 残卷机缘：拾得丹方（研习后化入识海）
        { type: "empty", w: 2 }    // 空手而返
    ],

    roam: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) { GAME.UI.updateUI(); return; }
        GAME.Core.passTime(1);                 // 探看耗 1 月
        if (p.isDead) return;

        var evs = this.EVENTS, total = 0, i;
        for (i = 0; i < evs.length; i++) total += evs[i].w;
        var roll = Math.random() * total, picked = evs[evs.length - 1];
        for (i = 0; i < evs.length; i++) { if (roll < evs[i].w) { picked = evs[i]; break; } roll -= evs[i].w; }

        var txt = "", kind = "success";
        if (picked.type === "elder") {
            if (Math.random() < 0.5) {
                var m = GAME.Core.rand(3, 6);
                p.mind = (p.mind || 0) + m;
                txt = "一位云游老怪端坐石上，瞥你一眼：「心不定，道难成。」言罢化作清风——心境 +" + m + "。";
            } else {
                var e = GAME.Core.rand(80, 200);
                p.currentExp += e;
                txt = "残阵中浮起一道前人功影，你驻足参悟，修为 +" + e + "。";
            }
        } else if (picked.type === "array") {
            var arr = [["mid_stone", GAME.Core.rand(2, 4)], ["shadan_suipian", 1], ["beast_soul", 1]];
            var it = arr[GAME.Core.rand(0, arr.length - 1)];
            GAME.State.addItem(it[0], it[1]);
            txt = "你踏破一处残阵，阵眼嵌着【" + GAME.DATA.ITEMS[it[0]].name + "】×" + it[1] + "，顺手取了。";
        } else if (picked.type === "beast") {
            GAME.State.addItem("beast_soul", 2);
            txt = "林间一头幼兽蹭了蹭你靴边，竟生出一种亲近——你收得妖兽精魂 ×2（可作灵宠 / 傀儡之资）。";
        } else if (picked.type === "jade") {
            GAME.State.addItem("pill_jinsui", 1);
            txt = "石壁刻着半部功诀，你拓下残简，循之服下金髓丸一枚——修为 +80。";
        } else if (picked.type === "trap") {
            var d = GAME.Core.rand(20, 50);
            p.currentHp -= d;
            var lost = Math.floor(p.spiritStones * 0.05);
            p.spiritStones -= lost;
            txt = "脚下一空，陷阱激起尘沙——你损 " + d + " 气血、被夺 " + lost + " 灵石。";
            kind = "danger";
            GAME.Core.checkDeath();
            if (p.isDead) return;
        } else {
            txt = "秘境 periphery 空寂无人，唯风过石隙。你空手而返，却也落得一时清静。";
            kind = "system";
        }

        GAME.UI.log("【秘境游历】" + txt, kind);
        var rt = document.getElementById("secret-roam-text");
        if (rt) rt.innerText = "（本次）" + txt;
        GAME.UI.updateUI();
    }
};
