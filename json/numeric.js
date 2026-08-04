// @ts-check
import { getJStat, getSS, getStatsLib, formatNumberLocale } from './_env.js';
import { getBinaryLabels, getTableHeaders, normalizeLanguage, translate } from '../i18n/index.js';
import variants from './variants.js';
import factors from './factors.js';

const ns = {};

/**
 * Descriptive summary for numeric vector.
 * @param {Array<string|number>} values
 */
ns.summarize_n = function (values, formatFn = null, options = {}) {
  const nums = [];
  let missingCount = 0;
  values.forEach((value) => {
    const sanitized = typeof value === 'string' ? variants.sanitizeNumericString(value) : String(value);
    const parsed = Number.parseFloat(sanitized);
    if (Number.isFinite(parsed)) {
      nums.push(parsed);
      return;
    }
    if (value !== undefined && value !== null && value !== '' && typeof value === 'string' && value.trim() === '') {
      missingCount += 1;
      return;
    }
    if (value === undefined || value === null || value === '' || Number.isNaN(parsed)) {
      missingCount += 1;
    }
  });
  const n = nums.length;
  const lang = normalizeLanguage(options?.lang);
  if (n === 0 && missingCount === 0) return { columns: [], rows: [], summary: { n: 0 }, lang };
  const valuesByGroup = { Total: nums };
  const missingCounts = missingCount > 0 ? { Total: missingCount } : {};
  const statOptions = options?.stat_options_numeric ?? options?.stat_options;
  const [variableHeader, descriptionHeader] = getTableHeaders(lang);
  const summaryRows = ns.getNumericalSummaryByGroup(
    valuesByGroup,
    { ...options, lang, missing_counts: missingCounts, stat_options: statOptions },
    formatFn
  );
  const groupLabel = translate('table.columns.group', lang);
  const formattedRows = summaryRows.map(row => ({ [variableHeader]: row[groupLabel], [descriptionHeader]: row.Total }));
  return { columns: [variableHeader, descriptionHeader], rows: formattedRows, summary: { n }, lang };
};


/**
 * Compute per-group descriptive statistics for numeric values.
 */
ns.getNumericalSummaryByGroup = function (valuesByGroup, options, formatFn = null) {
  const ss = getSS();
  const groupNames = Object.keys(valuesByGroup);
  const summaryRows = [];
  const statOptions = options?.stat_options ?? ['mean_sd'];
  const lang = normalizeLanguage(options?.lang);
  const groupLabel = translate('table.columns.group', lang);
  const missingCounts = options?.missing_counts || options?.missingCounts || {};
  const hasMissingRow = Array.isArray(groupNames) && groupNames.some(group => {
    const value = Number(missingCounts[group] ?? 0);
    return Number.isFinite(value) && value > 0;
  });
  const statLabels = {
    min: translate('stats.labels.min', lang),
    max: translate('stats.labels.max', lang),
    range: translate('stats.labels.range', lang),
    mean_sd: translate('stats.labels.mean_sd', lang),
    median_iqr: translate('stats.labels.median_iqr', lang),
    mode: translate('stats.labels.mode', lang),
    n: translate('stats.labels.n', lang),
    n_missing: translate('stats.labels.n_missing', lang)
  };
  const defaultMissing = translate('table.missingValue', lang);
  const formatDefault = (val) => formatNumberLocale(val, 1, lang);
  const getStats = (vals) => {
    const sorted = [...vals].sort((a, b) => a - b); const count = vals.length; if (count === 0) return null;
    const mean = count > 0 ? (vals.reduce((a, b) => a + b, 0) / count) : NaN;
    const sd = count > 1 ? Math.sqrt(vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / count) : NaN;
    const median = ss?.medianSorted ? ss.medianSorted(sorted) : NaN;
    const q1 = ss?.quantileSorted ? ss.quantileSorted(sorted, 0.25) : NaN;
    const q3 = ss?.quantileSorted ? ss.quantileSorted(sorted, 0.75) : NaN;
    const iqr = (q3 ?? NaN) - (q1 ?? NaN);
    const mode = (() => { try { return ss?.modeSorted ? ss.modeSorted(sorted) : null; } catch { return null; } })();
    const min = sorted[0]; const max = sorted[count - 1];
    return { n: count, mean, sd, median, q1, q3, iqr, mode, min, max };
  };
  for (const stat of statOptions) {
    if (stat === 'n_missing' && !hasMissingRow) continue;
    const statLabel = statLabels[stat] || stat;
    const row = { [groupLabel]: statLabel };
    groupNames.forEach(group => {
      if (stat === 'n_missing') {
        const missingRaw = Number(missingCounts[group] ?? 0);
        const normalizedMissing = Number.isFinite(missingRaw) ? Math.max(0, Math.floor(missingRaw)) : 0;
        const formattedMissing = typeof formatFn?.n_missing === 'function' ? formatFn.n_missing(normalizedMissing, group) : normalizedMissing.toString();
        row[group] = formattedMissing === undefined || formattedMissing === null ? '' : String(formattedMissing);
        return;
      }
      const vals = valuesByGroup[group] || []; const stats = getStats(vals); let cell = defaultMissing;
      if (!stats) { row[group] = defaultMissing; return; }
      try {
        switch (stat) {
          case 'min': cell = formatFn?.min?.(stats.min) ?? formatDefault(stats.min); break;
          case 'max': cell = formatFn?.max?.(stats.max) ?? formatDefault(stats.max); break;
          case 'range': { const range = stats.max - stats.min; cell = formatFn?.range?.(range) ?? formatDefault(range); break; }
          case 'mean_sd': cell = formatFn?.mean_sd?.(stats) ?? (isNaN(stats.mean) || isNaN(stats.sd) ? defaultMissing : `${formatDefault(stats.mean)} ± ${formatDefault(stats.sd)}`); break;
          case 'median_iqr': cell = formatFn?.median_iqr?.(stats) ?? (isNaN(stats.median) || isNaN(stats.iqr) ? defaultMissing : `${formatDefault(stats.median)} ± ${formatDefault(stats.iqr)}`); break;
          case 'mode': cell = formatFn?.mode?.(stats.mode) ?? (stats.mode == null ? defaultMissing : stats.mode.toString()); break;
          case 'n': cell = stats.n.toString(); break;
        }
      } catch { cell = defaultMissing; }
      row[group] = cell;
    });
    summaryRows.push(row);
  }
  return summaryRows;
};

