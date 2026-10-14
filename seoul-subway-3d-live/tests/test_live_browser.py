#!/usr/bin/env python3
"""Browser regression suite. ALL train observations here are SYNTHETIC TEST FIXTURES.
No TOPIS connection or live tracking verification is claimed.
Run: python tests/test_live_browser.py path/to/seoul-subway-3d-live.html
Requires optional developer dependency playwright and a Chromium binary.
"""
import argparse,json,time
from pathlib import Path
from datetime import datetime,timedelta,timezone
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('html',type=Path);p.add_argument('--chromium',default='/usr/bin/chromium');p.add_argument('--output',type=Path,default=Path(__file__).parent/'live-browser-report.json');args=p.parse_args()
args.output.parent.mkdir(exist_ok=True,parents=True)
started=time.monotonic()
results={'syntheticFixturesOnly':True,'authorizedLiveAPIValidated':False,'cases':[],'errors':[]}
def record(name,details):results['cases'].append({'case':name,**details});print(round(time.monotonic()-started,1),name,json.dumps(details,ensure_ascii=False),flush=True)
def iso(seconds=0):return (datetime.now(timezone.utc)+timedelta(seconds=seconds)).isoformat()
status={'configured':False,'enabledLines':['2','1'],'supportedLines':['1','2'],'pollSeconds':30,'budget':{'used':0,'localLimit':1000},'serverTime':iso()}
feed={'configured':True,'enabledLines':['2','1'],'supportedLines':['1','2'],'pollSeconds':30,'budget':{'used':1,'localLimit':1000},'serverTime':iso(),'lines':[]}
calls=[]
def fixture(url):
 calls.append(url)
 if url=='/api/live/status':return json.dumps({**status,'serverTime':iso()})
 return json.dumps({**feed,'serverTime':iso()})
def station_row(name='강남',number='TEST-2001',seconds=-10):
 return {'key':'2:TEST:'+number,'lineId':'2','number':number,'stationName':name,'observedAt':iso(seconds),'receivedAt':iso(),'direction':'0','status':'1','destination':'성수','express':False,'lastTrain':False}
