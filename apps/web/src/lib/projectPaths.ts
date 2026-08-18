import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Phase 32: поддерживаем две раскладки одновременно.
//   `src/data`  — старая, одиночный репозиторий (до переезда в монорепо);
//   `data`      — новая, каталог поднят в корень репозитория, чтобы перезаливка
//                 кода на прод не задевала боевые публикации и записи клиентов.
// Порядок в массиве задаёт приоритет: новая раскладка выигрывает, если обе есть.
const DATA_DIRECTORY_CANDIDATES = [['data'], ['src', 'data']] as const;

/** Каталог данных внутри указанного корня, либо null, если ни одной раскладки нет. */
function findDataDirectory(directoryPath: string): string | null {
  for (const segments of DATA_DIRECTORY_CANDIDATES) {
    const candidate = path.join(directoryPath, ...segments);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isProjectRoot(directoryPath: string): boolean {
  return (
    existsSync(path.join(directoryPath, 'package.json')) &&
    findDataDirectory(directoryPath) !== null
  );
}

function findProjectRoot(startDirectory: string): string | null {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    if (isProjectRoot(currentDirectory)) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

export function getProjectRoot(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidateDirectories = [
    process.env.SPORT_HUB_PROJECT_ROOT?.trim(),
    process.cwd(),
    moduleDirectory,
  ].filter((directoryPath): directoryPath is string => Boolean(directoryPath));

  for (const candidateDirectory of candidateDirectories) {
    const projectRoot = findProjectRoot(candidateDirectory);

    if (projectRoot) {
      return projectRoot;
    }
  }

  throw new Error('Не удалось определить корень проекта SportHub.');
}

export function getProjectDataDirectory(): string {
  const projectRoot = getProjectRoot();
  const dataDirectory = findDataDirectory(projectRoot);

  // getProjectRoot() возвращает только каталог, прошедший isProjectRoot(),
  // а тот уже требует наличия каталога данных — до null здесь дойти нельзя.
  // Ветка оставлена ради явного сообщения, если инварианты разойдутся.
  if (!dataDirectory) {
    throw new Error(`Каталог данных не найден в корне проекта: ${projectRoot}`);
  }

  return dataDirectory;
}
