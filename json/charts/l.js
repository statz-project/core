// @ts-check
// Univariate list-variable bar chart. Mirrors r.plot.multi.values.barplot.
// Each row may carry multiple items separated by `sep`; we count item occurrences and
// render one bar per item. Percentages (when chart_label_format='p'|'np') are over the
// total number of rows, so they can sum to more than 100% if items co-occur — same
// semantic as the R reference (total_override = nrow(data)).
import { buildBarSpec } from './_shared.js';
import { getDefaultMissingLabel, normalizeLanguage } from '../../i18n/index.js';
import factors from '../factors.js';

/**
 * @param {Array<string|null|undefined>} values
 * @param {string=} sep
 * @param {Record<string,any>=} options Normalized analysis options (chart_*, missing_label, include_missing, lang).
 * @param {{varLabel?:string}=} meta
 * @returns {{type:string, spec:{data:any[], layout:any}}|null}
 */
export function chart_l(values, sep = ';', options = {}, meta = {}) {
  if (!Array.isArray(values)) return null;
  const lang = normalizeLanguage(options.lang);
  const includeMissing = options.include_missing !== false;
  const missingLabel = options.missing_label ?? getDefaultMissingLabel(lang);
  /** @type {Record<string, number>} */
  const freq = {};
  // A row counts as missing only when the WHOLE cell is empty — `isMissingValue` with col_type
  // 'l' covers both a blank cell and a separator-only one (';'). Same guard `summarize_l` uses,
  // so the chart's missing bar and the table's missing row are always the same number. This
  // branch used to `return` and discard the row, which left `include_missing` inert on the
  // chart while the table honoured it.
  let missing = 0;
  const total = values.length;
  values.forEach((raw) => {
    if (factors.isMissingValue(raw, 'l', sep)) { missing += 1; return; }
    String(raw).trim().split(sep).map((s) => s.trim()).filter(Boolean).forEach((item) => {
      freq[item] = (freq[item] || 0) + 1;
    });
  });
  // Sort by frequency desc, ties broken alphabetically (matches summarize_l).
  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const labels = entries.map(([l]) => l);
  const counts = entries.map(([, c]) => c);
  // Appended last, after the frequency sort, so it never competes for a rank with a real item.
  if (includeMissing && missing > 0) {
    labels.push(missingLabel);
    counts.push(missing);
  }
  // Checked after the append, not before: a column whose every row is empty still has a missing
  // bar to draw, and returning null there would blank a chart the table renders fine.
  if (labels.length === 0) return null;
  return buildBarSpec({ labels, counts, total, options, meta });
}
