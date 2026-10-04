import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const workflow = await readFile(new URL('../../.github/workflows/publish.yml', import.meta.url), 'utf8');
const loops = {
  npm: workflow.match(/          for signature_attempt in \{1\.\.20\}; do\n[\s\S]*?          done/)[0],
  python: workflow.match(/          for pypi_attempt in \{1\.\.20\}; do\n[\s\S]*?          done/)[0],
};

async function verify(t, code, failures, tool = 'npm') {
  const directory = await mkdtemp(join(tmpdir(), 'clone-provenance-wait-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, tool), `#!/bin/bash
count=0
[[ ! -f "$RUNNER_TEMP/count" ]] || read -r count < "$RUNNER_TEMP/count"
count=$((count + 1))
printf '%s' "$count" > "$RUNNER_TEMP/count"
if [[ "$count" -le "$PROBE_FAILURES" ]]; then
  if [[ "$PROBE_TOOL" == python && "$PROBE_CODE" == E404 ]]; then exit 3; fi
  printf '{"error":{"code":"%s"}}' "$PROBE_CODE"
  exit 1
fi
printf '{"verified":1}'
`, { mode: 0o700 });
  await writeFile(join(directory, 'sleep'), '#!/bin/bash\nexit 0\n', { mode: 0o700 });
  const loop = loops[tool].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const result = spawnSync('bash', ['-euc', loop], { encoding: 'utf8',
    env: { ...process.env, RUNNER_TEMP: directory,
      PATH: directory + ':' + dirname(process.execPath) + ':' + process.env.PATH,
      PROBE_CODE: code, PROBE_FAILURES: String(failures), PROBE_TOOL: tool, version: '0.2.1' } });
  return { ...result, attempts: Number(await readFile(join(directory, 'count'), 'utf8')) };
}

test('provenance verification recovers from registry E404 without republishing', async t => {
  const result = await verify(t, 'E404', 1);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.attempts, 2);
  assert.match(result.stdout, /verified/);
});

test('an invalid signature fails immediately', async t => {
  const result = await verify(t, 'EINTEGRITY', 1);
  assert.equal(result.status, 1);
  assert.equal(result.attempts, 1);
});

test('a persistently unavailable attestation fails at the bound', async t => {
  const result = await verify(t, 'E404', 100);
  assert.equal(result.status, 1);
  assert.equal(result.attempts, 20);
});

test('PyPI verification waits for the uploaded version to reach the index', async t => {
  const result = await verify(t, 'E404', 1, 'python');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.attempts, 2);
});

test('PyPI verification does not retry an integrity failure', async t => {
  const result = await verify(t, 'EINTEGRITY', 1, 'python');
  assert.equal(result.status, 1);
  assert.equal(result.attempts, 1);
});

test('a persistently unavailable PyPI version fails at the bound', async t => {
  const result = await verify(t, 'E404', 100, 'python');
  assert.equal(result.status, 1);
  assert.equal(result.attempts, 20);
});
