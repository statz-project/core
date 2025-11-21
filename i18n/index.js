// @ts-check

const DEFAULT_LANG = 'en_us';

const LANGUAGE_ALIASES = {
  pt: 'pt_br',
  'pt-br': 'pt_br',
  en: 'en_us',
  'en-us': 'en_us',
  es: 'es_es',
  'es-es': 'es_es'
};

const MESSAGES = {
  "pt_br": {
    "table": {
      "title": "Tabela",
      "columns": {
        "variable": "Variável",
        "description": "Descrição",
        "group": "Grupo",
        "pValue": "p-valor",
        "groupA": "Grupo A",
        "groupB": "Grupo B",
        "significant": "Significativo"
      },
      "missing": "Não informado",
      "missingValue": "—",
      "legends": {
        "heading": "Legenda:",
        "residualGreaterSymbol": "†",
        "residualGreater": "Frequência maior que o esperado",
        "residualLowerSymbol": "*",
        "residualLower": "Frequência menor que o esperado",
        "percentByColumn": "Os percentuais referem-se ao total de cada coluna",
        "percentByRow": "Os percentuais referem-se ao total de cada linha",
        "percentTotalFull": "Os percentuais consideram todos os registros, incluindo ausentes"
      }
    },
    "binary": {
      "yes": "Sim",
      "no": "Não"
    },
    "warnings": {
      "summarizeFailure": "Erro ao resumir \"{label}\" em \"{context}\""
    },
    "errors": {
      "stdlibNotLoaded": "Erro: stdlib não carregado",
      "calculationFailed": "Erro no cálculo"
    },
    "posthoc": {
      "title": "Comparações múltiplas significativas",
      "comparisonEntry": "Comparações significativas para \"{predictor}\": {comparisons}",
      "comparisonPair": "“{groupA}” <i>versus</i> “{groupB}” (p={pValue})",
      "significantSymbol": "✔"
    },
    "variants": {
      "warnings": {
        "searchReplace": "Buscar e substituir: {details}",
        "numericCoercionReplacements": "Conversão numérica: substituições {details}{extra}",
        "numericCoercionRemovedRows": "Conversão numérica: linhas removidas {details}{extra}",
        "transformSkipped": "Transformação \"{fn}\" ignorou linhas: {details}{extra}",
        "cutNoNumeric": "Classificação: nenhum valor numérico para agrupar.",
        "cutInvalidIntervals": "Classificação: não foi possível gerar intervalos válidos.",
        "cutOutsideValues": "Classificação: {count} valores fora dos intervalos definidos.",
        "moreSuffix": " (e mais {count})"
      }
    },
    "tests": {
      "fisherExact": "Teste exato de Fisher",
      "chiSquare": "Qui-quadrado",
      "anova": "ANOVA",
      "kruskalWallis": "Kruskal-Wallis",
      "mannWhitney": "Mann-Whitney",
      "tStudent": "t de Student"
    },
    "stats": {
      "labels": {
        "min": "Mínimo",
        "max": "Máximo",
        "range": "Amplitude",
        "mean_sd": "Média (DP)",
        "median_iqr": "Mediana (IQR)",
        "mode": "Moda",
        "n": "n",
        "n_missing": "Valores ausentes"
      }
    }
  },
  "en_us": {
    "table": {
      "title": "Table",
      "columns": {
        "variable": "Variable",
        "description": "Description",
        "group": "Group",
        "pValue": "p-value",
        "groupA": "Group A",
        "groupB": "Group B",
        "significant": "Significant"
      },
      "missing": "Not informed",
      "missingValue": "—",
      "legends": {
        "heading": "Legend:",
        "residualGreaterSymbol": "†",
        "residualGreater": "Frequency higher than expected",
        "residualLowerSymbol": "*",
        "residualLower": "Frequency lower than expected",
        "percentByColumn": "Percentages refer to the total of each column",
        "percentByRow": "Percentages refer to the total of each row",
        "percentTotalFull": "Percentages consider all records, including missing values"
      }
    },
    "binary": {
      "yes": "Yes",
      "no": "No"
    },
    "warnings": {
      "summarizeFailure": "Error summarizing \"{label}\" in \"{context}\""
    },
    "errors": {
      "stdlibNotLoaded": "Error: stdlib not loaded",
      "calculationFailed": "Calculation error"
    },
    "posthoc": {
      "title": "Significant multiple comparisons",
      "comparisonEntry": "Significant comparisons for \"{predictor}\": {comparisons}",
      "comparisonPair": "“{groupA}” <i>versus</i> “{groupB}” (p={pValue})",
      "significantSymbol": "✔"
    },
    "variants": {
      "warnings": {
        "searchReplace": "Search & replace: {details}",
        "numericCoercionReplacements": "Numeric coercion replacements: {details}{extra}",
        "numericCoercionRemovedRows": "Numeric coercion removed rows: {details}{extra}",
        "transformSkipped": "Transform \"{fn}\" skipped rows: {details}{extra}",
        "cutNoNumeric": "Cut: no numeric values to bin.",
        "cutInvalidIntervals": "Cut: unable to build valid intervals.",
        "cutOutsideValues": "Cut: {count} values outside defined breaks.",
        "moreSuffix": " (and {count} more)"
      }
    },
    "tests": {
      "fisherExact": "Fisher’s exact test",
      "chiSquare": "Chi-square",
      "anova": "ANOVA",
      "kruskalWallis": "Kruskal–Wallis",
      "mannWhitney": "Mann–Whitney",
      "tStudent": "Student’s t-test"
    },
    "stats": {
      "labels": {
        "min": "Minimum",
        "max": "Maximum",
        "range": "Range",
        "mean_sd": "Mean (SD)",
        "median_iqr": "Median (IQR)",
        "mode": "Mode",
        "n": "n",
        "n_missing": "Missing values"
      }
    }
  },
  "es_es": {
    "table": {
      "title": "Tabla",
      "columns": {
        "variable": "Variable",
        "description": "Descripción",
        "group": "Grupo",
        "pValue": "Valor p",
        "groupA": "Grupo A",
        "groupB": "Grupo B",
        "significant": "Significativo"
      },
      "missing": "No informado",
      "missingValue": "—",
      "legends": {
        "heading": "Leyenda:",
        "residualGreaterSymbol": "†",
        "residualGreater": "Frecuencia mayor de la esperada",
        "residualLowerSymbol": "*",
        "residualLower": "Frecuencia menor de la esperada",
        "percentByColumn": "Los porcentajes se refieren al total de cada columna",
        "percentByRow": "Los porcentajes se refieren al total de cada fila",
        "percentTotalFull": "Los porcentajes consideran todos los registros, incluidos los ausentes"
      }
    },
    "binary": {
      "yes": "Sí",
      "no": "No"
    },
    "warnings": {
      "summarizeFailure": "Error al resumir \"{label}\" en \"{context}\""
    },
    "errors": {
      "stdlibNotLoaded": "Error: stdlib no cargada",
      "calculationFailed": "Error en el cálculo"
    },
    "posthoc": {
      "title": "Comparaciones múltiples significativas",
      "comparisonEntry": "Comparaciones significativas para \"{predictor}\": {comparisons}",
      "comparisonPair": "“{groupA}” <i>versus</i> “{groupB}” (p={pValue})",
      "significantSymbol": "✔"
    },
    "variants": {
      "warnings": {
        "searchReplace": "Buscar y reemplazar: {details}",
        "numericCoercionReplacements": "Conversión numérica: sustituciones {details}{extra}",
        "numericCoercionRemovedRows": "Conversión numérica: filas eliminadas {details}{extra}",
        "transformSkipped": "Transformación \"{fn}\" omitió filas: {details}{extra}",
        "cutNoNumeric": "Clasificación: sin valores numéricos para agrupar.",
        "cutInvalidIntervals": "Clasificación: no se pudieron generar intervalos válidos.",
        "cutOutsideValues": "Clasificación: {count} valores fuera de los intervalos definidos.",
        "moreSuffix": " (y {count} más)"
      }
    },
    "tests": {
      "fisherExact": "Prueba exacta de Fisher",
      "chiSquare": "Chi-cuadrado",
      "anova": "ANOVA",
      "kruskalWallis": "Kruskal–Wallis",
      "mannWhitney": "Mann–Whitney",
      "tStudent": "t de Student"
    },
    "stats": {
      "labels": {
        "min": "Mínimo",
        "max": "Máximo",
        "range": "Rango",
        "mean_sd": "Media (DE)",
        "median_iqr": "Mediana (RIC)",
        "mode": "Moda",
        "n": "n",
        "n_missing": "Valores ausentes"
      }
    }
  }
}

