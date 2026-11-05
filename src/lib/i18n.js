export const UI_LANGUAGE_DEFAULT = 'auto';

export const EN = {
  // Options — hero / shell
  'ScholarLens 设置 · 学术划词翻译': 'ScholarLens Settings · Academic Selection Translator',
  'ScholarLens 设置首页': 'ScholarLens settings home',
  '学术划词翻译': 'Academic Selection Translator',
  '本地优先': 'Local-first',
  '让论文阅读': 'Read papers',
  '不打断思路。': 'without losing your train of thought.',
  '选中段落即可翻译或解释。公式会被单独抽取、保护，并以 KaTeX 还原；术语、引用与符号保持原样。':
    'Select a passage to translate or explain. Formulas are extracted, protected, and rendered with KaTeX; terminology, citations, and symbols stay intact.',
  '正在读取配置…': 'Reading configuration…',
  '支持 MathML · KaTeX · MathJax · LaTeX': 'Supports MathML · KaTeX · MathJax · LaTeX',
  '关闭欢迎提示': 'Close welcome message',
  '欢迎使用': 'Welcome',
  '三步开始阅读': 'Three steps to start reading',
  '填入你的 API Key，保存设置。': 'Add your API key and save your settings.',
  '回到论文页面，选中一段文字或一个公式。': 'Return to the paper, then select text or a formula.',
  '点击浮出的「翻译」或「解释」；也可用右键菜单和快捷键。':
    'Click Translate or Explain in the floating toolbar, or use the context menu or shortcuts.',
  '还差一步：': 'One more step: ',
  '填写 API Key 后即可开始使用。密钥只保存在本机浏览器中。':
    'Add your API key to get started. It is stored only in this browser.',
  '连接模型': 'Connect a model',
  '兼容 OpenAI Chat Completions 接口。默认使用 DeepSeek。':
    'Works with any OpenAI Chat Completions API. DeepSeek is the default.',
  '本地 Ollama': 'Local Ollama',
  '若接口完整地址以': 'If the full endpoint ends with',
  '结尾，也可以直接粘贴完整地址。': ', you can paste the full URL here.',
  '显示': 'Show',
  '隐藏': 'Hide',
  '存储于': 'Stored in',
  '，不会上传到 ScholarLens 的任何服务器。本地服务可留空。':
    ', never sent to any ScholarLens server. Leave blank for local services.',
  '模型': 'Model',
  '测试连接': 'Test connection',
  '翻译偏好': 'Translation preferences',
  '告诉模型你的领域和术语习惯，会比通用翻译更准确。':
    'Tell the model your field and terminology preferences for more accurate translations.',
  '目标语言': 'Target language',
  '常用目标语言': 'Common target languages',
  '简体中文': 'Simplified Chinese',
  '繁體中文': 'Traditional Chinese',
  '日本語': 'Japanese',
  '领域与术语偏好': 'Field and terminology preferences',
  '可选': 'Optional',
  '例如：机器学习系统方向；transformer 统一译为“变换器”，KV cache 保留英文；保持作者使用的时态强度。':
    'For example: machine learning systems; translate transformer as “变换器” consistently; keep KV cache in English; preserve the author’s tense strength.',
  '例如：机器学习系统方向；transformer 统一译为“变换器”，KV cache 保留英文；保持作者使用的时态强度。':
    'For example: machine learning systems; translate transformer as “变换器” consistently; keep KV cache in English; preserve the author’s tense strength.',
  '每次翻译都会附加这段偏好，最多 3000 字符。':
    'This preference is appended to every translation request (up to 3,000 characters).',
  '选中文字后显示快捷按钮': 'Show quick actions after selecting text',
  '关闭后仍可通过右键菜单或快捷键使用。':
    'When disabled, you can still use the context menu or keyboard shortcuts.',
  '高级选项': 'Advanced options',
  '模型温度': 'Model temperature',
  '更稳定 · 适合术语': 'More stable · better for terminology',
  '更灵活 · 适合润色': 'More flexible · better for polishing',
  '保存设置': 'Save settings',
  '保存中…': 'Saving…',
  '恢复默认': 'Reset defaults',
  '在论文页面上': 'On a paper page',
  '划过一句或一段': 'Select a sentence or paragraph',
  '松开鼠标后，选区旁会出现「翻译 / 解释」。':
    'On mouse-up, Translate / Explain appears next to the selection.',
  '只选中公式也可以': 'Formula-only selections work too',
  '公式会被识别为独立对象，自动切换为逐符号解释。':
    'Formulas are detected as objects and open in symbol-by-symbol explain mode.',
  '复制带 LaTeX 的 Markdown': 'Copy Markdown with LaTeX',
  '粘进笔记软件后，公式仍可继续渲染或编辑。':
    'Paste into your notes app and keep formulas renderable and editable.',
  '翻译选区': 'Translate selection',
  '解释选区': 'Explain selection',
  '数据如何流动': 'How your data flows',
  '选中的文字与公式在页面内提取。': 'Selected text and formulas are extracted in the page.',
  '点击处理时，只把当前选区发送到你配置的模型接口。':
    'Only the current selection is sent to your configured model endpoint when you act.',
  'API Key 与偏好设置保存在本机浏览器。':
    'Your API key and preferences stay in this browser.',
  '没有 ScholarLens 中转服务器，也没有统计埋点。':
    'There is no ScholarLens relay server and no analytics.',
  '请遵守你所在机构对论文内容与第三方 API 的使用规定。':
    'Follow your institution’s rules for paper content and third-party APIs.',
  '公式识别提示': 'Formula detection tip',
  '网页使用 MathML、KaTeX、MathJax 或文本中的 LaTeX 时效果最好；纯图片公式会读取图片的 alt 文本。':
    'Best results come from MathML, KaTeX, MathJax, or LaTeX in page text; image-only formulas use the image alt text.',
  'ScholarLens · 为不打断思路的论文阅读而做':
    'ScholarLens · For reading papers without losing your train of thought',
  'API 配置参考': 'API configuration guide',
  'API Key 已保留': 'API key kept',
  '设置页加载失败': 'Settings page failed to load',
  '尚未配置 API Key，粘贴文字后无法调用模型。':
    'No API key configured. Paste text after adding a key to call the model.',
  '去设置': 'Open settings',
  '界面语言': 'Interface language',
  '切换设置页、浮层、弹窗和 PDF 阅读器的界面语言；目标语言与它互不影响。':
    'Changes the language of Settings, the selection panel, the popup, and the PDF reader. This is independent of the target language.',
  '自动': 'Auto',
  '中文': '中文',
  'English': 'English',

  // Popup
  'ScholarLens · PDF / 剪贴板翻译': 'ScholarLens · PDF & Clipboard Translator',
  '这是 PDF 页面': 'This is a PDF page',
  '在 ScholarLens 阅读器中打开，选中文字按 Alt+T 直接翻译，不用复制粘贴。':
    'Open it in the ScholarLens reader, then select text and press Alt+T. No copy-paste needed.',
  '打开阅读器': 'Open reader',
  '处理方式': 'Action',
  '要翻译的文字': 'Text to translate',
  '把 PDF 或论文中的英文粘贴到这里…\n\n支持 $...$、\\(...\\)、\\[...\\] 形式的 LaTeX 公式。':
    'Paste English from a PDF or paper here…\n\nSupports $...$, \\(...\\), and \\[...\\] LaTeX formulas.',
  '0 字符': '0 characters',
  'Ctrl+Enter 开始': 'Ctrl+Enter to start',
  'PDF 建议': 'PDF tip',
  '在 PDF 页面点扩展图标后，优先用「打开阅读器」直接选中 + Alt+T；阅读器无法载入时，再复制文字到这里粘贴。':
    'On a PDF, click the toolbar icon and use Open reader to select text and press Alt+T. If the reader cannot load it, paste the text here instead.',
  '打开 PDF 阅读器': 'Open PDF reader',
  '清空': 'Clear',
  '← 返回编辑': '← Back to editor',
  '公式对照': 'Formula reference',
  '准备就绪': 'Ready',
  '停止': 'Stop',
  '重试': 'Retry',
  '复制 Markdown': 'Copy Markdown',
  '公式在本地抽取，只有当前文本会发送到你配置的接口。':
    'Formulas are extracted locally; only the current text is sent to your configured endpoint.',
  '关闭': 'Close',
  '设置': 'Settings',
  '打开设置': 'Open settings',
  '复制 LaTeX': 'Copy LaTeX',
  '查看公式': 'View formulas',
  '打开 PDF 阅读器': 'Open PDF reader',

  // PDF reader
  'ScholarLens PDF Reader': 'ScholarLens PDF Reader',
  'PDF READER': 'PDF READER',
  '上一页': 'Previous page',
  '下一页': 'Next page',
  '缩小': 'Zoom out',
  '放大': 'Zoom in',
  '适合宽度': 'Fit width',
  '选中 PDF 中的文字后按 Alt + T 直接翻译；也可以点击浮出的按钮。':
    'Select text in the PDF and press Alt+T to translate. You can also use the floating button.',
  '打开论文 PDF': 'Open a paper PDF',
  '选择本地 PDF，或粘贴在线 PDF 链接。打开后选中文字，按 Alt + T 直接翻译。':
    'Choose a local PDF or paste a URL to an online PDF. After it opens, select text and press Alt+T.',
  '也可以把 PDF 拖到这里': 'You can also drop a PDF here',
  '选择本地 PDF': 'Choose a local PDF',
  '或粘贴在线 PDF 链接': 'or paste an online PDF link',
  '打开': 'Open',
  'PDF 只在本机渲染，不会上传到 ScholarLens。':
    'PDFs are rendered locally and never uploaded to ScholarLens.',
  '正在渲染 PDF': 'Rendering PDF',
  '首次打开需要下载并建立文字层…': 'The first load downloads the PDF and builds its text layer…',
  '无法打开这个 PDF': 'Could not open this PDF',
  '请返回论文页面，使用工具栏弹窗重新打开。':
    'Return to the paper page and reopen it from the toolbar popup.',
  '授权访问 PDF 域名': 'Authorize PDF domain',
  '选择其他 PDF': 'Choose another PDF',
  '关闭页面': 'Close page',
  'PDF 组件没有加载': 'PDF components did not load',
  '扩展文件可能不完整，请重新加载扩展或重新安装。':
    'The extension files may be incomplete. Reload or reinstall the extension.',
  '没有 PDF 地址': 'No PDF URL',
  '请从 PDF 阅读页面点击 ScholarLens 工具栏图标，选择“用 ScholarLens 阅读器打开”。':
    'Click the ScholarLens toolbar icon on a PDF page and choose Open reader.',
  '不支持这个 PDF 地址': 'Unsupported PDF URL',
  '当前只支持 http/https 的在线 PDF。本地文件请先启用扩展的“允许访问文件 URL”，或改用复制粘贴模式。':
    'Only http/https PDFs are supported here. For local files, use the file picker in the reader.',
  '需要访问 PDF 域名的权限': 'PDF domain permission required',
  '浏览器还没有授予访问': 'The browser has not granted access to',
  '的权限。点击下方按钮授权后即可载入，扩展只会在你打开 PDF 时访问该域名。':
    '. Authorize below to load it. The extension only accesses this domain when you open a PDF.',
  'PDF 读取失败': 'Could not read PDF',
  '无法从': 'Could not fetch',
  '读取这个 PDF。可能需要在原站点登录、PDF 已被移动，或该服务器禁止扩展抓取。':
    '. The PDF may require login, may have moved, or the server may block extension fetches.',
  '无法读取这个 PDF 文件。': 'Could not read this PDF file.',
  'PDF 解析失败': 'Could not parse PDF',
  '这个文件可能不是有效的 PDF，或使用了暂不支持的格式。':
    'This file may not be a valid PDF or may use an unsupported format.',
  'PDF 需要密码': 'PDF is password protected',
  'ScholarLens 暂不支持加密 PDF。请先在 PDF 阅读器中解除密码后再打开。':
    'ScholarLens does not support encrypted PDFs. Remove the password first.',
  '没有获得访问权限': 'Permission not granted',
  '你可以在 edge://extensions → ScholarLens → 详细信息中授予该站点的访问权限，或返回论文页面使用粘贴模式。':
    'Grant site access from edge://extensions → ScholarLens → Details, or use paste mode instead.',
  '正在建立文字层…': 'Building text layer…',
  '选择 PDF': 'Choose PDF',
  '请选择 .pdf 文件。': 'Please choose a .pdf file.',
  'PDF 链接格式不正确。': 'Invalid PDF URL.',
  '只支持 http/https 的在线 PDF，或直接选择本地 PDF 文件。':
    'Only http/https PDFs are supported, or choose a local PDF file.',
  '无法读取本地 PDF': 'Could not read local PDF',
  '点击下方按钮授权后即可载入，扩展只会在你打开 PDF 时访问该域名。':
    'Authorize below to load it. The extension only accesses this domain when you open a PDF.',

  // Content panel static
  'ScholarLens 划词操作': 'ScholarLens selection actions',
  'ScholarLens 学术翻译': 'ScholarLens academic translation',
  'ScholarLens 设置': 'ScholarLens settings',
  '关闭面板': 'Close panel',
  '原文': 'Source',
  '公式对照': 'Formula reference',
  '准备就绪': 'Ready',
  '正在载入 PDF…': 'Loading PDF…',
  '选中 PDF 中的文字后按': 'Select text in the PDF, then press',
  '直接翻译；也可以点击浮出的按钮。': 'to translate. You can also use the floating button.',
  '选择本地 PDF，或粘贴在线 PDF 链接。打开后选中文字，按':
    'Choose a local PDF or paste an online PDF link. After it opens, select text and press',
  '直接翻译。': 'to translate.',
  '或粘贴在线 PDF 链接': 'or paste an online PDF link',
  '打开论文 PDF': 'Open a paper PDF',
  '也可以把 PDF 拖到这里': 'You can also drop a PDF here',
  '选择本地 PDF': 'Choose a local PDF',
  '打开': 'Open',
  'PDF 只在本机渲染，不会上传到 ScholarLens。':
    'PDFs are rendered locally and never uploaded to ScholarLens.',
  '正在渲染 PDF': 'Rendering PDF',
  '首次打开需要下载并建立文字层…': 'The first load downloads the PDF and builds its text layer…',
  '无法打开这个 PDF': 'Could not open this PDF',
  '请返回论文页面，使用工具栏弹窗重新打开。':
    'Return to the paper page and reopen it from the toolbar popup.',
  '授权访问 PDF 域名': 'Authorize PDF domain',
  '选择其他 PDF': 'Choose another PDF',
  '关闭页面': 'Close page',
  '在 ScholarLens 阅读器中打开，选中文字按': 'Open it in the ScholarLens reader, select text, and press',
  '直接翻译，不用复制粘贴。': 'to translate. No copy-paste needed.',
  '在 PDF 页面点扩展图标后，优先用「打开阅读器」直接选中 +':
    'On a PDF, click the toolbar icon and use Open reader to select text +',
  '；阅读器无法载入时，再复制文字到这里粘贴。':
    '. If the reader cannot load it, paste the text here.',
  '公式在本地抽取，只有当前文本会发送到你配置的接口。':
    'Formulas are extracted locally; only the current text is sent to your configured endpoint.',
  '关闭': 'Close',
  '打开': 'Open',
  '选中公式': 'Formula selected',
  '个公式': 'formulas',
  '已截取': 'truncated',
  '翻译': 'Translate',
  '解释': 'Explain',
  '关闭 (Esc)': 'Close (Esc)',
};


