import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.CDP_PORT || 9331);
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
if (!pageTarget || !optionsTarget) throw new Error('Required targets missing');
const options = await CDP.connect(optionsTarget.webSocketDebuggerUrl);
const baseSettings = {
  apiBase: 'http://127.0.0.1:8765/v1',
  apiKey: 'test-key',
  model: 'mock-model',
  targetLanguage: '简体中文',
  temperature: 0.2,
  customPrompt: 'FORCE_MISSING_FORMULA',
  showBubble: true,
};
const setSettings = (patch) =>
  options.evaluate(
    `chrome.storage.local.set(${JSON.stringify({ scholarlensSettings: { ...baseSettings, ...patch } })}).then(() => true)`,
  );

const page = await CDP.connect(pageTarget.webSocketDebuggerUrl);
await page.send('Page.enable');
await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await page.send('Page.bringToFront');

async function reloadAndSelect(id = 'target') {
  await page.send('Page.reload', { ignoreCache: true });
  await sleep(500);
  await waitFor(() => page.evaluate(`Boolean(document.getElementById('scholarlens-root'))`));
  await page.evaluate(`(() => {
    const target = document.getElementById(${JSON.stringify(id)});
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const rect = range.getBoundingClientRect();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: rect.left + 100, clientY: rect.bottom - 10, button: 0 }));
    return true;
  })()`);
  await waitFor(() =>
    page.evaluate(
      `!document.getElementById('scholarlens-root').shadowRoot.querySelector('.sl-bubble').hidden`,
    ),
  );
}

async function translateAndWait(role = 'bubble-translate') {
  await page.evaluate(
    `document.getElementById('scholarlens-root').shadowRoot.querySelector('[data-role="${role}"]').click(); true`,
  );
  return waitFor(async () => {
    const state = await page.evaluate(`(() => {
      const shadow = document.getElementById('scholarlens-root').shadowRoot;
      return {
        status: shadow.querySelector('[data-role="status-text"]')?.textContent || '',
        errorTitle: shadow.querySelector('.sl-error-title')?.textContent || '',
        error: shadow.querySelector('.sl-error-message')?.textContent || '',
        integrity: shadow.querySelector('.sl-integrity')?.innerText || '',
        toast: shadow.querySelector('[data-role="toast"]')?.innerText || '',
        formulaOpen: shadow.querySelector('[data-role="formulas"]')?.open,
        copyDisabled: shadow.querySelector('[data-role="copy"]')?.disabled,
      };
    })()`);
    if (state.errorTitle || state.status.includes('完成')) return state;
    return null;
  }, 25_000);
}

await setSettings({});
await reloadAndSelect('target');
const missing = await translateAndWait();
console.log('missing-formula state:', missing);
if (!missing.integrity.includes('1 个')) throw new Error('Missing formula notice not shown');

await page.evaluate(
  `document.getElementById('scholarlens-root').shadowRoot.querySelector('.sl-integrity button').click(); true`,
);
await sleep(250);
const formulaOpen = await page.evaluate(
  `document.getElementById('scholarlens-root').shadowRoot.querySelector('[data-role="formulas"]').open`,
);
if (!formulaOpen) throw new Error('Formula panel did not open');

const copyState = await page.evaluate(`(async () => {
  const shadow = document.getElementById('scholarlens-root').shadowRoot;
  shadow.querySelector('[data-role="copy"]').click();
  await new Promise((resolve) => setTimeout(resolve, 600));
  return {
    toast: shadow.querySelector('[data-role="toast"]')?.innerText || '',
    button: shadow.querySelector('[data-role="copy"]')?.innerText || '',
  };
})()`);
console.log('copy state:', copyState);

await setSettings({ apiBase: 'https://api.deepseek.com/v1', apiKey: '' });
await reloadAndSelect('target');
const noKey = await translateAndWait();
console.log('no-key state:', noKey);
if (!noKey.errorTitle.includes('配置')) throw new Error('Missing API key guidance not shown');

await setSettings({ customPrompt: '', apiKey: 'test-key', apiBase: 'http://127.0.0.1:8765/v1' });
const restored = await options.evaluate(
  `chrome.storage.local.get('scholarlensSettings').then((x) => x.scholarlensSettings)`,
);
console.log('restored settings:', { ...restored, apiKey: restored.apiKey ? '***' : '' });

options.close();
page.close();
console.log('integrity / copy / no-key tests passed');
