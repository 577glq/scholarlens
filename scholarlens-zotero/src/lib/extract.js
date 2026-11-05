/* 从 ScholarLens src/lib/extract.js 移植的纯字符串部分。
 * 去掉了依赖浏览器 DOM 的公式抽取（Zotero 阅读器选区是纯文本），
 * 保留 LaTeX 定界符保护、占位符管线与模型输出清洗。
 */

export const MAX_SOURCE_CHARS = 8000;
const MARK_RE = /⟦M(\d+)⟧/g;
const MAX_FORMULA_CHARS = 2400;

function makeMark(id) {
  return `⟦M${id}⟧`;
}

function looksLikeTex(value) {
  const text = String(value || '').trim();
  if (!text || text.length > MAX_FORMULA_CHARS) return false;
  return /\\[a-zA-Z]+|[\^_{}=<>≤≥≈≠±×÷·∑∏∫√∞∂∇→←↔]|\d/.test(text);
}

export function stripMathDelimiters(value) {
  let tex = String(value || '').trim();
  if ((tex.startsWith('$$') && tex.endsWith('$$')) || (tex.startsWith('$') && tex.endsWith('$'))) {
    tex = tex.replace(/^\${1,2}/, '').replace(/\${1,2}$/, '').trim();
  }
  if (tex.startsWith('\\(') && tex.endsWith('\\)')) tex = tex.slice(2, -2).trim();
  if (tex.startsWith('\\[') && tex.endsWith('\\]')) tex = tex.slice(2, -2).trim();
  return tex;
}

export function plausiblyMath(value, display) {
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
 * 将纯文本里出现的 LaTeX 定界符替换成受保护的占位符。
 * 会向 formulas 数组追加公式记录，返回替换后的文本。
 */
export function protectLatexInText(input, formulas) {
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

  // 没有 $ 定界符的 LaTeX 环境，例如 \begin{equation}...\end{equation}
  const envPattern = /\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|eqnarray\*?)\}[\s\S]*?\\end\{\1\}/g;
  const envMatches = [...out.matchAll(envPattern)];
  for (const envMatch of envMatches) {
    const id = formulas.length + 1;
    formulas.push({ id, latex: envMatch[0], display: true, source: 'LaTeX' });
    out = out.replace(envMatch[0], `\n\n${makeMark(id)}\n\n`);
  }
  return out;
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

/** Zotero 阅读器选区是纯文本，直接走这条 DOM-free 入口。 */
export function extractFromPlainText(input) {
  const formulas = [];
  const raw = String(input || '').replace(/\r\n?/g, '\n');
  const text = protectLatexInText(raw, formulas);
  return finalize(text, formulas);
}

/** 容忍模型把 ⟦Mn⟧ 改写成 [[Mn]] / 【Mn】 等变体，统一回 ⟦Mn⟧。 */
export function normalizeFormulaPlaceholders(text, formulas) {
  const ids = new Set(formulas.map((formula) => formula.id));
  return String(text || '').replace(
    /⟦\s*M\s*(\d+)\s*⟧|\[\[\s*M\s*(\d+)\s*\]\]|[【〖]\s*M\s*(\d+)\s*[】〗]/gi,
    (whole, a, b, c) => {
      const id = Number(a || b || c);
      return ids.has(id) ? `⟦M${id}⟧` : whole;
    },
  );
}

/** 清洗模型输出：去零宽字符、代码围栏、“译文：”式前言。 */
export function cleanModelOutput(raw, formulas) {
  let text = String(raw || '').replace(/\u200b/g, '').trim();
  if (!text) return '';

  const fenced = text.match(/^```(?:markdown|md|latex|tex)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (fenced) text = fenced[1].trim();

  text = text.replace(/^(?:\*\*)?(?:译文|翻译结果|翻译|解释结果|解释)(?:\*\*)?\s*[:：]\s*\n?/i, '');
  text = text.replace(/^(?:好的[，,]\s*)?(?:以下是|这是).{0,24}(?:译文|翻译|解释)\s*[:：]?\s*$/im, '');
  text = normalizeFormulaPlaceholders(text, formulas);
  return text.trim();
}

/** 复制用：把占位符还原成 $...$ / $$...$$ 的 Markdown。 */
export function markdownWithLatex(text, formulas) {
  const map = new Map(formulas.map((formula) => [formula.id, formula]));
  return String(text || '').replace(/⟦M(\d+)⟧/g, (whole, rawId) => {
    const formula = map.get(Number(rawId));
    if (!formula) return whole;
    return formula.display ? `\n\n$$\n${formula.latex}\n$$\n\n` : ` $${formula.latex}$ `;
  });
}

/** 找出译文引用了但原文中不存在的公式编号（模型幻觉时提示）。 */
export function missingFormulas(text, formulas) {
  const known = new Set(formulas.map((formula) => formula.id));
  const missing = new Set();
  const re = /⟦\s*M\s*(\d+)\s*⟧|\[\[\s*M\s*(\d+)\s*\]\]|[【〖]\s*M\s*(\d+)\s*[】〗]/gi;
  let match;
  while ((match = re.exec(String(text || '')))) {
    const id = Number(match[1] || match[2] || match[3]);
    if (!known.has(id)) missing.add(id);
  }
  return [...missing].sort((a, b) => a - b);
}
