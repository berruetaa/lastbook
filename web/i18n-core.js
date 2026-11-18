/* Offline, dependency-free translations. Catalogs are trusted first-party data.
   Classic script: createI18n; Node tests: module.exports. No DOM or storage. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.createI18n = factory();
})(globalThis, function () {
  "use strict";

  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const variables = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  const keyPattern = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/;
  const pluralPattern = /^(zero|one|two|few|many|other|=(?:0|[1-9]\d*))$/;

  // Intl accepts Unicode locale identifiers, a well-defined subset of BCP 47.
  function canonical(tag) {
    if (typeof tag !== "string" || !tag) throw new TypeError("Expected an Intl locale identifier");
    return Intl.getCanonicalLocales(tag)[0];
  }

  // Reject getters, inherited entries, symbols and surprising object prototypes.
  // This also detaches all catalogue data from potentially mutable callers.
  function entries(object, label) {
    if (!object || ![Object.prototype, null].includes(Object.getPrototypeOf(object))) {
      throw new TypeError("Expected a plain object for " + label);
    }
    return Reflect.ownKeys(object).map(key => {
      const d = Object.getOwnPropertyDescriptor(object, key);
      if (typeof key !== "string" || !d.enumerable || !own(d, "value")) {
        throw new TypeError("Expected enumerable string data properties in " + label);
      }
      return [key, d.value];
    });
  }

  function table(object, label, parse) {
    const result = new Map();
    for (const [raw, value] of entries(object, label)) {
      const tag = canonical(raw);
      if (result.has(tag)) throw new TypeError("Duplicate locale " + tag + " in " + label);
      result.set(tag, parse(value, tag));
    }
    return result;
  }

  function signature(message, key, plural) {
    if (typeof message !== "string" || /[{}]/.test(message.replace(variables, ""))) {
      throw new TypeError("Invalid text or placeholder in " + key);
    }
    return [...new Set([...message.matchAll(variables)]
      .map(match => match[1]).filter(name => !plural || name !== "count"))].sort().join(",");
  }

  function catalogEntries(object, locale) {
    const result = new Map();
    for (const [key, value] of entries(object, "catalog " + locale)) {
      if (!keyPattern.test(key)) throw new TypeError("Invalid translation key " + key);
      if (typeof value === "string") {
        result.set(key, { text: value, schema: "text:" + signature(value, key, false) });
        continue;
      }
      const forms = new Map(entries(value, "plural " + key));
      if (!forms.has("other")) throw new TypeError("Missing 'other' plural in " + key);
      const expected = signature(forms.get("other"), key, true);
      for (const [form, message] of forms) {
        if (!pluralPattern.test(form)) throw new TypeError("Invalid plural form " + form + " in " + key);
        if (signature(message, key, true) !== expected) {
          throw new TypeError("Inconsistent placeholders in " + key);
        }
      }
      result.set(key, { forms, schema: "plural:" + expected });
    }
    return result;
  }

  function fallbackEntries(value, locale) {
    if (!Array.isArray(value)) throw new TypeError("Fallbacks for " + locale + " must be an array");
    return value.map(canonical);
  }

  function resolveChain(tag, routes, fallbackLocale, withDefault) {
    const seen = new Set();
    function visit(locale) {
      if (seen.has(locale)) return;
      seen.add(locale);
      for (const next of routes.get(locale) || []) visit(next);
      const parts = locale.split("-");
      const extension = parts.findIndex((part, index) => index > 0 && part.length === 1);
      if (extension > 0) visit(parts.slice(0, extension).join("-"));
      else if (parts.length > 1) visit(parts.slice(0, -1).join("-"));
    }
    visit(tag);
    if (withDefault) visit(fallbackLocale);
    return [...seen];
  }

  function parameter(params, key) {
    return params && (typeof params === "object" || typeof params === "function")
      ? Object.getOwnPropertyDescriptor(params, key)?.value : undefined;
  }

  function createI18n({ catalogs, locale = "en", fallbackLocale = "en", fallbacks = {} }) {
    const messages = table(catalogs, "catalogs", catalogEntries);
    const routes = table(fallbacks, "fallbacks", fallbackEntries);
    const defaultLocale = canonical(fallbackLocale);
    const reference = messages.get(defaultLocale);
    if (!reference) throw new TypeError("Missing fallback catalog: " + defaultLocale);

    // English/reference messages establish stable keys and placeholder contracts.
    for (const [tag, catalog] of messages) {
      for (const [key, entry] of catalog) {
        if (!reference.has(key) || reference.get(key).schema !== entry.schema) {
          throw new TypeError("Unknown or incompatible translation key " + key + " in " + tag);
        }
      }
    }

    const plurals = new Map();
    const numbers = new Map();
    let selected, chain;
    function setLocale(tag) {
      const next = canonical(tag);
      const nextChain = resolveChain(next, routes, defaultLocale, true);
      selected = next;
      chain = nextChain;
      return selected;
    }

    // Evaluate preferred locales WITHOUT English/default fallback first. Otherwise
    // an unsupported first preference could hide a supported second preference.
    function chooseLocale(preferred) {
      for (const candidate of Array.isArray(preferred) ? preferred : [preferred]) {
        let tag;
        try { tag = canonical(candidate) } catch (error) {
          if (error instanceof RangeError || error instanceof TypeError) continue;
          throw error;
        }
        if (resolveChain(tag, routes, defaultLocale, false).some(next => {
          const catalog = messages.get(next);
          return catalog && catalog.size > 0;
        })) return tag;
      }
      return defaultLocale;
    }

    function pluralRules(tag) {
      if (!plurals.has(tag)) plurals.set(tag, new Intl.PluralRules(tag));
      return plurals.get(tag);
    }
    function numberFormatter(tag) {
      if (!numbers.has(tag)) numbers.set(tag, new Intl.NumberFormat(tag));
      return numbers.get(tag);
    }
    function interpolate(message, params, tag, count) {
      return message.replace(variables, (original, name) => {
        if (name === "count" && count !== undefined) return numberFormatter(tag).format(count);
        const value = parameter(params, name);
        return ["string", "number", "boolean"].includes(typeof value) ? String(value) : original;
      });
    }

    function resolve(key, params) {
      for (const tag of chain) {
        const entry = messages.get(tag)?.get(key);
        if (!entry) continue;
        if (entry.text !== undefined) {
          return { text: interpolate(entry.text, params, tag), locale: tag };
        }
        const count = parameter(params, "count");
        if (!Number.isFinite(count)) throw new TypeError("Expected finite numeric count for " + key);
        const exact = entry.forms.get("=" + count);
        const form = exact ?? entry.forms.get(pluralRules(tag).select(count)) ?? entry.forms.get("other");
        // Intl.NumberFormat and Intl.PluralRules share default rounding precision
        // (maximum three fractional digits); displayed count agrees with grammar.
        return { text: interpolate(form, params, tag, count), locale: tag };
      }
      return undefined;
    }

    setLocale(locale);
    return Object.freeze({
      get locale() { return selected; },
      get supportedLocales() { return Object.freeze([...messages.keys()]); },
      setLocale,
      chooseLocale,
      usePreferredLocales(preferred) { return setLocale(chooseLocale(preferred)); },
      resolve,
      t(key, params) { return resolve(key, params)?.text; },
      number(value, options) { return new Intl.NumberFormat(selected, options).format(value); },
      date(value, options) { return new Intl.DateTimeFormat(selected, options).format(value); },
    });
  }

  return createI18n;
});
