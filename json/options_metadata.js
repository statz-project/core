// @ts-check
// Public catalogue of Analysis_options metadata. Drives Panel_element_options gating in
// the UI: given current `Analysis_flags` (emitted by runAnalysis) and the Element's mode,
// `getAvailableOptions(flags, mode)` returns the subset of options worth displaying.
//
// Mirrors the `VARIANT_TEMPLATES` pattern in core/json/variants.js — a public catalogue
// served by the core so UI consumers don't duplicate knowledge that belongs here.
//
// IMPORTANT: defaults declared here are duplicated from `getDefaultAnalysisOptions` in
// driver.js. The drift between the two is gated by core/test/options_metadata.test.mjs;
// any change to either side without updating the other will fail loud.
//
// Options whose runtime default is i18n-resolved (missing_label, yes_label, no_label,
// residual_symbols, lang) declare `default: null` + a `defaultI18nKey` (or `'__binary__'`,
// `'__lang__'`) sentinel — the drift test asserts existence rather than literal equality.
// Use `getOptionDefault(name, lang)` to get the resolved value uniformly (handles both
// static and i18n-resolved cases).
import driver from './driver.js';
import { translate } from '../i18n/index.js';

const ns = {};

/**
 * @typedef {Object} OptionMetadata
 * @property {'inferential'|'descriptive'|'table'|'chart'|'output'|'i18n'} category
 * @property {'boolean'|'number'|'string'|'enum'|'multiselect'|'object'} type
 * @property {any} default                   Static default (or null when i18n-resolved)
 * @property {string=} defaultI18nKey        Sentinel for dynamic defaults: i18n key, or '__binary__'/'__lang__'/'__residuals__'
 * @property {string[]|null} enum            Allowed values for type='enum'/'multiselect'
 * @property {string[]} appliesTo            has_* flags that make this option relevant; [] = always relevant
 * @property {'table'|'chart'|null} modeGate Visibility gated on options.mode (null = both modes)
 * @property {string} labelKey               i18n key for short UI label
 * @property {string} descriptionKey         i18n key for tooltip/help text
 */

// Flag groups used in appliesTo definitions below. Inlined for readability where appropriate.
const ALL_INFERENTIAL = [
  'has_qq', 'has_nq', 'has_qn', 'has_nn',
  'has_lq', 'has_ql', 'has_ln', 'has_nl', 'has_ll',
  'has_paired_n', 'has_paired_q'
];
const ALL_LIST_EXPAND = ['has_lq', 'has_ql', 'has_ln', 'has_nl', 'has_ll'];
// Charts whose x-axis carries CATEGORICAL tick labels, i.e. the ones where wrapping long level
// names changes anything. Verified per chart type rather than assumed: `has_n` / `has_nn` put
// numbers on that axis, and the list-EXPANDED profiles (`has_lq`, `has_ln`, `has_nl`, `has_ll`)
// draw one chart per item whose x-axis is the short yes/no pair — the item name goes in the title.
// `has_ql` is the exception among the list profiles: there the list is the RESPONSE, so the
// predictor's levels are what the axis shows.
const CATEGORICAL_X_AXIS = [
  'has_q', 'has_l', 'has_qq', 'has_nq', 'has_qn', 'has_ql', 'has_paired_q', 'has_paired_n'
];

// `alpha` applies wherever a p-value is produced, which is every inferential analysis. It gates the
// residual branch and its cell cut-off in `summarize_q_q`, the post-hoc branch in `summarize_n_q`,
// the level of both confidence intervals, and — the reason the paired shapes are here — which
// p-values the HTML exporter sets in bold. That last one reaches EVERY analysis with a p-value, so
// leaving a flag out does not spare the user a meaningless control: it applies a threshold to their
// table and denies them the means to set it. A paired test reporting p = 0.060 to a reader working
// at 0.075 was being told, in bold or its absence, something the reader had no way to correct.
// Only the descriptive flags stay out, having no p-value to judge.
const ALPHA_GATED = ['has_qq', 'has_lq', 'has_ql', 'has_ll', 'has_nq', 'has_qn', 'has_ln', 'has_nl', 'has_nn', 'has_paired_n', 'has_paired_q'];
// Dunn's adjustment is a `summarize_n_q` concern only — including the list-expanded cells that
// delegate to it.
// `adjust_kruskal` corrects the Dunn pairwise comparisons, so the only cell it can affect is one
// where Dunn actually ran: a non-parametric route with MORE than two groups whose Kruskal-Wallis
// came out significant. That is exactly what `has_kruskal_sign` reports. The shape flags used to
// be in here too, which offered the correction for a two-group comparison (Mann-Whitney or t —
// nothing to correct), for the ANOVA route (Tukey carries its own correction), and for a
// non-significant Kruskal (no post-hoc at all).
//
// Unlike `has_residuals`, gating on this is not a one-way switch: `has_kruskal_sign` is added
// whether or not any comparison survives the adjustment (see the `flagsUsed.add` outside the
// filter in numeric.js), so changing the correction can never make the option disappear.
const KRUSKAL_ADJUSTED = ['has_kruskal_sign'];

