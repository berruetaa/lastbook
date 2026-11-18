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

  const ownedMetadata = new WeakMap();
  const ownedValues = new WeakMap();
  const rtlScripts = new Set([
    "Adlm", "Arab", "Hebr", "Mand", "Mend", "Nkoo", "Rohg", "Samr", "Syrc", "Thaa",
  ]);

  function direction(locale) {
    if (typeof Intl.Locale !== "function") return undefined;
    const tag = new Intl.Locale(locale);
    const info = typeof tag.getTextInfo === "function" ? tag.getTextInfo() : tag.textInfo;
    if (info) return info.direction;
    const script = tag.maximize().script;
    return script ? (rtlScripts.has(script) ? "rtl" : "ltr") : undefined;
  }

  function setMetadata(element, attribute, value) {
    let owned = ownedMetadata.get(element);
    const previous = owned?.get(attribute);
    const current = element.getAttribute(attribute);

    // A host-authored value takes precedence, even after an earlier render.
    if (previous !== undefined && previous !== current) owned.delete(attribute);
    if (current !== null && owned?.get(attribute) !== current) return;
    if (attribute === "lang" && element.hasAttribute("xml:lang")) value = undefined;

    if (value === undefined) {
      if (current !== null) element.removeAttribute(attribute);
      owned?.delete(attribute);
      return;
    }
    if (current !== value) element.setAttribute(attribute, value);
    if (!owned) {
      owned = new Map();
      ownedMetadata.set(element, owned);
    }
    owned.set(attribute, value);
  }

  function prepareElement(element, i18n, paramsFor) {
    const bindings = attributes.map(attribute => ["data-i18n-" + attribute, attribute]);
    const stableOption = element.localName !== "option" || element.hasAttribute("value");
    if (textElements.has(element.localName) && stableOption && element.childElementCount === 0) {
      bindings.unshift(["data-i18n", null]);
    }

    let locale;
    const updates = [];
    for (const [marker, attribute] of bindings) {
      const key = element.getAttribute(marker);
      if (!key) continue;
      const result = i18n.resolve(key, paramsFor(element, key));
      if (!result) continue;
      if (locale && locale !== result.locale) {
        throw new RangeError("Translations on the same element resolve to different locales: " + key);
      }
      locale = result.locale;
      updates.push([attribute, result.text]);
    }

    const directionAttribute = element.namespaceURI === "http://www.w3.org/2000/svg" ? "direction" : "dir";
    return { element, updates, locale, directionAttribute, dir: locale ? direction(locale) : undefined };
  }

  function writeBindings(element, updates) {
    const previous = ownedValues.get(element) || new Map();
    const next = new Map();
    const slots = new Map(updates);
    for (const attribute of new Set([...previous.keys(), ...slots.keys()])) {
      if (attribute === null && (element.childElementCount !== 0 ||
          (element.localName === "option" && !element.hasAttribute("value")))) continue;
      const current = attribute === null ? element.textContent : element.getAttribute(attribute);
      const former = previous.get(attribute);
      const original = former?.text === current ? former.original : current;
      const text = slots.has(attribute) ? slots.get(attribute) : original;
      if (slots.has(attribute)) next.set(attribute, { original, text });
      if (current === text) continue;
      if (attribute === null) element.textContent = text;
      else if (text === null) element.removeAttribute(attribute);
      else element.setAttribute(attribute, text);
    }
    if (next.size) ownedValues.set(element, next);
    else ownedValues.delete(element);
  }

  function applyI18n(root, i18n, paramsFor = () => undefined) {
    const elements = Array.from(root.querySelectorAll(selector));
    if (root.nodeType === 1 && root.matches(selector)) elements.unshift(root);

    // Resolve all keys and params before writing. Validation errors leave the UI intact.
    const plans = elements.map(element => prepareElement(element, i18n, paramsFor));
    for (const { element, updates, locale, directionAttribute, dir } of plans) {
      writeBindings(element, updates);
      setMetadata(element, "lang", locale);
      setMetadata(element, directionAttribute, dir);
    }
  }

  return applyI18n;
});
