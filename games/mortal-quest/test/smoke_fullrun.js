'use strict';
/* =========================================================
 * test/smoke_fullrun.js —— 全流程链路验证：练气一层 → 元婴后期
 *
 * 目的：回答「能不能从练气修到元婴」——以真实游戏代码 headless 驱动
 * 一名玩家走完全部 22 个境界（index 0 → 21），验证链路无断裂：
 *   修为来源（刷怪/闭关）→ 破境 → 心魔劫 → 结丹道途 → 碎丹成婴铺路
 *   → 元婴三阶 →（途中）玄机子夺舍对决 → 阴毒倒计时 → 暖阳宝玉解毒
 *
 * 驱动方式（全部走游戏内唯一出口，不平行造桥）：
 *   - G.Core.meditateTimes / G.Core.passTime        闭关与时序
 *   - G.Combat.start + G.Combat.victory             战斗结算（模拟常胜玩家）
 *   - G.Core.breakthrough                          突破入口
 *   - G.Core.chooseEventOption / chooseMercy        事件与战后处置
 *   - G.MoEvent.actStage1 / swallow                 夺舍对决三阶段
 *   - G.Core.takePill("nuan_yang_bao_yu")           阴毒解毒（景阳城求宝的等价路径）
 *
 * Math.random 钉在 0.001：突破必过、事件落首个 outcome、 rand 取下限——
 * 本测试验的是「链路通不通」，不是平衡性。
 *
 * 运行： node test/smoke_fullrun.js
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

let _rand = 0.001;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub, BattleResult: { show: function () {} } };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

// 照 index.html 的顺序加载；剔除 DOM 重的（ui/art/battle_ui/battle_result/scene/storage）
const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills.js',
  'data/events.js', 'data/world.js', 'data/worldmap.js', 'data/content.js',
  'data/qixuan_events.js', 'data/demon_war_events.js', 'data/skills_foundation.js',
  'data/items_foundation.js', 'data/dungeon_heisha.js', 'data/secret_relic.js',
  'data/wild_dungeons.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js',
  'js/plot.js', 'js/mortality.js', 'js/breakthrough.js', 'js/moEvent.js',
  'js/market.js', 'js/map.js', 'js/jiayuan.js', 'js/mansion.js', 'js/tainan.js',
  'js/sect.js', 'js/garden.js', 'js/home.js', 'js/codex.js', 'js/blackmarket.js',
  'js/trial.js', 'js/forbidden_zone.js', 'js/qixuan.js', 'js/puppet.js',
  'js/insect.js', 'js/cave2.js', 'js/cultivation.js', 'js/alchemy.js',
  'js/bottle.js', 'js/bonds.js', 'js/dungeon_heisha.js', 'js/secret_relic.js',
  'js/secret.js', 'js/hunt.js', 'js/teleport_portal.js', 'js/endings.js',
  'js/goals.js', 'js/review.js', 'js/moments.js', 'js/tips.js', 'js/auction.js',
  'js/chronicle.js', 'js/path.js', 'js/seize.js', 'js/yuanying.js', 'js/faction.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

/* ================= 开局：按攻略备货（模拟玩家的资源准备） ================= */
const p = G.State.createNewPlayer('j');
p.armor = 'mirror_armor';                      // 护心镜：卸去玄机子点穴（免 50% 气血）
G.State.addItem('pill_zhuji', 6);              // 筑基丹链：25→45→65→85→100%
G.State.addItem('pill_jiedan', 6);             // 凝丹链（正品优先，普通六枚兜底）
G.State.addItem('herb_qiannian', 3);           // 碎丹成婴·借灵药铺路（另 2 株备用）
G.State.addItem('nuan_yang_bao_yu', 1);        // 暖阳宝玉：驱体内阴毒（景阳城之物的等价）
p.spiritStones = 50000;                        // 灵石：护法/坊市/阵法月耗

/* ================= 驱动辅助 ================= */
function pickFoe() {
  // 选当前境界能打的、exp 最高的野外怪（元婴期放开乱星盟先锋将）
  var mr = G.DATA.majorRealm(p.realmIndex);
  var best = null;
  for (var i = 0; i < G.DATA.MONSTERS.length; i++) {
    var m = G.DATA.MONSTERS[i];
    if (!m || !m.exp || m.exp <= 0) continue;
    if (m.boss || m.trial || m.leitai || m.fzone) continue;
    if (m.majorRealm != null && m.majorRealm > mr) continue;
    if (m.human) continue;                      // 不打人：免挂 mercy/因果，聚焦修炼链
    if (!best || m.exp > best.exp) best = m;
  }
  return best;
}

function pickEventIdx(ev, evId) {
  if (evId === 'yuanying_prep') {
    // 优先灵药铺路（背包有千年灵药时动态裁剪会列出），次选护法/静养；无备硬凝垫底
    for (var i = 0; i < ev.choices.length; i++) {
      var o = ev.choices[i].outcomes[0];
      if (o && o.mode === 'herb') return i;
    }
    for (i = 0; i < ev.choices.length; i++) {
      if (ev.choices[i].outcomes[0] && ev.choices[i].outcomes[0].mode === 'guard') return i;
    }
    for (i = 0; i < ev.choices.length; i++) {
      if (ev.choices[i].outcomes[0] && ev.choices[i].outcomes[0].mode === 'mind') return i;
    }
    return ev.choices.length - 1;
  }
  if (evId === 'heart_demon') return 2;        // 观想本我：+6% 且反噬 -15%，四平八稳
  if (evId === 'choose_path') return 0;        // 体修：覆盖 Path.hpMul 落位链
  return 0;
}

