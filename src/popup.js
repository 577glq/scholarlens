import { loadSettings, SETTINGS_KEY } from './lib/config.js';
import { extractFromPlainText } from './lib/extract.js';
import { renderMarkdown, renderSingleFormula } from './lib/markdown.js';
import { localizeDom, makeI18n } from './lib/i18n.js';

const PORT_NAME = 'scholarlens-translate';
const MAX_CHARS = 8000;

const $ = (id) => document.getElementById(id);
const inputView = $('inputView');
const resultView = $('resultView');
const sourceInput = $('sourceInput');
const translateButton = $('translateButton');
const clearButton = $('clearButton');
const inputStatus = $('inputStatus');
const charCount = $('charCount');
const result = $('result');
const resultMeta = $('resultMeta');
const formulasDetails = $('formulasDetails');
const formulaMeta = $('formulaMeta');
const formulaList = $('formulaList');
const statusDot = $('statusDot');
const statusText = $('statusText');
const stopButton = $('stopButton');
const retryButton = $('retryButton');
const copyButton = $('copyButton');
const configNotice = $('configNotice');
const pdfBanner = $('pdfBanner');
const openPdfButton = $('openPdfButton');

let settings = {
  apiBase: '',
  apiKey: '',
  model: '',
  targetLanguage: '简体中文',
  showBubble: true,
  uiLanguage: 'auto',
};
let mode = 'translate';
let extraction = null;
let formulaMap = new Map();
let currentRequest = null;
let lastEntry = null;
let pdfUrl = '';
let i18n = makeI18n('auto');
const t = (zh, en) => i18n.t(zh, en);

