import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

// Rebuilt archives have a different generatedAt. Compare and verify all
// installed bytes plus package metadata, excluding only that timestamp.
export async function verifyRelease(tested, released) {
  async function inventory(root) {
    const manifest = JSON.parse(await readFile(resolve(root, 'release-manifest.json'), 'utf8'));
    const { generatedAt: _generatedAt, ...stable } = manifest;
    const files = {};
    async function walk(directory) {
      for (const entry of await readdir(directory)) {
        const file = resolve(directory, entry);
        const info = await lstat(file);
        if (info.isDirectory()) { await walk(file); continue; }
        if (!info.isFile()) throw new Error('Non-regular release file');
        const name = relative(root, file);
        if (name === 'release-manifest.json') continue;
        const bytes = await readFile(file);
        if (name === 'package.json') {
          files[name] = JSON.parse(bytes.toString('utf8'));
        } else {
          files[name] = createHash('sha256').update(bytes).digest('hex');
          if (manifest.sha256[name] !== files[name]) throw new Error(`Manifest mismatch: ${name}`);
        }
      }
    }
    await walk(root);
    for (const name of Object.keys(manifest.sha256)) {
      if (!files[name]) throw new Error(`Missing release file: ${name}`);
    }
    return { stable, files };
  }
  if (!isDeepStrictEqual(await inventory(resolve(tested)), await inventory(resolve(released)))) {
    throw new Error('Released package differs from tested package');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [tested, released] = process.argv.slice(2);
  if (!tested || !released) throw new Error('Usage: verify-release.mjs tested/package released/package');
  await verifyRelease(tested, released);
  console.log('Release content matches tested package');
}
