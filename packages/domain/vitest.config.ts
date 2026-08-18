import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Тот же потолок воркеров, что и в остальных пакетах: три прогона
    // в монорепо не должны в сумме поднять два десятка процессов Node.
    pool: 'forks',
    maxWorkers: 2,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
