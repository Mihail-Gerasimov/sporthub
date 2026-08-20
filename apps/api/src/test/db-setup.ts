// Подготовка тестовой базы перед прогоном файла с проверками на базе.
//
// Миграции накатываются один раз на схему исполнителя. Отдельный файл нужен,
// чтобы обычные тесты, базы не касающиеся, не платили за подключение к ней.

import { migrateTestSchema } from './db-harness';

let migrated: Promise<void> | null = null;

/** Схема готова. Повторный вызов внутри одного процесса ничего не делает. */
export function ensureTestSchema(): Promise<void> {
  migrated ??= migrateTestSchema();

  return migrated;
}
