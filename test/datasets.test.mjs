import test from "node:test";
import assert from "node:assert/strict";
// import { parseFixture } from '../scripts/dev/load-fixture.mjs';
import factors from "../json/factors.js";

// const {parsed} = parseFixture();

test("getIndividualItemsWithCount", () => {

  // test list type

  const values = ['fever,headache','headache','headache','fever,headache,anemia','anemia',''];
  
  const column = factors.makeColumn(values, {col_type: "l", col_sep: ",", var_label: "symptoms"});
  
  const countsList = factors.getIndividualItemsWithCount(column, {splitList: true, includeEmpty: true, sortByCount: "desc"});

  assert.deepEqual(countsList, [{"Value":"headache","Count":4},{"Value":"anemia","Count":2},{"Value":"fever","Count":2},{"Value":"","Count":1}])
  
  // test factor type
  
  const columnFactor = {"col_type":"q","col_sep":"","col_values":{"col_compact":true,"labels":["female","male"],"codes":[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],"raw_values":null},"col_name":"sex","col_label":"sex","col_hash":"3c3662bcb661d6de679c636744c66b62","col_index":3,"col_del":false,"col_vars":[]};

  const countFactor = factors.getIndividualItemsWithCount(columnFactor, {splitList: true, includeEmpty: true, sortByCount: "desc"});
  
  assert.deepEqual(countFactor, [{"Value":"male","Count":94},{"Value":"female","Count":6}]);

});

test("replaceColumnValues is replacing empty values", () => {

  const column = {"col_type":"q","col_sep":"","col_values":{"col_compact":true,"labels":["male","female"],"codes":[1,1,1,1,0,1,1,1,2,2,2,2,2,0,1,1],"raw_values":null},"col_name":"sex","col_label":"sex","col_hash":"3c3662bcb661d6de679c636744c66b62","col_index":2,"col_del":false,"col_vars":[]};

  const countsList = factors.getIndividualItemsWithCount(column, {includeEmpty: true});

  const newColumn = factors.replaceColumnValues(column, countsList.map(item => item.Value), ["EMPTY","FEMALE","MALE"]);

  const newData = factors.getIndividualItemsWithCount(newColumn, {includeEmpty: true});

  assert.deepEqual(newData, [{"Value":"EMPTY","Count":2},{"Value":"FEMALE","Count":5},{"Value":"MALE","Count":9}]);

});