/** Mann–Whitney U test (two-sided). */
ns.computeMannWhitney = function (x, y, correct = false, options = {}) {
  if (typeof correct === 'object' && correct !== null) {
    options = correct;
    correct = Boolean(options.correct);
  }
  if (typeof options !== 'object' || options === null) {
    options = {};
  }
  const lang = normalizeLanguage(options?.lang);
  const methodLabel = translate('tests.mannWhitney', lang);
  try {
    if (!x?.length || !y?.length) { return { pValue: null, statistic: null, method: methodLabel }; }
    const jStat = getJStat();
    const nx = x.length; const ny = y.length;
    const combined = [...x.map(val => ({ val, group: 'x' })), ...y.map(val => ({ val, group: 'y' }))];
    combined.sort((a, b) => a.val - b.val);
    const ranks = new Array(combined.length); let i = 0;
    while (i < combined.length) { let j = i; while (j + 1 < combined.length && combined[j + 1].val === combined[i].val) j++; const avgRank = (i + j + 2) / 2; for (let k = i; k <= j; k++) ranks[k] = avgRank; i = j + 1; }
    const Rx = combined.reduce((sum, item, idx) => item.group === 'x' ? sum + ranks[idx] : sum, 0);
    const U = Rx - (nx * (nx + 1)) / 2;
    const mu = (nx * ny) / 2; const sigma = Math.sqrt((nx * ny * (nx + ny + 1)) / 12);
    let z = (U - mu) / sigma; if (correct) { z = (Math.abs(U - mu) - 0.5) / sigma; }
    const pValue = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
    return { pValue, statistic: U, method: methodLabel };
  } catch { return { pValue: null, statistic: null, method: methodLabel }; }
};

/** Stack grouped numeric arrays into x values and y group labels. */
ns.stackGroups = function (groupMap) { const x = [], y = []; for (const group in groupMap) { const values = groupMap[group]; for (const val of values) { x.push(val); y.push(group); } } return { x, y }; };

/** Tukey HSD post-hoc for ANOVA (via jStat). */
ns.runTukeyHSD = function (groupMap, alpha = 0.05) {
  try { const jStat = getJStat(); const groupNames = Object.keys(groupMap); const groupArrays = groupNames.map(name => groupMap[name]); const comparisons = jStat.tukeyhsd(groupArrays); return comparisons.map(([indexes, p]) => ({ groupA: groupNames[indexes[0]], groupB: groupNames[indexes[1]], pValue: +p.toFixed(4), significant: p < alpha })); } catch { return []; }
};

/**
 * Compute mid-ranks of a numeric array, averaging ranks across ties.
 * @param {number[]} xs
 * @returns {number[]}
 */
