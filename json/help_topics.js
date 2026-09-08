// @ts-check
// Public catalogue of end-user help topics. Answers one question: given an Element's
// `Analysis_flags`, its `Result_json` and its options, WHICH help is relevant to it?
//
// Mirrors `options_metadata.js` deliberately, including the rule that matters most: this file
// stores stable ids and i18n KEYS, never prose. The badge label lives in `core/i18n`; the topic
// body lives in the separate `help` repo and reaches the page through its own bundle. Only a list
// of ids crosses that boundary, which is what lets the two ship on different cadences.
//
// The MAPPING belongs here even though the CONTENT does not, for the same reason the option
// catalogue does: it is the routing logic re-expressed. `summarize_n_q` picks between t,
// Mann-Whitney, ANOVA, Welch ANOVA and Kruskal-Wallis from the Lilliefors normality gate and
// Bartlett homoscedasticity. When that gate changed from a naive K-S to Lilliefors, the set of
// datasets landing on ANOVA rather than Kruskal-Wallis moved — silently, for every user. A mapping
// living in the UI or in the content repo would not have moved with it, and no test could have
// noticed.

import { translate } from '../i18n/index.js';
import { fnv1a } from './hashing.js';
import driver from './driver.js';

const ns = {};

// Flag groups, named so the catalogue below reads as intent rather than as lists of strings.
const ALL_INFERENTIAL = ['has_qq', 'has_nq', 'has_qn', 'has_nn', 'has_lq', 'has_ql', 'has_ln', 'has_nl', 'has_ll', 'has_paired_n', 'has_paired_q'];
const NUMERIC_ROUTE = ['has_nq', 'has_qn', 'has_ln', 'has_nl'];
const CROSSTAB = ['has_qq', 'has_lq', 'has_ql', 'has_ll'];
const LIST_EXPANDED = ['has_lq', 'has_ql', 'has_ln', 'has_nl', 'has_ll'];
const NUMERIC_DESCRIBED = ['has_n', 'has_nq', 'has_qn', 'has_ln', 'has_nl', 'has_paired_n'];

/**
 * @typedef {Object} HelpTopicMeta
 * @property {'method'|'posthoc'|'concept'|'descriptive'} category
 * @property {string[]} appliesTo        has_* flags that make the topic relevant; [] = not flag-gated
 * @property {string[]} requiresTestKey  test_key values that surface it; [] = not test-gated
 * @property {string|null} optionGate    option that must be truthy for the topic to be relevant
 * @property {'table'|'chart'|null} modeGate
 * @property {string} labelKey           i18n key for the badge text
 * @property {number} order              sort order within the category
 * @property {string[]} seeAlso          related topic ids
 */

/**
 * Method topics: one per test the core can run, gated on the test that ACTUALLY ran rather than on
 * a flag. `appliesTo` is empty on purpose — `has_nq` covers five different tests, so the flag can
 * say a comparison happened but never which one.
 * @param {string} testKey
 * @param {number} order
 * @param {string[]} seeAlso
 * @returns {HelpTopicMeta}
 */
const method = (testKey, order, seeAlso) => ({
  category: 'method', appliesTo: [], requiresTestKey: [testKey], optionGate: null, modeGate: null,
  labelKey: 'tests.' + testKey, order, seeAlso
});

