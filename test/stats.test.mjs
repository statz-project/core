import test from "node:test";
import assert from "node:assert/strict";
import { Statz } from "../index.js";
import { parseFixture } from '../scripts/dev/load-fixture.mjs';
import statistics from '@stdlib/stats';
import jStat from "jstat";
import * as simpleStatistics from "simple-statistics";
import { json } from "node:stream/consumers";

globalThis.Statz = Statz;           // make the namespace discoverable

Statz.stdlibStats = statistics;
Statz.jStat = jStat;
Statz.simpleStatistics = simpleStatistics;

const { parsed } = parseFixture();

test("run summarize_q_q get non-significant Fisher", () => {
  const predictor = Statz.getColumnValues(parsed, "col_outcome_hash");
  const response  = Statz.getColumnValues(parsed, "col_sex_hash");

  const result = Statz.summarize_q_q(predictor.rawValues, response.rawValues);
  
  assert.equal((result.test_used), Statz.translate('tests.fisherExact'))
  assert.equal((result.p_value).toFixed(3), '0.233')
    
});

test("run summarize_q_q get non-significant Chi-square", () => {
  const predictor = Statz.getColumnValues(parsed, "col_outcome_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const result = Statz.summarize_q_q(predictor.rawValues, response.rawValues);
    
  assert.equal((result.test_used), Statz.translate('tests.chiSquare'))
  assert.equal((result.p_value).toFixed(3), '0.264')
    
});

test("run summarize_q_q get significant Chi-square", () => {
  const predictor = Statz.getColumnValues(parsed, "col_origin_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const result = Statz.summarize_q_q(predictor.rawValues, response.rawValues);

  assert.equal((result.test_used), Statz.translate('tests.chiSquare'))
  assert.equal((result.p_value).toFixed(3), '0.000')

  // check some residuals
  assert.equal(result.posthoc_residuals[0][0].toFixed(3), '-8.414')
  assert.equal(result.posthoc_residuals[1][2].toFixed(3), '-9.607')

  // check some greater than symbols
  assert.ok(/†$/.test(result.rows[0].middle))
  assert.ok(/†$/.test(result.rows[1].low))
    
});

test("run summarize_n_q get significant Mann–Whitney", () => {
  const predictor = Statz.getColumnValues(parsed, "col_score_hash");
  const response  = Statz.getColumnValues(parsed, "col_sex_hash");

  const result = Statz.summarize_n_q(predictor.rawValues, response.rawValues);
  
  const expected = {
    test: Statz.translate('tests.mannWhitney'),
    p: '0.01'
  };

  assert.equal((result.test_used), expected.test)
  assert.equal((result.p_value).toFixed(2), expected.p)
    
});

test("run summarize_n_q get significant t test", () => {
  const predictor = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const response  = Statz.getColumnValues(parsed, "col_sex_hash");

  const result = Statz.summarize_n_q(predictor.rawValues, response.rawValues);

  const expected = {
    test: Statz.translate('tests.tStudent'),
    p: '0.000'
  };

  assert.equal((result.test_used), expected.test)
  assert.equal((result.p_value).toFixed(3), expected.p)
    
});

test("run summarize_n_q get non-significant Kruskal–Wallis", () => {
  const predictor = Statz.getColumnValues(parsed, "col_score_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const result = Statz.summarize_n_q(predictor.rawValues, response.rawValues);
  
  const expected = {
    test: Statz.translate('tests.kruskalWallis'),
    p: '0.020',
    posthoc: [{"groupA":"low","groupB":"high","pValue":0.0185,"significant":true}]
  };

  assert.equal((result.test_used), expected.test)
  assert.equal((result.p_value).toFixed(3), expected.p)
  assert.deepEqual((result.posthoc), expected.posthoc)
    
});

test("run summarize_n_q get significant Kruskal–Wallis", () => {
  const predictor = Statz.getColumnValues(parsed, "col_score_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const result = Statz.summarize_n_q(predictor.rawValues, response.rawValues);
  
  const expected = {
    test: Statz.translate('tests.kruskalWallis'),
    p: '0.020',
    posthoc: [{"groupA":"low","groupB":"high","pValue":0.0185,"significant":true}]
  };

  assert.equal((result.test_used), expected.test)
  assert.equal((result.p_value).toFixed(3), expected.p)
  assert.deepEqual((result.posthoc), expected.posthoc)
    
});

