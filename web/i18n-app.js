/* Language policy shared by Setup, Settings and the library. */
(() => {
  'use strict';
  const desktop = window.LB_DESKTOP_LANGUAGE === true;
  // The iPad also uses the lastbook: scheme, with a different router and copy.
  if (location.protocol === 'lastbook:' && !desktop) return;
  if (typeof window.createI18n !== 'function' || typeof window.applyI18n !== 'function' || !window.lastbookI18nEnglish) return;

  const english = window.lastbookI18nEnglish;
  const regional = window.lastbookI18nLocales?.['es-419'];
  const fallbacks = { 'es-AR': ['es-419'], 'es-CL': ['es-419'], 'es-UY': ['es-419'] };
  let engine;
  try { engine = createI18n({ catalogs: { en: english } }); } catch { return; }
  if (regional && Object.keys(regional).length) {
    try { engine = createI18n({ catalogs: { en: english, 'es-419': regional }, fallbacks }); } catch { /* Keep English. */ }
  }

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const form = desktop && document.getElementById('languageSettings');
  const select = form && form.querySelector('select');
  const button = form && form.querySelector('button');
  const status = form && document.getElementById('languageStatus');
  let selection, saving = false;

  const apply = (scope = document, paramsFor) => applyI18n(scope, engine, paramsFor);
  window.LastbookI18n = Object.freeze({ apply });

  function activate(saved) {
    engine.usePreferredLocales(saved || languages);
    selection = saved || engine.catalogLocale;
    apply();
    document.dispatchEvent(new Event('lastbook:languagechange'));
  }

  function announce(key) {
    if (!status) return;
    if (key) {
      status.setAttribute('data-i18n', key);
      apply(status);
    } else {
      status.removeAttribute('data-i18n');
      status.textContent = '';
    }
  }

  async function preference(language) {
    const options = { cache: 'no-store' };
    if (language !== undefined) {
      options.method = 'POST';
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify({ language });
    }
    const response = await fetch('/api/ui-language', options);
    if (!response.ok) throw new Error('Could not access the desktop language preference');
    const saved = (await response.json()).language;
    if (![null, 'en', 'es-419'].includes(saved) || (language !== undefined && language !== saved)) {
      throw new Error('Unexpected desktop language preference');
    }
    return saved;
  }

  async function load() {
    let message;
    try {
      const saved = await preference();
      activate(saved);
      if (saved && saved !== engine.catalogLocale) message = 'language.unavailable';
    } catch { message = 'language.loadFailed'; }
    if (form) {
      select.value = selection;
      form.hidden = false;
      announce(message);
    }
  }

  if (form) {
    select.querySelector('[value="es-419"]').disabled = !engine.supportedLocales.includes('es-419');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const next = select.value;
      if (saving || !engine.supportedLocales.includes(next)) return;
      saving = true;
      button.setAttribute('aria-disabled', 'true');
      announce('language.saving');
      try {
        const saved = await preference(next);
        activate(saved);
        select.value = saved;
        announce('language.saved');
      } catch {
        select.value = selection;
        announce('language.saveFailed');
      } finally {
        button.removeAttribute('aria-disabled');
        saving = false;
      }
    });
  }

  activate(null);
  if (desktop) {
    load();
    // Returning from Settings can restore the old library document and its
    // in-memory state. Apply the preference without rerunning the route.
    if (!form) addEventListener('pageshow', event => { if (event.persisted) load() });
  }
})();