/** @type {Record<string, HelpTopicMeta>} */
ns.HELP_TOPICS = {
  // ----- methods (14) -----------------------------------------------------------------
  tStudent: method('tStudent', 10, ['normality', 'homoscedasticity', 'pValue', 'mannWhitney']),
  mannWhitney: method('mannWhitney', 11, ['normality', 'tStudent', 'smallSample']),
  anova: method('anova', 12, ['tukey', 'normality', 'homoscedasticity', 'multipleComparisons']),
  welchAnova: method('welchAnova', 13, ['gamesHowell', 'homoscedasticity', 'anova']),
  kruskalWallis: method('kruskalWallis', 14, ['dunn', 'normality', 'multipleComparisons']),
  chiSquare: method('chiSquare', 20, ['standardizedResiduals', 'fisherExact', 'effectSize']),
  fisherExact: method('fisherExact', 21, ['chiSquare', 'smallSample', 'effectSize']),
  pearson: method('pearson', 30, ['spearman', 'normality', 'confidenceInterval']),
  spearman: method('spearman', 31, ['pearson', 'normality']),
  pairedT: method('pairedT', 40, ['wilcoxonSigned', 'normality']),
  wilcoxonSigned: method('wilcoxonSigned', 41, ['pairedT', 'smallSample']),
  friedman: method('friedman', 42, ['kruskalWallis', 'multipleComparisons']),
  mcnemar: method('mcnemar', 50, ['cochranQ', 'smallSample']),
  cochranQ: method('cochranQ', 51, ['mcnemar']),

  // ----- post-hoc (3) -----------------------------------------------------------------
  // Flag-gated and precise: one flag per post-hoc, emitted by the branch that ran it.
  tukey: {
    category: 'posthoc', appliesTo: ['has_tukey'], requiresTestKey: [], optionGate: null,
    modeGate: null, labelKey: 'help.topics.tukey.label', order: 10,
    seeAlso: ['anova', 'multipleComparisons']
  },
  gamesHowell: {
    category: 'posthoc', appliesTo: ['has_games_howell'], requiresTestKey: [], optionGate: null,
    modeGate: null, labelKey: 'help.topics.gamesHowell.label', order: 11,
    seeAlso: ['welchAnova', 'homoscedasticity', 'multipleComparisons']
  },
  dunn: {
    category: 'posthoc', appliesTo: ['has_kruskal_sign'], requiresTestKey: [], optionGate: null,
    modeGate: null, labelKey: 'help.topics.dunn.label', order: 12,
    seeAlso: ['kruskalWallis', 'multipleComparisons']
  },

  // ----- concepts (10) ----------------------------------------------------------------
  pValue: {
    category: 'concept', appliesTo: ALL_INFERENTIAL, requiresTestKey: [], optionGate: null,
    modeGate: null, labelKey: 'help.topics.pValue.label', order: 10,
    seeAlso: ['nullHypothesis', 'smallSample']
  },
  nullHypothesis: {
    category: 'concept', appliesTo: ALL_INFERENTIAL, requiresTestKey: [], optionGate: null,
    modeGate: null, labelKey: 'help.topics.nullHypothesis.label', order: 11, seeAlso: ['pValue']
  },
  smallSample: {
    category: 'concept', appliesTo: ALL_INFERENTIAL, requiresTestKey: [], optionGate: null,
    modeGate: null, labelKey: 'help.topics.smallSample.label', order: 12,
    seeAlso: ['pValue', 'confidenceInterval']
  },
  normality: {
    category: 'concept', appliesTo: [...NUMERIC_ROUTE, 'has_nn', 'has_paired_n'], requiresTestKey: [],
    optionGate: null, modeGate: null, labelKey: 'help.topics.normality.label', order: 20,
    seeAlso: ['homoscedasticity', 'medianIqr']
  },
  homoscedasticity: {
    category: 'concept', appliesTo: NUMERIC_ROUTE, requiresTestKey: [], optionGate: null,
    modeGate: null, labelKey: 'help.topics.homoscedasticity.label', order: 21,
    seeAlso: ['welchAnova', 'normality']
  },
  multipleComparisons: {
    category: 'concept', appliesTo: ['has_tukey', 'has_games_howell', 'has_kruskal_sign'],
    requiresTestKey: [], optionGate: null, modeGate: null,
    labelKey: 'help.topics.multipleComparisons.label', order: 22,
    seeAlso: ['tukey', 'dunn', 'gamesHowell']
  },
  confidenceInterval: {
    category: 'concept', appliesTo: [...CROSSTAB, 'has_nn'], requiresTestKey: [], optionGate: null,
    modeGate: null, labelKey: 'help.topics.confidenceInterval.label', order: 23,
    seeAlso: ['effectSize', 'pValue']
  },
  effectSize: {
    category: 'concept', appliesTo: CROSSTAB, requiresTestKey: [], optionGate: 'with_effect_sizes',
    modeGate: 'table', labelKey: 'help.topics.effectSize.label', order: 24,
    seeAlso: ['confidenceInterval', 'chiSquare']
  },
  standardizedResiduals: {
    category: 'concept', appliesTo: ['has_residuals'], requiresTestKey: [], optionGate: 'with_residuals',
    modeGate: 'table', labelKey: 'help.topics.standardizedResiduals.label', order: 25,
    seeAlso: ['chiSquare']
  },
  listExpansion: {
    category: 'concept', appliesTo: LIST_EXPANDED, requiresTestKey: [], optionGate: null,
    modeGate: null, labelKey: 'help.topics.listExpansion.label', order: 30, seeAlso: []
  },

  // ----- descriptive (3) --------------------------------------------------------------
  // Labels reuse `stats.labels.*`: the badge should read exactly as the table row it explains.
  meanSd: {
    category: 'descriptive', appliesTo: NUMERIC_DESCRIBED, requiresTestKey: [], optionGate: null,
    modeGate: null, labelKey: 'stats.labels.mean_sd', order: 10, seeAlso: ['medianIqr', 'normality']
  },
  medianIqr: {
    category: 'descriptive', appliesTo: NUMERIC_DESCRIBED, requiresTestKey: [], optionGate: null,
    modeGate: null, labelKey: 'stats.labels.median_iqr', order: 11, seeAlso: ['meanSd', 'normality']
  },
  frequencyPercent: {
    category: 'descriptive', appliesTo: ['has_q', 'has_l', ...CROSSTAB], requiresTestKey: [],
    optionGate: null, modeGate: null, labelKey: 'help.topics.frequencyPercent.label', order: 12,
    seeAlso: []
  }
};

