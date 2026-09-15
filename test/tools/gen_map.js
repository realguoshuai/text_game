#!/usr/bin/env node
/* gen_map.js —— 程序化生成「碧霄灵谷」(bixiao)
 *
 * 设计（跟手绘四张图的区别）：
 *   ① 岛形 = Simplex 噪声沿圆周调制半径得到的有机轮廓，不是方块/正圆；
 *   ② 空间结构 = 一条贯穿全图的南北中轴：南谷口 → 石堤 → 湖心祭坛 → 北灵脉，
 *      两侧挂竹苑/温泉/静观三处支线景区（有中轴才有"设计感"，均匀撒只会像花园）；
 *   ③ 路 = 8 连通 Dijkstra（等距下对角步进正好是屏幕上的横竖直线，4 连通会走成锯齿）；
 *      石堤先在湖面铺好，路成本里已有路面打折，于是主路自然选择过堤；
 *   ④ 布景 = 地标定点 → 成簇（水晶/竹林是聚落不是撒点）→ 分区填充 → 沿路灯 → 岛缘岩环；
 *   ⑤ 完成前做可达性自检，堵死路的物件自动剔除。
 *
 * 用法: node tools/gen_map.js [--dry]
 */
const fs = require('fs');
const path = require('path');
const ROT = require('rot-js');

const ROOT = path.resolve(__dirname, '..');
const MAPS_PATH = path.join(ROOT, 'assets', 'maps.json');
const SCENE = path.join(ROOT, 'assets', 'scene');
const SLICED = path.join(ROOT, 'assets', 'sliced');

const CFG = { id: 'bixiao', name: '碧霄灵谷', w: 36, h: 36, seed: 20260915 };
const W = CFG.w, H = CFG.h;
const cx = (W - 1) / 2, cy = (H - 1) / 2;

// ★ 本图用**自己的一套地形字符**（g/m/s/p/r/h/d），不复用 '.' ',' '#' ';' '~' '-'。
// 原因：字符 -> 瓦 的映射里，groundTop 是按地图给的（可以各图不同），但
//   **tilePalette 是全局的**，它决定"没有 groundTop 的时候退回哪块**带崖壁的立方瓦**"。
//   本图沿用旧字符时，海岸线那一圈（南/东邻是虚空的陆格）必定退回旧瓦 —— 也就是
//   用户点名的「纯色板绿」和「霓虹青水面」，结果就是一圈旧素材包着新地面。
//   开一套新字符，才能把 tilePalette 里这几块**也换成重铸过的崖壁瓦**，
//   同时完全不动青玄/灵泉/碑林/地宫在用的那几块。
//   （早期版本只新增了一个 '=' 岸沫字符，就是被这个约束逼的。）
const CH_VOID = ' ';
const CH_GRASS = 'g';    // 常草
const CH_MEADOW = 'm';   // 亮草甸（同源、更亮，用来切出成片明暗草场）
const CH_SOIL = 's';     // 滩涂/裸土
const CH_PAVE = 'p';     // 石板路
const CH_RIM = 'r';      // 岸沫
const CH_SHALLOW = 'h';  // 浅水
const CH_WATER = 'd';    // 深水

// 注意：ROT.Noise.Simplex 的第一个参数是「梯度表」不是种子，传数字会死循环。
// 要可复现的噪声，正确做法是先用 ROT.RNG.setSeed 固定随机源、再无参构造。
ROT.RNG.setSeed(CFG.seed);
const nA = new ROT.Noise.Simplex();
ROT.RNG.setSeed(CFG.seed + 977);
const nB = new ROT.Noise.Simplex();
ROT.RNG.setSeed(CFG.seed + 8123);
const nC = new ROT.Noise.Simplex();
ROT.RNG.setSeed(CFG.seed + 4242);

let __t = Date.now();
function tick(label) {
  const d = Date.now() - __t;
  __t = Date.now();
  console.error('  [' + String(d).padStart(5) + 'ms] ' + label);
}

// ---------------------------------------------------------------- 素材
const sizes = {};
function pieceSize(f) {
  if (sizes[f]) return sizes[f];
  const p = path.join(SCENE, f);
  if (!fs.existsSync(p)) throw new Error('缺素材 ' + f);
  const b = fs.readFileSync(p);
  return (sizes[f] = [b.readUInt32BE(16), b.readUInt32BE(20)]);
}

// ---------------------------------------------------------------- 1. 有机岛形
// 形状取向（2026-09-15 第四版）：回到全套地图统一的做法 —— **虚空 + 有机海岸线 +
// 崖壁**。前三版走过的弯路记在这里，别再回头：
//   · 第一版：小岛 + 一圈浅水 + 圈外虚空 → 观感是"浮空的贴片"（用户原话）。
//   · 第二版：把陆地顶到图幅四边 → 四边被图幅直接切断，成了一个正方地块；
//     而且半径≈图幅半宽时，椭圆轮廓在等距下就是一整条 45° 斜线，投影出来是
//     一圈**步长完全一致**的锯齿（像机器切的菱形）。
//   · 第三版：岛落在图幅内、四周由水包住 → 不切边了，但轮廓还是一条椭圆，
//     投影出来仍是**几何菱形**：青玄山门那种"参差的海岸线"完全没有。原因见下。
//   · 这一版：把「边缘处理」交还给引擎本来就在用的那套（虚空 + PAL[ch] 的带崖壁
//     立方瓦），陆地只负责长成有机形状。
// 关键手法：**在二维噪声场上取轮廓**，不是在圆周上采样噪声。
//   旧写法 nA.get(cos(ang)*k, sin(ang)*k) 把噪声只沿一条圆采样 —— 于是陆地的
//   极坐标半径 ang -> r(ang) 是**单值函数**，形状在数学上被限定为"星形"：可以有
//   凸起和凹口，但**永远不可能出现真正咬进去的海湾或伸出来的岬角**。这就是为什么
//   无论把幅度调多大、倍频加几档，投影出来始终是个圆（等距下＝标准菱形）。
//   改成 d(x,y) <= 1 + field(x,y)：边界是「径向包络」与「二维噪声等值线」的交，
//   噪声场自身带闭合的岛/湾结构，海岸线才真的参差。
// 两个尺度分工（2026-09-15 补）：低频项（~18 格）负责"这块整体鼓出来 / 凹进去"，
//   决定岛的**轮廓走向**，它才填得满图幅四角；中高频项只负责岸线上的小湾小岬。
//   只放中高频（旧版 0.105/0.255/0.560）时，轮廓仍是一条半径均匀的椭圆 ——
//   因为那些项在一个"整岛尺度"上互相抵消，平均下来还是圆。
// 包络形状 = **椭圆**（p=2）。为什么不用超椭圆去"填四角"（试过 p=6，反而更糟）：
//   p 越大轴向那一段越平 —— p=6 时边界在 |dy|<=0.5 的范围内 x 只变化 0.03 格，
//   等距下就是一条 13 格长的**笔直海岸线**，比椭圆更假。四角本来就该留虚空：
//   青玄山门的岸线也是"大块陆地填满内部、四角倒角、边缘薄薄一圈不规则虚空"。
//   所以轮廓的参差完全交给噪声，包络只负责"别碰到图幅边"。
const INSET = 2.6;                  // 包络半径离图幅边这么多格（噪声还能往外鼓过它）
const RXN = cx - INSET, RYN = cy - INSET;
// 噪声配比（2026-09-15 定，land≈63%，与青玄的 63% 同量级）：
//   ⚠ 只用一档最低频时，它的**零等值线**会刚好顺着一条轴向跑，海岸线被"拖直"
//   十几格（试过：整条左边是笔直的竖线）。两档低频、不同噪声源、不同相位叠加之后
//   等值线才弯得起来。中高频只负责岸线上的小湾小岬，权重不能大。
const LAND_TERMS = [
  [nC, 0.034, 7, 0.28],    // 岛的大鼓包 / 大凹进（~29 格）
  [nA, 0.062, 41, 0.30],   // 次级大湾（~16 格）
  [nA, 0.120, 3, 0.24],    // 大湾 / 大岬角（~8 格）
  [nC, 0.240, 77, 0.16],   // 次级海湾（~4 格）
  [nA, 0.550, 90, 0.09],   // 岸线碎边（~1.8 格）
];
const LAND_AMP = 0.46;
function landAt(x, y) {
  const dx = Math.abs(x - cx) / RXN, dy = Math.abs(y - cy) / RYN;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 2.2) return false;                      // 远到不可能成陆，省掉噪声采样
  let f = 0;
  for (const [n, k, o, w] of LAND_TERMS) f += n.get(x * k + o, y * k + o) * w;
  return d <= 1 + f * LAND_AMP;
}

