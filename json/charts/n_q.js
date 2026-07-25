// @ts-check
// Individual-values chart for numeric × qualitative (n × q). Mirrors r.plot.individual_values
// (non-paired path): one column of jittered points per group, mean crossbar per group,
// optional box overlay per group.
import variants from '../variants.js';
import { resolveTheme, wrapText, computeCenter } from './_shared.js';

/**
 * Deterministic pseudo-random in [-0.5, 0.5) keyed by index. Allows tests to assert
 * exact x positions without depending on Math.random.
 * @param {number} i
 * @returns {number}
 */
function deterministicJitter(i) {
  const v = ((i * 9301 + 49297) % 233280) / 233280;
  return v - 0.5;
}

/**
 * @param {Array<string|number|null|undefined>} numericVals
 * @param {Array<string|null|undefined>} groupVals
 * @param {Record<string,any>=} options
 * @param {{numericLabel?:string, groupLabel?:string, groupLabels?:string[]|null}=} meta
 * @returns {{type:string, spec:{data:any[], layout:any}}|null}
 */
export function chart_n_q(numericVals, groupVals, options = {}, meta = {}) {
  if (!Array.isArray(numericVals) || !Array.isArray(groupVals)) return null;
  const len = Math.min(numericVals.length, groupVals.length);
  /** @type {Record<string, number[]>} */
  const valuesByGroup = {};
  for (let i = 0; i < len; i++) {
    const g = String(groupVals[i] ?? '').trim();
    if (!g) continue;
    const raw = numericVals[i];
    const sanitized = typeof raw === 'string' ? variants.sanitizeNumericString(raw) : String(raw ?? '');
    const parsed = Number.parseFloat(sanitized);
    if (!Number.isFinite(parsed)) continue;
    if (!valuesByGroup[g]) valuesByGroup[g] = [];
    valuesByGroup[g].push(parsed);
  }
  const presetGroups = Array.isArray(meta.groupLabels) ? meta.groupLabels : null;
  const groups = (presetGroups ?? Object.keys(valuesByGroup).sort()).filter((g) => (valuesByGroup[g]?.length ?? 0) > 0);
  if (groups.length === 0) return null;

  const theme = resolveTheme(options.chart_theme);
  const pointSize = Number.isFinite(Number(options.chart_point_size)) ? Number(options.chart_point_size) : 8;
  const showBox = options.chart_show_boxplot === true;
  // Layer toggles: showPoints defaults true. Both showBox+showPoints false leaves the
  // axes empty per group but keeps the placeholder (see chart_n rationale).
  const showPoints = options.chart_show_points !== false;
  const centerMode = options.chart_central_tendency === 'median' ? 'median' : 'mean';
  const includeZero = options.chart_include_zero !== false;
  const labelWrap = Number.isFinite(Number(options.chart_x_label_wrap)) ? Number(options.chart_x_label_wrap) : 3;
  const jitterWidth = 0.3;

  /** @type {any[]} */
  const data = [];
  // Per group: box overlay (drawn first / under), then points, then the central-tendency
  // crossbar (mean or median). Each layer independently gated.
  groups.forEach((g, gi) => {
    const ys = valuesByGroup[g];
    const xCenter = gi + 1; // 1-indexed positions
    if (showBox) {
      data.push({
        type: 'box',
        x: ys.map(() => xCenter),
        y: ys,
        boxpoints: false,
        fillcolor: 'rgba(0,0,0,0)',
        line: { color: theme.point, width: 1 },
        showlegend: false,
        hoverinfo: 'skip',
        name: g
      });
    }
    if (showPoints) {
      const xs = ys.map((_, i) => xCenter + deterministicJitter(i) * 2 * jitterWidth);
      data.push({
        type: 'scatter',
        mode: 'markers',
        x: xs,
        y: ys,
        marker: { size: pointSize, color: theme.point },
        name: g,
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
        name: `${g} (${centerMode})`
      });
    }
  });

  const ticktext = groups.map((g) => wrapText(g, labelWrap));
  const tickvals = groups.map((_, i) => i + 1);
  const layout = {
    xaxis: {
      title: { text: meta.groupLabel ?? '' },
      tickmode: 'array',
      tickvals,
      ticktext,
      range: [0.4, groups.length + 0.6],
      zeroline: false,
      showgrid: false
    },
    yaxis: {
      title: { text: meta.numericLabel ?? '' },
      zeroline: false,
      ...(includeZero ? { rangemode: 'tozero' } : {})
    },
    margin: { t: 30, r: 30, b: 70, l: 70 },
    showlegend: false,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff'
  };

  return { type: 'individual_values_grouped', spec: { data, layout } };
}

/**
 * Axis-inverted wrapper: q is the predictor (x-axis groups), n is the response (y values).
 * Mirrors the table-mode trick in `summarize_n_q(responseVals, predictorVals, …)` — same
 * function with args swapped produces the layout we want for the q × n combination.
 *
 * @param {Array<string|null|undefined>} predictorVals q values (predictor).
 * @param {Array<string|number|null|undefined>} responseVals n values (response).
 * @param {Record<string,any>=} options
 * @param {{predictorLabel?:string, responseLabel?:string, predictorLabels?:string[]|null}=} meta
 * @returns {{type:string, spec:{data:any[], layout:any}}|null}
 */
export function chart_q_n(predictorVals, responseVals, options = {}, meta = {}) {
  return chart_n_q(responseVals, predictorVals, options, {
    numericLabel: meta.responseLabel,
    groupLabel: meta.predictorLabel,
    groupLabels: meta.predictorLabels ?? null
  });
}
