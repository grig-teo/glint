# ✨ Glint

**A minimalist, open-source AI writing assistant for Chrome — bring your own key.**

Select text in any input, textarea or `contenteditable` field, click the little **✨ Fix** button
that appears next to your cursor, and the text is rewritten *in place*. No sidebar, no popups
mid-flow, no account, no middleman server.

```
┌──────────────────────────────────────────────────────────────┐
│  Dear team, i beleive we should of shipped this eariler      │
│                                  ┌──────────┐                │
│                                  │ ✨ Fix   │  ← click       │
│                                  └──────────┘                │
│  Dear team, I believe we should have shipped this earlier    │
└──────────────────────────────────────────────────────────────┘
```

## Two ways it shows up

| | When | Where the button sits | What it rewrites |
|---|---|---|---|
| **Caret mode** | You highlighted some text | Next to the selection | Just the highlighted text |
| **Field mode** | No highlight, but the field you're typing in has text | Small ✨ icon in the field's **top-right corner** | **Everything** in the field |

Field mode is the "just write, then fix it" path: type anything — a search box one-liner, a
paragraph, a whole email — and the icon is already waiting in the corner of the field. Click it and
the entire field is polished. Empty fields show nothing. Fields narrower than ~120px get the icon
just outside their right edge instead, so it never covers the text.

Both modes are undoable with the normal <kbd>⌘/Ctrl</kbd>+<kbd>Z</kbd>.

### Themes

The widget ships two palettes and picks one at all times — the value written to the DOM is always
`light` or `dark`, never `system`:

| Setting | Behaviour |
| --- | --- |
| **System** (default) | Follows `prefers-color-scheme`. Flipping your OS theme repaints the icon instantly, with no page reload. |
| **Light** | Always the light palette, even on a dark OS. |
| **Dark** | Always the dark palette, even on a light OS. |

Force a theme when the page disagrees with your OS — e.g. a web app with its own dark mode that
you run in the opposite OS setting. The palette lives in CSS custom properties on the widget host,
so state colours (spinner, ✓ success, `!` error, toasts) switch with it.

---

## Features

- **Floating quick-action button** — a non-empty selection gets a labelled **✨ Fix** button
  positioned with real caret geometry; a filled field gets a compact ✨ icon in its top-right
  corner. Both live in `<input>`, `<textarea>` and `[contenteditable]` elements.
- **True inline replacement** — the rewrite lands in the original field, keeps focus, keeps the
  caret, and keeps the page's own state in sync (React/Vue/Svelte controlled inputs included).
  Native undo (<kbd>⌘/Ctrl</kbd>+<kbd>Z</kbd>) still works.
- **BYOK, any OpenAI-compatible provider** — OpenAI, Groq, OpenRouter, Together, vLLM, LM Studio,
  Ollama, or Anthropic (both its OpenAI-compatible path and its native Messages API).
- **Secure key handling** — the API key is read and used *only* inside the MV3 service worker;
  page scripts never get a reference to it.
- **Minimalist settings popup** — endpoint, model, system prompt/mode, provider presets, advanced
  sampling options, and a one-click connection test.
- **Dark-mode friendly UI** — vanilla CSS, no frameworks, Shadow DOM isolated from page styles.
  One **System / Light / Dark** setting drives both the popup and the floating widget; on `System`
  it follows the OS and repaints the moment you switch your Mac or PC theme.
- **Zero build step, zero dependencies, zero telemetry.**

---

## Install (unpacked developer extension)

Glint is not on the Chrome Web Store; load it locally in about a minute.

1. **Get the files**

   ```bash
   git clone <your-fork-url> glint
   # or just download and unzip the folder
   ```

   Everything you need is the folder containing `manifest.json`.

2. **Open the extensions page** — go to `chrome://extensions`
   (or menu **⋮ → Extensions → Manage Extensions**).

3. **Enable Developer mode** — toggle **Developer mode** in the top-right corner.

4. **Load it** — click **Load unpacked** and select the `glint/` folder.

5. **Pin it** — click the puzzle-piece icon in the toolbar and pin **Glint** so the settings
   popup is one click away.

