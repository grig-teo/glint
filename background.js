/**
 * Glint — background service worker (Manifest V3)
 * ---------------------------------------------------------------------------
 * The only place in Glint that ever touches the API key.
 *
 * Responsibilities:
 *   1. Own the settings (loaded from chrome.storage.local).
 *   2. Resolve a user-supplied endpoint into a concrete request URL.
 *   3. Adapt the request/response shape for OpenAI-compatible APIs and for
 *      Anthropic's native /v1/messages API.
 *   4. Perform the network call and hand clean text back to the content script.
 *
 * The content script never sees the key, the endpoint, the model or the raw
 * provider response — it only sends text and receives text.
 * ---------------------------------------------------------------------------
 */

'use strict';

/* -------------------------------------------------------------------------- *
 * Constants
 * -------------------------------------------------------------------------- */

const STORAGE_KEY = 'glint:settings';
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_INPUT_CHARS = 6_000;

/** The default paraphrasing prompt, used verbatim as the system message. */
const DEFAULT_SYSTEM_PROMPT =
  'You are a minimalist text improvement tool. Fix any spelling mistakes, grammatical errors, and slightly improve the fluency of the provided text. Do not add conversational filler, do not include introductory remarks, and do not wrap the response in markdown quotes. Return ONLY the polished, rewritten text.';

/**
 * Defaults are the single source of truth: the popup asks for them over
 * messaging instead of keeping a second copy that can drift.
 *
 * NOTE: the API endpoint is api.openai.com (the API host), not openai.com
 * (the marketing site). Any OpenAI-compatible base URL works here.
 */
const DEFAULTS = Object.freeze({
  apiKey: '',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: '0.3',
  maxTokens: '',
  extraBody: '',
  /** 'system' | 'light' | 'dark' — drives the floating widget and the popup. */
  theme: 'system'
});

/* -------------------------------------------------------------------------- *
 * Settings
 * -------------------------------------------------------------------------- */

/** @returns {Promise<typeof DEFAULTS>} stored settings merged over defaults. */
async function getSettings() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return { ...DEFAULTS, ...(stored?.[STORAGE_KEY] ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

/* -------------------------------------------------------------------------- *
 * Endpoint resolution
 * -------------------------------------------------------------------------- */

/**
 * Turn whatever the user typed into a concrete request URL.
 *
 *   https://api.openai.com            -> https://api.openai.com/v1/chat/completions
 *   https://api.openai.com/v1         -> https://api.openai.com/v1/chat/completions
 *   https://api.groq.com/openai/v1    -> https://api.groq.com/openai/v1/chat/completions
 *   http://localhost:11434            -> http://localhost:11434/v1/chat/completions
 *   .../v1/messages                   -> left as-is (Anthropic native API)
 *
 * @param {string} raw
 * @returns {{ url: string, style: 'openai'|'anthropic' }}
 */
function resolveEndpoint(raw) {
  let value = String(raw ?? '').trim();
  if (!value) value = DEFAULTS.endpoint;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new GlintError('The API endpoint is not a valid URL.', 'BAD_ENDPOINT');
  }

  const path = url.pathname.replace(/\/+$/, '');
  const isNativeAnthropic = /\/messages$/.test(path);

  if (!isNativeAnthropic) {
    if (/\/chat\/completions$/.test(path) || /\/completions$/.test(path)) {
      // Already a full chat-completions URL.
    } else if (/\/v1$/.test(path)) {
      url.pathname = `${path}/chat/completions`;
    } else {
      url.pathname = `${path}/v1/chat/completions`;
    }
  }

  // Drop a trailing hash; keep the query string (some gateways use ?key=).
  url.hash = '';
  return { url: url.toString(), style: isNativeAnthropic ? 'anthropic' : 'openai' };
}

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

class GlintError extends Error {
  /**
   * @param {string} message  user-facing message
   * @param {string} code     machine-readable code
   */
  constructor(message, code = 'ERROR') {
    super(message);
    this.name = 'GlintError';
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- *
 * Payload builders
 * -------------------------------------------------------------------------- */

/**
 * @param {object} settings
 * @param {string} text
 * @returns {{ url: string, headers: Record<string,string>, body: string, style: 'openai'|'anthropic' }}
 */
function buildRequest(settings, text) {
  const { url, style } = resolveEndpoint(settings.endpoint);
  const model = String(settings.model ?? '').trim();
  if (!model) throw new GlintError('No model configured. Open Glint settings.', 'NO_MODEL');

  const key = String(settings.apiKey ?? '').trim();
  const system = String(settings.systemPrompt ?? '').trim() || DEFAULT_SYSTEM_PROMPT;
  const temperature = toNumber(settings.temperature, null);
  const maxTokens = toNumber(settings.maxTokens, null);

  if (style === 'anthropic') {
    // Anthropic's native Messages API: x-api-key header, system prompt at the
    // top level, and max_tokens is required.
    return {
      url,
      style,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // Allows the call to originate from a chrome-extension:// origin.
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(
        mergeExtraBody(
          {
            model,
            system,
            max_tokens: maxTokens ?? 1024,
            messages: [{ role: 'user', content: text }]
          },
          settings.extraBody
        )
      )
    };
  }

  // OpenAI-compatible: OpenAI, Azure-style gateways, Groq, OpenRouter, DeepSeek,
  // Ollama, LM Studio, vLLM, Together, Anthropic's OpenAI-compat layer, ...
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text }
    ]
  };
  if (temperature !== null) body.temperature = temperature;
  if (maxTokens !== null) body.max_tokens = maxTokens;

  /** @type {Record<string,string>} */
  const headers = { 'content-type': 'application/json' };
  // Local runtimes (Ollama, LM Studio) accept any token but some proxies choke
  // on an empty Authorization header — only send it when a key exists.
  if (key) headers.authorization = `Bearer ${key}`;

  return { url, style, headers, body: JSON.stringify(mergeExtraBody(body, settings.extraBody)) };
}

