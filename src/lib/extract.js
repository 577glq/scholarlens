import { MathMLToLaTeX } from 'mathml-to-latex';

export const MAX_SOURCE_CHARS = 8000;
const MARK_RE = /⟦M(\d+)⟧/g;
const MAX_FORMULA_CHARS = 2400;

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE',
  'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'CANVAS', 'IFRAME', 'OBJECT',
  'EMBED', 'VIDEO', 'AUDIO', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SVG',
]);

function makeMark(id) {
  return `⟦M${id}⟧`;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r\n ]+/g, ' ');
}

function looksLikeTex(value) {
  const text = String(value || '').trim();
  if (!text || text.length > MAX_FORMULA_CHARS) return false;
  return /\\[a-zA-Z]+|[\^_{}=<>≤≥≈≠±×÷·∑∏∫√∞∂∇→←↔]|\d/.test(text);
}

function stripMathDelimiters(value) {
  let tex = String(value || '').trim();
  if ((tex.startsWith('$$') && tex.endsWith('$$')) || (tex.startsWith('$') && tex.endsWith('$'))) {
    tex = tex.replace(/^\${1,2}/, '').replace(/\${1,2}$/, '').trim();
  }
  if (tex.startsWith('\\(') && tex.endsWith('\\)')) tex = tex.slice(2, -2).trim();
  if (tex.startsWith('\\[') && tex.endsWith('\\]')) tex = tex.slice(2, -2).trim();
  return tex;
}

function annotationTex(element) {
  const annotations = element.querySelectorAll('annotation');
  for (const annotation of annotations) {
    const encoding = (annotation.getAttribute('encoding') || '').toLowerCase();
    if (encoding.includes('tex') || encoding.includes('latex')) {
      const tex = annotation.textContent?.trim();
      if (tex) return tex;
    }
  }
  return '';
}

function mathmlToTex(mathElement) {
  try {
    const clone = mathElement.cloneNode(true);
    if (!clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
    }
    const tex = MathMLToLaTeX.convert(clone.outerHTML).trim();
    return tex || '';
  } catch {
    return '';
  }
}

