// @ts-check
import factors from './factors.js';
import { normalizeLanguage, translate } from '../i18n/index.js';

const DEFAULT_LIST_SEP = ';';
const MAX_WARNINGS = 10;

const pushWarning = (meta, key, vars = {}) => {
  meta.warnings.push(translate(key, meta.lang, vars));
};

const formatExtraSuffix = (meta, remaining) => (remaining > 0 ? translate('variants.warnings.moreSuffix', meta.lang, { count: remaining }) : '');

const ns = {};

/**
 * @typedef {import('./factors.js').ColValues} ColValues
 */
/**
 * @typedef {Object} VariantMeta
 * @property {string} kind
 * @property {number|null} source_var_index
 * @property {'q'|'n'|'l'} source_type
 * @property {Array<Record<string, any>>} actions
 * @property {string[]} warnings
 * @property {Array<[number, number]>} [breaks]
 * @property {string[]} [labels]
 * @property {string} [note]
 * @property {string} lang
 */
/**
 * @typedef {Object} ColumnVariant
 * @property {string} var_label
 * @property {'q'|'n'|'l'} col_type
 * @property {string} col_sep
 * @property {ColValues} col_values
 * @property {VariantMeta} meta
 */
/**
 * @typedef {Object} ColumnLike
 * @property {'q'|'n'|'l'} col_type
 * @property {string} [col_sep]
 * @property {ColValues} col_values
 * @property {ColumnVariant[]} [col_vars]
 */
/**
 * @typedef {Object} ReplaceSpec
 * @property {string} [search]
 * @property {string} [from]
 * @property {string} [value]
 * @property {string} [level]
 * @property {string} [replace]
 * @property {string} [to]
 * @property {string} [label]
 */
/**
 * @typedef {Object} MergeSpec
 * @property {string} [label]
 * @property {string} [target]
 * @property {string} [name]
 * @property {string[]} [levels]
 * @property {string[]} [values]
 */
/**
 * @typedef {Object} ListContext
 * @property {boolean} isList
 * @property {string} sep
 * @property {VariantMeta} meta
 */
/**
 * @typedef {Object} TransformConfig
 * @property {'log'|'log10'|'log2'|'sqrt'|'square'} fn
 * @property {number} [base]
 */
/**
 * @typedef {Object} CutConfig
 * @property {number[]} [breaks]
 * @property {number} [width]
 * @property {number} [origin]
 * @property {boolean} [right]
 * @property {boolean} [includeLowest]
 * @property {string[]} [labels]
 */
/**
 * @typedef {Object} VariantConfig
 * @property {number} [sourceVarIndex]
 * @property {string} [kind]
 * @property {string} [var_label]
 * @property {string} [label]
 * @property {string|number|null} [fillEmpty]
 * @property {ReplaceSpec[]} [replacements]
 * @property {ReplaceSpec[]} [searchReplace]
 * @property {MergeSpec[]} [merges]
 * @property {string[]} [subsetLevels]
 * @property {Record<string, any>} [forceNumeric]
 * @property {TransformConfig} [transform]
 * @property {CutConfig} [cut]
 * @property {'q'|'n'|'l'} [col_type]
 * @property {string} [col_sep]
 * @property {boolean} [sortByFrequency]
 * @property {string} [note]
 * @property {string} [lang]
*/
/**
 * @typedef {Object} VariantTemplate
 * @property {string} id
 * @property {string} label
 * @property {string[]} options
 */


/**
 * Deeply clone a column value object to avoid mutating cached encodings.
 * @param {ColValues|null|undefined} colValues
 * @returns {ColValues|null|undefined}
 */
const cloneColValues = (colValues) => (colValues ? JSON.parse(JSON.stringify(colValues)) : colValues);

/**
 * Convert any value to a string, using an empty string for nullish inputs.
 * @param {any} value
 * @returns {string}
 */
const toStringSafe = (value) => {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
};

/**
 * Produce a compact textual representation for numeric interval bounds.
 * @param {number} num
 * @returns {string}
 */
const formatBound = (num) => {
  if (!Number.isFinite(num)) return num.toString();
  let str = num.toFixed(6);
  str = str.replace(/\.?0+$/, '');
  return str;
};

/**
 * Normalise numeric-like text so it can be safely parsed with Number.parseFloat.
 * Handles comma/point separators and extraneous symbols.
 * @param {string} value
 * @returns {string}
 */
