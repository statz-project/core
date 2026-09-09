import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import * as docxLib from "docx";
import { Statz } from "../index.js";
import docxWriter from "../json/docx.js";
import exporters from "../json/exporters.js";
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

// ---------------------------------------------------------------------------
// Reading the produced file. A .docx is a zip; asserting on its bytes would say nothing, and
// asserting on the objects we built would only prove we built what we built. This reads back what
// Word will read: the entries of the archive and the XML inside them.
// ---------------------------------------------------------------------------

function readZip(buffer) {
  const buf = Buffer.from(buffer);
  // Locate the end-of-central-directory record, then walk the central directory: its sizes are
  // reliable, where a local header's may be deferred to a data descriptor.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, "no end-of-central-directory record: not a zip");
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const entries = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(offset), 0x02014b50, "central directory entry expected");
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength);

    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);
    entries[name] = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const documentXml = (entries) => entries["word/document.xml"].toString("utf8");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const { parsed } = parseFixture();
const column = (hash) => Statz.getColumnValues(parsed, hash);
const sex = column("col_sex_hash");
const score = column("col_score_hash");
const clinics = column("col_clinics_hash");
const dbs = { db: { columns: [sex.column, score.column, clinics.column] } };
const sig = (col, label, role) => JSON.stringify({
  database_id: "db", col_hash: col.column.col_hash, col_var_index: null, col_label: label, role
});
const analyse = (mode, lang = "pt_br", extraPredictor = false) => Statz.runAnalysis(
  extraPredictor
    ? [sig(sex, "Sexo", "predictor"), sig(clinics, "Clinicas", "predictor")]
    : [sig(sex, "Sexo", "predictor")],
  [sig(score, "Escore", "response")], dbs, { lang, mode }
).result;

const FILE = { name: "Resultados preliminares", suffix: "(2024)" };
const tableElement = (over = {}) => ({
  position: 1, title: "Escore por sexo", uses_suffix: false, type: "Table",
  result_json: analyse("table"), paragraph: "", footer: "", ...over
});

// A real 1x1 PNG: docx embeds the bytes, so they have to be an image.
const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const fakeRender = async () => PNG_1PX;

const build = (elements, options = {}) => docxWriter.exportFileAsDocx(FILE, elements, {
  lang: "pt_br", docx: docxLib, renderChart: fakeRender, ...options
});

// ---------------------------------------------------------------------------
// The file itself
// ---------------------------------------------------------------------------

test("the writer produces an archive Word will recognise", async () => {
  const entries = readZip(await build([tableElement()]));
  for (const required of ["[Content_Types].xml", "word/document.xml", "_rels/.rels"]) {
    assert.ok(entries[required], "missing " + required);
  }
  assert.match(documentXml(entries), /^<\?xml/);
});

test("the writer refuses to guess when the library is absent", async () => {
  await assert.rejects(
    () => docxWriter.buildFileDocument(FILE, [tableElement()], { docx: null }),
    /docx library is not available/
  );
  await assert.rejects(() => docxWriter.loadDocx(), /requires a browser environment/);
});

// ---------------------------------------------------------------------------
// The block scaffolding, which comes from the shared file model
// ---------------------------------------------------------------------------

test("blocks are written in printed order, with the caption they were numbered", async () => {
  const entries = readZip(await build([
    tableElement({ position: 3, title: "Terceiro" }),
    tableElement({ position: 1, title: "Primeiro" }),
    tableElement({ position: 2, title: "Segundo" })
  ]));
  const xml = documentXml(entries);
  assert.ok(xml.indexOf("Primeiro") < xml.indexOf("Segundo"));
  assert.ok(xml.indexOf("Segundo") < xml.indexOf("Terceiro"));
  for (const n of [1, 2, 3]) {
    assert.ok(xml.includes(translate("report.elementCaption", "pt_br", { n })), "caption " + n);
  }
});

test("the paragraph precedes the title here too, because both read the same model", async () => {
  const xml = documentXml(readZip(await build([
    tableElement({ paragraph: "A Tabela 1 compara os grupos.", title: "Escore por sexo" })
  ])));
  assert.ok(xml.indexOf("A Tabela 1 compara") < xml.indexOf("Escore por sexo"));
});

