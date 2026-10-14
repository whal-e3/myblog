/* Deterministic client-model tests; synthetic records, not live evidence. */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');global.window={};
require(path.join(root,'src/trains.js'));require(path.join(root,'src/live.js'));
const D=JSON.parse(fs.readFileSync(path.join(root,'data/network.json'),'utf8')),T=window.SeoulTrains;
const live=window.SeoulLive.create(D,T),iso=(offset=0)=>new Date(Date.now()+offset*1000).toISOString();
let tests=0;function check(name,f){f();tests++;console.log('PASS',name);}
function row(station='강남',changes={}){return {key:'2:TEST:2001',lineId:'2',number:'TEST-2001',stationName:station,observedAt:iso(-5),direction:'0',status:'1',...changes};}
function apply(rows,changes={}){live.apply({configured:true,enabledLines:['2'],serverTime:iso(),lines:[{lineId:'2',state:'ok',trains:rows}],...changes});}
check('No simulated fleet entry point',()=>assert.equal(T.createFleet,undefined));
check('Station aliases',()=>{assert.equal(live.resolve(0,'서울').ko,'서울역');assert.equal(live.resolve(0,'서울역').ko,'서울역');assert.equal(live.resolve(1,'강남(역삼세무서)').ko,'강남');assert.equal(live.resolve(1,'Unknown'),null);});
check('Report anchor, no clock-based movement',()=>{apply([row()]);const t=live.fleet.trains[0];for(const clock of [0,1,1000,10000]){const p=live.pose(t,clock,.03,false);assert.equal(p.x,t.station.x);assert.equal(p.z,t.station.z);assert.equal(p.cars.length,4);assert.ok(p.cars.every(c=>[c.x,c.z,c.dx,c.dz].every(Number.isFinite)));}});
check('Same timestamp updates metadata',()=>{const last=live.fleet.trains[0];apply([row('강남',{observedAt:last.observedAt,status:'2',destination:'성수'})]);assert.equal(live.fleet.trains[0].status,'2');assert.equal(live.fleet.trains[0].destination,'성수');});
check('Regressing report cannot rewind',()=>{apply([row('선릉',{observedAt:iso(-50)})]);assert.equal(live.fleet.trains[0].station.ko,'강남');});
check('Adjacent changes have bounded visual transition',()=>{apply([row('역삼',{observedAt:iso(-1)})]);const t=live.fleet.trains[0];assert.ok(t.transition);assert.equal(t.transition.duration,1200);t.transition.start-=2000;const p=live.pose(t,0,.03,true);assert.equal(p.x,t.station.x);assert.equal(p.z,t.station.z);});
check('Non-adjacent reports do not invent a connecting route',()=>{apply([row('홍대입구',{observedAt:iso()})]);assert.equal(live.fleet.trains[0].transition,null);});
check('Unknown and future timestamps excluded',()=>{apply([row('강남',{observedAt:null}),row('강남',{key:'future',observedAt:iso(100)})]);assert.equal(live.fleet.trains.length,0);assert.equal(live.source.stats.unknownTime,1);assert.equal(live.source.stats.expired,1);});
check('Old station report stale, then expires',()=>{apply([row('강남',{observedAt:iso(-100)})]);const t=live.fleet.trains[0];assert.equal(live.quality(t),'stale');t.observedAt=iso(-400);assert.equal(live.quality(t),'expired');apply([row('강남',{observedAt:iso(-400)})]);assert.equal(live.fleet.trains.length,0);});
check('Connection error does not refresh observation time',()=>{apply([row()]);const t=live.fleet.trains[0],stamp=t.observedAt;live.fail('TEST OUTAGE');assert.equal(live.quality(t),'stale');assert.equal(t.observedAt,stamp);});
check('No report means no trains',()=>{apply([]);assert.equal(live.fleet.trains.length,0);});
check('Multiple route reports use their own mapped stations',()=>{
 const first={...row('서울역'),key:'1:TEST:1001',lineId:'1',number:'TEST-1001'};
 live.apply({configured:true,enabledLines:['1','2'],supportedLines:['1','2'],serverTime:iso(),lines:[
  {lineId:'1',state:'ok',trains:[first]},
  {lineId:'2',state:'ok',trains:[row('강남',{key:'2:TEST:2002'})]},
 ]});
 assert.deepEqual(live.fleet.trains.map(t=>D.lines[t.line].id),['1','2']);
 assert.deepEqual(live.fleet.trains.map(t=>t.station.ko),['서울역','강남']);
 assert.equal(live.source.supportedLines.length,2);
});
check('One route failure does not mark another route stale',()=>{
 const first={...row('서울역'),key:'1:TEST:1001',lineId:'1',number:'TEST-1001'};
 live.apply({configured:true,enabledLines:['1','2'],supportedLines:['1','2'],serverTime:iso(),lines:[
  {lineId:'1',state:'error',message:'Fixture outage',trains:[first]},
  {lineId:'2',state:'ok',trains:[row('강남',{key:'2:TEST:2002'})]},
 ]});
 assert.equal(live.source.state,'connected');
 assert.deepEqual(live.fleet.trains.map(t=>live.quality(t)),['stale','fresh']);
});
check('Explicit provider-observed station fallbacks use existing points',()=>{
 for(const [lineId,name,stationId] of [
  ['GTX-A','성남',619],['공항철도','디지털미디어시티',250],['경춘','용산',49],['W','삼양',433],
 ]){
  const line=D.lines.findIndex(l=>l.id===lineId);
  assert.equal(live.resolve(line,name)?.id,stationId,`${lineId} ${name}`);
  assert.equal(live.resolve(line,'UNVERIFIED STATION'),null);
 }
});
console.log(`${tests} client-model cases passed; synthetic fixtures only.`);