/** 8 邻多数滤波：削 1 格凸起、填 1 格凹口。等距下海岸线的锯齿全靠它抹平。 */
function smoothMask(mask, passes, lo, hi) {
  for (let pass = 0; pass < passes; pass++) {
    const nx = mask.map(r => r.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const yy = y + j, xx = x + i;
        if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
        c += mask[yy][xx];
      }
      if (mask[y][x] && c < lo) nx[y][x] = 0;       // 孤零零的凸起 → 削掉
      if (!mask[y][x] && c > hi) nx[y][x] = 1;      // 只剩一格的凹口 → 填平
    }
    mask = nx;
  }
  return mask;
}

let land = [];
for (let y = 0; y < H; y++) {
  land[y] = [];
  for (let x = 0; x < W; x++) land[y][x] = landAt(x, y) ? 1 : 0;
}
// lo=4 / hi=4 是标准多数滤波；跑 3 遍足以把 1 格锯齿消干净，
// 再往上跑就会把噪声给的"湖湾"也啃圆，失去有机感。
land = smoothMask(land, 1, 4, 4);
tick('岛形');

// 只保留最大连通域
(function keepBiggest() {
  const seen = land.map(r => r.map(() => 0));
  let best = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!land[y][x] || seen[y][x]) continue;
    const q = [[x, y]], comp = [];
    seen[y][x] = 1;
    while (q.length) {
      const [ax, ay] = q.pop();
      comp.push([ax, ay]);
      for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = ax + i, yy = ay + j;
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        if (!land[yy][xx] || seen[yy][xx]) continue;
        seen[yy][xx] = 1; q.push([xx, yy]);
      }
    }
    if (comp.length > best.length) best = comp;
  }
  land = land.map(r => r.map(() => 0));
  for (const [x, y] of best) land[y][x] = 1;
})();

// 填掉被陆地围住的孤立虚空格。
// keepBiggest 只处理"孤立的陆地"，管不了"陆地中间的洞"：噪声在海湾处留下一个
// 1 格的虚空，四邻全是陆地，等距下就是一个**露天的窟窿**（天空从地面中央透出来）。
// 判据很省事：从图幅四边把"非陆格"淹没一遍，淹不到的非陆格就是洞。
(function fillHoles() {
  const seen = land.map(r => r.map(() => 0));
  const q = [];
  for (let x = 0; x < W; x++) {
    if (!land[0][x]) { seen[0][x] = 1; q.push([x, 0]); }
    if (!land[H - 1][x]) { seen[H - 1][x] = 1; q.push([x, H - 1]); }
  }
  for (let y = 0; y < H; y++) {
    if (!land[y][0]) { seen[y][0] = 1; q.push([0, y]); }
    if (!land[y][W - 1]) { seen[y][W - 1] = 1; q.push([W - 1, y]); }
  }
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
      if (land[yy][xx] || seen[yy][xx]) continue;
      seen[yy][xx] = 1; q.push([xx, yy]);
    }
  }
  let filled = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!land[y][x] && !seen[y][x]) { land[y][x] = 1; filled++; }
  }
  if (filled) console.error('  [补洞] ' + filled + ' 个被围住的虚空格 → 陆地');
})();

// 填掉"针眼"：8 邻域里陆地邻居 >=5 的虚空格，只剩一个口子通向外面 —— 等距下就是
// 岸线上一个 1 格的针孔，读起来像噪点而不是海湾。真正的海湾至少宽 2 格。
// ⚠ 上一步的 smoothMask 里其实有同一条规则（hi=4 就是"陆地邻居 >=5 就填"），
//   但它在 keepBiggest 之前跑，被 drop 掉的分量附近的计数会失真，留下漏网的。
//   这里在 keepBiggest 之后再跑一遍，且跑两趟（填一格会让旁边的计数达到阈值）。
for (let pass = 0; pass < 2; pass++) {
  const add = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (land[y][x]) continue;
    let c = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      if (!i && !j) continue;
      const yy = y + j, xx = x + i;
      if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
      if (land[yy][xx]) c++;
    }
    if (c >= 5) add.push([x, y]);
  }
  if (!add.length) break;
  for (const [x, y] of add) land[y][x] = 1;
  if (pass === 0) console.error('  [补针眼] ' + add.length + ' 格');
}

