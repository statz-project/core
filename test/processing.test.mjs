import test from "node:test";
import assert from "node:assert/strict";
import factors from "../json/factors.js";
import driver from "../json/driver.js";

// Helper: build a qualitative column with compact encoding
function makeQCol(values, meta = {}) {
  const col = factors.makeColumn(values, { col_type: 'q', col_sep: '', includeBaseVariant: false });
  col.col_hash = 'test_hash';
  col.col_label = 'test';
  col.meta = { replacements: [], processing: {}, ...meta };
  return col;
}

// Helper: build a list column
function makeListCol(values, sep = ';', meta = {}) {
  const col = factors.makeColumn(values, { col_type: 'l', col_sep: sep, includeBaseVariant: false });
  col.col_hash = 'test_hash';
  col.col_label = 'test';
  col.meta = { replacements: [], processing: {}, ...meta };
  return col;
}

// Helper: build a numeric column
function makeNumCol(values, meta = {}) {
  const col = factors.makeColumn(values, { col_type: 'n', col_sep: '', includeBaseVariant: false });
  col.col_hash = 'test_hash';
  col.col_label = 'test';
  col.meta = { replacements: [], processing: {}, ...meta };
  return col;
}

// Helper: decode a column's values for assertions
function decode(col) {
  return factors.decodeColumn({ col_type: col.col_type, col_sep: col.col_sep, col_values: col.col_values });
}

// --- Unit tests for applyProcessing ---

test("applyProcessing: no meta returns clone unchanged", () => {
  const col = makeQCol(['A', 'B', 'C', 'A']);
  delete col.meta;
  const result = factors.applyProcessing(col);
  assert.deepEqual(decode(result), decode(col));
  assert.notStrictEqual(result, col); // different object
  assert.notStrictEqual(result.col_values, col.col_values); // different col_values
});

test("applyProcessing: empty meta.processing returns clone unchanged", () => {
  const col = makeQCol(['A', 'B', 'C', 'A']);
  const result = factors.applyProcessing(col);
  assert.deepEqual(decode(result), decode(col));
});

test("applyProcessing: na_action=label replaces empty values", () => {
  const col = makeQCol(['A', '', 'B', '', 'A'], { processing: { na_action: 'label', na_label: 'Missing' } });
  const result = factors.applyProcessing(col);
  const values = decode(result);
  assert.equal(values[1], 'Missing');
  assert.equal(values[3], 'Missing');
  assert.equal(values[0], 'A');
});

test("applyProcessing: na_action=keep leaves empty values", () => {
  const col = makeQCol(['A', '', 'B'], { processing: { na_action: 'keep' } });
  const result = factors.applyProcessing(col);
  const values = decode(result);
  // empty values remain as missing (null or empty string)
  const v = values[1];
  assert.ok(v === null || v === '', `expected null or empty, got: ${v}`);
});

test("applyProcessing: excluded_values on q column", () => {
  const col = makeQCol(['A', 'B', 'C', 'A', 'B', 'C'], { processing: { excluded_values: ['C'] } });
  const result = factors.applyProcessing(col);
  const values = decode(result);
  // C values should become missing (null or empty)
  values.forEach((v, i) => {
    if (i === 2 || i === 5) assert.ok(v === null || v === '', `index ${i} should be missing, got: ${v}`);
    else assert.ok(v && v !== '', `index ${i} should not be empty`);
  });
});

test("applyProcessing: excluded_values on list column removes individual items", () => {
  const col = makeListCol(['A;B', 'B;C', 'A;C', 'C'], ';', { processing: { excluded_values: ['C'] } });
  const result = factors.applyProcessing(col);
  const values = decode(result);
  assert.equal(values[0], 'A;B');
  assert.equal(values[1], 'B');
  assert.equal(values[2], 'A');
  // C was the only item, now empty/missing
  assert.ok(values[3] === '' || values[3] === null, `expected empty, got: ${values[3]}`);
});

test("applyProcessing: excluded_values on numeric column", () => {
  const col = makeNumCol(['10', '20', '30', '10'], { processing: { excluded_values: ['20'] } });
  const result = factors.applyProcessing(col);
  const values = decode(result);
  assert.ok(values[1] === '' || values[1] === null, `expected excluded, got: ${values[1]}`); // 20 should be excluded
  assert.equal(values[0], '10');
});

test("applyProcessing: sort_mode=freq_desc reorders labels", () => {
  // A=3, B=2, C=1
  const col = makeQCol(['A', 'A', 'A', 'B', 'B', 'C'], { processing: { sort_mode: 'freq_desc' } });
  const result = factors.applyProcessing(col);
  assert.deepEqual(result.col_values.labels, ['A', 'B', 'C']);
});

test("applyProcessing: sort_mode=freq_asc reorders labels", () => {
  // A=3, B=2, C=1
  const col = makeQCol(['A', 'A', 'A', 'B', 'B', 'C'], { processing: { sort_mode: 'freq_asc' } });
  const result = factors.applyProcessing(col);
  assert.deepEqual(result.col_values.labels, ['C', 'B', 'A']);
});

