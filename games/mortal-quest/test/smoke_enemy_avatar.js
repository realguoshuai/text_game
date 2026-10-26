'use strict';
/* =========================================================
 * test/smoke_enemy_avatar.js —— 敌手头像三级解析 回归
 *
 * 锁死本轮修复：
 *   ① 「铁齿狼 · 一阶妖兽」不再顶巨猿脸——副名（妖兽/练气后期）一律不参与匹配
 *   ② 机构词压在物种词之前但排在「魔 / 鬼灵」之后：
 *      惊蛟会帮众 → 剪径蠢贼（不是墨蛟）、魔焰门修士 → 魔道邪修（不是劫修）
 *   ③ 22 类标准键名 ↔ 22 张切图一一对应，59 只怪无一落空
 *   ④ 人形立绘的注脚写「修士」而不是「妖兽
 * 运行： node test/smoke_enemy_avatar.js
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
const A = G.Art;
const key = (n) => A.avatarKeyOf({ name: n });
const url = (n) => A.resolveEnemyAvatar({ name: n });

console.log('\n--- 一、22 类标准键名与切图资源 ---');
const WANT = ['铁齿狼', '赤练妖蛇', '百目毒蛛', '双头火鸦', '墨蛟', '裂风巨猿', '婴鲤兽', '玄岩龟',
    '炼尸', '鬼王', '机关傀儡', '噬金虫群', '剪径蠢贼', '黑市劫修', '魔道邪修', '玄机子',
    // 云京皇宫·夜战幽冥教（6 张专属立绘）
    '血侍·铁罗', '血侍·苍岚', '血侍·叶泓', '血侍·冰妖', '血玉蜘蛛', '幽冥教主·越皇'];
ok('标准键名共 22 类', Object.keys(A.MON_AVATAR_FILE).length === 22);
ok('22 类键名逐一对上（无缺无多）', WANT.every(k => A.MON_AVATAR_FILE[k]) &&
    Object.keys(A.MON_AVATAR_FILE).every(k => WANT.indexOf(k) >= 0));
ok('文件名互不重复', new Set(Object.keys(A.MON_AVATAR_FILE).map(k => A.MON_AVATAR_FILE[k])).size === 22);
const dir = path.join(BASE, 'assets/monsters');
const disk = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
ok('切图目录存在且有 22 张', disk.filter(f => /\.jpg$/i.test(f)).length === 22);
ok('每张图都非空（> 5KB）', WANT.every(k => {
    const p = path.join(dir, A.MON_AVATAR_FILE[k] + '.jpg');
    return fs.existsSync(p) && fs.statSync(p).size > 5120;
}));

console.log('\n--- 二、第一级：精确名 ---');
ok('铁齿狼 → 铁齿狼', key('铁齿狼') === '铁齿狼');
ok('铁齿狼王（精确表）→ 铁齿狼', key('铁齿狼王') === '铁齿狼');
ok('玄机子 · 魔银手 → 玄机子', key('玄机子 · 魔银手') === '玄机子');
ok('原著别名 墨大夫 → 玄机子', key('墨大夫') === '玄机子' && key('余子童') === '玄机子');
ok('百目毒蛛 → 百目毒蛛（不被「蛛」以外的字带偏）', key('百目毒蛛') === '百目毒蛛');

console.log('\n--- 三、第二级：词根（含顺序陷阱） ---');
ok('副名「一阶妖兽」不参与匹配：铁齿狼 · 一阶妖兽 → 铁齿狼',
    key('铁齿狼 · 一阶妖兽') === '铁齿狼');
ok('铁背蜈 · 天灵果守护兽 → 百目毒蛛（副名的「守护兽」不把它变成巨猿）',
    key('铁背蜈 · 天灵果守护兽') === '百目毒蛛');
ok('惊蛟会帮众 → 剪径蠢贼（机构词在先，别被「蛟」拽去当墨蛟）',
    key('惊蛟会帮众 · 拦路刁徒') === '剪径蠢贼');
ok('赤鳞蛟 → 墨蛟（真妖兽不受机构规则影响）', key('赤鳞蛟') === '墨蛟');
ok('魔焰门修士 → 魔道邪修（「魔」在「门」之前）', key('魔焰门修士 · 筑基期') === '魔道邪修');
ok('鬼灵门修士 → 魔道邪修（鬼灵 ≠ 鬼王）', key('鬼灵门修士') === '魔道邪修');
ok('幽冥教主·越皇 → 专属立绘（不再是通用鬼王）', key('幽冥教主·越皇') === '幽冥教主·越皇');
// 只给名字时 mainNameOf 只能取到「血侍」（四人同词根），必然共用通用魔修像——
// 这正是第 0 级「按 id 认脸」存在的理由（见第七节）
ok('只给名字：四人同词根 → 通用魔修（故必须靠 id 认脸）', key('血侍·铁罗') === '魔道邪修');
ok('古修残魂 → 鬼王', key('古修残魂') === '鬼王');
ok('心魔·凝形 → 魔道邪修', key('心魔·凝形') === '魔道邪修');
ok('赤焰火蟒 / 碧毒蟒 → 赤练妖蛇', key('赤焰火蟒 · 二阶妖兽') === '赤练妖蛇' && key('碧毒蟒') === '赤练妖蛇');
ok('玄铁狂猿 / 紫目猿 / 苍岚豹 / 玉面狸 → 裂风巨猿',
    ['玄铁狂猿', '紫目猿', '苍岚豹', '玉面狸'].every(n => key(n) === '裂风巨猿'));
ok('铁甲蜈蚣 → 百目毒蛛', key('铁甲蜈蚣') === '百目毒蛛');
ok('归墟之眼 / 归墟守兽 → 婴鲤兽', key('归墟之眼') === '婴鲤兽' && key('归墟守兽') === '婴鲤兽');
ok('黑市劫匪 / 劫道散修 / 擂台散修 → 黑市劫修',
    ['黑市劫匪 · 心狠手辣', '劫道散修', '擂台散修 · 练气后期'].every(n => key(n) === '黑市劫修'));
ok('叛乱堂主 → 剪径蠢贼', key('叛乱堂主 · 铁掌沙震') === '剪径蠢贼');
ok('噬金虫群 → 噬金虫群（虫类不与蛛类混）', key('噬金虫群') === '噬金虫群');
ok('双头火鸦 → 双头火鸦', key('双头火鸦') === '双头火鸦');
ok('玄岩龟 → 玄岩龟', key('玄岩龟') === '玄岩龟');
ok('机关傀儡 → 机关傀儡', key('机关傀儡') === '机关傀儡');
ok('炼尸 → 炼尸', key('炼尸') === '炼尸');

console.log('\n--- 四、第三级：类别兜底 ---');
ok('无名无姓 → 裂风巨猿', key('') === '裂风巨猿' && key(undefined) === '裂风巨猿');
ok('human 标记 → 黑市劫修', A.avatarKeyOf({ name: '', def: { human: true } }) === '黑市劫修');
ok('全空对象不抛错', A.avatarKeyOf({}) === '裂风巨猿');

console.log('\n--- 五、全量怪物无一落空 ---');
const MON = G.DATA.MONSTERS || [];
ok('怪物表读得到（53 只）', MON.length >= 50);
const missing = MON.filter(m => {
    const f = A.resolveEnemyAvatar({ name: m.name, def: m }).split('/').pop();
    return !fs.existsSync(path.join(dir, f));
});
ok('53 只怪全都能落到已存在的切图上', missing.length === 0);
const used = {};
MON.forEach(m => { const k = A.avatarKeyOf({ name: m.name, def: m }); used[k] = (used[k] || 0) + 1; });
ok('至少用到 10 类不同立绘（不再全员同一张脸）', Object.keys(used).length >= 10);
ok('铁齿狼族至少 3 只同脸（魔兽同源合理）', (used['铁齿狼'] || 0) >= 3);
ok('玄机子独占一张（夺舍对决不与人族混）', used['玄机子'] === 1);

console.log('\n--- 六、对外接口 ---');
ok('路径前缀正确', url('铁齿狼') === 'assets/monsters/tiechilang.jpg');
ok('旧接口 monsterPortrait 与新版同源',
    A.monsterPortrait({ name: '赤鳞蛟' }) === A.resolveEnemyAvatar({ name: '赤鳞蛟' }));
ok('window.resolveEnemyAvatar 已挂出', typeof sandbox.resolveEnemyAvatar === 'function');
ok('window.resolveEnemyAvatarKey 已挂出', typeof sandbox.resolveEnemyAvatarKey === 'function');
ok('外部调用给的是同一张图', sandbox.resolveEnemyAvatar({ name: '鬼王' }) === 'assets/monsters/guiwang.jpg');
ok('isHumanAvatar：人族立绘判真', A.isHumanAvatar({ name: '劫道散修' }) === true &&
    A.isHumanAvatar({ name: '魔道凶徒' }) === true && A.isHumanAvatar({ name: '玄机子' }) === true);
ok('isHumanAvatar：妖兽立绘判假', A.isHumanAvatar({ name: '铁齿狼' }) === false &&
    A.isHumanAvatar({ name: '古修残魂' }) === false);

console.log('\n--- 七、第 0 级：怪物 id 优先（改名/同词根都不掉图） ---');
ok('id 精确：血侍四人各拿各的图', (function () {
    const ids = ['heisha_tieluo', 'heisha_qingwen', 'heisha_yehong', 'heisha_bingyao'];
    const files = ids.map(id => A.resolveEnemyAvatar({ def: { id: id, name: '血侍' } }));
    return new Set(files).size === 4 &&
        files[0] === 'assets/monsters/heisha_tieluo.jpg' &&
        files[3] === 'assets/monsters/heisha_bingyao.jpg';
})());
ok('id 精确：血玉蜘蛛', A.resolveEnemyAvatar({ def: { id: 'heisha_zhizhu', name: '血玉蜘蛛' } }) ===
    'assets/monsters/heisha_zhizhu.jpg');
ok('越皇二阶段改名「黑煞妖魔化·越皇」仍用同一张脸',
    A.avatarKeyOf({ def: { id: 'heisha_yuehuang' }, name: '黑煞妖魔化·越皇' }) === '幽冥教主·越皇');
ok('无 id 时按名字也能命中（旧调用点兜底）', key('血玉蜘蛛') === '血玉蜘蛛' &&
    key('黑煞妖魔化·越皇') === '幽冥教主·越皇');
ok('没有 id 的普通怪不受影响', key('铁齿狼 · 一阶妖兽') === '铁齿狼');

console.log('\n=========================================');
console.log((fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
if (fail) { fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
