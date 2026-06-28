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
import { chart_q_q } from './q_q.js';
import { chart_n_q, chart_q_n } from './n_q.js';
import { chart_l_q } from './l_q.js';
import { chart_q_l } from './q_l.js';
import { chart_l_n } from './l_n.js';
import { chart_l_l } from './l_l.js';
import { chart_paired_n } from './paired_n.js';
import { chart_paired_q } from './paired_q.js';
import { chart_likert } from './likert.js';

const ns = {
  chart_q,
  chart_n,
  chart_l,
  chart_q_q,
  chart_n_q,
  chart_q_n,
  chart_n_n,
  chart_l_q,
  chart_q_l,
  chart_l_n,
  chart_l_l,
  chart_paired_n,
  chart_paired_q,
  chart_likert,
};

export default ns;
