import test from "node:test";
import assert from "node:assert/strict";
import factors from "../json/factors.js";
import driver from "../json/driver.js";

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
