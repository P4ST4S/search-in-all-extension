import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../extension/controller.js';

function fixture() {
  const tabs = new Map([
    [1, { id: 1, windowId: 10, url: 'https://start.example', title: 'Start', lastAccessed: 90 }],
    [2, { id: 2, windowId: 20, url: 'https://ecole.example', title: 'École', lastAccessed: 80 }],
    [3, { id: 3, windowId: 30, url: 'https://private.example', title: 'Private', incognito: true }],
  ]);
  const windows = new Map([[10, { id: 10, type: 'normal', left: 100, top: 50, width: 1200, height: 800 }], [20, { id: 20, type: 'normal' }], [30, { id: 30, type: 'normal' }]]);
  const bookmarks = [{ id: 'b1', title: 'École ressources', url: 'https://ecole.example/resources' }];
  const calls = [];
  const api = {
    runtime: { id: 'test', getURL: (path) => `chrome-extension://test/${path}` },
    tabs: {
      async get(id) { if (!tabs.has(id)) throw new Error('missing'); return tabs.get(id); },
      async query(query) {
        calls.push(['query', query]);
        return [...tabs.values()].filter((tab) => query.url ? tab.url.startsWith(query.url.replace(/\*$/, '')) : windows.get(tab.windowId)?.type === query.windowType);
      },
      async create(info) { calls.push(['create', info]); const tab = { id: tabs.size + 100, ...info }; tabs.set(tab.id, tab); return tab; },
      async update(id, info) { calls.push(['update', id, info]); Object.assign(tabs.get(id), info); },
      async remove(id) { calls.push(['remove', id]); tabs.delete(id); },
    },
    windows: {
      async get(id) { if (!windows.has(id)) throw new Error('missing'); return windows.get(id); },
      async update(id, info) { calls.push(['focus', id, info]); },
      async create(info) {
        calls.push(['window', info]); windows.set(40, { id: 40, ...info });
        tabs.set(40, { id: 40, windowId: 40, url: info.url }); return { id: 40 };
      },
    },
    bookmarks: {
      async getTree() { calls.push(['bookmarks']); return [{ id: 'root', children: [{ id: 'folder', children: bookmarks }] }]; },
      async get(id) { const value = bookmarks.find((item) => item.id === id); if (!value) throw new Error('missing'); return [value]; },
    },
    search: { async query(info) { calls.push(['search', info]); } },
    scripting: { async executeScript(info) { calls.push(['inject', info]); } },
    action: { async setBadgeText(info) { calls.push(['badge', info]); }, async setTitle() {} },
  };
  const sender = { id: 'test', frameId: 0, documentId: 'doc1', url: 'https://start.example', tab: tabs.get(1) };
  return { api, sender, calls, tabs, windows, bookmarks, controller: createController(api) };
}

test('INIT loads sources independently and SEARCH preserves the chosen priority', async () => {
  const { controller, sender, calls } = fixture();
  const initial = await controller.handle({ type: 'INIT' }, sender);
  assert.equal(initial.ok, true);
  assert.deepEqual(initial.results.map((result) => result.id), [2]);
  const result = await controller.handle({ type: 'SEARCH', query: 'ecole' }, sender);
  assert.deepEqual(result.results.map((item) => item.kind), ['tab', 'bookmark', 'search']);
  assert.equal(calls.filter(([kind]) => kind === 'bookmarks').length, 1);
});

test('an unavailable source leaves the other source and web search usable', async () => {
  for (const failing of ['tabs', 'bookmarks', 'missing-bookmarks-api']) {
    const { api, controller, sender } = fixture();
    if (failing === 'tabs') api.tabs.query = async () => { throw new Error('denied'); };
    else if (failing === 'bookmarks') api.bookmarks.getTree = async () => { throw new Error('denied'); };
    else api.bookmarks = undefined;
    const result = await controller.handle({ type: 'SEARCH', query: 'ecole' }, sender);
    assert.equal(result.ok, true);
    assert.equal(result.warnings.length, 1);
    assert.deepEqual(result.results.map((item) => item.kind), [failing === 'tabs' ? 'bookmark' : 'tab', 'search']);
  }
});

test('sources refresh on reopening, navigation and worker restart', async () => {
  const { api, controller, sender, bookmarks } = fixture();
  await controller.handle({ type: 'INIT' }, sender);
  bookmarks.push({ id: 'b2', title: 'New', url: 'https://new.example' });
  assert.equal((await controller.handle({ type: 'SEARCH', query: 'New' }, sender)).results.length, 1);
  await controller.handle({ type: 'INIT' }, sender);
  assert.equal((await controller.handle({ type: 'SEARCH', query: 'New' }, sender)).results[0].id, 'b2');
  controller.forget(sender.tab.id);
  assert.equal((await controller.handle({ type: 'SEARCH', query: 'New' }, sender)).results[0].id, 'b2');
  assert.equal((await createController(api).handle({ type: 'SEARCH', query: 'New' }, sender)).results[0].id, 'b2');
});

