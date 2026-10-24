import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/core.js';

const core = globalThis.ArcCore;
const tab = (id, title, url = `https://site.example/${id}`, lastAccessed = id) => ({ kind: 'tab', id, title, url, lastAccessed });
const bookmark = (id, title, url = `https://favoris.example/${id}`) => ({ kind: 'bookmark', id, title, url });

test('a query stays text, with accents, operators and special characters intact', () => {
  for (const query of ['été & café + thé ?', 'site:example.com test', 'bonjour monde', 'localhost:abc']) {
    assert.deepEqual(core.destination(` ${query} `), { kind: 'search', query });
  }
  assert.equal(core.destination('   '), null);
});

test('HTTP(S), bare domains, ports, localhost, IPv6 and international domains open as URLs', () => {
  for (const [input, url] of [
    ['example.com', 'https://example.com/'], ['www.example.com/a?q=été#part', 'https://www.example.com/a?q=%C3%A9t%C3%A9#part'],
    ['http://localhost:3000/a', 'http://localhost:3000/a'], ['localhost:8080', 'https://localhost:8080/'],
    ['[::1]:3000', 'https://[::1]:3000/'], ['école.fr', 'https://xn--cole-9oa.fr/'],
  ]) assert.deepEqual(core.destination(input), { kind: 'url', url });
});

test('unsafe schemes and malformed explicit URLs never become navigation or search actions', () => {
  for (const input of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,test', 'file:///tmp/a', 'brave://settings', 'ftp://example.com', 'custom://example.com', 'https://', 'https://has space.example', 'https://user:password@example.com']) {
    assert.deepEqual(core.destination(input), { kind: 'blocked' }, input);
  }
});

test('bookmarks traverse all folders, omit folders and unsafe destinations', () => {
  assert.deepEqual(core.bookmarksFromTree([{ id: '0', children: [
    { id: '1', title: 'Folder', children: [{ id: '2', title: '', url: 'https://example.com' }] },
    { id: '3', title: 'Unsafe', url: 'javascript:alert(1)' }, { id: '4', title: 'Local', url: 'file:///tmp/a' },
  ] }]), [{ kind: 'bookmark', id: '2', title: 'example.com', url: 'https://example.com' }]);
});

test('empty query shows five most recently used tabs, excluding the current tab', () => {
  const tabs = Array.from({ length: 8 }, (_, i) => tab(i, `Page ${i}`));
  assert.deepEqual(core.search({ tabs, bookmarks: [bookmark('b', 'Favorite')] }, ' ', 7).map((item) => item.id), [6, 5, 4, 3, 2]);
});

test('tabs precede bookmarks, and the final action is always last', () => {
  const sources = { tabs: [tab(1, 'Doc notes')], bookmarks: [bookmark('b', 'Doc')] };
  assert.deepEqual(core.search(sources, 'doc', 99).map((item) => item.kind), ['tab', 'bookmark', 'search']);
  assert.equal(core.search(sources, 'missing', 99)[0].kind, 'search');
  assert.equal(core.search(sources, 'docs.example', 99).at(-1).kind, 'url');
  assert.deepEqual(core.search(sources, 'javascript:alert(1)', 99), []);
});

test('matching ignores accents/case, spans title and URL, and requires every word', () => {
  const sources = { tabs: [tab(1, 'ÉCOLE — Été', 'https://notes.example/planning')], bookmarks: [] };
  assert.equal(core.search(sources, 'ecole planning', 99)[0].id, 1);
  assert.equal(core.search(sources, 'école absent', 99).length, 1);
  assert.equal(core.search(sources, 'https://notes.example', 99)[0].id, 1);
});

test('exact matches, prefixes, other matches, then recency determine source order', () => {
  const tabs = [tab(1, 'An école page', undefined, 100), tab(2, 'École notes', undefined, 20), tab(3, 'École', undefined, 1), tab(4, 'École planning', undefined, 30)];
  assert.deepEqual(core.search({ tabs, bookmarks: [] }, 'ecole', 99).slice(0, -1).map((item) => item.id), [3, 4, 2, 1]);
});

test('each source is capped at five results, with the web action preserved', () => {
  const tabs = Array.from({ length: 9 }, (_, i) => tab(i, 'Design'));
  const bookmarks = Array.from({ length: 9 }, (_, i) => bookmark(String(i), 'Design'));
  const results = core.search({ tabs, bookmarks }, 'design', 99);
  assert.equal(results.length, 11);
  assert.equal(results.filter((item) => item.kind === 'tab').length, 5);
  assert.equal(results.filter((item) => item.kind === 'bookmark').length, 5);
  assert.equal(results.at(-1).kind, 'search');
});

test('completion appends a prefix match without replacing the typed text', () => {
  const result = tab(1, 'École notes', 'https://www.ecole.example/planning');
  assert.equal(core.completion('eco', result), 'ecole notes');
  assert.equal(core.completion('ECO', result), 'ECOle notes');
  assert.equal(core.completion('ecole.ex', result), 'ecole.example/planning');
  assert.equal(core.completion('notes', result), '');
  assert.equal(core.completion('eco ', result), '');
  assert.equal(core.completion('', result), '');
  assert.equal(core.completion('ecole notes', result), '');
  assert.equal(core.completion('eco', { kind: 'search', title: 'ecole' }), '');
  assert.equal(core.completion('e', tab(2, 'E\u0301cole')), 'ecole');
});

test('keyboard selection stays within the results and handles an empty list', () => {
  assert.equal(core.moveSelection(0, -1, 3), 0);
  assert.equal(core.moveSelection(2, 1, 3), 2);
  assert.equal(core.moveSelection(0, 1, 3), 1);
  assert.equal(core.moveSelection(-1, 1, 0), -1);
});

test('late responses cannot replace current results or execute the old selection', () => {
  const state = core.createSearchState();
  const first = state.begin();
  assert.equal(state.accept(first, [tab(1, 'First')]), true);
  const second = state.begin();
  assert.deepEqual(state.results, []);
  assert.equal(state.index, -1);
  assert.equal(state.accept(first, [tab(1, 'Late')]), false);
  assert.equal(state.isCurrent(first), false);
  assert.equal(state.accept(second, [tab(2, 'Current'), tab(3, 'Next')]), true);
  state.move(1);
  assert.equal(state.results[state.index].id, 3);
});
