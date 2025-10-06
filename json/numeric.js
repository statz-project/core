// @ts-check
import { getJStat, getSS, getStatsLib, formatNumberLocale } from './_env.js';
import { getBinaryLabels, getTableHeaders, normalizeLanguage, translate } from '../i18n/index.js';

const ns = {};

/**
 * Descriptive summary for numeric vector.
 * @param {Array<string|number>} values
 */
ns.summarize_n = function (values, formatFn = null, options = {}) {
  const nums = [];
  let missingCount = 0;
  values.forEach((value) => {
    const parsed = Number.parseFloat(value);
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
  const [variableHeader, descriptionHeader] = getTableHeaders(lang);
  const summaryRows = ns.getNumericalSummaryByGroup(valuesByGroup, { ...options, lang, missing_counts: missingCounts }, formatFn);
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
          case 'mean_sd': cell = formatFn?.mean_sd?.(stats) ?? (isNaN(stats.mean) || isNaN(stats.sd) ? defaultMissing : `${formatDefault(stats.mean)} (${formatDefault(stats.sd)})`); break;
          case 'median_iqr': cell = formatFn?.median_iqr?.(stats) ?? (isNaN(stats.median) || isNaN(stats.iqr) ? defaultMissing : `${formatDefault(stats.median)} (${formatDefault(stats.iqr)})`); break;
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
  values.forEach(val => { const trimmed = (val || '').trim(); if (!trimmed) { allItems.push(null); return; } const items = trimmed.split(sep).map(x => x.trim()).filter(Boolean); const itemSet = new Set(items); allItems.push(itemSet); items.forEach(item => { countMap[item] = (countMap[item] || 0) + 1; }); });
  Object.entries(countMap).forEach(([item, count]) => { if (count >= min_count) { const column = []; for (let i = 0; i < n; i++) { const set = allItems[i]; if (set instanceof Set) column.push(set.has(item) ? yesLabel : noLabel); else column.push(noLabel); } result[item] = column; } });
  return { columns: result, labels };
};


/**
 * Compare numeric predictor across qualitative groups (t-test/Kruskal–Wallis).
 * Builds descriptive rows via getNumericalSummaryByGroup and appends test info.
 */
ns.summarize_n_q = function (predictorVals, responseVals, formatFn = null, flagsUsed = null, options = {}) {
  const groupMap = {};
  const missingCounts = {};
  predictorVals.forEach((pred, i) => {
    const group = responseVals[i]?.toString().trim();
    if (!group) return;
    if (!groupMap[group]) groupMap[group] = [];
    const val = Number.parseFloat(pred);
    if (Number.isFinite(val)) {
      groupMap[group].push(val);
    } else {
      missingCounts[group] = (missingCounts[group] || 0) + 1;
    }
  });

  const groupNames = Object.keys(groupMap);
  const groupsWithData = groupNames.filter(name => (groupMap[name] || []).length > 0);
  const activeGroupMap = Object.fromEntries(groupsWithData.map(name => [name, groupMap[name]]));
  const nGroups = groupsWithData.length;
  const alpha = options?.alpha ?? 0.05;
  const adjustKruskal = options?.adjust_kruskal ?? 'bonferroni';
  const lang = normalizeLanguage(options?.lang);
  const groupLabel = translate('table.columns.group', lang);
  const pValueLabel = translate('table.columns.pValue', lang);

  // 1) Descriptives by group
  const summaryRows = ns.getNumericalSummaryByGroup(groupMap, { ...options, lang, missing_counts: missingCounts }, formatFn);

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
      // Note: ANOVA path is currently disabled; prefer Kruskal–Wallis in this flow
      const result = stats.kruskalTest(...groups);
      p_value = result.pValue;
      method = translate('tests.kruskalWallis', lang);
      if (getJStat().utils.isNumber(p_value) && p_value < alpha) {
        posthoc = ns.runDunnTest(activeGroupMap, alpha, adjustKruskal).filter(v => v.significant);
        flagsUsed?.add?.('has_dunn');
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
    p_value: +(p_value?.toFixed?.(4) ?? null),
    posthoc
  };
};

export default ns;
