// 素材引用清单：把「代码里引用的路径」× 「磁盘上是否存在」× 「git 是否跟踪」三方对齐，
// 再把「素材包出处 / 授权 / 是否已登记」一并抽出来。
//
//   node test/tools/asset_audit.js             # 控制台报表
//   node test/tools/asset_audit.js --md <file> # 额外写一份 Markdown
//
// 防两类事故：
//   ① 代码引用了磁盘上不存在的文件 —— 本地有缓存看不出来，线上直接 404；
//   ② 文件在磁盘上但被 .gitignore 挡在版本控制外 —— 本地跑得好，Pages 上缺图。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');   // ImmortalGame/
const GAME = path.join(ROOT, 'test');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const readIf = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } };
const kb = (n) => (n < 1024 ? n + 'B' : (n / 1024).toFixed(n / 1024 < 10 ? 1 : 0) + 'KB');

function walk(dir, acc = []) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const e of ents) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '.git') walk(fp, acc); }
    else acc.push(rel(fp));
  }
  return acc;
}

// ---------- git 状态 ----------
const trackedAll = (() => {
  try { return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch (e) { return null; }
})();
const trackedSet = trackedAll ? new Set(trackedAll) : null;

function ignoredOf(list) {
  if (!list.length || !trackedSet) return new Set();
  try {
    const r = execFileSync('git', ['check-ignore', '--stdin'], { cwd: ROOT, input: list.join('\n'), encoding: 'utf8' });
    return new Set(r.split('\n').filter(Boolean));
  } catch (e) { return new Set(String(e.stdout || '').split('\n').filter(Boolean)); }
}

// ---------- 1. 代码里引用的路径 ----------
const CODE = ['test/index.html', 'test/js/game.js', 'test/js/tile.js', 'test/js/path.js'];
const refs = new Map();
for (const f of CODE) {
  const txt = readIf(path.join(ROOT, f));
  const re = /['"`]([A-Za-z0-9_\-./]+\.(?:png|jpg|jpeg|json|css|js))['"`]/g;
  let m;
  while ((m = re.exec(txt))) {
    if (!refs.has(m[1])) refs.set(m[1], new Set());
    refs.get(m[1]).add(f);
  }
}

// 运行时素材 = test/ 下交付必须加载到的（js / assets / index.html）
const allFiles = walk(ROOT);
const runtime = allFiles.filter((f) => /^test\/(assets|js)\/[^/]+$/.test(f) || f === 'test/index.html');

// 子目录里的大件（sliced_* 是构建中间产物；objects/ 是切片产物）
const runtimeDirs = ['test/assets/foes', 'test/assets/sliced', 'test/assets/objects'];
const dirStats = runtimeDirs.map((d) => {
  const list = allFiles.filter((f) => f.startsWith(d + '/'));
  const size = list.reduce((a, f) => a + (fs.statSync(path.join(ROOT, f)).size), 0);
  return { dir: d + '/', n: list.length, size };
});

// ---------- 2. 缺失引用 ----------
// 注意：HEROES 表里的 file 字段其实是「图集帧键名」（vamp_31.png 之类并不存在独立文件，
// 它是 chars_atlas.png 里的一个 rect，经 chars_atlas.json 映射）。所以判定缺失前要先排除
// 「名字能在某个 assets/*.json 里找到」的情况，否则会误报一堆不存在的文件。
const jsonBlob = ['chars_atlas.json', 'foes_atlas.json', 'tiles_atlas.json', 'beasts.json', 'heroes.json', 'chars_base.json']
  .map((j) => readIf(path.join(GAME, 'assets', j))).join('\n');

const fileSet = new Set(allFiles);
const missing = [];
const atlasKeys = [];
for (const [r, where] of refs) {
  const cand = r.replace(/^\.?\//, '');
  const hit = fileSet.has(cand) || fileSet.has('test/' + cand) ||
              allFiles.some((f) => f.endsWith('/' + cand));
  if (hit) continue;
  const base = path.basename(cand);
  if (jsonBlob.includes(base)) { atlasKeys.push({ ref: r, where: [...where].join(',') }); continue; }
  missing.push({ ref: r, where: [...where].join(',') });
}

// ---------- 3. 未被 git 跟踪的运行时文件 ----------
// 顶层（assets/*.png、*.json、js/*）与子目录（assets/foes/、assets/sliced/）分开看：
// 子目录漏跟踪 = 线上缺整套怪物动作帧或切片，比顶层漏一个更隐蔽。
const runtimeAll = allFiles.filter((f) => /^test\/(assets|js)\/.+/.test(f));
const notTrackedAll = trackedSet ? runtimeAll.filter((f) => !trackedSet.has(f)) : [];
const notTracked = notTrackedAll.filter((f) => /^test\/(assets|js)\/[^/]+$/.test(f));
const notTrackedSub = notTrackedAll.filter((f) => !/^test\/(assets|js)\/[^/]+$/.test(f));
const ignored = ignoredOf(notTrackedAll);

// ---------- 4. 素材包出处 / 授权 ----------
function loadRegistry(p) { try { return JSON.parse(readIf(p)); } catch (e) { return null; } }
const heroReg = loadRegistry(path.join(GAME, 'tools/hero_packs.json'));
const beastReg = loadRegistry(path.join(GAME, 'tools/beast_packs.json'));
const packs = [];
for (const r of [heroReg, beastReg]) {
  if (!r) continue;
  const kind = r === heroReg ? '角色' : '怪物';
  for (const p of (r.packs || [])) {
    packs.push({
      kind, id: p.id, dir: p.dir,
      units: (p.units || p.monsters || p.heroes || []).map((u) => u.key || u.src),
      license: p.license || (r._spec && r._spec.license) || '',
      mode: p.mode || 'sheet',
    });
  }
}
// 磁盘上还有哪些包目录没登记（例如新丢进来的）
// 注意：hero_packs.json 的 dir 写的是包名（craftpix-net-xxxx），beast_packs.json 写的是
// sucai/ 相对路径，两边口径不一样，比较前要先归一化（统一去掉 sucai/ 前缀与 /PNG 后缀）。
const normDir = (d) => String(d).replace(/^sucai\//, '').replace(/\/PNG$/, '');
const sucaiDirs = (() => {
  try {
    return fs.readdirSync(path.join(ROOT, 'sucai'), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => 'sucai/' + e.name);
  } catch (e) { return []; }
})();
const registeredDirs = new Set(packs.map((p) => normDir(p.dir)));
const unregistered = sucaiDirs.filter((d) => !registeredDirs.has(normDir(d)));

// ---------- 5. LOAD_PLAN 体检 ----------
// 引擎的加载清单里两样东西最容易腐烂，而且坏了都不会报错、只会"看起来怪"：
//   ① ?v=N 缓存版本号 —— 换素材后不加一，玩家浏览器继续吃旧图；
//   ② weight 权重 —— 它是进度条分母，不跟实际体积同步就会出现"在下大图、进度条不动"的假卡。
// 这里直接把 LOAD_PLAN 解析出来跟磁盘对账。
// ⚠ 扫描区间必须是「var LOAD_PLAN」到「var loadUI」整段，不能只抓 `var LOAD_PLAN = [...];`
//   那个数组字面量：后加的图集（地宫 / 外来地图）都是先 `var dmImg = {...}` 再
//   `LOAD_PLAN.push(dmImg, dmJson)`，字面量正则看不到它们。踩过：13 条清单只体检了 9 条，
//   还照样打印"通过"—— 越是漏检越会给出虚假的安全感。
const loadPlan = (() => {
  const txt = readIf(path.join(GAME, 'js/game.js'));
  const s = txt.indexOf('var LOAD_PLAN');
  if (s < 0) return null;
  const e = txt.indexOf('var loadUI', s);
  const region = txt.slice(s, e < 0 ? s + 4000 : e);
  const rows = [];
  const re = /\{\s*url:\s*'([^']+)'[^}]*?weight:\s*(\d+)/g;
  let x;
  while ((x = re.exec(region))) rows.push({ url: x[1], weight: +x[2] });
  return rows;
})();
const planIssues = [];
if (loadPlan) {
  for (const p of loadPlan) {
    const file = 'test/' + p.url.split('?')[0];
    let size = 0;
    try { size = fs.statSync(path.join(ROOT, file)).size; } catch (e) { planIssues.push(file + ' 不存在'); continue; }
    const kb = size / 1024;
    if (!/\?v=\d+/.test(p.url)) planIssues.push(file + ' 没有 ?v= 版本号（换素材后无法做缓存失效）');
    if (kb > 20 && Math.abs(p.weight - kb) / kb > 0.3) {
      planIssues.push(file + ' weight=' + p.weight + ' 但实际 ' + kb.toFixed(0) + 'KB（偏差 ' +
        Math.round(Math.abs(p.weight - kb) / kb * 100) + '%）');
    }
  }
}

// ---------- 报表 ----------
const out = [];
const P = (s) => { out.push(s); console.log(s); };

P('=== 一、代码引用的资源路径 ===');
const refRows = [];
for (const f of CODE) {
  const txt = readIf(path.join(ROOT, f));
  const re = /['"`]([A-Za-z0-9_\-./]+\.(?:png|jpg|jpeg|json|css|js))['"`]/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(txt))) seen.add(m[1]);
  refRows.push({ file: f, refs: [...seen].sort() });
}
for (const r of refRows) {
  P('  ' + r.file + '  → ' + r.refs.length + ' 个');
  r.refs.forEach((x) => P('      ' + x));
}

P('');
P('=== 二、运行时素材（test/assets + test/js + index.html，必须入库） ===');
const totalSize = runtime.reduce((a, f) => a + fs.statSync(path.join(ROOT, f)).size, 0);
P('  顶层文件 ' + runtime.length + ' 个，合计 ' + kb(totalSize));
dirStats.forEach((d) => P('  ' + d.dir.padEnd(24) + d.n + ' 个 / ' + kb(d.size)));
P('  未被 git 跟踪：顶层 ' + notTracked.length + ' 个 / 子目录 ' + notTrackedSub.length + ' 个');
if (notTracked.length) {
  notTracked.forEach((f) => P('      ' + f + (ignored.has(f) ? '   [被 .gitignore 忽略]' : '   [未加入索引]')));
} else {
  P('      顶层无遗漏 —— 引擎真正要加载的文件全部已入库，Pages 上不会缺图');
}
// 子目录按一级目录聚合：这些基本都是切片中间产物，逐个列没有意义
if (notTrackedSub.length) {
  const byDir = {};
  notTrackedSub.forEach((f) => { const d = f.split('/').slice(0, 3).join('/'); byDir[d] = (byDir[d] || 0) + 1; });
  P('      子目录（均为构建中间产物 / 旧版散图，不入库是对的）：');
  Object.keys(byDir).sort().forEach((d) => P('        ' + d.padEnd(26) + byDir[d] + ' 个'));
}

P('');
P('=== 三、引用了但磁盘上没有的文件 ===');
if (!missing.length) P('  无（引用全部命中）');
missing.forEach((m) => P('  ✗ ' + m.ref + '   出自 ' + m.where));
P('');
P('  （下列不是缺文件，是图集帧键名，已排除误报）');
atlasKeys.forEach((m) => P('  · ' + m.ref + '  → chars_atlas.json 里的帧键，出自 ' + m.where));

P('');
P('=== 四、素材包出处与授权 ===');
packs.forEach((p) => {
  P('  [' + p.kind + '] ' + String(p.id).padEnd(22) + ' ' + String(p.dir).padEnd(26) + ' 单位 ' + p.units.length + '  ' + (p.mode === 'frames' ? '(frames)' : ''));
  P('        授权：' + (p.license || '（登记表未写）'));
});
P('');
P('  sucai/ 下未接入登记表的目录：' + (unregistered.length ? unregistered.join('、') : '无'));

P('');
P('=== 五、LOAD_PLAN 体检（缓存版本号 / 进度权重）===');
if (!loadPlan) P('  没解析到 LOAD_PLAN');
else P('  清单 ' + loadPlan.length + ' 条');
if (loadPlan && !planIssues.length) P('  通过：都有版本号，权重与实际体积相符');
else planIssues.forEach((s) => P('  ! ' + s));

// ---------- 可选 Markdown ----------
const mdIdx = process.argv.indexOf('--md');
if (mdIdx > 0 && process.argv[mdIdx + 1]) {
  let md = '# 仙岛寻踪 · 素材引用清单\n\n';
  md += '> 由 `test/tools/asset_audit.js` 生成。三方对齐：**代码引用 × 磁盘存在 × git 跟踪**。\n\n';
  md += '## 一、代码引用的资源路径\n\n';
  for (const r of refRows) {
    md += '### `' + r.file + '`\n\n';
    r.refs.forEach((x) => { md += '- `' + x + '`\n'; });
    md += '\n';
  }
  md += '## 二、运行时素材（test/assets + test/js + index.html）\n\n';
  md += '顶层文件 ' + runtime.length + ' 个，合计 ' + kb(totalSize) + '。\n\n';
  md += '| 目录 | 文件数 | 体积 |\n|---|---|---|\n';
  dirStats.forEach((d) => { md += '| `' + d.dir + '` | ' + d.n + ' | ' + kb(d.size) + ' |\n'; });
  md += '\n未被 git 跟踪的运行时文件：' + notTracked.length + ' 个\n\n';
  md += '## 三、引用了但磁盘上没有的文件\n\n';
  md += missing.length ? missing.map((m) => '- ✗ `' + m.ref + '`（出自 ' + m.where + '）').join('\n') + '\n' : '无，引用全部命中。\n';
  md += '\n## 四、素材包出处与授权\n\n';
  md += '| 类型 | 登记 id | 本地来源目录 | 单位数 | 形态 | 授权 |\n|---|---|---|---|---|---|\n';
  packs.forEach((p) => {
    md += '| ' + p.kind + ' | `' + p.id + '` | `' + p.dir + '` | ' + p.units.length + ' | ' + p.mode + ' | ' + (p.license || '—') + ' |\n';
  });
  md += '\n`sucai/` 下未接入登记表的目录：' + (unregistered.join('、') || '无') + '\n';
  fs.writeFileSync(process.argv[mdIdx + 1], md, 'utf8');
  console.log('\nMarkdown 已写入 ' + process.argv[mdIdx + 1]);
}
