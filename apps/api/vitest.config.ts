import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    // Vitest 4: опции пула на верхнем уровне, poolOptions удалён (см. apps/web).
    pool: 'forks',
    maxWorkers: 2,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Часовой пояс прогона — пояс площадки (DEFAULT_TIME_ZONE = Europe/Samara). Тесты записей
    // строят моменты строками без пояса (`new Date('…T05:00:00')`) — это ЛОКАЛЬНОЕ время
    // процесса, а окна отметки и автоотмены считаются в поясе зала. На машине разработчика
    // (+04) оба совпадали, на сервере CI (UTC) три теста расходились на четыре часа.
    // Пояс приколот здесь, а не в CI: прогон должен быть одинаков на любой машине.
    env: { TZ: 'Europe/Samara' },
  },
});
