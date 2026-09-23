/* scene.js — 《凡人问道录》唯美仙侠场景横幅渲染引擎
 * 纯原生 Canvas 2D 绘制，零外部依赖，极佳跨端与高分屏保真度。
 */
window.GAME = window.GAME || {};
GAME.scene = (function () {
    var W = 960, H = 240;
    var canvas = null, ctx = null;
    var animId = null;
    var lastTick = 0;
    var t = 0;

    // 氛围粒子（萤火、灵光、游云）
    var particles = [];
    for (var pi = 0; pi < 28; pi++) {
        particles.push({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() * 0.4 + 0.1) * (Math.random() < 0.5 ? 1 : -1),
            vy: -Math.random() * 0.3 - 0.05,
            size: Math.random() * 2.2 + 0.8,
            phase: Math.random() * Math.PI * 2,
            hue: Math.random() < 0.4 ? "#ffeaa7" : (Math.random() < 0.7 ? "#74b9ff" : "#55efc4")
        });
    }

    /* ── 基础绘制辅助函数 ── */
    function grad(y0, y1, stops) {
        var g = ctx.createLinearGradient(0, y0, 0, y1);
        for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
        return g;
    }
    function radGrad(x, y, r0, r1, stops) {
        var g = ctx.createRadialGradient(x, y, r0, x, y, r1);
        for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
        return g;
    }
    function drawRect(x, y, w, h, fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
    }
    function drawPoly(pts, fill) {
        if (!pts || pts.length < 3) return;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fill();
    }

    /* ── 仙鹤群 ── */
    function drawCrane(cx, cy, scale, angle) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.rotate(angle || 0);
        // 身躯
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 4, -0.2, 0, Math.PI * 2);
        ctx.fill();
        // 展翼
        ctx.beginPath();
        ctx.moveTo(-2, -1);
        ctx.quadraticCurveTo(4, -14, 16, -12);
        ctx.quadraticCurveTo(8, -4, 4, 1);
        ctx.closePath();
        ctx.fill();
        // 翼尖墨羽
        ctx.fillStyle = "#1e272e";
        ctx.beginPath();
        ctx.moveTo(10, -13);
        ctx.lineTo(16, -12);
        ctx.lineTo(12, -7);
        ctx.closePath();
        ctx.fill();
        // 长颈与丹顶
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(-8, -1);
        ctx.quadraticCurveTo(-14, -5, -18, -10);
        ctx.lineTo(-17, -11);
        ctx.quadraticCurveTo(-13, -6, -7, -2);
        ctx.closePath();
        ctx.fill();
        // 丹顶红
        ctx.fillStyle = "#ff3838";
        ctx.beginPath();
        ctx.arc(-17.5, -11.5, 1.2, 0, Math.PI * 2);
        ctx.fill();
        // 鹤羽尾翎与双足
        ctx.strokeStyle = "#1e272e";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(9, 2);
        ctx.lineTo(18, 5);
        ctx.stroke();
        ctx.restore();
    }

    /* ── 问道修真者背影立绘 ── */
    function drawCultivator(cx, cy, opts) {
        var opt = opts || {};
        var sc = opt.scale || 1.1;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(sc, sc);

        // 脚底青石阴影
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(0, 2, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 聚气护体微光
        if (opt.glow) {
            ctx.fillStyle = "rgba(116, 185, 255, 0.15)";
            ctx.beginPath();
            ctx.arc(0, -28, 30, 0, Math.PI * 2);
            ctx.fill();
        }

        // 青衣道袍裙摆（带微风摆动）
        var sway = Math.sin(t * 1.5) * 2;
        ctx.fillStyle = opt.robe || "#2c3e50";
        ctx.beginPath();
        ctx.moveTo(-10, -18);
        ctx.lineTo(10, -18);
        ctx.lineTo(14 + sway, 0);
        ctx.lineTo(-14 + sway * 0.5, 0);
        ctx.closePath();
        ctx.fill();

        // 道袍上身
        ctx.fillStyle = opt.robeDark || "#1e272e";
        ctx.fillRect(-8, -36, 16, 19);

        // 紫金腰带与玉佩
        ctx.fillStyle = "#ffd32a";
        ctx.fillRect(-8, -20, 16, 3);
        ctx.fillStyle = "#00d2d3";
        ctx.fillRect(-1, -17, 3, 5);

        // 双肩与双袖
        ctx.fillStyle = opt.robe || "#2c3e50";
        ctx.beginPath();
        ctx.moveTo(-8, -36);
        ctx.lineTo(-15 + sway * 0.4, -22);
        ctx.lineTo(-10, -20);
        ctx.lineTo(-6, -34);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(8, -36);
        ctx.lineTo(15 + sway * 0.4, -22);
        ctx.lineTo(10, -20);
        ctx.lineTo(6, -34);
        ctx.closePath();
        ctx.fill();

        // 背负长剑（剑柄与剑鞘）
        ctx.save();
        ctx.rotate(-0.35);
        ctx.fillStyle = "#808e9b";
        ctx.fillRect(4, -48, 3, 34); // 剑身/鞘
        ctx.fillStyle = "#ffd32a";
        ctx.fillRect(2, -50, 7, 3);  // 剑格
        ctx.fillStyle = "#d63031";
        ctx.fillRect(4, -56, 3, 6);  // 剑柄
        ctx.fillStyle = "#ff7675";
        ctx.beginPath();             // 剑穗
        ctx.moveTo(5.5, -56);
        ctx.lineTo(8 + Math.sin(t * 2) * 2, -63);
        ctx.strokeStyle = "#ff7675";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();

        // 头部与发髻
        ctx.fillStyle = "#d2b48c"; // 颈部肤色
        ctx.fillRect(-3, -40, 6, 5);
        ctx.fillStyle = "#1e272e"; // 乌黑发丝
        ctx.beginPath();
        ctx.arc(0, -43, 7.5, 0, Math.PI * 2);
        ctx.fill();
        // 道簪
        ctx.fillRect(-2, -53, 4, 6);
        ctx.fillStyle = "#00d2d3"; // 翠玉簪
        ctx.fillRect(-5, -51, 10, 2);

        ctx.restore();
    }

    /* ── 苍松古柏 ── */
    function drawPine(x, y, scale) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        // 树干
        ctx.strokeStyle = "#2d3436";
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-15, -35, 12, -70);
        ctx.quadraticCurveTo(24, -90, 8, -110);
        ctx.stroke();

        // 枝桠
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-4, -45); ctx.lineTo(-32, -55);
        ctx.moveTo(10, -68); ctx.lineTo(38, -78);
        ctx.moveTo(8, -90);  ctx.lineTo(-24, -100);
        ctx.stroke();

        // 苍翠松针树冠团
        var pineClouds = [
            [-35, -56, 24, 12, "#1b4d3e", "#2e7d32"],
            [40, -80, 28, 14, "#143d30", "#276e43"],
            [-22, -102, 26, 13, "#1b4d3e", "#2e7d32"],
            [10, -115, 34, 16, "#143d30", "#388e3c"]
        ];
        pineClouds.forEach(function (pc) {
            ctx.fillStyle = pc[4];
            ctx.beginPath();
            ctx.ellipse(pc[0], pc[1] + 2, pc[2], pc[3], -0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = pc[5];
            ctx.beginPath();
            ctx.ellipse(pc[0] - 2, pc[1] - 1, pc[2] * 0.85, pc[3] * 0.8, -0.1, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    /* ── 水墨连绵山峦 ── */
    function drawMountainRange(baseY, peakY, color, detail) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(0, baseY);
        var steps = 14;
        var stepW = W / steps;
        for (var i = 1; i <= steps; i++) {
            var px = i * stepW;
            var py = baseY + Math.sin(i * 1.3 + (detail || 0)) * (baseY - peakY) * 0.65;
            if (i === 4 || i === 9 || i === 12) py = peakY + 10;
            ctx.lineTo(px, py);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
    }

    /* =========================================================================
     * 各场景主题实现
     * ========================================================================= */

    /* ── 1. 封面专属：【凡人问道 · 苍茫仙途】 ── */
    function themeCover() {
        // 破晓仙霄天幕渐变（星夜沉静与晨曦金霞相映）
        drawRect(0, 0, W, H, grad(0, H, [
            [0, "#080c18"],
            [0.35, "#151b32"],
            [0.65, "#3d2b48"],
            [0.85, "#934c44"],
            [1.0, "#d98246"]
        ]));

        // 日月同辉·悬空皓月与晨光晕轮
        ctx.fillStyle = radGrad(720, 75, 0, 120, [
            [0, "rgba(255, 235, 170, 0.45)"],
            [0.4, "rgba(255, 180, 100, 0.18)"],
            [1, "rgba(255, 180, 100, 0)"]
        ]);
        ctx.beginPath();
        ctx.arc(720, 75, 120, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#fff8e7";
        ctx.beginPath();
        ctx.arc(720, 75, 26, 0, Math.PI * 2);
        ctx.fill();

        // 闪烁星宿
        var stars = [[80, 35], [140, 60], [210, 28], [280, 80], [360, 45], [450, 70], [530, 30], [610, 55], [840, 40], [900, 85]];
        stars.forEach(function (st, idx) {
            var pulse = (Math.sin(t * 2 + idx) + 1) * 0.5;
            ctx.fillStyle = "rgba(255,255,255," + (0.3 + pulse * 0.7) + ")";
            ctx.beginPath();
            ctx.arc(st[0], st[1], 1.2 + pulse * 0.6, 0, Math.PI * 2);
            ctx.fill();
        });

        // 远景千层水墨仙山
        drawMountainRange(170, 70, "rgba(24, 30, 52, 0.75)", 1.2);

        // 中景悬浮灵峰与飘云
        drawMountainRange(200, 100, "rgba(15, 22, 38, 0.9)", 3.4);

        // 流云飞瀑
        ctx.fillStyle = "rgba(255, 240, 210, 0.22)";
        ctx.beginPath();
        ctx.ellipse(340 + Math.sin(t * 0.5) * 15, 155, 140, 18, -0.05, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
        ctx.beginPath();
        ctx.ellipse(680 + Math.cos(t * 0.4) * 20, 180, 180, 22, 0.03, 0, Math.PI * 2);
        ctx.fill();

        // 仙鹤群飞掠苍穹
        var craneFly = (t * 22) % (W + 120) - 60;
        drawCrane(craneFly, 68 + Math.sin(t) * 4, 1.1, -0.15);
        drawCrane(craneFly - 32, 82 + Math.sin(t + 0.5) * 4, 0.85, -0.12);
        drawCrane(craneFly - 60, 74 + Math.sin(t + 1.0) * 4, 0.75, -0.18);

        // 近景主峰绝崖与苍松
        ctx.fillStyle = "#0a0f18";
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(0, 140);
        ctx.bezierCurveTo(90, 130, 180, 165, 260, 175);
        ctx.bezierCurveTo(340, 185, 420, 160, 480, 210);
        ctx.lineTo(480, H);
        ctx.closePath();
        ctx.fill();

        drawPine(75, 155, 0.9);

        // 问道青衫修士立于绝顶
        drawCultivator(220, 172, { robe: "#34495e", robeDark: "#1a252f", scale: 1.15, glow: true });

        // 右侧云海崖石与飞阁流光
        ctx.fillStyle = "#0c131f";
        ctx.beginPath();
        ctx.moveTo(W, H);
        ctx.lineTo(W, 130);
        ctx.bezierCurveTo(860, 120, 780, 150, 720, 180);
        ctx.lineTo(720, H);
        ctx.closePath();
        ctx.fill();

        drawPine(880, 140, 0.75);

        // 仙境灵光微粒
        drawParticles();
    }

    /* ── 2. 洞府 / 神手谷 / 幽篁药庐 (Cave / Valley) ── */
    function themeValley() {
        // 月夜幽篁天幕
        drawRect(0, 0, W, H, grad(0, H, [
            [0, "#08141e"],
            [0.5, "#0d262c"],
            [0.85, "#163836"],
            [1.0, "#1c4033"]
        ]));

        // 清冷明月
        ctx.fillStyle = "#e0f7fa";
        ctx.beginPath();
        ctx.arc(800, 50, 22, 0, Math.PI * 2);
        ctx.fill();

        // 远景修竹林密影（竹节与翠叶）
        ctx.fillStyle = "rgba(12, 40, 36, 0.75)";
        for (var bi = 0; bi < 30; bi++) {
            var bx = bi * 34 + 10;
            ctx.fillRect(bx, 20 + (bi % 4) * 15, 4, H);
        }

        // 潺潺灵泉药溪
        ctx.fillStyle = grad(160, H, [
            [0, "#134e4a"],
            [0.4, "#0f766e"],
            [1, "#042f2e"]
        ]);
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(0, 175);
        ctx.bezierCurveTo(240, 160, 480, 195, W, 165);
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();

        // 灵溪水面月影粼光
        ctx.fillStyle = "rgba(224, 247, 250, 0.35)";
        for (var ri = 0; ri < 8; ri++) {
            var rx = 180 + ri * 75 + Math.sin(t * 2 + ri) * 6;
            ctx.fillRect(rx, 180 + (ri % 3) * 12, 38, 2.5);
        }

        // 隐世药庐草堂
        var hx = 620, hy = 120;
        // 茅草歇山屋顶
        drawPoly([[hx, hy], [hx + 120, hy], [hx + 60, hy - 40]], "#5c4033");
        drawPoly([[hx - 10, hy + 5], [hx + 130, hy + 5], [hx + 60, hy - 44]], "#8b5a2b");
        // 庐身
        drawRect(hx + 12, hy + 5, 96, 55, "#3e2723");
        // 暖黄窗烛
        ctx.fillStyle = "#ffeaa7";
        ctx.fillRect(hx + 30, hy + 18, 20, 24);
        ctx.fillRect(hx + 70, hy + 18, 20, 24);
        ctx.fillStyle = "#2d3436";
        ctx.fillRect(hx + 39, hy + 18, 2, 24);
        ctx.fillRect(hx + 79, hy + 18, 2, 24);

        // 药圃中的发光灵草
        var herbs = [[280, 195, "#55efc4"], [320, 185, "#81ecec"], [360, 205, "#a29bfe"], [400, 190, "#ffeaa7"], [450, 200, "#55efc4"]];
        herbs.forEach(function (hb) {
            ctx.fillStyle = hb[2];
            ctx.beginPath();
            ctx.arc(hb[0], hb[1], 4 + Math.sin(t * 3 + hb[0]) * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.fillRect(hb[0] - 1, hb[1] - 8, 2, 8);
        });

        // 近景青石与打坐修士
        ctx.fillStyle = "#1e272e";
        ctx.beginPath();
        ctx.ellipse(180, 190, 70, 25, 0, 0, Math.PI * 2);
        ctx.fill();
        drawCultivator(180, 185, { robe: "#16a085", robeDark: "#0e6655", scale: 1.1, glow: true });

        drawParticles();
    }

    /* ── 3. 宗门胜境 / 苍梧门 / 太南谷 (Sect) ── */
    function themeSect() {
        drawRect(0, 0, W, H, grad(0, H, [
            [0, "#192a56"],
            [0.45, "#273c75"],
            [0.8, "#40739e"],
            [1.0, "#487eb0"]
        ]));

        // 仙宗悬空万丈主峰
        drawMountainRange(170, 60, "rgba(20, 35, 65, 0.85)", 0.8);

        // 凌霄飞仙殿宇重楼
        var sx = 420, sy = 75;
        // 飞檐金瓦
        drawPoly([[sx, sy], [sx + 140, sy], [sx + 70, sy - 35]], "#e1b12c");
        drawPoly([[sx - 8, sy + 4], [sx + 148, sy + 4], [sx + 70, sy - 40]], "#f5cd79");
        drawRect(sx + 18, sy + 4, 104, 60, "#c23616");
        // 门柱
        ctx.fillStyle = "#ffd32a";
        ctx.fillRect(sx + 28, sy + 15, 6, 49);
        ctx.fillRect(sx + 106, sy + 15, 6, 49);

        // 云雾环绕
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.beginPath();
        ctx.ellipse(490, 145, 160, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        // 御剑飞行的流光
        var swordX = (t * 60) % (W + 200) - 100;
        var swordY = 55 + Math.sin(t * 1.5) * 15;
        ctx.strokeStyle = "#00d2d3";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(swordX - 45, swordY + 6);
        ctx.lineTo(swordX, swordY);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(swordX, swordY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // 仙鹤双飞
        drawCrane(220, 60, 0.8, -0.1);
        drawCrane(180, 75, 0.65, -0.08);

        // 白玉灵桥与修士
        ctx.fillStyle = "#dcdde1";
        ctx.fillRect(100, 175, 280, 14);
        drawCultivator(240, 175, { robe: "#273c75", robeDark: "#192a56", scale: 1.05 });

        drawParticles();
    }

    /* ── 4. 凡俗人间 / 景阳城 / 嘉元城 (Town) ── */
    function themeTown() {
        // 黄昏落霞
        drawRect(0, 0, W, H, grad(0, H, [
            [0, "#2c1654"],
            [0.35, "#702e52"],
            [0.7, "#c85a53"],
            [1.0, "#f39c12"]
        ]));

        // 夕阳余晖
        ctx.fillStyle = "#ffeaa7";
        ctx.beginPath();
        ctx.arc(480, 110, 48, 0, Math.PI * 2);
        ctx.fill();

        // 连绵古镇民居瓦顶剪影
        for (var i = 0; i < 11; i++) {
            var rx = i * 92 - 10;
            var rh = 45 + (i % 3) * 16;
            drawRect(rx, 150 - rh, 82, rh + 50, i % 2 ? "#2f3542" : "#1e272e");
            drawPoly([[rx - 8, 150 - rh], [rx + 90, 150 - rh], [rx + 41, 150 - rh - 22]], "#1e272e");
            // 迎风红灯笼
            var lx = rx + 41;
            var ly = 150 - rh + 12;
            ctx.fillStyle = "#e84118";
            ctx.beginPath();
            ctx.ellipse(lx, ly, 7, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fbc531";
            ctx.fillRect(lx - 2, ly - 2, 4, 4);
        }

        // 石拱古桥与漫步修士
        ctx.fillStyle = "#57606f";
        ctx.beginPath();
        ctx.moveTo(140, H);
        ctx.bezierCurveTo(240, 140, 420, 140, 520, H);
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fill();

        drawCultivator(330, 158, { robe: "#747d8c", robeDark: "#2f3542", scale: 1.0 });

        drawParticles();
    }

    /* ── 5. 碧波万顷 / 乱星海 (Sea) ── */
    function themeSea() {
        // 深邃浩渺夜海
        drawRect(0, 0, W, H, grad(0, H, [
            [0, "#050d1a"],
            [0.45, "#0b2545"],
            [0.8, "#133c55"],
            [1.0, "#092327"]
        ]));

        // 极光灵带
        ctx.fillStyle = "rgba(72, 219, 251, 0.15)";
        ctx.beginPath();
        ctx.moveTo(0, 60);
        ctx.bezierCurveTo(300, 30 + Math.sin(t) * 15, 600, 80 - Math.cos(t) * 15, W, 45);
        ctx.lineTo(W, 110);
        ctx.bezierCurveTo(600, 120, 300, 90, 0, 120);
        ctx.closePath();
        ctx.fill();

        // 远方巨鳌仙岛剪影
        drawPoly([[620, 155], [860, 155], [740, 95]], "#0b1b2b");
        drawPine(740, 102, 0.6);

        // 沧海波涛
        ctx.fillStyle = grad(145, H, [
            [0, "#0c3547"],
            [0.5, "#06283d"],
            [1, "#021622"]
        ]);
        ctx.fillRect(0, 145, W, H - 145);

        // 粼粼夜光浪花
        ctx.fillStyle = "rgba(129, 236, 236, 0.35)";
        for (var wi = 0; wi < 16; wi++) {
            var wx = wi * 64 + (t * 12 + wi * 8) % 64;
            var wy = 155 + (wi % 4) * 18;
            ctx.fillRect(wx, wy, 28, 2);
        }

        // 仙家孤舟破浪
        var bx = 260 + Math.sin(t * 1.8) * 6;
        var by = 170 + Math.cos(t * 1.8) * 3;
        drawPoly([[bx - 35, by], [bx + 35, by], [bx, by + 16]], "#3e2723");
        // 灵舟白帆
        ctx.fillStyle = "#f5f6fa";
        drawPoly([[bx - 2, by - 4], [bx - 2, by - 48], [bx + 26, by - 24]], "#dcdde1");
        ctx.strokeStyle = "#718093";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx - 2, by); ctx.lineTo(bx - 2, by - 50);
        ctx.stroke();

        drawCultivator(bx - 8, by - 2, { robe: "#2980b9", robeDark: "#1c5980", scale: 0.9 });

        drawParticles();
    }

    /* ── 粒子动画层 ── */
    function drawParticles() {
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            ctx.fillStyle = p.hue;
            ctx.globalAlpha = (Math.sin(t * 3 + p.phase) + 1) * 0.4 + 0.2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    }

    /* ── 场景路由与分类 ── */
    function isOriginCover() {
        var op = document.getElementById("origin-panel");
        return op && op.style.display !== "none";
    }

    function curNode() {
        try {
            if (GAME.Map && typeof GAME.Map.cur === "function") return GAME.Map.cur() || null;
        } catch (e) {}
        return null;
    }

    function classify(n) {
        if (isOriginCover() || !n) return "cover";
        if (n.kind === "cave" || n.id === "shenshou_gu") return "valley";
        if (n.kind === "mortal" || n.id === "jiayuan_cheng") return "town";
        if (n.kind === "immortal") {
            if (n.id === "luanxing_hai") return "sea";
            if (n.id === "huangfeng_gu" || n.id === "tainan_gu") return "sect";
            return "sect";
        }
        return "cover";
    }

    var THEMES = {
        cover: themeCover,
        valley: themeValley,
        sect: themeSect,
        town: themeTown,
        sea: themeSea
    };

    function renderFrame() {
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);
        var n = curNode();
        var key = classify(n);
        var fn = THEMES[key] || themeCover;
        fn(n);
    }

    function tick(timestamp) {
        if (!lastTick) lastTick = timestamp;
        var dt = (timestamp - lastTick) / 1000;
        lastTick = timestamp;
        if (dt > 0.1) dt = 0.1;
        t += dt;

        // 更新微风与荧光粒子
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < -10) p.x = W + 10;
            if (p.x > W + 10) p.x = -10;
            if (p.y < -10) p.y = H + 10;
        }

        renderFrame();
        animId = requestAnimationFrame(tick);
    }

    function init() {
        canvas = document.getElementById("scene-canvas");
        if (!canvas) return;
        canvas.width = W;
        canvas.height = H;
        ctx = canvas.getContext("2d");
        if (ctx && "imageSmoothingEnabled" in ctx) ctx.imageSmoothingEnabled = true;

        if (!animId) {
            animId = requestAnimationFrame(tick);
        }
    }

    return {
        init: init,
        render: function () { renderFrame(); },
        refresh: function () { renderFrame(); }
    };
})();

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { GAME.scene.init(); });
    } else {
        GAME.scene.init();
    }
}