test('reject foreign, subframe, private and unsupported message senders', async () => {
  const { controller, sender } = fixture();
  for (const bad of [
    { ...sender, id: 'foreign' }, { ...sender, frameId: 1 }, { ...sender, tab: undefined },
    { ...sender, tab: { ...sender.tab, incognito: true } }, { ...sender, url: 'javascript:alert(1)' },
    { ...sender, url: 'chrome-extension://test/other.html' },
    { ...sender, url: 'chrome-extension://test/fallback.html?source=3' },
    { ...sender, url: 'chrome-extension://test/fallback.html' },
  ]) assert.equal((await controller.handle({ type: 'INIT' }, bad)).ok, false);
  for (const message of [null, {}, { type: 'OTHER' }, { type: 'SEARCH', query: {} }, { type: 'SEARCH', query: 'a'.repeat(2049) }]) {
    assert.equal((await controller.handle(message, sender)).ok, false);
  }
});

test('switching tabs activates the existing tab and its window without creating a duplicate', async () => {
  const { controller, sender, calls } = fixture();
  assert.equal((await controller.handle({ type: 'EXECUTE', action: { kind: 'tab', id: 2 } }, sender)).ok, true);
  assert.deepEqual(calls, [['update', 2, { active: true }], ['focus', 20, { focused: true }]]);
});

test('bookmark execution resolves the current URL from the bookmark ID', async () => {
  const { controller, sender, calls, bookmarks } = fixture();
  bookmarks[0].url = 'https://updated.example/';
  assert.equal((await controller.handle({ type: 'EXECUTE', action: { kind: 'bookmark', id: 'b1', url: 'javascript:alert(1)' } }, sender)).ok, true);
  assert.deepEqual(calls[0], ['create', { windowId: 10, url: 'https://updated.example/', active: true }]);
});

test('closed tabs and deleted bookmarks return recoverable errors and invalidate the snapshot', async () => {
  const { controller, sender, tabs, bookmarks } = fixture();
  await controller.handle({ type: 'INIT' }, sender);
  tabs.delete(2);
  const result = await controller.handle({ type: 'EXECUTE', action: { kind: 'tab', id: 2 } }, sender);
  assert.equal(result.ok, false);
  assert.match(result.error, /n’existe plus/);
  assert.equal((await controller.handle({ type: 'SEARCH', query: 'ecole' }, sender)).results[0].kind, 'bookmark');
  bookmarks.splice(0);
  assert.equal((await controller.handle({ type: 'EXECUTE', action: { kind: 'bookmark', id: 'b1' } }, sender)).ok, false);
});

test('execution never accepts raw unsafe destinations, unknown actions or private tabs', async () => {
  const { controller, sender, calls, bookmarks } = fixture();
  bookmarks[0].url = 'javascript:alert(1)';
  for (const action of [
    { kind: 'url', query: 'javascript:alert(1)' }, { kind: 'url', query: 'hello' },
    { kind: 'search', query: 'https://example.com' }, { kind: 'search', query: '' },
    { kind: 'bookmark', id: 'b1' }, { kind: 'tab', id: 3 }, { kind: 'unknown' }, null,
  ]) assert.equal((await controller.handle({ type: 'EXECUTE', action }, sender)).ok, false);
  assert.equal(calls.length, 0);
});

test('web search uses the default engine and targets a new tab in the source window', async () => {
  const { controller, sender, calls } = fixture();
  const query = 'été & café + thé ?';
  assert.equal((await controller.handle({ type: 'EXECUTE', action: { kind: 'search', query } }, sender)).ok, true);
  assert.deepEqual(calls[0], ['create', { windowId: 10, url: 'about:blank', active: true }]);
  assert.deepEqual(calls[1], ['search', { text: query, tabId: 103 }]);
});

test('direct addresses are reparsed and opened in the source window', async () => {
  const { controller, sender, calls } = fixture();
  assert.equal((await controller.handle({ type: 'EXECUTE', action: { kind: 'url', query: 'example.com/path', url: 'https://forged.example' } }, sender)).ok, true);
  assert.deepEqual(calls[0], ['create', { windowId: 10, url: 'https://example.com/path', active: true }]);
});

