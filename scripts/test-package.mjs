import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const artifacts = resolve(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
function run(command, args, cwd = root) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env });
}
run('npm', ['pack', '--pack-destination', artifacts]);
const filename = `clone-ai-prompt-prediction-${pkg.version}.tgz`;
const tarball = resolve(artifacts, filename);
const checksum = createHash('sha256').update(await readFile(tarball)).digest('hex');
await writeFile(tarball + '.sha256', `${checksum}  ${filename}\n`);
const temporary = await mkdtemp(resolve(tmpdir(), 'clone-sdk-package-'));
run('tar', ['-xzf', tarball, '-C', temporary]);
const unpacked = resolve(temporary, 'package');
const manifest = JSON.parse(await readFile(resolve(unpacked, 'release-manifest.json'), 'utf8'));
if (manifest.version !== pkg.version) throw new Error('Release manifest version mismatch');
const unpackedPkg = JSON.parse(await readFile(resolve(unpacked, 'package.json'), 'utf8'));
if (unpackedPkg.license !== 'MIT' || unpackedPkg.version !== pkg.version) throw new Error('Package metadata mismatch');
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) { await inspect(path); continue; }
    const name = relative(unpacked, path);
    if (name === 'package.json' || name === 'release-manifest.json') continue;
    const expected = manifest.sha256[name];
    const actual = createHash('sha256').update(await readFile(path)).digest('hex');
    if (!expected || actual !== expected) throw new Error(`Unreviewed or mismatched package file: ${name}`);
  }
}
await inspect(unpacked);
for (const [name, expected] of Object.entries(manifest.sha256)) {
  const actual = createHash('sha256').update(await readFile(resolve(unpacked, name))).digest('hex');
  if (actual !== expected) throw new Error(`Missing or mismatched manifest file: ${name}`);
}
for (const react of ['19', '18']) {
  const consumer = resolve(temporary, `react-${react}`);
  run('node', [resolve(unpacked, 'scripts/create-example.mjs'), consumer, tarball]);
  if (react === '18') run('npm', ['pkg', 'set', 'dependencies.react=18.3.1', 'dependencies.react-dom=18.3.1',
    'devDependencies.@types/react=18.3.31', 'devDependencies.@types/react-dom=18.3.7'], consumer);
  run('npm', ['install', '--ignore-scripts'], consumer);
  run('npm', ['audit', '--audit-level=high'], consumer);
  run('npm', ['run', 'build'], consumer);
  run('npm', ['test'], consumer);
}
console.log(`Verified ${filename}: ${checksum}`);
