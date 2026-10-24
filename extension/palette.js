(() => {
  if (globalThis.__arcCommandBar) {
    globalThis.__arcCommandBar.toggle();
    return;
  }

  const { completion, createSearchState, destination } = globalThis.ArcCore;
  const fallback = location.href.startsWith(chrome.runtime.getURL('fallback.html'));
  const state = createSearchState();
  let host, root, dialog, input, ghost, list, status, hint, closeButton, previous;
  let composing = false;
  let busy = false;
  let fullCompletion = '';
  let opened = false;
  let session = 0;
  let lastWarnings = [];
  let focusFrame = 0;
  let refocusing = false;

  const styles = `
    :host { all: initial; color-scheme: light dark; --surface: #f9f8fc; --text: #282532; --muted: #655f73;
      --line: #e4e0eb; --selected: #e7dff3; --accent: #604581; --ghost: #756d81;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    dialog { position: fixed; inset: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none;
      margin: 0; padding: 0; border: 0; background: transparent; color: var(--text);
      font: 400 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    dialog::backdrop { background: rgb(24 19 36 / .16); backdrop-filter: blur(1px); }
    .panel { --panel-top: clamp(24px, 18dvh, 160px); position: absolute; top: var(--panel-top); left: 50%; transform: translateX(-50%);
      display: flex; flex-direction: column; max-height: calc(100dvh - var(--panel-top) - 16px);
      width: min(640px, calc(100vw - 32px)); background: var(--surface); border: 1px solid rgb(130 115 150 / .24);
      border-radius: 17px; box-shadow: 0 20px 80px rgb(23 14 41 / .23), 0 2px 8px rgb(23 14 41 / .08);
      overflow: hidden; animation: appear 120ms ease-out; }
    :host([data-fallback]) .panel { --panel-top: 24px; }
    .entry { display: flex; flex-shrink: 0; align-items: center; height: 66px; padding: 0 16px 0 22px; gap: 13px; }
    .search-icon { color: var(--muted); font-size: 27px; line-height: 1; }
    .field { position: relative; flex: 1; min-width: 0; }
    input, .ghost { width: 100%; margin: 0; padding: 10px 0; border: 0; font: 400 20px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: -.35px; white-space: pre; }
    input { position: relative; display: block; background: transparent; color: var(--text); outline: none; caret-color: var(--accent); }
    input::placeholder { color: var(--muted); opacity: 1; }
    input:focus-visible { box-shadow: 0 2px 0 -1px var(--accent); }
    .ghost { position: absolute; inset: 0; pointer-events: none; overflow: hidden; color: var(--ghost); }
    .ghost-prefix { visibility: hidden; }
    button { font: inherit; color: inherit; cursor: pointer; }
    .close { flex-shrink: 0; padding: 4px 6px; border: 1px solid var(--line); background: transparent; border-radius: 5px; color: var(--muted); font-size: 11px; }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .results { margin: 0; padding: 7px; border-top: 1px solid var(--line); list-style: none;
      min-height: 0; max-height: min(420px, calc(100dvh - var(--panel-top) - 130px)); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
    :host([data-fallback]) .results { max-height: max(72px, calc(100dvh - 150px)); }
    .results:empty { display: none; }
    .option { display: flex; align-items: center; gap: 12px; padding: 10px 12px; min-height: 58px;
      border-radius: 9px; cursor: pointer; user-select: none; }
    .option[aria-selected="true"] { background: var(--selected); }
    .icon { flex: 0 0 30px; width: 30px; height: 30px; display: grid; place-items: center;
      font-size: 20px; border-radius: 7px; color: var(--accent); background: rgb(125 102 161 / .09); }
    .copy { min-width: 0; flex: 1; }
    .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; line-height: 1.45; }
    .subtitle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 1.5; color: var(--muted); }
    .action { font-size: 11px; flex-shrink: 0; color: var(--muted); }
    .option[aria-selected="true"] .action { color: var(--accent); }
    footer { display: flex; flex-shrink: 0; justify-content: space-between; align-items: center; gap: 12px; padding: 9px 18px;
      border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; line-height: 1.5; }
    .status { flex: 1; min-width: 0; }
    .hint { white-space: nowrap; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    @media (prefers-color-scheme: dark) {
      :host { --surface: #292630; --text: #f3f0f7; --muted: #b9b2c6; --line: #45404f;
        --selected: #51405f; --accent: #e2c9fd; --ghost: #b3a7c2; }
      dialog::backdrop { background: rgb(9 7 14 / .36); }
    }
    @media (max-width: 480px) {
      .entry { padding-left: 14px; gap: 8px; } input, .ghost { font-size: 17px; }
      .action { display: none; } .option { padding: 9px 8px; gap: 8px; } footer { padding-inline: 13px; }
      .option[aria-selected="true"] .action { display: block; max-width: 72px; white-space: normal; font-size: 10px; }
    }
    @media (max-height: 400px) { .panel { --panel-top: 16px; } .results { max-height: calc(100dvh - 140px); } }
    @keyframes appear { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
    @media (forced-colors: active) { .option[aria-selected="true"] { outline: 2px solid Highlight; } }
  `;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function close(restoreFocus = true) {
    if (!opened) return;
    opened = false;
    session++;
    state.begin();
    cancelAnimationFrame(focusFrame);
    window.removeEventListener('keydown', keydown, true);
    window.removeEventListener('keypress', containKey, true);
    window.removeEventListener('keyup', containKey, true);
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('pagehide', leavePage);
    window.removeEventListener('focus', ensureFocus);
    window.removeEventListener('focusin', keepFocus, true);
    dialog.close();
    host.remove();
    if (fallback) window.close();
    else if (restoreFocus && previous?.isConnected) previous.focus({ preventScroll: true });
  }

  function leavePage() { close(false); }

  function visibilityChanged() {
    if (document.hidden) leavePage();
  }

  function ensureFocus() {
    if (!opened || document.hidden || refocusing) return;
    if (document.activeElement === host && [input, closeButton].includes(root.activeElement)) return;
    refocusing = true;
    try { input.focus({ preventScroll: true }); }
    finally { refocusing = false; }
  }

  function keepFocus(event) {
    // Host focus traps must not redirect focus away from the active modal.
    event.stopImmediatePropagation();
    ensureFocus();
  }

  function containKey(event) {
    if (!event.composedPath().includes(host)) return;
    event.stopImmediatePropagation();
    if (event.type === 'keyup') ghostText();
  }

  function ghostText() {
    fullCompletion = !composing && input.selectionStart === input.value.length && input.selectionEnd === input.value.length
      ? completion(input.value, state.results[state.index]) : '';
    ghost.replaceChildren();
    if (fullCompletion) {
      ghost.append(element('span', 'ghost-prefix', input.value), document.createTextNode(fullCompletion.slice(input.value.length)));
    }
    ghost.scrollLeft = input.scrollLeft;
    hint.textContent = fullCompletion ? 'Tab compléter · ↵ ouvrir' : '↑ ↓ choisir · ↵ ouvrir';
  }

  function select(index, scroll = false) {
    state.index = index;
    for (let i = 0; i < list.children.length; i++) list.children[i].setAttribute('aria-selected', String(i === index));
    const current = list.children[index];
    if (current) {
      input.setAttribute('aria-activedescendant', current.id);
      if (scroll) current.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
    ghostText();
  }

  function render(results) {
    list.replaceChildren();
    input.setAttribute('aria-expanded', String(results.length > 0));
    const labels = { tab: 'Aller à l’onglet', bookmark: 'Ouvrir le favori', search: 'Moteur par défaut', url: 'Nouvel onglet' };
    const icons = { tab: '▣', bookmark: '☆', search: '⌕', url: '↗' };
    for (const [index, result] of results.entries()) {
      const row = element('li', 'option');
      row.id = `arc-option-${index}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === state.index));
      const icon = element('span', 'icon', icons[result.kind]);
      icon.setAttribute('aria-hidden', 'true');
      const copy = element('span', 'copy');
      const subtitle = result.kind === 'search' ? 'Rechercher sur le web' : result.url;
      row.setAttribute('aria-label', `${result.title}. ${labels[result.kind]}. ${subtitle}`);
      copy.append(element('div', 'title', result.title), element('div', 'subtitle', subtitle));
      row.append(icon, copy, element('span', 'action', labels[result.kind]));
      row.addEventListener('pointermove', (event) => { if (event.isTrusted) select(index); });
      row.addEventListener('pointerdown', (event) => { if (event.isTrusted) event.preventDefault(); });
      row.addEventListener('click', (event) => { if (event.isTrusted) { select(index); void execute(); } });
      list.append(row);
    }
    select(state.index);
    root.querySelector('.announcements').textContent = `${results.length} résultat${results.length === 1 ? '' : 's'}.`;
  }

  async function request(type = 'SEARCH') {
    const revision = state.begin();
    const currentSession = session;
    render([]);
    input.setAttribute('aria-busy', 'true');
    status.textContent = 'Recherche…';
    try {
      const response = await chrome.runtime.sendMessage({ type, query: input.value });
      if (!opened || currentSession !== session || !state.accept(revision, response.ok ? response.results : [])) return;
      lastWarnings = response.warnings || [];
      render(state.results);
      status.textContent = !response.ok ? response.error : lastWarnings.join(' ') ||
        (destination(input.value)?.kind === 'blocked' ? 'Seules les adresses HTTP et HTTPS peuvent être ouvertes.'
          : !state.results.length ? 'Saisissez une adresse ou une recherche.' : 'Onglets · Favoris · Web');
    } catch {
      if (!opened || currentSession !== session || !state.accept(revision, [])) return;
      status.textContent = 'Connexion à l’extension interrompue. Fermez puis rouvrez la palette.';
    } finally {
      if (opened && currentSession === session && state.isCurrent(revision)) input.setAttribute('aria-busy', 'false');
    }
  }

  async function execute() {
    const result = state.results[state.index];
    if (!result || busy || composing) return;
    busy = true;
    input.readOnly = true;
    const currentSession = session;
    status.textContent = 'Ouverture…';
    try {
      const action = ['tab', 'bookmark'].includes(result.kind)
        ? { kind: result.kind, id: result.id } : { kind: result.kind, query: input.value };
      const response = await chrome.runtime.sendMessage({ type: 'EXECUTE', action });
      if (!opened || currentSession !== session) return;
      if (response.ok) close();
      else {
        await request();
        if (!opened || currentSession !== session) return;
        status.textContent = response.error;
        input.focus();
      }
    } catch {
      if (opened && currentSession === session) status.textContent = 'L’action a échoué. Fermez puis rouvrez la palette.';
    } finally {
      if (currentSession === session) { busy = false; input.readOnly = false; }
    }
  }

  function keydown(event) {
    if (!event.composedPath().includes(host)) return;
    // Intercept before document-level shortcuts; leave native editing and IME uncancelled.
    event.stopImmediatePropagation();
    if (!event.isTrusted || event.isComposing || composing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    const inInput = root.activeElement === input;
    if (inInput && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      state.move(event.key === 'ArrowDown' ? 1 : -1);
      select(state.index, true);
    } else if (inInput && event.key === 'Enter') {
      event.preventDefault();
      void execute();
    } else if (event.key === 'Tab') {
      if (inInput && !event.shiftKey && fullCompletion && !busy) {
        event.preventDefault();
        input.value = fullCompletion;
        input.setSelectionRange(input.value.length, input.value.length);
        void request();
      } else if (inInput && event.shiftKey) { event.preventDefault(); closeButton.focus(); }
      else if (root.activeElement === closeButton && !event.shiftKey) { event.preventDefault(); input.focus(); }
    } else if (root.activeElement === closeButton && ['Enter', ' '].includes(event.key)) {
      event.preventDefault(); close();
    }
  }

  function open() {
    previous = document.activeElement;
    session++;
    busy = false;
    composing = false;
    opened = true;
    host = element('arc-command-bar');
    host.style.setProperty('all', 'initial', 'important');
    if (fallback) host.setAttribute('data-fallback', '');
    // Keep titles and queries out of the host page’s DOM APIs; extension pages can use an open root.
    root = host.attachShadow({ mode: fallback ? 'open' : 'closed', delegatesFocus: true });
    const style = element('style', '', styles);
    dialog = element('dialog');
    dialog.setAttribute('aria-label', 'Ouvrir un onglet, un favori ou rechercher');
    const panel = element('section', 'panel');
    const entry = element('div', 'entry');
    const icon = element('span', 'search-icon', '⌕');
    icon.setAttribute('aria-hidden', 'true');
    const field = element('div', 'field');
    ghost = element('div', 'ghost');
    ghost.setAttribute('aria-hidden', 'true');
    input = element('input');
    input.type = 'text';
    input.autofocus = true;
    input.placeholder = 'Rechercher ou saisir une adresse';
    input.maxLength = 2048;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-label', 'Rechercher dans les onglets, les favoris et sur le web');
    input.setAttribute('aria-autocomplete', 'both');
    input.setAttribute('aria-controls', 'arc-results');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-describedby', 'arc-instructions arc-status');
    field.append(ghost, input);
    closeButton = element('button', 'close', 'esc');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Fermer la palette');
    closeButton.addEventListener('click', (event) => { if (event.isTrusted) close(); });
    entry.append(icon, field, closeButton);
    list = element('ul', 'results');
    list.id = 'arc-results';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Suggestions');
    const footer = element('footer');
    status = element('span', 'status');
    status.id = 'arc-status';
    status.setAttribute('role', 'status');
    hint = element('span', 'hint');
    hint.setAttribute('aria-hidden', 'true');
    footer.append(status, hint);
    const instructions = element('span', 'sr', 'Flèches haut et bas pour choisir. Entrée pour ouvrir. Tab accepte le complément en fin de saisie ; sinon Tab et Majuscule Tab déplacent le focus. Échap pour fermer.');
    instructions.id = 'arc-instructions';
    const announcement = element('span', 'sr announcements');
    announcement.setAttribute('aria-live', 'polite');
    panel.append(entry, list, footer, instructions, announcement);
    dialog.append(panel);
    root.append(style, dialog);
    (document.body || document.documentElement).append(host);
    window.addEventListener('focusin', keepFocus, true);
    window.addEventListener('focus', ensureFocus);
    window.addEventListener('pagehide', leavePage);
    document.addEventListener('visibilitychange', visibilityChanged);
    dialog.showModal();
    input.focus({ preventScroll: true });
    const currentSession = session;
    focusFrame = requestAnimationFrame(() => {
      focusFrame = 0;
      if (opened && session === currentSession) ensureFocus();
    });
    input.addEventListener('input', (event) => { if (event.isTrusted && !composing) void request(); });
    input.addEventListener('compositionstart', () => { composing = true; ghostText(); });
    input.addEventListener('compositionend', () => { composing = false; void request(); });
    for (const event of ['click', 'select', 'scroll']) input.addEventListener(event, ghostText);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    dialog.addEventListener('click', (event) => { if (event.isTrusted && event.target === dialog) close(); });
    for (const event of ['click', 'pointerdown', 'pointerup']) dialog.addEventListener(event, (e) => e.stopPropagation());
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keypress', containKey, true);
    window.addEventListener('keyup', containKey, true);
    void request('INIT');
  }

  globalThis.__arcCommandBar = { toggle: () => opened ? close() : open() };
  open();
})();
