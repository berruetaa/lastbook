/* A synchronous plain-text translator with caller-supplied local catalogs. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.createI18n = factory();
})(globalThis, function () {
  "use strict";

  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function canonical(locale) {
    if (typeof locale !== "string" || locale === "") {
      throw new TypeError("Expected a BCP 47 locale tag");
    }
    if (typeof Intl === "undefined" || typeof Intl.getCanonicalLocales !== "function") {
      throw new Error("Intl.getCanonicalLocales is required");
    }
    return Intl.getCanonicalLocales(locale)[0];
  }

  const placeholder = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  const pluralForm = /^(zero|one|two|few|many|other|=-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?)$/;

  function entries(value, description) {
    if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new TypeError("Expected a plain object for " + description);
    }
    return Reflect.ownKeys(value).map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || !descriptor.enumerable || !owns(descriptor, "value")) {
        throw new TypeError("Expected enumerable string data keys for " + description);
      }
      return [key, descriptor.value];
    });
  }

  function normalizeTable(table, description, transform) {
    const normalized = new Map();
    for (const [locale, entry] of entries(table, description)) {
      const tag = canonical(locale);
      if (normalized.has(tag)) throw new RangeError("Duplicate locale: " + tag);
      normalized.set(tag, transform(entry, tag));
    }
    return normalized;
  }

  function targets(value) {
    if (!Array.isArray(value)) throw new TypeError("Expected an array of fallback locales");
    return Array.from(value, canonical);
  }

  function resolveLocales(locale, routes, families, fallbackLocale) {
    const chain = new Set();
    function visit(tag) {
      if (chain.has(tag)) return;
      chain.add(tag);

      const subtags = tag.split("-");
      const extension = subtags.findIndex((part, index) => index > 0 && part.length === 1);
      const base = extension < 0 ? subtags : subtags.slice(0, extension);
      const isRegional = base.slice(1).some(part => /^(?:[A-Z]{2}|\d{3})$/.test(part));
      const regionalRoutes = extension < 0 && isRegional ? families.get(base[0]) : undefined;
      for (const target of routes.get(tag) || regionalRoutes || []) visit(target);

      if (extension > 0) visit(base.join("-"));
      else if (subtags.length > 1) visit(subtags.slice(0, -1).join("-"));
    }
    visit(locale);
    visit(fallbackLocale);
    return Array.from(chain);
  }

  function signature(message, key, plural = false) {
    if (typeof message !== "string" || /[{}]/.test(message.replace(placeholder, ""))) {
      throw new TypeError("Invalid text or placeholder in " + key);
    }
    const names = Array.from(message.matchAll(placeholder), match => match[1]);
    return Array.from(new Set(names.filter(name => !plural || name !== "count"))).sort().join(",");
  }

  function parseCatalog(value, locale) {
    const catalog = new Map();
    for (const [key, message] of entries(value, "catalog " + locale)) {
      if (!/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/.test(key)) {
        throw new TypeError("Invalid message key: " + key);
      }
      if (typeof message === "string") {
        catalog.set(key, { message, schema: "text:" + signature(message, key) });
        continue;
      }
      const forms = new Map(entries(message, "plural message " + key));
      if (!forms.has("other")) throw new TypeError("Missing other form in " + key);
      const expected = signature(forms.get("other"), key, true);
      for (const [form, text] of forms) {
        const exact = form.slice(1);
        if (!pluralForm.test(form) || (form.startsWith("=") && exact !== String(Number(exact)))) {
          throw new TypeError("Invalid plural form " + form + " in " + key);
        }
        if (signature(text, key, true) !== expected) {
          throw new TypeError("Inconsistent placeholders in " + key);
        }
      }
      catalog.set(key, { forms, schema: "plural:" + expected });
    }
    return catalog;
  }

  function validateSchema(catalogs, fallbackLocale) {
    const reference = catalogs.get(fallbackLocale);
    if (!reference) throw new TypeError("Missing reference catalog: " + fallbackLocale);
    for (const [locale, catalog] of catalogs) {
      for (const [key, entry] of catalog) {
        if (!reference.has(key)) throw new TypeError("Unknown message key " + key + " in " + locale);
        if (reference.get(key).schema !== entry.schema) {
          throw new TypeError("Incompatible message " + key + " in " + locale);
        }
      }
    }
  }

  function interpolate(message, params) {
    return message.replace(placeholder, (token, name) => {
      if (!owns(params, name)) return token;
      const value = params[name];
      return ["string", "number", "boolean"].includes(typeof value) ? String(value) : token;
    });
  }

  function createI18n({ catalogs, locale, fallbackLocale, fallbacks = {}, regionFallbacks = {} }) {
    const defaultLocale = canonical(fallbackLocale);
    const messages = normalizeTable(catalogs, "catalogs", parseCatalog);
    validateSchema(messages, defaultLocale);
    const routes = normalizeTable(fallbacks, "fallbacks", targets);
    const families = normalizeTable(regionFallbacks, "regionFallbacks", (value, tag) => {
      if (tag.includes("-")) throw new TypeError("Expected a language-only regional fallback key");
      return targets(value);
    });
    const rules = new Map();
    let currentLocale;
    let chain;

    function setLocale(nextLocale) {
      const tag = canonical(nextLocale);
      const nextChain = resolveLocales(tag, routes, families, defaultLocale);
      currentLocale = tag;
      chain = nextChain;
    }

    function pluralCategory(tag, count) {
      if (typeof Intl.PluralRules !== "function" ||
          Intl.PluralRules.supportedLocalesOf([tag]).length === 0) {
        throw new RangeError("Intl.PluralRules does not support " + tag);
      }
      if (!rules.has(tag)) rules.set(tag, new Intl.PluralRules(tag));
      return rules.get(tag).select(count);
    }

    function resolve(key, params) {
      const values = params ?? {};
      for (const tag of chain) {
        const entry = messages.get(tag)?.get(key);
        if (!entry) continue;

        if (!entry.forms) return { text: interpolate(entry.message, values), locale: tag };
        const count = owns(values, "count") ? values.count : undefined;
        if (!Number.isFinite(count)) throw new TypeError("Expected a finite count for " + key);
        const exact = entry.forms.get("=" + count);
        const form = exact ?? entry.forms.get(pluralCategory(tag, count)) ?? entry.forms.get("other");
        return { text: interpolate(form, values), locale: tag };
      }
      return undefined;
    }

    function t(key, params) {
      return resolve(key, params)?.text;
    }

    setLocale(locale);
    return Object.freeze({ get locale() { return currentLocale; }, setLocale, resolve, t });
  }

  return createI18n;
});
