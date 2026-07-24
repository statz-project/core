// @ts-check
import { formatPValue } from './_env.js';
import { normalizeLanguage, translate } from '../i18n/index.js';
import factors from './factors.js';

const ns = {};

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
          const nextVal = row[combined.columns[j]];
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
  if (combined.percent_total_full) legendSegments.push(translate('table.legends.percentTotalFull', lang));
  let footerText = '';
  if (legendSegments.length > 0) {
    const legendHeading = translate('table.legends.heading', lang);
    footerText = `${legendHeading} ${legendSegments.join('; ')}.`;
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
  /** @param {unknown} v */
  const escapeAttr = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;');
  /** @param {unknown} v */
  const escapeText = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;');

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
  if (combined.percent_total_full) legendLines.push(`- ${translate('table.legends.percentTotalFull', lang)}`);
  if (legendLines.length > 0) {
    const legendHeading = translate('table.legends.heading', lang);
    md.push(`\n\n**${legendHeading}**`);
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
 * @returns {string}
 */
ns.exportDatabaseAsHTML = function (db, options = {}) {
  if (!db || !Array.isArray(db.columns) || db.columns.length === 0) return '';
  const maxRows = Number(options.maxRows);
  const limit = Number.isFinite(maxRows) && maxRows > 0 ? Math.floor(maxRows) : 200;
  const includeStyles = options.includeStyles !== false;
  const includeRowIndex = options.includeRowIndex !== false; // default true
  const showDeletedColumns = options.showDeletedColumns === true; // default hide deleted
  const showVariants = options.showVariants !== false; // default true
  const shouldApplyProcessing = options.applyProcessing !== false; // default true (also applies replacements)
  const includeTitles = options.includeTitles !== false; // default true
  const titleThresholdRaw = Number(options.titleThreshold);
  // Default 40: derived from monospace 11px × ~6.6px/char fitting in 300px - 16px padding ≈ 43 chars.
  const titleThreshold = Number.isFinite(titleThresholdRaw) && titleThresholdRaw >= 0 ? Math.floor(titleThresholdRaw) : 40;
  const hasMeta = (m) => (Array.isArray(m?.replacements) && m.replacements.length > 0) || (m?.processing && Object.keys(m.processing).length > 0);
  const escapeHtml = (val) => {
    const str = String(val ?? '');
    // Avoid regex literals with `</` sequences (safer for inline bundles); use split/join for < and >.
    return str
      .replace(/&/g, '&amp;')
      .split('<').join('&lt;')
      .split('>').join('&gt;');
  };
  /** @param {unknown} val */
  const escapeAttr = (val) => escapeHtml(val).split('"').join('&quot;');
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

  const decodedCols = db.columns.flatMap(col => {
    const entries = [];
    const colType = col.col_type ?? 'q';
    const colSep = col.col_sep ?? (colType === 'l' ? ';' : '');
    let effectiveCol = col;
    if (shouldApplyProcessing && hasMeta(col.meta)) {
      effectiveCol = factors.resolveColumn(col);
    }
    const baseValues = factors.decodeColValues(effectiveCol.col_values, colType, colSep) ?? col.raw_values ?? [];
    const baseRawLabel = col.col_label ?? col.col_name ?? col.col_hash ?? '';
    entries.push({ hash: col.col_hash, rawLabel: baseRawLabel, label: escapeHtml(baseRawLabel), values: baseValues, isDeleted: !!col.col_del, isVariant: false });

    if (showVariants && Array.isArray(col.col_vars)) {
      col.col_vars.forEach((variant, idx) => {
        const vType = variant?.col_type ?? colType;
        const vSep = variant?.col_sep ?? colSep;
        let effectiveVariant = variant;
        if (shouldApplyProcessing && hasMeta(variant?.meta)) {
          effectiveVariant = factors.resolveColumn({ ...variant, col_type: vType, col_sep: vSep, col_values: variant?.col_values ?? col.col_values });
        }
        // Pointer-style base variants have no col_values — fall back to the parent column.
        const variantValues = effectiveVariant?.col_values ?? col.col_values;
        const vValues = factors.decodeColValues(variantValues, vType, vSep) ?? variant?.raw_values ?? [];
        const vRawLabel = variant?.var_label ?? `${baseRawLabel} (v${idx + 1})`;
        entries.push({ hash: `${col.col_hash}__var${idx}`, rawLabel: vRawLabel, label: escapeHtml(vRawLabel), values: vValues, isDeleted: !!col.col_del, isVariant: true });
      });
    }
    return entries;
  }).filter(col => col.hash && (showDeletedColumns || !col.isDeleted));

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
    .statz-viewer { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; color: #30323d; background: transparent; border: 1px solid rgba(48,50,61,0.15); }
    .statz-viewer th, .statz-viewer td { border: 1px solid rgba(48,50,61,0.15); padding: 6px 8px; text-align: left; background: transparent; }
    .statz-viewer tbody tr:hover { background: #d9d9d9; }
    .statz-viewer thead th { position: sticky; top: 0; z-index: 2; font-weight: bold; background: transparent; }
  </style>
  <div class="statz-viewer-wrap">
    ${tableHTML}
  </div>`;
};

export default ns;
