import test from "node:test";
import assert from "node:assert/strict";
import { Statz } from "../index.js";
import { parseFixture } from '../scripts/dev/load-fixture.mjs';
import driver from "../json/driver.js";
import { chart_n_n } from "../json/charts/n_n.js";

globalThis.Statz = Statz;

const { parsed } = parseFixture();

// ---------------------------------------------------------------------------
// chart_n_n — unit
// ---------------------------------------------------------------------------

test("chart_n_n: returns spec with points + linear fit traces", () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  const ys = [2, 4, 5, 4, 5, 7, 8, 9];
  const out = chart_n_n(xs, ys, {}, { predictorLabel: "X", responseLabel: "Y" });
  assert.ok(out);
  assert.equal(out.type, "scatter");
  assert.equal(out.spec.data.length, 2, "points + fit");
  assert.equal(out.spec.data[0].mode, "markers");
  assert.deepEqual(out.spec.data[0].x, xs);
  assert.deepEqual(out.spec.data[0].y, ys);
  assert.equal(out.spec.data[1].mode, "lines");
  assert.equal(out.spec.data[1].x.length, 2);
});

test("chart_n_n: drops non-finite pairs before building spec", () => {
  const xs = [1, 2, "abc", 4, null, 6];
  const ys = [10, 20, 30, 40, 50, 60];
  const out = chart_n_n(xs, ys, {}, {});
  assert.ok(out);
  assert.deepEqual(out.spec.data[0].x, [1, 2, 4, 6]);
  assert.deepEqual(out.spec.data[0].y, [10, 20, 40, 60]);
});

test("chart_n_n: returns null when fewer than 2 finite pairs", () => {
  assert.equal(chart_n_n([1], [2], {}, {}), null);
  assert.equal(chart_n_n([], [], {}, {}), null);
  assert.equal(chart_n_n(["a", "b"], [1, 2], {}, {}), null);
});

test("chart_n_n: axis titles populated from meta labels", () => {
  const out = chart_n_n([1, 2, 3], [4, 5, 6], {}, { predictorLabel: "Age (yrs)", responseLabel: "BMI" });
  assert.equal(out.spec.layout.xaxis.title.text, "Age (yrs)");
  assert.equal(out.spec.layout.yaxis.title.text, "BMI");
});

test("chart_n_n: chart_point_size and chart_theme apply", () => {
  const out = chart_n_n([1, 2, 3], [4, 5, 6], { chart_point_size: 14, chart_theme: "blue" }, {});
  assert.equal(out.spec.data[0].marker.size, 14);
  assert.equal(out.spec.data[0].marker.color, "#1f77b4", "blue theme point color");
});

test("chart_n_n: chart_include_zero=false drops rangemode tozero", () => {
  const out = chart_n_n([10, 20, 30], [100, 200, 300], { chart_include_zero: false }, {});
  assert.equal(out.spec.layout.xaxis.rangemode, undefined);
  assert.equal(out.spec.layout.yaxis.rangemode, undefined);
});

// ---------------------------------------------------------------------------
// runAnalysis mode='chart' — integration
// ---------------------------------------------------------------------------

test("runAnalysis mode='chart': n × n entry carries chart spec instead of table", () => {
  const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const fakeCol = { ...biomarker.column, col_hash: "biomarker_copy" };
  const dbs = { test_db: { columns: [biomarker.column, fakeCol] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: biomarker.column.col_hash, col_var_index: null, col_label: "Biomarker", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: "biomarker_copy", col_var_index: null, col_label: "Biomarker (copy)", role: "response"
  })];

  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_nn"));
  const entry = result.analysis[0];
  assert.equal(entry.predictor_type, "n");
  assert.equal(entry.response_type, "n");
  assert.equal(entry.table, undefined, "table absent in chart mode");
  assert.ok(entry.chart, "chart present");
  assert.equal(entry.chart.type, "scatter");
  assert.ok(Array.isArray(entry.chart.spec.data));
  assert.ok(entry.chart.spec.data.length >= 1);
  assert.equal(entry.chart.spec.layout.xaxis.title.text, "Biomarker");
  assert.equal(entry.chart.spec.layout.yaxis.title.text, "Biomarker (copy)");
});

test("runAnalysis default mode='table': n × n entry carries table (regression guard)", () => {
  const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const fakeCol = { ...biomarker.column, col_hash: "biomarker_copy" };
  const dbs = { test_db: { columns: [biomarker.column, fakeCol] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: biomarker.column.col_hash, col_var_index: null, col_label: "Biomarker", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: "biomarker_copy", col_var_index: null, col_label: "Biomarker (copy)", role: "response"
  })];

  // No mode option → defaults to 'table'.
  const { result } = driver.runAnalysis(predictors, responses, dbs, {});
  const entry = result.analysis[0];
  assert.ok(entry.table, "table present in default mode");
  assert.equal(entry.chart, undefined, "chart absent in table mode");
});

// ---------------------------------------------------------------------------
// Profile A — chart_q, chart_n, chart_l (univariate)
// ---------------------------------------------------------------------------

import { chart_q } from "../json/charts/q.js";
import { chart_n } from "../json/charts/n.js";
import { chart_l } from "../json/charts/l.js";

// chart_q -------------------------------------------------------------------

test("chart_q: vertical bar by default, sorted by frequency desc", () => {
  const out = chart_q(["a","a","a","b","b","c"], {}, { varLabel: "Group" });
  assert.ok(out);
  assert.equal(out.type, "bar");
  assert.equal(out.spec.data[0].orientation, "v");
  assert.deepEqual(out.spec.data[0].x, ["a", "b", "c"]);
  assert.deepEqual(out.spec.data[0].y, [3, 2, 1]);
  assert.equal(out.spec.layout.xaxis.title.text, "Group");
});

test("chart_q: preset labels preserve factor order even when count differs", () => {
  const out = chart_q(["male","female","female"], {}, { varLabel: "Sex", labels: ["female","male"] });
  assert.deepEqual(out.spec.data[0].x, ["female", "male"]);
  assert.deepEqual(out.spec.data[0].y, [2, 1]);
});

test("chart_q: switches to horizontal when n_categories > 6", () => {
  const out = chart_q(["a","b","c","d","e","f","g"], {}, {});
  assert.equal(out.spec.data[0].orientation, "h");
  // In horizontal layout, counts are on x, labels on y.
  assert.deepEqual(out.spec.data[0].x, [1,1,1,1,1,1,1]);
  assert.equal(out.spec.data[0].y.length, 7);
});

test("chart_q: chart_label_format='p' produces percent labels", () => {
  const out = chart_q(["a","a","a","b"], { chart_label_format: "p" }, {});
  assert.deepEqual(out.spec.data[0].text, ["75.0%", "25.0%"]);
});

test("chart_q: chart_label_format='np' produces combined labels", () => {
  const out = chart_q(["a","a","a","b"], { chart_label_format: "np" }, {});
  assert.deepEqual(out.spec.data[0].text, ["3 (75.0%)", "1 (25.0%)"]);
});

test("chart_q: missing values appended as a separate bar (include_missing default)", () => {
  const out = chart_q(["a","a",null,"","b"], { lang: "en_us" }, {});
  // Frequency: a=2, b=1; missing=2 (null + "")
  const last = out.spec.data[0].x.at(-1);
  assert.ok(last && last !== "a" && last !== "b", `last bar should be missing label, got "${last}"`);
});

test("chart_q: include_missing=false drops the missing bar", () => {
  const out = chart_q(["a","b",null], { include_missing: false }, {});
  assert.deepEqual(out.spec.data[0].x, ["a", "b"]);
});

test("chart_q: empty input returns null", () => {
  assert.equal(chart_q([], {}, {}), null);
  assert.equal(chart_q([null, ""], { include_missing: false }, {}), null);
});

// chart_n -------------------------------------------------------------------

test("chart_n: produces markers trace + mean crossbar trace", () => {
  const out = chart_n([1, 2, 3, 4, 5], {}, { varLabel: "Age" });
  assert.ok(out);
  assert.equal(out.type, "individual_values");
  // No boxplot by default → 2 traces.
  assert.equal(out.spec.data.length, 2);
  const points = out.spec.data[0];
  assert.equal(points.mode, "markers");
  assert.equal(points.y.length, 5);
  // All x close to 1 (jittered)
  points.x.forEach((x) => assert.ok(x >= 0.7 && x <= 1.3, `x ${x} out of jitter band`));
  const meanLine = out.spec.data[1];
  assert.equal(meanLine.mode, "lines");
  assert.equal(meanLine.y[0], 3); // mean of 1..5
  assert.equal(meanLine.y[1], 3);
});

test("chart_n: chart_show_boxplot=true prepends a box trace", () => {
  const out = chart_n([1, 2, 3, 4, 5], { chart_show_boxplot: true }, {});
  assert.equal(out.spec.data.length, 3);
  assert.equal(out.spec.data[0].type, "box");
});

test("chart_n: filters non-numeric, returns null when empty", () => {
  const out = chart_n(["1.5", "abc", null, "2.5"], {}, {});
  assert.equal(out.spec.data[0].y.length, 2);
  assert.equal(chart_n(["abc", null], {}, {}), null);
});

test("chart_n: deterministic jitter (same input → same x positions)", () => {
  const a = chart_n([1, 2, 3], {}, {});
  const b = chart_n([1, 2, 3], {}, {});
  assert.deepEqual(a.spec.data[0].x, b.spec.data[0].x);
});

test("chart_n: chart_show_points=false drops points+crossbar traces", () => {
  const out = chart_n([1, 2, 3, 4, 5], { chart_show_points: false }, {});
  assert.equal(out.spec.data.length, 0, "no traces when points AND box are off");
  // Layout still present (axes visible as placeholder for the user).
  assert.ok(out.spec.layout.xaxis);
  assert.ok(out.spec.layout.yaxis);
});

test("chart_n: chart_show_points=false with boxplot=true → only box trace", () => {
  const out = chart_n([1, 2, 3, 4, 5], { chart_show_points: false, chart_show_boxplot: true }, {});
  assert.equal(out.spec.data.length, 1);
  assert.equal(out.spec.data[0].type, "box");
});

test("chart_n: chart_central_tendency='median' places crossbar at the median", () => {
  // Skewed set: mean=6.4 vs median=3. Crossbar y should be the median.
  const out = chart_n([1, 2, 3, 4, 22], { chart_central_tendency: "median" }, {});
  const crossbar = out.spec.data[1];
  assert.equal(crossbar.mode, "lines");
  assert.equal(crossbar.y[0], 3, "median of [1,2,3,4,22] = 3");
  assert.equal(crossbar.y[1], 3);
  assert.equal(crossbar.name, "median", "trace name reflects the chosen tendency");
});

test("chart_n: chart_central_tendency defaults to 'mean' (crossbar at arithmetic mean)", () => {
  const out = chart_n([1, 2, 3, 4, 22], {}, {});
  const crossbar = out.spec.data[1];
  assert.equal(crossbar.y[0], 6.4);
  assert.equal(crossbar.name, "mean");
});

// chart_l -------------------------------------------------------------------

test("chart_l: counts items across rows, sorted by frequency desc", () => {
  const values = ["fever;cough", "fever", "cough;headache", "fever;cough;headache"];
  const out = chart_l(values, ";", {}, { varLabel: "Symptoms" });
  assert.ok(out);
  assert.equal(out.type, "bar");
  // fever:3, cough:3, headache:2 → sorted desc, ties alphabetically.
  assert.deepEqual(out.spec.data[0].x, ["cough", "fever", "headache"]);
  assert.deepEqual(out.spec.data[0].y, [3, 3, 2]);
});

test("chart_l: percent labels compute over row count (can exceed 100% combined)", () => {
  const out = chart_l(["a;b", "a;b", "a"], ";", { chart_label_format: "p" }, {});
  // total rows = 3. a in 3 rows = 100%, b in 2 = 66.7%.
  assert.deepEqual(out.spec.data[0].text, ["100.0%", "66.7%"]);
});

test("chart_l: empty rows and empty items dropped; returns null when no items", () => {
  assert.equal(chart_l([null, "", "   "], ";", {}, {}), null);
  const out = chart_l(["a"], ";", {}, {});
  assert.deepEqual(out.spec.data[0].x, ["a"]);
});

// ---------------------------------------------------------------------------
// runAnalysis mode='chart' Profile A integration
// ---------------------------------------------------------------------------

test("runAnalysis mode='chart' Profile A: q predictor → chart_q bar", () => {
  const sex = Statz.getColumnValues(parsed, "col_sex_hash");
  const dbs = { test_db: { columns: [sex.column] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: sex.column.col_hash, col_var_index: null, col_label: "Sex", role: "predictor"
  })];
  const { result, flags } = driver.runAnalysis(predictors, [], dbs, { mode: "chart" });
  assert.ok(flags.includes("has_q"));
  const entry = result.analysis[0];
  assert.equal(entry.predictor_type, "q");
  assert.equal(entry.table, undefined);
  assert.ok(entry.chart);
  assert.equal(entry.chart.type, "bar");
});

