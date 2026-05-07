import test from "node:test";
import assert from "node:assert/strict";
// import { parseFixture } from '../scripts/dev/load-fixture.mjs';
import factors from "../json/factors.js";
import driver from "../json/driver.js";
import { decode } from "node:punycode";

// const {parsed} = parseFixture();

test("getIndividualItemsWithCount", () => {

  // test list type

  const values = ['fever,headache', 'headache', 'headache', 'fever,headache,anemia', 'anemia', ''];

  const column = factors.makeColumn(values, { col_type: "l", col_sep: ",", var_label: "symptoms" });

  const countsList = factors.getIndividualItemsWithCount(column, { splitList: true, includeEmpty: true, sortByCount: "desc" });

  assert.deepEqual(countsList, [{ "Value": "headache", "Count": 4 }, { "Value": "anemia", "Count": 2 }, { "Value": "fever", "Count": 2 }, { "Value": "", "Count": 1 }])

  // test factor type

  const columnFactor = { "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["female", "male"], "codes": [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], "raw_values": null }, "col_name": "sex", "col_label": "sex", "col_hash": "3c3662bcb661d6de679c636744c66b62", "col_index": 3, "col_del": false, "col_vars": [] };

  const countFactor = factors.getIndividualItemsWithCount(columnFactor, { splitList: true, includeEmpty: true, sortByCount: "desc" });

  assert.deepEqual(countFactor, [{ "Value": "male", "Count": 94 }, { "Value": "female", "Count": 6 }]);

});

test("recordReplacements + getIndividualItemsWithCount sees replaced values lazily", () => {

  const column = { "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["male", "female"], "codes": [1, 1, 1, 1, 0, 1, 1, 1, 2, 2, 2, 2, 2, 0, 1, 1], "raw_values": null }, "col_name": "sex", "col_label": "sex", "col_hash": "3c3662bcb661d6de679c636744c66b62", "col_index": 2, "col_del": false, "col_vars": [] };

  // Raw view (helpers operate on the column as-is)
  const countsList = factors.getIndividualItemsWithCount(column, { includeEmpty: true });

  // Record replacements into meta (non-destructive — col_values unchanged)
  const newColumn = factors.recordReplacements(column, countsList.map(item => item.Value), ["EMPTY", "FEMALE", "MALE"]);

  // col_values is NOT mutated
  assert.deepEqual(newColumn.col_values, column.col_values);
  // meta.replacements is recorded
  assert.deepEqual(newColumn.meta?.replacements, [
    { from: '', to: 'EMPTY' },
    { from: 'female', to: 'FEMALE' },
    { from: 'male', to: 'MALE' }
  ]);

  // To see post-replacement view, compose explicitly
  const newData = factors.getIndividualItemsWithCount(factors.applyReplacements(newColumn), { includeEmpty: true });
  assert.deepEqual(newData, [{ "Value": "EMPTY", "Count": 2 }, { "Value": "FEMALE", "Count": 5 }, { "Value": "MALE", "Count": 9 }]);

});

test("applyColumnMappings", () => {

  const curr_mappings = [
    { "new_hash": "510492278aec5ab747bc59324e2ceb1b", "new_label": "biomarker", "new_type": "n", "suggested_choice": "510492278aec5ab747bc59324e2ceb1b" },
    { "new_hash": "3c3662bcb661d6de679c636744c66b62", "new_label": "sex", "new_type": "q", "suggested_choice": "3c3662bcb661d6de679c636744c66b62" },
    { "new_hash": "3032ad6aed6c5c3cda992d241f4d28bf", "new_label": "outcome", "new_type": "q", "suggested_choice": "3032ad6aed6c5c3cda992d241f4d28bf" },
    { "new_hash": "b1ccce9f4800002b39d95661dde1185e", "new_label": "clinics", "new_type": "l", "suggested_choice": "NEW" },
    { "new_hash": "601843602f6dbbd59c2b46ee5587374e", "new_label": "new_column", "new_type": "q", "suggested_choice": "NEW" }
  ];
  const new_db = { "columns": [{ "col_type": "n", "col_sep": "", "col_values": { "col_compact": false, "labels": null, "codes": null, "raw_values": ["9.14", "11.56", "11.02", "11.04", "8.88", "8.93", "10.97", "10.17", "7.1", null, "7.5", "7.03", "7.89", "11.09", "8.79", "8.23"] }, "col_name": "biomarker", "col_label": "biomarker", "col_hash": "510492278aec5ab747bc59324e2ceb1b", "col_index": 1, "col_del": false, "col_vars": [] }, { "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["male", "female"], "codes": [1, 1, 1, 1, 0, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1], "raw_values": null }, "col_name": "sex", "col_label": "sex", "col_hash": "3c3662bcb661d6de679c636744c66b62", "col_index": 2, "col_del": false, "col_vars": [] }, { "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["no", "yes"], "codes": [1, 1, 1, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2], "raw_values": null }, "col_name": "outcome", "col_label": "outcome", "col_hash": "3032ad6aed6c5c3cda992d241f4d28bf", "col_index": 3, "col_del": false, "col_vars": [] }, { "col_type": "l", "col_sep": ";", "col_values": { "col_compact": true, "labels": ["headache", "overweight", "dm", "fever", "sneeze", "anemia", "underweight", "fatigue", "cough", "cancer"], "codes": ["1;2", "1;3", "1;2", "1;2", "1;2", "1;2", "", "1;2", "1;2", "1;2", "1;2", "", "1;2", "1;2", "1;3;4;5;6;7;8;9;10", ""], "raw_values": null }, "col_name": "clinics", "col_label": "clinics", "col_hash": "b1ccce9f4800002b39d95661dde1185e", "col_index": 4, "col_del": false, "col_vars": [] }, { "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["a", "b"], "codes": [1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1], "raw_values": null }, "col_name": "new_column", "col_label": "new_column", "col_hash": "601843602f6dbbd59c2b46ee5587374e", "col_index": 5, "col_del": false, "col_vars": [] }], "history": [{ "file": "example.csv", "import_time": "2025-12-02T03:00:34.200Z" }, { "file": "example_small_with_overwrite.csv", "import_time": "2025-12-02T15:10:01.448Z" }] };
  const old_db = { "columns": [{ "col_type": "n", "col_sep": "", "col_values": { "col_compact": true, "labels": ["8", "4", "3", "9", "7", "6", "5", "10"], "codes": [1, 2, 2, 3, 1, 4, 5, 1, 6, 1, 2, 7, 7, 5, 1, 4, 4, 7, 4, 6, 1, 1, 2, 5, 3, 4, 2, 1, 5, 4, 1, 4, 7, 6, 1, 4, 7, 2, 4, 1, 4, 5, 1, 8, 8, 6, 8, 5, 2, 1, 3, 3, 2, 6, 2, 2, 7, 6, 6, 6, 4, 1, 7, 5, 7, 2, 6, 1, 6, 6, 2, 1, 3, 6, 2, 1, 7, 6, 5, 3, 2, 7, 4, 7, 7, 4, 2, 5, 4, 1, 2, 2, 5, 2, 3, 3, 2, 7, 1, 2], "raw_values": null }, "col_name": "score", "col_label": "Score", "col_hash": "ca1cd3c3055991bf20499ee86739f7e2", "col_index": 1, "col_del": false, "col_vars": [] }, { "col_type": "n", "col_sep": "", "col_values": { "col_compact": false, "labels": null, "codes": null, "raw_values": ["8.83", "9.72", "9.64", "10.09", "12.25", "10.83", "11.31", "12.5", "11.17", "9.57", "9", "8.89", "9.94", "11.17", "11.05", "10.06", "9.26", "10.93", "11.67", "10.56", "9.25", "11.26", "10.04", "10.19", "10.46", "9.57", "10.02", "10.7", "10.97", "9.38", "9.14", "10.07", "8.95", "7.25", "8.87", "9.14", "11.56", "11.02", "11.04", "8.88", "8.93", "10.97", "10.17", "7.1", "8.16", "7.5", "7.03", "7.89", "11.09", "8.79", "8.23", "9.51", "10.32", "11.46", "11.54", "9.66", "8.92", "8.51", "9.75", "9.88", "9.35", "10.31", "10.12", "9.16", "10.6", "9.75", "9.82", "10.02", "9.52", "9.26", "11.3", "10.56", "8.19", "10.44", "8.56", "10.95", "9.28", "10.05", "8.44", "7.7", "11.16", "9.3", "8.43", "10.52", "8.94", "10.05", "10.85", "10.43", "10.52", "9.75", "9.5", "11.26", "10.56", "9.66", "10.72", "10.86", "10.37", "11.58", "10.06", "10.13"] }, "col_name": "biomarker", "col_label": "Biomarker", "col_hash": "510492278aec5ab747bc59324e2ceb1b", "col_index": 2, "col_del": false, "col_vars": [] }, { "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["female", "male"], "codes": [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], "raw_values": null }, "col_name": "sex", "col_label": "sex", "col_hash": "3c3662bcb661d6de679c636744c66b62", "col_index": 3, "col_del": false, "col_vars": [{ "var_label": "sex", "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["female", "male"], "codes": [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], "raw_values": null }, "meta": { "kind": "original" } }, { "var_label": "Variante de sexo", "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["Mulher", "Homem"], "codes": [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], "raw_values": null }, "meta": { "kind": "search_replace", "source_var_index": 0, "source_type": "q", "actions": [{ "type": "search_replace", "count": 2 }], "warnings": ["Buscar e substituir: female->Mulher; male->Homem"], "lang": "pt_br", "recipe": { "var_label": "sex", "col_type": "q", "col_sep": "", "kind": "search_replace", "sourceVarIndex": 0, "replacements": [{ "search": "female", "replace": "Mulher" }, { "search": "male", "replace": "Homem" }] }, "recipe_version": 1 } }] }, { "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["no", "yes"], "codes": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], "raw_values": null }, "col_name": "outcome", "col_label": "outcome", "col_hash": "3032ad6aed6c5c3cda992d241f4d28bf", "col_index": 4, "col_del": false, "col_vars": [] }, { "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["low", "high", "middle"], "codes": [1, 2, 2, 3, 3, 2, 3, 3, 2, 2, 2, 3, 3, 2, 3, 3, 3, 2, 3, 3, 2, 3, 3, 3, 3, 2, 3, 3, 2, 2, 3, 2, 2, 2, 3, 3, 3, 3, 2, 3, 3, 3, 2, 1, 1, 1, 1, 1, 2, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 3, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 2, 2, 2, 3, 3, 3, 2, 2, 3, 2, 3, 2, 3, 3, 2, 2, 3, 2, 2, 2, 3, 2], "raw_values": null }, "col_name": "income", "col_label": "income", "col_hash": "34ae6773410925b4574e656be194f0ad", "col_index": 5, "col_del": false, "col_vars": [] }, { "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["local", "foreign"], "codes": [1, 1, 1, 2, 2, 1, 2, 2, 1, 1, 1, 2, 2, 1, 2, 2, 2, 1, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 1, 1, 2, 1, 1, 1, 2, 2, 2, 2, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 2, 1, 2, 2, 1, 1, 2, 1, 1, 1, 2, 1], "raw_values": null }, "col_name": "origin", "col_label": "origin", "col_hash": "7c49b153d4b59f8c0cf8c3e18dc80cb7", "col_index": 6, "col_del": false, "col_vars": [] }], "history": [{ "file": "example.csv", "import_time": "2025-12-02T03:00:34.200Z" }] };

  // mappings[index].suggested_choice = new_value;

  const new_payload = driver.applyColumnMappings(old_db, new_db, curr_mappings);

  console.log(JSON.stringify(new_payload));

});




