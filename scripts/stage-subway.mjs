#!/usr/bin/env node

// Explicit, release-only copy of the files needed at /miniprj/seoul-subway/.
// Nothing calls this script from the normal Astro build.
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'seoul-subway-3d-live');
const files = [
  'index.html',
  'src/styles.css',
  'src/theme.js',
  'src/trains.js',
  'src/live.js',
  'src/simulation.js',
  'src/kpop-models.js',
  'src/app.js',
  'data/network.js',
  'data/korea.js',
  'data/national-rail.js',
  'data/kpop.js',
  'data/train-density-profile.js',
  'data/train-density-profile.json',
  'LICENSE',
  'LICENSE-DATA.md',
];

function usage() {
  throw new Error('Usage: node scripts/stage-subway.mjs --out <built-site-directory>');
}

if (process.argv.length !== 4 || process.argv[2] !== '--out' || !process.argv[3]) usage();
const outRoot = resolve(process.argv[3]);
const publicDir = join(root, 'public');
const relativeToPublic = relative(publicDir, outRoot);
const inPublic = relativeToPublic === '' || (
  relativeToPublic !== '..' &&
  !relativeToPublic.startsWith(`..${sep}`) &&
  !isAbsolute(relativeToPublic)
);
if (inPublic) throw new Error('Stage into a built-site directory, never public/.');
const destination = join(outRoot, 'miniprj', 'seoul-subway');
try {
  await stat(destination);
  throw new Error(`Destination already exists: ${destination}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

for (const file of files) {
  const target = join(destination, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(source, file), target);
}
console.log(`Staged ${files.length} subway assets in ${destination}`);
