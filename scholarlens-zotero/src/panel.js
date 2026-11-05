/* ScholarLens for Zotero — 浮动翻译面板
 * 在 Zotero 主窗口创建可拖动面板：源文本预览、流式译文（KaTeX 还原）、
 * 公式对照、停止/重试、复制 Markdown。
 */

import katex from 'katex';
import katexCssText from 'katex/dist/katex.min.css';
import { renderMarkdown } from './lib/markdown.js';
import { buildMessages } from './lib/prompt.js';
import {
  cleanModelOutput,
  extractFromPlainText,
  markdownWithLatex,
  missingFormulas,
} from './lib/extract.js';
import { getSettings, streamChat } from './lib/api.js';

const PANEL_ID = 'scholarlens-panel';
const STYLE_ID = 'scholarlens-panel-style';
const PREVIEW_INTERVAL_MS = 250;

let addon = null;
let panel = null;
let session = null;

/* ---------- 基础 DOM 工具 ---------- */

function el(tag, className, text) {
  const node = document.createElementNS('http://www.w3.org/1999/xhtml', tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  // katex.min.css 里的字体是相对路径 fonts/...，改写为插件 rootURI 下的绝对地址
  const root = addon.rootURI.endsWith('/') ? addon.rootURI : `${addon.rootURI}/`;
  const css = String(katexCssText).replace(/url\((['"]?)fonts\//g, `url($1${root}vendor/fonts/`);
  const style = document.createElementNS('http://www.w3.org/1999/xhtml', 'style');
  style.id = STYLE_ID;
  style.textContent = css;
  // Zotero 主窗口是 XUL 文档，没有 document.head，样式挂到 documentElement
  const mount = document.head || document.documentElement;
  mount.appendChild(style);

  const ownCss = `
#${PANEL_ID} { position: fixed; top: 64px; right: 24px; width: 460px; max-height: min(78vh, 760px);
  display: flex; flex-direction: column; background: #fff; color: #1f2328;
  border: 1px solid #d0d7de; border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,.18);
  z-index: 9999; font: 13px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
#${PANEL_ID} * { box-sizing: border-box; }
#${PANEL_ID} .sl-header { display: flex; align-items: center; gap: 8px; padding: 7px 10px;
  border-bottom: 1px solid #eaeef2; cursor: move; user-select: none; background: #f6f8fa;
  border-radius: 10px 10px 0 0; }
#${PANEL_ID} .sl-title { font-weight: 600; flex: 1; }
#${PANEL_ID} .sl-close { border: 0; background: transparent; cursor: pointer; font-size: 15px; color: #57606a; padding: 0 4px; }
#${PANEL_ID} .sl-tabs { display: flex; gap: 6px; padding: 6px 10px 0; }
#${PANEL_ID} .sl-tab { border: 1px solid #d0d7de; background: #fff; border-radius: 6px 6px 0 0;
  padding: 3px 12px; cursor: pointer; font-size: 12px; color: #57606a; }
#${PANEL_ID} .sl-tab.active { color: #0969da; border-color: #0969da; border-bottom-color: #fff; font-weight: 600; }
#${PANEL_ID} .sl-body { overflow-y: auto; padding: 10px 12px; flex: 1; }
#${PANEL_ID} details.sl-source { margin-bottom: 8px; border: 1px solid #eaeef2; border-radius: 6px; }
#${PANEL_ID} details.sl-source summary { cursor: pointer; padding: 4px 8px; font-size: 12px; color: #57606a; }
#${PANEL_ID} details.sl-source .sl-source-text { padding: 4px 8px; white-space: pre-wrap;
  font-size: 12px; color: #424a53; max-height: 140px; overflow-y: auto; }
#${PANEL_ID} .sl-result { white-space: normal; word-break: break-word; }
#${PANEL_ID} .sl-status { padding: 3px 12px 6px; font-size: 12px; color: #57606a; }
#${PANEL_ID} .sl-actions { display: flex; gap: 6px; padding: 6px 10px 10px; border-top: 1px solid #eaeef2; }
#${PANEL_ID} .sl-actions button { border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 6px;
  padding: 3px 10px; cursor: pointer; font-size: 12px; }
#${PANEL_ID} .sl-actions button:disabled { opacity: .5; cursor: default; }
#${PANEL_ID} .sl-actions button.primary { background: #0969da; border-color: #0969da; color: #fff; }
#${PANEL_ID} .sl-error { border: 1px solid #ffc0bd; background: #fff8f7; color: #b62324;
  border-radius: 6px; padding: 8px 10px; white-space: pre-wrap; font-size: 12px; }
#${PANEL_ID} .sl-integrity { margin-top: 8px; border: 1px solid #d4a72c66; background: #fff8c5;
  border-radius: 6px; padding: 6px 8px; font-size: 12px; color: #7d4e00; }
#${PANEL_ID} details.sl-formulas { margin-top: 8px; border: 1px solid #eaeef2; border-radius: 6px; }
#${PANEL_ID} details.sl-formulas summary { cursor: pointer; padding: 4px 8px; font-size: 12px; color: #57606a; }
#${PANEL_ID} .sl-formula-item { display: flex; align-items: center; gap: 8px; padding: 4px 8px; }
#${PANEL_ID} .sl-formula-item .sl-latex { flex: 1; font-family: Consolas, monospace; font-size: 11px;
  color: #424a53; word-break: break-all; }
#${PANEL_ID} .sl-formula-item button { border: 1px solid #d0d7de; background: #f6f8fa;
  border-radius: 4px; cursor: pointer; font-size: 11px; padding: 1px 6px; }
#${PANEL_ID} .sl-markdown p { margin: .45em 0; }
#${PANEL_ID} .sl-markdown h2, #${PANEL_ID} .sl-markdown h3, #${PANEL_ID} .sl-markdown h4 { margin: .6em 0 .3em; }
#${PANEL_ID} .sl-markdown .sl-formula-display { margin: .5em 0; text-align: center; overflow-x: auto; }
#${PANEL_ID} .sl-formula-missing { color: #b62324; border-bottom: 1px dotted #b62324; cursor: help; }
#${PANEL_ID} .sl-formula-error { color: #b62324; }
#${PANEL_ID} .sl-code-inline { background: #f6f8fa; border-radius: 4px; padding: 0 4px;
  font-family: Consolas, monospace; font-size: 12px; }
#${PANEL_ID} .sl-pre { background: #f6f8fa; border-radius: 6px; padding: 8px; overflow-x: auto;
  font-family: Consolas, monospace; font-size: 12px; }
#${PANEL_ID} .sl-quote { border-left: 3px solid #d0d7de; margin: .4em 0; padding-left: 8px; color: #57606a; }
#${PANEL_ID} .sl-table { border-collapse: collapse; margin: .4em 0; }
#${PANEL_ID} .sl-table th, #${PANEL_ID} .sl-table td { border: 1px solid #d0d7de; padding: 2px 8px; }
`;
  const own = document.createElementNS('http://www.w3.org/1999/xhtml', 'style');
  own.id = `${STYLE_ID}-own`;
  own.textContent = ownCss;
  (document.head || document.documentElement).appendChild(own);
}

/* ---------- 面板生命周期 ---------- */

function ensurePanel() {
  if (panel && panel.element.isConnected && addon.window && panel.window === addon.window) {
    return panel;
  }
  if (panel?.escHandler && panel.window) {
    panel.window.removeEventListener('keydown', panel.escHandler);
  }
  if (panel?.element?.isConnected) panel.element.remove();

  const doc = document;
  const root = el('div');
  root.id = PANEL_ID;
  root.style.display = 'none';

  const header = el('div', 'sl-header');
  const title = el('span', 'sl-title', 'ScholarLens');
  const closeButton = el('button', 'sl-close', '✕');
  closeButton.title = '关闭（Esc）';
  closeButton.addEventListener('click', () => hidePanel());
  header.append(title, closeButton);

  const tabs = el('div', 'sl-tabs');
  const translateTab = el('button', 'sl-tab active', '翻译');
  const explainTab = el('button', 'sl-tab', '解释');
  tabs.append(translateTab, explainTab);

  const body = el('div', 'sl-body');
  const result = el('div', 'sl-result');
  body.appendChild(result);

  const status = el('div', 'sl-status');

  const actions = el('div', 'sl-actions');
  const stopButton = el('button', '', '停止');
  const retryButton = el('button', '', '重试');
  const copyButton = el('button', 'primary', '复制 Markdown');
  copyButton.title = '译文中的公式还原成 $...$ / $$...$$，可直接粘贴到 Obsidian/Notion/Typora';
  stopButton.disabled = true;
  actions.append(stopButton, retryButton, copyButton);

  root.append(header, tabs, body, status, actions);
  doc.documentElement.appendChild(root);
  injectStyles();

  panel = {
    element: root,
    window: addon.window,
    result,
    status,
    stopButton,
    retryButton,
    copyButton,
    translateTab,
    explainTab,
    body,
    sourceDetails: null,
    formulaList: null,
  };

  // 拖动
  let drag = null;
  header.addEventListener('mousedown', (event) => {
    if (event.target === closeButton) return;
    drag = { x: event.clientX, y: event.clientY, left: root.offsetLeft, top: root.offsetTop };
    const move = (e) => {
      if (!drag) return;
      root.style.left = `${Math.max(0, drag.left + e.clientX - drag.x)}px`;
      root.style.top = `${Math.max(0, drag.top + e.clientY - drag.y)}px`;
      root.style.right = 'auto';
    };
    const up = () => {
      drag = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  // Esc 关闭
  const escHandler = (event) => {
    if (event.key === 'Escape') hidePanel();
  };
  window.addEventListener('keydown', escHandler);
  panel.escHandler = escHandler;

  translateTab.addEventListener('click', () => switchMode('translate'));
  explainTab.addEventListener('click', () => switchMode('explain'));
  stopButton.addEventListener('click', () => stopGeneration());
  retryButton.addEventListener('click', () => {
    if (session?.text) translateSelection(session.text, session.mode, { force: true });
  });
  copyButton.addEventListener('click', () => copyResult());

  return panel;
}

function showPanel() {
  const p = ensurePanel();
  p.element.style.display = 'flex';
}

function hidePanel() {
  if (panel?.element) panel.element.style.display = 'none';
  if (session?.running) stopGeneration();
}

function destroyPanel() {
  if (session?.running) stopGeneration();
  if (panel?.escHandler && panel.window) {
    panel.window.removeEventListener('keydown', panel.escHandler);
  }
  panel?.element?.remove();
  document.getElementById(`${STYLE_ID}-own`)?.remove();
  panel = null;
  session = null;
}

/* ---------- 会话与渲染 ---------- */

function switchMode(mode) {
  if (!session) return;
  translateSelection(session.text, mode);
}

function setTab(mode) {
  panel.translateTab.classList.toggle('active', mode === 'translate');
  panel.explainTab.classList.toggle('active', mode === 'explain');
}

function setStatus(text) {
  if (panel) panel.status.textContent = text;
}

function setRunning(running) {
  if (!panel) return;
  panel.stopButton.disabled = !running;
  panel.retryButton.disabled = running;
  panel.copyButton.disabled = running;
}

function renderSourcePreview(text, extraction) {
  let details = panel.body.querySelector('details.sl-source');
  if (!details) {
    details = el('details', 'sl-source');
    const summary = el('summary', '', '选区原文');
    const content = el('div', 'sl-source-text');
    details.append(summary, content);
    panel.body.prepend(details);
  }
  const content = details.querySelector('.sl-source-text');
  const preview = extraction.formulaOnly ? '[公式]' : text.slice(0, 2000);
  content.textContent = preview + (extraction.truncated ? '\n\n…（选区过长，已截取前 8000 字符）' : '');
  details.open = false;
  panel.sourceDetails = details;
}

function renderFormulaList(formulas) {
  panel.formulaList?.remove();
  panel.formulaList = null;
  if (!formulas.length) return;
  const details = el('details', 'sl-formulas');
  const summary = el('summary', '', `公式对照（${formulas.length}）`);
  details.appendChild(summary);
  for (const formula of formulas) {
    const item = el('div', 'sl-formula-item');
    const rendered = el('span', 'sl-formula');
    try {
      katex.render(formula.latex, rendered, {
        displayMode: false,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
      });
    } catch {
      rendered.textContent = formula.latex;
    }
    const latex = el('span', 'sl-latex', formula.latex);
    const copy = el('button', '', 'LaTeX');
    copy.addEventListener('click', () => {
      copyText(formula.latex);
      copy.textContent = '已复制';
      setTimeout(() => {
        copy.textContent = 'LaTeX';
      }, 1200);
    });
    item.append(rendered, latex, copy);
    details.appendChild(item);
  }
  panel.element.querySelector('.sl-body').appendChild(details);
  panel.formulaList = details;
}

function renderResultNow(text) {
  if (!session || !panel) return;
  const map = new Map(session.formulas.map((formula) => [formula.id, formula]));
  panel.result.replaceChildren(renderMarkdown(text, map));
}

function schedulePreview() {
  if (session.previewTimer) return;
  session.previewTimer = setTimeout(() => {
    session.previewTimer = null;
    if (session?.running) renderResultNow(cleanModelOutput(session.result, session.formulas) || session.result);
  }, PREVIEW_INTERVAL_MS);
}

function stopGeneration() {
  session?.controller?.abort();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 退路：execCommand
    const textarea = document.createElementNS('http://www.w3.org/1999/xhtml', 'textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.documentElement.appendChild(textarea);
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
}

async function copyResult() {
  if (!session?.result) return;
  const clean = cleanModelOutput(session.result, session.formulas);
  let markdown = markdownWithLatex(clean, session.formulas);
  const missing = missingFormulas(clean, session.formulas);
  if (missing.length) {
    const map = new Map(session.formulas.map((formula) => [formula.id, formula]));
    const lines = missing.map((id) => `- M${id}：${(map.get(id)?.latex || '（未知公式）').slice(0, 300)}`);
    markdown += `\n\n**原文中未被译文引用的公式**\n\n${lines.join('\n')}`;
  }
  const ok = await copyText(markdown);
  setStatus(ok ? '已复制 Markdown。' : '复制失败，请手动选择文本复制。');
}

/* ---------- 主入口 ---------- */

async function translateSelection(rawText, mode, { force = false } = {}) {
  const text = String(rawText || '').trim();
  showPanel();
  ensurePanel();
  if (!text) {
    panel.result.replaceChildren(el('div', 'sl-error', '没有选中文本。'));
    return;
  }
  try {
    // 命中缓存：同文本同模式直接展示
    if (!force && session && session.text === text && session.mode === mode && session.cache[mode]) {
      const cached = session.cache[mode];
      setTab(mode);
      session.mode = mode;
      session.result = cached.result;
      session.formulas = cached.formulas;
      renderSourcePreview(text, cached.extraction);
      renderResultNow(cached.result);
      renderFormulaList(cached.formulas);
      setStatus(`（缓存）${cached.statusNote}`);
      return;
    }

    if (session?.running) stopGeneration();

    const extraction = extractFromPlainText(text);
    const formulas = extraction.formulas;
    const settings = getSettings();
    const messages = buildMessages({
      text: extraction.text,
      mode,
      targetLanguage: settings.targetLanguage,
      customPrompt: settings.customPrompt,
      formulaCount: extraction.formulaCount,
    });

    setTab(mode);
    renderSourcePreview(text, extraction);
    renderFormulaList(formulas);

    const controller = new AbortController();
    session = {
      text,
      mode,
      formulas,
      extraction,
      result: '',
      controller,
      running: true,
      previewTimer: null,
      cache: session?.cache && session.text === text ? session.cache : {},
    };
    setRunning(true);
    setStatus(mode === 'explain' ? '正在解释…' : '正在翻译…');

    const { text: full } = await streamChat({
      settings,
      messages,
      signal: controller.signal,
      onDelta: (delta) => {
        session.result += delta;
        schedulePreview();
      },
    });
    session.result = full;
    session.running = false;
    if (session.previewTimer) {
      clearTimeout(session.previewTimer);
      session.previewTimer = null;
    }
    const clean = cleanModelOutput(full, formulas);
    session.cache[mode] = { result: full, formulas, extraction, statusNote: `完成于 ${new Date().toLocaleTimeString()}` };

    renderResultNow(clean);
    renderFormulaList(formulas);

    const missing = missingFormulas(clean, formulas);
    if (missing.length) {
      const note = el('div', 'sl-integrity', `译文缺失 ${missing.length} 个公式占位符（M${missing.join('、M')}），原文公式已保留在「公式对照」中，复制 Markdown 时会自动附上。`);
      panel.result.appendChild(note);
    }
    const charNote = extraction.truncated ? '；选区已截取' : '';
    setStatus(extraction.formulaOnly ? `公式解释完成${charNote}` : `完成${charNote}`);
  } catch (error) {
    if (session) {
      session.running = false;
      if (session.previewTimer) {
        clearTimeout(session.previewTimer);
        session.previewTimer = null;
      }
    }
    const aborted = error?.code === 'ABORTED' || error?.name === 'AbortError';
    if (aborted) {
      setStatus('已停止。');
      if (session?.result) renderResultNow(cleanModelOutput(session.result, session.formulas) || session.result);
    } else {
      addon?.log(`translate error: ${error?.code || ''} ${error?.message || error}`);
      panel.result.replaceChildren(
        el('div', 'sl-error', `${error?.message || '发生未知错误'}\n\n（代码：${error?.code || 'UNKNOWN'}）`),
      );
      setStatus(error?.code ? `出错（${error.code}）` : '出错');
    }
  } finally {
    setRunning(false);
  }
}

/* ---------- 导出 ---------- */

export function init(addonRef) {
  addon = addonRef;
  addon.log('panel module initialized');
}

export function onMainWindowChanged(window) {
  // 主窗口重开：丢弃旧面板引用，下次划词时重建
  panel = null;
  session = session && session.running ? null : session;
}

export function destroy() {
  destroyPanel();
}

/* 供偏好页（prefs-pane.js）与 bootstrap 错误兜底调用 */
export { getSettings, setSetting } from './lib/prefs.js';
export { testConnection } from './lib/api.js';

export function showPanelError(error) {
  showPanel();
  ensurePanel();
  panel.result.replaceChildren(
    el('div', 'sl-error', `ScholarLens 出错：${error?.message || error}`),
  );
  setStatus('出错');
}

export { translateSelection };
