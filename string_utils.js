// @ts-check
// Extracted from bubble/scripts_html/string_utils.html
import { DEFAULT_LANG } from './i18n/index.js';

/**
 * Normalize diacritics and optionally lowercase.
 * @param {string} str
 * @param {boolean=} minuscula
 * @returns {string}
 */
export function normalize(str, minuscula) {
  let clean = String(str ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C");
  if (minuscula) clean = clean.toLowerCase();
  return clean;
}

/**
 * Trim trailing punctuation and whitespace.
 * @param {string} label
 * @returns {string}
 */
export function trimPunctuation(label) {
  if (typeof label !== "string") return "";
  return label.replace(/[\s\p{P}]+$/u, "");
}

/**
 * Expand a comma- and dash-separated index range string into a sorted, deduplicated
 * array of positive integers. Useful for batch selection UIs ("pick items 1,3-6,15").
 *
 * Examples:
 *   "1,3-6,15"     → [1, 3, 4, 5, 6, 15]
 *   "5"            → [5]
 *   "3,3,3"        → [3]
 *   "1-3,5,10-12"  → [1, 2, 3, 5, 10, 11, 12]
 *   "6-3"          → [3, 4, 5, 6]   (inverted range normalized)
 *   ""             → []
 *
 * Invalid tokens are silently dropped. Ranges expanding to more than 10000 indices
 * are dropped as a guard against accidental abuse (e.g., "1-1000000"). Non-string
 * input returns `[]`.
 *
 * @param {string} input
 * @returns {number[]}
 */
export function expandIndexRange(input) {
  if (typeof input !== "string") return [];
  const tokens = input.split(",").map(t => t.trim()).filter(Boolean);
  /** @type {Set<number>} */
  const result = new Set();
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      result.add(parseInt(token, 10));
      continue;
    }
    const m = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo > 10000) continue;
    for (let i = lo; i <= hi; i++) result.add(i);
  }
  return [...result].sort((a, b) => a - b);
}

/**
 * Proper-case string with language stop-words.
 * @param {string} str
 * @param {string=} lang
 */
export function titleCaseWithStopwords(str, lang = "pt_br") {
  if (typeof str !== "string") return str;
  const stopwordsMap = {
    pt_br: ["da", "de", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "a", "o", "as", "os", "à", "ao"],
    en_us: ["a", "an", "the", "and", "or", "but", "on", "in", "with", "to", "of", "for", "at", "by", "from"],
    es_es: ["el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "en", "de", "del", "al", "por", "con"]
  };
  const stopwords = stopwordsMap[lang.toLowerCase()] || [];
  return str
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (index === 0 || !stopwords.includes(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      } else {
        return word;
      }
    })
    .join(" ");
}

/**
 * Change casing mode: lower | upper | title_first | proper.
 * @param {string} str
 * @param {('lower'|'upper'|'title_first'|'proper')=} mode
 * @param {string=} lang
 */
export function changeCase(str, mode = "lower", lang = DEFAULT_LANG) {
  if (typeof str !== "string") return str;
  switch (mode.toLowerCase()) {
    case "upper":
      return str.toUpperCase();
    case "lower":
      return str.toLowerCase();
    case "title_first":
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    case "proper":
      return titleCaseWithStopwords(str, lang);
    default:
      return str;
  }
}
