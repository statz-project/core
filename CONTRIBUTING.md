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
  - `stdlib-js/stats` is dynamically imported as ESM.
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








