// @ts-check
// Reactive-update primitives: content hashes for columns/variants + Element snapshots
// consumed by the Bubble UI's Do-when to detect data changes without a coordinator.
//
// Spec: dev-docs/REACTIVE_RESULT_JSON_UPDATE.md (user-side extension of the same idea).
//
// Design note: this module intentionally does NOT import driver.js — parseColumns +
// applyColumnMappings both auto-invoke refreshDatabaseHashes from driver's side, which
// creates a circular chain that ES modules resolve at load time. Keeping snapshots.js
// dependency-free of driver.js sidesteps TDZ issues.
import variants from './variants.js';
import { fnv1a, canonicalStringify } from './hashing.js';

/** Trivial inline replacement for driver.getColumn — avoids circular import. */
function findColumn(db, colHash) {
  if (!db || !Array.isArray(db.columns)) return null;
  return db.columns.find((c) => c?.col_hash === colHash) ?? null;
}

const ns = {};

/**
 * Normalize a column's col_values into a compact canonical shape suitable for hashing.
 * Dispatches by column type so we hash the payload that actually changes:
 *  - `q` compact: labels + codes (both order-sensitive — codes reference label indices).
 *  - `n` / `l` raw: raw_values (order-sensitive — row order carries meaning).
 *  - Fallback: canonicalStringify of the whole `col_values` object.
 *
 * @param {any} colValues
 * @param {string=} colType
 * @returns {any}
 */
function canonicalValues(colValues, colType) {
  if (!colValues || typeof colValues !== 'object') return colValues ?? null;
  if (colType === 'q' && colValues.col_compact) {
    return { labels: colValues.labels ?? null, codes: colValues.codes ?? null };
  }
  if (colType === 'n' || colType === 'l') {
    return { raw_values: colValues.raw_values ?? null };
  }
  // Unknown / fallback — hash whatever's there.
  return colValues;
}

/**
 * Compute the content hash of a single column. Inputs mirror the fields that actually
 * affect analysis output: label, type, separator, deletion flag, values, and processing
 * metadata. `col_hash` (structural id) and cosmetic fields (col_index, col_name) are
 * intentionally excluded.
 *
 * @param {any} col
 * @returns {string}
 */
function hashColumn(col) {
  if (!col || typeof col !== 'object') return fnv1a('null');
  return fnv1a(canonicalStringify({
    label: col.col_label ?? null,
    type: col.col_type ?? null,
    sep: col.col_sep ?? null,
    del: col.col_del === true,
    values: canonicalValues(col.col_values, col.col_type),
    replacements: col.meta?.replacements ?? null,
    processing: col.meta?.processing ?? null
  }));
}

/**
 * Compute the content hash of a single variant. Includes the upstream source's hash to
 * propagate change transitively — editing a base column invalidates every variant
 * derived from it, and editing an intermediate variant invalidates its descendants.
 *
 * @param {any} variant
 * @param {string} upstreamHash
 * @returns {string}
 */
function hashVariant(variant, upstreamHash) {
  if (!variant || typeof variant !== 'object') return fnv1a('null');
  // normalizeRecipe canonicalizes recipe defaults and reorders keys so cosmetic diffs
  // (missing optional flags, key reordering) don't flip the hash.
  const recipeNormalized = variant.meta?.recipe
    ? /** @type {any} */ (variants).normalizeRecipe(variant.meta.recipe)
    : null;
  return fnv1a(canonicalStringify({
    label: variant.var_label ?? null,
    type: variant.col_type ?? null,
    sep: variant.col_sep ?? null,
    values: canonicalValues(variant.col_values, variant.col_type),
    recipe: recipeNormalized,
    sourceIdx: variant.meta?.source_var_index ?? null,
    upstream: upstreamHash
  }));
}

/**
 * Return true when at least one column in the database is missing its content hash.
 * Used by computeElementSnapshot to trigger transparent backfill on legacy dbs.
 * @param {any} database
 */
function needsHashBackfill(database) {
  if (!database || !Array.isArray(database.columns)) return false;
  return database.columns.some((c) => typeof c?.col_content_hash !== 'string');
}

