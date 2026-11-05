export const DEFAULT_SETTINGS = {
  apiBase: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  targetLanguage: '简体中文',
  temperature: 0.2,
  customPrompt: '',
  showBubble: true,
  uiLanguage: 'auto',
};

export const SETTINGS_KEY = 'scholarlensSettings';

export async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored?.[SETTINGS_KEY] || {}) };
}

export async function saveSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

export function normalizeApiBase(value) {
  const raw = (value || '').trim();
  if (!raw) throw new Error('API 地址不能为空');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('API 地址格式不正确，应类似 https://api.deepseek.com/v1');
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('API 地址必须使用 http:// 或 https://');
  }
  url.hash = '';
  url.search = '';
  let pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname}`;
}

export function chatCompletionsUrl(apiBase) {
  const base = normalizeApiBase(apiBase);
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
}

export function originPattern(apiBase) {
  const url = new URL(apiBase);
  return `${url.protocol}//${url.host}/*`;
}

export function publicSettings(settings) {
  return {
    hasApiKey: Boolean(settings.apiKey && settings.apiKey.trim()),
    targetLanguage: settings.targetLanguage,
    showBubble: settings.showBubble !== false,
    model: settings.model,
    uiLanguage: settings.uiLanguage || 'auto',
  };
}
