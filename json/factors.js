// @ts-check
import { trimPunctuation } from './_env.js';
import { changeCase } from '../string_utils.js';
import { translate } from '../i18n/index.js';

/**
 * @typedef {{col_compact:boolean, labels:string[]|null, codes:(number[]|string[])|null, raw_values:string[]|null}} ColValues
 */
const ns = {};

/**
 * Score a separator candidate against a sample of values.
 * Returns a positive score if the separator is a plausible list separator, -Infinity otherwise.
 * @param {string[]} sample Non-empty filtered values
 * @param {string} sep Separator to evaluate
 * @param {string[]} otherSeps Other candidates (used to measure contamination)
 * @returns {number}
 */
function scoreSep(sample, sep, otherSeps) {
  const rowsWithSep = sample.filter(v => v.includes(sep));
  const prevalence = rowsWithSep.length / sample.length;
  if (prevalence < 0.4) return -Infinity;

  const multiItemRows = sample.filter(v => v.split(sep).filter(s => s.trim()).length > 1);
  const multiItemFraction = multiItemRows.length / sample.length;
  if (multiItemFraction < 0.3) return -Infinity;

  // Contamination: a true separator produces atomic items that don't contain the other sep
  const allItems = sample.flatMap(v => v.split(sep).map(s => s.trim()).filter(Boolean));
  const contamination = allItems.length > 0
    ? allItems.filter(item => otherSeps.some(o => item.includes(o))).length / allItems.length
    : 0;

  return prevalence * multiItemFraction * (1 - contamination);
}

/**
 * Infer the list separator from raw values. Returns '' if no list separator is detected.
 * Uses raw (non-unique) values so that row-level frequency information is preserved.
 * @param {string[]} values
 * @returns {string}
 */
ns.inferColSep = function (values) {
  const sample = values.filter(Boolean).slice(0, 50).map(String);
  if (sample.length === 0) return '';
  const sepCandidates = [';', ','];
  let bestSep = null;
  let bestScore = -Infinity;
  for (const sep of sepCandidates) {
    const others = sepCandidates.filter(s => s !== sep);
    const score = scoreSep(sample, sep, others);
    if (score > bestScore) { bestScore = score; bestSep = sep; }
  }
  return bestScore >= 0.25 ? bestSep : '';
};

/**
 * Infer column type and list separator from raw values.
 * Order: numeric → list → qualitative.
 * Numeric is checked first to avoid confusing decimal commas (e.g. "3,14") with list separators.
 * @param {string[]} values
 * @returns {{col_type:'q'|'n'|'l', col_sep:string}}
 */
ns.inferColType = function (values) {
  const sample = values.filter(Boolean).slice(0, 50);
  if (sample.length === 0) return { col_type: 'q', col_sep: '' };
  const numeric = sample.every(v => /^-?\d+(\.\d+)?$/.test(v.replace(',', '.')));
  if (numeric) return { col_type: 'n', col_sep: '' };
  const bestSep = ns.inferColSep(values);
  if (bestSep) return { col_type: 'l', col_sep: bestSep };
  return { col_type: 'q', col_sep: '' };
};

/**
 * Decide whether a column benefits from factor compaction.
 * @param {string[]} values
 * @param {'q'|'n'|'l'=} col_type
 * @param {string=} col_sep
 */
ns.shouldCompact = function (values, col_type = null, col_sep = ';') {
  if (!Array.isArray(values)) return false;
  if (col_type === 'q') return true;
  const flattened = (col_type === 'l') ? values.flatMap(v => (v || '').split(col_sep)) : values;
  const unique = new Set(flattened.map(v => (v == null ? '' : String(v)).trim()).filter(Boolean));
  return unique.size > 1 && unique.size < flattened.length / 1.5;
};

/**
 * Factor-encode values (labels + codes), including list columns.
 * For 'q' columns, labels are sorted alphabetically (R-style factor default).
 * For 'l' columns, labels follow first-appearance order (frequency-driven UX).
 * @param {string[]} values
 * @param {'q'|'n'|'l'=} col_type
 * @param {string=} col_sep
 * @returns {ColValues}
 */
