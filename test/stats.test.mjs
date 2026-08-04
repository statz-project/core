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

  const expected = {
    test: Statz.translate('tests.anova'),
    p: '0.717',
    posthoc: null
  };

  assert.equal((result.test_used), expected.test)
  assert.equal((result.p_value).toFixed(3), expected.p)
  assert.equal((result.posthoc), expected.posthoc)
    
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