const sanitizeNumericString = (value) => {
  let normalized = value.trim();
  if (normalized === '') return '';
  const commaCount = (normalized.match(/,/g) || []).length;
  const dotCount = (normalized.match(/\./g) || []).length;
  if (commaCount === 1 && dotCount >= 1 && normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
    normalized = normalized.replace(/\./g, '');
    normalized = normalized.replace(',', '.');
  } else if (commaCount > 1 && dotCount === 0) {
    normalized = normalized.replace(/,/g, '');
  } else {
    normalized = normalized.replace(/,/g, '.');
  }
  normalized = normalized.replace(/[^0-9.+-]/g, '');
  const signMatch = normalized.match(/^[+-]/);
  const sign = signMatch ? signMatch[0] : '';
  normalized = normalized.replace(/[+-]/g, '');
  normalized = sign + normalized;
  const parts = normalized.split('.');
  if (parts.length > 2) {
    const head = parts.shift();
    normalized = `${head}.${parts.join('')}`;
  }
  return normalized;
};

/**
 * Apply search-and-replace rules to discrete values, including list-style entries.
 * @param {string[]} values
 * @param {ReplaceSpec[]} replacements
 * @param {ListContext} ctx
 * @returns {string[]}
 */
const applySearchReplace = (values, replacements, ctx) => {
  if (!Array.isArray(replacements) || replacements.length === 0) return values;
  const { isList, sep, meta } = ctx;
  const map = new Map();
  replacements.forEach((item) => {
    if (!item) return;
    const search = toStringSafe(item.search ?? item.from ?? item.value ?? item.level ?? '').trim();
    if (!search) return;
    const replacement = toStringSafe(item.replace ?? item.to ?? item.label ?? '');
    map.set(search, replacement);
  });
  if (map.size === 0) return values;
  meta.actions.push({ type: 'search_replace', count: map.size });
  const log = [];
  const updated = values.map((value) => {
    const text = toStringSafe(value);
    if (!text) return text;
    if (isList) {
      const items = text.split(sep).map((x) => x.trim()).filter(Boolean);
      const newItems = items
        .map((item) => {
          if (!map.has(item)) return item;
          const replacement = map.get(item);
          if (log.length < MAX_WARNINGS && item !== replacement) log.push(`${item}->${replacement || '[empty]'}`);
          return replacement;
        })
        .filter(Boolean);
      return newItems.join(sep);
    }
    const trimmed = text.trim();
    if (!map.has(trimmed)) return text;
    const replacement = map.get(trimmed);
    if (log.length < MAX_WARNINGS && trimmed !== replacement) log.push(`${trimmed}->${replacement || '[empty]'}`);
    return replacement;
  });
  if (log.length) pushWarning(meta, 'variants.warnings.searchReplace', { details: log.join(', ') });
  return updated;
};

/**
 * Merge several discrete levels into named groups.
 * @param {string[]} values
 * @param {MergeSpec[]} merges
 * @param {ListContext} ctx
 * @returns {string[]}
 */
const applyMerge = (values, merges, ctx) => {
  if (!Array.isArray(merges) || merges.length === 0) return values;
  const { isList, sep, meta } = ctx;
  const map = new Map();
  merges.forEach((group) => {
    if (!group) return;
    const target = toStringSafe(group.label ?? group.target ?? group.name ?? '').trim();
    if (!target) return;
    const levels = Array.isArray(group.levels)
      ? group.levels
      : Array.isArray(group.values)
        ? group.values
        : [];
    levels.forEach((level) => {
      const key = toStringSafe(level).trim();
      if (!key) return;
      map.set(key, target);
    });
  });
  if (map.size === 0) return values;
  meta.actions.push({ type: 'merge_levels', groups: map.size });
  const updated = values.map((value) => {
    const text = toStringSafe(value);
    if (!text) return text;
    if (isList) {
      const items = text.split(sep).map((x) => x.trim()).filter(Boolean);
      const merged = items.map((item) => map.get(item) ?? item);
      const unique = [...new Set(merged.filter(Boolean))];
      return unique.join(sep);
    }
    const trimmed = text.trim();
    return map.get(trimmed) ?? text;
  });
  return updated;
};

/**
 * Fill empty or missing entries with a provided fallback value.
 * @param {string[]} values
 * @param {string|number|null|undefined} fillValue
 * @param {VariantMeta} meta
 * @returns {string[]}
 */
