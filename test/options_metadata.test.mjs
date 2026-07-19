import test from "node:test";
import assert from "node:assert/strict";
import driver from "../json/driver.js";
import optionsMetadata from "../json/options_metadata.js";

const { OPTION_METADATA, getAvailableOptions } = optionsMetadata;

// Canonical universe of has_* flags emitted by runAnalysis. Drift-tested below; if a new
// flag is added in driver.js, this list must be updated AND any OPTION_METADATA entry
// referencing the new flag in appliesTo will pass.
const KNOWN_FLAGS = new Set([
  'has_q', 'has_n', 'has_l',
  'has_qq', 'has_nq', 'has_qn', 'has_nn', 'has_lq', 'has_ql', 'has_ln', 'has_ll',
  'has_residuals', 'has_tukey', 'has_kruskal_sign',
  'has_paired', 'has_paired_n', 'has_paired_q',
  'has_multi_db_broadcast', 'has_multi_db_missing_response',
  'has_likert_eligible'
]);

// Options whose default is resolved at runtime via i18n (lang, missing_label, yes_label,
// no_label, residual_symbols). They declare `default: null` + `defaultI18nKey` sentinel;
// the drift check asserts the runtime value is defined rather than strictly equal.
const I18N_RESOLVED = new Set(['lang', 'missing_label', 'yes_label', 'no_label', 'residual_symbols']);

// ---------------------------------------------------------------------------
// Coverage: every option in getDefaultAnalysisOptions is catalogued, and nothing extra.
// ---------------------------------------------------------------------------

test("OPTION_METADATA covers every key in getDefaultAnalysisOptions({})", () => {
  const defaults = driver.getDefaultAnalysisOptions({});
  const defaultKeys = Object.keys(defaults).sort();
  const metaKeys = Object.keys(OPTION_METADATA).sort();
  assert.deepEqual(metaKeys, defaultKeys,
    `Drift detected. Defaults: ${defaultKeys.length}; metadata: ${metaKeys.length}. Add/remove entries in OPTION_METADATA to match.`);
});

// ---------------------------------------------------------------------------
// Defaults parity: static defaults equal the runtime; i18n-resolved defaults are just defined.
// ---------------------------------------------------------------------------

test("OPTION_METADATA.default matches getDefaultAnalysisOptions runtime defaults", () => {
  const defaults = driver.getDefaultAnalysisOptions({ lang: 'en_us' });
  for (const [name, meta] of Object.entries(OPTION_METADATA)) {
    const runtime = defaults[name];
    if (I18N_RESOLVED.has(name)) {
      assert.equal(meta.default, null, `${name}: i18n-resolved options must declare default: null`);
      assert.ok(meta.defaultI18nKey, `${name}: i18n-resolved options must declare defaultI18nKey`);
      assert.ok(runtime !== undefined, `${name}: runtime default should be defined`);
      continue;
    }
    assert.deepEqual(runtime, meta.default,
      `${name}: metadata.default (${JSON.stringify(meta.default)}) != runtime (${JSON.stringify(runtime)})`);
  }
});

// ---------------------------------------------------------------------------
// appliesTo references only known flags.
// ---------------------------------------------------------------------------

test("OPTION_METADATA.appliesTo entries reference only known has_* flags", () => {
  for (const [name, meta] of Object.entries(OPTION_METADATA)) {
    for (const flag of meta.appliesTo) {
      assert.ok(KNOWN_FLAGS.has(flag),
        `${name}.appliesTo contains unknown flag "${flag}". Add it to KNOWN_FLAGS or fix the metadata.`);
    }
  }
});

// ---------------------------------------------------------------------------
// Required fields are present for every entry.
// ---------------------------------------------------------------------------

