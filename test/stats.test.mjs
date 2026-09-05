import test from "node:test";
import assert from "node:assert/strict";
import { Statz } from "../index.js";
import { parseFixture } from '../scripts/dev/load-fixture.mjs';
import statistics from './helpers/stdlib_stats.mjs';
import jStat from "jstat";
import * as simpleStatistics from "simple-statistics";
import driver from "../json/driver.js";

globalThis.Statz = Statz;           // make the namespace discoverable

Statz.stdlibStats = statistics;
Statz.jStat = jStat;
Statz.simpleStatistics = simpleStatistics;

const { parsed } = parseFixture();

test("run summarize_q_q get non-significant Fisher", () => {
  const predictor = Statz.getColumnValues(parsed, "col_outcome_hash");
  const response  = Statz.getColumnValues(parsed, "col_sex_hash");

  const result = Statz.summarize_q_q(predictor.rawValues, response.rawValues);
  
  assert.equal((result.test_used), Statz.translate('tests.fisherExact'))
  assert.equal((result.p_value).toFixed(3), '0.233')
    
});

test("run summarize_l for description of list variables", () => {
  const predictor = Statz.getColumnValues(parsed, "col_clinics_hash");

  const result = Statz.summarize_l(predictor.rawValues, ";");

  assert.deepEqual(result.rows[0], {Variable: "headache", Description: "68 (68.0%)"});

});

test("run summarize_q_q get non-significant Chi-square", () => {
  const predictor = Statz.getColumnValues(parsed, "col_outcome_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const result = Statz.summarize_q_q(predictor.rawValues, response.rawValues);
    
  assert.equal((result.test_used), Statz.translate('tests.chiSquare'))
  assert.equal((result.p_value).toFixed(3), '0.264')
    
});

test("run summarize_q_q get significant Chi-square", () => {
  const predictor = Statz.getColumnValues(parsed, "col_origin_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const result = Statz.summarize_q_q(predictor.rawValues, response.rawValues);

  assert.equal((result.test_used), Statz.translate('tests.chiSquare'))
  assert.equal((result.p_value).toFixed(3), '0.000')

  // check some residuals
  assert.equal(result.posthoc_residuals[0][0].toFixed(3), '-8.414')
  assert.equal(result.posthoc_residuals[1][2].toFixed(3), '-9.607')

  // check some greater than symbols
  assert.ok(/†$/.test(result.rows[0].middle))
  assert.ok(/†$/.test(result.rows[1].low))
    
});

test("summarize_l_q decomposes list predictors vs qualitative response", () => {
  const predictor = Statz.getColumnValues(parsed, "col_clinics_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const summaries = Statz.summarize_l_q(
    predictor.rawValues,
    response.rawValues,
    null,
    { lang: 'en_us' },
    { predictorLabel: "Clinics" }
  );

  assert.ok(Array.isArray(summaries));
  assert.ok(summaries.length > 0);

  const headacheSummary = summaries.find(entry => entry.label === 'headache');
  assert.ok(headacheSummary, "headache level should be summarized");
  assert.equal(headacheSummary.display_label, "Clinics: headache");
  assert.equal((headacheSummary.table.test_used), Statz.translate('tests.chiSquare'));
  assert.ok(Number.isFinite(headacheSummary.table.p_value));

});

test("run summarize_n_q get significant Mann–Whitney", () => {
  const predictor = Statz.getColumnValues(parsed, "col_score_hash");
  const response  = Statz.getColumnValues(parsed, "col_sex_hash");

  const result = Statz.summarize_n_q(predictor.rawValues, response.rawValues);
  
  const expected = {
    test: Statz.translate('tests.mannWhitney'),
    p: '0.01'
  };

  assert.equal((result.test_used), expected.test)
  assert.equal((result.p_value).toFixed(2), expected.p)
    
});

test("run summarize_n_q get significant t test", () => {
  const predictor = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const response  = Statz.getColumnValues(parsed, "col_sex_hash");

  const result = Statz.summarize_n_q(predictor.rawValues, response.rawValues);

  const expected = {
    test: Statz.translate('tests.tStudent'),
    p: '0.000'
  };

  assert.equal((result.test_used), expected.test)
  assert.equal((result.p_value).toFixed(3), expected.p)
    
});

test("run summarize_n_q get significant Kruskal–Wallis", () => {
  const predictor = Statz.getColumnValues(parsed, "col_score_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const result = Statz.summarize_n_q(predictor.rawValues, response.rawValues);
  
  const expected = {
    test: Statz.translate('tests.kruskalWallis'),
    p: '0.020',
    posthoc: [{"groupA":"low","groupB":"high","pValue":0.0185,"significant":true}]
  };

  assert.equal((result.test_used), expected.test)
  assert.equal((result.p_value).toFixed(3), expected.p)
  assert.deepEqual((result.posthoc), expected.posthoc)
    
});

test("run summarize_n_q get non-significant ANOVA", () => {
  const predictor = Statz.getColumnValues(parsed, "col_weight_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const result = Statz.summarize_n_q(predictor.rawValues, response.rawValues);

  // Kruskal, not ANOVA. This fixture used to route parametric on a normality gate that never
  // rejected: the `high` group (n = 43) has D = 0.1373 against a published Lilliefors critical
  // value of 0.886/√43 = 0.1351, so it fails at α = 0.05 — but read against a fully specified
  // N(0,1) the same D returns p = 0.3596 instead of 0.0395, and the group sailed through.
  assert.equal(result.test_used, Statz.translate('tests.kruskalWallis'));
  assert.equal(result.p_value, 0.7365);
  assert.equal(result.posthoc, null);
    
});

test("summarize_n_q runs ANOVA with Tukey posthoc when assumptions hold", () => {
  const predictor = ["1","2","3","4","5","6","7","8","9"];
  const response  = ["A","A","A","B","B","B","C","C","C"];

  const result = Statz.summarize_n_q(predictor, response);

  assert.equal(result.test_used, Statz.translate('tests.anova'));
  assert.equal(result.p_value.toFixed(3), '0.001');
  assert.deepEqual(result.posthoc[0], {groupA:"A",groupB:"B",pValue:0.0242,"significant":true});

});

// ---------------------------------------------------------------------------
// Phase 1: q × q effect sizes (OR/RR), q × l, l × n
// ---------------------------------------------------------------------------

test("summarize_q_q: emits OR/RR effect sizes for 2x2 tables", () => {
  // Use labels that sort alphabetically into [exposed, unexposed] × [outcome, none]
  // so observed[0][0] = "exposed × outcome" — the "a" cell in the OR/RR convention.
  const predictor = ['A_exposed','A_exposed','A_exposed','A_exposed','A_exposed','A_exposed',
                     'B_unexposed','B_unexposed','B_unexposed','B_unexposed','B_unexposed','B_unexposed'];
  const response  = ['A_outcome','A_outcome','A_outcome','A_outcome','B_none','B_none',
                     'A_outcome','B_none','B_none','B_none','B_none','B_none'];
  // 2x2: [[4,2],[1,5]] → OR = (4*5)/(2*1) = 10. Effect sizes are opt-in.
  const result = Statz.summarize_q_q(predictor, response, undefined, { with_effect_sizes: true });

  assert.ok(result.effect_sizes, "2x2 table must expose effect_sizes");
  assert.equal(result.effect_sizes.odds_ratio.value, 10);
  assert.ok(result.effect_sizes.odds_ratio.ci_lower > 0);
  assert.ok(result.effect_sizes.odds_ratio.ci_upper > result.effect_sizes.odds_ratio.ci_lower);
  // RR: p1 = 4/6 ≈ 0.667, p2 = 1/6 ≈ 0.167, RR ≈ 4
  assert.equal(result.effect_sizes.risk_ratio.value, 4);
});

test("summarize_q_q: emits null effect_sizes for non-2x2 tables", () => {
  const predictor = ['a','a','b','b','c','c','c'];
  const response  = ['x','y','x','y','x','y','x'];
  const result = Statz.summarize_q_q(predictor, response);
  assert.equal(result.effect_sizes, null);
});

test("summarize_q_q: applies Haldane–Anscombe correction when a cell is 0", () => {
  // Cell (1,1) is zero → correction kicks in, no Infinity in CI bounds
  const predictor = ['a','a','a','a','b','b','b','b'];
  const response  = ['x','x','x','y','x','x','x','x'];
  // 2x2: a [x=3, y=1], b [x=4, y=0] → without correction RR/OR have zero in denominator
  const result = Statz.summarize_q_q(predictor, response, undefined, { with_effect_sizes: true });
  assert.ok(result.effect_sizes);
  assert.ok(Number.isFinite(result.effect_sizes.odds_ratio.value));
  assert.ok(Number.isFinite(result.effect_sizes.odds_ratio.ci_upper));
  assert.ok(Number.isFinite(result.effect_sizes.risk_ratio.value));
  assert.ok(Number.isFinite(result.effect_sizes.risk_ratio.ci_upper));
});

test("summarize_q_l: expands a list response into binary columns and runs q×q per item", () => {
  const predictor = Statz.getColumnValues(parsed, "col_outcome_hash");
  const response  = Statz.getColumnValues(parsed, "col_clinics_hash");

  const summaries = Statz.summarize_q_l(
    predictor.rawValues,
    response.rawValues,
    null,
    { lang: 'en_us', with_effect_sizes: true },
    { responseLabel: "Clinics", separator: ";" }
  );

  assert.ok(Array.isArray(summaries));
  assert.ok(summaries.length > 0);

  const headacheSummary = summaries.find(entry => entry.label === 'headache');
  assert.ok(headacheSummary, "headache response item should be summarized");
  assert.equal(headacheSummary.display_label, "Clinics: headache");
  assert.ok(headacheSummary.table.test_used);
  assert.ok(Number.isFinite(headacheSummary.table.p_value));
  // 2x2 (outcome yes/no × headache yes/no) → OR/RR present
  assert.ok(headacheSummary.table.effect_sizes);
});

test("summarize_l_n: expands a list predictor and runs n×q per binary item", () => {
  const predictor = Statz.getColumnValues(parsed, "col_clinics_hash");
  const response  = Statz.getColumnValues(parsed, "col_biomarker_hash");

  const summaries = Statz.summarize_l_n(
    predictor.rawValues,
    response.rawValues,
    null,
    null,
    { lang: 'en_us' },
    { predictorLabel: "Clinics", separator: ";" }
  );

  assert.ok(Array.isArray(summaries));
  assert.ok(summaries.length > 0);

  const headacheSummary = summaries.find(entry => entry.label === 'headache');
  assert.ok(headacheSummary, "headache predictor item should be summarized");
  assert.equal(headacheSummary.display_label, "Clinics: headache");
  // Test is one of t/MW/ANOVA/KW
  assert.ok(headacheSummary.table.test_used);
  assert.ok(Number.isFinite(headacheSummary.table.p_value));
});

test("summarize_n_l: expands a list RESPONSE and runs n×q per binary item", () => {
  const predictor = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const response  = Statz.getColumnValues(parsed, "col_clinics_hash");

  const summaries = Statz.summarize_n_l(
    predictor.rawValues,
    response.rawValues,
    null,
    null,
    { lang: 'en_us' },
    { responseLabel: "Clinics", separator: ";" }
  );

  assert.ok(Array.isArray(summaries));
  assert.ok(summaries.length > 0);

  const headacheSummary = summaries.find(entry => entry.label === 'headache');
  assert.ok(headacheSummary, "headache response item should be summarized");
  // The LIST label drives the prefix whichever side the list sits on.
  assert.equal(headacheSummary.display_label, "Clinics: headache");
  assert.ok(headacheSummary.table.test_used);
  assert.ok(Number.isFinite(headacheSummary.table.p_value));
});

test("summarize_n_l is numerically identical to summarize_l_n with the axes swapped", () => {
  // The wrapper must stay honest: same statistic, only the labels differ.
  const numeric = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const list    = Statz.getColumnValues(parsed, "col_clinics_hash");

  const forward = Statz.summarize_l_n(list.rawValues, numeric.rawValues, null, null, { lang: 'en_us' }, { predictorLabel: "Clinics", separator: ";" });
  const inverse = Statz.summarize_n_l(numeric.rawValues, list.rawValues, null, null, { lang: 'en_us' }, { responseLabel: "Clinics", separator: ";" });

  assert.equal(inverse.length, forward.length);
  forward.forEach(f => {
    const i = inverse.find(entry => entry.label === f.label);
    assert.ok(i, `item ${f.label} present in both directions`);
    assert.equal(i.display_label, f.display_label);
    assert.equal(i.table.test_used, f.table.test_used);
    assert.equal(i.table.p_value, f.table.p_value);
  });
});

test("runAnalysis: n × l dispatch emits has_nl and one populated table per list item", () => {
  const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const clinics = Statz.getColumnValues(parsed, "col_clinics_hash");
  const dbs = { test_db: { columns: [biomarker.column, clinics.column] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: biomarker.column.col_hash, col_var_index: null, col_label: "Biomarker", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: clinics.column.col_hash, col_var_index: null, col_label: "Clinics", role: "response"
  })];

  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, { lang: 'en_us' });
  assert.ok(flags.includes('has_nl'));
  assert.ok(result.analysis.length > 1, "one entry per list item");
  result.analysis.forEach(entry => {
    // Regression guard: n × l used to fall through the whole dispatcher and emit table: undefined.
    assert.notEqual(entry.table, undefined, `${entry.predictor} must carry a table`);
    // Post-expansion shape: the binary item is a synthetic q, the numeric stays n.
    assert.equal(entry.predictor_type, 'q');
    assert.equal(entry.response_type, 'n');
    // combineAnalysisAsSingleTable renders `predictor ?? response`, so the header names BOTH axes:
    // with several numeric predictors the item alone would repeat across sections.
    assert.match(entry.predictor, /^Biomarker × Clinics: /, `got ${entry.predictor}`);
    assert.equal(entry.response, "Biomarker");
  });
});

test("runAnalysis: list-expanded headers name both axes, and label_list_with_column strips them", () => {
  const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const score = Statz.getColumnValues(parsed, "col_score_hash");
  const clinics = Statz.getColumnValues(parsed, "col_clinics_hash");
  const sex = Statz.getColumnValues(parsed, "col_sex_hash");
  const dbs = { test_db: { columns: [biomarker.column, score.column, clinics.column, sex.column] } };
  const sig = (c, l, role) => JSON.stringify({ database_id: "test_db", col_hash: c.column.col_hash, col_var_index: null, col_label: l, role });
  const headers = (preds, resps, opts) => driver
    .runAnalysis(preds, resps, dbs, { lang: 'en_us', binary_min_count: 30, ...opts })
    .result.analysis.map(e => e.predictor);

  // Two numeric predictors against one list response: the item alone would repeat verbatim.
  const nl = headers([sig(biomarker, "Biomarker", "predictor"), sig(score, "Score", "predictor")], [sig(clinics, "Clinics", "response")], {});
  assert.equal(new Set(nl).size, nl.length, `headers must be unique: ${nl.join(" | ")}`);
  assert.ok(nl.some(h => h.startsWith("Biomarker × Clinics: ")));
  assert.ok(nl.some(h => h.startsWith("Score × Clinics: ")));

  // q × l used to repeat the predictor label for every item.
  const ql = headers([sig(sex, "Sex", "predictor")], [sig(clinics, "Clinics", "response")], {});
  assert.equal(new Set(ql).size, ql.length, `headers must be unique: ${ql.join(" | ")}`);
  assert.ok(ql.every(h => h.startsWith("Sex × Clinics: ")));

  // Turning the prefix off is the escape hatch: bare item, caller owns the disambiguation.
  const bare = headers([sig(sex, "Sex", "predictor")], [sig(clinics, "Clinics", "response")], { label_list_with_column: false });
  assert.ok(bare.every(h => !h.includes("×") && !h.includes("Clinics")), `got ${bare.join(" | ")}`);
});

// ---------------------------------------------------------------------------
// Phase 2: n × n correlation + q × n axis inversion
// ---------------------------------------------------------------------------

test("summarize_n_n: strong linear relationship returns Pearson with high r", () => {
  // y = 2x with tiny noise → near-perfect Pearson correlation, marginals roughly normal
  const xs = [];
  const ys = [];
  for (let i = 0; i < 50; i++) {
    const x = (i - 25) / 5;  // -5..5 range
    xs.push(String(x));
    ys.push(String(2 * x + 0.01 * (i % 3)));
  }
  const result = Statz.summarize_n_n(xs, ys);

  assert.ok(result, "result should not be null");
  assert.equal(result.test_used, Statz.translate('tests.pearson'));
  assert.ok(result.correlation > 0.99, `expected r > 0.99, got ${result.correlation}`);
  assert.ok(result.p_value < 0.001);
  assert.equal(result.n, 50);
});

test("summarize_n_n: non-normal marginals fall back to Spearman", () => {
  // Cluster of low values + extreme outliers — heavily right-skewed. KS rejects normality.
  const xs = [];
  const ys = [];
  for (let i = 0; i < 15; i++) { xs.push('1'); ys.push(String(10 + i)); }
  for (let i = 0; i < 5; i++) { xs.push('100'); ys.push(String(100 + i)); }
  const result = Statz.summarize_n_n(xs, ys);

  assert.ok(result);
  assert.equal(result.test_used, Statz.translate('tests.spearman'));
  // Monotonic relationship → Spearman rank correlation should be strongly positive,
  // though depressed by the heavy ties in xs (15 copies of '1').
  assert.ok(result.correlation > 0.5, `expected Spearman > 0.5, got ${result.correlation}`);
});

test("summarize_n_n: returns null when fewer than 3 valid pairs", () => {
  const result = Statz.summarize_n_n(['1', '2'], ['3', '4']);
  assert.equal(result, null);
});

test("summarize_n_n: filters non-numeric pairs and computes on the rest", () => {
  const xs = ['1', '2', 'bad', '4', '5'];
  const ys = ['10', 'NaN', '30', '40', '50'];
  const result = Statz.summarize_n_n(xs, ys);
  // Valid pairs: (1,10), (4,40), (5,50) → 3 pairs
  assert.equal(result.n, 3);
  assert.ok(result.correlation > 0.9);
});

test("summarize_n_n: CI 95% bounds are valid and bracket the point estimate", () => {
  const xs = [];
  const ys = [];
  for (let i = 0; i < 30; i++) {
    xs.push(String(i));
    ys.push(String(i + (i % 4) * 0.5));
  }
  const result = Statz.summarize_n_n(xs, ys);
  assert.ok(result);
  assert.ok(Number.isFinite(result.ci_lower));
  assert.ok(Number.isFinite(result.ci_upper));
  assert.ok(result.ci_lower < result.correlation);
  assert.ok(result.ci_upper > result.correlation);
});

test("runAnalysis: n × n dispatch emits has_nn flag", () => {
  // Use the biomarker fixture column twice (correlation with itself = 1, ensures dispatch).
  const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const fakeCol = { ...biomarker.column, col_hash: "biomarker_copy" };
  const dbs = {
    test_db: {
      columns: [biomarker.column, fakeCol]
    }
  };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: biomarker.column.col_hash, col_var_index: null, col_label: "Biomarker", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: "biomarker_copy", col_var_index: null, col_label: "Biomarker (copy)", role: "response"
  })];

  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, {});
  assert.ok(flags.includes('has_nn'));
  assert.ok(Array.isArray(result.analysis));
  assert.equal(result.analysis[0].predictor_type, 'n');
  assert.equal(result.analysis[0].response_type, 'n');
});