6. **Configure it** — click the Glint icon and fill in the settings
   (see [Configuration](#configuration)); then click **Save** → **Test**.

7. **Use it** — go to any site with a text box, select a sentence, and click **✨ Fix**.

> After you edit any file, press the **↻ reload** button on `chrome://extensions` and then refresh
> the page you are testing: content scripts are only injected on page load.

### Optional: allow it on local files

To use Glint inside `file://` pages, open the extension's **Details** page and enable
**Allow access to file URLs**.

---

## Configuration

Click the Glint toolbar icon:

| Field | What it does | Example |
| --- | --- | --- |
| **API key** | Your provider key. Stored in `chrome.storage.local`; sent only to the endpoint you configure. | `sk-…` |
| **Endpoint** | Base URL **or** full path. Glint appends `/v1/chat/completions` when needed. | `https://api.openai.com/v1` |
| **Model** | Model name passed through verbatim. | `gpt-4o-mini` |
| **Mode / system prompt** | The instruction sent with your text. Presets: Grammar & fluency (default), Improve fluency, Shorten, Professional, Friendly — or write your own. | see below |
| **Advanced** | `temperature`, `max_tokens` and an extra JSON body. Leave the first two blank to omit them (some reasoning models reject them). | `0.3` |
| **Extra request body** | Any JSON object merged into the request body, for provider-specific switches Glint does not model. It wins on conflicts. | `{"thinking": {"type": "disabled"}}` |
| **Theme** | `System` (default), `Light` or `Dark` — applies to the floating widget **and** the popup. `System` follows your OS setting and updates live. | `System` |

### Provider presets

| Provider | Endpoint | Example model | Notes |
| --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | Default |
| DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-flash` | Cheapest of the bunch. The preset also disables thinking mode — see below. |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Very fast, generous free tier |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` | One key, many models |
| Anthropic | `https://api.anthropic.com/v1/messages` | `claude-sonnet-4-5` | Glint detects the native Messages API and adapts headers/body automatically. `https://api.anthropic.com/v1` also works via Anthropic's OpenAI-compatible layer. |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.2` | No API key required. `ollama pull llama3.2` first. |

Model names change often — the ones above are just presets, and any string you type is passed
through to the provider unchanged.

### Using DeepSeek

1. Create a key at **[platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)**.
2. In the Glint popup, click the **DeepSeek** preset. It fills in:
   - **Endpoint** `https://api.deepseek.com/chat/completions` (the exact URL from DeepSeek's
     [quick-start docs](https://api-docs.deepseek.com/); a bare `https://api.deepseek.com` also
     works — Glint appends `/v1/chat/completions`)
   - **Model** `deepseek-flash` — or `deepseek-v4-pro` for more capability at ~4x the price
   - **Extra request body** `{"thinking": {"type": "disabled"}}`
3. Paste your key → **Save** → **Test**.

**Why that extra body matters.** DeepSeek's [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode)
is **enabled by default at `high` effort**, so without that line every ✨ Fix would think before
answering: several extra seconds of latency and reasoning tokens you pay for. Fixing grammar needs
none of that. (Thinking mode also ignores `temperature`, so the switch keeps your setting meaningful.)

Want it back on for hard rewrites? Replace the extra body with `{"thinking": {"type": "enabled"},
"reasoning_effort": "low"}` — Glint already ignores the separate `reasoning_content` field and
pastes only the final answer.

**Why the default endpoint is `https://api.openai.com/v1/chat/completions` and not
`https://openai.com`:** `openai.com` is the marketing website; API calls go to `api.openai.com`.
If you type a bare host or a base path, Glint completes it for you
(`https://api.openai.com` → `https://api.openai.com/v1/chat/completions`).

### Default system prompt

```
You are a minimalist text improvement tool. Fix any spelling mistakes, grammatical errors, and
slightly improve the fluency of the provided text. Do not add conversational filler, do not
include introductory remarks, and do not wrap the response in markdown quotes. Return ONLY the
polished, rewritten text.
```

As a belt-and-braces measure, Glint also strips stray markdown fences and wrapping quotes from
the model's answer before pasting it back.

---

## How it works

```
  page (isolated world)                 extension                  network
┌──────────────────────────┐   ┌───────────────────────────┐   ┌────────────────┐
│ content.js               │   │ background.js             │   │  your provider │
│  • selection detection   │   │  (MV3 service worker)     │   │  OpenAI / Groq │
│  • caret geometry        │──▶│  • reads chrome.storage   │──▶│  Ollama / …    │
│  • Shadow-DOM ✨ button   │   │  • holds the API key      │   │                │
│  • in-place replacement  │◀──│  • fetch() + adapters     │◀──│                │
└──────────────────────────┘   └───────────────────────────┘   └────────────────┘
        text in / text out          key never leaves here
```

1. `content.js` looks at the focused field and picks a mode: a non-empty highlight wins, otherwise
   any text in the field triggers the corner icon. Caret positions come from an off-screen
   typography mirror for `<input>`/`<textarea>` and `Range.getBoundingClientRect()` for
   `contenteditable`.
2. It renders a 28px button inside a Shadow Root, so page CSS cannot reach it and Glint's CSS
   cannot leak into the page.
3. `mousedown`/`pointerdown` on the button call `preventDefault()`, so the page never loses
   focus and the selection stays alive.
4. Clicking sends `{ type: 'GLINT_REWRITE', text }` to the service worker. Only the text crosses
   that boundary — never the key, endpoint or model.
5. The service worker merges your settings, resolves the endpoint, builds the provider-specific
   request and performs the `fetch()`.
6. The rewritten text comes back and is inserted with `document.execCommand('insertText')`, which
   preserves the native undo stack and fires the `input` events that frameworks listen for
   (with a native-setter fallback for stubborn editors).
7. If the field's contents changed while the model was thinking, Glint refuses to clobber it and
   tells you instead.

### File map

```
glint/
├── manifest.json          Manifest V3 definition
├── background.js          Service worker: settings, provider adapters, fetch
├── content.js             Selection capture, caret math, floating widget, replacement
├── popup.html             Settings panel markup
├── popup.css              Settings panel styles (light + dark)
├── popup.js               Settings panel logic
├── icons/                 Generated PNG icons (16/32/48/128)
└── tools/
    ├── make_icons.py      Regenerates the icons (requires Pillow)
    └── smoke-test.mjs     Node smoke test for the service-worker logic
```

### Permissions, and why

| Permission | Reason |
| --- | --- |
| `storage` | Save your key, endpoint, model and prompt locally. |
| `activeTab` | Current-tab access from the popup, as a minimal fallback. Glint does not use `chrome.scripting` or read your tabs. |
| `host_permissions: <all_urls>` | Two jobs: inject the content script on every page, and let the service worker POST to **whatever endpoint you configure** (a fixed allow-list cannot work for BYOK). |

If you would rather not grant site-wide host access, swap `host_permissions` for
`optional_host_permissions` and call `chrome.permissions.request()` from the popup when saving the
endpoint — the extension then asks for one origin at a time.

---

## Privacy

- Your API key is stored in `chrome.storage.local`. Deliberately **not** `chrome.storage.sync`, so
  it is never uploaded to a Google account.
- The only data that leaves your machine is the selected text and your system prompt, sent to the
  endpoint **you** configured, plus whatever that provider does with it under their own policy.
- Nothing is sent to the author of this extension. There is no analytics, no phone-home, no
  remote config, no update channel beyond your browser's own extension loading.
- `chrome.storage.local` is not encrypted at rest: it is protected by your OS user profile, so
  anyone who can read your Chrome profile can read the key. Use a scoped/limited key.

---

## Troubleshooting

### First: is Glint even running on that page?

Open the popup and click **Check this page** under *Diagnostics*. It reports exactly what the
content script can see:

```
Content script:  running (top frame)
Focused element: div contenteditable="true" (editable) role="textbox"
  editable:      yes
Target:          field mode, contenteditable, 42 chars
  → the ✨ icon should sit in the top-right corner of that field
Widget:          visible
```

If the first line says **NOT RUNNING**, Chrome never injected Glint into that tab: the extension
is disabled, site access is restricted, the tab was opened before the extension loaded (press
⌘R / Ctrl+R), or you are in a different browser or profile. Nothing in the extension can work
until that line reads `running`.

| Symptom | Fix |
| --- | --- |
| Nothing appears anywhere, even on a selection | **Is Glint running on that page?** Open DevTools (⌥⌘I) → Console and run `document.documentElement.dataset.glint`. `'ready'` means the content script is alive there. `undefined` means Chrome never injected it: wrong browser or profile, the extension is disabled, site access is restricted to "on click", or the page was loaded before the extension. Reloading an extension does **not** update already-open tabs — press ⌘R. |
| No ✨ button appears | It shows for the **focused** field only, and only once that field has text. Password, number and date fields are intentionally excluded. Some editors draw text on a canvas or in a cross-origin iframe, where no extension can read the content. |
| Field mode flattened my formatting | Replacing a whole rich `contenteditable` writes plain text back. <kbd>⌘/Ctrl</kbd>+<kbd>Z</kbd> restores it; use caret mode on a highlight if you want to keep the surrounding markup. |
| Rewriting a long document | The limit is 6,000 characters per request (a field or a selection). Longer text is refused with a toast instead of being silently truncated. |
| "Glint was updated or reloaded. Refresh this page." | The content script is stale after an extension reload. Refresh the page (F5). |
| `Unauthorized (401)` | Wrong key, or a key for a different provider than the endpoint. |
| `Not found (404)` | Endpoint path or model name is wrong. Check the provider's docs and try the base URL (Glint appends `/v1/chat/completions`). |
| `Could not reach <host>` | Typo in the URL, no internet, or a provider that blocks browser-origin calls. For Ollama, confirm `ollama serve` is running and the model is pulled. |
| `Rate limited (429)` | Wait, or switch to a smaller/cheaper model. |
| Text was replaced but the site reverted it | The site's editor rejected a synthetic edit. Try selecting again; some rich editors (Google Docs) manage their own document model and cannot be edited this way. |
| Button shows *Failed* with a red outline | Hover the toolbar icon — a red `!` badge means Glint needs configuration. Open the popup and check the message. |

The service worker's console lives at `chrome://extensions → Glint → service worker`.
Page-level errors show up in the normal DevTools console.

---

## Development

There is no build step: edit a file, hit reload on `chrome://extensions`, refresh the page.

```bash
# Regenerate icons (needs Pillow)
python3 tools/make_icons.py

# Service-worker logic tests: endpoint resolution, provider adapters, error mapping
node tools/smoke-test.mjs
```

Contributions welcome — keep it small. The whole point of Glint is that it stays readable in one
sitting: no framework, no bundler, no dependency tree.

## License

MIT — see [LICENSE](LICENSE).
