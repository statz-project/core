// @ts-check
import { getJStat, getSS, getStatsLib, formatNumberLocale, formatPValue, PVALUE_DECIMALS, PVALUE_THRESHOLD } from './_env.js';
import { getBinaryLabels, getTableHeaders, normalizeLanguage, translate } from '../i18n/index.js';
import variants from './variants.js';
import factors from './factors.js';

const ns = {};

/**
 * Sample statistics, defined once.
 *
 * Every one of these was written inline at several call sites, and each duplication drifted on its
 * own: the variance divisor was n at two sites and n − 1 at four, and quantiles were taken from
 * `ss.quantileSorted` in the grouped tables but from a hand-written linear interpolation in the
 * paired one — the two disagree, so the same values reported a different IQR depending on which
 * table asked. Naming the object `sample` states the assumption these all share: Statz describes
 * samples, never populations, so the variance is the unbiased estimator.
 *
 * `quantile` interpolates linearly over p × (n − 1), which is R's type 7 — the default in R, numpy,
 * pandas and Excel's QUARTILE.INC, and the definition a user checking our output against theirs
 * will most likely be holding. `ss.quantileSorted` implements a different rule and is no longer
 * used for this. These are deliberately not delegated to jStat: the descriptive path reaches them
 * through `getNumericalSummaryByGroup`, which needs no statistics library today, and its cells are
 * built inside a try/catch that would turn a missing library into a silent "—" rather than an error.
 */
