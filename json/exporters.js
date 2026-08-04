// @ts-check
import { formatNumberLocale, formatPValue } from './_env.js';
import { normalizeLanguage, translate } from '../i18n/index.js';
import factors from './factors.js';
import variants from './variants.js';

const ns = {};

/**
 * Escape text for safe emission inside an HTML element.
 * @param {unknown} val
 * @returns {string}
 */
const escapeHtml = (val) => {
  const str = String(val ?? '');
  // Avoid regex literals with `</` sequences (safer for inline bundles); use split/join for < and >.
  return str
    .replace(/&/g, '&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;');
};

/**
 * Escape text for safe emission inside a double-quoted HTML attribute.
 * @param {unknown} val
 * @returns {string}
 */
const escapeAttr = (val) => escapeHtml(val).split('"').join('&quot;');

/**
 * Parse a "maximum" render option (`maxRows`, `maxBins`, `maxLevels`).
 *
 * An explicit **`0` means NO LIMIT** and yields `Infinity`, which flows untouched through the
 * `Math.min` / `Math.ceil` / `length <=` comparisons at the call sites. `Infinity` itself is
 * accepted for the same meaning. Anything else invalid — blank, null, negative, non-numeric —
 * falls back to the caller's default.
 *
 * The blank/null guard MUST precede `Number()`: `Number('')` and `Number(null)` are both `0`, so
 * without it an empty UI field would silently switch the widget from its default cap to unlimited.
 * Same trap, same fix as `factors.resolveVariable`'s variant-index coercion.
 *
 * @param {unknown} raw
 * @param {number} fallback Used when `raw` is absent or unusable.
 * @returns {number} A positive integer, or `Infinity` for "no limit".
 */
const parseMaxOption = (raw, fallback) => {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'string' && raw.trim() === '') return fallback;
  const n = Number(raw);
  if (n === 0 || n === Infinity) return Infinity;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/**
 * True when a variant would render a row byte-identical to its own base column, making it pure
 * duplication in a table that already shows that column.
 *
 * A variant with no `col_values` of its own is a POINTER to its parent (`addVariant` seeds
 * `col_vars[0]` this way, labelled with the column's own label), so it decodes to the parent's
 * values. When it also declares no `replacements`/`processing`, it resolves through exactly the
 * column's meta too — same values, same everything.
 *
 * A pointer variant that DOES carry its own processing is kept: it inherits the column's
 * replacements but adds its own rules on top, so its values genuinely differ.
 *
 * @param {any} variant
 * @returns {boolean}
 */
const isRedundantPointerVariant = (variant) => {
  if (!variant || variant.col_values != null) return false;
  const meta = variant.meta;
  const hasReplacements = Array.isArray(meta?.replacements) && meta.replacements.length > 0;
  const hasProcessing = meta?.processing && Object.keys(meta.processing).length > 0;
  return !hasReplacements && !hasProcessing;
};

/**
 * Flatten a database payload into renderable column entries (base columns + their variants),
 * decoding values and optionally applying replacements + processing.
 * Shared by `exportDatabaseAsHTML` and `buildMissingMap`.
 *
 * Variants that merely point at their parent column are skipped — the base column entry already
 * carries those values, and showing both put the same data under the same label twice.
 *
 * @param {{ columns: Array<Record<string, any>> }} db Caller must have validated `db.columns`.
 * @param {{ showDeletedColumns?: boolean, showVariants?: boolean, applyProcessing?: boolean }} options
 * @returns {Array<{hash: string, rawLabel: string, label: string, values: any[], colType: 'q'|'n'|'l', colSep: string, isDeleted: boolean, isVariant: boolean}>}
 */
const collectDecodedColumns = function (db, options) {
  const showDeletedColumns = options.showDeletedColumns === true; // default hide deleted
  const showVariants = options.showVariants !== false; // default true
  const resolveOpts = { applyProcessing: options.applyProcessing !== false };

  return db.columns.flatMap(col => {
    /** @type {Array<{hash: string, rawLabel: string, label: string, values: any[], colType: 'q'|'n'|'l', colSep: string, isDeleted: boolean, isVariant: boolean}>} */
    const entries = [];
    // factors.resolveVariable owns the variant lookup, the pointer-style fallback and the
    // meta pipeline, so the viewer shows exactly what runAnalysis analyses.
    const base = factors.resolveVariable(db, col.col_hash, null, resolveOpts);
    if (!base) return entries;
    const baseRawLabel = base.label;
    entries.push({ hash: col.col_hash, rawLabel: baseRawLabel, label: escapeHtml(baseRawLabel), values: base.values, colType: base.colType, colSep: base.colSep, isDeleted: !!col.col_del, isVariant: false });

    if (showVariants && Array.isArray(col.col_vars)) {
      col.col_vars.forEach((variant, idx) => {
        // Skipped, not renumbered: surviving variants keep their own `__var${idx}` hash.
        if (isRedundantPointerVariant(variant)) return;
        const resolved = factors.resolveVariable(db, col.col_hash, idx, resolveOpts);
        if (!resolved) return;
        const vRawLabel = variant?.var_label ?? `${baseRawLabel} (v${idx + 1})`;
        entries.push({ hash: `${col.col_hash}__var${idx}`, rawLabel: vRawLabel, label: escapeHtml(vRawLabel), values: resolved.values, colType: resolved.colType, colSep: resolved.colSep, isDeleted: !!col.col_del, isVariant: true });
      });
    }
    return entries;
  }).filter(col => col.hash && (showDeletedColumns || !col.isDeleted));
};

/**
 * Render a simple HTML table string.
 * @param {{ columns: string[], rows: Array<Record<string, any>> }} table
 * @param {string=} caption
 * @returns {string}
 */
