/* ScholarLens 偏好页脚本：由 Zotero.PreferencePanes.register 在设置页上下文中加载。
 *
 * 重要：Zotero 的 _loadPane() 会先执行本脚本、再把面板 DOM 插入文档，
 * 所以脚本加载时 getElementById 拿到的都是 null。必须等面板 DOM
 * 插入后（MutationObserver 检测）再绑定事件与填充值。
 *
 * 本脚本运行在以偏好页窗口为原型的沙箱里，Zotero / window / document 可用。
 * 直接读写 Zotero.Prefs（分支 extensions.zotero.scholarlens.*），
 * 不依赖 Zotero.ScholarLens 插件实例。
 */

(function () {
  const doc = window.document;
  const PREFIX = 'extensions.zotero.scholarlens.';

  const STRING_KEYS = ['apiBase', 'apiKey', 'model', 'targetLanguage', 'customPrompt'];
  const ALL_KEYS = ['apiBase', 'apiKey', 'model', 'targetLanguage', 'temperature', 'customPrompt'];
  const DEFAULTS = {
    apiBase: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    targetLanguage: '简体中文',
    temperature: 0.2,
    customPrompt: '',
  };

  const PRESETS = {
    'scholarlens-preset-deepseek': {
      apiBase: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      label: 'DeepSeek',
    },
    'scholarlens-preset-openai': {
      apiBase: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      label: 'OpenAI',
    },
    'scholarlens-preset-ollama': {
      apiBase: 'http://localhost:11434/v1',
      model: 'llama3.1',
      label: '本地 Ollama',
    },
  };

  function $(id) {
    return doc.getElementById(`scholarlens-${id}`);
  }

  function getVal(key) {
    try {
      const value = Zotero.Prefs.get(PREFIX + key, true);
      if (value === undefined || value === null || value === '') return DEFAULTS[key];
      return STRING_KEYS.includes(key) ? String(value) : Number(value);
    } catch {
      return DEFAULTS[key];
    }
  }

  function setVal(key, value) {
    if (STRING_KEYS.includes(key)) {
      Zotero.Prefs.set(PREFIX + key, String(value ?? ''), true);
    } else {
      const num = Number(value);
      Zotero.Prefs.set(PREFIX + key, Number.isFinite(num) ? num : 0, true);
    }
  }

  function setStatus(text, isError) {
    const status = $('test-status');
    if (!status) return;
    status.value = text;
    status.style.color = isError ? '#b62324' : '';
  }

  function load() {
    for (const key of ALL_KEYS) {
      const input = $(key);
      if (!input) continue;
      input.value = getVal(key);
    }
  }

  function save(key) {
    const input = $(key);
    if (!input) return;
    try {
      setVal(key, input.value);
    } catch (error) {
      Zotero.logError(error);
      setStatus(`保存失败：${error?.message || error}`, true);
    }
  }

  function saveAll() {
    for (const key of ALL_KEYS) save(key);
  }

  function normalizeApiBase(value) {
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
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  }

  function chatCompletionsUrl(apiBase) {
    const base = normalizeApiBase(apiBase);
    return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
  }

  async function testConnection() {
    saveAll();
    const apiBase = getVal('apiBase');
    const apiKey = String(getVal('apiKey') || '').trim();
    const model = String(getVal('model') || '').trim();
    if (!model) throw new Error('尚未填写模型名称');
    if (!apiKey) throw new Error('尚未填写 API Key（本地 Ollama 可留空）');
    const url = chatCompletionsUrl(apiBase);
    const controller = new window.AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await window.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey.replace(/^Bearer\s+/i, '')}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '你是连接测试助手，只回复"OK"。' },
            { role: 'user', content: '请只回复 OK' },
          ],
          temperature: 0,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 200);
        throw new Error(`HTTP ${response.status}${detail ? `：${detail}` : ''}`);
      }
      const data = await response.json().catch(() => null);
      const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.delta?.content || '';
      if (!content) throw new Error('连接成功，但接口没有返回测试内容');
      return `连接成功，模型响应：${String(content).slice(0, 80)}`;
    } finally {
      window.clearTimeout(timer);
    }
  }

  /** 等面板 DOM 插入偏好页文档后再初始化（_loadPane 先跑脚本后插 DOM）。 */
  function whenPaneReady(callback) {
    if (doc.getElementById('scholarlens-apiBase')) {
      callback();
      return;
    }
    const observer = new MutationObserver(() => {
      if (doc.getElementById('scholarlens-apiBase')) {
        observer.disconnect();
        callback();
      }
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  }

  function init() {
    load();

    for (const key of ALL_KEYS) {
      const input = $(key);
      input?.addEventListener('change', () => save(key));
    }

    for (const [buttonId, preset] of Object.entries(PRESETS)) {
      const button = doc.getElementById(buttonId);
      button?.addEventListener('command', () => {
        if (preset.apiBase) $('apiBase').value = preset.apiBase;
        if (preset.model) $('model').value = preset.model;
        saveAll();
        setStatus(`已应用预设：${preset.label}`);
      });
    }

    doc.getElementById('scholarlens-test')?.addEventListener('command', async () => {
      setStatus('正在测试…');
      try {
        setStatus(await testConnection());
      } catch (error) {
        const aborted = error?.name === 'AbortError';
        setStatus(aborted ? '测试超时，请检查网络。' : `失败：${error?.message || error}`, true);
      }
    });
  }

  whenPaneReady(init);
})();
