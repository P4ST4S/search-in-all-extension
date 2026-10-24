import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import '../extension/core.js';

const source = await readFile(new URL('../extension/palette.js', import.meta.url), 'utf8');

// Small DOM double for lifecycle/focus regressions; native text editing is checked in the browser.
function mount({ blockHostKeys = false, reply = async () => ({ ok: true, results: [], warnings: [] }) } = {}) {
  class Events {
    listeners = new Map();
    addEventListener(type, listener, options = false) {
      const capture = typeof options === 'object' ? Boolean(options.capture) : options;
      const entries = this.listeners.get(type) || [];
      entries.push({ listener, capture });
      this.listeners.set(type, entries);
    }
    removeEventListener(type, listener, options = false) {
      const capture = typeof options === 'object' ? Boolean(options.capture) : options;
      this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry.listener !== listener || entry.capture !== capture));
    }
    emit(type, event = {}, phase) {
      for (const entry of [...(this.listeners.get(type) || [])]) {
        if (phase !== undefined && entry.capture !== phase) continue;
        entry.listener(event);
        if (event.immediateStopped) break;
      }
    }
  }
  const document = new Events();
  const window = new Events();
  let hostCaptureKeys = 0;
  if (blockHostKeys) document.addEventListener('keydown', (event) => {
    hostCaptureKeys++;
    event.preventDefault();
  }, true);
  class Element extends Events {
    children = [];
    attributes = new Map();
    value = '';
    selectionStart = 0;
    selectionEnd = 0;
    scrollLeft = 0;
    focusCalls = 0;
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text; }
    constructor(tagName) { super(); this.tagName = tagName; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    remove() { this.parent.children = this.parent.children.filter((node) => node !== this); this.parent = null; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    attachShadow() { this.root = new Element('#shadow'); this.root.host = this; return this.root; }
    get isConnected() { return this === document.body || Boolean(this.parent?.isConnected || this.host?.isConnected); }
    querySelector(selector) {
      for (const node of this.children) {
        if (selector.startsWith('.') ? node.className?.split(' ').includes(selector.slice(1)) : node.tagName === selector) return node;
        const found = node.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    focus() {
      this.focusCalls++;
      let ancestor = this;
      while (ancestor.parent) ancestor = ancestor.parent;
      if (document.activeElement?.root) document.activeElement.root.activeElement = null;
      document.activeElement = ancestor.host || this;
      if (ancestor.host) ancestor.activeElement = this;
      const event = { stopImmediatePropagation() { this.immediateStopped = true; } };
      window.emit('focusin', event, true);
      if (!event.immediateStopped) document.emit('focusin', event, true);
    }
    showModal() { this.open = true; }
    close() { this.open = false; }
    scrollIntoView() {}
  }
  document.body = new Element('body');
  document.documentElement = document.body;
  document.createElement = (tag) => {
    const element = new Element(tag);
    element.style = { setProperty() {} };
    return element;
  };
  document.createTextNode = () => new Element('#text');
  document.hidden = false;
  const previous = new Element('textarea');
  previous.value = 'Texte de la page';
  document.body.append(previous);
  document.activeElement = previous;
  const frames = new Map();
  let nextFrame = 0;
  const sandbox = {
    ArcCore: globalThis.ArcCore, document, window, location: { href: 'https://host.example/' },
    chrome: { runtime: { getURL: (path) => `chrome-extension://test/${path}`, sendMessage: reply } },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  runInNewContext(source, sandbox);
  const host = () => document.body.querySelector('arc-command-bar');
  const input = () => host()?.root.querySelector('input');
  return {
    document, window, previous, sandbox, host, input,
    hostCaptureKeys: () => hostCaptureKeys,
    flushFrames() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); },
    keyboard(key) {
      const target = input();
      const root = host().root;
      const event = {
        key, type: 'keydown', isTrusted: true, defaultPrevented: false, stopped: false,
        composedPath: () => [target, root, host(), document, window],
        stopPropagation() { this.stopped = true; },
        stopImmediatePropagation() { this.stopped = true; this.immediateStopped = true; },
        preventDefault() { this.defaultPrevented = true; },
      };
      for (const [node, capture] of [[window, true], [document, true], [root, true], [target, false], [root, false], [document, false], [window, false]]) {
        node.emit('keydown', event, capture);
        if (event.stopped) break;
      }
      return event;
    },
  };
}

test('hiding the tab dismisses the palette without focusing the previous page field', () => {
  const page = mount();
  page.document.hidden = true;
  page.document.emit('visibilitychange');
  assert.ok(!page.host());
  assert.equal(page.previous.focusCalls, 0);
  page.document.hidden = false;
  page.flushFrames();
  assert.ok(!page.host());
  page.sandbox.__arcCommandBar.toggle();
  assert.ok(page.host());
  assert.ok(page.host().root.activeElement === page.input());
});

test('navigating dismisses the palette and cancels deferred focus', () => {
  const page = mount();
  page.window.emit('pagehide');
  page.flushFrames();
  assert.ok(!page.host());
  assert.equal(page.previous.focusCalls, 0);
  page.window.emit('focus');
  assert.ok(!page.host());
});

test('focus is repaired after opening and when the page regains focus', () => {
  const page = mount();
  page.host().root.activeElement = null;
  page.document.activeElement = page.previous;
  page.flushFrames();
  assert.ok(page.document.activeElement === page.host());
  assert.ok(page.host().root.activeElement === page.input());
  page.host().root.activeElement = null;
  page.document.activeElement = page.previous;
  page.window.emit('focus');
  assert.ok(page.host().root.activeElement === page.input());
});

test('host-page focus theft is corrected while the palette remains open', () => {
  const page = mount();
  page.previous.focus();
  assert.ok(page.document.activeElement === page.host());
  assert.ok(page.host().root.activeElement === page.input());
  assert.equal(page.previous.value, 'Texte de la page');
});

test('the close button remains focusable and normal dismissal restores page focus', () => {
  const page = mount();
  const close = page.host().root.querySelector('button');
  close.focus();
  assert.ok(page.host().root.activeElement === close);
  page.sandbox.__arcCommandBar.toggle();
  assert.ok(!page.host());
  assert.ok(page.document.activeElement === page.previous);
});

test('host capture and bubbling handlers cannot cancel the palette editing keys', () => {
  for (const key of ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'a']) {
    const page = mount({ blockHostKeys: true });
    let pageEvents = 0;
    page.document.addEventListener('keydown', () => pageEvents++);
    const event = page.keyboard(key);
    assert.equal(page.hostCaptureKeys(), 0, key);
    assert.equal(event.defaultPrevented, false, key);
    assert.equal(pageEvents, 0, key);
  }
});

