import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function isProjectRoot(directoryPath: string): boolean {
  return (
    existsSync(path.join(directoryPath, 'package.json')) &&
    existsSync(path.join(directoryPath, 'src', 'data'))
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
  return path.join(getProjectRoot(), 'src', 'data');
}
