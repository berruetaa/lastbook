/* Local interface strings. English is the reference for keys and placeholders.
   Extend this object with another Intl-recognized locale (e.g. "fr"). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.lastbookI18nCatalogs = factory();
})(globalThis, function () {
  "use strict";
  return {
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
});
