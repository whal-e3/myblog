#!/usr/bin/env python3
"""Exercise map controls and selection panels across desktop and phone layouts."""
from pathlib import Path
import argparse
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--chromium', default='/usr/bin/chromium')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
html = (root / 'dist/seoul-subway-3d-live.html').read_text(encoding='utf-8')
out = root / 'tests/results'
out.mkdir(exist_ok=True)


def contained(page, selector):
    rect = page.locator(selector).bounding_box()
    assert rect, selector
    size = page.viewport_size
    assert rect['x'] >= 0 and rect['y'] >= 0, (selector, rect)
    assert rect['x'] + rect['width'] <= size['width'] + 1, (selector, rect)
    assert rect['y'] + rect['height'] <= size['height'] + 1, (selector, rect)
    return rect


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium, headless=True,
        args=['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    for width, height in [(1440, 900), (1024, 768), (390, 844), (320, 700), (740, 390)]:
        mobile = width <= 780
        page = browser.new_page(viewport={'width': width, 'height': height},
            is_mobile=mobile, has_touch=mobile, reduced_motion='reduce')
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url))
        page.evaluate("() => {Date.now=()=>Date.parse('2026-10-14T07:31:45Z')}")
        page.set_content(html, wait_until='load')
        page.wait_for_selector('#loading', state='hidden')
        assert not errors, errors
        assert page.locator('#fatal-error').is_hidden()
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        for selector in ['.scope-buttons', '.simulation-controls', '.view-tools', '.top-actions']:
            contained(page, selector)
        assert page.locator('.simulation-chip').count() == 1
        assert page.locator('.live-panel, .live-notice, .train-preview-wrap').count() == 0
        if width == 1440:
            visible_rows = page.locator('.line-row').evaluate_all('''rows => {
              const bounds=document.querySelector('#line-list').getBoundingClientRect();
              return rows.filter(row => {const r=row.getBoundingClientRect();return r.top>=bounds.top&&r.bottom<=bounds.bottom}).length;
            }''')
            assert visible_rows >= 10, visible_rows
        page.screenshot(path=str(out / f'ui-final-{width}.png'))

        # Native keyboard activation opens camera options without toggling playback.
        summary = page.locator('#camera-options > summary')
        summary.focus()
        page.keyboard.press('Space')
        assert page.locator('#camera-options').get_attribute('open') is not None
        contained(page, '.camera-panel')
        before = page.evaluate('({x:__SEOUL_APP__.goal.x,z:__SEOUL_APP__.goal.z,yaw:__SEOUL_APP__.goal.yaw})')
        page.locator('#pan-right').click()
        after = page.evaluate('({x:__SEOUL_APP__.goal.x,z:__SEOUL_APP__.goal.z})')
        assert after['x'] != before['x'] or after['z'] != before['z']
        page.locator('#rotate-right').click()
        assert page.evaluate('__SEOUL_APP__.goal.yaw') != before['yaw']
        page.keyboard.press('Escape')
        assert page.locator('.camera-panel').is_hidden()
        page.locator('#north').click()
        assert page.evaluate('__SEOUL_APP__.goal.yaw') == 0
        page.locator('#scope-full').click()

        # Search and station details must work from the mobile drawer too.
        if mobile:
            page.locator('#mobile-menu').click()
            assert page.locator('#viewport').evaluate('e=>e.inert')
            assert page.locator('#sidebar-close').evaluate('e=>document.activeElement===e')
        page.locator('#search').fill('Gangnam')
        page.locator('.search-item').first.wait_for()
        bounds = contained(page, '#results')
        sidebar = page.locator('#sidebar').bounding_box()
        assert bounds['x'] + bounds['width'] <= sidebar['x'] + sidebar['width']
        page.locator('.search-item').first.click()
        assert page.locator('#station-card').is_visible()
        contained(page, '#station-card')
        assert not page.locator('#viewport').evaluate('e=>e.inert')
        page.locator('#station-card [data-clear]').click()
        page.locator('#search').fill('') if not mobile else None
        page.locator('#scope-full').click()
        page.locator('#train-inspect').click()
        contained(page, '#train-card')
        bar = page.locator('.simulation-controls').bounding_box()
        card = page.locator('#train-card').bounding_box()
        assert card['y'] + card['height'] < bar['y'], (card, bar)
        if mobile and height > 600:
            page.wait_for_timeout(150)
            point = page.evaluate('''() => {
              const a=__SEOUL_APP__,h=a.getTrainHits().find(h=>h.train.id===a.state.selectedTrain);
              return h?{x:h.center.x,y:h.center.y}:null;
            }''')
            assert point
            viewport = page.locator('#viewport').bounding_box()
            assert viewport['y'] + point['y'] < card['y'], (point, card)
        page.screenshot(path=str(out / f'ui-final-train-{width}.png'))
        page.locator('#train-close').click()

        # One help dialog contains the simulation explanation and image export.
        page.locator('#live-badge').click()
        assert page.locator('#about-dialog').is_visible()
        assert page.locator('#simulation-info').get_attribute('open') is not None
        assert page.locator('#export').is_visible()
        page.locator('#close-about').click()
        page.locator('#theme-toggle').click()
        assert page.evaluate('SeoulTheme.current') == 'dark'
        page.screenshot(path=str(out / f'ui-final-dark-{width}.png'))
        if mobile:
            page.locator('#mobile-menu').click()
            page.keyboard.press('Escape')
            assert page.locator('#mobile-menu').get_attribute('aria-expanded') == 'false'
            assert not page.locator('#viewport').evaluate('e=>e.inert')
        assert not errors, errors
        assert not requests, requests
        print(f'PASS UI {width}x{height}: camera, search, selection, help, theme; no network', flush=True)
        page.close()
    browser.close()
