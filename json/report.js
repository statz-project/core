// @ts-check
// Assembles a whole File into one report document. Everything else in the core works one Element
// at a time; the only place a File was ever assembled is the `shared-file` Bubble page, in UI,
// where it cannot be tested and cannot be reused. Any export would have composed it a second time.
//
// What this module owns: element order, the caption/paragraph/title scaffolding, the title-plus-
// suffix rule, the empty and pending states, and the page CSS. What it deliberately does NOT own:
// the tables, the charts and the footers, which come verbatim from `exporters.js` — calling those
// with `wrap: false` yields a fragment WITHOUT a title but WITH the footer already composed from
// the automatic legend plus the user's free text. Re-deriving either here would be a second source
// of truth for the part readers actually read.

import exporters from './exporters.js';
import { normalizeLanguage, translate } from '../i18n/index.js';
import { chartSpecToImage } from '../loader.js';

const ns = {};

const escapeHtml = exporters.escapeHtml;

/**
 * Trailing punctuation and whitespace, stripped before a suffix is appended. A title typed as a
 * sentence ("Distribuição por sexo.") must not read "Distribuição por sexo. (2024)".
 */
const TRAILING_PUNCTUATION = /[\s.,;:!?\-–—]+$/;

/**
 * The Element title as it appears in the report: the user's title, plus the File's suffix when the
 * Element asks for it. Matches what the app already does, and lives here so the export and the page
 * cannot drift on it.
 * @param {{title?: string, uses_suffix?: boolean}} element
 * @param {{suffix?: string}=} file
 * @returns {string}
 */
ns.composeElementTitle = function (element, file) {
  const title = String(element?.title ?? '').trim();
  const suffix = String(file?.suffix ?? '').trim();
  if (!element?.uses_suffix || !suffix) return title;
  const stem = title.replace(TRAILING_PUNCTUATION, '');
  return stem ? `${stem} ${suffix}` : suffix;
};

/**
 * Elements in the order they are printed, with `result_json` resolved.
 * Sorting happens here rather than being demanded of the caller: a report whose elements come back
 * from a query in insertion order would print in a different order than the app shows, and nothing
 * would look broken.
 * @param {Array<any>} elements
 */
function normalizeElements(elements) {
  if (!Array.isArray(elements)) return [];
  return elements
    .map((element, index) => {
      let result = element?.result_json ?? null;
      if (typeof result === 'string') {
        const text = result.trim();
        try { result = text ? JSON.parse(text) : null; } catch { result = null; }
      }
      return { element: element ?? {}, result, index };
    })
    .sort((a, b) => {
      const pa = Number(a.element?.position);
      const pb = Number(b.element?.position);
      const va = Number.isFinite(pa) ? pa : Number.MAX_SAFE_INTEGER;
      const vb = Number.isFinite(pb) ? pb : Number.MAX_SAFE_INTEGER;
      return va - vb || a.index - b.index;
    });
}

/** The language of the report: explicit option, else whatever the first analysed element ran in. */
function resolveLang(entries, options) {
  const explicit = options?.lang;
  if (explicit) return normalizeLanguage(explicit);
  const fromResult = entries.find((entry) => entry.result?.lang)?.result?.lang;
  return normalizeLanguage(fromResult);
}

/**
 * The visual for one element: a table, a chart grid, or the pending placeholder. The footer is not
 * emitted here — `exportCombinedAsHTML` puts it in the table's `<tfoot>` and
 * `exportCombinedAsChartHTML` after the grid, both already merging the automatic test legend with
 * the Element's free-text footer.
 * @param {any} element
 * @param {any} result
 * @param {string} lang
 */
function elementVisual(element, result, lang) {
  if (!result) {
    return `<p class="statz-report-pending">${escapeHtml(translate('report.pending', lang))}</p>`;
  }
  const footer = typeof element?.footer === 'string' ? element.footer : '';
  if (String(element?.type ?? '').toLowerCase() === 'chart') {
    return exporters.exportCombinedAsChartHTML(result, undefined, false, footer);
  }
  const combined = exporters.combineAnalysisAsSingleTable(result);
  return exporters.exportCombinedAsHTML(combined, undefined, false, footer);
}

/**
 * One printed block. The order — caption, paragraph, title, visual — follows the convention of an
 * academic results section: the prose introduces what the table then shows, so the paragraph sits
 * above the title rather than below the table.
 * @param {any} element
 * @param {any} result
 * @param {number} number 1-based position in the report.
 * @param {any} file
 * @param {string} lang
 */
function elementBlock(element, result, number, file, lang) {
  const parts = [];
  parts.push(`<p class="statz-report-caption">${escapeHtml(translate('report.elementCaption', lang, { n: number }))}</p>`);

  const paragraph = String(element?.paragraph ?? '').trim();
  if (paragraph) parts.push(`<p class="statz-report-paragraph">${escapeHtml(paragraph)}</p>`);

  const title = ns.composeElementTitle(element, file);
  if (title) parts.push(`<h2 class="statz-report-title">${escapeHtml(title)}</h2>`);

  parts.push(`<div class="statz-report-visual">${elementVisual(element, result, lang)}</div>`);
  return `<section class="statz-report-block">${parts.join('')}</section>`;
}

