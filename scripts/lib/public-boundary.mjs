const rootFiles = new Set([
  '.gitignore', '.gitleaks.toml', '.npmrc', 'package.json', 'pnpm-lock.yaml',
  'README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md',
  'openapi.json', 'tsconfig.json', 'tsconfig.test.json', 'vitest.config.ts', 'playwright.config.ts',
]);

const contentPatterns = [
  /CLONE_[A-Z0-9_]*TEST[A-Z0-9_]*KEY/,
  /\/(?:Users|home)\/[^\s"'<>]+/,
  /(?:sk-[a-zA-Z0-9_-]{24,}|gh[pousr]_[a-zA-Z0-9]{20,})/,
  /clnp_[a-zA-Z0-9_-]{24,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /https?:\/\/[^\s/]+\.(?:internal|local)(?:\/|\b)/,
];

/** Return locations only: never print potentially sensitive matching content. */
export function disclosureIssues(path, bytes, { distribution = false } = {}) {
  const sourcePath = rootFiles.has(path)
    || /^\.github\/(?:workflows\/[^/]+\.ya?ml|CODEOWNERS|dependabot\.yml)$/.test(path)
    || /^docs\/[\w/.-]+\.md$/.test(path)
    || /^(?:src|examples|tests)\/[\w/.-]+\.(?:ts|tsx|mjs|html)$/.test(path)
    || /^scripts\/[\w/.-]+\.mjs$/.test(path);
  const pythonPath = /^python\/(?:pyproject\.toml|uv\.lock|README\.md|LICENSE|src\/clone_sdk\/(?:[\w]+\.py|py\.typed)|tests\/[\w]+\.py)$/.test(path);
  const outputPath = distribution && (/^dist\/[\w/.-]+\.(?:js|d\.ts)$/.test(path)
    || path === 'release-manifest.json');
  if (path.split('/').includes('..') || (!sourcePath && !outputPath && !pythonPath)) {
    return [`${path}: unexpected public file`];
  }
  if (bytes.includes(0)) return [`${path}: binary content requires review`];
  const issues = [];
  bytes.toString('utf8').split('\n').forEach((line, index) => {
    if (contentPatterns.some(pattern => pattern.test(line))) {
      issues.push(`${path}:${index + 1}: disclosure check`);
    }
  });
  return issues;
}