test("the title carries the file suffix, by the one rule that composes it", async () => {
  const element = tableElement({ title: "Escore por sexo.", uses_suffix: true });
  const xml = documentXml(readZip(await build([element])));
  assert.ok(xml.includes(report.composeElementTitle(element, FILE)));
  assert.ok(xml.includes("Escore por sexo (2024)"));
});

test("an element whose analysis has not run says so", async () => {
  const xml = documentXml(readZip(await build([
    { position: 1, title: "Pendente", type: "Table", result_json: "" }
  ])));
  assert.ok(xml.includes(translate("report.pending", "pt_br")));
  assert.ok(!xml.includes("<w:tbl>"), "there is no table to write");
});

test("a file with no elements produces a document, not an error", async () => {
  const xml = documentXml(readZip(await build([])));
  assert.ok(xml.includes(translate("report.empty", "pt_br")));
  assert.ok(xml.includes("Resultados preliminares"), "the file is still named");
});

// ---------------------------------------------------------------------------
// Tables — the reason this format exists
// ---------------------------------------------------------------------------

test("the table is a real Word table, one grid column per model column", async () => {
  const element = tableElement();
  const model = exporters.buildCombinedTableModel(
    exporters.combineAnalysisAsSingleTable(element.result_json), "");
  const xml = documentXml(readZip(await build([element])));

  assert.ok(xml.includes("<w:tbl>"), "a table, not a picture of one");
  const rowCount = (xml.match(/<w:tr>/g) || []).length;
  assert.equal(rowCount, model.rows.length + 1, "every model row, plus the header row");
  for (const heading of model.columns) {
    assert.ok(xml.includes(heading), "missing column heading: " + heading);
  }
});

test("a spanning predictor header becomes one cell with a gridSpan", async () => {
  // The model says colspan 3; Word says gridSpan 3. This is the mapping the model exists for.
  const element = tableElement({ result_json: analyse("table", "pt_br", true) });
  const model = exporters.buildCombinedTableModel(
    exporters.combineAnalysisAsSingleTable(element.result_json), "");
  const spans = model.rows
    .filter((row) => row.kind === "data")
    .map((row) => row.cells[0].colspan)
    .filter((span) => span > 1);
  assert.ok(spans.length > 0, "the fixture must actually produce a spanning header");

  const xml = documentXml(readZip(await build([element])));
  for (const span of new Set(spans)) {
    assert.ok(xml.includes(`<w:gridSpan w:val="${span}"/>`), "no gridSpan of " + span);
  }
});

test("a significant p-value is bold in Word, and the rest of the row is not", async () => {
  // Driven from a real analysis: `combineAnalysisAsSingleTable` rebuilds its rows from the analysis
  // structure, so a hand-injected `_p_significant` never reaches the model at all.
  const element = tableElement();
  const model = exporters.buildCombinedTableModel(
    exporters.combineAnalysisAsSingleTable(element.result_json), "");
  const bold = model.rows.flatMap((row) => row.cells || []).filter((cell) => cell.bold && cell.raw === null);
  assert.equal(bold.length, 1, "the fixture must produce exactly one significant p-value");

  const xml = documentXml(readZip(await build([element])));
  // docx writes `<w:b/>` for a bold run and `<w:b w:val="false"/>` for a plain one, so the two are
  // distinguishable rather than merely present.
  const runOf = (text) => {
    const at = xml.indexOf(">" + text + "</w:t>");
    assert.notEqual(at, -1, "text not found in the document: " + text);
    return xml.slice(xml.lastIndexOf("<w:r>", at), at);
  };
  assert.ok(runOf(bold[0].text).includes("<w:b/>"), "the significant p-value must be bold");
  assert.ok(runOf("Média ± DP").includes('<w:b w:val="false"/>'), "an ordinary cell must not be");
});