const SUPPORTED_LANGUAGES = Object.keys(MESSAGES);

const getGlobalStatz = () => {
  if (typeof globalThis !== 'undefined') {
    if (globalThis.Statz && typeof globalThis.Statz === 'object') return globalThis.Statz;
    if (globalThis.Utils && typeof globalThis.Utils === 'object') return globalThis.Utils;
  }
  return null;
};

const resolveDefaultLanguage = () => {
  const globalStatz = getGlobalStatz();
  const candidate = globalStatz?.DEFAULT_LANG;
  if (!candidate) return DEFAULT_LANG;
  const lowered = String(candidate).trim().toLowerCase();
  if (!lowered) return DEFAULT_LANG;
  const normalized = lowered.replace(/-/g, '_');
  if (MESSAGES[normalized]) return normalized;
  if (LANGUAGE_ALIASES[normalized]) return LANGUAGE_ALIASES[normalized];
  return DEFAULT_LANG;
};

/**
 * Normalize the requested language tag to a supported locale code.
 * @param {string|undefined|null} lang
 * @returns {string}
 */
export function normalizeLanguage(lang) {
  if (!lang) return resolveDefaultLanguage();
  const lowered = String(lang).trim().toLowerCase();
  if (!lowered) return resolveDefaultLanguage();
  const normalized = lowered.replace(/-/g, '_');
  if (MESSAGES[normalized]) return normalized;
  if (LANGUAGE_ALIASES[normalized]) return LANGUAGE_ALIASES[normalized];
  return resolveDefaultLanguage();
}