/** Stable ids, in catalogue order. */
ns.HELP_TOPIC_IDS = Object.freeze(Object.keys(ns.HELP_TOPICS));

/**
 * Fingerprint of the id set. The help bundle is built against a catalogue; comparing the two
 * hashes at startup turns "someone forgot to paste the new bundle" into one console line rather
 * than a badge that mysteriously does nothing.
 */
ns.HELP_CATALOGUE_HASH = fnv1a(ns.HELP_TOPIC_IDS.join(','));

/**
 * Presentation order of the categories, from what the reader already understands towards what they
 * may not: the descriptive summaries name rows they can see in the table, the methods explain what
 * produced the p-value, the post-hoc tables refine it, and the concepts sit last because they are
 * the background rather than the answer to "what am I looking at".
 *
 * Exported because two surfaces present these badges - the Bubble panel and the standalone help
 * page - and an order restated in either would drift the first time it changed here.
 */
ns.HELP_CATEGORY_ORDER = Object.freeze(['descriptive', 'method', 'posthoc', 'concept']);

/**
 * The help topics relevant to one Element.
 *
 * Gating, in order: `modeGate`, then `optionGate`, then `requiresTestKey`, then `appliesTo`.
 *
 * A method topic asserts "this test ran", so it stays hidden unless a `result` is supplied AND one
 * of its test keys appears in it. Without a result nothing can honestly claim a test ran, and a
 * badge naming the wrong test is worse than a missing badge.
 *
 * @param {string[]} flags Analysis_flags
 * @param {any=} result Result_json, already parsed
 * @param {any=} options Analysis_options, for `optionGate` and `mode`
 * @returns {Array<HelpTopicMeta & {id: string}>}
 */
ns.getAvailableHelpTopics = function (flags, result = undefined, options = undefined) {
  const flagSet = new Set(Array.isArray(flags) ? flags : []);
  // Reused rather than reimplemented: the legacy-payload fallback lives in one tested place.
  const testKeys = new Set(result ? (/** @type {any} */ (driver).getTestKeysFromResult(result) || []) : []);
  const mode = options?.mode;
  const out = [];
  for (const [id, meta] of Object.entries(ns.HELP_TOPICS)) {
    if (meta.modeGate && mode && meta.modeGate !== mode) continue;
    if (meta.optionGate && options && !options[meta.optionGate]) continue;
    if (meta.requiresTestKey.length > 0 && !meta.requiresTestKey.some((k) => testKeys.has(k))) continue;
    if (meta.appliesTo.length > 0 && !meta.appliesTo.some((f) => flagSet.has(f))) continue;
    out.push({ id, ...meta });
  }
  const order = ns.HELP_CATEGORY_ORDER;
  out.sort((a, b) => (order.indexOf(a.category) - order.indexOf(b.category))
    || (a.order - b.order) || a.id.localeCompare(b.id));
  return out;
};

/**
 * Localized badge text for a topic. An unknown id returns the id itself — the same sentinel
 * `getOptionLabel` uses, so a missing topic shows up as a visible oddity rather than a blank chip.
 * @param {string} id
 * @param {string=} lang
 */
ns.getHelpTopicLabel = function (id, lang) {
  const meta = ns.HELP_TOPICS[id];
  return meta ? translate(meta.labelKey, lang) : id;
};

export default ns;
