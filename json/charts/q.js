// @ts-check
// Univariate qualitative bar chart. Mirrors r.plot.barplot.
import { buildBarSpec } from './_shared.js';
import { getDefaultMissingLabel, normalizeLanguage } from '../../i18n/index.js';
import factors from '../factors.js';

/**
 * Build a Plotly bar spec for a qualitative variable.
 *
 * @param {Array<string|null|undefined>} values
 * @param {Record<string,any>=} options Normalized analysis options (chart_*, missing_label, include_missing, lang).
 * @param {{varLabel?:string, labels?:string[]|null}=} meta `labels` (when provided) preserves the factor order from col_values.labels; otherwise sorted by frequency desc.
 * @returns {{type:string, spec:{data:any[], layout:any}}|null} Null when there are no values to plot.
 */
export function chart_q(values, options = {}, meta = {}) {
  if (!Array.isArray(values)) return null;
  const lang = normalizeLanguage(options.lang);
  const includeMissing = options.include_missing !== false;
  const missingLabel = options.missing_label ?? getDefaultMissingLabel(lang);
  /** @type {Record<string, number>} */
  const freq = {};
  let missing = 0;
  const total = values.length;
  values.forEach((raw) => {
    if (factors.isMissingValue(raw)) { missing += 1; return; }
    const v = String(raw).trim();
    freq[v] = (freq[v] || 0) + 1;
  });
  const presetLabels = Array.isArray(meta.labels) ? meta.labels : null;
  /** @type {string[]} */
  let labels;
  /** @type {number[]} */
  let counts;
  if (presetLabels) {
    labels = presetLabels.slice();
    counts = labels.map((l) => freq[l] || 0);
  } else {
    // Sort by frequency desc, ties broken alphabetically.
    const entries = Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    labels = entries.map(([l]) => l);
    counts = entries.map(([, c]) => c);
  }
  if (includeMissing && missing > 0) {
    labels.push(missingLabel);
    counts.push(missing);
  }
  if (labels.length === 0) return null;
  return buildBarSpec({ labels, counts, total, options, meta });
}
