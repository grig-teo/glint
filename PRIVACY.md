# Glint — Privacy Policy

**Last updated: 15 September 2026**

Glint is a browser extension that rewrites text you select, using an AI provider
**you** choose and pay for. This policy describes exactly what happens to your
data. It is short because Glint does very little.

## The short version

Glint has **no servers, no accounts, no analytics and no telemetry**. Nothing is
sent to the developer of Glint — not your text, not your API key, not your
browsing history, not even anonymised usage statistics. There is no server that
could receive them.

## What Glint stores, and where

Glint saves your settings in `chrome.storage.local`, which is storage inside your
own browser profile on your own device:

- your API key
- the API endpoint and model name you configured
- your system prompt (the "Mode") and optional request parameters
- your theme preference

Glint deliberately uses `storage.local` rather than `storage.sync`, so these
values are **never uploaded to a Google account** and never leave your device
except as described below.

This data is not encrypted at rest; it is protected by your operating system
user account, in the same way as your browser's saved passwords and cookies.
Removing the extension deletes it. You can also clear it at any time by
overwriting the fields in Glint's settings.

## What leaves your device, and to whom

When you click **✨ Fix**, Glint sends exactly two things to the API endpoint you
configured:

1. the **text you selected** (or the contents of the field you asked it to fix)
2. your **system prompt** ("Mode"), as part of the same request

It also sends your **API key** in the request header, because that is how the
provider authenticates you. That is the entire payload.

The destination is the endpoint **you** entered in Glint's settings — for
example `api.openai.com`, `api.deepseek.com`, `api.groq.com`, `openrouter.ai`,
`api.anthropic.com`, or an address on your own machine such as a local Ollama
server. Glint's developer never sees this traffic and cannot redirect it.

Once your text reaches that provider, **their** privacy policy and terms govern
it. If you are fixing sensitive text, choose a provider (or a local model) whose
handling of data you are comfortable with.

## Your data: access and deletion

Everything Glint stores lives in your own browser profile, so you are always the
one holding it:

- **See it** — open Glint's settings; every value it holds is displayed there in
  plain text (the API key field has a *Show* button).
- **Change or clear it** — edit or empty any field in Glint's settings and save.
  Clearing the API key field and saving removes the key.
- **Delete everything** — uninstalling Glint from `chrome://extensions` deletes
  all of its stored settings, including the API key. Glint has no server and no
  backup, so nothing is retained anywhere after that.
- **Text you asked Glint to rewrite** — that text went to the provider you chose,
  and only they hold it. Glint keeps no copy, no log and no history of it. To have
  it deleted, contact that provider under their policy.

There is no account to close and no data request to file, because the developer
never receives any of it. Questions are still welcome via the issue tracker
listed at the end of this document.

## Data retention

Glint retains your settings until you delete them as described above. It retains
nothing else, because it collects nothing else.

## What Glint does not do

- No analytics, crash reporting, or usage tracking of any kind.
- No advertising, and no selling or sharing of data with anyone.
- No reading of pages beyond what is needed to find the field you are typing in.
- No background uploading: a request is made only when you click the button.
- No remote code: every line of Glint's JavaScript ships inside the extension
  package. Nothing is fetched from a CDN or evaluated at runtime.
- No access to your browsing history, bookmarks, downloads, tabs' contents or
  any site you have not actively typed into.

## Permissions, and why each one exists

| Permission | Why |
| --- | --- |
| `storage` | To save your API key, endpoint, model, prompt and theme on your device. |
| `<all_urls>` host access | Two reasons. (1) Glint's content script must be able to detect a text field and draw its button on whatever page you are writing on. (2) The service worker must be able to POST to whichever API endpoint you configure — with a bring-your-own-key extension, that address cannot be known in advance. |

Glint does not read page content until you explicitly click its button.

## Children's privacy

Glint is a general-purpose writing tool and is not directed at children. It
collects no personal information of its own.

## Changes

Any change to this policy will be published in this file in the Glint
repository, with the date above updated.

## Contact

Questions or concerns: open an issue at
<https://github.com/grig-teo/glint/issues>.
