// @ts-check
// Extracted and adapted from bubble/scripts_html/loader.html
import { loadScript } from './utils.js';

const CDN = {
  jstat: "https://cdn.jsdelivr.net/npm/jstat@1.9.6/dist/jstat.min.js",
  simplestats: "https://cdn.jsdelivr.net/npm/simple-statistics@7.8.3/dist/simple-statistics.min.js",
  plotly: "https://cdn.jsdelivr.net/npm/plotly.js-cartesian-dist-min@2.35.2/plotly-cartesian.min.js",
  jstat_alt: "https://unpkg.com/jstat@1.9.6/dist/jstat.min.js",
  simplestats_alt: "https://unpkg.com/simple-statistics@7.8.3/dist/simple-statistics.min.js",
  plotly_alt: "https://unpkg.com/plotly.js-cartesian-dist-min@2.35.2/plotly-cartesian.min.js",
};

/**
 * Promise-based loader for external scripts (compatible with Bubble free plan).
 * @param {string} src
 * @returns {Promise<string>}
 */
export function loadScriptP(src) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof document !== 'undefined' && document.querySelector('script[src="' + src + '"]')) return resolve('cached');
      loadScript(src, () => resolve(src));
      const scriptEl = typeof document !== 'undefined' && document.querySelector('head script[src="' + src + '"]');
      if (scriptEl) scriptEl.onerror = () => reject(new Error('Loading fail: ' + src));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Quick readiness/health snapshot for loaded adapters.
 * @returns {{jStat:boolean,simpleStatistics:boolean,stdlib:boolean,plotly:boolean}}
 */
export function health() {
  const ns = (typeof window !== 'undefined' ? (window.Statz || window.Utils) : undefined) || {};
  const plotlyRef = ns.plotly || (typeof window !== 'undefined' ? /** @type {any} */ (window).Plotly : null);
  return {
    jStat: !!ns.jStat,
    simpleStatistics: !!(ns.simpleStatistics || (typeof window !== 'undefined' && (window.ss || window.simpleStatistics))),
    stdlib: !!(ns.stdlibStats && typeof ns.stdlibStats.chi2test === 'function'),
    plotly: !!(plotlyRef && typeof plotlyRef.newPlot === 'function')
  };
}

/**
 * Dynamically import stdlib-js stats module (ESM) if not present.
 * @param {any=} nsArg Optional namespace to attach to
 * @returns {Promise<'ok'|void>}
 */
export function loadStdlibStats(nsArg) {
  const ns = nsArg || (typeof window !== 'undefined' ? (window.Statz || window.Utils) : undefined) || {};
  if (ns.stdlibStats) return Promise.resolve('ok');
  // Use jsDelivr's +esm endpoint so nested imports stay pinned to npm versions.
  return import('https://cdn.jsdelivr.net/npm/@stdlib/stats@0.3.2/+esm')
    .then(mod => { ns.stdlibStats = mod?.default || mod; })
    .catch(e => { console.warn('Stdlib failed; going without it:', e); });
}

/**
 * Load external deps (jStat, simple-statistics) from CDN with fallbacks.
 * @param {any=} nsArg Optional namespace to attach adapters to
 */
export async function loadDeps(nsArg) {
  const ns = nsArg || (typeof window !== 'undefined' ? (window.Statz || window.Utils) : undefined) || {};
  try {
    await Promise.all([
      loadScriptP(CDN.jstat),
      loadScriptP(CDN.simplestats)
    ]);
  } catch (e) {
    console.warn('First CDN failed; using fallbacks.', e);
    await Promise.all([
      loadScriptP(CDN.jstat_alt),
      loadScriptP(CDN.simplestats_alt)
    ]);
  }
  if (typeof window !== 'undefined') {
    ns.jStat = window.jStat || null;
    // Keep simple-statistics separate to avoid overwriting stdlib
    ns.simpleStatistics = window.ss || window.simpleStatistics || ns.simpleStatistics || null;
  }
}

/**
 * Load Plotly (cartesian-dist-min) from CDN with fallback. Plotly attaches itself to
 * window.Plotly; we mirror it to `ns.plotly` for parity with other adapters and so that
 * health() can detect it without touching the global directly.
 * @param {any=} nsArg Optional namespace to attach to
 * @returns {Promise<string|void>}
 */
export function loadPlotly(nsArg) {
  const ns = nsArg || (typeof window !== 'undefined' ? (window.Statz || window.Utils) : undefined) || {};
  if (ns.plotly) return Promise.resolve('ok');
  return loadScriptP(CDN.plotly)
    .catch(() => loadScriptP(CDN.plotly_alt))
    .then(() => {
      if (typeof window !== 'undefined') {
        ns.plotly = /** @type {any} */ (window).Plotly || null;
      }
      return 'ok';
    })
    .catch(e => { console.warn('Plotly failed; chart rendering will be unavailable:', e); });
}

/**
 * Browser-side helper to render Plotly chart specs emitted by `runAnalysis(mode='chart')`
 * after the `exportCombinedAsChartHTML` output has been mounted to the DOM. Sweeps
 * `.statz-chart` placeholders inside `rootEl` (defaults to `document`), parses each
 * `data-spec` attribute as JSON, and invokes `Plotly.newPlot`. Idempotent — already
 * rendered cells (marked via `data-rendered="1"`) are skipped on subsequent calls.
 *
 * @param {ParentNode=} rootEl Optional container; defaults to `document`.
 * @returns {{ rendered:number, skipped:number, failed:number }}
 */
export function renderCharts(rootEl) {
  const summary = { rendered: 0, skipped: 0, failed: 0 };
  if (typeof document === 'undefined') return summary;
  const Plotly = /** @type {any} */ (typeof window !== 'undefined' ? /** @type {any} */ (window).Plotly : null);
  if (!Plotly || typeof Plotly.newPlot !== 'function') {
    console.warn('renderCharts: window.Plotly not available; ensure loadPlotly() resolved.');
    return summary;
  }
  const root = rootEl || document;
  const cells = root.querySelectorAll('.statz-chart');
  cells.forEach((/** @type {any} */ div) => {
    if (div.dataset && div.dataset.rendered === '1') { summary.skipped += 1; return; }
    try {
      const specRaw = div.getAttribute('data-spec');
      if (!specRaw) { summary.failed += 1; return; }
      const spec = JSON.parse(specRaw);
      Plotly.newPlot(div, spec.data, spec.layout, { responsive: true, displayModeBar: false });
      if (div.dataset) div.dataset.rendered = '1';
      summary.rendered += 1;
    } catch (e) {
      summary.failed += 1;
      console.error('renderCharts: failed to render chart cell', e);
    }
  });
  return summary;
}

/**
 * Convenience initializer: loadDeps then loadStdlibStats then loadPlotly, return health.
 * @param {any=} nsArg Optional namespace to attach adapters to
 */
export async function initDeps(nsArg) {
  const ns = nsArg || (typeof window !== 'undefined' ? (window.Statz || window.Utils) : undefined) || {};
  await loadDeps(ns);
  await loadStdlibStats(ns);
  await loadPlotly(ns);
  return health();
}
