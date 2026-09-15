// 无头自测跑批：给一组 query string，逐个用 headless Chrome 打开本地游戏页，
// 从 DOM 里读回 #dbg / #probe 的状态，直接断言引擎行为。
//
// 用法（本机）：
//   node test/tools/headless_check.js
//
// 为什么需要它：这台机器读不了图片像素（Read 图片会被过滤），而 --virtual-time-budget
// 下 rAF 的 dt 常常接近 0，过渡动画会假死在半途。所以页面里统一用 ISLES.tick(1/60)
// 固定步长推进（见 game.js 的 sim()），本脚本只负责发起与读回。

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const GAME = 'file:///C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test/index.html';
// 用户数据目录：本次运行独占一个（按 pid 命名），不要跟正在跑的普通 Chrome 抢 Default 配置
// （singleton 锁会让 headless 直接报错退出）。但也不要「每个用例都新建」——
// 冷 profile 的首次启动开销在这台弱机上经常顶满 virtual-time-budget，页面停在「加载中」，
// 表现成随机几条用例 dbg=-。一次运行共用一个热 profile 最稳，跑完删掉。
const U_DIR = path.join(os.tmpdir(), 'wb_headless_' + process.pid);

function readPage(query, budget, size) {
  // 输出文件每次都用唯一名：同名重定向会被「另一个程序正在使用此文件」的偶发占用炸掉整个跑批
  const out = path.join(os.tmpdir(), 'wb_dom_' + process.pid + '_' + Date.now() + '_' +
    Math.floor(Math.random() * 1e6) + '.html');
  // 顺手掐掉磁盘缓存：素材/JSON 改过之后旧缓存会让页面加载到上一版数据，
  // 症状是「代码明明改了、自测还是老结果」——这类假失败比真 bug 更耗时间。
  // execSync 偶发失败（profile 锁/临时文件占用）不要炸跑批：返回空，交给 run() 的重试逻辑。
  try {
    execSync(
      `"${CHROME}" --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files ` +
      `--no-first-run --no-default-browser-check --disk-cache-size=1 --hide-scrollbars ` +
      `--user-data-dir="${U_DIR}" --virtual-time-budget=${budget || 14000} ` +
      `--window-size=${size || '1280,800'} --dump-dom "${GAME}?${query}" > "${out}" 2>nul`,
      { shell: 'cmd.exe' }
    );
  } catch (e) {
    return { dom: '', bodyClass: '', dbg: null, probe: null, mapName: null, loader: null };
  }
  const dom = fs.readFileSync(out, 'utf8');
  const pick = (id) => {
    const m = dom.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
    return m ? m[1] : null;
  };
  const bodyClass = (dom.match(/<body[^>]*class="([^"]*)"/) || [, ''])[1];
  return { dom, bodyClass, dbg: pick('dbg'), probe: pick('probe'), mapName: pick('mapName'), loader: pick('loader') };
}

function run(label, query, expect, opts) {
  opts = opts || {};
  // 页面压根没加载出来（map 还停在「加载中」、dbg/probe 都是空）不是断言失败，
  // 是 headless 冷启动没跑完。这种假失败重试，别把结论污染成「回归挂了」。
  let r = readPage(query, opts.budget, opts.size), tries = 1;
  // 弱机上偶发：上一个 Chrome 还没释放 profile 锁，下一个起来就立刻退出（整页空白）。
  // 退避重试；重试之间等一下，连着起太快会继续撞锁。重试时 virtual-time-budget 逐次
  // 翻倍——机器忙起来 14s 也可能不够页面加载完，死守同一个预算会重试 3 次全撞墙。
  let budget = opts.budget;
  while (!r.dbg && !r.probe && tries < 4) {
    execSync('ping -n 2 127.0.0.1 >nul', { shell: 'cmd.exe' });   // 约 1 秒，且不依赖 sleep
    budget = (budget || 14000) * 1.6;
    r = readPage(query, budget, opts.size); tries++;
  }
  let dbg = null;
  try { dbg = r.dbg ? JSON.parse(r.dbg) : null; } catch (e) { /* ignore */ }
  let probe = null;
  try { probe = r.probe ? JSON.parse(r.probe) : null; } catch (e) { /* ignore */ }
  const verdict = expect ? expect({ dbg, probe, mapName: r.mapName, bodyClass: r.bodyClass }) : null;
  console.log(
    (verdict === null ? '  ' : verdict ? 'PASS ' : 'FAIL ') +
    label.padEnd(28) +
    ' map=' + String(r.mapName).padEnd(10) +
    (tries > 1 ? '(重试' + (tries - 1) + ') ' : '') +
    ' dbg=' + (r.dbg || '-').slice(0, 96)
  );
  if (probe) console.log('      probe=' + JSON.stringify(probe));
  else if (!dbg) console.log('      （页面没加载完：loader="' + String(r.loader).slice(0, 20) + '" 文件名=' + r.mapName + '）');
  return { ok: verdict, dbg, probe };
}

