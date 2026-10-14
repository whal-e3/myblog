#!/usr/bin/env python3
"""Offline browser regression for map navigation and simulation disclosure.
No TOPIS connection or live tracking verification is claimed.
Run: python tests/test_live_browser.py path/to/seoul-subway-3d-live.html
Requires optional developer dependency playwright and a Chromium binary.
"""
import argparse,json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('html',type=Path);p.add_argument('--chromium',default='/usr/bin/chromium');p.add_argument('--output',type=Path,default=Path(__file__).parent/'results/live-browser-report.json');args=p.parse_args()
args.output.parent.mkdir(exist_ok=True,parents=True)
started=time.monotonic()
results={'offlineSimulationOnly':True,'authorizedLiveAPIValidated':False,'cases':[],'errors':[]}
def record(name,details):results['cases'].append({'case':name,**details});print(round(time.monotonic()-started,1),name,json.dumps(details,ensure_ascii=False),flush=True)
requests=[]
def load(browser,**kw):
 kw.setdefault('reduced_motion','reduce')
 page=browser.new_page(**kw);page.on('pageerror',lambda e:results['errors'].append(str(e)))
 page.on('request',lambda request:requests.append(request.url))
 page.route('**/*',lambda route:route.abort())
 page.evaluate('''()=>{
   const fixed=Date.parse('2026-10-14T07:31:45Z');
   Date.now=()=>fixed;
   window.__fetchAttempts=[];
   window.fetch=(...args)=>{window.__fetchAttempts.push(String(args[0]));return Promise.reject(new Error('Network is forbidden in the offline simulation test'));};
 }''')
 page.set_content(args.html.read_text(encoding='utf-8'),wait_until='load')
 page.wait_for_function('!!window.__SEOUL_APP__ && document.querySelector("#loading").hidden')
 assert not requests and not page.evaluate('window.__fetchAttempts'),requests
 return page
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
 page=load(b,viewport={'width':1440,'height':950})
 assert page.evaluate('__SEOUL_APP__.simulation.activeCount()')>0
 assert page.evaluate('__SEOUL_APP__.data.lines.length')==24
 assert page.locator('.simulation-chip').is_visible()
 assert 'SIMULATED TRAINS · NOT LIVE' in page.locator('.simulation-chip').inner_text()
 assert 'SIMULATED · NOT LIVE' in page.locator('#live-badge-label').inner_text()
 assert page.locator('#motion-toggle').is_disabled() and not page.locator('#motion-toggle').is_checked()
 record('offline-simulation-disclosure',{'mappedRoutes':24,'activeTrains':page.evaluate('__SEOUL_APP__.simulation.activeCount()'),'networkRequests':len(requests)})
 page.click('#scope-core');page.wait_for_timeout(1000)
 # Real mouse gesture; the projected world anchor must follow the exact screen delta.
 page.evaluate('()=>{const a=__SEOUL_APP__;a.core();Object.assign(a.cam,a.goal);a.render();}')
 r=page.locator('#scene').bounding_box();x=r['x']+r['width']*.45;y=r['y']+r['height']*.5
 before=page.evaluate('({yaw:__SEOUL_APP__.cam.yaw,pitch:__SEOUL_APP__.cam.pitch,p:__SEOUL_APP__.project(0,0,0)})')
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+82,y+46,steps=1);page.mouse.up();page.wait_for_timeout(80)
 after=page.evaluate('({yaw:__SEOUL_APP__.cam.yaw,pitch:__SEOUL_APP__.cam.pitch,p:__SEOUL_APP__.project(0,0,0)})')
 dx=after['p']['x']-before['p']['x'];dy=after['p']['y']-before['p']['y']
 assert abs(dx-82)<.15 and abs(dy-46)<.15,(dx,dy)
 assert after['yaw']==before['yaw'] and after['pitch']==before['pitch']
 record('left-drag-pan',{'deltaX':dx,'deltaY':dy,'rotationUnchanged':True})
 # The visible direction pad moves the camera in screen directions, even after rotation.
 for yaw in [0,.65]:
  page.evaluate('(yaw)=>{const a=__SEOUL_APP__;a.core();a.goal.yaw=yaw;Object.assign(a.cam,a.goal);a.render();}',yaw)
  before=page.evaluate('__SEOUL_APP__.project(0,0,0)')
  page.click('#pan-up');page.evaluate('()=>{const a=__SEOUL_APP__;Object.assign(a.cam,a.goal);a.render();}')
  up=page.evaluate('__SEOUL_APP__.project(0,0,0)')
  assert up['y']>before['y']+20,(yaw,before,up)
  page.click('#pan-right');page.evaluate('()=>{const a=__SEOUL_APP__;Object.assign(a.cam,a.goal);a.render();}')
  right=page.evaluate('__SEOUL_APP__.project(0,0,0)')
  assert right['x']<up['x']-20,(yaw,up,right)
  record('direction-pad-screen-pan',{'yaw':yaw,'upPixels':up['y']-before['y'],'rightPixels':up['x']-right['x']})
 page.locator('#scene').focus()
 before=page.evaluate('__SEOUL_APP__.project(0,0,0)')
 page.keyboard.press('ArrowLeft');page.evaluate('()=>{const a=__SEOUL_APP__;Object.assign(a.cam,a.goal);a.render();}')
 after=page.evaluate('__SEOUL_APP__.project(0,0,0)')
 assert after['x']>before['x']+20,(before,after)
 record('canvas-arrow-key-pan',{'leftPixels':after['x']-before['x']})
 # Modified wheel input pans in screen directions without zooming or turning the map.
 for name,flags,delta_x,delta_y,mode,axis,sign in [
  ('ctrl-wheel-down',{'ctrlKey':True},0,120,0,'y',-1),
  ('ctrl-wheel-up',{'ctrlKey':True},0,-120,0,'y',1),
  ('shift-wheel-down',{'shiftKey':True},0,120,0,'x',-1),
  ('shift-delta-x',{'shiftKey':True},120,0,0,'x',-1),
  ('ctrl-shift-precedence',{'ctrlKey':True,'shiftKey':True},0,120,0,'y',-1),
  ('ctrl-line-mode',{'ctrlKey':True},0,3,1,'y',-1),
 ]:
  page.evaluate('()=>{const a=__SEOUL_APP__;a.releaseZoomAnchor();a.core();a.goal.yaw=.65;Object.assign(a.cam,a.goal);a.render();}')
  before=page.evaluate('({p:__SEOUL_APP__.project(0,0,0),scale:__SEOUL_APP__.goal.scale,yaw:__SEOUL_APP__.goal.yaw,pitch:__SEOUL_APP__.goal.pitch})')
  prevented=page.evaluate('''input=>{
   const event=new WheelEvent('wheel',{cancelable:true,deltaX:input.deltaX,deltaY:input.deltaY,deltaMode:input.mode,...input.flags});
   document.querySelector('#scene').dispatchEvent(event);return event.defaultPrevented;
  }''',{'deltaX':delta_x,'deltaY':delta_y,'mode':mode,'flags':flags})
  # Synthetic rolling stock makes the first rendered frame expensive on some
  # Chrome/SwiftShader setups; verify the camera's target after settling it.
  page.evaluate('()=>{const a=__SEOUL_APP__;Object.assign(a.cam,a.goal);a.render();}')
  after=page.evaluate('({p:__SEOUL_APP__.project(0,0,0),scale:__SEOUL_APP__.goal.scale,yaw:__SEOUL_APP__.goal.yaw,pitch:__SEOUL_APP__.goal.pitch})')
  travel=(after['p'][axis]-before['p'][axis])*sign
  assert prevented and travel>20,(name,before,after,prevented)
  assert after['scale']==before['scale'] and after['yaw']==before['yaw'] and after['pitch']==before['pitch'],(name,before,after)
  record(name,{'pixels':round(travel,1),'zoomUnchanged':True})
 # Right and shift-drag rotation remains available, not primary.
 for shift in [False,True]:
  page.evaluate("()=>{const a=__SEOUL_APP__;a.core();Object.assign(a.cam,a.goal);a.render();}")
  before=page.evaluate('__SEOUL_APP__.goal.yaw');page.mouse.move(x,y)
  if shift:page.keyboard.down('Shift')
  page.mouse.down(button='left' if shift else 'right');page.mouse.move(x+55,y+12,steps=1);page.mouse.up(button='left' if shift else 'right')
  if shift:page.keyboard.up('Shift')
  assert abs(page.evaluate('__SEOUL_APP__.goal.yaw')-before)>.1
 record('secondary-rotation',{'rightDrag':True,'shiftDrag':True})
 # Reuse a station-aware anchor with the elevated line's actual render height.
 zoomtest='''async delta=>{
 const a=__SEOUL_APP__,c=document.querySelector('#scene'),r=c.getBoundingClientRect();a.releaseZoomAnchor();a.core();a.state.selectedLine=1;Object.assign(a.cam,a.goal);a.render();
 const p=a.getProjected().filter(p=>p.alpha>.5&&p.x>r.width*.16&&p.x<r.width*.76&&p.y>r.height*.22&&p.y<r.height*.68)[0];
 const y=.32+p.line*.78*a.cam.spread,pos=a.project(p.s.x,y,p.s.z),e=new WheelEvent('wheel',{clientX:r.left+pos.x,clientY:r.top+pos.y,deltaY:delta,cancelable:true});
 const x=e.clientX-r.left,sy=e.clientY-r.top,w=a.pointUnderCursor(x,sy,a.cam,y);c.dispatchEvent(e);let drift=0;
 for(let n=0;n<4;n++){await Promise.race([new Promise(requestAnimationFrame),new Promise(r=>setTimeout(r,500))]);const q=a.project(w.x,w.y,w.z);drift=Math.max(drift,Math.hypot(q.x-x,q.y-sy));}return {delta,drift};}'''
 for delta in [-190,190]:
  print('starting zoom',delta,round(time.monotonic()-started,1),flush=True)
  rr=page.evaluate(zoomtest,delta);assert rr['drift']<.1,rr;record('cursor-centered-zoom',rr)
 # Train inspector must describe an invented scenario, never a provider observation.
 page.click('#train-inspect');page.wait_for_timeout(1100)
 assert page.locator('#train-card').is_visible()
 assert page.locator('#train-number').inner_text().startswith('SCENARIO ')
 assert 'SIMULATED POSITION · NOT LIVE' in page.locator('#train-model-status').inner_text()
 assert 'not a provider report' in page.locator('#train-card .card-note').inner_text().lower()
 assert page.evaluate('__SEOUL_APP__.getTrainInstances().length')>=4
 assert page.evaluate('__SEOUL_APP__.fleet.trains[__SEOUL_APP__.state.selectedTrain].simulated')
 assert not page.evaluate('window.__fetchAttempts') and not requests,(requests,page.evaluate('window.__fetchAttempts'))
 page.screenshot(path=str(args.output.parent/'simulated-train-desktop.png'))
 record('simulated-train-inspector',{'cars':page.evaluate('__SEOUL_APP__.getTrainInstances().length'),'networkRequests':len(requests)})
 # Opening the explanation must not connect to the optional diagnostic feed.
 page.click('#live-badge')
 assert page.locator('#live-dialog').evaluate('(e)=>e.open')
 assert 'simulation' in page.locator('#live-dialog').inner_text().lower()
 page.click('#close-live')
 assert not page.evaluate('window.__fetchAttempts') and not requests,(requests,page.evaluate('window.__fetchAttempts'))
 record('offline-simulation-dialog',{'networkRequests':len(requests)})
 # Source palette is kept exactly, and light blue map + white panel applied.
 colors=page.evaluate('({allMatch:__SEOUL_APP__.data.lines.every(l=>l.color===l.originalColor),panel:getComputedStyle(document.querySelector(".sidebar")).backgroundColor,accent:getComputedStyle(document.documentElement).getPropertyValue("--accent")})')
 assert colors['allMatch'] and colors['panel']=='rgb(255, 255, 255)';record('metro-palette',colors)
 # Mobile touch pan and pinch. Dispatch browser touch events via CDP.
 mobile=load(b,viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
 mobile.evaluate("()=>{const a=__SEOUL_APP__;a.core();Object.assign(a.cam,a.goal);a.render();}")
 before=mobile.evaluate('__SEOUL_APP__.project(0,0,0)')
 mobile.locator('#pan-down').tap();mobile.wait_for_timeout(120)
 after=mobile.evaluate('__SEOUL_APP__.project(0,0,0)')
 assert after['y']<before['y']-20,(before,after)
 record('mobile-direction-pad',{'downPixels':before['y']-after['y']})
 cdp=mobile.context.new_cdp_session(mobile)
 before=mobile.evaluate('({p:__SEOUL_APP__.project(0,0,0),yaw:__SEOUL_APP__.cam.yaw})')
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':160,'y':420,'id':1}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':205,'y':450,'id':1}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});mobile.wait_for_timeout(100)
 after=mobile.evaluate('({p:__SEOUL_APP__.project(0,0,0),yaw:__SEOUL_APP__.cam.yaw})')
 assert abs(after['p']['x']-before['p']['x']-45)<.2 and abs(after['p']['y']-before['p']['y']-30)<.2 and after['yaw']==before['yaw']
 scale=mobile.evaluate('__SEOUL_APP__.goal.scale')
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':140,'y':420,'id':1},{'x':240,'y':420,'id':2}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':110,'y':420,'id':1},{'x':270,'y':420,'id':2}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});mobile.wait_for_timeout(250)
 assert mobile.evaluate('__SEOUL_APP__.goal.scale')<scale
 assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
 record('mobile-touch-controls',{'panDelta':[45,30],'pinchZoom':True,'noHorizontalOverflow':True})
 assert mobile.locator('#live-notice-connect').is_visible()
 mobile.click('#live-notice-connect');assert mobile.locator('#live-dialog').evaluate('(e)=>e.open');mobile.click('#close-live')
 assert 'SIMULATED TRAINS · NOT LIVE' in mobile.locator('.simulation-chip').inner_text()
 assert not mobile.evaluate('window.__fetchAttempts') and not requests,(requests,mobile.evaluate('window.__fetchAttempts'))
 mobile.screenshot(path=str(args.output.parent/'simulated-map-mobile.png'))
 record('browser-errors',{'count':len(results['errors'])})
 assert not results['errors'],results['errors']
 b.close()
args.output.write_text(json.dumps(results,indent=2,ensure_ascii=False));print('PASS:',len(results['cases']),'cases')
