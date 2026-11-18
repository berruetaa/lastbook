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
  const catalogs = { ...examples, "zh-Hant": { search: "搜尋" }, zh: { search: "搜索" } };
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
  const i18n = engine("ar", { ...examples, ar: { plural: arabic } });
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
