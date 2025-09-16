import { formatNumberLocale, formatPValue } from '../format_utils.js';
import { trimPunctuation } from '../string_utils.js';

export function getNS() {
  return (typeof globalThis !== 'undefined' && (globalThis.Statz || globalThis.Utils)) || {};
}

export function getJStat() {
  return (typeof globalThis !== 'undefined' && globalThis.jStat) || getNS().jStat;
}

export function getSS() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const ns = getNS();
  return ns.simpleStatistics || g.ss || g.simpleStatistics || ns.stdlibStats || null;
}

export function getStatsLib() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const ns = getNS();
  // Prefer stdlib; fall back to simple-statistics if necessary
  return ns.stdlibStats || ns.simpleStatistics || g.ss || g.simpleStatistics || null;
}

export { formatNumberLocale, formatPValue, trimPunctuation };
