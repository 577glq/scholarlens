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
const options = await CDP.connect(optionsTarget.webSocketDebuggerUrl);
await options.evaluate(`chrome.storage.local.set(${JSON.stringify({
  scholarlensSettings: {
    apiBase: 'http://127.0.0.1:8765/v1',
    apiKey: 'test-key',
    model: 'mock-model',
    targetLanguage: '简体中文',
    temperature: 0.2,
    customPrompt: '机器学习与缩放定律；保持术语准确。',
    showBubble: true,
  },
})}).then(() => true)`);
options.close();

const page = await CDP.connect(pageTarget.webSocketDebuggerUrl);
await page.send('Page.enable');
await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await page.send('Page.bringToFront');
await page.send('Page.reload', { ignoreCache: true });
await sleep(500);
await waitFor(() => page.evaluate(`Boolean(document.getElementById('scholarlens-root'))`));
await page.evaluate(`(() => {
  const target = document.getElementById('target');
  const range = document.createRange();
  range.selectNodeContents(target);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const rect = range.getBoundingClientRect();
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: rect.left + 100, clientY: rect.bottom - 10, button: 0 }));
  return true;
})()`);
await waitFor(() => page.evaluate(`!document.getElementById('scholarlens-root').shadowRoot.querySelector('.sl-bubble').hidden`));
await page.evaluate(`document.getElementById('scholarlens-root').shadowRoot.querySelector('[data-role="bubble-translate"]').click(); true`);
await waitFor(async () => {
  const status = await page.evaluate(
    `document.getElementById('scholarlens-root').shadowRoot.querySelector('[data-role="status-text"]')?.textContent || ''`,
  );
  return status.includes('完成') || status.includes('失败');
}, 25_000);
await sleep(500);
await page.evaluate(`window.getSelection().removeAllRanges(); true`);

const pageShot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(path.join(artifactDir, 'page-clean.png'), Buffer.from(pageShot.data, 'base64'));

const panelShot = await page.send('Page.captureScreenshot', {
  format: 'png',
  clip: await page.evaluate(`(() => {
    const panel = document.getElementById('scholarlens-root').shadowRoot.querySelector('.sl-panel');
    const rect = panel.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 };
  })()`),
});
fs.writeFileSync(path.join(artifactDir, 'panel-clean.png'), Buffer.from(panelShot.data, 'base64'));

await page.evaluate(`(() => {
  const shadow = document.getElementById('scholarlens-root').shadowRoot;
  const formulas = shadow.querySelector('[data-role="formulas"]');
  formulas.open = true;
  const scroller = shadow.querySelector('[data-role="scroll"]');
  scroller.scrollTop = scroller.scrollHeight;
  return true;
})()`);
await sleep(500);
const formulasShot = await page.send('Page.captureScreenshot', {
  format: 'png',
  clip: await page.evaluate(`(() => {
    const panel = document.getElementById('scholarlens-root').shadowRoot.querySelector('.sl-panel');
    const rect = panel.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 };
  })()`),
});
fs.writeFileSync(path.join(artifactDir, 'formulas.png'), Buffer.from(formulasShot.data, 'base64'));
console.log('screenshots written');
page.close();
