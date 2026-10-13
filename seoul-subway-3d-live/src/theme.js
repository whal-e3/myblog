/* Seoul Subsurface — appearance preferences, MIT.
 * Run synchronously in <head>, before styles, to avoid a light flash on startup.
 * No network requests. Storage failures never prevent the atlas from opening.
 */
(() => {
  'use strict';
  const KEY = 'seoul-subsurface-theme';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = value => value === 'light' || value === 'dark';
  let preference = 'system';
  try {
    const stored = localStorage.getItem(KEY);
    if (valid(stored)) preference = stored;
  } catch (_) { /* Storage can be blocked in private or embedded browser contexts. */ }

  // All geographic route and rolling-stock tint colors stay in network.js.
  // These palettes affect the ground plane, labels, selection, and export only.
  const palettes = Object.freeze({
    light: Object.freeze({
      background: '#f3f7fc', grid: '#678cba', gridAlpha: .075,
      water: '#c4ddf3', waterEdge: '#7ba9d0', waterEdgeAlpha: .35,
      boundary: '#6b8daf', boundaryAlpha: .10, seoul: '#4276a5', seoulAlpha: .40,
      connector: '#507dab', connectorAlpha: .33, trackCasing: '#ffffffd9',
      stationCenter: '#f8fbff', stationRing: '#173f6d', stationFill: '#ffffff',
      accent: '#0052a4', selectedLabel: '#003c7e', cityLabel: '#718fae',
      majorLabel: '#285279', label: '#57718c', miniMuted: '#c8d6e5',
      miniFill: '#0052a40d', exportText: '#53708f', previewGrid: '#0052a438'
    }),
    dark: Object.freeze({
      background: '#081726', grid: '#6691bd', gridAlpha: .14,
      water: '#143751', waterEdge: '#44759d', waterEdgeAlpha: .46,
      boundary: '#6484a3', boundaryAlpha: .16, seoul: '#6d9ac3', seoulAlpha: .48,
      connector: '#85abd0', connectorAlpha: .43, trackCasing: '#aaccec25',
      stationCenter: '#dbeeff', stationRing: '#dbeeff', stationFill: '#0c2035',
      accent: '#78bcff', selectedLabel: '#9ad0ff', cityLabel: '#809cb8',
      majorLabel: '#d6e5f5', label: '#a9bfd5', miniMuted: '#314b65',
      miniFill: '#78bcff18', exportText: '#a9bfd5', previewGrid: '#78bcff32'
    })
  });
  let current = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;

  function syncControls() {
    const button = document.getElementById('theme-toggle');
    if (button) {
      const next = current === 'dark' ? 'light' : 'dark';
      const label = next === 'dark' ? 'Dark mode' : 'Light mode';
      button.setAttribute('aria-label', `Switch to ${next} mode`);
      button.title = `Switch to ${next} mode`;
      button.dataset.currentTheme = current;
      document.getElementById('theme-label').textContent = label;
    }
    const select = document.getElementById('theme-preference');
    if (select) select.value = preference;
  }

  function apply() {
    current = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    root.dataset.theme = current;
    root.dataset.themePreference = preference;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = current === 'dark' ? '#0d1d30' : '#0052a4';
    syncControls();
    window.dispatchEvent(new CustomEvent('seoul:themechange', {
      detail: { theme: current, preference }
    }));
  }

  function set(next) {
    if (!valid(next) && next !== 'system') return;
    preference = next;
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch (_) { /* Keep the choice for this page even without persistent storage. */ }
    apply();
  }
  function toggle() { set(current === 'dark' ? 'light' : 'dark'); }
  window.SeoulTheme = Object.freeze({
    get current() { return current; },
    get preference() { return preference; },
    get palette() { return palettes[current]; },
    set, toggle, storageKey: KEY
  });
  apply();
  const followSystem = () => { if (preference === 'system') apply(); };
  if (system.addEventListener) system.addEventListener('change', followSystem);
  else system.addListener(followSystem);
  // A theme selection made in another tab also updates this tab, without reloading.
  window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : 'system';
    apply();
  });
  function bind() {
    document.getElementById('theme-toggle')?.addEventListener('click', toggle);
    document.getElementById('theme-preference')?.addEventListener('change', event => set(event.target.value));
    syncControls();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