ns.encodeAsFactor = function (values, col_type = null, col_sep = ';') {
  if (!Array.isArray(values)) return { col_compact: false, labels: null, codes: null, raw_values: values };
  if (col_type === 'l') {
    const allItems = values.flatMap(v => (v || '').split(col_sep).map(s => s.trim()).filter(Boolean));
    const labels = [...new Set(allItems)];
    const codes = values.map(val => {
      const items = (val || '').split(col_sep).map(s => s.trim()).filter(Boolean);
      return items.map(i => labels.indexOf(i) + 1).join(col_sep);
    });
    return { col_compact: true, labels, codes, raw_values: null };
  }
  const labels = [...new Set(values.map(v => v?.trim?.()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const codes = values.map(v => { const idx = labels.indexOf(v?.trim?.()); return idx >= 0 ? idx + 1 : 0; });
  return { col_compact: true, labels, codes, raw_values: null };
};

/**
 * Decode factor-encoded values back to raw strings.
 * @param {ColValues} col_values
 * @param {'q'|'n'|'l'=} col_type
 * @param {string=} col_sep
 * @returns {string[]}
 */
ns.decodeColValues = function (col_values, col_type = null, col_sep = ';') {
  if (!col_values || !col_values.col_compact) return col_values?.raw_values || [];
  const { codes, labels } = col_values;
  if (!Array.isArray(codes)) return [];
  if (col_type === 'l') {
    return codes.map(codeStr => String(codeStr).split(col_sep).map(c => labels[parseInt(c, 10) - 1]).filter(Boolean).join(col_sep));
  }
  return codes.map(c => c === 0 ? null : labels[c - 1]);
};

/**
 * Decode a column (or variant) into raw string values.
 * @param {{col_values?: ColValues, col_type?: 'q'|'n'|'l', col_sep?: string, raw_values?: string[]}} column
 * @returns {string[]}
 */
ns.decodeColumn = function (column) {
  if (!column || typeof column !== 'object') return [];
  if (Array.isArray(column.raw_values)) return column.raw_values.slice();
  const col_type = column.col_type ?? 'q';
  let col_sep = column.col_sep;
  if (!col_sep) col_sep = col_type === 'l' ? ';' : '';
  return ns.decodeColValues(column.col_values, col_type, col_sep);
};

/**
 * Encode if needed, otherwise return raw_values shape.
 * @param {string[]} values
 * @param {'q'|'n'|'l'=} col_type
 * @param {string=} col_sep
 * @returns {ColValues}
 */
ns.encodeColValues = function (values, col_type = 'q', col_sep = ';') {
  const should = ns.shouldCompact(values, col_type, col_sep);
  if (should) return ns.encodeAsFactor(values, col_type, col_sep);
  return { col_compact: false, labels: null, codes: null, raw_values: values };
};
/**
 * Deep clone a ColValues payload while avoiding structuredClone for Node 16 compatibility.
 * @param {ColValues|null|undefined} colValues
 * @returns {ColValues|null|undefined}
 */
const cloneColValues = (colValues) => (colValues ? JSON.parse(JSON.stringify(colValues)) : colValues);

/**
 * Build a column description from raw values with optional metadata overrides.
 * @param {string[]} values
 * @param {Object} [options]
 * @param {'q'|'n'|'l'} [options.col_type] Explicit column type.
 * @param {string} [options.col_sep] Explicit column separator.
 * @param {string} [options.var_label] Label for the base variant.
 * @param {Record<string, any>} [options.baseVariantMeta] Extra metadata for the base variant.
 * @param {boolean} [options.includeBaseVariant=true] Whether to append the base variant.
 * @param {boolean} [options.encode=true] Encode values instead of keeping them as raw_values.
 * @param {Object[]} [options.col_vars] Additional variants to append after the base one.
 * @param {string} [options.baseVariantLabel] Override for the base variant label.
 * @returns {{col_type:'q'|'n'|'l', col_sep:string, col_values:ColValues, col_vars?:Object[]}}
 */
ns.makeColumn = function (values, options = {}) {
  const valueArray = Array.isArray(values) ? values : [];
  const {
    col_type: explicitType,
    col_sep: explicitSep,
    var_label = 'Original',
    baseVariantMeta,
    includeBaseVariant = true,
    encode = true,
    col_vars: additionalVariants,
    baseVariantLabel,
    ...columnProps
  } = options;
  const needsInference = explicitType === undefined || explicitSep === undefined;
  const inferred = needsInference ? ns.inferColType(valueArray) : null;
  let col_type = explicitType ?? (inferred ? inferred.col_type : 'q');
  let col_sep = explicitSep;
  if (col_sep === undefined) {
    col_sep = inferred ? inferred.col_sep : (col_type === 'l' ? ';' : '');
  }
  if (col_type === 'l' && !col_sep) col_sep = ';';
  if (col_type !== 'l') col_sep = col_sep || '';
  const col_values = encode
    ? ns.encodeColValues(valueArray, col_type, col_sep)
    : { col_compact: false, labels: null, codes: null, raw_values: valueArray.slice() };
  const column = { col_type, col_sep, col_values, ...columnProps };
  if (includeBaseVariant) {
    const baseVariant = {
      var_label: baseVariantLabel ?? var_label,
      col_type,
      col_sep,
      col_values: cloneColValues(col_values),
      meta: { kind: 'original', ...(baseVariantMeta || {}) }
    };
    column.col_vars = Array.isArray(additionalVariants)
      ? [baseVariant, ...additionalVariants]
      : [baseVariant];
  } else if (Array.isArray(additionalVariants)) {
    column.col_vars = additionalVariants;
  }
  return column;
};

/**
 * Replace decoded values according to search/replace, then re-encode.
 * @param {{col_values:ColValues,col_type:'q'|'n'|'l',col_sep:string}} colObject
 * @param {string[]} search
 * @param {string[]} replace
 */
ns.replaceColumnValues = function (colObject, search, replace) {
  const decodedValues = ns.decodeColumn(colObject);
  const sep = colObject.col_sep; const isListType = colObject.col_type === 'l' && sep;
  const normalizeKey = (value) => (value == null ? '' : String(value).trim());
  const replaceMap = {};
  const metaReplacements = [];
  search.forEach((original, i) => {
    const updated = (replace[i] ?? '').trim();
    replaceMap[normalizeKey(original)] = updated;
    if (normalizeKey(original) !== updated) {
      metaReplacements.push({ from: normalizeKey(original), to: updated });
    }
  });
  const updatedValues = decodedValues.map(entry => {
    if (isListType) {
      const items = normalizeKey(entry).split(sep).map(x => x.trim());
      const newItems = items
        .map(item => {
          const key = normalizeKey(item);
          return Object.prototype.hasOwnProperty.call(replaceMap, key) ? replaceMap[key] : item;
        })
        .filter(x => x !== undefined && x !== '');
      return newItems.join(sep);
    }
    const key = normalizeKey(entry);
    if (Object.prototype.hasOwnProperty.call(replaceMap, key)) {
      const newVal = replaceMap[key];
      return newVal === '' ? '' : newVal;
    }
    return entry;
  });
  const processed = ns.encodeColValues(updatedValues, colObject.col_type, colObject.col_sep);
  const meta = { ...(colObject.meta || {}) };
  if (metaReplacements.length > 0) {
    meta.replacements = metaReplacements;
    meta.recipe_version = 1;
  }
  return { ...colObject, col_values: processed, meta };
};

/**
 * Apply meta.processing transformations to a column's values.
 * Returns a NEW column object with processed col_values.
 * The original columnObject is never mutated.
 *
 * @param {Object} columnObject A single column from db_data.columns
 * @param {Object} [options] Override options (merged with meta.processing)
 * @returns {Object} New column object with processed col_values
 */
ns.applyProcessing = function (columnObject, options = {}) {
  const cloned = { ...columnObject, col_values: JSON.parse(JSON.stringify(columnObject.col_values)) };
  const proc = { ...(columnObject?.meta?.processing || {}), ...options };
  if (!proc || Object.keys(proc).length === 0) return cloned;

  const col_type = cloned.col_type || 'q';
  const col_sep = cloned.col_sep || (col_type === 'l' ? ';' : '');
  let values = ns.decodeColumn({ col_type, col_sep, col_values: cloned.col_values });

  // Snapshot which rows are missing BEFORE any processing — NA handling only labels these,
  // not values that become empty as a result of exclusion.
  const originallyMissing = new Set();
  values.forEach((v, i) => {
    const s = v == null ? '' : String(v).trim();
    if (s === '') originallyMissing.add(i);
  });

  // Step 1: Excluded values (all col_types) — remove first so subsequent steps act on kept data
  if (Array.isArray(proc.excluded_values) && proc.excluded_values.length > 0) {
    const excludeSet = new Set(proc.excluded_values.map(String));
    if (col_type === 'l' && col_sep) {
      values = values.map(v => {
        if (v == null || String(v).trim() === '') return v;
        const items = String(v).split(col_sep).map(s => s.trim()).filter(Boolean);
        const filtered = items.filter(item => !excludeSet.has(item));
        return filtered.length > 0 ? filtered.join(col_sep) : '';
      });
    } else {
      values = values.map(v => {
        const s = v == null ? '' : String(v).trim();
        return excludeSet.has(s) ? '' : v;
      });
    }
  }

  // Step 2: NA handling — labels originally-missing rows only (excluded rows stay empty)
  if (proc.na_action === 'label') {
    const naLabel = proc.na_label || translate('table.missing', proc.lang);
    values = values.map((v, i) => originallyMissing.has(i) ? naLabel : v);
  }

  // Step 3: Re-encode
  const newColValues = ns.encodeColValues(values, col_type, col_sep);

  // Step 4: Sort levels (q only, after encoding) — includes NA label in frequency ordering
  if (col_type === 'q' && newColValues.col_compact && Array.isArray(newColValues.labels)) {
    const sortMode = proc.sort_mode || 'default';
    if (sortMode !== 'default') {
      const freqMap = {};
      newColValues.labels.forEach(l => { freqMap[l] = 0; });
      newColValues.codes.forEach(code => {
        if (code > 0 && code <= newColValues.labels.length) {
          freqMap[newColValues.labels[code - 1]]++;
        }
      });

      let sortedLabels;
      if (sortMode === 'freq_desc') {
        sortedLabels = [...newColValues.labels].sort((a, b) => freqMap[b] - freqMap[a] || a.localeCompare(b));
      } else if (sortMode === 'freq_asc') {
        sortedLabels = [...newColValues.labels].sort((a, b) => freqMap[a] - freqMap[b] || a.localeCompare(b));
      } else if (sortMode === 'alpha') {
        sortedLabels = [...newColValues.labels].sort((a, b) => a.localeCompare(b));
      } else if (sortMode === 'custom' && Array.isArray(proc.custom_order)) {
        const ordered = proc.custom_order.filter(v => newColValues.labels.includes(v));
        const remaining = newColValues.labels.filter(v => !proc.custom_order.includes(v));
        sortedLabels = [...ordered, ...remaining];
      }

      if (sortedLabels) {
        const oldIndexMap = {};
        newColValues.labels.forEach((l, i) => { oldIndexMap[i + 1] = sortedLabels.indexOf(l) + 1; });
        newColValues.labels = sortedLabels;
        newColValues.codes = newColValues.codes.map(c => c === 0 ? 0 : (oldIndexMap[c] ?? 0));
      }
    }
  }

  // Step 5: Top N (q only, after sort)
  if (col_type === 'q' && newColValues.col_compact && Array.isArray(newColValues.labels)) {
    const topN = proc.top_n;
    if (topN != null && topN > 0 && topN < newColValues.labels.length) {
      const topNLabel = proc.top_n_label || 'Others';
      const keepLabels = newColValues.labels.slice(0, topN);
      const mergeIndices = new Set();
      for (let i = topN; i < newColValues.labels.length; i++) mergeIndices.add(i + 1);
      const newLabels = [...keepLabels, topNLabel];
      const topNIndex = newLabels.length;

      newColValues.codes = newColValues.codes.map(c => {
        if (c === 0) return 0;
        if (mergeIndices.has(c)) return topNIndex;
        return c;
      });
      newColValues.labels = newLabels;
    }
  }

  cloned.col_values = newColValues;
  return cloned;
};

/**
 * Collect the distinct values present in a column, splitting list columns into individual items.
 * Supports both a Column object and a variant object.
 * @param {{ col_type?: 'q'|'n'|'l', col_sep?: string, col_values: any, raw_values?: string[] }} colObject
 * @param {{ order?: 'levels'|'alpha' }} [options]
 *   `order='levels'` returns `col_values.labels` (R-style factor levels).
 *   `order='alpha'` returns alphabetically sorted unique items.
 *   Default: `'levels'` for `col_type='q'`, `'alpha'` otherwise.
 * @returns {string[]}
 */
ns.getIndividualItems = function (colObject, options = {}) {
  const col_type = colObject.col_type || 'q';
  const col_sep = colObject.col_sep || ';';
  const order = options.order ?? (col_type === 'q' ? 'levels' : 'alpha');

  if (order === 'levels' && colObject.col_values?.col_compact && Array.isArray(colObject.col_values?.labels)) {
    return [...colObject.col_values.labels];
  }

  const values = ns.decodeColumn({ col_type, col_sep, col_values: colObject.col_values, raw_values: colObject.raw_values });
  const allItems = (col_type === 'l') ? values.flatMap(v => (v || '').split(col_sep).map(s => s.trim()).filter(Boolean)) : values;
  const unique = [...new Set(allItems.filter(Boolean))];
  if (order === 'alpha') return unique.sort((a, b) => a.localeCompare(b));
  return unique;
};

/**
 * Frequency count of individual values for a column or one of its variants.
 * @param {Object} column Column object (optionally including col_vars)
 * @param {Object} [options]
 * @param {number|null} [options.variantIndex] Variant index to inspect (defaults to base column)
 * @param {boolean} [options.splitList] Split list values using the column separator (defaults true for list columns)
 * @param {boolean} [options.includeEmpty=false] Include empty / missing values in the output
 * @param {boolean} [options.sortByLevels=false] Sort by `col_values.labels` order (R-style factor levels).
 *   Takes precedence over `sortByCount`/`sortByValue`. Items not in labels fall back to alpha asc tie-break.
 * @param {'asc'|'desc'|null} [options.sortByCount=null] Sort by count (asc/desc). When null falls back to value sort.
 * @param {'asc'|'desc'} [options.sortByValue='asc'] Sort alphabetically when not ordering by count.
 * @returns {{Value:string,Count:number}[]}
 */
ns.getIndividualItemsWithCount = function (column, options = {}) {
  if (!column || typeof column !== 'object') return [];

  const {
    variantIndex = null,
    splitList,
    includeEmpty = false,
    sortByLevels = false,
    sortByCount = null,
    sortByValue = 'asc'
  } = options || {};

  const baseColumn = column;
  const variant = Number.isInteger(variantIndex) && Array.isArray(baseColumn.col_vars)
    ? baseColumn.col_vars[variantIndex]
    : null;
  const col_type = variant?.col_type ?? baseColumn.col_type ?? 'q';
  let col_sep = variant?.col_sep ?? baseColumn.col_sep;
  if (!col_sep) col_sep = col_type === 'l' ? ';' : '';

  const sourceColumn = variant
    ? { ...variant, col_type, col_sep }
    : { ...baseColumn, col_type, col_sep };

  const values = ns.decodeColumn(sourceColumn);
  if (!Array.isArray(values) || values.length === 0) return [];

  const splitPreference = splitList !== undefined ? !!splitList : true;
  const shouldSplit = col_type === 'l' && splitPreference;
  const counts = new Map();

  const addValue = (raw) => {
    const text = raw === null || raw === undefined ? '' : String(raw);
    const normalized = shouldSplit ? text.trim() : text;
    if (!includeEmpty && normalized.trim() === '') return;
    const key = normalized.trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  };

  values.forEach((value) => {
    if (shouldSplit) {
      const text = value === null || value === undefined ? '' : String(value);
      const pieces = text.split(col_sep).map(part => part.trim()).filter(part => includeEmpty ? true : part !== '');
      if (pieces.length === 0 && includeEmpty) {
        addValue('');
      } else {
        pieces.forEach(addValue);
      }
    } else {
      addValue(value);
    }
  });

  const resultArray = Array.from(counts.entries()).map(([key, value]) => ({
    Value: key,
    Count: value
  }));

  /** @type {string[]|null} */
  const labels = (sourceColumn?.col_values?.col_compact && Array.isArray(sourceColumn?.col_values?.labels))
    ? sourceColumn.col_values.labels
    : null;

  if (sortByLevels && labels) {
    const levelIndex = new Map(labels.map((l, i) => /** @type {[string, number]} */ ([l, i])));
    resultArray.sort((a, b) => {
      const ai = levelIndex.get(a.Value) ?? Infinity;
      const bi = levelIndex.get(b.Value) ?? Infinity;
      return ai - bi || a.Value.localeCompare(b.Value);
    });
  } else if (sortByCount === 'asc') {
    resultArray.sort((a, b) => a.Count - b.Count || a.Value.localeCompare(b.Value));
  } else if (sortByCount === 'desc') {
    resultArray.sort((a, b) => b.Count - a.Count || a.Value.localeCompare(b.Value));
  } else if (sortByValue === 'desc') {
    resultArray.sort((a, b) => b.Value.localeCompare(a.Value));
  } else {
    resultArray.sort((a, b) => a.Value.localeCompare(b.Value));
  }

  return resultArray;
};

/**
 * Convert row-wise JSON array into Stat-z column metadata JSON string.
 * @param {string} data JSON string (array of rows)
 * @param {string[]} hashes Column hashes
 * @param {string} filename
 * @param {string|number} currTime
 * @param {{ capitalizeLabels?: boolean, lang?: string }=} options
 * @returns {{ columns: any[], history: Array<{file:string, import_time:any}>, meta: Record<string,any> }}
 */
ns.parseColumns = function (data, hashes, filename, currTime, options = {}) {
  const rows = JSON.parse(data);
  const columns = {};
  rows.forEach(row => { Object.entries(row).forEach(([key, value]) => { if (!columns[key]) columns[key] = []; columns[key].push(value); }); });
  const result = Object.entries(columns).map(([key, values], index) => {
    const labelRaw = trimPunctuation(key).trim();
    const col_label = options.capitalizeLabels
      ? changeCase(labelRaw, 'title_first', options.lang)
      : labelRaw;
    const column = ns.makeColumn(values, {
      col_name: key,
      col_label,
      col_hash: hashes[index],
      col_index: index + 1,
      col_del: false,
      includeBaseVariant: false,
      meta: { replacements: [], processing: {} }
    });
    if (!Array.isArray(column.col_vars)) column.col_vars = [];
    return column;
  });
  return {
    columns: result,
    history: [{ file: filename, import_time: currTime }],
    meta: { capitalizeLabels: options.capitalizeLabels || false }
  };
};

/**
 * Extract key values from array of JSON strings.
 */
ns.extractKeyValues = function (list, key, empty) {
  return list.map(item => { try { const parsed = JSON.parse(item); return key in parsed ? String(parsed[key]) : empty; } catch { return empty; } });
};

/**
 * Merge a set of serialized variables replacing the ones of a given database while keeping order consistent.
 * @param {string[]} selectedVars JSON strings representing variable entries to insert
 * @param {string[]} existingVars JSON strings representing the current variable list
 * @param {string} databaseId Database identifier whose variables should be replaced
 * @returns {string[]} Updated list of variable JSON strings with sequential order
 */
ns.mergeVariablesReplacingForDatabase = function (selectedVars, existingVars, databaseId) {
  const parsedSelected = selectedVars.map(JSON.parse);
  const parsedExisting = existingVars.map(JSON.parse);
  const varKey = (v) => `${v.database_id}|${v.col_hash}|${v.col_var_index ?? 'null'}`;

  // Drop existing vars from the target database; keep others
  const preserved = parsedExisting.filter(v => v.database_id !== databaseId);

  // Build a map to ensure uniqueness across all databases, preferring selected vars
  const mergedMap = new Map();
  parsedSelected.forEach(v => mergedMap.set(varKey(v), v));
  preserved.forEach(v => { if (!mergedMap.has(varKey(v))) mergedMap.set(varKey(v), v); });

  const merged = Array.from(mergedMap.values());
  merged.forEach((v, i) => { v.order = i + 1; });
  return merged.map(JSON.stringify);
};

export default ns;
