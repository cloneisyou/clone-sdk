import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { disclosureIssues } from '../../scripts/lib/public-boundary.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const run = (script, cwd) => execFileSync(process.execPath, [script], { cwd, stdio: 'pipe' });

test('disclosure checks reject unintended paths, binary content and credentials without echoing values', () => {
  for (const path of ['docs/.env', 'docs/customer.csv', 'dist/index.js.map', 'notes.md', 'src/../private.ts']) {
    assert.ok(disclosureIssues(path, Buffer.from('fixture'), { distribution: true }).length, path);
  }
  assert.ok(disclosureIssues('src/index.ts', Buffer.from([0, 1, 2])).length);
  for (const prefix of ['clnp_', 'sk-', 'ghp_']) {
    const credential = prefix + 'synthetic'.repeat(5);
    const issues = disclosureIssues('src/index.ts', Buffer.from(credential));
    assert.equal(issues.length, 1);
    assert.ok(!issues.join('\n').includes(credential));
  }
  assert.deepEqual(disclosureIssues('docs/start.md', Buffer.from('Use a server-side app key.')), []);
  assert.deepEqual(disclosureIssues('dist/generated/api-types.d.ts', Buffer.from('export {};'), { distribution: true }), []);
});

test('clean build removes deleted-module outputs and package inventory rejects unexpected files', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'clone-publication-test-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await cp(join(root, 'scripts'), join(fixture, 'scripts'), { recursive: true });
  await symlink(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir');
  await mkdir(join(fixture, 'src'));
  await mkdir(join(fixture, 'dist'));
  await writeFile(join(fixture, 'dist/removed.js'), 'old output');
  await writeFile(join(fixture, 'dist/notes.txt'), 'local fixture');
  await writeFile(join(fixture, 'src/index.ts'), 'export const fixture = true;\n');
  await writeFile(join(fixture, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
    declaration: true, outDir: 'dist', rootDir: 'src', skipLibCheck: true,
  }, include: ['src'] }));
  await writeFile(join(fixture, 'package.json'), JSON.stringify({
    name: 'clone-publication-fixture', version: '0.0.0', type: 'module',
    files: ['dist', 'docs', 'release-manifest.json'],
    peerDependencies: { '@assistant-ui/react': '0.15.21' },
  }));
  run('scripts/build.mjs', fixture);
  assert.deepEqual((await readdir(join(fixture, 'dist'))).sort(), ['index.d.ts', 'index.js']);

  run('scripts/release-manifest.mjs', fixture);
  const manifest = JSON.parse(await readFile(join(fixture, 'release-manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.sha256).sort(), ['dist/index.d.ts', 'dist/index.js']);

  await mkdir(join(fixture, 'docs'));
  await writeFile(join(fixture, 'docs/customer.csv'), 'synthetic fixture');
  assert.throws(() => run('scripts/release-manifest.mjs', fixture), error => {
    assert.match(error.stderr.toString(), /docs\/customer\.csv: unexpected public file/);
    return true;
  });
});
