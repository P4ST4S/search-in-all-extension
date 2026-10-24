import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import '../extension/core.js';

const source = await readFile(new URL('../extension/palette.js', import.meta.url), 'utf8');

// Small DOM double for lifecycle/focus regressions; native text editing is checked in the browser.
function mount({ blockHostKeys = false } = {}) {
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
    chrome: { runtime: { getURL: (path) => `chrome-extension://test/${path}`, async sendMessage() { return { ok: true, results: [], warnings: [] }; } } },
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
