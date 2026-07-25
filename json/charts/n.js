// @ts-check
// Univariate numeric "individual values" chart. Mirrors r.plot.numeric.
// All points are drawn at the same x position (single category) with horizontal jitter,
// a horizontal crossbar marks the mean, and an optional boxplot can overlay the points.
import variants from '../variants.js';
import { resolveTheme, resolveValueAxisLabel, computeCenter } from './_shared.js';

/**
 * Deterministic pseudo-random in [-0.5, 0.5) keyed by index. Allows tests to assert
 * exact x positions without depending on Math.random.
 * @param {number} i
 * @returns {number}
 */
function deterministicJitter(i) {
  // Simple LCG-style hash; output stays in [-0.5, 0.5).
  const v = ((i * 9301 + 49297) % 233280) / 233280;
  return v - 0.5;
}

/**
 * @param {Array<string|number|null|undefined>} values
 * @param {Record<string,any>=} options
 * @param {{varLabel?:string}=} meta
 * @returns {{type:string, spec:{data:any[], layout:any}}|null}
 */
export function chart_n(values, options = {}, meta = {}) {
  if (!Array.isArray(values)) return null;
  /** @type {number[]} */
  const nums = [];
  values.forEach((raw) => {
    const sanitized = typeof raw === 'string' ? variants.sanitizeNumericString(raw) : String(raw ?? '');
    const parsed = Number.parseFloat(sanitized);
    if (Number.isFinite(parsed)) nums.push(parsed);
  });
  if (nums.length === 0) return null;

  const theme = resolveTheme(options.chart_theme);
  const pointSize = Number.isFinite(Number(options.chart_point_size)) ? Number(options.chart_point_size) : 8;
  const showBox = options.chart_show_boxplot === true;
  // Layer toggles: showPoints defaults true (backward compat). Both showBox+showPoints
  // false leaves the axes empty but keeps the placeholder — signals "user removed
  // everything" instead of vanishing the chart cell.
  const showPoints = options.chart_show_points !== false;
  const centerMode = options.chart_central_tendency === 'median' ? 'median' : 'mean';
  const includeZero = options.chart_include_zero !== false;
  const varLabel = meta.varLabel ?? '';
  const jitterWidth = 0.3; // matches r.plot.numeric default

  /** @type {any[]} */
  const data = [];
  if (showBox) {
    // Box trace placed FIRST (drawn under everything else) so markers stay visible on top.
    data.push({
      type: 'box',
      x: nums.map(() => 1),
      y: nums,
      boxpoints: false,
      fillcolor: 'rgba(0,0,0,0)',
      line: { color: theme.point, width: 1 },
      showlegend: false,
      hoverinfo: 'skip'
    });
  }
  if (showPoints) {
    const xJitter = nums.map((_, i) => 1 + deterministicJitter(i) * 2 * jitterWidth);
    const center = computeCenter(nums, centerMode);
    data.push({
      type: 'scatter',
      mode: 'markers',
      x: xJitter,
      y: nums,
      marker: { size: pointSize, color: theme.point },
      name: 'points',
      showlegend: false,
      hovertemplate: '%{y}<extra></extra>'
    });
    data.push({
      // Central-tendency crossbar — short horizontal line at mean or median.
      type: 'scatter',
      mode: 'lines',
      x: [1 - jitterWidth, 1 + jitterWidth],
      y: [center, center],
      line: { color: theme.line, width: 3 },
      name: centerMode,
      showlegend: false,
      hoverinfo: 'skip'
    });
  }

  const layout = {
    xaxis: {
      tickmode: 'array',
      tickvals: [1],
      ticktext: [varLabel],
      range: [0.4, 1.6],
      zeroline: false,
      showgrid: false
    },
    yaxis: {
      // Generic "Value" (i18n) instead of duplicating varLabel — the x-axis tick text
      // already carries the variable name at position 1. Previous behavior printed the
      // varLabel on BOTH axes (redundant).
      title: { text: resolveValueAxisLabel(options) },
      zeroline: false,
      ...(includeZero ? { rangemode: 'tozero' } : {})
    },
    margin: { t: 30, r: 30, b: 50, l: 70 },
    showlegend: false,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff'
  };

  return { type: 'individual_values', spec: { data, layout } };
}
