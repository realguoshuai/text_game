// 无头自测跑批：给一组 query string，逐个用 headless Chrome 打开本地游戏页，
// 从 DOM 里读回 #dbg / #probe 的状态，直接断言引擎行为。
//
// 用法（本机）：
//   node games/immortal-isles/tools/headless_check.js
//
// 为什么需要它：这台机器读不了图片像素（Read 图片会被过滤），而 --virtual-time-budget
// 下 rAF 的 dt 常常接近 0，过渡动画会假死在半途。所以页面里统一用 ISLES.tick(1/60)
// 固定步长推进（见 game.js 的 sim()），本脚本只负责发起与读回。

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const GAME = 'file:///C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/games/immortal-isles/index.html';
// 命令行可选过滤：node headless_check.js "外来图" 只跑 label 含「外来图」的用例，
// 方便单独复验某一类（尤其弱机/磁盘满时不想把 33 条全跑一遍）。空 = 全跑。
const FILTER = process.argv[2] || '';
// 用户数据目录：本次运行独占一个（按 pid 命名），不要跟正在跑的普通 Chrome 抢 Default 配置
// （singleton 锁会让 headless 直接报错退出）。但也不要「每个用例都新建」——
// 冷 profile 的首次启动开销在这台弱机上经常顶满 virtual-time-budget，页面停在「加载中」，
// 表现成随机几条用例 dbg=-。一次运行共用一个热 profile 最稳，跑完删掉。
const TEMP = os.tmpdir();
// 本次运行累计清掉的 scoped_dir 个数，收尾时打印 —— 让「清理有没有生效」变成可观测的。
let freed = 0;
// 本轮删不掉的个数（chrome 被强杀后目录句柄短暂占用）。stuck>0 说明该手动跑一次
// .workbuddy/clean_chrome_tmp.js 兜底，但绝不会再出现「悄悄堆到 17GB」。
let stuck = 0;
const U_DIR_BASE = path.join(os.tmpdir(), 'wb_headless_' + process.pid);
// 兜扫保护的"自己人"前缀（不带路径）。见 sweepAllJunk 里的说明。
const U_DIR_BASE_NAME = 'wb_headless_' + process.pid;

// ---------------- 全局统计 / 磁盘快照 ----------------
// 为什么要有这些：2026-09-17 排查「C 盘被写满」时发现，跑批只报「用例 PASS 几条」，
// 没人看它留下了多少垃圾、磁盘涨了多少 —— 没有观测就没有预警，等发现时已经堆了 17GB。
// 所以三个数必须每轮报出来：清理个数(freed/stuck)、Temp 大小、C 盘可用。
const RUN = {
  done: 0,          // 已完成的用例数（用于卡死熔断）
  retries: 0,       // 累计重试次数
  startMs: Date.now(),
  tempBeforeMB: -1, // 跑批开始时 TEMP 占用
  freeBeforeGB: -1, // 跑批开始时 C 盘可用
  aborted: false,   // 触发熔断
};

// ⚠ 单位诚实：本函数返回**字节**。之前叫 dirMB 却返回字节，
//   调用方按 MB 直接格式化 → Temp 显示成 982170 GB。命名错一个单位就会骗过所有人。
const dirBytes = (p) => {
  let t = 0;
  let ents;
  try { ents = fs.readdirSync(p, { withFileTypes: true }); } catch (e) { return 0; }
  for (const e of ents) {
    const fp = path.join(p, e.name);
    try {
      // lstat：不跟符号链接（跟随可能绕进循环，把统计量算成天文数字）
      const st = fs.lstatSync(fp);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) t += dirBytes(fp);
      else t += st.size;
    } catch (x) { /* 被占用/已删，跳过 */ }
  }
  return t;
};
const dirMB = (p) => Math.round(dirBytes(p) / 1048576);
const diskFreeMB = () => {
  try { const s = fs.statfsSync('C:////'); return Math.round(s.bavail * s.bsize / 1048576); }
  catch (e) { return -1; }
};
const fmtMB = (mb) => (mb < 0 ? 'n/a' : mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb + ' MB');

