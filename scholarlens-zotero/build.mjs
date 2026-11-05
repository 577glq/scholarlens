/* ScholarLens for Zotero 构建脚本
 * 1. esbuild 打包 src/panel.js → build/content.js（IIFE，全局名 ScholarLensZotero）
 * 2. 复制 bootstrap/manifest/prefs/vendor 到 build/
 * 3. 打包为 release/scholarlens-zotero-<version>.xpi
 * 4. --install：把 .xpi 复制到 Zotero profile 的 extensions 目录
 */

import { build } from 'esbuild';
import { zipSync } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(projectRoot, 'src');
const buildDir = path.join(projectRoot, 'build');
const releaseDir = path.join(projectRoot, 'release');

const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
const version = manifest.version;

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });

/* 1. 打包 content bundle（css 以文本内联，运行时注入面板文档） */
await build({
  entryPoints: [path.join(srcDir, 'panel.js')],
  bundle: true,
  format: 'iife',
  globalName: 'ScholarLensZotero',
  target: ['firefox115'],
  platform: 'browser',
  charset: 'ascii',
  minify: false,
  legalComments: 'none',
  loader: { '.css': 'text' },
  outfile: path.join(buildDir, 'content.js'),
  logLevel: 'info',
});

/* 2. 复制静态文件 */
const copy = (rel) => {
  const from = path.join(srcDir, rel);
  const to = path.join(buildDir, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
for (const rel of ['manifest.json', 'bootstrap.js', 'prefs.xhtml', 'prefs.css', 'prefs-pane.js']) {
  copy(rel);
}

/* 3. KaTeX 字体 → vendor/fonts/（katex.min.css 本体已打进 bundle 文本） */
const katexFonts = path.join(projectRoot, 'node_modules/katex/dist/fonts');
if (fs.existsSync(katexFonts)) {
  const outFonts = path.join(buildDir, 'vendor/fonts');
  fs.mkdirSync(outFonts, { recursive: true });
  for (const file of fs.readdirSync(katexFonts)) {
    fs.copyFileSync(path.join(katexFonts, file), path.join(outFonts, file));
  }
} else {
  throw new Error('找不到 katex 字体，请先运行 npm install');
}

/* 4. 打包 .xpi（manifest 必须在压缩包根层） */
const files = {};
const addDir = (dir, rel = '') => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const key = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) addDir(full, key);
    else files[key] = new Uint8Array(fs.readFileSync(full));
  }
};
addDir(buildDir);
const xpiBytes = zipSync(files, { level: 6 });
const xpiPath = path.join(releaseDir, `scholarlens-zotero-${version}.xpi`);
fs.writeFileSync(xpiPath, xpiBytes);

const total = Object.keys(files).length;
console.log(`✔ 已生成 ${xpiPath}（${total} 个文件，${(xpiBytes.length / 1024).toFixed(0)} KB）`);

/* 5. --install：复制进 Zotero profile 的 extensions 目录 */
if (process.argv.includes('--install')) {
  const profileRoot = path.join(
    os.homedir(),
    'AppData/Roaming/Zotero/Zotero/Profiles',
  );
  if (!fs.existsSync(profileRoot)) {
    throw new Error(`未找到 Zotero profile 目录：${profileRoot}`);
  }
  const profiles = fs.readdirSync(profileRoot).filter((name) => name.endsWith('.default') || name.includes('.default'));
  if (!profiles.length) throw new Error('profile 目录下没有 .default profile');
  const target = path.join(profileRoot, profiles[0], 'extensions');
  fs.mkdirSync(target, { recursive: true });
  const dest = path.join(target, `${manifest.applications.zotero.id}.xpi`);
  fs.copyFileSync(xpiPath, dest);
  console.log(`✔ 已安装到 ${dest}\n  重启 Zotero 后生效。`);
}
