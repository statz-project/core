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
  // All three conditions, and the empty title is the one that matters: an Element the user left
  // untitled must stay untitled. Printing the File's suffix on its own would invent a heading the
  // user never wrote, and it would read as a title for the table beneath it.
  if (!title || !suffix || !element?.uses_suffix) return title;
  const stem = title.replace(TRAILING_PUNCTUATION, '');
  return stem ? `${stem} ${suffix}` : title;
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
 * Names a caller might use for chart mode. `Element.Type` in the app is an option set whose values
 * read `Table` and `Graph`, so demanding the exact string 'chart' made the vocabulary of one UI a
 * hard requirement of the core.
 */
const CHART_TYPE_WORDS = new Set(['chart', 'graph', 'grafico', 'gráfico']);

/**
 * Is this payload a chart, a table, or something we have to ask the caller about?
 *
 * The result describes itself: a chart-mode analysis carries `chart.spec` on its entries and no
 * `table`, and a table-mode one the reverse. Reading that is strictly better than trusting a string
 * passed in from the UI — a caller that sent "Graph" used to be routed to the table exporter and
 * got an empty table shell where the figure should have been, with nothing anywhere saying why.
 * The declared type only decides the case the payload cannot: an analysis that produced warnings
 * and no output at all.
 * @param {any} element
 * @param {any} result
 */
function isChartResult(element, result) {
  const entries = Array.isArray(result?.analysis) ? result.analysis : [];
  if (entries.some((entry) => entry?.chart?.spec)) return true;
  if (entries.some((entry) => entry?.table)) return false;
  return CHART_TYPE_WORDS.has(String(element?.type ?? '').trim().toLowerCase());
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
  if (isChartResult(element, result)) {
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
  /* The block itself MUST be breakable. An l x q element in chart mode emits one chart per list
     item, so a block that refuses to split would either overflow the sheet or push a nearly empty
     page ahead of it. What must not happen is an orphan: a caption, paragraph or title left alone
     at the foot of a page with its table overleaf. "break-after: avoid" keeps each of those glued
     to whatever follows, and only the atoms - one chart cell - refuse to split internally. */
  .statz-report-block { margin-bottom: 28px; }
  .statz-report-caption, .statz-report-paragraph, .statz-report-title {
    break-after: avoid; page-break-after: avoid;
  }
  .statz-report-visual .statz-chart { break-inside: avoid; page-break-inside: avoid; }
  /* A long table splits across sheets and repeats its header, rather than being kept whole. */
  .statz-report-visual thead { display: table-header-group; }
  .statz-report-visual tr { break-inside: avoid; page-break-inside: avoid; }
  .statz-report-caption { font-size: 11px; font-style: italic; color: rgba(48,50,61,.65); margin: 0 0 4px; }
  .statz-report-paragraph { font-size: 13px; line-height: 1.5; margin: 0 0 10px; text-align: justify; }
  .statz-report-title { font-size: 15px; font-weight: bold; margin: 0 0 8px; }
  .statz-report-visual table { border-collapse: collapse; width: 100%; font-size: 12px; }
  .statz-report-visual th, .statz-report-visual td { border: 1px solid rgba(48,50,61,.25); padding: 5px 7px; text-align: left; }
  .statz-report-visual th { background: #f5f5f5; }
  .statz-report-pending { font-size: 12px; font-style: italic; color: rgba(48,50,61,.55); }
  .statz-report-empty { font-size: 13px; font-style: italic; color: rgba(48,50,61,.55); }
  .statz-report-image { max-width: 100%; height: auto; }
  @media print {
    .statz-report { padding: 0; max-width: none; }
    /* The chart grid collapses to one column below 768px. On paper that query is evaluated against
       the PAGE box — A4 less its margins is about 680px — so it fires on every printed page and
       turned a two-column "auto" element into a stack of full-width figures. This document's width
       is known, so the breakpoint has nothing to decide here: restate the columns, scoped tightly
       enough (two classes) to outrank the fragment's own rule wherever it sits in the cascade.
       The values come from the exporter that owns them, so the two cannot drift apart. */
    .statz-report .statz-chart-grid { grid-template-columns: ${exporters.CHART_GRID_COLUMNS}; }
    .statz-report .statz-chart-grid--full { grid-template-columns: 1fr; }
    .statz-report .statz-chart-cell:last-child:nth-child(odd) {
      max-width: ${exporters.CHART_GRID_ORPHAN_MAX_WIDTH};
    }
  }
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
    } catch (err) {
      // One chart that cannot be drawn must not cost the whole report — but it must not vanish in
      // silence either. A blank figure with no console line is undiagnosable from the outside.
      image = null;
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[statz] a chart could not be rendered for export; it will be blank.', err);
      }
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

/**
 * Print the report, which is how the reader gets a PDF: the browser's own print dialog offers
 * "Save as PDF" on every platform, and what it saves is vector text, not a screenshot.
 *
 * The document is printed from a hidden IFRAME rather than from the page itself. Printing the page
 * would mean hiding the app's chrome - panels, navigation, the editor - with print CSS aimed at
 * Bubble's generated markup, which changes whenever the page is edited. The iframe carries only
 * what this module emitted, so its print output cannot be disturbed by the app around it. It also
 * avoids the popup blocker that a new window would face.
 *
 * The charts are already images: the document comes from `exportFileAsStaticHTML`, so the iframe
 * needs no Plotly, no bundle and no scripts at all.
 *
 * @param {{name?: string, suffix?: string}} file
 * @param {Array<any>} elements
 * @param {{lang?: string, renderChart?: Function, width?: number, height?: number, scale?: number}=} options
 * @returns {Promise<void>} resolves once the print dialog has been asked for.
 */
ns.printFileReport = async function (file, elements, options = {}) {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('printFileReport requires a browser environment'));
  }
  const html = await ns.exportFileAsStaticHTML(file, elements, { ...options, wrap: true });

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:210mm;height:297mm;border:0;';
  document.body.appendChild(frame);

  const cleanup = () => { try { frame.remove(); } catch (_e) { /* already gone */ } };

  try {
    await new Promise((resolve) => {
      frame.addEventListener('load', () => resolve(undefined), { once: true });
      frame.srcdoc = html;
    });

    const frameDoc = frame.contentDocument;
    // Data URLs usually decode before load fires, but "usually" prints a blank chart when it does
    // not. Waiting on each image costs nothing and removes the race.
    const images = frameDoc ? Array.from(frameDoc.images) : [];
    await Promise.all(images.map((img) => (
      img.complete ? Promise.resolve() : new Promise((resolve) => {
        img.addEventListener('load', () => resolve(undefined), { once: true });
        img.addEventListener('error', () => resolve(undefined), { once: true });
      })
    )));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) throw new Error('printFileReport: the print frame did not initialise');
    // Removing the frame the instant `print()` returns cancels the dialog in some browsers, so the
    // frame is kept until the print job is done and reaped on a timer if that event never comes.
    frameWindow.addEventListener('afterprint', cleanup, { once: true });
    // Unreferenced where the runtime allows it: in a browser this is a harmless fallback timer,
    // but a referenced 60s timer holds Node's event loop open, so every test run that printed
    // once took a minute to exit. Browsers return a number from setTimeout and skip this.
    const reaper = setTimeout(cleanup, 60000);
    if (reaper && typeof (/** @type {any} */ (reaper).unref) === 'function') (/** @type {any} */ (reaper)).unref();
    frameWindow.focus();
    frameWindow.print();
  } catch (err) {
    cleanup();
    throw err;
  }
};

export default ns;
