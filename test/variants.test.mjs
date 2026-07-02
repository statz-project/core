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
  // Auto-injected var_content_hash is expected post-refactor; compare everything else.
  const { var_content_hash: _hash, ...rest } = col.col_vars[2];
  assert.deepEqual(rest, oldV2Snapshot);
  assert.equal(typeof _hash, 'string', 'var_content_hash was populated by the auto-refresh');
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

test("replaceVariantAt: does not mutate the provided newVariant (aside from auto-injected content hash)", () => {
  const { database, col } = buildScenarioDb();
  const newV1 = variants.createVariant(col, {
    var_label: 'V1 retuned',
    sourceVarIndex: 0,
    cut: { breaks: [0, 3, 10], includeLowest: true, right: true }
  });
  const snapshot = JSON.parse(JSON.stringify(newV1));

  driver.replaceVariantAt(database, 'h_score', 1, newV1);
  // The variant is transferred to the database and receives var_content_hash as a
  // side-effect of the auto-refresh (documented contract). Everything else stays intact.
  const { var_content_hash: _h, ...rest } = newV1;
  assert.deepEqual(rest, snapshot);
  assert.equal(typeof _h, 'string');
});

// ---------------------------------------------------------------------------
// createVariant: sort_mode + custom_order (parity with column-level meta.processing)
// ---------------------------------------------------------------------------

function buildSortFixtureCol() {
  // 4 a's, 2 b's, 3 c's — counts distinct enough for ordering tests
  const col = factors.makeColumn(
    ['a','a','a','a','b','b','c','c','c'],
    { col_type: 'q', var_label: 'Letter', includeBaseVariant: true }
  );
  col.col_hash = 'h_sort';
  col.col_label = 'Letter';
  col.col_name = 'letter';
  return col;
}

test('createVariant: sort_mode "freq_desc" orders labels by descending count', () => {
  const col = buildSortFixtureCol();
  const variant = variants.createVariant(col, { sourceVarIndex: 0, sort_mode: 'freq_desc' });
  // a:4, c:3, b:2 → ['a','c','b']
  assert.deepEqual(variant.col_values.labels, ['a', 'c', 'b']);
});

test('createVariant: sort_mode "freq_asc" orders labels by ascending count', () => {
  const col = buildSortFixtureCol();
  const variant = variants.createVariant(col, { sourceVarIndex: 0, sort_mode: 'freq_asc' });
  // b:2, c:3, a:4 → ['b','c','a']
  assert.deepEqual(variant.col_values.labels, ['b', 'c', 'a']);
});

test('createVariant: sort_mode "alpha" sorts alphabetically regardless of source order', () => {
  const col = buildSortFixtureCol();
  // Force a non-alphabetical source order via custom_order on the column meta
  col.meta = { processing: { sort_mode: 'custom', custom_order: ['c', 'a', 'b'] } };
  const variant = variants.createVariant(col, { sourceVarIndex: 0, sort_mode: 'alpha' });
  assert.deepEqual(variant.col_values.labels, ['a', 'b', 'c']);
});

test('createVariant: sort_mode "custom" with complete custom_order', () => {
  const col = buildSortFixtureCol();
  const variant = variants.createVariant(col, {
    sourceVarIndex: 0,
    sort_mode: 'custom',
    custom_order: ['b', 'a', 'c']
  });
  assert.deepEqual(variant.col_values.labels, ['b', 'a', 'c']);
});

test('createVariant: sort_mode "custom" with partial custom_order keeps remaining in original order', () => {
  const col = buildSortFixtureCol();
  // custom_order only lists 'c' — 'a' and 'b' go to the tail in original (alphabetical) order
  const variant = variants.createVariant(col, {
    sourceVarIndex: 0,
    sort_mode: 'custom',
    custom_order: ['c']
  });
  assert.deepEqual(variant.col_values.labels, ['c', 'a', 'b']);
});

