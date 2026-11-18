/* Example first-party UI catalogs, loaded locally as a classic script. */
(function (root) {
  "use strict";

  const catalogs = {
    en: {
      "setup.open": "Open library",
      "setup.search": "Search",
      "setup.ready": "Ready, {name}",
      "setup.files": { "=0": "No files", one: "{count} file", other: "{count} files" },
    },
    "es-419": {
      "setup.open": "Abrir biblioteca",
      "setup.search": "Buscar",
      "setup.ready": "Todo listo, {name}",
      "setup.files": { "=0": "No hay archivos", one: "{count} archivo", other: "{count} archivos" },
    },
  };
  if (typeof module === "object" && module.exports) module.exports = catalogs;
  else root.i18nExampleCatalogs = catalogs;
})(globalThis);
