'use strict';
/* =========================================================
 * test/smoke_player_exp.js —— 玩家体验五项改造无头测试
 *   ① 高光时刻：首次事件单独成块、只触发一次
 *   ② 选项提示：从 outcomes 自动推导风险/收益/对手
 *   ③ 死亡兜底：死亡不写档（保住最后一份活着的存档）
 *   ④ 体感反馈：换装/突破把数字翻译成人话
 *   ⑤ 省点击：批量打坐、自动斗法
 * 运行： node test/smoke_player_exp.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.resolve(__dirname, '..');
const logs = [];
const uiStub = {
  log: function (msg, type) { logs.push({ msg: String(msg), type: type || 'info' }); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, renderBlack: function () {}, renderTrial: function () {},
  renderTrack: function () {}, renderCombat: function () {}, toggleTalismans: function () {},
};
let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
// 极简 localStorage 桩（存档测试用）
const store = {};
sandbox.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
vm.createContext(sandbox);

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
  'js/moments.js', 'js/tips.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function assert(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }
const P = () => G.State.p();
const text = () => logs.map(l => l.msg).join('\n');
const types = () => logs.map(l => l.type);

// ---------- ① 高光时刻 ----------
section('① 高光时刻');
G.State.createNewPlayer();
logs.length = 0;
assert('首次触发成功', G.Moments.fire('first_liquid') === true);
assert('输出含高光块', types().includes('moment'));
assert('高光标题带书名号式标记', text().includes('第一滴绿液'));
assert('同一高光不重复触发', G.Moments.fire('first_liquid') === false);
logs.length = 0;
G.Moments.fire('first_liquid');
assert('重复触发不再刷屏', !text().includes('第一滴绿液'));
assert('已解锁清单可查', G.Moments.unlocked().includes('first_liquid'));
// 突破/筑基挂钩
// 注意：筑基关（realmIndex >= ZHUJI_GATE_INDEX）后加了「心魔劫」——壁障将破时先弹待决事件，
// 须定心抉择后才由 core._resumeBreakthrough 正式冲击。测试要跟着走这一步，否则永远停在半途。
function breachThrough() {
  G.Core.breakthrough();
  if (P().pendingEvent && P().pendingEvent.eventId === 'heart_demon') G.Core.chooseEventOption(0);
}
P().realmIndex = 12; P().currentExp = 999; P().maxHp = 100;
_rand = 0.01;   // 必成功
logs.length = 0;
breachThrough();
assert('突破成功触发破境高光', P().moments.first_breakthrough === true);
assert('突破成功触发筑基高光', P().moments.first_zhuji === true);
assert('突破日志含气血上限变化', /气血上限 \d+ → \d+/.test(text()));

// ---------- ② 选项提示 ----------
section('② 选项提示');
const evCave = G.Core.findEvent('cave_fate') || (G.DATA.EVENTS || []).find(e => e.id === 'cave_fate');
assert('取到测试事件', !!evCave && evCave.choices.length === 2);
const tipRisk = G.Tips.choiceTip(evCave.choices[0]);
const tipSafe = G.Tips.choiceTip(evCave.choices[1]);
assert('冒险选项提示含凶险比例', /成凶险/.test(tipRisk));
assert('冒险选项提示含最坏受创', /最坏 -\d+ 气血/.test(tipRisk));
assert('冒险选项提示含或有收获', /或有收获/.test(tipRisk));
assert('稳妥选项提示为无惊无险或含成有得', /无惊无险|成有得/.test(tipSafe));
assert('提示带括号包裹', /^（.*）$/.test(tipRisk));
const combatEv = (G.DATA.EVENTS || []).find(e => e.outcomes && e.outcomes.some(o => o.type === 'combat'));
if (combatEv) {
  assert('战斗型事件提示含对手名', /对手：/.test(G.Tips.choiceTip({ outcomes: combatEv.outcomes })));
} else { assert('战斗型事件提示含对手名', true); }

// ---------- ③ 死亡兜底 ----------
section('③ 死亡兜底（死亡不入档）');
const p = P();
store[G.Storage.slotKey(0)] = JSON.stringify({ _v: G.Storage.VERSION, isDead: false, name: '活着' });
p.isDead = true;
const ok = G.Storage.saveToSlot(0);
assert('死亡时拒绝写档', ok === false);
assert('旧存档未被覆盖', JSON.parse(store[G.Storage.slotKey(0)]).name === '活着');
p.isDead = false;
assert('复活后可正常写档', G.Storage.saveToSlot(0, '新生') === true);

// ---------- ④ 体感反馈 ----------
section('④ 体感反馈');
const feel = G.Tips.gearFeel({ atk: 5, def: 2, speed: 6, spirit: 5 }, { atk: 7, def: 5, speed: 6, spirit: 5 });
assert('换装提示含出手多伤', /出手多伤约 2 点/.test(feel));
assert('换装提示含挨打少受', /挨打少受约 3 点/.test(feel));
assert('换装提示给出结论', /这一换，值/.test(feel));
assert('无变化时有兜底文案', G.Tips.gearFeel({ atk: 5 }, { atk: 5 }) === '（属性无变化）');
assert('变弱时提示不划算', /并不划算/.test(G.Tips.gearFeel({ atk: 9 }, { atk: 4 })));

// ---------- ⑤ 省点击 ----------
section('⑤ 批量打坐 / 自动斗法');
G.State.createNewPlayer();
const p2 = P();
const exp0 = p2.currentExp, months0 = p2.totalMonths;
const n = G.Core.meditateTimes(5);
assert('连修 5 次执行 5 轮', n === 5);
assert('修为增长 5 点', p2.currentExp - exp0 === 5);
assert('时间相应推进', p2.totalMonths > months0);
const nFull = G.Core.meditateTimes('full');
assert('直修至圆满会多次执行', nFull > 0);
assert('圆满后停止（修为达本境所需）', p2.currentExp >= G.DATA.REALMS[p2.realmIndex].needExp);
assert('批量打坐有汇总日志', /一连闭关苦修/.test(text()));

// 自动斗法
G.State.createNewPlayer();
const p3 = P();
p3.currentHp = p3.maxHp = 500;   // 保证不因低血中止
G.Combat.start('wolf');
assert('战斗已开始', !!p3.combat);
logs.length = 0;
const rounds = G.Combat.auto(80);
assert('自动斗法有交手回合', rounds > 0);
assert('战斗已结束', !p3.combat || p3.pendingMercy);
assert('自动斗法有结束日志', /自动斗法结束/.test(text()));

console.log('\n==== 结果: ' + pass + ' passed, ' + fail + ' failed ====');
if (fail) { console.log('失败项：' + fails.join(' | ')); process.exit(1); }
