/* =========================================================
 * js/moments.js —— 高光时刻（首次里程碑的仪式感）
 *   玩家视角：修仙的爽点不该和"灵石 +3"挤在同一行灰字里。
 *   首次破境 / 第一滴绿液 / 第一次杀人 / 筑基成功……这些时刻
 *   单独成块、金色描边、留白，让玩家记住"我做到了"。
 *   只记一次：p.moments[id] = true，之后不再打扰。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Moments = {

    DEFS: {
        first_liquid: {
            title: "第一滴绿液",
            body: "瓶底凝出的一点碧色，比任何灵石都金贵。从今往后，别人用十年养的药，你用一夜。"
        },
        first_catalyze: {
            title: "第一次催熟",
            body: "绿液没入药苗的刹那，百年光阴被压成一息。你终于明白，这瓶子才是你真正的师父。"
        },
        first_alchemy: {
            title: "第一次开炉",
            body: "丹炉轰鸣，烟火气里第一次飘出属于你的药香。尽管成色平平，这是你自己炼出来的。"
        },
        first_kill: {
            title: "第一次胜敌",
            body: "对方倒下时，你才确信：这条命，从此握在自己手里。"
        },
        first_breakthrough: {
            title: "第一次破境",
            body: "壁障碎裂的瞬间，天地忽然宽了一寸。修仙二字，你终于摸到了门槛。"
        },
        first_zhuji: {
            title: "筑基功成",
            body: "从今天起，你不再是任人践踏的练气散修。寿元大涨，天地另眼——这才是仙途的起点。"
        },
        first_artifact: {
            title: "第一件法器",
            body: "法器认主的微光落在掌心。从此与人动手，你不再是赤手空拳。"
        }
    },

    // 触发一次高光（同一 id 只触发一次）
    fire: function (id, extra) {
        var p = GAME.State.p();
        if (!p || p.isDead) return false;
        if (!p.moments) p.moments = {};
        if (p.moments[id]) return false;

        var d = this.DEFS[id];
        if (!d) return false;

        p.moments[id] = true;

        var UI = GAME.UI;
        if (UI && UI.log) {
            UI.log("", "moment-gap");
            UI.log("✦ " + d.title + (extra ? " · " + extra : "") + " ✦", "moment");
            UI.log(d.body, "moment-body");
            UI.log("", "moment-gap");
        }
        return true;
    },

    // 供测试/图鉴：已解锁的高光
    unlocked: function () {
        var p = GAME.State.p();
        return p && p.moments ? Object.keys(p.moments) : [];
    }
};