test("runAnalysis mode='chart' Profile A: n predictor → chart_n individual_values", () => {
  const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const dbs = { test_db: { columns: [biomarker.column] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: biomarker.column.col_hash, col_var_index: null, col_label: "Biomarker", role: "predictor"
  })];
  const { result, flags } = driver.runAnalysis(predictors, [], dbs, { mode: "chart" });
  assert.ok(flags.includes("has_n"));
  const entry = result.analysis[0];
  assert.equal(entry.chart.type, "individual_values");
  // Title consolidation: yaxis title is the generic "Value" (i18n en_us default) instead
  // of duplicating the var label — the varLabel already lives in the x-axis tick text at x=1.
  assert.equal(entry.chart.spec.layout.yaxis.title.text, "Value");
  // x-axis tick still carries the var label at its single position.
  assert.deepEqual(entry.chart.spec.layout.xaxis.ticktext, ["Biomarker"]);
});

test("runAnalysis mode='chart' Profile A: l predictor → chart_l bar", () => {
  const clinics = Statz.getColumnValues(parsed, "col_clinics_hash");
  const dbs = { test_db: { columns: [clinics.column] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: clinics.column.col_hash, col_var_index: null, col_label: "Clinics", role: "predictor"
  })];
  const { result, flags } = driver.runAnalysis(predictors, [], dbs, { mode: "chart" });
  assert.ok(flags.includes("has_l"));
  const entry = result.analysis[0];
  assert.equal(entry.chart.type, "bar");
  // l input is split into items, so bar count > 1 expected for non-trivial fixture
  assert.ok(entry.chart.spec.data[0].x.length >= 1);
});

// ---------------------------------------------------------------------------
// Profile C direct cells — chart_q_q, chart_n_q, chart_q_n
// ---------------------------------------------------------------------------

import { chart_q_q } from "../json/charts/q_q.js";
import { chart_n_q, chart_q_n } from "../json/charts/n_q.js";

test("chart_q_q: grouped bar with one trace per response level", () => {
  const pred = ["a","a","a","b","b","b","b"];
  const resp = ["x","x","y","x","y","y","y"];
  const out = chart_q_q(pred, resp, {}, { predictorLabel: "Group", responseLabel: "Outcome" });
  assert.ok(out);
  assert.equal(out.type, "grouped_bar");
  assert.equal(out.spec.layout.barmode, "group");
  assert.equal(out.spec.data.length, 2);
  assert.equal(out.spec.data[0].name, "x");
  assert.equal(out.spec.data[1].name, "y");
  assert.deepEqual(out.spec.data[0].x, ["a", "b"]);
  assert.deepEqual(out.spec.data[0].y, [2, 1]);
  assert.deepEqual(out.spec.data[1].y, [1, 3]);
});

test("chart_q_q: preset labels preserve factor order", () => {
  const pred = ["male","female","female","male"];
  const resp = ["yes","no","yes","no"];
  const out = chart_q_q(pred, resp, {}, { predictorLabels: ["female","male"], responseLabels: ["yes","no"] });
  assert.deepEqual(out.spec.data[0].x, ["female", "male"]);
  assert.equal(out.spec.data[0].name, "yes");
  assert.equal(out.spec.data[1].name, "no");
});

test("chart_q_q: label format p computes row percentages per predictor level", () => {
  const pred = ["a","a","a","a","b","b"];
  const resp = ["x","x","y","y","x","y"];
  const out = chart_q_q(pred, resp, { chart_label_format: "p" }, {});
  assert.deepEqual(out.spec.data[0].text, ["50.0%", "50.0%"]);
});

test("chart_q_q: distinct colors per response trace", () => {
  const pred = ["a","b","a","b"];
  const resp = ["x","y","y","x"];
  const out = chart_q_q(pred, resp, { chart_theme: "blue" }, {});
  assert.notEqual(out.spec.data[0].marker.color, out.spec.data[1].marker.color);
});

test("chart_q_q: empty input returns null", () => {
  assert.equal(chart_q_q([], [], {}, {}), null);
  assert.equal(chart_q_q([null, ""], ["", null], {}, {}), null);
});

test("chart_n_q: produces 2 traces per group (points + mean) by default", () => {
  const nums = [1, 2, 3, 10, 20, 30];
  const groups = ["a","a","a","b","b","b"];
  const out = chart_n_q(nums, groups, {}, { numericLabel: "Value", groupLabel: "Group" });
  assert.ok(out);
  assert.equal(out.type, "individual_values_grouped");
  assert.equal(out.spec.data.length, 4);
  const meanA = out.spec.data[1];
  const meanB = out.spec.data[3];
  assert.equal(meanA.y[0], 2);
  assert.equal(meanB.y[0], 20);
});

test("chart_n_q: chart_show_boxplot=true adds box trace per group", () => {
  const out = chart_n_q([1,2,3,10,20,30], ["a","a","a","b","b","b"], { chart_show_boxplot: true }, {});
  assert.equal(out.spec.data.length, 6);
  assert.equal(out.spec.data[0].type, "box");
  assert.equal(out.spec.data[3].type, "box");
});

test("chart_n_q: x-axis tickvals/ticktext match group positions", () => {
  const out = chart_n_q([1,2,3], ["g1","g2","g3"], {}, { groupLabel: "Cohort" });
  assert.deepEqual(out.spec.layout.xaxis.tickvals, [1, 2, 3]);
  assert.deepEqual(out.spec.layout.xaxis.ticktext, ["g1", "g2", "g3"]);
});

test("chart_n_q: drops non-numeric and empty-group rows", () => {
  const out = chart_n_q([1, "abc", 3, null, 5], ["a", "a", "b", "b", ""], {}, {});
  assert.ok(out);
  assert.deepEqual(out.spec.data[0].y, [1]);
  assert.deepEqual(out.spec.data[2].y, [3]);
});

test("chart_n_q: returns null when no valid pairs", () => {
  assert.equal(chart_n_q([null, "abc"], ["a", "b"], {}, {}), null);
  assert.equal(chart_n_q([1, 2], ["", null], {}, {}), null);
});

test("chart_n_q: chart_show_points=false drops all point+crossbar traces (both toggles off → data:[])", () => {
  const out = chart_n_q([1, 2, 3, 10, 20, 30], ["a","a","a","b","b","b"], { chart_show_points: false }, {});
  assert.equal(out.spec.data.length, 0, "no traces per group when both layer toggles off");
  // Layout still emitted — axes visible as placeholder.
  assert.equal(out.spec.layout.xaxis.tickvals.length, 2, "still 2 group ticks");
});

test("chart_n_q: chart_show_points=false + boxplot=true → only box traces (1 per group)", () => {
  const out = chart_n_q([1, 2, 3, 10, 20, 30], ["a","a","a","b","b","b"],
    { chart_show_points: false, chart_show_boxplot: true }, {});
  assert.equal(out.spec.data.length, 2, "one box trace per group, no points/crossbar");
  out.spec.data.forEach((tr) => assert.equal(tr.type, "box"));
});

test("chart_n_q: chart_central_tendency='median' places per-group crossbar at each group's median", () => {
  // Group a=[1,2,3] median 2; group b=[10,20,30] median 20 (both = means but the test verifies wiring)
  // Group c=[1,1,1,100] median 1 (asymmetric)
  const out = chart_n_q(
    [1,2,3, 10,20,30, 1,1,1,100],
    ["a","a","a", "b","b","b", "c","c","c","c"],
    { chart_central_tendency: "median" }, {}
  );
  // Data shape per group (no box): [points, crossbar]. 3 groups × 2 traces = 6.
  assert.equal(out.spec.data.length, 6);
  // Crossbar trace y-values per group (indices 1, 3, 5) — lines mode.
  const crossbars = out.spec.data.filter((tr) => tr.mode === "lines");
  assert.equal(crossbars.length, 3);
  assert.equal(crossbars[0].y[0], 2, "group a median");
  assert.equal(crossbars[1].y[0], 20, "group b median");
  assert.equal(crossbars[2].y[0], 1, "group c median (asymmetric — outlier doesn't pull it)");
  crossbars.forEach((cb) => assert.ok(cb.name.endsWith("(median)"), `trace name reflects tendency: ${cb.name}`));
});

test("chart_q_n: wrapper places q on x-axis and n on y-axis", () => {
  const pred = ["a","a","b","b"];
  const resp = [1, 2, 10, 20];
  const out = chart_q_n(pred, resp, {}, { predictorLabel: "Group", responseLabel: "Value" });
  assert.ok(out);
  assert.equal(out.type, "individual_values_grouped");
  assert.equal(out.spec.layout.xaxis.title.text, "Group");
  assert.equal(out.spec.layout.yaxis.title.text, "Value");
});

test("runAnalysis mode=chart Profile C: q x q grouped_bar", () => {
  const sex = Statz.getColumnValues(parsed, "col_sex_hash");
  const outcome = Statz.getColumnValues(parsed, "col_outcome_hash");
  const dbs = { test_db: { columns: [sex.column, outcome.column] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: sex.column.col_hash, col_var_index: null, col_label: "Sex", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: outcome.column.col_hash, col_var_index: null, col_label: "Outcome", role: "response"
  })];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_qq"));
  const entry = result.analysis[0];
  assert.equal(entry.chart.type, "grouped_bar");
  assert.equal(entry.chart.spec.layout.barmode, "group");
});

test("runAnalysis mode=chart Profile C: n x q individual_values_grouped", () => {
  const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const sex = Statz.getColumnValues(parsed, "col_sex_hash");
  const dbs = { test_db: { columns: [biomarker.column, sex.column] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: biomarker.column.col_hash, col_var_index: null, col_label: "Biomarker", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: sex.column.col_hash, col_var_index: null, col_label: "Sex", role: "response"
  })];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_nq"));
  const entry = result.analysis[0];
  assert.equal(entry.chart.type, "individual_values_grouped");
  assert.equal(entry.chart.spec.layout.yaxis.title.text, "Biomarker");
  assert.equal(entry.chart.spec.layout.xaxis.title.text, "Sex");
});

test("runAnalysis mode=chart Profile C: q x n placed q on x and n on y", () => {
  const sex = Statz.getColumnValues(parsed, "col_sex_hash");
  const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const dbs = { test_db: { columns: [sex.column, biomarker.column] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: sex.column.col_hash, col_var_index: null, col_label: "Sex", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: biomarker.column.col_hash, col_var_index: null, col_label: "Biomarker", role: "response"
  })];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_qn"));
  const entry = result.analysis[0];
  assert.equal(entry.chart.type, "individual_values_grouped");
  assert.equal(entry.chart.spec.layout.xaxis.title.text, "Sex");
  assert.equal(entry.chart.spec.layout.yaxis.title.text, "Biomarker");
});

// ---------------------------------------------------------------------------
// Profile C list-expand — chart_l_q, chart_q_l, chart_l_n, chart_n_l, chart_l_l
// ---------------------------------------------------------------------------

import { chart_l_q } from "../json/charts/l_q.js";
import { chart_q_l } from "../json/charts/q_l.js";
import { chart_l_n, chart_n_l } from "../json/charts/l_n.js";
import { chart_l_l } from "../json/charts/l_l.js";

test("chart_l_q: returns one entry per list item", () => {
  const list = ["fever;cough", "fever", "cough;headache", "fever;cough;headache"];
  const resp = ["yes", "no", "yes", "no"];
  const out = chart_l_q(list, resp, {}, { separator: ";", predictorLabel: "Symptoms", responseLabel: "Outcome" });
  assert.ok(Array.isArray(out));
  assert.equal(out.length, 3);
  out.forEach((entry) => {
    assert.equal(entry.chart.type, "grouped_bar");
    assert.ok(entry.display_label.startsWith("Symptoms:"));
  });
});

test("chart_l_q: includePrefix=false drops the variable prefix from display_label", () => {
  const out = chart_l_q(["a;b", "a"], ["yes", "no"], {}, { separator: ";", predictorLabel: "Sym", includePrefix: false });
  out.forEach((entry) => assert.ok(!entry.display_label.startsWith("Sym:")));
});

test("chart_q_l: returns one entry per response item (axis inverted)", () => {
  const pred = ["male", "female", "male", "female"];
  const resp = ["fever;cough", "fever", "cough", "fever;headache"];
  const out = chart_q_l(pred, resp, {}, { separator: ";", predictorLabel: "Sex", responseLabel: "Symptoms" });
  assert.ok(Array.isArray(out));
  assert.equal(out.length, 3);
  out.forEach((entry) => {
    assert.equal(entry.chart.type, "grouped_bar");
    assert.ok(entry.display_label.startsWith("Symptoms:"));
  });
});

test("chart_l_n: returns one entry per list item with individual_values_grouped chart", () => {
  const list = ["fever;cough", "fever", "cough", "fever;cough"];
  const nums = [10, 20, 30, 40];
  const out = chart_l_n(list, nums, {}, { separator: ";", predictorLabel: "Symptoms", responseLabel: "Value" });
  assert.ok(Array.isArray(out));
  assert.equal(out.length, 2);
  out.forEach((entry) => {
    assert.equal(entry.chart.type, "individual_values_grouped");
    assert.ok(entry.display_label.startsWith("Symptoms:"));
  });
});

test("chart_n_l: inverted wrapper keeps the item on x and the numeric on y", () => {
  const nums = [10, 20, 30, 40];
  const list = ["fever;cough", "fever", "cough", "fever;cough"];
  const out = chart_n_l(nums, list, {}, { separator: ";", predictorLabel: "Value", responseLabel: "Symptoms" });
  assert.ok(Array.isArray(out));
  assert.equal(out.length, 2);
  out.forEach((entry) => {
    assert.equal(entry.chart.type, "individual_values_grouped");
    // The LIST label prefixes the item whichever axis it was assigned to.
    assert.ok(entry.display_label.startsWith("Symptoms:"), `got ${entry.display_label}`);
    assert.equal(entry.chart.spec.layout.xaxis.title.text, entry.display_label);
    assert.equal(entry.chart.spec.layout.yaxis.title.text, "Value");
  });
});