test("buildColumnMappingSuggestions", () => {

  const new_db = { "columns": [{ "col_type": "n", "col_sep": "", "col_values": { "col_compact": false, "labels": null, "codes": null, "raw_values": ["9.14", "11.56", "11.02", "11.04", "8.88", "8.93", "10.97", "10.17", "7.1", null, "7.5", "7.03", "7.89", "11.09", "8.79", "8.23"] }, "col_name": "biomarker", "col_label": "biomarker", "col_hash": "510492278aec5ab747bc59324e2ceb1b", "col_index": 1, "col_del": false, "col_vars": [] }] };
  const old_db = { "columns": [{ "col_type": "n", "col_sep": "", "col_values": { "col_compact": false, "labels": null, "codes": null, "raw_values": ["8.83", "9.72", "9.64", "10.09", "12.25", "10.83", "11.31", "12.5", "11.17", "9.57", "9", "8.89", "9.94", "11.17", "11.05", "10.06", "9.26", "10.93", "11.67", "10.56", "9.25", "11.26", "10.04", "10.19", "10.46", "9.57", "10.02", "10.7", "10.97", "9.38", "9.14", "10.07", "8.95", "7.25", "8.87", "9.14", "11.56", "11.02", "11.04", "8.88", "8.93", "10.97", "10.17", "7.1", "8.16", "7.5", "7.03", "7.89", "11.09", "8.79", "8.23", "9.51", "10.32", "11.46", "11.54", "9.66", "8.92", "8.51", "9.75", "9.88", "9.35", "10.31", "10.12", "9.16", "10.6", "9.75", "9.82", "10.02", "9.52", "9.26", "11.3", "10.56", "8.19", "10.44", "8.56", "10.95", "9.28", "10.05", "8.44", "7.7", "11.16", "9.3", "8.43", "10.52", "8.94", "10.05", "10.85", "10.43", "10.52", "9.75", "9.5", "11.26", "10.56", "9.66", "10.72", "10.86", "10.37", "11.58", "10.06", "10.13"] }, "col_name": "biomarker", "col_label": "Biomarcador", "col_hash": "510492278aec5ab747bc59324e2ceb1b", "col_index": 2, "col_del": false, "col_vars": [] }], "history": [{ "file": "example.csv", "import_time": "2025-12-03T03:35:53.462Z" }] };

  const new_payload = driver.buildColumnMappingSuggestions(old_db, new_db);

  console.log(JSON.stringify(new_payload.mappings.map(JSON.parse)));

});