test("a warning row spans the table instead of being dropped", async () => {
  // A warning reaches the combined table through `table.warning`; the combiner turns it into the
  // `_warning_text` row that the model reports as its own kind.
  const result = { lang: "pt_br", analysis: [{ predictor: "P", response: "R", table: { warning: "Pareamento recusado" } }] };
  const model = exporters.buildCombinedTableModel(exporters.combineAnalysisAsSingleTable(result), "");
  assert.ok(model.rows.some((row) => row.kind === "warning"), "the fixture must produce a warning row");

  const xml = documentXml(readZip(await build([tableElement({ result_json: result })])));
  assert.ok(xml.includes("Pareamento recusado"));
  assert.ok(xml.includes(`<w:gridSpan w:val="${model.columns.length}"/>`),
    "the warning spans every column");
});

test("cell text reaches Word as text, never as markup", async () => {
  const xml = documentXml(readZip(await build([tableElement({
    result_json: analyse("table", "pt_br", true)
  })])));
  assert.ok(!xml.includes("&lt;b&gt;"), "a <b> printed as characters means raw was used");
  assert.ok(!xml.includes("<b>"), "and the tag itself must not survive either");
});

test("the table footer is written as the plain sentence, without the italic tags", async () => {
  const element = tableElement({ footer: "Fonte: coleta piloto" });
  const model = exporters.buildCombinedTableModel(
    exporters.combineAnalysisAsSingleTable(element.result_json), element.footer);
  const xml = documentXml(readZip(await build([element])));
  assert.ok(model.footer.html.includes("<i>"), "the fixture must have an italicised legend");
  assert.ok(xml.includes("Fonte: coleta piloto"));
  // The tag would reach document.xml ESCAPED — `&lt;i&gt;` — which is precisely how Word would
  // print it to the reader. Looking for the raw "<i>" finds nothing either way.
  assert.ok(!xml.includes("&lt;i&gt;"), "Word would print the tag as three characters");
  assert.ok(xml.includes(model.footer.text), "the plain sentence is what gets written");
});

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

test("a chart element embeds an image, and the archive carries the bytes", async () => {
  const entries = readZip(await build([
    tableElement({ type: "Graph", result_json: analyse("chart") })
  ]));
  // A zip carries a directory entry for `word/media/` itself; only the files count.
  const media = Object.keys(entries).filter((name) => /^word\/media\/.+\.\w+$/.test(name));
  assert.equal(media.length, 1, "one figure, one image part");
  assert.ok(documentXml(entries).includes("<w:drawing>"), "and it is placed in the document");
});

test("the renderer is asked for a print-resolution image", async () => {
  const asked = [];
  await build([tableElement({ type: "Graph", result_json: analyse("chart") })], {
    renderChart: async (spec, options) => { asked.push({ spec, options }); return PNG_1PX; }
  });
  assert.equal(asked.length, 1);
  assert.ok(Array.isArray(asked[0].spec.data), "the real Plotly spec, decoded from the result");
  assert.equal(asked[0].options.scale, 2, "screen resolution serrates on paper");
  assert.equal(asked[0].options.format, "png");
});

test("a chart that cannot be drawn costs its figure, not the document", async () => {
  const entries = readZip(await build([
    tableElement({ type: "Graph", result_json: analyse("chart"), title: "Figura" }),
    tableElement({ position: 2, title: "Tabela" })
  ], { renderChart: async () => { throw new Error("no canvas"); } }));
  const xml = documentXml(entries);
  assert.ok(!xml.includes("<w:drawing>"), "no image was placed");
  assert.ok(xml.includes("Figura") && xml.includes("Tabela"), "everything else still printed");
  assert.ok(xml.includes("<w:tbl>"), "including the other element's table");
});

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

test("the document is written in the language the report resolved", async () => {
  const pt = documentXml(readZip(await build([tableElement()], { lang: "pt_br" })));
  const en = documentXml(readZip(await build([tableElement()], { lang: "en_us" })));
  assert.ok(pt.includes(translate("report.elementCaption", "pt_br", { n: 1 })));
  assert.ok(en.includes(translate("report.elementCaption", "en_us", { n: 1 })));
  assert.notEqual(pt, en);
});

// ---------------------------------------------------------------------------
// Saving the file. DOM plumbing again, so it gets a fake DOM: the parts that fail silently in a
// browser — the wrong MIME type, a revoked URL before the download starts — are invisible otherwise.
// ---------------------------------------------------------------------------

