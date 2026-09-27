import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import { disclosureIssues } from './lib/public-boundary.mjs';

// Supplements, but does not replace, a secret scanner and human disclosure review.
const paths = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' }).split('\0').filter(Boolean))];
const deleted = new Set(execFileSync('git', ['ls-files', '-z', '--deleted'],
  { encoding: 'utf8' }).split('\0'));
const failures = [];
for (const path of paths) {
  if (deleted.has(path)) continue;
  const stat = await lstat(path);
  if (!stat.isFile()) {
    failures.push(`${path}: only regular files are allowed`);
    continue;
  }
  failures.push(...disclosureIssues(path, await readFile(path)));
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Public-boundary checks passed for ${paths.filter(path => !deleted.has(path)).length} files.`);
