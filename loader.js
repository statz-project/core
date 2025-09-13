// @ts-check
// Extracted and adapted from bubble/scripts_html/loader.html
import { loadScript } from './utils.js';

const CDN = {
  jstat: "https://cdn.jsdelivr.net/npm/jstat@1.9.6/dist/jstat.min.js",
  simplestats: "https://cdn.jsdelivr.net/npm/simple-statistics@7.8.3/dist/simple-statistics.min.js",
  jstat_alt: "https://unpkg.com/jstat@1.9.6/dist/jstat.min.js",
  simplestats_alt: "https://unpkg.com/simple-statistics@7.8.3/dist/simple-statistics.min.js",
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
      if (scriptEl) scriptEl.onerror = () => reject(new Error('Falha ao carregar: ' + src));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Quick readiness/health snapshot for loaded adapters.
 * @returns {{jStat:boolean,simpleStatistics:boolean,stdlib:boolean}}
 */
export function health() {
  const ns = (typeof window !== 'undefined' ? (window.Statz || window.Utils) : undefined) || {};
  return {
    jStat: !!ns.jStat,
    simpleStatistics: !!(typeof window !== 'undefined' && (window.ss || window.simpleStatistics) || ns.stdlibStats),
    stdlib: !!ns.stdlibStats
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
  return import('https://cdn.jsdelivr.net/gh/stdlib-js/stats@esm/index.mjs')
    .then(mod => { ns.stdlibStats = mod; })
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
    ns.stdlibStats = window.ss || window.simpleStatistics || ns.stdlibStats || null;
  }
}

/**
 * Convenience initializer: loadDeps then loadStdlibStats, return health.
 * @param {any=} nsArg Optional namespace to attach adapters to
 */
export async function initDeps(nsArg) {
  const ns = nsArg || (typeof window !== 'undefined' ? (window.Statz || window.Utils) : undefined) || {};
  await loadDeps(ns);
  await loadStdlibStats(ns);
  return health();
}
