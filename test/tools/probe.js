// 无头探针：跑一个页面 + 查询串，把 #probe / #dbg 的 JSON 打出来。
//
//   node test/tools/probe.js "map=lingquan&autotest=bestiary"
//   node test/tools/probe.js "map=lingquan&touch=1" --raw        # 只看 body class / 不解析 JSON
//   node test/tools/probe.js "map=lingquan&autotest=bestiary" --keys=leash,zombieHit
//
// 为什么要有这个脚本：桌面 Chrome 的 pointer:coarse 恒为假、磁盘缓存又会把改过的
// JSON 换回上一版，直接手敲 chrome 命令行很容易拿到"看起来是 bug 的假失败"。
// 这里统一：每次全新 profile + 禁缓存 + 解析失败时把原始 DOM 片段打出来。
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:8331/test/index.html';

const argv = process.argv.slice(2);
const query = argv.find((a) => !a.startsWith('--')) || 'map=lingquan';
const raw = argv.includes('--raw');
const keysArg = argv.find((a) => a.startsWith('--keys='));
const size = (argv.find((a) => a.startsWith('--size=')) || '--size=1280,800').slice(7);
const budget = (argv.find((a) => a.startsWith('--budget=')) || '--budget=20000').slice(9);

const uDir = path.join(os.tmpdir(), 'wb_probe_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
const out = path.join(os.tmpdir(), 'wb_probe_dom_' + Date.now() + '.html');

try {
  execFileSync(
    CHROME,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      // file:// 打开时必须给这个权限，否则 assets/*.json 一律加载失败，
      // 页面永远停在「加载中」——症状就是 #probe/#dbg 都没有，DOM 长度固定 14129。
      '--allow-file-access-from-files',
      '--no-first-run', '--no-default-browser-check', '--disk-cache-size=1',
      '--user-data-dir=' + uDir, '--virtual-time-budget=' + budget,
      '--window-size=' + size, '--dump-dom', BASE + '?' + query],
    { stdio: ['ignore', fs.openSync(out, 'w'), 'ignore'] }
  );
} catch (e) {
  console.log('chrome 调用失败:', e.message);
}

const dom = fs.readFileSync(out, 'utf8');
try { fs.rmSync(uDir, { recursive: true, force: true }); } catch (e) { /* 偶尔被占用，无所谓 */ }
try { fs.rmSync(out, { force: true }); } catch (e) { /* ignore */ }

function pick(id) {
  const m = dom.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</div>'));
  return m ? m[1] : null;
}
function unesc(s) {
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

const bodyClass = (dom.match(/<body[^>]*class="([^"]*)"/) || [, ''])[1];
console.log('body.class =', JSON.stringify(bodyClass));

if (raw) process.exit(0);

const probe = pick('probe');
const dbg = pick('dbg');
if (!probe && !dbg) {
  console.log('没有 #probe / #dbg。DOM 长度', dom.length);
  console.log(dom.slice(0, 600));
  process.exit(1);
}

const src = probe || dbg;
let parsed = null;
try { parsed = JSON.parse(unesc(src)); } catch (e) {
  console.log('JSON 解析失败，原始片段：');
  console.log(unesc(src).slice(0, 2500));
  process.exit(1);
}

if (keysArg) {
  keysArg.slice(7).split(',').forEach((k) => console.log(k + ':', JSON.stringify(parsed[k])));
} else {
  console.log(JSON.stringify(parsed, null, 1));
}
