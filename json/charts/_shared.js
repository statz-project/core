// @ts-check
// Shared building blocks for chart_* spec builders.
// Keep pure: no Plotly imports, no DOM access. Just helpers and palette constants.
import { translate, normalizeLanguage } from '../../i18n/index.js';
import { formatNumberLocale } from '../../format_utils.js';

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
 *
 * Percentages go through `formatNumberLocale`, the same helper the table summaries use. A bare
 * `toFixed(1)` always writes a decimal POINT, so a pt_br element showed `3.8%` on the bars next
 * to `5,0%` in the table of the very same cross-tab. The count is an integer and needs no
 * separator at these magnitudes, so it is left as-is.
 *
 * The language is normalized first, exactly as every `summarize_*` does before formatting:
 * `formatNumberLocale` falls back to pt_br on its own, while an unset `options.lang` resolves
 * through the runtime default (en_us). Skipping the normalization would trade the old bug for a
 * new one — charts and tables disagreeing whenever the caller omits the language.
 * @param {number} count
 * @param {number} percent  In 0-100.
 * @param {'n'|'p'|'np'} format
 * @param {string=} lang
 * @returns {string}
 */
export function formatBarLabel(count, percent, format, lang = undefined) {
  const pct = formatNumberLocale(percent, 1, normalizeLanguage(lang));
  if (format === 'p') return `${pct}%`;
  if (format === 'np') return `${count} (${pct}%)`;
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
 * Join labels with a separator, breaking lines BETWEEN labels rather than between words.
 *
 * `wrapText` counts whitespace-separated tokens, which is right for a single label but wrong for a
 * composed one: a paired legend title of "Time 1 × Time 2" is 5 tokens, so a 4-word wrap split it
 * as "Time 1 × Time<br>2" — through the middle of a moment's name. The atomic unit here is the
 * label, so lines are filled with whole labels and only overflow once the next one would not fit.
 * A single label longer than the budget still gets its own line rather than being chopped.
 * @param {string[]} labels
 * @param {string} separator
 * @param {number} maxWords Budget per line, in whitespace-separated tokens (separator included).
 * @returns {string} `<br>`-joined lines.
 */
export function joinLabelsWrapped(labels, separator, maxWords) {
  const parts = (Array.isArray(labels) ? labels : []).map((l) => String(l ?? '')).filter(Boolean);
  if (parts.length === 0) return '';
  if (!Number.isFinite(maxWords) || maxWords <= 0) return parts.join(separator);
  const countWords = (text) => String(text).split(/\s+/).filter(Boolean).length;
  const sepWords = countWords(separator);
  /** @type {string[]} */
  const lines = [];
  let current = '';
  let used = 0;
  for (const part of parts) {
    const cost = countWords(part) + (current ? sepWords : 0);
    if (current && used + cost > maxWords) {
      // Separator stays at the END of the line it breaks after, like a trailing operator, so the
      // reader can see the list continues. Dropping it produced "Time 1<br>Time 2", which reads
      // as two unrelated titles.
      lines.push(current + separator.replace(/\s+$/, ''));
      current = part;
      used = countWords(part);
    } else {
      current = current ? `${current}${separator}${part}` : part;
      used += cost;
    }
  }
  if (current) lines.push(current);
  return lines.join('<br>');
}

/**
 * Resolve the label for the axis that carries the paired moments (Profile B).
 *
 * The moment names are already the tick text, so this axis was left untitled — but "untitled"
 * cost more than it saved: the axis had no name at all, and `chart_show_xaxis_title` had nothing
 * to toggle while the layout still reserved title-sized margin for it. A generic i18n noun names
 * what the categories ARE ("Momento" / "Moment"), which the individual tick labels ("Time 1",
 * "Pre-op") never state on their own.
 * @param {Record<string,any>} options Normalized Analysis_options (must carry `lang`).
 * @returns {string}
 */
export function resolveMomentAxisLabel(options) {
  return translate('chart.axisLabels.moment', options?.lang);
}

/**
 * Build a Plotly `legend` layout object from Analysis_options + a meta.title.
 * Used by charts with multi-trace legends (grouped_bar, paired_grouped_bar, likert).
 *
 * Behavior:
 *   - `chart_legend_position` = 'top' (default) | 'right' | 'bottom' — top/bottom use
 *     horizontal orientation so the plot area recovers full width. Right keeps Plotly's
 *     vertical default and consumes horizontal space (previous behavior). The bottom
 *     position also has to clear the x-axis title, so its offset depends on
 *     `chart_show_xaxis_title` (see below).
 *   - `title.side` is deliberately NOT set: Plotly defaults it to 'left' for horizontal
 *     legends and 'top' for vertical ones (`p('title.side', isHorizontal ? 'left' : 'top')`
 *     in the legend defaults), which is the right call both times. Forcing the title above
 *     the entries everywhere buys tidier alignment against a wrapped title at the cost of
 *     legend height, and height is exactly what the plot area cannot spare.
 *   - `chart_show_legend_title` toggles the legend heading. When false, `title.text=''`
 *     (Plotly still reserves no vertical space when text is empty).
 *   - `chart_legend_title_wrap` (default 4) wraps the title only (the title has more
 *     horizontal room in top/bottom orientations than individual stacked entries).
 *   - `chart_legend_labels_wrap` (default 2) wraps each entry (trace name) independently.
 *     Chart builders read this via `getLegendLabelsWrap` and call `wrapText` per trace.
 *   - Fixed `font.size: 11` (down from Plotly default 12) — subtle readability tweak.
 *
 * @param {Record<string,any>} options Normalized Analysis_options.
 * @param {{ title?: string }=} meta Legend title text (typically the response variable label).
 * @returns {object} Plotly layout.legend object.
 */
export function buildLegendLayout(options, meta = {}) {
  const position = ['top', 'right', 'bottom'].includes(options.chart_legend_position)
    ? options.chart_legend_position
    : 'top';
  const showTitle = options.chart_show_legend_title !== false;
  const titleWrap = Number.isFinite(Number(options.chart_legend_title_wrap))
    ? Number(options.chart_legend_title_wrap)
    : 4;
  const rawTitle = String(meta.title ?? '');
  // A title that already carries `<br>` was broken by the caller, which knows its structure —
  // a composed paired title breaks between moments, not between words. Re-wrapping it by word
  // count would undo exactly that.
  const titleText = showTitle && rawTitle
    ? (rawTitle.includes('<br>') ? rawTitle : wrapText(rawTitle, titleWrap))
    : '';

  /** @type {any} */
  const legend = {
    font: { size: 11 },
    title: { text: titleText }
  };
  if (position === 'top') {
    legend.orientation = 'h';
    legend.x = 0.5;
    legend.xanchor = 'center';
    legend.y = 1.15;
    legend.yanchor = 'bottom';
  } else if (position === 'bottom') {
    legend.orientation = 'h';
    legend.x = 0.5;
    legend.xanchor = 'center';
    // Pinned to the bottom of the FIGURE (`yref: 'container'`), not offset below the plot area.
    // A paper-referenced offset cannot work here: it is a fraction of the plot height, and every
    // extra line of tick text or axis title makes Plotly grow the bottom margin, which shrinks
    // the plot area, which shrinks that same fraction. The gap therefore grows more slowly than
    // the stack it has to clear, and the two meet again a few line-breaks later. Anchored to the
    // container the legend simply stays put, and the room for the axis stack above it is
    // reserved by `margin.b` in `runAnalysis`, where the line counts are known.
    legend.yref = 'container';
    legend.y = 0;
    legend.yanchor = 'bottom';
  } else {
    // 'right' — Plotly vertical default; no explicit anchors needed.
    legend.orientation = 'v';
  }
  return legend;
}

/**
 * Resolve the `chart_legend_labels_wrap` numeric option (default 2). Chart builders call
 * this to wrap each trace name (legend entry) independently of the title wrap. Kept as a
 * dedicated helper so the fallback stays in one place.
 * @param {Record<string,any>} options
 * @returns {number}
 */
export function getLegendLabelsWrap(options) {
  return Number.isFinite(Number(options?.chart_legend_labels_wrap))
    ? Number(options.chart_legend_labels_wrap)
    : 2;
}

/**
 * Decide whether a bar chart should render horizontally.
 *
 * Mirrors the r.plot.barplot heuristic — too many categories, or labels too wide to sit side by
 * side — but measures the width the label will ACTUALLY have. `chart_x_label_wrap` caps every line
 * at N words, so a ten-word level wrapped at 3 occupies three words of horizontal room, not ten.
 * Reading the raw count made the two features fight: the user widened the wrap to make long labels
 * fit vertically and the chart flipped horizontal anyway, ignoring the wrap it had just applied.
 *
 * A disabled wrap (0 or less) leaves labels whole, so there the raw count is the honest measure.
 *
 * @param {string[]} labels Category labels, unwrapped.
 * @param {Record<string, any>} options
 * @returns {boolean}
 */
export function shouldRenderHorizontal(labels, options) {
  const list = Array.isArray(labels) ? labels : [];
  if (list.length > 6) return true;
  const wrapN = Number.isFinite(Number(options?.chart_x_label_wrap)) ? Number(options.chart_x_label_wrap) : 3;
  const maxWords = list.reduce(
    (m, l) => Math.max(m, String(l ?? '').split(/\s+/).filter(Boolean).length), 0);
  const effectiveWords = wrapN > 0 ? Math.min(wrapN, maxWords) : maxWords;
  return effectiveWords > 4;
}

/**
 * Resolve a bar chart's orientation from `chart_bar_orientation`, falling back to the automatic
 * heuristic. Returns Plotly's axis code so callers can drop it straight into the trace.
 *
 * `auto` means the SAME thing in every bar chart — the heuristic above. Letting it mean "always
 * vertical" in the grouped-bar builders and "measure the labels" in the univariate one is the kind
 * of split that made `chart_x_label_wrap` confusing: one word in the UI, two behaviours underneath.
 *
 * @param {string[]} labels Category labels, unwrapped.
 * @param {Record<string, any>} options
 * @returns {'h'|'v'}
 */
export function resolveBarOrientation(labels, options) {
  const mode = options?.chart_bar_orientation;
  if (mode === 'horizontal') return 'h';
  if (mode === 'vertical') return 'v';
  return shouldRenderHorizontal(labels, options) ? 'h' : 'v';
}

/**
 * Wrap an AXIS TITLE — the variable's own label — at `chart_title_wrap` words.
 *
 * Separate from `chart_x_label_wrap`, which wraps the CATEGORY tick labels, because the two sit in
 * very different amounts of room: an axis title spans the whole plot width, a category tick only
 * its own slot. One number for both would be wrong for one of them. Defaults to 8 words, generous
 * enough that ordinary labels never wrap and only genuinely long ones break.
 *
 * Auto-generated titles ("Count", "Value", "%") pass through untouched — they are one word.
 *
 * @param {any} text
 * @param {Record<string, any>} options
 * @returns {string}
 */
export function wrapTitle(text, options) {
  const n = Number.isFinite(Number(options?.chart_title_wrap)) ? Number(options.chart_title_wrap) : 8;
  return wrapText(text, n);
}

/**
 * Compute the central tendency of a numeric array. Used as the crossbar y-position in
 * chart_n, chart_n_q, and chart_paired_n (per-group / per-moment). Median avoids
 * simple-statistics — the sort + midpoint is inline to keep _shared.js dependency-free.
 * @param {number[]} values Non-empty numeric array (caller guarantees).
 * @param {'mean'|'median'|string|undefined} mode
 * @returns {number}
 */
export function computeCenter(values, mode) {
  if (!Array.isArray(values) || values.length === 0) return NaN;
  if (mode === 'median') {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const mid = Math.floor(n / 2);
    return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
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
  const horizontal = resolveBarOrientation(labels, options) === 'h';
  const text = counts.map((c) => {
    const pct = total > 0 ? (c / total) * 100 : 0;
    return formatBarLabel(c, pct, /** @type {'n'|'p'|'np'} */ (labelFormat), options.lang);
  });
  const wrappedLabels = labels.map((l) => wrapText(l, labelWrap));
  const varLabel = wrapTitle(meta.varLabel ?? '', options);
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
        // `autorange: 'reversed'` so the first category sits at the TOP. Plotly draws a categorical
        // axis bottom-up, which silently inverts the ordering the chart just computed — frequency-
        // desc reads least-frequent-first, and a factor's level order reads backwards — the moment
        // the bars turn horizontal. Same correction `chart_likert` has always applied, and the same
        // one a spreadsheet needs on its category axis.
        yaxis: { title: { text: varLabel }, automargin: true, autorange: 'reversed' },
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
