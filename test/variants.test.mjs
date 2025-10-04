import test from "node:test";
import assert from "node:assert/strict";
import variants from "../json/variants.js";
import factors from "../json/factors.js";
import driver from "../json/driver.js";

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

  const decoded = factors.decodeColValues(
    numericVariant.col_values,
    numericVariant.col_type,
    numericVariant.col_sep
  );
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
  const serialized = factors.parseColumns(rows, hashes, "sample.csv", "2024-01-01T00:00:00.000Z");
  const database = JSON.parse(serialized);
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
  assert.notStrictEqual(updatedColumn.col_vars[0].col_values, updatedColumn.col_values);
  assert.strictEqual(updatedColumn.col_vars[1], numericVariant);
});
