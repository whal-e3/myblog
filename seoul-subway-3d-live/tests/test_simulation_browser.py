#!/usr/bin/env python3
"""Browser smoke test for the offline train simulation.

Run after `python3 tools/build.py dist/seoul-subway-3d-live.html`:
`python tests/test_simulation_browser.py dist/seoul-subway-3d-live.html --chromium /path/to/chromium`
No provider requests are allowed by this test.
"""
import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('html', type=Path)
parser.add_argument('--chromium', default='/usr/bin/chromium')
args = parser.parse_args()
html = args.html.read_text(encoding='utf-8')
clock = '2026-10-14T07:31:45Z'  # Thursday, 16:31 KST: every route has a daytime scenario.


def open_map(browser, *, mobile=False):
    page = browser.new_page(
        viewport={'width': 390 if mobile else 1440, 'height': 844 if mobile else 900},
        is_mobile=mobile,
        has_touch=mobile,
        reduced_motion='no-preference',
    )
    errors, requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    page.route('**/*', lambda route: route.abort())
    page.evaluate('''iso => {
      const fixed = Date.parse(iso);
      Date.now = () => fixed;
      window.__fetchAttempts = [];
      window.fetch = (...args) => {
        window.__fetchAttempts.push(String(args[0]));
        return Promise.reject(new Error('Network request forbidden in simulation test'));
      };
    }''', clock)
    page.set_content(html, wait_until='load')
    page.wait_for_function('!!window.__SEOUL_APP__ && document.querySelector("#loading").hidden')
    assert not errors, errors
    return page, errors, requests


def assert_offline(page, requests):
    assert not requests, f'External requests from standalone map: {requests}'
    attempts = page.evaluate('window.__fetchAttempts')
    assert not attempts, f'Simulation tried to call fetch: {attempts}'


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=args.chromium,
        headless=True,
        args=['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    )

    page, errors, requests = open_map(browser)
    coverage = page.evaluate('''() => {
      const app = window.__SEOUL_APP__, counts = app.simulation.lineCounts(Date.now());
      return {
        mapped: app.data.lines.length,
        activeRoutes: app.data.lines.filter(line => counts[line.id] > 0).length,
        count: app.simulation.activeCount(Date.now()),
        displayedCount: Number(document.querySelector('#live-count').textContent),
        sampledRoutes: window.SEOUL_TRAIN_PROFILE?.coverage.routes,
        typicalCoverage: window.SEOUL_TRAIN_PROFILE?.coverage.typicalCoverage,
      };
    }''')
    assert coverage['mapped'] == coverage['activeRoutes'] == 24, coverage
    assert coverage['count'] > 0 and coverage['displayedCount'] == coverage['count'], coverage
    assert coverage['sampledRoutes'] == 19 and coverage['typicalCoverage'] is False, coverage
    assert page.locator('.simulation-chip').is_visible()
    assert 'SIMULATED TRAINS · NOT LIVE' in page.locator('.simulation-chip').inner_text()
    assert 'SIMULATED' in page.locator('#live-badge-label').inner_text()
    assert_offline(page, requests)
    print('PASS: 24 daytime routes, explicit simulation labels, no network', coverage, flush=True)

    page.locator('#train-inspect').click()
    assert page.locator('#train-card').is_visible()
    assert 'SIMULATED POSITION · NOT LIVE' in page.locator('#train-model-status').inner_text()
    assert page.locator('#train-number').inner_text().startswith('SCENARIO ')
    assert 'not a provider report' in page.locator('#train-card .card-note').inner_text().lower()

    # Choose a train already between stations so a short wall-clock wait proves
    # the application animates its 3D pose, not merely its displayed clock.
    moving = page.evaluate('''() => {
      const app = window.__SEOUL_APP__;
      app.setMotion(false);
      app.setTrainClock(0);
      let chosen = null, best = 0;
      for (const train of app.fleet.trains) {
        if (!app.simulation.isActive(train)) continue;
        const a = app.simulation.pose(train, 0, .03), b = app.simulation.pose(train, 2000, .03);
        const distance = Math.hypot(b.x-a.x, b.z-a.z);
        if (distance > best) { chosen = train.id; best = distance; }
      }
      if (chosen !== null) app.selectTrain(chosen);
      return {id: chosen, expectedTwoSecondsKm: best};
    }''')
    assert moving['id'] is not None and moving['expectedTwoSecondsKm'] > .003, moving
    assert page.locator('#train-card').is_visible()
    before = page.evaluate('''() => {
      const app=window.__SEOUL_APP__, train=app.fleet.trains[app.state.selectedTrain];
      const pose=app.simulation.pose(train, app.getTrainClock(), .03);
      return {clock:app.getTrainClock(), x:pose.x, z:pose.z};
    }''')
    page.locator('#live-toggle').click()  # Resume motion.
    assert page.locator('#live-toggle').get_attribute('aria-pressed') == 'true'
    page.wait_for_timeout(1400)
    after = page.evaluate('''() => {
      const app=window.__SEOUL_APP__, train=app.fleet.trains[app.state.selectedTrain];
      const pose=app.simulation.pose(train, app.getTrainClock(), .03);
      return {clock:app.getTrainClock(), x:pose.x, z:pose.z};
    }''')
    displacement = ((after['x'] - before['x'])**2 + (after['z'] - before['z'])**2)**.5
    assert after['clock'] - before['clock'] > 700, (before, after)
    assert displacement > .0005, (displacement, before, after)

    page.locator('#live-toggle').click()  # Pause motion.
    assert page.locator('#live-toggle').get_attribute('aria-pressed') == 'false'
    paused = page.evaluate('''() => {
      const app=window.__SEOUL_APP__, train=app.fleet.trains[app.state.selectedTrain];
      const pose=app.simulation.pose(train, app.getTrainClock(), .03);
      return {clock:app.getTrainClock(), x:pose.x, z:pose.z};
    }''')
    page.wait_for_timeout(450)
    still = page.evaluate('''() => {
      const app=window.__SEOUL_APP__, train=app.fleet.trains[app.state.selectedTrain];
      const pose=app.simulation.pose(train, app.getTrainClock(), .03);
      return {clock:app.getTrainClock(), x:pose.x, z:pose.z};
    }''')
    assert still == paused, (paused, still)
    page.locator('#live-badge').click()
    page.locator('#live-refresh').click()
    page.locator('#close-about').click()
    assert page.evaluate('__SEOUL_APP__.getTrainClock()') == 0
    assert 'SIMULATED POSITION · NOT LIVE' in page.locator('#train-model-status').inner_text()
    assert_offline(page, requests)
    assert not errors, errors
    print('PASS: train inspector, motion, pause, restart, no network', flush=True)
    page.close()

    mobile, mobile_errors, mobile_requests = open_map(browser, mobile=True)
    badge = mobile.locator('.simulation-chip')
    assert badge.is_visible()
    assert 'SIMULATED TRAINS · NOT LIVE' in badge.inner_text()
    rect = badge.bounding_box()
    viewport = mobile.locator('#viewport').bounding_box()
    assert rect and viewport and rect['x'] >= viewport['x'] and rect['y'] >= viewport['y']
    assert rect['x'] + rect['width'] <= viewport['x'] + viewport['width']
    assert rect['y'] + rect['height'] <= viewport['y'] + viewport['height']
    assert_offline(mobile, mobile_requests)
    assert not mobile_errors, mobile_errors
    print('PASS: persistent mobile simulated/not-live disclosure, no network', flush=True)
    mobile.close()
    browser.close()
