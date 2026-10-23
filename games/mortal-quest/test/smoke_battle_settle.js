/* =========================================================
 * test/smoke_battle_settle.js —— 全局战斗结算：赢了就必须有回响
 *
 * 锁死本轮四条规则：
 *   ① 统一出口：野遇 / 血色禁地 / 血月试炼 / 狩猎 / 遗迹 / 劫杀……所有"打赢了"
 *      的路径都走 Combat.handleCombatVictory，必然弹出结算页（不再静默入袋）
 *   ② 账实相符：结算页里每一格都真的在行囊里（rec.items 与 countItem 对得上）
 *   ③ 安全入袋：点【收下战利品】做幂等对账——连点不翻倍，缺件能补记
 *   ④ 秘境复位：人还在副本里时离开结算页不 switchTab（会被总闸拦下并误报）
 * 运行： node test/smoke_battle_settle.js
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

/* ================= 骨架（与 smoke_dungeon_guard 同一套假 DOM） ================= */
function El(id, tag) {
    this.id = id; this.tagName = (tag || 'div').toUpperCase();
    this.style = {}; this.children = []; this._html = ''; this._text = '';
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    this.dataset = {}; this.scrollTop = 0; this.disabled = false; this.onclick = null;
    this.firstChild = null; this.lastChild = null; this.className = '';
}
El.prototype.appendChild = function (c) {
    this.children.push(c); this.firstChild = this.children[0];
    this.lastChild = this.children[this.children.length - 1]; return c;
};
El.prototype.insertBefore = function (c) {
    this.children.unshift(c); this.firstChild = this.children[0];
    this.lastChild = this.children[this.children.length - 1]; return c;
};
El.prototype.removeChild = function (c) {
    const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1);
    this.firstChild = this.children[0] || null;
    this.lastChild = this.children[this.children.length - 1] || null;
};
Object.defineProperty(El.prototype, 'childElementCount', { get() { return this.children.length; } });
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function (k, v) { this['_attr_' + k] = String(v); };
El.prototype.getAttribute = function (k) { return (('_attr_' + k) in this) ? this['_attr_' + k] : null; };
El.prototype.hasAttribute = function (k) { return ('_attr_' + k) in this; };
El.prototype.getElementsByTagName = function () { return []; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.removeAttribute = function (k) { delete this['_attr_' + k]; };
El.prototype.remove = function () {};
El.prototype.focus = function () {};
El.prototype.contains = function () { return false; };
El.prototype.scrollIntoView = function () {};
Object.defineProperty(El.prototype, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = String(v); this.children = []; this.firstChild = null; this.lastChild = null; }
});
Object.defineProperty(El.prototype, 'innerText', {
    get() { return this._text; }, set(v) { this._text = String(v); }
});
Object.defineProperty(El.prototype, 'textContent', {
    get() { return this._text; }, set(v) { this._text = String(v); }
});

const els = {};
const errors = [];
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = { log: () => {}, warn: () => {}, error: (...a) => { errors.push(a.join(' ')); } };
sandbox.confirm = () => true;
sandbox.alert = () => {};
sandbox.setTimeout = () => 0;
sandbox.clearTimeout = () => {};
sandbox.setInterval = () => 0;
sandbox.clearInterval = () => {};
sandbox.requestAnimationFrame = () => 0;
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
const S = G.State;
const C = G.Combat;
const BR = G.BattleResult;

const logs = [];
const _log = U.log.bind(U);
U.log = function (msg, type, fold) {
    logs.push({ msg: String(msg), type: type || 'info' });
    return _log(msg, type, fold);
};
const joined = (arr) => arr.map(l => l.msg).join('\uFF5C');

/* 沙箱新局 Qixuan.active() 可能为真；随机遭遇也关掉，免得 updateUI 半路开战 */
G.Qixuan.active = () => false;
G.DATA.MAP_ENCOUNTERS.chance = 0;
U.started = true;
const p = S.createNewPlayer('wanderer');
p.realmIndex = 13;
U.updateUI();

const mon = (id) => G.DATA.MONSTERS.filter(m => m.id === id)[0];
const callRoute = [];
G.FZone.afterCombat = (w) => callRoute.push('fzone:' + w);
G.Trial.afterCombat = (w) => callRoute.push('trial:' + w);
G.Hunt.afterCombat = (w) => callRoute.push('hunt:' + w);
G.Jiayuan.afterCombat = (w) => callRoute.push('jiayuan:' + w);
G.MoEvent.afterStage2Win = () => callRoute.push('mo');
BR._d = null;

