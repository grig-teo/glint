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
Glint is a minimalist AI writing assistant for Chrome. It fixes the text you are
already writing — in the field you are already typing in.

WHAT IT DOES

• Highlight a sentence and a small "✨ Fix" button appears beside it. One click
  rewrites that text where it stands: spelling and grammar corrected, wording
  made more fluent, meaning untouched.

• Or select nothing at all. Type into any text field and a compact ✨ icon waits
  in the field's top-right corner. Click it and everything in that field is
  polished in a single pass — a one-line search box or a full paragraph.

• The result lands exactly where you were typing. Focus stays in the field, the
  caret stays where it was, and Ctrl/Cmd+Z undoes the change like any other edit,
  because Glint edits the field itself instead of opening a window of its own.

• It works in search boxes, comment boxes, contact forms, textareas and
  rich-text editors, including the React and Vue apps whose inputs only accept
  properly dispatched input events.

WHY INSTALL IT

1. It stays out of your way. No sidebar, no dashboard, no panel covering the
   page. A small button appears where you are writing and vanishes when you stop.

2. There is no account and no subscription. You do not sign up for anything, and
   there is no Glint server in the middle: your browser talks straight to the AI
   provider you chose.

3. Bring your own key. Glint works with OpenAI, DeepSeek, Groq, OpenRouter,
   Anthropic, or a model running locally through Ollama or LM Studio. If you
   already pay for API access, you simply use it — no second bill, no per-seat
   pricing, no free-tier limits imposed by a middleman.

4. Your writing is not our business. There is no analytics, no telemetry, and
   nothing is ever sent to the developer. Your API key is read only inside the
   extension's service worker, so websites never get a reference to it. Glint
   requests the smallest permission set it can work with.

5. It adapts to how you write. Choose a mode — Fix grammar and fluency (default),
   Shorten, Professional or Friendly — or write your own system prompt.
   Temperature, max tokens and an extra request body are available when you need
   to tune a specific provider.

6. It looks right in any theme. Light and dark palettes follow your system
   setting and repaint the moment you switch, for both the floating button and
   the settings panel. You can also force Light or Dark for a particular site.

7. It is small and auditable. Manifest V3, plain JavaScript, no dependencies, no
   build step and no remote code — every line that runs is in the package you
   installed, and the full source is public.

GETTING STARTED

1. Install Glint and click its toolbar icon.
2. Paste an API key from your provider (the preset chips fill in the endpoint and
   model for OpenAI, DeepSeek, Groq, OpenRouter, Anthropic or a local Ollama).
3. Press Save, then Test, which performs one real request so you know it works.
4. Go to any site you write on, select some text, and click ✨ Fix.

WHAT GLINT DOES NOT DO

It does not read pages in the background, does not collect statistics, does not
show advertising, does not sell data, and does not upload anything until you
click the button. It sends the text you asked it to fix to the API endpoint you
configured — nothing else, and nowhere else.

Source code and issue tracker: https://github.com/grig-teo/glint
```

**Screenshots** — required, up to 5. The store accepts **1280x800 or 640x400**, **JPEG or 24-bit
PNG with no alpha channel**. Ready-made ones are in [`screenshots/`](screenshots/), and all four
are already 1280x800 truecolour PNGs (colour type 2, no `tRNS` chunk), so they upload as-is:

| File | Shows |
| --- | --- |
| `01-selection.png` | The ✨ Fix button next to a highlighted sentence |
| `02-field-icon.png` | The corner icon in a field, no selection needed |
| `03-result.png` | The same text after one click |
| `04-settings.png` | The settings panel with provider presets |
| `05-providers.png` | DeepSeek configured, with the provider presets called out |

That is the maximum of 5. A raw capture (portrait, usually RGBA) cannot be uploaded as-is, so
`tools/make-store-panel.py` composites one into a compliant landscape panel and refuses to write a
file that breaks the format rules:

```bash
python3 tools/make-store-panel.py --input ~/Desktop/popup.png \
  --output docs/screenshots/05-providers.png --theme dark \
  --title "Any provider, your key" --lead "Presets fill in the endpoint and model for you." \
  --accent "OpenAI · DeepSeek · Groq · OpenRouter" \
  --body "Test the connection in one click"
```

**Promotional images**

The **small promotional tile (440x280) is mandatory**, and listings without one are displayed
*after* those that have one. The optional 1400x560 marquee is what makes an extension eligible for
featuring on the store front page.

Google's guidance for these is specific: saturated colours, fill the entire region, assume a light
grey background, avoid text, and make sure it still works at half size. `tools/make-promo.py`
follows it — a full-bleed brand gradient carrying only the sparkle mark and the wordmark, which
stays readable when the store halves it:

```bash
python3 tools/make-promo.py                   # docs/promo/promo-440x280.png  (required)
python3 tools/make-promo.py --size 1400x560   # docs/promo/promo-1400x560.png (marquee)
```

Both are written as 24-bit PNGs with no alpha, and the script verifies the header before finishing.

The two sizes use different layouts on purpose, because the store shows them differently. The
marquee is **not localizable** and appears in the carousel with the item name and description drawn
over it, so `--align auto` puts the lockup on the **right** and keeps the left side calm: a
darkening scrim plus a faint watermark sparkle, which leaves contrast for whatever text the store
puts there. The 440x280 tile sits alone in a grid, so it stays centred.

**Store icon**

The store takes the icon from the **package**, not from a separate upload field, so
`icons/icon128.png` is what gets shown. It is built to Google's guidance: a 128x128 PNG whose
artwork is 96x96 with 16px of transparent padding, so it carries the same visual weight as the
icons around it. Regenerate with `python3 tools/make_icons.py` (use `--full-bleed` only if you
deliberately want square tiles).

Note that the 16/32/48px icons stay full bleed: those are the toolbar sizes, where padding would
make the mark too small to read.

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