function isLoopback(value) {
  try {
    const host = new URL(value).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

function needsApiKey() {
  return !settings.apiKey?.trim() && !isLoopback(settings.apiBase);
}

function updateConfigUi() {
  $('targetLabel').textContent = `→ ${settings.targetLanguage || '简体中文'}`;
  configNotice.hidden = !needsApiKey();
}

function setInputStatus(message, isError = false) {
  inputStatus.textContent = message;
  inputStatus.classList.toggle('is-error', Boolean(isError));
}

function setStatus(text, live = false) {
  statusText.textContent = text;
  statusDot.classList.toggle('is-live', Boolean(live));
}

function normalizePlaceholders(text, formulas) {
  const ids = new Set(formulas.map((formula) => formula.id));
  return String(text || '').replace(
    /⟦\s*M\s*(\d+)\s*⟧|\[\[\s*M\s*(\d+)\s*\]\]|[【〖]\s*M\s*(\d+)\s*[】〗]/gi,
    (whole, a, b, c) => {
      const id = Number(a || b || c);
      return ids.has(id) ? `⟦M${id}⟧` : whole;
    },
  );
}

function cleanOutput(raw, formulas) {
  let text = String(raw || '').replace(/\u200b/g, '').trim();
  const fenced = text.match(/^```(?:markdown|md|latex|tex)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (fenced) text = fenced[1].trim();
  text = text.replace(/^(?:\*\*)?(?:译文|翻译结果|翻译|解释结果|解释)(?:\*\*)?\s*[:：]\s*\n?/i, '');
  text = text.replace(/^(?:好的[，,]\s*)?(?:以下是|这是).{0,24}(?:译文|翻译|解释)\s*[:：]?\s*$/im, '');
  return normalizePlaceholders(text, formulas).trim();
}

function markdownWithLatex(text, formulas) {
  const map = new Map(formulas.map((formula) => [formula.id, formula]));
  return String(text || '').replace(/⟦M(\d+)⟧/g, (whole, rawId) => {
    const formula = map.get(Number(rawId));
    if (!formula) return whole;
    return formula.display ? `\n\n$$\n${formula.latex}\n$$\n\n` : ` $${formula.latex}$ `;
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the legacy clipboard path.
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

function updateMode(nextMode) {
  mode = nextMode === 'explain' ? 'explain' : 'translate';
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.mode === mode));
  });
  translateButton.textContent = mode === 'explain' ? t('解释', 'Explain') : t('翻译', 'Translate');
}

function updateCharCount() {
  const count = sourceInput.value.length;
  charCount.textContent =
    count > MAX_CHARS
      ? t(
          `${count.toLocaleString('zh-CN')} 字符 · 将截取前 ${MAX_CHARS.toLocaleString('zh-CN')}`,
          `${count.toLocaleString('en-US')} characters · first ${MAX_CHARS.toLocaleString('en-US')} will be used`,
        )
      : t(`${count.toLocaleString('zh-CN')} 字符`, `${count.toLocaleString('en-US')} characters`);
}

function showInputView() {
  abortRequest();
  resultView.hidden = true;
  inputView.hidden = false;
  sourceInput.focus();
}

function showResultView(metaText) {
  inputView.hidden = true;
  resultView.hidden = false;
  resultMeta.textContent = metaText;
}

function loadingView() {
  result.className = 'pop-result';
  result.textContent = '';
  const box = element('div', 'loading-box');
  const label = element('div', 'loading-label');
  label.append(
    element('span', 'spinner'),
    document.createTextNode(t('正在梳理术语、公式与上下文…', 'Reviewing terminology, formulas, and context…')),
  );
  const skeleton = element('div', 'skeleton');
  for (let i = 0; i < 4; i += 1) skeleton.appendChild(element('div', 'skeleton-line'));
  box.append(label, skeleton);
  result.appendChild(box);
}

function renderFormulaList(formulas) {
  formulaList.textContent = '';
  formulaMap = new Map(formulas.map((formula) => [formula.id, formula]));
  if (!formulas.length) {
    formulasDetails.hidden = true;
    return;
  }
  formulasDetails.hidden = false;
  formulasDetails.open = false;
  formulaMeta.textContent = `· ${formulas.length}`;
  for (const formula of formulas) {
    const row = element('div', 'pop-formula-row');
    const id = element('span', 'pop-formula-id', `M${formula.id}`);
    id.title = t(`来源：${formula.source}`, `Source: ${formula.source}`);
    const content = element('div', 'pop-formula-content');
    content.appendChild(renderSingleFormula(formula.latex, formula.display));
    const copy = element('button', 'pop-formula-copy');
    copy.type = 'button';
    copy.title = t('复制 LaTeX', 'Copy LaTeX');
    copy.setAttribute('aria-label', t(`复制公式 M${formula.id} 的 LaTeX`, `Copy LaTeX for formula M${formula.id}`));
    copy.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>';
    copy.addEventListener('click', async () => {
      const ok = await writeClipboard(formula.latex);
      setStatus(ok ? t(`已复制 M${formula.id} 的 LaTeX`, `Copied LaTeX for M${formula.id}`) : t('复制失败', 'Copy failed'), false);
    });
    row.append(id, content, copy);
    formulaList.appendChild(row);
  }
}

function missingFormulas(entry) {
  if (mode !== 'translate' || !entry?.cleanText) return [];
  const used = new Set([...entry.cleanText.matchAll(/⟦M(\d+)⟧/g)].map((match) => Number(match[1])));
  return (extraction?.formulas || []).filter((formula) => !used.has(formula.id));
}

function renderResult(entry) {
  lastEntry = entry;
  copyButton.disabled = !entry.cleanText;
  stopButton.hidden = true;
  retryButton.hidden = false;
  result.className = 'pop-result';
  result.textContent = '';

  if (entry.status === 'error') {
    renderError(entry);
    return;
  }

  result.appendChild(renderMarkdown(entry.cleanText, formulaMap));
  const missing = missingFormulas(entry);
  if (missing.length) {
    const note = element('div', 'sl-integrity');
    note.appendChild(
      document.createTextNode(
        t(
          `译文缺少 ${missing.length} 个原文公式占位符；公式本身仍保留在下方公式对照中。`,
          `The translation is missing ${missing.length} source formula placeholder${missing.length === 1 ? '' : 's'}. The source formulas remain below.`,
        ),
      ),
    );
    const button = element('button', '', t('查看公式', 'View formulas'));
    button.type = 'button';
    button.addEventListener('click', () => {
      formulasDetails.open = true;
      formulasDetails.scrollIntoView({ block: 'nearest' });
    });
    note.appendChild(button);
    result.appendChild(note);
  }

  const parts = [entry.partial ? t('已停止生成', 'Stopped') : t('完成', 'Done')];
  if (entry.elapsed) parts.push(t(`${entry.elapsed.toFixed(1)} 秒`, `${entry.elapsed.toFixed(1)}s`));
  if (entry.usage?.total_tokens) parts.push(`${entry.usage.total_tokens} tokens`);
  setStatus(parts.join(' · '), false);
}

function renderError(entry) {
  copyButton.disabled = true;
  stopButton.hidden = true;
  retryButton.hidden = false;
  const titles = {
    NO_KEY: t('还差一步配置', 'API key required'),
    HOST_PERMISSION: t('需要域名访问权限', 'Domain permission required'),
    AUTH: t('API Key 无效', 'Invalid API key'),
    BILLING: t('额度不足', 'Insufficient credits'),
    RATE_LIMIT: t('请求受限', 'Rate limited'),
    NETWORK: t('连接失败', 'Connection failed'),
    TIMEOUT: t('请求超时', 'Request timed out'),
    CONFIG: t('配置不完整', 'Incomplete configuration'),
    CONTEXT: t('扩展需要刷新', 'Extension needs a refresh'),
  };
  const card = element('div', 'error-card');
  card.appendChild(element('div', 'error-title', titles[entry.code] || t('处理失败', 'Request failed')));
  card.appendChild(
    element(
      'p',
      'error-message',
      i18n.lang === 'en' && entry.message && /[\u4e00-\u9fff]/.test(entry.message)
        ? titles[entry.code] || t('请求失败。', 'The request failed.')
        : entry.message || t('请稍后重试。', 'Try again in a moment.'),
    ),
  );
  if (['NO_KEY', 'HOST_PERMISSION', 'AUTH', 'CONFIG'].includes(entry.code)) {
    const actions = element('div', 'error-actions');
    const settingsButton = element('button', '', t('打开设置', 'Open settings'));
    settingsButton.type = 'button';
    settingsButton.addEventListener('click', openSettings);
    actions.appendChild(settingsButton);
    card.appendChild(actions);
  }
  result.appendChild(card);
  setStatus(t('未完成', 'Not completed'), false);
}

function abortRequest() {
  const request = currentRequest;
  if (!request) return;
  request.stopped = true;
  if (request.previewTimer) clearTimeout(request.previewTimer);
  request.previewTimer = null;
  try {
    request.port.disconnect();
  } catch {
    // Already disconnected.
  }
  currentRequest = null;
}

function startRequest() {
  abortRequest();
  if (!extraction) return;
  if (needsApiKey()) {
    setInputStatus(t('请先在设置中填写 API Key。', 'Add an API key in Settings first.'), true);
    showInputView();
    return;
  }

  loadingView();
  setStatus(t('正在连接模型…', 'Connecting to model…'), true);
  copyButton.disabled = true;
  stopButton.hidden = false;
  retryButton.hidden = true;
  formulasDetails.open = false;

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let port;
  try {
    port = chrome.runtime.connect({ name: PORT_NAME });
  } catch {
    const entry = {
      status: 'error',
      code: 'CONTEXT',
      message: t('扩展上下文已失效，请关闭弹窗后重试。', 'The extension context is invalid. Close the popup and try again.'),
    };
    renderResult(entry);
    return;
  }

  const request = {
    id: requestId,
    port,
    mode,
    full: '',
    finished: false,
    stopped: false,
    startedAt: performance.now(),
    previewTimer: null,
  };
  currentRequest = request;

  port.onMessage.addListener((message) => {
    if (message?.requestId && message.requestId !== requestId) return;
    if (message?.type === 'delta') {
      request.full += message.delta || '';
      schedulePreview(request);
      return;
    }
    if (message?.type === 'done') {
      request.finished = true;
      abortRequestPort(request);
      const output = cleanOutput(message.text || request.full, extraction.formulas);
      if (!output) {
        renderResult({
          status: 'error',
          code: 'EMPTY',
          message: t('模型返回了空内容，请重试。', 'The model returned an empty response. Try again.'),
        });
        return;
      }
      renderResult({
        status: 'done',
        cleanText: output,
        elapsed: (performance.now() - request.startedAt) / 1000,
        usage: message.usage || null,
        partial: false,
      });
      currentRequest = null;
      return;
    }
    if (message?.type === 'error') {
      request.finished = true;
      abortRequestPort(request);
      currentRequest = null;
      renderResult({ status: 'error', code: message.code, message: message.message });
    }
  });

  port.onDisconnect.addListener(() => {
    if (request.finished || request.stopped || currentRequest !== request) return;
    request.finished = true;
    currentRequest = null;
    renderResult({
      status: 'error',
      code: 'DISCONNECTED',
      message: t('与扩展后台的连接中断，请重试。', 'The connection to the extension background was interrupted. Try again.'),
    });
  });

  try {
    port.postMessage({
      type: 'translate',
      requestId,
      text: extraction.text,
      mode,
      formulaCount: extraction.formulaCount,
    });
  } catch {
    request.finished = true;
    currentRequest = null;
    renderResult({
      status: 'error',
      code: 'CONTEXT',
      message: t('扩展上下文已失效，请关闭弹窗后重试。', 'The extension context is invalid. Close the popup and try again.'),
    });
  }
}

function abortRequestPort(request) {
  try {
    request.port.disconnect();
  } catch {
    // Already disconnected.
  }
}

function schedulePreview(request) {
  if (request.previewTimer) return;
  request.previewTimer = setTimeout(() => {
    request.previewTimer = null;
    if (currentRequest !== request || request.finished) return;
    if (!request.full.trim()) return;
    const nearBottom = result.scrollTop + result.clientHeight >= result.scrollHeight - 30;
    result.className = 'pop-result sl-streaming';
    result.textContent = cleanOutput(request.full, extraction.formulas);
    setStatus(t('正在生成…', 'Generating…'), true);
    if (nearBottom) result.scrollTop = result.scrollHeight;
  }, 70);
}

function stopGeneration() {
  const request = currentRequest;
  if (!request) return;
  const output = cleanOutput(request.full, extraction.formulas);
  request.stopped = true;
  if (request.previewTimer) clearTimeout(request.previewTimer);
  request.previewTimer = null;
  abortRequestPort(request);
  currentRequest = null;
  if (output) {
    renderResult({
      status: 'done',
      cleanText: output,
      elapsed: (performance.now() - request.startedAt) / 1000,
      partial: true,
    });
  } else {
    renderResult({
    status: 'error',
    code: 'STOPPED',
    message: t('已停止生成。', 'Generation stopped.'),
  });
  }
}

function openSettings() {
  chrome.runtime.openOptionsPage();
  window.close();
}

async function copyResult() {
  if (!lastEntry?.cleanText || !extraction) return;
  let text = markdownWithLatex(lastEntry.cleanText, extraction.formulas);
  const missing = missingFormulas(lastEntry);
  if (missing.length) {
    const appendix = missing
      .map((formula) => (formula.display ? `$$\n${formula.latex}\n$$` : `$${formula.latex}$`))
      .join('\n\n');
    text += `\n\n---\n\n**${t('原文中未被译文引用的公式', 'Source formulas not referenced in the translation')}**\n\n${appendix}`;
  }
  const ok = await writeClipboard(text);
  if (ok) {
    copyButton.textContent = t('已复制', 'Copied');
    setTimeout(() => {
      copyButton.textContent = t('复制 Markdown', 'Copy Markdown');
    }, 1500);
  } else {
    setStatus(t('复制失败，请检查剪贴板权限', 'Copy failed. Check the clipboard permission.'), false);
  }
}

function submit() {
  const text = sourceInput.value.trim();
  if (!text) {
    setInputStatus(t('请先粘贴要处理的文字。', 'Paste some text first.'), true);
    sourceInput.focus();
    return;
  }
  if (needsApiKey()) {
    setInputStatus(t('请先在设置中填写 API Key。', 'Add an API key in Settings first.'), true);
    configNotice.hidden = false;
    return;
  }

  try {
    extraction = extractFromPlainText(text);
  } catch (error) {
    setInputStatus(t(`无法读取文本：${error.message}`, `Could not read text: ${error.message}`), true);
    return;
  }
  if (!extraction.text) {
    setInputStatus(t('没有可处理的文本。', 'There is no text to process.'), true);
    return;
  }

  abortRequest();
  setInputStatus('');
  const targetMode = extraction.formulaOnly && mode === 'translate' ? 'explain' : mode;
  if (targetMode !== mode) updateMode(targetMode);

  const meta = [
    t(
      `${extraction.charCount.toLocaleString('zh-CN')} 字符`,
      `${extraction.charCount.toLocaleString('en-US')} characters`,
    ),
  ];
  if (extraction.formulaCount) {
    meta.push(
      t(
        `${extraction.formulaCount} 个公式`,
        `${extraction.formulaCount} formula${extraction.formulaCount === 1 ? '' : 's'}`,
      ),
    );
  }
  if (extraction.truncated) meta.push(t('已截取', 'truncated'));
  showResultView(meta.join(' · '));
  renderFormulaList(extraction.formulas);
  result.scrollTop = 0;
  startRequest();
}

function bindEvents() {
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => updateMode(button.dataset.mode));
  });
  sourceInput.addEventListener('input', updateCharCount);
  sourceInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  translateButton.addEventListener('click', submit);
  clearButton.addEventListener('click', () => {
    sourceInput.value = '';
    updateCharCount();
    setInputStatus('');
    sourceInput.focus();
  });
  $('settingsButton').addEventListener('click', openSettings);
  $('noticeSettings').addEventListener('click', openSettings);
  openPdfButton.addEventListener('click', openPdfReader);
  $('openPdfHome').addEventListener('click', openPdfHome);
  $('backButton').addEventListener('click', showInputView);
  stopButton.addEventListener('click', stopGeneration);
  retryButton.addEventListener('click', startRequest);
  copyButton.addEventListener('click', copyResult);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return;
    const next = changes[SETTINGS_KEY].newValue || {};
    settings = { ...settings, ...next };
    i18n = makeI18n(settings.uiLanguage);
    localizeDom(document.documentElement, i18n.lang);
    updateConfigUi();
  });
  window.addEventListener('pagehide', abortRequest);
}

async function detectActivePdf() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const url = new URL(tab.url);
    if (!/^https?:$/.test(url.protocol)) return;
    if (!/\.pdf$/i.test(url.pathname)) return;
    pdfUrl = tab.url;
    pdfBanner.hidden = false;
  } catch {
    // activeTab may be unavailable if the popup was opened outside the toolbar.
  }
}

function openPdfHome() {
  chrome.tabs
    .create({ url: chrome.runtime.getURL('pdfviewer.html') })
    .then(() => window.close())
    .catch((error) =>
      setInputStatus(t(`无法打开阅读器：${error.message}`, `Could not open reader: ${error.message}`), true),
    );
}

async function openPdfReader() {
  if (!pdfUrl) return;
  let url;
  try {
    url = new URL(pdfUrl);
  } catch {
    setInputStatus(t('无法识别当前 PDF 地址。', 'Could not recognize the current PDF URL.'), true);
    return;
  }
  if (!/^https?:$/.test(url.protocol)) {
    setInputStatus(
      t(
        '本地 PDF 请先允许扩展访问文件 URL，或使用粘贴模式。',
        'For local PDFs, allow file URL access in the extension, or use paste mode.',
      ),
      true,
    );
    return;
  }

  // Host permission is requested inside the reader, so this still works even if
  // the browser closes the popup while showing a permission prompt.
  try {
    await chrome.tabs.create({
      url: `${chrome.runtime.getURL('pdfviewer.html')}?file=${encodeURIComponent(pdfUrl)}`,
    });
    window.close();
  } catch (error) {
    setInputStatus(t(`无法打开阅读器：${error.message}`, `Could not open reader: ${error.message}`), true);
  }
}

async function init() {
  try {
    settings = { ...settings, ...(await loadSettings()) };
  } catch {
    // Keep defaults; the background will report configuration errors.
  }
  i18n = makeI18n(settings.uiLanguage);
  localizeDom(document.documentElement, i18n.lang);
  updateConfigUi();
  updateMode('translate');
  updateCharCount();
  bindEvents();
  detectActivePdf();
  sourceInput.focus();
}

init();
