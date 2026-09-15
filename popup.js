/**
 * Glint — popup / settings
 * ---------------------------------------------------------------------------
 * Reads and writes chrome.storage.local. The API key never leaves this page
 * except into extension storage; the network call itself happens in the
 * service worker.
 * ---------------------------------------------------------------------------
 */

'use strict';

const STORAGE_KEY = 'glint:settings';

/** Endpoint + model pairs for the one-click provider chips. */
const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    extraBody: ''
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    // The exact URL from DeepSeek's quick-start docs. Thinking mode is ON by
    // default (high effort) and it ignores temperature, so it is turned off
    // here: for fixing grammar it is pure latency and extra billed tokens.
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-flash',
    extraBody: '{\n  "thinking": { "type": "disabled" }\n}'
  },
  {
    id: 'groq',
    label: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    extraBody: ''
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    extraBody: ''
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    // Native Messages API — Glint switches headers and payload shape for it.
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-5',
    extraBody: ''
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    endpoint: 'http://localhost:11434/v1',
    model: 'llama3.2',
    extraBody: ''
  }
];

/** Appearance of the floating widget and this popup. "System" tracks the OS. */
const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' }
];

const DARK_QUERY = window.matchMedia('(prefers-color-scheme: dark)');

/** Ready-made system prompts. The first one is replaced by the built-in default. */
const EXTRA_MODES = [  {
    id: 'fluency',
    label: 'Improve fluency',
    prompt:
      'You are a minimalist text improvement tool. Rewrite the provided text so it reads smoothly and naturally while keeping its original meaning, tone and approximate length. Do not add conversational filler, do not include introductory remarks, and do not wrap the response in markdown quotes. Return ONLY the rewritten text.'
  },
  {
    id: 'concise',
    label: 'Shorten',
    prompt:
      'You are a minimalist text improvement tool. Rewrite the provided text to be as concise as possible without losing meaning or important detail. Do not add conversational filler, do not include introductory remarks, and do not wrap the response in markdown quotes. Return ONLY the rewritten text.'
  },
  {
    id: 'professional',
    label: 'Professional',
    prompt:
      'You are a minimalist text improvement tool. Rewrite the provided text in a clear, confident, professional tone suitable for business communication, fixing all spelling and grammar mistakes. Do not add conversational filler, do not include introductory remarks, and do not wrap the response in markdown quotes. Return ONLY the rewritten text.'
  },
  {
    id: 'friendly',
    label: 'Friendly',
    prompt:
      'You are a minimalist text improvement tool. Rewrite the provided text in a warm, friendly, conversational tone while fixing all spelling and grammar mistakes. Do not add conversational filler, do not include introductory remarks, and do not wrap the response in markdown quotes. Return ONLY the rewritten text.'
  }
];

const el = {
  apiKey: document.getElementById('apiKey'),
  endpoint: document.getElementById('endpoint'),
  model: document.getElementById('model'),
  systemPrompt: document.getElementById('systemPrompt'),
  temperature: document.getElementById('temperature'),
  maxTokens: document.getElementById('maxTokens'),
  extraBody: document.getElementById('extraBody'),
  providers: document.getElementById('providers'),
  themes: document.getElementById('themes'),
  modes: document.getElementById('modes'),
  toggleKey: document.getElementById('toggleKey'),
  save: document.getElementById('save'),
  test: document.getElementById('test'),
  reset: document.getElementById('reset'),
  check: document.getElementById('check'),
  diagnostics: document.getElementById('diagnostics'),
  status: document.getElementById('status'),
  pill: document.getElementById('pill')
};

let DEFAULT_PROMPT = '';
let statusTimer = null;
let themePreference = 'system';

/* -------------------------------------------------------------------------- *
 * Theme
 * -------------------------------------------------------------------------- */

/** Resolve "system" against the OS preference and paint this document. */
function applyThemePreference(value) {
  themePreference = value === 'light' || value === 'dark' ? value : 'system';
  const resolved = themePreference === 'system' ? (DARK_QUERY.matches ? 'dark' : 'light') : themePreference;
  document.documentElement.dataset.theme = resolved;
  syncThemeChips();
}

/* -------------------------------------------------------------------------- *
 * Boot
 * -------------------------------------------------------------------------- */

(async function init() {
  renderProviders();
  renderThemes();

  const defaults = await getDefaults();
  if (defaults) {
    DEFAULT_PROMPT = defaults.systemPrompt;
    renderModes(defaults.systemPrompt);
  } else {
    el.reset.disabled = true;
  }

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const settings = { ...(defaults || {}), ...(stored?.[STORAGE_KEY] || {}) };
  fillForm(settings);

  bindEvents(defaults);
  refreshPill();
})();

