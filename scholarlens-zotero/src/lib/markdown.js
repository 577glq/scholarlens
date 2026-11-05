import katex from 'katex';

const MARK_AT = [
  /^⟦\s*M(\d+)\s*⟧/i,
  /^\[\[\s*M(\d+)\s*\]\]/i,
  /^[【〖]\s*M(\d+)\s*[】〗]/i,
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderFormula(latex, display) {
  const wrap = el(display ? 'div' : 'span', display ? 'sl-formula sl-formula-display' : 'sl-formula');
  wrap.setAttribute('data-latex', latex);
  try {
    katex.render(latex, wrap, {
      displayMode: Boolean(display),
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'htmlAndMathml',
    });
  } catch {
    wrap.textContent = latex;
    wrap.classList.add('sl-formula-error');
    wrap.title = '公式渲染失败，已显示 LaTeX 源码';
  }
  return wrap;
}

function matchMarker(text, index, formulaMap) {
  const slice = text.slice(index);
  for (const pattern of MARK_AT) {
    const match = slice.match(pattern);
    if (!match) continue;
    const formula = formulaMap.get(Number(match[1]));
    return {
      length: match[0].length,
      formula: formula || null,
      label: match[0],
      id: Number(match[1]),
    };
  }
  return null;
}

function safeUrl(raw) {
  const url = String(raw || '').trim().replace(/^<|>$/g, '');
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  return '';
}

function plausibleInlineMath(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 800) return false;
  if (/<\/?[a-z][^>]*>/i.test(text)) return false;
  if (/^[A-Za-z]$/.test(text)) return true;
  if (/^[A-Za-z][A-Za-z0-9]{1,3}$/.test(text)) return true;
  if (/^[A-Za-z]\([^)]{1,24}\)$/.test(text)) return true;
  return /\\[a-zA-Z]+|[=+\-*/^_{}<>≤≥≈≠±×÷·∑∏∫√∞∂∇→←↔]|\d/.test(text);
}

function findClosingDollar(text, start) {
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] !== '$') continue;
    if (text[i - 1] === '\\') continue;
    return i;
  }
  return -1;
}

function appendText(fragment, value) {
  if (!value) return;
  const last = fragment.lastChild;
  if (last?.nodeType === Node.TEXT_NODE) {
    last.textContent += value;
  } else {
    fragment.appendChild(document.createTextNode(value));
  }
}

