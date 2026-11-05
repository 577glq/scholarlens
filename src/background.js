import {
  chatCompletionsUrl,
  loadSettings,
  normalizeApiBase,
  originPattern,
  publicSettings,
} from './lib/config.js';
import { buildMessages } from './lib/prompt.js';

const PORT_NAME = 'scholarlens-translate';
const REQUEST_TIMEOUT_MS = 120_000;

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isLoopback(apiBase) {
  try {
    const host = new URL(apiBase).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

async function requireHostPermission(apiBase) {
  const pattern = originPattern(apiBase);
  const granted = await chrome.permissions.contains({ origins: [pattern] });
  if (!granted) {
    throw new AppError(
      'HOST_PERMISSION',
      `尚未授予访问 ${new URL(apiBase).host} 的权限。请打开设置页，点击“保存设置”并在浏览器提示中允许访问。`,
    );
  }
}

function authHeaders(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return {};
  return { Authorization: `Bearer ${key.replace(/^Bearer\s+/i, '')}` };
}

function validateConfig(settings) {
  const apiBase = normalizeApiBase(settings.apiBase);
  if (!settings.model || !String(settings.model).trim()) {
    throw new AppError('CONFIG', '尚未填写模型名称。');
  }
  if (!settings.apiKey?.trim() && !isLoopback(apiBase)) {
    throw new AppError('NO_KEY', '尚未填写 API Key。点击“打开设置”完成配置后再试。');
  }
  return { apiBase, model: String(settings.model).trim() };
}

function friendlyHttpError(status, detail) {
  let apiMessage = '';
  try {
    const parsed = JSON.parse(detail);
    apiMessage = parsed?.error?.message || parsed?.message || '';
  } catch {
    apiMessage = String(detail || '').trim().slice(0, 300);
  }
  const suffix = apiMessage ? `\n接口返回：${apiMessage}` : '';
  if (status === 401) return new AppError('AUTH', `API Key 无效或已失效，请在设置中检查。${suffix}`);
  if (status === 402) return new AppError('BILLING', `账户余额不足或额度已用尽。${suffix}`);
  if (status === 403) return new AppError('FORBIDDEN', `当前 API Key 无权访问该模型或接口。${suffix}`);
  if (status === 404) return new AppError('NOT_FOUND', `接口不存在。请检查 Base URL 是否应包含 /v1，以及模型名称是否正确。${suffix}`);
  if (status === 429) return new AppError('RATE_LIMIT', `请求过于频繁或达到限流额度，请稍后再试。${suffix}`);
  if (status >= 500) return new AppError('UPSTREAM', `翻译服务暂时不可用（HTTP ${status}），请稍后重试。${suffix}`);
  return new AppError('HTTP', `请求失败（HTTP ${status}）。${suffix}`);
}

async function readErrorBody(response) {
  try {
    return (await response.text()).slice(0, 1200);
  } catch {
    return '';
  }
}

function networkError(error, apiBase) {
  if (error?.name === 'AbortError') {
    return new AppError('TIMEOUT', '请求超时。请检查网络，或稍后重试。');
  }
  if (error instanceof AppError) return error;
  const host = (() => {
    try {
      return new URL(apiBase).host;
    } catch {
      return 'API 服务';
    }
  })();
  return new AppError(
    'NETWORK',
    `无法连接 ${host}。请检查 Base URL、网络或代理；自定义接口还需在设置页保存并授予域名访问权限。\n技术信息：${error?.message || '网络错误'}`,
  );
}

async function parseErrorResponse(response) {
  throw friendlyHttpError(response.status, await readErrorBody(response));
}

function createRequest(settings, messages, stream) {
  const { apiBase, model } = validateConfig(settings);
  const body = {
    model,
    messages,
    temperature: Number.isFinite(Number(settings.temperature)) ? Number(settings.temperature) : 0.2,
    stream,
  };
  return {
    apiBase,
    url: chatCompletionsUrl(apiBase),
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: stream ? 'text/event-stream' : 'application/json',
        ...authHeaders(settings.apiKey),
      },
      body: JSON.stringify(body),
    },
  };
}

function extractSseDelta(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const choice = payload.choices?.[0];
  return choice?.delta?.content || choice?.message?.content || '';
}

