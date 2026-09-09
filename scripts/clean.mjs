#!/usr/bin/env node
// Remove superseded build outputs.
//
// Every build writes `dist/statz-core.v<version>.<hash>.js` under a new name and removes nothing,
// so the directory grows by one file per build and never shrinks.
//
// It does NOT simply delete dist/, the way the bubblescripts clean does. One of those files is the
// source of the bundle currently pasted into Bubble, and it is the only record of which code that
// HTML came from. `bubble-html/statz-bundle.html` names its own hash in a leading comment, so the
// deployed build can be identified exactly rather than guessed at by timestamp — and that is the
// one kept.
//
//   node scripts/clean.mjs             remove superseded builds
//   node scripts/clean.mjs --dry-run   list what would go, delete nothing
//   node scripts/clean.mjs --all       remove dist/ entirely, deployed build included

import { readdir, readFile, stat, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const all = args.has('--all');

const root = process.cwd();
const distPath = resolve(root, 'dist');
const bundlePath = resolve(root, 'bubble-html', 'statz-bundle.html');

/** The hashed build the pasted bundle was made from, read from its own header comment. */
async function deployedBuildName() {
  try {
    const html = await readFile(bundlePath, 'utf8');
    const match = html.match(/<!--\s*statz bundle \(v([\w.\-+]+),\s*([0-9a-f]+)\)/);
    if (!match) return null;
    return `statz-core.v${match[1]}.${match[2]}.js`;
  } catch {
    return null;
  }
}

let entries;
try {
  entries = await readdir(distPath);
} catch {
  console.log('Nothing to clean: dist/ does not exist.');
  process.exit(0);
}

if (all) {
  if (dryRun) {
    console.log(`Would remove dist/ entirely (${entries.length} file(s)).`);
    process.exit(0);
  }
  await rm(distPath, { recursive: true, force: true });
  console.log(`Removed dist/ (${entries.length} file(s)), deployed build included.`);
  process.exit(0);
}

const HASHED = /^statz-core\.v[\w.\-+]+\.[0-9a-f]+\.js$/;
const deployed = await deployedBuildName();
const keep = new Set(['statz-core.js']);
let kept = null;
let keptReason = '';

if (deployed && entries.includes(deployed)) {
  keep.add(deployed);
  kept = deployed;
  keptReason = 'the build bubble-html/statz-bundle.html was made from';
} else {
  // Not being able to identify the deployed build is a reason to delete LESS, not more: the file
  // that matches what is pasted into Bubble may be one of these, and there would be no other copy
  // of it. Keep the most recent and say why it was chosen this way.
  const hashed = entries.filter((name) => HASHED.test(name));
  let newest = null;
  let newestTime = -Infinity;
  for (const name of hashed) {
    try {
      const when = (await stat(resolve(distPath, name))).mtimeMs;
      if (when > newestTime) { newestTime = when; newest = name; }
    } catch { /* vanished; fine */ }
  }
  if (newest) {
    keep.add(newest);
    kept = newest;
    keptReason = deployed
      ? `the most recent build; bubble-html/statz-bundle.html names ${deployed}, which is not here`
      : 'the most recent build; no hash could be read from bubble-html/statz-bundle.html';
  }
}

const doomed = entries.filter((name) => HASHED.test(name) && !keep.has(name));

let bytes = 0;
for (const name of doomed) {
  try { bytes += (await stat(resolve(distPath, name))).size; } catch { /* vanished; fine */ }
}
const megabytes = (bytes / (1024 * 1024)).toFixed(1);

if (doomed.length === 0) {
  console.log('Nothing to clean: no superseded builds in dist/.');
  process.exit(0);
}

if (dryRun) {
  console.log(`Would remove ${doomed.length} superseded build(s), ${megabytes} MB.`);
} else {
  for (const name of doomed) await rm(resolve(distPath, name), { force: true });
  console.log(`Removed ${doomed.length} superseded build(s), ${megabytes} MB.`);
}

if (kept) {
  console.log(`Kept ${kept} — ${keptReason}.`);
} else {
  console.log('Note: no hashed build was present to keep.');
}
