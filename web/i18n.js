/* Apply only to explicitly marked text nodes in Lastbook's own interface. */
(() => {
  'use strict';

  const english = {
    'setup.chooseFolder': 'Choose an existing library folder',
    'setup.chooseHint': 'Choose your state and library. Lastbook downloads them for offline use.',
    'setup.installedItems': 'Installed: {items}.',
    'setup.title': 'Set up Lastbook',
    'setup.back': 'Back to the library',
    'setup.loading': 'Looking at this computer…',
  };
  const spanish = {
    'setup.chooseFolder': 'Elegir una carpeta de biblioteca existente',
    'setup.chooseHint': 'Elige tu estado y tu biblioteca. Lastbook los descarga para usarlos sin conexión.',
    'setup.title': 'Configurar Lastbook',
    'setup.back': 'Volver a la biblioteca',
    'setup.loading': 'Revisando este equipo…',
  };

  // Keep the document in English while only parts of the interface are translated.
  const useSpanish = (navigator.language || '').split('-')[0].toLowerCase() === 'es';
  function catalogue(key) {
    if (useSpanish && Object.hasOwn(spanish, key)) return spanish;
    if (Object.hasOwn(english, key)) return english;
  }

  // Returns plain text for textContent. Unknown keys and missing placeholders stay visible.
  function t(key, params = {}) {
    const words = catalogue(key);
    if (!words) return key;
    return words[key].replace(/\{(\w+)\}/g, (token, name) =>
      Object.hasOwn(params, name) ? String(params[name]) : token);
  }

  function apply(root = document) {
    function translate(node) {
      const key = node.dataset.i18n;
      const words = catalogue(key);
      if (!words) return;
      node.textContent = words[key];
      node.lang = words === spanish ? 'es-419' : 'en';
    }
    if (root.matches?.('[data-i18n]')) translate(root);
    for (const node of root.querySelectorAll('[data-i18n]')) translate(node);
  }

  globalThis.LastbookI18n = { t, apply };
  apply();
})();