// ---------------------------------------------------------------- 2. 灵湖
// 中央灵湖是全图唯一的大水面，必须够大才立得住：第一版 LRX/LRY=6.8/5.0 只有
// 33 格深水，在一整片草地上就是一个"水坑"。现在约 170 格，且同样只由角度低频
// 项塑形 + 多数滤波，避免湖岸碎成锯齿。
const LX = cx, LY = cy - 1.4, LRX = 8.6, LRY = 7.1;
// ⚠ 湖岸同样**不能**沿圆周采样噪声（和岛形是同一个错，见上）：那样湖的极半径是
//   单值函数，形状被数学锁死成星形 —— 投影出来就是一个"方台阶水池"，
//   而湖岸恰好是全图最显眼的一条边。照样改成二维噪声场取等值线。
const LAKE_TERMS = [
  [nA, 0.150, 31, 0.55],   // 湖的大湾（~6.7 格）
  [nA, 0.330, 7, 0.28],    // 次级凸凹（~3 格）
  [nA, 0.700, 61, 0.12],   // 岸线碎边（~1.4 格）
];
function lakeAt(x, y) {
  const dx = (x - LX) / LRX, dy = (y - LY) / LRY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1.6) return false;
  let f = 0;
  for (const [n, k, o, w] of LAKE_TERMS) f += n.get(x * k + o, y * k + o) * w;
  return d <= 1 + f * 0.32;
}
let water = land.map(r => r.map(() => 0));
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (land[y][x] && lakeAt(x, y)) water[y][x] = 1;
}
water = smoothMask(water, 1, 4, 4);

// ---------------------------------------------------------------- 距离场工具
function bfsDistFrom(isSource) {
  const d = Array.from({ length: H }, () => new Array(W).fill(1e9));
  const q = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isSource([x, y])) { d[y][x] = 0; q.push([x, y]); }
  }
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
      if (d[yy][xx] > d[y][x] + 1) { d[yy][xx] = d[y][x] + 1; q.push([xx, yy]); }
    }
  }
  return d;
}
const distVoid = bfsDistFrom(([x, y]) => !land[y][x]);
// 从陆地往外的距离（虚空那侧用它）。注意 distVoid 对虚空格恒为 0，
// 想量"离岸多远"必须反过来算。
const distLand = bfsDistFrom(([x, y]) => land[y][x]);
const RING = 3;          // 环岛灵池宽度（格）

(function shrinkLake() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (water[y][x] && distVoid[y][x] < 4) water[y][x] = 0;
  }
})();
const distWater = bfsDistFrom(([x, y]) => water[y][x]);
tick('湖 + 距离场');

// ---------------------------------------------------------------- 3. 地面字符
function passable(x, y) {
  return x >= 0 && x < W && y >= 0 && y < H && land[y][x] && !water[y][x];
}
const ground = [];
for (let y = 0; y < H; y++) {
  ground[y] = [];
  for (let x = 0; x < W; x++) {
    if (!land[y][x]) { ground[y][x] = CH_VOID; continue; }
    if (water[y][x]) { ground[y][x] = CH_WATER; continue; }
    // 滩涂：取「离水/离虚空的距离」小值，只有 1 格宽的连续带。
    // ⚠ 两处历史坑，都出自同一类错误 —— 用逐格噪声去修饰一条"带"：
    //   ① 最早是逐格采样噪声决定土/草，出来满地单点泥斑；
    //   ② 后来改成 eb=1 连续 + eb=2 再按噪声断续加宽，第二圈就变成了
    //      "草地内部打满碎石补丁"（滩涂在地图上占 15%，却全在草地中间碎掉）。
    //   滩涂是水陆过渡，就老老实实贴着岸走一圈，宽度交给岸线形状去变化。
    const eb = Math.min(distVoid[y][x], distWater[y][x]);
    if (eb <= 1) {
      ground[y][x] = CH_SOIL;
    } else {
      // 大尺度草甸斑块：低频噪声分出「亮草甸 / 常草」两种草地。
      // 整张图只铺一种绿，投影成一个菱形大色块，平坦得像一块毯子；有了成片
      // 的明暗草场，地面才有"地形"的读感。
      // ⚠ 频率必须**很低**：0.19 时特征尺度只有 ~5 格，出来是满地绿斑（又变回撒点
      //   噪声了，只是斑块大一点）。0.105 给到 ~10 格，才是"一片草场"。
      ground[y][x] = nC.get(x * 0.105 + 5, y * 0.105 + 5) > 0.20 ? CH_MEADOW : CH_GRASS;
    }
  }
}

// 图幅内所有非陆格 = 虚空（CH_VOID），引擎跳过不画，露出天空。
// 为什么不再"非陆格一律铺水"：全铺水等于给岛套了一圈规则的水带，读到的还是
// "一块浮板 + 一圈蓝边"。引擎本来就有一套边缘处理 —— 陆格的南/东邻是虚空时，
// 它改用 PAL[ch] 那块**带崖壁的立方瓦**（见 game.js 的 drawGround），于是岛有了
// 厚度，和其余四张图完全同款。水只留在岛内的灵湖里，是"地形"，不是"边框"。
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!land[y][x]) { ground[y][x] = CH_VOID; water[y][x] = 0; }
}

// ---------------------------------------------------------------- 4. 中轴：石堤 + 湖心祭坛
const AX_X = Math.round(LX);
const altarY = Math.round(LY);

// 湖心平台：对称菱形（|dx|+|dy|<=3）。祭坛是全图的视觉中心，
// 形状一旦被石堤的摆动带歪，看起来就是"湖里一摊乱石头"，所以先定形再铺堤。
for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
  if (Math.abs(dx) + Math.abs(dy) > 3) continue;
  const x = AX_X + dx, y = altarY + dy;
  if (y < 0 || y >= H || x < 0 || x >= W) continue;
  if (water[y][x] || ground[y][x] === CH_SHALLOW) {
    water[y][x] = 0;
    ground[y][x] = CH_PAVE;
  }
}
// 石堤：沿中轴把湖切开，单格宽。摆动幅度收到 ±1 且概率调低 ——
// 原来 ±2 / 0.32 摆得太勤，堤岸在等距下会碎成一段段错开的石阶。
(function carveCauseway() {
  for (const dir of [-1, 1]) {
    let wx = AX_X;
    for (let step = 1; step < H; step++) {
      const y = altarY + dir * step;
      if (y < 0 || y >= H) break;
      if (!land[y][wx]) break;
      // 先摆动再填，保证相邻行的堤格一定八连通
      if (ROT.RNG.getUniform() < 0.18) {
        const cand = wx + (ROT.RNG.getUniform() < 0.5 ? -1 : 1);
        if (Math.abs(cand - AX_X) <= 1 && land[y][cand]) wx = cand;
      }
      if (water[y][wx]) { water[y][wx] = 0; ground[y][wx] = CH_PAVE; }
    }
  }
})();
tick('石堤 + 湖心祭坛');

