/* Opt-in DOM bindings for plain-text UI. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.applyI18n = factory();
})(globalThis, function () {
  "use strict";

  const selector = "[data-i18n], [data-i18n-aria-label], [data-i18n-placeholder], [data-i18n-title], [data-i18n-alt]";
  const attributes = ["aria-label", "placeholder", "title", "alt"];
  const textElements = new Set([
    "a", "button", "caption", "div", "em", "figcaption", "h1", "h2", "h3",
    "h4", "h5", "h6", "label", "legend", "li", "option", "p", "small", "span",
    "strong", "summary", "td", "th", "title", "desc", "text", "tspan",
  ]);

  function applyI18n(root, i18n, paramsFor = () => undefined) {
    const elements = Array.from(root.querySelectorAll(selector));
    if (root.nodeType === 1 && root.matches(selector)) elements.unshift(root);

    for (const element of elements) {
      function translate(marker) {
        const key = element.getAttribute(marker);
        if (!key) return undefined;
        return i18n.t(key, paramsFor(element, key));
      }

      // Use a marked leaf inside a mixed-content element to preserve its children.
      if (textElements.has(element.localName) && element.childElementCount === 0) {
        const text = translate("data-i18n");
        if (text !== undefined && element.textContent !== text) element.textContent = text;
      }

      for (const attribute of attributes) {
        const text = translate("data-i18n-" + attribute);
        if (text !== undefined && element.getAttribute(attribute) !== text) {
          element.setAttribute(attribute, text);
        }
      }
    }
  }

  return applyI18n;
});
