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
import { getThemePalette, wrapText, buildLegendLayout, getLegendLabelsWrap, formatBarLabel } from './_shared.js';
import { normalizeLanguage, translate } from '../../i18n/index.js';

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

  // Counts are kept alongside the percentages: `chart_label_format` can ask for 'n' or 'np', and a
  // 100%-stacked bar that could only ever report its own percentage would leave two thirds of that
  // option meaningless.
  /** @type {number[][]} */
  const countMatrix = [];
  /** @type {number[][]} per-level percentages, one row per variable */
  const pctMatrix = vars.map((v) => {
    const counts = new Array(levels.length).fill(0);
    let total = 0;
    (v.values || []).forEach((raw) => {
      const t = String(raw ?? '').trim();
      const idx = levels.indexOf(t);
      if (idx >= 0) { counts[idx] += 1; total += 1; }
    });
    countMatrix.push(counts);
    return counts.map((c) => total > 0 ? (c / total) * 100 : 0);
  });

  const varLabels = vars.map((v) => wrapText(v.label, labelWrap));
  const legendWrap = getLegendLabelsWrap(options);
  const lang = normalizeLanguage(options.lang);
  const labelFormat = options.chart_label_format ?? 'n';
  const titleWrap = Number.isFinite(Number(options.chart_title_wrap)) ? Number(options.chart_title_wrap) : 8;

  // One trace per level (stacked horizontally). y values are variable labels;
  // x values are the percentages for that level across each variable.
  /** @type {any[]} */
  const data = levels.map((lv, li) => ({
    type: 'bar',
    orientation: 'h',
    name: wrapText(lv, legendWrap),
    y: varLabels,
    x: vars.map((_, vi) => pctMatrix[vi][li]),
    marker: { color: palette[li] },
    // Empty segments get no label: a 0 printed on a zero-width slice lands on its neighbours.
    // Everything else is labelled inside the segment, the only place a 100%-stacked bar has room.
    text: vars.map((_, vi) => (countMatrix[vi][li] > 0
      ? formatBarLabel(countMatrix[vi][li], pctMatrix[vi][li], labelFormat, lang)
      : '')),
    textposition: 'inside',
    insidetextanchor: 'middle',
    textfont: { size: 10 },
    hovertemplate: `${lv}: %{x:.1f}%<extra></extra>`
  }));

  const layout = {
    barmode: 'stack',
    xaxis: { title: { text: '%' }, range: [0, 100], ticksuffix: '%' },
    // One variable per row, so the axis title is the generic "Variable" — naming any single one
    // would be wrong for the others, the reasoning `chart_paired_n` applies to its moments. It also
    // gives `chart_show_yaxis_title` and `chart_title_wrap` something to act on: both were offered
    // for this chart and could do nothing, the title being an empty string.
    yaxis: {
      title: { text: wrapText(translate('chart.axisLabels.variable', lang), titleWrap) },
      automargin: true,
      autorange: 'reversed'
    },
    // A FLOOR, not a reservation. `yaxis.automargin` is on, so Plotly grows the left margin to
    // whatever the variable labels actually need; the only thing this number can do is stop it
    // shrinking below itself. At 140 — the widest floor of any builder, the others sitting between
    // 60 and 100 — a chart of short names ("Q1", "Q2") paid for labels it does not have, and every
    // pixel of that is taken off the plot area, which is also the width a centred horizontal legend
    // wraps within. 70 matches the text-labelled builders and leaves the sizing to the thing that
    // can measure. Long labels are unaffected: automargin asks for what it asks for either way.
    margin: { t: 30, r: 30, b: 50, l: 70 },
    // Legend layout: uses the same helper as chart_q_q / chart_paired_q. Likert had no
    // conceptual "group variable" title (levels ARE the categories), so no meta.title
    // is passed — the title stays empty even when chart_show_legend_title is true.
    // `traceorder: 'normal'` is a correction, not a preference. Plotly forces `'reversed'` on any
    // bar trace under `barmode: 'stack'`:
    //     (traceIs(trace, 'bar') && barmode === 'stack') && (traceorder = 'reversed')
    // which is right for a VERTICAL stack — the first trace sits at the bottom, so a legend read
    // top-to-bottom matches the column. This stack is horizontal: the first trace is the LEFTMOST
    // segment, and reversing makes the legend run right-to-left against the bars and against the
    // level order the factor defines. The chart is the only stacked one in the codebase, which is
    // why this lives here rather than in `buildLegendLayout`.
    legend: { ...buildLegendLayout(options, {}), traceorder: 'normal' },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff'
  };

  return { type: 'likert', spec: { data, layout } };
}
