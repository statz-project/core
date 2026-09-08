import test from "node:test";
import assert from "node:assert/strict";
import { Statz } from "../index.js";
import report from "../json/report.js";
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
const dbs = { db: { columns: [sex.column, score.column] } };
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

test("an element with no title of its own still shows the suffix", () => {
  assert.equal(composeElementTitle({ title: "", uses_suffix: true }, { suffix: "(2024)" }), "(2024)");
  assert.equal(composeElementTitle({ title: "", uses_suffix: false }, { suffix: "(2024)" }), "");
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