// 岸线浅水：所有「水与非水相邻」的格子换成 '-' 瓦。这样每一条岸（灵湖的、
// 湖湾的、图幅边缘的）都自带一圈更亮的浅水，水面才有「浅 → 深」的层次；
// 否则一整片同色水在等距下就是一块平板。
(function shadeShore() {
  // ⚠ 别用 distLand：它的源是「是否陆地」，而湖格本身也算陆地（水是陆地掩码的子集），
  //   于是湖里每格的 distLand 都是 0，整片湖会被判成"贴岸"而全刷成浅水 ——
  //   深浅水的层次直接消失（这正是"湖面像一块平板"的真凶）。
  //   要量"离岸多远"必须反过来：从**非水**的格子出发做距离场。
  //
  // 三档水色按「离岸距离」逐格**概率**决定：
  //   '=' 岸沫（最亮）→ '-' 浅水 → '~' 深水（最暗）。
  // 两个要点：
  //   ① 必须有"亮 → 暗"的渐变带，水才有深度。只有两档且色调拉开时，边界是一条
  //      1 格一阶的楼梯，湖面被切成亮、暗两块剪纸；色调不拉开则整片平掉。
  //   ② 每一档都用概率抖，不用"距离 <= N 就一定是某档" —— 硬边界在等距网格上
  //      永远是楼梯。抖动之后，5 格宽度里自然过渡，看不出格。
  // <0.5 时取更亮的那一档。
  const distDry = bfsDistFrom(([x, y]) => !water[y][x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!water[y][x]) continue;
    const dd = Math.min(5, distDry[y][x]);
    // 抖动量用**低频噪声**而不是纯随机：纯随机的深浅交界是满地麻点，像油渍；
    // 让抖动沿噪声等值线走，深水区就成片、边界是有形状的（这才像水深变化）。
    const r = 0.5 + 0.5 * nB.get(x * 0.34 + 7, y * 0.34 + 7);
    if (dd <= 1) ground[y][x] = CH_RIM;
    else if (dd === 2) ground[y][x] = r < 0.22 ? CH_RIM : CH_SHALLOW;
    else if (dd === 3) ground[y][x] = r < 0.55 ? CH_SHALLOW : CH_WATER;
    else ground[y][x] = CH_WATER;
  }
})();

// ---------------------------------------------------------------- 5. 主路与支路（8 连通 Dijkstra）
function paveNear(x, y) {
  let n = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
    if (ground[yy][xx] === CH_PAVE) n++;
  }
  return n;
}
function findPath(from, to) {
  const cost = (x, y) => {
    if (!passable(x, y)) return Infinity;
    let c = 1;
    if (ground[y][x] === CH_SOIL) c += 0.25;
    c += distWater[y][x] === 1 ? 1.2 : 0;
    c += (nB.get(x * 0.7 + 71, y * 0.7 + 71) * 0.30 + 0.30);
    if (ground[y][x] === CH_PAVE) c *= 0.18;      // 已有路面：走上去便宜（合流是好事）
    else c += paveNear(x, y) * 1.4;               // 贴着已有路面平行：罚（否则两条路并排成宽石带）
    return c;
  };
  const dist = Array.from({ length: H }, () => new Array(W).fill(Infinity));
  const prev = Array.from({ length: H }, () => new Array(W).fill(null));
  const pq = [[0, from[0], from[1]]];
  dist[from[1]][from[0]] = 0;
  while (pq.length) {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[bi][0]) bi = i;
    const [d0, x, y] = pq.splice(bi, 1)[0];
    if (d0 > dist[y][x] + 1e-9) continue;
    if (x === to[0] && y === to[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
      // 等距下对角步进在屏幕上只有 60px、正交步进是 67px，对角其实更"短"；
      // 代价给 1.2 而不是 √2，路才会两种步进混用，而不是走成一堆 L 形拐角。
      const c = cost(xx, yy) * (dx && dy ? 1.2 : 1);
      if (!isFinite(c)) continue;
      const nd = d0 + c;
      if (nd < dist[yy][xx]) { dist[yy][xx] = nd; prev[yy][xx] = [x, y]; pq.push([nd, xx, yy]); }
    }
  }
  if (!isFinite(dist[to[1]][to[0]])) return null;
  const out = [];
  let cur = to;
  while (cur) { out.push(cur); cur = prev[cur[1]][cur[0]]; }
  return out.reverse();
}

// 谷口定在南缘正中 —— 「从南边进谷」是这个场景的叙事起点。
// ⚠ 原来靠 distVoid<=2（"紧贴岸线"）来判定谷口，前提是"岛被水围一圈"。改成
//   陆地铺到图幅四边之后，南缘整条都是陆地、distVoid 很大，于是条件永远不成立，
//   循环一路扫到最北边才碰到水，谷口跑到了北岸（整套路网跟着翻个个儿）。
//   现在只要求"南缘能走、且两格内有邻居能走"，不再依赖水的存在。
let entry = null;
for (let y = H - 1; y >= 1 && !entry; y--) {
  for (let x = Math.floor(cx) - 4; x <= Math.ceil(cx) + 4; x++) {
    if (!passable(x, y) || !passable(x, y - 1)) continue;
    let open = 0;
    for (let j = 0; j <= 2; j++) for (const dx of [-1, 0, 1]) if (passable(x + dx, y - j)) open++;
    if (open >= 8) { entry = [x, y - 1]; break; }
  }
}
// 锚点写的是"大概位置"（"东边竹林那一片"），而岛形/湖形每调一次参数就会动，
// 于是锚点很容易落到水里或虚空里 —— findPath 返回 null，那条支路**静默消失**，
// 只在自检里留一行 ⚠。所以锚点一律先吸到最近的、**站得住**的可行走格再拿去寻路。
// ⚠ 光判 passable 不够：湖形一变，(27,17) 那种"一格孤岛"也会 passable，
//   吸上去照样不可达（实测踩过 —— 竹苑那条路整条没了）。所以还要求四邻里至少
//   3 格可走，把 1 格窄的悬崖边、堤头排除掉。
function openDeg(x, y) {
  let n = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (passable(x + dx, y + dy)) n++;
  return n;
}
function snapAnchor(a, maxR) {
  if (passable(a[0], a[1]) && openDeg(a[0], a[1]) >= 3) return a;
  for (let r = 1; r <= (maxR || 9); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = a[0] + dx, y = a[1] + dy;
      if (passable(x, y) && openDeg(x, y) >= 3) return [x, y];
    }
  }
  return a;
}
const ANCHORS = {
  vein: snapAnchor([Math.round(cx) - 5, 5]),
  bamboo: snapAnchor([W - 9, Math.round(cy) - 1]),
  spring: snapAnchor([7, Math.round(cy) + 8]),
  garden: snapAnchor([W - 10, H - 9]),
};
const altar = snapAnchor([AX_X, altarY + 2]);   // 可达性锚点：雕像占住台心，锚点定在雕像南侧的迎宾位

