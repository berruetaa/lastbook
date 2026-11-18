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

  function normalizeTable(table, transform) {
    const normalized = new Map();
    for (const [locale, entry] of Object.entries(table)) {
      const tag = canonical(locale);
      if (normalized.has(tag)) throw new RangeError("Duplicate locale: " + tag);
      normalized.set(tag, transform(entry));
    }
    return normalized;
  }

  function resolveLocales(locale, fallbacks, fallbackLocale) {
    const chain = new Set();
    function visit(tag) {
      if (chain.has(tag)) return;
      chain.add(tag);
      for (const target of fallbacks.get(tag) || []) visit(target);

      const subtags = tag.split("-");
      const extension = subtags.findIndex((part, index) => index > 0 && part.length === 1);
      if (extension > 0) visit(subtags.slice(0, extension).join("-"));
      else if (subtags.length > 1) visit(subtags.slice(0, -1).join("-"));
    }
    visit(locale);
    visit(fallbackLocale);
    return Array.from(chain);
  }

  function interpolate(message, params) {
    return message.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, name) => {
      if (!owns(params, name)) return token;
      const value = params[name];
      return ["string", "number", "boolean"].includes(typeof value) ? String(value) : token;
    });
  }

  function createI18n({ catalogs, locale, fallbackLocale, fallbacks = {} }) {
    const messages = normalizeTable(catalogs, catalog => catalog);
    const routes = normalizeTable(fallbacks, targets => targets.map(canonical));
    const defaultLocale = canonical(fallbackLocale);
    const rules = new Map();
    let currentLocale;
    let chain;

    function setLocale(nextLocale) {
      const tag = canonical(nextLocale);
      const nextChain = resolveLocales(tag, routes, defaultLocale);
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

    function t(key, params = {}) {
      for (const tag of chain) {
        const catalog = messages.get(tag);
        if (!catalog || !owns(catalog, key)) continue;

        const entry = catalog[key];
        if (typeof entry === "string") return interpolate(entry, params);
        if (!entry || !owns(entry, "other") || typeof entry.other !== "string") {
          throw new TypeError("Expected text or plural forms with an other form for " + key);
        }
        const count = owns(params, "count") ? params.count : undefined;
        if (!Number.isFinite(count)) throw new TypeError("Expected a finite count for " + key);
        const exact = "=" + count;
        if (owns(entry, exact) && typeof entry[exact] === "string") {
          return interpolate(entry[exact], params);
        }
        const category = pluralCategory(tag, count);
        const form = owns(entry, category) ? entry[category] : entry.other;
        if (typeof form !== "string") throw new TypeError("Expected text for " + key);
        return interpolate(form, params);
      }
      return undefined;
    }

    setLocale(locale);
    return Object.freeze({ get locale() { return currentLocale; }, setLocale, t });
  }

  return createI18n;
});
