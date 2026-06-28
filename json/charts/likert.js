// @ts-check
// Likert chart: horizontal 100%-stacked bar across multiple qualitative variables sharing
// the same level set. Mirrors r.plot.likert. One row per variable on the y-axis; one
// stacked segment per shared level on each row (segment widths = within-variable %).
//
// Trigger from the driver:
//   - Profile A (predictors only, no responses)
//   - all predictors are type 'q'
//   - all predictors share the same level set (intersection-based; partial overlap rejected)
//   - options.chart_likert_enabled === true
// Falls back to per-predictor chart_q if any condition fails.
import { getThemePalette, wrapText } from './_shared.js';

/**
 * Diverging-friendly palette for stacked Likert levels. Uses 5 colors that read as a
 * gradient (negative → neutral → positive) for canonical 5-point scales; cycles for K!=5.
 */
const LIKERT_PALETTE_FALLBACK = ['#d62728', '#fdae61', '#cccccc', '#92c5de', '#1f77b4'];

/**
 * @param {Array<{label:string, values:Array<string|null|undefined>}>} vars Per-variable bundles.
 * @param {Record<string,any>=} options
 * @param {{levels?:string[]|null}=} meta Optional level order (left → right of bars); auto-inferred when omitted.
 * @returns {{type:string, spec:{data:any[], layout:any}}|null}
 */
export function chart_likert(vars, options = {}, meta = {}) {
  if (!Array.isArray(vars) || vars.length < 2) return null;

  // Determine shared levels: intersection of each variable's non-empty distinct values.
  // Declared meta.levels wins (allows custom ordering); otherwise infer by intersection.
  const declared = Array.isArray(meta?.levels) ? meta.levels.filter(Boolean) : null;
  const perVarSets = vars.map((v) => new Set((v.values || []).map((x) => String(x ?? '').trim()).filter(Boolean)));
  let levels;
  if (declared && declared.length) {
    levels = declared;
  } else if (perVarSets.length > 0) {
    // Intersection of all sets, sorted alphabetically.
    const first = perVarSets[0];
    levels = [...first].filter((lv) => perVarSets.every((s) => s.has(lv))).sort();
  } else {
    levels = [];
  }
  if (levels.length < 2) return null;

  // Per-variable percent breakdown.
  const labelWrap = Number.isFinite(Number(options.chart_x_label_wrap)) ? Number(options.chart_x_label_wrap) : 3;
  const themePalette = getThemePalette(options.chart_theme, levels.length);
  // Use the divergent palette when theme is 'gray' (default) AND we have ≤ palette size
  // so the canonical Likert look is preserved; otherwise stick with the themed colors.
  const palette = options.chart_theme === undefined || options.chart_theme === 'gray'
    ? levels.map((_, i) => LIKERT_PALETTE_FALLBACK[i % LIKERT_PALETTE_FALLBACK.length])
    : themePalette;

  /** @type {number[][]} per-level percentages, one row per variable */
  const pctMatrix = vars.map((v) => {
    const counts = new Array(levels.length).fill(0);
    let total = 0;
    (v.values || []).forEach((raw) => {
      const t = String(raw ?? '').trim();
      const idx = levels.indexOf(t);
      if (idx >= 0) { counts[idx] += 1; total += 1; }
    });
    return counts.map((c) => total > 0 ? (c / total) * 100 : 0);
  });

  const varLabels = vars.map((v) => wrapText(v.label, labelWrap));

  // One trace per level (stacked horizontally). y values are variable labels;
  // x values are the percentages for that level across each variable.
  /** @type {any[]} */
  const data = levels.map((lv, li) => ({
    type: 'bar',
    orientation: 'h',
    name: lv,
    y: varLabels,
    x: vars.map((_, vi) => pctMatrix[vi][li]),
    marker: { color: palette[li] },
    hovertemplate: `${lv}: %{x:.1f}%<extra></extra>`
  }));

  const layout = {
    barmode: 'stack',
    xaxis: { title: { text: '%' }, range: [0, 100], ticksuffix: '%' },
    yaxis: { title: { text: '' }, automargin: true, autorange: 'reversed' },
    margin: { t: 30, r: 30, b: 50, l: 140 },
    legend: { orientation: 'h', y: -0.2 },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff'
  };

  return { type: 'likert', spec: { data, layout } };
}
