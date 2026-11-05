/* ScholarLens for Zotero — bootstrap
 * 生命周期入口：加载打包脚本、注册 Reader 划词气泡按钮、注册偏好页与快捷键。
 *
 * 已知问题：Zotero 阅读器 iframe 内注入的元素收不到鼠标事件（reader 内部事件
 * 不会传播到注入的 overlay），因此按钮之外还提供 Alt+T / Alt+Shift+E 快捷键，
 * 选区文本在弹出层出现时缓存（params.annotation.text）。
 */

const XHTML_NS = 'http://www.w3.org/1999/xhtml';

function lazyInit(data) {
  if (data.addon.api) return;
  const root = data.rootURI;
  Services.scriptloader.loadSubScript(`${root}content.js`, data.scope);
  const api = data.scope.ScholarLensZotero;
  data.addon.api = api;
  api.init(data.addon);
}

function refreshMainWindow(data, window) {
  if (!window) return;
  data.scope.window = window;
  data.scope.document = window.document;
  data.scope.Node = window.Node;
  data.scope.navigator = window.navigator;
  data.scope.AbortController = window.AbortController;
  data.scope.TextDecoder = window.TextDecoder;
  data.scope.fetch = window.fetch.bind(window);
  data.scope.setTimeout = window.setTimeout.bind(window);
  data.scope.clearTimeout = window.clearTimeout.bind(window);
  data.addon.window = window;
}

/* ---------- 快捷键：Alt+T 翻译 / Alt+Shift+E 解释 ---------- */

function handleShortcut(event) {
  const addon = Zotero.ScholarLens;
  if (!addon?.api || !event.altKey || event.ctrlKey || event.metaKey) return;
  let mode = null;
  if (event.code === 'KeyT' && !event.shiftKey) mode = 'translate';
  else if (event.code === 'KeyE' && event.shiftKey) mode = 'explain';
  if (!mode) return;
  event.preventDefault();
  event.stopPropagation();
  const text = addon.lastSelection?.text || '';
  if (!text) {
    addon.log('shortcut pressed but no cached selection');
    return;
  }
  Promise.resolve(addon.api.translateSelection(text, mode)).catch((error) => {
    Zotero.logError(error);
    try {
      addon.api.showPanelError(error);
    } catch {
      // ignore
    }
  });
}

/** 在 reader iframe window 上注册快捷键（选区弹出层出现时调用，每个 reader 只注册一次）。 */
function registerReaderKeys(addon, reader) {
  try {
    const win = reader?._iframeWindow;
    if (!win) return;
    if (!addon.keyWindows) addon.keyWindows = new Set();
    if (addon.keyWindows.has(win)) return;
    addon.keyWindows.add(win);
    win.addEventListener('keydown', handleShortcut, true);
  } catch (error) {
    Zotero.logError(error);
  }
}

/* ---------- Reader 划词气泡 ---------- */

function handlePopupEvent(event) {
  const addon = Zotero.ScholarLens;
  try {
    const { doc, params, append, reader } = event;
    const text = String(params?.annotation?.text || '').trim();
    if (!text) return;
    addon.lastSelection = { text, reader, at: Date.now() };
    registerReaderKeys(addon, reader);

    const container = doc.createElementNS(XHTML_NS, 'div');
    container.style.display = 'flex';
    container.style.gap = '6px';
    container.style.padding = '3px 2px';

    const makeButton = (label, title, mode) => {
      const button = doc.createElementNS(XHTML_NS, 'button');
      button.textContent = label;
      button.title = title;
      button.style.cssText =
        'cursor:pointer;padding:2px 10px;border:1px solid rgba(0,0,0,.28);border-radius:5px;'
        + 'background:#ffffff;color:#1f2328;font-size:12px;line-height:1.5;';
      // iframe 内注入元素收不到 click，pointerdown 先行触发；click 兜底并去重
      let triggered = false;
      const trigger = () => {
        if (triggered) return;
        triggered = true;
        setTimeout(() => {
          triggered = false;
        }, 400);
        Promise.resolve(addon.api.translateSelection(text, mode)).catch((error) => {
          Zotero.logError(error);
          try {
            addon.api.showPanelError(error);
          } catch {
            // ignore
          }
        });
      };
      button.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        trigger();
      });
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        trigger();
      });
      return button;
    };

    container.append(
      makeButton('ScholarLens 翻译', '翻译选中内容（保留公式）', 'translate'),
      makeButton('ScholarLens 解释', '解释选中内容（一句话概括 / 公式与记号 / 关键逻辑 / 成立条件）', 'explain'),
    );
    append(container);
  } catch (error) {
    Zotero.logError(error);
  }
}