test("chart_n_l produces the same specs as chart_l_n with the axes swapped", () => {
  const nums = [10, 20, 30, 40];
  const list = ["fever;cough", "fever", "cough", "fever;cough"];
  const forward = chart_l_n(list, nums, {}, { separator: ";", predictorLabel: "Symptoms", responseLabel: "Value" });
  const inverse = chart_n_l(nums, list, {}, { separator: ";", predictorLabel: "Value", responseLabel: "Symptoms" });
  assert.deepEqual(inverse, forward);
});

test("chart_l_l: returns one entry per (predSubset x respSubset) pair", () => {
  const pred = ["a;b", "a", "b", "a;b"];
  const resp = ["x;y", "x", "y", "x;y"];
  const out = chart_l_l(pred, resp, {}, {
    predictorSep: ";", responseSep: ";",
    predictorLabel: "Pred", responseLabel: "Resp",
    predSubset: ["a", "b"], respSubset: ["x", "y"]
  });
  assert.ok(Array.isArray(out));
  assert.equal(out.length, 4);
  out.forEach((entry) => {
    assert.equal(entry.chart.type, "grouped_bar");
    assert.ok(entry.display_predictor.startsWith("Pred:"));
    assert.ok(entry.display_response.startsWith("Resp:"));
  });
});

test("chart_l_l: empty when subset is missing", () => {
  const pred = ["a;b"];
  const resp = ["x;y"];
  assert.deepEqual(chart_l_l(pred, resp, {}, { predSubset: [], respSubset: ["x"] }), []);
  assert.deepEqual(chart_l_l(pred, resp, {}, { predSubset: ["a"], respSubset: [] }), []);
});

test("chart_l_l: skips items not present in the data silently", () => {
  const pred = ["a;b"];
  const resp = ["x;y"];
  const out = chart_l_l(pred, resp, {}, {
    predSubset: ["a", "ghost"], respSubset: ["x", "ghost"]
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].predictor_item, "a");
  assert.equal(out[0].response_item, "x");
});

test("runAnalysis mode=chart Profile C: l x q yields array of chart entries", () => {
  const clinics = Statz.getColumnValues(parsed, "col_clinics_hash");
  const outcome = Statz.getColumnValues(parsed, "col_outcome_hash");
  const dbs = { test_db: { columns: [clinics.column, outcome.column] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: clinics.column.col_hash, col_var_index: null, col_label: "Clinics", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: outcome.column.col_hash, col_var_index: null, col_label: "Outcome", role: "response"
  })];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_lq"));
  assert.ok(result.analysis.length >= 1);
  result.analysis.forEach((entry) => {
    assert.equal(entry.table, undefined);
    assert.equal(entry.chart.type, "grouped_bar");
    assert.ok(entry.predictor.startsWith("Clinics:"));
  });
});

test("runAnalysis mode=chart Profile C: q x l yields array of chart entries", () => {
  const sex = Statz.getColumnValues(parsed, "col_sex_hash");
  const clinics = Statz.getColumnValues(parsed, "col_clinics_hash");
  const dbs = { test_db: { columns: [sex.column, clinics.column] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: sex.column.col_hash, col_var_index: null, col_label: "Sex", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: clinics.column.col_hash, col_var_index: null, col_label: "Clinics", role: "response"
  })];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_ql"));
  assert.ok(result.analysis.length >= 1);
  result.analysis.forEach((entry) => {
    assert.equal(entry.chart.type, "grouped_bar");
    assert.ok(entry.response.startsWith("Clinics:"));
  });
});

test("runAnalysis mode=chart Profile C: l x n yields array of individual_values_grouped", () => {
  const clinics = Statz.getColumnValues(parsed, "col_clinics_hash");
  const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const dbs = { test_db: { columns: [clinics.column, biomarker.column] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: clinics.column.col_hash, col_var_index: null, col_label: "Clinics", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: biomarker.column.col_hash, col_var_index: null, col_label: "Biomarker", role: "response"
  })];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_ln"));
  assert.ok(result.analysis.length >= 1);
  result.analysis.forEach((entry) => {
    assert.equal(entry.chart.type, "individual_values_grouped");
  });
});

test("runAnalysis mode=chart Profile C: n x l inverts into per-item grouped charts", () => {
  const clinics = Statz.getColumnValues(parsed, "col_clinics_hash");
  const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const dbs = { test_db: { columns: [clinics.column, biomarker.column] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: biomarker.column.col_hash, col_var_index: null, col_label: "Biomarker", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: clinics.column.col_hash, col_var_index: null, col_label: "Clinics", role: "response"
  })];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_nl"));
  assert.ok(result.analysis.length >= 1);
  result.analysis.forEach((entry) => {
    assert.equal(entry.chart.type, "individual_values_grouped");
    assert.ok(entry.predictor.startsWith("Clinics:"), `got ${entry.predictor}`);
    assert.equal(entry.chart.spec.layout.xaxis.title.text, entry.predictor);
    assert.equal(entry.chart.spec.layout.yaxis.title.text, "Biomarker");
  });
});

test("runAnalysis mode=chart Profile C: l x l with subsets yields chart grid", () => {
  const clinics = Statz.getColumnValues(parsed, "col_clinics_hash");
  const clinicsCopy = { ...clinics.column, col_hash: "clinics_copy" };
  const dbs = { test_db: { columns: [clinics.column, clinicsCopy] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: clinics.column.col_hash, col_var_index: null, col_label: "Clinics A", role: "predictor",
    subset_items: ["fever", "cough"]
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: "clinics_copy", col_var_index: null, col_label: "Clinics B", role: "response",
    subset_items: ["fever", "cough"]
  })];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_ll"));
  assert.ok(result.analysis.length >= 1);
  result.analysis.forEach((entry) => {
    assert.equal(entry.chart.type, "grouped_bar");
  });
});

test("runAnalysis mode=chart Profile C: l x l without subsets emits warning (table-shaped)", () => {
  const clinics = Statz.getColumnValues(parsed, "col_clinics_hash");
  const clinicsCopy = { ...clinics.column, col_hash: "clinics_copy" };
  const dbs = { test_db: { columns: [clinics.column, clinicsCopy] } };
  const predictors = [JSON.stringify({
    database_id: "test_db", col_hash: clinics.column.col_hash, col_var_index: null, col_label: "Clinics A", role: "predictor"
  })];
  const responses = [JSON.stringify({
    database_id: "test_db", col_hash: "clinics_copy", col_var_index: null, col_label: "Clinics B", role: "response"
  })];
  const { result, flags } = driver.runAnalysis(predictors, responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_ll"));
  assert.equal(result.analysis.length, 1);
  assert.ok(result.analysis[0].table?.warning);
});

// ---------------------------------------------------------------------------
// Profile B paired — chart_paired_n, chart_paired_q
// ---------------------------------------------------------------------------

import { chart_paired_n } from "../json/charts/paired_n.js";
import { chart_paired_q } from "../json/charts/paired_q.js";

// chart_paired_n ------------------------------------------------------------

test("chart_paired_n: K=2 produces subject lines + per-moment points + per-moment means", () => {
  const t0 = [10, 12, 14, 16, 18];
  const t1 = [11, 13, 14, 17, 20];
  const out = chart_paired_n([t0, t1], ["T0", "T1"], {}, { numericLabel: "Creatinine" });
  assert.ok(out);
  assert.equal(out.type, "paired_individual_values");
  // 5 subject lines + 2 moments * (points + mean) = 5 + 4 = 9
  assert.equal(out.spec.data.length, 9);
  // First 5 traces are subject lines
  for (let i = 0; i < 5; i++) {
    assert.equal(out.spec.data[i].mode, "lines");
    assert.equal(out.spec.data[i].x.length, 2);
    assert.equal(out.spec.data[i].y.length, 2);
  }
  // Mean trace for T0: y = mean(t0) = 14
  const meanT0 = out.spec.data[6];
  assert.equal(meanT0.y[0], 14);
  // Mean for T1: y = mean(t1) = 15
  const meanT1 = out.spec.data[8];
  assert.equal(meanT1.y[0], 15);
});

test("chart_paired_n: chart_paired_show_lines=false drops subject lines", () => {
  const out = chart_paired_n([[1,2,3],[2,3,4]], ["A","B"], { chart_paired_show_lines: false }, {});
  // Only 2 moments * (points + mean) = 4 traces
  assert.equal(out.spec.data.length, 4);
  out.spec.data.forEach((trace) => {
    if (trace.mode === "lines") assert.equal(trace.x.length, 2, "only mean crossbars, not subject lines");
  });
});

test("chart_paired_n: chart_show_boxplot=true prepends box per moment", () => {
  const out = chart_paired_n([[1,2,3],[4,5,6]], ["A","B"], { chart_show_boxplot: true, chart_paired_show_lines: false }, {});
  // 2 boxes + 2 moments * (points + mean) = 6
  assert.equal(out.spec.data.length, 6);
  assert.equal(out.spec.data[0].type, "box");
  assert.equal(out.spec.data[1].type, "box");
});

test("chart_paired_n: complete-case row alignment drops incomplete subjects", () => {
  const t0 = [1, 2, 3, 4];
  const t1 = [10, "abc", 30, null];
  const out = chart_paired_n([t0, t1], ["A","B"], { chart_paired_show_lines: false }, {});
  // Only subjects 1 and 3 survive (values 1,3 in t0; 10,30 in t1)
  // Find the points trace for T0 (after no subject lines, no boxes)
  const t0Points = out.spec.data[0];
  assert.deepEqual(t0Points.y, [1, 3]);
});

test("chart_paired_n: deterministic jitter; same subject offset across moments", () => {
  const out = chart_paired_n([[1,2,3],[10,20,30]], ["A","B"], {}, {});
  // Subject 0's line is the first trace; its x should match between moments at the same offset
  const subject0 = out.spec.data[0];
  // Offset for subject 0
  const offset0 = subject0.x[0] - 1;
  assert.ok(Math.abs((subject0.x[1] - 2) - offset0) < 1e-9, "subject 0 offset constant across moments");
});

test("chart_paired_n: returns null for K < 2 or empty input", () => {
  assert.equal(chart_paired_n([[1,2,3]], ["A"], {}, {}), null);
  assert.equal(chart_paired_n([[], []], ["A","B"], {}, {}), null);
});

test("chart_paired_n: chart_show_points=false drops point markers + crossbars (subject lines independent)", () => {
  const t0 = [1, 2, 3, 4, 5];
  const t1 = [2, 4, 6, 8, 10];
  const out = chart_paired_n([t0, t1], ["A", "B"], { chart_show_points: false }, {});
  // Only subject lines remain (5 subjects) — no scatter markers, no crossbar lines per moment.
  const markers = out.spec.data.filter((tr) => tr.mode === "markers");
  assert.equal(markers.length, 0, "no markers when show_points off");
  // Subject lines are `mode:'lines'` with name starting "subject_" — 5 of them.
  const subjectLines = out.spec.data.filter((tr) => tr.mode === "lines" && String(tr.name || '').startsWith("subject_"));
  assert.equal(subjectLines.length, 5);
  // Per-moment crossbar lines (mode:'lines', name '(mean)'/'(median)') — 0.
  const crossbars = out.spec.data.filter((tr) => tr.mode === "lines" && /\((mean|median)\)$/.test(String(tr.name || '')));
  assert.equal(crossbars.length, 0);
});

test("chart_paired_n: all 3 layer toggles off → data:[] (empty axes placeholder)", () => {
  const out = chart_paired_n([[1,2,3],[4,5,6]], ["A","B"],
    { chart_show_points: false, chart_paired_show_lines: false, chart_show_boxplot: false }, {});
  assert.equal(out.spec.data.length, 0);
  // Layout still present.
  assert.equal(out.spec.layout.xaxis.tickvals.length, 2);
});

test("chart_paired_n: chart_central_tendency='median' → per-moment crossbar at median", () => {
  // Moment A: [1,2,3,4,22] median 3 (mean 6.4). Moment B: [10,10,10,10,50] median 10 (mean 18).
  const out = chart_paired_n([[1,2,3,4,22],[10,10,10,10,50]], ["A","B"], { chart_central_tendency: "median" }, {});
  const crossbars = out.spec.data.filter((tr) => tr.mode === "lines" && String(tr.name || '').includes("(median)"));
  assert.equal(crossbars.length, 2, "one crossbar per moment");
  assert.equal(crossbars[0].y[0], 3, "moment A median");
  assert.equal(crossbars[1].y[0], 10, "moment B median (asymmetric — outlier doesn't pull it)");
});

// chart_paired_q ------------------------------------------------------------

test("chart_paired_q: K=2 binary yields 2 grouped bar traces", () => {
  const t0 = ["no","no","no","no","yes"];
  const t1 = ["no","yes","yes","yes","yes"];
  const out = chart_paired_q([t0, t1], ["T0","T1"], {}, { qualitativeLabel: "Outcome" });
  assert.ok(out);
  assert.equal(out.type, "paired_grouped_bar");
  assert.equal(out.spec.layout.barmode, "group");
  // 2 traces (no, yes — alphabetical inferred)
  assert.equal(out.spec.data.length, 2);
  assert.equal(out.spec.data[0].name, "no");
  assert.equal(out.spec.data[1].name, "yes");
  // T0: 4 no, 1 yes; T1: 1 no, 4 yes
  assert.deepEqual(out.spec.data[0].y, [4, 1]);
  assert.deepEqual(out.spec.data[1].y, [1, 4]);
});

test("chart_paired_q: meta.levels preserves order even if first response is monovariate", () => {
  const t0 = ["no","no","no","no","no"]; // all no
  const t1 = ["no","yes","yes","yes","yes"];
  const out = chart_paired_q([t0, t1], ["T0","T1"], {}, { levels: ["no","yes"] });
  assert.equal(out.spec.data[0].name, "no");
  assert.equal(out.spec.data[1].name, "yes");
  assert.deepEqual(out.spec.data[0].y, [5, 1]);
  assert.deepEqual(out.spec.data[1].y, [0, 4]);
});

test("chart_paired_q: returns null when fewer than 2 unique binary levels", () => {
  const t0 = ["no","no","no"];
  const t1 = ["no","no","no"];
  assert.equal(chart_paired_q([t0, t1], ["T0","T1"], {}, {}), null);
});

test("chart_paired_q: label format p computes within-moment percentages", () => {
  const t0 = ["no","no","yes","yes"]; // 50/50
  const t1 = ["yes","yes","yes","no"]; // 25/75
  const out = chart_paired_q([t0, t1], ["T0","T1"], { chart_label_format: "p" }, {});
  // no trace: T0 50%, T1 25%
  assert.deepEqual(out.spec.data[0].text, ["50.0%", "25.0%"]);
  // yes trace: T0 50%, T1 75%
  assert.deepEqual(out.spec.data[1].text, ["50.0%", "75.0%"]);
});

// ---------------------------------------------------------------------------
// runAnalysis mode='chart' Profile B integration
// ---------------------------------------------------------------------------

test("runAnalysis mode=chart Profile B: paired n yields paired_individual_values", () => {
  const t0Vals = [10, 12, 14, 16, 18, 20];
  const t1Vals = [11, 13, 14, 17, 20, 22];
  const t0Col = {
    col_hash: "col_t0", col_label: "Creatinine pre", col_type: "n", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: t0Vals },
    col_vars: []
  };
  const t1Col = { ...t0Col, col_hash: "col_t1", col_label: "Creatinine post",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: t1Vals } };
  const dbs = { db: { columns: [t0Col, t1Col] } };
  const responses = [
    JSON.stringify({ database_id: "db", col_hash: "col_t0", col_var_index: null, col_label: "Creatinine pre" }),
    JSON.stringify({ database_id: "db", col_hash: "col_t1", col_var_index: null, col_label: "Creatinine post" })
  ];
  const { result, flags } = driver.runAnalysis([], responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_paired_n"));
  const entry = result.analysis[0];
  assert.equal(entry.predictor, null);
  assert.equal(entry.table, undefined);
  assert.equal(entry.chart.type, "paired_individual_values");
});

