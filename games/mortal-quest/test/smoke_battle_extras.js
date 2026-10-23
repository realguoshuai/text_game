'use strict';
/* =========================================================
 * test/smoke_battle_extras.js —— 斗法页旁门按钮显隐 / 先手文案 回归
 *
 * 锁死本轮修复：
 *   ① 未解锁手段不渲染（不剧透、不挤第二行）：玄傀/噬金虫/符宝/自爆/流烟步
 *   ② 先手副文案跟速度走：我方慢 → 后手接招，我方快 → 抢先出招
 *   ③ 符箓计数（身边无符 → 主按钮置灰的依据）
 * 只测纯判定函数，不解析 innerHTML（无头 DOM 不做 DOM 树构建）。
 * 运行： node test/smoke_battle_extras.js
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

function El(id, tag) {
    this.id = id; this.tagName = (tag || 'div').toUpperCase();
    this.style = {}; this.children = []; this._html = ''; this._text = '';
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    this.dataset = {}; this.scrollTop = 0; this.disabled = false; this.hidden = false;
    this.onclick = null; this.firstChild = null; this.lastChild = null;
}
El.prototype.appendChild = function (c) { this.children.push(c); this.firstChild = this.children[0]; this.lastChild = this.children[this.children.length - 1]; return c; };
El.prototype.removeChild = function () {};
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function () {};
El.prototype.getAttribute = function () { return null; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.remove = function () {};
El.prototype.contains = function () { return false; };
Object.defineProperty(El.prototype, 'childElementCount', { get() { return this.children.length; } });
Object.defineProperty(El.prototype, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); } });
Object.defineProperty(El.prototype, 'innerText', { get() { return this._text; }, set(v) { this._text = String(v); } });
Object.defineProperty(El.prototype, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });

const els = {};
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = { log: () => {}, warn: () => {}, error: () => {} };
sandbox.confirm = () => true; sandbox.alert = () => {};
sandbox.setTimeout = () => 0; sandbox.clearTimeout = () => {};
sandbox.setInterval = () => 0; sandbox.requestAnimationFrame = () => 0;
sandbox.document = {
    getElementById: (id) => els[id] || (els[id] = new El(id)),
    createElement: (t) => new El(null, t),
    querySelector: () => new El('q'),
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
const B = G.BattleUI;
function section(t) { console.log('\n' + t); }

section('① 旁门手段显隐（未解锁不渲染）');
let p = G.State.createNewPlayer('hunter');
const CHIPS = ['btn-fubao', 'btn-detonate', 'btn-luoyan', 'btn-blink', 'btn-companion-block', 'btn-companion-smash', 'btn-insect-cloud'];
CHIPS.forEach(id => ok('新号未解锁即隐藏：' + id, B._chipVisible(id, p) === false));
ok('自动斗法常显', B._chipVisible('btn-auto-combat', p) === true);
ok('燃寿搏命常显', B._chipVisible('btn-desperate', p) === true);

p.artifact = 'artifact_wujin';
ok('装备法器后出现「自爆法器」', B._chipVisible('btn-detonate', p) === true);
G.State.addItem('fubao_lvhuang', 1);
ok('持有符宝后出现「祭起符宝」', B._chipVisible('btn-fubao', p) === true);
p.skills = { luoyan: true };
ok('习得流烟步后出现对应按钮', B._chipVisible('btn-luoyan', p) === true);
G.State.addItem(G.DATA.SKILLS.blink_sword.item, 1);
ok('持有反光短剑后出现「眨眼剑法」', B._chipVisible('btn-blink', p) === true);
p.companion = { name: 'quhun', hp: 50, maxHp: 50 };
ok('收服玄傀后出现抵挡/重击', B._chipVisible('btn-companion-block', p) === true && B._chipVisible('btn-companion-smash', p) === true);
G.State.addItem('shijin_adult', 1);
ok('持有噬金虫后出现「放噬金虫云」', B._chipVisible('btn-insect-cloud', p) === true);

section('② 先手文案随速度动态变化');
p = G.State.createNewPlayer('hunter');
const spd = G.State.getStats().speed;
ok('我方慢于对手 → 后手接招', /后手接招/.test(B._sub('btn-attack', p, { round: 1, speed: spd + 5 })));
ok('我方不慢于对手 → 抢先出招', /抢先出招/.test(B._sub('btn-attack', p, { round: 1, speed: Math.max(1, spd - 5) })));

section('③ 符箓计数（无符 → 主按钮置灰依据）');
p = G.State.createNewPlayer('hunter');
ok('囊中无符：计数为 0', B._talismanCount(p) === 0);
G.State.addItem('talisman_hushen', 2);
ok('有两张符：计数为 2', B._talismanCount(p) === 2);
ok('有符时副文本报张数', /身边 2 张/.test(B._sub('btn-talisman', p, { round: 1 })));
p = G.State.createNewPlayer('hunter');
ok('无符时副文本为「身边无符」', /身边无符/.test(B._sub('btn-talisman', p, { round: 1 })));

section('④ 道号字段已注入');
p = G.State.createNewPlayer('yaopu');
ok('新号带道号（优先于出身名）', p.daoName === '沈小牧' && p.name === '药铺学徒');

console.log('\n' + '─'.repeat(46));
console.log(`  结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('  失败项：'); fails.forEach(f => console.log('   - ' + f)); }
process.exit(fail ? 1 : 0);