test('favicon images are decorative and failed or untrusted images retain the generic icon', async () => {
  const results = [
    { kind: 'tab', id: 1, title: 'Site', url: 'https://site.example', favicon: 'data:image/png;base64,AA==' },
    { kind: 'bookmark', id: 'b1', title: 'Favori', url: 'https://site.example', favicon: 'https://remote.example/icon.png' },
    { kind: 'search', title: 'Rechercher', query: 'site', url: '' },
  ];
  const page = mount({ reply: async () => ({ ok: true, results, warnings: [] }) });
  await new Promise(setImmediate);
  const icon = page.host().root.querySelector('.icon');
  const image = icon.querySelector('img');
  assert.equal(image.src, results[0].favicon);
  assert.equal(image.alt, '');
  assert.equal(icon.attributes.get('aria-hidden'), 'true');
  assert.equal(page.host().root.querySelector('.results').children[1].querySelector('img'), null);
  image.emit('error');
  assert.equal(icon.querySelector('img'), null);
  assert.equal(icon.textContent, '▣');
});

test('late favicon responses cannot replace a newer query or reopen a dismissed palette', async () => {
  const pending = [];
  const result = (title) => [{ kind: 'tab', id: 1, title, url: 'https://site.example' }];
  const page = mount({ reply: async (message) => message.type === 'FAVICONS'
    ? new Promise((resolve) => pending.push(resolve)) : { ok: true, results: result(message.query || 'initial') } });
  await new Promise(setImmediate);
  page.input().value = 'new';
  page.input().emit('input', { isTrusted: true });
  await new Promise(setImmediate);
  pending[0]({ ok: true, results: result('stale') });
  await new Promise(setImmediate);
  assert.equal(page.host().root.querySelector('.title').textContent, 'new');
  page.sandbox.__arcCommandBar.toggle();
  pending[1]({ ok: true, results: result('late') });
  await new Promise(setImmediate);
  assert.ok(!page.host());
});

test('favicon arrival preserves existing rows, scroll position and keyboard selection', async () => {
  let finish;
  const results = [1, 2].map((id) => ({ kind: 'tab', id, title: `Site ${id}`, url: `https://site${id}.example` }));
  const page = mount({ reply: async (message) => message.type === 'FAVICONS'
    ? new Promise((resolve) => { finish = resolve; }) : { ok: true, results } });
  await new Promise(setImmediate);
  const list = page.host().root.querySelector('.results');
  const row = list.children[1];
  page.keyboard('ArrowDown');
  list.scrollTop = 50;
  finish({ ok: true, results: results.map((result) => ({ ...result, favicon: 'data:image/png;base64,AA==' })) });
  await new Promise(setImmediate);
  assert.ok(list.children[1] === row);
  assert.equal(row.attributes.get('aria-selected'), 'true');
  assert.equal(list.scrollTop, 50);
  assert.ok(row.querySelector('img'));
});