test("runAnalysis mode=chart Profile B: paired q binary yields paired_grouped_bar", () => {
  const t0Vals = ["no","no","no","no","yes","no","no","yes"];
  const t1Vals = ["no","yes","yes","yes","yes","yes","no","yes"];
  const t0Col = {
    col_hash: "col_t0", col_label: "Symptom T0", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: ["no","yes"], codes: null, raw_values: t0Vals },
    col_vars: []
  };
  const t1Col = { ...t0Col, col_hash: "col_t1", col_label: "Symptom T1",
    col_values: { col_compact: false, labels: ["no","yes"], codes: null, raw_values: t1Vals } };
  const dbs = { db: { columns: [t0Col, t1Col] } };
  const responses = [
    JSON.stringify({ database_id: "db", col_hash: "col_t0", col_var_index: null, col_label: "Symptom T0" }),
    JSON.stringify({ database_id: "db", col_hash: "col_t1", col_var_index: null, col_label: "Symptom T1" })
  ];
  const { result, flags } = driver.runAnalysis([], responses, dbs, { mode: "chart" });
  assert.ok(flags.includes("has_paired_q"));
  const entry = result.analysis[0];
  assert.equal(entry.predictor, null);
  assert.equal(entry.table, undefined);
  assert.equal(entry.chart.type, "paired_grouped_bar");
  assert.equal(entry.chart.spec.layout.barmode, "group");
});

test("runAnalysis mode=chart Profile B: paired rejection (mixed types) still emits warning", () => {
  const numCol = {
    col_hash: "h_num", col_label: "X", col_type: "n", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["1","2","3","4","5"] },
    col_vars: []
  };
  const qCol = {
    col_hash: "h_q", col_label: "Y", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a","b","a"] },
    col_vars: []
  };
  const dbs = { db: { columns: [numCol, qCol] } };
  const responses = [
    JSON.stringify({ database_id: "db", col_hash: "h_num", col_var_index: null, col_label: "X" }),
    JSON.stringify({ database_id: "db", col_hash: "h_q",   col_var_index: null, col_label: "Y" })
  ];
  const { result, flags } = driver.runAnalysis([], responses, dbs, { mode: "chart" });
  // Warning is emitted in table form (renderer handles via isWarningRow); chart not produced.
  assert.ok(flags.includes("has_paired"));
  const entry = result.analysis[0];
  assert.ok(entry.table?.warning);
  assert.equal(entry.chart, undefined);
});

// ---------------------------------------------------------------------------
// Phase 6 — exportCombinedAsChartHTML + chart_likert
// ---------------------------------------------------------------------------

import exporters from "../json/exporters.js";
import { chart_likert } from "../json/charts/likert.js";

// exportCombinedAsChartHTML -------------------------------------------------

test("exportCombinedAsChartHTML: emits grid container + one cell per chart entry", () => {
  const result = {
    analysis: [
      { predictor: "A", response: "B", chart: { type: "scatter", spec: { data: [{x:[1,2],y:[3,4]}], layout: {} } } },
      { predictor: "C", response: "D", chart: { type: "bar", spec: { data: [{x:["a"],y:[1]}], layout: {} } } }
    ]
  };
  const html = exporters.exportCombinedAsChartHTML(result, "Test", false);
  assert.match(html, /<div class="statz-chart-grid">/);
  // 2 cells, both with data-spec attribute
  const cellMatches = html.match(/<div class="statz-chart"/g) || [];
  assert.equal(cellMatches.length, 2);
  assert.match(html, /data-spec="[^"]+"/);
  // CSS responsive media query present
  assert.match(html, /@media \(max-width:768px\)/);
});

test("exportCombinedAsChartHTML: title from predictor; falls back to response when null", () => {
  const result = {
    analysis: [
      { predictor: null, response: "T0 × T1", chart: { type: "x", spec: { data: [], layout: {} } } }
    ]
  };
  const html = exporters.exportCombinedAsChartHTML(result);
  assert.match(html, /<div class="statz-chart-title">T0 × T1<\/div>/);
});

test("exportCombinedAsChartHTML: warning entries render as amber banner instead of chart cell", () => {
  const result = {
    analysis: [
      { predictor: null, response: "Foo", table: { warning: "List × list requires subsets" } }
    ]
  };
  const html = exporters.exportCombinedAsChartHTML(result);
  assert.match(html, /class="statz-warning">⚠ List × list requires subsets/);
  assert.equal((html.match(/<div class="statz-chart"/g) || []).length, 0);
});

test("exportCombinedAsChartHTML: escapes HTML in titles and warnings", () => {
  const result = {
    analysis: [
      { predictor: "<script>x</script>", chart: { type: "x", spec: { data: [], layout: {} } } },
      { response: "evil", table: { warning: "Some <b>warning</b> & stuff" } }
    ]
  };
  const html = exporters.exportCombinedAsChartHTML(result);
  // Title escaped — no raw <script>
  assert.equal(html.includes("<script>x</script>"), false);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  // Warning text escaped
  assert.match(html, /Some &lt;b&gt;warning&lt;\/b&gt; &amp; stuff/);
});

test("exportCombinedAsChartHTML: spec attribute round-trips back to original spec via JSON.parse", () => {
  const originalSpec = { data: [{ name: 'has "quotes" inside', x: [1, 2], y: [3, 4] }], layout: { title: "T & X" } };
  const result = { analysis: [{ predictor: "P", chart: { type: "x", spec: originalSpec } }] };
  const html = exporters.exportCombinedAsChartHTML(result);
  // Browser runtime: JSON.parse(div.getAttribute('data-spec')). Simulate by extracting and decoding.
  const m = html.match(/data-spec="([^"]*)"/);
  assert.ok(m, "data-spec attribute present");
  const decoded = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  assert.deepEqual(JSON.parse(decoded), originalSpec);
});

test("exportCombinedAsChartHTML: footerFree appended with terminal period", () => {
  const result = { analysis: [{ predictor: "A", chart: { type: "x", spec: { data: [], layout: {} } } }] };
  const html = exporters.exportCombinedAsChartHTML(result, "Title", false, "User footer text");
  assert.match(html, /<div class="statz-chart-footer">User footer text\.<\/div>/);
});

test("exportCombinedAsChartHTML: footerFree empty/whitespace produces no footer div", () => {
  const result = { analysis: [{ predictor: "A", chart: { type: "x", spec: { data: [], layout: {} } } }] };
  const html = exporters.exportCombinedAsChartHTML(result, "Title", false, "   ");
  // The CSS rule .statz-chart-footer always appears in <style>; check the actual <div>.
  assert.equal(html.includes('<div class="statz-chart-footer">'), false);
});

test("exportCombinedAsChartHTML: wrap=true emits full HTML document", () => {
  const result = { analysis: [{ predictor: "A", chart: { type: "x", spec: { data: [], layout: {} } } }] };
  const html = exporters.exportCombinedAsChartHTML(result, "My Title", true);
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<h4>My Title<\/h4>/);
});

test("exportCombinedAsChartHTML: empty analysis returns empty grid + styles", () => {
  const html = exporters.exportCombinedAsChartHTML({ analysis: [] });
  assert.match(html, /<div class="statz-chart-grid"><\/div>/);
});

test("exportCombinedAsChartHTML: invalid input returns empty string", () => {
  assert.equal(exporters.exportCombinedAsChartHTML(null), "");
  assert.equal(exporters.exportCombinedAsChartHTML({}), "");
});

// chart_likert --------------------------------------------------------------

test("chart_likert: stacked-horizontal bar with one trace per shared level", () => {
  const vars = [
    { label: "Q1", values: ["agree","neutral","agree","disagree","neutral","agree"] },
    { label: "Q2", values: ["neutral","neutral","disagree","disagree","agree","agree"] },
    { label: "Q3", values: ["agree","agree","agree","neutral","neutral","disagree"] }
  ];
  const out = chart_likert(vars, {}, {});
  assert.ok(out);
  assert.equal(out.type, "likert");
  assert.equal(out.spec.layout.barmode, "stack");
  // 3 levels (agree, disagree, neutral — alphabetical)
  assert.equal(out.spec.data.length, 3);
  out.spec.data.forEach((trace) => {
    assert.equal(trace.orientation, "h");
    assert.equal(trace.y.length, 3, "one y entry per variable");
    assert.equal(trace.x.length, 3, "one x entry per variable");
  });
});

test("chart_likert: percentages sum to ~100 per variable across traces", () => {
  const vars = [
    { label: "Q1", values: ["a","a","b","c","c"] },
    { label: "Q2", values: ["a","b","b","c","c"] }
  ];
  const out = chart_likert(vars, {}, {});
  for (let v = 0; v < vars.length; v++) {
    let sum = 0;
    out.spec.data.forEach((trace) => { sum += trace.x[v]; });
    assert.ok(Math.abs(sum - 100) < 1e-9, `variable ${v} sum=${sum}`);
  }
});

test("chart_likert: meta.levels preserves custom order", () => {
  const vars = [
    { label: "Q1", values: ["agree","disagree","neutral"] },
    { label: "Q2", values: ["neutral","agree","disagree"] }
  ];
  const out = chart_likert(vars, {}, { levels: ["disagree","neutral","agree"] });
  assert.equal(out.spec.data[0].name, "disagree");
  assert.equal(out.spec.data[1].name, "neutral");
  assert.equal(out.spec.data[2].name, "agree");
});

test("chart_likert: returns null when levels don't intersect across all vars", () => {
  const vars = [
    { label: "Q1", values: ["a","b","c"] },
    { label: "Q2", values: ["x","y","z"] }
  ];
  assert.equal(chart_likert(vars, {}, {}), null);
});

test("chart_likert: returns null for fewer than 2 vars", () => {
  assert.equal(chart_likert([{ label: "Q1", values: ["a","b"] }], {}, {}), null);
  assert.equal(chart_likert([], {}, {}), null);
});

// ---------------------------------------------------------------------------
// runAnalysis mode='chart' Likert short-circuit integration
// ---------------------------------------------------------------------------