// ---------------- 用例 ----------------
const results = [];
const DIRS = ['down', 'left', 'right', 'up'];

// 1) ★ 本次修的 bug：点击移动必须按行进方向转身（原来永远停在初始的 down）
[
  ['right', 'cdx=3&cdy=0'],
  ['left', 'cdx=-3&cdy=0'],
  ['down', 'cdx=0&cdy=3'],
  ['up', 'cdx=0&cdy=-3'],
].forEach(([want, q]) => {
  results.push(run('点击转身 ' + want, 'autotest=click&' + q, ({ probe }) =>
    !!probe && probe.targetAccepted && probe.faceAfter === want && probe.reached));
});

// 2) 长距离点击：BFS 绕路后必须能走到，且全程不落到非法格
results.push(run('点击 8 格直线', 'autotest=click&cdx=8&cdy=0&secs=4', ({ probe }) =>
  !!probe && probe.cellOk && probe.reached && probe.faceAfter === 'right'));
results.push(run('点击 长斜向 (8,8)', 'autotest=click&cdx=-8&cdy=-8&secs=8', ({ probe }) =>
  !!probe && probe.cellOk && probe.reached && DIRS.indexOf(probe.faceAfter) >= 0));
results.push(run('点击 回走 (6,-6)', 'autotest=click&cdx=-6&cdy=-6&secs=8', ({ probe }) =>
  !!probe && probe.cellOk && probe.reached && DIRS.indexOf(probe.faceAfter) >= 0));

// 3) 点击虚空/水面应被拒绝（不会让角色朝墙撞过去）
results.push(run('点击 不可达格 拒绝', 'autotest=click&cdx=40&cdy=40', ({ probe }) =>
  !!probe && probe.targetAccepted === false));

// 4) 键盘对照：按住右键移动且朝向 right；松手后不得被残差翻成 left
results.push(run('键盘 d 对照', 'autotest=walk', ({ dbg }) =>
  !!dbg && dbg.face === 'right' && dbg.mx > 17));

// 5) 传送阵双向
results.push(run('传送 青玄→灵泉', 'map=qingxuan&autotest=portal', ({ dbg }) =>
  !!dbg && dbg.map === 'lingquan' && dbg.fade === 0));
results.push(run('传送 碑林→青玄', 'map=beilin&autotest=portal', ({ dbg }) =>
  !!dbg && dbg.map === 'qingxuan' && dbg.fade === 0));

// 6) NPC 绘制分支可达
results.push(run('NPC 渲染计数', 'autotest=walk', ({ dbg }) => !!dbg && dbg.npcs > 0));

// 7) 碑林石阵刷怪（就地取材的打怪场）
results.push(run('碑林 刷怪', 'map=beilin', ({ dbg }) => !!dbg && dbg.foes > 0));

// 8) 战斗：贴脸反复攻击应击杀并掉落灵石 / 修为增长
results.push(run('战斗 击杀掉落', 'map=beilin&autotest=fight', ({ probe }) =>
  !!probe && probe.exp > 0 && probe.stones > 0));

// 8.5) 战斗手感：① 攻击动画必须能完整播完（冷却 ≥ 动作时长，旧版 0.45 < 0.65 会截断在第四帧）
//      ② 伤害不再恒定（有浮动/暴击/连击）③ 背对目标砍不中、挥空自动转身。
//      50 刀逐帧推进，预算要给足。
results.push(run('战斗 手感三件套', 'map=qingxuan&autotest=combat', ({ probe }) =>
  !!probe && probe.animComplete === true          // 动画播完
  && probe.dmgKinds > 3                            // 伤害值有多种，不是恒定值
  && probe.comboPeak >= 2                          // 连击能叠
  && probe.crits >= 1                              // 出过暴击（50 刀 ×10%，缺一次即真异常）
  && probe.backDmg === 0                           // 背对砍不中
  && probe.faceAfterBack === 'down'                // 挥空自动转向目标
  && probe.dmgMax > probe.dmgMin, { budget: 22000 }
));

