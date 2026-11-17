/* Apply only to explicitly marked text nodes in Lastbook's own interface. */
(() => {
  'use strict';

  const english = {
    'setup.title': 'Set up Lastbook',
    'setup.back': 'Back to the library',
    'setup.loading': 'Looking at this computer…',
  };
  const spanish = {
    'setup.title': 'Configurar Lastbook',
    'setup.back': 'Volver a la biblioteca',
    'setup.loading': 'Revisando este equipo…',
  };

  // Keep the document in English while only parts of the interface are translated.
  const useSpanish = (navigator.language || '').toLowerCase() === 'es-419';
  for (const node of document.querySelectorAll('[data-i18n]')) {
    const key = node.dataset.i18n;
    if (useSpanish && Object.prototype.hasOwnProperty.call(spanish, key)) {
      node.textContent = spanish[key];
      node.lang = 'es-419';
    } else if (Object.prototype.hasOwnProperty.call(english, key)) {
      node.textContent = english[key];
      node.lang = 'en';
    }
    // Unknown keys keep the readable text supplied by the markup.
  }
})();
