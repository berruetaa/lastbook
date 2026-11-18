const assert = require("node:assert/strict");
const { test } = require("node:test");
const createI18n = require("../../web/i18n-core.js");
const examples = require("../../web/i18n-example-catalogs.js");

function engine(locale, catalogs = examples, fallbacks = {}) {
  return createI18n({ catalogs, locale, fallbackLocale: "en", fallbacks });
}

test("canonical tags, explicit regional routes, exact matches and English fallback", () => {
  const catalogs = {
    ...examples,
    "es-AR": { "setup.search": "Buscar en la biblioteca" },
  };
  const fallbacks = { "es-UY": ["es-419"], "es-AR": ["es-419"], "es-CL": ["es-419"] };
  const i18n = engine("es-uy", catalogs, fallbacks);
  assert.equal(i18n.locale, "es-UY");
  assert.equal(i18n.t("setup.open"), "Abrir biblioteca");
  i18n.setLocale("es-AR");
  assert.equal(i18n.t("setup.search"), "Buscar en la biblioteca");
  assert.equal(i18n.t("setup.open"), "Abrir biblioteca");
  i18n.setLocale("es-CL");
  assert.equal(i18n.t("setup.open"), "Abrir biblioteca");
  i18n.setLocale("fr-CA");
  assert.equal(i18n.t("setup.open"), "Open library");
  assert.throws(() => i18n.setLocale("fr_CA"), RangeError);
  assert.equal(i18n.locale, "fr-CA");
});

test("script-aware parents, Unicode extensions, cycles and missing keys", () => {
  const catalogs = { ...examples, en: { ...examples.en, search: "Search" },
    "zh-Hant": { search: "搜尋" }, zh: { search: "搜索" } };
  const i18n = engine("zh-Hant-TW-u-nu-hanidec", catalogs, {
    "zh-Hant-TW": ["zh-Hant"], "zh-Hant": ["zh-Hant-TW"],
  });
  assert.equal(i18n.t("search"), "搜尋");
  assert.equal(i18n.t("setup.open"), "Open library");
  assert.equal(i18n.t("does.not.exist"), undefined);
  assert.equal(i18n.t("constructor"), undefined);
});

test("Arabic cardinal categories, exact cases and grammar of the matched catalog", () => {
  const arabic = {
    zero: "zero", one: "one", two: "two", few: "few", many: "many", other: "other", "=42": "exact",
  };
  const i18n = engine("ar", { ...examples, en: { ...examples.en, plural: { other: "other" } },
    ar: { plural: arabic } });
  const cases = [[0, "zero"], [1, "one"], [2, "two"], [3, "few"], [11, "many"], [100, "other"],
    [1.5, "other"], [42, "exact"]];
  for (const [count, expected] of cases) assert.equal(i18n.t("plural", { count }), expected);
  assert.equal(i18n.t("setup.files", { count: 0 }), "No files");
  assert.equal(i18n.t("setup.files", { count: 1 }), "1 file");
  assert.equal(i18n.t("setup.files", { count: 2 }), "2 files");
  assert.throws(() => i18n.t("plural", { count: "2" }), TypeError);
});

test("interpolation is plain text, one pass, and reads only explicit primitive params", () => {
  const i18n = engine("en");
  const payload = '<img src=x onerror="alert(1)">{name}$&';
  assert.equal(i18n.t("setup.ready", { name: payload }), "Ready, " + payload);
  assert.equal(i18n.t("setup.ready", Object.create({ name: "inherited" })), "Ready, {name}");
  assert.equal(i18n.t("setup.ready", { name: { toString() { throw Error("called"); } } }), "Ready, {name}");
});

test("plain messages work without plural support and plural use reports the capability", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, "PluralRules");
  delete Intl.PluralRules;
  try {
    const i18n = engine("en");
    assert.equal(i18n.t("setup.open"), "Open library");
    assert.equal(i18n.t("setup.files", { count: 0 }), "No files");
    assert.throws(() => i18n.t("setup.files", { count: 1 }), RangeError);
  } finally {
    Object.defineProperty(Intl, "PluralRules", descriptor);
  }
});

test("regional fallback policy, exact exceptions and resolved source locales", () => {
  const i18n = createI18n({ catalogs: examples, locale: "es-MX", fallbackLocale: "en",
    regionFallbacks: { es: ["es-419"] }, fallbacks: { "es-ES": [] } });
  for (const locale of ["es-UY", "es-MX", "es-AR", "es-CL", "es-CL-u-nu-latn"]) {
    i18n.setLocale(locale);
    assert.deepEqual(i18n.resolve("setup.open"), { text: "Abrir biblioteca", locale: "es-419" });
  }
  for (const locale of ["es-ES", "es"]) {
    i18n.setLocale(locale);
    assert.deepEqual(i18n.resolve("setup.open"), { text: "Open library", locale: "en" });
  }
  assert.equal(i18n.resolve("missing"), undefined);
  assert.equal(i18n.t("setup.ready", null), "Ready, {name}");
  assert.equal(i18n.t("setup.files", { count: 1234.5 }), "1234.5 files");
});

test("rejects malformed community catalogs and locale policy before first render", () => {
  const badCatalogs = [
    { stray: "Unexpected" },
    { "setup.ready": "Hola {nombre}" },
    { "setup.ready": "Hola {name" },
    { "setup.open": "{ name }" },
    { "setup.open": null },
    { "setup.files": { one: "Uno" } },
    { "setup.files": { one: "Uno", other: 5 } },
    { "setup.files": { other: "{count}", two: "{person}" } },
    { "setup.files": { other: "{count}", typo: "Oops" } },
    { "setup.files": { other: "{count}", "=1.0": "Uno" } },
    Object.create({ "setup.open": "Inherited" }),
    { get "setup.open"() { assert.fail("catalog getter ran"); } },
    { [Symbol("stray")]: "Unexpected" },
  ];
  for (const catalog of badCatalogs) assert.throws(() => engine("en", { ...examples, es: catalog }), TypeError);
  assert.throws(() => engine("en", { EN: {}, en: {} }), RangeError);
  assert.throws(() => engine("en", { es: {} }), /Missing reference catalog/);
  assert.throws(() => engine("en", examples, { "es-UY": "es-419" }), TypeError);
  assert.throws(() => engine("en", examples, { "es-UY": ["bad_tag"] }), RangeError);
  assert.throws(() => createI18n({ catalogs: examples, locale: "en", fallbackLocale: "en",
    regionFallbacks: { "es-UY": ["es-419"] } }), TypeError);
});

test("catalog and routing snapshots ignore later changes", () => {
  const en = Object.assign(Object.create(null), examples.en);
  const es = { "setup.files": { other: "{count} archivos" } };
  const routes = { "es-UY": ["es-419"] };
  const i18n = engine("es-UY", { en, "es-419": es }, routes);
  en["setup.open"] = "Changed";
  es["setup.files"].other = "Changed";
  routes["es-UY"][0] = "en";
  i18n.setLocale("es-UY");
  assert.equal(i18n.t("setup.files", { count: 3 }), "3 archivos");
  assert.equal(i18n.t("setup.open"), "Open library");
});