test("runAnalysis: q × n dispatch (inversion) emits has_qn flag and renders rows by q levels", () => {
  const sex = Statz.getColumnValues(parsed, "col_sex_hash");
  const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const dbs = {
    test_db: {
      columns: [sex.column, biomarker.column]
    }
  };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: sex.column.col_hash, col_var_index: null, col_label: "Sex", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: biomarker.column.col_hash, col_var_index: null, col_label: "Biomarker", role: "response"
  })];

  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, {});
  assert.ok(flags.includes('has_qn'));
  assert.ok(Array.isArray(result.analysis));
  const entry = result.analysis[0];
  // Entry records the user's original perspective (predictor=q, response=n), even though
  // the internal call to summarize_n_q had its args swapped for the inversion.
  assert.equal(entry.predictor_type, 'q');
  assert.equal(entry.response_type, 'n');
  // summarize_n_q lays out group levels (the q predictor) as columns and numeric stats
  // (the n response) as rows — the natural orientation when q is the predictor.
  assert.ok(entry.table.columns.includes('female') && entry.table.columns.includes('male'));
  assert.ok(entry.table.rows.length >= 1);
});

// ---------------------------------------------------------------------------
// Phase 3: Profile B (paired responses-only)
// ---------------------------------------------------------------------------

import numeric from "../json/numeric.js";
import contingency from "../json/contingency.js";

test("summarize_n_paired: paired t-test for 2 momentos with normal differences", () => {
  // Differences vary symmetrically around a non-zero mean → roughly normal.
  const xs = [];
  const ys = [];
  for (let i = 0; i < 30; i++) {
    xs.push(String(10 + Math.sin(i)));
    ys.push(String(12 + Math.sin(i + 0.7)));  // noise differs between momentos
  }
  const result = numeric.summarize_n_paired([xs, ys], ['T0', 'T6']);
  assert.ok(result);
  assert.equal(result.k, 2);
  assert.equal(result.n, 30);
  // Mean shift ≈ -2, with variability in differences → strongly significant
  assert.ok(result.p_value < 0.001);
  // Differences should be normally distributed enough → paired t-test
  assert.equal(result.test_used, Statz.translate('tests.pairedT'));
});

test("summarize_n_paired: Wilcoxon signed-rank for 2 momentos when differences non-normal", () => {
  // Strongly skewed differences via extreme outliers in one momento
  const xs = [];
  const ys = [];
  for (let i = 0; i < 20; i++) {
    xs.push(String(i + 1));
    ys.push(String(i + 1));  // identical → diff = 0 (all)
  }
  // Inject extreme paired outliers to break normality
  xs.push('1', '1', '1');
  ys.push('1000', '1000', '1000');
  const result = numeric.summarize_n_paired([xs, ys], ['T0', 'T1']);
  assert.ok(result);
  // Non-normal differences → Wilcoxon expected
  assert.equal(result.test_used, Statz.translate('tests.wilcoxonSigned'));
});

test("summarize_n_paired: Friedman for 3 momentos", () => {
  // Three momentos with monotonic shift
  const t0 = []; const t1 = []; const t2 = [];
  for (let i = 0; i < 15; i++) {
    t0.push(String(i + 1));
    t1.push(String(i + 3));
    t2.push(String(i + 6));
  }
  const result = numeric.summarize_n_paired([t0, t1, t2], ['T0', 'T1', 'T2']);
  assert.ok(result);
  assert.equal(result.k, 3);
  assert.equal(result.test_used, Statz.translate('tests.friedman'));
  // Monotonic increase → low p-value
  assert.ok(result.p_value < 0.001);
});

test("summarize_n_paired: complete-case row filtering on non-numeric values", () => {
  const xs = ['1', '2', 'bad', '4', '5'];
  const ys = ['10', '20', '30', '40', 'NaN'];
  const result = numeric.summarize_n_paired([xs, ys], ['T0', 'T1']);
  // Valid pairs: (1,10), (2,20), (4,40) → n=3
  assert.ok(result);
  assert.equal(result.n, 3);
});

test("summarize_q_binary_paired: McNemar for 2 momentos with significant change", () => {
  // 20 subjects. Before: 15 'no', 5 'yes'. After: 5 'no', 15 'yes' (10 switched).
  const t0 = Array(15).fill('no').concat(Array(5).fill('yes'));
  const t1 = Array(5).fill('no').concat(Array(15).fill('yes'));
  // Discordant pairs: t0='no', t1='yes' for 10 subjects (indices 5-14); t0='yes', t1='no' for 0
  const result = contingency.summarize_q_binary_paired([t0, t1], ['T0', 'T1']);
  assert.ok(result);
  assert.equal(result.k, 2);
  assert.equal(result.n, 20);
  assert.equal(result.test_used, Statz.translate('tests.mcnemar'));
  // Heavy asymmetry → very low p-value
  assert.ok(result.p_value < 0.05);
});

test("summarize_q_binary_paired: McNemar with no discordant pairs → p=1", () => {
  const t0 = ['yes','yes','no','no','yes'];
  const t1 = ['yes','yes','no','no','yes'];
  const result = contingency.summarize_q_binary_paired([t0, t1], ['T0', 'T1']);
  assert.ok(result);
  assert.equal(result.test_used, Statz.translate('tests.mcnemar'));
  assert.equal(result.p_value, 1);
});

test("summarize_q_binary_paired: Cochran's Q for 3 momentos", () => {
  // 12 subjects, three momentos. Strong shift across time.
  const t0 = Array(12).fill('no');
  const t1 = Array(6).fill('no').concat(Array(6).fill('yes'));
  const t2 = Array(2).fill('no').concat(Array(10).fill('yes'));
  const result = contingency.summarize_q_binary_paired([t0, t1, t2], ['T0', 'T1', 'T2']);
  assert.ok(result);
  assert.equal(result.k, 3);
  assert.equal(result.test_used, Statz.translate('tests.cochranQ'));
  assert.ok(result.p_value < 0.05);
});

test("runAnalysis: Profile B dispatch — paired n via summarizePaired", () => {
  // Mock two n-typed columns in a single DB.
  const t0Vals = []; const t1Vals = [];
  for (let i = 0; i < 30; i++) { t0Vals.push(String(10 + i / 10)); t1Vals.push(String(12 + i / 10)); }
  const t0Col = {
    col_hash: 'col_t0', col_label: 'Creatinine pré', col_type: 'n', col_sep: '',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: t0Vals },
    col_vars: []
  };
  const t1Col = { ...t0Col, col_hash: 'col_t1', col_label: 'Creatinine pós',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: t1Vals } };
  const dbs = { db: { columns: [t0Col, t1Col] } };
  const predictors = [];
  const responses = [
    JSON.stringify({ database_id: 'db', col_hash: 'col_t0', col_var_index: null, col_label: 'Creatinine pré' }),
    JSON.stringify({ database_id: 'db', col_hash: 'col_t1', col_var_index: null, col_label: 'Creatinine pós' })
  ];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, {});
  assert.ok(flags.includes('has_paired_n'));
  assert.equal(result.analysis.length, 1);
  const entry = result.analysis[0];
  assert.equal(entry.predictor, null);
  assert.equal(entry.response_type, 'n');
  assert.ok(entry.table.test_used);
});

test("runAnalysis: Profile B type-lock — mixed types reject with warning", () => {
  const numCol = {
    col_hash: 'h_num', col_label: 'X', col_type: 'n', col_sep: '',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ['1','2','3','4','5'] },
    col_vars: []
  };
  const qCol = {
    col_hash: 'h_q', col_label: 'Y', col_type: 'q', col_sep: '',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ['a','b','a','b','a'] },
    col_vars: []
  };
  const dbs = { db: { columns: [numCol, qCol] } };
  const predictors = [];
  const responses = [
    JSON.stringify({ database_id: 'db', col_hash: 'h_num', col_var_index: null, col_label: 'X' }),
    JSON.stringify({ database_id: 'db', col_hash: 'h_q',   col_var_index: null, col_label: 'Y' })
  ];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, {});
  assert.ok(flags.includes('has_paired'));
  // Should NOT have type-specific flags (no actual paired analysis ran).
  assert.equal(flags.includes('has_paired_n'), false);
  assert.equal(flags.includes('has_paired_q'), false);
  // Surface includes a warning string instead of a test result.
  const entry = result.analysis[0];
  assert.ok(entry.table.warning);
});

test("runAnalysis: Profile B with single response — too few momentos warning", () => {
  const col = {
    col_hash: 'h_n', col_label: 'X', col_type: 'n', col_sep: '',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ['1','2','3','4','5'] },
    col_vars: []
  };
  const dbs = { db: { columns: [col] } };
  const predictors = [];
  const responses = [JSON.stringify({ database_id: 'db', col_hash: 'h_n', col_var_index: null, col_label: 'X' })];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, {});
  assert.ok(flags.includes('has_paired'));
  const entry = result.analysis[0];
  assert.ok(entry.table.warning);
});

test("runAnalysis: Profile B with binary q responses dispatches McNemar/Cochran", () => {
  const t0 = Array(15).fill('no').concat(Array(5).fill('yes'));
  const t1 = Array(5).fill('no').concat(Array(15).fill('yes'));
  const t0Col = {
    col_hash: 'h_t0', col_label: 'Pré', col_type: 'q', col_sep: '',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: t0 },
    col_vars: []
  };
  const t1Col = { ...t0Col, col_hash: 'h_t1', col_label: 'Pós',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: t1 } };
  const dbs = { db: { columns: [t0Col, t1Col] } };
  const predictors = [];
  const responses = [
    JSON.stringify({ database_id: 'db', col_hash: 'h_t0', col_var_index: null, col_label: 'Pré' }),
    JSON.stringify({ database_id: 'db', col_hash: 'h_t1', col_var_index: null, col_label: 'Pós' })
  ];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, {});
  assert.ok(flags.includes('has_paired_q'));
  const entry = result.analysis[0];
  assert.equal(entry.response_type, 'q');
  assert.equal(entry.table.test_used, Statz.translate('tests.mcnemar'));
});

// ---------------------------------------------------------------------------
// Phase 4: l × l (with subset) + multi-DB D2 broadcast
// ---------------------------------------------------------------------------

test("summarize_l_l: produces grid of q×q for selected predictor × response items", () => {
  // Synthetic data: 10 rows.
  // Predictor list: symptoms; Response list: comorbidities.
  const symptoms = ['fever;cough', 'fever', 'cough', 'fever;cough', 'cough',
                    'fever', 'cough', 'fever;cough', 'fever', 'cough'];
  const comorb   = ['dm;htn',     'dm',    'htn',    'dm;htn',     'htn',
                    'dm',    'htn',    'dm;htn',     'dm',    'htn'];

  const summaries = Statz.summarize_l_l(symptoms, comorb, null, { lang: 'en_us' }, {
    predictorSep: ';', responseSep: ';',
    predictorLabel: 'Symptoms', responseLabel: 'Comorbidities',
    predSubset: ['fever', 'cough'], respSubset: ['dm', 'htn']
  });

  assert.ok(Array.isArray(summaries));
  assert.equal(summaries.length, 4);  // 2×2 grid
  // Each entry has a q×q table
  for (const entry of summaries) {
    assert.ok(entry.table);
    assert.ok(entry.table.test_used);
  }
  // Display labels include the item names
  const labels = summaries.map(s => `${s.predictor_item}×${s.response_item}`);
  assert.ok(labels.includes('fever×dm'));
});

test("summarize_l_l: items not present in data are silently skipped", () => {
  const symptoms = ['fever', 'cough', 'fever'];
  const comorb   = ['dm',    'htn',   'dm'];
  const summaries = Statz.summarize_l_l(symptoms, comorb, null, {}, {
    predSubset: ['fever', 'ghost_symptom'],
    respSubset: ['dm']
  });
  // Only fever × dm is computable
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].predictor_item, 'fever');
  assert.equal(summaries[0].response_item, 'dm');
});

test("runAnalysis: l × l without subset_items emits llSubsetRequired warning", () => {
  const symptomsCol = {
    col_hash: 'h_sym', col_label: 'Symptoms', col_type: 'l', col_sep: ';',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ['fever;cough', 'fever', 'cough'] },
    col_vars: []
  };
  const comorbCol = {
    col_hash: 'h_co', col_label: 'Comorbidities', col_type: 'l', col_sep: ';',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ['dm;htn', 'dm', 'htn'] },
    col_vars: []
  };
  const dbs = { db: { columns: [symptomsCol, comorbCol] } };
  const predictors = [JSON.stringify({ database_id: 'db', col_hash: 'h_sym', col_var_index: null, col_label: 'Symptoms' })];
  const responses  = [JSON.stringify({ database_id: 'db', col_hash: 'h_co',  col_var_index: null, col_label: 'Comorbidities' })];

  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, {});
  assert.ok(flags.includes('has_ll'));
  const entry = result.analysis[0];
  assert.ok(entry.table.warning);
});