const computeRanks = (xs) => {
  const indexed = xs.map((val, i) => ({ val, i }));
  indexed.sort((a, b) => a.val - b.val);
  const ranks = new Array(xs.length);
  let pos = 0;
  while (pos < indexed.length) {
    let start = pos;
    while (pos + 1 < indexed.length && indexed[pos + 1].val === indexed[start].val) pos++;
    const avgRank = (start + pos + 2) / 2;
    for (let k = start; k <= pos; k++) ranks[indexed[k].i] = avgRank;
    pos++;
  }
  return ranks;
};

/**
 * Pearson product-moment correlation coefficient.
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {number}
 */
const pearsonR = (xs, ys) => {
  const n = xs.length;
  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) { sumX += xs[i]; sumY += ys[i]; }
  const mx = sumX / n, my = sumY / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? num / denom : 0;
};

/**
 * Two-sided p-value for the test H0: ρ = 0 given Pearson r and sample size n.
 * Uses the t-statistic t = r·sqrt((n-2)/(1-r²)) with df = n-2.
 * @param {number} r
 * @param {number} n
 * @returns {number}
 */
const correlationPValue = (r, n) => {
  if (n <= 2 || !Number.isFinite(r)) return NaN;
  if (Math.abs(r) >= 1) return 0;
  const jStat = getJStat();
  if (!jStat) return NaN;
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), n - 2));
  return Number.isFinite(p) ? p : NaN;
};

/**
 * Summarize two numeric vectors with a correlation coefficient (Pearson when both
 * vectors look normal by marginal KS test, Spearman otherwise). Confidence interval
 * computed via Fisher's z-transformation.
 *
 * @param {Array<string|number>} predictorVals
 * @param {Array<string|number>} responseVals
 * @param {Function|null} [formatFn] Currently unused; kept for signature symmetry with siblings.
 * @param {{alpha?:number, lang?:string, [k:string]:any}} [options]
 * @returns {{columns:string[], rows:Array<Record<string,any>>, test_used:string|null, p_value:number, correlation:number, ci_lower:number, ci_upper:number, n:number, lang:string}|null}
 */
ns.summarize_n_n = function (predictorVals, responseVals, formatFn = null, options = {}) {
  const lang = normalizeLanguage(options?.lang);
  // 1. Pair-wise filter (drop rows where either value is non-numeric/finite).
  /** @type {number[]} */ const xs = [];
  /** @type {number[]} */ const ys = [];
  const len = Math.min(predictorVals.length, responseVals.length);
  for (let i = 0; i < len; i++) {
    const pRaw = predictorVals[i]; const rRaw = responseVals[i];
    const xSan = typeof pRaw === 'string' ? variants.sanitizeNumericString(pRaw) : String(pRaw ?? '');
    const ySan = typeof rRaw === 'string' ? variants.sanitizeNumericString(rRaw) : String(rRaw ?? '');
    const x = Number.parseFloat(xSan); const y = Number.parseFloat(ySan);
    if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
  }
  const n = xs.length;
  if (n < 3) return null;

  // 2. Marginal normality (KS on z-scores). Mirrors the strategy used in summarize_n_q.
  const stats = getStatsLib();
  /** @param {number[]} arr */
  const isMarginalNormal = (arr) => {
    if (!stats || arr.length < 2) return false;
    const mean = arr.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / arr.length;
    const variance = arr.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + (b - mean) ** 2, 0) / arr.length;
    if (variance <= 0) return false;
    const sd = Math.sqrt(variance);
    const z = arr.map((/** @type {number} */ v) => (v - mean) / sd);
    try {
      const result = stats.kstest(z, 'normal', 0, 1);
      return Number.isFinite(result?.pValue) && result.pValue >= 0.05;
    } catch { return false; }
  };
  const parametric = isMarginalNormal(xs) && isMarginalNormal(ys);

  // 3. Compute correlation.
  let r;
  let method;
  if (parametric) {
    r = pearsonR(xs, ys);
    method = translate('tests.pearson', lang);
  } else {
    r = pearsonR(computeRanks(xs), computeRanks(ys));
    method = translate('tests.spearman', lang);
  }
  const p_value = correlationPValue(r, n);

  // 4. CI 95% via Fisher's z-transformation.
  let ci_lower = NaN, ci_upper = NaN;
  if (n > 3 && Math.abs(r) < 1) {
    const z = 0.5 * Math.log((1 + r) / (1 - r));
    const se = 1 / Math.sqrt(n - 3);
    const zLow = z - 1.96 * se; const zHigh = z + 1.96 * se;
    ci_lower = (Math.exp(2 * zLow) - 1) / (Math.exp(2 * zLow) + 1);
    ci_upper = (Math.exp(2 * zHigh) - 1) / (Math.exp(2 * zHigh) + 1);
  }

  // 5. Build display table.
  const statisticLabel = translate('table.columns.variable', lang) || 'Statistic';
  const valueLabel = translate('table.columns.description', lang) || 'Value';
  const fmt = (/** @type {number} */ v, decimals = 4) => Number.isFinite(v) ? formatNumberLocale(v, decimals, lang) : '';
  const ciText = (Number.isFinite(ci_lower) && Number.isFinite(ci_upper))
    ? `[${fmt(ci_lower)}, ${fmt(ci_upper)}]`
    : '';
  const pText = Number.isFinite(p_value)
    ? (p_value < 0.0001 ? '<0.0001' : fmt(p_value))
    : '';
  const rows = [
    { [statisticLabel]: 'n', [valueLabel]: String(n) },
    { [statisticLabel]: 'r', [valueLabel]: fmt(r) },
    { [statisticLabel]: '95% CI', [valueLabel]: ciText },
    { [statisticLabel]: 'p-value', [valueLabel]: pText }
  ];
  return {
    columns: [statisticLabel, valueLabel],
    rows,
    test_used: method,
    p_value: Number.isFinite(p_value) ? +p_value.toFixed(4) : NaN,
    correlation: +r.toFixed(4),
    ci_lower: Number.isFinite(ci_lower) ? +ci_lower.toFixed(4) : NaN,
    ci_upper: Number.isFinite(ci_upper) ? +ci_upper.toFixed(4) : NaN,
    n,
    lang
  };
};

