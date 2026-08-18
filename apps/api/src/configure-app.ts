// Общая настройка приложения.
//
// Живёт отдельно от точки входа, чтобы тесты поднимали приложение ровно в той
// же настройке, что и рабочий сервер: иначе тест проверял бы адреса, которых
// в бою не существует.

import type { INestApplication } from '@nestjs/common';

/**
 * Общий префикс адресов. Совпадает с прежними адресами фронта (`/api/...`),
 * поэтому клиентский код после переезда не меняется — запросы просто уходят
 * на другой процесс.
 */
export const API_PREFIX = 'api';

export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX);

  return app;
}