const applyFill = (values, fillValue, meta) => {
  if (fillValue === null || fillValue === undefined) return values;
  const fill = toStringSafe(fillValue);
  meta.actions.push({ type: 'fill_missing', value: fill });
  return values.map((value) => {
    const text = toStringSafe(value);
    return text.trim() === '' ? fill : text;
  });
};

/**
 * Keep only values listed in the subset, clearing the rest.
 * @param {string[]} values
 * @param {string[]} subset
 * @param {ListContext} ctx
 * @returns {string[]}
 */
const applySubset = (values, subset, ctx) => {
  if (!Array.isArray(subset) || subset.length === 0) return values;
  const { isList, sep, meta } = ctx;
  const allowed = new Set(subset.map((v) => toStringSafe(v).trim()).filter(Boolean));
  if (allowed.size === 0) return values;
  meta.actions.push({ type: 'subset_levels', count: allowed.size });
  return values.map((value) => {
    const text = toStringSafe(value);
    if (!text) return '';
    if (isList) {
      const filtered = text.split(sep).map((x) => x.trim()).filter((item) => allowed.has(item));
      return filtered.length ? filtered.join(sep) : '';
    }
    return allowed.has(text.trim()) ? text : '';
  });
};

/**
 * Attempt to coerce textual data into numeric strings, tracking edits and drops.
 * @param {string[]} values
 * @param {Record<string, any>} options
 * @param {VariantMeta} meta
 * @returns {string[]}
 */
const coerceToNumeric = (values, options, meta) => {
  const replacements = [];
  let totalReplacements = 0;
  const dropped = [];
  let totalDropped = 0;
  const coerced = values.map((value, index) => {
    const original = toStringSafe(value);
    if (!original.trim()) return '';
    const normalized = sanitizeNumericString(original);
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) {
      totalDropped += 1;
      if (dropped.length < MAX_WARNINGS) dropped.push(index + 1);
      return '';
    }
    if (normalized !== original.trim()) {
      totalReplacements += 1;
      if (replacements.length < MAX_WARNINGS) replacements.push(`"${original}"->${parsed}`);
    }
    return parsed.toString();
  });
  meta.actions.push({ type: 'coerce_numeric' });
  if (totalReplacements) {
    const extra = totalReplacements > replacements.length ? formatExtraSuffix(meta, totalReplacements - replacements.length) : '';
    pushWarning(meta, 'variants.warnings.numericCoercionReplacements', { details: replacements.join(', '), extra });
  }
  if (totalDropped) {
    const listed = dropped.join(', ');
    const extra = totalDropped > dropped.length ? formatExtraSuffix(meta, totalDropped - dropped.length) : '';
    pushWarning(meta, 'variants.warnings.numericCoercionRemovedRows', { details: listed, extra });
  }
  return coerced;
};

/**
 * Apply a numeric transformation (log, sqrt, etc.) to parsed values.
 * @param {string[]} values
 * @param {TransformConfig} options
 * @param {VariantMeta} meta
 * @returns {string[]}
 */
const transformNumeric = (values, options, meta) => {
  if (!options || !options.fn) return values;
  const fn = options.fn;
  const baseValue = Number.isFinite(Number(options.base)) ? Number(options.base) : Math.E;
  if (fn === 'log' && (baseValue <= 0 || baseValue === 1)) throw new Error('Log base must be greater than 0 and not equal to 1.');
  const skipped = [];
  let totalSkipped = 0;
  const transformed = values.map((value, index) => {
    const numeric = Number.parseFloat(toStringSafe(value));
    if (!Number.isFinite(numeric)) return '';
    let result;
    switch (fn) {
      case 'log':
        if (numeric <= 0) { totalSkipped += 1; if (skipped.length < MAX_WARNINGS) skipped.push(index + 1); return ''; }
        result = Math.log(numeric) / Math.log(baseValue);
        break;
      case 'log10':
        if (numeric <= 0) { totalSkipped += 1; if (skipped.length < MAX_WARNINGS) skipped.push(index + 1); return ''; }
        result = Math.log10(numeric);
        break;
      case 'log2':
        if (numeric <= 0) { totalSkipped += 1; if (skipped.length < MAX_WARNINGS) skipped.push(index + 1); return ''; }
        result = Math.log2(numeric);
        break;
      case 'sqrt':
        if (numeric < 0) { totalSkipped += 1; if (skipped.length < MAX_WARNINGS) skipped.push(index + 1); return ''; }
        result = Math.sqrt(numeric);
        break;
      case 'square':
        result = numeric * numeric;
        break;
      default:
        throw new Error(`Unsupported transform fn: ${fn}`);
    }
    return Number.isFinite(result) ? result.toString() : '';
  });
  meta.actions.push({ type: 'transform', fn });
  if (totalSkipped) {
    const listed = skipped.join(', ');
    const extra = totalSkipped > skipped.length ? formatExtraSuffix(meta, totalSkipped - skipped.length) : '';
    pushWarning(meta, 'variants.warnings.transformSkipped', { fn, details: listed, extra });
  }
  return transformed;
};