test("runAnalysis: l × l with subset_items dispatches the grid", () => {
  const symptomsCol = {
    col_hash: 'h_sym', col_label: 'Symptoms', col_type: 'l', col_sep: ';',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: [
      'fever;cough', 'fever', 'cough', 'fever;cough', 'cough',
      'fever', 'cough', 'fever;cough', 'fever', 'cough'
    ] }, col_vars: []
  };
  const comorbCol = {
    col_hash: 'h_co', col_label: 'Comorbidities', col_type: 'l', col_sep: ';',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: [
      'dm;htn', 'dm', 'htn', 'dm;htn', 'htn',
      'dm', 'htn', 'dm;htn', 'dm', 'htn'
    ] }, col_vars: []
  };
  const dbs = { db: { columns: [symptomsCol, comorbCol] } };
  const predictors = [JSON.stringify({
    database_id: 'db', col_hash: 'h_sym', col_var_index: null, col_label: 'Symptoms',
    subset_items: ['fever', 'cough']
  })];
  const responses = [JSON.stringify({
    database_id: 'db', col_hash: 'h_co', col_var_index: null, col_label: 'Comorbidities',
    subset_items: ['dm', 'htn']
  })];

  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, {});
  assert.ok(flags.includes('has_ll'));
  assert.equal(result.analysis.length, 4);  // 2×2 grid of q×q
  for (const entry of result.analysis) {
    assert.equal(entry.predictor_type, 'q');
    assert.equal(entry.response_type, 'q');
    assert.ok(entry.table.test_used);
  }
});

test("runAnalysis: multi-DB Profile C broadcasts response across DBs (D2)", () => {
  // Two DBs, both have an 'outcome' column (q) and one numeric predictor each.
  const dbA = {
    columns: [
      {
        col_hash: 'h_outcome', col_label: 'Outcome', col_type: 'q', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null,
          raw_values: ['yes','no','yes','no','yes','no','yes','no','yes','no'] },
        col_vars: []
      },
      {
        col_hash: 'h_predA', col_label: 'PredA', col_type: 'n', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null,
          raw_values: ['1','2','3','4','5','6','7','8','9','10'] },
        col_vars: []
      }
    ]
  };
  const dbB = {
    columns: [
      {
        col_hash: 'h_outcome', col_label: 'Outcome', col_type: 'q', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null,
          raw_values: ['yes','yes','no','no','yes','no','no','yes','yes','no'] },
        col_vars: []
      },
      {
        col_hash: 'h_predB', col_label: 'PredB', col_type: 'n', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null,
          raw_values: ['10','20','30','40','50','60','70','80','90','100'] },
        col_vars: []
      }
    ]
  };
  const dbs = { dbA, dbB };
  const predictors = [
    JSON.stringify({ database_id: 'dbA', col_hash: 'h_predA', col_var_index: null, col_label: 'PredA' }),
    JSON.stringify({ database_id: 'dbB', col_hash: 'h_predB', col_var_index: null, col_label: 'PredB' })
  ];
  const responses = [JSON.stringify({ database_id: 'dbA', col_hash: 'h_outcome', col_var_index: null, col_label: 'Outcome' })];

  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, {});
  assert.ok(flags.includes('has_multi_db_broadcast'));
  // Two entries — one per predictor DB
  assert.equal(result.analysis.length, 2);
  assert.ok(result.analysis.every(e => e.predictor_type === 'n' && e.response_type === 'q'));
});

test("runAnalysis: multi-DB Profile C with missing response → warning + the viable analyses", () => {
  const dbA = {
    columns: [
      {
        col_hash: 'h_outcome', col_label: 'Outcome', col_type: 'q', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null,
          raw_values: ['yes','no','yes','no','yes'] },
        col_vars: []
      },
      {
        col_hash: 'h_pA', col_label: 'PA', col_type: 'n', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null, raw_values: ['1','2','3','4','5'] },
        col_vars: []
      }
    ]
  };
  // dbB has the predictor but NOT the response.
  const dbB = {
    columns: [{
      col_hash: 'h_pB', col_label: 'PB', col_type: 'n', col_sep: '',
      col_values: { col_compact: false, labels: null, codes: null, raw_values: ['10','20','30','40','50'] },
      col_vars: []
    }]
  };
  const dbs = { dbA, dbB };
  const predictors = [
    JSON.stringify({ database_id: 'dbA', col_hash: 'h_pA', col_var_index: null, col_label: 'PA' }),
    JSON.stringify({ database_id: 'dbB', col_hash: 'h_pB', col_var_index: null, col_label: 'PB' })
  ];
  const responses = [JSON.stringify({ database_id: 'dbA', col_hash: 'h_outcome', col_var_index: null, col_label: 'Outcome' })];

  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, {});
  assert.ok(flags.includes('has_multi_db_missing_response'));
  // Only one database contributes, so nothing was concatenated across databases.
  assert.equal(flags.includes('has_multi_db_broadcast'), false);
  // The notice comes first, then the analyses the viable database could still produce — dropping
  // dbB must not cost the user dbA's perfectly valid work.
  assert.equal(result.analysis.length, 2);
  assert.ok(result.analysis[0].table.warning);
  assert.equal(result.analysis[1].table.warning, undefined);
  assert.equal(result.analysis[1].predictor, 'PA', 'the dbA predictor was analysed');
  assert.ok(result.analysis[1].table.test_used);
  // The warning no longer leaks the raw database id — the user cannot act on a Bubble UUID.
  assert.equal(/\d{10,}x\d+/.test(result.analysis[0].table.warning), false);
  assert.equal(result.analysis[0].table.warning.includes('dbB'), false);
});

test("runAnalysis: when NO database has the response, only the notice comes back", () => {
  const dbA = {
    columns: [{
      col_hash: 'h_pA', col_label: 'PA', col_type: 'n', col_sep: '',
      col_values: { col_compact: false, labels: null, codes: null, raw_values: ['1','2','3','4','5'] },
      col_vars: []
    }]
  };
  const predictors = [JSON.stringify({ database_id: 'dbA', col_hash: 'h_pA', col_var_index: null, col_label: 'PA' })];
  const responses = [JSON.stringify({ database_id: 'dbZ', col_hash: 'h_absent', col_var_index: null, col_label: 'Outcome' })];
  const { result, flags } = driver.runAnalysis(predictors, responses, { dbA }, {});
  assert.ok(flags.includes('has_multi_db_missing_response'));
  assert.equal(result.analysis.length, 1);
  assert.ok(result.analysis[0].table.warning);
});

test("runAnalysis: a SINGLE predictor whose response lives in another DB is rejected too", () => {
  // Rows are paired positionally downstream, so pairing a predictor from one database with a
  // response from another silently correlates unrelated records — the two tables need not even
  // share a row count. The validation used to be gated on "predictors span >1 database", which
  // let this single-predictor case through and produced a bogus test.
  const dbA = {
    columns: [{
      col_hash: 'h_pA', col_label: 'Age', col_type: 'n', col_sep: '',
      col_values: { col_compact: false, labels: null, codes: null, raw_values: ['1','2','3','4','5'] },
      col_vars: []
    }]
  };
  const dbB = {
    columns: [{
      col_hash: 'h_out', col_label: 'Outcome', col_type: 'q', col_sep: '',
      col_values: { col_compact: false, labels: null, codes: null,
        raw_values: ['yes','no','yes','no','yes','no','yes','no'] },
      col_vars: []
    }]
  };
  const predictors = [JSON.stringify({ database_id: 'dbA', col_hash: 'h_pA', col_var_index: null, col_label: 'Age' })];
  const responses = [JSON.stringify({ database_id: 'dbB', col_hash: 'h_out', col_var_index: null, col_label: 'Outcome' })];

  const { result, flags } = driver.runAnalysis(predictors, responses, { dbA, dbB }, {});
  assert.ok(flags.includes('has_multi_db_missing_response'));
  assert.equal(flags.includes('has_multi_db_broadcast'), false, 'nothing to broadcast with one DB');
  assert.equal(result.analysis.length, 1);
  assert.ok(result.analysis[0].table.warning);
  assert.equal(result.analysis[0].table.test_used, undefined, 'no test may be computed');
});

test("runAnalysis: a response sharing a hash with another DB is rebound to the predictors' DB", () => {
  // col_hash is the MD5 of the COLUMN NAME, so it is unique only WITHIN a database: two uploads
  // that both have an "Outcome" column carry the same hash. Picking the response from the other
  // database therefore passes the presence check while still resolving against ITS OWN table.
  const H = 'md5_outcome';
  const dbA = {
    columns: [
      { col_hash: 'md5_age', col_label: 'Age', col_type: 'n', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null, raw_values: ['1','2','3','4','5','6'] }, col_vars: [] },
      { col_hash: H, col_label: 'Outcome', col_type: 'q', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null, raw_values: ['yes','yes','yes','no','no','no'] }, col_vars: [] }
    ]
  };
  const dbB = {
    columns: [
      { col_hash: 'md5_weight', col_label: 'Weight', col_type: 'n', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null, raw_values: ['9','9','9'] }, col_vars: [] },
      // Same name → same hash, but different levels and a different row count.
      { col_hash: H, col_label: 'Outcome', col_type: 'q', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null, raw_values: ['other','other','other'] }, col_vars: [] }
    ]
  };
  const predictors = [JSON.stringify({ database_id: 'dbA', col_hash: 'md5_age', col_var_index: null, col_label: 'Age' })];
  const foreign = [JSON.stringify({ database_id: 'dbB', col_hash: H, col_var_index: null, col_label: 'Outcome' })];
  const own = [JSON.stringify({ database_id: 'dbA', col_hash: H, col_var_index: null, col_label: 'Outcome' })];

  const viaForeign = driver.runAnalysis(predictors, foreign, { dbA, dbB }, {});
  const viaOwn = driver.runAnalysis(predictors, own, { dbA, dbB }, {});

  // The levels must come from dbA either way — dbB's "other" must never surface.
  assert.deepEqual(viaForeign.result.analysis[0].table.columns, viaOwn.result.analysis[0].table.columns);
  assert.ok(viaForeign.result.analysis[0].table.columns.includes('yes'));
  assert.equal(viaForeign.result.analysis[0].table.columns.includes('other'), false);
  assert.equal(viaForeign.result.analysis[0].table.p_value, viaOwn.result.analysis[0].table.p_value);
});

test("runAnalysis: single DB with the response present is unaffected by the validation", () => {
  const db = {
    columns: [
      {
        col_hash: 'h_p', col_label: 'Age', col_type: 'n', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null, raw_values: ['1','2','3','4','5'] },
        col_vars: []
      },
      {
        col_hash: 'h_out', col_label: 'Outcome', col_type: 'q', col_sep: '',
        col_values: { col_compact: false, labels: null, codes: null, raw_values: ['yes','no','yes','no','yes'] },
        col_vars: []
      }
    ]
  };
  const predictors = [JSON.stringify({ database_id: 'db', col_hash: 'h_p', col_var_index: null, col_label: 'Age' })];
  const responses = [JSON.stringify({ database_id: 'db', col_hash: 'h_out', col_var_index: null, col_label: 'Outcome' })];

  const { result, flags } = driver.runAnalysis(predictors, responses, { db }, {});
  assert.equal(flags.includes('has_multi_db_missing_response'), false);
  assert.equal(flags.includes('has_multi_db_broadcast'), false);
  assert.ok(flags.includes('has_nq'));
  assert.ok(result.analysis[0].table.test_used, 'the analysis still runs');
});

test("runAnalysis: Profile B with responses from different DBs → warning, no analysis", () => {
  // Same-individual row alignment is only valid within a single DB; cross-DB paired
  // responses would silently truncate to min length and produce bogus pairings.
  const dbA = { columns: [{
    col_hash: 'h_t0', col_label: 'T0', col_type: 'n', col_sep: '',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ['1','2','3','4','5'] },
    col_vars: []
  }] };
  const dbB = { columns: [{
    col_hash: 'h_t1', col_label: 'T1', col_type: 'n', col_sep: '',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ['10','20','30'] },
    col_vars: []
  }] };
  const dbs = { dbA, dbB };
  const responses = [
    JSON.stringify({ database_id: 'dbA', col_hash: 'h_t0', col_var_index: null, col_label: 'T0' }),
    JSON.stringify({ database_id: 'dbB', col_hash: 'h_t1', col_var_index: null, col_label: 'T1' })
  ];
  const { result, flags } = driver.runAnalysis([], responses, dbs, {});
  assert.ok(flags.includes('has_paired'));
  assert.equal(flags.includes('has_paired_n'), false);  // never reaches the n-paired branch
  assert.equal(flags.includes('has_paired_q'), false);
  const entry = result.analysis[0];
  assert.ok(entry.table.warning);
  assert.match(entry.table.warning, /database/i);
});


// ---------------------------------------------------------------------------
// Multi-DB: response matching by normalized label + level-identity flag
// ---------------------------------------------------------------------------

const mdbCol = (hash, label, type, values) => ({
  col_hash: hash, col_label: label, col_type: type, col_sep: '',
  col_values: { col_compact: false, labels: null, codes: null, raw_values: values },
  col_vars: []
});
const mdbSig = (db, hash, label) => JSON.stringify({ database_id: db, col_hash: hash, col_var_index: null, col_label: label });

test("runAnalysis: a response spelled differently across DBs matches on the normalized label", () => {
  // col_hash is the MD5 of the column NAME, so "sharedoutcome" and "SharedOutcome" hash apart and
  // renaming col_label cannot repair it. The normalized-label fallback makes the pair work.
  const dbC = { columns: [mdbCol('md5_P', 'P', 'q', ['x','y','x','y']), mdbCol('md5_lower', 'sharedoutcome', 'q', ['yes','no','yes','no'])] };
  const dbD = { columns: [mdbCol('md5_P', 'P', 'q', ['x','y','x','y']), mdbCol('md5_camel', 'SharedOutcome', 'q', ['yes','no','yes','no'])] };
  const predictors = [mdbSig('dbC', 'md5_P', 'PredC'), mdbSig('dbD', 'md5_P', 'PredD')];
  const responses = [mdbSig('dbD', 'md5_camel', 'SharedOutcome')];

  const { result, flags } = driver.runAnalysis(predictors, responses, { dbC, dbD }, {});
  assert.ok(flags.includes('has_multi_db_broadcast'));
  assert.equal(flags.includes('has_multi_db_missing_response'), false);
  assert.equal(result.analysis.length, 2, 'one analysis per database');
  result.analysis.forEach(entry => assert.ok(entry.table.test_used));
});

test("runAnalysis: an ambiguous label match is reported as missing, never guessed", () => {
  const dbAmb = {
    columns: [
      mdbCol('md5_P', 'P', 'q', ['x','y']),
      mdbCol('md5_a', 'Shared Outcome', 'q', ['yes','no']),
      mdbCol('md5_b', 'shared-outcome', 'q', ['yes','no'])   // both normalize to 'sharedoutcome'
    ]
  };
  const dbD = { columns: [mdbCol('md5_P', 'P', 'q', ['x','y']), mdbCol('md5_camel', 'SharedOutcome', 'q', ['yes','no'])] };
  const predictors = [mdbSig('dbAmb', 'md5_P', 'PredA'), mdbSig('dbD', 'md5_P', 'PredD')];
  const responses = [mdbSig('dbD', 'md5_camel', 'SharedOutcome')];

  const { result, flags } = driver.runAnalysis(predictors, responses, { dbAmb, dbD }, {});
  assert.ok(flags.includes('has_multi_db_missing_response'));
  assert.ok(result.analysis[0].table.warning);
});