def load(browser,**kw):
 kw.setdefault('reduced_motion','reduce')
 page=browser.new_page(**kw);page.on('pageerror',lambda e:results['errors'].append(str(e)))
 page.expose_function('__fixtureFetch',fixture)
 page.evaluate('()=>{window.fetch=async url=>new Response(await window.__fixtureFetch(url),{status:200,headers:{"Content-Type":"application/json"}});}')
 page.set_content(args.html.read_text(),wait_until='load');page.wait_for_function('!!window.__SEOUL_APP__');page.wait_for_timeout(600);return page
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
 page=load(b,viewport={'width':1440,'height':950})
 assert page.evaluate('__SEOUL_APP__.fleet.trains.length')==0
 assert page.locator('#live-badge-label').inner_text()=='FEED NOT CONFIGURED'
 record('no-key-no-synthetic-trains',{'trains':0,'apiCalls':len(calls)})
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
 # UI -> client fetch -> normalized fixture -> real scene/inspector.
 feed['lines']=[{'lineId':'2','state':'ok','trains':[station_row()]}]
 page.evaluate('async()=>{await __SEOUL_APP__.live.refresh();__SEOUL_APP__.live.ui();}')
 assert page.evaluate('__SEOUL_APP__.fleet.trains.length')==1
 assert page.locator('#live-count').inner_text()=='1'
 page.evaluate('__SEOUL_APP__.selectTrain(0)');page.wait_for_timeout(1100)
 assert 'Gangnam' in page.locator('#train-station').inner_text()
 assert page.locator('#train-number').inner_text()=='TRAIN TEST-2001'
 assert page.evaluate('__SEOUL_APP__.getTrainInstances().length')>=4
 assert not page.locator('#train-card').get_attribute('hidden')
 # Inspect 3D transforms anchored exactly to observed station; old simulation clock has no effect.
 fixed=page.evaluate('''()=>{const a=__SEOUL_APP__,t=a.fleet.trains[0],p=a.live.pose(t,0,.025,false),q=a.live.pose(t,10000,.025,false);return {x:p.x,z:p.z,stationX:t.station.x,stationZ:t.station.z,same:p.x===q.x&&p.z===q.z,cars:p.cars.length,finite:p.cars.every(c=>[c.x,c.z,c.dx,c.dz].every(Number.isFinite))};}''')
 assert abs(fixed['x']-fixed['stationX'])<1e-8 and abs(fixed['z']-fixed['stationZ'])<1e-8 and fixed['same'] and fixed['cars']==4 and fixed['finite'];record('reported-station-not-simulation',fixed)
 # Watermark test-only screenshot to prevent interpreting fixture trains as actual live evidence.
 page.evaluate('''()=>{const p=document.createElement('div');p.id='qa-watermark';p.textContent='TEST FIXTURE — NOT LIVE DATA';Object.assign(p.style,{position:'fixed',bottom:'4px',left:'32%',background:'#fff',color:'#ad1d35',zIndex:99999,padding:'5px 10px',font:'bold 10px sans-serif',border:'1px solid #ad1d35'});document.body.append(p);}''')
 page.screenshot(path=str(args.output.parent/'fixture-train-desktop.png'))
 # A subsequent report of the same identifier at the next station: one short interpolation then stop.
 feed['lines'][0]['trains']=[station_row('역삼',seconds=-1)]
 rr=page.evaluate('''async()=>{const a=__SEOUL_APP__;await a.live.refresh();const t=a.fleet.trains[0],p=a.live.pose(t,0,.025,true);return {transition:!!t.transition,beginX:p.x,targetX:t.station.x,selected:a.state.selectedTrain};}''')
 assert rr['transition'] and abs(rr['beginX']-rr['targetX'])>.1 and rr['selected']==0;page.wait_for_timeout(1300)
 rr=page.evaluate('''()=>{const a=__SEOUL_APP__,t=a.fleet.trains[0],p=a.live.pose(t,0,.025,true);return {x:p.x,target:t.station.x,interpolating:a.live.interpolating(t)};}''')
 assert abs(rr['x']-rr['target'])<1e-8 and not rr['interpolating'];record('successive-reports-end-at-observation',rr)
 # Reordering preserves selected train ID, unknown stations excluded.
 feed['lines'][0]['trains']=[station_row('선릉','TEST-2002'),station_row('역삼'),station_row('NOT A STATION','UNKNOWN')]
 page.evaluate('async()=>{await __SEOUL_APP__.live.refresh();__SEOUL_APP__.live.ui();}')
 assert page.evaluate('__SEOUL_APP__.fleet.trains.length')==2
 assert page.evaluate('__SEOUL_APP__.state.selectedTrain')==1
 assert page.evaluate('__SEOUL_APP__.live.source.stats.unmapped')==1
 # Stale connection -> no fresh markers; expire removes transforms, no simulation fallback.
 page.evaluate("()=>{const a=__SEOUL_APP__;a.live.fail('TEST FIXTURE OUTAGE');a.live.ui();a.render();}")
 assert page.locator('#live-count').inner_text()=='0'
 assert page.evaluate('__SEOUL_APP__.getTrainInstances().every(c=>c.alpha<.5)')
 page.evaluate("()=>{const a=__SEOUL_APP__;for(const t of a.fleet.trains)t.observedAt=new Date(Date.now()-400000).toISOString();a.live.ui();a.render();}")
 assert page.evaluate('__SEOUL_APP__.getTrainInstances().length')==0
 record('stale-expire-no-fake-fallback',{'freshAfterError':0,'carsAfterExpiry':0})
 # Source palette is kept exactly, and light blue map + white panel applied.
 colors=page.evaluate('({allMatch:__SEOUL_APP__.data.lines.every(l=>l.color===l.originalColor),panel:getComputedStyle(document.querySelector(".sidebar")).backgroundColor,accent:getComputedStyle(document.documentElement).getPropertyValue("--accent")})')
 assert colors['allMatch'] and colors['panel']=='rgb(255, 255, 255)';record('metro-palette',colors)
 # Mobile touch pan and pinch. Dispatch browser touch events via CDP.
 mobile=load(b,viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
 mobile.evaluate("()=>{const a=__SEOUL_APP__;a.core();Object.assign(a.cam,a.goal);a.render();}")
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
 mobile.click('#live-badge');assert mobile.locator('#live-dialog').evaluate('(e)=>e.open');mobile.click('#close-live')
 mobile.screenshot(path=str(args.output.parent/'no-key-mobile.png'))
 record('browser-errors',{'count':len(results['errors'])})
 assert not results['errors'],results['errors']
 b.close()
args.output.write_text(json.dumps(results,indent=2,ensure_ascii=False));print('PASS:',len(results['cases']),'cases')
