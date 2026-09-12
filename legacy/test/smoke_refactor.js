/* =========================================================
 * test/smoke_refactor.js —— 属性底层重构（Phase 1）验收
 * 验证：① 新玩家含 clock/mp/stamina/equipment
 *       ② 旧字段名（artifact/ageYears/stone…）经兼容层代理到新规范存储
 *       ③ getStats 读取 equipment 而非旧根字段
 *       ④ migratePlayerState 旧存档升轨（clock/equipment/mp/stamina 注入）
 * 运行： node test/smoke_refactor.js
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const BASE = path.resolve(__dirname, '..');

const _store = {};
const localStub = { getItem: k => (k in _store ? _store[k] : null), setItem: (k, v) => { _store[k] = String(v); }, removeItem: k => { delete _store[k]; } };
const uiStub = { log() {}, updateUI() {}, autoSave() {}, setDead() {}, renderSect() {}, renderBlack() {}, renderTrial() {}, renderTrack() {}, renderCombat() {}, toggleTalismans() {}, doLoad() {}, renderOrigin() {}, initLogs() {} };
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console; sandbox.GAME = { UI: uiStub };
Object.defineProperty(sandbox, 'localStorage', { value: localStub, configurable: true });
sandbox.Math = Object.create(Math); sandbox.Math.random = () => 0.5;
vm.createContext(sandbox);

['data/realms.js', 'data/items.js', 'data/events.js', 'data/world.js', 'data/content.js',
 'js/state.js', 'js/storage.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f }));

const G = sandbox.GAME;
let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}

console.log('\n【R1】新玩家结构（clock / mp / stamina / equipment）');
let p = G.State.createNewPlayer('erlezi');
ok('含 clock 且含 year/month/dailyCircles', p.clock && 'year' in p.clock && 'month' in p.clock && 'dailyCircles' in p.clock);
ok('clock.year 取自出身(16)', p.clock.year === 16);
ok('mp/maxMp = 20/20', p.mp === 20 && p.maxMp === 20);
ok('stamina/maxStamina = 100/100', p.stamina === 100 && p.maxStamina === 100);
ok('equipment 四槽位齐全', p.equipment && 'mainWeapon' in p.equipment && 'subWeapon' in p.equipment && 'armor' in p.equipment && 'artifact' in p.equipment);

console.log('\n【R2】旧字段名 → 新规范存储 代理（读写一致）');
p.artifact = 'artifact_qingwen';
ok('p.artifact → equipment.mainWeapon', p.equipment.mainWeapon === 'artifact_qingwen');
p.artifact2 = 'artifact_wujin';
ok('p.artifact2 → equipment.artifact（副法器）', p.equipment.artifact === 'artifact_wujin');
p.armor = 'mirror_armor';
ok('p.armor → equipment.armor', p.equipment.armor === 'mirror_armor');
p.darkWeapon = 'zimu_ren';
ok('p.darkWeapon → equipment.subWeapon', p.equipment.subWeapon === 'zimu_ren');
// 反向：改 equipment 也反映到旧名
p.equipment.mainWeapon = null;
ok('清空 equipment.mainWeapon → p.artifact 同步为 null', p.artifact === null);

p.ageYears = 30;
ok('p.ageYears → clock.year', p.clock.year === 30);
p.ageMonths = 7;
ok('p.ageMonths → clock.month', p.clock.month === 7);
// 走月进位逻辑（core 风格）
p.ageMonths += 8; while (p.ageMonths >= 12) { p.ageMonths -= 12; p.ageYears += 1; }
ok('跨年进位 ageYears/ageMonths 正确', p.ageYears === 31 && p.ageMonths === 3);

p.stone = 500;
ok('p.stone → spiritStones', p.spiritStones === 500 && p.stone === 500);

console.log('\n【R3】getStats 读取 equipment');
G.State.createNewPlayer('erlezi');
let q = G.State.p();
let baseAtk = G.DATA.REALMS[q.realmIndex].atk;
let baseDef = G.DATA.REALMS[q.realmIndex].def;
ok('空装 getStats = 境界基础', G.State.getStats().atk === baseAtk && G.State.getStats().def === baseDef);
q.equipment.mainWeapon = 'artifact_qingwen';  // atk+6
ok('主法器加成计入 getStats', G.State.getStats().atk === baseAtk + 6);
q.equipment.armor = 'mirror_armor';
// mirror_armor 防御加成：仅断言 def 上升
ok('防具加成计入 getStats', G.State.getStats().def > baseDef);
// 兼容直读攻击/防御 getter
ok('p.attack 为数字且≥基础', typeof q.attack === 'number' && q.attack >= baseAtk);
ok('p.defense 为数字且≥基础', typeof q.defense === 'number' && q.defense >= baseDef);

console.log('\n【R4】migratePlayerState 旧存档升轨');
// 模拟重构前的扁平存档：有 ageYears/artifact 等，无 clock/equipment/mp/stamina
let old = {
  originId: 'erlezi',
  ageYears: 25, ageMonths: 9,
  spiritStones: 60, silver: 200,
  artifact: 'artifact_qingwen', armor: 'mirror_armor',
  artifact2: 'artifact_wujin', darkWeapon: 'zimu_ren',
  inventory: { pill_huanglong: 2 },
  realmIndex: 3, currentExp: 40,
};
let up = G.Storage.migratePlayerState(old);
ok('升轨后注入 clock.year', up.clock && up.clock.year === 25);
ok('升轨后注入 clock.month', up.clock && up.clock.month === 9);
ok('升轨后 equipment.mainWeapon 来自旧 artifact', up.equipment.mainWeapon === 'artifact_qingwen');
ok('升轨后 equipment.armor 来自旧 armor', up.equipment.armor === 'mirror_armor');
ok('升轨后 equipment.artifact 来自旧 artifact2', up.equipment.artifact === 'artifact_wujin');
ok('升轨后 equipment.subWeapon 来自旧 darkWeapon', up.equipment.subWeapon === 'zimu_ren');
ok('升轨后注入 mp=20', up.mp === 20 && up.maxMp === 20);
ok('升轨后注入 stamina=100', up.stamina === 100 && up.maxStamina === 100);
// 兼容层代理在升轨后可用
ok('升轨后 p.ageYears 代理到 clock.year', up.ageYears === 25);
ok('升轨后 p.artifact 代理到 equipment.mainWeapon', up.artifact === 'artifact_qingwen');
ok('升轨后 p.stone 代理到 spiritStones', up.stone === 60 && up.spiritStones === 60);
// 旧字段不丢失（非破坏性）
ok('升轨不删除旧字段 artifact（仍可直读）', up.artifact === old.artifact);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
if (fail) console.log('失败项: ' + fails.join(' | '));
process.exit(fail > 0 ? 1 : 0);