/**
 * Refresh hashes on a single column + its variants in place. Preserves the chain
 * propagation semantics: variant N's upstream is either the base column's
 * `col_content_hash` (when `source_var_index ∈ {null, 0}`) or the previous variant's
 * `var_content_hash`. Variants are processed in ascending index order so upstream
 * references always see fresh hashes.
 *
 * Private helper — shared by `refreshDatabaseHashes` (full sweep) and
 * `refreshColumnHashes` (pointed refresh).
 *
 * @param {any} column
 */
function hashColumnInPlace(column) {
  if (!column || typeof column !== 'object') return;
  column.col_content_hash = hashColumn(column);
  if (!Array.isArray(column.col_vars)) return;
  for (let i = 0; i < column.col_vars.length; i++) {
    const variant = column.col_vars[i];
    if (!variant || typeof variant !== 'object') continue;
    const srcIdx = variant.meta?.source_var_index;
    let upstream;
    if (srcIdx == null || srcIdx === 0) {
      upstream = column.col_content_hash;
    } else if (srcIdx >= 1 && srcIdx < column.col_vars.length) {
      upstream = column.col_vars[srcIdx]?.var_content_hash ?? column.col_content_hash;
    } else {
      upstream = column.col_content_hash;
    }
    variant.var_content_hash = hashVariant(variant, upstream);
  }
}

/**
 * Refresh (or populate for the first time) the content hashes on every column and
 * variant of a database. Mutates the database in place and returns it for chaining.
 * Idempotent — the same input always produces the same hashes.
 *
 * Use this after mutations that touch multiple columns (parseColumns, applyColumnMappings),
 * or when unsure which columns changed. For pointed mutations (rename column, edit
 * meta.replacements), prefer `refreshColumnHashes(database, colHash)` — same result, O(1)
 * column lookup + O(variants) hashing instead of a full-database sweep.
 *
 * @param {any} database
 * @returns {any} the same database, with `col_content_hash` and `var_content_hash` populated.
 */
ns.refreshDatabaseHashes = function (database) {
  if (!database || !Array.isArray(database.columns)) return database;
  for (const col of database.columns) hashColumnInPlace(col);
  return database;
};

/**
 * Refresh hashes on a single column (by col_hash) and its variants in place. Fast path
 * for pointed mutations where the caller knows only one column was touched — semantically
 * identical to `refreshDatabaseHashes` in that case because variants source only within
 * their own column (`meta.source_var_index` indexes local `col_vars`), never cross-column.
 *
 * @param {any} database
 * @param {string} colHash
 * @returns {any} the mutated column, or `null` when col_hash is not found.
 */
ns.refreshColumnHashes = function (database, colHash) {
  if (!database || !Array.isArray(database.columns)) return null;
  const column = database.columns.find((/** @type {any} */ c) => c?.col_hash === colHash);
  if (!column) return null;
  hashColumnInPlace(column);
  return column;
};

/**
 * Build a reactive snapshot for an Element. The snapshot is a flat object of
 * `{database#colHash#varIdx: contentHash | "MISSING"}` entries, plus three ordering
 * markers (`__predictor_order`, `__response_order`, `__analysis_options`) that flip
 * when the Element's semantics change without any referenced column mutating.
 *
 * Keys of the returned object are sorted alphabetically so callers can compare
 * snapshots via serialized string equality without a deep diff.
 *
 * @param {Array<any>} predictors Element.Predictors — variable signatures.
 * @param {Array<any>} responses Element.Responses — variable signatures.
 * @param {Record<string, any>} databases Map of `{database_id: db_data}` covering the referenced dbs.
 * @param {Record<string, any>=} analysisOptions Element.Analysis_options (raw; will be normalized).
 * @returns {Record<string, string>}
 */