function getDictionary(lang) {
  const code = normalizeLanguage(lang);
  const fallback = resolveDefaultLanguage();
  return MESSAGES[code] || MESSAGES[fallback] || MESSAGES[DEFAULT_LANG];
}

function interpolate(template, vars = {}) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const value = vars[key];
      return value === undefined || value === null ? '' : String(value);
    }
    return match;
  });
}

/**
 * Translate a dotted key for the requested language.
 * @param {string} key
 * @param {string|undefined|null} lang
 * @param {Record<string, any>=} vars
 * @returns {any}
 */
export function translate(key, lang, vars = {}) {
  const code = normalizeLanguage(lang);
  const segments = key.split('.');
  let value = MESSAGES[code];
  for (const segment of segments) {
    if (value && Object.prototype.hasOwnProperty.call(value, segment)) {
      value = value[segment];
    } else {
      value = undefined;
      break;
    }
  }
  const fallbackCode = resolveDefaultLanguage();
  if (value === undefined && code !== fallbackCode) {
    return translate(key, fallbackCode, vars);
  }
  if (typeof value === 'string') {
    return interpolate(value, vars);
  }
  return value !== undefined ? value : key;
}

export const t = translate;

export function getTableHeaders(lang) {
  const code = normalizeLanguage(lang);
  return [
    translate('table.columns.variable', code),
    translate('table.columns.description', code)
  ];
}

export function getDefaultMissingLabel(lang) {
  return translate('table.missing', lang);
}

export function getBinaryLabels(lang) {
  const code = normalizeLanguage(lang);
  return {
    yes: translate('binary.yes', code),
    no: translate('binary.no', code)
  };
}

export function getSupportedLanguages() {
  return [...SUPPORTED_LANGUAGES];
}

export function getMessages(lang) {
  const dict = getDictionary(lang);
  return JSON.parse(JSON.stringify(dict));
}

const api = {
  DEFAULT_LANG,
  normalizeLanguage,
  translate,
  t: translate,
  getTableHeaders,
  getDefaultMissingLabel,
  getBinaryLabels,
  getSupportedLanguages,
  getMessages
};

export default api;
