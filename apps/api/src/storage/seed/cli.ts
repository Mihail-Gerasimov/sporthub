// Обвязка запуска сида из командной строки.
//
// Прочитать настройки, открыть соединение, выполнить, напечатать отчёт, закрыть
// соединение даже если по дороге упало.
//
// Раньше сценариев было два: перенос данных из `data/*.json` и сид для разработки.
// Перенос удалён в фазе 34 вместе с файловым хранилищем — источника больше нет,
// данные живут в базе, а для чистой установки есть сид.
//
// Модуль лежит в исходниках, а не рядом с запускающим файлом, ровно затем, чтобы
// его проверял компилятор вместе со всем остальным кодом бэкенда.

import path from 'node:path';

import { PrismaService, readDatabaseSettings } from '../prisma.service';
import { seedDevData, seedReferenceData } from './dev-seed';
import { formatImportReport, importSourceData } from './import-from-files';

/** Демонстрационный набор для разработки или безопасные справочники для продакшена. */
export type SeedMode = 'dev' | 'reference';

/**
 * Подхватить `apps/api/.env`.
 *
 * Приложение читает его при запуске само, а скрипт запускается напрямую.
 * Отсутствие файла ошибкой не считается: в контейнере переменные приходят
 * из окружения, и падать на этом нельзя.
 */
function loadEnvironment(): void {
  try {
    process.loadEnvFile(path.join(__dirname, '..', '..', '..', '.env'));
  } catch {
    // Файла нет — работаем на том, что уже в окружении.
  }
}

/** Запустить выбранный сид и напечатать отчёт. Возвращает код завершения процесса. */
export async function runSeedCli(mode: SeedMode): Promise<number> {
  loadEnvironment();

  const settings = readDatabaseSettings();
  const service = new PrismaService(settings);

  try {
    console.log(mode === 'reference' ? 'СПРАВОЧНИКИ ДЛЯ БОЕВОЙ БАЗЫ' : 'СИД ДЛЯ РАЗРАБОТКИ');
    console.log(`База: ${settings.schema}\n`);

    const report =
      mode === 'reference'
        ? await seedReferenceData({ client: service.client })
        : await seedDevData({ client: service.client });

    console.log(formatImportReport(report, { title: 'ЗАПИСАНО', prepared: 'в наборе' }));
    if (mode === 'dev') {
      console.log(
        '\nВойти можно любой из учётных записей: admin@ / owner@ / trainer@ / athlete@sporthub.local',
      );
    }

    return 0;
  } catch (error) {
    console.error('\nСид не выполнен. Ничего не записано: вся вставка идёт одной транзакцией.');
    console.error(error instanceof Error ? error.message : String(error));

    return 1;
  } finally {
    // Соединения закрываются в любом случае: незакрытый пул держит процесс живым,
    // и скрипт «завис бы» уже после того, как всю работу сделал.
    await service.onModuleDestroy();
  }
}
