import test from "node:test";
import assert from "node:assert/strict";
import driver from "../json/driver.js";
import factors from "../json/factors.js";
import snapshots from "../json/snapshots.js";
import { fnv1a, canonicalStringify } from "../json/hashing.js";

// ---------------------------------------------------------------------------
// Fixture factory — small self-contained database with two variants on the q column.
// ---------------------------------------------------------------------------

function makeFixtureDb() {
  return {
    columns: [
      {
        col_hash: "h_biomarker",
        col_label: "Biomarker",
        col_type: "n",
        col_sep: "",
        col_del: false,
        col_values: { col_compact: false, labels: null, codes: null,
          raw_values: ["1.5", "2.3", "3.1", "4.0", "5.2"] },
        col_vars: [],
        meta: {}
      },
      {
        col_hash: "h_sex",
        col_label: "Sex",
        col_type: "q",
        col_sep: "",
        col_del: false,
        col_values: { col_compact: true, labels: ["female", "male"], codes: [1,2,1,2,1], raw_values: null },
        col_vars: [
          { var_label: "Sex (original)", col_type: "q", col_sep: "",
            col_values: { col_compact: true, labels: ["female","male"], codes: [1,2,1,2,1], raw_values: null },
            meta: { kind: "original" } },
          { var_label: "Sex (merged)", col_type: "q", col_sep: "",
            col_values: { col_compact: true, labels: ["all"], codes: [1,1,1,1,1], raw_values: null },
            meta: { kind: "custom", source_var_index: 0, recipe: { merges: [{ into: "all", from: ["female","male"] }] } } }
        ],
        meta: {}
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// hashing.js — sanity
// ---------------------------------------------------------------------------

test("fnv1a: deterministic across calls", () => {
  assert.equal(fnv1a("abc"), fnv1a("abc"));
  assert.notEqual(fnv1a("abc"), fnv1a("abd"));
  assert.match(fnv1a(""), /^[0-9a-f]{8}$/);
});

test("canonicalStringify: sorts object keys recursively; preserves array order", () => {
  assert.equal(canonicalStringify({b:1,a:2}), canonicalStringify({a:2,b:1}));
  assert.equal(canonicalStringify({outer:{b:1,a:2}}), canonicalStringify({outer:{a:2,b:1}}));
  assert.notEqual(canonicalStringify([1,2,3]), canonicalStringify([3,2,1]));
});

// ---------------------------------------------------------------------------
// refreshDatabaseHashes — stability + sensitivity
// ---------------------------------------------------------------------------

test("refreshDatabaseHashes: idempotent — same output on repeated calls", () => {
  const db = makeFixtureDb();
  snapshots.refreshDatabaseHashes(db);
  const first = db.columns.map(c => c.col_content_hash);
  const firstVars = db.columns[1].col_vars.map(v => v.var_content_hash);
  snapshots.refreshDatabaseHashes(db);
  assert.deepEqual(db.columns.map(c => c.col_content_hash), first);
  assert.deepEqual(db.columns[1].col_vars.map(v => v.var_content_hash), firstVars);
});

test("refreshDatabaseHashes: rename col_label flips col_content_hash", () => {
  const db = makeFixtureDb();
  snapshots.refreshDatabaseHashes(db);
  const before = db.columns[0].col_content_hash;
  db.columns[0].col_label = "Biomarker (renamed)";
  snapshots.refreshDatabaseHashes(db);
  assert.notEqual(db.columns[0].col_content_hash, before);
});

test("refreshDatabaseHashes: rename var_label flips var_content_hash but not col_content_hash", () => {
  const db = makeFixtureDb();
  snapshots.refreshDatabaseHashes(db);
  const colBefore = db.columns[1].col_content_hash;
  const varBefore = db.columns[1].col_vars[1].var_content_hash;
  db.columns[1].col_vars[1].var_label = "Sex (renamed)";
  snapshots.refreshDatabaseHashes(db);
  assert.notEqual(db.columns[1].col_vars[1].var_content_hash, varBefore);
  assert.equal(db.columns[1].col_content_hash, colBefore, "col hash unaffected by variant rename");
});

test("refreshDatabaseHashes: edit meta.replacements flips col_content_hash", () => {
  const db = makeFixtureDb();
  snapshots.refreshDatabaseHashes(db);
  const before = db.columns[1].col_content_hash;
  db.columns[1].meta.replacements = [{ from: "female", to: "F" }];
  snapshots.refreshDatabaseHashes(db);
  assert.notEqual(db.columns[1].col_content_hash, before);
});

test("refreshDatabaseHashes: edit col_values on base flips base AND all descendant variant hashes (chain)", () => {
  const db = makeFixtureDb();
  snapshots.refreshDatabaseHashes(db);
  const beforeCol = db.columns[1].col_content_hash;
  const beforeVar0 = db.columns[1].col_vars[0].var_content_hash;
  const beforeVar1 = db.columns[1].col_vars[1].var_content_hash;
  db.columns[1].col_values.codes = [1,1,1,1,1];
  snapshots.refreshDatabaseHashes(db);
  assert.notEqual(db.columns[1].col_content_hash, beforeCol);
  // Both variants derive from base (source_var_index=0 → base). Both flip.
  assert.notEqual(db.columns[1].col_vars[0].var_content_hash, beforeVar0, "original variant chained to base");
  assert.notEqual(db.columns[1].col_vars[1].var_content_hash, beforeVar1, "custom variant chained to base");
});

test("refreshDatabaseHashes: adding a variant leaves existing variant hashes stable", () => {
  const db = makeFixtureDb();
  snapshots.refreshDatabaseHashes(db);
  const existing = db.columns[1].col_vars.map(v => v.var_content_hash);
  db.columns[1].col_vars.push({
    var_label: "Sex (new)", col_type: "q", col_sep: "",
    col_values: { col_compact: true, labels: ["x","y"], codes: [1,2,1,2,1], raw_values: null },
    meta: { kind: "custom", source_var_index: 0, recipe: {} }
  });
  snapshots.refreshDatabaseHashes(db);
  assert.equal(db.columns[1].col_vars[0].var_content_hash, existing[0]);
  assert.equal(db.columns[1].col_vars[1].var_content_hash, existing[1]);
  assert.ok(db.columns[1].col_vars[2].var_content_hash);
});

test("refreshDatabaseHashes: toggling col_del flips col_content_hash (reactive soft-delete)", () => {
  const db = makeFixtureDb();
  snapshots.refreshDatabaseHashes(db);
  const before = db.columns[0].col_content_hash;
  db.columns[0].col_del = true;
  snapshots.refreshDatabaseHashes(db);
  assert.notEqual(db.columns[0].col_content_hash, before);
});

// ---------------------------------------------------------------------------
// computeElementSnapshot
// ---------------------------------------------------------------------------

function makePredictors() {
  return [
    { database_id: "db1", col_hash: "h_biomarker", col_var_index: null, col_label: "Biomarker" }
  ];
}
function makeResponses() {
  return [
    { database_id: "db1", col_hash: "h_sex", col_var_index: 1, col_label: "Sex (merged)" }
  ];
}

test("computeElementSnapshot: identical inputs → equal snapshots (string comparable)", () => {
  const db1 = makeFixtureDb(); snapshots.refreshDatabaseHashes(db1);
  const db2 = makeFixtureDb(); snapshots.refreshDatabaseHashes(db2);
  const a = snapshots.computeElementSnapshot(makePredictors(), makeResponses(), { db1 }, { alpha: 0.05 });
  const b = snapshots.computeElementSnapshot(makePredictors(), makeResponses(), { db1: db2 }, { alpha: 0.05 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("computeElementSnapshot: mutating a referenced column flips exactly its entry", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const before = snapshots.computeElementSnapshot(makePredictors(), makeResponses(), { db1: db }, {});
  db.columns[0].col_label = "Biomarker (renamed)";
  snapshots.refreshDatabaseHashes(db);
  const after = snapshots.computeElementSnapshot(makePredictors(), makeResponses(), { db1: db }, {});
  const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
  // Only the biomarker key changed. Ordering + options untouched.
  assert.deepEqual(changed, ["db1#h_biomarker#null"]);
});

test("computeElementSnapshot: unreferenced db not present → returns MISSING", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const snap = snapshots.computeElementSnapshot(makePredictors(), makeResponses(), {}, {});
  assert.equal(snap["db1#h_biomarker#null"], "MISSING");
  assert.equal(snap["db1#h_sex#1"], "MISSING");
});

test("computeElementSnapshot: unknown col_hash → MISSING", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const preds = [{ database_id: "db1", col_hash: "does_not_exist", col_var_index: null }];
  const snap = snapshots.computeElementSnapshot(preds, [], { db1: db }, {});
  assert.equal(snap["db1#does_not_exist#null"], "MISSING");
});

test("computeElementSnapshot: out-of-range col_var_index → MISSING", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const preds = [{ database_id: "db1", col_hash: "h_sex", col_var_index: 99 }];
  const snap = snapshots.computeElementSnapshot(preds, [], { db1: db }, {});
  assert.equal(snap["db1#h_sex#99"], "MISSING");
});

test("computeElementSnapshot: reordering predictors flips __predictor_order only", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const p1 = [
    { database_id: "db1", col_hash: "h_biomarker", col_var_index: null },
    { database_id: "db1", col_hash: "h_sex", col_var_index: null }
  ];
  const p2 = [p1[1], p1[0]]; // swapped
  const a = snapshots.computeElementSnapshot(p1, [], { db1: db }, {});
  const b = snapshots.computeElementSnapshot(p2, [], { db1: db }, {});
  assert.notEqual(a["__predictor_order"], b["__predictor_order"]);
  // Individual data entries are keyed by identity, not order, so they match.
  assert.equal(a["db1#h_biomarker#null"], b["db1#h_biomarker#null"]);
  assert.equal(a["db1#h_sex#null"], b["db1#h_sex#null"]);
});

test("computeElementSnapshot: changing analysis_options flips __analysis_options only", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const a = snapshots.computeElementSnapshot(makePredictors(), makeResponses(), { db1: db }, { alpha: 0.05 });
  const b = snapshots.computeElementSnapshot(makePredictors(), makeResponses(), { db1: db }, { alpha: 0.01 });
  assert.notEqual(a["__analysis_options"], b["__analysis_options"]);
  assert.equal(a["db1#h_biomarker#null"], b["db1#h_biomarker#null"]);
  assert.equal(a["__predictor_order"], b["__predictor_order"]);
});

test("computeElementSnapshot: backward compat — legacy db without hashes gets refreshed on the fly", () => {
  const db = makeFixtureDb(); // NO refresh
  assert.equal(db.columns[0].col_content_hash, undefined);
  const snap = snapshots.computeElementSnapshot(makePredictors(), makeResponses(), { db1: db }, {});
  // Hashes were injected transparently; snapshot has proper values (not MISSING).
  assert.ok(snap["db1#h_biomarker#null"]);
  assert.notEqual(snap["db1#h_biomarker#null"], "MISSING");
  assert.ok(db.columns[0].col_content_hash, "backfilled");
});

test("computeElementSnapshot: keys sorted alphabetically for string-comparable output", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const snap = snapshots.computeElementSnapshot(makePredictors(), makeResponses(), { db1: db }, {});
  const keys = Object.keys(snap);
  assert.deepEqual(keys, [...keys].sort());
});

// ---------------------------------------------------------------------------
// refreshColumnHashes — per-column fast path
// ---------------------------------------------------------------------------

test("refreshColumnHashes: produces hashes identical to refreshDatabaseHashes for the target column", () => {
  const dbA = makeFixtureDb();
  const dbB = makeFixtureDb();
  snapshots.refreshDatabaseHashes(dbA);
  snapshots.refreshColumnHashes(dbB, "h_sex");
  // The h_sex column and its variants should have the same hashes under either path.
  assert.equal(dbA.columns[1].col_content_hash, dbB.columns[1].col_content_hash);
  assert.deepEqual(
    dbA.columns[1].col_vars.map(v => v.var_content_hash),
    dbB.columns[1].col_vars.map(v => v.var_content_hash)
  );
});

test("refreshColumnHashes: isolates its work — other columns' hashes stay untouched", () => {
  const db = makeFixtureDb();
  snapshots.refreshDatabaseHashes(db);
  const biomarkerBefore = db.columns[0].col_content_hash;
  // Now mutate the sex column and refresh ONLY it.
  db.columns[1].col_label = "Sex (renamed)";
  const returned = snapshots.refreshColumnHashes(db, "h_sex");
  assert.equal(returned, db.columns[1], "returns the mutated column reference");
  assert.equal(db.columns[0].col_content_hash, biomarkerBefore, "biomarker hash untouched");
});

test("refreshColumnHashes: chain propagation within the target column still works", () => {
  const db = makeFixtureDb();
  snapshots.refreshDatabaseHashes(db);
  const varBefore = db.columns[1].col_vars.map(v => v.var_content_hash);
  // Edit the base column's values; per-column refresh must flip both the base hash
  // AND every derived variant's hash (chain propagation intra-column).
  db.columns[1].col_values.codes = [2, 2, 2, 2, 2];
  snapshots.refreshColumnHashes(db, "h_sex");
  assert.notEqual(db.columns[1].col_vars[0].var_content_hash, varBefore[0]);
  assert.notEqual(db.columns[1].col_vars[1].var_content_hash, varBefore[1]);
});

test("refreshColumnHashes: unknown col_hash → returns null, database untouched", () => {
  const db = makeFixtureDb();
  snapshots.refreshDatabaseHashes(db);
  const before = db.columns.map(c => c.col_content_hash);
  const result = snapshots.refreshColumnHashes(db, "not_a_real_hash");
  assert.equal(result, null);
  assert.deepEqual(db.columns.map(c => c.col_content_hash), before, "no columns touched");
});

// ---------------------------------------------------------------------------
// Self-guard: empty predictors + responses → empty snapshot
// ---------------------------------------------------------------------------

test("computeElementSnapshot: empty predictors AND empty responses → {} (no markers)", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const snap = snapshots.computeElementSnapshot([], [], { db1: db }, { alpha: 0.05 });
  assert.deepEqual(snap, {}, "no state to snapshot when both arrays are empty");
});

