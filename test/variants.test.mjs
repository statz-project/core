import test from "node:test";
import assert from "node:assert/strict";
import variants from "../json/variants.js";
import factors from "../json/factors.js";
import driver from "../json/driver.js";
import { parseFixture } from '../scripts/dev/load-fixture.mjs';

const { parsed } = parseFixture();

test("createVariant coerces numeric values", () => {
  const baseValues = ["1", "2", "3", "bad"];
  const baseCol = factors.makeColumn(baseValues, { encode: false });

  const numericVariant = variants.createVariant(baseCol, {
    sourceVarIndex: 0,
    kind: "numeric",
    var_label: "As numeric",
    forceNumeric: {}
  });

  assert.equal(numericVariant.col_type, "n");
  assert.equal(numericVariant.col_sep, "");

  const decoded = factors.decodeColumn(numericVariant);
  
  assert.deepEqual(decoded, ["1", "2", "3", ""]);

  const actionTypes = numericVariant.meta.actions.map((action) => action.type);
  assert(actionTypes.includes("coerce_numeric"));
  assert.ok(numericVariant.meta.warnings.length > 0);
});

test("variant templates expose factor presets", () => {
  assert.ok(Array.isArray(variants.VARIANT_TEMPLATES.q));
  assert.ok(Array.isArray(variants.VARIANT_TEMPLATES.n));
  assert.ok(Array.isArray(variants.VARIANT_TEMPLATES.l));
});

test("addVariant seeds original snapshot when missing", () => {
  const rows = JSON.stringify([
    { age: "10" },
    { age: "20" },
    { age: "30" }
  ]);
  const hashes = ["col-age"];
  const database = factors.parseColumns(rows, hashes, "sample.csv", "2024-01-01T00:00:00.000Z");
  const column = database.columns[0];

  assert.ok(Array.isArray(column.col_vars));
  assert.equal(column.col_vars.length, 0);

  const numericVariant = variants.createVariant(column, {
    kind: "numeric",
    var_label: "Numeric age",
    forceNumeric: {}
  });

  driver.addVariant(database, column.col_hash, numericVariant);

  const updatedColumn = database.columns[0];
  assert.equal(updatedColumn.col_vars.length, 2);
  assert.equal(updatedColumn.col_vars[0].meta.kind, "original");
  // Pointer-style base variant: no col_values/col_type/col_sep duplication
  assert.equal(updatedColumn.col_vars[0].col_values, undefined);
  assert.equal(updatedColumn.col_vars[0].col_type, undefined);
  assert.equal(updatedColumn.col_vars[0].col_sep, undefined);
  assert.strictEqual(updatedColumn.col_vars[1], numericVariant);
});

test("cut numeric with equally spaced width", () => {
  const baseColumn = factors.makeColumn(['1','2','3','4','5','6','7','8','9','10'], {col_type: "n"});

  const options = {
    cut: {
      width: 5,
      includeLowest: true,
      right: true,
      origin: 0
    }
  };

  const variant = variants.createVariant(baseColumn, options);

  baseColumn.col_vars.push(variant);

  const variantRaw = factors.decodeColumn(variant);

  assert.deepEqual(variantRaw, ["[0, 5]","[0, 5]","[0, 5]","[0, 5]","[0, 5]","(5, 10]","(5, 10]","(5, 10]","(5, 10]","(5, 10]"]);
  
});

test("cut numeric with explicit breaks", () => {
  const baseColumn = factors.makeColumn(['1','2','3','4','5','6','7','8','','10'], {col_type: "n"});

  const options = {
    cut: {
      includeLowest: true,
      right: true,
      breaks: [1,3,10],
      col_type: "q"
    }
  };

  const variant = variants.createVariant(baseColumn, options);
  
  baseColumn.col_vars.push(variant);
  
  const summary = driver.describeColumn(baseColumn, baseColumn.col_vars.length - 1);
  
  assert.deepEqual(summary, [
    "[1, 3]: 3 (30.0%)",
    "(3, 10]: 6 (60.0%)",
    "Not informed: 1 (10.0%)"
  ]);
});

