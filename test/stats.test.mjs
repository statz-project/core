import test from "node:test";
import assert from "node:assert/strict";
import variants from "../json/variants.js";
import factors from "../json/factors.js";

test("createVariant coerces numeric values", () => {
  const baseValues = ["1", "2", "3", "bad"];
  const colValues = factors.encodeColValues(baseValues, "q", "");
  const baseVariant = {
    var_label: "Original",
    col_type: "q",
    col_sep: "",
    col_values: variants.cloneColValues(colValues),
    meta: { kind: "original" }
  };
  const baseCol = {
    col_type: "q",
    col_sep: "",
    col_values: colValues,
    col_vars: [baseVariant]
  };

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