test("runAnalysis: diverging response levels across DBs raise has_multi_db_level_mismatch", () => {
  const base = ['x','y','x','y'];
  const dbSame = { columns: [mdbCol('md5_P','P','q',base), mdbCol('md5_S','S','q',['yes','no','yes','no'])] };
  const dbCase = { columns: [mdbCol('md5_P','P','q',base), mdbCol('md5_S','S','q',['Yes','NO','yes','no'])] };
  const dbDiff = { columns: [mdbCol('md5_P','P','q',base), mdbCol('md5_S','S','q',['yes','no','other','other'])] };
  const dbNum  = { columns: [mdbCol('md5_P','P','q',base), mdbCol('md5_S','S','n',['9','8','7','6'])] };
  const dbNum2 = { columns: [mdbCol('md5_P','P','q',base), mdbCol('md5_S','S','n',['1','2','3','4'])] };
  const run = (a, b, dbs) => driver.runAnalysis(
    [mdbSig(a, 'md5_P', 'A'), mdbSig(b, 'md5_P', 'B')], [mdbSig(a, 'md5_S', 'S')], dbs, {}).flags;

  // Case and punctuation differences are NOT a divergence — the comparison is normalized.
  assert.equal(run('dbSame', 'dbCase', { dbSame, dbCase }).includes('has_multi_db_level_mismatch'), false);
  // A genuinely extra category is.
  assert.ok(run('dbSame', 'dbDiff', { dbSame, dbDiff }).includes('has_multi_db_level_mismatch'));
  // Numeric responses are skipped: their distinct values are data, not categories.
  assert.equal(run('dbNum2', 'dbNum', { dbNum2, dbNum }).includes('has_multi_db_level_mismatch'), false);
});

test("runAnalysis: a response pointing at a non-predictor database is a pointer, not a divergence", () => {
  // The user picked the response from dbB, but every predictor lives in dbA, so the response is
  // rebound to dbA's column of the same name and dbB's copy is never read. Its extra level
  // therefore reaches no analysis, and flagging a mismatch here would warn about a divergence
  // the reader cannot see. The flag is reserved for when two databases each contribute an
  // analysis AND their level sets differ.
  const base = ['x', 'y', 'x', 'y'];
  const dbA = { columns: [mdbCol('md5_P', 'P', 'q', base), mdbCol('md5_S', 'S', 'q', ['yes', 'no', 'yes', 'no'])] };
  const dbB = { columns: [mdbCol('md5_Q', 'Q', 'q', base), mdbCol('md5_S', 'S', 'q', ['yes', 'no', 'only_in_dbB', 'only_in_dbB'])] };
  const response = mdbSig('dbB', 'md5_S', 'S');

  const pointer = driver.runAnalysis([mdbSig('dbA', 'md5_P', 'A')], [response], { dbA, dbB }, {});
  assert.equal(pointer.flags.includes('has_multi_db_level_mismatch'), false);
  assert.equal(pointer.flags.includes('has_multi_db_broadcast'), false);
  assert.equal(pointer.result.analysis.length, 1);
  // The substantive half: dbB's copy contributed nothing, so its extra level is nowhere to be
  // found. Asserting only the flag's absence would still pass if the wrong column were read.
  assert.equal(JSON.stringify(pointer.result.analysis).includes('only_in_dbB'), false);

  // Contrast: give dbB a predictor of its own and both databases now contribute an analysis, so
  // the differing level sets DO reach the reader and must be flagged.
  const contributing = driver.runAnalysis(
    [mdbSig('dbA', 'md5_P', 'A'), mdbSig('dbB', 'md5_Q', 'B')], [response], { dbA, dbB }, {});
  assert.ok(contributing.flags.includes('has_multi_db_level_mismatch'));
  assert.ok(JSON.stringify(contributing.result.analysis).includes('only_in_dbB'));
});

test("runAnalysis: the level-mismatch flag does not alter the analyses", () => {
  const base = ['x','y','x','y'];
  const dbSame = { columns: [mdbCol('md5_P','P','q',base), mdbCol('md5_S','S','q',['yes','no','yes','no'])] };
  const dbDiff = { columns: [mdbCol('md5_P','P','q',base), mdbCol('md5_S','S','q',['yes','no','other','other'])] };
  const { result } = driver.runAnalysis(
    [mdbSig('dbSame','md5_P','A'), mdbSig('dbDiff','md5_P','B')], [mdbSig('dbSame','md5_S','S')], { dbSame, dbDiff }, {});
  assert.equal(result.analysis.length, 2);
  // Each section keeps its own level set — nothing is padded with zeros, which would imply the
  // p-value had considered those columns.
  assert.ok(result.analysis[0].table.columns.includes('yes'));
  assert.equal(result.analysis[0].table.columns.includes('other'), false);
  assert.ok(result.analysis[1].table.columns.includes('other'));
});

test("runAnalysis: the mixed-types paired warning names the types in the user's language", () => {
  // The user picked variables, not `q`/`n`/`l` codes; and a repeated type must not be listed twice.
  const col = (hash, label, type, values) => ({
    col_hash: hash, col_label: label, col_type: type, col_sep: '',
    col_values: { col_compact: false, labels: null, codes: null, raw_values: values },
    col_vars: []
  });
  const db = { columns: [col('h1','T0','q',['a','b','a']), col('h2','T1','q',['a','b','b']), col('h3','T2','n',['1','2','3'])] };
  const sig = (hash, label) => JSON.stringify({ database_id: 'db', col_hash: hash, col_var_index: null, col_label: label });
  const responses = [sig('h1','T0'), sig('h2','T1'), sig('h3','T2')];

  const en = driver.runAnalysis([], responses, { db }, { lang: 'en_us' }).result.analysis[0].table.warning;
  assert.match(en, /qualitative, numeric/);
  assert.equal(/\bq\b|\bn\b|\bl\b/.test(en.replace(/[a-z]/g, m => m)) && / q,| n,|, q| n\./.test(en), false, 'no raw type codes');

  const pt = driver.runAnalysis([], responses, { db }, { lang: 'pt_br' }).result.analysis[0].table.warning;
  assert.match(pt, /qualitativa, numérica/);
  assert.equal(pt.includes('qualitativa, qualitativa'), false, 'the repeated type is deduped');
});

test("getColumnTypeLabel: falls back to the raw code and tolerates blanks", () => {
  assert.equal(Statz.getColumnTypeLabel('q', 'pt_br'), 'qualitativa');
  assert.equal(Statz.getColumnTypeLabel('n', 'en_us'), 'numeric');
  assert.equal(Statz.getColumnTypeLabel('l', 'es_es'), 'lista');
  assert.equal(Statz.getColumnTypeLabel('zz', 'pt_br'), 'zz', 'unknown code passes through');
  assert.equal(Statz.getColumnTypeLabel(null, 'pt_br'), '');
});

test("summarize_q_q: effect sizes are opt-in; off by default and the computation is skipped", () => {
  const predictor = ['a','a','a','a','b','b','b','b','a','b'];
  const response  = ['x','x','x','y','y','y','y','y','x','x'];

  const on = Statz.summarize_q_q(predictor, response, undefined, { lang: 'en_us', with_effect_sizes: true });
  assert.ok(on.columns.includes('Odds Ratio'), 'opting in brings the columns');
  assert.ok(on.effect_sizes, 'and returns them');

  const off = Statz.summarize_q_q(predictor, response, undefined, { lang: 'en_us' });
  assert.deepEqual(off.columns, ['Group', 'x', 'y', 'p-value']);
  // Same contract as with_residuals: the option means "I don't want them", not "compute and hide".
  assert.equal(off.effect_sizes, null);
  // The test itself is untouched — only the effect-size columns go away.
  assert.equal(off.p_value, on.p_value);
  assert.equal(off.test_used, on.test_used);
  off.rows.forEach(row => {
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'Odds Ratio'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, '95% CI'), false);
  });
});

test("summarize_q_q: with_effect_sizes is independent of effect_size_type", () => {
  const predictor = ['a','a','b','b','a','b'];
  const response  = ['x','y','x','y','x','y'];
  const rr = Statz.summarize_q_q(predictor, response, undefined, { lang: 'en_us', with_effect_sizes: true, effect_size_type: 'risk_ratio' });
  assert.ok(rr.columns.includes('Risk Ratio'));
  const offRr = Statz.summarize_q_q(predictor, response, undefined, { lang: 'en_us', effect_size_type: 'risk_ratio', with_effect_sizes: false });
  assert.equal(offRr.columns.includes('Risk Ratio'), false);
  assert.equal(offRr.effect_sizes, null);
});

test("getDefaultAnalysisOptions: with_effect_sizes defaults to false and is respected", () => {
  assert.equal(driver.getDefaultAnalysisOptions({}).with_effect_sizes, false);
  assert.equal(driver.getDefaultAnalysisOptions({ with_effect_sizes: true }).with_effect_sizes, true);
});

test("summarize_q_q: percent_by picks the denominator — row, column or the whole table", () => {
  // 2×3 with uneven margins: rows 6 and 4, columns 5/3/2, grand total 10.
  const predictor = ['a','a','a','a','a','a','b','b','b','b'];
  const response  = ['x','x','x','y','y','z','x','x','y','z'];
  const pct = (mode) => Statz.summarize_q_q(predictor, response, undefined, { lang: 'en_us', percent_by: mode })
    .rows.flatMap(row => ['x','y','z'].map(k => parseFloat(String(row[k]).match(/\(([\d.]+)%\)/)[1])));

  // Row: each row sums to 100. Column: each column sums to 100. Total: the whole table sums to 100.
  const byRow = pct('row');
  assert.equal(byRow.slice(0, 3).reduce((a, b) => a + b, 0).toFixed(0), '100');
  assert.equal(byRow.slice(3).reduce((a, b) => a + b, 0).toFixed(0), '100');

  const byCol = pct('col');
  assert.equal((byCol[0] + byCol[3]).toFixed(0), '100', 'column x');
  assert.equal((byCol[1] + byCol[4]).toFixed(0), '100', 'column y');

  const byTotal = pct('total');
  assert.equal(byTotal.reduce((a, b) => a + b, 0).toFixed(0), '100', 'the whole table');
  assert.deepEqual(byTotal, [30, 20, 10, 20, 10, 10]);
});

test("summarize_q_q: percent_by='total' uses the complete-case pairs as the denominator", () => {
  // The row that is missing on one side is excluded from every margin, the grand total included.
  const predictor = ['a','a','b','b',null];
  const response  = ['x','y','x','y','x'];
  const t = Statz.summarize_q_q(predictor, response, undefined, { lang: 'en_us', percent_by: 'total' });
  // 4 complete pairs, one per cell → 25% each.
  t.rows.forEach(row => ['x','y'].forEach(k => assert.match(String(row[k]), /\(25\.0%\)/)));
});

test("getDefaultAnalysisOptions: percent_by accepts 'total' and falls back to 'col'", () => {
  assert.equal(driver.getDefaultAnalysisOptions({ percent_by: 'total' }).percent_by, 'total');
  assert.equal(driver.getDefaultAnalysisOptions({ percent_by: 'row' }).percent_by, 'row');
  assert.equal(driver.getDefaultAnalysisOptions({ percent_by: 'nonsense' }).percent_by, 'col');
  assert.equal(driver.getDefaultAnalysisOptions({}).percent_by, 'col');
});

// ---------------------------------------------------------------------------
// Profile A across databases — col_hash is the MD5 of the column NAME, so it is
// unique only WITHIN a database. Two uploads sharing a column name share its hash.
// ---------------------------------------------------------------------------

const collidingCol = (colHash, label, values) => ({
  col_hash: colHash, col_label: label, col_type: 'n', col_sep: '', col_del: false,
  col_values: { col_compact: false, labels: [], codes: [], raw_values: values },
  col_vars: [], meta: {}
});

test("Profile A: same-named predictors from two databases read their OWN data", () => {
  // Both databases have an "Idade" column, so both store it under the same hash. Before the
  // database_id scoping, the merged `columns` lookup matched on hash alone and returned dbA's
  // record for BOTH predictors — dbB was silently analysed with dbA's numbers.
  const HASH = 'md5_of_Idade';
  const dbA = { database_id: 'dbA', columns: [collidingCol(HASH, 'Idade', ['1', '2', '3', '4', '5'])] };
  const dbB = { database_id: 'dbB', columns: [collidingCol(HASH, 'Idade', ['100', '200', '300', '400', '500'])] };
  const sig = (dbId) => JSON.stringify({ database_id: dbId, col_hash: HASH, col_label: 'Idade', col_var_index: null });

  const { result } = Statz.runAnalysis([sig('dbA'), sig('dbB')], [], { dbA, dbB },
    Statz.getDefaultAnalysisOptions({}));

  assert.equal(result.analysis.length, 2);
  const minOf = (entry) => entry.table.rows.find(r => r.Variable === 'Minimum').Description;
  assert.equal(minOf(result.analysis[0]), '1.0');
  assert.equal(minOf(result.analysis[1]), '100.0');
  // The guard that would have caught the original bug: the two entries must not be identical.
  assert.notDeepEqual(result.analysis[0].table.rows, result.analysis[1].table.rows);
});

test("Profile A: a variant index is resolved within its own database", () => {
  // Same hash in both databases AND a variant at the same index — the scoping has to hold when
  // the (hash, var_index) pair matches in more than one database too.
  const HASH = 'md5_of_Escore';
  const withVariant = (values, variantValues) => ({
    ...collidingCol(HASH, 'Escore', values),
    col_vars: [null, {
      var_label: 'Escore (v1)', col_type: 'n', col_sep: '',
      col_values: { col_compact: false, labels: [], codes: [], raw_values: variantValues },
      meta: {}
    }]
  });
  const dbA = { database_id: 'dbA', columns: [withVariant(['1', '2', '3'], ['10', '20', '30'])] };
  const dbB = { database_id: 'dbB', columns: [withVariant(['4', '5', '6'], ['40', '50', '60'])] };
  const sig = (dbId) => JSON.stringify({ database_id: dbId, col_hash: HASH, col_label: 'Escore (v1)', col_var_index: 1 });

  const { result } = Statz.runAnalysis([sig('dbA'), sig('dbB')], [], { dbA, dbB },
    Statz.getDefaultAnalysisOptions({}));

  const minOf = (entry) => entry.table.rows.find(r => r.Variable === 'Minimum').Description;
  assert.equal(minOf(result.analysis[0]), '10.0');
  assert.equal(minOf(result.analysis[1]), '40.0');
});

test("summarize_n_q: a response with a single level reports no p-value, not p=0", () => {
  // Fewer than two groups carrying data means neither test branch runs and p_value stays null.
  // It used to be coerced to 0 by `+(null?.toFixed?.(4) ?? null)` — a finite number that the
  // exporter renders as "<0.001", announcing the strongest possible significance for a
  // comparison that never happened, with no test name and no footnote symbol to betray it.
  const numeric = ['10', '20', '30', '40', '50', '60'];
  const build = (responseValues) => ({
    columns: [mdbCol('h_age', 'Age', 'n', numeric), mdbCol('h_out', 'Outcome', 'q', responseValues)]
  });
  const run = (responseValues) => driver.runAnalysis(
    [mdbSig('dbA', 'h_age', 'Age')], [mdbSig('dbA', 'h_out', 'Outcome')],
    { dbA: build(responseValues) }, { lang: 'en_us' });

  const missingMarker = Statz.translate('table.missingValue', 'en_us');
  for (const [name, values] of [
    ['single level', ['yes', 'yes', 'yes', 'yes', 'yes', 'yes']],
    ['single level plus blanks', ['yes', '', 'yes', '', 'yes', 'yes']],
    ['no observed level at all', ['', '', '', '', '', '']]
  ]) {
    const { result } = run(values);
    const table = result.analysis[0].table;
    assert.equal(table.p_value, null, name);
    assert.equal(table.test_used, null, name);
    // What the reader actually sees. Also exercised after a JSON round-trip, because Bubble
    // persists Result_json and re-parses it before rendering.
    for (const payload of [result, JSON.parse(JSON.stringify(result))]) {
      const cell = Statz.combineAnalysisAsSingleTable(payload).rows[0]['p-value'];
      assert.equal(cell, missingMarker, name);
    }
    // Partial results still reach the user: the descriptive row for the one group survives.
    assert.ok(table.rows.length > 0, name);
  }

  // Control: two groups still produce a real test and a real p-value.
  const control = run(['no', 'yes', 'no', 'yes', 'no', 'yes']).result.analysis[0].table;
  assert.ok(Number.isFinite(control.p_value));
  assert.ok(control.test_used);
});

