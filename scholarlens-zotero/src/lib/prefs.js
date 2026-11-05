/* 设置存取：ScholarLens 的 chrome.storage → Zotero.Prefs（分支 extensions.zotero.scholarlens.*）。
 * 注意：Zotero.Prefs.get/set 默认操作 extensions.zotero 分支。
 */

export const PREF_BRANCH = 'extensions.zotero.scholarlens.';

export const DEFAULT_SETTINGS = {
  apiBase: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  targetLanguage: '简体中文',
  temperature: 0.2,
  customPrompt: '',
};

const STRING_KEYS = new Set(['apiBase', 'apiKey', 'model', 'targetLanguage', 'customPrompt']);

export function getSettings() {
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    try {
      const value = Zotero.Prefs.get(PREF_BRANCH + key, true);
      if (value !== undefined && value !== null && value !== '') {
        settings[key] = STRING_KEYS.has(key) ? String(value) : Number(value);
      }
    } catch {
      // 未设置过的 pref 会抛错，保留默认值
    }
  }
  return settings;
}

export function setSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`未知设置项：${key}`);
  if (STRING_KEYS.has(key)) {
    Zotero.Prefs.set(PREF_BRANCH + key, String(value ?? ''), true);
  } else {
    Zotero.Prefs.set(PREF_BRANCH + key, Number(value) || 0, true);
  }
}

/* ---- 以下纯函数来自 ScholarLens src/lib/config.js，原样保留 ---- */

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
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname}`;
}

export function chatCompletionsUrl(apiBase) {
  const base = normalizeApiBase(apiBase);
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
}