test('createVariant: sort_mode "default" / omitted preserves natural workingLabels order', () => {
  const col = buildSortFixtureCol();
  col.meta = { processing: { sort_mode: 'custom', custom_order: ['c', 'a', 'b'] } };
  // No sort_mode in variant config → workingLabels (source custom_order) wins
  const variant = variants.createVariant(col, { sourceVarIndex: 0 });
  assert.deepEqual(variant.col_values.labels, ['c', 'a', 'b']);

  // Explicit 'default' also preserves
  const variantDef = variants.createVariant(col, { sourceVarIndex: 0, sort_mode: 'default' });
  assert.deepEqual(variantDef.col_values.labels, ['c', 'a', 'b']);
});

test('createVariant: backward-compat — sortByFrequency:true equals sort_mode:freq_desc', () => {
  const col = buildSortFixtureCol();
  const viaLegacy = variants.createVariant(col, { sourceVarIndex: 0, sortByFrequency: true });
  const viaModern = variants.createVariant(col, { sourceVarIndex: 0, sort_mode: 'freq_desc' });
  assert.deepEqual(viaLegacy.col_values.labels, viaModern.col_values.labels);
});

test('normalizeRecipe: canonicalizes sortByFrequency:true into sort_mode:freq_desc', () => {
  const recipe = variants.normalizeRecipe({ sortByFrequency: true });
  assert.equal(recipe.sort_mode, 'freq_desc');
  assert.equal(recipe.sortByFrequency, undefined);
});

test('normalizeRecipe: drops sort_mode "default" and sortByFrequency:false', () => {
  const r1 = variants.normalizeRecipe({ sort_mode: 'default' });
  assert.equal(r1.sort_mode, undefined);
  const r2 = variants.normalizeRecipe({ sortByFrequency: false });
  assert.equal(r2.sort_mode, undefined);
  assert.equal(r2.sortByFrequency, undefined);
});

test('normalizeRecipe: keeps custom_order only when sort_mode is "custom"', () => {
  const r1 = variants.normalizeRecipe({ sort_mode: 'custom', custom_order: ['a', 'b'] });
  assert.deepEqual(r1.custom_order, ['a', 'b']);
  // freq_desc with custom_order — custom_order is irrelevant, drop it
  const r2 = variants.normalizeRecipe({ sort_mode: 'freq_desc', custom_order: ['a', 'b'] });
  assert.equal(r2.custom_order, undefined);
});

test('createVariant: variant sort overrides source column sort_mode', () => {
  // Source has custom_order via meta.processing; variant requests alpha.
  const col = buildSortFixtureCol();
  col.meta = { processing: { sort_mode: 'custom', custom_order: ['c', 'a', 'b'] } };
  const variant = variants.createVariant(col, {
    sourceVarIndex: 0,
    sort_mode: 'custom',
    custom_order: ['b', 'c', 'a']
  });
  // Variant's custom_order wins over source's
  assert.deepEqual(variant.col_values.labels, ['b', 'c', 'a']);
});

test('createVariant: sort_mode combined with merges respects merge labels', () => {
  // income-style scenario: merge then sort the merged labels by custom_order.
  const col = factors.makeColumn(
    ['high','low','middle','high','low','middle','high','low','middle','low'],
    { col_type: 'q', includeBaseVariant: true }
  );
  col.col_hash = 'h_income';
  col.meta = {
    replacements: [{ from: 'high', to: 'High' }, { from: 'low', to: 'Low' }, { from: 'middle', to: 'Middle' }],
    processing: { sort_mode: 'custom', custom_order: ['Low', 'Middle', 'High'] }
  };
  const variant = variants.createVariant(col, {
    sourceVarIndex: 0,
    merges: [{ label: 'Low/Middle', levels: ['Low', 'Middle'] }],
    sort_mode: 'custom',
    custom_order: ['High', 'Low/Middle']
  });
  // Custom variant order overrides the natural ['Low/Middle', 'High'] from merge tracking.
  assert.deepEqual(variant.col_values.labels, ['High', 'Low/Middle']);
});

test('VARIANT_TEMPLATES.q exposes sort_levels (not sort_frequency)', () => {
  const q = variants.VARIANT_TEMPLATES.q;
  const ids = q.map((t) => t.id);
  assert.ok(ids.includes('sort_levels'));
  assert.equal(ids.includes('sort_frequency'), false);
  const sortTpl = q.find((t) => t.id === 'sort_levels');
  assert.deepEqual(sortTpl.options, ['sort_mode', 'custom_order']);
});

