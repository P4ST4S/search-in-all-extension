import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFaviconLoader } from '../extension/favicons.js';

const png = await readFile(new URL('./fixtures/github.png', import.meta.url));
const runtime = { getURL: (path) => `chrome-extension://test/${path}` };

test('favicons use only the internal endpoint, with encoded addresses and a per-opening cache', async () => {
  const calls = [];
  const load = createFaviconLoader(runtime, async (url, options) => {
    calls.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(png, { headers: { 'Content-Type': 'image/png' } });
  });
  const page = 'https://ecole.example/été?q=a&b=2#notes';
  const [first, second] = await Promise.all([load(page), load(page)]);
  assert.equal(first, `data:image/png;base64,${png.toString('base64')}`);
  assert.equal(first, second);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]);
  assert.equal(url.protocol, 'chrome-extension:');
  assert.equal(url.host, 'test');
  assert.equal(url.pathname, '/_favicon/');
  assert.equal(url.searchParams.get('pageUrl'), new URL(page).href);
  assert.equal(url.searchParams.get('size'), '64');
});

test('unsupported or executable destinations never request an image', async () => {
  const load = createFaviconLoader(runtime, async () => { assert.fail('unexpected fetch'); });
  for (const page of ['', undefined, 'javascript:alert(1)', 'data:image/png;base64,AA==', 'brave://settings', 'https://user:secret@example.com']) {
    assert.equal(await load(page), '');
  }
});

test('Chromium favicon PNG bytes advertised as image/bmp are accepted', async () => {
  const load = createFaviconLoader(runtime, async () => new Response(png, { headers: { 'Content-Type': 'image/bmp' } }));
  assert.equal(await load('https://github.example'), `data:image/png;base64,${png.toString('base64')}`);
});

test('missing, failed, timed-out, non-PNG and oversized images use the fallback', async () => {
  for (const response of [
    () => { throw new Error('unavailable'); },
    () => { throw new DOMException('Timed out', 'TimeoutError'); },
    () => new Response(null, { status: 404 }),
    () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    () => new Response('<svg/>', { headers: { 'Content-Type': 'image/png' } }),
    () => new Response('BMfake', { headers: { 'Content-Type': 'image/bmp' } }),
    () => new Response('', { headers: { 'Content-Type': 'image/png' } }),
    () => new Response(new Uint8Array(65537), { headers: { 'Content-Type': 'image/png' } }),
  ]) {
    const load = createFaviconLoader(runtime, response);
    assert.equal(await load('https://ecole.example'), '');
  }
});
