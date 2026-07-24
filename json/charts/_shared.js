// @ts-check
// Shared building blocks for chart_* spec builders.
// Keep pure: no Plotly imports, no DOM access. Just helpers and palette constants.
import { translate } from '../../i18n/index.js';

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
 * Qualitative palettes per theme — used by multi-series charts (e.g., grouped bar in q × q
 * where each response level is a distinct color). Each palette is cycled if `n` exceeds
 * its length.
 */
const THEME_PALETTES = {
  gray:  ['#525252', '#969696', '#bdbdbd', '#d9d9d9'],
  blue:  ['#1f77b4', '#5b9bd5', '#9ec5e8', '#cce0f4'],
  red:   ['#d62728', '#e57c7d', '#ee9ea0', '#f4c2c3'],
  green: ['#2ca02c', '#5ab85a', '#8ccf8c', '#bce0bc']
};

/**
 * Resolve a theme name to an n-length palette (cycles if n > palette length).
 * @param {string|undefined} name
 * @param {number} n
 * @returns {string[]}
 */
export function getThemePalette(name, n) {
  const palette = THEME_PALETTES[/** @type {keyof typeof THEME_PALETTES} */ (name)] ?? THEME_PALETTES.gray;
  if (!Number.isFinite(n) || n <= 0) return [];
  const out = [];
  for (let i = 0; i < n; i++) out.push(palette[i % palette.length]);
  return out;
}

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
 * Resolve the numeric-axis title for bar-family charts (chart_q, chart_l, chart_q_q,
 * chart_paired_q, and their l-expansion variants) from the `chart_label_format` option.
 * Mirrors the per-bar value-label format the user chose, so the axis title reads as the
 * same quantity:
 *   - 'n'  → i18n "Count" (locale-aware)
 *   - 'p'  → "%"
 *   - 'np' → "n (%)"
 * @param {Record<string,any>} options Normalized Analysis_options (must carry `lang`).
 * @returns {string}
 */
export function resolveNumericAxisLabel(options) {
  const format = ['n', 'p', 'np'].includes(options?.chart_label_format) ? options.chart_label_format : 'n';
  if (format === 'p') return '%';
  if (format === 'np') return 'n (%)';
  return translate('chart.axisLabels.count', options?.lang);
}

/**
 * Resolve the generic "Value" label used as the y-axis title in univariate numeric charts
 * (chart_n), where the categorical position label already lives in the x-axis tick text.
 * @param {Record<string,any>} options Normalized Analysis_options (must carry `lang`).
 * @returns {string}
 */
export function resolveValueAxisLabel(options) {
  return translate('chart.axisLabels.value', options?.lang);
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
  // Numeric axis title mirrors the per-bar label format (Count/%/n(%)). Previously the
  // numeric axis was untitled — leaving the reader to infer the quantity from bar-text.
  const numericAxisLabel = resolveNumericAxisLabel(options);
  /** @type {any[]} */
  const data = [{
    type: 'bar',
    orientation: horizontal ? 'h' : 'v',
    x: horizontal ? counts : wrappedLabels,
    y: horizontal ? wrappedLabels : counts,
    text,
    textposition: 'outside',
    // Let outside-positioned text labels render past the axis edges instead of being
    // clipped when a bar reaches the top of the plot area.
    cliponaxis: false,
    marker: { color: theme.point },
    hovertemplate: '%{label}: %{value}<extra></extra>',
    showlegend: false
  }];
  const layout = horizontal
    ? {
        // Horizontal orientation: x-axis is numeric (bar length), y-axis is categorical.
        xaxis: { title: { text: numericAxisLabel }, zeroline: false },
        yaxis: { title: { text: varLabel }, automargin: true },
        // margin.t 60 (not the Plotly default ~30): with `textposition: outside` the
        // count/percent label sits above the tallest bar; a 30px top pad clips it in
        // ~400px containers. 60px gives it room without shrinking the plot noticeably.
        margin: { t: 60, r: 60, b: 50, l: 100 },
        showlegend: false,
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
      }
    : {
        // Vertical orientation: x-axis is categorical, y-axis is numeric (bar height).
        xaxis: { title: { text: varLabel }, automargin: true },
        yaxis: { title: { text: numericAxisLabel }, zeroline: false },
        margin: { t: 60, r: 30, b: 80, l: 60 },
        showlegend: false,
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
      };
  return { type: 'bar', spec: { data, layout } };
}
