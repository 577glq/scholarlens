import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function copyStatic({ dist = path.join(root, 'dist'), isE2E = process.env.E2E === '1', clean = false } = {}) {
  if (clean) await rm(dist, { recursive: true, force: true });
  await mkdir(path.join(dist, 'vendor', 'fonts'), { recursive: true });
  await mkdir(path.join(dist, 'icons'), { recursive: true });
  await mkdir(path.join(dist, 'licenses'), { recursive: true });

  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, 'src', 'manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  if (isE2E) {
    manifest.host_permissions = [...new Set([...manifest.host_permissions, 'http://127.0.0.1/*'])];
  }
  await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));

  await cp(path.join(root, 'src', 'options.html'), path.join(dist, 'options.html'));
  await cp(path.join(root, 'src', 'options.css'), path.join(dist, 'options.css'));
  await cp(path.join(root, 'src', 'popup.html'), path.join(dist, 'popup.html'));
  await cp(path.join(root, 'src', 'popup.css'), path.join(dist, 'popup.css'));
  await cp(path.join(root, 'src', 'pdfviewer.html'), path.join(dist, 'pdfviewer.html'));
  await cp(path.join(root, 'src', 'pdfviewer.css'), path.join(dist, 'pdfviewer.css'));
  await cp(path.join(root, 'src', 'pdfviewer.js'), path.join(dist, 'pdfviewer.js'));
  await mkdir(path.join(dist, 'vendor', 'pdfjs'), { recursive: true });
  const pdfjs = path.join(root, 'node_modules', 'pdfjs-dist');
  await cp(path.join(pdfjs, 'build', 'pdf.min.js'), path.join(dist, 'vendor', 'pdfjs', 'pdf.min.js'));
  await cp(path.join(pdfjs, 'build', 'pdf.worker.min.js'), path.join(dist, 'vendor', 'pdfjs', 'pdf.worker.min.js'));
  await cp(path.join(pdfjs, 'web', 'pdf_viewer.js'), path.join(dist, 'vendor', 'pdfjs', 'pdf_viewer.js'));
  await cp(path.join(pdfjs, 'web', 'pdf_viewer.css'), path.join(dist, 'vendor', 'pdfjs', 'pdf_viewer.css'));
  await cp(path.join(pdfjs, 'web', 'images'), path.join(dist, 'vendor', 'pdfjs', 'images'), { recursive: true });
  await cp(path.join(pdfjs, 'cmaps'), path.join(dist, 'vendor', 'pdfjs', 'cmaps'), { recursive: true });
  await cp(path.join(pdfjs, 'standard_fonts'), path.join(dist, 'vendor', 'pdfjs', 'standard_fonts'), { recursive: true });
  await cp(path.join(pdfjs, 'LICENSE'), path.join(dist, 'licenses', 'pdfjs-LICENSE'));
  await cp(path.join(root, 'src', 'icons'), path.join(dist, 'icons'), { recursive: true });
  await cp(path.join(root, 'node_modules', 'katex', 'dist', 'katex.min.css'), path.join(dist, 'vendor', 'katex.min.css'));
  await cp(path.join(root, 'node_modules', 'katex', 'dist', 'fonts'), path.join(dist, 'vendor', 'fonts'), { recursive: true });
  await cp(path.join(root, 'node_modules', 'katex', 'LICENSE'), path.join(dist, 'licenses', 'KaTeX-LICENSE'));
  await cp(path.join(root, 'node_modules', 'mathml-to-latex', 'LICENSE.md'), path.join(dist, 'licenses', 'mathml-to-latex-LICENSE.md'));
  await cp(path.join(root, 'node_modules', '@xmldom', 'xmldom', 'LICENSE'), path.join(dist, 'licenses', 'xmldom-LICENSE'));
  console.log(`Static extension files prepared in ${dist}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await copyStatic({ clean: process.argv.includes('--clean') });
}
