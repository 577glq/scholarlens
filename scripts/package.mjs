import fs from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';

const root = process.cwd();
const dist = path.join(root, 'dist');
const release = path.join(root, 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifestPath = path.join(dist, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error('dist/manifest.json is missing. Run the build first.');
}

const files = {};
function addPath(targetPath, archivePath) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(targetPath)) {
      addPath(path.join(targetPath, child), `${archivePath}/${child}`);
    }
    return;
  }
  files[archivePath] = new Uint8Array(fs.readFileSync(targetPath));
}

for (const entry of fs.readdirSync(dist)) {
  addPath(path.join(dist, entry), entry);
}

for (const name of ['README.md', 'LICENSE', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md']) {
  const file = path.join(root, name);
  if (fs.existsSync(file)) addPath(file, name);
}

if (fs.existsSync(path.join(root, 'docs'))) {
  addPath(path.join(root, 'docs'), 'docs');
}

const zipped = zipSync(files, { level: 9 });
fs.mkdirSync(release, { recursive: true });
const output = path.join(release, `ScholarLens-v${pkg.version}.zip`);
fs.writeFileSync(output, zipped);
console.log(`Packaged ${Object.keys(files).length} files → ${output} (${(zipped.length / 1024 / 1024).toFixed(2)} MB)`);
