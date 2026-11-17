import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const web = new URL('../../web/', import.meta.url);
const html = readFileSync(new URL('setup.html', web), 'utf8');
const script = readFileSync(new URL('i18n.js', web), 'utf8');

function render(language) {
  const nodes = Array.from(html.matchAll(/data-i18n="([^"]+)">([^<]+)/g),
    ([, key, textContent]) => ({ dataset: { i18n: key }, textContent }));
  nodes.push({ dataset: { i18n: 'toString' }, textContent: 'Readable fallback' });
  const document = { querySelectorAll(selector) {
    assert.equal(selector, '[data-i18n]');
    return nodes;
  } };
  runInNewContext(script, { navigator: { language }, document });
  return nodes.map(node => [node.textContent, node.lang]);
}

test('setup loads its catalogues before its controller', () => {
  assert.match(html, /<script src="\/ui\/i18n\.js"><\/script>\s*<script src="\/ui\/setup\.js/);
});

test('setup translates marked labels and preserves unknown keys', () => {
  assert.deepEqual(render('ES-419'), [
    ['Configurar Lastbook', 'es-419'], ['Volver a la biblioteca', 'es-419'],
    ['Revisando este equipo…', 'es-419'], ['Readable fallback', undefined],
  ]);
});

test('absent and unsupported locales use English', () => {
  for (const locale of [undefined, 'fr']) {
    assert.deepEqual(render(locale), [
      ['Set up Lastbook', 'en'], ['Back to the library', 'en'],
      ['Looking at this computer…', 'en'], ['Readable fallback', undefined],
    ]);
  }
});