function cleanImageAlt(alt) {
  let tex = String(alt || '').trim();
  if (!tex) return '';
  tex = tex.replace(/^\s*\{\\displaystyle\s*/, '');
  if (tex.endsWith('}') && (tex.match(/\{/g) || []).length < (tex.match(/\}/g) || []).length) {
    tex = tex.slice(0, -1);
  }
  tex = tex.replace(/^\s*\\\(|\\\)\s*$/g, '').trim();
  return tex;
}

function isDisplayFormula(element, kind) {
  if (kind === 'katex-display' || kind === 'mathjax-display') return true;
  if (element.matches?.('.katex-display, .MathJax_Display, .mwe-math-fallback-image-display')) return true;
  if (element.getAttribute?.('display') === 'block') return true;
  if (element.getAttribute?.('display') === 'true') return true;
  if (element.closest?.('.katex-display, .MathJax_Display')) return true;
  if (element.classList?.contains('mwe-math-fallback-image-display')) return true;
  const script = element.querySelector?.('script[type^="math/tex"]');
  if (script && /mode\s*=\s*display/i.test(script.getAttribute('type') || '')) return true;
  return false;
}

function formulaKind(element) {
  if (!element?.matches) return '';
  if (element.matches('math')) return 'mathml';
  if (element.matches('.katex')) return 'katex';
  if (element.matches('.katex-display')) return 'katex-display';
  if (element.matches('mjx-container, .mjx-container')) return 'mathjax3';
  if (element.matches('.MathJax_Display')) return 'mathjax-display';
  if (element.matches('.MathJax')) return 'mathjax2';
  if (element.matches('.mwe-math-element')) return 'mediawiki';
  if (element.matches('img')) {
    const alt = element.getAttribute('alt') || element.getAttribute('title') || '';
    const className = String(element.className || '');
    if (
      /mwe-math-fallback-image|tex|latex|mathjax/i.test(className) ||
      /\{\\displaystyle|\\[a-zA-Z]+|[\^_]\{/.test(alt)
    ) {
      return 'image';
    }
  }
  return '';
}

function extractFormula(element, kind) {
  let tex = '';
  let source = kind;
  let display = isDisplayFormula(element, kind);

  if (kind === 'katex' || kind === 'katex-display') {
    const root = kind === 'katex-display' ? element.querySelector('.katex') || element : element;
    tex = annotationTex(root);
    if (!tex) {
      const math = root.querySelector('math');
      if (math) tex = mathmlToTex(math);
    }
    source = 'KaTeX';
    display = kind === 'katex-display' || display;
  } else if (kind === 'mathjax3') {
    tex =
      element.getAttribute('data-latex') ||
      element.querySelector('[data-latex]')?.getAttribute('data-latex') ||
      '';
    if (!tex) {
      const math = element.querySelector('mjx-assistive-mml math') || element.querySelector('math');
      if (math) tex = mathmlToTex(math);
    }
    if (!tex) {
      const aria = element.getAttribute('aria-label') || '';
      if (looksLikeTex(aria)) tex = aria;
    }
    if (!tex) tex = element.querySelector('script[type^="math/tex"]')?.textContent?.trim() || '';
    source = 'MathJax';
    display = element.getAttribute('display') === 'true' || display;
  } else if (kind === 'mathjax2' || kind === 'mathjax-display') {
    const root = kind === 'mathjax-display' ? element.querySelector('.MathJax') || element : element;
    const script = root.querySelector('script[type^="math/tex"]');
    tex = script?.textContent?.trim() || '';
    if (!tex) {
      const math = root.querySelector('math');
      if (math) tex = mathmlToTex(math);
    }
    if (!tex) {
      const aria = root.getAttribute('aria-label') || '';
      if (looksLikeTex(aria)) tex = aria;
    }
    source = 'MathJax';
    display = kind === 'mathjax-display' || display;
  } else if (kind === 'mediawiki') {
    const math = element.querySelector('math');
    if (math) tex = annotationTex(math) || mathmlToTex(math);
    if (!tex) {
      const image = element.querySelector('img');
      if (image) tex = cleanImageAlt(image.getAttribute('alt') || image.getAttribute('title'));
    }
    source = 'MediaWiki';
    display = Boolean(element.closest('.mwe-math-element')) && /display|block/.test(element.className || '');
  } else if (kind === 'mathml') {
    tex = annotationTex(element) || mathmlToTex(element);
    source = 'MathML';
    display = element.getAttribute('display') === 'block' || display;
  } else if (kind === 'image') {
    tex = cleanImageAlt(element.getAttribute('alt') || element.getAttribute('title'));
    source = '公式图片';
    display = /mwe-math-fallback-image-display|display/.test(String(element.className || ''));
  }

  tex = stripMathDelimiters(tex);
  if (!tex) return null;
  tex = tex.slice(0, MAX_FORMULA_CHARS);
  return {
    latex: tex,
    display: Boolean(display),
    source,
  };
}

function plausiblyMath(value, display) {
  const text = String(value || '').trim();
  if (!text || text.length > MAX_FORMULA_CHARS) return false;
  if (/<\/?[a-z][^>]*>/i.test(text)) return false;
  const commands = /\\[a-zA-Z]+/.test(text);
  const operators = /[=+\-*/^_{}<>≤≥≈≠±×÷·∑∏∫√∞∂∇→←↔]/.test(text);
  const variables = /^[A-Za-z][A-Za-z0-9]?$/.test(text);
  const digits = /\d/.test(text);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (commands) return true;
  if (display) return operators || words <= 8;
  return operators || variables || digits || (words <= 2 && text.length <= 40);
}

/**
 * Replace LaTeX delimiters that appear in plain text with protected markers.
 * Mutates the formulas array and returns text with markers.
 */
function protectLatexInText(input, formulas) {
  const text = String(input || '');
  if (!text.includes('$') && !text.includes('\\(') && !text.includes('\\[') && !text.includes('\\begin')) {
    return text;
  }
  const delimiterPattern =
    /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)|(?<![\w$\\])\$(?![\s$])([^$\n]{1,800}?)(?<![\s\\])\$(?![\w$])/g;

  let out = '';
  let last = 0;
  let match;
  while ((match = delimiterPattern.exec(text))) {
    const display = match[1] !== undefined || match[2] !== undefined;
    const content = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
    if (!plausiblyMath(content, display)) continue;
    const id = formulas.length + 1;
    formulas.push({
      id,
      latex: stripMathDelimiters(content).slice(0, MAX_FORMULA_CHARS),
      display,
      source: 'LaTeX',
    });
    out += text.slice(last, match.index);
    out += display ? `\n\n${makeMark(id)}\n\n` : ` ${makeMark(id)} `;
    last = match.index + match[0].length;
  }
  out += text.slice(last);

  // LaTeX environments without dollar delimiters, e.g. \begin{equation}...\end{equation}
  const envPattern = /\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|eqnarray\*?)\}[\s\S]*?\\end\{\1\}/g;
  const envMatches = [...out.matchAll(envPattern)];
  for (const envMatch of envMatches) {
    const id = formulas.length + 1;
    formulas.push({ id, latex: envMatch[0], display: true, source: 'LaTeX' });
    out = out.replace(envMatch[0], `\n\n${makeMark(id)}\n\n`);
  }
  return out;
}