function readPage(query, budget, size) {
  // ★ 每条用例用唯一 user-data-dir：否则所有用例抢同一个目录的单例锁，
  // 前面用例的 chrome 助手进程没退干净时，后面的 chrome 会卡在锁上（整页空白/无限挂起）。
  // 这是之前「套件跑到第 28 条就卡死」的真因，与游戏改动无关。
  const uDir = U_DIR_BASE + '_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  // 输出文件每次都用唯一名：同名重定向会被「另一个程序正在使用此文件」的偶发占用炸掉整个跑批
  const out = path.join(os.tmpdir(), 'wb_dom_' + process.pid + '_' + Date.now() + '_' +
    Math.floor(Math.random() * 1e6) + '.html');
  // 顺手掐掉磁盘缓存：素材/JSON 改过之后旧缓存会让页面加载到上一版数据，
  // 症状是「代码明明改了、自测还是老结果」——这类假失败比真 bug 更耗时间。
  // execSync 偶发失败（profile 锁/临时文件占用）不要炸跑批：返回空，交给 run() 的重试逻辑。
  // ★ 加硬超时（killSignal SIGKILL）：否则某个用例的 chrome 一旦卡死（页面不退出、
  //   磁盘写不动、--no-zygote 偶发卡住），execSync 会无限阻塞，整条跑批卡死在半途。
  //   超时后 chrome 被强杀，这里返回空 → run() 走重试；重试也超时就是真 FAIL，不再挂起。
  // ★ Chrome 还会在系统 TEMP 下另建 scoped_dir*（~40MB/个），--user-data-dir 管不到它，
  //   进程被 SIGKILL 时更不会自清 —— 实测一轮 39 条跑批能堆 435 个 / 17GB，直接把 C 盘写满。
  //   所以这里按「本次调用新增的」做差集清理：只删这次 chrome 自己建的那几个，
  //   不碰别的 Chrome（含 WorkBuddy 预览）正在用的目录。
  const isJunk = (n) => /^scoped_dir/.test(n) || /^wb_headless_/.test(n) || /^HeadlessChrome/.test(n);
  // ★★ 判据演进（2026-09-17，三轮实测踩出来的）★★
  // 最初用「本次新增」差集：只删这次 chrome 自己建的，绝不碰别人的。
  //   实测漏洞：chrome 被强杀 → 残壳留到下次跑批 → 下次跑批把它拍进 before 快照 →
  //   从此被当成"别人正在用"，**永远清不掉**。这正是堆积到 17GB 的原始路径。
  // 第二版加「年龄 > STALE_MIN 分钟」兜底：能清老孤儿，但"刚强杀的残壳"（1 分钟前）
  //   照样漏 —— 而强杀恰恰是最常见的产生方式。
  // 第三版（当前）改用**进程探活**：目录名里带 pid 的（scoped_dir<PID>_xxx）直接
  //   process.kill(pid,0) 问一句"那货还活着吗"。死了 = 纯垃圾，立刻清，不看年龄也不看快照。
  //   这是唯一能精确区分「孤儿」与「别人在用」的办法 —— 不用猜。
  // 探不了 pid 的（HeadlessChrome<时间戳>）退回「尝试删 + 删失败即视为占用」：
  //   Windows 上被独占的目录删不掉，删的成功与否本身就是探活结果。
  const pidAlive = (pid) => {
    if (!pid || !Number.isFinite(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
  };
  // 从目录名抽 chrome pid：scoped_dir36796_xxx → 36796。抽不到返回 0（走删除探测）。
  const junkPid = (n) => {
    const m = n.match(/^scoped_dir(\d+)_/);
    return m ? Number(m[1]) : 0;
  };
  // 孤儿 = 目录名带 pid 且那个 pid 已经死了。这类无条件清，与快照/年龄无关。
  const orphans = new Set(
    fs.readdirSync(TEMP).filter((n) => isJunk(n) && junkPid(n) && !pidAlive(junkPid(n)))
  );
  // 老残渣兜底：无 pid 可探的同类目录，靠年龄（> STALE_MIN 分钟）判为遗留物。
  const STALE_MIN = 60;
  const staleBefore = new Set(
    fs.readdirSync(TEMP).filter((n) => {
      if (!isJunk(n) || junkPid(n)) return false; // 带 pid 的走探活，不走年龄
      try { return Date.now() - fs.statSync(path.join(TEMP, n)).mtimeMs > STALE_MIN * 60000; }
      catch (e) { return false; }
    })
  );
  const before = new Set(fs.readdirSync(TEMP).filter(isJunk));
  let dom = '';
  try {
    execSync(
      `"${CHROME}" --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files ` +
      `--no-first-run --no-default-browser-check --disk-cache-size=1 --hide-scrollbars ` +
      `--no-zygote ` +
      `--user-data-dir="${uDir}" --virtual-time-budget=${budget || 14000} ` +
      `--window-size=${size || '1280,800'} --dump-dom "${GAME}?${query}" > "${out}" 2>nul`,
      { shell: 'cmd.exe', timeout: 90000, killSignal: 'SIGKILL' }
    );
    dom = fs.readFileSync(out, 'utf8');
  } catch (e) {
    dom = '';
  } finally {
    // 用完即清：无论成功/超时/出错，profile 目录（~30MB）和 DOM 输出文件当场删掉。
    // 否则 33 条跑完临时盘被塞满（本机 C 盘常年 95%+ 占用），后面用例会因
    // chrome 写不了 profile 而「页面没加载完」假失败；超时强杀时更会漏清，必须兜底。
    try { fs.rmSync(uDir, { recursive: true, force: true }); } catch (e) { /* 偶被占用 */ }
    try { fs.rmSync(out, { force: true }); } catch (e) { /* ignore */ }
    // 清本次 chrome 新建的 scoped_dir*（只删差集，别的进程在用的一概不碰）。
    // 第一遍删不掉（chrome 刚被 SIGKILL、目录句柄还没释放）时退避重试一轮，
    // 仍失败则记 stuck —— 以前这种「半删残壳」被静默吞掉，下次跑批就变成前人的垃圾。
    try {
      // 三个来源合并：本次新建（差集）∪ 已死掉的孤儿（探活）∪ 无 pid 的老残渣（年龄）。
      // 无 pid 且年轻、又在 before 里的（如刚强杀留下的 HeadlessChrome*）不在这三类里 ——
      // 交给「末轮兜扫」（sweepAllJunk，跑批收尾时调用）处理。
      const mineNow = () => fs.readdirSync(TEMP).filter((n) =>
        isJunk(n) && (!before.has(n) || orphans.has(n) || staleBefore.has(n)));
      const sweep = () => {
        for (const n of mineNow()) {
          // 二次保护：万一 pid 被系统回收、新进程恰好占用了这个号，探活会误判"活着"。
          // 所以删之前再问一次 —— 探活说还活着就跳过，宁可漏清也不误删别人正在用的。
          const p = junkPid(n);
          if (p && before.has(n) && pidAlive(p)) continue;
          for (let k = 0; k < 3; k++) {
            // ⚠ 不靠"抛出与否"判断成功：Windows 上 rmSync 删被独占占用的文件时可能**不抛异常**
            //   却把删不掉的留下（force:true 吞部分错误）→ 目录成半删残壳、报告还说清理成功。
            //   所以删完必须**复核**：目录还在就是没删干净。这是"假成功"的唯一识别方法。
            try { fs.rmSync(path.join(TEMP, n), { recursive: true, force: true, maxRetries: 1 }); } catch (e) { /* 留给复核判定 */ }
            if (!fs.existsSync(path.join(TEMP, n))) { freed++; break; }
            if (k === 2) {
              stuck++;
              console.log('  ⚠ 清不掉（可能被占用，下次跑批会重试）: ' + n);
            }
          }
        }
      };
      sweep();
      if (mineNow().length) { execSync('ping -n 2 127.0.0.1 >nul', { shell: 'cmd.exe' }); sweep(); }
    } catch (e) { /* 读不了 TEMP 就算了 */ }
  }
  if (!dom) return { dom: '', bodyClass: '', dbg: null, probe: null, mapName: null, loader: null };
  const pick = (id) => {
    const m = dom.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
    return m ? m[1] : null;
  };
  const bodyClass = (dom.match(/<body[^>]*class="([^"]*)"/) || [, ''])[1];
  return { dom, bodyClass, dbg: pick('dbg'), probe: pick('probe'), mapName: pick('mapName'), loader: pick('loader') };
}

// 熔断阈值：这台机器慢，但「慢」和「卡死」要能区分开。
// 判据不是「总耗时」（39 条正常就要几十分钟），而是**连续重试次数** ——
// 连续 5 次重试用尽说明页面根本起不来，继续磨只会：越卡越慢 → 重试越多 →
// scoped_dir 垃圾越多 → 磁盘越满 → 更卡（2026-09-17 那个「运行 14 小时」的僵尸任务就是这么来的）。
const MAX_CONSEC_RETRY = 5;
let consecRetry = 0;

function bail(reason) {
  RUN.aborted = true;
  console.log('');
  console.log('✗ 中止跑批：' + reason);
  console.log('  已跑 ' + RUN.done + ' 条、累计重试 ' + RUN.retries + ' 次、耗时 ' +
    Math.round((Date.now() - RUN.startMs) / 1000) + 's');
  console.log('  这台机器当前扛不住这轮跑批。建议：');
  console.log('    a) 用关键词只跑相关几条，例如 node headless_check.js "视口"');
  console.log('    b) 关掉占资源的程序（微信/飞书/钉钉/DingTalk/游戏）再试');
  console.log('    c) 确认磁盘有余量：df -h /c，必要时 node .workbuddy/clean_chrome_tmp.js');
  sweepAllJunk();
  reportEnv();
  process.exit(2);
}

// ---------------- 末轮兜扫：清掉所有「没人在用」的同前缀临时目录 ----------------
// 为什么还要单独来一遍（前面的 per-use 差集 + 探活已经够多）：2026-09-17 实测发现，
// 刚被强杀的 chrome 会留下没 pid 前缀的 HeadlessChrome<时间戳>（profile 全量，几十 MB）。
// 它既不在「本次新建」差集里（强杀发生在跑批外/上一条用例），也没有 pid 可探活 ——
// 只能靠「试着删」来判定：Windows 会锁住正在使用的目录，**删得掉就等于没人在用**。
// 所以跑批收尾时对全部同前缀目录试删一遍，删不掉的只记数不报错（可能是 WorkBuddy
// 预览等真实进程在用）。这样孤儿不再有"永远清不掉"的死角。
// 可用 HEADLESS_KEEP_TMP=1 关闭，方便需要保留现场排查时使用。
function sweepAllJunk() {
  if (process.env.HEADLESS_KEEP_TMP === '1') return;
  let names;
  try { names = fs.readdirSync(TEMP); } catch (e) { return; }
  for (const n of names) {
    if (!/^(scoped_dir|wb_headless_|HeadlessChrome)/.test(n)) continue;
    // 绝不碰本进程正在用的 profile 前缀（U_DIR_BASE = wb_headless_<自己pid>_*）：
    // 它不匹配下面的 scoped_dir\d+_ 探活，会直落删除分支，把自己的工作目录端了。
    if (n.indexOf(U_DIR_BASE_NAME) === 0) continue;
    const p = path.join(TEMP, n);
    // 带 pid 的先探活：还活着的直接跳过（正在被真实 chrome 使用，碰不得）。
    const pid = (n.match(/^scoped_dir(\d+)_/) || [])[1];
    if (pid) { try { process.kill(Number(pid), 0); continue; } catch (e) { /* 已死，可清 */ } }
    // 无 pid 或探活说已死的：试着删。Windows 会锁住真正在用的目录 ——
    // 删失败本身就是"有人在用"的证据，比任何猜测都准。删完复核，还在就不计数。
    try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 1 }); } catch (e) { /* 占用中，正常 */ }
    if (!fs.existsSync(p)) freed++;
  }
}