test("the filename comes from the File, made safe for a filesystem", () => {
  assert.equal(docxWriter.docxFileName({ name: "Resultados 2024" }, "pt_br"), "Resultados 2024.docx");
  assert.equal(docxWriter.docxFileName({ name: 'Ensaio: A/B "piloto"' }, "pt_br"), "Ensaio A B piloto.docx");
  assert.equal(docxWriter.docxFileName({ name: "   " }, "pt_br"), translate("table.title", "pt_br") + ".docx");
  assert.equal(docxWriter.docxFileName({}, "en_us"), translate("table.title", "en_us") + ".docx");
});

function fakeDownloadDom() {
  const calls = { clicked: 0, removed: 0, appended: 0, revoked: [], created: [], anchor: null };
  const anchor = {
    style: {},
    click: () => { calls.clicked += 1; },
    remove: () => { calls.removed += 1; }
  };
  calls.anchor = anchor;
  const document = { createElement: () => anchor, body: { appendChild: () => { calls.appended += 1; } } };
  const URLShim = {
    createObjectURL: (blob) => { calls.created.push(blob); return "blob:fake-" + calls.created.length; },
    revokeObjectURL: (url) => { calls.revoked.push(url); }
  };
  return { document, URL: URLShim, calls };
}

async function withDom(dom, fn) {
  const prevDoc = globalThis.document;
  const prevUrl = globalThis.URL;
  globalThis.document = dom.document;
  globalThis.URL = dom.URL;
  try { return await fn(); } finally {
    if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    globalThis.URL = prevUrl;
  }
}

test("downloading offers a Word file, by the name the File carries", async () => {
  const dom = fakeDownloadDom();
  const filename = await withDom(dom, () => docxWriter.downloadFileAsDocx(FILE, [tableElement()], {
    lang: "pt_br", docx: docxLib, renderChart: fakeRender
  }));

  assert.equal(filename, "Resultados preliminares.docx");
  assert.equal(dom.calls.anchor.download, filename, "the anchor must carry the name");
  assert.equal(dom.calls.clicked, 1, "and be clicked exactly once");
  assert.equal(dom.calls.appended, 1);
  assert.equal(dom.calls.removed, 1, "the anchor must not be left in the page");

  const [blob] = dom.calls.created;
  assert.equal(blob.type,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "the MIME type is what makes Word open it rather than a browser showing bytes");
  assert.ok(blob.size > 1000, "the blob carries the document, not an empty shell");
});

test("an explicit filename wins over the File's name", async () => {
  const dom = fakeDownloadDom();
  const filename = await withDom(dom, () => docxWriter.downloadFileAsDocx(FILE, [tableElement()], {
    lang: "pt_br", docx: docxLib, renderChart: fakeRender, filename: "tabela-1.docx"
  }));
  assert.equal(filename, "tabela-1.docx");
});

test("the object URL is not revoked before the download can start", async () => {
  const dom = fakeDownloadDom();
  await withDom(dom, () => docxWriter.downloadFileAsDocx(FILE, [tableElement()], {
    lang: "pt_br", docx: docxLib, renderChart: fakeRender
  }));
  // Revoking in the same tick cancels the save in some browsers; it happens on a timer instead.
  assert.deepEqual(dom.calls.revoked, [], "revoked too early");
});

test("downloading refuses outside a browser instead of half-working", async () => {
  await assert.rejects(
    () => docxWriter.downloadFileAsDocx(FILE, [tableElement()], { docx: docxLib, renderChart: fakeRender }),
    /requires a browser environment/
  );
});

test("the bytes are a Uint8Array in both environments, not a Node Buffer", async () => {
  // `Packer.toBuffer` asks JSZip for a Node Buffer, which does not exist in a browser: it would
  // have passed every test here and failed for every user.
  const bytes = await build([tableElement()]);
  // `instanceof Uint8Array` is not enough to catch this: Node's Buffer IS a Uint8Array
  // subclass, so `toBuffer` satisfies it here and still fails in a browser, which has no
  // Buffer at all. The contract is a PLAIN Uint8Array, and the constructor is what says so.
  assert.equal(bytes.constructor, Uint8Array,
    'expected a plain Uint8Array, got ' + bytes.constructor.name);
  assert.equal(bytes[0], 0x50, "PK");
  assert.equal(bytes[1], 0x4b);
});
