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

function readPage(query) {
  const out = path.join(os.tmpdir(), 'wb_dom_' + query.replace(/[^a-z0-9]+/gi, '_') + '.html');
  execSync(
    `"${CHROME}" --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files ` +
    `--virtual-time-budget=9000 --window-size=1280,800 --dump-dom "${GAME}?${query}" > "${out}" 2>nul`,
    { shell: 'cmd.exe' }
  );
  const dom = fs.readFileSync(out, 'utf8');
  const pick = (id) => {
    const m = dom.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
    return m ? m[1] : null;
  };
  return { dom, dbg: pick('dbg'), probe: pick('probe'), mapName: pick('mapName'), loader: pick('loader') };
}

function run(label, query, expect) {
  const r = readPage(query);
  let dbg = null;
  try { dbg = r.dbg ? JSON.parse(r.dbg) : null; } catch (e) { /* ignore */ }
  let probe = null;
  try { probe = r.probe ? JSON.parse(r.probe) : null; } catch (e) { /* ignore */ }
  const verdict = expect ? expect({ dbg, probe, mapName: r.mapName }) : null;
  console.log(
    (verdict === null ? '  ' : verdict ? 'PASS ' : 'FAIL ') +
    label.padEnd(28) +
    ' map=' + String(r.mapName).padEnd(10) +
    ' dbg=' + (r.dbg || '-').slice(0, 96)
  );
  if (probe) console.log('      probe=' + JSON.stringify(probe));
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

const failed = results.filter((r) => r.ok === false).length;
console.log('\n' + (failed ? failed + ' 个用例失败' : '全部通过 (' + results.length + ' 个用例)'));
process.exit(failed ? 1 : 0);