test("every OPTION_METADATA entry has the required schema fields", () => {
  const REQUIRED = ['category', 'type', 'enum', 'appliesTo', 'modeGate', 'labelKey', 'descriptionKey'];
  const CATEGORIES = new Set(['inferential', 'descriptive', 'table', 'chart', 'output', 'i18n']);
  const TYPES = new Set(['boolean', 'number', 'string', 'enum', 'multiselect', 'object']);
  const MODE_GATES = new Set(['table', 'chart', null]);
  for (const [name, meta] of Object.entries(OPTION_METADATA)) {
    REQUIRED.forEach((field) => assert.ok(field in meta, `${name}: missing ${field}`));
    assert.ok(CATEGORIES.has(meta.category), `${name}: invalid category "${meta.category}"`);
    assert.ok(TYPES.has(meta.type), `${name}: invalid type "${meta.type}"`);
    assert.ok(Array.isArray(meta.appliesTo), `${name}: appliesTo must be an array`);
    assert.ok(MODE_GATES.has(meta.modeGate), `${name}: invalid modeGate "${meta.modeGate}"`);
    if (meta.type === 'enum' || meta.type === 'multiselect') {
      assert.ok(Array.isArray(meta.enum) && meta.enum.length > 0,
        `${name}: type=${meta.type} requires a non-empty enum`);
    }
  }
});

// ---------------------------------------------------------------------------
// getAvailableOptions gating logic.
// ---------------------------------------------------------------------------

test("getAvailableOptions([], 'table') returns only mode-agnostic + table-mode options without appliesTo gate", () => {
  const out = getAvailableOptions([], 'table');
  const names = out.map((o) => o.name);
  // mode=table → chart-only options excluded.
  for (const o of out) {
    assert.ok(o.modeGate === null || o.modeGate === 'table', `${o.name}: leaked through table-mode filter`);
    // No flags → only options with empty appliesTo should appear.
    assert.equal(o.appliesTo.length, 0, `${o.name}: appliesTo non-empty but no flags supplied`);
  }
  // Always-relevant options: at minimum mode, lang, symbol_style, chart_x_label_wrap (well, that's chart-only).
  assert.ok(names.includes('mode'));
  assert.ok(names.includes('lang'));
});

test("getAvailableOptions(['has_qq'], 'table') includes with_residuals + effect_size_type + alpha; excludes chart_*", () => {
  const out = getAvailableOptions(['has_qq'], 'table');
  const names = new Set(out.map((o) => o.name));
  assert.ok(names.has('with_residuals'), 'with_residuals applies to has_qq');
  assert.ok(names.has('effect_size_type'), 'effect_size_type applies to has_qq');
  assert.ok(names.has('alpha'), 'alpha applies to has_qq');
  assert.ok(names.has('percent_by'), 'percent_by applies to has_qq');
  for (const o of out) {
    assert.ok(!o.name.startsWith('chart_'), `${o.name}: chart-only option leaked through mode=table filter`);
  }
});

test("getAvailableOptions(['has_qq'], 'chart') includes chart_label_format + chart_theme; excludes with_residuals", () => {
  const out = getAvailableOptions(['has_qq'], 'chart');
  const names = new Set(out.map((o) => o.name));
  assert.ok(names.has('chart_label_format'), 'chart_label_format applies to has_qq');
  assert.ok(names.has('chart_theme'), 'chart_theme is always-relevant in chart mode');
  assert.equal(names.has('with_residuals'), false, 'with_residuals is table-only');
  assert.equal(names.has('percent_by'), false, 'percent_by is table-only');
});

test("getAvailableOptions(['has_n'], 'chart') includes chart_show_boxplot + chart_include_zero", () => {
  const out = getAvailableOptions(['has_n'], 'chart');
  const names = new Set(out.map((o) => o.name));
  assert.ok(names.has('chart_show_boxplot'));
  assert.ok(names.has('chart_include_zero'));
  assert.ok(names.has('chart_point_size'));
});