/**
 * Generate cut points for equal-width intervals that cover the observed range.
 * @param {number} minVal
 * @param {number} maxVal
 * @param {number} width
 * @param {number} [origin]
 * @returns {number[]}
 */
const buildBreaksFromWidth = (minVal, maxVal, width, origin) => {
  let start = Number.isFinite(origin) ? origin : minVal;
  while (start > minVal) start -= width;
  while (start + width <= minVal) start += width;
  const breaks = [];
  for (let val = start; val <= maxVal; val += width) {
    breaks.push(val);
  }
  if (breaks[0] > minVal) breaks.unshift(minVal);
  if (breaks[breaks.length - 1] < maxVal) breaks.push(breaks[breaks.length - 1] + width);
  return Array.from(new Set(breaks)).sort((a, b) => a - b);
};

/**
 * Render an interval label using inclusive/exclusive brackets.
 * @param {number} lower
 * @param {number} upper
 * @param {boolean} right
 * @param {boolean} includeLowest
 * @param {number} idx
 * @param {number} total
 * @returns {string}
 */
const formatInterval = (lower, upper, right, includeLowest, idx, total) => {
  const leftBracket = right ? (idx === 0 && includeLowest ? '[' : '(') : '[';
  const rightBracket = right ? ']' : (idx === total - 1 && includeLowest ? ']' : ')');
  return `${leftBracket}${formatBound(lower)}, ${formatBound(upper)}${rightBracket}`;
};

/**
 * Check whether a value belongs to a given interval definition.
 * @param {number} value
 * @param {number} lower
 * @param {number} upper
 * @param {number} idx
 * @param {number} total
 * @param {boolean} right
 * @param {boolean} includeLowest
 * @returns {boolean}
 */
const inInterval = (value, lower, upper, idx, total, right, includeLowest) => {
  if (right) {
    const lowerOk = idx === 0 && includeLowest ? value >= lower : value > lower;
    const upperOk = value <= upper;
    return lowerOk && upperOk;
  }
  const upperIsLast = idx === total - 1;
  const upperOk = upperIsLast && includeLowest ? value <= upper : value < upper;
  return value >= lower && upperOk;
};

/**
 * Bin numeric values into labelled intervals.
 * @param {string[]} values
 * @param {CutConfig|undefined} options
 * @param {VariantMeta} meta
 * @returns {{values:string[], breaks:Array<[number, number]>, labels:string[]}}
 */