const routes = [];
function drawRoute(r) {
  if (!r) return;
  routes.push(r);
  for (const [x, y] of r) if (passable(x, y)) ground[y][x] = CH_PAVE;
}
// 每算完一条立刻落到 ground 上，下一条才能"看见"它并绕开 —— 四条支路各自算完
// 再一起合并的话，它们会在入口附近挤成一坨，画出来就是一块不规则的宽石台。
const mainPath = findPath(entry, ANCHORS.vein);
drawRoute(mainPath);
for (const k of Object.keys(ANCHORS)) {
  if (k === 'vein') continue;
  const target = ANCHORS[k];
  let best = null, bd = Infinity;
  for (const p of mainPath) {
    const d = Math.abs(p[0] - target[0]) + Math.abs(p[1] - target[1]);
    if (d < bd && d > 2) { bd = d; best = p; }
  }
  drawRoute(findPath(best, target));
}
let paveN = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ground[y][x] === CH_PAVE) paveN++;
tick('主路 + 支路');
const paveBefore = paveN;

// ---------------------------------------------------------------- 5b. 路面骨架化
// 支路汇入主路时总会并行两三个格子才贴上，画出来就是一小块"宽石台"（放大看很扎眼）。
// 代价函数再怎么罚都消不干净 —— 因为并行段确实是最短路径。所以画完统一收缩：
// 反复删掉「删了也不影响路面连通性」的格子（非端点、且其路面邻居互相仍连通）。
// 保护集 = 祭坛平台 + 石堤：那两处的"宽"是设计意图，不是并线事故。
(function thinPave() {
  const keep = new Set();
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (Math.abs(dx) + Math.abs(dy) > 3) continue;
    const x = AX_X + dx, y = altarY + dy;
    if (x >= 0 && x < W && y >= 0 && y < H) keep.add(x + ',' + y);
  }
  for (let dy = -4; dy <= 4; dy++) keep.add(AX_X + 1 + ',' + (altarY + dy));
  for (let dy = -4; dy <= 4; dy++) keep.add(AX_X - 1 + ',' + (altarY + dy));

  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const isP = (x, y) => x >= 0 && x < W && y >= 0 && y < H && ground[y][x] === CH_PAVE;
  for (let pass = 0; pass < 3; pass++) {
    const list = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isP(x, y)) list.push([x, y]);
    shuffle(list);
    let removed = 0;
    for (const [x, y] of list) {
      if (!isP(x, y) || keep.has(x + ',' + y)) continue;
      const nb = N8.filter(([i, j]) => isP(x + i, y + j)).map(([i, j]) => [x + i, y + j]);
      if (nb.length < 2) continue;                 // 端点：删了就成断头路
      // 去掉本格后，路面邻居之间是否仍然连通？连通 → 本格是"赘肉"，可删。
      const set = new Set(nb.map(p => p[0] + ',' + p[1]));
      const seen = new Set([nb[0][0] + ',' + nb[0][1]]);
      const q = [nb[0]];
      while (q.length) {
        const [ax, ay] = q.pop();
        for (const [i, j] of N8) {
          const k = (ax + i) + ',' + (ay + j);
          if (!set.has(k) || seen.has(k)) continue;
          seen.add(k); q.push([ax + i, ay + j]);
        }
      }
      if (seen.size !== set.size) continue;         // 是割点，删了会断路
      ground[y][x] = CH_GRASS;
      removed++;
      nb.length = 0;
    }
    if (!removed) break;
  }
})();
paveN = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ground[y][x] === CH_PAVE) paveN++;
tick('路面骨架化（' + paveBefore + ' → ' + paveN + ' 格）');

// ---------------------------------------------------------------- 6. 景区分区
const REGION_ANCHORS = [
  { id: 'gate', ax: entry[0], ay: entry[1] - 2 },
  { id: 'bamboo', ax: ANCHORS.bamboo[0], ay: ANCHORS.bamboo[1] },
  { id: 'spring', ax: ANCHORS.spring[0], ay: ANCHORS.spring[1] },
  { id: 'vein', ax: ANCHORS.vein[0], ay: ANCHORS.vein[1] },
  { id: 'altar', ax: altar[0], ay: altar[1] },
  { id: 'garden', ax: ANCHORS.garden[0], ay: ANCHORS.garden[1] },
];
function regionOf(x, y) {
  if (distWater[y][x] <= 1) return 'lakeside';
  if (distVoid[y][x] <= 2) return 'coast';
  let best = 'grass', bd = Infinity;
  for (const r of REGION_ANCHORS) {
    const d = Math.hypot(x - r.ax, (y - r.ay) * 1.3);
    if (d < bd) { bd = d; best = r.id; }
  }
  return bd < 8.5 ? best : 'grass';
}

// ---------------------------------------------------------------- 7. 布景
const objects = [];
const occupancy = new Set();
const minSep = [];

function fp(f) {
  const [w] = pieceSize(f);
  return w >= 170 ? [2, 1] : [1, 1];
}
function canPlace(x, y, f, solid, minDist) {
  const [fw, fh] = fp(f);
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
    const xx = x + i, yy = y + j;
    if (!passable(xx, yy)) return false;
    if (occupancy.has(xx + ',' + yy)) return false;
    if (solid && ground[yy][xx] === CH_PAVE) return false;
  }
  for (const p of minSep) {
    if (Math.hypot(p[0] - x, (p[1] - y) * 1.25) < minDist) return false;
  }
  return true;
}
function place(f, x, y, opt) {
  opt = opt || {};
  const [fw, fh] = fp(f);
  const solid = opt.solid !== undefined ? opt.solid : true;
  const o = { piece: 'scene/' + f, x, y, fw, fh };
  if (!solid) o.solid = false;
  if (opt.dy) o.dy = opt.dy;
  objects.push(o);
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) occupancy.add((x + i) + ',' + (y + j));
  minSep.push([x, y]);
  return o;
}