test("computeElementSnapshot: empty predictors only (Profile B-like) → full snapshot with markers", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const snap = snapshots.computeElementSnapshot([], makeResponses(), { db1: db }, {});
  assert.ok(snap['__response_order'], 'Profile B: response ordering marker present');
  assert.ok(snap['__predictor_order'], 'predictor marker still present (hashes empty list, not skipped)');
  assert.ok(snap['__analysis_options']);
  assert.ok(snap['db1#h_sex#1']);
});

test("computeElementSnapshot: empty responses only (Profile A/C-like) → full snapshot with markers", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const snap = snapshots.computeElementSnapshot(makePredictors(), [], { db1: db }, {});
  assert.ok(snap['__predictor_order']);
  assert.ok(snap['__response_order'], 'still emitted (hashes empty list)');
  assert.ok(snap['__analysis_options']);
  assert.ok(snap['db1#h_biomarker#null']);
});

test("computeElementSnapshot: accepts JSON-stringified entries (Update_result_json contract)", () => {
  // updateColumnLabelsFromDb returns an array of JSON-stringified shapes, not parsed
  // objects. Snapshot must parse them just like runAnalysis does — otherwise every
  // entry collapses to key "##null" with value "MISSING".
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const stringPreds = makePredictors().map((p) => JSON.stringify(p));
  const stringResps = makeResponses().map((r) => JSON.stringify(r));
  const snapA = snapshots.computeElementSnapshot(stringPreds, stringResps, { db1: db }, {});
  // Equivalence: parsed-in vs stringified-in must produce the same snapshot.
  const snapB = snapshots.computeElementSnapshot(makePredictors(), makeResponses(), { db1: db }, {});
  assert.deepEqual(snapA, snapB);
  assert.ok(snapA['db1#h_biomarker#null']);
  assert.notEqual(snapA['db1#h_biomarker#null'], 'MISSING');
});

