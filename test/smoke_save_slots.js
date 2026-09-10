/* 多档位存档 + 官方筑基期预设存档 验证
 * 复用 smoke3_storage 的 headless 桩（localStorage 桩 + uiStub），
 * 覆盖：档位隔离、存读删、激活档跟踪、预设角色字段正确、预设存读往返，
 * 以及 save/load/hasSave/clear 兼容快捷接口仍作用于激活档。 */
var fs=require('fs'),path=require('path'),vm=require('vm');
var BASE=path.resolve('.');
var _store={};
var localStub={ getItem:function(k){return (k in _store)?_store[k]:null;}, setItem:function(k,v){_store[k]=String(v);}, removeItem:function(k){delete _store[k];} };
var uiStub={ log:function(){}, updateUI:function(){}, autoSave:function(){}, setDead:function(){}, doLoad:function(){}, renderOrigin:function(){}, initLogs:function(){} };
var sandbox={}; sandbox.window=sandbox; sandbox.console=console; sandbox.GAME={UI:uiStub};
Object.defineProperty(sandbox,'localStorage',{value:localStub,configurable:true});
sandbox.Math=Object.create(Math); sandbox.Math.random=function(){return 0.5;};
vm.createContext(sandbox);
['data/realms.js','data/realms_foundation.js','data/items.js','data/events.js','data/world.js','data/content.js','js/state.js','js/storage.js'].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(BASE,f),'utf8'),sandbox,{filename:f});
});
var G=sandbox.GAME, pass=0, fail=0;
function ok(name,cond){ if(cond){pass++;console.log('  ✓ '+name);} else {fail++;console.log('  ✗ FAIL: '+name);} }

// —— 档位配置与初始态 ——
ok('档位数 = 6', G.Storage.SLOT_COUNT===6);
ok('初始全空档', G.Storage.listSlots().every(function(s){return !s.name;})===true);

// —— 存入档位 2 ——
G.State.createNewPlayer('hunter');
var p=G.State.p(); p.realmIndex=5; p.spiritStones=123; p.inventory['herb_bainian']=2;
G.Storage.saveToSlot(2, '测试档', true);
ok('档位2已写入', G.Storage.hasSlot(2)===true);
ok('listSlots 档位2有名字', G.Storage.listSlots()[2].name==='测试档');
ok('其他档位仍空', G.Storage.listSlots()[0].name===null && G.Storage.listSlots()[3].name===null);

// —— 存入档位 4，验证隔离 ——
G.State.createNewPlayer('yaopu');
var p2=G.State.p(); p2.realmIndex=8; p2.spiritStones=999;
G.Storage.saveToSlot(4, '另一档', true);
ok('档位4隔离(境界=8)', G.Storage.listSlots()[4].realmIndex===8);
ok('档位2不受扰动(境界=5)', G.Storage.listSlots()[2].realmIndex===5);

// —— 读档位2 ——
G.State.createNewPlayer('hunter');
var loaded=G.Storage.loadFromSlot(2);
ok('loadFromSlot(2) 成功', loaded===true);
ok('档位2 境界还原', G.State.p().realmIndex===5);
ok('档位2 灵石还原', G.State.p().spiritStones===123);
ok('激活档切换为2', G.Storage.getActiveSlot()===2);

// —— 删档位4 不影响档位2 ——
G.Storage.clearSlot(4);
ok('档位4已删', G.Storage.hasSlot(4)===false);
ok('删档不影响档位2', G.Storage.hasSlot(2)===true);

// —— 官方筑基期预设 ——
var zp=G.State.createZhujiPreset();
ok('预设 realmIndex=13(筑基一层)', zp.realmIndex===13);
ok('预设 气血上限=350', zp.maxHp===350);
ok('预设 法力上限=120', zp.maxMp===120);
ok('预设 大衍决四层满(spiritBonus=85, dayanLevel=4)', zp.spiritBonus===85 && zp.dayanLevel===4);
ok('预设 神识上限=100', G.DATA.foundationMaxSpirit(zp)===100);
ok('预设 筑基丹×4', zp.inventory['pill_zhuji']===4);
ok('预设 终局三物齐全', zp.inventory['dawei_zhuzhu']===1 && zp.inventory['mid_stone']===5 && zp.inventory['xiufu_zhenpan']===1);
ok('预设 青云剑已装备', zp.equipment.mainWeapon==='artifact_qingyun');

// —— 预设存读往返 ——
G.Storage.saveToSlot(0, '筑基期预设', true);
G.State.createNewPlayer('hunter');
var zl=G.Storage.loadFromSlot(0);
ok('预设存读往返成功', zl===true && G.State.p().realmIndex===13 && G.State.p().spiritStones===3000);

// —— 兼容快捷接口作用于激活档 ——
G.Storage.save(true);
ok('save() 作用于激活档', G.Storage.hasSave()===true);

console.log('\n结果: '+pass+' passed, '+fail+' failed');
process.exit(fail>0?1:0);