test("applyProcessing: sort_mode=alpha reorders labels alphabetically", () => {
  const col = makeQCol(['C', 'A', 'B', 'C', 'A'], { processing: { sort_mode: 'alpha' } });
  const result = factors.applyProcessing(col);
  assert.deepEqual(result.col_values.labels, ['A', 'B', 'C']);
  // verify codes still decode correctly
  assert.deepEqual(decode(result), ['C', 'A', 'B', 'C', 'A']);
});

test("applyProcessing: sort_mode=custom reorders by custom_order", () => {
  const col = makeQCol(['A', 'B', 'C', 'D'], {
    processing: { sort_mode: 'custom', custom_order: ['D', 'B'] }
  });
  const result = factors.applyProcessing(col);
  // D and B first, then remaining (A, C) in original order
  assert.equal(result.col_values.labels[0], 'D');
  assert.equal(result.col_values.labels[1], 'B');
  // A and C appended
  assert.ok(result.col_values.labels.includes('A'));
  assert.ok(result.col_values.labels.includes('C'));
  // values still decode correctly
  assert.deepEqual(decode(result), ['A', 'B', 'C', 'D']);
});

test("applyProcessing: custom_order with values not in labels are ignored", () => {
  const col = makeQCol(['A', 'B'], {
    processing: { sort_mode: 'custom', custom_order: ['Z', 'B', 'A'] }
  });
  const result = factors.applyProcessing(col);
  // Z is not in labels, should be ignored
  assert.deepEqual(result.col_values.labels, ['B', 'A']);
});

test("applyProcessing: top_n groups excess levels", () => {
  // freq_desc: A=3, B=2, C=1, D=1
  const col = makeQCol(['A', 'A', 'A', 'B', 'B', 'C', 'D'], {
    processing: { sort_mode: 'freq_desc', top_n: 2, top_n_label: 'Others' }
  });
  const result = factors.applyProcessing(col);
  assert.deepEqual(result.col_values.labels, ['A', 'B', 'Others']);
  const values = decode(result);
  assert.equal(values[5], 'Others'); // was C
  assert.equal(values[6], 'Others'); // was D
  assert.equal(values[0], 'A');
  assert.equal(values[3], 'B');
});

test("applyProcessing: full pipeline NA + exclude + sort + top_n", () => {
  const col = makeQCol(['A', '', 'B', 'C', 'D', 'E', '', 'A', 'A', 'B'], {
    processing: {
      na_action: 'label',
      na_label: 'N/A',
      excluded_values: ['D'],
      sort_mode: 'freq_desc',
      top_n: 2,
      top_n_label: 'Outros'
    }
  });
  const result = factors.applyProcessing(col);
  const values = decode(result);
  // D should be excluded (null or empty)
  assert.ok(values[4] === null || values[4] === '', `expected excluded, got: ${values[4]}`);
  // Originally empty values -> N/A
  // A=3, N/A=2, B=2, C=1, E=1 -> top 2 after sort: A, B or A, N/A (ties broken alphabetically)
  // After top_n=2: first 2 labels kept, rest -> Outros
  assert.ok(result.col_values.labels.length <= 3); // top_n + "Outros"
});

test("applyProcessing: numeric column only applies NA and exclude (no sort/top_n)", () => {
  const col = makeNumCol(['10', '20', '30', ''], {
    processing: { na_action: 'label', na_label: 'Missing', sort_mode: 'freq_desc', top_n: 1 }
  });
  const result = factors.applyProcessing(col);
  const values = decode(result);
  assert.equal(values[3], 'Missing');
  // sort and top_n should NOT apply to numeric columns
  // (no labels array to sort)
});

test("applyProcessing: original column object is NOT mutated", () => {
  const col = makeQCol(['A', 'B', 'C'], { processing: { excluded_values: ['B'] } });
  const originalLabels = [...col.col_values.labels];
  const originalCodes = [...col.col_values.codes];
  factors.applyProcessing(col);
  assert.deepEqual(col.col_values.labels, originalLabels);
  assert.deepEqual(col.col_values.codes, originalCodes);
});

test("applyProcessing: empty labels array causes no error", () => {
  const col = { col_type: 'q', col_sep: '', col_values: { col_compact: true, labels: [], codes: [], raw_values: null }, meta: { processing: { sort_mode: 'freq_desc' } } };
  const result = factors.applyProcessing(col);
  assert.ok(result);
});

test("applyProcessing: options parameter overrides meta.processing", () => {
  const col = makeQCol(['A', '', 'B'], { processing: { na_action: 'keep' } });
  // Override na_action via options parameter
  const result = factors.applyProcessing(col, { na_action: 'label', na_label: 'X' });
  const values = decode(result);
  assert.equal(values[1], 'X');
});

// --- Integration tests ---