// 8.6) 技能盘：三个技能（御剑诀/雷罡咒/太虚剑域）各自要能命中掉血、冷却期间放不出来、
//      冷却清零后能再放，且每次释放都产生一个特效对象。
results.push(run('技能 三招与冷却', 'map=qingxuan&autotest=skill', ({ probe }) => {
  if (!probe || !probe.skills || probe.skills.length !== 3) return false;
  return probe.skills.every((s) => s.cast === true && s.dmg > 0 && s.blocked === true
    && s.recast === true && s.dmg2 > 0 && s.fx >= 1 && s.cd > 0);
}, { budget: 20000 }
));
//    外加领地（leash）验收 —— 越界不许咬人、必须回巢、回巢后还能被重新拉起。
//    这条 sim 的时长以「秒」计（20s + 14s），预算要给足。
//    ⚠ 本机实测这条要 46s 才跑完：预算给 30000 会随机读到「dbg 有、probe 没有」，
//      表现成假 FAIL（而重试逻辑只在 dbg/probe 都空时才触发，救不到它）。给 60s。
results.push(run('灵泉 妖兽领地', 'map=lingquan&autotest=bestiary', ({ probe }) =>
  !!probe && probe.total === 9 && Array.isArray(probe.err) && probe.err.length === 0 &&
  probe.zombieHit === true && probe.knightHit === true &&
  !!probe.leash && probe.leash.attackedWhileLeashed === false &&
  probe.leash.returnedHome === true && probe.leash.retCleared === true &&
  probe.leash.reengaged === true,
{ budget: 60000 }));

// 9.5) 外来地图（tools/import_tmx.py 从别人的 Tiled 工程转进来的）接入验收。
//      这类图的故障全是**静默**的：不能走但画得好好的、出生点在水里、复合瓦露黑缺口 ——
//      人眼扫一眼截图看不出是"没配好"还是"地图本来长这样"。这条把三件事都量化了。
//      断言口径刻意不写死坐标（换一张外来图只要重新生成即可），只锁性质：
//      有可走区、有内容、出生点确实站得住、能点着走过去。
results.push(run('外来地图 远航之岸', 'map=flare_arrival&autotest=importmap', ({ probe }) =>
  !!probe && probe.map === 'flare_arrival' &&
  probe.w === 36 && probe.h === 38 &&
  probe.walk > 400 && probe.obj > 1000 &&
  probe.spawnOnWalkable === true && probe.atSpawn === true &&
  probe.targetFound === true && probe.clickAccepted === true &&
  probe.reached === true && probe.moved === true,
{ budget: 22000 }));

// 9.6) 第二张外来图。两张**共用同一套图集**（导入器 --append 把瓦并进同一个目录）。
//      追加导入最容易出的错是「后导入的瓦静默覆盖先导入的瓦」——图集照样加载、不报错，
//      但前一张图整片错乱。所以这一条必须和上一条**同时**通过，才算图集没串。
results.push(run('外来地图 殒落港湾', 'map=flare_harbor&autotest=importmap', ({ probe }) =>
  !!probe && probe.map === 'flare_harbor' &&
  probe.w === 39 && probe.h === 38 &&
  probe.walk > 300 && probe.obj > 1000 &&
  probe.spawnOnWalkable === true && probe.atSpawn === true &&
  probe.targetFound === true && probe.clickAccepted === true &&
  probe.reached === true && probe.moved === true,
{ budget: 22000 }));

