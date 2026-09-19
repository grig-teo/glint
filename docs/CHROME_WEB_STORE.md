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

**Detailed description** (2931 characters)

**Do not list provider names here.** An earlier version of this description opened with a list of AI
providers, and the store rejected it with violation code **Yellow Argon** ("using exaggerated
keywords in the item description"). Naming a string of brands in metadata reads as keyword
stuffing, however factually true it is. Keep the description free of vendor names; the extension's
own settings screen is the right place to show which providers it supports, and a screenshot of
that screen carries the same information without the metadata risk.

The text below is written in a plain human voice on purpose: prose rather than bullet lists, no em
dashes, no all-caps section headers, varied sentence length.

```
Glint rewrites the text you are already typing, in the field you are already in.

There are two ways to use it. Highlight a sentence, and a small "Fix" button appears next to it. Click, and that one sentence comes back with the spelling and grammar corrected and the wording smoothed out. Nothing around it changes.

The other way needs no highlighting at all. Click into any text box you have written in, and a compact icon waits in the corner of the field. One click cleans up everything inside it, whether that is a search box holding five words or a textarea holding five paragraphs.

Either way the new text lands where the old text was. Your cursor stays put, focus stays in the field, and Ctrl+Z undoes it exactly like any other edit. Glint edits the field itself instead of opening a window of its own, so the page keeps control of its own content. That detail is why it works on sites built with modern frameworks, including the inputs that only accept properly dispatched input events.

Glint is not a service. There is no account to create and no subscription to cancel, because there is no server in the middle. You paste an API key from an AI provider you already pay for, and your browser talks to that provider directly. Prefer to keep everything on your own machine? Point Glint at a local model instead.

It keeps very little. Your API key, the API address, the model name and the mode you picked are stored in your own browser profile, and that is the whole list. No analytics, no telemetry, no advertising, and nothing sent to the developer. Your key is read only inside the extension's service worker, so the pages you visit never get a copy of it.

How the rewrite reads is up to you. Fix grammar and fluency is the default. The other modes make text shorter, more professional or friendlier, and you can write your own instruction instead. If you like tuning that sort of thing, the sampling settings and the extra request body field are there too.

The button and the settings panel follow your system's light or dark setting and change the moment you switch. You can pin one or the other if you prefer.

The extension is Manifest V3, written in plain JavaScript with no dependencies and no build step. There is no remote code, so every line that runs is a line you installed, and the source is public.

Setup takes about a minute. Install it, click the toolbar icon, paste an API key, then press Save and Test. Test makes one real request, so you know the setup works before you rely on it. After that, go to any site you write on, select some text, and click Fix.

To be explicit about the limits: it does not read pages in the background, it does not count anything, and it does not upload a single character until you click the button. Whatever you asked it to fix goes to the address you configured, and nothing else leaves your machine.

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

**Single purpose description** (required, max 1,000 characters)

The reviewer's question is narrowness: is this one purpose, and do the permissions follow from it?
This answers both. 987 characters.

```
Glint has a single, narrow purpose: to rewrite the text a user is composing in a text field on a web page, using an AI model the user configures and pays for.

How it is used. The user highlights text, or clicks into a field, then clicks the Glint button beside it. Glint sends only that text to the API endpoint the user entered in its settings, and writes the model's reply back into the same field. Nothing is sent unless the user clicks the button.

Why the permissions are needed. The host permission is required because the content script must reach whichever page the user is writing on, and because the request goes to whichever API endpoint the user configured; a bring-your-own-key tool cannot ship a fixed list of endpoints. Storage keeps the user's own API key, endpoint, model and prompt on their device.

Glint has no other feature. It does not read pages in the background, does not collect analytics, does not send anything to the developer, and has no server of its own.
```

**Permission justifications** (required — one field per permission, max 1,000 characters each)

The dashboard warns that requesting host-list permissions *"may require detailed review, which will
delay publishing"*. That is expected for a bring-your-own-key tool and is not a rejection: the
reviewer is checking that the broad host access follows from the single purpose. Both answers below
are written to make that link explicit.

`storage` — 708 characters:

```
Glint uses storage to save the user's own configuration locally in their browser profile, so it persists between sessions: their API key, the API endpoint URL, the model name, the system prompt (the rewrite mode), and the light/dark theme preference. Nothing else is stored.

The extension deliberately uses storage.local rather than storage.sync so that the API key is never uploaded to a Google account; it stays on the user's own device. These values are read by the service worker when the user clicks the rewrite button, and the user can change or clear all of them at any time in the extension's settings page.

No page content, browsing history, analytics or personal data are ever written to storage.
```

Host permission `<all_urls>` — 965 characters:

```
Glint rewrites text the user is composing in a text field. Host access is needed for exactly two reasons.

1) Detection on the page. The content script must recognise text fields and show the rewrite button on whichever page the user is writing on. Glint works wherever a user writes - webmail, social media, a CMS, a web form - so the host list cannot be enumerated in advance. The script reads only the field the user has focused.

2) Reaching the configured API. Glint is a bring-your-own-key tool: requests go to the AI provider the user enters in its settings, which may be OpenAI, DeepSeek, Groq, Anthropic, a self-hosted gateway, or a model on the user's own machine. A fixed allow-list of hostnames is therefore impossible.

Glint declares <all_urls> for exactly these two reasons and cannot narrow it further.

No request is made until the user clicks the button; page content is never read in the background; nothing is collected or sent to the developer.
```

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
