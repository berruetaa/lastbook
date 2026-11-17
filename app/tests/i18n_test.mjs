import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
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
  assert.match(html, /<script src="\/ui\/i18n\.js\?v=\d+"><\/script>\s*<script src="\/ui\/setup\.js/);
});

test('setup translates marked labels and preserves unknown keys', () => {
  assert.deepEqual(render('ES-419'), [
    ['Configurar Lastbook', 'es-419'], ['Volver a la biblioteca', 'es-419'],
    ['Revisando este equipo…', 'es-419'], ['Readable fallback', undefined],
  ]);
});

test('Spanish language tags share the es-419 catalogue', () => {
  const expected = render('es-419');
  for (const locale of ['es', 'es-UY', 'es-AR', 'es-CL', 'ES-mx']) {
    assert.deepEqual(render(locale), expected);
  }
});

test('absent and unsupported locales use English', () => {
  for (const locale of [undefined, 'fr', 'et-EE']) {
    assert.deepEqual(render(locale), [
      ['Set up Lastbook', 'en'], ['Back to the library', 'en'],
      ['Looking at this computer…', 'en'], ['Readable fallback', undefined],
    ]);
  }
});

test('plain-text interpolation falls back to English and ignores inherited names', () => {
  const env = { navigator: { language: 'es' }, document: { querySelectorAll: () => [] } };
  runInNewContext(script, env);
  const { t } = env.LastbookI18n;
  assert.equal(t('setup.installedItems', { items: '<b>$&</b>' }), 'Installed: <b>$&</b>.');
  assert.equal(t('setup.installedItems', Object.create({ items: 'hidden' })), 'Installed: {items}.');
  assert.equal(t('__proto__'), '__proto__');
});

test('retry replaces the error view with translated, focusable setup controls', async ctx => {
  const browser = process.env.CHROMIUM || 'chromium';
  const dir = mkdtempSync(join(tmpdir(), 'lastbook-i18n-'));
  ctx.after(() => rmSync(dir, { recursive: true, force: true }));
  // Chromium's DevTools pipe drives an in-memory page without a server or browser library.
  const child = spawn(browser, ['--headless', '--no-sandbox', '--disable-background-networking',
    '--remote-debugging-pipe', '--no-startup-window', '--user-data-dir=' + dir],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  try {
    await once(child, 'spawn');
  } catch (error) {
    if (error.code === 'ENOENT') return ctx.skip('Set CHROMIUM to a local Chromium executable');
    throw error;
  }
  const exited = once(child, 'exit');
  const timer = setTimeout(() => child.kill(), 15000);
  ctx.after(async () => { clearTimeout(timer); child.kill(); await exited; });
  let id = 0, buffer = '';
  child.stdio[4].setEncoding('utf8');
  const replies = child.stdio[4][Symbol.asyncIterator]();
  async function command(method, params, sessionId) {
    child.stdio[3].write(JSON.stringify({ id: ++id, method, params, sessionId }) + '\0');
    for (;;) {
      while (!buffer.includes('\0')) {
        const chunk = await replies.next();
        assert.ok(!chunk.done, 'Chromium closed its DevTools pipe');
        buffer += chunk.value;
      }
      const end = buffer.indexOf('\0');
      const msg = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (msg.id !== id) continue;
      assert.ok(!msg.error, msg.error?.message);
      return msg.result;
    }
  }
  for (const [language, heading, control, hint] of [
    ['es-AR', 'Configurar Lastbook', 'Elegir una carpeta de biblioteca existente', 'Elige tu estado'],
    ['fr', 'Set up Lastbook', 'Choose an existing library folder', 'Choose your state'],
  ]) {
    const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
    const setup = readFileSync(new URL('setup.js', web), 'utf8');
    const body = html.split('<body class="setup">')[1].split('<script')[0];
    const expression = `
      document.body.innerHTML = ${JSON.stringify(body)};
      Object.defineProperty(navigator, 'language', { value: ${JSON.stringify(language)} });
      let attempts = 0;
      window.fetch = async () => {
        if (!attempts++) throw Error('offline');
        return { ok: true, json: async () => ({}) };
      };
      ${script}
      ${setup}
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        const retry = document.querySelector('#again');
        await retry.onclick();
        const main = document.querySelector('main');
        const folder = main.querySelector('#haveLib');
        const result = [retry.isConnected, document.activeElement === main.querySelector('h1'),
          typeof folder.onclick, main.querySelector('h1').textContent, folder.textContent,
          main.querySelector('.lead').textContent];
        LastbookI18n.apply(main);
        if (folder.textContent !== result[4]) throw Error('Repeated apply changed the label');
        return result;
      })()`;
    const reply = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.ok(!reply.exceptionDetails, reply.exceptionDetails?.exception?.description);
    const [connected, focused, handler, title, label, secondary] = reply.result.value;
    assert.deepEqual([connected, focused, handler, title, label], [false, true, 'function', heading, control]);
    assert.ok(secondary.startsWith(hint));
  }
});