test("summarize_q_q: a table with fewer than two rows or columns reports no test", () => {
  // df = (rows-1)(cols-1), so 1×1, 2×1 and 1×2 tables admit no test. stdlib does not reject
  // them: chi2test returns {statistic: 0, df: 0, pValue: 0} — the strongest possible
  // significance attached to the weakest possible evidence, under the chi-square name.
  const dbA = {
    columns: [
      mdbCol('h_s', 'Status', 'q', ['fixed', 'fixed', 'fixed']),   // 1 level
      mdbCol('h_i', 'Income', 'q', ['high', 'high', 'low']),       // 2 levels
      mdbCol('h_e', 'Empty', 'q', ['', '', '']),                   // no level at all
      mdbCol('h_o', 'Outcome', 'q', ['other', 'other', 'other']),  // 1 level
      mdbCol('h_x', 'Sex', 'q', ['m', 'f', 'm'])                   // 2 levels
    ]
  };
  const run = (predHash, respHash) => driver.runAnalysis(
    [mdbSig('dbA', predHash, 'P')], [mdbSig('dbA', respHash, 'R')], { dbA }, { lang: 'pt_br' });

  for (const [name, predHash] of [['1x1', 'h_s'], ['2x1', 'h_i']]) {
    const { result } = run(predHash, 'h_o');
    const table = result.analysis[0].table;
    assert.equal(table.p_value, null, name);
    assert.equal(table.test_used, null, name);
    // Counts and percentages are unaffected — only the inference is withheld.
    assert.ok(table.rows.length > 0, name);
    assert.ok(table.rows.every(row => Object.values(row).some(v => String(v).includes('%'))), name);
    // No test means no footnote symbol and no legend entry claiming one was run.
    const combined = Statz.combineAnalysisAsSingleTable(result);
    assert.deepEqual(combined.test_legend, [], name);
    assert.equal(combined.rows[0]['p-valor'], Statz.translate('table.missingValue', 'pt_br'), name);
  }

  // A predictor with no observed level leaves `observed` empty; reading observed[0].length used
  // to throw before the dimension guard.
  assert.doesNotThrow(() => run('h_e', 'h_x'));
  assert.equal(run('h_e', 'h_x').result.analysis[0].table.p_value, null);

  // Control: a genuine 2×2 still runs its test.
  const control = run('h_i', 'h_x').result.analysis[0].table;
  assert.ok(control.test_used);
  assert.ok(Number.isFinite(control.p_value));
});

test("paired summaries carry the p-value on the table, never duplicated into a row", () => {
  // The p-value belongs to the table. combineAnalysisAsSingleTable renders it once on the
  // predictor header row — localised and carrying the test symbol that ties it to the footer
  // legend. The two paired summarisers also wrote it into their "n" row, so the same number
  // appeared twice, the second copy raw: "0,001¹" in the header and "0.0010" below it.
  const mkCol = (hash, label, type, values) => {
    const col = Statz.makeColumn(values, { col_type: type, var_label: label, includeBaseVariant: true });
    col.col_hash = hash; col.col_label = label;
    return col;
  };
  const sig = (hash, label) => JSON.stringify({ database_id: 'dbA', col_hash: hash, col_label: label, col_var_index: null });
  const paired = (columns, responses) => Statz.runAnalysis([], responses, { dbA: { columns } },
    Statz.getDefaultAnalysisOptions({ lang: 'pt_br' }));

  // Qualitative (McNemar) — the reported case.
  const t1 = ['no', 'no', 'no', 'yes', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'yes', 'yes', 'yes', 'no', 'yes'];
  const t2 = ['yes', 'yes', 'yes', 'yes', 'no', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'no', 'no', 'no', 'yes', 'yes', 'yes', 'yes', 'yes'];
  const q = paired([mkCol('h1', 'time 1', 'q', t1), mkCol('h2', 'time 2', 'q', t2)],
    [sig('h1', 'time 1'), sig('h2', 'time 2')]);
  assert.equal(q.result.analysis[0].table.test_used, 'McNemar');
  assert.ok(Number.isFinite(q.result.analysis[0].table.p_value), 'still reported on the table');
  assert.deepEqual(q.result.analysis[0].table.rows.map((r) => r['p-valor']), ['', '', '']);

  // Numeric paired takes the same path.
  const n = paired([mkCol('n1', 'antes', 'n', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']),
                    mkCol('n2', 'depois', 'n', ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])],
    [sig('n1', 'antes'), sig('n2', 'depois')]);
  // How MANY rows the numeric builder emits now follows `stat_options_by_group`, so this asserts
  // the property under test — no row carries the p — instead of a fixed row count.
  const numericRows = n.result.analysis[0].table.rows;
  assert.ok(numericRows.length > 0, 'there are rows to check');
  assert.deepEqual([...new Set(numericRows.map((r) => r['p-valor']))], ['']);

  // End to end: exactly one cell in the p-value column, on the header row, with the symbol.
  for (const result of [q.result, n.result]) {
    const cells = Statz.combineAnalysisAsSingleTable(result).rows.map((r) => r['p-valor']);
    assert.equal(cells.filter(Boolean).length, 1, 'one p-value per analysis');
    assert.match(cells[0], /^\d+,\d+¹$/, 'localised, and tied to the footer legend');
  }
});

test("has_residuals tracks availability, not the with_residuals toggle", () => {
  // The flag gates the with_residuals option itself, so deriving it from "a symbol was printed"
  // made the toggle one-way: switching it off removed the flag, removed the option, and left no
  // way back. Availability is computed whether or not the display is on; what the display
  // controls is the annotation and the footer legend that explains it.
  const N = 90;
  const pred = [], resp = [];
  for (let i = 0; i < N; i++) {
    const g = ['a', 'b', 'c'][i % 3];
    pred.push(g);
    resp.push(g === 'a' ? 'sim' : g === 'b' ? 'nao' : (i % 6 === 2 ? 'sim' : 'nao'));
  }
  const col = (hash, label, values) => {
    const c = Statz.makeColumn(values, { col_type: 'q', includeBaseVariant: true });
    c.col_hash = hash; c.col_label = label; return c;
  };
  const p = col('hp', 'Grupo', pred), r = col('hr', 'Desfecho', resp);
  const sig = (c) => JSON.stringify({ database_id: 'dbA', col_hash: c.col_hash, col_label: c.col_label, col_var_index: null });
  const run = (cols, extra) => Statz.runAnalysis([sig(cols[0])], [sig(cols[1])], { dbA: { columns: cols } },
    Statz.getDefaultAnalysisOptions({ mode: 'table', ...extra }));

  const on = run([p, r], {});
  const off = run([p, r], { with_residuals: false });
  assert.ok(on.result.analysis[0].table.p_value < 0.05, 'the fixture is significant');
  assert.ok(on.flags.includes('has_residuals'), 'available and shown');
  assert.ok(off.flags.includes('has_residuals'), 'available and hidden — still available');

  // What the toggle does control: the annotation, the residual payload, and the legend signal.
  assert.ok(on.result.analysis[0].table.used_resid_greater || on.result.analysis[0].table.used_resid_lower);
  assert.equal(off.result.analysis[0].table.used_resid_greater, false, 'no symbol printed');
  assert.equal(off.result.analysis[0].table.used_resid_lower, false);
  assert.equal(off.result.analysis[0].table.posthoc_residuals, null, 'nor computed-and-hidden payload');
  // The footer legend follows the symbols, not availability — explaining marks nobody can see
  // would be worse than saying nothing.
  const legendOf = (res) => Statz.combineAnalysisAsSingleTable(res.result);
  assert.ok(legendOf(on).resid_symbol_greater_used || legendOf(on).resid_symbol_lower_used);
  assert.equal(legendOf(off).resid_symbol_greater_used, false);
  assert.equal(legendOf(off).resid_symbol_lower_used, false);

  // An independent pair has no residuals to show at all, whatever the toggle says.
  const pi = col('hpi', 'Grupo', Array.from({ length: N }, (_, i) => ['a', 'b', 'c'][i % 3]));
  const ri = col('hri', 'Desfecho', Array.from({ length: N }, (_, i) => ['sim', 'nao'][i % 2]));
  assert.ok(!run([pi, ri], {}).flags.includes('has_residuals'), 'not significant → nothing available');

  // Significance alone is not availability. A 6x6 checkerboard spreads a large deviation over
  // every cell: chi-square clears its (much higher) critical value while no single adjusted
  // residual reaches 1.96, so there is still nothing to annotate. Availability has to test the
  // cells, not just the p-value — the significance gate is only what makes the cells worth
  // computing.
  const spread = { pred: [], resp: [] };
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      for (let k = 0; k < ((i + j) % 2 === 0 ? 14 : 6); k++) {
        spread.pred.push('R' + i); spread.resp.push('C' + j);
      }
    }
  }
  const diffuse = Statz.summarize_q_q(spread.pred, spread.resp, null, { with_residuals: true, lang: 'en_us' });
  assert.ok(diffuse.p_value < 0.05, 'the association is significant');
  assert.ok(Math.max(...diffuse.posthoc_residuals.flat().map(Math.abs)) < 1.96, 'yet no cell qualifies');
  assert.equal(diffuse.residuals_available, false, 'so there are no residuals to offer');
  const ps = col('hps', 'R', spread.pred), rs = col('hrs', 'C', spread.resp);
  assert.ok(!Statz.runAnalysis([sig(ps)], [sig(rs)], { dbA: { columns: [ps, rs] } },
    Statz.getDefaultAnalysisOptions({ mode: 'table' })).flags.includes('has_residuals'));
});

test("has_kruskal_sign survives an adjustment that silences every pair", () => {
  // The property that makes `adjust_kruskal`'s gate safe. The option is offered only when this
  // flag is present, so if the flag depended on a pair SURVIVING the adjustment, picking a
  // stricter correction would remove the flag, remove the option, and leave no way back — the
  // one-way switch `has_residuals` had. The flag therefore reports "Dunn ran", not "Dunn found
  // something": `flagsUsed.add` sits outside the `.filter(v => v.significant)`.
  //
  // Fixture found by search: strongly skewed, so the normality check routes it to Kruskal (a
  // normal-but-heteroscedastic fixture now goes to Welch + Games-Howell instead, correctly).
  // Kruskal is significant, and with three comparisons Bonferroni pushes every pair back over
  // alpha while the uncorrected run keeps two.
  const groups = ["a","a","a","a","a","a","a","b","b","b","b","b","b","b","c","c","c","c","c","c","c"];
  const values = ["0.022","0.021","0.125","0.001","0.126","10.538","0.013",
    "0.505","1.795","6.841","0.595","5.393","0.586","1.12",
    "1.102","1.02","1.012","2.197","1","1.895","1.039"];
  const summarize = (adjust_kruskal) => {
    const flags = new Set();
    const table = Statz.summarize_n_q(values, groups, null, flags,
      { alpha: 0.05, adjust_kruskal, lang: 'en_us' });
    return { table, flags };
  };

  const strict = summarize('bonferroni');
  const raw = summarize('none');
  assert.equal(strict.table.test_used, 'Kruskal–Wallis', 'the fixture must stay on the rank-test route');
  assert.ok(strict.table.p_value < 0.05, 'the omnibus test is significant either way');
  // The adjustment genuinely changes the outcome here — otherwise the assertion below is vacuous.
  assert.equal(strict.table.posthoc.length, 0, 'Bonferroni silences every pair');
  assert.ok(raw.table.posthoc.length > 0, 'uncorrected, some survive');
  // ...and yet the flag is present in both, so the option can never hide itself.
  for (const [name, out] of [['bonferroni', strict], ['none', raw]]) {
    assert.ok(out.flags.has('has_kruskal_sign'), `${name}: flag reports that Dunn ran`);
  }
});

test("Holm is a step-down: never weaker than Bonferroni, and monotone in raw-p order", () => {
  // Reported: the same data that gave one significant pair under Bonferroni gave NONE under Holm.
  // That is impossible — Holm's first term is m*p(1), identical to Bonferroni's, so it is
  // uniformly the more powerful of the two. The monotonicity pass was propagating its max
  // BACKWARD (the Benjamini-Hochberg direction, which uses a running min), which handed every
  // comparison the largest adjusted value and punished the most significant pair hardest.
  const predictor = Statz.getColumnValues(parsed, "col_score_hash");
  const response = Statz.getColumnValues(parsed, "col_income_hash");
  const posthoc = (adjust_kruskal) =>
    Statz.summarize_n_q(predictor.rawValues, response.rawValues, null, null, { adjust_kruskal }).posthoc;

  // Raw p-values for this fixture are 0.0062, 0.0245, 0.2821 over three comparisons.
  assert.deepEqual(posthoc('holm'), [
    { groupA: 'low', groupB: 'high', pValue: 0.0185, significant: true },   // 3 x 0.0062
    { groupA: 'low', groupB: 'middle', pValue: 0.049, significant: true }   // 2 x 0.0245
  ]);
  // The smallest p gets the same treatment under both, which is what makes the ordering hold.
  assert.equal(posthoc('holm')[0].pValue, posthoc('bonferroni')[0].pValue);
  assert.ok(posthoc('holm').length > posthoc('bonferroni').length, 'and Holm recovers a pair Bonferroni loses');

  // All three corrections list the pairs in the same order, so switching one does not reshuffle
  // the legend under the reader. Holm used to emit its internal ascending-p ranking.
  const pairs = (adjust) => Statz.runDunnTest(
    (() => {
      const map = {};
      predictor.rawValues.forEach((v, i) => {
        const g = response.rawValues[i];
        if (g == null || g === '') return;
        const n = Number(v);
        if (Number.isFinite(n)) (map[g] ??= []).push(n);
      });
      return map;
    })(), 0.05, adjust).map((c) => `${c.groupA}|${c.groupB}`);
  assert.deepEqual(pairs('holm'), ['low|high', 'low|middle', 'high|middle']);
  assert.deepEqual(pairs('bonferroni'), pairs('holm'));
  assert.deepEqual(pairs('none'), pairs('holm'));

  // The property that would have caught this on any data: whatever Bonferroni calls significant,
  // Holm must too. Swept over group counts, sizes and separations.
  const rnd = (s) => () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let holmFoundMore = 0;
  for (let seed = 1; seed < 200; seed++) {
    const r = rnd(seed), k = 3 + (seed % 3), groups = {};
    for (let g = 0; g < k; g++) groups[`g${g}`] = Array.from({ length: 6 + seed % 7 }, () => g * 0.9 + r() * 3);
    const names = (adjust) => new Set(Statz.runDunnTest(groups, 0.05, adjust)
      .filter((c) => c.significant).map((c) => `${c.groupA}|${c.groupB}`));
    const bonf = names('bonferroni'), holm = names('holm');
    for (const pair of bonf) assert.ok(holm.has(pair), `seed ${seed}: Holm lost ${pair}`);
    if (holm.size > bonf.size) holmFoundMore += 1;

    // Every correction returns the SAME pair order — the one the comparison loop builds from the
    // response's levels — so a reader can scan the list the same way whichever is chosen. Holm
    // ranks internally to compute; it must not leak that ranking into its output.
    const pairsOf = (adjust) => Statz.runDunnTest(groups, 0.05, adjust).map((c) => `${c.groupA}|${c.groupB}`);
    assert.deepEqual(pairsOf('holm'), pairsOf('none'), `seed ${seed}: Holm reordered the pairs`);
    assert.deepEqual(pairsOf('bonferroni'), pairsOf('none'), `seed ${seed}: Bonferroni reordered the pairs`);

    // Adjusted p-values must not decrease as the RAW p-values grow — checked in raw-p order,
    // which is no longer the output order. Both series come back rounded to 4 decimals, and two
    // genuinely different raw p-values can round to the same number (several tiny ones all land on
    // 0). Where that happens the output no longer says which came first, so the reconstruction
    // cannot tell either and the pair is skipped rather than compared in a guessed order.
    const raw = Statz.runDunnTest(groups, 0.05, 'none').map((c) => c.pValue);
    const holmP = Statz.runDunnTest(groups, 0.05, 'holm').map((c) => c.pValue);
    const byRaw = raw.map((_, i) => i).sort((a, b) => raw[a] - raw[b]);
    for (let i = 1; i < byRaw.length; i++) {
      if (raw[byRaw[i]] === raw[byRaw[i - 1]]) continue;
      assert.ok(holmP[byRaw[i]] >= holmP[byRaw[i - 1]],
        `seed ${seed}: adjusted p fell from ${holmP[byRaw[i - 1]]} to ${holmP[byRaw[i]]}`);
    }
  }
  assert.ok(holmFoundMore > 10, `the sweep must actually separate the two (${holmFoundMore} cases)`);
});