/**
 * Escape hatch for provider-specific parameters that Glint does not model,
 * merged shallowly into the request body. Used, for example, to turn off
 * DeepSeek's thinking mode: `{"thinking": {"type": "disabled"}}`.
 *
 * @param {Record<string, unknown>} body
 * @param {string} raw JSON object typed by the user
 * @returns {Record<string, unknown>}
 */
function mergeExtraBody(body, raw) {
  const text = String(raw ?? '').trim();
  if (!text) return body;

  let extra;
  try {
    extra = JSON.parse(text);
  } catch {
    throw new GlintError('"Extra request body" is not valid JSON.', 'BAD_EXTRA_BODY');
  }
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
    throw new GlintError('"Extra request body" must be a JSON object like {"key": "value"}.', 'BAD_EXTRA_BODY');
  }
  return { ...body, ...extra };
}

/* -------------------------------------------------------------------------- *
 * Response parsing
 * -------------------------------------------------------------------------- */

/**
 * Pull the assistant text out of a provider response.
 * @param {'openai'|'anthropic'} style
 * @param {any} data
 * @returns {string}
 */
function extractText(style, data) {
  if (style === 'anthropic') {
    const parts = Array.isArray(data?.content) ? data.content : [];
    return parts
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('')
      .trim();
  }

  const content = data?.choices?.[0]?.message?.content;

  // Most providers return a string; a few return an array of content parts.
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text ?? ''))
      .join('')
      .trim();
  }

  // Legacy /completions shape.
  if (typeof data?.choices?.[0]?.text === 'string') return data.choices[0].text.trim();
  if (typeof data?.response === 'string') return data.response.trim(); // Ollama native
  return '';
}

/**
 * Models sometimes wrap the answer in a fenced block or stray quotes even when
 * told not to. Remove only the obvious wrappers.
 * @param {string} text
 */
