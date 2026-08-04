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

test("exportDatabaseAsHTML: maxRows=0 means every row; blank still means the default", () => {
  const db = makeDb([rawCol("x", Array.from({ length: 500 }, (_, i) => `v${i}`))]);
  const bodyRows = (opts) => (exporters.exportDatabaseAsHTML(db, { ...baseOpts, ...opts }).match(/<tr/g) || []).length - 1;
  assert.equal(bodyRows({}), 200, "default cap");
  assert.equal(bodyRows({ maxRows: 0 }), 500, "explicit 0 = no limit");
  assert.equal(bodyRows({ maxRows: "0" }), 500, "string 0 too — the UI sends strings");
  assert.equal(bodyRows({ maxRows: Infinity }), 500, "Infinity means the same thing");
  assert.equal(bodyRows({ maxRows: 50 }), 50, "a positive cap still caps");
  // Number('') and Number(null) are both 0, so these must be rejected BEFORE the 0 check or an
  // empty UI field would silently switch the viewer from 200 rows to all of them.
  ["", "   ", null, undefined, "abc", -1].forEach(raw => {
    assert.equal(bodyRows({ maxRows: raw }), 200, `${JSON.stringify(raw)} falls back to the default`);
  });
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
  const t = contingency.summarize_q_q(pred, resp, undefined, { lang: "en_us", with_effect_sizes: true });
  // Opted in; effect_size_type unset → OR. Columns include Odds Ratio + 95% CI.
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
  const t = contingency.summarize_q_q(pred, resp, undefined, { lang: "en_us", with_effect_sizes: true, effect_size_type: "risk_ratio" });
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

// ---------------------------------------------------------------------------
// buildMissingMap / exportMissingMapAsHTML — the PlotMiss analog
// ---------------------------------------------------------------------------

// Build a values array of `n` entries where the indices in `missingAt` (0-based) are null.
const withMissing = (n, missingAt) => Array.from({ length: n }, (_, i) => (missingAt.includes(i) ? null : `v${i}`));

test("buildMissingMap: unusable payloads return null", () => {
  assert.equal(exporters.buildMissingMap(null), null);
  assert.equal(exporters.buildMissingMap({}), null);
  assert.equal(exporters.buildMissingMap({ columns: [] }), null);
  // Columns exist but decode to zero observations → no raster to draw.
  assert.equal(exporters.buildMissingMap(makeDb([rawCol("a", [])])), null);
});

test("buildMissingMap: null / '' / blank are missing; '0' and 'false' are present", () => {
  const db = makeDb([rawCol("x", [null, "", "   ", "0", "false"])]);
  const map = exporters.buildMissingMap(db);
  assert.equal(map.nRows, 5);
  assert.equal(map.columns[0].nMissing, 3);
  assert.equal(map.columns[0].pctMissing, 60);
});

test("buildMissingMap: short column is padded and the padding counts as missing", () => {
  const db = makeDb([rawCol("long", ["a", "b", "c", "d"]), rawCol("short", ["a", "b"])]);
  const map = exporters.buildMissingMap(db);
  assert.equal(map.nRows, 4);
  assert.equal(map.columns[0].nMissing, 0);
  assert.equal(map.columns[1].nMissing, 2, "2 padded rows count as missing");
  assert.equal(map.columns[1].pctMissing, 50, "denominator is nRows");
});

test("buildMissingMap: compact q code 0 is missing", () => {
  const db = makeDb([rawCol("sex", null, {
    col_values: { col_compact: true, labels: ["male", "female"], codes: [1, 0, 2, 0, 1], raw_values: null }
  })]);
  const map = exporters.buildMissingMap(db);
  assert.equal(map.columns[0].nMissing, 2);
});

test("buildMissingMap: compact l empty code string is missing", () => {
  const db = makeDb([rawCol("items", null, {
    col_type: "l", col_sep: ";",
    col_values: { col_compact: true, labels: ["a", "b"], codes: ["1;2", "", "1"], raw_values: null }
  })]);
  const map = exporters.buildMissingMap(db);
  assert.equal(map.columns[0].nMissing, 1);
});

test("buildMissingMap: separator-only l value is missing", () => {
  const db = makeDb([rawCol("items", [";", "a;b", "  ;  "], { col_type: "l", col_sep: ";" })]);
  const map = exporters.buildMissingMap(db);
  assert.equal(map.columns[0].nMissing, 2);
});

test("buildMissingMap: excluded_values become missing", () => {
  const db = makeDb([rawCol("x", ["a", "b", "c", "b"], { meta: { replacements: [], processing: { excluded_values: ["b"] } } })]);
  const map = exporters.buildMissingMap(db);
  assert.equal(map.columns[0].nMissing, 2);
});

test("buildMissingMap: applyProcessing=false leaves excluded_values present", () => {
  const db = makeDb([rawCol("x", ["a", "b", "c", "b"], { meta: { replacements: [], processing: { excluded_values: ["b"] } } })]);
  const map = exporters.buildMissingMap(db, { applyProcessing: false });
  assert.equal(map.columns[0].nMissing, 0);
});

test("buildMissingMap: na_action='label' turns NAs into a real category, so nothing is missing", () => {
  // The map reports the FINAL data, the same view runAnalysis works on: the user chose to make
  // those rows a category, so there is no missing data left to report.
  const db = makeDb([rawCol("x", ["a", null, "b", null], {
    meta: { replacements: [], processing: { na_action: "label", na_label: "Não informado" } }
  })]);
  assert.equal(exporters.buildMissingMap(db).columns[0].nMissing, 0);
  // applyProcessing:false is the escape hatch for inspecting the original, unedited import.
  assert.equal(exporters.buildMissingMap(db, { applyProcessing: false }).columns[0].nMissing, 2);
});

test("buildMissingMap: meta.replacements are applied before counting", () => {
  // Replacing a value with the empty string is how the user marks it as missing.
  const db = makeDb([rawCol("x", ["a", "unknown", "b"], {
    meta: { replacements: [{ from: "unknown", to: "" }], processing: {} }
  })]);
  assert.equal(exporters.buildMissingMap(db).columns[0].nMissing, 1);
  assert.equal(exporters.buildMissingMap(db, { applyProcessing: false }).columns[0].nMissing, 0);
});

test("buildMissingMap: deleted columns hidden by default, included with showDeletedColumns", () => {
  const db = makeDb([rawCol("kept", ["a"]), rawCol("gone", [null], { col_del: true })]);
  assert.equal(exporters.buildMissingMap(db).columns.length, 1);
  const withDeleted = exporters.buildMissingMap(db, { showDeletedColumns: true });
  assert.equal(withDeleted.columns.length, 2);
  assert.equal(withDeleted.columns[1].isDeleted, true);
});

test("buildMissingMap: a bare pointer variant is skipped as a duplicate of its base column", () => {
  // addVariant seeds col_vars[0] as a pointer with the column's own label, so rendering it would
  // repeat the base column verbatim.
  const db = makeDb([rawCol("x", ["a", null, "c"], { col_vars: [{ var_label: "x", meta: { kind: "original" } }] })]);
  const map = exporters.buildMissingMap(db);
  assert.equal(map.columns.length, 1, "only the base column");
  assert.equal(map.columns[0].isVariant, false);
});

test("buildMissingMap: derived variants are still listed and follow showVariants", () => {
  const db = makeDb([rawCol("x", ["a", null, "c"], {
    col_vars: [
      { var_label: "x", meta: { kind: "original" } },
      { var_label: "V1", col_type: "q", col_sep: "", meta: {}, col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a", null, null] } }
    ]
  })]);
  const map = exporters.buildMissingMap(db);
  assert.equal(map.columns.length, 2, "base column + the derived variant");
  assert.equal(map.columns[1].isVariant, true);
  assert.equal(map.columns[1].rawLabel, "V1");
  assert.equal(map.columns[1].nMissing, 2, "its own values, not the parent's");
  assert.equal(exporters.buildMissingMap(db, { showVariants: false }).columns.length, 1);
});

test("buildMissingMap: binning reduces resolution without losing observations", () => {
  const db = makeDb([rawCol("x", withMissing(1000, [0, 5, 500, 999]))]);
  const map = exporters.buildMissingMap(db, { maxBins: 100 });
  assert.equal(map.nRows, 1000);
  assert.equal(map.binWidth, 10);
  assert.equal(map.nBins, 100);
  assert.equal(map.columns[0].bins.length, 100);
  assert.equal(map.columns[0].bins.reduce((a, b) => a + b, 0), map.columns[0].nMissing);
  assert.equal(map.columns[0].nMissing, 4, "no observation is dropped");
});

test("buildMissingMap: nRows <= maxBins keeps a 1:1 raster", () => {
  const db = makeDb([rawCol("x", withMissing(50, [3]))]);
  const map = exporters.buildMissingMap(db);
  assert.equal(map.binWidth, 1);
  assert.equal(map.nBins, 50);
});

test("buildMissingMap: maxBins=0 means one bin per observation; blank keeps the default", () => {
  const db = makeDb([rawCol("x", withMissing(1000, [10]))]);
  const at = (raw) => exporters.buildMissingMap(db, raw === "omit" ? {} : { maxBins: raw });
  assert.equal(at("omit").binWidth, 4, "default 300 → ceil(1000/300)");
  const full = at(0);
  assert.equal(full.binWidth, 1, "explicit 0 = full resolution");
  assert.equal(full.nBins, 1000);
  assert.equal(at("0").binWidth, 1, "string 0 too");
  assert.equal(at(Infinity).binWidth, 1);
  ["", "   ", null, "abc", -5].forEach(raw => {
    assert.equal(at(raw).binWidth, 4, `${JSON.stringify(raw)} falls back to the default`);
  });
});

test("buildMissingMap: ticks start at 1, end at nRows, ascend, and stay inside the strip", () => {
  const map = exporters.buildMissingMap(makeDb([rawCol("x", withMissing(200, [10]))]));
  const ticks = map.ticks;
  assert.equal(ticks[0].index, 1);
  assert.equal(ticks[ticks.length - 1].index, 200);
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i].index > ticks[i - 1].index, "strictly ascending");
  ticks.forEach(t => { assert.ok(t.pct >= 0 && t.pct < 100, `pct in range: ${t.pct}`); });
});

test("buildMissingMap: a single observation does not throw", () => {
  const map = exporters.buildMissingMap(makeDb([rawCol("x", [null])]));
  assert.equal(map.nRows, 1);
  assert.equal(map.nBins, 1);
  assert.equal(map.ticks.length, 1);
  assert.equal(map.ticks[0].index, 1);
});

test("buildMissingMap: columns keep their natural database order", () => {
  const db = makeDb([
    rawCol("few", withMissing(10, [0])),
    rawCol("many", withMissing(10, [0, 1, 2, 3])),
    rawCol("some", withMissing(10, [0, 1]))
  ]);
  assert.deepEqual(exporters.buildMissingMap(db).columns.map(c => c.rawLabel), ["few", "many", "some"]);
});

test("exportMissingMapAsHTML: unusable payload returns ''", () => {
  assert.equal(exporters.exportMissingMapAsHTML(null), "");
  assert.equal(exporters.exportMissingMapAsHTML({ columns: [] }), "");
});

test("exportMissingMapAsHTML: title lands in <caption> and is escaped", () => {
  const db = makeDb([rawCol("x", withMissing(4, [1]))]);
  const html = exporters.exportMissingMapAsHTML(db, { title: "Cohort <script>x</script> & co" });
  assert.match(html, /<caption>Cohort &lt;script&gt;x&lt;\/script&gt; &amp; co<\/caption>/);
  assert.equal(html.includes("<script"), false, "no script tag survives");
});

test("exportMissingMapAsHTML: no title → no <caption> and no default", () => {
  // Same contract as exportDatabaseAsHTML: the helper never invents a title, so the host page
  // is free to show the database name elsewhere.
  const db = makeDb([rawCol("x", withMissing(4, [1]))]);
  [undefined, "", "   "].forEach(title => {
    const html = exporters.exportMissingMapAsHTML(db, { title, includeStyles: false, lang: "pt_br" });
    assert.equal(html.includes("<caption"), false, `no caption for ${JSON.stringify(title)}`);
    assert.equal(html.includes("Tabela"), false, "no fallback to the generic table.title");
    assert.match(html, /<table class="statz-missmap"><colgroup>/, "table opens straight into colgroup");
  });
  assert.equal(exporters.buildMissingMap(db).title, null);
  assert.equal(exporters.buildMissingMap(db, { title: "Cohort" }).title, "Cohort");
});

test("exportMissingMapAsHTML: includeStyles gates exactly one <style> block", () => {
  const db = makeDb([rawCol("x", withMissing(4, [1]))]);
  const styled = exporters.exportMissingMapAsHTML(db, {});
  assert.equal(styled.split("<style>").length - 1, 1);
  const bare = exporters.exportMissingMapAsHTML(db, { includeStyles: false });
  assert.equal(bare.includes("<style>"), false);
  assert.match(bare, /<div class="statz-missmap-wrap">/, "wrapper survives so page-level CSS applies");
});

test("exportMissingMapAsHTML: every strip's flex weights sum to nRows", () => {
  // The alignment invariant — the axis percentages are only meaningful if this holds.
  const db = makeDb([
    rawCol("a", withMissing(97, [0, 4, 5, 96])),
    rawCol("b", withMissing(97, [50])),
    rawCol("c", withMissing(97, []))
  ]);
  const html = exporters.exportMissingMapAsHTML(db, { includeStyles: false });
  const strips = html.match(/<div class="statz-missmap-strip">.*?<\/div>/g);
  assert.equal(strips.length, 3);
  strips.forEach(strip => {
    const weights = [...strip.matchAll(/flex:(\d+)/g)].map(m => Number(m[1]));
    if (weights.length === 0) return; // zero-missing column emits an empty strip
    assert.equal(weights.reduce((a, b) => a + b, 0), 97, `strip sums to nRows: ${strip}`);
  });
});

test("exportMissingMapAsHTML: runs are collapsed, not emitted per observation", () => {
  const db = makeDb([rawCol("x", withMissing(200, [99, 100]))]);
  const html = exporters.exportMissingMapAsHTML(db, { includeStyles: false });
  const strip = html.match(/<div class="statz-missmap-strip">.*?<\/div>/)[0];
  assert.equal((strip.match(/<span/g) || []).length, 3, "present / missing / present");
  assert.equal((strip.match(/statz-missmap-m/g) || []).length, 1, "one run, not two cells");
});

test("exportMissingMapAsHTML: a column with no missing values emits an empty strip", () => {
  const db = makeDb([rawCol("x", ["a", "b", "c"])]);
  const html = exporters.exportMissingMapAsHTML(db, { includeStyles: false });
  assert.ok(html.includes('<div class="statz-missmap-strip"></div>'));
});

test("exportMissingMapAsHTML: marks carry no styling beyond their flex weight", () => {
  // Deliberately flat: a bin is marked when ANY observation in it is missing, so nothing can
  // vanish at low resolution and the emitted string stays as small as possible.
  const binned = exporters.exportMissingMapAsHTML(makeDb([rawCol("x", withMissing(1000, [10]))]), { includeStyles: false, maxBins: 100 });
  assert.equal(binned.includes("opacity"), false);
  assert.match(binned, /<span class="statz-missmap-m" style="flex:10"/);
});

test("exportMissingMapAsHTML: a run of equally-stated bins collapses regardless of density", () => {
  // 5000 obs, every 3rd missing → binWidth 17, every bin has ≥1 missing → ONE span, not 300.
  const db = makeDb([rawCol("x", withMissing(5000, Array.from({ length: 1667 }, (_, k) => k * 3)))]);
  const html = exporters.exportMissingMapAsHTML(db, { includeStyles: false });
  const strip = html.match(/<div class="statz-missmap-strip">.*?<\/div>/)[0];
  assert.equal((strip.match(/<span/g) || []).length, 1);
  assert.match(strip, /flex:5000/);
});

test("exportMissingMapAsHTML: name cell carries the full label as a title", () => {
  const longLabel = "Systolic blood pressure measured at baseline visit";
  const db = makeDb([rawCol("sbp", withMissing(4, [1]), { col_label: longLabel })]);
  const html = exporters.exportMissingMapAsHTML(db, { includeStyles: false });
  assert.ok(html.includes(`<div class="statz-missmap-name" title="${longLabel}">${longLabel}</div>`));
});

test("exportMissingMapAsHTML: run titles are short when fully missing, detailed when partial", () => {
  // Fully-missing run: count and percentage are implied by the range, so they are omitted.
  const exact = exporters.exportMissingMapAsHTML(makeDb([rawCol("x", withMissing(50, [10, 11, 12]))]), { includeStyles: false, lang: "en_us" });
  assert.match(exact, /title="Missing: obs 11–13"/);
  // Partial bin: the reader cannot infer how many of the grouped observations are missing.
  const binned = exporters.exportMissingMapAsHTML(makeDb([rawCol("x", withMissing(1000, [10]))]), { includeStyles: false, lang: "en_us", maxBins: 100 });
  assert.match(binned, /title="obs 11–20: 1 missing \(10\.0%\)"/);
});

test("exportMissingMapAsHTML: includeTitles=false removes every title attribute", () => {
  const db = makeDb([rawCol("x", withMissing(4, [1]))]);
  const html = exporters.exportMissingMapAsHTML(db, { includeStyles: false, includeTitles: false });
  assert.equal(html.includes("title="), false);
});

test("exportMissingMapAsHTML: deleted and variant names get their own classes", () => {
  const db = makeDb([
    rawCol("gone", withMissing(4, [1]), { col_del: true }),
    rawCol("kept", withMissing(4, [1]), {
      col_vars: [{ var_label: "V1", col_type: "q", col_sep: "", meta: {}, col_values: { col_compact: false, labels: null, codes: null, raw_values: ["a", "b", "c", "d"] } }]
    })
  ]);
  const html = exporters.exportMissingMapAsHTML(db, { includeStyles: false, showDeletedColumns: true });
  assert.match(html, /statz-missmap-name statz-missmap-name--del/);
  assert.match(html, /statz-missmap-name statz-missmap-name--var/);
});

test("exportMissingMapAsHTML: showPercent controls the count column", () => {
  const db = makeDb([rawCol("x", withMissing(4, [1]))]);
  const withPct = exporters.exportMissingMapAsHTML(db, { includeStyles: false, lang: "pt_br" });
  assert.match(withPct, /<td class="statz-missmap-num">1 \(25,0%\)<\/td>/);
  const bare = exporters.exportMissingMapAsHTML(db, { includeStyles: false, showPercent: false });
  assert.match(bare, /<td class="statz-missmap-num">1<\/td>/);
});

test("exportMissingMapAsHTML: a database with no missing data renders an all-clear grid", () => {
  const db = makeDb([rawCol("a", ["1", "2"]), rawCol("b", ["x", "y"])]);
  const html = exporters.exportMissingMapAsHTML(db, { includeStyles: false, lang: "en_us" });
  assert.equal(html.includes("statz-missmap-m"), false, "no marks anywhere");
  assert.equal((html.match(/<div class="statz-missmap-strip"><\/div>/g) || []).length, 2);
  assert.match(html, /<td class="statz-missmap-num">0 \(0\.0%\)<\/td>/);
});

test("exportMissingMapAsHTML: nameWidth is emitted inline so it survives includeStyles=false", () => {
  const db = makeDb([rawCol("x", withMissing(4, [1]))]);
  assert.match(exporters.exportMissingMapAsHTML(db, { includeStyles: false }), /<col class="statz-missmap-cname" style="width:180px">/);
  assert.match(exporters.exportMissingMapAsHTML(db, { includeStyles: false, nameWidth: 240 }), /style="width:240px"/);
});

test("exportMissingMapAsHTML: axis clamps its first and last labels exactly once each", () => {
  const db = makeDb([rawCol("x", withMissing(200, [10]))]);
  const html = exporters.exportMissingMapAsHTML(db, { includeStyles: false });
  assert.equal((html.match(/statz-missmap-t0/g) || []).length, 1);
  assert.equal((html.match(/statz-missmap-t1/g) || []).length, 1);
  assert.match(html, /<span class="statz-missmap-t0">1<\/span>/);
  assert.match(html, /<span class="statz-missmap-t1">200<\/span>/);
});

const cellsOf = (html) => (html.match(/<td[^>]*>([^<]*)<\/td>/g) || []).map(s => s.replace(/<[^>]*>/g, ""));
const headersOf = (html) => (html.match(/<th[^>]*>([^<]*)<\/th>/g) || []).map(s => s.replace(/<[^>]*>/g, ""));

test("exportDatabaseAsHTML: a bare pointer variant is not rendered beside its base column", () => {
  // addVariant seeds col_vars[0] as a pointer labelled with the COLUMN's label, so rendering it
  // produced two identically-named columns holding identical values.
  const db = makeDb([rawCol("sexo", ["m", "f"], {
    col_vars: [
      { var_label: "sexo", meta: { kind: "original" } },
      { var_label: "Sexo (M/F)", col_type: "q", col_sep: "", meta: {}, col_values: { col_compact: false, labels: null, codes: null, raw_values: ["M", "F"] } }
    ]
  })]);
  const html = exporters.exportDatabaseAsHTML(db, { includeStyles: false, includeRowIndex: false });
  assert.deepEqual(headersOf(html), ["sexo", "Sexo (M/F)"], "no duplicated header");
  assert.deepEqual(cellsOf(html), ["m", "M", "f", "F"]);
});

test("exportDatabaseAsHTML: a pointer variant carrying its own processing IS kept", () => {
  // It inherits the column's replacements but adds rules on top, so its values really differ.
  const db = makeDb([rawCol("x", ["a", "b"], {
    meta: { replacements: [{ from: "a", to: "KEEP" }], processing: {} },
    col_vars: [{ var_label: "Sem b", meta: { kind: "original", processing: { excluded_values: ["b"] } } }]
  })]);
  const html = exporters.exportDatabaseAsHTML(db, { includeStyles: false, includeRowIndex: false });
  assert.deepEqual(headersOf(html), ["x", "Sem b"]);
  // Base: a→KEEP, b. Variant: same replacement, then 'b' excluded to empty.
  assert.deepEqual(cellsOf(html), ["KEEP", "KEEP", "b", ""]);
});

test("exportDatabaseAsHTML: a derived variant is NOT re-resolved through its parent's meta", () => {
  // Its col_values were produced from the resolved source, so applying the column's replacements
  // again would corrupt them.
  const db = makeDb([rawCol("x", ["a", "b"], {
    meta: { replacements: [{ from: "a", to: "b" }, { from: "b", to: "c" }], processing: {} },
    col_vars: [
      { var_label: "x", meta: { kind: "original" } },
      { var_label: "V1", col_type: "q", col_sep: "", meta: { kind: "search_replace" }, col_values: { col_compact: false, labels: null, codes: null, raw_values: ["b", "Z"] } }
    ]
  })]);
  const html = exporters.exportDatabaseAsHTML(db, { includeStyles: false, includeRowIndex: false });
  // Row 1: base 'a'→'b', derived variant stored 'b' (not re-mapped to 'c'). Row 2: 'b'→'c', 'Z'.
  assert.deepEqual(cellsOf(html), ["b", "b", "c", "Z"]);
});

// ---------------------------------------------------------------------------
// buildCrosstab / exportCrosstabAsHTML — the xtabs analog
// ---------------------------------------------------------------------------

import { translate } from "../i18n/index.js";

// sexo/faixa share 6 complete pairs; 2 records are missing on one side.
const xtabDb = () => makeDb([
  rawCol("sexo", ["M", "F", "M", "F", "F", "M", null, "F"]),
  rawCol("faixa", ["18-30", "31-50", "18-30", "51+", "31-50", "51+", "18-30", null]),
  rawCol("idade", ["10", "2", "100", "2", "10", "2", "9", "10"], { col_type: "n" }),
  rawCol("sintomas", ["ansi;depr", "ansi", "depr", "ansi;depr", "", "depr;ansi", "ansi", "depr"], { col_type: "l", col_sep: ";" })
]);

// Row/column level → count, for readable assertions.
const cellOf = (ct, rowLevel, colLevel) => ct.counts[ct.row.levels.indexOf(rowLevel)][ct.col.levels.indexOf(colLevel)];
// buildCrosstab returns cells only, so the tests sum them where a total is the point.
const sumCells = (ct) => ct.counts.reduce((total, row) => total + row.reduce((a, b) => a + b, 0), 0);
const rowSums = (ct) => ct.counts.map(row => row.reduce((a, b) => a + b, 0));
const colSums = (ct) => ct.col.levels.map((_, ci) => ct.counts.reduce((total, row) => total + row[ci], 0));

test("buildCrosstab: unusable payloads return null", () => {
  assert.equal(exporters.buildCrosstab(null, "h_sexo", "", "h_faixa", ""), null);
  assert.equal(exporters.buildCrosstab({ columns: [] }, "h_sexo", "", "h_faixa", ""), null);
  assert.equal(exporters.buildCrosstab(xtabDb(), "nope", "", "h_faixa", ""), null, "unknown row hash");
  assert.equal(exporters.buildCrosstab(xtabDb(), "h_sexo", "", "nope", ""), null, "unknown col hash");
});

test("buildCrosstab: q×q counts and margins match a hand-computed table", () => {
  const ct = exporters.buildCrosstab(xtabDb(), "h_faixa", "", "h_sexo", "");
  assert.deepEqual(ct.row.levels, ["18-30", "31-50", "51+"]);
  assert.deepEqual(ct.col.levels, ["F", "M"]);
  assert.deepEqual(ct.counts, [[0, 2], [2, 0], [1, 1]]);
  assert.deepEqual(rowSums(ct), [2, 2, 2]);
  assert.deepEqual(colSums(ct), [3, 3]);
  assert.equal(sumCells(ct), 6);
  assert.equal(ct.isMultiResponse, false);
  assert.equal(sumCells(ct), ct.nCompared, "no l axis → the cells sum to the record count");
});

test("buildCrosstab: complete-case deletion; nCompared + nExcluded === nRows", () => {
  const ct = exporters.buildCrosstab(xtabDb(), "h_faixa", "", "h_sexo", "");
  assert.equal(ct.nRows, 8);
  assert.equal(ct.nCompared, 6);
  assert.equal(ct.nExcluded, 2);
  assert.equal(ct.nCompared + ct.nExcluded, ct.nRows);
});

test("buildCrosstab: a short column is padded and every padded pair is excluded", () => {
  const db = makeDb([rawCol("long", ["a", "b", "a", "b"]), rawCol("short", ["x", "y"])]);
  const ct = exporters.buildCrosstab(db, "h_long", "", "h_short", "");
  assert.equal(ct.nRows, 4);
  assert.equal(ct.nCompared, 2);
  assert.equal(ct.nExcluded, 2);
});

test("buildCrosstab: q levels follow col_values.labels, unused level is a zero row", () => {
  // Compact column declaring a level that never occurs — factor() keeps it, so we do too.
  const db = makeDb([
    rawCol("grp", null, { col_values: { col_compact: true, labels: ["low", "mid", "high"], codes: [1, 1, 3, 3], raw_values: null } }),
    rawCol("out", ["yes", "no", "yes", "no"])
  ]);
  const ct = exporters.buildCrosstab(db, "h_grp", "", "h_out", "");
  assert.deepEqual(ct.row.levels, ["low", "mid", "high"], "declared factor order, not alphabetical");
  assert.deepEqual(ct.counts[ct.row.levels.indexOf("mid")], [0, 0], "unused level → zero row");
});

test("buildCrosstab: q non-compact levels are sorted alphabetically, not first-appearance", () => {
  // Guards the getIndividualItems({order:'levels'}) fall-through, which returns unsorted keys
  // when the column is not factor-compacted — exactly the shape of the rawCol fixture.
  const db = makeDb([rawCol("g", ["zebra", "alpha", "mid", "alpha"]), rawCol("o", ["1", "1", "1", "1"])]);
  const ct = exporters.buildCrosstab(db, "h_g", "", "h_o", "");
  assert.deepEqual(ct.row.levels, ["alpha", "mid", "zebra"]);
});

test("buildCrosstab: untrimmed declared labels match their counting keys", () => {
  // A label carrying whitespace must not produce a phantom zero row alongside its trimmed key.
  const db = makeDb([
    rawCol("g", null, { col_values: { col_compact: true, labels: [" x", "y "], codes: [1, 2, 1], raw_values: null } }),
    rawCol("o", ["1", "1", "1"])
  ]);
  const ct = exporters.buildCrosstab(db, "h_g", "", "h_o", "");
  assert.deepEqual(ct.row.levels, ["x", "y"]);
  assert.equal(cellOf(ct, "x", "1"), 2);
  assert.equal(sumCells(ct), 3, "nothing lost to a key/level mismatch");
});

test("buildCrosstab: n levels sort numerically, not lexically", () => {
  const ct = exporters.buildCrosstab(xtabDb(), "h_idade", "", "h_sexo", "");
  assert.deepEqual(ct.row.levels, ["2", "10", "100"], "R's factor() sorts by value");
});

test("buildCrosstab: unparseable n level sorts last; 1 and 1.0 stay distinct", () => {
  const db = makeDb([rawCol("v", ["10", "1.0", "n/a", "1", "2"], { col_type: "n" }), rawCol("o", ["a", "a", "a", "a", "a"])]);
  const ct = exporters.buildCrosstab(db, "h_v", "", "h_o", "");
  assert.deepEqual(ct.row.levels, ["1", "1.0", "2", "10", "n/a"]);
});

test("buildCrosstab: a numeric 0 survives as a level", () => {
  // getIndividualItems filters with .filter(Boolean), which would drop a real 0 from the levels
  // while it still got counted — a level/key mismatch. Levels are derived in the counting pass.
  const db = makeDb([rawCol("v", [0, 1, 0, 2], { col_type: "n" }), rawCol("o", ["a", "a", "a", "a"])]);
  const ct = exporters.buildCrosstab(db, "h_v", "", "h_o", "");
  assert.deepEqual(ct.row.levels, ["0", "1", "2"]);
  assert.equal(cellOf(ct, "0", "a"), 2);
  assert.equal(sumCells(ct), 4, "nothing lost");
});

test("buildCrosstab: compact q code 0 counts as missing", () => {
  const db = makeDb([
    rawCol("g", null, { col_values: { col_compact: true, labels: ["a", "b"], codes: [1, 0, 2, 0], raw_values: null } }),
    rawCol("o", ["x", "x", "x", "x"])
  ]);
  const ct = exporters.buildCrosstab(db, "h_g", "", "h_o", "");
  assert.equal(ct.nExcluded, 2);
  assert.equal(sumCells(ct), 2);
});

test("buildCrosstab: l×q counts presence once per record, even for a repeated item", () => {
  const db = makeDb([rawCol("it", ["a;a", "a;b", "b"], { col_type: "l", col_sep: ";" }), rawCol("o", ["x", "x", "x"])]);
  const ct = exporters.buildCrosstab(db, "h_it", "", "h_o", "");
  assert.equal(cellOf(ct, "a", "x"), 2, "'a;a' increments once, plus 'a;b'");
  assert.equal(cellOf(ct, "b", "x"), 2);
});

test("buildCrosstab: separator-only l value excludes the record", () => {
  const db = makeDb([rawCol("it", [";", "a", " ; "], { col_type: "l", col_sep: ";" }), rawCol("o", ["x", "x", "x"])]);
  const ct = exporters.buildCrosstab(db, "h_it", "", "h_o", "");
  assert.equal(ct.nExcluded, 2);
  assert.equal(sumCells(ct), 1);
});

test("buildCrosstab: an l axis makes margins exceed the record count", () => {
  const ct = exporters.buildCrosstab(xtabDb(), "h_sintomas", "", "h_sexo", "");
  assert.equal(ct.isMultiResponse, true);
  assert.ok(sumCells(ct) > ct.nCompared, `${sumCells(ct)} > ${ct.nCompared}`);
  assert.deepEqual(ct.row.levels, ["ansi", "depr"], "observed items, alphabetical");
});

test("buildCrosstab: l×l is a single co-occurrence matrix, no subset_items needed", () => {
  const db = makeDb([
    rawCol("s", ["a;b", "a", "b", "a;b"], { col_type: "l", col_sep: ";" }),
    rawCol("m", ["X;Y", "X", "Y", "X"], { col_type: "l", col_sep: ";" })
  ]);
  const ct = exporters.buildCrosstab(db, "h_s", "", "h_m", "");
  assert.deepEqual(ct.row.levels, ["a", "b"]);
  assert.deepEqual(ct.col.levels, ["X", "Y"]);
  assert.equal(cellOf(ct, "a", "X"), 3, "records 1, 2 and 4 have a AND X");
  assert.equal(cellOf(ct, "b", "Y"), 2, "records 1 and 3 have b AND Y");
});

test("buildCrosstab: maxLevels keeps the top-N most frequent in canonical order", () => {
  const db = makeDb([
    rawCol("g", ["rare", "common", "common", "common", "mid", "mid"]),
    rawCol("o", ["x", "x", "x", "x", "x", "x"])
  ]);
  const ct = exporters.buildCrosstab(db, "h_g", "", "h_o", "", { maxLevels: 2 });
  assert.deepEqual(ct.row.levels, ["common", "mid"], "alphabetical order preserved among survivors");
  assert.equal(ct.row.nLevelsTotal, 3, "pre-cap count reported");
  assert.equal(sumCells(ct), 5, "the dropped level's record is not counted");
});

test("buildCrosstab: maxLevels=0 keeps every level; blank keeps the default", () => {
  const db = makeDb([
    rawCol("g", Array.from({ length: 300 }, (_, i) => `L${i}`)),
    rawCol("o", Array.from({ length: 300 }, () => "x"))
  ]);
  const levels = (raw) => exporters.buildCrosstab(db, "h_g", "", "h_o", "", raw === "omit" ? {} : { maxLevels: raw }).row.levels.length;
  assert.equal(levels("omit"), 100, "default cap");
  assert.equal(levels(0), 300, "explicit 0 = no cap");
  assert.equal(levels("0"), 300, "string 0 too");
  assert.equal(levels(Infinity), 300);
  assert.equal(levels(25), 25);
  ["", "   ", null, "abc", -5].forEach(raw => {
    assert.equal(levels(raw), 100, `${JSON.stringify(raw)} falls back to the default`);
  });
  // No cap → nothing was truncated → no footer note.
  const html = exporters.exportCrosstabAsHTML(db, "h_g", "", "h_o", "", { maxLevels: 0, includeStyles: false });
  assert.equal(html.includes("statz-xtab-note"), false);
});

test("buildCrosstab: equal frequencies keep the earlier canonical level", () => {
  const db = makeDb([rawCol("g", ["b", "a", "c"]), rawCol("o", ["x", "x", "x"])]);
  const ct = exporters.buildCrosstab(db, "h_g", "", "h_o", "", { maxLevels: 2 });
  assert.deepEqual(ct.row.levels, ["a", "b"], "deterministic tie-break by canonical rank");
});

test("buildCrosstab: processing is resolved on BOTH axes", () => {
  const db = makeDb([
    rawCol("a", ["p", "drop", "p"], { meta: { replacements: [], processing: { excluded_values: ["drop"] } } }),
    rawCol("b", ["q", "q", "gone"], { meta: { replacements: [], processing: { excluded_values: ["gone"] } } })
  ]);
  const resolved = exporters.buildCrosstab(db, "h_a", "", "h_b", "");
  assert.deepEqual(resolved.row.levels, ["p"]);
  assert.deepEqual(resolved.col.levels, ["q"]);
  assert.equal(sumCells(resolved), 1, "only record 1 survives on both axes");
  const raw = exporters.buildCrosstab(db, "h_a", "", "h_b", "", { applyProcessing: false });
  assert.equal(sumCells(raw), 3);
  assert.ok(raw.row.levels.includes("drop"), "excluded value is a level again");
});

test("buildCrosstab: variant index selects the variant on either axis", () => {
  const db = makeDb([
    rawCol("a", ["p", "q"], {
      col_vars: [
        { var_label: "Original", meta: { kind: "original" } },
        { var_label: "A recoded", col_type: "q", col_sep: "", meta: {}, col_values: { col_compact: false, labels: null, codes: null, raw_values: ["Z", "Z"] } }
      ]
    }),
    rawCol("b", ["x", "y"])
  ]);
  const ct = exporters.buildCrosstab(db, "h_a", "1", "h_b", "");
  assert.equal(ct.row.label, "A recoded");
  assert.deepEqual(ct.row.levels, ["Z"]);
  assert.equal(ct.row.varIndex, 1);
});

test("buildCrosstab: same column on both axes gives a diagonal-only matrix", () => {
  const ct = exporters.buildCrosstab(xtabDb(), "h_sexo", "", "h_sexo", "");
  ct.counts.forEach((row, i) => row.forEach((count, j) => {
    if (i !== j) assert.equal(count, 0, `off-diagonal [${i}][${j}] must be 0`);
  }));
  assert.ok(ct.counts[0][0] > 0);
});

test("buildCrosstab: zero complete cases with declared q levels → all-zero table, not null", () => {
  // "these two are never both observed" is informative; a null would hide it.
  const db = makeDb([
    rawCol("a", null, { col_values: { col_compact: true, labels: ["p", "q"], codes: [1, 2, 0, 0], raw_values: null } }),
    rawCol("b", null, { col_values: { col_compact: true, labels: ["x", "y"], codes: [0, 0, 1, 2], raw_values: null } })
  ]);
  const ct = exporters.buildCrosstab(db, "h_a", "", "h_b", "");
  assert.ok(ct, "not null");
  assert.equal(ct.nCompared, 0);
  assert.equal(ct.nExcluded, 4);
  assert.equal(sumCells(ct), 0);
  assert.deepEqual(ct.counts, [[0, 0], [0, 0]]);
});

test("buildCrosstab: an n axis with zero complete cases → null (no levels to name)", () => {
  // Unlike q, n levels are OBSERVED rather than declared, so there is nothing to render.
  const db = makeDb([rawCol("v", ["1", "2", null], { col_type: "n" }), rawCol("o", [null, null, "x"])]);
  assert.equal(exporters.buildCrosstab(db, "h_v", "", "h_o", ""), null);
});

test("exportCrosstabAsHTML: unusable payload returns ''", () => {
  assert.equal(exporters.exportCrosstabAsHTML(null, "h_sexo", "", "h_faixa", ""), "");
  assert.equal(exporters.exportCrosstabAsHTML(xtabDb(), "nope", "", "h_faixa", ""), "");
});

test("exportCrosstabAsHTML: title lands in <caption>; no title → no caption, no default", () => {
  const db = xtabDb();
  const titled = exporters.exportCrosstabAsHTML(db, "h_faixa", "", "h_sexo", "", { title: "Coorte <b>2024</b> & co", includeStyles: false });
  assert.match(titled, /<caption>Coorte &lt;b&gt;2024&lt;\/b&gt; &amp; co<\/caption>/);
  [undefined, "", "  "].forEach(title => {
    const html = exporters.exportCrosstabAsHTML(db, "h_faixa", "", "h_sexo", "", { title, includeStyles: false, lang: "pt_br" });
    assert.equal(html.includes("<caption"), false);
    assert.equal(html.includes("Tabela"), false, "no fallback to the generic table.title");
  });
});

test("exportCrosstabAsHTML: header geometry and cell-only body", () => {
  const db = xtabDb();
  const html = exporters.exportCrosstabAsHTML(db, "h_faixa", "", "h_sexo", "", { includeStyles: false, lang: "en_us" });
  // 2 column levels → the column-variable name spans exactly those 2 columns.
  assert.match(html, /<th class="statz-xtab-colvar" colspan="2" scope="colgroup"/);
  assert.match(html, /<td class="statz-xtab-corner"><\/td>/, "corner is a td, not a th");
  // Header row 2: the row-variable name plus one cell per column level.
  assert.match(html, /<tr><th class="statz-xtab-rowvar" scope="col" title="faixa">faixa<\/th><th scope="col" title="F">F<\/th><th scope="col" title="M">M<\/th><\/tr>/);
  // Body row: 1 label + 2 counts, nothing else.
  assert.match(html, /<tr><th scope="row" title="18-30">18-30<\/th><td>0<\/td><td>2<\/td><\/tr>/);
});

test("exportCrosstabAsHTML: no marginal totals are rendered", () => {
  // Cells only, like a plain xtabs() printout. The margins stay on buildCrosstab's return.
  const db = xtabDb();
  const html = exporters.exportCrosstabAsHTML(db, "h_faixa", "", "h_sexo", "", { includeStyles: false, lang: "en_us" });
  assert.equal(html.includes("statz-xtab-tot"), false);
  assert.equal(html.includes("rowspan"), false);
  assert.equal(/>Total</.test(html), false, "no Total label anywhere");
  assert.equal(html.includes("<tfoot>"), false, "nothing left to put in it");
  const ct = exporters.buildCrosstab(db, "h_faixa", "", "h_sexo", "");
  assert.equal("rowTotals" in ct, false, "margins are not on the data helper either");
  assert.equal("colTotals" in ct, false);
  assert.equal("grandTotal" in ct, false);
});

test("exportCrosstabAsHTML: truncation note names each capped axis and spans the table", () => {
  // colspan is 1 label column + 2 level columns.
  const html = exporters.exportCrosstabAsHTML(xtabDb(), "h_faixa", "", "h_sexo", "", { includeStyles: false, lang: "en_us", maxLevels: 2 });
  assert.match(html, /<td colspan="3" class="statz-xtab-note">faixa: showing the 2 most frequent levels of 3\.<\/td>/);
});

test("exportCrosstabAsHTML: no tfoot at all when nothing was truncated", () => {
  const html = exporters.exportCrosstabAsHTML(xtabDb(), "h_faixa", "", "h_sexo", "", { includeStyles: false });
  assert.equal(html.includes("statz-xtab-note"), false);
  assert.equal(html.includes("<tfoot>"), false);
  // nExcluded and isMultiResponse are deliberately NOT rendered — they live on buildCrosstab.
  assert.equal(html.includes("excluded"), false);
});

test("exportCrosstabAsHTML: level labels are escaped in cells and in title attributes", () => {
  const db = makeDb([rawCol("g", ['<script>x</script>', 'a"b']), rawCol("o", ["1", "1"])]);
  const html = exporters.exportCrosstabAsHTML(db, "h_g", "", "h_o", "", { includeStyles: false });
  assert.equal(html.includes("<script"), false, "no script tag survives");
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /title="a&quot;b"/);
});