test("k>2 routes heteroscedastic normal data to Welch + Games-Howell", () => {
  // The parametric gate is `allNormal && homoscedastic`, and anything failing it used to fall to
  // Kruskal-Wallis — which answers the wrong violation. Kruskal is the test for non-normality;
  // it is not robust to unequal spread (it tests stochastic dominance, so equal medians with
  // different variances can still reject). The two-group branch already made this distinction by
  // switching ttest2 to `variance: 'unequal'`; this is the same correction for three or more.
  const rep = (arr, k) => Array.from({ length: k }, () => arr).flat();
  const routes = [
    ['normal + homoscedastic', rep(['a', 'b', 'c'], 8),
      [10, 20, 30, 11, 21, 31, 9, 19, 29, 12, 22, 32, 8, 18, 28, 10.5, 20.5, 30.5, 11.5, 21.5, 31.5, 9.5, 19.5, 29.5].map(String),
      'ANOVA', 'has_tukey'],
    ['normal + heteroscedastic', ['a', 'a', 'a', 'a', 'a', 'b', 'b', 'b', 'b', 'b', 'c', 'c', 'c', 'c', 'c'],
      ['2.88', '2.97', '2.534', '2.495', '2.612', '1.604', '3.599', '1.419', '1.763', '3.63',
        '3.001', '4.179', '3.71', '3.949', '3.427'],
      'Welch\u2019s ANOVA', 'has_games_howell'],
    ['skewed, so non-normal', ['a', 'a', 'a', 'a', 'a', 'a', 'a', 'b', 'b', 'b', 'b', 'b', 'b', 'b', 'c', 'c', 'c', 'c', 'c', 'c', 'c'],
      ['0.022', '0.021', '0.125', '0.001', '0.126', '10.538', '0.013', '0.505', '1.795', '6.841',
        '0.595', '5.393', '0.586', '1.12', '1.102', '1.02', '1.012', '2.197', '1', '1.895', '1.039'],
      'Kruskal\u2013Wallis', 'has_kruskal_sign']
  ];
  for (const [name, groups, values, expectedTest, expectedFlag] of routes) {
    const flags = new Set();
    const table = Statz.summarize_n_q(values, groups, null, flags, { alpha: 0.05, lang: 'en_us' });
    assert.equal(table.test_used, expectedTest, name);
    assert.ok(table.p_value < 0.05, `${name}: the fixture must be significant to reach a post-hoc`);
    assert.ok(flags.has(expectedFlag), `${name}: expected ${expectedFlag}, got ${[...flags]}`);
  }

  // The flag alone would not prove WHICH post-hoc ran. On the heteroscedastic fixture the two
  // disagree outright — Games-Howell finds a vs c, Tukey finds b vs c — so the reported pair says
  // which function the branch actually called.
  const hetero = { a: [2.88, 2.97, 2.534, 2.495, 2.612], b: [1.604, 3.599, 1.419, 1.763, 3.63], c: [3.001, 4.179, 3.71, 3.949, 3.427] };
  const gh = Statz.runGamesHowell(hetero, 0.05).filter((c) => c.significant);
  const tuk = Statz.runTukeyHSD(hetero, 0.05).filter((c) => c.significant);
  assert.notDeepEqual(gh, tuk, 'the fixture must separate the two post-hocs');
  const viaBranch = Statz.summarize_n_q(routes[1][2], routes[1][1], null, new Set(), { alpha: 0.05, lang: 'en_us' });
  assert.deepEqual(viaBranch.posthoc, gh, 'the Welch branch reports Games-Howell');

  // Welch's ANOVA reduces to Welch's t at k=2: F = t², same p, same denominator df. That identity
  // pins the whole formula, weighting and Satterthwaite df included.
  const a = [12, 14, 15, 13, 16, 14, 15, 13, 14];
  const b = [18, 25, 19, 31, 17, 22, 40, 15];
  const welch = Statz.computeWelchAnova({ a, b });
  const tWelch = statistics.ttest2(a, b, { variance: 'unequal' });
  // F and df match to machine precision, which is what pins the formula. The p-values differ by
  // ~4e-10 because they come from two independent CDF implementations — jStat's F here, stdlib's
  // t there — so the looser bound is about those libraries, not about this arithmetic.
  assert.ok(Math.abs(welch.statistic - (tWelch.statistic ** 2)) < 1e-12, 'F = t\u00b2');
  assert.ok(Math.abs(welch.df2 - tWelch.df) < 1e-12, 'and the same denominator df');
  assert.ok(Math.abs(welch.pValue - tWelch.pValue) < 1e-8, 'and the same p');
  // The correction term 1 + 2(k-2)tmp vanishes at k=2, so the identity above cannot see it. For
  // k=3 it is pinned by the relationship it creates between the statistic and the denominator df:
  // since df2 = 1/(3.tmp), the reported F times (1 + 2/(3.df2)) must give back the uncorrected
  // between-group term, which the test computes from the data on its own.
  const trio = { A: [10, 12, 11, 13, 12, 11, 10, 12], B: [15, 30, 5, 25, 10, 20], C: [20, 21, 20, 21, 20, 21, 20] };
  const arrays = Object.values(trio);
  const meanOf = (x) => x.reduce((sum, v) => sum + v, 0) / x.length;
  const varOf = (x) => { const m = meanOf(x); return x.reduce((sum, v) => sum + ((v - m) ** 2), 0) / (x.length - 1); };
  const weights = arrays.map((x) => x.length / varOf(x));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const grand = arrays.reduce((sum, x, i) => sum + weights[i] * meanOf(x), 0) / totalWeight;
  const between = arrays.reduce((sum, x, i) => sum + weights[i] * ((meanOf(x) - grand) ** 2), 0);
  const trioWelch = Statz.computeWelchAnova(trio);
  assert.ok(Math.abs((trioWelch.statistic * (1 + (2 / (3 * trioWelch.df2)))) - (between / 2)) < 1e-9,
    'the k>2 correction term is applied');
  assert.ok(trioWelch.statistic < between / 2, 'and it shrinks the statistic, as it must');

  // Games-Howell likewise reduces to Welch's t at k=2.
  assert.equal(Statz.runGamesHowell({ a, b }, 0.05)[0].pValue, +tWelch.pValue.toFixed(4));
});

test("Games-Howell recovers a difference Tukey's pooled variance hides", () => {
  // Why the routing matters in practice, not just in principle. Two tight groups differ by a
  // full unit with sd ~0.13 each; a third group is wildly variable. Pooling inflates the error
  // term for EVERY comparison, including the two that have nothing to do with the noisy group.
  const groups = {
    A: [10.0, 10.2, 9.8, 10.1, 9.9, 10.0, 10.1],
    B: [11.0, 11.2, 10.8, 11.1, 10.9, 11.0, 11.1],
    C: [2, 18, 4, 20, 6, 16, 25]
  };
  const pairOf = (rows, x, y) => rows.find((c) => c.groupA === x && c.groupB === y);
  const tukey = pairOf(Statz.runTukeyHSD(groups, 0.05), 'A', 'B');
  const gamesHowell = pairOf(Statz.runGamesHowell(groups, 0.05), 'A', 'B');

  assert.ok(gamesHowell.significant, `A vs B is a real 1.0 difference: ${gamesHowell.pValue}`);
  assert.ok(!tukey.significant, `pooling hides it: ${tukey.pValue}`);
  assert.ok(tukey.pValue > 0.5, 'and not marginally — the pooled MSE is ~40x the real one');

  // Comparisons involving the noisy group stay non-significant under both; the difference is
  // confined to the pair whose own variances the pooling misrepresented.
  for (const [x, y] of [['A', 'C'], ['B', 'C']]) {
    assert.ok(!pairOf(Statz.runGamesHowell(groups, 0.05), x, y).significant, `${x} vs ${y}`);
  }
});

test("the Welch route offers no external correction, because Games-Howell needs none", () => {
  // Same reason Tukey takes no option: the multiplicity correction lives inside the studentized
  // range statistic. adjust_kruskal exists for Dunn alone, which produces uncorrected pairwise
  // z-tests and has no joint distribution to compare against.
  const offered = (flags) => Statz.getAvailableOptions(flags, 'table').some((o) => o.name === 'adjust_kruskal');
  assert.equal(offered(['has_nq', 'has_games_howell']), false);
  assert.equal(offered(['has_nq', 'has_tukey']), false);
  assert.equal(offered(['has_nq', 'has_kruskal_sign']), true);
});

test("degenerate groups do not fabricate a Welch result", () => {
  // A constant group makes Welch's weight n/s² infinite, so the omnibus test reports nothing
  // rather than a nonsense F. Games-Howell guards per PAIR instead: a comparison against a
  // constant group still has a finite standard error and is meaningful. The two are reachable
  // together only in isolation — through summarize_n_q the post-hoc runs only once the omnibus
  // returned a p, so this data never reaches it.
  assert.equal(Statz.computeWelchAnova({ A: [5, 5, 5, 5, 5], B: [1, 9, 2, 8, 3], C: [10, 20, 11, 19, 12] }).pValue, null);
  assert.equal(Statz.computeWelchAnova({ A: [5, 5, 5], B: [7, 7, 7] }).pValue, null);
  assert.deepEqual(Statz.runGamesHowell({ A: [1] }, 0.05), [], 'a lone value has no variance to use');
  // Zero error on both sides reports p = 1: no evidence rather than certainty, which is the
  // conservative direction for a degenerate input.
  assert.equal(Statz.runGamesHowell({ A: [5, 5, 5], B: [7, 7, 7] }, 0.05)[0].pValue, 1);

  // End to end, this data no longer reaches Welch at all, and that is the better outcome. A
  // constant group is degenerate rather than normal, so the shared `isNormal` gate rejects it and
  // the comparison routes to the rank test — which handles a constant group without trouble and
  // gives the reader a usable answer where the old path returned nothing. The guards above still
  // matter: they are what `computeWelchAnova` does when called directly.
  const groups = ['a', 'a', 'a', 'a', 'a', 'b', 'b', 'b', 'b', 'b', 'c', 'c', 'c', 'c', 'c'];
  const values = ['5', '5', '5', '5', '5', '1', '9', '2', '8', '3', '10', '20', '11', '19', '12'];
  const flags = new Set();
  const table = Statz.summarize_n_q(values, groups, null, flags, { alpha: 0.05, lang: 'en_us' });
  assert.equal(table.test_used, Statz.translate('tests.kruskalWallis', 'en_us'));
  assert.equal(table.p_value, 0.0073);
  assert.deepEqual(table.posthoc.map((c) => [c.groupA, c.groupB]), [['a', 'c'], ['b', 'c']]);
  assert.deepEqual([...flags], ['has_kruskal_sign']);
  // The descriptive rows still reach the reader — a test that cannot run must not blank the summary.
  assert.ok(table.rows.length > 0 && table.columns.length > 0);
});

test("the correlation table is localized and reads at a useful precision", () => {
  // Reported from a pt_br element: `p-value` and `95% CI` as English row labels, the p-value
  // printed as a hardcoded `<0.0001` with a decimal POINT, and r / CI carrying four decimals.
  // Three of those are the same defect — a summary that pre-formats its own cells had drifted
  // from the shared formatters — and the fourth is a readability call.
  const N = 50;
  const xs = Array.from({ length: N }, (_, i) => String([3, 9, 1, 7, 5, 2, 8, 4, 6, 10][i % 10]));
  const ys = Array.from({ length: N }, (_, i) => String([5, 2, 9, 1, 7, 4, 3, 10, 6, 8][i % 10]));

  for (const [lang, ciLabel, pLabel, decimal] of [
    ['pt_br', 'IC 95%', 'p-valor', ','],
    ['en_us', '95% CI', 'p-value', '.'],
    ['es_es', 'IC 95%', 'Valor p', ',']
  ]) {
    const table = Statz.summarize_n_n(xs, ys, null, { lang });
    const cell = (label) => table.rows.find((r) => r[table.columns[0]] === label)?.[table.columns[1]];
    assert.ok(cell(ciLabel) !== undefined, `${lang}: the CI row is labelled ${ciLabel}`);
    assert.ok(cell(pLabel) !== undefined, `${lang}: the p-value row is labelled ${pLabel}`);
    // Two decimals on r and on both interval bounds. Checked by splitting on the locale's
    // separator rather than by regex, which needs escaping that a template literal eats.
    const decimalsOf = (text) => String(text).split(decimal)[1]?.length ?? 0;
    assert.equal(decimalsOf(cell('r')), 2, `${lang}: r = ${cell('r')}`);
    for (const bound of cell(ciLabel).replace('[', '').replace(']', '').split(', ')) {
      assert.equal(decimalsOf(bound), 2, `${lang}: CI bound ${bound}`);
    }
    // The p-value uses the locale's separator and the shared 3-decimal rendering.
    assert.ok(!cell(pLabel).includes(decimal === ',' ? '.' : ','), `${lang}: ${cell(pLabel)} uses the wrong separator`);
    assert.ok(!cell(pLabel).includes('0001'), `${lang}: the 4-decimal cut-off is gone (${cell(pLabel)})`);
  }

  // Display precision only: the returned fields keep four decimals for anyone computing with them.
  const table = Statz.summarize_n_n(xs, ys, null, { lang: 'pt_br' });
  for (const key of ['correlation', 'ci_lower', 'ci_upper']) {
    assert.ok(Number.isFinite(table[key]), key);
    assert.ok(String(table[key]).replace('-', '').split('.')[1]?.length <= 4, `${key} keeps 4 decimals`);
  }
  assert.notEqual(table.correlation, Number(table.rows[1][table.columns[1]].replace(',', '.')),
    'the stored value is more precise than the rendered one');

  // A p-value below the shared threshold reads as the shared cut-off, not a private one.
  const strong = Array.from({ length: N }, (_, i) => String(i + 1));
  const alsoStrong = Array.from({ length: N }, (_, i) => String((2 * (i + 1)) + ((i % 5) * 0.4)));
  const strongTable = Statz.summarize_n_n(strong, alsoStrong, null, { lang: 'pt_br' });
  assert.equal(strongTable.rows.find((r) => r[strongTable.columns[0]] === 'p-valor')[strongTable.columns[1]], '<0,001');
});