function reportEnv() {
  const tempMB = dirMB(TEMP);
  const freeMB = diskFreeMB();
  let line = '  TEMP 占用 ' + fmtMB(tempMB) + '（跑批前 ' + fmtMB(RUN.tempBeforeMB) + '，Δ' +
    (RUN.tempBeforeMB < 0 ? 'n/a' : (tempMB - RUN.tempBeforeMB >= 0 ? '+' : '') + (tempMB - RUN.tempBeforeMB) + ' MB') + '）';
  line += '   C 盘可用 ' + fmtMB(freeMB);
  if (RUN.freeBeforeGB >= 0) {
    const d = (freeMB - RUN.freeBeforeGB * 1024) / 1024;
    line += '（Δ' + (d >= 0 ? '+' : '') + d.toFixed(2) + ' GB）';
  }
  console.log(line);
  console.log('  清理：本轮清掉 ' + freed + ' 个临时目录' + (stuck ? '，' + stuck + ' 个删不掉（建议手动兜底）' : ''));
}

function run(label, query, expect, opts) {
  opts = opts || {};
  if (FILTER && label.indexOf(FILTER) < 0) return { ok: null, skipped: true };
  if (RUN.aborted) return { ok: null, skipped: true };
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
  RUN.done++;
  RUN.retries += (tries - 1);
  // 一条用例把重试预算耗尽 = 页面起不来。注意这里按「**连续起不来的次数**」累加
  // （一次失败的用例贡献 tries-1 次），而不是「连续几条用例」——
  // 否则「只跑 1 条却卡死」这种最该熔断的场景永远够不到阈值（2026-09-17 实测踩到）。
  if (!r.dbg && !r.probe && tries >= 4) {
    consecRetry += (tries - 1);
    if (consecRetry >= MAX_CONSEC_RETRY) {
      bail('连续 ' + consecRetry + ' 次启动都起不来（页面加载不出，#dbg/#probe 全空）');
    }
  } else if (r.dbg || r.probe) {
    consecRetry = 0;   // 只要有一条真的跑起来了，就认为机器还活着，计数归零
  }
  if (r.dbg || r.probe) {
    const free = diskFreeMB();
    // 磁盘红线：低于 500MB 时 chrome 会开始写不动 profile → 假失败 → 重试 → 更多垃圾。
    // 与其滑进这个死亡螺旋，不如当场停手（这比「等它自己挂掉」有用得多）。
    if (free >= 0 && free < 500) bail('C 盘可用仅 ' + free + ' MB（< 500MB），再跑下去会导致假失败与垃圾堆积');
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

// 跑批基线：收尾时要拿它做差，报出「这轮跑批到底留下了多少」。
RUN.tempBeforeMB = dirMB(TEMP);
RUN.freeBeforeGB = diskFreeMB() / 1024;

// ---------------- 用例 ----------------
const results = [];
const DIRS = ['down', 'left', 'right', 'up'];

// 1) ★ 本次修的 bug：点击移动必须按行进方向转身（原来永远停在初始的 down）
// ⚠ 必须写死 map=qingxuan：这几条假设出生点四周是**开阔空地**。默认开局图早已换成
//   外来图「洛赫港」，它出生点周围有建筑/水，-3 格落点被判不可走 → 假失败（不是转身坏了）。
[
  ['right', 'cdx=3&cdy=0'],
  ['left', 'cdx=-3&cdy=0'],
  ['down', 'cdx=0&cdy=3'],
  ['up', 'cdx=0&cdy=-3'],
].forEach(([want, q]) => {
  results.push(run('点击转身 ' + want, 'map=qingxuan&autotest=click&' + q, ({ probe }) =>
    !!probe && probe.targetAccepted && probe.faceAfter === want && probe.reached));
});

// 2) 长距离点击：BFS 绕路后必须能走到，且全程不落到非法格
results.push(run('点击 8 格直线', 'map=qingxuan&autotest=click&cdx=8&cdy=0&secs=4', ({ probe }) =>
  !!probe && probe.cellOk && probe.reached && probe.faceAfter === 'right'));
results.push(run('点击 长斜向 (8,8)', 'map=qingxuan&autotest=click&cdx=-8&cdy=-8&secs=8', ({ probe }) =>
  !!probe && probe.targetAccepted === true && probe.cellOk && probe.reached && DIRS.indexOf(probe.faceAfter) >= 0));
results.push(run('点击 回走 (6,-6)', 'map=qingxuan&autotest=click&cdx=-6&cdy=-6&secs=8', ({ probe }) =>
  !!probe && probe.targetAccepted === true && probe.cellOk && probe.reached && DIRS.indexOf(probe.faceAfter) >= 0));

// 3) 点击虚空/水面应被拒绝（不会让角色朝墙撞过去）
results.push(run('点击 不可达格 拒绝', 'map=qingxuan&autotest=click&cdx=40&cdy=40', ({ probe }) =>
  !!probe && probe.targetAccepted === false));

// 4) 键盘对照：按住右键移动且朝向 right；松手后不得被残差翻成 left
results.push(run('键盘 d 对照', 'map=qingxuan&autotest=walk', ({ dbg }) =>
  !!dbg && dbg.face === 'right' && dbg.mx > 17));

// 5) 传送阵双向
results.push(run('传送 青玄→灵泉', 'map=qingxuan&autotest=portal', ({ dbg }) =>
  !!dbg && dbg.map === 'lingquan' && dbg.fade === 0));
results.push(run('传送 碑林→青玄', 'map=beilin&autotest=portal', ({ dbg }) =>
  !!dbg && dbg.map === 'qingxuan' && dbg.fade === 0));

// 6) NPC 绘制分支可达（只有青玄山门摆了 NPC，必须指名它，别指望默认开局图有）
results.push(run('NPC 渲染计数', 'map=qingxuan&autotest=walk', ({ dbg }) => !!dbg && dbg.npcs > 0));

// 7) 碑林石阵刷怪（就地取材的打怪场）
results.push(run('碑林 刷怪', 'map=beilin', ({ dbg }) => !!dbg && dbg.foes > 0));

// 8) 战斗：贴脸反复攻击应击杀并掉落灵石 / 修为增长
results.push(run('战斗 击杀掉落', 'map=beilin&autotest=fight', ({ probe }) =>
  !!probe && probe.exp > 0 && probe.stones > 0));

// 8.4) 掉落 / 拾取 / 服药 / 背包 全链路（2026-09-17 加）。
//      四件事各自"看起来对"很容易，接在一起才暴露真问题：
//      ① 每个 ITEMS 条目都要能在图集里解析到帧（缺图 = 背包里是空白格）
//      ② 掉落掷骰实际命中率（rollLoot 是独立掷骰，可能全不中）
//      ③ 每件掉落都要落在可走格上（溅到墙里的图标玩家永远捡不到）
//      ④ 走近必须真的入包、服药必须真的回血，且满血不消耗、冷却期间不生效
// ⚠ 断言必须用「花括号体 + return」写，**不能**图省事写成裸表达式再跟 `, { budget }`：
//   `=> a && b, { budget: X }` 里那个逗号会被解析成**逗号运算符**（还是箭头函数的体），
//   整条断言变成恒真的 `{budget:X}`，跑批就永远 PASS —— 一个测试自己的静默失效。
results.push(run('掉落 拾取 服药 背包', 'map=beilin&autotest=loot', ({ probe }) => {
  if (!probe) return false;
  return probe.defs === 6 && probe.healDefs === 3      // 6 种物品、3 种药
    && probe.iconMiss.length === 0                     // 图标全部能解析
    && probe.rolls > 0 && probe.dropped > 0            // 400 次掷骰、真的掉出过东西
    && probe.landed > 0 && probe.onWall === 0          // 撒下的每一件都在可走格
    && probe.picked >= 1                               // 走近真的捡起来了
    && probe.healOk === true                           // 服药回血且数量 -1
    && probe.healFull === true                         // 满血不消耗
    && probe.healCdBlock === true                      // 冷却期间不生效
    && probe.crafted.cells === 5                       // 背包 5 格
    && probe.crafted.healUseCells === 3                // 其中 3 格可点服用
    && probe.crafted.ghostImgs === 0                   // 不再用 <img> 塞图标
    && probe.geo && probe.geo.n === 5                  // ★ 5 格图标都画出来了
    // ★★★ 唯一真判据（2026-09-17 两轮教训）：canvas 里必须真的有不透明像素。
    //   ① 只断言"帧解析到/计数对" → 图标全空白也过（第 1 轮）；
    //   ② 改断言"可见区间 = [0,46]²" → 全绿但用户仍看不到（CSS background 引用了
    //      已 revoke 的 blob URL，二次取像素静默失败，inline style 字符串照样规整）。
    //   miss 为空即每格 ink 占比 > 0.25，说明取到像素并真的画进 canvas 了。
    && probe.geo.miss.length === 0
    // ★★★ 有货 / 空格必须在**浏览器实算样式**上真的分得开（2026-09-17 第三次修复）。
    //   之前 .empty / .has / .cool 三条 filter 规则特异性相同、后写的赢，
    //   `.cool` 那条灰调把 `.has` 的提亮整个盖掉了 —— 而且 .cool 还是无条件设的，
    //   于是用户看到"背包图标永远是灰的"。这类失效**读 inline style 抓不到**，
    //   只有读 getComputedStyle 的最终值才看得见。
    //   判据分两种合法态：
    //     · 有货且**不在冷却** → 必须 brightness(1.22) 提亮（证明 .has 没被 .cool 盖掉）
    //     · 有货但**正在冷却**（只有刚服下那一格）→ 允许轻微变暗，但**绝不能是 grayscale**
    //       （grayscale 是"空格"的语义，有货变灰正是用户抱怨的那个观感）
    //     · 空格 → 必须 grayscale
    && probe.bagStates && probe.bagStates.length === 5
    && probe.bagStates.every(function (s) {
         if (s.n > 0) {
           if (s.has !== true) return false;
           if (s.filter.indexOf('grayscale') >= 0) return false;
           return /cool/.test(s.cls) || s.filter.indexOf('brightness(1.22)') >= 0;
         }
         return s.has === false && s.filter.indexOf('grayscale') >= 0;
       })
    && probe.atlasNatural === '782x198'                // 图集本身解码正常（对比参考）
    && probe.atlas && probe.atlas.img && probe.atlas.rectKeys === 6
    && probe.atlas.bigKeys === 6;                      // 图集三张表都到位
}, { budget: 20000 }));

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

// 8.6) 技能盘：每个技能（御剑诀/雷罡咒/太虚剑域/炎爆术…）各自要能命中掉血、冷却期间放不出来、
//      冷却清零后能再放，且每次释放都产生特效对象。
// ⚠ 别写死 3 招：2026-09-16 加了第 4 招（P 炎爆术）后这条就红了。改成「按实际招数逐条验」。
results.push(run('技能 全招与冷却', 'map=qingxuan&autotest=skill', ({ probe }) => {
  if (!probe || !Array.isArray(probe.skills) || probe.skills.length < 4) return false;
  if (probe.n !== probe.skills.length) return false;
  return probe.skills.every((s) => s.cast === true && s.dmg > 0 && s.blocked === true
    && s.recast === true && s.dmg2 > 0 && s.fx >= 1 && s.cd > 0);
}, { budget: 24000 }
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
results.push(run('外来地图 洛赫港', 'map=flare_grass_empyrean_campaign_lochport&autotest=importmap', ({ probe }) =>
  !!probe && probe.map === 'flare_grass_empyrean_campaign_lochport' &&
  probe.w === 49 && probe.h === 60 &&
  probe.walk > 400 && probe.obj > 1000 &&
  probe.spawnOnWalkable === true && probe.atSpawn === true &&
  probe.targetFound === true && probe.clickAccepted === true &&
  probe.reached === true && probe.moved === true,
{ budget: 22000 }));

// 9.6) 第二张外来图。两张**共用同一套图集**（导入器 --append 把瓦并进同一个目录）。
//      追加导入最容易出的错是「后导入的瓦静默覆盖先导入的瓦」——图集照样加载、不报错，
//      但前一张图整片错乱。所以这一条必须和上一条**同时**通过，才算图集没串。
results.push(run('外来地图 河畔小径', 'map=flare_grass_empyrean_campaign_river_trail&autotest=importmap', ({ probe }) =>
  !!probe && probe.map === 'flare_grass_empyrean_campaign_river_trail' &&
  probe.w === 78 && probe.h === 35 &&
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
// ⚠ isolated 的口径（2026-09-16 实测 12 张外来图后定的）：
//   · 黑橡城 3044/3044 isolated=0 —— 拿它当**严格哨兵**，这条松了就是真回归（桥又被判死了）。
//   · 其余图的原作美术本身就有零星断开格（洛赫港 5/1449=0.3%、纳齐亚高地 2 格…），
//     要求全 0 等于每次重导都假红，所以第二张图允许 <2%。
//   · 真正该盯的异常另记：法师塔·一层 2553/3149=81%、铁迷宫·裂隙 18.8%、莫格洞窟 8.1%、
//     河畔小径 7.6%、洛赫港墓园 2.3% —— 这些是**原图分层/分间**，不是导入 bug，
//     但玩家落地后能走的只剩一小块，属待办（见 .workbuddy/memory 同日记录）。
[['flare_grass_empyrean_campaign_black_oak_city', '外来地图 黑橡城全连通', 24],
 ['flare_grass_empyrean_campaign_lochport', '外来地图 洛赫港连通', 20]]
  .forEach(([m, label, budget]) => {
    var strict = m.indexOf('black_oak_city') >= 0;
    results.push(run(label, 'map=' + m + '&autotest=crossing', ({ probe }) =>
      !!probe && probe.map === m &&
      probe.walk > 300 &&
      (strict ? probe.reach === probe.walk && probe.isolated === 0
              : probe.isolated / probe.walk < 0.02) &&
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
  probe.overlapsPanel === false &&
  probe.notUpscaled === true &&
  probe.isoRatio >= 1.9 && probe.isoRatio <= 2.1 &&      // 等距菱形（2026-09-17 起）
  probe.foldedAfter === true && probe.unfoldedAfter === false &&
  probe.clickAccepted === true && probe.clickMoved === true,
{ budget: 22000 }));

// ⚠ v31 起缩略图改成等距菱形：画布宽高比恒 ≈ 2（与地图 w/h 无关），
//   旧断言 `ratio ≈ 0`（画布比=地图比）已不成立 —— 那条只对正方形底图有效。
results.push(run('右上角 缩略图 非正方图', 'map=flare_grass_empyrean_campaign_river_trail&autotest=minimap', ({ probe }) =>
  !!probe && probe.cv === true &&
  probe.isoRatio >= 1.9 && probe.isoRatio <= 2.1 &&
  probe.cellPx > 0.25 && probe.cellPx < 8 &&         // 每格像素（等距下 78×35 的图会被缩得比较小）
  probe.cells.walk > 300 && probe.solidPx > 2000 &&
  probe.markInCanvas === true &&
  probe.overlapsPanel === false &&
  probe.notUpscaled === true &&
  probe.clickAccepted === true && probe.clickMoved === true,
{ budget: 22000 }));

// 9.67) 缩略图在手机横屏（844×390）下的行为：**默认收起**（那块屏本来就不够放），
//      强制展开后必须仍在视口内、不压住地图速切面板、画布不被 CSS 放大（放大就会糊），
//      且点缩略图仍然能走过去。`?mm=1` 是给无头截图/自测用的强制展开开关。
//      ⚠ v31 缩略图改等距菱形后整体变矮（132×66），手机 34vh 上限（≈133px）压不到它 ——
//        所以「必须被压扁」不再是普适断言，改成按需：只在位图高度真的超过 34vh 时才要求压。
results.push(run('右上角 缩略图 手机横屏', 'map=lingquan&touch=1&mm=1&autotest=minimap', ({ probe }) =>
  !!probe && probe.cv === true &&
  probe.viewport[0] === 844 && probe.viewport[1] === 390 &&
  probe.notUpscaled === true &&
  (probe.size[1] <= probe.viewport[1] * 0.34 + 2 || probe.cssBox[1] < probe.size[1]) &&
  probe.inViewport === true && probe.overlapsPanel === false &&
  probe.markInCanvas === true &&
  probe.foldedAfter === true && probe.unfoldedAfter === false &&
  probe.clickAccepted === true && probe.clickMoved === true,
{ size: '870,546', budget: 22000 }));

//      同一台手机**不**给 `?mm=` 时必须默认收起（用户要的是"能收起来"，手机上默认就该是收着的）
results.push(run('右上角 缩略图 手机默认收起', 'map=lingquan&touch=1&autotest=minimap', ({ probe }) =>
  !!probe && probe.cv === true && probe.foldedAtStart === true,
{ size: '870,546', budget: 22000 }));

// 9.66) 世界地图总览（分组节点浮层）：?autotest=worldmap 打开浮层、渲染节点、点节点传送、Tab 开关。
//       这是把「地图速切按钮列表」重做成「Tab/图标开的总览」后的核心回归 —— 节点数必须 = 地图数，
//       且点节点要真的把人传过去、浮层自动收起；Tab 键开/关桌面入口也得过。
//       ⚠ v20 起改成「名称节点墙」，早已没有 canvas 缩略图，别再断言 thumbCanvases。
//       ⚠ 节点数别写死：地图还在加，写死就等于每次加图都要来改测试（实测 16 张/5 个界）。
results.push(run('世界地图总览 节点/传送/Tab', 'map=qingxuan&autotest=worldmap', ({ probe }) =>
  !!probe && probe.map === 'qingxuan' &&
  probe.nodes === probe.shownNodes && probe.nodes >= 10 && probe.regions >= 2 &&
  probe.scrollExists === true &&
  probe.opened === true &&
  probe.teleported === true && probe.closedAfterClick === true &&
  probe.tabOpens === true && probe.tabCloses === true,
{ budget: 22000 }));

// 9.7) ★ 开局那一屏：默认进**洛赫港**（maps.json 的 start），而它是外来图 —— 图集走懒注册。
//      必须在 boot 期就把**这一套**图集注册+排进首屏池：否则 boot 末尾的 switchTo 会在一张
//      「有地形、没图集」的图上渲染，piece() 一件都取不到 → 整屏黑掉、且零报错
//      （2026-09-16 真踩过：默认图从自带图换成外来图，全线自测"通过"，实机一片黑）。
//      extras 只该有 2 个键（地宫 + 开局这套）——顺带守住「boot 期不许把 100+ 套图集全注册」，
//      那会让 preloadExtras 一口气全下、首屏直接爆。
//      ⚠ weight 口径 = **线上真实传输 KB**（JSON 走 gzip）：主图集 1091 + 妖兽 680 + 人物 183
//      + 技能 61 + 几个 JSON 17 + 开局图集 1069 + 它的索引 2 + 16 张地形 128 ≈ 2336KB。
results.push(run('开局图 图集进首屏', 'autotest=bootstats&preload=0', ({ probe }) =>
  !!probe && probe.map === 'flare_grass_empyrean_campaign_lochport' &&
  probe.total > 2100 && probe.total < 2700 &&
  probe.extras && probe.extras.flare_grass_empyrean_campaign &&
  probe.extras.flare_grass_empyrean_campaign.loaded === true &&
  probe.extras.flare_grass_empyrean_campaign.queued === true &&
  probe.extras.dungeon.loaded === false &&
  Object.keys(probe.extras).length === 2,
{ budget: 34000 }));

// 9.71) ★「开局这一屏真的画出来了吗」——只查 CUR.id / 无异常**拦不住**「有地形、没图集」
//      这类静默故障（piece() 全取空、整屏黑、零报错，连 #probe 的异常出口都空着）。
//      这条直接查瓦片件命中率与主画布真实像素：物件必须全部取到件，画面必须不黑、有颜色。
results.push(run('开局渲染烟测', 'autotest=rendersmoke&preload=0', ({ probe }) =>
  !!probe && probe.map === 'flare_grass_empyrean_campaign_lochport' &&
  probe.atlasImg === true && probe.atlasHasTiles === true &&
  probe.objHit > 1000 && probe.objMiss === 0 && probe.heroHasSheet === true &&
  probe.px && probe.px.darkPct < 5 && probe.px.colors >= 12,
{ budget: 34000 }));

// 9.72) 技能盘排版（王者式弧线）：叠加/被顶出屏幕这类问题截图看不出来，量真实矩形。
//      ⚠ 间距按「圆」算（圆心距 - 两半径），不能按外接矩形算 —— 圆排开时外接矩形天然咬角，
//      用矩形会假报重叠（第一版就是这么误判的）。设计值 ≥10px，缩略后（手机 scale）≥6。
results.push(run('技能盘 弧线不重叠', 'autotest=skillpad', ({ probe }) =>
  !!probe && probe.boxes && probe.boxes.length === 6 &&
  probe.minGap > 6 && probe.inView === true && probe.rightGap === 14 &&
  probe.foldedAfter === true && probe.foldedBox && probe.foldedBox[0] === 38 &&
  probe.unfoldedAfter === true,
{ budget: 22000 }));
results.push(run('技能盘 手机缩放', 'autotest=skillpad&touch=1', ({ probe }) =>
  !!probe && probe.touch === true && probe.scale !== 'none' &&
  probe.minGap > 4 && probe.inView === true,
{ size: '870,546', budget: 22000 }));

// 9.73) ★ 手机端视口防线（"移动时地图一块块漏出来"的主因，三条一起守）：
//      ① 画布位图必须 1:1 等于 CSS 盒 —— 不等就是被浏览器拉伸，每格瓦都落在像素栅格外；
//      ② 尺寸没变时 resize（含连打，模拟地址栏动画）**不许**清空画布（原来每次都清 → 一块块漏）；
//      ③ touch-action / 手势拦截真的生效 —— 单指拖摇杆不能变成原生平移页面。
//      这三条都不报错、截图也未必看得出来，只能量着断言。
results.push(run('视口一致+画布不清空', 'autotest=viewport&preload=0', ({ probe }) =>
  !!probe && probe.sizeMatch === true &&
  probe.touchAction === 'none' && probe.bodyTouchAction === 'manipulation' && probe.overscroll === 'none' &&
  probe.gestureBlocked === true && probe.dblBlocked === true && probe.zoomFix === true &&
  probe.survivedResize === true && probe.survivedStorm === true,
{ budget: 30000 }));
results.push(run('视口一致 手机尺寸', 'autotest=viewport&preload=0&touch=1', ({ probe }) =>
  !!probe && probe.sizeMatch === true && probe.touchAction === 'none' &&
  probe.survivedResize === true && probe.survivedStorm === true,
{ size: '870,546', budget: 30000 }));

// 9.74) 地面瓦片「整数落点」：分数落点 + imageSmoothingEnabled=false 时，浏览器会对每块瓦
//      各自取整、误差逐格累积 → 接缝上留 1px 底色。物件层一直在 Math.round，地面层原先漏了。
//      ⚠ frac 量的是**真正交给 drawImage 的四个值**（不是"原值是否整数"——那个恒为真，
//      没有可证伪性）。实测未取整时 488/488 全中，取整后为 0。
results.push(run('地面瓦片整数落点', 'map=qingxuan&autotest=seams', ({ probe }) =>
  !!probe && probe.n > 100 && probe.frac === 0 && probe.seamPx === 0 && probe.pairs >= 5,
{ budget: 26000 }));

// 9.7) ★ 视口裁剪没画漏（2026-09-17 渲染优化配套）。
//      裁剪按 k=x+y 二分区间，唯一风险是「裁多了 → 屏幕内物件被跳掉」，表现为地图边缘空一块。
//      判据不是帧率，而是：**被裁掉的物件里，有几个本该看得见**（ghost）—— 必须为 0。
//      ⚠ 注意不能用「裁剪后落笔数 == 全量落笔数」当判据：paintObj 自己的边界判据带余量
//      （by 允许到 H+oh*1.6），会把一部分屏幕外的瓦也算「落笔」，裁剪把它们裁掉是对的。
//      所以 cull 自测会逐个算被裁物件的屏幕矩形，只有真的可见才算漏画。
//      另外要求 savedScan > 0 —— 否则"优化"根本没生效（假通关）。
[['洛赫港', 'flare_grass_empyrean_campaign_lochport'],
 ['洛赫港墓园', 'flare_grass_empyrean_campaign_lochport_cemetery'],
 ['冥界穴窟', 'flare_cave_empyrean_campaign_underworld']].forEach(([nm, m]) => {
  results.push(run('视口裁剪 不漏画 ' + nm, 'map=' + m + '&autotest=cull', ({ probe }) =>
    !!probe && probe.ghost === 0 && probe.extra === 0 && probe.savedScan > 0 &&
    probe.rows.length === 4,
  { budget: 32000 }));
});

// 9.75) ★ 缩略图必须是「等距菱形」而非正方形（2026-09-17 用户反馈"和地图角度对不上"）。
//       旧版把 x→px、y→px 当俯视正交铺，与画面的等距投影差 45°：缩略图上的右上在游戏里是右下。
//       判据：① isoRatio（画布宽/高）≈ 2 —— 等距菱形标准比例，正方形图会是 ~1
//            ② 点缩略图能走到目标格（逆投影正确）
//       ⚠ 不能用 ratio（画布比 vs 地图比）当判据了：等距下图宽与地图 w/h 本就无关。
results.push(run('缩略图 等距菱形', 'map=flare_grass_empyrean_campaign_lochport&mm=1&autotest=minimap', ({ probe }) =>
  !!probe && probe.isoRatio >= 1.9 && probe.isoRatio <= 2.1 &&
  probe.markInCanvas === true && probe.clickAccepted === true && probe.clickMoved === true,
{ budget: 26000 }));
results.push(run('缩略图 等距(非正方图)', 'map=flare_grass_empyrean_campaign_river_trail&mm=1&autotest=minimap', ({ probe }) =>
  !!probe && probe.isoRatio >= 1.9 && probe.isoRatio <= 2.1 &&
  probe.markInCanvas === true && probe.clickAccepted === true,
{ budget: 26000 }));
results.push(run('缩略图 等距(大图)', 'map=flare_cave_empyrean_campaign_underworld&mm=1&autotest=minimap', ({ probe }) =>
  !!probe && probe.isoRatio >= 1.9 && probe.isoRatio <= 2.1 &&
  probe.markInCanvas === true && probe.clickAccepted === true && probe.clickMoved === true,
{ budget: 30000 }));

// 9.76) ★ 洛赫港 / 墓园真的刷怪了（2026-09-17 用户要求"在洛赫港增加点怪物，不要太密集"）。
//       判据：怪数 == 8（两图都是 8）；且怪**不在出生点上**（不能一进图就贴脸）。
results.push(run('洛赫港 刷怪 8 只', 'map=flare_grass_empyrean_campaign_lochport', ({ dbg }) =>
  !!dbg && dbg.foes === 8));
results.push(run('洛赫港墓园 刷怪 8 只', 'map=flare_grass_empyrean_campaign_lochport_cemetery', ({ dbg }) =>
  !!dbg && dbg.foes === 8));

//      反过来：?map= 直接指到那张图时，它**必须**算进首屏 —— 否则进图那一刻才开始下载，
//      玩家看到的是"进去了但一片空白"。地宫是最难的一种：它的地图条目**没有 atlas 字段**，
//      图集名要靠物件前缀（'dungeon/'）反推（见 expandPlan 分支②的 mapAtlas(x)）。
//      ⚠ 首屏体积别写死：随图集/地形增减而变。这里只锁「地宫那 549KB 确实进来了」。
results.push(run('首屏含目标图图集', 'map=dungeon&autotest=bootstats&preload=0', ({ probe }) =>
  !!probe && probe.map === 'dungeon' &&
  probe.total > 1700 && probe.total < 2100 &&
  probe.extras.dungeon.queued === true && probe.extras.dungeon.loaded === true,
{ budget: 32000 }));

// 9.8) 运行时按需补载：首屏只载自带图 + 外来图，然后模拟用户点地图按钮切过去 ——
//      地形与图集要当场补上、玩家落在可走格上、载入提示要收掉。
//      这条覆盖最容易漏的路径：?map= 没指到它，goTo 的补载分支才第一次被执行。
results.push(run('按需切图 地宫', 'map=qingxuan&autotest=lazygoto&preload=0&goto=dungeon', ({ probe }) =>
  !!probe && probe.map === 'dungeon' && probe.before === false &&
  probe.obj > 100 && probe.atlas === true &&
  probe.spawnOnWalkable === true && probe.atSpawn === true && probe.tipGone === true,
{ budget: 32000 }));

// 9.85) 外来图「零等待切换」：用户要求「这两张图一起加载，不要点击再加载」的验收。
//      before=true 说明点下去之前图集已就绪；地形也在首屏池里（m._data 已置位），
//      所以 goTo 走的是同步分支 —— 一次网络请求都不发，载入提示也不该闪。
results.push(run('外来图 零等待切换', 'map=flare_grass_empyrean_campaign_lochport&autotest=lazygoto&preload=0&goto=flare_grass_empyrean_campaign_river_trail', ({ probe }) =>
  !!probe && probe.map === 'flare_grass_empyrean_campaign_river_trail' && probe.before === true &&
  probe.obj > 1000 && probe.atlas === true &&
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

const ran = results.filter((r) => r.ok !== null);
const failed = ran.filter((r) => r.ok === false).length;
const skipped = results.filter((r) => r.ok === null).length;
console.log('\n' + (failed ? failed + ' 个用例失败' : '全部通过 (' + ran.length + ' 个用例)') +
  (skipped ? '（另有 ' + skipped + ' 个因过滤跳过）' : ''));
// 让清理可观测：以前 scoped_dir 悄悄堆到 17GB 也没人知道。
console.log('\n—— 跑批体检 ——');
console.log('  用例 ' + ran.length + ' 条（跳过 ' + skipped + '），累计重试 ' + RUN.retries +
  ' 次，耗时 ' + Math.round((Date.now() - RUN.startMs) / 1000) + 's');
// 先兜扫再报数：这样体检里的「清理 N 个」和 TEMP 占用都包含兜扫成果，
// 数字与实际清完后的状态一致（否则报告说清了 3 个、TEMP 却还挂着 28MB 的残壳）。
sweepAllJunk();
reportEnv();
console.log('  ↑ 若 C 盘 Δ 大幅为负或清理数异常，说明机器当时很吃紧，结果可信度下降');
try { fs.rmSync(U_DIR, { recursive: true, force: true }); } catch (e) { /* 目录偶尔被占用，留着不影响结果 */ }
process.exit(failed ? 1 : 0);
