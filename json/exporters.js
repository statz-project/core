// @ts-check
import { formatPValue } from './_env.js';
import { normalizeLanguage, translate } from '../i18n/index.js';

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
    const predLabel = `<b>${obj.predictor}</b>`;
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
 * @returns {string}
 */
ns.exportCombinedAsHTML = function (combined, title, wrap = false) {
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
  if (legendSegments.length > 0) {
    const legendHeading = translate('table.legends.heading', lang);
    html += `<tfoot><tr><td colspan="${combined.columns.length}" style="text-align:left;">${legendHeading} ${legendSegments.join('; ')}.</td></tr></tfoot>`;
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

export default ns;