// 通关账本：每个境界达成时的年龄/月数/事件
var trail = [];
var seenEvents = {};
var fights = 0;
var lastIdx = p.realmIndex;   // 循环末尾统一检测境界变化（事件内完成的突破也要记）
var guard = 0;
var brokeAt = null;   // 断链现场

while (p.realmIndex < 21 && !p.isDead && guard++ < 8000) {
  // ① 夺舍对决三阶段（练气四层触发）
  if (p.moEvent && p.moEvent.stage === 1) { G.MoEvent.actStage1(); continue; }
  if (p.moEvent && p.moEvent.stage === 3) { G.MoEvent.swallow(0); continue; }

  // ② 战斗结算
  if (p.combat) { fights++; G.Combat.victory(); G.Core.passTime(1); continue; }

  // ③ 事件抉择
  if (p.pendingEvent) {
    var evId = p.pendingEvent.eventId;
    seenEvents[evId] = (seenEvents[evId] || 0) + 1;
    var ev = G.Core.findEvent(evId);
    if (!ev) { brokeAt = '事件断链：findEvent("' + evId + '") 返回 null'; break; }
    G.Core.chooseEventOption(pickEventIdx(ev, evId));
    continue;
  }

  // ④ 战后处置
  if (p.pendingMercy) { G.Core.chooseMercy(0); continue; }

  // ⑤ 阴毒倒计时：取暖阳宝玉驱毒（等价于走完景阳城玄机世家链）
  if (p.yindu) { G.Core.takePill('nuan_yang_bao_yu'); continue; }

  // ⑥ 修为未满：全程刷怪（静修 +1 修为/周天只是养心的慢功夫，补不起零头）；
  //    每 10 场闭关 2 轮养心境（破境加成：每 10 点心境 +2%）
  var realm = G.DATA.REALMS[p.realmIndex];
  if (realm.needExp != null && p.currentExp < realm.needExp) {
    if (fights > 0 && fights % 20 === 0 && (p.mind || 0) < 30) {
      G.Core.meditateTimes(2); continue;
    }
    var foe = pickFoe();
    if (!foe) { brokeAt = '境界 ' + p.realmIndex + ' 找不到可刷的怪'; break; }
    G.Combat.start(foe.id);
    if (!p.combat) { brokeAt = 'Combat.start("' + foe.id + '") 未进入战斗'; break; }
    continue;
  }

  // ⑦ 圆满 → 突破（心魔劫/铺路事件由 breakthrough 内部挂起，下轮处理）
  G.Core.breakthrough();
  if (p.isDead) { brokeAt = '突破时身陨'; break; }

  // ⑧ 循环末尾统一记录境界推进（含事件链内部完成的突破）
  if (p.realmIndex > lastIdx) {
    trail.push({ idx: p.realmIndex, name: G.DATA.REALMS[p.realmIndex].name, age: p.ageYears, months: p.totalMonths });
    lastIdx = p.realmIndex;
  } else if (p.realmIndex === lastIdx && !p.pendingEvent && !p.moEvent && !p.combat && !p.yindu) {
    var need2 = G.DATA.REALMS[p.realmIndex].needExp;
    if (need2 == null || p.currentExp >= need2) {
      brokeAt = '境界 ' + p.realmIndex + ' 圆满但 breakthrough 无进展（既未挂事件也未突破）';
      break;
    }
  }
}
// 退出前的最后一次突破（事件链内完成）补记
if (p.realmIndex > lastIdx) {
  trail.push({ idx: p.realmIndex, name: G.DATA.REALMS[p.realmIndex].name, age: p.ageYears, months: p.totalMonths });
}

/* ================= 断言 ================= */
section('① 终点：抵达元婴后期');
ok('realmIndex === 21（元婴后期）', p.realmIndex === 21);
ok('maxRealm 记录 21', p.stats.maxRealm === 21);
ok('stats.breakthroughs === 21（0→21 每次 +1）', p.stats.breakthroughs === 21);
ok('全程未身陨', !p.isDead);

section('② 三大天堑全部落地');
var names = trail.map(function (t) { return t.name; });
ok('抵达筑基（13）', names.indexOf('筑基初期') >= 0);
ok('抵达结丹（16）', names.indexOf('结丹初期') >= 0);
ok('抵达元婴（19）', names.indexOf('元婴初期') >= 0);
ok('碎丹成婴叙事入账', logs.some(function (m) { return m.indexOf('元婴成，长生始') >= 0; }));
ok('元婴寿元延至千载', G.State.maxAge() === 1000);

section('③ 事件链路全部走通（无断链）');
ok('心魔劫每次筑基以上突破都过（筑基以上共 9 次突破）', (seenEvents.heart_demon || 0) === 9);
ok('结丹道途抉择发生过', (seenEvents.choose_path || 0) === 1);
ok('碎丹成婴铺路事件发生过', (seenEvents.yuanying_prep || 0) === 1);
ok('夺舍对决后阴毒已解（yindu 清空）', !p.yindu);
ok('无断链记录', !brokeAt);
if (brokeAt) console.log('    断链现场：' + brokeAt);

section('④ 通关账本（攻略数据源）');
console.log('    境界推进（达成时年龄 / 总月数）：');
trail.forEach(function (t) {
  var major = (t.idx === 13 || t.idx === 16 || t.idx === 19) ? '  ←天堑' : '';
  console.log('      ' + String(t.idx).padStart(2) + ' ' + t.name + '　' + t.age + ' 岁 / ' + t.months + ' 月' + major);
});
console.log('    总耗时 ' + p.totalMonths + ' 月（' + (p.totalMonths / 12).toFixed(1) + ' 年），结局年龄 ' + p.ageYears + ' 岁');
console.log('    战斗 ' + fights + ' 场，心境 ' + (p.mind || 0) + ' 点');
console.log('    事件计数：' + JSON.stringify(seenEvents));

section('⑤ 结果：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