const cutNumeric = (values, options, meta) => {
  const numericValues = values.map((value) => Number.parseFloat(toStringSafe(value)));
  const observed = numericValues.filter((num) => Number.isFinite(num));
  if (!observed.length) {
    pushWarning(meta, 'variants.warnings.cutNoNumeric');
    return { values: values.map(() => ''), breaks: [], labels: [] };
  }
  let breaks = Array.isArray(options?.breaks)
    ? options.breaks.map(Number).filter((num) => Number.isFinite(num))
    : [];
  if (breaks.length) {
    breaks = Array.from(new Set(breaks)).sort((a, b) => a - b);
  }
  if (!breaks.length && Number.isFinite(Number(options?.width))) {
    const width = Number(options.width);
    if (width <= 0) throw new Error('Cut width must be positive.');
    const minVal = Math.min(...observed);
    const maxVal = Math.max(...observed);
    const originValue = Number.isFinite(Number(options?.origin)) ? Number(options.origin) : undefined;
    breaks = buildBreaksFromWidth(minVal, maxVal, width, originValue);
  }
  if (breaks.length < 2) {
    const minVal = Math.min(...observed);
    const maxVal = Math.max(...observed);
    breaks = minVal === maxVal ? [minVal, minVal] : [minVal, maxVal];
  }
  breaks = Array.from(new Set(breaks)).sort((a, b) => a - b);
  if (breaks.length < 2) breaks = [breaks[0], breaks[0]];
  const right = options?.right !== undefined ? !!options.right : true;
  const includeLowest = options?.includeLowest !== undefined ? !!options.includeLowest : true;
  const labelsInput = Array.isArray(options?.labels) ? options.labels : null;
  const intervalCount = breaks.length - 1;
  const intervals = [];
  for (let i = 0; i < intervalCount; i++) {
    const lower = breaks[i];
    const upper = breaks[i + 1];
    if (!(upper > lower)) continue;
    const label = labelsInput?.[i] ?? formatInterval(lower, upper, right, includeLowest, i, intervalCount);
    intervals.push({ lower, upper, label });
  }
  if (!intervals.length) {
    pushWarning(meta, 'variants.warnings.cutInvalidIntervals');
    return { values: values.map(() => ''), breaks, labels: [] };
  }
  const assigned = numericValues.map((num) => {
    if (!Number.isFinite(num)) return '';
    const interval = intervals.find((range, idx) => inInterval(num, range.lower, range.upper, idx, intervals.length, right, includeLowest));
    return interval ? interval.label : '';
  });
  const outside = assigned.reduce((count, label, idx) => {
    if (label) return count;
    const num = numericValues[idx];
    return Number.isFinite(num) ? count + 1 : count;
  }, 0);
  if (outside) pushWarning(meta, 'variants.warnings.cutOutsideValues', { count: outside });
  meta.actions.push({ type: 'cut', breaks: intervals.map((range) => [range.lower, range.upper]) });
  return {
    values: assigned,
    breaks: intervals.map((range) => [range.lower, range.upper]),
    labels: intervals.map((range) => range.label)
  };
};

/**
 * Reorder factor labels by observed frequency, updating codes accordingly.
 * @param {ColValues} processed
 * @param {string[]} values
 * @param {'q'|'n'|'l'} colType
 * @param {string} colSep
 * @param {VariantMeta} meta
 * @returns {ColValues}
 */
