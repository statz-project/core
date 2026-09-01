// @ts-check
// Grouped bar chart for two qualitative variables (q × q). Mirrors r.plot.grouped_bar.
// x-axis: predictor levels. One bar per response level inside each group (barmode='group').
import { getThemePalette, wrapText, wrapTitle, formatBarLabel, resolveNumericAxisLabel, buildLegendLayout, getLegendLabelsWrap, resolveBarOrientation } from './_shared.js';
import factors from '../factors.js';

/**
 * @param {Array<string|null|undefined>} predictorVals
 * @param {Array<string|null|undefined>} responseVals
 * @param {Record<string,any>=} options
 * @param {{predictorLabel?:string, responseLabel?:string, predictorLabels?:string[]|null, responseLabels?:string[]|null}=} meta
 * @returns {{type:string, spec:{data:any[], layout:any}}|null}
 */
export function chart_q_q(predictorVals, responseVals, options = {}, meta = {}) {
  if (!Array.isArray(predictorVals) || !Array.isArray(responseVals)) return null;
  const len = Math.min(predictorVals.length, responseVals.length);
  /** @type {Record<string, Record<string, number>>} */
  const counts = {};
  /** @type {Record<string, number>} */
  const rowTotals = {};
  for (let i = 0; i < len; i++) {
    if (factors.isMissingValue(predictorVals[i]) || factors.isMissingValue(responseVals[i])) continue;
    const p = String(predictorVals[i]).trim();
    const r = String(responseVals[i]).trim();
    if (!counts[p]) counts[p] = {};
    counts[p][r] = (counts[p][r] || 0) + 1;
    rowTotals[p] = (rowTotals[p] || 0) + 1;
  }
  const presetPred = Array.isArray(meta.predictorLabels) ? meta.predictorLabels : null;
  const presetResp = Array.isArray(meta.responseLabels) ? meta.responseLabels : null;
  const predLevels = presetPred ?? Object.keys(counts).sort();
  // Response levels: collect from observed data, then dedupe and order.
  const respSet = new Set();
  predLevels.forEach((p) => Object.keys(counts[p] || {}).forEach((r) => respSet.add(r)));
  const respLevels = presetResp ?? [...respSet].sort();
  if (predLevels.length === 0 || respLevels.length === 0) return null;

  const labelFormat = ['n', 'p', 'np'].includes(options.chart_label_format) ? options.chart_label_format : 'n';
  const labelWrap = Number.isFinite(Number(options.chart_x_label_wrap)) ? Number(options.chart_x_label_wrap) : 3;
  const legendWrap = getLegendLabelsWrap(options);
  const palette = getThemePalette(options.chart_theme, respLevels.length);
  const predTicks = predLevels.map((l) => wrapText(l, labelWrap));
  // Same `auto` as every other bar chart: too many predictor levels, or labels too wide to sit
  // side by side once wrapped. `chart_bar_orientation` overrides it either way.
  const horizontal = resolveBarOrientation(predLevels, options) === 'h';

  /** @type {any[]} */
  const data = respLevels.map((resp, ri) => {
    const ys = predLevels.map((p) => counts[p]?.[resp] || 0);
    const text = ys.map((c, pi) => {
      const total = rowTotals[predLevels[pi]] || 0;
      const pct = total > 0 ? (c / total) * 100 : 0;
      return formatBarLabel(c, pct, /** @type {'n'|'p'|'np'} */ (labelFormat));
    });
    return {
      type: 'bar',
      // Trace name = legend entry — wrap per chart_legend_wrap so long response levels
      // don't blow up the legend width.
      name: wrapText(resp, legendWrap),
      orientation: horizontal ? 'h' : 'v',
      x: horizontal ? ys : predTicks,
      y: horizontal ? predTicks : ys,
      text,
      textposition: 'outside',
      cliponaxis: false,
      marker: { color: palette[ri] },
      hovertemplate: `${resp}: %{${horizontal ? 'x' : 'y'}}<extra></extra>`
    };
  });

  const layout = {
    barmode: 'group',
    // The categorical axis carries the predictor label and needs automargin for the wrapped
    // ticks; the numeric one is labelled per chart_label_format, matching the per-bar values.
    xaxis: horizontal
      ? { title: { text: resolveNumericAxisLabel(options) }, zeroline: false, rangemode: 'tozero' }
      : { title: { text: wrapTitle(meta.predictorLabel ?? '', options) }, automargin: true },
    yaxis: horizontal
      // Reversed so the first predictor level is the TOP bar — see buildBarSpec for why.
      ? { title: { text: wrapTitle(meta.predictorLabel ?? '', options) }, automargin: true, autorange: 'reversed' }
      : { title: { text: resolveNumericAxisLabel(options) }, zeroline: false, rangemode: 'tozero' },
    // margin.t 60 gives `textposition: outside` room above the tallest bar; horizontal moves that
    // need to the right edge and widens the left for the category ticks.
    margin: horizontal ? { t: 60, r: 60, b: 50, l: 100 } : { t: 60, r: 30, b: 80, l: 60 },
    // Legend layout: position (top/right/bottom), title visibility, and wrapping all
    // resolved by the shared helper from Analysis_options. Fixes the "legend takes
    // half the plot width" issue by defaulting to horizontal top orientation.
    legend: buildLegendLayout(options, { title: meta.responseLabel ?? '' }),
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff'
  };

  return { type: 'grouped_bar', spec: { data, layout } };
}
