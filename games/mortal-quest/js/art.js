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
        spirit_stone: "spirit_stone",   // 专属图标：别再用 orb（青琉璃珠，缩到 46px 像只绿药瓶）
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

    // ---------- 敌手头像（16 类标准立绘） ----------
    // 资源：assets/monsters/*.jpg，每张 200px 方形；圆框由 CSS 负责
    // （.bp-ava{border-radius:50%; overflow:hidden}），所以图里四角的纸底色会被裁掉，
    // 切图时只需把角色圆环摆正、让圆本身顶满方形的内切圆。
    //
    // 解析三级优先：① 精确名 → ② 词根 → ③ 类别兜底。两个顺序都是命门：
    //   · 「铁齿狼 · 一阶妖兽」只取 · 之前的主名——副名里全是「妖兽 / 练气后期」
    //     这类注脚，留着就会把「兽」当成裂风巨猿，于是天下妖兽全顶着巨猿脸；
    //   · 机构词（会 / 帮 / 盟 / 阙 / 门 / 修士 / 弟子）必须排在物种词之前，
    //     否则「惊蛟会帮众」会被「蛟」拽去当墨蛟。
    MONSTER_DIR: "assets/monsters/",

    // 图集标准键名 → 文件名（文件名用拼音，避开中文路径在各类服务器上的编码坑）
    MON_AVATAR_FILE: {
        "铁齿狼": "tiechilang", "赤练妖蛇": "chilian_yaoshe",
        "百目毒蛛": "baimu_duzhu", "双头火鸦": "shuangtou_huoya",
        "墨蛟": "mojiao", "裂风巨猿": "liefeng_juyuan",
        "婴鲤兽": "yingli_shou", "玄岩龟": "xuanyan_gui",
        "炼尸": "lianshi", "鬼王": "guiwang",
        "机关傀儡": "jiguan_kuilei", "噬金虫群": "shijin_chongqun",
        "剪径蠢贼": "jianjing_chunzei", "黑市劫修": "heishi_jiexiu",
        "魔道邪修": "modao_xiexiu", "玄机子": "xuanjizi_monster"
    },

    // 第一级：精确名（含原著别名与同义写法）
    MON_EXACT: {
        "铁齿狼": "铁齿狼", "铁齿狼王": "铁齿狼",
        "赤练妖蛇": "赤练妖蛇", "赤练蛇": "赤练妖蛇",
        "百目毒蛛": "百目毒蛛", "双头火鸦": "双头火鸦",
        "墨蛟": "墨蛟", "恶蛟": "墨蛟",
        "裂风巨猿": "裂风巨猿", "婴鲤兽": "婴鲤兽", "玄岩龟": "玄岩龟",
        "炼尸": "炼尸", "铜甲尸": "炼尸", "僵尸": "炼尸",
        "鬼王": "鬼王", "机关傀儡": "机关傀儡", "噬金虫群": "噬金虫群",
        "剪径蠢贼": "剪径蠢贼", "剪径蟊贼": "剪径蠢贼", "世家护卫": "剪径蠢贼",
        "黑市劫修": "黑市劫修", "魔道邪修": "魔道邪修",
        "玄机子": "玄机子", "墨居仁": "玄机子", "墨大夫": "玄机子", "余子童": "玄机子"
    },

    // 第二级：词根表（顺序即优先级，改之前先读上面那段注释）
    MON_RULES: [
        [/玄机子|墨居仁|墨大夫|余子童|夺舍/, "玄机子"],
        [/鬼灵|鬼修|魔修|魔道|魔焰|魔化|邪修|血修|血侍|心魔|老魔|凶徒|魔/, "魔道邪修"],
        [/幽冥|鬼王|阴魂|怨灵|骷髅|幽魂|残魂|魂|鬼/, "鬼王"],
        // 人族一律排在任何物种词之前：「惊蛟会帮众」含「蛟」，若让物种词
        // 先过一遍，一个拦路刁徒就顶着墨蛟的脸出来了。但也必须排在
        // 「魔 / 鬼灵」之后，否则「魔焰门修士」会被「门」拽去当劫修。
        // 黑市这一档先于山贼：黑市里的劫匪是「黑市劫修」，不是剪径的蠢贼。
        [/黑市|劫修|尾随|蒙面|黑衣|散修|擂台|弟子|子弟|精英|修士|魁首|追缉|赏金|盟|阙|阁|宗/, "黑市劫修"],
        [/蠢贼|山贼|强盗|匪|恶霸|帮众|武夫|镖师|堂主|帮|会|派|将|帅|使|客|人/, "剪径蠢贼"],
        [/炼尸|铁奴|曲魂|铜甲尸|僵尸|尸/, "炼尸"],
        [/傀儡|机关|木甲|兽傀/, "机关傀儡"],
        [/噬金虫|虫云|奇虫|甲虫|飞蚁|灵虫|虫|蜂|蝶|蛊/, "噬金虫群"],
        [/毒蛛|蜘蛛|百目|蝎|蜈蚣|蜈|毒虫|蛛/, "百目毒蛛"],
        [/火鸦|鸦|雕|鹫|蝠|妖禽|怪鸟|鸟/, "双头火鸦"],
        [/婴鲤|海兽|鱼妖|水怪|章鱼|归墟/, "婴鲤兽"],
        [/玄岩龟|龟|鳖|蟹|甲兽/, "玄岩龟"],
        [/赤练|蛇|蟒|青鳞|毒虺/, "赤练妖蛇"],
        [/墨蛟|蛟|恶蛟|水蟒|龙/, "墨蛟"],
        [/巨猿|裂风|猿|熊|虎|豹|蛮兽|兽|狸|獠|妖王|亲卫/, "裂风巨猿"],
        [/铁齿狼|狼|风狼|妖狼|犬|狐/, "铁齿狼"]
    ],

    // 「铁齿狼 · 一阶妖兽」→「铁齿狼」：只认主名，副名一概不看
    mainNameOf: function (enemy) {
        var nm = enemy && (enemy.name || (enemy.def && enemy.def.name));
        if (typeof nm !== "string") nm = "";
        return nm.split(/[·・]/)[0].replace(/\s+/g, "");
    },

    avatarKeyOf: function (enemy) {
        var nm = this.mainNameOf(enemy);
        if (nm && this.MON_EXACT[nm]) return this.MON_EXACT[nm];
        for (var i = 0; i < this.MON_RULES.length; i++) {
            if (this.MON_RULES[i][0].test(nm)) return this.MON_RULES[i][1];
        }
        // 第三级：什么都没命中——人族按散修劫修，其余一律当蛮兽
        var d = (enemy && enemy.def) || enemy || {};
        return (d.human || d.type === "human") ? "黑市劫修" : "裂风巨猿";
    },

    // 立绘是人形的这几类：注脚必须写「修士」，不能写「妖兽」
    HUMAN_AVATARS: { "黑市劫修": 1, "剪径蠢贼": 1, "魔道邪修": 1, "玄机子": 1 },

    isHumanAvatar: function (enemy) {
        return !!this.HUMAN_AVATARS[this.avatarKeyOf(enemy)];
    },

    resolveEnemyAvatar: function (enemy) {
        var key = this.avatarKeyOf(enemy);
        var file = this.MON_AVATAR_FILE[key] || this.MON_AVATAR_FILE["裂风巨猿"];
        return this.MONSTER_DIR + file + ".jpg";
    },

    // 旧调用点保留：战斗页、图鉴都从这里拿图
    monsterPortrait: function (enemy) {
        return this.resolveEnemyAvatar(enemy);
    },

    playerPortrait: function () {
        return this.PORTRAIT_DIR + "p_self.jpg";
    },

    role: function (key) {
        var map = { self: "p_self", xuanjizi: "p_xuanjizi", modaifu: "p_modaifu", zhishi: "p_zhishi", rogue: "p_rogue", shop: "p_shopkeeper" };
        return this.PORTRAIT_DIR + (map[key] || "p_self") + ".jpg";
    }
};

// 外部（含调试台、单测）可直接按名字问头像，不必先摸到 GAME.Art
window.resolveEnemyAvatar = function (enemy) {
    return GAME.Art.resolveEnemyAvatar(enemy);
};
window.resolveEnemyAvatarKey = function (enemy) {
    return GAME.Art.avatarKeyOf(enemy);
};
