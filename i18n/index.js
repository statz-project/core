// @ts-check

export const DEFAULT_LANG = 'en_us';

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
        "summarizeFailure": "Erro ao resumir \"{label}\" em \"{context}\"",
        "pairedMixedTypes": "Análise pareada requer respostas do mesmo tipo; obteve {types}.",
        "pairedNonBinaryQ": "Análise pareada qualitativa requer níveis binários; obteve {levels} níveis.",
        "pairedListNotSupported": "Análise pareada para respostas de tipo lista ainda não é suportada.",
        "pairedTooFewMomentos": "Análise pareada requer ao menos 2 momentos.",
        "llSubsetRequired": "Análise lista × lista requer um subconjunto de itens em ambos predictor e response.",
        "multiDbMissingResponse": "A response \"{label}\" não está presente em todos os databases dos predictors: faltando em {databases}.",
        "pairedMultiDbNotAllowed": "Análise pareada requer todas as responses do mesmo database; obteve {databases}."
      },
      "mapping": {
        "invalid": "Mapeamento inválido para \"{label}\"",
        "multiple": "Múltiplas correspondências para \"{label}\"",
        "nomatch": "Nenhuma correspondência para \"{label}\"",
        "old_dropped": "Coluna antiga \"{label}\" não mapeada e será removida"
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
        "moreSuffix": " (e mais {count})",
        "cascadeDeleted": "Variante \"{label}\" também foi removida (cascade) porque dependia da variante deletada."
      },
      "templates": {
        "search_replace": {
          "q": "Buscar e substituir níveis",
          "l": "Buscar e substituir valores"
        },
        "merge_levels": {
          "q": "Mesclar níveis",
          "l": "Mesclar valores"
        },
        "subset": "Manter subconjunto",
        "fill_missing": "Preencher células vazias",
        "sort_frequency": "Ordenar por frequência",
        "sort_levels": "Ordenar níveis",
        "coerce_numeric": "Forçar numérico",
        "cut_intervals": "Dividir em intervalos",
        "transform": "Aplicar transformação"
      }
    },
    "tests": {
      "fisherExact": "Teste exato de Fisher",
      "chiSquare": "Qui-quadrado",
      "anova": "ANOVA",
      "kruskalWallis": "Kruskal-Wallis",
      "mannWhitney": "Mann-Whitney",
      "tStudent": "t de Student",
      "pearson": "Correlação de Pearson",
      "spearman": "Correlação de Spearman",
      "pairedT": "t pareado",
      "wilcoxonSigned": "Wilcoxon (postos com sinais)",
      "mcnemar": "McNemar",
      "cochranQ": "Q de Cochran",
      "friedman": "Friedman",
      "rmAnova": "ANOVA de medidas repetidas"
    },
    "popupVariables": {
      "warnings": {
        "pairedNeedsMomentos": "Análise pareada precisa de 2 ou mais responses deste database.",
        "pairedSameDbRequired": "Análise pareada requer todas as responses do mesmo database.",
        "singleResponseRequired": "Apenas uma response é permitida para análise inferencial.",
        "pairedNoPredictors": "Análise pareada não usa predictors.",
        "predictorRequired": "Selecione ao menos um predictor."
      }
    },
    "stats": {
      "labels": {
        "min": "Mínimo",
        "max": "Máximo",
        "range": "Amplitude",
        "mean_sd": "Média ± DP",
        "median_iqr": "Mediana ± IQR",
        "mode": "Moda",
        "n": "n",
        "n_missing": "Valores ausentes"
      }
    },
    "import": {
      "warnings": {
        "numericCoerced": "linha {row}: {original} → {parsed}",
        "numericDropped": "linha {row}: {original} (não numérico)"
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
        "summarizeFailure": "Error summarizing \"{label}\" in \"{context}\"",
        "pairedMixedTypes": "Paired analysis requires responses of the same type; got {types}.",
        "pairedNonBinaryQ": "Qualitative paired analysis requires binary levels; got {levels} levels.",
        "pairedListNotSupported": "Paired analysis for list-type responses is not yet supported.",
        "pairedTooFewMomentos": "Paired analysis requires at least 2 momentos.",
        "llSubsetRequired": "List × list analysis requires a subset of items in both predictor and response.",
        "multiDbMissingResponse": "Response \"{label}\" is not present in every database used by predictors: missing in {databases}.",
        "pairedMultiDbNotAllowed": "Paired analysis requires all responses from the same database; got {databases}."
      },
      "mapping": {
        "invalid": "Invalid mapping for \"{label}\"",
        "multiple": "Multiple matches for \"{label}\"",
        "nomatch": "No match for \"{label}\"",
        "old_dropped": "Old column \"{label}\" not mapped and will be dropped"
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
        "moreSuffix": " (and {count} more)",
        "cascadeDeleted": "Variant \"{label}\" was also removed (cascade) because it depended on the deleted variant."
      },
      "templates": {
        "search_replace": {
          "q": "Search & replace levels",
          "l": "Search & replace values"
        },
        "merge_levels": {
          "q": "Merge levels",
          "l": "Merge values"
        },
        "subset": "Keep subset",
        "fill_missing": "Fill empty cells",
        "sort_frequency": "Sort by frequency",
        "sort_levels": "Sort levels",
        "coerce_numeric": "Force numeric",
        "cut_intervals": "Cut into intervals",
        "transform": "Apply transform"
      }
    },
    "tests": {
      "fisherExact": "Fisher’s exact test",
      "chiSquare": "Chi-square",
      "anova": "ANOVA",
      "kruskalWallis": "Kruskal–Wallis",
      "mannWhitney": "Mann–Whitney",
      "tStudent": "Student’s t-test",
      "pearson": "Pearson correlation",
      "spearman": "Spearman correlation",
      "pairedT": "Paired t-test",
      "wilcoxonSigned": "Wilcoxon signed-rank",
      "mcnemar": "McNemar",
      "cochranQ": "Cochran’s Q",
      "friedman": "Friedman",
      "rmAnova": "Repeated-measures ANOVA"
    },
    "popupVariables": {
      "warnings": {
        "pairedNeedsMomentos": "Paired analysis needs 2 or more responses from this database.",
        "pairedSameDbRequired": "Paired analysis requires all responses from the same database.",
        "singleResponseRequired": "Only one response is allowed for inferential analysis.",
        "pairedNoPredictors": "Paired analysis does not use predictors.",
        "predictorRequired": "Select at least one predictor."
      }
    },
    "stats": {
      "labels": {
        "min": "Minimum",
        "max": "Maximum",
        "range": "Range",
        "mean_sd": "Mean ± SD",
        "median_iqr": "Median ± IQR",
        "mode": "Mode",
        "n": "n",
        "n_missing": "Missing values"
      }
    },
    "import": {
      "warnings": {
        "numericCoerced": "row {row}: {original} → {parsed}",
        "numericDropped": "row {row}: {original} (not numeric)"
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
        "summarizeFailure": "Error al resumir \"{label}\" en \"{context}\"",
        "pairedMixedTypes": "El análisis pareado requiere respuestas del mismo tipo; obtuvo {types}.",
        "pairedNonBinaryQ": "El análisis pareado cualitativo requiere niveles binarios; obtuvo {levels} niveles.",
        "pairedListNotSupported": "El análisis pareado para respuestas de tipo lista aún no es compatible.",
        "pairedTooFewMomentos": "El análisis pareado requiere al menos 2 momentos.",
        "llSubsetRequired": "El análisis lista × lista requiere un subconjunto de elementos en ambos predictor y response.",
        "multiDbMissingResponse": "La response \"{label}\" no está presente en todas las bases de datos de los predictors: falta en {databases}.",
        "pairedMultiDbNotAllowed": "El análisis pareado requiere todas las responses de la misma base de datos; obtuvo {databases}."
      },
      "mapping": {
        "invalid": "Asignación no válida para \"{label}\"",
        "multiple": "Múltiples coincidencias para \"{label}\"",
        "nomatch": "Sin coincidencia para \"{label}\"",
        "old_dropped": "La columna anterior \"{label}\" no está mapeada y se eliminará"
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
        "moreSuffix": " (y {count} más)",
        "cascadeDeleted": "La variante \"{label}\" también fue eliminada (cascada) porque dependía de la variante eliminada."
      },
      "templates": {
        "search_replace": {
          "q": "Buscar y reemplazar niveles",
          "l": "Buscar y reemplazar valores"
        },
        "merge_levels": {
          "q": "Combinar niveles",
          "l": "Combinar valores"
        },
        "subset": "Mantener subconjunto",
        "fill_missing": "Rellenar celdas vacías",
        "sort_frequency": "Ordenar por frecuencia",
        "sort_levels": "Ordenar niveles",
        "coerce_numeric": "Forzar numérico",
        "cut_intervals": "Dividir en intervalos",
        "transform": "Aplicar transformación"
      }
    },
    "tests": {
      "fisherExact": "Prueba exacta de Fisher",
      "chiSquare": "Chi-cuadrado",
      "anova": "ANOVA",
      "kruskalWallis": "Kruskal–Wallis",
      "mannWhitney": "Mann–Whitney",
      "tStudent": "t de Student",
      "pearson": "Correlación de Pearson",
      "spearman": "Correlación de Spearman",
      "pairedT": "t pareada",
      "wilcoxonSigned": "Wilcoxon (rangos con signo)",
      "mcnemar": "McNemar",
      "cochranQ": "Q de Cochran",
      "friedman": "Friedman",
      "rmAnova": "ANOVA de medidas repetidas"
    },
    "popupVariables": {
      "warnings": {
        "pairedNeedsMomentos": "El análisis pareado necesita 2 o más responses de esta base de datos.",
        "pairedSameDbRequired": "El análisis pareado requiere todas las responses de la misma base de datos.",
        "singleResponseRequired": "Sólo se permite una response para el análisis inferencial.",
        "pairedNoPredictors": "El análisis pareado no usa predictors.",
        "predictorRequired": "Seleccione al menos un predictor."
      }
    },
    "stats": {
      "labels": {
        "min": "Mínimo",
        "max": "Máximo",
        "range": "Rango",
        "mean_sd": "Media ± DE",
        "median_iqr": "Mediana ± RIC",
        "mode": "Moda",
        "n": "n",
        "n_missing": "Valores ausentes"
      }
    },
    "import": {
      "warnings": {
        "numericCoerced": "fila {row}: {original} → {parsed}",
        "numericDropped": "fila {row}: {original} (no numérico)"
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
