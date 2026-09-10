'use strict';
/* =========================================================
 * test/smoke_wild.js —— 大地图扩充（修为门槛节点 / 路遇怪带 / 分档狩猎）无头测试
 *   ① 舆图：未达标节点也展示（名称 + 需 X 以上 + 预告词）
 *   ② 路遇：外出按修为随机遇敌；rand<概率才触发
 *   ③ 狩猎：境界不足被拒；连战全清得装备；败北软着陆不死
 * 运行： node test/smoke_wild.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.resolve(__dirname, '..');
const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, renderBlack: function () {}, renderTrial: function () {},
  renderTrack: function () {}, renderCombat: function () {}, toggleTalismans: function () {},
};
let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills.js',
  'data/skills_foundation.js', 'data/items_foundation.js',
  'data/events.js', 'data/world.js', 'data/worldmap.js', 'data/content.js',
  'data/qixuan_events.js', 'data/demon_war_events.js', 'data/dungeon_heisha.js', 'data/wild_dungeons.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/market.js', 'js/map.js',
  'js/sect.js', 'js/puppet.js', 'js/insect.js', 'js/cave2.js',
  'js/cultivation.js', 'js/alchemy.js', 'js/bottle.js', 'js/bonds.js',
  'js/dungeon_heisha.js', 'js/hunt.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function assert(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function reset(realmIndex, loc) {
  G.State.createNewPlayer('hunter');
  const p = G.State.p();
  if (realmIndex != null) p.realmIndex = realmIndex;
  if (loc) p.location = loc;
  logs.length = 0;
  return p;
}
function setRand(v) { _rand = v; }

// ============ ① 舆图展示 ============
console.log('==== 一、舆图：未达标节点先亮相（验收①） ====');
{
  const p = reset(6, "jiayuan_cheng");   // 练气七层
  const atlas = G.Map.atlas();
  const yj = atlas.find(n => n.id === "yuejing_cheng");
  const sea = atlas.find(n => n.id === "luanxing_hai");
  assert('云京在舆图上可见（未解锁也展示）', !!yj && yj.unlocked === false);
  assert('云京展示所需境界（筑基一层）', yj.reqRealmName === '筑基一层');
  assert('云京带预告词（幽冥教）', yj.teaser.indexOf('幽冥教') >= 0);
  assert('碎星海在舆图上可见（远期预告）', !!sea && sea.unlocked === false && sea.teaser.indexOf('结丹') >= 0);

  // 通行检定：修为不足走不到云京
  const rt = G.Map.routes().find(r => r.targetId === "yuejing_cheng");
  assert('从景阳城可望云京之路', !!rt);
  assert('练气七层动身赴云京被拒', G.Map.canTravel(rt.id).ok === false);
  p.realmIndex = 13;   // 筑基一层
  p.silver += 500;     // 补足云京路引盘缠（200 两）
  assert('筑基一层可赴云京', G.Map.canTravel(rt.id).ok === true);
}

// ============ ② 路遇怪带 ============
console.log('==== 二、外出路遇：按修为匹配怪带（验收②） ====');
{
  const p = reset(3, "shenshou_gu");   // 练气四层
  p.silver = 500;
  setRand(0.5);                        // 0.5 ≥ 0.25 → 不遇敌
  G.Map.travel("r_sg_qn");
  assert('掷点未中则一路无事（不进战斗）', !p.combat && p.location === "qingniu_zhen");

  // 掷点命中：0.1 < 0.25 → 遇敌，且只在练气怪带（风行狼/劫道散修/碧毒蟒）里挑
  p.location = "shenshou_gu";
  setRand(0.1);
  const wild = ["wild_fenglang", "wild_sanxiu", "wild_dushe"];
  G.Map.travel("r_sg_qn");
  assert('掷点命中触发路遇战斗', !!p.combat);
  assert('练气四层只遇练气怪带（' + p.combat.name + '）', wild.indexOf(p.combat.def.id) >= 0);
  p.combatRoute = null; G.Combat.end();

  // 筑基修为：怪带切换到二阶妖兽
  p.location = "shenshou_gu"; p.silver = 900; p.realmIndex = 13;
  setRand(0.2);
  G.Map.travel("r_sg_jy");             // 4 月路途
  const zhuji = ["wild_qingbao", "wild_wugong"];
  assert('筑基一层路遇二阶妖兽带（' + (p.combat ? p.combat.name : "未遇") + '）',
    !p.combat || zhuji.indexOf(p.combat.def.id) >= 0 || p.combat.def.id === "wild_moxiu");
  if (p.combat) { p.combatRoute = null; G.Combat.end(); }
}

// ============ ③ 分档狩猎 ============
console.log('==== 三、狩猎副本：境界门槛 / 连战 / 软着陆（验收③） ====');
{
  // 门槛
  const p = reset(3);
  assert('魔修弃营（筑基三层门槛）对练气四层关闭', G.Hunt.canEnter("hunt_shashen").ok === false);
  assert('黑石矿洞（练气五层门槛）对练气四层关闭', G.Hunt.canEnter("hunt_heishikuang").ok === false);
  p.realmIndex = 4;
  assert('练气五层可入黑石矿洞', G.Hunt.canEnter("hunt_heishikuang").ok === true);

  // 连战三波全清
  setRand(0.5);
  assert('入山触发第一波', G.Hunt.enter("hunt_heishikuang") === true && !!p.combat);
  assert('狩猎态挂载（hunt/wave=0）', p.hunt && p.hunt.wave === 0);
  const stones0 = p.spiritStones;
  for (let w = 0; w < 3; w++) {
    p.combat.hp = 1;
    G.Combat.attack();               // 击杀 → victory 路由 → Hunt.afterCombat → 波间暂停
    if (w < 2) G.Hunt.next();        // 继续下一波
  }
  assert('三波全清后狩猎态结束', p.hunt === null && !p.combat);
  assert('通关必得装备其一', G.State.countItem("artifact_xuangui") + G.State.countItem("mirror_armor") === 1);
  assert('通关物资入袋（铁矿 ×2）', G.State.countItem("iron_ore") >= 2);
  assert('通关灵石入账（+80~160）', p.spiritStones > stones0);

  // 波间暂停：见好就收 / 继续深入
  p.realmIndex = 6;
  G.Hunt.enter("hunt_wanyao");
  p.combat.hp = 1; G.Combat.attack();       // 第一波胜 → 进入波间暂停
  assert('第一波胜后进入波间暂停（await）', !p.combat && p.hunt && p.hunt.await === true && p.hunt.wave === 1);
  assert('波间可"见好就收"且收获保留', G.Hunt.leave() === true && p.hunt === null && !p.combat);

  // 波间"继续下一波"
  G.Hunt.enter("hunt_wanyao");
  p.combat.hp = 1; G.Combat.attack();
  assert('波间可继续下一波', G.Hunt.next() === true && !!p.combat && p.hunt.await === false);

  // 败北软着陆：不删档不死、狩猎态清空
  G.Hunt.afterCombat(false, { type: "hunt" });
  assert('狩猎败北不判当场身陨（软着陆）', p.isDead === false);
  assert('败北后狩猎态清空', p.hunt === null);
}

// ============ 汇总 ============
console.log('\n==== 结果: ' + pass + ' passed, ' + fail + ' failed ====');
if (fails.length) { console.log('失败项:'); fails.forEach(f => console.log('  - ' + f)); }
process.exit(fail > 0 ? 1 : 0);
