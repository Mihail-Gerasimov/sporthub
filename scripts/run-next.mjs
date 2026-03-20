import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const allowedCommands = new Set(['build', 'dev', 'start']);
const [command, ...extraArgs] = process.argv.slice(2);

if (!command || !allowedCommands.has(command)) {
  console.error('Использование: node scripts/run-next.mjs <dev|build|start>');
  process.exit(1);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const nextCliPath = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

if (process.cwd() !== projectRoot) {
  console.warn(`SportHub: запуск Next перенаправлен в корень проекта ${projectRoot}.`);
}

const child = spawn(process.execPath, [nextCliPath, command, projectRoot, ...extraArgs], {
  cwd: projectRoot,
  env: {
    ...process.env,
    SPORT_HUB_PROJECT_ROOT: projectRoot,
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
