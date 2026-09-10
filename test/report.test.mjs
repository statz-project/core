import test from "node:test";
import assert from "node:assert/strict";
import { Statz } from "../index.js";
import report from "../json/report.js";
import exporters from "../json/exporters.js";
import { translate } from "../i18n/index.js";
import { parseFixture } from "../scripts/dev/load-fixture.mjs";
import statistics from "./helpers/stdlib_stats.mjs";
import jStat from "jstat";
import * as simpleStatistics from "simple-statistics";

globalThis.Statz = Statz;
Statz.stdlibStats = statistics;
Statz.jStat = jStat;
Statz.simpleStatistics = simpleStatistics;

const { composeElementTitle, exportFileAsHTML, exportFileAsStaticHTML } = report;

// One real analysis, reused by every test that needs a populated element.
const { parsed } = parseFixture();
const sex = Statz.getColumnValues(parsed, "col_sex_hash");
const score = Statz.getColumnValues(parsed, "col_score_hash");
const biomarker = Statz.getColumnValues(parsed, "col_biomarker_hash");
const dbs = { db: { columns: [sex.column, score.column, biomarker.column] } };
const sig = (col, label, role) => JSON.stringify({
  database_id: "db", col_hash: col.column.col_hash, col_var_index: null, col_label: label, role
});
const analyse = (mode, lang = "pt_br") => Statz.runAnalysis(
  [sig(sex, "Sexo", "predictor")], [sig(score, "Escore", "response")], dbs, { lang, mode }
).result;

