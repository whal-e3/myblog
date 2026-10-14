/* Seoul Subsurface — original application, MIT.
 * Bundled rail/water data: © OpenStreetMap contributors, ODbL.
 * Source compilation: wantaekchoi/seoul-subway, 498fbc62e01479905e22c0577d60e8b875e86ace.
 * Vertical offsets, rolling stock, and animated trains are illustrative.
 * The default scene is an offline simulation, not train tracking or an arrival service.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const D = window.SEOUL_DATA;
  const K = window.SEOUL_KOREA;
  const N = window.KOREA_RAIL_DATA || {lines:[],stations:[],segments:[]};
  const P = window.KOREA_KPOP_SITES || {sites:[]};
  const T = window.SeoulTrains;
  let canvas = $('scene');
  const overlay = $('labels'), viewport = $('viewport');
  const ctx = overlay.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mix = (a, b, f) => a + (b - a) * f;
  const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255);
  const rgba = (hex, a=1) => [...rgb(hex),a];
  const cssRGBA = (hex, a=1) => `rgba(${rgb(hex).map(c=>Math.round(c*255)).join(",")},${a})`;
  const normalize = s => s.toLowerCase().normalize('NFKC').replace(/[\s.()·–—\-_'’]/g,'');
  let toastTimer;
  function toast(message) { $('toast').textContent=message; $('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600); }
  function fatal(err) { console.error(err);$('loading').hidden=true;$('fatal-error').hidden=false;$('error-message').textContent='This browser could not initialize the 3D atlas. Try Chrome or Edge with graphics acceleration enabled. '+(err.message||''); }
  if (!D || !D.stations?.length || !D.segments?.length || !K?.rings?.length || !K?.triangles?.length || !K.bounds || !window.SeoulKpopModels || !window.SeoulSimulation) { fatal(new Error('Bundled map assets are missing.'));return; }
  let gl;
  try {
    gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    start();
  } catch(err) { fatal(err); }

  function start() {
    const DEFAULT_YAW=-.25,DEFAULT_PITCH=.72;
    const state={visible:D.lines.map(()=>true), selectedLine:null, selectedStation:null, selectedNationalLine:null, selectedPlace:null, nationalUrban:true, nationalIntercity:true, kpop:true, scope:'full', labels:true, motion:!reduced, orbit:false, trainSize:1.25, selectedTrain:null, followTrain:false};
    const cam={x:0,y:0,z:0,scale:110,yaw:0,pitch:Math.PI/2,spread:.12};
    const goal={...cam};
    let width=100,height=100,dpr=1,aspect=1,vp=new Float32Array(16), lastFrame=0,dirty=true, moving=false, projected=[], hover=null;
    let fitAfterResize=true,dragged=false,searchIndex=-1,searchMatches=[],intro=null;
    let mapTheme=window.SeoulTheme.palette;
    const lookup=new Map(D.stations.map(s=>[s.id,s]));
    const simulation=window.SeoulSimulation.create(D,T,{profile:window.SEOUL_TRAIN_PROFILE});
    // The legacy feed adapter remains available for local diagnostics, but the
    // visitor-facing map never connects it or spends provider requests.
    const live=window.SeoulLive.create(D,T),fleet=simulation.fleet;
    const trainPose=(train,clock,scale)=>simulation.pose(train,clock,scale,state.motion);
    let trainClock=0,trainInstances=[],trainHits=[],trainPoses=[],kpopHits=[],nationalHits=[];
    let previewYaw=-.67,previewPitch=.40;
    // Orthographic zoom uses CSS-pixel coordinates, independent of the display DPR.
    const MIN_SCALE=.5,MAX_SCALE=2200;
    let zoomAnchor=null;
    const colors=D.lines.map(l=>rgb(l.color));
    const nationalSegments=N.lines.map(()=>[]);
    for(const segment of N.segments)if(nationalSegments[segment.line])nationalSegments[segment.line].push(segment);
    const nationalVisible=i=>N.lines[i]?.group==='Urban'?state.nationalUrban:state.nationalIntercity;
    const nationalColor=i=>N.lines[i].color||'#7b8fa5';
    const updateEmptyState=()=>{$('empty-state').hidden=state.visible.some(Boolean)||N.lines.some((_,i)=>nationalVisible(i))||(state.kpop&&P.sites.length>0);};
    const majorNames=['서울','서울역','강남','홍대입구','김포공항','인천공항1터미널','인천공항2터미널','인천','수원','춘천','천안','청량리','왕십리','잠실','고속터미널','사당','공덕','용산','신도림','판교','동탄','운정중앙','동두천','연천','여주','지평','문산','대곡','금정','부평','정자'];
    const stationPriority=s=>(state.selectedStation===s.id?100000:0)+(majorNames.includes(s.ko)?200:0)+s.lines.length*12+(s.transliterated?0:2);
    const sortedStations=[...D.stations].sort((a,b)=>stationPriority(b)-stationPriority(a));
    const layers=D.lines.map((_,i)=>i*.78);
    // Small positive offsets distinguish overlapping routes; they are not tunnel depths.
    const lineLevel = (i,spread) => .32+layers[i]*spread;
    const lineHeight = i => lineLevel(i,cam.spread);
    const surfaceDetail = () => clamp((300-cam.scale)/130,0,1);
    const activeLines = s=>s.lines.filter(l=>state.visible[l]);
    const stationHeight = s=> {const a=activeLines(s);return a.length?Math.max(...a.map(lineHeight)):.32;};
    const focusedStation = () => state.selectedStation===null?null:lookup.get(state.selectedStation);
    const currentEmphasis = () => state.selectedTrain!==null?[fleet.trains[state.selectedTrain].line]:state.selectedLine!==null?[state.selectedLine]:focusedStation()?.lines||null;
    function stationOpacity(s) {const emph=currentEmphasis();return !emph || s.lines.some(i=>emph.includes(i))?1:.17;}
    function lineOpacity(i) {const emph=currentEmphasis();return !emph || emph.includes(i)?1:.11;}

    const modelScale=()=>Math.max(.018,cam.scale/height*1.0)*state.trainSize;
    const baseRailRadius=()=>clamp(cam.scale/height*1.4,.003,.3);
    function prepareTrains(){
      trainInstances=[];trainHits=[];trainPoses=[];
      for(const train of fleet.trains){
        if(!state.visible[train.line]||lineOpacity(train.line)<.5||!simulation.isActive(train))continue;
        const pose=trainPose(train,trainClock,modelScale());
        const y=lineHeight(train.line)+baseRailRadius()*1.05;
        const center=project(pose.x,y,pose.z),margin=Math.max(60,T.SPACING*4*pose.scale/cam.scale*height);
        if(center.x < -margin || center.x>width+margin || center.y < -margin || center.y>height+margin)continue;
        trainPoses.push(pose);
        for(const car of pose.cars){
          const inst={...car,y,tint:colors[train.line],alpha:1,lod:car.scale/cam.scale*height*T.CAR_LENGTH>20?'high':'low'};
          trainInstances.push(inst);
          const a=project(...T.transformed([0,.5,-T.CAR_LENGTH/2],inst)),b=project(...T.transformed([0,.5,T.CAR_LENGTH/2],inst));
          trainHits.push({train,a,b,r:Math.max(5,car.scale/cam.scale*height*.6),center:project(car.x,y+.55*car.scale,car.z)});
        }
      }
    }
    function hitTrain(x,y){
      let found=null,score=Infinity;
      for(const h of trainHits){const vx=h.b.x-h.a.x,vy=h.b.y-h.a.y,t=clamp(((x-h.a.x)*vx+(y-h.a.y)*vy)/(vx*vx+vy*vy||1),0,1),d=Math.hypot(x-h.a.x-t*vx,y-h.a.y-t*vy);
        if(d<h.r&&d<score){found=h.train;score=d;}}
      return found;
    }
    function updateTrainCard(){
      const train=state.selectedTrain===null?null:fleet.trains[state.selectedTrain];
      $('train-card').hidden=!train;
      $('train-pause').textContent=state.motion?'Pause simulated motion':'Resume simulated motion';
      if(!train)return;
      $('train-line-name').textContent=D.lines[train.line].name;
      $('train-number').textContent='SCENARIO '+String(train.number).replace(/^SIM[- ]?/i,'');
      $('train-color').style.background=D.lines[train.line].color;
      $('train-follow').setAttribute('aria-pressed',String(state.followTrain));
      $('train-follow').textContent=state.followTrain?'Following train':'Follow train';
      const details=simulation.details(train,trainClock);
      $('train-model-status').textContent='SIMULATED POSITION · NOT LIVE'+(details.status?' · '+details.status.toUpperCase():'');
      $('train-model-status').dataset.quality='simulated';
      $('train-station').textContent=details.station?.ko?details.station.ko+' · '+details.station.en:String(details.station||'Illustrative route');
      $('train-destination').textContent=details.destination?.ko||details.destination||'Illustrative endpoint';
      $('train-observed').textContent='Animation clock · '+Math.floor(trainClock/1000)+'s since reset';
      $('train-direction').textContent=(details.destination?'Toward '+details.destination:'Illustrative direction')+' · synthetic service';
      T.preview($('train-preview'),colors[train.line],previewYaw,previewPitch);
    }
    function cancelFollow(){if(state.followTrain){state.followTrain=false;updateTrainCard();}}
    function resetTrain(){state.selectedTrain=null;state.followTrain=false;$('train-card').hidden=true;}
    function selectTrain(id){
      cancelIntro();releaseZoomAnchor();const train=fleet.trains[id];if(!train||!simulation.isActive(train))return;
      clearAux();
      state.selectedTrain=id;state.selectedLine=null;state.selectedStation=null;state.followTrain=true;
      state.visible[train.line]=true;state.scope='custom';state.orbit=false;
      $('orbit').setAttribute('aria-pressed','false');$('orbit').classList.remove('active');
      goal.scale=width<600?1.40:2.05;goal.pitch=.62;
      // A three-quarter side view makes the cars, bogies and front cab readable.
      const pose=trainPose(train,trainClock,.034*state.trainSize);
      goal.yaw=Math.atan2(pose.dx,pose.dz)-.86;
      goal.x=pose.x;goal.z=pose.z;goal.y=lineHeight(train.line)+.025;
      updateScope();updateVisibility();updateTrainCard();closeMobile();
      $('map-subtitle').textContent=D.lines[train.line].name+' · 3D rolling stock';dirty=true;
    }
    function inspectTrain(){
      const candidates=fleet.trains.filter(t=>simulation.isActive(t)&&state.visible[t.line]&&(state.selectedLine===null||t.line===state.selectedLine));
      if(!candidates.length){toast('No simulated trains are active on the selected routes at this scenario time.');return;}
      let best=candidates[0],distance=Infinity;
      for(const t of candidates){const p=trainPose(t,trainClock,modelScale()),screen=project(p.x,lineHeight(t.line),p.z),d=Math.hypot(screen.x-width/2,screen.y-height/2);if(d<distance){best=t;distance=d;}}
      selectTrain(best.id);
    }
    function updateSimulationUI(){
      const now=Date.now();
      const byLine=D.lines.map((_,i)=>fleet.trains.filter(t=>t.line===i&&simulation.isActive(t,now)).length);
      const count=byLine.reduce((n,v,i)=>n+(state.visible[i]?v:0),0);
      const allCount=byLine.reduce((n,v)=>n+v,0);
      const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(now));
      $('live-badge').dataset.state='simulated';
      $('live-badge-label').textContent='SIMULATED · NOT LIVE';
      $('live-panel-state').textContent='SIMULATED · NOT LIVE';
      $('live-count').textContent=String(count);
      $('live-stale-count').textContent='';
      $('live-age').textContent=count?
        'Invented positions on mapped rails · '+clock+' KST scenario':
        allCount?'No simulated trains on selected routes':'Overnight scenario · no simulated trains at '+clock+' KST';
      $('live-poll-label').textContent='No live positions or arrival predictions';
      $('live-toggle').textContent=state.motion?'Pause motion':'Resume motion';
      $('live-toggle').setAttribute('aria-pressed',String(state.motion));
      $('live-toggle').disabled=reduced;
      $('live-refresh').textContent='Restart simulation';
      $('live-filter-note').hidden=true;
      $('live-budget').hidden=true;
      $('train-legend-text').textContent=state.motion?'Simulated train motion':'Simulated trains paused';
      for(const el of document.querySelectorAll('[data-feed-state]')){
        const i=D.lines.findIndex(l=>l.id===el.dataset.feedState);
        el.textContent=i<0?'SIMULATED':`${byLine[i]} SIMULATED`;
      }
      if(state.selectedTrain!==null&&!simulation.isActive(fleet.trains[state.selectedTrain],now))resetTrain();
      if(state.selectedTrain!==null)updateTrainCard();
    }
    function setMotion(on){
      state.motion=!!on&&!reduced;$('motion-toggle').checked=state.motion;
      $('motion-toggle').disabled=reduced;$('train-pause').disabled=reduced;
      if(reduced){$('motion-toggle').title='Motion is off while reduced motion is enabled on this device.';$('train-pause').title=$('motion-toggle').title;}
      $('flow-legend').classList.toggle('paused',!state.motion);
      updateSimulationUI();
      updateTrainCard();dirty=true;
    }
    function makeGPURenderer(){
    function program(vs,fs) {
      function shader(type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));return sh;}
      const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;
    }
    const flat=program(`attribute vec3 aPosition;uniform mat4 uVP;void main(){gl_Position=uVP*vec4(aPosition,1.);}`,`precision mediump float;uniform vec4 uColor;void main(){gl_FragColor=uColor;}`);
    const tube=program(`attribute vec3 aCenter;attribute vec3 aNormal;uniform mat4 uVP;uniform float uRadius;uniform float uLayer;varying vec3 vNormal;void main(){vec3 p=aCenter+aNormal*uRadius;p.y+=uLayer;vNormal=aNormal;gl_Position=uVP*vec4(p,1.);}`,`precision mediump float;uniform vec4 uColor;varying vec3 vNormal;void main(){float light=.73+.27*max(dot(normalize(vNormal),normalize(vec3(-.4,.8,.5))),0.);gl_FragColor=vec4(uColor.rgb*light,uColor.a);}`);
    const points=program(`attribute vec3 aPosition;attribute vec3 aColor;attribute vec2 aMeta;uniform mat4 uVP;uniform float uSize;uniform float uDpr;varying vec3 vColor;varying vec2 vMeta;void main(){vColor=aColor;vMeta=aMeta;gl_Position=uVP*vec4(aPosition,1.);gl_PointSize=(uSize+aMeta.x*2.0)*uDpr;}`,`precision mediump float;uniform vec3 uRing;uniform vec3 uFill;varying vec3 vColor;varying vec2 vMeta;void main(){float d=length(gl_PointCoord-vec2(.5))*2.;if(d>.98)discard;vec3 c=vColor;if(vMeta.x>0.5){c=d>.67?uRing:(d>.40?uFill:vColor);}else{c=mix(vColor,vec3(1.,1.,1.),.30*(1.-d));}float edge=1.-smoothstep(.8,1.,d);gl_FragColor=vec4(c,vMeta.y*edge);}`);
    const flatLoc={pos:gl.getAttribLocation(flat,'aPosition'),vp:gl.getUniformLocation(flat,'uVP'),color:gl.getUniformLocation(flat,'uColor')};
    const tubeLoc={center:gl.getAttribLocation(tube,'aCenter'),normal:gl.getAttribLocation(tube,'aNormal'),vp:gl.getUniformLocation(tube,'uVP'),radius:gl.getUniformLocation(tube,'uRadius'),layer:gl.getUniformLocation(tube,'uLayer'),color:gl.getUniformLocation(tube,'uColor')};
    const pointLoc={pos:gl.getAttribLocation(points,'aPosition'),color:gl.getAttribLocation(points,'aColor'),meta:gl.getAttribLocation(points,'aMeta'),vp:gl.getUniformLocation(points,'uVP'),size:gl.getUniformLocation(points,'uSize'),dpr:gl.getUniformLocation(points,'uDpr'),ring:gl.getUniformLocation(points,'uRing'),fill:gl.getUniformLocation(points,'uFill')};
    function buffer(data,dynamic=false){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),dynamic?gl.DYNAMIC_DRAW:gl.STATIC_DRAW);return{buffer:b,count:data.length/3};}
    const land=buffer(K.triangles.flatMap(p=>[p[0],-.08,p[1]]));
    const water=buffer(D.surface.waterTriangles.flatMap(p=>[p[0],.025,p[1]]));
    function pathLines(paths,y){let a=[];for(const p of paths)for(let j=1;j<p.length;j++)a.push(p[j-1][0],y,p[j-1][1],p[j][0],y,p[j][1]);return buffer(a);}
    const coast=pathLines(K.rings.map(r=>[...r,r[0]]),.03);
    const borders=pathLines(D.surface.boundaries,.04), seoulOutline=pathLines(D.surface.seoul,.06), waterEdges=pathLines(D.surface.waterOutlines,.028);
    const nationalMeshes=nationalSegments.map(segments=>pathLines(segments.map(s=>s.points),.075));
    const lineVertices=D.lines.map(()=>[]);
    const SIDES=7;
    for(const e of D.segments){
      const pts=e.points, rings=[];
      if(pts.length<2)continue;
      for(let j=0;j<pts.length;j++){
        const prev=pts[Math.max(0,j-1)],next=pts[Math.min(pts.length-1,j+1)];
        let dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz)||1;
        dx/=len;dz/=len;
        const ring=[];
        for(let k=0;k<SIDES;k++){const a=2*Math.PI*k/SIDES;ring.push([pts[j][0],0,pts[j][1],-dz*Math.cos(a),Math.sin(a),dx*Math.cos(a)]);}
        rings.push(ring);
      }
      const arr=lineVertices[e.line];
      for(let j=1;j<rings.length;j++)for(let k=0;k<SIDES;k++){
        const k1=(k+1)%SIDES;arr.push(...rings[j-1][k],...rings[j][k],...rings[j][k1],...rings[j-1][k],...rings[j][k1],...rings[j-1][k1]);
      }
    }
    const railMeshes=lineVertices.map(v=>{const m=buffer(v);m.count=v.length/6;return m;});
    // Constant rail buffers; rolling-stock transforms are instanced and station coordinates streamed.
    const stationBuffer=buffer([],true),transferBuffer=buffer([],true);
    const drawTrains=T.createGPURenderer(gl);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
    gl.clearColor(...rgb(mapTheme.background),1);
    function disableAttributes(){for(let i=0;i<3;i++)gl.disableVertexAttribArray(i);}
    function flatDraw(mesh,color,mode=gl.LINES){if(!mesh.count)return;gl.useProgram(flat);disableAttributes();gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.enableVertexAttribArray(flatLoc.pos);gl.vertexAttribPointer(flatLoc.pos,3,gl.FLOAT,false,0,0);gl.uniformMatrix4fv(flatLoc.vp,false,vp);gl.uniform4fv(flatLoc.color,color);gl.drawArrays(mode,0,mesh.count);}
    function drawPoints(data,mesh,size){
      if(!data.length)return;
      gl.useProgram(points);disableAttributes();gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(pointLoc.pos);gl.vertexAttribPointer(pointLoc.pos,3,gl.FLOAT,false,32,0);
      gl.enableVertexAttribArray(pointLoc.color);gl.vertexAttribPointer(pointLoc.color,3,gl.FLOAT,false,32,12);
      gl.enableVertexAttribArray(pointLoc.meta);gl.vertexAttribPointer(pointLoc.meta,2,gl.FLOAT,false,32,24);
      gl.uniformMatrix4fv(pointLoc.vp,false,vp);gl.uniform1f(pointLoc.size,size);gl.uniform1f(pointLoc.dpr,dpr);gl.uniform3fv(pointLoc.ring,rgb(mapTheme.stationRing));gl.uniform3fv(pointLoc.fill,rgb(mapTheme.stationFill));gl.drawArrays(gl.POINTS,0,data.length/8);
    }
      return function drawGPU(time){
      gl.clearColor(...rgb(mapTheme.background),1);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.depthMask(true);
      flatDraw(land,rgba(mapTheme.land),gl.TRIANGLES);flatDraw(coast,rgba(mapTheme.coast,mapTheme.coastAlpha));
      const detail=surfaceDetail();
      if(detail){flatDraw(water,rgba(mapTheme.water,.9*detail),gl.TRIANGLES);flatDraw(waterEdges,rgba(mapTheme.waterEdge,mapTheme.waterEdgeAlpha*detail));flatDraw(borders,rgba(mapTheme.boundary,mapTheme.boundaryAlpha*detail));flatDraw(seoulOutline,rgba(mapTheme.seoul,mapTheme.seoulAlpha*detail));}
      // National corridors are static track geometry, never train-position feeds.
      gl.depthMask(false);
      for(let i=0;i<N.lines.length;i++)if(nationalVisible(i)){
        const emphasized=state.selectedNationalLine===i;
        flatDraw(nationalMeshes[i],rgba(nationalColor(i),emphasized?.98:(N.lines[i].group==='Urban'?.80:.55)));
      }
      gl.depthMask(true);
      const transitions=[],stationData=[];projected=[];
      const baseRadius=baseRailRadius();
      const emph=currentEmphasis();
      const order=D.lines.map((_,i)=>i).sort((a,b)=>lineOpacity(a)-lineOpacity(b));
      gl.useProgram(tube);disableAttributes();gl.enableVertexAttribArray(tubeLoc.center);gl.enableVertexAttribArray(tubeLoc.normal);gl.uniformMatrix4fv(tubeLoc.vp,false,vp);
      for(const i of order){
        if(!state.visible[i])continue;
        const alpha=lineOpacity(i);gl.depthMask(alpha>.8);
        const m=railMeshes[i];gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);gl.vertexAttribPointer(tubeLoc.center,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(tubeLoc.normal,3,gl.FLOAT,false,24,12);
        gl.uniform1f(tubeLoc.radius,baseRadius*(state.selectedLine===i?1.15:1));gl.uniform1f(tubeLoc.layer,lineHeight(i));gl.uniform4fv(tubeLoc.color,[...colors[i],alpha]);gl.drawArrays(gl.TRIANGLES,0,m.count);
      }
      gl.depthMask(false);
      for(const s of D.stations){
        const ls=activeLines(s);if(!ls.length)continue;
        const alpha=stationOpacity(s);
        const split=cam.spread>.025&&ls.length>1;
        if(split){const hs=ls.map(lineHeight);transitions.push(s.x,Math.min(...hs),s.z,s.x,Math.max(...hs),s.z);}
        const drawAt=split?ls:[ls[0]];
        for(const i of drawAt){
          const y=split?lineHeight(i):stationHeight(s), selected=state.selectedStation===s.id;
          stationData.push(s.x,y+baseRadius*.52,s.z,...(ls.length>1&&!split?rgb(mapTheme.stationCenter):colors[i]),selected?2:ls.length>1?1:0,alpha);
          const p=project(s.x,y,s.z);if(p.x>-20&&p.x<width+20&&p.y>-20&&p.y<height+20)projected.push({...p,s,line:i,alpha});
        }
      }
      if(transitions.length){gl.bindBuffer(gl.ARRAY_BUFFER,transferBuffer.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(transitions),gl.DYNAMIC_DRAW);transferBuffer.count=transitions.length/3;flatDraw(transferBuffer,rgba(mapTheme.connector,mapTheme.connectorAlpha));}
      const pointSize=cam.scale>80?3.0:cam.scale>35?3.8:4.8;
      drawPoints(stationData,stationBuffer,pointSize);
      // Trains are driven by received observations. Visual smoothing never pauses the feed.
      gl.depthMask(true);drawTrains(trainInstances,vp);
      gl.depthMask(true);
      };
    }

    function makeSoftwareRenderer(){
      // Software 3D projection is also available when WebGL is disabled by the browser.
      // It uses the same coordinates, camera, layer heights, selection, and controls.
      const c=canvas.getContext('2d',{alpha:false});
      if(!c)throw new Error('Neither WebGL nor Canvas rendering is available.');
      const perLine=D.lines.map((_,i)=>D.segments.filter(e=>e.line===i));
      function path(points,y){for(let j=0;j<points.length;j++){const p=project(points[j][0],y,points[j][1]);if(j)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);}}
      function surfacePaths(paths,y,color,lineWidth){c.beginPath();for(const p of paths)path(p,y);c.strokeStyle=color;c.lineWidth=lineWidth;c.stroke();}
      function disc(x,y,r,color,alpha=1){c.globalAlpha=alpha;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill();}
      function drawSurface(){
        c.globalAlpha=1;
        c.beginPath();for(const ring of K.rings){path(ring,-.08);c.closePath();}c.fillStyle=mapTheme.land;c.fill('evenodd');
        c.beginPath();for(const ring of K.rings){path(ring,.03);c.closePath();}c.strokeStyle=cssRGBA(mapTheme.coast,mapTheme.coastAlpha);c.lineWidth=1.2;c.stroke();
        const detail=surfaceDetail();
        if(detail){
          c.globalAlpha=detail;
          c.beginPath();const water=D.surface.waterTriangles;for(let i=0;i<water.length;i+=3){path(water.slice(i,i+3),.025);c.closePath();}c.fillStyle=mapTheme.water;c.fill();
          surfacePaths(D.surface.waterOutlines,.028,cssRGBA(mapTheme.waterEdge,mapTheme.waterEdgeAlpha),.65);surfacePaths(D.surface.boundaries,.04,cssRGBA(mapTheme.boundary,mapTheme.boundaryAlpha),.6);surfacePaths(D.surface.seoul,.06,cssRGBA(mapTheme.seoul,mapTheme.seoulAlpha),.9);
          c.globalAlpha=1;
        }
      }
      return function drawSoftware(time){
        c.setTransform(dpr,0,0,dpr,0,0);c.globalAlpha=1;c.fillStyle=mapTheme.background;c.fillRect(0,0,width,height);c.lineJoin='round';c.lineCap='round';
        drawSurface();
        for(let li=0;li<N.lines.length;li++){
          if(!nationalVisible(li))continue;
          c.beginPath();for(const segment of nationalSegments[li])path(segment.points,.075);
          c.strokeStyle=nationalColor(li);
          c.globalAlpha=state.selectedNationalLine===li?1:N.lines[li].group==='Urban'?.82:.58;
          c.lineWidth=state.selectedNationalLine===li?2.5:N.lines[li].group==='Urban'?1.75:1.25;
          c.stroke();
        }
        c.globalAlpha=1;
        projected=[];
        if(cam.spread>.025){c.beginPath();for(const s of D.stations){const ls=activeLines(s);if(ls.length<2)continue;const hs=ls.map(lineHeight),a=project(s.x,Math.min(...hs),s.z),b=project(s.x,Math.max(...hs),s.z);c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);}c.strokeStyle=cssRGBA(mapTheme.connector,mapTheme.connectorAlpha);c.lineWidth=.8;c.stroke();}
        const order=D.lines.map((_,i)=>i).sort((a,b)=>lineOpacity(a)-lineOpacity(b)||lineHeight(a)-lineHeight(b));
        const lineWidth=cam.scale>100?2.45:2.8;
        for(const li of order){if(!state.visible[li])continue;c.globalAlpha=lineOpacity(li);c.beginPath();for(const e of perLine[li])path(e.points,lineHeight(li));
          c.strokeStyle=mapTheme.trackCasing;c.lineWidth=lineWidth+1.8;c.stroke();c.strokeStyle=D.lines[li].color;c.lineWidth=lineWidth*(state.selectedLine===li?1.12:1);c.stroke();
          // Narrow reflected edge adds a small tubular highlight at close range.
          if(cam.scale<45){c.globalAlpha=lineOpacity(li)*.15;c.strokeStyle='#ffffff';c.lineWidth=.65;c.stroke();}
        }
        const pointRadius=cam.scale>80?1.5:cam.scale>35?1.9:2.4;
        for(const s of D.stations){const ls=activeLines(s);if(!ls.length)continue;const split=cam.spread>.025&&ls.length>1,alpha=stationOpacity(s);
          for(const li of (split?ls:[ls[0]])){const p=project(s.x,split?lineHeight(li):stationHeight(s),s.z);if(p.x<-20||p.x>width+20||p.y<-20||p.y>height+20)continue;projected.push({...p,s,line:li,alpha});
            const transfer=ls.length>1,r=pointRadius+(transfer?1:0);disc(p.x,p.y,r+.8,mapTheme.background,alpha);
            if(transfer){disc(p.x,p.y,r,mapTheme.stationRing,alpha);disc(p.x,p.y,r*.52,mapTheme.stationFill,alpha);disc(p.x,p.y,r*.24,D.lines[li].color,alpha);}
            else{disc(p.x,p.y,r,D.lines[li].color,alpha);disc(p.x-.2,p.y-.2,r*.52,mapTheme.stationFill,alpha*.7);}
          }
        }
        const eye=[Math.sin(cam.yaw)*Math.cos(cam.pitch),Math.sin(cam.pitch),Math.cos(cam.yaw)*Math.cos(cam.pitch)];
        T.drawSoftware(c,trainInstances,project,eye,{w:width,h:height});
        c.globalAlpha=1;
      };
    }
    let drawScene;
    try { drawScene=gl?makeGPURenderer():makeSoftwareRenderer(); }
    catch(error) {
      if(!gl)throw error;
      console.warn('Using software 3D rendering:',error.message);
      const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;gl=null;
      drawScene=makeSoftwareRenderer();
    }
    function updateMatrix(){
      const cy=Math.cos(cam.yaw),sy=Math.sin(cam.yaw),sp=Math.sin(cam.pitch),cp=Math.cos(cam.pitch),sx=2/(cam.scale*aspect),scy=2/cam.scale;
      const r=[cy,0,-sy],u=[-sy*sp,cp,-cy*sp],v=[sy*cp,sp,cy*cp];
      vp=new Float32Array([r[0]*sx,u[0]*scy,-v[0]/300,0,r[1]*sx,u[1]*scy,-v[1]/300,0,r[2]*sx,u[2]*scy,-v[2]/300,0,-(r[0]*cam.x+r[2]*cam.z)*sx,-(u[0]*cam.x+u[1]*cam.y+u[2]*cam.z)*scy,(v[0]*cam.x+v[1]*cam.y+v[2]*cam.z)/300,1]);
    }
    function project(x,y,z){return{x:(vp[0]*x+vp[4]*y+vp[8]*z+vp[12]+1)*width/2,y:(1-vp[1]*x-vp[5]*y-vp[9]*z-vp[13])*height/2,depth:vp[2]*x+vp[6]*y+vp[10]*z+vp[14]};}
    /** Intersect a screen ray with a horizontal plane. This projection has no perspective divide. */
    function pointUnderCursor(x,y,view=cam,planeY=view.y){
      const cy=Math.cos(view.yaw),sy=Math.sin(view.yaw),sp=Math.sin(view.pitch),cp=Math.cos(view.pitch);
      const right=(x-width/2)*view.scale/height,up=(height/2-y)*view.scale/height;
      // Pitch is constrained to >= .20 radians by the orbit controls.
      const forward=(cp*(planeY-view.y)-up)/Math.max(.0001,sp);
      return {x:view.x+cy*right+sy*forward,y:planeY,z:view.z-sy*right+cy*forward};
    }
    function releaseZoomAnchor(){zoomAnchor=null;}
    function cancelIntro(){if(intro){intro=null;Object.assign(goal,cam);state.scope='custom';updateScope();dirty=true;}}
    function pinZoomAnchor(view){
      if(!zoomAnchor)return;
      const p=pointUnderCursor(zoomAnchor.screenX,zoomAnchor.screenY,view,zoomAnchor.world.y);
      view.x+=zoomAnchor.world.x-p.x;view.z+=zoomAnchor.world.z-p.z;
    }
    function stopAutomaticCamera(){
      cancelIntro();
      cancelFollow();
      if(state.orbit){state.orbit=false;$('orbit').setAttribute('aria-pressed','false');$('orbit').classList.remove('active');}
      // Manual zoom interrupts any fly-to/orbit rotation, but does not snap the rendered camera.
      goal.yaw=cam.yaw;goal.pitch=cam.pitch;goal.y=cam.y;
      hover=null;$('hover-tip').hidden=true;
    }
    function zoomAt(factor,x=width/2,y=height/2){
      if(!Number.isFinite(factor)||factor<=0||!Number.isFinite(x)||!Number.isFinite(y))return;
      const base=zoomAnchor?goal.scale:cam.scale,next=clamp(base*factor,MIN_SCALE,MAX_SCALE);
      // Do not translate the camera when a zoom limit has already been reached.
      if(Math.abs(next-base)<1e-10)return;
      stopAutomaticCamera();
      // Anchor to the currently rendered view, never the still-easing destination.
      zoomAnchor={world:pointUnderCursor(x,y),screenX:x,screenY:y};
      goal.scale=next;pinZoomAnchor(goal);
      state.scope='custom';updateScope();dirty=true;
    }
    function visibleStations(){return D.stations.filter(s=>s.lines.some(i=>state.visible[i]));}
    function fitStations(stations,instant=false){
      cancelIntro();releaseZoomAnchor();if(!stations.length)return;
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
      for(const s of stations){
        minX=Math.min(minX,s.x);maxX=Math.max(maxX,s.x);minZ=Math.min(minZ,s.z);maxZ=Math.max(maxZ,s.z);
      }
      goal.x=(minX+maxX)/2;goal.z=(minZ+maxZ)/2;
      goal.y=0;
      let minR=Infinity,maxR=-Infinity,minU=Infinity,maxU=-Infinity;
      const cy=Math.cos(goal.yaw),sy=Math.sin(goal.yaw),sp=Math.sin(goal.pitch),cp=Math.cos(goal.pitch);
      for(const s of stations)for(const li of s.lines.filter(i=>state.visible[i])){
        const dx=s.x-goal.x,dz=s.z-goal.z,dy=lineLevel(li,goal.spread)-goal.y;
        const r=cy*dx-sy*dz,u=-sy*sp*dx+cp*dy-cy*sp*dz;
        minR=Math.min(minR,r);maxR=Math.max(maxR,r);minU=Math.min(minU,u);maxU=Math.max(maxU,u);
      }
      const mobile=width<600;
      goal.scale=clamp(Math.max((maxR-minR)/(aspect*(mobile?.82:.85)),(maxU-minU)/(mobile?.66:.70),8),6,260);
      // Leave a little room for the north-caption and view controls.
      const midR=(minR+maxR)/2,midU=(minU+maxU)/2,spSafe=Math.max(.2,sp);
      goal.x+=cy*midR-sy*midU/spSafe;goal.z+=-sy*midR-cy*midU/spSafe;
      const off=goal.scale*.02;goal.x+=sy*off/spSafe;goal.z+=cy*off/spSafe;
      if(instant)Object.assign(cam,goal);
      dirty=true;
    }
    function fitCountryCamera(instant=false){
      releaseZoomAnchor();
      const b=K.bounds,mobile=width<600;
      goal.x=(b.minX+b.maxX)/2;goal.z=(b.minZ+b.maxZ)/2;goal.y=0;
      goal.scale=clamp(Math.max(
        (b.maxX-b.minX)/(aspect*(mobile?.74:.84)),
        (b.maxZ-b.minZ)/(mobile?.70:.78)
      ),8,MAX_SCALE);
      if(instant)Object.assign(cam,goal);
      dirty=true;
    }
    function fitAll(instant=false,reset=false){cancelIntro();cancelFollow();clearAux();if(reset){goal.yaw=DEFAULT_YAW;goal.pitch=DEFAULT_PITCH;}state.scope='full';updateScope();fitStations(visibleStations(),instant);}
    function country(){
      cancelIntro();cancelFollow();showAll();state.scope='country';
      goal.yaw=0;goal.pitch=Math.PI/2;goal.spread=.12;
      fitCountryCamera();updateScope();dirty=true;
    }
    function core(){cancelIntro();releaseZoomAnchor();resetTrain();clearAux();state.scope='core';state.selectedLine=null;state.selectedStation=null;updateCards();updateLineUI();updateScope();goal.x=0;goal.z=-2;goal.y=0;goal.scale=width<600?49:37;dirty=true;}
    function clearAux(){state.selectedPlace=null;state.selectedNationalLine=null;updateAuxCards();updateScope();dirty=true;}
    function focusBounds(points,minimum=8){
      if(!points.length)return;
      cancelIntro();releaseZoomAnchor();cancelFollow();
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
      for(const p of points){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[1]);maxZ=Math.max(maxZ,p[1]);}
      goal.x=(minX+maxX)/2;goal.z=(minZ+maxZ)/2;goal.y=0;
      goal.yaw=0;goal.pitch=.95;
      goal.scale=clamp(Math.max((maxX-minX)/(aspect*(width<600?.73:.78)),(maxZ-minZ)/(width<600?.55:.68),minimum),minimum,MAX_SCALE);
      state.scope='custom';updateScope();dirty=true;closeMobile();
    }
    function focusCity(city){
      const points=[];
      N.lines.forEach((line,i)=>{if(line.group==='Urban'&&line.city===city){state.nationalUrban=true;for(const s of nationalSegments[i])for(const p of s.points)points.push(p);}});
      $('national-urban-toggle').checked=state.nationalUrban;
      if(!points.length){
        const centers={Busan:[129.0756,35.1796],Daegu:[128.6014,35.8714],Daejeon:[127.3845,36.3504],Gwangju:[126.8526,35.1595]};
        const [lon,lat]=centers[city]||centers.Busan;goal.x=(lon-126.98)*88.28;goal.z=(37.53-lat)*111.32;goal.scale=32;goal.pitch=.95;state.scope='custom';updateScope();dirty=true;return;
      }
      clearAux();focusBounds(points,city==='Busan'?18:12);$('map-subtitle').textContent=`${city} · regional rail map`;
    }
    function focusKpop(){
      state.kpop=true;$('kpop-toggle').checked=true;clearAux();focusBounds(P.sites.map(s=>[s.x,s.z]),15);
      $('map-subtitle').textContent='Seoul · K-pop places';
    }
    function focusNationalLine(i){
      const line=N.lines[i];if(!line)return;
      resetTrain();state.selectedLine=null;state.selectedStation=null;updateCards();updateLineUI();
      if(line.group==='Urban')state.nationalUrban=true;else state.nationalIntercity=true;
      $('national-urban-toggle').checked=state.nationalUrban;$('national-intercity-toggle').checked=state.nationalIntercity;
      state.selectedPlace=null;state.selectedNationalLine=i;
      const points=nationalSegments[i].flatMap(s=>s.points);
      focusBounds(points,12);updateAuxCards();$('map-subtitle').textContent=`${line.name} · static rail geometry`;
    }
    function selectPlace(id){
      const site=P.sites.find(s=>s.id===id);if(!site)return;
      resetTrain();state.selectedLine=null;state.selectedStation=null;updateCards();updateLineUI();
      cancelIntro();releaseZoomAnchor();state.kpop=true;$('kpop-toggle').checked=true;
      state.selectedNationalLine=null;state.selectedPlace=id;state.scope='custom';updateScope();
      goal.x=site.x;goal.z=site.z;goal.y=.115+(window.SeoulKpopModels.siteLooks[site.id]?.height||0)*.52;
      goal.yaw=.35;goal.pitch=.67;
      goal.scale=width<600?(id==='cj_enm'||id==='mbc_media'?.55:.44):.32;
      if(width<600){
        // Reserve room for the mobile view controls while keeping the model centered vertically.
        const shift=62*goal.scale/height;
        goal.x+=Math.cos(goal.yaw)*shift;
        goal.z+=goal.scale*.22-Math.sin(goal.yaw)*shift;
      }
      updateAuxCards();dirty=true;closeMobile();$('map-subtitle').textContent=`${site.name} · K-pop place`;
    }
    function updateAuxCards(){
      const place=P.sites.find(s=>s.id===state.selectedPlace),pc=$('place-card');pc.hidden=!place;
      if(place)pc.innerHTML=`<div class="card-top"><span class="eyebrow">K-POP PLACE / 성지</span><button class="card-close" data-close-aux aria-label="Close place details">${icon('close')}</button></div><h2>${escapeHTML(place.name)}</h2><div class="station-english">${escapeHTML(place.ko)}</div><p>${escapeHTML(place.description)}</p><p class="place-visit">${escapeHTML(place.visit)}</p><div class="station-coordinates">${escapeHTML(place.address)}<br>${place.lat.toFixed(5)}° N · ${place.lon.toFixed(5)}° E</div><p class="card-note">Exterior-inspired 3D sketch; dimensions and details remain illustrative.</p><a href="${escapeHTML(place.url)}" target="_blank" rel="noopener noreferrer">Place information ↗</a>`;
      const i=state.selectedNationalLine,nc=$('national-card');nc.hidden=i===null;
      if(i!==null){const line=N.lines[i],count=nationalSegments[i].length;nc.innerHTML=`<div class="card-top"><span class="eyebrow">${escapeHTML(line.group.toUpperCase())} / STATIC RAIL</span><button class="card-close" data-close-aux aria-label="Close route details">${icon('close')}</button></div><h2>${escapeHTML(line.name)}</h2><div class="station-english">${escapeHTML(line.ko||'')}</div><p>${escapeHTML(line.city||'South Korea')} · ${escapeHTML(line.mode||'Passenger rail')}</p><p class="card-note">${count} mapped track segments from OpenStreetMap. This layer shows rail alignment, not live trains, timetables or a guarantee that every service stops here.</p>`;}
    }
    function createAuxUI(){
      $('national-line-list').innerHTML=N.lines.map((line,i)=>`<button data-national-line="${i}"><i style="background:${escapeHTML(nationalColor(i))}"></i><span>${escapeHTML(line.name)}<small>${escapeHTML(line.city||line.group)} · ${escapeHTML(line.mode||line.group)}</small></span></button>`).join('')||'<p>National rail data unavailable.</p>';
      $('kpop-list').innerHTML=P.sites.map(site=>`<button data-place="${escapeHTML(site.id)}"><i>✦</i><span>${escapeHTML(site.name)}<small>${escapeHTML(site.ko)}</small></span></button>`).join('');
      $('national-line-list').onclick=e=>{const b=e.target.closest('[data-national-line]');if(b)focusNationalLine(+b.dataset.nationalLine);};
      $('kpop-list').onclick=e=>{const b=e.target.closest('[data-place]');if(b)selectPlace(b.dataset.place);};
      for(const b of document.querySelectorAll('[data-city]'))b.onclick=()=>focusCity(b.dataset.city);
      $('kpop-focus').onclick=focusKpop;
      $('national-urban-toggle').onchange=e=>{state.nationalUrban=e.target.checked;if(state.selectedNationalLine!==null&&!nationalVisible(state.selectedNationalLine))clearAux();updateEmptyState();dirty=true;};
      $('national-intercity-toggle').onchange=e=>{state.nationalIntercity=e.target.checked;if(state.selectedNationalLine!==null&&!nationalVisible(state.selectedNationalLine))clearAux();updateEmptyState();dirty=true;};
      $('kpop-toggle').onchange=e=>{state.kpop=e.target.checked;if(!state.kpop&&state.selectedPlace!==null)clearAux();updateEmptyState();dirty=true;};
      for(const id of ['place-card','national-card'])$(id).onclick=e=>{if(e.target.closest('[data-close-aux]'))clearAux();};
    }
    function startIntro(){
      goal.yaw=0;goal.pitch=Math.PI/2;goal.y=0;goal.spread=.12;
      fitCountryCamera(true);
      const from={...cam};
      goal.yaw=DEFAULT_YAW;goal.pitch=DEFAULT_PITCH;
      fitStations(visibleStations());
      const to={...goal};
      if(reduced){Object.assign(cam,to);state.scope='full';updateScope();dirty=true;return;}
      Object.assign(goal,from);
      state.scope='country';updateScope();
      intro={from,to,elapsed:0};
      dirty=true;
    }
    function updateScope(){
      viewport.classList.toggle('country-scope',state.scope==='country');
      $('scope-country').classList.toggle('active',state.scope==='country');
      $('scope-full').classList.toggle('active',state.scope==='full');$('scope-core').classList.toggle('active',state.scope==='core');
      let text=state.scope==='country'?'South Korea · national rail context':state.scope==='core'?'A closer look at the heart of Seoul':state.scope==='full'?'The full Seoul network, in perspective':'Explore Korea at your own scale';
      if(state.scope==='custom'){
        if(state.selectedTrain!==null)text=D.lines[fleet.trains[state.selectedTrain].line].name+' · 3D rolling stock';
        else if(state.selectedStation!==null){const s=lookup.get(state.selectedStation);text=s.ko+' · '+s.en;}
        else if(state.selectedLine!==null)text=D.lines[state.selectedLine].name+' · '+D.lines[state.selectedLine].stations+' mapped stations';
        else if(state.selectedNationalLine!==null)text=N.lines[state.selectedNationalLine].name+' · static rail geometry';
        else if(state.selectedPlace!==null)text=P.sites.find(s=>s.id===state.selectedPlace)?.name+' · K-pop place';
      }
      $('map-subtitle').textContent=text;
    }
    function resize(){
      releaseZoomAnchor();const r=viewport.getBoundingClientRect(),wasIntro=!!intro&&(Math.abs(r.width-width)>1||Math.abs(r.height-height)>1);
      if(wasIntro){cancelIntro();goal.yaw=DEFAULT_YAW;goal.pitch=DEFAULT_PITCH;}
      width=Math.max(1,r.width);height=Math.max(1,r.height);aspect=width/height;dpr=Math.min(window.devicePixelRatio||1,1.75);
      canvas.width=overlay.width=Math.round(width*dpr);canvas.height=overlay.height=Math.round(height*dpr);if(gl)gl.viewport(0,0,canvas.width,canvas.height);ctx.setTransform(dpr,0,0,dpr,0,0);
      if(fitAfterResize||wasIntro){
        if(state.scope==='country'&&!wasIntro){goal.yaw=0;goal.pitch=Math.PI/2;fitCountryCamera(true);}
        else fitAll(true);
        fitAfterResize=false;
      }dirty=true;positionResults();updateTrainCard();
    }
    function render(time=performance.now()){
      updateMatrix();prepareTrains();drawScene(time);
      drawLabels(time);
      $('north-icon').style.transform=`rotate(${-cam.yaw*180/Math.PI}deg)`;
      const goalKm=cam.scale/height*66;
      const sizes=[.1,.2,.5,1,2,5,10,20,50];const km=sizes.reduce((best,n)=>Math.abs(n-goalKm)<Math.abs(best-goalKm)?n:best,1);
      $('scale-line').style.width=`${km/cam.scale*height}px`;$('scale-label').textContent=km<1?`${km*1000} m`:`${km} km`;
    }
    function drawNationalStops(){
      nationalHits=[];
      if(cam.scale>105)return;
      const named=[];
      for(const s of N.stations){
        const li=s.lines.find(nationalVisible);if(li===undefined)continue;
        const p=project(s.x,.10,s.z);
        if(p.x<10||p.x>width-10||p.y<105||p.y>height-65)continue;
        const radius=cam.scale<12?2.8:cam.scale<45?1.8:1.4;
        ctx.beginPath();ctx.arc(p.x,p.y,radius+1,0,Math.PI*2);ctx.fillStyle=mapTheme.background;ctx.fill();
        ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fillStyle=nationalColor(li);ctx.fill();
        nationalHits.push({s,li,x:p.x,y:p.y});
        if(cam.scale<16&&named.length<90)named.push({s,p});
      }
      if(state.labels&&named.length){
        ctx.font='600 9px "Segoe UI",Arial,sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';
        const boxes=[];
        for(const {s,p} of named.sort((a,b)=>b.s.lines.length-a.s.lines.length)){
          const name=s.ko||s.en;if(!name)continue;
          const w=ctx.measureText(name).width+5,box={x:p.x+5,y:p.y-5,w,h:11};
          if(box.x+box.w>width-75||boxes.some(other=>box.x<other.x+other.w+4&&box.x+box.w>other.x-4&&box.y<other.y+other.h+3&&box.y+box.h>other.y-3))continue;
          boxes.push(box);ctx.lineWidth=2.5;ctx.strokeStyle=mapTheme.background;ctx.strokeText(name,box.x,p.y);ctx.fillStyle=mapTheme.majorLabel;ctx.fillText(name,box.x,p.y);
          if(boxes.length>=35)break;
        }
      }
    }
    function drawKpopModels(){
      kpopHits=[];
      if(!state.kpop||!P.sites.length)return;
      if(cam.scale>70){
        const p=project((126.98-126.98)*88.28,.3,(37.53-37.56)*111.32);
        if(p.x>15&&p.x<width-15&&p.y>105&&p.y<height-45){
          const markerX=p.x+20,markerY=p.y-18;
          ctx.save();ctx.translate(markerX,markerY);ctx.fillStyle='#8b7d6c';ctx.strokeStyle='#ffffff';ctx.lineWidth=2;
          ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(10,0);ctx.lineTo(0,11);ctx.lineTo(-10,0);ctx.closePath();ctx.fill();ctx.stroke();
          ctx.fillStyle='#ffffff';ctx.font='700 10px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('K',0,1);ctx.restore();
          kpopHits.push({site:null,x:markerX,y:markerY,r:16});
        }
        return;
      }
      const modelLabels=[],labelBoxes=[];
      const shortNames={hybe:'HYBE',sm:'SM',jyp:'JYP',yg:'YG',k_star_road:'K-Star Road',coex_kpop_square:'COEX K-POP',hongdae_kpop_square:'K-Pop Square',hikr_ground:'HiKR Ground',kbs_hall:'KBS Hall',cj_enm:'CJ ENM',mbc_media:'MBC'};
      const closePlace=state.selectedPlace!==null&&cam.scale<1.5;
      const sites=closePlace?P.sites.filter(site=>site.id===state.selectedPlace):P.sites;
      const visible=sites.map(site=>({site,p:project(site.x,.1,site.z)}))
        .filter(({p})=>p.x>-60&&p.x<width+60&&p.y>65&&p.y<height+45)
        .sort((a,b)=>a.p.y-b.p.y);
      for(const {site,p} of visible){
        const selected=state.selectedPlace===site.id;
        const hit=window.SeoulKpopModels.draw(ctx,site,project,{selected,dark:window.SeoulTheme.current==='dark',scale:cam.scale,viewportHeight:height,yaw:cam.yaw,pitch:cam.pitch});
        if(!hit)continue;
        kpopHits.push({site,x:hit.x,y:hit.y,r:hit.r,drawn:hit.drawn});
        if(selected||cam.scale<25)modelLabels.push({site,x:hit.x,y:hit.topY-5});
      }
      ctx.font='700 10px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';
      for(const label of modelLabels.sort((a,b)=>Number(b.site.id===state.selectedPlace)-Number(a.site.id===state.selectedPlace))){
        const name=shortNames[label.site.id]||label.site.name,w=ctx.measureText(name).width+6;
        const box={x:label.x-w/2,y:label.y-12,w,h:13};
        if(box.x<5||box.x+box.w>width-5||box.y<105||box.y>height-90)continue;
        if(label.site.id!==state.selectedPlace&&labelBoxes.some(b=>box.x<b.x+b.w+4&&box.x+box.w>b.x-4&&box.y<b.y+b.h+2&&box.y+box.h>b.y-2))continue;
        labelBoxes.push(box);ctx.lineWidth=3;ctx.strokeStyle=mapTheme.background;ctx.strokeText(name,label.x,label.y);
        ctx.fillStyle=mapTheme.selectedLabel;ctx.fillText(name,label.x,label.y);
      }
    }
    function drawLabels(time){
      ctx.clearRect(0,0,width,height);
      // At network scale the actual four-car meshes are subpixel. A tiny
      // route-colored point keeps their synthetic movement legible until the
      // camera is close enough to show the 3D car geometry itself.
      if(cam.scale<180){
        ctx.save();
        for(const pose of trainPoses){
          if(T.CAR_LENGTH*pose.scale/cam.scale*height>=4)continue;
          const p=project(pose.x,lineHeight(pose.train.line)+baseRailRadius()*1.05,pose.z);
          if(p.x<3||p.x>width-3||p.y<105||p.y>height-16)continue;
          ctx.beginPath();ctx.arc(p.x,p.y,2.35,0,Math.PI*2);
          ctx.lineWidth=1.25;ctx.strokeStyle=mapTheme.background;ctx.stroke();
          ctx.fillStyle=D.lines[pose.train.line].color;ctx.fill();
        }
        ctx.restore();
      }
      const selected=focusedStation();
      if(selected && activeLines(selected).length){const p=project(selected.x,stationHeight(selected),selected.z);ctx.beginPath();ctx.arc(p.x,p.y,11+(state.motion?1.7*Math.sin(time*.003):0),0,Math.PI*2);ctx.strokeStyle=mapTheme.accent;ctx.lineWidth=1.3;ctx.stroke();}
      if(state.selectedTrain!==null){
        const h=trainHits.find(h=>h.train.id===state.selectedTrain);
        if(h){ctx.font='600 10px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.fillStyle=mapTheme.selectedLabel;ctx.fillText('3D TRAIN / '+h.train.number,h.center.x,h.center.y-27);}
      }
      if(!state.labels){drawNationalStops();drawKpopModels();return;}
      if(cam.scale>350){
        const cities=width<600?[
          ['SEOUL',126.978,37.5665],['BUSAN',129.0756,35.1796],['JEJU',126.5312,33.4996]
        ]:[
          ['SEOUL',126.978,37.5665],['DAEJEON',127.3845,36.3504],
          ['DAEGU',128.6014,35.8714],['GWANGJU',126.8526,35.1595],
          ['BUSAN',129.0756,35.1796],['JEJU',126.5312,33.4996]
        ];
        ctx.font='600 10px "Segoe UI", Arial, sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';
        for(const [name,lon,lat] of cities){
          const p=project((lon-126.98)*88.28,.05,(37.53-lat)*111.32);
          if(p.x<24||p.x>width-85||p.y<125||p.y>height-65)continue;
          ctx.beginPath();ctx.arc(p.x,p.y,3.2,0,Math.PI*2);ctx.fillStyle=mapTheme.accent;ctx.fill();
          ctx.lineWidth=3;ctx.strokeStyle=mapTheme.land;ctx.strokeText(name,p.x+8,p.y);
          ctx.fillStyle=mapTheme.majorLabel;ctx.fillText(name,p.x+8,p.y);
        }
        drawKpopModels();return;
      }
      const boxes=[],labels=[];
      const reserved=[{x:0,y:0,w:width,h:103},{x:width-72,y:100,w:72,h:325},{x:width/2-170,y:height-112,w:340,h:112}];
      for(const id of ['station-card','line-card','train-card','place-card','national-card']){const card=$(id);if(!card.hidden){const r=card.getBoundingClientRect(),v=viewport.getBoundingClientRect();reserved.push({x:r.left-v.left,y:r.top-v.top,w:r.width,h:r.height});}}
      if(!selected&&state.selectedLine===null){
        const places=[['SEOUL',126.98,37.569],['INCHEON',126.626,37.469],['SUWON',127.019,37.261],['CHUNCHEON',127.716,37.902]];
        ctx.textAlign='center';ctx.font='500 11px "Segoe UI", Arial, sans-serif';ctx.fillStyle=mapTheme.cityLabel;
        for(const [name,lon,lat] of places){const p=project((lon-126.98)*88.28,.05,(37.53-lat)*111.32);if(p.x<80||p.x>width-90||p.y<135||p.y>height-155)continue;ctx.globalAlpha=.55;ctx.fillText(name.split('').join(' '),p.x,p.y-25);ctx.globalAlpha=1;}
      }
      const candidates=[...sortedStations];if(selected){const idx=candidates.indexOf(selected);if(idx>=0)candidates.splice(idx,1);candidates.unshift(selected);}
      const maximum=state.selectedLine!==null?48:cam.scale>90?26:cam.scale>50?30:cam.scale>25?42:62;
      const font=cam.scale>65?9.5:11;
      ctx.font=`500 ${font}px "Segoe UI", Arial, "Noto Sans CJK KR", sans-serif`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.lineJoin='round';
      for(const s of candidates){
        if(labels.length>=maximum)break;
        if(!activeLines(s).length||stationOpacity(s)<.6)continue;
        if(cam.scale>85&&!majorNames.includes(s.ko)&&s.lines.length<2)continue;
        if(cam.scale>30&&s.lines.length<2&&!majorNames.includes(s.ko)&&state.selectedLine===null&&s!==selected)continue;
        const p=project(s.x,stationHeight(s),s.z), text=s.ko;
        const w=ctx.measureText(text).width+9,h=font+8;
        if(p.x<8||p.x>width-w-12||p.y<104||p.y>height-72)continue;
        let box=null;
        for(const side of [1,-1]){
          const b={x:side===1?p.x+7:p.x-w-7,y:p.y-h/2,w,h};
          const overlap=[...boxes,...reserved].some(o=>b.x<o.x+o.w+4&&b.x+b.w>o.x-4&&b.y<o.y+o.h&&b.y+b.h>o.y);
          if(!overlap){box=b;break;}
        }
        if(!box)continue;boxes.push(box);labels.push({text,x:box.x+3,y:p.y,selected:s===selected,major:majorNames.includes(s.ko)});
      }
      for(const l of labels){ctx.lineWidth=3.6;ctx.strokeStyle=mapTheme.background;ctx.strokeText(l.text,l.x,l.y);ctx.fillStyle=l.selected?mapTheme.selectedLabel:l.major?mapTheme.majorLabel:mapTheme.label;ctx.fillText(l.text,l.x,l.y);}
      drawNationalStops();drawKpopModels();
    }
    function frame(time){
      const frameDt=(time-lastFrame)/1000||.016,dt=Math.min(frameDt,.05);lastFrame=time;
      // Keep synthetic travel tied to elapsed visible time even when a heavy
      // WebGL frame takes longer than the camera's capped smoothing step.
      if(state.motion&&!document.hidden)trainClock+=Math.min(Math.max(frameDt,0),2)*1000;
      if(state.followTrain&&state.selectedTrain!==null){
        const t=fleet.trains[state.selectedTrain],p=trainPose(t,trainClock,modelScale());
        goal.x=p.x;goal.z=p.z;goal.y=lineHeight(t.line)+.03;
        if(width<600){const off=goal.scale*.23/Math.max(.25,Math.sin(goal.pitch));goal.x-=Math.sin(goal.yaw)*off;goal.z-=Math.cos(goal.yaw)*off;}
      }
      if(state.orbit&&!document.hidden){goal.yaw+=dt*.045;dirty=true;}
      let changed=false;
      if(intro&&!document.hidden){
        // Show all South Korea first, then move toward the subway while tilting into 3D.
        intro.elapsed+=Math.min(frameDt,.5);
        const z=clamp((intro.elapsed-.85)/4.0,0,1),zoom=z*z*(3-2*z);
        const t=clamp((intro.elapsed-1.25)/3.6,0,1),tilt=t*t*(3-2*t);
        for(const k of ['x','y','z'])cam[k]=mix(intro.from[k],intro.to[k],zoom);
        cam.scale=intro.from.scale*Math.pow(intro.to.scale/intro.from.scale,zoom);
        for(const k of ['yaw','pitch','spread'])cam[k]=mix(intro.from[k],intro.to[k],tilt);
        Object.assign(goal,cam);changed=true;
        if(z===1&&t===1){Object.assign(cam,intro.to);Object.assign(goal,intro.to);intro=null;state.scope='full';updateScope();}
      }else if(!intro){
        const f=reduced?1:1-Math.exp(-dt*9);
        for(const k of Object.keys(cam)){if(Math.abs(cam[k]-goal[k])>0.00005){cam[k]=mix(cam[k],goal[k],f);changed=true;}else cam[k]=goal[k];}
      }
      // Re-constrain every interpolated frame: the same world point stays beneath the cursor
      // throughout the animation, including rapid wheel reversals and cursor changes.
      if(zoomAnchor){pinZoomAnchor(cam);if(!changed&&!pointers.size)releaseZoomAnchor();}
      if(!document.hidden&&(dirty||changed||state.motion||state.orbit)){render(time);dirty=false;}
      requestAnimationFrame(frame);
    }

    function badge(i){const l=D.lines[i];return `<span class="line-badge ${l.badge.length>1?'wide':''}" style="--route:${l.color};color:${rgb(l.color).reduce((v,c,j)=>v+c*[.2126,.7152,.0722][j],0)>.6?'#113257':'#ffffff'}">${escapeHTML(l.badge)}</span>`;}
    function createLineUI(){
      let last='';$('line-list').innerHTML=D.lines.map((l,i)=>{
        const group=l.group!==last?`<div class="group-heading">${escapeHTML(l.group.toUpperCase())}</div>`:'';last=l.group;
        return group+`<div class="line-row" data-row="${i}"><label class="line-check"><input data-visible="${i}" type="checkbox" checked aria-label="Show ${escapeHTML(l.name)}"></label><button class="line-focus" data-focus="${i}" aria-label="Explore ${escapeHTML(l.name)}">${badge(i)}<span class="line-label">${escapeHTML(l.name)}<small class="feed-state" data-feed-state="${escapeHTML(l.id)}">—</small></span><span class="line-count">${l.stations}</span>${icon('arrow')}</button></div>`;
      }).join('');
      $('line-list').addEventListener('change',e=>{if(e.target.dataset.visible===undefined)return;state.visible[+e.target.dataset.visible]=e.target.checked;updateVisibility();});
      $('line-list').addEventListener('click',e=>{const b=e.target.closest('[data-focus]');if(b)focusLine(+b.dataset.focus);});
    }
    function updateLineUI(){
      document.querySelectorAll('[data-row]').forEach(row=>{const i=+row.dataset.row;row.classList.toggle('muted',!state.visible[i]);row.classList.toggle('selected',state.selectedLine===i);row.querySelector('input').checked=state.visible[i];});
      $('visible-count').textContent=`${state.visible.filter(Boolean).length} / 24`;
    }
    function updateVisibility(){
      cancelIntro();
      if(state.selectedTrain!==null&&!state.visible[fleet.trains[state.selectedTrain].line])resetTrain();
      if(state.selectedLine!==null&&!state.visible[state.selectedLine])state.selectedLine=null;
      if(focusedStation()&&!activeLines(focusedStation()).length)state.selectedStation=null;
      updateLineUI();updateCards();updateEmptyState();dirty=true;
      updateSimulationUI();
    }
    function showAll(){resetTrain();clearAux();state.visible.fill(true);state.selectedLine=null;state.selectedStation=null;updateVisibility();}
    function clearSelection(){cancelIntro();resetTrain();clearAux();state.selectedLine=null;state.selectedStation=null;updateLineUI();updateCards();dirty=true;}
    function closeMobile(){ $('sidebar').classList.remove('open');$('mobile-menu').setAttribute('aria-expanded','false'); }
    function focusLine(i){
      resetTrain();clearAux();state.visible[i]=true;state.selectedLine=i;state.selectedStation=null;state.scope='custom';updateScope();updateVisibility();fitStations(D.stations.filter(s=>s.lines.includes(i)));closeMobile();
      $('map-subtitle').textContent=`${D.lines[i].name} · ${D.lines[i].stations} mapped stations`;
    }
    function selectStation(id){
      cancelIntro();releaseZoomAnchor();const s=lookup.get(id);if(!s)return;resetTrain();
      clearAux();
      state.selectedStation=id;state.selectedLine=null;s.lines.forEach(i=>state.visible[i]=true);state.scope='custom';updateScope();updateVisibility();
      goal.x=s.x;goal.z=s.z;goal.y=stationHeight(s);goal.scale=Math.min(goal.scale,width<600?15:17);
      // Place a selected mobile station below its inspector, not behind the card.
      if(width<600){const offset=goal.scale*.25/Math.max(.25,Math.sin(goal.pitch));goal.x-=Math.sin(goal.yaw)*offset;goal.z-=Math.cos(goal.yaw)*offset;}
      dirty=true;closeMobile();$('results').hidden=true;$('search').blur();
      $('map-subtitle').textContent=`${s.ko} · ${s.en}`;
    }
    function updateCards(){
      updateTrainCard();
      const sc=$('station-card'),lc=$('line-card'),s=focusedStation();sc.hidden=!s;lc.hidden=state.selectedLine===null;
      if(s){
        sc.innerHTML=`<div class="card-top"><span class="eyebrow">STATION / 역 정보</span><button class="card-close" data-clear aria-label="Close station details">${icon('close')}</button></div><h2>${escapeHTML(s.ko)}</h2><div class="station-english">${escapeHTML(s.en)}</div><div class="station-coordinates">${s.lat.toFixed(5)}° N &nbsp; ${s.lon.toFixed(5)}° E</div><div class="station-lines">${s.lines.map(i=>`<button class="station-line" data-focus="${i}">${badge(i)}<span>${escapeHTML(D.lines[i].name)}</span>${icon('arrow')}</button>`).join('')}</div><p class="card-note">${s.lines.length>1?'Lines share this mapped station record. Vertical connectors are illustrative.':'Geographic station center from the bundled network snapshot.'}${s.transliterated?' English name is transliterated.':''}</p><button class="solid-button" data-center>${icon('pin')} Recenter station</button>`;
      }
      if(state.selectedLine!==null){const i=state.selectedLine,l=D.lines[i];lc.innerHTML=`<div class="card-top"><span class="eyebrow">LINE EXPLORER</span><button class="card-close" data-clear aria-label="Close line details">${icon('close')}</button></div><h2 style="display:flex;align-items:center;gap:10px">${badge(i)}${escapeHTML(l.name)}</h2><div class="line-korean">${escapeHTML(l.ko)}</div><div class="line-stats"><div><strong>${l.stations}</strong><span>mapped stations</span></div><div><strong>${l.segments}</strong><span>source links</span></div></div><div class="card-actions"><button class="solid-button" data-isolate="${i}">Isolate line ${icon('layers')}</button><button data-all>Show all lines</button></div><p class="card-note">Click a station on the map to inspect its connections. Source links may include overlapping service patterns.</p>`;}
    }
    for(const el of [$('station-card'),$('line-card')])el.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-clear'))clearSelection();
      if(b.dataset.focus!==undefined)focusLine(+b.dataset.focus);
      if(b.hasAttribute('data-center')&&focusedStation())selectStation(state.selectedStation);
      if(b.dataset.isolate!==undefined){const i=+b.dataset.isolate;state.visible=state.visible.map((_,j)=>i===j);updateVisibility();fitStations(visibleStations());toast(`${D.lines[i].name} isolated`);}
      if(b.hasAttribute('data-all')){showAll();fitAll();}
    });
    function positionResults(){const sr=$('search').closest('.search-wrap').getBoundingClientRect(),side=$('sidebar').getBoundingClientRect();$('results').style.top=`${sr.bottom-side.top+6}px`;$('results').style.maxHeight=`${Math.max(100,side.height-(sr.bottom-side.top)-20)}px`;}
    const searchAliases={'hongdae':'홍대입구','seoulstation':'서울','gangnamstation':'강남','incheonairport':'인천공항','gimpoairport':'김포공항','khu':'회기','cityhall':'시청','dongdaemundesignplaza':'동대문역사문화공원'};
    function search(){
      const raw=$('search').value.trim(),q=normalize(raw),alias=searchAliases[q];searchIndex=-1;
      if(!q){$('results').hidden=true;return;}
      searchMatches=D.stations.map(s=>{const ko=normalize(s.ko),en=normalize(s.en);let score=0;
        if(ko===q||en===q)score=100;else if(ko.startsWith(q)||en.startsWith(q))score=75;else if(ko.includes(q)||en.includes(q))score=40;
        if(alias&&ko.includes(normalize(alias)))score=Math.max(score,80);return{s,score};}).filter(r=>r.score).sort((a,b)=>b.score-a.score||b.s.lines.length-a.s.lines.length).slice(0,16).map(r=>r.s);
      $('results').innerHTML=searchMatches.length?`<div class="result-count">${searchMatches.length===16?'FIRST 16':searchMatches.length} MATCHING STATIONS</div>`+searchMatches.map((s,j)=>`<button class="search-item" data-station="${s.id}" data-result="${j}">${icon('pin')}<span><b>${escapeHTML(s.ko)}</b><small>${escapeHTML(s.en)}</small></span><em>${s.lines.slice(0,3).map(badge).join('')}</em></button>`).join(''):'<div class="no-results">No matching stations.<br>Try a Korean name or English transliteration.</div>';
      $('results').hidden=false;positionResults();
    }
    $('search').addEventListener('input',search);$('search').addEventListener('focus',()=>{if($('search').value)search();});
    $('search').addEventListener('keydown',e=>{
      if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(!searchMatches.length)return;searchIndex=(searchIndex+(e.key==='ArrowDown'?1:-1)+searchMatches.length)%searchMatches.length;document.querySelectorAll('[data-result]').forEach((b,i)=>b.classList.toggle('focused',i===searchIndex));$('results').querySelector(`[data-result="${searchIndex}"]`)?.scrollIntoView({block:'nearest'});}
      if(e.key==='Enter'&&searchMatches.length){e.preventDefault();selectStation(searchMatches[Math.max(0,searchIndex)].id);}
      if(e.key==='Escape'){$('results').hidden=true;$('search').blur();}
    });
    $('results').addEventListener('click',e=>{const b=e.target.closest('[data-station]');if(b)selectStation(+b.dataset.station);});
    document.addEventListener('pointerdown',e=>{if(!e.target.closest('.search-wrap')&&!e.target.closest('#results'))$('results').hidden=true;});
    // Map-style navigation: left/one-finger drag pans; right/Shift drag rotates. Two fingers pan + pinch.
    const pointers=new Map();let gesture=null,downPoint=null;
    function pointerDistance(){const p=[...pointers.values()];return p.length>1?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;}
    function pointerCenter(){const p=[...pointers.values()];return{x:p.reduce((v,k)=>v+k.x,0)/p.length,y:p.reduce((v,k)=>v+k.y,0)/p.length};}
    function pan(dx,dy,instant=true){
      releaseZoomAnchor();stopAutomaticCamera();const units=goal.scale/height,cy=Math.cos(goal.yaw),sy=Math.sin(goal.yaw),sp=Math.max(.0001,Math.sin(goal.pitch));
      goal.x-=dx*units*cy;goal.z+=dx*units*sy;goal.x-=dy*units*sy/sp;goal.z-=dy*units*cy/sp;goal.x=clamp(goal.x,-350,350);goal.z=clamp(goal.z,-550,550);
      if(instant){cam.x=goal.x;cam.z=goal.z;}
      state.scope='custom';updateScope();dirty=true;
    }
    const panDirections={up:[0,1],down:[0,-1],left:[1,0],right:[-1,0]};
    function nudgePan(direction){
      const [dx,dy]=panDirections[direction],step=clamp(height*.12,48,96);
      pan(dx*step,dy*step,false);
    }
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>{
      goal.x=cam.x;goal.y=cam.y;goal.z=cam.z;goal.scale=cam.scale;goal.yaw=cam.yaw;goal.pitch=cam.pitch;releaseZoomAnchor();stopAutomaticCamera();
      canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});downPoint={x:e.clientX,y:e.clientY};dragged=pointers.size>1;moving=true;hover=null;$('hover-tip').hidden=true;
      gesture={center:pointerCenter(),distance:pointerDistance(),pan:!(e.button===2||e.shiftKey)};
      if(pointers.size>1){
        stopAutomaticCamera();const r=canvas.getBoundingClientRect();
        gesture.anchor=pointUnderCursor(gesture.center.x-r.left,gesture.center.y-r.top);
        gesture.startScale=cam.scale;gesture.startDistance=Math.max(.01,gesture.distance);
      }
      canvas.style.cursor='grabbing';
    });
    canvas.addEventListener('pointermove',e=>{
      if(pointers.has(e.pointerId)){
        pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const center=pointerCenter(),dist=pointerDistance(),dx=center.x-gesture.center.x,dy=center.y-gesture.center.y;
        if(downPoint&&Math.hypot(e.clientX-downPoint.x,e.clientY-downPoint.y)>4)dragged=true;
        if(pointers.size>1){
          dragged=true;
          if(dist>0&&gesture.anchor){
            const r=canvas.getBoundingClientRect();
            zoomAnchor={world:gesture.anchor,screenX:center.x-r.left,screenY:center.y-r.top};
            goal.scale=clamp(gesture.startScale*gesture.startDistance/dist,MIN_SCALE,MAX_SCALE);
            pinZoomAnchor(goal);pinZoomAnchor(cam);state.scope='custom';updateScope();dirty=true;
          }
        }
        else if(gesture.pan)pan(dx,dy);
        else {goal.yaw-=dx*.004;goal.pitch=clamp(goal.pitch+dy*.003,.20,Math.PI/2);dirty=true;}
        gesture.center=center;gesture.distance=dist;
      }else{
        const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
        const train=hitTrain(x,y);
        if(train){hover={train};canvas.style.cursor='pointer';const tip=$('hover-tip');tip.hidden=false;tip.innerHTML=`Simulated 3D train · ${escapeHTML(D.lines[train.line].name)}<small>Invented position · click to follow</small>`;tip.style.left=`${clamp(x+14,8,width-tip.offsetWidth-8)}px`;tip.style.top=`${clamp(y-45,8,height-tip.offsetHeight-8)}px`;return;}
        const kpop=kpopHits.find(h=>Math.hypot(h.x-x,h.y-y)<h.r);
        if(kpop){hover={kpop};canvas.style.cursor='pointer';const tip=$('hover-tip');tip.hidden=false;tip.innerHTML=kpop.site?`${escapeHTML(kpop.site.name)}<small>K-pop place · select to inspect</small>`:'K-pop places<small>Click to explore Seoul landmarks</small>';tip.style.left=`${clamp(x+14,8,width-tip.offsetWidth-8)}px`;tip.style.top=`${clamp(y-45,8,height-tip.offsetHeight-8)}px`;return;}
        const national=nationalHits.find(h=>Math.hypot(h.x-x,h.y-y)<7);
        if(national){hover={national};canvas.style.cursor='pointer';const tip=$('hover-tip');tip.hidden=false;tip.innerHTML=`${escapeHTML(national.s.ko||national.s.en||'Rail stop')}<small>${escapeHTML(N.lines[national.li].name)} · static map</small>`;tip.style.left=`${clamp(x+14,8,width-tip.offsetWidth-8)}px`;tip.style.top=`${clamp(y-45,8,height-tip.offsetHeight-8)}px`;return;}
        let nearest=null,best=90;
        for(const p of projected){if(p.alpha<.5)continue;const d=(p.x-x)**2+(p.y-y)**2;if(d<best){best=d;nearest=p;}}
        hover=nearest;canvas.style.cursor=nearest?'pointer':'grab';const tip=$('hover-tip');tip.hidden=!nearest;
        if(nearest){tip.innerHTML=`${escapeHTML(nearest.s.ko)}<small>${escapeHTML(nearest.s.en)}</small>`;tip.style.left=`${clamp(x+14,8,width-tip.offsetWidth-8)}px`;tip.style.top=`${clamp(y-45,8,height-tip.offsetHeight-8)}px`;}
      }
    });
    function endPointer(e){
      const wasTwo=pointers.size>1;pointers.delete(e.pointerId);
      if(!pointers.size){moving=false;canvas.style.cursor='grab';
        if(!dragged&&!wasTwo&&e.type==='pointerup'&&e.button===0){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const train=hitTrain(x,y);if(train){selectTrain(train.id);return;}const kpop=kpopHits.find(h=>Math.hypot(h.x-x,h.y-y)<h.r);if(kpop){if(kpop.site)selectPlace(kpop.site.id);else focusKpop();return;}const national=nationalHits.find(h=>Math.hypot(h.x-x,h.y-y)<7);if(national){focusNationalLine(national.li);return;}let nearest=null,best=115;for(const p of projected){if(p.alpha<.5)continue;const d=(p.x-x)**2+(p.y-y)**2;if(d<best){nearest=p;best=d;}}if(nearest)selectStation(nearest.s.id);}
      }else{
        goal.x=cam.x;goal.y=cam.y;goal.z=cam.z;goal.scale=cam.scale;goal.yaw=cam.yaw;goal.pitch=cam.pitch;releaseZoomAnchor();stopAutomaticCamera();
        gesture.center=pointerCenter();gesture.distance=pointerDistance();gesture.anchor=null;dragged=true;
      }
    }
    canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('pointerleave',()=>{if(!moving){$('hover-tip').hidden=true;hover=null;}});
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();
      // WheelEvent.deltaMode: 0=pixels, 1=lines, 2=pages.
      const mode=e.deltaMode,amount=e.deltaY*(mode===1?16:mode===2?height:1);
      if(e.ctrlKey){
        if(Number.isFinite(amount)&&amount!==0)pan(0,-clamp(amount,-240,240)*.8,false);
        return;
      }
      if(e.shiftKey){
        // Browsers may translate Shift+wheel into deltaX themselves.
        const horizontal=(e.deltaX||e.deltaY)*(mode===1?16:mode===2?width:1);
        if(Number.isFinite(horizontal)&&horizontal!==0)pan(-clamp(horizontal,-240,240)*.8,0,false);
        return;
      }
      if(!Number.isFinite(amount)||amount===0)return;
      const r=canvas.getBoundingClientRect();
      zoomAt(Math.exp(clamp(amount*.0015,-.6,.6)),e.clientX-r.left,e.clientY-r.top);
    },{passive:false});
    // Toolbar and keyboard zoom deliberately use the center of the map viewport.
    function zoom(factor){zoomAt(factor);}
    function toggleOrbit(){cancelIntro();releaseZoomAnchor();cancelFollow();state.orbit=!state.orbit;$('orbit').setAttribute('aria-pressed',String(state.orbit));$('orbit').classList.toggle('active',state.orbit);dirty=true;}
    function rotateBy(amount){releaseZoomAnchor();stopAutomaticCamera();goal.yaw=cam.yaw+amount;dirty=true;}
    function home(){cancelIntro();state.orbit=false;$('orbit').setAttribute('aria-pressed','false');$('orbit').classList.remove('active');showAll();fitAll(false,true);$('search').value='';$('results').hidden=true;closeMobile();}
    $('brand-home').onclick=home;$('nav-explore').onclick=home;$('scope-country').onclick=country;$('scope-full').onclick=()=>{showAll();fitAll();};$('scope-core').onclick=core;$('fit').onclick=()=>fitAll();
    $('zoom-in').onclick=()=>zoom(.8);$('zoom-out').onclick=()=>zoom(1.25);$('north').onclick=()=>{releaseZoomAnchor();stopAutomaticCamera();goal.yaw=0;dirty=true;};$('rotate-left').onclick=()=>rotateBy(-Math.PI/8);$('rotate-right').onclick=()=>rotateBy(Math.PI/8);$('orbit').onclick=toggleOrbit;
    for(const direction of Object.keys(panDirections)){
      const button=$(`pan-${direction}`);let holdTimer,repeatTimer,held=false;
      const stop=()=>{clearTimeout(holdTimer);clearInterval(repeatTimer);};
      button.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;
        held=false;button.setPointerCapture(event.pointerId);
        holdTimer=setTimeout(()=>{
          held=true;nudgePan(direction);
          repeatTimer=setInterval(()=>nudgePan(direction),110);
        },320);
      });
      button.addEventListener('pointerup',stop);
      button.addEventListener('pointercancel',()=>{stop();held=false;});
      button.addEventListener('lostpointercapture',stop);
      button.addEventListener('click',()=>{if(!held)nudgePan(direction);held=false;});
    }
    $('show-all').onclick=showAll;$('show-none').onclick=()=>{state.visible.fill(false);updateVisibility();};$('restore').onclick=()=>{showAll();fitAll();};
    $('labels-toggle').onchange=e=>{state.labels=e.target.checked;dirty=true;};
    $('motion-toggle').onchange=e=>setMotion(e.target.checked);
    $('train-inspect').onclick=inspectTrain;
    $('train-close').onclick=clearSelection;
    $('train-follow').onclick=()=>{releaseZoomAnchor();state.followTrain=!state.followTrain;updateTrainCard();dirty=true;};
    $('train-pause').onclick=()=>setMotion(!state.motion);
    $('train-back').onclick=()=>{showAll();fitAll();};
    $('train-size').oninput=e=>{state.trainSize=Number(e.target.value)/100;$('train-size-output').textContent=e.target.value+'%';dirty=true;};
    const preview=$('train-preview');let previewDrag=null;
    preview.addEventListener('pointerdown',e=>{preview.setPointerCapture(e.pointerId);previewDrag={x:e.clientX,y:e.clientY};});
    preview.addEventListener('pointermove',e=>{if(!previewDrag)return;previewYaw-=(e.clientX-previewDrag.x)*.012;previewPitch=clamp(previewPitch+(e.clientY-previewDrag.y)*.008,.10,1.4);previewDrag={x:e.clientX,y:e.clientY};updateTrainCard();});
    preview.addEventListener('pointerup',()=>previewDrag=null);preview.addEventListener('pointercancel',()=>previewDrag=null);
    preview.addEventListener('dblclick',()=>{previewYaw=-.67;previewPitch=.40;updateTrainCard();});
    preview.addEventListener('keydown',e=>{if(e.key.startsWith('Arrow')){e.preventDefault();previewYaw+=e.key==='ArrowLeft'?.14:e.key==='ArrowRight'?-.14:0;previewPitch=clamp(previewPitch+(e.key==='ArrowUp'?.10:e.key==='ArrowDown'?-.10:0),.10,1.4);updateTrainCard();}});
    setMotion(state.motion);
    $('mobile-menu').onclick=()=>{const open=$('sidebar').classList.toggle('open');$('mobile-menu').setAttribute('aria-expanded',String(open));};
    $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('Use your browser’s fullscreen control.');}catch{toast('Fullscreen is not available in this browser context.');}};
    const dialog=$('about-dialog');for(const id of ['nav-about','small-about','map-about','help'])$(id).onclick=()=>dialog.showModal();$('close-about').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
    $('export-data').onclick=()=>{download(new Blob([JSON.stringify(D,null,2)],{type:'application/json'}),'seoul-network-2026-08-24.json');toast('Network data exported with source metadata');};
    $('export-national-data').onclick=()=>{download(new Blob([JSON.stringify(N,null,2)],{type:'application/json'}),'korea-passenger-rail.json');toast('National rail geometry exported with source metadata');};
    $('export').onclick=()=>{
      try{
        render();const image=document.createElement('canvas');image.width=canvas.width;image.height=canvas.height+Math.round(76*dpr);const c=image.getContext('2d');c.fillStyle=mapTheme.background;c.fillRect(0,0,image.width,image.height);c.drawImage(canvas,0,0);c.drawImage(overlay,0,0);c.scale(dpr,dpr);c.fillStyle=mapTheme.accent;c.font='600 13px "Segoe UI",sans-serif';c.fillText('SEOUL / SUBSURFACE',24,height+29);c.fillStyle=mapTheme.exportText;c.font='10px "Segoe UI",sans-serif';c.fillText(`${state.visible.filter(Boolean).length} Seoul lines · static Korea rail · Seoul snapshot 24 Aug 2026 · SIMULATED TRAINS, NOT LIVE`,24,height+50);c.textAlign='right';c.font='9px "Segoe UI",sans-serif';c.fillText('© OpenStreetMap contributors / ODbL · Train positions and counts invented',width-22,height+29);image.toBlob(b=>{if(b){download(b,'seoul-subsurface.png');toast('Map image exported');}else toast('The browser could not export this image.');},'image/png');
      }catch(err){toast('Image export failed. Please try a browser screenshot.');console.error(err);}
    };
    document.addEventListener('keydown',e=>{
      if(dialog.open||$('live-dialog').open||['INPUT','TEXTAREA'].includes(e.target.tagName))return;
      if(e.key==='/'){e.preventDefault();if(width<600){$('sidebar').classList.add('open');$('mobile-menu').setAttribute('aria-expanded','true');}$('search').focus();}
      if(e.key.toLowerCase()==='t'){e.preventDefault();inspectTrain();}
      if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();setMotion(!state.motion);}
      if(e.key.toLowerCase()==='f'){e.preventDefault();fitAll();}
      if(e.key.toLowerCase()==='n'){releaseZoomAnchor();stopAutomaticCamera();goal.yaw=0;dirty=true;}
      if(e.key==='+'||e.key==='=')zoom(.8);if(e.key==='-')zoom(1.25);
      if(e.key==='Escape'){clearSelection();$('results').hidden=true;closeMobile();}
      const panDirection=e.key.startsWith('Arrow')?e.key.slice(5).toLowerCase():null;
      if(panDirection&&Object.hasOwn(panDirections,panDirection)&&
         (e.target===canvas||e.target===document.body||e.target.closest?.('.view-tools'))){
        e.preventDefault();nudgePan(panDirection);
      }
    });
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fatal(new Error('The graphics context was lost. Reload to restore it.'));});
    window.addEventListener('seoul:themechange',()=>{
      // Swap surface colors only: leave camera, selections, interpolation, and feed intact.
      mapTheme=window.SeoulTheme.palette;
      updateTrainCard();render();dirty=true;
    });
    viewport.addEventListener('pointerdown',cancelIntro,true);
    viewport.addEventListener('wheel',cancelIntro,{capture:true,passive:true});
    document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();});
    createLineUI();createAuxUI();updateSimulationUI();new ResizeObserver(resize).observe(viewport);resize();startIntro();render();lastFrame=performance.now();requestAnimationFrame(frame);
    $('loading').classList.add('dismissed');setTimeout(()=>$('loading').hidden=true,550);
    const simulationDialog=$('live-dialog');
    for(const id of ['live-badge','live-settings','live-notice-connect'])$(id).onclick=()=>simulationDialog.showModal();
    $('close-live').onclick=()=>simulationDialog.close();
    $('live-toggle').onclick=()=>setMotion(!state.motion);
    $('live-refresh').onclick=()=>{trainClock=0;updateTrainCard();dirty=true;toast('Simulation restarted');};
    setInterval(updateSimulationUI,1000);
    $('retry-render').onclick=()=>location.reload();
    // Exposes a small read/debug surface for reproducible automated smoke tests.
    window.__SEOUL_APP__={theme:window.SeoulTheme,simulation,live,pan,renderer:gl?'webgl':'software-3d',data:D,korea:K,national:N,kpop:P,state,cam,goal,getIntro:()=>intro,selectStation,focusLine,focusCity,focusNationalLine,focusKpop,selectPlace,fitAll,country,render,project,getProjected:()=>projected,getKpopHits:()=>kpopHits,getNationalHits:()=>nationalHits,showAll,core,clearSelection,selectTrain,inspectTrain,setMotion,fleet,getTrainInstances:()=>trainInstances,getTrainHits:()=>trainHits,getTrainClock:()=>trainClock,setTrainClock:t=>{trainClock=Math.max(0,Number(t)||0);dirty=true;},trainModels:T.models,zoomAt,pointUnderCursor,releaseZoomAnchor,getZoomAnchor:()=>zoomAnchor,zoomLimits:{min:MIN_SCALE,max:MAX_SCALE}};
  }
})();
