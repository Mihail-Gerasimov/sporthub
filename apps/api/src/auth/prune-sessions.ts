// Уборка просроченных сессий.
//
// Отдельная команда, а не работа внутри проверки сессии. Чистить на чужом запросе —
// значит заставлять случайного пользователя платить за уборку чужих строк, причём
// ровно в тот момент, когда он ждёт ответа. К тому же удаление на горячем пути
// конкурирует с чтением по тому же индексу.
//
// Отозванные строки НЕ удаляются вместе с просроченными: пока срок не вышел, отозванная
// сессия — это след, по которому разбирают инцидент. Она уйдёт своим чередом,
// когда истечёт `expiresAt`.

import path from 'node:path';

import { PrismaService, readDatabaseSettings } from '../storage/prisma.service';

/**
 * Подхватить `apps/api/.env`: приложение читает его при запуске само, а команда
 * запускается напрямую. Отсутствие файла ошибкой не считается — в контейнере
 * переменные приходят из окружения.
 */
function loadEnvironment(): void {
  try {
    process.loadEnvFile(path.join(__dirname, '..', '..', '.env'));
  } catch {
    // Файла нет — работаем на том, что уже в окружении.
  }
}

/** Убрать просроченные сессии. Возвращает код завершения процесса. */
export async function pruneSessions(now: Date = new Date()): Promise<number> {
  loadEnvironment();

  let service: PrismaService | null = null;

  try {
    // Настройки читаются ВНУТРИ try: без строки подключения команда обязана
    // сказать это внятно, а не упасть стеком мимо обработчика.
    const settings = readDatabaseSettings();

    service = new PrismaService(settings);

    const removed = await service.client.session.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    console.log(`УБОРКА СЕССИЙ\nБаза: ${settings.schema}\nУдалено просроченных: ${removed.count}`);

    return 0;
  } catch (error) {
    console.error('Уборка не выполнена.');
    console.error(error instanceof Error ? error.message : String(error));

    return 1;
  } finally {
    if (service !== null) await service.onModuleDestroy();
  }
}