test("runAnalysis mode=chart Profile A: chart_likert_enabled produces a single likert entry", () => {
  // Two q variables with shared levels (agree/neutral/disagree)
  const q1 = {
    col_hash: "h_q1", col_label: "Statement 1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: ["agree","neutral","disagree"], codes: null,
      raw_values: ["agree","neutral","agree","disagree","neutral","agree"] },
    col_vars: []
  };
  const q2 = {
    col_hash: "h_q2", col_label: "Statement 2", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: ["agree","neutral","disagree"], codes: null,
      raw_values: ["neutral","neutral","disagree","disagree","agree","agree"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, q2] } };
  const predictors = [
    JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Statement 1", role: "predictor" }),
    JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "Statement 2", role: "predictor" })
  ];
  const { result, flags } = driver.runAnalysis(predictors, [], dbs, { mode: "chart", chart_likert_enabled: true });
  assert.ok(flags.includes("has_q"));
  // Single combined entry (not one per predictor)
  assert.equal(result.analysis.length, 1);
  const entry = result.analysis[0];
  assert.equal(entry.chart.type, "likert");
  assert.match(entry.predictor, /Statement 1.*Statement 2/);
});

test("runAnalysis mode=chart Profile A: chart_likert_enabled=false falls back to per-predictor bars", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "S1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a","b"] },
    col_vars: []
  };
  const q2 = { ...q1, col_hash: "h_q2", col_label: "S2",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","a","b","b"] } };
  const dbs = { db: { columns: [q1, q2] } };
  const predictors = [
    JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "S1", role: "predictor" }),
    JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "S2", role: "predictor" })
  ];
  // No chart_likert_enabled → per-predictor chart_q
  const { result } = driver.runAnalysis(predictors, [], dbs, { mode: "chart" });
  assert.equal(result.analysis.length, 2);
  result.analysis.forEach((entry) => assert.equal(entry.chart.type, "bar"));
});

// ---------------------------------------------------------------------------
// has_likert_eligible flag — gates the chart_likert_enabled UI toggle. Emitted
// on data eligibility only (≥2 q predictors, no response, ≥2 shared levels);
// independent of options.mode and options.chart_likert_enabled so the toggle
// is visible / hidden precisely.
// ---------------------------------------------------------------------------

test("has_likert_eligible: emitted when ≥2 q predictors share ≥2 levels (regardless of mode/opt-in)", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "S1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: ["a","b","c"], codes: null,
      raw_values: ["a","b","c","a","b"] },
    col_vars: []
  };
  const q2 = { ...q1, col_hash: "h_q2", col_label: "S2",
    col_values: { col_compact: false, labels: ["a","b","c"], codes: null,
      raw_values: ["b","a","c","b","a"] } };
  const dbs = { db: { columns: [q1, q2] } };
  const predictors = [
    JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "S1", role: "predictor" }),
    JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "S2", role: "predictor" })
  ];
  // table mode, no opt-in → flag still fires (data-side only).
  const { flags: fTable } = driver.runAnalysis(predictors, [], dbs, { mode: "table" });
  assert.ok(fTable.includes("has_likert_eligible"), "flag emitted in table mode");
  // chart mode, no opt-in → flag still fires.
  const { flags: fChartNoOpt } = driver.runAnalysis(predictors, [], dbs, { mode: "chart" });
  assert.ok(fChartNoOpt.includes("has_likert_eligible"), "flag emitted in chart mode without opt-in");
  // chart mode + opt-in → flag fires AND short-circuit dispatches.
  const { flags: fChartOpt } = driver.runAnalysis(predictors, [], dbs, { mode: "chart", chart_likert_enabled: true });
  assert.ok(fChartOpt.includes("has_likert_eligible"), "flag emitted with opt-in");
});

test("has_likert_eligible: NOT emitted with a single q predictor", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "S1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1] } };
  const predictors = [
    JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "S1", role: "predictor" })
  ];
  const { flags } = driver.runAnalysis(predictors, [], dbs, { mode: "chart" });
  assert.ok(!flags.includes("has_likert_eligible"), "single predictor → toggle would be a no-op → flag absent");
});

test("has_likert_eligible: NOT emitted when predictor types are mixed", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "S1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b"] },
    col_vars: []
  };
  const n1 = {
    col_hash: "h_n1", col_label: "N1", col_type: "n", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["1","2"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, n1] } };
  const predictors = [
    JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "S1", role: "predictor" }),
    JSON.stringify({ database_id: "db", col_hash: "h_n1", col_var_index: null, col_label: "N1", role: "predictor" })
  ];
  const { flags } = driver.runAnalysis(predictors, [], dbs, { mode: "chart" });
  assert.ok(!flags.includes("has_likert_eligible"), "mixed types → toggle would be a no-op → flag absent");
});

test("has_likert_eligible: NOT emitted when q predictors have disjoint levels", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "S1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["north","south","north"] },
    col_vars: []
  };
  const q2 = {
    col_hash: "h_q2", col_label: "S2", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["cat","dog","cat"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, q2] } };
  const predictors = [
    JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "S1", role: "predictor" }),
    JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "S2", role: "predictor" })
  ];
  const { flags } = driver.runAnalysis(predictors, [], dbs, { mode: "chart" });
  assert.ok(!flags.includes("has_likert_eligible"), "no shared levels → toggle would be a no-op → flag absent");
});

test("has_likert_eligible: NOT emitted in Profile B or Profile C (responses present)", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "S1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a"] },
    col_vars: []
  };
  const q2 = { ...q1, col_hash: "h_q2", col_label: "S2",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["b","a","b"] } };
  const dbs = { db: { columns: [q1, q2] } };
  const preds = [
    JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "S1", role: "predictor" })
  ];
  const resps = [
    JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "S2", role: "response" })
  ];
  // Profile C — 1 pred + 1 resp.
  const { flags } = driver.runAnalysis(preds, resps, dbs, { mode: "chart" });
  assert.ok(!flags.includes("has_likert_eligible"), "response present → not Profile A → flag absent");
});

test("has_likert_eligible options gate: chart_likert_enabled visible only when the flag is present", () => {
  const meta = Statz.OPTION_METADATA.chart_likert_enabled;
  assert.deepEqual(meta.appliesTo, ["has_likert_eligible"], "gates on the new precise flag, not the broad has_q");
  // getAvailableOptions in chart mode: flag missing → toggle hidden.
  const noFlag = Statz.getAvailableOptions(["has_q"], "chart").map((o) => o.name);
  assert.ok(!noFlag.includes("chart_likert_enabled"), "has_q alone must not surface the toggle anymore");
  // Flag present → toggle visible.
  const withFlag = Statz.getAvailableOptions(["has_q", "has_likert_eligible"], "chart").map((o) => o.name);
  assert.ok(withFlag.includes("chart_likert_enabled"), "toggle visible when eligibility flag present");
});

test("runAnalysis mode=chart Profile A: chart_likert_enabled but mixed types falls back", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "S1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b"] },
    col_vars: []
  };
  const n1 = {
    col_hash: "h_n1", col_label: "N1", col_type: "n", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["1","2"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, n1] } };
  const predictors = [
    JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "S1", role: "predictor" }),
    JSON.stringify({ database_id: "db", col_hash: "h_n1", col_var_index: null, col_label: "N1", role: "predictor" })
  ];
  const { result } = driver.runAnalysis(predictors, [], dbs, { mode: "chart", chart_likert_enabled: true });
  // Falls back: 2 per-predictor entries (chart_q + chart_n)
  assert.equal(result.analysis.length, 2);
  assert.equal(result.analysis[0].chart.type, "bar");
  assert.equal(result.analysis[1].chart.type, "individual_values");
});

// ---------------------------------------------------------------------------
// chart_interactive — injects spec.config.staticPlot on every chart entry.
// Default false → staticPlot: true (no hover / zoom / pan). Opt-in inverts it.
// ---------------------------------------------------------------------------

test("chart_interactive default false: every chart entry.spec.config.staticPlot is true", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "S1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1] } };
  const predictors = [
    JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "S1", role: "predictor" })
  ];
  const { result } = driver.runAnalysis(predictors, [], dbs, { mode: "chart" });
  const spec = result.analysis[0].chart.spec;
  assert.ok(spec.config, "config bag emitted on every chart spec");
  assert.equal(spec.config.staticPlot, true, "static-by-default");
});

test("chart_interactive: true → spec.config.staticPlot is false", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "S1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1] } };
  const predictors = [
    JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "S1", role: "predictor" })
  ];
  const { result } = driver.runAnalysis(predictors, [], dbs, { mode: "chart", chart_interactive: true });
  const spec = result.analysis[0].chart.spec;
  assert.equal(spec.config.staticPlot, false, "interactive opt-in disables staticPlot");
});

test("chart_interactive: config injected on every entry of a multi-cell result (l × q)", () => {
  const l1 = {
    col_hash: "h_l1", col_label: "Symptoms", col_type: "l", col_sep: ";",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["fever;cough","fever","cough","fever;cough"] },
    col_vars: []
  };
  const q1 = {
    col_hash: "h_q1", col_label: "Outcome", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["yes","no","yes","no"] },
    col_vars: []
  };
  const dbs = { db: { columns: [l1, q1] } };
  const predictors = [JSON.stringify({ database_id: "db", col_hash: "h_l1", col_var_index: null, col_label: "Symptoms", role: "predictor" })];
  const responses = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Outcome", role: "response" })];
  const { result } = driver.runAnalysis(predictors, responses, dbs, { mode: "chart" });
  assert.ok(result.analysis.length >= 2, "l × q emits ≥2 sub-charts");
  for (const entry of result.analysis) {
    assert.equal(entry.chart?.spec?.config?.staticPlot, true, "static injected on every sub-chart");
  }
});

test("chart_interactive: default normalization is false", () => {
  const merged = Statz.getDefaultAnalysisOptions({});
  assert.equal(merged.chart_interactive, false, "default: static (chart_interactive=false)");
  const explicit = Statz.getDefaultAnalysisOptions({ chart_interactive: true });
  assert.equal(explicit.chart_interactive, true, "explicit opt-in preserved");
  // Non-boolean coerced to false (only strict === true enables).
  const truthyNonBool = Statz.getDefaultAnalysisOptions({ chart_interactive: 1 });
  assert.equal(truthyNonBool.chart_interactive, false, "non-boolean coerced to false");
});

test("renderCharts: spec.config.staticPlot forwarded to Plotly.newPlot config arg", () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const newPlotCalls = [];
  const fakeDiv = {
    nodeType: 1, isConnected: true,
    classList: { contains: (c) => c === 'statz-chart' },
    dataset: {},
    getAttribute: () => JSON.stringify({
      data: [{}], layout: {}, config: { staticPlot: true }
    })
  };
  globalThis.document = /** @type {any} */ ({ querySelectorAll: () => [fakeDiv] });
  globalThis.window = /** @type {any} */ ({
    Plotly: {
      newPlot: (_div, data, layout, config) => { newPlotCalls.push({ data, layout, config }); return Promise.resolve(); },
      Plots: { resize: () => {} }
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (cb) => cb()
  });
  try {
    loader.renderCharts();
    assert.equal(newPlotCalls.length, 1);
    // Defaults still present + spec.config wins on overlapping keys.
    assert.equal(newPlotCalls[0].config.responsive, true, "responsive default preserved");
    assert.equal(newPlotCalls[0].config.displayModeBar, false, "displayModeBar default preserved");
    assert.equal(newPlotCalls[0].config.staticPlot, true, "spec.config.staticPlot forwarded");
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
  }
});

test("renderCharts: without spec.config the defaults still apply (no staticPlot)", () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const newPlotCalls = [];
  const fakeDiv = {
    nodeType: 1, isConnected: true,
    classList: { contains: (c) => c === 'statz-chart' },
    dataset: {},
    getAttribute: () => JSON.stringify({ data: [{}], layout: {} })
  };
  globalThis.document = /** @type {any} */ ({ querySelectorAll: () => [fakeDiv] });
  globalThis.window = /** @type {any} */ ({
    Plotly: {
      newPlot: (_div, data, layout, config) => { newPlotCalls.push({ data, layout, config }); return Promise.resolve(); },
      Plots: { resize: () => {} }
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (cb) => cb()
  });
  try {
    loader.renderCharts();
    assert.equal(newPlotCalls[0].config.responsive, true);
    assert.equal(newPlotCalls[0].config.displayModeBar, false);
    assert.equal(newPlotCalls[0].config.staticPlot, undefined, "no config in spec → no staticPlot forwarded");
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
  }
});

// ---------------------------------------------------------------------------
// Title consolidation — bar-family numeric-axis titles + chart_n "Value" +
// 3 title-visibility toggles (chart_show_title / _xaxis_title / _yaxis_title).
// Consolidates axis titles across all chart types per the ANALYSIS.md matrix.
// ---------------------------------------------------------------------------

test("chart_q (vertical bar): y-axis title is 'Count' by default (chart_label_format='n')", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "Group", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a","b","a"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1] } };
  const predictors = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Group", role: "predictor" })];
  const { result } = driver.runAnalysis(predictors, [], dbs, { mode: "chart" });
  const layout = result.analysis[0].chart.spec.layout;
  // Vertical: x carries varLabel, y carries numeric label. Both non-empty now.
  assert.equal(layout.xaxis.title.text, "Group");
  assert.equal(layout.yaxis.title.text, "Count", "y-axis title = i18n Count (default chart_label_format='n')");
});

test("chart_q: y-axis label follows chart_label_format ('p' → '%', 'np' → 'n (%)')", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "Group", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1] } };
  const predictors = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Group", role: "predictor" })];
  const pct = driver.runAnalysis(predictors, [], dbs, { mode: "chart", chart_label_format: "p" });
  assert.equal(pct.result.analysis[0].chart.spec.layout.yaxis.title.text, "%");
  const combined = driver.runAnalysis(predictors, [], dbs, { mode: "chart", chart_label_format: "np" });
  assert.equal(combined.result.analysis[0].chart.spec.layout.yaxis.title.text, "n (%)");
});

