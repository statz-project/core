import test from "node:test";
import assert from "node:assert/strict";
import { Statz } from "../index.js";
import helpTopics from "../json/help_topics.js";
import { TEST_KEYS, translate, getMessages } from "../i18n/index.js";
import { KNOWN_FLAGS } from "./_known_flags.mjs";
import { parseFixture } from "../scripts/dev/load-fixture.mjs";
import statistics from "./helpers/stdlib_stats.mjs";
import jStat from "jstat";
import * as simpleStatistics from "simple-statistics";

// The end-to-end test runs a real analysis, so the namespace needs its curated libraries,
// exactly as stats.test.mjs wires them.
globalThis.Statz = Statz;
Statz.stdlibStats = statistics;
Statz.jStat = jStat;
Statz.simpleStatistics = simpleStatistics;

const { HELP_TOPICS, HELP_TOPIC_IDS, HELP_CATEGORY_ORDER, getAvailableHelpTopics, getHelpTopicLabel } = helpTopics;
const LANGS = ['pt_br', 'en_us', 'es_es'];

// ---------------------------------------------------------------------------
// Structural guards: the catalogue may only reference vocabulary that exists.
// ---------------------------------------------------------------------------

test("every appliesTo flag is a real has_* flag", () => {
  for (const [id, meta] of Object.entries(HELP_TOPICS)) {
    for (const flag of meta.appliesTo) {
      assert.ok(KNOWN_FLAGS.has(flag),
        'HELP_TOPICS.' + id + '.appliesTo cites unknown flag "' + flag + '"');
    }
  }
});

test("every requiresTestKey is a real test key", () => {
  for (const [id, meta] of Object.entries(HELP_TOPICS)) {
    for (const key of meta.requiresTestKey) {
      assert.ok(TEST_KEYS.includes(key),
        'HELP_TOPICS.' + id + '.requiresTestKey cites unknown test "' + key + '"');
    }
  }
});

// The orphan guard, in both directions. `tests.rmAnova` existed in three locales while no
// branch ever assigned it; a help badge for a test that cannot run is worse than no badge.
test("every test key has exactly one method topic, and vice versa", () => {
  const covered = Object.values(HELP_TOPICS)
    .filter((m) => m.category === 'method')
    .flatMap((m) => m.requiresTestKey)
    .sort();
  assert.deepEqual(covered, [...TEST_KEYS].sort(),
    'Method topics and tests.* must be a bijection.');
});

test("every seeAlso points at an existing topic", () => {
  for (const [id, meta] of Object.entries(HELP_TOPICS)) {
    for (const ref of meta.seeAlso) {
      assert.ok(HELP_TOPIC_IDS.includes(ref),
        'HELP_TOPICS.' + id + '.seeAlso cites unknown topic "' + ref + '"');
      assert.notEqual(ref, id, id + ' lists itself in seeAlso');
    }
  }
});

test("every labelKey resolves to real text in all three languages", () => {
  for (const [id, meta] of Object.entries(HELP_TOPICS)) {
    for (const lang of LANGS) {
      // Resolved against the locale's own dictionary rather than through `translate`, which
      // would fall back to en_us and report success for a key this language never defines.
      const own = meta.labelKey.split('.').reduce((node, k) => (node ?? {})[k], getMessages(lang));
      assert.equal(typeof own, 'string',
        'Missing i18n key ' + meta.labelKey + ' in ' + lang + ' (for topic ' + id + ')');
      assert.ok(own.length > 0, id + ' label is empty in ' + lang);
      assert.equal(translate(meta.labelKey, lang), own);
    }
  }
});

test("optionGate and modeGate only cite real values", () => {
  const defaults = Statz.getDefaultAnalysisOptions({});
  for (const [id, meta] of Object.entries(HELP_TOPICS)) {
    if (meta.optionGate) {
      assert.ok(Object.prototype.hasOwnProperty.call(defaults, meta.optionGate),
        'HELP_TOPICS.' + id + '.optionGate cites unknown option "' + meta.optionGate + '"');
    }
    if (meta.modeGate) {
      assert.ok(['table', 'chart'].includes(meta.modeGate), id + ' has a bogus modeGate');
    }
  }
});

// ---------------------------------------------------------------------------
// Gating behaviour.
// ---------------------------------------------------------------------------

const legend = (...keys) => ({
  lang: 'en_us',
  test_legend: keys.map((k, i) => ({ key: k, method: k, symbol: String(i) }))
});
const ids = (list) => list.map((t) => t.id);

test("a method topic stays hidden until a result says that test ran", () => {
  const flags = ['has_nq'];
  const blind = getAvailableHelpTopics(flags, undefined, { mode: 'table' });
  assert.equal(blind.filter((t) => t.category === 'method').length, 0,
    'Without a result nothing can honestly claim a test ran.');

  const shown = ids(getAvailableHelpTopics(flags, legend('kruskalWallis'), { mode: 'table' }));
  assert.ok(shown.includes('kruskalWallis'));
  // has_nq admits five different tests; only the one that ran may show.
  for (const other of ['anova', 'welchAnova', 'tStudent', 'mannWhitney']) {
    assert.ok(!shown.includes(other), 'has_nq must not surface ' + other + ' when Kruskal ran');
  }
});

