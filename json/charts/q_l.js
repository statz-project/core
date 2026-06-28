// @ts-check
// Chart for qualitative × list: one grouped_bar per list item (predictor levels
// × binary yes/no). Mirrors driver.summarize_q_l for chart mode.
import numeric from '../numeric.js';
import { chart_q_q } from './q_q.js';

/**
 * @param {Array<string|null|undefined>} predictorVals
 * @param {Array<string|null|undefined>} responseVals
 * @param {Record<string,any>=} options
 * @param {{separator?:string, predictorLabel?:string|null, predictorLabels?:string[]|null, responseLabel?:string|null, includePrefix?:boolean}=} meta
 * @returns {Array<{label:string, display_label:string, predictor_label:string|null, response_label:string|null, response_label_stripped:string|null, chart:{type:string, spec:any}}>}
 */
export function chart_q_l(predictorVals, responseVals, options = {}, meta = {}) {
  const separator = meta?.separator ?? ';';
  const predictorLabel = meta?.predictorLabel ?? null;
  const responseLabel = meta?.responseLabel ?? null;
  const includePrefix = meta?.includePrefix ?? true;
  const cleanedResponse = responseLabel ? responseLabel.replace(/[\s\p{P}]+$/u, '') : responseLabel;
  const { columns: binaryColumns = {} } = numeric.decomposeListAsBinaryCols(responseVals, separator, options);
  /** @type {Array<{label:string, display_label:string, predictor_label:string|null, response_label:string|null, response_label_stripped:string|null, chart:{type:string, spec:any}}>} */
  const results = [];
  Object.entries(binaryColumns).forEach(([label, binVals]) => {
    const displayLabel = includePrefix && (cleanedResponse || responseLabel)
      ? `${cleanedResponse || responseLabel}: ${label}`
      : label;
    const chart = chart_q_q(predictorVals, binVals, options, {
      predictorLabel: predictorLabel || '',
      responseLabel: displayLabel,
      predictorLabels: meta?.predictorLabels ?? null
    });
    if (!chart) return;
    results.push({
      label,
      display_label: displayLabel,
      predictor_label: predictorLabel,
      response_label: responseLabel,
      response_label_stripped: cleanedResponse,
      chart
    });
  });
  return results;
}