/* -------------------------------------------------------------------------- *
 * Data
 * -------------------------------------------------------------------------- */

/** The service worker owns the defaults so there is exactly one copy of them. */
async function getDefaults() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GLINT_GET_DEFAULTS' });
    return response?.ok ? response.defaults : null;
  } catch {
    return null;
  }
}

function readForm() {
  return {
    apiKey: el.apiKey.value.trim(),
    endpoint: el.endpoint.value.trim(),
    model: el.model.value.trim(),
    systemPrompt: el.systemPrompt.value.trim(),
    temperature: el.temperature.value.trim(),
    maxTokens: el.maxTokens.value.trim(),
    extraBody: el.extraBody.value.trim(),
    theme: themePreference
  };
}

function fillForm(settings) {
  el.apiKey.value = settings.apiKey || '';
  el.endpoint.value = settings.endpoint || '';
  el.model.value = settings.model || '';
  el.systemPrompt.value = settings.systemPrompt || '';
  el.temperature.value = settings.temperature ?? '';
  el.maxTokens.value = settings.maxTokens ?? '';
  el.extraBody.value = settings.extraBody ?? '';
  applyThemePreference(settings.theme);
  syncModeChips();
}

/** @returns {string|null} an error message, or null when the form is valid. */
function validate(settings) {
  if (!settings.endpoint) return 'Add an API endpoint (for example https://api.openai.com/v1).';
  const candidate = /^https?:\/\//i.test(settings.endpoint) ? settings.endpoint : `https://${settings.endpoint}`;
  try {
    new URL(candidate);
  } catch {
    return 'That endpoint is not a valid URL.';
  }
  if (!settings.model) return 'Add a model name (for example gpt-4o-mini).';
  if (!settings.systemPrompt) return 'Add a system prompt, or pick a mode preset.';
  if (settings.extraBody) {
    try {
      const parsed = JSON.parse(settings.extraBody);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return '"Extra request body" must be a JSON object.';
      }
    } catch {
      return '"Extra request body" is not valid JSON.';
    }
  }
  return null;
}

async function persist(settings) {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  // A saved configuration means the "needs attention" badge can go away.
  chrome.action.setBadgeText({ text: '' }).catch(() => {});
}

/* -------------------------------------------------------------------------- *
 * Rendering
 * -------------------------------------------------------------------------- */

function renderProviders() {
  for (const provider of PROVIDERS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = provider.label;
    chip.dataset.provider = provider.id;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      el.endpoint.value = provider.endpoint;
      el.model.value = provider.model;
      el.extraBody.value = provider.extraBody ?? '';
      syncProviderChips();
      refreshPill();
      setStatus(`${provider.label} preset applied — paste your API key, then Save.`, 'info');
    });
    el.providers.appendChild(chip);
  }
}

function renderModes(defaultPrompt) {
  const modes = [{ id: 'default', label: 'Grammar & fluency', prompt: defaultPrompt }, ...EXTRA_MODES];
  for (const mode of modes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = mode.label;
    chip.dataset.prompt = mode.prompt;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      el.systemPrompt.value = mode.prompt;
      syncModeChips();
    });
    el.modes.appendChild(chip);
  }
}

/** Compare endpoints loosely: case, trailing slashes and a trailing /v1 differ. */
function normalizeEndpoint(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '');
}

function renderThemes() {
  for (const theme of THEMES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = theme.label;
    chip.dataset.theme = theme.id;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => applyThemePreference(theme.id));
    el.themes.appendChild(chip);
  }
}

function syncThemeChips() {
  for (const chip of el.themes.children) {
    chip.setAttribute('aria-pressed', String(chip.dataset.theme === themePreference));
  }
}

function syncProviderChips() {
  const current = normalizeEndpoint(el.endpoint.value);
  for (const chip of el.providers.children) {
    const provider = PROVIDERS.find((p) => p.id === chip.dataset.provider);
    const active = Boolean(provider) && current !== '' && normalizeEndpoint(provider.endpoint) === current;
    chip.setAttribute('aria-pressed', String(active));
  }
}

function syncModeChips() {
  const current = el.systemPrompt.value.trim();
  for (const chip of el.modes.children) {
    chip.setAttribute('aria-pressed', String(chip.dataset.prompt.trim() === current));
  }
}

function refreshPill() {
  const hasKey = Boolean(el.apiKey.value.trim());
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(el.endpoint.value.trim());
  const ready = hasKey || isLocal;
  el.pill.dataset.state = ready ? 'ready' : 'needs-key';
  el.pill.textContent = ready ? 'Ready' : 'Needs key';
}

