#!/usr/bin/env python3
"""Browser smoke checks for static Korean rail and illustrative K-pop layers."""
from pathlib import Path
import argparse
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--chromium', default='/usr/bin/chromium')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
html = (root / 'dist/seoul-subway-3d-live.html').read_text(encoding='utf-8')
out = root / 'tests/results'
out.mkdir(parents=True, exist_ok=True)


def load(browser, mobile=False, software=False):
    page = browser.new_page(
        viewport={'width': 390 if mobile else 1440, 'height': 844 if mobile else 900},
        is_mobile=mobile, has_touch=mobile, reduced_motion='reduce',
    )
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.evaluate('''() => {
      window.fetch = async () => new Response(JSON.stringify({
        configured:false,enabledLines:['2'],supportedLines:['2'],pollSeconds:120,
        serverTime:new Date().toISOString(),budget:{used:0,localLimit:900}
      }), {status:200,headers:{'Content-Type':'application/json'}});
    }''')
    if software:
        page.evaluate('''() => {
          const original=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(kind,...rest){
            return kind==='webgl' ? null : original.call(this,kind,...rest);
          };
        }''')
    page.set_content(html, wait_until='load')
    page.wait_for_function('!!window.__SEOUL_APP__ && document.querySelector("#loading").hidden')
    assert not errors, errors
    return page, errors


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=args.chromium, headless=True,
        args=['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    )
    page, errors = load(browser)
    counts = page.evaluate('''() => {
      const a=__SEOUL_APP__; return {seoul:a.data.lines.length,
        urban:a.national.lines.filter(l=>l.group==='Urban').length,
        intercity:a.national.lines.filter(l=>l.group==='Intercity').length,
        segments:a.national.segments.length,places:a.kpop.sites.length};
    }''')
    assert counts['seoul'] == 24 and counts['urban'] >= 12 and counts['intercity'] >= 1, counts
    assert counts['segments'] > 50 and counts['places'] == 11, counts
    print('PASS independent Seoul, national and K-pop datasets:', counts, flush=True)
    page.locator('#national-panel > summary').click()

    page.evaluate('''() => {const a=__SEOUL_APP__;a.country();Object.assign(a.cam,a.goal);a.render();}''')
    assert page.evaluate('__SEOUL_APP__.cam.scale') > 100
    page.screenshot(path=str(out / 'korea-rail-country.png'))
    print('PASS national country view', flush=True)

    page.evaluate('''() => {const a=__SEOUL_APP__;a.focusCity('Busan');Object.assign(a.cam,a.goal);a.render();}''')
    assert page.evaluate('__SEOUL_APP__.goal.z') > 200
    assert 'Busan' in page.locator('#map-subtitle').inner_text()
    urban_on = page.locator('#scene').evaluate('(element) => element.toDataURL()')
    page.locator('#national-urban-toggle').uncheck()
    page.evaluate('__SEOUL_APP__.render()')
    urban_off = page.locator('#scene').evaluate('(element) => element.toDataURL()')
    assert urban_on != urban_off, 'Busan rail layer did not affect rendering'
    page.locator('#national-urban-toggle').check()
    page.evaluate('__SEOUL_APP__.render()')
    page.screenshot(path=str(out / 'korea-rail-busan.png'))
    print('PASS Busan rail rendering and layer toggle', flush=True)

    page.evaluate('''() => {const a=__SEOUL_APP__;a.focusKpop();Object.assign(a.cam,a.goal);a.render();}''')
    assert page.evaluate('__SEOUL_APP__.getKpopHits().filter(hit=>hit.site).length') >= 8
    assert page.evaluate('__SEOUL_APP__.getKpopHits().every(hit=>!hit.drawn)'), 'Overview should use small place markers'
    page.screenshot(path=str(out / 'seoul-kpop-models.png'))
    page.evaluate('''() => {const a=__SEOUL_APP__;a.selectPlace('coex_kpop_square');Object.assign(a.cam,a.goal);a.render();}''')
    assert page.locator('#place-card').is_visible()
    assert 'COEX' in page.locator('#place-card').inner_text()
    assert 'illustrative' in page.locator('#place-card').inner_text().lower()
    assert page.evaluate('''() => {
      const a=__SEOUL_APP__, hit=a.getKpopHits().find(h=>h.site?.id==='coex_kpop_square');
      return a.cam.scale<=1 && !!hit?.drawn;
    }'''), 'Selected place should zoom close enough to show its 3D form'
    assert page.locator('#place-card a').get_attribute('href').startswith('https://')
    page.screenshot(path=str(out / 'seoul-kpop-place.png'))
    for landmark in ('hybe', 'yg', 'kbs_hall', 'cj_enm', 'mbc_media', 'k_star_road'):
        page.evaluate('''id => {
          const a=__SEOUL_APP__;a.selectPlace(id);Object.assign(a.cam,a.goal);a.render();
        }''', landmark)
        assert page.evaluate('''id => {
          const a=__SEOUL_APP__;return a.getKpopHits().some(h=>h.site?.id===id&&h.drawn);
        }''', landmark), landmark
        assert page.evaluate('''() => __SEOUL_APP__.getKpopHits()
          .filter(hit => hit.site).length''') == 1, 'Close place view should isolate its model'
        page.screenshot(path=str(out / f'seoul-kpop-{landmark}.png'))
    page.locator('#kpop-toggle').uncheck()
    page.evaluate('__SEOUL_APP__.render()')
    assert page.evaluate('__SEOUL_APP__.getKpopHits().length') == 0
    print('PASS 3D K-pop models, place detail and visibility toggle', flush=True)
    assert not errors, errors
    page.close()

    mobile, errors_mobile = load(browser, mobile=True)
    mobile.locator('#mobile-menu').click()
    mobile.locator('#national-panel > summary').click()
    assert mobile.locator('#kpop-focus').is_visible()
    mobile.locator('#kpop-focus').click()
    mobile.evaluate('''() => {const a=__SEOUL_APP__;Object.assign(a.cam,a.goal);a.render();}''')
    assert mobile.evaluate('__SEOUL_APP__.getKpopHits().filter(hit=>hit.site).length') > 0
    mobile.screenshot(path=str(out / 'seoul-kpop-mobile.png'))
    mobile.evaluate('''() => {
      const a=__SEOUL_APP__;a.selectPlace('yg');Object.assign(a.cam,a.goal);a.render();
    }''')
    assert mobile.locator('.train-launcher').is_hidden()
    assert mobile.evaluate('''() => {
      const a=__SEOUL_APP__,hit=a.getKpopHits().find(h=>h.site?.id==='yg');
      if(!hit?.drawn)return false;
      const v=document.querySelector('#viewport').getBoundingClientRect();
      const ground=a.project(hit.site.x,.115,hit.site.z);
      const x=v.left+hit.x,y=v.top+(hit.y+ground.y)/2;
      return ['#place-card','.view-tools'].every(selector=>{
        const r=document.querySelector(selector).getBoundingClientRect();
        return x<r.left||x>r.right||y<r.top||y>r.bottom;
      });
    }'''), 'Selected model should remain visible beside mobile overlays'
    mobile.screenshot(path=str(out / 'seoul-kpop-mobile-place.png'))
    assert not errors_mobile, errors_mobile
    print('PASS mobile place navigation', flush=True)
    mobile.close()

    software, errors_software = load(browser, software=True)
    assert software.evaluate('__SEOUL_APP__.renderer') == 'software-3d'
    software.evaluate('''() => {const a=__SEOUL_APP__;a.focusCity('Daegu');Object.assign(a.cam,a.goal);a.render();}''')
    assert software.evaluate('__SEOUL_APP__.goal.z') > 100
    software.evaluate('''() => {const a=__SEOUL_APP__;a.focusKpop();Object.assign(a.cam,a.goal);a.render();}''')
    assert software.evaluate('__SEOUL_APP__.getKpopHits().filter(hit=>hit.site).length') >= 8
    assert not errors_software, errors_software
    print('PASS software renderer national and K-pop layers', flush=True)
    browser.close()
