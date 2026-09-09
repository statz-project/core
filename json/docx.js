// @ts-check
// Writes a File's report as a real .docx — editable tables in Word, not a picture of them. That is
// the point of the format: the reader's next move is usually to restyle a table for a journal, and
// nothing else we can produce lets them.
//
// It renders the two models rather than the HTML: `buildFileReportModel` says which blocks in what
// order, and `buildCombinedTableModel` says which cell is bold and how far a header spans. Parsing
// our own markup back out would have been the alternative, and re-deriving those decisions here
// would have put a second description of a Stat-z table in the codebase.
//
// The `docx` library is injected. In the browser it is loaded from CDN on first use, but every
// mapping decision in this file is exercised in Node against the real library, which is what makes
// "the table has the right number of columns" a tested claim rather than a hopeful one.

import exporters from './exporters.js';
import report from './report.js';
import { translate } from '../i18n/index.js';
import { chartSpecToImage } from '../loader.js';

const ns = {};

/**
 * Pinned, like every other CDN dependency the loader pulls. The IIFE build specifically: it is the
 * one that assigns a global (`var docx = ...`) when loaded by a plain <script>, which is how it
 * arrives here. The package's `main` is a `.cjs` UMD file that would define nothing.
 */
const DOCX_CDN = 'https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js';

/** A4 in twips (1/20 pt), less 2cm margins: the usable text width a full-width table spans. */
const PAGE_MARGIN_TWIPS = 1134; // 2cm
const CONTENT_WIDTH_TWIPS = 11906 - (2 * PAGE_MARGIN_TWIPS);

/** Chart images are rendered at this pixel size, then placed at a width the page can hold. */
const CHART_PIXELS = { width: 900, height: 600 };
const CHART_DOC_WIDTH = 600;
const CHART_DOC_HEIGHT = 400;

/**
 * Load the `docx` UMD bundle once and hand back its namespace.
 * @returns {Promise<any>}
 */
ns.loadDocx = function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('loadDocx requires a browser environment'));
  }
  const w = /** @type {any} */ (window);
  if (w.docx) return Promise.resolve(w.docx);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${DOCX_CDN}"]`);
    const done = () => (w.docx ? resolve(w.docx) : reject(new Error('docx loaded but defined no global')));
    if (existing) {
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', () => reject(new Error('docx failed to load')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = DOCX_CDN;
    script.async = true;
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', () => reject(new Error('docx failed to load from ' + DOCX_CDN)), { once: true });
    document.head.appendChild(script);
  });
};

/** `data:image/png;base64,AAAA` -> the bytes. */
function dataUrlToBytes(dataUrl) {
  const comma = String(dataUrl).indexOf(',');
  if (comma === -1) throw new Error('not a data URL');
  const base64 = String(dataUrl).slice(comma + 1);
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  // Node, for the tests.
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

/**
 * One paragraph of plain text.
 * @param {any} d The docx namespace.
 */
function para(d, text, { bold = false, italics = false, size, align, spacingAfter = 120, style } = {}) {
  return new d.Paragraph({
    alignment: align,
    spacing: { after: spacingAfter },
    style,
    children: [new d.TextRun({ text, bold, italics, size })]
  });
}

/**
 * A table, built from the SAME model the HTML renderer uses. Word tables need every row to declare
 * the same number of grid columns, so a spanning header cell is one cell with `columnSpan` and the
 * rest of the row simply absent — which is exactly what the model already says.
 * @param {any} d
 * @param {any} model
 */
function buildTable(d, model) {
  const width = model.columns.length || 1;
  const columnWidth = Math.floor(CONTENT_WIDTH_TWIPS / width);

  const headerCells = model.columns.map((col) => new d.TableCell({
    width: { size: columnWidth, type: d.WidthType.DXA },
    shading: { fill: 'F5F5F5' },
    children: [para(d, String(col), { bold: true, size: 18, spacingAfter: 0 })]
  }));
  const rows = [new d.TableRow({ tableHeader: true, children: headerCells })];

  for (const row of model.rows) {
    if (row.kind === 'warning') {
      rows.push(new d.TableRow({
        children: [new d.TableCell({
          columnSpan: width,
          shading: { fill: 'FFF8E1' },
          children: [para(d, '⚠ ' + row.text, { size: 18, spacingAfter: 0 })]
        })]
      }));
      continue;
    }
    rows.push(new d.TableRow({
      children: row.cells.map((cell) => new d.TableCell({
        columnSpan: cell.colspan > 1 ? cell.colspan : undefined,
        width: cell.colspan > 1 ? undefined : { size: columnWidth, type: d.WidthType.DXA },
        // `text`, never `raw`: Word has no use for a `<b>` and would print the tag. The model
        // already separated the two, and `bold` carries what the markup meant.
        children: [para(d, cell.text, { bold: cell.bold, size: 18, spacingAfter: 0 })]
      }))
    }));
  }

  return new d.Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: d.WidthType.DXA },
    rows
  });
}

