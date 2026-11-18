/* Setup pilot. Leave the page language English while the rest of setup is untranslated. */
(function () {
  "use strict";

  if (typeof createI18n !== "function" || typeof Intl === "undefined" ||
      typeof Intl.getCanonicalLocales !== "function") return;

  const catalogs = {
    en: {
      "setup.title": "Set up Lastbook",
      "setup.back": "Back to the library",
      "setup.loading": "Looking at this computer…",
    },
    "es-419": {
      "setup.title": "Configurar Lastbook",
      "setup.back": "Volver a la biblioteca",
      "setup.loading": "Revisando este equipo…",
    },
  };

  const supportedLanguages = new Set(Object.keys(catalogs).map(tag => tag.split("-")[0]));
  let locale = "en";
  for (const language of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    if (!language) continue;
    try {
      const tag = Intl.getCanonicalLocales(language)[0];
      if (tag && supportedLanguages.has(tag.split("-")[0])) {
        locale = tag;
        break;
      }
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }

  const i18n = createI18n({ catalogs, locale, fallbackLocale: "en", fallbacks: { es: ["es-419"] } });
  for (const element of document.querySelectorAll("[data-i18n]")) {
    const result = i18n.resolve(element.getAttribute("data-i18n"));
    if (!result) continue;
    element.textContent = result.text;
    element.lang = result.locale;
  }
})();
