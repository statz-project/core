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
 * Compute odds ratio and risk ratio with 95% confidence intervals for a 2x2 contingency table.
 *
 * Convention: table is [[a, b], [c, d]] where rows index the predictor levels and columns
 * index the response levels. OR/RR are computed treating row 0 as the "reference" exposure
 * group and column 0 as the "outcome present" — this matches the natural reading order of
 * the rendered table but is purely conventional.
 *
 * Haldane–Anscombe correction (+0.5 to every cell) is applied when any cell is 0, to avoid
 * divisions by zero in OR/RR or in their log-variance.
 *
 * @param {number} a observed[0][0]
 * @param {number} b observed[0][1]
 * @param {number} c observed[1][0]
 * @param {number} d observed[1][1]
 * @returns {{odds_ratio:{value:number,ci_lower:number,ci_upper:number}, risk_ratio:{value:number,ci_lower:number,ci_upper:number}}}
 */
ns.computeEffectSizes2x2 = function (a, b, c, d) {
  const Z = 1.96; // 95% CI
  // Haldane–Anscombe correction when any cell is zero
  if (a === 0 || b === 0 || c === 0 || d === 0) {
    a += 0.5; b += 0.5; c += 0.5; d += 0.5;
  }
  // Odds ratio
  const or = (a * d) / (b * c);
  const orSE = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
  const lnOR = Math.log(or);
  const orLower = Math.exp(lnOR - Z * orSE);
  const orUpper = Math.exp(lnOR + Z * orSE);
  // Risk ratio: row 0 = "exposed", column 0 = "outcome"
  const p1 = a / (a + b);
  const p2 = c / (c + d);
  const rr = p1 / p2;
  const rrSE = Math.sqrt((1 - p1) / a + (1 - p2) / c);
  const lnRR = Math.log(rr);
  const rrLower = Math.exp(lnRR - Z * rrSE);
  const rrUpper = Math.exp(lnRR + Z * rrSE);
  return {
    odds_ratio: { value: +or.toFixed(4), ci_lower: +orLower.toFixed(4), ci_upper: +orUpper.toFixed(4) },
    risk_ratio: { value: +rr.toFixed(4), ci_lower: +rrLower.toFixed(4), ci_upper: +rrUpper.toFixed(4) }
  };
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
    // Effect sizes for 2×2 tables: odds ratio + risk ratio with 95% CI.
    const effect_sizes = is2x2
      ? ns.computeEffectSizes2x2(observed[0][0], observed[0][1], observed[1][0], observed[1][1])
      : null;
    return { method, p_value, residuals, residualsAnnotated, used_resid_greater, used_resid_lower, effect_sizes };
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
    effect_sizes: test.effect_sizes,
    percent_by: percentBy,
    lang
  };
};



/**
 * Compare K paired binary qualitative responses (Profile B, q-binary).
 *
 * Pipeline:
 *  - Aligns rows across `responses` (array of K binary string vectors). Drops rows where
 *    any of the K values is missing.
 *  - Maps to 0/1 using each response's level order (first level alphabetically = 0;
 *    overridden by `levels` if provided).
 *  - For K = 2: McNemar test (exact binomial for small discordant pairs; χ² with
 *    continuity correction otherwise).
 *  - For K ≥ 3: Cochran's Q test.
 *
 * @param {string[][]} responses K arrays of binary qualitative values.
 * @param {string[]} labels Display labels for each momento.
 * @param {Function|null} [formatFn]
 * @param {Record<string,any>} [options]
 * @param {{levels?:string[]|null}} [meta] Optional 2-element level order shared across all responses; otherwise inferred per-call from the first response's distinct values.
 * @returns {{columns:string[], rows:Array<Record<string,any>>, test_used:string|null, p_value:number, n:number, k:number, lang:string}|null}
 */
