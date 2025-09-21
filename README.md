# Stat-z Core

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Stat-z is a hybrid platform:
- Bubble-based SaaS to provide accessible statistical analysis for non-experts.
- Open-source analytical core in JavaScript, shared here for academic and technical collaboration.

This repository contains the JavaScript analytical core used by Stat-z:
- Handling and compacting tabular data in JSON.
- Descriptive functions (frequencies, means, medians, IQR, etc.).
- Basic statistical tests (Chi-square, Fisher, Mann-Whitney, Kruskal-Wallis, Dunn).
- Table conversion and export (HTML, Markdown).

---

## Stack

- JavaScript (Core): analytical functions (`window.Statz.*`) -> this repository.
- Bubble (SaaS): UI/UX, integration with workflows, users, and reports (closed-source).
- R (external APIs): advanced analyses (regressions, mixed models, joinpoint).

---

## Usage

You can include the core functions in any web project.
Example (using `summarize_q_q`):

```js
const predictor = ["Male","Male","Female","Female"];
const response  = ["Yes","No","Yes","No"];

const result = window.Statz.summarize_q_q(predictor, response);

console.log(result);
```

---

## Column Variants

The module `core/json/variants.js` provides the transformation toolbox used to create derived versions of any imported column. Every column parsed by `parseColumns` carries a seeded variant at index `0` (`{ var_label: "Original", ... }`). That snapshot keeps the untouched values available for selections and for chaining multiple transforms without re-importing the data.

Key exports:

- `createVariant(baseCol, config)` — decodes the source column (or another variant), applies the requested operations, and returns a new variant object containing factor-encoded values plus action/warning metadata. Supported operations include replacements, merges, missing-value fills, list subsetting, numeric coercion, interval cuts (`cut`), numeric transforms (`log`, `sqrt`, etc.), and frequency-based ordering.
- `VARIANT_TEMPLATES` — grouped presets Bubble can surface to users. Templates are grouped by base type (`q`, `n`, `l`) and describe which configuration keys are typically required in the UI.

Example (coerce numeric values and cut into bins):

```js
const original = db.columns.find(c => c.col_hash === 'age_hash');
const coerced = window.Statz.createVariant(original, { kind: 'numeric', var_label: 'Age (numeric)', forceNumeric: {} });
const binned = window.Statz.createVariant(
  { ...original, col_vars: [original.col_vars[0], coerced] },
  { sourceVarIndex: 1, kind: 'cut', var_label: 'Age (10y bins)', cut: { width: 10 } }
);
```

Each variant returned by `createVariant` is safe to push into `col_vars`; later selections can reference it through `col_var_index`. Metadata (`variant.meta`) includes `actions`, `warnings`, and additional context (e.g., interval breaks) that the Bubble UI can display before committing changes.

---
## Mission

Democratize access to statistical analysis so researchers, students, and professionals can run reliable analyses without having to master R, SPSS, or other specialized software.

---

## Contributing

- Suggest improvements or fixes via Issues.
- Propose new statistical functions via Pull Requests.
- Join feature discussions in the forum (link coming soon).

Looking to contribute? Check Issues labeled "good first issue". See the full guide:

- CONTRIBUTING: see `CONTRIBUTING.md` in this repository or visit:
  https://github.com/statz-project/core/blob/main/CONTRIBUTING.md

---

## License

This repository is licensed under AGPL v3. This means:

- You may use, modify, and redistribute the code.
- If you publish a fork or an integration based on this core, you must also keep it open.
- The Stat-z SaaS (UI, Bubble infrastructure, R servers) is not covered by this license and remains closed.

---

## Roadmap (Core JS)

- [ ] Expand nonparametric tests (paired Wilcoxon, Friedman).
- [ ] Implement ANOVA + Tukey (parametric).
- [ ] Add support for basic GLM models.

---

## Links

- Official site (SaaS): [coming soon]
- Contact: [virgolinorr@gmail.com/LinkedIn]

---

## Build (for contributors)

- Install deps: `npm ci`
- Build bundle: `npm run build`
- Watch mode: `npm run watch`
- Build script location: `scripts/build.mjs`

After building, paste `bubble-html/statz-bundle.html` into a single HTML element in Bubble (free-plan compatible). The global namespace is `window.Statz` (and `window.Utils` as an alias).