test("describeColumn applies meta.processing", () => {
  const col = makeQCol(['A', 'A', 'A', 'B', 'B', 'C'], { processing: { excluded_values: ['C'] } });
  col.col_vars = [];
  const description = driver.describeColumn(col, null, { structured: true });
  // C should not appear in the description
  const labels = description.map(d => d.label);
  assert.ok(!labels.includes('C'), 'C should be excluded from description');
  assert.ok(labels.includes('A'), 'A should be in description');
  assert.ok(labels.includes('B'), 'B should be in description');
});

test("resolveColumn: pipeline order (replacements → exclude → NA → sort → top_n)", () => {
  // Step 0: record replacement A→Group1 (NON-destructive — applied lazily)
  const base = makeQCol(['A', 'A', 'B', 'B', 'C', 'X', 'X', 'X', '']);
  const replaced = factors.recordReplacements(base, ['A'], ['Group1']);
  // col_values is unchanged by recordReplacements
  assert.deepEqual(replaced.col_values, base.col_values);

  replaced.meta.processing = {
    excluded_values: ['X'],
    na_action: 'label',
    na_label: 'Missing',
    sort_mode: 'freq_desc',
    top_n: 2,
    top_n_label: 'Others'
  };

  // resolveColumn applies replacements + processing in one pass
  const result = factors.resolveColumn(replaced);
  const values = decode(result);

  // X (indices 5,6,7) was excluded BEFORE NA → stays empty, never relabeled as Missing
  assert.ok(values[5] === null || values[5] === '', `excluded should be empty, got: ${values[5]}`);
  assert.ok(values[6] === null || values[6] === '', `excluded should be empty, got: ${values[6]}`);
  assert.ok(values[7] === null || values[7] === '', `excluded should be empty, got: ${values[7]}`);

  // Originally-empty (index 8) was labeled Missing, but Missing freq=1 → grouped into Others by top_n
  // Frequencies after exclusion+NA: Group1=2, B=2, C=1, Missing=1
  // freq_desc with alpha tie-break → [B, Group1, C, Missing] → top 2 → [B, Group1, Others]
  assert.deepEqual(result.col_values.labels, ['B', 'Group1', 'Others']);
  assert.equal(values[0], 'Group1'); // was A → Group1
  assert.equal(values[2], 'B');
  assert.equal(values[4], 'Others'); // C grouped
  assert.equal(values[8], 'Others'); // originally '' → Missing → grouped
});

test("recordReplacements + processing work together via resolveColumn", () => {
  // Record replacements (non-destructive)
  const col = makeQCol(['m', 'f', 'f', 'm', 'unknown']);
  const replaced = factors.recordReplacements(col, ['m', 'f'], ['Male', 'Female']);
  // col_values stays untouched
  assert.deepEqual(replaced.col_values, col.col_values);
  // Then add processing
  replaced.meta.processing = { excluded_values: ['unknown'] };
  const result = factors.resolveColumn(replaced);
  const values = decode(result);
  assert.ok(values.includes('Male'));
  assert.ok(values.includes('Female'));
  // 'unknown' should be excluded (null or empty)
  assert.ok(values[4] === null || values[4] === '', `expected excluded, got: ${values[4]}`);
});

test("recordReplacements: subsequent call overwrites previous meta.replacements", () => {
  const col = makeQCol(['a', 'b', 'c']);
  const r1 = factors.recordReplacements(col, ['a'], ['A']);
  assert.deepEqual(r1.meta.replacements, [{ from: 'a', to: 'A' }]);
  const r2 = factors.recordReplacements(r1, ['b'], ['B']);
  // Setter semantics: r2 replaces the entire array
  assert.deepEqual(r2.meta.replacements, [{ from: 'b', to: 'B' }]);
});

test("applyReplacements: returns clone unchanged when no replacements present", () => {
  const col = makeQCol(['a', 'b', 'c']);
  const result = factors.applyReplacements(col);
  assert.deepEqual(decode(result), decode(col));
  assert.notStrictEqual(result, col);
});

test("applyReplacements: list column applies item-by-item within separator", () => {
  const col = factors.makeColumn(['a;b', 'b;c', 'a'], { col_type: 'l', col_sep: ';', includeBaseVariant: false });
  col.meta = { replacements: [{ from: 'a', to: 'Alpha' }, { from: 'b', to: 'Bravo' }] };
  const result = factors.applyReplacements(col);
  const values = decode(result);
  assert.equal(values[0], 'Alpha;Bravo');
  assert.equal(values[1], 'Bravo;c');
  assert.equal(values[2], 'Alpha');
});

test("getIndividualItems: applyReplacements=false returns raw values", () => {
  const col = makeQCol(['m', 'f', 'm']);
  const recorded = factors.recordReplacements(col, ['m', 'f'], ['Male', 'Female']);
  const raw = factors.getIndividualItems(recorded, { applyReplacements: false });
  // Raw view: still sees original labels
  assert.deepEqual(raw.sort(), ['f', 'm']);
  // Default view: post-replacement
  const resolved = factors.getIndividualItems(recorded);
  assert.deepEqual(resolved.sort(), ['Female', 'Male']);
});
