const sources = {
  tabs: [
    { kind: 'tab', id: 1, title: 'École — notes de recherche', url: 'https://ecole.example/notes', lastAccessed: 60 },
    { kind: 'tab', id: 2, title: 'Design — explorations', url: 'https://design.example/explorations', lastAccessed: 50 },
    { kind: 'tab', id: 3, title: 'École — planning', url: 'https://ecole.example/planning', lastAccessed: 40 },
    { kind: 'tab', id: 4, title: 'Documentation de l’équipe', url: 'https://docs.example/guide', lastAccessed: 30 },
    { kind: 'tab', id: 5, title: 'Musique pour travailler', url: 'https://musique.example', lastAccessed: 20 },
  ],
  bookmarks: [
    { kind: 'bookmark', id: 'b1', title: 'École — ressources', url: 'https://ecole.example/ressources' },
    { kind: 'bookmark', id: 'b2', title: 'Design — références', url: 'https://design.example/references' },
  ],
};
const previewOptions = new URLSearchParams(location.search);
const fallbackPreview = previewOptions.get('surface') === 'fallback';
const failure = previewOptions.get('failure');
if (failure === 'bookmarks') sources.bookmarks = [];
globalThis.chrome = {
  runtime: {
    id: 'preview',
    getURL: (path) => fallbackPreview ? `${location.origin}/preview.html` : `chrome-extension://preview/${path}`,
    async sendMessage(message) {
      if (message.type === 'EXECUTE') {
        if (failure === 'execute') return { ok: false, error: 'Ce résultat n’existe plus. Modifiez la recherche pour actualiser la liste.' };
        document.getElementById('executed').textContent = `Action simulée : ${JSON.stringify(message.action)}`;
        return { ok: true };
      }
      // Different delays exercise out-of-order responses during fast typing.
      await new Promise((resolve) => setTimeout(resolve, message.query?.length === 1 ? 120 : 15));
      return { ok: true, results: ArcCore.search(sources, message.query || '', 99), warnings: failure === 'bookmarks' ? ['Les favoris sont indisponibles.'] : [] };
    },
  },
};
// The preview stays open after Escape; production closes the native fallback window.
window.close = () => { document.getElementById('open').focus(); };
function togglePreview() {
  globalThis.__arcCommandBar.toggle();
  applyPreviewTheme();
}
document.getElementById('open').addEventListener('click', togglePreview);
const pageEditor = document.getElementById(previewOptions.get('editor') === 'chat' ? 'chat-editor' : 'previous');
if (previewOptions.has('focus-race')) {
  // Reproduce a site's capture-phase focus manager clearing focus on an unknown shadow host.
  document.addEventListener('focusin', (event) => {
    if (event.target.localName === 'arc-command-bar') {
      document.activeElement.blur();
      pageEditor.focus();
    }
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.target.localName === 'arc-command-bar' && ['Backspace', 'Delete'].includes(event.key)) event.preventDefault();
  }, true);
}
pageEditor.focus();
document.addEventListener('keydown', (event) => {
  if (event.key === 'F8' && event.isTrusted) {
    event.preventDefault();
    event.stopImmediatePropagation();
    togglePreview();
  }
}, true);
let pageKeys = 0;
document.addEventListener('keydown', () => { document.getElementById('host-keys').textContent = String(++pageKeys); });
function applyPreviewTheme() {
  // Force light CSS for visual inspection without changing the user’s system appearance.
  const shadow = document.querySelector('arc-command-bar')?.shadowRoot;
  if (previewOptions.get('theme') === 'light' && shadow) {
    for (const rule of shadow.querySelector('style').sheet.cssRules) {
      if (rule.conditionText === '(prefers-color-scheme: dark)') rule.media.mediaText = 'not all';
    }
  }
}
document.addEventListener('DOMContentLoaded', applyPreviewTheme);
