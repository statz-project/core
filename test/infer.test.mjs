import test from "node:test";
import assert from "node:assert/strict";
import factors from "../json/factors.js";
import numeric from "../json/numeric.js";

test("inferColType: list with ';' separator, commas embedded in values", () => {
  const values = [
    "febre, baixa; perda de peso; dor",
    "dor; anemia",
    "dor; febre, baixa",
    "febre, baixa; anemia",
    "dor; perda de peso"
  ];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'l');
  assert.equal(result.col_sep, ';');
});

test("inferColType: qualitative with commas in category names", () => {
  const values = ["Sim, às vezes", "Não", "Sim, sempre", "Não", "Talvez", "Não", "Sim, às vezes"];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'q');
});

test("inferColType: list with ',' separator, no semicolons", () => {
  const values = ["febre,dor", "dor,anemia", "febre", "dor,anemia,febre", "febre,dor,anemia"];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'l');
  assert.equal(result.col_sep, ',');
});

test("inferColType: numeric with decimal comma (Portuguese locale) — not a list", () => {
  const values = ["3,14", "2,71", "1,41", "0,50", "9,80", "1,73"];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'n');
});

test("inferColType: plain numeric", () => {
  const values = ["10", "20", "30", "40", "15"];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'n');
});

test("inferColType: plain qualitative", () => {
  const values = ["male", "female", "male", "female", "male"];
  const result = factors.inferColType(values);
  assert.equal(result.col_type, 'q');
});

test("getNumericWarnings: reports spurious characters, silent for clean values", () => {
  const col = factors.makeColumn(["10", "1.2t", "abc", "20", "", "1,2"], {
    col_type: 'n', col_sep: '', includeBaseVariant: false
  });
  const warnings = numeric.getNumericWarnings(col, 'pt_br');
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /linha 2.*1\.2t.*1\.2/);
  assert.match(warnings[1], /linha 3.*abc.*não numérico/);
});
