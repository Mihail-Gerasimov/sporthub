import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Порядок важен: подмены разбираются сверху вниз, и общий '@' перехватил бы
    // более точные записи, если бы стоял первым.
    alias: [
      {
        // Страницы ходят за данными на бэкенд по HTTP. В тестах поднимать его
        // незачем: подменяем клиент файловой реализацией с тем же набором
        // функций. Транспорт проверяется тестами бэкенда и снимком контрактов.
        find: '@/lib/server-api',
        replacement: path.resolve(__dirname, 'src/test/mocks/server-api.ts'),
      },
      {
        find: 'server-only',
        replacement: path.resolve(__dirname, 'src/test/mocks/server-only.ts'),
      },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  test: {
    // Потолок воркеров. Без него vitest на 12 ядрах поднимает 11 форков
    // (по формуле cpus-1), а после разделения на два пакета прогонов станет
    // два — до 22 процессов Node одновременно.
    // ВАЖНО: в Vitest 4 `test.poolOptions` УДАЛЁН, опции подняты на верхний
    // уровень. Синтаксис v3 (`poolOptions.forks.maxForks`) не роняет запуск,
    // а молча игнорируется с deprecation-предупреждением — то есть потолка
    // фактически нет. Проверять надо отсутствием предупреждения в выводе.
    pool: 'forks',
    maxWorkers: 3,
    environment: 'jsdom',
    include: ['src/test/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
