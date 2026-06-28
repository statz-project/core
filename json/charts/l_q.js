// @ts-check
// Chart for list × qualitative: one grouped_bar chart per list item (binary yes/no
// × response levels). Mirrors driver.summarize_l_q for chart mode.
import numeric from '../numeric.js';
import { chart_q_q } from './q_q.js';

/**
 * @param {Array<string|null|undefined>} listValues
 * @param {Array<string|null|undefined>} responseVals
 * @param {Record<string,any>=} options
 * @param {{separator?:string, predictorLabel?:string|null, responseLabel?:string|null, responseLabels?:string[]|null, includePrefix?:boolean}=} meta
 * @returns {Array<{label:string, display_label:string, predictor_label:string|null, predictor_label_stripped:string|null, response_label:string|null, chart:{type:string, spec:any}}>}
 */
export function chart_l_q(listValues, responseVals, options = {}, meta = {}) {
  const separator = meta?.separator ?? ';';
  const predictorLabel = meta?.predictorLabel ?? null;
  const responseLabel = meta?.responseLabel ?? null;
  const includePrefix = meta?.includePrefix ?? true;
  const cleanedPredictor = predictorLabel ? predictorLabel.replace(/[\s\p{P}]+$/u, '') : predictorLabel;
  const { columns: binaryColumns = {} } = numeric.decomposeListAsBinaryCols(listValues, separator, options);
  /** @type {Array<{label:string, display_label:string, predictor_label:string|null, predictor_label_stripped:string|null, response_label:string|null, chart:{type:string, spec:any}}>} */
  const results = [];
  Object.entries(binaryColumns).forEach(([label, binVals]) => {
    const displayLabel = includePrefix && (cleanedPredictor || predictorLabel)
      ? `${cleanedPredictor || predictorLabel}: ${label}`
      : label;
    const chart = chart_q_q(binVals, responseVals, options, {
      predictorLabel: displayLabel,
      responseLabel: responseLabel || '',
      responseLabels: meta?.responseLabels ?? null
    });
    if (!chart) return;
    results.push({
      label,
      display_label: displayLabel,
      predictor_label: predictorLabel,
      predictor_label_stripped: cleanedPredictor,
      response_label: responseLabel,
      chart
    });
  });
  return results;
}
