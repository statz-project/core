// @ts-check
// Univariate list-variable bar chart. Mirrors r.plot.multi.values.barplot.
// Each row may carry multiple items separated by `sep`; we count item occurrences and
// render one bar per item. Percentages (when chart_label_format='p'|'np') are over the
// total number of rows, so they can sum to more than 100% if items co-occur — same
// semantic as the R reference (total_override = nrow(data)).
import { buildBarSpec } from './_shared.js';

/**
 * @param {Array<string|null|undefined>} values
 * @param {string=} sep
 * @param {Record<string,any>=} options
 * @param {{varLabel?:string}=} meta
 * @returns {{type:string, spec:{data:any[], layout:any}}|null}
 */
export function chart_l(values, sep = ';', options = {}, meta = {}) {
  if (!Array.isArray(values)) return null;
  /** @type {Record<string, number>} */
  const freq = {};
  const total = values.length;
  values.forEach((raw) => {
    const v = String(raw ?? '').trim();
    if (!v) return;
    v.split(sep).map((s) => s.trim()).filter(Boolean).forEach((item) => {
      freq[item] = (freq[item] || 0) + 1;
    });
  });
  // Sort by frequency desc, ties broken alphabetically (matches summarize_l).
  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (entries.length === 0) return null;
  const labels = entries.map(([l]) => l);
  const counts = entries.map(([, c]) => c);
  return buildBarSpec({ labels, counts, total, options, meta });
}