test("computeElementSnapshot: mixed parsed + string entries handled uniformly", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const mixedPreds = [
    JSON.stringify(makePredictors()[0]),      // string
    { database_id: 'db1', col_hash: 'h_sex', col_var_index: null }  // parsed
  ];
  const snap = snapshots.computeElementSnapshot(mixedPreds, [], { db1: db }, {});
  assert.ok(snap['db1#h_biomarker#null']);
  assert.ok(snap['db1#h_sex#null']);
});

test("computeElementSnapshot: invalid JSON strings are dropped silently (no crash)", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const preds = ['{"invalid json', JSON.stringify(makePredictors()[0])];
  const snap = snapshots.computeElementSnapshot(preds, [], { db1: db }, {});
  // Only the valid entry contributes.
  assert.ok(snap['db1#h_biomarker#null']);
  const keys = Object.keys(snap).filter(k => !k.startsWith('__'));
  assert.equal(keys.length, 1);
});

test("computeElementSnapshot: non-array inputs treated as empty (no crash)", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  // Both undefined/null → guard fires, returns {}.
  assert.deepEqual(snapshots.computeElementSnapshot(undefined, undefined, { db1: db }, {}), {});
  assert.deepEqual(snapshots.computeElementSnapshot(null, null, { db1: db }, {}), {});
});

