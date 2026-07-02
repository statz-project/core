// @ts-check
// Small, dependency-free hashing helpers used by the snapshot mechanism (core/json/snapshots.js).
// FNV-1a is non-cryptographic but fast, deterministic, and uniform enough for change detection.

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/**
 * FNV-1a 32-bit hash over the UTF-8 byte encoding of the input string. Returns an
 * 8-character lowercase hex string. Deterministic and stable across runs.
 *
 * Purely for change detection — do NOT use for security-sensitive purposes.
 *
 * @param {string} str
 * @returns {string} 8-char hex
 */
export function fnv1a(str) {
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const bytes = encoder ? encoder.encode(String(str)) : Buffer.from(String(str), 'utf8');
  let h = FNV_OFFSET_BASIS_32;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    // Math.imul keeps the multiplication 32-bit-safe in JS.
    h = Math.imul(h, FNV_PRIME_32);
  }
  // Force to unsigned 32-bit and format as 8-char hex.
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * JSON stringify with keys sorted recursively. Arrays preserve their order
 * (semantically ordered — mutating arrays is a real change). Objects have their
 * keys sorted at every nesting level. Primitives, null, and undefined are
 * delegated to `JSON.stringify` (so `undefined` produces `undefined`; consumers
 * usually wrap in an object where `undefined` values are omitted).
 *
 * Used so hashes stay stable under key-reordering (e.g., two `{a:1, b:2}` and
 * `{b:2, a:1}` should hash identically).
 *
 * @param {any} value
 * @returns {string}
 */
export function canonicalStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalStringify(v)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(value[k]));
  return '{' + parts.join(',') + '}';
}