test('TRANSFORM_ORDER: sort_frequency replaced by sort_levels', () => {
  assert.ok(variants.TRANSFORM_ORDER.includes('sort_levels'));
  assert.equal(variants.TRANSFORM_ORDER.includes('sort_frequency'), false);
});

test('OPERATION_DEFAULTS exposes sort_mode and custom_order', () => {
  assert.equal(variants.OPERATION_DEFAULTS.sort_mode, 'freq_desc');
  assert.deepEqual(variants.OPERATION_DEFAULTS.custom_order, []);
  // sortByFrequency kept for legacy
  assert.equal(variants.OPERATION_DEFAULTS.sortByFrequency, true);
});

// ---------------------------------------------------------------------------
// removeVariantAt — cascade-delete with re-indexing of preserved downstream
// ---------------------------------------------------------------------------

function buildRemovalScenarioDb() {
  // base column: 'n' with values 1..10
  const col = factors.makeColumn(
    ['1','2','3','4','5','6','7','8','9','10'],
    { col_type: 'n', var_label: 'Score', includeBaseVariant: true }
  );
  col.col_hash = 'h_score';
  col.col_label = 'Score';
  col.col_name = 'score';
  return { database: { columns: [col] }, col };
}

test('removeVariantAt: leaf variant with no dependents is removed cleanly', () => {
  const { database, col } = buildRemovalScenarioDb();
  // v1 = cut into [0, 5, 10] (depends on base)
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v1', kind: 'cut_intervals', sourceVarIndex: 0,
    cut: { breaks: [0, 5, 10], includeLowest: true, right: true }
  }));

  const { warnings } = driver.removeVariantAt(database, 'h_score', 1);
  assert.equal(warnings.length, 0);
  assert.equal(col.col_vars.length, 1); // only base
});

test('removeVariantAt: cascade removes direct dependent + warning per cascade', () => {
  const { database, col } = buildRemovalScenarioDb();
  // v1: cut, v2: search_replace based on v1
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v1 (cut)', kind: 'cut_intervals', sourceVarIndex: 0,
    cut: { breaks: [0, 5, 10], includeLowest: true, right: true }
  }));
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v2 (relabel)', kind: 'search_replace', sourceVarIndex: 1,
    replacements: [{ from: '[0, 5]', to: 'Low' }, { from: '(5, 10]', to: 'High' }]
  }));

  const { warnings } = driver.removeVariantAt(database, 'h_score', 1);
  assert.equal(col.col_vars.length, 1); // both removed
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /v2 \(relabel\)/);
  assert.match(warnings[0], /cascade/i);
});

test('removeVariantAt: deep chain v1 -> v2 -> v3 all cascade when v1 removed', () => {
  const { database, col } = buildRemovalScenarioDb();
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v1', kind: 'cut_intervals', sourceVarIndex: 0,
    cut: { breaks: [0, 5, 10], includeLowest: true, right: true }
  }));
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v2', kind: 'search_replace', sourceVarIndex: 1,
    replacements: [{ from: '[0, 5]', to: 'Low' }]
  }));
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v3', kind: 'search_replace', sourceVarIndex: 2,
    replacements: [{ from: 'Low', to: 'L' }]
  }));

  const { warnings } = driver.removeVariantAt(database, 'h_score', 1);
  assert.equal(col.col_vars.length, 1); // base only
  assert.equal(warnings.length, 2); // v2 + v3
  const joined = warnings.join('\n');
  assert.match(joined, /v2/);
  assert.match(joined, /v3/);
});

