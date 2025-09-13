// @ts-check
import { formatPValue } from './_env.js';

const ns = {};

/**
 * Render a simple HTML table string with optional caption.
 */
ns.tableToHTML = function ({ columns, rows }, caption = '') {
  const thead = `<thead><tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(row => `<tr>${columns.map(col => `<td>${row[col] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table border="1">${caption ? `<caption>${caption}</caption>` : ''}${thead}${tbody}</table>`;
};

/** Convert a table to Markdown. */
ns.tableToMarkdown = function ({ columns, rows }) {
  const header = `| ${columns.join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map(row => `| ${columns.map(col => row[col] ?? '').join(' | ')} |`).join('\n');
  return `${header}\n${separator}\n${body}`;
};

/** Wrap body HTML into a minimal HTML document. */
ns.wrapHTMLDocument = function (title, bodyHTML) {
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
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

/** HTML blocks listing significant post-hoc pairwise comparisons by predictor. */
ns.exportPosthocComparisonsAsHTML = function (analysis, title = 'Comparações múltiplas significativas') {
  if (!Array.isArray(analysis)) return '';
  const htmlBlocks = [];
  analysis.forEach(item => {
    const predictor = item.predictor?.replace(/[:?\s]*$/, '') || 'Variável';
    const posthoc = item?.table?.posthoc?.filter(p => p.significant);
    if (!posthoc || posthoc.length === 0) return;
    const rows = posthoc.map(p => `
            <tr>
                <td>“${p.groupA}”</td>
                <td>“${p.groupB}”</td>
                <td>${p.pValue.toFixed(4)}</td>
                <td style="text-align:center;">??</td>
            </tr>`).join('');
    const block = `
        <h4>${predictor}</h4>
        <table border="1" cellspacing="0" cellpadding="6" style="margin-bottom:20px;">
            <thead>
                <tr>
                    <th>Grupo A</th>
                    <th>Grupo B</th>
                    <th>p-valor</th>
                    <th>Significativo</th>
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
 */
ns.combineAnalysisAsSingleTable = function (resultObj) {
  const resultArray = resultObj.analysis;
  const hasGrouping = resultArray.some(obj => obj.response);
  const firstColLabel = hasGrouping ? 'Grupo' : 'Variável';
  const combined = { columns: [firstColLabel], rows: [], test_legend: [], posthoc_legend: [], resid_symbol_greater_used: false, resid_symbol_lower_used: false };
  if (!Array.isArray(resultArray)) return combined;
  const legendMap = new Map(); const posthocByPredictor = [];
  resultArray.forEach(obj => {
    const { predictor, table } = obj; const predLabel = `<b>${predictor}</b>`;
    table.columns.forEach(col => { if (!combined.columns.includes(col)) combined.columns.push(col); });
    const rowIntro = {}; combined.columns.forEach(col => {
      if (col === firstColLabel) rowIntro[col] = predLabel;
      else if (col === 'p-valor' && typeof table.p_value === 'number') rowIntro[col] = formatPValue(table.p_value) + table.test_symbol;
      else if (col === 'p-valor' && !table.p_value) rowIntro[col] = '-';
      else rowIntro[col] = '';
    });
    rowIntro._test_method = table.test_used; rowIntro._test_symbol = table.test_symbol; combined.rows.push(rowIntro);
    table.rows.forEach(row => { const fullRow = {}; combined.columns.forEach(col => { fullRow[col] = row[col] ?? ''; }); combined.rows.push(fullRow); });
    if (table.test_used && !legendMap.has(table.test_used)) legendMap.set(table.test_used, table.test_symbol);
    if (table.used_resid_greater) combined.resid_symbol_greater_used = true; if (table.used_resid_lower) combined.resid_symbol_lower_used = true;
    if (Array.isArray(table.posthoc)) {
      const frases = table.posthoc.filter(p => p.significant).map(p => `“${p.groupA}” <i>versus</i> “${p.groupB}” (p=${formatPValue(p.pValue)})`);
      if (frases.length) posthocByPredictor.push(`Comparações significativas para “${predictor}”: ${frases.join(', ')}`);
    }
  });
  combined.test_legend = Array.from(legendMap.entries()).map(([method, symbol]) => ({ method, symbol }));
  if (posthocByPredictor.length > 0) combined.posthoc_legend = posthocByPredictor;
  const percentByFlags = resultArray.filter(r => r.table?.percent_by).map(r => r.table.percent_by);
  const allSamePercentBy = percentByFlags.every(v => v === percentByFlags[0]); if (allSamePercentBy && percentByFlags.length > 0) combined.percent_by = percentByFlags[0];
  const fullTotalFlags = resultArray.filter(r => ['q', 'l'].includes(r.predictor_type)).map(r => r.table?.summary?.total_is_full);
  const allSameFullTotal = fullTotalFlags.length > 0 && fullTotalFlags.every(v => v === true); if (allSameFullTotal) combined.percent_total_full = true;
  return combined;
};

/** Render combined table as HTML (optionally full document). */
ns.exportCombinedAsHTML = function (combined, title = 'Tabela', wrap = false) {
  let html = '';
  html += `<table><thead><tr>`; combined.columns.forEach(col => { html += `<th>${col}</th>`; }); html += `</tr></thead>`;
  html += `<tbody>`; combined.rows.forEach(row => { html += `<tr>`; let skip = 0; for (let i = 0; i < combined.columns.length; i++) { if (skip > 0) { skip--; continue; } const col = combined.columns[i]; const val = row[col] ?? ''; if (i === 0 && ns.isPredictorHeaderRow(val)) { let colspan = 1; for (let j = i + 1; j < combined.columns.length; j++) { const nextVal = row[combined.columns[j]]; if (nextVal !== '') break; colspan++; } html += `<td colspan="${colspan}">${val}</td>`; skip = colspan - 1; } else { html += `<td>${val}</td>`; } } html += `</tr>`; }); html += `</tbody>`;
  const legendParts = [];
  if (combined.test_legend?.length) { const parts = combined.test_legend.map(t => `${t.symbol} <i>${t.method}</i>`); legendParts.push(parts.join('; ')); }
  if (combined.posthoc_legend?.length) legendParts.push(...combined.posthoc_legend);
  const symbols = []; if (combined.resid_symbol_greater_used) symbols.push(`† Frequência maior que o esperado`); if (combined.resid_symbol_lower_used) symbols.push(`* Frequência menor que o esperado`); if (symbols.length) legendParts.push(symbols.join('; '));
  if (combined.percent_by === 'col') legendParts.push('Os percentuais referem-se ao total de cada coluna');
  else if (combined.percent_by === 'row') legendParts.push('Os percentuais referem-se ao total de cada linha');
  if (combined.percent_total_full) legendParts.push('Os percentuais consideram todos os registros, incluindo ausentes');
  if (legendParts.length > 0) html += `<tfoot><tr><td colspan="${combined.columns.length}" style="text-align:left;">${legendParts.join('; ')}.</td></tr></tfoot>`;
  html += `</table>`;
  if (!wrap) return html;
  return `<!DOCTYPE html>
  <html>
  <head><meta charset='utf-8'><title>${title}</title></head>
  <body>
  <div class='styled-table'>
  <h4>${title}</h4>
  ${html}
  </div>
  </body>
  </html>`;
};

/** Detects if string is a predictor header row (<b>...</b>). */
ns.isPredictorHeaderRow = function (val) { if (typeof val !== 'string') return false; return /^<b(?:\s[^>]*)?>.+<\/b>$/.test(val.trim()); };

/** Render combined table as Markdown (with legend). */
ns.exportCombinedAsMarkdown = function (combined, title = 'Tabela') {
  if (!combined || !combined.columns || !combined.rows) return '';
  const header = combined.columns; const separator = header.map(() => '---').join(' | ');
  const rows = combined.rows.map(row => header.map(col => row[col] ?? '').join(' | '));
  const md = [`**${title}**`, `\n\n| ${header.join(' | ')} |`, `| ${separator} |`, ...rows.map(r => `| ${r} |`)];
  if (combined.test_legend?.length || combined.posthoc_legend?.length || combined.resid_symbol_greater_used || combined.resid_symbol_lower_used) {
    md.push(`\n\n**Legenda:**`);
    if (combined.test_legend?.length) { const testLines = combined.test_legend.map(t => `- ${t.symbol}: ${t.method}`); md.push(...testLines); }
    if (combined.resid_symbol_greater_used || combined.resid_symbol_lower_used) { const sym = []; if (combined.resid_symbol_greater_used) sym.push('- † Maior que o esperado'); if (combined.resid_symbol_lower_used) sym.push('- * Menor que o esperado'); md.push(...sym); }
    if (combined.posthoc_legend?.length) { combined.posthoc_legend.forEach(leg => md.push(`- ${leg}`)); }
  }
  return md.join('\n');
};

/** Map combined rows into Bubble-friendly items (title + single-row table). */
ns.exportCombinedAsRows = function (combined) {
  if (!combined || !combined.columns || !combined.rows) return [];
  return combined.rows.map(row => ({ title: row['Grupo']?.replace(/<[^>]+>/g, '') || '', columns: combined.columns, rows: [row] }));
};

export default ns;
