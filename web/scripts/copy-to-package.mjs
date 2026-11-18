// Copies the built app into the Python package, where `lineum build` picks it up.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const target = join(root, '../src/lineum/static');
mkdirSync(target, { recursive: true });
for (const name of ['lineum.js', 'lineum.css']) {
  const source = join(dist, name);
  if (!existsSync(source)) {
    console.error(`Missing ${source}. Files in dist: ${readdirSync(dist).join(', ')}`);
    process.exit(1);
  }
  copyFileSync(source, join(target, name));
  console.log(`copied web/dist/${name} → src/lineum/static/${name}`);
}
copyFileSync(join(root, 'public/favicon.svg'), join(target, 'favicon.svg'));