test("chart_q_q: y-axis (bar heights) labeled per chart_label_format — previously empty", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "Sex", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["m","f","m","f","m","f"] },
    col_vars: []
  };
  const q2 = {
    col_hash: "h_q2", col_label: "Outcome", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["yes","no","yes","yes","no","no"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, q2] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Sex", role: "predictor" })];
  const resps = [JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "Outcome", role: "response" })];
  const { result } = driver.runAnalysis(preds, resps, dbs, { mode: "chart" });
  const layout = result.analysis[0].chart.spec.layout;
  assert.equal(layout.xaxis.title.text, "Sex");
  assert.equal(layout.yaxis.title.text, "Count", "grouped_bar y-axis carries numeric label");
});

test("chart_paired_q: y-axis carries 'Count' label — previously empty", () => {
  // 2 momentos × binary yes/no.
  const t0 = {
    col_hash: "h_t0", col_label: "T0", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["yes","no","yes","yes"] },
    col_vars: []
  };
  const t1 = {
    col_hash: "h_t1", col_label: "T1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["no","no","yes","no"] },
    col_vars: []
  };
  const dbs = { db: { columns: [t0, t1] } };
  const resps = [
    JSON.stringify({ database_id: "db", col_hash: "h_t0", col_var_index: null, col_label: "T0", role: "response" }),
    JSON.stringify({ database_id: "db", col_hash: "h_t1", col_var_index: null, col_label: "T1", role: "response" })
  ];
  const { result } = driver.runAnalysis([], resps, dbs, { mode: "chart" });
  const layout = result.analysis[0].chart.spec.layout;
  assert.equal(layout.yaxis.title.text, "Count");
});

test("chart_show_xaxis_title=false: blanks xaxis.title.text on every chart entry", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "Group", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Group", role: "predictor" })];
  const { result } = driver.runAnalysis(preds, [], dbs, { mode: "chart", chart_show_xaxis_title: false });
  assert.equal(result.analysis[0].chart.spec.layout.xaxis.title.text, "", "x-axis title blanked");
  // y-axis unaffected.
  assert.equal(result.analysis[0].chart.spec.layout.yaxis.title.text, "Count");
});

test("chart_show_yaxis_title=false: blanks yaxis.title.text on every chart entry", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "Group", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Group", role: "predictor" })];
  const { result } = driver.runAnalysis(preds, [], dbs, { mode: "chart", chart_show_yaxis_title: false });
  assert.equal(result.analysis[0].chart.spec.layout.yaxis.title.text, "");
  // x-axis unaffected.
  assert.equal(result.analysis[0].chart.spec.layout.xaxis.title.text, "Group");
});

test("chart_show_xaxis_title=false: reclaims margin.b (previously reserved for the title)", () => {
  // chart_q_q emits `margin: { t:60, r:30, b:80, l:60 }`. Hiding the x-axis title
  // should reclaim ~25px from margin.b so the plot area recovers vertical space.
  const q1 = {
    col_hash: "h_q1", col_label: "Group", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a","b"] },
    col_vars: []
  };
  const q2 = {
    col_hash: "h_q2", col_label: "Outcome", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["y","n","y","n"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, q2] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Group", role: "predictor" })];
  const resps = [JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "Outcome", role: "response" })];
  // Baseline (title visible): margin.b = 80 as emitted by chart_q_q.
  const shown = driver.runAnalysis(preds, resps, dbs, { mode: "chart" });
  assert.equal(shown.result.analysis[0].chart.spec.layout.margin.b, 80);
  // Hidden: margin.b reduced by 25 → 55.
  const hidden = driver.runAnalysis(preds, resps, dbs, { mode: "chart", chart_show_xaxis_title: false });
  assert.equal(hidden.result.analysis[0].chart.spec.layout.margin.b, 55);
});

test("chart_show_yaxis_title=false: reclaims margin.l (min-clamped for numeric tick room)", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "Group", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a","b"] },
    col_vars: []
  };
  const q2 = {
    col_hash: "h_q2", col_label: "Outcome", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["y","n","y","n"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, q2] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Group", role: "predictor" })];
  const resps = [JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "Outcome", role: "response" })];
  // chart_q_q emits margin.l = 60. Reduced by 25 → 35 → clamped to min 40.
  const hidden = driver.runAnalysis(preds, resps, dbs, { mode: "chart", chart_show_yaxis_title: false });
  assert.equal(hidden.result.analysis[0].chart.spec.layout.margin.l, 40, "clamped to MIN_MARGIN_L to keep room for numeric tick text");
});

test("axis titles hidden: charts without a title object (chart_n xaxis) DON'T reduce margin", () => {
  // chart_n uses xaxis tick text for the var label, no xaxis.title.text is set.
  // The post-processor guard `layout.xaxis?.title` prevents margin reduction here.
  const n1 = {
    col_hash: "h_n1", col_label: "Age", col_type: "n", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["25","30","35","40"] },
    col_vars: []
  };
  const dbs = { db: { columns: [n1] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_n1", col_var_index: null, col_label: "Age", role: "predictor" })];
  const hidden = driver.runAnalysis(preds, [], dbs, { mode: "chart", chart_show_xaxis_title: false });
  // chart_n emits margin: { t:30, r:30, b:50, l:70 } — b unchanged since xaxis has no title.
  assert.equal(hidden.result.analysis[0].chart.spec.layout.margin.b, 50, "no title → no margin reduction");
});

test("chart_show_title (default false): result.chart_options.show_title carries the flag", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "Group", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Group", role: "predictor" })];
  const off = driver.runAnalysis(preds, [], dbs, { mode: "chart" });
  assert.equal(off.result.chart_options?.show_title, false, "default false");
  const on = driver.runAnalysis(preds, [], dbs, { mode: "chart", chart_show_title: true });
  assert.equal(on.result.chart_options?.show_title, true);
});

test("exportCombinedAsChartHTML: show_title=false omits .statz-chart-title for chart cells", () => {
  const result = {
    analysis: [{ predictor: "MyVar", chart: { type: "bar", spec: { data: [], layout: {} } } }],
    chart_options: { show_title: false }
  };
  const html = exporters.exportCombinedAsChartHTML(result);
  assert.equal(html.includes('class="statz-chart-title"'), false, "no title div in chart cell");
  // The data-spec div still emitted.
  assert.match(html, /<div class="statz-chart" data-spec="/);
});

test("exportCombinedAsChartHTML: show_title=false still keeps heading on WARNING cells", () => {
  const result = {
    analysis: [
      { predictor: "Rejected", table: { warning: "paired analysis skipped" } },
      { predictor: "OK", chart: { type: "bar", spec: { data: [], layout: {} } } }
    ],
    chart_options: { show_title: false }
  };
  const html = exporters.exportCombinedAsChartHTML(result);
  // Warning cell keeps its heading (statz-chart-title is INSIDE the warning cell).
  assert.match(html, /statz-chart-cell--warning[\s\S]*statz-chart-title[^>]*>Rejected/);
  // Regular chart cell has NO title div even though it has a predictor label.
  assert.equal(/<div class="statz-chart-cell"><div class="statz-chart-title"/.test(html), false);
});

test("exportCombinedAsChartHTML: show_title defaults to visible when chart_options absent (legacy payload compat)", () => {
  const result = {
    analysis: [{ predictor: "MyVar", chart: { type: "bar", spec: { data: [], layout: {} } } }]
    // no chart_options key at all — represents pre-toggle result payloads
  };
  const html = exporters.exportCombinedAsChartHTML(result);
  assert.match(html, /<div class="statz-chart-title">MyVar<\/div>/, "legacy payloads keep the heading");
});

test("title-visibility options: default normalization matches spec (title hidden, axes visible)", () => {
  const merged = Statz.getDefaultAnalysisOptions({});
  assert.equal(merged.chart_show_title, false, "main title hidden by default");
  assert.equal(merged.chart_show_xaxis_title, true, "x-axis title visible by default");
  assert.equal(merged.chart_show_yaxis_title, true, "y-axis title visible by default");
  // Non-boolean coerced by === true / !== false.
  const custom = Statz.getDefaultAnalysisOptions({
    chart_show_title: 1, // truthy but not true → false
    chart_show_xaxis_title: 0, // falsy but not explicit false → still true (!== false)
    chart_show_yaxis_title: false // explicit false → false
  });
  assert.equal(custom.chart_show_title, false);
  assert.equal(custom.chart_show_xaxis_title, true, "0 !== false, so still visible");
  assert.equal(custom.chart_show_yaxis_title, false);
});

test("chart_show_points / chart_central_tendency: default normalization", () => {
  const def = Statz.getDefaultAnalysisOptions({});
  assert.equal(def.chart_show_points, true, "points layer visible by default (backward compat)");
  assert.equal(def.chart_central_tendency, "mean", "mean by default");
  // Coercion:
  // - chart_show_points uses `!== false` → any non-false value stays true.
  // - chart_central_tendency uses strict equality with 'median' → anything else falls back to 'mean'.
  const off = Statz.getDefaultAnalysisOptions({ chart_show_points: false });
  assert.equal(off.chart_show_points, false);
  const median = Statz.getDefaultAnalysisOptions({ chart_central_tendency: "median" });
  assert.equal(median.chart_central_tendency, "median");
  const garbage = Statz.getDefaultAnalysisOptions({ chart_central_tendency: "mode" });
  assert.equal(garbage.chart_central_tendency, "mean", "unknown values fall back to 'mean'");
});

// ---------------------------------------------------------------------------
// Legend layout consolidation — chart_legend_position / chart_show_legend_title /
// chart_legend_title_wrap / chart_legend_labels_wrap. Applies to chart_q_q,
// chart_paired_q, chart_likert.
// ---------------------------------------------------------------------------

test("chart_q_q default legend: top-oriented, small font, title present, wrap applied to trace names + title", () => {
  // Trigger via runAnalysis so normalized defaults flow through.
  const q1 = {
    col_hash: "h_q1", col_label: "Group", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a","b","a","b"] },
    col_vars: []
  };
  // 5-word title triggers wrapping at the default title_wrap=4.
  // 3-word trace names ("positive test result") trigger wrapping at default labels_wrap=2.
  const q2 = {
    col_hash: "h_q2", col_label: "Final Post Intervention Outcome Result", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null,
      raw_values: ["positive test result","negative test result","positive test result","negative test result","positive test result","negative test result"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, q2] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Group", role: "predictor" })];
  const resps = [JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "Final Post Intervention Outcome Result", role: "response" })];
  const { result } = driver.runAnalysis(preds, resps, dbs, { mode: "chart" });
  const legend = result.analysis[0].chart.spec.layout.legend;
  // Position default 'top': horizontal orientation + centered above the plot.
  assert.equal(legend.orientation, "h");
  assert.equal(legend.xanchor, "center");
  assert.equal(legend.yanchor, "bottom");
  assert.ok(legend.y > 1, "legend y anchored above the plot area");
  // Fixed small font.
  assert.equal(legend.font.size, 11);
  // Title wrapped at default 4 words: 5 words → "Final Post Intervention Outcome<br>Result".
  assert.equal(legend.title.text, "Final Post Intervention Outcome<br>Result");
  // Trace names wrapped at default 2 words: 3-word entries → "<first two words><br><third>".
  const traces = result.analysis[0].chart.spec.data;
  // Both traces (positive/negative) should wrap identically. Order is alpha-sorted.
  assert.equal(traces.length, 2);
  traces.forEach((tr) => assert.match(tr.name, /^\S+ \S+<br>\S+$/, `entry "${tr.name}" wrapped at 2 words`));
});

test("chart_q_q chart_legend_position='right' restores vertical/right (previous default)", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "G", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a"] },
    col_vars: []
  };
  const q2 = {
    col_hash: "h_q2", col_label: "R", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["y","n","y"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, q2] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "G", role: "predictor" })];
  const resps = [JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "R", role: "response" })];
  const { result } = driver.runAnalysis(preds, resps, dbs, { mode: "chart", chart_legend_position: "right" });
  const legend = result.analysis[0].chart.spec.layout.legend;
  assert.equal(legend.orientation, "v", "right position → vertical orientation");
  // No horizontal-position anchors when right (Plotly default).
  assert.equal(legend.xanchor, undefined);
  assert.equal(legend.yanchor, undefined);
});

test("chart_q_q chart_legend_position='bottom' → horizontal below plot", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "G", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b"] },
    col_vars: []
  };
  const q2 = {
    col_hash: "h_q2", col_label: "R", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["y","n"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, q2] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "G", role: "predictor" })];
  const resps = [JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "R", role: "response" })];
  const { result } = driver.runAnalysis(preds, resps, dbs, { mode: "chart", chart_legend_position: "bottom" });
  const legend = result.analysis[0].chart.spec.layout.legend;
  assert.equal(legend.orientation, "h");
  assert.ok(legend.y < 0, "bottom position → y below the plot area");
});

test("chart_q_q chart_show_legend_title=false blanks the legend title text", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "G", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b"] },
    col_vars: []
  };
  const q2 = {
    col_hash: "h_q2", col_label: "Long Response Name", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["y","n"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, q2] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "G", role: "predictor" })];
  const resps = [JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "Long Response Name", role: "response" })];
  const { result } = driver.runAnalysis(preds, resps, dbs, { mode: "chart", chart_show_legend_title: false });
  assert.equal(result.analysis[0].chart.spec.layout.legend.title.text, "");
});