const QL_MISSING_BUCKET = ['has_q', 'has_l'];

/** @type {Record<string, OptionMetadata>} */
ns.OPTION_METADATA = {
  // ----- i18n / output -----
  lang: {
    category: 'i18n', type: 'string', default: null, defaultI18nKey: '__lang__',
    enum: null, appliesTo: [], modeGate: null,
    labelKey: 'options.lang.label', descriptionKey: 'options.lang.description'
  },
  mode: {
    category: 'output', type: 'enum', default: 'table',
    enum: ['table', 'chart'], appliesTo: [], modeGate: null,
    labelKey: 'options.mode.label', descriptionKey: 'options.mode.description'
  },

  // ----- inferential thresholds -----
  // modeGate 'table': alpha decides which residuals get a symbol and which post-hoc pairs count as
  // significant, both of which live in the table. No chart builder reads it, so offering it in
  // chart mode asked the user to set a threshold that changes nothing they can see.
  alpha: {
    category: 'inferential', type: 'number', default: 0.05, enum: null,
    appliesTo: ALPHA_GATED, modeGate: 'table',
    labelKey: 'options.alpha.label', descriptionKey: 'options.alpha.description'
  },
  // Same reasoning as alpha: it only reshapes Dunn's pairwise table. The list-expanded cells were
  // missing from the list even though they delegate to summarize_n_q.
  adjust_kruskal: {
    category: 'inferential', type: 'string', default: 'bonferroni', enum: null,
    appliesTo: KRUSKAL_ADJUSTED, modeGate: 'table',
    labelKey: 'options.adjust_kruskal.label', descriptionKey: 'options.adjust_kruskal.description'
  },

  // ----- descriptive (numeric stats) -----
  stat_options_numeric: {
    category: 'descriptive', type: 'multiselect',
    default: ['min', 'max', 'mean_sd', 'n_missing'],
    enum: ['min', 'max', 'mean_sd', 'median_iqr', 'n', 'n_missing'],
    appliesTo: ['has_n'], modeGate: 'table',
    labelKey: 'options.stat_options_numeric.label', descriptionKey: 'options.stat_options_numeric.description'
  },
  // `stat_options` is deliberately NOT catalogued here. It is the parameter name of the shared
  // `getNumericalSummaryByGroup` helper and a documented argument for DIRECT calls to
  // `summarize_n` / `describeColumn` — but as an analysis option it could never act: the driver
  // used to default it to a copy of `stat_options_by_group`, and every consumer prefers the
  // specific option anyway, so the panel was offering a control with no reachable effect.
  stat_options_by_group: {
    category: 'descriptive', type: 'multiselect',
    default: ['mean_sd'],
    enum: ['min', 'max', 'mean_sd', 'median_iqr', 'n', 'n_missing'],
    appliesTo: ['has_nq', 'has_qn', 'has_ln', 'has_nl', 'has_paired_n'], modeGate: 'table',
    labelKey: 'options.stat_options_by_group.label', descriptionKey: 'options.stat_options_by_group.description'
  },
  include_missing: {
    category: 'descriptive', type: 'boolean', default: true, enum: null,
    // `has_q` / `has_l` only: consumed by summarize_q, summarize_l, and chart_q to
    // toggle the "Not informed" bucket. Numeric summaries use `stat_options_*` with
    // the `n_missing` enum member instead — the toggle would have no effect there.
    appliesTo: QL_MISSING_BUCKET, modeGate: null,
    labelKey: 'options.include_missing.label', descriptionKey: 'options.include_missing.description'
  },

  // ----- table styling / contingency formatting -----
  // Footnote symbols exist to tie a p-value to the test named in the legend, so the option is only
  // meaningful where a test ran. An empty appliesTo means "universal" (see `lang`, `mode`), which
  // surfaced this in Profile A — descriptive summaries have no test_used, generateTestSymbolMap
  // gets an empty method list, and the style has nothing to style.
  symbol_style: {
    category: 'table', type: 'enum', default: 'numeric',
    enum: ['numeric', 'alpha'], appliesTo: ALL_INFERENTIAL, modeGate: 'table',
    labelKey: 'options.symbol_style.label', descriptionKey: 'options.symbol_style.description'
  },
  percent_by: {
    category: 'table', type: 'enum', default: 'col',
    // Both modes: `chart_q_q` reads the same option, so a table and a chart of the same cross-tab
    // report the same percentages. (In chart mode it only shows through `chart_label_format`
    // 'p'/'np' — an option-value dependency for the panel to hide, like missing_label's.)
    enum: ['col', 'row', 'total'], appliesTo: ['has_qq', 'has_lq', 'has_ql', 'has_ll'], modeGate: null,
    labelKey: 'options.percent_by.label', descriptionKey: 'options.percent_by.description',
    // Mode-specific wording. In chart mode this option does more than pick a denominator — it
    // decides which variable groups the bars — and a label reading only "Percent by" never told
    // the user that. Same control, different framing where its effect is different.
    chartLabelKey: 'options.percent_by.chartLabel', chartDescriptionKey: 'options.percent_by.chartDescription'
  },
  label_list_with_column: {
    category: 'table', type: 'boolean', default: true, enum: null,
    // Both modes. The prefix rides on the entry's `predictor`, which the chart path uses for the
    // cell heading, for the legend title (percent_by 'col') and for the category-axis title
    // (percent_by 'row') — three visible places, not one table column.
    appliesTo: ALL_LIST_EXPAND, modeGate: null,
    labelKey: 'options.label_list_with_column.label', descriptionKey: 'options.label_list_with_column.description'
  },
  with_residuals: {
    category: 'table', type: 'boolean', default: true, enum: null,
    appliesTo: ['has_residuals'], modeGate: 'table',
    labelKey: 'options.with_residuals.label', descriptionKey: 'options.with_residuals.description'
  },
  // Effect sizes surface in every cell that routes through summarize_q_q and yields a 2×2 —
  // including l × l, whose two decomposed binaries always form one. Both options therefore share
  // the same flag set; `with_effect_sizes` gates the computation, `effect_size_type` picks which
  // statistic is shown.
  with_effect_sizes: {
    category: 'table', type: 'boolean', default: false, enum: null,
    appliesTo: ['has_qq', 'has_lq', 'has_ql', 'has_ll'], modeGate: 'table',
    labelKey: 'options.with_effect_sizes.label', descriptionKey: 'options.with_effect_sizes.description'
  },
  effect_size_type: {
    category: 'table', type: 'enum', default: 'odds_ratio',
    enum: ['odds_ratio', 'risk_ratio'],
    appliesTo: ['has_qq', 'has_lq', 'has_ql', 'has_ll'], modeGate: 'table',
    labelKey: 'options.effect_size_type.label', descriptionKey: 'options.effect_size_type.description'
  },
  residual_symbols: {
    category: 'table', type: 'object', default: null, defaultI18nKey: '__residuals__',
    enum: null, appliesTo: ['has_residuals'], modeGate: 'table',
    labelKey: 'options.residual_symbols.label', descriptionKey: 'options.residual_symbols.description'
  },
  missing_label: {
    category: 'table', type: 'string', default: null, defaultI18nKey: 'table.missing',
    // `has_q` / `has_l` only + modeGate: null. Consumed by summarize_q, summarize_l,
    // AND chart_q ([charts/q.js]); previous `modeGate: 'table'` hid the control in
    // chart mode even though bar charts render the "Not informed" bucket label.
    // `has_n` excluded for the same reason as `include_missing`.
    enum: null, appliesTo: QL_MISSING_BUCKET, modeGate: null,
    labelKey: 'options.missing_label.label', descriptionKey: 'options.missing_label.description'
  },
  yes_label: {
    category: 'table', type: 'string', default: null, defaultI18nKey: '__binary__',
    // All list-expand cells only. `decomposeListAsBinaryCols` (the ONLY consumer of
    // yes/no labels) is called by table AND chart callers for lq/ql/ln/ll. Previous
    // `['has_l', 'has_lq', 'has_ln']` was wrong on both ends — surfaced under
    // Profile A `has_l` (which never binarizes) and omitted `has_ql` / `has_ll`.
    // The mode gate lagged behind that fix: the same "table AND chart callers" reasoning applies
    // to it. The labels become the series names (percent_by 'col') or the axis categories
    // (percent_by 'row'), and in `has_ln`/`has_nl` both at once.
    enum: null, appliesTo: ALL_LIST_EXPAND, modeGate: null,
    labelKey: 'options.yes_label.label', descriptionKey: 'options.yes_label.description'
  },
  no_label: {
    category: 'table', type: 'string', default: null, defaultI18nKey: '__binary__',
    // Both modes, for the reason spelled out on `yes_label` above.
    enum: null, appliesTo: ALL_LIST_EXPAND, modeGate: null,
    labelKey: 'options.no_label.label', descriptionKey: 'options.no_label.description'
  },
  binary_min_count: {
    category: 'table', type: 'number', default: 1, enum: null,
    // Same rationale as yes/no labels: all 4 list-expand cells go through
    // decomposeListAsBinaryCols. `modeGate: null` because the threshold filters items
    // identically in table and chart callers; previous `'table'` silently ignored the
    // setting for chart-mode l×* cells.
    appliesTo: ALL_LIST_EXPAND, modeGate: null,
    labelKey: 'options.binary_min_count.label', descriptionKey: 'options.binary_min_count.description'
  },

  // ----- chart styling -----
  chart_theme: {
    category: 'chart', type: 'enum', default: 'gray',
    enum: ['gray', 'blue', 'red', 'green'], appliesTo: [], modeGate: 'chart',
    labelKey: 'options.chart_theme.label', descriptionKey: 'options.chart_theme.description'
  },
  chart_point_size: {
    category: 'chart', type: 'number', default: 8, enum: null,
    appliesTo: ['has_n', 'has_nq', 'has_qn', 'has_nn', 'has_ln', 'has_nl', 'has_paired_n'], modeGate: 'chart',
    labelKey: 'options.chart_point_size.label', descriptionKey: 'options.chart_point_size.description'
  },
  chart_show_boxplot: {
    category: 'chart', type: 'boolean', default: false, enum: null,
    appliesTo: ['has_n', 'has_nq', 'has_qn', 'has_ln', 'has_nl', 'has_paired_n'], modeGate: 'chart',
    labelKey: 'options.chart_show_boxplot.label', descriptionKey: 'options.chart_show_boxplot.description'
  },
  chart_show_points: {
    category: 'chart', type: 'boolean', default: true, enum: null,
    // Same appliesTo as chart_show_boxplot: the two toggles together control the numeric
    // chart layer stack (box overlay + points/crossbar layer). Both off → empty axes.
    appliesTo: ['has_n', 'has_nq', 'has_qn', 'has_ln', 'has_nl', 'has_paired_n'], modeGate: 'chart',
    labelKey: 'options.chart_show_points.label', descriptionKey: 'options.chart_show_points.description'
  },
  chart_central_tendency: {
    category: 'chart', type: 'enum', default: 'mean',
    enum: ['mean', 'median'],
    // Same numeric-chart appliesTo; the enum switches the crossbar position between the
    // arithmetic mean and the median (useful for asymmetric data). Bubble Panel should
    // conditionally hide this dropdown when chart_show_points is unchecked — no gating
    // flag is emitted for that since it's an option-value dependency, not data-driven.
    appliesTo: ['has_n', 'has_nq', 'has_qn', 'has_ln', 'has_nl', 'has_paired_n'], modeGate: 'chart',
    labelKey: 'options.chart_central_tendency.label', descriptionKey: 'options.chart_central_tendency.description'
  },
  chart_label_format: {
    category: 'chart', type: 'enum', default: 'n',
    enum: ['n', 'p', 'np'],
    appliesTo: ['has_q', 'has_l', 'has_qq', 'has_lq', 'has_ql', 'has_paired_q'], modeGate: 'chart',
    labelKey: 'options.chart_label_format.label', descriptionKey: 'options.chart_label_format.description'
  },
  chart_paired_show_lines: {
    category: 'chart', type: 'boolean', default: true, enum: null,
    appliesTo: ['has_paired_n'], modeGate: 'chart',
    labelKey: 'options.chart_paired_show_lines.label', descriptionKey: 'options.chart_paired_show_lines.description'
  },
  chart_likert_enabled: {
    category: 'chart', type: 'boolean', default: false, enum: null,
    appliesTo: ['has_likert_eligible'], modeGate: 'chart',
    labelKey: 'options.chart_likert_enabled.label', descriptionKey: 'options.chart_likert_enabled.description'
  },
  // Axis TITLES — the variable's own label. Universal: every chart has axis titles, and a long
  // variable label overflows regardless of shape. Kept apart from chart_x_label_wrap because a
  // title spans the whole plot width while a category tick gets only its own slot, so the two want
  // different numbers.
  chart_title_wrap: {
    // Hidden under Likert for the same reason as the y-axis title it used to wrap: the only axis
    // title left there is "%", a single word that can never wrap. It also removes the collision
    // this option had with `chart_x_label_wrap`'s Likert label, which was a plural apart from it.
    likertHidden: true,
    category: 'chart', type: 'number', default: 8, enum: null,
    appliesTo: [], modeGate: 'chart',
    labelKey: 'options.chart_title_wrap.label', descriptionKey: 'options.chart_title_wrap.description'
  },
  // One chart per row instead of two. Universal in chart mode: it is a layout choice about the
  // grid, not about any particular analysis shape. `auto` keeps the two-column grid, capping a
  // trailing odd cell by aspect; `full` gives every chart the element's whole width, for the
  // occasional chart that genuinely needs it (many categories, long level names).
  // Bar-family only. `auto` is the shared heuristic (more than 6 categories, or labels still wider
  // than 4 words after chart_x_label_wrap); the other two force it. Likert is excluded on purpose —
  // a 100% stacked bar is horizontal by definition — so the option can be visible for a
  // likert-eligible element and simply not affect that chart.
  chart_bar_orientation: {
    category: 'chart', type: 'enum', default: 'auto',
    enum: ['auto', 'vertical', 'horizontal'],
    appliesTo: ['has_q', 'has_l', 'has_qq', 'has_lq', 'has_ql', 'has_ll', 'has_paired_q'],
    modeGate: 'chart',
    labelKey: 'options.chart_bar_orientation.label', descriptionKey: 'options.chart_bar_orientation.description'
  },
  chart_width_mode: {
    category: 'chart', type: 'enum', default: 'auto',
    enum: ['auto', 'full'], appliesTo: [], modeGate: 'chart',
    labelKey: 'options.chart_width_mode.label', descriptionKey: 'options.chart_width_mode.description'
  },
  chart_x_label_wrap: {
    likertLabelKey: 'options.chart_x_label_wrap.likertLabel',
    likertDescriptionKey: 'options.chart_x_label_wrap.likertDescription',
    category: 'chart', type: 'number', default: 3, enum: null,
    appliesTo: CATEGORICAL_X_AXIS, modeGate: 'chart',
    labelKey: 'options.chart_x_label_wrap.label', descriptionKey: 'options.chart_x_label_wrap.description'
  },
  chart_include_zero: {
    category: 'chart', type: 'boolean', default: false, enum: null,
    appliesTo: ['has_n', 'has_nq', 'has_qn', 'has_nn', 'has_ln', 'has_nl', 'has_paired_n'], modeGate: 'chart',
    labelKey: 'options.chart_include_zero.label', descriptionKey: 'options.chart_include_zero.description'
  },
  chart_interactive: {
    category: 'chart', type: 'boolean', default: false, enum: null,
    // Always relevant in chart mode (empty appliesTo). Default false → charts render
    // static (no hover crosshair, no zoom/pan, no double-click reset). Enabling
    // surfaces Plotly's native interactive gestures on the rendered figure.
    appliesTo: [], modeGate: 'chart',
    labelKey: 'options.chart_interactive.label', descriptionKey: 'options.chart_interactive.description'
  },
  // ----- title / axis title visibility (chart mode only) -----
  // Consolidation-of-title-labels feature. Defaults chosen to preserve information
  // per axis (both axis titles ON) while starting with the main title hidden — the
  // combined-cell heading tends to duplicate what the axis titles now carry, so the
  // opt-in surfaces it only when the user explicitly wants it.
  chart_show_title: {
    category: 'chart', type: 'boolean', default: false, enum: null,
    appliesTo: [], modeGate: 'chart',
    labelKey: 'options.chart_show_title.label', descriptionKey: 'options.chart_show_title.description'
  },
  chart_show_xaxis_title: {
    category: 'chart', type: 'boolean', default: true, enum: null,
    appliesTo: [], modeGate: 'chart',
    labelKey: 'options.chart_show_xaxis_title.label', descriptionKey: 'options.chart_show_xaxis_title.description'
  },
  chart_show_yaxis_title: {
    // The Likert chart emits no y-axis title, so there is nothing here to show or hide.
    likertHidden: true,
    category: 'chart', type: 'boolean', default: true, enum: null,
    appliesTo: [], modeGate: 'chart',
    labelKey: 'options.chart_show_yaxis_title.label', descriptionKey: 'options.chart_show_yaxis_title.description'
  },
  // ----- legend styling (only relevant for multi-trace charts: q×q, paired-q, likert
  // and their l-expansion variants). Empty appliesTo would surface these on charts
  // without any legend at all (chart_q, chart_n, etc.), which would be a no-op UX
  // annoyance. Gate by the flags whose emitted charts actually render a legend.
  chart_legend_position: {
    category: 'chart', type: 'enum', default: 'top',
    enum: ['top', 'right', 'bottom'],
    // Legends only render on multi-trace charts: Profile C (q×q + list-expansion variants),
    // Profile B paired_q, and Profile A likert. `has_likert_eligible` (not `has_q`) gates
    // the Profile A case — chart_q single-bar has no legend, so `has_q` was casting too
    // wide a net and surfacing legend controls on Elements where they had no effect.
    appliesTo: ['has_qq', 'has_lq', 'has_ql', 'has_ll', 'has_paired_q', 'has_likert_eligible'], modeGate: 'chart',
    labelKey: 'options.chart_legend_position.label', descriptionKey: 'options.chart_legend_position.description'
  },
  chart_show_legend_title: {
    category: 'chart', type: 'boolean', default: true, enum: null,
    appliesTo: ['has_qq', 'has_lq', 'has_ql', 'has_ll', 'has_paired_q'], modeGate: 'chart',
    labelKey: 'options.chart_show_legend_title.label', descriptionKey: 'options.chart_show_legend_title.description'
  },
  // Split wraps: legend title (on top of the legend) has more horizontal room than
  // individual entries stacked vertically → higher default (4). Entries default 2 —
  // shorter labels stay compact so trace pills don't blow up horizontally.
  chart_legend_title_wrap: {
    category: 'chart', type: 'number', default: 4, enum: null,
    appliesTo: ['has_qq', 'has_lq', 'has_ql', 'has_ll', 'has_paired_q'], modeGate: 'chart',
    labelKey: 'options.chart_legend_title_wrap.label', descriptionKey: 'options.chart_legend_title_wrap.description'
  },
  chart_legend_labels_wrap: {
    category: 'chart', type: 'number', default: 2, enum: null,
    // Same rationale as chart_legend_position: gate the Profile A case on the more
    // precise `has_likert_eligible` flag rather than the broader `has_q`.
    appliesTo: ['has_qq', 'has_lq', 'has_ql', 'has_ll', 'has_paired_q', 'has_likert_eligible'], modeGate: 'chart',
    labelKey: 'options.chart_legend_labels_wrap.label', descriptionKey: 'options.chart_legend_labels_wrap.description'
  }
};

