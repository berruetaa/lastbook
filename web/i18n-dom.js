/* Explicit, opt-in bindings for first-party UI. Does not observe or rewrite
   arbitrary text or library content. Call again after rendering new UI. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.applyI18n = factory();
})(globalThis, function () {
  "use strict";

  const bindings = [
    ["data-i18n", null],
    ["data-i18n-aria-label", "aria-label"],
    ["data-i18n-placeholder", "placeholder"],
    ["data-i18n-title", "title"],
    ["data-i18n-alt", "alt"],
  ];
  const selector = bindings.map(([marker]) => "[" + marker + "]").join(",");

  function applyI18n(root, i18n, paramsFor = () => undefined) {
    const elements = [...root.querySelectorAll(selector)];
    if (root.nodeType === 1 && root.matches(selector)) elements.unshift(root);

    for (const element of elements) {
      let language;
      for (const [marker, target] of bindings) {
        const key = element.getAttribute(marker);
        if (!key) continue;
        // Never erase SVGs, nested controls or other child markup.
        if (target === null && element.childElementCount !== 0) continue;
        const result = i18n.resolve(key, paramsFor(element, key));
        if (!result) continue;  // Original English remains readable.
        if (target === null) element.textContent = result.text;
        else element.setAttribute(target, result.text);
        if (!language) language = result.locale;
      }
      if (language) element.setAttribute("lang", language);
    }
  }

  return applyI18n;
});
