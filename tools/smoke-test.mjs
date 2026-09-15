#!/usr/bin/env node
/**
 * Glint — service worker smoke test.
 *
 * background.js is a classic (non-module) script, so it is evaluated inside a
 * `vm` context with stubbed `chrome`, `fetch` and timers. No dependencies.
 *
 *   node tools/smoke-test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const exporter =
  '\nglobalThis.__glint = { DEFAULTS, DEFAULT_SYSTEM_PROMPT, STORAGE_KEY, resolveEndpoint, buildRequest, extractText, unwrap, requestRewrite };';

/* ------------------------------------------------------------------ stubs -- */

let storedSettings = {};
let lastRequest = null;
let respond = () =>
  jsonResponse(200, { choices: [{ message: { content: 'Rewritten.' } }] });

const chrome = {
  runtime: {
    onMessage: { addListener() {} },
    onInstalled: { addListener() {} }
  },
  storage: {
    local: {
      async get(key) {
        return key ? { [key]: storedSettings } : { ...storedSettings };
      },
      async set() {}
    }
  },
  action: {
    async setBadgeText() {},
    async setBadgeBackgroundColor() {},
    async openPopup() {}
  }
};

async function fakeFetch(url, options) {
  lastRequest = { url: String(url), options };
  return respond(String(url), options);
}

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
    async text() {
      return JSON.stringify(data);
    }
  };
}

function textResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      throw new Error('not json');
    },
    async text() {
      return body;
    }
  };
}

const context = vm.createContext({
  chrome,
  fetch: fakeFetch,
  setTimeout,
  clearTimeout,
  console,
  URL,
  AbortController
});

vm.runInContext(source + exporter, context, { filename: 'background.js' });
const glint = context.__glint;