test('a failed search removes only an untouched blank tab', async () => {
  for (const navigated of [false, true]) {
    const { api, controller, sender, tabs, calls } = fixture();
    api.search.query = async ({ tabId }) => {
      if (navigated) tabs.get(tabId).url = 'https://user.example';
      throw new Error('engine error with private details');
    };
    const result = await controller.handle({ type: 'EXECUTE', action: { kind: 'search', query: 'test' } }, sender);
    assert.equal(result.ok, false);
    assert.match(result.error, /moteur par défaut/);
    assert.equal(calls.some(([kind]) => kind === 'remove'), !navigated);
    assert.doesNotMatch(result.error, /private/);
  }
});

test('fallback searches keep using the original normal window after a worker restart', async () => {
  const { api, controller, sender, tabs, windows, calls } = fixture();
  const url = 'chrome-extension://test/fallback.html?source=1';
  tabs.set(40, { id: 40, windowId: 40, url });
  windows.set(40, { id: 40, type: 'popup' });
  const fallbackSender = { ...sender, url, tab: tabs.get(40) };
  assert.equal((await createController(api).handle({ type: 'SEARCH', query: 'ecole' }, fallbackSender)).ok, true);
  const extensionPageSender = { id: 'test', documentId: 'fallback-doc', url };
  assert.equal((await createController(api).handle({ type: 'INIT' }, extensionPageSender)).ok, true);
  assert.equal((await controller.handle({ type: 'EXECUTE', action: { kind: 'search', query: 'test' } }, fallbackSender)).ok, true);
  assert.equal(calls.find(([kind]) => kind === 'create')[1].windowId, 10);
});

test('ordinary pages inject in the isolated top frame, protected pages get one centered fallback', async () => {
  const { controller, sender, calls, tabs } = fixture();
  await controller.activate(sender.tab);
  assert.deepEqual(calls.find(([kind]) => kind === 'inject')[1], { target: { tabId: 1 }, world: 'ISOLATED', files: ['core.js', 'palette.js'] });
  calls.length = 0;
  tabs.get(1).url = 'brave://settings';
  await controller.activate(sender.tab);
  assert.deepEqual(calls.find(([kind]) => kind === 'window')[1], {
    type: 'popup', url: 'chrome-extension://test/fallback.html?source=1', focused: true, width: 700, height: 600, left: 350, top: 150,
  });
  await controller.activate(sender.tab);
  assert.equal(calls.filter(([kind]) => kind === 'window').length, 1);
  assert.deepEqual(calls.find(([kind]) => kind === 'remove'), ['remove', 40]);
});

test('a failed web overlay reports the error without opening a new window', async () => {
  const { api, controller, sender, calls } = fixture();
  api.scripting.executeScript = async () => { throw new Error('restricted'); };
  await controller.activate(sender.tab);
  assert.equal(calls.some(([kind]) => kind === 'window'), false);
  assert.deepEqual(calls.at(-1), ['badge', { text: '!' }]);
});

test('activation reads the actual page instead of relying on stale action metadata', async () => {
  const { controller, sender, tabs, calls } = fixture();
  const staleTab = { ...sender.tab };
  tabs.get(1).url = 'brave://settings';
  await controller.activate(staleTab);
  assert.equal(calls.some(([kind]) => kind === 'inject'), false);
  assert.equal(calls.some(([kind]) => kind === 'window'), true);
});

test('failure to open the internal-page fallback is visible on the action', async () => {
  const { api, controller, sender, tabs, calls } = fixture();
  tabs.get(1).url = 'brave://settings';
  api.windows.create = async () => { throw new Error('blocked'); };
  await controller.activate(sender.tab);
  assert.deepEqual(calls.at(-1), ['badge', { text: '!' }]);
});

test('rapid activations serialize and cannot create duplicate fallback windows', async () => {
  const { controller, sender, tabs, calls } = fixture();
  tabs.get(1).url = 'brave://settings';
  await Promise.all([controller.activate(sender.tab), controller.activate(sender.tab)]);
  assert.equal(calls.filter(([kind]) => kind === 'window').length, 1);
  assert.deepEqual(calls.find(([kind]) => kind === 'remove'), ['remove', 40]);
});

test('a fallback whose source tab has closed returns a useful error', async () => {
  const { controller, sender, tabs, windows } = fixture();
  const url = 'chrome-extension://test/fallback.html?source=999';
  tabs.set(40, { id: 40, windowId: 40, url });
  windows.set(40, { id: 40, type: 'popup' });
  const result = await controller.handle({ type: 'SEARCH', query: 'test' }, { ...sender, url, tab: tabs.get(40) });
  assert.equal(result.ok, false);
  assert.match(result.error, /fenêtre d’origine/);
});
