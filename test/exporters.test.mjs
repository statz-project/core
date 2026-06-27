import test from "node:test";
import assert from "node:assert/strict";
import exporters from "../json/exporters.js";

// Minimal raw-values DB fixture: values are decoded as-is when col_values has no labels/codes.
const makeDb = (cols) => ({ columns: cols });
const rawCol = (col_name, values, extra = {}) => ({
  col_name,
  col_label: col_name,
  col_hash: `h_${col_name}`,
  col_type: "q",
  col_sep: "",
  col_del: false,
  col_vars: [],
  col_values: { col_compact: false, labels: null, codes: null, raw_values: values },
  ...extra
});

const baseOpts = { includeStyles: false, includeRowIndex: false };

test("exportDatabaseAsHTML: short cell content → no title attribute", () => {
  const db = makeDb([rawCol("age", ["42", "30", "55"])]);
  const html = exporters.exportDatabaseAsHTML(db, baseOpts);
  assert.match(html, /<td>42<\/td>/);
  assert.equal(html.includes("title="), false, "no title on short numeric content");
});

test("exportDatabaseAsHTML: content > threshold gets title attribute", () => {
  const long = "x".repeat(50); // > default threshold (40)
  const db = makeDb([rawCol("note", [long])]);
  const html = exporters.exportDatabaseAsHTML(db, baseOpts);
  assert.ok(html.includes(`title="${long}">${long}</td>`), "title carries full value");
});

test("exportDatabaseAsHTML: includeTitles=false suppresses title even on long content", () => {
  const long = "y".repeat(80);
  const db = makeDb([rawCol("note", [long])]);
  const html = exporters.exportDatabaseAsHTML(db, { ...baseOpts, includeTitles: false });
  assert.equal(html.includes("title="), false);
  assert.ok(html.includes(`<td>${long}</td>`));
});

test("exportDatabaseAsHTML: custom titleThreshold respected", () => {
  const short = "abcdefghij"; // 10 chars
  const db = makeDb([rawCol("code", [short])]);
  const htmlDefault = exporters.exportDatabaseAsHTML(db, baseOpts);
  assert.equal(htmlDefault.includes("title="), false, "default threshold 40 → no title");
  const htmlLow = exporters.exportDatabaseAsHTML(db, { ...baseOpts, titleThreshold: 5 });
  assert.ok(htmlLow.includes(`title="${short}"`), "threshold 5 → 10-char value gets title");
});

test('exportDatabaseAsHTML: " / < / & escaped inside title attribute', () => {
  const tricky = `He said "x<y & z" — ` + "z".repeat(30); // > 40, contains all special chars
  const db = makeDb([rawCol("quote", [tricky])]);
  const html = exporters.exportDatabaseAsHTML(db, baseOpts);
  const titleMatch = html.match(/title="([^"]*)"/);
  assert.ok(titleMatch, "title present");
  assert.ok(titleMatch[1].includes("&quot;"), `" → &quot;`);
  assert.ok(titleMatch[1].includes("&lt;"), "< → &lt;");
  assert.ok(titleMatch[1].includes("&amp;"), "& → &amp;");
  // Cell text node: < and & must be escaped; " is fine raw in HTML text content.
  const tdContent = html.match(/<td[^>]*>([^<]*(?:<(?!\/td>)[^<]*)*)<\/td>/)[1];
  assert.equal(tdContent.includes("<"), false, "raw < not allowed in text node");
  assert.ok(tdContent.includes("&lt;"), "< → &lt; in text node");
  assert.ok(tdContent.includes("&amp;"), "& → &amp; in text node");
});

test("exportDatabaseAsHTML: long col_label produces title on <th>", () => {
  const longLabel = "Description of clinical note ".repeat(2); // 58 chars
  const db = makeDb([{
    col_name: "note", col_label: longLabel, col_hash: "h_note",
    col_type: "q", col_sep: "", col_del: false, col_vars: [],
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a"] }
  }]);
  const html = exporters.exportDatabaseAsHTML(db, baseOpts);
  assert.ok(html.includes(`<th title="${longLabel}"`), "th carries title with raw label");
});

// ---------------------------------------------------------------------------
// combineAnalysisAsSingleTable / exportCombinedAsHTML — Phase 2-4 shapes
// ---------------------------------------------------------------------------

import contingency from "../json/contingency.js";

// Build a minimal "analysis" entry — mirrors the shape driver.js emits.
const entry = (predictor, response, predictor_type, response_type, table) => ({
  predictor, response, predictor_type, response_type, table
});