// ---- 7a 地标（定点，中轴上的视觉焦点） ----
(function buildGate() {
  const put = (f, x, y) => { if (canPlace(x, y, f, true, 0)) place(f, x, y); };
  put('stone-gate.png', entry[0], entry[1] - 1);
  put('lion-statue-guardian.png', entry[0] - 3, entry[1] - 3);
  put('lion-statue-guardian.png', entry[0] + 3, entry[1] - 3);
  put('torii-gate.png', entry[0] - 1, entry[1] - 7);
})();
(function buildAltar() {
  const put = (f, x, y) => { if (canPlace(x, y, f, true, 0)) place(f, x, y); };
  put('ancient-obelisk.png', altar[0], altar[1] - 1);
  put('stone-pillar.png', altar[0] - 3, altar[1]);
  put('stone-pillar.png', altar[0] + 3, altar[1]);
  put('runestone-glowing.png', altar[0] - 1, altar[1] + 3);
  put('runestone-glowing.png', altar[0] + 1, altar[1] + 3);
  put('broken-pillar.png', altar[0], altar[1] + 4);
})();
(function buildSpring() {
  const [sx0, sy0] = ANCHORS.spring;
  const put = (f, x, y) => { if (canPlace(x, y, f, true, 0)) place(f, x, y); };
  put('hot-spring.png', sx0, sy0);
  put('cairn-stones.png', sx0 - 3, sy0 + 1);
  put('gray-boulder.png', sx0 + 3, sy0 - 1);
  place('campfire-burning-midnight.png', sx0 + 3, sy0 + 2, { solid: false });
})();
(function buildBamboo() {
  const [bx, by] = ANCHORS.bamboo;
  const put = (f, x, y) => { if (canPlace(x, y, f, true, 0)) place(f, x, y); };
  put('bamboo-gate.png', bx - 4, by - 2);
  put('bamboo-clump-a.png', bx, by);
})();
(function buildGarden() {
  const [gx, gy] = ANCHORS.garden;
  const put = (f, x, y) => { if (canPlace(x, y, f, true, 0)) place(f, x, y); };
  put('stone-archway.png', gx - 4, gy - 2);
  put('dead-tree-autumn-midnight.png', gx + 3, gy + 1);
})();
(function buildVein() {
  // 北灵脉：灵脉的"眼"是一块冒光的大灵石，比摆一堆彩色水晶更克制
  const [vx, vy] = ANCHORS.vein;
  const put = (f, x, y) => { if (canPlace(x, y, f, true, 0)) place(f, x, y); };
  put('crystal-cluster-green.png', vx, vy);
  put('runestone-glowing.png', vx - 2, vy + 2);
  put('broken-pillar.png', vx + 3, vy + 1);
})();
(function buildAltar() {
  // 湖心祭坛：全图视觉中心，不能是一块空石台。
  // 玉龙雕像坐镇台心，东西两角石柱框场，南阶一对灯笼引路 ——
  // 从谷口沿中轴望过来，视线终点必须"有东西"。
  // 注意：canPlace 拒绝在路面放 solid 物件（防挡路），祭坛平台本身就是
  // 为摆设准备的，所以这里直接落件并登记占位，绕过这条规则。
  const hard = (f, x, y, solid) => {
    const [fw, fh] = fp(f);
    const o = { piece: 'scene/' + f, x, y, fw, fh };
    if (!solid) o.solid = false;
    objects.push(o);
    occupancy.add(x + ',' + y);
    minSep.push([x, y]);
  };
  hard('dragon-statue-jade.png', AX_X, altarY, true);
  hard('stone-pillar.png', AX_X - 3, altarY, true);
  hard('stone-pillar.png', AX_X + 3, altarY, true);
  hard('lantern-paper-yellow.png', AX_X - 1, altarY + 2, false);
  hard('lantern-paper-yellow.png', AX_X + 1, altarY + 2, false);
})();

// ---- 7b 成簇（水晶 / 竹林是聚落，撒点只会显得平均） ----
const NON_SOLID = new Set(['tall-grass-tuft-midnight.png', 'mushroom-cluster-glowing-blue-midnight.png',
  'rock-pile-small-midnight.png', 'venus-flytrap.png', 'campfire-burning-midnight.png',
  'lantern-paper-red.png', 'lantern-paper-yellow.png']);

function cluster(cx0, cy0, radius, files, count, minD) {
  let placed = 0;
  const local = [];
  for (let a = 0; a < count * 26 && placed < count; a++) {
    const x = Math.round(cx0 + (ROT.RNG.getUniform() * 2 - 1) * radius);
    const y = Math.round(cy0 + (ROT.RNG.getUniform() * 2 - 1) * radius);
    if (Math.hypot(x - cx0, (y - cy0) * 1.2) > radius) continue;
    if (local.some(p => Math.hypot(p[0] - x, (p[1] - y) * 1.2) < minD)) continue;
    const f = files[Math.floor(ROT.RNG.getUniform() * files.length)];
    if (!canPlace(x, y, f, true, minD * 0.9)) continue;
    place(f, x, y, { solid: true });
    local.push([x, y]);
    placed++;
  }
  return placed;
}

// 灵脉：只用青玉色一种水晶（原来的冰蓝/品红三色并排，饱和度高且互相打架，
// 摆在青绿谷地里像三块塑料）。数量也收到 2 处、每处 2 块。
let veinN = 0;
for (const [vx, vy, r] of [
  [ANCHORS.vein[0], ANCHORS.vein[1], 3.6],
  [ANCHORS.vein[0] - 7, ANCHORS.vein[1] + 6, 2.8],
]) {
  veinN += cluster(vx, vy, r, ['crystal-cluster-green.png'], 2, 2.0);
}
// 竹苑：三丛真竹（a/b/c，b 是 a 的镜像）+ 高草收边
const bambooN = cluster(ANCHORS.bamboo[0], ANCHORS.bamboo[1], 5.2,
  ['bamboo-clump-a.png', 'bamboo-clump-b.png', 'bamboo-clump-c.png'], 13, 1.35)
  + cluster(ANCHORS.bamboo[0] - 6, ANCHORS.bamboo[1] + 8, 3.6,
    ['bamboo-clump-c.png', 'bamboo-clump-b.png', 'tall-grass-tuft-midnight.png'], 6, 1.4);
// 温泉：棕榈（bamboo-cluster 实际是棕榈造型）配温泉最搭，挪到这里来
cluster(ANCHORS.spring[0] + 2, ANCHORS.spring[1] - 3, 3.6,
  ['bamboo-cluster.png', 'bamboo-cluster.png', 'tall-grass-tuft-midnight.png',
    'maple-tree-autumn.png'], 7, 1.8);
