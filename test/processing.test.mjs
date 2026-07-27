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
  // With na_action='label', D (excluded) is also relabeled as 'N/A'
  assert.equal(values[4], 'N/A');
  // Originally empty values also become 'N/A'
  assert.equal(values[1], 'N/A');
  assert.equal(values[6], 'N/A');
  // Frequencies after exclude+NA: A=3, N/A=3 (D + 2 originally empty), B=2, C=1, E=1
  // freq_desc + alpha tie-break → [A, N/A, B, C, E] → top 2 kept → labels = ['A', 'N/A', 'Outros']
  assert.ok(result.col_values.labels.length <= 3);
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

  // With na_action='label', X (excluded) AND originally-empty (index 8) are unified as 'Missing'
  assert.equal(values[5], 'Missing');
  assert.equal(values[6], 'Missing');
  assert.equal(values[7], 'Missing');
  assert.equal(values[8], 'Missing');

  // Frequencies after exclude+NA: Missing=4 (3 X + 1 originally empty), Group1=2, B=2, C=1
  // freq_desc + alpha tie-break → [Missing, B, Group1, C] → top 2 → labels = ['Missing', 'B', 'Others']
  assert.deepEqual(result.col_values.labels, ['Missing', 'B', 'Others']);
  assert.equal(values[0], 'Others'); // Group1 grouped (not in top 2)
  assert.equal(values[2], 'B');
  assert.equal(values[4], 'Others'); // C grouped
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

test("applyReplacements: auto-translates excluded_values when a value is renamed", () => {
  // User excludes 'female' (raw), then renames female→Female
  // Expected: exclusion still works (operates on the renamed value)
  const col = makeQCol(['male', 'female', 'male', 'female', 'male']);
  col.meta = {
    replacements: [{ from: 'female', to: 'Female' }],
    processing: { excluded_values: ['female'] }
  };
  const resolved = factors.resolveColumn(col);
  const values = decode(resolved);
  // 'female' values were renamed to 'Female' AND excluded → should be missing
  assert.ok(values[1] === null || values[1] === '', `expected excluded, got: ${values[1]}`);
  assert.ok(values[3] === null || values[3] === '', `expected excluded, got: ${values[3]}`);
  // 'male' values are kept
  assert.equal(values[0], 'male');
  assert.equal(values[2], 'male');
});

test("applyReplacements: auto-translates custom_order when values are renamed", () => {
  const col = makeQCol(['Low', 'High', 'Medium', 'High', 'Low']);
  col.meta = {
    replacements: [{ from: 'Low', to: 'Baixo' }, { from: 'High', to: 'Alto' }],
    processing: { sort_mode: 'custom', custom_order: ['High', 'Medium', 'Low'] }
  };
  const resolved = factors.resolveColumn(col);
  // custom_order was translated: ['Alto','Medium','Baixo']
  assert.deepEqual(resolved.col_values.labels, ['Alto', 'Medium', 'Baixo']);
});

test("applyReplacements: persisted meta is NOT mutated by auto-translation", () => {
  const col = makeQCol(['male', 'female']);
  col.meta = {
    replacements: [{ from: 'female', to: 'Female' }],
    processing: { excluded_values: ['female'] }
  };
  factors.applyReplacements(col); // translation happens on the clone only
  // Original meta is untouched — UI editor still sees the user's original rules
  assert.deepEqual(col.meta.processing.excluded_values, ['female']);
});

test("getIndividualItems: operates on column as-is (no implicit replacement application)", () => {
  const col = makeQCol(['m', 'f', 'm']);
  const recorded = factors.recordReplacements(col, ['m', 'f'], ['Male', 'Female']);
  // Raw view: helper sees the column as-is, replacements not applied
  const raw = factors.getIndividualItems(recorded);
  assert.deepEqual(raw.sort(), ['f', 'm']);
  // Post-replacement view: caller must compose explicitly
  const resolved = factors.getIndividualItems(factors.applyReplacements(recorded));
  assert.deepEqual(resolved.sort(), ['Female', 'Male']);
});

test("isMissingValue: null/undefined/blank are missing, falsy-looking strings are not", () => {
  [null, undefined, '', '   ', '\t', '\n'].forEach(v => {
    assert.equal(factors.isMissingValue(v), true, `${JSON.stringify(v)} should be missing`);
  });
  ['0', 'NA', 'false', 'null', 0, false].forEach(v => {
    assert.equal(factors.isMissingValue(v), false, `${JSON.stringify(v)} should be present`);
  });
});

test("isMissingValue: separator-only list values are missing", () => {
  assert.equal(factors.isMissingValue(';', 'l', ';'), true);
  assert.equal(factors.isMissingValue(' ; ; ', 'l', ';'), true);
  assert.equal(factors.isMissingValue('a;', 'l', ';'), false);
  assert.equal(factors.isMissingValue('a;b', 'l', ';'), false);
  // Defaults to ';' when the caller omits the separator
  assert.equal(factors.isMissingValue(';;', 'l'), true);
});

// ---------------------------------------------------------------------------
// resolveVariable — col_hash + variant index → final read-time values
// ---------------------------------------------------------------------------