/**
 * The chart specs of one block, in the order the chart exporter would have drawn them.
 * @param {any} result
 */
function chartSpecs(result) {
  const entries = Array.isArray(result?.analysis) ? result.analysis : [];
  return entries.filter((entry) => entry?.chart?.spec).map((entry) => entry.chart.spec);
}

/**
 * Warning text carried by a chart-mode analysis, which the chart exporter prints as amber banners.
 * @param {any} result
 */
function chartWarnings(result) {
  const entries = Array.isArray(result?.analysis) ? result.analysis : [];
  return entries
    .filter((entry) => !entry?.chart?.spec && typeof entry?.table?.warning === 'string' && entry.table.warning)
    .map((entry) => entry.table.warning);
}

/**
 * Build the document's children for one block.
 * @returns {Promise<any[]>}
 */
async function blockChildren(d, block, renderChart, strings) {
  const children = [];
  children.push(para(d, block.caption, { italics: true, size: 18, spacingAfter: 40 }));
  if (block.paragraph) children.push(para(d, block.paragraph, { size: 22, spacingAfter: 120 }));
  if (block.title) children.push(para(d, block.title, { bold: true, size: 26, spacingAfter: 120 }));

  if (block.kind === 'pending') {
    children.push(para(d, strings.pending, { italics: true, size: 20 }));
    return children;
  }

  if (block.kind === 'chart') {
    for (const warning of chartWarnings(block.result)) {
      children.push(para(d, '⚠ ' + warning, { size: 20 }));
    }
    for (const spec of chartSpecs(block.result)) {
      let image = null;
      try {
        image = await renderChart(spec, { ...CHART_PIXELS, scale: 2, format: 'png' });
      } catch (err) {
        // One figure that cannot be drawn costs its own space, not the document — the same rule
        // the HTML export follows, and for the same reason.
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[statz] a chart could not be rendered for the DOCX; it will be omitted.', err);
        }
      }
      if (!image) continue;
      children.push(new d.Paragraph({
        alignment: d.AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [new d.ImageRun({
          type: 'png',
          data: dataUrlToBytes(image),
          transformation: { width: CHART_DOC_WIDTH, height: CHART_DOC_HEIGHT }
        })]
      }));
    }
    if (block.footer && block.footer.trim()) {
      children.push(para(d, block.footer.trim(), { italics: true, size: 18 }));
    }
    return children;
  }

  const combined = exporters.combineAnalysisAsSingleTable(block.result);
  const tableModel = exporters.buildCombinedTableModel(combined, block.footer);
  if (!tableModel) return children;
  children.push(buildTable(d, tableModel));
  if (tableModel.footer) {
    // The footer's plain text: Word would print `<i>` as three characters, and the model already
    // carries the sentence without it.
    children.push(para(d, tableModel.footer.text, { italics: true, size: 18, spacingAfter: 240 }));
  }
  return children;
}

/**
 * Assemble the report as a `docx` Document.
 *
 * Separate from packing so the mapping can be inspected without producing a file, which is how the
 * suite checks that a spanning header really became one cell with a `columnSpan`.
 *
 * @param {{name?: string, suffix?: string}} file
 * @param {Array<any>} elements
 * @param {{lang?: string, docx?: any, renderChart?: Function}=} options
 * @returns {Promise<any>} a docx `Document`
 */
