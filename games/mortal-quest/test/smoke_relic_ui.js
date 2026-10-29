'use strict';
/* =========================================================
 * test/smoke_relic_ui.js —— 古修遗迹·探宝：紧急卡 / 游历互斥 / 置灰短句 回归
 *
 * 钉死三件事（都是玩家实测踩过的坑）：
 *   ① 探索中必须有可点的紧急卡（继续深入 / 见好就收·强行脱离）——
 *      旧版只有「（探索中——请从紧急面板继续）」一行字，而遗迹压根没有那个面板 → 进去即卡死
 *   ② 深处时「秘境游历」严禁耗月刷奇遇，且给一句明确拒绝（判据 State.dungeonName）
 *   ③ 秘境里中栏按钮的置灰短句必须按语义分开：历练≠闭关、坊市≠闭关、门派≠闭关
 *
 * 运行： node test/smoke_relic_ui.js   （须在 games/mortal-quest 目录下跑）
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
    this._attrs = {}; this.scrollTop = 0; this.parentNode = null;
    this.classList = {
        _s: {},
        add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; },
        toggle(c, on) { if (on) this._s[c] = 1; else delete this._s[c]; },
        contains(c) { return !!this._s[c]; }
    };
    this.dataset = {}; this.disabled = false; this.hidden = false; this.open = false;
    this.onclick = null; this.firstChild = null; this.lastChild = null;
}
El.prototype.appendChild = function (c) {
    c.parentNode = this;
    this.children.push(c); this.firstChild = this.children[0]; this.lastChild = this.children[this.children.length - 1]; return c;
};
El.prototype.removeChild = function (c) { this.children = this.children.filter(x => x !== c); };
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
sandbox.Math = Object.assign(Object.create(Math), { random: () => 0.05 });   // 低值：抽第一个事件/第一项掉落
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

function dumpText(el, out) {
    out = out || [];
    if (!el) return out;
    if (el._text) out.push(String(el._text));
    if (el._html) out.push(String(el._html).replace(/<[^>]*>/g, ''));
    (el.children || []).forEach(c => dumpText(c, out));
    return out;
}
function findById(el, id) {
    if (!el) return null;
    if (el.id === id) return el;
    for (const c of (el.children || [])) { const f = findById(c, id); if (f) return f; }
    return null;
}
const attr = (id) => (els[id] ? els[id].getAttribute('data-why') : null);

U.started = true;
G.State.createNewPlayer();
const P = () => G.State.p();
const logs = [];
const _log = U.log;
U.log = function (msg, type) { logs.push({ msg: String(msg), type: type }); return _log.apply(U, arguments); };
const hasLog = (re) => logs.some(l => re.test(l.msg));

// ---------- ① 探索中：整块切换为「多步探索面板」 ----------
section('① 探索中：多步探索面板（顶栏进度 / 中部遭遇 / 底部双按钮）');
P().realmIndex = 13;
P().relic = { stepsLeft: 12, active: true };
U.renderRelicCard();
const cardText = dumpText(els['relic-card'], []).join(' ');
ok('面板有内容（不再是空白/仅一行提示）', cardText.length > 20);
ok('顶栏写「古修遗迹 · 第 0 / 12 层」', /古修遗迹 · 第 0 \/ 12 层/.test(cardText));
ok('中部默认遭遇写「已深入古修遗迹第 1 层」并报剩余步数', /已深入古修遗迹第 1 层/.test(cardText) && /尚余 12 步/.test(cardText));
const bGo = findById(els['relic-card'], 'btn-relic-go');
const bFlee = findById(els['relic-card'], 'btn-relic-flee');
ok('有【继续深入秘境】按钮', !!bGo && /继续深入秘境/.test(bGo.innerText));
ok('有【见好就收 · 退出】按钮', !!bFlee && /见好就收/.test(bFlee.innerText));
ok('两个按钮都绑了 onclick', !!bGo.onclick && !!bFlee.onclick);
const bEsc = findById(els['relic-card'], 'btn-relic-escape');
ok('右上角保底【脱身】键存在', !!bEsc && /脱身/.test(bEsc.innerText));

// ---------- ② 继续深入：走一步并刷新面板 ----------
section('② 继续深入：走一步、扣一步、刷新进度与遭遇');
logs.length = 0;
const before = P().relic.stepsLeft;
bGo.onclick();
ok('步数由 ' + before + ' 减到 ' + P().relic.stepsLeft, P().relic.stepsLeft === before - 1);
ok('见闻录写了「第 1 步」', hasLog(/第 1 步/));
U.renderRelicCard();
ok('顶栏进度跟着走到「古修遗迹 · 第 1 / 12 层」', /古修遗迹 · 第 1 \/ 12 层/.test(dumpText(els['relic-card'], []).join(' ')));
ok('中部遭遇更新为「第 1 步」描述', /第 1 步/.test(dumpText(els['relic-card'], []).join(' ')));

// ---------- ③ 见好就收：清状态、解锁；整块干净切回列表 ----------
section('③ 见好就收：清状态位 → 页签/8 宫格解锁；面板整体收起、列表恢复');
logs.length = 0;
const fled = bFlee.onclick();
ok('flee 后 p.relic 为空', !P().relic);
ok('State.inDungeon 现算为假（页签锁与宫格置灰随之解除）', G.State.inDungeon(P()) === false);
ok('见闻录写「循原路退出古修遗迹」并报表步数', hasLog(/循原路退出古修遗迹.*深入 1 步/));
U.renderRelicCard();
ok('脱离后 #relic-card 整体清空（不再残留红框/面板）', els['relic-card'].innerHTML === '');
ok('脱离后 #secret-list-area 恢复可见（干净切回列表）', els['secret-list-area'] && els['secret-list-area'].style.display !== 'none');
ok('脱离后 #secret-title 恢复可见', els['secret-title'] && els['secret-title'].style.display !== 'none');
ok('非探索态点保底键：清悬空路由、返回 true', (function(){
    P().combatRoute = { type: 'relic' };
    var r = G.Relic.forceReset();
    return r === true && !P().relic && !(P().combatRoute && P().combatRoute.type === 'relic');
})());

// ---------- ④ 深处时「秘境游历」互斥 ----------
section('④ 秘境游历：深处一律拦下（含时间不推进）');
P().relic = { stepsLeft: 8, active: true };
const t0 = P().totalMonths;
logs.length = 0;
G.Secret.roam();
ok('深处点游历不耗月', P().totalMonths === t0);
ok('提示「身处古修遗迹深处，正与凶兽/禁制对峙，无法分心在外围游历！」',
    hasLog(/身处古修遗迹深处，正与凶兽\/禁制对峙，无法分心在外围游历！/));
ok('深处时没有产生任何游历奇遇日志', !hasLog(/【秘境游历】/));

// ---------- ⑤ 脱离后游历恢复 ----------
section('⑤ 脱离后：游历恢复正常');
G.Relic.flee();
const t1 = P().totalMonths;
logs.length = 0;
G.Secret.roam();
ok('游历耗 1 月（时间推进）', P().totalMonths === t1 + 1);
ok('产生了一条【秘境游历】见闻', hasLog(/【秘境游历】/));

// ---------- ⑥ 探索中列表整体让位 ----------
section('⑥ 秘境列表：探索中整体让位给面板（列表清空，不再显示旧状态行）');
P().relic = { stepsLeft: 12, active: true };
U.tab = 'secret';
U.renderSecret();
ok('探索中 renderSecret 直接清空 #secret-list（列表让位）', dumpText(els['secret-list'], []).join(' ').length === 0);
U.renderRelicCard();
ok('探索中 #secret-list-area 被隐藏', els['secret-list-area'] && els['secret-list-area'].style.display === 'none');
ok('探索中 #secret-title 被隐藏（整块切为面板）', els['secret-title'] && els['secret-title'].style.display === 'none');
ok('探索中面板顶栏写「古修遗迹 · 第 0 / 12 层」', /古修遗迹 · 第 0 \/ 12 层/.test(dumpText(els['relic-card'], []).join(' ')));
// 脱离后干净切回列表
G.Relic.flee();
U.renderSecret();
U.renderRelicCard();
ok('脱离后 #secret-list-area 恢复可见', els['secret-list-area'].style.display !== 'none');
ok('脱离后 #secret-title 恢复可见', els['secret-title'].style.display !== 'none');
ok('脱离后 #relic-card 清空（面板不再残留）', els['relic-card'].innerHTML === '');

// ---------- ⑦ 中栏置灰短句按语义分开 ----------
section('⑦ 中栏短句：历练≠闭关、坊市≠闭关');
P().relic = { stepsLeft: 8, active: true };   // 身处古修遗迹深处 → 中栏常规操作应被语义化锁起
P().combat = null;
U.updateUI();
ok('打坐键 = 秘境之中，无从闭关', attr('btn-meditate') === '秘境之中，无从闭关');
ok('历练键 = 秘境之中，无从历练', attr('btn-explore') === '秘境之中，无从历练');
ok('突破键 = 秘境之中，无从破境', attr('btn-breakthrough') === '秘境之中，无从破境');
ok('坊市键 = 秘境之中，无从入市', attr('btn-market') === '秘境之中，无从入市');
ok('历练键不再被贴上「无从闭关」', !/无从闭关/.test(attr('btn-explore') || ''));
ok('坊市键不再被贴上「无从闭关」', !/无从闭关/.test(attr('btn-market') || ''));
ok('突破键不再被贴上「无从闭关」', !/无从闭关/.test(attr('btn-breakthrough') || ''));
ok('门派键 = 秘境之中，无从回宗', attr('btn-sect') === '秘境之中，无从回宗');

// ---------- ⑧ 读档停在别页 / 斗法中 的兜底 ----------
section('⑧ 兜底：停错页强制回秘境；斗法中不许抽身');
P().tab = undefined;
U.tab = 'map';
P().relic = { stepsLeft: 5, active: true };
U.applyPanels();
ok('有 p.relic 时强制落到秘境页（避免读档后看不到出口卡）', U.tab === 'secret');
P().combat = { foe: 'relic_wraith' };   // 残魂战进行中
U.renderRelicCard();
const bFlee2 = findById(els['relic-card'], 'btn-relic-flee');
ok('斗法中【见好就收】置灰', !!bFlee2 && bFlee2.disabled === true);
ok('斗法中给的是「先分出胜负或施展遁术」', /先分出胜负或施展遁术/.test(bFlee2.title || ''));
const bEsc2 = findById(els['relic-card'], 'btn-relic-escape');
ok('斗法中保底键同样置灰（避免斗法中清掉 relic 却仍在打架）', !!bEsc2 && bEsc2.disabled === true);
P().combat = null;
U.renderRelicCard();
const bEsc3 = findById(els['relic-card'], 'btn-relic-escape');
ok('脱战后台底键恢复可点', !!bEsc3 && bEsc3.disabled === false);
P().relic = null;

// ---------- ⑨ 根因修复：探索中不再误判「休整中」，状态互斥 ----------
section('⑨ 状态互斥：探索中 cdLeft==0（不误判休整）；离场后才起算休整');
logs.length = 0;
P().realmIndex = 13;
P().relic = null;
G.State.setCd('relic', 0);            // 清掉冷却，确保可进入
P().relic = { stepsLeft: 12, active: true };
ok('探索中 State.cdLeft("relic") === 0（不会误显示【休整中】）', G.State.cdLeft('relic') === 0);
ok('探索中 dungeonName === "古修遗迹" 且 inDungeon 为真（全场锁定合理）',
    G.State.dungeonName(P()) === '古修遗迹' && G.State.inDungeon(P()) === true);
U.tab = 'secret';
U.renderRelicCard();
const card9 = dumpText(els['relic-card'], []).join(' ');
ok('探索中面板写「古修遗迹 · 第 0 / 12 层」且不含「休整中」', /古修遗迹 · 第 0 \/ 12 层/.test(card9) && !/休整中/.test(card9));
// 走完 12 步脱离 → 起算休整
G.Relic.exit();
ok('离场后 p.relic 为空', !P().relic);
ok('离场后 State.cdLeft("relic") === 4（休整 4 月才起算）', G.State.cdLeft('relic') === 4);
ok('离场后 inDungeon 为假（修行/身家/宗门/历练全解锁）', G.State.inDungeon(P()) === false);
U.renderSecret();
const list9b = dumpText(els['secret-list'], []).join(' ');
ok('休整中节点显示「休整中」且不再显示「探索中」', /休整中/.test(list9b) && !/探索中/.test(list9b));

// ---------- 汇总 ----------
console.log('\n==== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ====');
if (errors.length) console.log('console.error: ' + errors.slice(0, 3).join(' | '));
if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exitCode = 1; }
