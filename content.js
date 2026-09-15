/**
 * Glint — content script
 * ---------------------------------------------------------------------------
 * Runs in every frame of every page. Responsibilities:
 *
 *   1. Watch for a non-empty text selection inside an <input>, <textarea> or
 *      [contenteditable] element.
 *   2. Render a tiny floating "✨ Fix" button next to that selection, inside a
 *      closed-off Shadow DOM so page CSS can never touch it (and vice versa).
 *   3. Send the selected text to the service worker (never the API key here).
 *   4. Write the rewritten text straight back into the field, preserving focus,
 *      the caret, and the page framework's own state (input events fire
 *      normally, so React/Vue/Svelte controlled inputs stay in sync).
 *
 * The script is deliberately dependency-free and idempotent.
 * ---------------------------------------------------------------------------
 */

(() => {
  'use strict';

  if (window.__glintInjected) return;
  window.__glintInjected = true;

  // Page-visible proof that the content script is running here. The isolated
  // world's `window` is invisible to page scripts, but the DOM is shared, so
  // this attribute is the one reliable "is Glint alive on this page?" probe:
  //   DevTools console →  document.documentElement.dataset.glint
  try {
    document.documentElement.dataset.glint = 'ready';
  } catch {
    /* non-HTML document */
  }

  /* ---------------------------------------------------------------------- *
   * Tunables
   * ---------------------------------------------------------------------- */

  const MAX_CHARS = 6000;
  const GAP = 8; // px between caret and button (selection mode)
  const CORNER_INSET = 6; // px from the field's top-right corner (field mode)
  const MIN_FIELD_WIDTH = 120; // below this the icon sits outside instead
  const EDGE_PAD = 8; // px from viewport edges
  const SETTLE_MS = 90; // debounce for selectionchange storms
  const TOAST_MS = 4200;
  const SUCCESS_MS = 850;
  /** An error state lingers long enough to be read, then gets out of the way. */
  const ERROR_HIDE_MS = 6000;

  /** Input types that hold prose worth rewriting. */
  const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel']);

  /* ---------------------------------------------------------------------- *
   * State
   * ---------------------------------------------------------------------- */

  /** @type {HTMLElement|null} */ let host = null;
  /** @type {ShadowRoot|null} */ let root = null;
  /** @type {HTMLButtonElement|null} */ let button = null;
  /** @type {HTMLElement|null} */ let toast = null;

  /** Selection captured when the button was shown. */
  let pending = null;
  let busy = false;
  let settleTimer = null;
  let toastTimer = null;
  let successTimer = null;
  let errorTimer = null;
  let dismissedSignature = null;
  /** While the user drags a selection we stay hidden, like native spellcheck. */
  let pointerSelecting = false;
  let pointerSelectingAt = 0;
  /** A drag that ends outside the window never delivers a mouseup. */
  const POINTER_STALE_MS = 4000;
  /** Suppresses selection updates long enough for the "Done" flash to be seen. */
  let flashUntil = 0;

  /* ---------------------------------------------------------------------- *
   * Theme
   *
   * The widget always renders one of two resolved themes — never "system" —
   * so the palette is a plain attribute swap in the shadow stylesheet. The
   * preference is "system" by default and tracks the OS live.
   * ---------------------------------------------------------------------- */

  const STORAGE_KEY = 'glint:settings';
  const DARK_QUERY = window.matchMedia('(prefers-color-scheme: dark)');

  let themePreference = 'system'; // 'system' | 'light' | 'dark'

  function resolvedTheme() {
    if (themePreference === 'light' || themePreference === 'dark') return themePreference;
    return DARK_QUERY.matches ? 'dark' : 'light';
  }

  function applyThemePreference(value) {
    themePreference = value === 'light' || value === 'dark' ? value : 'system';
    if (host) host.dataset.glintTheme = resolvedTheme();
  }

  // Follow the OS while the preference is "system".
  DARK_QUERY.addEventListener('change', () => {
    if (themePreference === 'system') applyThemePreference('system');
  });

  function watchStoredTheme() {
    chrome.storage.local
      .get(STORAGE_KEY)
      .then((stored) => applyThemePreference(stored?.[STORAGE_KEY]?.theme))
      .catch(() => {});

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      applyThemePreference(changes[STORAGE_KEY].newValue?.theme);
    });
  }

  try {
    watchStoredTheme();
  } catch {
    /* storage unavailable (rare) — fall back to the OS theme */
  }

  /* ---------------------------------------------------------------------- *
   * Widget (Shadow DOM)
   * ---------------------------------------------------------------------- */

  const WIDGET_CSS = `
    /* Dark is the default; the light palette is swapped in by one selector. */
    :host {
      --glint-bg: #17191f;
      --glint-bg-hover: #1f2229;
      --glint-fg: #f3f5f9;
      --glint-toast-fg: #e8ebf1;
      --glint-border: rgba(255, 255, 255, 0.10);
      --glint-border-hover: rgba(255, 255, 255, 0.18);
      --glint-shadow: 0 8px 22px rgba(0, 0, 0, 0.34), 0 1px 2px rgba(0, 0, 0, 0.45);
      --glint-shadow-sm: 0 2px 10px rgba(0, 0, 0, 0.28);
      --glint-ok: #7ee2ab;
      --glint-ok-border: rgba(70, 200, 130, 0.55);
      --glint-err: #ff9ea1;
      --glint-err-border: rgba(229, 72, 77, 0.6);
      --glint-focus: #7c8cff;
    }
    :host([data-glint-theme="light"]) {
      --glint-bg: #ffffff;
      --glint-bg-hover: #f4f5f7;
      --glint-fg: #14161a;
      --glint-toast-fg: #14161a;
      --glint-border: rgba(16, 18, 22, 0.12);
      --glint-border-hover: rgba(16, 18, 22, 0.20);
      --glint-shadow: 0 8px 22px rgba(16, 18, 22, 0.16), 0 1px 2px rgba(16, 18, 22, 0.08);
      --glint-shadow-sm: 0 2px 10px rgba(16, 18, 22, 0.14);
      --glint-ok: #0f7b46;
      --glint-ok-border: rgba(15, 123, 70, 0.45);
      --glint-err: #a3161a;
      --glint-err-border: rgba(200, 40, 45, 0.5);
      --glint-focus: #4f46e5;
    }

    .glint-btn {
      position: fixed;
      top: 0; left: 0;
      display: none;
      align-items: center;
      gap: 6px;
      box-sizing: border-box;
      min-width: 64px;
      height: 28px;
      padding: 0 10px;
      border: 1px solid var(--glint-border);
      border-radius: 8px;
      background: var(--glint-bg);
      color: var(--glint-fg);
      font: 500 12.5px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      letter-spacing: 0.1px;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      box-shadow: var(--glint-shadow);
      z-index: 2147483647;
      transition: background 140ms ease, border-color 140ms ease, transform 140ms ease,
                  color 140ms ease, opacity 140ms ease;
    }
    .glint-btn:hover { background: var(--glint-bg-hover); border-color: var(--glint-border-hover); }
    .glint-btn:active { transform: translateY(1px); }
    .glint-btn:focus-visible { outline: 2px solid var(--glint-focus); outline-offset: 2px; }

    .glint-btn.is-idle   { animation: glint-pop 130ms cubic-bezier(0.2, 0.9, 0.3, 1.2); }
    .glint-btn.is-busy   { cursor: progress; opacity: 0.9; }
    .glint-btn.is-success { border-color: var(--glint-ok-border); color: var(--glint-ok); }
    .glint-btn.is-error  { border-color: var(--glint-err-border); color: var(--glint-err); }

    .glint-spark { font-size: 12px; line-height: 1; }
    .glint-label { font-weight: 550; }

    /* Field mode: a compact app icon parked in the field's top-right corner. */
    .glint-btn.is-field {
      min-width: 0;
      width: 26px;
      height: 26px;
      padding: 0;
      gap: 0;
      justify-content: center;
      border-radius: 7px;
      opacity: 0.62;
      backdrop-filter: blur(6px);
      box-shadow: var(--glint-shadow-sm);
    }
    .glint-btn.is-field:hover,
    .glint-btn.is-field:focus-visible { opacity: 1; }
    .glint-btn.is-field .glint-label { display: none; }
    .glint-btn.is-field .glint-spark { font-size: 14px; }

    .glint-spinner {
      display: none;
      width: 11px; height: 11px;
      border: 1.5px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: glint-spin 620ms linear infinite;
    }
    .glint-btn.is-busy .glint-spinner { display: block; }
    .glint-btn.is-busy .glint-spark { display: none; }

    .glint-toast {
      position: fixed;
      top: 0; left: 0;
      display: none;
      box-sizing: border-box;
      max-width: 300px;
      padding: 7px 10px;
      border: 1px solid var(--glint-border);
      border-radius: 8px;
      background: var(--glint-bg);
      color: var(--glint-toast-fg);
      font: 400 12px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: var(--glint-shadow);
      z-index: 2147483647;
    }
    .glint-toast.is-error { border-color: var(--glint-err-border); color: var(--glint-err); }

    @keyframes glint-spin { to { transform: rotate(360deg); } }
    @keyframes glint-pop {
      from { opacity: 0; transform: scale(0.92); }
      to   { opacity: 1; transform: scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .glint-btn, .glint-spinner { animation: none !important; transition: none !important; }
    }
  `;

  function ensureWidget() {
    if (host && host.isConnected) return;

    host = document.createElement('glint-widget');
    // Inline, page-proof positioning. The Shadow Root keeps interior styles safe.
    host.style.cssText =
      'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; margin: 0; padding: 0; border: 0;';
    host.dataset.glintTheme = resolvedTheme();

    root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = WIDGET_CSS;
    root.appendChild(style);

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'glint-btn is-idle';
    button.title = 'Glint: fix spelling, grammar and fluency';
    button.setAttribute('aria-label', 'Fix text with Glint');
    button.innerHTML =
      '<span class="glint-spark" aria-hidden="true">\u2728</span>' +
      '<span class="glint-label">Fix</span>' +
      '<span class="glint-spinner" aria-hidden="true"></span>';

    toast = document.createElement('div');
    toast.className = 'glint-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    root.append(button, toast);

    // Never let the widget steal focus or collapse the selection: the whole
    // trick that keeps the user's highlight alive is preventDefault on mousedown.
    for (const type of ['mousedown', 'pointerdown', 'mouseup', 'touchstart']) {
      button.addEventListener(type, keepSelection, { capture: true });
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      run();
    });

    (document.body || document.documentElement).appendChild(host);
  }

  function keepSelection(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function destroyWidget() {
    host?.remove();
    host = null;
    root = null;
    button = null;
    toast = null;
  }

  /* ---------------------------------------------------------------------- *
   * Selection capture
   * ---------------------------------------------------------------------- */

  /** activeElement, pierced through open shadow roots (design systems love them). */
  function deepActiveElement() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function isTextInput(el) {
    if (el instanceof HTMLTextAreaElement) return true;
    if (!(el instanceof HTMLInputElement)) return false;
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    // Passwords and numeric/date pickers are intentionally excluded.
    return TEXT_INPUT_TYPES.has(type);
  }

  function isEditable(el) {
    return Boolean(el) && (el.isContentEditable === true || el.getAttribute?.('contenteditable') === 'true');
  }

  function isUsableField(el) {
    return Boolean(el) && el.isConnected && !el.disabled && !el.readOnly;
  }

  /** Is `node` inside `el`, including across a shadow boundary? */
  function isInside(el, node) {
    if (!el || !node) return false;
    if (el.contains(node)) return true;
    return Boolean(el.shadowRoot) && node.getRootNode?.() === el.shadowRoot;
  }

  /**
   * Decide what the ✨ button should act on right now.
   *
   *   selection mode — a non-empty highlight: fix just that text, button sits
   *                    next to the caret.
   *   field mode     — no highlight but the focused field has content: fix the
   *                    whole field, button sits in the field's top-right corner.
   *
   * @returns {null | {
   *   mode: 'selection'|'field', kind: 'input'|'contenteditable', el: HTMLElement,
   *   text: string, start?: number, end?: number, range?: Range,
   *   anchor?: {left:number, top:number, bottom:number}
   * }}
   */
  function readTarget() {
    const el = deepActiveElement();
    if (!isUsableField(el)) return null;
    if (host && (el === host || isInside(host, el))) return null;

    const selection = readSelectionIn(el);
    if (selection) return selection;

    // Field mode: any text at all, short or long.
    const text = readFieldText(el);
    if (!text.trim()) return null;

    return {
      mode: 'field',
      kind: isTextInput(el) ? 'input' : 'contenteditable',
      el,
      text
    };
  }

  /** @returns {null | object} a selection target, if the field has a highlight. */
  function readSelectionIn(el) {
    if (isTextInput(el)) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start == null || end == null || end <= start) return null;
      const text = el.value.slice(start, end);
      if (!text.trim()) return null;
      const anchor = caretAnchor(el, end);
      if (!anchor) return null;
      return { mode: 'selection', kind: 'input', el, start, end, text, anchor };
    }

    if (isEditable(el)) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
      const range = selection.getRangeAt(0);
      if (!isInside(el, range.commonAncestorContainer)) return null;
      const text = selection.toString();
      if (!text.trim()) return null;
      const rect = range.getBoundingClientRect();
      const anchor =
        rect && (rect.width || rect.height)
          ? { left: rect.left, top: rect.top, bottom: rect.bottom }
          : elementAnchor(el);
      return { mode: 'selection', kind: 'contenteditable', el, range: range.cloneRange(), text, anchor };
    }

    return null;
  }

  /** The field's own text, ignoring any highlight. */
  function readFieldText(el) {
    if (isTextInput(el)) return el.value;
    return el.innerText || el.textContent || '';
  }

  /** A stable-ish fingerprint of the current target, used for dismissal. */
  function selectionSignature(info) {
    if (!info) return null;
    if (info.mode === 'field') return `f:${readFieldText(info.el).length}`;
    if (info.kind === 'input') return `i:${info.start}:${info.end}:${info.text.length}`;
    return `c:${info.text.length}:${info.text.slice(0, 24)}`;
  }

  function elementAnchor(el) {
    const rect = el.getBoundingClientRect();
    return { left: rect.left + 12, top: rect.bottom - 4, bottom: rect.bottom };
  }

  /* ---------------------------------------------------------------------- *
   * Caret geometry for <input> / <textarea>
   * ---------------------------------------------------------------------- */

  const MIRROR_PROPS = [
    'boxSizing',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontFamily', 'lineHeight',
    'letterSpacing', 'wordSpacing', 'textIndent', 'textTransform', 'textAlign', 'direction',
    'whiteSpace', 'wordBreak', 'overflowWrap', 'tabSize', 'fontFeatureSettings'
  ];

  /**
   * Measure where the caret at `index` actually sits on screen by rendering the
   * text into an off-screen mirror that copies the field's exact typography.
   *
   * @param {HTMLInputElement|HTMLTextAreaElement} el
   * @param {number} index
   * @returns {{left:number, top:number, bottom:number}|null}
   */
  function caretAnchor(el, index) {
    const style = window.getComputedStyle(el);
    const elRect = el.getBoundingClientRect();

    const mirror = document.createElement('glint-mirror');
    mirror.style.cssText =
      'position: absolute; top: 0; left: -9999px; visibility: hidden; pointer-events: none; display: block;';
    for (const prop of MIRROR_PROPS) {
      const value = style[prop];
      if (value) mirror.style[prop] = value;
    }

    // Match the *content* width so wrapping lines up, even with a scrollbar.
    const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const borderX = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
    const contentWidth = Math.max(0, el.clientWidth - padX);
    mirror.style.width =
      (style.boxSizing === 'border-box' ? contentWidth + padX + borderX : contentWidth) + 'px';
    mirror.style.height = 'auto';
    mirror.style.overflow = 'hidden';

    mirror.textContent = el.value.slice(0, index);
    const marker = document.createElement('span');
    // A zero-width space keeps an empty marker measurable at the caret position.
    marker.textContent = el.value.slice(index) || '\u200b';
    mirror.appendChild(marker);

    document.documentElement.appendChild(mirror);

    let anchor;
    try {
      const mirrorRect = mirror.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      const lineHeight =
        markerRect.height || parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 14) * 1.2;

      const left = elRect.left + (markerRect.left - mirrorRect.left) - el.scrollLeft;
      const top = elRect.top + (markerRect.top - mirrorRect.top) - el.scrollTop;
      anchor = { left, top, bottom: top + lineHeight };
    } finally {
      mirror.remove();
    }

    // If the caret has been scrolled out of the field's visible box, anchor to
    // the field itself instead of pointing at empty space.
    const visible = {
      left: elRect.left - 2,
      right: elRect.right + 2,
      top: elRect.top - 2,
      bottom: elRect.bottom + 2
    };
    if (
      anchor.left < visible.left ||
      anchor.left > visible.right ||
      anchor.top < visible.top ||
      anchor.bottom > visible.bottom
    ) {
      return elementAnchor(el);
    }
    return anchor;
  }

  /* ---------------------------------------------------------------------- *
   * Placement
   * ---------------------------------------------------------------------- */

  /**
   * Field mode parks the button in the field's own top-right corner (or just
   * outside it when the field is too narrow to host the icon); selection mode
   * keeps it next to the caret.
   */
  function placeWidget(info) {
    if (!button || !info) return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = button.offsetWidth || 26;
    const height = button.offsetHeight || 26;

    let left;
    let top;

    if (info.mode === 'field') {
      const rect = info.el.getBoundingClientRect();

      // Nothing to attach to if the field is scrolled out of view.
      if (rect.bottom < 0 || rect.top > viewportHeight || rect.right < 0 || rect.left > viewportWidth) {
        hide();
        return;
      }

      if (rect.width >= MIN_FIELD_WIDTH) {
        // Inside the field's top-right corner, in the visible part of it.
        left = rect.right - width - CORNER_INSET;
        top = Math.max(rect.top, 0) + CORNER_INSET;
      } else {
        left = rect.right + 6;
        top = rect.top + (rect.height - height) / 2;
        if (left + width > viewportWidth - EDGE_PAD) left = rect.left - width - 6;
        if (rect.top < EDGE_PAD) top = rect.bottom + 6;
      }
    } else {
      const anchor = info.anchor;
      left = anchor.left + GAP;
      top = anchor.bottom + GAP;
      if (left + width > viewportWidth - EDGE_PAD) left = anchor.left - width - GAP;
      if (top + height > viewportHeight - EDGE_PAD) top = anchor.top - height - GAP;
    }

    left = clamp(left, EDGE_PAD, Math.max(EDGE_PAD, viewportWidth - width - EDGE_PAD));
    top = clamp(top, EDGE_PAD, Math.max(EDGE_PAD, viewportHeight - height - EDGE_PAD));

    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;

    if (toast && toast.style.display === 'block') placeToast();
  }

  function placeToast() {
    if (!toast || !button) return;
    const width = toast.offsetWidth || 200;
    const height = toast.offsetHeight || 30;
    const buttonTop = parseFloat(button.style.top) || 0;
    const buttonLeft = parseFloat(button.style.left) || 0;

    let left = buttonLeft;
    let top = buttonTop + (button.offsetHeight || 28) + 6;
    if (top + height > window.innerHeight - EDGE_PAD) top = buttonTop - height - 6;

    toast.style.left = `${Math.round(clamp(left, EDGE_PAD, Math.max(EDGE_PAD, window.innerWidth - width - EDGE_PAD)))}px`;
    toast.style.top = `${Math.round(clamp(top, EDGE_PAD, Math.max(EDGE_PAD, window.innerHeight - height - EDGE_PAD)))}px`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /* ---------------------------------------------------------------------- *
   * Show / hide
   * ---------------------------------------------------------------------- */

  function scheduleUpdate() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(update, SETTLE_MS);
  }

  /**
   * Never let an unforeseen page break the widget silently: surface it in the
   * console, prefixed so it is easy to grep for.
   */
  function guarded(fn) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        console.warn('[Glint]', error);
        return undefined;
      }
    };
  }

  const update = guarded(updateSafely);

  function updateSafely() {
    // Self-heal: a drag released outside the window never fires mouseup.
    if (pointerSelecting && Date.now() - pointerSelectingAt > POINTER_STALE_MS) {
      pointerSelecting = false;
    }
    if (busy || pointerSelecting || Date.now() < flashUntil) return;

    const info = readTarget();
    if (!info) {
      hide();
      return;
    }

    const signature = selectionSignature(info);
    if (signature === dismissedSignature) {
      hide();
      return;
    }
    dismissedSignature = null;

    ensureWidget();
    if (!button) return;

    pending = info;
    setState('idle');
    // Set the mode before showing: it changes the button's size, and the
    // placement maths measures the real box.
    setMode(info.mode);
    button.style.display = 'flex';
    placeWidget(info);
  }

  function hide() {
    pending = null;
    if (!button) return;
    button.style.display = 'none';
    hideToast();
  }

  /**
   * Field mode collapses the button to just the ✨ icon; selection mode shows
   * the icon plus a "Fix" label.
   */
  function setMode(mode) {
    if (!button) return;
    const isField = mode === 'field';
    button.classList.toggle('is-field', isField);
    const title = isField
      ? "Glint: rewrite everything in this field"
      : 'Glint: rewrite the highlighted text';
    button.title = title;
    button.setAttribute('aria-label', title);
  }

  function setState(state) {
    if (!button) return;
    button.classList.remove('is-idle', 'is-busy', 'is-success', 'is-error');
    button.classList.add(`is-${state}`);

    const label = button.querySelector('.glint-label');
    if (label) {
      label.textContent =
        state === 'busy' ? 'Fixing' : state === 'success' ? 'Done' : state === 'error' ? 'Failed' : 'Fix';
    }
    // Field mode has no room for a label, so the icon itself carries the state.
    const spark = button.querySelector('.glint-spark');
    if (spark) spark.textContent = state === 'success' ? '\u2713' : state === 'error' ? '!' : '\u2728';

    button.disabled = state === 'busy';
  }

  function showToast(message, variant = 'error') {
    ensureWidget();
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('is-error', variant === 'error');
    toast.style.display = 'block';
    placeToast();
    toastTimer = setTimeout(hideToast, TOAST_MS);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    if (toast) toast.style.display = 'none';
  }

  /* ---------------------------------------------------------------------- *
   * The rewrite round-trip
   * ---------------------------------------------------------------------- */

  async function run() {
    if (busy || !pending) return;
    const info = pending;

    if (info.text.length > MAX_CHARS) {
      showToast(
        `${info.mode === 'field' ? 'This field' : 'The selection'} is too long — ${info.text.length.toLocaleString()} of ${MAX_CHARS.toLocaleString()} characters.`,
        'error'
      );
      return;
    }

    // Snapshot for the "did the text move under us?" check.
    const snapshot = info.kind === 'input' ? info.el.value : null;

    busy = true;
    clearTimeout(successTimer);
    clearTimeout(errorTimer);
    setState('busy');

    let response;
    try {
      if (!chrome.runtime?.id) throw new Error('stale-context');
      response = await requestRewrite(info.text);
    } catch (error) {
      console.warn('[Glint] rewrite request failed:', error);
      response = {
        ok: false,
        error: 'Glint was updated or reloaded. Refresh this page and try again.'
      };
    }

    busy = false;

    if (!response || !response.ok) {
      setState('error');
      showToast(response?.error || 'Something went wrong talking to the model.', 'error');
      // A button parked in the error state sits on top of the page and swallows
      // clicks meant for whatever is underneath it, so retire it.
      scheduleErrorHide(info);
      return;
    }

    const output = String(response.text || '').trim();
    if (!output) {
      setState('error');
      showToast('The model returned an empty response.', 'error');
      scheduleErrorHide(info);
      return;
    }

    if (output === info.text.trim()) {
      setState('success');
      showToast('Already looks good — no changes made.', 'info');
      flashUntil = Date.now() + SUCCESS_MS + 700;
      successTimer = setTimeout(hide, SUCCESS_MS + 700);
      return;
    }

    const applied = applyRewrite(info, output, snapshot);

    if (!applied) {
      setState('error');
      showToast('The text changed while Glint was thinking, so nothing was replaced.', 'error');
      scheduleErrorHide(info);
      return;
    }

    setState('success');
    flashUntil = Date.now() + SUCCESS_MS;
    successTimer = setTimeout(() => {
      flashUntil = 0;
      if (!busy) hide();
    }, SUCCESS_MS);
  }

  /**
   * Ask the service worker to do the rewrite.
   *
   * An MV3 service worker is evicted when idle, and waking it up races the
   * first message: the send can fail with "Receiving end does not exist" even
   * though the extension is perfectly healthy. That is a cold start, not an
   * error — retry once. Anything else (a reloaded extension, a context that no
   * longer exists) is reported as-is so the user gets the right advice.
   */
  async function requestRewrite(text) {
    const message = { type: 'GLINT_REWRITE', text };
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (!isColdWorker(error)) throw error;
      console.warn('[Glint] cold service worker, retrying once:', error?.message || error);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return chrome.runtime.sendMessage(message);
    }
  }

  function isColdWorker(error) {
    const text = String(error?.message || error || '');
    return /receiving end does not exist|could not establish connection|message port closed/i.test(text);
  }

  /**
   * Let the user read the failure, then clear the button away so it stops
   * overlapping page content. Re-selecting the text brings it straight back.
   */
  function scheduleErrorHide(info) {
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => {
      if (!busy && pending === info) hide();
    }, ERROR_HIDE_MS);
  }

  /**
   * Write `text` back into the field in place.
   *
   * `document.execCommand('insertText')` is used first: it is the only API that
   * keeps the browser's native undo stack intact and fires a proper `beforeinput`
   * / `input` pair, which is exactly what React/Vue/Slate/Draft listen to.
   * The manual fallback covers pages where execCommand is disabled.
   *
   * @returns {boolean} whether the text was replaced
   */
  function applyRewrite(info, text, snapshot) {
    if (info.mode === 'field') return applyFieldRewrite(info, text, snapshot);

    if (info.kind === 'input') {
      const el = info.el;
      if (!el.isConnected) return false;
      if (snapshot !== null && el.value !== snapshot) return false;

      focusWithoutScroll(el);
      el.setSelectionRange(info.start, info.end);

      if (insertText(text)) return true;

      const next = el.value.slice(0, info.start) + text + el.value.slice(info.end);
      setNativeValue(el, next);
      const caret = info.start + text.length;
      try {
        el.setSelectionRange(caret, caret);
      } catch {
        /* some inputs reject selection ranges */
      }
      return true;
    }

    const el = info.el;
    if (!el.isConnected) return false;

    // The cloned range is only meaningful while its endpoints are still in the
    // document and still hold the exact text we measured.
    const range = info.range;
    if (!range || !range.startContainer.isConnected || !range.endContainer.isConnected) return false;
    if (range.toString() !== info.text) return false;

    focusWithoutScroll(el);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    if (insertText(text)) return true;

    try {
      const fallback = range.cloneRange();
      fallback.deleteContents();
      const node = document.createTextNode(text);
      fallback.insertNode(node);
      fallback.setStartAfter(node);
      fallback.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(fallback);
      el.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Replace the *entire* content of the field (field mode).
   *
   * For inputs and textareas we select everything first, so execCommand's
   * insert still goes through the native undo stack and the framework-visible
   * input events. For contenteditable we select the element's contents, which
   * intentionally flattens rich formatting down to plain text — undoable with
   * ⌘/Ctrl+Z.
   *
   * @returns {boolean} whether the field was rewritten
   */
  function applyFieldRewrite(info, text, snapshot) {
    const el = info.el;
    if (!el.isConnected) return false;

    if (info.kind === 'input') {
      if (snapshot !== null && el.value !== snapshot) return false;

      focusWithoutScroll(el);
      try {
        el.setSelectionRange(0, el.value.length);
      } catch {
        /* some inputs reject selection ranges */
      }

      if (insertText(text)) return true;

      setNativeValue(el, text);
      try {
        el.setSelectionRange(text.length, text.length);
      } catch {
        /* ignore */
      }
      return true;
    }

    focusWithoutScroll(el);
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    if (insertText(text)) return true;

    try {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      return true;
    } catch {
      return false;
    }
  }

  function insertText(text) {
    try {
      return document.execCommand('insertText', false, text);
    } catch {
      return false;
    }
  }

  function focusWithoutScroll(el) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }

  /**
   * Set `.value` through the native prototype setter so framework-controlled
   * inputs notice the change through their own value tracker.
   */
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) descriptor.set.call(el, value);
    else el.value = value;

    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ---------------------------------------------------------------------- *
   * Diagnostics
   *
   * The popup asks the content script what it can see on the current page.
   * This is the fastest way to tell "Glint is not running here" apart from
   * "Glint is running but cannot find a field".
   * ---------------------------------------------------------------------- */

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'GLINT_PROBE') return false;
    sendResponse(buildProbe());
    return false;
  });

  function buildProbe() {
    const active = deepActiveElement();
    const target = readTarget();
    const selection = window.getSelection();

    return {
      ok: true,
      frame: window.top === window ? 'top frame' : 'sub-frame',
      href: location.href,
      activeElement: describeElement(active),
      focusedIsEditable: Boolean(active) && (isTextInput(active) || isEditable(active)),
      selection: selection && !selection.isCollapsed ? selection.toString().length : 0,
      target: target
        ? { mode: target.mode, kind: target.kind, chars: target.text.length }
        : null,
      widget: !button ? 'not created' : button.style.display === 'none' ? 'hidden' : 'visible'
    };
  }

  function describeElement(el) {
    if (!el) return 'none';
    const tag = el.tagName ? el.tagName.toLowerCase() : String(el.nodeName);
    const bits = [tag];
    const attr = (name) => el.getAttribute?.(name);
    if (attr('contenteditable') !== null && attr('contenteditable') !== undefined) {
      bits.push(`contenteditable="${attr('contenteditable')}"`);
    }
    if (el.isContentEditable) bits.push('(editable)');
    if (attr('type')) bits.push(`type="${attr('type')}"`);
    if (attr('role')) bits.push(`role="${attr('role')}"`);
    if (attr('data-composer-input') !== null && attr('data-composer-input') !== undefined) {
      bits.push('[data-composer-input]');
    }
    if (el.readOnly) bits.push('(readonly)');
    if (el.disabled) bits.push('(disabled)');
    return bits.join(' ');
  }

  /* ---------------------------------------------------------------------- *
   * Global listeners
   *
   * Everything is registered in the capture phase on `document` so that page
   * handlers calling stopPropagation() cannot starve the widget.
   * ---------------------------------------------------------------------- */

  document.addEventListener('selectionchange', scheduleUpdate, true);
  // Typing and focusing are what bring the corner icon into existence.
  document.addEventListener('input', scheduleUpdate, true);
  document.addEventListener('focusin', scheduleUpdate, true);
  document.addEventListener('focusout', scheduleUpdate, true);

  document.addEventListener('keyup', (event) => {
    if (event.key === 'Escape') {
      dismissedSignature = selectionSignature(pending);
      hide();
      return;
    }
    scheduleUpdate();
  }, true);

  document.addEventListener('mousedown', (event) => {
    // Clicks on the widget must never dismiss it or steal the selection.
    if (host && (event.composedPath?.() || []).includes(host)) return;
    pointerSelecting = true;
    pointerSelectingAt = Date.now();
    // Selection mode hides while a new highlight is being dragged out; field
    // mode stays put so it does not flicker as you click around inside a field.
    if (!busy && pending?.mode === 'selection') hide();
  }, true);

  const endPointerSelection = () => {
    if (!pointerSelecting) return;
    pointerSelecting = false;
    scheduleUpdate();
  };
  document.addEventListener('mouseup', endPointerSelection, true);
  window.addEventListener('mouseup', endPointerSelection, true);
  window.addEventListener('dragend', endPointerSelection, true);

  // Scrolling or resizing moves the field and the caret, so re-measure rather
  // than hide — the icon stays glued to whatever it is attached to.
  document.addEventListener('scroll', () => {
    if (busy || Date.now() < flashUntil) return;
    scheduleUpdate();
  }, true);
  window.addEventListener('resize', () => {
    if (busy || Date.now() < flashUntil) return;
    scheduleUpdate();
  }, true);

  // Losing the window (switching tabs, opening the popup) dismisses the widget.
  window.addEventListener('blur', () => {
    if (!busy && Date.now() >= flashUntil) hide();
  });
})();