test("subsetLevels from list column type", () => {
  
  const baseColumn = driver.getColumn(parsed, "col_clinics_hash");
  
  const summary = driver.describeColumn(baseColumn);

  assert.deepEqual(summary, [
    "headache: 68 (68.0%)",
    "overweight: 58 (58.0%)",
    "fever: 15 (15.0%)",
    "dm: 8 (8.0%)",
    "sneeze: 8 (8.0%)",
    "cough: 6 (6.0%)",
    "anemia: 5 (5.0%)",
    "cancer: 5 (5.0%)",
    "fatigue: 5 (5.0%)",
    "underweight: 5 (5.0%)",
    "Not informed: 22 (22.0%)"
  ]);
  
  const options = {
    subsetLevels: ['fever','headache']
  };
  
  const variant = variants.createVariant(baseColumn, options);
  
  const VariantSummary = driver.describeColumn(variant);
  
  assert.deepEqual(VariantSummary, [
    "headache: 68 (68.0%)",
    "fever: 15 (15.0%)",
    "Not informed: 22 (22.0%)"
  ]);

});

test("search and replace", () => {

  const baseColumn = driver.getColumn(parsed, "col_clinics_hash");

  const options = {
    replacements: [
      {from: "headache", to: "migraine"},
      {from: "fever", to: "pyrexia"}
    ]
  };

  const variant = variants.createVariant(baseColumn, options);

  assert.deepEqual(
    driver.describeColumn(variant),
    [
      "migraine: 68 (68.0%)",
      "overweight: 58 (58.0%)",
      "pyrexia: 15 (15.0%)",
      "dm: 8 (8.0%)",
      "sneeze: 8 (8.0%)",
      "cough: 6 (6.0%)",
      "anemia: 5 (5.0%)",
      "cancer: 5 (5.0%)",
      "fatigue: 5 (5.0%)",
      "underweight: 5 (5.0%)",
      "Not informed: 22 (22.0%)"
    ]
  );

  assert.deepEqual(
    variant.meta.warnings,
    ["Search & replace: headache->migraine; fever->pyrexia"]
  );

});

test("describeColumn structured output modes", () => {
  const baseColumn = driver.getColumn(parsed, "col_clinics_hash");

  const structured = driver.describeColumn(baseColumn, null, {
    structured: true,
    maxRows: 2
  });

  assert.deepEqual(structured, [
    { label: "headache", summary: "68 (68.0%)" },
    { label: "overweight", summary: "58 (58.0%)" }
  ]);

  const pairs = driver.describeColumn(baseColumn, null, {
    maxRows: 2
  });

  assert.deepEqual(pairs, [
    "headache: 68 (68.0%)",
    "overweight: 58 (58.0%)"
  ]);
});

// ---------------------------------------------------------------------------
// Source resolution: createVariant honors source's meta.replacements + meta.processing
// ---------------------------------------------------------------------------

test("createVariant: applies source's meta.replacements before the pipeline", () => {
  const baseColumn = factors.makeColumn(['m', 'f', 'm', 'f', 'm'], {
    col_type: 'q',
    includeBaseVariant: false
  });
  baseColumn.meta = { replacements: [{ from: 'm', to: 'male' }, { from: 'f', to: 'female' }] };

  // Variant's replacements target the RESOLVED values ('male'/'female'), not raw ('m'/'f').
  const variant = variants.createVariant(baseColumn, {
    replacements: [{ from: 'male', to: 'Male' }, { from: 'female', to: 'Female' }]
  });

  const decoded = factors.decodeColumn(variant);
  assert.deepEqual(decoded, ['Male', 'Female', 'Male', 'Female', 'Male']);
});

test("createVariant: applies source's meta.processing.excluded_values before the pipeline", () => {
  // Source contains a sentinel '9' the user has marked as excluded.
  const baseColumn = factors.makeColumn(['1', '2', '3', '4', '5', '9', '9'], {
    col_type: 'n',
    includeBaseVariant: false
  });
  baseColumn.meta = { processing: { excluded_values: ['9'] } };

  // Cut a 0-10 range. With source resolution, '9' rows arrive at the pipeline as empty,
  // so the (5, 10] bin should be empty even though raw values would fall there.
  const variant = variants.createVariant(baseColumn, {
    cut: { breaks: [0, 5, 10], includeLowest: true, right: true }
  });

  const counts = factors.getIndividualItemsWithCount(variant, { includeEmpty: true });
  const fiveTenBin = counts.find(c => c.Value === '(5, 10]');
  // Without source resolution, count would be 2 (the two '9' rows). With resolution, 0.
  assert.equal(fiveTenBin?.Count ?? 0, 0);

  // Sanity: the [0, 5] bin still receives the 5 valid rows.
  const lowBin = counts.find(c => c.Value === '[0, 5]');
  assert.equal(lowBin?.Count, 5);
});