cluster(ANCHORS.garden[0], ANCHORS.garden[1] - 4, 4.0,
  ['maple-tree-autumn.png', 'pine-tree-lush.png', 'mossy-rock.png'], 6, 2.1);
// 岩石露头：石头要成"堆"才像地貌。原来 gray-boulder 全图撒 24 个一模一样的，
// 是"复制粘贴感"最重的一处；改成 4 处露头，每处混 3 种石头、大小错开。
let rockN = 0;
for (const [rx, ry, r] of [
  [cx - 8, cy + 9, 2.8], [cx + 9, cy - 1, 2.6],
  [cx - 2, H - 9, 2.4], [cx + 6, cy + 10, 2.6],
]) {
  rockN += cluster(rx, ry, r,
    ['cairn-stones.png', 'mossy-rock.png', 'gray-boulder.png', 'rock-pile-small-midnight.png'], 3, 1.9);
}
tick('成簇布景');

// ---- 7c 分区填充 ----
// 分区池：权重用来控制"同一件重复出现"的量。单件权重过高 + 分区面积大 = 满屏
// 同一个石头（原来 gray-boulder 24 个就是这么来的）。这里每池至少给 4 种选择，
// 且把最"重"的件权重压到 3 以下。
const POOLS = {
  vein: { min: 2.4, density: 0.14, list: [['mossy-rock.png', 3], ['broken-pillar.png', 2], ['rock-pile-small-midnight.png', 2], ['cairn-stones.png', 2]] },
  bamboo: { min: 1.7, density: 0.22, list: [['bamboo-clump-a.png', 4], ['bamboo-clump-b.png', 3], ['bamboo-clump-c.png', 3], ['tall-grass-tuft-midnight.png', 2], ['mushroom-cluster-glowing-blue-midnight.png', 1]] },
  spring: { min: 2.8, density: 0.12, list: [['tall-grass-tuft-midnight.png', 3], ['bamboo-cluster.png', 2], ['rock-pile-small-midnight.png', 2], ['cairn-stones.png', 2], ['maple-tree-autumn.png', 1]] },
  altar: { min: 3.4, density: 0.07, list: [['stone-pillar.png', 3], ['broken-pillar.png', 3], ['mossy-rock.png', 2], ['cairn-stones.png', 2], ['hero-statue-stone.png', 1], ['well-stone.png', 1]] },
  garden: { min: 3.0, density: 0.10, list: [['mossy-rock.png', 3], ['cairn-stones.png', 3], ['maple-tree-autumn.png', 2], ['stone-pillar.png', 2]] },
  coast: { min: 2.5, density: 0.16, list: [['pine-tree-lush.png', 3], ['mossy-rock.png', 3], ['rock-pile-small-midnight.png', 2], ['cairn-stones.png', 2]] },
  lakeside: { min: 2.6, density: 0.11, list: [['mossy-rock.png', 3], ['venus-flytrap.png', 2], ['tall-grass-tuft-midnight.png', 2], ['well-stone.png', 1], ['cairn-stones.png', 2]] },
  grass: { min: 3.6, density: 0.07, list: [['pine-tree-lush.png', 3], ['maple-tree-autumn.png', 2], ['tall-grass-tuft-midnight.png', 3], ['venus-flytrap.png', 1], ['mushroom-cluster-glowing-blue-midnight.png', 1]] },
  gate: { min: 2.8, density: 0.11, list: [['pine-tree-lush.png', 3], ['lantern-paper-red.png', 2], ['cairn-stones.png', 2]] },
};
// 疏密 mask：低频噪声给出每个区域的密度倍率，制造「密林 / 空地」的对比。
// 均匀密度会把整张图摊平成平均的装饰，有疏有密才像地貌。
function densityMul(x, y) {
  const t = nB.get(x * 0.135 + 9, y * 0.135 + 9) * 0.5 + 0.5;   // 0~1
  return 0.30 + 1.35 * Math.pow(t, 1.7);                        // 0.30~1.65，整体偏稀疏
}
function pickWeighted(list) {
  const tot = list.reduce((a, b) => a + b[1], 0);
  let r = ROT.RNG.getUniform() * tot;
  for (const [f, w] of list) { r -= w; if (r <= 0) return f; }
  return list[list.length - 1][0];
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(ROT.RNG.getUniform() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const order = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) order.push([x, y]);
shuffle(order);
for (const [x, y] of order) {
  if (!passable(x, y) || ground[y][x] === CH_PAVE) continue;
  const pool = POOLS[regionOf(x, y)];
  if (!pool) continue;
  if (ROT.RNG.getUniform() > pool.density * densityMul(x, y)) continue;
  const f = pickWeighted(pool.list);
  if (!canPlace(x, y, f, !NON_SOLID.has(f), pool.min)) continue;
  place(f, x, y, { solid: !NON_SOLID.has(f) });
}
tick('分区填充');

// ---- 7d 沿路灯笼 ----
(function lampsAlongPath() {
  const lampFiles = ['lantern-paper-red.png', 'lantern-paper-yellow.png'];
  let k = 0;
  for (const r of routes) {
    for (let i = 3; i < r.length - 2; i += 6) {
      const [px, py] = r[i];
      if (ground[py][px] !== CH_PAVE) continue;
      const [nx, ny] = r[i + 1];
      const dx = nx - px, dy = ny - py;
      const s = (k++ % 2) ? 1 : -1;
      for (const t of [s, -s]) {
        const lx = px - dy * t * 2, ly = py + dx * t * 2;
        if (!passable(lx, ly) || ground[ly][lx] === CH_PAVE) continue;
        const f = lampFiles[k % 2];
        if (canPlace(lx, ly, f, false, 2.0)) { place(f, lx, ly, { solid: false }); break; }
      }
    }
  }
})();

// ---- 7e 岛缘岩环 ----
(function coastRing() {
  for (const [x, y] of shuffle(order.slice())) {
    if (!passable(x, y) || ground[y][x] === CH_PAVE) continue;
    if (distVoid[y][x] > 1) continue;
    if (ROT.RNG.getUniform() > 0.17) continue;
    const f = ROT.RNG.getUniform() < 0.5 ? 'mossy-rock.png' : 'rock-pile-small-midnight.png';
    if (canPlace(x, y, f, true, 2.0)) place(f, x, y, { solid: true });
  }
})();

// ---- 7f 贴花 ----
(function decals() {
  const list = ['deco_034_44x43.png', 'deco_041_28x39.png', 'deco_046_25x23.png',
    'deco_037_42x28.png', 'prop_024_78x58.png'].filter(f => fs.existsSync(path.join(SLICED, f)));
  if (!list.length) return;
  for (const [x, y] of shuffle(order.slice())) {
    if (!passable(x, y) || ground[y][x] === CH_PAVE) continue;
    if (ROT.RNG.getUniform() > 0.045) continue;
    if (occupancy.has(x + ',' + y)) continue;
    objects.push({ piece: list[Math.floor(ROT.RNG.getUniform() * list.length)], x, y, fw: 1, fh: 1, solid: false });
    occupancy.add(x + ',' + y);
  }
})();
tick('沿路灯 + 岩环 + 贴花');

// ---------------------------------------------------------------- 8. 可达性自检
function reachableFrom(from) {
  const blocked = new Set();
  for (const o of objects) {
    if (o.solid === false) continue;
    for (let j = 0; j < (o.fh || 1); j++) for (let i = 0; i < (o.fw || 1); i++) blocked.add((o.x + i) + ',' + (o.y + j));
  }
  const seen = new Set([from[0] + ',' + from[1]]);
  const q = [from];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy, k = xx + ',' + yy;
      if (seen.has(k) || blocked.has(k) || !passable(xx, yy)) continue;
      seen.add(k); q.push([xx, yy]);
    }
  }
  return seen;
}
let reach = reachableFrom(entry);
const cut = [];
for (const [name, p] of [['祭坛', altar], ['灵脉', ANCHORS.vein], ['竹苑', ANCHORS.bamboo],
['温泉', ANCHORS.spring], ['静观', ANCHORS.garden]]) {
  if (reach.has(p[0] + ',' + p[1])) continue;
  const hit = objects.filter(o => o.solid !== false &&
    p[0] >= o.x && p[0] < o.x + (o.fw || 1) && p[1] >= o.y && p[1] < o.y + (o.fh || 1));
  for (const h of hit) { objects.splice(objects.indexOf(h), 1); cut.push(h.piece.replace('scene/', '') + '@' + h.x + ',' + h.y); }
  if (hit.length) reach = reachableFrom(entry);
  if (!reach.has(p[0] + ',' + p[1])) console.log('  ⚠ 自检：' + name + ' (' + p[0] + ',' + p[1] + ') 仍不可达');
}
tick('可达性自检');

