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
  'has_lq', 'has_ql', 'has_ln', 'has_ll',
  'has_paired_n', 'has_paired_q'
];
const ALL_LIST_EXPAND = ['has_lq', 'has_ql', 'has_ln', 'has_ll'];
// Qualitative-shape flags — cells that render a "Not informed" bucket / missing category.
// Numeric analyses express missing counts via stat_options_* with `n_missing`, not via
// include_missing / missing_label, so `has_n` is deliberately excluded.
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
  alpha: {
    category: 'inferential', type: 'number', default: 0.05, enum: null,
    appliesTo: ALL_INFERENTIAL, modeGate: null,
    labelKey: 'options.alpha.label', descriptionKey: 'options.alpha.description'
  },
  adjust_kruskal: {
    category: 'inferential', type: 'string', default: 'bonferroni', enum: null,
    appliesTo: ['has_nq', 'has_qn', 'has_kruskal_sign'], modeGate: null,
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
  stat_options_by_group: {
    category: 'descriptive', type: 'multiselect',
    default: ['mean_sd'],
    enum: ['min', 'max', 'mean_sd', 'median_iqr', 'n', 'n_missing'],
    appliesTo: ['has_nq', 'has_qn', 'has_ln', 'has_paired_n'], modeGate: 'table',
    labelKey: 'options.stat_options_by_group.label', descriptionKey: 'options.stat_options_by_group.description'
  },
  stat_options: {
    category: 'descriptive', type: 'multiselect',
    default: ['mean_sd'],
    enum: ['min', 'max', 'mean_sd', 'median_iqr', 'n', 'n_missing'],
    appliesTo: ['has_nq', 'has_qn', 'has_ln', 'has_paired_n'], modeGate: 'table',
    labelKey: 'options.stat_options.label', descriptionKey: 'options.stat_options.description'
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
  symbol_style: {
    category: 'table', type: 'enum', default: 'numeric',
    enum: ['numeric', 'alpha'], appliesTo: [], modeGate: 'table',
    labelKey: 'options.symbol_style.label', descriptionKey: 'options.symbol_style.description'
  },
  percent_by: {
    category: 'table', type: 'enum', default: 'col',
    enum: ['col', 'row'], appliesTo: ['has_qq', 'has_lq', 'has_ql', 'has_ll'], modeGate: 'table',
    labelKey: 'options.percent_by.label', descriptionKey: 'options.percent_by.description'
  },
  label_list_with_column: {
    category: 'table', type: 'boolean', default: true, enum: null,
    appliesTo: ALL_LIST_EXPAND, modeGate: 'table',
    labelKey: 'options.label_list_with_column.label', descriptionKey: 'options.label_list_with_column.description'
  },
  with_residuals: {
    category: 'table', type: 'boolean', default: true, enum: null,
    appliesTo: ['has_qq', 'has_lq'], modeGate: 'table',
    labelKey: 'options.with_residuals.label', descriptionKey: 'options.with_residuals.description'
  },
  effect_size_type: {
    category: 'table', type: 'enum', default: 'odds_ratio',
    enum: ['odds_ratio', 'risk_ratio'],
    appliesTo: ['has_qq', 'has_lq', 'has_ql'], modeGate: 'table',
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
    enum: null, appliesTo: ALL_LIST_EXPAND, modeGate: 'table',
    labelKey: 'options.yes_label.label', descriptionKey: 'options.yes_label.description'
  },
  no_label: {
    category: 'table', type: 'string', default: null, defaultI18nKey: '__binary__',
    enum: null, appliesTo: ALL_LIST_EXPAND, modeGate: 'table',
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
    appliesTo: ['has_n', 'has_nq', 'has_qn', 'has_nn', 'has_ln', 'has_paired_n'], modeGate: 'chart',
    labelKey: 'options.chart_point_size.label', descriptionKey: 'options.chart_point_size.description'
  },
  chart_show_boxplot: {
    category: 'chart', type: 'boolean', default: false, enum: null,
    appliesTo: ['has_n', 'has_nq', 'has_qn', 'has_ln', 'has_paired_n'], modeGate: 'chart',
    labelKey: 'options.chart_show_boxplot.label', descriptionKey: 'options.chart_show_boxplot.description'
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
  chart_x_label_wrap: {
    category: 'chart', type: 'number', default: 3, enum: null,
    appliesTo: [], modeGate: 'chart',
    labelKey: 'options.chart_x_label_wrap.label', descriptionKey: 'options.chart_x_label_wrap.description'
  },
  chart_include_zero: {
    category: 'chart', type: 'boolean', default: true, enum: null,
    appliesTo: ['has_n', 'has_nq', 'has_qn', 'has_nn', 'has_ln', 'has_paired_n'], modeGate: 'chart',
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
    category: 'chart', type: 'boolean', default: true, enum: null,
    appliesTo: [], modeGate: 'chart',
    labelKey: 'options.chart_show_yaxis_title.label', descriptionKey: 'options.chart_show_yaxis_title.description'
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
ns.getAvailableOptions = function (flags, mode = 'table') {
  const flagSet = new Set(Array.isArray(flags) ? flags : []);
  /** @type {Array<OptionMetadata & {name:string}>} */
  const out = [];
  for (const [name, meta] of Object.entries(ns.OPTION_METADATA)) {
    if (meta.modeGate && meta.modeGate !== mode) continue;
    if (meta.appliesTo.length > 0) {
      const overlaps = meta.appliesTo.some((f) => flagSet.has(f));
      if (!overlaps) continue;
    }
    out.push({ name, ...meta });
  }
  return out;
};

/**
 * Localized label lookup for a single option. Convenience wrapper around `translate`.
 * @param {string} optionName
 * @param {string=} lang
 * @returns {string}
 */
ns.getOptionLabel = function (optionName, lang) {
  const meta = ns.OPTION_METADATA[optionName];
  if (!meta) return optionName;
  return translate(meta.labelKey, lang);
};

/**
 * Localized description (tooltip text) for a single option.
 * @param {string} optionName
 * @param {string=} lang
 * @returns {string}
 */
ns.getOptionDescription = function (optionName, lang) {
  const meta = ns.OPTION_METADATA[optionName];
  if (!meta) return '';
  return translate(meta.descriptionKey, lang);
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
 * @param {string} optionName
 * @param {string=} lang
 * @returns {any} The resolved default; `undefined` for unknown option names.
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
