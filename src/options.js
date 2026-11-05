import {
  DEFAULT_SETTINGS,
  loadSettings,
  normalizeApiBase,
  originPattern,
  saveSettings,
} from './lib/config.js';
import { localizeDom, makeI18n } from './lib/i18n.js';

const PRESETS = {
  deepseek: {
    apiBase: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    hintZh: 'DeepSeek 官方接口。模型可选 deepseek-chat 或 deepseek-reasoner。',
    hintEn: 'Official DeepSeek API. Use deepseek-chat or deepseek-reasoner.',
  },
  openai: {
    apiBase: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    hintZh: 'OpenAI 官方接口。也可以填写任何兼容 OpenAI 的代理地址。',
    hintEn: 'Official OpenAI API. You can also use any OpenAI-compatible proxy.',
  },
  ollama: {
    apiBase: 'http://localhost:11434/v1',
    model: 'qwen3:8b',
    hintZh: '本地 Ollama：API Key 可以留空，模型名需与本机已安装的模型一致。',
    hintEn: 'Local Ollama: the API key can be blank. Use a model installed on this machine.',
  },
};

const $ = (id) => document.getElementById(id);
const form = $('settingsForm');
const apiBaseInput = $('apiBase');
const apiKeyInput = $('apiKey');
const modelInput = $('model');
const targetInput = $('targetLanguage');
const customPromptInput = $('customPrompt');
const temperatureInput = $('temperature');
const showBubbleInput = $('showBubble');
const formStatus = $('formStatus');
const testResult = $('testResult');
const testButton = $('testButton');
const saveButton = $('saveButton');
const configStatus = $('configStatus');
const configStatusText = $('configStatusText');
const setupNotice = $('setupNotice');
const uiLanguageSelect = $('uiLanguage');

let busy = false;
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

function hasKey(value) {
  return Boolean(String(value || '').trim());
}

function updateTemperatureLabel() {
  $('temperatureValue').textContent = Number(temperatureInput.value).toFixed(1);
}

function setStatus(message, type = '', target = formStatus) {
  target.textContent = message;
  target.classList.remove('is-success', 'is-error', 'is-warning');
  if (type) target.classList.add(`is-${type}`);
}

function setConfigStatus(settings, keyPresentOverride) {
  const keyPresent = keyPresentOverride ?? hasKey(settings.apiKey);
  const local = isLoopback(settings.apiBase);
  let text;
  let type;
  if (keyPresent) {
    text = t(`已配置 · ${settings.model || '未命名模型'}`, `Configured · ${settings.model || 'Unnamed model'}`);
    type = 'is-ready';
  } else if (local) {
    text = t('本地接口 · API Key 可留空', 'Local endpoint · API key optional');
    type = 'is-ready';
  } else {
    text = t('未配置 API Key', 'API key not configured');
    type = 'is-missing';
  }
  configStatusText.textContent = text;
  configStatus.classList.remove('is-ready', 'is-missing');
  configStatus.classList.add(type);
  setupNotice.hidden = keyPresent || local;
}

function fillForm(settings) {
  apiBaseInput.value = settings.apiBase || DEFAULT_SETTINGS.apiBase;
  apiKeyInput.value = settings.apiKey || '';
  modelInput.value = settings.model || DEFAULT_SETTINGS.model;
  targetInput.value = settings.targetLanguage || DEFAULT_SETTINGS.targetLanguage;
  customPromptInput.value = settings.customPrompt || '';
  temperatureInput.value = String(settings.temperature ?? DEFAULT_SETTINGS.temperature);
  showBubbleInput.checked = settings.showBubble !== false;
  uiLanguageSelect.value = settings.uiLanguage || DEFAULT_SETTINGS.uiLanguage;
  updateTemperatureLabel();
  updateLanguageChips();
}

function updateLanguageChips() {
  const value = targetInput.value.trim();
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.language === value);
  });
}