/**
 * Filter `OPTION_METADATA` by the current `Analysis_flags` and Element mode. Returns the
 * subset of options that should be visible/editable in `Panel_element_options`.
 *
 * Gating logic:
 *   1. `modeGate` mismatch with `mode` → hidden
 *   2. `appliesTo` non-empty AND no overlap with `flags` → hidden
 *   3. otherwise → visible
 *
 * Each returned entry carries the option `name` alongside its metadata fields.
 *
 * @param {string[]} flags Analysis_flags emitted by the latest runAnalysis call.
 * @param {'table'|'chart'=} mode Current Element mode (defaults to 'table').
 * @returns {Array<OptionMetadata & {name: string}>}
 */
ns.getAvailableOptions = function (flags, mode = 'table', options = undefined) {
  const flagSet = new Set(Array.isArray(flags) ? flags : []);
  const likert = options?.chart_likert_enabled === true;
  /** @type {Array<OptionMetadata & {name:string}>} */
  const out = [];
  for (const [name, meta] of Object.entries(ns.OPTION_METADATA)) {
    if (meta.modeGate && meta.modeGate !== mode) continue;
    // `likertHidden` marks an option the Likert chart gives nothing to act on. Gated on the option
    // VALUE, like the Likert wording above, because the flag only says the data COULD be drawn that
    // way. Passing no bag keeps every option visible, which is the previous behaviour.
    if (likert && meta.likertHidden) continue;
    if (meta.appliesTo.length > 0) {
      const overlaps = meta.appliesTo.some((f) => flagSet.has(f));
      if (!overlaps) continue;
    }
    out.push({ name, ...meta });
  }
  return out;
};

