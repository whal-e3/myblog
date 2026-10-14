#!/usr/bin/env python3
"""Dark/light theme regression tests for the bundled preview.

Optional dev dependency: playwright + Chromium. Browser policy in the build environment
blocks URL navigation, so the bundle is loaded with set_content. Storage is an explicit
Storage-shaped fixture for preference tests; opaque-origin storage is tested separately.
Train records are synthetic test fixtures, never observations of actual services.
"""
from pathlib import Path
import argparse, json
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--chromium', default='/usr/bin/chromium')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
html = (root/'dist/seoul-subway-3d-live.html').read_text(encoding='utf-8')
out = root/'tests/results'; out.mkdir(parents=True, exist_ok=True)
report = {'browserNavigation':'set_content (URL navigation blocked by environment policy)',
          'storage':'in-memory Storage fixture; no native reload-persistence assertion',
          'trainData':'synthetic fixtures only', 'cases':[], 'pageErrors':[]}

def record(name, **detail):
    report['cases'].append({'case':name, **detail}); print('PASS',name,flush=True)

def load(browser, theme='light', saved=None, storage=True, mobile=False, width=1440,
         reduced_motion=True):
    page = browser.new_page(viewport={'width':width,'height':844 if mobile else 950},
                            color_scheme=theme,
                            reduced_motion='reduce' if reduced_motion else 'no-preference',
                            is_mobile=mobile,has_touch=mobile)
    page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
    if storage:
        page.evaluate('''saved=>{
          window.__themeStore={...(saved||{})};
          Object.defineProperty(window,'localStorage',{configurable:true,value:{
            getItem:k=>Object.hasOwn(__themeStore,k)?__themeStore[k]:null,
            setItem:(k,v)=>{__themeStore[k]=String(v)},removeItem:k=>delete __themeStore[k]
          }});
        }''',saved)
    page.evaluate('''()=>{window.fetch=async()=>new Response(JSON.stringify({
      configured:false,enabledLines:['2','1'],supportedLines:['1','2'],pollSeconds:30,
      serverTime:new Date().toISOString(),budget:{used:0,localLimit:1000}
    }),{status:200,headers:{'Content-Type':'application/json'}});}''')
    page.set_content(html,wait_until='load')
    page.wait_for_function('!!window.__SEOUL_APP__ && document.querySelector("#loading").hidden')
    return page

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.chromium,headless=True,
        args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
    page=load(browser,theme='dark')
    assert page.evaluate('SeoulTheme.current')=='dark'
    assert page.evaluate('SeoulTheme.preference')=='system'
    assert page.locator('#theme-toggle').get_attribute('aria-label')=='Switch to light mode'
    record('initial-system-theme',renderer=page.evaluate('__SEOUL_APP__.renderer'))
    assert abs(page.evaluate('__SEOUL_APP__.cam.pitch')-.72)<.01
    record('reduced-motion-starts-at-final-3d-angle')
    page.emulate_media(color_scheme='light')
    page.wait_for_function('SeoulTheme.current==="light"')
    record('follows-device-changes-until-manual-selection')
    page.click('#theme-toggle')
    assert page.evaluate('__themeStore[SeoulTheme.storageKey]')=='dark'
    page.emulate_media(color_scheme='dark');page.emulate_media(color_scheme='light')
    page.wait_for_timeout(60)
    assert page.evaluate('SeoulTheme.current')=='dark'
    saved=page.evaluate('__themeStore')
    record('explicit-choice-is-saved-and-overrides-device')
    reloaded=load(browser,theme='light',saved=saved)
    assert reloaded.evaluate('SeoulTheme.current')=='dark'
    record('new-document-restores-saved-choice-storage-fixture')
    reloaded.close()

    # Theme changes cannot alter geography, selections, camera targets, or source colors.
    page.evaluate('''()=>{const a=__SEOUL_APP__;a.releaseZoomAnchor();a.core();Object.assign(a.cam,a.goal);a.render()}''')
    page.wait_for_timeout(60)
    snapshot='JSON.stringify({cam:__SEOUL_APP__.cam,goal:__SEOUL_APP__.goal,state:__SEOUL_APP__.state,colors:SEOUL_DATA.lines.map(l=>l.color)})'
    before=page.evaluate(snapshot)
    for theme in ['light','dark']:
        page.evaluate('(t)=>SeoulTheme.set(t)',theme)
        assert page.evaluate(snapshot)==before
        pixels=page.evaluate('''()=>{
          const c=document.querySelector('#scene'),a=__SEOUL_APP__;
          if(a.renderer==='webgl')return {kind:'webgl',color:[...c.getContext('webgl').getParameter(c.getContext('webgl').COLOR_CLEAR_VALUE)]};
          const pixels=c.getContext('2d').getImageData(c.width-24,c.height-24,24,24).data,counts=new Map();
          for(let i=0;i<pixels.length;i+=4){const k=[pixels[i],pixels[i+1],pixels[i+2]].join(',');counts.set(k,(counts.get(k)||0)+1)}
          return {kind:'canvas',color:[...counts].sort((a,b)=>b[1]-a[1])[0][0].split(',').map(Number)};
        }''')
        expected=[8,23,38] if theme=='dark' else [243,247,252]
        actual=[round(v*255) for v in pixels['color'][:3]] if pixels['kind']=='webgl' else pixels['color'][:3]
        assert actual==expected,(theme,actual,expected)
    record('map-palette-and-camera-preserved')
    page.evaluate('()=>{const a=__SEOUL_APP__;a.core();Object.assign(a.cam,a.goal);a.render()}')
    page.screenshot(path=str(out/'dark-desktop.png'))

    # Selection and actual model instances survive a theme switch; data is test-only.
    page.evaluate('''()=>{
      const a=__SEOUL_APP__,now=new Date().toISOString();a.applyLive({lines:[{
        lineId:'2',state:'ok',trains:[{key:'2:TEST:DARK',lineId:'2',number:'TEST-DARK',
        stationName:'강남',observedAt:now,receivedAt:now,direction:'0',status:'1',
        destination:'성수',express:false,lastTrain:false}]}]});
      a.selectTrain(0);Object.assign(a.cam,a.goal);a.render();
    }''')
    page.wait_for_timeout(50)
    assert page.evaluate('__SEOUL_APP__.getTrainInstances().length')>=4
    before=page.evaluate('JSON.stringify({train:__SEOUL_APP__.state.selectedTrain,follow:__SEOUL_APP__.state.followTrain,n:__SEOUL_APP__.fleet.trains.length})')
    page.click('#theme-toggle');page.click('#theme-toggle')
    assert page.evaluate('JSON.stringify({train:__SEOUL_APP__.state.selectedTrain,follow:__SEOUL_APP__.state.followTrain,n:__SEOUL_APP__.fleet.trains.length})')==before
    assert page.locator('#train-number').inner_text()=='TRAIN TEST-DARK'
    assert page.locator('#train-card').is_visible()
    record('train-model-inspector-and-follow-preserved-synthetic-fixture')
    page.evaluate('''()=>{const m=document.createElement('div');m.textContent='SYNTHETIC TEST FIXTURE — NOT LIVE DATA';Object.assign(m.style,{position:'fixed',bottom:'4px',left:'33%',zIndex:1000,padding:'6px 10px',background:'#193751',color:'#ffcf85',font:'bold 10px sans-serif'});document.body.append(m)}''')
    page.screenshot(path=str(out/'dark-train-test-fixture.png'))

    page.click('#nav-about');page.locator('#theme-preference').select_option('system')
    assert page.evaluate('SeoulTheme.preference')=='system'
    assert page.evaluate('SeoulTheme.storageKey in __themeStore') is False
    page.emulate_media(color_scheme='dark');page.wait_for_function('SeoulTheme.current==="dark"')
    page.screenshot(path=str(out/'dark-about.png'))
    record('appearance-setting-restores-system-theme')
    page.click('#close-about')
    page.locator('#theme-toggle').focus();page.keyboard.press('Enter')
    assert page.evaluate('SeoulTheme.current')=='light'
    page.keyboard.press('Space')
    assert page.evaluate('SeoulTheme.current')=='dark'
    record('keyboard-enter-space-toggle')
    page.evaluate('''()=>window.dispatchEvent(new StorageEvent('storage',{key:SeoulTheme.storageKey,newValue:'light'}))''')
    assert page.evaluate('SeoulTheme.current')=='light'
    record('cross-tab-storage-event-applies-theme')
    page.close()

    for width in [390,320]:
        mobile=load(browser,theme='dark',mobile=True,width=width)
        assert not mobile.evaluate('document.documentElement.scrollWidth>innerWidth')
        assert mobile.locator('#live-badge').is_hidden()
        buttons=[mobile.locator('#'+i).bounding_box() for i in ['theme-toggle','export']]
        assert all(b and b['x']>=0 and b['x']+b['width']<=width for b in buttons)
        assert buttons[0]['x']+buttons[0]['width']<=buttons[1]['x']+1
        mobile.locator('#theme-toggle').tap();assert mobile.evaluate('SeoulTheme.current')=='light'
        mobile.locator('#theme-toggle').tap();assert mobile.evaluate('SeoulTheme.current')=='dark'
        if width==390:
            mobile.evaluate('()=>{const a=__SEOUL_APP__;a.core();Object.assign(a.cam,a.goal);a.render()}')
            mobile.screenshot(path=str(out/'dark-mobile.png'))
            mobile.locator('#mobile-menu').tap()
            mobile.screenshot(path=str(out/'dark-mobile-sidebar.png'))
        record('mobile-layout-and-touch-toggle-'+str(width))
        mobile.close()
    blocked=load(browser,theme='dark',storage=False)
    blocked.click('#theme-toggle');assert blocked.evaluate('SeoulTheme.current')=='light'
    record('opaque-origin-storage-unavailable-still-works')
    blocked.close()

    animated=load(browser,reduced_motion=False)
    assert animated.locator('#mode-layers').count()==0
    assert animated.evaluate('__SEOUL_APP__.cam.pitch')>1.35
    animated.wait_for_function('Math.abs(__SEOUL_APP__.cam.pitch-.72)<.02',timeout=6500)
    record('single-view-intro-tilts-from-overhead-to-3d')
    animated.close()
    interrupted=load(browser,reduced_motion=False)
    interrupted.click('#rotate-right')
    yaw=interrupted.evaluate('__SEOUL_APP__.goal.yaw')
    interrupted.wait_for_timeout(3600)
    assert abs(interrupted.evaluate('__SEOUL_APP__.goal.yaw')-yaw)<1e-6
    record('manual-rotation-interrupts-intro')
    interrupted.close();browser.close()
assert not report['pageErrors'],report['pageErrors']
(out/'theme-browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(f"{len(report['cases'])} theme cases passed; no page errors.")
