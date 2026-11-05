import {
  extractFromPlainText,
  extractFromRange,
  getFocusSelectionText,
  selectionRect,
} from './lib/extract.js';
import { renderMarkdown, renderSingleFormula } from './lib/markdown.js';
import { SETTINGS_KEY } from './lib/config.js';
import { localizeDom, makeI18n } from './lib/i18n.js';
import panelCss from './content/panel.css';

globalThis.__ScholarLensI18n = { localizeDom, makeI18n };

const HOST_ID = 'scholarlens-root';
const PORT_NAME = 'scholarlens-translate';
const DEFAULT_SETTINGS = {
  hasApiKey: false,
  targetLanguage: '简体中文',
  showBubble: true,
  uiLanguage: 'auto',
};

const ICONS = {
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.35.7.6 1 .3.3.7.45 1.1.45H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"></path></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>',
  copy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>',
  retry:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.4 6.4"></path><path d="M20 5v6h-6"></path></svg>',
  stop:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>',
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function normalizeFormulaPlaceholders(text, formulas) {
  const ids = new Set(formulas.map((formula) => formula.id));
  return String(text || '').replace(
    /⟦\s*M\s*(\d+)\s*⟧|\[\[\s*M\s*(\d+)\s*\]\]|[【〖]\s*M\s*(\d+)\s*[】〗]/gi,
    (whole, a, b, c) => {
      const id = Number(a || b || c);
      return ids.has(id) ? `⟦M${id}⟧` : whole;
    },
  );
}

function cleanModelOutput(raw, formulas) {
  let text = String(raw || '').replace(/\u200b/g, '').trim();
  if (!text) return '';

  const fenced = text.match(/^```(?:markdown|md|latex|tex)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (fenced) text = fenced[1].trim();

  text = text.replace(/^(?:\*\*)?(?:译文|翻译结果|翻译|解释结果|解释)(?:\*\*)?\s*[:：]\s*\n?/i, '');
  text = text.replace(/^(?:好的[，,]\s*)?(?:以下是|这是).{0,24}(?:译文|翻译|解释)\s*[:：]?\s*$/im, '');
  text = normalizeFormulaPlaceholders(text, formulas);
  return text.trim();
}

function markdownWithLatex(text, formulas) {
  const map = new Map(formulas.map((formula) => [formula.id, formula]));
  return String(text || '').replace(/⟦M(\d+)⟧/g, (whole, rawId) => {
    const formula = map.get(Number(rawId));
    if (!formula) return whole;
    return formula.display ? `\n\n$$\n${formula.latex}\n$$\n\n` : ` $${formula.latex}$ `;
  });
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API can be blocked by page permissions; use the legacy path.
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
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

class ScholarLensApp {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.pendingContext = null;
    this.session = null;
    this.currentRequest = null;
    this.toastTimer = null;
    this.previewTimer = null;
    this.bubbleVisible = false;
    this.host = null;
    this.shadow = null;
    this.lastCommandAt = 0;
    this.i18n = makeI18n('auto');
    this.lang = this.i18n.lang;
  }

  t(zh, en) {
    return this.i18n.t(zh, en);
  }

  async init() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'get-public-settings' }).catch(() => null);
      if (response?.ok && response.settings) {
        this.settings = { ...DEFAULT_SETTINGS, ...response.settings };
      }
    } catch {
      // Defaults are good enough if the service worker is waking up.
    }
    this.mount();
    this.i18n = makeI18n(this.settings.uiLanguage);
    this.lang = this.i18n.lang;
    localizeDom(this.shadow, this.lang);
    this.bindEvents();
    this.bindExtensionEvents();
    this.updateTargetLabel();
  }

  mount() {
    document.getElementById(HOST_ID)?.remove();
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.setProperty('position', 'fixed', 'important');
    host.style.setProperty('inset', '0', 'important');
    host.style.setProperty('width', '0', 'important');
    host.style.setProperty('height', '0', 'important');
    host.style.setProperty('z-index', '2147483647', 'important');
    host.style.setProperty('pointer-events', 'none', 'important');
    host.style.setProperty('display', 'block', 'important');
    document.documentElement.appendChild(host);
    this.host = host;
    const shadow = host.attachShadow({ mode: 'open' });
    this.shadow = shadow;

    const katexLink = document.createElement('link');
    katexLink.rel = 'stylesheet';
    katexLink.href = chrome.runtime.getURL('vendor/katex.min.css');
    const style = document.createElement('style');
    style.textContent = panelCss;

    const layer = document.createElement('div');
    layer.className = 'sl-layer';
    layer.innerHTML = `
      <div class="sl-bubble" hidden role="toolbar" aria-label="ScholarLens 划词操作">
        <span class="sl-bubble-mark" aria-hidden="true">S</span>
        <button class="sl-bubble-btn" type="button" data-role="bubble-translate">翻译</button>
        <button class="sl-bubble-btn" type="button" data-role="bubble-explain">解释</button>
        <span class="sl-bubble-rule" aria-hidden="true"></span>
        <button class="sl-icon-btn" type="button" data-role="settings" title="ScholarLens 设置" aria-label="打开设置">${ICONS.settings}</button>
      </div>

      <section class="sl-panel" hidden role="dialog" aria-modal="false" aria-label="ScholarLens 学术翻译">
        <header class="sl-header">
          <div class="sl-brand">
            <div class="sl-brand-mark" aria-hidden="true">S</div>
            <div>
              <div class="sl-brand-name">ScholarLens</div>
              <div class="sl-brand-sub">Academic reading companion</div>
            </div>
          </div>
          <div class="sl-header-actions">
            <button class="sl-icon-btn" type="button" data-role="panel-settings" title="设置" aria-label="打开设置">${ICONS.settings}</button>
            <button class="sl-icon-btn" type="button" data-role="close" title="关闭 (Esc)" aria-label="关闭面板">${ICONS.close}</button>
          </div>
        </header>

        <div class="sl-tabs" role="tablist" aria-label="处理方式">
          <button class="sl-tab" type="button" role="tab" data-tab="translate" aria-selected="true">翻译</button>
          <button class="sl-tab" type="button" role="tab" data-tab="explain" aria-selected="false">解释</button>
          <span class="sl-target" data-role="target">→ 简体中文</span>
        </div>

        <div class="sl-scroll" data-role="scroll">
          <div class="sl-source">
            <details>
              <summary>原文 <span class="sl-source-meta" data-role="source-meta"></span></summary>
              <div class="sl-source-body" data-role="source-body"></div>
            </details>
          </div>
          <div class="sl-result" data-role="result" aria-live="polite"></div>
          <details class="sl-formulas" data-role="formulas" hidden>
            <summary>公式对照 <span class="sl-source-meta" data-role="formula-meta"></span></summary>
            <div class="sl-formula-list" data-role="formula-list"></div>
          </details>
        </div>

        <footer class="sl-footer">
          <div class="sl-status" data-role="status">
            <span class="sl-status-dot" data-role="status-dot"></span>
            <span data-role="status-text">准备就绪</span>
          </div>
          <div class="sl-footer-actions">
            <button class="sl-action" type="button" data-role="stop" hidden>${ICONS.stop}<span>停止</span></button>
            <button class="sl-action" type="button" data-role="retry" hidden>${ICONS.retry}<span>重试</span></button>
            <button class="sl-action sl-action-primary" type="button" data-role="copy" disabled>${ICONS.copy}<span>复制 Markdown</span></button>
          </div>
        </footer>
      </section>

      <div class="sl-toast" data-role="toast" hidden></div>
    `;

    shadow.appendChild(katexLink);
    shadow.appendChild(style);
    shadow.appendChild(layer);

    this.bubble = shadow.querySelector('.sl-bubble');
    this.panel = shadow.querySelector('.sl-panel');
    this.result = shadow.querySelector('[data-role="result"]');
    this.scrollArea = shadow.querySelector('[data-role="scroll"]');
    this.sourceMeta = shadow.querySelector('[data-role="source-meta"]');
    this.sourceBody = shadow.querySelector('[data-role="source-body"]');
    this.formulasDetails = shadow.querySelector('[data-role="formulas"]');
    this.formulaMeta = shadow.querySelector('[data-role="formula-meta"]');
    this.formulaList = shadow.querySelector('[data-role="formula-list"]');
    this.statusDot = shadow.querySelector('[data-role="status-dot"]');
    this.statusText = shadow.querySelector('[data-role="status-text"]');
    this.copyButton = shadow.querySelector('[data-role="copy"]');
    this.retryButton = shadow.querySelector('[data-role="retry"]');
    this.stopButton = shadow.querySelector('[data-role="stop"]');
    this.targetLabel = shadow.querySelector('[data-role="target"]');
    this.toast = shadow.querySelector('[data-role="toast"]');

    this.header = shadow.querySelector('.sl-header');
    this.header.addEventListener('pointerdown', (event) => this.startDrag(event));
  }

  bindExtensionEvents() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type !== 'scholarlens-command') return;
      if (message.mode !== 'translate' && message.mode !== 'explain') return;
      this.handleCommand(message.mode);
    });

    document.addEventListener('scholarlens-run', (event) => {
      this.handleCommand(event.detail?.mode || 'translate');
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[SETTINGS_KEY]) return;
      const next = changes[SETTINGS_KEY].newValue || {};
      this.settings = {
        ...this.settings,
        hasApiKey: Boolean(next.apiKey?.trim()),
        targetLanguage: next.targetLanguage || '简体中文',
        showBubble: next.showBubble !== false,
        uiLanguage: next.uiLanguage || 'auto',
      };
      this.i18n = makeI18n(this.settings.uiLanguage);
      this.lang = this.i18n.lang;
      localizeDom(this.shadow, this.lang);
      if (this.settings.showBubble === false) this.hideBubble();
      this.updateTargetLabel();
    });
  }

  bindEvents() {
    this.onMouseUp = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (this.eventInsideUi(event)) return;
      setTimeout(() => {
        if (!this.settings.showBubble) return;
        const context = this.captureSelection();
        if (!context) {
          this.hideBubble();
          return;
        }
        this.showBubble(context);
      }, 0);
    };

    this.onMouseDown = (event) => {
      if (!this.eventInsideUi(event) && this.bubbleVisible) this.hideBubble();
    };

    this.onKeyUp = (event) => {
      if (this.eventInsideUi(event)) return;
      if (!event.shiftKey && !event.key.startsWith('Arrow')) return;
      if (!this.settings.showBubble) return;
      setTimeout(() => {
        const context = this.captureSelection();
        if (context) this.showBubble(context);
      }, 0);
    };

    this.onDocumentKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (this.session) this.closePanel();
      this.hideBubble();
    };

    this.onShortcutKeyDown = (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 't') return;
      if (event.composedPath?.().includes(this.host)) return;
      const active = document.activeElement;
      if (
        active &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable)
      ) {
        return;
      }
      if (!this.captureSelection()) return;
      event.preventDefault();
      event.stopPropagation();
      this.handleCommand('translate');
    };

    this.onScroll = (event) => {
      if (this.eventInsideUi(event)) return;
      if (this.bubbleVisible) this.hideBubble();
    };

    this.onResize = () => {
      this.hideBubble();
      if (!this.panel.hidden) this.clampPanelToViewport();
    };

    document.addEventListener('mouseup', this.onMouseUp, true);
    document.addEventListener('mousedown', this.onMouseDown, true);
    document.addEventListener('keyup', this.onKeyUp, true);
    document.addEventListener('keydown', this.onDocumentKeyDown, true);
    document.addEventListener('keydown', this.onShortcutKeyDown, true);
    document.addEventListener('scroll', this.onScroll, true);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pagehide', () => this.abortActiveRequest());

    const click = (role, handler) => {
      this.shadow.querySelector(`[data-role="${role}"]`)?.addEventListener('click', handler);
    };
    click('bubble-translate', () => this.chooseMode('translate'));
    click('bubble-explain', () => this.chooseMode('explain'));
    click('settings', () => this.openSettings());
    click('panel-settings', () => this.openSettings());
    click('close', () => this.closePanel());
    click('copy', () => this.copyResult());
    click('retry', () => this.retry());
    click('stop', () => this.stopGeneration());

    this.bubble.addEventListener('mousedown', (event) => event.preventDefault());

    this.shadow.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => this.switchMode(button.dataset.tab));
    });
  }

  eventInsideUi(event) {
    if (!this.host) return false;
    const path = event.composedPath?.() || [];
    return path.includes(this.host) || path.includes(this.panel) || path.includes(this.bubble);
  }

  handleCommand(mode) {
    const now = Date.now();
    if (now - this.lastCommandAt < 350) return;
    this.lastCommandAt = now;
    const context = this.captureSelection();
    if (!context) {
      this.showToast(this.t('请先在页面上选中要翻译的文字或公式', 'Select text or a formula on the page first'));
      return;
    }
    this.hideBubble();
    this.openForContext(context, mode);
  }

  captureSelection() {
    const input = getFocusSelectionText();
    if (input) {
      const rect = input.element.getBoundingClientRect();
      const preview = input.value.replace(/\s+/g, ' ').trim();
      if (!preview) return null;
      const bounds = {
        left: rect.left + 10,
        right: rect.right - 10,
        top: rect.top,
        bottom: rect.bottom,
        width: Math.max(1, rect.width - 20),
        height: rect.height,
      };
      return {
        kind: 'input',
        value: input.value,
        preview,
        rect: bounds,
        bounds,
      };
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!range || !range.commonAncestorContainer) return null;
    if (this.shadow?.contains(range.commonAncestorContainer) || this.host?.contains(range.commonAncestorContainer)) {
      return null;
    }
    let preview = selection.toString().replace(/\s+/g, ' ').trim();
    if (!preview) {
      const fragment = range.cloneContents();
      if (fragment.querySelector?.('math, .katex, mjx-container, .MathJax, img[alt]')) {
        preview = this.t('[公式]', '[formula]');
      }
    }
    if (!preview) return null;
    const rect = selectionRect(range);
    if (!rect) return null;
    const box = range.getBoundingClientRect();
    const bounds = {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
    return { kind: 'range', range: range.cloneRange(), preview, rect, bounds };
  }

  extractContext(context) {
    if (context.kind === 'input') return extractFromPlainText(context.value);
    return extractFromRange(context.range);
  }

  showBubble(context) {
    if (!this.bubble || !this.settings.showBubble) return;
    this.pendingContext = context;
    this.bubble.hidden = false;
    this.bubble.style.visibility = 'hidden';
    this.bubble.style.left = '-9999px';
    this.bubble.style.top = '-9999px';
    const bubbleWidth = this.bubble.offsetWidth || 190;
    const bubbleHeight = this.bubble.offsetHeight || 36;
    const rect = context.rect;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left + rect.width / 2 - bubbleWidth / 2;
    left = clamp(left, 8, Math.max(8, vw - bubbleWidth - 8));
    let top = rect.top - bubbleHeight - 9;
    if (top < 8) top = rect.bottom + 9;
    top = clamp(top, 8, Math.max(8, vh - bubbleHeight - 8));
    this.bubble.style.left = `${Math.round(left)}px`;
    this.bubble.style.top = `${Math.round(top)}px`;
    this.bubble.style.visibility = '';
    this.bubbleVisible = true;
  }

  hideBubble() {
    if (!this.bubble) return;
    this.bubble.hidden = true;
    this.bubbleVisible = false;
  }

  chooseMode(mode) {
    const context = this.pendingContext;
    if (!context) return;
    this.hideBubble();
    this.openForContext(context, mode);
  }

  openForContext(context, mode) {
    let extraction;
    try {
      extraction = this.extractContext(context);
    } catch (error) {
      this.showToast(this.t(`无法读取选中内容：${error.message}`, `Could not read selection: ${error.message}`));
      return;
    }
    if (!extraction?.text?.trim()) {
      this.showToast(
        this.t('选中内容为空，或其中只有无法解析的公式', 'The selection is empty or contains only unparseable formulas'),
      );
      return;
    }
    const initialMode = extraction.formulaOnly && mode === 'translate' ? 'explain' : mode;
    this.startSession(extraction, initialMode, context);
  }

  startSession(extraction, mode, context) {
    this.abortActiveRequest();
    this.session = {
      extraction,
      mode,
      context,
      cache: new Map(),
      formulaMap: new Map(extraction.formulas.map((formula) => [formula.id, formula])),
    };
    this.panel.hidden = false;
    this.panel.style.visibility = 'hidden';
    this.updateTargetLabel();
    this.renderSource(extraction);
    this.renderFormulaList(extraction.formulas);
    this.switchMode(mode, { force: true, position: context.bounds || context.rect });
  }

  renderSource(extraction) {
    const details = this.sourceBody.closest('details');
    if (details) details.open = false;
    const source = this.sourceBody.closest('.sl-source');
    if (source) source.hidden = Boolean(extraction.formulaOnly);
    const meta = extraction.formulaOnly
      ? [this.t('选中公式', 'Formula selected'), this.t(`${extraction.formulaCount} 个公式`, `${extraction.formulaCount} formula${extraction.formulaCount === 1 ? '' : 's'}`)]
      : [this.t(`${extraction.charCount.toLocaleString('zh-CN')} 字符`, `${extraction.charCount.toLocaleString('en-US')} characters`)];
    if (!extraction.formulaOnly) {
      if (extraction.formulaCount) {
        meta.push(
          this.t(`${extraction.formulaCount} 个公式`, `${extraction.formulaCount} formula${extraction.formulaCount === 1 ? '' : 's'}`),
        );
      }
      if (extraction.truncated) meta.push(this.t('已截取', 'truncated'));
    }
    this.sourceMeta.textContent = meta.join(' · ');
    this.sourceBody.textContent = extraction.text;
  }

  renderFormulaList(formulas) {
    this.formulaList.textContent = '';
    if (!formulas.length) {
      this.formulasDetails.hidden = true;
      return;
    }
    this.formulasDetails.hidden = false;
    this.formulasDetails.open = false;
    this.formulaMeta.textContent = `· ${formulas.length}`;
    for (const formula of formulas) {
      const row = makeElement('div', 'sl-formula-row');
      const id = makeElement('span', 'sl-formula-id', `M${formula.id}`);
      id.title = this.t(`来源：${formula.source}`, `Source: ${formula.source}`);
      const content = makeElement('div', 'sl-formula-content');
      content.appendChild(renderSingleFormula(formula.latex, formula.display));
      const copy = makeElement('button', 'sl-formula-copy');
      copy.type = 'button';
      copy.title = this.t('复制 LaTeX', 'Copy LaTeX');
      copy.setAttribute('aria-label', this.t(`复制公式 M${formula.id} 的 LaTeX`, `Copy LaTeX for formula M${formula.id}`));
      copy.innerHTML = ICONS.copy;
      copy.addEventListener('click', async () => {
        const ok = await writeClipboard(formula.latex);
        this.showToast(
          ok
            ? this.t(`已复制 M${formula.id} 的 LaTeX`, `Copied LaTeX for M${formula.id}`)
            : this.t('复制失败，请手动选择公式源码', 'Copy failed. Select the formula source manually.'),
        );
      });
      row.append(id, content, copy);
      this.formulaList.appendChild(row);
    }
  }

  updateTargetLabel() {
    if (!this.targetLabel) return;
    this.targetLabel.textContent = `→ ${this.settings.targetLanguage || '简体中文'}`;
  }

  updateTabs(mode) {
    this.shadow.querySelectorAll('[data-tab]').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.tab === mode));
    });
  }

  switchMode(mode, options = {}) {
    if (!this.session || !['translate', 'explain'].includes(mode)) return;
    if (this.session.mode !== mode || options.force) {
      this.abortActiveRequest();
    }
    if (this.session.mode !== mode) this.session.mode = mode;
    this.updateTabs(mode);
    const cached = this.session.cache.get(mode);
    if (cached && !options.force) {
      this.renderEntry(cached);
    } else {
      this.requestTranslation(mode, options);
    }
  }

  requestTranslation(mode, options = {}) {
    const session = this.session;
    if (!session) return;
    this.abortActiveRequest();
    this.setLoading();
    this.copyButton.disabled = true;
    this.stopButton.hidden = false;
    this.retryButton.hidden = true;
    this.setStatus(this.t('正在连接模型…', 'Connecting to model…'), true);

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let port;
    try {
      port = chrome.runtime.connect({ name: PORT_NAME });
    } catch {
      this.setError(session, mode, {
        code: 'CONTEXT',
        message: this.t('扩展上下文已失效，请刷新页面后重试。', 'The extension context is invalid. Refresh the page and try again.'),
      });
      return;
    }

    const request = {
      id: requestId,
      mode,
      port,
      full: '',
      finished: false,
      stopped: false,
      startedAt: performance.now(),
      previewTimer: null,
      session,
    };
    this.currentRequest = request;

    port.onMessage.addListener((message) => {
      if (message?.requestId && message.requestId !== requestId) return;
      if (message?.type === 'delta') {
        request.full += message.delta || '';
        this.schedulePreview(request);
        return;
      }
      if (message?.type === 'done') {
        request.finished = true;
        const output = cleanModelOutput(message.text || request.full, session.extraction.formulas);
        this.finishRequest(request, output, message.usage);
        return;
      }
      if (message?.type === 'error') {
        request.finished = true;
        this.abortPort(request);
        if (request.stopped) return;
        this.setError(session, mode, { code: message.code, message: message.message });
        this.currentRequest = null;
      }
    });

    port.onDisconnect.addListener(() => {
      if (request.finished || request.stopped) return;
      request.finished = true;
      this.setError(session, mode, {
        code: 'DISCONNECTED',
        message: this.t(
          '与扩展后台的连接意外中断，请重试；若持续出现，请刷新页面。',
          'The connection to the extension background was interrupted. Try again, or refresh the page if it persists.',
        ),
      });
      this.currentRequest = null;
    });

    try {
      port.postMessage({
        type: 'translate',
        requestId,
        text: session.extraction.text,
        mode,
        formulaCount: session.extraction.formulaCount,
      });
    } catch {
      request.finished = true;
      this.setError(session, mode, {
        code: 'CONTEXT',
        message: this.t('扩展上下文已失效，请刷新页面后重试。', 'The extension context is invalid. Refresh the page and try again.'),
      });
    }

    if (options.position) this.positionPanel(options.position);
  }

  schedulePreview(request) {
    if (request.previewTimer) return;
    request.previewTimer = setTimeout(() => {
      request.previewTimer = null;
      if (this.currentRequest !== request || request.finished) return;
      if (!request.full.trim()) return;
      const nearBottom =
        this.scrollArea.scrollTop + this.scrollArea.clientHeight >= this.scrollArea.scrollHeight - 36;
      this.result.className = 'sl-result sl-streaming';
      this.result.textContent = cleanModelOutput(request.full, request.session.extraction.formulas);
      this.setStatus(this.t('正在生成…', 'Generating…'), true);
      if (nearBottom) this.scrollArea.scrollTop = this.scrollArea.scrollHeight;
    }, 70);
  }

  finishRequest(request, output, usage) {
    if (request.previewTimer) {
      clearTimeout(request.previewTimer);
      request.previewTimer = null;
    }
    this.abortPort(request);
    this.currentRequest = null;
    if (!output) {
      this.setError(request.session, request.mode, {
        code: 'EMPTY',
        message: this.t('模型返回了空内容，请重试或换一个模型。', 'The model returned an empty response. Try again or use another model.'),
      });
      return;
    }
    const elapsed = Math.max(0.1, (performance.now() - request.startedAt) / 1000);
    const entry = {
      status: 'done',
      markdown: output,
      cleanText: output,
      usage: usage || null,
      elapsed,
      partial: false,
    };
    request.session.cache.set(request.mode, entry);
    if (this.session === request.session && request.session.mode === request.mode) {
      this.renderEntry(entry);
    }
  }

  setLoading() {
    this.result.className = 'sl-result';
    this.result.textContent = '';
    const loading = makeElement('div', 'sl-loading');
    const label = makeElement('div', 'sl-loading-label');
    label.append(
      makeElement('span', 'sl-spinner'),
      document.createTextNode(this.t('正在梳理术语、公式与上下文…', 'Reviewing terminology, formulas, and context…')),
    );
    const skeleton = makeElement('div', 'sl-skeleton');
    for (let i = 0; i < 4; i += 1) skeleton.appendChild(makeElement('div', 'sl-skeleton-line'));
    loading.append(label, skeleton);
    this.result.appendChild(loading);
    this.scrollArea.scrollTop = 0;
  }

  renderEntry(entry) {
    this.copyButton.disabled = !entry.cleanText;
    this.stopButton.hidden = true;
    this.retryButton.hidden = false;
    this.result.className = 'sl-result';
    this.result.textContent = '';
    if (entry.status === 'error') {
      this.renderErrorCard(entry);
      return;
    }
    const markdown = renderMarkdown(entry.cleanText, this.session?.formulaMap || new Map());
    this.result.appendChild(markdown);
    const missing = this.missingFormulasFor(entry);
    if (missing.length) this.renderIntegrityNote(missing);
    const parts = [];
    if (entry.partial) {
      parts.push(this.t('已停止生成', 'Stopped'));
    } else {
      parts.push(this.t('完成', 'Done'));
    }
    if (entry.elapsed) {
      parts.push(this.t(`${entry.elapsed.toFixed(1)} 秒`, `${entry.elapsed.toFixed(1)}s`));
    }
    if (entry.usage?.total_tokens) parts.push(`${entry.usage.total_tokens} tokens`);
    this.setStatus(parts.join(' · '), false);
  }

  missingFormulasFor(entry) {
    if (!this.session || this.session.mode !== 'translate' || !entry.cleanText) return [];
    const used = new Set(
      [...entry.cleanText.matchAll(/⟦M(\d+)⟧/g)].map((match) => Number(match[1])),
    );
    return this.session.extraction.formulas.filter((formula) => !used.has(formula.id));
  }

  renderIntegrityNote(missing) {
    const note = makeElement('div', 'sl-integrity');
    const text = makeElement(
      'span',
      '',
      this.t(
        `译文缺少 ${missing.length} 个原文公式占位符；公式本身仍保留在下方公式对照中。`,
        `The translation is missing ${missing.length} source formula placeholder${missing.length === 1 ? '' : 's'}. The source formulas remain in Formula reference below.`,
      ),
    );
    const button = makeElement('button', '', this.t('查看公式', 'View formulas'));
    button.type = 'button';
    button.addEventListener('click', () => {
      this.formulasDetails.open = true;
      this.formulasDetails.scrollIntoView({ block: 'nearest' });
    });
    note.append(text, button);
    this.result.appendChild(note);
  }

  renderErrorCard(entry) {    const card = makeElement('div', 'sl-error');
    const title = makeElement('div', 'sl-error-title');
    const titleText =
      {
        NO_KEY: this.t('还差一步配置', 'API key required'),
        HOST_PERMISSION: this.t('需要域名访问权限', 'Domain permission required'),
        AUTH: this.t('API Key 无效', 'Invalid API key'),
        BILLING: this.t('额度不足', 'Insufficient credits'),
        RATE_LIMIT: this.t('请求受限', 'Rate limited'),
        NETWORK: this.t('连接失败', 'Connection failed'),
        TIMEOUT: this.t('请求超时', 'Request timed out'),
        CONFIG: this.t('配置不完整', 'Incomplete configuration'),
        CONTEXT: this.t('扩展需要刷新', 'Extension needs a refresh'),
      }[entry.code] || this.t('处理失败', 'Request failed');
    title.textContent = titleText;
    const message = makeElement(
      'p',
      'sl-error-message',
      this.i18n.lang === 'en' && entry.message && /[\u4e00-\u9fff]/.test(entry.message)
        ? titleText
        : entry.message || this.t('请稍后重试。', 'Try again in a moment.'),
    );
    const actions = makeElement('div', 'sl-error-actions');
    const settingsButton = makeElement('button', '', this.t('打开设置', 'Open settings'));
    settingsButton.type = 'button';
    settingsButton.addEventListener('click', () => this.openSettings());
    if (['NO_KEY', 'HOST_PERMISSION', 'AUTH', 'CONFIG'].includes(entry.code)) {
      actions.appendChild(settingsButton);
    }
    card.append(title, message);
    if (actions.childElementCount) card.appendChild(actions);
    this.result.appendChild(card);
    this.setStatus(this.t('未完成', 'Not completed'), false);
  }

  setError(session, mode, error) {
    const entry = {
      status: 'error',
      code: error.code || 'UNKNOWN',
      message: error.message || this.t('处理失败，请重试。', 'Request failed. Try again.'),
    };
    session.cache.set(mode, entry);
    if (this.session === session && session.mode === mode) {
      this.copyButton.disabled = true;
      this.stopButton.hidden = true;
      this.retryButton.hidden = false;
      this.result.className = 'sl-result';
      this.result.textContent = '';
      this.renderErrorCard(entry);
    }
  }

  stopGeneration() {
    const request = this.currentRequest;
    if (!request) return;
    request.stopped = true;
    if (request.previewTimer) {
      clearTimeout(request.previewTimer);
      request.previewTimer = null;
    }
    this.abortPort(request);
    this.currentRequest = null;
    const output = cleanModelOutput(request.full, request.session.extraction.formulas);
    if (output) {
      const entry = {
        status: 'done',
        markdown: output,
        cleanText: output,
        elapsed: (performance.now() - request.startedAt) / 1000,
        partial: true,
      };
      request.session.cache.set(request.mode, entry);
      if (this.session === request.session && request.session.mode === request.mode) {
        this.renderEntry(entry);
      }
    } else {
    const entry = {
      status: 'error',
      code: 'STOPPED',
      message: this.t('已停止生成。', 'Generation stopped.'),
    };
    request.session.cache.set(request.mode, entry);
    if (this.session === request.session && request.session.mode === request.mode) {
      this.result.className = 'sl-result';
      this.result.textContent = '';
      this.result.appendChild(makeElement('div', 'sl-empty', this.t('已停止生成。', 'Generation stopped.')));
      this.setStatus(this.t('已停止', 'Stopped'), false);
      this.stopButton.hidden = true;
      this.retryButton.hidden = false;
    }
    }
  }

  abortActiveRequest() {
    const request = this.currentRequest;
    if (!request) return;
    request.stopped = true;
    if (request.previewTimer) clearTimeout(request.previewTimer);
    request.previewTimer = null;
    this.abortPort(request);
    this.currentRequest = null;
  }

  abortPort(request) {
    try {
      request.port.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  retry() {
    if (!this.session) return;
    this.switchMode(this.session.mode, { force: true });
  }

  async copyResult() {
    if (!this.session) return;
    const entry = this.session.cache.get(this.session.mode);
    if (!entry?.cleanText) return;
    let text = markdownWithLatex(entry.cleanText, this.session.extraction.formulas);
    const missing = this.missingFormulasFor(entry);
    if (missing.length) {
      const appendix = missing
        .map((formula) =>
          formula.display ? `$$\n${formula.latex}\n$$` : `$${formula.latex}$`,
        )
        .join('\n\n');
      text += `\n\n---\n\n**${this.t('原文中未被译文引用的公式', 'Source formulas not referenced in the translation')}**\n\n${appendix}`;
    }
    const ok = await writeClipboard(text);
    if (ok) {
      const label = this.copyButton.querySelector('span');
      const old = label?.textContent;
      if (label) label.textContent = this.t('已复制', 'Copied');
      this.showToast(this.t('已复制 Markdown，公式已还原为 LaTeX', 'Copied Markdown with formulas restored as LaTeX'));
      setTimeout(() => {
        if (label && old) label.textContent = old;
      }, 1600);
    } else {
      this.showToast(this.t('复制失败，请检查浏览器剪贴板权限', 'Copy failed. Check the browser clipboard permission.'));
    }
  }

  positionPanel(rect) {
    if (this.panel.hidden) return;
    if (!rect) {
      this.panel.style.top = '12px';
      this.panel.style.left = '12px';
      this.panel.style.bottom = 'auto';
      return;
    }
    this.panel.style.visibility = 'hidden';
    this.panel.style.left = '-9999px';
    this.panel.style.top = '-9999px';
    this.panel.style.bottom = 'auto';
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const width = this.panel.offsetWidth || 434;
    let left = clamp(rect.left - 18, margin, Math.max(margin, vw - width - margin));

    const spaceBelow = vh - rect.bottom - margin * 2;
    const spaceAbove = rect.top - margin * 2;
    const preferred = Math.min(vh * 0.78, 740);
    let maxHeight;
    if (spaceBelow >= 240 && spaceBelow >= spaceAbove) {
      const top = clamp(rect.bottom + 9, margin, vh - 220);
      this.panel.style.top = `${Math.round(top)}px`;
      this.panel.style.bottom = 'auto';
      maxHeight = Math.min(preferred, vh - top - margin);
    } else if (spaceAbove >= 240) {
      const bottom = vh - rect.top + 9;
      this.panel.style.top = 'auto';
      this.panel.style.bottom = `${Math.round(clamp(bottom, margin, vh - 220))}px`;
      maxHeight = Math.min(preferred, vh - bottom - margin);
    } else {
      this.panel.style.top = `${margin}px`;
      this.panel.style.bottom = 'auto';
      maxHeight = vh - margin * 2;
    }
    maxHeight = Math.min(Math.max(240, maxHeight), vh - margin * 2);
    this.panel.style.maxHeight = `${Math.round(maxHeight)}px`;
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.visibility = '';
  }

  clampPanelToViewport() {
    if (!this.panel || this.panel.hidden) return;
    const rect = this.panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = clamp(rect.left, 12, Math.max(12, vw - rect.width - 12));
    let top = clamp(rect.top, 12, Math.max(12, vh - 120));
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
    this.panel.style.bottom = 'auto';
  }

  startDrag(event) {
    if (event.button !== 0) return;
    if (event.target.closest('button, a, summary')) return;
    const rect = this.panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    this.header.classList.add('sl-dragging');
    this.panel.style.bottom = 'auto';
    this.panel.style.top = `${startTop}px`;
    this.panel.style.left = `${startLeft}px`;
    const onMove = (moveEvent) => {
      const width = this.panel.offsetWidth;
      const maxLeft = Math.max(12, window.innerWidth - width - 12);
      const left = clamp(startLeft + moveEvent.clientX - startX, 12, maxLeft);
      const top = clamp(startTop + moveEvent.clientY - startY, 12, Math.max(12, window.innerHeight - 80));
      this.panel.style.left = `${left}px`;
      this.panel.style.top = `${top}px`;
    };
    const onUp = () => {
      this.header.classList.remove('sl-dragging');
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
    };
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    event.preventDefault();
  }

  closePanel() {
    this.abortActiveRequest();
    this.session = null;
    if (this.panel) {
      this.panel.hidden = true;
      this.panel.style.visibility = '';
    }
  }

  setStatus(text, live) {
    this.statusText.textContent = text;
    this.statusDot.classList.toggle('is-live', Boolean(live));
  }

  showToast(message, duration = 2300) {
    if (!this.toast) return;
    clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.hidden = false;
    this.toastTimer = setTimeout(() => {
      this.toast.hidden = true;
    }, duration);
  }

  async openSettings() {
    try {
      await chrome.runtime.sendMessage({ type: 'open-options' });
    } catch {
      this.showToast(this.t('无法打开设置，请刷新页面或重新加载扩展', 'Could not open settings. Refresh the page or reload the extension.'));
    }
  }
}

const app = new ScholarLensApp();
app.init().catch((error) => {
  console.warn('[ScholarLens] initialization failed:', error);
});
