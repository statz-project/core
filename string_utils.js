// @ts-check
// Extracted from bubble/scripts_html/string_utils.html

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
export function changeCase(str, mode = "lower", lang = "pt_br") {
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
