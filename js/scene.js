/* scene.js — 像素场景渲染层（致敬 Dave the Diver 的手工像素风）
 * 设计原则：
 *  - 纯原生 Canvas 2D，零依赖、零外部素材（全部用 fillRect 程序化绘制，离线可玩）。
 *  - 静态渲染：仅在 GAME.UI.updateUI() 触发时重绘，不跑 rAF 循环，对弱机零持续开销。
 *  - 内部分辨率 640x200，由 CSS 缩放并 pixelated，呈现粗像素质感。
 *  - 读取 GAME.state.location（地图节点）决定场景主题；逻辑层完全不动。
 */
window.GAME = window.GAME || {};
GAME.scene = (function () {
    var W = 640, H = 200;
    var canvas = null, ctx = null;

    function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
    function tri(pts, c) {
        ctx.fillStyle = c; ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.closePath(); ctx.fill();
    }
    function band(y, h, c) { rect(0, y, W, h, c); }

    /* ---- 修士立绘（程序化像素小人）---- */
    function cultivator(cx, feetY, robe) {
        var x = cx - 7;
        // 影
        rect(cx - 9, feetY - 1, 18, 3, "rgba(0,0,0,0.18)");
        // 袍身
        rect(x, feetY - 30, 14, 26, robe);
        rect(x + 2, feetY - 30, 10, 26, robe);
        // 腰带
        rect(x, feetY - 16, 14, 3, "#caa24a");
        // 头
        rect(cx - 5, feetY - 40, 10, 10, "#e8c39a");
        // 发髻
        rect(cx - 5, feetY - 42, 10, 4, "#2a2326");
        rect(cx - 2, feetY - 46, 4, 4, "#2a2326");
        // 袖
        rect(x - 3, feetY - 26, 4, 14, robe);
        rect(x + 13, feetY - 26, 4, 14, robe);
    }

    /* ---- 主题：远山（默认 / 仙谷）---- */
    function themeMountain() {
        band(0, 70, "#bfe3ef"); band(70, 40, "#dcefef"); band(110, 90, "#3a5a4a");
        tri([[0, 110], [120, 30], [230, 110]], "#9fb8c4");
        tri([[180, 110], [320, 20], [470, 110]], "#8aa9b8");
        tri([[400, 110], [560, 45], [640, 110]], "#9fb8c4");
        // 云雾
        rect(60, 64, 120, 8, "rgba(255,255,255,0.55)");
        rect(360, 52, 150, 8, "rgba(255,255,255,0.5)");
        // 松
        rect(300, 120, 6, 40, "#3a2c22"); tri([[280, 130], [313, 130], [296, 100]], "#2f6b46");
        tri([[284, 145], [309, 145], [296, 118]], "#357a4f");
        cultivator(330, 160, "#2f6f8f");
        // 地面
        band(160, 40, "#2f4a38");
    }

    /* ---- 主题：洞府 / 幽篁谷（cave）---- */
    function themeCave() {
        band(0, 200, "#1a1622");
        // 洞壁
        rect(0, 0, 60, 200, "#2a2333"); rect(580, 0, 60, 200, "#2a2333");
        // 钟乳石
        for (var i = 0; i < 5; i++) {
            var sx = 80 + i * 100;
            tri([[sx, 0], [sx + 18, 0], [sx + 9, 30 + (i % 3) * 10]], "#3a3340");
        }
        // 发光晶簇
        rect(150, 120, 8, 40, "#5fe0d0"); rect(158, 130, 6, 30, "#8ff0e6");
        rect(470, 110, 8, 50, "#5fb0e0"); rect(478, 122, 6, 36, "#8fd0f0");
        // 地面
        band(170, 30, "#241c2b");
        rect(120, 168, 90, 6, "rgba(95,224,208,0.25)");
        cultivator(330, 170, "#3a5a6a");
    }

    /* ---- 主题：凡俗城池（mortal）---- */
    function themeTown() {
        // 黄昏天
        band(0, 60, "#3a2c4f"); band(60, 50, "#9a5a6b"); band(110, 30, "#e8915b");
        // 远屋檐剪影
        for (var i = 0; i < 9; i++) {
            var rx = i * 74 + 8;
            rect(rx, 120, 60, 50, i % 2 ? "#4a3a4a" : "#3a2e3e");
            tri([[rx - 6, 120], [rx + 66, 120], [rx + 30, 100]], "#2e2433");
        }
        // 灯笼
        for (var j = 0; j < 6; j++) { var lx = 40 + j * 100; rect(lx, 96, 8, 12, "#ffcf6b"); rect(lx - 1, 94, 10, 2, "#7a4a2a"); }
        band(170, 30, "#5a4a3a");
        cultivator(330, 170, "#7a4a3a");
    }

    /* ---- 主题：碎星海（sea）---- */
    function themeSea() {
        band(0, 70, "#bfe3ef"); band(70, 30, "#e9f4ef");
        // 海
        band(100, 100, "#1d6e8c"); band(120, 80, "#2a93b0"); band(150, 50, "#3fb0c4");
        // 浪
        for (var i = 0; i < 14; i++) { var wx = i * 48 + 10; rect(wx, 132 + (i % 2) * 6, 22, 3, "rgba(255,255,255,0.4)"); }
        // 小舟
        tri([[300, 150], [360, 150], [330, 168]], "#5a3a22");
        rect(326, 110, 3, 40, "#5a3a22"); tri([[329, 114], [356, 124], [329, 134]], "#f4f0e6");
        cultivator(330, 150, "#2f6f8f");
    }

    /* ---- 主题：皇城（imperial）---- */
    function themeImperial() {
        band(0, 80, "#cdd9e6"); band(80, 60, "#e7d6c2");
        // 宫墙
        rect(0, 130, W, 70, "#7a2e2e"); rect(0, 122, W, 10, "#a83c3c");
        // 殿宇
        rect(220, 80, 200, 52, "#caa24a");
        tri([[210, 80], [410, 80], [310, 44]], "#8a6a2a");
        rect(250, 100, 18, 32, "#5a2e2e"); rect(372, 100, 18, 32, "#5a2e2e");
        rect(308, 100, 24, 32, "#3a1e1e");
        // 旗
        rect(309, 20, 2, 26, "#5a4a3a"); rect(311, 22, 18, 10, "#a83c3c");
        cultivator(330, 130, "#3a5a6a");
    }

    /* ---- 主题：宗门院落（sect）---- */
    function themeSect() {
        band(0, 70, "#bfe3ef"); band(70, 40, "#dcefef"); band(110, 90, "#3a5a4a");
        tri([[40, 110], [180, 36], [300, 110]], "#9fb8c4");
        tri([[360, 110], [500, 40], [620, 110]], "#8aa9b8");
        // 亭台
        rect(270, 96, 100, 44, "#6a4a2a"); rect(270, 90, 100, 8, "#4a3320");
        tri([[260, 90], [380, 90], [320, 60]], "#3a5a6a");
        rect(284, 110, 10, 30, "#4a3320"); rect(346, 110, 10, 30, "#4a3320");
        band(140, 60, "#2f4a38");
        cultivator(330, 150, "#2f6f8f");
    }

    /* ---- 主题：开局封面（void）---- */
    function themeVoid() {
        band(0, 200, "#0a1426");
        band(0, 70, "#16243f");
        // 月
        rect(520, 36, 44, 44, "#e8eef6"); rect(512, 44, 12, 28, "#0a1426"); rect(556, 40, 10, 30, "#0a1426");
        // 星
        var stars = [[60, 30], [120, 60], [200, 24], [260, 70], [330, 40], [400, 64], [90, 90], [470, 30], [180, 110], [300, 100]];
        stars.forEach(function (s) { rect(s[0], s[1], 2, 2, "rgba(255,255,255,0.8)"); });
        // 远山剪影
        tri([[0, 200], [160, 120], [320, 200]], "#101b30");
        tri([[300, 200], [480, 110], [640, 200]], "#0c1626");
        rect(0, 190, W, 10, "#070d18");
    }

    var THEMES = {
        mountain: themeMountain, cave: themeCave, town: themeTown,
        sea: themeSea, imperial: themeImperial, sect: themeSect, void: themeVoid
    };

    function classify(n) {
        if (!n) return "void";
        if (n.kind === "cave") return "cave";
        if (n.kind === "mortal") return "town";
        if (n.kind === "immortal") {
            if (n.id === "luanxing_hai") return "sea";
            if (n.id === "yuejing_cheng") return "imperial";
            if (n.id === "huangfeng_gu" || n.id === "tainan_gu") return "sect";
            return "mountain";
        }
        return "mountain";
    }

    function curNode() {
        try {
            if (GAME.Map && typeof GAME.Map.cur === "function") return GAME.Map.cur() || null;
        } catch (e) {}
        return null;
    }

    function render() {
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);
        var n = curNode();
        var key = classify(n);
        (THEMES[key] || THEMES.mountain)(n);
    }

    function init() {
        canvas = document.getElementById("scene-canvas");
        if (!canvas) return;
        canvas.width = W; canvas.height = H;
        ctx = canvas.getContext("2d");
        if (ctx && "imageSmoothingEnabled" in ctx) ctx.imageSmoothingEnabled = false;
        render();
    }

    return {
        init: init,
        render: render,
        // 供 UI 在切换地点/回合后调用
        refresh: function () { render(); }
    };
})();

if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { GAME.scene.init(); });
    else GAME.scene.init();
}
