// @ts-check
// Paired binary qualitative chart (Profile B): K moments × 2 binary levels.
// Grouped bar with moments on the x-axis and one trace per binary level.
// Mirrors r.plot.grouped_bar applied to a paired dataset.
import { getThemePalette, wrapText, formatBarLabel, resolveNumericAxisLabel, resolveMomentAxisLabel, buildLegendLayout, getLegendLabelsWrap, resolveBarOrientation } from './_shared.js';

/**
 * @param {Array<Array<string|null|undefined>>} responses K arrays of binary values; one per moment.
 * @param {string[]} labels Moment labels.
 * @param {Record<string,any>=} options
 * @param {{levels?:string[]|null, qualitativeLabel?:string}=} meta `levels` (when provided) preserves the binary pair order; otherwise inferred from the union of observed non-empty values.
 * @returns {{type:string, spec:{data:any[], layout:any}}|null}
 */
export function chart_paired_q(responses, labels, options = {}, meta = {}) {
  if (!Array.isArray(responses) || responses.length < 2) return null;
  const K = responses.length;

  // Determine the two binary levels: declared meta.levels wins; otherwise use the
  // UNION of distinct non-empty values across all responses (handles monovariate
  // baseline — e.g., all 'no' at T0 before any switch).
  const declared = Array.isArray(meta?.levels) ? meta.levels.filter(Boolean) : [];
  const inferred = declared.length === 2
    ? declared
    : [...new Set(responses.flatMap((r) => r.map((v) => String(v ?? '').trim())).filter(Boolean))].sort();
  if (inferred.length !== 2) return null;
  const binaryLevels = inferred;

  // Per-moment counts of each binary level (complete-case per moment — paired alignment
  // is not required at the visualization layer; the bar heights are simple counts).
  /** @type {number[][]} */
  const countsPerMoment = responses.map((col) => {
    const out = [0, 0];
    col.forEach((raw) => {
      const v = String(raw ?? '').trim();
      const idx = binaryLevels.indexOf(v);
      if (idx >= 0) out[idx] += 1;
    });
    return out;
  });

  const labelFormat = ['n', 'p', 'np'].includes(options.chart_label_format) ? options.chart_label_format : 'n';
  const labelWrap = Number.isFinite(Number(options.chart_x_label_wrap)) ? Number(options.chart_x_label_wrap) : 3;
  const legendWrap = getLegendLabelsWrap(options);
  const palette = getThemePalette(options.chart_theme, 2);
  const momentTicks = labels.map((l) => wrapText(l, labelWrap));
  // Moments are the categories here, so they drive the same `auto` heuristic as any other bar.
  const horizontal = resolveBarOrientation(labels, options) === 'h';

  /** @type {any[]} */
  const data = binaryLevels.map((level, li) => {
    const ys = countsPerMoment.map((c) => c[li]);
    const text = ys.map((c, mi) => {
      const total = countsPerMoment[mi].reduce((a, b) => a + b, 0);
      const pct = total > 0 ? (c / total) * 100 : 0;
      return formatBarLabel(c, pct, /** @type {'n'|'p'|'np'} */ (labelFormat));
    });
    return {
      type: 'bar',
      name: wrapText(level, legendWrap),
      orientation: horizontal ? 'h' : 'v',
      x: horizontal ? ys : momentTicks,
      y: horizontal ? momentTicks : ys,
      text,
      textposition: 'outside',
      cliponaxis: false,
      marker: { color: palette[li] },
      hovertemplate: `${level}: %{${horizontal ? 'x' : 'y'}}<extra></extra>`
    };
  });

  const layout = {
    barmode: 'group',
    // Whichever way round it sits, the categorical axis is named for what the categories are
    // (the moments) and the other carries the count/percent label. It used to emit an EMPTY
    // title here: `chart_show_xaxis_title` then had nothing to hide, yet the driver still
    // reclaimed 25px of margin when switched off — so the ON state showed a band of blank
    // space below the ticks that the OFF state did not.
    xaxis: horizontal
      ? { title: { text: resolveNumericAxisLabel(options) }, zeroline: false, rangemode: 'tozero' }
      : { title: { text: resolveMomentAxisLabel(options) }, automargin: true },
    yaxis: horizontal
      // Reversed so the moments read top-down in order, not bottom-up — see buildBarSpec.
      ? { title: { text: resolveMomentAxisLabel(options) }, automargin: true, autorange: 'reversed' }
      : { title: { text: resolveNumericAxisLabel(options) }, zeroline: false, rangemode: 'tozero' },
    margin: horizontal ? { t: 60, r: 60, b: 50, l: 100 } : { t: 60, r: 30, b: 80, l: 60 },
    legend: buildLegendLayout(options, { title: meta.qualitativeLabel ?? '' }),
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff'
  };

  return { type: 'paired_grouped_bar', spec: { data, layout } };
}