/* ------------------------------------------------------------------ runner -- */

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  \u2717 ${name}\n      ${error.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  \u2717 ${name}\n      ${error.message}`);
  }
}

const openai = {
  apiKey: 'sk-test',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  systemPrompt: glint.DEFAULT_SYSTEM_PROMPT,
  temperature: '0.3',
  maxTokens: ''
};

/* --------------------------------------------------------------- the tests -- */

console.log('\nGlint \u2014 service worker smoke test\n');

console.log('defaults');
test('default system prompt matches the specified text exactly', () => {
  assert.equal(
    glint.DEFAULT_SYSTEM_PROMPT,
    'You are a minimalist text improvement tool. Fix any spelling mistakes, grammatical errors, and slightly improve the fluency of the provided text. Do not add conversational filler, do not include introductory remarks, and do not wrap the response in markdown quotes. Return ONLY the polished, rewritten text.'
  );
});
test('default endpoint is the API host, not the marketing site', () => {
  assert.equal(glint.DEFAULTS.endpoint, 'https://api.openai.com/v1/chat/completions');
});
test('theme defaults to following the system', () => {
  assert.equal(glint.DEFAULTS.theme, 'system');
});

console.log('\nendpoint resolution');
for (const [input, expectedUrl, expectedStyle] of [
  ['https://api.openai.com', 'https://api.openai.com/v1/chat/completions', 'openai'],
  ['https://api.openai.com/v1', 'https://api.openai.com/v1/chat/completions', 'openai'],
  ['https://api.openai.com/v1/', 'https://api.openai.com/v1/chat/completions', 'openai'],
  ['https://api.openai.com/v1/chat/completions', 'https://api.openai.com/v1/chat/completions', 'openai'],
  ['https://api.groq.com/openai/v1', 'https://api.groq.com/openai/v1/chat/completions', 'openai'],
  ['https://openrouter.ai/api/v1', 'https://openrouter.ai/api/v1/chat/completions', 'openai'],
  ['https://api.deepseek.com', 'https://api.deepseek.com/v1/chat/completions', 'openai'],
  ['https://api.deepseek.com/chat/completions', 'https://api.deepseek.com/chat/completions', 'openai'],
  ['http://localhost:11434', 'http://localhost:11434/v1/chat/completions', 'openai'],
  ['http://127.0.0.1:1234/v1', 'http://127.0.0.1:1234/v1/chat/completions', 'openai'],
  ['api.openai.com/v1', 'https://api.openai.com/v1/chat/completions', 'openai'],
  ['https://api.anthropic.com/v1/messages', 'https://api.anthropic.com/v1/messages', 'anthropic'],
  ['', 'https://api.openai.com/v1/chat/completions', 'openai']
]) {
  test(`${JSON.stringify(input)} -> ${expectedUrl}`, () => {
    const result = glint.resolveEndpoint(input);
    assert.equal(result.url, expectedUrl);
    assert.equal(result.style, expectedStyle);
  });
}

test('a garbage endpoint throws BAD_ENDPOINT', () => {
  assert.throws(
    () => glint.resolveEndpoint('http://exa mple.com'),
    (error) => error.code === 'BAD_ENDPOINT'
  );
});

console.log('\nrequest building');
test('openai payload carries system + user messages and a bearer token', () => {
  const request = glint.buildRequest(openai, 'helo wrld');
  const body = JSON.parse(request.body);
  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.headers.authorization, 'Bearer sk-test');
  assert.equal(body.model, 'gpt-4o-mini');
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[0].content, glint.DEFAULT_SYSTEM_PROMPT);
  assert.deepEqual(body.messages[1], { role: 'user', content: 'helo wrld' });
  assert.equal(body.temperature, 0.3);
  assert.ok(!('max_tokens' in body), 'blank max tokens must be omitted');
});

test('local runtimes get no Authorization header when the key is blank', () => {
  const request = glint.buildRequest(
    { ...openai, apiKey: '', endpoint: 'http://localhost:11434' },
    'hola'
  );
  assert.ok(!('authorization' in request.headers));
  assert.equal(request.url, 'http://localhost:11434/v1/chat/completions');
});

test('anthropic native payload uses x-api-key, system and required max_tokens', () => {
  const request = glint.buildRequest(
    { ...openai, endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-5' },
    'helo'
  );
  const body = JSON.parse(request.body);
  assert.equal(request.headers['x-api-key'], 'sk-test');
  assert.equal(request.headers['anthropic-version'], '2023-06-01');
  assert.ok(!('authorization' in request.headers));
  assert.equal(body.system, glint.DEFAULT_SYSTEM_PROMPT);
  assert.equal(body.max_tokens, 1024);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'helo' }]);
});

test('a missing model is rejected before any network call', () => {
  assert.throws(
    () => glint.buildRequest({ ...openai, model: '  ' }, 'hi'),
    (error) => error.code === 'NO_MODEL'
  );
});

test('extra request body is merged into the payload (deepseek thinking off)', () => {
  const request = glint.buildRequest(
    {
      ...openai,
      endpoint: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-flash',
      extraBody: '{"thinking": {"type": "disabled"}}'
    },
    'helo'
  );
  const body = JSON.parse(request.body);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(body.model, 'deepseek-flash');
  assert.deepEqual(body.messages[1], { role: 'user', content: 'helo' });
});

test('extra request body can override a default field', () => {
  const body = JSON.parse(
    glint.buildRequest({ ...openai, extraBody: '{"temperature": 1.1}' }, 'hi').body
  );
  assert.equal(body.temperature, 1.1);
});

test('malformed extra request body fails loudly, before the network', () => {
  assert.throws(
    () => glint.buildRequest({ ...openai, extraBody: 'thinking: off' }, 'hi'),
    (error) => error.code === 'BAD_EXTRA_BODY'
  );
  assert.throws(
    () => glint.buildRequest({ ...openai, extraBody: '[1,2,3]' }, 'hi'),
    (error) => error.code === 'BAD_EXTRA_BODY'
  );
});

test('a blank extra request body is a no-op', () => {
  for (const extraBody of ['', '   ', undefined]) {
    const body = JSON.parse(glint.buildRequest({ ...openai, extraBody }, 'hi').body);
    assert.deepEqual(Object.keys(body).sort(), ['messages', 'model', 'temperature']);
  }
});

console.log('\nresponse parsing');
test('reads a standard chat completion', () => {
  assert.equal(glint.extractText('openai', { choices: [{ message: { content: '  ok  ' } }] }), 'ok');
});
test('reads array-style content parts', () => {
  assert.equal(
    glint.extractText('openai', { choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }] }),
    'ab'
  );
});
test('reads a native anthropic message', () => {
  assert.equal(
    glint.extractText('anthropic', { content: [{ type: 'text', text: 'clean' }] }),
    'clean'
  );
});
test('unwraps fenced and quoted answers', () => {
  assert.equal(glint.unwrap('```\nFixed text.\n```'), 'Fixed text.');
  assert.equal(glint.unwrap('"Fixed text."'), 'Fixed text.');
  assert.equal(glint.unwrap('He said "hello" to me.'), 'He said "hello" to me.');
});

console.log('\nround trip');
await testAsync('a successful call returns the cleaned text', async () => {
  respond = () => jsonResponse(200, { choices: [{ message: { content: '```\nHello, world.\n```' } }] });
  const output = await glint.requestRewrite('helo wrld', openai);
  assert.equal(output, 'Hello, world.');
  assert.equal(lastRequest.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(lastRequest.options.method, 'POST');
  assert.deepEqual(JSON.parse(lastRequest.options.body).messages[1], {
    role: 'user',
    content: 'helo wrld'
  });
});

await testAsync('a 401 is reported as a key problem', async () => {
  respond = () => jsonResponse(401, { error: { message: 'Incorrect API key provided.' } });
  await assert.rejects(
    () => glint.requestRewrite('hi', openai),
    (error) => error.code === 'HTTP_401' && /Incorrect API key/.test(error.message)
  );
});

await testAsync('a non-JSON error body still yields a readable message', async () => {
  respond = () => textResponse(502, '<html>bad gateway</html>');
  await assert.rejects(
    () => glint.requestRewrite('hi', openai),
    (error) => error.code === 'HTTP_502' && /bad gateway/.test(error.message)
  );
});

await testAsync('an empty model response is surfaced, not pasted', async () => {
  respond = () => jsonResponse(200, { choices: [{ message: { content: '   ' } }] });
  await assert.rejects(
    () => glint.requestRewrite('hi', openai),
    (error) => error.code === 'EMPTY_RESPONSE'
  );
});

await testAsync('an unreachable host produces a NETWORK error, not a crash', async () => {
  respond = () => {
    throw new TypeError('fetch failed');
  };
  await assert.rejects(
    () => glint.requestRewrite('hi', openai),
    (error) => error.code === 'NETWORK'
  );
});

await testAsync('over-long selections are rejected locally', async () => {
  await assert.rejects(
    () => glint.requestRewrite('x'.repeat(6001), openai),
    (error) => error.code === 'TOO_LONG'
  );
});

/* ------------------------------------------------------- static wiring ---- */

console.log('\nstatic wiring');

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const contentJs = read('content.js');
const popupJs = read('popup.js');
const popupHtml = read('popup.html');
const backgroundJs = source;

test('manifest declares every referenced file', () => {
  const referenced = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((entry) => entry.js)
  ];
  for (const file of new Set(referenced)) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing file: ${file}`);
  }
});