/**
 * Compare K paired numeric responses across the same individuals (Profile B, n-typed).
 *
 * Pipeline:
 *  - Aligns rows across `responses` (array of K numeric vectors). Drops rows where any
 *    of the K values is non-numeric or non-finite (complete-case analysis).
 *  - For K = 2: tests normality of the differences via KS. If normal → paired t-test;
 *    else Wilcoxon signed-rank.
 *  - For K ≥ 3: tests marginal normality of each response. If all normal → Friedman is
 *    still preferred (RM-ANOVA requires sphericity correction that adds complexity);
 *    deferred. Else Friedman.
 *
 * Output mirrors `summarize_n_q` style: rows = descriptive stats per momento, columns =
 * the momentos (response labels) + a p-value cell. `test_used` carries the test name.
 *
 * @param {Array<Array<string|number>>} responses K arrays of numeric values, all same length.
 * @param {string[]} labels Labels for each response (column headers).
 * @param {Function|null} [formatFn]
 * @param {Set<string>|null} [flagsUsed]
 * @param {Record<string,any>} [options]
 * @returns {{columns:string[], rows:Array<Record<string,any>>, test_used:string|null, p_value:number, n:number, k:number, lang:string}|null}
 */
ns.summarize_n_paired = function (responses, labels, formatFn = null, flagsUsed = null, options = {}) {
  const lang = normalizeLanguage(options?.lang);
  const K = responses.length;
  if (K < 2) return null;
  const len = Math.min(...responses.map((r) => r?.length ?? 0));
  if (len < 3) return null;

  // Complete-case row alignment + numeric sanitization.
  /** @type {number[][]} */
  const aligned = Array.from({ length: K }, () => []);
  for (let i = 0; i < len; i++) {
    const row = [];
    let ok = true;
    for (let k = 0; k < K; k++) {
      const raw = responses[k][i];
      const sanitized = typeof raw === 'string' ? variants.sanitizeNumericString(raw) : String(raw ?? '');
      const val = Number.parseFloat(sanitized);
      if (!Number.isFinite(val)) { ok = false; break; }
      row.push(val);
    }
    if (ok) for (let k = 0; k < K; k++) aligned[k].push(row[k]);
  }
  const n = aligned[0].length;
  if (n < 3) return null;

  const stats = getStatsLib();
  const jStat = getJStat();

  // Decide parametric branch.
  /** @param {number[]} arr */
  const isMarginalNormal = (arr) => {
    if (!stats || arr.length < 2) return false;
    const mean = arr.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / arr.length;
    const variance = arr.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + (b - mean) ** 2, 0) / arr.length;
    if (variance <= 0) return false;
    const sd = Math.sqrt(variance);
    const z = arr.map((/** @type {number} */ v) => (v - mean) / sd);
    try {
      const result = stats.kstest(z, 'normal', 0, 1);
      return Number.isFinite(result?.pValue) && result.pValue >= 0.05;
    } catch { return false; }
  };

  let method = null;
  let p_value = NaN;
  let test_stat = null;

  if (K === 2) {
    // Differences for paired comparison.
    const diff = aligned[0].map((v, i) => v - aligned[1][i]);
    const parametric = isMarginalNormal(diff);
    if (parametric && stats) {
      // Paired t-test: t = mean(diff) / (sd(diff)/sqrt(n)), df = n-1.
      const meanD = diff.reduce((a, b) => a + b, 0) / n;
      const sdD = Math.sqrt(diff.reduce((a, b) => a + (b - meanD) ** 2, 0) / (n - 1));
      const se = sdD / Math.sqrt(n);
      const t = se > 0 ? meanD / se : 0;
      test_stat = t;
      p_value = jStat && se > 0 ? 2 * (1 - jStat.studentt.cdf(Math.abs(t), n - 1)) : NaN;
      method = translate('tests.pairedT', lang);
    } else {
      // Wilcoxon signed-rank.
      const result = wilcoxonSignedRank(diff, jStat);
      method = translate('tests.wilcoxonSigned', lang);
      p_value = result.p;
      test_stat = result.W;
    }
  } else {
    // K ≥ 3: Friedman.
    const result = friedmanTest(aligned, jStat);
    method = translate('tests.friedman', lang);
    p_value = result.p;
    test_stat = result.Q;
  }

  // Build display table — rows = stats (Mean ± SD, Median ± IQR, n), cols = momentos.
  const groupLabel = translate('table.columns.variable', lang) || 'Statistic';
  const pValueLabel = translate('table.columns.pValue', lang) || 'p-value';
  const fmt = (/** @type {number} */ v, decimals = 2) => Number.isFinite(v) ? formatNumberLocale(v, decimals, lang) : '';
  /** @param {number[]} arr */
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  /** @param {number[]} arr */
  const sd = (arr) => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
  };
  /** @param {number[]} arr */
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  };
  /** @param {number[]} arr */
  const iqr = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const q = (p) => {
      const pos = p * (s.length - 1);
      const lo = Math.floor(pos); const hi = Math.ceil(pos); const frac = pos - lo;
      return s[lo] + (s[hi] - s[lo]) * frac;
    };
    return q(0.75) - q(0.25);
  };

  const rowMeanSD = { [groupLabel]: 'Mean ± SD' };
  const rowMedIQR = { [groupLabel]: 'Median ± IQR' };
  const rowN = { [groupLabel]: 'n' };
  for (let k = 0; k < K; k++) {
    const col = labels[k];
    rowMeanSD[col] = `${fmt(mean(aligned[k]))} ± ${fmt(sd(aligned[k]))}`;
    rowMedIQR[col] = `${fmt(median(aligned[k]))} ± ${fmt(iqr(aligned[k]))}`;
    rowN[col] = String(n);
  }
  rowMeanSD[pValueLabel] = '';
  rowMedIQR[pValueLabel] = '';
  rowN[pValueLabel] = Number.isFinite(p_value)
    ? (p_value < 0.0001 ? '<0.0001' : fmt(p_value, 4))
    : '';

  return {
    columns: [groupLabel, ...labels, pValueLabel],
    rows: [rowMeanSD, rowMedIQR, rowN],
    test_used: method,
    p_value: Number.isFinite(p_value) ? +p_value.toFixed(4) : NaN,
    test_statistic: Number.isFinite(test_stat) ? +test_stat.toFixed(4) : NaN,
    n,
    k: K,
    lang
  };
};