function readForm({ requireKey = false } = {}) {
  const apiBase = normalizeApiBase(apiBaseInput.value);
  const model = modelInput.value.trim();
  const targetLanguage = targetInput.value.trim() || DEFAULT_SETTINGS.targetLanguage;
  const apiKey = apiKeyInput.value.trim();

  if (!model) throw new Error(t('请填写模型名称。', 'Enter a model name.'));
  if (requireKey && !apiKey && !isLoopback(apiBase)) {
    throw new Error(
      t(
        '请先填写 API Key，或在 Base URL 中使用本地服务地址。',
        'Enter an API key, or use a local service URL as the Base URL.',
      ),
    );
  }
  const temperature = Math.min(1, Math.max(0, Number(temperatureInput.value) || 0));
  return {
    apiBase,
    apiKey,
    model,
    targetLanguage: targetLanguage.slice(0, 60),
    customPrompt: customPromptInput.value.trim().slice(0, 3000),
    temperature,
    showBubble: showBubbleInput.checked,
    uiLanguage: uiLanguageSelect.value,
  };
}

async function ensurePermission(apiBase) {
  const pattern = originPattern(apiBase);
  const hasPermission = await chrome.permissions.contains({ origins: [pattern] });
  if (hasPermission) return { ok: true, pattern };
  try {
    const granted = await chrome.permissions.request({ origins: [pattern] });
    return { ok: Boolean(granted), pattern };
  } catch (error) {
    return { ok: false, pattern, error: error.message };
  }
}

async function handleSave(event) {
  event.preventDefault();
  if (busy) return;
  let payload;
  try {
    payload = readForm();
  } catch (error) {
    setStatus(error.message, 'is-error');
    return;
  }

  busy = true;
  saveButton.disabled = true;
  saveButton.textContent = t('保存中…', 'Saving…');
  setStatus(t('正在保存…', 'Saving…'));

  let permission;
  try {
    permission = await ensurePermission(payload.apiBase);
  } catch (error) {
    permission = { ok: false, error: error.message };
  }

  try {
    await saveSettings(payload);
    i18n = makeI18n(payload.uiLanguage);
    if (payload.uiLanguage !== 'auto') {
      localizeDom(document.documentElement, i18n.lang);
    }
    setConfigStatus(payload);
    if (permission.ok) {
      setStatus(
        t('设置已保存。回到论文页面即可使用，无需刷新。', 'Settings saved. Return to the paper; no refresh needed.'),
        'is-success',
      );
    } else {
      setStatus(
        t(
          `设置已保存，但浏览器未授予 ${new URL(payload.apiBase).host} 的访问权限。请再次点击“保存设置”并允许权限，否则无法调用接口。`,
          `Settings saved, but access to ${new URL(payload.apiBase).host} was not granted. Save again and allow access, or API calls will fail.`,
        ),
        'is-warning',
      );
    }
    testResult.textContent = '';
    testResult.classList.remove('is-success', 'is-error');
  } catch (error) {
    setStatus(t(`保存失败：${error.message}`, `Save failed: ${error.message}`), 'is-error');
  } finally {
    busy = false;
    saveButton.disabled = false;
    saveButton.textContent = t('保存设置', 'Save settings');
  }
}

async function handleTest() {
  if (busy) return;
  let payload;
  try {
    payload = readForm({ requireKey: true });
  } catch (error) {
    setStatus(error.message, 'is-error');
    return;
  }

  busy = true;
  testButton.disabled = true;
  testButton.textContent = t('测试中…', 'Testing…');
  setStatus(t('正在测试连接…', 'Testing connection…'));
  testResult.textContent = '';
  testResult.classList.remove('is-success', 'is-error');

  try {
    const permission = await ensurePermission(payload.apiBase);
    if (!permission.ok) {
      throw new Error(
        t(
          `浏览器未授予 ${new URL(payload.apiBase).host} 的访问权限。请点击“测试连接”后允许权限，或重新保存设置。`,
          `Access to ${new URL(payload.apiBase).host} was not granted. Click Test connection again and allow access, or save settings again.`,
        ),
      );
    }
    const response = await chrome.runtime.sendMessage({ type: 'test-connection', settings: payload });
    if (!response?.ok) throw new Error(response?.message || t('连接测试失败。', 'Connection test failed.'));
    testResult.textContent =
      i18n.lang === 'en' ? 'Connection successful.' : response.message || '连接成功。';
    testResult.classList.add('is-success');
    setStatus(t('连接测试通过，可以开始翻译。', 'Connection works. You can start translating.'), 'is-success');
  } catch (error) {
    testResult.textContent = error.message || t('连接测试失败。', 'Connection test failed.');
    testResult.classList.add('is-error');
    setStatus(t('连接测试未通过。', 'Connection test failed.'), 'is-error');
  } finally {
    busy = false;
    testButton.disabled = false;
    testButton.textContent = t('测试连接', 'Test connection');
  }
}