const sample = {
  /** @param {number[]} arr */
  mean: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
  /** Unbiased variance (n − 1). NaN below two values, where it is undefined. @param {number[]} arr */
  variance: (arr) => {
    if (arr.length < 2) return NaN;
    const m = sample.mean(arr);
    return arr.reduce((a, b) => a + ((b - m) ** 2), 0) / (arr.length - 1);
  },
  /** @param {number[]} arr */
  sd: (arr) => Math.sqrt(sample.variance(arr)),
  /** @param {number[]} arr */
  median: (arr) => sample.quantile(arr, 0.5),
  /** R type 7. @param {number[]} arr @param {number} p */
  quantile: (arr, p) => {
    const s = [...arr].sort((a, b) => a - b);
    if (s.length === 0) return NaN;
    const pos = p * (s.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return s[lo] + ((s[hi] - s[lo]) * (pos - lo));
  },
  /** @param {number[]} arr */
  iqr: (arr) => sample.quantile(arr, 0.75) - sample.quantile(arr, 0.25)
};

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
    // Anything that is not a finite number is missing to a numeric summary. This is the shape
    // `summarize_n_q` already uses, and it subsumes `factors.isMissingValue`: a blank,
    // whitespace-only, null or undefined cell never parses, so testing that predicate separately
    // only restates the condition. The three branches this replaces enumerated those cases plus a
    // failed parse and still let one through — a raw ±Infinity matched none of them, so it was
    // dropped from `n` without being counted, and n_missing silently disagreed with the total.
    missingCount += 1;
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
    const mean = sample.mean(vals);
    const sd = sample.sd(vals);
    const median = sample.median(sorted);
    const q1 = sample.quantile(sorted, 0.25);
    const q3 = sample.quantile(sorted, 0.75);
    const iqr = q3 - q1;
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
/**
 * Per-group n, mean and unbiased variance for the heteroscedastic tests below. Groups with fewer
 * than two values are dropped: their variance is undefined, and Welch weights it by 1/s².
 * @param {Record<string, number[]>} groupMap
 * @returns {Array<{name:string, n:number, mean:number, variance:number}>}
 */
const describeGroups = (groupMap) => Object.keys(groupMap)
  .filter((name) => Array.isArray(groupMap[name]) && groupMap[name].length > 1)
  .map((name) => {
    const values = groupMap[name];
    const n = values.length;
    const mean = sample.mean(values);
    const variance = sample.variance(values);
    return { name, n, mean, variance };
  });

/**
 * Welch's one-way ANOVA: the omnibus test for normal groups with UNEQUAL variances.
 *
 * The k > 2 branch used to route heteroscedastic data to Kruskal-Wallis, which conflates two
 * different violations — Kruskal answers non-normality, not unequal spread, and is itself not
 * robust to it (it tests stochastic dominance, so equal medians with different variances can
 * still reject). The two-group branch has always made this distinction, switching `ttest2` to
 * `variance: 'unequal'`; this is the same correction for three or more.
 *
 * Formulated as R's `oneway.test(var.equal = FALSE)`: weights wᵢ = nᵢ/sᵢ², and
 *   F = Σ wᵢ(x̄ᵢ − x̃)² / [(k−1)(1 + 2(k−2)·tmp)],  df = (k−1, 1/(3·tmp))
 * where x̃ is the weighted grand mean and tmp = Σ[(1 − wᵢ/W)²/(nᵢ−1)] / (k²−1).
 * @param {Record<string, number[]>} groupMap
 * @returns {{pValue:number|null, statistic:number|null, df1:number|null, df2:number|null}}
 */
ns.computeWelchAnova = function (groupMap) {
  const empty = { pValue: null, statistic: null, df1: null, df2: null };
  try {
    const jStat = getJStat();
    const groups = describeGroups(groupMap);
    const k = groups.length;
    if (k < 2) return empty;
    const weights = groups.map((g) => g.n / g.variance);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const grandMean = groups.reduce((sum, g, i) => sum + weights[i] * g.mean, 0) / totalWeight;
    const tmp = groups.reduce((sum, g, i) => sum + (((1 - weights[i] / totalWeight) ** 2) / (g.n - 1)), 0)
      / ((k * k) - 1);
    if (!(tmp > 0)) return empty;
    const between = groups.reduce((sum, g, i) => sum + weights[i] * ((g.mean - grandMean) ** 2), 0);
    const statistic = between / ((k - 1) * (1 + (2 * (k - 2) * tmp)));
    const df1 = k - 1;
    const df2 = 1 / (3 * tmp);
    const pValue = 1 - jStat.centralF.cdf(statistic, df1, df2);
    // This is the real guard, not a formality. A constant group has zero variance, so its weight
    // nᵢ/sᵢ² is Infinity; the weighted grand mean then evaluates Infinity/Infinity and the NaN
    // propagates all the way here. Reporting nothing beats reporting a degenerate F.
    return Number.isFinite(pValue) ? { pValue, statistic, df1, df2 } : empty;
  } catch { return empty; }
};

/**
 * Games-Howell: the pairwise post-hoc that pairs with Welch's ANOVA.
 *
 * Same relationship to Welch that Tukey has to ANOVA — the multiplicity correction lives INSIDE
 * the statistic, compared against the studentized range for k means, so there is no external
 * adjustment to choose (which is why `adjust_kruskal` applies to Dunn and to nothing else). What
 * differs from Tukey is that the standard error is unpooled and the degrees of freedom are
 * Welch-Satterthwaite per pair, so neither assumes the equal variances Bartlett just rejected.
 *
 * Guards per PAIR rather than refusing wholesale the way `computeWelchAnova` does: a constant
 * group breaks Welch's weight nᵢ/sᵢ² for the whole omnibus test, but a comparison AGAINST a
 * constant group still has a finite standard error and is perfectly meaningful. Only when the
 * error is zero on both sides is no statistic available, and that reports p = 1 — no evidence
 * rather than certainty, the conservative direction for a degenerate input. Unreachable through
 * `summarize_n_q` regardless, which only reaches the post-hoc once the omnibus test returned a p.
 * @param {Record<string, number[]>} groupMap
 * @param {number=} alpha
 * @returns {Array<{groupA:string, groupB:string, pValue:number, significant:boolean}>}
 */
ns.runGamesHowell = function (groupMap, alpha = 0.05) {
  try {
    const jStat = getJStat();
    const groups = describeGroups(groupMap);
    const k = groups.length;
    if (k < 2) return [];
    const out = [];
    for (let i = 0; i < k - 1; i++) {
      for (let j = i + 1; j < k; j++) {
        const a = groups[i];
        const b = groups[j];
        const varA = a.variance / a.n;
        const varB = b.variance / b.n;
        const standardError = Math.sqrt((varA + varB) / 2);
        const df = ((varA + varB) ** 2)
          / (((varA ** 2) / (a.n - 1)) + ((varB ** 2) / (b.n - 1)));
        const q = standardError > 0 ? Math.abs(a.mean - b.mean) / standardError : 0;
        const pValue = (standardError > 0 && Number.isFinite(df) && df > 0)
          ? 1 - jStat.tukey.cdf(q, k, df)
          : 1;
        out.push({
          groupA: a.name,
          groupB: b.name,
          pValue: +pValue.toFixed(4),
          significant: pValue < alpha
        });
      }
    }
    return out;
  } catch { return []; }
};

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
  // simple-statistics' `sampleCorrelation`, which divides the covariance by the two sample SDs —
  // the n − 1 factors cancel, so it agreed with the raw Σ(dx·dy)/√(Σdx²·Σdy²) this replaces to
  // within 1e-15. Spearman reuses it over ranks, exactly as before.
  //
  // Two guards, for the two ways it can fail to return a number. A MISSING library returns NaN so
  // the failure is visible: the formula needed no library at all, and quietly reporting 0 would
  // read as "no correlation" rather than as a broken bundle. A CONSTANT vector leaves r genuinely
  // undefined — `sampleCorrelation` says NaN, the old formula said 0 — and the 0 is kept because
  // nothing downstream distinguishes them and changing it would put NaN into a rendered cell.
  const ss = getSS();
  if (!ss?.sampleCorrelation) return NaN;
  const r = ss.sampleCorrelation(xs, ys);
  return Number.isFinite(r) ? r : 0;
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
    const mean = sample.mean(arr);
    const variance = sample.variance(arr);
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
  // Two decimals: a correlation and its interval are read for direction and rough strength, and
  // r = 0,87 says everything r = 0,8712 does. The four-decimal `correlation` / `ci_*` fields on
  // the returned object keep the precision for anyone computing with them.
  const fmt = (/** @type {number} */ v, decimals = 2) => Number.isFinite(v) ? formatNumberLocale(v, decimals, lang) : '';
  const ciText = (Number.isFinite(ci_lower) && Number.isFinite(ci_upper))
    ? `[${fmt(ci_lower)}, ${fmt(ci_upper)}]`
    : '';
  // Through the shared formatter like every other p-value in the library. The literal it replaces
  // was neither localized (a decimal point in a pt_br table) nor consistent with the 3 decimals
  // and `<0,001` cut-off used everywhere else.
  const pText = Number.isFinite(p_value)
    ? formatPValue(p_value, PVALUE_DECIMALS, PVALUE_THRESHOLD, lang)
    : '';
  const rows = [
    { [statisticLabel]: 'n', [valueLabel]: String(n) },
    { [statisticLabel]: 'r', [valueLabel]: fmt(r) },
    { [statisticLabel]: translate('table.columns.ci95', lang), [valueLabel]: ciText },
    { [statisticLabel]: translate('table.columns.pValue', lang), [valueLabel]: pText }
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
    const mean = sample.mean(arr);
    const variance = sample.variance(arr);
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
      // A paired t IS a one-sample t on the differences, so stdlib's `ttest` is the whole test.
      // It agreed with the hand-rolled `mean / (sd / √n)` against `jStat.studentt.cdf` to 1e-12.
      const result = stats.ttest(diff);
      test_stat = result.statistic;
      p_value = result.pValue;
      method = translate('tests.pairedT', lang);
    } else {
      // stdlib's Wilcoxon is EXACT for small n; the hand-rolled one used a normal approximation
      // with a tie correction, which is what stdlib falls back to itself once n passes its exact
      // threshold. The approximation ran consistently anti-conservative where the test is most
      // used: on real fixtures it reported 0.0117 and 0.0051 where the exact values are 0.0078 and
      // 0.0020. Note the reported statistic changes convention with it — stdlib reports W+ (R's V)
      // where the old code reported min(W+, W−).
      const result = stats ? stats.wilcoxon(diff) : null;
      method = translate('tests.wilcoxonSigned', lang);
      p_value = result ? result.pValue : NaN;
      test_stat = result ? result.statistic : NaN;
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

  // Which statistics appear is the user's call: `has_paired_n` is listed in the `appliesTo` of
  // `stat_options_by_group`, so the panel offers the choice — but this builder emitted a fixed
  // Mean ± SD / Median ± IQR / n whatever was selected, with the first two labels hardcoded in
  // English inside an otherwise localised table.
  const statOptions = options?.stat_options_by_group ?? options?.stat_options ?? ['mean_sd'];
  const statLabels = {
    min: translate('stats.labels.min', lang),
    max: translate('stats.labels.max', lang),
    mean_sd: translate('stats.labels.mean_sd', lang),
    median_iqr: translate('stats.labels.median_iqr', lang),
    n: translate('stats.labels.n', lang)
  };
  // The cells are built here rather than delegated to `getNumericalSummaryByGroup`, which serves the
  // grouped tables: the two differ only in presentation now that both read `sample` — this one
  // renders at 2 decimals against that one's 1 — and folding them together would change what one of
  // them prints for reasons unrelated to any of this. `n_missing` is absent by design — the moments are row-aligned, so an
  // individual missing any one of them is dropped from all of them and the count would be the same
  // in every column; it belongs to the table's `n`, not to a per-moment row. Selecting it there
  // yields no row, the same as the grouped helper does when no missing counts reach it.
  const cellFor = {
    min: (/** @type {number[]} */ vals) => fmt(Math.min(...vals)),
    max: (/** @type {number[]} */ vals) => fmt(Math.max(...vals)),
    mean_sd: (/** @type {number[]} */ vals) => `${fmt(sample.mean(vals))} ± ${fmt(sample.sd(vals))}`,
    median_iqr: (/** @type {number[]} */ vals) => `${fmt(sample.median(vals))} ± ${fmt(sample.iqr(vals))}`,
    n: () => String(n)
  };
  const rows = statOptions.filter((/** @type {string} */ stat) => cellFor[stat]).map((/** @type {string} */ stat) => {
    const row = { [groupLabel]: statLabels[stat] || stat };
    labels.forEach((/** @type {string} */ col, /** @type {number} */ k) => { row[col] = cellFor[stat](aligned[k]); });
    // Left empty like every other summarizer: the p-value belongs to the TABLE, not to a row, and
    // `combineAnalysisAsSingleTable` renders it once on the predictor header row — localised through
    // formatPValue and carrying the test symbol that ties it to the footer legend. Writing it here
    // too printed the same number twice in one table, the second copy raw.
    row[pValueLabel] = '';
    return row;
  });

  return {
    columns: [groupLabel, ...labels, pValueLabel],
    rows,
    test_used: method,
    p_value: Number.isFinite(p_value) ? +p_value.toFixed(4) : NaN,
    test_statistic: Number.isFinite(test_stat) ? +test_stat.toFixed(4) : NaN,
    n,
    k: K,
    lang
  };
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
    else if (adjust === 'holm') {
      // Holm ranks by ascending raw p, but only to compute; the OUTPUT keeps the original pair
      // order that `bonferroni` and `none` return, which follows the response's level order and
      // lets a reader scan the comparisons the same way whatever correction is chosen. Ranking
      // over indices rather than over a sorted copy of the objects is what makes that possible.
      const order = comparisonsRaw.map((_, i) => i).sort((a, b) => comparisonsRaw[a].pRaw - comparisonsRaw[b].pRaw);
      const adjusted = new Array(m);
      // Step-down monotonicity accumulates FORWARD, from the smallest raw p to the largest:
      // adj(k) = max(adj(k-1), (m-k+1)*p(k)). Running it backwards instead — the direction
      // Benjamini-Hochberg uses, with a running min — assigned every comparison the LARGEST
      // adjusted value, so the most significant pair was punished with the worst p and Holm
      // came out strictly more conservative than Bonferroni. It cannot be: the first term is
      // m*p(1), identical to Bonferroni's, so Holm is uniformly the more powerful of the two.
      let running = 0;
      order.forEach((index, rank) => {
        running = Math.max(running, Math.min((m - rank) * comparisonsRaw[index].pRaw, 1));
        adjusted[index] = running;
      });
      comparisons = comparisonsRaw.map((comp, i) => ({ groupA: comp.groupA, groupB: comp.groupB, pValue: adjusted[i], significant: adjusted[i] < alpha }));
    }
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
    const mean = sample.mean(data);
    const sd = sample.sd(data);
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
      } else if (allNormal) {
        // Normal but heteroscedastic. This used to fall through to Kruskal-Wallis, which answers
        // the WRONG violation: it is a test of stochastic dominance, not of means, and is itself
        // not robust to unequal spread. The two-group branch above has always drawn this
        // distinction by switching `ttest2` to `variance: 'unequal'`; Welch + Games-Howell is the
        // same correction for three or more groups, and keeps the post-hoc's assumptions matched
        // to the omnibus test's the way Tukey is matched to ANOVA.
        const result = ns.computeWelchAnova(activeGroupMap);
        p_value = result.pValue;
        method = translate('tests.welchAnova', lang);
        if (jStat?.utils?.isNumber(p_value) && p_value < alpha) {
          posthoc = ns.runGamesHowell(activeGroupMap, alpha).filter(v => v.significant);
          if (posthoc.length) flagsUsed?.add?.('has_games_howell');
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
