/* headless 验证 storage 存读往返 —— 证明刷新续档的底层链路可靠 */
var fs=require('fs'),path=require('path'),vm=require('vm');
var BASE=path.resolve('.');
// 本地 localStorage 桩
var _store={};
var localStub={ getItem:function(k){return (k in _store)?_store[k]:null;}, setItem:function(k,v){_store[k]=String(v);}, removeItem:function(k){delete _store[k];} };
var uiStub={ log:function(){}, updateUI:function(){}, autoSave:function(){}, setDead:function(){}, doLoad:function(){}, renderOrigin:function(){}, initLogs:function(){} };
var sandbox={}; sandbox.window=sandbox; sandbox.console=console; sandbox.GAME={UI:uiStub};
Object.defineProperty(sandbox,'localStorage',{value:localStub,configurable:true});
sandbox.Math=Object.create(Math); sandbox.Math.random=function(){return 0.5;};
vm.createContext(sandbox);
['data/realms.js','data/items.js','data/events.js','data/world.js','data/content.js','js/state.js','js/storage.js'].forEach(function(f){
  vm.runInContext(fs.readFileSync(path.join(BASE,f),'utf8'),sandbox,{filename:f});
});
var G=sandbox.GAME, pass=0, fail=0;
function ok(name,cond){ if(cond){pass++;console.log('  ✓ '+name);} else {fail++;console.log('  ✗ FAIL: '+name);} }

// 开局 → 改状态 → 存 → 清空 → 读 → 断言还原
G.State.createNewPlayer('hunter');
var p=G.State.p();
p.realmIndex=5; p.currentExp=120; p.spiritStones=888; p.sectContrib=9; p.liquid=3;
p.inventory['herb_bainian']=4; p.achievements=['a1'];
G.Storage.save(true);
ok('存档后 hasSave()=true', G.Storage.hasSave()===true);

// 清空内存中的玩家，模拟刷新
G.State.createNewPlayer('yaopu');   // 不同出身，验证被覆盖
ok('刷新前 realmIndex 已被重置', G.State.p().realmIndex===0);

var loaded=G.Storage.load();
ok('load() 返回 true', loaded===true);
ok('出身被存档覆盖(hunter)', G.State.p().originId==='hunter');
ok('境界还原(5)', G.State.p().realmIndex===5);
ok('修为还原(120)', G.State.p().currentExp===120);
ok('灵石还原(888)', G.State.p().spiritStones===888);
ok('贡献还原(9)', G.State.p().sectContrib===9);
ok('绿液还原(3)', G.State.p().liquid===3);
ok('背包还原(herb_bainian×4)', G.State.p().inventory['herb_bainian']===4);
ok('成就还原', JSON.stringify(G.State.p().achievements)==='["a1"]');

// 删档
G.Storage.clear();
ok('clear 后 hasSave()=false', G.Storage.hasSave()===false);

console.log('\n结果: '+pass+' passed, '+fail+' failed');
process.exit(fail>0?1:0);
