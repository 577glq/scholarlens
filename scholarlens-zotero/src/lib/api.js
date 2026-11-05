/* 从 ScholarLens src/background.js 移植的网络层。
 * 剥离 chrome.runtime 端口消息与 host 权限检查（Zotero 特权上下文无 CORS 限制），
 * fetch / AbortController 由 bootstrap 注入到 loadSubScript scope。
 */

import { buildMessages } from './prompt.js';
import { chatCompletionsUrl, getSettings, normalizeApiBase } from './prefs.js';

const REQUEST_TIMEOUT_MS = 120000;

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

function authHeaders(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return {};
  return { Authorization: `Bearer ${key.replace(/^Bearer\s+/i, '')}` };
}

function validateConfig(settings) {
  const apiBase = normalizeApiBase(settings.apiBase);
  if (!settings.model || !String(settings.model).trim()) {
    throw new AppError('CONFIG', '尚未填写模型名称。请打开 Zotero 设置 → ScholarLens 完成配置。');
  }
  if (!settings.apiKey?.trim() && !isLoopback(apiBase)) {
    throw new AppError('NO_KEY', '尚未填写 API Key。请打开 Zotero 设置 → ScholarLens 完成配置。');
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
    return new AppError('ABORTED', '已停止。');
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
    `无法连接 ${host}。请检查 Base URL、网络或代理。\n技术信息：${error?.message || '网络错误'}`,
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

export async function streamChat({ settings, messages, signal, onDelta }) {
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
      throw new AppError('UPSTREAM', payload.error.message || '翻译接口返回错误。');
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

export async function testConnection(config) {
  const settings = { ...config, temperature: 0 };
  const messages = [
    { role: 'system', content: '你是连接测试助手，只回复“OK”。' },
    { role: 'user', content: '请只回复 OK' },
  ];
  const { url, init } = createRequest(settings, messages, false);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal }).catch((error) => {
      throw networkError(error, settings.apiBase);
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

export { AppError, REQUEST_TIMEOUT_MS, getSettings };