test("applyColumnMappings", () => {

  const curr_mappings = [{ "new_hash": "510492278aec5ab747bc59324e2ceb1b", "new_label": "biomarker", "new_type": "n", "suggested_choice": "510492278aec5ab747bc59324e2ceb1b" }];
  const new_db = { "columns": [{ "col_type": "n", "col_sep": "", "col_values": { "col_compact": false, "labels": null, "codes": null, "raw_values": ["9.14", "11.56", "11.02", "11.04", "8.88", "8.93", "10.97", "10.17", "7.1", null, "7.5", "7.03", "7.89", "11.09", "8.79", "8.23"] }, "col_name": "biomarker", "col_label": "biomarker", "col_hash": "510492278aec5ab747bc59324e2ceb1b", "col_index": 1, "col_del": false, "col_vars": [] }] };
  const old_db = { "columns": [{ "col_type": "n", "col_sep": "", "col_values": { "col_compact": false, "labels": null, "codes": null, "raw_values": ["8.83", "9.72", "9.64", "10.09", "12.25", "10.83", "11.31", "12.5", "11.17", "9.57", "9", "8.89", "9.94", "11.17", "11.05", "10.06", "9.26", "10.93", "11.67", "10.56", "9.25", "11.26", "10.04", "10.19", "10.46", "9.57", "10.02", "10.7", "10.97", "9.38", "9.14", "10.07", "8.95", "7.25", "8.87", "9.14", "11.56", "11.02", "11.04", "8.88", "8.93", "10.97", "10.17", "7.1", "8.16", "7.5", "7.03", "7.89", "11.09", "8.79", "8.23", "9.51", "10.32", "11.46", "11.54", "9.66", "8.92", "8.51", "9.75", "9.88", "9.35", "10.31", "10.12", "9.16", "10.6", "9.75", "9.82", "10.02", "9.52", "9.26", "11.3", "10.56", "8.19", "10.44", "8.56", "10.95", "9.28", "10.05", "8.44", "7.7", "11.16", "9.3", "8.43", "10.52", "8.94", "10.05", "10.85", "10.43", "10.52", "9.75", "9.5", "11.26", "10.56", "9.66", "10.72", "10.86", "10.37", "11.58", "10.06", "10.13"] }, "col_name": "biomarker", "col_label": "Biomarcador", "col_hash": "510492278aec5ab747bc59324e2ceb1b", "col_index": 2, "col_del": false, "col_vars": [] }], "history": [{ "file": "example.csv", "import_time": "2025-12-03T03:35:53.462Z" }] };

  // mappings[index].suggested_choice = new_value;

  const new_payload = driver.applyColumnMappings(old_db, new_db, curr_mappings);

  console.log(JSON.stringify(new_payload));

});

