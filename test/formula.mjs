import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.CDP_PORT || 9229);
const artifactDir = path.join(process.cwd(), 'test', 'artifacts');
fs.mkdirSync(artifactDir, { recursive: true });

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(JSON.stringify(message.error))) : pending.resolve(message.result);
      }
    };
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => (ws.onopen = resolve, (ws.onerror = reject)));
    return new CDP(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  close() {
    this.ws.close();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value;
    await sleep(150);
  }
  throw new Error('Timed out');
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const pageTarget = targets.find((target) => target.type === 'page' && target.url.includes('demo.html'));
const optionsTarget = targets.find((target) => target.type === 'page' && target.url.includes('options.html'));
const settings = {
  apiBase: 'http://127.0.0.1:8765/v1',
  apiKey: 'test-key',
  model: 'mock-model',
  targetLanguage: '简体中文',
  temperature: 0.2,
  customPrompt: '',
  showBubble: true,
};
if (optionsTarget) {
  const options = await CDP.connect(optionsTarget.webSocketDebuggerUrl);
  await options.evaluate(
    `chrome.storage.local.set(${JSON.stringify({ scholarlensSettings: settings })}).then(() => true)`,
  );
  options.close();
}

const page = await CDP.connect(pageTarget.webSocketDebuggerUrl);
await page.send('Page.enable');
await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await page.send('Page.bringToFront');
await page.send('Page.reload', { ignoreCache: true });
await sleep(500);
await waitFor(() => page.evaluate(`Boolean(document.getElementById('scholarlens-root'))`));


const selected = await page.evaluate(`(() => {
  const target = document.getElementById('formula-only');
  const range = document.createRange();
  range.selectNodeContents(target);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const rect = range.getBoundingClientRect();
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: rect.left + 120, clientY: rect.bottom - 10, button: 0 }));
  return { text: selection.toString(), textLength: selection.toString().length };
})()`);
console.log('selected formula:', selected);

await waitFor(async () => {
  return await page.evaluate(
    `!document.getElementById('scholarlens-root').shadowRoot.querySelector('.sl-bubble').hidden`,
  );
});
await page.evaluate(
  `document.getElementById('scholarlens-root').shadowRoot.querySelector('[data-role="bubble-translate"]').click(); true`,
);

const state = await waitFor(async () => {
  const result = await page.evaluate(`(() => {
    const shadow = document.getElementById('scholarlens-root').shadowRoot;
    const status = shadow.querySelector('[data-role="status-text"]')?.textContent || '';
    return {
      status,
      error: shadow.querySelector('.sl-error-message')?.textContent || '',
      tab: shadow.querySelector('[data-tab="explain"]')?.getAttribute('aria-selected'),
      sourceMeta: shadow.querySelector('[data-role="source-meta"]')?.textContent || '',
      formulaRows: shadow.querySelectorAll('.sl-formula-row').length,
      result: shadow.querySelector('[data-role="result"]')?.innerText || '',
      integrity: shadow.querySelector('.sl-integrity')?.innerText || '',
      displayMath: shadow.querySelectorAll('.sl-result .katex-display').length,
      formulaError: shadow.querySelectorAll('.sl-formula-error').length,
      panel: shadow.querySelector('.sl-panel')?.getBoundingClientRect().toJSON(),
    };
  })()`);
  if (result.error || result.status.includes('完成') || result.status.includes('失败')) return result;
  return null;
});
console.log(JSON.stringify(state, null, 2));

if (state.panel) {
  await sleep(300);
  const freshPanel = await page.evaluate(
    `document.getElementById('scholarlens-root').shadowRoot.querySelector('.sl-panel').getBoundingClientRect().toJSON()`,
  );
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png',
    clip: {
      x: Math.max(0, freshPanel.x),
      y: Math.max(0, freshPanel.y),
      width: Math.min(freshPanel.width, 1440),
      height: Math.min(freshPanel.height, 1100),
      scale: 1,
    },
  });
  fs.writeFileSync(path.join(artifactDir, 'formula-panel.png'), Buffer.from(shot.data, 'base64'));
}

if (!state.status.includes('完成') || state.tab !== 'true' || state.displayMath < 1 || state.formulaError > 0) {
  throw new Error('Formula explanation assertion failed');
}
console.log('formula explanation test passed');
page.close();
