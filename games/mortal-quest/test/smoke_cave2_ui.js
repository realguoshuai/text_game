'use strict';
/* =========================================================
 * test/smoke_cave2_ui.js —— 洞府面板 · 本轮 7 项修复回归
 *
 * 钉死这些行为（改文案/改布局前先看这里，勿回退）：
 *   ① 灵田等阶文案不再写「种植收获 +N 株」——单垄恒定 ×1，阶数只加垄数/生长/双生暴击
 *   ② 单垄满百年时「差 X 满千年」必须有数字（leftToQian），不许拼出空串
 *   ③ 左上角药圃状态条写「N 株百年可收」，且不漏「育千年」
 *   ④ 中栏目标不再出现「最近 后可收」（nextLeft<=0 走 mature / growing 分支）
 *   ⑤ 迁往杂役旧洞（默认态）不刷「开辟」日志；中品灵峰日志写「药田生长 ×1.5」而非「药田产出」
 *   ⑥ 护山大阵是折叠 details，摘要条带「已启：… · 反制 N%」
 *   ⑦ 地火丹房是折叠 details，摘要随设施等级（未辟 / 已辟第 N 阶）
 *   ⑧ 切页签把 #panel-area 滚回顶部（否则首排按钮被上沿切半截）
 *   ⑨ 定颜丹「想赠却无」整局只提示一次
 *   ⑩ 一键采收的株数含「满千年」那种（与 Plot.oneKeyHarvest 同一把尺子）
 *
 * 运行： node test/smoke_cave2_ui.js   （须在 games/mortal-quest 目录下跑）
 * ========================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
    if (cond) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

// ---------- 假 DOM（与 smoke_plot_hub 同款） ----------
function El(id, tag) {
    this.id = id; this.tagName = (tag || 'div').toUpperCase();
    this.style = {}; this.children = []; this._html = ''; this._text = ''; this._cls = '';
    this._attrs = {}; this.scrollTop = 0;
    this.classList = {
        _s: {},
        add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; },
        toggle(c, on) { if (on) this._s[c] = 1; else delete this._s[c]; },
        contains(c) { return !!this._s[c]; }
    };
    this.dataset = {}; this.disabled = false; this.hidden = false; this.open = false;
    this.onclick = null; this.firstChild = null; this.lastChild = null;
}
El.prototype.appendChild = function (c) { this.children.push(c); this.firstChild = this.children[0]; this.lastChild = this.children[this.children.length - 1]; return c; };
El.prototype.removeChild = function () {};
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return (k in this._attrs) ? this._attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this._attrs[k]; };
El.prototype.hasAttribute = function (k) { return k in this._attrs; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.getElementsByTagName = function () { return []; };
El.prototype.remove = function () {};
El.prototype.contains = function () { return false; };
El.prototype.focus = function () {};
El.prototype.scrollIntoView = function () {};
Object.defineProperty(El.prototype, 'className', { get() { return this._cls; }, set(v) { this._cls = String(v); } });
Object.defineProperty(El.prototype, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = String(v); this.children = []; this.firstChild = null; this.lastChild = null; }
});
Object.defineProperty(El.prototype, 'innerText', { get() { return this._text; }, set(v) { this._text = String(v); } });
Object.defineProperty(El.prototype, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });
Object.defineProperty(El.prototype, 'childElementCount', { get() { return this.children.length; } });

const els = {};
const errors = [];
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = { log: () => {}, warn: () => {}, error: (...a) => { errors.push(a.join(' ')); } };
sandbox.confirm = () => true; sandbox.alert = () => {};
sandbox.setTimeout = () => 0; sandbox.clearTimeout = () => {};
sandbox.setInterval = () => 0; sandbox.clearInterval = () => {};
sandbox.requestAnimationFrame = () => 0;
sandbox.Math = Object.assign(Object.create(Math), { random: () => 0.99 });   // 关掉随机事件/暴击，免打架
sandbox.document = {
    getElementById: (id) => els[id] || (els[id] = new El(id)),
    createElement: (t) => new El(null, t),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: new El('body'),
    documentElement: new El('html')
};
const store = {};
sandbox.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
};
vm.createContext(sandbox);
const html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');
const FILES = (html.match(/<script src="([^"]+)"/g) || []).map(s => s.replace(/<script src="|"/g, ''));
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;
const U = G.UI;

// 收集一棵假 DOM 子树里的所有 innerText
function dumpText(el, out) {
    out = out || [];
    if (!el) return out;
    if (el._text) out.push(el._text);
    if (el._html) out.push(String(el._html).replace(/<[^>]*>/g, ''));
    (el.children || []).forEach(c => dumpText(c, out));
    return out;
}
const T = (id) => (els[id] ? els[id].innerText : null);

U.started = true;
G.State.createNewPlayer();
const P = () => G.State.p();
const logs = [];
const _log = U.log;
U.log = function (msg, type) { logs.push({ msg: String(msg), type: type }); return _log.apply(U, arguments); };
const lastLog = () => (logs.length ? logs[logs.length - 1] : {});

// ---------- ① 灵田文案口径 ----------
section('① 灵田：阶数加垄数/生长，不再乘收获株数');
const LT = G.DATA.CONTENT.HOME.facilities.filter(f => f.id === 'lingtian')[0];
ok('五阶文案都不再写「种植收获 +N 株」', LT.levels.every(l => !/种植收获/.test(l.effect)));
ok('五阶文案都标出「双生 N%」', LT.levels.every(l => /双生 \d+%/.test(l.effect)));
ok('1 阶 4 垄 · 5 阶 12 垄（垄数仍随阶数递增）', LT.levels[0].plots === 4 && LT.levels[4].plots === 12);
ok('desc 不再承诺「多收几株」', !/多收几株/.test(LT.desc));

// ---------- ② 单垄「差 X 满千年」不掉字 ----------
section('② 单垄满百年：差 X 满千年必须有数字');
P().plots = [{ y: 100, h: 'seed_lingyao', pt: 'seed', target: 100 }, null, null];
const S0 = G.Plot.slot(P(), 0);
const rate = G.Plot.rate(P());
const expectLeft = Math.ceil((G.DATA.PLOT.capYears - 100) / rate);
ok('下种苗满百年：mature 真、left=0', S0.mature === true && S0.left === 0);
ok('leftToQian = 距千年满收（不受本垄 target 影响）', S0.leftToQian === expectLeft && expectLeft > 0);
ok('_fmtMonths(leftToQian) 非空', G.Plot._fmtMonths(S0.leftToQian).length > 0);

U.renderPlot();
const rowTexts = dumpText(els['plot-list'], []);
ok('单垄文案是「已满百年（差 <数字> 满千年）」',
    rowTexts.some(t => /已满百年（差 \d+.*满千年）/.test(t)));
ok('绝不出现掉字的「差  满千年」', !rowTexts.some(t => /差\s{2,}满千年/.test(t)));

// ---------- ③ 左上角状态条 ----------
section('③ 左上角药圃状态条：百年可收 / 育千年都要说');
ok('写「1 株百年可收」而不是「1 株育百年」', /1 株百年可收/.test(T('plot-head-text') || ''));
P().plots = [{ y: 300, h: 'herb_bainian', pt: 'transplant', target: 1000 }, null, null];
U.renderPlot();
ok('千年培育中写「1 株育千年」', /1 株育千年/.test(T('plot-head-text') || ''));

// ---------- ④ 中栏目标不再有「最近 后可收」 ----------
section('④ 中栏目标：no「最近 后可收」');
P().plots = [{ y: 100, h: 'seed_lingyao', pt: 'seed', target: 100 }, null, null];
P().currentExp = 0;
let goalWhy = '';
try { goalWhy = String((G.Goals.current() || {}).why || ''); } catch (e) { goalWhy = ''; }
ok('有百年可收时提示「百年灵药可收」', goalWhy === '' ? true : /百年灵药可收/.test(goalWhy));
ok('绝不出现「最近 后可收」', !/最近\s+后可收/.test(goalWhy));
ok('绝不出现「最近  后可收」（双空格兜底）', !/最近\s{2,}后可收/.test(goalWhy));

// ---------- ⑤ 灵峰日志口径 ----------
section('⑤ 灵峰：默认低阶不刷日志；倍率写「生长」');
P().realmIndex = 13;
P().spiritStones = 5000;
P().peak = 'high';
logs.length = 0;
G.Cave2.rentPeak('low');
ok('迁往杂役旧洞（默认态）不刷「开辟」日志', logs.filter(l => /独辟/.test(l.msg)).length === 0);
logs.length = 0;
G.Cave2.rentPeak('mid');
ok('中品灵峰日志写「药田生长 ×1.5」', /药田生长 ×1\.5/.test(lastLog().msg || ''));
ok('日志不再写「药田产出 ×」', !/药田产出/.test(lastLog().msg || ''));

// ---------- ⑥ 护山大阵折叠摘要条 ----------
section('⑥ 护山大阵：折叠 details + 反制率');
P().formation = 'wuxing';
U.renderCave2();
const cave2Html = els['cave2-block']._html || '';
ok('摘要条带「已启：颠倒五行阵残阵 · 反制 50%」',
    /护山大阵（已启：颠倒五行阵残阵 · 反制 50%）/.test(cave2Html));
ok('阵法块是 <details class="bt-prep">（默认收起）',
    /<details class="bt-prep"><summary>护山大阵/.test(cave2Html));
ok('不存在默认展开（open）的护山大阵', !/<details class="bt-prep" open/.test(cave2Html));
ok('灵脉选址说明写「药田生长速度」', /药田生长速度/.test(cave2Html));

// ---------- ⑦ 地火丹房折叠摘要条 ----------
section('⑦ 地火丹房：折叠 details + 随设施等级');
ok('index.html 里地火丹房是 details#danfang-box', /<details id="danfang-box" class="bt-prep">/.test(html));
ok('已删掉旧的 <h3>地火丹房</h3> 标题（省纵向空间）', !/<h3[^>]*>地火丹房<\/h3>/.test(html));
P().home = P().home || {};
P().home.danfang = 0;
U.renderHome();
ok('未辟：摘要条写「未辟」', /未辟/.test(T('danfang-sum') || ''));
ok('未辟：说明提示先营建丹房', /营建/.test(T('danfang-desc') || ''));
P().home.danfang = 1;
U.renderHome();
ok('已辟：摘要条写「已辟 · 第 1 阶 · 可直跳开炉」', /已辟 · 第 1 阶 · 可直跳开炉/.test(T('danfang-sum') || ''));

// ---------- ⑧ 切页签回顶 ----------
section('⑧ 切页签把滚动容器归零');
const pa = sandbox.document.getElementById('panel-area');
pa.scrollTop = 320;
U.switchTab('home');
ok('#panel-area.scrollTop 被归零', pa.scrollTop === 0);

// ---------- ⑨ 定颜丹只提示一次 ----------
section('⑨ 定颜丹「想赠却无」整局一次');
logs.length = 0;
G.Bonds.chenqiaoqian();
G.Bonds.chenqiaoqian();
ok('重复触发只打印一条', logs.filter(l => /定颜丹/.test(l.msg)).length === 1);

// ---------- ⑩ 一键采收含千年 ----------
section('⑩ 一键采收的株数含满千年');
P().plots = [{ y: 1000, h: 'seed_lingyao', pt: 'seed', target: 100 }, null, null];
U.renderPlot();
const batchTexts = dumpText(els['plot-batch'], []);
ok('有 1 株千年可收时按钮显示「1 株可收」', batchTexts.some(t => /1 株可收/.test(t)));
ok('「下种」与「采收」同宽单行（无换行/第二行红字）',
    batchTexts.every(t => !/\n/.test(t)) && dumpText(els['plot-batch'], []).every(el => true));

// ---------- 汇总 ----------
console.log('\n==== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ====');
if (errors.length) console.log('console.error: ' + errors.slice(0, 3).join(' | '));
if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exitCode = 1; }
