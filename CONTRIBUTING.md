# Contributing to Stat‑z Core

Thanks for your interest in improving Stat‑z! This guide explains how to work on the JavaScript core and submit changes.

## Project Structure

- `core/` - modular ES modules exported as `window.Statz` for the Bubble app and the web.
  - `utils.js`, `format_utils.js`, `string_utils.js`, `loader.js`
  - `json/` - analytical modules
    - `factors.js`, `contingency.js`, `numeric.js`, `exporters.js`, `driver.js`
  - `json_utils.js` - aggregates JSON/stat functions from `json/` for the public API
- `scripts/build.mjs` - esbuild bundler that produces:
  - `dist/statz-core.js` (minified IIFE bundle)
  - `dist/statz-core.v<version>.<hash>.js` (cache-busted)
  - `bubble-html/statz-bundle.html` - single line <script> for Bubble

## Setup

1. Install Node.js 18+.
2. Install deps:
   - `npm ci` (or `npm install`)
3. Build:
   - `npm run build`
4. Bubble usage:
   - Copy the contents of `bubble-html/statz-bundle.html` into a single HTML element in Bubble.
   - The namespace is available as `window.Statz` (and `window.Utils` as a compatibility alias).

## Testing

- The test harness uses Node's built-in runner (`node --test`).
- Place new test files under `core/test/` and name them `*.test.mjs`.
- Run all tests with `npm run test` from the `core/` directory.
- You can target a specific file while iterating: `node --test test/your-file.test.mjs`.
- Keep tests deterministic and avoid relying on network calls; stub random behavior where needed.

## Coding Style

- Use modern ES modules; avoid adding global variables. The bundle attaches to `window.Statz` in `core/index.js`.
- Public API docs:
  - Add concise JSDoc to exported functions (parameters, return types, brief description).
  - Enable `// @ts-check` at the top of files to leverage editor type checking.
  - Prefer typedefs for shared shapes (e.g., `Column`, `TableLike`).
- Comments: favor clear naming; add comments for rationale and non-obvious logic. Avoid noisy inline comments.
- Keep changes minimal and focused; do not reformat unrelated files.

## External Libraries

- Compatibility with Bubble free plan is critical:
  - Do not rely on `<script>` header tags. Use dynamic loading via `loader.js` (`loadScriptP`, `initDeps`).
- jStat and simple-statistics are loaded from CDN with fallbacks.
- We intentionally keep these deps out of the generated bundle so `bubble-html/statz-bundle.html` stays small for Bubble; they continue to load on demand via CDN, and we still list them in package.json so GitHub/Dependabot can index the dependencies.
- `@stdlib/stats@0.3.2` is dynamically imported through jsDelivr’s `+esm` endpoint so its dependencies stay pinned.
- `plotly.js-cartesian-dist-min@2.35.2` (~500 KB) is loaded eagerly by `initDeps` for chart rendering (`runAnalysis` with `options.mode = 'chart'`). It attaches `window.Plotly`; `loadPlotly` mirrors it to `ns.plotly`. The cartesian dist covers scatter, bar, box, violin, and heatmap — all chart types in the analysis matrix; switch to `plotly.js-dist-min` only if 3D/maps/polar are ever needed.
- Before running statistical routines, call `window.Statz.health()` (`Statz.health()` in Node) to confirm the adapters are loaded. `health()` now reports `plotly` alongside `jStat`, `simpleStatistics`, and `stdlib`.

## Content hashes (`refreshDatabaseHashes` / `refreshColumnHashes`)

- Every mutating helper that touches column values, variants, or their metadata **must end with a hash refresh** — otherwise the reactive UI can't detect the change and Elements go stale.
- Two helpers, pick based on scope of the mutation:
  - **1 specific column changed?** Use `snapshots.refreshColumnHashes(database, colHash)` — O(1) column lookup + O(variants) hashing. Fast path.
  - **Many columns changed?** Use `snapshots.refreshDatabaseHashes(database)` — full sweep.
- Auto-hooked entry points today:
  - `parseColumns` ([factors.js](json/factors.js)) — full DB, `refreshDatabaseHashes`.
  - `applyColumnMappings` ([driver.js](json/driver.js)) — full DB, `refreshDatabaseHashes`.
  - `addVariant`, `replaceVariantAt`, `removeVariantAt` ([driver.js](json/driver.js)) — single column, `refreshColumnHashes(database, colHash)`.
- Standalone helpers that return a new column (e.g., `recodeColumn`, `applyReplacements`, `applyProcessing`) don't auto-refresh — the caller reassembles the database and is responsible for calling `refreshColumnHashes` (if only that column was touched) or `refreshDatabaseHashes` (if multiple).
- The `snapshots` module is intentionally **decoupled from `driver.js`** (imports only `hashing.js` + `variants.js`) so it stays safe against circular-import TDZ. New code in `snapshots.js` should preserve that: don't add imports pointing back to `driver.js` or `contingency.js`/`numeric.js`.
- Adding a new field to `col_values` / `meta.processing` / `meta.recipe`? Verify it's covered by `hashColumn` / `hashVariant` in [snapshots.js](json/snapshots.js). If it should NOT affect the hash (purely cosmetic), leave it out; if it should, add it to the canonical shape.

## Chart rendering & export

- The chart pipeline is **spec-only in the core**: `runAnalysis({mode:'chart'})` emits Plotly figure specs in `entry.chart.spec`; no rendering happens inside the core.
- For on-screen display, `exportCombinedAsChartHTML` produces a `<div class="statz-chart-grid">` fragment with one `<div class="statz-chart" data-spec="...">` per entry. `window.Statz.renderCharts(rootEl)` sweeps those placeholders and invokes `Plotly.newPlot` per cell (idempotent via `data-rendered="1"`).
- For DOCX/PDF export, three helpers convert specs to base64 images via off-screen rendering + `Plotly.toImage`:
  - `chartSpecToImage(spec, {width?, height?, format?})` — single spec → data URL (Promise).
  - `chartSpecsToImages(specs, options)` — batch (serial).
  - `analysisResultToImages(resultObj, options)` — walks `result.analysis`, returns `[{predictor, response, image, warning}]`; warning entries pass through with `image: null`. The DOCX layer (e.g., `docx` npm) then assembles the document from these primitives.
- Do not set esbuild `globalName` to `Statz` (we already assign `window.Statz` in `core/index.js`).

## Build Output Rules

- The HTML output must be a single-line `<script>...</script>`:
  - The build step escapes `</script>`, removes newlines, and collapses `>\s+<` to `><`.
  - The bundle uses `charset: 'utf8'` so strings like "Variável" are preserved.

## Submitting Changes

1. Fork the repo and create a feature branch.
2. Make focused commits with clear messages.
3. Ensure `npm run build` succeeds and that `bubble-html/statz-bundle.html` loads in a browser/Bubble console:
   - `window.Statz.health()` logs adapters;
   - `window.Statz.runAnalysis(...)` works on sample inputs.
4. Open a Pull Request describing the change, rationale, and any notes for Bubble integration.

## Scope & Roadmap

- Focus areas (see `core/README.md`):
  - Add tests and functions for nonparametric workflows (e.g., paired Wilcoxon, Friedman).
  - Implement parametric ANOVA + Tukey.
  - Add basic GLM support.

## Questions

Open an Issue with a minimal reproduction or the file/line context where you propose the change. We're happy to help.

## Notes on Publishing

- This repository is currently not published as an npm package.
- Consumers should use the generated bundle (`bubble-html/statz-bundle.html`) or clone the repo and import modules directly.