const sortByFrequency = (processed, values, colType, colSep, meta) => {
  if (!processed?.col_compact || !Array.isArray(processed.labels)) return processed;
  if (colType !== 'q' && colType !== 'l') return processed;
  const counts = new Map();
  if (colType === 'l') {
    values.forEach((value) => {
      const text = toStringSafe(value);
      if (!text) return;
      text.split(colSep).map((x) => x.trim()).filter(Boolean).forEach((item) => {
        counts.set(item, (counts.get(item) || 0) + 1);
      });
    });
  } else {
    values.forEach((value) => {
      const key = toStringSafe(value).trim();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  }
  const originalLabels = processed.labels;
  const sortedLabels = [...originalLabels].sort((a, b) => {
    const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
  const changed = sortedLabels.some((label, idx) => label !== originalLabels[idx]);
  if (!changed) return processed;
  meta.actions.push({ type: 'sort_by_frequency' });
  const indexMap = new Map(sortedLabels.map((label, idx) => [label, idx + 1]));
  const updated = { ...processed, labels: sortedLabels };
  if (colType === 'l') {
    const oldLabels = originalLabels;
    updated.codes = (processed.codes || []).map((codeStr) => {
      if (!codeStr) return codeStr;
      const tokens = codeStr.split(colSep).map((token) => token.trim()).filter(Boolean);
      const remapped = tokens
        .map((token) => {
          const originalLabel = oldLabels[parseInt(token, 10) - 1];
          const newIndex = indexMap.get(originalLabel);
          return newIndex ? String(newIndex) : '';
        })
        .filter(Boolean);
      return remapped.join(colSep);
    });
  } else {
    const oldLabels = originalLabels;
    updated.codes = (processed.codes || []).map((code) => {
      if (!code) return 0;
      const originalLabel = oldLabels[code - 1];
      const newIndex = indexMap.get(originalLabel);
      return newIndex ?? 0;
    });
  }
  return updated;
};

/**
 * Create a column variant by applying the requested transformation pipeline.
 * @param {ColumnLike} baseCol
 * @param {VariantConfig} [config]
 * @returns {ColumnVariant}
 */
ns.createVariant = function (baseCol, config = {}) {
  if (!baseCol) throw new Error('Base column is required to create a variant.');
  const variantIndex = Number.isInteger(config.sourceVarIndex) ? config.sourceVarIndex : null;
  const sourceVariant = variantIndex !== null && Array.isArray(baseCol.col_vars) ? baseCol.col_vars[variantIndex] : null;
  const sourceType = sourceVariant?.col_type ?? baseCol.col_type ?? 'q';
  const sourceSep = sourceVariant?.col_sep ?? baseCol.col_sep ?? (sourceType === 'l' ? DEFAULT_LIST_SEP : '');
  const sourceValues = sourceVariant?.col_values ?? baseCol.col_values;
  const decoded = factors.decodeColValues(sourceValues, sourceType, sourceSep) || [];
  let workingValues = decoded.map(toStringSafe);
  let currentType = sourceType;
  let currentSep = sourceSep;
  const lang = normalizeLanguage(config.lang);
  const meta = {
    kind: config.kind ?? 'custom',
    source_var_index: variantIndex,
    source_type: sourceType,
    actions: [],
    warnings: [],
    lang
  };
  const getListContext = () => ({ isList: currentType === 'l', sep: currentSep || sourceSep || DEFAULT_LIST_SEP, meta });
  if (config.fillEmpty !== undefined) {
    workingValues = applyFill(workingValues, config.fillEmpty, meta);
  }
  if (config.replacements || config.searchReplace) {
    workingValues = applySearchReplace(workingValues, config.replacements ?? config.searchReplace, getListContext());
  }
  if (config.merges) {
    workingValues = applyMerge(workingValues, config.merges, getListContext());
  }
  if (config.subsetLevels) {
    workingValues = applySubset(workingValues, config.subsetLevels, getListContext());
  }
  if (config.forceNumeric) {
    workingValues = coerceToNumeric(workingValues, config.forceNumeric, meta);
    currentType = 'n';
    currentSep = '';
  }
  if (config.transform) {
    workingValues = transformNumeric(workingValues, config.transform, meta);
    currentType = 'n';
    currentSep = '';
  }
  let cutInfo = null;
  if (config.cut) {
    cutInfo = cutNumeric(workingValues, config.cut, meta);
    workingValues = cutInfo.values;
    currentType = 'q';
    currentSep = '';
  }
  if (config.col_type) currentType = config.col_type;
  if (config.col_sep !== undefined) currentSep = config.col_sep;
  if (currentType === 'l' && !currentSep) currentSep = sourceSep || DEFAULT_LIST_SEP;
  if (currentType !== 'l') currentSep = currentSep || '';
  const processed = factors.encodeColValues(workingValues, currentType, currentSep);
  const finalValues = config.sortByFrequency
    ? sortByFrequency(processed, workingValues, currentType, currentSep, meta)
    : processed;
  if (cutInfo?.breaks) {
    meta.breaks = cutInfo.breaks;
    meta.labels = cutInfo.labels;
  }
  if (config.note) meta.note = config.note;
  const defaultLabel = config.kind ? `${config.kind} variant` : 'Variant';
  return {
    var_label: config.var_label || config.label || defaultLabel,
    col_type: currentType,
    col_sep: currentSep,
    col_values: cloneColValues(finalValues),
    meta
  };
};

/**
 * Variant templates grouped by base column type for UI presets.
 * @type {Record<'q'|'n'|'l', VariantTemplate[]>}
 */
ns.VARIANT_TEMPLATES = {
  q: [
    { id: 'search_replace', label: 'Search & replace levels', options: ['replacements'] },
    { id: 'merge_levels', label: 'Merge levels', options: ['merges'] },
    { id: 'subset', label: 'Keep subset', options: ['subsetLevels'] },
    { id: 'fill_missing', label: 'Fill empty cells', options: ['fillEmpty'] },
    { id: 'sort_frequency', label: 'Sort by frequency', options: ['sortByFrequency'] }
  ],
  n: [
    { id: 'coerce_numeric', label: 'Force numeric', options: ['forceNumeric'] },
    { id: 'cut_intervals', label: 'Cut into intervals', options: ['cut'] },
    { id: 'transform', label: 'Apply transform', options: ['transform'] }
  ],
  l: [
    { id: 'search_replace', label: 'Search & replace values', options: ['replacements'] },
    { id: 'merge_levels', label: 'Merge values', options: ['merges'] },
    { id: 'subset', label: 'Keep subset', options: ['subsetLevels'] },
    { id: 'fill_missing', label: 'Fill empty cells', options: ['fillEmpty'] },
    { id: 'sort_frequency', label: 'Sort by frequency', options: ['sortByFrequency'] }
  ]
};

ns.cloneColValues = cloneColValues;
ns.sanitizeNumericString = sanitizeNumericString;

export default ns;

