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
