'use strict';
/* =========================================================
 * test/smoke_ui_modes.js —— 界面模式开关（封面 ↔ 戏内）无头测试
 *
 * 背景（真实 bug）：目标横幅 #goal-banner 是 #game-container 的直接子块，
 * 却没登记在"只在戏内显示"的名单里。结果封面阶段它带着上一世的内容残留，
 * 在 html/body height:100% + overflow:hidden 的布局下挤掉出身面板高度，
 * 把"就 此 踏 入 修 仙 界"按钮顶出可视区。
 *
 * 本测试锁死两条约定：
 *   ① 切到封面时，所有 PLAY_ONLY 容器必须隐藏、出身面板必须显示（反之亦然）
 *   ② index.html 里 #game-container 的每个直接子块（除 topbar）都必须被这份开关覆盖
 *      —— 以后新增顶层容器时若不登记，这条测试会直接报错
 * 运行： node test/smoke_ui_modes.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.resolve(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function assert(name, cond) {
    if (cond) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

/* ---------- 极简 DOM 桩：只为验证 display 开关，不渲染 ---------- */
function El(id) {
    this.id = id; this.style = {}; this.children = [];
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    this.dataset = {}; this.scrollTop = 0; this._html = '';
}
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.removeChild = function () {};
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function () {};
El.prototype.querySelector = function () { return new El('q'); };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.remove = function () {};
El.prototype.focus = function () {};
Object.defineProperty(El.prototype, 'innerHTML', {
    get() { return this._html; }, set(v) { this._html = String(v); this.children = []; }
});
Object.defineProperty(El.prototype, 'innerText', {
    get() { return this._text || ''; }, set(v) { this._text = String(v); }
});

const els = {};
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.confirm = function () { return true; };
sandbox.alert = function () {};
sandbox.setTimeout = function () { return 0; };
sandbox.clearTimeout = function () {};
sandbox.setInterval = function () { return 0; };
sandbox.document = {
    getElementById: function (id) { return els[id] || (els[id] = new El(id)); },
    createElement: function (t) { return new El(t || 'div'); },
    querySelector: function () { return new El('q'); },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
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

/* ---------- 载入游戏代码（与既有冒烟测试同序） ---------- */
const FILES = [
    'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills.js',
    'data/skills_foundation.js', 'data/items_foundation.js',
    'data/events.js', 'data/world.js', 'data/worldmap.js', 'data/content.js',
    'data/qixuan_events.js', 'data/demon_war_events.js', 'data/dungeon_heisha.js', 'data/wild_dungeons.js',
    'js/state.js', 'js/storage.js', 'js/combat.js', 'js/core.js', 'js/market.js', 'js/map.js',
    'js/sect.js', 'js/puppet.js', 'js/insect.js', 'js/cave2.js',
    'js/cultivation.js', 'js/alchemy.js', 'js/bottle.js', 'js/bonds.js',
    'js/dungeon_heisha.js', 'js/hunt.js', 'js/goals.js', 'js/review.js',
    'js/blackmarket.js', 'js/codex.js', 'js/home.js',
    'js/moments.js', 'js/tips.js', 'js/ui.js'
];
// ui.js 自带 UI 桩会覆盖我们注入的 GAME.UI，先不注入，直接跑 ui.js 的入口
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;
const U = G.UI;

section('① 模式开关：封面 ↔ 戏内');
assert('setPlayMode 存在', typeof U.setPlayMode === 'function');
assert('PLAY_ONLY 已登记目标横幅', (U.PLAY_ONLY || []).indexOf('goal-banner') >= 0);

const d = (id) => (els[id] ? (els[id].style.display === undefined ? '' : els[id].style.display) : '(missing)');

U.started = false;
U.setPlayMode(false);
assert('封面：出身面板可见', d('origin-panel') !== 'none');
assert('封面：角色面板隐藏', d('main-panel') === 'none');
assert('封面：工作区隐藏', d('workspace') === 'none');
assert('封面：目标横幅隐藏（本次 bug 根因）', d('goal-banner') === 'none');

U.started = true;
U.setPlayMode(true);
assert('戏内：出身面板隐藏', d('origin-panel') === 'none');
assert('戏内：角色面板可见', d('main-panel') === 'block');
assert('戏内：工作区还原为 grid（否则两栏塌陷）', d('workspace') === 'grid');
assert('戏内：目标横幅交回 CSS（不能被压成 block）', d('goal-banner') === '');

section('② 兜底：未开局时目标横幅一律不渲染');
U.started = false;
U.setPlayMode(true);            // 即便有人把它显示了
U.renderGoal();
assert('未开局 → renderGoal 强制隐藏横幅', d('goal-banner') === 'none');

U.started = true;
U.setPlayMode(true);
U.renderGoal();
assert('开局后 → 横幅按 Goals 结果决定（有目标则显示）', d('goal-banner') !== 'none');

section('③ 契约：#game-container 顶层容器必须全部登记');
const html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');
function topLevelChildren(h) {
    const at = h.indexOf('id="game-container"');
    if (at < 0) return [];
    const re = /<(\/?)div\b[^>]*>/g;
    re.lastIndex = h.indexOf('>', at) + 1;
    let depth = 0, m, out = [];
    while ((m = re.exec(h))) {
        if (m[1] === '/') { depth--; if (depth < 0) break; continue; }
        if (depth === 0) { const idm = /id="([^"]+)"/.exec(m[0]); out.push(idm ? idm[1] : '(no-id)'); }
        depth++;
    }
    return out;
}
const tops = topLevelChildren(html);
assert('解析到顶层容器：' + tops.join(' / '), tops.length >= 4);
const covered = ['origin-panel'].concat(U.PLAY_ONLY || []);
const orphan = tops.filter((id) => id !== 'topbar' && covered.indexOf(id) < 0 && id !== '(no-id)');
assert('无游离顶层容器（未登记的会被这里拦下）：' + (orphan.join(',') || '无'), orphan.length === 0);

section('④ show() 的 display 语义');
U.show('goal-banner', true, '');
assert('show(id,true,"") → 交回 CSS', d('goal-banner') === '');
U.show('goal-banner', true);
assert('show(id,true) → 默认 block', d('goal-banner') === 'block');
U.show('goal-banner', false);
assert('show(id,false) → none', d('goal-banner') === 'none');

console.log('\n' + '='.repeat(52));
console.log('结果： ' + pass + ' / ' + (pass + fail) + ' 通过' + (fail ? '，失败 ' + fail + ' 项：' + fails.join('；') : ''));
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