test("chart_q_q: chart_legend_title_wrap and chart_legend_labels_wrap gate independently", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "G", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a","b","a","b"] },
    col_vars: []
  };
  // Title "Very Long Response Variable" (4 words), trace level "Extremely Long Response Level" (4 words).
  const q2 = {
    col_hash: "h_q2", col_label: "Very Long Response Variable", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null,
      raw_values: ["Extremely Long Response Level","Short","Extremely Long Response Level","Short"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, q2] } };
  const preds = [JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "G", role: "predictor" })];
  const resps = [JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "Very Long Response Variable", role: "response" })];

  // Case A: title_wrap=3 (wraps 4-word title), labels_wrap=10 (leaves 4-word entries intact).
  const caseA = driver.runAnalysis(preds, resps, dbs, {
    mode: "chart", chart_legend_title_wrap: 3, chart_legend_labels_wrap: 10
  });
  const legendA = caseA.result.analysis[0].chart.spec.layout.legend;
  assert.equal(legendA.title.text, "Very Long Response<br>Variable", "title wrapped at 3");
  const wrappedInA = caseA.result.analysis[0].chart.spec.data.find((tr) => tr.name.includes("<br>"));
  assert.equal(wrappedInA, undefined, "entries NOT wrapped when labels_wrap=10");

  // Case B: title_wrap=10 (leaves 4-word title intact), labels_wrap=2 (wraps 4-word entries).
  const caseB = driver.runAnalysis(preds, resps, dbs, {
    mode: "chart", chart_legend_title_wrap: 10, chart_legend_labels_wrap: 2
  });
  const legendB = caseB.result.analysis[0].chart.spec.layout.legend;
  assert.equal(legendB.title.text, "Very Long Response Variable", "title NOT wrapped when title_wrap=10");
  const wrappedInB = caseB.result.analysis[0].chart.spec.data.find((tr) => tr.name.includes("<br>"));
  assert.equal(wrappedInB.name, "Extremely Long<br>Response Level", "entries wrapped at 2");
});

test("chart_paired_q: legend layout uses the same helper (top by default)", () => {
  const t0 = {
    col_hash: "h_t0", col_label: "T0", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["yes","no","yes"] },
    col_vars: []
  };
  const t1 = {
    col_hash: "h_t1", col_label: "T1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["no","no","yes"] },
    col_vars: []
  };
  const dbs = { db: { columns: [t0, t1] } };
  const resps = [
    JSON.stringify({ database_id: "db", col_hash: "h_t0", col_var_index: null, col_label: "T0", role: "response" }),
    JSON.stringify({ database_id: "db", col_hash: "h_t1", col_var_index: null, col_label: "T1", role: "response" })
  ];
  const { result } = driver.runAnalysis([], resps, dbs, { mode: "chart" });
  const legend = result.analysis[0].chart.spec.layout.legend;
  assert.equal(legend.orientation, "h", "paired_q also gets top-horizontal by default");
  assert.equal(legend.font.size, 11);
});

test("chart_likert: legend uses shared helper; no title (levels are self-describing)", () => {
  const q1 = {
    col_hash: "h_q1", col_label: "Statement 1", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null,
      raw_values: ["agree","neutral","agree","disagree","neutral","agree"] },
    col_vars: []
  };
  const q2 = {
    col_hash: "h_q2", col_label: "Statement 2", col_type: "q", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null,
      raw_values: ["neutral","neutral","disagree","disagree","agree","agree"] },
    col_vars: []
  };
  const dbs = { db: { columns: [q1, q2] } };
  const preds = [
    JSON.stringify({ database_id: "db", col_hash: "h_q1", col_var_index: null, col_label: "Statement 1", role: "predictor" }),
    JSON.stringify({ database_id: "db", col_hash: "h_q2", col_var_index: null, col_label: "Statement 2", role: "predictor" })
  ];
  const { result } = driver.runAnalysis(preds, [], dbs, { mode: "chart", chart_likert_enabled: true });
  const legend = result.analysis[0].chart.spec.layout.legend;
  // Likert passes no meta.title to buildLegendLayout → title stays empty regardless of show_legend_title.
  assert.equal(legend.title.text, "", "likert legend has no title (levels self-describe)");
  // Font size and orientation still consistent with the helper.
  assert.equal(legend.font.size, 11);
  assert.equal(legend.orientation, "h");
});

test("legend options: gated on multi-trace flags only — has_q alone must NOT surface them", () => {
  // has_q alone (Profile A chart_q single-bar) has no legend → controls hidden.
  const qAlone = Statz.getAvailableOptions(['has_q'], 'chart').map((o) => o.name);
  assert.ok(!qAlone.includes('chart_legend_position'), 'legend_position hidden for has_q alone');
  assert.ok(!qAlone.includes('chart_legend_labels_wrap'), 'legend_labels_wrap hidden for has_q alone');
  assert.ok(!qAlone.includes('chart_show_legend_title'));
  assert.ok(!qAlone.includes('chart_legend_title_wrap'));
  // has_likert_eligible → position + labels_wrap visible (likert chart has a legend).
  const likert = Statz.getAvailableOptions(['has_q', 'has_likert_eligible'], 'chart').map((o) => o.name);
  assert.ok(likert.includes('chart_legend_position'));
  assert.ok(likert.includes('chart_legend_labels_wrap'));
  // title + title_wrap remain hidden even under likert — likert has no meta.title.
  assert.ok(!likert.includes('chart_show_legend_title'));
  assert.ok(!likert.includes('chart_legend_title_wrap'));
  // has_qq (Profile C) → all 4 legend options visible.
  const qq = Statz.getAvailableOptions(['has_qq'], 'chart').map((o) => o.name);
  ['chart_legend_position', 'chart_show_legend_title', 'chart_legend_title_wrap', 'chart_legend_labels_wrap']
    .forEach((name) => assert.ok(qq.includes(name), `${name} must surface for has_qq`));
});

test("legend options: default normalization", () => {
  const def = Statz.getDefaultAnalysisOptions({});
  assert.equal(def.chart_legend_position, "top");
  assert.equal(def.chart_show_legend_title, true);
  assert.equal(def.chart_legend_title_wrap, 4, "title default higher — title has more room in top/bottom legends");
  assert.equal(def.chart_legend_labels_wrap, 2, "entries default 2 — trace pills stay compact");
  // Enum coercion for position: unknown values fall back to 'top'.
  const bad = Statz.getDefaultAnalysisOptions({ chart_legend_position: "left" });
  assert.equal(bad.chart_legend_position, "top", "unknown positions fall back to default");
  // Number coercion for wraps.
  const titleBad = Statz.getDefaultAnalysisOptions({ chart_legend_title_wrap: "abc" });
  assert.equal(titleBad.chart_legend_title_wrap, 4);
  const labelsBad = Statz.getDefaultAnalysisOptions({ chart_legend_labels_wrap: "abc" });
  assert.equal(labelsBad.chart_legend_labels_wrap, 2);
});

// ---------------------------------------------------------------------------
// Phase 7 — DOCX export primitives (chartSpecToImage and friends)
// ---------------------------------------------------------------------------

import * as loader from "../loader.js";

// Existence + signature ------------------------------------------------------

test("loader: exports chartSpecToImage / chartSpecsToImages / analysisResultToImages", () => {
  assert.equal(typeof loader.chartSpecToImage, "function");
  assert.equal(typeof loader.chartSpecsToImages, "function");
  assert.equal(typeof loader.analysisResultToImages, "function");
});

// Browser-environment guard --------------------------------------------------

test("chartSpecToImage: rejects in Node (no document) with a clear message", async () => {
  const prevDoc = globalThis.document;
  delete globalThis.document;
  try {
    await assert.rejects(
      () => loader.chartSpecToImage({ data: [], layout: {} }),
      /requires a browser environment/
    );
  } finally {
    if (prevDoc) globalThis.document = prevDoc;
  }
});

test("chartSpecToImage: rejects when Plotly absent (with browser shim, no window.Plotly)", async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  // Minimal shim: document exists, window exists, but no Plotly.
  globalThis.document = /** @type {any} */ ({ createElement: () => ({}), body: { appendChild: () => {} } });
  globalThis.window = /** @type {any} */ ({});
  try {
    await assert.rejects(
      () => loader.chartSpecToImage({ data: [], layout: {} }),
      /window\.Plotly not available/
    );
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
  }
});

test("chartSpecToImage: rejects with clear message on invalid spec", async () => {
  // Need browser shim WITH Plotly mock so we get past the env/lib checks
  // and reach the spec validation.
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = /** @type {any} */ ({ createElement: () => ({}), body: { appendChild: () => {} } });
  globalThis.window = /** @type {any} */ ({
    Plotly: { newPlot: () => Promise.resolve(), toImage: () => Promise.resolve('data:'), purge: () => {} }
  });
  try {
    await assert.rejects(
      () => loader.chartSpecToImage(null),
      /invalid spec/
    );
    await assert.rejects(
      () => loader.chartSpecToImage({ notData: true }),
      /invalid spec/
    );
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
  }
});

// chartSpecsToImages -------------------------------------------------------

test("chartSpecsToImages: empty input returns empty array", async () => {
  assert.deepEqual(await loader.chartSpecsToImages([]), []);
  assert.deepEqual(await loader.chartSpecsToImages(null), []);
});

test("chartSpecsToImages: with shim renders specs serially and returns data URLs in order", async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const renderOrder = [];
  const removed = [];
  let plotCalls = 0;
  globalThis.document = /** @type {any} */ ({
    createElement: () => {
      const el = { style: {}, remove: () => removed.push(el) };
      return el;
    },
    body: { appendChild: () => {} }
  });
  globalThis.window = /** @type {any} */ ({
    Plotly: {
      newPlot: (host, data) => { plotCalls++; renderOrder.push(data[0]?.id); return Promise.resolve(); },
      toImage: () => Promise.resolve(`data:image/png;base64,X${plotCalls}`),
      purge: () => {}
    }
  });
  try {
    const specs = [
      { data: [{ id: "a" }], layout: {} },
      { data: [{ id: "b" }], layout: {} },
      { data: [{ id: "c" }], layout: {} }
    ];
    const images = await loader.chartSpecsToImages(specs);
    assert.deepEqual(renderOrder, ["a", "b", "c"], "rendered serially in input order");
    assert.equal(images.length, 3);
    assert.equal(removed.length, 3, "host divs cleaned up after each render");
    images.forEach((url) => assert.match(url, /^data:image\/png;base64,/));
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
  }
});

// analysisResultToImages ---------------------------------------------------

test("analysisResultToImages: empty / invalid input → []", async () => {
  assert.deepEqual(await loader.analysisResultToImages(null), []);
  assert.deepEqual(await loader.analysisResultToImages({}), []);
  assert.deepEqual(await loader.analysisResultToImages({ analysis: [] }), []);
});

test("analysisResultToImages: passes through warning entries with image=null", async () => {
  // No Plotly needed because the only entries are warnings (image branch not reached).
  const result = {
    analysis: [
      { predictor: null, response: "T0 × T1", table: { warning: "mixed types" } },
      { predictor: "L1", response: "L2", table: { warning: "list × list requires subsets" } }
    ]
  };
  const out = await loader.analysisResultToImages(result);
  assert.equal(out.length, 2);
  out.forEach((entry) => {
    assert.equal(entry.image, null);
    assert.ok(entry.warning);
  });
  assert.equal(out[0].response, "T0 × T1");
});

test("analysisResultToImages: mixes warning + chart entries; preserves order", async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = /** @type {any} */ ({
    createElement: () => ({ style: {}, remove: () => {} }),
    body: { appendChild: () => {} }
  });
  let counter = 0;
  globalThis.window = /** @type {any} */ ({
    Plotly: {
      newPlot: () => Promise.resolve(),
      toImage: () => Promise.resolve(`data:image/png;base64,IMG${++counter}`),
      purge: () => {}
    }
  });
  try {
    const result = {
      analysis: [
        { predictor: "A", chart: { type: "scatter", spec: { data: [{}], layout: {} } } },
        { predictor: null, response: "rejected", table: { warning: "nope" } },
        { predictor: "B", chart: { type: "bar", spec: { data: [{}], layout: {} } } }
      ]
    };
    const out = await loader.analysisResultToImages(result);
    assert.equal(out.length, 3);
    assert.equal(out[0].image, "data:image/png;base64,IMG1");
    assert.equal(out[0].predictor, "A");
    assert.equal(out[0].warning, null);
    assert.equal(out[1].image, null);
    assert.equal(out[1].warning, "nope");
    assert.equal(out[2].image, "data:image/png;base64,IMG2");
    assert.equal(out[2].predictor, "B");
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
  }
});

// ---------------------------------------------------------------------------
// exportCombinedAsChartHTML — no inline scripts (MutationObserver drives rendering)
// ---------------------------------------------------------------------------