test("exportCrosstabAsHTML: includeStyles and includeTitles gate their output", () => {
  const db = xtabDb();
  assert.equal(exporters.exportCrosstabAsHTML(db, "h_faixa", "", "h_sexo", "", {}).split("<style>").length - 1, 1);
  assert.equal(exporters.exportCrosstabAsHTML(db, "h_faixa", "", "h_sexo", "", { includeStyles: false }).includes("<style>"), false);
  assert.equal(exporters.exportCrosstabAsHTML(db, "h_faixa", "", "h_sexo", "", { includeStyles: false, includeTitles: false }).includes("title="), false);
});

test("exportCrosstabAsHTML: emitted CSS uses only /* */ comments", () => {
  // The build strips newlines, so a // comment would swallow the rest of the style block.
  const html = exporters.exportCrosstabAsHTML(xtabDb(), "h_faixa", "", "h_sexo", "");
  const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
  assert.equal(css.includes("//"), false);
  assert.equal((css.match(/\/\*/g) || []).length, (css.match(/\*\//g) || []).length);
});

test("crosstab i18n: the truncation note resolves in all three locales", () => {
  const key = "table.crosstab.noteTruncated";
  ["pt_br", "en_us", "es_es"].forEach(lang => {
    // translate() returns the key itself when nothing resolves, so a typo would render literally.
    const value = translate(key, lang, { label: "v", shown: 2, total: 3 });
    assert.notEqual(value, key, `${key} unresolved for ${lang}`);
    assert.match(value, /\bv\b/, "interpolates the variable label");
  });
});

test("exportCombinedAsHTML: the legend names the percentage base, including 'total'", () => {
  const mk = (percent_by) => exporters.combineAnalysisAsSingleTable({
    analysis: [entry('P', 'R', 'q', 'q', {
      columns: ['Group', 'x'], rows: [{ Group: 'a', x: '1 (100.0%)' }],
      test_used: 'Chi-square', test_symbol: '¹', p_value: 0.5, percent_by
    })],
    lang: 'en_us'
  });
  assert.match(exporters.exportCombinedAsHTML(mk('total'), 'T', false), /Percentages refer to the table total/);
  assert.match(exporters.exportCombinedAsHTML(mk('row'), 'T', false), /total of each row/);
  assert.match(exporters.exportCombinedAsHTML(mk('col'), 'T', false), /total of each column/);
  // Markdown export carries the same legend line.
  assert.match(exporters.exportCombinedAsMarkdown(mk('total'), 'T'), /Percentages refer to the table total/);
});

test("combineAnalysisAsSingleTable: the p-value column stays last after a level merge", () => {
  // Two predictors whose responses resolve in different databases with different level sets.
  // The second analysis introduces "other", which the merge appends after the columns already
  // seen — including the p-value, which each individual analysis emits last.
  const result = {
    lang: 'pt_br',
    analysis: [
      {
        predictor: 'Age', response: 'Outcome', predictor_type: 'n', response_type: 'q',
        table: {
          columns: ['Grupo', 'no', 'yes', 'p-valor'],
          rows: [{ Grupo: 'Média ± DP', no: '5,0', yes: '2,0', 'p-valor': '' }],
          test_used: 't de Student', p_value: 0.0213, posthoc: null, test_symbol: '¹'
        }
      },
      {
        predictor: 'Weight', response: 'Outcome', predictor_type: 'n', response_type: 'q',
        table: {
          columns: ['Grupo', 'no', 'other', 'yes', 'p-valor'],
          rows: [{ Grupo: 'Média ± DP', no: '500,0', other: '800,0', yes: '200,0', 'p-valor': '' }],
          test_used: 'ANOVA', p_value: 0.001, posthoc: null, test_symbol: '²'
        }
      }
    ]
  };
  const combined = exporters.combineAnalysisAsSingleTable(result);
  assert.deepEqual(combined.columns, ['Grupo', 'no', 'yes', 'other', 'p-valor']);
  assert.equal(combined.columns.at(-1), 'p-valor');
  // Reordering must not detach the values from their labels — rows are keyed, not positional.
  const weightHeader = combined.rows.find(r => r.Grupo === '<b>Weight</b>');
  assert.equal(weightHeader['p-valor'], '0,001²');
  const ageHeader = combined.rows.find(r => r.Grupo === '<b>Age</b>');
  assert.equal(ageHeader['p-valor'], '0,021¹');
  // Every rendered row must still span exactly the declared column count.
  const html = exporters.exportCombinedAsHTML(combined);
  for (const tr of html.match(/<tr>.*?<\/tr>/g) || []) {
    const width = (tr.match(/<t[hd][^>]*>/g) || [])
      .reduce((sum, cell) => sum + Number((cell.match(/colspan="(\d+)"/) || [, 1])[1]), 0);
    assert.equal(width, combined.columns.length);
  }
  // Both predictor header rows must merge identically. The Age row carries no "other" key at
  // all — it was built before the second analysis introduced that column — and the colspan scan
  // must read that absence as empty, exactly like the cell read does.
  const headerColspans = (html.match(/<td colspan="(\d+)"><b>/g) || [])
    .map(cell => Number(cell.match(/colspan="(\d+)"/)[1]));
  assert.deepEqual(headerColspans, [4, 4]);
});

test("combineAnalysisAsSingleTable: a single analysis keeps its column order untouched", () => {
  const result = {
    lang: 'pt_br',
    analysis: [{
      predictor: 'Age', response: 'Outcome', predictor_type: 'n', response_type: 'q',
      table: {
        columns: ['Grupo', 'no', 'yes', 'p-valor'],
        rows: [{ Grupo: 'Média ± DP', no: '5,0', yes: '2,0', 'p-valor': '' }],
        test_used: 't de Student', p_value: 0.02, posthoc: null, test_symbol: '¹'
      }
    }]
  };
  assert.deepEqual(exporters.combineAnalysisAsSingleTable(result).columns,
    ['Grupo', 'no', 'yes', 'p-valor']);
});