function renderInline(text, formulaMap) {
  const fragment = document.createDocumentFragment();
  let i = 0;
  let plain = '';

  const flush = () => {
    appendText(fragment, plain);
    plain = '';
  };

  while (i < text.length) {
    const char = text[i];

    const marker = matchMarker(text, i, formulaMap);
    if (marker) {
      flush();
      if (marker.formula) {
        fragment.appendChild(renderFormula(marker.formula.latex, false));
      } else {
        const missing = el('span', 'sl-formula-missing', `公式 M${marker.id}`);
        missing.title = '模型引用了原文中不存在的公式编号';
        fragment.appendChild(missing);
      }
      i += marker.length;
      continue;
    }

    if (char === '\\' && (text[i + 1] === '(' || text[i + 1] === '[')) {
      const closing = text[i + 1] === '(' ? '\\)' : '\\]';
      const end = text.indexOf(closing, i + 2);
      if (end !== -1) {
        const latex = text.slice(i + 2, end).trim();
        if (latex) {
          flush();
          fragment.appendChild(renderFormula(latex, false));
          i = end + 2;
          continue;
        }
      }
    }

    if (char === '$') {
      if (text[i + 1] === '$') {
        const end = text.indexOf('$$', i + 2);
        if (end !== -1) {
          const latex = text.slice(i + 2, end).trim();
          if (latex) {
            flush();
            fragment.appendChild(renderFormula(latex, false));
            i = end + 2;
            continue;
          }
        }
      } else {
        const end = findClosingDollar(text, i);
        if (end !== -1) {
          const latex = text.slice(i + 1, end);
          if (plausibleInlineMath(latex) && !/^\s|\s$/.test(latex)) {
            flush();
            fragment.appendChild(renderFormula(latex.trim(), false));
            i = end + 1;
            continue;
          }
        }
      }
    }

    if (char === '`') {
      let end = text.indexOf('`', i + 1);
      while (end !== -1 && text[end - 1] === '\\') end = text.indexOf('`', end + 1);
      if (end !== -1) {
        flush();
        fragment.appendChild(el('code', 'sl-code-inline', text.slice(i + 1, end)));
        i = end + 1;
        continue;
      }
    }

    if (text.startsWith('**', i) || text.startsWith('__', i)) {
      const delim = text.slice(i, i + 2);
      const end = text.indexOf(delim, i + 2);
      if (end > i + 2) {
        flush();
        const strong = el('strong');
        strong.appendChild(renderInline(text.slice(i + 2, end), formulaMap));
        fragment.appendChild(strong);
        i = end + 2;
        continue;
      }
    }

    if (char === '*' || char === '_') {
      const prev = i > 0 ? text[i - 1] : '';
      const next = text[i + 1] || '';
      const boundaryOk =
        char === '*' || (!/[\w]/.test(prev) && Boolean(next) && !/\s/.test(next));
      if (boundaryOk) {
        let end = text.indexOf(char, i + 1);
        while (end !== -1 && text[end - 1] === '\\') end = text.indexOf(char, end + 1);
        if (end > i + 1) {
          flush();
          const em = el('em');
          em.appendChild(renderInline(text.slice(i + 1, end), formulaMap));
          fragment.appendChild(em);
          i = end + 1;
          continue;
        }
      }
    }

    if (char === '[') {
      const match = text.slice(i).match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
      if (match) {
        const href = safeUrl(match[2]);
        if (href) {
          flush();
          const link = el('a', 'sl-link', match[1]);
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          fragment.appendChild(link);
          i += match[0].length;
          continue;
        }
      }
    }

    if (char === '\\' && i + 1 < text.length) {
      const next = text[i + 1];
      if ('\\`*_{}[]()#+-.!$'.includes(next)) {
        plain += next;
        i += 2;
        continue;
      }
    }

    plain += char;
    i += 1;
  }

  flush();
  return fragment;
}

function splitTableRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function startsBlock(lines, index) {
  const line = lines[index] || '';
  const trim = line.trim();
  if (!trim) return true;
  if (/^```/.test(trim)) return true;
  if (/^#{1,4}\s+/.test(trim)) return true;
  if (/^(?:\*\*|__)[^*_]+(?:\*\*|__)$/.test(trim)) return true;
  if (/^>\s?/.test(trim)) return true;
  if (/^([-*+]|\d+[.)])\s+/.test(trim)) return true;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trim)) return true;
  if (trim === '$$' || trim.startsWith('$$') || trim === '\\[' || trim.startsWith('\\[')) return true;
  if (/^⟦\s*M\d+\s*⟧$/.test(trim)) return true;
  if (/^\|.*\|$/.test(trim) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) return true;
  return false;
}

function collectDisplayMath(lines, index) {
  const line = lines[index].trim();
  if (line.startsWith('$$')) {
    if (line.length > 4 && line.endsWith('$$')) {
      return { latex: line.slice(2, -2).trim(), next: index + 1 };
    }
    const body = [line.slice(2)];
    let i = index + 1;
    while (i < lines.length) {
      const current = lines[i];
      if (current.trim().endsWith('$$')) {
        body.push(current.trim().slice(0, -2));
        return { latex: body.join('\n').trim(), next: i + 1 };
      }
      body.push(current);
      i += 1;
    }
    return { latex: body.join('\n').trim(), next: i };
  }
  if (line.startsWith('\\[')) {
    if (line.endsWith('\\]') && line.length > 4) {
      return { latex: line.slice(2, -2).trim(), next: index + 1 };
    }
    const body = [line.slice(2)];
    let i = index + 1;
    while (i < lines.length) {
      if (lines[i].trim().endsWith('\\]')) {
        body.push(lines[i].trim().slice(0, -2));
        return { latex: body.join('\n').trim(), next: i + 1 };
      }
      body.push(lines[i]);
      i += 1;
    }
    return { latex: body.join('\n').trim(), next: i };
  }
  return null;
}

export function renderMarkdown(markdown, formulaMap) {
  const root = el('div', 'sl-markdown');
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trim = line.trim();
    if (!trim) {
      i += 1;
      continue;
    }

    if (/^```/.test(trim)) {
      const language = trim.slice(3).trim();
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      const pre = el('pre', 'sl-pre');
      const code = el('code', '', body.join('\n'));
      if (language) code.setAttribute('data-language', language);
      pre.appendChild(code);
      root.appendChild(pre);
      continue;
    }

    if (trim === '$$' || trim.startsWith('$$') || trim === '\\[' || trim.startsWith('\\[')) {
      const math = collectDisplayMath(lines, i);
      if (math?.latex) root.appendChild(renderFormula(math.latex, true));
      i = math?.next ?? i + 1;
      continue;
    }

    const standaloneMarker = trim.match(/^⟦\s*M(\d+)\s*⟧$/i) || trim.match(/^\[\[\s*M(\d+)\s*\]\]$/i);
    if (standaloneMarker) {
      const formula = formulaMap.get(Number(standaloneMarker[1]));
      if (formula) {
        root.appendChild(renderFormula(formula.latex, formula.display));
      } else {
        const p = el('p');
        p.appendChild(renderInline(trim, formulaMap));
        root.appendChild(p);
      }
      i += 1;
      continue;
    }

    const heading = trim.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length + 2);
      const node = el(`h${level}`, 'sl-heading');
      node.appendChild(renderInline(heading[2], formulaMap));
      root.appendChild(node);
      i += 1;
      continue;
    }

    const boldLabel = trim.match(/^(?:\*\*|__)([^*_]+)(?:\*\*|__)$/);
    if (boldLabel) {
      const node = el('div', 'sl-heading');
      node.appendChild(renderInline(boldLabel[1], formulaMap));
      root.appendChild(node);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trim)) {
      root.appendChild(el('hr', 'sl-hr'));
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trim)) {
      const quote = el('blockquote', 'sl-quote');
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        body.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      quote.appendChild(renderInline(body.join(' '), formulaMap));
      root.appendChild(quote);
      continue;
    }

    if (/^\|.*\|$/.test(trim) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const table = el('table', 'sl-table');
      const thead = el('thead');
      const headerRow = el('tr');
      for (const cell of splitTableRow(line)) {
        const th = el('th');
        th.appendChild(renderInline(cell, formulaMap));
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);
      i += 2;
      const tbody = el('tbody');
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const row = el('tr');
        for (const cell of splitTableRow(lines[i])) {
          const td = el('td');
          td.appendChild(renderInline(cell, formulaMap));
          row.appendChild(td);
        }
        tbody.appendChild(row);
        i += 1;
      }
      table.appendChild(tbody);
      root.appendChild(table);
      continue;
    }

    const listMatch = trim.match(/^([-*+]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const list = el(ordered ? 'ol' : 'ul', 'sl-list');
      while (i < lines.length) {
        const item = lines[i].trim().match(/^([-*+]|\d+[.)])\s+(.+)$/);
        if (!item) break;
        const li = el('li');
        let body = item[2];
        i += 1;
        while (i < lines.length && lines[i].trim() && !/^([-*+]|\d+[.)])\s+/.test(lines[i].trim()) && !startsBlock(lines, i)) {
          body += ` ${lines[i].trim()}`;
          i += 1;
        }
        li.appendChild(renderInline(body, formulaMap));
        list.appendChild(li);
      }
      root.appendChild(list);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && !startsBlock(lines, i)) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (!paragraph.length) {
      i += 1;
      continue;
    }
    const p = el('p');
    p.appendChild(renderInline(paragraph.join(' '), formulaMap));
    root.appendChild(p);
  }

  return root;
}

export function renderSingleFormula(latex, display = false) {
  return renderFormula(latex, display);
}
