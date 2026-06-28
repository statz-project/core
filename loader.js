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
 * Convert a single Plotly chart spec to a base64 image data URL via off-screen rendering.
 * Used by DOCX export pipelines (the natural client-side path: render → `Plotly.toImage` →
 * embed in document). Each call is self-contained — host div is created, plotted, captured,
 * and removed before resolving.
 *
 * @param {{ data: any[], layout?: any }} spec Plotly figure spec ({data, layout}).
 * @param {{ width?: number, height?: number, format?: 'png'|'svg'|'jpeg'|'webp' }=} options Render dimensions and output format. Defaults: 800×500 px PNG.
 * @returns {Promise<string>} Data URL (e.g., `data:image/png;base64,…`).
 */
export function chartSpecToImage(spec, options = {}) {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('chartSpecToImage requires a browser environment'));
  }
  const Plotly = /** @type {any} */ (typeof window !== 'undefined' ? /** @type {any} */ (window).Plotly : null);
  if (!Plotly || typeof Plotly.newPlot !== 'function' || typeof Plotly.toImage !== 'function') {
    return Promise.reject(new Error('window.Plotly not available; ensure loadPlotly() resolved before exporting.'));
  }
  if (!spec || !Array.isArray(spec.data)) {
    return Promise.reject(new Error('chartSpecToImage: invalid spec — expected {data: any[], layout?: any}.'));
  }
  const width = Number.isFinite(Number(options.width)) ? Number(options.width) : 800;
  const height = Number.isFinite(Number(options.height)) ? Number(options.height) : 500;
  const format = options.format || 'png';
  const host = document.createElement('div');
  host.style.cssText = `position:absolute;left:-9999px;top:-9999px;width:${width}px;height:${height}px;`;
  document.body.appendChild(host);
  return Plotly.newPlot(host, spec.data, spec.layout || {}, { displayModeBar: false, staticPlot: true })
    .then(() => Plotly.toImage(host, { format, width, height }))
    .finally(() => {
      try { Plotly.purge(host); } catch (_e) { /* ignore */ }
      host.remove();
    });
}

/**
 * Batch variant of `chartSpecToImage`. Renders serially (DOM manipulation is single-threaded
 * and parallel `newPlot` calls on hidden hosts have shown flakiness in practice).
 *
 * @param {Array<{ data:any[], layout?:any }>} specs
 * @param {{ width?:number, height?:number, format?:'png'|'svg'|'jpeg'|'webp' }=} options
 * @returns {Promise<string[]>} Array of data URLs in input order.
 */
export async function chartSpecsToImages(specs, options) {
  /** @type {string[]} */
  const out = [];
  if (!Array.isArray(specs)) return out;
  for (const spec of specs) {
    // eslint-disable-next-line no-await-in-loop
    out.push(await chartSpecToImage(spec, options));
  }
  return out;
}

/**
 * Walk a `runAnalysis(mode='chart')` result and produce an image-ready entry per chart cell.
 * Warning entries pass through with `image: null` and the translated `warning` string —
 * UI/DOCX assembly should render them as flagged blocks (same UX as the HTML grid).
 *
 * @param {{ analysis: Array<any> }} resultObj
 * @param {{ width?:number, height?:number, format?:'png'|'svg'|'jpeg'|'webp' }=} options
 * @returns {Promise<Array<{ predictor:string|null, response:string|null, image:string|null, warning:string|null }>>}
 */
export async function analysisResultToImages(resultObj, options) {
  /** @type {Array<{ predictor:string|null, response:string|null, image:string|null, warning:string|null }>} */
  const out = [];
  if (!resultObj || !Array.isArray(resultObj.analysis)) return out;
  for (const entry of resultObj.analysis) {
    const predictor = entry?.predictor ?? null;
    const response = entry?.response ?? null;
    if (entry?.table?.warning) {
      out.push({ predictor, response, image: null, warning: entry.table.warning });
      continue;
    }
    if (entry?.chart?.spec) {
      // eslint-disable-next-line no-await-in-loop
      const image = await chartSpecToImage(entry.chart.spec, options);
      out.push({ predictor, response, image, warning: null });
    }
  }
  return out;
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
