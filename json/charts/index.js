// @ts-check
// Charts namespace: produces Plotly figure specs (data + layout) without depending on
// Plotly at runtime. Specs are pure JSON; the browser-side Bubble layer loads Plotly via
// CDN and renders specs via Plotly.newPlot(div, spec.data, spec.layout).
//
// Per the architecture plan, mode='chart' in runAnalysis routes each (predictor, response)
// cell to a chart_* function here instead of summarize_* in the table-mode dispatcher.
import { chart_n_n } from './n_n.js';
import { chart_q } from './q.js';
import { chart_n } from './n.js';
import { chart_l } from './l.js';

const ns = {
  chart_q,
  chart_n,
  chart_l,
  chart_n_n,
};

export default ns;