function safeClassName(element) {
  return typeof element.className === 'string' ? element.className : element.getAttribute('class') || '';
}

function walk(root, formulas) {
  let buffer = '';

  const push = (value) => {
    if (value) buffer += value;
  };

  const breakBlock = () => {
    buffer = buffer.replace(/[ \t]+$/, '');
    if (!buffer) return;
    if (buffer.endsWith('\n\n')) return;
    buffer += buffer.endsWith('\n') ? '\n' : '\n\n';
  };

  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      push(normalizeText(node.nodeValue));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node;
    const tag = element.tagName;
    const kind = formulaKind(element);
    if (kind) {
      const formula = extractFormula(element, kind);
      if (formula) {
        const id = formulas.length + 1;
        formulas.push({ id, ...formula });
        const mark = makeMark(id);
        if (formula.display) {
          breakBlock();
          push(`${mark}\n\n`);
        } else {
          push(` ${mark} `);
        }
        return;
      }
    }

    if (tag === 'SCRIPT' && /^math\/tex/i.test(element.getAttribute('type') || '')) {
      const latex = element.textContent?.trim();
      if (latex) {
        const id = formulas.length + 1;
        const display = /mode\s*=\s*display/i.test(element.getAttribute('type') || '');
        formulas.push({ id, latex, display, source: 'MathJax' });
        const mark = makeMark(id);
        if (display) {
          breakBlock();
          push(`${mark}\n\n`);
        } else {
          push(` ${mark} `);
        }
      }
      return;
    }
    if (SKIP_TAGS.has(tag)) return;
    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return;
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(element.getAttribute('style') || '')) return;

    if (tag === 'IMG') {
      const alt = normalizeText(element.getAttribute('alt') || element.getAttribute('title') || '');
      if (alt && alt.length >= 3 && !/^(image|figure|logo|icon|photo)$/i.test(alt)) push(` ${alt} `);
      return;
    }
    if (tag === 'BR') {
      push('\n');
      return;
    }
    if (tag === 'HR') {
      breakBlock();
      return;
    }

    const block = BLOCK_TAGS.has(tag);
    if (block) breakBlock();
    if (tag === 'LI') {
      if (buffer && !buffer.endsWith('\n')) push('\n');
      push('• ');
    } else if (tag === 'BLOCKQUOTE') {
      push('> ');
    } else if (tag === 'TD' || tag === 'TH') {
      push(' | ');
    }

    if (tag === 'CODE' && !element.closest('pre')) {
      push('`');
      for (const child of element.childNodes) visit(child);
      push('`');
      if (block) breakBlock();
      return;
    }

    for (const child of element.childNodes) visit(child);

    if (block) breakBlock();
  };

  for (const child of root.childNodes) visit(child);
  return buffer;
}