function setStatus(message, kind = 'info') {
  clearTimeout(statusTimer);
  el.status.textContent = message || '';
  el.status.dataset.kind = kind;
  if (message && kind !== 'error') {
    statusTimer = setTimeout(() => {
      el.status.textContent = '';
    }, 5000);
  }
}

/* -------------------------------------------------------------------------- *
 * Actions
 * -------------------------------------------------------------------------- */

async function save({ silent = false } = {}) {
  const settings = readForm();
  const problem = validate(settings);
  if (problem) {
    setStatus(problem, 'error');
    return null;
  }

  await persist(settings);
  refreshPill();
  if (!silent) setStatus('Saved.', 'ok');
  return settings;
}

async function test() {
  const settings = await save({ silent: true });
  if (!settings) return;

  setStatus('Testing…', 'info');
  el.test.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GLINT_TEST' });
    if (response?.ok) {
      const preview = response.text.length > 70 ? `${response.text.slice(0, 70)}…` : response.text;
      setStatus(`Connected · ${response.ms} ms · “${preview}”`, 'ok');
    } else {
      setStatus(response?.error || 'The test call failed.', 'error');
    }
  } catch {
    setStatus('The Glint service worker is not responding. Reload the extension.', 'error');
  } finally {
    el.test.disabled = false;
    refreshPill();
  }
}

/* -------------------------------------------------------------------------- *
 * Diagnostics
 *
 * Two very different failures look identical to a user ("nothing happens"):
 * the content script never ran on the page, or it ran and found no field.
 * This tells them apart in one click.
 * -------------------------------------------------------------------------- */

async function checkPage() {
  el.diagnostics.textContent = 'Checking…';
  el.check.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      el.diagnostics.textContent = 'No active tab.';
      return;
    }

    let probe;
    try {
      probe = await chrome.tabs.sendMessage(tab.id, { type: 'GLINT_PROBE' }, { frameId: 0 });
    } catch {
      el.diagnostics.textContent = [
        'Content script:  NOT RUNNING on this page',
        '',
        'Glint is installed but Chrome is not injecting it into this tab.',
        'Check, in order:',
        '  1. Is this the same browser and profile where you loaded Glint?',
        '  2. chrome://extensions → Glint → Details → Site access = "On all sites"',
        '  3. Reload the extension, then press ⌘R / Ctrl+R on this page.'
      ].join('\n');
      return;
    }

    if (!probe?.ok) {
      el.diagnostics.textContent = 'Unexpected reply from the page.';
      return;
    }

    const lines = [
      `Content script:  running (${probe.frame})`,
      `Focused element: ${probe.activeElement}`,
      `  editable:      ${probe.focusedIsEditable ? 'yes' : 'no'}`
    ];

    if (probe.target) {
      lines.push(
        `Target:          ${probe.target.mode} mode, ${probe.target.kind}, ${probe.target.chars} chars`,
        probe.target.mode === 'field'
          ? '  → the ✨ icon should sit in the top-right corner of that field'
          : '  → the labelled button should sit next to the highlight'
      );
    } else if (probe.focusedIsEditable) {
      lines.push('Target:          none — the focused field is empty');
    } else {
      lines.push(
        'Target:          none',
        '  → focus a text field (or highlight text) and check again',
        '  → password, number, date, readonly and disabled fields are ignored'
      );
    }

    lines.push(`Widget:          ${probe.widget}`);
    el.diagnostics.textContent = lines.join('\n');
  } finally {
    el.check.disabled = false;
  }
}

/* -------------------------------------------------------------------------- *
 * Events
 * -------------------------------------------------------------------------- */

function bindEvents(defaults) {
  el.save.addEventListener('click', () => save());
  el.test.addEventListener('click', test);
  el.check.addEventListener('click', checkPage);

  el.toggleKey.addEventListener('click', () => {
    const hidden = el.apiKey.type === 'password';
    el.apiKey.type = hidden ? 'text' : 'password';
    el.toggleKey.textContent = hidden ? 'Hide' : 'Show';
  });

  el.reset.addEventListener('click', () => {
    if (!defaults) return;
    fillForm(defaults);
    syncProviderChips();
    refreshPill();
    setStatus('Defaults restored — click Save to apply.', 'info');
  });

  for (const input of [el.apiKey, el.endpoint, el.model, el.temperature, el.maxTokens]) {
    input.addEventListener('input', () => {
      if (input === el.endpoint) syncProviderChips();
      refreshPill();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        save();
      }
    });
  }

  el.systemPrompt.addEventListener('input', syncModeChips);

  // Follow the OS live while the preference is "system".
  DARK_QUERY.addEventListener('change', () => {
    if (themePreference === 'system') applyThemePreference('system');
  });

  syncProviderChips();
  syncThemeChips();
}