// ---------------------------------------------------------------- 9. 输出
const portals = [
  { x: entry[0], y: entry[1], to: 'qingxuan', spawnX: 17, spawnY: 30, label: '青玄山门' },
  { x: ANCHORS.vein[0] + 2, y: ANCHORS.vein[1] - 2, to: 'beilin', spawnX: 15, spawnY: 26, label: '北岚猎场' },
  { x: ANCHORS.garden[0] + 4, y: ANCHORS.garden[1] + 3, to: 'dungeon', spawnX: 14, spawnY: 22, label: '幽冥地宫' },
];
for (const p of portals) {
  if (passable(p.x, p.y) && !occupancy.has(p.x + ',' + p.y)) continue;
  outer:
  for (let r = 1; r < 7; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = p.x + dx, yy = p.y + dy;
      if (passable(xx, yy) && !occupancy.has(xx + ',' + yy)) { p.x = xx; p.y = yy; break outer; }
    }
  }
}
const spawn = { x: entry[0], y: entry[1] - 2 };
if (!passable(spawn.x, spawn.y) || occupancy.has(spawn.x + ',' + spawn.y)) {
  spawn.x = entry[0]; spawn.y = entry[1];
}

const mapObj = {
  id: CFG.id, name: CFG.name, w: W, h: H,
  ground: ground.map(r => r.join('')),
  objects,
  portals,
  spawn,
  // ⚠ 不要加 noSideWall。它的作用是"整幅图没有虚空、边缘退回原始瓦只会露底座"，
  //   本图有虚空，正是要靠引擎的侧壁逻辑给岛做出厚度（和青玄山门等四张图一致）。
  //   曾经为了掩盖"水面/纯色顶面瓦不配套"用过它，结果是岛变成一张没有厚度的纸片。
  note: '灵气汇聚的谷地秘境：中轴石堤贯穿灵湖、湖心祭坛，东竹苑、西南温泉、北灵脉晶簇、东南静观石庭，南谷口通山门',
  npcs: [
    { x: entry[0] + 4, y: entry[1] - 3, char: 'npc_5', name: '守谷弟子', face: 'down', line: '沿石堤走过去就是湖心祭坛。那碑上的符别乱碰——上回有人拔了一张，躺了半个月。' },
    { x: ANCHORS.bamboo[0] - 6, y: ANCHORS.bamboo[1] + 3, char: 'npc_14', name: '采药人阿青', face: 'left', line: '这片竹子的笋能入药。北边晶簇那儿长得更肥，就是……那边的东西不好惹。' },
  ],
};

const landN = land.flat().filter(Boolean).length;
console.log('岛形: ' + landN + '/' + (W * H) + ' 格为陆地 (' + (landN / (W * H) * 100).toFixed(0) + '%)');
console.log('水面: ' + water.flat().filter(Boolean).length + ' 格   路面: ' + paveN + ' 格   物件: ' + objects.length + ' 个');
console.log('簇: 灵脉 ' + veinN + ' / 竹苑 ' + bambooN + ' / 岩石露头 ' + rockN);
console.log('自检: 入口(' + entry[0] + ',' + entry[1] + ') 可达 ' + reach.size + ' 格' + (cut.length ? ('  剔除挡路物件 ' + cut.length + ' 个') : ''));
console.log();
for (const row of ground) console.log(row.map(c => (c === CH_VOID ? '·' : c)).join(''));
console.log();

if (process.argv.includes('--dry')) { console.log('(--dry 未写入)'); return; }

const mj = JSON.parse(fs.readFileSync(MAPS_PATH, 'utf8'));
const i = mj.maps.findIndex(m => m.id === CFG.id);
// ⚠ groundTop 是 build_ground_tops.py 单独写进去的，不在本脚本的产出里。
//   直接整体替换地图对象会把它冲掉 —— 表现是地面全部退回"带侧壁的原始瓦"，
//   水面变成一格一个带底座的方块。所以替换前先把它接过来。
const keepTop = i >= 0 ? mj.maps[i].groundTop : null;
if (keepTop) mapObj.groundTop = keepTop;
if (i >= 0) mj.maps[i] = mapObj; else mj.maps.push(mapObj);
fs.writeFileSync(MAPS_PATH, JSON.stringify(mj), 'utf8');
console.log('已写入 maps.json 的 ' + CFG.id + '（' + objects.length + ' 物件'
  + (keepTop ? '，沿用原 groundTop' : '') + '）');