test("the correlation table names the test it actually ran", () => {
  // Both branches build the same table, so a formatting change must not blur which one produced it.
  const N = 50;
  const linear = { x: Array.from({ length: N }, (_, i) => String(i + 1)),
    y: Array.from({ length: N }, (_, i) => String((2 * (i + 1)) + ((i % 5) * 0.4))) };
  assert.equal(Statz.summarize_n_n(linear.x, linear.y, null, { lang: 'en_us' }).test_used, 'Pearson correlation');

  // Strongly skewed marginals fail the normality check and route to the rank correlation.
  const rnd = (s) => () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const next = rnd(7);
  const skewed = Array.from({ length: N }, () => +((next() ** 6) * 1000).toFixed(3));
  const monotone = skewed.map((v, i) => +((v ** 0.5) + (i % 4)).toFixed(3));
  const table = Statz.summarize_n_n(skewed.map(String), monotone.map(String), null, { lang: 'en_us' });
  assert.equal(table.test_used, 'Spearman correlation');
  assert.equal(Statz.summarize_n_n(skewed.map(String), monotone.map(String), null, { lang: 'pt_br' }).test_used,
    'Correlação de Spearman');
});

test("every analysis gets its p-value cell and symbol, whatever order it is listed in", () => {
  // Reported: an n x n listed before a q x n showed its legend entry but no superscript, and no
  // p-value cell at all. Rows are written against the columns known SO FAR, and `summarize_n_n`
  // reports its p inside its rows rather than in a column — so nothing had declared the p-value
  // column by the time the correlation's intro row was built. The same two analyses in the
  // opposite order came out right, which is what makes it a bug rather than a layout choice.
  const N = 50;
  const mk = (hash, label, type, values) => {
    const c = Statz.makeColumn(values, { col_type: type, includeBaseVariant: true });
    c.col_hash = hash; c.col_label = label; return c;
  };
  const x = mk('hx', 'NumPred', 'n', Array.from({ length: N }, (_, i) => String(i + 1)));
  const y = mk('hy', 'NumResp', 'n', Array.from({ length: N }, (_, i) => String((2 * (i + 1)) + ((i % 5) * 0.4))));
  const o = mk('ho', 'Origin', 'q', Array.from({ length: N }, (_, i) => ['foreign', 'local'][i % 2]));
  const sig = (c) => JSON.stringify({ database_id: 'dbA', col_hash: c.col_hash, col_label: c.col_label, col_var_index: null });
  const combine = (preds) => {
    const { result } = Statz.runAnalysis(preds.map(sig), [sig(y)], { dbA: { columns: [x, y, o] } },
      Statz.getDefaultAnalysisOptions({ mode: 'table', lang: 'pt_br' }));
    return Statz.combineAnalysisAsSingleTable(result);
  };
  const headerCells = (combined) => combined.rows
    .filter((r) => Statz.isPredictorHeaderRow(r[combined.columns[0]]))
    .map((r) => ({ label: r[combined.columns[0]].replace(/<[^>]+>/g, ''), p: r['p-valor'] }));

  for (const [name, preds] of [['correlation first', [x, o]], ['comparison first', [o, x]]]) {
    const combined = combine(preds);
    assert.ok(combined.columns.includes('p-valor'), `${name}: the column exists`);
    const headers = headerCells(combined);
    assert.equal(headers.length, 2, name);
    for (const { label, p } of headers) {
      assert.ok(p && p.length > 0, `${name}: ${label} has no p-value cell`);
      // Every symbol printed must be one the legend explains, and vice versa.
      const symbol = p.replace(/^[^¹²³⁰-₟]*/, '');
      assert.ok(symbol.length > 0, `${name}: ${label} carries no symbol (${p})`);
      assert.ok(combined.test_legend.some((e) => e.symbol === symbol),
        `${name}: ${symbol} is not in the legend`);
    }
    // The correlation's p reads the same either way; only its symbol number follows the order.
    const correlation = headers.find((h) => h.label.includes('NumPred'));
    assert.ok(correlation.p.startsWith('<0,001'), `${name}: ${correlation.p}`);
  }

  // A lone correlation still gets the column — before, nothing declared it and the p vanished.
  const solo = combine([x]);
  assert.ok(solo.columns.includes('p-valor'));
  assert.equal(headerCells(solo).length, 1);
  assert.ok(headerCells(solo)[0].p.startsWith('<0,001'));

  // And the p is printed once per block: the statistics list keeps n / r / CI, not a second p.
  const bodyLabels = solo.rows
    .filter((r) => !Statz.isPredictorHeaderRow(r[solo.columns[0]]))
    .map((r) => r['Variável']);
  assert.deepEqual(bodyLabels, ['n', 'r', 'IC 95%'], 'the duplicated p-value row is gone');

  // Nothing was dropped from a table that owns a p-value column: its rows blank it themselves.
  const grouped = combine([o]);
  assert.equal(grouped.rows.filter((r) => !Statz.isPredictorHeaderRow(r[grouped.columns[0]])).length, 1);

  // The column is seeded only where some analysis reports a p. A descriptive-only listing has no
  // test behind it, so it must not grow an empty column just because the seeding runs up front.
  const { result: descriptive } = Statz.runAnalysis([sig(x), sig(o)], [], { dbA: { columns: [x, y, o] } },
    Statz.getDefaultAnalysisOptions({ mode: 'table', lang: 'pt_br' }));
  const described = Statz.combineAnalysisAsSingleTable(descriptive);
  // Checked against every language: this listing resolves its labels differently from the ones
  // above, and asserting the Portuguese spelling alone would pass without testing anything.
  const anyPLabel = ['pt_br', 'en_us', 'es_es'].map((l) => Statz.translate('table.columns.pValue', l));
  assert.ok(!described.columns.some((c) => anyPLabel.includes(c)), JSON.stringify(described.columns));
});


test("the first column is named for what the tables put in it, not for having a response", () => {
  // Reported: an element holding only a correlation opened with an orphan "Grupo" column, empty in
  // every row, while the Result_json it came from declared only ["Variável", "Descrição"]. The
  // header was chosen from the analysis SHAPE — any entry with a response counted as grouped — but
  // `summarize_n_n` keys its rows by variable, so nothing was ever written under it.
  const N = 50;
  const mk = (hash, label, type, values) => {
    const c = Statz.makeColumn(values, { col_type: type, includeBaseVariant: true });
    c.col_hash = hash; c.col_label = label; return c;
  };
  const x = mk('hx', 'NumPred', 'n', Array.from({ length: N }, (_, i) => String(i + 1)));
  const y = mk('hy', 'NumResp', 'n', Array.from({ length: N }, (_, i) => String((2 * (i + 1)) + ((i % 5) * 0.4))));
  const o = mk('ho', 'Origin', 'q', Array.from({ length: N }, (_, i) => ['foreign', 'local'][i % 2]));
  const sig = (c) => JSON.stringify({ database_id: 'dbA', col_hash: c.col_hash, col_label: c.col_label, col_var_index: null });
  const run = (preds) => {
    const { result } = Statz.runAnalysis(preds.map(sig), [sig(y)], { dbA: { columns: [x, y, o] } },
      Statz.getDefaultAnalysisOptions({ mode: 'table', lang: 'pt_br' }));
    return Statz.combineAnalysisAsSingleTable(result);
  };
  const groupLabel = Statz.translate('table.columns.group', 'pt_br');

  // A correlation alone: the combined columns are the ones its own table declares, plus the p.
  const solo = run([x]);
  assert.deepEqual(solo.columns, ['Variável', 'Descrição', 'p-valor']);
  assert.ok(!solo.columns.includes(groupLabel));
  // Its rows land in that first column rather than leaving it blank.
  assert.ok(solo.rows.every((r) => (r['Variável'] ?? '') !== ''), JSON.stringify(solo.rows));

  // A grouped comparison still opens with the group column — alone or beside the correlation.
  assert.equal(run([o]).columns[0], groupLabel);
  const mixed = run([x, o]);
  assert.equal(mixed.columns[0], groupLabel);
  // There the correlation keeps its own "Variável" column and leaves the group one empty, which is
  // what makes the lone case different: with no grouped table, the two are the same column.
  assert.ok(mixed.columns.includes('Variável'));

  // Warning entries (a rejected pairing, l × l without a subset, a response missing from a second
  // Database) carry no columns for the rule above to read. An element where every entry is one of
  // those keeps the older reading, so a rejected group comparison still says "Grupo".
  const allWarnings = Statz.combineAnalysisAsSingleTable({
    lang: 'pt_br',
    analysis: [{ predictor: 'Origin', response: 'NumResp', table: { warning: 'não pareado' } }]
  });
  assert.deepEqual(allWarnings.columns, [groupLabel]);
});


test("paired numeric summaries honour stat_options_by_group, with localised row labels", () => {
  // Reported: whatever the panel offered, the table always came back Mean ± SD / Median ± IQR / n.
  // `has_paired_n` is listed in that option's `appliesTo`, so the choice was offered and dropped,
  // and the first two labels were hardcoded English sitting in an otherwise pt_br table.
  const mk = (hash, label, values) => {
    const c = Statz.makeColumn(values, { col_type: 'n', var_label: label, includeBaseVariant: true });
    c.col_hash = hash; c.col_label = label; return c;
  };
  const A = ['3', '5', '7', '9', '11', '13', '15', '4', '6', '8', '10', '12', '14', '2', '1'];
  const cols = [mk('h1', 'time 1', A), mk('h2', 'time 2', A.map((v) => String(+v + 2))),
                mk('h3', 'time 3', A.map((v) => String(+v + 5)))];
  const sig = (h, l) => JSON.stringify({ database_id: 'dbA', col_hash: h, col_label: l, col_var_index: null });
  const all = [sig('h1', 'time 1'), sig('h2', 'time 2'), sig('h3', 'time 3')];
  const table = (responses, opts) => Statz.runAnalysis([], responses, { dbA: { columns: cols } },
    Statz.getDefaultAnalysisOptions({ lang: 'pt_br', ...opts })).result.analysis[0].table;
  const labelsOf = (t) => t.rows.map((r) => r['Variável']);

  // Friedman (K = 3), the reported case: the default is one statistic, not three.
  const def = table(all, {});
  assert.equal(def.test_used, 'Friedman');
  assert.deepEqual(labelsOf(def), ['Média ± DP']);
  // The cell is unchanged by the refactor, sample sd and 2 decimals included: the grouped helper
  // reports a POPULATION sd, so delegating to it would have quietly moved this number.
  assert.equal(def.rows[0]['time 1'], '8,00 ± 4,47');

  // The selection is honoured, and in the order it was given.
  assert.deepEqual(labelsOf(table(all, { stat_options_by_group: ['n', 'median_iqr', 'mean_sd'] })),
    ['n', 'Mediana ± IQR', 'Média ± DP']);
  assert.deepEqual(labelsOf(table(all, { stat_options_by_group: ['min', 'max'] })), ['Mínimo', 'Máximo']);

  // `n_missing` produces no row: the moments are row-aligned, so it would repeat one number across
  // every column. Selecting it alongside others must not disturb them.
  assert.deepEqual(labelsOf(table(all, { stat_options_by_group: ['min', 'n_missing', 'max'] })), ['Mínimo', 'Máximo']);

  // Same builder for K = 2, so the paired t / Wilcoxon tables follow.
  const two = table([sig('h1', 'time 1'), sig('h2', 'time 2')], { stat_options_by_group: ['n', 'min'] });
  assert.deepEqual(labelsOf(two), ['n', 'Mínimo']);
  assert.equal(two.rows[0]['time 2'], '15');

  // Localised, not hardcoded: the same rows in English must not read the same as in Portuguese.
  const english = table(all, { lang: 'en_us', stat_options_by_group: ['mean_sd', 'median_iqr'] });
  assert.deepEqual(english.rows.map((r) => r[Statz.translate('table.columns.variable', 'en_us')]),
    [Statz.translate('stats.labels.mean_sd', 'en_us'), Statz.translate('stats.labels.median_iqr', 'en_us')]);
  assert.notDeepEqual(labelsOf(table(all, { stat_options_by_group: ['mean_sd', 'median_iqr'] })),
    english.rows.map((r) => r[Statz.translate('table.columns.variable', 'en_us')]));
});


