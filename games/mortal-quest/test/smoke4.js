/* =========================================================
 * test/smoke4.js —— 苍梧门篇三大模块无头测试
 * ① 暗技与武学连携（青木功/流烟步/眨眼剑法/暗器首回合）
 * ② 随从铁奴玄傀（激活/肉身抵挡/象甲重击/日常派遣）
 * ③ 玄机子与夺舍对决（突破触发/三阶段流转/阴毒倒计时/暖阳解除）
 * 运行：node test/smoke4.js
 * ========================================================= */
var fs = require('fs'), path = require('path'), vm = require('vm');
var BASE = path.resolve('.');

// 本地 localStorage 桩
var _store = {};
var localStorageStub = {
    getItem: function (k) { return (k in _store) ? _store[k] : null; },
    setItem: function (k, v) { _store[k] = String(v); },
    removeItem: function (k) { delete _store[k]; }
};

// UI 桩：吞掉所有渲染/日志/存档动作
var uiStub = {
    log: function () {}, updateUI: function () {}, autoSave: function () {}, setDead: function () {},
    renderMo: function () {}, renderCompanion: function () {}, renderCombat: function () {},
    renderBag: function () {}, renderOrigin: function () {}, initLogs: function () {}, doLoad: function () {}
};

var sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.GAME = { UI: uiStub };
Object.defineProperty(sandbox, 'localStorage', { value: localStorageStub, configurable: true });
sandbox.Math = Object.create(Math);
vm.createContext(sandbox);

// 加载顺序与 index.html 一致
['data/realms.js', 'data/items.js', 'data/skills.js', 'data/events.js', 'data/world.js',
 'data/content.js', 'js/state.js', 'js/storage.js', 'js/combat.js', 'js/core.js',
 'js/moEvent.js', 'js/market.js', 'js/sect.js', 'js/blackmarket.js', 'js/trial.js']
    .forEach(function (f) {
        vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
    });

var G = sandbox.GAME;
var pass = 0, fail = 0, ran = 0;
function ok(name, cond) {
    ran++;
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ FAIL: ' + name); }
}
// 稳定随机：可注入
var _rand = 0.5;
sandbox.Math.random = function () { return _rand; };
function setRand(v) { _rand = v; }

// 干净玩家
function reset() {
    G.State.createNewPlayer('wanderer');
    return G.State.p();
}
function add(id, n) { G.State.addItem(id, n || 1); }

console.log('\n【① 暗技与武学连携】');
// 青木功命中/抗性派生
var p = reset(); p.changchunLevel = 4;
var s = G.State.getStats();
ok('青木功4层→命中加成0.20', Math.abs(s.hit - 0.20) < 1e-9);
ok('青木功4层→异常抗性0.40', Math.abs(s.resist - 0.40) < 1e-9);

// 流烟步：耗30%气血、本回合规避、下回合脱力
p = reset(); G.Combat.start('wolf'); // wolf hp55 atk9
var hpBefore = p.currentHp;
G.Combat.luoyan();
ok('流烟步设脱力', p.combat.exhausted === true);
ok('流烟步本回合规避(敌未额外伤害)', p.combat.evade === false && p.currentHp === hpBefore - Math.max(1, Math.ceil(hpBefore * 0.30)));
ok('流烟步扣约30%气血', p.currentHp <= Math.ceil(hpBefore * 0.70) + 1 && p.currentHp > 0);
// 下回合 attack 触发 _consumeExhausted：脱力清空、敌方行动
G.Combat.attack();
ok('脱力后清除', p.combat.exhausted === false);

// 眨眼剑法：白日 + 反光短剑 → 敌目眩2回合
p = reset(); add('mirror_short_sword'); G.Combat.start('wolf');
G.Combat.useBlinkSword();
ok('眨眼剑法→敌目眩(本回合+下回合共2回合，本回合已耗1)', p.combat.blind && p.combat.blind.turns === 1);
// 无短剑则不可施展
p = reset(); G.Combat.start('wolf');
var beforeBlind = p.combat.blind;
G.Combat.useBlinkSword();
ok('无反光短剑→不触发目眩', beforeBlind === null && p.combat.blind === null);

// 玉带软剑首回合瞬发
p = reset(); add('yudai_soft_sword'); G.Core.equipDarkWeapon('yudai_soft_sword');
G.Combat.start('wolf');
ok('玉带软剑首回合瞬发14伤', p.combat.hp === 55 - 14);

// 淬毒筒首回合喷毒流血
p = reset(); add('dujin_tong'); G.Core.equipDarkWeapon('dujin_tong');
G.Combat.start('wolf');
ok('淬毒筒首回合喷毒流血', p.combat.bleed && p.combat.bleed.turns === 3 && p.combat.bleed.dmg === 5);

console.log('\n【② 随从铁奴玄傀】');
// 无摄魂钟无法激活
p = reset(); G.Core.activateCompanion();
ok('无摄魂钟→不激活', p.companion === null);
// 有摄魂钟激活
p = reset(); add('yinhun_zhong'); G.Core.activateCompanion();
ok('摄魂钟激活玄傀', p.companion && p.companion.id === 'quhun' && p.companion.hp === 200);
ok('激活后摄魂钟消耗', G.State.countItem('yinhun_zhong') === 0);

