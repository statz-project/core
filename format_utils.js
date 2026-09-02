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

/**
 * Decimal + thousands separator pair for Plotly's `layout.separators`, in that order.
 *
 * Covers the numbers Plotly renders itself — axis ticks, and hover values in interactive mode —
 * which `formatNumberLocale` never reaches because they are drawn from raw numeric data, not from
 * strings we build. Without it a pt_br chart labels its bars `5,0%` (ours) above an axis reading
 * `1.234` with the wrong meaning (Plotly's default is decimal point, thousands comma).
 *
 * Derived from Intl rather than a second hardcoded table, so it cannot drift from the locale map
 * above; the fallbacks match Plotly's own default if Intl ever yields nothing.
 * @param {string=} lang
 * @returns {string} `",."` for pt_br and es_es, `".,"` for en_us
 */
export function resolveSeparators(lang = "pt_br") {
  const localeMap = { pt_br: "pt-BR", en_us: "en-US", es_es: "es-ES" };
  const locale = localeMap[String(lang ?? "").toLowerCase()] || "pt-BR";
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const decimal = parts.find((part) => part.type === "decimal")?.value || ".";
  const group = parts.find((part) => part.type === "group")?.value || ",";
  return `${decimal}${group}`;
}