const FILE = { name: "Resultados preliminares", suffix: "(2024)" };
const tableElement = (over = {}) => ({
  position: 1, title: "Escore por sexo", uses_suffix: false, type: "table",
  result_json: analyse("table"), paragraph: "", footer: "", ...over
});
const titles = (html) => [...html.matchAll(/<h2 class="statz-report-title">([^<]*)</g)].map((m) => m[1]);
const captions = (html) => [...html.matchAll(/statz-report-caption">([^<]*)</g)].map((m) => m[1]);

// ---------------------------------------------------------------------------
// Title composition
// ---------------------------------------------------------------------------

test("the suffix replaces trailing punctuation rather than following it", () => {
  const file = { suffix: "(2024)" };
  assert.equal(composeElementTitle({ title: "Distribuição por sexo.", uses_suffix: true }, file),
    "Distribuição por sexo (2024)");
  assert.equal(composeElementTitle({ title: "Distribuição por sexo", uses_suffix: true }, file),
    "Distribuição por sexo (2024)");
  assert.equal(composeElementTitle({ title: "Escore  —  ", uses_suffix: true }, file), "Escore (2024)");
});

test("the suffix is applied only when the element asks for it", () => {
  const file = { suffix: "(2024)" };
  assert.equal(composeElementTitle({ title: "Escore.", uses_suffix: false }, file), "Escore.");
  assert.equal(composeElementTitle({ title: "Escore.", uses_suffix: true }, { suffix: "" }), "Escore.");
  assert.equal(composeElementTitle({ title: "Escore.", uses_suffix: true }, undefined), "Escore.");
});

test("an untitled element stays untitled, suffix or not", () => {
  // The suffix decorates a title; it is not a title. Printing it alone would invent a heading the
  // user never wrote, and it would read as the caption of the table beneath it.
  assert.equal(composeElementTitle({ title: "", uses_suffix: true }, { suffix: "(2024)" }), "");
  assert.equal(composeElementTitle({ title: "   ", uses_suffix: true }, { suffix: "(2024)" }), "");
  assert.equal(composeElementTitle({ title: "", uses_suffix: false }, { suffix: "(2024)" }), "");
  assert.equal(composeElementTitle({ uses_suffix: true }, { suffix: "(2024)" }), "");
});

test("a title made only of punctuation keeps itself rather than becoming a bare suffix", () => {
  assert.equal(composeElementTitle({ title: "...", uses_suffix: true }, { suffix: "(2024)" }), "...");
});

test("the suffix is trimmed before it is appended", () => {
  assert.equal(composeElementTitle({ title: "Escore.", uses_suffix: true }, { suffix: "  (2024)  " }),
    "Escore (2024)");
});

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

test("elements print in position order, not in the order they arrive", () => {
  const html = exportFileAsHTML(FILE, [
    tableElement({ position: 3, title: "Terceiro" }),
    tableElement({ position: 1, title: "Primeiro" }),
    tableElement({ position: 2, title: "Segundo" })
  ]);
  assert.deepEqual(titles(html), ["Primeiro", "Segundo", "Terceiro"]);
  // The caption numbers the printed position, so it must follow the sort.
  assert.deepEqual(captions(html), ["Elemento 1", "Elemento 2", "Elemento 3"]);
});

test("an element with no position sorts last instead of jumping to the front", () => {
  const html = exportFileAsHTML(FILE, [
    tableElement({ position: undefined, title: "Sem posição" }),
    tableElement({ position: 1, title: "Primeiro" })
  ]);
  assert.deepEqual(titles(html), ["Primeiro", "Sem posição"]);
});

test("the paragraph is printed above the title, as a results section reads", () => {
  const html = exportFileAsHTML(FILE, [tableElement({ paragraph: "A Tabela 1 compara os grupos." })]);
  const paragraph = html.indexOf("statz-report-paragraph");
  const title = html.indexOf("statz-report-title");
  const visual = html.indexOf("statz-report-visual");
  assert.ok(paragraph > 0 && paragraph < title && title < visual,
    "expected caption -> paragraph -> title -> visual");
});

test("an element with no paragraph emits no empty paragraph", () => {
  const html = exportFileAsHTML(FILE, [tableElement({ paragraph: "   " })]);
  assert.ok(!html.includes("statz-report-paragraph"));
});

test("an element whose analysis has not run is shown as pending, not dropped", () => {
  const html = exportFileAsHTML(FILE, [
    tableElement({ position: 1, title: "Pronto" }),
    { position: 2, title: "Pendente", type: "table", result_json: "" }
  ]);
  assert.deepEqual(titles(html), ["Pronto", "Pendente"]);
  assert.ok(html.includes(translate("report.pending", "pt_br")));
});

test("unparseable result_json degrades to pending rather than throwing", () => {
  const html = exportFileAsHTML(FILE, [{ position: 1, title: "Corrompido", type: "table", result_json: "{nope" }], { lang: "pt_br" });
  assert.ok(html.includes(translate("report.pending", "pt_br")));
  assert.deepEqual(titles(html), ["Corrompido"]);
});

test("result_json is accepted as a string as well as an object", () => {
  const asObject = exportFileAsHTML(FILE, [tableElement({ result_json: analyse("table") })]);
  const asString = exportFileAsHTML(FILE, [tableElement({ result_json: JSON.stringify(analyse("table")) })]);
  assert.equal(asObject, asString, "Bubble stores the payload as text; both forms must assemble alike");
});

test("a file with no elements says so instead of printing an empty page", () => {
  const html = exportFileAsHTML(FILE, [], { lang: "pt_br" });
  assert.ok(html.includes(translate("report.empty", "pt_br")));
  assert.ok(html.includes("Resultados preliminares"), "the header still names the file");
  assert.deepEqual(exportFileAsHTML(FILE, null, { lang: "pt_br" }), html);
});

test("table and chart elements route to their own exporter", () => {
  const asTable = exportFileAsHTML(FILE, [tableElement()]);
  assert.ok(asTable.includes("<table"), "a table element must produce a table");
  assert.ok(!asTable.includes('class="statz-chart"'));

  const asChart = exportFileAsHTML(FILE, [tableElement({ type: "chart", result_json: analyse("chart") })]);
  assert.ok(asChart.includes('class="statz-chart"'), "a chart element must produce placeholders");
});

test("chart mode is read off the payload, not off the caller's vocabulary", () => {
  // `Element.Type` in the app is an option set reading Table / Graph. Requiring the exact string
  // "chart" routed a real chart element to the table exporter, which emitted an empty table shell
  // where the figure belonged — the failure that prompted this.
  const chartResult = analyse("chart");
  for (const type of ["chart", "Graph", "GRAPH", "gráfico", "", undefined]) {
    const html = exportFileAsHTML(FILE, [tableElement({ type, result_json: chartResult })]);
    assert.ok(html.includes('class="statz-chart"'),
      'a chart payload must reach the chart exporter with type=' + JSON.stringify(type));
    assert.ok(!html.includes("<tbody></tbody>"), "an empty table shell means the routing was wrong");
  }
});

test("when the payload describes nothing, the declared type decides", () => {
  // An analysis that produced only warnings carries neither a chart spec nor a table, so there
  // is nothing to read: this is the one case where the caller's word is all there is, and it
  // must accept the vocabulary the app actually uses (Element.Type reads Table / Graph).
  const warningOnly = { lang: "pt_br", analysis: [{ predictor: "X", response: "Y" }] };
  for (const type of ["chart", "Graph", "gráfico"]) {
    const html = exportFileAsHTML(FILE, [tableElement({ type, result_json: warningOnly })]);
    assert.ok(html.includes("statz-chart-grid"),
      "expected the chart exporter for type=" + type);
  }
  const asTable = exportFileAsHTML(FILE, [tableElement({ type: "Table", result_json: warningOnly })]);
  assert.ok(!asTable.includes("statz-chart-grid"));
});

test("a table payload stays a table even when the caller calls it a chart", () => {
  const html = exportFileAsHTML(FILE, [tableElement({ type: "chart", result_json: analyse("table") })]);
  assert.ok(html.includes("<table"));
  assert.ok(!html.includes('class="statz-chart"'), "there is no spec to draw; the payload decides");
});

test("the element footer is delegated, not recomposed", () => {
  // `exportCombinedAsHTML` merges the automatic test legend with the free text and puts both in the
  // table's own <tfoot>. The assembler emitting its own footer would print the legend twice.
  const html = exportFileAsHTML(FILE, [tableElement({ footer: "Fonte: coleta piloto" })]);
  assert.ok(html.includes("Fonte: coleta piloto"));
  assert.equal((html.match(/Fonte: coleta piloto/g) || []).length, 1);
  assert.ok(html.includes("<tfoot"), "the footer must live where the exporter puts it");
});

// ---------------------------------------------------------------------------
// Escaping and document shape
// ---------------------------------------------------------------------------

test("user text is escaped wherever the assembler prints it", () => {
  const html = exportFileAsHTML(
    { name: "Projeto <script>alert(1)</script>", suffix: "& cia" },
    [tableElement({ title: "Sexo <b>&</b>", uses_suffix: true, paragraph: "1 < 2 & 3 > 2" })]
  );
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Sexo &lt;b&gt;&amp;&lt;/b&gt; &amp; cia"));
  assert.ok(html.includes("1 &lt; 2 &amp; 3 &gt; 2"));
});

test("wrap decides between a fragment and a printable document", () => {
  const fragment = exportFileAsHTML(FILE, [tableElement()]);
  assert.ok(!fragment.includes("<!DOCTYPE"), "the fragment goes inside a page that already exists");
  assert.ok(fragment.startsWith('<div class="statz-report"'));

  const doc = exportFileAsHTML(FILE, [tableElement()], { wrap: true });
  assert.ok(doc.startsWith("<!DOCTYPE html>"));
  assert.match(doc, /@page \{ size: A4/, "a report is printed on paper of a known size");
  assert.ok(doc.includes("<title>Resultados preliminares</title>"));
});

test("pagination keeps headings with their content without freezing whole blocks", () => {
  const doc = exportFileAsHTML(FILE, [tableElement()], { wrap: true });
  // A block MUST be breakable: an l x q element in chart mode emits one chart per list item, so
  // refusing to split it would overflow the sheet or push a nearly empty page ahead of it.
  assert.doesNotMatch(doc, /\.statz-report-block \{[^}]*break-inside: avoid/,
    'the block itself must be allowed to break across pages');
  // What must not happen is an orphaned heading at the foot of a page.
  assert.match(doc, /\.statz-report-caption, \.statz-report-paragraph, \.statz-report-title \{[^}]*break-after: avoid/,
    'caption, paragraph and title must stay glued to what follows');
  // Only the atoms refuse to split: one chart, one table row.
  assert.match(doc, /\.statz-chart \{[^}]*break-inside: avoid/);
  assert.match(doc, /thead \{ display: table-header-group/,
    'a long table repeats its header on each page instead of being kept whole');
});

test("the printed page keeps the two-column chart grid the element was saved with", () => {
  const doc = exportFileAsHTML(FILE, [tableElement({ type: "Graph", result_json: analyse("chart") })],
    { wrap: true });
  const printBlock = doc.slice(doc.indexOf("@media print"));

  // The fragment carries `@media (max-width:768px) { grid-template-columns: 1fr }`. On paper that
  // query reads the PAGE box — A4 less margins is about 680px — so it fires on every sheet and a
  // two-column "auto" element printed as a stack of full-width figures.
  assert.ok(doc.includes("@media (max-width:768px)"), "the responsive rule is still in the fragment");
  assert.match(printBlock, /\.statz-report \.statz-chart-grid \{ grid-template-columns: /,
    "the document must restate the columns for print");
  assert.match(printBlock, /\.statz-report \.statz-chart-grid--full \{ grid-template-columns: 1fr/,
    "and full mode must stay one column, or the override would force two on it");
});

test("the print override restates the exporter's own values, not a copy of them", () => {
  const doc = exportFileAsHTML(FILE, [tableElement({ type: "Graph", result_json: analyse("chart") })],
    { wrap: true });
  // Scoped to the print block on purpose: the document also embeds the fragment, which carries
  // these same values, so a whole-document `includes` passes even when the override says
  // something else entirely. That is what let a three-column override through unnoticed.
  const printBlock = doc.slice(doc.indexOf("@media print"));
  assert.ok(printBlock.includes("grid-template-columns: " + exporters.CHART_GRID_COLUMNS + ";"),
    "the print columns must be the exporter's value, not a second opinion");
  assert.ok(printBlock.includes("max-width: " + exporters.CHART_GRID_ORPHAN_MAX_WIDTH + ";"),
    "the trailing-odd cap is lifted by the same media query and must be restated too");
  // And the fragment uses them, so "the same value" is a claim about one source, not a rhyme.
  const fragment = exporters.exportCombinedAsChartHTML(analyse("chart"), undefined, false, "");
  assert.ok(fragment.includes(exporters.CHART_GRID_COLUMNS));
  assert.ok(fragment.includes(exporters.CHART_GRID_ORPHAN_MAX_WIDTH));
});

test("the document language follows the analysis it prints", () => {
  const pt = exportFileAsHTML(FILE, [tableElement({ result_json: analyse("table", "pt_br") })], { wrap: true });
  const en = exportFileAsHTML(FILE, [tableElement({ result_json: analyse("table", "en_us") })], { wrap: true });
  assert.ok(pt.includes('<html lang="pt-br"'));
  assert.ok(en.includes('<html lang="en-us"'));
  assert.deepEqual(captions(pt), ["Elemento 1"]);
  assert.deepEqual(captions(en), ["Element 1"]);
  // Same structure either way: only the words change.
  // Strip the text AND the lang attribute: those two are what may differ by language.
  const skeleton = (html) => html.replace(/>[^<]*</g, "><").replace(/ lang="[a-z-]+"/g, "");
  assert.equal(skeleton(pt), skeleton(en));
});

test("with nothing to infer a language from, the report falls back to en_us", () => {
  // A file with no analysis carries no language of its own. The caller knows the reader and
  // should pass `lang`; absent that, this matches `normalizeLanguage` everywhere else in the
  // core rather than inventing a different default here.
  const empty = exportFileAsHTML({ name: "Vazio" }, []);
  assert.ok(empty.includes(translate("report.empty", "en_us")));
  const pending = exportFileAsHTML(FILE, [{ position: 1, title: "X", type: "table", result_json: "" }]);
  assert.ok(pending.includes(translate("report.pending", "en_us")));
});

test("an explicit lang overrides the one stored in the result", () => {
  const html = exportFileAsHTML(FILE, [tableElement({ result_json: analyse("table", "pt_br") })], { lang: "es_es" });
  assert.deepEqual(captions(html), ["Elemento 1"]);
  assert.ok(html.includes(translate("report.elementCaption", "es_es", { n: 1 })));
});

// ---------------------------------------------------------------------------
// The static variant
// ---------------------------------------------------------------------------

const chartElement = () => tableElement({ type: "chart", result_json: analyse("chart") });

test("every chart placeholder becomes an image", async () => {
  const seen = [];
  const renderChart = async (spec, options) => {
    seen.push({ spec, options });
    return "data:image/png;base64,FAKE";
  };
  const html = await exportFileAsStaticHTML(FILE, [chartElement()], { renderChart });

  assert.equal(seen.length, 1, "the renderer must be called once per placeholder");
  assert.ok(Array.isArray(seen[0].spec.data), "the decoded spec must be the real Plotly spec");
  assert.equal(seen[0].options.scale, 2, "screen resolution serrates on paper");
  assert.equal((html.match(/data-spec/g) || []).length, 0, "no placeholder may survive");
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.ok(html.includes('src="data:image/png;base64,FAKE"'));
});

test("the static report keeps the grid and footer the chart exporter produced", async () => {
  const renderChart = async () => "data:image/png;base64,FAKE";
  const element = tableElement({ type: "chart", result_json: analyse("chart"), footer: "Fonte: piloto" });
  const html = await exportFileAsStaticHTML(FILE, [element], { renderChart });
  assert.ok(html.includes("statz-chart-grid"), "images are swapped INTO the exporter's own grid");
  assert.ok(html.includes("Fonte: piloto"));
});

test("a chart that cannot be drawn costs its own image, not the report", async () => {
  const renderChart = async () => { throw new Error("no canvas here"); };
  const html = await exportFileAsStaticHTML(FILE, [chartElement(), tableElement({ position: 2 })], { renderChart });
  assert.equal((html.match(/<img /g) || []).length, 0);
  assert.equal((html.match(/data-spec/g) || []).length, 0, "a failed render must not leave a live placeholder");
  assert.ok(html.includes("<table"), "the rest of the report still prints");
});

test("without an injected renderer it falls back to the browser primitive", async () => {
  // In Node there is no document, so `chartSpecToImage` rejects and every chart comes back empty.
  // That is the evidence the default path is the loader's, not a silent no-op.
  const html = await exportFileAsStaticHTML(FILE, [chartElement()]);
  assert.equal((html.match(/<img /g) || []).length, 0);
  assert.ok(html.includes("statz-chart--static"));
});

test("a table-only report is identical static or not, apart from nothing", async () => {
  const live = exportFileAsHTML(FILE, [tableElement()]);
  const still = await exportFileAsStaticHTML(FILE, [tableElement()]);
  assert.equal(live, still, "there is nothing to rasterise in a table");
});

test("the static variant wraps into a document too", async () => {
  const html = await exportFileAsStaticHTML(FILE, [chartElement()], {
    wrap: true, renderChart: async () => "data:image/png;base64,FAKE"
  });
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.match(html, /@page \{ size: A4/);
});

// ---------------------------------------------------------------------------
// Printing. This is DOM plumbing, so it gets a fake DOM rather than no test at all: the parts that
// can silently break — printing before the images decoded, never cleaning the frame up — are
// exactly the parts a browser would not complain about.
// ---------------------------------------------------------------------------

function fakeDom({ imagesComplete = true, imageCount = 1, noWindow = false } = {}) {
  const calls = { printed: 0, focused: 0, removed: 0, srcdoc: null, appended: 0 };
  const listeners = new Map();
  const images = Array.from({ length: imageCount }, () => {
    const img = { complete: imagesComplete, handlers: {} };
    img.addEventListener = (type, fn) => { img.handlers[type] = fn; };
    return img;
  });
  const frameWindow = {
    focus: () => { calls.focused += 1; },
    print: () => { calls.printed += 1; },
    addEventListener: (type, fn) => { listeners.set(type, fn); }
  };
  const frame = {
    style: {},
    setAttribute: () => {},
    addEventListener: (type, fn) => { if (type === 'load') listeners.set('load', fn); },
    remove: () => { calls.removed += 1; },
    contentDocument: { images },
    get contentWindow() { return noWindow ? null : frameWindow; },
    set srcdoc(value) {
      calls.srcdoc = value;
      // The browser fires load asynchronously; so does this.
      setTimeout(() => listeners.get('load')?.(), 0);
    },
    get srcdoc() { return calls.srcdoc; }
  };
  const document = { createElement: () => frame, body: { appendChild: () => { calls.appended += 1; } } };
  return { document, frame, calls, images, fireAfterPrint: () => listeners.get('afterprint')?.() };
}

async function withFakeDom(dom, fn) {
  const previous = globalThis.document;
  globalThis.document = dom.document;
  try { return await fn(); } finally {
    if (previous) globalThis.document = previous; else delete globalThis.document;
  }
}

test("printFileReport refuses outside a browser, and says so", async () => {
  const previous = globalThis.document;
  delete globalThis.document;
  try {
    await assert.rejects(() => report.printFileReport(FILE, [tableElement()]),
      /requires a browser environment/);
  } finally { if (previous) globalThis.document = previous; }
});

test("printing mounts a frame carrying the static document and asks to print it", async () => {
  const dom = fakeDom();
  // A CHART element, deliberately: with a table-only report the static and the placeholder
  // documents are byte-identical, and the assertion below would hold either way.
  await withFakeDom(dom, () => report.printFileReport(FILE, [chartElement()], {
    lang: 'pt_br', renderChart: async () => 'data:image/png;base64,FAKE'
  }));
  assert.equal(dom.calls.appended, 1, 'the frame must be mounted');
  assert.ok(dom.calls.srcdoc.startsWith('<!DOCTYPE html>'), 'a whole document, not a fragment');
  assert.match(dom.calls.srcdoc, /@page \{ size: A4/);
  assert.ok(!dom.calls.srcdoc.includes('data-spec'), 'charts must already be images: no Plotly here');
  assert.match(dom.calls.srcdoc, /<img [^>]*src="data:image\/png/,
    'the frame loads no bundle, so a placeholder would print as an empty box');
  assert.equal(dom.calls.focused, 1);
  assert.equal(dom.calls.printed, 1);
});

test("printing waits for every image to decode before opening the dialog", async () => {
  const dom = fakeDom({ imagesComplete: false, imageCount: 2 });
  let settled = false;
  const pending = withFakeDom(dom, () => report.printFileReport(FILE, [tableElement()]))
    .then(() => { settled = true; });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(dom.calls.printed, 0, 'printing before the images decode prints blank charts');

  dom.images.forEach((img) => img.handlers.load());
  await pending;
  assert.ok(settled);
  assert.equal(dom.calls.printed, 1);
});

test("an image that fails to decode does not hang the dialog forever", async () => {
  const dom = fakeDom({ imagesComplete: false, imageCount: 1 });
  const pending = withFakeDom(dom, () => report.printFileReport(FILE, [tableElement()]));
  await new Promise((resolve) => setTimeout(resolve, 10));
  dom.images[0].handlers.error();
  await pending;
  assert.equal(dom.calls.printed, 1, 'a broken image costs its own picture, not the print job');
});

test("the frame is reaped when printing ends, not before", async () => {
  const dom = fakeDom();
  await withFakeDom(dom, () => report.printFileReport(FILE, [tableElement()]));
  assert.equal(dom.calls.removed, 0, 'removing the frame at once cancels the dialog in some browsers');
  dom.fireAfterPrint();
  assert.equal(dom.calls.removed, 1);
});

test("a frame that never initialises is cleaned up instead of being left in the page", async () => {
  const dom = fakeDom({ noWindow: true });
  await assert.rejects(
    () => withFakeDom(dom, () => report.printFileReport(FILE, [tableElement()])),
    /did not initialise/
  );
  assert.equal(dom.calls.removed, 1);
  assert.equal(dom.calls.printed, 0);
});

// ---------------------------------------------------------------------------
// Progress. Rasterising the charts is the slow part of every export and it is serial, so a report
// of any size shows a spinner for tens of seconds. The count is what lets the UI say how long.
// ---------------------------------------------------------------------------

const chartsIn = (result) => (result.analysis || []).filter((entry) => entry?.chart?.spec).length;

test("progress opens with the total, then counts up to it", async () => {
  const result = analyse("chart");
  const total = chartsIn(result);
  assert.ok(total > 0, "the fixture must contain charts");

  const seen = [];
  await exportFileAsStaticHTML(FILE, [chartElement()], {
    renderChart: async () => "data:image/png;base64,FAKE",
    onProgress: (done, of) => seen.push([done, of])
  });

  // The denominator arrives before any work: a caller can show "0 of 11" the moment it starts.
  assert.deepEqual(seen[0], [0, total]);
  assert.deepEqual(seen.at(-1), [total, total]);
  assert.deepEqual(seen.map(([done]) => done), [...Array(total + 1).keys()]);
});

test("progress counts charts attempted, not charts drawn", async () => {
  // A figure that fails still consumed the time. A counter that stalled on it would look frozen
  // precisely when the user most wants to know something is happening.
  const total = chartsIn(analyse("chart"));
  const seen = [];
  await exportFileAsStaticHTML(FILE, [chartElement()], {
    renderChart: async () => { throw new Error("no canvas"); },
    onProgress: (done, of) => seen.push([done, of])
  });
  assert.deepEqual(seen.at(-1), [total, total]);
});

test("a report with nothing to rasterise says so once", async () => {
  const seen = [];
  await exportFileAsStaticHTML(FILE, [tableElement()], { onProgress: (d, t) => seen.push([d, t]) });
  assert.deepEqual(seen, [[0, 0]], "one call, so a caller knows there is no wait to show");
});

test("a progress callback that throws costs itself, not the export", async () => {
  let calls = 0;
  const html = await exportFileAsStaticHTML(FILE, [chartElement()], {
    renderChart: async () => "data:image/png;base64,FAKE",
    onProgress: () => { calls += 1; throw new Error("stale binding"); }
  });
  assert.ok(html.includes("<img "), "the document was still produced");
  assert.equal(calls, 1, "and the callback was not called again after it threw");
});

test("printing passes the counter through to the caller", async () => {
  const dom = fakeDom();
  const seen = [];
  await withFakeDom(dom, () => report.printFileReport(FILE, [chartElement()], {
    renderChart: async () => "data:image/png;base64,FAKE",
    onProgress: (done, total) => seen.push([done, total])
  }));
  assert.ok(seen.length > 1, "the print path rasterises too, and must report it");
  assert.deepEqual(seen[0][0], 0);
  assert.equal(seen.at(-1)[0], seen.at(-1)[1], "it finishes at the total");
});

test("no callback is not an error", async () => {
  const html = await exportFileAsStaticHTML(FILE, [chartElement()], {
    renderChart: async () => "data:image/png;base64,FAKE"
  });
  assert.ok(html.includes("<img "));
});

// ---------------------------------------------------------------------------
// Chart size. Plotly's font sizes are absolute, so the size a chart is DRAWN at decides how large
// its labels are once the page scales the image. Drawing big and displaying small is what put
// sub-3pt axis text next to 11pt body text.
// ---------------------------------------------------------------------------

const widthAsked = async (result, options = {}) => {
  const asked = [];
  await exportFileAsStaticHTML(FILE, [tableElement({ type: "Graph", result_json: result })], {
    renderChart: async (spec, opts) => { asked.push(opts); return "data:image/png;base64,FAKE"; },
    ...options
  });
  return asked[0];
};

const chartResult = (widthMode) => Statz.runAnalysis(
  [sig(sex, "Sexo", "predictor")], [sig(score, "Escore", "response")], dbs,
  { lang: "pt_br", mode: "chart", chart_width_mode: widthMode }
).result;

const widthsAsked = async (result, options = {}) => {
  const asked = [];
  await exportFileAsStaticHTML(FILE, [tableElement({ type: "Graph", result_json: result })], {
    renderChart: async (spec, opts) => { asked.push(opts); return "data:image/png;base64,FAKE"; },
    ...options
  });
  return asked;
};

// Two predictors give an even number of charts; one gives a single, trailing-odd cell.
const chartResultPair = (widthMode) => Statz.runAnalysis(
  [sig(sex, "Sexo", "predictor"), sig(biomarker, "Bio", "predictor")],
  [sig(score, "Escore", "response")], dbs, { lang: "pt_br", mode: "chart", chart_width_mode: widthMode }
).result;

test("charts in a full pair of columns are drawn at the column width", async () => {
  const asked = await widthsAsked(chartResultPair("auto"));
  assert.equal(asked.length, 2, "two predictors, two figures, a complete row");
  for (const opts of asked) {
    // 680px of A4 content, less the grid gap, halved, less the cell padding.
    assert.equal(opts.width, 308);
    assert.equal(opts.height, report.chartHeightFor(308), "as tall as the same chart in the Element");
  }
});

test("the trailing chart of an odd count is drawn at the width the grid centres it to", async () => {
  // `.statz-chart-cell:last-child:nth-child(odd)` spans both columns, capped at min(75%, 760px).
  // Drawn at the two-column width and displayed there, it came out magnified by half — its axis
  // labels larger than the report's own titles. A lone chart is this case too, not a special one.
  const alone = await widthsAsked(chartResult("auto"));
  assert.equal(alone.length, 1);
  assert.equal(alone[0].width, 486, "75% of 680px, less the cell padding");

  const pair = await widthsAsked(chartResultPair("auto"));
  assert.deepEqual(pair.map((o) => o.width), [308, 308], "an even count has no orphan");
});

test("a full-width chart is drawn at the whole content width", async () => {
  const asked = await widthsAsked(chartResult("full"));
  assert.equal(asked[0].width, 656);
  assert.ok(asked[0].width > 600, "a full-width chart must not be drawn at the two-column size");
});

test("full width overrides the trailing-odd rule, as its own CSS does", async () => {
  // `.statz-chart-grid--full` undoes the orphan cap; the drawing size has to follow.
  const asked = await widthsAsked(chartResultPair("full"));
  assert.deepEqual(asked.map((o) => o.width), [656, 656]);
});

test("resolution comes from scale, not from drawing oversized", async () => {
  const asked = await widthsAsked(chartResultPair("auto"));
  assert.equal(asked[0].scale, 2, "twice the pixels, same layout — this is what survives printing");
  assert.ok(asked[0].width < 400, "the drawing size tracks the page, not the resolution");
});

test("a chart is drawn as tall as the Element draws it, at every width", () => {
  // The Element is a fixed 400px box at every width, so two figures sharing a row are narrower
  // than a full-width one but JUST AS TALL. Deriving the height from the width flattened exactly
  // those two: a fixed 3:2 gave a 308px figure 205px, and an axis allowance plus a scaled plot
  // area gave it 279px. Plotly draws its axis furniture at absolute sizes, so a constant height
  // hands the extra width to the plotting area alone.
  const CELL = Statz.CHART_CELL_HEIGHT_PX;
  assert.equal(CELL, 400, "the on-screen cell the export is matching");
  for (const width of [292, 308, 450, 486, 600, 656, 1200]) {
    assert.equal(report.chartHeightFor(width), CELL, "same height at " + width);
  }
  assert.ok(report.chartHeightFor(308) > Math.round(308 / (3 / 2)),
    "a two-column figure must be taller than any width-derived ratio would make it");
});

test("the height constant is the one the chart stylesheet writes, not a copy of it", () => {
  // Two places used to hold 400 independently; a change to one printed figures that no longer
  // matched the Element. The CSS interpolates the constant, so this pins them together.
  const css = Statz.exportCombinedAsChartHTML(chartResult("auto"), undefined, false, "");
  assert.ok(css.includes(".statz-chart{height:" + Statz.CHART_CELL_HEIGHT_PX + "px;"),
    "the live cell must be the height the exporters draw to");
});

test("a static figure is as tall as its image, not as tall as a Plotly box", async () => {
  // The live placeholder is a fixed box because Plotly needs one; a static image needs none, and
  // the box left the image stranded in the top of an empty rectangle whenever the page shrank it.
  const doc = await exportFileAsStaticHTML(FILE, [chartElement()], {
    wrap: true, renderChart: async () => "data:image/png;base64,FAKE"
  });
  assert.match(doc, /\.statz-report \.statz-chart--static \{ height: auto/);
  assert.ok(doc.includes('class="statz-chart statz-chart--static"'));
});

test("an explicit width still wins, for callers printing somewhere else", async () => {
  const asked = await widthAsked(chartResult("auto"), { width: 1200 });
  assert.equal(asked.width, 1200);
  assert.equal(asked.height, report.chartHeightFor(1200));
});
