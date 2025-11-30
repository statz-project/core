import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Statz } from "../../index.js";

// Helper utilities to load sample rows and feed them into parseColumns during tests.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, "../../test/fixtures");

function readJson(relativePath) {
  const fullPath = path.join(fixturesDir, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function detectDelimiter(line) {
  if (line.includes(";")) return ";";
  if (line.includes(",")) return ",";
  return ",";
}

function parseDelimitedLine(line, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(value => value.replace(/\r$/, ""));
}

function writeRowsFromCsv({
  csvFile = "example.csv",
  rowsFile = "plugin-output.json"
} = {}) {
  const csvPath = path.join(fixturesDir, csvFile);
  const csvText = fs.readFileSync(csvPath, "utf8");
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    const target = path.join(fixturesDir, rowsFile);
    fs.writeFileSync(target, "[]\n");
    return [];
  }
  const headerLine = lines.shift();
  const delimiter = detectDelimiter(headerLine);
  const headers = parseDelimitedLine(headerLine, delimiter).map(cell => cell.trim());
  const rows = lines.map(line => {
    const cells = parseDelimitedLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      const raw = cells[index] ?? "";
      const cleaned = raw.trim();
      row[header] = cleaned === "" ? null : cleaned;
    });
    return row;
  });
  const target = path.join(fixturesDir, rowsFile);
  fs.writeFileSync(target, JSON.stringify(rows, null, 2));
  return rows;
}

function loadRows(rowsFile = "plugin-output.json") {
  return readJson(rowsFile);
}

function loadHashes(hashesFile = "column-hashes.json") {
  return readJson(hashesFile);
}

/**
 * Generate the row-wise Bubble payload from a CSV and return the parsed dataset.
 * The helper writes `rowsFile` using `writeRowsFromCsv` before calling `Statz.parseColumns`.
 *
 * @param {Object} [options]
 * @param {string} [options.csvFile='example.csv'] Source CSV in `core/test/fixtures/`.
 * @param {string} [options.rowsFile='plugin-output.json'] Target JSON file for the regenerated rows.
 * @param {string} [options.hashesFile='column-hashes.json'] Hash list that mirrors Bubble's column identifiers.
 * @param {string} [options.filename='example.csv'] Original filename forwarded to `parseColumns`.
 * @param {string} [options.importTime=new Date().toISOString()] Timestamp forwarded to `parseColumns`.
 * @returns {{
 *   rows: Array<Record<string, string | null>>,
 *   hashes: string[],
 *   parsed: Record<string, unknown>,
 *   serialized: string
 * }}
 */
export function parseFixture({
  csvFile = "example.csv",
  rowsFile = "plugin-output.json",
  hashesFile = "column-hashes.json",
  filename = "example.csv",
  importTime = new Date().toISOString()
} = {}) {
  writeRowsFromCsv({ csvFile, rowsFile });
  const rows = loadRows(rowsFile);
  const hashes = loadHashes(hashesFile);
  const parsed = Statz.parseColumns(JSON.stringify(rows), hashes, filename, importTime);
  const serialized = JSON.stringify(parsed);
  return { rows, hashes, parsed, serialized };
}
