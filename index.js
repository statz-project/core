import * as utils from "./utils.js";
import * as formatUtils from "./format_utils.js";
import * as stringUtils from "./string_utils.js";
import * as loader from "./loader.js";
import jsonUtils from "./json_utils.js";

export const Statz = {
  ...utils,
  ...formatUtils,
  ...stringUtils,
  ...loader,
  ...jsonUtils
};

if (typeof window !== "undefined") {
  window.Statz = Statz;
  // Backwards compatibility for existing Bubble code
  window.Utils = window.Utils || window.Statz;
}
