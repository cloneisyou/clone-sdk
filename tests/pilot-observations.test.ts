import { it, expect } from 'vitest';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPilotRecorder } from '../examples/react/pilot-observations.js';

it('stores whitelisted measurements with private, consistent request hashes', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'clone-pilot-')), 'observations.ndjson');
  const record = createPilotRecorder(file, 'fixture', 'test-pilot');
  const body = { request_id: 'private-request', session_id: 'private-user-session', observed_at: Date.now(),
    draft: 'private text', api_key: 'private credential', source: 'live' };
  record({ ...body, kind: 'accepted' });
  record({ ...body, kind: 'submitted', delivery: 'recorded' });
  await expect.poll(async () => (await readFile(file, 'utf8')).trim().split('\n').length).toBe(2);
  const content = await readFile(file, 'utf8');
  const rows = content.trim().split('\n').map(line => JSON.parse(line));
  expect(content).not.toContain('private');
  expect(rows[0].request_id).toBe(rows[1].request_id);
  expect(rows[0].pilot).toBe('test-pilot');
  expect((await stat(file)).mode & 0o777).toBe(0o600);
});