test("createVariant: pointer-style base variant resolves through parent column's meta", () => {
  // Build a column with meta.replacements and a pointer-style base variant
  const baseColumn = factors.makeColumn(['a', 'b', 'a'], { col_type: 'q' });
  baseColumn.meta = { replacements: [{ from: 'a', to: 'Alpha' }, { from: 'b', to: 'Beta' }] };

  // sourceVarIndex: 0 → pointer-style base; createVariant must fall back to baseColumn for both values AND meta.
  const variant = variants.createVariant(baseColumn, {
    sourceVarIndex: 0,
    replacements: [{ from: 'Alpha', to: 'A' }, { from: 'Beta', to: 'B' }]
  });

  const decoded = factors.decodeColumn(variant);
  assert.deepEqual(decoded, ['A', 'B', 'A']);
});

// ---------------------------------------------------------------------------
// replaceVariantAt: cascading re-replay when an existing variant is edited
// ---------------------------------------------------------------------------

function buildScenarioDb() {
  // Column with values 1..10 (str) of type 'n'
  const col = factors.makeColumn(
    ['1','2','3','4','5','6','7','8','9','10'],
    { col_type: 'n', var_label: 'Score', includeBaseVariant: true }
  );
  col.col_hash = 'h_score';
  col.col_label = 'Score';
  col.col_name = 'score';

  // v1 = cut into [0, 5, 10]
  const v1 = variants.createVariant(col, {
    var_label: 'Score (binned)',
    kind: 'cut_intervals',
    sourceVarIndex: 0,
    cut: { breaks: [0, 5, 10], includeLowest: true, right: true }
  });
  col.col_vars.push(v1);

  // v2 = search_replace on top of v1 ([0, 5] → Low, (5, 10] → High)
  const v2 = variants.createVariant(col, {
    var_label: 'Score (label)',
    kind: 'search_replace',
    sourceVarIndex: 1,
    replacements: [{ from: '[0, 5]', to: 'Low' }, { from: '(5, 10]', to: 'High' }]
  });
  col.col_vars.push(v2);

  return { database: { columns: [col] }, col };
}

test("replaceVariantAt: downstream variants are re-replayed against the new chain", () => {
  const { database, col } = buildScenarioDb();
  const lowCountBefore = factors.getIndividualItemsWithCount(col.col_vars[2])
    .find(c => c.Value === 'Low')?.Count;
  assert.equal(lowCountBefore, 5);

  // Edit v1 (index 1): tighter bins
  const newV1 = variants.createVariant(col, {
    var_label: 'Score (binned tight)',
    kind: 'cut_intervals',
    sourceVarIndex: 0,
    cut: { breaks: [0, 3, 10], includeLowest: true, right: true }
  });

  const { warnings } = driver.replaceVariantAt(database, 'h_score', 1, newV1);
  assert.equal(warnings.length, 0);

  // v1 updated
  assert.equal(col.col_vars[1].var_label, 'Score (binned tight)');
  const v1Labels = col.col_vars[1].col_values.labels;
  assert.deepEqual(v1Labels, ['[0, 3]', '(3, 10]']);

  // v2 was rebuilt against new v1: original replacement keys no longer match.
  // The v2 recipe ('[0, 5]'→'Low', '(5, 10]'→'High') will not find those labels in the new v1,
  // so values pass through unchanged — v2 should now hold the new bin labels.
  const v2Decoded = factors.decodeColumn(col.col_vars[2]);
  // First three rows are in [0,3] → '[0, 3]' (no replacement); rows 4-10 are in (3,10] → '(3, 10]'.
  assert.equal(v2Decoded[0], '[0, 3]');
  assert.equal(v2Decoded[5], '(3, 10]');
  // v2 label preserved
  assert.equal(col.col_vars[2].var_label, 'Score (label)');
});

