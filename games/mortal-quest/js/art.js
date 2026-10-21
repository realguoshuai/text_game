/* =========================================================
 * js/art.js —— 图像资源索引
 * 物品图标：assets/items/*.jpg（144px）
 * 立绘：    assets/portraits/*.jpg（200px）
 *
 * 约定：数据表里**不加 icon 字段**。物品两百多条、散在十来个文件里，
 * 逐个补字段既容易漏又会互相覆盖；这里用「显式 id → 名字/类型推断」两级映射，
 * 新增物品不写映射也能自动落到同类图标上。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Art = {
    ITEM_DIR: "assets/items/",
    PORTRAIT_DIR: "assets/portraits/",

    // 一级：关键物品直接点名（其余走 inferIcon）
    ID_ICON: {
        herb_bainian: "herb_wash",
        herb_qiannian: "herb_lingzhi",
        herb_xisui: "herb_wash",
        pill_huanglong: "pill_qi",
        pill_jinsui: "pill_qi",
        pill_zhanjin: "pill_qi",
        pill_yuanling: "pill_qi",
        pill_jiangchen: "pill_qi",
        pill_zhuji: "pill_zhuji",
        pill_jiedan: "pill_zhuji",
        pill_jiedan_zhengpin: "pill_zhuji",
        fake_jiedan: "orb",
        fake_zhuji: "orb",
        pill_yanshou: "token",
        talisman_huoshe: "fire",
        talisman_huoqiu: "fire",
        talisman_dici: "talisman",
        talisman_hushen: "shield",
        talisman_shenxing: "crane",
        poison_mortal: "shadow",
        artifact_qingwen: "sword",
        artifact_qingyuan: "sword_dark",
        artifact_xuangui: "shield",
        yinhun_zhong: "puppet",
        conceal_skill: "shadow",
        spirit_stone: "token",
        liquid_green: "orb"
    },

    // 二级：按名字里的器物词根推断
    RULES: [
        [/丹|丸|散|膏/, "pill_qi"],
        [/草|芝|参|花|果|根|叶|藤|莲/, "herb_wash"],
        [/剑|刀|刃|枪|戟|锤|棒|针|刺/, "sword"],
        [/盾|甲|衣|袍|铠|罩/, "shield"],
        [/符/, "talisman"],
        [/幡|旗|钟|铃|印|令|牌|简|卷|册|书|典/, "banner"],
        [/袋|囊|瓶|壶|钵|匣|盒/, "bag"],
        [/阵|图|诀|法|术|经|篇|功法/, "formation"],
        [/珠|石|晶|髓|砂|砾|片|块|骨|核/, "orb"],
        [/傀|偶|尸|虫|兽|蛊/, "puppet"],
        [/纸|信|笺|鹤/, "crane"],
        [/影|隐|匿|魂|煞/, "shadow"]
    ],

    itemIcon: function (id, item) {
        if (this.ID_ICON[id]) return this.ID_ICON[id];
        item = item || (GAME.DATA && GAME.DATA.ITEMS ? GAME.DATA.ITEMS[id] : null) || {};
        var nm = item.name || "";
        for (var i = 0; i < this.RULES.length; i++) {
            if (this.RULES[i][0].test(nm)) {
                var base = this.RULES[i][1];
                // 极品丹药 / 千年灵药 用更贵重的那张图
                if (base === "pill_qi" && /极品|筑基|凝丹/.test((item.quality || "") + nm)) return "pill_zhuji";
                if (base === "herb_wash" && /千年|万年|紫|血/.test(nm)) return "herb_lingzhi";
                return base;
            }
        }
        var t = item.type || "";
        if (t === "talisman") return "talisman";
        if (t === "artifact") return "sword";
        if (t === "armor") return "shield";
        if (t === "skill") return "formation";
        if (t === "poison") return "shadow";
        if (t === "currency") return "token";
        if (t === "herb") return "herb_wash";
        return "orb";
    },

    itemSrc: function (id, item) {
        return this.ITEM_DIR + this.itemIcon(id, item) + ".jpg";
    },

    // 品阶 → 图标外框配色
    qualityClass: function (q) {
        if (q === "极品") return "iq-ji";
        if (q === "上品") return "iq-shang";
        if (q === "灵品" || q === "中品") return "iq-ling";
        return "iq-fan";
    },

    // ---------- 立绘 ----------
    // 妖兽没有美术资源逐个对应，按名字词根归到六张妖物图上；
    // 人族对手归到人物志里的散修/执事。宁可比对模糊，也不能空着不显示。
    MON_RULES: [
        [/玄机子|魔银手/, "p_xuanjizi"],
        [/墨大夫|药庐|药铺/, "p_modaifu"],
        [/执事|掌柜|坊市|账房/, "p_zhishi"],
        [/蛇|蟒|蛟|龙/, "m_snake"],
        [/蛛|蜈|蝎|蚁|蟾/, "m_spider"],
        [/虫|蜂|蝶|蛊/, "m_insect"],
        [/魂|鬼|幽|煞|冥/, "m_ghost"],
        [/傀|铁奴|机关|偶|尸/, "m_puppet"],
        [/猿|狼|犬|兽|狸|熊|虎|豹|獠/, "m_ape"]
    ],
    HUMAN_RULE: [/弟子|修士|散修|劫|匪|帮|堂主|子弟|魁首|精英|仇|客|人/],

    monsterPortrait: function (def) {
        var nm = (def && def.name) || "";
        for (var i = 0; i < this.MON_RULES.length; i++) {
            if (this.MON_RULES[i][0].test(nm)) return this.PORTRAIT_DIR + this.MON_RULES[i][1] + ".jpg";
        }
        if (this.HUMAN_RULE[0].test(nm)) return this.PORTRAIT_DIR + "p_rogue.jpg";
        return this.PORTRAIT_DIR + "m_ape.jpg";
    },

    playerPortrait: function () {
        return this.PORTRAIT_DIR + "p_self.jpg";
    },

    role: function (key) {
        var map = { self: "p_self", xuanjizi: "p_xuanjizi", modaifu: "p_modaifu", zhishi: "p_zhishi", rogue: "p_rogue", shop: "p_shopkeeper" };
        return this.PORTRAIT_DIR + (map[key] || "p_self") + ".jpg";
    }
};