// 9.65) ★「看着是路却走不动」验收（外来图的隐形杀手）。
//      Flare 原作里挡路的是 collision 层，object 层只是美术（桥/斜坡/矮草本该走上去）；
//      旧导入器把 object 层一律判 solid，桥下的水面格又没有 collision 标记 ——
//      结果是桥面被整段判死，港湾两块陆地被切成互不相通的几块。
//      这条锁死性质：可走格必须**全域连通**，isolated 必须为 0；
//      并且真的从出生点走到最远那一格（跨桥）验证寻路成立。
//      不写死坐标/格数，换图重导即可复用。
[['flare_harbor', '外来地图 港湾跨桥连通', 20], ['flare_arrival', '外来地图 彼岸全域连通', 20]]
  .forEach(([m, label, budget]) => {
    results.push(run(label, 'map=' + m + '&autotest=crossing', ({ probe }) =>
      !!probe && probe.map === m &&
      probe.walk > 300 && probe.reach === probe.walk && probe.isolated === 0 &&
      probe.farDist > 10 && probe.clickAccepted === true && probe.arrived === true,
    { budget: budget * 1000 }));
  });

// 9.66) 右上角场景缩略图。
//      ① 青玄：四类格（可走/挡路/水/虚空）都齐 —— 把「底图四种颜色都画得出来」验全；
//      ② 港湾（39×38，非正方）：画布宽高比必须等于地图宽高比，否则后面所有标记都会偏。
//      两条都验：底图像素真画上去了（不是空画布）、主角标记在画布内、折叠能来回切、
//      且**点缩略图能真的走过去**（与画布点击同一条寻路入口）。
results.push(run('右上角 缩略图 四类格', 'map=qingxuan&autotest=minimap', ({ probe }) =>
  !!probe && probe.cv === true &&
  probe.cells.walk > 300 && probe.cells.block > 0 &&
  probe.cells.water > 0 && probe.cells.void > 0 &&
  probe.solidPx > 2000 && probe.markInCanvas === true &&
  probe.inViewport === true && probe.overlapsPanel === false &&
  probe.notUpscaled === true &&
  probe.foldedAfter === true && probe.unfoldedAfter === false &&
  probe.clickAccepted === true && probe.clickMoved === true,
{ budget: 22000 }));

results.push(run('右上角 缩略图 非正方图', 'map=flare_harbor&autotest=minimap', ({ probe }) =>
  !!probe && probe.cv === true &&
  Math.abs(probe.ratio) < 0.01 &&                    // 画布宽高比 == 地图宽高比（39:38）
  probe.cellPx > 2 && probe.cellPx < 8 &&            // 长边 168px 上限下的每格像素
  probe.cells.walk > 300 && probe.solidPx > 2000 &&
  probe.markInCanvas === true &&
  probe.inViewport === true && probe.overlapsPanel === false &&
  probe.notUpscaled === true &&
  probe.clickAccepted === true && probe.clickMoved === true,
{ budget: 22000 }));

// 9.67) 缩略图在手机横屏（844×390）下的行为：**默认收起**（那块屏本来就不够放），
//      强制展开后必须仍在视口内、不压住地图速切面板、画布不被 CSS 放大（1 像素 1 格放大就会糊），
//      且点缩略图仍然能走过去。`?mm=1` 是给无头截图/自测用的强制展开开关。
results.push(run('右上角 缩略图 手机横屏', 'map=lingquan&touch=1&mm=1&autotest=minimap', ({ probe }) =>
  !!probe && probe.cv === true &&
  probe.viewport[0] === 844 && probe.viewport[1] === 390 &&
  probe.notUpscaled === true &&
  probe.cssBox[1] < probe.size[1] &&              // 34vh 上限确实压到了显示尺寸
  probe.inViewport === true && probe.overlapsPanel === false &&
  probe.markInCanvas === true &&
  probe.foldedAfter === true && probe.unfoldedAfter === false &&
  probe.clickAccepted === true && probe.clickMoved === true,
{ size: '870,546', budget: 22000 }));

//      同一台手机**不**给 `?mm=` 时必须默认收起（用户要的是"能收起来"，手机上默认就该是收着的）
results.push(run('右上角 缩略图 手机默认收起', 'map=lingquan&touch=1&autotest=minimap', ({ probe }) =>
  !!probe && probe.cv === true && probe.foldedAtStart === true,
{ size: '870,546', budget: 22000 }));

