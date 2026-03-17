import { cp, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

export async function createIsolatedDataDirectory(): Promise<string> {
  const sourceDirectory = path.join(process.cwd(), 'src', 'data');
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-data-'));

  await cp(sourceDirectory, temporaryDirectory, {
    recursive: true,
  });

  return temporaryDirectory;
}

export async function removeIsolatedDataDirectory(directoryPath: string): Promise<void> {
  await rm(directoryPath, {
    force: true,
    recursive: true,
  });
}
