import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", "dist", "bubble-html", ".git", "test"]);

async function sourceFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await sourceFiles(full));
    else if (/\.(js|mjs)$/.test(entry.name)) found.push(full);
  }
  return found;
}

test("no source file carries a control character", async () => {
  // These reach the bundle verbatim and break the clipboard: a user selecting the pasted script in
  // an editor cannot copy past them. Two of them shipped once, written into a regex by an escaping
  // accident — the pattern stayed valid, every test passed, and only the paste failed.
  //
  // Tab, newline and carriage return are ordinary whitespace and are allowed.
  const offenders = [];
  for (const file of await sourceFiles(ROOT)) {
    const text = await readFile(file, "utf8");
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const isControl = (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
      if (!isControl) continue;
      const line = text.slice(0, i).split("\n").length;
      offenders.push(`${file.slice(ROOT.length + 1)}:${line} U+${code.toString(16).padStart(4, "0")}`);
    }
  }
  assert.deepEqual(offenders, [],
    "write these as escape sequences (\u0000), not as the characters themselves:\n"
    + offenders.join("\n"));
});