/** Page geometry and the rules that keep a block from being split across sheets. */
const DOCUMENT_STYLES = `
  @page { size: A4; margin: 18mm 15mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #30323D; margin: 0; }
  .statz-report { max-width: 210mm; margin: 0 auto; padding: 12mm; background: #fff; }
  .statz-report-header { border-bottom: 2px solid rgba(48,50,61,.15); padding-bottom: 12px; margin-bottom: 24px; }
  .statz-report-name { font-size: 20px; font-weight: bold; margin: 0; }
  .statz-report-block { margin-bottom: 28px; break-inside: avoid; page-break-inside: avoid; }
  .statz-report-caption { font-size: 11px; font-style: italic; color: rgba(48,50,61,.65); margin: 0 0 4px; }
  .statz-report-paragraph { font-size: 13px; line-height: 1.5; margin: 0 0 10px; text-align: justify; }
  .statz-report-title { font-size: 15px; font-weight: bold; margin: 0 0 8px; }
  .statz-report-visual table { border-collapse: collapse; width: 100%; font-size: 12px; }
  .statz-report-visual th, .statz-report-visual td { border: 1px solid rgba(48,50,61,.25); padding: 5px 7px; text-align: left; }
  .statz-report-visual th { background: #f5f5f5; }
  .statz-report-pending { font-size: 12px; font-style: italic; color: rgba(48,50,61,.55); }
  .statz-report-empty { font-size: 13px; font-style: italic; color: rgba(48,50,61,.55); }
  .statz-report-image { max-width: 100%; height: auto; }
  @media print { .statz-report { padding: 0; max-width: none; } }
`;

/**
 * @param {string} title
 * @param {string} body
 * @param {string} lang
 */
function documentShell(title, body, lang) {
  return `<!DOCTYPE html>
<html lang="${lang.replace('_', '-')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${DOCUMENT_STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Assemble the report body: header plus one block per element, or the empty-report notice.
 * @param {any} file
 * @param {Array<any>} elements
 * @param {{lang?: string}=} options
 */
function buildBody(file, elements, options) {
  const entries = normalizeElements(elements);
  const lang = resolveLang(entries, options);
  const name = String(file?.name ?? '').trim();

  const head = name
    ? `<header class="statz-report-header"><h1 class="statz-report-name">${escapeHtml(name)}</h1></header>`
    : '';

  const blocks = entries.length > 0
    ? entries.map((entry, i) => elementBlock(entry.element, entry.result, i + 1, file, lang)).join('')
    : `<p class="statz-report-empty">${escapeHtml(translate('report.empty', lang))}</p>`;

  return { lang, name, html: `<div class="statz-report">${head}${blocks}</div>` };
}

/**
 * The report as HTML, with charts left as `.statz-chart` placeholders for the MutationObserver
 * installed at bundle boot to render. This is the form to inject into a page — printing it is what
 * the browser's own "save as PDF" then acts on.
 *
 * @param {{name?: string, suffix?: string}} file
 * @param {Array<{title?: string, uses_suffix?: boolean, type?: string, result_json?: any, paragraph?: string, footer?: string, position?: number}>} elements
 * @param {{wrap?: boolean, lang?: string}=} options
 * @returns {string}
 */
ns.exportFileAsHTML = function (file, elements, options = {}) {
  const { lang, name, html } = buildBody(file, elements, options);
  if (!options?.wrap) return html;
  return documentShell(name || translate('table.title', lang), html, lang);
};

const SPEC_ATTR = /<div class="statz-chart" data-spec="([^"]*)"[^>]*>\s*<\/div>/g;

/** Reverse of the attribute escaping done when the placeholder was written. */
function decodeSpec(attr) {
  const text = String(attr)
    .split('&quot;').join('"')
    .split('&lt;').join('<')
    .split('&gt;').join('>')
    .split('&amp;').join('&');
  return JSON.parse(text);
}

/**
 * The report with every chart already rasterised, so it needs no scripts and no Plotly to display.
 * This is the form to download as a file, and the input the DOCX layer will walk.
 *
 * Charts are swapped INTO the fragment the chart exporter produced rather than assembled here from
 * `result.analysis`: the grid, the warning banners and the footer legend then stay exactly as the
 * on-screen version, and only the placeholders change.
 *
 * `renderChart` is injectable so this path can be tested without a browser. The default,
 * `chartSpecToImage`, needs a real DOM and has never been exercised outside one — keeping it behind
 * a default argument confines that gap to a single line instead of the whole assembler.
 *
 * @param {{name?: string, suffix?: string}} file
 * @param {Array<any>} elements
 * @param {{wrap?: boolean, lang?: string, renderChart?: (spec: any, opts: any) => Promise<string>, width?: number, height?: number, scale?: number, format?: string}=} options
 * @returns {Promise<string>}
 */
ns.exportFileAsStaticHTML = async function (file, elements, options = {}) {
  const { lang, name, html } = buildBody(file, elements, options);
  const render = options?.renderChart || chartSpecToImage;
  const imageOptions = {
    width: options?.width ?? 900,
    height: options?.height ?? 600,
    // Screen resolution looks serrated on paper; 2x is the smallest step that stops it.
    scale: options?.scale ?? 2,
    format: options?.format ?? 'png'
  };

  const specs = [];
  html.replace(SPEC_ATTR, (_match, attr) => { specs.push(attr); return _match; });

  const images = [];
  for (const attr of specs) {
    let image = null;
    try {
      image = await render(decodeSpec(attr), imageOptions);
    } catch {
      image = null; // One chart that cannot be drawn must not cost the whole report.
    }
    images.push(image);
  }

  let cursor = 0;
  const staticHtml = html.replace(SPEC_ATTR, () => {
    const image = images[cursor++];
    return image
      ? `<div class="statz-chart statz-chart--static"><img class="statz-report-image" src="${image}" alt=""></div>`
      : '<div class="statz-chart statz-chart--static"></div>';
  });

  if (!options?.wrap) return staticHtml;
  return documentShell(name || translate('table.title', lang), staticHtml, lang);
};

export default ns;
