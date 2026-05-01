import test from "node:test";
import assert from "node:assert/strict";
import factors from "../json/factors.js";
import numeric from "../json/numeric.js";

test("inferColType: list with ';' separator, commas embedded in values", () => {
  const values = [
    "febre, baixa; perda de peso; dor",
    "dor; anemia",
    "dor; febre, baixa",
    "febre, baixa; anemia",
    "dor; perda de peso"
  ];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'l');
  assert.equal(result.col_sep, ';');
});

test("inferColType: qualitative with commas in category names", () => {
  const values = ["Sim, às vezes", "Não", "Sim, sempre", "Não", "Talvez", "Não", "Sim, às vezes"];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'q');
});

test("inferColType: list with ',' separator, no semicolons", () => {
  const values = ["febre,dor", "dor,anemia", "febre", "dor,anemia,febre", "febre,dor,anemia"];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'l');
  assert.equal(result.col_sep, ',');
});

test("inferColType: numeric with decimal comma (Portuguese locale) — not a list", () => {
  const values = ["3,14", "2,71", "1,41", "0,50", "9,80", "1,73"];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'n');
});

test("inferColType: plain numeric", () => {
  const values = ["10", "20", "30", "40", "15"];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'n');
});

test("inferColType: plain qualitative", () => {
  const values = ["male", "female", "male", "female", "male"];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'q');
});

test("getIndividualItems: q column defaults to levels order from col_values.labels", () => {
  // Build a q column then reorder levels to a custom order via applyProcessing
  const col = factors.makeColumn(['Low', 'High', 'Medium', 'High', 'Low'], {
    col_type: 'q', col_sep: '', includeBaseVariant: false
  });
  col.meta = { processing: { sort_mode: 'custom', custom_order: ['High', 'Medium', 'Low'] } };
  const processed = factors.applyProcessing(col);
  const items = factors.getIndividualItems(processed);
  assert.deepEqual(items, ['High', 'Medium', 'Low']);
});

test("getIndividualItems: order='alpha' sorts alphabetically regardless of col_type", () => {
  const col = factors.makeColumn(['banana', 'apple', 'cherry'], {
    col_type: 'q', col_sep: '', includeBaseVariant: false
  });
  const items = factors.getIndividualItems(col, { order: 'alpha' });
  assert.deepEqual(items, ['apple', 'banana', 'cherry']);
});

test("getIndividualItems: l column defaults to alpha order", () => {
  const col = factors.makeColumn(['febre;dor', 'anemia;febre', 'dor'], {
    col_type: 'l', col_sep: ';', includeBaseVariant: false
  });
  const items = factors.getIndividualItems(col);
  assert.deepEqual(items, ['anemia', 'dor', 'febre']);
});

test("summarize_n_q: response groups follow responseLabels order", () => {
  const predictor = ['10', '20', '30', '15', '25', '12', '22', '32'];
  const response  = ['Low', 'Med', 'High', 'Low', 'Med', 'Low', 'Med', 'High'];
  const responseLabels = ['High', 'Med', 'Low']; // explicit factor levels
  const result = numeric.summarize_n_q(predictor, response, null, null, { responseLabels, lang: 'en_us' });
  // Group columns appear after the first column header (Group) and before p-value
  const groupCols = result.columns.slice(1, -1);
  assert.deepEqual(groupCols, ['High', 'Med', 'Low']);
});

test("summarize_n_q: without responseLabels falls back to insertion order from data", () => {
  const predictor = ['10', '20', '30'];
  const response  = ['B', 'A', 'C']; // first appearance order: B, A, C
  const result = numeric.summarize_n_q(predictor, response, null, null, { lang: 'en_us' });
  const groupCols = result.columns.slice(1, -1);
  assert.deepEqual(groupCols, ['B', 'A', 'C']);
});

test("getIndividualItemsWithCount: sortByLevels=true honors col_values.labels order", () => {
  const col = factors.makeColumn(['Low', 'Low', 'High', 'Medium', 'High', 'High'], {
    col_type: 'q', col_sep: '', includeBaseVariant: false
  });
  col.meta = { processing: { sort_mode: 'custom', custom_order: ['High', 'Medium', 'Low'] } };
  const processed = factors.applyProcessing(col);
  const result = factors.getIndividualItemsWithCount(processed, { sortByLevels: true });
  assert.deepEqual(result.map(r => r.Value), ['High', 'Medium', 'Low']);
  assert.equal(result[0].Count, 3);
  assert.equal(result[1].Count, 1);
  assert.equal(result[2].Count, 2);
});

test("encodeAsFactor: q column labels are alphabetically sorted on first encoding", () => {
  const col = factors.makeColumn(['Charlie', 'Alpha', 'Bravo', 'Alpha', 'Charlie'], {
    col_type: 'q', col_sep: '', includeBaseVariant: false
  });
  assert.deepEqual(col.col_values.labels, ['Alpha', 'Bravo', 'Charlie']);
  // Codes still decode correctly back to original values
  assert.deepEqual(factors.decodeColumn(col), ['Charlie', 'Alpha', 'Bravo', 'Alpha', 'Charlie']);
});

test("parseColumns: q column labels arrive alphabetically sorted from CSV parsing", () => {
  const data = JSON.stringify([
    { gender: 'male' }, { gender: 'female' }, { gender: 'male' }, { gender: 'female' }
  ]);
  const result = factors.parseColumns(data, ['hash1'], 'test.csv', 0);
  const col = result.columns[0];
  assert.equal(col.col_type, 'q');
  assert.deepEqual(col.col_values.labels, ['female', 'male']);
});

test("encodeAsFactor: l column labels remain in first-appearance order", () => {
  const col = factors.makeColumn(['Charlie;Alpha', 'Bravo', 'Alpha;Charlie'], {
    col_type: 'l', col_sep: ';', includeBaseVariant: false
  });
  // List columns keep first-appearance order (frequency-driven UX)
  assert.deepEqual(col.col_values.labels, ['Charlie', 'Alpha', 'Bravo']);
});

test("getIndividualItemsWithCount: sortByLevels=true follows initial alpha order on a fresh q column", () => {
  // Fresh encoding: labels are sorted alphabetically (R-style factor default)
  const col = factors.makeColumn(['B', 'A', 'B', 'A'], {
    col_type: 'q', col_sep: '', includeBaseVariant: false
  });
  assert.deepEqual(col.col_values.labels, ['A', 'B']);
  const result = factors.getIndividualItemsWithCount(col, { sortByLevels: true });
  assert.deepEqual(result.map(r => r.Value), ['A', 'B']);
});

test("getIndividualItemsWithCount: defaults unchanged (alpha asc)", () => {
  const col = factors.makeColumn(['Low', 'High', 'Medium', 'High'], {
    col_type: 'q', col_sep: '', includeBaseVariant: false
  });
  col.meta = { processing: { sort_mode: 'custom', custom_order: ['High', 'Medium', 'Low'] } };
  const processed = factors.applyProcessing(col);
  const result = factors.getIndividualItemsWithCount(processed); // no sortByLevels
  assert.deepEqual(result.map(r => r.Value), ['High', 'Low', 'Medium']); // alpha asc
});

test("getNumericWarnings: reports spurious characters, silent for clean values", () => {
  const col = factors.makeColumn(["10", "1.2t", "abc", "20", "", "1,2"], {
    col_type: 'n', col_sep: '', includeBaseVariant: false
  });
  const warnings = numeric.getNumericWarnings(col, 'pt_br');
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /linha 2.*1\.2t.*1\.2/);
  assert.match(warnings[1], /linha 3.*abc.*não numérico/);
});
