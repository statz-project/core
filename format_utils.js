// @ts-check
// Extracted from bubble/scripts_html/format_utils.html

/**
 * Round a number to N decimals.
 * @param {number} num
 * @param {number} decimals
 */
export function round(num, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Format a p-value with threshold and locale.
 * @param {number} p
 * @param {number=} decimals
 * @param {number=} threshold
 * @param {string=} lang e.g., 'pt_br' | 'en_us'
 * @returns {string}
 */
export function formatPValue(p, decimals = 3, threshold = 0.001, lang = "pt_br") {
  if (typeof p !== "number" || isNaN(p)) return "-";
  const localeMap = { pt_br: "pt-BR", en_us: "en-US", es_es: "es-ES" };
  const locale = localeMap[lang.toLowerCase()] || "pt-BR";
  const rounded = round(p, decimals);
  const thresholdFormatted = threshold.toLocaleString(locale, { minimumFractionDigits: decimals });
  if (rounded < threshold) return `<${thresholdFormatted}`;
  return rounded.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Locale-aware numeric formatting with fixed decimals.
 * @param {number} value
 * @param {number=} decimals
 * @param {string=} lang
 */
export function formatNumberLocale(value, decimals = 1, lang = "pt_br") {
  if (typeof value !== "number" || isNaN(value)) return "–";
  const localeMap = { pt_br: "pt-BR", en_us: "en-US", es_es: "es-ES" };
  const locale = localeMap[lang.toLowerCase()] || "pt-BR";
  return value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