test('manifest is Manifest V3 with the expected permissions', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
  assert.ok(manifest.content_scripts[0].matches.length > 0);
});

test('every getElementById in popup.js exists in popup.html', () => {
  const ids = new Set([...popupHtml.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
  const used = [...popupJs.matchAll(/getElementById\('([^']+)'\)/g)].map((match) => match[1]);
  assert.ok(used.length > 5, 'expected the popup to wire up several elements');
  for (const id of used) assert.ok(ids.has(id), `popup.html has no #${id}`);
});

test('every message type sent has a handler somewhere', () => {
  const handledInWorker = new Set(
    [...backgroundJs.matchAll(/case '(GLINT_[A-Z_]+)'/g)].map((m) => m[1])
  );
  // The content script answers probes itself, so accept those too.
  const handledInContent = new Set(
    [...contentJs.matchAll(/message\??\.type\s*!==\s*'(GLINT_[A-Z_]+)'/g)].map((m) => m[1])
  );
  const sent = new Set(
    [...`${contentJs}\n${popupJs}`.matchAll(/type:\s*'(GLINT_[A-Z_]+)'/g)].map((m) => m[1])
  );
  assert.ok(sent.size >= 4, 'expected several message types');
  for (const type of sent) {
    assert.ok(
      handledInWorker.has(type) || handledInContent.has(type),
      `no handler for ${type} in background.js or content.js`
    );
  }
});

test('the storage key is identical in the worker, the popup and the content script', () => {
  const keyOf = (text) => text.match(/STORAGE_KEY = '([^']+)'/)?.[1];
  const keys = [keyOf(backgroundJs), keyOf(popupJs), keyOf(contentJs)];
  assert.ok(keys[0], 'no storage key found');
  assert.equal(new Set(keys).size, 1, `mismatched storage keys: ${keys.join(', ')}`);
});

test('the content script resolves both themes, never passes "system" to the DOM', () => {
  assert.match(contentJs, /DARK_QUERY\s*=\s*window\.matchMedia\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(contentJs, /function resolvedTheme\(\)/, 'missing resolvedTheme()');
  assert.match(contentJs, /data-glint-theme|dataset\.glintTheme/, 'theme is never applied to the host');
  assert.match(contentJs, /DARK_QUERY\.addEventListener\('change'/, 'OS theme changes are not observed');
  assert.match(contentJs, /chrome\.storage\.onChanged\.addListener/, 'saved theme changes are not observed');
});

/* ------------------------------------------------------------------ report -- */

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
