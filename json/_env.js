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
  return g.ss || g.simpleStatistics || getNS().stdlibStats || null;
}

export function getStatsLib() {
  return getNS().stdlibStats || null;
}

export { formatNumberLocale, formatPValue, trimPunctuation };