function revealApiKey() {
  const revealButton = $('revealKey');
  const showing = apiKeyInput.type === 'text';
  apiKeyInput.type = showing ? 'password' : 'text';
  revealButton.textContent = showing ? t('显示', 'Show') : t('隐藏', 'Hide');
  revealButton.setAttribute('aria-label', showing ? t('显示 API Key', 'Show API key') : t('隐藏 API Key', 'Hide API key'));
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  apiBaseInput.value = preset.apiBase;
  modelInput.value = preset.model;
  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.preset === name);
  });
  setStatus(i18n.lang === 'en' ? preset.hintEn : preset.hintZh);
  updateConfigStatusFromInputs();
}

function updateConfigStatusFromInputs() {
  let apiBase = apiBaseInput.value;
  try {
    apiBase = normalizeApiBase(apiBase);
  } catch {
    // Keep the raw value for the local-service check.
  }
  setConfigStatus(
    { apiBase, model: modelInput.value.trim(), apiKey: apiKeyInput.value },
    hasKey(apiKeyInput.value),
  );
}

function resetDefaults() {
  const preservedKey = apiKeyInput.value;
  fillForm({ ...DEFAULT_SETTINGS, apiKey: preservedKey });
  document.querySelectorAll('[data-preset]').forEach((button) => button.classList.remove('is-active'));
  setStatus(
    t(
      '已恢复默认偏好，API Key 已保留。点击“保存设置”后生效。',
      'Defaults restored. Your API key was kept. Click Save settings to apply.',
    ),
    'is-warning',
  );
  updateConfigStatusFromInputs();
}

function closeWelcome() {
  $('welcome').hidden = true;
  const url = new URL(window.location.href);
  url.searchParams.delete('welcome');
  history.replaceState({}, '', url);
}

async function init() {
  $('version').textContent = chrome.runtime.getManifest().version;
  let settings;
  try {
    settings = await loadSettings();
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  i18n = makeI18n(settings.uiLanguage);
  fillForm(settings);
  localizeDom(document.documentElement, i18n.lang);
  setConfigStatus(settings);

  const params = new URLSearchParams(window.location.search);
  if (params.has('welcome')) {
    $('welcome').hidden = false;
  }

  form.addEventListener('submit', handleSave);
  testButton.addEventListener('click', handleTest);
  $('revealKey').addEventListener('click', revealApiKey);
  $('resetButton').addEventListener('click', resetDefaults);
  $('welcomeClose').addEventListener('click', closeWelcome);
  temperatureInput.addEventListener('input', updateTemperatureLabel);

  uiLanguageSelect.addEventListener('change', () => {
    i18n = makeI18n(uiLanguageSelect.value);
    localizeDom(document.documentElement, i18n.lang);
    setConfigStatus(
      { apiBase: apiBaseInput.value, model: modelInput.value, apiKey: apiKeyInput.value },
      hasKey(apiKeyInput.value),
    );
    setStatus('');
  });

  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => applyPreset(button.dataset.preset));
  });

  document.querySelectorAll('[data-language]').forEach((button) => {
    button.addEventListener('click', () => {
      targetInput.value = button.dataset.language;
      updateLanguageChips();
    });
  });

  targetInput.addEventListener('input', updateLanguageChips);
  apiBaseInput.addEventListener('change', () => {
    document.querySelectorAll('[data-preset]').forEach((button) => button.classList.remove('is-active'));
  });
  modelInput.addEventListener('change', () => {
    document.querySelectorAll('[data-preset]').forEach((button) => button.classList.remove('is-active'));
  });
}

init().catch((error) => {
  setStatus(t(`设置页加载失败：${error.message}`, `Settings page failed to load: ${error.message}`), 'is-error');
});