function trimPartialMarker(text) {
  const lastOpen = text.lastIndexOf('⟦');
  if (lastOpen === -1) return text;
  const tail = text.slice(lastOpen);
  if (!/^⟦M\d+⟧/.test(tail)) return text.slice(0, lastOpen);
  return text;
}

function truncate(text) {
  if (text.length <= MAX_SOURCE_CHARS) return { text, truncated: false };
  const slice = text.slice(0, MAX_SOURCE_CHARS);
  const boundary = Math.max(
    slice.lastIndexOf('\n\n'),
    slice.lastIndexOf('。'),
    slice.lastIndexOf('. '),
    slice.lastIndexOf('；'),
    slice.lastIndexOf('; '),
  );
  let cut = boundary > MAX_SOURCE_CHARS * 0.65 ? slice.slice(0, boundary + 1) : slice;
  cut = trimPartialMarker(cut).trim();
  return { text: cut, truncated: true };
}

function normalizeFinal(text) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:!?，。；：、！？])/g, '$1')
    .replace(/([（(])\s+/g, '$1')
    .replace(/\s+([）)])/g, '$1')
    .trim();
}

function finalize(text, formulas) {
  let output = String(text || '');

  // Display formulas should stand on their own line.
  for (const formula of formulas) {
    if (!formula.display) continue;
    const mark = makeMark(formula.id);
    output = output.replaceAll(mark, `\n\n${mark}\n\n`);
  }
  output = normalizeFinal(output);

  const truncation = truncate(output);
  output = truncation.text;

  output = normalizeFinal(output);
  const byId = new Map(formulas.map((formula) => [formula.id, formula]));
  const renumbered = [];
  const idMap = new Map();
  output = output.replace(MARK_RE, (whole, rawId) => {
    const source = byId.get(Number(rawId));
    if (!source) return '';
    if (!idMap.has(source.id)) {
      const next = renumbered.length + 1;
      idMap.set(source.id, next);
      renumbered.push({ ...source, id: next });
    }
    return makeMark(idMap.get(source.id));
  });

  output = normalizeFinal(output);
  const visible = output.replace(MARK_RE, '').replace(/[\s，。；：、,.;:!?（）()\-—]/g, '');
  return {
    text: output,
    formulas: renumbered,
    charCount: output.length,
    truncated: truncation.truncated,
    formulaOnly: renumbered.length > 0 && visible.length <= 12,
    formulaCount: renumbered.length,
  };
}

export function extractFromRange(range) {
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());
  const formulas = [];
  let text = walk(container, formulas);
  text = protectLatexInText(text, formulas);
  return finalize(text, formulas);
}

export function extractFromPlainText(input) {
  const formulas = [];
  const raw = String(input || '').replace(/\r\n?/g, '\n');
  const text = protectLatexInText(raw, formulas);
  return finalize(text, formulas);
}

export function getFocusSelectionText() {
  const active = document.activeElement;
  if (!active) return null;
  const tag = active.tagName;
  if (tag !== 'TEXTAREA' && tag !== 'INPUT') return null;
  if (tag === 'INPUT') {
    const type = (active.getAttribute('type') || 'text').toLowerCase();
    if (!['text', 'search', 'url', 'email', ''].includes(type)) return null;
  }
  const start = active.selectionStart;
  const end = active.selectionEnd;
  if (typeof start !== 'number' || typeof end !== 'number' || start === end) return null;
  const value = active.value.slice(Math.min(start, end), Math.max(start, end));
  if (!value.trim()) return null;
  return { kind: 'input', value, element: active };
}

export function selectionRect(range) {
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 || rect.height > 0);
  const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return null;
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
}