// 肉身抵挡：本回合替玩家扛伤害（blockNext 在敌方回合消耗）
p = reset(); add('yinhun_zhong'); G.Core.activateCompanion(); G.Combat.start('wolf');
var compHp0 = p.companion.hp, pHp0 = p.currentHp;
G.Combat.companionBlock();
ok('玄傀肉身抵挡→替玩家扛伤(玄傀掉血/玩家不掉)', p.companion.hp < compHp0 && p.currentHp === pHp0);

// 象甲重击：按生命上限30%钝击
p = reset(); add('yinhun_zhong'); G.Core.activateCompanion(); G.Combat.start('trial_elite_mo'); // hp100
G.Combat.companionSmash();
ok('象甲重击=30%生命上限(60)', p.combat.hp === 100 - 60);

// 日常派遣：药田除草增灵石+草药，耗时6月
p = reset(); add('yinhun_zhong'); G.Core.activateCompanion();
var stones0 = p.spiritStones, months0 = p.totalMonths;
G.Core.dispatchCompanion('weed');
ok('派遣药田→灵石增加', p.spiritStones > stones0);
ok('派遣药田→耗时6月', p.totalMonths === months0 + 6);

console.log('\n【③ 玄机子与夺舍对决】');
// 突破练气四层触发（realmIndex 2→3）
p = reset(); p.realmIndex = 2; p.currentExp = 9999; p.changchunLevel = 4;
setRand(0.01); // 强制突破成功
G.Core.breakthrough();
ok('突破练气四层→触发玄机子', p.moEvent && p.moEvent.stage === 1);
ok('玄机子触发后青木功+1', p.changchunLevel === 5);

// 阶段一：未佩护心镜→扣50%气血
p = reset(); p.moEvent = { stage: 1 }; p.maxHp = 100; p.currentHp = 100;
G.MoEvent.actStage1();
ok('阶段一未佩护心镜→扣50%气血', p.currentHp === 50);
ok('阶段一后转入阶段二(战斗)', p.moEvent.stage === 2 && !!p.combat);

// 阶段一：佩护心镜→卸力，气血不减
p = reset(); add('mirror_armor'); G.Core.equipArmor('mirror_armor');
p.moEvent = { stage: 1 }; p.maxHp = 100; p.currentHp = 100;
G.MoEvent.actStage1();
ok('阶段一佩护心镜→气血不减', p.currentHp === 100);
ok('护心镜后转入阶段二', p.moEvent.stage === 2 && !!p.combat);

// 阶段二胜利→afterStage2Win→阶段三
p = reset(); p.moEvent = { stage: 2 }; G.Combat.start('mo_daifu');
p.combat.hp = 5;
G.Combat.victory();
ok('阶段二胜→进入阶段三(识海)', p.moEvent.stage === 3 && p.combat === null);

// 阶段二战败（气血耗尽）→enterSoul→阶段三（不死亡）
p = reset(); p.moEvent = { stage: 2 }; G.Combat.start('mo_daifu');
p.currentHp = 1;
G.Combat.defeat();
ok('阶段二败→撞入识海(不死亡)', p.moEvent.stage === 3 && p.isDead === false);

// 阶段三吞噬：摄魂钟镇魂提升成功率并执行结算
p = reset(); p.moEvent = { stage: 3 }; p.changchunLevel = 4; add('yinhun_zhong');
setRand(0.01); // 必成功
G.MoEvent.swallow(1);
ok('吞噬成功→通关结算(clear moEvent)', p.moEvent === null && p.moEventDone === true);
ok('通关青木功续篇+6层', p.changchunLevel === 10);
ok('通关获体内阴毒(24月)', p.yindu && p.yindu.months === 24);
ok('通关发放摄魂钟(尚未激活玄傀)', p.companion === null && G.State.countItem('yinhun_zhong') === 2); // 预置1 + 奖励1
// 玩家于「随从」处催动摄魂钟激活玄傀（消耗摄魂钟）
G.Core.activateCompanion();
ok('摄魂钟激活玄傀随从', p.companion && p.companion.id === 'quhun');
ok('激活消耗摄魂钟', G.State.countItem('yinhun_zhong') === 1);

// 体内阴毒倒计时归零→道消身陨
p = reset(); p.yindu = { months: 24 };
setRand(0.5);
G.Core.passTime(24);
ok('阴毒到期→道消身陨', p.isDead === true && p.deathReason.indexOf('阴毒') >= 0);

// 暖阳宝玉解除阴毒
p = reset(); p.yindu = { months: 24 }; add('nuan_yang_bao_yu');
G.Core.takePill('nuan_yang_bao_yu');
ok('暖阳宝玉→阴毒解除', p.yindu === null);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed (共 ' + ran + ' 项)');
process.exit(fail > 0 ? 1 : 0);
