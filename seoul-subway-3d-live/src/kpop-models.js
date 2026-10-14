/* Original, exterior-inspired Seoul K-pop place models. Dimensions are approximate km.
 * The close-up facade detail is procedural; it is not a surveyed or textured replica.
 * At regional scales, real buildings are too small to resolve, so use site dots.
 * There are no copied facades, signs, logos, photographs, or external textures.
 */
(() => {
  'use strict';

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function tint(hex, amount) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const bits = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
    return '#' + bits.map(channel => clamp(Math.round(amount >= 0
      ? channel + (255-channel)*amount : channel*(1+amount)),0,255)
      .toString(16).padStart(2,'0')).join('');
  }
  const siteLooks = Object.freeze({
    hybe: {angle: -.12, width: .105, height: .101},
    sm: {angle: .24, width: .072, height: .143},
    jyp: {angle: -.18, width: .071, height: .065},
    yg: {angle: -.29, width: .103, height: .068},
    k_star_road: {angle: -.24, width: .071, height: .014},
    coex_kpop_square: {angle: .18, width: .112, height: .059},
    hongdae_kpop_square: {angle: -.23, width: .068, height: .104},
    hikr_ground: {angle: .13, width: .079, height: .103},
    kbs_hall: {angle: -.20, width: .116, height: .034},
    cj_enm: {angle: -.11, width: .116, height: .098},
    mbc_media: {angle: .18, width: .116, height: .115}
  });

  function draw(ctx, site, project, options = {}) {
    const look = siteLooks[site.id];
    if (!look) return null;
    const scale = Math.max(.01, options.scale || 10);
    const viewportHeight = Math.max(1, options.viewportHeight || 700);
    const pixelsPerKm = viewportHeight / scale;
    const selected = !!options.selected;
    const dark = options.dark === undefined
      ? options.theme?.background?.toLowerCase() === '#081726'
      : !!options.dark;
    const groundY = .115;
    const marker = project(site.x, groundY, site.z);
    const screenWidth = look.width * pixelsPerKm;
    // Citywide views show precise, restrained point symbols. A small real-sized
    // building at this scale cannot support legible facade or roof detail.
    if (screenWidth < 24) {
      const r = selected ? 6.5 : 4.7;
      ctx.save();
      ctx.beginPath(); ctx.arc(marker.x, marker.y, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = dark ? 'rgba(9,24,38,.82)' : 'rgba(255,255,255,.90)'; ctx.fill();
      ctx.beginPath(); ctx.arc(marker.x, marker.y, r, 0, Math.PI * 2);
      ctx.fillStyle = selected ? '#e28d4c' : '#7e6e76'; ctx.fill();
      ctx.lineWidth = selected ? 1.4 : .7;
      ctx.strokeStyle = dark ? '#e3e7e6' : '#465767'; ctx.stroke();
      ctx.restore();
      return {x: marker.x, y: marker.y, topY: marker.y, r: Math.max(13, r + 7), drawn: false};
    }

    // A venue's visitor point can differ from the adjacent building represented
    // by its 3D model (for example the public COEX square and Artium facade).
    const modelX = site.modelX ?? site.x, modelZ = site.modelZ ?? site.z;
    const ground = project(modelX, groundY, modelZ);
    // Public entrances and signature facades in the sketches are on local -z.
    // Face those southward, where the map's default close camera looks from.
    const angle = look.angle + Math.PI;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const yaw = options.yaw || 0, pitch = options.pitch || .67;
    const eyeX = Math.sin(yaw) * Math.cos(pitch), eyeZ = Math.cos(yaw) * Math.cos(pitch);
    const eyeU = eyeX * cos + eyeZ * sin, eyeV = -eyeX * sin + eyeZ * cos;
    const visible = {front: -eyeV > .01, back: eyeV > .01, right: eyeU > .01, left: -eyeU > .01};
    const faces = [];
    const at = (u, y, v) => [modelX + u * cos - v * sin, groundY + y, modelZ + u * sin + v * cos];
    function face(points, color, edge = null, lineWidth = .45, overlay = false) {
      const projected = points.map(p => project(...at(...p)));
      const depth = projected.reduce((sum, p) => sum + p.depth, 0) / projected.length;
      faces.push({points: projected, depth, color, edge, lineWidth, overlay});
    }
    const surfaceFace = (points, color) => face(points, color, null, .45, true);
    const closeDetail = screenWidth >= 62;
    const fineDetail = screenWidth >= 115;
    // A few deterministic reflected panels suggest real glazing without textures
    // or flickering randomly as the building moves across the screen.
    function glassColor(material, row, col) {
      const variant = (row * 7 + col * 13) % 13;
      if (variant === 1 || variant === 8) return material.glassLight || material.glassAlt || material.glass;
      if (variant === 4 || variant === 11) return material.glassDark || material.glass;
      return material.glass;
    }
    function box(cx, cz, w, d, base, h, material = {}) {
      const l = cx - w / 2, r = cx + w / 2, n = cz - d / 2, f = cz + d / 2;
      const y = base, t = base + h;
      const wall = material.wall || '#aebac1';
      face([[l,y,n],[r,y,n],[r,t,n],[l,t,n]], material.front || wall, material.edge || null);
      face([[r,y,n],[r,y,f],[r,t,f],[r,t,n]], material.right || wall, material.edge || null);
      face([[r,y,f],[l,y,f],[l,t,f],[r,t,f]], material.back || wall, material.edge || null);
      face([[l,y,f],[l,y,n],[l,t,n],[l,t,f]], material.left || wall, material.edge || null);
      face([[l,t,n],[r,t,n],[r,t,f],[l,t,f]], material.roof || '#c8d2d3', material.roofEdge || null);
      if (material.glass && closeDetail) {
        const rows = material.rows || 5;
        const columns = material.columns || 5;
        const padX = material.ribbon ? .035 : .095;
        const padY = material.ribbon ? .13 : .11;
        // Curtain wall patches lie just outside the schematic solid. Each is a
        // true wall quadrilateral, so it turns and foreshortens with the camera.
        const panelWall = (a, b, normal, colCount) => {
          const floorStart = material.plinth ? .15 : .07;
          for (let row = 0; row < rows; row++) {
            const y0 = y + h * (floorStart + (row + padY) * (1 - floorStart) / rows);
            const y1 = y + h * (floorStart + (row + 1 - padY) * (1 - floorStart) / rows);
            for (let col = 0; col < colCount; col++) {
              const t0 = (col + padX) / colCount, t1 = (col + 1 - padX) / colCount;
              const u0 = a[0] + (b[0]-a[0]) * t0 + normal[0];
              const v0 = a[1] + (b[1]-a[1]) * t0 + normal[1];
              const u1 = a[0] + (b[0]-a[0]) * t1 + normal[0];
              const v1 = a[1] + (b[1]-a[1]) * t1 + normal[1];
              const panel = glassColor(material, row, col);
              surfaceFace([[u0,y0,v0],[u1,y0,v1],[u1,y1,v1],[u0,y1,v0]], panel);
              if (fineDetail && !material.ribbon && (row + col * 3) % 3 === 0) {
                // A slim vertical sky reflection gives the pane some depth.
                const glint0 = .73, glint1 = .81;
                surfaceFace([[u0+(u1-u0)*glint0,y0,v0+(v1-v0)*glint0],
                  [u0+(u1-u0)*glint1,y0,v0+(v1-v0)*glint1],
                  [u0+(u1-u0)*glint1,y1,v0+(v1-v0)*glint1],
                  [u0+(u1-u0)*glint0,y1,v0+(v1-v0)*glint0]],
                  material.glassGlint || '#a3bfc4');
              }
            }
          }
        };
        const e = .00015;
        if (visible.front) panelWall([l,n-e],[r,n-e],[0,0],columns);
        if (visible.right) panelWall([r,n],[r,f],[e,0],Math.max(2, Math.round(columns*d/w)));
        if (visible.back) panelWall([r,f+e],[l,f+e],[0,0],columns);
        if (visible.left) panelWall([l,f],[l,n],[-e,0],Math.max(2, Math.round(columns*d/w)));
      }
    }
    function prism(outline, base, h, wallColors, roof) {
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i], b = outline[(i + 1) % outline.length];
        face([[a[0],base,a[1]],[b[0],base,b[1]],[b[0],base+h,b[1]],[a[0],base+h,a[1]]],
          Array.isArray(wallColors) ? wallColors[i % wallColors.length] : wallColors);
      }
      face(outline.map(p => [p[0],base+h,p[1]]), roof);
    }
    function wallBand(a, b, y, thickness, color, offset = 0) {
      if (!visible.front) return;
      surfaceFace([[a[0],y,a[1]+offset],[b[0],y,b[1]+offset],
        [b[0],y+thickness,b[1]+offset],[a[0],y+thickness,a[1]+offset]], color);
    }
    function facadeBand(l, r, v, y, h, color) {
      if (visible.front) surfaceFace([[l,y,v-.0005],[r,y,v-.0005],
        [r,y+h,v-.0005],[l,y+h,v-.0005]], color);
    }
    function mullions(l, r, v, bottom, top, count, color, width = .0008) {
      if (!visible.front || !closeDetail) return;
      for (let i = 1; i < count; i++) {
        const u = l + (r-l)*i/count;
        surfaceFace([[u-width/2,bottom,v-.0007],[u+width/2,bottom,v-.0007],
          [u+width/2,top,v-.0007],[u-width/2,top,v-.0007]], color);
      }
    }
    function roofEquipment(u, v, w, d, y, h, wall = '#a5ada8') {
      if (!fineDetail) return;
      box(u,v,w,d,y,h,{wall,front:wall,right:'#859496',roof:'#d5d8cf'});
    }
    function roofPatch(u, v, w, d, y, color) {
      if (!fineDetail) return;
      surfaceFace([[u-w/2,y,v-d/2],[u+w/2,y,v-d/2],
        [u+w/2,y,v+d/2],[u-w/2,y,v+d/2]], color);
    }
    function drawShadow(w, d, alpha = .15) {
      const corners = [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
      const points = corners.map(v => project(...at(v[0]+.008,-.002,v[1]+.008)));
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {const q = points[i]; if (i) ctx.lineTo(q.x,q.y); else ctx.moveTo(q.x,q.y);}
      ctx.closePath(); ctx.fillStyle = dark ? `rgba(0,5,12,${alpha + .07})` : `rgba(26,47,56,${alpha})`; ctx.fill();
    }

    ctx.save();
    drawShadow(look.width * 1.12, Math.min(.09, look.width * .72));
    switch (site.id) {
      case 'hybe': {
        // Yongsan Trade Center: 19-floor concrete panel and low-e glass slab.
        // Dark, recessed ground-floor glazing sits below the pale facade grid.
        box(0,0,.105,.060,0,.011,{wall:'#485b62',front:'#354e56',right:'#425761',roof:'#79888b'});
        box(0,.001,.098,.058,.011,.087,{wall:'#b5b9b4',front:'#c4c7bf',right:'#9da9aa',
          left:'#b1b8b4',roof:'#aeb7b4',glass:'#536d78',glassAlt:'#69818a',
          glassLight:'#8ba3a8',glassDark:'#415d69',columns:12,rows:17});
        if (visible.front) {
          // Vertical stone piers and a more legible double-height main entry.
          for (const u of [-.046,-.023,0,.023,.046]) {
            surfaceFace([[u-.001,.011,-.0295],[u+.001,.011,-.0295],
              [u+.001,.098,-.0295],[u-.001,.098,-.0295]],'#d6d7cf');
          }
          surfaceFace([[-.011,.001,-.0304],[.011,.001,-.0304],
            [.011,.010,-.0304],[-.011,.010,-.0304]],'#20404c');
        }
        box(0,-.032,.034,.008,.009,.002,{wall:'#cad0ca',roof:'#e0e1d7'});
        box(0,0,.101,.062,.098,.003,{wall:'#879395',roof:'#b5bcb8'});
        roofEquipment(.027,.012,.015,.009,.101,.004);
        roofPatch(-.026,.010,.022,.010,.1013,'#8b9898');
        roofPatch(-.026,.010,.016,.005,.1015,'#c1c8c1');
        roofPatch(.004,.012,.012,.007,.1014,'#929f9c');
        break;
      }
      case 'sm': {
        // SM occupies part of D Tower's 33-story mixed-use office mass,
        // not a freestanding SM-only tower.
        box(.001,.002,.073,.057,0,.016,{wall:'#aab5b4',front:'#b6c1bd',right:'#91a7a9',
          roof:'#c6ceca',glass:'#4e7279',glassAlt:'#6d9194',columns:8,rows:2,ribbon:true});
        box(-.008,.005,.060,.049,.016,.122,{wall:'#82989b',front:'#9cafae',right:'#718d93',
          roof:'#b5c0bb',glass:'#476e79',glassAlt:'#7299a1',glassLight:'#91b4b7',
          glassDark:'#365e6c',columns:10,rows:21,ribbon:true});
        box(.025,.004,.014,.049,.016,.114,{wall:'#c0c7c0',front:'#bec6c0',
          right:'#a6b7b5',roof:'#cad1ca'});
        if (visible.front) {
          mullions(-.038,.022,-.0199,.017,.136,10,'#bbc8c3',.0008);
          for (const y of [.041,.067,.093,.119]) facadeBand(-.038,.022,-.020,y,.001,'#afbfbd');
        }
        box(-.009,-.027,.042,.008,.001,.012,{wall:'#46636a',front:'#31545d',roof:'#829b9a'});
        box(-.009,-.033,.048,.007,.012,.002,{wall:'#c2ccca',roof:'#d9dfd8'});
        roofEquipment(-.017,.013,.017,.010,.138,.005);
        roofPatch(.008,.013,.019,.010,.1383,'#99aaa8');
        break;
      }
      case 'jyp': {
        // Current Gangdong office: a compact, flat-roofed blue-glass block.
        box(0,0,.067,.047,0,.061,{wall:'#43606d',front:'#34525e',right:'#2e4c5a',
          roof:'#929fa1',glass:'#315769',glassAlt:'#547686',glassDark:'#244453',
          glassLight:'#7897a2',columns:10,rows:8,ribbon:true});
        if (visible.front) {
          mullions(-.0335,.0335,-.024,.003,.060,10,'#b1c1c1',.00065);
          for (const y of [.010,.018,.026,.034,.042,.050,.058]) {
            facadeBand(-.0335,.0335,-.0235,y,.0007,'#91a9af');
          }
          surfaceFace([[-.010,.001,-.0245],[.010,.001,-.0245],
            [.010,.009,-.0245],[-.010,.009,-.0245]],'#263f49');
        }
        box(0,-.026,.025,.008,.008,.002,{wall:'#a8b7b9',roof:'#cbd3cf'});
        box(0,0,.069,.049,.061,.002,{wall:'#849597',roof:'#b8c5c1'});
        roofEquipment(.020,.009,.012,.008,.063,.003,'#8a999a');
        roofPatch(-.012,.010,.014,.010,.0634,'#8fa3a4');
        break;
      }
      case 'yg': {
        // UNStudio's silver shell encloses deep dark glazed openings. The ribs
        // below are original geometry inspired by its sweeping facade rhythm.
        box(0,0,.092,.059,0,.014,{wall:'#263d47',front:'#293d45',roof:'#3a4e55'});
        const shell=[[-.047,-.027],[-.037,-.034],[.033,-.034],[.049,-.020],[.049,.021],[.035,.032],[-.038,.032],[-.050,.021]];
        prism(shell,.014,.050,['#c3c7c5','#b4bebf','#9faeb3','#b9c2c3','#cdd0cc','#bcc5c6','#acb6b8','#bec4c2'],'#bcc6c4');
        // Large setback glazing and layered curved-looking metal bands.
        wallBand([-.019,-.034],[.023,-.034],.018,.037,'#243e4c',-.0007);
        wallBand([-.014,-.034],[.018,-.034],.020,.033,'#496979',-.0010);
        if (visible.front) {
          for (let i=0;i<5;i++) {
            const y=.019+i*.009, reach=.041-(i%2)*.003;
            surfaceFace([[-reach,y,-.0357],[-.021,y+.0018,-.0357],
              [-.021,y+.0037,-.0357],[-reach,y+.0025,-.0357]],'#e5e6df');
            surfaceFace([[.023,y+.0018,-.0357],[reach,y,-.0357],
              [reach,y+.0025,-.0357],[.023,y+.0037,-.0357]],'#e0e2db');
          }
          for (const u of [-.011,-.001,.009]) {
            surfaceFace([[u,.020,-.0361],[u+.0008,.020,-.0361],
              [u+.0008,.053,-.0361],[u,.053,-.0361]],'#9ab1b7');
          }
          // Broad offset strips follow a gently rising, shell-like profile
          // instead of reading as an ordinary rectangular curtain wall.
          surfaceFace([[-.043,.054,-.0358],[-.020,.059,-.0360],
            [.025,.057,-.0360],[.044,.050,-.0358],
            [.044,.053,-.0358],[.024,.061,-.0360],
            [-.021,.063,-.0360],[-.043,.057,-.0358]],'#e1e5df');
          surfaceFace([[-.043,.016,-.0358],[-.020,.014,-.0360],
            [.021,.014,-.0360],[.043,.019,-.0358],
            [.043,.021,-.0358],[.021,.018,-.0360],
            [-.020,.018,-.0360],[-.043,.019,-.0358]],'#d4dedc');
        }
        if (visible.right) {
          surfaceFace([[.0493,.023,-.010],[.0493,.023,.017],
            [.0493,.052,.017],[.0493,.052,-.010]],'#314d59');
          surfaceFace([[.0496,.024,-.008],[.0496,.024,.015],
            [.0496,.050,.015],[.0496,.050,-.008]],'#41616e');
        }
        box(0,0,.088,.053,.064,.003,{wall:'#ccd3ce',roof:'#d8ded8'});
        roofPatch(-.022,.011,.014,.008,.0673,'#a8b5b2');
        break;
      }
      case 'k_star_road': {
        // A short representative sidewalk section of the 1-km K-Star Road,
        // with original faceted bear-like markers (no group artwork or logos).
        box(0,0,.071,.016,0,.001,{wall:'#b6b8aa',roof:'#d8d6ca'});
        for (const [i,u] of [-.023,0,.023].entries()) {
          const coats=[['#91a9a9','#c4d3ce'],['#b9b0a1','#ded0b9'],['#8fa5b0','#c5d7d8']];
          box(u,0,.008,.006,.002,.009,{wall:coats[i][0],front:coats[i][0],roof:coats[i][1]});
          box(u,-.0004,.010,.007,.010,.006,{wall:coats[i][1],front:coats[i][1],roof:'#e5e0d3'});
          for (const ear of [-.0036,.0036]) {
            box(u+ear,-.0002,.0024,.0024,.015,.0022,
              {wall:coats[i][0],front:coats[i][0],roof:coats[i][1]});
          }
          for (const leg of [-.0025,.0025]) {
            box(u+leg,-.0005,.0024,.003,.001,.002,
              {wall:'#7d9295',front:'#8eaaa9',roof:'#c4d3ce'});
          }
        }
        break;
      }
      case 'coex_kpop_square': {
        // COEX plaza remains open in front of the Artium's dominant
        // wraparound LED corner. The muted image is original abstract light.
        box(0,.016,.112,.070,0,.001,{wall:'#c6c7be',roof:'#dbd9ce'});
        box(0,.010,.084,.051,.001,.057,{wall:'#9aa8a9',front:'#879ba0',right:'#718991',
          roof:'#bec8c5',glass:'#557480',glassAlt:'#73919a',columns:8,rows:7});
        const corner=[[-.043,-.036],[.027,-.036],[.034,-.034],[.041,-.029],
          [.046,-.022],[.048,-.013],[.048,.003]];
        for (let i=0;i<corner.length-1;i++) {
          const a=corner[i],b=corner[i+1];
          if (visible.front || visible.right) surfaceFace(
            [[a[0],.012,a[1]],[b[0],.012,b[1]],[b[0],.050,b[1]],[a[0],.050,a[1]]],
            i%2?'#426779':'#345765');
          if (visible.front || visible.right) {
            surfaceFace([[a[0],.012,a[1]-.0004],[b[0],.012,b[1]-.0004],
              [b[0],.014,b[1]-.0004],[a[0],.014,a[1]-.0004]],'#becbc9');
            surfaceFace([[a[0],.049,a[1]-.0004],[b[0],.049,b[1]-.0004],
              [b[0],.051,b[1]-.0004],[a[0],.051,a[1]-.0004]],'#c4d1cf');
          }
        }
        if (visible.front) {
          surfaceFace([[-.032,.024,-.0365],[.022,.030,-.0365],
            [.022,.036,-.0365],[-.032,.030,-.0365]],'#7698a3');
          surfaceFace([[-.020,.018,-.0366],[.032,.022,-.0366],
            [.032,.026,-.0366],[-.020,.022,-.0366]],'#587c8a');
        }
        box(-.005,-.027,.043,.004,.001,.009,{wall:'#6f8790',front:'#627e85',roof:'#9bacab'});
        break;
      }
      case 'hongdae_kpop_square': {
        // K-pop Square is a shop within the tall L7 Hongdae Hotel. The
        // hotel grid establishes context; the transparent frontage is the cue.
        box(0,.004,.065,.043,0,.100,{wall:'#9aa6a4',front:'#a7b2ad',right:'#879b9c',
          roof:'#c3cac4',glass:'#697f85',glassAlt:'#8ea3a4',glassDark:'#4d686f',
          columns:8,rows:14,plinth:true});
        box(0,-.019,.067,.007,0,.023,{wall:'#bfcac6',front:'#9caeb0',roof:'#e0e1d8'});
        if (visible.front) {
          for (const u of [-.025,-.008,.009,.026]) {
            surfaceFace([[u-.007,.003,-.0231],[u+.007,.003,-.0231],
              [u+.007,.019,-.0231],[u-.007,.019,-.0231]],u===-.008?'#547580':'#729096');
          }
        }
        facadeBand(-.0335,.0335,-.0233,.020,.004,'#e1e2d9');
        box(0,0,.066,.045,.100,.003,{wall:'#a9b5b1',roof:'#d0d5cc'});
        roofEquipment(.018,.009,.014,.010,.103,.004);
        roofPatch(-.016,.006,.017,.011,.1033,'#a0adaa');
        break;
      }
      case 'hikr_ground': {
        // HiKR's public floors are only the base of the KTO Seoul Center.
        box(0,0,.077,.048,0,.098,{wall:'#a7b7b8',front:'#b3c1be',right:'#91a7aa',
          roof:'#c8cfca',glass:'#688894',glassAlt:'#8eaaad',glassDark:'#557582',
          columns:9,rows:12});
        box(0,-.025,.070,.005,0,.032,{wall:'#3c626d',front:'#527885',roof:'#93a8a9'});
        for (const u of [-.026,-.010,.007,.023]) {
          if (visible.front) surfaceFace([[u-.006,.003,-.0278],[u+.006,.003,-.0278],
            [u+.006,.028,-.0278],[u-.006,.028,-.0278]],u<0?'#7499a1':'#587f8b');
        }
        facadeBand(-.035,.035,-.028,.030,.002,'#c2d0cc');
        box(0,0,.079,.050,.098,.003,{wall:'#a5b3b2',roof:'#d2d7d0'});
        roofEquipment(.023,.009,.014,.010,.101,.004);
        roofPatch(-.018,.010,.020,.009,.1014,'#9caeac');
        break;
      }
      case 'kbs_hall': {
        // Circular hall behind a blue-glass curved lobby and projecting
        // triangular space frame, as described by Seoul's culture portal.
        box(0,.008,.116,.074,0,.001,{wall:'#c8c7bc',roof:'#dddbd0'});
        const oval=Array.from({length:20},(_,i)=>{
          const t=Math.PI*2*i/20;
          return [Math.cos(t)*.050,Math.sin(t)*.031+.006];
        });
        prism(oval,.001,.026,oval.map((_,i)=>i>10&&i<19?
          (i%2?'#587d8b':'#7093a0'):(i%2?'#9b7e72':'#aa8c7d')),'#bfc6bf');
        // A thin second oval parapet establishes the circular roof outline.
        const roof=oval.map(p=>[p[0]*1.03,(p[1]-.006)*1.03+.006]);
        prism(roof,.027,.002,'#b9c2be','#d3d8d0');
        face(roof.map(p=>[p[0],.0294,p[1]]),'rgba(0,0,0,0)',
          '#9caaa8',1.15,true);
        for (let i=11;i<19;i++) {
          const a=oval[i],b=oval[(i+1)%20];
          surfaceFace([[a[0],.004,a[1]-.0005],[b[0],.004,b[1]-.0005],
            [b[0],.023,b[1]-.0005],[a[0],.023,a[1]-.0005]],i%2?'#54798b':'#7292a0');
          if (closeDetail) {
            surfaceFace([[a[0],.004,a[1]-.0008],[a[0]+.0007,.004,a[1]-.0008],
              [a[0]+.0007,.023,a[1]-.0008],[a[0],.023,a[1]-.0008]],'#b8c7c6');
          }
        }
        // Four open triangular steel trusses project from the curved lobby.
        if (visible.front) {
          for (const u of [-.032,-.011,.011,.032]) {
            face([[u-.009,.020,-.025],[u+.009,.020,-.025],
              [u,.026,-.045]],'rgba(0,0,0,0)','#a96154',2.1,true);
            face([[u-.009,.020,-.025],[u,.026,-.045],
              [u,.006,-.044]],'rgba(0,0,0,0)','#b06f5e',1.2,true);
          }
        }
        break;
      }
      case 'cj_enm': {
        // Contrasting glazed office wings flank the quieter broadcast core.
        box(-.035,0,.043,.060,0,.082,{wall:'#8d9fa2',front:'#90a5aa',right:'#758f98',
          roof:'#bdc8c4',glass:'#527989',glassAlt:'#7395a1',glassDark:'#416775',
          columns:6,rows:9});
        box(.035,0,.043,.060,0,.092,{wall:'#98a9a9',front:'#9caeb0',right:'#7c989e',
          roof:'#c3ceca',glass:'#507987',glassAlt:'#7599a1',glassDark:'#416b79',
          columns:6,rows:10});
        box(0,.004,.034,.055,0,.064,{wall:'#babeb8',front:'#c4c5bd',
          right:'#9eaaa9',roof:'#ced3ca'});
        if (visible.front) {
          for (const y of [.016,.030,.044,.058]) facadeBand(-.017,.017,-.0238,y,.0011,'#a0abaa');
        }
        box(0,-.024,.108,.013,0,.016,{wall:'#566e78',front:'#506a74',
          roof:'#9ba9a8',glass:'#496a77',columns:11,rows:2,ribbon:true});
        box(0,0,.110,.066,.092,.002,{wall:'#abb8b5',roof:'#c4cfca'});
        roofEquipment(-.034,.013,.015,.010,.084,.004);
        roofPatch(.030,.013,.016,.010,.0944,'#9fb1ae');
        break;
      }
      case 'mbc_media': {
        // A group of blue-glass media volumes, not a single tower; an
        // elevated glazed bridge keeps the open void legible from the front.
        box(-.037,0,.043,.059,0,.105,{wall:'#89a5ad',front:'#8aa6ad',right:'#6a8d9b',
          roof:'#bacbca',glass:'#4c7687',glassAlt:'#739aa5',glassDark:'#3b687a',
          columns:6,rows:11});
        box(.038,.008,.043,.059,0,.095,{wall:'#95aeb2',front:'#93adb4',
          right:'#7898a1',roof:'#c2cecb',glass:'#567d8e',glassAlt:'#7aa0aa',
          glassDark:'#436b7d',columns:6,rows:10});
        box(0,.016,.047,.025,.061,.020,{wall:'#5a7a89',front:'#648998',
          right:'#4d6e7c',roof:'#a7b8b9',glass:'#5b8797',glassAlt:'#81a4aa',
          columns:6,rows:2,ribbon:true});
        box(0,-.033,.077,.018,0,.019,{wall:'#7f9fa4',front:'#7d9ca0',
          roof:'#aabfbc',glass:'#547b87',columns:8,rows:2,ribbon:true});
        box(0,-.047,.058,.005,.002,.009,{wall:'#405b62',front:'#385662',roof:'#7f9b9d'});
        box(0,0,.118,.070,.105,.002,{wall:'#adbcb9',roof:'#d2d9d3'});
        roofEquipment(-.039,.011,.014,.010,.107,.004);
        roofPatch(.039,.013,.017,.010,.1074,'#a1b3b2');
        break;
      }
    }

    // Wall planes are large, so their average depth can exceed that of a
    // lower-floor pane even when the pane lies immediately in front. Draw
    // opaque masses first and facade treatments second to avoid losing floors.
    const ordered = faces.filter(f => !f.overlay).sort((a,b) => b.depth - a.depth)
      .concat(faces.filter(f => f.overlay).sort((a,b) => b.depth - a.depth));
    ctx.lineJoin = 'round';
    for (const item of ordered) {
      const points = item.points;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        if (i) ctx.lineTo(points[i].x, points[i].y);
        else ctx.moveTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      let fill = item.color;
      if (!item.overlay && typeof fill === 'string' && fill.startsWith('#')) {
        const ys = points.map(p => p.y), top = Math.min(...ys), bottom = Math.max(...ys);
        if (bottom - top > 4) {
          const gradient = ctx.createLinearGradient(0,top,0,bottom);
          gradient.addColorStop(0,tint(fill,.075));
          gradient.addColorStop(1,tint(fill,-.09));
          fill = gradient;
        }
      }
      ctx.fillStyle = fill; ctx.fill();
      if (item.edge) {ctx.strokeStyle = item.edge; ctx.lineWidth = item.lineWidth; ctx.stroke();}
    }
    if (selected) {
      const w = look.width * .58, d = Math.min(.052, look.width * .48);
      const outline = [[-w,-d],[w,-d],[w,d],[-w,d]].map(p => project(...at(p[0],-.001,p[1])));
      ctx.beginPath(); outline.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
      ctx.closePath();
      ctx.strokeStyle = dark ? 'rgba(202,220,231,.58)' : 'rgba(54,91,111,.42)';
      ctx.lineWidth = 1; ctx.stroke();
      if (modelX !== site.x || modelZ !== site.z) {
        const visitor = project(site.x, groundY + .001, site.z);
        ctx.beginPath(); ctx.moveTo(ground.x, ground.y); ctx.lineTo(visitor.x, visitor.y);
        ctx.setLineDash([4,4]);
        ctx.strokeStyle = dark ? 'rgba(244,189,143,.76)' : 'rgba(176,91,57,.7)';
        ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(visitor.x, visitor.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = dark ? '#f0ad78' : '#cd6d46'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = dark ? '#101e2b' : '#fff'; ctx.stroke();
      }
    }
    const top = project(modelX, groundY + look.height, modelZ);
    ctx.restore();
    return {x:ground.x,y:top.y,topY:top.y,r:clamp(screenWidth*.63+6,15,78),drawn:true};
  }

  window.SeoulKpopModels = Object.freeze({draw, siteLooks});
})();