ns.tableToHTML = function (table, caption = '') {
  const { columns, rows } = table;
  const thead = `<thead><tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(row => `<tr>${columns.map(col => `<td>${row[col] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table border="1">${caption ? `<caption>${caption}</caption>` : ''}${thead}${tbody}</table>`;
};

/**
 * Convert a table to Markdown.
 * @param {{ columns: string[], rows: Array<Record<string, any>> }} table
 * @returns {string}
 */
ns.tableToMarkdown = function (table) {
  const { columns, rows } = table;
  const header = `| ${columns.join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map(row => `| ${columns.map(col => row[col] ?? '').join(' | ')} |`).join('\n');
  return `${header}\n${separator}\n${body}`;
};

/**
 * Wrap body HTML into a minimal HTML document.
 * @param {string} title
 * @param {string} bodyHTML
 * @param {{ lang?: string }=} options
 * @returns {string}
 */
ns.wrapHTMLDocument = function (title, bodyHTML, options = {}) {
  const lang = normalizeLanguage(options?.lang);
  const htmlLang = lang.replace('_', '-');
  const docTitle = title ?? translate('table.title', lang);
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <title>${docTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #999; padding: 8px; text-align: left; }
    caption { font-weight: bold; margin-bottom: 8px; }
  </style>
</head>
<body>
  ${bodyHTML}
</body>
</html>`;
};

/**
 * Build HTML blocks listing significant post-hoc pairwise comparisons.
 * @param {Array<{ predictor?: string, table?: { posthoc?: Array<{ groupA: string, groupB: string, pValue: number, significant: boolean }>, lang?: string }, response?: string }>} analysis
 * @param {string|{ title?: string, lang?: string }=} titleOrOptions
 * @returns {string}
 */
ns.exportPosthocComparisonsAsHTML = function (analysis, titleOrOptions) {
  if (!Array.isArray(analysis)) return '';
  const options = (typeof titleOrOptions === 'object' && titleOrOptions !== null) ? titleOrOptions : {};
  const langCandidate = options?.lang ?? analysis.find(item => item?.table?.lang)?.table?.lang;
  const lang = normalizeLanguage(langCandidate);
  const title = (typeof titleOrOptions === 'string' ? titleOrOptions : options?.title) ?? translate('posthoc.title', lang);
  const variableLabel = translate('table.columns.variable', lang);
  const groupALabel = translate('table.columns.groupA', lang);
  const groupBLabel = translate('table.columns.groupB', lang);
  const pValueLabel = translate('table.columns.pValue', lang);
  const significantLabel = translate('table.columns.significant', lang);
  const significantSymbol = translate('posthoc.significantSymbol', lang);
  const htmlBlocks = [];
  analysis.forEach(item => {
    const predictor = item.predictor?.replace(/[:?\s]*$/, '') || variableLabel;
    const posthoc = item?.table?.posthoc?.filter(p => p.significant);
    if (!posthoc || posthoc.length === 0) return;
    const rows = posthoc.map(p => `
            <tr>
                <td>“${p.groupA}”</td>
                <td>“${p.groupB}”</td>
                <td>${formatPValue(p.pValue, 4, 0.001, lang)}</td>
                <td style="text-align:center;">${significantSymbol}</td>
            </tr>`).join('');
    const block = `
        <h4>${predictor}</h4>
        <table border="1" cellspacing="0" cellpadding="6" style="margin-bottom:20px;">
            <thead>
                <tr>
                    <th>${groupALabel}</th>
                    <th>${groupBLabel}</th>
                    <th>${pValueLabel}</th>
                    <th>${significantLabel}</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>`;
    htmlBlocks.push(block);
  });
  if (htmlBlocks.length === 0) return '';
  return `
    <div class="posthoc-details">
        <h3>${title}</h3>
        ${htmlBlocks.join("\n")}
    </div>`;
};

/**
 * Combine per-predictor results into a single printable table representation.
 * @param {{ analysis: Array<{ predictor: string, response?: string|null, predictor_type?: string, response_type?: string|null, table?: { columns: string[], rows: Array<Record<string, string>>, p_value?: number|null, test_used?: string|null, test_symbol?: string, posthoc?: Array<{ groupA: string, groupB: string, pValue: number, significant: boolean }>, percent_by?: string, summary?: Record<string, any>, lang?: string, resid_symbol_greater_used?: boolean, resid_symbol_lower_used?: boolean } }>, lang?: string }} resultObj
 * @returns {{ columns: string[], rows: Array<Record<string, string>>, test_legend: Array<{ method: string, symbol: string }>, posthoc_legend: string[], resid_symbol_greater_used: boolean, resid_symbol_lower_used: boolean, lang: string, percent_by?: string, percent_total_full?: boolean }}
 */
ns.combineAnalysisAsSingleTable = function (resultObj) {
  const resultArray = resultObj.analysis;
  const langCandidate = resultObj?.lang ?? resultArray?.find?.(obj => obj?.table?.lang)?.table?.lang;
  const lang = normalizeLanguage(langCandidate);
  const hasGrouping = Array.isArray(resultArray) ? resultArray.some(obj => obj.response) : false;
  const firstColLabel = hasGrouping ? translate('table.columns.group', lang) : translate('table.columns.variable', lang);
  const pValueLabel = translate('table.columns.pValue', lang);
  const missingValue = translate('table.missingValue', lang);
  const combined = { columns: [firstColLabel], rows: [], test_legend: [], posthoc_legend: [], resid_symbol_greater_used: false, resid_symbol_lower_used: false, lang };
  if (!Array.isArray(resultArray)) return combined;
  const legendMap = new Map();
  const posthocByPredictor = [];
  resultArray.forEach(obj => {
    const table = obj?.table;
    if (!table) return;
    const headerLabel = obj.predictor ?? obj.response ?? '—';
    const predLabel = `<b>${headerLabel}</b>`;
    // Warning entries (paired rejection cases, l × l without subset, multi-DB missing response)
    // carry only `table.warning` — no columns/rows. Render as a flagged row spanning all columns.
    if (/** @type {any} */ (table).warning) {
      const headerRow = /** @type {Record<string, string>} */ ({});
      combined.columns.forEach(col => { headerRow[col] = ''; });
      headerRow[firstColLabel] = predLabel;
      /** @type {any[]} */ (combined.rows).push(headerRow);
      const warnRow = /** @type {Record<string, string>} */ ({});
      combined.columns.forEach(col => { warnRow[col] = ''; });
      warnRow._warning_text = /** @type {any} */ (table).warning;
      /** @type {any[]} */ (combined.rows).push(warnRow);
      return;
    }
    table.columns.forEach(col => { if (!combined.columns.includes(col)) combined.columns.push(col); });
    const rowIntro = {};
    combined.columns.forEach(col => {
      if (col === firstColLabel) {
        rowIntro[col] = predLabel;
      } else if (col === pValueLabel && typeof table.p_value === 'number') {
        const formatted = formatPValue(table.p_value, 3, 0.001, lang);
        rowIntro[col] = `${formatted}${table.test_symbol ?? ''}`;
      } else if (col === pValueLabel) {
        rowIntro[col] = missingValue;
      } else {
        rowIntro[col] = '';
      }
    });
    rowIntro._test_method = table.test_used;
    rowIntro._test_symbol = table.test_symbol;
    combined.rows.push(rowIntro);
    table.rows.forEach(row => {
      const fullRow = {};
      combined.columns.forEach(col => {
        fullRow[col] = row[col] ?? '';
      });
      combined.rows.push(fullRow);
    });
    if (table.test_used && !legendMap.has(table.test_used)) legendMap.set(table.test_used, table.test_symbol);
    if (table.used_resid_greater) combined.resid_symbol_greater_used = true;
    if (table.used_resid_lower) combined.resid_symbol_lower_used = true;
    if (Array.isArray(table.posthoc)) {
      const comparisons = table.posthoc
        .filter(p => p.significant)
        .map(p => translate('posthoc.comparisonPair', lang, { groupA: p.groupA, groupB: p.groupB, pValue: formatPValue(p.pValue, 4, 0.001, lang) }));
      if (comparisons.length) {
        posthocByPredictor.push(translate('posthoc.comparisonEntry', lang, { predictor: obj.predictor, comparisons: comparisons.join(', ') }));
      }
    }
  });
  // Pin the p-value last. Every individual analysis already emits it as its final column; only
  // the merge breaks that, because a level introduced by a later analysis (a response resolved
  // in another database with an extra level, say) is appended after the columns already seen.
  // Rows are keyed by label and every renderer walks `combined.columns`, so reordering here is
  // enough — no row rewriting needed.
  const pValueIdx = combined.columns.indexOf(pValueLabel);
  if (pValueIdx !== -1 && pValueIdx !== combined.columns.length - 1) {
    combined.columns.splice(pValueIdx, 1);
    combined.columns.push(pValueLabel);
  }
  combined.test_legend = Array.from(legendMap.entries()).map(([method, symbol]) => ({ method, symbol }));
  if (posthocByPredictor.length > 0) combined.posthoc_legend = posthocByPredictor;
  const percentByFlags = resultArray.filter(r => r.table?.percent_by).map(r => r.table.percent_by);
  if (percentByFlags.length > 0 && percentByFlags.every(v => v === percentByFlags[0])) combined.percent_by = percentByFlags[0];
  const fullTotalFlags = resultArray.filter(r => ['q', 'l'].includes(r.predictor_type)).map(r => r.table?.summary?.total_is_full);
  if (fullTotalFlags.length > 0 && fullTotalFlags.every(v => v === true)) combined.percent_total_full = true;
  return combined;
};

/**
 * Render combined table as HTML (optionally full document).
 * @param {{ columns: string[], rows: Array<Record<string, string>>, test_legend?: Array<{ method: string, symbol: string }>, posthoc_legend?: string[], resid_symbol_greater_used?: boolean, resid_symbol_lower_used?: boolean, lang?: string, percent_by?: string, percent_total_full?: boolean }} combined
 * @param {string=} title
 * @param {boolean=} wrap
 * @param {string=} footerFree Optional user-provided footer suffix appended after the auto-generated legend. Trimmed; a terminal "." is added if missing.
 * @returns {string}
 */
ns.exportCombinedAsHTML = function (combined, title, wrap = false, footerFree = '') {
  if (!combined || !combined.columns || !combined.rows) return '';
  const langCandidate = combined?.lang;
  const lang = normalizeLanguage(langCandidate);
  const resolvedTitle = title ?? translate('table.title', lang);
  let html = '';
  html += `<table><thead><tr>`;
  combined.columns.forEach(col => { html += `<th>${col}</th>`; });
  html += `</tr></thead>`;
  html += `<tbody>`;
  combined.rows.forEach(row => {
    if (ns.isWarningRow(row)) {
      const warnText = /** @type {any} */ (row)._warning_text;
      html += `<tr><td colspan="${combined.columns.length}" style="background:#fff8e1;color:#856404;padding:8px;">⚠ ${warnText}</td></tr>`;
      return;
    }
    html += `<tr>`;
    let skip = 0;
    for (let i = 0; i < combined.columns.length; i++) {
      if (skip > 0) { skip--; continue; }
      const col = combined.columns[i];
      const val = row[col] ?? '';
      if (i === 0 && ns.isPredictorHeaderRow(val)) {
        let colspan = 1;
        for (let j = i + 1; j < combined.columns.length; j++) {
          // `?? ''` mirrors the cell read above: a row built before a later analysis introduced
          // this column has no key for it, and that absence means "empty", not "content". Without
          // the coalesce the scan stops short and the header row splits into a shorter colspan
          // plus stray empty cells — same width, but an inconsistent rule between header rows.
          const nextVal = row[combined.columns[j]] ?? '';
          if (nextVal !== '') break;
          colspan++;
        }
        html += `<td colspan="${colspan}">${val}</td>`;
        skip = colspan - 1;
      } else {
        html += `<td>${val}</td>`;
      }
    }
    html += `</tr>`;
  });
  html += `</tbody>`;
  const legendSegments = [];
  if (combined.test_legend?.length) {
    const parts = combined.test_legend.map(t => `${t.symbol} <i>${t.method}</i>`);
    legendSegments.push(parts.join('; '));
  }
  if (combined.posthoc_legend?.length) legendSegments.push(...combined.posthoc_legend);
  const residualGreater = translate('table.legends.residualGreater', lang);
  const residualGreaterSymbol = translate('table.legends.residualGreaterSymbol', lang);
  const residualLower = translate('table.legends.residualLower', lang);
  const residualLowerSymbol = translate('table.legends.residualLowerSymbol', lang);
  const symbolSegments = [];
  if (combined.resid_symbol_greater_used) symbolSegments.push(`${residualGreaterSymbol} ${residualGreater}`);
  if (combined.resid_symbol_lower_used) symbolSegments.push(`${residualLowerSymbol} ${residualLower}`);
  if (symbolSegments.length) legendSegments.push(symbolSegments.join('; '));
  if (combined.percent_by === 'col') legendSegments.push(translate('table.legends.percentByColumn', lang));
  else if (combined.percent_by === 'row') legendSegments.push(translate('table.legends.percentByRow', lang));
  else if (combined.percent_by === 'total') legendSegments.push(translate('table.legends.percentByTotal', lang));
  if (combined.percent_total_full) legendSegments.push(translate('table.legends.percentTotalFull', lang));
  let footerText = '';
  // No "Legend:" prefix — the footer's position under the table and the content itself already
  // identify it, so the word is pure overhead.
  if (legendSegments.length > 0) {
    footerText = `${legendSegments.join('; ')}.`;
  }
  if (typeof footerFree === 'string') {
    const trimmed = footerFree.trim();
    if (trimmed) {
      const punctuated = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
      footerText = footerText ? `${footerText} ${punctuated}` : punctuated;
    }
  }
  if (footerText) {
    html += `<tfoot><tr><td colspan="${combined.columns.length}" style="text-align:left;">${footerText}</td></tr></tfoot>`;
  }
  html += `</table>`;
  if (!wrap) return html;
  return `<!DOCTYPE html>
  <html>
  <head><meta charset='utf-8'><title>${resolvedTitle}</title></head>
  <body>
  <div class='styled-table'>
  <h4>${resolvedTitle}</h4>
  ${html}
  </div>
  </body>
  </html>`;
};

/**
 * Detects if string is a predictor header row (<b>...</b>).
 * @param {unknown} val
 * @returns {boolean}
 */
ns.isPredictorHeaderRow = function (val) { if (typeof val !== 'string') return false; return /^<b(?:\s[^>]*)?>.+<\/b>$/.test(val.trim()); };

/**
 * Detects rows emitted by combineAnalysisAsSingleTable for warning entries (e.g., paired
 * rejection, l × l without subset, multi-DB missing response). Such rows carry the
 * warning string in `_warning_text` and otherwise have all columns blank.
 * @param {Record<string, any>} row
 * @returns {boolean}
 */
ns.isWarningRow = function (row) { return !!(row && typeof row._warning_text === 'string' && row._warning_text.length > 0); };

/**
 * Render chart-mode analysis results as a responsive HTML grid. Each entry with a `chart`
 * field becomes a `<div class="statz-chart" data-spec="…">` placeholder; entries with
 * `table.warning` are rendered as a flagged amber banner. The browser-side `Statz.renderCharts`
 * helper (see core/loader.js) sweeps the grid and invokes `Plotly.newPlot` per cell.
 *
 * @param {{ analysis: Array<{ predictor?: string|null, response?: string|null, chart?: { type:string, spec:any }, table?: { warning?: string } }>, lang?: string, chart_options?: { show_title?: boolean } }} resultObj
 * @param {string=} title Optional document title (used only when `wrap=true`).
 * @param {boolean=} wrap When true, emit a full HTML document; otherwise emit the grid fragment.
 * @param {string=} footerFree Optional user-provided footer suffix (parity with exportCombinedAsHTML).
 * @returns {string}
 */
ns.exportCombinedAsChartHTML = function (resultObj, title, wrap = false, footerFree = '') {
  if (!resultObj || !Array.isArray(resultObj.analysis)) return '';
  const lang = normalizeLanguage(resultObj?.lang);
  const resolvedTitle = title ?? translate('table.title', lang);
  // Main-title visibility for regular chart cells (warning cells ALWAYS keep their
  // heading — it's the only way for the user to identify which analysis was rejected).
  // Defaults to true when the flag is absent so legacy result payloads (pre-toggle)
  // still render titles.
  const showChartTitle = resultObj?.chart_options?.show_title !== false;
  const escapeText = escapeHtml;

  const cells = [];
  for (const entry of resultObj.analysis) {
    const heading = entry?.predictor ?? entry?.response ?? '—';
    if (entry?.table?.warning) {
      cells.push(`<div class="statz-chart-cell statz-chart-cell--warning"><div class="statz-chart-title">${escapeText(heading)}</div><div class="statz-warning">⚠ ${escapeText(entry.table.warning)}</div></div>`);
      continue;
    }
    if (entry?.chart?.spec) {
      const specAttr = escapeAttr(JSON.stringify(entry.chart.spec));
      const titleHtml = showChartTitle
        ? `<div class="statz-chart-title">${escapeText(heading)}</div>`
        : '';
      cells.push(`<div class="statz-chart-cell">${titleHtml}<div class="statz-chart" data-spec="${specAttr}"></div></div>`);
    }
  }

  const styles = `<style>
.statz-chart-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;font-family:Arial,sans-serif;}
@media (max-width:768px){.statz-chart-grid{grid-template-columns:1fr;}}
.statz-chart-cell{background:#ffffff;border:1px solid rgba(48,50,61,0.10);border-radius:6px;padding:12px;display:flex;flex-direction:column;}
.statz-chart-cell--warning{background:transparent;border-color:rgba(133,100,4,0.25);}
/* Trailing-odd cell (1 chart total, or 3rd/5th/7th trailing an odd count): span both columns
   and center at the sibling column width — eliminates the empty right cell without making
   the trailing chart visibly larger than its siblings. Mobile (1-col) resets max-width. */
.statz-chart-cell:last-child:nth-child(odd){grid-column:1 / -1;justify-self:center;max-width:calc(50% - 8px);width:100%;}
@media (max-width:768px){.statz-chart-cell:last-child:nth-child(odd){max-width:none;}}
.statz-chart-title{font-weight:600;font-size:13px;color:#30323d;margin:0 0 8px;text-align:center;}
/* Fixed height (not min-height): Plotly's default fallback of 700x450 kicks in when
   newPlot runs on a container with clientWidth=0 (page-load race before layout settles);
   without an upper cap the SVG grows the flex parent to 450px and ResizeObserver locks
   it there forever. A fixed height also gives Plotly enough top margin for X-axis /
   category labels that get cropped at 320. 400px is a good balance — labels fit, no
   wasted vertical space. */
.statz-chart{height:400px;width:100%;}
.statz-warning{background:#fff8e1;color:#856404;padding:10px 14px;border-radius:4px;font-size:13px;}
.statz-chart-footer{margin-top:12px;font-size:12px;color:#666;text-align:left;}
</style>`;

  let footerHtml = '';
  if (typeof footerFree === 'string') {
    const trimmed = footerFree.trim();
    if (trimmed) {
      const punctuated = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
      footerHtml = `<div class="statz-chart-footer">${escapeText(punctuated)}</div>`;
    }
  }

  // Rendering is driven by the MutationObserver installed by `startAutoRender()` (see
  // core/loader.js), which is auto-invoked at the end of `initDeps()`. Any `.statz-chart`
  // reaching the DOM — via Bubble's innerHTML mount, popup open, framework hydration —
  // is swept and rendered. No inline <script> emitted here: browsers don't execute
  // scripts injected via innerHTML (HTML security rule), and the MutationObserver path
  // covers every mount pattern uniformly.
  const grid = `<div class="statz-chart-grid">${cells.join('')}</div>${footerHtml}`;
  const html = `${styles}${grid}`;
  if (!wrap) return html;
  return `<!DOCTYPE html>
  <html>
  <head><meta charset='utf-8'><title>${escapeText(resolvedTitle)}</title></head>
  <body>
  <div class='styled-chart'>
  <h4>${escapeText(resolvedTitle)}</h4>
  ${html}
  </div>
  </body>
  </html>`;
};

/**
 * Render combined table as Markdown (with legend).
 * @param {{ columns: string[], rows: Array<Record<string, string>>, test_legend?: Array<{ method: string, symbol: string }>, posthoc_legend?: string[], resid_symbol_greater_used?: boolean, resid_symbol_lower_used?: boolean, lang?: string, percent_by?: string, percent_total_full?: boolean }} combined
 * @param {string=} title
 * @returns {string}
 */
ns.exportCombinedAsMarkdown = function (combined, title) {
  if (!combined || !combined.columns || !combined.rows) return '';
  const langCandidate = combined?.lang;
  const lang = normalizeLanguage(langCandidate);
  const resolvedTitle = title ?? translate('table.title', lang);
  const header = combined.columns;
  const separator = header.map(() => '---').join(' | ');
  const rows = combined.rows.map(row => header.map(col => row[col] ?? '').join(' | '));
  const md = [`**${resolvedTitle}**`, `\n\n| ${header.join(' | ')} |`, `| ${separator} |`, ...rows.map(r => `| ${r} |`)];
  const legendLines = [];
  if (combined.test_legend?.length) legendLines.push(...combined.test_legend.map(t => `- ${t.symbol}: ${t.method}`));
  if (combined.resid_symbol_greater_used) legendLines.push(`- ${translate('table.legends.residualGreaterSymbol', lang)} ${translate('table.legends.residualGreater', lang)}`);
  if (combined.resid_symbol_lower_used) legendLines.push(`- ${translate('table.legends.residualLowerSymbol', lang)} ${translate('table.legends.residualLower', lang)}`);
  if (combined.posthoc_legend?.length) combined.posthoc_legend.forEach(leg => legendLines.push(`- ${leg}`));
  if (combined.percent_by === 'col') legendLines.push(`- ${translate('table.legends.percentByColumn', lang)}`);
  else if (combined.percent_by === 'row') legendLines.push(`- ${translate('table.legends.percentByRow', lang)}`);
  else if (combined.percent_by === 'total') legendLines.push(`- ${translate('table.legends.percentByTotal', lang)}`);
  if (combined.percent_total_full) legendLines.push(`- ${translate('table.legends.percentTotalFull', lang)}`);
  if (legendLines.length > 0) {
    // Blank line instead of a "Legend:" heading — the bullets speak for themselves.
    md.push('');
    md.push(...legendLines);
  }
  return md.join('\n');
};

/**
 * Map combined rows into Bubble-friendly items (title + single-row table).
 * @param {{ columns: string[], rows: Array<Record<string, string>> }} combined
 * @returns {Array<{ title: string, columns: string[], rows: Array<Record<string, string>> }>}
 */
ns.exportCombinedAsRows = function (combined) {
  if (!combined || !combined.columns || !combined.rows) return [];
  const firstColumn = combined.columns[0];
  return combined.rows.map(row => {
    const base = firstColumn ? row[firstColumn] : '';
    const title = typeof base === 'string' ? base.replace(/<[^>]+>/g, '') : '';
    return { title, columns: combined.columns, rows: [row] };
  });
};

/**
 * Render a database payload into a plain HTML table string for quick viewing.
 * Decodes column values, builds row-wise data, and emits HTML (with lightweight styles by default).
 * @param {{ columns?: Array<Record<string, any>> }} db
 * @param {{ maxRows?: number, includeStyles?: boolean, includeRowIndex?: boolean, showDeletedColumns?: boolean, showVariants?: boolean, applyProcessing?: boolean, includeTitles?: boolean, titleThreshold?: number }=} options
 *   `maxRows` defaults to 200; pass **`0` for every row**.
 * @returns {string}
 */
ns.exportDatabaseAsHTML = function (db, options = {}) {
  if (!db || !Array.isArray(db.columns) || db.columns.length === 0) return '';
  const limit = parseMaxOption(options.maxRows, 200); // 0 = every row
  const includeStyles = options.includeStyles !== false;
  const includeRowIndex = options.includeRowIndex !== false; // default true
  const includeTitles = options.includeTitles !== false; // default true
  const titleThresholdRaw = Number(options.titleThreshold);
  // Default 40: derived from monospace 11px × ~6.6px/char fitting in 300px - 16px padding ≈ 43 chars.
  const titleThreshold = Number.isFinite(titleThresholdRaw) && titleThresholdRaw >= 0 ? Math.floor(titleThresholdRaw) : 40;
  /**
   * @param {unknown} rawVal
   * @param {'td'|'th'} tag
   * @param {string=} attrs
   */
  const renderCell = (rawVal, tag, attrs = '') => {
    const str = String(rawVal ?? '');
    const content = escapeHtml(str);
    if (includeTitles && str.length > titleThreshold) {
      return `<${tag}${attrs} title="${escapeAttr(str)}">${content}</${tag}>`;
    }
    return `<${tag}${attrs}>${content}</${tag}>`;
  };

  const decodedCols = collectDecodedColumns(/** @type {any} */ (db), options);

  if (decodedCols.length === 0) return '';
  const nRows = Math.max(...decodedCols.map(c => c.values.length), 0);
  const rows = [];
  const rowCount = Math.min(nRows, limit);
  for (let i = 0; i < rowCount; i++) {
    /** @type {Record<string, any>} */
    const row = {};
    if (includeRowIndex) row['#'] = i + 1;
    // Store RAW values; renderCell escapes on emit and decides about the title attribute.
    decodedCols.forEach(c => { row[c.label] = c.values[i] ?? ''; });
    rows.push(row);
  }

  const columns = includeRowIndex
    ? [{ rawLabel: '#', label: '#', isDeleted: false, isVariant: false }, ...decodedCols.map(c => ({ rawLabel: c.rawLabel, label: c.label, isDeleted: c.isDeleted, isVariant: c.isVariant }))]
    : decodedCols.map(c => ({ rawLabel: c.rawLabel, label: c.label, isDeleted: c.isDeleted, isVariant: c.isVariant }));
  const thead = `<thead><tr>${columns.map(col => {
    let style = '';
    if (col.isDeleted) style = ' style="color:#ca1551;"';
    else if (col.isVariant) style = ' style="color:#198f51; font-style:italic"';
    return renderCell(col.rawLabel, 'th', style);
  }).join('')}</tr></thead>`;
  const colLabels = columns.map(c => c.label);
  const tbody = `<tbody>${rows.map((row, i) => `<tr${i == 0 ? ' id="statz-database-row1"' : ""}>${colLabels.map(col => renderCell(row[col], 'td')).join('')}</tr>`).join('')}</tbody>`;
  const tableHTML = `<table class="statz-viewer">${thead}${tbody}</table>`;
  if (!includeStyles) return tableHTML;
  return `<style>
    .statz-viewer-wrap { max-width: 100%; overflow: auto; }
    .statz-viewer { border-collapse: collapse; width: 100%; font-family: 'SF Mono', 'Consolas', 'Monaco', monospace; color: #30323d; background: transparent; border: 1px solid rgba(48,50,61,0.15); }
    .statz-viewer th, .statz-viewer td { border: 1px solid rgba(48,50,61,0.15); padding: 6px 8px; text-align: left; background: transparent; }
    .statz-viewer tbody tr:hover { background: #d9d9d9; }
    .statz-viewer thead th { position: sticky; top: 0; z-index: 2; font-weight: bold; background: transparent; }
  </style>
  <div class="statz-viewer-wrap">
    ${tableHTML}
  </div>`;
};

/**
 * @typedef {Object} MissingMapColumn
 * @property {string} hash
 * @property {string} rawLabel Unescaped label; the renderer escapes on emit.
 * @property {boolean} isDeleted
 * @property {boolean} isVariant
 * @property {number} nMissing Count over the padded length (= nRows).
 * @property {number} pctMissing 0–100.
 * @property {number[]} bins Missing count per bin; `bins.length === nBins`.
 */

/**
 * @typedef {Object} MissingMap
 * @property {string|null} title Null when the caller passed no title; the renderer then emits no caption.
 * @property {string} lang
 * @property {number} nRows Longest column; shorter columns are padded (padding counts as missing).
 * @property {number} nBins
 * @property {number} binWidth Observations per bin (1 when `nRows <= maxBins`).
 * @property {Array<{index: number, pct: number}>} ticks Axis ticks; `pct` is 0–100.
 * @property {MissingMapColumn[]} columns
 */

/**
 * Pick "nice" observation indices for the bottom axis: steps of 1/2/5 × 10^k targeting ~6 ticks,
 * always including the first and last observation. `pct` is the CENTRE of the observation, which
 * is where that observation's flex span sits inside the strip.
 * @param {number} nRows
 * @returns {Array<{index: number, pct: number}>}
 */
const missmapTicks = (nRows) => {
  if (!(nRows > 0)) return [];
  /** @param {number} index */
  const toTick = (index) => ({ index, pct: ((index - 0.5) / nRows) * 100 });
  if (nRows === 1) return [toTick(1)];
  const raw = nRows / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const indices = [1];
  for (let v = step; v < nRows; v += step) {
    const rounded = Math.round(v);
    // Drop candidates that would collide with the first or crowd the last label.
    if (rounded > 1 && (nRows - rounded) > step * 0.4) indices.push(rounded);
  }
  indices.push(nRows);
  return indices.map(toTick);
};

/**
 * Build the data behind a missing-data map (the JS analog of R `DescTools::PlotMiss`).
 * One entry per column/variant; each entry carries per-bin missing counts so the renderer can
 * draw a raster at any width without re-walking the values.
 *
 * Missingness is evaluated on the RESOLVED view — `meta.replacements` + `meta.processing` applied,
 * exactly what `runAnalysis` sees. So `excluded_values` count as missing, and a column with
 * `na_action: 'label'` reports NO missing data, because the user chose to turn those rows into a
 * real category. Pass `applyProcessing: false` to inspect the original, unedited import instead.
 *
 * `maxBins` reduces the raster RESOLUTION; unlike `maxRows` in `exportDatabaseAsHTML` it never
 * truncates — every observation always falls inside some bin. Defaults to 300; pass **`0`** for one
 * bin per observation (full resolution).
 *
 * @param {{ columns?: Array<Record<string, any>> }} db
 * @param {{ title?: string, lang?: string, showDeletedColumns?: boolean, showVariants?: boolean, applyProcessing?: boolean, maxBins?: number }=} options
 *   `title` has NO default: when absent or blank it stays null and the renderer emits no caption,
 *   so the host page is free to show the database name wherever it likes (same contract as
 *   `exportDatabaseAsHTML`, which never invents a table title either).
 * @returns {MissingMap|null} Null for an unusable payload (no columns, or no observations).
 */
ns.buildMissingMap = function (db, options = {}) {
  if (!db || !Array.isArray(db.columns) || db.columns.length === 0) return null;
  const lang = normalizeLanguage(options.lang);
  const title = typeof options.title === 'string' && options.title.trim() !== '' ? options.title : null;
  const maxBins = parseMaxOption(options.maxBins, 300); // 0 = one bin per observation

  const decodedCols = collectDecodedColumns(/** @type {any} */ (db), options);
  if (decodedCols.length === 0) return null;

  const nRows = Math.max(...decodedCols.map(c => c.values.length), 0);
  if (nRows === 0) return null;

  const binWidth = Math.max(1, Math.ceil(nRows / maxBins));
  const nBins = Math.ceil(nRows / binWidth);

  /** @type {MissingMapColumn[]} */
  const columns = decodedCols.map(col => {
    const bins = new Array(nBins).fill(0);
    let nMissing = 0;
    for (let i = 0; i < nRows; i++) {
      // Columns shorter than nRows are padded, and the padding counts as missing.
      if (!factors.isMissingValue(col.values[i], col.colType, col.colSep)) continue;
      nMissing++;
      bins[Math.floor(i / binWidth)]++;
    }
    return {
      hash: col.hash,
      rawLabel: col.rawLabel,
      isDeleted: col.isDeleted,
      isVariant: col.isVariant,
      nMissing,
      pctMissing: (nMissing / nRows) * 100,
      bins
    };
  });

  return { title, lang, nRows, nBins, binWidth, ticks: missmapTicks(nRows), columns };
};

/**
 * Render a missing-data map as a self-contained, script-free HTML string (safe for `innerHTML`).
 * Rows are variables — name at the left (ellipsized), missing count at the right — and the bottom
 * axis indexes the observations, mirroring R `DescTools::PlotMiss`.
 *
 * `options.title` (usually the database name) is rendered as a centred `<caption>`. Omit it and no
 * caption is emitted at all — there is no default title, matching `exportDatabaseAsHTML`.
 *
 * Each row's raster is ONE table cell holding a flex strip whose `<span>` children are
 * run-length-encoded: consecutive stretches with the same state collapse into a single span
 * weighted by the number of observations it covers. That keeps the output small (and free of the
 * uneven column widths you get from hundreds of sibling table cells). A bin is marked when ANY
 * observation inside it is missing, so nothing ever disappears at low resolution.
 *
 * @param {{ columns?: Array<Record<string, any>> }} db
 * @param {{ title?: string, lang?: string, includeStyles?: boolean, includeTitles?: boolean, showDeletedColumns?: boolean, showVariants?: boolean, applyProcessing?: boolean, maxBins?: number, showPercent?: boolean, missingColor?: string, presentColor?: string, nameWidth?: number, rowHeight?: number }=} options
 * @returns {string} Empty string for an unusable payload.
 */
ns.exportMissingMapAsHTML = function (db, options = {}) {
  const map = ns.buildMissingMap(db, options);
  if (!map) return '';
  const lang = map.lang;
  const includeStyles = options.includeStyles !== false; // default true
  const includeTitles = options.includeTitles !== false; // default true
  const showPercent = options.showPercent !== false; // default true
  const missingColor = typeof options.missingColor === 'string' && options.missingColor ? options.missingColor : '#ca1551';
  const presentColor = typeof options.presentColor === 'string' && options.presentColor ? options.presentColor : '#e8e9f3';
  const nameWidthRaw = Number(options.nameWidth);
  const nameWidth = Number.isFinite(nameWidthRaw) && nameWidthRaw > 0 ? Math.floor(nameWidthRaw) : 180;
  const rowHeightRaw = Number(options.rowHeight);
  const rowHeight = Number.isFinite(rowHeightRaw) && rowHeightRaw > 0 ? Math.floor(rowHeightRaw) : 14;
  const { nRows, nBins, binWidth } = map;

  /** @param {number} v */
  const pct1 = (v) => formatNumberLocale(v, 1, lang);

  /**
   * Run-length-encode a column's bins into flex-weighted spans. The weight is the observation
   * count the run covers, so every strip sums to exactly `nRows` and stays aligned with the axis.
   * @param {MissingMapColumn} col
   * @returns {string}
   */
  const renderStrip = (col) => {
    if (col.nMissing === 0) return '<div class="statz-missmap-strip"></div>';
    /** @type {string[]} */
    const spans = [];
    let runStart = 0;
    let runHasMissing = col.bins[0] > 0;
    /** @param {number} endBin Exclusive. */
    const flush = (endBin) => {
      // The last bin may be short when nRows is not a multiple of binWidth.
      const firstObs = runStart * binWidth;
      const lastObs = Math.min(endBin * binWidth, nRows);
      const weight = lastObs - firstObs;
      if (weight <= 0) return;
      if (!runHasMissing) {
        spans.push(`<span style="flex:${weight}"></span>`);
        return;
      }
      let attrs = ` class="statz-missmap-m" style="flex:${weight}"`;
      if (includeTitles) {
        const range = firstObs + 1 === lastObs ? String(lastObs) : `${firstObs + 1}–${lastObs}`;
        if (binWidth === 1) {
          // Every observation in the run is missing, so a count would add nothing.
          attrs += ` title="${escapeAttr(translate('table.missmap.cellTitleFull', lang, { range }))}"`;
        } else {
          // Binned: the mark only means "at least one missing here", so report the real count.
          let nMissingRun = 0;
          for (let b = runStart; b < endBin; b++) nMissingRun += col.bins[b];
          attrs += ` title="${escapeAttr(translate('table.missmap.cellTitle', lang, { range, count: nMissingRun, percent: pct1((nMissingRun / weight) * 100) }))}"`;
        }
      }
      spans.push(`<span${attrs}></span>`);
    };
    for (let b = 1; b < nBins; b++) {
      const hasMissing = col.bins[b] > 0;
      if (hasMissing === runHasMissing) continue;
      flush(b);
      runStart = b;
      runHasMissing = hasMissing;
    }
    flush(nBins);
    return `<div class="statz-missmap-strip">${spans.join('')}</div>`;
  };

  const bodyRows = map.columns.map(col => {
    let nameClass = 'statz-missmap-name';
    if (col.isDeleted) nameClass += ' statz-missmap-name--del';
    else if (col.isVariant) nameClass += ' statz-missmap-name--var';
    // Emitted unconditionally (under includeTitles): with a fixed-width name column the
    // truncation point is a pixel fact, so a character threshold would be wrong either way.
    const nameTitle = includeTitles ? ` title="${escapeAttr(col.rawLabel)}"` : '';
    const count = showPercent ? `${col.nMissing} (${pct1(col.pctMissing)}%)` : String(col.nMissing);
    return `<tr><th scope="row"><div class="${nameClass}"${nameTitle}>${escapeHtml(col.rawLabel)}</div></th>`
      + `<td class="statz-missmap-grid">${renderStrip(col)}</td>`
      + `<td class="statz-missmap-num">${count}</td></tr>`;
  }).join('');

  const axisTicks = map.ticks.map((tick, i) => {
    // First and last labels are clamped to the strip edges instead of centred, so they never
    // overflow the axis box.
    if (i === 0) return `<span class="statz-missmap-t0">${tick.index}</span>`;
    if (i === map.ticks.length - 1) return `<span class="statz-missmap-t1">${tick.index}</span>`;
    return `<span style="left:${tick.pct.toFixed(2)}%">${tick.index}</span>`;
  }).join('');

  // No title → no <caption> at all, so the page can show the database name wherever it likes.
  const caption = map.title === null ? '' : `<caption>${escapeHtml(map.title)}</caption>`;
  const tableHTML = `<table class="statz-missmap">`
    + caption
    + `<colgroup><col class="statz-missmap-cname" style="width:${nameWidth}px"><col><col class="statz-missmap-cnum"></colgroup>`
    + `<thead><tr><th class="statz-missmap-hname">${escapeHtml(translate('table.columns.variable', lang))}</th>`
    + `<th class="statz-missmap-grid"></th>`
    + `<th class="statz-missmap-hnum">${escapeHtml(translate('table.missmap.missingHeader', lang))}</th></tr></thead>`
    + `<tbody>${bodyRows}</tbody>`
    + `<tfoot><tr><td class="statz-missmap-nlab">n = ${nRows}</td>`
    + `<td class="statz-missmap-grid"><div class="statz-missmap-axis">${axisTicks}</div></td><td></td></tr></tfoot>`
    + `</table>`;

  if (!includeStyles) return `<div class="statz-missmap-wrap">${tableHTML}</div>`;
  // No inline <script>: browsers strip scripts injected via innerHTML, and this widget is static.
  return `<style>
.statz-missmap-wrap{max-width:100%;overflow-x:auto;font-family:'SF Mono','Consolas','Monaco',monospace;color:#30323d;}
.statz-missmap{border-collapse:collapse;table-layout:fixed;width:100%;min-width:420px;background:transparent;}
.statz-missmap caption{caption-side:top;text-align:center;font-weight:bold;font-size:14px;padding:0 0 10px;color:#30323d;}
.statz-missmap col.statz-missmap-cnum{width:96px;}
.statz-missmap th,.statz-missmap td{border:0;padding:0 8px;background:transparent;vertical-align:middle;}
.statz-missmap thead th{font-size:11px;padding-bottom:6px;border-bottom:1px solid rgba(48,50,61,0.15);}
.statz-missmap thead th.statz-missmap-hname{text-align:left;}
.statz-missmap thead th.statz-missmap-hnum{text-align:right;}
/* Zero HORIZONTAL padding on the raster column: the strip's flex weights and the axis's
   left:% offsets must resolve against the exact same content box to stay aligned. */
.statz-missmap td.statz-missmap-grid,.statz-missmap th.statz-missmap-grid{padding:2px 0;}
.statz-missmap-name{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;font-weight:440;text-align:left;}
.statz-missmap-name--del{color:${missingColor};text-decoration:line-through;}
.statz-missmap-name--var{color:#198f51;font-style:italic;}
.statz-missmap-num{text-align:right;font-size:11px;white-space:nowrap;font-weight:440;}
.statz-missmap-strip{display:flex;width:100%;height:${rowHeight}px;overflow:hidden;background:${presentColor};}
/* flex-basis 0 makes each span's width proportional to its inline flex-grow, which the renderer
   sets to the number of observations the run covers. No min-width here: with a 0 basis
   flex-shrink is inert, so any min-width would overflow the strip and silently clip the
   right-hand observations. Visibility of thin marks comes from the 0.5 opacity floor instead. */
.statz-missmap-strip>span{flex:1 1 0;display:block;}
.statz-missmap-strip>span.statz-missmap-m{background:${missingColor};}
.statz-missmap tbody tr:hover .statz-missmap-strip{outline:1px solid rgba(48,50,61,0.35);}
.statz-missmap-axis{position:relative;height:16px;margin-top:4px;border-top:1px solid rgba(48,50,61,0.15);font-size:10px;color:#666;}
.statz-missmap-axis>span{position:absolute;top:3px;transform:translateX(-50%);white-space:nowrap;}
.statz-missmap-axis>span.statz-missmap-t0{left:0;transform:none;}
.statz-missmap-axis>span.statz-missmap-t1{right:0;left:auto;transform:none;}
.statz-missmap-nlab{font-size:10px;color:#666;white-space:nowrap;text-align:left;}
</style>
<div class="statz-missmap-wrap">${tableHTML}</div>`;
};

/**
 * The axis keys a single value contributes to. For `'l'` the value is split into its items and
 * DEDUPED: the crosstab counts record presence, so `"a;a"` must increment its cell once.
 * Deliberately diverges from `summarize_l` (driver.js), which counts item occurrences.
 * @param {unknown} raw
 * @param {'q'|'n'|'l'} colType
 * @param {string} colSep
 * @returns {string[]}
 */
const crosstabKeys = (raw, colType, colSep) => {
  if (colType !== 'l') return [String(raw).trim()];
  return [...new Set(String(raw).split(colSep || ';').map(s => s.trim()).filter(Boolean))];
};

/**
 * Compare two numeric level labels by VALUE. R's `factor()` on a numeric vector sorts numerically,
 * so `xtabs` shows 1, 2, 10 — a lexicographic sort would show 1, 10, 2.
 * Present-but-unparseable labels sort last. The `localeCompare` tie-break matters: `"1"`, `"1.0"`
 * and `"01"` are distinct levels with equal numeric value, and without it their order would be
 * whatever the engine's stable sort happened to produce.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
const compareNumericLevels = (a, b) => {
  const na = Number.parseFloat(variants.sanitizeNumericString(String(a ?? '').trim()));
  const nb = Number.parseFloat(variants.sanitizeNumericString(String(b ?? '').trim()));
  const aBad = !Number.isFinite(na);
  const bBad = !Number.isFinite(nb);
  if (aBad && bBad) return a.localeCompare(b);
  if (aBad) return 1;
  if (bBad) return -1;
  return (na - nb) || a.localeCompare(b);
};

/**
 * Keep only the `maxLevels` most frequent levels, then restore canonical order — the cap changes
 * WHICH levels appear, never their order. Ties are broken by canonical rank (keep the earlier
 * level) so the result is deterministic rather than engine-dependent.
 * @param {string[]} levels Canonical order.
 * @param {Map<string, number>} freq Level → number of records carrying it.
 * @param {number} maxLevels `Infinity` (from `maxLevels: 0`) keeps every level.
 * @returns {string[]}
 */
const capLevels = (levels, freq, maxLevels) => {
  if (levels.length <= maxLevels) return levels;
  const rank = new Map(levels.map((lvl, i) => [lvl, i]));
  return [...levels]
    .sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0) || (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
    .slice(0, maxLevels)
    .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
};

/**
 * @typedef {Object} CrosstabAxis
 * @property {string} hash
 * @property {number|null} varIndex Resolved index (null = base column). Differs from the requested
 *   one when a blank/stale/out-of-range index fell back to the base column.
 * @property {string} label Unescaped; the renderer escapes on emit.
 * @property {'q'|'n'|'l'} colType
 * @property {string[]} levels Post-cap, in canonical order.
 * @property {number} nLevelsTotal Pre-cap count. `levels.length < nLevelsTotal` ⇒ truncated.
 */

/**
 * @typedef {Object} Crosstab
 * @property {string|null} title Null when the caller passed none; the renderer emits no caption.
 * @property {string} lang
 * @property {CrosstabAxis} row
 * @property {CrosstabAxis} col
 * @property {number[][]} counts `counts[rowLevel][colLevel]`. Cells only — no margins; sum them if
 *   you need totals.
 * @property {number} nRows Longest of the two value arrays.
 * @property {number} nCompared Records with BOTH sides present. `nCompared + nExcluded === nRows`.
 * @property {number} nExcluded Records dropped for missingness on either side.
 * @property {boolean} isMultiResponse True when either axis is `'l'`: a record is then counted in
 *   every cell its items reach, so the cells sum to more than `nCompared`.
 */

/**
 * Build a counts-only contingency table between two variables/variants of the same database —
 * the JS analog of R's `xtabs()`, for exploratory preview.
 *
 * NO inferential statistics: no χ², no p-value, no percentages, no effect sizes. Use `runAnalysis`
 * for those; this helper exists so the user can look at a cross-tabulation before deciding what to
 * test.
 *
 * Both variables are read through `factors.resolveVariable`, i.e. on the RESOLVED view
 * (`meta.replacements` + `meta.processing` applied) — the same data `runAnalysis` sees, so the
 * counts agree with it. `applyProcessing: false` inspects the original import instead.
 *
 * Level order per type:
 *  - `q` — factor order from `col_values.labels`, keeping declared-but-unused levels as zero rows
 *    (faithful to `factor()`); alphabetical when the column is not factor-compacted.
 *  - `n` — numeric, because that is what R's `factor()` does. `"1"` and `"1.0"` deliberately stay
 *    DISTINCT levels: values arrive as strings from the import, and a preview whose job is to
 *    surface data quality must show that both spellings exist.
 *  - `l` — split into items, alphabetical, OBSERVED items only (an `l` vocabulary's label order is
 *    import first-appearance order, i.e. arbitrary; `summarize_l` also reports observed items only).
 *
 * Records are compared COMPLETE-CASE: a record whose value is missing on either axis is dropped
 * from every cell and counted in `nExcluded`. `l` axes count presence only, which makes `l × l` a
 * single co-occurrence matrix — so unlike `summarize_l_l` this needs no `subset_items` constraint.
 *
 * @param {{ columns?: Array<Record<string, any>> }} db
 * @param {string} rowHash `col_hash` of the row variable.
 * @param {number|string|null|undefined} rowVarIndex Variant index, or blank for the base column.
 * @param {string} colHash `col_hash` of the column variable.
 * @param {number|string|null|undefined} colVarIndex Variant index, or blank for the base column.
 * @param {{ title?: string, lang?: string, applyProcessing?: boolean, maxLevels?: number }=} options
 *   `maxLevels` defaults to 100 per axis; pass **`0`** to keep every level.
 * @returns {Crosstab|null} Null when the payload is unusable: no `db.columns`, either hash unknown,
 *   or either axis yielding zero levels.
 */
ns.buildCrosstab = function (db, rowHash, rowVarIndex, colHash, colVarIndex, options = {}) {
  if (!db || !Array.isArray(db.columns) || db.columns.length === 0) return null;
  const lang = normalizeLanguage(options.lang);
  const title = typeof options.title === 'string' && options.title.trim() !== '' ? options.title : null;
  const maxLevels = parseMaxOption(options.maxLevels, 100); // 0 = keep every level
  const resolveOpts = { applyProcessing: options.applyProcessing !== false };

  const rowVar = factors.resolveVariable(db, rowHash, rowVarIndex, resolveOpts);
  const colVar = factors.resolveVariable(db, colHash, colVarIndex, resolveOpts);
  if (!rowVar || !colVar) return null;

  const rowValues = rowVar.values;
  const colValues = colVar.values;
  const nRows = Math.max(rowValues.length, colValues.length);

  // Pass 1: complete-case filter + per-level RECORD frequencies (which the cap needs) + level
  // discovery. Deriving the observed keys here rather than via getIndividualItems keeps levels and
  // counting keys in agreement by construction — getIndividualItems filters with `.filter(Boolean)`,
  // which would drop a genuine numeric 0 from the levels while it still got counted.
  /** @type {Map<string, number>} */
  const rowFreq = new Map();
  /** @type {Map<string, number>} */
  const colFreq = new Map();
  let nCompared = 0;
  let nExcluded = 0;
  for (let i = 0; i < nRows; i++) {
    // Beyond a short column's end the value is undefined → missing → excluded, matching
    // buildMissingMap's "padding counts as missing" so the two views agree.
    if (factors.isMissingValue(rowValues[i], rowVar.colType, rowVar.colSep)
      || factors.isMissingValue(colValues[i], colVar.colType, colVar.colSep)) {
      nExcluded++;
      continue;
    }
    nCompared++;
    for (const key of crosstabKeys(rowValues[i], rowVar.colType, rowVar.colSep)) rowFreq.set(key, (rowFreq.get(key) ?? 0) + 1);
    for (const key of crosstabKeys(colValues[i], colVar.colType, colVar.colSep)) colFreq.set(key, (colFreq.get(key) ?? 0) + 1);
  }

  /**
   * @param {{colType: 'q'|'n'|'l', colValues: any}} axis
   * @param {Map<string, number>} freq
   * @returns {string[]}
   */
  const orderLevels = (axis, freq) => {
    const observed = [...freq.keys()];
    if (axis.colType === 'n') return observed.sort(compareNumericLevels);
    if (axis.colType === 'l') return observed.sort((a, b) => a.localeCompare(b));
    // `q`: declared factor levels first (order === 'levels' only returns labels when the column is
    // compacted — otherwise getIndividualItems falls through to first-appearance order, hence the
    // explicit alphabetical sort here), then any observed value the labels don't declare.
    // Declared labels are trimmed and deduped so they match the counting keys: an untrimmed label
    // would otherwise render as a phantom zero row next to its own trimmed key.
    const declared = (axis.colValues?.col_compact && Array.isArray(axis.colValues?.labels))
      ? [...new Set(factors.getIndividualItems({ col_type: 'q', col_values: axis.colValues }, { order: 'levels' }).map(lvl => String(lvl).trim()))]
      : [];
    const declaredSet = new Set(declared);
    const extra = observed.filter(v => !declaredSet.has(v)).sort((a, b) => a.localeCompare(b));
    return declared.length ? [...declared, ...extra] : observed.sort((a, b) => a.localeCompare(b));
  };

  const rowLevelsAll = orderLevels(rowVar, rowFreq);
  const colLevelsAll = orderLevels(colVar, colFreq);
  if (rowLevelsAll.length === 0 || colLevelsAll.length === 0) return null;
  const rowLevels = capLevels(rowLevelsAll, rowFreq, maxLevels);
  const colLevels = capLevels(colLevelsAll, colFreq, maxLevels);

  const rowIdx = new Map(rowLevels.map((lvl, i) => [lvl, i]));
  const colIdx = new Map(colLevels.map((lvl, i) => [lvl, i]));

  // Pass 2: fill the matrix.
  const counts = rowLevels.map(() => new Array(colLevels.length).fill(0));
  for (let i = 0; i < nRows; i++) {
    if (factors.isMissingValue(rowValues[i], rowVar.colType, rowVar.colSep)
      || factors.isMissingValue(colValues[i], colVar.colType, colVar.colSep)) continue;
    for (const a of crosstabKeys(rowValues[i], rowVar.colType, rowVar.colSep)) {
      const ri = rowIdx.get(a);
      if (ri === undefined) continue; // level dropped by the cap
      for (const b of crosstabKeys(colValues[i], colVar.colType, colVar.colSep)) {
        const ci = colIdx.get(b);
        if (ci === undefined) continue;
        counts[ri][ci]++;
      }
    }
  }

  return {
    title,
    lang,
    row: { hash: rowHash, varIndex: rowVar.varIndex, label: rowVar.label, colType: rowVar.colType, levels: rowLevels, nLevelsTotal: rowLevelsAll.length },
    col: { hash: colHash, varIndex: colVar.varIndex, label: colVar.label, colType: colVar.colType, levels: colLevels, nLevelsTotal: colLevelsAll.length },
    counts,
    nRows,
    nCompared,
    nExcluded,
    isMultiResponse: rowVar.colType === 'l' || colVar.colType === 'l'
  };
};

/**
 * Render a counts-only contingency table as a self-contained, script-free HTML string (safe for
 * `innerHTML`). The two-row header names both variables, mirroring how `xtabs` prints its dimnames.
 *
 * Cells only — **no marginal totals**, like a plain `xtabs()` printout.
 *
 * `options.title` renders as a centred `<caption>`; omit it and no caption is emitted — there is no
 * default title, matching `exportDatabaseAsHTML` and `exportMissingMapAsHTML`.
 *
 * The level-truncation disclosure is the only footer content, and it is mandatory: 100 columns look
 * like a 100-level variable. `nExcluded` (complete-case deletion) and `isMultiResponse` are
 * deliberately NOT rendered either — same reasoning, they live on `buildCrosstab`'s return.
 *
 * @param {{ columns?: Array<Record<string, any>> }} db
 * @param {string} rowHash
 * @param {number|string|null|undefined} rowVarIndex
 * @param {string} colHash
 * @param {number|string|null|undefined} colVarIndex
 * @param {{ title?: string, lang?: string, includeStyles?: boolean, includeTitles?: boolean, applyProcessing?: boolean, maxLevels?: number }=} options
 * @returns {string} Empty string for an unusable payload.
 */
ns.exportCrosstabAsHTML = function (db, rowHash, rowVarIndex, colHash, colVarIndex, options = {}) {
  const ct = ns.buildCrosstab(db, rowHash, rowVarIndex, colHash, colVarIndex, options);
  if (!ct) return '';
  const lang = ct.lang;
  const includeStyles = options.includeStyles !== false; // default true
  const includeTitles = options.includeTitles !== false; // default true
  const nLevelCols = ct.col.levels.length;
  const nCols = 1 + nLevelCols;

  /** @param {string} text */
  const titleAttr = (text) => (includeTitles ? ` title="${escapeAttr(text)}"` : '');

  const headTop = `<tr><td class="statz-xtab-corner"></td>`
    + `<th class="statz-xtab-colvar" colspan="${nLevelCols}" scope="colgroup"${titleAttr(ct.col.label)}>${escapeHtml(ct.col.label)}</th>`
    + `</tr>`;
  const headBottom = `<tr><th class="statz-xtab-rowvar" scope="col"${titleAttr(ct.row.label)}>${escapeHtml(ct.row.label)}</th>`
    + ct.col.levels.map(lvl => `<th scope="col"${titleAttr(lvl)}>${escapeHtml(lvl)}</th>`).join('')
    + `</tr>`;

  const bodyRows = ct.row.levels.map((lvl, ri) => `<tr>`
    + `<th scope="row"${titleAttr(lvl)}>${escapeHtml(lvl)}</th>`
    + ct.counts[ri].map(count => `<td>${count}</td>`).join('')
    + `</tr>`).join('');

  // One segment per truncated axis, each naming its variable. This is the only footer content, so
  // when no axis was truncated the <tfoot> is omitted entirely.
  const noteSegments = [ct.row, ct.col]
    .filter(axis => axis.levels.length < axis.nLevelsTotal)
    .map(axis => translate('table.crosstab.noteTruncated', lang, { label: axis.label, shown: axis.levels.length, total: axis.nLevelsTotal }));
  const noteRow = noteSegments.length
    ? `<tr><td colspan="${nCols}" class="statz-xtab-note">${escapeHtml(`${noteSegments.join('; ')}.`)}</td></tr>`
    : '';

  const caption = ct.title === null ? '' : `<caption>${escapeHtml(ct.title)}</caption>`;
  const tableHTML = `<table class="statz-xtab">${caption}`
    + `<thead>${headTop}${headBottom}</thead>`
    + `<tbody>${bodyRows}</tbody>`
    + (noteRow ? `<tfoot>${noteRow}</tfoot>` : '')
    + `</table>`;

  if (!includeStyles) return `<div class="statz-xtab-wrap">${tableHTML}</div>`;
  // No inline <script>: browsers strip scripts injected via innerHTML, and this widget is static.
  return `<style>
.statz-xtab-wrap{max-width:100%;overflow:auto;font-family:Arial,sans-serif;color:#30323d;}
.statz-xtab{border-collapse:collapse;background:transparent;font-size:12px;}
.statz-xtab caption{caption-side:top;text-align:center;font-weight:bold;font-size:14px;padding:0 0 10px;color:#30323d;}
.statz-xtab th,.statz-xtab td{border:1px solid rgba(48,50,61,0.15);padding:4px 8px;background:transparent;text-align:right;white-space:nowrap;}
.statz-xtab thead th{font-weight:bold;text-align:center;}
/* Label columns read as text, not as numbers. */
.statz-xtab tbody th[scope=row],.statz-xtab th.statz-xtab-rowvar{text-align:left;}
/* The corner sits above the row-variable NAME, not above data: no box around nothing. */
.statz-xtab td.statz-xtab-corner{border:0;}
.statz-xtab tbody tr:hover{background:#d9d9d9;}
/* Level labels can be long; cap and ellipsize — the full text lives in the title attribute. */
.statz-xtab thead th,.statz-xtab tbody th[scope=row]{max-width:180px;overflow:hidden;text-overflow:ellipsis;}
.statz-xtab td.statz-xtab-note{text-align:left;font-size:12px;color:#666;border:0;padding:8px 0 0;white-space:normal;}
</style>
<div class="statz-xtab-wrap">${tableHTML}</div>`;
};

export default ns;