/**
 * Which i18n key describes an option right now. Three layers, most specific first.
 *
 * The `likert*` layer exists because one option can name different things depending on ANOTHER
 * option's value: `chart_x_label_wrap` wraps whatever sits on the category axis, and in Likert mode
 * that axis holds the VARIABLE names rather than the level names. Calling it "category labels"
 * there sends the reader looking for a control over something else.
 *
 * The condition is the option's VALUE, not a flag. `has_likert_eligible` only says the data COULD
 * be rendered that way, and while the toggle is off the axis really does hold categories — keying
 * on the flag would mislabel the more common case to fix the rarer one.
 *
 * `options` is optional, so a caller with no bag to hand keeps the previous behaviour.
 * @param {any} meta
 * @param {'label'|'description'} kind
 * @param {string=} mode
 * @param {any=} options
 */
const resolveWordingKey = (meta, kind, mode, options) => {
  const suffix = kind === 'label' ? 'Label' : 'Description';
  if (options && options.chart_likert_enabled === true && meta['likert' + suffix + 'Key']) {
    return meta['likert' + suffix + 'Key'];
  }
  if (mode === 'chart' && meta['chart' + suffix + 'Key']) return meta['chart' + suffix + 'Key'];
  return meta[kind + 'Key'];
};

/**
 * Localized label lookup for a single option. Convenience wrapper around `translate`.
 * @param {string} optionName
 * @param {string=} lang
 * @returns {string}
 */
