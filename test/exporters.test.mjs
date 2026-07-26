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

test("buildMissingMap: pointer-style base variant falls back to the parent values", () => {
  const db = makeDb([rawCol("x", ["a", null, "c"], { col_vars: [{ var_label: "Original", meta: { kind: "original" } }] })]);
  const map = exporters.buildMissingMap(db);
  assert.equal(map.columns.length, 2, "base column + base variant");
  assert.equal(map.columns[1].isVariant, true);
  assert.equal(map.columns[1].nMissing, map.columns[0].nMissing);
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
    rawCol("kept", withMissing(4, [1]), { col_vars: [{ var_label: "Original", meta: { kind: "original" } }] })
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