test("combine: warning entry does not throw and is preserved", () => {
  const result = { analysis: [
    entry(null, "T0 × T1", null, "q", { warning: "Paired analysis requires responses of the same type" })
  ]};
  const combined = exporters.combineAnalysisAsSingleTable(result);
  // header row + warning row
  assert.equal(combined.rows.length, 2);
  assert.match(combined.rows[0][combined.columns[0]], /<b>T0 × T1<\/b>/);
  assert.equal(combined.rows[1]._warning_text, "Paired analysis requires responses of the same type");
});

test("exportCombinedAsHTML: warning row renders with amber + ⚠ + full colspan", () => {
  const result = { analysis: [
    entry(null, "Sex", null, "q", { warning: "List × list requires subsets" })
  ]};
  const combined = exporters.combineAnalysisAsSingleTable(result);
  const html = exporters.exportCombinedAsHTML(combined, "Test", false);
  assert.match(html, /⚠ List × list requires subsets/);
  assert.match(html, /colspan="\d+"[^>]*background:#fff8e1/);
});

test("combine: null predictor falls back to response in header label", () => {
  const result = { analysis: [
    entry(null, "T0 × T1", null, "n", {
      columns: ["Statistic", "T0", "T1", "p-value"],
      rows: [{ Statistic: "Mean", T0: "1.0", T1: "2.0", "p-value": "" }],
      test_used: "Paired t-test", p_value: 0.05
    })
  ]};
  const combined = exporters.combineAnalysisAsSingleTable(result);
  const header = combined.rows[0];
  // First column (Group/Variable) carries the bold label
  assert.match(header[combined.columns[0]], /<b>T0 × T1<\/b>/);
});

test("isWarningRow: detects rows with _warning_text", () => {
  assert.equal(exporters.isWarningRow({ _warning_text: "x" }), true);
  assert.equal(exporters.isWarningRow({ _warning_text: "" }), false);
  assert.equal(exporters.isWarningRow({}), false);
  assert.equal(exporters.isWarningRow(null), false);
});

test("summarize_q_q 2×2: adds Odds Ratio + 95% CI columns; row 0 = Ref", () => {
  // Predictor: exposure (yes/no); response: outcome (sick/well). 2×2 setup.
  const pred = ["yes","yes","yes","yes","no","no","no","no","yes","no"];
  const resp = ["sick","sick","sick","well","well","well","well","well","sick","sick"];
  const t = contingency.summarize_q_q(pred, resp, undefined, { lang: "en_us" });
  // Default options: effect_size_type unset → OR. Columns include Odds Ratio + 95% CI.
  assert.ok(t.columns.includes("Odds Ratio"), `columns: ${t.columns.join(", ")}`);
  assert.ok(t.columns.includes("95% CI"));
  // Row order is alphabetical: "no" first, then "yes"
  const refRow = t.rows[0];
  assert.equal(refRow["Odds Ratio"], "Ref");
  assert.equal(refRow["95% CI"], "");
  const valRow = t.rows[1];
  assert.match(valRow["Odds Ratio"], /^\d+\.\d{2}$/, `OR value: ${valRow["Odds Ratio"]}`);
  assert.match(valRow["95% CI"], /^\d+\.\d{2}–\d+\.\d{2}$/);
});

test("summarize_q_q 2×2: effect_size_type='risk_ratio' switches column name", () => {
  const pred = ["yes","yes","yes","no","no","no","yes","no","yes","no"];
  const resp = ["sick","sick","well","well","well","sick","well","sick","sick","well"];
  const t = contingency.summarize_q_q(pred, resp, undefined, { lang: "en_us", effect_size_type: "risk_ratio" });
  assert.ok(t.columns.includes("Risk Ratio"), `columns: ${t.columns.join(", ")}`);
  assert.ok(!t.columns.includes("Odds Ratio"));
  assert.equal(t.rows[0]["Risk Ratio"], "Ref");
});

test("summarize_q_q 3×2: no effect_size columns added", () => {
  const pred = ["a","a","b","b","c","c","a","b","c","a"];
  const resp = ["yes","no","yes","yes","no","no","yes","no","yes","no"];
  const t = contingency.summarize_q_q(pred, resp, undefined, { lang: "en_us" });
  assert.equal(t.columns.includes("Odds Ratio"), false);
  assert.equal(t.columns.includes("95% CI"), false);
});
