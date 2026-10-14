/* Seoul Subsurface synthetic service, MIT.
 * This is an illustrative animation on the mapped rail graph, NOT a live feed,
 * a timetable, or a prediction. The optional TOPIS profile contains aggregate
 * counts only. A single 2026-10-14 sample cannot establish typical service.
 */
(() => {
  'use strict';
  const KST_MS=9*3600000;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const mod=(n,d)=>((n%d)+d)%d;
  const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
  const km=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  // Fresh route counts in one authenticated 2026-10-14, 16:31 KST survey.
  // These are an illustrative density seed, not normal headways or a complete fleet.
  const surveyFresh={
    '1':42,'2':25,'3':24,'4':26,'5':15,'6':9,'7':19,'8':6,'9':19,
    '공항철도':5,'경의·중앙':13,'경춘':3,'수인·분당':20,'신분당':12,
    '경강':3,'서해':5,'W':9,'Silim':5,'GTX-A':8
  };
  // No position API has been confirmed for these five routes. All values are
  // synthetic defaults, including their train densities.
  const unsupportedDefault={'인천1':8,'I2':7,'김포 골드라인':5,'용인':5,'U':4};
  // Weekday anchors at whole KST hours. Interpolation avoids abrupt daypart
  // jumps. The factors are modelling assumptions, not learned API statistics.
  const weekday=[.12,0,0,0,0,.20,.56,.91,1.07,.93,.78,.80,.83,.84,.86,.91,.96,1.04,1.10,.96,.80,.69,.48,.28,.12];
  const weekend=[.13,0,0,0,0,.15,.34,.57,.70,.75,.81,.87,.90,.91,.91,.91,.89,.85,.78,.70,.61,.50,.37,.22,.13];
  function kstParts(epochMs){
    const d=new Date(epochMs+KST_MS),day=d.getUTCDay();
    return {weekend:day===0||day===6,hour:d.getUTCHours()+d.getUTCMinutes()/60+d.getUTCSeconds()/3600,
      wholeHour:d.getUTCHours(),quarter:Math.floor(d.getUTCMinutes()/15)};
  }
  function curveFactor(hour,isWeekend){const curve=isWeekend?weekend:weekday,h=Math.floor(hour),f=hour-h;return curve[h]+(curve[h+1]-curve[h])*f;}
  function daypartFactor(epochMs){const t=kstParts(epochMs);return curveFactor(t.hour,t.weekend);}
  function profileCount(profile,id){
    const samples=Array.isArray(profile?.samples)?profile.samples:[];
    const estimates=[];
    for(const s of samples){
      const n=Number(s?.routes?.[id]?.fresh);
      if(!Number.isFinite(n)||n<0)continue;
      const b=s.bucketKST||{};
      const hour=Number(b.hour)+Number(b.quarter||0)/4;
      if(!Number.isFinite(hour)||hour<0||hour>=24)continue;
      const factor=curveFactor(hour,b.dayType==='weekend');
      // Normalize daytime samples to the model's 16:30 reference density.
      // Night samples never inflate the fallback baseline by division near 0.
      if(factor>=.35)estimates.push(n/factor);
    }
    if(!estimates.length)return null;
    estimates.sort((a,b)=>a-b);
    return Math.round(estimates[Math.floor(estimates.length/2)]);
  }
  function observedBuckets(profile,D){
    // An individual snapshot is evidence for that moment, not evidence of a
    // usual quarter-hour. Require at least two different KST calendar dates
    // for a route/day-type/quarter before replacing an assumed density.
    const grouped=D.lines.map(()=>new Map());
    const ids=new Map(D.lines.map((l,i)=>[l.id,i]));
    for(const sample of Array.isArray(profile?.samples)?profile.samples:[]){
      const b=sample.bucketKST||{},hour=Number(b.hour),quarter=Number(b.quarter);
      const day=b.dayType,date=String(sample.sampledAtKST||'').slice(0,10);
      if(!['weekday','weekend'].includes(day)||!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(quarter)||quarter<0||quarter>3||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
      const bucket=`${day}:${hour}:${quarter}`;
      for(const [id,row] of Object.entries(sample.routes||{})){
        const li=ids.get(id),count=Number(row?.fresh);if(li===undefined||!Number.isFinite(count)||count<0)continue;
        const perDay=grouped[li].get(bucket)||new Map(),prior=perDay.get(date)||[];
        prior.push(count);perDay.set(date,prior);grouped[li].set(bucket,perDay);
      }
    }
    return grouped.map(buckets=>{
      const supported=new Map();
      for(const [bucket,days] of buckets){
        if(days.size<2)continue;
        const meanByDay=[...days.values()].map(values=>values.reduce((a,b)=>a+b,0)/values.length);
        supported.set(bucket,Math.round(meanByDay.reduce((a,b)=>a+b,0)/meanByDay.length));
      }
      return supported;
    });
  }
  function makeGraph(D,li){
    const stations=new Map(D.stations.map(s=>[s.id,s]));
    const edges=[],adj=new Map();
    for(const raw of D.segments){
      if(raw.line!==li||raw.points?.length<2)continue;
      const a=stations.get(raw.a),b=stations.get(raw.b);if(!a||!b||a.id===b.id)continue;
      let points=raw.points.map(p=>[p[0],p[1]]);
      if(km(points[0],[b.x,b.z])<km(points[0],[a.x,a.z]))points.reverse();
      points[0]=[a.x,a.z];points[points.length-1]=[b.x,b.z];
      const clean=[points[0]];
      for(let i=1;i<points.length;i++)if(km(points[i],clean.at(-1))>.00001)clean.push(points[i]);
      if(clean.length<2)continue;
      let length=0;for(let i=1;i<clean.length;i++)length+=km(clean[i-1],clean[i]);
      if(length<.001)continue;
      const edge={id:edges.length,a:a.id,b:b.id,points:clean,length};edges.push(edge);
      for(const id of [a.id,b.id]){if(!adj.has(id))adj.set(id,[]);adj.get(id).push(edge);}
    }
    return {stations,edges,adj};
  }
  function components(graph){
    const seen=new Set(),out=[];
    for(const id of graph.adj.keys()){
      if(seen.has(id))continue;
      const queue=[id],nodes=[],edgeIds=new Set();seen.add(id);
      for(let q=0;q<queue.length;q++){
        const u=queue[q];nodes.push(u);
        for(const e of graph.adj.get(u)){edgeIds.add(e.id);const v=e.a===u?e.b:e.a;if(!seen.has(v)){seen.add(v);queue.push(v);}}
      }
      out.push({nodes,edgeIds});
    }
    return out;
  }
  // Small mapped graphs make a straightforward Dijkstra easier to audit than
  // using geographic straight lines across junctions or disconnected pieces.
  function shortest(graph,start,end,excluded){
    const dist=new Map([[start,0]]),prev=new Map(),todo=new Set([start]);
    while(todo.size){
      let u=null,best=Infinity;for(const id of todo){const d=dist.get(id);if(d<best){u=id;best=d;}}todo.delete(u);
      if(u===end)break;
      for(const e of graph.adj.get(u)||[]){if(e.id===excluded)continue;
        const v=e.a===u?e.b:e.a,nd=best+e.length;
        if(nd+1e-9<(dist.get(v)??Infinity)){dist.set(v,nd);prev.set(v,{from:u,edge:e});todo.add(v);}
      }
    }
    if(!dist.has(end))return null;
    const ids=[end],edges=[];let u=end;
    while(u!==start){const p=prev.get(u);if(!p)return null;edges.unshift(p.edge);u=p.from;ids.unshift(u);}
    return {ids,edges,length:dist.get(end)};
  }
  function pathCandidates(graph,component){
    const leaves=component.nodes.filter(id=>(graph.adj.get(id)||[]).length===1);
    const endpoints=[...leaves];
    if(endpoints.length<2){
      const origin=endpoints[0]??component.nodes[0];
      let far=origin,best=-1;
      for(const id of component.nodes){const p=shortest(graph,origin,id);if(p&&p.length>best){best=p.length;far=id;}}
      if(!endpoints.includes(far))endpoints.push(far);
      if(endpoints.length<2)endpoints.push(component.nodes.find(id=>id!==origin));
    }
    const candidates=[],keys=new Set();
    function add(p){
      if(!p||!p.edges.length)return;
      const key=p.edges.map(e=>e.id).join(',');if(keys.has(key))return;keys.add(key);candidates.push(p);
    }
    for(let i=0;i<endpoints.length;i++)for(let j=i+1;j<endpoints.length;j++){
      const p=shortest(graph,endpoints[i],endpoints[j]);add(p);
      if(p?.edges.length>2){
        const probes=[.25,.5,.75].map(f=>p.edges[Math.floor(f*(p.edges.length-1))]);
        for(const edge of probes)add(shortest(graph,endpoints[i],endpoints[j],edge.id));
      }
    }
    // Prefer a long, legible trunk and then add branch/alternate paths that
    // cover fresh mapped track. Every chosen path remains station-connected.
    const chosen=[],covered=new Set(),coveredNodes=new Set();
    while(candidates.length&&chosen.length<6){
      let bestIndex=-1,bestScore=-Infinity;
      for(let i=0;i<candidates.length;i++){
        const p=candidates[i],novel=p.edges.reduce((s,e)=>s+(covered.has(e.id)?0:e.length),0);
        const score=chosen.length?novel-.018*p.length:p.length;
        if(score>bestScore){bestScore=score;bestIndex=i;}
      }
      if(bestIndex<0||(chosen.length&&bestScore<.15))break;
      const p=candidates.splice(bestIndex,1)[0];chosen.push(p);
      for(const e of p.edges)covered.add(e.id);for(const id of p.ids)coveredNodes.add(id);
    }
    // A shortest terminal-to-terminal service can bypass intermediate mapped
    // stations on parallel local/express links. Add connected partial-service
    // corridors until every mapped station in this component is represented.
    while(coveredNodes.size<component.nodes.length&&chosen.length<24){
      let best=null,bestScore=-Infinity;
      for(const id of component.nodes){
        if(coveredNodes.has(id))continue;
        for(const end of endpoints){
          if(end===id)continue;
          const p=shortest(graph,id,end);if(!p?.edges.length)continue;
          const newStations=p.ids.filter(n=>!coveredNodes.has(n)).length;
          const newTrack=p.edges.reduce((n,e)=>n+(covered.has(e.id)?0:e.length),0);
          const score=newStations*3+newTrack+.001*p.length;
          if(score>bestScore){best=p;bestScore=score;}
        }
      }
      if(!best)break;chosen.push(best);
      for(const e of best.edges)covered.add(e.id);for(const id of best.ids)coveredNodes.add(id);
    }
    return chosen;
  }
  function corridor(graph,route,li,index,line){
    const points=[],stops=[],lengths=[0];
    function push(p){if(points.length&&km(points.at(-1),p)<.00001)return;points.push(p);if(points.length>1)lengths.push(lengths.at(-1)+km(points.at(-2),p));}
    for(let i=0;i<route.edges.length;i++){
      const e=route.edges[i],forward=e.a===route.ids[i],source=forward?e.points:[...e.points].reverse();
      for(const p of source)push(p);
      if(i===0)stops.push({station:graph.stations.get(route.ids[0]),distance:0});
      stops.push({station:graph.stations.get(route.ids[i+1]),distance:lengths.at(-1)});
    }
    if(points.length<2||lengths.at(-1)<.001)return null;
    const path={points,lengths,total:lengths.at(-1),loop:false};
    const fast=['GTX-A','공항철도'].includes(line.id),regional=['경의·중앙','경춘','수인·분당','경강','서해'].includes(line.id);
    const speed=fast?.023:regional?.016:.013; // km/s; illustrative interstation speed
    const events=[];let totalMs=0;
    function event(e,seconds){e.startMs=totalMs;e.durationMs=Math.round(seconds*1000);totalMs+=e.durationMs;events.push(e);}
    const dwell=(stationIndex,dir)=>event({kind:'dwell',stationIndex,d:stops[stationIndex].distance,dir},stationIndex===0||stationIndex===stops.length-1?52:23+hash(`${li}:${index}:${stationIndex}`)%13);
    const travel=(from,to,dir)=>{
      const distance=Math.abs(stops[to].distance-stops[from].distance);
      event({kind:'travel',from,to,d0:stops[from].distance,d1:stops[to].distance,dir},Math.max(20,distance/speed));
    };
    for(let i=0;i<stops.length-1;i++){dwell(i,1);travel(i,i+1,1);}dwell(stops.length-1,-1);
    for(let i=stops.length-1;i>0;i--){travel(i,i-1,-1);if(i>1)dwell(i-1,-1);}
    return {line:li,index,ids:route.ids,path,stops,events,cycleMs:totalMs,length:path.total,name:`${stops[0].station.en} – ${stops.at(-1).station.en}`};
  }
  function timetable(c,clock){
    const phase=mod(clock,c.cycleMs),events=c.events;
    let lo=0,hi=events.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(events[mid].startMs+events[mid].durationMs<=phase)lo=mid+1;else hi=mid;}
    const e=events[lo],f=clamp((phase-e.startMs)/e.durationMs,0,1);
    const eased=f*f*(3-2*f),distance=e.kind==='travel'?e.d0+(e.d1-e.d0)*eased:e.d;
    const stationIndex=e.kind==='dwell'?e.stationIndex:e.from;
    const nextIndex=e.kind==='travel'?e.to:e.dir>0?Math.min(c.stops.length-1,e.stationIndex+1):Math.max(0,e.stationIndex-1);
    return {event:e,distance,stationIndex,nextIndex,progress:f,dir:e.dir};
  }
  function extendedSample(T,path,d){
    if(d>=0&&d<=path.total)return T.sample(path,d);
    const at=clamp(d,0,path.total),p=T.sample(path,at),extra=d-at;
    return {...p,x:p.x+p.dx*extra,z:p.z+p.dz*extra};
  }
  function create(D,T,options={}){
    if(!D?.lines||!D?.stations||!D?.segments||!T?.sample)throw new Error('The simulation needs mapped rail and train geometry.');
    const seed=String(options.seed??'seoul-synthetic-v1');
    const profile=options.profile??window.SEOUL_SIMULATION_PROFILE??null;
    const measured=observedBuckets(profile,D);
    const routeLines=[],baseline=[],capacityByLine=[],fleet={trains:[]};
    for(let li=0;li<D.lines.length;li++){
      const line=D.lines[li],graph=makeGraph(D,li),routes=[];
      for(const component of components(graph))for(const p of pathCandidates(graph,component)){
        const c=corridor(graph,p,li,routes.length,line);if(c)routes.push(c);
      }
      routeLines.push(routes);
      const observed=profileCount(profile,line.id),fallback=surveyFresh[line.id]??unsupportedDefault[line.id]??Math.max(3,Math.round(line.stations*.18));
      baseline.push(clamp(observed??fallback,2,65));
      if(!routes.length){capacityByLine.push(0);continue;}
      const measuredPeak=Math.max(0,...measured[li].values());
      const capacity=Math.max(routes.length,Math.ceil(Math.max(baseline[li],measuredPeak)*1.12)),totalWeight=routes.reduce((n,r)=>n+r.length,0)||1;
      capacityByLine.push(capacity);
      const allocations=routes.map(r=>Math.floor(capacity*r.length/totalWeight));
      for(let i=0;i<routes.length&&capacity>=routes.length;i++)allocations[i]=Math.max(1,allocations[i]);
      while(allocations.reduce((a,b)=>a+b,0)>capacity){let i=allocations.indexOf(Math.max(...allocations));if(allocations[i]<=1)break;allocations[i]--;}
      while(allocations.reduce((a,b)=>a+b,0)<capacity){let i=0,best=-1;for(let j=0;j<routes.length;j++){const score=(capacity*routes[j].length/totalWeight)-allocations[j];if(score>best){best=score;i=j;}}allocations[i]++;}
      let local=0;const lineTrains=[];
      routes.forEach((route,ri)=>{
        for(let slot=0;slot<allocations[ri];slot++){
          const phase=mod((slot+.5)/allocations[ri]+(hash(`${seed}:${line.id}:${ri}`)%10000)/10000,1)*route.cycleMs;
          const initial=timetable(route,phase);
          const train={id:fleet.trains.length,key:`simulation:${line.id}:${local+1}`,number:`SIM ${line.badge||line.id}-${String(local+1).padStart(2,'0')}`,line:li,slot:local,routeSlot:slot,route,phaseMs:phase,station:route.stops[initial.stationIndex].station,simulated:true};
          fleet.trains.push(train);lineTrains.push(train);local++;
        }
      });
      // Interleave route eligibility so a reduced off-peak fleet still
      // represents each branch before adding second and third trains.
      lineTrains.sort((a,b)=>a.routeSlot-b.routeSlot||a.route.index-b.route.index);
      lineTrains.forEach((train,rank)=>{train.slot=rank;});
    }
    let cachedSecond=NaN,cachedTargets=[];
    function targets(epochMs){
      const second=Math.floor(epochMs/1000);
      if(second!==cachedSecond){cachedSecond=second;const parts=kstParts(epochMs),factor=daypartFactor(epochMs);
        const bucket=`${parts.weekend?'weekend':'weekday'}:${parts.wholeHour}:${parts.quarter}`;
        cachedTargets=D.lines.map((_,li)=>{
        const capacity=capacityByLine[li];
        const observed=measured[li].get(bucket);
        return !capacity?0:observed!==undefined?clamp(observed,0,capacity):factor<=0?0:clamp(Math.max(1,Math.round(baseline[li]*factor)),0,capacity);
      });}
      return cachedTargets;
    }
    function lineCounts(epochMs=Date.now()){
      const counts=targets(epochMs);
      return Object.fromEntries(D.lines.map((l,i)=>[l.id,counts[i]]));
    }
    function isActive(train,epochMs=Date.now()){
      const t=typeof train==='number'?fleet.trains[train]:train;
      return !!t?.simulated&&t.slot<targets(epochMs)[t.line];
    }
    function activeCount(epochMs=Date.now()){return targets(epochMs).reduce((n,count)=>n+count,0);}
    function pose(train,elapsedMs,requestedScale,motion=true){
      // The caller freezes its accumulated clock when motion is disabled.
      // Reusing that clock here keeps trains in place instead of snapping back.
      const route=train.route,time=Number(elapsedMs)||0,at=timetable(route,train.phaseMs+time);
      const direction=at.dir,center=extendedSample(T,route.path,at.distance),scale=requestedScale,cars=[];
      for(let i=0;i<T.CAR_COUNT;i++){
        const d=at.distance+direction*((T.CAR_COUNT-1)/2-i)*T.SPACING*scale;
        const p=extendedSample(T,route.path,d),a=extendedSample(T,route.path,d-T.CAR_LENGTH*scale*.34),b=extendedSample(T,route.path,d+T.CAR_LENGTH*scale*.34);
        const len=Math.hypot(b.x-a.x,b.z-a.z)||1,dx=direction*(b.x-a.x)/len,dz=direction*(b.z-a.z)/len,backwards=i===T.CAR_COUNT-1;
        cars.push({x:p.x,z:p.z,dx:backwards?-dx:dx,dz:backwards?-dz:dz,scale,model:i===0||backwards?'cab':i===1?'power':'car',head:i===0});
      }
      return {...center,dx:center.dx*direction,dz:center.dz*direction,scale,direction,d:at.distance,cars,train};
    }
    function details(train,elapsedMs){
      const route=train.route,at=timetable(route,train.phaseMs+(Number(elapsedMs)||0));
      const endpoint=at.dir>0?route.stops.at(-1):route.stops[0];
      return {station:route.stops[at.stationIndex].station,nextStation:route.stops[at.nextIndex].station,
        destination:endpoint.station.en,status:at.event.kind==='dwell'?'At station':'In motion',
        direction:at.dir,corridor:route.name,progress:at.progress,simulated:true};
    }
    return {fleet,routesByLine:routeLines,baseline,profile,source:'simulation',isActive,activeCount,lineCounts,pose,details,daypartFactor,kstParts};
  }
  window.SeoulSimulation={create,daypartFactor,kstParts,surveyFresh,unsupportedDefault};
})();
