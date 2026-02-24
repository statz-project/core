import test from "node:test";
import assert from "node:assert/strict";
// import { parseFixture } from '../scripts/dev/load-fixture.mjs';
import factors from "../json/factors.js";
import driver from "../json/driver.js";

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

test("replaceColumnValues is replacing empty values", () => {

  const column = { "col_type": "q", "col_sep": "", "col_values": { "col_compact": true, "labels": ["male", "female"], "codes": [1, 1, 1, 1, 0, 1, 1, 1, 2, 2, 2, 2, 2, 0, 1, 1], "raw_values": null }, "col_name": "sex", "col_label": "sex", "col_hash": "3c3662bcb661d6de679c636744c66b62", "col_index": 2, "col_del": false, "col_vars": [] };

  const countsList = factors.getIndividualItemsWithCount(column, { includeEmpty: true });

  const newColumn = factors.replaceColumnValues(column, countsList.map(item => item.Value), ["EMPTY", "FEMALE", "MALE"]);

  const newData = factors.getIndividualItemsWithCount(newColumn, { includeEmpty: true });

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

