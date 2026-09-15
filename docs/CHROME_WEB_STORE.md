# Publishing Glint to the Chrome Web Store

Everything the store asks for, prepared. The account steps (registration, fee,
upload, submit) are yours; this file is the copy-and-paste layer plus a
checklist so nothing gets missed.

> A Chrome Web Store listing also distributes to **Microsoft Edge** (Edge accepts
> Chrome packages) and to **Brave** (which installs from the Chrome Web Store).

---

## 0. Before you start

- [ ] Chrome Web Store developer account, **one-time US$5** registration fee:
      <https://chrome.google.com/webstore/devconsole>
- [ ] 2-step verification enabled on that Google account (required since 2024)
- [ ] An email address you are happy to publish as the developer contact
- [ ] A public **privacy policy URL** — see below

**Privacy policy URL.** The store requires this because Glint requests host
access and stores an API key. Use the rendered file in the repository:

```
https://github.com/grig-teo/glint/blob/main/PRIVACY.md
```

(If you want a cleaner URL later, enable GitHub Pages on the repo and point it at
`/docs`.)

---

## 1. Build the upload package

```bash
./tools/package.sh
```

This produces:

| File | Use |
| --- | --- |
| `dist/glint-1.0.0-store.zip` | **Upload this one.** `manifest.json` sits at the archive root, which the store requires. |
| `dist/glint-1.0.0.zip` | For "Load unpacked" and GitHub Releases: wraps everything in a `glint-1.0.0/` folder and includes README + LICENSE. |

Uploading the wrong one is the single most common rejection reason — a nested
top-level folder makes the store report *"Manifest file is missing or
unreadable."*

---

## 2. Store listing

**Name** (max 75 characters)

```
Glint — AI writing assistant, bring your own key
```

**Short description** (max 132 characters — this is the one shown in search)

```
Select text or just type: a ✨ appears, one click rewrites it in place. Bring your own API key. No account, no telemetry.
```

**Category:** Productivity → Tools
**Language:** English

**Detailed description**

```
Glint is a minimalist AI writing assistant. No sidebar, no dashboard, no
account, no subscription — and no middleman server holding your text.

TWO WAYS TO FIX YOUR WRITING

• Highlight text and a small "✨ Fix" button appears next to your selection.
  Click it and just that text is rewritten.

• Or don't select anything. Type in any field and a compact ✨ icon waits in the
  field's top-right corner. Click it to fix everything in that field at once.

The rewrite lands straight in the field you were already typing in. Your focus
stays put, your cursor stays put, and Ctrl/Cmd+Z undoes it like any other edit.
Text boxes in modern web apps (React, Vue, Svelte) stay in sync.

BRING YOUR OWN KEY

Glint has no back end. It talks directly from your browser to the AI provider
you choose, using your own API key:

• OpenAI, Groq, OpenRouter, DeepSeek, Together — anything OpenAI-compatible
• Anthropic, including its native Messages API
• A local model via Ollama or LM Studio, with no key at all

One-click presets fill in the endpoint and model for each; every field stays
editable if you use a gateway or a self-hosted model.

MODES

Fix grammar and fluency by default, or switch to Improve fluency, Shorten,
Professional or Friendly — or write your own system prompt. Temperature and
max tokens are there if you want them, and an "extra request body" field passes
through provider-specific options (for example turning off DeepSeek's thinking
mode so fixes stay fast).

DARK AND LIGHT

The widget and settings panel follow your system theme, and repaint instantly
when you switch. Force Light or Dark when a particular site disagrees.

PRIVACY BY CONSTRUCTION

• No account, no sign-in, no telemetry, no analytics, no advertising
• Your API key is used only inside the extension's service worker, so web pages
  never get a reference to it
• Settings live in chrome.storage.local on your machine — not synced to Google
• Nothing is sent to the developer. There is no server to send it to.
• Not one line of remote code: everything ships in the package

Built with Manifest V3, plain JavaScript, no dependencies and no build step. The
full source is at https://github.com/grig-teo/glint
```

**Screenshots** — at least one is required (1280×800 or 640×400, PNG or JPEG, up
to 5). Ready-made ones are in [`screenshots/`](screenshots/):

| File | Shows |
| --- | --- |
| `01-selection.png` | The ✨ Fix button next to a highlighted sentence |
| `02-field-icon.png` | The corner icon in a field, no selection needed |
| `03-result.png` | The same text after one click |
| `04-settings.png` | The settings panel with provider presets |

**Store icon:** `icons/icon128.png` (already in the package).

---

## 3. Privacy practices tab

The store asks you to declare data usage. Answer as follows — this is accurate
for Glint and errs on the side of disclosure, which is what reviewers want.

| Question | Answer |
| --- | --- |
| Does your extension collect or use user data? | **Yes** — declare the two categories below |
| **Authentication information** | **Collected.** Your API key, stored locally and transmitted only to the API endpoint you configured, for the sole purpose of authenticating your own requests. |
| **Website content** | **Collected.** The text you explicitly ask Glint to rewrite, transmitted only to the API endpoint you configured, for the sole purpose of rewriting it. |
| Personally identifiable information | No |
| Health, financial, personal communications | No |
| Location, web history, user activity | No |
| Sold to third parties | **No** |
| Used or transferred for purposes unrelated to the single purpose | **No** |
| Used or transferred to determine creditworthiness or for lending | **No** |
| Certified: data handling complies with the Developer Program Policies | Yes |

**Single purpose description** (required, one or two sentences)

```
Glint rewrites text the user selects or is editing in a web page field, by
sending that text to an AI API endpoint the user configures with their own key,
and pasting the result back into the same field.
```

**Permission justifications** (required for each permission in the manifest)

| Permission | Justification to paste |
| --- | --- |
| `storage` | Stores the user's own settings — API key, API endpoint, model name, system prompt and theme — locally in their browser profile so they persist between sessions. |
| Host permission `<all_urls>` | Two functions require it. (1) The content script must detect text fields and render the "Fix" button on whatever site the user is writing on; the extension cannot know in advance which sites those are. (2) The service worker must be able to POST the selected text to whichever AI API endpoint the user configures — a bring-your-own-key extension cannot ship a fixed allow-list of endpoints. The extension reads page content only for the field the user is actively editing, and only sends text when the user clicks the button. |

**Remote code:** answer **"No, I am not using remote code."** Glint ships no
bundler output fetched at runtime, no CDN scripts, and no `eval`. Everything is
plain JavaScript inside the package.

---

## 4. Submit

1. Dev console → **New item** → upload `dist/glint-1.0.0-store.zip`
2. Fill the **Store listing** tab from section 2, upload the screenshots
3. Fill the **Privacy practices** tab from section 3, add the privacy policy URL
4. Set **Distribution**: all regions, and *not* "only trusted testers" (that is
   for private testing)
5. **Submit for review**

Review typically takes anywhere from a day to a couple of weeks. If it is
rejected, the reason is almost always one of:

- a missing or unreachable privacy policy URL
- an unjustified permission (all of ours are justified above)
- the privacy practices tab disagreeing with the actual behaviour
- uploading a zip with a nested top-level folder

---

## Preparing an update later

1. Bump `version` in `manifest.json` (the store rejects re-uploading the same
   version, and the version must always increase)
2. `./tools/package.sh`
3. Upload the new `-store.zip` and submit

## Also worth doing

- Tag the release: `git tag v1.0.0 && git push --tags`
- Attach `dist/glint-1.0.0.zip` to a GitHub Release so people can install
  without the store:
  `gh release create v1.0.0 dist/glint-1.0.0.zip --notes-file NOTES.md`
