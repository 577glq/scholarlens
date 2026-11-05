import { build, context } from 'esbuild';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyStatic } from './scripts/static.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const isWatch = process.argv.includes('--watch');
const isE2E = process.env.E2E === '1';

async function buildAll() {
  await rm(dist, { recursive: true, force: true });
  const options = {
    entryPoints: {
      content: path.join(root, 'src', 'content.js'),
      background: path.join(root, 'src', 'background.js'),
      options: path.join(root, 'src', 'options.js'),
      popup: path.join(root, 'src', 'popup.js'),
    },
    bundle: true,
    outdir: dist,
    format: 'iife',
    target: ['chrome109'],
    platform: 'browser',
    charset: 'ascii',
    minify: !isWatch,
    legalComments: 'none',
    loader: { '.css': 'text' },
    logLevel: 'info',
  };
  if (!isWatch) {
    await build(options);
    await copyStatic({ dist, isE2E });
    await validateContentEncoding();
    return null;
  }
  const ctx = await context(options);
  await ctx.rebuild();
  await copyStatic({ dist, isE2E });
  await validateContentEncoding();
  return ctx;
}

async function validateContentEncoding() {
  const content = await readFile(path.join(dist, 'content.js'), 'utf8');
  if (/[\uFFFE\uFFFF]/.test(content)) {
    throw new Error('content.js contains Unicode noncharacters rejected by Chrome. Rebuild with charset: ascii.');
  }
}

const ctx = await buildAll();
if (!isWatch) {
  console.log(`Built extension → ${dist}`);
} else {
  console.log('Watching source files…');
  const { watch } = await import('node:fs');
  let timer;
  watch(path.join(root, 'src'), { recursive: true }, async () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await ctx.rebuild();
        await copyStatic({ dist, isE2E });
        console.log('Rebuilt.');
      } catch (error) {
        console.error(error);
      }
    }, 120);
  });
}
