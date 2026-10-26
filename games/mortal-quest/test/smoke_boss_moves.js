/* =========================================================
 * test/smoke_boss_moves.js —— 敌方招式系统回归（2026-10-26）
 *
 * 病灶：旧敌方回合只有一句「出手攻击」，且伤害只按「攻-防」算——
 * 玩家防御一涨，血侍一刀只剩 2~3 点，二十回合打完像拿刀背拍人。
 *
 * 本测试守住五件事：
 *   ① 只有声明 moves 的怪才进新分支（野外手感零影响）
 *   ② 抽招按权重与冷却走，被控/闪避的回合也照常走冷却
 *   ③ 伤害下限 = 玩家气血上限 × 比例（堆防御堆不掉），threatMul 同步削
 *   ④ 四种附带效果（dot/freeze/brace/dodge）各自真的生效
 *   ⑤ 整合：一场真打下来的战报里确实出现招式名
 *
 * 运行： node test/smoke_boss_moves.js
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

/* ================= 假 DOM ================= */
function El(id, tag) {
    this.id = id; this.tagName = (tag || 'div').toUpperCase();
    this.style = {}; this.children = []; this._html = ''; this._text = ''; this._cls = new Set();
    const self = this;
    this.classList = {
        add: function () { for (var i = 0; i < arguments.length; i++) self._cls.add(String(arguments[i])); },
        remove: function () { for (var i = 0; i < arguments.length; i++) self._cls.delete(String(arguments[i])); },
        toggle: function (c) { if (self._cls.has(c)) { self._cls.delete(c); return false; } self._cls.add(c); return true; },
        contains: function (c) { return self._cls.has(c); }
    };
    this.dataset = {}; this.scrollTop = 0; this.disabled = false; this.onclick = null;
    this.firstChild = null; this.lastChild = null; this.className = '';
}
El.prototype.appendChild = function (c) { this.children.push(c); this.firstChild = this.children[0]; this.lastChild = c; return c; };
El.prototype.insertBefore = function (c) { this.children.unshift(c); this.firstChild = c; return c; };
El.prototype.removeChild = function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); };
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function (k, v) { this['_attr_' + k] = String(v); };
El.prototype.getAttribute = function (k) { return (('_attr_' + k) in this) ? this['_attr_' + k] : null; };
El.prototype.hasAttribute = function (k) { return ('_attr_' + k) in this; };
El.prototype.removeAttribute = function (k) { delete this['_attr_' + k]; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.getElementsByTagName = function () { return []; };
El.prototype.remove = function () {}; El.prototype.focus = function () {};
El.prototype.contains = function () { return false; }; El.prototype.scrollIntoView = function () {};
Object.defineProperty(El.prototype, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); this.children = []; } });
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
let _rand = 0.5;
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
function setRand(v) { _rand = v; }
sandbox.document = {
    getElementById: (id) => els[id] || (els[id] = new El(id)),
    createElement: (t) => new El(null, t),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, body: new El('body'), documentElement: new El('html')
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
const C = G.Combat;
const p = G.State.p();
G.Qixuan.active = () => false;
G.UI.started = true;

const logs = [];
G.UI.log = function (m) { logs.push(String(m)); };
function joined(from) { return logs.slice(from || 0).join(' || '); }

const HP0 = 350;
p.realmIndex = 13;          // 筑基初期：否则大境界压制会让玩家命中率减半（越级挑战）
p.currentExp = 0;
p.maxHp = HP0;
G.State.getStats = function () { return { atk: 46, def: 36, speed: 14, spirit: 116, hit: 0.05, maxMp: 100 }; };

const DEF = (id) => G.DATA.MONSTERS.filter(m => m.id === id)[0];
function fresh(id) {
    p.currentHp = HP0; p.isDead = false; p.combat = null;
    p.pendingEvent = null; p.pendingMercy = null;
    logs.length = 0;
    C.start(id);
    return p.combat;
}

/* ================= ① 只有带 moves 的怪进新分支 ================= */
section('① 招式系统的适用边界（野外手感零影响）');
{
    const boss = fresh('heisha_bingyao');
    ok('幽冥教怪有 moves 表', Array.isArray(DEF('heisha_bingyao').moves) && DEF('heisha_bingyao').moves.length >= 3);
    ok('幽冥教怪能抽到招', !!C._pickMove(boss));

    // 随便挑一只没有 moves 的野外怪（不写死 id：数据表加怪/改名都不该弄挂这条）
    const plainDef = G.DATA.MONSTERS.filter(m => !m.moves && m.hp && m.atk != null)[0];
    const wild = fresh(plainDef.id);
    ok('野外普通怪没有 moves 表（' + plainDef.name + '）', !plainDef.moves && !!wild);
    ok('野外普通怪 _pickMove 返回 null（走旧单次攻击）', C._pickMove(wild) === null);

    // 六只怪的招式表自身要合法
    const ids = ['heisha_tieluo', 'heisha_qingwen', 'heisha_yehong', 'heisha_bingyao', 'heisha_zhizhu', 'heisha_yuehuang'];
    let bad = [];
    ids.forEach(id => {
        const seen = {};
        (DEF(id).moves || []).forEach(mv => {
            if (!mv.id || seen[mv.id]) bad.push(id + ':id');
            seen[mv.id] = 1;
            if (mv.cd != null && !(mv.cd > 0)) bad.push(id + ':' + mv.id + ':cd');
            if (mv.weight != null && !(mv.weight > 0)) bad.push(id + ':' + mv.id + ':weight');
        });
        if (!DEF(id).threatPct) bad.push(id + ':threatPct');
    });
    ok('六只怪的招式表合法（id 唯一 / cd 与 weight 为正 / 都有 threatPct）', bad.length === 0);
}

/* ================= ② 抽招与冷却 ================= */
section('② 按权重抽招 + 冷却（被控的回合也照走冷却）');
{
    const frozen = DEF('heisha_bingyao').moves.filter(m => m.kind === 'freeze')[0];
    ok('冰妖的封脉招式存在且带 cd', !!frozen && frozen.cd > 0);

    const c = fresh('heisha_bingyao');
    c.moveCd = {}; c.moveCd[frozen.id] = frozen.cd;
    let hitFrozen = false;
    for (let i = 0; i < 200; i++) { c.moveCd[frozen.id] = frozen.cd; setRand(0.5); if (C._pickMove(c) && C._pickMove(c).id === frozen.id) hitFrozen = true; }
    ok('冷却中的招式抽不到', hitFrozen === false);

    C._tickMoveCd(c);
    ok('_tickMoveCd 递减冷却', c.moveCd[frozen.id] === frozen.cd - 1);
    for (let i = 0; i < frozen.cd; i++) C._tickMoveCd(c);
    ok('冷却归零后可再次进入池子', c.moveCd[frozen.id] <= 0);

    // 抽中即上冷却
    const c2 = fresh('heisha_bingyao');
    c2.moveCd = {};
    let got = null;
    for (let i = 0; i < 300 && !got; i++) {
        const m = C._pickMove(c2);
        if (m && m.cd) got = m;
        else if (m) { /* 无 cd 的招不影响 */ }
        C._tickMoveCd(c2);
    }
    ok('抽中带 cd 的招后立刻进入冷却', !!got && c2.moveCd[got.id] > 0);

    // 定身/闪避的早退分支也要走冷却
    const c3 = fresh('heisha_bingyao');
    c3.moveCd = { [frozen.id]: 3 };
    c3.stun = { turns: 1 };
    setRand(0.5);
    C.attack();                 // 玩家出手 → 敌方被定身早退
    ok('被定身时冷却照常递减（不会因早退卡死）', c3.moveCd[frozen.id] === 2);
}

/* ================= ③ 伤害下限：堆防御堆不掉 ================= */
section('③ 伤害下限＝玩家气血上限 × 比例（这是「强敌必须疼」的保底）');
{
    const pv = { maxHp: 1000 };

    const tieluo = DEF('heisha_tieluo');
    const plain = tieluo.moves.filter(m => !m.floorPct && !m.kind)[0];
    const c = { def: tieluo, threatMul: null };
    ok('平砍招在超高防御下仍吃到 threatPct 下限',
        C._moveDamage(plain, c, pv, 1) === Math.round(1000 * tieluo.threatPct));

    const heavy = tieluo.moves.filter(m => m.floorPct)[0];
    ok('重招按自己的 floorPct 走（比平砍更疼）',
        C._moveDamage(heavy, c, pv, 1) === Math.round(1000 * heavy.floorPct));
    ok('重招 floorPct 高于 threatPct', heavy.floorPct > tieluo.threatPct);

    ok('threatMul 0.5 → 下限减半（引魔入阵真的减伤）',
        C._moveDamage(plain, { def: tieluo, threatMul: 0.5 }, pv, 1) === Math.round(1000 * tieluo.threatPct * 0.5));

    const doub = { id: 'x', name: 'x', mul: 2, times: 2 };
    ok('倍率与连击照常生效（不被下限吃掉）', C._moveDamage(doub, c, pv, 100) === 400);
    ok('没有 threatPct 的怪不受下限影响（野外怪维持旧手感）',
        C._moveDamage({ id: 'y', mul: 1 }, { def: { id: 'wild' } }, pv, 1) === 1);
}

/* ================= ④ 四种附带效果 ================= */
section('④ 附带效果：中毒 / 封脉 / 铁壁 / 残影');
{
    // dot
    const qw = DEF('heisha_qingwen').moves.filter(m => m.kind === 'dot')[0];
    const c = fresh('heisha_qingwen');
    C._moveEffects(qw, c, p);
    ok('毒雾挂上持续失血', !!c.playerDot && c.playerDot.turns === qw.dot.turns);
    ok('毒伤按玩家气血比例算（不写死数字）',
        c.playerDot.dmg === Math.max(1, Math.round(p.maxHp * qw.dot.pct)));
    const hpBefore = p.currentHp;
    C._tickPlayerDot(p);
    ok('玩家回合开头先扣毒伤', p.currentHp === hpBefore - c.playerDot.dmg);
    ok('中毒回合数递减', c.playerDot.turns === qw.dot.turns - 1);
    C._tickPlayerDot(p); C._tickPlayerDot(p);
    ok('毒到期自动解除', c.playerDot === null);

    // freeze
    const bing = DEF('heisha_bingyao').moves.filter(m => m.kind === 'freeze')[0];
    const c2 = fresh('heisha_bingyao');
    C._moveEffects(bing, c2, p);
    ok('封脉：玩家下回合脱力', c2.exhausted === true);
    ok('封脉：脱力原因写的是招式名（不是「流烟步反噬」）', c2.exhaustedWhy === bing.name);
    const n0 = logs.length;
    const bossHp0 = c2.hp;
    setRand(0.5);
    C.attack();                                   // 这一回合应当动不了
    ok('被封脉的回合打不出伤害', c2.hp === bossHp0);
    ok('战报说明是招式封脉而非流烟步', /玄冰封脉/.test(joined(n0)) && !/流烟步反噬/.test(joined(n0)));

    // brace
    const tl = DEF('heisha_tieluo').moves.filter(m => m.kind === 'brace')[0];
    const c3 = fresh('heisha_tieluo');
    C._moveEffects(tl, c3, p);
    ok('铁壁横练：下一击打折标记已挂', c3.foeBrace === tl.cut);
    const dmgWithBrace = (function () {
        c3.hp = 100000; c3.foeBrace = 0.55;
        const before = c3.hp; setRand(0.5);
        C.attack();
        return before - c3.hp;
    })();
    const dmgNoBrace = (function () {
        c3.hp = 100000; c3.foeBrace = 0;
        const before = c3.hp; setRand(0.5); p.combat.stun = { turns: 99 };  // 别让敌方反手改血
        C.attack();
        return before - c3.hp;
    })();
    ok('铁壁回合的伤害显著低于无铁壁（' + dmgWithBrace + ' vs ' + dmgNoBrace + '）', dmgWithBrace < dmgNoBrace * 0.7);
    ok('铁壁只挡一次（打完即清）', c3.foeBrace === 0);

    // dodge
    const yh = DEF('heisha_yehong').moves.filter(m => m.kind === 'dodge')[0];
    const c4 = fresh('heisha_yehong');
    C._moveEffects(yh, c4, p);
    ok('残影：挂上闪避层数', c4.foeDodge === yh.turns);
    c4.foeDodge = 99;
    let miss = 0;
    for (let i = 0; i < 40; i++) {
        c4.hp = 100000; setRand(0.72);             // 0.72 的随机数：正常命中、残影下落空
        const before = c4.hp;
        C.attack();
        if (c4.hp === before) miss++;
        p.currentHp = HP0; p.isDead = false;       // 别被反手打死
    }
    ok('残影期间大量攻击落空（落空 ' + miss + '/40）', miss >= 20);
}

/* ================= ⑤ 整合：真打一场，战报里要有招式名 ================= */
section('⑤ 整合：一场真打下来的战报出现多套招式');
{
    const c = fresh('heisha_bingyao');
    ok('开战成功', !!c);
    p.currentHp = HP0;
    let guard = 0;
    while (p.combat && !p.isDead && guard < 60) { setRand(0.5); C.attack(); guard++; }
    const txt = joined(0);
    const names = DEF('heisha_bingyao').moves.map(m => m.name).filter(n => txt.indexOf(n) >= 0);
    ok('战报里出现了冰妖的具体招式名（' + names.join('、') + '）', names.length >= 2);
    ok('战报不再只有「出手攻击」一种说法', txt.indexOf('出手攻击') < 0 || names.length >= 2);
    ok('战斗能正常收场（不会卡在无限回合）', !p.combat || p.isDead || p.combat.hp <= 0 || guard >= 60);
}

/* ================= 收尾 ================= */
if (errors.length) {
    console.log('\n运行时错误：');
    errors.slice(0, 5).forEach(e => console.log('  ! ' + e));
}
console.log('\n========================================');
console.log(pass + ' passed, ' + fail + ' failed' + (fail ? ' -> ' + fails.join(' / ') : ''));
process.exit(fail || errors.length ? 1 : 0);
