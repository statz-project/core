// @ts-check
import { trimPunctuation } from './_env.js';

/**
 * @typedef {{col_compact:boolean, labels:string[]|null, codes:(number[]|string[])|null, raw_values:string[]|null}} ColValues
 */
const ns = {};

/**
 * Infer column type and list separator from raw values.
 * @param {string[]} values
 * @returns {{col_type:'q'|'n'|'l', col_sep:string}}
 */
ns.inferColType = function (values) {
  const sample = values.slice(0, 10).filter(Boolean);
  const sepGuess = [';', ','].find(sep => sample.some(v => v.includes(sep))) || '';
  if (sepGuess) return { col_type: 'l', col_sep: sepGuess };
  const numeric = sample.every(v => /^-?\d+(\.\d+)?$/.test(v.replace(',', '.')));
  if (numeric) return { col_type: 'n', col_sep: '' };
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
  const unique = new Set(flattened.map(v => v.trim()).filter(Boolean));
  return unique.size > 1 && unique.size < flattened.length / 1.5;
};

/**
 * Factor-encode values (labels + codes), including list columns.
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
  const labels = [...new Set(values.map(v => v?.trim?.()).filter(Boolean))];
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
    return codes.map(codeStr => codeStr.split(col_sep).map(c => labels[parseInt(c, 10) - 1]).filter(Boolean).join(col_sep));
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
  const replaceMap = {}; search.forEach((original, i) => { const updated = (replace[i] ?? '').trim(); replaceMap[original] = updated; });
  const updatedValues = decodedValues.map(entry => {
    if (isListType) {
      const items = entry.split(sep).map(x => x.trim());
      const newItems = items.map(item => Object.prototype.hasOwnProperty.call(replaceMap, item) ? replaceMap[item] : item).filter(x => x !== undefined && x !== '');
      return newItems.join(sep);
    }
    if (Object.prototype.hasOwnProperty.call(replaceMap, entry)) { const newVal = replaceMap[entry]; return newVal === '' ? '' : newVal; }
    return entry;
  });
  const processed = ns.encodeColValues(updatedValues, colObject.col_type, colObject.col_sep);
  return { ...colObject, col_values: processed };
};

/**
 * Collect the distinct values present in a column, splitting list columns into individual items.
 * @param {{ col_type?: 'q'|'n'|'l', col_sep?: string, col_values: any }} colObject
 * @returns {string[]}
 */
ns.getIndividualItems = function (colObject) {
  const col_type = colObject.col_type || 'q'; const col_sep = colObject.col_sep || ';';
  const values = ns.decodeColumn({ col_type, col_sep, col_values: colObject.col_values, raw_values: colObject.raw_values });
  const allItems = (col_type === 'l') ? values.flatMap(v => (v || '').split(col_sep).map(s => s.trim()).filter(Boolean)) : values;
  return [...new Set(allItems.filter(Boolean))];
};

/**
 * Frequency count of individual values for a column or one of its variants.
 * @param {Object} column Column object (optionally including col_vars)
 * @param {Object} [options]
 * @param {number|null} [options.variantIndex] Variant index to inspect (defaults to base column)
 * @param {boolean} [options.splitList] Split list values using the column separator (defaults true for list columns)
 * @param {boolean} [options.includeEmpty=false] Include empty / missing values in the output
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

  if (sortByCount === 'asc') {
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
 * @returns {string}
 */
ns.parseColumns = function (data, hashes, filename, currTime) {
  const rows = JSON.parse(data);
  const columns = {};
  rows.forEach(row => { Object.entries(row).forEach(([key, value]) => { if (!columns[key]) columns[key] = []; columns[key].push(value); }); });
  const result = Object.entries(columns).map(([key, values], index) => {
    const column = ns.makeColumn(values, {
      col_name: key,
      col_label: trimPunctuation(key).trim(),
      col_hash: hashes[index],
      col_index: index + 1,
      col_del: false,
      includeBaseVariant: false
    });
    if (!Array.isArray(column.col_vars)) column.col_vars = [];
    return column;
  });
  return JSON.stringify({ columns: result, history: [{ file: filename, import_time: currTime }] });
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
  const parsedSelected = selectedVars.map(JSON.parse); const parsedExisting = existingVars.map(JSON.parse);
  const varKey = (v) => `${v.database_id}|${v.col_hash}|${v.col_var_index ?? 'null'}`; const selectedKeys = new Set(parsedSelected.map(varKey));
  const preserved = parsedExisting.filter(v => v.database_id !== databaseId);
  const merged = [...preserved, ...parsedSelected]; merged.forEach((v, i) => { v.order = i + 1; });
  return merged.map(JSON.stringify);
};

export default ns;