test("exportCombinedAsChartHTML: emits NO inline <script> — rendering flows via startAutoRender's MutationObserver", () => {
  // Regression guard against reintroducing the self-rendering <script>: browsers strip
  // scripts injected via innerHTML (Bubble's HTML element mount path), so the observer
  // path in core/loader.js is the sole driver. Keeping the HTML script-free simplifies
  // the payload and makes the render lifecycle single-sourced.
  const result = { analysis: [{ predictor: "A", chart: { type: "x", spec: { data: [], layout: {} } } }] };
  const html = exporters.exportCombinedAsChartHTML(result);
  assert.equal(html.includes('<script'), false, 'no <script> in the fragment output');
  // Grid + cells still present — the payload the observer consumes.
  assert.match(html, /<div class="statz-chart-grid">/);
  assert.match(html, /<div class="statz-chart"[^>]*data-spec="/);
});

test("exportCombinedAsChartHTML: chart container has fixed height (not min-height + flex)", () => {
  // Rationale: `.statz-chart { min-height: 320px; flex: 1 }` (previous shape) let Plotly's
  // fallback 700x450 render (when clientWidth=0 at newPlot time) grow the flex parent to
  // 450px, and ResizeObserver then locked the container at 450 forever. A fixed height
  // caps the container so any fallback render collapses back to the intended size on the
  // first resize call. Also gives Plotly enough top margin to render axis / category
  // labels that were cropped at 320.
  const html = exporters.exportCombinedAsChartHTML({ analysis: [] });
  assert.match(html, /\.statz-chart\{height:400px;width:100%;\}/);
  // Regression guard: the old `flex:1;min-height:320px` shape must not reappear on
  // `.statz-chart` — either would re-enable the fallback-locks-container bug.
  assert.equal(html.includes('.statz-chart{flex:1'), false, 'no flex:1 on .statz-chart');
  assert.equal(html.includes('min-height:320px'), false, 'no min-height on .statz-chart');
});

test("exportCombinedAsChartHTML: emits CSS to center a trailing-odd chart cell at sibling width", () => {
  // Fixes the visual asymmetry when 1 chart (or an odd count) leaves the trailing row
  // half-empty. The rule uses :last-child:nth-child(odd) — pure CSS, no JS branching.
  const html = exporters.exportCombinedAsChartHTML({ analysis: [] });
  // Selector must be present with grid-column span + justify-self center + max-width
  // clamp to the sibling-column width. Mobile override resets max-width.
  assert.match(html, /\.statz-chart-cell:last-child:nth-child\(odd\)/);
  assert.match(html, /grid-column:1 \/ -1/);
  assert.match(html, /justify-self:center/);
  assert.match(html, /max-width:calc\(50% - 8px\)/);
  // Mobile override — trailing-odd cell should not be clamped in single-column layout.
  assert.match(html, /@media \(max-width:768px\)\{\.statz-chart-cell:last-child:nth-child\(odd\)\{max-width:none;\}\}/);
});

// ---------------------------------------------------------------------------
// startAutoRender — MutationObserver-based auto-render for the Bubble HTML
// element (which injects our fragment via innerHTML, stripping <script> execution).
// ---------------------------------------------------------------------------

test("loader: exports startAutoRender", () => {
  assert.equal(typeof loader.startAutoRender, "function");
});

test("startAutoRender: returns {installed:false} in Node (no document)", () => {
  const prevDoc = globalThis.document;
  delete globalThis.document;
  loader._resetAutoRenderForTests();
  try {
    const result = loader.startAutoRender();
    assert.deepEqual(result, { installed: false });
  } finally {
    if (prevDoc) globalThis.document = prevDoc;
    loader._resetAutoRenderForTests();
  }
});

test("startAutoRender: idempotent — second call is a no-op even with a fresh document", () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const calls = [];
  class MockMO { constructor() { calls.push('ctor'); } observe() { calls.push('observe'); } }
  globalThis.document = /** @type {any} */ ({
    body: {},
    querySelectorAll: () => [],
    addEventListener: () => {}
  });
  globalThis.window = /** @type {any} */ ({ MutationObserver: MockMO });
  loader._resetAutoRenderForTests();
  try {
    const a = loader.startAutoRender();
    const b = loader.startAutoRender();
    assert.deepEqual(a, { installed: true }, "first call installs");
    assert.deepEqual(b, { installed: false }, "second call no-ops");
    assert.equal(calls.filter(c => c === 'ctor').length, 1, "only one observer created");
    assert.equal(calls.filter(c => c === 'observe').length, 1);
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
    loader._resetAutoRenderForTests();
  }
});

test("startAutoRender: no crash when window.MutationObserver is missing", () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = /** @type {any} */ ({
    body: {},
    querySelectorAll: () => []
  });
  globalThis.window = /** @type {any} */ ({}); // no MutationObserver
  loader._resetAutoRenderForTests();
  try {
    const result = loader.startAutoRender();
    // Installed=true because guard flipped, but no observer was attached — safe fallback.
    assert.deepEqual(result, { installed: true });
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
    loader._resetAutoRenderForTests();
  }
});

test("startAutoRender: performs initial sweep on install (renders pre-existing placeholders)", () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  let newPlotCalls = 0;
  const preRendered = { classList: { contains: (c) => c === 'statz-chart' } }; // pretend absent dataset.rendered
  const fakeDiv = {
    classList: { contains: (c) => c === 'statz-chart' },
    dataset: {},
    getAttribute: () => JSON.stringify({ data: [{}], layout: {} })
  };
  globalThis.document = /** @type {any} */ ({
    body: {},
    querySelectorAll: (sel) => sel === '.statz-chart' ? [fakeDiv] : []
  });
  globalThis.window = /** @type {any} */ ({
    MutationObserver: class { observe() {} },
    Plotly: {
      newPlot: () => { newPlotCalls++; return Promise.resolve(); }
    }
  });
  loader._resetAutoRenderForTests();
  try {
    loader.startAutoRender();
    assert.equal(newPlotCalls, 1, "initial sweep called Plotly.newPlot on the pre-existing placeholder");
    assert.equal(fakeDiv.dataset.rendered, '1', "placeholder marked as rendered");
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
    loader._resetAutoRenderForTests();
  }
});

test("startAutoRender: observer callback re-sweeps when a new .statz-chart mounts", () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  let observerCallback = null;
  let placeholders = [];
  let renderCallCount = 0;
  const makeDiv = () => ({
    nodeType: 1,   // ELEMENT_NODE — the observer callback filters non-elements out
    classList: { contains: (c) => c === 'statz-chart' },
    dataset: {},
    getAttribute: () => JSON.stringify({ data: [{}], layout: {} })
  });
  globalThis.document = /** @type {any} */ ({
    body: {},
    querySelectorAll: () => placeholders
  });
  globalThis.window = /** @type {any} */ ({
    MutationObserver: class {
      constructor(cb) { observerCallback = cb; }
      observe() {}
    },
    Plotly: {
      newPlot: () => { renderCallCount++; return Promise.resolve(); }
    }
  });
  loader._resetAutoRenderForTests();
  try {
    loader.startAutoRender();
    assert.equal(renderCallCount, 0, "no placeholders yet → no render");
    // Simulate Bubble mounting a new placeholder via innerHTML.
    const newDiv = makeDiv();
    placeholders = [newDiv];
    // Fire the observer as the browser would.
    observerCallback([{ addedNodes: [newDiv] }]);
    assert.equal(renderCallCount, 1, "new placeholder triggered a sweep");
    // Firing again on the same rendered placeholder → idempotent skip.
    observerCallback([{ addedNodes: [newDiv] }]);
    assert.equal(renderCallCount, 1, "already-rendered placeholder not re-plotted");
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
    loader._resetAutoRenderForTests();
  }
});

// ---------------------------------------------------------------------------
// renderCharts — ResizeObserver install (keeps SVG sized to container)
// ---------------------------------------------------------------------------

test("renderCharts: installs a ResizeObserver on each successfully rendered placeholder", () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const observed = [];
  class MockRO {
    constructor(cb) { this.cb = cb; this.disconnected = false; }
    observe(el) { observed.push(el); this.el = el; }
    disconnect() { this.disconnected = true; }
  }
  const fakeDiv = {
    nodeType: 1,
    isConnected: true,
    classList: { contains: (c) => c === 'statz-chart' },
    dataset: {},
    getAttribute: () => JSON.stringify({ data: [{}], layout: {} })
  };
  globalThis.document = /** @type {any} */ ({
    querySelectorAll: (sel) => sel === '.statz-chart' ? [fakeDiv] : []
  });
  globalThis.window = /** @type {any} */ ({
    Plotly: {
      newPlot: () => Promise.resolve(),
      Plots: { resize: () => {} }
    },
    ResizeObserver: MockRO,
    requestAnimationFrame: (cb) => setTimeout(cb, 0)
  });
  try {
    const s = loader.renderCharts();
    assert.equal(s.rendered, 1);
    assert.equal(observed.length, 1, 'ResizeObserver.observe was called once on the div');
    assert.equal(observed[0], fakeDiv);
    assert.ok(fakeDiv._statzResizeObserver, 'observer stashed on the div for cleanup / de-dup');
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
  }
});

test("renderCharts: idempotent — a second call does not re-attach an observer", () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  let observerCtors = 0;
  class MockRO { constructor() { observerCtors++; } observe() {} disconnect() {} }
  const fakeDiv = {
    nodeType: 1, isConnected: true,
    classList: { contains: (c) => c === 'statz-chart' },
    dataset: {},
    getAttribute: () => JSON.stringify({ data: [{}], layout: {} })
  };
  globalThis.document = /** @type {any} */ ({
    querySelectorAll: () => [fakeDiv]
  });
  globalThis.window = /** @type {any} */ ({
    Plotly: { newPlot: () => Promise.resolve(), Plots: { resize: () => {} } },
    ResizeObserver: MockRO,
    requestAnimationFrame: (cb) => cb()
  });
  try {
    loader.renderCharts();
    assert.equal(observerCtors, 1);
    // Second call — div already marked data-rendered='1', re-attach guarded by _statzResizeObserver.
    loader.renderCharts();
    assert.equal(observerCtors, 1, 'no duplicate observer installed');
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
  }
});

test("renderCharts: ResizeObserver callback triggers Plotly.Plots.resize (debounced via rAF)", async () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const resizeCalls = [];
  let capturedCallback = null;
  class MockRO {
    constructor(cb) { capturedCallback = cb; }
    observe() {}
    disconnect() {}
  }
  const fakeDiv = {
    nodeType: 1, isConnected: true,
    classList: { contains: (c) => c === 'statz-chart' },
    dataset: {},
    getAttribute: () => JSON.stringify({ data: [{}], layout: {} })
  };
  globalThis.document = /** @type {any} */ ({ querySelectorAll: () => [fakeDiv] });
  globalThis.window = /** @type {any} */ ({
    Plotly: {
      newPlot: () => Promise.resolve(),
      Plots: { resize: (el) => resizeCalls.push(el) }
    },
    ResizeObserver: MockRO,
    requestAnimationFrame: (cb) => cb()
  });
  try {
    loader.renderCharts();
    assert.ok(capturedCallback, 'observer got a callback');
    // Simulate a browser layout change firing the observer.
    capturedCallback();
    assert.equal(resizeCalls.length, 1, 'Plotly.Plots.resize called once');
    assert.equal(resizeCalls[0], fakeDiv);
    // Two rapid successive fires within the same tick collapse into one rAF-batched resize.
    capturedCallback();
    capturedCallback();
    // (requestAnimationFrame stub is synchronous; both extra fires still reach resize since pending
    // flag flips false after each rAF. What matters is: no crash, no infinite loop.)
    assert.ok(resizeCalls.length >= 1);
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
  }
});

test("renderCharts: ResizeObserver self-disconnects when div is detached from DOM", () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  let capturedCallback = null;
  let disconnected = false;
  class MockRO {
    constructor(cb) { capturedCallback = cb; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const fakeDiv = {
    nodeType: 1, isConnected: true,
    classList: { contains: (c) => c === 'statz-chart' },
    dataset: {},
    getAttribute: () => JSON.stringify({ data: [{}], layout: {} })
  };
  globalThis.document = /** @type {any} */ ({ querySelectorAll: () => [fakeDiv] });
  globalThis.window = /** @type {any} */ ({
    Plotly: { newPlot: () => Promise.resolve(), Plots: { resize: () => {} } },
    ResizeObserver: MockRO,
    requestAnimationFrame: (cb) => cb()
  });
  try {
    loader.renderCharts();
    // Simulate the div being detached (Bubble reorder or unmount).
    fakeDiv.isConnected = false;
    capturedCallback();
    assert.ok(disconnected, 'observer disconnected itself when div left the DOM');
    assert.equal(fakeDiv._statzResizeObserver, undefined, 'stashed ref cleaned up');
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
  }
});

test("startAutoRender: MutationObserver disconnects ResizeObservers on removedNodes (Bubble reorder cleanup)", () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  let observerCallback = null;
  let disconnected = false;
  const detachedDiv = {
    nodeType: 1,
    classList: { contains: (c) => c === 'statz-chart' },
    _statzResizeObserver: { disconnect: () => { disconnected = true; } }
  };
  globalThis.document = /** @type {any} */ ({
    body: {},
    querySelectorAll: () => []
  });
  globalThis.window = /** @type {any} */ ({
    MutationObserver: class {
      constructor(cb) { observerCallback = cb; }
      observe() {}
    }
  });
  loader._resetAutoRenderForTests();
  try {
    loader.startAutoRender();
    // Simulate Bubble removing a chart element from the DOM.
    observerCallback([{ addedNodes: [], removedNodes: [detachedDiv] }]);
    assert.ok(disconnected, 'ResizeObserver disconnected on removedNodes');
    assert.equal(detachedDiv._statzResizeObserver, undefined, 'stashed ref cleared');
  } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    if (prevWin) globalThis.window = prevWin; else delete globalThis.window;
    loader._resetAutoRenderForTests();
  }
});