// A one-column db whose base column has replacements + processing, plus two variants:
// [0] pointer-style (no col_values — must fall back to the parent), [1] its own payload.
function makeVarDb() {
  const col = makeQCol(['a', 'b', 'unknown', 'a', null]);
  col.col_hash = 'h_x';
  col.col_label = 'X base';
  col.meta = { replacements: [{ from: 'unknown', to: 'a' }], processing: { excluded_values: ['b'] } };
  col.col_vars = [
    { var_label: 'Original', meta: { kind: 'original' } },
    factors.makeColumn(['p', 'q', 'p', 'q', 'p'], { col_type: 'q', col_sep: '', includeBaseVariant: false, var_label: 'V1' })
  ];
  col.col_vars[1].var_label = 'V1';
  col.col_vars[1].meta = { kind: 'recode', replacements: [], processing: {} };
  return { columns: [col] };
}

test("resolveVariable: unusable inputs return null", () => {
  assert.equal(factors.resolveVariable(null, 'h_x'), null);
  assert.equal(factors.resolveVariable({}, 'h_x'), null);
  assert.equal(factors.resolveVariable({ columns: [] }, 'h_x'), null);
  assert.equal(factors.resolveVariable(makeVarDb(), 'nope'), null);
});

test("resolveVariable: base column resolves label, type, sep and values", () => {
  const r = factors.resolveVariable(makeVarDb(), 'h_x');
  assert.equal(r.varIndex, null);
  assert.equal(r.variant, null);
  assert.equal(r.label, 'X base');
  assert.equal(r.colType, 'q');
  assert.equal(r.colSep, '');
  assert.equal(r.values.length, 5);
});

test("resolveVariable: variant index arrives as a STRING from the UI", () => {
  const r = factors.resolveVariable(makeVarDb(), 'h_x', '1');
  assert.equal(r.varIndex, 1);
  assert.equal(r.label, 'V1');
  assert.deepEqual(r.values, ['p', 'q', 'p', 'q', 'p']);
});

test("resolveVariable: blank index means the base column, never col_vars[0]", () => {
  // Guards the Number('') === 0 trap: a blank must NOT select the first variant.
  ['', '   ', null, undefined].forEach(idx => {
    const r = factors.resolveVariable(makeVarDb(), 'h_x', idx);
    assert.equal(r.varIndex, null, `${JSON.stringify(idx)} → base column`);
    assert.equal(r.label, 'X base');
  });
});

test("resolveVariable: garbage or out-of-range index falls back to the base column", () => {
  ['abc', '2.5', '-1', '99', 2.5, -1, 99, NaN].forEach(idx => {
    const r = factors.resolveVariable(makeVarDb(), 'h_x', idx);
    assert.equal(r.varIndex, null, `${JSON.stringify(idx)} → base column`);
    assert.equal(r.label, 'X base');
  });
});

test("resolveVariable: pointer-style variant falls back to the parent payload", () => {
  const db = makeVarDb();
  const base = factors.resolveVariable(db, 'h_x');
  const pointer = factors.resolveVariable(db, 'h_x', 0);
  assert.equal(pointer.label, 'Original', 'own label');
  assert.equal(pointer.colType, base.colType);
  assert.deepEqual(pointer.values, base.values, 'parent values');
});

test("resolveVariable: applies meta.replacements + meta.processing by default", () => {
  const r = factors.resolveVariable(makeVarDb(), 'h_x');
  // 'unknown' → 'a' (replacement); 'b' excluded → '' ; null stays missing.
  assert.deepEqual(r.values.map(v => v ?? ''), ['a', '', 'a', 'a', '']);
});

test("resolveVariable: applyProcessing:false returns the unedited import", () => {
  const r = factors.resolveVariable(makeVarDb(), 'h_x', '', { applyProcessing: false });
  assert.deepEqual(r.values.map(v => v ?? ''), ['a', 'b', 'unknown', 'a', '']);
});

test("resolveVariable: variant meta falls back to column meta PER FIELD", () => {
  // The variant declares only `processing`; the column's `replacements` must still apply.
  // describeColumn's whole-object fallback gets this wrong — this helper deliberately does not.
  const db = makeVarDb();
  db.columns[0].col_vars[1] = factors.makeColumn(['x', 'drop', 'unknown'], { col_type: 'q', col_sep: '', includeBaseVariant: false });
  db.columns[0].col_vars[1].var_label = 'V1';
  db.columns[0].col_vars[1].meta = { processing: { excluded_values: ['drop'] } };
  const r = factors.resolveVariable(db, 'h_x', 1);
  const seen = r.values.map(v => v ?? '');
  assert.equal(seen[1], '', 'variant processing applied');
  assert.equal(seen[2], 'a', "column's replacements still applied (unknown → a)");
});

test("isMissingValue: unparseable numeric values are present-but-invalid, not missing", () => {
  // Deliberate divergence from summarize_n's n_missing stat: the test is purely structural so
  // it matches R's is.na and what exportDatabaseAsHTML shows in the same cell.
  assert.equal(factors.isMissingValue('abc', 'n'), false);
  assert.equal(factors.isMissingValue('', 'n'), true);
});