test("applyColumnMappings", () => {

  const oldDb = {"columns":[{"col_type":"l","col_sep":";","col_values":{"col_compact":true,"labels":["headache","overweight","dm","fever","sneeze","anemia","underweight","Fatigue","cough","cancer"],"codes":["1;2","1;3","1;2","1;2","1;2","1;2","","1;2","1;2","1;2","1;2","","1;2","1;2","1;3;4;5;6;7;8;9;10",""],"raw_values":null},"col_name":"clinics","col_label":"clinics","col_hash":"b1ccce9f4800002b39d95661dde1185e","col_index":4,"col_del":false,"col_vars":[],"meta":{"replacements":[{"from":"fatigue","to":"Fatigue"}],"recipe_version":1}}]};
  const newDb = {"columns":[{"col_type":"l","col_sep":";","col_values":{"col_compact":true,"labels":["headache","overweight","dm","fever","sneeze","anemia","underweight","fatigue","cough","cancer"],"codes":["1;2","1;3","1;2","1;2","1;2","1;2","","1;2","1;2","1;2","1;2","","1;2","1;2","1;3;4;5;6;7;8;9;10",""],"raw_values":null},"col_name":"clinics","col_label":"clinics","col_hash":"b1ccce9f4800002b39d95661dde1185e","col_index":4,"col_del":false,"col_vars":[]}]};
  const mappings = [{"new_hash":"b1ccce9f4800002b39d95661dde1185e","new_label":"clinics","new_type":"l","suggested_choice":"b1ccce9f4800002b39d95661dde1185e"}];

  const updated = driver.applyColumnMappings(oldDb, newDb, mappings);

  console.log(JSON.stringify(updated));

})

