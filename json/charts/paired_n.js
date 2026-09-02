// @ts-check
// Paired numeric chart (Profile B): K moments × N subjects, complete-case row alignment.
// Each subject's points are connected by a line across moments (deterministic jitter
// keeps the line aligned through the same subject's positions). Mean crossbar per
// moment; optional boxplot overlay per moment.
//
// Mirrors r.plot.individual_values(paired=TRUE).
import variants from '../variants.js';
import { resolveTheme, wrapText, computeCenter, resolveMomentAxisLabel, resolveValueAxisLabel } from './_shared.js';

/** @param {number} i */
function deterministicJitter(i) {
  const v = ((i * 9301 + 49297) % 233280) / 233280;
  return v - 0.5;
}

const PAIRED_LINE_COLOR = '#1f77b4';
const PAIRED_LINE_ALPHA = 0.4;

/**
 * @param {Array<Array<string|number|null|undefined>>} responses K arrays of values; one per moment.
 * @param {string[]} labels Moment labels (one per response column).
 * @param {Record<string,any>=} options Normalized analysis options (chart_*).
 * @param {{}=} meta Unused. The value axis is labelled generically — see the layout below.
 * @returns {{type:string, spec:{data:any[], layout:any}}|null}
 */
export function chart_paired_n(responses, labels, options = {}, meta = {}) {
  if (!Array.isArray(responses) || responses.length < 2) return null;
  const K = responses.length;
  const len = Math.min(...responses.map((r) => r?.length ?? 0));
  if (len < 1) return null;

  // Complete-case alignment: keep only rows where all K values parse as finite numbers.
  /** @type {number[][]} */
  const aligned = Array.from({ length: K }, () => []);
  for (let i = 0; i < len; i++) {
    /** @type {number[]} */
    const row = [];
    let ok = true;
    for (let k = 0; k < K; k++) {
      const raw = responses[k][i];
      const sanitized = typeof raw === 'string' ? variants.sanitizeNumericString(raw) : String(raw ?? '');
      const val = Number.parseFloat(sanitized);
      if (!Number.isFinite(val)) { ok = false; break; }
      row.push(val);
    }
    if (ok) for (let k = 0; k < K; k++) aligned[k].push(row[k]);
  }
  const nSubjects = aligned[0].length;
  if (nSubjects < 1) return null;

  const theme = resolveTheme(options.chart_theme);
  const pointSize = Number.isFinite(Number(options.chart_point_size)) ? Number(options.chart_point_size) : 8;
  const showBox = options.chart_show_boxplot === true;
  const showLines = options.chart_paired_show_lines !== false;
  // Points+crossbar layer: gates markers AND per-moment central-tendency crossbar.
  // Subject lines (chart_paired_show_lines) stay independently gated — a valid layout
  // is "spaghetti lines only" (showLines=true, showPoints=false).
  const showPoints = options.chart_show_points !== false;
  const centerMode = options.chart_central_tendency === 'median' ? 'median' : 'mean';
  // Default OFF: a numeric variable is not assumed to be a magnitude measured from zero.
  // Weights in the 60-90 range, or ages, would have all their variation squeezed into the top
  // of the plot. Only the point/scatter charts read this — the bar families pin
  // `rangemode: 'tozero'` unconditionally, since a bar's length IS its magnitude and a
  // truncated baseline would misstate it.
  const includeZero = options.chart_include_zero === true;
  const labelWrap = Number.isFinite(Number(options.chart_x_label_wrap)) ? Number(options.chart_x_label_wrap) : 3;
  const jitterWidth = 0.2; // R default for paired

  // Per-subject jitter offset (deterministic by subject index) — constant across moments
  // so the connecting lines visit the same x position for that subject in every moment.
  const subjectOffsets = Array.from({ length: nSubjects }, (_, s) => deterministicJitter(s) * 2 * jitterWidth);

  /** @type {any[]} */
  const data = [];

  // Box overlays first (drawn under everything else).
  if (showBox) {
    for (let k = 0; k < K; k++) {
      const xCenter = k + 1;
      const ys = aligned[k];
      data.push({
        type: 'box',
        x: ys.map(() => xCenter),
        y: ys,
        boxpoints: false,
        fillcolor: 'rgba(0,0,0,0)',
        line: { color: theme.point, width: 1 },
        showlegend: false,
        hoverinfo: 'skip',
        name: labels[k] ?? `T${k}`
      });
    }
  }

  // Subject lines: one short polyline per subject across the K moments.
  if (showLines) {
    for (let s = 0; s < nSubjects; s++) {
      /** @type {number[]} */
      const xs = [];
      /** @type {number[]} */
      const ys = [];
      for (let k = 0; k < K; k++) {
        xs.push(k + 1 + subjectOffsets[s]);
        ys.push(aligned[k][s]);
      }
      data.push({
        type: 'scatter',
        mode: 'lines',
        x: xs,
        y: ys,
        line: { color: PAIRED_LINE_COLOR, width: 1 },
        opacity: PAIRED_LINE_ALPHA,
        showlegend: false,
        hoverinfo: 'skip',
        name: `subject_${s}`
      });
    }
  }

  // Points and central-tendency crossbar per moment. Gated by chart_show_points; when
  // false, subject lines (spaghetti) may still render alone if chart_paired_show_lines=true.
  if (showPoints) {
    for (let k = 0; k < K; k++) {
      const xCenter = k + 1;
      const ys = aligned[k];
      const xs = ys.map((_, s) => xCenter + subjectOffsets[s]);
      data.push({
        type: 'scatter',
        mode: 'markers',
        x: xs,
        y: ys,
        marker: { size: pointSize, color: theme.point },
        name: labels[k] ?? `T${k}`,
        showlegend: false,
        hovertemplate: '%{y}<extra></extra>'
      });
      const center = computeCenter(ys, centerMode);
      data.push({
        type: 'scatter',
        mode: 'lines',
        x: [xCenter - jitterWidth, xCenter + jitterWidth],
        y: [center, center],
        line: { color: theme.line, width: 3 },
        showlegend: false,
        hoverinfo: 'skip',
        name: `${labels[k] ?? `T${k}`} (${centerMode})`
      });
    }
  }

  const ticktext = labels.map((l) => wrapText(l, labelWrap));
  const tickvals = labels.map((_, i) => i + 1);
  const layout = {
    xaxis: {
      // automargin: the wrapped tick labels and the axis title are laid out by Plotly, which
      // knows their rendered height; the fixed `margin` below is only a floor. Without it a
      // long label stack overran the margin and printed on top of the axis title — the bar
      // family has carried this on its categorical axis all along.
      automargin: true,
      // Named for what the categories are, like its paired_q counterpart: the tick text gives
      // the individual moments, not the fact that the axis IS a sequence of moments. Without a
      // title key at all, `chart_show_xaxis_title` was silently inert on this shape.
      title: { text: resolveMomentAxisLabel(options) },
      tickmode: 'array',
      tickvals,
      ticktext,
      range: [0.4, K + 0.6],
      zeroline: false,
      showgrid: false
    },
    yaxis: {
      automargin: true,
      // Generic "Value" (i18n), not a column label. The moments are separate columns, so any one
      // of their labels is wrong for the other moments' points — the axis read "Peso T1" above the
      // T2 values. The moment names are already the tick text on the other axis, so nothing is
      // lost. Same reasoning `chart_n` uses for its own value axis.
      title: { text: resolveValueAxisLabel(options) },
      zeroline: false,
      ...(includeZero ? { rangemode: 'tozero' } : {})
    },
    margin: { t: 30, r: 30, b: 70, l: 70 },
    showlegend: false,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff'
  };

  return { type: 'paired_individual_values', spec: { data, layout } };
}
