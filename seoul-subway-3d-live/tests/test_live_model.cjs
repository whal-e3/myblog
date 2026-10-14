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
check('Conflicting station at an identical timestamp cannot restart motion',()=>{
 const last=live.fleet.trains[0],station=last.station.id;
 apply([row('역삼',{observedAt:last.observedAt,status:'2'})]);
 assert.equal(live.fleet.trains[0].station.id,station);
 assert.equal(live.fleet.trains[0].transition,null);
});
check('Regressing report cannot rewind',()=>{apply([row('선릉',{observedAt:iso(-50)})]);assert.equal(live.fleet.trains[0].station.ko,'강남');});
check('Adjacent observations interpolate for three seconds and end exactly at the report',()=>{
 apply([row('역삼',{observedAt:iso(-1)})]);const t=live.fleet.trains[0];
 assert.equal(t.transition.kind,'observed');assert.equal(t.transition.duration,3000);
 t.transition.start-=1500;const mid=live.pose(t,0,.03,true);
 assert.ok(Math.hypot(mid.x-t.station.x,mid.z-t.station.z)>.1);
 t.transition.start-=2000;const end=live.pose(t,0,.03,true);
 assert.equal(end.x,t.station.x);assert.equal(end.z,t.station.z);
});
check('Fresh departure estimates only a short part of a unique onward segment',()=>{
 apply([row('역삼',{observedAt:iso(),status:'2'})]);const t=live.fleet.trains[0],m=t.transition;
 assert.equal(m.kind,'estimate');assert.equal(m.duration,3000);
 assert.ok(m.to>0&&m.to<=m.path.total*.06&&m.to<=.08);
 m.start-=1500;const p=live.pose(t,0,.03,true),fixed=live.pose(t,0,.03,false);
 assert.ok(Math.hypot(p.x-t.station.x,p.z-t.station.z)>0);
 assert.equal(fixed.x,t.station.x);assert.equal(fixed.z,t.station.z);
 assert.equal(live.motionKind(t),'estimate');assert.equal(live.interpolating(t),true);
 m.start-=2000;const end=live.pose(t,0,.03,true);
 assert.ok(Math.hypot(end.x-t.station.x,end.z-t.station.z)<.08+.001);
 assert.equal(live.interpolating(t),false);
});
check('Duplicate and newer same-station reports preserve estimated progress',()=>{
 const before=live.fleet.trains[0],start=before.transition.start,observedAt=before.observedAt;
 apply([row('역삼',{observedAt,status:'2',destination:'성수'})]);
 assert.equal(live.fleet.trains[0].transition.start,start);
 assert.equal(live.fleet.trains[0].observedAt,observedAt);
 apply([row('역삼',{observedAt:iso(1),status:'2'})]);
 assert.equal(live.fleet.trains[0].transition.start,start);
});
check('Next adjacent report joins an existing track estimate without rewinding',()=>{
 const old=live.fleet.trains[0];old.transition.start=performance.now()-1500;
 const before=live.pose(old,0,.03,true);
 apply([row('선릉',{observedAt:iso(2),status:'1'})]);
 const next=live.fleet.trains[0],after=live.pose(next,0,.03,true);
 assert.equal(next.transition.kind,'observed');
 assert.ok(Math.hypot(after.x-before.x,after.z-before.z)<.002);
 assert.ok(next.transition.from>0);
 next.transition.start-=3500;const end=live.pose(next,0,.03,true);
 assert.equal(end.x,next.station.x);assert.equal(end.z,next.station.z);
});
check('An unexpected reversal snaps to the new report instead of following the wrong edge',()=>{
 apply([]);apply([row('강남',{observedAt:iso(-5),status:'1'})]);
 apply([row('역삼',{observedAt:iso(-3),status:'1'})]);
 live.fleet.trains[0].transition.start-=3500;
 apply([row('역삼',{observedAt:iso(-1),status:'2'})]);
 assert.equal(live.fleet.trains[0].transition.nextId,live.resolve(1,'선릉').id);
 apply([row('강남',{observedAt:iso(1),status:'1'})]);
 const t=live.fleet.trains[0],p=live.pose(t,0,.03,true);
 assert.equal(t.transition,null);assert.equal(p.x,t.station.x);assert.equal(p.z,t.station.z);
});
check('Branches, non-departed status, and direction changes suppress estimates',()=>{
 apply([]);apply([row('문래',{observedAt:iso(-5),status:'1'})]);
 apply([row('신도림',{observedAt:iso(-3),status:'1'})]);
 live.fleet.trains[0].transition.start-=3500;
 apply([row('신도림',{observedAt:iso(-1),status:'2'})]);
 assert.equal(live.fleet.trains[0].transition,null,'Shindorim has two possible onward edges');
 apply([]);apply([row('강남',{observedAt:iso(-5),status:'1'})]);
 apply([row('역삼',{observedAt:iso(-3),status:'1'})]);
 live.fleet.trains[0].transition.start-=3500;
 apply([row('역삼',{observedAt:iso(-1),status:'1'})]);
 assert.equal(live.fleet.trains[0].transition,null,'at-station report must stay anchored');
 apply([row('역삼',{observedAt:iso(),status:'2',direction:'1'})]);
 assert.equal(live.fleet.trains[0].transition,null,'direction change has no established onward route');
 apply([]);apply([row('강남',{observedAt:iso(-5),direction:'',status:'1'})]);
 apply([row('역삼',{observedAt:iso(-3),direction:'',status:'1'})]);
 live.fleet.trains[0].transition.start-=3500;
 apply([row('역삼',{observedAt:iso(-1),direction:'',status:'2'})]);
 assert.equal(live.fleet.trains[0].transition,null,'unreported direction cannot be estimated');
});
check('Stale, paused, and failed reports cannot display motion',()=>{
 apply([]);apply([row('강남',{observedAt:iso(-5),status:'1'})]);
 apply([row('역삼',{observedAt:iso(-3),status:'1'})]);
 live.fleet.trains[0].transition.start-=3500;
 apply([row('역삼',{observedAt:iso(-1),status:'2'})]);
 const t=live.fleet.trains[0];assert.equal(t.transition.kind,'estimate');
 t.transition.start-=1500;
 t.observedAt=iso(-100);assert.equal(live.motionKind(t),null);
 let p=live.pose(t,0,.03,true);assert.equal(p.x,t.station.x);assert.equal(p.z,t.station.z);
 t.observedAt=iso(-1);live.source.paused=true;assert.equal(live.motionKind(t),null);
 p=live.pose(t,0,.03,true);assert.equal(p.x,t.station.x);
 live.source.paused=false;live.fail('Fixture outage');assert.equal(t.transition,null);assert.equal(live.motionKind(t),null);
});
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
  ['2','신도림지선',70],['7','총신대입구(이수)',601],
  ['공항철도','홍대입구',455],['W','보문',229],
  ['GTX-A','성남',619],['공항철도','디지털미디어시티',250],['경춘','용산',49],['W','삼양',433],
 ]){
  const line=D.lines.findIndex(l=>l.id===lineId);
  assert.equal(live.resolve(line,name)?.id,stationId,`${lineId} ${name}`);
  assert.equal(live.resolve(line,'UNVERIFIED STATION'),null);
 }
 const seven=D.lines.findIndex(l=>l.id==='7'),four=D.lines.findIndex(l=>l.id==='4');
 assert.equal(live.resolve(four,'총신대입구(이수)')?.id,652,'Line 4 keeps its own station point');
 assert.equal(live.resolve(seven,'신도림지선'),null,'fallbacks do not leak across routes');
});
console.log(`${tests} client-model cases passed; synthetic fixtures only.`);
