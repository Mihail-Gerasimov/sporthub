import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const allowedCommands = new Set(['build', 'dev', 'start']);
const [command, ...extraArgs] = process.argv.slice(2);

if (!command || !allowedCommands.has(command)) {
  console.error('Использование: node scripts/run-next.mjs <dev|build|start>');
  process.exit(1);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
// webRoot — корень Next-приложения: тут next.config.ts, src/app, package.json.
const webRoot = path.resolve(scriptDirectory, '..');
// monorepoRoot — корень монорепозитория, на два уровня выше: тут лежит data/.
// До Phase 32 это была одна и та же директория, теперь их две.
const monorepoRoot = path.resolve(webRoot, '..', '..');
// require.resolve вместо ручной склейки пути: в npm workspaces next может лежать
// и в общем node_modules корня (хойстинг), и в apps/web/node_modules — Node найдёт сам.
const require = createRequire(import.meta.url);
const nextCliPath = require.resolve('next/dist/bin/next', { paths: [webRoot] });

if (process.cwd() !== webRoot) {
  console.warn(`SportHub: запуск Next перенаправлен в корень проекта ${webRoot}.`);
}

const child = spawn(process.execPath, [nextCliPath, command, webRoot, ...extraArgs], {
  cwd: webRoot,
  env: {
    ...process.env,
    SPORT_HUB_PROJECT_ROOT: monorepoRoot,
  },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
