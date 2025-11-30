// @ts-check
// Extracted from bubble/scripts_html/core_utils.html and list_utils.html

/**
 * Dynamically append a <script> tag if not already present.
 * @param {string} src URL of the script
 * @param {(() => void)=} fun Optional callback on load
 */
export function loadScript(src, fun) {
  // Verify if the library was loaded
  if (typeof document !== 'undefined' && document.querySelector('script[src="' + src + '"]')) {
    if (fun != null) fun();
    return;
  }
  // Create <script> tag dynamically
  if (typeof document !== 'undefined') {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = function () { if (fun != null) fun(); };
    document.head.appendChild(script);
  }
}

/**
 * Convert a Bubble list proxy (with length()/get()) to a plain array.
 * @param {any} list Bubble list-like object
 * @returns {any[]}
 */
export function listAsArray(list) {
  if (!list) return [];
  const len = list?.length?.() ?? 0;
  const arr = list.get?.(0, len) ?? [];
  return arr;
}

/**
 * Filter array by a boolean mask.
 * @template T
 * @param {T[]} arr
 * @param {boolean[]} subsetMask
 * @returns {T[]}
 */
export function subset(arr, subsetMask) {
  return (arr || []).filter((_, i) => subsetMask?.[i]);
}
