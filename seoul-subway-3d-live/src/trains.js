/* Original procedural subway rolling stock, MIT.
 * True triangle meshes, not point sprites or image billboards.
 * Four-car generic concept consists with illustrative dimensions, not fleet-specific replicas.
 * Placement comes from the live report adapter; this module does not simulate trains.
 */
(() => {
  'use strict';
  const CAR_LENGTH=2.76, SPACING=2.94, CAR_COUNT=4;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const mod=(n,d)=>((n%d)+d)%d;
  const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
  const materials={
    shell:[.81,.85,.86,0],roof:[.60,.68,.71,0],under:[.075,.105,.125,0],
    rubber:[.025,.044,.051,0],glass:[.045,.16,.21,0],glassReflection:[.30,.58,.65,0],
    door:[.64,.72,.75,0],trim:[.29,.37,.40,0],stripe:[1,1,1,1],
    lamp:[1,1,1,2],display:[.60,.94,.71,3],warm:[.94,.73,.37,3]
  };
  function model(cab,detail,power=false){
    const faces=[];
    function face(p,mat,normal){
      if(!normal){const a=p[0],b=p[1],c=p[2],u=b.map((v,i)=>v-a[i]),v=c.map((q,i)=>q-a[i]);normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];const l=Math.hypot(...normal)||1;normal=normal.map(x=>x/l);}
      faces.push({p,n:normal,m:materials[mat]});
    }
    function box(x,y,z,w,h,l,mat){
      const a=x-w/2,b=x+w/2,c=y-h/2,d=y+h/2,e=z-l/2,f=z+l/2;
      face([[a,c,e],[a,d,e],[b,d,e],[b,c,e]],mat,[0,0,-1]);
      face([[a,c,f],[b,c,f],[b,d,f],[a,d,f]],mat,[0,0,1]);
      face([[a,c,e],[a,c,f],[a,d,f],[a,d,e]],mat,[-1,0,0]);
      face([[b,c,e],[b,d,e],[b,d,f],[b,c,f]],mat,[1,0,0]);
      face([[a,d,e],[a,d,f],[b,d,f],[b,d,e]],mat,[0,1,0]);
      if(detail)face([[a,c,e],[b,c,e],[b,c,f],[a,c,f]],mat,[0,-1,0]);
    }
    function side(s,y,z,h,l,mat,x=.391){face([[s*x,y-h/2,z-l/2],[s*x,y-h/2,z+l/2],[s*x,y+h/2,z+l/2],[s*x,y+h/2,z-l/2]],mat,[s,0,0]);}
    const profile=[[-.30,.18],[.30,.18],[.39,.25],[.39,.73],[.31,.85],[-.31,.85],[-.39,.73],[-.39,.25]];
    const rings=(cab?[[-1.36,.94],[-1.24,1],[1.07,1],[1.37,.81]]:[[-1.36,.94],[-1.24,1],[1.24,1],[1.36,.94]])
      .map(([z,s])=>profile.map(([x,y])=>[x*s,y,z]));
    for(let i=1;i<rings.length;i++)for(let k=0;k<8;k++){
      const n=(k+1)%8;face([rings[i-1][k],rings[i-1][n],rings[i][n],rings[i][k]],k===4?'roof':'shell');
    }
    face([...rings[0]].reverse(),'shell',[0,0,-1]);face(rings.at(-1),'shell',[0,0,1]);
    box(0,.18,0,.58,.16,2.32,'under');
    box(0,.46,-1.40,.43,.47,.13,'rubber');
    if(!cab)box(0,.46,1.40,.43,.47,.13,'rubber');
    for(const s of [-1,1]){
      side(s,.385,0,.073,2.43,'stripe');
      side(s,.755,-.02,.025,2.42,'trim');
      // Glazed passenger windows, and three pairs of sliding doors per side.
      const windows=detail?[-1.04,-.47,.34,.92]:[-.94,-.12,.77];
      for(const z of windows){
        side(s,.604,z,.19,detail?.27:.45,'glass',.394);
        if(detail)side(s,.674,z,.023,.25,'glassReflection',.395);
      }
      for(const z of (detail?[-.72,.0,.69]:[-.47,.39])){
        side(s,.475,z,.475,.24,'door',.397);
        side(s,.385,z,.073,.24,'stripe',.398);
        side(s,.597,z,.16,.185,'glass',.399);
        if(detail){side(s,.475,z,.46,.012,'trim',.400);side(s,.251,z,.02,.23,'warm',.400);}
      }
      if(cab){side(s,.605,1.10,.20,.17,'glass',.386);}
    }
    // Roof equipment is geometry, so it remains visible in top-down mode.
    box(0,.903,-.57,.45,.12,.53,'roof');box(0,.903,.48,.45,.12,.53,'roof');
    if(detail){
      for(const z of [-.57,.48])for(let j=-2;j<=2;j++)box(0,.967,z+j*.073,.37,.006,.015,'trim');
      box(0,.97,-.02,.055,.13,.075,'trim');
      // Two bogies, with separate eight-sided wheels rather than painted circles.
      for(const z of [-.84,.84]){
        box(0,.12,z,.63,.14,.42,'under');
        for(const dz of [-.14,.14])for(const s of [-1,1]){
          const x=s*.335,rr=.105,p1=[],p2=[];
          for(let k=0;k<8;k++){const a=k*Math.PI/4;p1.push([x-s*.032,.108+Math.sin(a)*rr,z+dz+Math.cos(a)*rr]);p2.push([x+s*.032,.108+Math.sin(a)*rr,z+dz+Math.cos(a)*rr]);}
          face(p2,'rubber',[s,0,0]);
          for(let k=0;k<8;k++){const n=(k+1)%8;face([p1[k],p1[n],p2[n],p2[k]],'under');}
        }
      }
      for(const z of (cab?[-1.43]:[-1.43,1.43]))for(let k=-1;k<=1;k++)box(0,.47,z+k*.026,.445,.44,.012,'trim');
      if(power){
        box(0,.96,.04,.32,.08,.40,'under');
        // Small pantograph, offset from the two air-conditioning housings.
        for(const s of [-1,1]){
          face([[s*.12,1.0,-.18],[s*.12,1.26,.08],[s*.12,1.25,.12],[s*.12,1.0,-.13]],'trim',[s,0,0]);
          face([[s*.12,1.26,.08],[s*.12,1.41,-.14],[s*.12,1.41,-.10],[s*.12,1.26,.12]],'trim',[s,0,0]);
        }
        box(0,1.42,-.12,.57,.035,.055,'trim');
      }
    }else{
      for(const z of [-.84,.84])box(0,.11,z,.65,.17,.39,'under');
    }
    if(cab){
      // Dark front windscreen, split glazing, destination display and paired lights.
      face([[-.25,.49,1.375],[.25,.49,1.375],[.26,.735,1.375],[-.26,.735,1.375]],'glass',[0,0,1]);
      box(0,.614,1.381,.016,.235,.008,'trim');
      box(0,.792,1.378,.33,.047,.009,'display');
      box(0,.395,1.379,.53,.065,.013,'stripe');
      for(const s of [-1,1]){
        box(s*.205,.302,1.381,.102,.06,.014,'lamp');
        if(detail){box(s*.13,.52,1.386,.13,.013,.008,'trim');box(s*.14,.692,1.381,.17,.025,.008,'glassReflection');}
      }
      box(0,.208,1.388,.23,.07,.10,'under');
    }
    const vertices=[];
    for(const f of faces)for(let i=1;i<f.p.length-1;i++)for(const p of [f.p[0],f.p[i],f.p[i+1]])vertices.push(...p,...f.n,...f.m);
    return {faces,vertices:new Float32Array(vertices),triangles:vertices.length/30};
  }
  const models={};
  for(const d of ['low','high'])for(const k of ['cab','car','power'])models[`${k}-${d}`]=model(k==='cab',d==='high',k==='power');

  function sample(path,distance){
    let d=path.loop?mod(distance,path.total):clamp(distance,0,path.total),lo=1,hi=path.lengths.length-1;
    while(lo<hi){const m=(lo+hi)>>1;if(path.lengths[m]<d)lo=m+1;else hi=m;}
    const a=path.points[lo-1],b=path.points[lo],len=path.lengths[lo]-path.lengths[lo-1]||1,t=(d-path.lengths[lo-1])/len;
    return {x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,dx:(b[0]-a[0])/len,dz:(b[1]-a[1])/len};
  }
  function transformed(p,inst){const {dx,dz,scale}=inst;return [inst.x+(p[0]*dz+p[2]*dx)*scale,inst.y+p[1]*scale,inst.z+(-p[0]*dx+p[2]*dz)*scale];}
  function normal(n,inst){return [n[0]*inst.dz+n[2]*inst.dx,n[1],-n[0]*inst.dx+n[2]*inst.dz];}
  function colorOf(mat,tint,head,n){
    const m=mat[3];let col=m===1?tint:m===2?(head?[1,.96,.72]:[1,.14,.09]):mat.slice(0,3);
    const light=m>=2?1:.48+.52*Math.max(0,n[0]*-.46+n[1]*.81+n[2]*.36);
    return `rgb(${col.map(v=>Math.round(clamp(v*light,0,1)*255)).join(',')})`;
  }
  function drawSoftware(ctx,instances,project,eye,clip){
    const polys=[];
    for(const inst of instances){
      const mesh=models[inst.model+'-'+(inst.lod||'high')];
      for(const f of mesh.faces){
        const n=normal(f.n,inst);if(n[0]*eye[0]+n[1]*eye[1]+n[2]*eye[2]<-.005)continue;
        const pp=f.p.map(p=>project(...transformed(p,inst)));
        if(clip&&(pp.every(p=>p.x<0)||pp.every(p=>p.x>clip.w)||pp.every(p=>p.y<0)||pp.every(p=>p.y>clip.h)))continue;
        polys.push({pp,depth:pp.reduce((a,p)=>a+p.depth,0)/pp.length,color:colorOf(f.m,inst.tint,inst.head,n),alpha:inst.alpha??1});
      }
    }
    polys.sort((a,b)=>b.depth-a.depth);
    for(const f of polys){ctx.globalAlpha=f.alpha;ctx.beginPath();f.pp.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=f.color;ctx.fill();}
    ctx.globalAlpha=1;
  }
  function createGPURenderer(gl){
    function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
    const vs=shader(gl.VERTEX_SHADER,`attribute vec3 aPos;attribute vec3 aNormal;attribute vec4 aMaterial;attribute vec4 aPlace;attribute vec2 aDirection;attribute vec4 aTint;attribute float aHead;uniform mat4 uVP;varying vec3 vNormal;varying vec4 vMaterial;varying vec4 vTint;varying float vHead;
      void main(){vec3 x=vec3(aDirection.y,0.,-aDirection.x),z=vec3(aDirection.x,0.,aDirection.y);vec3 p=aPlace.xyz+aPlace.w*(x*aPos.x+vec3(0.,aPos.y,0.)+z*aPos.z);vNormal=x*aNormal.x+vec3(0.,aNormal.y,0.)+z*aNormal.z;vMaterial=aMaterial;vTint=aTint;vHead=aHead;gl_Position=uVP*vec4(p,1.);}`);
    const fs=shader(gl.FRAGMENT_SHADER,`precision mediump float;varying vec3 vNormal;varying vec4 vMaterial;varying vec4 vTint;varying float vHead;void main(){vec3 c=vMaterial.rgb;float m=vMaterial.a;if(m>.5&&m<1.5)c=vTint.rgb;if(m>1.5&&m<2.5)c=vHead>.5?vec3(1.,.96,.72):vec3(1.,.14,.09);float light=m>1.5?1.:.48+.52*max(dot(normalize(vNormal),vec3(-.46,.81,.36)),0.);gl_FragColor=vec4(c*light,vTint.a);}`);
    const pr=gl.createProgram();gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr));
    const names=['aPos','aNormal','aMaterial','aPlace','aDirection','aTint','aHead'],loc=names.map(n=>gl.getAttribLocation(pr,n)),vp=gl.getUniformLocation(pr,'uVP');
    const ext=gl.getExtension('ANGLE_instanced_arrays'),buffers={},dynamic=gl.createBuffer();
    for(const [key,m] of Object.entries(models)){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,m.vertices,gl.STATIC_DRAW);buffers[key]={b,count:m.vertices.length/10};}
    const attrCount=gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    return function draw(instances,matrix){
      if(!instances.length)return;
      gl.useProgram(pr);gl.uniformMatrix4fv(vp,false,matrix);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
      for(let i=0;i<attrCount;i++){gl.disableVertexAttribArray(i);if(ext)ext.vertexAttribDivisorANGLE(i,0);}
      const groups=new Map();for(const inst of instances){const key=inst.model+'-'+(inst.lod||'high');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(inst);}
      for(const [key,group] of groups){
        const mesh=buffers[key];gl.bindBuffer(gl.ARRAY_BUFFER,mesh.b);
        [3,3,4].forEach((size,i)=>{gl.enableVertexAttribArray(loc[i]);gl.vertexAttribPointer(loc[i],size,gl.FLOAT,false,40,[0,12,24][i]);});
        if(ext){
          const data=new Float32Array(group.length*11);group.forEach((t,i)=>data.set([t.x,t.y,t.z,t.scale,t.dx,t.dz,...t.tint,t.alpha??1,t.head?1:0],i*11));
          gl.bindBuffer(gl.ARRAY_BUFFER,dynamic);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
          [4,2,4,1].forEach((s,i)=>{const a=loc[i+3];gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,s,gl.FLOAT,false,44,[0,16,24,40][i]);ext.vertexAttribDivisorANGLE(a,1);});
          ext.drawArraysInstancedANGLE(gl.TRIANGLES,0,mesh.count,group.length);
        }else{
          for(const t of group){gl.vertexAttrib4f(loc[3],t.x,t.y,t.z,t.scale);gl.vertexAttrib2f(loc[4],t.dx,t.dz);gl.vertexAttrib4f(loc[5],...t.tint,t.alpha??1);gl.vertexAttrib1f(loc[6],t.head?1:0);gl.drawArrays(gl.TRIANGLES,0,mesh.count);}
        }
      }
      // Reset divisors and arrays so the atlas' existing rail / station passes remain independent.
      for(let i=0;i<attrCount;i++){if(ext)ext.vertexAttribDivisorANGLE(i,0);gl.disableVertexAttribArray(i);}
    };
  }
  function preview(canvas,tint,yaw=-.67,pitch=.40){
    const w=canvas.clientWidth||300,h=canvas.clientHeight||170,dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
    const cy=Math.cos(yaw),sy=Math.sin(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch),eye=[sy*cp,sp,cy*cp];
    const inst=[];for(let i=0;i<CAR_COUNT;i++)inst.push({x:0,y:0,z:((CAR_COUNT-1)/2-i)*SPACING,scale:1,dx:0,dz:i===CAR_COUNT-1?-1:1,model:i===0||i===CAR_COUNT-1?'cab':i===1?'power':'car',head:i===0,tint,lod:'high'});
    const raw=(x,y,z)=>({x:cy*x-sy*z,y:sy*sp*x-cp*y+cy*sp*z,depth:-(eye[0]*x+eye[1]*y+eye[2]*z)});
    const bounds=[];for(const i of inst)for(const p of [[-.4,0,-1.4],[.4,1.45,-1.4],[-.4,0,1.4],[.4,1.45,1.4]])bounds.push(raw(...transformed(p,i)));
    const minX=Math.min(...bounds.map(p=>p.x)),maxX=Math.max(...bounds.map(p=>p.x)),minY=Math.min(...bounds.map(p=>p.y)),maxY=Math.max(...bounds.map(p=>p.y));
    const scale=Math.min((w-24)/(maxX-minX||1),(h-32)/(maxY-minY||1));
    const project=(x,y,z)=>{const p=raw(x,y,z);return{x:w/2+(p.x-(minX+maxX)/2)*scale,y:h/2+6+(p.y-(minY+maxY)/2)*scale,depth:p.depth};};
    c.strokeStyle=window.SeoulTheme?.palette.previewGrid||'#0052a438';c.lineWidth=.7;
    for(let n=-7;n<=7;n++){for(const axis of [0,1]){const a=project(axis?n:-2,-.05,axis?-7:n),b=project(axis?n:2,-.05,axis?7:n);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}}
    drawSoftware(c,inst,project,eye,{w,h});
  }
  window.SeoulTrains={CAR_LENGTH,SPACING,CAR_COUNT,models,sample,transformed,drawSoftware,createGPURenderer,preview,rgb};
})();
