// @ts-check
import { getJStat, getSS, getStatsLib, formatNumberLocale } from './_env.js';

const ns = {};

/**
 * Descriptive summary for numeric vector.
 * @param {Array<string|number>} values
 */
ns.summarize_n = function (values, formatFn = null, options = {}) {
  const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
  const n = nums.length; if (n === 0) return { columns: [], rows: [], summary: { n: 0 } };
  const valuesByGroup = { Total: nums };
  const rows = ns.getNumericalSummaryByGroup(valuesByGroup, options, formatFn);
  return { columns: ['Variável', 'Descrição'], rows: rows.map(r => ({ Variável: r.Grupo, Descrição: r.Total })), summary: { n } };
};

/**
 * Compute per-group descriptive statistics for numeric values.
 */
ns.getNumericalSummaryByGroup = function (valuesByGroup, options, formatFn = null) {
  const ss = getSS();
  const groupNames = Object.keys(valuesByGroup);
  const summaryRows = [];
  const statOptions = options?.stat_options ?? ['mean_sd'];
  const lang = options?.lang ?? 'pt_br';
  const statLabels = { min: 'Mínimo', max: 'Máximo', range: 'Amplitude', mean_sd: 'Média (DP)', median_iqr: 'Mediana (IQR)', mode: 'Moda', n: 'n' };
  const defaultMissing = '–';
  const formatDefault = (val) => formatNumberLocale(val, 1, lang);
  const getStats = (vals) => {
    const sorted = [...vals].sort((a, b) => a - b); const n = vals.length; if (n === 0) return null;
    const mean = n > 0 ? (vals.reduce((a, b) => a + b, 0) / n) : NaN;
    const sd = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n) : NaN;
    const median = ss?.medianSorted ? ss.medianSorted(sorted) : NaN;
    const q1 = ss?.quantileSorted ? ss.quantileSorted(sorted, 0.25) : NaN;
    const q3 = ss?.quantileSorted ? ss.quantileSorted(sorted, 0.75) : NaN;
    const iqr = (q3 ?? NaN) - (q1 ?? NaN);
    const mode = (() => { try { return ss?.modeSorted ? ss.modeSorted(sorted) : null; } catch { return null; } })();
    const min = sorted[0]; const max = sorted[n - 1];
    return { n, mean, sd, median, q1, q3, iqr, mode, min, max };
  };
  for (const stat of statOptions) {
    const row = { Grupo: statLabels[stat] || stat };
    groupNames.forEach(group => {
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
      } catch (e) { cell = defaultMissing; }
      row[group] = cell;
    });
    summaryRows.push(row);
  }
  return summaryRows;
};

/** Mann–Whitney U test (two-sided). */
ns.computeMannWhitney = function (x, y, correct = false) {
  try {
    if (!x?.length || !y?.length) { return { pValue: null, statistic: null, method: 'Mann-Whitney' }; }
    const jStat = getJStat();
    const nx = x.length; const ny = y.length;
    const combined = [...x.map(val => ({ val, group: 'x' })), ...y.map(val => ({ val, group: 'y' }))];
    combined.sort((a, b) => a.val - b.val);
    let ranks = new Array(combined.length); let i = 0;
    while (i < combined.length) { let j = i; while (j + 1 < combined.length && combined[j + 1].val === combined[i].val) j++; const avgRank = (i + j + 2) / 2; for (let k = i; k <= j; k++) ranks[k] = avgRank; i = j + 1; }
    const Rx = combined.reduce((sum, item, idx) => item.group === 'x' ? sum + ranks[idx] : sum, 0);
    const U = Rx - (nx * (nx + 1)) / 2;
    const mu = (nx * ny) / 2; const sigma = Math.sqrt((nx * ny * (nx + ny + 1)) / 12);
    let z = (U - mu) / sigma; if (correct) { z = (Math.abs(U - mu) - 0.5) / sigma; }
    const pValue = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
    return { pValue, statistic: U, method: 'Mann-Whitney' };
  } catch { return { pValue: null, statistic: null, method: 'Mann-Whitney' }; }
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
  const lang = options?.lang ?? 'pt_br'; const yes_label = options?.yes_label ?? 'Sim'; const no_label = options?.no_label ?? 'Não'; const min_count = options?.binary_min_count ?? 1;
  const defaultLabels = { pt_br: { yes: 'Sim', no: 'Não' }, en_us: { yes: 'Yes', no: 'No' }, es_es: { yes: 'Sí', no: 'No' } };
  const labels = { yes: yes_label ?? (defaultLabels[lang]?.yes || 'Sim'), no: no_label ?? (defaultLabels[lang]?.no || 'Não') };
  const n = values.length; const result = {}; const countMap = {}; const allItems = [];
  values.forEach(val => { const trimmed = (val || '').trim(); if (!trimmed) { allItems.push(null); return; } const items = trimmed.split(sep).map(x => x.trim()).filter(Boolean); const itemSet = new Set(items); allItems.push(itemSet); items.forEach(item => { countMap[item] = (countMap[item] || 0) + 1; }); });
  const orderedKeys = Object.entries(countMap).filter(([_, count]) => count >= min_count).sort((a, b) => b[1] - a[1]).map(([key]) => key);
  orderedKeys.forEach(item => { result[item] = new Array(n); for (let i = 0; i < n; i++) { const entry = allItems[i]; if (entry === null) result[item][i] = ''; else result[item][i] = entry.has(item) ? labels.yes : labels.no; } });
  return result;
};

export default ns;
