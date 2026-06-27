// @ts-check
// Scatter plot for two numeric variables (n × n). Mirrors r.plot.scatter from the R
// reference: points + linear-fit overlay, with optional zero-anchor on axes.
import variants from '../variants.js';
import { resolveTheme } from './_shared.js';

/** @param {number[]} xs @param {number[]} ys @returns {{slope:number, intercept:number}|null} */
function leastSquares(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) { sumX += xs[i]; sumY += ys[i]; sumXY += xs[i] * ys[i]; sumXX += xs[i] * xs[i]; }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/**
 * Build a Plotly scatter spec for an n × n pair.
 *
 * @param {Array<string|number|null|undefined>} predictorVals
 * @param {Array<string|number|null|undefined>} responseVals
 * @param {Record<string,any>=} options Normalized analysis options (chart_*).
 * @param {{predictorLabel?:string, responseLabel?:string}=} meta Axis labels.
 * @returns {{ type:string, spec:{data:any[], layout:any} }|null} Null when fewer than 2 finite pairs.
 */
export function chart_n_n(predictorVals, responseVals, options = {}, meta = {}) {
  /** @type {number[]} */ const xs = [];
  /** @type {number[]} */ const ys = [];
  const len = Math.min(predictorVals.length, responseVals.length);
  for (let i = 0; i < len; i++) {
    const pRaw = predictorVals[i]; const rRaw = responseVals[i];
    const xSan = typeof pRaw === 'string' ? variants.sanitizeNumericString(pRaw) : String(pRaw ?? '');
    const ySan = typeof rRaw === 'string' ? variants.sanitizeNumericString(rRaw) : String(rRaw ?? '');
    const x = Number.parseFloat(xSan); const y = Number.parseFloat(ySan);
    if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
  }
  if (xs.length < 2) return null;

  const theme = resolveTheme(options.chart_theme);
  const pointSize = Number.isFinite(Number(options.chart_point_size)) ? Number(options.chart_point_size) : 8;
  const includeZero = options.chart_include_zero !== false;

  /** @type {any[]} */
  const data = [{
    type: 'scatter',
    mode: 'markers',
    x: xs,
    y: ys,
    marker: { size: pointSize, color: theme.point },
    name: 'points',
    showlegend: false,
    hovertemplate: '(%{x}, %{y})<extra></extra>'
  }];

  const fit = leastSquares(xs, ys);
  if (fit) {
    const xMin = Math.min(...xs); const xMax = Math.max(...xs);
    data.push({
      type: 'scatter',
      mode: 'lines',
      x: [xMin, xMax],
      y: [fit.slope * xMin + fit.intercept, fit.slope * xMax + fit.intercept],
      line: { color: theme.line, width: 2 },
      name: 'fit',
      showlegend: false,
      hoverinfo: 'skip'
    });
  }

  const layout = {
    xaxis: {
      title: { text: meta.predictorLabel ?? '' },
      zeroline: false,
      ...(includeZero ? { rangemode: 'tozero' } : {})
    },
    yaxis: {
      title: { text: meta.responseLabel ?? '' },
      zeroline: false,
      ...(includeZero ? { rangemode: 'tozero' } : {})
    },
    margin: { t: 30, r: 20, b: 60, l: 70 },
    showlegend: false,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff'
  };

  return { type: 'scatter', spec: { data, layout } };
}
