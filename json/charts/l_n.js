// @ts-check
// Chart for list × numeric: one individual_values_grouped chart per list item (binary
// yes/no groups vs numeric response). Mirrors driver.summarize_l_n for chart mode.
import numeric from '../numeric.js';
import { chart_n_q } from './n_q.js';

/**
 * @param {Array<string|null|undefined>} listValues
 * @param {Array<string|number|null|undefined>} numericVals
 * @param {Record<string,any>=} options
 * @param {{separator?:string, predictorLabel?:string|null, responseLabel?:string|null, includePrefix?:boolean}=} meta
 * @returns {Array<{label:string, display_label:string, predictor_label:string|null, predictor_label_stripped:string|null, response_label:string|null, chart:{type:string, spec:any}}>}
 */
export function chart_l_n(listValues, numericVals, options = {}, meta = {}) {
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
    // chart_n_q signature: (numericVals, groupVals, options, meta). The binary list item
    // values become the grouping variable; the numeric column is the y values.
    const chart = chart_n_q(numericVals, binVals, options, {
      numericLabel: responseLabel || '',
      groupLabel: displayLabel
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

/**
 * Axis-inverted wrapper: `n` is the predictor and `l` the response. Mirrors the table-mode
 * `driver.summarize_n_l`, and the same trick `chart_q_n` plays on `chart_n_q`.
 *
 * The chart itself is orientation-independent — the binary item is the x-axis grouping and the
 * numeric is the y values in both directions — so only the label roles are remapped.
 *
 * @param {Array<string|number|null|undefined>} numericVals
 * @param {Array<string|null|undefined>} listValues
 * @param {Record<string,any>=} options
 * @param {{separator?:string, predictorLabel?:string|null, responseLabel?:string|null, includePrefix?:boolean}=} meta
 * @returns {Array<{label:string, display_label:string, predictor_label:string|null, predictor_label_stripped:string|null, response_label:string|null, chart:{type:string, spec:any}}>}
 */
export function chart_n_l(numericVals, listValues, options = {}, meta = {}) {
  return chart_l_n(listValues, numericVals, options, {
    separator: meta?.separator,
    predictorLabel: meta?.responseLabel, // the LIST column — supplies the item prefix (x-axis)
    responseLabel: meta?.predictorLabel, // the NUMERIC column (y-axis)
    includePrefix: meta?.includePrefix
  });
}