function unwrap(text) {
  let out = text.trim();

  // ```\n...\n``` or ```text\n...\n```
  const fence = out.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/);
  if (fence) out = fence[1].trim();

  // A single pair of wrapping quotes around the entire answer.
  const pairs = [
    ['"', '"'],
    ['“', '”'],
    ["'", "'"],
    ['‘', '’']
  ];
  for (const [open, close] of pairs) {
    if (out.length > 1 && out.startsWith(open) && out.endsWith(close)) {
      const inner = out.slice(open.length, out.length - close.length);
      if (!inner.includes(close)) {
        out = inner.trim();
        break;
      }
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- *
 * Network
 * -------------------------------------------------------------------------- */

/**
 * Send `text` to the configured provider and return the rewritten text.
 * @param {string} text
 * @param {object} settings
 * @returns {Promise<string>}
 */
async function requestRewrite(text, settings) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new GlintError('Nothing to rewrite.', 'EMPTY_INPUT');
  if (trimmed.length > MAX_INPUT_CHARS) {
    throw new GlintError(
      `Selection is too long (${trimmed.length.toLocaleString()} characters, max ${MAX_INPUT_CHARS.toLocaleString()}).`,
      'TOO_LONG'
    );
  }

  const { url, headers, body, style } = buildRequest(settings, trimmed);
  const host = safeHost(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
      cache: 'no-store'
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new GlintError('The request timed out. The model may be slow or unreachable.', 'TIMEOUT');
    }
    throw new GlintError(
      `Could not reach ${host}. Check the endpoint URL, your connection, and that the host allows extension requests.`,
      'NETWORK'
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new GlintError(
      await describeHttpError(response, host),
      `HTTP_${response.status}`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new GlintError(`${host} returned a response that was not JSON.`, 'BAD_RESPONSE');
  }

  // Surface provider-side errors that arrive with a 200 status.
  if (data?.error) {
    const message = typeof data.error === 'string' ? data.error : data.error?.message;
    throw new GlintError(message || `${host} reported an error.`, 'PROVIDER_ERROR');
  }

  const output = unwrap(extractText(style, data));
  if (!output) throw new GlintError('The model returned an empty response.', 'EMPTY_RESPONSE');
  return output;
}

/**
 * @param {Response} response
 * @param {string} host
 * @returns {Promise<string>}
 */
async function describeHttpError(response, host) {
  const detail = await readErrorDetail(response);
  const suffix = detail ? ` — ${detail}` : '';

  switch (response.status) {
    case 401:
      return `Unauthorized (401): the API key was rejected by ${host}.${suffix}`;
    case 402:
      return `Payment required (402) at ${host}.${suffix}`;
    case 403:
      return `Forbidden (403): the key lacks access to this model at ${host}.${suffix}`;
    case 404:
      return `Not found (404): check the endpoint path and model name for ${host}.${suffix}`;
    case 413:
      return `The selection is too large for ${host}.${suffix}`;
    case 429:
      return `Rate limited (429) by ${host}. Wait a moment and try again.${suffix}`;
    default:
      if (response.status >= 500) return `${host} is having trouble (${response.status}).${suffix}`;
      return `${host} returned ${response.status}.${suffix}`;
  }
}

/**
 * Best-effort extraction of a human-readable error message from a failed
 * response body. Never throws.
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readErrorDetail(response) {
  try {
    const raw = await response.text();
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      const message =
        parsed?.error?.message ??
        parsed?.error ??
        parsed?.message ??
        parsed?.detail ??
        '';
      const text = typeof message === 'string' ? message : JSON.stringify(message);
      return truncate(text.replace(/\s+/g, ' ').trim(), 220);
    } catch {
      return truncate(raw.replace(/\s+/g, ' ').trim(), 220);
    }
  } catch {
    return '';
  }
}

/* -------------------------------------------------------------------------- *
 * Small helpers
 * -------------------------------------------------------------------------- */

function toNumber(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'the API endpoint';
  }
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/* -------------------------------------------------------------------------- *
 * Message routing
 * -------------------------------------------------------------------------- */

/**
 * Messages accepted from the content script, the popup and (in tests) the
 * service worker console.
 *
 *   GLINT_REWRITE      { text }  -> { ok, text } | { ok: false, error }
 *   GLINT_TEST         { }       -> { ok, text, ms } | { ok: false, error }
 *   GLINT_GET_DEFAULTS { }       -> { ok, defaults }
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  switch (message.type) {
    case 'GLINT_REWRITE':
      handleRewrite(message.text)
        .then((text) => sendResponse({ ok: true, text }))
        .catch((error) => sendResponse(toErrorPayload(error)));
      return true; // keep the message channel open for the async reply

    case 'GLINT_TEST':
      handleTest()
        .then((payload) => sendResponse(payload))
        .catch((error) => sendResponse(toErrorPayload(error)));
      return true;

    case 'GLINT_GET_DEFAULTS':
      sendResponse({ ok: true, defaults: DEFAULTS });
      return false;

    default:
      return false;
  }
});

/**
 * @param {string} text
 * @returns {Promise<string>}
 */
async function handleRewrite(text) {
  const settings = await getSettings();

  if (!String(settings.apiKey ?? '').trim() && !isLocalEndpoint(settings.endpoint)) {
    await setBadge('!');
    throw new GlintError('No API key yet. Click the Glint icon to add one.', 'NO_API_KEY');
  }

  try {
    const output = await requestRewrite(text, settings);
    await setBadge('');
    return output;
  } catch (error) {
    // Nudge the user toward the popup for configuration problems.
    const code = error instanceof GlintError ? error.code : '';
    if (code === 'NO_API_KEY' || code === 'NO_MODEL' || code === 'BAD_ENDPOINT' || code === 'HTTP_401') {
      await setBadge('!');
    }
    throw error;
  }
}

/** Runs a tiny live round-trip so the popup can verify the configuration. */
async function handleTest() {
  const settings = await getSettings();
  const startedAt = Date.now();
  const text = await requestRewrite('this are a test of the glint conection', settings);
  await setBadge('');
  return { ok: true, text, ms: Date.now() - startedAt, model: settings.model };
}

/**
 * @param {unknown} error
 * @returns {{ ok: false, error: string, code: string }}
 */
function toErrorPayload(error) {
  if (error instanceof GlintError) {
    return { ok: false, error: error.message, code: error.code };
  }
  // A fresh install/reload invalidates in-flight promises; treat as generic.
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message || 'Unexpected error.', code: 'UNKNOWN' };
}

function isLocalEndpoint(endpoint) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(String(endpoint ?? ''));
}

/** Badge is used purely as a passive "needs attention" nudge. */
async function setBadge(text) {
  try {
    await chrome.action.setBadgeText({ text });
    if (text) await chrome.action.setBadgeBackgroundColor({ color: '#e5484d' });
  } catch {
    /* action API unavailable — not worth failing a rewrite over */
  }
}

/* -------------------------------------------------------------------------- *
 * Lifecycle
 * -------------------------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(async (details) => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (!stored?.[STORAGE_KEY]) {
    await chrome.storage.local.set({ [STORAGE_KEY]: { ...DEFAULTS } });
  }
  if (details.reason === 'install') {
    // First run: open the settings panel so the key can be added immediately.
    chrome.action.openPopup?.().catch(() => {});
  }
});