// ---------------------------------------------------------------------------
// Auto-hook in mutators
// ---------------------------------------------------------------------------

test("auto-hook: parseColumns returns db with populated col_content_hash", () => {
  const data = JSON.stringify([
    { age: "20", sex: "male" },
    { age: "30", sex: "female" }
  ]);
  const db = factors.parseColumns(data, ["h_age", "h_sex"], "test.csv", "2026-01-01");
  assert.ok(db.columns[0].col_content_hash, "col_content_hash populated after parseColumns");
  assert.ok(db.columns[1].col_content_hash);
});

test("auto-hook: addVariant refreshes hashes on the mutated database", () => {
  const db = makeFixtureDb(); snapshots.refreshDatabaseHashes(db);
  const before = db.columns[0].col_content_hash;
  const newVariant = {
    var_label: "Age binned", col_type: "n", col_sep: "",
    col_values: { col_compact: false, labels: null, codes: null, raw_values: ["1","2","3","4","5"] },
    meta: { kind: "custom", source_var_index: 0, recipe: {} }
  };
  driver.addVariant(db, "h_biomarker", newVariant);
  // Base column hash unchanged; new variant got a hash.
  assert.equal(db.columns[0].col_content_hash, before);
  const added = db.columns[0].col_vars[db.columns[0].col_vars.length - 1];
  assert.ok(added.var_content_hash);
});