ns.summarize_q_binary_paired = function (responses, labels, formatFn = null, options = {}, meta = {}) {
  const lang = normalizeLanguage(options?.lang);
  const stats = getStatsLib();
  const K = responses.length;
  if (K < 2) return null;
  const len = Math.min(...responses.map((r) => r?.length ?? 0));
  if (len < 1) return null;

  // Determine the two binary levels: declared meta.levels wins; otherwise use the
  // UNION of distinct non-empty values across all responses (handles monovariate first
  // response — e.g., all 'no' at baseline before any switching occurs).
  /** @type {string[]} */
  const declared = Array.isArray(meta?.levels) ? meta.levels.filter(Boolean) : [];
  const inferred = declared.length === 2
    ? declared
    : [...new Set(responses.flatMap((r) => r.map((v) => v?.toString().trim())).filter(Boolean))].sort();
  if (inferred.length !== 2) return null;
  const [level0, level1] = inferred;

  // Complete-case row alignment + binary mapping.
  /** @type {number[][]} */
  const aligned = Array.from({ length: K }, () => []);
  for (let i = 0; i < len; i++) {
    const row = [];
    let ok = true;
    for (let k = 0; k < K; k++) {
      const raw = responses[k][i]?.toString().trim() ?? '';
      if (raw === level0) row.push(0);
      else if (raw === level1) row.push(1);
      else { ok = false; break; }
    }
    if (ok) for (let k = 0; k < K; k++) aligned[k].push(row[k]);
  }
  const n = aligned[0].length;
  if (n < 1) return null;

  let method = null;
  let p_value = NaN;
  let test_stat = null;

  if (K === 2) {
    // McNemar: counts of discordant pairs.
    let b = 0, c = 0;  // b = (level1, level0), c = (level0, level1) — discordant
    for (let i = 0; i < n; i++) {
      const a0 = aligned[0][i]; const a1 = aligned[1][i];
      if (a0 === 1 && a1 === 0) b++;
      else if (a0 === 0 && a1 === 1) c++;
    }
    const discordant = b + c;
    if (discordant === 0) {
      method = translate('tests.mcnemar', lang);
      p_value = 1;
      test_stat = 0;
    } else if (discordant < 25) {
      // Exact binomial: 2 * P(X <= min(b,c)) with p = 0.5
      const k = Math.min(b, c);
      let cumProb = 0;
      for (let i = 0; i <= k; i++) {
        cumProb += binomialPMF(discordant, i, 0.5);
      }
      p_value = Math.min(1, 2 * cumProb);
      method = translate('tests.mcnemar', lang);
      test_stat = Math.abs(b - c);
    } else {
      // McNemar χ² with continuity correction.
      const chi = Math.pow(Math.abs(b - c) - 1, 2) / discordant;
      test_stat = chi;
      method = translate('tests.mcnemar', lang);
      p_value = stats ? 1 - stats.base.dists.chisquare.cdf(chi, 1) : NaN;
    }
  } else {
    // Cochran's Q: rows = subjects, cols = momentos, values ∈ {0,1}.
    // Q = k(k-1) Σ_j (C_j - T/k)² / (k·T - Σ_i R_i²), df = k - 1.
    const rowSums = new Array(n).fill(0);
    const colSums = new Array(K).fill(0);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < K; k++) {
        rowSums[i] += aligned[k][i];
        colSums[k] += aligned[k][i];
      }
    }
    const T = rowSums.reduce((a, b) => a + b, 0);
    const meanC = T / K;
    const num = K * (K - 1) * colSums.reduce((acc, Cj) => acc + (Cj - meanC) ** 2, 0);
    const denom = K * T - rowSums.reduce((acc, Ri) => acc + Ri * Ri, 0);
    let Q;
    if (denom === 0) { Q = 0; p_value = 1; }
    else {
      Q = num / denom;
      p_value = stats ? 1 - stats.base.dists.chisquare.cdf(Q, K - 1) : NaN;
    }
    test_stat = Q;
    method = translate('tests.cochranQ', lang);
  }

  // Build display table — rows = level breakdown per momento, cols = momentos + p-value.
  const groupLabel = translate('table.columns.variable', lang) || 'Statistic';
  const pValueLabel = translate('table.columns.pValue', lang) || 'p-value';
  const fmt = (/** @type {number} */ v, decimals = 4) => Number.isFinite(v) ? v.toFixed(decimals) : '';
  const rowsByLevel = [{ [groupLabel]: level0 }, { [groupLabel]: level1 }, { [groupLabel]: 'n' }];
  for (let k = 0; k < K; k++) {
    const col = labels[k];
    const ones = aligned[k].reduce((a, b) => a + b, 0);
    const zeros = n - ones;
    const pctZero = n > 0 ? (zeros / n) * 100 : 0;
    const pctOne = n > 0 ? (ones / n) * 100 : 0;
    rowsByLevel[0][col] = `${zeros} (${pctZero.toFixed(1)}%)`;
    rowsByLevel[1][col] = `${ones} (${pctOne.toFixed(1)}%)`;
    rowsByLevel[2][col] = String(n);
  }
  rowsByLevel[0][pValueLabel] = '';
  rowsByLevel[1][pValueLabel] = '';
  rowsByLevel[2][pValueLabel] = Number.isFinite(p_value)
    ? (p_value < 0.0001 ? '<0.0001' : fmt(p_value))
    : '';

  return {
    columns: [groupLabel, ...labels, pValueLabel],
    rows: rowsByLevel,
    test_used: method,
    p_value: Number.isFinite(p_value) ? +p_value.toFixed(4) : NaN,
    test_statistic: Number.isFinite(test_stat) ? +test_stat.toFixed(4) : NaN,
    n,
    k: K,
    lang
  };
};

/**
 * Binomial PMF: P(X = k) where X ~ Bin(n, p).
 * @param {number} n
 * @param {number} k
 * @param {number} p
 * @returns {number}
 */
const binomialPMF = (n, k, p) => {
  if (k < 0 || k > n) return 0;
  // log factorial via Math.lgamma surrogate using accumulated product (n small here, <25)
  let logC = 0;
  for (let i = 1; i <= k; i++) logC += Math.log((n - k + i) / i);
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p));
};

export default ns;