ns.getOptionLabel = function (optionName, lang, mode = undefined, options = undefined) {
  const meta = ns.OPTION_METADATA[optionName];
  if (!meta) return optionName;
  return translate(resolveWordingKey(meta, 'label', mode, options), lang);
};

/**
 * Localized description (tooltip text) for a single option.
 * @param {string} optionName
 * @param {string=} lang
 * @returns {string}
 */
ns.getOptionDescription = function (optionName, lang, mode = undefined, options = undefined) {
  const meta = ns.OPTION_METADATA[optionName];
  if (!meta) return '';
  return translate(resolveWordingKey(meta, 'description', mode, options), lang);
};

/**
 * Resolved default value for an option, handling i18n-translated defaults uniformly.
 *
 * Options with `default !== null` return the static metadata default directly. Options
 * with `default === null` (i18n-resolved: `lang`, `missing_label`, `yes_label`,
 * `no_label`, `residual_symbols`) delegate to `getDefaultAnalysisOptions({lang})` so the
 * resolution logic stays in a single place — never reinterpret the `defaultI18nKey`
 * sentinels outside of `driver.js`.
 *
 * Intended for UI widget initialization: `working_options[name] ?? getOptionDefault(name, lang)`
 * produces the value the user expects to see whether or not the Element has saved options.
 *
 * The declared default for an option. Note there are no CONTEXT-dependent defaults: one was tried
 * for `chart_show_yaxis_title` under Likert and could not work, because `getDefaultAnalysisOptions`
 * reaches a default only when the key is ABSENT and the panel pre-populates every option while the
 * element is still in table mode. An option the Likert chart cannot act on is hidden instead — see
 * `likertHidden`.
 * @param {string} optionName
 * @param {string=} lang
 */
ns.getOptionDefault = function (optionName, lang) {
  const meta = ns.OPTION_METADATA[optionName];
  if (!meta) return undefined;
  if (meta.default !== null) return meta.default;
  // i18n-resolved: delegate to driver's normalizer so the resolution logic is DRY.
  const resolved = /** @type {any} */ (driver).getDefaultAnalysisOptions({ lang });
  return resolved[optionName];
};

export default ns;