/**
 * Wilcoxon signed-rank test on a vector of differences.
 * Two-sided, with mid-rank tie correction and normal approximation for the p-value.
 * @param {number[]} diff
 * @param {any} jStat
 * @returns {{W:number, p:number}}
 */
const wilcoxonSignedRank = (diff, jStat) => {
  const nonZero = diff.filter((d) => d !== 0);
  const n = nonZero.length;
  if (n < 1) return { W: 0, p: NaN };
  const abs = nonZero.map((d) => Math.abs(d));
  const ranks = computeRanks(abs);
  let Wplus = 0;
  for (let i = 0; i < n; i++) if (nonZero[i] > 0) Wplus += ranks[i];
  const Wminus = (n * (n + 1)) / 2 - Wplus;
  const W = Math.min(Wplus, Wminus);
  const mean = (n * (n + 1)) / 4;
  // Tie correction
  const tieCounts = new Map();
  ranks.forEach((r) => { tieCounts.set(r, (tieCounts.get(r) || 0) + 1); });
  let tieSum = 0;
  tieCounts.forEach((t) => { if (t > 1) tieSum += t ** 3 - t; });
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieSum / 48;
  const se = Math.sqrt(variance);
  let p = NaN;
  if (jStat && se > 0) {
    const z = (W - mean) / se;
    p = 2 * jStat.normal.cdf(-Math.abs(z), 0, 1);
  }
  return { W, p };
};