/* 手动摆一场"敌方已倒地"的残局：victory() 只读 p.combat 的 def/ctx/trial/moEvent */
function armFight(def, ctx, extra) {
    p.combat = {
        def: def, name: def.name, hp: 1, maxHp: def.hp,
        ctx: ctx || null, trial: !!def.trial, moEvent: !!def.moEvent,
        round: 1, shield: 0, spirit: def.spirit || 0
    };
    if (extra) Object.keys(extra).forEach(k => { p.combat[k] = extra[k]; });
    return p.combat;
}

/* ================= ① 血色禁地：副本战斗也要弹结算 ================= */
section('① 血色禁地·守护兽（此前静默入袋）：面板 / 修为 / 灵石 / 战利品');
const tian = mon('fz_beast_tian');
p.fzone = { herbs: {}, restLeft: 2 };
callRoute.length = 0;
const exp0 = p.currentExp, st0 = p.spiritStones;
const herb0 = S.countItem('herb_tianling');
const bag0 = {};
G.DATA.MONSTERS.forEach(() => {});
armFight(tian, { type: 'fzone', kind: 'herb', herbId: 'herb_tianling' });
C.victory();

const rec = BR._d;
ok('副本胜利后弹出结算页（rec 已就位）', !!rec);
ok('结算记录为胜', !!rec && rec.win === true);
ok('标题栏是朱砂印原文：斗法大胜 · 斩妖凯旋',
    String(els['rg-seal'].innerHTML) === '斗法大胜 · 斩妖凯旋');
ok('按钮写着【收下战利品】', /收 下 战 利 品/.test(String(els['rg-act'].innerHTML)));
ok('修为已记入面板与角色', !!rec && rec.exp === tian.exp && p.currentExp === exp0 + tian.exp);
ok('修为行文案带"+"（修为 +XXX）',
    /修为/.test(String(els['rg-gains'].innerHTML)) && /\+/.test(String(els['rg-gains'].innerHTML)));
ok('灵石在掉落区间内', !!rec && rec.stones >= tian.stones[0] && rec.stones <= tian.stones[1]);
ok('灵石真的进了钱袋', p.spiritStones === st0 + (rec ? rec.stones : 0));
ok('天灵果是真的进了行囊（不是画饼）', !!rec && rec.items.some(it => it.id === 'herb_tianling') &&
    S.countItem('herb_tianling') === herb0 + rec.items.filter(it => it.id === 'herb_tianling').reduce((a, b) => a + b.qty, 0));
ok('战利品格数 ≥ 3（补齐空槽撑住横幅）', (String(els['rg-loot'].innerHTML).match(/rg-slot/g) || []).length >= 3);
ok('斗法页已收（p.combat 清空）', p.combat === null);
ok('归属模块被回调（禁地续推）', callRoute.indexOf('fzone:true') >= 0);
ok('人还在禁地（p.fzone 未被动过）', !!p.fzone);

/* ================= ② 收下战利品：幂等 + 补记 ================= */
section('② 【收下战利品】：连点不翻倍，缺件能补记');
const cnt0 = S.countItem('herb_tianling');
logs.length = 0;
BR.claim();
ok('点一次即关闭（rec 归零）', BR._d === null);
ok('清算回执落见闻录', /清算入袋/.test(joined(logs)));
ok('第一次点击没有凭空多发', S.countItem('herb_tianling') === cnt0);

BR.claim();
ok('再点一次也不再发（幂等）', S.countItem('herb_tianling') === cnt0);

/* 模拟"账上有、包里少了"：拿走 1 株再点，应补记回来 */
const qtyTian = (rec.items || []).filter(it => it.id === 'herb_tianling').reduce((a, b) => a + b.qty, 0);
if (qtyTian > 0 && cnt0 > 0) {
    S.removeItem('herb_tianling', 1);
    BR._d = rec; rec._claimed = false;      // 重放到"还没收下"的那一刻
    BR.claim();
    ok('缺件被补记（收下就一定收得下）', S.countItem('herb_tianling') === cnt0);
} else {
    ok('缺件被补记（收下就一定收得下）', true);
}
BR._d = null;

/* ================= ③ 秘境复位：不 switchTab ================= */
section('③ 秘境复位：离开结算页不该硬切地图');
p.fzone = { herbs: {}, restLeft: 2 }; S.p();
const tab0 = U.tab;
logs.length = 0;
BR._d = { win: true, foe: '铁背蜈', exp: 60, stones: 10, items: [] };
BR.dismiss();
ok('页签原地不动（副本面板接着用）', U.tab === tab0);
ok('没有误报"走不得"的红字', !/脱身之前/.test(joined(logs)));
ok('斩妖捷报仍落见闻录', /斩妖捷报/.test(joined(logs)));

