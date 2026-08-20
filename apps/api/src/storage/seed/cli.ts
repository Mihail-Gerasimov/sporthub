// Обвязка запуска сидов из командной строки.
//
// Одна на оба сценария — перенос из файлов и сид для разработки, — потому что
// отличаются они ровно источником данных. Всё остальное совпадает: прочитать
// настройки, открыть соединение, выполнить, напечатать отчёт, закрыть соединение
// даже если по дороге упало.
//
// Модуль лежит в исходниках, а не рядом с запускающим файлом, ровно затем, чтобы
// его проверял компилятор вместе со всем остальным кодом бэкенда.

import path from 'node:path';

import { PrismaService, readDatabaseSettings } from '../prisma.service';
import { resolveDataDirectory } from '../resolve-data-directory';
import { seedDevData } from './dev-seed';
import { formatImportReport, importSourceData } from './import-from-files';
import { readSourceData } from './source-data';

/** Что именно запускаем. */
export type SeedMode = 'import-from-files' | 'dev';

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
    if (mode === 'dev') {
      console.log('СИД ДЛЯ РАЗРАБОТКИ');
      console.log(`База: ${settings.schema}\n`);

      const report = await seedDevData({ client: service.client });

      console.log(formatImportReport(report, { title: 'ЗАПИСАНО', prepared: 'в наборе' }));
      console.log(
        '\nВойти можно любой из учётных записей: admin@ / owner@ / trainer@ / athlete@sporthub.local',
      );
    } else {
      const dataDirectory = resolveDataDirectory();

      console.log('ПЕРЕНОС ДАННЫХ ИЗ ФАЙЛОВ В БАЗУ');
      console.log(`Источник: ${dataDirectory}`);
      console.log(`База: ${settings.schema}\n`);

      const source = await readSourceData(dataDirectory);
      const report = await importSourceData({
        client: service.client,
        source,
        // Чистка мусорных текстов включается только здесь: её словарь привязан
        // к номерам записей именно этих файлов.
        repairTexts: true,
      });

      console.log(formatImportReport(report));
    }

    return 0;
  } catch (error) {
    console.error('\nПеренос не выполнен. Ничего не записано: вся вставка идёт одной транзакцией.');
    console.error(error instanceof Error ? error.message : String(error));

    return 1;
  } finally {
    // Соединения закрываются в любом случае: незакрытый пул держит процесс живым,
    // и скрипт «завис бы» уже после того, как всю работу сделал.
    await service.onModuleDestroy();
  }
}