// ---------------------------------------------------------------------------
// recodeColumn — change col_type / col_sep with full re-encoding
// ---------------------------------------------------------------------------

test("recodeColumn: q -> n with numeric labels preserves values and drops q-only processing", () => {
  const original = factors.makeColumn(['10', '20', '10', '30', '20'], {
    col_type: 'q',
    var_label: 'score',
    includeBaseVariant: false
  });
  original.col_hash = 'h_score';
  original.col_label = 'Score';
  original.col_name = 'score';
  original.col_index = 1;
  original.col_del = false;
  original.meta = {
    replacements: [{ from: '10', to: '10' }],
    processing: {
      sort_mode: 'freq_desc',
      custom_order: ['10', '20', '30'],
      top_n: 2,
      top_n_label: 'Others',
      excluded_values: ['30'],
      na_action: 'label',
      na_label: 'Missing'
    }
  };
  const snapshot = JSON.parse(JSON.stringify(original));

  const recoded = driver.recodeColumn(original, { col_type: 'n' });

  // Identity preserved
  assert.equal(recoded.col_hash, 'h_score');
  assert.equal(recoded.col_label, 'Score');
  assert.equal(recoded.col_name, 'score');
  assert.equal(recoded.col_index, 1);
  assert.equal(recoded.col_del, false);

  // Recoded as numeric — values round-trip correctly
  assert.equal(recoded.col_type, 'n');
  assert.equal(recoded.col_sep, '');
  assert.deepEqual(factors.decodeColumn(recoded), ['10', '20', '10', '30', '20']);

  // q-only fields stripped, universal fields preserved
  assert.deepEqual(recoded.meta.replacements, [{ from: '10', to: '10' }]);
  assert.deepEqual(recoded.meta.processing, {
    excluded_values: ['30'],
    na_action: 'label',
    na_label: 'Missing'
  });

  // Input not mutated
  assert.deepEqual(original, snapshot);
});

test("recodeColumn: q -> l with sep=';' wraps each value into a single-item list", () => {
  const original = factors.makeColumn(['fever', 'headache', 'fever'], {
    col_type: 'q',
    includeBaseVariant: false
  });

  const recoded = driver.recodeColumn(original, { col_type: 'l', col_sep: ';' });

  assert.equal(recoded.col_type, 'l');
  assert.equal(recoded.col_sep, ';');
  const decoded = factors.decodeColumn(recoded);
  assert.deepEqual(decoded, ['fever', 'headache', 'fever']);
});

test("recodeColumn: l -> q collapses lists to single qualitative levels", () => {
  const original = factors.makeColumn(['fever;headache', 'fever', 'headache;cough'], {
    col_type: 'l',
    col_sep: ';',
    includeBaseVariant: false
  });

  const recoded = driver.recodeColumn(original, { col_type: 'q' });

  assert.equal(recoded.col_type, 'q');
  assert.equal(recoded.col_sep, '');
  const decoded = factors.decodeColumn(recoded);
  assert.deepEqual(decoded, ['fever;headache', 'fever', 'headache;cough']);
});