test("replaceVariantAt: downstream depending on an earlier (untouched) variant still works", () => {
  const { database, col } = buildScenarioDb();
  // Append v3 that depends on v1 (not v2)
  const v3 = variants.createVariant(col, {
    var_label: 'V3 from v1',
    kind: 'search_replace',
    sourceVarIndex: 1,
    replacements: [{ from: '[0, 5]', to: 'X' }]
  });
  col.col_vars.push(v3);

  // Edit v2 (index 2) — v3 depends on v1, not v2; replay should be equivalent
  const newV2 = variants.createVariant(col, {
    var_label: 'Score (label v2)',
    kind: 'search_replace',
    sourceVarIndex: 1,
    replacements: [{ from: '[0, 5]', to: 'L' }, { from: '(5, 10]', to: 'H' }]
  });
  const { warnings } = driver.replaceVariantAt(database, 'h_score', 2, newV2);
  assert.equal(warnings.length, 0);

  // v3 still has expected data (one X on rows in [0,5], pass-through on (5,10])
  const v3Decoded = factors.decodeColumn(col.col_vars[3]);
  assert.equal(v3Decoded[0], 'X');
  assert.equal(v3Decoded[5], '(5, 10]');
});

test("replaceVariantAt: variant without recipe is kept with a stale warning", () => {
  const { database, col } = buildScenarioDb();
  // Strip recipe from v2
  delete col.col_vars[2].meta.recipe;
  const oldV2Snapshot = JSON.parse(JSON.stringify(col.col_vars[2]));

  const newV1 = variants.createVariant(col, {
    var_label: 'V1 again',
    kind: 'cut_intervals',
    sourceVarIndex: 0,
    cut: { breaks: [0, 3, 10], includeLowest: true, right: true }
  });
  const { warnings } = driver.replaceVariantAt(database, 'h_score', 1, newV1);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no stored recipe/);
  assert.deepEqual(col.col_vars[2], oldV2Snapshot);
});

test("replaceVariantAt: chain v1 -> v2 -> v3 all rebuilt in order", () => {
  const { database, col } = buildScenarioDb();
  // Append v3 derived from v2
  const v3 = variants.createVariant(col, {
    var_label: 'V3 from v2',
    kind: 'search_replace',
    sourceVarIndex: 2,
    replacements: [{ from: 'Low', to: 'L' }, { from: 'High', to: 'H' }]
  });
  col.col_vars.push(v3);

  const newV1 = variants.createVariant(col, {
    var_label: 'V1 retuned',
    kind: 'cut_intervals',
    sourceVarIndex: 0,
    cut: { breaks: [0, 7, 10], includeLowest: true, right: true }
  });
  const { warnings } = driver.replaceVariantAt(database, 'h_score', 1, newV1);
  assert.equal(warnings.length, 0);

  // v1 has new labels
  assert.deepEqual(col.col_vars[1].col_values.labels, ['[0, 7]', '(7, 10]']);
  // v2 (search_replace [0,5]→Low, (5,10]→High) ran against new v1 — labels don't match → pass-through
  const v2Decoded = factors.decodeColumn(col.col_vars[2]);
  assert.equal(v2Decoded[0], '[0, 7]');
  // v3 (search_replace Low→L, High→H) ran against new v2 — labels don't match → pass-through
  const v3Decoded = factors.decodeColumn(col.col_vars[3]);
  assert.equal(v3Decoded[0], '[0, 7]');
});

test("replaceVariantAt: editIndex must be >= 1", () => {
  const { database } = buildScenarioDb();
  const newVar = variants.createVariant(database.columns[0], { sourceVarIndex: 0 });
  assert.throws(
    () => driver.replaceVariantAt(database, 'h_score', 0, newVar),
    /base variant is not editable/
  );
});

test("replaceVariantAt: editIndex out of bounds throws", () => {
  const { database } = buildScenarioDb();
  const newVar = variants.createVariant(database.columns[0], { sourceVarIndex: 0 });
  assert.throws(
    () => driver.replaceVariantAt(database, 'h_score', 99, newVar),
    /out of bounds/
  );
});

test("replaceVariantAt: unknown colHash throws", () => {
  const { database } = buildScenarioDb();
  const newVar = variants.createVariant(database.columns[0], { sourceVarIndex: 0 });
  assert.throws(
    () => driver.replaceVariantAt(database, 'NO_SUCH_HASH', 1, newVar),
    /not found/
  );
});

test("replaceVariantAt: does not mutate the provided newVariant", () => {
  const { database, col } = buildScenarioDb();
  const newV1 = variants.createVariant(col, {
    var_label: 'V1 retuned',
    sourceVarIndex: 0,
    cut: { breaks: [0, 3, 10], includeLowest: true, right: true }
  });
  const snapshot = JSON.parse(JSON.stringify(newV1));

  driver.replaceVariantAt(database, 'h_score', 1, newV1);
  assert.deepEqual(newV1, snapshot);
});