// 9.7) 首屏体积：地宫（547KB）与外来图（940KB）都**不在首屏**——它们只在该图要被用到时
//      才载（?map= 指到它 / 用户点按钮 / 后台空闲预取）。这条把「首屏到底背了多少」钉住：
//      一旦有人把大图集挪回 LOAD_PLAN，这里立刻红。这种回归的体感是"开屏越来越慢"，
//      没人会去翻代码，只能靠数字。
//      自带图首屏 = maps.json 65 + 主图集 1091 + 几个 JSON 29 ≈ 1185KB。
results.push(run('首屏体积 不含大图集', 'map=qingxuan&autotest=bootstats&preload=0', ({ probe }) =>
  !!probe && probe.map === 'qingxuan' &&
  probe.total > 1000 && probe.total < 1400 &&
  probe.extras && probe.extras.dungeon.loaded === false && probe.extras.flare.loaded === false,
{ budget: 20000 }));

//      反过来：?map= 直接指到那张图时，它**必须**算进首屏 —— 否则进图那一刻才开始下载，
//      玩家看到的是"进去了但一片空白"。
results.push(run('首屏含目标图图集', 'map=dungeon&autotest=bootstats&preload=0', ({ probe }) =>
  !!probe && probe.map === 'dungeon' &&
  probe.total > 1600 && probe.extras.dungeon.loaded === true,
{ budget: 26000 }));

// 9.8) 运行时按需补载：首屏只载自带图，然后模拟用户点地图按钮切过去 ——
//      图集与地形要当场补上、玩家落在可走格上、载入提示要收掉。
//      这条覆盖最容易漏的路径：?map= 没指到它，goTo 的补载分支才第一次被执行。
results.push(run('按需切图 外来图', 'map=qingxuan&autotest=lazygoto&preload=0&goto=flare_arrival', ({ probe }) =>
  !!probe && probe.map === 'flare_arrival' && probe.before === false &&
  probe.obj > 1000 && probe.atlas === true &&
  probe.spawnOnWalkable === true && probe.atSpawn === true && probe.tipGone === true,
{ budget: 30000 }));

results.push(run('按需切图 地宫', 'map=qingxuan&autotest=lazygoto&preload=0&goto=dungeon', ({ probe }) =>
  !!probe && probe.map === 'dungeon' && probe.before === false &&
  probe.obj > 100 && probe.atlas === true &&
  probe.spawnOnWalkable === true && probe.atSpawn === true && probe.tipGone === true,
{ budget: 30000 }));

// 10) 手机端 UI：桌面 Chrome 里 pointer:coarse 恒假，这套分支平时根本跑不到，
//     而它坏起来全是「点了没反应」——电脑上盯多久都看不出来。用 ?touch=1 强制打开验：
//     三条命中测试（elementFromPoint）确认点击真的落在元素上、没有被 .hud 的
//     pointer-events:none 吃掉，也没被加载遮罩挡着。
results.push(run('桌面端 不误判触屏', 'map=lingquan&touch=0', ({ bodyClass }) =>
  bodyClass.indexOf('touch') < 0));
results.push(run('手机横屏 UI', 'map=lingquan&touch=1&autotest=mobileui', ({ bodyClass, probe }) =>
  bodyClass === 'touch' && !!probe && probe.loaderHidden === true &&
  probe.bottomPE === 'auto' && probe.bottomHit === true &&
  probe.bottomDismissed === true && probe.bottomRestored === true &&
  probe.foldedInit === true && probe.zoombarHidden === true && probe.headHit === true &&
  probe.foldedAfterClick === false && probe.herobarShown === true &&
  probe.rotateShown === false,
{ size: '844,390', budget: 22000 }));
// 注意：竖屏这条不能拿 DOM 里的 body.class 断言 —— 自测自己会点「竖屏也能玩」把浮层关掉，
// dump 到的时候 show-rotate 早就没了。要读自测**开跑时**记下的快照 probe.bodyClass。
results.push(run('手机竖屏 横屏提醒', 'map=lingquan&touch=1&autotest=mobileui', ({ probe }) =>
  !!probe && probe.bodyClass === 'touch show-rotate' && probe.loaderHidden === true &&
  probe.rotateShown === true && probe.hintHit === true && probe.okHit === true &&
  probe.rotateDismissed === true && probe.headHit === 'skipped-overlay',
{ size: '390,844', budget: 22000 }));

const failed = results.filter((r) => r.ok === false).length;
console.log('\n' + (failed ? failed + ' 个用例失败' : '全部通过 (' + results.length + ' 个用例)'));
try { fs.rmSync(U_DIR, { recursive: true, force: true }); } catch (e) { /* 目录偶尔被占用，留着不影响结果 */ }
process.exit(failed ? 1 : 0);
