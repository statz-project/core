// @ts-check
// Chart for list × list with explicit subset selection: one grouped_bar per
// (predictor_item × response_item) pair where both items are present in their
// respective subsets. Mirrors driver.summarize_l_l for chart mode.
//
// The subset gate is enforced upstream by the dispatcher in summarizePredictors —
// without both subsets, the dispatch emits a warning instead of calling this helper.
import numeric from '../numeric.js';
import { chart_q_q } from './q_q.js';

/**
 * @param {Array<string|null|undefined>} predictorVals
 * @param {Array<string|null|undefined>} responseVals
 * @param {Record<string,any>=} options
 * @param {{predictorSep?:string, responseSep?:string, predictorLabel?:string|null, responseLabel?:string|null, predSubset?:string[], respSubset?:string[], includePrefix?:boolean}=} meta
 * @returns {Array<{predictor_item:string, response_item:string, display_predictor:string, display_response:string, chart:{type:string, spec:any}}>}
 */
export function chart_l_l(predictorVals, responseVals, options = {}, meta = {}) {
  const predictorSep = meta?.predictorSep ?? ';';
  const responseSep = meta?.responseSep ?? ';';
  const predictorLabel = meta?.predictorLabel ?? null;
  const responseLabel = meta?.responseLabel ?? null;
  const includePrefix = meta?.includePrefix ?? true;
  const predSubset = Array.isArray(meta?.predSubset) ? meta.predSubset.filter(Boolean) : [];
  const respSubset = Array.isArray(meta?.respSubset) ? meta.respSubset.filter(Boolean) : [];
  if (!predSubset.length || !respSubset.length) return [];

  const cleanedPredictor = predictorLabel ? predictorLabel.replace(/[\s\p{P}]+$/u, '') : predictorLabel;
  const cleanedResponse = responseLabel ? responseLabel.replace(/[\s\p{P}]+$/u, '') : responseLabel;

  const { columns: predBinary = {} } = numeric.decomposeListAsBinaryCols(predictorVals, predictorSep, options);
  const { columns: respBinary = {} } = numeric.decomposeListAsBinaryCols(responseVals, responseSep, options);

  /** @type {Array<{predictor_item:string, response_item:string, display_predictor:string, display_response:string, chart:{type:string, spec:any}}>} */
  const results = [];
  for (const pItem of predSubset) {
    if (!predBinary[pItem]) continue;
    for (const rItem of respSubset) {
      if (!respBinary[rItem]) continue;
      const displayPred = includePrefix && (cleanedPredictor || predictorLabel)
        ? `${cleanedPredictor || predictorLabel}: ${pItem}`
        : pItem;
      const displayResp = includePrefix && (cleanedResponse || responseLabel)
        ? `${cleanedResponse || responseLabel}: ${rItem}`
        : rItem;
      const chart = chart_q_q(predBinary[pItem], respBinary[rItem], options, {
        predictorLabel: displayPred,
        responseLabel: displayResp
      });
      if (!chart) continue;
      results.push({
        predictor_item: pItem,
        response_item: rItem,
        display_predictor: displayPred,
        display_response: displayResp,
        chart
      });
    }
  }
  return results;
}
