(() => {
  const pdfjsLib = globalThis.pdfjsLib;
  const pdfjsViewer = globalThis.pdfjsViewer;
  const { localizeDom, makeI18n } = globalThis.__ScholarLensI18n;
  let i18n = makeI18n('auto');
  const t = (zh, en) => i18n.t(zh, en);
  const fileLabel = document.getElementById('fileLabel');
  const startScreen = document.getElementById('startScreen');
  const startError = document.getElementById('startError');
  const dropZone = document.getElementById('dropZone');
  const pdfFileInput = document.getElementById('pdfFile');
  const pdfUrlInput = document.getElementById('pdfUrlInput');
  const loadUrlButton = document.getElementById('loadUrlButton');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  const errorOverlay = document.getElementById('errorOverlay');
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const permissionButton = document.getElementById('permissionButton');
  const chooseFileButton = document.getElementById('chooseFileButton');
  const retryButton = document.getElementById('retryButton');
  const closeButton = document.getElementById('closeButton');
  const pageNumber = document.getElementById('pageNumber');
  const pageCount = document.getElementById('pageCount');
  const zoomLabel = document.getElementById('zoomLabel');

  const initialFile = new URLSearchParams(location.search).get('file') || '';
  let pdfViewer = null;
  let linkService = null;
  let loadingTask = null;
  let currentUrl = '';
  let currentName = '';

  function showError(title, message, options = {}) {
    startScreen.hidden = true;
    loadingOverlay.hidden = true;
    errorOverlay.hidden = false;
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    permissionButton.hidden = !options.permission;
    chooseFileButton.hidden = !options.chooseFile;
    retryButton.hidden = Boolean(options.noRetry || options.chooseFile);
  }

  function showStart(message = '') {
    startScreen.hidden = false;
    loadingOverlay.hidden = true;
    errorOverlay.hidden = true;
    startError.textContent = message;
    startError.hidden = !message;
    fileLabel.textContent = t('选择 PDF', 'Choose PDF');
  }

  function showLoading(label) {
    startScreen.hidden = true;
    errorOverlay.hidden = true;
    loadingOverlay.hidden = false;
    loadingText.textContent = t('正在建立文字层…', 'Building text layer…');
    fileLabel.textContent = label || 'PDF';
  }

  function displayNameFromUrl(value) {
    try {
      const url = new URL(value);
      const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || 'PDF');
      return /\.pdf$/i.test(last) ? last : `${last}.pdf`;
    } catch {
      return 'PDF';
    }
  }

  function originPattern(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}/*`;
    } catch {
      return '';
    }
  }

  async function hasPermission(url) {
    const pattern = originPattern(url);
    if (!pattern) return false;
    return chrome.permissions.contains({ origins: [pattern] });
  }

  async function requestPermission(url) {
    const pattern = originPattern(url);
    if (!pattern) return false;
    try {
      return await chrome.permissions.request({ origins: [pattern] });
    } catch {
      return false;
    }
  }

  function setupViewer() {
    if (pdfViewer) return;
    const container = document.getElementById('viewerContainer');
    const viewer = document.getElementById('viewer');
    const eventBus = new pdfjsViewer.EventBus();
    linkService = new pdfjsViewer.PDFLinkService({ eventBus });
    pdfViewer = new pdfjsViewer.PDFViewer({
      container,
      viewer,
      eventBus,
      linkService,
      textLayerMode: 1,
    });
    linkService.setViewer(pdfViewer);

    eventBus.on('pagesinit', () => {
      pdfViewer.currentScaleValue = 'page-width';
      loadingOverlay.hidden = true;
    });
    eventBus.on('pagechanging', (event) => {
      pageNumber.textContent = String(event.pageNumber);
    });
    eventBus.on('scalechanging', (event) => {
      zoomLabel.textContent = `${Math.round(event.scale * 100)}%`;
    });

    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdfjs/pdf.worker.min.js');
  }

  async function loadDocument(source) {
    if (!pdfjsLib || !pdfjsViewer) {
      showError(
        t('PDF 组件没有加载', 'PDF components did not load'),
        t('扩展文件可能不完整，请重新加载扩展或重新安装。', 'The extension files may be incomplete. Reload or reinstall the extension.'),
        { noRetry: true },
      );
      return;
    }

    currentUrl = source.url || '';
    currentName = source.name || displayNameFromUrl(currentUrl);
    showLoading(currentName);
    errorOverlay.hidden = true;
    setupViewer();
    if (pdfViewer) pdfViewer.setDocument(null);
    if (linkService) linkService.setDocument(null);

    const params = {
      cMapUrl: chrome.runtime.getURL('vendor/pdfjs/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: chrome.runtime.getURL('vendor/pdfjs/standard_fonts/'),
    };
    if (source.data) params.data = source.data;
    else {
      params.url = source.url;
      params.withCredentials = true;
    }

    try {
      loadingTask = pdfjsLib.getDocument(params);
      const pdf = await loadingTask.promise;
      pageCount.textContent = String(pdf.numPages);
      pdfViewer.setDocument(pdf);
      linkService.setDocument(pdf, null);
      const metadata = await pdf.getMetadata().catch(() => null);
      const title = metadata?.info?.Title;
      if (title && String(title).trim()) document.title = `${String(title).trim()} · ScholarLens`;
      pageNumber.textContent = '1';
    } catch (error) {
      const message = String(error?.message || error);
      if (/password/i.test(message)) {
        showError(
          t('PDF 需要密码', 'PDF is password protected'),
          t(
            'ScholarLens 暂不支持加密 PDF。请先在 PDF 阅读器中解除密码后再打开。',
            'ScholarLens does not support encrypted PDFs. Remove the password first.',
          ),
          { chooseFile: true },
        );
      } else if (/Missing PDF|Unexpected server response|fetch|NetworkError|CORS|Status/i.test(message)) {
        showError(
          t('PDF 读取失败', 'Could not read PDF'),
          currentUrl
            ? t(
                `无法从 ${new URL(currentUrl).host} 读取这个 PDF。可能需要在原站点登录、PDF 已被移动，或该服务器禁止扩展抓取。\n\n技术信息：${message}`,
                `Could not fetch this PDF from ${new URL(currentUrl).host}. It may require login, may have moved, or the server may block extension fetches.\n\nTechnical details: ${message}`,
              )
            : t(
                `无法读取这个 PDF 文件。\n\n技术信息：${message}`,
                `Could not read this PDF file.\n\nTechnical details: ${message}`,
              ),
          { chooseFile: true },
        );
      } else {
        showError(
          t('PDF 解析失败', 'Could not parse PDF'),
          t(
            `这个文件可能不是有效的 PDF，或使用了暂不支持的格式。\n\n技术信息：${message}`,
            `This file may not be a valid PDF or may use an unsupported format.\n\nTechnical details: ${message}`,
          ),
          { chooseFile: true },
        );
      }
    }
  }

  async function openOnlinePdf(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      showStart(t('PDF 链接格式不正确。', 'Invalid PDF URL.'));
      return;
    }
    if (!/^https?:$/.test(url.protocol)) {
      showStart(
        t(
          '只支持 http/https 的在线 PDF，或直接选择本地 PDF 文件。',
          'Only http/https PDFs are supported, or choose a local PDF file.',
        ),
      );
      return;
    }
    currentUrl = url.href;
    history.replaceState({}, '', `${location.pathname}?file=${encodeURIComponent(url.href)}`);
    const allowed = await hasPermission(url.href);
    if (!allowed) {
      showError(
        t('需要访问 PDF 域名的权限', 'PDF domain permission required'),
        t(
          `浏览器还没有授予访问 ${url.host} 的权限。点击下方按钮授权后即可载入，扩展只会在你打开 PDF 时访问该域名。`,
          `The browser has not granted access to ${url.host}. Authorize below to load it. The extension only accesses this domain when you open a PDF.`,
        ),
        { permission: true },
      );
      return;
    }
    await loadDocument({ url: url.href, name: displayNameFromUrl(url.href) });
  }

  async function openLocalFile(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      showStart(t('请选择 .pdf 文件。', 'Please choose a .pdf file.'));
      return;
    }
    showLoading(file.name);
    try {
      const buffer = await file.arrayBuffer();
      currentUrl = '';
      currentName = file.name;
      await loadDocument({ data: new Uint8Array(buffer), name: file.name });
    } catch (error) {
      showError(
        t('无法读取本地 PDF', 'Could not read local PDF'),
        String(error?.message || error),
        { chooseFile: true },
      );
    }
  }

  pdfFileInput.addEventListener('change', () => {
    openLocalFile(pdfFileInput.files?.[0]);
  });

  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('is-dragging');
  });
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
    const file = event.dataTransfer?.files?.[0];
    if (file) openLocalFile(file);
  });

  loadUrlButton.addEventListener('click', () => openOnlinePdf(pdfUrlInput.value));
  pdfUrlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      openOnlinePdf(pdfUrlInput.value);
    }
  });

  document.getElementById('prevPage').addEventListener('click', () => {
    if (pdfViewer && pdfViewer.currentPageNumber > 1) pdfViewer.currentPageNumber -= 1;
  });
  document.getElementById('nextPage').addEventListener('click', () => {
    if (pdfViewer && pdfViewer.currentPageNumber < pdfViewer.pagesCount) {
      pdfViewer.currentPageNumber += 1;
    }
  });
  document.getElementById('zoomIn').addEventListener('click', () => {
    if (pdfViewer) pdfViewer.currentScale = Math.min(4, pdfViewer.currentScale * 1.15);
  });
  document.getElementById('zoomOut').addEventListener('click', () => {
    if (pdfViewer) pdfViewer.currentScale = Math.max(0.25, pdfViewer.currentScale / 1.15);
  });
  document.getElementById('fitWidth').addEventListener('click', () => {
    if (pdfViewer) pdfViewer.currentScaleValue = 'page-width';
  });

  permissionButton.addEventListener('click', async () => {
    const granted = await requestPermission(currentUrl);
    if (!granted) {
      showError(
        t('没有获得访问权限', 'Permission not granted'),
        t(
          '你可以在 edge://extensions → ScholarLens → 详细信息中授予该站点的访问权限，或返回论文页面使用粘贴模式。',
          'Grant site access from edge://extensions → ScholarLens → Details, or return to the paper and use paste mode.',
        ),
        { permission: true },
      );
      return;
    }
    window.location.reload();
  });

  retryButton.addEventListener('click', () => {
    if (loadingTask) {
      try {
        loadingTask.destroy();
      } catch {
        // Ignore.
      }
    }
    window.location.reload();
  });

  chooseFileButton.addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('pdfviewer.html');
  });

  closeButton.addEventListener('click', () => {
    window.close();
  });

  window.addEventListener('keydown', (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key.toLowerCase() !== 't') return;
    event.preventDefault();
    document.dispatchEvent(new CustomEvent('scholarlens-run', { detail: { mode: 'translate' } }));
  });

  async function initLanguage() {
    try {
      const stored = await chrome.storage.local.get('scholarlensSettings');
      i18n = makeI18n(stored?.scholarlensSettings?.uiLanguage || 'auto');
    } catch {
      // Keep the system-derived language.
    }
    localizeDom(document.documentElement, i18n.lang);
    if (startScreen.hidden === false) fileLabel.textContent = t('选择 PDF', 'Choose PDF');
  }

  initLanguage();

  if (initialFile) {
    currentUrl = initialFile;
    openOnlinePdf(initialFile);
  } else {
    showStart();
  }
})();