/**
 * Friedman test on K paired numeric vectors (already row-aligned, same length n).
 * @param {number[][]} aligned K arrays of length n.
 * @param {any} jStat
 * @returns {{Q:number, p:number}}
 */
const friedmanTest = (aligned, jStat) => {
  const K = aligned.length;
  const n = aligned[0].length;
  // Rank within each row (across K conditions).
  const colRankSums = new Array(K).fill(0);
  let tieAdjustment = 0;
  for (let i = 0; i < n; i++) {
    const rowVals = aligned.map((col) => col[i]);
    const rowRanks = computeRanks(rowVals);
    for (let k = 0; k < K; k++) colRankSums[k] += rowRanks[k];
    // Tie correction term for this row.
    const tieCounts = new Map();
    rowRanks.forEach((r) => { tieCounts.set(r, (tieCounts.get(r) || 0) + 1); });
    tieCounts.forEach((t) => { if (t > 1) tieAdjustment += t ** 3 - t; });
  }
  const sumSq = colRankSums.reduce((a, b) => a + b * b, 0);
  let Q = (12 / (n * K * (K + 1))) * sumSq - 3 * n * (K + 1);
  // Tie correction: divide by 1 - tieAdjustment / (n * (K^3 - K)).
  const tieFactor = 1 - tieAdjustment / (n * (K ** 3 - K));
  if (tieFactor > 0) Q = Q / tieFactor;
  const p = jStat ? 1 - jStat.chisquare.cdf(Q, K - 1) : NaN;
  return { Q, p };
};

/** Dunn post-hoc for Kruskal–Wallis with p-adjust (bonferroni|holm|none). */
ns.runDunnTest = function (groupMap, alpha = 0.05, adjust = 'bonferroni') {
  try {
    const jStat = getJStat(); const groupNames = Object.keys(groupMap); const allValues = []; const groupLabels = [];
    for (const group of groupNames) { const values = groupMap[group].filter(v => typeof v === 'number'); for (const v of values) { allValues.push(v); groupLabels.push(group); } }
    const indexed = allValues.map((val, i) => ({ val, i })); indexed.sort((a, b) => a.val - b.val);
    const ranks = new Array(allValues.length); let pos = 0; while (pos < indexed.length) { let start = pos; while (pos + 1 < indexed.length && indexed[pos + 1].val === indexed[start].val) { pos++; } const avgRank = (start + pos + 2) / 2; for (let k = start; k <= pos; k++) { ranks[indexed[k].i] = avgRank; } pos++; }
    const groupStats = {}; groupNames.forEach(g => { groupStats[g] = { sumRanks: 0, n: 0 }; }); for (let i = 0; i < groupLabels.length; i++) { const g = groupLabels[i]; groupStats[g].sumRanks += ranks[i]; groupStats[g].n++; }
    const N = allValues.length; const comparisonsRaw = []; const k = groupNames.length;
    for (let i = 0; i < k - 1; i++) { for (let j = i + 1; j < k; j++) { const gi = groupNames[i]; const gj = groupNames[j]; const Ri = groupStats[gi].sumRanks; const Rj = groupStats[gj].sumRanks; const ni = groupStats[gi].n; const nj = groupStats[gj].n; const meanRi = Ri / ni; const meanRj = Rj / nj; const SE = Math.sqrt(((N * (N + 1)) / 12) * (1 / ni + 1 / nj)); const z = (meanRi - meanRj) / SE; const pRaw = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1)); comparisonsRaw.push({ groupA: gi, groupB: gj, pRaw }); } }
    const m = comparisonsRaw.length; let comparisons = [];
    if (adjust === 'bonferroni') { comparisons = comparisonsRaw.map(comp => ({ groupA: comp.groupA, groupB: comp.groupB, pValue: Math.min(comp.pRaw * m, 1), significant: comp.pRaw * m < alpha })); }
    else if (adjust === 'holm') { const sorted = [...comparisonsRaw].sort((a, b) => a.pRaw - b.pRaw); const adjusted = []; for (let i = 0; i < m; i++) { const adjP = Math.min((m - i) * sorted[i].pRaw, 1); adjusted.push({ ...sorted[i], adjP }); } for (let i = m - 2; i >= 0; i--) { adjusted[i].adjP = Math.max(adjusted[i].adjP, adjusted[i + 1].adjP); } comparisons = adjusted.map(comp => ({ groupA: comp.groupA, groupB: comp.groupB, pValue: comp.adjP, significant: comp.adjP < alpha })); }
    else { comparisons = comparisonsRaw.map(comp => ({ groupA: comp.groupA, groupB: comp.groupB, pValue: comp.pRaw, significant: comp.pRaw < alpha })); }
    return comparisons.map(c => ({ groupA: c.groupA, groupB: c.groupB, pValue: +c.pValue.toFixed(4), significant: c.significant }));
  } catch { return []; }
};

