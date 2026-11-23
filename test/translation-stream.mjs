import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractFromPlainText } from '../src/lib/extract.js';

const noopEvent = { addListener() {} };
let connect;
globalThis.chrome = {
  runtime: {
    onConnect: { addListener(listener) { connect = listener; } },
    onMessage: noopEvent,
    onInstalled: noopEvent,
    onStartup: noopEvent,
  },
  contextMenus: { onClicked: noopEvent },
  commands: { onCommand: noopEvent },
  permissions: { contains: async () => true },
  storage: { local: { get: async () => ({
    scholarlensSettings: { apiBase: 'http://127.0.0.1:8765/v1', model: 'mock-model' },
  }) } },
};
await import('../src/background.js');

function frame(choice, usage) {
  return `data: ${JSON.stringify({ choices: choice ? [choice] : [], usage })}\r\n\r\n`;
}

async function translate(t, frames, closeStream = true) {
  const encoder = new TextEncoder();
  // Separate every byte so CRLF and multibyte characters cross chunk boundaries.
  const bytes = encoder.encode(frames.join(''));
  let index = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (index < bytes.length) controller.enqueue(bytes.subarray(index, ++index));
      else if (closeStream) controller.close();
      else return new Promise(() => {});
    },
  });
  t.mock.method(globalThis, 'fetch', async (_url, { body }) => {
    const request = JSON.parse(body);
    assert.match(request.messages[1].content, /CeFe₂ ⟦M1⟧ \[12\]/);
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  });
  const messages = [];
  let handleMessage;
  connect({
    name: 'scholarlens-translate',
    onDisconnect: noopEvent,
    onMessage: { addListener(listener) { handleMessage = listener; } },
    postMessage(message) { messages.push(message); },
    disconnect() {},
  });
  await handleMessage({ type: 'translate', requestId: 'test', text: 'CeFe₂ ⟦M1⟧ [12]', mode: 'translate', formulaCount: 1 });
  return messages;
}

test('decodes split SSE events and finishes on DONE even when the server keeps the connection open', { timeout: 2000 }, async (t) => {
  const messages = await translate(t, [
    frame({ delta: { content: '译文 CeFe₂ ' } }),
    frame({ delta: { content: '⟦M1⟧ [12]' }, finish_reason: 'stop' }),
    frame(null, { total_tokens: 21 }),
    'data: [DONE]\r\n\r\n',
  ], false);
  assert.deepEqual(messages.map(({ type }) => type), ['delta', 'delta', 'done']);
  assert.equal(messages.at(-1).text, '译文 CeFe₂ ⟦M1⟧ [12]');
  assert.equal(messages.at(-1).usage.total_tokens, 21);
});

test('reports an interrupted stream instead of completing a partial translation', async (t) => {
  const messages = await translate(t, [frame({ delta: { content: 'Partial' } })]);
  assert.deepEqual(messages.map(({ type }) => type), ['delta', 'error']);
  assert.equal(messages.at(-1).code, 'INCOMPLETE');
});

test('reports the output limit even if the server sends DONE', async (t) => {
  const messages = await translate(t, [frame({ delta: { content: 'Partial' }, finish_reason: 'length' }), 'data: [DONE]\r\n\r\n']);
  assert.deepEqual(messages.map(({ type }) => type), ['delta', 'error']);
  assert.equal(messages.at(-1).code, 'TRUNCATED');
});

test('detects formula-only selections without diverting short phrases to Explain', () => {
  assert.equal(extractFromPlainText('($E=mc^2$)').formulaOnly, true);
  const phrase = extractFromPlainText('Let $E=mc^2$.');
  assert.equal(phrase.formulaOnly, false);
  assert.equal(phrase.formulas[0].latex, 'E=mc^2');
});