test("getAvailableOptions(['has_paired_n'], 'chart') includes chart_paired_show_lines", () => {
  const out = getAvailableOptions(['has_paired_n'], 'chart');
  const names = out.map((o) => o.name);
  assert.ok(names.includes('chart_paired_show_lines'));
});

test("getAvailableOptions(flags, mode) returned entries carry name + all metadata fields", () => {
  const out = getAvailableOptions(['has_qq'], 'table');
  assert.ok(out.length > 0);
  for (const o of out) {
    assert.ok(typeof o.name === 'string');
    assert.ok(typeof o.category === 'string');
    assert.ok(typeof o.type === 'string');
    assert.ok(typeof o.labelKey === 'string');
  }
});

// ---------------------------------------------------------------------------
// i18n keys exist for every option.
// ---------------------------------------------------------------------------

test("getOptionDefault: static defaults returned directly", () => {
  assert.equal(optionsMetadata.getOptionDefault('alpha', 'en_us'), 0.05);
  assert.equal(optionsMetadata.getOptionDefault('with_residuals', 'en_us'), true);
  assert.equal(optionsMetadata.getOptionDefault('effect_size_type', 'en_us'), 'odds_ratio');
  assert.equal(optionsMetadata.getOptionDefault('mode', 'en_us'), 'table');
  assert.deepEqual(optionsMetadata.getOptionDefault('stat_options_numeric', 'en_us'),
    ['min', 'max', 'mean_sd', 'n_missing']);
});

test("getOptionDefault: i18n-resolved defaults return the translated runtime value", () => {
  // missing_label: 'Not informed' (en) / 'Não informado' (pt) / 'No informado' (es)
  assert.equal(optionsMetadata.getOptionDefault('missing_label', 'en_us'), 'Not informed');
  assert.equal(optionsMetadata.getOptionDefault('missing_label', 'pt_br'), 'Não informado');
  assert.equal(optionsMetadata.getOptionDefault('missing_label', 'es_es'), 'No informado');
  // yes/no labels follow binary translation
  assert.equal(optionsMetadata.getOptionDefault('yes_label', 'en_us'), 'Yes');
  assert.equal(optionsMetadata.getOptionDefault('yes_label', 'pt_br'), 'Sim');
  assert.equal(optionsMetadata.getOptionDefault('no_label', 'pt_br'), 'Não');
  // residual_symbols is an object with greater/lower keys
  const sym = optionsMetadata.getOptionDefault('residual_symbols', 'en_us');
  assert.equal(typeof sym, 'object');
  assert.ok(sym.greater);
  assert.ok(sym.lower);
});

test("getOptionDefault: unknown option returns undefined", () => {
  assert.equal(optionsMetadata.getOptionDefault('not_a_real_option', 'en_us'), undefined);
});

test("getOptionDefault output matches getDefaultAnalysisOptions for every option", () => {
  // The whole point of the helper: a per-option call should produce the same value as
  // reading from the normalized defaults bag.
  const bag = driver.getDefaultAnalysisOptions({ lang: 'en_us' });
  for (const name of Object.keys(OPTION_METADATA)) {
    assert.deepEqual(optionsMetadata.getOptionDefault(name, 'en_us'), bag[name],
      `getOptionDefault('${name}', 'en_us') drift vs getDefaultAnalysisOptions`);
  }
});

test("getOptionLabel / getOptionDescription resolve all options in en_us, pt_br, es_es", () => {
  const langs = ['en_us', 'pt_br', 'es_es'];
  for (const name of Object.keys(OPTION_METADATA)) {
    for (const lang of langs) {
      const label = optionsMetadata.getOptionLabel(name, lang);
      const desc = optionsMetadata.getOptionDescription(name, lang);
      assert.ok(label && label !== `options.${name}.label`,
        `Missing i18n label for ${name} in ${lang}; got "${label}"`);
      assert.ok(desc && desc !== `options.${name}.description`,
        `Missing i18n description for ${name} in ${lang}; got "${desc}"`);
    }
  }
});