test('removeVariantAt: non-dependent sibling is preserved with shifted index', () => {
  const { database, col } = buildRemovalScenarioDb();
  // v1: cut (depends on base)
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v1', kind: 'cut_intervals', sourceVarIndex: 0,
    cut: { breaks: [0, 5, 10], includeLowest: true, right: true }
  }));
  // v2: search_replace depends on v1
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v2', kind: 'search_replace', sourceVarIndex: 1,
    replacements: [{ from: '[0, 5]', to: 'Low' }]
  }));
  // v3: cut depending on base directly (sibling of v1)
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v3', kind: 'cut_intervals', sourceVarIndex: 0,
    cut: { breaks: [0, 3, 10], includeLowest: true, right: true }
  }));

  const { warnings } = driver.removeVariantAt(database, 'h_score', 1);
  // base + v3 remain (v1 + v2 removed)
  assert.equal(col.col_vars.length, 2);
  assert.equal(col.col_vars[1].var_label, 'v3');
  // v3's recipe now has sourceVarIndex remapped from 0 → 0 (base unchanged) — verify it's still 0
  assert.equal(col.col_vars[1].meta.recipe.sourceVarIndex, 0);
  // Only one cascade warning (v2)
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /v2/);
});

test('removeVariantAt: branching dependents — A→B, A→C — both cascade when A removed', () => {
  const { database, col } = buildRemovalScenarioDb();
  // A: cut
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'A', kind: 'cut_intervals', sourceVarIndex: 0,
    cut: { breaks: [0, 5, 10], includeLowest: true, right: true }
  }));
  // B: derived from A
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'B', kind: 'search_replace', sourceVarIndex: 1,
    replacements: [{ from: '[0, 5]', to: 'Low' }]
  }));
  // C: also derived from A
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'C', kind: 'search_replace', sourceVarIndex: 1,
    replacements: [{ from: '(5, 10]', to: 'High' }]
  }));

  const { warnings } = driver.removeVariantAt(database, 'h_score', 1);
  assert.equal(col.col_vars.length, 1);
  assert.equal(warnings.length, 2);
});

test('removeVariantAt: variant without recipe downstream is silently kept (no warning)', () => {
  const { database, col } = buildRemovalScenarioDb();
  // v1: cut (depends on base)
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v1', kind: 'cut_intervals', sourceVarIndex: 0,
    cut: { breaks: [0, 5, 10], includeLowest: true, right: true }
  }));
  // v2: another cut, then we strip its recipe so it can't be replayed
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v2', kind: 'cut_intervals', sourceVarIndex: 0,
    cut: { breaks: [0, 3, 10], includeLowest: true, right: true }
  }));
  delete col.col_vars[2].meta.recipe;

  // Remove v1 (index 1). v2 has no recipe → can't be checked as dependent → preserved.
  const { warnings } = driver.removeVariantAt(database, 'h_score', 1);
  assert.equal(col.col_vars.length, 2);          // base + v2 (kept as-is)
  assert.equal(col.col_vars[1].var_label, 'v2');
  assert.equal(warnings.length, 0);              // silent — no warning for recipe-less preservation
});

test('removeVariantAt: warnings translate via core/i18n (pt_br)', () => {
  const { database, col } = buildRemovalScenarioDb();
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v1', kind: 'cut_intervals', sourceVarIndex: 0,
    cut: { breaks: [0, 5, 10], includeLowest: true, right: true }
  }));
  col.col_vars.push(driver.createVariant(col, {
    var_label: 'v2', kind: 'search_replace', sourceVarIndex: 1,
    replacements: [{ from: '[0, 5]', to: 'Low' }]
  }));

  const { warnings } = driver.removeVariantAt(database, 'h_score', 1, { lang: 'pt_br' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /removida \(cascade\)/);
  assert.match(warnings[0], /v2/);
});

test('removeVariantAt: rejects removeIndex 0 (base not removable)', () => {
  const { database } = buildRemovalScenarioDb();
  assert.throws(
    () => driver.removeVariantAt(database, 'h_score', 0),
    /base variant is not removable/
  );
});

test('removeVariantAt: rejects removeIndex out of bounds', () => {
  const { database } = buildRemovalScenarioDb();
  assert.throws(
    () => driver.removeVariantAt(database, 'h_score', 99),
    /out of bounds/
  );
});

test('removeVariantAt: rejects unknown colHash', () => {
  const { database } = buildRemovalScenarioDb();
  assert.throws(
    () => driver.removeVariantAt(database, 'NO_SUCH', 1),
    /not found/
  );
});
