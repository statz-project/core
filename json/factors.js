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
 * Encode if needed, otherwise return raw_values shape.
 * @param {string[]} values
 * @param {'q'|'n'|'l'=} col_type
 * @param {string=} col_sep
 * @returns {ColValues}
 */
ns.processColValues = function (values, col_type = 'q', col_sep = ';') {
  const should = ns.shouldCompact(values, col_type, col_sep);
  if (should) return ns.encodeAsFactor(values, col_type, col_sep);
  return { col_compact: false, labels: null, codes: null, raw_values: values };
};

/**
 * Replace decoded values according to search/replace, then re-encode.
 * @param {{col_values:ColValues,col_type:'q'|'n'|'l',col_sep:string}} colObject
 * @param {string[]} search
 * @param {string[]} replace
 */
ns.replaceColumnValues = function (colObject, search, replace) {
  const decodedValues = ns.decodeColValues(colObject.col_values, colObject.col_type, colObject.col_sep);
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
  const processed = ns.processColValues(updatedValues, colObject.col_type, colObject.col_sep);
  return { ...colObject, col_values: processed };
};

/**
 * Collect the distinct values present in a column, splitting list columns into individual items.
 * @param {{ col_type?: 'q'|'n'|'l', col_sep?: string, col_values: any }} colObject
 * @returns {string[]}
 */
ns.getIndividualItems = function (colObject) {
  const col_type = colObject.col_type || 'q'; const col_sep = colObject.col_sep || ';'; const col_values = colObject.col_values;
  const values = ns.decodeColValues(col_values, col_type, col_sep);
  const allItems = (col_type === 'l') ? values.flatMap(v => (v || '').split(col_sep).map(s => s.trim()).filter(Boolean)) : values;
  return [...new Set(allItems.filter(Boolean))];
};

/**
 * Frequency count of individual values.
 * @param {string[]} valuesArray
 * @param {boolean=} countOrder Sort by count desc
 */
ns.getIndividualItemsWithCount = function (valuesArray, countOrder = false) {
  const countMap = {}; valuesArray.forEach(val => { countMap[val] = (countMap[val] || 0) + 1; });
  const resultArray = Object.entries(countMap).map(([key, value]) => ({ Value: key, Count: value }));
  if (countOrder) resultArray.sort((a, b) => b.Count - a.Count); else resultArray.sort((a, b) => a.Value.localeCompare(b.Value));
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
    const { col_type, col_sep } = ns.inferColType(values);
    const col_values = ns.processColValues(values, col_type, col_sep);
    const baseVariant = {
      var_label: 'Original',
      col_type,
      col_sep,
      col_values: JSON.parse(JSON.stringify(col_values)),
      meta: { kind: 'original' }
    };
    return {
      col_name: key,
      col_label: trimPunctuation(key).trim(),
      col_hash: hashes[index],
      col_index: index + 1,
      col_del: false,
      col_type,
      col_sep,
      col_values,
      col_vars: [baseVariant]
    };
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