ns.computeElementSnapshot = function (predictors, responses, databases, analysisOptions) {
  // Tolerant input parsing — matches runAnalysis's contract of accepting either parsed
  // objects OR JSON-stringified shapes per entry. `updateColumnLabelsFromDb` (called
  // right before us in the standard Element workflow) returns an array of JSON strings,
  // so we must parse them here to see the fields; otherwise every entry collapses to
  // "MISSING" and all keys clash on "##null".
  /** @param {any} e */
  const parseEntry = (e) => {
    if (typeof e === 'string') { try { return JSON.parse(e); } catch { return null; } }
    if (e && typeof e === 'object') return e;
    return null;
  };
  const preds = (Array.isArray(predictors) ? predictors : []).map(parseEntry).filter(Boolean);
  const resps = (Array.isArray(responses) ? responses : []).map(parseEntry).filter(Boolean);
  // Self-guard: an Element with no predictors AND no responses has no meaningful state
  // to snapshot. Returning {} keeps semantics clean (no ordering/options markers for
  // something that has nothing to compare against) and mirrors the "no predictors"
  // branch of Update_result_json which persists `Data_snapshots` as "" (empty string).
  // Profile A (predictors only) and Profile B (responses only) still emit full snapshots.
  if (preds.length === 0 && resps.length === 0) return {};
  const dbs = (databases && typeof databases === 'object') ? databases : {};

  // Transparent backfill: legacy db_data without hashes gets populated on the fly.
  for (const db of Object.values(dbs)) {
    if (needsHashBackfill(db)) ns.refreshDatabaseHashes(db);
  }

  /** @param {any} sig */
  const keyFor = (sig) => `${sig?.database_id ?? ''}#${sig?.col_hash ?? ''}#${sig?.col_var_index ?? 'null'}`;

  /** @param {any} sig */
  const valueFor = (sig) => {
    if (!sig || !sig.database_id || !sig.col_hash) return 'MISSING';
    const db = dbs[sig.database_id];
    if (!db) return 'MISSING';
    const col = findColumn(db, sig.col_hash);
    if (!col) return 'MISSING';
    const idx = sig.col_var_index;
    if (idx == null) return col.col_content_hash ?? 'MISSING';
    if (!Array.isArray(col.col_vars) || idx < 0 || idx >= col.col_vars.length) return 'MISSING';
    return col.col_vars[idx]?.var_content_hash ?? 'MISSING';
  };

  /** @type {Record<string, string>} */
  const raw = {};
  for (const sig of preds) {
    raw[keyFor(sig)] = valueFor(sig);
  }
  // A Profile C response is read from EVERY database the predictors come from, not from the one it
  // happens to be tagged with: `runAnalysis` rebinds `database_id` per predictor database (the D2
  // broadcast, and the single-database path too). The snapshot has to cover the same ground —
  // otherwise editing the response in a database the signature does not name leaves the Element
  // looking fresh while its analysis silently changes. With no predictors (Profile B paired) the
  // response is read from its own database, so that is the fallback.
  const predictorDbIds = [...new Set(preds.map(sig => sig?.database_id).filter(Boolean))];
  for (const sig of resps) {
    const targetDbIds = predictorDbIds.length > 0 ? predictorDbIds : [sig?.database_id];
    for (const dbId of targetDbIds) {
      const rebound = { ...sig, database_id: dbId };
      raw[keyFor(rebound)] = valueFor(rebound);
    }
  }

  // Ordering markers — hash the concatenation of identity keys in list order.
  const predKeysOrdered = preds.map(keyFor).join('|');
  const respKeysOrdered = resps.map(keyFor).join('|');
  raw['__predictor_order'] = fnv1a(predKeysOrdered);
  raw['__response_order'] = fnv1a(respKeysOrdered);

  // Options fingerprint. Callers who want stability across cosmetic diffs (missing
  // keys, ordering) should pass a pre-normalized bag from `getDefaultAnalysisOptions`;
  // otherwise the raw input is hashed as-is. We can't call getDefaultAnalysisOptions
  // here without introducing a circular import (driver.js → snapshots.js and back) that
  // trips ESM TDZ.
  raw['__analysis_options'] = fnv1a(canonicalStringify(analysisOptions || {}));

  // Sort keys alphabetically for stable string comparison across snapshots.
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of Object.keys(raw).sort()) out[k] = raw[k];
  return out;
};

export default ns;