/**
 * Decompose list-like qualitative values (e.g., 'A;B') into binary Yes/No columns.
 */
ns.decomposeListAsBinaryCols = function (values, sep = ';', options = {}) {
  const lang = normalizeLanguage(options?.lang); const labelsBase = getBinaryLabels(lang);
  const yesLabel = options?.yes_label ?? labelsBase.yes; const noLabel = options?.no_label ?? labelsBase.no; const min_count = options?.binary_min_count ?? 1;
  const labels = { yes: yesLabel, no: noLabel };
  const n = values.length; const result = {}; const countMap = {}; const allItems = [];
  values.forEach(val => { if (factors.isMissingValue(val)) { allItems.push(null); return; } const items = String(val).trim().split(sep).map(x => x.trim()).filter(Boolean); const itemSet = new Set(items); allItems.push(itemSet); items.forEach(item => { countMap[item] = (countMap[item] || 0) + 1; }); });
  Object.entries(countMap).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([item, count]) => {
    if (count >= min_count) {
      const column = [];
      for (let i = 0; i < n; i++) {
        const set = allItems[i];
        if (set instanceof Set) column.push(set.has(item) ? yesLabel : noLabel);
        else column.push(noLabel);
      }
      result[item] = column;
    }
  });
  return { columns: result, labels };
};


/**
 * Compare numeric predictor across qualitative groups (t-test/Kruskal–Wallis).
 * Builds descriptive rows via getNumericalSummaryByGroup and appends test info.
 * @param {Array<string|number>} predictorVals
 * @param {Array<string>} responseVals
 * @param {Function|null} [formatFn]
 * @param {Set<string>|null} [flagsUsed]
 * @param {{responseLabels?: string[]|null, alpha?: number, adjust_kruskal?: string, lang?: string, [k:string]: any}} [options]
 *   `responseLabels`: ordered factor levels of the q response. When provided, group columns
 *   follow that order (R-style factor); otherwise falls back to insertion order from data.
 */