test("recodeColumn: change col_sep on list column re-parses raw values without substituting characters", () => {
  const original = factors.makeColumn(['a;b;c', 'a;c', 'b'], {
    col_type: 'l',
    col_sep: ';',
    includeBaseVariant: false
  });

  // Switching the separator does NOT rewrite the raw characters — it only changes how the
  // values are parsed into items. Re-decoding must yield the original raw strings.
  const recoded = driver.recodeColumn(original, { col_sep: ',' });
  assert.equal(recoded.col_type, 'l');
  assert.equal(recoded.col_sep, ',');
  const decoded = factors.decodeColumn(recoded);
  assert.deepEqual(decoded, ['a;b;c', 'a;c', 'b']);
});

test("recodeColumn: l -> l with auto-inferred separator when none provided", () => {
  // values whose decoded form (after decoding with old sep ';') will be ['x;y','x','y;z']
  const original = factors.makeColumn(['x;y', 'x', 'y;z'], {
    col_type: 'l',
    col_sep: ';',
    includeBaseVariant: false
  });
  // Force sep to empty — recodeColumn must infer (still ';' since data uses it)
  const recoded = driver.recodeColumn(original, { col_type: 'l', col_sep: '' });
  assert.equal(recoded.col_type, 'l');
  assert.equal(recoded.col_sep, ';');
});

test("recodeColumn: rebuilds col_vars by replaying recipes", () => {
  const base = factors.makeColumn(['male', 'female', 'male', 'female', 'male'], {
    col_type: 'q',
    var_label: 'sex',
    includeBaseVariant: true
  });
  base.col_hash = 'h_sex';
  base.col_label = 'sex';
  base.col_name = 'sex';

  // Append a search_replace variant via createVariant (so it carries a recipe)
  const replaceVariant = driver.createVariant(base, {
    kind: 'search_replace',
    var_label: 'Sex (PT)',
    sourceVarIndex: 0,
    replacements: [{ search: 'male', replace: 'Homem' }, { search: 'female', replace: 'Mulher' }]
  });
  base.col_vars.push(replaceVariant);

  // No-op recode (q -> q): variants should be rebuilt and recipe replayed
  const recoded = driver.recodeColumn(base, { col_type: 'q' });

  assert.equal(recoded.col_vars.length, 2);
  assert.equal(recoded.col_vars[0].meta.kind, 'original');
  assert.equal(recoded.col_vars[1].var_label, 'Sex (PT)');
  const replayed = factors.decodeColumn(recoded.col_vars[1]);
  assert.deepEqual(replayed, ['Homem', 'Mulher', 'Homem', 'Mulher', 'Homem']);
});

test("recodeColumn: returns a new object and does not mutate input", () => {
  const original = factors.makeColumn(['a', 'b', 'a'], { col_type: 'q', includeBaseVariant: false });
  original.meta = { replacements: [], processing: { sort_mode: 'alpha' } };
  const snapshot = JSON.parse(JSON.stringify(original));

  const recoded = driver.recodeColumn(original, { col_type: 'l', col_sep: ';' });
  assert.notEqual(recoded, original);
  assert.deepEqual(original, snapshot);
});

// ---------------------------------------------------------------------------
// Pointer-style base variant + normalized recipes
// ---------------------------------------------------------------------------

import variants from "../json/variants.js";

test("makeColumn: base variant is pointer-style (no col_values/col_type/col_sep)", () => {
  const column = factors.makeColumn(['a', 'b', 'a'], { col_type: 'q' });
  assert.equal(column.col_vars.length, 1);
  assert.equal(column.col_vars[0].col_values, undefined);
  assert.equal(column.col_vars[0].col_type, undefined);
  assert.equal(column.col_vars[0].col_sep, undefined);
  assert.equal(column.col_vars[0].meta.kind, 'original');
  assert.ok(column.col_vars[0].var_label);
});

test("getIndividualItemsWithCount: variantIndex=0 with pointer-style base falls back to column", () => {
  const column = factors.makeColumn(['a', 'b', 'a', 'b', 'a'], { col_type: 'q' });
  const fromBase = factors.getIndividualItemsWithCount(column);
  const fromVariant0 = factors.getIndividualItemsWithCount(column, { variantIndex: 0 });
  assert.deepEqual(fromVariant0, fromBase);
});