test("the standard deviation is the sample one on every path, displayed and inferential", () => {
  // Statz describes samples, never populations, so the unbiased estimator is the right one wherever
  // a spread is computed. `summarize_n_paired`, the paired t and `summarize_n_n` already divided by
  // n − 1; `getNumericalSummaryByGroup` and the two normality checks divided by n, so the same
  // variable printed a smaller spread when grouped than when paired, and two of the three K-S
  // checks standardised differently from the third.
  const mk = (hash, label, type, values) => {
    const c = Statz.makeColumn(values.map(String), { col_type: type, var_label: label, includeBaseVariant: true });
    c.col_hash = hash; c.col_label = label; return c;
  };
  const sig = (h, l) => JSON.stringify({ database_id: 'dbA', col_hash: h, col_label: l, col_var_index: null });

  // mean 5, sample sd = sqrt(32/7) = 2.138, population sd = sqrt(32/8) = 2 — the two round apart at
  // both the 1 decimal the grouped tables use and the 2 the paired one does.
  const V = [2, 4, 4, 4, 5, 5, 7, 9];
  const W = [10, 11, 12, 13, 14, 15, 16, 17];

  const groups = ['a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'b', 'b', 'b', 'b', 'b', 'b', 'b', 'b'];
  const gCols = [mk('hg', 'Grupo', 'q', groups), mk('hv', 'Valor', 'n', [...V, ...W])];
  const grouped = Statz.runAnalysis([sig('hg', 'Grupo')], [sig('hv', 'Valor')], { dbA: { columns: gCols } },
    Statz.getDefaultAnalysisOptions({ lang: 'pt_br' })).result.analysis[0].table;
  const meanRow = grouped.rows.find((r) => r[grouped.columns[0]] === Statz.translate('stats.labels.mean_sd', 'pt_br'));
  assert.equal(meanRow['a'], '5,0 ± 2,1', 'grouped: sample sd, not the 2,0 the population one gives');

  // The same eight values as a paired moment report the same spread, at that builder's 2 decimals.
  const pCols = [mk('h1', 'antes', 'n', V), mk('h2', 'depois', 'n', W)];
  const paired = Statz.runAnalysis([], [sig('h1', 'antes'), sig('h2', 'depois')], { dbA: { columns: pCols } },
    Statz.getDefaultAnalysisOptions({ lang: 'pt_br' })).result.analysis[0].table;
  assert.equal(paired.rows[0]['antes'], '5,00 ± 2,14', 'paired: the same statistic, unchanged');

  // Inferential side. These ten values sit either side of the 0.05 cut-off depending on the divisor
  // used to standardise them before the normality gate: Lilliefors returns 0.0412 with n and 0.0545
  // with n − 1, so the parametric route is taken only when the sample sd is used. One call site now
  // — `isNormal` — reached here from both directions: as the paired differences and as a marginal.
  const F = [4, 13, -16, -17, -5, 8, 5, 4, 6, -3];
  const A = F.map((_, i) => 100 + i);
  const B = A.map((a, i) => a - F[i]);
  const Y = [2, 4, 5, 7, 8, 9, 11, 12, 14, 16];
  const cols = [mk('ha', 'antes', 'n', A), mk('hb', 'depois', 'n', B), mk('hf', 'X', 'n', F), mk('hy', 'Y', 'n', Y)];
  const db = { dbA: { columns: cols } };
  const opts = Statz.getDefaultAnalysisOptions({ lang: 'pt_br' });
  assert.equal(Statz.runAnalysis([], [sig('ha', 'antes'), sig('hb', 'depois')], db, opts)
    .result.analysis[0].table.test_used, 't pareado');
  assert.equal(Statz.runAnalysis([sig('hf', 'X')], [sig('hy', 'Y')], db, opts)
    .result.analysis[0].table.test_used, Statz.translate('tests.pearson', 'pt_br'));
});


test("quantiles follow R's type 7 on every path, so the same values report one IQR", () => {
  // The grouped tables took their quartiles from `ss.quantileSorted` while the paired one
  // interpolated linearly, and the two disagree: the same six values reported an IQR of 3 grouped
  // and 2.5 paired. Linear interpolation over p × (n − 1) is R's type 7 — the default in R, numpy,
  // pandas and Excel's QUARTILE.INC — so it is the one a user checking our output will hold.
  const mk = (hash, label, type, values) => {
    const c = Statz.makeColumn(values.map(String), { col_type: type, var_label: label, includeBaseVariant: true });
    c.col_hash = hash; c.col_label = label; return c;
  };
  const sig = (h, l) => JSON.stringify({ database_id: 'dbA', col_hash: h, col_label: l, col_var_index: null });
  const A = [1, 2, 3, 4, 5, 6];   // R: median 3.5, q1 2.25, q3 4.75, IQR 2.5
  const B = [10, 11, 12, 13, 14, 15];
  const cols = [mk('hg', 'G', 'q', ['a', 'a', 'a', 'a', 'a', 'a', 'b', 'b', 'b', 'b', 'b', 'b']),
                mk('hv', 'V', 'n', [...A, ...B])];
  const db = { dbA: { columns: cols } };

  // Grouped: 2,5, not the 3,0 `ss.quantileSorted` returns.
  const grouped = Statz.runAnalysis([sig('hg', 'G')], [sig('hv', 'V')], db,
    Statz.getDefaultAnalysisOptions({ lang: 'pt_br', stat_options_by_group: ['median_iqr'] })).result.analysis[0].table;
  assert.equal(grouped.rows[0]['a'], '3,5 ± 2,5');

  // Descriptive reaches the same helper: over all twelve values R gives median 8, q1 3.75, q3 12.25.
  const described = Statz.runAnalysis([sig('hv', 'V')], [], db,
    Statz.getDefaultAnalysisOptions({ lang: 'pt_br', stat_options_numeric: ['median_iqr'] })).result.analysis[0].table;
  assert.equal(described.rows[0]['Descrição'], '8,0 ± 8,5');

  // Paired reports the same statistic for the same values, at that builder's 2 decimals — which is
  // the point of the unification: the number must not depend on which table asked for it.
  const paired = Statz.runAnalysis([], [sig('h1', 'antes'), sig('h2', 'depois')],
    { dbA: { columns: [mk('h1', 'antes', 'n', A), mk('h2', 'depois', 'n', B)] } },
    Statz.getDefaultAnalysisOptions({ lang: 'pt_br', stat_options_by_group: ['median_iqr'] })).result.analysis[0].table;
  assert.equal(paired.rows[0]['antes'], '3,50 ± 2,50');
});


test("summarize_n counts every value it cannot summarise, so n plus missing is the total", () => {
  // The missing branches enumerated blank / whitespace / null / failed-parse by hand — which is
  // `factors.isMissingValue` restated, since none of those parse — and the enumeration had a gap:
  // a raw ±Infinity matched no branch, so it entered neither `n` nor the n_missing row, which then
  // disagreed with the number of values handed in. `summarize_n_q` never had the gap: it counts
  // anything not finite in a single `else`.
  const opts = { lang: 'pt_br', stat_options_numeric: ['n', 'n_missing'] };
  const missingLabel = Statz.translate('stats.labels.n_missing', 'pt_br');
  const read = (values) => {
    const t = Statz.summarize_n(values, null, opts);
    const cell = (label) => t.rows.find((r) => r['Variável'] === label)?.['Descrição'];
    return { n: Number(cell('n') ?? 0), missing: Number(cell(missingLabel) ?? 0) };
  };

  for (const [name, values] of Object.entries({
    blank: ['1', '2', '3', ''],
    whitespace: ['1', '2', '3', '   '],
    null: ['1', '2', '3', null],
    text: ['1', '2', '3', 'N/A'],
    infinityString: ['1', '2', '3', 'Infinity'],
    infinityNumber: [1, 2, 3, Infinity],
    negativeInfinity: [1, 2, 3, -Infinity],
    nan: [1, 2, 3, NaN]
  })) {
    const { n, missing } = read(values);
    assert.equal(n, 3, name);
    assert.equal(missing, 1, `${name}: uncounted`);
    assert.equal(n + missing, values.length, `${name}: n + missing must be the total`);
  }

  // Nothing missing means no n_missing row at all, which is the pre-existing behaviour.
  assert.equal(read(['1', '2', '3']).missing, 0);
});


test("the tests taken from curated libraries keep their contract", () => {
  // Three own implementations were replaced by library calls. Two were adopted for their own sake
  // and had to leave the numbers alone; the third changes them, which is why it was adopted.
  const mk = (hash, label, type, values) => {
    const c = Statz.makeColumn(values.map(String), { col_type: type, var_label: label, includeBaseVariant: true });
    c.col_hash = hash; c.col_label = label; return c;
  };
  const sig = (h, l) => JSON.stringify({ database_id: 'dbA', col_hash: h, col_label: l, col_var_index: null });
  const paired = (D) => {
    const A = D.map((_, i) => 100 + i);
    const B = A.map((a, i) => a - D[i]);
    return Statz.runAnalysis([], [sig('ha', 'antes'), sig('hb', 'depois')],
      { dbA: { columns: [mk('ha', 'antes', 'n', A), mk('hb', 'depois', 'n', B)] } },
      Statz.getDefaultAnalysisOptions({ lang: 'pt_br' })).result.analysis[0].table;
  };

  // Wilcoxon signed-rank: EXACT for small n. The hand-rolled normal approximation returned 0.0117
  // and 0.0051 for these two, anti-conservative in the n range where the test is most used.
  const w1 = paired([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 9.0]);
  assert.equal(w1.test_used, 'Wilcoxon (postos com sinais)');
  assert.equal(w1.p_value.toFixed(4), '0.0078');
  const w2 = paired([0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 20]);
  assert.equal(w2.p_value.toFixed(4), '0.0020');
  // The reported statistic follows the library's convention (W+, R's V), not the old min(W+, W−).
  assert.equal(w1.test_statistic, 36);

  // Paired t: a one-sample t on the differences, so the library computes the same thing. Pinned to
  // the value the hand-rolled mean / (sd / √n) against jStat.studentt.cdf produced.
  const t = paired([1.2, -0.5, 2.1, 0.8, -0.3, 1.9, 0.4, 1.1]);
  assert.equal(t.test_used, 't pareado');
  assert.equal(t.p_value.toFixed(4), '0.0400');
  assert.equal(t.test_statistic.toFixed(4), '2.5173');

  // McNemar exact: stdlib's two-sided rule coincides with min(1, 2 × P(X ≤ k)) at p = 0.5.
  const t1 = ['no', 'no', 'no', 'yes', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no'];
  const t2 = ['yes', 'yes', 'yes', 'yes', 'no', 'yes', 'yes', 'yes', 'no', 'no', 'no', 'yes'];
  const mc = Statz.runAnalysis([], [sig('q1', 't1'), sig('q2', 't2')],
    { dbA: { columns: [mk('q1', 't1', 'q', t1), mk('q2', 't2', 'q', t2)] } },
    Statz.getDefaultAnalysisOptions({ lang: 'pt_br' })).result.analysis[0].table;
  assert.equal(mc.test_used, 'McNemar');
  assert.equal(mc.p_value, 0.0156);

  // Correlation via ss.sampleCorrelation, both branches.
  const N = [3, 7, 8, 5, 12, 14, 21, 13, 18, 11, 9, 16];
  const corr = (X, Y) => Statz.runAnalysis([sig('hx', 'X')], [sig('hy', 'Y')],
    { dbA: { columns: [mk('hx', 'X', 'n', X), mk('hy', 'Y', 'n', Y)] } },
    Statz.getDefaultAnalysisOptions({ lang: 'pt_br' })).result.analysis[0].table;
  assert.equal(corr(N, N.map((v) => (v * 1.9) + (v % 3))).correlation, 0.9962);
  // A constant vector leaves r undefined; `sampleCorrelation` says NaN and the old formula said 0.
  // The 0 is preserved on purpose — NaN would reach a rendered cell.
  assert.equal(corr(N, N.map(() => 5)).correlation, 0);

  // A MISSING library must fail visibly rather than report 0, which would read as "no correlation".
  const saved = Statz.simpleStatistics;
  try {
    Statz.simpleStatistics = null;
    assert.ok(Number.isNaN(corr(N, N.map((v) => v * 1.9)).correlation), 'no library ⇒ NaN, not 0');
  } finally {
    Statz.simpleStatistics = saved;
  }
  assert.equal(corr(N, N.map((v) => (v * 1.9) + (v % 3))).correlation, 0.9962, 'restored');
});


test("stat_options is a direct-call argument, never an analysis option", () => {
  // It was catalogued as a panel option and could not act: the driver defaulted it to a COPY of
  // `stat_options_by_group`, so it sat downstream of the thing it claimed to back up, and every
  // consumer prefers the specific option anyway. The name survives as the parameter of the shared
  // `getNumericalSummaryByGroup`, which `describeColumn` reaches with RAW options — the documented
  // argument that `summarizeElementDatabases` passes — so the fallback itself must keep working.
  assert.ok(!('stat_options' in Statz.getDefaultAnalysisOptions({})), 'not in the normalised bag');
  const offered = Statz.getAvailableOptions(['has_n', 'has_nq', 'has_qn', 'has_ln', 'has_nl', 'has_paired_n'], 'table')
    .map((o) => o.name).filter((n) => n.startsWith('stat_'));
  assert.deepEqual(offered, ['stat_options_numeric', 'stat_options_by_group']);

  // The direct-call path still honours it: same column, two different summaries.
  const col = Statz.makeColumn(['1', '2', '3', '4', '5', '6', '7', '8'],
    { col_type: 'n', var_label: 'V', includeBaseVariant: true });
  col.col_hash = 'hv'; col.col_label = 'V';
  const describe = (opts) => Statz.describeColumn(col, null, { structured: true, lang: 'pt_br', ...opts })[0].summary;
  const chosen = describe({ stat_options: ['median_iqr'] });
  assert.notDeepEqual(chosen, describe({}), 'a direct caller can still choose the statistics');
  assert.deepEqual(chosen, describe({ stat_options_numeric: ['median_iqr'] }),
    'and gets what the specific option would have given');

  // Through runAnalysis it is inert: the specific options are always present and win.
  const mk = (hash, label, type, values) => {
    const c = Statz.makeColumn(values.map(String), { col_type: type, var_label: label, includeBaseVariant: true });
    c.col_hash = hash; c.col_label = label; return c;
  };
  const sig = (h, l) => JSON.stringify({ database_id: 'dbA', col_hash: h, col_label: l, col_var_index: null });
  const cols = [mk('hg', 'G', 'q', ['a', 'a', 'a', 'a', 'b', 'b', 'b', 'b']), mk('hv', 'V', 'n', [1, 2, 3, 4, 5, 6, 7, 8])];
  const rows = (opts) => {
    const t = Statz.runAnalysis([sig('hv', 'V')], [sig('hg', 'G')], { dbA: { columns: cols } },
      Statz.getDefaultAnalysisOptions({ lang: 'pt_br', ...opts })).result.analysis[0].table;
    return t.rows.map((r) => r[t.columns[0]]);
  };
  assert.deepEqual(rows({ stat_options: ['min', 'max', 'n'] }), rows({}), 'shadowed by stat_options_by_group');
});


test("the normality gate reads D against the Lilliefors null, not a fully specified normal", () => {
  // Every route standardised by the sample's own mean and sd and then compared D to N(0,1), which
  // is valid only when those parameters come from outside the data. Estimating them shrinks D, so
  // the p-value came back far too large. Over 2,000 samples per cell the old gate called TRUE
  // normal data normal 100% of the time at every n from 10 to 100 — it should be 95% — and called
  // lognormal data normal 98% of the time at n = 10 and 67% at n = 30.

  // The approximation, against PUBLISHED Lilliefors critical values rather than our own output:
  // at the tabulated D for α = 0.05 it must return something close to 0.05.
  // Three significance levels, so the check constrains the whole curve rather than one point.
  const tabulated = {
    0.10: { 10: 0.239, 15: 0.201, 20: 0.176, 25: 0.159, 30: 0.146 },
    0.05: { 10: 0.258, 15: 0.220, 20: 0.190, 25: 0.173, 30: 0.161 },
    0.01: { 10: 0.294, 15: 0.257, 20: 0.231, 25: 0.200, 30: 0.187 }
  };
  for (const [level, rows] of Object.entries(tabulated)) {
    for (const [n, D] of Object.entries(rows)) {
      const p = Statz.lillieforsPValue(D, Number(n));
      assert.ok(Math.abs(p - Number(level)) <= 0.007,
        `n=${n} at α=${level}: expected ~${level}, got ${p.toFixed(4)}`);
    }
  }
  // Below n = 10 the published table is coarser and the approximation is looser with it.
  for (const [n, D] of Object.entries({ 4: 0.381, 5: 0.337, 6: 0.319, 7: 0.300, 8: 0.285, 9: 0.271 })) {
    const p = Statz.lillieforsPValue(D, Number(n));
    assert.ok(Math.abs(p - 0.05) <= 0.013, `n=${n}: expected ~0.05, got ${p.toFixed(4)}`);
  }
  // Above 30 the tabulated value is the asymptotic 0.886/√n.
  for (const n of [40, 60, 100]) {
    const p = Statz.lillieforsPValue(0.886 / Math.sqrt(n), n);
    assert.ok(Math.abs(p - 0.05) <= 0.007, `n=${n}: got ${p.toFixed(4)}`);
  }
  // Monotone in D, and bounded: a bigger departure is never a bigger p-value.
  assert.ok(Statz.lillieforsPValue(0.30, 20) < Statz.lillieforsPValue(0.15, 20));
  assert.equal(Statz.lillieforsPValue(0, 20), 1, 'a degenerate D must not leak NaN');
  assert.equal(Statz.lillieforsPValue(NaN, 20), 1);

  // The gate's boundaries. Below three values there is no parametric test worth routing to; at
  // exactly three normality cannot be assessed and the answer is "no evidence against it", which
  // is what keeps a lab triplicate on ANOVA; a constant sample is degenerate at any n.
  assert.equal(Statz.isNormal([1, 2]), false);
  assert.equal(Statz.isNormal([1, 2, 3]), true);
  assert.equal(Statz.isNormal([7, 7, 7]), false);
  assert.equal(Statz.isNormal([7, 7, 7, 7, 7, 7]), false);

  // End to end, the gain that motivated the change: this sample is lognormal, and the old gate
  // accepted it as normal (K-S p = 0.0987) where Lilliefors rejects it outright.
  const LOGN = [2.89, 0.45, 0.66, 2.05, 1.53, 1.26, 0.32, 0.45, 0.26, 0.53, 2.36, 2.11, 0.58, 0.56,
                0.79, 0.5, 0.32, 1.14, 0.38, 1.62, 2.67, 2.54, 8.07, 0.97, 1.33, 0.57, 3.06, 1.41, 0.64, 1.09];
  assert.equal(Statz.isNormal(LOGN), false, 'skewed data must not pass');
  const mk = (hash, label, values) => {
    const c = Statz.makeColumn(values.map(String), { col_type: 'n', var_label: label, includeBaseVariant: true });
    c.col_hash = hash; c.col_label = label; return c;
  };
  const sig = (h, l) => JSON.stringify({ database_id: 'dbA', col_hash: h, col_label: l, col_var_index: null });
  const straight = LOGN.map((_, i) => i + 1);
  const table = Statz.runAnalysis([sig('hx', 'X')], [sig('hy', 'Y')],
    { dbA: { columns: [mk('hx', 'X', LOGN), mk('hy', 'Y', straight)] } },
    Statz.getDefaultAnalysisOptions({ lang: 'pt_br' })).result.analysis[0].table;
  assert.equal(table.test_used, Statz.translate('tests.spearman', 'pt_br'),
    'a skewed marginal routes to the rank correlation');

  // And it is not simply stricter about everything: a well-behaved sample still routes parametric.
  const CLEAN = [-1.64, -1.28, -1.04, -0.84, -0.67, -0.52, -0.39, -0.25, -0.13, 0,
                 0.13, 0.25, 0.39, 0.52, 0.67, 0.84, 1.04, 1.28, 1.64, 0.3];
  assert.equal(Statz.isNormal(CLEAN), true);
});
