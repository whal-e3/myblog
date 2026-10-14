/* Synthetic service contract tests; no API calls or real train identifiers. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
global.window={};
require(path.join(root,'src/trains.js'));
require(path.join(root,'src/simulation.js'));
const D=JSON.parse(fs.readFileSync(path.join(root,'data/network.json'),'utf8'));
const profile=JSON.parse(fs.readFileSync(path.join(root,'data/train-density-profile.json'),'utf8'));
const T=window.SeoulTrains,create=()=>window.SeoulSimulation.create(D,T,{profile,seed:'test-seed'});
const at=(hour,date='2026-10-14')=>Date.parse(`${date}T${hour}:00+09:00`);
const sim=create();
let tests=0;
function check(name,fn){fn();tests++;console.log('PASS',name);}

check('Every mapped Seoul-area route has a connected simulated corridor and train',()=>{
  assert.equal(D.lines.length,24);
  assert.equal(sim.routesByLine.length,24);
  for(let li=0;li<D.lines.length;li++){
    const route=sim.routesByLine[li],trains=sim.fleet.trains.filter(t=>t.line===li);
    assert.ok(route.length>0,D.lines[li].name);
    assert.ok(trains.length>=route.length,D.lines[li].name);
    const expected=new Set(D.segments.filter(e=>e.line===li).flatMap(e=>[e.a,e.b]));
    const covered=new Set(route.flatMap(r=>r.ids));
    assert.deepEqual([...covered].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b),D.lines[li].name+' station coverage');
    for(const r of route){
      assert.ok(r.cycleMs>0&&r.path.total>0);
      for(let i=0;i<r.ids.length-1;i++){
        assert.ok(D.segments.some(e=>e.line===li&&((e.a===r.ids[i]&&e.b===r.ids[i+1])||(e.b===r.ids[i]&&e.a===r.ids[i+1]))),D.lines[li].name+' connected edge');
      }
    }
  }
});

check('Single profile snapshot anchors density; no API-style train report fields are fabricated',()=>{
  assert.equal(profile.coverage.typicalCoverage,false);
  assert.equal(sim.baseline[D.lines.findIndex(l=>l.id==='2')],profile.samples[0].routes['2'].fresh);
  assert.equal(sim.baseline[D.lines.findIndex(l=>l.id==='인천1')],8);
  assert.ok(sim.activeCount(at('16:30'))>250&&sim.activeCount(at('16:30'))<350);
  for(const train of sim.fleet.trains){
    assert.equal(train.simulated,true);
    assert.match(train.key,/^simulation:/);
    assert.match(train.number,/^SIM /);
    assert.equal(train.observedAt,undefined);
    assert.equal(train.receivedAt,undefined);
  }
});

check('Every corridor is represented during the seeded afternoon service',()=>{
  for(let li=0;li<D.lines.length;li++){
    const active=sim.fleet.trains.filter(t=>t.line===li&&sim.isActive(t,at('16:30')));
    assert.equal(new Set(active.map(t=>t.route.index)).size,sim.routesByLine[li].length,D.lines[li].name);
  }
});

check('KST service density is quiet overnight and varies by day type',()=>{
  assert.equal(sim.activeCount(at('02:00')),0);
  assert.ok(sim.activeCount(at('18:00'))>sim.activeCount(at('23:00')));
  assert.ok(sim.activeCount(at('08:00'))>sim.activeCount(at('08:00','2026-10-17')));
  assert.equal(sim.activeCount(at('16:30')),Object.values(sim.lineCounts(at('16:30'))).reduce((a,b)=>a+b,0));
});

check('A quarter-hour count needs observations on two different KST dates',()=>{
  const sample=(date,count)=>({sampledAtKST:`${date}T14:03:00+09:00`,bucketKST:{dayType:'weekday',hour:14,quarter:0},routes:{'2':{fresh:count}}});
  const epoch=at('14:00','2026-10-16');
  const one=createWith([sample('2026-10-14',3),sample('2026-10-14',5)]);
  assert.notEqual(one.lineCounts(epoch)['2'],4,'two polls on one date must not establish a usual count');
  const two=createWith([sample('2026-10-14',3),sample('2026-10-15',5)]);
  assert.equal(two.lineCounts(epoch)['2'],4,'different dates support the 14:00–14:14 KST bucket');
  assert.notEqual(two.lineCounts(at('14:15','2026-10-16'))['2'],4,'the next unobserved quarter keeps the model fallback');
  function createWith(extra){return window.SeoulSimulation.create(D,T,{profile:{...profile,samples:[...profile.samples,...extra]},seed:'test-seed'});}
});

check('Train poses move smoothly on route geometry and remain deterministic',()=>{
  const first=sim.fleet.trains.find(t=>t.line===1),other=create().fleet.trains.find(t=>t.line===1);
  for(const elapsed of [0,3000,23000,183000,630000]){
    const p=sim.pose(first,elapsed,.03),q=create().pose(other,elapsed,.03);
    assert.deepEqual([p.x,p.z,p.dx,p.dz],[q.x,q.z,q.dx,q.dz]);
    assert.ok(p.cars.length===4&&p.cars.every(c=>[c.x,c.z,c.dx,c.dz].every(Number.isFinite)));
  }
  const route=first.route,event=route.events.find(e=>e.kind==='travel'&&e.durationMs>3000);
  const start=event.startMs-first.phaseMs+event.durationMs*.4;
  const a=sim.pose(first,start,.03),b=sim.pose(first,start+1000,.03);
  const moved=Math.hypot(a.x-b.x,a.z-b.z);
  assert.ok(moved>.00001&&moved<.08,`1s displacement ${moved}`);
  assert.deepEqual([sim.pose(first,start,.03,false).x,sim.pose(first,start,.03,false).z],[a.x,a.z]);
});

check('Station dwell holds position and inspector says simulation, not live',()=>{
  const train=sim.fleet.trains[0],dwell=train.route.events.find(e=>e.kind==='dwell'&&e.durationMs>12000);
  const elapsed=dwell.startMs-train.phaseMs+1000;
  const a=sim.pose(train,elapsed,.03),b=sim.pose(train,elapsed+8000,.03);
  assert.deepEqual([a.x,a.z],[b.x,b.z]);
  const details=sim.details(train,elapsed);
  assert.equal(details.simulated,true);
  assert.equal(details.status,'At station');
  assert.ok(details.station?.ko&&details.nextStation?.ko&&details.destination&&details.corridor);
  assert.equal(details.observedAt,undefined);
});

console.log(`${tests} simulation checks passed`);