test("createVariant: sourceVarIndex=0 with pointer-style base reads column values", () => {
  const column = factors.makeColumn(['male', 'female', 'male'], { col_type: 'q' });
  const variant = variants.createVariant(column, {
    kind: 'search_replace',
    var_label: 'Sex (PT)',
    sourceVarIndex: 0,
    replacements: [{ search: 'male', replace: 'M' }, { search: 'female', replace: 'F' }]
  });
  const decoded = factors.decodeColumn(variant);
  assert.deepEqual(decoded, ['M', 'F', 'M']);
});

test("recodeColumn: produces pointer-style base variant", () => {
  const column = factors.makeColumn(['x', 'y', 'x'], { col_type: 'q' });
  const recoded = driver.recodeColumn(column, { col_type: 'l', col_sep: ';' });
  assert.equal(recoded.col_vars[0].col_values, undefined);
  assert.equal(recoded.col_vars[0].col_type, undefined);
  assert.equal(recoded.col_vars[0].col_sep, undefined);
});

test("normalizeRecipe: replacements aliases canonicalize to {from,to}", () => {
  const recipe = variants.normalizeRecipe({
    replacements: [
      { search: 'a', replace: 'A' },
      { from: 'b', to: 'B' },
      { value: 'c', label: 'C' },
      { level: 'd', to: 'D' },
      { search: '', replace: 'skip' },
      { from: '   ', to: 'also-skip' }
    ]
  });
  assert.deepEqual(recipe.replacements, [
    { from: 'a', to: 'A' },
    { from: 'b', to: 'B' },
    { from: 'c', to: 'C' },
    { from: 'd', to: 'D' }
  ]);
});

test("normalizeRecipe: merges aliases canonicalize to {label,levels}", () => {
  const recipe = variants.normalizeRecipe({
    merges: [
      { target: 'High', levels: ['x', 'y'] },
      { name: 'Low', values: ['a', 'b'] },
      { label: '', levels: ['skip'] },
      { label: 'NoLevels' }
    ]
  });
  assert.deepEqual(recipe.merges, [
    { label: 'High', levels: ['x', 'y'] },
    { label: 'Low', levels: ['a', 'b'] }
  ]);
});

test("normalizeRecipe: cut omits default right/includeLowest, keeps overrides", () => {
  const recipeAllDefaults = variants.normalizeRecipe({
    cut: { breaks: [0, 5, 10], right: true, includeLowest: true }
  });
  assert.deepEqual(recipeAllDefaults.cut, { breaks: [0, 5, 10] });

  const recipeOverrides = variants.normalizeRecipe({
    cut: { breaks: [0, 5, 10], right: false, includeLowest: false }
  });
  assert.deepEqual(recipeOverrides.cut, { breaks: [0, 5, 10], right: false, includeLowest: false });
});

test("normalizeRecipe: transform drops base when fn !== 'log'", () => {
  const recipe = variants.normalizeRecipe({ transform: { fn: 'log10', base: 7 } });
  assert.deepEqual(recipe.transform, { fn: 'log10' });

  const recipeLog = variants.normalizeRecipe({ transform: { fn: 'log', base: 2 } });
  assert.deepEqual(recipeLog.transform, { fn: 'log', base: 2 });
});

test("normalizeRecipe: drops var_label/label", () => {
  const recipe = variants.normalizeRecipe({ var_label: 'Foo', label: 'Bar', kind: 'custom' });
  assert.equal(recipe.var_label, undefined);
  assert.equal(recipe.label, undefined);
  assert.equal(recipe.kind, 'custom');
});

test("createVariant: stored recipe is canonical (replays identically)", () => {
  const column = factors.makeColumn(['m', 'f', 'm', 'f'], { col_type: 'q' });
  const variant1 = variants.createVariant(column, {
    kind: 'search_replace',
    var_label: 'Sex (long)',
    sourceVarIndex: 0,
    replacements: [{ search: 'm', replace: 'Male' }, { from: 'f', to: 'Female' }]
  });
  // Replay using the stored recipe
  const variant2 = variants.createVariant(column, variant1.meta.recipe);
  assert.deepEqual(factors.decodeColumn(variant2), factors.decodeColumn(variant1));
  // Recipe is normalized
  assert.deepEqual(variant1.meta.recipe.replacements, [
    { from: 'm', to: 'Male' },
    { from: 'f', to: 'Female' }
  ]);
});