const EN_ATTR = {
  'ScholarLens 设置首页': 'ScholarLens settings home',
  '关闭欢迎提示': 'Close welcome message',
  '显示或隐藏 API Key': 'Show or hide API key',
  '显示 API Key': 'Show API key',
  '隐藏 API Key': 'Hide API key',
  '服务预设': 'Service presets',
  '常用目标语言': 'Common target languages',
  '设置': 'Settings',
  '打开设置': 'Open settings',
  '关闭': 'Close',
  '处理方式': 'Action',
  '要翻译的文字': 'Text to translate',
  '上一页': 'Previous page',
  '下一页': 'Next page',
  '缩小': 'Zoom out',
  '放大': 'Zoom in',
  '关闭欢迎提示': 'Close welcome message',
  '复制 LaTeX': 'Copy LaTeX',
};

const originalText = new WeakMap();
const originalAttrs = new WeakMap();
const SKIP = 'script, style, code, pre, textarea, [data-no-i18n], .sl-result, .sl-source-body, .sl-formula-list, .sl-toast, .pop-result, .pop-formula-list';
const ATTR_SKIP = 'script, style, code, pre, [data-no-i18n]';

export function resolveUiLanguage(setting, systemLanguage = navigator.language) {
  if (setting === 'en' || setting === 'zh') return setting;
  return String(systemLanguage || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function makeI18n(setting, systemLanguage) {
  const lang = resolveUiLanguage(setting, systemLanguage);
  const t = (zh, en) => (lang === 'en' ? en ?? EN[zh] ?? zh : zh);
  return { lang, t };
}

function translateNode(node, lang) {
  if (!originalText.has(node)) originalText.set(node, node.nodeValue);
  const original = originalText.get(node);
  if (lang !== 'en') {
    node.nodeValue = original;
    return;
  }
  const trimmed = original.trim();
  if (!trimmed) return;
  const translated = EN[trimmed];
  if (!translated) return;
  const leading = original.match(/^\s*/)?.[0] || '';
  const trailing = original.match(/\s*$/)?.[0] || '';
  node.nodeValue = `${leading}${translated}${trailing}`;
}

function translateAttributes(element, lang) {
  if (!originalAttrs.has(element)) originalAttrs.set(element, {});
  const store = originalAttrs.get(element);
  for (const name of ['placeholder', 'title', 'aria-label']) {
    if (!element.hasAttribute(name)) continue;
    if (!(name in store)) store[name] = element.getAttribute(name);
    const original = store[name];
    if (lang !== 'en') {
      element.setAttribute(name, original);
      continue;
    }
    const translated = EN_ATTR[original] || EN[original] || placeholderFallback(name, original);
    if (translated) element.setAttribute(name, translated);
  }
}

function placeholderFallback(name, value) {
  if (name !== 'placeholder') return '';
  if (value.startsWith('把 PDF 或论文中的英文')) {
    return 'Paste English from a PDF or paper here…\n\nSupports $...$, \\(...\\), and \\[...\\] LaTeX formulas.';
  }
  if (value.startsWith('例如：机器学习系统方向')) {
    return 'For example: machine learning systems; translate transformer as “变换器” consistently; keep KV cache in English; preserve the author’s tense strength.';
  }
  if (value.startsWith('例如：凝聚态物理')) {
    return 'For example: condensed matter physics / machine-learned potentials; translate nuclear quantum effects as “核量子效应”…';
  }
  return '';
}

export function localizeDom(root, lang) {
  if (!root) return;
  const doc = root.ownerDocument || root;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) translateNode(node, lang);

  const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
  for (const element of elements) {
    if (element.closest?.(ATTR_SKIP)) continue;
    translateAttributes(element, lang);
  }
  if (doc.documentElement) doc.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
}