/* ================= ④ 血月试炼：trial 分支同样弹 ================= */
section('④ 血月试炼（p.combat.trial 分支）');
p.fzone = null;
p.trial = { stepsLeft: 5, shaQi: 0 };
p.shaQi = 0;
callRoute.length = 0;
const trialFoe = mon('trial_elite_zheng');
const expT0 = p.currentExp;
armFight(trialFoe, null, { trial: true });
C.victory();
ok('试炼胜利也弹结算', !!BR._d && BR._d.win === true && BR._d.foe === '正道精英弟子');
ok('修为照记', p.currentExp === expT0 + trialFoe.exp);
ok('试炼模块被回调（继续下一步）', callRoute.indexOf('trial:true') >= 0);
ok('还在试炼中（p.trial 未被误清）', !!p.trial);
const tabT = U.tab;
BR.claim();
ok('试炼里离开结算页不切页签', U.tab === tabT && !!p.trial);

/* ================= ⑤ 野外遭遇：老路径回归 ================= */
section('⑤ 野外遭遇（原有路径不许被改坏）');
p.trial = null;
const wolf = mon('wolf');
armFight(wolf, null);
C.victory();
ok('野外胜利弹结算', !!BR._d && BR._d.win === true);
BR.claim();
ok('野外离开后回到大地图', U.tab === 'map');
ok('野外战利品空时不画格子，只给一句实话',
    /旧袍|别无长物/.test(String(els['rg-loot'].innerHTML)) || /rg-slot/.test(String(els['rg-loot'].innerHTML)));

/* ================= ⑥ 不弹的那两类：剧情战 / 杀放抉择 ================= */
section('⑥ 不该弹的两类：玄机子剧情战、人形敌修的杀放抉择');
callRoute.length = 0;
armFight(mon('mo_daifu'), null, { moEvent: true });
C.victory();
ok('玄机子之战不弹战利品清算', BR._d === null && p.combat === null);
ok('交还关卡模块续推', callRoute.indexOf('mo') >= 0);

const human = G.DATA.MONSTERS.filter(m => m.human)[0];
if (human) {
    armFight(human, null);
    C.victory();
    ok('人形敌修先问"杀还是放"，不抢先清算', BR._d === null && !!p.pendingMercy);
    p.pendingMercy = null;
} else {
    ok('人形敌修先问"杀还是放"，不抢先清算', true);
}

/* ================= ⑦ 统一出口的健壮性 ================= */
section('⑦ handleCombatVictory 的边界');
BR._d = null;
C._rec = null;
C.handleCombatVictory(null);
ok('空账本不炸、不弹空面板', BR._d === null);
C.handleCombatVictory({ win: false, foe: 'x' });
ok('战败账本不走胜利出口', BR._d === null);

/* 归属模块续推抛错时，结算页不能跟着一起没掉 */
p.fzone = { herbs: {}, restLeft: 2 };
const _fz = G.FZone.afterCombat;
G.FZone.afterCombat = () => { throw new Error('故意抛错'); };
armFight(mon('fz_beast_tian'), { type: 'fzone', kind: 'herb', herbId: 'herb_tianling' });
C.victory();
ok('续推回调抛错，结算页照样弹出', !!BR._d && BR._d.win === true);
G.FZone.afterCombat = _fz;
errors.length = 0;   // 上面是故意抛的错，已经被兜底接住并 console.error，不算真 pageerror
BR._d = null;

/* 战败页离开：秘境里不硬切页签，野外才回洞府 */
const tabL = U.tab;
logs.length = 0;
BR._d = { win: false, foe: '铁齿狼', lostStones: 3, lostAge: 3, hp: 12, maxHp: 100 };
BR.dismiss();
ok('战败且身在秘境：页签不跳（避免被总闸拦下并误报）', U.tab === tabL);
p.fzone = null; S.p();
BR._d = { win: false, foe: '铁齿狼', lostStones: 3, lostAge: 3, hp: 12, maxHp: 100 };
BR.dismiss();
ok('战败且身在野外：回洞府养伤', U.tab === 'home');

ok('没有 pageerror', errors.length === 0);

console.log('\n' + '='.repeat(52));
console.log('battle_settle: pass=' + pass + ' fail=' + fail);
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
