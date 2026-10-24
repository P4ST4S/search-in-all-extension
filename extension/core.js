// Shared by the module service worker and the classic injected script, without a build step.
(() => {
  const normalize = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');
  const displayUrl = (url) => url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');

  function destination(input) {
    const query = input.trim();
    if (!query) return null;
    if (/^(?:javascript|data|vbscript|file|about|chrome|brave|chrome-extension|blob|ftp|mailto|tel):/i.test(query)
      || (/^[a-z][a-z\d+.-]*:\/\//i.test(query) && !/^https?:\/\//i.test(query))) {
      return { kind: 'blocked' };
    }
    const explicit = /^https?:\/\//i.test(query);
    const address = /^(?:localhost|\[[a-f\d:]+\]|(?:[\p{L}\d](?:[\p{L}\d-]*[\p{L}\d])?\.)+[\p{L}\d-]+)(?::\d+)?(?:[/?#][^\s]*)?$/iu.test(query);
    if (explicit || address) {
      try {
        const url = new URL(explicit ? query : `https://${query}`);
        if (!url.hostname || url.username || url.password || /\s/.test(query)) return { kind: 'blocked' };
        return { kind: 'url', url: url.href };
      } catch {
        if (explicit) return { kind: 'blocked' };
      }
    }
    return { kind: 'search', query };
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }

  function bookmarksFromTree(nodes) {
    return nodes.flatMap((node) => node.children ? bookmarksFromTree(node.children)
      : safeUrl(node.url) ? [{ kind: 'bookmark', id: node.id, title: node.title || displayUrl(node.url), url: node.url }] : []);
  }

  function completion(query, result) {
    if (!query || query !== query.trim() || !result || !['tab', 'bookmark'].includes(result.kind)) return '';
    const prefix = normalize(query);
    for (const candidate of [result.title, displayUrl(result.url || '')]) {
      if (!normalize(candidate).startsWith(prefix)) continue;
      let end = 0;
      while (end < candidate.length && normalize(candidate.slice(0, end)).length < prefix.length) end++;
      // Do not complete half a decomposed accent.
      while (end < candidate.length && /\p{M}/u.test(candidate[end])) end++;
      const suffix = candidate.slice(end);
      if (suffix) return query + suffix;
    }
    return '';
  }

  function ranked(items, query) {
    const text = normalize(query);
    const words = text.split(/\s+/);
    return items.map((item, index) => {
      const title = normalize(item.title || '');
      const url = normalize(displayUrl(item.url || ''));
      const rawUrl = normalize(item.url || '');
      const values = [title, url, rawUrl];
      const score = values.includes(text) ? 0 : values.some((value) => value.startsWith(text)) ? 1 : 2;
      return { item, index, score, matches: words.every((word) => `${title} ${rawUrl}`.includes(word)) };
    }).filter((entry) => entry.matches).sort((a, b) => a.score - b.score
      || (b.item.lastAccessed || 0) - (a.item.lastAccessed || 0)
      || a.index - b.index).slice(0, 5).map(({ item }) => item);
  }

  function search(sources, input, currentTabId) {
    const query = input.trim();
    if (!query) {
      return [...sources.tabs].filter((tab) => tab.id !== currentTabId)
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)).slice(0, 5);
    }
    const action = destination(query);
    const last = action.kind === 'blocked' ? [] : [{
      ...action,
      title: action.kind === 'url' ? 'Ouvrir l’adresse' : `Rechercher « ${query} »`,
      url: action.url || '',
    }];
    return [...ranked(sources.tabs, query), ...ranked(sources.bookmarks, query), ...last];
  }

  function moveSelection(index, direction, count) {
    return count ? Math.max(0, Math.min(count - 1, index + direction)) : -1;
  }

  // A revision invalidates both late searches and results displayed before a new keystroke.
  function createSearchState() {
    let revision = 0;
    return {
      results: [], index: -1,
      begin() { this.results = []; this.index = -1; return ++revision; },
      isCurrent(id) { return id === revision; },
      accept(id, results) {
        if (id !== revision) return false;
        this.results = results;
        this.index = results.length ? 0 : -1;
        return true;
      },
      move(direction) { this.index = moveSelection(this.index, direction, this.results.length); },
    };
  }

  globalThis.ArcCore = Object.freeze({ normalize, displayUrl, destination, safeUrl, bookmarksFromTree, completion, search, moveSelection, createSearchState });
})();
