import test from "node:test";
import assert from "node:assert/strict";
import { Statz } from "../index.js";
import { parseFixture } from '../scripts/dev/load-fixture.mjs';
import statistics from '@stdlib/stats';
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
  // 2x2: [[4,2],[1,5]] → OR = (4*5)/(2*1) = 10
  const result = Statz.summarize_q_q(predictor, response);

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
  const result = Statz.summarize_q_q(predictor, response);
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
    { lang: 'en_us' },
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

test("runAnalysis: multi-DB Profile C with missing response → warning + skip analysis", () => {
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
  assert.equal(flags.includes('has_multi_db_broadcast'), false);
  // One warning entry instead of analyses
  assert.equal(result.analysis.length, 1);
  assert.ok(result.analysis[0].table.warning);
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

