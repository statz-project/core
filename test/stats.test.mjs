import test from "node:test";
import assert from "node:assert/strict";
import { Statz } from "../index.js";
import { parseFixture } from '../scripts/dev/load-fixture.mjs';
import { translate } from "../i18n/index.js";

const { parsed } = parseFixture(); // sample database

test("run summarize_q_q with non-significant Fisher", () => {
  const predictor = Statz.getColumnValues(parsed, "col_outcome_hash");
  const response  = Statz.getColumnValues(parsed, "col_sex_hash");

  const result = Statz.summarize_q_q(predictor.rawValues, response.rawValues);
  
  assert.equal((result.test_used), translate('tests.fisherExact'))
  assert.equal((result.p_value).toFixed(3), '0.233')
    
});

test("run summarize_q_q with non-significant Chi-square", () => {
  const predictor = Statz.getColumnValues(parsed, "col_outcome_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const result = Statz.summarize_q_q(predictor.rawValues, response.rawValues);
    
  assert.equal((result.test_used), translate('tests.chiSquare'))
  assert.equal((result.p_value).toFixed(3), '0.264')
    
});

test("run summarize_q_q with significant Chi-square", () => {
  const predictor = Statz.getColumnValues(parsed, "col_race_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const result = Statz.summarize_q_q(predictor.rawValues, response.rawValues);

  assert.equal((result.test_used), translate('tests.chiSquare'))
  assert.equal((result.p_value).toFixed(3), '0.264')
    
});

test("run summarize_n_q with significant Mann–Whitney", () => {
  const predictor = Statz.getColumnValues(parsed, "col_score_hash");
  const response  = Statz.getColumnValues(parsed, "col_sex_hash");

  const result = Statz.summarize_n_q(predictor.rawValues, response.rawValues);

  assert.equal((result.test_used), translate('tests.mannWhitney'))
  assert.equal((result.p_value).toFixed(3), '0.264')
    
});

test("run summarize_n_q with significant t test", () => {
  const predictor = Statz.getColumnValues(parsed, "col_biomarker_hash");
  const response  = Statz.getColumnValues(parsed, "col_sex_hash");

  const result = Statz.summarize_n_q(predictor.rawValues, response.rawValues);

  assert.equal((result.test_used), translate('tests.tStudent'))
  assert.equal((result.p_value).toFixed(3), '0.264')
    
});

test("run summarize_n_q with significant Kruskal–Wallis", () => {
  const predictor = Statz.getColumnValues(parsed, "col_score_hash");
  const response  = Statz.getColumnValues(parsed, "col_income_hash");

  const result = Statz.summarize_n_q(predictor.rawValues, response.rawValues);

  assert.equal((result.test_used), translate('tests.kruskalWallis'))
  assert.equal((result.p_value).toFixed(3), '0.264')
    
});


