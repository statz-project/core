// @ts-check
// Grouped bar chart for two qualitative variables (q × q). Mirrors r.plot.grouped_bar.
// x-axis: predictor levels. One bar per response level inside each group (barmode='group').
import { getThemePalette, wrapText, formatBarLabel, resolveNumericAxisLabel } from './_shared.js';

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
    const p = String(predictorVals[i] ?? '').trim();
    const r = String(responseVals[i] ?? '').trim();
    if (!p || !r) continue;
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
  const palette = getThemePalette(options.chart_theme, respLevels.length);
  const predTicks = predLevels.map((l) => wrapText(l, labelWrap));

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
      name: resp,
      x: predTicks,
      y: ys,
      text,
      textposition: 'outside',
      cliponaxis: false,
      marker: { color: palette[ri] },
      hovertemplate: `${resp}: %{y}<extra></extra>`
    };
  });

  const layout = {
    barmode: 'group',
    xaxis: { title: { text: meta.predictorLabel ?? '' }, automargin: true },
    // Numeric axis (bar height) labeled per chart_label_format — matches the per-bar
    // value labels above each bar. Previously untitled — reader had to infer the quantity.
    yaxis: { title: { text: resolveNumericAxisLabel(options) }, zeroline: false, rangemode: 'tozero' },
    // margin.t 60: gives room for `textposition: outside` count/percent labels above
    // the tallest bar (30px default clips them in ~400px containers).
    margin: { t: 60, r: 30, b: 80, l: 60 },
    legend: { title: { text: meta.responseLabel ?? '' }, orientation: 'v' },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff'
  };

  return { type: 'grouped_bar', spec: { data, layout } };
}
