import './core.js';
import { createFaviconLoader } from './favicons.js';

const { search, safeUrl, bookmarksFromTree, destination } = globalThis.ArcCore;
const ERRORS = {
  invalid: 'Cette action n’est pas autorisée.',
  missing: 'Ce résultat n’existe plus. Modifiez la recherche pour actualiser la liste.',
  search: 'La recherche n’a pas pu démarrer avec le moteur par défaut. Réessayez.',
  unavailable: 'La fenêtre d’origine n’est plus disponible. Rouvrez la palette depuis une fenêtre Brave.',
};

export function createController(api) {
  const sessions = new Map();
  const fallbackUrl = api.runtime.getURL('fallback.html');
  const ownOrigin = api.runtime.getURL('');
  let activation = Promise.resolve();

  async function context(sender) {
    if (sender.id !== api.runtime.id || (sender.frameId !== undefined && sender.frameId !== 0) || sender.tab?.incognito) throw new Error(ERRORS.invalid);
    if (sender.url?.startsWith(ownOrigin)) {
      const url = new URL(sender.url);
      if (url.origin !== new URL(fallbackUrl).origin || url.pathname !== '/fallback.html') throw new Error(ERRORS.invalid);
      // Extension pages may omit sender.tab; resolve only our own existing fallback page.
      const tab = Number.isInteger(sender.tab?.id) ? await api.tabs.get(sender.tab.id)
        : (await api.tabs.query({ url: `${fallbackUrl}*` })).find((entry) => entry.url === sender.url);
      if (!tab || tab.incognito || tab.url !== sender.url || (await api.windows.get(tab.windowId)).type !== 'popup') throw new Error(ERRORS.invalid);
      const sourceId = Number(url.searchParams.get('source'));
      if (!url.searchParams.has('source') || !Number.isInteger(sourceId) || sourceId < 0) throw new Error(ERRORS.invalid);
      const source = await api.tabs.get(sourceId).catch(() => { throw new Error(ERRORS.unavailable); });
      const window = await api.windows.get(source.windowId);
      if (source.incognito || window.type !== 'normal') throw new Error(ERRORS.invalid);
      return { tab, source };
    }
    if (sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)) throw new Error(ERRORS.invalid);
    const tab = await api.tabs.get(sender.tab.id);
    const window = await api.windows.get(tab.windowId);
    if (tab.incognito || window.type !== 'normal' || !/^https?:\/\//i.test(sender.url || '') || tab.url?.startsWith(ownOrigin)) throw new Error(ERRORS.invalid);
    return { tab, source: tab };
  }

  async function load() {
    const [tabs, bookmarks] = await Promise.allSettled([
      Promise.resolve().then(() => api.tabs.query({ windowType: 'normal' })),
      Promise.resolve().then(() => api.bookmarks.getTree()),
    ]);
    return {
      tabs: tabs.status === 'fulfilled' ? tabs.value.filter((tab) => !tab.incognito && !tab.url?.startsWith(ownOrigin)).map((tab) => ({
        kind: 'tab', id: tab.id, title: tab.title || tab.url || 'Onglet sans titre', url: tab.url || '', lastAccessed: tab.lastAccessed || 0,
      })) : [],
      bookmarks: bookmarks.status === 'fulfilled' ? bookmarksFromTree(bookmarks.value) : [],
      warnings: [tabs.status === 'rejected' && 'Les onglets sont indisponibles.', bookmarks.status === 'rejected' && 'Les favoris sont indisponibles.'].filter(Boolean),
    };
  }

  async function execute(action, source) {
    if (!action || typeof action !== 'object') throw new Error(ERRORS.invalid);
    if (action.kind === 'tab' && Number.isInteger(action.id)) {
      const tab = await api.tabs.get(action.id).catch(() => { throw new Error(ERRORS.missing); });
      const window = await api.windows.get(tab.windowId);
      if (tab.incognito || window.type !== 'normal' || tab.url?.startsWith(ownOrigin)) throw new Error(ERRORS.invalid);
      await api.tabs.update(tab.id, { active: true });
      await api.windows.update(tab.windowId, { focused: true });
      return;
    }
    if (action.kind === 'bookmark' && typeof action.id === 'string') {
      const [bookmark] = await api.bookmarks.get(action.id).catch(() => { throw new Error(ERRORS.missing); });
      const url = safeUrl(bookmark?.url);
      if (!url) throw new Error(ERRORS.missing);
      await api.tabs.create({ windowId: source.windowId, url, active: true });
      await api.windows.update(source.windowId, { focused: true });
      return;
    }
    if (!['url', 'search'].includes(action.kind) || typeof action.query !== 'string' || action.query.length > 2048) throw new Error(ERRORS.invalid);
    const target = destination(action.query);
    if (!target || target.kind !== action.kind) throw new Error(ERRORS.invalid);
    if (target.kind === 'url') {
      await api.tabs.create({ windowId: source.windowId, url: target.url, active: true });
    } else {
      const tab = await api.tabs.create({ windowId: source.windowId, url: 'about:blank', active: true });
      try {
        await api.search.query({ text: target.query, tabId: tab.id });
      } catch {
        // Only remove the untouched placeholder, never a page the user has navigated.
        const current = await api.tabs.get(tab.id).catch(() => null);
        if (current?.url === 'about:blank' && !current.pendingUrl) await api.tabs.remove(tab.id).catch(() => {});
        throw new Error(ERRORS.search);
      }
    }
    await api.windows.update(source.windowId, { focused: true });
  }

  async function handle(message, sender) {
    try {
      if (!message || !['INIT', 'SEARCH', 'FAVICONS', 'EXECUTE'].includes(message.type)) throw new Error(ERRORS.invalid);
      if (['SEARCH', 'FAVICONS'].includes(message.type) && (typeof message.query !== 'string' || message.query.length > 2048)) throw new Error(ERRORS.invalid);
      const { tab, source } = await context(sender);
      const key = tab.id;
      if (message.type === 'EXECUTE') {
        sessions.delete(key);
        await execute(message.action, source);
        return { ok: true };
      }
      // shortcut: sources refresh on opening, add live updates if in-palette changes become necessary.
      if (message.type === 'INIT' || !sessions.has(key) || sessions.get(key).documentId !== sender.documentId) {
        sessions.set(key, { documentId: sender.documentId, sources: load(), favicon: createFaviconLoader(api.runtime) });
      }
      const snapshot = sessions.get(key);
      const sources = await snapshot.sources;
      const results = search(sources, message.type === 'INIT' ? '' : message.query, source.id);
      if (message.type === 'FAVICONS') {
        return { ok: true, results: await Promise.all(results.map(async (result) => ({ ...result, favicon: await snapshot.favicon(result.url) }))) };
      }
      return { ok: true, results, warnings: sources.warnings };
    } catch (error) {
      return { ok: false, error: Object.values(ERRORS).includes(error.message) ? error.message : 'Cette action a échoué. Rouvrez la palette et réessayez.' };
    }
  }

  async function toggle(tab) {
    const existing = await api.tabs.query({ url: `${fallbackUrl}*` });
    if (existing.length) {
      await Promise.all(existing.map((entry) => api.tabs.remove(entry.id)));
      return;
    }
    if (!Number.isInteger(tab?.id) || tab.incognito) return;
    tab = await api.tabs.get(tab.id);
    if (tab.incognito) return;
    if (/^(?:brave|chrome|chrome-search|chrome-extension|about):/i.test(tab.url || '')) {
      const parent = await api.windows.get(tab.windowId);
      const width = Math.min(700, parent.width || 700);
      const height = Math.min(600, parent.height || 600);
      await api.windows.create({
        type: 'popup', url: `${fallbackUrl}?source=${tab.id}`, focused: true, width, height,
        left: Math.round((parent.left || 0) + ((parent.width || width) - width) / 2),
        top: Math.round((parent.top || 0) + ((parent.height || height) - height) / 2),
      });
      return;
    }
    if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('Unsupported page');
    await api.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED', files: ['core.js', 'palette.js'] });
  }

  function activate(tab) {
    activation = activation.then(() => toggle(tab)).then(async () => {
      await api.action.setBadgeText({ text: '' });
      await api.action.setTitle({ title: 'Ouvrir Arc Command Bar' });
    }).catch(async () => {
      await api.action.setBadgeText({ text: '!' }).catch(() => {});
      await api.action.setTitle({ title: 'La palette n’a pas pu s’ouvrir. Réessayez depuis une fenêtre Brave.' }).catch(() => {});
    });
    return activation;
  }

  return { handle, activate, forget: (id) => sessions.delete(id) };
}