ns.buildFileDocument = async function (file, elements, options = {}) {
  const d = options?.docx || (typeof window !== 'undefined' ? /** @type {any} */ (window).docx : null);
  if (!d || typeof d.Document !== 'function') {
    throw new Error('buildFileDocument: the docx library is not available; call loadDocx() first.');
  }
  const model = report.buildFileReportModel(file, elements, options);
  const renderChart = options?.renderChart || chartSpecToImage;
  const strings = {
    pending: translate('report.pending', model.lang),
    empty: translate('report.empty', model.lang)
  };

  const children = [];
  if (model.name) children.push(para(d, model.name, { bold: true, size: 32, spacingAfter: 240 }));
  if (model.blocks.length === 0) {
    children.push(para(d, strings.empty, { italics: true, size: 22 }));
  }
  for (const block of model.blocks) {
    children.push(...await blockChildren(d, block, renderChart, strings));
    children.push(para(d, '', { spacingAfter: 240 }));
  }

  return new d.Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4 in twips
          margin: { top: PAGE_MARGIN_TWIPS, bottom: PAGE_MARGIN_TWIPS, left: PAGE_MARGIN_TWIPS, right: PAGE_MARGIN_TWIPS }
        }
      },
      children
    }]
  });
};

/**
 * The report as .docx bytes, ready to hand to a download.
 * @param {{name?: string, suffix?: string}} file
 * @param {Array<any>} elements
 * @param {{lang?: string, docx?: any, renderChart?: Function}=} options
 * @returns {Promise<Uint8Array>}
 */
ns.exportFileAsDocx = async function (file, elements, options = {}) {
  const d = options?.docx
    || (typeof window !== 'undefined' && /** @type {any} */ (window).docx)
    || await ns.loadDocx();
  const doc = await ns.buildFileDocument(file, elements, { ...options, docx: d });
  // `toArrayBuffer`, not `toBuffer`: the latter asks JSZip for a Node Buffer, which does not exist
  // in a browser — it would have worked in every test here and failed for every user. This one
  // path serves both, and the caller wraps the bytes however it needs to.
  const buffer = await d.Packer.toArrayBuffer(doc);
  return new Uint8Array(buffer);
};

/** Characters a filesystem will not take, plus the ones that make a name awkward to type. */
const UNSAFE_FILENAME = /[\/:*?"<>| -]+/g;

/**
 * The download's filename: the File's own name, made safe, or a neutral fallback when it has none.
 * @param {{name?: string}} file
 * @param {string} lang
 */
ns.docxFileName = function (file, lang) {
  const base = String(file?.name ?? '').replace(UNSAFE_FILENAME, ' ').trim().replace(/\s+/g, ' ');
  return (base || translate('table.title', lang)) + '.docx';
};

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Build the report and hand it to the browser as a download.
 *
 * Separate from `exportFileAsDocx` because producing bytes and saving a file are different jobs:
 * the first is pure and tested against the real library, the second is DOM plumbing that only a
 * browser can perform. A caller that wants the bytes for something else asks for the bytes.
 *
 * @param {{name?: string, suffix?: string}} file
 * @param {Array<any>} elements
 * @param {{lang?: string, docx?: any, renderChart?: Function, filename?: string}=} options
 * @returns {Promise<string>} the filename offered to the browser.
 */
ns.downloadFileAsDocx = async function (file, elements, options = {}) {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    throw new Error('downloadFileAsDocx requires a browser environment');
  }
  const bytes = await ns.exportFileAsDocx(file, elements, options);
  const model = report.buildFileReportModel(file, elements, options);
  const filename = options?.filename || ns.docxFileName(file, model.lang);

  const url = URL.createObjectURL(new Blob([bytes], { type: DOCX_MIME }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoking immediately can cancel the download in some browsers; a tick is enough, and the
    // timer is unreferenced so it cannot hold a test runner's event loop open.
    const reaper = setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (reaper && typeof (/** @type {any} */ (reaper).unref) === 'function') (/** @type {any} */ (reaper)).unref();
  }
  return filename;
};

export default ns;
