// @ts-check
// Shared building blocks for chart_* spec builders.
// Keep pure: no Plotly imports, no DOM access. Just helpers and palette constants.

/**
 * Theme palette used by single-series charts (univariate q, l; scatter, individual values).
 * For multi-series (grouped bar in q × q, n × q), an n-color palette helper will be added
 * in a later phase.
 */
export const THEME_COLORS = {
  gray:  { point: '#525252', line: '#d62728' },
  blue:  { point: '#1f77b4', line: '#d62728' },
  red:   { point: '#d62728', line: '#1f77b4' },
  green: { point: '#2ca02c', line: '#d62728' }
};

/**
 * Resolve a theme name to its color palette; falls back to gray for unknown names.
 * @param {string|undefined} name
 * @returns {{point:string,line:string}}
 */
export function resolveTheme(name) {
  return THEME_COLORS[/** @type {keyof typeof THEME_COLORS} */ (name)] ?? THEME_COLORS.gray;
}

/**
 * Insert line breaks every `nWords` words. Mirrors the wrap_text helper in the R reference
 * scripts so axis labels with long names render compactly.
 * @param {string|null|undefined} text
 * @param {number} nWords
 * @returns {string}
 */
export function wrapText(text, nWords) {
  const str = String(text ?? '');
  if (!str || !Number.isFinite(nWords) || nWords <= 0) return str;
  const words = str.split(/\s+/).filter(Boolean);
  if (words.length <= nWords) return str;
  /** @type {string[]} */
  const lines = [];
  for (let i = 0; i < words.length; i += nWords) {
    lines.push(words.slice(i, i + nWords).join(' '));
  }
  return lines.join('<br>');
}

/**
 * Format a single bar's value label per chart_label_format option.
 * @param {number} count
 * @param {number} percent  In 0-100.
 * @param {'n'|'p'|'np'} format
 * @returns {string}
 */
export function formatBarLabel(count, percent, format) {
  if (format === 'p') return `${percent.toFixed(1)}%`;
  if (format === 'np') return `${count} (${percent.toFixed(1)}%)`;
  return String(count);
}

/**
 * Build a Plotly bar spec from labels + counts. Used by chart_q (qualitative univariate)
 * and chart_l (list univariate). Auto-switches to horizontal orientation when there are
 * many categories or labels with many words — same heuristic as the R r.plot.barplot.
 *
 * @param {{
 *   labels: string[],
 *   counts: number[],
 *   total: number,
 *   options: Record<string, any>,
 *   meta: { varLabel?: string }
 * }} args
 * @returns {{type:string, spec:{data:any[], layout:any}}}
 */
export function buildBarSpec({ labels, counts, total, options, meta }) {
  const theme = resolveTheme(options.chart_theme);
  const labelFormat = ['n', 'p', 'np'].includes(options.chart_label_format) ? options.chart_label_format : 'n';
  const labelWrap = Number.isFinite(Number(options.chart_x_label_wrap)) ? Number(options.chart_x_label_wrap) : 3;
  // Match r.plot.barplot heuristic: horizontal if > 6 categories or any label > 4 words.
  const maxWords = labels.reduce((m, l) => Math.max(m, String(l ?? '').split(/\s+/).filter(Boolean).length), 0);
  const horizontal = labels.length > 6 || maxWords > 4;
  const text = counts.map((c) => {
    const pct = total > 0 ? (c / total) * 100 : 0;
    return formatBarLabel(c, pct, /** @type {'n'|'p'|'np'} */ (labelFormat));
  });
  const wrappedLabels = labels.map((l) => wrapText(l, labelWrap));
  const varLabel = meta.varLabel ?? '';
  /** @type {any[]} */
  const data = [{
    type: 'bar',
    orientation: horizontal ? 'h' : 'v',
    x: horizontal ? counts : wrappedLabels,
    y: horizontal ? wrappedLabels : counts,
    text,
    textposition: 'outside',
    marker: { color: theme.point },
    hovertemplate: '%{label}: %{value}<extra></extra>',
    showlegend: false
  }];
  const layout = horizontal
    ? {
        xaxis: { title: { text: '' }, zeroline: false },
        yaxis: { title: { text: varLabel }, automargin: true },
        margin: { t: 30, r: 60, b: 50, l: 100 },
        showlegend: false,
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
      }
    : {
        xaxis: { title: { text: varLabel }, automargin: true },
        yaxis: { title: { text: '' }, zeroline: false },
        margin: { t: 30, r: 30, b: 80, l: 60 },
        showlegend: false,
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
      };
  return { type: 'bar', spec: { data, layout } };
}