async function streamChat({ settings, messages, signal, onDelta }) {
  const { apiBase, url, init } = createRequest(settings, messages, true);
  let response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    throw networkError(error, apiBase);
  }
  if (!response.ok) await parseErrorResponse(response);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !response.body) {
    const data = await response.json().catch(async () => {
      throw new AppError('BAD_RESPONSE', '接口返回了无法解析的内容。请确认该地址兼容 OpenAI Chat Completions。');
    });
    const content = extractSseDelta(data);
    if (!content) throw new AppError('EMPTY', '接口返回了空内容。');
    onDelta(content);
    return { text: content, usage: data.usage || null };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let usage = null;
  let finished = false;

  const handleBlock = (block) => {
    const dataLines = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
    if (!dataLines.length) return;
    const data = dataLines.join('\n').trim();
    if (!data) return;
    if (data === '[DONE]') {
      finished = true;
      return;
    }
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (payload.usage) usage = payload.usage;
    if (payload.error) {
      const message = payload.error.message || '翻译接口返回错误。';
      throw new AppError('UPSTREAM', message);
    }
    const delta = extractSseDelta(payload);
    if (delta) {
      full += delta;
      onDelta(delta);
    }
    if (payload.choices?.[0]?.finish_reason) finished = true;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      handleBlock(block);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleBlock(buffer.replace(/\r\n/g, '\n'));
  if (!full.trim()) {
    throw new AppError('EMPTY', finished ? '接口返回了空译文，请重试。' : '连接提前结束，未收到译文，请重试。');
  }
  return { text: full, usage };
}

async function testConnection(config) {
  const settings = { ...config, temperature: 0 };
  const messages = [
    { role: 'system', content: '你是连接测试助手，只回复“OK”。' },
    { role: 'user', content: '请只回复 OK' },
  ];
  const { apiBase, url, init } = createRequest(settings, messages, false);
  await requireHostPermission(apiBase);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal }).catch((error) => {
      throw networkError(error, apiBase);
    });
    if (!response.ok) await parseErrorResponse(response);
    const data = await response.json().catch(() => null);
    const content = extractSseDelta(data);
    if (!content) throw new AppError('EMPTY', '连接成功，但接口没有返回测试内容。');
    return { ok: true, message: `连接成功，模型响应：${String(content).slice(0, 80)}` };
  } finally {
    clearTimeout(timer);
  }
}

function sendPort(port, message) {
  try {
    port.postMessage(message);
  } catch {
    // The page navigated away or closed the panel; nothing left to notify.
  }
}

async function handleTranslatePort(port) {
  let controller = null;
  let started = false;

  port.onDisconnect.addListener(() => {
    controller?.abort();
  });

  port.onMessage.addListener(async (message) => {
    if (started || message?.type !== 'translate') return;
    started = true;
    const requestId = message.requestId;
    controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const settings = await loadSettings();
      const { apiBase } = validateConfig(settings);
      await requireHostPermission(apiBase);
      const messages = buildMessages({
        text: message.text,
        mode: message.mode,
        targetLanguage: settings.targetLanguage,
        customPrompt: settings.customPrompt,
        formulaCount: message.formulaCount,
      });
      const result = await streamChat({
        settings,
        messages,
        signal: controller.signal,
        onDelta: (delta) => sendPort(port, { type: 'delta', requestId, delta }),
      });
      sendPort(port, { type: 'done', requestId, text: result.text, usage: result.usage });
    } catch (error) {
      const appError = error instanceof AppError ? error : networkError(error, message?.apiBase || '');
      sendPort(port, {
        type: 'error',
        requestId,
        code: appError.code || 'UNKNOWN',
        message: appError.message || '翻译失败，请重试。',
      });
    } finally {
      clearTimeout(timer);
      try {
        port.disconnect();
      } catch {
        // Already disconnected.
      }
    }
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  handleTranslatePort(port);
});

function isExtensionPage(sender) {
  return Boolean(sender?.url?.startsWith(chrome.runtime.getURL('')));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'open-options') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'get-public-settings') {
    loadSettings()
      .then((settings) => sendResponse({ ok: true, settings: publicSettings(settings) }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === 'test-connection') {
    if (!isExtensionPage(sender)) {
      sendResponse({ ok: false, message: '不允许从网页发起连接测试。' });
      return false;
    }
    testConnection(message.settings || {})
      .then((result) => sendResponse(result))
      .catch((error) => {
        const appError = error instanceof AppError ? error : networkError(error, message.settings?.apiBase || '');
        sendResponse({ ok: false, code: appError.code, message: appError.message });
      });
    return true;
  }

  return false;
});

function installContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'scholarlens-translate',
      title: 'ScholarLens：翻译选中内容',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'scholarlens-explain',
      title: 'ScholarLens：解释选中内容 / 公式',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'scholarlens-settings',
      title: 'ScholarLens：打开设置',
      contexts: ['action'],
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  installContextMenus();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') }).catch(() => {
      chrome.runtime.openOptionsPage();
    });
  }
});

chrome.runtime.onStartup.addListener(installContextMenus);

function showUnsupportedBadge(tabId) {
  chrome.action.setBadgeBackgroundColor({ color: '#A14A32' });
  chrome.action.setBadgeText({ text: '!', tabId });
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId }).catch(() => {}), 2500);
}

async function dispatchCommand(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return false;
  const message = { type: 'scholarlens-command', mode };
  let delivered = false;
  try {
    await chrome.tabs.sendMessage(tab.id, message, { frameId: 0 });
    delivered = true;
  } catch {
    // The active tab may be an extension page (for example our own PDF reader).
  }
  if (!delivered) {
    try {
      await chrome.runtime.sendMessage(message);
      delivered = true;
    } catch {
      // No extension page or content script is listening.
    }
  }
  return delivered;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'scholarlens-settings') {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (!tab?.id) return;
  const mode = info.menuItemId === 'scholarlens-explain' ? 'explain' : 'translate';
  const delivered = await dispatchCommand(mode);
  if (!delivered) showUnsupportedBadge(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (!['translate-selection', 'explain-selection'].includes(command)) return;
  await dispatchCommand(command === 'explain-selection' ? 'explain' : 'translate');
});