/* ---------- 生命周期 ---------- */

function lazyInit(data) {
  if (data.addon.api) return;
  const root = data.rootURI;
  Services.scriptloader.loadSubScript(`${root}content.js`, data.scope);
  const api = data.scope.ScholarLensZotero;
  data.addon.api = api;
  api.init(data.addon);
}

function refreshMainWindow(data, window) {
  if (!window) return;
  data.scope.window = window;
  data.scope.document = window.document;
  data.scope.Node = window.Node;
  data.scope.navigator = window.navigator;
  data.scope.AbortController = window.AbortController;
  data.scope.TextDecoder = window.TextDecoder;
  data.scope.fetch = window.fetch.bind(window);
  data.scope.setTimeout = window.setTimeout.bind(window);
  data.scope.clearTimeout = window.clearTimeout.bind(window);
  data.addon.window = window;
}

async function startup({ id, version, rootURI }, reason) {
  await Zotero.initializationPromise;

  const scope = {};
  const addon = {
    id,
    version,
    rootURI,
    window: null,
    api: null,
    data: null,
    lastSelection: null,
    keyWindows: null,
    mainWindowHandler: null,
    log(msg) {
      Zotero.debug(`[ScholarLens] ${msg}`);
    },
  };
  const data = { id, rootURI, addon, scope, api: null };
  addon.data = data;
  Zotero.ScholarLens = addon;
  refreshMainWindow(data, Zotero.getMainWindow());
  lazyInit(data);

  Zotero.Reader.registerEventListener('renderTextSelectionPopup', handlePopupEvent, id);

  Zotero.PreferencePanes.register({
    pluginID: id,
    id: 'scholarlens-prefs',
    src: `${rootURI}prefs.xhtml`,
    scripts: [`${rootURI}prefs-pane.js`],
    stylesheets: [`${rootURI}prefs.css`],
  });

  addon.log(`started (v${version})`);
}

function onMainWindowLoad({ window }) {
  const addon = Zotero.ScholarLens;
  const data = addon?.data;
  if (!data) return;
  refreshMainWindow(data, window);
  Zotero.ScholarLens.api?.onMainWindowChanged(window);
  // 主窗口快捷键（reader iframe 里的按键不会冒泡到主窗口，两侧都要注册）
  if (addon.mainWindowHandler) window.removeEventListener('keydown', addon.mainWindowHandler, true);
  addon.mainWindowHandler = handleShortcut;
  window.addEventListener('keydown', handleShortcut, true);
}

function onMainWindowUnload({ window }) {
  const addon = Zotero.ScholarLens;
  if (addon?.mainWindowHandler) {
    window.removeEventListener('keydown', addon.mainWindowHandler, true);
  }
  if (addon?.window === window) addon.window = null;
}

function shutdown({ id }, reason) {
  const addon = Zotero.ScholarLens;
  try {
    if (addon?.mainWindowHandler && addon?.window) {
      addon.window.removeEventListener('keydown', addon.mainWindowHandler, true);
    }
    if (addon?.keyWindows) {
      for (const win of addon.keyWindows) {
        try {
          win.removeEventListener('keydown', handleShortcut, true);
        } catch {
          // reader 可能已关闭
        }
      }
      addon.keyWindows.clear();
    }
    addon?.api?.destroy();
  } catch (error) {
    Zotero.logError(error);
  }
  try {
    delete Zotero.ScholarLens;
  } catch (error) {
    Zotero.logError(error);
  }
}

function install(data, reason) {}
function uninstall(data, reason) {}
