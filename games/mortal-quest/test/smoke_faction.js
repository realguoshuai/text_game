'use strict';
/* =========================================================
 * test/smoke_faction.js —— 三阵营声望与追杀令回归测试
 *   ① 数据结构：三阵营、阈值 -40、三个追杀令事件、三个追杀者怪物
 *   ② repute 是唯一写入口：数值可改、上下限夹紧、silent 不写日志
 *   ③ 斩魔道/斩散修/修魔功 → 声望按设计变动
 *   ④ 煞气侵蚀：煞气 ≥ 40 每年压低正道与散修声望
 *   ⑤ 追杀令：低于阈值才发；已有一张不叠加；手头有事不打断
 *   ⑥ 追杀令三选一：遁走 / 献金 / 付不起则退化成死战
 *   ⑦ findEvent 能取到 FACTION_EVENTS（否则事件面板会静默吞掉）
 * 运行： node test/smoke_faction.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, showBreakthroughModal: function () {}
};

let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/content.js',
  'data/world.js', 'data/events.js', 'data/wild_dungeons.js', 'data/skills_foundation.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js',
  'js/chronicle.js', 'js/faction.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

// 战斗桩：追杀令「死战」分支只验是否发起战斗，不跑真实回合
const started = [];
G.Combat.start = function (id) { started.push(id); };

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

function mk(o) {
  const p = G.State.createNewPlayer('j');
  p.realmIndex = 18;
  p.spiritStones = 5000;
  p.currentHp = 99999; p.maxHp = 99999;
  p.ageYears = 100; p.ageMonths = 0; p.totalMonths = 0;
  p.marketNextRefresh = 999999; p.junkNextRefresh = 999999;
  if (o) Object.keys(o).forEach(function (k) { p[k] = o[k]; });
  return p;
}

section('【1】数据结构');
ok('FACTIONS 三个阵营', G.DATA.FACTIONS.length === 3);
ok('阵营 id = xingque/luanxing/sanxiu', ['xingque', 'luanxing', 'sanxiu'].every(function (id) {
  return !!G.Faction.def(id);
}));
ok('追杀令阈值 = -40', G.DATA.FACTION_HUNT_THRESHOLD === -40);
ok('FACTION_EVENTS 三个追杀令事件', Object.keys(G.DATA.FACTION_EVENTS).length === 3);
ok('每个追杀令事件都有三个选择', Object.keys(G.DATA.FACTION_EVENTS).every(function (k) {
  const ev = G.DATA.FACTION_EVENTS[k];
  return ev.choices && ev.choices.length === 3 && ev.text;
}));
['xingque_hunter', 'luanxing_hunter', 'sanxiu_hunter'].forEach(function (id) {
  const m = G.DATA.MONSTERS.filter(function (x) { return x.id === id; })[0];
  ok('追杀者怪物已定义：' + id, !!m && m.majorRealm === 2);
});
ok('追杀者不进路遇池（只由追杀令调用）', !(G.DATA.MAP_ENCOUNTERS.pool || []).some(function (e) {
  return /hunter/.test(e.monster);
}));

section('【2】repute 唯一写入口');
let p = mk({});
ok('初始声望为 0', G.Faction.standing(p, 'xingque') === 0);
G.Faction.repute(p, 'xingque', 20);
ok('repute 生效', G.Faction.standing(p, 'xingque') === 20);
G.Faction.repute(p, 'xingque', 500);
ok('上限夹紧到 100', G.Faction.standing(p, 'xingque') === 100);
G.Faction.repute(p, 'xingque', -500);
ok('下限夹紧到 -100', G.Faction.standing(p, 'xingque') === -100);
logs.length = 0;
G.Faction.repute(p, 'xingque', 10, { silent: true });
ok('silent 模式不写日志', logs.length === 0);
ok('silent 仍改数值', G.Faction.standing(p, 'xingque') === -90);

section('【3】击杀与修魔功 → 声望变动');
p = mk({});
G.Faction.onKill(p, 'guiling_disciple');
ok('斩魔道修士 → 乱星盟 -8', G.Faction.standing(p, 'luanxing') === -8);
ok('斩魔道修士 → 星阙 +4', G.Faction.standing(p, 'xingque') === 4);

p = mk({});
G.Faction.onKill(p, 'wild_sanxiu_jie');
ok('斩散修 → 散修 -6', G.Faction.standing(p, 'sanxiu') === -6);
ok('斩散修 → 乱星盟 +2', G.Faction.standing(p, 'luanxing') === 2);

p = mk({});
G.Faction.onKill(p, 'wild_yaoxiu');
ok('斩妖（非人）不涉声望', G.Faction.standing(p, 'xingque') === 0 &&
  G.Faction.standing(p, 'luanxing') === 0 && G.Faction.standing(p, 'sanxiu') === 0);

p = mk({});
G.Faction.onLearnDemonic(p);
ok('修习魔道功法 → 乱星盟 +4', G.Faction.standing(p, 'luanxing') === 4);
ok('修习魔道功法 → 星阙 -4（正道侧目）', G.Faction.standing(p, 'xingque') === -4);

section('【4】煞气侵蚀');
p = mk({ shaQi: 60 });
G.Faction.tick(12);
ok('煞气 ≥ 40 → 星阙 每年 -3', G.Faction.standing(p, 'xingque') === -3);
ok('煞气 ≥ 40 → 散修 每年 -2', G.Faction.standing(p, 'sanxiu') === -2);
ok('煞气 ≥ 40 → 乱星盟 每年 +1', G.Faction.standing(p, 'luanxing') === 1);

p = mk({ shaQi: 0 });
G.Faction.repute(p, 'xingque', -10);
G.Faction.tick(12);
ok('无煞气 → 声望每年回暖 1 点', G.Faction.standing(p, 'xingque') === -9);

section('【5】追杀令触发');
p = mk({});
G.Faction.repute(p, 'xingque', -50);
_rand = 0.01;   // 必定掷中
G.Faction.tick(1);
ok('声望低于阈值 → 发追杀令', !!p.factionHunt && p.factionHunt.faction === 'xingque');
ok('追杀令挂到事件面板', !!p.pendingEvent && p.pendingEvent.eventId === 'hunt_xingque');

p = mk({});
G.Faction.repute(p, 'xingque', -50);
G.Faction.issueHunt(p, 'xingque');
G.Faction.tick(1);
ok('已有一张追杀令 → 不叠加', p.factionHunt.since === 0);

p = mk({});
G.Faction.repute(p, 'xingque', -10);   // 未过阈值
_rand = 0.01;
G.Faction.tick(1);
ok('未过阈值 → 不发追杀令', !p.factionHunt && !p.pendingEvent);

p = mk({});
G.Faction.repute(p, 'xingque', -50);
p.pendingEvent = { eventId: 'heart_demon' };   // 手头有事
_rand = 0.01;
G.Faction.tick(1);
ok('手头有事件 → 不打断、不发追杀令', !p.factionHunt);

section('【6】findEvent 能取到追杀令事件');
const ev = G.Core.findEvent('hunt_xingque');
ok('findEvent(hunt_xingque) 命中', !!ev && ev.id === 'hunt_xingque');
ok('findEvent 未知 id 返回 null', G.Core.findEvent('no_such_event_xyz') === null);

section('【7】追杀令三选一');
// 遁走
p = mk({ spiritStones: 1000 });
G.Faction.repute(p, 'xingque', -50);
G.Faction.issueHunt(p, 'xingque');
started.length = 0;
G.Core.resolveEventOutcomes([{ type: 'hunt', action: 'escape' }]);
ok('遁走扣 300 灵石', p.spiritStones === 700);
ok('遁走清除追杀令', p.factionHunt === null);
ok('遁走声望回 8 点', G.Faction.standing(p, 'xingque') === -42);
ok('遁走不发起战斗', started.length === 0);

// 献金求和
p = mk({ spiritStones: 5000 });
G.Faction.repute(p, 'xingque', -50);
G.Faction.issueHunt(p, 'xingque');
started.length = 0;
G.Core.resolveEventOutcomes([{ type: 'hunt', action: 'bribe' }]);
ok('献金扣 800 + 恶名×20 = 1800', p.spiritStones === 3200);
ok('献金清除追杀令', p.factionHunt === null);
ok('献金声望回 30 点', G.Faction.standing(p, 'xingque') === -20);
ok('献金不发起战斗', started.length === 0);

// 付不起 → 退化成死战（不留死选项）
p = mk({ spiritStones: 100 });
G.Faction.repute(p, 'xingque', -50);
G.Faction.issueHunt(p, 'xingque');
started.length = 0;
G.Core.resolveEventOutcomes([{ type: 'hunt', action: 'escape' }]);
ok('付不起遁走 → 自动转为死战', started.length === 1 && started[0] === 'xingque_hunter');
ok('死战后悬赏作废', p.factionHunt === null);

p = mk({ spiritStones: 100 });
G.Faction.repute(p, 'xingque', -50);
G.Faction.issueHunt(p, 'xingque');
started.length = 0;
G.Core.resolveEventOutcomes([{ type: 'hunt', action: 'bribe' }]);
ok('付不起献金 → 自动转为死战', started.length === 1 && started[0] === 'xingque_hunter');

console.log('\n=== 结果: ' + pass + ' passed, ' + fail + ' failed ===');
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