test("post-hoc topics follow their own flag, not the omnibus test", () => {
  const withTukey = ids(getAvailableHelpTopics(['has_nq', 'has_tukey'], legend('anova'), { mode: 'table' }));
  assert.ok(withTukey.includes('tukey'));
  assert.ok(!withTukey.includes('dunn'));
  assert.ok(!withTukey.includes('gamesHowell'));

  const noPosthoc = ids(getAvailableHelpTopics(['has_nq'], legend('anova'), { mode: 'table' }));
  assert.ok(!noPosthoc.includes('tukey'), 'ANOVA without a significant result has no Tukey table');
  assert.ok(!noPosthoc.includes('multipleComparisons'));
});

test("optionGate hides topics about output the user turned off", () => {
  const flags = ['has_qq', 'has_residuals'];
  const on = ids(getAvailableHelpTopics(flags, legend('chiSquare'),
    { mode: 'table', with_residuals: true, with_effect_sizes: true }));
  assert.ok(on.includes('standardizedResiduals'));
  assert.ok(on.includes('effectSize'));

  const off = ids(getAvailableHelpTopics(flags, legend('chiSquare'),
    { mode: 'table', with_residuals: false, with_effect_sizes: false }));
  assert.ok(!off.includes('standardizedResiduals'));
  assert.ok(!off.includes('effectSize'));
});

test("modeGate hides table-only topics on a chart element", () => {
  const flags = ['has_qq', 'has_residuals'];
  const opts = { with_residuals: true, with_effect_sizes: true };
  const asTable = ids(getAvailableHelpTopics(flags, legend('chiSquare'), { ...opts, mode: 'table' }));
  const asChart = ids(getAvailableHelpTopics(flags, legend('chiSquare'), { ...opts, mode: 'chart' }));
  assert.ok(asTable.includes('standardizedResiduals'));
  assert.ok(!asChart.includes('standardizedResiduals'), 'Residual symbols are a table artefact');
  assert.ok(asChart.includes('chiSquare'), 'The test itself still ran, chart or not');
});

test("the categories are presented from the concrete to the abstract", () => {
  // Descriptive rows name something already visible in the table; concepts are background,
  // not the answer to "what am I looking at". Pinned here so a reorder is a deliberate edit
  // to a test, not a silent change of what the reader meets first.
  assert.deepEqual([...HELP_CATEGORY_ORDER], ['descriptive', 'method', 'posthoc', 'concept']);
  const categories = new Set(Object.values(HELP_TOPICS).map((m) => m.category));
  assert.deepEqual([...categories].sort(), [...HELP_CATEGORY_ORDER].sort(),
    'every category a topic declares must have a place in the order');
});

test("topics come back grouped by category and stably ordered", () => {
  const list = getAvailableHelpTopics(['has_nq', 'has_tukey'], legend('anova'), { mode: 'table' });
  // Read from the catalogue rather than restated here: a second copy of this list is how the
  // order silently diverges between the panel and the help page.
  const order = HELP_CATEGORY_ORDER;
  const seen = list.map((t) => order.indexOf(t.category));
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b), 'Categories must not interleave');
  const again = getAvailableHelpTopics(['has_nq', 'has_tukey'], legend('anova'), { mode: 'table' });
  assert.deepEqual(ids(list), ids(again), 'Ordering must be deterministic');
});

test("an element with no analysis gets no badges at all", () => {
  assert.deepEqual(getAvailableHelpTopics([], undefined, {}), []);
});

test("getHelpTopicLabel localizes, and flags an unknown id instead of blanking", () => {
  assert.equal(getHelpTopicLabel('chiSquare', 'pt_br'), translate('tests.chiSquare', 'pt_br'));
  assert.notEqual(getHelpTopicLabel('pValue', 'pt_br'), getHelpTopicLabel('pValue', 'en_us'));
  assert.equal(getHelpTopicLabel('nope', 'pt_br'), 'nope');
});

test("HELP_CATALOGUE_HASH fingerprints the id set", () => {
  assert.match(helpTopics.HELP_CATALOGUE_HASH, /^[0-9a-f]{8}$/);
  assert.equal(HELP_TOPIC_IDS.length, new Set(HELP_TOPIC_IDS).size, 'ids must be unique');
});

// ---------------------------------------------------------------------------
// End to end: the badge set must not depend on the language of the analysis.
// ---------------------------------------------------------------------------

test("the same data in two languages yields identical topics", () => {
  const { parsed } = parseFixture();
  const sex = Statz.getColumnValues(parsed, "col_sex_hash");
  const score = Statz.getColumnValues(parsed, "col_score_hash");
  const dbs = { test_db: { columns: [sex.column, score.column] } };
  const sig = (c, label, role) => JSON.stringify({
    database_id: "test_db", col_hash: c.column.col_hash, col_var_index: null, col_label: label, role
  });
  const runFor = (lang) => Statz.runAnalysis(
    [sig(sex, 'Sex', 'predictor')], [sig(score, 'Score', 'response')], dbs, { lang, mode: 'table' }
  );
  const pt = runFor('pt_br');
  const en = runFor('en_us');

  const topicsPt = ids(getAvailableHelpTopics(pt.flags, pt.result, { mode: 'table' }));
  const topicsEn = ids(getAvailableHelpTopics(en.flags, en.result, { mode: 'table' }));
  assert.deepEqual(topicsPt, topicsEn, 'Help routing must key on test_key, never on prose');
  assert.ok(topicsPt.some((id) => HELP_TOPICS[id].category === 'method'),
    'A real analysis must surface the method that ran: ' + topicsPt.join(','));

  // ...while the badge text itself does follow the language.
  assert.notEqual(getHelpTopicLabel('normality', 'pt_br'), getHelpTopicLabel('normality', 'en_us'));
});
