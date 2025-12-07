// @ts-check
import { getStatsLib, formatNumberLocale } from './_env.js';
import { getDefaultMissingLabel, normalizeLanguage, translate } from '../i18n/index.js';

const ns = {};

/**
 * Two-sided Fisher's exact test for 2x2 tables.
 * @returns {number} p-value
 */
ns.fisherExact2x2 = function (a, b, c, d) {
  function factorial(n) { if (n === 0 || n === 1) return 1; let res = 1; for (let i = 2; i <= n; i++) res *= i; return res; }
  function hypergeom(a, b, c, d) {
    return (factorial(a + b) * factorial(c + d) * factorial(a + c) * factorial(b + d)) /
      (factorial(a) * factorial(b) * factorial(c) * factorial(d) * factorial(a + b + c + d));
  }
  const observed = hypergeom(a, b, c, d);
  let p = 0;
  for (let i = 0; i <= a + b && i <= a + c; i++) {
    const j = a + b - i; const k = a + c - i; const l = d + b - j;
    if (i < 0 || j < 0 || k < 0 || l < 0) continue;
    const prob = hypergeom(i, j, k, l); if (prob <= observed) p += prob;
  }
  return p;
};

/**
 * Adjusted standardized residuals for contingency tables.
 */
ns.computeAdjustedResiduals = function (observed, expected, rowSums, colSums, total) {
  const residuals = [];
  for (let i = 0; i < observed.length; i++) {
    residuals[i] = [];
    for (let j = 0; j < observed[0].length; j++) {
      const o = observed[i][j]; const e = expected[i][j]; const ri = rowSums[i]; const cj = colSums[j];
      const denom = Math.sqrt(e * (1 - ri / total) * (1 - cj / total));
      const res = denom > 0 ? (o - e) / denom : 0; residuals[i][j] = +res.toFixed(4);
    }
  }
  return residuals;
};

/** Convert contingency object to matrix with row/col keys. */
ns.convertContingencyObjectToMatrix = function (contingency) {
  const rowKeys = Object.keys(contingency); const colSet = new Set();
  rowKeys.forEach(r => { Object.keys(contingency[r]).forEach(c => colSet.add(c)); });
  const colKeys = Array.from(colSet);
  const matrix = rowKeys.map(r => colKeys.map(c => contingency[r][c] ?? 0));
  return { matrix, rowKeys, colKeys };
};

/**
 * Cross-tabulation of qualitative predictor vs qualitative response.
 * @param {string[]} predictorVals
 * @param {string[]} responseVals
 * @param {(ctx:{count:number,percent:number,rowTotal:number,colTotal:number})=>string=} formatFn
 * @param {{with_residuals?:boolean,residual_symbols?:{greater:string,lower:string},alpha?:number,percent_by?:'row'|'col',lang?:string}=} options
 * @param {{rowLabels?:string[]|null,colLabels?:string[]|null}=} labels
 */
ns.summarize_q_q = function (predictorVals, responseVals, formatFn, options = {}, labels = {}) {
  const { rowLabels = null, colLabels = null } = labels;
  const lang = normalizeLanguage(options?.lang);
  const withResiduals = options?.with_residuals ?? true;
  const residualSymbols = options?.residual_symbols ?? {
    greater: translate('table.legends.residualGreaterSymbol', lang),
    lower: translate('table.legends.residualLowerSymbol', lang)
  };
  const alpha = options?.alpha ?? 0.05;
  const percentBy = options?.percent_by ?? 'row';
  const groupLabel = translate('table.columns.group', lang);
  const pValueLabel = translate('table.columns.pValue', lang);
  const table = {}; const totalByRow = {}; const totalByCol = {};
  predictorVals.forEach((pred, i) => {
    const row = pred?.toString().trim(); const col = responseVals[i]?.toString().trim();
    if (!row || !col) return;
    if (!table[row]) table[row] = {};
    if (!table[row][col]) table[row][col] = 0;
    table[row][col]++;
    totalByRow[row] = (totalByRow[row] || 0) + 1;
    totalByCol[col] = (totalByCol[col] || 0) + 1;
  });
  const rowLevels = rowLabels ?? [...new Set(predictorVals.map(v => v?.trim()).filter(Boolean))].sort();
  const colLevels = colLabels ?? [...new Set(responseVals.map(v => v?.trim()).filter(Boolean))].sort();
  const columns = [groupLabel, ...colLevels, pValueLabel];
  const stats = getStatsLib();
  const observed = rowLevels.map(r => colLevels.map(c => table[r]?.[c] || 0));
  const test = (() => {
    const rows = observed.length; const cols = observed[0].length;
    const rowSums = observed.map(r => r.reduce((a, b) => a + b, 0));
    const colSums = Array(cols).fill(0);
    for (let j = 0; j < cols; j++) {
      for (let i = 0; i < rows; i++) colSums[j] += observed[i][j];
    }
    const total = rowSums.reduce((a, b) => a + b, 0);
    const expected = observed.map((_, i) => colSums.map((_, j) => (rowSums[i] * colSums[j]) / total));
    const is2x2 = rows === 2 && cols === 2;
    const hasSmallExpected = expected.flat().some(v => v < 5);
    let method = null;
    let p_value = null;
    let residuals = null;
    let residualsAnnotated = null;
    let used_resid_greater = false;
    let used_resid_lower = false;
    if (is2x2 && hasSmallExpected) {
      const p = ns.fisherExact2x2(observed[0][0], observed[0][1], observed[1][0], observed[1][1]);
      method = translate('tests.fisherExact', lang);
      p_value = +p.toFixed(4);
    } else {
      const result = stats?.chi2test(observed, { correct: false });
      method = translate('tests.chiSquare', lang);
      p_value = +(result?.pValue?.toFixed?.(4) ?? NaN);
    }
    if (withResiduals && Number.isFinite(p_value) && p_value < alpha) {
      residuals = ns.computeAdjustedResiduals(observed, expected, rowSums, colSums, total);
      residualsAnnotated = residuals.map(row => row.map(value => {
        if (value > 1.96) { used_resid_greater = true; return residualSymbols.greater; }
        if (value < -1.96) { used_resid_lower = true; return residualSymbols.lower; }
        return '';
      }));
    }
    return { method, p_value, residuals, residualsAnnotated, used_resid_greater, used_resid_lower };
  })();
  const annotated = test.residualsAnnotated || [];
  const rows = rowLevels.map((row, i) => {
    const result = { [groupLabel]: row };
    colLevels.forEach((col, j) => {
      const count = table[row]?.[col] || 0;
      const totalRef = percentBy === 'col' ? totalByCol[col] : totalByRow[row];
      const percent = totalRef > 0 ? (count / totalRef) * 100 : 0;
      const percentFormatted = formatFn ? null : formatNumberLocale(percent, 1, lang);
      const formatted = formatFn ? formatFn({ count, percent, rowTotal: totalByRow[row] ?? 0, colTotal: totalByCol[col] ?? 0 }) : `${count} (${percentFormatted}%)`;
      const symbol = annotated[i]?.[j] ?? '';
      result[col] = `${formatted}${symbol}`;
    });
    result[pValueLabel] = '';
    return result;
  });
  return {
    columns,
    rows,
    test_used: test.method,
    p_value: test.p_value,
    posthoc_residuals: test.residuals,
    used_resid_greater: test.used_resid_greater,
    used_resid_lower: test.used_resid_lower,
    percent_by: percentBy,
    lang
  };
};



export default ns;
