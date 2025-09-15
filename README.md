# Stat-z Core

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Stat-z is a hybrid platform:
- Bubble-based SaaS to provide accessible statistical analysis for non-experts.
- Open-source analytical core in JavaScript, shared here for academic and technical collaboration.

This repository contains the JavaScript analytical core used by Stat-z:
- Handling and compacting tabular data in JSON.
- Descriptive functions (frequencies, means, medians, IQR, etc.).
- Basic statistical tests (Chi-square, Fisher, Mann–Whitney, Kruskal–Wallis, Dunn).
- Table conversion and export (HTML, Markdown).

---

## Mission

Democratize access to statistical analysis so researchers, students, and professionals can run reliable analyses without having to master R, SPSS, or other specialized software.

---

## Stack

- JavaScript (Core): analytical functions (`window.Statz.*`) — this repository.
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

## Contributing

- Suggest improvements or fixes via Issues.
- Propose new statistical functions via Pull Requests.
- Join feature discussions in the forum (link coming soon).

Looking to contribute? Check Issues labeled “good first issue”. See the full guide:

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
