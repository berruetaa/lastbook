const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const createI18n = require("../../web/i18n-core.js");
const applyI18n = require("../../web/i18n-dom.js");

const catalogs = {
  en: {
    greeting: "Hello, {name}",
    files: { "=0": "No files", one: "{count} file", other: "{count} files" },
    fallback: "English only",
    caption: "Picture {position}",
  },
  "es-419": {
    greeting: "Hola, {name}",
    files: { "=0": "No hay archivos", one: "{count} archivo", other: "{count} archivos" },
    caption: "Imagen {position}",
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

test("Setup loads a complete reusable engine from local scripts and switches languages", () => {
  const web = resolve(__dirname, "../../web");
  const html = readFileSync(resolve(web, "setup.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="\/ui\/([^"?]+)[^"]*"><\/script>/g)].map(match => match[1]);
  assert.deepEqual(scripts.slice(-5), [
    "i18n-core.js", "i18n-dom.js", "i18n-catalogs.js", "setup-i18n.js", "setup.js",
  ]);
  assert.match(html, /<html lang="en"/);
  for (const [languages, expectedTitle, expectedLang] of [
    [["es-UY"], "Configurar Lastbook", "es-419"],
    [["fr", "es-CL"], "Configurar Lastbook", "es-419"],
    [["en-US", "es-UY"], "Set up Lastbook", "en"],
    [["malformed_tag", "fr"], "Set up Lastbook", "en"],
  ]) {
    const elements = [...html.matchAll(/data-i18n="([^"]+)">([^<]+)</g)].map(([, key, textContent]) => ({
      getAttribute: marker => marker === "data-i18n" ? key : null,
      setAttribute(marker, value) { this[marker] = value; },
      childElementCount: 0,
      textContent,
    }));
    const context = { navigator: { languages }, document: { querySelectorAll: () => elements } };
    for (const script of scripts.slice(-5, -1)) runInNewContext(readFileSync(resolve(web, script), "utf8"), context);
    assert.equal(elements.length, 3);
    assert.equal(elements[0].textContent, expectedTitle);
    assert.deepEqual(elements.map(element => element.lang), Array(3).fill(expectedLang));
    assert.equal(typeof context.LastbookI18n.t, "function");
    assert.equal(typeof context.LastbookI18n.apply, "function");
    context.LastbookI18n.setLocale("en");
    assert.equal(elements[0].textContent, "Set up Lastbook");
    context.LastbookI18n.setLocale("es-UY");
    assert.equal(elements[0].textContent, "Configurar Lastbook");
  }
});

test("browser preference negotiation ignores unsupported earlier languages", () => {
  const i18n = translator("en");
  assert.equal(i18n.chooseLocale(["fr-CA", "es-UY"]), "es-UY");
  assert.equal(i18n.usePreferredLocales(["fr-CA", "es-CL"]), "es-CL");
  assert.equal(i18n.t("greeting", { name: "Ana" }), "Hola, Ana");
  assert.equal(i18n.chooseLocale(["en-US", "es-UY"]), "en-US");
  assert.equal(i18n.chooseLocale(["malformed_tag", "fr"]), "en");
  assert.equal(i18n.chooseLocale([]), "en");
  assert.equal(i18n.locale, "es-CL"); // chooseLocale is non-mutating
  assert.equal(i18n.usePreferredLocales(["en-US", "es-UY"]), "en-US");
  assert.equal(i18n.t("greeting", { name: "Ana" }), "Hello, Ana");
  assert.throws(() => i18n.setLocale("malformed_tag"), RangeError);
  assert.equal(i18n.locale, "en-US"); // invalid selection is atomic
  assert.deepEqual(i18n.supportedLocales, ["en", "es-419", "es-AR"]);
});

test("plural grammar and count formatting agree for fractional quantities", () => {
  assert.equal(translator("en").t("files", { count: 1.0004 }), "1 file");
  assert.equal(translator("en").t("files", { count: 1.001 }), "1.001 files");
  assert.equal(translator("es-UY").t("files", { count: 1.001 }),
    new Intl.NumberFormat("es-419").format(1.001) + " archivos");
  for (const count of [NaN, Infinity, "2", undefined]) {
    assert.throws(() => translator("en").t("files", { count }), TypeError);
  }
});

test("catalogs have explicit contracts and reject accessors or unexpected shapes", () => {
  const bad = [
    { en: { hello: "Hello, {name}" }, es: { hello: "Hola, {persona}" } },
    { en: { hello: "Hello" }, es: { surprise: "Sorpresa" } },
    { en: { hello: "{incomplete" } },
    { en: { hello: {} } },
    { en: { hello: { one: "One" } } },
    { en: { hello: { other: "{count} file", one: "{count} {x} file" } } },
    { en: { hello: { other: "{count} file", invalid: "{count} files" } } },
    { en: { get hello() { assert.fail("catalog getter executed"); } } },
    { en: { hello: ["A", "B"] } },
    { en: { hello: "Hi" }, EN: { hello: "Hello" } },
  ];
  for (const catalogs of bad) {
    assert.throws(() => createI18n({ catalogs }), TypeError);
  }
  assert.throws(() => createI18n({ catalogs: { fr: { hi: "Bonjour" } } }), /Missing fallback catalog/);
  assert.throws(() => createI18n({
    catalogs: { en: { hi: "Hi" } }, fallbacks: { fr: "en" },
  }), TypeError);
  const original = { en: { hello: "Hi" } };
  const i18n = createI18n({ catalogs: original });
  original.en.hello = "Changed later";
  assert.equal(i18n.t("hello"), "Hi");
});

test("number and date formatting use the selected locale", () => {
  const i18n = translator("es-UY");
  assert.equal(i18n.number(1234.5), new Intl.NumberFormat("es-UY").format(1234.5));
  const date = new Date("2024-01-15T12:00:00.000Z");
  const options = { timeZone: "UTC", dateStyle: "short" };
  assert.equal(i18n.date(date, options), new Intl.DateTimeFormat("es-UY", options).format(date));
});

class FakeElement {
  constructor(attrs = {}, content = "", children = []) {
    this.attrs = { ...attrs };
    this.textContent = content;
    this.children = children;
    this.nodeType = 1;
  }
  get childElementCount() { return this.children.length; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = value; }
  matches(selector) {
    return selector.split(",").some(part => this.getAttribute(part.slice(1, -1)) !== null);
  }
  querySelectorAll(selector) {
    const found = [];
    function visit(parent) {
      for (const child of parent.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    }
    visit(this);
    return found;
  }
}

test("DOM adapter updates only opted-in leaf text and safe attributes", () => {
  const leaf = new FakeElement({ "data-i18n": "greeting" }, "Hello, Ana");
  const image = new FakeElement({ "data-i18n-alt": "caption" });
  const search = new FakeElement({
    "data-i18n-placeholder": "greeting", "data-i18n-title": "fallback",
  });
  const icon = new FakeElement();
  const parent = new FakeElement({
    "data-i18n": "greeting", "data-i18n-aria-label": "greeting",
  }, "Untouched", [icon]);
  const untouched = new FakeElement({}, "Library content");
  const root = new FakeElement({}, "", [leaf, image, search, parent, untouched]);
  const paramsFor = (element, key) => key === "greeting" ? { name: "Ana" } : { position: 4 };
  const i18n = translator("es-UY");
  applyI18n(root, i18n, paramsFor);
  assert.equal(leaf.textContent, "Hola, Ana");
  assert.equal(leaf.getAttribute("lang"), "es-419");
  assert.equal(image.getAttribute("alt"), "Imagen 4");
  assert.equal(search.getAttribute("placeholder"), "Hola, Ana");
  assert.equal(search.getAttribute("title"), "English only");
  assert.equal(parent.textContent, "Untouched");
  assert.equal(parent.children[0], icon);
  assert.equal(parent.getAttribute("aria-label"), "Hola, Ana");
  assert.equal(untouched.textContent, "Library content");
  i18n.setLocale("en");
  applyI18n(leaf, i18n, paramsFor);
  assert.equal(leaf.textContent, "Hello, Ana");
  assert.equal(leaf.getAttribute("lang"), "en");
});
