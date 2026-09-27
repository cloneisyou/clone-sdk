import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { disclosureIssues } from './lib/public-boundary.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
// Inspect npm's actual selection so the manifest cannot drift from package.files.
// --ignore-scripts avoids recursively invoking prepack.
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
  cwd: root, encoding: 'utf8',
}));
const sha256 = {};
for (const { path } of packed.files) {
  const full = resolve(root, path);
  if (!(await lstat(full)).isFile()) throw new Error(`${path}: only regular package files are allowed`);
  const bytes = await readFile(full);
  const issues = disclosureIssues(path, bytes, { distribution: true });
  if (issues.length) throw new Error(issues.join('\n'));
  // npm may normalize package.json. The external archive checksum covers it
  // and the manifest itself; every other installed file is hashed here.
  if (path !== 'package.json' && path !== 'release-manifest.json') {
    sha256[path] = createHash('sha256').update(bytes).digest('hex');
  }
}
const manifest = {
  version: pkg.version, channel: 'preview',
  assistantUiVersion: pkg.peerDependencies['@assistant-ui/react'],
  generatedAt: new Date().toISOString(), sha256,
};
await writeFile(resolve(root, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Manifest:', Object.keys(sha256).length, 'reviewed files');
