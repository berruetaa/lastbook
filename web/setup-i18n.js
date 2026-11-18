/* Setup's small opt-in pilot, including the heading/intro after state loads.
   Unmarked Setup UI stays English. */
(function (root) {
  "use strict";
  if (!root.Intl || typeof root.Intl.getCanonicalLocales !== "function" ||
      typeof root.createI18n !== "function" || typeof root.applyI18n !== "function" ||
      !root.lastbookI18nCatalogs) return;

  const engine = root.createI18n({
    catalogs: root.lastbookI18nCatalogs,
    locale: "en",
    fallbackLocale: "en",
    fallbacks: { es: ["es-419"] },
  });
  const languages = root.navigator.languages?.length
    ? root.navigator.languages : [root.navigator.language];
  engine.usePreferredLocales(languages);
  root.applyI18n(root.document, engine);

  // Dynamic Setup code can opt in and call apply() on its own new subtree.
  // No automatic DOM observation, persistence, external resources or library edits.
  root.LastbookI18n = Object.freeze({
    get locale() { return engine.locale; },
    get supportedLocales() { return engine.supportedLocales; },
    t: engine.t,
    resolve: engine.resolve,
    chooseLocale: engine.chooseLocale,
    number: engine.number,
    date: engine.date,
    direction: engine.direction,
    apply(scope = root.document, paramsFor) { root.applyI18n(scope, engine, paramsFor); },
    setLocale(locale) {
      engine.setLocale(locale);
      root.applyI18n(root.document, engine);
      return engine.locale;
    },
    usePreferredLocales(preferred) {
      engine.usePreferredLocales(preferred);
      root.applyI18n(root.document, engine);
      return engine.locale;
    },
  });
})(globalThis);
