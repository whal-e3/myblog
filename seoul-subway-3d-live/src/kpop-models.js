/* Original, schematic Seoul K-pop place massing. All dimensions are approximate km.
 * Projected polygons stay attached to the map as it tilts and rotates. At regional
 * scales, real buildings are too small to resolve, so the renderer uses site dots.
 * There are no copied facades, signs, logos, photographs, or external textures.
 */
(() => {
  'use strict';

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const siteLooks = Object.freeze({
    hybe: {angle: -.12, width: .105, height: .101},
    sm: {angle: .24, width: .072, height: .143},
    jyp: {angle: -.18, width: .071, height: .065},
    yg: {angle: -.29, width: .103, height: .068},
    k_star_road: {angle: -.24, width: .071, height: .014},
    coex_kpop_square: {angle: .18, width: .112, height: .038},
    hongdae_kpop_square: {angle: -.23, width: .068, height: .047},
    hikr_ground: {angle: .13, width: .079, height: .074},
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
    const ground = project(site.x, groundY, site.z);
    const screenWidth = look.width * pixelsPerKm;
    // Citywide views show precise, restrained point symbols. A small real-sized
    // building at this scale cannot support legible facade or roof detail.
    if (screenWidth < 24) {
      const r = selected ? 6.5 : 4.7;
      ctx.save();
      ctx.beginPath(); ctx.arc(ground.x, ground.y, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = dark ? 'rgba(9,24,38,.82)' : 'rgba(255,255,255,.90)'; ctx.fill();
      ctx.beginPath(); ctx.arc(ground.x, ground.y, r, 0, Math.PI * 2);
      ctx.fillStyle = selected ? '#e28d4c' : '#7e6e76'; ctx.fill();
      ctx.lineWidth = selected ? 1.4 : .7;
      ctx.strokeStyle = dark ? '#e3e7e6' : '#465767'; ctx.stroke();
      ctx.restore();
      return {x: ground.x, y: ground.y, topY: ground.y, r: Math.max(13, r + 7), drawn: false};
    }

    // Public entrances and signature facades in the sketches are on local -z.
    // Face those southward, where the map's default close camera looks from.
    const angle = look.angle + Math.PI;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const yaw = options.yaw || 0, pitch = options.pitch || .67;
    const eyeX = Math.sin(yaw) * Math.cos(pitch), eyeZ = Math.cos(yaw) * Math.cos(pitch);
    const eyeU = eyeX * cos + eyeZ * sin, eyeV = -eyeX * sin + eyeZ * cos;
    const visible = {front: -eyeV > .01, back: eyeV > .01, right: eyeU > .01, left: -eyeU > .01};
    const faces = [];
    const at = (u, y, v) => [site.x + u * cos - v * sin, groundY + y, site.z + u * sin + v * cos];
    function face(points, color, edge = null, lineWidth = .45, overlay = false) {
      const projected = points.map(p => project(...at(...p)));
      const depth = projected.reduce((sum, p) => sum + p.depth, 0) / projected.length;
      faces.push({points: projected, depth, color, edge, lineWidth, overlay});
    }
    const surfaceFace = (points, color) => face(points, color, null, .45, true);
    function box(cx, cz, w, d, base, h, material = {}) {
      const l = cx - w / 2, r = cx + w / 2, n = cz - d / 2, f = cz + d / 2;
      const y = base, t = base + h;
      const wall = material.wall || '#aebac1';
      face([[l,y,n],[r,y,n],[r,t,n],[l,t,n]], material.front || wall, material.edge || null);
      face([[r,y,n],[r,y,f],[r,t,f],[r,t,n]], material.right || wall, material.edge || null);
      face([[r,y,f],[l,y,f],[l,t,f],[r,t,f]], material.back || wall, material.edge || null);
      face([[l,y,f],[l,y,n],[l,t,n],[l,t,f]], material.left || wall, material.edge || null);
      face([[l,t,n],[r,t,n],[r,t,f],[l,t,f]], material.roof || '#c8d2d3', material.roofEdge || null);
      if (material.glass && screenWidth >= 31) {
        const rows = material.rows || 5;
        const columns = material.columns || 5;
        const padX = material.ribbon ? .035 : .13;
        const padY = material.ribbon ? .20 : .15;
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
              surfaceFace([[u0,y0,v0],[u1,y0,v1],[u1,y1,v1],[u0,y1,v0]],
                (row + col) % 5 === 0 ? material.glassAlt || material.glass : material.glass);
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
        // Broad 19-floor concrete-and-glass slab over an open, recessed base.
        box(0,0,.105,.059,0,.013,{wall:'#52636a',front:'#3d4e55',roof:'#859193'});
        box(0,0,.092,.056,.013,.084,{wall:'#b3bbba',front:'#c2c7c3',right:'#9ca9ac',
          roof:'#a5adab',glass:'#4d6670',glassAlt:'#63808a',columns:10,rows:10,plinth:true});
        box(0,0,.103,.062,.097,.004,{wall:'#8d989a',roof:'#b8c0bd'});
        box(.030,-.020,.023,.011,.097,.007,{wall:'#a9b1ad',roof:'#c0c6c0'});
        break;
      }
      case 'sm': {
        // SM occupies D Tower Seoul Forest, represented as a tight glazed grid.
        box(-.012,0,.063,.054,0,.136,{wall:'#8da0a1',front:'#8ea3a6',right:'#6e898e',
          roof:'#b5c0bd',glass:'#466e78',glassAlt:'#69939a',columns:9,rows:12});
        box(.029,.011,.026,.038,0,.066,{wall:'#82999e',front:'#7d9295',roof:'#a6b8b7',
          glass:'#527f8c',columns:3,rows:6});
        box(-.012,-.026,.043,.005,0,.015,{wall:'#263f49',front:'#314f56',roof:'#566c70'});
        break;
      }
      case 'jyp': {
        // Simple dark reflective-glass mid-rise with narrow vertical mullions.
        box(0,0,.067,.047,0,.062,{wall:'#576d78',front:'#3b5866',right:'#3b5261',
          roof:'#8e9a9e',glass:'#274655',glassAlt:'#426274',columns:8,rows:8,ribbon:true});
        box(0,-.025,.071,.004,.002,.061,{wall:'#b6c1c0',front:'#a4b7bc',roof:'#c8d0cd'});
        break;
      }
      case 'yg': {
        // YG's broad silver shell, dark recessed base, and central glazed void.
        box(0,0,.092,.059,0,.014,{wall:'#263d47',front:'#293d45',roof:'#3a4e55'});
        const shell=[[-.047,-.027],[-.037,-.034],[.033,-.034],[.049,-.020],[.049,.021],[.035,.032],[-.038,.032],[-.050,.021]];
        prism(shell,.014,.050,['#c3c7c5','#b4bebf','#9faeb3','#b9c2c3','#cdd0cc','#bcc5c6','#acb6b8','#bec4c2'],'#bcc6c4');
        // Deep, dark central opening with slimmer inset glazing.
        wallBand([-.016,-.034],[.018,-.034],.018,.036,'#284350',-.0003);
        wallBand([-.011,-.034],[.013,-.034],.019,.034,'#577681',-.0006);
        for (const y of [.024,.037,.050,.061]) {
          wallBand([-.045,-.035],[-.017,-.035],y,.0018,'#e0e1d9',-.0008);
          wallBand([.019,-.035],[.045,-.030],y,.0018,'#e0e1d9',-.0008);
        }
        if (visible.right) {
          // The second dark recess on the broad shell, visible from the side.
          surfaceFace([[.0493,.023,-.010],[.0493,.023,.017],
            [.0493,.052,.017],[.0493,.052,-.010]],'#314d59');
          surfaceFace([[.0496,.024,-.008],[.0496,.024,.015],
            [.0496,.050,.015],[.0496,.050,-.008]],'#41616e');
        }
        box(0,0,.085,.052,.064,.004,{wall:'#ccd3ce',roof:'#d8ded8'});
        break;
      }
      case 'k_star_road': {
        // A street with several original faceted sculptural markers, not a tower.
        box(0,0,.068,.014,0,.001,{wall:'#b6b8aa',roof:'#d7d2c2'});
        for (const u of [-.023,0,.023]) {
          const body=[[u-.004,-.003],[u+.004,-.003],[u+.005,.003],[u-.005,.003]];
          prism(body,.002,.009,['#9caaa8','#a9b7ae','#8eaaa9','#bac4b6'],'#d2c8b4');
          prism([[u-.004,-.004],[u+.004,-.004],[u+.004,.004],[u-.004,.004]],.011,.003,
            ['#c7b89d','#afc3bd','#c6b6a0','#9eb5ae'],'#d6c8ae');
        }
        break;
      }
      case 'coex_kpop_square': {
        // Public forecourt and the curved corner media screen on a host facade.
        box(0,.013,.111,.069,0,.001,{wall:'#c4c6bd',roof:'#dedbd0'});
        box(0,-.015,.089,.033,.001,.031,{wall:'#8b9aa1',front:'#596c77',roof:'#bbc4c2'});
        const corner=[[-.045,-.032],[.029,-.032],[.037,-.030],[.043,-.025],[.046,-.017],[.046,.006]];
        for (let i=0;i<corner.length-1;i++) {
          const a=corner[i],b=corner[i+1];
          if (visible.front || visible.right) surfaceFace(
            [[a[0],.007,a[1]],[b[0],.007,b[1]],[b[0],.032,b[1]],[a[0],.032,a[1]]],
            i%2?'#4a6775':'#355362');
          wallBand(a,b,.007,.0015,'#c7d3d2');
          wallBand(a,b,.031,.0015,'#c7d3d2');
        }
        if (visible.front) {
          // Quiet abstract media light; no copied screen artwork or artist image.
          surfaceFace([[-.027,.016,-.0325],[.021,.020,-.0325],
            [.021,.023,-.0325],[-.027,.019,-.0325]],'#6c909b');
        }
        break;
      }
      case 'hongdae_kpop_square': {
        // Ground-floor retail facade within a larger block, with blank display bays.
        box(0,.004,.065,.042,0,.044,{wall:'#aeb8b7',front:'#bfc6c1',roof:'#b6beb9',
          glass:'#789096',columns:5,rows:4});
        box(0,-.019,.067,.004,0,.022,{wall:'#e2e2d8',front:'#d6ddd9',roof:'#f0efe7'});
        for (const u of [-.022,0,.022]) {
          if (visible.front) surfaceFace([[u-.009,.003,-.021],[u+.009,.003,-.021],[u+.009,.017,-.021],[u-.009,.017,-.021]],
            u===0?'#617d84':'#8b9c9a');
        }
        wallBand([-.034,-.022],[.034,-.022],.019,.004,'#efede4');
        break;
      }
      case 'hikr_ground': {
        // The KTO Seoul Center remains a larger office block; media treatment
        // is limited to the public lower floors occupied by HiKR Ground.
        box(0,0,.077,.047,0,.071,{wall:'#acb8b7',front:'#a7b8bb',roof:'#c8d0cb',
          glass:'#6d8b95',glassAlt:'#8aa3a7',columns:8,rows:8});
        box(0,-.025,.067,.003,0,.028,{wall:'#416a74',front:'#446c74',roof:'#7b9699'});
        for (const u of [-.024,-.008,.008,.024]) {
          if (visible.front) surfaceFace([[u-.006,.003,-.027],[u+.006,.003,-.027],[u+.006,.023,-.027],[u-.006,.023,-.027]],
            u<0?'#779aa0':'#5d8491');
        }
        break;
      }
      case 'kbs_hall': {
        // Low venue with a shallow roof and segmented curved blue-glass front.
        box(0,.021,.115,.075,0,.002,{wall:'#c2c4b9',roof:'#dcd9cb'});
        const footprint=[[-.055,-.025],[-.038,-.034],[-.016,-.040],[.016,-.040],[.038,-.034],[.055,-.025],[.055,.019],[-.055,.019]];
        prism(footprint,.002,.027,['#768e9a','#5a7f90','#547d8d','#668998','#8197a0','#9ca8a7','#b1b6ae','#99a9a8'],'#c7d0c9');
        for (let i=0;i<5;i++) {
          const a=footprint[i],b=footprint[i+1];
          if (visible.front) surfaceFace([[a[0],.006,a[1]-.0003],[b[0],.006,b[1]-.0003],
            [b[0],.023,b[1]-.0003],[a[0],.023,a[1]-.0003]],i%2?'#5d8493':'#49748a');
        }
        box(0,0,.112,.065,.029,.003,{wall:'#c7cfca',roof:'#d8ddd5'});
        break;
      }
      case 'cj_enm': {
        // Two glazed wings flanking a solid broadcast/office center.
        box(-.035,0,.043,.060,0,.082,{wall:'#92a2a4',front:'#8ba0a6',roof:'#bcc7c4',
          glass:'#587986',columns:5,rows:8});
        box(.035,0,.043,.060,0,.092,{wall:'#9aa8a8',front:'#92a2a5',roof:'#c3ccc8',
          glass:'#557a88',columns:5,rows:9});
        box(0,.004,.034,.055,0,.057,{wall:'#b9bdb5',front:'#afb9b4',roof:'#cbd0c8'});
        box(0,-.024,.108,.012,0,.016,{wall:'#5e737b',front:'#536b74',roof:'#8a9898'});
        break;
      }
      case 'mbc_media': {
        // Sangam's paired blue-glass volumes and high connecting skybridge.
        box(-.037,0,.043,.059,0,.105,{wall:'#88a3ac',front:'#829fab',roof:'#b8c8c7',
          glass:'#4d7788',glassAlt:'#6b96a4',columns:5,rows:10});
        box(.037,.008,.043,.059,0,.095,{wall:'#91aab1',front:'#8ba6ad',roof:'#bdcbc9',
          glass:'#547d8e',glassAlt:'#729baa',columns:5,rows:9});
        box(0,.010,.045,.022,.056,.018,{wall:'#597b8a',front:'#648898',roof:'#9badb1',
          glass:'#568295',columns:5,rows:2,ribbon:true});
        box(0,-.033,.077,.018,0,.018,{wall:'#7e9fa5',front:'#789ca1',roof:'#a7bdba',
          glass:'#557d86',columns:6,rows:2,ribbon:true});
        box(0,-.046,.056,.004,.002,.009,{wall:'#344e57',front:'#354e57',roof:'#68858a'});
        break;
      }
    }

    // The view matrix supplies camera rotation and tilt; draw back surfaces first.
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
      ctx.closePath(); ctx.fillStyle = item.color; ctx.fill();
      if (item.edge) {ctx.strokeStyle = item.edge; ctx.lineWidth = item.lineWidth; ctx.stroke();}
    }
    if (selected) {
      const w = look.width * .58, d = Math.min(.052, look.width * .48);
      const outline = [[-w,-d],[w,-d],[w,d],[-w,d]].map(p => project(...at(p[0],-.001,p[1])));
      ctx.beginPath(); outline.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
      ctx.closePath();
      ctx.strokeStyle = dark ? 'rgba(202,220,231,.58)' : 'rgba(54,91,111,.42)';
      ctx.lineWidth = 1; ctx.stroke();
    }
    const top = project(site.x, groundY + look.height, site.z);
    ctx.restore();
    return {x:ground.x,y:top.y,topY:top.y,r:clamp(screenWidth*.63+6,15,78),drawn:true};
  }

  window.SeoulKpopModels = Object.freeze({draw, siteLooks});
})();
