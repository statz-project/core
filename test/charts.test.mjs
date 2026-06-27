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
  assert.equal(entry.chart.spec.layout.yaxis.title.text, "Biomarker");
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
