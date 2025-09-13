// @ts-check
import { getStatsLib, formatNumberLocale } from './_env.js';

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
  const table = {}; const totalByRow = {}; const totalByCol = {};
  const withResiduals = options?.with_residuals ?? true; const residualSymbols = options?.residual_symbols ?? { greater: '†', lower: '*' };
  const alpha = options?.alpha ?? 0.05; const percentBy = options?.percent_by ?? 'row'; const lang = options?.lang ?? 'pt_br';
  predictorVals.forEach((pred, i) => {
    const row = pred?.toString().trim(); const col = responseVals[i]?.toString().trim(); if (!row || !col) return;
    if (!table[row]) table[row] = {}; if (!table[row][col]) table[row][col] = 0; table[row][col]++;
    totalByRow[row] = (totalByRow[row] || 0) + 1; totalByCol[col] = (totalByCol[col] || 0) + 1;
  });
  const rowLevels = rowLabels ?? [...new Set(predictorVals.map(v => v?.trim()).filter(Boolean))].sort();
  const colLevels = colLabels ?? [...new Set(responseVals.map(v => v?.trim()).filter(Boolean))].sort();
  const columns = ['Grupo', ...colLevels, 'p-valor'];
  const stats = getStatsLib();
  const observed = rowLevels.map(r => colLevels.map(c => table[r]?.[c] || 0));
  const test = (() => {
    // compute chi-square or Fisher as in original via stdlib chi2test
    // reuse computeAdjusted residuals logic
    const rows = observed.length; const cols = observed[0].length;
    const rowSums = observed.map(r => r.reduce((a, b) => a + b, 0));
    const colSums = Array(cols).fill(0); for (let j = 0; j < cols; j++) { for (let i = 0; i < rows; i++) colSums[j] += observed[i][j]; }
    const total = rowSums.reduce((a, b) => a + b, 0);
    const expected = observed.map((_, i) => colSums.map((_, j) => (rowSums[i] * colSums[j]) / total));
    const is2x2 = rows === 2 && cols === 2; const hasSmallExpected = expected.flat().some(v => v < 5);
    let method = null, p_value = null, residuals = null, residualsAnnotated = null, used_resid_greater = false, used_resid_lower = false;
    if (is2x2 && hasSmallExpected) {
      // fallback to Fisher exact using first two rows/cols
      const p = ns.fisherExact2x2(observed[0][0], observed[0][1], observed[1][0], observed[1][1]);
      method = 'Exato de Fisher'; p_value = +p.toFixed(4);
    } else {
      const result = stats?.chi2test(observed, { correct: false }); method = 'Qui-quadrado'; p_value = +(result?.pValue?.toFixed?.(4) ?? NaN);
      if (withResiduals && !is2x2 && p_value < alpha) {
        residuals = ns.computeAdjustedResiduals(observed, expected, rowSums, colSums, total); residualsAnnotated = [];
        for (let i = 0; i < rows; i++) { residualsAnnotated[i] = []; for (let j = 0; j < cols; j++) { const r = residuals[i][j]; if (r > 1.96) { residualsAnnotated[i][j] = residualSymbols.greater; used_resid_greater = true; } else if (r < -1.96) { residualsAnnotated[i][j] = residualSymbols.lower; used_resid_lower = true; } else { residualsAnnotated[i][j] = ''; } } }
      }
    }
    return { method, p_value, residuals, residualsAnnotated, used_resid_greater, used_resid_lower };
  })();
  const annotated = test.residualsAnnotated || [];
  const rows = rowLevels.map((row, i) => {
    const result = { Grupo: row };
    colLevels.forEach((col, j) => {
      const count = table[row]?.[col] || 0; const totalRef = percentBy === 'col' ? totalByCol[col] : totalByRow[row];
      const percent = (count / totalRef) * 100; const percentFormatted = formatFn ? null : formatNumberLocale(percent, 1, lang);
      const formatted = formatFn ? formatFn({ count, percent, rowTotal: totalByRow[row], colTotal: totalByCol[col] }) : `${count} (${percentFormatted}%)`;
      const symbol = annotated[i]?.[j] ?? ''; result[col] = `${formatted}${symbol}`;
    });
    result['p-valor'] = '';
    return result;
  });
  return { columns, rows, test_used: test.method, p_value: test.p_value, posthoc_residuals: test.residuals, used_resid_greater: test.used_resid_greater, used_resid_lower: test.used_resid_lower, percent_by: percentBy };
};

export default ns;
