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
  regionFallbacks: { es: ["es-419"] },
  fallbacks: { "es-ES": [] },
});

i18n.t("setup.files", { count: 2 }); // "2 archivos"
i18n.locale;                        // "es-UY"
i18n.resolve("setup.open");         // { text: "Abrir biblioteca", locale: "es-419" }
i18n.setLocale("en");
applyI18n(document, i18n);
```

- `createI18n({ catalogs, locale, fallbackLocale, fallbacks?, regionFallbacks? })`
  creates one translator. It validates and snapshots the catalogs and route
  tables up front. Locale tags are canonicalized.
- `i18n.locale` is the requested canonical locale. `setLocale(tag)` updates it
  synchronously. The host decides when to render again.
- `i18n.resolve(key, params?)` returns `{ text, locale }` from the catalog that
  supplied the message. `i18n.t(key, params?)` returns just the text. Both return
  `undefined` for an unknown key. Empty strings are valid translations. Placeholders such as
  `{name}` use own string, number or boolean parameters. Missing parameters and
  values of other types leave the placeholder visible. Pass `null` for the same
  behavior as omitting parameters. Substitutions run once.
- `applyI18n(root, i18n, paramsFor?)` applies an explicit render to a document,
  element or fragment, including a marked root element. The optional callback
  `paramsFor(element, key)` supplies parameters for a given binding. Missing
  translations leave original UI intact or restore a still-managed binding to
  its original content while the element remains in the marked render scope.
  Resolution and parameter errors throw before the adapter writes anything.
  Supply a side-effect-free parameter callback.

## Locale and grammar

For each key, the engine visits the exact locale, its configured routes in
order, then its parents. If no exact route is configured, regional tags use
their bare language's `regionFallbacks` rule. For example, the same `es` rule
covers `es-UY`, `es-AR` and `es-MX`. A wildcard policy would also cover
`es-ES`, so the example opts that tag out with an empty exact route and lets it
fall through to `es` and then `en`. Bare `es` does not imply Latin America.
Regional rules are product policy. Use exact routes where script or variant
preferences matter. A visit expands the routes recursively and skips tags
already visited. Extensions are removed as a unit, and parent fallback retains
script before dropping it (`zh-Hant-TW → zh-Hant → zh`). Finally the engine
visits the configured default, including its routes and parents.

Catalog entries are strings or objects with a required `other` string and
optional cardinal forms `zero`, `one`, `two`, `few`, and `many`.
Pass a finite numeric `count` to a plural entry. Exact forms such as `"=0"`
take precedence, then `Intl.PluralRules` selects the category using the locale
of the matched catalog. Whole messages let translators change grammar and order.
For other grammatical distinctions, give the caller separate semantic keys.
This proof of concept keeps the format small. Decimal counts follow the native
`Intl.PluralRules` defaults and render as ordinary JavaScript number strings.
For other numeric values, the caller can pass a separate display string from
`Intl.NumberFormat`. Keep the original numeric `count` for plural selection.
This format has no ordinal, gender-selection, rich-text, or number-formatting
syntax.

The exact `fallbackLocale` catalog is the source of the supported keys and
placeholder schema. Other catalogs can omit any entries. Defined entries must
retain the reference message type and named placeholders. Plural forms within
a catalog use the same placeholders, with `{count}` optional in each form.
Unknown keys, malformed placeholders or exact selectors, invalid route
shapes, and canonically duplicated locale tags fail at initialization. Catalog
objects accept enumerable own string data properties. Braces are reserved for
placeholders.

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

The adapter sets `lang` from the source catalog, so an English fallback inside
a Spanish page is marked as English. It sets HTML `dir` or SVG `direction`
where direction can be inferred, preserving author-provided attributes
(including SVG `xml:lang`). Authors can override direction explicitly when
runtime locale data is limited. HTML cannot assign an independent language to
each attribute of one element. Use one source locale per marked element. If a
label and its control may fall back independently, put the label on a
separately marked element and associate it with the control using `label` or
`aria-labelledby`. A same-element language conflict throws before any writes.

Only mark an `option` for text when it has an explicit, stable `value`.
Translating its text otherwise changes its implicit submitted value. The
adapter leaves the implicit label alone.

## Lastbook integration plan

After approval on issue #54, start with one setup-page PR. In the Astra branch
(`feat/i18n-foundation-es419`), map its existing setup bindings to the semantic
keys and catalog schema here. Replace that branch's local
`LastbookI18n` implementation with the reusable core and adapter in the
integration PR, and update its existing callers or keep a thin delegation
wrapper only for a transitional caller. Keep English HTML as an initial
fallback. Reuse its three static bindings (`setup.title`, `setup.back`, and
`setup.loading`) and load the local scripts before `setup.js`. Then replace
the Astra `apply(main)` call with `applyI18n(main, i18n)` where dynamic markup
is in scope, and use `t` for its programmatic `setup.installedItems` message.
Run the browser fixture and embedded smoke tests before expanding coverage.
The current branch adds no bindings to setup.

The host owns language preference, document `lang` and `dir`, and rendering
native SwiftUI text. Keep user content, guides, manuals, search results and
model output outside these bindings. The classic scripts live directly under
`web/` so the desktop shipping script can copy them without tooling or fetch.

## Verification and runtime requirements

Run `node --test app/tests/i18n_core_test.cjs`. Open
`app/tests/i18n_dom_test.html` from the local checkout in a browser or WebView
and check for `PASS`, or use a headless Chromium installation from the
repository root:

```sh
chromium --headless --disable-background-networking --dump-dom \
  "file://$PWD/app/tests/i18n_dom_test.html" | grep -F '<pre id="result">PASS</pre>'
```

The test page loads only local scripts.

Modern desktop WKWebView and WebView2 have the intended JavaScript facilities.
Verify the actual minimum supported OS and embedded engines before integrating.
The core uses ES2020 JavaScript and requires `Intl.getCanonicalLocales`. Plural selection checks
`Intl.PluralRules` and support for the matched locale before use, and throws if
either capability is missing. The host determines how to surface capability
errors. Exact forms and ordinary text bypass plural selection. Platform ICU and
CLDR versions can differ.
