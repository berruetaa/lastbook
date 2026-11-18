# Reusable offline i18n proof of concept

The core translates semantic keys into plain text. It accepts local catalogs and
a locale policy from its host. The optional adapter applies those strings to
explicit first-party UI bindings. Neither file makes requests, reads browser
preferences, persists settings, or observes the DOM.

## Public API

Load `web/i18n-core.js` as a classic script to expose `createI18n`. Load
`web/i18n-dom.js` for `applyI18n` and `web/i18n-example-catalogs.js` for
`i18nExampleCatalogs`. The files also expose the same functions or catalogs via
CommonJS. The core works independently of the DOM and sample catalogs.

```js
const i18n = createI18n({
  catalogs: i18nExampleCatalogs,
  locale: "es-UY",
  fallbackLocale: "en",
  fallbacks: {
    "es-UY": ["es-419"],
    "es-AR": ["es-419"],
    "es-CL": ["es-419"],
  },
});

i18n.t("setup.files", { count: 2 }); // "2 archivos"
i18n.locale;                        // "es-UY"
i18n.setLocale("en");
applyI18n(document, i18n);
```

- `createI18n({ catalogs, locale, fallbackLocale, fallbacks? })` creates one
  translator. Treat catalogs as read-only. Locale tags are canonicalized.
- `i18n.locale` is the requested canonical locale. `setLocale(tag)` updates it
  synchronously. The host decides when to render again.
- `i18n.t(key, params?)` returns a string, or `undefined` if no catalog defines
  the key. Empty strings are valid translations. Placeholders such as
  `{name}` use own string, number or boolean parameters. Missing parameters and
  values of other types leave the placeholder visible. Substitutions run once.
- `applyI18n(root, i18n, paramsFor?)` applies an explicit render to a document,
  element or fragment, including a marked root element. The optional callback
  `paramsFor(element, key)` supplies parameters for a given binding. Missing
  translations leave the existing UI intact.

## Locale and grammar

For each key, the engine visits the exact locale, its configured routes in
order, then its parents. A visit expands a route recursively and skips already
visited tags. Extension sequences are removed together, then parents lose one
subtag at a time. This gives `zh-Hant-TW → zh-Hant → zh`. Finally the engine
visits the configured default, including its routes and parents. Put product
preferences in the route table when natural parent fallback is unsuitable.

Catalog entries are strings or objects with a required `other` string and
optional cardinal forms `zero`, `one`, `two`, `few`, and `many`.
Pass a finite numeric `count` to a plural entry. Exact forms such as `"=0"`
take precedence, then `Intl.PluralRules` selects the category using the locale
of the matched catalog. Whole messages let translators change grammar and order.
For other grammatical distinctions, give the caller separate semantic keys.
This proof of concept keeps the format small. Decimal counts follow the native
`Intl.PluralRules` defaults and render as ordinary JavaScript number strings.
It has no ordinal, gender-selection, rich-text, or number-formatting syntax.

## Safe DOM integration

```html
<button data-i18n-aria-label="setup.open">
  <svg aria-hidden="true"><path d="M0,0 L1,1"></path></svg>
  <span data-i18n="setup.open">Open library</span>
</button>
<input data-i18n-placeholder="setup.search" placeholder="Search">
```

Mark a dedicated leaf element for text. The adapter accepts common display
elements, including SVG text leaves, and skips text replacement when child
elements are present. Use a marked `span` or `tspan` to preserve child
elements and listeners in mixed content. Attribute markers are limited to
`data-i18n-aria-label`, `data-i18n-placeholder`, `data-i18n-title`, and
`data-i18n-alt`. The adapter uses `textContent` and `setAttribute` on that
fixed attribute list, and skips writes when the value already matches.

Strings returned by the core contain literal characters. For code-driven UI,
assign them to a text sink such as `textContent`. Keep markup, URL, executable
code, and style construction outside the translation layer.

Lastbook could load the three local scripts before the setup UI script, add
stable keys to first-party labels, and apply a translation after initial render
and language changes. The host would own the language preference and update
document `lang` and `dir`, and it would use its own rendering and catalogs for
native SwiftUI. Keep user content, guides, manuals, search results and model
output outside these bindings. The proof of concept does not wire into any
Lastbook page. Its web files sit directly under `web/` so the existing
desktop shipping script can copy them.

## Verification and runtime requirements

Run `node --test app/tests/i18n_core_test.cjs`. Open
`app/tests/i18n_dom_test.html` from the local checkout in a browser or WebView
and check for `PASS`. The test page loads only local scripts.

Modern desktop WKWebView and WebView2 have the intended JavaScript facilities.
Verify the actual minimum supported OS and embedded engines before integrating.
The core requires `Intl.getCanonicalLocales`; plural selection checks
`Intl.PluralRules` and support for the matched locale before use, and throws if
either capability is missing. The host determines how to surface capability
errors. Exact forms and ordinary text bypass plural selection. Platform ICU and
CLDR versions can differ.
