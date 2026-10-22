'use strict';
/* =========================================================
 * test/smoke_chronicle.js —— 见闻录文本池回归测试
 *   ① 文本池结构完整：每个 tag 非空、元素均为非空字符串
 *   ② 抽样不越界：连续抽样返回的文本必属本池（跨池污染是红线）
 *   ③ 同 tag 不重复：一轮之内不抽到同一条；抽完一轮后重开仍在本池
 *   ④ remaining() 随抽样递减，池空后归零
 *   ⑤ narrate 经 UI.log 写入见闻录（文本出口唯一）
 *   ⑥ 未知 tag 静默返回 null（调用方须容错）
 * 运行： node test/smoke_chronicle.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
};

const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return 0.5; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/items.js',
  'js/state.js', 'js/chronicle.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

const TAGS = ['jiedan_reached', 'xinghai_arrival', 'modao_join', 'hunt_issued',
  'ti_path_chosen', 'seize_repelled', 'huanchen_island', 'formation_secluded'];

section('【1】文本池结构');
ok('GAME.DATA.CHRONICLE 存在', !!(G.DATA && G.DATA.CHRONICLE));
ok('GAME.Chronicle 模块存在', !!(G.Chronicle && G.Chronicle.surface && G.Chronicle.narrate));
let allStructOk = true, tagCount = 0;
TAGS.forEach(function (t) {
  const list = G.DATA.CHRONICLE[t];
  if (!list || !list.length) { allStructOk = false; console.log('    缺池: ' + t); return; }
  tagCount++;
  list.forEach(function (s) {
    if (typeof s !== 'string' || !s.length) { allStructOk = false; console.log('    空条目: ' + t); }
  });
});
ok('八个 tag 池齐全且条目非空', allStructOk && tagCount === TAGS.length);

section('【2】抽样不越界（红线：不得串池）');
const p = { realmIndex: 18 };
let crossPool = false;
for (let i = 0; i < 200; i++) {
  const t = TAGS[i % TAGS.length];
  const txt = G.Chronicle.surface(t, p);
  if (!txt || G.DATA.CHRONICLE[t].indexOf(txt) < 0) { crossPool = false; break; }
  crossPool = true;
}
ok('200 次抽样全部落在本池内', crossPool);

section('【3】同 tag 一轮不重复 / 池空后重开');
const p2 = { realmIndex: 18 };
const pool = G.DATA.CHRONICLE.jiedan_reached;
const firstRound = [];
for (let i = 0; i < pool.length; i++) firstRound.push(G.Chronicle.surface('jiedan_reached', p2));
const uniq = {};
firstRound.forEach(function (x) { uniq[x] = true; });
ok('一轮抽样条数 = 池大小', firstRound.length === pool.length);
ok('一轮之内无重复条目', Object.keys(uniq).length === pool.length);
const afterRound = G.Chronicle.surface('jiedan_reached', p2);
ok('池抽完后再抽仍在池内', !!afterRound && pool.indexOf(afterRound) >= 0);

section('【4】remaining 递减');
const p3 = { realmIndex: 18 };
const r0 = G.Chronicle.remaining('seize_repelled', p3);
G.Chronicle.surface('seize_repelled', p3);
const r1 = G.Chronicle.remaining('seize_repelled', p3);
ok('remaining 抽样后递减', r1 === r0 - 1);
ok('remaining 初始 = 池大小', r0 === G.DATA.CHRONICLE.seize_repelled.length);

section('【5】narrate 写入见闻录（UI.log 为唯一文本出口）');
const p4 = { realmIndex: 18 };
logs.length = 0;
const out = G.Chronicle.narrate('xinghai_arrival', p4);
ok('narrate 返回文本', typeof out === 'string' && out.length > 0);
ok('narrate 确实写入 UI.log', logs.length === 1 && logs[0] === out);

section('【6】未知 tag 静默容错');
ok('surface 未知 tag 返回 null', G.Chronicle.surface('no_such_tag', p) === null);
logs.length = 0;
ok('narrate 未知 tag 返回 null', G.Chronicle.narrate('no_such_tag', p) === null);
ok('narrate 未知 tag 不写日志', logs.length === 0);
ok('pool 未知 tag 返回 null', G.Chronicle.pool('no_such_tag') === null);

console.log('\n=== 结果: ' + pass + ' passed, ' + fail + ' failed ===');
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
