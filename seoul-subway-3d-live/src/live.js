/* Seoul Subsurface live adapter, MIT. No synthetic fleet is created here.
 * Reported station/status from Seoul TOPIS realtimePosition is NOT GPS.
 * Visual interpolation joins adjacent observations. A fresh departed report can
 * also produce a short, explicitly estimated motion on an unambiguous track.
 * Neither mode invents a train, observation, route, or arrival time.
 */
(() => {
  'use strict';
  const FRESH=90, EXPIRE=300, MOTION_MS=3000;
  const ESTIMATE_FRACTION=.06, ESTIMATE_DISTANCE=.08;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const $=id=>document.getElementById(id);
  const clean=s=>String(s||'').normalize('NFKC').replace(/\([^)]*\)/g,'').replace(/[\s·.\-_]/g,'').toLowerCase();
  const aliases={'서울역':'서울','응암순환':'응암','대모산':'대모산입구','총신대입구이수':'총신대입구','성신여대':'성신여대입구','숙대입구':'숙대입구','화전':'한국항공대','뚝섬유원지':'자양','지제':'평택지제'};
  // Exact provider-observed route/station pairs missing or ambiguous in this atlas.
  // Some fallbacks use a shared station's coordinates where route-specific geometry is absent.
  const stationFallbacks={
    '2':{'신도림지선':70},
    '7':{'총신대입구':601},
    'GTX-A':{'성남':619},
    '공항철도':{'디지털미디어시티':250,'홍대입구':455},
    '경춘':{'용산':49},
    'W':{'삼양':433,'보문':229}
  };
  const normalized=s=>aliases[clean(s)]||clean(s);
  const statusName=s=>({'0':'Approaching','1':'At station','2':'Departed','3':'Operating'}[String(s)]||'Status not specified');
  const directionName=(d,line)=>String(d)==='0'?(line==='2'?'Inner loop':'Upbound'):String(d)==='1'?(line==='2'?'Outer loop':'Downbound'):'Direction not specified';
  const stamp=s=>{const n=Date.parse(s);return Number.isFinite(n)?n:NaN;};
  const clock=s=>Number.isFinite(stamp(s))?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(s))+' KST':'Unknown';

  function create(D,T){
    const fleet={trains:[],paths:[]}, lineById=new Map(D.lines.map((l,i)=>[l.id,i]));
    const stations=new Map(D.stations.map(s=>[s.id,s]));
    const names=D.lines.map(()=>new Map()),adj=D.lines.map(()=>new Map()),edges=D.lines.map(()=>new Map());
    const source={state:'checking',configured:false,enabledLines:[],supportedLines:null,pollSeconds:120,lines:[],budget:null,quotaWarning:null,serverTime:null,clockOffset:0,message:'Checking the live feed…',paused:false};
    for(const s of D.stations)for(const li of s.lines){const n=normalized(s.ko);if(!names[li].has(n))names[li].set(n,[]);names[li].get(n).push(s);}
    function path(points){const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));return{points,lengths,total:lengths.at(-1),loop:false};}
    for(const e of D.segments){
      if(e.points.length<2||!stations.has(e.a)||!stations.has(e.b))continue;
      const a=stations.get(e.a),b=stations.get(e.b),pts=e.points.map(p=>[...p]);
      const da=Math.hypot(pts[0][0]-a.x,pts[0][1]-a.z),db=Math.hypot(pts.at(-1)[0]-a.x,pts.at(-1)[1]-a.z);
      if(db<da)pts.reverse();pts[0]=[a.x,a.z];pts[pts.length-1]=[b.x,b.z];
      const p=path(pts);if(p.total<.001)continue;
      const key=[e.a,e.b].sort((a,b)=>a-b).join(':');
      const old=edges[e.line].get(key);if(!old||p.total<old.path.total)edges[e.line].set(key,{...e,path:p});
    }
    for(let li=0;li<adj.length;li++)for(const e of edges[li].values())for(const id of [e.a,e.b]){if(!adj[li].has(id))adj[li].set(id,[]);adj[li].get(id).push(e);}
    function oriented(e,from){return e.a===from?e.path:path([...e.path.points].reverse());}
    function edgeBetween(li,a,b){return edges[li].get([a,b].sort((a,b)=>a-b).join(':'));}
    function resolve(li,name){
      const key=normalized(name),matches=names[li].get(key)||[];
      if(matches.length===1)return matches[0];
      const id=stationFallbacks[D.lines[li].id]?.[key];
      return id===undefined?null:stations.get(id)||null;
    }
    function stationaryPath(li,s,previous){
      const list=adj[li].get(s.id)||[];
      const incoming=previous?edgeBetween(li,previous.id,s.id):null;
      if(incoming)return {path:oriented(incoming,previous.id),d:incoming.path.total};
      if(list.length){const e=list[0],from=e.a===s.id?e.b:e.a,p=oriented(e,from);return{path:p,d:p.total};}
      return {path:path([[s.x-.01,s.z],[s.x,s.z],[s.x+.01,s.z]]),d:.01};
    }
    function outgoingPath(li,station,previous){
      if(!previous||!edgeBetween(li,previous.id,station.id))return null;
      const candidates=(adj[li].get(station.id)||[]).filter(e=>e.a!==previous.id&&e.b!==previous.id);
      if(candidates.length!==1||candidates[0].path.total>12)return null;
      const e=candidates[0];return {path:oriented(e,station.id),nextId:e.a===station.id?e.b:e.a};
    }
    function age(train,now=Date.now()+source.clockOffset){return (now-stamp(train.observedAt))/1000;}
    function quality(train){const a=age(train);return !Number.isFinite(a)||a< -60||a>EXPIRE?'expired':train.sourceError||source.paused||a>FRESH?'stale':'fresh';}
    function apply(payload){
      const old=new Map(fleet.trains.map(t=>[t.key,t]));
      const incoming=[],stats={unmapped:0,unknownTime:0,expired:0,received:0};
      source.configured=!!payload.configured;
      if(Array.isArray(payload.enabledLines))source.enabledLines=payload.enabledLines;
      if(Array.isArray(payload.supportedLines))source.supportedLines=payload.supportedLines;
      if(typeof payload.quotaWarning==='string'||payload.quotaWarning===null)source.quotaWarning=payload.quotaWarning;
      source.pollSeconds=clamp(Number(payload.pollSeconds)||120,3,3600);source.lines=payload.lines||[];source.budget=payload.budget||null;source.upstreamTransport=payload.upstreamTransport;
      const serverTime=stamp(payload.serverTime);if(Number.isFinite(serverTime))source.clockOffset=serverTime-Date.now();source.serverTime=payload.serverTime;
      for(const line of source.lines){
        const li=lineById.get(line.lineId);if(li===undefined)continue;
        for(const row of line.trains||[]){
          stats.received++;
          if(row.lineId!==line.lineId||typeof row.key!=='string')continue;
          const s=resolve(li,row.stationName);if(!s){stats.unmapped++;continue;}
          const a=(Date.now()+source.clockOffset-stamp(row.observedAt))/1000;
          if(!Number.isFinite(a)){stats.unknownTime++;continue;}if(a< -60||a>EXPIRE){stats.expired++;continue;}
          const prev=old.get(row.key);
          // Ignore regressing observations rather than move a train backwards in time.
          const regressed=prev&&(stamp(row.observedAt)<stamp(prev.observedAt)||
            (row.observedAt===prev.observedAt&&s.id!==prev.station.id));
          const same=prev&&row.observedAt===prev.observedAt&&s.id===prev.station.id;
          let train;
          if(same||regressed){
            train={...prev,...(regressed?{}:row),sourceError:line.state==='error'};
            if(line.state==='error'||String(train.status)!=='2'&&train.transition?.kind==='estimate')train.transition=null;
          }
          else{
            const target=prev?.station.id===s.id?prev.target:stationaryPath(li,s,prev?.station);
            const previousStation=prev&&prev.direction===row.direction?
              (prev.station.id===s.id?prev.previousStation:(edgeBetween(li,prev.station.id,s.id)?prev.station:null)):null;
            const previousStationAt=previousStation?(prev.station.id===s.id?prev.previousStationAt:prev.observedAt):null;
            train={...row,line:li,station:s,target,previousStation,previousStationAt,sourceError:line.state==='error',transition:null};
            if(prev&&prev.station.id!==s.id&&prev.direction===row.direction&&a<=FRESH&&age(prev)<=180&&line.state!=='error'){
              const e=edgeBetween(li,prev.station.id,s.id);
              // No inferred routing through an interchange or a disconnected branch.
              if(e&&e.path.total<=12&&(!prev.transition||prev.transition.kind!=='estimate'||prev.transition.nextId===s.id)){
                const p=oriented(e,prev.station.id);
                let from=0;
                // An earlier bounded estimate on this same edge must not rewind.
                if(prev.transition?.kind==='estimate'&&prev.transition.nextId===s.id&&quality(prev)==='fresh'){
                  from=motionDistance(prev.transition);
                }
                train.transition={kind:'observed',path:p,from,to:p.total,start:performance.now(),duration:MOTION_MS};
              }
            }else if(prev&&prev.station.id===s.id&&prev.direction===row.direction&&['0','1'].includes(String(row.direction))&&String(row.status)==='2'&&a<=FRESH&&age(prev)<=FRESH&&
              previousStationAt&&(Date.now()+source.clockOffset-stamp(previousStationAt))/1000<=180&&line.state!=='error'){
              if(prev.transition?.kind==='estimate')train.transition=prev.transition;
              else if(prev.transition?.kind==='observed'&&interpolating(prev))train.transition=prev.transition;
              else{
                const onward=outgoingPath(li,s,previousStation);
                if(onward){const p=onward.path;train.transition={kind:'estimate',path:p,nextId:onward.nextId,from:0,to:Math.min(p.total*ESTIMATE_FRACTION,ESTIMATE_DISTANCE),start:performance.now(),duration:MOTION_MS};}
              }
            }
          }
          train.id=incoming.length;incoming.push(train);
        }
      }
      fleet.trains=incoming;source.stats=stats;
      source.state=!source.configured?'unconfigured':source.lines.some(l=>l.state==='ok')?'connected':source.lines.some(l=>l.state==='error')?'error':'empty';
      source.message=!source.configured?'Live train feeds are not configured on this server.':'';
      return incoming;
    }
    function extendedSample(p,d){
      if(d>=0&&d<=p.total)return T.sample(p,d);
      const end=d<0?0:p.total,c=T.sample(p,end),extra=d-end;
      return {...c,x:c.x+c.dx*extra,z:c.z+c.dz*extra};
    }
    function motionDistance(m){const f=clamp((performance.now()-m.start)/m.duration,0,1);return m.from+(m.to-m.from)*f*f*(3-2*f);}
    function motionKind(train,smooth=true){
      if(!smooth||!train.transition||quality(train)!=='fresh'||typeof document!=='undefined'&&document.hidden)return null;
      if(train.transition.kind==='observed'&&performance.now()-train.transition.start>=train.transition.duration)return null;
      return train.transition.kind;
    }
    function pose(train,ignored,requestedScale,smooth=true){
      let p=train.target.path,d=train.target.d;
      if(motionKind(train,smooth)){
        const m=train.transition;p=m.path;d=motionDistance(m);
      }
      const center=extendedSample(p,d),scale=requestedScale,cars=[];
      for(let i=0;i<T.CAR_COUNT;i++){
        const at=d+((T.CAR_COUNT-1)/2-i)*T.SPACING*scale,c=extendedSample(p,at),a=extendedSample(p,at-T.CAR_LENGTH*scale*.34),b=extendedSample(p,at+T.CAR_LENGTH*scale*.34);
        const len=Math.hypot(b.x-a.x,b.z-a.z)||1,dx=(b.x-a.x)/len,dz=(b.z-a.z)/len,backwards=i===T.CAR_COUNT-1;
        cars.push({x:c.x,z:c.z,dx:backwards?-dx:dx,dz:backwards?-dz:dz,scale,model:i===0||backwards?'cab':i===1?'power':'car',head:i===0});
      }
      return {...center,scale,direction:1,d,cars,train};
    }
    function interpolating(train){return !!(motionKind(train)&&performance.now()-train.transition.start<train.transition.duration);}
    function fail(message,state='error'){source.state=state;source.message=message;for(const t of fleet.trains){t.sourceError=true;t.transition=null;}}

    let hooks={},timer=null,busy=false,controller=null,generation=0,stopped=false;
    function wanted(){return hooks.getLineIds?.()||D.lines.map(l=>l.id);}
    function activeFeeds(){return wanted().filter(id=>source.supportedLines?.includes(id)&&source.enabledLines.includes(id));}
    function routeStatus(id){
      const feed=source.lines.find(l=>l.lineId===id),li=lineById.get(id),trains=fleet.trains.filter(t=>t.line===li);
      const fresh=trains.filter(t=>quality(t)==='fresh').length,stale=trains.filter(t=>quality(t)==='stale').length;
      if(!Array.isArray(source.supportedLines))return {label:'UNKNOWN',detail:'Server feed status unavailable.',quality:'none'};
      if(!source.supportedLines.includes(id))return {label:'MAP ONLY',detail:'No live adapter for this mapped route.',quality:'none'};
      if(!source.enabledLines.includes(id))return {label:'NOT ENABLED',detail:'This route is not enabled on the server.',quality:'none'};
      if(!source.configured)return {label:'NO KEY',detail:'Configure the server API key to request reports.',quality:'none'};
      if(feed?.state==='error')return {label:'ERROR',detail:feed.message||'The route feed failed; older reports are stale.',quality:'error'};
      if(fresh)return {label:`${fresh} LIVE`,detail:`${fresh} fresh mapped ${fresh===1?'train report':'train reports'}.`,quality:'live'};
      if(stale)return {label:`${stale} STALE`,detail:`${stale} mapped ${stale===1?'report is':'reports are'} older than the freshness threshold.`,quality:'none'};
      if(feed?.state==='empty')return {label:'NO DATA',detail:'The provider returned no train reports for this route.',quality:'none'};
      if(feed?.state==='ok')return {label:'NO MAPPED TRAINS',detail:'No current provider report could be matched to a mapped station and valid timestamp.',quality:'none'};
      return {label:'NOT POLLED',detail:'This route has not been requested in the current view.',quality:'none'};
    }
    function summary(){const list=fleet.trains.filter(t=>wanted().includes(D.lines[t.line].id));return {fresh:list.filter(t=>quality(t)==='fresh').length,stale:list.filter(t=>quality(t)==='stale').length};}
    function ui(){
      const counts=summary(),connected=source.state==='connected',active=activeFeeds();
      const lineError=source.lines.find(l=>active.includes(l.lineId)&&l.state==='error');
      const partial=!!lineError&&counts.fresh>0;
      let text=source.paused?'UPDATES PAUSED':source.state==='unconfigured'?'FEED NOT CONFIGURED':source.state==='offline'?'FEED OFFLINE':source.state==='checking'?'CONNECTING':source.state==='error'?'FEED UNAVAILABLE':partial?'PARTIAL LIVE':counts.fresh?'LIVE REPORTS':counts.stale?'STALE REPORTS':connected||source.state==='empty'?'NO FRESH REPORTS':'NOT CONNECTED';
      $('live-badge').dataset.state=source.paused||partial?'stale':counts.fresh?'live':counts.stale?'stale':'offline';
      $('live-badge-label').textContent=text;$('live-panel-state').textContent=text;
      $('live-count').textContent=String(counts.fresh);$('live-stale-count').textContent=counts.stale?`${counts.stale} stale`:'';
      const times=fleet.trains.filter(t=>wanted().includes(D.lines[t.line].id)).map(t=>stamp(t.observedAt)).filter(Number.isFinite),latest=times.length?Math.max(...times):NaN;
      $('live-age').textContent=Number.isFinite(latest)?`Latest report ${Math.max(0,Math.floor((Date.now()+source.clockOffset-latest)/1000))}s ago`:'No live observations received';
      $('live-poll-label').textContent=`${source.enabledLines.length} enabled ${source.enabledLines.length===1?'route':'routes'} · ${source.pollSeconds}s cache · station reports`;
      $('live-toggle').textContent=source.paused?'Resume updates':'Pause updates';$('live-toggle').setAttribute('aria-pressed',String(source.paused));
      $('live-toggle').disabled=['offline','unconfigured','checking'].includes(source.state);$('live-refresh').disabled=busy||source.state==='offline';
      $('train-legend-text').textContent=source.paused?'Reports paused':counts.fresh?(hooks.getMotionEnabled?.()===false?'3D trains · reported stations':'3D trains · station reports; motion estimated'):counts.stale?'3D trains · stale reports':'No live trains connected';
      $('live-notice').hidden=counts.fresh>0||counts.stale>0;
      $('live-notice-title').textContent=source.state==='unconfigured'?'Live feeds not configured':source.state==='offline'?'Live feed unavailable':source.state==='checking'?'Connecting to live data…':!active.length?'No enabled feed in this view':'No fresh train reports';
      $('live-notice-text').textContent=source.message||lineError?.message||'The network stays visible. No simulated trains are substituted for missing data.';
      $('live-filter-note').textContent=`${active.length} enabled feeds in this view`;
      const budget=source.budget;$('live-budget').textContent=budget?`${budget.used.toLocaleString()} / ${budget.localLimit.toLocaleString()} server request cap today`:'API key stays on the server';
      document.querySelectorAll('[data-feed-state]').forEach(el=>{
        const status=routeStatus(el.dataset.feedState);
        el.textContent=status.label;el.dataset.quality=status.quality;
      });
      if($('live-dialog').open){
        $('live-connection-summary').textContent=source.message||`${text}. ${counts.fresh} fresh mapped trains; ${counts.stale} stale.${lineError?' Some visible feeds failed; see the route details below.':''} Reported stations are observations; any movement between or beyond them is a short visual estimate, not GPS.`;
        $('dialog-budget').textContent=$('live-budget').textContent+' · '+$('live-filter-note').textContent;
        const warning=typeof source.quotaWarning==='string'?source.quotaWarning:'';
        $('live-quota-warning').textContent=warning;$('live-quota-warning').hidden=!warning;
        $('live-diagnostics').textContent=source.stats?`${source.stats.received} received · ${source.stats.unmapped} station names unmatched · ${source.stats.unknownTime} unknown timestamp · ${source.stats.expired} expired/invalid time`:'No observations received.';
        const body=$('coverage-body');body.replaceChildren();
        for(const l of D.lines){
          const row=document.createElement('tr'),status=routeStatus(l.id);
          for(const value of [l.name,status.label,status.detail]){const td=document.createElement('td');td.textContent=value;row.append(td);}body.append(row);
        }
      }
      hooks.onTick?.();
    }
    async function refresh(){
      if(busy||stopped||source.paused||document.hidden||location.protocol==='file:')return;
      const ids=activeFeeds();
      if(!ids.length){hooks.onUpdate?.({...source,lines:[]});ui();return;}
      busy=true;controller=new AbortController();const ticket=generation;
      const timeout=setTimeout(()=>controller?.abort(),90000);ui();
      try{
        const r=await fetch('/api/live/positions?lines='+encodeURIComponent(ids.join(',')),{cache:'no-store',signal:controller.signal});
        if(!r.ok)throw new Error('The live feed returned HTTP '+r.status+'.');
        const payload=await r.json();if(!Array.isArray(payload.lines))throw new Error('The live feed response is invalid.');
        if(ticket===generation&&!source.paused)hooks.onUpdate?.(payload);
      }catch(e){if(ticket===generation&&!source.paused){fail(e.name==='AbortError'?'The live request timed out. Existing reports will age out.':e.message);}}
      finally{clearTimeout(timeout);busy=false;controller=null;ui();schedule(ticket!==generation?350:undefined);}
    }
    function schedule(delay){clearTimeout(timer);if(!stopped&&!source.paused)timer=setTimeout(refresh,delay??(source.pollSeconds*1000+250));}
    function selectionChanged(){generation++;controller?.abort();clearTimeout(timer);schedule(350);ui();}
    async function connect(callbacks){
      hooks=callbacks;
      const dialog=$('live-dialog');const open=()=>{dialog.showModal();ui();};
      for(const id of ['live-badge','live-settings','live-notice-connect'])$(id).onclick=open;
      $('close-live').onclick=()=>dialog.close();$('live-refresh').onclick=()=>refresh();
      $('live-toggle').onclick=()=>{source.paused=!source.paused;generation++;controller?.abort();clearTimeout(timer);if(source.paused)for(const t of fleet.trains)t.transition=null;else schedule(0);ui();};
      document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;controller?.abort();clearTimeout(timer);for(const t of fleet.trains)t.transition=null;}else schedule(0);});
      window.addEventListener('pagehide',()=>{stopped=true;controller?.abort();clearTimeout(timer);});
      window.addEventListener('pageshow',e=>{if(e.persisted){stopped=false;schedule(0);}});
      setInterval(ui,1000);ui();
      if(location.protocol==='file:'){fail('Live tracking needs the included Python server. Extract the project, configure .env, and run start-windows.bat. This standalone file shows the map only.','offline');ui();return;}
      try{
        const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),10000);let r;try{r=await fetch('/api/live/status',{cache:'no-store',signal:abort.signal});}finally{clearTimeout(timeout);}
        if(!r.ok)throw new Error('The live feed is unavailable.');
        const s=await r.json();if(!Array.isArray(s.enabledLines)||!Array.isArray(s.supportedLines))throw new Error('The live feed response is invalid.');
        Object.assign(source,s);source.state=s.configured?'checking':'unconfigured';source.message=s.configured?'':(s.message||'Live train feeds are not configured on this server.');ui();
        if(s.configured)await refresh();
      }catch(e){fail(e.name==='AbortError'?'The live feed is not responding.':e.message,'offline');ui();}
    }
    return{fleet,source,apply,pose,quality,age,interpolating,motionKind,connect,refresh,selectionChanged,ui,resolve,fail,summary,statusName,directionName,clock};
  }
  window.SeoulLive={create,FRESH,EXPIRE,statusName,directionName,clock};
})();
