import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyRelease } from '../../scripts/verify-release.mjs';

test('release comparison ignores generation time but rejects changed installed bytes', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'clone-release-verification-'));
  const a = resolve(root, 'a'), b = resolve(root, 'b');
  for (const [directory, generatedAt] of [[a, 'earlier'], [b, 'later']]) {
    await mkdir(directory);
    await writeFile(resolve(directory, 'index.js'), 'reviewed');
    await writeFile(resolve(directory, 'package.json'), JSON.stringify({ version: '0.5.0' }));
    await writeFile(resolve(directory, 'release-manifest.json'), JSON.stringify({ version: '0.5.0', generatedAt,
      sha256: { 'index.js': createHash('sha256').update('reviewed').digest('hex') } }));
  }
  await verifyRelease(a, b);
  await writeFile(resolve(b, 'index.js'), 'unexpected');
  await assert.rejects(() => verifyRelease(a, b), /Manifest mismatch/);
});