ns.summarize_n_q = function (predictorVals, responseVals, formatFn = null, flagsUsed = null, options = {}) {
  const groupMap = {};
  const missingCounts = {};
  predictorVals.forEach((pred, i) => {
    if (factors.isMissingValue(responseVals[i])) return;
    const group = String(responseVals[i]).trim();
    if (!groupMap[group]) groupMap[group] = [];
    const sanitized = typeof pred === 'string' ? variants.sanitizeNumericString(pred) : String(pred);
    const val = Number.parseFloat(sanitized);
    if (Number.isFinite(val)) {
      groupMap[group].push(val);
    } else {
      missingCounts[group] = (missingCounts[group] || 0) + 1;
    }
  });

  const responseLabels = Array.isArray(options?.responseLabels) ? options.responseLabels : null;
  const groupNames = responseLabels
    ? responseLabels.filter(label => Object.prototype.hasOwnProperty.call(groupMap, label))
    : Object.keys(groupMap);
  const groupsWithData = groupNames.filter(name => (groupMap[name] || []).length > 0);
  const activeGroupMap = Object.fromEntries(groupsWithData.map(name => [name, groupMap[name]]));
  const nGroups = groupsWithData.length;
  const alpha = options?.alpha ?? 0.05;
  const adjustKruskal = options?.adjust_kruskal ?? 'bonferroni';
  const lang = normalizeLanguage(options?.lang);
  const groupLabel = translate('table.columns.group', lang);
  const pValueLabel = translate('table.columns.pValue', lang);

  // 1) Descriptives by group
  const statOptions = options?.stat_options_by_group ?? options?.stat_options;
  const summaryRows = ns.getNumericalSummaryByGroup(
    groupMap,
    { ...options, lang, missing_counts: missingCounts, stat_options: statOptions },
    formatFn
  );

  // 2) Stats lib (stdlib-js)
  const stats = getStatsLib();
  if (!stats) {
    // Fill empty p-value column and return with error method
    summaryRows.forEach(r => r[pValueLabel] = '');
    return {
      columns: [groupLabel, ...groupNames, pValueLabel],
      rows: summaryRows,
      test_used: translate('errors.stdlibNotLoaded', lang),
      p_value: null
    };
  }

  // 3) Normality via K-S on z-scores
  const jStat = getJStat();
  const zScores = (data) => {
    const mean = jStat.mean(data);
    const sd = jStat.stdev(data, true);
    return sd > 0 ? data.map(x => (x - mean) / sd) : data.map(() => 0);
  };
  let allNormal = true;
  try {
    for (const group of groupsWithData) {
      const vals = groupMap[group];
      if (vals.length >= 3) {
        const z = zScores(vals);
        const result = stats.kstest(z, 'normal', 0, 1);
        if (result.pValue < 0.05) { allNormal = false; break; }
      } else { allNormal = false; break; }
    }
  } catch { allNormal = false; }

  // 4) Homoscedasticity (Bartlett)
  let homo = false;
  try {
    const groupArrays = groupsWithData.map(name => groupMap[name]);
    if (groupArrays.length >= 2) {
      const bart = stats.bartlettTest(...groupArrays);
      homo = bart.pValue >= 0.05;
    } else {
      homo = false;
    }
  } catch { homo = false; }

  // 5) Statistical test
  const parametric = allNormal && homo;
  let p_value = null;
  let method = null;
  let posthoc = null;
  try {
    if (nGroups === 2) {
      const [g1, g2] = groupsWithData.map(name => groupMap[name]);
      if (allNormal) {
        const result = stats.ttest2(g1, g2, { variance: homo ? 'equal' : 'unequal' });
        p_value = result.pValue;
        method = translate('tests.tStudent', lang);
      } else {
        const result = ns.computeMannWhitney(g1, g2, false, { lang });
        p_value = result.pValue;
        method = result.method;
      }
    } else if (nGroups > 2) {
      const groups = groupsWithData.map(name => groupMap[name]);
      if (parametric) {
        const { x, y } = ns.stackGroups(activeGroupMap);
        const result = stats.anova1(x, y);
        p_value = result?.pValue ?? null;
        method = translate('tests.anova', lang);
        if (jStat?.utils?.isNumber(p_value) && p_value < alpha) {
          posthoc = ns.runTukeyHSD(activeGroupMap, alpha).filter(v => v.significant);
          if (posthoc.length) flagsUsed?.add?.('has_tukey');
        }
      } else {
        const result = stats.kruskalTest(...groups);
        p_value = result.pValue;
        method = translate('tests.kruskalWallis', lang);
        if (jStat?.utils?.isNumber(p_value) && p_value < alpha) {
          posthoc = ns.runDunnTest(activeGroupMap, alpha, adjustKruskal).filter(v => v.significant);
          flagsUsed?.add?.('has_kruskal_sign');
        }
      }
    }
  } catch {
    p_value = null;
    method = translate('errors.calculationFailed', lang);
  }

  // 6) Output rows: ensure p-value column present but empty per row
  summaryRows.forEach(r => r[pValueLabel] = '');
  return {
    columns: [groupLabel, ...groupNames, pValueLabel],
    rows: summaryRows,
    test_used: method,
    // Guard explicitly rather than coercing: `+(null?.toFixed?.(4) ?? null)` evaluates to 0 — a
    // finite number that renders as "<0.001", i.e. the strongest possible significance for a
    // comparison that never ran. Both paths reach here with p_value still null: a response with
    // fewer than two groups carrying data (neither test branch above fires) and a computation
    // that threw. Keeping null sends the exporter down its missing-value branch instead.
    p_value: Number.isFinite(p_value) ? +p_value.toFixed(4) : null,
    posthoc
  };
};

/** Matches values that contain only numeric-safe characters (no spurious letters etc.) */
const CLEAN_NUMERIC_RE = /^[0-9.,+\- ]*$/;

/**
 * Returns warning strings for values with spurious characters in a numeric column.
 * Parseable after sanitization: "row N: original → parsed".
 * Not parseable: "row N: original (not numeric)".
 * Silent for empty/missing values and values with no spurious characters (e.g. decimal comma).
 * Returns [] if col_type !== 'n'.
 * @param {{col_type: 'n'|'q'|'l', col_sep?: string, col_values: any}} column
 * @param {string} [lang]
 * @returns {string[]}
 */
ns.getNumericWarnings = function (column, lang) {
  if (!column || column.col_type !== 'n') return [];
  const values = factors.decodeColumn(column);
  /** @type {string[]} */
  const warnings = [];
  values.forEach((value, i) => {
    if (factors.isMissingValue(value)) return;
    const original = String(value).trim();
    if (CLEAN_NUMERIC_RE.test(original)) return;
    const normalized = variants.sanitizeNumericString(original);
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      warnings.push(translate('import.warnings.numericCoerced', lang, { row: i + 1, original, parsed }));
    } else {
      warnings.push(translate('import.warnings.numericDropped', lang, { row: i + 1, original }));
    }
  });
  return warnings;
};

export default ns;
