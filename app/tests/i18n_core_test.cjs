const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const createI18n = require("../../web/i18n-core.js");

const catalogs = {
  en: {
    greeting: "Hello, {name}",
    files: { "=0": "No files", one: "{count} file", other: "{count} files" },
    fallback: "English only",
  },
  "es-419": {
    greeting: "Hola, {name}",
    files: { "=0": "No hay archivos", one: "{count} archivo", other: "{count} archivos" },
  },
  "es-AR": { greeting: "Buenas, {name}" },
};

function translator(locale) {
  return createI18n({ catalogs, locale, fallbackLocale: "en", fallbacks: { es: ["es-419"] } });
}

test("regional Spanish routes to es-419, with exact catalogs and English fallback", () => {
  for (const locale of ["ES-uy", "es-CL", "es-MX", "es-ES", "es", "es-UY-u-nu-latn"]) {
    assert.deepEqual(translator(locale).resolve("greeting", { name: "Ana" }),
      { text: "Hola, Ana", locale: "es-419" });
  }
  const i18n = translator("es-AR");
  assert.equal(i18n.t("greeting", { name: "Ana" }), "Buenas, Ana");
  assert.equal(i18n.t("files", { count: 2 }), "2 archivos");
  assert.equal(i18n.t("fallback"), "English only");
  i18n.setLocale("fr-CA");
  assert.equal(i18n.t("greeting", { name: "Ana" }), "Hello, Ana");
  assert.equal(i18n.t("constructor"), undefined);
});

test("plural selection uses exact counts and the grammar of the matched catalog", () => {
  for (const [locale, expected] of [
    ["en", ["No files", "1 file", "2 files"]],
    ["es-UY", ["No hay archivos", "1 archivo", "2 archivos"]],
  ]) {
    const i18n = translator(locale);
    assert.deepEqual([0, 1, 2].map(count => i18n.t("files", { count })), expected);
    assert.throws(() => i18n.t("files", { count: "2" }), TypeError);
    assert.throws(() => i18n.t("files", { count: Infinity }), TypeError);
  }
  const i18n = createI18n({
    locale: "ja", fallbackLocale: "en",
    catalogs: { en: catalogs.en, ja: { files: catalogs.en.files } },
  });
  assert.equal(i18n.t("files", { count: 1 }), "1 files");
});

test("interpolation performs one plain-text pass over own primitive parameters", () => {
  const i18n = translator("en");
  const input = '<img src=x onerror="alert(1)">{name}$&';
  assert.equal(i18n.t("greeting", { name: input }), "Hello, " + input);
  for (const params of [
    Object.create({ name: "Inherited" }),
    { get name() { assert.fail("parameter getter ran"); } },
    { name: { toString() { assert.fail("parameter was coerced"); } } },
  ]) assert.equal(i18n.t("greeting", params), "Hello, {name}");
});

test("Setup loads the pilot from local scripts before setup.js and labels only translated text", () => {
  const web = resolve(__dirname, "../../web");
  const html = readFileSync(resolve(web, "setup.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="\/ui\/([^"?]+)[^"]*"><\/script>/g)].map(match => match[1]);
  assert.deepEqual(scripts.slice(-3), ["i18n-core.js", "setup-i18n.js", "setup.js"]);
  assert.match(html, /<html lang="en"/);
  for (const [languages, expectedTitle, expectedLang] of [
    [["es-UY"], "Configurar Lastbook", "es-419"],
    [["fr", "es-CL"], "Configurar Lastbook", "es-419"],
    [["en-US", "es-UY"], "Set up Lastbook", "en"],
    [["malformed_tag", "fr"], "Set up Lastbook", "en"],
  ]) {
    const elements = [...html.matchAll(/data-i18n="([^"]+)">([^<]+)</g)].map(([, key, textContent]) => ({
      getAttribute: () => key,
      textContent,
    }));
    const context = { navigator: { languages }, document: { querySelectorAll: () => elements } };
    for (const script of scripts.slice(-3, -1)) runInNewContext(readFileSync(resolve(web, script), "utf8"), context);
    assert.equal(elements.length, 3);
    assert.equal(elements[0].textContent, expectedTitle);
    assert.deepEqual(elements.map(element => element.lang), Array(3).fill(expectedLang));
  }
});
