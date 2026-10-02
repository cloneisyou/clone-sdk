import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [destination, tarball] = process.argv.slice(2);
if (!destination || !tarball) throw new Error('Usage: node create-example.mjs /new/empty/directory /sdk.tgz');
const target = resolve(destination);
await mkdir(target); // Refuse to overwrite an existing project.
const files = ['scripts/pilot-metrics.mjs', 'examples/react/demo.tsx', 'examples/react/mode-demo.tsx', 'examples/react/composer-events.ts', 'examples/react/pilot-observations.ts', 'examples/react/index.html', 'examples/react/vite.config.ts', 'playwright.config.ts',
  'tests/browser/composer.spec.ts', 'tests/browser/clone-mode.spec.ts', 'tests/browser/clone-mode-options.tsx'];
for (const file of files) {
  let text = await readFile(resolve(root, file), 'utf8');
  for (const [from, to] of Object.entries({
    '../../src/react.js': '@clone-ai/prompt-prediction/react', '../../src/assistant-ui.js': '@clone-ai/prompt-prediction/assistant-ui',
    '../../src/transport.js': '@clone-ai/prompt-prediction', '../../src/types.js': '@clone-ai/prompt-prediction',
    '../../src/feedback.js': '@clone-ai/prompt-prediction',
    '../../src/server.js': '@clone-ai/prompt-prediction/server',
  })) text = text.replaceAll(from, to);
  await mkdir(dirname(resolve(target, file)), { recursive: true });
  await writeFile(resolve(target, file), text);
}
await writeFile(resolve(target, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
  target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx',
  strict: true, noEmit: true, skipLibCheck: true, lib: ['DOM', 'ES2022'],
}, include: ['examples'] }, null, 2));
await writeFile(resolve(target, 'package.json'), JSON.stringify({ name: 'clone-tab-integration-example', private: true, type: 'module',
  scripts: { dev: 'vite --config examples/react/vite.config.ts', build: 'tsc && vite build --config examples/react/vite.config.ts', test: 'playwright test' },
  dependencies: { '@clone-ai/prompt-prediction': 'file:' + resolve(tarball), '@assistant-ui/react': '0.15.21', react: '19.2.4', 'react-dom': '19.2.4' },
  devDependencies: { vite: '8.0.16', typescript: '5.9.3', '@playwright/test': '1.60.0', '@types/node': '24.12.2', '@types/react': '19.2.14', '@types/react-dom': '19.2.3' },
}, null, 2));
console.log('Created independent example at', target);
