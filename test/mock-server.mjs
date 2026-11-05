import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8765);
const requestLog = path.join(root, 'requests.jsonl');

const TRANSLATION = `该模型的目标是最小化交叉熵损失 ⟦M1⟧，其中 ⟦M2⟧ 表示参数规模、[[M3]] 表示数据规模。作者进一步指出，特征尺度 ⟦M4⟧ 与缩放指数 ⟦M5⟧、⟦M6⟧ 共同控制损失随规模下降的速度。

**核心结论**：模型性能随参数量与数据量呈幂律改善，而不是简单依赖单一规模。

- 当 $N$ 很小时，损失主要受模型容量限制。
- 当 $D$ 不足时，过拟合会削弱规模收益 [12]。
- 缩放指数 $\\alpha_N$ 与 $\\alpha_D$ 近似为常数。

$$L(N,D) = \\left(\\frac{N_c}{N}\\right)^{\\alpha_N} + \\left(\\frac{D_c}{D}\\right)^{\\alpha_D}$$

> 该结论适用于本文的实验区间，不应外推到数据重复训练的情形。`;

const TRANSLATION_EN = `The model minimizes cross-entropy loss ⟦M1⟧, where ⟦M2⟧ is parameter count and [[M3]] is dataset size. The authors show that the feature scale ⟦M4⟧ and scaling exponents ⟦M5⟧ and ⟦M6⟧ jointly control how quickly loss falls with scale.

**Key finding:** performance improves as a power law in both parameters and data, rather than depending on a single scale.

- For small $N$, loss is limited mainly by model capacity.
- When $D$ is insufficient, overfitting weakens the gains from scale [12].
- The scaling exponents $\\alpha_N$ and $\\alpha_D$ are approximately constant.

$$L(N,D) = \\left(\\frac{N_c}{N}\\right)^{\\alpha_N} + \\left(\\frac{D_c}{D}\\right)^{\\alpha_D}$$

> This holds within the experimental regime studied here and should not be extrapolated to repeated training data.`;

const EXPLANATION_EN = `**In one sentence**
This passage describes how language-model loss changes with parameter count $N$ and dataset size $D$ through a power law.

**Formulas and notation**
- ⟦M1⟧: mean cross-entropy over tokens; lower is better.
- On the compute-optimal frontier, loss is controlled by the feature scales $N_c$ and $D_c$ and the exponents $\\alpha_N$ and $\\alpha_D$.
- $N$ is the number of trainable parameters; $D$ is the number of training tokens.

**Core logic**
The authors decompose loss into a finite-capacity term and a finite-data term. If both improve as power laws, scaling reliably reduces loss, but the benefit diminishes with scale.

**Conditions and pitfalls**
- The relationship is an empirical fit, not a first-principles theorem.
- Do not extrapolate the exponents to repeated data or fundamentally different architectures.

$$\\mathcal{L}(N,D) \\approx L_\\infty + aN^{-\\alpha} + bD^{-\\beta}$$`;


const EXPLANATION = `**一句话概括**
这段内容用幂律描述语言模型的损失如何随参数量 $N$ 与数据量 $D$ 变化。

**公式与记号**
- ⟦M1⟧：模型在词元上的平均交叉熵，越低表示预测越准。
- 计算最优前沿上的损失由特征尺度 $N_c$、$D_c$ 和缩放指数 $\\alpha_N$、$\\alpha_D$ 共同决定。
- $N$ 表示可训练参数量，$D$ 表示训练词元数。

**关键逻辑**
作者把损失拆成“有限模型容量”和“有限数据”两项。若二者都按幂律改善，则扩大规模会稳定降低损失；但收益会随规模增大而递减。

**成立条件与易错点**
- 该关系是经验拟合，不是从第一性原理推出的定理。
- 不应把指数外推到训练数据重复或架构发生根本变化的区间。

$$\\mathcal{L}(N,D) \\approx L_\\infty + aN^{-\\alpha} + bD^{-\\beta}$$`;

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...extraHeaders,
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function sseChunks(text) {
  const parts = [];
  let cursor = 0;
  while (cursor < text.length) {
    const size = 7 + Math.floor(Math.random() * 16);
    parts.push(text.slice(cursor, cursor + size));
    cursor += size;
  }
  return parts;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    res.end();
    return;
  }

  if (url.pathname === '/csp.html') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'",
    });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CSP academic page</title>
      <link rel="stylesheet" href="/csp.css"></head><body>
      <main><h1>Strict CSP paper</h1>
      <p id="target">We study the loss <math display="inline"><semantics><mrow><mi>L</mi><mo>=</mo><msup><mi>N</mi><mrow><mo>−</mo><mi>α</mi></mrow></msup></mrow><annotation encoding="application/x-tex">L = N^{-\\alpha}</annotation></semantics></math> under a strict security policy. The selected paragraph should still show a styled ScholarLens panel.</p>
      </main></body></html>`);
    return;
  }

  if (url.pathname === '/csp.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    res.end('body{font-family:Georgia,serif;max-width:760px;margin:80px auto;line-height:1.8;color:#1b2b27;background:#faf7ef}main{padding:20px}');
    return;
  }

  if (url.pathname === '/sample.pdf') {
    const file = path.join(root, 'sample.pdf');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end('sample pdf missing');
      return;
    }
    const data = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': data.length,
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'inline; filename="sample.pdf"',
    });
    res.end(data);
    return;
  }

  if (url.pathname === '/demo.html') {
    const html = fs.readFileSync(path.join(root, 'demo.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: { message: 'invalid json' } });
      return;
    }
    const system = body.messages?.find((message) => message.role === 'system')?.content || '';
    const userText = body.messages?.at(-1)?.content || '';
    const mode = system.includes('导读助手') ? 'explain' : 'translate';
    fs.appendFileSync(
      requestLog,
      `${JSON.stringify({ mode, stream: body.stream, model: body.model, system, user: userText })}\n`,
    );

    if (body.stream === false) {
      sendJson(res, 200, {
        choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 },
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    });

    const hasPlaceholders = /⟦M\d+⟧/.test(userText);
    const wantsEnglish = /English/i.test(system);
    const text = !hasPlaceholders
      ? wantsEnglish
        ? 'This is a test translation from the PDF reader. Select text and press Alt+T to translate without copy-paste. Formulas and citation [12] stay intact.'
        : '这是 PDF 阅读器的测试译文。选中文字后按 Alt+T 即可直接翻译，不需要复制粘贴。公式会按原文保留，引用 [12] 也不会丢失。'
      : mode === 'explain'
        ? wantsEnglish
          ? EXPLANATION_EN
          : EXPLANATION
        : wantsEnglish
          ? TRANSLATION_EN
          : TRANSLATION;
    const responseText = system.includes('FORCE_MISSING_FORMULA')
      ? text.replace('⟦M6⟧', '')
      : text;
    const chunks = sseChunks(responseText);
    let index = 0;
    const timer = setInterval(() => {
      if (index < chunks.length) {
        const data = {
          id: 'chatcmpl-mock',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: chunks[index] }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        index += 1;
      } else {
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 420, completion_tokens: 180, total_tokens: 600 } })}\n\n`);
        res.write('data: [DONE]\n\n');
        clearInterval(timer);
        res.end();
      }
    }, 18);
    req.on('close', () => clearInterval(timer));
    return;
  }

  if (url.pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Mock API and demo served at http://127.0.0.1:${port}`);
});
