import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.CDP_PORT || 9227);
const artifactDir = path.join(process.cwd(), 'test', 'artifacts');
fs.mkdirSync(artifactDir, { recursive: true });

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
      } else if (message.method) {
        this.events.push(message);
      }
    };
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    return new CDP(ws);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
  }

  close() {
    this.ws.close();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

async function waitFor(fn, timeout = 20_000, interval = 150) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  throw new Error(`Timed out${lastError ? `: ${lastError.message}` : ''}`);
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const optionsTarget = targets.find((target) => target.type === 'page' && target.url.includes('options.html'));
const pageTarget = targets.find((target) => target.type === 'page' && target.url.includes('demo.html'));
if (!optionsTarget || !pageTarget) {
  throw new Error(`Missing targets: ${targets.map((target) => `${target.type}:${target.url}`).join(', ')}`);
}

const settings = {
  apiBase: 'http://127.0.0.1:8765/v1',
  apiKey: 'test-key',
  model: 'mock-model',
  targetLanguage: '简体中文',
  temperature: 0.2,
  customPrompt: '机器学习与缩放定律；保持术语准确。',
  showBubble: true,
};

const options = await CDP.connect(optionsTarget.webSocketDebuggerUrl);
await options.evaluate(
  `chrome.storage.local.set(${JSON.stringify({ scholarlensSettings: settings })}).then(() => true)`,
);
options.close();

fs.writeFileSync(path.join(process.cwd(), 'test', 'requests.jsonl'), '');

const page = await CDP.connect(pageTarget.webSocketDebuggerUrl);
await page.send('Page.enable');
await page.send('Runtime.enable');
await page.send('Log.enable');
await page.send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.send('Page.bringToFront');
await page.send('Page.reload', { ignoreCache: true });
await sleep(500);
await waitFor(async () => {
  return await page.evaluate(`Boolean(document.getElementById('scholarlens-root'))`);
}, 10_000);
await page.send('Page.bringToFront');
await page.evaluate(`window.scrollTo(0, 0); true`);
await sleep(300);

const initial = await page.evaluate(`(() => {
  const host = document.getElementById('scholarlens-root');
  return {
    host: Boolean(host),
    bubbleHidden: host?.shadowRoot?.querySelector('.sl-bubble')?.hidden,
    panelHidden: host?.shadowRoot?.querySelector('.sl-panel')?.hidden,
    katexCount: document.querySelectorAll('.katex').length,
  };
})()`);
console.log('initial:', initial);
if (!initial.host) {
  throw new Error('Content script UI was not injected.');
}

const selected = await page.evaluate(`(() => {
  const target = document.getElementById('target');
  const range = document.createRange();
  range.selectNodeContents(target);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const rect = range.getBoundingClientRect();
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: rect.left + 80, clientY: rect.bottom - 12, button: 0 }));
  return { textLength: selection.toString().length, left: rect.left, top: rect.top, bottom: rect.bottom };
})()`);
console.log('selected:', selected);

const bubble = await waitFor(async () => {
  const state = await page.evaluate(`(() => {
    const shadow = document.getElementById('scholarlens-root')?.shadowRoot;
    const bubble = shadow?.querySelector('.sl-bubble');
    return bubble && !bubble.hidden ? {
      text: bubble.innerText,
      left: bubble.getBoundingClientRect().left,
      top: bubble.getBoundingClientRect().top,
    } : null;
  })()`);
  return state;
});
console.log('bubble:', bubble);
await page.evaluate(`document.getElementById('scholarlens-root').shadowRoot.querySelector('[data-role="bubble-translate"]').click(); true`);

const finalState = await waitFor(async () => {
  const state = await page.evaluate(`(() => {
    const shadow = document.getElementById('scholarlens-root')?.shadowRoot;
    if (!shadow) return null;
    const panel = shadow.querySelector('.sl-panel');
    const status = shadow.querySelector('[data-role="status-text"]')?.textContent || '';
    const error = shadow.querySelector('.sl-error-message')?.textContent || '';
    return {
      panelHidden: panel?.hidden,
      status,
      error,
      result: shadow.querySelector('[data-role="result"]')?.innerText || '',
      sourceMeta: shadow.querySelector('[data-role="source-meta"]')?.textContent || '',
      formulaRows: shadow.querySelectorAll('.sl-formula-row').length,
      katex: shadow.querySelectorAll('.katex').length,
      formulaError: shadow.querySelectorAll('.sl-formula-error').length,
      panelRect: panel ? panel.getBoundingClientRect().toJSON() : null,
    };
  })()`);
  if (!state || state.error || state.status.includes('完成') || state.status.includes('失败')) return state;
  return null;
}, 25_000);
console.log('final:', JSON.stringify(finalState, null, 2));

if (finalState.error) {
  const consoleMessages = page.events
    .filter((event) => event.method === 'Runtime.consoleAPICalled' || event.method === 'Log.entryAdded')
    .slice(-10);
  console.log('console:', JSON.stringify(consoleMessages, null, 2));
}

const pageShot = await withTimeout(
  page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }),
  10_000,
  'page screenshot',
);
fs.writeFileSync(path.join(artifactDir, 'page.png'), Buffer.from(pageShot.data, 'base64'));

const panelRect = finalState.panelRect;
if (panelRect) {
  await page.evaluate(`(() => {
    const shadow = document.getElementById('scholarlens-root').shadowRoot;
    const details = shadow.querySelector('[data-role="formulas"]');
    if (details && !details.hidden) details.open = true;
    return true;
  })()`);
  await sleep(500);
  const freshRect = await page.evaluate(
    `document.getElementById('scholarlens-root').shadowRoot.querySelector('.sl-panel').getBoundingClientRect().toJSON()`,
  );
  const shot = await withTimeout(
    page.send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: Math.max(0, freshRect.x),
        y: Math.max(0, freshRect.y),
        width: Math.min(freshRect.width, 1440),
        height: Math.min(freshRect.height, 1100),
        scale: 1,
      },
    }),
    10_000,
    'panel screenshot',
  );
  fs.writeFileSync(path.join(artifactDir, 'panel.png'), Buffer.from(shot.data, 'base64'));
}

const requests = fs
  .readFileSync(path.join(process.cwd(), 'test', 'requests.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
console.log('requests:', requests.map((request) => ({ mode: request.mode, model: request.model })));
if (requests[0]) {
  console.log('system prompt head:', requests[0].system.slice(0, 200));
  console.log('source payload:', requests[0].user.slice(0, 1200));
}
console.log('artifacts:', artifactDir);
page.close();
